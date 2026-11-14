"""
The adventure jeep for the Canopy Camp game (apps/canopy-prototype/camp.html): an original small boxy off-roader
(short, upright, round headlights, spare wheel on the back door), parked in the clearing. The default style, and the only
one the page loads, is expedition: olive paint, black flares, a roof rack with jerry cans, a snorkel, a winch and mud up
the sills. The two other styles are archived (props/jeep/archive/, the GLBs only); their builders stay here, since they
share body() with it:

    toy         chunky and rounded like the storybook props: mint and cream, big soft wheels, a wicker roof basket
    camper      a camping rig: sand paint, a rooftop tent folded open over the side with a ladder to the ground

    .venv/bin/python props/jeep/build_jeep.py                                  # the expedition jeep and its far LOD
    .venv/bin/python props/jeep/build_jeep.py --preview front,detail           # and these Cycles preview stills (slow)
    .venv/bin/python props/jeep/build_jeep.py --style toy                      # remake an archived style

Each style is one GLB, props/jeep/jeep_<style>.glb, standing on z = 0 with its front toward -Y (three.js +Z): the body
Jeep (hollow, with seats, dashboard and a cargo deck), and the doors DoorP (driver, +X, the camp side; left-hand drive,
the name is kept from when it was the passenger door), DoorD (the other front door) and BackDoor (with the spare), each
with its origin on its hinge so the page swings it about the vertical, and the Hood, hinged at the foot of the windscreen.
Each of these four carries glTF extras that camp/jeep.js reads: "open", how far it swings open (radians), and "axis", the
three.js axis it swings about (HINGES and HOOD_OPEN below; review R2-250). Plus empties SeatP (driver cushion top, at the
wheel), DoorSill (bottom of that door opening), WheelHub (steering wheel centre; the wheel faces the driver, up and back)
and Boot (middle of the cargo deck). The expedition, the page's jeep, also writes its far LOD jeep_expedition_lod.glb,
and the base64 copies the page loads, apps/canopy-prototype/models/jeep_expedition.txt and jeep_expedition_lod.txt.
props/bake_all.py runs this (its "jeep" step) before the light bake whenever the GLB is older than this script or
props/lib, because the light bake uses the GLB as a shadow caster.
It is the same convention as props/camp/build_camp.py, with the shared helpers of props/lib: Cycles AO times base colour
in one colour attribute (the jeep carries its own light), drawn with a plain Lambert material on the page.
Previews are opt-in (--preview, Cycles on the CPU): props/jeep/preview_<style>_<view>.png for the views front, back,
detail, open, door and wheel.
"""
import argparse
import dataclasses
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "..", "..", "apps", "canopy-prototype", "models")   # the page's base64 copies
sys.path.insert(0, os.path.dirname(HERE))
from lib.bake import bake, corner_values  # noqa: E402
from lib.export import export_glb, reset  # noqa: E402
from lib.materials import mat  # noqa: E402
from lib.mesh import apply_all, arc, ball, bisect, box, cyl, drop_enclosed, drop_faces, join, mesh_obj, outward, rod, torus  # noqa: E402

# Triangle budget (Adriaen, 2026-11-11: as few triangles as still look good, used where they show). So: no edge splitting
# for the bake (bake(..., apply=False) below), one-segment bevels on boxes only where they are big enough for a bevel to read
# (slim_box), two-segment roundings only on the big body shapes (soften), low segment counts on round parts.


def slim_box(size, at=(0, 0, 0), rot=(0, 0, 0), m=None, bevel=0.0):
    """lib.mesh.box, but its bevel has one segment and only on boxes whose smallest side is at least 5 cm (on smaller parts
    a bevel would not read, so none is made). Every box of the jeep is one of these."""
    o = box(size, at=at, rot=rot, m=m)
    if bevel and min(size) >= 0.05:
        apply_all(o)
        mod = o.modifiers.new("b", "BEVEL")
        mod.width, mod.segments = bevel, 1
    return o


STYLES = ("toy", "expedition", "camper")

# shared proportions (metres): short, tall and narrow
WB = 2.25            # wheelbase
FRONT, REAR = -1.62, 1.62
W = 1.6              # body width
SILL = 0.45          # bottom of the body
BELT = 1.06          # beltline: hood top and window sills
ROOF = 1.70
AXLE_Y = (-WB / 2 - 0.03, WB / 2 - 0.03)   # front and rear axle
WHEEL_R = 0.37       # wheel radius, also the axle height (the toy's wheels are bigger: body())

# ------------------------------------------------------------------ shapes the full jeep and its far LOD share
# One copy each, so a body change reaches both and the jeep keeps its shape at the LOD switch (review R2-230).
LOWER_PROFILE = [(FRONT, SILL), (REAR, SILL), (REAR, BELT), (-0.42, BELT), (FRONT + 0.06, BELT - 0.05), (FRONT, BELT - 0.12)]   # hood and sides (y, z)
CAB_PROFILE = [(-0.42, BELT - 0.01), (REAR - 0.01, BELT - 0.01), (REAR - 0.03, ROOF), (-0.16, ROOF)]   # upright windscreen, flat roof
CAB_W, CAB_TAPER = W - 0.04, 0.93          # the cabin's width at the beltline, and how much narrower it is at the roof
GLASS_Z = (BELT + 0.06, ROOF - 0.07)       # bottom and top of the side and back windows
GRILLE_Z, GRILLE_W = (0.7, 0.95), 0.82
LAMP_X, LAMP_Z, LAMP_R = 0.6, 0.83, 0.115  # the headlights (the toy's are bigger: body())
SNORKEL_PATH = [(0.85, -1.3, BELT - 0.12), (0.85, -0.62, BELT - 0.12), (0.8, -0.31, ROOF - 0.03)]   # along the wing, up the A pillar
SNORKEL_SECS = [(0.07, 0.15), (0.07, 0.15), (0.075, 0.085)]
SNORKEL_HEAD = dict(size=(0.14, 0.27, 0.1), at=(0.79, -0.37, ROOF + 0.03), rot=(-0.12, 0, 0))     # the wedge intake on top
MAP_AT = (-0.2, -0.98, 0.1, 1.0, 0.74)     # the paper map on the bonnet: centre x, y, turn, width (x) and depth (y)
RACK_Z = ROOF + 0.12                       # the roof rack's top
JERRY = (0.35, 0.40, 0.17)                 # a jerry can's length (y), height and thickness (x)
CANS, CAN_Y = ((-0.42, "can"), (-0.14, "can2")), 1.2   # the two cans on the rack: x and colour, and where they stand along y
CRATE = dict(size=(0.62, 0.55, 0.3), at=(0.25, 0.85, RACK_Z + 0.17))


def bonnet_z(y):
    """The bonnet's top at y: it falls 0.05 from the windscreen to the front."""
    return BELT - 0.05 * (-0.42 - y) / (-0.42 - FRONT - 0.06)


def map_xy(u, v):
    """A point on the bonnet map, u and v in -1..1 across the sheet, as (x, y)."""
    cx, cy, a, mw, md = MAP_AT
    u, v = u * mw / 2, v * md / 2
    return cx + u * math.cos(a) - v * math.sin(a), cy + u * math.sin(a) + v * math.cos(a)


def windscreen():
    """The windscreen's foot and top on the centre line, its unit up direction along the glass and its unit outward
    normal."""
    s0, s1 = Vector((0, -0.42, BELT)), Vector((0, -0.16, ROOF))
    up = (s1 - s0).normalized()
    return s0, s1, up, Vector((0, -up.z, up.y))


def windscreen_glass(out):
    """The windscreen glass's four corners, out metres in front of the frame."""
    s0, s1, up, n = windscreen()
    a, b = s0 + up * 0.07 + n * out, s1 - up * 0.06 + n * out
    return [(-0.64, a.y, a.z), (0.64, a.y, a.z), (0.62, b.y, b.z), (-0.62, b.y, b.z)]


def cabin_side_x(z, s, pad):
    """The x of the tapered cabin's side at height z on side s (-1 or 1), pad metres outside it."""
    return s * (CAB_W / 2 * (1 - (1 - CAB_TAPER) * (z - BELT) / (ROOF - BELT)) + pad)


def wheel_arches(lower, R, zc, verts):
    """Cut both wheel arches out of the lower body."""
    for y in AXLE_Y:
        cut(lower, cyl(R + 0.08, W + 0.4, at=(0, y, zc), rot=(0, math.pi / 2, 0), m=lower.data.materials[0], verts=verts))


