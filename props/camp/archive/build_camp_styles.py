"""
The archived Canopy Camp prop styles (camp review, Adriaen 2026-11-12: the page uses props/camp/build_camp.py picked()).
Kept buildable, since Adriaen keeps every variant; the GLBs they made are next to this file (README.md). Moved here from
build_camp.py unchanged (review R2-258); the props they share with the picked set (the rustic seat and table, the
materials, the sling) are imported from it.

    storybook  chunky and rounded: pebble fire ring, bell tent with a pennant, striped hammock, paper lanterns
    rustic     closer to real: rough rocks and split logs, an A-frame canvas tent with guy ropes, jar lanterns
    jungle     a rainforest hideout: bamboo tripod and kettle, a leaf-thatched lean-to, bamboo bench, gourd lanterns

Each style is one GLB, props/camp/archive/camp_<style>.glb, holding six objects, each at its own origin, standing on z = 0
with its front toward -Y (three.js +Z): Fire, Seat, Tent, Hammock, Lantern, Table. The Hammock's posts stand at
x = +-HAMMOCK_SPAN / 2. The command line remakes one, with its own AO bake (Cycles ambient occlusion with a ground plane,
times each part's base colour, into one colour attribute), into props/camp/out/ (git-ignored) unless told to write over
the kept copy (an archive keeps only the GLB):

    .venv/bin/python props/camp/archive/build_camp_styles.py --style rustic --samples 64          # -> props/camp/out/camp_rustic.glb
    .venv/bin/python props/camp/archive/build_camp_styles.py --style rustic --overwrite-archive   # -> props/camp/archive/camp_rustic.glb

Exports: storybook(), rustic(), jungle() -> {name: object} in the current scene; build(style, samples,
overwrite_archive=False); STYLES; and the archived props' builders, one function per prop.
"""
import argparse
import math
import os
import random
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CAMP = os.path.dirname(HERE)
sys.path.insert(0, CAMP)                      # build_camp, the picked set's builders
sys.path.insert(0, os.path.dirname(CAMP))     # props/lib
from build_camp import HAMMOCK_SPAN, ROPE, jungle_mats, rope_extras, rustic_mats, rustic_seat, sag_sheet, table_parts  # noqa: E402
from lib.bake import bake  # noqa: E402
from lib.export import export_glb, reset  # noqa: E402
from lib.materials import mat  # noqa: E402
from lib.mesh import apply_all, ball, bevel, box, cyl, drop_faces, join, mesh_obj, quad, rod, rough_up, torus, with_material  # noqa: E402

STYLES = ("storybook", "rustic", "jungle")      # the archived styles build() remakes; the picked set comes from the light bake
rng = random.Random(7)   # the rocks and leaves; each style builder reseeds it (rng.seed(7)) first


# ------------------------------------------------------------------ helpers (the shared ones are in props/lib and build_camp.py)
def rock(r, at, scale, m):
    """A rough rock (the archived rustic fire ring): an icosphere of radius r at at, scaled, its radius pushed in and out
    by up to 35 % with a little noise from the seeded rng."""
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=2, location=at)
    o = bpy.context.object
    o.scale = scale
    for v in o.data.vertices:
        n = v.co.normalized()
        v.co *= 1 + 0.35 * (0.5 * math.sin(n.x * 5.1 + n.y * 3.3) + 0.3 * math.sin(n.y * 7.7 - n.z * 4.1) + 0.2 * rng.uniform(-1, 1))
    return with_material(o, m)


def bamboo(a, b, r, m, node_m, nodes=None):
    parts = [rod(a, b, r, m, verts=10)]
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    n = nodes or max(1, int(L / 0.35))
    for i in range(1, n + 1):
        p = a.lerp(b, i / (n + 1))
        t = torus(r * 1.02, r * 0.22, at=p, m=node_m, major=12, minor=5)
        t.rotation_mode = "QUATERNION"
        t.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
        parts.append(t)
    return parts


