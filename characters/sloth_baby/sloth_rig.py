"""
sloth_rig: the baby sloth's own small skeleton and its clips, so it can sit,
crawl about and cling to a branch (or a character's arm). Used by
build_sloth_baby.py; the sloth is not on the crew rig.

Bones (character space: x right, +Y ahead, z up, metres):

    body                    the pear body, pivots 4 cm above the bottom;
                            its location moves the whole sloth
    head                    child of body, at the neck
    upper_arm.R/L, forearm.R/L, thigh.R/L, shin.R/L
                            two bones per limb, bending 55 % of the way
                            down the limb (R is +x, as on the crew)

Clips, baked into the .glb as named glTF animations:

    idle    sitting up as modelled, breathing, tilting its head about
                                                           (loop, 4 s)
    walk    the ground crawl: belly on the ground, the long arms reaching
            far ahead and out to haul it along, legs splayed and pushing,
            one paw at a time in the lateral sequence (hind, then fore on
            the same side); in place, so move the root ahead at WALK_SPEED
                                                           (loop, 3 s)
    cling   hanging back-down under a branch, all four paws gripping it,
            swaying a little and looking about             (loop, 4 s)
    hang_walk  walking hanging under the branch, hand over hand in the
            same lateral sequence, three paws holding at any time; move
            it along the branch (+Z) at HANG_SPEED         (loop, 4 s)

    titanic the ship's-bow pose, held up by the waist: arms flung out to
            the sides, chin up into the wind, legs dangling   (loop, 4 s)
    nap     asleep on its back (in a hammock), paws folded on its belly,
            knees drawn up, head rolled to one side, breathing slowly
                                                           (loop, 6 s)
    curl    curled up asleep sitting (a car seat): bent forward over its
            drawn-up knees, head tucked down on them, arms wrapped round,
            breathing slowly                               (loop, 6 s)
    reach   sitting up, slowly stretching the right arm out ahead and a
            little up (for the kettle over the camp fire), leaning after
            it, claws wiggling at the top, then drawing it back
                                                           (loop, 8 s)

How real sloths move (Bradypus studies, 2023-2025): arms far longer than
the legs, hook-like hands and feet with three claws each; on the ground
they cannot support their weight and crawl on the belly; in the trees they
hang and walk in a lateral-sequence diagonal-couplet gait with a duty
factor of about 0.83, the forelimbs pulling and the hindlimbs braking.

For cling the branch runs along the sloth's +Z (head end) at CLING_BRANCH:
x = 0, y = CLING_BRANCH[0] (above its belly), from z = CLING_BRANCH[1] to
[2]. To hang it under an arm, place the sloth so that line lies along the
arm's axis, with its +Y pointing up from the belly to the arm, and parent
it to the arm bone.
"""
import math

import bpy
from mathutils import Matrix, Vector

FPS = 24
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
BODY_PIVOT = Vector((0, 0, 0.04))
JOINT = 0.55                        # where along a limb the elbow or knee sits
WALK_PITCH = -80                    # body tipped forward onto its belly, degrees
WALK_STRIDE = 0.03                  # front paw travel either side of its middle, metres
WALK_SWING = 0.25                   # share of the stride a paw is off the ground
WALK_CYCLE = 72                     # frames
WALK_SPEED = 2 * WALK_STRIDE / ((1 - WALK_SWING) * WALK_CYCLE / FPS)   # m/s, about 0.027
HANG_STRIDE = 0.025
HANG_SWING = 0.17                   # duty factor 0.83, as measured in three-toed sloths
HANG_CYCLE = 96
HANG_SPEED = 2 * HANG_STRIDE / ((1 - HANG_SWING) * HANG_CYCLE / FPS)   # m/s, about 0.015
CLING_BRANCH = (0.10, 0.0, 0.20)    # branch height over the belly, its z span
DRIVE_WHEEL = ((0.0, 0.10, 0.11), 0.062)   # wheel centre ahead of the chest and its rim radius, sloth frame
NAP_TILT = 80                       # on its back, head end a little raised, degrees
LIMB_BONES = {"arm": ("upper_arm", "forearm"), "leg": ("thigh", "shin")}


