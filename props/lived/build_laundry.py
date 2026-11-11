"""
The laundry line for the Canopy Camp game (apps/canopy-prototype/camp.html), lived-in props batch 2 (2026-11-11).

    LaundryPosts   two forked sticks pushed into the ground (baked AO, like the other props)
    LaundryCloth   the line, a striped towel folded over it and three sloth-sized socks with toe pockets for the claws,
                   all textured quads on one drawn atlas (laundry.png, alpha cut on the page); the pegs are painted in

Triangles go where they show (Adriaen's rule, 2026-11-11): the line is two crossed strips, the towel is two quads (one
each side of the line), each sock is one quad. A gap is left on the line at HANG_T for a sloth to hang from (the
sloth-life thread builds that sloth).

    .venv/bin/python props/lived/build_laundry.py

One GLB (props/lived/laundry.glb), z up (three.js y up), the line along X from -L/2 to L/2, centred on the origin.
"""
import math
import os
import sys

import bpy
import bmesh  # noqa: E402
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "camp"))
import build_camp  # noqa: E402
from build_camp import apply_all, bake, join, mat, reset, rod  # noqa: E402

build_camp.densify = lambda o, *_: apply_all(o)   # no face splitting for the bake: plain faces shade fine at this size

L = 3.0            # post to post
H = 1.62           # where the line is tied on the posts
SAG = 0.13         # how far the middle hangs down
HANG_T = 0.42      # the free spot on the line for a hanging sloth (0 = the -X post, 1 = the +X post)


def line_z(t):
    return H - SAG * 4 * t * (1 - t)


def line_x(t):
    return -L / 2 + L * t