def leaf(length, width, at, yaw, pitch, m, droop=0.35, roll=0.0):
    """A big tropical leaf: a strip bent down along its length, with a raised midrib."""
    nl, nw = 10, 4
    verts, faces = [], []
    for i in range(nl + 1):
        t = i / nl
        w = width * (math.sin(math.pi * min(1, t * 1.05)) ** 0.7) / 2
        for j in range(nw + 1):
            s = j / nw * 2 - 1
            verts.append((t * length, s * w, -droop * t * t * length + 0.02 * (1 - abs(s)) * width - 0.04 * s * s * width))
    for i in range(nl):
        for j in range(nw):
            a = i * (nw + 1) + j
            faces.append((a, a + nw + 1, a + nw + 2, a + 1))
    o = mesh_obj("leaf", verts, faces)
    o.location = at
    o.rotation_euler = (roll, -pitch, yaw)
    with_material(o, m)
    sol = o.modifiers.new("s", "SOLIDIFY")
    sol.thickness = 0.008
    return o


def flower(at, m_petal, m_mid, r=0.05):
    parts = [ball(r * 0.35, at=(at[0], at[1], at[2] + r * 0.2), m=m_mid, seg=8)]
    for k in range(5):
        a = k / 5 * 2 * math.pi
        parts.append(ball(r * 0.55, at=(at[0] + math.cos(a) * r * 0.6, at[1] + math.sin(a) * r * 0.6, at[2]), scale=(1, 0.75, 0.3), m=m_petal, seg=8, rot=(0, 0, a)))
    return parts


