"""
Generator fingerprint: runs one props/ builder or bake script headless in bpy and writes a JSON fingerprint of what it
made, so a refactor of the generators can be checked to change nothing (same fingerprint before and after).

    .venv/bin/python tools/gen_fingerprint.py --out fp.json -- props/lived/build_fire.py
    .venv/bin/python tools/gen_fingerprint.py --out fp.json --stop-at-bake -- props/camp/bake_camp_lightmap.py --size 4096
    .venv/bin/python tools/gen_fingerprint.py --compare a.json b.json

Run it on a scratch copy of the repo (it runs the script where it lies, and the script writes its outputs next to
itself). For every glTF export the script makes, and once at the end, it records every object in the scene: name,
type, parent, world matrix, vertex positions (rounded to 1e-6), faces with their material index and smoothing, every UV
layer, colour attribute and generic attribute, materials with their node trees and colours, custom properties, lights,
the world and the render and bake settings. It also records the sha256 of every file the run wrote or changed.
--stable makes the run reproducible where Blender numbers vertices by memory address (see stabilise); use it on both
sides of a comparison. --stop-at-bake stops the run at its first bpy.ops.object.bake call and records the scene as it stands then (for
bake_camp_lightmap.py: the unwrapped scene with its lights, stand-in materials and settings, before any Cycles work).
Values are stored as hashes per field, with triangle counts in clear, so --compare names the fields that moved.
"""
import argparse
import hashlib
import json
import os
import runpy
import sys


def _h(x):
    return hashlib.sha1(repr(x).encode()).hexdigest()[:16]


def _r(v, k=6):
    return round(float(v), k) + 0.0


def _sock(s):
    v = getattr(s, "default_value", None)
    if v is None:
        return None
    try:
        return [_r(x) for x in v]
    except TypeError:
        return _r(v) if isinstance(v, float) else v


def _props(idb):
    out = {}
    for k in idb.keys():
        v = idb[k]
        out[k] = list(v) if hasattr(v, "__len__") and not isinstance(v, str) else v
    return out


def node_tree(nt):
    if nt is None:
        return None
    nodes = []
    for n in sorted(nt.nodes, key=lambda n: n.name):
        d = {"name": n.name, "type": n.bl_idname, "inputs": {s.identifier: _sock(s) for s in n.inputs}}
        for attr in ("layer_name", "wave_type", "rings_direction", "interpolation", "extension"):
            if hasattr(n, attr):
                d[attr] = getattr(n, attr)
        if getattr(n, "image", None) is not None:
            d["image"] = n.image.name
        if getattr(n, "color_ramp", None) is not None:
            d["ramp"] = [(_r(e.position), [_r(c) for c in e.color]) for e in n.color_ramp.elements]
        nodes.append(d)
    links = sorted((l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier) for l in nt.links)
    return {"nodes": nodes, "links": links}


def mesh_fp(me):
    import numpy as np
    co = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get("co", co)
    co = np.round(co, 6).reshape(-1, 3)
    d = {"verts": len(me.vertices), "faces": len(me.polygons), "tris": sum(len(p.vertices) - 2 for p in me.polygons),
         "co": _h(co.tolist()),
         "polys": _h([(tuple(p.vertices), p.material_index, p.use_smooth) for p in me.polygons]),
         "edges": _h([tuple(e.vertices) for e in me.edges]),
         "uv": {}, "colour": {}, "attr": {}, "materials": [m.name if m else None for m in me.materials]}
    corner = [[] for _ in range(len(me.loops))]          # every value each face corner carries, for "canon" below
    for uv in me.uv_layers:
        a = np.empty(len(me.loops) * 2, np.float64)
        uv.data.foreach_get("uv", a)
        a = np.round(a, 6)
        d["uv"][uv.name] = {"active": uv.active, "active_render": uv.active_render, "data": _h(a.tolist())}
        for i, v in enumerate(a.reshape(-1, 2).tolist()):
            corner[i].append(tuple(v))
    for c in me.color_attributes:
        a = np.empty(len(c.data) * 4, np.float64)
        c.data.foreach_get("color", a)
        a = np.round(a, 6)
        d["colour"][c.name] = {"domain": c.domain, "type": c.data_type, "data": _h(a.tolist())}
        if c.domain == "CORNER":
            for i, v in enumerate(a.reshape(-1, 4).tolist()):
                corner[i].append(tuple(v))
        else:
            vals = a.reshape(-1, 4).tolist()
            for li, lp in enumerate(me.loops):
                corner[li].append(tuple(vals[lp.vertex_index]))
    # the same faces with no vertex or face numbering: each face as its corners (position, every UV and colour), started
    # at its smallest corner, plus material and smoothing, all sorted. Equal "canon" but different "polys" is only a
    # renumbering (some Blender ops number vertices by memory address, so that varies from run to run).
    faces = []
    for p in me.polygons:
        cs = [(tuple(co[me.loops[li].vertex_index]), *corner[li]) for li in p.loop_indices]
        k = min(range(len(cs)), key=lambda i: cs[i])
        faces.append((tuple(cs[k:] + cs[:k]), p.material_index, p.use_smooth))
    d["canon"] = _h(sorted(faces))
    d["active_colour"] = me.color_attributes.active_color.name if me.color_attributes.active_color else None
    for at in me.attributes:
        if at.name.startswith(".") or at.name in ("position",) or at.name in me.uv_layers or at.name in me.color_attributes:
            continue
        try:
            vals = [tuple(x.value) if hasattr(x.value, "__len__") else x.value for x in at.data]
        except AttributeError:
            vals = None
        d["attr"][at.name] = {"domain": at.domain, "type": at.data_type, "data": _h(vals)}
    return d