def flare(s, y, zc, R, tube, m, major):
    """A wheel-arch flare: the top half of a ring round the wheel, its tube widened sideways into a flat band."""
    fl = torus(R + 0.1, tube, at=(s * (W / 2 + 0.01), y, zc), rot=(0, math.pi / 2, 0), m=m, major=major, minor=3)
    apply_all(fl)
    for v in fl.data.vertices:
        v.co.x *= 2.2
    return upper_half(fl, zc - 0.12)


def bumpers(M, bevel=0.0):
    """The front and back bumpers."""
    return [slim_box((W + 0.08, 0.2, 0.18), at=(0, y, SILL + 0.06), m=M["bumper"], bevel=bevel) for y in (FRONT - 0.06, REAR + 0.05)]


def winch(M, bevel=0.0):
    return slim_box((0.42, 0.18, 0.16), at=(0, FRONT - 0.2, SILL + 0.1), m=M["rack"], bevel=bevel)


def snorkel(M):
    """The angular snorkel: a square duct along the wing and up the A pillar, and the intake head on top."""
    return [duct(SNORKEL_PATH, SNORKEL_SECS, M["rack"]), slim_box(m=M["rack"], **SNORKEL_HEAD)]


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
    return outward(mesh_obj("prism", verts, faces, (m,), validate=True))


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
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(axis=0), co.max(axis=0)
    mid, half = (lo + hi) / 2, (hi - lo) / 2
    k = np.where(half > 0.1, (half - gap) / np.maximum(half, 1e-9), 1.0)   # only the sides longer than 20 cm shrink
    me.vertices.foreach_set("co", (mid + (co - mid) * k).ravel())
    me.update()
    return c


def upper_half(o, z):
    """Keep the part of o above z (used for wheel-arch flares)."""
    apply_all(o)
    return bisect(o, (0, 0, z), (0, 0, 1), clear_inner=True)


def panel(a, b, c, d, m, t=0.012):
    """A thin flat panel through four corners (a window or a plate), thickness t along its normal."""
    a, b, c, d = map(Vector, (a, b, c, d))
    nrm = (b - a).cross(d - a).normalized() * t / 2
    vs = [a - nrm, b - nrm, c - nrm, d - nrm, a + nrm, b + nrm, c + nrm, d + nrm]
    fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return outward(mesh_obj("panel", vs, fs, (m,), validate=True))


def poly(pts, m, toward):
    """One flat n-gon (a quad, a lens, a map panel), no thickness, wound so its front faces the point toward."""
    a, b, c = (Vector(q) for q in pts[:3])
    if (b - a).cross(c - a).dot(Vector(toward) - a) < 0:
        pts = pts[::-1]
    return mesh_obj("poly", pts, [tuple(range(len(pts)))], (m,))


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
    return outward(mesh_obj("duct", verts, faces, (m,)))


def lathe(prof, n, at, axis_x, M, name="lathe", face=None):
    """A surface of revolution about the axle. prof is [(radius, offset along the axle, material key of the band that
    starts here)]; n segments round. One object, one material per band, so grooves and stripes cost no extra triangles."""
    keys = []
    for _, _, k in prof:
        if k not in keys:
            keys.append(k)
    verts, faces, fm, rings = [], [], [], []
    P = lambda r, off, a: (at[0] + off, at[1] + math.cos(a) * r, at[2] + math.sin(a) * r) if axis_x else (at[0] + math.cos(a) * r, at[1] + off, at[2] + math.sin(a) * r)
    for r, off, _ in prof:            # a ring of n vertices, or one vertex on the axle where r is 0 (closes the end)
        rings.append([len(verts)] * n if r == 0 else list(range(len(verts), len(verts) + n)))
        verts += [P(0, off, 0)] if r == 0 else [P(r, off, (i + 0.5) / n * 2 * math.pi) for i in range(n)]
    for j in range(len(prof) - 1):
        A, B = rings[j], rings[j + 1]
        for i in range(n):
            i2 = (i + 1) % n
            f = (A[i], A[i2], B[i2], B[i])
            f = tuple(dict.fromkeys(f))   # a fan triangle where one ring is a single point
            faces.append(f); fm.append(keys.index(prof[j][2]))
    o = mesh_obj(name, verts, faces, [M[k] for k in keys], fm)
    me = o.data
    for pl in me.polygons:
        pl.use_smooth = True
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


# the wheels (--wheel, --tyre): "closed", the whole wheel as one sealed lathe, or "open", the earlier separate tyre, rim, hub
# and cap; the open wheel's tread: "at" staggered all-terrain blocks, "mt" chunky mud-terrain lugs over the shoulders,
# "road" smooth with painted grooves. build() hands them to the style builders, which hand them to body() and wheel().
WHEELS = dict(kind="closed", tyre="mt")
# the tread blocks round a tyre: how many, their width and their offset from the centre line (times the tyre's width),
# their length (times the spacing round the tyre) and their height (times the radius)
TREAD = {"at": (16, 0.36, 0.18, 0.8, 0.05),   # staggered blocks, half the tread wide, alternating left and right of the centre
         "mt": (12, 0.5, 0.12, 0.6, 0.07)}    # big lugs, nearly the full tread wide, alternating which shoulder they reach


def wheel(x, y, R, Wt, M, axis_x=True, kind="closed", tyre="mt"):
    """One wheel of radius R and width Wt at (x, y, 0), its axle along X (or along Y for the spare): kind and tyre as in
    WHEELS."""
    return wheel_closed(x, y, R, Wt, M, axis_x) if kind == "closed" else wheel_open(x, y, R, Wt, M, axis_x, tyre)


def lugs(x, y, R, Wt, core, m, axis_x, tread):
    """The tread blocks (TREAD[tread]) round a tyre whose tread band has radius core, sunk into it so only the tops show,
    each a box with no bottom face (review R2-168)."""
    nb, kw, ko, kl, kh = TREAD[tread]
    p = []
    for i in range(nb):
        a = (i + 0.5) / nb * 2 * math.pi
        lane = 1 if i % 2 else -1
        w_, off, ln, ht = Wt * kw, lane * Wt * ko, 2 * math.pi * R / nb * kl, R * kh
        rc = core + ht * 0.1
        if axis_x:
            o = slim_box((w_, ln, ht), at=(x + off, y + math.cos(a) * rc, math.sin(a) * rc), rot=(a - math.pi / 2, 0, 0), m=m)
        else:
            o = slim_box((ln, w_, ht), at=(x + math.cos(a) * rc, y + off, math.sin(a) * rc), rot=(0, -a + math.pi / 2, 0), m=m)
        p.append(drop_faces(o, lambda f, k=o.matrix_world.to_3x3() @ Vector((0, 0, -1)): f.normal.dot(k) > 0.99))   # its bottom, sunk in the tread
    return p


def nuts(x, y, along, ring, r, m, axis_x, side):
    """Five wheel nuts round the axle through (x, y, 0) on a circle of radius ring, each one flat hexagon of radius r in
    the plane at along on the axle (an x when it runs along X, a y otherwise), facing out along the axle toward side. A
    nut is 3.4 cm across, so a painted hexagon just proud of the hub reads as well as a modelled one (4 triangles where a
    six-sided prism cost 20, review R2-168)."""
    p = []
    for k in range(5):
        a = k / 5 * 2 * math.pi
        c, sn = math.cos(a) * ring, math.sin(a) * ring
        hexa = [(c + r * math.cos(t * math.pi / 3), sn + r * math.sin(t * math.pi / 3)) for t in range(6)]
        pts = [(along, y + u, v) for u, v in hexa] if axis_x else [(x + u, along, v) for u, v in hexa]
        p.append(poly(pts, m, (along + side, y + c, sn) if axis_x else (x + c, along + side, sn)))
    return p


