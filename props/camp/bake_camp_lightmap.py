"""
All the camp props' light in one place (Adriaen 2026-11-12: "We don't want to generate shadows and light maps in several
different places"): the picked camp set and the lived-in props (wood pile, seat things, tent side, mat roll, kitchen
crate, the fire set and the laundry line) are baked together, in one scene, into one shared light map.

    blender -b --python props/camp/bake_camp_lightmap.py -- --size 4096 --samples 512
    # on the desktop GPU: blender -b --python <render-jobs>/gpu_run.py -- props/camp/bake_camp_lightmap.py --size 4096
    # no GPU: a small, low-sample check of the light on the CPU, written to apps/canopy-prototype/lmpreview/ (git ignores
    # it) and seen on the page as camp.html?lmdir=lmpreview; it never touches models/ or the props' GLBs
    blender -b --python props/camp/bake_camp_lightmap.py -- --preview

Options: --size (props map, default 4096; 512 with --preview), --samples (512; 8 with --preview), --ground (ground maps,
1024; 256 with --preview), --angle and --margin (the light-map unwrap), --jeep, --unwrap-only (stop after the atlas, no
bake), --preview (the sizes above, on the CPU, into --out), --out DIR (write every output into DIR instead of models/ and
props/; with --preview it defaults to apps/canopy-prototype/lmpreview). The preview's time is an estimate, not measured:
about a minute on a laptop CPU (1/64 of the texels and of the samples of the full bake).

1. read_layout: where the page stands each prop and light, from the "place" block the layout step
   (props/shadow/export_casters.cjs) writes into props/shadow/layout_picked.json; it stops at once if that block is missing.
2. build_lived_sets: runs the build() of props/lived/build_lived.py, build_fire.py and build_laundry.py with flat colours
   (lib.bake.flat_colours), so their vertex colours are plain base colours (no AO of their own), into scratch GLBs.
3. build_scene: builds the picked set (build_camp.py, BUDGET decimate, no densify), imports the scratch GLBs, and stands
   everything where camp.html puts it. The picked set's old Fire is left out: the lived fire set replaces it on the page.
   unwrap gives every prop a second UV map (TEXCOORD_1; TEXCOORD_0 stays the texture's, or a dummy) packed into one atlas.
4. add_occluders and add_ground: the jeep and the deadwood (occluders only) and the real ground disc, so the WHOLE scene is
   baked as one (Adriaen 2026-11-12). add_lights: day = the page's sun (from (-4, 10, 3), 4 degrees wide) + a white sky;
   night = the four CHANNELS, each baked on its own in white: the fire, 8 jar lanterns, the tent stove and a dim blue moon.
5. bake_light, then write_maps writes:
     camp_lm_<k>.png      RGB  night light / 4, sRGB-encoded; the page tones it as 1 - exp(-6.4 x surface colour x light),
                               unlit, at night
                          A    sky occlusion (distance 0.6); the page scales the sky light by 0.32 + 0.68 x AO by day
     camp_lm_sun_<k>.png  where the sun reaches each prop (direct sun over the same with no shadows); the page scales its
                          live sun by it, so the props shade each other and the jeep shades them
     camp_shadow_picked_<jeep>.png        the ground's day shadow, 1 - light / open ground (as ground.js always read it)
     camp_ground_night_picked_<jeep>.png  the ground's night light / 4 (sRGB), with every prop's shadow in it
     camp_lights.json     the channel order, their colours, the encoding and the open ground's day light; no "ktx2" key:
                          every map this step writes has its old .ktx2.txt removed, so the page loads the new PNG until
                          props/bake_all.py's ktx step encodes them again and sets the flag (review R2-005)
   <k> is 4k, 2k and 1k (each size up to --size); a map smaller than 1K (a preview) is written as both _1k and _2k, the
   names the page asks for. Ground images: row 0 = page z -9.8, column 0 = x -9.8 (ground.js, flipY false).
   Thin double-sided cards (laundry, chain) take the brighter of their two sides.
   COLOR_0 alpha 0 marks faces that glow at night (lantern glass, the stove's fire).
6. export_models writes props/camp/camp_picked_lm.glb, props/lived/{lived,fire,laundry}.glb (each object back at its own
   origin, so the page places them as before; SeatTop as SeatTop_0-2, one per seat) with their models/*.txt copies
   (all into --out instead, when given).
A three.js point (x, y, z) is Blender (x, -z, y); yaw about up is the same angle in both.
The run's memory: one props-sized and one ground-sized float image are made once and reused by every bake pass, and each
pass keeps only what is used (the RGB mean, or AO's first channel) as float32 (review R2-224).
"""
import argparse, atexit, base64, json, math, os, shutil, sys, tempfile, time
import bpy
import numpy as np
from mathutils import Vector
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
LIVED = os.path.join(ROOT, "props", "lived")
MODELS = os.path.join(ROOT, "apps", "canopy-prototype", "models")
PREVIEW_OUT = os.path.join(ROOT, "apps", "canopy-prototype", "lmpreview")   # camp.html?lmdir=lmpreview; in .gitignore
GLOW = ("ru_glass", "wt_glow")
THIN = ("LaundryCloth", "Chain")
# the night lights, in the order of the maps' channels (R, G, B, A) and of camp_lights.json "channels", with the colour the
# page gives each (bakedlight.js reads it from camp_lights.json); each is baked in white. The jeep has no baked lights
# (headlights dropped; the cabin light is live on the page, Adriaen 2026-11-12).
CHANNELS = ("fire", "stove", "lanterns", "moon")
COLOUR = {"fire": (1.0, 0.50, 0.20), "stove": (1.0, 0.55, 0.15), "lanterns": (1.0, 0.72, 0.38), "moon": (0.55, 0.65, 1.0)}
# toward the sun, the page's (-4, 10, 3) in Blender axes: kept here because the page's normalised copy differs from this
# one in the last float bit (6e-8), and the bake must stay as it was; read_layout stops if the two ever disagree
SUN_DIR = Vector((-4, -3, 10)).normalized()
# the lanterns sway, so the page draws them and they are not baked; their lights are. The page's light is 0.125 m below
# each lantern's hang point (lanterns.js JAR_Y), the bake's 0.12 m: 5 mm higher (review props-07), kept so the bake
# stays as it was
PAGE_LANTERN_DROP, LANTERN_DROP = 0.125, 0.12
RR = 9.8                                                  # the ground disc's half width (ground.js)