# ------------------------------------------------------------------ storybook
def storybook():
    rng.seed(7)
    M = {k: mat(f"sb_{k}", c) for k, c in dict(
        stone=(0.62, 0.6, 0.58), stone2=(0.72, 0.68, 0.64), bark=(0.42, 0.26, 0.15), wood=(0.86, 0.68, 0.45), ember=(0.9, 0.32, 0.08),
        cream=(0.96, 0.91, 0.8), pink=(0.95, 0.52, 0.62), door=(0.55, 0.35, 0.3), rope=(0.82, 0.72, 0.52), red=(0.86, 0.2, 0.18),
        white=(0.98, 0.97, 0.94), leaf=(0.35, 0.62, 0.3), yellow=(1.0, 0.8, 0.25), orange=(1.0, 0.55, 0.15), paper=(1.0, 0.86, 0.62)).items()}
    out = {}
    # fire: plump pebbles, a teepee of round logs with pale ends, a glowing ember bed
    p = [ball(0.22, at=(0, 0, 0.02), scale=(1, 1, 0.18), m=M["ember"])]
    for i in range(10):
        a = i / 10 * 2 * math.pi
        p.append(ball(0.16, at=(math.cos(a) * 0.62, math.sin(a) * 0.62, 0.07), scale=(1.1, 0.85, 0.6), m=M["stone" if i % 2 else "stone2"], rot=(0, 0, a)))
    for i in range(5):
        a = i / 5 * 2 * math.pi
        base = Vector((math.cos(a) * 0.36, math.sin(a) * 0.36, 0.05))
        top = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.52))
        p.append(bevel(rod(base, top, 0.06, M["bark"], verts=12), 0.02))
        p.append(rod(base - (top - base).normalized() * 0.005, base + (top - base).normalized() * 0.01, 0.052, M["wood"], verts=12))
    out["Fire"] = join(p, "Fire")
    # seat: a fat round log with pale ring ends and a red mushroom
    p = [bevel(cyl(0.22, 1.5, at=(0, 0, 0.22), rot=(0, math.pi / 2, 0), m=M["bark"], verts=20), 0.04, 3)]
    for s in (-1, 1):
        p.append(cyl(0.19, 0.02, at=(s * 0.751, 0, 0.22), rot=(0, math.pi / 2, 0), m=M["wood"], verts=20))
        p.append(torus(0.1, 0.008, at=(s * 0.762, 0, 0.22), rot=(0, math.pi / 2, 0), m=M["bark"]))
    p.append(cyl(0.025, 0.09, at=(0.55, 0.05, 0.47), m=M["white"], verts=8))
    p.append(ball(0.06, at=(0.55, 0.05, 0.52), scale=(1, 1, 0.6), m=M["red"], seg=12))
    out["Seat"] = join(p, "Seat")
    # tent: a round bell tent, cream with a pink band, a door and a pennant
    p = [cyl(1.15, 0.6, at=(0, 0, 0.3), m=M["cream"], verts=32), cyl(1.18, 1.5, at=(0, 0, 1.33), r2=0.05, m=M["cream"], verts=32),
         cyl(1.17, 0.1, at=(0, 0, 0.62), r2=1.06, m=M["pink"], verts=32)]
    p.append(box((0.62, 0.05, 0.85), at=(0, -1.13, 0.43), m=M["door"], bevel=0.02))
    for s in (-1, 1):
        p.append(cyl(0.07, 0.75, at=(s * 0.38, -1.15, 0.47), m=M["pink"], verts=10))   # rolled-up flaps
    p.append(rod((0, 0, 1.9), (0, 0, 2.35), 0.022, M["bark"]))
    flag = box((0.02, 0.32, 0.18), at=(0, 0.17, 2.24), m=M["pink"])
    p.append(flag)
    p.append(ball(0.035, at=(0, 0, 2.37), m=M["yellow"], seg=8))
    for i in range(8):                                     # little pegs and loops round the skirt
        a = i / 8 * 2 * math.pi + 0.2
        p.append(rod((math.cos(a) * 1.15, math.sin(a) * 1.15, 0.05), (math.cos(a) * 1.35, math.sin(a) * 1.35, 0.0), 0.012, M["rope"], verts=5))
    out["Tent"] = join(p, "Tent")
    # hammock: round-topped posts, a pink and cream striped sling, a pillow
    h = HAMMOCK_SPAN / 2
    p = []
    for s in (-1, 1):
        p.append(bevel(cyl(0.08, 2.5, at=(s * h, 0, 1.25), m=M["bark"], verts=12), 0.02))
        p.append(ball(0.1, at=(s * h, 0, 2.52), m=M["wood"], seg=12))
        p.append(rod((s * h, 0, 1.75), (s * (h - 0.42), 0, 1.35), 0.015, M["rope"], verts=6))
    p.append(sag_sheet(HAMMOCK_SPAN - 0.84, 0.95, 0.55, (0, 0, 1.35), M["cream"], M["pink"], stripes=3))
    p.append(ball(0.2, at=(-0.62, 0, 1.12), scale=(0.75, 1.3, 0.45), m=M["white"]))
    out["Hammock"] = join(p, "Hammock")
    # lantern: a ribbed paper lantern
    p = [ball(0.1, at=(0, 0, -0.11), scale=(1, 1, 0.85), m=M["paper"], seg=12)]
    for z in (-0.04, -0.18):
        p.append(cyl(0.035, 0.02, at=(0, 0, z), m=M["pink"], verts=10))
    for k in range(3):
        p.append(torus(0.1 * math.sqrt(1 - ((k - 1) * 0.5) ** 2), 0.004, at=(0, 0, -0.11 + (k - 1) * 0.042), m=M["pink"], major=16, minor=4))
    out["Lantern"] = join(p, "Lantern")
    # snack table: a stump, a round top, a leaf bowl, fruit and hibiscus
    p = [bevel(cyl(0.34, 0.6, at=(0, 0, 0.3), m=M["bark"], verts=18, r2=0.3), 0.02), bevel(cyl(0.6, 0.07, at=(0, 0, 0.635), m=M["wood"], verts=28), 0.025, 3)]
    p.append(ball(0.2, at=(0.12, 0.02, 0.73), scale=(1, 1, 0.45), m=M["leaf"]))
    for k, c in enumerate(("orange", "yellow", "red")):
        p.append(ball(0.055, at=(0.08 + k * 0.07, 0.0 + (k % 2) * 0.06, 0.8), m=M[c], seg=10))
    for k in range(4):
        a = 2.3 + k * 0.5
        p += flower((math.cos(a) * 0.38, math.sin(a) * 0.38, 0.69), M["pink" if k % 2 else "red"], M["yellow"])
    out["Table"] = join(p, "Table")
    return out