def wheel_closed(x, y, R, Wt, M, axis_x=True):
    """The whole wheel as one sealed surface of revolution, 14 segments round: from the axle on the inside, out over the
    sidewall, across the tread, down the outer sidewall, into the dished rim and back to the axle at the hub. No gaps to
    see through, no hidden caps. Then 12 low mud-terrain lugs and five hex nuts."""
    at, h, rr = (x, y, 0), Wt / 2, R * 0.6
    side = (math.copysign(1, x) if x else 1) if axis_x else 1
    core = R * 0.95
    prof = [(0, -h, "under"), (R * 0.84, -h - 0.012, "tyre"), (core, -h * 0.74, "groove"), (core, h * 0.74, "tyre"), (R * 0.84, h + 0.012, "tyre"),
            (rr, h, "rim"), (rr * 0.88, h * 0.6, "rim"), (rr * 0.45, h * 0.6, "hub"), (rr * 0.45, h * 0.78, "hub"), (0, h * 0.78, "hub")]
    o = lathe([(r, off * side, k) for r, off, k in prof], 14, at, axis_x, M, "wheel")
    outward(o)                                        # a closed surface, so this is reliable
    for pl in o.data.polygons:                        # smooth over the rubber only; the rim, hub and back stay crisp
        pl.use_smooth = o.data.materials[pl.material_index] in (M["tyre"], M["groove"])
    along = (x if axis_x else y) + side * (h * 0.78 + 0.003)
    return [o, *lugs(x, y, R, Wt, core, M["tyre"], axis_x, "mt"), *nuts(x, y, along, rr * 0.28, rr * 0.075, M["trim"], axis_x, side)]


def wheel_open(x, y, R, Wt, M, axis_x=True, tyre="mt"):
    """A tyre with a rounded shoulder and tread (tyre: "at", "mt" or "road"), a dished steel rim with a hub, on an axle
    along X (or along Y for the spare). The silhouette gets the segments; the tread pattern is low blocks or painted bands."""
    at, h, rr = (x, y, 0), Wt / 2, R * 0.6
    side = (math.copysign(1, x) if x else 1) if axis_x else 1          # the outer face: away from the car (+Y for the spare)
    t, g = "tyre", "groove"
    core = R * (0.95 if tyre != "road" else 1.0)
    # the tyre's cross-section, inner bead to outer bead: bulging sidewalls, rounded shoulders, a flat tread band
    if tyre == "road":
        prof = [(rr, -h, t), (R * 0.86, -h - 0.012, t), (R * 0.97, -h * 0.9, t), (R, -h * 0.7, g), (R, -h * 0.58, t), (R, -h * 0.12, g),
                (R, h * 0.12, t), (R, h * 0.58, g), (R, h * 0.7, t), (R * 0.97, h * 0.9, t), (R * 0.86, h + 0.012, t), (rr, h, t)]
    else:
        prof = [(rr, -h, t), (R * 0.84, -h - 0.014, t), (core * 0.97, -h * 0.9, t), (core, -h * 0.74, g), (core, h * 0.74, t),
                (core * 0.97, h * 0.9, t), (R * 0.84, h + 0.014, t), (rr, h, t)]
    prof = [(r, o * side, k) for r, o, k in prof]
    p = [lathe(prof, 20 if tyre != "mt" else 16, at, axis_x, M, "tyre")]
    if tyre in TREAD:
        p += lugs(x, y, R, Wt, core, M[t], axis_x, tyre)
    # the rim: a lip, a dished face and a raised centre, then a hub and five nuts; a flat cap closes the inner side
    rim = [(rr, h * 1.02, "rim"), (rr * 0.88, h * 0.6, "rim"), (rr * 0.5, h * 0.6, "rim"), (rr * 0.42, h * 0.75, "hub")]
    p.append(lathe([(r, o * side, k) for r, o, k in rim], 12, at, axis_x, M, "rim", face=(side, 0, 0) if axis_x else (0, side, 0)))
    hub_at = (x + side * h * 0.75, y, 0) if axis_x else (x, y + side * h * 0.75, 0)
    rot = (0, math.pi / 2, 0) if axis_x else (math.pi / 2, 0, 0)
    p.append(cyl(rr * 0.42, 0.04, at=hub_at, rot=rot, m=M["hub"], verts=6))
    p.append(cyl(rr * 0.9, 0.01, at=(x - side * h * 0.98, y, 0) if axis_x else (x, y - side * h * 0.98, 0), rot=rot, m=M["under"], verts=6))
    return p + nuts(x, y, hub_at[0 if axis_x else 1] + side * 0.023, rr * 0.3, rr * 0.075, M["trim"], axis_x, side)


def lift(objs, z):
    for o in objs:
        o.location.z += z
    return objs


def headlight(x, y, z, r, M, ring="chrome"):
    """A chrome ring on the body and the lens: one flat 12-gon in the ring. Returns the ring and the lens as two lists (the
    lens has the lamp material). The ring hides the small gap between the lens and the body."""
    p = [torus(r, r * 0.16, at=(x, y, z), rot=(math.pi / 2, 0, 0), m=M[ring], major=12, minor=3)]
    lens = poly([(x + r * 0.95 * math.cos(t * math.pi / 6), y, z + r * 0.95 * math.sin(t * math.pi / 6)) for t in range(12)], M["lamp"], (x, y - 1, z))
    return p, [lens]


# ------------------------------------------------------------------ the shared body

def hood_map(M):
    """A big folded paper map spread over half the bonnet, with an orienteering compass lying on it, as one list of parts
    that body() joins into the Hood, so they lift with it (review R2-156: no node or draw of their own). All flat polygons
    with the detail painted in coloured shapes: four folded panels in two paper shades, forests, a lake, a river and a
    red route on the map; a clear baseplate with a red arrow, a black bezel, a white dial with an N mark and a red and
    white needle on the compass."""
    cx, cy, a = MAP_AT[:3]
    def P(u, v, h=0.0):                                   # map coordinates in -1..1 across the sheet, h above the bonnet
        x, y = map_xy(u, v)
        return (x, y, bonnet_z(y) + 0.004 + h)
    up = (cx, cy, BELT + 2)
    paper = (mat("map_paper", (0.93, 0.88, 0.72)), mat("map_paper2", (0.84, 0.79, 0.63)))
    m = []
    for k in range(4):                      # four panels, the folds show as a change of shade
        u0 = -1 + k * 0.5
        m.append(poly([P(u0, -1), P(u0 + 0.5, -1), P(u0 + 0.5, 1), P(u0, 1)], paper[k % 2], up))
    def strip(pts, w, mt, h):               # a thin band along a polyline, one quad per leg (w in metres)
        for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
            A, B = Vector(P(u0, v0)), Vector(P(u1, v1)); d = (B - A); n = Vector((-d.y, d.x, 0)).normalized() * w / 2
            m.append(poly([A - n + Vector((0, 0, h)), B - n + Vector((0, 0, h)), B + n + Vector((0, 0, h)), A + n + Vector((0, 0, h))], mt, up))
    forest = mat("map_forest", (0.45, 0.62, 0.36))
    m.append(poly([P(-0.92, 0.2, 0.002), P(-0.55, 0.05, 0.002), P(-0.3, 0.35, 0.002), P(-0.4, 0.85, 0.002), P(-0.85, 0.8, 0.002)], forest, up))
    m.append(poly([P(0.45, -0.85, 0.002), P(0.9, -0.7, 0.002), P(0.85, -0.25, 0.002), P(0.55, -0.35, 0.002)], forest, up))
    water = mat("map_river", (0.36, 0.58, 0.78))
    m.append(poly([P(0.45, 0.45, 0.002), P(0.62, 0.32, 0.002), P(0.8, 0.4, 0.002), P(0.78, 0.65, 0.002), P(0.55, 0.7, 0.002)], water, up))
    strip([(-1, -0.45), (-0.4, -0.2), (0.15, -0.35), (0.5, 0.42)], 0.03, water, 0.003)
    strip([(-0.75, -0.8), (-0.35, 0.0), (0.1, 0.25), (0.62, -0.05)], 0.012, mat("map_route", (0.82, 0.22, 0.18)), 0.004)
    # the compass lies on the map: a clear baseplate (pale blue) with a red arrow, a black bezel, a white dial
    q = []
    ku, kv = 0.42, -0.45
    o = Vector(P(ku, kv, 0.004)); th = a + 0.5
    def C(x, y, h):                         # compass frame: y along the baseplate (pointing back towards the windscreen)
        return (o.x + x * math.cos(th) - y * math.sin(th), o.y + x * math.sin(th) + y * math.cos(th), o.z + h)
    kup = (o.x, o.y, o.z + 2)
    q.append(poly([C(-0.06, -0.1, 0), C(0.06, -0.1, 0), C(0.06, 0.1, 0), C(-0.06, 0.1, 0)], mat("compass_plate", (0.72, 0.86, 0.9)), kup))
    q.append(poly([C(-0.02, 0.06, 0.001), C(0.02, 0.06, 0.001), C(0, 0.095, 0.001)], mat("compass_needle", (0.85, 0.15, 0.12)), kup))
    R, H, N = 0.045, 0.016, 8               # an 8-sided dial: it is 9 cm across (review R2-191)
    ring = [(R * math.cos(t * 2 * math.pi / N), R * math.sin(t * 2 * math.pi / N) - 0.02) for t in range(N)]
    bez = mat("compass_bezel", (0.08, 0.08, 0.09))
    for i in range(N):                      # bezel wall, no bottom (it lies on the plate)
        (x0, y0), (x1, y1) = ring[i], ring[(i + 1) % N]
        q.append(poly([C(x0, y0, 0), C(x1, y1, 0), C(x1, y1, H), C(x0, y0, H)], bez, C(2 * (x0 + x1), 2 * (y0 + y1) + 0.06, H / 2)))
    q.append(poly([C(x, y, H) for x, y in ring], mat("compass_face", (0.95, 0.94, 0.9)), (o.x, o.y, o.z + 2)))
    rn = R * math.cos(math.pi / N)          # the dial's inner radius, at the middle of each side
    q.append(poly([C(-0.008, rn - 0.02 - 0.004, H + 0.001), C(0.008, rn - 0.02 - 0.004, H + 0.001), C(0, rn - 0.02 - 0.017, H + 0.001)], bez, kup))   # the N mark
    nd = (math.sin(0.4), math.cos(0.4))     # needle: red half to north, dark half to south (white would vanish on the dial), turned a little off the plate
    tip = lambda s, L: C(s * nd[0] * L, s * nd[1] * L - 0.02, H + 0.002)
    side = lambda s: C(s * nd[1] * 0.007, -s * nd[0] * 0.007 - 0.02, H + 0.002)
    q.append(poly([tip(1, 0.036), side(1), side(-1)], mat("compass_needle", (0.85, 0.15, 0.12)), kup))
    q.append(poly([tip(-1, 0.036), side(-1), side(1)], mat("compass_south", (0.22, 0.22, 0.24)), kup))
    return m + q


