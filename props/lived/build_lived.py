"""
Lived-in camp props for the Canopy Camp game (apps/canopy-prototype/camp.html): the small things that make the camp
look used. PROPS (above make()) lists them all, one row each with its builder and how it is lit. Triangles as of
2026-11-14 (build() prints them, with a breakdown per piece of the baked props):

    WoodStack      94  the stacked split logs by the fire as one textured block (renders of the detailed stack)
    LooseLogs      48  three loose split logs by the pile (textured, on the stack's atlas)
    SeatTop         2  the rustic seat's sawn top (textured; the page puts one on each of three seats)
    MatRoll        24  the rolled sleeping mat by the tent (textured)
    KitchenCrate   26  the kitchen crate (textured)
    WoodPile      178  the rest of the pile: end posts, a chopping stump with a hatchet in it and chips (baked)
    SeatThings    120  an enamel mug and a book left open face up, laid out on the rustic half-log seat's flat top (baked)
    TentSide      147  the pair of wellies by the tent (baked)
    KitchenThings 130  the pan, plates, honey jar and spoon on the crate (baked)

    .venv/bin/python props/lived/build_lived.py
    .venv/bin/python props/lived/build_lived.py --samples 64

One GLB, one object per prop, each at its own origin, standing on z = 0 with its front toward -Y (three.js +Z). The
light bake writes props/lived/lived.glb; a run on its own writes props/lived/lived_preview.glb (git-ignored).
SeatThings shares the Seat's origin (props/camp/build_camp.py rustic_seat(): log along X, flat top at SEAT_TOP), so the
page places it with the same transform as the seat it sits on. build() leaves the "baked" props one colour attribute
and no UVs, and the page draws them with a plain Lambert material; the "textured" ones keep their UVs and image.
Materials match the camp's rustic set, so the props sit with the picked camp.
make() only creates the objects in the current scene, without the faces that point down onto the ground (lib/mesh.py
drop_ground_faces, review R2-154); build() resets, makes, lights and exports.
How the page lights them: the light bake (props/bake_all.py, its light step props/camp/bake_camp_lightmap.py) runs
build() with flat colours, so the baked parts carry only their base colour, then gives every prop a second UV map
(TEXCOORD_1) into the shared camp light map the page multiplies them by, and writes the page's GLB and its
models/*.txt. A stand-alone run of this script is a preview only: build() then gives the baked parts their own Cycles
AO in the colour attribute, which the page never sees.
"""
import argparse
import hashlib
import json
import math
import os
import random
import shutil
import sys
import tempfile

import bpy
import bmesh  # noqa: E402  (needs bpy loaded first)
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from lib.bake import bake, pick_device  # noqa: E402
from lib.export import export_glb, report, reset  # noqa: E402
from lib.materials import image_material, mat  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "camp"))
from build_camp import DOOR_PLANK as PLANK, SEAT_BOARD, SEAT_TOP  # noqa: E402  (the seat and the tent planks, review R2-252)
from lib.mesh import apply_all, box, cyl, drop_faces, drop_ground_faces, join, obj_from_bm, quad, rod, rough_up, sweep, torus, tube  # noqa: E402