# ------------------------------------------------------------------ rustic
def rustic_fire(M):
    """Rocks round an ember bed and four leaning logs with charred tips (archived: props/lived/build_fire.py replaced it)."""
    p = [ball(0.32, at=(0, 0, 0.0), scale=(1, 1, 0.12), m=M["char"]), ball(0.18, at=(0, 0, 0.03), scale=(1, 1, 0.2), m=M["ember"])]
    for i in range(11):
        a = i / 11 * 2 * math.pi + rng.uniform(-0.1, 0.1)
        p.append(rock(0.15, (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.06), (rng.uniform(1, 1.4), rng.uniform(0.8, 1.1), rng.uniform(0.55, 0.85)), M["rock" if i % 3 else "rock2"]))
    for i in range(4):
        a = i / 4 * 2 * math.pi + 0.4
        base = Vector((math.cos(a) * 0.45, math.sin(a) * 0.45, 0.06))
        top = Vector((-math.cos(a) * 0.05, -math.sin(a) * 0.05, 0.3))
        p.append(rough_up(rod(base, top, 0.065, M["bark"], verts=10), 0.01, 9))
        p.append(rod(top - (top - base).normalized() * 0.1, top + (top - base).normalized() * 0.02, 0.06, M["char"], verts=10))
    return join(p, "Fire")


def rustic_tent(M):
    """A closed A-frame ridge tent (archived; the picked set has wall_tent()). The roof is one sheet over the ridge (no gap
    at the top), its eaves reach the ground sheet, the back gable is sewn in and the front door is two flaps laced shut
    down a centre seam."""
    L, W, H, OV = 2.3, 2.1, 1.55, 0.08
    nx, ny = 12, 8
    verts, faces = [], []
    for i in range(nx + 1):
        x = -L / 2 - OV + (L + 2 * OV) * i / nx
        sag = 0.035 * math.sin(math.pi * i / nx)                         # canvas sags a little between the poles
        for j in range(2 * ny + 1):
            v = j / ny - 1                                               # -1 .. 1 across, 0 at the ridge
            y = v * W / 2
            z = H * (1 - abs(v)) - sag * (1 - abs(v)) ** 0.5 + 0.015 * math.sin(math.pi * abs(v)) * math.sin(x * 9)
            verts.append((x, y * (1 + 0.02 * math.sin(math.pi * i / nx)), max(0.0, z)))
    for i in range(nx):
        for j in range(2 * ny):
            a = i * (2 * ny + 1) + j
            faces.append((a, a + 2 * ny + 1, a + 2 * ny + 2, a + 1))
    roof = with_material(mesh_obj("roof", verts, faces), M["canvas"])
    roof.modifiers.new("s", "SOLIDIFY").thickness = 0.025
    p = [roof]
    def gable(x, tris, m):
        g = mesh_obj("gable", [v for t in tris for v in t], [(3 * k, 3 * k + 1, 3 * k + 2) for k in range(len(tris))], (m,))
        g.modifiers.new("s", "SOLIDIFY").thickness = 0.02
        return g
    xb, xf = L / 2 - 0.01, -L / 2 + 0.01
    p.append(gable(xb, [((xb, -W / 2, 0), (xb, W / 2, 0), (xb, 0, H - 0.01))], M["canvas2"]))
    # front: two flaps that overlap a little at the centre, laced with toggles
    p.append(gable(xf, [((xf, -W / 2, 0), (xf, 0.03, 0), (xf, 0.03, H - 0.01))], M["canvas2"]))
    p.append(gable(xf - 0.012, [((xf - 0.012, W / 2, 0), (xf - 0.012, -0.03, 0), (xf - 0.012, -0.03, H - 0.01))], M["canvas2"]))
    p.append(rod((xf - 0.03, 0, 0.02), (xf - 0.03, 0, H - 0.02), 0.008, M["rope"], verts=5))
    for z in (0.35, 0.75, 1.15):
        p.append(cyl(0.012, 0.09, at=(xf - 0.04, 0, z), rot=(math.pi / 2, 0, 0), m=M["peg"], verts=6))
    for x in (-L / 2 - OV - 0.02, L / 2 + OV + 0.02):
        p.append(rod((x, 0, 0), (x, 0, H + 0.14), 0.025, M["peg"]))
        p.append(rod((x, 0, H + 0.06), (x + math.copysign(0.75, x), 0, 0), 0.007, M["rope"], verts=5))
        p.append(rod((x + math.copysign(0.75, x), 0, 0.08), (x + math.copysign(0.75, x), 0, -0.02), 0.02, M["peg"], verts=6))
    for x in (-L / 4, L / 4):                                            # side guy ropes from the eaves
        for s in (-1, 1):
            p.append(rod((x, s * W * 0.36, 0.42), (x, s * (W / 2 + 0.45), 0), 0.006, M["rope"], verts=4))
            p.append(rod((x, s * (W / 2 + 0.45), 0.07), (x, s * (W / 2 + 0.45), -0.02), 0.018, M["peg"], verts=6))
    p.append(box((L + 0.3, W + 0.2, 0.015), at=(0, 0, 0.008), m=M["canvas2"]))
    t = join(p, "Tent")
    t.rotation_euler = (0, 0, math.pi / 2)        # door end toward -Y
    return t