@dataclasses.dataclass
class Body:
    """What body() makes and a style builder adds to, for finish(): parts (joined into Jeep), groups (each joined into its
    own node: the doors, the hood, the glass, the cabin light), origins (the origin of each group node that is not on a
    hinge, such as the cabin light's lens) and empties (the page's marker points)."""
    parts: list
    groups: dict
    origins: dict = dataclasses.field(default_factory=dict)
    empties: list = dataclasses.field(default_factory=list)


def body(M, style, wheels=WHEELS):
    """The jeep every style shares (style "toy" makes the wheels and lamps bigger), with wheels as in WHEELS."""
    toy = style == "toy"
    R = 0.43 if toy else WHEEL_R
    zc = R                                                    # wheel centre height
    yr = AXLE_Y[1]
    p = []
    G = {"DoorP": [], "DoorD": [], "BackDoor": [], "Glass": [], "GlassP": [], "GlassD": [], "GlassB": []}   # parts that move with each door
    b = Body(p, G)
    # (passenger door on +X, the camp side); the glass is kept apart so the page can draw it see-through
    # lower body: hood and sides up to the beltline, with the wheel arches cut out
    lower = prism(LOWER_PROFILE, W, M["paint"])
    wheel_arches(lower, R, zc, 20)
    soften(lower, 0.12 if toy else 0.05)
    # cabin: upright windscreen, flat roof, slightly narrower than the body
    top = M["paint2"]
    cab = prism(CAB_PROFILE, CAB_W, top, taper=CAB_TAPER)
    soften(cab, 0.12 if toy else 0.045)
    # one hollow shell: the cabin is empty behind the windscreen (the bonnet stays solid), then the three doors are cut
    # out of it as their own pieces, each to swing on its hinge
    shell = unite(lower, cab)
    cut(shell, prism([(-0.37, SILL + 0.1), (REAR - 0.05, SILL + 0.1), (REAR - 0.05, ROOF - 0.05), (-0.14, ROOF - 0.05), (-0.37, BELT + 0.02)],
                     W - 0.1, M["inside"], taper=0.95))
    side = [(-0.33, SILL + 0.11), (0.6, SILL + 0.11), (0.6, ROOF - 0.08), (-0.1, ROOF - 0.08), (-0.33, BELT)]
    regions = {"DoorP": lambda: prism(side, 0.4, M["paint"], x0=0.8), "DoorD": lambda: prism(side, 0.4, M["paint"], x0=-0.8),
               "BackDoor": lambda: slim_box((1.32, 0.3, ROOF - 0.08 - SILL - 0.1), at=(0, REAR, (ROOF - 0.08 + SILL + 0.1) / 2), m=M["paint"])}
    for name, make in regions.items():
        r = make(); apply_all(r)
        G[name].append(piece(shell, r))
        cut(shell, r)
    # the hood (Adriaen 2026-11-12: a sloth can open it and work on the engine): the bonnet's top skin, front lip included,
    # cut out as its own piece hinged at the foot of the windscreen, and an engine bay hollowed out under it
    hood_r = prism([(FRONT - 0.01, BELT - 0.135), (-0.43, BELT - 0.135), (-0.43, BELT + 0.03), (FRONT - 0.01, BELT + 0.03)], W - 0.06, M["paint"])
    apply_all(hood_r)
    G["Hood"] = [piece(shell, hood_r)]
    cut(shell, hood_r)
    cut(shell, prism([(FRONT + 0.06, SILL + 0.2), (-0.45, SILL + 0.2), (-0.45, BELT - 0.13), (FRONT + 0.06, BELT - 0.13)], W - 0.16, M["inside"]))
    # window openings, so the glass can be see-through: the windscreen and rear side windows in the body, the front side
    # windows in the doors, the back window in the back door (cut after the doors, which keeps the booleans clean).
    # Their reveals take the inside colour.
    zb, zt = GLASS_Z
    s0, s1, up, out = windscreen()
    wa, wb = s0 + up * 0.1 + out * 0.01, s1 - up * 0.09 + out * 0.01
    cut(shell, panel((-0.6, wa.y, wa.z), (0.6, wa.y, wa.z), (0.58, wb.y, wb.z), (-0.58, wb.y, wb.z), M["inside"], t=0.24))
    for sx, door in ((-1, "DoorD"), (1, "DoorP")):
        cut(G[door][0], prism([(-0.21, zb + 0.03), (0.49, zb + 0.03), (0.49, zt - 0.03), (-0.05, zt - 0.03)], 0.3, M["inside"], x0=sx * 0.76))
        cut(shell, prism([(0.71, zb + 0.03), (1.45, zb + 0.03), (1.45, zt - 0.03), (0.71, zt - 0.03)], 0.3, M["inside"], x0=sx * 0.76))
    cut(G["BackDoor"][0], slim_box((0.92, 0.3, zt - zb - 0.1), at=(0, REAR, (zb + zt) / 2 + 0.02), m=M["inside"]))
    p.append(shell)
    # inside: floor, two front seats (driver on +X, the camp side, so a sloth in that seat sits at the wheel), dashboard and wheel, and the
    # rear seats folded flat into a cargo deck
    fab, ins = M["seat"], M["inside"]
    p.append(slim_box((W - 0.12, REAR + 0.33, 0.04), at=(0, (REAR - 0.37) / 2, SILL + 0.1), m=ins))
    for x in (-0.36, 0.36):
        p.append(slim_box((0.42, 0.46, 0.13), at=(x, 0.18, SILL + 0.34), m=fab, bevel=0.04))
        p.append(slim_box((0.3, 0.3, 0.2), at=(x, 0.18, SILL + 0.18), m=ins))
        p.append(slim_box((0.42, 0.11, 0.5), at=(x, 0.46, SILL + 0.64), rot=(-0.18, 0, 0), m=fab, bevel=0.04))
        p.append(slim_box((0.24, 0.08, 0.13), at=(x, 0.52, SILL + 0.97), rot=(-0.18, 0, 0), m=fab))
    p.append(slim_box((W - 0.14, 0.24, 0.2), at=(0, -0.26, BELT - 0.03), m=ins))
    p.append(rod((0.36, -0.26, BELT - 0.06), (0.36, -0.05, BELT + 0.09), 0.026, M["trim"], verts=6))
    # the wheel's middle: a hub boss and three spokes (left, right, down) in the rim's plane
    wr, wc = math.pi / 2 + 0.45, Vector((0.36, -0.05, BELT + 0.09))
    ux, uy = Vector((1, 0, 0)), Vector((0, math.cos(wr), math.sin(wr)))      # the rim plane's axes
    p.append(cyl(0.045, 0.04, at=tuple(wc), rot=(wr, 0, 0), m=M["trim"], verts=6))
    for d, size in ((ux, (0.13, 0.03, 0.014)), (-ux, (0.13, 0.03, 0.014)), (-uy, (0.03, 0.13, 0.014))):
        p.append(slim_box(size, at=tuple(wc + d * 0.085), rot=(wr, 0, 0), m=M["trim"]))
    p.append(torus(0.16, 0.018, at=(0.36, -0.05, BELT + 0.09), rot=(math.pi / 2 + 0.45, 0, 0), m=M["trim"], major=12, minor=4))
    p.append(slim_box((1.08, 0.92, 0.05), at=(0, 1.06, SILL + 0.3), m=fab))   # fits between the wheel tubs     # the folded rear seats: a flat deck
    p.append(slim_box((W - 0.16, 0.06, 0.2), at=(0, 0.62, SILL + 0.2), m=ins))
    for sx in (-1, 1):   # rear wheel tubs: single quads (inner wall, lid, both ends) facing into the boot, closing it off from the wheels
        x0, x1, y0, y1, z0, z1 = sx * 0.54, sx * (W / 2 - 0.01), yr - R - 0.1, yr + R + 0.1, SILL + 0.1, zc + R + 0.1
        aim = (0, yr, SILL + 0.6)
        p.append(poly([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], ins, aim))
        p.append(poly([(x0, y0, z1), (x0, y1, z1), (x1, y1, z1), (x1, y0, z1)], ins, aim))
        for y_, away in ((y0, -1), (y1, 1)):     # the ends face away from the wheel, into the cabin and the boot
            p.append(poly([(x0, y_, z0), (x1, y_, z0), (x1, y_, z1), (x0, y_, z1)], ins, (x0, y_ + away, z0)))
    # handy points for the page: the driver's (SeatP, name kept) seat cushion, the steering wheel centre, the passenger door sill, the middle of the cargo deck
    for name, at in (("SeatP", (0.36, 0.18, SILL + 0.41)), ("DoorSill", (W / 2, 0.13, SILL + 0.11)), ("Boot", (0, 1.06, SILL + 0.33)), ("WheelHub", (0.36, -0.05, BELT + 0.09))):
        e = bpy.data.objects.new(name, None); e.location = at; bpy.context.collection.objects.link(e); b.empties.append(e)
    # glass: windscreen, side windows split by the B pillar, the rear door window
    g = M["glass"]
    G["Glass"].append(panel(*windscreen_glass(0.01), g))
    for s in (-1, 1):
        def wx(z):  # just outside the side of the tapered cabin at height z
            return cabin_side_x(z, s, 0.008)
        door = G["DoorP" if s > 0 else "DoorD"]
        G["GlassP" if s > 0 else "GlassD"].append(panel((wx(zb), -0.24, zb), (wx(zb), 0.52, zb), (wx(zt), 0.52, zt), (wx(zt), -0.07, zt), g))
        G["Glass"].append(panel((wx(zb), 0.68, zb), (wx(zb), 1.48, zb), (wx(zt), 1.48, zt), (wx(zt), 0.68, zt), g))
        door.append(slim_box((0.03, 0.14, 0.03), at=(s * (W / 2 + 0.012), 0.45, BELT - 0.12), m=M["trim"]))   # handle
        # mirror: a big squarish housing close to the door on a short foot at the front corner of the window (Adriaen's
        # photo); it rides on the door, so it swings open with it, and the housing sticks out sideways with its glass facing back
        # (plain boxes: a bevel cost 32 more triangles a box and does not read at this size, review R2-191)
        door.append(slim_box((0.06, 0.06, 0.08), at=(s * (W / 2 + 0.03), -0.28, BELT + 0.07), m=M["trim"]))
        door.append(slim_box((0.18, 0.065, 0.16), at=(s * (W / 2 + 0.105), -0.28, BELT + 0.17), m=M["trim"]))
        door.append(slim_box((0.14, 0.006, 0.12), at=(s * (W / 2 + 0.105), -0.246, BELT + 0.17), m=M["glass"]))
    G["GlassB"].append(panel((-0.5, REAR + 0.004, zb + 0.04), (0.5, REAR + 0.004, zb + 0.04), (0.48, REAR + 0.002, zt - 0.02), (-0.48, REAR + 0.002, zt - 0.02), g))
    # roof gutters
    for s in (-1, 1):
        p.append(rod((s * 0.73, -0.12, ROOF - 0.03), (s * 0.73, REAR - 0.05, ROOF - 0.03), 0.012, top, verts=6))
    # wipers, parked along the bottom of the windscreen: a pivot cap on the cowl, an arm, and a rubber blade on the glass
    tilt = -math.atan2(up.y, up.z)                                   # turns a box's Z onto the glass's up direction
    on_glass = lambda x, h, off: Vector((x, 0, 0)) + s0 + up * h + out * off
    for x in (-0.5, 0.06):
        piv, tip = on_glass(x, 0.03, 0.03), on_glass(x + 0.36, 0.1, 0.03)
        p.append(cyl(0.022, 0.03, at=tuple(on_glass(x, 0.03, 0.012)), rot=(tilt + math.pi / 2, 0, 0), m=M["trim"], verts=6))
        p.append(rod(tuple(piv), tuple(tip), 0.008, M["trim"], verts=4))
        bl = slim_box((0.44, 0.014, 0.022), at=tuple(on_glass(x + 0.3, 0.12, 0.014)), rot=(tilt, 0, 0.0), m=M["trim"])
        bl.rotation_mode = "XYZ"
        p.append(bl)
        p.append(slim_box((0.03, 0.02, 0.03), at=tuple(on_glass(x + 0.36, 0.11, 0.024)), rot=(tilt, 0, 0), m=M["trim"]))   # the clip joining them
    # front: a recessed grille with three bars, round headlights, indicators, bumper
    # the cabin light: a flat lens under the roof between the front seats, its own node so the page can switch it on
    cz = ROOF - 0.056
    G["CabinLight"] = [poly([(-0.09, 0.2, cz), (0.09, 0.2, cz), (0.09, 0.3, cz), (-0.09, 0.3, cz)], M["lamp"], (0, 0.25, 0))]
    b.origins["CabinLight"] = (0, 0.25, cz)
    G["Hood"] += hood_map(M)                             # the map and compass on the bonnet, part of the hood
    # the engine, everything at least 3 cm under the closed hood (its underside is at BELT - 0.135 = 0.925)
    p.append(slim_box((0.5, 0.42, 0.2), at=(0, -1.0, SILL + 0.3), m=M["under"], bevel=0.015))           # the engine: block,
    p.append(slim_box((0.4, 0.32, 0.04), at=(0, -1.0, SILL + 0.42), m=M["trim"]))                         # rocker cover (top 0.89),
    p.append(cyl(0.12, 0.05, at=(-0.2, -0.66, SILL + 0.415), m=M["chrome"], verts=10))              # air filter (top 0.89)
    p.append(slim_box((0.2, 0.15, 0.14), at=(0.46, -0.66, SILL + 0.27), m=M["trim"]))                     # and battery (top 0.79)
    p.append(slim_box((GRILLE_W, 0.03, GRILLE_Z[1] - GRILLE_Z[0]), at=(0, FRONT - 0.005, sum(GRILLE_Z) / 2), m=M["grille"]))
    for k in range(3):                                   # three horizontal bars (its own face, no maker's grille)
        p.append(slim_box((0.78, 0.03, 0.035), at=(0, FRONT - 0.02, GRILLE_Z[0] + 0.06 + k * 0.065), m=M["bar"]))
    hr = 0.15 if toy else LAMP_R
    for s in (-1, 1):
        ring, lens = headlight(s * LAMP_X, FRONT - 0.03, LAMP_Z, hr, M)
        p += ring + lens                                 # the lenses are plain parts of the body (no headlights at night)
        p.append(slim_box((0.12, 0.03, 0.05), at=(s * 0.6, FRONT - 0.02, 0.62), m=M["amber"]))
    front_bumper, back_bumper = bumpers(M, bevel=0.05 if toy else 0.025)
    p.append(front_bumper)
    p.append(slim_box((0.4, 0.02, 0.12), at=(0, FRONT - 0.165, SILL + 0.06), m=M["plate"]))
    # rear: bumper, tall taillights, the spare wheel on the door
    p.append(back_bumper)
    for s in (-1, 1):
        p.append(slim_box((0.09, 0.03, 0.22), at=(s * (W / 2 - 0.08), REAR + 0.01, 0.78), m=M["red"]))
        p.append(slim_box((0.09, 0.03, 0.06), at=(s * (W / 2 - 0.08), REAR + 0.01, 0.64), m=M["amber"]))
    p.append(slim_box((0.42, 0.02, 0.12), at=(0, REAR + 0.155, SILL + 0.06), m=M["plate"]))
    bd = G["BackDoor"]
    for z in (0.7, 1.35):                                     # hinges on the -X side, a handle on the other
        p.append(slim_box((0.05, 0.04, 0.09), at=(-0.66, REAR + 0.015, z), m=M["trim"]))
    bd.append(slim_box((0.03, 0.12, 0.03), at=(0.55, REAR + 0.02, BELT - 0.12), rot=(0, 0, math.pi / 2), m=M["trim"]))
    sr = R * 0.98
    bd.append(cyl(0.06, 0.12, at=(0.06, REAR + 0.06, 0.98), rot=(math.pi / 2, 0, 0), m=M["trim"], verts=12))
    bd += lift(wheel(0.06, REAR + 0.22, sr, 0.24, M, axis_x=False, **wheels), 0.98)
    cover = M.get("cover")
    if cover:
        bd.append(cyl(sr + 0.012, 0.25, at=(0.06, REAR + 0.22, 0.98), rot=(math.pi / 2, 0, 0), m=cover, verts=16))
    # the chassis (it hides the axles, so they are not modelled: review R2-168) and the four wheels with black flares over them
    p.append(slim_box((W - 0.3, REAR - FRONT - 0.3, 0.2), at=(0, 0, SILL - 0.02), m=M["under"]))
    for y in AXLE_Y:
        for s in (-1, 1):
            p += lift(wheel(s * (W / 2 - 0.1), y, R, 0.27 if toy else 0.25, M, **wheels), zc)
            p.append(flare(s, y, zc, R, 0.06 if toy else 0.045, M["flare"], 20))
    # side steps / sills
    for s in (-1, 1):
        p.append(slim_box((0.06, 0.95, 0.06), at=(s * (W / 2 - 0.01), 0.0, SILL + 0.02), m=M["bumper"], bevel=0.015))
    return b


