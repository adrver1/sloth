"""
The mesh audit every export runs (review R2-021): per object it finds the waste and the faults a triangle count cannot
show, such as the soup pot whose outside faced in (seen only from the back, so the page drew it hollow).

    audit(objs, mode=None, label="")   prints one line per mesh object and returns {name: stats}; called by
                             export.export_glb with label = the GLB's name (lived, fire, jeep_expedition ...). It stops
                             the build (SystemExit) when an object has more back-only triangles or same-facing coplanar
                             overlaps than KNOWN allows.
    KNOWN                    {"<label>/<object>": {"back_only": n, "overlaps": n}}, the counts the props had when the
                             audit was added (2026-11-14). A fix lowers its entry or removes it; a new fault fails the
                             build. Archived styles are audited with mode "warn", so they have no entries.

The line it prints for each object:

    audit Pot: 248 tris, enclosed 2%, player-hidden 11%, back-only 0, flips 0, degenerate 0, overlaps 4

    enclosed       triangles no viewpoint above the ground sees (any direction, three shells round the object)
    player-hidden  triangles no player eye sees (eyes 1.13 and 1.55 m up, on rings 0.6 to 8 m out from the object)
    back-only      on a one-sided object: triangles a player eye sees only from behind. The page culls back faces, so
                   these show as holes; usually a face wound the wrong way
    flips          triangles in a closed piece that is inside out (negative volume), whose winding disagrees with a
                   neighbour's, or whose stored normal points against the face
    degenerate     triangles under 0.01 mm^2
    overlaps       triangles lying on another triangle of the object that faces the same way, within 0.2 mm (they
                   z-fight on the page); back-to-back pairs are left alone

Each object is checked on its own, standing where it is in the scene, over a ground plane at z = 0 (Blender z up; at
its lowest point if it hangs below its origin, like the lantern): the other objects of the export do not hide it,
because most builders keep each prop at its own origin. Faces with a glass
material (name containing "glass") let the rays through. An object is one-sided unless its name is in DOUBLE_SIDED or
it has the custom property "double_sided" (the page draws those cards from both sides).
The rays are most of the time: on a 4-CPU cloud machine the lived, fire and laundry sets take about 1 s each, the
picked camp set 4 s, the jeep 25 s and an archived camp style (densified for its AO) about 100 s. The PROPS_AUDIT environment variable or the mode
argument changes what runs ("full" by default; the variable wins over the argument): "off" (no audit), "fast" (no
rays: flips, degenerate and overlaps only), "warn" (all checks, never stops the build). The light bake sets "warn",
because a Blender version other than the one that measured KNOWN may decimate the picked set a little differently.
"""
import math
import os
import random

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

DOUBLE_SIDED = ("LaundryCloth", "Chain")       # the page draws these cards from both sides (campProps.js)
EYES = (1.13, 1.55)                            # the player's eye heights the review used
RINGS = (0.6, 1.2, 2.5, 5.0, 8.0)              # metres out from the object's footprint
ANGLES = 24
KNOWN = {                                      # "<GLB name>/<object>": the faults it had on 2026-11-14 (see the docstring)
    "camp_picked/Tent": {"back_only": 20},                   # the open ends of the rolled door flap, its ties and the ridge lashings
    "jeep_expedition/Jeep": {"overlaps": 15},
    "jeep_expedition/DoorP": {"overlaps": 2},
    "jeep_expedition/DoorD": {"overlaps": 3},
    "jeep_expedition/Hood": {"overlaps": 2},
    "jeep_expedition_lod/JeepLOD": {"back_only": 8, "overlaps": 16},
}


def _tris(o):
    """o's triangles in world space: (n, 3, 3) corners, (n, 3) vertex indices, (n, 3) mean stored corner normals (None
    when this Blender has no corner_normals) and the n material names, lower case."""
    me = o.data
    me.calc_loop_triangles()
    lt = me.loop_triangles
    n = len(lt)
    M = o.matrix_world
    co = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    co = co @ np.array(M.to_3x3()).T + np.array(M.translation)
    vi = np.empty(n * 3, np.int64)
    lt.foreach_get("vertices", vi)
    vi = vi.reshape(-1, 3)
    li = np.empty(n * 3, np.int64)
    lt.foreach_get("loops", li)
    li = li.reshape(-1, 3)
    mi = np.empty(n, np.int64)
    lt.foreach_get("material_index", mi)
    names = [(m.name.lower() if m else "") for m in me.materials] or [""]
    mats = [names[min(i, len(names) - 1)] for i in mi]
    cn = None
    try:                                         # stored corner normals (Blender 4.1 and later)
        ln = np.empty(len(me.loops) * 3, np.float64)
        me.corner_normals.foreach_get("vector", ln)
        cn = ln.reshape(-1, 3)[li].mean(1) @ np.array(M.to_3x3().inverted().transposed()).T
    except (AttributeError, RuntimeError, TypeError):
        pass
    return co[vi], vi, cn, mats


