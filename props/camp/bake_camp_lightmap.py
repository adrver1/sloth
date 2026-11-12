"""
All the camp props' light in one place (Adriaen 2026-11-12: "We don't want to generate shadows and light maps in several
different places"): the picked camp set and the lived-in props (wood pile, seat things, tent side, mat roll, kitchen
crate, the fire set and the laundry line) are baked together, in one scene, into one shared light map.

    blender -b --python props/camp/bake_camp_lightmap.py -- --size 4096 --samples 512
    # on the desktop GPU: blender -b --python <render-jobs>/gpu_run.py -- props/camp/bake_camp_lightmap.py --size 4096

1. Runs props/lived/build_lived.py, build_fire.py and build_laundry.py with build_camp.bake swapped for a flat one, so
   their vertex colours are plain base colours (no AO of their own) and their GLBs carry no light.
2. Builds the picked set (build_camp.py, BUDGET decimate, no densify), imports the lived GLBs, and stands everything where
   camp.html puts it. The picked set's old Fire is left out: the lived fire set replaces it on the page.
3. Gives every prop a second UV map (TEXCOORD_1; TEXCOORD_0 stays the texture's, or a dummy) packed into one atlas, and
   bakes one RGBA image on the fire, 8 jar lanterns, the tent stove and a dim blue moon:
     RGB  night light / 4, sRGB-encoded; the page tones it as 1 - exp(-6.4 x surface colour x light), unlit, at night
     A    day ambient occlusion (distance 0.6); the page darkens the surface colour by 0.32 + 0.68 x AO by day
   Thin double-sided cards (laundry, chain) take the brighter of their two sides.
   COLOR_0 alpha 0 marks faces that glow at night (lantern glass, the stove's fire).
4. Writes props/camp/camp_picked_lm.glb, props/lived/{lived,fire,laundry}.glb (each object back at its own origin, so
   the page places them as before; SeatTop as SeatTop_0-2, one per seat) with their models/*.txt copies, and
   apps/canopy-prototype/models/camp_lm_<4k|2k|1k>.png.
Layout and lights mirror camp.html (A0, tentAt, hA, hB, tb, lanternGlow, the lived PLACE table); keep them in step.
A three.js point (x, y, z) is Blender (x, -z, y); yaw about up is the same angle in both.
"""
import argparse, base64, math, os, sys, time
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
a = ap.parse_args(argv)
T0 = time.time()
GLOW = ("ru_glass", "wt_glow")
THIN = ("LaundryCloth", "Chain")

sys.path.insert(0, HERE); sys.path.insert(0, LIVED)
import build_camp  # noqa: E402