def rustic_hammock(M):
    """A canvas sling on two rough posts (archived; the picked set has the jungle hammock)."""
    h = HAMMOCK_SPAN / 2
    p = []
    for s in (-1, 1):
        p.append(rough_up(cyl(0.09, 2.5, at=(s * h, 0, 1.25), m=M["bark"], verts=12), 0.012, 8))
        p.append(rod((s * h, 0, 1.75), (s * (h - 0.4), 0.2, 1.35), 0.01, M["rope"], verts=5))
        p.append(rod((s * h, 0, 1.75), (s * (h - 0.4), -0.2, 1.35), 0.01, M["rope"], verts=5))
    p.append(sag_sheet(HAMMOCK_SPAN - 0.8, 0.9, 0.55, (0, 0, 1.35), M["sling"]))
    p.append(box((0.5, 0.35, 0.04), at=(0.3, 0.08, 0.86), rot=(0, 0, 0.3), m=M["red"], bevel=0.01))   # a folded blanket
    return join(p, "Hammock")


def rustic_lantern(M):
    """The jar lantern (archived rustic style; the page draws its own), trimmed (camp review 2026-11-12, 42 triangles): a 6-sided glass jar, a 6-sided tin lid,
    the wire handle as one flat quad."""
    p = [cyl(0.065, 0.16, at=(0, 0, -0.14), m=M["glass"], verts=6, smooth=False),
         cyl(0.072, 0.03, at=(0, 0, -0.05), m=M["tin"], verts=6, r2=0.05, smooth=False)]
    p.append(quad([(-0.05, 0, -0.035), (0.05, 0, -0.035), (0.03, 0, 0.0), (-0.03, 0, 0.0)], M["tin"]))
    for o in p[:2]:                                    # the jar's top and the lid's bottom are hidden inside each other
        drop_faces(o, lambda n, c: abs(n.z) > 0.9 and -0.07 < c.z < -0.055)
    return join(p, "Lantern")


def rustic():
    """The archived rustic style's six props, made in this order (the order its props draw from the seeded rng)."""
    rng.seed(7)
    M = rustic_mats()
    out = {"Fire": rustic_fire(M), "Seat": rustic_seat(M), "Tent": rustic_tent(M), "Hammock": rustic_hammock(M), "Lantern": rustic_lantern(M)}
    p, plate = table_parts(M)
    out["Table"] = join(p + [plate], "Table")       # the plate joined in (the picked set keeps it apart, as FruitBowl)
    return out


