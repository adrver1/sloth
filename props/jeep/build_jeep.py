"""
The adventure jeep for the Canopy Camp game (apps/canopy-prototype/camp.html): an original small boxy off-roader
(short, upright, round headlights, spare wheel on the back door), parked in the clearing. Three styles to pick from:

    toy         chunky and rounded like the storybook props: mint and cream, big soft wheels, a wicker roof basket
    expedition  closer to real, to sit with the rustic props: olive paint, black flares, roof rack with jerry cans,
                snorkel, winch, mud up the sills
    camper      a camping rig: sand paint, a rooftop tent folded open over the side with a ladder to the ground

    .venv/bin/python props/jeep/build_jeep.py                       # all three, plus a preview still of each
    .venv/bin/python props/jeep/build_jeep.py --style camper --samples 64 --no-preview

Each style is one GLB (props/jeep/jeep_<style>.glb) holding one object, Jeep, standing on z = 0 with its front toward
-Y (three.js +Z), the same convention and the same baked light as props/camp/build_camp.py, whose helpers it reuses:
Cycles AO times base colour in one colour attribute, drawn with a plain Lambert material on the page.
Previews go to props/jeep/preview_<style>.png and preview_all.png.
"""
import argparse
import math
import os
import sys

import bpy
import bmesh  # noqa: E402  (needs bpy loaded first)
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "camp"))
import build_camp  # noqa: E402
from build_camp import (apply_all, ball, bake, box, cyl, join, mat, reset, rod, torus, _finish)  # noqa: E402


def densify(o, area=0.02, edge=0.12, rounds=3):
    """Split only the big faces, so the baked AO has vertices to vary on the body panels without tripling the
    count on small parts (the camp version splits every long edge, which costs 6x here)."""
    apply_all(o)
    for _ in range(rounds):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        edges = {e for f in bm.faces if f.calc_area() > area for e in f.edges if e.calc_length() > edge}
        if edges:
            bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=1, use_grid_fill=True)
        bm.to_mesh(o.data)
        bm.free()
        if not edges:
            break


build_camp.densify = densify       # bake() below calls it

STYLES = ("toy", "expedition", "camper")

# shared proportions (metres): short, tall and narrow
WB = 2.25            # wheelbase
FRONT, REAR = -1.62, 1.62
W = 1.6              # body width
SILL = 0.45          # bottom of the body
BELT = 1.06          # beltline: hood top and window sills
ROOF = 1.70


# ------------------------------------------------------------------ helpers
def prism(poly_yz, width, m, taper=1.0, x0=0.0):
    """A solid from a profile in the YZ plane, extruded across X (width), optionally narrower at the top."""
    zs = [z for _, z in poly_yz]
    zlo, zhi = min(zs), max(zs)
    n = len(poly_yz)
    verts = []
    for s in (-1, 1):
        for y, z in poly_yz:
            k = 1 + (taper - 1) * (z - zlo) / max(1e-6, zhi - zlo)
            verts.append((x0 + s * width / 2 * k, y, z))
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    me = bpy.data.meshes.new("prism")
    me.from_pydata(verts, [], faces)
    me.validate()
    o = bpy.data.objects.new("prism", me)
    bpy.context.collection.objects.link(o)
    _finish(o, m, smooth=False)
    me.update()
    outward(o)
    return o


def outward(o):
    """Point the normals out whichever way the faces were wound (the AO bake needs them outward)."""
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def soften(o, w, seg=3):
    apply_all(o)
    mod = o.modifiers.new("b", "BEVEL")
    mod.width, mod.segments, mod.limit_method = w, seg, "ANGLE"
    apply_all(o)
    return o


def cut(o, cutter):
    mod = o.modifiers.new("cut", "BOOLEAN")
    mod.operation, mod.object, mod.solver = "DIFFERENCE", cutter, "EXACT"
    apply_all(o)
    bpy.data.objects.remove(cutter)
    return o