rng = random.Random(11)


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
        pan=(0.16, 0.16, 0.17), plate=(0.92, 0.92, 0.88), honey=(0.86, 0.56, 0.12), lid=(0.72, 0.2, 0.16),
        rubber=(0.2, 0.36, 0.2), coffee=(0.2, 0.11, 0.06), sole=(0.1, 0.09, 0.08), cuff=(0.14, 0.27, 0.15), mud=(0.3, 0.21, 0.13), inside=(0.08, 0.08, 0.07),
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
    # the handle runs through the eye at the back of the head and comes out flush with its top (-Z, away from the grip),
    # then on down to a plain end
    p.append(rod(Vector((-0.015, 0, -0.04)), Vector((-0.015, 0, 0.38)), 0.013, M["handle"], verts=6))   # one straight hexagonal shaft
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
    logs = stack_logs(M)
    sc = bpy.context.scene
    pick_device(sc)                                  # the fastest GPU there is, else the CPU (review R2-111)
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
    px = 900
    atlas_path = os.path.join(HERE, "wood_stack.jpg")
    # the three Cycles renders are most of this script's time (about 30 s of 36 s on a laptop CPU, every light bake), and
    # their inputs rarely change: wood_stack.json keeps a key of everything they depend on (the logs' vertices, the
    # material colours, the samples, the Blender version and the source from STACK_BOX to the end of _stack_block, which
    # holds the camera boxes, the renders, the atlas and the block's UVs) with the outline they gave, and while the key
    # matches and wood_stack.jpg is there, the renders are skipped. On a miss it prints which part changed. The seeded
    # logs are still built, so the random stream the rest of the props draw from is unchanged.
    stamp = os.path.join(HERE, "wood_stack.json")
    parts = _stack_key(logs, samples, px)
    key = hashlib.sha1(json.dumps(parts, sort_keys=True).encode()).hexdigest()
    cached, why = None, "no wood_stack.json"
    if not os.path.exists(atlas_path):
        why = "no wood_stack.jpg"
    elif os.path.exists(stamp):
        with open(stamp) as f:
            j = json.load(f)
        if j.get("key") == key:
            cached = [tuple(p) for p in j["outline"]]
        else:
            old = j.get("parts", {})
            why = ", ".join(k for k in parts if old.get(k) != parts[k]) + " changed" if old else "wood_stack.json is from an older key"
    outline = cached
    if cached is None:
        print(f"  wood stack: cache miss because {why}, rendering")
        tmpdir = tempfile.mkdtemp(prefix="wood_stack_")        # the three renders, removed however the run ends
        tmp = os.path.join(tmpdir, "%s.png")
        try:
            _render_view(tmp % "end", ((X0 + X1) / 2, -3, (Z0 + Z1) / 2), (math.pi / 2, 0, 0), W, H, px)
            _render_view(tmp % "side", (3, (Y0 + Y1) / 2, (Z0 + Z1) / 2), (math.pi / 2, 0, math.pi / 2), D, H, px)
            _render_view(tmp % "top", ((X0 + X1) / 2, (Y0 + Y1) / 2, 3), (0, 0, 0), W, D, px)
            outline = _stack_atlas(tmp, atlas_path, X0, W, Z0, H)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
        with open(stamp, "w") as f:
            json.dump({"key": key, "parts": parts, "outline": [list(p) for p in outline]}, f)   # full floats: the block comes out the same
    else:
        print("  wood stack: renders unchanged (wood_stack.json), reusing wood_stack.jpg")
    for o in logs:
        bpy.data.objects.remove(o)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)
    return _stack_block(outline, atlas_path, X0, W, Y0, D, Z0, H)


