"""
All the camp props' light in one place (Adriaen 2026-11-12: "We don't want to generate shadows and light maps in several
different places"): the picked camp set and the lived-in props (wood pile, seat things, tent side, mat roll, kitchen
crate, the fire set and the laundry line) are baked together, in one scene, into one shared light map.

    blender -b --python props/camp/bake_camp_lightmap.py -- --size 4096 --samples 512
    # on the desktop GPU: blender -b --python <render-jobs>/gpu_run.py -- props/camp/bake_camp_lightmap.py --size 4096

1. Runs the build() of props/lived/build_lived.py, build_fire.py and build_laundry.py with flat colours
   (lib.bake.flat_colours), so their vertex colours are plain base colours (no AO of their own), into scratch GLBs.
2. Builds the picked set (build_camp.py, BUDGET decimate, no densify), imports the scratch GLBs, and stands everything where
   camp.html puts it. The picked set's old Fire is left out: the lived fire set replaces it on the page.
3. Adds the jeep (an occluder) and the real ground disc, so the WHOLE scene is baked as one (Adriaen 2026-11-12), under
   one set of lights: day = the page's sun (from (-4, 10, 3), 4 degrees wide) + a white sky; night = the fire, 8 jar
   lanterns, the tent stove and a dim blue moon. Every prop gets a second UV map (TEXCOORD_1; TEXCOORD_0 stays the
   texture's, or a dummy) packed into one atlas. Written:
     camp_lm_<k>.png      RGB  night light / 4, sRGB-encoded; the page tones it as 1 - exp(-6.4 x surface colour x light),
                               unlit, at night
                          A    sky occlusion (distance 0.6); the page scales the sky light by 0.32 + 0.68 x AO by day
     camp_lm_sun_<k>.png  where the sun reaches each prop (direct sun over the same with no shadows); the page scales its
                          live sun by it, so the props shade each other and the jeep shades them
     camp_shadow_picked_<jeep>.png        the ground's day shadow, 1 - light / open ground (as ground.js always read it)
     camp_ground_night_picked_<jeep>.png  the ground's night light / 4 (sRGB), with every prop's shadow in it
   Ground images: row 0 = page z -9.8, column 0 = x -9.8 (ground.js, flipY false).
   Thin double-sided cards (laundry, chain) take the brighter of their two sides.
   COLOR_0 alpha 0 marks faces that glow at night (lantern glass, the stove's fire).
4. Writes props/camp/camp_picked_lm.glb, props/lived/{lived,fire,laundry}.glb (each object back at its own origin, so
   the page places them as before; SeatTop as SeatTop_0-2, one per seat) with their models/*.txt copies, and
   apps/canopy-prototype/models/camp_lm_<4k|2k|1k>.png.
Where each prop and light stands comes from the page itself: the "place" block the layout step (export_casters.cjs)
writes into props/shadow/layout_picked.json.
A three.js point (x, y, z) is Blender (x, -z, y); yaw about up is the same angle in both.
"""
import argparse, base64, json, math, os, shutil, sys, tempfile, time
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
LIVED = os.path.join(ROOT, "props", "lived")
MODELS = os.path.join(ROOT, "apps", "canopy-prototype", "models")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--size", type=int, default=4096)
ap.add_argument("--samples", type=int, default=512)
ap.add_argument("--angle", type=float, default=60)
ap.add_argument("--margin", type=float, default=6)    # texels between islands at --size
ap.add_argument("--unwrap-only", action="store_true")
ap.add_argument("--ground", type=int, default=1024, help="ground map size")
ap.add_argument("--jeep", default="expedition")
a = ap.parse_args(argv)
T0 = time.time()
GLOW = ("ru_glass", "wt_glow")
THIN = ("LaundryCloth", "Chain")

