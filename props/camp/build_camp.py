"""
Camp props for the Canopy Camp game (apps/canopy-prototype/camp.html): the one set the page uses, picked() (Adriaen
2026-11-11): the rustic seat and table, a canvas wall tent with planks before the door, and the jungle hammock on plain
textured bamboo posts (HammockPosts). The fire, tripod and pot are props/lived/build_fire.py, and the page draws its own
lanterns (lanterns.js). props/camp/bake_camp_lightmap.py builds the set, through props/bake_all.py on the GPU, places it
from the page's layout and bakes its light map; this script never exports it and has no command line.

Exports, for the light bake and props/lived/build_lived.py: picked() -> {name: object}; BUDGET, the picked props'
triangle budgets; TEXTURED, the objects that keep their image; STOVE, the stove's fire in the tent's frame; SEAT_TOP,
SEAT_BOARD and DOOR_PLANK (where build_lived.py sets things); HAMMOCK_SPAN and ROPE. And the builders picked() calls, one
function per prop, which the archived styles share: rustic_mats(), rustic_seat(M), table_parts(M), rustic_table(M),
wall_tent(), stove_kettle(M, at), jungle_mats(), jungle_hammock(M), textured_posts(name, feet, h, r) and
sag_sheet(span, width, depth, at, m_a, ...).

The three earlier styles (Storybook, Rustic, Jungle) and the first pre-light-map picked GLB are archived (camp review,
Adriaen 2026-11-12): their GLBs and their builders, with the command line that remakes them, are in props/camp/archive/
(build_camp_styles.py, with a README; review R2-258). The page no longer offers them.
"""
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from lib.export import tag  # noqa: E402
from lib.materials import image_material, mat  # noqa: E402
from lib.mesh import apply_all, bisect, box, cyl, drop_faces, drop_ground_faces, join, mesh_obj, mug, obj_from_bm, rod, rough_up, sweep, with_material  # noqa: E402

HAMMOCK_SPAN = 2.86
SEAT_TOP = 0.36                   # rustic_seat(): the height of its flat sawn top (the log along X); build_lived.py sets things on it
SEAT_BOARD = (1.48, 0.46)         # the sawn-top quad build_lived.py lays on it: length along the log and depth
DOOR_PLANK = 0.03                 # wall_tent(): the top of the loose planks before the door (build_lived.py stands the wellies on it)
BAMBOO_PNG = os.path.join(os.path.dirname(HERE), "lived", "bamboo.png")   # the fire tripod's bamboo (build_fire.py writes it)
TEXTURED = ("HammockPosts",)      # picked() objects that keep their image (the light bake gives the others flat colours)


# ------------------------------------------------------------------ helpers (the shared ones are in props/lib)


def textured_posts(name, feet, h, r, sides=6, tile=0.6):
    """Plain bamboo posts as one textured object (review R2-169): at each foot an open-footed tube of `sides` flat sides,
    height h, with a cap on top, the nodes painted in by props/lived/bamboo.png (build_fire.py bamboo_texture), one
    0.5 m tile of it every `tile` metres up the post. 2 x sides + (sides - 2) triangles a post however tall it is."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for x, y, z in feet:
        t = sweep(bm, [(x, y, z), (x, y, z + h)], [r, r], sides, twist=0.5, frame=((1, 0, 0), (0, 1, 0)))
        for k, f in enumerate(t["sides"][0]):
            for lp, u in zip(f.loops, ((k / sides, 0), ((k + 1) / sides, 0), ((k + 1) / sides, h / tile), (k / sides, h / tile))):
                lp[uv].uv = u
        for lp in t["cap_b"].loops:
            lp[uv].uv = (0.5, 0.01)                                  # the node colour
    o = obj_from_bm(bm, name)
    o.data.materials.append(image_material(name, BAMBOO_PNG))
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
    o = mesh_obj("sling", verts, faces, (m_a, m_b or m_a), mats)
    o.location = at
    for p in o.data.polygons:
        p.use_smooth = True
    sol = o.modifiers.new("s", "SOLIDIFY")
    sol.thickness = thick
    return o


# ------------------------------------------------------------------ the picked set's props, one function each


def rustic_mats():
    """The rustic materials, by short name. The jar's glass has the "glow" property: it glows at night (lib.bake.flat_colours)."""
    M = {k: mat(f"ru_{k}", c) for k, c in dict(
        rock=(0.45, 0.44, 0.42), rock2=(0.36, 0.35, 0.33), bark=(0.3, 0.21, 0.14), wood=(0.68, 0.52, 0.36), char=(0.08, 0.06, 0.05),
        ember=(0.7, 0.2, 0.05), canvas=(0.48, 0.5, 0.32), canvas2=(0.38, 0.4, 0.25), rope=(0.7, 0.62, 0.45), peg=(0.55, 0.42, 0.28),
        sling=(0.32, 0.38, 0.26), glass=(0.92, 0.78, 0.45), tin=(0.55, 0.56, 0.58), white=(0.9, 0.88, 0.82), red=(0.65, 0.15, 0.12),
        enamel=(0.97, 0.96, 0.92), rim=(0.16, 0.24, 0.45), coffee=(0.2, 0.11, 0.06)).items()}   # the mug's, as build_lived.py's
    M["glass"]["glow"] = 1
    return M