def _stack_key(logs, samples, px):
    """What the stack renders depend on (see wood_stack), as {part: sha1}: "source" (this file from STACK_BOX to the end
    of _stack_block), "logs" (their vertices, transforms and material colours), "settings" (samples and pixels per metre)
    and "blender" (its version)."""
    src = open(os.path.join(HERE, "build_lived.py"), encoding="utf-8").read()
    logs_h = hashlib.sha1()
    for o in logs:
        me = o.data
        co = [0.0] * (len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        mw = o.matrix_world
        logs_h.update(" ".join(f"{v:.5f}" for v in co).encode())
        logs_h.update(" ".join(f"{v:.5f}" for row in mw for v in row).encode())
        logs_h.update(" ".join(f"{m.name.split('.')[0]}:{tuple(round(c, 4) for c in m.get('base', ()))}" for m in me.materials if m).encode())
    sha = lambda t: hashlib.sha1(t.encode()).hexdigest()
    return {"source": sha(src[src.index("STACK_BOX = "):src.index("def ring_top")]), "logs": logs_h.hexdigest(),
            "settings": sha(f"{samples} {px}"), "blender": sha(bpy.app.version_string)}


def _stack_atlas(tmp, atlas_path, X0, W, Z0, H):
    """The three renders into wood_stack.jpg, and the stack's front outline from the end render's alpha."""
    from PIL import Image
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
    atlas.save(atlas_path, quality=82)
    # the outline: the top of the stack's silhouette across 22 columns (it has no overhangs, so a height field will do)
    import numpy as np
    a = end_a.getchannel("A")
    iw, ih = a.size
    solid = np.asarray(a)[::2] > 128                     # every other row, as the scan always read it
    cols = np.where(solid.any(axis=0), ih - 2 * solid.argmax(axis=0), 0).tolist()   # each column's top, from the bottom
    xs = [x for x in range(iw) if cols[x] > ih * 0.05]
    xl, xr = xs[0], xs[-1]
    outline = [(X0 + xl / iw * W, 0.0)]
    n = 22
    for k in range(n + 1):
        cx = round(xl + (xr - xl) * k / n)
        win = cols[max(xl, cx - 6):min(xr, cx + 6) + 1]
        outline.append((X0 + cx / iw * W, Z0 + (max(win) / ih) * H + 0.004))
    outline.append((X0 + xr / iw * W, 0.0))
    return outline


def _stack_block(outline, atlas_path, X0, W, Y0, D, Z0, H):
    """The stack's outline extruded along the logs, its faces mapped onto the atlas."""
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
    o = obj_from_bm(bm, "WoodStack")
    o.data.materials.append(image_material("WoodStack", atlas_path, roughness=0.9))
    return o


def ring_top(r, at, n, M):
    """A sawn top as one flat octagon fan with two growth rings painted in by alternating face colours (40 triangles,
    instead of modelled ring tori)."""
    x0, y0, z = at
    bm = bmesh.new()
    c = bm.verts.new((x0, y0, z))
    rings = [[bm.verts.new((x0 + rr * math.cos(2 * math.pi * (i + 0.5) / n), y0 + rr * math.sin(2 * math.pi * (i + 0.5) / n), z)) for i in range(n)] for rr in (r * 0.38, r * 0.7, r)]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((c, rings[0][i], rings[0][j])).material_index = 0
        bm.faces.new((rings[0][i], rings[1][i], rings[1][j], rings[0][j])).material_index = 1
        bm.faces.new((rings[1][i], rings[2][i], rings[2][j], rings[1][j])).material_index = 0
    o = obj_from_bm(bm, "ringtop")
    me = o.data
    me.materials.append(M["endgrain"])
    me.materials.append(M["wood"])
    return o


def wood_pile(M):
    """Everything in the wood pile but the stack itself (see wood_stack). Trimmed to about 180 triangles (camp review,
    2026-11-12): 5-sided posts, an 8-sided stump with its rings as face colours, capless roots, chips as single quads."""
    p = []
    # two posts at the ends keep the stack from rolling
    for s in (-1, 1):
        a, b = (s * 0.52, 0, -0.02), (s * 0.54, 0.02, 0.55)
        p.append(tube(a, b, 0.035, M["bark2"], sides=5))          # open at the buried foot
    k0 = mark(p, 0, "End posts")
    # the chopping stump beside it, with the hatchet left in
    sx, sy = 1.0, -0.15
    stump = cyl(0.22, 0.42, at=(sx, sy, 0.21), m=M["bark"], verts=8, smooth=False, caps=False)   # ring_top is its top
    p.append(rough_up(stump, 0.01, 10))
    p.append(ring_top(0.215, (sx, sy, 0.421), 8, M))
    for k in range(4):                              # roots flaring into the ground
        t = k / 4 * 2 * math.pi + 0.4
        a = (sx + math.cos(t) * 0.17, sy + math.sin(t) * 0.17, 0.05)
        b = (sx + math.cos(t) * 0.27, sy + math.sin(t) * 0.27, -0.03)
        p.append(tube(a, b, 0.045, M["bark"], sides=4, cap_b=False))   # both ends in the stump or the ground
    k0 = mark(p, k0, "Chopping stump")
    p.append(hatchet(M, (sx + 0.03, sy - 0.02, 0.505), yaw=-0.5, lean=0.85))   # the blade bitten in about 2 cm
    k0 = mark(p, k0, "Hatchet")
    for k in range(10):                             # chips round the stump: one flat quad each
        t, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.3, 0.6)
        cx, cy, w, h, yaw = sx + math.cos(t) * d, sy + math.sin(t) * d, rng.uniform(0.03, 0.06), rng.uniform(0.015, 0.03), rng.uniform(0, 3.14)
        c, sn = math.cos(yaw), math.sin(yaw)
        p.append(quad([(cx + u * c - v * sn, cy + u * sn + v * c, 0.006) for u, v in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))], M["chip" if k % 3 else "wood"]))
    mark(p, k0, "Wood chips")
    return join(p, "WoodPile")


# the loose logs lying about: (length, radius, x, y, yaw, end circle, side band), in WoodPile's own frame
LOOSE = [(0.4, 0.085, 1.38, -0.43, 1.1, 0, 0), (0.44, 0.08, 0.2, -0.45, 0.3, 1, 1), (0.46, 0.065, -0.35, -0.42, -0.2, 2, 2)]
# where they read the stack's atlas (wood_stack.jpg, 1024 px, y down): sawn ends with rings, and log sides. The logs the
# player carries on the page read other spots of the same atlas (activities/parts.js CARRIED: a strip of the logs seen
# from above and one round end); change one set without the other, but keep both on log bark and end grain
ATLAS_ENDS = [(442, 92, 54), (568, 90, 56), (150, 457, 48)]          # circle centre and radius
ATLAS_SIDES = [(545, 640), (740, 830), (835, 925)]                    # rows of one log side, x 20-355
HEX = 6