# ------------------------------------------------------------------ rig
def armature(name, limbs, neck):
    """Armature object with the sloth's bones; limbs from build_sloth_baby.LIMBS."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    body = eb.new("body")
    body.head, body.tail = BODY_PIVOT, Vector((0, 0, neck - 0.02))
    head = eb.new("head")
    head.head, head.tail = Vector((0, 0, neck - 0.02)), Vector((0, 0, neck + 0.10))
    head.parent = body
    for key, (a, b) in limbs.items():
        kind, tag = key.split(".")
        up_name, lo_name = LIMB_BONES[kind]
        j = a + (b - a) * JOINT
        up, lo = eb.new(f"{up_name}.{tag}"), eb.new(f"{lo_name}.{tag}")
        up.head, up.tail, lo.head, lo.tail = a, j, j, b
        up.parent, lo.parent = body, up
        lo.use_connect = True
        for bone in (up, lo):
            bone.roll = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def skin(mesh_ob, arm_ob, limbs, neck):
    """Weights by part: the head pieces to the head, a limb's (and its paw
    pad's or claws') vertices split between its two bones along the limb,
    the body to the body, blending into the head at the neck."""
    me = mesh_ob.data
    regions = list(me["regions"])
    reg = me.attributes["region"].data
    vreg = {}
    for poly in me.polygons:
        for v in poly.vertices:
            vreg.setdefault(v, regions[reg[poly.index].value])
    groups = {b.name: mesh_ob.vertex_groups.new(name=b.name) for b in arm_ob.data.bones}
    for v in me.vertices:
        p, r = v.co, vreg.get(v.index, "body")
        if r in ("arm", "leg") or r.split(":")[0] in ("claw", "paw"):
            if ":" in r:   # a claw or paw pad named after its limb
                key = r.split(":")[1]
            else:
                cands = [k for k in limbs if k.startswith(r) and (k.endswith("R") == (p.x > 0))]
                key = min(cands, key=lambda k: _dist_to_segment(p, *limbs[k]))
            a, b = limbs[key]
            kind, tag = key.split(".")
            d = b - a
            t = (p - a).dot(d) / d.length_squared
            lo = min(1.0, max(0.0, (t - JOINT + 0.12) / 0.24))
            up_name, lo_name = LIMB_BONES[kind]
            if lo < 1:
                groups[f"{up_name}.{tag}"].add([v.index], 1 - lo, "REPLACE")
            if lo > 0:
                groups[f"{lo_name}.{tag}"].add([v.index], lo, "REPLACE")
        elif r == "body":
            h = min(1.0, max(0.0, (p.z - (neck - 0.03)) / 0.03))
            if h < 1:
                groups["body"].add([v.index], 1 - h, "REPLACE")
            if h > 0:
                groups["head"].add([v.index], h, "REPLACE")
        else:   # head, face, patch, eye, glint, nose, mouth, tufts
            groups["body" if r == "tuft" else "head"].add([v.index], 1.0, "REPLACE")
    mod = mesh_ob.modifiers.new("rig", "ARMATURE")
    mod.object = arm_ob
    mesh_ob.parent = arm_ob


def _dist_to_segment(p, a, b):
    d = b - a
    t = min(1.0, max(0.0, (p - a).dot(d) / d.length_squared))
    return (a + d * t - p).length


# ------------------------------------------------------------------ posing
def _rot(spec):
    """[(axis, degrees)] applied in order, as a 3x3 matrix."""
    m = Matrix.Identity(3)
    for axis, deg in spec:
        m = Matrix.Rotation(math.radians(deg), 3, Vector(axis)) @ m
    return m


def _two_bone(s, t, la, lb, pole):
    """Elbow position for a two-bone chain from s reaching t, bending toward pole."""
    v = t - s
    d = min(v.length, la + lb - 1e-4)
    u = v.normalized()
    along = (la * la - lb * lb + d * d) / (2 * d)
    h = math.sqrt(max(0.0, la * la - along * along))
    pole = (pole - u * pole.dot(u)).normalized()
    return s + u * along + pole * h


def apply(arm_ob, pose):
    """pose: body (location offset, [(axis, deg)]), head [(axis, deg)] in
    the body's frame, and per limb key ("arm.R"...) either a paw target
    (Vector, pole) in armature space or a [(axis, deg)] turn of the whole
    limb about its root in the body's frame."""
    pbs = arm_ob.pose.bones
    for pb in pbs:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    vl = bpy.context.view_layer
    off, spec = pose.get("body", ((0, 0, 0), []))
    rb = _rot(spec)
    rest = arm_ob.data.bones["body"].matrix_local
    m = Matrix.Translation(BODY_PIVOT + Vector(off)) @ rb.to_4x4() @ Matrix.Translation(-BODY_PIVOT) @ rest
    pbs["body"].matrix = m
    vl.update()
    if "head" in pose:
        hm = arm_ob.data.bones["head"].matrix_local.to_3x3()
        pbs["head"].rotation_quaternion = (hm.inverted() @ _rot(pose["head"]) @ hm).to_quaternion()
    for key, (up_name, lo_name) in ((k, LIMB_BONES[k.split(".")[0]]) for k in
                                     ("arm.R", "arm.L", "leg.R", "leg.L")):
        tag = key[-1]
        up, lo = pbs[f"{up_name}.{tag}"], pbs[f"{lo_name}.{tag}"]
        spec = pose.get(key)
        if spec is None:
            continue
        if isinstance(spec, list):   # a turn of the limb about its root
            bm = up.bone.matrix_local.to_3x3()
            up.rotation_quaternion = (bm.inverted() @ _rot(spec) @ bm).to_quaternion()
            vl.update()
            continue
        target, pole = spec
        vl.update()
        s = up.head.copy()
        la, lb = up.bone.length, lo.bone.length
        e = _two_bone(s, Vector(target), la, lb, Vector(pole))
        _aim(up, e - s)
        vl.update()
        _aim(lo, Vector(target) - e)
        vl.update()