def scene_fp():
    import bpy
    sc = bpy.context.scene
    objs = {}
    for o in bpy.data.objects:
        d = {"type": o.type, "parent": o.parent.name if o.parent else None, "data_name": o.data.name if o.data else None,
             "matrix": _h([[_r(x) for x in row] for row in o.matrix_world]), "rotation_mode": o.rotation_mode,
             "hide_render": o.hide_render, "visible_shadow": o.visible_shadow, "props": _props(o),
             "modifiers": [(m.name, m.type) for m in o.modifiers], "in_scene": o.name in sc.objects}
        if o.type == "MESH":
            d["mesh"] = mesh_fp(o.data)
        elif o.type == "LIGHT":
            L = o.data
            d["light"] = {"type": L.type, "color": [_r(c) for c in L.color], "energy": _r(L.energy),
                          "soft": _r(getattr(L, "shadow_soft_size", 0)), "angle": _r(getattr(L, "angle", 0)),
                          "location": [_r(c) for c in o.matrix_world.translation]}
        objs[o.name] = d
    mats = {}
    for m in bpy.data.materials:
        mats[m.name] = {"diffuse": [_r(c) for c in m.diffuse_color], "props": _props(m), "use_nodes": m.use_nodes,
                        "nodes": _h(node_tree(m.node_tree)), "users": m.users}
    imgs = {}
    for im in bpy.data.images:
        d = {"size": list(im.size), "source": im.source, "filepath": os.path.basename(im.filepath), "colorspace": im.colorspace_settings.name,
             "alpha_mode": im.alpha_mode, "float": im.is_float}
        f = bpy.path.abspath(im.filepath) if im.filepath else ""
        if f and os.path.exists(f):
            d["file_sha"] = hashlib.sha256(open(f, "rb").read()).hexdigest()[:16]
        imgs[im.name] = d
    w = sc.world
    cy = sc.cycles
    bk = sc.render.bake
    settings = {
        "engine": sc.render.engine, "samples": cy.samples, "device": cy.device, "adaptive": cy.use_adaptive_sampling,
        "max_bounces": cy.max_bounces, "diffuse_bounces": cy.diffuse_bounces, "film_transparent": sc.render.film_transparent,
        "view_transform": sc.view_settings.view_transform, "resolution": [sc.render.resolution_x, sc.render.resolution_y],
        "camera": sc.camera.name if sc.camera else None,
        "bake": {k: getattr(bk, k) for k in ("target", "margin", "use_clear", "use_pass_direct", "use_pass_indirect", "use_pass_color", "margin_type")},
        "world": None if w is None else {"name": w.name, "ao_distance": _r(w.light_settings.distance), "use_nodes": w.use_nodes, "nodes": node_tree(w.node_tree)},
        "collection_order": [o.name for o in sc.collection.all_objects],
        "selected": sorted(o.name for o in bpy.context.selected_objects),
        "active": bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None,
    }
    return {"objects": objs, "materials": mats, "images": imgs, "settings": settings}


def files_sha(root):
    out = {}
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in ("__pycache__", ".git", "node_modules")]
        for f in fn:
            p = os.path.join(dp, f)
            out[os.path.relpath(p, root)] = (os.path.getmtime(p), hashlib.sha256(open(p, "rb").read()).hexdigest())
    return out