def loose_logs(logs=None, name="LooseLogs"):
    """The loose logs as plain hexagonal prisms (12 side + 8 end triangles each) on the stack's own texture, so they
    look like logs taken off the stack, through ATLAS_ENDS and ATLAS_SIDES. The page's carried logs use their own spots
    of the same atlas (activities/parts.js CARRIED), not these."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    U = lambda x, y: (x / 1024, 1 - y / 1024)  # noqa: E731
    for L, r, x, y, yaw, e, sd in logs or LOOSE:
        c, sn = math.cos(yaw), math.sin(yaw)
        zc = r * math.cos(math.radians(30))                         # a flat face down, so it rests on the ground
        t = sweep(bm, [(x - c * L / 2, y - sn * L / 2, zc), (x + c * L / 2, y + sn * L / 2, zc)], [r, r], HEX, cap_a=True,
                  twist=0.5, frame=((-sn, c, 0), (0, 0, 1)))
        y0, y1 = ATLAS_SIDES[sd]
        for k, f in enumerate(t["sides"][0]):
            va, vb = y0 + (y1 - y0) * k / HEX, y0 + (y1 - y0) * (k + 1) / HEX   # each face a slice across the band
            for lp, (ux, vy) in zip(f.loops, ((20, va), (20, vb), (355, vb), (355, va))):
                lp[uv].uv = U(ux, vy)
        ex, ey, er = ATLAS_ENDS[e]
        for s, ring, cap in ((-1, t["rings"][0], t["cap_a"]), (1, t["rings"][1], t["cap_b"])):
            for lp in cap.loops:
                a = t["angles"][ring.index(lp.vert)]
                lp[uv].uv = U(ex + er * math.cos(a) * s, ey - er * math.sin(a))
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    o = obj_from_bm(bm, name)
    me = o.data
    me.materials.append(bpy.data.materials["WoodStack"])           # the stack's own material and image, exported once
    return o


def page(w, d, side, M, lift):
    """One side of an open book: a single quad from the spine out to the fore edge, rising a little toward the edge."""
    x1 = side * w
    q = [(0, -d / 2, lift), (x1, -d / 2, lift + 0.012), (x1, d / 2, lift + 0.012), (0, d / 2, lift)]
    return quad(q if side > 0 else q[::-1], M["page"])


def mug(M, at):
    """The enamel mug, trimmed (Adriaen 2026-11-12): an 8-sided body with no bottom, the blue rim painted as a band at
    the top, coffee as one flat octagon, and a 6 x 3 handle loop (96 triangles instead of 244)."""
    x0, y0, z0 = at
    r, h, n = 0.042, 0.085, 8
    bm = bmesh.new()
    ring = lambda rr, zz: [bm.verts.new((x0 + rr * math.cos(2 * math.pi * (i + 0.5) / n), y0 + rr * math.sin(2 * math.pi * (i + 0.5) / n), z0 + zz)) for i in range(n)]  # noqa: E731
    lo, band, hi = ring(r, 0), ring(r, h - 0.008), ring(r, h)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], band[j], band[i])).material_index = 0
        bm.faces.new((band[i], band[j], hi[j], hi[i])).material_index = 1
    cof = ring(r * 0.86, h - 0.004)
    bm.faces.new(cof).material_index = 2                                 # the coffee, just under the rim
    for i in range(n):                                                   # the rim: a ring from the outside down to the coffee
        j = (i + 1) % n
        bm.faces.new((hi[i], hi[j], cof[j], cof[i])).material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        if f.calc_center_median().z > z0 + h - 0.006 and f.normal.z < 0:
            f.normal_flip()
    o = obj_from_bm(bm, "mug")
    me = o.data
    for k in ("enamel", "rim", "coffee"):
        me.materials.append(M[k])
    hd = torus(0.026, 0.006, at=(x0 + 0.048, y0, z0 + 0.045), rot=(math.pi / 2, 0, 0), m=M["enamel"], major=6, minor=3)
    for pl in hd.data.polygons:
        pl.use_smooth = False
    return join([o, hd], "mug")


def seat_things(M):
    """An enamel mug and an open book on the seat's flat top (log along X, top at SEAT_TOP)."""
    z = SEAT_TOP
    p = []
    mx, my = -0.42, 0.05
    p.append(mug(M, (mx, my, z)))
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