def upper_half(o, z):
    """Keep the part of o above z (used for wheel-arch flares)."""
    apply_all(o)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True, use_fill=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return o


def panel(a, b, c, d, m, t=0.012):
    """A thin flat panel through four corners (a window or a plate), thickness t along its normal."""
    a, b, c, d = map(Vector, (a, b, c, d))
    nrm = (b - a).cross(d - a).normalized() * t / 2
    vs = [a - nrm, b - nrm, c - nrm, d - nrm, a + nrm, b + nrm, c + nrm, d + nrm]
    fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me = bpy.data.meshes.new("panel")
    me.from_pydata([tuple(v) for v in vs], [], fs)
    me.validate()
    o = bpy.data.objects.new("panel", me)
    bpy.context.collection.objects.link(o)
    _finish(o, m, smooth=False)
    outward(o)
    return o


def wheel(x, y, R, Wt, M, chunky=True, axis_x=True):
    """Tyre with tread blocks, a rim and a hub, on an axle along X (or along Y for the spare)."""
    rot = (0, math.pi / 2, 0) if axis_x else (math.pi / 2, 0, 0)
    p = [soften(cyl(R * 0.93, Wt, at=(x, y, 0), rot=rot, m=M["tyre"], verts=28), 0.05 * R / 0.36)]
    nb = 20
    for i in range(nb):
        a = i / nb * 2 * math.pi
        for s in ((-1, 1) if chunky else (0,)):
            off = s * Wt * 0.22
            if axis_x:
                at = (x + off, y + math.cos(a) * R * 0.94, math.sin(a) * R * 0.94)
                b = box((Wt * (0.42 if chunky else 0.9), R * 0.2, R * 0.12), at=at, rot=(a - math.pi / 2 + s * 0.12, 0, 0), m=M["tyre"])
            else:
                at = (x + math.cos(a) * R * 0.94, y + off, math.sin(a) * R * 0.94)
                b = box((R * 0.2, Wt * (0.42 if chunky else 0.9), R * 0.12), at=at, rot=(0, -a + math.pi / 2, 0), m=M["tyre"])
            p.append(b)
    rr = R * 0.58
    if axis_x:
        side = math.copysign(1, x) if x else 1
        p.append(cyl(rr, Wt + 0.012, at=(x, y, 0), rot=rot, m=M["rim"], verts=20))
        p.append(cyl(rr * 0.35, 0.03, at=(x + side * (Wt / 2 + 0.01), y, 0), rot=rot, m=M["hub"], verts=12))
        for k in range(5):
            a = k / 5 * 2 * math.pi
            p.append(cyl(rr * 0.13, 0.02, at=(x + side * (Wt / 2 + 0.008), y + math.cos(a) * rr * 0.66, math.sin(a) * rr * 0.66), rot=rot, m=M["hub"], verts=8))
    else:
        p.append(cyl(rr, Wt + 0.012, at=(x, y, 0), rot=rot, m=M["rim"], verts=20))
    return p


def lift(objs, z):
    for o in objs:
        o.location.z += z
    return objs


def headlight(x, y, z, r, M, ring="chrome"):
    p = [torus(r, r * 0.16, at=(x, y, z), rot=(math.pi / 2, 0, 0), m=M[ring], major=24, minor=6)]
    p.append(ball(r * 0.92, at=(x, y + 0.02, z), scale=(1, 0.35, 1), m=M["lamp"], seg=20))
    return p


