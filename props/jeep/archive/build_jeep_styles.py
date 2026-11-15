"""
The archived Canopy Camp jeep styles (Adriaen kept the Expedition for the camp on 2026-11-12; props/jeep/build_jeep.py
builds it). Kept buildable, since Adriaen keeps every variant; the GLBs and baked ground shadows they made are next to this
file (README.md). Moved here from build_jeep.py unchanged (review R2-258); body(), finish() and the rest come from it.

    toy         chunky and rounded like the storybook props: mint and cream, big soft wheels, a wicker roof basket
    camper      a camping rig: sand paint, a rooftop tent folded open over the side with a ladder to the ground

and the earlier open wheels (--wheel open): a separate tyre, rim, hub and cap, with the tread --tyre picks: "at"
staggered all-terrain blocks, "mt" chunky mud-terrain lugs over the shoulders, "road" smooth with painted grooves. The
default, --wheel closed, is the expedition's sealed wheel (build_jeep.py wheel_closed).

    .venv/bin/python props/jeep/archive/build_jeep_styles.py --style toy                       # -> props/jeep/jeep_toy.glb
    .venv/bin/python props/jeep/archive/build_jeep_styles.py --style camper --wheel open --tyre at --preview
    .venv/bin/python props/jeep/archive/build_jeep_styles.py --style expedition --wheel open   # -> props/jeep/jeep_expedition_open_mt.glb

A style is written as props/jeep/jeep_<style>.glb, where props/bake_all.py --jeep <style> and the light bake look for it
(README.md); the expedition on open wheels goes to jeep_expedition_open_<tyre>.glb, so the page's jeep and its base64
copy are never written over. Each gets its own AO bake (build_jeep.py bake_jeep, with no mud) and no far LOD.

Exports: toy(wheel), camper(wheel), expedition_open(tyre) -> (objects, empties) in the current scene; wheel_open(x, y,
R, Wt, M, axis_x, tyre); TREAD; TOY, the toy's body() numbers; build(style, samples, views, preview_samples, wheel,
tyre, device); STYLES.
"""
import argparse
import functools
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
JEEP = os.path.dirname(HERE)
sys.path.insert(0, JEEP)                      # build_jeep, the expedition's builders
sys.path.insert(0, os.path.dirname(JEEP))     # props/lib
from build_jeep import REAR, ROOF, bake_jeep, body, expedition, finish, lathe, lugs, mats, nuts, panel, preview, prism, slim_box, soften, wheel_closed  # noqa: E402
from lib.export import export_glb, reset  # noqa: E402
from lib.mesh import ball, cyl, rod, torus  # noqa: E402

STYLES = ("toy", "camper", "expedition")       # the expedition only with --wheel open
# the open wheel's treads, each as build_jeep.py TREAD_MT: "at" staggered blocks, half the tread wide, alternating left
# and right of the centre; "mt" the closed wheel's big lugs
TREAD = {"at": (16, 0.36, 0.18, 0.8, 0.05), "mt": (12, 0.5, 0.12, 0.6, 0.07)}
TOY = dict(R=0.43, soft=(0.12, 0.12), lamp_r=0.15, bumper_bevel=0.05, tyre_w=0.27, flare_tube=0.06)   # bigger wheels and lamps, rounder


def wheel_open(x, y, R, Wt, M, axis_x=True, tyre="mt"):
    """A tyre with a rounded shoulder and tread (tyre: "at", "mt" or "road"), a dished steel rim with a hub, on an axle
    along X (or along Y for the spare). The silhouette gets the segments; the tread pattern is low blocks or painted bands."""
    at, h, rr = (x, y, 0), Wt / 2, R * 0.6
    side = (math.copysign(1, x) if x else 1) if axis_x else 1          # the outer face: away from the car (+Y for the spare)
    t, g = "tyre", "groove"
    core = R * (0.95 if tyre != "road" else 1.0)
    # the tyre's cross-section, inner bead to outer bead: bulging sidewalls, rounded shoulders, a flat tread band
    if tyre == "road":
        prof = [(rr, -h, t), (R * 0.86, -h - 0.012, t), (R * 0.97, -h * 0.9, t), (R, -h * 0.7, g), (R, -h * 0.58, t), (R, -h * 0.12, g),
                (R, h * 0.12, t), (R, h * 0.58, g), (R, h * 0.7, t), (R * 0.97, h * 0.9, t), (R * 0.86, h + 0.012, t), (rr, h, t)]
    else:
        prof = [(rr, -h, t), (R * 0.84, -h - 0.014, t), (core * 0.97, -h * 0.9, t), (core, -h * 0.74, g), (core, h * 0.74, t),
                (core * 0.97, h * 0.9, t), (R * 0.84, h + 0.014, t), (rr, h, t)]
    prof = [(r, o * side, k) for r, o, k in prof]
    p = [lathe(prof, 20 if tyre != "mt" else 16, at, axis_x, M, "tyre")]
    if tyre in TREAD:
        p += lugs(x, y, R, Wt, core, M[t], axis_x, TREAD[tyre])
    # the rim: a lip, a dished face and a raised centre, then a hub and five nuts; a flat cap closes the inner side
    rim = [(rr, h * 1.02, "rim"), (rr * 0.88, h * 0.6, "rim"), (rr * 0.5, h * 0.6, "rim"), (rr * 0.42, h * 0.75, "hub")]
    p.append(lathe([(r, o * side, k) for r, o, k in rim], 12, at, axis_x, M, "rim", face=(side, 0, 0) if axis_x else (0, side, 0)))
    hub_at = (x + side * h * 0.75, y, 0) if axis_x else (x, y + side * h * 0.75, 0)
    rot = (0, math.pi / 2, 0) if axis_x else (math.pi / 2, 0, 0)
    p.append(cyl(rr * 0.42, 0.04, at=hub_at, rot=rot, m=M["hub"], verts=6))
    p.append(cyl(rr * 0.9, 0.01, at=(x - side * h * 0.98, y, 0) if axis_x else (x, y - side * h * 0.98, 0), rot=rot, m=M["under"], verts=6))
    return p + nuts(x, y, hub_at[0 if axis_x else 1] + side * 0.023, rr * 0.3, rr * 0.075, M["trim"], axis_x, side)


