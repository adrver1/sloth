"""
Mesh helpers shared by the props/ generators: primitives (cyl, rod, ball, box, torus, quad), shaping (bevel, rough_up,
drop_faces, capless), and object plumbing (apply_all, join). Z up, metres; every helper links what it
makes into the current scene's collection and returns it.
"""
import math

import bpy
import bmesh
from mathutils import Vector


def _finish(o, m, smooth=True):
    """Give o its material and (by default) smooth shading."""
    o.data.materials.append(m)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def cyl(r, h, at=(0, 0, 0), rot=(0, 0, 0), m=None, verts=16, r2=None, smooth=True, caps=True):
    """A cylinder (or cone when r2 is given) of height h centred on at; caps=False leaves both ends open."""
    fill = "NGON" if caps else "NOTHING"
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, end_fill_type=fill, location=at, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, end_fill_type=fill, location=at, rotation=rot)
    return _finish(bpy.context.object, m, smooth)


def rod(a, b, r, m, verts=8, caps=True):
    """A cylinder from point a to point b; caps=False leaves both ends open (no caps anyone would see)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = cyl(r, d.length, at=(a + b) / 2, m=m, verts=verts, caps=caps)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o


def ball(r, at=(0, 0, 0), scale=(1, 1, 1), m=None, seg=16, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=max(6, seg // 2), location=at, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    return _finish(o, m)


def box(size, at=(0, 0, 0), rot=(0, 0, 0), m=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=rot)
    o = bpy.context.object
    o.scale = size
    _finish(o, m, smooth=False)
    if bevel:
        apply_all(o)
        mod = o.modifiers.new("b", "BEVEL")
        mod.width, mod.segments = bevel, 2
    return o


def torus(R, r, at=(0, 0, 0), rot=(0, 0, 0), m=None, major=24, minor=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=major, minor_segments=minor, location=at, rotation=rot)
    return _finish(bpy.context.object, m)


def quad(corners, m):
    """One flat face through four corners, flat shaded (a page, a line of print, a ribbon, a wood chip)."""
    me = bpy.data.meshes.new("quad")
    me.from_pydata(corners, [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new("quad", me)
    bpy.context.collection.objects.link(o)
    return _finish(o, m, smooth=False)


def bevel(o, w, seg=2):
    apply_all(o)
    mod = o.modifiers.new("b", "BEVEL")
    mod.width, mod.segments, mod.limit_method = w, seg, "ANGLE"
    return o


def rough_up(o, amt, freq=4.0, axis_mask=(1, 1, 1)):
    """Bumpy bark or rock: push vertices along their normals by a cheap 3D noise."""
    apply_all(o)
    me = o.data
    for v in me.vertices:
        p = v.co
        n = math.sin(p.x * freq * 1.7 + p.y * freq * 0.9) * math.sin(p.z * freq * 2.3 + p.x * freq) + 0.5 * math.sin(p.y * freq * 4.1 - p.z * freq * 3.2)
        v.co += Vector((v.normal.x * axis_mask[0], v.normal.y * axis_mask[1], v.normal.z * axis_mask[2])) * amt * n
    return o


def drop_faces(o, test):
    """Delete the faces nobody sees (caps buried in the ground or inside another part); test(face) says which."""
    apply_all(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if test(type("F", (), {"normal": f.normal, "center": f.calc_center_median()}))], context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    return o


def capless(o, a, b, keep_end=True):
    """Drop a rod's caps that nobody sees: the one at a (in the ground or the stump), and the one at b unless keep_end."""
    apply_all(o)
    d = (Vector(b) - Vector(a)).normalized()
    bm = bmesh.new()
    bm.from_mesh(o.data)
    gone = [f for f in bm.faces if abs(f.normal.dot(d)) > 0.98 and (not keep_end or (f.calc_center_median() - Vector(a)).dot(d) < 0.01)]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    return o


def apply_all(o):
    """Apply o's modifiers, rotation and scale (o becomes the only selected, active object)."""
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    for mod in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def join(objs, name):
    """Join objs into one object called name, with every transform applied (it keeps objs[0]'s mesh)."""
    for o in objs:
        apply_all(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o