def rustic_seat(M):
    """The seat (picked): a split half log on two short stumps, about 104 triangles (review R2-169). The log's flat sawn
    top (SEAT_TOP) is the bisect's own fill face in the pale wood material, kept flat when the bark is roughed up;
    build_lived.py lays the textured SeatTop quad just over it, and with ?lived=0 the fill shows. The stumps are open
    tubes that end inside the log (no caps: their feet stand on the ground and their tops were inside the log)."""
    lg = cyl(0.25, 1.5, at=(0, 0, 0.0), rot=(0, math.pi / 2, 0), m=M["bark"], verts=24)
    apply_all(lg)
    bisect(lg, (0, 0, 0), (0, 0, 1), clear_outer=True, fill=True)
    lg.data.materials.append(M["wood"])               # the sawn fill reads as pale wood, not bark (seen with ?lived=0)
    for pl in lg.data.polygons:
        if pl.normal.z > 0.99 and abs(pl.center.z) < 1e-5:
            pl.material_index = len(lg.data.materials) - 1
    cut = [v.index for v in lg.data.vertices if abs(v.co.z) < 1e-5]
    rough_up(lg, 0.008, 12)
    for i in cut:                                     # the sawn top stays flat: the bark only bulges below it
        lg.data.vertices[i].co.z = 0.0
    lg.location.z = SEAT_TOP
    p = [lg]
    for s in (-1, 1):                                 # up to 0.24 m, well inside the log (its underside is 0.11 m up)
        p.append(rough_up(cyl(0.16, 0.24, at=(s * 0.5, 0, 0.12), m=M["bark"], verts=14, caps=False), 0.01, 10))
    return join(p, "Seat")


def table_parts(M):
    """The snack table's parts, trimmed (camp review 2026-11-12, 166 triangles): two 8-sided stumps with no caps (the
    top hides theirs), four plain plank boxes, a 6-sided enamel mug like the seat's (lib/mesh.py mug, review R2-194) and
    an empty white plate: the page lays the fruit you can take on it (activities/fruitBowl.js, review R2-176). Returns
    (the table's parts, the plate); the archived rustic style joins them all into one Table."""
    p = []
    for s in (-1, 1):
        leg = rough_up(cyl(0.2, 0.62, at=(s * 0.45, 0, 0.31), m=M["bark"], verts=8, smooth=False), 0.012, 10)
        p.append(drop_faces(leg, lambda n, c: abs(n.z) > 0.9))
    for k in range(4):
        p.append(box((1.3, 0.17, 0.05), at=(0, (k - 1.5) * 0.18, 0.645), m=M["wood"]))
    p.append(mug(M, (0.3, 0.1, 0.67), n=6))                  # on the plank tops (z 0.67), its handle toward +X
    plate = drop_faces(cyl(0.14, 0.03, at=(-0.2, -0.05, 0.685), m=M["white"], verts=8, r2=0.12, smooth=False), lambda n, c: n.z < -0.9)
    return p, plate


def rustic_table(M):
    """The snack table (picked), from table_parts(): the plate is its own object, "FruitBowl", a child of the Table at
    the same origin, so the page can light up just the plate (review R2-159). Returns (table, plate)."""
    p, plate = table_parts(M)
    table, plate = join(p, "Table"), join([plate], "FruitBowl")
    plate.parent = table                               # both origins are at the world origin, so its local transform stays identity
    return table, plate


STOVE = (1.0, 0.85, 0.42)        # the stove's fire, in the tent's own frame (bake_camp_lightmap.py puts a light there)