# hinge of each door (x, y) and how far it opens (radians about Z, which is three.js y); the page reads the hinge from the
# node's position and the angle from its extras (finish())
HINGES = {"DoorP": ((W / 2 + 0.01, -0.33), -1.2), "DoorD": ((-W / 2 - 0.01, -0.33), 1.2), "BackDoor": ((-0.67, REAR + 0.02), 1.75)}
HOOD_HINGE, HOOD_OPEN = (0, -0.43, BELT + 0.03), -1.15                      # the hood swings up about X (three.js x too)


def finish(b):
    """Join the body and each group of b (a Body), each without the faces its parts hide inside each other
    (drop_enclosed); put each door's origin on its hinge, the hood's on its own and the others' at b.origins. Returns the
    objects by name and b.empties."""
    p, G = b.parts, b.groups
    out = {"Jeep": join(drop_enclosed(p), "Jeep")}
    for name, parts in G.items():
        if name.startswith("Glass"):
            continue
        o = join(drop_enclosed(parts), name)
        if name == "Hood":                                             # hinged at the foot of the windscreen
            bpy.context.scene.cursor.location = HOOD_HINGE
            o["open"], o["axis"] = HOOD_OPEN, "x"
        elif name in b.origins:
            bpy.context.scene.cursor.location = b.origins[name]
        else:
            (hx, hy), o["open"] = HINGES[name]
            o["axis"] = "y"
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
    return out, b.empties


