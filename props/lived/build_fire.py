"""
The campfire and the soup pot over it for the Canopy Camp game (apps/canopy-prototype/camp.html), rebuilt 2026-11-11.
Adriaen picked from three fires and three kettles (the others are in git history, commit b1fe846):

    fire   teepee: split logs leaning together in a cone over a bed of ash and embers, in a ring of sooty stones
    pot    a squat cast-iron pot with no lid, full of a chunky tomato and veg soup, on a wire bail
    chain  hangs the pot's bail from the bamboo tripod's lashing: one quad per link, the planes turning ZX / ZY / ZX ...,
           with a drawn ring texture (chain_link.png, alpha cut on the page) instead of modelled rings

    .venv/bin/python props/lived/build_fire.py

One GLB (props/lived/fire.glb) with objects Ring, Tripod, Fire, Embers, Pot and Chain, each at the fire's origin, z up
(three.js y up). Embers are drawn unlit on the page so they glow; the flames are animated cards made on the page. Same
baked light as the other props (AO times base colour in a colour attribute), except the chain, which only carries its
texture. The soup's middle, where the page puffs steam, is SOUP (three.js (0, y, 0)).
"""
import math
import os
import random
import sys

import bpy
import bmesh  # noqa: E402
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "camp"))
import build_lived  # noqa: E402  (shared helpers; its light densify is replaced below)
import build_camp  # noqa: E402
from build_camp import (apply_all, bake, bamboo, box, cyl, join, mat, reset, rod, rough_up, torus, _finish)  # noqa: E402

build_camp.densify = apply_all          # no face splitting for the AO bake: the fire and pot are small enough that the plain faces shade fine

rng = random.Random(23)
LIFT = 0.3                             # the pot hangs this much higher than the old kettle, clear of the flames
POT_Z = 0.45 + LIFT                    # the pot's base
SOUP = Vector((0.0, 0.0, POT_Z + 0.135))   # the soup's surface, middle
TOP = Vector((0.0, 0.0, 1.3))          # where the tripod legs meet


def materials():
    return {k: mat(f"fi_{k}", c) for k, c in dict(
        stone=(0.36, 0.35, 0.33), stone2=(0.28, 0.27, 0.26), soot=(0.12, 0.1, 0.09), ash=(0.42, 0.4, 0.37), char=(0.07, 0.055, 0.045),
        bark=(0.3, 0.21, 0.14), wood=(0.66, 0.5, 0.34), ember=(0.95, 0.28, 0.04), ember2=(1.0, 0.5, 0.08),
        bamboo=(0.72, 0.68, 0.36), node=(0.52, 0.48, 0.24), rope=(0.7, 0.6, 0.4),
        iron=(0.13, 0.13, 0.14), iron2=(0.22, 0.22, 0.23), copper=(0.62, 0.36, 0.2), tin=(0.46, 0.47, 0.48), tin2=(0.34, 0.35, 0.36),
        soup=(0.78, 0.3, 0.1), soup2=(0.86, 0.42, 0.14), carrot=(0.95, 0.5, 0.1), pea=(0.4, 0.62, 0.18),
        potato=(0.88, 0.8, 0.55), herb=(0.25, 0.45, 0.12)).items()}


def stone(r, at, scale, m):
    """A low-poly fire stone: an ico sphere with one subdivision, pushed about, its top half flattened a little."""
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=1, location=at)
    o = bpy.context.object
    o.scale = scale
    for v in o.data.vertices:
        n = v.co.normalized()
        v.co *= 1 + 0.28 * (0.5 * math.sin(n.x * 5.1 + n.y * 3.3) + 0.3 * math.sin(n.y * 7.7 - n.z * 4.1) + 0.2 * rng.uniform(-1, 1))
        if v.co.z > 0:
            v.co.z *= 0.8
    return _finish(o, m)


def log(a, b, r, M, burnt=0.35, verts=7):
    """A log from a to b: bark, with the last `burnt` of its length (toward b) charred, and pale sawn ends."""
    a, b = Vector(a), Vector(b)
    k = a.lerp(b, 1 - burnt)
    parts = [rough_up(rod(a, k, r, M["bark"], verts=verts), 0.004, 14)]
    if burnt:
        parts.append(rod(k, b, r * 0.86, M["char"], verts=verts))
    return parts


