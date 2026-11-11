"""
The campfire and the kettle over it for the Canopy Camp game (apps/canopy-prototype/camp.html), rebuilt as options to
pick from (2026-11-11, Adriaen: the old fire and kettle needed rework):

    fires     teepee   split logs leaning together in a cone over a bed of ash and embers
              cabin    a log-cabin crib of four layers with kindling leaning inside it
              star     five long logs pushed in to the middle from all round, their ends burnt down
    kettles   classic  a round-bellied camp kettle with a lid, a curved spout and a wire bail
              pot      a squat cast-iron pot with a lid and a bail
              billy    a tall tin billy can with a lid and a wire bail

Every fire has the same ring of sooty stones; every kettle hangs from the bamboo tripod (the one Adriaen picked) on a
cord and a hook, with its steam point at x = 0.2, z = 0.97 (three.js (0.2, 0.97, 0); the page passes it to atmosphere.js for the steam).

    .venv/bin/python props/lived/build_fire.py

One GLB (props/lived/fire.glb) with objects Ring, Tripod, Fire_<style>, Embers_<style> and Kettle_<style>, each at
the fire's origin, z up (three.js y up). Embers are drawn unlit on the page so they glow; the flames are animated cards
made on the page. Same baked light as the other props (AO times base colour in a colour attribute).
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
import build_lived  # noqa: E402  (also sets the light densify for bake)
from build_camp import (apply_all, bake, bamboo, box, cyl, join, mat, reset, rod, rough_up, torus, _finish)  # noqa: E402

rng = random.Random(23)
FIRES = ("teepee", "cabin", "star")
KETTLES = ("classic", "pot", "billy")
SPOUT = Vector((0.2, 0.0, 0.97))
LIFT = 0.3                             # kettles hang this much higher than the old one, clear of the flames
TOP = Vector((0.0, 0.0, 1.3))          # where the tripod legs meet


def materials():
    return {k: mat(f"fi_{k}", c) for k, c in dict(
        stone=(0.36, 0.35, 0.33), stone2=(0.28, 0.27, 0.26), soot=(0.12, 0.1, 0.09), ash=(0.42, 0.4, 0.37), char=(0.07, 0.055, 0.045),
        bark=(0.3, 0.21, 0.14), wood=(0.66, 0.5, 0.34), ember=(0.95, 0.28, 0.04), ember2=(1.0, 0.5, 0.08),
        bamboo=(0.72, 0.68, 0.36), node=(0.52, 0.48, 0.24), rope=(0.7, 0.6, 0.4),
        iron=(0.13, 0.13, 0.14), iron2=(0.22, 0.22, 0.23), copper=(0.62, 0.36, 0.2), tin=(0.46, 0.47, 0.48), tin2=(0.34, 0.35, 0.36),
        wood_knob=(0.42, 0.28, 0.16)).items()}


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
        p.append(rod(foot, TOP, 0.03, M["bamboo"], verts=8))
        for k in (1, 2, 3):
            q = foot.lerp(TOP, k / 4)
            n = cyl(0.034, 0.014, at=q, m=M["node"], verts=8)
            n.rotation_mode = "QUATERNION"
            n.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(TOP - foot)
            p.append(n)
    for i in range(3):                                             # a lashing where the legs cross
        p.append(torus(0.045, 0.01, at=(0, 0, TOP.z - 0.05 - i * 0.025), m=M["rope"], major=10, minor=4))
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


def fire(style, M):
    p = []
    if style == "teepee":
        for i in range(7):
            a = i / 7 * 2 * math.pi + rng.uniform(-0.15, 0.15)
            r0 = rng.uniform(0.3, 0.38)
            p += log((math.cos(a) * r0, math.sin(a) * r0, 0.02), (math.cos(a + 0.25) * 0.05, math.sin(a + 0.25) * 0.05, rng.uniform(0.5, 0.58)),
                     rng.uniform(0.035, 0.045), M, burnt=0.45)
        for i in range(5):                                         # kindling sticks between them
            a = i / 5 * 2 * math.pi + 0.5
            p += log((math.cos(a) * 0.22, math.sin(a) * 0.22, 0.03), (0, 0, 0.38), 0.014, M, burnt=0.5, verts=5)
        em = embers(12, 0.22, M)
    elif style == "cabin":
        z, w = 0.04, 0.42
        for layer in range(4):
            for s in (-1, 1):
                if layer % 2 == 0:
                    a, b = (-w / 2 - 0.08, s * w / 2, z), (w / 2 + 0.08, s * w / 2, z)
                else:
                    a, b = (s * w / 2, -w / 2 - 0.08, z), (s * w / 2, w / 2 + 0.08, z)
                p += log(a, b, 0.04, M, burnt=0)
                p.append(rod(Vector(a).lerp(Vector(b), 0.3), Vector(a).lerp(Vector(b), 0.7), 0.041, M["char"], verts=7))   # charred inside
            z += 0.075
            w -= 0.05
        for i in range(5):
            a = i / 5 * 2 * math.pi
            p += log((math.cos(a) * 0.13, math.sin(a) * 0.13, 0.03), (0, 0, 0.36), 0.016, M, burnt=0.55, verts=5)
        em = embers(10, 0.16, M)
    else:                                                          # star
        for i in range(5):
            a = i / 5 * 2 * math.pi + 0.3
            p += log((math.cos(a) * 0.75, math.sin(a) * 0.75, 0.06), (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.09), rng.uniform(0.05, 0.06), M, burnt=0.3)
        for i in range(3):
            a = i / 3 * 2 * math.pi + 1
            p += log((math.cos(a) * 0.2, math.sin(a) * 0.2, 0.05), (math.cos(a + 2) * 0.12, math.sin(a + 2) * 0.12, 0.12), 0.025, M, burnt=0.8, verts=5)
        em = embers(14, 0.26, M)
    return join(p, f"Fire_{style}"), join(em, f"Embers_{style}")


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


def hang(top_of_bail, M):
    """The cord from the tripod top down to an S-hook through the bail."""
    hook = top_of_bail + Vector((0, 0, 0.035))
    p = [rod(TOP + Vector((0, 0, -0.06)), hook + Vector((0, 0, 0.03)), 0.005, M["rope"], verts=4)]
    p.append(torus(0.02, 0.004, at=hook, rot=(math.pi / 2, 0, 0), m=M["iron"], major=10, minor=3))
    return p


def kettle(style, M):
    p = []
    if style == "classic":
        prof = [(0.0, 0.0), (0.1, 0.0), (0.125, 0.03), (0.13, 0.07), (0.115, 0.115), (0.075, 0.145), (0.06, 0.15)]
        body = lathe(prof, 16, M["copper"], z0=0.47 + LIFT)
        p.append(body)
        p.append(lathe([(0.0, 0.17), (0.035, 0.165), (0.062, 0.15)], 16, M["iron2"], z0=0.47 + LIFT))            # lid
        p.append(lathe([(0.0, 0.2), (0.015, 0.195), (0.012, 0.17)], 8, M["wood_knob"], z0=0.47 + LIFT))            # knob
        a, c = Vector((0.11, 0, 0.51 + LIFT)), Vector((0.17, 0, 0.58 + LIFT))
        p += curve_rod([a, Vector((0.15, 0, 0.53 + LIFT)), c, SPOUT], 0.022, 0.011, M["copper"])
        wires, peak = bail(0.12, 0.6 + LIFT, 0.13, M["iron"])
        p += wires
        for s in (-1, 1):
            p.append(cyl(0.012, 0.02, at=(0, s * 0.122, 0.6 + LIFT), rot=(math.pi / 2, 0, 0), m=M["copper"], verts=6))
    elif style == "pot":
        prof = [(0.0, 0.0), (0.09, 0.0), (0.15, 0.04), (0.165, 0.09), (0.155, 0.14), (0.165, 0.15), (0.165, 0.16)]
        p.append(lathe(prof, 16, M["iron"], z0=0.45 + LIFT))
        p.append(lathe([(0.0, 0.18), (0.08, 0.175), (0.17, 0.16)], 16, M["iron2"], z0=0.45 + LIFT))
        p.append(torus(0.025, 0.006, at=(0, 0, 0.45 + LIFT + 0.19), rot=(math.pi / 2, 0, 0), m=M["iron"], major=10, minor=4))   # lid handle
        for k in range(3):                                            # three stubby feet
            a = k / 3 * 2 * math.pi
            p.append(cyl(0.015, 0.03, at=(math.cos(a) * 0.08, math.sin(a) * 0.08, 0.45 + LIFT), m=M["iron"], verts=6))
        p.append(cyl(0.012, 0.02, at=(0.172, 0, 0.62 + LIFT), rot=(0, math.pi / 2, 0), m=M["iron"], verts=6))   # the lid's steam notch, at SPOUT
        wires, peak = bail(0.175, 0.6 + LIFT, 0.17, M["iron"], r=0.006)
        p += wires
        for s in (-1, 1):
            p.append(box((0.03, 0.02, 0.03), at=(0, s * 0.168, 0.6 + LIFT), m=M["iron"]))
    else:                                                             # billy
        prof = [(0.0, 0.0), (0.095, 0.0), (0.1, 0.005), (0.1, 0.17), (0.106, 0.175)]
        p.append(lathe(prof, 14, M["tin"], z0=0.47 + LIFT))
        for z in (0.04, 0.13):                                        # rolled ridges
            p.append(torus(0.101, 0.004, at=(0, 0, 0.47 + LIFT + z), m=M["tin2"], major=14, minor=3))
        p.append(lathe([(0.0, 0.19), (0.1, 0.18), (0.108, 0.17)], 14, M["tin2"], z0=0.47 + LIFT))
        p.append(rod((0.12, 0, 0.66 + LIFT), SPOUT + Vector((0.01, 0, 0.0)), 0.006, M["tin2"], verts=4))        # the lid's little lip, at SPOUT
        wires, peak = bail(0.105, 0.63 + LIFT, 0.15, M["iron"], r=0.004)
        p += wires
    p += hang(peak, M)
    return join(p, f"Kettle_{style}")


def build(samples=32):
    reset()
    M = materials()
    objs = [ring(M), tripod(M)]
    for f in FIRES:
        objs += fire(f, M)
    for k in KETTLES:
        objs.append(kettle(k, M))
    for o in objs:
        apply_all(o)
        o.location = (0, 0, 0)
    # bake each set on its own, so the hidden options don't shade each other
    for o in objs:
        o.hide_render = True
    def bake_set(group):
        for o in objs:
            o.hide_render = o not in group
        bake(group, samples)
    ring_o, trip = objs[0], objs[1]
    bake_set([ring_o, trip, *[o for o in objs if o.name in ("Fire_teepee", "Embers_teepee")]])
    for f in ("cabin", "star"):
        bake_set([o for o in objs if o.name in (f"Fire_{f}", f"Embers_{f}")])
    bake_set([o for o in objs if o.name.startswith("Kettle_")])
    for o in objs:
        o.hide_render = False
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
    path = os.path.join(HERE, "fire.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=False)
    for o in objs:
        print(f"  {o.name}: {sum(len(pl.vertices) - 2 for pl in o.data.polygons)} triangles")
    print(f"fire: {os.path.getsize(path) // 1024} KB -> {path}")


if __name__ == "__main__":
    build()