def atlas(path):
    """512x256: towel (0-200), three socks (200-440), rope (440-512). Drawn 4x and scaled down for smooth edges."""
    from PIL import Image, ImageDraw
    k = 4
    W, Hh = 512, 256
    im = Image.new("RGBA", (W * k, Hh * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    S = lambda *v: [x * k for x in v]  # noqa: E731

    # towel: cream with pink and leaf-green stripes near each end, a fringe at the bottom
    d.rectangle(S(4, 4, 196, 236), fill=(246, 236, 214, 255))
    for y0, c in ((30, (240, 140, 170, 255)), (44, (130, 186, 110, 255)), (190, (130, 186, 110, 255)), (204, (240, 140, 170, 255))):
        d.rectangle(S(4, y0, 196, y0 + 8), fill=c)
    for x in range(8, 196, 8):
        d.line(S(x, 236, x + 1, 252), fill=(230, 218, 192, 255), width=3 * k)
    for x in range(4, 196, 6):  # soft weave
        d.line(S(x, 4, x, 236), fill=(232, 222, 200, 255), width=k)

    # socks: tube down, then a foot with three round toe pockets for the claws; a peg at the top
    socks = [((200, 280), (255, 205, 90)), ((280, 360), (150, 210, 200)), ((360, 440), (240, 150, 175))]
    for i, ((x0, x1), col) in enumerate(socks):
        c = col + (255,)
        cx = (x0 + x1) / 2
        d.rounded_rectangle(S(cx - 22, 18, cx + 22, 170), radius=10 * k, fill=c)                # leg tube
        d.rounded_rectangle(S(cx - 22, 130, cx + 34, 192), radius=20 * k, fill=c)   # foot, toward +x
        for tx in (cx - 12, cx + 6, cx + 24):                                                   # three toe pockets for the claws
            d.ellipse(S(tx - 11, 182, tx + 11, 204), fill=c)
            d.line(S(tx - 9, 186, tx - 2, 191), fill=tuple(int(v * 0.85) for v in col) + (255,), width=2 * k)
        dark = tuple(int(v * 0.8) for v in col) + (255,)
        d.rectangle(S(cx - 22, 18, cx + 22, 34), fill=dark)                                     # ribbed cuff
        if i == 1:
            for y in range(50, 130, 22):
                d.rectangle(S(cx - 22, y, cx + 22, y + 9), fill=(250, 245, 230, 255))            # stripes
        if i == 2:
            d.ellipse(S(cx - 30, 150, cx - 4, 196), fill=dark)                                  # darned heel patch
        d.rounded_rectangle(S(cx - 6, 0, cx + 6, 30), radius=3 * k, fill=(196, 150, 100, 255))   # wooden peg
        d.line(S(cx, 2, cx, 28), fill=(150, 110, 70, 255), width=k)

    # towel pegs
    for px in (40, 160):
        d.rounded_rectangle(S(px - 6, 0, px + 6, 26), radius=3 * k, fill=(196, 150, 100, 255))
        d.line(S(px, 2, px, 24), fill=(150, 110, 70, 255), width=k)

    # rope: a plain twine strip
    d.rectangle(S(444, 0, 512, 256), fill=(205, 182, 140, 255))
    for y in range(0, 256, 10):
        d.line(S(444, y, 512, y + 6), fill=(180, 158, 118, 255), width=2 * k)
    im.resize((W, Hh), Image.LANCZOS).save(path)


def textured(name, quads, img):
    """One object from quads, each given as (four corners, (u0, v0, u1, v1)) in atlas pixels; corners go
    bottom-left, bottom-right, top-right, top-left."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for corners, (u0, v0, u1, v1) in quads:
        f = bm.faces.new([bm.verts.new(c) for c in corners])
        for lp, (u, v) in zip(f.loops, ((u0, v1), (u1, v1), (u1, v0), (u0, v0))):
            lp[uv].uv = (u / 512, 1 - v / 256)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    tx = m.node_tree.nodes.new("ShaderNodeTexImage")
    tx.image = bpy.data.images.load(img)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    m.node_tree.links.new(tx.outputs["Color"], bsdf.inputs["Base Color"])
    m.node_tree.links.new(tx.outputs["Alpha"], bsdf.inputs["Alpha"])
    me.materials.append(m)
    return o


def hanging(t0, t1, drop, uvr, y=0.0, peg_above=0.02):
    """A flat cloth quad hanging from the line between t0 and t1, `drop` long; its top edge follows the sag."""
    a, b = Vector((line_x(t0), y, line_z(t0) + peg_above)), Vector((line_x(t1), y, line_z(t1) + peg_above))
    return ([a - Vector((0, 0, drop)), b - Vector((0, 0, drop)), b, a], uvr)


def cloth(img):
    q = []
    n = 10                                                         # the line: two crossed strips following the sag
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        a, b = Vector((line_x(t0), 0, line_z(t0))), Vector((line_x(t1), 0, line_z(t1)))
        w = 0.007
        q.append(([a + Vector((0, 0, -w)), b + Vector((0, 0, -w)), b + Vector((0, 0, w)), a + Vector((0, 0, w))], (446, 0, 510, 256)))
        q.append(([a + Vector((0, -w, 0)), b + Vector((0, -w, 0)), b + Vector((0, w, 0)), a + Vector((0, w, 0))], (446, 0, 510, 256)))
    # the towel folded over the line: a quad on each side, the back one shorter so the fold shows
    q.append(hanging(0.1, 0.28, 0.5, (4, 0, 196, 252), y=-0.012, peg_above=0.025))
    q.append(hanging(0.1, 0.28, 0.36, (4, 0, 196, 160), y=0.012, peg_above=0.0))
    # three socks past the sloth's gap
    for t, (u0, u1) in ((0.58, (200, 280)), (0.68, (280, 360)), (0.78, (360, 440))):
        w = 0.085 / L
        q.append(hanging(t - w / 2, t + w / 2, 0.21, (u0, 0, u1, 206), peg_above=0.03))
    return textured("LaundryCloth", q, img)


def posts():
    M = {"pole": mat("la_pole", (0.42, 0.31, 0.2)), "pole2": mat("la_pole2", (0.34, 0.25, 0.16))}
    p = []
    for s in (-1, 1):
        foot = Vector((s * (L / 2 + 0.06), 0, 0))
        top = Vector((s * L / 2, 0, H + 0.12))
        p.append(rod(foot, top, 0.03, M["pole"], verts=6))
        fork = top + Vector((-s * 0.08, 0.02, 0.1))                # a fork the line sits in
        p.append(rod(top - Vector((0, 0, 0.1)), fork, 0.016, M["pole2"], verts=4))
    return join(p, "LaundryPosts")


def build():
    reset()
    img = os.path.join(HERE, "laundry.png")
    atlas(img)
    po = posts()
    apply_all(po)
    bake([po], 32)
    while po.data.uv_layers:
        po.data.uv_layers.remove(po.data.uv_layers[0])
    cl = cloth(img)
    path = os.path.join(HERE, "laundry.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in (po, cl):
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=True,
                              export_image_format="AUTO")
    for o in (po, cl):
        print(f"  {o.name}: {sum(len(pl.vertices) - 2 for pl in o.data.polygons)} triangles")
    print(f"hang point (local, three.js): x {line_x(HANG_T):.3f}, y {line_z(HANG_T):.3f}, z 0")
    print(f"laundry: {os.path.getsize(path) // 1024} KB -> {path}")


if __name__ == "__main__":
    build()
