"""
Canopy Camp's ground, baked offline (Adriaen 2026-11-12: the live-painted dirt "doesn't look realistic at all"; bake it, and
re-bake when something major moves). Replaces ground.js's soft canvas blobs with a worn camp floor built from fractal noise
at several scales, so dirt edges break up into trampled patches the way real camp ground does.

    node props/shadow/export_casters.cjs picked            # also writes props/shadow/layout_picked.json from the live page
    python3 props/ground/bake_ground.py --props picked     # numpy + Pillow, about 20 s

Reads the layout (the props' collision spots, the jeep's track, the path to the glade, the tent, the hammock; the
exporter guarantees each of them, so a missing one stops the run; only "entry" is optional) and writes, for the ground
disc 2 x RR across (row 0 = page z -RR, column 0 = x -RR, as ground.js looks it up with flipY false):
  apps/canopy-prototype/models/camp_ground_<props>.jpg       2048 soil colour (sRGB): packed earth, damp and dusty,
      soot and ash with charcoal by the fire, pebbles, twigs and fallen leaves
  apps/canopy-prototype/models/camp_ground_<props>_mask.png  1024 RGB, ground.js's wear map: R bare ground (1 = soil
      colour, 0 = live grass), G lushness (0.5 neutral), B ash/wet; the grass cards keep to where R is low
The light (sun shadows, sky occlusion, night light) is baked with the props, props/camp/bake_camp_lightmap.py.

The stages run in main(), in this order, which is also the order they draw from the one seeded stream (keep it, or the
ground changes): Field (the pixel grid and its noise), wear (where feet and tyres wore the grass), soil (its colour),
litter (pebbles, twigs and leaves drawn into the colour and the wear), then save (the lushness and wet layers and the
two files).
"""
import argparse, json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "apps/canopy-prototype/models")