def toy(wheel=wheel_closed):
    """Chunky and rounded like the storybook props: mint and cream, big soft wheels (TOY), a wicker roof basket."""
    M = mats("toy", paint=(0.5, 0.8, 0.68), paint2=(0.97, 0.93, 0.82), bar=(0.97, 0.93, 0.82), bumper=(0.97, 0.93, 0.82), flare=(0.97, 0.93, 0.82),
             rim=(0.97, 0.93, 0.82), cover=(0.97, 0.93, 0.82), wicker=(0.78, 0.6, 0.38), wicker2=(0.62, 0.45, 0.27), blanket=(0.95, 0.45, 0.5),
             blanket2=(1, 0.88, 0.9), petal=(1, 0.55, 0.65), mid=(1, 0.84, 0.3), leaf=(0.36, 0.62, 0.3), tyre=(0.2, 0.18, 0.17))
    b = body(M, wheel, **TOY); p, G = b.parts, b.groups
    # a wicker roof basket with a rolled picnic blanket and a little potted plant
    z = ROOF + 0.05
    for s in (-1, 1):
        p.append(cyl(0.02, 0.08, at=(s * 0.55, -0.0, ROOF + 0.02), m=M["wicker2"], verts=6))
        p.append(cyl(0.02, 0.08, at=(s * 0.55, 1.3, ROOF + 0.02), m=M["wicker2"], verts=6))
    p.append(slim_box((1.3, 1.45, 0.03), at=(0, 0.66, z), m=M["wicker2"]))
    for k in range(4):
        h = z + 0.04 + k * 0.045
        for s in (-1, 1):
            p.append(rod((s * 0.65, -0.06, h), (s * 0.65, 1.38, h), 0.018, M["wicker" if k % 2 else "wicker2"], verts=6))
            p.append(rod((-0.65, 0.66 + s * 0.72, h), (0.65, 0.66 + s * 0.72, h), 0.018, M["wicker2" if k % 2 else "wicker"], verts=6))
    roll = cyl(0.16, 1.0, at=(0, 0.2, z + 0.17), rot=(0, math.pi / 2, 0), m=M["blanket"], verts=12)
    p.append(roll)
    for x in (-0.3, 0.0, 0.3):
        p.append(cyl(0.163, 0.08, at=(x, 0.2, z + 0.17), rot=(0, math.pi / 2, 0), m=M["blanket2"], verts=12))
    p.append(cyl(0.12, 0.18, at=(0.25, 0.95, z + 0.11), m=M["wicker"], verts=14, r2=0.15))
    for k in range(5):
        a = k / 5 * 2 * math.pi
        p.append(ball(0.09, at=(0.25 + math.cos(a) * 0.07, 0.95 + math.sin(a) * 0.07, z + 0.26), scale=(1.4, 0.6, 0.35), m=M["leaf"], seg=10, rot=(0, -0.4, a)))
    # a flower on the spare cover and a little one by each headlight
    sy = REAR + 0.22 + 0.13
    for k in range(5):
        a = k / 5 * 2 * math.pi
        G["BackDoor"].append(ball(0.07, at=(0.06 + math.cos(a) * 0.09, sy, 0.98 + math.sin(a) * 0.09), scale=(1, 0.3, 1), m=M["petal"], seg=10))
    G["BackDoor"].append(ball(0.06, at=(0.06, sy + 0.01, 0.98), scale=(1, 0.4, 1), m=M["mid"], seg=10))
    return finish(b)