sys.path.insert(0, HERE); sys.path.insert(0, LIVED); sys.path.insert(0, os.path.join(ROOT, "props"))
import build_camp  # noqa: E402
import build_fire  # noqa: E402
import build_laundry  # noqa: E402
import build_lived  # noqa: E402
from lib.bake import flat_colours  # noqa: E402
from lib.export import export_glb, reset  # noqa: E402
from lib.mesh import apply_all  # noqa: E402


def flat(objs):
    """The props' own colours for this bake: plain base colours into Col (alpha 0 where it glows), no light of their own."""
    flat_colours(objs, GLOW)


# ---- 1. the lived builders, with flat colours, each in its own fresh scene and written to a scratch GLB that step 2
# imports. The round trip stays on purpose: the glTF export triangulates every face and splits vertices at hard edges
# and UV seams (WoodPile: 90 faces and 161 vertices as built, 178 triangles and 225 vertices as imported), and the
# light-map unwrap below (smart_project, then one pack for all objects) works on those faces, so building the props
# straight into this scene would give every object a different atlas. The scratch folder keeps a failed or
# --unwrap-only run from leaving half-made props/lived/*.glb behind; step 4 writes those.
SCRATCH = tempfile.mkdtemp(prefix="camp_lived_")
for name, mod, build in (("lived", build_lived, lambda path: build_lived.build(32, colour=flat, path=path)),
                         ("fire", build_fire, lambda path: build_fire.build(colour=flat, path=path)),
                         ("laundry", build_laundry, lambda path: build_laundry.build(colour=flat, path=path))):
    build(os.path.join(SCRATCH, f"{name}.glb"))
    print(f"  built {mod.__name__} (flat colours)")


def B(x, y, z):            # three.js -> Blender
    return Vector((x, -z, y))


# ---- 2. layout: where the page stands each prop and light, [x, z, yaw] in three.js metres, as the layout step read it from
# the live page (props/shadow/export_casters.cjs -> layout_picked.json "place"; props/bake_all.py runs that step first)
LAYOUT = json.load(open(os.path.join(ROOT, "props", "shadow", "layout_picked.json")))
PL = LAYOUT.get("place") or sys.exit("layout_picked.json has no place block: run props/bake_all.py --only layout first")
seat_at = [tuple(v) for v in PL["seats"]]
TENT, HAMMOCK, TABLE, JEEP = (tuple(PL[k]) for k in ("tent", "hammock", "table", "jeep"))
# the lanterns sway, so the page draws them and they are not baked; their lights are. The page's light is 0.125 m below
# each lantern's hang point (lanterns.js JAR_Y), the bake's 0.12 m: 5 mm higher (review props-07), kept so the bake
# stays as it was
PAGE_LANTERN_DROP, LANTERN_DROP = 0.125, 0.12
lanterns = [(x, y + PAGE_LANTERN_DROP, z) for x, y, z in PL["lanternLights"]]        # where each lantern hangs
# toward the sun, the page's (-4, 10, 3): kept here because the page's normalised copy differs from this one in the
# last float bit (6e-8), and the bake must stay as it was; it stops if the two ever disagree
sd = Vector((-4, -3, 10)).normalized()
if (sd - B(*PL["sun"])).length > 1e-6:
    sys.exit(f"the page's sun {PL['sun']} is not the bake's {tuple(sd)}: update sd")
print(f"  layout from layout_picked.json; lantern lights {LANTERN_DROP} m below the hang points (the page: {PAGE_LANTERN_DROP} m)")
PLACE = {
    "lived": {"WoodPile": PL["woodPile"], "WoodStack": PL["woodPile"], "LooseLogs": PL["woodPile"], "SeatThings": PL["seatThings"],
              "TentSide": PL["tentSide"], "MatRoll": PL["tentSide"], "KitchenCrate": PL["kitchen"], "KitchenThings": PL["kitchen"]},
    "fire": {n: (0, 0, 0) for n in ("Ring", "Tripod", "TripodLegs", "Fire", "Embers", "Pot", "Chain")},
    "laundry": {"LaundryPosts": PL["laundry"], "LaundryCloth": PL["laundry"]},
}

