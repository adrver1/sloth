"""
sloth_baby: a baby three-toed sloth for a character to hug, cuddle and play
with. On the shared palette and material with its own small skeleton and
clips (sloth_rig.py: idle, walk, cling), not on the crew rig. For a hug a
player parents it to the holder's chest bone while the `hug` clip plays (see
anims.HUG_HOLD); for play it clings to the holder's forearms (anims.PLAY_CLING).

Three looks, all kept (STYLE picks the live one, sloth_baby.glb; the others
are sloth_baby_<style>.glb):

    plush_real  (live) the plush with a real baby sloth's limbs: arms much
             longer than the legs, three short hooked claws on every paw
    plush    a round cuddly toy: big head, short stubby limbs
    baby     a real baby sloth: smaller head, long arms with three
             cream claws, shaggy tufts on the back

Every look has a cute three-toed sloth's face: a pale mask with a fur
fringe, dark teardrop patches round big shiny eyes, a dark nose bump and a
little smile.

    python characters/sloth_baby/build_sloth_baby.py [--style plush|baby|all]

Modelled sitting upright, origin under its bottom, facing +Y like the
cast, about 0.3 m tall.
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "engine", "characters", "_shared"))  # the kit lives in desk-at-night (submodule engine/)
import base_body as base  # noqa: E402  (imports bpy)
import bpy  # noqa: E402
import sloth_rig  # noqa: E402

Vector, X, Y, Z = base.Vector, base.X, base.Y, base.Z
FUR, DARK, FACE, MASK, CLAW, TAN = "sloth_fur", "sloth_fur_dark", "sloth_face", "sloth_mask", "claw", "sloth_tan"
STYLE = "plush_real"   # Adriaen 2026-11-04: the real limbs are the live look

STYLES = {
    # head rings scale, head height, arm length, leg length (of the arm),
    # limb thickness, tufts, claws (False: paw pads, True: three long claws,
    # "soft": three short hooked plush claws), arm direction in the sitting pose
    "plush": dict(head=1.25, neck=0.17, arm=0.10, leg=0.75, limb=0.026, tufts=False, claws=False,
                  arm_dir=(0.035, 0.7, -0.35)),
    # the plush with a real baby sloth's limbs (Adriaen 2026-11-04): arms
    # much longer than the legs, three hooked claws on every paw
    "plush_real": dict(head=1.25, neck=0.17, arm=0.15, leg=0.58, limb=0.022, tufts=False, claws="soft",
                       arm_dir=(0.5, 0.5, -0.6)),   # paws on the ground beside the knees, clear of the legs
    "baby": dict(head=1.0, neck=0.18, arm=0.16, leg=0.75, limb=0.019, tufts=True, claws=True,
                 arm_dir=(0.035, 0.7, -0.35)),
}


def head_point(rings, angle, z, offset=0.0):
    """Point on the head tube at a ring angle and height (between rings)."""
    for (z0, u0, v0, d0, _), (z1, u1, v1, d1, _) in zip(rings, rings[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            ru, rv, dv = u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, d0 + (d1 - d0) * t
            a = math.radians(angle)
            return Vector(((ru + offset) * math.cos(a), dv + (rv + offset) * math.sin(a), z))
    raise ValueError(z)


def on_head(rings, x, z, offset):
    """Point on (or `offset` off) the front of the head at (x, z)."""
    ru = head_point(rings, 0, z).x
    a = math.degrees(math.acos(max(-0.98, min(0.98, x / ru))))
    return head_point(rings, a, z, offset)


def patch(m, rings, outline, centre, offset, swatch, region, steps=1, skirt=0.0):
    """A flat-coloured piece on the head: rings of the outline shrunk towards
    `centre` (steps of them) closed with a fan, every corner lifted onto the
    head, so a piece hugs the curve instead of sinking under it. A big piece
    needs a few steps: one long fan triangle cuts under the head's facet
    edges and the fur shows through. The mask gets a skirt from its rim into
    the head (skirt below the round surface, deeper than the facets sag
    between their corners), so no gap opens under the rim when
    the head is seen from the side."""
    cx, cz = centre
    c = on_head(rings, cx, cz, offset)
    loops = [[on_head(rings, cx + (x - cx) * f, cz + (z - cz) * f, offset) for x, z in outline]
             for f in [(i + 1) / steps for i in range(steps)]]
    n = len(outline)
    for i in range(n):   # wound to face out: x runs to the viewer's left
        j = (i + 1) % n
        m.face([c, loops[0][j], loops[0][i]], swatch, region)
        for a, b in zip(loops, loops[1:]):
            m.face([a[i], a[j], b[j], b[i]], swatch, region)
    if skirt:
        rim = loops[-1]
        sk = [on_head(rings, x, z, -skirt) for x, z in outline]
        for i in range(n):
            j = (i + 1) % n
            q = [rim[i], rim[j], sk[j], sk[i]]
            nrm = (q[1] - q[0]).cross(q[3] - q[0])
            mid = (q[0] + q[1]) / 2
            if nrm.dot(mid - c) < 0:   # face away from the piece's centre
                q.reverse()
            m.face(q, swatch, region)


def smooth_mask(ob, crease=50.0):
    """Smooth-shade the cream face mask, so it reads as one soft, rounded
    piece instead of facets; its skirt fold (sharper than `crease` degrees)
    and its edge against anything else stay sharp."""
    me = ob.data
    regions = list(me["regions"])
    reg = me.attributes["region"].data
    face = [regions[reg[p.index].value] == "face" for p in me.polygons]
    for p in me.polygons:
        p.use_smooth = face[p.index]
    edge_faces = {}
    for p in me.polygons:
        for ek in p.edge_keys:
            edge_faces.setdefault(ek, []).append(p.index)
    sharp = me.attributes.get("sharp_edge") or me.attributes.new("sharp_edge", "BOOLEAN", "EDGE")
    lim = math.radians(crease)
    for e in me.edges:
        fs = edge_faces.get(e.key, [])
        if not any(face[i] for i in fs):
            continue
        sharp.data[e.index].value = len(fs) != 2 or not all(face[i] for i in fs) or \
            me.polygons[fs[0]].normal.angle(me.polygons[fs[1]].normal) > lim


def ellipse(cx, cz, a, b, tilt=0.0, n=10, bulge=0.0):
    """Outline of an ellipse (half axes a along the tilted axis, b across);
    bulge > 0 widens the end the axis points to: a teardrop."""
    t = math.radians(tilt)
    out = []
    for i in range(n):
        p = 2 * math.pi * i / n
        u, v = a * math.cos(p), b * math.sin(p) * (1 + bulge * math.cos(p))
        out.append((cx + u * math.cos(t) - v * math.sin(t), cz + u * math.sin(t) + v * math.cos(t)))
    return out


# Face layout in head units (times the head scale k), from the eye line:
# eye patch centre, half axes, droop (degrees, outer end down), eye size
EYES = dict(x=0.027, z=-0.002, a=0.020, b=0.0125, droop=22, eye=0.0085)
# Teardrop patch round each eye: MASK (live, dark brown), TAN or None
EYE_PATCH = MASK


def face(m, rings, zc, k):
    """The three-toed sloth's face, drawn cute: a cream mask with a fringe of
    fur dipping into it at the top, big shiny eyes in drooping teardrop
    patches (EYE_PATCH), a round dark nose and a little smile."""
    # cream mask: one piece over the whole front, its top edge dipping in a
    # point at the middle where the head fur comes down (the fringe)
    mask = []
    for i in range(24):
        p = 2 * math.pi * i / 24
        x, z = 0.060 * math.cos(p), (0.036 if p < math.pi else 0.030) * math.sin(p)   # flatter under the chin
        if z > 0:
            z -= 0.012 * max(0.0, 1 - abs(x) / 0.025)   # fringe point
        mask.append((x * k, zc + (z - 0.008) * k))
    patch(m, rings, mask, (0, zc - 0.008 * k), 0.0035, FACE, "face", steps=5, skirt=0.012)
    e = EYES
    for s in (1, -1):
        cx, cz = s * e["x"] * k, zc + e["z"] * k
        if EYE_PATCH:
            patch(m, rings, ellipse(cx, cz, e["a"] * k, e["b"] * k, -s * e["droop"] if s > 0 else 180 + e["droop"],
                                    n=12, bulge=0.25), (cx, cz), 0.005, EYE_PATCH, "patch", steps=3)
        # the eye sits towards the inner, upper end of its patch
        ex, ez = cx - s * 0.004 * k, cz + 0.002 * k
        patch(m, rings, ellipse(ex, ez, e["eye"] * k, e["eye"] * k * 1.1, n=10), (ex, ez), 0.0062, "eye", "eye")
        gx, gz = ex - s * 0.0025 * k, ez + 0.003 * k
        patch(m, rings, ellipse(gx, gz, 0.0028 * k, 0.0028 * k, n=6), (gx, gz), 0.0078, "white", "glint")
    # nose: a small rounded bump, wider than tall
    n0 = on_head(rings, 0, zc - 0.016 * k, 0.0)
    nose = [n0 + Vector((dx * k, dy * k, dz * k)) for dx, dy, dz in
            ((-0.010, 0.002, 0.0), (0.010, 0.002, 0.0), (-0.007, 0.002, 0.006), (0.007, 0.002, 0.006),
             (-0.006, 0.002, -0.006), (0.006, 0.002, -0.006), (0.0, 0.009, 0.001), (-0.005, 0.008, 0.003),
             (0.005, 0.008, 0.003))]
    m.hull(nose, MASK, "nose")
    # smile: a shallow U under the nose, as a thin strip
    pts = [(x * k, zc + (-0.030 + 28 * x * x) * k) for x in (-0.011, -0.0055, 0.0, 0.0055, 0.011)]
    lo = [on_head(rings, x, z - 0.0013 * k, 0.0045) for x, z in pts]
    hi = [on_head(rings, x, z + 0.0013 * k, 0.0045) for x, z in pts]
    for i in range(len(pts) - 1):
        m.face([hi[i], hi[i + 1], lo[i + 1], lo[i]], "lip_dark", "mouth")


def limb(m, a, b, r, swatch, claws, region, key=""):
    """A tapered hexagonal limb from a to b, with three claws past b. The
    claws and paw pad carry the limb's key in their region (claw:arm.R), so
    the rig skins them to their own limb even where two paws sit close."""
    tip = f"claw:{key}" if key else "claw"
    pad = f"paw:{key}" if key else "paw"
    d = (b - a)
    u, v, w = base.frame(d, Z)
    L = d.length
    m.tube([(0.0, r, r, 0.0, region), (L * 0.6, r * 0.95, r * 0.9, 0.0, region), (L, r * 0.75, r * 0.7, 0.0, region)],
           origin=a, axes=(u, v, w), angles=base.HEX6, swatch=swatch)   # root capped: it shows when the limb swings out
    if claws == "soft":   # short, thick, hooked toward the palm, like a sloth's
        for k in (-1, 0, 1):
            s = b + u * (k * r * 0.6)
            mid = s + w * 0.018 + u * k * 0.003
            hook(m, [s, mid], mid + w * 0.008 - v * 0.014, [0.0075, 0.0065], FACE, tip)
    elif claws:
        for k in (-1, 0, 1):
            s = b + u * (k * r * 0.55)
            m.bar(s, s + w * 0.035 - v * 0.012 + u * k * 0.004, 0.006, CLAW, tip)
    else:  # plush: a pale paw pad, wide enough to close the limb end
        m.hull([b - w * 0.002 + u * x + v * y for x in (-r * 0.72, r * 0.72) for y in (-r * 0.66, r * 0.66)]
               + [b + w * 0.006], FACE, pad)


def hook(m, path, tip, widths, swatch, region):
    """One claw in one piece: three-sided sections along `path` (widths
    each), closing to a point at `tip`. The root sits inside the paw, so it
    has no cap: 3 triangles per section step plus 3 for the point."""
    secs = []
    for i, (p, w) in enumerate(zip(path, widths)):
        d = ((path[i + 1] if i + 1 < len(path) else tip) - (path[i - 1] if i else p)).normalized()
        a = d.cross(Z if abs(d.z) < 0.9 else X).normalized()
        c = d.cross(a)
        secs.append([p + a * (w * 1.2 * math.cos(math.radians(t))) + c * (w * 1.2 * math.sin(math.radians(t)))
                     for t in (90, 210, 330)])
    m.loft(secs, swatch, region, caps=False)
    mid = sum(secs[-1], Vector()) / 3
    for i in range(3):
        a, b = secs[-1][i], secs[-1][(i + 1) % 3]
        nrm = (b - a).cross(tip - a)
        m.face([a, b, tip] if nrm.dot((a + b) / 2 - mid) >= 0 else [b, a, tip], swatch, region)


# Where each limb runs in the modelled pose, filled in by sloth(): its
# shoulder or hip and its paw, for the rig (sloth_rig.py)
LIMBS = {}


def sloth(style):
    st = STYLES[style]
    LIMBS.clear()
    m = base.Mesh()
    # body: a pear sitting on its bottom
    m.tube([(0.0, 0.040, 0.036, 0.0, "body"), (0.03, 0.068, 0.060, 0.0, "body"), (0.08, 0.075, 0.066, 0.004, "body"),
            (0.13, 0.064, 0.056, 0.0, "body"), (st["neck"], 0.040, 0.036, -0.004, "body")],
           colors={"body": FUR})   # neck end capped, seen through the mask rim otherwise
    k, z0 = st["head"], st["neck"] - 0.02
    rings = [(z0, 0.040 * k, 0.036 * k, 0.004, "head"), (z0 + 0.025 * k, 0.062 * k, 0.056 * k, 0.010, "head"),
             (z0 + 0.065 * k, 0.066 * k, 0.058 * k, 0.010, "head"), (z0 + 0.095 * k, 0.052 * k, 0.046 * k, 0.004, "head"),
             (z0 + 0.110 * k, 0.026 * k, 0.024 * k, 0.0, "head")]
    head = base.Mesh().tube(rings, colors={"head": FUR})
    zc = z0 + 0.052 * k                      # eye line
    face(head, rings, zc, k)
    m.extend(head)
    # arms reach forward and up, as if hugging the holder's arm; legs forward
    r = st["limb"]
    for s in (1, -1):
        sh = Vector((s * 0.052, 0.012, 0.125))
        tag = "R" if s == 1 else "L"
        LIMBS[f"arm.{tag}"] = (sh, sh + Vector((s * st["arm_dir"][0], *st["arm_dir"][1:])).normalized() * st["arm"])
        limb(m, *LIMBS[f"arm.{tag}"], r, FUR, st["claws"], "arm", f"arm.{tag}")
        hip = Vector((s * 0.040, 0.025, 0.035))
        LIMBS[f"leg.{tag}"] = (hip, hip + Vector((s * 0.4, 0.85, 0.1)).normalized() * st["arm"] * st["leg"])
        limb(m, *LIMBS[f"leg.{tag}"], r * 1.05, FUR, st["claws"], "leg", f"leg.{tag}")
    if st["tufts"]:  # shaggy fur on the back and shoulders
        for x, y, z in ((0.03, -0.055, 0.10), (-0.035, -0.05, 0.07), (0.0, -0.06, 0.04), (0.05, -0.03, 0.14),
                        (-0.05, -0.03, 0.14)):
            m.hull(_tuft(x, y, z), DARK, "tuft")
    return m


def _tuft(x, y, z, r=0.022):
    c = Vector((x, y, z))
    out = Vector((x, y, 0)).normalized()
    return [c + out * r * 0.9 + Z * r * 0.2, c + Z * r * 0.5, c - Z * r * 0.9 + out * r * 0.3,
            c + out.cross(Z) * r * 0.6, c - out.cross(Z) * r * 0.6, c - out * r * 0.3]


def build(style, out):
    base.reset()
    ob = sloth(style).to_object("sloth_baby" + ("" if style == STYLE else f"_{style}"))
    smooth_mask(ob)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    arm = sloth_rig.armature(ob.name + "_rig", LIMBS, STYLES[style]["neck"])
    sloth_rig.skin(ob, arm, LIMBS, STYLES[style]["neck"])
    sloth_rig.add_clips(arm, LIMBS)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    arm.select_set(True)
    path = os.path.join(out, ob.name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
                              export_animations=True, export_animation_mode="NLA_TRACKS",
                              export_frame_range=False, export_frame_step=3)
    print(f"{ob.name}: {tris} triangles -> {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", default="all", choices=[*STYLES, "all"])
    ap.add_argument("--out", default=HERE)
    args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    for s in (STYLES if args.style == "all" else [args.style]):
        build(s, args.out)
