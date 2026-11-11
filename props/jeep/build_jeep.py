"""
The adventure jeep for the Canopy Camp game (apps/canopy-prototype/camp.html): an original small boxy off-roader
(short, upright, round headlights, spare wheel on the back door), parked in the clearing. Three styles to pick from:

    toy         chunky and rounded like the storybook props: mint and cream, big soft wheels, a wicker roof basket
    expedition  closer to real, to sit with the rustic props: olive paint, black flares, roof rack with jerry cans,
                snorkel, winch, mud up the sills
    camper      a camping rig: sand paint, a rooftop tent folded open over the side with a ladder to the ground

    .venv/bin/python props/jeep/build_jeep.py                       # all three, plus a preview still of each
    .venv/bin/python props/jeep/build_jeep.py --style camper --samples 64 --no-preview

Each style is one GLB (props/jeep/jeep_<style>.glb) standing on z = 0 with its front toward -Y (three.js +Z): the body
Jeep (hollow, with seats, dashboard and a cargo deck), and the doors DoorP (driver, +X, the camp side; left-hand drive, the name is kept from when it was the passenger door), DoorD (the other front door)
and BackDoor (with the spare), each with its origin on its hinge so the page swings it about the vertical; plus empties
SeatP (driver cushion top, at the wheel), DoorSill (bottom of that door opening), WheelHub (steering wheel centre; the wheel faces the driver, up and back) and Boot (middle of the cargo deck). It is the same convention and the same baked light as props/camp/build_camp.py, whose helpers it reuses:
Cycles AO times base colour in one colour attribute, drawn with a plain Lambert material on the page.
Previews go to props/jeep/preview_<style>.png and preview_all.png.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "camp"))
import build_camp  # noqa: E402
from build_camp import (apply_all, ball, bake, cyl, join, mat, reset, rod, torus, _finish)  # noqa: E402
from build_camp import box as _box  # noqa: E402

# Triangle budget (Adriaen, 2026-11-11: as few triangles as still look good, used where they show). So: no edge splitting
# for the bake, bevels of one segment and only on parts big enough for a bevel to read, low segment counts on round parts.


def box(size, at=(0, 0, 0), rot=(0, 0, 0), m=None, bevel=0.0):
    o = _box(size, at=at, rot=rot, m=m)
    if bevel and min(size) >= 0.05:
        apply_all(o)
        mod = o.modifiers.new("b", "BEVEL")
        mod.width, mod.segments = bevel, 1
    return o


build_camp.densify = lambda o, *a, **k: apply_all(o)   # bake() calls it: no splitting, only apply transforms

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


def soften(o, w, seg=2):
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


def unite(o, other):
    mod = o.modifiers.new("u", "BOOLEAN")
    mod.operation, mod.object, mod.solver = "UNION", other, "EXACT"
    apply_all(o)
    bpy.data.objects.remove(other)
    return o


def piece(o, region, gap=0.006):
    """The part of o inside region (a door cut from the shell), shrunk a little about its centre so a seam shows."""
    c = o.copy()
    c.data = o.data.copy()
    bpy.context.collection.objects.link(c)
    mod = c.modifiers.new("i", "BOOLEAN")
    mod.operation, mod.object, mod.solver = "INTERSECT", region, "EXACT"
    apply_all(c)
    me = c.data
    lo = Vector([min(v.co[i] for v in me.vertices) for i in range(3)])
    hi = Vector([max(v.co[i] for v in me.vertices) for i in range(3)])
    mid = (lo + hi) / 2
    for v in me.vertices:
        for i in range(3):
            half = (hi[i] - lo[i]) / 2
            if half > 0.1:
                v.co[i] = mid[i] + (v.co[i] - mid[i]) * (half - gap) / half
    return c


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


VIEWS = []    # --views: only these preview stills (all when empty)
TYRE = "mt"   # tread option (--tyre): "at" staggered all-terrain blocks, "mt" chunky mud-terrain lugs over the shoulders, "road" smooth with painted grooves


def quad(pts, m, toward):
    """One flat quad, no thickness, wound so its front faces the point toward."""
    a, b, c = (Vector(q) for q in pts[:3])
    n = (b - a).cross(c - a)
    if n.dot(Vector(toward) - a) < 0:
        pts = pts[::-1]
    me = bpy.data.meshes.new("quad"); me.from_pydata([tuple(q) for q in pts], [], [(0, 1, 2, 3)]); me.update()
    o = bpy.data.objects.new("quad", me); bpy.context.collection.objects.link(o)
    me.materials.append(m)
    return o


def duct(path, secs, m):
    """A square-section pipe along path: one ring of four corners per point (w out from the body, h across), mitred at
    the bends, capped at both ends. Flat faces and sharp corners, so a bend costs 8 triangles."""
    P = [Vector(q) for q in path]
    verts, faces = [], []
    for i, q in enumerate(P):
        ds = [(P[j + 1] - P[j]).normalized() for j in (i - 1, i) if 0 <= j < len(P) - 1]
        t = sum(ds, Vector()).normalized()
        k = 1 / max(0.5, ds[0].dot(t))                        # mitre: widen the ring where the pipe bends
        n1 = (Vector((1, 0, 0)) - t * t.x).normalized()        # out from the body
        n2 = t.cross(n1).normalized()
        w, h = secs[i]
        for a_, b_ in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(tuple(q + n1 * (a_ * w / 2) + n2 * (b_ * h / 2 * k)))
    for i in range(len(P) - 1):
        for c in range(4):
            c2 = (c + 1) % 4
            faces.append((i * 4 + c, i * 4 + c2, (i + 1) * 4 + c2, (i + 1) * 4 + c))
    faces += [(0, 1, 2, 3), tuple(len(verts) - 4 + c for c in (3, 2, 1, 0))]
    me = bpy.data.meshes.new("duct"); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new("duct", me); bpy.context.collection.objects.link(o)
    me.materials.append(m)
    outward(o)
    return o


def lathe(prof, n, at, axis_x, M, name="lathe", face=None):
    """A surface of revolution about the axle. prof is [(radius, offset along the axle, material key of the band that
    starts here)]; n segments round. One object, one material per band, so grooves and stripes cost no extra triangles."""
    keys = []
    for _, _, k in prof:
        if k not in keys:
            keys.append(k)
    verts, faces, fm = [], [], []
    for r, off, _ in prof:
        for i in range(n):
            a = (i + 0.5) / n * 2 * math.pi
            c, sn = math.cos(a) * r, math.sin(a) * r
            verts.append((at[0] + off, at[1] + c, at[2] + sn) if axis_x else (at[0] + c, at[1] + off, at[2] + sn))
    for j in range(len(prof) - 1):
        for i in range(n):
            i2 = (i + 1) % n
            faces.append((j * n + i, j * n + i2, (j + 1) * n + i2, (j + 1) * n + i)); fm.append(keys.index(prof[j][2]))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    for k in keys:
        me.materials.append(M[k])
    for pl, k in zip(me.polygons, fm):
        pl.material_index, pl.use_smooth = k, True
    # an open surface, so face it away from the wheel's centre explicitly (normals_make_consistent can pick inward,
    # and the page draws front faces only)
    import bmesh
    # (face: a direction every face should look toward instead, for the rim, which is seen from outside only)
    bm = bmesh.new(); bm.from_mesh(me); c0 = Vector(at)
    for f in bm.faces:
        if f.normal.dot(Vector(face) if face else f.calc_center_median() - c0) < 0:
            f.normal_flip()
    bm.to_mesh(me); bm.free(); me.update()
    return o


def wheel(x, y, R, Wt, M, chunky=True, axis_x=True):
    """A tyre with a rounded shoulder and tread (style TYRE), a dished steel rim with a hub, on an axle along X
    (or along Y for the spare). The silhouette gets the segments; the tread pattern is low blocks or painted bands."""
    if "groove" not in M:
        M["groove"] = mat(M["tyre"].name + "_groove", tuple(c * 0.45 for c in M["tyre"]["base"]))
    at, h, rr = (x, y, 0), Wt / 2, R * 0.6
    side = (math.copysign(1, x) if x else 1) if axis_x else 1          # the outer face: away from the car (+Y for the spare)
    t, g = "tyre", "groove"
    core = R * (0.95 if TYRE != "road" else 1.0)
    # the tyre's cross-section, inner bead to outer bead: bulging sidewalls, rounded shoulders, a flat tread band
    if TYRE == "road":
        prof = [(rr, -h, t), (R * 0.86, -h - 0.012, t), (R * 0.97, -h * 0.9, t), (R, -h * 0.7, g), (R, -h * 0.58, t), (R, -h * 0.12, g),
                (R, h * 0.0, t), (R, h * 0.12, t), (R, h * 0.58, g), (R, h * 0.7, t), (R * 0.97, h * 0.9, t), (R * 0.86, h + 0.012, t), (rr, h, t)]
        prof = [pp for k, pp in enumerate(prof) if k != 6]
    else:
        prof = [(rr, -h, t), (R * 0.84, -h - 0.014, t), (core * 0.97, -h * 0.9, t), (core, -h * 0.74, g), (core, h * 0.74, t),
                (core * 0.97, h * 0.9, t), (R * 0.84, h + 0.014, t), (rr, h, t)]
    prof = [(r, o * side, k) for r, o, k in prof]
    p = [lathe(prof, 20 if TYRE != "mt" else 16, at, axis_x, M, "tyre")]
    if TYRE in ("at", "mt"):
        nb = 16 if TYRE == "at" else 12
        for i in range(nb):
            a = (i + 0.5) / nb * 2 * math.pi
            lane = 1 if i % 2 else -1
            if TYRE == "at":    # staggered blocks, half the tread wide, alternating left and right of the centre
                w_, off, ln, ht = Wt * 0.36, lane * Wt * 0.18, 2 * math.pi * R / nb * 0.8, R * 0.05
            else:               # big lugs, nearly the full tread wide, alternating which shoulder they reach
                w_, off, ln, ht = Wt * 0.5, lane * Wt * 0.12, 2 * math.pi * R / nb * 0.6, R * 0.07
            rc = core + ht * 0.1        # sunk into the tread band, so only the top shows
            if axis_x:
                b = box((w_, ln, ht), at=(x + off, y + math.cos(a) * rc, math.sin(a) * rc), rot=(a - math.pi / 2, 0, 0), m=M[t], bevel=0.012)
            else:
                b = box((ln, w_, ht), at=(x + math.cos(a) * rc, y + off, math.sin(a) * rc), rot=(0, -a + math.pi / 2, 0), m=M[t], bevel=0.012)
            p.append(b)
    # the rim: a lip, a dished face and a raised centre, then a hub and five nuts; a flat cap closes the inner side
    rim = [(rr, h * 1.02, "rim"), (rr * 0.88, h * 0.6, "rim"), (rr * 0.5, h * 0.6, "rim"), (rr * 0.42, h * 0.75, "hub")]
    p.append(lathe([(r, o * side, k) for r, o, k in rim], 12, at, axis_x, M, "rim", face=(side, 0, 0) if axis_x else (0, side, 0)))
    hub_at = (x + side * h * 0.75, y, 0) if axis_x else (x, y + side * h * 0.75, 0)
    rot = (0, math.pi / 2, 0) if axis_x else (math.pi / 2, 0, 0)
    p.append(cyl(rr * 0.42, 0.04, at=hub_at, rot=rot, m=M["hub"], verts=6))
    p.append(cyl(rr * 0.9, 0.01, at=(x - side * h * 0.98, y, 0) if axis_x else (x, y - side * h * 0.98, 0), rot=rot, m=M["under"], verts=6))
    for k in range(5):     # five hex wheel nuts round the hub
        a = k / 5 * 2 * math.pi
        c, sn = math.cos(a) * rr * 0.3, math.sin(a) * rr * 0.3
        nut_at = (hub_at[0] + side * 0.02, y + c, sn) if axis_x else (x + c, hub_at[1] + side * 0.02, sn)
        p.append(cyl(rr * 0.075, 0.025, at=nut_at, rot=rot, m=M["trim"], verts=6))
    return p


def lift(objs, z):
    for o in objs:
        o.location.z += z
    return objs


def headlight(x, y, z, r, M, ring="chrome"):
    p = [torus(r, r * 0.16, at=(x, y, z), rot=(math.pi / 2, 0, 0), m=M[ring], major=16, minor=4)]
    p.append(cyl(r * 0.92, 0.04, at=(x, y + 0.005, z), rot=(math.pi / 2, 0, 0), m=M["lamp"], verts=16))
    return p


# ------------------------------------------------------------------ the shared body
def body(M, style):
    toy = style == "toy"
    R = 0.43 if toy else 0.37
    zc = R                                                    # wheel centre height
    yf, yr = -WB / 2 - 0.03, WB / 2 - 0.03
    p = []
    G = {"DoorP": [], "DoorD": [], "BackDoor": [], "Glass": [], "GlassP": [], "GlassD": [], "GlassB": []}   # parts that move with each door
    # (passenger door on +X, the camp side); the glass is kept apart so the page can draw it see-through
    # lower body: hood and sides up to the beltline, with the wheel arches cut out
    lower = prism([(FRONT, SILL), (REAR, SILL), (REAR, BELT), (-0.42, BELT), (FRONT + 0.06, BELT - 0.05), (FRONT, BELT - 0.12)], W, M["paint"])
    for y in (yf, yr):
        cut(lower, cyl(R + 0.08, W + 0.4, at=(0, y, zc), rot=(0, math.pi / 2, 0), m=M["paint"], verts=32))
    soften(lower, 0.12 if toy else 0.05)
    # cabin: upright windscreen, flat roof, slightly narrower than the body
    top = M["paint2"]
    cab = prism([(-0.42, BELT - 0.01), (REAR - 0.01, BELT - 0.01), (REAR - 0.03, ROOF), (-0.16, ROOF)], W - 0.04, top, taper=0.93)
    soften(cab, 0.12 if toy else 0.045)
    # one hollow shell: the cabin is empty behind the windscreen (the bonnet stays solid), then the three doors are cut
    # out of it as their own pieces, each to swing on its hinge
    shell = unite(lower, cab)
    cut(shell, prism([(-0.37, SILL + 0.1), (REAR - 0.05, SILL + 0.1), (REAR - 0.05, ROOF - 0.05), (-0.14, ROOF - 0.05), (-0.37, BELT + 0.02)],
                     W - 0.1, M["inside"], taper=0.95))
    side = [(-0.33, SILL + 0.11), (0.6, SILL + 0.11), (0.6, ROOF - 0.08), (-0.1, ROOF - 0.08), (-0.33, BELT)]
    regions = {"DoorP": lambda: prism(side, 0.4, M["paint"], x0=0.8), "DoorD": lambda: prism(side, 0.4, M["paint"], x0=-0.8),
               "BackDoor": lambda: box((1.32, 0.3, ROOF - 0.08 - SILL - 0.1), at=(0, REAR, (ROOF - 0.08 + SILL + 0.1) / 2), m=M["paint"])}
    for name, make in regions.items():
        r = make(); apply_all(r)
        G[name].append(piece(shell, r))
        cut(shell, r)
    # window openings, so the glass can be see-through: the windscreen and rear side windows in the body, the front side
    # windows in the doors, the back window in the back door (cut after the doors, which keeps the booleans clean).
    # Their reveals take the inside colour.
    zt_, zb_ = ROOF - 0.07, BELT + 0.06
    w0, w1 = Vector((0, -0.42, BELT)), Vector((0, -0.16, ROOF)); wu = (w1 - w0).normalized(); wn = Vector((0, -wu.z, wu.y)) * 0.01
    wa, wb = w0 + wu * 0.1 + wn, w1 - wu * 0.09 + wn
    cut(shell, panel((-0.6, wa.y, wa.z), (0.6, wa.y, wa.z), (0.58, wb.y, wb.z), (-0.58, wb.y, wb.z), M["inside"], t=0.24))
    for sx, door in ((-1, "DoorD"), (1, "DoorP")):
        cut(G[door][0], prism([(-0.21, zb_ + 0.03), (0.49, zb_ + 0.03), (0.49, zt_ - 0.03), (-0.05, zt_ - 0.03)], 0.3, M["inside"], x0=sx * 0.76))
        cut(shell, prism([(0.71, zb_ + 0.03), (1.45, zb_ + 0.03), (1.45, zt_ - 0.03), (0.71, zt_ - 0.03)], 0.3, M["inside"], x0=sx * 0.76))
    cut(G["BackDoor"][0], box((0.92, 0.3, zt_ - zb_ - 0.1), at=(0, REAR, (zb_ + zt_) / 2 + 0.02), m=M["inside"]))
    p.append(shell)
    # inside: floor, two front seats (driver on +X, the camp side, so a sloth in that seat sits at the wheel), dashboard and wheel, and the
    # rear seats folded flat into a cargo deck
    fab, ins = M["seat"], M["inside"]
    p.append(box((W - 0.12, REAR + 0.33, 0.04), at=(0, (REAR - 0.37) / 2, SILL + 0.1), m=ins))
    for x in (-0.36, 0.36):
        p.append(box((0.42, 0.46, 0.13), at=(x, 0.18, SILL + 0.34), m=fab, bevel=0.04))
        p.append(box((0.3, 0.3, 0.2), at=(x, 0.18, SILL + 0.18), m=ins))
        p.append(box((0.42, 0.11, 0.5), at=(x, 0.46, SILL + 0.64), rot=(-0.18, 0, 0), m=fab, bevel=0.04))
        p.append(box((0.24, 0.08, 0.13), at=(x, 0.52, SILL + 0.97), rot=(-0.18, 0, 0), m=fab, bevel=0.03))
    p.append(box((W - 0.14, 0.24, 0.2), at=(0, -0.26, BELT - 0.03), m=ins, bevel=0.04))
    p.append(rod((0.36, -0.26, BELT - 0.06), (0.36, -0.05, BELT + 0.09), 0.026, M["trim"], verts=6))
    # the wheel's middle: a hub boss and three spokes (left, right, down) in the rim's plane
    wr, wc = math.pi / 2 + 0.45, Vector((0.36, -0.05, BELT + 0.09))
    ux, uy = Vector((1, 0, 0)), Vector((0, math.cos(wr), math.sin(wr)))      # the rim plane's axes
    p.append(cyl(0.045, 0.04, at=tuple(wc), rot=(wr, 0, 0), m=M["trim"], verts=6))
    for d, size in ((ux, (0.13, 0.03, 0.014)), (-ux, (0.13, 0.03, 0.014)), (-uy, (0.03, 0.13, 0.014))):
        p.append(box(size, at=tuple(wc + d * 0.085), rot=(wr, 0, 0), m=M["trim"]))
    p.append(torus(0.16, 0.018, at=(0.36, -0.05, BELT + 0.09), rot=(math.pi / 2 + 0.45, 0, 0), m=M["trim"], major=12, minor=4))
    p.append(box((1.08, 0.92, 0.05), at=(0, 1.06, SILL + 0.3), m=fab, bevel=0.015))   # fits between the wheel tubs     # the folded rear seats: a flat deck
    p.append(box((W - 0.16, 0.06, 0.2), at=(0, 0.62, SILL + 0.2), m=ins))
    for sx in (-1, 1):   # rear wheel tubs: single quads (inner wall, lid, both ends) facing into the boot, closing it off from the wheels
        x0, x1, y0, y1, z0, z1 = sx * 0.54, sx * (W / 2 - 0.01), yr - R - 0.1, yr + R + 0.1, SILL + 0.1, zc + R + 0.1
        aim = (0, yr, SILL + 0.6)
        p.append(quad([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], ins, aim))
        p.append(quad([(x0, y0, z1), (x0, y1, z1), (x1, y1, z1), (x1, y0, z1)], ins, aim))
        for y_, away in ((y0, -1), (y1, 1)):     # the ends face away from the wheel, into the cabin and the boot
            p.append(quad([(x0, y_, z0), (x1, y_, z0), (x1, y_, z1), (x0, y_, z1)], ins, (x0, y_ + away, z0)))
    # handy points for the page: the driver's (SeatP, name kept) seat cushion, the steering wheel centre, the passenger door sill, the middle of the cargo deck
    for name, at in (("SeatP", (0.36, 0.18, SILL + 0.41)), ("DoorSill", (W / 2, 0.13, SILL + 0.11)), ("Boot", (0, 1.06, SILL + 0.33)), ("WheelHub", (0.36, -0.05, BELT + 0.09))):
        e = bpy.data.objects.new(name, None); e.location = at; bpy.context.collection.objects.link(e); EMPTIES.append(e)
    # glass: windscreen, side windows split by the B pillar, the rear door window
    g, wt = M["glass"], W / 2 * 0.93 + 0.004
    zt, zb = ROOF - 0.07, BELT + 0.06
    s0 = Vector((0, -0.42, BELT)); s1 = Vector((0, -0.16, ROOF)); up = (s1 - s0).normalized()
    nrm = Vector((0, -up.z, up.y)) * 0.01
    a = s0 + up * 0.07 + nrm; b = s1 - up * 0.06 + nrm
    G["Glass"].append(panel((-0.64, a.y, a.z), (0.64, a.y, a.z), (0.62, b.y, b.z), (-0.62, b.y, b.z), g))
    for s in (-1, 1):
        def wx(z):  # side of the tapered cabin at height z
            return s * ((W - 0.04) / 2 * (1 - 0.07 * (z - BELT) / (ROOF - BELT)) + 0.008)
        door = G["DoorP" if s > 0 else "DoorD"]
        G["GlassP" if s > 0 else "GlassD"].append(panel((wx(zb), -0.24, zb), (wx(zb), 0.52, zb), (wx(zt), 0.52, zt), (wx(zt), -0.07, zt), g))
        G["Glass"].append(panel((wx(zb), 0.68, zb), (wx(zb), 1.48, zb), (wx(zt), 1.48, zt), (wx(zt), 0.68, zt), g))
        door.append(box((0.03, 0.14, 0.03), at=(s * (W / 2 + 0.012), 0.45, BELT - 0.12), m=M["trim"], bevel=0.008))   # handle
        # mirror: a big squarish housing close to the door on a short foot at the front corner of the window (Adriaen's photo)
        # (it rides on the door, so it swings open with it)
        dr = G["DoorP" if s > 0 else "DoorD"]
        # the housing sticks out sideways with its glass facing back
        dr.append(box((0.06, 0.06, 0.08), at=(s * (W / 2 + 0.03), -0.28, BELT + 0.07), m=M["trim"], bevel=0.012))
        dr.append(box((0.18, 0.065, 0.16), at=(s * (W / 2 + 0.105), -0.28, BELT + 0.17), m=M["trim"], bevel=0.02))
        dr.append(box((0.14, 0.006, 0.12), at=(s * (W / 2 + 0.105), -0.246, BELT + 0.17), m=M["glass"]))
    G["GlassB"].append(panel((-0.5, REAR + 0.004, zb + 0.04), (0.5, REAR + 0.004, zb + 0.04), (0.48, REAR + 0.002, zt - 0.02), (-0.48, REAR + 0.002, zt - 0.02), g))
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
    bd = G["BackDoor"]
    for z in (0.7, 1.35):                                     # hinges on the -X side, a handle on the other
        p.append(box((0.05, 0.04, 0.09), at=(-0.66, REAR + 0.015, z), m=M["trim"], bevel=0.01))
    bd.append(box((0.03, 0.12, 0.03), at=(0.55, REAR + 0.02, BELT - 0.12), rot=(0, 0, math.pi / 2), m=M["trim"], bevel=0.008))
    sr = R * 0.98
    bd.append(cyl(0.06, 0.12, at=(0.06, REAR + 0.06, 0.98), rot=(math.pi / 2, 0, 0), m=M["trim"], verts=12))
    bd += lift(wheel(0.06, REAR + 0.22, sr, 0.24, M, chunky=not toy, axis_x=False), 0.98)
    cover = M.get("cover")
    if cover:
        bd.append(cyl(sr + 0.012, 0.25, at=(0.06, REAR + 0.22, 0.98), rot=(math.pi / 2, 0, 0), m=cover, verts=32))
    # chassis, axles and the four wheels with black flares over them
    p.append(box((W - 0.3, REAR - FRONT - 0.3, 0.2), at=(0, 0, SILL - 0.02), m=M["under"]))
    for y in (yf, yr):
        p.append(rod((-0.7, y, zc), (0.7, y, zc), 0.04, M["under"]))
        for s in (-1, 1):
            p += lift(wheel(s * (W / 2 - 0.1), y, R, 0.27 if toy else 0.25, M, chunky=not toy), zc)
            fl = torus(R + 0.1, 0.06 if toy else 0.045, at=(s * (W / 2 + 0.01), y, zc), rot=(0, math.pi / 2, 0), m=M["flare"], major=20, minor=4)
            apply_all(fl)
            for v in fl.data.vertices:          # widen the torus tube sideways into a flat band
                v.co.x *= 2.2
            p.append(upper_half(fl, zc - 0.12))
    # side steps / sills
    for s in (-1, 1):
        p.append(box((0.06, 0.95, 0.06), at=(s * (W / 2 - 0.01), 0.0, SILL + 0.02), m=M["bumper"], bevel=0.015))
    return p, R, G


# hinge of each door (x, y) and how far it opens (radians about Z); the page reads the same from the node positions
HINGES = {"DoorP": ((W / 2 + 0.01, -0.33), -1.2), "DoorD": ((-W / 2 - 0.01, -0.33), 1.2), "BackDoor": ((-0.67, REAR + 0.02), 1.75)}
EMPTIES = []


def finish(p, G):
    """Join the body and each door; put each door's origin on its hinge."""
    out = {"Jeep": join(p, "Jeep")}
    for name, parts in G.items():
        if name.startswith("Glass"):
            continue
        o = join(parts, name)
        (hx, hy), _ = HINGES[name]
        bpy.context.scene.cursor.location = (hx, hy, 0)
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        out[name] = o
    for name, door in (("Glass", None), ("GlassP", "DoorP"), ("GlassD", "DoorD"), ("GlassB", "BackDoor")):
        o = join(G[name], name)
        if door:                                                       # rides on its door
            o.parent = out[door]
            o.matrix_parent_inverse = out[door].matrix_world.inverted()
        out[name] = o
    return out


