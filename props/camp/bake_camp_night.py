"""
Day and night light for the picked camp set, baked in place: the props stand where camp.html puts them, so the
fire and the lantern string light the right sides of the right things.

    blender -b --python props/camp/bake_camp_night.py -- --samples 512 [--preview out.png]
    # on the desktop GPU: blender -b --python <render-jobs>/gpu_run.py -- props/camp/bake_camp_night.py --samples 512

Builds the meshes with build_camp.py's own code (same shapes, same densify, so no triangles are added), then writes
props/camp/camp_picked.glb (and the page's base64 copy, apps/canopy-prototype/models/camp_picked.txt):
  COLOR_0  day: base colour x soft ambient occlusion, lit live by the page (as build_camp.py does)
  COLOR_1  night: base colour x baked light from the fire, 8 jar lanterns and a dim blue moon; the page shows it
           unlit and fades to it when you rest. Lantern glass glows.
Each instance is its own node at its camp position (Fire, Seat_0-2, Tent, Hammock, Table, Lantern_0-7), since each
copy now carries its own light. The layout below mirrors camp.html (A0, tentAt, hA, hB, tb, lanternGlow); keep the two
in step. A three.js point (x, y, z) is Blender (x, -z, y); yaw about up is the same angle in both.
"""
import argparse, base64, math, os, sys
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--samples", type=int, default=512)
ap.add_argument("--preview", default="")
a = ap.parse_args(argv)

bc = {"__name__": "build_camp", "__file__": os.path.join(HERE, "build_camp.py")}
exec(compile(open(bc["__file__"], encoding="utf-8").read(), bc["__file__"], "exec"), bc)


def B(x, y, z):            # three.js -> Blender
    return Vector((x, -z, y))


# ---- layout, as in camp.html
A0 = -0.75
d0 = (math.cos(A0), math.sin(A0)); t0 = (-d0[1], d0[0])
def comb(sa, sb, base=(0, 0)): return (base[0] + d0[0] * sa + t0[0] * sb, base[1] + d0[1] * sa + t0[1] * sb)
tentAt = comb(-4.2, 2.4); hA = comb(-1.5, -4.6); hB = comb(-2.6, -1.2, hA); tb = comb(1.6, 3.2)
l0 = (tentAt[0], 2.6, tentAt[1]); l1 = (hA[0], 2.5, hA[1])
lanterns = []
for i in range(1, 9):
    t = i / 9; p = [l0[k] + (l1[k] - l0[k]) * t for k in range(3)]; p[1] -= math.sin(math.pi * t) * 0.45
    lanterns.append(p)

bc["reset"]()
objs = bc["picked"]()
for o in objs.values():
    bc["apply_all"](o); o.location = (0, 0, 0); bc["densify"](o)


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

# ---- ground stand-in, lights, world
bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
ground = bpy.context.object
gm = bpy.data.materials.new("ground"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.22, 0.10, 1)
gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
ground.data.materials.append(gm)
lights = []
def point(name, at, rgb, watts, r):
    L = bpy.data.lights.new(name, "POINT"); L.color = rgb; L.energy = watts; L.shadow_soft_size = r
    o = bpy.data.objects.new(name, L); o.location = at; bpy.context.collection.objects.link(o); lights.append(o)
point("FireLight", B(0, 0.55, 0), (1.0, 0.50, 0.20), 260, 0.25)
for i, p in enumerate(lanterns):
    point(f"LanternLight_{i}", B(p[0], p[1] - 0.12, p[2]), (1.0, 0.72, 0.38), 50, 0.05)
moon = bpy.data.lights.new("Moon", "SUN"); moon.color = (0.55, 0.65, 1.0); moon.energy = 0.12; moon.angle = math.radians(2)
mo = bpy.data.objects.new("Moon", moon); mo.rotation_euler = (math.radians(40), 0, math.radians(-120))
bpy.context.collection.objects.link(mo); lights.append(mo)
sc = bpy.context.scene
sc.world = bpy.data.worlds.new("night"); sc.world.use_nodes = True
bg = sc.world.node_tree.nodes["Background"]; bg.inputs["Color"].default_value = (0.010, 0.014, 0.030, 1)
sc.render.engine = "CYCLES"; sc.cycles.samples = a.samples; sc.cycles.use_adaptive_sampling = False
sc.render.bake.target = "VERTEX_COLORS"
sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = True; sc.render.bake.use_pass_color = False