def _flips(V, vi, cn, normal, area):
    """Triangles in an inside-out closed piece, with a winding that disagrees with a neighbour's, or a stored normal
    against the face (see the module docstring)."""
    bad = np.zeros(len(V), bool)
    if cn is not None:
        bad |= (np.einsum("ij,ij->i", cn, normal) < -0.2) & (area > 1e-9)
    # pieces: triangles joined through shared vertex indices
    parent = list(range(int(vi.max()) + 1 if len(vi) else 0))

    def root(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for a, b, c in vi:
        ra = root(a)
        parent[root(b)] = ra
        parent[root(c)] = ra
    comp = np.array([root(a) for a in vi[:, 0]])
    directed = {}
    for t, (a, b, c) in enumerate(vi):
        for e in ((a, b), (b, c), (c, a)):
            directed.setdefault(e, []).append(t)
    for e, ts in directed.items():               # the same directed edge twice: two neighbours wound opposite ways
        if len(ts) > 1 and e[0] != e[1]:
            bad[ts] = True
    for cid in np.unique(comp):
        ts = np.nonzero(comp == cid)[0]
        und = {}
        for t in ts:
            a, b, c = vi[t]
            for x, y in ((a, b), (b, c), (c, a)):
                k = (min(x, y), max(x, y))
                und[k] = und.get(k, 0) + 1
        if all(m == 2 for m in und.values()):    # closed: its signed volume says which way it faces
            vol = np.einsum("ij,ij->i", V[ts, 0], np.cross(V[ts, 1], V[ts, 2])).sum() / 6
            if vol < 0:
                bad[ts] = True
    return bad


def _overlaps(V, normal, area, centre):
    """Triangles within 0.2 mm of another, same-facing triangle of the object (z-fighting)."""
    tree = BVHTree.FromPolygons([tuple(p) for p in V.reshape(-1, 3)], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(V))],
                                all_triangles=True, epsilon=0.0)
    hit = np.zeros(len(V), bool)
    for t in np.nonzero(area > 1e-7)[0]:
        for _, _, j, _ in tree.find_nearest_range(Vector(centre[t]), 2e-4):
            if j is not None and j != t and np.dot(normal[t], normal[j]) > 0.995:
                hit[t] = True
                break
    return hit