# ------------------------------------------------------------------ the three styles
BASE = dict(seat=(0.3, 0.25, 0.21), inside=(0.17, 0.17, 0.18), glass=(0.11, 0.14, 0.17), seam=(0.08, 0.08, 0.08), trim=(0.1, 0.1, 0.1), grille=(0.05, 0.05, 0.06), lamp=(1.0, 0.96, 0.82),
            chrome=(0.78, 0.79, 0.8), amber=(0.98, 0.58, 0.12), red=(0.75, 0.08, 0.06), plate=(0.92, 0.9, 0.84), under=(0.1, 0.1, 0.1),
            tyre=(0.11, 0.11, 0.11), hub=(0.3, 0.3, 0.32))


def mats(prefix, **over):
    return {k: mat(f"{prefix}_{k}", c) for k, c in {**BASE, **over}.items()}


def toy():
    M = mats("toy", paint=(0.5, 0.8, 0.68), paint2=(0.97, 0.93, 0.82), bar=(0.97, 0.93, 0.82), bumper=(0.97, 0.93, 0.82), flare=(0.97, 0.93, 0.82),
             rim=(0.97, 0.93, 0.82), cover=(0.97, 0.93, 0.82), wicker=(0.78, 0.6, 0.38), wicker2=(0.62, 0.45, 0.27), blanket=(0.95, 0.45, 0.5),
             blanket2=(1, 0.88, 0.9), petal=(1, 0.55, 0.65), mid=(1, 0.84, 0.3), leaf=(0.36, 0.62, 0.3), tyre=(0.2, 0.18, 0.17))
    p, R, G = body(M, "toy")
    # a wicker roof basket with a rolled picnic blanket and a little potted plant
    z = ROOF + 0.05
    for s in (-1, 1):
        p.append(cyl(0.02, 0.08, at=(s * 0.55, -0.0, ROOF + 0.02), m=M["wicker2"], verts=6))
        p.append(cyl(0.02, 0.08, at=(s * 0.55, 1.3, ROOF + 0.02), m=M["wicker2"], verts=6))
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
        G["BackDoor"].append(ball(0.07, at=(0.06 + math.cos(a) * 0.09, sy, 0.98 + math.sin(a) * 0.09), scale=(1, 0.3, 1), m=M["petal"], seg=10))
    G["BackDoor"].append(ball(0.06, at=(0.06, sy + 0.01, 0.98), scale=(1, 0.4, 1), m=M["mid"], seg=10))
    return finish(p, G)


