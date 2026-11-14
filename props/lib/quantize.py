"""
Smaller vertex data for the GLBs the page loads (review R2-109), as a rewrite of a finished GLB file:

    quantize(path, unlit=())    rewrites the GLB at path in place; returns (bytes before, bytes after)

With KHR_mesh_quantization (three's GLTFLoader reads it with no extra code, and so does Blender's glTF importer):
    NORMAL      float32 -> int8 normalized (4 bytes a vertex with the padding, instead of 12)
    COLOR_0     uint16 or float32 -> uint8 normalized (the colours were Blender byte colours to begin with)
    TEXCOORD_n  float32 -> uint16 normalized, when every coordinate lies in 0..1 (the atlases and the light map UVs)
POSITION stays float32: quantizing it needs a dequantizing scale and offset on the node, and the page places the props
by setting their nodes' positions. An object named in unlit (drawn with an unlit material, such as the fire's Embers) loses
its NORMAL, and its vertices that then differ in nothing are welded. Primitives with morph targets or skins, and files
with sparse accessors, are left as they are. The binary chunk is packed again, each view 4-byte aligned.
"""
import json
import struct

import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
ARRAY, ELEMENTS = 34962, 34963


def _read(path):
    with open(path, "rb") as f:
        data = f.read()
    assert data[:4] == b"glTF", path
    jlen = struct.unpack_from("<I", data, 12)[0]
    gl = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    bin_ = data[off + 8:off + 8 + struct.unpack_from("<I", data, off)[0]] if off < len(data) else b""
    return gl, bin_, len(data)


