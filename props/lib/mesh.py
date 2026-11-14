"""
Mesh helpers shared by the props/ generators: primitives (cyl, rod, ball, box, torus, quad), shaping (bevel, rough_up,
drop_faces, capless, outward, bisect), and object plumbing (apply_all, join, obj_from_bm). Z up, metres; every helper
links what it makes into the current scene's collection and returns it.

cyl, ball and box build their mesh with bmesh (one bmesh op each, review R2-227) and match the bpy.ops primitives they
replace: the same vertices, a "UVMap" with the same UVs, the object named Cylinder, Cone, Sphere or Cube at its
location and rotation, made the active object (it is not selected). torus still calls bpy.ops (its mesh is made in
Python by Blender's operator). outward and bisect work in bmesh too, so nothing here switches to edit mode.
"""
import math

import bpy
import bmesh
from mathutils import Matrix, Vector


def with_material(o, m, smooth=True):
    """Give o its material and (by default) smooth shading."""
    o.data.materials.append(m)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def obj_from_bm(bm, name):
    """A new object named name holding bm's mesh (bm is freed), linked into the scene."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def primitive(name, make, at=(0, 0, 0), rot=(0, 0, 0)):
    """A new object called name at at, turned by rot (Euler XYZ), holding the mesh make(bm) builds about the origin in a
    bmesh with a "UVMap" layer (pass calc_uvs=True to the bmesh op). It becomes the active object."""
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    make(bm)
    o = obj_from_bm(bm, name)
    o.location, o.rotation_euler = at, rot
    bpy.context.view_layer.objects.active = o
    return o


def cyl(r, h, at=(0, 0, 0), rot=(0, 0, 0), m=None, verts=16, r2=None, smooth=True, caps=True):
    """A cylinder (or cone when r2 is given) of height h centred on at; caps=False leaves both ends open."""
    make = lambda bm: bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=verts, radius1=r, radius2=r if r2 is None else r2,
                                            depth=h, matrix=Matrix(), calc_uvs=True)
    return with_material(primitive("Cylinder" if r2 is None else "Cone", make, at, rot), m, smooth)


def rod(a, b, r, m, verts=8, caps=True):
    """A cylinder from point a to point b; caps=False leaves both ends open (no caps anyone would see)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = cyl(r, d.length, at=(a + b) / 2, m=m, verts=verts, caps=caps)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o


def ball(r, at=(0, 0, 0), scale=(1, 1, 1), m=None, seg=16, rot=(0, 0, 0)):
    make = lambda bm: bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r, matrix=Matrix(), calc_uvs=True)
    o = primitive("Sphere", make, at, rot)
    o.scale = scale
    return with_material(o, m)


def box(size, at=(0, 0, 0), rot=(0, 0, 0), m=None, bevel=0.0):
    o = primitive("Cube", lambda bm: bmesh.ops.create_cube(bm, size=1, matrix=Matrix(), calc_uvs=True), at, rot)
    o.scale = size
    with_material(o, m, smooth=False)
    if bevel:
        apply_all(o)
        mod = o.modifiers.new("b", "BEVEL")
        mod.width, mod.segments = bevel, 2
    return o


def torus(R, r, at=(0, 0, 0), rot=(0, 0, 0), m=None, major=24, minor=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=major, minor_segments=minor, location=at, rotation=rot)
    return with_material(bpy.context.object, m)


def quad(corners, m):
    """One flat face through four corners, flat shaded (a page, a line of print, a ribbon, a wood chip)."""
    me = bpy.data.meshes.new("quad")
    me.from_pydata(corners, [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new("quad", me)
    bpy.context.collection.objects.link(o)
    return with_material(o, m, smooth=False)


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


def outward(o):
    """Point o's normals outward, whichever way its faces were wound (a closed mesh; the AO bake needs them outward)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(o.data)
    bm.free()
    return o


def bisect(o, co, no, clear_inner=False, clear_outer=False, fill=False):
    """Cut o along the plane through co with normal no (both in world space, as the edit-mode bisect takes them):
    clear_inner drops what lies behind the plane, clear_outer what lies in front, and fill closes the cut with one face
    that takes its material and shading from the faces next to it."""
    inv = o.matrix_world.inverted()
    co_l, no_l = inv @ Vector(co), (o.matrix_world.to_3x3().transposed() @ Vector(no)).normalized()
    bm = bmesh.new()
    bm.from_mesh(o.data)
    cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=0.0001, plane_co=co_l, plane_no=no_l,
                                 clear_inner=clear_inner, clear_outer=clear_outer)["geom_cut"]
    if fill:
        nf = -no_l if clear_outer and not clear_inner else no_l
        faces = [f for f in bmesh.ops.triangle_fill(bm, use_dissolve=True, edges=[e for e in cut if isinstance(e, bmesh.types.BMEdge)], normal=nf)["geom"]
                 if isinstance(f, bmesh.types.BMFace)]
        bmesh.ops.face_attribute_fill(bm, faces=faces, use_normals=True, use_data=True)
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
    """Join objs into one object called name, with their modifiers and every transform applied (it keeps objs[0]'s
    mesh). One convert applies all the parts' modifiers, the join brings each part's transform into objs[0]'s, and one
    transform_apply finishes it (review R2-227: it used to apply every part on its own first)."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if any(o.modifiers for o in objs):
        bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o