def seat_top_texture(path):
    """The sawn top of the half-log seat (SEAT_BOARD): pale wood with grain running along the log (no knots,
    Adriaen), a drying crack, and the sawn edges a little darker and worn."""
    from PIL import Image, ImageDraw, ImageFilter
    r = random.Random(5)
    k, W, H = 2, 1024, 320
    im = Image.new("RGB", (W * k, H * k), (206, 168, 120))
    d = ImageDraw.Draw(im)
    for i in range(46):                                       # grain lines along the log, gently wavy
        y0, col = r.uniform(0, H), r.choice([(186, 146, 100), (176, 136, 92), (222, 188, 142), (194, 154, 108)])
        ph, amp, w = r.uniform(0, 6.3), r.uniform(1, 4), r.choice([1, 1, 2, 2, 3])
        pts = []
        for x in range(0, W + 8, 8):
            y = y0 + amp * math.sin(x / r.uniform(60, 140) + ph)
            pts.append((x * k, y * k))
        d.line(pts, fill=col, width=w * k)
    pts = [(W * 0.52 * k, H * 0.5 * k)]                         # a drying crack from one sawn end
    x, y = W * 0.52, H * 0.5
    while x < W:
        x += r.uniform(14, 30); y += r.uniform(-3, 3); pts.append((x * k, y * k))
    d.line(pts, fill=(92, 62, 38), width=3 * k)
    im = im.filter(ImageFilter.GaussianBlur(1.2 * k))
    edge = Image.new("L", im.size, 0)                         # darker worn rim along the long edges and the sawn ends
    de = ImageDraw.Draw(edge)
    for i in range(14):
        de.rectangle((i * k, i * k, (W - i) * k, (H - i) * k), outline=int(120 * (1 - i / 14) ** 1.5), width=k)
    im = Image.composite(Image.new("RGB", im.size, (120, 86, 56)), im, edge)
    im.resize((W, H), Image.LANCZOS).save(path)


def seat_top():
    """One textured quad laid on the seat's flat top (2 triangles); the page puts a copy on each of the three seats."""
    img = os.path.join(HERE, "seat_top.png")
    seat_top_texture(img)
    hx, hy, z = SEAT_BOARD[0] / 2, SEAT_BOARD[1] / 2, SEAT_TOP + SEAT_BOARD[2] / 2 + 0.0005   # just over the top board's top face
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    f = bm.faces.new([bm.verts.new(c) for c in ((-hx, -hy, z), (hx, -hy, z), (hx, hy, z), (-hx, hy, z))])
    for lp, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lp[uv].uv = t
    o = obj_from_bm(bm, "SeatTop")
    o.data.materials.append(image_material("SeatTop", img))
    return o


# the tent side (props/camp/build_camp.py wall_tent, in the tent's own frame: x across, door toward -y, front wall at
# y -0.95, loose planks before it with their tops at z PLANK, build_camp.DOOR_PLANK). The doorway (|x| < 0.45) stays clear:
# you walk in there.
# side outline of a welly (x toward the toe, z up): a heel block and an arch under the sole, a rounded toe, the
# shaft flaring a little at the top
BOOT = [(-0.09, 0), (-0.035, 0), (-0.03, 0.012), (0.045, 0.012), (0.05, 0), (0.15, 0), (0.185, 0.02), (0.195, 0.045),
        (0.18, 0.075), (0.13, 0.095), (0.06, 0.11), (0.05, 0.2), (0.055, 0.3), (-0.08, 0.3), (-0.075, 0.2), (-0.1, 0.09), (-0.1, 0.03)]


def boot(M, at, yaw, roll=0.0):
    """A green welly: its side outline extruded (88 triangles), the foot a little wider than the shaft. Bands cut
    across it: a dark sole, mud up to 7 cm, a darker cuff at the top; the shaft top dark inside."""
    bm = bmesh.new()
    a = [bm.verts.new((x, -0.045, z)) for x, z in BOOT]
    b = [bm.verts.new((x, 0.045, z)) for x, z in BOOT]
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    n = len(BOOT)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    for v in bm.verts:                                         # wider round the foot, narrower up the shaft
        x, y, z = v.co
        v.co.y = y * (1.15 if z < 0.1 else 1.15 - 0.25 * min(1, (z - 0.1) / 0.1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for zc in (0.022, 0.07, 0.262):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zc), plane_no=(0, 0, 1))
    o = obj_from_bm(bm, "boot")
    me = o.data
    for k in ("rubber", "mud", "inside", "sole", "cuff"):
        me.materials.append(M[k])
    for pl in me.polygons:
        z = pl.center.z
        pl.material_index = 2 if pl.normal.z > 0.9 and z > 0.29 else 3 if z < 0.022 else 1 if z < 0.07 else 4 if z > 0.262 else 0
    o.rotation_euler = (roll, 0, yaw)
    o.scale = (1.25, 1.25, 1.25)                                 # grown-up size next to the tent door
    o.location = at
    return o