sys.path.insert(0, HERE); sys.path.insert(0, LIVED); sys.path.insert(0, os.path.join(ROOT, "props"))
import build_camp  # noqa: E402
import build_fire  # noqa: E402
import build_laundry  # noqa: E402
import build_lived  # noqa: E402
from lib.bake import flat_colours  # noqa: E402
from lib.export import export_glb, reset, tris  # noqa: E402
from lib.mesh import apply_all  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, help="props light map size (4096; 512 with --preview)")
    ap.add_argument("--samples", type=int, help="Cycles samples (512; 8 with --preview)")
    ap.add_argument("--angle", type=float, default=60)
    ap.add_argument("--margin", type=float, default=6)    # texels between islands at --size
    ap.add_argument("--unwrap-only", action="store_true")
    ap.add_argument("--ground", type=int, help="ground map size (1024; 256 with --preview)")
    ap.add_argument("--jeep", default="expedition")
    ap.add_argument("--preview", action="store_true", help="small and fast on the CPU, into --out (never models/)")
    ap.add_argument("--out", help="write every output here instead of models/ and props/")
    a = ap.parse_args(argv)
    small = a.preview
    a.size = a.size or (512 if small else 4096)
    a.samples = a.samples or (8 if small else 512)
    a.ground = a.ground or (256 if small else 1024)
    a.out = a.out or (PREVIEW_OUT if small else None)
    if a.out:
        os.makedirs(a.out, exist_ok=True)
    return a


