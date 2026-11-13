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
sys.path.insert(0, os.path.dirname(HERE))
from lib.bake import bake  # noqa: E402
from lib.export import reset  # noqa: E402
from lib.materials import mat  # noqa: E402
from lib.mesh import _finish, apply_all, box, cyl, join, rod, rough_up, torus  # noqa: E402

rng = random.Random(23)
LIFT = 0.3                             # the pot hangs this much higher than the old kettle, clear of the flames
POT_Z = 0.45 + LIFT                    # the pot's base
SOUP = Vector((0.0, 0.0, POT_Z + 0.135))   # the soup's surface, middle
TOP = Vector((0.0, 0.0, 1.75))         # where the tripod legs meet (tall, so the pot hangs on a long chain)


def materials():
    return {k: mat(f"fi_{k}", c) for k, c in dict(
        stone=(0.36, 0.35, 0.33), stone2=(0.28, 0.27, 0.26), soot=(0.12, 0.1, 0.09), ash=(0.42, 0.4, 0.37), char=(0.07, 0.055, 0.045),
        bark=(0.3, 0.21, 0.14), wood=(0.66, 0.5, 0.34), ember=(0.95, 0.28, 0.04), ember2=(1.0, 0.5, 0.08),
        bamboo=(0.72, 0.68, 0.36), node=(0.52, 0.48, 0.24), rope=(0.7, 0.6, 0.4),
        iron=(0.13, 0.13, 0.14), iron2=(0.22, 0.22, 0.23), copper=(0.62, 0.36, 0.2), tin=(0.46, 0.47, 0.48), tin2=(0.34, 0.35, 0.36),
        soup=(0.78, 0.3, 0.1), soup2=(0.86, 0.42, 0.14), carrot=(0.95, 0.5, 0.1), pea=(0.4, 0.62, 0.18),
        potato=(0.88, 0.8, 0.55), herb=(0.25, 0.45, 0.12)).items()}


def stone(r, at, scale, m, sr=None):
    """A low-poly fire stone in 16 triangles (camp review 2026-11-12): six lumpy points round its middle, a flat-ish top of
    three and one point underneath, each pushed about by its own random; smooth shaded, so it reads as a worn pebble and
    not a crystal (the flat-shaded 12-triangle bipyramid looked like quartz)."""
    sr = sr or rng
    bm = bmesh.new()
    for i in range(6):
        t = (i + sr.uniform(-0.25, 0.25)) / 6 * 2 * math.pi
        k = sr.uniform(0.85, 1.12)
        bm.verts.new((math.cos(t) * r * k, math.sin(t) * r * k, sr.uniform(-0.1, 0.1) * r))
    t0 = sr.uniform(0, 2 * math.pi)
    for i in range(3):
        t = t0 + i * 2 * math.pi / 3
        bm.verts.new((math.cos(t) * r * 0.5, math.sin(t) * r * 0.5, r * sr.uniform(0.45, 0.6)))
    bm.verts.new((0, 0, -r * 0.6))
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("stone")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("stone", me)
    bpy.context.collection.objects.link(o)
    o.scale = scale
    o.location = at
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
    """The ring of stones (sooty on the inside) and the ash bed inside it. Trimmed (camp review 2026-11-12): 13 stones of
    16 triangles, the soot painted on their inner faces, a 12-sided ash mound and an 8-sided char patch (about 180)."""
    p = []
    # stones gathered by hand: mixed sizes, uneven gaps, a lumpy oval ring with stones pushed in or out, each one
    # facing and tipping its own way (some lying flat, some on edge); a little more ordered than wild (Adriaen)
    sr = random.Random(11)
    w1, w2 = sr.uniform(0, 6.28), sr.uniform(0, 6.28)
    a, stones = sr.uniform(0, 1), []
    while a < 2 * math.pi - 0.35:
        big = sr.random() < 0.35
        r = sr.uniform(0.16, 0.21) if big else sr.uniform(0.11, 0.15)
        stones.append((a, r))
        a += r * sr.uniform(1.8, 2.3) / 0.62
    for i, (a, r) in enumerate(stones):
        d = 0.6 + 0.045 * math.sin(2 * a + w1) + 0.03 * math.sin(3 * a + w2) + sr.uniform(-0.05, 0.05)
        on_edge = sr.random() < 0.3
        sc = (sr.uniform(0.9, 1.6), sr.uniform(0.65, 1.0), sr.uniform(0.9, 1.2) if on_edge else sr.uniform(0.5, 0.8))
        s = stone(r, (math.cos(a) * d, math.sin(a) * d, r * sc[2] * sr.uniform(0.3, 0.55)), sc, M["stone" if sr.random() < 0.65 else "stone2"], sr)
        s.rotation_euler = (sr.uniform(-0.3, 0.3), sr.uniform(-0.3, 0.3), sr.uniform(0, 2 * math.pi))
        p.append(s)
    for o in p:                                                    # soot on the faces that look into the fire
        apply_all(o)
        o.data.materials.append(M["soot"])
        c = sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
        inward = Vector((-c.x, -c.y, 0)).normalized()
        for f in o.data.polygons:
            if f.normal.dot(inward) > 0.55 and f.center.z < 0.2:
                f.material_index = 1
    bpy.ops.mesh.primitive_circle_add(vertices=12, radius=0.5, fill_type="NGON", location=(0, 0, 0.012))
    ash = _finish(bpy.context.object, M["ash"], smooth=False)
    for v in ash.data.vertices:                                    # a ragged edge, not a perfect disc
        k = 1 + 0.18 * math.sin(3 * math.atan2(v.co.y, v.co.x) + 1) + sr.uniform(-0.1, 0.1)
        v.co.x *= k
        v.co.y *= k * 0.92
    p.append(ash)
    bpy.ops.mesh.primitive_circle_add(vertices=8, radius=0.3, fill_type="NGON", location=(0, 0, 0.025))
    char = _finish(bpy.context.object, M["char"], smooth=False)
    for v in char.data.vertices:
        k = 1 + sr.uniform(-0.25, 0.25)
        v.co.x *= k * 1.1
        v.co.y *= k
    p.append(char)
    return join(p, "Ring")