def tent_side(M):
    """A pair of muddy wellies kicked off on the planks right of the door, one fallen over."""
    p = [boot(M, (0.8, -1.15, PLANK), 1.75), boot(M, (1.08, -1.28, PLANK + 0.065), 2.1, roll=math.pi / 2)]
    mark(p, 0, "Wellies")
    return join(p, "TentSide")


def mat_roll_texture(path):
    """mat_roll.png, 128 x 64: the side (left half: foam ridges along the roll and two dark straps round it) and the end
    (right half: the rolled layers as a spiral)."""
    from PIL import Image, ImageDraw
    k = 4
    im = Image.new("RGB", (128 * k, 64 * k), (64, 128, 176))
    d = ImageDraw.Draw(im)
    for x in range(0, 64 * k, 6 * k):                         # the foam's ridges along the roll
        d.line((x, 0, x, 64 * k), fill=(52, 110, 156), width=2 * k)
    for y in (12, 46):                                         # two straps round it
        d.rectangle((0, y * k, 64 * k, (y + 6) * k), fill=(48, 44, 40))
        d.rectangle((0, (y + 1) * k, 64 * k, (y + 2) * k), fill=(80, 74, 66))
    d.rectangle((64 * k, 0, 128 * k, 64 * k), fill=(40, 90, 130))
    cx, cy = 96 * k, 32 * k
    pts = []
    for i in range(400):
        t = i / 400 * 5 * 2 * math.pi
        r = (2 + 28 * i / 400) * k
        pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    d.line(pts, fill=(92, 156, 204), width=3 * k)
    im.resize((128, 64), Image.LANCZOS).save(path)


def mat_roll(path):
    """A rolled foam sleeping mat lying on the planks left of the door: an 8-sided prism (28 triangles) with the
    straps painted on its side and the rolled spiral painted on its ends (mat_roll_texture, written to path)."""
    mat_roll_texture(path)
    L, r, sides = 0.6, 0.075, 8
    x0, y0, zc = -0.95, -1.2, PLANK + r * math.cos(math.pi / sides)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    t = sweep(bm, [(x0 - L / 2, y0, zc), (x0 + L / 2, y0, zc)], [r, r], sides, cap_a=True, twist=0.5, frame=((0, 1, 0), (0, 0, 1)))
    for i, f in enumerate(t["sides"][0]):                      # the side half of the image, straps across v
        for lp, (u, v) in zip(f.loops, ((i / sides, 0), ((i + 1) / sides, 0), ((i + 1) / sides, 1), (i / sides, 1))):
            lp[uv].uv = (u * 0.5, v)
    for s, ring, cap in ((-1, t["rings"][0], t["cap_a"]), (1, t["rings"][1], t["cap_b"])):
        for lp in cap.loops:
            a = t["angles"][ring.index(lp.vert)]
            lp[uv].uv = (0.75 + 0.235 * math.cos(a) * s, 0.5 + 0.47 * math.sin(a))
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    o = obj_from_bm(bm, "MatRoll")
    o.data.materials.append(image_material("MatRoll", path))
    return o


# the camp kitchen crate: an open wooden crate on the ground beside the snack table, on the side away from the fire
CW, CD, CH, CT = 0.5, 0.34, 0.28, 0.018       # outer width, depth, height, wall thickness