# ------------------------------------------------------------------ the three styles (each returns finish()'s objects and empties)
BASE = dict(seat=(0.3, 0.25, 0.21), inside=(0.17, 0.17, 0.18), glass=(0.11, 0.14, 0.17), trim=(0.1, 0.1, 0.1), grille=(0.05, 0.05, 0.06), lamp=(1.0, 0.96, 0.82),
            chrome=(0.78, 0.79, 0.8), amber=(0.98, 0.58, 0.12), red=(0.75, 0.08, 0.06), plate=(0.92, 0.9, 0.84), under=(0.1, 0.1, 0.1),
            tyre=(0.11, 0.11, 0.11), hub=(0.3, 0.3, 0.32))


def mats(prefix, **over):
    """A style's materials: BASE with its own colours over it, plus the tyre's darker groove (named <prefix>_tyre_groove,
    so mud_mask() treats it as tyre)."""
    M = {k: mat(f"{prefix}_{k}", c) for k, c in {**BASE, **over}.items()}
    M["groove"] = mat(f"{prefix}_tyre_groove", tuple(c * 0.45 for c in M["tyre"]["base"]))
    return M


def toy(wheels=WHEELS):
    M = mats("toy", paint=(0.5, 0.8, 0.68), paint2=(0.97, 0.93, 0.82), bar=(0.97, 0.93, 0.82), bumper=(0.97, 0.93, 0.82), flare=(0.97, 0.93, 0.82),
             rim=(0.97, 0.93, 0.82), cover=(0.97, 0.93, 0.82), wicker=(0.78, 0.6, 0.38), wicker2=(0.62, 0.45, 0.27), blanket=(0.95, 0.45, 0.5),
             blanket2=(1, 0.88, 0.9), petal=(1, 0.55, 0.65), mid=(1, 0.84, 0.3), leaf=(0.36, 0.62, 0.3), tyre=(0.2, 0.18, 0.17))
    b = body(M, "toy", wheels); p, G = b.parts, b.groups
    # a wicker roof basket with a rolled picnic blanket and a little potted plant
    z = ROOF + 0.05
    for s in (-1, 1):
        p.append(cyl(0.02, 0.08, at=(s * 0.55, -0.0, ROOF + 0.02), m=M["wicker2"], verts=6))
        p.append(cyl(0.02, 0.08, at=(s * 0.55, 1.3, ROOF + 0.02), m=M["wicker2"], verts=6))
    p.append(slim_box((1.3, 1.45, 0.03), at=(0, 0.66, z), m=M["wicker2"]))
    for k in range(4):
        h = z + 0.04 + k * 0.045
        for s in (-1, 1):
            p.append(rod((s * 0.65, -0.06, h), (s * 0.65, 1.38, h), 0.018, M["wicker" if k % 2 else "wicker2"], verts=6))
            p.append(rod((-0.65, 0.66 + s * 0.72, h), (0.65, 0.66 + s * 0.72, h), 0.018, M["wicker2" if k % 2 else "wicker"], verts=6))
    roll = cyl(0.16, 1.0, at=(0, 0.2, z + 0.17), rot=(0, math.pi / 2, 0), m=M["blanket"], verts=12)
    p.append(roll)
    for x in (-0.3, 0.0, 0.3):
        p.append(cyl(0.163, 0.08, at=(x, 0.2, z + 0.17), rot=(0, math.pi / 2, 0), m=M["blanket2"], verts=12))
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
    return finish(b)


def jerry_can(x, y, z, m):
    """An upright jerry can, thin across X: a side profile with the spout corner cut off, a carry handle on top
    with a real hole (one concave prism), the X pressed into each side painted as two darker strips, and a spout cap."""
    L, H, T = JERRY
    body = prism([(y - L / 2, z), (y + L / 2, z), (y + L / 2, z + H), (y - L / 2 + 0.075, z + H), (y - L / 2, z + H - 0.07)], T, m, x0=x)
    b = y + L / 2 - 0.02                     # one carry handle: a loop on two legs with a single hole under it
    legs = [(b, b - 0.035), (b - 0.165, b - 0.2)]
    prof = [(legs[-1][1], z + H), (legs[-1][1], z + H + 0.07), (b, z + H + 0.07)]
    for i, (y0, y1) in enumerate(legs):
        prof += [(y0, z + H), (y1, z + H)]
        if i < len(legs) - 1:
            prof += [(y1, z + H + 0.04), (legs[i + 1][0], z + H + 0.04)]
    handle = prism(prof[:-1], 0.05, m, x0=x)   # the last point would repeat the first
    dark = mat(m.name + "_press", tuple(c * 0.72 for c in m["base"]))
    parts = [body, handle]
    for s in (-1, 1):                        # the pressed X on each face
        xs = x + s * (T / 2 + 0.002)
        for (y0, z0), (y1, z1) in (((y - L / 2 + 0.05, z + 0.05), (y + L / 2 - 0.05, z + H - 0.08)), ((y - L / 2 + 0.05, z + H - 0.08), (y + L / 2 - 0.05, z + 0.05))):
            d = Vector((0, y1 - y0, z1 - z0)); n = Vector((0, -d.z, d.y)).normalized() * 0.012
            pts = [(xs, y0 - n.y, z0 - n.z), (xs, y1 - n.y, z1 - n.z), (xs, y1 + n.y, z1 + n.z), (xs, y0 + n.y, z0 + n.z)]
            parts.append(poly(pts, dark, (x + s, y, z + H / 2)))
    parts.append(cyl(0.024, 0.045, at=(x, y - L / 2 + 0.03, z + H - 0.03), rot=(math.pi / 4, 0, 0), m=dark, verts=6))
    return parts