# ------------------------------------------------------------------ the shared body
def body(M, style):
    toy = style == "toy"
    R = 0.43 if toy else 0.37
    zc = R                                                    # wheel centre height
    yf, yr = -WB / 2 - 0.03, WB / 2 - 0.03
    p = []
    # lower body: hood and sides up to the beltline, with the wheel arches cut out
    lower = prism([(FRONT, SILL), (REAR, SILL), (REAR, BELT), (-0.42, BELT), (FRONT + 0.06, BELT - 0.05), (FRONT, BELT - 0.12)], W, M["paint"])
    for y in (yf, yr):
        cut(lower, cyl(R + 0.08, W + 0.4, at=(0, y, zc), rot=(0, math.pi / 2, 0), m=M["paint"], verts=32))
    p.append(soften(lower, 0.12 if toy else 0.05))
    # cabin: upright windscreen, flat roof, slightly narrower than the body
    top = M["paint2"]
    cab = prism([(-0.42, BELT - 0.01), (REAR - 0.01, BELT - 0.01), (REAR - 0.03, ROOF), (-0.16, ROOF)], W - 0.04, top, taper=0.93)
    p.append(soften(cab, 0.12 if toy else 0.045))
    # glass: windscreen, side windows split by the B pillar, the rear door window
    g, wt = M["glass"], W / 2 * 0.93 + 0.004
    zt, zb = ROOF - 0.07, BELT + 0.06
    s0 = Vector((0, -0.42, BELT)); s1 = Vector((0, -0.16, ROOF)); up = (s1 - s0).normalized()
    nrm = Vector((0, -up.z, up.y)) * 0.01
    a = s0 + up * 0.07 + nrm; b = s1 - up * 0.06 + nrm
    p.append(panel((-0.64, a.y, a.z), (0.64, a.y, a.z), (0.62, b.y, b.z), (-0.62, b.y, b.z), g))
    for s in (-1, 1):
        def wx(z):  # side of the tapered cabin at height z
            return s * ((W - 0.04) / 2 * (1 - 0.07 * (z - BELT) / (ROOF - BELT)) + 0.008)
        for y0, y1, slant in ((-0.24, 0.52, 0.12), (0.66, 1.48, 0.0)):
            p.append(panel((wx(zb), y0, zb), (wx(zb), y1, zb), (wx(zt), y1, zt), (wx(zt), y0 + slant, zt), g))
        # door seam and handle
        p.append(box((0.006, 0.012, BELT - SILL - 0.08), at=(s * (W / 2 + 0.002), 0.6, (BELT + SILL) / 2), m=M["seam"]))
        p.append(box((0.006, 0.012, BELT - SILL - 0.08), at=(s * (W / 2 + 0.002), -0.34, (BELT + SILL) / 2 - 0.02), m=M["seam"]))
        p.append(box((0.03, 0.14, 0.03), at=(s * (W / 2 + 0.012), 0.45, BELT - 0.12), m=M["trim"], bevel=0.008))
        # mirror on a stalk
        p.append(rod((s * (W / 2 - 0.05), -0.36, BELT + 0.03), (s * (W / 2 + 0.12), -0.4, BELT + 0.13), 0.014, M["trim"]))
        p.append(box((0.07, 0.05, 0.13), at=(s * (W / 2 + 0.15), -0.4, BELT + 0.16), m=M["trim"], bevel=0.015))
    p.append(panel((-0.5, REAR + 0.004, zb + 0.04), (0.5, REAR + 0.004, zb + 0.04), (0.48, REAR + 0.002, zt - 0.02), (-0.48, REAR + 0.002, zt - 0.02), g))
    # roof gutters
    for s in (-1, 1):
        p.append(rod((s * 0.73, -0.12, ROOF - 0.03), (s * 0.73, REAR - 0.05, ROOF - 0.03), 0.012, top, verts=6))
    # wipers, parked along the bottom of the windscreen: a pivot cap on the cowl, an arm, and a rubber blade on the glass
    tilt = -math.atan2(up.y, up.z)                                   # turns a box's Z onto the glass's up direction
    on_glass = lambda x, h, out: Vector((x, 0, 0)) + s0 + up * h + nrm.normalized() * out
    for x in (-0.5, 0.06):
        piv, tip = on_glass(x, 0.03, 0.03), on_glass(x + 0.36, 0.1, 0.03)
        p.append(cyl(0.022, 0.03, at=tuple(on_glass(x, 0.03, 0.012)), rot=(tilt + math.pi / 2, 0, 0), m=M["trim"], verts=10))
        p.append(rod(tuple(piv), tuple(tip), 0.008, M["trim"], verts=6))
        bl = box((0.44, 0.014, 0.022), at=tuple(on_glass(x + 0.3, 0.12, 0.014)), rot=(tilt, 0, 0.0), m=M["trim"])
        bl.rotation_mode = "XYZ"
        p.append(bl)
        p.append(box((0.03, 0.02, 0.03), at=tuple(on_glass(x + 0.36, 0.11, 0.024)), rot=(tilt, 0, 0), m=M["trim"]))   # the clip joining them
    # front: a recessed grille with three bars, round headlights, indicators, bumper
    grille_z = (0.7, 0.95)
    p.append(box((0.82, 0.03, grille_z[1] - grille_z[0]), at=(0, FRONT - 0.005, sum(grille_z) / 2), m=M["grille"], bevel=0.02))
    for k in range(3):                                   # three horizontal bars (its own face, no maker's grille)
        p.append(box((0.78, 0.03, 0.035), at=(0, FRONT - 0.02, grille_z[0] + 0.06 + k * 0.065), m=M["bar"], bevel=0.008))
    hr = 0.15 if toy else 0.115
    for s in (-1, 1):
        p += headlight(s * 0.6, FRONT - 0.03, 0.83, hr, M)
        p.append(box((0.12, 0.03, 0.05), at=(s * 0.6, FRONT - 0.02, 0.62), m=M["amber"], bevel=0.01))
    p.append(box((W + 0.08, 0.2, 0.18), at=(0, FRONT - 0.06, SILL + 0.06), m=M["bumper"], bevel=0.05 if toy else 0.025))
    p.append(box((0.4, 0.02, 0.12), at=(0, FRONT - 0.165, SILL + 0.06), m=M["plate"], bevel=0.01))
    # rear: bumper, tall taillights, the spare wheel on the door
    p.append(box((W + 0.08, 0.2, 0.18), at=(0, REAR + 0.05, SILL + 0.06), m=M["bumper"], bevel=0.05 if toy else 0.025))
    for s in (-1, 1):
        p.append(box((0.09, 0.03, 0.22), at=(s * (W / 2 - 0.08), REAR + 0.01, 0.78), m=M["red"], bevel=0.012))
        p.append(box((0.09, 0.03, 0.06), at=(s * (W / 2 - 0.08), REAR + 0.01, 0.64), m=M["amber"], bevel=0.01))
    p.append(box((0.42, 0.02, 0.12), at=(0, REAR + 0.155, SILL + 0.06), m=M["plate"], bevel=0.01))
    p.append(box((0.03, 0.02, 0.55), at=(-0.58, REAR + 0.01, BELT - 0.2), m=M["trim"]))       # door hinges side
    sr = R * 0.98
    p.append(cyl(0.06, 0.12, at=(0.06, REAR + 0.06, 0.98), rot=(math.pi / 2, 0, 0), m=M["trim"], verts=12))
    p += lift(wheel(0.06, REAR + 0.22, sr, 0.24, M, chunky=not toy, axis_x=False), 0.98)
    cover = M.get("cover")
    if cover:
        p.append(cyl(sr + 0.012, 0.25, at=(0.06, REAR + 0.22, 0.98), rot=(math.pi / 2, 0, 0), m=cover, verts=32))
    # chassis, axles and the four wheels with black flares over them
    p.append(box((W - 0.3, REAR - FRONT - 0.3, 0.2), at=(0, 0, SILL - 0.02), m=M["under"]))
    for y in (yf, yr):
        p.append(rod((-0.7, y, zc), (0.7, y, zc), 0.04, M["under"]))
        for s in (-1, 1):
            p += lift(wheel(s * (W / 2 - 0.1), y, R, 0.27 if toy else 0.25, M, chunky=not toy), zc)
            fl = torus(R + 0.1, 0.06 if toy else 0.045, at=(s * (W / 2 + 0.01), y, zc), rot=(0, math.pi / 2, 0), m=M["flare"], major=32, minor=6)
            apply_all(fl)
            for v in fl.data.vertices:          # widen the torus tube sideways into a flat band
                v.co.x *= 2.2
            p.append(upper_half(fl, zc - 0.12))
    # side steps / sills
    for s in (-1, 1):
        p.append(box((0.06, 0.95, 0.06), at=(s * (W / 2 - 0.01), 0.0, SILL + 0.02), m=M["bumper"], bevel=0.015))
    return p, R


