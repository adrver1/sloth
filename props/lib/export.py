"""
Scene reset, glTF export and the triangle report for the props/ generators. The project rule (CLAUDE.md) is a triangle
count per object for every model exported: export_glb() prints one line per object it writes, and runs the mesh audit
(lib/audit.py: hidden, back-only, flipped, degenerate and overlapping triangles), which stops the build on a new fault.
With small=True it also quantizes the vertex data of a GLB the page loads (lib/quantize.py).

    reset()                                       an empty scene
    tris(o), report(objs, note=None)              triangle counts
    export_glb(objs, path, texcoords=True, image_format=None, quiet=False, check=True, small=False, unlit=(), extras=False,
               txt=None)
    to_txt(path, txt)                             the page's base64 copy of a file (artifacts serve no .glb or .ktx2)
    stale(path, sources), builder_sources(script) whether a builder's output is missing or older than its code
    tag(o, anchor, **flags)                       the light bake's and the page's tags on a baked prop, as custom
                                                  properties (glTF extras, three.js userData) (review R2-249). anchor: a
                                                  key of the page's layout.js ANCHORS (where the page stands the prop, read
                                                  by the bake from layout_picked.json place.anchors), or "seats" (one copy
                                                  on every log seat; the bake numbers them Name_i with a "seat" tag).
                                                  flags: thin=1 (a double-sided card: casts no shadow, takes the brighter
                                                  of its two sides), no_shadow=1 (lit but casts nothing), unlit=1 (drawn
                                                  unlit on the page: not light-mapped, casts nothing), unbaked=1 (made, but
                                                  left out of the bake and the page's GLBs), double_sided=1 (drawn from both
                                                  sides on the page), cutout=1 (its painted alpha cuts it out on the page);
                                                  paint_image (build_camp.py paint_uvs) keeps its atlas through the bake

bpy is imported inside the functions that use it, so to_txt and stale also work from plain Python (props/bake_all.py).
"""
import base64
import glob
import os


def reset():
    """An empty scene (factory settings)."""
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)


def tris(o):
    """o's triangle count (each n-gon counts as n - 2)."""
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def report(objs, note=None):
    """Print "  <name>: <n> triangles" for each mesh object (note: {name: text} to add after the count)."""
    for o in objs:
        if o.type == "MESH":
            print(f"  {o.name}: {tris(o)} triangles" + (f" {note[o.name]}" if note and o.name in note else ""))


def to_txt(path, txt):
    """Write the file at path base64-encoded to txt, the copy the page loads (camp/core.js glb() decodes it); returns txt."""
    with open(path, "rb") as f, open(txt, "w") as g:
        g.write(base64.b64encode(f.read()).decode())
    return txt


def builder_sources(script):
    """The files a builder's output depends on: the script itself and the shared library (props/lib)."""
    return [script, *sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "*.py")))]


def stale(path, sources):
    """True when the file at path is missing or older (by modification time) than any of sources."""
    return not os.path.exists(path) or os.path.getmtime(path) < max(os.path.getmtime(f) for f in sources)


def tag(o, anchor=None, **flags):
    """Set the bake's tags on o (see the header) and return o."""
    if anchor is not None:
        o["anchor"] = anchor
    for k, v in flags.items():
        o[k] = v
    return o


def export_glb(objs, path, texcoords=True, image_format=None, quiet=False, check=True, small=False, unlit=(), extras=False, txt=None):
    """Write objs (selected alone) to the GLB at path, with the export flags the page relies on: the colour attribute
    "Col" as COLOR_0, materials, y up; texcoords=False leaves the UVs out; image_format (e.g. "JPEG") for embedded
    images. Prints each object's triangle count (unless quiet) and the file size. check runs lib/audit.py's audit on
    the objects first, labelled with the file's name (without "_preview"), and stops the build on a new fault before
    anything is written; check="warn" only prints (archived styles), check=False skips it (objects already audited).
    small=True, for a GLB the page loads, stores normals, colours and 0..1 UVs in fewer bytes (lib/quantize.py,
    KHR_mesh_quantization) and drops the normals of the objects named in unlit (review R2-109). extras=True writes the
    objects' custom properties as glTF extras, which three.js reads as userData (the WoodStack's "carried", R2-243;
    the jeep's doors and hood, the tent and the hammock, R2-250). txt: also write the page's base64 copy there
    (to_txt), after quantizing."""
    import bpy
    from lib.audit import audit
    from lib.quantize import quantize
    if check:
        audit(objs, "warn" if check == "warn" else None, os.path.splitext(os.path.basename(path))[0].removesuffix("_preview"))
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    kw = {} if image_format is None else {"export_image_format": image_format}
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=texcoords,
                              export_extras=extras, **kw)
    if not quiet:
        report(objs)
    size = f"{os.path.getsize(path) // 1024} KB"
    if small:
        before, after = quantize(path, unlit)
        size = f"{after // 1024} KB ({before // 1024} KB before quantizing)"
    print(f"  {os.path.basename(path)}: {size}, {sum(tris(o) for o in objs if o.type == 'MESH')} triangles")
    if txt:
        to_txt(path, txt)
        print(f"  -> {os.path.relpath(txt)}")
    return path