def flat_bake(objs, samples=0):
    """Stands in for build_camp.bake: plain base colours into Col (alpha 0 where it glows), one vertex-colour material."""
    for o in objs:
        me = o.data
        for c in list(me.color_attributes):
            me.color_attributes.remove(me.color_attributes[c.name])
        col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        for poly in me.polygons:
            m = me.materials[poly.material_index] if me.materials else None
            base = Vector(m["base"]) if m and "base" in m else Vector((0.5, 0.5, 0.5))
            al = 0.0 if m and m.name.split(".")[0] in GLOW else 1.0
            for li in poly.loop_indices:
                col.data[li].color = (base.x, base.y, base.z, al)
        me.color_attributes.active_color = col
        m = bpy.data.materials.new("Baked"); m.use_nodes = True
        nt = m.node_tree; ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "Col"
        nt.links.new(ca.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
        me.materials.clear(); me.materials.append(m)


build_camp.bake = flat_bake

# ---- 1. the lived builders, with flat colours
for name, call in (("build_lived", lambda g: g["build"](32, None)), ("build_fire", lambda g: g["build"]()), ("build_laundry", lambda g: g["build"]())):
    path = os.path.join(LIVED, name + ".py")
    g = {"__name__": name, "__file__": path}
    exec(compile(open(path, encoding="utf-8").read(), path, "exec"), g)
    call(g)
    print(f"  built {name} (flat colours)")


def B(x, y, z):            # three.js -> Blender
    return Vector((x, -z, y))


# ---- 2. layout, as camp.html
A0 = -0.75
d0 = (math.cos(A0), math.sin(A0)); t0 = (-d0[1], d0[0])
def comb(sa, sb, base=(0, 0)): return (base[0] + d0[0] * sa + t0[0] * sb, base[1] + d0[1] * sa + t0[1] * sb)
tentAt = comb(-4.2, 2.4); hA = comb(-1.5, -4.6); hB = comb(-2.6, -1.2, hA); tb = comb(1.6, 3.2)
_tl = math.hypot(*tentAt)
l0 = (tentAt[0] - tentAt[0] / _tl * 1.12, 2.8, tentAt[1] - tentAt[1] / _tl * 1.12)
l1 = (hA[0], 2.5, hA[1])
lanterns = []
for i in range(1, 9):
    t = i / 9; p = [l0[k] + (l1[k] - l0[k]) * t for k in range(3)]; p[1] -= math.sin(math.pi * t) * 0.45
    lanterns.append(p)
seat_at = [(math.cos(A0 + math.pi + (i - 1) * 1.15) * 2.1, math.sin(A0 + math.pi + (i - 1) * 1.15) * 2.1,
            -(A0 + math.pi + (i - 1) * 1.15) + math.pi / 2) for i in range(3)]
TENT = (tentAt[0], tentAt[1], math.atan2(-tentAt[0], -tentAt[1]))
wp = (-0.55, -3.15); wy = math.atan2(-wp[0], -wp[1])
KITCHEN = (4.55, 1.7, math.atan2(-4.55, -1.7))
LA, LB = (1.3, 4.3), (4.0, 3.0)
LAUNDRY = ((LA[0] + LB[0]) / 2, (LA[1] + LB[1]) / 2, math.atan2(-(LB[1] - LA[1]), LB[0] - LA[0]))
PLACE = {
    "lived": {"WoodPile": (*wp, wy), "WoodStack": (*wp, wy), "LooseLogs": (*wp, wy), "SeatThings": seat_at[1],
              "TentSide": TENT, "MatRoll": TENT, "KitchenCrate": KITCHEN, "KitchenThings": KITCHEN},
    "fire": {n: (0, 0, 0) for n in ("Ring", "Tripod", "TripodLegs", "Fire", "Embers", "Pot", "Chain")},
    "laundry": {"LaundryPosts": LAUNDRY, "LaundryCloth": LAUNDRY},
}

build_camp.reset()
objs = build_camp.picked()
bpy.data.objects.remove(objs.pop("Fire"))        # the lived fire set replaces it on the page
for name, o in objs.items():
    build_camp.apply_all(o); o.location = (0, 0, 0)
    n = build_camp.BUDGET["picked"].get(name); t = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if n and t > n:
        bpy.context.view_layer.objects.active = o
        d = o.modifiers.new("lean", "DECIMATE"); d.decimate_type = "COLLAPSE"; d.ratio = n / t; d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=d.name)
flat_bake(list(objs.values()))


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
hm = ((hA[0] + hB[0]) / 2, (hA[1] + hB[1]) / 2); hd = (hB[0] - hA[0], hB[1] - hA[1])
picked.append(place(objs["Hammock"], "Hammock", hm[0], hm[1], -math.atan2(hd[1], hd[0]), copy=False))
picked.append(place(objs["Table"], "Table", tb[0], tb[1], 0.6, copy=False))
for i, p in enumerate(lanterns):
    o = place(objs["Lantern"], f"Lantern_{i}", p[0], p[2], i, p[1] + 0.02)
    o.visible_shadow = False                     # the jar would trap its own light
    picked.append(o)
bpy.data.objects.remove(objs["Seat"]); bpy.data.objects.remove(objs["Lantern"])


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


sets, top = {}, None
for sname, table in PLACE.items():
    new = import_glb(os.path.join(LIVED, f"{sname}.glb"))
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

# ---- 3b. ground stand-in, lights, world
bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
gm = bpy.data.materials.new("ground"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.22, 0.10, 1)
bpy.context.object.data.materials.append(gm)
def point(name, at, rgb, watts, r):
    L = bpy.data.lights.new(name, "POINT"); L.color = rgb; L.energy = watts; L.shadow_soft_size = r
    o = bpy.data.objects.new(name, L); o.location = at; bpy.context.collection.objects.link(o)
point("FireLight", B(0, 0.55, 0), (1.0, 0.50, 0.20), 260, 0.25)
for i, p in enumerate(lanterns):
    point(f"LanternLight_{i}", B(p[0], p[1] - 0.12, p[2]), (1.0, 0.72, 0.38), 50, 0.05)