def expedition():
    M = mats("ex", paint=(0.36, 0.39, 0.25), paint2=(0.36, 0.39, 0.25), bar=(0.36, 0.39, 0.25), bumper=(0.12, 0.12, 0.12), flare=(0.1, 0.1, 0.1),
             rim=(0.6, 0.52, 0.38), rack=(0.09, 0.09, 0.09), can=(0.6, 0.12, 0.08), can2=(0.3, 0.33, 0.2), crate=(0.62, 0.48, 0.32),
             strap=(0.82, 0.5, 0.12), rope=(0.7, 0.62, 0.45))
    p, R, G = body(M, "expedition")
    # steel bumper with a winch and a pair of tow hooks
    p.append(box((0.42, 0.18, 0.16), at=(0, FRONT - 0.2, SILL + 0.1), m=M["rack"], bevel=0.02))
    p.append(cyl(0.065, 0.36, at=(0, FRONT - 0.22, SILL + 0.11), rot=(0, math.pi / 2, 0), m=M["rope"], verts=14))
    for s in (-1, 1):
        p.append(torus(0.04, 0.012, at=(s * 0.55, FRONT - 0.17, SILL), rot=(0, math.pi / 2, 0), m=M["strap"], major=12, minor=4))
    # snorkel, angular like the aftermarket ones: a flat box duct along the top of the wing, a square riser up the A pillar
    # (raked like the windscreen, clear of the mirror) and a wedge-shaped intake head on top facing forward
    p.append(duct([(0.85, -1.3, BELT - 0.12), (0.85, -0.62, BELT - 0.12), (0.8, -0.31, ROOF - 0.03)],
                  [(0.07, 0.15), (0.07, 0.15), (0.075, 0.085)], M["rack"]))
    p.append(box((0.14, 0.27, 0.1), at=(0.79, -0.37, ROOF + 0.03), rot=(-0.12, 0, 0), m=M["rack"]))                 # intake head
    p.append(box((0.11, 0.01, 0.06), at=(0.79, -0.505, ROOF + 0.04), rot=(-0.12, 0, 0), m=M["grille"]))             # its mesh front
    # no front plate here: the winch shows instead (Adriaen, 2026-11-11). Its fairlead, where the rope comes out:
    p.append(box((0.2, 0.03, 0.08), at=(0, FRONT - 0.3, SILL + 0.1), m=M["bumper"], bevel=0.01))
    p.append(box((0.12, 0.034, 0.025), at=(0, FRONT - 0.3, SILL + 0.1), m=M["grille"]))
    p.append(rod((0, FRONT - 0.3, SILL + 0.1), (0, FRONT - 0.34, SILL + 0.06), 0.008, M["rope"], verts=5))
    p.append(torus(0.03, 0.008, at=(0, FRONT - 0.345, SILL + 0.03), rot=(0, math.pi / 2, 0), m=M["strap"], major=10, minor=4))
    # roof rack: a black ladder frame with two jerry cans, a crate and a coil of rope
    z = ROOF + 0.12
    for s in (-1, 1):
        p.append(rod((s * 0.7, -0.2, z), (s * 0.7, 1.55, z), 0.022, M["rack"], verts=6))
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
    p.append(torus(0.2, 0.05, at=(-0.25, 0.2, z + 0.07), m=M["rope"], major=16, minor=5))
    p.append(torus(0.12, 0.05, at=(-0.25, 0.2, z + 0.09), m=M["rope"], major=12, minor=5))
    # a shovel on the rear door
    # (blade clear above the bumper, beside the spare)
    G["BackDoor"].append(rod((0.52, REAR + 0.04, 0.88), (0.52, REAR + 0.04, 1.52), 0.016, M["crate"], verts=6))
    G["BackDoor"].append(box((0.15, 0.02, 0.2), at=(0.52, REAR + 0.05, 0.8), m=M["rack"], bevel=0.01))
    return finish(p, G)


