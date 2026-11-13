"""
Scene reset, glTF export and the triangle report for the props/ generators. The project rule (CLAUDE.md) is a triangle
count per object for every model exported: export_glb() prints one line per object it writes.
"""
import os

import bpy


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


def export_glb(objs, path, texcoords=True, image_format=None, quiet=False):
    """Write objs (selected alone) to the GLB at path, with the export flags the page relies on: the colour attribute
    "Col" as COLOR_0, materials, y up; texcoords=False leaves the UVs out; image_format (e.g. "JPEG") for embedded
    images. Prints each object's triangle count (unless quiet) and the file size."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    kw = {} if image_format is None else {"export_image_format": image_format}
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="NAME", export_vertex_color_name="Col",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True, export_texcoords=texcoords, **kw)
    if not quiet:
        report(objs)
    print(f"  {os.path.basename(path)}: {os.path.getsize(path) // 1024} KB, {sum(tris(o) for o in objs if o.type == 'MESH')} triangles")
    return path
