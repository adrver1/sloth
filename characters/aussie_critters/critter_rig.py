"""
critter_rig: the small skeleton, skinning and clips shared by the karaoke's
Aussie crowd (platypus, wallaby, echidna, wombat), built by
build_critters.py. Like the sloth (characters/sloth_baby/sloth_rig.py) each
animal has its own few bones and named glTF clips, not the crew rig.

Bones (armature space: x right, +Y ahead, z up, metres), whichever the
animal has:

    body              root of the rig; its location moves the whole animal
    head              child of body, at the neck
    ear.L/R           children of head
    tail.1, tail.2    a two-bone tail, child of body
    arm.L/R, leg.L/R  one bone per short limb, children of body
    foot.L/R          the wallaby's long hind feet, children of leg.L/R
    quills            the echidna's spines, child of body (the bop scales it)

Each part of the mesh carries a region named after its bone, so the
weights are rigid per part; the tail blends along its two bones.

Clips (24 fps), all loops:

    idle    breathing, a slow look about, ear twitches, a lazy tail (4 s)
    bop     one beat of dancing at 60 bpm: a bounce, a nod, a tail flick;
            set the action's timeScale to bpm / 60 to dance on the beat (1 s)
    cheer   the "Oi!": crouch, jump, head up, paws up, land          (1 s)
    hop     the wallaby's two-footed hop on the spot                 (1 s)

A clip is a function of t (0..1 round the loop) returning, per bone, a
list of (axis, degrees) turns in armature axes about the bone's head,
plus "loc" (body offset, metres) and "scale" (per bone, uniform).
"""
import math

import bpy
from mathutils import Matrix, Vector

FPS = 24
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def armature(name, bones):
    """bones: {name: (head, tail, parent or None)} in armature space."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    for bn, (h, t, _) in bones.items():
        b = eb.new(bn)
        b.head, b.tail = Vector(h), Vector(t)
        b.roll = 0.0
    for bn, (_, _, parent) in bones.items():
        if parent:
            eb[bn].parent = eb[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def skin(mesh_ob, arm_ob, chains=()):
    """Every face's region names its bone ("head", "ear.R"...). A region
    named in `chains` (e.g. "tail" for tail.1 + tail.2) blends between the
    chain's bones along their length."""
    me = mesh_ob.data
    regions = list(me["regions"])
    reg = me.attributes["region"].data
    vreg = {}
    for poly in me.polygons:
        for v in poly.vertices:
            vreg.setdefault(v, regions[reg[poly.index].value])
    bones = arm_ob.data.bones
    groups = {b.name: mesh_ob.vertex_groups.new(name=b.name) for b in bones}
    for v in me.vertices:
        r = vreg.get(v.index, "body").split(":")[0]
        if r in chains:
            names = [b.name for b in bones if b.name.startswith(r + ".")]
            names.sort()
            a = bones[names[0]].head_local
            ends = [bones[n].tail_local for n in names]
            # how far along the chain, by the nearest segment, blended over the joints
            seg = [(a if i == 0 else ends[i - 1], ends[i]) for i in range(len(names))]
            d = [_dist(v.co, *s) for s in seg]
            i = d.index(min(d))
            s0, s1 = seg[i]
            t = max(0.0, min(1.0, (v.co - s0).dot(s1 - s0) / (s1 - s0).length_squared))
            if i > 0 and t < 0.25:
                w = 0.5 + 2 * t
                groups[names[i]].add([v.index], w, "REPLACE")
                groups[names[i - 1]].add([v.index], 1 - w, "REPLACE")
            elif i + 1 < len(names) and t > 0.75:
                w = 0.5 + 2 * (1 - t)
                groups[names[i]].add([v.index], w, "REPLACE")
                groups[names[i + 1]].add([v.index], 1 - w, "REPLACE")
            else:
                groups[names[i]].add([v.index], 1.0, "REPLACE")
        else:
            groups[r if r in groups else "body"].add([v.index], 1.0, "REPLACE")
    mod = mesh_ob.modifiers.new("rig", "ARMATURE")
    mod.object = arm_ob
    mesh_ob.parent = arm_ob


def _dist(p, a, b):
    d = b - a
    t = min(1.0, max(0.0, (p - a).dot(d) / d.length_squared))
    return (a + d * t - p).length


def _rot(spec):
    m = Matrix.Identity(3)
    for axis, deg in spec:
        m = Matrix.Rotation(math.radians(deg), 3, Vector(axis)) @ m
    return m


def apply(arm_ob, pose):
    for pb in arm_ob.pose.bones:
        pb.rotation_mode = "QUATERNION"
        bm = pb.bone.matrix_local.to_3x3()
        pb.rotation_quaternion = (bm.inverted() @ _rot(pose.get(pb.name, [])) @ bm).to_quaternion()
        pb.location = (0, 0, 0)
        s = pose.get("scale", {}).get(pb.name, 1.0)
        pb.scale = (s, s, s)
    body = arm_ob.pose.bones["body"]
    body.location = body.bone.matrix_local.to_3x3().inverted() @ Vector(pose.get("loc", (0, 0, 0)))


def add_clips(arm_ob, clips, frames=None):
    """clips: {name: (seconds, fn(t))}; each becomes its own action on a
    muted NLA track (one glTF animation each)."""
    bpy.context.scene.render.fps = FPS
    ad = arm_ob.animation_data_create()
    for name, (secs, fn) in clips.items():
        act = bpy.data.actions.new(name)
        ad.action = act
        n = frames or max(8, int(secs * 8))
        for k in range(n + 1):
            frame = round(k * secs * FPS / n)
            apply(arm_ob, fn((k % n) / n))
            for pb in arm_ob.pose.bones:
                pb.keyframe_insert("rotation_quaternion", frame=frame, group=pb.name)
                if pb.name == "body":
                    pb.keyframe_insert("location", frame=frame, group=pb.name)
                if pb.name == "quills":
                    pb.keyframe_insert("scale", frame=frame, group=pb.name)
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


# ------------------------------------------------------------------ clip helpers
def wave(t, k=1, ph=0.0):
    return math.sin(2 * math.pi * (k * t + ph))


def bounce(t):
    """0 on the beat (t = 0, landed), up to 1 half way."""
    return math.sin(math.pi * t) ** 2


def jump(t):
    """The cheer's height curve: a crouch (negative) then a jump and a land."""
    if t < 0.2:
        return -0.35 * math.sin(math.pi * t / 0.2)
    if t < 0.75:
        return math.sin(math.pi * (t - 0.2) / 0.55)
    return -0.2 * math.sin(math.pi * (t - 0.75) / 0.25)
