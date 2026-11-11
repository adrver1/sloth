"""
Lived-in camp props for the Canopy Camp game (apps/canopy-prototype/camp.html): the small things that make the camp
look used. Built in batches, so each can be checked before the next:

    batch 1   WoodPile    split logs stacked by the fire, a chopping stump with a hatchet in it, chips and a few loose logs
              SeatThings  an enamel mug and a book left open face up, laid out on the rustic half-log seat's flat top

    .venv/bin/python props/lived/build_lived.py
    .venv/bin/python props/lived/build_lived.py --samples 64

One GLB (props/lived/lived.glb), one object per prop, each at its own origin, standing on z = 0 with its front toward
-Y (three.js +Z). SeatThings shares the Seat's origin (props/camp/build_camp.py rustic(): log along X, flat top at
z = 0.361), so the page places it with the same transform as the seat it sits on. Same baked light as the camp and the
jeep: Cycles AO times base colour in one colour attribute, drawn with a plain Lambert material on the page.
Materials match the camp's rustic set, so the props sit with the picked camp.
"""
import argparse
import math
import os
import random
import sys

import bpy
import bmesh  # noqa: E402  (needs bpy loaded first)
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "camp"))
import build_camp  # noqa: E402
from build_camp import (apply_all, bake, box, cyl, join, mat, reset, rod, rough_up, torus, _finish)  # noqa: E402

rng = random.Random(11)
SEAT_TOP = 0.361


def densify(o, area=0.01, edge=0.08, rounds=2):
    """Split only the bigger faces (as the jeep does), so small props stay light."""
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


build_camp.densify = densify       # bake() calls it


PARTS = []          # piece names; each face carries its piece's index in the "part" attribute, for the triangle breakdown


def mark(p, start, name):
    """Tag the faces of p[start:] as one named piece, and return where the next piece starts."""
    PARTS.append(name)
    for o in p[start:]:
        a = o.data.attributes.get("part") or o.data.attributes.new("part", "INT", "FACE")
        for k in range(len(o.data.polygons)):
            a.data[k].value = len(PARTS) - 1
    return len(p)


def materials():
    return {k: mat(f"lv_{k}", c) for k, c in dict(
        bark=(0.3, 0.21, 0.14), bark2=(0.24, 0.17, 0.11), wood=(0.68, 0.52, 0.36), endgrain=(0.78, 0.62, 0.42), chip=(0.82, 0.68, 0.48),
        handle=(0.62, 0.45, 0.28), steel=(0.32, 0.33, 0.35), edge=(0.7, 0.71, 0.72),
        enamel=(0.97, 0.96, 0.92), rim=(0.16, 0.24, 0.45), cover=(0.5, 0.16, 0.13), page=(0.93, 0.9, 0.8), ink=(0.55, 0.52, 0.46), ribbon=(0.85, 0.7, 0.2)).items()}


def split_log(length, r, kind, M, at, yaw=0.0, roll=0.0, tilt=0.0):
    """A firewood log lying along X: whole (round), half or quarter. Bark outside, light wood on the split faces and
    pale end grain on the sawn ends, so the stack shows its ends."""
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=length, vertices=12, rotation=(0, math.pi / 2, 0))
    o = bpy.context.object
    for m in (M["bark"], M["wood"], M["endgrain"]):
        o.data.materials.append(m)
    apply_all(o)
    planes = {"whole": [], "half": [(0, 0, 1)], "quarter": [(0, 0, 1), (0, 1, 0)]}[kind]
    for n in planes:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=n, clear_outer=True)
        cut = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        f = bmesh.ops.edgeloop_fill(bm, edges=cut)
        for face in f["faces"]:
            face.material_index = 1
        bm.to_mesh(o.data)
        bm.free()
    for p in o.data.polygons:
        if abs(p.normal.x) > 0.9:
            p.material_index = 2
        elif p.material_index != 1:
            p.use_smooth = True
    if kind != "whole":                     # recentre the piece on its own axis so it rests on its round side
        c = sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
        for v in o.data.vertices:
            v.co.y -= c.y
            v.co.z -= c.z
    o.rotation_euler = (roll, tilt, yaw)
    o.location = at
    rough_up(o, 0.004, 14)
    return o