def tripod(M):
    """The rope lashing where the three legs cross (baked like the rest); the legs themselves are tripod_legs()."""
    return join([torus(0.05, 0.022, at=(0, 0, TOP.z - 0.06), m=M["rope"], major=8, minor=3)], "Tripod")


def bamboo_texture(path):
    """One 0.5 m length of bamboo, tiled along the legs: a pale culm with faint fibres and a darker node band with a
    light ridge, so the nodes are only painted on (no extra triangles however long the legs are)."""
    from PIL import Image, ImageDraw
    W, H = 32, 128
    im = Image.new("RGB", (W, H), (201, 190, 118))
    d = ImageDraw.Draw(im)
    for x in range(0, W, 5):
        d.line((x, 0, x, H), fill=(190, 178, 108))
    for y in range(H):                                             # a soft swell toward each node
        t = abs(y - H / 2) / (H / 2)
        if t > 0.75:
            d.line((0, y, W, y), fill=(int(196 - 30 * (t - 0.75)), int(185 - 30 * (t - 0.75)), int(114 - 20 * (t - 0.75))))
    d.rectangle((0, 0, W, 5), fill=(150, 138, 76))
    d.line((0, 2, W, 2), fill=(222, 212, 150))
    im.save(path)


def tripod_legs():
    """Three bamboo legs, each one stretched eight-sided tube with a cap on top (16 + 6 triangles), textured with
    bamboo.png repeating every 0.5 m along it."""
    img = os.path.join(HERE, "bamboo.png")
    bamboo_texture(img)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    r, n = 0.032, 8
    for i in range(3):
        a = i / 3 * 2 * math.pi + 0.3
        foot = Vector((math.cos(a) * 0.85, math.sin(a) * 0.85, 0))
        d = (TOP - foot).normalized()
        top = TOP + d * 0.16                                       # the tops poke out past the crossing
        L = (top - foot).length
        x = d.cross(Vector((0, 0, 1))).normalized()
        y = d.cross(x)
        ring = lambda c: [c + (x * math.cos(k / n * 2 * math.pi) + y * math.sin(k / n * 2 * math.pi)) * r for k in range(n + 1)]
        lo, hi = [bm.verts.new(v) for v in ring(foot)], [bm.verts.new(v) for v in ring(top)]
        for k in range(n):
            f = bm.faces.new((lo[k], lo[k + 1], hi[k + 1], hi[k]))
            for lp, u in zip(f.loops, ((k / n, 0), ((k + 1) / n, 0), ((k + 1) / n, L / 0.5), (k / n, L / 0.5))):
                lp[uv].uv = u
        cap = bm.faces.new(hi[:n])
        for lp in cap.loops:
            lp[uv].uv = (0.5, 0.01)                                # the node colour
    me = bpy.data.meshes.new("TripodLegs")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("TripodLegs", me)
    bpy.context.collection.objects.link(o)
    m = bpy.data.materials.new("TripodLegs")
    m.use_nodes = True
    tx = m.node_tree.nodes.new("ShaderNodeTexImage")
    tx.image = bpy.data.images.load(img)
    m.node_tree.links.new(tx.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    me.materials.append(m)
    return o


def embers(n, spread, M, z=0.04):
    p = []
    for i in range(n):
        a, d = rng.uniform(0, 2 * math.pi), spread * math.sqrt(rng.uniform(0, 1))
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=rng.uniform(0.03, 0.05), radius2=0, depth=0.035, end_fill_type="NOTHING",
                                        location=(math.cos(a) * d, math.sin(a) * d, z), rotation=(0, 0, rng.uniform(0, 6.3)))   # a low glowing lump: 5 triangles
        o = bpy.context.object
        o.scale = (1, rng.uniform(0.7, 1.2), 1)
        p.append(_finish(o, M["ember" if i % 3 else "ember2"], smooth=False))
    return p


