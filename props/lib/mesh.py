"""
Mesh helpers shared by the props/ generators: primitives (cyl, rod, ball, box, torus, quad), tubes (sweep, tube),
shaping (bevel, rough_up, drop_faces), and object plumbing (apply_all, join, obj_from_bm, select_only). Z up, metres;
every helper that makes an object links it into the current scene's collection and returns it.

    sweep(bm, pts, radii, sides=8, cap_a=False, cap_b=True, twist=0.0, frame=None)
        a tube of `sides` flat sides into bmesh bm along the points, one ring per point, faces wound outward, caps only
        where asked; returns {"rings", "sides", "cap_a", "cap_b", "angles"} so the caller can set UVs and materials
    tube(a, b, r, m=None, sides=8, cap_a=False, cap_b=True, r_b=None, rings=None, twist=0.0, frame=None, smooth=True,
         name="tube")
        one straight tube from a to b as its own object (sweep on a fresh bmesh): the posts, roots and poles whose
        buried or hidden end has no cap (review R2-251, which replaced five hand-written tube builders and capless)
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


def cyl(r, h, at=(0, 0, 0), rot=(0, 0, 0), m=None, verts=16, r2=None, smooth=True, caps=True):
    """A cylinder (or cone when r2 is given) of height h centred on at; caps=False leaves both ends open."""
    fill = "NGON" if caps else "NOTHING"
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, end_fill_type=fill, location=at, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, end_fill_type=fill, location=at, rotation=rot)
    return with_material(bpy.context.object, m, smooth)


def rod(a, b, r, m, verts=8, caps=True):
    """A cylinder from point a to point b; caps=False leaves both ends open (no caps anyone would see)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = cyl(r, d.length, at=(a + b) / 2, m=m, verts=verts, caps=caps)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o


def _frame(d):
    """Two unit vectors x, y across direction d with x, y, d right-handed: x = d x Z, or d x X when d is near Z."""
    x = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.99 else Vector((1, 0, 0))).normalized()
    return x, d.cross(x)


def sweep(bm, pts, radii, sides=8, cap_a=False, cap_b=True, twist=0.0, frame=None):
    """A tube with `sides` flat sides into bm along pts (at least two points), ring i of radius radii[i] round pts[i].
    Ring vertex k sits at angle angles[k] = 2 pi (k + twist) / sides from the frame's x toward its y. frame=(x, y) sets the
    first ring's frame (x, y and the direction right-handed); by default _frame. Along a bent path each ring's frame is
    the last one turned onto the new direction (parallel transport), so the tube does not twist. Side faces are wound
    outward, with loops in the order (ring i k, ring i k+1, ring i+1 k+1, ring i+1 k); cap_b faces along the path, cap_a
    against it, and neither is made unless asked. Returns {"rings": [[BMVert]], "sides": [[BMFace] per segment],
    "cap_a": BMFace or None, "cap_b": BMFace or None, "angles": [float]}."""
    pts = [Vector(p) for p in pts]
    angles = [2 * math.pi * (k + twist) / sides for k in range(sides)]
    dirs = [(pts[i + 1] - pts[i]).normalized() for i in range(len(pts) - 1)]
    tans = [dirs[0]] + [(dirs[i - 1] + dirs[i]).normalized() for i in range(1, len(dirs))] + [dirs[-1]]
    x, y = (Vector(frame[0]), Vector(frame[1])) if frame else _frame(tans[0])
    rings, prev = [], tans[0]
    for c, r, t in zip(pts, radii, tans):
        q = prev.rotation_difference(t)
        x, y, prev = q @ x, q @ y, t
        rings.append([bm.verts.new(c + (x * math.cos(a) + y * math.sin(a)) * r) for a in angles])
    faces = [[bm.faces.new((A[k], A[(k + 1) % sides], B[(k + 1) % sides], B[k])) for k in range(sides)] for A, B in zip(rings, rings[1:])]
    return {"rings": rings, "sides": faces, "angles": angles,
            "cap_a": bm.faces.new(rings[0][::-1]) if cap_a else None, "cap_b": bm.faces.new(rings[-1]) if cap_b else None}


def tube(a, b, r, m=None, sides=8, cap_a=False, cap_b=True, r_b=None, rings=None, twist=0.0, frame=None, smooth=True, name="tube"):
    """A straight tube from a to b as its own object (see sweep): radius r at a and r_b (default r) at b, or rings, a list
    of (t, radius) with t from 0 at a to 1 at b. By default the end at a (in the ground or inside another part) is open
    and the end at b capped. m: the material (smooth shaded unless smooth=False)."""
    a, b = Vector(a), Vector(b)
    rings = rings or ((0.0, r), (1.0, r if r_b is None else r_b))
    bm = bmesh.new()
    sweep(bm, [a.lerp(b, t) for t, _ in rings], [rr for _, rr in rings], sides, cap_a, cap_b, twist, frame)
    o = obj_from_bm(bm, name)
    return with_material(o, m, smooth) if m else o


def ball(r, at=(0, 0, 0), scale=(1, 1, 1), m=None, seg=16, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=max(6, seg // 2), location=at, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    return with_material(o, m)


def box(size, at=(0, 0, 0), rot=(0, 0, 0), m=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=rot)
    o = bpy.context.object
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
    """Delete the faces nobody sees (caps buried in the ground or inside another part); test(normal, centre) says which,
    from each face's normal and median centre (Vectors, in o's applied frame)."""
    apply_all(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if test(f.normal, f.calc_center_median())], context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    return o


def select_only(o):
    """Make o the only selected object and the active one (without the select_all operator, which walks every object)."""
    for s in list(bpy.context.view_layer.objects.selected):
        s.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def _plain(o):
    """True when o's transform can be written into its mesh directly: no modifiers, no parent, no delta transforms, no
    shape keys or custom normals, a mesh no other object uses, and no mirroring (a negative scale flips the faces)."""
    me = o.data
    return (not o.modifiers and o.parent is None and me.users == 1 and me.shape_keys is None and not me.has_custom_normals
            and tuple(o.delta_scale) == (1, 1, 1) and not any(o.delta_rotation_euler) and tuple(o.delta_rotation_quaternion) == (1, 0, 0, 0)
            and o.matrix_basis.to_3x3().determinant() > 0)


def _apply(o, location):
    """Write o's rotation and scale (and its location when location is True) into its mesh. A plain object (_plain) is
    done through the mesh API, and returns at once when there is nothing to apply; any other goes through the operators."""
    select_only(o)
    if o.type == "MESH" and _plain(o):
        m = o.matrix_basis.copy() if location else o.matrix_basis.to_3x3().to_4x4()
        if m != Matrix.Identity(4):
            o.data.transform(m)
            o.matrix_basis = Matrix.Identity(4) if location else Matrix.Translation(o.location)
            bpy.context.view_layer.update()            # so matrix_world is current, as after the operator
        return
    for mod in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.transform_apply(location=location, rotation=True, scale=True)


def apply_all(o):
    """Apply o's modifiers, rotation and scale (o becomes the only selected, active object). Cheap when there is nothing
    to apply, so calling it on an object that join() already applied costs nothing (review R2-237)."""
    _apply(o, False)


def join(objs, name):
    """Join objs into one object called name, with every transform applied (it keeps objs[0]'s mesh)."""
    for o in objs:
        apply_all(o)
    select_only(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    _apply(o, True)
    return o