reset()
objs = build_camp.picked()
for name, o in objs.items():
    apply_all(o); o.location = (0, 0, 0)
    n = build_camp.BUDGET["picked"].get(name); t = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if n and t > n:
        bpy.context.view_layer.objects.active = o
        d = o.modifiers.new("lean", "DECIMATE"); d.decimate_type = "COLLAPSE"; d.ratio = n / t; d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=d.name)
flat(list(objs.values()))


def place(src, name, x, z, yaw, y=0.0, copy=True):
    o = src
    if copy:
        o = src.copy(); o.data = src.data.copy(); bpy.context.collection.objects.link(o)
    o.name = name; o.location = B(x, y, z); o.rotation_mode = "XYZ"; o.rotation_euler = (0, 0, yaw)
    return o


picked = []
for i, (x, z, yaw) in enumerate(seat_at):
    picked.append(place(objs["Seat"], f"Seat_{i}", x, z, yaw))
picked.append(place(objs["Tent"], "Tent", *TENT, copy=False))
picked.append(place(objs["Hammock"], "Hammock", *HAMMOCK, copy=False))
picked.append(place(objs["Table"], "Table", *TABLE, copy=False))
bpy.data.objects.remove(objs["Seat"]); bpy.data.objects.remove(objs["Lantern"])


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


sets, top = {}, None
for sname, table in PLACE.items():
    new = import_glb(os.path.join(SCRATCH, f"{sname}.glb"))
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
shutil.rmtree(SCRATCH)
lived = sets["lived"]
for i, (x, z, yaw) in enumerate(seat_at):
    lived.append(place(top, f"SeatTop_{i}", x, z, yaw, copy=i < 2))
receivers = picked + [o for s in sets.values() for o in s if o.name != "Embers"]
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in picked + [o for s in sets.values() for o in s]}

# ---- 3a. the atlas: TEXCOORD_0 stays (texture UVs, or a dummy), LM is TEXCOORD_1, packed jointly
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
if a.unwrap_only:
    sys.exit(0)

# ---- 3b. the rest of the scene: the jeep (an occluder only) and the real ground disc (a receiver, mapped straight onto
# the page's floor: image row 0 = page z -RR, column 0 = x -RR, as ground.js looks it up with flipY false)
jeep = []
jroot = bpy.data.objects.new("JeepRoot", None); bpy.context.collection.objects.link(jroot)     # the page's jeep group: every
jroot.location = B(JEEP[0], 0, JEEP[1]); jroot.rotation_euler = (0, 0, JEEP[2])              # node keeps its own place under it
jall = import_glb(os.path.join(ROOT, "props", "jeep", f"jeep_{a.jeep}.glb"))
for o in jall:
    if o.type == "MESH" and o.name.startswith("Glass"):
        o.hide_render = True                                                           # see-through on the page
    if not o.parent:
        o.parent = jroot
    if o.type == "MESH":
        jeep.append(o)
DOORS = {"P": ("DoorP", -1.2), "D": ("DoorD", 1.2), "B": ("BackDoor", 1.75)}         # camp.html: node, open angle (rad, about up)
doors = {k: next(o for o in jall if o.name.split(".")[0] == n) for k, (n, _) in DOORS.items()}
# the deadwood at the clearing edge (camp/deadwood.js, seeded): occluders only, from the page's layout as export_casters.cjs
# saved it; plain cylinders are enough for their shadows
for d in LAYOUT.get("deadwood", []):
    if d["name"] == "FallenLog":
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=d["r"], depth=d["L"], location=B(d["x"], d.get("y", 0) + d["r"], d["z"]), rotation=(0, math.pi / 2, 0))
        o = bpy.context.object; o.rotation_mode = "YXZ"; o.rotation_euler = (0, math.pi / 2, d["yaw"])   # lie along x, then yaw
    elif d["name"] == "Stump":
        bpy.ops.mesh.primitive_cylinder_add(vertices=9, radius=d["r"], depth=d["h"], location=B(d["x"], d.get("y", 0) + d["h"] / 2, d["z"]))
    elif d["name"] == "DeadTrunk":
        bpy.ops.mesh.primitive_cylinder_add(vertices=7, radius=0.27, depth=d["H"], location=B(d["x"], d.get("y", 0) + d["H"] / 2, d["z"]))
    else:
        continue
    bpy.context.object.name = d["name"]; jeep.append(bpy.context.object)   # with the jeep: an occluder, removed before export