def ss(e0, e1, v):
    return np.clip((v - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((v - e0) / (e1 - e0), 0, 1))


class Field:
    """The pixel grid over the ground disc (X[row, col] = x of col, Z = z of row, rf = distance from the fire), the seeded
    stream every stage draws from, and the noise fields the stages share."""

    def __init__(self, R, N, seed):
        self.R, self.N = R, N
        self.rng = np.random.default_rng(seed)
        self.c = (np.arange(N) + 0.5) / N * 2 * R - R
        self.X, self.Z = np.meshgrid(self.c, self.c)
        self.rf = np.hypot(self.X, self.Z)
        self.n_big, self.n_mid, self.n_fine, self.n_grain = self.fbm(3.0), self.fbm(0.8), self.fbm(0.18, 3), self.fbm(0.07, 2)
        self.n_col, self.n_col2 = self.fbm(1.5), self.fbm(0.35, 3)

    def noise(self, cell):                                 # smooth value noise with features about `cell` metres across, 0..1
        n = max(2, int(math.ceil(2 * self.R / cell)) + 3)
        g = Image.fromarray(self.rng.random((n, n)).astype(np.float32), "F").resize((self.N, self.N), Image.BICUBIC)
        return np.clip(np.asarray(g), 0, 1)

    def fbm(self, cell, oct=4):
        s, w, t = 0, 0, 1
        for i in range(oct): s = s + self.noise(cell / 2 ** i) * t; w += t; t *= 0.5
        return s / w

    def wobbly(self, p, q, bend, n=14):                    # a footpath doesn't run straight
        p, q = np.array(p, float), np.array(q, float); s = np.array([-(q - p)[1], (q - p)[0]]); s /= np.linalg.norm(s) + 1e-9
        return [p + (q - p) * t + s * (math.sin(t * math.pi) * bend + self.rng.uniform(-0.05, 0.05)) for t in np.linspace(0, 1, n)]

    def path(self, pts, w, k):
        # only the pixels the path can reach are worked out: beyond w + 0.25 m of it (0.25 = the most the two noise terms add)
        # the result is exactly 0, and a distance field over the whole image for every segment was 70% of this script's run time
        R, N, c = self.R, self.N, self.c
        P = np.array(pts, float); m = w + 0.25 + 2 * 2 * R / N
        i0, i1 = np.searchsorted(c, [P[:, 1].min() - m, P[:, 1].max() + m]); j0, j1 = np.searchsorted(c, [P[:, 0].min() - m, P[:, 0].max() + m])
        out = np.zeros((N, N)); box = (slice(i0, i1), slice(j0, j1))
        d = seg_dist((self.X[box], self.Z[box]), pts[:-1], pts[1:]) + 0.35 * (self.n_mid[box] - 0.5) + 0.15 * (self.n_fine[box] - 0.5)
        out[box] = k * (1 - ss(w * 0.35, w, d))
        return out


def seg_dist(P, A, B):                                     # distance from every pixel to the polyline A..B points
    d = np.full(P[0].shape, 1e9, np.float32)
    for (ax, az), (bx, bz) in zip(A, B):
        vx, vz = bx - ax, bz - az; l2 = vx * vx + vz * vz + 1e-9
        t = np.clip(((P[0] - ax) * vx + (P[1] - az) * vz) / l2, 0, 1)
        d = np.minimum(d, np.hypot(P[0] - ax - t * vx, P[1] - az - t * vz))
    return d


def wear(f, L, glade):
    """W, how worn the ground is (0..1), and WET, the low spots [(x, z, r)] on the paths where water stands."""
    R, RC, X, Z, rng = f.R, L["RC"], f.X, f.Z, f.rng
    warp = 1.1 * (f.n_mid - 0.5) + 0.5 * (f.n_fine - 0.5)
    W = 1 - ss(1.7, 3.7, f.rf + 1.3 * (f.n_big - 0.5) + warp)   # the trampled ring round the fire and the seats
    HM = L["hammock"]                                            # the hammock's two posts, [[x, z], [x, z]]
    on_hm = lambda x, z: min(math.hypot(x - hx, z - hz) for hx, hz in HM) < 0.05
    for x, z, r in L["spots"]:                                   # round each thing you use
        W = np.maximum(W, 0.8 * (1 - ss(0.05, 0.7 + 0.25 * r, np.hypot(X - x, Z - z) - r + warp * 0.8)))
        Lr = math.hypot(x, z)
        if Lr > 2.2 and not on_hm(x, z): W = np.maximum(W, f.path(f.wobbly((x / Lr * 2.4, z / Lr * 2.4), (x / Lr * (Lr - r * 0.7), z / Lr * (Lr - r * 0.7)), rng.uniform(-0.5, 0.5)), 0.5, 0.85))
    # under the hammock (Adriaen 2026-11-12: "that's where people enter from"): a worn patch along it, scuffed deepest
    # under the middle where you sit
    (ax, az), (bx, bz) = HM
    mx, mz = (ax + bx) / 2, (az + bz) / 2; Lm = math.hypot(mx, mz)
    fx_, fz_ = -mx / Lm * 0.3, -mz / Lm * 0.3                    # pulled a little toward the fire: you get in from that side
    u = np.clip(((X - ax) * (bx - ax) + (Z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2), 0, 1)
    W = np.maximum(W, f.path([np.array([ax + fx_ * 0.5, az + fz_ * 0.5]), np.array([mx + fx_, mz + fz_]), np.array([bx + fx_ * 0.5, bz + fz_ * 0.5])], 1.0, 0.95) * (0.75 + 0.25 * np.sin(u * math.pi)))
    W = np.maximum(W, f.path(f.wobbly((mx / Lm * 2.4, mz / Lm * 2.4), (mx + fx_ * 2, mz + fz_ * 2), rng.uniform(-0.3, 0.3)), 0.75, 0.95))   # one path from the fire to it
    if L.get("entry"):                                           # where the jeep track enters; optional (the exporter does not require it)
        ex, ez = L["entry"]; Le = math.hypot(ex, ez)
        W = np.maximum(W, f.path(f.wobbly((ex / Le * 2.6, ez / Le * 2.6), (ex * 1.05, ez * 1.05), rng.uniform(-0.4, 0.4)), 0.65, 0.9))
    WET = []                                                     # low spots on the paths where water stands: darker, damp soil
    if glade:                                                    # the footpath to the sloths' glade, and on to it from the fire
        gx, gz = glade[0]; Lg = math.hypot(gx, gz)
        W = np.maximum(W, f.path(f.wobbly((gx / Lg * 2.4, gz / Lg * 2.4), glade[0], 0.3) + [np.array(p) for p in glade], 0.7, 0.95))   # well trodden: the sloths' tree is down it
        WET.append((gx / Lg * (RC - 1.4), gz / Lg * (RC - 1.4), 0.75))
    tx, tz = L["tent"]; Lt = math.hypot(tx, tz)                  # tent door to the fire
    W = np.maximum(W, f.path(f.wobbly((tx / Lt * (Lt - 1.7), tz / Lt * (Lt - 1.7)), (tx / Lt * 2.4, tz / Lt * 2.4), 0.2), 0.6, 0.9))
    t = [p for p in L["track"] if math.hypot(*p) < R + 1]        # the jeep's tyres wore the grass along its track
    if len(t) > 1:                                               # two ruts with a grass strip down the middle (forest-ground note, 3)
        T = np.array(t, float); d = np.gradient(T, axis=0); d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9; nrm = np.stack([-d[:, 1], d[:, 0]], 1)
        for k in (-0.62, 0.62): W = np.maximum(W, f.path(list(T + nrm * k), 0.42, 0.85))
    return W, WET


def soil(f, W, WET):
    """The soil colour (N x N x 3, 0..1), bare (how much of each pixel is bare ground) and ash (round the fire)."""
    R, X, Z, rf = f.R, f.X, f.Z, f.rf
    n_mid, n_fine, n_grain = f.n_mid, f.n_fine, f.n_grain
    # bare ground: a hard-ish threshold on noisy wear, then grain, so edges break into trampled patches and tufts survive in the dirt
    Wn = W + 0.22 * (n_mid - 0.5) + 0.28 * (n_fine - 0.5) + 0.18 * (n_grain - 0.5)
    bare = ss(0.42, 0.56, Wn)
    bare *= 1 - 0.85 * (ss(0.72, 0.8, n_grain) * (1 - ss(0.75, 0.95, W)))        # surviving grass tufts in the lighter-worn dirt
    bare *= 1 - ss(R - 1.2, R - 0.2, rf)
    wetS = np.zeros_like(W)
    for wx, wz, wr in WET: wetS = np.maximum(wetS, 1 - ss(wr * 0.35, wr, np.hypot(X - wx, Z - wz) + 0.35 * (n_mid - 0.5)))
    dusty, damp, dark = np.array([0.56, 0.46, 0.35]), np.array([0.45, 0.35, 0.26]), np.array([0.30, 0.23, 0.17])
    m = ss(0.15, 0.85, 0.6 * f.n_col + 0.4 * f.n_col2)[..., None]
    col = damp * (1 - m) + dusty * m
    col = col * (0.94 + 0.12 * n_fine[..., None])                                   # mottling
    col = col * (1 - 0.18 * (1 - ss(0.45, 0.85, W)))[..., None] + dark * 0.18 * (1 - ss(0.45, 0.85, W))[..., None]   # darker, richer at the grass edge
    soot = ((1 - ss(1.1, 2.7, rf + 0.6 * (n_mid - 0.5))) * 0.55)[..., None]
    col = col * (1 - soot) + np.array([0.24, 0.21, 0.19]) * soot
    ash = 1 - ss(0.85, 1.45, rf + 0.35 * (n_fine - 0.5))
    ashc = np.array([0.50, 0.485, 0.46]) * (0.85 + 0.3 * n_grain[..., None])   # grey ash, not near white (review R2-193)
    # charcoal: soft-edged smudges (a wide threshold, not hard dots), gathered toward the fire stones and the inner ring,
    # blended at most 70% toward a brown-grey, so it reads as char on ash instead of black polka dots (review R2-193)
    inner = 1 - ss(0.45, 1.25, rf)
    char = (ss(0.6, 0.85, n_grain + 0.12 * (inner - 0.5)) * ash * (0.35 + 0.65 * inner) * 0.7)[..., None]
    col = col * (1 - ash[..., None]) + ashc * ash[..., None]
    col = col * (1 - char) + np.array([0.12, 0.10, 0.09]) * char
    col = col * (0.93 + 0.14 * n_grain[..., None])                                 # fine grain
    col = col * (1 + 0.07 * ss(0.85, 0.98, W))[..., None]                           # packed paler in the middle of the paths
    col = col * (1 - 0.38 * wetS * (1 - ash))[..., None]                            # damp where water stands
    return col, bare, ash, wetS


def litter(f, L, col, bare, ash):
    """Pebbles, twigs and fallen leaves drawn into the soil colour; the kicked-aside pebbles and the leaves also mark the
    wear image as bare. Returns (soil image, wear image)."""
    R, N, RC, rng, n_big = f.R, f.N, L["RC"], f.rng, f.n_big
    img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8), "RGB")
    cov = Image.fromarray((bare * 255).astype(np.uint8), "L")
    dr, dc = ImageDraw.Draw(img), ImageDraw.Draw(cov)
    px = lambda x, z: ((x + R) / (2 * R) * N, (z + R) / (2 * R) * N)
    S = N / (2 * R)                                              # pixels per metre
    # pebbles in the dirt, with a little shade on the side away from the sun (sun from -x, +z)
    for _ in range(int(2 * R * 2 * R * 5)):
        x, z = rng.uniform(-R, R, 2); i, j = int((z + R) / (2 * R) * N), int((x + R) / (2 * R) * N)
        if bare[min(i, N - 1), min(j, N - 1)] < 0.6 or ash[min(i, N - 1), min(j, N - 1)] > 0.3: continue
        r = rng.uniform(0.006, 0.02) * S; cx, cy = px(x, z); g = int(rng.uniform(105, 175)); c = (g, int(g * 0.97), int(g * 0.92))
        dr.ellipse([cx - r + r * 0.35, cy - r * 0.8 - r * 0.3, cx + r + r * 0.35, cy + r * 0.8 - r * 0.3], fill=(55, 42, 32))
        dr.ellipse([cx - r, cy - r * 0.8, cx + r, cy + r * 0.8], fill=c)
    # pebbles kicked aside: more of them along the edges of the paths and the worn ground
    for _ in range(int(2 * R * 2 * R * 6)):
        x, z = rng.uniform(-R, R, 2); i, j = int((z + R) / (2 * R) * N), int((x + R) / (2 * R) * N)
        b = bare[min(i, N - 1), min(j, N - 1)]
        if not (0.3 < b < 0.8) or ash[min(i, N - 1), min(j, N - 1)] > 0.3: continue
        r = rng.uniform(0.008, 0.026) * S; cx, cy = px(x, z); g = int(rng.uniform(110, 180)); c = (g, int(g * 0.97), int(g * 0.9))
        dr.ellipse([cx - r + r * 0.35, cy - r * 0.8 - r * 0.3, cx + r + r * 0.35, cy + r * 0.8 - r * 0.3], fill=(55, 42, 32))
        dr.ellipse([cx - r, cy - r * 0.8, cx + r, cy + r * 0.8], fill=c); dc.ellipse([cx - r, cy - r * 0.8, cx + r, cy + r * 0.8], fill=255)
    # twigs
    for _ in range(int(2 * R * 2 * R * 0.5)):
        x, z = rng.uniform(-R, R, 2); i, j = int((z + R) / (2 * R) * N), int((x + R) / (2 * R) * N)
        if math.hypot(x, z) < 1.3 or bare[min(i, N - 1), min(j, N - 1)] < 0.3: continue
        a0, l = rng.uniform(0, math.pi), rng.uniform(0.08, 0.3) * S; cx, cy = px(x, z); ex, ey = cx + math.cos(a0) * l, cy + math.sin(a0) * l
        dr.line([cx, cy, ex, ey], fill=(70, 50, 34), width=max(1, int(0.008 * S)))
        if rng.random() < 0.5: dr.line([(cx + ex) / 2, (cy + ey) / 2, (cx + ex) / 2 + math.cos(a0 + 0.6) * l * 0.3, (cy + ey) / 2 + math.sin(a0 + 0.6) * l * 0.3], fill=(70, 50, 34), width=1)
    # fallen leaves: thick at the forest edge, drifted against things, sparse in the open, none in the ash
    LEAF = [(150, 92, 40), (178, 126, 54), (122, 74, 36), (160, 110, 60), (104, 82, 44), (140, 128, 70)]
    for _ in range(int(2 * R * 2 * R * 9)):
        x, z = rng.uniform(-R, R, 2); r0 = math.hypot(x, z)
        if r0 > R - 0.1 or r0 < 1.6: continue
        i, j = int((z + R) / (2 * R) * N), int((x + R) / (2 * R) * N)
        edge = ss(RC - 3.0, RC - 0.3, r0); near = max([1 - ss(0.2, 1.2, math.hypot(x - sx, z - sz) - sr) for sx, sz, sr in L["spots"]] + [0])
        p = 0.06 + 0.7 * edge + 0.3 * near * bare[i, j] + 0.25 * n_big[i, j] * edge
        if rng.random() > p: continue
        cx, cy = px(x, z); ln, wd, a0 = rng.uniform(0.025, 0.055) * S, rng.uniform(0.012, 0.025) * S, rng.uniform(0, math.pi * 2)
        c = LEAF[rng.integers(len(LEAF))]; k = rng.uniform(0.8, 1.1); c = tuple(int(v * k) for v in c)
        pts = [(cx + math.cos(a0) * ln * math.cos(t) - math.sin(a0) * wd * math.sin(t) * (1 - 0.3 * math.cos(t)),
                cy + math.sin(a0) * ln * math.cos(t) + math.cos(a0) * wd * math.sin(t) * (1 - 0.3 * math.cos(t))) for t in np.linspace(0, 2 * math.pi, 10)]
        dr.polygon(pts, fill=c); dc.polygon(pts, fill=255)
        dr.line([pts[0], pts[5]], fill=tuple(int(v * 0.75) for v in c), width=1)
    return img, cov


