"""
build_critters: the four ground animals in the karaoke's "G'day, Slow Day"
crowd, in the baby sloth's style: low poly, flat shaded, on the shared
palette and material, with big shiny eyes and a white glint (no cheeks:
Adriaen 2026-11-11),
and each animal's tell-tale feature played up so it reads at a glance
(Adriaen 2026-11-11: cute, low poly, but recognizable).

    platypus  a flat brown body on four webbed paddles, the big slate duck
              bill and a wide beaver tail
    wallaby   sitting up on its haunches on long hind feet, tall pink-lined
              ears with dark tips, little forepaws, a thick tail behind
    echidna   a round dome of two-tone quills, a small furry face and a
              thin tube snout, short legs with big claws
    wombat    a low round barrel, a broad square head with a big square
              nose, small round ears, stubby legs with claws

Each animal has its own small rig and clips (critter_rig.py: idle, bop,
cheer, and hop for the wallaby). Modelled in the karaoke page's units
(no scaling needed there), origin on the ground under the body, facing +Y.

    python characters/aussie_critters/build_critters.py [--only wombat] [--out dir]
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "engine", "characters", "_shared"))  # the kit lives in desk-at-night (submodule engine/)
import base_body as base  # noqa: E402  (imports bpy)
import bpy  # noqa: E402
import critter_rig as rig  # noqa: E402
from critter_rig import bounce, jump, wave  # noqa: E402

Vector, X, Y, Z = base.Vector, base.X, base.Y, base.Z


# ------------------------------------------------------------------ shapes
def ell(m, c, r, swatch, region, axes=(X, Y, Z), nu=8, nv=4):   # crowd props, not heroes: kept light
    """A low-poly ellipsoid: half axes r along axes (u, v, w), centre c."""
    c, (u, v, w) = Vector(c), axes
    pts = [c + w * r[2], c - w * r[2]]
    for j in range(1, nv):
        th = math.pi * j / nv
        for i in range(nu):
            ph = 2 * math.pi * (i + 0.5 * (j % 2)) / nu
            pts.append(c + u * (r[0] * math.sin(th) * math.cos(ph)) + v * (r[1] * math.sin(th) * math.sin(ph))
                       + w * (r[2] * math.cos(th)))
    m.hull(pts, swatch, region)


def pipe(m, pts, rads, swatch, region, n=6, hint=Z):
    """A tube through pts with a (half width, half height) or radius at each."""
    pts = [Vector(p) for p in pts]
    secs = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u, v, w = base.frame(d, hint if abs(d.dot(hint)) < 0.95 else Y)
        rx, rz = rads[i] if isinstance(rads[i], tuple) else (rads[i], rads[i])
        secs.append([p + u * (rx * math.cos(2 * math.pi * k / n)) + v * (rz * math.sin(2 * math.pi * k / n))
                     for k in range(n)])
    m.loft(secs, swatch, region)


def surf(c, r, d):
    """Point on an ellipsoid (centre c, half axes r on x y z) along direction
    d, and the surface normal there."""
    d = Vector(d).normalized()
    t = 1 / math.sqrt(sum((d[i] / r[i]) ** 2 for i in range(3)))
    p = Vector(c) + d * t
    n = Vector(((p - Vector(c))[i] / r[i] ** 2 for i in range(3))).normalized()
    return p, n


def face(m, c, r, eye_dir, size, region="head"):
    """The cute face on a head ellipsoid: big shiny eyes (a white glint up and
    in). eye_dir for the right eye (+x)."""
    for s in (1, -1):
        d = Vector((s * eye_dir[0], eye_dir[1], eye_dir[2]))
        p, n = surf(c, r, d)
        u, v, w = base.frame(n, Z)
        ell(m, p - n * size * 0.2, (size, size * 1.15, size * 0.55), "eye", region, axes=(u, v, w), nu=6, nv=3)
        ell(m, p + n * size * 0.32 + v * size * 0.42 - u * s * size * 0.3, (size * 0.3,) * 3, "white", region, nu=4, nv=2)


def smile(m, c, r, d, width, drop, region="head", swatch="lip_dark"):
    """A little U smile on a head ellipsoid, centred along direction d."""
    pts = []
    for k in range(4):
        x = (k / 3 - 0.5) * 2
        dd = Vector(d).normalized()
        side = dd.cross(Z).normalized()
        q = dd * 1.0 - side * x * width + Z * (drop * (1 - x * x) - drop)
        pts.append(surf(c, r, q)[0])
    for a, b in zip(pts, pts[1:]):
        m.bar(a, b, 0.0018, swatch, region)


def claws(m, tip, fwd, spread, size, region, swatch="claw"):
    side = fwd.cross(Z).normalized()
    for k in (-1, 0, 1):
        a = tip + side * (k * spread)
        m.bar(a, a + (fwd + side * k * 0.25).normalized() * size - Z * size * 0.3, size * 0.22, swatch, region)


def ear(m, root, tip, width, thick, swatch, inner, region, tip_swatch=None):
    """A leaf-shaped ear from root to tip, facing ahead, lined inside."""
    root, tip = Vector(root), Vector(tip)
    w = (tip - root)
    L = w.length
    u, v, w = base.frame(w, Y)
    mid = root + w * L * 0.5
    ell(m, mid, (width, thick, L * 0.55), swatch, region, axes=(u, v, w), nu=6, nv=4)
    ell(m, mid + v * thick * 0.55 - w * L * 0.05, (width * 0.6, thick * 0.6, L * 0.4), inner, region, axes=(u, v, w),
        nu=6, nv=3)
    if tip_swatch:
        ell(m, mid + w * L * 0.4, (width * 0.62, thick * 1.08, L * 0.17), tip_swatch, region, axes=(u, v, w), nu=6, nv=3)


# ------------------------------------------------------------------ animals
# Each returns (mesh, bones, clips, chains). Bones: {name: (head, tail, parent)}.

def platypus():
    m = base.Mesh()
    BROWN, DARK, BELLY, BILL = "hair_light_brown", "hair_brown", "sloth_tan", "slate"
    ell(m, (0, -0.015, 0.062), (0.088, 0.12, 0.058), BROWN, "body")
    ell(m, (0, 0.0, 0.045), (0.072, 0.11, 0.042), BELLY, "body")
    hc, hr = (0, 0.14, 0.084), (0.08, 0.074, 0.07)
    ell(m, hc, hr, BROWN, "head")
    # the duck bill: wide, flat and rounded, a little wider at the tip
    pts = []
    for y, hw, z in ((0.19, 0.036, 0.08), (0.228, 0.05, 0.074), (0.265, 0.058, 0.068), (0.292, 0.052, 0.064),
                     (0.307, 0.031, 0.062), (0.311, 0.0, 0.062)):
        for sx in (-1, 1):
            pts += [Vector((sx * hw, y, z + 0.012)), Vector((sx * hw * 0.92, y, z - 0.011))]
    m.hull(pts, BILL, "head")
    for sx in (-1, 1):
        ell(m, (sx * 0.013, 0.281, 0.0765), (0.005, 0.007, 0.003), "charcoal", "head", nu=6, nv=3)
    face(m, hc, hr, (0.5, 0.66, 0.42), 0.0135)
    # four short legs on webbed paddles, splayed out like a swimmer's
    for s, tag in ((1, "R"), (-1, "L")):
        for key, a, b, fwd in ((f"arm.{tag}", (s * 0.06, 0.07, 0.045), (s * 0.105, 0.1, 0.012), (s * 0.35, 1, 0)),
                               (f"leg.{tag}", (s * 0.06, -0.07, 0.045), (s * 0.1, -0.1, 0.012), (s * 0.5, -0.6, 0))):
            pipe(m, [a, b], [0.02, 0.016], BROWN, key)
            f = Vector(fwd).normalized()
            side = f.cross(Z)
            b = Vector(b)
            web = [b + side * k * 0.022 + f * 0.0 for k in (-1, 1)] + \
                  [b + f * 0.042 + side * k * 0.03 for k in (-1, 0.0, 1)]
            m.hull([p + Z * dz for p in web for dz in (-0.006, 0.004)], BILL, key)
    # the wide flat beaver tail
    pipe(m, [(0, -0.11, 0.055), (0, -0.17, 0.038), (0, -0.23, 0.028), (0, -0.285, 0.022), (0, -0.305, 0.022)],
         [(0.05, 0.03), (0.068, 0.02), (0.072, 0.015), (0.056, 0.012), (0.02, 0.008)], DARK, "tail", n=6)
    bones = {"body": ((0, -0.08, 0.06), (0, 0.07, 0.065), None),
             "head": ((0, 0.1, 0.072), (0, 0.22, 0.075), "body"),
             "tail.1": ((0, -0.1, 0.055), (0, -0.2, 0.034), "body"),
             "tail.2": ((0, -0.2, 0.034), (0, -0.305, 0.022), "tail.1")}
    for s, tag in ((1, "R"), (-1, "L")):
        bones[f"arm.{tag}"] = ((s * 0.06, 0.07, 0.045), (s * 0.105, 0.1, 0.012), "body")
        bones[f"leg.{tag}"] = ((s * 0.06, -0.07, 0.045), (s * 0.1, -0.1, 0.012), "body")

    def idle(t):
        return {"loc": (0, 0, 0.002 * wave(t, 2)), "head": [(Z, 18 * wave(t)), (X, 4 * wave(t, 2, 0.2))],
                "tail.1": [(Z, 10 * wave(t, 2))], "tail.2": [(Z, 8 * wave(t, 2, -0.1))]}

    def bop(t):   # a bounce, a nod and a big wag of the tail, paddles flapping
        p = {"loc": (0, 0, 0.022 * bounce(t)), "head": [(X, 10 * bounce(t) - 4), (Y, 8 * wave(t))],
             "tail.1": [(Z, 26 * wave(t)), (X, -10 * bounce(t))], "tail.2": [(Z, 22 * wave(t, 1, -0.12))]}
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"arm.{tag}"] = [(Y, -s * 25 * bounce(t))]
            p[f"leg.{tag}"] = [(Y, -s * 18 * bounce(t))]
        return p

    def cheer(t):
        h = jump(t)
        p = {"loc": (0, 0, 0.11 * max(h, 0) + 0.012 * min(h, 0)), "body": [(X, 10 * max(h, 0))],
             "head": [(X, 22 * max(h, 0))], "tail.1": [(X, -22 * max(h, 0))], "tail.2": [(X, -18 * max(h, 0))]}
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"arm.{tag}"] = [(Y, -s * 50 * max(h, 0))]
            p[f"leg.{tag}"] = [(Y, -s * 35 * max(h, 0))]
        return p

    return m, bones, {"idle": (4.0, idle), "bop": (1.0, bop), "cheer": (1.0, cheer)}, ("tail",)


def wallaby():
    m = base.Mesh()
    FUR, BELLY, MUZZLE, DARK, FEET = "sloth_tan", "sloth_face", "khaki", "hair_dark_brown", "hair_brown"
    # a pear sitting up on its haunches, leaning a touch forward
    ell(m, (0, -0.01, 0.12), (0.082, 0.08, 0.105), FUR, "body")
    ell(m, (0, 0.012, 0.205), (0.062, 0.058, 0.07), FUR, "body")
    ell(m, (0, 0.045, 0.145), (0.06, 0.045, 0.09), BELLY, "body")
    hc, hr = (0, 0.03, 0.307), (0.073, 0.07, 0.066)
    ell(m, hc, hr, FUR, "head")
    ell(m, (0, 0.088, 0.288), (0.038, 0.045, 0.032), MUZZLE, "head")
    ell(m, (0, 0.131, 0.298), (0.014, 0.008, 0.009), "sloth_mask", "head", nu=6, nv=3)
    smile(m, (0, 0.088, 0.288), (0.038, 0.045, 0.032), (0, 1, -0.55), 0.35, 0.18)
    face(m, hc, hr, (0.46, 0.78, 0.26), 0.0138)
    for s, tag in ((1, "R"), (-1, "L")):
        ear(m, (s * 0.032, 0.02, 0.35), (s * 0.068, 0.0, 0.46), 0.022, 0.009, FUR, "blush", f"ear.{tag}", DARK)
        # little forepaws held in front of the chest
        a, b = Vector((s * 0.045, 0.05, 0.215)), Vector((s * 0.03, 0.098, 0.165))
        pipe(m, [a, b], [0.016, 0.012], FUR, f"arm.{tag}")
        ell(m, b + Vector((0, 0.004, -0.006)), (0.013, 0.012, 0.012), DARK, f"arm.{tag}", nu=6, nv=3)
        # big haunches on long hind feet
        ell(m, (s * 0.068, 0.0, 0.07), (0.045, 0.072, 0.058), FUR, f"leg.{tag}")
        ell(m, (s * 0.07, 0.045, 0.014), (0.026, 0.078, 0.014), FEET, f"foot.{tag}", nu=8, nv=4)
    # the thick tail, out behind on the ground with its tip curled up
    pipe(m, [(0, -0.06, 0.07), (0, -0.14, 0.03), (0, -0.22, 0.016), (0, -0.3, 0.022), (0, -0.345, 0.04)],
         [0.036, 0.03, 0.022, 0.014, 0.006], FUR, "tail", n=6)
    bones = {"body": ((0, 0.0, 0.06), (0, 0.012, 0.25), None),
             "head": ((0, 0.02, 0.255), (0, 0.06, 0.36), "body"),
             "tail.1": ((0, -0.06, 0.07), (0, -0.18, 0.02), "body"),
             "tail.2": ((0, -0.18, 0.02), (0, -0.345, 0.04), "tail.1")}
    for s, tag in ((1, "R"), (-1, "L")):
        bones[f"ear.{tag}"] = ((s * 0.032, 0.02, 0.345), (s * 0.068, 0.0, 0.46), "head")
        bones[f"arm.{tag}"] = ((s * 0.045, 0.05, 0.215), (s * 0.03, 0.098, 0.165), "body")
        bones[f"leg.{tag}"] = ((s * 0.068, -0.02, 0.1), (s * 0.07, -0.02, 0.025), "body")
        bones[f"foot.{tag}"] = ((s * 0.07, -0.03, 0.014), (s * 0.07, 0.12, 0.012), f"leg.{tag}")

    def ears(p, a, b=0.0):
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"ear.{tag}"] = [(Y, -s * a), (X, b)]
        return p

    def idle(t):
        tw = max(0.0, math.sin(2 * math.pi * (t * 2 - 0.3))) ** 8   # a quick ear twitch now and then
        p = {"loc": (0, 0, 0.002 * wave(t, 2)), "body": [(X, 1.5 * wave(t, 2))],
             "head": [(Z, 16 * wave(t)), (Y, 5 * wave(t, 1, 0.3))], "tail.2": [(Z, 8 * wave(t))]}
        return ears(p, 12 * tw * wave(t, 6), -6 * tw)

    def bop(t):
        p = {"loc": (0, 0, 0.018 * bounce(t)), "head": [(X, -8 * bounce(t)), (Y, 6 * wave(t))],
             "tail.1": [(X, -6 * bounce(t))], "tail.2": [(Z, 14 * wave(t))]}
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"arm.{tag}"] = [(X, 30 * bounce(t)), (Y, -s * 10 * wave(t))]
        return ears(p, 10 * wave(t, 1, 0.25), -10 * bounce(t))

    def hop(t):   # both hind feet at once, the tail swinging up for balance
        h = jump(t)
        up = max(h, 0)
        p = {"loc": (0, 0.0, 0.14 * up + 0.015 * min(h, 0)), "body": [(X, -16 * up + 8 * min(h, 0))],
             "head": [(X, 12 * up)], "tail.1": [(X, -30 * up)], "tail.2": [(X, -20 * up)]}
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"leg.{tag}"] = [(X, -20 * up)]
            p[f"foot.{tag}"] = [(X, -35 * up)]
            p[f"arm.{tag}"] = [(X, -20 * up)]
        return ears(p, 6 * up, -25 * up)

    def cheer(t):
        p = hop(t)
        up = max(jump(t), 0)
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"arm.{tag}"] = [(X, 120 * up), (Y, -s * 25 * up)]
        return p

    return m, bones, {"idle": (4.0, idle), "bop": (1.0, bop), "cheer": (1.0, cheer), "hop": (1.0, hop)}, ("tail",)


def echidna():
    m = base.Mesh()
    COAT, FACE, SNOUT = "hair_dark_brown", "hair_brown", "charcoal"
    bc, br = (0, -0.01, 0.072), (0.1, 0.12, 0.072)
    ell(m, bc, br, COAT, "body")
    hc, hr = (0, 0.112, 0.072), (0.064, 0.06, 0.058)
    ell(m, hc, hr, FACE, "head")
    pipe(m, [(0, 0.155, 0.064), (0, 0.19, 0.052), (0, 0.222, 0.04), (0, 0.242, 0.032)],
         [0.017, 0.013, 0.009, 0.006], SNOUT, "head")
    ell(m, (0, 0.243, 0.032), (0.0065, 0.005, 0.0055), "sloth_mask", "head", nu=6, nv=3)
    face(m, hc, hr, (0.48, 0.74, 0.4), 0.0118)
    # the quills: two-tone spines, cream with dark tips, swept back over the dome
    n_q = 70
    for i in range(n_q):
        u = (i + 0.5) / n_q
        th = math.acos(1 - 2 * u)
        ph = i * 2.39996
        d = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
        if d.z < 0.05 or d.y > 0.45:
            continue
        p, n = surf(bc, br, d)
        # lying back along the body, tips lifting only a little off the fur
        # (Adriaen 2026-11-11: an echidna's quills don't stick up)
        back = Vector((0, -1, 0))
        back = (back - n * back.dot(n))
        if back.length < 1e-3:
            back = Vector((d.x, d.y, 0))
        a = (back.normalized() + n * 0.3).normalized()
        L = 0.036 + 0.006 * math.sin(i * 1.7)
        side = a.cross(Z if abs(a.z) < 0.9 else X).normalized()
        up = a.cross(side)
        w = 0.0075
        base_ring = [p - n * 0.006 + side * w * math.cos(k * 2 * math.pi / 3) + up * w * math.sin(k * 2 * math.pi / 3)
                     for k in range(3)]
        mid = p + a * L * 0.6
        mid_ring = [mid + side * w * 0.45 * math.cos(k * 2 * math.pi / 3) + up * w * 0.45 * math.sin(k * 2 * math.pi / 3)
                    for k in range(3)]
        m.hull(base_ring + mid_ring, "pearl", "quills")
        m.hull(mid_ring + [p + a * L], "hair_black", "quills")
    for s, tag in ((1, "R"), (-1, "L")):
        for key, a, b, fwd in ((f"arm.{tag}", (s * 0.065, 0.06, 0.04), (s * 0.085, 0.085, 0.01), (s * 0.4, 1, 0)),
                               (f"leg.{tag}", (s * 0.065, -0.07, 0.04), (s * 0.085, -0.085, 0.01), (s * 0.5, -0.5, 0))):
            pipe(m, [a, b], [0.019, 0.016], FACE, key)
            claws(m, Vector(b) + Vector(fwd).normalized() * 0.01, Vector(fwd).normalized(), 0.008, 0.016, key)
    bones = {"body": ((0, -0.08, 0.07), (0, 0.06, 0.072), None),
             "head": ((0, 0.075, 0.068), (0, 0.2, 0.05), "body"),
             "quills": ((0, -0.01, 0.06), (0, -0.01, 0.13), "body")}
    for s, tag in ((1, "R"), (-1, "L")):
        bones[f"arm.{tag}"] = ((s * 0.065, 0.06, 0.04), (s * 0.085, 0.085, 0.01), "body")
        bones[f"leg.{tag}"] = ((s * 0.065, -0.07, 0.04), (s * 0.085, -0.085, 0.01), "body")

    def idle(t):   # snuffling about with the snout
        return {"loc": (0, 0, 0.002 * wave(t, 2)), "head": [(Z, 16 * wave(t)), (X, -6 + 6 * wave(t, 4))],
                "scale": {"quills": 1 + 0.02 * wave(t, 2)}}

    def bop(t):   # the spines puff out on the beat
        p = {"loc": (0, 0, 0.016 * bounce(t)), "head": [(X, 8 * bounce(t) - 3), (Y, 10 * wave(t))],
             "body": [(Y, 5 * wave(t))], "scale": {"quills": 1 + 0.12 * bounce(t)}}
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"arm.{tag}"] = [(Y, -s * 18 * bounce(t))]
        return p

    def cheer(t):
        h = jump(t)
        up = max(h, 0)
        p = {"loc": (0, 0, 0.1 * up + 0.01 * min(h, 0)), "head": [(X, 25 * up)], "body": [(X, 8 * up)],
             "scale": {"quills": 1 + 0.25 * up - 0.1 * min(h, 0)}}
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"arm.{tag}"] = [(Y, -s * 45 * up)]
            p[f"leg.{tag}"] = [(Y, -s * 30 * up)]
        return p

    return m, bones, {"idle": (4.0, idle), "bop": (1.0, bop), "cheer": (1.0, cheer)}, ()


def WOMBAT_LEGS(s, tag):   # short, thick legs: (bone, top, paw)
    return ((f"arm.{tag}", (s * 0.092, 0.058, 0.058), (s * 0.104, 0.072, 0.014)),
            (f"leg.{tag}", (s * 0.096, -0.072, 0.058), (s * 0.106, -0.072, 0.014)))


def wombat():
    m = base.Mesh()
    FUR, PALE, DARK, NOSE = "hair_fade", "stubble", "hair_fade_dark", "sloth_mask"
    # a short, stocky barrel low on the ground (Adriaen 2026-11-11: shorter, stockier)
    ell(m, (0, -0.012, 0.1), (0.138, 0.128, 0.096), FUR, "body")
    ell(m, (0, 0.015, 0.066), (0.11, 0.1, 0.058), PALE, "body")
    ell(m, (0, -0.138, 0.1), (0.016, 0.012, 0.014), DARK, "body", nu=6, nv=3)   # stub of a tail
    HY, HZ = -0.04, -0.024   # the head sits further back and lower than on the long first build
    hc, hr = (0, 0.168 + HY, 0.155 + HZ), (0.112, 0.09, 0.094)
    ell(m, hc, hr, FUR, "head")
    mc, mr = (0, 0.225 + HY, 0.124 + HZ), (0.07, 0.048, 0.05)
    ell(m, mc, mr, PALE, "head")
    # the big square nose: a rounded block
    nose = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            for k, (dx, dy, dz) in enumerate(((0.038, 0.0, 0.022), (0.03, 0.016, 0.017), (0.034, 0.008, 0.026))):
                nose.append(Vector((sx * dx, 0.262 + HY + dy, 0.138 + HZ + sz * dz)))
    m.hull(nose, NOSE, "head")
    for sx in (-1, 1):
        ell(m, (sx * 0.015, 0.279 + HY, 0.133 + HZ), (0.007, 0.003, 0.005), "black", "head", nu=6, nv=3)
    smile(m, mc, mr, (0, 1, -0.95), 0.28, 0.12)
    face(m, hc, hr, (0.5, 0.76, 0.26), 0.0145)
    for s, tag in ((1, "R"), (-1, "L")):
        ear(m, (s * 0.06, 0.15 + HY, 0.215 + HZ), (s * 0.085, 0.145 + HY, 0.262 + HZ), 0.024, 0.01, FUR, "blush",
            f"ear.{tag}")
        for key, a, b in WOMBAT_LEGS(s, tag):
            pipe(m, [a, b], [0.037, 0.032], DARK, key, n=5)
            claws(m, Vector(b) + Vector((0, 0.022, -0.004)), Y, 0.011, 0.016, key)
    bones = {"body": ((0, -0.1, 0.1), (0, 0.06, 0.1), None),
             "head": ((0, 0.1 + HY, 0.13 + HZ), (0, 0.26 + HY, 0.14 + HZ), "body")}
    for s, tag in ((1, "R"), (-1, "L")):
        bones[f"ear.{tag}"] = ((s * 0.06, 0.15 + HY, 0.21 + HZ), (s * 0.085, 0.145 + HY, 0.262 + HZ), "head")
        for key, a, b in WOMBAT_LEGS(s, tag):
            bones[key] = (a, b, "body")

    def ears(p, a):
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"ear.{tag}"] = [(Y, -s * a)]
        return p

    def idle(t):
        p = {"loc": (0, 0, 0.003 * wave(t, 2)), "head": [(Z, 14 * wave(t)), (Y, 5 * wave(t, 1, 0.3))]}
        return ears(p, 8 * wave(t, 3))

    def bop(t):   # a heavy, happy waddle side to side
        p = {"loc": (0, 0, 0.014 * bounce(t)), "body": [(Y, 7 * wave(t))], "head": [(Y, -9 * wave(t)), (X, -6 * bounce(t))]}
        return ears(p, 10 * wave(t, 1, 0.2))

    def cheer(t):
        h = jump(t)
        up = max(h, 0)
        p = {"loc": (0, 0, 0.08 * up + 0.012 * min(h, 0)), "head": [(X, 20 * up)], "body": [(X, 6 * up)]}
        for s, tag in ((1, "R"), (-1, "L")):
            p[f"arm.{tag}"] = [(Y, -s * 40 * up)]
            p[f"leg.{tag}"] = [(Y, -s * 25 * up)]
        return ears(p, 15 * up)

    return m, bones, {"idle": (4.0, idle), "bop": (1.0, bop), "cheer": (1.0, cheer)}, ()


ANIMALS = {"platypus": platypus, "wallaby": wallaby, "echidna": echidna, "wombat": wombat}


def build(name, out):
    base.reset()
    m, bones, clips, chains = ANIMALS[name]()
    ob = m.to_object(name)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    arm = rig.armature(name + "_rig", bones)
    rig.skin(ob, arm, chains)
    rig.add_clips(arm, clips)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    arm.select_set(True)
    path = os.path.join(out, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
                              export_animations=True, export_animation_mode="NLA_TRACKS",
                              export_frame_range=False, export_frame_step=1)
    print(f"{name}: {tris} triangles -> {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=list(ANIMALS))
    ap.add_argument("--out", default=HERE)
    args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    for n in ([args.only] if args.only else ANIMALS):
        build(n, args.out)