def hex_log(a, b, r, M, burnt=0.45, sides=6):
    """A low-poly fire log from a (in the ash) to b: one six-sided tube with a single extra ring where the bark turns to
    char, a cap on the burnt end and none on the buried end. 4 x sides + (sides - 2) triangles."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    x = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.99 else Vector((1, 0, 0))).normalized()
    y = d.cross(x)
    k = a.lerp(b, 1 - burnt)
    tw = rng.uniform(0, 1)
    rings = [[c + (x * math.cos((j + tw) / sides * 2 * math.pi) + y * math.sin((j + tw) / sides * 2 * math.pi)) * rr for j in range(sides)]
             for c, rr in ((a, r), (k, r), (b, r * 0.85))]
    verts = [v for ring in rings for v in ring]
    faces, mats = [], []
    for i, m in ((0, 0), (1, 1)):
        for j in range(sides):
            faces.append((i * sides + j, i * sides + (j + 1) % sides, (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j)); mats.append(m)
    faces.append(tuple(2 * sides + j for j in range(sides))); mats.append(1)
    me = bpy.data.meshes.new("log")
    me.from_pydata([tuple(v) for v in verts], [], faces)
    o = bpy.data.objects.new("log", me)
    bpy.context.collection.objects.link(o)
    me.materials.append(M["bark"])
    me.materials.append(M["char"])
    for poly, mi in zip(me.polygons, mats):
        poly.material_index = mi
    return [o]


def fire(M):
    """The teepee: seven split logs leaning together, kindling between them, embers in the ash. Hexagonal logs and
    four-sided kindling sticks (Adriaen: they need not be round)."""
    p = []
    for i in range(7):
        a = i / 7 * 2 * math.pi + rng.uniform(-0.15, 0.15)
        r0 = rng.uniform(0.3, 0.38)
        p += hex_log((math.cos(a) * r0, math.sin(a) * r0, 0.02), (math.cos(a + 0.25) * 0.05, math.sin(a + 0.25) * 0.05, rng.uniform(0.5, 0.58)),
                     rng.uniform(0.035, 0.045), M, burnt=0.45)
    for i in range(5):                                             # kindling sticks between them
        a = i / 5 * 2 * math.pi + 0.5
        p += hex_log((math.cos(a) * 0.22, math.sin(a) * 0.22, 0.03), (0, 0, 0.38), 0.016, M, burnt=0.5, sides=4)
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


def ribbon_arch(pts, w, m):
    """A thin wire as two crossed flat strips along the points (4 triangles a segment), instead of a round rod."""
    bm = bmesh.new()
    for off in (Vector((w, 0, 0)), None):
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            o = off if off is not None else (b - a).cross(Vector((1, 0, 0))).normalized() * w
            bm.faces.new([bm.verts.new(v) for v in (a - o, b - o, b + o, a + o)])
    me = bpy.data.meshes.new("wire")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("wire", me)
    bpy.context.collection.objects.link(o)
    return _finish(o, m, smooth=False)


def flat(n, r, at, m, sx=1.0, yaw=0.0):
    """A small flat n-gon lying on the soup (a carrot coin, a potato bit, a pea, a herb leaf, a swirl)."""
    c, sn = math.cos(yaw), math.sin(yaw)
    pts = []
    for i in range(n):
        t = 2 * math.pi * (i + 0.5) / n
        x, y = math.cos(t) * r * sx, math.sin(t) * r
        pts.append((at[0] + x * c - y * sn, at[1] + x * sn + y * c, at[2]))
    me = bpy.data.meshes.new("bit")
    me.from_pydata(pts, [], [tuple(range(n))])
    o = bpy.data.objects.new("bit", me)
    bpy.context.collection.objects.link(o)
    return _finish(o, m, smooth=False)


def pot(M):
    """The open iron pot, trimmed (camp review 2026-11-12, about 230 triangles): a 10-sided lathe with a rolled rim and
    the inside wall only down to the soup, the soup with flat bits on it, three feet, two lugs and a wire bail of
    crossed strips. Returns the pot and the top of the bail (where the chain hooks on)."""
    sz = SOUP.z - POT_Z
    prof = [(0.0, 0.0), (0.1, 0.0), (0.155, 0.05), (0.163, 0.13), (0.168, 0.158),   # outside up to the rim
            (0.152, 0.158), (0.147, sz - 0.004)]                                   # over the lip, down to the soup
    p = [lathe(prof, 10, M["iron"], z0=POT_Z)]
    p.append(lathe([(0.0, sz), (0.148, sz - 0.004)], 10, M["soup"], z0=POT_Z))
    for i in range(9):                                             # bits in the soup: carrot coins, potato, peas, herbs
        a, d = rng.uniform(0, 2 * math.pi), 0.11 * math.sqrt(rng.uniform(0.05, 1))
        at = (math.cos(a) * d, math.sin(a) * d, SOUP.z + 0.002)
        kind = ("carrot", "potato", "pea", "carrot", "potato", "herb", "pea", "carrot", "herb")[i]
        n, r, sx = {"carrot": (6, 0.018, 1), "potato": (4, 0.015, 1.2), "pea": (4, 0.009, 1), "herb": (4, 0.012, 2.2)}[kind]
        p.append(flat(n, r, at, M[kind], sx, rng.uniform(0, 3)))
    for k in range(4):                                             # a few lighter swirls on the surface
        a = k / 4 * 2 * math.pi + 0.4
        p.append(flat(4, 0.022, (math.cos(a) * 0.07, math.sin(a) * 0.07, SOUP.z + 0.001), M["soup2"], 1.6, a + 1.2))
    for k in range(3):                                             # three stubby feet
        a = k / 3 * 2 * math.pi
        p.append(cyl(0.015, 0.03, at=(math.cos(a) * 0.08, math.sin(a) * 0.08, POT_Z), m=M["iron"], verts=4))
    pivot = POT_Z + 0.15
    pts = [Vector((0, -0.175 * math.cos(t), pivot + 0.17 * math.sin(t))) for t in [k / 6 * math.pi for k in range(7)]]
    p.append(ribbon_arch(pts, 0.006, M["iron"]))
    peak = pts[3]
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


def build(samples=32, colour=None):
    """Build the fire set in a fresh scene, light it (colour(objs); by default its own AO bake at samples, no face
    splitting: the fire and pot are small enough that the plain faces shade fine) and write fire.glb."""
    reset()
    M = materials()
    ring_o, trip = ring(M), tripod(M)
    fire_o, emb = fire(M)
    pot_o, peak = pot(M)
    objs = [ring_o, trip, fire_o, emb, pot_o]
    for o in objs:
        apply_all(o)
        o.location = (0, 0, 0)
    (colour or (lambda objs: bake(objs, samples)))(objs)
    for o in objs:
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
    ch = chain(peak + Vector((0, 0, 0.006)), TOP - Vector((0, 0, 0.03)))   # up into the lashed crossing of the legs
    objs += [ch, tripod_legs()]
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