def camper():
    M = mats("ca", paint=(0.82, 0.74, 0.58), paint2=(0.95, 0.93, 0.88), bar=(0.95, 0.93, 0.88), bumper=(0.2, 0.2, 0.2), flare=(0.2, 0.2, 0.2),
             rim=(0.95, 0.93, 0.88), cover=(0.25, 0.42, 0.38), canvas=(0.27, 0.45, 0.4), canvas2=(0.95, 0.66, 0.33), base=(0.18, 0.18, 0.18),
             alu=(0.72, 0.73, 0.74), rope=(0.7, 0.62, 0.45))
    p, R, G = body(M, "camper")
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
        p.append(rod((xt, y, z), (xb, y, 0.0), 0.022, M["alu"], verts=6))
    for k in range(1, 7):
        t = k / 7
        p.append(rod((xt + (xb - xt) * t, yl[0], z * (1 - t)), (xt + (xb - xt) * t, yl[1], z * (1 - t)), 0.016, M["alu"], verts=6))
    # a coiled rope and a little pennant on the spare
    p.append(torus(0.15, 0.03, at=(-0.45, 1.3, z + 0.12), m=M["rope"], major=20, minor=6))
    return finish(p, G)


# ------------------------------------------------------------------ mud, export, preview
def mud_mask(o):
    """Before the bake replaces the materials: how much mud each face takes. Wheels get only a splash, so the tread,
    the grooves and the rim still read apart."""
    me = o.data
    a = me.attributes.new("mudf", "FLOAT", "FACE")
    for poly in me.polygons:
        mn = me.materials[poly.material_index].name if me.materials else ""
        a.data[poly.index].value = 0.25 if mn.endswith(("_rim", "_hub", "_trim")) else 0.45 if "_tyre" in mn else 1.0


