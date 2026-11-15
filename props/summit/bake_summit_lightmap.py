"""
Summit Cabin light maps (Adriaen 2026-11-15: bake the summit's light maps before PR 1). Run through props/bake_all.py
--only summit, which first runs props/summit/export_summit.cjs; the GPU thread runs the bakes.

    blender -b --python props/summit/bake_summit_lightmap.py -- [--samples 512] [--preview] [--out DIR] [--device auto]

It reads props/summit/summit_static.glb (the cabin's and lookout's lit meshes, R_<name>, with their light-map UVs from the
page's own packer, summit/lightmap.js; and the occluders, O_<name>: posts, legs, the other meshes and the ground round them)
and props/summit/summit_layout.json (the atlas size, the meshes' signature and the night lights: cabin.js bakeSources), and
bakes two maps into the receivers' atlas:
  AO     sky occlusion within 4 m (Cycles' AO bake): the page's aoMap, which darkens only the sky light
  night  the warm light of the windows and the door (area lights over them), the porch lamp, the light inside and the scout
         camp's fire (points), direct and one more bounce, the world dark: the page's lightMap after dark. It is divided by
         its 99.5th percentile to fill the PNG; that scale goes in summit_lm.json
and writes, to apps/canopy-prototype/models (or --out):
  summit_lm_ao_2k.png, summit_lm_ao_1k.png         grey, linear
  summit_lm_night_2k.png, summit_lm_night_1k.png   RGB, sRGB-encoded (the page reads them as sRGB)
  summit_lm.json                                   { size, scale, sig, meshes } (the page checks sig before using the maps)
--preview: a 256-texel atlas and 8 samples on the CPU, to check the set-up in a few seconds; never commit its maps.
"""
import argparse, json, math, os, sys, time
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "props"))
from lib.bake import pick_device  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = {"ao": 128, "night": 512}          # at --samples 512; AO is smooth, the night light has several small lights
ENERGY = {"window": 45.0, "door": 30.0}     # watts a square metre of glowing glass or door
POINT = {"porch": 70.0, "inside": 120.0, "fire": 500.0}   # watts
WARM = (1.0, 0.72, 0.42)


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=int)
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--out", default=os.path.join(ROOT, "apps/canopy-prototype/models"))
    ap.add_argument("--device", default="auto")
    a = ap.parse_args(argv)
    a.samples = a.samples or (8 if a.preview else 512)
    return a


def to_blender(v):
    """three's (and glTF's) y-up coordinates to Blender's z-up ones, as the glTF importer converts the meshes."""
    return Vector((v[0], -v[2], v[1]))


