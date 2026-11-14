"""
Mesh helpers shared by the props/ generators: primitives (cyl, rod, ball, box, torus, quad), shaping (bevel, rough_up,
drop_faces, drop_enclosed, capless, outward, bisect), and object plumbing (apply_all, join, obj_from_bm, mesh_obj). Z up, metres; every
helper links what it makes into the current scene's collection and returns it.

    mesh_obj(name, verts, faces, mats=(), face_mats=None, validate=False)   an object from hand-written vertices and faces
    drop_enclosed(parts, margin=0.002)    before join(): delete the faces that lie inside another part's closed volume

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


def mesh_obj(name, verts, faces, mats=(), face_mats=None, validate=False):
    """A new object called name, linked into the scene, whose mesh (also called name) has the vertices verts and the faces
    faces (tuples of vertex indices), flat shaded. mats are its material slots, in order; face_mats[i] is the slot of face
    i (all faces take slot 0 when it is None). validate=True runs Mesh.validate() first, which drops broken faces (so leave
    it off when face_mats is given)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    if validate:
        me.validate()
    me.update()
    for m in mats:
        me.materials.append(m)
    if face_mats is not None:
        for p, k in zip(me.polygons, face_mats):
            p.material_index = k
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
    return mesh_obj("quad", corners, [(0, 1, 2, 3)], (m,))


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


def _inside(bvh, p, margin):
    """Whether point p lies inside the closed surface in bvh, at least margin from it: an odd number of crossings along
    each of three skewed rays (skewed so a ray does not run along an edge)."""
    hit = bvh.find_nearest(p)
    if hit[0] is None or hit[3] < margin:
        return False
    for d in _RAYS:
        n, q = 0, p
        for _ in range(64):
            loc = bvh.ray_cast(q, d)[0]
            if loc is None:
                break
            n += 1
            q = loc + d * 1e-5
        if n % 2 == 0:
            return False
    return True


_RAYS = [Vector(d).normalized() for d in ((0.31, 0.17, 0.93), (-0.83, 0.41, 0.23), (0.27, -0.91, -0.33))]


def drop_enclosed(parts, margin=0.002):
    """Delete every face of parts (objects about to be join()ed into one) that lies wholly inside another part's closed
    volume, so nobody can see it from any side, with any door open (review R2-148: overlapping shells left about a fifth
    of the jeep's triangles hidden). A face goes only when its corners, its centre, its edge middles and the points half
    way from the centre to each corner are all inside the same closed part, at least margin from its surface; a face
    flush with another part's surface stays. Only closed parts (every edge on exactly two faces) can hide faces. Applies
    each part's modifiers, rotation and scale (apply_all); returns the parts that still have faces, and removes the rest."""
    from mathutils.bvhtree import BVHTree
    world = []
    for o in parts:
        apply_all(o)
        world.append([o.matrix_world @ v.co for v in o.data.vertices])
    closed = []
    for o, vs in zip(parts, world):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        ok = len(bm.faces) > 0 and all(len(e.link_faces) == 2 for e in bm.edges)
        bm.free()
        if ok:
            lo = Vector([min(v[i] for v in vs) for i in range(3)])
            hi = Vector([max(v[i] for v in vs) for i in range(3)])
            closed.append((o, BVHTree.FromPolygons(vs, [tuple(p.vertices) for p in o.data.polygons]), lo, hi))
    kept = []
    for o, vs in zip(parts, world):
        gone = []
        for p in o.data.polygons:
            corners = [vs[i] for i in p.vertices]
            c = sum(corners, Vector()) / len(corners)
            pts = [c, *corners, *((a + b) / 2 for a, b in zip(corners, corners[1:] + corners[:1])), *((c + a) / 2 for a in corners)]
            lo = Vector([min(q[i] for q in corners) for i in range(3)])
            hi = Vector([max(q[i] for q in corners) for i in range(3)])
            for other, bvh, blo, bhi in closed:
                if other is o or any(lo[i] < blo[i] or hi[i] > bhi[i] for i in range(3)):
                    continue
                if all(_inside(bvh, q, margin) for q in pts):
                    gone.append(p.index)
                    break
        if gone:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.faces[i] for i in gone], context="FACES")
            bm.to_mesh(o.data)
            bm.free()
        if len(o.data.polygons):
            kept.append(o)
        else:
            bpy.data.objects.remove(o)
    return kept


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