def save(f, L, props, W, img, cov, bare, ash, wetS):
    """The lushness and wet layers, then the soil JPEG and the wear mask PNG into models/."""
    X, Z, N, RC = f.X, f.Z, f.N, L["RC"]
    lush = 0.5 + 0.7 * (f.n_big - 0.5) + 0.3 * ss(RC - 2.0, RC - 0.3, f.rf) - 0.35 * ss(0.15, 0.45, W) * (1 - bare)
    wet = np.zeros_like(W)
    if L.get("entry"):
        ex, ez = L["entry"]; wet = np.maximum(wet, 0.6 * (1 - ss(0.3, 1.4, np.hypot(X - ex * 0.95, Z - ez * 0.95) + 0.5 * (f.n_mid - 0.5))))
    img = img.filter(ImageFilter.SMOOTH)
    img.save(os.path.join(OUT, f"camp_ground_{props}.jpg"), quality=86, optimize=True)
    covA = np.asarray(cov).astype(np.float32) / 255
    mask = np.stack([covA, np.clip(lush, 0, 1), np.maximum(np.maximum(ash, wet), wetS)], -1)
    Image.fromarray((mask * 255).astype(np.uint8), "RGB").resize((N // 2, N // 2), Image.BILINEAR).save(os.path.join(OUT, f"camp_ground_{props}_mask.png"), optimize=True)
    for name in (f"camp_ground_{props}.jpg", f"camp_ground_{props}_mask.png"): print(name, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--props", default="picked"); ap.add_argument("--size", type=int, default=2048); ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    L = json.load(open(os.path.join(ROOT, "props/shadow", f"layout_{a.props}.json")))
    f = Field(L["RR"], a.size, a.seed)
    glade = [p for p in L["glade"] if math.hypot(*p) < f.R + 0.5]   # the glade path's points on the ground disc
    W, WET = wear(f, L, glade)
    col, bare, ash, wetS = soil(f, W, WET)
    img, cov = litter(f, L, col, bare, ash)
    save(f, L, a.props, W, img, cov, bare, ash, wetS)


if __name__ == "__main__":
    main()