def _write(path, gl, bin_):
    j = json.dumps(gl, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    bin_ += b"\0" * (-len(bin_) % 4)
    out = struct.pack("<4sII", b"glTF", 2, 28 + len(j) + len(bin_)) + struct.pack("<II", len(j), 0x4E4F534A) + j
    out += struct.pack("<II", len(bin_), 0x004E4942) + bin_
    with open(path, "wb") as f:
        f.write(out)
    return len(out)


def _get(gl, bin_, a):
    """Accessor a's values as a (count, components) array of its stored type."""
    bv = gl["bufferViews"][a["bufferView"]]
    dt, n = np.dtype(CT[a["componentType"]]), NC[a["type"]]
    el = dt.itemsize * n
    stride = bv.get("byteStride", el)
    start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    raw = np.frombuffer(bin_, np.uint8, count=stride * (a["count"] - 1) + el, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, (a["count"], el), (stride, 1))
    return np.ascontiguousarray(rows).view(dt).reshape(a["count"], n)


def _floats(arr, a):
    """The values as float32 (normalized integers mapped back to 0..1 or -1..1)."""
    if not a.get("normalized"):
        return arr.astype(np.float32)
    return np.maximum(arr.astype(np.float32) / np.iinfo(arr.dtype).max, -1.0)


def _new(arr, ctype, typ, normalized=False, minmax=False):
    """A new accessor holding arr (its data kept under "_data" until the file is packed)."""
    a = {"componentType": ctype, "count": int(arr.shape[0]), "type": typ, "_data": np.ascontiguousarray(arr)}
    if normalized:
        a["normalized"] = True
    if minmax:
        a["min"] = [float(x) for x in arr.min(0)]; a["max"] = [float(x) for x in arr.max(0)]
    return a


def _small(a, arr, kind):
    """The smaller accessor for an attribute of this kind ("n", "c" or "t"), or None to keep it."""
    if a["componentType"] in (5120, 5121) or (kind == "t" and a["componentType"] != 5126):
        return None                                   # already as small as it gets
    f = _floats(arr, a)
    if kind == "n":
        return _new(np.clip(np.round(f * 127), -127, 127).astype(np.int8), 5120, "VEC3", True)
    if kind == "c":
        return _new(np.clip(np.round(f * 255), 0, 255).astype(np.uint8), 5121, a["type"], True)
    if f.min() < 0 or f.max() > 1:
        return None                                   # tiling UVs stay float
    return _new(np.round(f * 65535).astype(np.uint16), 5123, "VEC2", True)


def quantize(path, unlit=()):
    gl, bin_, before = _read(path)
    acc = gl.get("accessors", [])
    if not acc or any(a.get("sparse") for a in acc):
        return before, before
    acc = [dict(a) for a in acc]
    for a in acc:                                     # every accessor starts out holding its own data
        if "bufferView" in a:
            a["_data"] = _get(gl, bin_, a)
            a.pop("byteOffset", None)
    gl_views = gl["bufferViews"]
    shared = {}                                       # (old accessor, kind) -> new accessor, for accessors primitives share
    unlit_meshes = {n["mesh"] for n in gl.get("nodes", []) if "mesh" in n and n.get("name") in unlit}   # by object name
    for mi, mesh in enumerate(gl.get("meshes", [])):
        for prim in mesh["primitives"]:
            at = prim["attributes"]
            if prim.get("targets") or "JOINTS_0" in at:
                continue
            if mi in unlit_meshes and "NORMAL" in at:
                del at["NORMAL"]
                count = acc[at["POSITION"]]["count"]
                key = np.concatenate([acc[i]["_data"].view(np.uint8).reshape(count, -1) for i in at.values()], axis=1)
                _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
                order = np.argsort(first)             # the welded vertices keep their first-seen order
                rank = np.empty_like(order); rank[order] = np.arange(len(order))
                idx = rank[inverse.reshape(-1)]
                if "indices" in prim:
                    idx = idx[acc[prim["indices"]]["_data"].reshape(-1).astype(np.int64)]
                ityp = 5123 if len(order) < 65536 else 5125
                acc.append(_new(idx.astype(CT[ityp]).reshape(-1, 1), ityp, "SCALAR")); prim["indices"] = len(acc) - 1
                for k, i in list(at.items()):
                    a = acc[i]
                    acc.append(_new(a["_data"][first[order]], a["componentType"], a["type"], a.get("normalized", False), k == "POSITION"))
                    at[k] = len(acc) - 1
            for k, i in list(at.items()):
                kind = "n" if k == "NORMAL" else "c" if k.startswith("COLOR_") else "t" if k.startswith("TEXCOORD_") else None
                if kind is None:
                    continue
                if (i, kind) not in shared:
                    q = _small(acc[i], acc[i]["_data"], kind)
                    if q is not None:
                        acc.append(q)
                    shared[(i, kind)] = len(acc) - 1 if q is not None else i
                at[k] = shared[(i, kind)]
    # keep only the accessors something points at, and pack every view again
    used = set()
    for mesh in gl.get("meshes", []):
        for prim in mesh["primitives"]:
            used.update(prim["attributes"].values())
            used.update([prim["indices"]] if "indices" in prim else [])
            for t in prim.get("targets", []):
                used.update(t.values())
    for sk in gl.get("skins", []):
        used.update([sk["inverseBindMatrices"]] if "inverseBindMatrices" in sk else [])
    for an in gl.get("animations", []):
        for s in an["samplers"]:
            used.update((s["input"], s["output"]))
    order = sorted(used)
    renum = {old: new for new, old in enumerate(order)}
    attr_of = set()                                   # accessors used as vertex attributes (ARRAY_BUFFER, 4-byte aligned)
    for mesh in gl.get("meshes", []):
        for prim in mesh["primitives"]:
            attr_of.update(prim["attributes"].values())
            for t in prim.get("targets", []):
                attr_of.update(t.values())
            for k in prim["attributes"]:
                prim["attributes"][k] = renum[prim["attributes"][k]]
            if "indices" in prim:
                prim["indices"] = renum[prim["indices"]]
            for t in prim.get("targets", []):
                for k in t:
                    t[k] = renum[t[k]]
    for sk in gl.get("skins", []):
        if "inverseBindMatrices" in sk:
            sk["inverseBindMatrices"] = renum[sk["inverseBindMatrices"]]
    for an in gl.get("animations", []):
        for s in an["samplers"]:
            s["input"], s["output"] = renum[s["input"]], renum[s["output"]]
    chunks, views, off = [], [], 0

    def put(data, view):
        nonlocal off
        pad = -off % 4
        chunks.append(b"\0" * pad); off += pad
        view["byteOffset"] = off; view["byteLength"] = len(data)
        chunks.append(data); off += len(data)
        views.append(view)
        return len(views) - 1

    out_acc = []
    for old in order:
        a = acc[old]
        if "_data" not in a:                          # an accessor with no data (all zeros) stays so
            out_acc.append(a); continue
        data = a.pop("_data")
        el = data.dtype.itemsize * data.shape[1]
        if old in attr_of and el % 4:                 # pad each vertex to 4 bytes (an int8 normal: 3 + 1)
            stride = el + (-el % 4)
            padded = np.zeros((data.shape[0], stride), np.uint8)
            padded[:, :el] = data.view(np.uint8).reshape(data.shape[0], el)
            a["bufferView"] = put(padded.tobytes(), {"buffer": 0, "byteStride": stride, "target": ARRAY})
        else:
            view = {"buffer": 0}
            if old in attr_of:
                view["target"] = ARRAY
            elif any(p.get("indices") == renum[old] for m in gl.get("meshes", []) for p in m["primitives"]):
                view["target"] = ELEMENTS
            a["bufferView"] = put(data.tobytes(), view)
        out_acc.append(a)
    for img in gl.get("images", []):                  # embedded images keep their bytes
        if "bufferView" in img:
            bv = gl_views[img["bufferView"]]
            o = bv.get("byteOffset", 0)
            img["bufferView"] = put(bin_[o:o + bv["byteLength"]], {"buffer": 0})
    gl["accessors"], gl["bufferViews"] = out_acc, views
    new_bin = b"".join(chunks)
    gl["buffers"] = [{"byteLength": len(new_bin) + (-len(new_bin) % 4)}]
    for k in ("extensionsUsed", "extensionsRequired"):
        if "KHR_mesh_quantization" not in gl.setdefault(k, []):
            gl[k].append("KHR_mesh_quantization")
    return before, _write(path, gl, new_bin)