RR = 9.8
bpy.ops.mesh.primitive_plane_add(size=2 * RR, location=(0, 0, 0))
ground = bpy.context.object; ground.name = "Ground"
guv = ground.data.uv_layers.active.data
for poly in ground.data.polygons:
    for li in poly.loop_indices:
        co = ground.data.vertices[ground.data.loops[li].vertex_index].co
        guv[li].uv = (co.x / (2 * RR) + 0.5, co.y / (2 * RR) + 0.5)
print(f"  scene: {len(receivers)} props, {len(jeep)} jeep parts, ground {2 * RR} m square")

# ---- 3c. lights: day = the page's sun (from (-4, 10, 3), 4 degrees wide) and a white sky; night = four lights, each baked
# on its own in white (its share of light, bounces included), so the page can colour, flicker, dim and mix them live
LIGHTS = {                                                       # name: colour (the page applies it), objects
    "fire": [(1.0, 0.50, 0.20), []], "stove": [(1.0, 0.55, 0.15), []], "lanterns": [(1.0, 0.72, 0.38), []], "moon": [(0.55, 0.65, 1.0), []],
    }                                      # the jeep: no baked lights (headlights dropped; the cabin light is live on the page, Adriaen 2026-11-12)
day_l = []
def point(group, name, at, watts, r):
    L = bpy.data.lights.new(name, "POINT"); L.color = (1, 1, 1); L.energy = watts; L.shadow_soft_size = r
    o = bpy.data.objects.new(name, L); o.location = at; bpy.context.collection.objects.link(o); LIGHTS[group][1].append(o)
point("fire", "FireLight", B(0, 0.55, 0), 260, 0.25)
for i, p in enumerate(lanterns):
    point("lanterns", f"LanternLight_{i}", B(p[0], p[1] - LANTERN_DROP, p[2]), 50, 0.05)
tent = next(o for o in picked if o.name == "Tent")
bpy.context.view_layer.update()
point("stove", "StoveLight", tent.matrix_world @ (Vector(build_camp.STOVE) + Vector((-0.35, 0, -0.1))), 22, 0.12)
moon = bpy.data.lights.new("Moon", "SUN"); moon.color = (1, 1, 1); moon.energy = 0.12; moon.angle = math.radians(2)
mo = bpy.data.objects.new("Moon", moon); mo.rotation_euler = (math.radians(40), 0, math.radians(-120))
bpy.context.collection.objects.link(mo); LIGHTS["moon"][1].append(mo)
bpy.context.view_layer.update()
sun = bpy.data.lights.new("Sun", "SUN"); sun.energy = 3.0; sun.angle = math.radians(4)
so = bpy.data.objects.new("Sun", sun); so.rotation_euler = (-sd).to_track_quat("-Z", "Y").to_euler()
bpy.context.collection.objects.link(so); day_l.append(so)
sc = bpy.context.scene
w = bpy.data.worlds.new("sky"); w.use_nodes = True; sc.world = w
bgn = w.node_tree.nodes["Background"]
sc.world.light_settings.distance = 0.6
sc.render.engine = "CYCLES"; sc.cycles.samples = a.samples; sc.cycles.use_adaptive_sampling = False
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 3
bk = sc.render.bake
bk.target = "IMAGE_TEXTURES"; bk.margin = 8; bk.use_clear = True
bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False