def read_layout():
    """layout_picked.json and its "place" block; checked before the minutes of building in build_lived_sets."""
    layout = json.load(open(os.path.join(ROOT, "props", "shadow", "layout_picked.json")))
    pl = layout.get("place") or sys.exit("layout_picked.json has no place block: run props/bake_all.py --only layout first")
    if (SUN_DIR - B(*pl["sun"])).length > 1e-6:
        sys.exit(f"the page's sun {pl['sun']} is not the bake's {tuple(SUN_DIR)}: update SUN_DIR")
    print(f"  layout from layout_picked.json; lantern lights {LANTERN_DROP} m below the hang points (the page: {PAGE_LANTERN_DROP} m)")
    return layout, pl


def flat(objs):
    """The props' own colours for this bake: plain base colours into Col (alpha 0 where it glows), no light of their own."""
    flat_colours(objs, GLOW)


def build_lived_sets(scratch):
    """The lived builders, with flat colours, each in its own fresh scene and written to a scratch GLB that build_scene
    imports. The round trip stays on purpose: the glTF export triangulates every face and splits vertices at hard edges
    and UV seams (WoodPile: 90 faces and 161 vertices as built, 178 triangles and 225 vertices as imported), and the
    light-map unwrap (smart_project, then one pack for all objects) works on those faces, so building the props straight
    into this scene would give every object a different atlas. The scratch folder keeps a failed or --unwrap-only run
    from leaving half-made props/lived/*.glb behind; export_models writes those."""
    build_lived.build(32, colour=flat, path=os.path.join(scratch, "lived.glb"))
    print("  built build_lived (flat colours)")
    build_fire.build(colour=flat, path=os.path.join(scratch, "fire.glb"))
    print("  built build_fire (flat colours)")
    build_laundry.build(colour=flat, path=os.path.join(scratch, "laundry.glb"))
    print("  built build_laundry (flat colours)")


def B(x, y, z):            # three.js -> Blender
    return Vector((x, -z, y))


def place(src, name, x, z, yaw, y=0.0, copy=True):
    o = src
    if copy:
        o = src.copy(); o.data = src.data.copy(); bpy.context.collection.objects.link(o)
    o.name = name; o.location = B(x, y, z); o.rotation_mode = "XYZ"; o.rotation_euler = (0, 0, yaw)
    return o


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def build_scene(pl, scratch):
    """The picked set and the lived sets, each prop where the page stands it ([x, z, yaw] in three.js metres, from pl).
    Returns (picked, sets {set name: meshes}, receivers, counts {name: triangles})."""
    seat_at = [tuple(v) for v in pl["seats"]]
    where = {
        "lived": {"WoodPile": pl["woodPile"], "WoodStack": pl["woodPile"], "LooseLogs": pl["woodPile"], "SeatThings": pl["seatThings"],
                  "TentSide": pl["tentSide"], "MatRoll": pl["tentSide"], "KitchenCrate": pl["kitchen"], "KitchenThings": pl["kitchen"]},
        "fire": {n: (0, 0, 0) for n in ("Ring", "Tripod", "TripodLegs", "Fire", "Embers", "Pot", "Chain")},
        "laundry": {"LaundryPosts": pl["laundry"], "LaundryCloth": pl["laundry"]},
    }
    reset()
    objs = build_camp.picked()
    for name, o in objs.items():
        apply_all(o); o.location = (0, 0, 0)
        n = build_camp.BUDGET["picked"].get(name); t = tris(o)
        if n and t > n:
            bpy.context.view_layer.objects.active = o
            d = o.modifiers.new("lean", "DECIMATE"); d.decimate_type = "COLLAPSE"; d.ratio = n / t; d.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=d.name)
    flat(list(objs.values()))

    picked = [place(objs["Seat"], f"Seat_{i}", x, z, yaw) for i, (x, z, yaw) in enumerate(seat_at)]
    for name, key in (("Tent", "tent"), ("Hammock", "hammock"), ("Table", "table")):
        picked.append(place(objs[name], name, *pl[key], copy=False))
    bpy.data.objects.remove(objs["Seat"]); bpy.data.objects.remove(objs["Lantern"])

    sets, top = {}, None
    for sname, table in where.items():
        new = import_glb(os.path.join(scratch, f"{sname}.glb"))
        for o in new:
            if o.parent:
                mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        meshes = []
        for o in new:
            if o.type != "MESH":
                bpy.data.objects.remove(o); continue
            key = o.name.split(".")[0]; o.name = key
            if key == "SeatTop":                     # one per seat, below
                top = o; continue
            x, z, yaw = table[key]
            place(o, key, x, z, yaw, copy=False)
            if key in THIN or key in ("Fire", "Embers"):
                o.visible_shadow = False             # cards don't shade each other; the flames light from inside the teepee
            me = o.data
            if me.color_attributes and "Col" not in [c.name for c in me.color_attributes]:
                me.color_attributes[0].name = "Col"
            meshes.append(o)
        sets[sname] = meshes
    for i, (x, z, yaw) in enumerate(seat_at):
        sets["lived"].append(place(top, f"SeatTop_{i}", x, z, yaw, copy=i < 2))
    receivers = picked + [o for s in sets.values() for o in s if o.name != "Embers"]
    counts = {o.name: tris(o) for o in picked + [o for s in sets.values() for o in s]}
    return picked, sets, receivers, counts