def material(name, c, node_image=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (c, c, c, 1); bsdf.inputs["Roughness"].default_value = 1.0
    if node_image:
        n = m.node_tree.nodes.new("ShaderNodeTexImage"); n.image = node_image; m.node_tree.nodes.active = n
    return m


def add_lights(lights):
    for i, L in enumerate(lights):
        at = to_blender(L["at"])
        if L["kind"] in ENERGY:
            n = to_blender(L["normal"]).normalized()
            d = bpy.data.lights.new(f"glow_{i}", "AREA"); d.shape = "RECTANGLE"; d.size = L["w"]; d.size_y = L["h"]
            d.energy = ENERGY[L["kind"]] * L["w"] * L["h"]; d.color = WARM
            o = bpy.data.objects.new(d.name, d); bpy.context.collection.objects.link(o)
            z = -n                                           # an area light shines along its own -Z
            y = Vector((0, 0, 1)); y = (y - z * y.dot(z)).normalized(); x = y.cross(z)
            o.matrix_world = Matrix.Translation(at + n * 0.05) @ Matrix((x, y, z)).transposed().to_4x4()
        else:
            d = bpy.data.lights.new(f"point_{i}", "POINT"); d.energy = POINT.get(L.get("name"), 100.0); d.shadow_soft_size = 0.15
            c = L["color"].lstrip("#"); d.color = tuple(int(c[k:k + 2], 16) / 255 for k in (0, 2, 4))
            o = bpy.data.objects.new(d.name, d); o.location = at; bpy.context.collection.objects.link(o)


def bake(kind, objs, samples):
    sc = bpy.context.scene; sc.cycles.samples = max(2, samples)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t = time.time(); bpy.ops.object.bake(type=kind)
    print(f"  {kind}: {len(objs)} receivers, {sc.cycles.samples} samples, {time.time() - t:.0f} s", flush=True)


def save(px, path, srgb):
    """px: rows bottom-up (Blender's order), RGB float in 0..1, written as an 8-bit PNG with the values as given (Non-Color),
    sRGB-encoded first when srgb."""
    if srgb:
        px = np.where(px <= 0.0031308, px * 12.92, 1.055 * np.power(np.clip(px, 0.0031308, None), 1 / 2.4) - 0.055)
    h, w = px.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    rgba = np.ones((h, w, 4), np.float32); rgba[..., :3] = np.clip(px, 0, 1)
    img.pixels.foreach_set(rgba.ravel()); img.filepath_raw = path; img.file_format = "PNG"; img.save()
    bpy.data.images.remove(img)
    print(f"  {os.path.relpath(path, ROOT)}: {w}x{h}, {os.path.getsize(path) // 1024} KB", flush=True)


def half(px):
    return px.reshape(px.shape[0] // 2, 2, px.shape[1] // 2, 2, -1).mean((1, 3))


def main():
    a = args()
    lay = json.load(open(os.path.join(HERE, "summit_layout.json")))
    size = 256 if a.preview else lay["size"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, "summit_static.glb"))
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    rec = [o for o in objs if o.name.startswith("R_")]
    missing = set(lay["meshes"]) - {o.name[2:] for o in rec}
    if missing:
        sys.exit(f"summit_static.glb lacks receivers {sorted(missing)}: export again (bake_all.py --only summit)")
    target = bpy.data.images.new("lm", size, size, alpha=False, float_buffer=True)
    rm = material("receiver", 0.6, target); om = material("occluder", 0.75)   # the snow and the logs, a middle grey for the bounce
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(rm if o in rec else om)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.use_adaptive_sampling = False; sc.cycles.max_bounces = 3; sc.cycles.diffuse_bounces = 2
    pick_device(sc, "cpu" if a.preview else a.device)
    bk = sc.render.bake; bk.target = "IMAGE_TEXTURES"; bk.margin = 3; bk.use_clear = True
    bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False
    world = bpy.data.worlds.new("sky"); sc.world = world; world.use_nodes = True
    world.light_settings.distance = 4.0                  # AO: what lies within 4 m darkens the sky
    bg = world.node_tree.nodes["Background"]
    buf = np.empty(size * size * 4, np.float32)
    read = lambda: (target.pixels.foreach_get(buf), buf.reshape(size, size, 4)[..., :3].copy())[1]

    bg.inputs["Strength"].default_value = 1.0
    bake("AO", rec, round(SAMPLES["ao"] * a.samples / 512))
    ao = read()[..., :1].repeat(3, -1)
    bg.inputs["Strength"].default_value = 0.0
    add_lights(lay["lights"])
    bake("DIFFUSE", rec, round(SAMPLES["night"] * a.samples / 512))
    night = read()
    lit = night.max(-1); scale = float(np.percentile(lit[lit > 1e-5], 99.5)) if (lit > 1e-5).any() else 1.0
    night = night / scale

    os.makedirs(a.out, exist_ok=True)
    names = [(f"{size / 1024:g}k", 1)] + ([("1k", 2)] if size == 2048 else [])   # the page loads <size>k, and 1k on phones
    for tag, f in names:
        save(ao if f == 1 else half(ao), os.path.join(a.out, f"summit_lm_ao_{tag}.png"), False)
        save(night if f == 1 else half(night), os.path.join(a.out, f"summit_lm_night_{tag}.png"), True)
    json.dump({"size": size, "scale": round(scale, 5), "sig": lay["sig"], "meshes": lay["meshes"]},
              open(os.path.join(a.out, "summit_lm.json"), "w"), indent=1)
    print(f"  night scale {scale:.4g}; done", flush=True)


main()