# ------------------------------------------------------------------ the three styles
BASE = dict(glass=(0.11, 0.14, 0.17), seam=(0.08, 0.08, 0.08), trim=(0.1, 0.1, 0.1), grille=(0.05, 0.05, 0.06), lamp=(1.0, 0.96, 0.82),
            chrome=(0.78, 0.79, 0.8), amber=(0.98, 0.58, 0.12), red=(0.75, 0.08, 0.06), plate=(0.92, 0.9, 0.84), under=(0.1, 0.1, 0.1),
            tyre=(0.11, 0.11, 0.11), hub=(0.3, 0.3, 0.32))


def mats(prefix, **over):
    return {k: mat(f"{prefix}_{k}", c) for k, c in {**BASE, **over}.items()}


def toy():
    M = mats("toy", paint=(0.5, 0.8, 0.68), paint2=(0.97, 0.93, 0.82), bar=(0.97, 0.93, 0.82), bumper=(0.97, 0.93, 0.82), flare=(0.97, 0.93, 0.82),
             rim=(0.97, 0.93, 0.82), cover=(0.97, 0.93, 0.82), wicker=(0.78, 0.6, 0.38), wicker2=(0.62, 0.45, 0.27), blanket=(0.95, 0.45, 0.5),
             blanket2=(1, 0.88, 0.9), petal=(1, 0.55, 0.65), mid=(1, 0.84, 0.3), leaf=(0.36, 0.62, 0.3), tyre=(0.2, 0.18, 0.17))
    p, R = body(M, "toy")
    # a wicker roof basket with a rolled picnic blanket and a little potted plant
    z = ROOF + 0.05
    for s in (-1, 1):
        p.append(cyl(0.02, 0.08, at=(s * 0.55, -0.0, ROOF + 0.02), m=M["wicker2"], verts=8))
        p.append(cyl(0.02, 0.08, at=(s * 0.55, 1.3, ROOF + 0.02), m=M["wicker2"], verts=8))
    p.append(box((1.3, 1.45, 0.03), at=(0, 0.66, z), m=M["wicker2"], bevel=0.01))
    for k in range(4):
        h = z + 0.04 + k * 0.045
        for s in (-1, 1):
            p.append(rod((s * 0.65, -0.06, h), (s * 0.65, 1.38, h), 0.018, M["wicker" if k % 2 else "wicker2"], verts=6))
            p.append(rod((-0.65, 0.66 + s * 0.72, h), (0.65, 0.66 + s * 0.72, h), 0.018, M["wicker2" if k % 2 else "wicker"], verts=6))
    roll = cyl(0.16, 1.0, at=(0, 0.2, z + 0.17), rot=(0, math.pi / 2, 0), m=M["blanket"], verts=20)
    p.append(roll)
    for x in (-0.3, 0.0, 0.3):
        p.append(cyl(0.163, 0.08, at=(x, 0.2, z + 0.17), rot=(0, math.pi / 2, 0), m=M["blanket2"], verts=20))
    p.append(cyl(0.12, 0.18, at=(0.25, 0.95, z + 0.11), m=M["wicker"], verts=14, r2=0.15))
    for k in range(5):
        a = k / 5 * 2 * math.pi
        p.append(ball(0.09, at=(0.25 + math.cos(a) * 0.07, 0.95 + math.sin(a) * 0.07, z + 0.26), scale=(1.4, 0.6, 0.35), m=M["leaf"], seg=10, rot=(0, -0.4, a)))
    # a flower on the spare cover and a little one by each headlight
    sy = REAR + 0.22 + 0.13
    for k in range(5):
        a = k / 5 * 2 * math.pi
        p.append(ball(0.07, at=(0.06 + math.cos(a) * 0.09, sy, 0.98 + math.sin(a) * 0.09), scale=(1, 0.3, 1), m=M["petal"], seg=10))
    p.append(ball(0.06, at=(0.06, sy + 0.01, 0.98), scale=(1, 0.4, 1), m=M["mid"], seg=10))
    return join(p, "Jeep")