def unwrap(receivers, a):
    """The atlas: TEXCOORD_0 stays (texture UVs, or a dummy), LM is TEXCOORD_1, packed jointly."""
    for o in receivers:
        uvl = o.data.uv_layers
        while len(uvl) > 1:
            uvl.remove(uvl[1])
        if not len(uvl):
            uvl.new(name="UV0")
        uvl.active = uvl.new(name="LM")
    bpy.ops.object.select_all(action="DESELECT")
    for o in receivers:
        o.select_set(True)
    bpy.context.view_layer.objects.active = receivers[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(a.angle), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, shape_method="CONCAVE", margin_method="ADD", margin=a.margin / a.size)
    bpy.ops.object.mode_set(mode="OBJECT")
    area = 0.0
    for o in receivers:
        uv = o.data.uv_layers["LM"].data
        for poly in o.data.polygons:
            q = [uv[li].uv for li in poly.loop_indices]
            area += abs(sum(q[i].x * q[(i + 1) % len(q)].y - q[(i + 1) % len(q)].x * q[i].y for i in range(len(q)))) / 2
    print(f"  atlas: {len(receivers)} objects, {area * 100:.0f}% of the image covered")


def add_occluders(layout, pl, jeep):
    """The jeep (its parts stand under a root at the page's jeep group) and the deadwood at the clearing edge
    (camp/deadwood.js, seeded, as export_casters.cjs saved it; plain cylinders are enough for their shadows). They cast
    shadows only and are removed before export. Returns their mesh objects."""
    occluders = []
    jroot = bpy.data.objects.new("JeepRoot", None); bpy.context.collection.objects.link(jroot)     # the page's jeep group: every
    jroot.location = B(pl["jeep"][0], 0, pl["jeep"][1]); jroot.rotation_euler = (0, 0, pl["jeep"][2])   # node keeps its own place under it
    for o in import_glb(os.path.join(ROOT, "props", "jeep", f"jeep_{jeep}.glb")):
        if o.type == "MESH" and o.name.startswith("Glass"):
            o.hide_render = True                                                           # see-through on the page
        if not o.parent:
            o.parent = jroot
        if o.type == "MESH":
            occluders.append(o)
    for d in layout["deadwood"]:
        y = d.get("y", 0)                                    # seated on the terrain by the layout step
        if d["name"] == "FallenLog":
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=d["r"], depth=d["L"], location=B(d["x"], y + d["r"], d["z"]), rotation=(0, math.pi / 2, 0))
            o = bpy.context.object; o.rotation_mode = "YXZ"; o.rotation_euler = (0, math.pi / 2, d["yaw"])   # lie along x, then yaw
        elif d["name"] == "Stump":
            bpy.ops.mesh.primitive_cylinder_add(vertices=9, radius=d["r"], depth=d["h"], location=B(d["x"], y + d["h"] / 2, d["z"]))
        elif d["name"] == "DeadTrunk":
            bpy.ops.mesh.primitive_cylinder_add(vertices=7, radius=0.27, depth=d["H"], location=B(d["x"], y + d["H"] / 2, d["z"]))
        else:
            sys.exit(f"layout_picked.json has deadwood named {d['name']!r}, which the bake has no shape for: add it to add_occluders")
        bpy.context.object.name = d["name"]; occluders.append(bpy.context.object)
    return occluders