def ring(M):
    """The ring of stones (sooty on the inside) and the ash bed inside it, shared by all fires."""
    p = []
    for i in range(11):
        a = i / 11 * 2 * math.pi + rng.uniform(-0.08, 0.08)
        s = stone(0.14, (math.cos(a) * 0.62, math.sin(a) * 0.62, 0.05), (rng.uniform(1.1, 1.4), rng.uniform(0.85, 1.05), rng.uniform(0.6, 0.85)),
                  M["stone" if i % 3 else "stone2"])
        s.rotation_euler.z = a
        p.append(s)
    for i in range(7):                                             # soot smudges on the stones' inner faces
        a = i / 7 * 2 * math.pi + 0.2
        p.append(stone(0.07, (math.cos(a) * 0.51, math.sin(a) * 0.51, 0.06), (0.7, 1.2, 0.6), M["soot"]))
    bpy.ops.mesh.primitive_circle_add(vertices=20, radius=0.5, fill_type="TRIFAN", location=(0, 0, 0.012))
    ash = _finish(bpy.context.object, M["ash"], smooth=False)
    for v in ash.data.vertices:                                    # a gentle mound
        v.co.z += 0.03 * (1 - min(1, Vector((v.co.x, v.co.y, 0)).length / 0.5))
    p.append(ash)
    bpy.ops.mesh.primitive_circle_add(vertices=14, radius=0.3, fill_type="TRIFAN", location=(0, 0, 0.03))
    p.append(_finish(bpy.context.object, M["char"], smooth=False))
    return join(p, "Ring")


def tripod(M):
    p = []
    for i in range(3):                                             # bamboo legs, with a slim ring at each node
        a = i / 3 * 2 * math.pi + 0.3
        foot = Vector((math.cos(a) * 0.75, math.sin(a) * 0.75, 0))
        p.append(rod(foot, TOP, 0.03, M["bamboo"], verts=6))
        for k in (1, 2, 3):
            q = foot.lerp(TOP, k / 4)
            n = cyl(0.034, 0.014, at=q, m=M["node"], verts=6)
            n.rotation_mode = "QUATERNION"
            n.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(TOP - foot)
            p.append(n)
    for i in range(3):                                             # a lashing where the legs cross
        p.append(torus(0.045, 0.01, at=(0, 0, TOP.z - 0.05 - i * 0.025), m=M["rope"], major=8, minor=3))
    return join(p, "Tripod")


def embers(n, spread, M, z=0.04):
    p = []
    for i in range(n):
        a, d = rng.uniform(0, 2 * math.pi), spread * math.sqrt(rng.uniform(0, 1))
        bpy.ops.mesh.primitive_ico_sphere_add(radius=rng.uniform(0.025, 0.045), subdivisions=1, location=(math.cos(a) * d, math.sin(a) * d, z))
        o = bpy.context.object
        o.scale = (1, rng.uniform(0.7, 1.2), 0.6)
        p.append(_finish(o, M["ember" if i % 3 else "ember2"], smooth=False))
    return p


def fire(M):
    """The teepee: seven split logs leaning together, kindling between them, embers in the ash."""
    p = []
    for i in range(7):
        a = i / 7 * 2 * math.pi + rng.uniform(-0.15, 0.15)
        r0 = rng.uniform(0.3, 0.38)
        p += log((math.cos(a) * r0, math.sin(a) * r0, 0.02), (math.cos(a + 0.25) * 0.05, math.sin(a + 0.25) * 0.05, rng.uniform(0.5, 0.58)),
                 rng.uniform(0.035, 0.045), M, burnt=0.45)
    for i in range(5):                                             # kindling sticks between them
        a = i / 5 * 2 * math.pi + 0.5
        p += log((math.cos(a) * 0.22, math.sin(a) * 0.22, 0.03), (0, 0, 0.38), 0.014, M, burnt=0.5, verts=5)
    em = embers(12, 0.22, M)
    return join(p, "Fire"), join(em, "Embers")