# ------------------------------------------------------------------ jungle
def tripod_kettle(M):
    """A bamboo tripod over the fire with a kettle on a cord (jungle materials)."""
    p = []
    for i in range(3):
        a = i / 3 * 2 * math.pi + 0.3
        p += bamboo((math.cos(a) * 0.75, math.sin(a) * 0.75, 0), (0, 0, 1.3), 0.03, M["bamboo"], M["node"], nodes=3)
    p.append(rod((0, 0, 1.28), (0, 0, 0.72), 0.004, M["rope"], verts=4))
    p.append(ball(0.13, at=(0, 0, 0.58), scale=(1, 1, 0.8), m=M["kettle"]))
    p.append(rod((0.1, 0, 0.6), (0.2, 0, 0.67), 0.015, M["kettle"]))
    p.append(torus(0.1, 0.008, at=(0, 0, 0.7), rot=(math.pi / 2, 0, 0), m=M["kettle"], major=16, minor=4))
    return p


def jungle_fire(M):
    """A stone ring with a bamboo tripod and kettle (archived)."""
    p = [ball(0.3, at=(0, 0, 0), scale=(1, 1, 0.12), m=M["char"]), ball(0.17, at=(0, 0, 0.03), scale=(1, 1, 0.22), m=M["ember"])]
    for i in range(9):
        a = i / 9 * 2 * math.pi
        p.append(ball(0.15, at=(math.cos(a) * 0.6, math.sin(a) * 0.6, 0.06), scale=(1.25, 0.9, 0.5), m=M["stone" if i % 2 else "stone2"], rot=(0, 0, a)))
    p += tripod_kettle(M)
    return join(p, "Fire")


def jungle_seat(M):
    """A bamboo bench (archived)."""
    p = []
    for k in range(3):
        p += bamboo((-0.75, (k - 1) * 0.085, 0.42), (0.75, (k - 1) * 0.085, 0.42), 0.042, M["bamboo"], M["node"], nodes=3)
    for s in (-0.62, 0.62):
        for d in (-1, 1):
            p += bamboo((s, d * 0.2, 0), (s, -d * 0.12, 0.4), 0.025, M["bamboo"], M["node"], nodes=1)
        p.append(rod((s, -0.16, 0.38), (s, 0.16, 0.38), 0.008, M["rope"], verts=4))
    return join(p, "Seat")


def jungle_tent(M):
    """A lean-to of bamboo with a thatch of big leaves and a woven mat (archived)."""
    p = []
    fx, bx, wy, fh, bh = -1.05, 1.0, 1.1, 1.95, 0.75
    for y in (-wy, wy):
        p += bamboo((fx, y, 0), (fx, y, fh), 0.045, M["bamboo"], M["node"])
        p += bamboo((bx, y, 0), (bx, y, bh), 0.045, M["bamboo"], M["node"], nodes=1)
        p += bamboo((fx - 0.15, y, fh + 0.02), (bx + 0.2, y, bh - 0.12), 0.035, M["bamboo"], M["node"])
    p += bamboo((fx, -wy - 0.2, fh), (fx, wy + 0.2, fh), 0.035, M["bamboo"], M["node"])
    slope = math.atan2(fh - bh, bx - fx)
    for row in range(6):
        t = row / 5
        x = fx - 0.1 + (bx - fx + 0.2) * t
        z = fh + 0.06 - (fh - bh) * t
        for k in range(6):
            y = -wy - 0.15 + k * (2 * wy + 0.3) / 5 + (row % 2) * 0.18
            p.append(leaf(1.0, 0.42, (x - 0.15, y, z + 0.04), 0.0 + rng.uniform(-0.15, 0.15), -slope - 0.12, M["leaf" if (row + k) % 2 else "leaf2"], droop=0.12, roll=rng.uniform(-0.15, 0.15)))
    p.append(box((1.7, 1.9, 0.02), at=(0, 0, 0.012), m=M["weave"]))
    for k in range(5):
        p.append(box((1.7, 0.02, 0.022), at=(0, -0.8 + k * 0.4, 0.014), m=M["node"]))
    t = join(p, "Tent")
    t.rotation_euler = (0, 0, math.pi / 2)       # open front toward -Y
    return t


