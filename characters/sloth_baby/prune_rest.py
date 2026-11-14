"""
prune_rest: drops the animation channels that only hold a bone at its rest
pose from a sloth GLB (review R2-104). Blender exports a translation, rotation
and scale channel for every bone in every clip; for the sloth all the scales
and most translations never leave the rest pose (only the body bone moves).
three.js blends a bone without a channel back to its rest values, so those
channels are dead weight: about a third of the clip data and of the tracks
every sloth's mixer evaluates each frame.

Only translation and scale channels go, and only when every key equals the
node's own rest translation or scale (to 1e-5). Rotation channels all stay,
since the pages add to head and arm rotations each frame and rely on the
mixer to set them again. The accessors and buffer views nothing uses any more
are removed and the binary chunk is packed again, so the file shrinks too.
Works on a plain Blender export and on a packed, quantized one (a channel
whose keys are not plain floats is kept).

    python characters/sloth_baby/prune_rest.py <file.glb | file.txt>...

A .txt is a base64 GLB (apps/canopy-prototype/models/sloth.txt). It prints
the channels before and after. build_sloth_baby.py runs it on each export.
No bpy needed.
"""
import base64
import json
import struct
import sys

REST = {"translation": [0.0, 0.0, 0.0], "scale": [1.0, 1.0, 1.0]}


def _floats(j, binc, acc):
    """An accessor's values as a flat list of floats, or None when they are not plain floats."""
    a = j["accessors"][acc]
    if a.get("componentType") != 5126 or a.get("sparse") or "bufferView" not in a:
        return None
    bv = j["bufferViews"][a["bufferView"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    off, stride = bv.get("byteOffset", 0) + a.get("byteOffset", 0), bv.get("byteStride", 4 * n)
    return [v for i in range(a["count"]) for v in struct.unpack_from(f"<{n}f", binc, off + i * stride)]


def _accessor_refs(j):
    """Every place an accessor index is stored: (container, key) pairs."""
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            for k in p["attributes"]:
                yield p["attributes"], k
            if "indices" in p:
                yield p, "indices"
            for t in p.get("targets", []):
                for k in t:
                    yield t, k
    for s in j.get("skins", []):
        if "inverseBindMatrices" in s:
            yield s, "inverseBindMatrices"
    for an in j.get("animations", []):
        for s in an["samplers"]:
            yield s, "input"
            yield s, "output"


def prune(glb):
    """The GLB bytes with the rest-pose channels dropped; returns (bytes, channels before, after)."""
    magic, ver, _ = struct.unpack_from("<III", glb, 0)
    assert magic == 0x46546C67 and ver == 2, "not a glTF 2 binary"
    jl, = struct.unpack_from("<I", glb, 12)
    j = json.loads(glb[20:20 + jl])
    bl, = struct.unpack_from("<I", glb, 20 + jl)
    binc = glb[28 + jl:28 + jl + bl]
    before = sum(len(a["channels"]) for a in j.get("animations", []))
    if "extensionsRequired" in j and "EXT_meshopt_compression" in j["extensionsRequired"]:
        raise SystemExit("meshopt-compressed buffers are not supported")
    for an in j.get("animations", []):
        keep = []
        for ch in an["channels"]:
            path, node = ch["target"]["path"], ch["target"].get("node")
            if path in REST and node is not None:
                rest = j["nodes"][node].get(path, REST[path])
                vals = _floats(j, binc, an["samplers"][ch["sampler"]]["output"])
                if vals is not None and all(abs(v - rest[i % 3]) < 1e-5 for i, v in enumerate(vals)):
                    continue
            keep.append(ch)
        used = sorted({ch["sampler"] for ch in keep})
        remap = {o: n for n, o in enumerate(used)}
        an["samplers"] = [an["samplers"][o] for o in used]
        for ch in keep:
            ch["sampler"] = remap[ch["sampler"]]
        an["channels"] = keep
    # the accessors still in use, then their buffer views (and the images'), packed into a new binary chunk
    refs = list(_accessor_refs(j))
    acc_used = sorted({c[k] for c, k in refs})
    acc_map = {o: n for n, o in enumerate(acc_used)}
    j["accessors"] = [j["accessors"][o] for o in acc_used]
    for c, k in refs:
        c[k] = acc_map[c[k]]
    bv_used = sorted({a["bufferView"] for a in j["accessors"] if "bufferView" in a} | {im["bufferView"] for im in j.get("images", []) if "bufferView" in im})
    bv_map, out = {}, bytearray()
    for o in bv_used:
        bv = j["bufferViews"][o]
        while len(out) % 4:
            out.append(0)
        start = bv.get("byteOffset", 0)
        data = binc[start:start + bv["byteLength"]]
        bv["byteOffset"] = len(out)
        out += data
        bv_map[o] = len(bv_map)
    j["bufferViews"] = [j["bufferViews"][o] for o in bv_used]
    for a in j["accessors"]:
        if "bufferView" in a:
            a["bufferView"] = bv_map[a["bufferView"]]
    for im in j.get("images", []):
        if "bufferView" in im:
            im["bufferView"] = bv_map[im["bufferView"]]
    while len(out) % 4:
        out.append(0)
    j["buffers"] = [{"byteLength": len(out)}]
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    after = sum(len(a["channels"]) for a in j.get("animations", []))
    return struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(out), 0x004E4942) + bytes(out), before, after


def prune_file(path):
    """Prunes a .glb, or a .txt holding a base64 GLB, in place, and prints what it did."""
    txt = path.endswith(".txt")
    raw = open(path, "rb").read()
    glb = base64.b64decode(raw.strip()) if txt else raw
    out, before, after = prune(glb)
    open(path, "wb").write(base64.b64encode(out) + (b"\n" if raw.endswith(b"\n") else b"") if txt else out)
    print(f"{path}: {before} -> {after} animation channels, {len(glb)} -> {len(out)} bytes")


if __name__ == "__main__":
    for f in sys.argv[1:]:
        prune_file(f)