def hatchet(M, at, yaw, lean):
    """A hatchet with its blade bitten into the stump top: the head at `at`, the handle rising at `lean` from vertical."""
    p = []
    head = box((0.11, 0.022, 0.07), at=(0.02, 0, 0), m=M["steel"])
    apply_all(head)
    for v in head.data.vertices:               # taper the blade toward its edge (+X) and the poll back to a block
        if v.co.x > 0.03:
            v.co.z *= 1.45
            v.co.y *= 0.25
    p.append(head)
    p.append(box((0.006, 0.008, 0.1), at=(0.078, 0, 0), m=M["edge"]))
    handle_pts = [Vector((-0.01, 0, 0)), Vector((-0.02, 0, 0.14)), Vector((-0.01, 0, 0.28)), Vector((0.02, 0, 0.38))]
    for a, b in zip(handle_pts, handle_pts[1:]):
        p.append(rod(a, b, 0.014, M["handle"], verts=8))
    p.append(cyl(0.018, 0.03, at=(0.022, 0, 0.39), m=M["handle"], verts=8))     # a swelled knob at the end
    h = join(p, "hatchet")
    # the blade edge points down into the wood: rotate so +X goes to -Z, then lean the handle
    h.scale = (1.25, 1.25, 1.25)
    h.rotation_euler = (0, math.pi / 2 - lean, yaw)
    h.location = at
    return h


def wood_pile(M):
    p = []
    # the stack: logs along Y (ends toward the fire and away), in rows that step in as they go up
    rows = [6, 5, 5, 4, 2]
    z = 0.0
    for row, n in enumerate(rows):
        w = 0.155
        for i in range(n):
            x = (i - (n - 1) / 2) * w + rng.uniform(-0.01, 0.01)
            kind = rng.choice(["half", "quarter", "quarter", "quarter", "whole"])
            r = rng.uniform(0.085, 0.1) if kind != "whole" else rng.uniform(0.06, 0.07)
            roll = rng.choice([0, math.pi / 2, math.pi, 1.5 * math.pi]) + rng.uniform(-0.15, 0.15)
            p.append(split_log(rng.uniform(0.44, 0.48), r, kind, M, at=(x, rng.uniform(-0.015, 0.015), z + 0.065),
                               yaw=math.pi / 2 + rng.uniform(-0.04, 0.04), roll=roll))
        z += 0.115
    k0 = mark(p, 0, "Log stack")
    # two posts at the ends keep the stack from rolling
    for s in (-1, 1):
        p.append(rough_up(rod((s * 0.52, 0, -0.02), (s * 0.54, 0.02, 0.55), 0.035, M["bark2"], verts=8), 0.004, 12))
    k0 = mark(p, k0, "End posts")
    # the chopping stump beside it, with the hatchet left in, and a half-split log waiting on the ground
    sx, sy = 1.0, -0.15
    stump = rough_up(cyl(0.22, 0.42, at=(sx, sy, 0.21), m=M["bark"], verts=16, r2=None), 0.01, 10)
    p.append(stump)
    p.append(cyl(0.205, 0.012, at=(sx, sy, 0.424), m=M["endgrain"], verts=16, smooth=False))
    for k in range(3):
        p.append(torus(0.05 + k * 0.05, 0.003, at=(sx, sy, 0.43), m=M["wood"], major=16, minor=3))
    for k in range(4):                              # roots flaring into the ground
        a = k / 4 * 2 * math.pi + 0.4
        p.append(rod((sx + math.cos(a) * 0.17, sy + math.sin(a) * 0.17, 0.05), (sx + math.cos(a) * 0.27, sy + math.sin(a) * 0.27, -0.03), 0.045, M["bark"], verts=8))
    k0 = mark(p, k0, "Chopping stump")
    p.append(hatchet(M, (sx + 0.03, sy - 0.02, 0.45), yaw=-0.5, lean=0.85))
    k0 = mark(p, k0, "Hatchet")
    p.append(split_log(0.4, 0.09, "half", M, at=(sx + 0.38, sy - 0.28, 0.035), yaw=1.1, roll=math.pi / 2 + 0.1))
    p.append(split_log(0.44, 0.085, "quarter", M, at=(0.2, -0.45, 0.05), yaw=0.3, roll=2.2))
    p.append(split_log(0.46, 0.06, "whole", M, at=(-0.35, -0.42, 0.06), yaw=-0.2))
    k0 = mark(p, k0, "Loose logs")
    for k in range(14):                             # chips round the stump
        a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.3, 0.6)
        p.append(box((rng.uniform(0.03, 0.06), rng.uniform(0.015, 0.03), 0.006), at=(sx + math.cos(a) * d, sy + math.sin(a) * d, 0.004),
                     rot=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(0, 3.14)), m=M["chip" if k % 3 else "wood"]))
    mark(p, k0, "Wood chips")
    return join(p, "WoodPile")