def expedition():
    M = mats("ex", paint=(0.36, 0.39, 0.25), paint2=(0.36, 0.39, 0.25), bar=(0.36, 0.39, 0.25), bumper=(0.12, 0.12, 0.12), flare=(0.1, 0.1, 0.1),
             rim=(0.16, 0.16, 0.17), rack=(0.09, 0.09, 0.09), can=(0.6, 0.12, 0.08), can2=(0.3, 0.33, 0.2), crate=(0.62, 0.48, 0.32),
             strap=(0.82, 0.5, 0.12), rope=(0.7, 0.62, 0.45))
    p, R = body(M, "expedition")
    # steel bumper with a winch and a pair of tow hooks
    p.append(box((0.42, 0.18, 0.16), at=(0, FRONT - 0.2, SILL + 0.1), m=M["rack"], bevel=0.02))
    p.append(cyl(0.065, 0.36, at=(0, FRONT - 0.22, SILL + 0.11), rot=(0, math.pi / 2, 0), m=M["rope"], verts=14))
    for s in (-1, 1):
        p.append(torus(0.04, 0.012, at=(s * 0.55, FRONT - 0.17, SILL), rot=(0, math.pi / 2, 0), m=M["strap"], major=12, minor=4))
    # snorkel: out of the right wing, up and along the A pillar, hugging it, to an intake head facing forward.
    # One pipe of joined segments with a ball at each bend, so there are no gaps.
    path = [(W / 2 - 0.04, -0.8, BELT - 0.3), (W / 2 + 0.045, -0.78, BELT - 0.22), (W / 2 + 0.045, -0.66, BELT - 0.02), (0.83, -0.5, BELT + 0.07),
            (0.785, -0.2, ROOF - 0.04), (0.785, -0.2, ROOF + 0.05)]
    for a_, b_ in zip(path, path[1:]):
        p.append(rod(a_, b_, 0.045, M["rack"], verts=12))
    for q_ in path[1:-1]:
        p.append(ball(0.045, at=q_, m=M["rack"], seg=12))
    p.append(box((0.016, 0.15, 0.15), at=(W / 2 + 0.006, -0.8, BELT - 0.29), m=M["rack"], bevel=0.02))     # flange on the wing
    p.append(box((0.12, 0.2, 0.11), at=(0.785, -0.27, ROOF + 0.08), m=M["rack"], bevel=0.035))           # intake head
    p.append(box((0.1, 0.01, 0.07), at=(0.785, -0.375, ROOF + 0.08), m=M["grille"]))                      # its mesh front
    # front plate on the winch, where it can be seen
    p.append(box((0.4, 0.015, 0.11), at=(0, FRONT - 0.3, SILL + 0.1), m=M["plate"], bevel=0.008))
    # roof rack: a black ladder frame with two jerry cans, a crate and a coil of rope
    z = ROOF + 0.12
    for s in (-1, 1):
        p.append(rod((s * 0.7, -0.2, z), (s * 0.7, 1.55, z), 0.022, M["rack"], verts=8))
        for y in (-0.15, 0.7, 1.5):
            p.append(rod((s * 0.7, y, z), (s * 0.68, y, ROOF), 0.018, M["rack"], verts=6))
    for k in range(7):
        y = -0.2 + k * 1.75 / 6
        p.append(rod((-0.7, y, z), (0.7, y, z), 0.016, M["rack"], verts=6))
    for k, (x, cm) in enumerate(((-0.42, "can"), (-0.14, "can2"))):
        p.append(box((0.17, 0.48, 0.34), at=(x, 1.2, z + 0.19), m=M[cm], bevel=0.02))
        p.append(box((0.04, 0.04, 0.06), at=(x, 1.0, z + 0.38), m=M[cm]))
        p.append(box((0.175, 0.03, 0.2), at=(x, 1.3, z + 0.2), m=M[cm], bevel=0.008))
    p.append(box((0.62, 0.55, 0.3), at=(0.25, 0.85, z + 0.17), m=M["crate"], bevel=0.02))
    for k in range(4):
        p.append(box((0.63, 0.02, 0.035), at=(0.25, 0.85 - 0.28, z + 0.06 + k * 0.08), m=M["rack"]))
    p.append(box((0.03, 0.57, 0.31), at=(0.25, 0.85, z + 0.17), m=M["strap"]))
    p.append(torus(0.2, 0.05, at=(-0.25, 0.2, z + 0.07), m=M["rope"], major=24, minor=8))
    p.append(torus(0.12, 0.05, at=(-0.25, 0.2, z + 0.09), m=M["rope"], major=18, minor=8))
    # a shovel on the rear door
    p.append(rod((0.55, REAR + 0.04, 0.6), (0.55, REAR + 0.04, 1.4), 0.016, M["crate"], verts=6))
    p.append(box((0.16, 0.02, 0.22), at=(0.55, REAR + 0.05, 0.55), m=M["rack"], bevel=0.01))
    return join(p, "Jeep")


