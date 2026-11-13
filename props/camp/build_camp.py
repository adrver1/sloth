"""
Camp props for the Canopy Camp game (apps/canopy-prototype/camp.html), in three styles to pick from:

    storybook  chunky and rounded: pebble fire ring, bell tent with a pennant, striped hammock, paper lanterns
    rustic     closer to real: rough rocks and split logs, an A-frame canvas tent with guy ropes, jar lanterns
    jungle     a rainforest hideout: bamboo tripod and kettle, a leaf-thatched lean-to, bamboo bench, gourd lanterns
    picked     the set in use: rustic, with a canvas wall tent with planks before the door, the jungle tripod and kettle over the rustic fire and the jungle hammock

Storybook, Rustic and Jungle (and the first pre-light-map picked GLB) are archived (camp review, Adriaen 2026-11-12): their
GLBs and txt files are in props/camp/archive/ and the page no longer offers them. Their builders stay here, one function
per prop, since the picked set is made from some of them (rustic_seat, rustic_lantern, rustic_table, jungle_hammock). The page's picked set is built and baked by bake_camp_lightmap.py (through
props/bake_all.py, on the GPU); this script's own AO bake only remakes an archived style:

    .venv/bin/python props/camp/build_camp.py --style rustic --samples 64     # -> props/camp/archive/camp_rustic.glb

Each style is one GLB (props/camp/camp_<style>.glb) holding six objects, each at its own origin, standing on
z = 0 with its front toward -Y (three.js +Z): Fire, Seat, Tent, Hammock, Lantern, Table. The page places them.
Light is baked: Cycles ambient occlusion (with a ground plane, so props darken where they meet the ground)
times each part's base colour goes into one colour attribute, so the page draws them with a plain Lambert
material and no textures. The Hammock's posts stand at x = +-HAMMOCK_SPAN / 2, to match the page.
"""
import argparse
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from lib.bake import bake  # noqa: E402
from lib.export import export_glb, reset  # noqa: E402
from lib.materials import mat  # noqa: E402
from lib.mesh import _finish, apply_all, ball, bevel, box, cyl, drop_faces, join, rod, rough_up, torus  # noqa: E402

HAMMOCK_SPAN = 2.86
STYLES = ("storybook", "rustic", "jungle", "picked")
rng = random.Random(7)


# ------------------------------------------------------------------ helpers (the shared ones are in props/lib)
def rock(r, at, scale, m, rough=0.35, detail=2):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=detail, location=at)
    o = bpy.context.object
    o.scale = scale
    for v in o.data.vertices:
        n = v.co.normalized()
        v.co *= 1 + rough * (0.5 * math.sin(n.x * 5.1 + n.y * 3.3) + 0.3 * math.sin(n.y * 7.7 - n.z * 4.1) + 0.2 * rng.uniform(-1, 1))
    return _finish(o, m)


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


