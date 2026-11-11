"""
Night light for the lived-in props (wood pile, mug and book, the fire set, the laundry line), so they match the picked
camp at dusk (props/camp/bake_camp_night.py: same fire, lantern and moon lights). Run it after the three builders:

    .venv/bin/python props/lived/build_lived.py && .venv/bin/python props/lived/build_fire.py && .venv/bin/python props/lived/build_laundry.py
    .venv/bin/python props/lived/bake_lived_night.py [--samples 256]

It imports lived.glb, fire.glb and laundry.glb, stands each object where camp.html puts it (with the picked camp from
props/camp/camp_picked.glb and a ground plane as occluders), bakes the light falling on it, and writes it back into the
same GLBs (and the page's base64 copies) as a second colour set:

    COLOR_0  day colour, unchanged (textured objects get a plain white one, unused by the page, so COLOR_1 lines up)
    COLOR_1  baked light / 4 (so bright light near the fire fits in a byte); the page shows
             1 - exp(-1.6 x surface colour x 4 x COLOR_1) unlit, faded in with uNight, as the picked set does

The objects are moved back to their own origins before export, so the page places them exactly as before.
"""
import argparse
import base64
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--samples", type=int, default=256)
a = ap.parse_args(argv)
SCALE = 4.0


def B(x, y, z):            # three.js -> Blender
    return Vector((x, -z, y))


# ---- where camp.html puts each object (three.js x, z and yaw about up; Blender uses the same angle about z)
A0 = -0.75
wp = (-0.55, -3.15)
wy = math.atan2(-wp[0], -wp[1])
sa = A0 + math.pi
LA, LB = (1.3, 4.3), (4.0, 3.0)
lmid = ((LA[0] + LB[0]) / 2, (LA[1] + LB[1]) / 2)
lyaw = math.atan2(-(LB[1] - LA[1]), LB[0] - LA[0])
PLACE = {
    "lived": {"WoodPile": (wp[0], wp[1], wy), "WoodStack": (wp[0], wp[1], wy),
              "SeatThings": (math.cos(sa) * 2.1, math.sin(sa) * 2.1, -sa + math.pi / 2)},
    "fire": {n: (0, 0, 0) for n in ("Ring", "Tripod", "TripodLegs", "Fire", "Embers", "Pot", "Chain")},
    "laundry": {"LaundryPosts": (lmid[0], lmid[1], lyaw), "LaundryCloth": (lmid[0], lmid[1], lyaw)},
}

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


# occluders: the picked camp at its camp positions, and the ground
for o in import_glb(os.path.join(ROOT, "props", "camp", "camp_picked.glb")):
    o.name = "occ_" + o.name                                   # keep the names free for ours (both sets have a "Fire")
    if o.name.startswith("occ_Fire"):                           # the old fire is hidden on the page when ours is shown
        o.hide_render = True
bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
gm = bpy.data.materials.new("ground"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.22, 0.10, 1)
bpy.context.object.data.materials.append(gm)

THIN = ("LaundryCloth", "Chain")       # single-sided cards the page draws double-sided
sets = {}
for name in PLACE:
    objs = import_glb(os.path.join(HERE, f"{name}.glb"))
    meshes = [o for o in objs if o.type == "MESH"]
    for o in objs:                      # unparent, keeping the transform, so each mesh can be placed on its own
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in meshes:
        key = o.name.split(".")[0]
        o.name = key
        x, z, yaw = PLACE[name][key]
        o.location = B(x, 0, z)
        o.rotation_mode = "XYZ"
        o.rotation_euler = (0, 0, yaw)
        if key in THIN:                                        # cards hang side by side: they don't shade each other
            o.visible_shadow = False
        if key in ("Fire", "Embers"):                          # the flames come from inside the teepee: its logs don't shade the light
            o.visible_shadow = False
    sets[name] = meshes

# lights, as props/camp/bake_camp_night.py
A0d = (math.cos(A0), math.sin(A0)); t0 = (-A0d[1], A0d[0])
comb = lambda s1, s2, base=(0, 0): (base[0] + A0d[0] * s1 + t0[0] * s2, base[1] + A0d[1] * s1 + t0[1] * s2)  # noqa: E731
tentAt = comb(-4.2, 2.4); hA = comb(-1.5, -4.6)
l0 = (tentAt[0], 2.6, tentAt[1]); l1 = (hA[0], 2.5, hA[1])