def camper():
    M = mats("ca", paint=(0.82, 0.74, 0.58), paint2=(0.95, 0.93, 0.88), bar=(0.95, 0.93, 0.88), bumper=(0.2, 0.2, 0.2), flare=(0.2, 0.2, 0.2),
             rim=(0.95, 0.93, 0.88), cover=(0.25, 0.42, 0.38), canvas=(0.27, 0.45, 0.4), canvas2=(0.95, 0.66, 0.33), base=(0.18, 0.18, 0.18),
             alu=(0.72, 0.73, 0.74), rope=(0.7, 0.62, 0.45))
    p, R = body(M, "camper")
    # rooftop tent folded open over the right side: one shell on the roof, the lid as the floor out over the ladder
    z = ROOF + 0.07
    x0, x1 = -0.72, 2.0
    for s in (-1, 1):
        p.append(rod((s * 0.6, -0.05, ROOF), (s * 0.6, -0.05, z), 0.02, M["base"], verts=6))
        p.append(rod((s * 0.6, 1.45, ROOF), (s * 0.6, 1.45, z), 0.02, M["base"], verts=6))
    p.append(box((x1 - x0, 1.75, 0.07), at=((x0 + x1) / 2, 0.7, z), m=M["base"], bevel=0.02))
    # canvas: one tent over the shell and the fold-out, high over the roof hinge and sloping down to the far end,
    # with an orange window each end and the door over the ladder
    prof = [(x0, z), (x1, z), (x1, z + 0.58), (0.62, z + 0.9), (x0 + 0.1, z + 0.72), (x0, z + 0.42)]
    tent = prism([(x, zz) for x, zz in prof], 1.7, M["canvas"])
    tent.rotation_euler.z = -math.pi / 2                                # profile was drawn in Y: turn it to run across X
    tent.location.y = 0.7
    p.append(soften(tent, 0.06))
    for y in (-0.16, 1.56):
        p.append(panel((0.9, y, z + 0.18), (1.6, y, z + 0.18), (1.6, y, z + 0.55), (0.9, y, z + 0.66), M["canvas2"]))
    p.append(cyl(0.06, 0.9, at=(x1 + 0.03, 0.7, z + 0.56), rot=(math.pi / 2, 0, 0), m=M["canvas2"], verts=12))   # rolled-up door
    p.append(panel((x1 + 0.006, 0.3, z + 0.08), (x1 + 0.006, 1.1, z + 0.08), (x1 + 0.006, 1.1, z + 0.5), (x1 + 0.006, 0.3, z + 0.5), M["base"]))
    for y in (-0.12, 1.52):                                             # poles holding the fold-out end up
        p.append(rod((0.62, y, z + 0.92), (x1 - 0.02, y, z + 0.6), 0.014, M["alu"], verts=6))
    # an aluminium ladder from the fold-out edge to the ground
    yl = (0.45, 0.95)
    xt, xb = x1 - 0.05, x1 + 0.55
    for y in yl:
        p.append(rod((xt, y, z), (xb, y, 0.0), 0.022, M["alu"], verts=8))
    for k in range(1, 7):
        t = k / 7
        p.append(rod((xt + (xb - xt) * t, yl[0], z * (1 - t)), (xt + (xb - xt) * t, yl[1], z * (1 - t)), 0.016, M["alu"], verts=6))
    # a coiled rope and a little pennant on the spare
    p.append(torus(0.15, 0.03, at=(-0.45, 1.3, z + 0.12), m=M["rope"], major=20, minor=6))
    return join(p, "Jeep")