def crate_texture(path):
    """256 x 256: outer planks (left half), inside planks (top right), sawn rim (bottom right)."""
    from PIL import Image, ImageDraw
    k = 4
    im = Image.new("RGB", (256 * k, 256 * k), (60, 42, 28))
    d = ImageDraw.Draw(im)
    r = random.Random(3)
    def boards(x0, y0, x1, y1, n, base, dark):
        h = (y1 - y0) / n
        for i in range(n):
            c = tuple(int(v * r.uniform(0.92, 1.06)) for v in base)
            d.rectangle((x0 * k, (y0 + i * h + 2) * k, x1 * k, (y0 + (i + 1) * h - 2) * k), fill=c)
            for g in range(5):                                    # a few grain streaks along the board
                yy = y0 + i * h + r.uniform(5, h - 5)
                d.line((x0 * k, yy * k, x1 * k, (yy + r.uniform(-2, 2)) * k), fill=dark, width=k)
            for nx in (x0 + 6, x1 - 6):                           # two nails at each end
                d.ellipse(((nx - 1.6) * k, (y0 + i * h + h / 2 - 1.6) * k, (nx + 1.6) * k, (y0 + i * h + h / 2 + 1.6) * k), fill=(70, 66, 62))
    boards(0, 0, 128, 256, 3, (178, 136, 88), (150, 112, 70))
    # a stamped paw on the outside, faded
    cx, cy = 64 * k, 128 * k
    stamp = (128, 84, 52)
    d.ellipse((cx - 14 * k, cy - 4 * k, cx + 14 * k, cy + 18 * k), fill=stamp)
    for dx, dy in ((-16, -14), (-6, -22), (6, -22), (16, -14)):
        d.ellipse((cx + (dx - 5) * k, cy + (dy - 5) * k, cx + (dx + 5) * k, cy + (dy + 5) * k), fill=stamp)
    boards(128, 0, 256, 128, 3, (140, 104, 66), (116, 84, 52))
    d.rectangle((128 * k, 128 * k, 256 * k, 256 * k), fill=(204, 168, 120))
    im.resize((256, 256), Image.LANCZOS).save(path)


def kitchen_crate():
    """The crate as one textured open box: outer walls, inner walls, floor and rim (13 quads, 26 triangles)."""
    img = os.path.join(HERE, "kitchen_crate.png")
    crate_texture(img)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    def q(pts, uvs):
        f = bm.faces.new([bm.verts.new(p) for p in pts])
        for lp, t in zip(f.loops, uvs):
            lp[uv].uv = t
    X, Y, x, y, Z, z0 = CW / 2, CD / 2, CW / 2 - CT, CD / 2 - CT, CH, 0.02
    # outer walls, counter-clockwise seen from outside: u along the wall (the boards run along it), v up
    for (a, b), w in ((((-X, -Y), (X, -Y)), CW), (((X, -Y), (X, Y)), CD), (((X, Y), (-X, Y)), CW), (((-X, Y), (-X, -Y)), CD)):
        u1 = 0.5 * w / CW
        q([(a[0], a[1], 0), (b[0], b[1], 0), (b[0], b[1], Z), (a[0], a[1], Z)], [(0, 0), (u1, 0), (u1, 1), (0, 1)])
    # inner walls, facing in
    for (a, b), w in ((((x, -y), (-x, -y)), CW), (((x, y), (x, -y)), CD), (((-x, y), (x, y)), CW), (((-x, -y), (-x, y)), CD)):
        u1 = 0.5 + 0.5 * w / CW
        q([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], Z), (a[0], a[1], Z)], [(0.5, 0.5), (u1, 0.5), (u1, 1), (0.5, 1)])
    q([(-x, -y, z0), (x, -y, z0), (x, y, z0), (-x, y, z0)], [(0.5, 0.5), (1, 0.5), (1, 1), (0.5, 1)])      # floor
    # rim: four flat strips on top of the walls
    for pts in (((-X, -Y), (X, -Y), (x, -y), (-x, -y)), ((X, -Y), (X, Y), (x, y), (x, -y)), ((X, Y), (-X, Y), (-x, y), (x, y)), ((-X, Y), (-X, -Y), (-x, -y), (-x, y))):
        q([(p[0], p[1], Z) for p in pts], [(0.55, 0.05), (0.95, 0.05), (0.95, 0.45), (0.55, 0.45)])
    bm.verts.ensure_lookup_table()
    o = obj_from_bm(bm, "KitchenCrate")
    o.data.materials.append(image_material("KitchenCrate", img))
    return o


def top_only(o):
    """o (an upright cylinder) without its bottom cap."""
    return drop_faces(o, lambda n, c: n.z < -0.9)