def point(name, at, rgb, watts, r):
    L = bpy.data.lights.new(name, "POINT"); L.color = rgb; L.energy = watts; L.shadow_soft_size = r
    o = bpy.data.objects.new(name, L); o.location = at; sc.collection.objects.link(o)


point("FireLight", B(0, 0.55, 0), (1.0, 0.50, 0.20), 260, 0.25)
for i in range(1, 9):
    t = i / 9; p = [l0[k] + (l1[k] - l0[k]) * t for k in range(3)]; p[1] -= math.sin(math.pi * t) * 0.45
    point(f"LanternLight_{i}", B(p[0], p[1] - 0.12, p[2]), (1.0, 0.72, 0.38), 50, 0.05)
moon = bpy.data.lights.new("Moon", "SUN"); moon.color = (0.55, 0.65, 1.0); moon.energy = 0.12; moon.angle = math.radians(2)
mo = bpy.data.objects.new("Moon", moon); mo.rotation_euler = (math.radians(40), 0, math.radians(-120)); sc.collection.objects.link(mo)
sc.world = bpy.data.worlds.new("night"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.010, 0.014, 0.030, 1)
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = a.samples; sc.cycles.use_adaptive_sampling = False
sc.render.bake.target = "VERTEX_COLORS"
sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = True; sc.render.bake.use_pass_color = False

# bake through a plain grey stand-in material: the imported ones read the day colour from an attribute, and a black
# or missing albedo there turns the light-only bake to zero. The real materials go back before export.
tmp = bpy.data.materials.new("bake_grey"); tmp.use_nodes = True
tmp.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
keep = {}
for meshes in sets.values():
    for o in meshes:
        keep[o.name] = list(o.data.materials)
        for i in range(len(o.data.materials)):
            o.data.materials[i] = tmp

# the embers are drawn glowing and unlit; they need no night light
for name, meshes in sets.items():
    for o in meshes:
        me = o.data
        if "Col" not in [c.name for c in me.color_attributes]:
            for c in list(me.color_attributes):                       # the importer's name for COLOR_0
                c.name = "Col"; break
        if "Col" not in [c.name for c in me.color_attributes]:      # textured objects: a white day set, so Night is COLOR_1
            w = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
            for d in w.data:
                d.color = (1, 1, 1, 1)
        L = me.color_attributes.new("L", "FLOAT_COLOR", "CORNER")
        me.color_attributes.active_color = L
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        if not o.name.startswith("Embers"):
            bpy.ops.object.bake(type="DIFFUSE")
        two = o.name in THIN
        if two:                                         # thin cards seen from both sides: bake the back too, keep the brighter
            me.color_attributes.active_color = me.color_attributes.new("L2", "FLOAT_COLOR", "CORNER")
            me.flip_normals(); bpy.ops.object.bake(type="DIFFUSE"); me.flip_normals()
        night = me.color_attributes.new("Night", "BYTE_COLOR", "CORNER")
        L = me.color_attributes["L"]; night = me.color_attributes["Night"]
        L2 = me.color_attributes["L2"] if two else None
        for i, d in enumerate(L.data):
            c = d.color
            if two:
                c = [max(c[k], L2.data[i].color[k]) for k in range(3)]
            night.data[i].color = (min(1, c[0] / SCALE), min(1, c[1] / SCALE), min(1, c[2] / SCALE), 1)
        me.color_attributes.remove(me.color_attributes["L"])
        if two:
            me.color_attributes.remove(me.color_attributes["L2"])
        me.color_attributes.active_color = me.color_attributes["Col"]
        me.color_attributes.render_color_index = 0

# back to their own origins and materials and out again, both colour sets
for name, meshes in sets.items():
    for o in meshes:
        for i, m in enumerate(keep[o.name]):
            o.data.materials[i] = m
        o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    path = os.path.join(HERE, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=True, export_materials="EXPORT", export_yup=True, export_texcoords=True,
                              export_image_format="AUTO")
    with open(path, "rb") as f, open(os.path.join(ROOT, "apps", "canopy-prototype", "models", f"{name}.txt"), "w") as g:
        g.write(base64.b64encode(f.read()).decode())
    for o in meshes:
        print(f"  {name}/{o.name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} triangles, colour sets {[c.name for c in o.data.color_attributes]}")
    print(f"{name}: {os.path.getsize(path) // 1024} KB -> {path}")