def lathe(profile, segs, m, z0=0.0):
    """Spin a (radius, z) profile round the z axis into a closed-ish body."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z0 + z)) for r, z in profile]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=segs, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    me = bpy.data.meshes.new("lathe")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("lathe", me)
    bpy.context.collection.objects.link(o)
    return _finish(o, m)


def curve_rod(pts, r0, r1, m, verts=8):
    """A tapering tube along a few points (a spout)."""
    parts = []
    for i in range(len(pts) - 1):
        t = i / (len(pts) - 1)
        parts.append(rod(pts[i], pts[i + 1], r0 + (r1 - r0) * t, m, verts=verts))
    return parts


def bail(half_w, z_pivot, rise, m, r=0.005):
    """A wire bail: an arch from one side lug (y = -half_w) over the top to the other, peaking `rise` above the lugs."""
    pts = [Vector((0, -half_w * math.cos(t), z_pivot + rise * math.sin(t))) for t in [k / 10 * math.pi for k in range(11)]]
    return [rod(pts[i], pts[i + 1], r, m, verts=4) for i in range(10)], pts[5]


def pot(M):
    """The open iron pot: a lathed body with a rolled rim and an inside wall, the soup surface with chunks in it, three feet,
    two lugs and the bail. Returns the pot and the top of the bail (where the chain hooks on)."""
    prof = [(0.0, 0.0), (0.09, 0.0), (0.15, 0.04), (0.165, 0.09), (0.158, 0.14), (0.168, 0.152), (0.166, 0.162),   # outside up to the rim
            (0.152, 0.158), (0.146, 0.12)]                                                                      # over the lip, down the inside
    p = [lathe(prof, 16, M["iron"], z0=POT_Z)]
    soup = lathe([(0.0, SOUP.z - POT_Z), (0.147, SOUP.z - POT_Z - 0.004)], 16, M["soup"], z0=POT_Z)
    p.append(soup)
    for i in range(9):                                             # chunks bobbing in it: carrot coins, potato cubes, peas, herbs
        a, d = rng.uniform(0, 2 * math.pi), 0.11 * math.sqrt(rng.uniform(0.05, 1))
        at = (math.cos(a) * d, math.sin(a) * d, SOUP.z + 0.002)
        kind = ("carrot", "potato", "pea", "carrot", "potato", "herb", "pea", "carrot", "herb")[i]
        if kind == "carrot":
            o = cyl(0.018, 0.008, at=at, m=M["carrot"], verts=6)
            o.rotation_euler = (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0)
        elif kind == "potato":
            o = box((0.024, 0.022, 0.016), at=at, m=M["potato"])
            o.rotation_euler = (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 3))
        elif kind == "pea":
            bpy.ops.mesh.primitive_ico_sphere_add(radius=0.009, subdivisions=1, location=at)
            o = _finish(bpy.context.object, M["pea"], smooth=False)
        else:
            o = box((0.022, 0.008, 0.003), at=(at[0], at[1], at[2] + 0.001), m=M["herb"])
            o.rotation_euler.z = rng.uniform(0, 3)
        p.append(o)
    for k in range(4):                                             # a few lighter swirls on the surface
        a = k / 4 * 2 * math.pi + 0.4
        bpy.ops.mesh.primitive_circle_add(vertices=6, radius=0.022, fill_type="TRIFAN", location=(math.cos(a) * 0.07, math.sin(a) * 0.07, SOUP.z + 0.001))
        o = bpy.context.object
        o.scale = (1.6, 0.7, 1)
        o.rotation_euler.z = a + 1.2
        p.append(_finish(o, M["soup2"], smooth=False))
    for k in range(3):                                             # three stubby feet
        a = k / 3 * 2 * math.pi
        p.append(cyl(0.015, 0.03, at=(math.cos(a) * 0.08, math.sin(a) * 0.08, POT_Z), m=M["iron"], verts=6))
    pivot = POT_Z + 0.15
    wires, peak = bail(0.175, pivot, 0.17, M["iron"], r=0.006)
    p += wires
    for s in (-1, 1):                                              # the lugs the bail turns in
        p.append(box((0.03, 0.02, 0.03), at=(0, s * 0.168, pivot), m=M["iron"]))
    return join(p, "Pot"), peak


def link_texture(path):
    """One chain link, drawn: a dark iron oval ring with a highlight, on transparent (the page cuts it with alphaTest)."""
    from PIL import Image, ImageDraw
    W, H, k = 64, 128, 4                                           # drawn 4x and scaled down, for smooth edges
    im = Image.new("RGBA", (W * k, H * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    t = 11 * k                                                     # wire thickness
    d.rounded_rectangle((2 * k, 2 * k, (W - 2) * k, (H - 2) * k), radius=(W - 4) * k // 2, outline=(34, 33, 35, 255), width=t)
    d.rounded_rectangle((5 * k, 5 * k, (W - 5) * k, (H - 5) * k), radius=(W - 10) * k // 2, outline=(92, 90, 92, 255), width=3 * k)   # highlight
    im.resize((W, H), Image.LANCZOS).save(path)
    return 2 / H, 13 / H                                           # the outer and inner edge of the wire, as fractions of the height


def chain(bottom, top):
    """Links from the bail's top (`bottom`) up to the tripod lashing (`top`): each one a quad, turning a quarter between
    ZX and ZY, overlapping so each link's end sits through the next one's eye. The bottom link (ZX) hangs through the bail
    wire, which runs along y at its peak, so the wire passes through the link's hole."""
    tex_path = os.path.join(HERE, "chain_link.png")
    edge, inner = link_texture(tex_path)
    LW, LH = 0.02, 0.04                                            # one link's quad
    pitch = LH * (1 - 2 * inner) + 0.004                           # links overlap by their wire
    z0 = bottom.z - LH * inner - 0.004                             # the bottom link's lower inside edge sits on the wire
    n = max(2, round((top.z - z0 - LH) / pitch) + 1)
    pitch = (top.z - z0 - LH) / (n - 1)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for i in range(n):
        zb, zt = z0 + i * pitch, z0 + i * pitch + LH
        ax = Vector((1, 0, 0)) if i % 2 == 0 else Vector((0, 1, 0))
        c = [bm.verts.new(v) for v in (-ax * LW / 2 + Vector((0, 0, zb)), ax * LW / 2 + Vector((0, 0, zb)),
                                       ax * LW / 2 + Vector((0, 0, zt)), -ax * LW / 2 + Vector((0, 0, zt)))]
        f = bm.faces.new(c)
        for l, u in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            l[uv].uv = u
    me = bpy.data.meshes.new("Chain")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("Chain", me)
    bpy.context.collection.objects.link(o)
    m = bpy.data.materials.new("Chain")
    m.use_nodes = True
    tx = m.node_tree.nodes.new("ShaderNodeTexImage")
    tx.image = bpy.data.images.load(tex_path)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    m.node_tree.links.new(tx.outputs["Color"], bsdf.inputs["Base Color"])
    m.node_tree.links.new(tx.outputs["Alpha"], bsdf.inputs["Alpha"])
    me.materials.append(m)
    return o


def build(samples=32):
    reset()
    M = materials()
    ring_o, trip = ring(M), tripod(M)
    fire_o, emb = fire(M)
    pot_o, peak = pot(M)
    objs = [ring_o, trip, fire_o, emb, pot_o]
    for o in objs:
        apply_all(o)
        o.location = (0, 0, 0)
    bake(objs, samples)
    for o in objs:
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
    ch = chain(peak + Vector((0, 0, 0.006)), TOP - Vector((0, 0, 0.03)))   # up into the lashed crossing of the legs
    objs.append(ch)
    path = os.path.join(HERE, "fire.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=True,
                              export_image_format="AUTO")
    for o in objs:
        print(f"  {o.name}: {sum(len(pl.vertices) - 2 for pl in o.data.polygons)} triangles")
    print(f"soup surface (three.js): (0, {SOUP.z:.3f}, 0)")
    print(f"fire: {os.path.getsize(path) // 1024} KB -> {path}")


if __name__ == "__main__":
    build()