def kitchen_things(M):
    """What's in and by the crate: a frying pan standing in it with its handle up, a stack of enamel plates, a honey
    jar and a wooden spoon (plain low-sided shapes, baked like the other props)."""
    p = []
    # the pan: a shallow 8-sided dish leaning against the back wall, handle sticking up out of the crate
    pan = cyl(0.12, 0.035, at=(0, 0, 0), m=M["pan"], verts=8, r2=0.1, smooth=False)
    handle = rod((0, 0.115, 0.01), (0, 0.3, 0.03), 0.012, M["pan"], verts=4)
    pj = join([pan, handle], "pan")
    pj.rotation_euler = (math.radians(75), 0, 0)                  # stood on its rim, dish to the front, handle up and out
    pj.location = (-0.08, 0.06, 0.14)
    p.append(pj)
    k0 = mark(p, 0, "Frying pan")
    # plates stacked on the floor of the crate, front right
    # (no caps nobody sees, review R2-154: the stack is open at both ends, under the rim and on the crate floor, and
    # the rim and the jar's lid have only their top)
    p.append(cyl(0.085, 0.04, at=(0.12, -0.04, 0.04), m=M["plate"], verts=8, smooth=False, caps=False))
    p.append(top_only(cyl(0.086, 0.004, at=(0.12, -0.04, 0.0615), m=M["rim"], verts=8, smooth=False)))
    k0 = mark(p, k0, "Enamel plates")
    # the honey jar in the back corner of the crate, and a wooden spoon resting across the rim
    p.append(cyl(0.045, 0.1, at=(0.17, 0.095, 0.07), m=M["honey"], verts=6, smooth=False, caps=False))
    p.append(top_only(cyl(0.05, 0.022, at=(0.17, 0.095, 0.131), m=M["lid"], verts=6, smooth=False)))
    k0 = mark(p, k0, "Honey jar")
    p.append(rod((-0.2, -0.17, CH + 0.008), (0.06, -0.15, CH + 0.03), 0.008, M["handle"], verts=4))
    p.append(box((0.07, 0.045, 0.014), at=(0.1, -0.148, CH + 0.03), rot=(0, 0.15, 0.08), m=M["handle"]))
    mark(p, k0, "Wooden spoon")
    return join(p, "KitchenThings")


# Every lived prop, in build order (the seeded stream rng is drawn in this order, so keep it): (name, builder(M, samples),
# how it is lit, a note for the triangle report). "baked" props take vertex colours (their own AO, or the light bake's
# flat colours) and lose their UVs; "textured" ones keep their UVs and image. A new prop is one row here; the page
# (campProps.js) and the light bake (bake_camp_lightmap.py PLACE) still place it by name.
PROPS = [
    ("WoodStack", lambda M, s: wood_stack(M, max(s, 48)), "textured", None),
    ("LooseLogs", lambda M, s: loose_logs(), "textured", None),
    ("SeatTop", lambda M, s: seat_top(), "textured", "(x3 seats on the page)"),
    ("MatRoll", lambda M, s: mat_roll(os.path.join(HERE, "mat_roll.png")), "textured", None),
    ("KitchenCrate", lambda M, s: kitchen_crate(), "textured", None),
    ("WoodPile", lambda M, s: wood_pile(M), "baked", None),
    ("SeatThings", lambda M, s: seat_things(M), "baked", None),
    ("TentSide", lambda M, s: tent_side(M), "baked", None),
    ("KitchenThings", lambda M, s: kitchen_things(M), "baked", None),
]
BAKED = tuple(n for n, _, kind, _ in PROPS if kind == "baked")
TEXTURED = tuple(n for n, _, kind, _ in PROPS if kind == "textured")


def make(samples=32):
    """Make the lived props (PROPS) in the current scene and return them as {name: object}, the BAKED ones first, each at
    its own origin. No reset, no light, no export. samples: the wood stack renders' samples (at least 48)."""
    M = materials()
    made = {name: fn(M, samples) for name, fn, _, _ in PROPS}
    for k in BAKED:                           # the baked props are joined from parts (join() applied them): at the origin
        o = made[k]
        o.location = (0, 0, 0)
        o.name = k
    drop_ground_faces(made.values())          # the bottoms standing on the ground (review R2-154)
    return {k: made[k] for k in BAKED + TEXTURED}


def build(samples=32, parts_out=None, colour=None, path=None):
    """Make the lived props in a fresh scene, light the BAKED ones (colour(objs); by default their own AO bake at samples)
    and write them all to path (default props/lived/lived_preview.glb)."""
    reset()
    every = make(samples)
    objs = {k: every[k] for k in BAKED}
    (colour or (lambda objs: bake(objs, samples)))(list(objs.values()))
    for o in objs.values():                   # baked props need no UVs; only the textured ones keep theirs
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
    path = export_glb(list(every.values()), path or os.path.join(HERE, "lived_preview.glb"), image_format="JPEG", quiet=True)
    report([every[k] for k in TEXTURED], note={n: t for n, _, _, t in PROPS if t})
    for k, o in objs.items():
        report([o])
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
        export_glb(split, parts_out, texcoords=False, check=False)    # the same faces, audited above
    print(f"lived -> {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--parts", help="also write each piece as its own object to this GLB, for a triangle breakdown")
    a = ap.parse_args()
    build(a.samples, a.parts)
    print("(a preview with its own AO; the page's lived.glb and models/lived.txt come from props/bake_all.py)")