class Stop(Exception):
    pass


def stabilise():
    """--stable: bmesh.ops.remove_doubles numbers what it keeps by memory address, so the same build can come out
    renumbered from one run to the next (the fire's pot does). For a fingerprint run only, sort what it leaves by
    position, so two runs of the same code compare exactly. Both runs of a comparison must use it."""
    import bmesh
    real = bmesh.ops.remove_doubles

    def remove_doubles(bm, **kw):
        res = real(bm, **kw)
        pos = lambda v: tuple(round(c, 6) for c in v.co)  # noqa: E731
        for seq, key in ((bm.verts, pos), (bm.edges, lambda e: sorted(map(pos, e.verts))), (bm.faces, lambda f: sorted(map(pos, f.verts)))):
            rank = {x: i for i, x in enumerate(sorted(seq, key=key))}
            seq.sort(key=lambda x: rank[x])
        return res
    bmesh.ops.remove_doubles = remove_doubles


def run(script, args, out, root, stop_at_bake, stable=False):
    import bpy
    if stable:
        stabilise()
    before = files_sha(root)
    record = {"exports": [], "script": os.path.relpath(script, root), "args": args}
    real_export, real_object = bpy.ops.export_scene, bpy.ops.object

    class Export:
        def __getattr__(self, k):
            return getattr(real_export, k)

        def gltf(self, **kw):
            fp = scene_fp()
            res = real_export.gltf(**kw)
            record["exports"].append({"path": os.path.relpath(kw["filepath"], root), "kw": {k: v for k, v in kw.items() if k != "filepath"}, "scene": fp})
            return res

    class Obj:
        def __getattr__(self, k):
            return getattr(real_object, k)

        def bake(self, **kw):
            if stop_at_bake:
                record["stopped_at_bake"] = kw
                raise Stop()
            return real_object.bake(**kw)

    bpy.ops.export_scene, bpy.ops.object = Export(), Obj()
    sys.argv = [script] + args
    try:
        runpy.run_path(script, run_name="__main__")
    except Stop:
        pass
    except SystemExit as e:
        record["exit"] = e.code
    finally:
        bpy.ops.export_scene, bpy.ops.object = real_export, real_object
    record["final"] = scene_fp()
    after = files_sha(root)
    record["files"] = {k: v[1] for k, v in after.items() if k not in before or before[k][1] != v[1]}
    json.dump(record, open(out, "w"), indent=1, sort_keys=True)
    print(f"fingerprint: {len(record['exports'])} exports, {len(record['final']['objects'])} objects at the end, "
          f"{len(record['files'])} files written -> {out}")


def _walk(a, b, path, out):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f"{path}/{k}: {'missing in A' if k not in a else 'missing in B'}")
            else:
                _walk(a[k], b[k], f"{path}/{k}", out)
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b) and any(isinstance(x, (dict, list)) for x in a):
        for i, (x, y) in enumerate(zip(a, b)):
            _walk(x, y, f"{path}[{i}]", out)
    elif a != b:
        out.append(f"{path}: {json.dumps(a)[:120]} != {json.dumps(b)[:120]}")


def compare(fa, fb, ignore=()):
    a, b = json.load(open(fa)), json.load(open(fb))
    diffs = []
    _walk(a, b, "", diffs)
    diffs = [d for d in diffs if not any(i in d for i in ignore)]
    for d in diffs[:200]:
        print(d)
    print(f"{len(diffs)} differences" if diffs else "identical")
    return not diffs


if __name__ == "__main__":
    argv = sys.argv[1:]
    rest = []
    if "--" in argv:
        i = argv.index("--")
        argv, rest = argv[:i], argv[i + 1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out")
    ap.add_argument("--root", default=".")
    ap.add_argument("--stop-at-bake", action="store_true")
    ap.add_argument("--stable", action="store_true", help="renumber what remove_doubles leaves (see stabilise)")
    ap.add_argument("--compare", nargs=2)
    ap.add_argument("--ignore", action="append", default=[], help="with --compare: skip differences whose path contains this")
    a = ap.parse_args(argv)
    if a.compare:
        sys.exit(0 if compare(*a.compare, ignore=a.ignore) else 1)
    root = os.path.abspath(a.root)
    run(os.path.join(root, rest[0]), rest[1:], a.out, root, a.stop_at_bake, a.stable)