def add_ground():
    """The real ground disc (a receiver), mapped straight onto the page's floor: image row 0 = page z -RR, column 0 = x -RR,
    as ground.js looks it up with flipY false."""
    bpy.ops.mesh.primitive_plane_add(size=2 * RR, location=(0, 0, 0))
    ground = bpy.context.object; ground.name = "Ground"
    guv = ground.data.uv_layers.active.data
    for poly in ground.data.polygons:
        for li in poly.loop_indices:
            co = ground.data.vertices[ground.data.loops[li].vertex_index].co
            guv[li].uv = (co.x / (2 * RR) + 0.5, co.y / (2 * RR) + 0.5)
    return ground


class Lights:
    """Day = the page's sun (4 degrees wide) and a white sky; night = the CHANNELS, each a group of lights in white (its
    share of light, bounces included), so the page can colour, flicker, dim and mix them live. only(group) lights the
    scene with one group: "day", or one of CHANNELS (the moon's group also has the dim night sky)."""

    def __init__(self, pl, tent):
        self.groups = {g: [] for g in CHANNELS}
        self.point("fire", "FireLight", B(0, 0.55, 0), 260, 0.25)
        for i, (x, y, z) in enumerate(pl["lanternLights"]):          # y + PAGE_LANTERN_DROP: where each lantern hangs
            self.point("lanterns", f"LanternLight_{i}", B(x, y + PAGE_LANTERN_DROP - LANTERN_DROP, z), 50, 0.05)
        bpy.context.view_layer.update()
        self.point("stove", "StoveLight", tent.matrix_world @ (Vector(build_camp.STOVE) + Vector((-0.35, 0, -0.1))), 22, 0.12)
        moon = bpy.data.lights.new("Moon", "SUN"); moon.color = (1, 1, 1); moon.energy = 0.12; moon.angle = math.radians(2)
        mo = bpy.data.objects.new("Moon", moon); mo.rotation_euler = (math.radians(40), 0, math.radians(-120))
        bpy.context.collection.objects.link(mo); self.groups["moon"].append(mo)
        bpy.context.view_layer.update()
        sun = bpy.data.lights.new("Sun", "SUN"); sun.energy = 3.0; sun.angle = math.radians(4)
        so = bpy.data.objects.new("Sun", sun); so.rotation_euler = (-SUN_DIR).to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(so); self.day = [so]
        w = bpy.data.worlds.new("sky"); w.use_nodes = True; bpy.context.scene.world = w
        w.light_settings.distance = 0.6
        self.sky = w.node_tree.nodes["Background"]

    def point(self, group, name, at, watts, r):
        L = bpy.data.lights.new(name, "POINT"); L.color = (1, 1, 1); L.energy = watts; L.shadow_soft_size = r
        o = bpy.data.objects.new(name, L); o.location = at; bpy.context.collection.objects.link(o); self.groups[group].append(o)

    def only(self, group):
        for o in self.day: o.hide_render = group != "day"
        for g, objs in self.groups.items():
            for o in objs: o.hide_render = g != group
        self.sky.inputs["Color"].default_value = (1, 1, 1, 1)
        self.sky.inputs["Strength"].default_value = 1.0 if group == "day" else 0.02 if group == "moon" else 0.0


