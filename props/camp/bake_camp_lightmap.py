"""
The picked camp set with its light in one shared texture instead of vertex colours (Adriaen 2026-11-11: "try a 4k texture").

    blender -b --python props/camp/bake_camp_lightmap.py -- --size 4096 --samples 512
    # on the desktop GPU: blender -b --python <render-jobs>/gpu_run.py -- props/camp/bake_camp_lightmap.py --size 4096

Same props, layout and lights as bake_camp_night.py (fire, 8 jar lanterns, the tent stove, a dim blue moon; keep the
two in step), but no densify: the meshes stay at their modelled detail (BUDGET decimate first), get one joint UV atlas
(TEXCOORD_0) and are baked into one RGBA image:
  RGB  night light / 4, sRGB-encoded for precision in the dark; the page tones it as 1 - exp(-6.4 x base x light),
       the same convention as the lived props' COLOR_1
  A    day ambient occlusion; the page darkens the base colour by 0.32 + 0.68 x AO and lights it live, as before
COLOR_0 is the flat base colour per part, with alpha 0 on faces that glow at night (lantern glass, the stove's fire).
Each seat and lantern is its own node with its own patch of the atlas, since each is lit where it stands.
Writes props/camp/camp_picked_lm.glb, apps/canopy-prototype/models/camp_picked_lm.txt (base64) and
camp_picked_lm_<4k|2k|1k>.png next to it.
"""
import argparse, base64, math, os, sys, time
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "..", "..", "apps", "canopy-prototype", "models")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--size", type=int, default=4096)
ap.add_argument("--samples", type=int, default=512)
ap.add_argument("--pack", default="CONCAVE")          # CONCAVE | AABB | CONVEX | lightmap
ap.add_argument("--angle", type=float, default=60)
ap.add_argument("--margin", type=float, default=6)    # texels between islands
ap.add_argument("--unwrap-only", action="store_true")
a = ap.parse_args(argv)
T0 = time.time()

bc = {"__name__": "build_camp", "__file__": os.path.join(HERE, "build_camp.py")}
exec(compile(open(bc["__file__"], encoding="utf-8").read(), bc["__file__"], "exec"), bc)


def B(x, y, z):            # three.js -> Blender
    return Vector((x, -z, y))


# ---- layout, as in camp.html and bake_camp_night.py
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

bc["reset"]()
objs = bc["picked"]()
for name, o in objs.items():
    bc["apply_all"](o); o.location = (0, 0, 0)
    n = bc["BUDGET"]["picked"].get(name); t = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if n and t > n:                                  # the budget, before unwrapping (no densify to undo here)
        bpy.context.view_layer.objects.active = o
        d = o.modifiers.new("lean", "DECIMATE"); d.decimate_type = "COLLAPSE"; d.ratio = n / t; d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=d.name)


def place(src, name, x, z, yaw, y=0.0, copy=True):
    o = src
    if copy:
        o = src.copy(); o.data = src.data.copy(); bpy.context.collection.objects.link(o)
    o.name = name; o.location = B(x, y, z); o.rotation_euler = (0, 0, yaw)
    return o


placed = [place(objs["Fire"], "Fire", 0, 0, 0, copy=False)]
for i in range(3):
    ang = A0 + math.pi + (i - 1) * 1.15
    placed.append(place(objs["Seat"], f"Seat_{i}", math.cos(ang) * 2.1, math.sin(ang) * 2.1, -ang + math.pi / 2))
placed.append(place(objs["Tent"], "Tent", tentAt[0], tentAt[1], math.atan2(-tentAt[0], -tentAt[1]), copy=False))
hm = ((hA[0] + hB[0]) / 2, (hA[1] + hB[1]) / 2); hd = (hB[0] - hA[0], hB[1] - hA[1])
placed.append(place(objs["Hammock"], "Hammock", hm[0], hm[1], -math.atan2(hd[1], hd[0]), copy=False))
placed.append(place(objs["Table"], "Table", tb[0], tb[1], 0.6, copy=False))
for i, p in enumerate(lanterns):
    o = place(objs["Lantern"], f"Lantern_{i}", p[0], p[2], i, p[1] + 0.02)
    o.visible_shadow = False                     # the jar would trap its own light
    placed.append(o)
bpy.data.objects.remove(objs["Seat"]); bpy.data.objects.remove(objs["Lantern"])
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in placed}

# ---- one joint UV atlas: every object's islands at the same texel density, packed together
for o in placed:
    while o.data.uv_layers:
        o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name="LM")
bpy.ops.object.select_all(action="DESELECT")
for o in placed:
    o.select_set(True)
bpy.context.view_layer.objects.active = placed[0]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
if a.pack == "lightmap":
    bpy.ops.uv.lightmap_pack(PREF_CONTEXT="ALL_FACES", PREF_PACK_IN_ONE=True, PREF_NEW_UVLAYER=False, PREF_IMG_PX_SIZE=a.size, PREF_BOX_DIV=48, PREF_MARGIN_DIV=0.2)
