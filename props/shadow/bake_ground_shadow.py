"""
Bakes Canopy Camp's ground shadows offline (Adriaen 2026-11-12: "this can surely be done offline too ... a rebake every time
we add something major is acceptable"). The page has no shadow maps; ground.js darkens the ground and plants by this map.

    node props/shadow/export_casters.cjs picked expedition          # casters_picked_expedition.glb, from the live page
    .bpyvenv/bin/python props/shadow/bake_ground_shadow.py -- --props picked --jeep expedition --samples 256

A white ground square 2 x RR across (the page's ground disc, RR = 9.8) under the casters, lit by the page's sun (from
(-4, 10, 3) in the page, a few degrees wide for soft edges) and a uniform sky, is baked as diffuse light (direct + indirect)
into one 1024 image. Shadow = 1 - light / open-ground light, so it holds both the sun's cast shadows and the sky's
occlusion under and between things. Written grey 8-bit to apps/canopy-prototype/models/camp_shadow_<props>_<jeep>.png;
image row 0 is page z = -RR, column 0 is x = -RR (texture flipY false), the same lookup as before.
"""
import argparse, math, os, sys, time
import bpy
import numpy as np
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument("--props", default="picked"); ap.add_argument("--jeep", default="expedition")
ap.add_argument("--size", type=int, default=1024); ap.add_argument("--samples", type=int, default=256)
ap.add_argument("--rr", type=float, default=9.8); ap.add_argument("--sun-angle", type=float, default=4.0)
ap.add_argument("--sun", type=float, default=3.0); ap.add_argument("--sky", type=float, default=1.0)
a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
src = os.path.join(HERE, f"casters_{a.props}_{a.jeep}.glb")
dst = os.path.join(ROOT, "apps/canopy-prototype/models", f"camp_shadow_{a.props}_{a.jeep}.png")

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.device = "GPU" if os.environ.get("GPU") else "CPU"
sc.cycles.samples = a.samples; sc.cycles.max_bounces = 3; sc.cycles.diffuse_bounces = 2

bpy.ops.import_scene.gltf(filepath=src)                     # Y-up glTF -> Blender Z-up: page (x, y, z) = Blender (x, z, -y)
grey = bpy.data.materials.new("caster"); grey.use_nodes = True
grey.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.33, 0.3, 1)
casters = [o for o in sc.objects if o.type == "MESH"]
tris = 0
for o in casters:
    o.data.materials.clear(); o.data.materials.append(grey); tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
print(f"{len(casters)} casters, {tris} tris")

R = a.rr
bpy.ops.mesh.primitive_plane_add(size=2 * R, location=(0, 0, 0)); g = bpy.context.object; g.name = "Ground"
for l in g.data.uv_layers.active.data: pass
uv = g.data.uv_layers.active.data
for poly in g.data.polygons:
    for li in poly.loop_indices:
        co = g.data.vertices[g.data.loops[li].vertex_index].co; uv[li].uv = (co.x / (2 * R) + 0.5, co.y / (2 * R) + 0.5)
gm = bpy.data.materials.new("ground"); gm.use_nodes = True; nt = gm.node_tree
nt.nodes["Principled BSDF"].inputs["Base Color"].default_value = (1, 1, 1, 1); nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
img = bpy.data.images.new("shadow", a.size, a.size, float_buffer=True)
tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = img; nt.nodes.active = tn
g.data.materials.append(gm)

d = Vector((-4, -3, 10)).normalized()                       # toward the sun, page (-4, 10, 3)
sun = bpy.data.lights.new("Sun", "SUN"); sun.energy = a.sun; sun.angle = math.radians(a.sun_angle)
so = bpy.data.objects.new("Sun", sun); sc.collection.objects.link(so); so.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
w = bpy.data.worlds.new("sky"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = a.sky; sc.world = w

for o in sc.objects: o.select_set(False)
g.select_set(True); bpy.context.view_layer.objects.active = g
t = time.time()
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=0)
print(f"baked {a.size}^2 x {a.samples} in {time.time() - t:.0f} s")

px = np.array(img.pixels[:], dtype=np.float32).reshape(a.size, a.size, 4)[..., :3].mean(-1)   # row 0 = Blender y -R = page z +R
open_ = np.percentile(px, 99.5)                              # open ground, nothing over it
sh = np.clip(1 - px / open_, 0, 1)
sh = sh[::-1]                                                # row 0 = page z -R
from PIL import Image
Image.fromarray((sh * 255 + 0.5).astype(np.uint8), "L").save(dst, optimize=True)
print(f"open-ground light {open_:.3f}; shadow mean {sh.mean():.3f} max {sh.max():.2f} -> {dst} ({os.path.getsize(dst) // 1024} KB)")