EXPEDITION_COLOURS = dict(paint=(0.36, 0.39, 0.25), paint2=(0.36, 0.39, 0.25), bar=(0.36, 0.39, 0.25), bumper=(0.12, 0.12, 0.12), flare=(0.1, 0.1, 0.1),
                          rim=(0.6, 0.52, 0.38), rack=(0.09, 0.09, 0.09), can=(0.6, 0.12, 0.08), can2=(0.3, 0.33, 0.2), crate=(0.62, 0.48, 0.32),
                          strap=(0.82, 0.5, 0.12), rope=(0.7, 0.62, 0.45))


def expedition(wheels=WHEELS):
    M = mats("ex", **EXPEDITION_COLOURS)
    b = body(M, "expedition", wheels); p, G = b.parts, b.groups
    # steel bumper with a winch (its drum would sit inside the box, so it is not modelled: review R2-168) and a pair of tow hooks
    p.append(winch(M, bevel=0.02))
    for s in (-1, 1):                    # each tow hook the part of a ring outside the bumper (the rest is inside it)
        p.append(arc(0.04, 0.012, math.radians(150), math.radians(390), 4, at=(s * 0.55, FRONT - 0.17, SILL), rot=(0, math.pi / 2, 0), m=M["strap"]))
    # snorkel, angular like the aftermarket ones: a flat box duct along the top of the wing, a square riser up the A pillar
    # (raked like the windscreen, clear of the mirror) and a wedge-shaped intake head on top facing forward
    p += snorkel(M)
    p.append(slim_box((0.11, 0.01, 0.06), at=(0.79, -0.505, ROOF + 0.04), rot=(-0.12, 0, 0), m=M["grille"]))             # its mesh front
    # no front plate here: the winch shows instead (Adriaen, 2026-11-11). Its fairlead, where the rope comes out:
    p.append(slim_box((0.2, 0.03, 0.08), at=(0, FRONT - 0.3, SILL + 0.1), m=M["bumper"]))
    p.append(slim_box((0.12, 0.034, 0.025), at=(0, FRONT - 0.3, SILL + 0.1), m=M["grille"]))
    p.append(rod((0, FRONT - 0.3, SILL + 0.1), (0, FRONT - 0.34, SILL + 0.06), 0.008, M["rope"], verts=5))
    p.append(torus(0.03, 0.008, at=(0, FRONT - 0.345, SILL + 0.03), rot=(0, math.pi / 2, 0), m=M["strap"], major=6, minor=3))
    # roof rack: a black ladder frame with two jerry cans, a crate and a coil of rope
    z = RACK_Z
    for s in (-1, 1):
        p.append(rod((s * 0.7, -0.2, z), (s * 0.7, 1.55, z), 0.022, M["rack"], verts=4))
        for y in (-0.15, 0.7, 1.5):
            p.append(rod((s * 0.7, y, z), (s * 0.68, y, ROOF), 0.018, M["rack"], verts=4))
    for k in range(7):
        y = -0.2 + k * 1.75 / 6
        p.append(rod((-0.7, y, z), (0.7, y, z), 0.016, M["rack"], verts=4))
    for x, cm in CANS:
        p += jerry_can(x, CAN_Y, z + 0.02, M[cm])
    p.append(slim_box(m=M["crate"], bevel=0.02, **CRATE))
    p.append(slim_box((0.03, 0.57, 0.31), at=CRATE["at"], m=M["strap"]))
    # a shovel on the rear door
    # (blade clear above the bumper, beside the spare)
    G["BackDoor"].append(rod((0.52, REAR + 0.04, 0.88), (0.52, REAR + 0.04, 1.52), 0.016, M["crate"], verts=6))
    G["BackDoor"].append(slim_box((0.15, 0.02, 0.2), at=(0.52, REAR + 0.05, 0.8), m=M["rack"]))
    return finish(b)


def camper(wheels=WHEELS):
    M = mats("ca", paint=(0.82, 0.74, 0.58), paint2=(0.95, 0.93, 0.88), bar=(0.95, 0.93, 0.88), bumper=(0.2, 0.2, 0.2), flare=(0.2, 0.2, 0.2),
             rim=(0.95, 0.93, 0.88), cover=(0.25, 0.42, 0.38), canvas=(0.27, 0.45, 0.4), canvas2=(0.95, 0.66, 0.33), base=(0.18, 0.18, 0.18),
             alu=(0.72, 0.73, 0.74), rope=(0.7, 0.62, 0.45))
    b = body(M, "camper", wheels); p, G = b.parts, b.groups
    # rooftop tent folded open over the right side: one shell on the roof, the lid as the floor out over the ladder
    z = ROOF + 0.07
    x0, x1 = -0.72, 2.0
    for s in (-1, 1):
        p.append(rod((s * 0.6, -0.05, ROOF), (s * 0.6, -0.05, z), 0.02, M["base"], verts=6))
        p.append(rod((s * 0.6, 1.45, ROOF), (s * 0.6, 1.45, z), 0.02, M["base"], verts=6))
    p.append(slim_box((x1 - x0, 1.75, 0.07), at=((x0 + x1) / 2, 0.7, z), m=M["base"], bevel=0.02))
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
    p.append(torus(0.15, 0.03, at=(-0.45, 1.3, z + 0.12), m=M["rope"], major=12, minor=3))
    return finish(b)


# ------------------------------------------------------------------ mud, export, preview
def mud_mask(o):
    """Before the bake replaces the materials: how much mud each face takes. Wheels get only a splash, so the tread,
    the grooves and the rim still read apart."""
    me = o.data
    per_slot = [0.25 if m.name.endswith(("_rim", "_hub", "_trim")) else 0.45 if "_tyre" in m.name else 1.0 for m in me.materials]
    mi = np.zeros(len(me.polygons), np.int64)
    if per_slot:
        me.polygons.foreach_get("material_index", mi)
    me.attributes.new("mudf", "FLOAT", "FACE").data.foreach_set("value", np.array(per_slot or [1.0])[mi])


def mud(o, rgb=(0.36, 0.27, 0.18)):
    """Muddy sills: blend the baked colour toward mud below a wavy line, strongest near the wheels (whole arrays in
    numpy, review R2-253)."""
    me = o.data
    nl = len(me.loops)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    vi = np.empty(nl, np.int64)
    me.loops.foreach_get("vertex_index", vi)
    mw = np.array(o.matrix_world)
    v = co.reshape(-1, 3)[vi] @ mw[:3, :3].T + mw[:3, 3]                      # each corner's position in the world
    f = np.ones(len(me.polygons))
    if "mudf" in me.attributes:
        me.attributes["mudf"].data.foreach_get("value", f)
    line = 0.66 + 0.06 * np.sin(v[:, 1] * 7.3) + 0.04 * np.sin(v[:, 1] * 17 + v[:, 0] * 3)
    k = np.clip((line - v[:, 2]) / 0.18, 0.0, 1.0) * 0.8 * corner_values(me, f)
    col = me.color_attributes["Col"]
    c = np.empty(nl * 4, np.float32)
    col.data.foreach_get("color", c)
    c = c.reshape(-1, 4)
    rgb_ = c[:, :3]
    target = np.array(rgb) * (0.6 + 0.4 * np.linalg.norm(rgb_, axis=1))[:, None]
    hit = k > 0
    c[hit, :3] = rgb_[hit] + (target[hit] - rgb_[hit]) * k[hit, None]
    c[hit, 3] = 1.0
    col.data.foreach_set("color", c.ravel())