else:
    bpy.ops.uv.smart_project(angle_limit=math.radians(a.angle), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, shape_method=a.pack, margin_method="ADD", margin=a.margin / a.size)
bpy.ops.object.mode_set(mode="OBJECT")
isl, area = 0, 0.0
for o in placed:
    uv = o.data.uv_layers["LM"].data
    for poly in o.data.polygons:
        q = [uv[li].uv for li in poly.loop_indices]
        area += abs(sum(q[i].x * q[(i + 1) % len(q)].y - q[(i + 1) % len(q)].x * q[i].y for i in range(len(q)))) / 2
print(f"  atlas: {area * 100:.0f}% of the image covered")
if a.unwrap_only:
    sys.exit(0)

# ---- ground stand-in, lights, world (as bake_camp_night.py)
bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
ground = bpy.context.object
gm = bpy.data.materials.new("ground"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.22, 0.10, 1)
ground.data.materials.append(gm)
def point(name, at, rgb, watts, r):
    L = bpy.data.lights.new(name, "POINT"); L.color = rgb; L.energy = watts; L.shadow_soft_size = r
    o = bpy.data.objects.new(name, L); o.location = at; bpy.context.collection.objects.link(o)
point("FireLight", B(0, 0.55, 0), (1.0, 0.50, 0.20), 260, 0.25)
for i, p in enumerate(lanterns):
    point(f"LanternLight_{i}", B(p[0], p[1] - 0.12, p[2]), (1.0, 0.72, 0.38), 50, 0.05)
tent = next(o for o in placed if o.name == "Tent")
bpy.context.view_layer.update()
point("StoveLight", tent.matrix_world @ (Vector(bc["STOVE"]) + Vector((-0.35, 0, -0.1))), (1.0, 0.55, 0.15), 22, 0.12)
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

# ---- every material bakes into the shared image through one active image node
mats = {m for o in placed for m in o.data.materials if m}
nodes = []
for m in mats:
    m.use_nodes = True
    n = m.node_tree.nodes.new("ShaderNodeTexImage"); m.node_tree.nodes.active = n; nodes.append(n)


def bake(kind):
    img = bpy.data.images.new(kind, a.size, a.size, alpha=False, float_buffer=True)
    for n in nodes:
        n.image = img
    bpy.ops.object.select_all(action="DESELECT")
    for o in placed:
        o.select_set(True)
    bpy.context.view_layer.objects.active = placed[0]
    t = time.time(); bpy.ops.object.bake(type=kind); print(f"  {kind} bake {time.time() - t:.0f} s")
    px = np.empty(a.size * a.size * 4, np.float32); img.pixels.foreach_get(px)
    return px.reshape(a.size, a.size, 4)


ao = bake("AO")
light = bake("DIFFUSE")


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


rgba = np.empty_like(light)
rgba[..., :3] = srgb(light[..., :3] / 4)
rgba[..., 3] = np.clip(ao[..., 0], 0, 1)


def save(px, size, tag):
    img = bpy.data.images.new(f"lm_{tag}", px.shape[1], px.shape[0], alpha=True)
    img.colorspace_settings.name = "Non-Color"          # raw values: they are already sRGB-encoded above
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(px.ravel())
    if size != px.shape[0]:
        img.scale(size, size)
    img.filepath_raw = os.path.join(MODELS, f"camp_picked_lm_{tag}.png"); img.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"; sc.render.image_settings.compression = 90
    img.save()
    print(f"  {tag}: {os.path.getsize(img.filepath_raw) // 1024} KB")


for size, tag in dict(((a.size, f"{a.size // 1024}k"), (2048, "2k"), (1024, "1k"))).items():
    if size <= a.size:
        save(rgba, size, tag)

# ---- COLOR_0: flat base colour, alpha 0 where it glows at night
for o in placed:
    me = o.data
    for c in list(me.color_attributes):
        me.color_attributes.remove(me.color_attributes[c.name])
    me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    col = me.color_attributes["Col"]
    for poly in me.polygons:
        m = me.materials[poly.material_index]
        base = Vector(m["base"]) if "base" in m else Vector((0.5, 0.5, 0.5))
        glow = (o.name.startswith("Lantern") and m.name == "ru_glass") or m.name == "wt_glow"
        for li in poly.loop_indices:
            col.data[li].color = (base.x, base.y, base.z, 0.0 if glow else 1.0)
    me.color_attributes.active_color = col

bm = bpy.data.materials.new("Baked")
for o in placed:
    o.data.materials.clear(); o.data.materials.append(bm)
bpy.ops.object.select_all(action="DESELECT")
for o in placed:
    o.select_set(True)
path = os.path.join(HERE, "camp_picked_lm.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                          export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=True)
with open(path, "rb") as f, open(os.path.join(MODELS, "camp_picked_lm.txt"), "w") as g:
    g.write(base64.b64encode(f.read()).decode())
for k, v in tris.items():
    print(f"  {k}: {v} triangles")
print(f"camp lightmap: {len(placed)} nodes, {sum(tris.values())} triangles, {os.path.getsize(path) // 1024} KB glb, {time.time() - T0:.0f} s")