def setup_render(a):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.samples = a.samples; sc.cycles.use_adaptive_sampling = False
    sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 3
    if a.preview:
        sc.cycles.device = "CPU"
    bk = sc.render.bake
    bk.target = "IMAGE_TEXTURES"; bk.margin = 8; bk.use_clear = True
    bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False
    return bk


def grey(name, c=0.5):
    """A plain stand-in material with an active image node the bake writes into."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (c, c, c, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    n = m.node_tree.nodes.new("ShaderNodeTexImage"); m.node_tree.nodes.active = n
    return m, n


class Target:
    """One float image that every bake pass of one size writes into (use_clear empties it first), and its pixel buffer."""

    def __init__(self, name, size, nodes):
        self.img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
        for n in nodes:
            n.image = self.img
        self.buf = np.empty(size * size * 4, np.float32)

    def bake(self, kind, objs, label, keep="mean"):
        """Bake kind for objs into this image and return what is used: "mean" (the RGB mean), "r" (the first channel) or
        "rgb", as float32 rows (row 0 = the image's bottom, as Blender stores it)."""
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        t = time.time(); bpy.ops.object.bake(type=kind); print(f"  {kind} -> {label}: {time.time() - t:.0f} s")
        self.img.pixels.foreach_get(self.buf)
        px = self.buf.reshape(self.img.size[1], self.img.size[0], 4)
        return {"mean": lambda: px[..., :3].mean(-1), "r": lambda: px[..., 0].copy(), "rgb": lambda: px[..., :3].copy()}[keep]()

    def remove(self):
        bpy.data.images.remove(self.img)


def bake_light(a, receivers, occluders, ground, lights):
    """Every bake pass, through plain stand-ins (grey for props and occluders, one for the thin cards, white for the
    ground); the props get their own materials back afterwards. Returns a dict of float32 maps: ao, sun_direct, sun_open,
    ground_day, and lit / ground_lit {channel: map}."""
    bk = setup_render(a)
    g_all, n_all = grey("bake_grey"); g_thin, n_thin = grey("bake_grey_thin"); g_gnd, n_gnd = grey("bake_ground", 1.0)
    ground.data.materials.append(g_gnd)
    keep = {}
    for o in receivers:
        keep[o.name] = list(o.data.materials)
        if not o.data.materials:
            o.data.materials.append(None)
        for i in range(len(o.data.materials)):
            o.data.materials[i] = g_thin if o.name in THIN else g_all
    for o in occluders:
        if not o.data.materials:
            o.data.materials.append(None)
        for i in range(len(o.data.materials)):
            o.data.materials[i] = g_all
    props = Target("LM_BAKE", a.size, (n_all, n_thin))
    gnd = Target("GROUND_BAKE", a.ground, (n_gnd,))
    thin = [o for o in receivers if o.name in THIN]
    sky = lights.sky.inputs["Strength"]
    out = {"lit": {}, "ground_lit": {}}

    lights.only("day")
    out["ao"] = props.bake("AO", receivers, "AO", keep="r")                     # sky occlusion on the props
    sky.default_value = 0.0; bk.use_pass_indirect = False                      # where the sun reaches each prop: its direct
    out["sun_direct"] = props.bake("DIFFUSE", receivers, "SUN")                # light, over the same with nothing casting shadows
    casts = {o.name: o.visible_shadow for o in receivers + occluders}
    for o in receivers + occluders: o.visible_shadow = False
    out["sun_open"] = props.bake("DIFFUSE", receivers, "SUN_OPEN")
    for o in receivers + occluders: o.visible_shadow = casts[o.name]
    bk.use_pass_indirect = True; sky.default_value = 1.0
    out["ground_day"] = gnd.bake("DIFFUSE", [ground], "GROUND_DAY")           # sun + sky on the ground
    for g in CHANNELS:                                                         # each light's share, props and ground (grey: white light)
        lights.only(g)
        if thin:                                                               # the back of each card; keep the brighter side
            px = props.bake("DIFFUSE", receivers, g.upper(), keep="rgb")
            for o in thin: o.data.flip_normals()
            px = np.maximum(px, props.bake("DIFFUSE", thin, g.upper() + "_BACK", keep="rgb"))
            for o in thin: o.data.flip_normals()
            out["lit"][g] = px.mean(-1)
            del px
        else:
            out["lit"][g] = props.bake("DIFFUSE", receivers, g.upper())
        out["ground_lit"][g] = gnd.bake("DIFFUSE", [ground], "GROUND_" + g.upper())
    props.remove(); gnd.remove()
    for o in receivers:
        for i, m in enumerate(keep[o.name]):
            o.data.materials[i] = m
        if not keep[o.name]:
            o.data.materials.clear()
    return out


def enc(x):                                                                 # light / 4, gamma 2.2: precision in the dark
    return np.power(np.clip(x / 4, 0, 1), 1 / 2.2)


def map_sizes(n):
    """(file label, pixel size) for a props map baked at n: 4k, 2k and 1k up to n; a map under 1K (a preview) goes out
    at its own size under both names the page asks for."""
    if n < 1024:
        return [("1k", n), ("2k", n)]
    return [(f"{s // 1024}k", s) for s in sorted({n, 2048, 1024}, reverse=True) if s <= n]


def drop_ktx(png):
    """A rewritten map's old KTX2 copy is out of date: remove it, so the page loads the new PNG (review R2-005)."""
    k = png[:-4] + ".ktx2.txt"
    if os.path.exists(k):
        os.remove(k); print(f"  removed the old {os.path.basename(k)}")


def save(px, name, out):
    """The props map px (n x n x 4 float32) at each of map_sizes(n), as 8-bit PNG. Each size is filled from px at full
    size and scaled down from there (Image.copy() does not keep a generated image's pixels), then removed."""
    n = px.shape[0]
    for label, size in map_sizes(n):
        img = bpy.data.images.new(f"{name}_{label}", n, n, alpha=True)
        img.colorspace_settings.name = "Non-Color"; img.alpha_mode = "STRAIGHT"
        img.pixels.foreach_set(px.ravel())
        if size != n:
            img.scale(size, size)
        f = os.path.join(out, f"{name}_{label}.png"); img.filepath_raw = f; img.file_format = "PNG"
        img.save(); bpy.data.images.remove(img); drop_ktx(f)
        print(f"  {os.path.basename(f)}: {os.path.getsize(f) // 1024} KB")


def write_maps(m, out, jeep):
    """The props' two maps, the ground's two maps and camp_lights.json, into out."""
    # props map 1: one channel per light; map 2: R = where the sun reaches, G = sky occlusion
    save(np.stack([enc(m["lit"][g]) for g in CHANNELS], -1).astype(np.float32), "camp_lm", out)
    sun_open, sun_direct = m["sun_open"], m["sun_direct"]
    sv = np.where(sun_open > 0.02, np.clip(sun_direct / np.maximum(sun_open, 1e-6), 0, 1), 1.0)   # surfaces facing away: the page's N . L hides them anyway
    print(f"  sun: mean visibility {sv[sun_open > 0.02].mean():.2f}")
    save(np.stack([sv, np.clip(m["ao"], 0, 1), np.zeros_like(sv), np.zeros_like(sv)], -1).astype(np.float32), "camp_lm_sun", out)   # B, A: free (were the jeep's lights)
    # ground: the day shadow (1 - light / open ground, as before) and one channel per light; row 0 = page z -RR
    open_ = np.percentile(m["ground_day"], 99.5)
    shadow = np.clip(1 - m["ground_day"] / open_, 0, 1)[::-1]
    f = os.path.join(out, f"camp_shadow_picked_{jeep}.png")
    Image.fromarray((shadow * 255 + 0.5).astype(np.uint8), "L").save(f, optimize=True); drop_ktx(f)
    gn = (np.stack([enc(m["ground_lit"][g]) for g in CHANNELS], -1)[::-1] * 255 + 0.5).astype(np.uint8)
    f = os.path.join(out, f"camp_ground_night_picked_{jeep}.png")
    Image.fromarray(np.ascontiguousarray(gn), "RGBA").save(f, optimize=True); drop_ktx(f)
    json.dump({"channels": list(CHANNELS), "colour": COLOUR, "encoding": "light / 4, gamma 2.2",
               "ground_open_day": round(float(open_), 4)}, open(os.path.join(out, "camp_lights.json"), "w"), indent=1)
    print(f"  ground: open-ground light {open_:.3f}, shadow mean {shadow.mean():.3f}; "
          + ", ".join(f"{g} max {m['ground_lit'][g].max():.2f}" for g in CHANNELS))


def export_models(picked, sets, out):
    """The picked set at its camp positions, the lived sets each object back at its own origin; the GLBs into props/
    (or out) and their base64 .txt copies into models/ (or out)."""
    def export(objs, path, txt, image_format="AUTO"):
        if out:
            path = os.path.join(out, os.path.basename(path))
        export_glb(objs, path, image_format=image_format)
        with open(path, "rb") as f, open(os.path.join(out or MODELS, txt), "w") as g:
            g.write(base64.b64encode(f.read()).decode())

    export(picked, os.path.join(HERE, "camp_picked_lm.glb"), "camp_picked_lm.txt")
    for sname, meshes in sets.items():
        for o in meshes:
            o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
        export(meshes, os.path.join(LIVED, f"{sname}.glb"), f"{sname}.txt", "JPEG" if sname == "lived" else "AUTO")


def main():
    t0 = time.time()
    a = parse_args()
    layout, pl = read_layout()
    scratch = tempfile.mkdtemp(prefix="camp_lived_")
    atexit.register(shutil.rmtree, scratch, True)      # gone however the run ends (ignore_errors=True)
    build_lived_sets(scratch)
    picked, sets, receivers, counts = build_scene(pl, scratch)
    unwrap(receivers, a)
    if a.unwrap_only:
        sys.exit(0)
    occluders = add_occluders(layout, pl, a.jeep)
    ground = add_ground()
    print(f"  scene: {len(receivers)} props, {len(occluders)} occluders (jeep parts and deadwood), ground {2 * RR} m square")
    lights = Lights(pl, next(o for o in picked if o.name == "Tent"))
    maps = bake_light(a, receivers, occluders, ground, lights)
    for o in occluders:
        bpy.data.objects.remove(o)
    bpy.data.objects.remove(ground)
    write_maps(maps, a.out or MODELS, a.jeep)
    del maps
    export_models(picked, sets, a.out)
    if not a.out:
        print("  the light maps' KTX2 copies are gone until props/bake_all.py --only ktx encodes them again")
    elif os.path.abspath(a.out).startswith(os.path.abspath(os.path.join(ROOT, "apps", "canopy-prototype")) + os.sep):
        print(f"  see it on camp.html?lmdir={os.path.relpath(a.out, os.path.join(ROOT, 'apps', 'canopy-prototype'))}")
    print(f"camp light: {len(counts)} objects, {sum(counts.values())} triangles, {time.time() - t0:.0f} s")


# Blender runs the script with --python as __main__; the GPU wrapper (gpu_run.py, outside the repo) may run it another
# way, so the stages run unless the file was imported as a module to test one of them.
if __name__ != "bake_camp_lightmap":
    main()