def only(group):
    """Light the scene with one group: "day" (sun + white sky), or one of LIGHTS (the moon's group also has the night sky)."""
    for o in day_l: o.hide_render = group != "day"
    for g, (_, objs) in LIGHTS.items():
        for o in objs: o.hide_render = g != group
    bgn.inputs["Color"].default_value = (1, 1, 1, 1)
    bgn.inputs["Strength"].default_value = 1.0 if group == "day" else 0.02 if group == "moon" else 0.0


# ---- 3d. bake through plain stand-ins (grey for props and jeep, one for the thin cards, white for the ground)
def grey(name, c=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (c, c, c, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    n = m.node_tree.nodes.new("ShaderNodeTexImage"); m.node_tree.nodes.active = n
    return m, n
g_all, n_all = grey("bake_grey"); g_thin, n_thin = grey("bake_grey_thin"); g_gnd, n_gnd = grey("bake_ground", 1.0)
ground.data.materials.append(g_gnd)
keep = {}
for o in receivers:
    keep[o.name] = list(o.data.materials)
    if not o.data.materials:
        o.data.materials.append(None)
    for i in range(len(o.data.materials)):
        o.data.materials[i] = g_thin if o.name in THIN else g_all
for o in jeep:
    if not o.data.materials:
        o.data.materials.append(None)
    for i in range(len(o.data.materials)):
        o.data.materials[i] = g_all


def bake(kind, objs, img):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t = time.time(); bpy.ops.object.bake(type=kind); print(f"  {kind} -> {img.name}: {time.time() - t:.0f} s")
    px = np.empty(img.size[0] * img.size[1] * 4, np.float32); img.pixels.foreach_get(px)
    return px.reshape(img.size[1], img.size[0], 4)


def props_img(tag):
    img = bpy.data.images.new(tag, a.size, a.size, alpha=False, float_buffer=True)
    n_all.image = n_thin.image = img
    return img


def ground_img(tag):
    img = bpy.data.images.new(tag, a.ground, a.ground, alpha=False, float_buffer=True)
    n_gnd.image = img
    return img


thin = [o for o in receivers if o.name in THIN]
only("day")
ao = bake("AO", receivers, props_img("AO"))                                 # sky occlusion on the props
bgn.inputs["Strength"].default_value = 0.0; bk.use_pass_indirect = False     # where the sun reaches each prop: its direct
sundirect = bake("DIFFUSE", receivers, props_img("SUN"))                    # light, over the same with nothing casting shadows
casts = {o.name: o.visible_shadow for o in receivers + jeep}
for o in receivers + jeep: o.visible_shadow = False
sunopen = bake("DIFFUSE", receivers, props_img("SUN_OPEN"))
for o in receivers + jeep: o.visible_shadow = casts[o.name]
bk.use_pass_indirect = True; bgn.inputs["Strength"].default_value = 1.0
gday = bake("DIFFUSE", [ground], ground_img("GROUND_DAY"))                  # sun + sky on the ground
lit, glit = {}, {}                                                          # each light's share, props and ground (grey: white light)
for g in LIGHTS:
    only(g)
    px = bake("DIFFUSE", receivers, props_img(g.upper()))
    if thin:                                                                # the back of each card; keep the brighter side
        n_thin.image = bpy.data.images.new(g.upper() + "_BACK", a.size, a.size, alpha=False, float_buffer=True)
        for o in thin: o.data.flip_normals()
        px = np.maximum(px, bake("DIFFUSE", thin, n_thin.image))
        for o in thin: o.data.flip_normals()
    lit[g] = px[..., :3].mean(-1)
    glit[g] = bake("DIFFUSE", [ground], ground_img("GROUND_" + g.upper()))[..., :3].mean(-1)
for o in receivers:
    for i, m in enumerate(keep[o.name]):
        o.data.materials[i] = m
    if not keep[o.name]:
        o.data.materials.clear()
for o in jeep:
    bpy.data.objects.remove(o)
bpy.data.objects.remove(ground)


def enc(x):                                                                 # light / 4, gamma 2.2: precision in the dark
    return np.power(np.clip(x / 4, 0, 1), 1 / 2.2)


def save(px, name):
    n = px.shape[0]
    for size in sorted({a.size, 2048, 1024}, reverse=True):
        if size > n:
            continue
        img = bpy.data.images.new(f"{name}_{size}", n, n, alpha=True)
        img.colorspace_settings.name = "Non-Color"; img.alpha_mode = "STRAIGHT"
        img.pixels.foreach_set(px.ravel())
        if size != n:
            img.scale(size, size)
        f = os.path.join(MODELS, f"{name}_{size // 1024}k.png"); img.filepath_raw = f; img.file_format = "PNG"
        img.save()
        print(f"  {os.path.basename(f)}: {os.path.getsize(f) // 1024} KB")


G = list(LIGHTS)[:4]                                                        # channel order: fire, stove, lanterns, moon
# props map 1: one channel per light; map 2: R = where the sun reaches, G = sky occlusion
save(np.stack([enc(lit[g]) for g in G], -1).astype(np.float32), "camp_lm")
so_ = sunopen[..., :3].mean(-1); sd_ = sundirect[..., :3].mean(-1)
sv = np.where(so_ > 0.02, np.clip(sd_ / np.maximum(so_, 1e-6), 0, 1), 1.0)   # surfaces facing away: the page's N . L hides them anyway
print(f"  sun: mean visibility {sv[so_ > 0.02].mean():.2f}")
save(np.stack([sv, np.clip(ao[..., 0], 0, 1), np.zeros_like(sv), np.zeros_like(sv)], -1).astype(np.float32), "camp_lm_sun")   # B, A: free (were the jeep's lights)
# ground: the day shadow (1 - light / open ground, as before) and one channel per light; row 0 = page z -RR
from PIL import Image
gd = gday[..., :3].mean(-1); open_ = np.percentile(gd, 99.5)
shadow = np.clip(1 - gd / open_, 0, 1)[::-1]
Image.fromarray((shadow * 255 + 0.5).astype(np.uint8), "L").save(os.path.join(MODELS, f"camp_shadow_picked_{a.jeep}.png"), optimize=True)
gn = (np.stack([enc(glit[g]) for g in G], -1)[::-1] * 255 + 0.5).astype(np.uint8)
Image.fromarray(np.ascontiguousarray(gn), "RGBA").save(os.path.join(MODELS, f"camp_ground_night_picked_{a.jeep}.png"), optimize=True)
json.dump({"channels": G, "colour": {g: LIGHTS[g][0] for g in LIGHTS}, "encoding": "light / 4, gamma 2.2",
           "ground_open_day": round(float(open_), 4)}, open(os.path.join(MODELS, "camp_lights.json"), "w"), indent=1)
print(f"  ground: open-ground light {open_:.3f}, shadow mean {shadow.mean():.3f}; " + ", ".join(f"{g} max {glit[g].max():.2f}" for g in G))

# ---- 4. export: the picked set at its camp positions, the lived sets each object back at its own origin
def export(objs, path, txt, image_format="AUTO"):
    export_glb(objs, path, image_format=image_format)
    with open(path, "rb") as f, open(os.path.join(MODELS, txt), "w") as g:
        g.write(base64.b64encode(f.read()).decode())


export(picked, os.path.join(HERE, "camp_picked_lm.glb"), "camp_picked_lm.txt")
for sname, meshes in sets.items():
    for o in meshes:
        o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
    export(meshes, os.path.join(LIVED, f"{sname}.glb"), f"{sname}.txt", "JPEG" if sname == "lived" else "AUTO")
print(f"camp light: {len(tris)} objects, {sum(tris.values())} triangles, {time.time() - T0:.0f} s")