def preview(style, objs, samples, views=()):
    """Stills of the baked prop on grass in soft daylight: front three-quarter, back, a close-up of the bonnet, the camp
    side with all three doors open, the driver's door and a wheel (views: only these tags; all when empty)."""
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
    shots = [("front", (-4.6, -5.6, 2.3), (0, 0, 0.95), False), ("back", (4.2, 5.8, 2.4), (0, 0, 0.95), False),
             ("detail", (2.6, -3.0, 1.9), (0.45, -0.75, 1.05), False),                  # close on the bonnet, wipers and snorkel
             ("open", (4.6, 3.4, 2.5), (0.2, 0.4, 0.9), True), ("door", (3.4, -0.9, 1.6), (0.5, 0.25, 0.95), True),
             ("wheel", (2.5, -2.4, 0.75), (0.75, -1.1, 0.42), False)]
    for tag, pos, aim, opened in shots:
        if views and tag not in views:
            continue
        doors(objs, opened)
        cam.location = pos
        d = Vector(aim) - Vector(pos)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(HERE, f"preview_{style}_{tag}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f"  preview -> {path}")
    doors(objs, False)


def doors(objs, opened):
    for name, (_, ang) in HINGES.items():
        objs[name].rotation_euler.z = ang if opened else 0.0
    if "Hood" in objs:                                     # baked open too, so the engine bay gets daylight
        objs["Hood"].rotation_euler.x = HOOD_OPEN if opened else 0.0
    bpy.context.view_layer.update()


def jeep_lod(M):
    """The Expedition seen from beyond about 12 m: the same outline in as few triangles as read at that distance, from
    the same shapes as body() and expedition(). Body and cabin as two plain prisms (coarse 10-sided arch cuts: the flares
    and wheels cover their edge), windows as dark quads on the outside, 8-sided wheels with no lugs or hub, the bumpers, grille
    and lamps as boxes and flat polygons, the snorkel, and the roof rack as a frame with the cans and the crate as boxes on
    it. One object, its own AO bake; the page swaps it in for the full jeep."""
    R = zc = WHEEL_R
    lower = prism(LOWER_PROFILE, W, M["paint"])
    wheel_arches(lower, R, zc, 10)
    p = [lower, prism(CAB_PROFILE, CAB_W, M["paint2"], taper=CAB_TAPER)]
    g = M["glass"]
    p.append(poly(windscreen_glass(0.012), g, (0, -5, BELT)))
    zb, zt = GLASS_Z
    for sd in (-1, 1):
        wx = lambda z: cabin_side_x(z, sd, 0.012)
        p.append(poly([(wx(zb), -0.24, zb), (wx(zb), 1.48, zb), (wx(zt), 1.48, zt), (wx(zt), -0.07, zt)], g, (sd * 5, 0.6, 1.3)))   # one strip of side glass
    p.append(poly([(-0.5, REAR + 0.012, zb), (0.5, REAR + 0.012, zb), (0.5, REAR + 0.012, zt), (-0.5, REAR + 0.012, zt)], g, (0, 5, 1.3)))
    # wheels: 8-sided, the tread, the tyre's outer side and the rim as one fan, open on the inside (never seen); 40
    # triangles each (review R2-190). An 8-gon's flat bottom is at its radius x cos(pi / 8), so the radius is divided by
    # that and the wheels stand on the ground like the full jeep's.
    Rl = R / math.cos(math.pi / 8)
    lod_wheel = lambda r, h, sd: [(r, -h * sd, "tyre"), (r, h * sd, "tyre"), (r * 0.62, h * sd, "rim"), (0, h * sd, "rim")]   # noqa: E731
    for y in AXLE_Y:
        for sd in (-1, 1):
            p.append(lathe(lod_wheel(Rl, 0.125, sd), 8, (sd * (W / 2 - 0.1), y, zc), True, M, "wheel_lod"))
            p.append(flare(sd, y, zc, R, 0.045, M["flare"], 10))
    p += bumpers(M)
    p.append(winch(M))
    gx, (gz0, gz1) = GRILLE_W / 2, GRILLE_Z
    p.append(poly([(-gx, FRONT - 0.006, gz0), (gx, FRONT - 0.006, gz0), (gx, FRONT - 0.006, gz1), (-gx, FRONT - 0.006, gz1)], M["grille"], (0, -5, 0.8)))
    for sd in (-1, 1):
        hx, hy, hz, r = sd * LAMP_X, FRONT - 0.008, LAMP_Z, LAMP_R
        p.append(poly([(hx + r * math.cos(t * math.pi / 4), hy, hz + r * math.sin(t * math.pi / 4)) for t in range(8)], M["lamp"], (hx, -5, hz)))
        p.append(poly([(sd * 0.71, REAR + 0.012, 0.67), (sd * 0.62, REAR + 0.012, 0.67), (sd * 0.62, REAR + 0.012, 0.89), (sd * 0.71, REAR + 0.012, 0.89)], M["red"], (0, 5, 0.8)))
        p.append(slim_box((0.06, 0.18, 0.16), at=(sd * (W / 2 + 0.06), -0.28, BELT + 0.17), m=M["trim"]))   # mirror
    sr = R * 0.98                                        # the spare wheel on the back door, the same shape facing back
    p.append(lathe(lod_wheel(sr, 0.12, 1), 8, (0.06, REAR + 0.14, 0.98), False, M, "spare_lod"))
    p += snorkel(M)
    z = RACK_Z                                           # roof rack: the outer frame and three cross bars, square, with its load
    for sd in (-1, 1):
        p.append(slim_box((0.04, 1.78, 0.04), at=(sd * 0.7, 0.67, z), m=M["rack"]))
    for y in (-0.2, 0.67, 1.55):
        p.append(slim_box((1.44, 0.04, 0.03), at=(0, y, z), m=M["rack"]))
    corners = [map_xy(u, v) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]      # the map on the bonnet, as hood_map() lays it
    p.append(poly([(x, y, bonnet_z(y) + 0.007) for x, y in corners], mat("map_paper", (0.93, 0.88, 0.72)), (0, -1, 3)))
    L, H, T = JERRY                                      # each can as one box over its body and handle
    for x, cm in CANS:
        p.append(slim_box((T, L, H + 0.04), at=(x, CAN_Y, z + 0.02 + (H + 0.04) / 2), m=M[cm]))
    p.append(slim_box(m=M["crate"], **CRATE))
    return join(drop_enclosed(p), "JeepLOD")


def build(style, samples, views=None, preview_samples=48, wheels=WHEELS):
    """Build, bake and export one style (views: None for no previews, else the preview tags to render, all when empty;
    wheels as in WHEELS)."""
    reset()
    objs, empties = {"toy": toy, "expedition": expedition, "camper": camper}[style](wheels)
    for o in objs.values():
        apply_all(o)
    # bake with the doors open, so the cabin and the inner door faces get daylight (so bake() must not apply the open
    # rotation: apply=False)
    doors(objs, True)
    if style == "expedition":
        for o in objs.values():
            mud_mask(o)
    bake(list(objs.values()), samples, apply=False)
    doors(objs, False)
    if style == "expedition":
        for o in objs.values():
            mud(o)
    txt = os.path.join(MODELS, f"jeep_{style}.txt") if style == "expedition" else None   # the archived styles: props/jeep/archive
    path = export_glb([*objs.values(), *empties], os.path.join(HERE, f"jeep_{style}.glb"), texcoords=False, txt=txt, extras=True)
    print(f"{style} -> {path}")
    for e in empties:
        print(f"  {e.name}: blender {tuple(round(v, 3) for v in e.location)}")
    if views is not None:
        preview(style, objs, preview_samples, views)
    if style == "expedition":                            # the far LOD, in its own scene and bake (it would shade the full jeep)
        reset()
        M = mats("ex", **EXPEDITION_COLOURS)
        lod = jeep_lod(M); apply_all(lod)
        mud_mask(lod); bake([lod], samples, apply=False); mud(lod)
        lpath = export_glb([lod], os.path.join(HERE, "jeep_expedition_lod.glb"), texcoords=False, txt=os.path.join(MODELS, "jeep_expedition_lod.txt"))
        print(f"  JeepLOD -> {lpath}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", default="expedition", choices=[*STYLES, "all"])
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--preview-samples", type=int, default=48)
    ap.add_argument("--preview", nargs="?", const="", default=None, metavar="VIEWS",
                    help="also render Cycles preview stills: all of them, or only the comma-separated views given")
    ap.add_argument("--wheel", default=WHEELS["kind"], choices=["closed", "open"])
    ap.add_argument("--tyre", default=WHEELS["tyre"], choices=["at", "mt", "road"], help="the tread; only acts with --wheel open")
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])   # under blender -b: the args after --
    views = None if a.preview is None else [v for v in a.preview.split(",") if v]
    for s in (STYLES if a.style == "all" else [a.style]):
        build(s, a.samples, views, a.preview_samples, dict(kind=a.wheel, tyre=a.tyre))