def _aim(pb, d):
    """Turn a pose bone (from its current matrix) so its tail points along d."""
    m = pb.matrix.copy()
    cur = m.to_3x3().col[1].normalized()
    q = cur.rotation_difference(d.normalized())
    rot = q.to_matrix() @ m.to_3x3()
    pb.matrix = Matrix.Translation(m.translation) @ rot.to_4x4()


def _point(off, spec, p):
    """Where a rest-pose point p goes when the body is posed (off, spec)."""
    return BODY_PIVOT + Vector(off) + _rot(spec) @ (Vector(p) - BODY_PIVOT)


# ------------------------------------------------------------------ clips
def idle(t):
    """t 0..1 round the loop: breathing and a slow head tilt."""
    w = 2 * math.pi * t
    return {"body": ((0, 0, 0.002 * math.sin(2 * w)), [(X, 2 * math.sin(2 * w))]),
            "head": [(Y, 9 * math.sin(w)), (Z, 7 * math.sin(w + 1.0)), (X, -3 + 3 * math.sin(2 * w))]}


# Footfall order of the lateral-sequence gait sloths use (a hind paw, then
# the front paw on the same side): when in the stride each paw lifts
LATERAL = {"leg.L": 0.0, "arm.L": 0.25, "leg.R": 0.5, "arm.R": 0.75}


def _paw(t, lift_at, swing):
    """Where a paw is in its step at t (0..1 round the stride): along runs
    1 (reached ahead) to -1 (pushed back) over the stance, back to 1 over
    the swing; lift is 0..1 off the ground in the swing."""
    p = (t - lift_at) % 1.0
    if p < swing:
        q = p / swing
        return -1 + 2 * (0.5 - 0.5 * math.cos(math.pi * q)), math.sin(math.pi * q)
    q = (p - swing) / (1 - swing)
    return 1 - 2 * q, 0.0