def camper(wheel=wheel_closed):
    """A camping rig: sand paint, a rooftop tent folded open over the side with a ladder to the ground."""
    M = mats("ca", paint=(0.82, 0.74, 0.58), paint2=(0.95, 0.93, 0.88), bar=(0.95, 0.93, 0.88), bumper=(0.2, 0.2, 0.2), flare=(0.2, 0.2, 0.2),
             rim=(0.95, 0.93, 0.88), cover=(0.25, 0.42, 0.38), canvas=(0.27, 0.45, 0.4), canvas2=(0.95, 0.66, 0.33), base=(0.18, 0.18, 0.18),
             alu=(0.72, 0.73, 0.74), rope=(0.7, 0.62, 0.45))
    b = body(M, wheel); p, G = b.parts, b.groups
    # rooftop tent folded open over the right side: one shell on the roof, the lid as the floor out over the ladder
    z = ROOF + 0.07
    x0, x1 = -0.72, 2.0
    for s in (-1, 1):
        p.append(rod((s * 0.6, -0.05, ROOF), (s * 0.6, -0.05, z), 0.02, M["base"], verts=6))
        p.append(rod((s * 0.6, 1.45, ROOF), (s * 0.6, 1.45, z), 0.02, M["base"], verts=6))
    p.append(slim_box((x1 - x0, 1.75, 0.07), at=((x0 + x1) / 2, 0.7, z), m=M["base"], bevel=0.02))
    # canvas: one tent over the shell and the fold-out, high over the roof hinge and sloping down to the far end,
    # with an orange window each end and the door over the ladder
    prof = [(x0, z), (x1, z), (x1, z + 0.58), (0.62, z + 0.9), (x0 + 0.1, z + 0.72), (x0, z + 0.42)]
    tent = prism([(x, zz) for x, zz in prof], 1.7, M["canvas"])
    tent.rotation_euler.z = -math.pi / 2                                # profile was drawn in Y: turn it to run across X
    tent.location.y = 0.7
    p.append(soften(tent, 0.06))
    for y in (-0.16, 1.56):
        p.append(panel((0.9, y, z + 0.18), (1.6, y, z + 0.18), (1.6, y, z + 0.55), (0.9, y, z + 0.66), M["canvas2"]))
    p.append(cyl(0.06, 0.9, at=(x1 + 0.03, 0.7, z + 0.56), rot=(math.pi / 2, 0, 0), m=M["canvas2"], verts=12))   # rolled-up door
    p.append(panel((x1 + 0.006, 0.3, z + 0.08), (x1 + 0.006, 1.1, z + 0.08), (x1 + 0.006, 1.1, z + 0.5), (x1 + 0.006, 0.3, z + 0.5), M["base"]))
    for y in (-0.12, 1.52):                                             # poles holding the fold-out end up
        p.append(rod((0.62, y, z + 0.92), (x1 - 0.02, y, z + 0.6), 0.014, M["alu"], verts=6))
    # an aluminium ladder from the fold-out edge to the ground
    yl = (0.45, 0.95)
    xt, xb = x1 - 0.05, x1 + 0.55
    for y in yl:
        p.append(rod((xt, y, z), (xb, y, 0.0), 0.022, M["alu"], verts=6))
    for k in range(1, 7):
        t = k / 7
        p.append(rod((xt + (xb - xt) * t, yl[0], z * (1 - t)), (xt + (xb - xt) * t, yl[1], z * (1 - t)), 0.016, M["alu"], verts=6))
    # a coiled rope and a little pennant on the spare
    p.append(torus(0.15, 0.03, at=(-0.45, 1.3, z + 0.12), m=M["rope"], major=12, minor=3))
    return finish(b)


def expedition_open(tyre="mt"):
    """The expedition on the open wheels with the given tread."""
    return expedition(functools.partial(wheel_open, tyre=tyre))


def build(style, samples, views=None, preview_samples=48, wheel="closed", tyre="mt", device="auto"):
    """Build, bake and export one archived style (wheel: "closed" or "open", tyre: the open wheel's tread; views and
    device as build_jeep.py build takes them)."""
    if style == "expedition" and wheel != "open":
        sys.exit("the expedition on its closed wheels is build_jeep.py's; here it is built only with --wheel open")
    reset()
    make = functools.partial(wheel_open, tyre=tyre) if wheel == "open" else wheel_closed
    objs, empties = expedition(make) if style == "expedition" else {"toy": toy, "camper": camper}[style](make)
    bake_jeep(objs, samples, device)
    name = f"jeep_expedition_open_{tyre}" if style == "expedition" else f"jeep_{style}"
    path = export_glb([*objs.values(), *empties], os.path.join(JEEP, f"{name}.glb"), texcoords=False, extras=True,
                      check="warn", small=True)    # archived: report only
    print(f"{style} -> {path}")
    if views is not None:
        preview(style, objs, preview_samples, views, device)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", required=True, choices=STYLES)
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--preview-samples", type=int, default=48)
    ap.add_argument("--preview", nargs="?", const="", default=None, metavar="VIEWS",
                    help="also render Cycles preview stills: all of them, or only the comma-separated views given")
    ap.add_argument("--wheel", default="closed", choices=["closed", "open"])
    ap.add_argument("--tyre", default="mt", choices=["at", "mt", "road"], help="the tread; only acts with --wheel open")
    ap.add_argument("--device", default="auto", help="Cycles device: auto (the fastest GPU, else the CPU), gpu (stop if none), cpu, or a backend such as optix")
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])   # under blender -b: the args after --
    build(a.style, a.samples, None if a.preview is None else [v for v in a.preview.split(",") if v], a.preview_samples,
          a.wheel, a.tyre, a.device)