def _rays(V, normal, area, centre, glass, double):
    """(seen from the front by a player eye, seen from behind only by a player eye, seen from anywhere above ground)."""
    n = len(V)
    lo, hi = V.reshape(-1, 3).min(0), V.reshape(-1, 3).max(0)
    gz = min(0.0, float(lo[2]))                  # a prop that hangs below its origin (the lantern) stands on its lowest point
    ground = np.array([[[-80, -80, gz], [80, -80, gz], [80, 80, gz]], [[-80, -80, gz], [80, 80, gz], [-80, 80, gz]]], float)
    allV = np.concatenate([V, ground])
    tree = BVHTree.FromPolygons([tuple(p) for p in allV.reshape(-1, 3)], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(allV))],
                                all_triangles=True, epsilon=0.0)
    glass = np.concatenate([glass, [False, False]])
    mid, half = (lo + hi) / 2, max(hi[0] - lo[0], hi[1] - lo[1]) / 2
    eyes = [np.array((mid[0] + (half + r) * math.cos(th), mid[1] + (half + r) * math.sin(th), h))
            for r in RINGS for k in range(ANGLES) for th in (2 * math.pi * k / ANGLES + 0.05 * r,) for h in (gz + e for e in EYES)]
    rr = random.Random(1)
    R0 = float(max(hi - lo)) / 2
    shell = []
    for r in (R0 + 0.3, R0 + 1.0, R0 + 3.0):
        for _ in range(96):
            z, th = rr.uniform(-1, 1), rr.uniform(0, 2 * math.pi)
            q = math.sqrt(1 - z * z)
            p = mid + r * np.array((q * math.cos(th), q * math.sin(th), z))
            if p[2] > gz + 0.02:
                shell.append(p)

    def sees(p, s, t):
        """Whether the ray from p reaches point s on triangle t (glass lets it through)."""
        d = s - p
        dist = float(np.linalg.norm(d))
        if dist < 1e-6:
            return False
        dv = Vector(d / dist)
        o, rem = Vector(p), dist + 1e-3
        for _ in range(6):
            loc, _, j, hd = tree.ray_cast(o, dv, rem)
            if j is None:
                return False
            if j == t or hd >= rem - 2e-3:
                return True
            if not glass[j]:
                return False
            o, rem = loc + dv * 1e-4, rem - hd - 1e-4
        return False

    front, back, anywhere = np.zeros(n, bool), np.zeros(n, bool), np.zeros(n, bool)
    for t in range(n):
        if area[t] < 1e-9:
            front[t] = anywhere[t] = True        # degenerate: counted there, not here
            continue
        samples = [centre[t]] + [0.6 * centre[t] + 0.4 * V[t, k] for k in range(3)]
        for p in eyes:
            facing = np.dot(normal[t], p - centre[t]) > 0
            if not facing and back[t] and not double[t]:
                continue                         # already seen from behind; only a front view still counts
            if any(sees(p, s, t) for s in samples):
                if facing or double[t]:
                    front[t] = True
                    break
                back[t] = True
        if front[t]:
            anywhere[t] = True
            continue
        for p in shell:
            if any(sees(p, s, t) for s in samples):
                anywhere[t] = True
                break
    return front, back & ~front, anywhere


def audit(objs, mode=None, label=""):
    """Audit the mesh objects in objs (see the module docstring), print a line each and return {name: stats}. label
    names the GLB for KNOWN."""
    mode = (os.environ.get("PROPS_AUDIT") or mode or "full").lower()
    if mode == "off":
        return {}
    out, fails = {}, []
    for o in objs:
        if o.type != "MESH" or not len(o.data.polygons):
            continue
        V, vi, cn, mats = _tris(o)
        cr = np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0])
        area = 0.5 * np.linalg.norm(cr, axis=1)
        normal = cr / np.maximum(2 * area, 1e-20)[:, None]
        centre = V.mean(1)
        st = {"tris": len(V), "flips": int(_flips(V, vi, cn, normal, area).sum()), "degenerate": int((area < 1e-8).sum()),
              "overlaps": int(_overlaps(V, normal, area, centre).sum())}
        line = f"  audit {o.name}: {st['tris']} tris"
        if mode != "fast":
            double = np.full(len(V), o.name.split(".")[0] in DOUBLE_SIDED or bool(o.get("double_sided")))
            glass = np.array(["glass" in m for m in mats])
            front, back_only, anywhere = _rays(V, normal, area, centre, glass, double)
            st["enclosed"] = round(100 * float((~anywhere).sum()) / len(V), 1)
            st["player_hidden"] = round(100 * float((~front).sum()) / len(V), 1)
            st["back_only"] = 0 if double[0] else int(back_only.sum())
            line += f", enclosed {st['enclosed']:.0f}%, player-hidden {st['player_hidden']:.0f}%, back-only {st['back_only']}"
        line += f", flips {st['flips']}, degenerate {st['degenerate']}, overlaps {st['overlaps']}"
        known = KNOWN.get(f"{label}/{o.name}", {})
        for k in ("back_only", "overlaps"):
            if st.get(k, 0) > known.get(k, 0):
                fails.append(f"{o.name}: {k.replace('_', '-')} {st[k]} (known {known.get(k, 0)})")
        if known:
            line += f"  (known: {', '.join(f'{k.replace(chr(95), chr(45))} {v}' for k, v in known.items())})"
        print(line, flush=True)
        out[o.name] = st
    if fails:
        msg = f"mesh audit of {label or 'the export'}: new faults (fix them, or raise their KNOWN entry in props/lib/audit.py if they are meant):\n  " + "\n  ".join(fails)
        if mode == "warn":
            print(msg, flush=True)
        else:
            raise SystemExit(msg)
    return out