tent = next(o for o in picked if o.name == "Tent")
bpy.context.view_layer.update()
point("StoveLight", tent.matrix_world @ (Vector(build_camp.STOVE) + Vector((-0.35, 0, -0.1))), (1.0, 0.55, 0.15), 22, 0.12)
moon = bpy.data.lights.new("Moon", "SUN"); moon.color = (0.55, 0.65, 1.0); moon.energy = 0.12; moon.angle = math.radians(2)
mo = bpy.data.objects.new("Moon", moon); mo.rotation_euler = (math.radians(40), 0, math.radians(-120))
bpy.context.collection.objects.link(mo)
sc = bpy.context.scene
sc.world = bpy.data.worlds.new("night"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.010, 0.014, 0.030, 1)
sc.world.light_settings.distance = 0.6
sc.render.engine = "CYCLES"; sc.cycles.samples = a.samples; sc.cycles.use_adaptive_sampling = False
bk = sc.render.bake
bk.target = "IMAGE_TEXTURES"; bk.margin = 8; bk.use_clear = True
bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False

# ---- 3c. bake through plain grey stand-ins (one for the thin cards), real materials back afterwards
def grey(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
    n = m.node_tree.nodes.new("ShaderNodeTexImage"); m.node_tree.nodes.active = n
    return m, n
g_all, n_all = grey("bake_grey"); g_thin, n_thin = grey("bake_grey_thin")
keep = {}
for o in receivers:
    keep[o.name] = list(o.data.materials)
    if not o.data.materials:
        o.data.materials.append(None)
    for i in range(len(o.data.materials)):
        o.data.materials[i] = g_thin if o.name in THIN else g_all


def bake(kind, img_name, objs):
    img = bpy.data.images.get(img_name) or bpy.data.images.new(img_name, a.size, a.size, alpha=False, float_buffer=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t = time.time(); bpy.ops.object.bake(type=kind); print(f"  {kind} -> {img_name}: {time.time() - t:.0f} s")
    px = np.empty(a.size * a.size * 4, np.float32); img.pixels.foreach_get(px)
    return px.reshape(a.size, a.size, 4)


n_all.image = n_thin.image = bpy.data.images.new("AO", a.size, a.size, alpha=False, float_buffer=True)
ao = bake("AO", "AO", receivers)
n_all.image = n_thin.image = bpy.data.images.new("L", a.size, a.size, alpha=False, float_buffer=True)
light = bake("DIFFUSE", "L", receivers)
thin = [o for o in receivers if o.name in THIN]
if thin:                                          # the back of each card, into its own image; keep the brighter side
    n_thin.image = bpy.data.images.new("L2", a.size, a.size, alpha=False, float_buffer=True)
    for o in thin: o.data.flip_normals()
    light = np.maximum(light, bake("DIFFUSE", "L2", thin))
    for o in thin: o.data.flip_normals()
for o in receivers:
    for i, m in enumerate(keep[o.name]):
        o.data.materials[i] = m
    if not keep[o.name]:
        o.data.materials.clear()


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


rgba = np.empty_like(light)
rgba[..., :3] = srgb(light[..., :3] / 4)
rgba[..., 3] = np.clip(ao[..., 0], 0, 1)
for size, tag in dict(((a.size, f"{a.size // 1024}k"), (2048, "2k"), (1024, "1k"))).items():
    if size > a.size:
        continue
    img = bpy.data.images.new(f"lm_{tag}", a.size, a.size, alpha=True)
    img.colorspace_settings.name = "Non-Color"; img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(rgba.ravel())
    if size != a.size:
        img.scale(size, size)
    img.filepath_raw = os.path.join(MODELS, f"camp_lm_{tag}.png"); img.file_format = "PNG"
    img.save()
    print(f"  camp_lm_{tag}.png: {os.path.getsize(img.filepath_raw) // 1024} KB")

# ---- 4. export: the picked set at its camp positions, the lived sets each object back at its own origin
def export(objs, path, txt, image_format="AUTO"):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=True,
                              export_image_format=image_format)
    with open(path, "rb") as f, open(os.path.join(MODELS, txt), "w") as g:
        g.write(base64.b64encode(f.read()).decode())
    print(f"  {os.path.basename(path)}: {os.path.getsize(path) // 1024} KB")


export(picked, os.path.join(HERE, "camp_picked_lm.glb"), "camp_picked_lm.txt")
for sname, meshes in sets.items():
    for o in meshes:
        o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
    export(meshes, os.path.join(LIVED, f"{sname}.glb"), f"{sname}.txt", "JPEG" if sname == "lived" else "AUTO")
for k, v in tris.items():
    print(f"  {k}: {v} triangles")
print(f"camp light: {len(tris)} objects, {sum(tris.values())} triangles, {time.time() - T0:.0f} s")