def bake_all(kind, attr):
    for o in placed:
        ca = o.data.color_attributes.new(attr, "FLOAT_COLOR", "CORNER"); o.data.color_attributes.active_color = ca
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type=kind)


sc.world.light_settings.distance = 0.6
bake_all("AO", "A")            # day: ambient occlusion, as build_camp.py
bake_all("DIFFUSE", "L")       # night: light only (colour multiplied below)


# ---- COLOR_0 day, COLOR_1 night
def tone(v): return 1 - math.exp(-v * 1.6)
for o in placed:
    me = o.data; A = me.color_attributes["A"]; L = me.color_attributes["L"]
    day = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    night = me.color_attributes.new("Night", "BYTE_COLOR", "CORNER")
    for poly in me.polygons:
        m = me.materials[poly.material_index]
        base = Vector(m["base"]) if "base" in m else Vector((0.5, 0.5, 0.5))
        glow = o.name.startswith("Lantern") and m.name == "ru_glass"
        for li in poly.loop_indices:
            k = 0.32 + 0.68 * A.data[li].color[0]
            day.data[li].color = (base.x * k, base.y * k, base.z * k, 1)
            c = L.data[li].color
            night.data[li].color = (1.0, 0.82, 0.48, 1) if glow else (tone(base.x * c[0]), tone(base.y * c[1]), tone(base.z * c[2]), 1)
    me.color_attributes.remove(A); me.color_attributes.remove(L)
    me.color_attributes.active_color = me.color_attributes["Col"]

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in placed)

# ---- optional preview: the night colours exactly as the page shows them (unlit), ground lit live
if a.preview:
    pm = bpy.data.materials.new("night_preview"); pm.use_nodes = True; nt = pm.node_tree; nt.nodes.clear()
    vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Night"
    em = nt.nodes.new("ShaderNodeEmission"); out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(vc.outputs["Color"], em.inputs["Color"]); nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    keep = {o.name: list(o.data.materials) for o in placed}
    for o in placed:
        o.data.materials.clear(); o.data.materials.append(pm); o.visible_shadow = False
    cam = bpy.data.cameras.new("cam"); cam.lens = 26
    co = bpy.data.objects.new("cam", cam); bpy.context.collection.objects.link(co)
    mid = ((tentAt[0] + hA[0]) / 2, (tentAt[1] + hA[1]) / 2); n = math.hypot(*mid)
    eye = B(-mid[0] / n * 5.5, 1.6, -mid[1] / n * 5.5); look = B(mid[0] * 0.55, 1.1, mid[1] * 0.55)
    co.location = eye; co.rotation_euler = (look - eye).to_track_quat("-Z", "Y").to_euler(); sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.cycles.samples = 256; sc.cycles.use_denoising = True; sc.view_settings.view_transform = "Standard"
    sc.render.filepath = a.preview
    bpy.ops.render.render(write_still=True)
    for o in placed:
        o.data.materials.clear()
        for m in keep[o.name]: o.data.materials.append(m)

# ---- export: one plain vertex-colour material, both colour sets, nodes at their camp positions
bm = bpy.data.materials.new("Baked")
for o in placed:
    o.data.materials.clear(); o.data.materials.append(bm)
bpy.ops.object.select_all(action="DESELECT")
for o in placed:
    o.select_set(True)
path = os.path.join(HERE, "camp_picked.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                          export_all_vertex_colors=True, export_materials="EXPORT", export_yup=True, export_texcoords=False)
txt = os.path.join(HERE, "..", "..", "apps", "canopy-prototype", "models", "camp_picked.txt")
with open(path, "rb") as f, open(txt, "w") as g:
    g.write(base64.b64encode(f.read()).decode())
print(f"camp night: {len(placed)} nodes, {tris} triangles, {os.path.getsize(path) // 1024} KB -> {path}")
