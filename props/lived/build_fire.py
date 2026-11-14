"""
The campfire and the soup pot over it for the Canopy Camp game (apps/canopy-prototype/camp.html), rebuilt 2026-11-11.
Adriaen picked from three fires and three kettles (the others are in git history, commit b1fe846):

    fire   teepee: split logs leaning together in a cone over a bed of ash and embers, in a ring of sooty stones
    pot    a squat cast-iron pot with no lid, full of a chunky tomato and veg soup, on a wire bail
    chain  hangs the pot's bail from the bamboo tripod's lashing: one quad per link, the planes turning ZX / ZY / ZX ...,
           with a drawn ring texture (chain_link.png, alpha cut on the page) instead of modelled rings

    .venv/bin/python props/lived/build_fire.py

One GLB, every object at the fire's origin, z up (three.js y up). Triangles as of 2026-11-14 (the export prints them):

    Ring       139  the stones and the ash bed (baked)
    Tripod      36  the rope lashing where the legs cross (baked)
    Fire       286  the teepee logs and kindling (baked)
    Embers      60  the glowing lumps in the ash (baked; drawn unlit on the page so they glow)
    Pot        242  the pot, the soup and its bits, the feet, the lugs and the bail (baked)
    Chain       36  one textured quad per link (chain_link.png, alpha cut on the page)
    TripodLegs  66  the three bamboo legs (textured, bamboo.png)

The light bake writes props/lived/fire.glb; a run on its own writes props/lived/fire_preview.glb (git-ignored). The
flames are animated cards made on the page. build() leaves the BAKED parts one colour attribute and no UVs; the
textured ones keep their UVs and image. The soup's middle, where the page puffs steam, is SOUP (three.js (0, y, 0)).
make() only creates the objects in the current scene, without the faces that point down onto the ground (lib/mesh.py
drop_ground_faces, review R2-154); build() resets, makes, lights and exports.
How the page lights them: the light bake (props/bake_all.py, its light step props/camp/bake_camp_lightmap.py) runs
build() with flat colours, so the baked parts carry only their base colour, then gives every prop a second UV map
(TEXCOORD_1) into the shared camp light map the page multiplies them by, and writes the page's GLB and its
models/*.txt. A stand-alone run of this script is a preview only: build() then gives the baked parts their own Cycles
AO in the colour attribute, which the page never sees.
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
from lib.export import export_glb, reset  # noqa: E402
from lib.materials import image_material, mat  # noqa: E402
from lib.mesh import apply_all, box, cyl, drop_faces, drop_ground_faces, join, obj_from_bm, sweep, torus, with_material  # noqa: E402

rng = random.Random(23)
LIFT = 0.3                             # how far the pot's base sits above 0.45 m, clear of the flames
POT_Z = 0.45 + LIFT                    # the pot's base
SOUP = Vector((0.0, 0.0, POT_Z + 0.135))   # the soup's surface, middle
TOP = Vector((0.0, 0.0, 1.75))         # where the tripod legs meet (tall, so the pot hangs on a long chain)


def materials():
    return {k: mat(f"fi_{k}", c) for k, c in dict(
        stone=(0.36, 0.35, 0.33), stone2=(0.28, 0.27, 0.26), soot=(0.12, 0.1, 0.09), ash=(0.42, 0.4, 0.37), char=(0.07, 0.055, 0.045),
        bark=(0.3, 0.21, 0.14), ember=(0.95, 0.28, 0.04), ember2=(1.0, 0.5, 0.08), rope=(0.7, 0.6, 0.4), iron=(0.13, 0.13, 0.14),
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
    o = obj_from_bm(bm, "stone")
    o.scale = scale
    o.location = at
    return with_material(o, m)


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
    ash = with_material(bpy.context.object, M["ash"], smooth=False)
    for v in ash.data.vertices:                                    # a ragged edge, not a perfect disc
        k = 1 + 0.18 * math.sin(3 * math.atan2(v.co.y, v.co.x) + 1) + sr.uniform(-0.1, 0.1)
        v.co.x *= k
        v.co.y *= k * 0.92
    p.append(ash)
    bpy.ops.mesh.primitive_circle_add(vertices=8, radius=0.3, fill_type="NGON", location=(0, 0, 0.025))
    char = with_material(bpy.context.object, M["char"], smooth=False)
    for v in char.data.vertices:
        k = 1 + sr.uniform(-0.25, 0.25)
        v.co.x *= k * 1.1
        v.co.y *= k
    p.append(char)
    return join(p, "Ring")


def tripod(M):
    """The rope lashing where the three legs cross (baked like the rest); the legs themselves are tripod_legs()."""
    return join([torus(0.05, 0.022, at=(0, 0, TOP.z - 0.06), m=M["rope"], major=6, minor=3)], "Tripod")   # 6 round: it is small (R2-154)


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
        top = TOP + (TOP - foot).normalized() * 0.16               # the tops poke out past the crossing
        L = (top - foot).length
        t = sweep(bm, [foot, top], [r, r], n)
        for k, f in enumerate(t["sides"][0]):
            for lp, u in zip(f.loops, ((k / n, 0), ((k + 1) / n, 0), ((k + 1) / n, L / 0.5), (k / n, L / 0.5))):
                lp[uv].uv = u
        for lp in t["cap_b"].loops:
            lp[uv].uv = (0.5, 0.01)                                # the node colour
    o = obj_from_bm(bm, "TripodLegs")
    o.data.materials.append(image_material("TripodLegs", img))
    return o


def embers(n, spread, M, z=0.04):
    p = []
    for i in range(n):
        a, d = rng.uniform(0, 2 * math.pi), spread * math.sqrt(rng.uniform(0, 1))
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=rng.uniform(0.03, 0.05), radius2=0, depth=0.035, end_fill_type="NOTHING",
                                        location=(math.cos(a) * d, math.sin(a) * d, z), rotation=(0, 0, rng.uniform(0, 6.3)))   # a low glowing lump: 5 triangles
        o = bpy.context.object
        o.scale = (1, rng.uniform(0.7, 1.2), 1)
        p.append(with_material(o, M["ember" if i % 3 else "ember2"], smooth=False))
    return p


def hex_log(a, b, r, M, burnt=0.45, sides=6):
    """A low-poly fire log from a (in the ash) to b: one six-sided tube with a single extra ring where the bark turns to
    char, a cap on the burnt end and none on the buried end. 4 x sides + (sides - 2) triangles."""
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    t = sweep(bm, [a, a.lerp(b, 1 - burnt), b], [r, r, r * 0.85], sides, twist=rng.uniform(0, 1))
    for f in t["sides"][1] + [t["cap_b"]]:                         # the burnt end
        f.material_index = 1
    o = obj_from_bm(bm, "log")
    o.data.materials.append(M["bark"])
    o.data.materials.append(M["char"])
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


def lathe(profile, segs, m, z0=0.0, flip=False):
    """Spin a (radius, z) profile round the z axis into a body. spin() faces each band by the profile's direction times
    the turn, so a profile running outward and up (the pot's outside) comes out facing in; flip=True reverses every face
    (review R2-146). The soup disc, whose one band runs outward at the top, already faces up and needs no flip."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z0 + z)) for r, z in profile]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=segs, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    if flip:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    o = obj_from_bm(bm, "lathe")
    return with_material(o, m)


def wire(pts, r, m):
    """A thin round wire along the points: a three-sided tube with no caps (its ends sit in the lugs), smooth shaded so it
    reads round, seen from every side (6 triangles a segment; review R2-147 replaced two one-sided crossed strips)."""
    bm = bmesh.new()
    sweep(bm, pts, [r] * len(pts), 3, cap_b=False)
    return with_material(obj_from_bm(bm, "wire"), m)


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
    return with_material(o, m, smooth=False)


def pot(M):
    """The open iron pot, trimmed (camp review 2026-11-12; 242 triangles since R2-154): a 10-sided lathe with a rolled rim and
    the inside wall only down to the soup, the soup with flat bits on it, three feet, two lugs and a round wire bail. Returns the pot and the top of the bail (where the chain hooks on)."""
    sz = SOUP.z - POT_Z
    prof = [(0.0, 0.0), (0.1, 0.0), (0.155, 0.05), (0.163, 0.13), (0.168, 0.158),   # outside up to the rim
            (0.152, 0.158), (0.147, sz - 0.004)]                                   # over the lip, down to the soup
    p = [lathe(prof, 10, M["iron"], z0=POT_Z, flip=True)]
    p.append(lathe([(0.0, sz), (0.148, sz - 0.004)], 10, M["soup"], z0=POT_Z))
    for i in range(9):                                             # bits in the soup: carrot coins, potato, peas, herbs
        a, d = rng.uniform(0, 2 * math.pi), 0.11 * math.sqrt(rng.uniform(0.05, 1))
        at = (math.cos(a) * d, math.sin(a) * d, SOUP.z + 0.002 + 0.0006 * i)   # each a step higher: overlapping bits z-fought (R2-152)
        kind = ("carrot", "potato", "pea", "carrot", "potato", "herb", "pea", "carrot", "herb")[i]
        n, r, sx = {"carrot": (6, 0.018, 1), "potato": (4, 0.015, 1.2), "pea": (4, 0.009, 1), "herb": (4, 0.012, 2.2)}[kind]
        p.append(flat(n, r, at, M[kind], sx, rng.uniform(0, 3)))
    for k in range(4):                                             # a few lighter swirls on the surface
        a = k / 4 * 2 * math.pi + 0.4
        p.append(flat(4, 0.022, (math.cos(a) * 0.07, math.sin(a) * 0.07, SOUP.z + 0.001), M["soup2"], 1.6, a + 1.2))
    for k in range(3):                                             # three stubby feet, no top cap (inside the pot, R2-154)
        a = k / 3 * 2 * math.pi
        foot = cyl(0.015, 0.03, at=(math.cos(a) * 0.08, math.sin(a) * 0.08, POT_Z), m=M["iron"], verts=4)
        p.append(drop_faces(foot, lambda n, c: n.z > 0.9))
    pivot = POT_Z + 0.15
    pts = [Vector((0, -0.175 * math.cos(t), pivot + 0.17 * math.sin(t))) for t in [k / 6 * math.pi for k in range(7)]]
    p.append(wire(pts, 0.007, M["iron"]))
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
    o = obj_from_bm(bm, "Chain")
    o.data.materials.append(image_material("Chain", tex_path, alpha=True))
    return o


BAKED = ("Ring", "Tripod", "Fire", "Embers", "Pot")       # the parts that take vertex colours; Chain and TripodLegs are textured


def make():
    """Make the fire set in the current scene and return it as {name: object}, the BAKED parts first, all at the fire's
    origin. No reset, no light, no export."""
    M = materials()
    ring_o, trip = ring(M), tripod(M)
    fire_o, emb = fire(M)
    pot_o, peak = pot(M)
    objs = [ring_o, trip, fire_o, emb, pot_o]
    for o in objs:                             # each is joined from parts (join() applied them): at the fire's origin
        o.location = (0, 0, 0)
    ch = chain(peak + Vector((0, 0, 0.006)), TOP - Vector((0, 0, 0.03)))   # up into the lashed crossing of the legs
    every = objs + [ch, tripod_legs()]
    drop_ground_faces(every)                  # the bottoms lying on the ground (review R2-154)
    return {o.name: o for o in every}


def build(samples=32, colour=None, path=None):
    """Make the fire set in a fresh scene, light the BAKED parts (colour(objs); by default their own AO bake at samples,
    no face splitting: the fire and pot are small enough that the plain faces shade fine) and write it all to path
    (default props/lived/fire_preview.glb)."""
    reset()
    every = make()
    objs = [every[k] for k in BAKED]
    textured = [o for k, o in every.items() if k not in BAKED]
    for o in textured:                        # the chain and the legs never shaded the fire's AO: keep them out of it
        o.hide_render = True
    (colour or (lambda objs: bake(objs, samples)))(objs)
    for o in textured:
        o.hide_render = False
    for o in objs:
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
    path = export_glb(list(every.values()), path or os.path.join(HERE, "fire_preview.glb"), image_format="AUTO")
    print(f"soup surface (three.js): (0, {SOUP.z:.3f}, 0)")
    print(f"fire -> {path}")


if __name__ == "__main__":
    build()
    print("(a preview with its own AO; the page's fire.glb and models/fire.txt come from props/bake_all.py)")