def mud(o, rgb=(0.36, 0.27, 0.18)):
    """Muddy sills: blend the baked colour toward mud below a wavy line, strongest near the wheels."""
    me = o.data
    col = me.color_attributes["Col"]
    m = Vector(rgb)
    for poly in me.polygons:
        f = me.attributes["mudf"].data[poly.index].value if "mudf" in me.attributes else 1.0
        for li in poly.loop_indices:
            v = o.matrix_world @ me.vertices[me.loops[li].vertex_index].co
            line = 0.66 + 0.06 * math.sin(v.y * 7.3) + 0.04 * math.sin(v.y * 17 + v.x * 3)
            k = max(0.0, min(1.0, (line - v.z) / 0.18)) * 0.8 * f
            if k > 0:
                c = Vector(col.data[li].color[:3])
                col.data[li].color = (*c.lerp(m * (0.6 + 0.4 * c.length), k), 1)


def preview(style, objs, samples):
    """Stills of the baked prop on grass in soft daylight: front three-quarter, back, a close-up of the bonnet, and the
    camp side with all three doors open."""
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
    views = [("front", (-4.6, -5.6, 2.3), (0, 0, 0.95), False), ("back", (4.2, 5.8, 2.4), (0, 0, 0.95), False),
             ("detail", (2.6, -3.0, 1.9), (0.45, -0.75, 1.05), False),                  # close on the bonnet, wipers and snorkel
             ("open", (4.6, 3.4, 2.5), (0.2, 0.4, 0.9), True), ("door", (3.4, -0.9, 1.6), (0.5, 0.25, 0.95), True),
             ("wheel", (2.5, -2.4, 0.75), (0.75, -1.1, 0.42), False)]
    for tag, pos, aim, opened in views:
        if VIEWS and tag not in VIEWS:
            continue
        doors(objs, opened)
        cam.location = pos
        d = Vector(aim) - Vector(pos)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(HERE, f"preview_{style}_{tag}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        outs.append(path)
    doors(objs, False)
    return outs


def doors(objs, opened):
    for name, (_, ang) in HINGES.items():
        objs[name].rotation_euler.z = ang if opened else 0.0
    bpy.context.view_layer.update()


def build(style, samples, do_preview, preview_samples):
    reset()
    EMPTIES.clear()
    objs = {"toy": toy, "expedition": expedition, "camper": camper}[style]()
    for o in objs.values():
        apply_all(o)
    # bake with the doors open, so the cabin and the inner door faces get daylight (bake() must not apply the open rotation)
    build_camp.densify = lambda o, *a, **k: None
    doors(objs, True)
    if style == "expedition":
        for o in objs.values():
            mud_mask(o)
    bake(list(objs.values()), samples)
    doors(objs, False)
    if style == "expedition":
        for o in objs.values():
            mud(o)
    path = os.path.join(HERE, f"jeep_{style}.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in [*objs.values(), *EMPTIES]:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=False)
    tris = sum(len(pl.vertices) - 2 for o in objs.values() for pl in o.data.polygons)
    print(f"{style}: {tris} triangles, {os.path.getsize(path) // 1024} KB -> {path}")
    print("  per object: " + ", ".join(f"{n} {sum(len(pl.vertices) - 2 for pl in o.data.polygons)}" for n, o in objs.items()))
    for e in EMPTIES:
        print(f"  {e.name}: blender {tuple(round(v, 3) for v in e.location)}")
    return preview(style, objs, preview_samples) if do_preview else []


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", default="all", choices=[*STYLES, "all"])
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--preview-samples", type=int, default=48)
    ap.add_argument("--no-preview", action="store_true")
    ap.add_argument("--views", default="")
    ap.add_argument("--tyre", default=TYRE, choices=["at", "mt", "road"])
    a = ap.parse_args()
    TYRE = a.tyre
    VIEWS = a.views.split(",") if a.views else []
    for s in (STYLES if a.style == "all" else [a.style]):
        build(s, a.samples, not a.no_preview, a.preview_samples)
