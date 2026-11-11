"""
Lived-in camp props for the Canopy Camp game (apps/canopy-prototype/camp.html): the small things that make the camp
look used. Built in batches, so each can be checked before the next:

    batch 1   WoodStack   the stacked split logs by the fire as one textured block (renders of the detailed stack)
              WoodPile    the rest of the pile: end posts, a chopping stump with a hatchet in it, chips and a few loose logs
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
    """Split only the bigger faces (as the jeep does), so small props stay light. The mug and book are too small for
    the extra shading to show, so they keep their plain faces."""
    apply_all(o)
    if o.name == "SeatThings":
        return
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


def stack_logs(M):
    """The detailed log stack: split logs along Y (ends toward the fire and away), in rows that step in as they go up.
    About 2,000 triangles, so the page never draws it: wood_stack() renders it to a texture on a simple block."""
    p = []
    rows = [6, 5, 5, 4, 2]
    z = 0.0
    for row, n in enumerate(rows):
        w = 0.155
        for i in range(n):
            x = (i - (n - 1) / 2) * w + rng.uniform(-0.01, 0.01)
            kind = rng.choice(["half", "quarter", "quarter", "quarter", "whole"])
            r = {"half": rng.uniform(0.085, 0.095), "quarter": rng.uniform(0.11, 0.125), "whole": rng.uniform(0.07, 0.078)}[kind]   # snug: only seen as a render
            roll = rng.choice([0, math.pi / 2, math.pi, 1.5 * math.pi]) + rng.uniform(-0.15, 0.15)
            p.append(split_log(rng.uniform(0.44, 0.48), r, kind, M, at=(x, rng.uniform(-0.015, 0.015), z + 0.065),
                               yaw=math.pi / 2 + rng.uniform(-0.04, 0.04), roll=roll))
        z += 0.115
    return p


STACK_BOX = dict(x=(-0.56, 0.56), y=(-0.26, 0.26), z=(0.0, 0.64))     # the region the stack renders cover


def _render_view(path, at, rot, w, h, px):
    """An orthographic Cycles render of w x h metres (centred on at, camera rotation rot) at px pixels per metre,
    lit only by a white sky, so it shades like the baked AO on the other props."""
    sc = bpy.context.scene
    cam = sc.camera
    cam.location, cam.rotation_euler = at, rot
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(w, h)
    sc.render.resolution_x, sc.render.resolution_y = round(w * px), round(h * px)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def wood_stack(M, samples):
    """The log stack as one block: its front outline extruded along the logs, painted with renders of the detailed
    stack (end grain on the two ends, log sides on the left and right, log tops on top), so it costs about 100 triangles."""
    from PIL import Image
    logs = stack_logs(M)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.world = sc.world or bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    sc.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy, sun.data.angle = 2.2, math.radians(25)
    sun.rotation_euler = (math.radians(50), math.radians(-25), math.radians(-30))   # from the front, above and to the left
    bpy.context.collection.objects.link(sun)
    for m in bpy.data.materials:                     # Cycles reads node colours, so copy each base colour in
        if "base" in m:
            m.use_nodes = True
            m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*m["base"], 1)
            m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    # growth rings on the sawn ends, round each piece's own axis (the logs lie along Y)
    nt = M["endgrain"].node_tree
    tc, wave, ramp = nt.nodes.new("ShaderNodeTexCoord"), nt.nodes.new("ShaderNodeTexWave"), nt.nodes.new("ShaderNodeValToRGB")
    wave.wave_type, wave.rings_direction = "RINGS", "Y"
    wave.inputs["Scale"].default_value = 15
    wave.inputs["Distortion"].default_value = 2.5
    ramp.color_ramp.elements[0].color = (0.64, 0.48, 0.31, 1)
    ramp.color_ramp.elements[1].color = (*M["endgrain"]["base"], 1)
    ramp.color_ramp.elements[1].position = 0.45
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    (X0, X1), (Y0, Y1), (Z0, Z1) = STACK_BOX["x"], STACK_BOX["y"], STACK_BOX["z"]
    W, D, H = X1 - X0, Y1 - Y0, Z1 - Z0
    tmp = os.path.join(HERE, "_stack_%s.png")
    px = 900
    _render_view(tmp % "end", ((X0 + X1) / 2, -3, (Z0 + Z1) / 2), (math.pi / 2, 0, 0), W, H, px)
    _render_view(tmp % "side", (3, (Y0 + Y1) / 2, (Z0 + Z1) / 2), (math.pi / 2, 0, math.pi / 2), D, H, px)
    _render_view(tmp % "top", ((X0 + X1) / 2, (Y0 + Y1) / 2, 3), (0, 0, 0), W, D, px)
    for o in logs:
        bpy.data.objects.remove(o)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)
    # the atlas: ends on the top half, sides bottom left, top bottom right; gaps between logs are dark shadow
    gap = (46, 32, 22, 255)
    def flat(name):
        im = Image.open(tmp % name).convert("RGBA")
        bg = Image.new("RGBA", im.size, gap)
        bg.alpha_composite(im)
        return im, bg.convert("RGB")
    end_a, end = flat("end")
    _, side = flat("side")
    _, top = flat("top")
    atlas = Image.new("RGB", (1024, 1024), gap[:3])
    atlas.paste(end.resize((1024, 512), Image.LANCZOS), (0, 0))
    atlas.paste(side.resize((384, 512), Image.LANCZOS), (0, 512))
    atlas.paste(top.resize((640, 512), Image.LANCZOS), (384, 512))
    atlas_path = os.path.join(HERE, "wood_stack.jpg")
    atlas.save(atlas_path, quality=82)
    # the outline: the top of the stack's silhouette across 22 columns (it has no overhangs, so a height field will do)
    a = end_a.getchannel("A")
    iw, ih = a.size
    cols = []
    for x in range(iw):
        ys = [y for y in range(0, ih, 2) if a.getpixel((x, y)) > 128]
        cols.append(ih - min(ys) if ys else 0)
    xs = [x for x in range(iw) if cols[x] > ih * 0.05]
    xl, xr = xs[0], xs[-1]
    outline = [(X0 + xl / iw * W, 0.0)]
    n = 22
    for k in range(n + 1):
        cx = round(xl + (xr - xl) * k / n)
        win = cols[max(xl, cx - 6):min(xr, cx + 6) + 1]
        outline.append((X0 + cx / iw * W, Z0 + (max(win) / ih) * H + 0.004))
    outline.append((X0 + xr / iw * W, 0.0))
    # extrude it along the logs, between the two end faces
    ya, yb = -0.235, 0.235
    bm = bmesh.new()
    front = [bm.verts.new((x, ya, z)) for x, z in outline]
    back = [bm.verts.new((x, yb, z)) for x, z in outline]
    bm.faces.new(front[::-1])
    bm.faces.new(back)
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        if i == len(outline) - 1:
            continue                                  # the bottom stays open: it sits on the ground
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method="BEAUTY", ngon_method="BEAUTY")
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        nrm = f.normal
        for l in f.loops:
            x, y, z = l.vert.co
            if abs(nrm.y) > 0.7:                      # an end: the end-grain render
                l[uv].uv = ((x - X0) / W, 0.5 + 0.5 * (z - Z0) / H)
            elif abs(nrm.x) >= abs(nrm.z):            # a steep side: the log sides
                l[uv].uv = (0.375 * (y - Y0) / D, 0.5 * (z - Z0) / H)
            else:                                     # a flat top: the log tops
                l[uv].uv = (0.375 + 0.625 * (x - X0) / W, 0.5 * (y - Y0) / D)
    me = bpy.data.meshes.new("WoodStack")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("WoodStack", me)
    bpy.context.collection.objects.link(o)
    m = bpy.data.materials.new("WoodStack")
    m.use_nodes = True
    tex = m.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(atlas_path)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    me.materials.append(m)
    for name in ("end", "side", "top"):
        os.remove(tmp % name)
    return o


def wood_pile(M):
    """Everything in the wood pile but the stack itself (see wood_stack)."""
    p = []
    # two posts at the ends keep the stack from rolling
    for s in (-1, 1):
        p.append(rough_up(rod((s * 0.52, 0, -0.02), (s * 0.54, 0.02, 0.55), 0.035, M["bark2"], verts=8), 0.004, 12))
    k0 = mark(p, 0, "End posts")
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
    p.append(hatchet(M, (sx + 0.03, sy - 0.02, 0.505), yaw=-0.5, lean=0.85))   # the blade bitten in about 2 cm
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


def quad(corners, m):
    """One flat face (a page, a line of print, a ribbon)."""
    me = bpy.data.meshes.new("quad")
    me.from_pydata(corners, [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new("quad", me)
    bpy.context.collection.objects.link(o)
    return _finish(o, m, smooth=False)


def page(w, d, side, M, lift):
    """One side of an open book: a single quad from the spine out to the fore edge, rising a little toward the edge."""
    x1 = side * w
    q = [(0, -d / 2, lift), (x1, -d / 2, lift + 0.012), (x1, d / 2, lift + 0.012), (0, d / 2, lift)]
    return quad(q if side > 0 else q[::-1], M["page"])


def seat_things(M):
    """An enamel mug and an open book on the seat's flat top (log along X, top at SEAT_TOP)."""
    z = SEAT_TOP
    p = []
    mx, my = -0.42, 0.05
    p.append(cyl(0.042, 0.085, at=(mx, my, z + 0.0425), m=M["enamel"], verts=16))
    p.append(quad([(mx + 0.036 * math.cos(a), my + 0.036 * math.sin(a), z + 0.081) for a in (0, 1.571, 3.142, 4.712)], M["rim"]))   # dark coffee inside
    p[-1].modifiers.new("r", "SUBSURF").levels = 1
    p.append(torus(0.042, 0.004, at=(mx, my, z + 0.085), m=M["rim"], major=16, minor=3))
    h = torus(0.026, 0.006, at=(mx + 0.048, my, z + 0.045), rot=(math.pi / 2, 0, 0), m=M["enamel"], major=10, minor=4)
    p.append(h)
    k0 = mark(p, 0, "Enamel mug")
    # the book: a cover a little bigger than the pages, open face up, a ribbon hanging off the end
    bx, by, yaw = 0.18, -0.02, 0.25
    book = [box((0.31, 0.21, 0.008), at=(0, 0, 0.004), m=M["cover"])]
    for s in (-1, 1):
        book.append(page(0.145, 0.195, s, M, lift=0.012))
        for k in range(3):                          # a few lines of print, each one quad lying on its page
            x0, x1, yk = s * 0.032, s * 0.112, 0.05 - k * 0.035
            zf = lambda x: 0.012 + 0.012 * abs(x) / 0.145 + 0.0008
            q = [(x0, yk - 0.002, zf(x0)), (x1, yk - 0.002, zf(x1)), (x1, yk + 0.002, zf(x1)), (x0, yk + 0.002, zf(x0))]
            book.append(quad(q if s > 0 else q[::-1], M["ink"]))
    book.append(quad([(-0.004, -0.098, 0.009), (0.004, -0.098, 0.009), (0.004, -0.16, 0.0), (-0.004, -0.16, 0.0)][::-1], M["ribbon"]))
    b = join(book, "book")
    b.rotation_euler = (0, 0, yaw)
    b.location = (bx, by, z)
    p.append(b)
    mark(p, k0, "Open book")
    return join(p, "SeatThings")


def build(samples, parts_out=None):
    reset()
    M = materials()
    stack = wood_stack(M, max(samples, 48))
    objs = {"WoodPile": wood_pile(M), "SeatThings": seat_things(M)}
    for k, o in objs.items():
        apply_all(o)
        o.location = (0, 0, 0)
        o.name = k
    bake(list(objs.values()), samples)
    for o in objs.values():                   # baked props need no UVs; only the stack is textured
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
    path = os.path.join(HERE, "lived.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in [*objs.values(), stack]:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=True,
                              export_image_format="JPEG")
    print(f"  WoodStack: {sum(len(pl.vertices) - 2 for pl in stack.data.polygons)} triangles")
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