def wall_tent():
    """Adriaen's pick (2026-11-11, from two photos): a white canvas wall tent you can walk into. Straight side walls,
    a ridge pole on wide A-frames of crossed shear poles at each end with the eave poles lashed onto them, an open
    doorway with the flap rolled up above it, loose planks before the door. Inside: a lining (so the inside gets its
    own bake) joined to the outer wall round the doorway, a plank floor on a dark board, a bed along the left wall and
    a wood stove on the right under the stovepipe.
    Built at its final size with the door toward -Y. The light comes from the camp light map, so a sheet needs vertices
    only where it bends: the roof is a 6 x 3 grid for its sag, the side walls one column of hem and wall (review R2-169).
    It writes its sizes for the page (the walls, the doorway, the stove, the chimney and the bed) as custom properties on
    the Tent, which the light bake exports as glTF extras for camp/layout.js fromModel; camp/layout.js TENT mirrors W,
    the walls' front and back (Y0 - D, Y0 + D), DW, the stove and the bed, and camp/tentInside.js turns them into
    blockers for walking."""
    M = {k: mat(f"wt_{k}", c) for k, c in dict(
        canvas=(0.93, 0.9, 0.82), canvas2=(0.86, 0.83, 0.74), hem=(0.55, 0.5, 0.4), lining=(1.0, 0.93, 0.78),
        pole=(0.74, 0.62, 0.46), rope=(0.62, 0.54, 0.4), plank=(0.58, 0.43, 0.28), plank2=(0.5, 0.36, 0.23),
        fascia=(0.36, 0.26, 0.17), pipe=(0.22, 0.22, 0.24), glow=(0.45, 0.16, 0.06), stone=(0.45, 0.44, 0.42),
        ticking=(0.84, 0.82, 0.76), blanket=(0.62, 0.2, 0.15), pillow=(0.94, 0.93, 0.9),
        iron=(0.15, 0.15, 0.16), brass=(0.72, 0.56, 0.26), tin=(0.55, 0.56, 0.58)).items()}
    M["glow"]["glow"] = 1                       # the stove's fire window glows at night (lib.bake.flat_colours)
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
    # side walls, flaring a touch to the ground, with a dirty hem: one column, since x and z vary only up the wall (R2-169)
    for s in (1, -1):
        zs = (Z0, Z0 + 0.13, Z0 + E + 0.06)          # tops tucked up under the roof, no slit to the sky
        quad_grid(lambda u, v, s=s: (s * (W + 0.05 * (1 - v)), Y0 - D + 2 * D * u, zs[round(v * 2)]), 1, 2,
                  lambda i, j: "hem" if j == 0 else "canvas", flip=s < 0)
    # back gable (faces +Y) and the front (faces -Y) round the open doorway; both flare at the foot like the side walls
    yb, yf = Y0 + D, Y0 - D
    zg = lambda x: Z0 + E + 0.06 + (H - E - 0.06) * (1 - abs(x) / W)      # the gable's sloping top edge
    face([(W + 0.05, yb, Z0), (-W - 0.05, yb, Z0), (-W, yb, zg(W)), (0, yb, Z0 + H), (W, yb, zg(W))], "canvas2")
    face([(-W - 0.05, yf, Z0), (-DW, yf, Z0), (-DW, yf, zg(DW)), (-W, yf, zg(W))], "canvas2")
    face([(DW, yf, Z0), (W + 0.05, yf, Z0), (W, yf, zg(W)), (DW, yf, zg(DW))], "canvas2")
    face([(-DW, yf, Z0 + DH), (DW, yf, Z0 + DH), (DW, yf, zg(DW)), (0, yf, Z0 + H), (-DW, yf, zg(DW))], "canvas2")
    # the lining: every canvas face again, LIN inside and facing inward, so the inside bakes its own light. Each corner
    # moves in along the mean normal of the canvas faces meeting there, stretched so every face's plane moves by LIN
    # (scaling about the tent's middle, as before, left the lining 8 mm into the doorway and 3 cm under the lintel, R2-153)
    LIN = 0.017
    n_out = len(F)
    def normal(f):
        n = Vector()
        for a, b in zip(f, f[1:] + f[:1]):
            pa, pb = V[a], V[b]
            n += Vector(((pa[1] - pb[1]) * (pa[2] + pb[2]), (pa[2] - pb[2]) * (pa[0] + pb[0]), (pa[0] - pb[0]) * (pa[1] + pb[1])))
        return n.normalized()                                   # Newell's normal, outward
    key = lambda v: tuple(round(c, 5) for c in v)
    near = {}
    for k in range(n_out):
        n = normal(F[k])
        for i in F[k]:
            near.setdefault(key(V[i]), []).append(n)
    def inset(v):
        ns = near[key(v)]
        m = sum(ns, Vector()).normalized()
        d = m * (LIN / max(0.5, min(m.dot(n) for n in ns)))
        return (v[0] - d.x, v[1] - d.y, Z0 if v[2] <= Z0 + 1e-6 else v[2] - d.z)   # the feet stay on the ground
    for k in range(n_out):
        base = len(V)
        V.extend(inset(V[i]) for i in F[k])
        F.append(tuple(range(base, base + len(F[k])))[::-1]); FM.append(mi["lining"])
    # the doorway's reveal: the two jambs and the lintel join the front wall to its lining, facing into the opening
    for a, b in (((-DW, Z0), (-DW, Z0 + DH)), ((-DW, Z0 + DH), (DW, Z0 + DH)), ((DW, Z0 + DH), (DW, Z0))):
        face([(a[0], yf + LIN, a[1]), (b[0], yf + LIN, b[1]), (b[0], yf, b[1]), (a[0], yf, a[1])], "canvas2")
    # plank floor inside, and loose planks before the door (Adriaen: not a raised platform); top and long edges only.
    # One dark board under the whole floor fills the 2 cm gaps between the planks, where the grass showed (R2-163)
    face([(-W, yf, Z0 + 0.005), (W, yf, Z0 + 0.005), (W, yb, Z0 + 0.005), (-W, yb, Z0 + 0.005)], "fascia")
    for k in range(7):
        x0 = -W + 2 * W * k / 7
        face([(x0 + 0.01, yf + 0.03, 0.02), (x0 + 2 * W / 7 - 0.01, yf + 0.03, 0.02), (x0 + 2 * W / 7 - 0.01, yb - 0.03, 0.02), (x0 + 0.01, yb - 0.03, 0.02)],
             "plank" if k % 2 else "plank2")
    for k in range(5):
        cy, ln, yaw, cx = yf - 0.115 - k * 0.185, 2 * (W + 0.2) + 0.08 * math.sin(k * 2.7), 0.018 * math.sin(k * 1.9 + 1), 0.04 * math.sin(k * 3.1)
        c, s_, hw2, t = math.cos(yaw), math.sin(yaw), 0.086, DOOR_PLANK
        P = lambda u, v, z: (cx + u * c - v * s_, cy + u * s_ + v * c, z)
        m = "plank" if k % 2 else "plank2"
        face([P(-ln / 2, -hw2, t), P(ln / 2, -hw2, t), P(ln / 2, hw2, t), P(-ln / 2, hw2, t)], m)
        face([P(-ln / 2, -hw2, 0), P(ln / 2, -hw2, 0), P(ln / 2, -hw2, t), P(-ln / 2, -hw2, t)], "fascia")
        face([P(ln / 2, hw2, 0), P(-ln / 2, hw2, 0), P(-ln / 2, hw2, t), P(ln / 2, hw2, t)], "fascia")
    p = [mesh_obj("canvas", V, F, mats, FM)]
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
    p.append(with_material(bpy.context.object, M["pipe"], smooth=False))
    for a in (0.0, math.pi):
        lx, ly = math.cos(a) * 0.055, math.sin(a) * 0.055
        p.append(rod((sx + lx, sy + 0.12 + ly, top - 0.03), (sx + lx * 1.4, sy + 0.12 + ly * 1.4, top + 0.065), 0.006, M["iron"], verts=3))
    t = join(p, "Tent")
    t["coarse"] = True
    # the sizes the page needs, in the tent's own frame (x across, y toward the back, z up), as glTF extras on the Tent
    # node (the light bake exports them; camp/layout.js fromModel reads them, review R2-250): the walls' half width, front
    # and back, the doorway's half width, the stove (x, y), the stovepipe's mouth (x, y, z) and the middle of the bed (x, y)
    for k, v in dict(W=W, yf=yf, yb=yb, DW=DW, stove=(sx, sy), chimney=(sx, sy + 0.12, top), bed=(bx, by)).items():
        t[k] = [round(c, 4) for c in v] if isinstance(v, tuple) else round(v, 4)
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
    o = obj_from_bm(bm, "kettle"); me = o.data
    me.materials.append(M["tin"]); me.materials.append(M["iron"])
    for pl in me.polygons: pl.use_smooth = True
    out = [o]
    sp = cyl(0.016, 0.11, m=M["tin"], verts=4, r2=0.008)            # the spout, tapering up and out
    sp.location = (x0 - 0.1, y0, z0 + 0.075); sp.rotation_euler = (0, -0.9, 0); out.append(sp)
    # the bail handle: up, across, down, over the lid
    pts = [(x0 + 0.06, y0, z0 + 0.095), (x0 + 0.045, y0, z0 + 0.19), (x0 - 0.045, y0, z0 + 0.19), (x0 - 0.06, y0, z0 + 0.095)]
    for a, b in zip(pts, pts[1:]): out.append(rod(a, b, 0.005, M["iron"], verts=3))
    return out