def page_sheet(w, d, side, M, lift=0.0):
    """One side of an open book: pages that curl up from the spine at x = 0 and flatten out toward the fore edge."""
    nx, ny = 10, 2
    verts, faces = [], []
    for i in range(nx + 1):
        u = i / nx
        x = side * w * u
        z = 0.022 * math.sin(math.pi * u * 0.55) * (1 - 0.35 * u) + lift
        for j in range(ny + 1):
            verts.append((x, (j / ny - 0.5) * d, z))
    for i in range(nx):
        for j in range(ny):
            a = i * (ny + 1) + j
            q = (a, a + ny + 1, a + ny + 2, a + 1)
            faces.append(q if side > 0 else q[::-1])
    me = bpy.data.meshes.new("pages")
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new("pages", me)
    bpy.context.collection.objects.link(o)
    _finish(o, M["page"])
    o.modifiers.new("s", "SOLIDIFY").thickness = 0.012
    return o


def seat_things(M):
    """An enamel mug and an open book on the seat's flat top (log along X, top at SEAT_TOP)."""
    z = SEAT_TOP
    p = []
    mx, my = -0.42, 0.05
    p.append(cyl(0.042, 0.085, at=(mx, my, z + 0.0425), m=M["enamel"], verts=16))
    p.append(cyl(0.036, 0.004, at=(mx, my, z + 0.081), m=M["rim"], verts=16, smooth=False))       # dark coffee inside
    p.append(torus(0.042, 0.004, at=(mx, my, z + 0.085), m=M["rim"], major=16, minor=4))
    h = torus(0.026, 0.006, at=(mx + 0.048, my, z + 0.045), rot=(math.pi / 2, 0, 0), m=M["enamel"], major=12, minor=5)
    p.append(h)
    k0 = mark(p, 0, "Enamel mug")
    # the book: a cover a little bigger than the pages, open face up, a ribbon hanging off the end
    bx, by, yaw = 0.18, -0.02, 0.25
    book = [box((0.31, 0.21, 0.008), at=(0, 0, 0.004), m=M["cover"]),
            box((0.012, 0.21, 0.012), at=(0, 0, 0.004), m=M["cover"])]
    for s in (-1, 1):
        book.append(page_sheet(0.145, 0.195, s, M, lift=0.008))
        for k in range(3):                          # a few lines of print
            book.append(box((0.08, 0.004, 0.001), at=(s * 0.072, 0.05 - k * 0.035, 0.0235), m=M["ink"]))
    book.append(box((0.008, 0.07, 0.002), at=(0.003, -0.13, 0.009), rot=(0.3, 0, 0), m=M["ribbon"]))
    b = join(book, "book")
    b.rotation_euler = (0, 0, yaw)
    b.location = (bx, by, z)
    p.append(b)
    mark(p, k0, "Open book")
    return join(p, "SeatThings")


def build(samples, parts_out=None):
    reset()
    M = materials()
    objs = {"WoodPile": wood_pile(M), "SeatThings": seat_things(M)}
    for k, o in objs.items():
        apply_all(o)
        o.location = (0, 0, 0)
        o.name = k
    bake(list(objs.values()), samples)
    path = os.path.join(HERE, "lived.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs.values():
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=False)
    for k, o in objs.items():
        print(f"  {k}: {sum(len(pl.vertices) - 2 for pl in o.data.polygons)} triangles")
        part = o.data.attributes["part"]
        tris = {}
        for pl in o.data.polygons:
            n = PARTS[part.data[pl.index].value]
            tris[n] = tris.get(n, 0) + len(pl.vertices) - 2
        for n, t in tris.items():
            print(f"    {n}: {t}")
    if parts_out:                             # each piece as its own object, for a triangle-breakdown picture (not used by the page)
        split = []
        for o in objs.values():
            for i, n in enumerate(PARTS):
                if not any(o.data.attributes["part"].data[pl.index].value == i for pl in o.data.polygons):
                    continue
                c = o.copy(); c.data = o.data.copy(); bpy.context.collection.objects.link(c)
                bm = bmesh.new(); bm.from_mesh(c.data)
                lay = bm.faces.layers.int.get("part")
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[lay] != i], context="FACES")
                bm.to_mesh(c.data); bm.free()
                c.name = n
                split.append(c)
        bpy.ops.object.select_all(action="DESELECT")
        for c in split:
            c.select_set(True)
        bpy.ops.export_scene.gltf(filepath=parts_out, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                                  export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=False)
    print(f"lived: {os.path.getsize(path) // 1024} KB -> {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--parts", help="also write each piece as its own object to this GLB, for a triangle breakdown")
    a = ap.parse_args()
    build(a.samples, a.parts)