def walk(t, limbs):
    """The ground crawl, after real sloths: they can't stand on their legs,
    so the belly stays on the ground, the long arms reach far ahead and out
    to the sides, hook their claws in and haul the body along, and the legs
    splay out and push. One paw moves at a time, hind then fore on a side
    (LATERAL); the body sways toward the arm that is pulling."""
    pull = math.sin(2 * math.pi * (t - LATERAL["arm.R"] - 0.4))   # +: the right arm is hauling
    off = (0.006 * pull, 0.0, 0.026 + 0.003 * abs(pull))
    spec = [(X, WALK_PITCH), (Y, 4 * pull), (Z, -6 * pull)]
    pose = {"body": (off, spec), "head": [(X, 66), (Z, 8 * pull), (Y, -5 * pull)]}
    for key, (a, b) in limbs.items():
        kind, tag = key.split(".")
        side = 1 if tag == "R" else -1
        along, lift = _paw(t, LATERAL[key], WALK_SWING)
        root = _point(off, spec, a)
        if kind == "arm":   # far ahead and out, elbows up and out
            reach = (b - a).length
            target = Vector((side * 0.55 * reach + root.x, root.y + 0.45 * reach + WALK_STRIDE * along,
                             0.004 + 0.035 * lift))
            pole = Vector((side * 1.0, -0.2, 0.9))
        else:               # splayed to the side, knees out
            target = Vector((root.x + side * 0.06, root.y - 0.01 + 0.6 * WALK_STRIDE * along, 0.004 + 0.02 * lift))
            pole = Vector((side * 1.0, 0.3, 0.6))
        pose[key] = (target, pole)
    return pose


def hang_walk(t, limbs):
    """Walking hanging back-down under the branch (as cling), the way sloths
    get about in the trees: one paw at a time in the lateral sequence, the
    other three holding on (duty factor about 0.83), the arms pulling and
    the legs braking. In place: the paws slide back along the branch, so
    move the sloth along it toward its head at HANG_SPEED."""
    w = 2 * math.pi * t
    by = CLING_BRANCH[0]
    off = (0.006 * math.sin(w), 0.0, 0.0)
    spec = [(Z, 5 * math.sin(w)), (Y, 6 * math.sin(w))]
    pose = {"body": (off, spec), "head": [(X, 15), (Z, 20 * math.sin(w + 0.6))]}
    grips = {"arm": 0.17, "leg": 0.03}
    for key in limbs:
        kind, tag = key.split(".")
        side = 1 if tag == "R" else -1
        along, lift = _paw(t, LATERAL[key], HANG_SWING)
        target = Vector((side * 0.03, by - 0.005 - 0.03 * lift, grips[kind] + HANG_STRIDE * along))
        pose[key] = (target, Vector((side * 1.0, -0.3, 0.0)))
    return pose


def cling(t, limbs):
    """t 0..1: hanging under the branch, a slow sway along it and side to
    side, looking about; the paws stay on the branch."""
    w = 2 * math.pi * t
    by, z0, z1 = CLING_BRANCH
    off = (0.008 * math.sin(w), 0.0, 0.006 * math.sin(2 * w))
    spec = [(Z, 6 * math.sin(w)), (Y, 8 * math.sin(w))]
    pose = {"body": (off, spec), "head": [(X, 20 + 6 * math.sin(2 * w)), (Z, 35 * math.sin(w + 0.6))]}
    grips = {"arm": 0.165, "leg": 0.03}
    for key in limbs:
        kind, tag = key.split(".")
        side = 1 if tag == "R" else -1
        target = Vector((side * 0.03, by - 0.005, grips[kind]))
        pose[key] = (target, Vector((side * 1.0, -0.3, 0.0)))
    return pose


def titanic(t, limbs):
    """The ship's-bow pose while someone holds it up by the waist (Adriaen):
    arms flung out to the sides, a little back, chin up into the wind, legs
    dangling; the arms ride the wind up and down a little."""
    w = 2 * math.pi * t
    pose = {"body": ((0, 0, 0), [(X, 4 + 2 * math.sin(w))]),
            "head": [(X, 24 + 4 * math.sin(w)), (Z, 6 * math.sin(w + 1.0))]}
    for key, (a, b) in limbs.items():
        kind, tag = key.split(".")
        side = 1 if tag == "R" else -1
        root = _point(*pose["body"], a)
        if kind == "arm":
            n = (b - a).length
            lift = 0.012 * math.sin(w + side * 0.8)
            target = root + Vector((side * 0.97 * n, -0.18 * n, 0.08 * n + lift))
            pose[key] = (target, Vector((0, -0.6, -1.0)))
        else:
            n = (b - a).length
            swing = 0.08 * n * math.sin(w + side)
            pose[key] = (root + Vector((side * 0.2 * n, 0.25 * n + swing, -0.94 * n)), Vector((0, 1.0, 0)))
    return pose