def jungle_mats():
    """The jungle materials, by short name."""
    return {k: mat(f"ju_{k}", c) for k, c in dict(
        stone=(0.42, 0.46, 0.42), stone2=(0.5, 0.52, 0.47), bamboo=(0.72, 0.68, 0.36), node=(0.52, 0.48, 0.24), char=(0.09, 0.07, 0.05),
        ember=(0.85, 0.3, 0.07), kettle=(0.24, 0.24, 0.26), leaf=(0.24, 0.5, 0.2), leaf2=(0.32, 0.6, 0.24), weave=(0.8, 0.66, 0.44),
        orange=(0.95, 0.5, 0.15), gourd=(0.85, 0.52, 0.2), pink=(0.95, 0.35, 0.5), yellow=(1, 0.8, 0.25), rope=(0.7, 0.6, 0.4)).items()}


ROPE = (1.75, 1.35)   # the hammock's ropes: the knot's height on the post and the sling end's height, 0.4 m in from it


def jungle_hammock(M):
    """The woven hammock (picked): a coarse striped sling, 8 x 4 quads on both sides (camp review 2026-11-12), and its two
    ropes. It has no posts of its own: picked() makes them as the textured HammockPosts (review R2-169). The archived
    jungle style's hammock, on modelled bamboo posts with leaves on top, is archive/build_camp_styles.py jungle_hammock."""
    h = HAMMOCK_SPAN / 2
    p = [rod((s * h, 0, ROPE[0]), (s * (h - 0.4), 0, ROPE[1]), 0.012, M["rope"], verts=4) for s in (-1, 1)]
    p.append(sag_sheet(HAMMOCK_SPAN - 0.8, 0.95, 0.55, (0, 0, 1.35), M["weave"], M["orange"], stripes=4, nx=8, ny=4))
    return rope_extras(join(p, "Hammock"))


