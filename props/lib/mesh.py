"""
Mesh helpers shared by the props/ generators: primitives (cyl, rod, ball, box, torus, arc, quad), tubes (sweep, tube),
shaping (bevel, rough_up, drop_faces, drop_ground_faces, drop_enclosed, outward, bisect), object plumbing (apply_all, join,
obj_from_bm, mesh_obj, select_only, triangulate), anchor (a named empty the page reads a point from) and mug (the enamel mug on the
seat and the snack table). Z up, metres; every helper that makes an object links it into the current scene's collection and returns it.

    sweep(bm, pts, radii, sides=8, cap_a=False, cap_b=True, twist=0.0, frame=None)
        a tube of `sides` flat sides into bmesh bm along the points, one ring per point, faces wound outward, caps only
        where asked; returns {"rings", "sides", "cap_a", "cap_b", "angles"} so the caller can set UVs and materials
    tube(a, b, r, m=None, sides=8, cap_a=False, cap_b=True, r_b=None, rings=None, twist=0.0, frame=None, smooth=True,
         name="tube")
        one straight tube from a to b as its own object (sweep on a fresh bmesh): the posts, roots and poles whose
        buried or hidden end has no cap (review R2-251, which replaced five hand-written tube builders and capless)

    mesh_obj(name, verts, faces, mats=(), face_mats=None, validate=False)   an object from hand-written vertices and faces
    arc(R, r, a0, a1, segs, at, rot, m, minor=3, smooth=True)   an open piece of a torus (a handle, a tow loop)
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
        o.data.polygons.foreach_set("use_smooth", [True] * len(o.data.polygons))
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


def arc(R, r, a0, a1, segs, at=(0, 0, 0), rot=(0, 0, 0), m=None, minor=3, smooth=True):
    """Part of a torus, in torus()'s frame (the ring in its local XY plane round at, turned by rot): the tube of radius r
    from angle a0 to a1 (radians, counter-clockwise from local X) in segs segments, minor sides round, with open ends.
    For a handle or a loop whose ends go into another part, so no triangle is spent on the hidden part of the ring
    (review R2-191)."""
    def make(bm):
        rings = []
        for k in range(segs + 1):
            a = a0 + (a1 - a0) * k / segs
            u = Vector((math.cos(a), math.sin(a), 0))
            rings.append([bm.verts.new(u * (R + r * math.cos(t * 2 * math.pi / minor)) + Vector((0, 0, r * math.sin(t * 2 * math.pi / minor))))
                          for t in range(minor)])
        for A, B in zip(rings, rings[1:]):
            for t in range(minor):
                f = bm.faces.new((A[t], B[t], B[(t + 1) % minor], A[(t + 1) % minor]))
                c = f.calc_center_median()
                if f.normal.dot(c - Vector((c.x, c.y, 0)).normalized() * R) < 0:   # face away from the tube's centre line
                    f.normal_flip()
    return with_material(primitive("Torus", make, at, rot), m, smooth)


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
    """Delete the faces nobody sees (caps buried in the ground or inside another part); test(normal, centre) says which,
    from each face's normal and median centre (Vectors, in o's applied frame)."""
    apply_all(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if test(f.normal, f.calc_center_median())], context="FACES")
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


def drop_ground_faces(objs, h=0.05):
    """Delete the faces of each mesh in objs that point down (normal z under -0.7) with their centre less than h above
    the ground (world z = 0): bottoms standing on the ground, which nobody sees and which still took light-map space
    (review R2-154). Tested in world space, so an object keeps its transform. Returns objs."""
    for o in objs:
        if o.type != "MESH":
            continue
        mw, nw = o.matrix_world, o.matrix_world.to_3x3().inverted().transposed()
        bm = bmesh.new()
        bm.from_mesh(o.data)
        down = [f for f in bm.faces if (nw @ f.normal).normalized().z < -0.7 and (mw @ f.calc_center_median()).z < h]
        if down:
            bmesh.ops.delete(bm, geom=down, context="FACES")
            bm.to_mesh(o.data)
        bm.free()
    return objs


def mug(M, at, n=8):
    """The enamel mug (Adriaen 2026-11-12) standing at `at`: an n-sided body with no bottom, the blue rim painted as a
    band at the top, coffee as one flat n-gon, and a 4 x 3 handle toward +X that is only the part of the loop outside the
    body, its ends inside the mug wall (arc, review R2-191); M holds the "enamel", "rim" and "coffee" materials. 78
    triangles with n = 8 (build_lived.py's seat mug), 64 with n = 6 (build_camp.py's table mug, review R2-194)."""
    x0, y0, z0 = at
    r, h = 0.042, 0.085
    bm = bmesh.new()
    ring = lambda rr, zz: [bm.verts.new((x0 + rr * math.cos(2 * math.pi * (i + 0.5) / n), y0 + rr * math.sin(2 * math.pi * (i + 0.5) / n), z0 + zz)) for i in range(n)]  # noqa: E731
    lo, band, hi = ring(r, 0), ring(r, h - 0.008), ring(r, h)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], band[j], band[i])).material_index = 0
        bm.faces.new((band[i], band[j], hi[j], hi[i])).material_index = 1
    cof = ring(r * 0.86, h - 0.004)
    bm.faces.new(cof).material_index = 2                                 # the coffee, just under the rim
    for i in range(n):                                                   # the rim: a ring from the outside down to the coffee
        j = (i + 1) % n
        bm.faces.new((hi[i], hi[j], cof[j], cof[i])).material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        if f.calc_center_median().z > z0 + h - 0.006 and f.normal.z < 0:
            f.normal_flip()
    o = obj_from_bm(bm, "mug")
    me = o.data
    for k in ("enamel", "rim", "coffee"):
        me.materials.append(M[k])
    hd = arc(0.026, 0.006, math.radians(-125), math.radians(125), 4, at=(x0 + 0.048, y0, z0 + 0.045), rot=(math.pi / 2, 0, 0), m=M["enamel"], smooth=False)
    return join([o, hd], "mug")


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


def anchor(name, at, size=1.0):
    """An empty called name at `at`, scaled by size, linked into the scene: a point the page reads from the GLB by name
    instead of a number typed again in camp/layout.js (review R2-252), as the jeep's SeatP."""
    e = bpy.data.objects.new(name, None)
    e.location = at
    e.scale = (size, size, size)
    bpy.context.collection.objects.link(e)
    return e


def select_only(o):
    """Make o the only selected object and the active one (without the select_all operator, which walks every object).
    The selection can still hold a None for an object just removed while selected (drop_enclosed removes the parts it
    empties), which is skipped."""
    for s in list(bpy.context.view_layer.objects.selected):
        if s is not None:
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


def triangulate(o):
    """Splits o's faces into triangles in place (quads and ngons the beauty way), keeping each face's material, smooth
    flag and corner data (UVs, colours). The glTF exporter would split them its own way (Blender's loop triangles), so
    a mesh that is triangulated here first is exported with exactly these triangles."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()


def join(objs, name):
    """Join objs into one object called name, with their modifiers and every transform applied (it keeps objs[0]'s
    mesh). One convert applies all the parts' modifiers, the join brings each part's transform into objs[0]'s, and one
    _apply finishes it (review R2-227: it used to apply every part on its own first; R2-237: the mesh API when it can)."""
    select_only(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    if any(o.modifiers for o in objs):
        bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    _apply(o, True)
    return o