def nap(t, limbs):
    """t 0..1 round the loop: asleep on its back, as in a hammock (the
    Canopy Camp nap). The body lies with its belly up, rolled a little to
    one side; three slow breaths a loop lift the belly and the folded paws."""
    w = 2 * math.pi * t
    breath = math.sin(3 * w)
    off = (0.0, 0.0, 0.028 + 0.002 * breath)
    spec = [(X, NAP_TILT + 1.5 * breath), (Y, 8)]
    rb = _rot(spec)
    pose = {"body": (off, spec), "head": [(Z, 55 + 3 * math.sin(w)), (Y, -12), (X, -10 + 2 * breath)]}
    for key in limbs:
        kind, tag = key.split(".")
        side = 1 if tag == "R" else -1
        if kind == "arm":   # paws folded on the belly, one over the other, elbows out
            p = Vector((-side * 0.012, 0.072, 0.085 + 0.012 * side))
            pole = rb @ Vector((side * 1.0, 0.2, -0.3))
        else:               # knees drawn up and out, soles together
            p = Vector((side * 0.035, 0.075, 0.0))
            pole = rb @ Vector((side * 0.7, 1.0, 0.2))
        pose[key] = (_point(off, spec, p), pole)
    return pose


def curl(t, limbs):
    """t 0..1 round the loop: curled up asleep where it sits (the jeep's
    passenger seat in Canopy Camp): leaning forward over drawn-up knees,
    head tucked down, arms hugging the legs; three slow breaths a loop."""
    w = 2 * math.pi * t
    breath = math.sin(3 * w)
    off = (0.0, -0.01, 0.002 * breath)
    spec = [(X, -28 - 2 * breath)]
    rb = _rot(spec)
    pose = {"body": (off, spec), "head": [(X, -38 + 2 * breath), (Z, 18)]}
    for key in limbs:
        kind, tag = key.split(".")
        side = 1 if tag == "R" else -1
        if kind == "arm":   # wrapped round the knees, paws meeting in front of the shins
            p = Vector((-side * 0.01, 0.105, 0.045))
            pole = rb @ Vector((side * 1.0, -0.2, -0.4))
        else:               # knees drawn up to the chest, feet tucked under
            p = Vector((side * 0.03, 0.07, 0.0))
            pole = Vector((side * 0.4, 1.0, 1.0))
            pose[key] = (Vector((side * 0.035, 0.075, 0.004)), pole)
            continue
        pose[key] = (_point(off, spec, p), pole)
    return pose


def drive(t, limbs):
    """t 0..1 round the loop: playing at driving (the jeep's driver seat in
    Canopy Camp). Sitting up, both paws on a wheel ahead of the chest at
    DRIVE_WHEEL, turning it hard one way and the other, leaning into the
    turns and looking where it steers, bouncing a little as on a bumpy
    track. The wheel's rim is the circle the paws follow."""
    w = 2 * math.pi * t
    steer = math.sin(w) + 0.25 * math.sin(3 * w)          # two big turns a loop, with a wiggle
    bump = abs(math.sin(6 * w))
    off = (0.0, 0.004, 0.003 * bump)
    spec = [(X, -6 + 2 * bump), (Y, -7 * steer)]
    pose = {"body": (off, spec), "head": [(X, 6 + 4 * bump), (Z, -22 * steer), (Y, 6 * steer)]}
    c, r = Vector(DRIVE_WHEEL[0]), DRIVE_WHEEL[1]
    for key in limbs:
        kind, tag = key.split(".")
        if kind != "arm":
            continue
        side = 1 if tag == "R" else -1
        a = math.radians(90 - side * 55 - 50 * steer)    # paws at ten to two, turned with the wheel
        p = c + Vector((math.cos(a) * r, -0.45 * math.sin(a) * r, 0.9 * math.sin(a) * r))   # rim tipped back 25 deg, top toward the driver
        pose[key] = (p, Vector((side * 1.0, -0.4, -0.6)))
    return pose