def jungle_hammock(M):
    """The archived jungle hammock: the woven sling (finer than the picked one's) on bamboo posts, with two leaves
    tucked over them."""
    h = HAMMOCK_SPAN / 2
    p = []
    for s in (-1, 1):
        p += bamboo((s * h, 0, 0), (s * h, 0, 2.4), 0.055, M["bamboo"], M["node"])
        p.append(rod((s * h, 0, ROPE[0]), (s * (h - 0.4), 0, ROPE[1]), 0.012, M["rope"], verts=5))
    p.append(sag_sheet(HAMMOCK_SPAN - 0.8, 0.95, 0.55, (0, 0, 1.35), M["weave"], M["orange"], stripes=4))
    for s in (-1, 1):                                    # two leaves tucked over the posts
        p.append(leaf(0.9, 0.38, (s * h, 0, 2.4), 0 if s < 0 else math.pi, 0.5, M["leaf2"], droop=0.3))
    return rope_extras(join(p, "Hammock"))


def jungle_lantern(M):
    """A gourd lantern (archived)."""
    p = [ball(0.075, at=(0, 0, -0.17), m=M["gourd"], seg=12), ball(0.05, at=(0, 0, -0.07), m=M["gourd"], seg=10), cyl(0.012, 0.05, at=(0, 0, -0.025), m=M["node"], verts=6)]
    return join(p, "Lantern")


def jungle_table(M):
    """A stone table with fruit and flowers (archived)."""
    p = []
    for i in range(3):
        a = i / 3 * 2 * math.pi
        p.append(ball(0.17, at=(math.cos(a) * 0.3, math.sin(a) * 0.3, 0.2), scale=(1, 1, 1.25), m=M["stone"]))
    p.append(ball(0.6, at=(0, 0, 0.5), scale=(1, 0.8, 0.09), m=M["stone2"], seg=20))
    p.append(leaf(0.85, 0.42, (-0.42, 0, 0.56), 0, 0, M["leaf2"], droop=0.0))
    for k, c in enumerate(("orange", "yellow", "orange")):
        p.append(ball(0.055, at=(-0.1 + k * 0.08, 0.02 * k, 0.62), m=M[c], seg=10))
    for k in range(3):
        p += flower((0.2 + k * 0.08, -0.15 + k * 0.12, 0.58), M["pink"], M["yellow"])
    return join(p, "Table")


def jungle():
    """The archived jungle style's six props, made in this order (the order its props draw from the seeded rng)."""
    rng.seed(7)
    M = jungle_mats()
    return {"Fire": jungle_fire(M), "Seat": jungle_seat(M), "Tent": jungle_tent(M), "Hammock": jungle_hammock(M),
            "Lantern": jungle_lantern(M), "Table": jungle_table(M)}


# ------------------------------------------------------------------ bake and export
def build(style, samples, overwrite_archive=False):
    """Make an archived style in a fresh scene, give it its own AO light and write it to props/camp/out/camp_<style>.glb
    (git-ignored), or, with overwrite_archive, over props/camp/archive/camp_<style>.glb (an archive keeps no base64 copy)."""
    reset()
    objs = {"storybook": storybook, "rustic": rustic, "jungle": jungle}[style]()
    for o in objs.values():
        apply_all(o)
        o.location = (0, 0, 0)
    bake(list(objs.values()), samples, split=True)     # the archived styles split long edges for the AO
    out = HERE if overwrite_archive else os.path.join(CAMP, "out")
    os.makedirs(out, exist_ok=True)
    path = export_glb(list(objs.values()), os.path.join(out, f"camp_{style}.glb"), texcoords=False, check="warn")   # archived: report only
    print(f"{style} -> {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", required=True, choices=STYLES)
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--overwrite-archive", action="store_true", help="write over the kept GLB in props/camp/archive/")
    a = ap.parse_args()
    build(a.style, a.samples, a.overwrite_archive)
