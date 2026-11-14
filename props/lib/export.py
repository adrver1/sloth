"""
Scene reset, glTF export and the triangle report for the props/ generators. The project rule (CLAUDE.md) is a triangle
count per object for every model exported: export_glb() prints one line per object it writes, and runs the mesh audit
(lib/audit.py: hidden, back-only, flipped, degenerate and overlapping triangles), which stops the build on a new fault.
With small=True it also quantizes the vertex data of a GLB the page loads (lib/quantize.py).
"""
import os

import bpy

from lib.audit import audit
from lib.quantize import quantize


def reset():
    """An empty scene (factory settings)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def tris(o):
    """o's triangle count (each n-gon counts as n - 2)."""
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def report(objs, note=None):
    """Print "  <name>: <n> triangles" for each mesh object (note: {name: text} to add after the count)."""
    for o in objs:
        if o.type == "MESH":
            print(f"  {o.name}: {tris(o)} triangles" + (f" {note[o.name]}" if note and o.name in note else ""))


def export_glb(objs, path, texcoords=True, image_format=None, quiet=False, check=True, small=False, unlit=(), extras=False):
    """Write objs (selected alone) to the GLB at path, with the export flags the page relies on: the colour attribute
    "Col" as COLOR_0, materials, y up; texcoords=False leaves the UVs out; image_format (e.g. "JPEG") for embedded
    images. Prints each object's triangle count (unless quiet) and the file size. check runs lib/audit.py's audit on
    the objects first, labelled with the file's name (without "_preview"), and stops the build on a new fault before
    anything is written; check="warn" only prints (archived styles), check=False skips it (objects already audited).
    small=True, for a GLB the page loads, stores normals, colours and 0..1 UVs in fewer bytes (lib/quantize.py,
    KHR_mesh_quantization) and drops the normals of the objects named in unlit (review R2-109). extras=True writes the
    objects' custom properties as glTF extras, which three.js reads as userData (the WoodStack's "carried", R2-243)."""
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
    return path