# ------------------------------------------------------------------ mud, export, preview
def mud(o, rgb=(0.36, 0.27, 0.18)):
    """Muddy sills: blend the baked colour toward mud below a wavy line, strongest near the wheels."""
    me = o.data
    col = me.color_attributes["Col"]
    m = Vector(rgb)
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            line = 0.66 + 0.06 * math.sin(v.y * 7.3) + 0.04 * math.sin(v.y * 17 + v.x * 3)
            k = max(0.0, min(1.0, (line - v.z) / 0.18)) * 0.8
            if k > 0:
                c = Vector(col.data[li].color[:3])
                col.data[li].color = (*c.lerp(m * (0.6 + 0.4 * c.length), k), 1)


def preview(style, o, samples):
    """A still of the baked prop on grass in soft daylight, from the front three-quarter and from the back."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.render.resolution_x, sc.render.resolution_y = 900, 700
    sc.view_settings.view_transform = "Standard"
    w = sc.world
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.78, 0.86, 0.72, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    bpy.ops.mesh.primitive_plane_add(size=30)
    g = bpy.context.object
    gm = bpy.data.materials.new("grass"); gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.34, 0.45, 0.2, 1)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
    g.data.materials.append(gm)
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(40), math.radians(-25), math.radians(30)))
    bpy.context.object.data.energy = 2.2
    bpy.context.object.data.angle = math.radians(18)
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 42
    sc.camera = cam
    outs = []
    views = [("front", (-4.6, -5.6, 2.3), (0, 0, 0.95)), ("back", (4.2, 5.8, 2.4), (0, 0, 0.95)),
             ("detail", (2.6, -3.0, 1.9), (0.45, -0.75, 1.05))]                  # close on the bonnet, wipers and snorkel
    for tag, pos, aim in views:
        cam.location = pos
        d = Vector(aim) - Vector(pos)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(HERE, f"preview_{style}_{tag}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        outs.append(path)
    return outs


def build(style, samples, do_preview, preview_samples):
    reset()
    o = {"toy": toy, "expedition": expedition, "camper": camper}[style]()
    apply_all(o)
    o.location = (0, 0, 0)
    bake([o], samples)
    if style == "expedition":
        mud(o)
    path = os.path.join(HERE, f"jeep_{style}.glb")
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=False)
    tris = sum(len(pl.vertices) - 2 for pl in o.data.polygons)
    print(f"{style}: {tris} triangles, {os.path.getsize(path) // 1024} KB -> {path}")
    return preview(style, o, preview_samples) if do_preview else []


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", default="all", choices=[*STYLES, "all"])
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--preview-samples", type=int, default=48)
    ap.add_argument("--no-preview", action="store_true")
    a = ap.parse_args()
    for s in (STYLES if a.style == "all" else [a.style]):
        build(s, a.samples, not a.no_preview, a.preview_samples)