def rope_extras(o):
    """The -x post's rope, from its knot to the sling's end, as glTF extras on the Hammock node o (camp/layout.js
    fromModel reads them for the sloths' climb, sloth/poses.js; review R2-250). Returns o."""
    h = HAMMOCK_SPAN / 2
    o["knot"], o["rope_end"] = [round(-h, 4), 0.0, ROPE[0]], [round(-(h - 0.4), 4), 0.0, ROPE[1]]
    return o


# ------------------------------------------------------------------ the picked set
def picked():
    """Adriaen's pick (2026-11-11): rustic table and seat, a canvas wall tent like his photos with loose
    planks before the door; the jungle woven hammock with no leaves on top, on plain bamboo posts whose nodes are in a
    texture (HammockPosts, an object of its own so it keeps its image: TEXTURED, review R2-169).
    The fire is props/lived/build_fire.py (the rustic one is archived, camp review 2026-11-12). Only these props are
    made, in the order the light bake's atlas has always seen them (seat, table, hammock, tent, then the posts). The jar lanterns are
    drawn by the page (lanterns.js), so the set has no lantern mesh (review R2-236). The tent, hammock and table lose the
    faces that point down onto the ground (lib/mesh.py drop_ground_faces, review R2-154). Each is tagged with where the page stands it (lib.export.tag, review R2-249): the
    posts stand in the hammock's frame. "FruitBowl" is the plate, a child of "Table" with no tag of its own
    (review R2-159): whoever places the Table moves it too."""
    R, J = rustic_mats(), jungle_mats()
    seat, (table, bowl) = rustic_seat(R), rustic_table(R)
    hammock = jungle_hammock(J)
    hammock["coarse"] = True                    # Adriaen 2026-11-11: the densified cloth was ~7k triangles
    tent = wall_tent()
    drop_ground_faces([tent, hammock, table])   # the bottoms standing on the ground (review R2-154; the seat has none, R2-169)
    h = HAMMOCK_SPAN / 2                        # the posts in the hammock's frame; the page and the bake place both alike
    posts = textured_posts("HammockPosts", [(-h, 0, 0), (h, 0, 0)], 2.4, 0.055)
    return {"Seat": tag(seat, "seats"), "Tent": tag(tent, "tent"), "Hammock": tag(hammock, "hammock"), "Table": tag(table, "table"), "FruitBowl": bowl,
            "HammockPosts": tag(posts, "hammock")}


# triangle budgets for the picked set (Adriaen 2026-11-11: as few as still look good): the light bake
# (bake_camp_lightmap.py check_budget) stops when a prop is over its budget, so added detail is trimmed by hand
BUDGET = {"picked": {"Table": 1400, "Seat": 500}}