def painted_bamboo(a, h, r, m, node_m, step=0.38, band=0.035, sides=8):
    """A plain octagonal pole (Adriaen 2026-11-11: no modelled rings): one flat-shaded eight-sided tube
    with a ring of vertices at each node, the thin node bands taking the node colour, so the nodes are
    only painted on; a top cap, no hidden faces. Standing at a, height h. About 16 triangles a metre."""
    zs, kinds, z = [0.0], [], 0.0
    while z < h - 1e-4:
        z = min(h, z + step - band); zs.append(z); kinds.append(0)
        if z < h - band:
            z += band; zs.append(z); kinds.append(1)
    n = sides
    verts = [(a[0] + r * math.cos((k + 0.5) * 2 * math.pi / n), a[1] + r * math.sin((k + 0.5) * 2 * math.pi / n), a[2] + zz)
             for zz in zs for k in range(n)]
    faces, mats = [], []
    for i, kind in enumerate(kinds):
        for k in range(n):
            faces.append((i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k)); mats.append(kind)
    faces.append(tuple(len(zs) * n - n + k for k in range(n))); mats.append(0)
    me = bpy.data.meshes.new("post")
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new("post", me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    o.data.materials.append(node_m)
    for poly, mi in zip(o.data.polygons, mats):
        poly.material_index = mi
    return [o]


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
    me = bpy.data.meshes.new("leaf")
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new("leaf", me)
    bpy.context.collection.objects.link(o)
    o.location = at
    o.rotation_euler = (roll, -pitch, yaw)
    _finish(o, m)
    sol = o.modifiers.new("s", "SOLIDIFY")
    sol.thickness = 0.008
    return o


def sag_sheet(span, width, depth, at, m_a, m_b=None, stripes=0, thick=0.012, nx=24, ny=6):
    """A hanging fabric sling between x = -span/2 and +span/2, sagging by depth."""
    verts, faces, mats = [], [], []
    for i in range(nx + 1):
        u = i / nx
        w = math.sin(math.pi * u)
        for j in range(ny + 1):
            v = j / ny - 0.5
            x = (u - 0.5) * span
            y = v * width * (0.3 + 0.7 * w)
            z = -depth * w - 0.1 * w * (1 - 4 * v * v)
            verts.append((x, y, z))
    for i in range(nx):
        for j in range(ny):
            a = i * (ny + 1) + j
            faces.append((a, a + ny + 1, a + ny + 2, a + 1))
            mats.append(1 if stripes and (j // max(1, ny // stripes)) % 2 else 0)
    me = bpy.data.meshes.new("sling")
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new("sling", me)
    bpy.context.collection.objects.link(o)
    o.location = at
    o.data.materials.append(m_a)
    o.data.materials.append(m_b or m_a)
    for p, mi in zip(o.data.polygons, mats):
        p.material_index = mi
        p.use_smooth = True
    sol = o.modifiers.new("s", "SOLIDIFY")
    sol.thickness = thick
    return o


def flower(at, m_petal, m_mid, r=0.05):
    parts = [ball(r * 0.35, at=(at[0], at[1], at[2] + r * 0.2), m=m_mid, seg=8)]
    for k in range(5):
        a = k / 5 * 2 * math.pi
        parts.append(ball(r * 0.55, at=(at[0] + math.cos(a) * r * 0.6, at[1] + math.sin(a) * r * 0.6, at[2]), scale=(1, 0.75, 0.3), m=m_petal, seg=8, rot=(0, 0, a)))
    return parts


# ------------------------------------------------------------------ the three styles
def storybook():
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


def rustic_mats():
    """The rustic materials, by short name."""
    return {k: mat(f"ru_{k}", c) for k, c in dict(
        rock=(0.45, 0.44, 0.42), rock2=(0.36, 0.35, 0.33), bark=(0.3, 0.21, 0.14), wood=(0.68, 0.52, 0.36), char=(0.08, 0.06, 0.05),
        ember=(0.7, 0.2, 0.05), canvas=(0.48, 0.5, 0.32), canvas2=(0.38, 0.4, 0.25), rope=(0.7, 0.62, 0.45), peg=(0.55, 0.42, 0.28),
        sling=(0.32, 0.38, 0.26), glass=(0.92, 0.78, 0.45), tin=(0.55, 0.56, 0.58), white=(0.9, 0.88, 0.82), red=(0.65, 0.15, 0.12)).items()}


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


def rustic_seat(M):
    """The seat (picked): a split half log on two short stumps, its flat top at z = 0.361."""
    lg = cyl(0.25, 1.5, at=(0, 0, 0.0), rot=(0, math.pi / 2, 0), m=M["bark"], verts=24)
    apply_all(lg)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_outer=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    rough_up(lg, 0.008, 12)
    lg.location.z = 0.36
    top = box((1.48, 0.46, 0.01), at=(0, 0, 0.361), m=M["wood"])
    p = [lg, top]
    for s in (-1, 1):
        p.append(rough_up(cyl(0.16, 0.36, at=(s * 0.5, 0, 0.18), m=M["bark"], verts=14), 0.01, 10))
    return join(p, "Seat")


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
    me = bpy.data.meshes.new("roof")
    me.from_pydata(verts, [], faces)
    roof = bpy.data.objects.new("roof", me); bpy.context.collection.objects.link(roof); _finish(roof, M["canvas"])
    roof.modifiers.new("s", "SOLIDIFY").thickness = 0.025
    p = [roof]
    def gable(x, tris, m):
        me = bpy.data.meshes.new("gable")
        me.from_pydata([v for t in tris for v in t], [], [(3 * k, 3 * k + 1, 3 * k + 2) for k in range(len(tris))])
        g = bpy.data.objects.new("gable", me); bpy.context.collection.objects.link(g); _finish(g, m, False)
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
    """The jar lantern (picked), trimmed (camp review 2026-11-12, 34 triangles): a 6-sided glass jar, a 6-sided tin lid,
    the wire handle as one flat quad."""
    p = [cyl(0.065, 0.16, at=(0, 0, -0.14), m=M["glass"], verts=6, smooth=False),
         cyl(0.072, 0.03, at=(0, 0, -0.05), m=M["tin"], verts=6, r2=0.05, smooth=False)]
    hq = bpy.data.meshes.new("handle")
    hq.from_pydata([(-0.05, 0, -0.035), (0.05, 0, -0.035), (0.03, 0, 0.0), (-0.03, 0, 0.0)], [], [(0, 1, 2, 3)])
    ho = bpy.data.objects.new("handle", hq); bpy.context.collection.objects.link(ho); _finish(ho, M["tin"], False)
    p.append(ho)
    for o in p[:2]:                                    # the jar's top and the lid's bottom are hidden inside each other
        drop_faces(o, lambda f: abs(f.normal.z) > 0.9 and -0.07 < f.center.z < -0.055)
    return join(p, "Lantern")


def rustic_table(M):
    """The snack table (picked), trimmed (camp review 2026-11-12, about 190 triangles): two 8-sided stumps with no caps
    (the top hides theirs), four plain plank boxes, a tin mug and a plate of three tomatoes."""
    p = []
    for s in (-1, 1):
        leg = rough_up(cyl(0.2, 0.62, at=(s * 0.45, 0, 0.31), m=M["bark"], verts=8, smooth=False), 0.012, 10)
        p.append(drop_faces(leg, lambda f: abs(f.normal.z) > 0.9))
    for k in range(4):
        p.append(box((1.3, 0.17, 0.05), at=(0, (k - 1.5) * 0.18, 0.645), m=M["wood"]))
    p.append(drop_faces(cyl(0.05, 0.1, at=(0.3, 0.1, 0.72), m=M["tin"], verts=8, smooth=False), lambda f: f.normal.z < -0.9))
    p.append(drop_faces(cyl(0.14, 0.03, at=(-0.2, -0.05, 0.685), m=M["white"], verts=8, r2=0.12, smooth=False), lambda f: f.normal.z < -0.9))
    for k in range(3):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=0.045, subdivisions=1, location=(-0.25 + k * 0.05, -0.05 + 0.02 * (k % 2), 0.74))
        p.append(_finish(bpy.context.object, M["red"], smooth=False))
    return join(p, "Table")


def rustic():
    """The archived rustic style's six props, made in this order (the order its props draw from the seeded rng)."""
    M = rustic_mats()
    return {"Fire": rustic_fire(M), "Seat": rustic_seat(M), "Tent": rustic_tent(M), "Hammock": rustic_hammock(M),
            "Lantern": rustic_lantern(M), "Table": rustic_table(M)}


STOVE = (1.0, 0.85, 0.42)        # the stove's fire, in the tent's own frame (bake_camp_lightmap.py puts a light there)


def wall_tent():
    """Adriaen's pick (2026-11-11, from two photos): a white canvas wall tent you can walk into. Straight side walls,
    a ridge pole on wide A-frames of crossed shear poles at each end with the eave poles lashed onto them, an open
    doorway with the flap rolled up above it, loose planks before the door. Inside: a lining (so the inside gets its
    own bake), a plank floor, a bed along the left wall and a wood stove on the right under the stovepipe.
    Built at its final size with the door toward -Y; every canvas sheet is a small grid so the AO bake has vertices to
    vary at (the object is "coarse": no densify). camp.html mirrors W, D, Y0, the door and the furniture for walking."""
    M = {k: mat(f"wt_{k}", c) for k, c in dict(
        canvas=(0.93, 0.9, 0.82), canvas2=(0.86, 0.83, 0.74), hem=(0.55, 0.5, 0.4), lining=(1.0, 0.93, 0.78),
        pole=(0.74, 0.62, 0.46), rope=(0.62, 0.54, 0.4), plank=(0.58, 0.43, 0.28), plank2=(0.5, 0.36, 0.23),
        fascia=(0.36, 0.26, 0.17), pipe=(0.22, 0.22, 0.24), glow=(0.45, 0.16, 0.06), stone=(0.45, 0.44, 0.42),
        ticking=(0.84, 0.82, 0.76), blanket=(0.62, 0.2, 0.15), pillow=(0.94, 0.93, 0.9),
        iron=(0.15, 0.15, 0.16), brass=(0.72, 0.56, 0.26), tin=(0.55, 0.56, 0.58)).items()}
    W, D, E, H, Y0, Z0 = 1.4, 1.225, 1.3, 2.7, 0.275, 0.0    # half width, half depth, wall height, ridge, body offset, floor (the back stays
    # in front of the low branches of the hero tree behind it, where the sloths hang)
    DW, DH = 0.45, 1.95                                       # doorway half width and height
    mats = list(M.values()); mi = {k: i for i, k in enumerate(M)}
    V, F, FM = [], [], []
    def quad_grid(f, nu, nv, mf, flip=False):
        base = len(V)
        for i in range(nu + 1):
            for j in range(nv + 1):
                V.append(f(i / nu, j / nv))
        for i in range(nu):
            for j in range(nv):
                a = base + i * (nv + 1) + j; q = (a, a + nv + 1, a + nv + 2, a + 1)
                F.append(q[::-1] if flip else q); FM.append(mi[mf(i, j)])
    def face(pts, m):
        base = len(V); V.extend(pts); F.append(tuple(range(base, base + len(pts)))); FM.append(mi[m])
    # roof: two slopes, 6 panels front to back (alternating cream so the seams read), sagging a little between poles
    ex, ez = W + 0.1, Z0 + E - 0.05
    for s in (1, -1):
        def roof(u, v, s=s):
            y = Y0 - D - 0.12 + (2 * D + 0.24) * u
            sag = 0.05 * math.sin(math.pi * v) * (0.4 + 0.6 * abs(math.sin(math.pi * u * 3)))
            return (s * ex * (1 - v), y, ez + (Z0 + H - ez) * v - sag)
        quad_grid(roof, 6, 3, lambda i, j: "canvas" if i % 2 else "canvas2", flip=s < 0)
    # side walls, flaring a touch to the ground, with a dirty hem
    for s in (1, -1):
        zs = (Z0, Z0 + 0.13, Z0 + E + 0.06)          # tops tucked up under the roof, no slit to the sky
        quad_grid(lambda u, v, s=s: (s * (W + 0.05 * (1 - v)), Y0 - D + 2 * D * u, zs[round(v * 2)]), 6, 2,
                  lambda i, j: "hem" if j == 0 else "canvas", flip=s < 0)
    # back gable (faces +Y) and the front (faces -Y) round the open doorway; both flare at the foot like the side walls
    yb, yf = Y0 + D, Y0 - D
    zg = lambda x: Z0 + E + 0.06 + (H - E - 0.06) * (1 - abs(x) / W)      # the gable's sloping top edge
    face([(W + 0.05, yb, Z0), (-W - 0.05, yb, Z0), (-W, yb, zg(W)), (0, yb, Z0 + H), (W, yb, zg(W))], "canvas2")
    face([(-W - 0.05, yf, Z0), (-DW, yf, Z0), (-DW, yf, zg(DW)), (-W, yf, zg(W))], "canvas2")
    face([(DW, yf, Z0), (W + 0.05, yf, Z0), (W, yf, zg(W)), (DW, yf, zg(DW))], "canvas2")
    face([(-DW, yf, Z0 + DH), (DW, yf, Z0 + DH), (DW, yf, zg(DW)), (0, yf, Z0 + H), (-DW, yf, zg(DW))], "canvas2")
    # the lining: every canvas face again, a few cm in and facing inward, so the inside bakes its own light
    n_out = len(F)
    for k in range(n_out):
        base = len(V)
        for i in F[k]:
            x, y, z = V[i]
            V.append((x * 0.982, Y0 + (y - Y0) * 0.986, z - 0.03 * min(1.0, z / 0.3)))
        F.append(tuple(range(base, base + len(F[k])))[::-1]); FM.append(mi["lining"])
    # plank floor inside, and loose planks before the door (Adriaen: not a raised platform); top and long edges only
    for k in range(7):
        x0 = -W + 2 * W * k / 7
        face([(x0 + 0.01, yf + 0.03, 0.02), (x0 + 2 * W / 7 - 0.01, yf + 0.03, 0.02), (x0 + 2 * W / 7 - 0.01, yb - 0.03, 0.02), (x0 + 0.01, yb - 0.03, 0.02)],
             "plank" if k % 2 else "plank2")
    for k in range(5):
        cy, ln, yaw, cx = yf - 0.115 - k * 0.185, 2 * (W + 0.2) + 0.08 * math.sin(k * 2.7), 0.018 * math.sin(k * 1.9 + 1), 0.04 * math.sin(k * 3.1)
        c, s_, hw2, t = math.cos(yaw), math.sin(yaw), 0.086, 0.03
        P = lambda u, v, z: (cx + u * c - v * s_, cy + u * s_ + v * c, z)
        m = "plank" if k % 2 else "plank2"
        face([P(-ln / 2, -hw2, t), P(ln / 2, -hw2, t), P(ln / 2, hw2, t), P(-ln / 2, hw2, t)], m)
        face([P(-ln / 2, -hw2, 0), P(ln / 2, -hw2, 0), P(ln / 2, -hw2, t), P(-ln / 2, -hw2, t)], "fascia")
        face([P(ln / 2, hw2, 0), P(-ln / 2, hw2, 0), P(-ln / 2, hw2, t), P(ln / 2, hw2, t)], "fascia")
    me = bpy.data.meshes.new("wall_tent"); me.from_pydata(V, [], F)
    for m in mats: me.materials.append(m)
    for p, k in zip(me.polygons, FM): p.material_index = k
    body = bpy.data.objects.new("canvas", me); bpy.context.collection.objects.link(body)
    p = [body]
    # frame: open-ended poles (no caps anyone would see)
    def pole(a, b, r, m, verts=6):
        return rod(a, b, r, m, verts=verts, caps=False)
    rz = Z0 + H + 0.05
    p.append(pole((0, yf - 0.45, rz), (0, yb + 0.45, rz), 0.05, M["pole"]))                            # ridge pole
    # a wide A-frame of crossed shear poles at each end (as in the second photo); the eave poles rest on them, lashed on
    xe, ze, zc = W + 0.12, ez + 0.03, rz - 0.06
    tj = (ze - 0.06) / zc                                    # where up a shear pole the eave pole sits
    xf = xe / (1 - tj)                                       # so the feet spread wide enough to carry it
    jy = {}
    for ye, s in ((yf, -1), (yb, 1)):
        foot_y, cy = ye + s * 0.34, ye + s * 0.17
        for side in (1, -1):
            a = Vector((side * xf, foot_y, 0.0)); c = Vector((0, cy, zc))
            p.append(pole(a, a + (c - a) * 1.1, 0.045, M["pole"]))
        p.append(pole((0, cy - 0.05, rz - 0.04), (0, cy + 0.05, rz - 0.04), 0.065, M["rope"]))      # lashing at the crossing
        jy[s] = foot_y + (cy - foot_y) * tj
    for side in (1, -1):
        p.append(pole((side * xe, jy[-1] - 0.16, ze), (side * xe, jy[1] + 0.16, ze), 0.035, M["pole"]))
        for s in (1, -1):
            p.append(pole((side * xe, jy[s] - 0.045, ze - 0.01), (side * xe, jy[s] + 0.045, ze - 0.01), 0.055, M["rope"]))   # tied to the A-frame
    # the outer door flap, rolled up above the doorway and tied (Adriaen); the doorway stays open
    p.append(pole((-DW - 0.12, yf - 0.08, DH + 0.09), (DW + 0.12, yf - 0.08, DH + 0.09), 0.08, M["canvas2"]))
    for x in (-DW + 0.08, DW - 0.08):
        p.append(pole((x - 0.03, yf - 0.08, DH + 0.09), (x + 0.03, yf - 0.08, DH + 0.09), 0.09, M["rope"]))
    # the bed along the left wall, head at the back (Adriaen: feet not by the stove): a plank box, a ticking mattress,
    # a red blanket over the foot end and a pillow at the head
    bx, by = -W + 0.48, yb - 0.06 - 0.95
    p.append(box((0.84, 1.9, 0.3), at=(bx, by, 0.15), m=M["plank2"]))
    p.append(box((0.8, 1.86, 0.14), at=(bx, by, 0.37), m=M["ticking"]))
    p.append(box((0.88, 1.25, 0.06), at=(bx, by - 0.3, 0.45), m=M["blanket"]))
    p.append(box((0.56, 0.3, 0.1), at=(bx, yb - 0.3, 0.49), rot=(0, 0, 0.05), m=M["pillow"]))
    # the wood stove on the right on a stone pad (Adriaen: a bit more detail): a cast-iron box with a wider top plate,
    # a framed fire door with a glowing window and a brass handle, an ash lip, splayed legs, a pipe collar and a kettle
    sx, sy = STOVE[0], STOVE[1]
    p.append(box((0.7, 0.85, 0.04), at=(sx, sy, 0.04), m=M["stone"]))
    p.append(box((0.42, 0.62, 0.34), at=(sx, sy, 0.41), m=M["pipe"]))
    p.append(box((0.5, 0.7, 0.035), at=(sx, sy, 0.6), m=M["iron"]))                                  # top plate
    p.append(box((0.03, 0.66, 0.035), at=(sx - 0.2, sy, 0.235), m=M["iron"]))                         # ash lip
    for ax_ in (-1, 1):
        for ay in (-1, 1):
            p.append(pole((sx + ax_ * 0.22, sy + ay * 0.32, 0.06), (sx + ax_ * 0.16, sy + ay * 0.25, 0.25), 0.022, M["iron"], verts=4))
    p.append(box((0.025, 0.36, 0.26), at=(sx - 0.215, sy, 0.41), m=M["iron"]))                      # door frame
    p.append(box((0.01, 0.26, 0.14), at=(sx - 0.231, sy, 0.42), m=M["glow"]))                       # the fire window
    p.append(pole((sx - 0.25, sy + 0.12, 0.39), (sx - 0.25, sy + 0.12, 0.46), 0.012, M["brass"], verts=4))   # handle
    p.append(pole((sx, sy + 0.12, 0.6), (sx, sy + 0.12, 0.7), 0.09, M["iron"], verts=8))               # pipe collar
    p += stove_kettle(M, (sx + 0.02, sy - 0.17, 0.62))                                                  # kettle on the top plate
    p.append(pole((sx, sy + 0.12, 0.6), (sx, sy + 0.12, Z0 + H + 0.62), 0.065, M["pipe"], verts=8))
    # rain cap (Adriaen 2026-11-12): a flat cone held 6 cm over the pipe's mouth on two thin legs, closed underneath so
    # it reads from the ground (8 + 6 + 2 x 6 = 26 tris); the smoke (atmosphere.js) comes out under it
    top = Z0 + H + 0.62
    bpy.ops.mesh.primitive_cone_add(radius1=0.15, radius2=0.0, depth=0.07, vertices=8, end_fill_type="NGON", location=(sx, sy + 0.12, top + 0.095))
    p.append(_finish(bpy.context.object, M["pipe"], smooth=False))
    for a in (0.0, math.pi):
        lx, ly = math.cos(a) * 0.055, math.sin(a) * 0.055
        p.append(rod((sx + lx, sy + 0.12 + ly, top - 0.03), (sx + lx * 1.4, sy + 0.12 + ly * 1.4, top + 0.065), 0.006, M["iron"], verts=3))
    t = join(p, "Tent")
    t["coarse"] = True
    return t

def stove_kettle(M, at):
    """The kettle on the tent stove (Adriaen 2026-11-12: not one solid chunk, as light as the enamel mug): an 8-sided
    lathe, base to belly to shoulder, a darker lid ring and knob, a tapered 4-sided spout and a 3-part bail handle.
    No bottom (it stands on the plate). About 84 triangles."""
    x0, y0, z0 = at
    n, prof = 8, [(0.072, 0.0), (0.085, 0.05), (0.07, 0.095), (0.048, 0.11), (0.014, 0.122), (0.0, 0.135)]
    bm = bmesh.new()
    rings = [[bm.verts.new((x0 + r * math.cos(2 * math.pi * (i + 0.5) / n), y0 + r * math.sin(2 * math.pi * (i + 0.5) / n), z0 + z)) for i in range(n)] if r else
             [bm.verts.new((x0, y0, z0 + z))] for r, z in prof]
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((a[i], a[j], b[0]) if len(b) == 1 else (a[i], a[j], b[j], b[i]))
            f.material_index = 1 if k >= 3 else 0                     # the lid ring and knob in dark iron
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("kettle"); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("kettle", me); bpy.context.collection.objects.link(o)
    me.materials.append(M["tin"]); me.materials.append(M["iron"])
    for pl in me.polygons: pl.use_smooth = True
    out = [o]
    sp = cyl(0.016, 0.11, m=M["tin"], verts=4, r2=0.008)            # the spout, tapering up and out
    sp.location = (x0 - 0.1, y0, z0 + 0.075); sp.rotation_euler = (0, -0.9, 0); out.append(sp)
    hy = 0.0                                                          # the bail handle: up, across, down, over the lid
    pts = [(x0 + 0.06, y0 + hy, z0 + 0.095), (x0 + 0.045, y0 + hy, z0 + 0.19), (x0 - 0.045, y0 + hy, z0 + 0.19), (x0 - 0.06, y0 + hy, z0 + 0.095)]
    for a, b in zip(pts, pts[1:]): out.append(rod(a, b, 0.005, M["iron"], verts=3))
    return out

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


def jungle_mats():
    """The jungle materials, by short name."""
    return {k: mat(f"ju_{k}", c) for k, c in dict(
        stone=(0.42, 0.46, 0.42), stone2=(0.5, 0.52, 0.47), bamboo=(0.72, 0.68, 0.36), node=(0.52, 0.48, 0.24), char=(0.09, 0.07, 0.05),
        ember=(0.85, 0.3, 0.07), kettle=(0.24, 0.24, 0.26), leaf=(0.24, 0.5, 0.2), leaf2=(0.32, 0.6, 0.24), weave=(0.8, 0.66, 0.44),
        orange=(0.95, 0.5, 0.15), gourd=(0.85, 0.52, 0.2), pink=(0.95, 0.35, 0.5), yellow=(1, 0.8, 0.25), rope=(0.7, 0.6, 0.4)).items()}


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


def jungle_hammock(M, plain_posts=False):
    """The woven hammock on bamboo posts. plain_posts: the picked one, on octagon posts with painted nodes, a coarse sling
    and no leaves on top."""
    h = HAMMOCK_SPAN / 2
    p = []
    for s in (-1, 1):
        if plain_posts:                                  # the picked set (Adriaen 2026-11-11): octagon posts, nodes painted on
            p += painted_bamboo((s * h, 0, 0), 2.4, 0.055, M["bamboo"], M["node"], step=0.6, sides=6)   # trimmed (camp review 2026-11-12)
        else:
            p += bamboo((s * h, 0, 0), (s * h, 0, 2.4), 0.055, M["bamboo"], M["node"])
        p.append(rod((s * h, 0, 1.75), (s * (h - 0.4), 0, 1.35), 0.012, M["rope"], verts=4 if plain_posts else 5))
    if plain_posts:                                      # a coarse sling for the picked set: 8 x 4 quads, both sides (camp review 2026-11-12)
        p.append(sag_sheet(HAMMOCK_SPAN - 0.8, 0.95, 0.55, (0, 0, 1.35), M["weave"], M["orange"], stripes=4, nx=8, ny=4))
    else:
        p.append(sag_sheet(HAMMOCK_SPAN - 0.8, 0.95, 0.55, (0, 0, 1.35), M["weave"], M["orange"], stripes=4))
    for s in (-1, 1) if not plain_posts else ():         # two leaves tucked over the posts (not in the picked set)
        p.append(leaf(0.9, 0.38, (s * h, 0, 2.4), 0 if s < 0 else math.pi, 0.5, M["leaf2"], droop=0.3))
    return join(p, "Hammock")


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
    M = jungle_mats()
    return {"Fire": jungle_fire(M), "Seat": jungle_seat(M), "Tent": jungle_tent(M), "Hammock": jungle_hammock(M),
            "Lantern": jungle_lantern(M), "Table": jungle_table(M)}


# ------------------------------------------------------------------ the picked set, bake and export
def picked():
    """Adriaen's pick (2026-11-11): rustic table, seat and jar lanterns, a canvas wall tent like his photos with loose
    planks before the door; the jungle woven hammock, on plain octagon posts with painted nodes and no leaves on top.
    The fire is props/lived/build_fire.py (the rustic one is archived, camp review 2026-11-12). Only these props are
    made, in the order the light bake's atlas has always seen them (seat, lantern, table, hammock, tent)."""
    R, J = rustic_mats(), jungle_mats()
    seat, lantern, table = rustic_seat(R), rustic_lantern(R), rustic_table(R)
    hammock = jungle_hammock(J, plain_posts=True)
    hammock["coarse"] = True                    # Adriaen 2026-11-11: the densified cloth was ~7k triangles
    return {"Seat": seat, "Tent": wall_tent(), "Hammock": hammock, "Lantern": lantern, "Table": table}


# triangle budgets for the picked set (Adriaen 2026-11-11: as few as still look good): after the AO bake, a collapse
# decimate keeps the baked vertex colours and the silhouette; the densify only gave the bake room to vary
BUDGET = {"picked": {"Table": 1400, "Seat": 500, "Lantern": 200}}


def lean(objs, budget):
    for name, n in budget.items():
        o = objs.get(name)
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons) if o else 0
        if not tris or tris <= n:
            continue
        bpy.context.view_layer.objects.active = o
        d = o.modifiers.new("lean", "DECIMATE")
        d.decimate_type = "COLLAPSE"; d.ratio = n / tris; d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=d.name)


def build(style, samples):
    reset()
    objs = {"storybook": storybook, "rustic": rustic, "jungle": jungle, "picked": picked}[style]()
    for o in objs.values():
        apply_all(o)
        o.location = (0, 0, 0)
    bake(list(objs.values()), samples, split=True)     # the archived styles split long edges for the AO
    lean(objs, BUDGET.get(style, {}))
    path = export_glb(list(objs.values()), os.path.join(HERE, "archive", f"camp_{style}.glb"), texcoords=False)
    print(f"{style} -> {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", required=True, choices=STYLES)
    ap.add_argument("--samples", type=int, default=32)
    a = ap.parse_args()
    build(a.style, a.samples)