def peek(t, limbs):
    """t 0..1 round the loop: lying on its belly (the tent doorway in Canopy
    Camp), chin on its paws folded in front, peeking out: the head lifts a
    little and looks slowly one way, holds, the other way, holds, with a
    curious tilt, then sinks back onto its paws. Slow breaths."""
    w = 2 * math.pi * t
    breath = math.sin(4 * w)
    look = math.sin(w)
    look = math.copysign(abs(look) ** 0.5, look)                # lingers at each side
    up = 0.5 - 0.5 * math.cos(2 * w)                          # head up while looking, down between
    off = (0.0, 0.0, 0.026 + 0.0015 * breath)
    spec = [(X, WALK_PITCH + 1.5 * breath)]
    pose = {"body": (off, spec), "head": [(X, 74 + 10 * up), (Z, 38 * look * up), (Y, 10 * look * up)]}
    for key, (a, b) in limbs.items():
        kind, tag = key.split(".")
        side = 1 if tag == "R" else -1
        root = _point(off, spec, a)
        if kind == "arm":   # stretched ahead either side of the chin, paws flat, claws showing
            reach = (b - a).length
            target = Vector((side * 0.03, root.y + 0.8 * reach, 0.006))
            pole = Vector((side * 1.0, -0.3, 0.6))
        else:               # stretched out behind, splayed a little
            target = Vector((root.x + side * 0.05, root.y - 0.04, 0.004))
            pole = Vector((side * 1.0, 0.3, 0.6))
        pose[key] = (target, pole)
    return pose


def reach(t, limbs):
    """t 0..1 round the loop: sitting up as idle and very slowly reaching
    the right paw out ahead and up (for the kettle in Canopy Camp), leaning
    after it, the claws wiggling at full stretch, then drawing it back."""
    w = 2 * math.pi * t
    e = 0.5 - 0.5 * math.cos(w)            # 0 at rest, 1 at full stretch (t = 0.5)
    e = e * e * (3 - 2 * e)
    wiggle = math.sin(9 * w) * e ** 4
    off = (0.0, 0.004 * e, 0.002 * math.sin(2 * w))
    spec = [(X, -9 * e), (Y, -4 * e)]
    rb = _rot(spec)
    pose = {"body": (off, spec), "head": [(X, 16 * e + 2 * math.sin(2 * w)), (Z, 6 * math.sin(w + 1.0) * (1 - e))]}
    a, b = limbs["arm.R"]
    n = (b - a).length
    root = _point(off, spec, a)
    rest = _point(off, spec, b)
    out = root + Vector((0.12, 0.92, 0.38)).normalized() * 0.97 * n + Vector((0.0, 0.0, 0.006 * wiggle))
    pose["arm.R"] = (rest.lerp(out, e), rb @ Vector((1.0, -0.2, -1.0)))
    return pose


def clips(limbs):
    return {"idle": [(k * 12, idle(k / 8)) for k in range(9)],
            "walk": [(k * WALK_CYCLE // 24, walk(k / 24, limbs)) for k in range(25)],
            "cling": [(k * 12, cling(k / 8, limbs)) for k in range(9)],
            "hang_walk": [(k * HANG_CYCLE // 24, hang_walk(k / 24, limbs)) for k in range(25)],
            "titanic": [(k * 12, titanic(k / 8, limbs)) for k in range(9)],
            "nap": [(k * 9, nap(k / 16, limbs)) for k in range(17)],
            "reach": [(k * 8, reach(k / 24, limbs)) for k in range(25)],
            "curl": [(k * 9, curl(k / 16, limbs)) for k in range(17)],
            "drive": [(k * 6, drive(k / 24, limbs)) for k in range(25)],
            "peek": [(k * 12, peek(k / 24, limbs)) for k in range(25)]}


def add_clips(arm_ob, limbs):
    """Key every clip as its own action on a muted NLA track (one glTF
    animation each); leaves the rest pose."""
    bpy.context.scene.render.fps = FPS
    ad = arm_ob.animation_data_create()
    for name, keys in clips(limbs).items():
        act = bpy.data.actions.new(name)
        ad.action = act
        for frame, pose in keys:
            apply(arm_ob, pose)
            for pb in arm_ob.pose.bones:
                pb.keyframe_insert("rotation_quaternion", frame=frame, group=pb.name)
            arm_ob.pose.bones["body"].keyframe_insert("location", frame=frame, group="body")
        slot = ad.action_slot if hasattr(ad, "action_slot") else None
        ad.action = None
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, act)
        if slot is not None and hasattr(strip, "action_slot"):
            strip.action_slot = slot
        track.mute = True
    apply(arm_ob, {})
    bpy.context.view_layer.update()
