// Summit Cabin trees, logs and rocks: one fixed layout from the land's tiles, drawn as full trees near you, camera-facing cards
// further out and colour beyond. placeThings(x, z) refills the instanced buckets after you walk 12 m; cullWedges hides those out of view.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, CL, HUT, JEEP, LAKE, LOOK_TRAIL, R, TOP, TOWER, TREE_S, fbm, forestAt, hash, height, isPhone, mulberry, onIce, polyNear, roadNear, sstep, trailDist } from './land.js';
import { camera, hazed, me, renderer, scene, sunDir } from './core.js';
import { CARD_R, NEAR, tmpC, uTreeCol, uTreeK } from './terrain.js';

// ---------------------------------------------------------------- trees, logs and rocks: one fixed layout, drawn as real trees near, cards further, colour far away
// Built the way the cozy camp builds its forest: few triangles, with the detail painted into one texture (snowy spruce boughs,
// pine tufts, bare birch twigs, birch and pine bark) and the shading baked into vertex colours (dark near the trunk and low
// down, bright at the tips). Four styles: Norway spruce (most of the forest), Scots pine (orange bark, flat snowy pads on top,
// more on high ground), bare birch (by the lake and at forest edges) and dead grey snags (more toward the treeline).
// Trees stand on a jittered 12 m grid, worked out once per 256 m tile and kept. Near you a tree is its full model, further out
// the same tree is a 2-triangle card painted from that model, and from 0.68 to 0.85 km (0.56 to 0.7 km on phones), where the haze is already thick, the cards dither out into the colour painted into the ground. No tree is ever skipped nearer than that.
export const TCELL = 12, ATLAS = 1024;
export const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
// the atlas: [x, y, w, h] in canvas pixels
const RG = { bough: [0, 0, 512, 512], tuft: [512, 0, 512, 512], twig: [0, 512, 512, 512], birch: [512, 512, 128, 512], bark: [640, 512, 128, 512], core: [768, 512, 256, 512] };
const treeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = ATLAS; const g = c.getContext('2d'), r = mulberry(41), RR = (a, b) => a + r() * (b - a);
  // painted like the cozy camp's foliage: chunky rounded clumps, dark underneath and light on top, and snow lying on them in
  // soft cream pillows with lavender shade, instead of fine needles
  const NEEDLE = ['#142320', '#1b302b', '#243c34', '#304c40', '#42604d'], SNOW = ['#fffaf2', '#f6efe6', '#ece6ef'];
  const lobe = (x, y, rr, n) => { g.beginPath(); for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + RR(-0.3, 0.3), d = rr * RR(0.35, 0.6); g.moveTo(x + Math.cos(a) * d + rr * 0.55, y + Math.sin(a) * d); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr * RR(0.45, 0.62), 0, 7); } g.fill(); };
  const clump = (x, y, rr) => { g.fillStyle = NEEDLE[0]; lobe(x, y + rr * 0.18, rr, 6); g.fillStyle = NEEDLE[1 + ((r() * 2) | 0)]; lobe(x, y, rr * 0.9, 6); g.fillStyle = NEEDLE[3]; lobe(x - rr * 0.12, y - rr * 0.2, rr * 0.55, 4);
    g.fillStyle = NEEDLE[4]; g.globalAlpha = 0.8; lobe(x - rr * 0.2, y - rr * 0.32, rr * 0.28, 3); g.globalAlpha = 1; };
  const pillow = (x, y, rx, ry) => { g.fillStyle = 'rgba(150,140,185,.55)'; g.beginPath(); g.ellipse(x + rx * 0.08, y + ry * 0.35, rx * 1.02, ry * 0.95, 0, 0, 7); g.fill();
    g.fillStyle = SNOW[(r() * 3) | 0]; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.5, ry * 0.45, 0, 0, 7); g.fill(); };
  // spruce bough, seen from above: a tapering fan of clumps from the trunk (left) to the tip (right), a snow pillow along its back
  { const [X, Y, W, H] = RG.bough, cy = Y + H / 2; g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
    const halfAt = (t) => H * 0.4 * (1 - t * 0.7);
    for (let i = 0; i < 70; i++) { const t = r() ** 0.8, hw = halfAt(t), rr = RR(26, 44) * (1 - t * 0.45); clump(X + 30 + t * (W - 90), cy + RR(-hw, hw) * 0.85, rr); }
    for (let i = 0; i < 22; i++) { const t = (i + 0.5) / 22, hw = halfAt(t); clump(X + 30 + t * (W - 90), cy + RR(-hw, hw) * 0.4, RR(30, 46) * (1 - t * 0.45)); }
    for (let i = 0; i < 16; i++) { const t = r() ** 0.9, hw = halfAt(t) * 0.75; pillow(X + 40 + t * (W - 120), cy + RR(-hw, hw), RR(18, 32) * (1 - t * 0.5), RR(10, 17) * (1 - t * 0.4)); }
    g.restore(); }
  // Scots pine tuft: a round cushion of clumps with a thick cap of snow
  { const [X, Y, W, H] = RG.tuft, cx = X + W / 2, cy = Y + H / 2; g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
    for (let i = 0; i < 46; i++) { const a = RR(0, 6.283), d = 175 * Math.sqrt(r()); clump(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, RR(34, 58)); }
    g.restore(); }
  // bare twigs fanning up and out from the bottom middle (tinted per tree by its vertex colours)
  { const [X, Y, W, H] = RG.twig; g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip(); g.lineCap = 'round';
    const twig = (x, y, a, l, w, d) => { const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l; g.strokeStyle = '#6e5f5c'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + ex) / 2 + RR(-6, 6), (y + ey) / 2 + RR(-6, 6), ex, ey); g.stroke();
      if (d > 0) for (let k = 0; k < (d > 3 ? 3 : 2); k++) twig(ex, ey, a + RR(-0.65, 0.65), l * RR(0.6, 0.78), w * 0.68, d - 1); };
    for (let k = 0; k < 4; k++) twig(X + W / 2 + RR(-10, 10), Y + H - 4, -Math.PI / 2 + RR(-0.7, 0.7), H * 0.3, 7, 5);
    g.restore(); }
  // birch bark: chalk white, black lenticel dashes, dark rough base
  { const [X, Y, W, H] = RG.birch; g.fillStyle = '#ece8e0'; g.fillRect(X, Y, W, H);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(25,22,24,${RR(0.5, 0.95)})`; g.fillRect(X + RR(0, W), Y + RR(0, H), RR(6, 40), RR(1.5, 4)); }
    const gr = g.createLinearGradient(0, Y + H * 0.75, 0, Y + H); gr.addColorStop(0, 'rgba(30,26,26,0)'); gr.addColorStop(1, 'rgba(30,26,26,.9)'); g.fillStyle = gr; g.fillRect(X, Y, W, H);
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(20,18,18,.8)'; g.beginPath(); g.ellipse(X + RR(0, W), Y + H * RR(0.8, 1), RR(4, 14), RR(6, 20), 0, 0, 7); g.fill(); } }
  // conifer bark: grey-brown furrows, turning to thin orange bark toward the top (the top shows on the pines)
  { const [X, Y, W, H] = RG.bark; const gr = g.createLinearGradient(0, Y, 0, Y + H); gr.addColorStop(0, '#b0683c'); gr.addColorStop(0.3, '#8a5434'); gr.addColorStop(0.45, '#4a3a30'); gr.addColorStop(1, '#3a2f29'); g.fillStyle = gr; g.fillRect(X, Y, W, H);
    for (let i = 0; i < 90; i++) { const x = X + RR(0, W), y = Y + RR(H * 0.35, H); g.strokeStyle = `rgba(18,14,12,${RR(0.4, 0.8)})`; g.lineWidth = RR(1.5, 4); g.beginPath(); g.moveTo(x, y); g.lineTo(x + RR(-3, 3), y + RR(20, 70)); g.stroke(); }
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(230,170,120,${RR(0.2, 0.5)})`; g.fillRect(X + RR(0, W), Y + RR(0, H * 0.35), RR(8, 30), RR(1, 3)); } }
  // the full body of a spruce: a field of clumps with pockets of snow, wrapped round a cone (seamless left to right)
  { const [X, Y, W, H] = RG.core; g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip(); g.fillStyle = NEEDLE[0]; g.fillRect(X, Y, W, H);
    const both = (f) => (x, ...a) => { f(x, ...a); f(x - W, ...a); f(x + W, ...a); };
    const cl = both(clump), pl = both(pillow);
    for (let i = 0; i < 150; i++) cl(X + RR(0, W), Y + RR(-10, H + 10), RR(18, 30));
    g.restore(); }
  // Long Dark style sprays, seen from above: a twig from the trunk (left) to the tip (right) with side shoots, each shoot
  // painted as overlapping brush strokes of needles, dark to light, the edge left ragged so the cut-out reads as needles;
  // heavy lumps of snow along the middle with cool blue shade under them. o: w half width, taper, n shoots, nl needle
  // length, up (shoot angle), snow lumps, col [back, mid..., light...]
  const spray = ([X, Y, W, H], o) => { g.save(); g.clearRect(X, Y, W, H); g.beginPath(); g.rect(X, Y, W, H); g.clip(); g.lineCap = 'round';
    const cy = Y + H / 2, half = (t) => H * o.w * Math.min(1, 0.35 + t / 0.15) * (1 - t) ** o.taper, at = (t) => [X + 8 + t * (W - 16), cy + Math.sin(t * 4 + 1) * 5];
    const strokes = (layer, cols, wid, kLen) => { for (let i = 0; i < o.n; i++) { const t = (i + 0.5) / o.n, [sx, sy] = at(t), side = i % 2 ? 1 : -1, hw = half(t), ang = o.up * RR(0.8, 1.2), L = Math.min(hw / Math.sin(ang), W * (1 - t) + 30);
        for (let k = 0; k < o.per; k++) { const f = r() ** 0.8, bx = sx + Math.cos(ang) * L * f, by = sy + side * Math.sin(ang) * L * f, nl = o.nl * kLen * RR(0.6, 1.1) * (1 - 0.4 * f) * (0.6 + 0.4 * (1 - t));
          for (const sd of [-1, 1]) { const a = side * ang + sd * RR(0.5, 1.1); g.strokeStyle = cols[(r() * cols.length) | 0]; g.lineWidth = wid * RR(0.7, 1.2); g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * nl, by + Math.sin(a) * nl); g.stroke(); } } } };
    g.strokeStyle = o.col[0]; g.lineWidth = 7; g.beginPath(); g.moveTo(...at(0)); for (let t = 0.05; t <= 1.001; t += 0.05) g.lineTo(...at(t)); g.stroke();
    strokes(0, [o.col[0]], 7, 1.05); strokes(1, o.col.slice(1, 4), 5, 0.95); strokes(2, o.col.slice(3), 3.5, 0.7);
    // the snow: one continuous cap along the twig, its edges lumpy, blue shade under its lower edge, a few bright lumps on top
    const cap = (dy, k) => { const top = [], bot = []; for (let i = 0; i <= 40; i++) { const t = 0.03 + (i / 40) * o.reach, [sx, sy] = at(t), hw = half(t) * o.sk * (1 - t / o.reach) ** 0.5;
        top.push([sx, sy - hw * RR(0.35, 0.6) * k + dy]); bot.push([sx, sy + hw * RR(0.25, 0.45) * k + dy]); }
      g.beginPath(); g.moveTo(...top[0]); for (const q of top) g.lineTo(...q); for (const q of bot.reverse()) g.lineTo(...q); g.closePath(); g.fill(); };
    g.fillStyle = 'rgba(118,136,170,.8)'; cap(7, 1.05); g.fillStyle = '#e9ecef'; cap(0, 1); g.fillStyle = '#f7f8f8'; cap(-3, 0.6);
    for (let i = 0; i < o.snow; i++) { const t = 0.05 + o.reach * 0.85 * r(), [sx, sy] = at(t), hw = half(t) * o.sk * (1 - t / o.reach) ** 0.5, x = sx + RR(-8, 8), y = sy + RR(-hw, hw) * 0.45, rx = RR(10, 22) * (1 - t * 0.5), ry = rx * RR(0.5, 0.7);
      g.fillStyle = i % 3 ? '#f2f3f3' : 'rgba(118,136,170,.6)'; g.beginPath(); g.ellipse(x, y + (i % 3 ? 0 : ry * 0.6), rx, ry, 0, 0, 7); g.fill(); }
    g.restore(); };
  spray(RG.bough, { w: 0.46, taper: 0.55, n: 30, per: 14, nl: 34, up: 0.95, snow: 30, sk: 1, reach: 0.82, col: ['#0d1917', '#16282a', '#1b302b', '#22392f', '#2f4a3c', '#3e5b47'] });
  spray(RG.tuft, { w: 0.44, taper: 0.4, n: 18, per: 18, nl: 52, up: 0.7, snow: 18, sk: 0.9, reach: 0.7, col: ['#141c15', '#1f2c21', '#273727', '#30432c', '#43553a', '#59693f'] });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
})();
// geometry helpers: every tree is modelled in a unit box (height 1, radius under 0.5) and scaled per instance
function treeBuilder() {
  const P = [], N = [], UV = [], C = [];
  const uvOf = (reg, u, v) => [(reg[0] + u * reg[2]) / ATLAS, 1 - (reg[1] + (1 - v) * reg[3]) / ATLAS];
  const SN = [];   // how much snow lies at each vertex (0 to 1); the shader turns it into snow that follows the painted clumps
  const vert = (p, n, reg, u, v, col, sn = 0) => { P.push(...p); N.push(...n); UV.push(...uvOf(reg, u, v)); C.push(col.r, col.g, col.b); SN.push(sn); };
  const tri = (a, b, c) => { for (const x of [a, b, c]) vert(...x); };
  const B = {
    // a tapered trunk of `sides` faces in `segs` rings, bark from region `reg` (v from v0 to v1), leaning by `lean` at the top
    trunk(r0, r1, y0, y1, sides, segs, reg, v0, v1, tint, lean = [0, 0], ao = [0.55, 1]) {
      const ring = (k) => { const t = k / segs, y = y0 + (y1 - y0) * t, rr = r0 + (r1 - r0) * t, ox = lean[0] * t * t, oz = lean[1] * t * t;
        return Array.from({ length: sides + 1 }, (_, j) => { const a = (j / sides) * Math.PI * 2; return [[ox + Math.cos(a) * rr, y, oz + Math.sin(a) * rr], [Math.cos(a), 0.15, Math.sin(a)], j / sides, v0 + (v1 - v0) * t]; }); };
      for (let k = 0; k < segs; k++) { const A = ring(k), Bv = ring(k + 1), c0 = tmpC.copy(tint).multiplyScalar(ao[0] + (ao[1] - ao[0]) * (k / segs)).clone(), c1 = tmpC.copy(tint).multiplyScalar(ao[0] + (ao[1] - ao[0]) * ((k + 1) / segs)).clone();
        for (let j = 0; j < sides; j++) { const a = [A[j][0], A[j][1], reg, A[j][2], A[j][3], c0], b = [A[j + 1][0], A[j + 1][1], reg, A[j + 1][2], A[j + 1][3], c0], c = [Bv[j + 1][0], Bv[j + 1][1], reg, Bv[j + 1][2], Bv[j + 1][3], c1], d = [Bv[j][0], Bv[j][1], reg, Bv[j][2], Bv[j][3], c1];
          tri(a, d, c); tri(a, c, b); } }
    },
    // a bough: a strip of 2 segments from `base` outward along angle `a`, drooping, front face up; shading dark at the trunk
    bough(base, a, len, wid, droop, reg, lit, uOff = 0) {
      const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx, pts = [];
      for (let k = 0; k <= 2; k++) { const t = k / 2, w = wid * (k === 0 ? 0.35 : k === 1 ? 0.55 : 0.4), x = base[0] + dx * len * t, y = base[1] + 0.25 * droop * t - droop * t * t * 1.25 + droop * 0.0, z = base[2] + dz * len * t;
        const n = [dx * 0.75, 0.66, dz * 0.75], col = tmpC.setScalar(lit * (0.5 + 0.5 * t)).clone();
        pts.push([[x - sx * w, y, z - sz * w], n, reg, uOff + t * (1 - uOff), 0, col], [[x + sx * w, y, z + sz * w], n, reg, uOff + t * (1 - uOff), 1, col]); }
      for (let k = 0; k < 2; k++) { const L0 = pts[k * 2], R0 = pts[k * 2 + 1], L1 = pts[k * 2 + 2], R1 = pts[k * 2 + 3]; tri(L0, R0, R1); tri(L0, R1, L1); }
    },
    // a painted spray (Long Dark style): a 2-segment card from `base` outward along angle a, drooping (negative droop curls
    // it up), rolled round its length by `roll` so that from the side the layers read as a ragged fringe, not a line. 4 triangles
    spray(base, a, len, wid, droop, roll, reg, lit, sn = 0.25, tint = WHITE) {
      const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx, cr = Math.cos(roll), sr = Math.sin(roll), wv = [sx * cr, sr, sz * cr], pts = [];
      const n = [dx * 0.35 - sx * sr, cr, dz * 0.35 - sz * sr];
      for (let k = 0; k <= 2; k++) { const t = k / 2, w = (wid / 2) * (k === 2 ? 0.85 : 1), x = base[0] + dx * len * t * (1 - 0.15 * Math.abs(droop) * t), y = base[1] + 0.2 * droop * t - droop * t * t * 1.2, z = base[2] + dz * len * t * (1 - 0.15 * Math.abs(droop) * t);
        const col = tmpC.copy(tint).multiplyScalar(lit * (0.5 + 0.5 * t)).clone();
        pts.push([[x - wv[0] * w, y - wv[1] * w, z - wv[2] * w], n, reg, t, 0, col, sn], [[x + wv[0] * w, y + wv[1] * w, z + wv[2] * w], n, reg, t, 1, col, sn]); }
      for (let k = 0; k < 2; k++) { const L0 = pts[k * 2], R0 = pts[k * 2 + 1], L1 = pts[k * 2 + 2], R1 = pts[k * 2 + 3]; tri(L0, R0, R1); tri(L0, R1, L1); }
    },
    // a flat pad (one quad), centred at c, tilted outward, front face up
    pad(c, a, size, tilt, reg, lit) {
      const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx, h = size / 2, ty = Math.sin(tilt) * h, tc = Math.cos(tilt);
      const n = [dx * Math.sin(tilt), Math.cos(tilt), dz * Math.sin(tilt)], col = tmpC.setScalar(lit).clone();
      const P0 = [c[0] - dx * h * tc - sx * h, c[1] + ty, c[2] - dz * h * tc - sz * h], P1 = [c[0] - dx * h * tc + sx * h, c[1] + ty, c[2] - dz * h * tc + sz * h], P2 = [c[0] + dx * h * tc + sx * h, c[1] - ty, c[2] + dz * h * tc + sz * h], P3 = [c[0] + dx * h * tc - sx * h, c[1] - ty, c[2] + dz * h * tc - sz * h];
      const v = (p, u, w) => [p, n, reg, u, w, col, 0.62]; tri(v(P0, 0, 0), v(P1, 0, 1), v(P2, 1, 1)); tri(v(P0, 0, 0), v(P2, 1, 1), v(P3, 1, 0));
    },
    // one drooping tier of a spruce: from a point on the trunk, out through a raised middle ring to a rim of N vertices that
    // alternate between bough tips (out and down) and notches (in and up), so the edge is soft and scalloped. 3N triangles.
    // Nothing is regular: each bough tip has its own length and droop, notches vary in depth, the tier sits a little off the
    // trunk and tilts, so no two tiers (and, with the two shapes and per-tree widths, no two trees) look alike.
    tier(y0, ya, R, N, turn, lit, rr, off = [0, 0], tilt = [0, 0]) {
      const ring = [], mid = [], first = [], tl = (x, z) => tilt[0] * x + tilt[1] * z;
      for (let j = 0; j < N; j++) { const tip = j % 2 === 0; first.push(tip ? [0.78 + 0.42 * rr(), 0.6 + 0.9 * rr()] : [0.62 + 0.25 * rr(), 0]); }
      for (let jj = 0; jj <= N; jj++) { const j = jj % N, a = turn + (jj / N) * Math.PI * 2 + (j % 2 ? (rr() - 0.5) * 0.15 : 0), tip = j % 2 === 0, [lenK, dro] = first[j], rad = R * lenK, k = 1.25;
        const nl = Math.hypot(k, 1), nrm = [(Math.cos(a) * k) / nl, 1 / nl, (Math.sin(a) * k) / nl], x = off[0] + Math.cos(a) * rad, z = off[1] + Math.sin(a) * rad;
        ring.push([[x, (tip ? y0 - 0.04 * dro * R / 0.5 : y0 + 0.025) + tl(x, z), z], nrm, RG.core, jj / N, 0, tmpC.setScalar(lit * (tip ? 1 : 0.6)).clone(), tip ? 0.45 + 0.25 * rr() : 0.18]);
        const mr = rad * (0.48 + 0.1 * rr()), mx = off[0] * 0.6 + Math.cos(a) * mr, mz = off[1] * 0.6 + Math.sin(a) * mr, nl2 = Math.hypot(0.7, 1);
        mid.push([[mx, ya - (ya - y0) * (0.34 + 0.12 * rr()) + tl(mx, mz) * 0.6, mz], [(Math.cos(a) * 0.7) / nl2, 1 / nl2, (Math.sin(a) * 0.7) / nl2], RG.core, jj / N, 0.55, tmpC.setScalar(lit * 0.9).clone(), 0.58 + 0.3 * rr()]); }
      for (let j = 0; j < N; j++) { const top = [[off[0] * 0.3, ya, off[1] * 0.3], [0, 1, 0], RG.core, (j + 0.5) / N, 1, tmpC.setScalar(lit).clone(), 0.85];
        tri(top, mid[j + 1], mid[j]); tri(mid[j], mid[j + 1], ring[j + 1]); tri(mid[j], ring[j + 1], ring[j]); }
    },
    // a soft round puff of needles (a squashed icosahedron with smooth normals), snow on its top: 20 triangles
    puff(c, rx, ry, rz, lit) {
      const g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position;   // already one vertex per corner
      for (let i = 0; i < p.count; i += 3) { const vs = [0, 1, 2].map((k) => { const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k), nl = Math.hypot(x, y, z);
          return [[c[0] + x * rx, c[1] + y * ry, c[2] + z * rz], [x / nl, y / nl, z / nl], RG.core, 0.5 + Math.atan2(z, x) / 6.283, 0.5 + y * 0.45, tmpC.setScalar(lit * (0.62 + 0.38 * (y / nl * 0.5 + 0.5))).clone(), sstep(-0.35, 0.45, y / nl)]; });
        tri(vs[0], vs[1], vs[2]); }
    },
    // an upright card standing on the trunk axis and reaching outward along angle a (twigs), both faces shown
    fan(base, a, w, h, reg, tint) {
      const dx = Math.cos(a), dz = Math.sin(a), n = [dx, 0.3, dz], lo = tmpC.copy(tint).multiplyScalar(0.7).clone(), hi = tint.clone();
      const p = (s, t) => [base[0] + dx * (s - 0.5) * w + dx * w * 0.45, base[1] + t * h, base[2] + dz * (s - 0.5) * w + dz * w * 0.45];
      const v = (s, t) => [p(s, t), n, reg, s, t, t < 0.5 ? lo : hi]; tri(v(0, 0), v(1, 0), v(1, 1)); tri(v(0, 0), v(1, 1), v(0, 1));
    },
    geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N.map((x, i) => x), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('snow', new THREE.Float32BufferAttribute(SN, 1)); g.computeBoundingSphere(); return g; },
  };
  return B;
}
export const WHITE = new THREE.Color(1, 1, 1);
// a snowy fir in the Long Dark's manner: a dark body you can't see through, ringed by T whorls of drooping painted sprays,
// long at the bottom and short at the top, each whorl turned, the sprays rolled and uneven, and a pointed tip
function firGeo(seed, T, W0) { const b = treeBuilder(), r = mulberry(seed);
  b.trunk(0.022, 0.008, -0.05, 0.3, 5, 1, RG.bark, 0.0, 0.4, WHITE);
  b.trunk(W0 * 0.3, 0.012, 0.1, 0.9, 6, 2, RG.core, 0, 1, new THREE.Color(0.5, 0.52, 0.5), [0, 0], [0.45, 0.85]);
  for (let k = 0; k < T; k++) { const t = k / T, y = 0.1 + t * 0.8 + (r() - 0.5) * 0.03, R0 = W0 * (1 - t) ** 0.9 * (0.85 + 0.3 * r()) + 0.05, n = Math.max(4, Math.round(7 - t * 3.5)), turn = r() * 6.283;
    for (let j = 0; j < n; j++) { const a = turn + (j / n) * 6.283 + (r() - 0.5) * 0.6, len = R0 * (0.8 + 0.35 * r());
      b.spray([Math.cos(a) * 0.012, y, Math.sin(a) * 0.012], a, len, len * 0.95, len * (0.3 + 0.35 * (1 - t)) * (0.7 + 0.6 * r()), (r() - 0.5) * 1.1, RG.bough, 0.5 + 0.5 * t, 0.2 + 0.15 * t); } }
  b.tier(0.86, 1.0, 0.075, 6, r() * 6.283, 1, r);
  return b.geo(); }
export const TREES = {   // name: [geometry, share of the far forest's look (filled in by the bake)]
  spruce: firGeo(11, 8, 0.46),
  spruce2: firGeo(29, 9, 0.38),
  pine: (() => { const b = treeBuilder(), r = mulberry(12);
    b.trunk(0.024, 0.008, -0.05, 0.94, 6, 3, RG.bark, 0.0, 1.0, WHITE, [0.04, -0.02]);
    // a tall pine: bare trunk, then a loose open crown of long-needled sprays in uneven whorls, tips curling up
    for (let k = 0; k < 5; k++) { const t = k / 5, y = 0.56 + t * 0.36 + (r() - 0.5) * 0.04, n = k < 3 ? 4 : 3, turn = r() * 6.283, R0 = 0.3 * (1 - t * 0.7) + 0.04, ox = 0.04 * (y / 0.94) ** 2, oz = -0.02 * (y / 0.94) ** 2;
      for (let j = 0; j < n; j++) { const a = turn + (j / n) * 6.283 + (r() - 0.5) * 0.9, len = R0 * (0.7 + 0.5 * r());
        b.spray([ox + Math.cos(a) * 0.01, y, oz + Math.sin(a) * 0.01], a, len, len * 0.85, -len * (0.1 + 0.25 * r()), (r() - 0.5) * 1.2, RG.tuft, 0.55 + 0.45 * t, 0.3); } }
    b.tier(0.9, 1.0, 0.06, 6, r() * 6.283, 1, r, [0.04, -0.02]);
    return b.geo(); })(),
  birch: (() => { const b = treeBuilder(), r = mulberry(13), tw = new THREE.Color(0.5, 0.44, 0.5);
    b.trunk(0.018, 0.005, -0.05, 0.86, 5, 3, RG.birch, 0, 1, WHITE, [0.05, 0.03]);
    for (let i = 0; i < 7; i++) { const a = i * 2.39996 + r() * 0.4, y = 0.28 + i * 0.05; b.fan([0.05 * (y / 0.86) ** 2, y, 0.03 * (y / 0.86) ** 2], a, 0.42 - i * 0.02, 0.62 - i * 0.03, RG.twig, tw); }
    return b.geo(); })(),
  snag: (() => { const b = treeBuilder(), g0 = new THREE.Color(0.82, 0.8, 0.8);
    b.trunk(0.026, 0.012, -0.05, 0.78, 5, 2, RG.bark, 0.5, 1.0, new THREE.Color(0.75, 0.72, 0.72));
    for (let i = 0; i < 3; i++) b.fan([0, 0.4 + i * 0.12, 0], i * 2.2 + 0.5, 0.3, 0.26, RG.twig, g0);
    return b.geo(); })(),
};
export const SPECIES = ['spruce', 'pine', 'birch', 'snag', 'spruce2'];
export const bushGeo = (() => { const b = treeBuilder(), r = mulberry(5);   // a low snowy mound of juniper: 12 painted sprays arching out and down from a raised middle, 48 triangles
  for (let i = 0; i < 12; i++) { const hi = i >= 8, a = i * 2.39996 + r() * 0.5, len = hi ? 0.3 + 0.08 * r() : 0.5 + 0.12 * r();
    b.spray([Math.cos(a) * 0.05, hi ? 0.42 : 0.3, Math.sin(a) * 0.05], a, len, len * 1.1, (hi ? 0.25 : 0.4) * (0.8 + 0.4 * r()), (r() - 0.5) * 0.8, RG.bough, hi ? 1 : 0.75, 0.4); }
  return b.geo(); })();
export const logGeo = (() => { const b = treeBuilder(), tint = new THREE.Color(0.9, 0.9, 0.9);   // a fallen trunk along +x, 6 sides, snow on its back: 12 + 8 triangles
  const P = [], s = 6; const g = new THREE.CylinderGeometry(0.5, 0.42, 1, s, 1, false).rotateZ(Math.PI / 2), p = g.attributes.position, n = g.attributes.normal, C = [];
  for (let i = 0; i < p.count; i++) { const top = n.getY(i) > 0.45 && Math.abs(n.getX(i)) < 0.5; tmpC.set(top ? '#fbf7f0' : Math.abs(n.getX(i)) > 0.5 ? '#a07a52' : '#5e4634'); C.push(tmpC.r, tmpC.g, tmpC.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.deleteAttribute('uv'); return g; })();
// the back of a bough or pad (its underside) is shaded and has no snow on it
// and snow lies on the tops: each vertex says how much (attribute snow), and the painted clumps break up its edge, so it sits
// on the bright tops of the clumps and melts into the gaps between them
const underside = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float snow; varying float vSnow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnow = snow;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSnow;').replace('#include <color_fragment>', `#include <color_fragment>
  if (!gl_FrontFacing) { float sn = smoothstep(0.3, 0.6, min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b))); diffuseColor.rgb = mix(diffuseColor.rgb * 0.85, vec3(0.05, 0.11, 0.07), sn); }
  else { float tl = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1)) / max(dot(vColor.rgb, vec3(0.333)), 0.05);
    float sk = smoothstep(0.5, 0.6, vSnow + (tl - 0.2) * 1.1); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.93, 0.89) * (0.72 + 0.28 * vColor.g), sk); }`); };
function bakeCards() {   // the impostors: each near tree drawn once from the side into its own cell of one texture, so the cards match them
  const CW = 256, rt = new THREE.WebGLRenderTarget(CW * SPECIES.length, CW, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }), cam = new THREE.OrthographicCamera(-0.5, 0.5, 1.02, -0.02, -2, 2);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, map: treeTex, alphaTest: 0.5, side: THREE.DoubleSide }); mat.onBeforeCompile = underside;   // plain colours: the scene lights the card like the tree
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  const look = [];
  SPECIES.forEach((name, i) => { const sc2 = new THREE.Scene(); sc2.add(new THREE.Mesh(TREES[name], mat)); rt.viewport.set(i * CW, 0, CW, CW); rt.scissor.set(i * CW, 0, CW, CW); rt.scissorTest = true; renderer.setRenderTarget(rt); renderer.render(sc2, cam);
    const px = new Uint8Array(CW * CW * 4); renderer.readRenderTargetPixels(rt, i * CW, 0, CW, CW, px); let a = 0, r = 0, g = 0, b = 0;
    for (let k = 0; k < px.length; k += 4) { const w = px[k + 3] / 255; a += w; r += px[k] * w; g += px[k + 1] * w; b += px[k + 2] * w; }
    look.push({ fill: a / (CW * CW), col: [r / a / 255, g / a / 255, b / a / 255] }); });
  rt.scissorTest = false; rt.viewport.set(0, 0, rt.width, rt.height); renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1);
  return { tex: rt.texture, look };
}
// the far forest takes the mix of the styles that actually grow there (counted on the first placement)
function farForestLook(count) {
  let a = 0, r = 0, g = 0, b = 0, tot = 0;
  SPECIES.forEach((n, i) => { const w = count[i]; tot += w; const L = CARDS.look[i], fa = w * L.fill; a += fa; r += fa * L.col[0]; g += fa * L.col[1]; b += fa * L.col[2]; });
  if (!tot) return; uTreeCol.value.setRGB(r / a, g / a, b / a);
  // cover per unit cotangent = trees per m² × the card's average filled area (size² × 1.04 × fill); treeCover() holds the rest;
  // 4.5 for the trees' dark sides and overlap, matched by A/B screenshots of cards vs painted forest (porch and a mid slope)
  uTreeK.value = 4.5 * (1 / (TCELL * TCELL)) * 1.04 * (a / tot) * 100;
}
// near trees and far cards overlap for 30 m and swap with a dither (screen-door fade), so no tree pops from one to the other
// the card side shows exactly the pixels the near side drops (complementary screen-door), so mid-swap a tree is whole, never see-through
const fade = (lo, hi, cardSide, outLo = 0, outHi = 0) => (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFade, vOut;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\nvec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float fd0 = length(ip.xz - cameraPosition.xz); vFade = smoothstep(${lo.toFixed(1)}, ${hi.toFixed(1)}, fd0);${cardSide ? '' : ' vFade = 1.0 - vFade;'} vOut = ${outHi ? `1.0 - smoothstep(${outLo.toFixed(1)}, ${outHi.toFixed(1)}, fd0)` : '1.0'};`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade, vOut;')
    .replace('#include <clipping_planes_fragment>', `float sdN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
${cardSide ? 'if (sdN < 1.0 - vFade || sdN > vOut) discard;' : 'if (sdN > vFade * vOut) discard;'}\n#include <clipping_planes_fragment>`);
};
const keepAlpha = (tw, th) => (sh) => {   // mipmaps blur alpha, so far leaves and cards would thin out and the forest would lighten; scale it back up
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `vec2 tx = vMapUv * vec2(${tw.toFixed(1)}, ${th.toFixed(1)}); float lod = max(0.0, 0.5 * log2(max(dot(dFdx(tx), dFdx(tx)), dot(dFdy(tx), dFdy(tx)))));
    diffuseColor.a *= 1.0 + lod * 0.25; diffuseColor.a = (diffuseColor.a - 0.5) / max(fwidth(diffuseColor.a), 0.0001) + 0.5; if (diffuseColor.a < 0.5) discard;`);
};
const billboard = (sh) => {   // turn each card round its own upright axis to face the camera, and pick its style's cell of the texture
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSp;')
    .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv.x = (vMapUv.x + aSp) / ${SPECIES.length.toFixed(1)};`)
    .replace('#include <beginnormal_vertex>', `vec3 bc0 = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vec2 bn = normalize(cameraPosition.xz - bc0.xz); vec3 objectNormal = normalize(vec3(bn.x, 0.7, bn.y));`)
    .replace('#include <begin_vertex>', `vec3 bc = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vec2 bd = normalize(cameraPosition.xz - bc.xz); vec3 transformed = vec3(position.x * bd.y, position.y, -position.x * bd.x);`);
};
export const CARDS = bakeCards(), cardGeo = new THREE.PlaneGeometry(1, 1.04).translate(0, 0.5, 0);
export const rockGeo = (() => { const g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position, C = [];   // a lumpy boulder, 20 triangles: snow on the faces that look up
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.78 + 0.45 * hash(Math.round(x * 50) + 99, Math.round(z * 50) + Math.round(y * 50) * 7); p.setXYZ(i, x * k * 1.35, Math.max(y * k * 0.75, -0.25), z * k * 1.1); }
  g.computeVertexNormals(); const n = g.attributes.normal, r = mulberry(8);
  for (let i = 0; i < p.count; i += 3) { const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, v = 0.85 + 0.3 * r(); tmpC.set(ny > 0.55 ? '#f1f0ee' : ny > 0.2 ? '#8f8c8a' : '#55514e'); if (ny <= 0.55) tmpC.multiplyScalar(v); for (let k = 0; k < 3; k++) C.push(tmpC.r, tmpC.g, tmpC.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); return g; })();
export const ROCK_R = isPhone ? 300 : 420, LOG_R = 300, TILE = 256, SAPLING_R = 90;
const NEAR_MAX = isPhone ? [600, 300, 300, 150, 600] : [1000, 500, 500, 250, 1000], CARD_MAX = isPhone ? 30000 : 50000, ROCK_MAX = 700, LOG_MAX = 400, SAPLING_MAX = isPhone ? 500 : 900;
const treeMat = (lo, hi) => hazed(new THREE.MeshLambertMaterial({ vertexColors: true, map: treeTex, alphaTest: 0.5, side: THREE.DoubleSide }), (sh) => { fade(lo, hi, false)(sh); underside(sh); keepAlpha(ATLAS, ATLAS)(sh); }, `tree${lo}`);
// Near trees and cards are each split into WEDGES 90° wedges round where they were placed (plus, for trees, one bucket for
// those within CLOSE_R, always drawn), and cullWedges() hides the wedges outside your view, so the trees behind you cost nothing.
const WEDGES = 4, CLOSE_R = 30, wedgeOf = (dx, dz) => Math.floor(((Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1) * WEDGES) % WEDGES;
export const nearMat = treeMat(NEAR - 12, NEAR), near = SPECIES.map((n, i) => [...Array(WEDGES + 1)].map(() => new THREE.InstancedMesh(TREES[n], nearMat, NEAR_MAX[i]))), nearN = SPECIES.map(() => 0);
export const saplingMat = treeMat(SAPLING_R - 25, SAPLING_R), saplings = new THREE.InstancedMesh(TREES.spruce, saplingMat, SAPLING_MAX);   // small spruces in the snow, near you only
export const bushes = new THREE.InstancedMesh(bushGeo, saplingMat, SAPLING_MAX);   // and snowy bushes
const cardMat = hazed(new THREE.MeshLambertMaterial({ map: CARDS.tex, alphaTest: 0.5, side: THREE.DoubleSide }), (sh) => { fade(NEAR - 12, NEAR, true, 0.8 * CARD_R, CARD_R)(sh); billboard(sh); keepAlpha(256 * SPECIES.length, 256)(sh); });
export const cards = [...Array(WEDGES)].map(() => { const g = cardGeo.clone(), sp = new THREE.InstancedBufferAttribute(new Float32Array(CARD_MAX), 1); g.setAttribute('aSp', sp); const m = new THREE.InstancedMesh(g, cardMat, CARD_MAX); m.userData.sp = sp; return m; });
export const rocks = new THREE.InstancedMesh(rockGeo, hazed(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), fade(ROCK_R - 120, ROCK_R - 20, false), 'rocks'), ROCK_MAX);
export const logs = new THREE.InstancedMesh(logGeo, hazed(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), fade(LOG_R - 80, LOG_R - 10, false), 'logs'), LOG_MAX);
const ALL = [...near.flat(), saplings, bushes, ...cards, rocks, logs];
for (const m of ALL) { m.frustumCulled = false; m.count = 0; scene.add(m); }
for (const m of [...near.flat(), saplings, bushes, rocks, logs]) m.receiveShadow = true;
for (const m of [saplings, bushes, logs]) m.castShadow = true;
// shadows: the sun's shadow map covers 64 m round you, so only trees within SHADOW_R (long low-sun shadows included) are drawn
// into it: a shadow-only copy of them per style, drawing 0 instances except while the shadow map is drawn. Rocks cast none.
// Within SHADOW_FULL the full tree casts; further out a cross of two cards (4 triangles, the card's painted outline) stands in.
const SHADOW_R = 80, SHADOW_FULL = 25, shadowOnly = (geo, mat, max) => { const t = new THREE.InstancedMesh(geo, mat, max); t.frustumCulled = false; t.count = 0; t.userData.k = 0; t.castShadow = true; t.onBeforeShadow = () => { t.count = t.userData.k; }; t.onAfterShadow = () => { t.count = 0; }; scene.add(t); return t; };
const crossMat = new THREE.MeshBasicMaterial({ map: CARDS.tex, alphaTest: 0.5, side: THREE.DoubleSide });
const nearSh = SPECIES.map((n, i) => shadowOnly(TREES[n], nearMat, NEAR_MAX[i])), nearShX = SPECIES.map((n, i) => {
  const a = new THREE.PlaneGeometry(1, 1.04).translate(0, 0.52, 0), uv = a.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / SPECIES.length);
  return shadowOnly(mergeGeometries([a, a.clone().rotateY(Math.PI / 2)]), crossMat, NEAR_MAX[i]); });
const wedgeMid = (k) => ((k + 0.5) / WEDGES) * 2 * Math.PI;
export function cullWedges() {   // a wedge shows when it overlaps the view's width, with a margin for having walked since the trees were placed
  if (!placedAt) return; const fwd = Math.atan2(-Math.cos(me.yaw), -Math.sin(me.yaw)), hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect), reach = hf + Math.PI / WEDGES + 0.4 + 0.5 * Math.abs(me.pitch), down = me.pitch < -0.9;
  for (let k = 0; k < WEDGES; k++) { const d = Math.abs(((wedgeMid(k) - fwd + 3 * Math.PI) % (2 * Math.PI)) - Math.PI), v = down || d < reach; cards[k].visible = v && cards[k].count > 0; for (const B of near) B[k].visible = v && B[k].count > 0; }   // an empty bucket is not drawn at all
}
const tiles = new Map();
// which style grows here: birches low down by the lake and at thin forest edges, pines and dead snags on high, dry ground
function species(x, z, h, f, roll) {   // the mix keeps its old heights: tying it to the lowered treeline turned the summit's forest into dead snags
  const low = 1 - sstep(LAKE + 30, LAKE + 140, h), high = sstep(LAKE + 460, LAKE + 680, h), edge = 1 - sstep(0.3, 0.75, f);
  const pBirch = 0.02 + low * (0.2 + 0.25 * edge), pSnag = 0,   // bare birches only down by the lake; no dead snags (Adriaen 2026-11-15: bare poles and twig crowns up high looked weird)
    pPine = 0.1 + 0.2 * high + 0.1 * sstep(0.45, 0.6, fbm(x / 300 - 4, z / 300 + 9, 2));
  return roll < pBirch ? 2 : roll < pBirch + pSnag ? 3 : roll < pBirch + pSnag + pPine ? 1 : (roll * 97) % 1 < 0.5 ? 0 : 4;   // two fir shapes
}
const SIZE = [[7, 8], [12, 7], [8, 5], [6, 6], [7, 9]];   // height range per style: base + up to extra, in metres
export function tile(ti, tj) {   // trees [x, y, z, size, turn, thin, style], saplings [x, y, z, size, turn], rocks and logs [x, y, z, size, turn] of one 256 m tile, made once
  const key = ti + ',' + tj; let t = tiles.get(key); if (t) return t;
  t = { trees: [], saplings: [], rocks: [], logs: [], cell: new Int32Array((TILE / TCELL) ** 2).fill(-1) }; const n = TILE / TCELL;
  const slope = (x, z) => { const gx = (height(x + 5, z) - height(x - 5, z)) / 10, gz = (height(x, z + 5) - height(x, z - 5)) / 10; return 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz); };   // over ±5 m, so the hill decides, not a snow hummock
  const clear = (x, z, h) => Math.hypot(x, z) < 30 || Math.hypot(x - CL.x, z - CL.z) < 22 || trailDist(x, z) < 6 || (roadNear(x, z)?.d ?? 99) < 9 || onIce(x, z, h) || Math.hypot(x - TOWER.x, z - TOWER.z) < 40 || Math.hypot(x - HUT.x, z - HUT.z) < 22;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gi = ti * n + i, gj = tj * n + j, p = hash(gi * 3 + 1, gj * 7 - 5);
    const x = (gi + 0.15 + 0.7 * hash(gi, gj + 11)) * TCELL, z = (gj + 0.15 + 0.7 * hash(gi + 13, gj)) * TCELL;
    const rockRoll = hash(gi - 9, gj * 3 + 2), h = height(x, z);
    if (clear(x, z, h)) continue;
    // exposed crests above the summit stay bare: where the ground stands more than ~2 m above its surroundings 15 m out
    const crest = h > TOP - 40 ? h - (height(x + 15, z) + height(x - 15, z) + height(x, z + 15) + height(x, z - 15)) / 4 : 0;
    const s = slope(x, z), f = forestAt(x, z, h, s) * (1 - sstep(1.5, 3.5, crest));
    if (p < Math.min(1, 1.1 * f)) { const sp = species(x, z, h, f, hash(gi + 21, gj - 17)), [b0, b1] = SIZE[sp]; t.cell[j * n + i] = t.trees.length;
      t.trees.push(x, h - 0.3, z, (b0 + b1 * hash(gi + 5, gj + 5)) * (0.75 + 0.5 * f), hash(gi + 2, gj - 2) * 6.283, hash(gi - 7, gj + 1), sp); }
    else if (rockRoll < (0.01 + 0.015 * sstep(0.04, TREE_S[0], s)) * (1 - sstep(TREE_S[0], TREE_S[1], s))) t.rocks.push(x, h - 0.4, z, 0.8 + 2.8 * hash(gi - 3, gj + 8) ** 2, hash(gi + 8, gj) * 6.283);
    // the forest floor: a fallen log now and then, and young spruces between the big trees and at the edges
    const lx = x + 5, lz = z - 4, lh = height(lx, lz);
    if (f > 0.25 && hash(gi + 31, gj + 3) < 0.07 * f && !clear(lx, lz, lh)) t.logs.push(lx, lh - 0.15, lz, 4 + 5 * hash(gi, gj + 40), hash(gi + 40, gj) * 6.283);
    const sx = x - 6 + 3 * hash(gi + 50, gj), sz = z + 5 - 3 * hash(gi, gj + 50), sh = height(sx, sz), sf = forestAt(sx, sz, sh, s) * (1 - sstep(1.5, 3.5, crest));
    if (hash(gi + 60, gj + 61) < 0.3 + 0.8 * sf * (1 - sf) * 2 && sf > 0.05 && !clear(sx, sz, sh)) t.saplings.push(sx, sh - 0.25, sz, 1.2 + 2.8 * hash(gi + 62, gj) ** 1.5, hash(gi, gj + 63) * 6.283);
  }
  tiles.set(key, t); return t;
}
// spruces round the summit clearing, framing the porch's view
export const SUMMIT_TREES = []; for (let i = 0; i < 34; i++) { const a = R(0, 6.283); if (Math.abs(((a + Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.42) continue; const r = R(19, 40), x = Math.cos(a) * r, z = Math.sin(a) * r; if ((roadNear(x, z)?.d ?? 99) < 7 || polyNear(LOOK_TRAIL, x, z).d < 5 || Math.hypot(x - JEEP.x, z - JEEP.z) < 5) continue; SUMMIT_TREES.push(x, height(x, z) - 0.3, z, R(5, 11), R(0, 6.283), 0, i % 2 ? 4 : 0); }
// round snowy bushes along the edge of the summit clearing: not placed since v22 (Adriaen 2026-11-15: they read as buried treetops)
const CAMP_BUSHES = []; { const r = mulberry(77); for (let i = 0; i < 40 && CAMP_BUSHES.length < 22 * 3; i++) { const a = r() * 6.283, d = 13 + 9 * r(), x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (Math.abs(((a + Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.5 || Math.hypot(x - 0.5, z - 11.5) < 7.5 || (Math.abs(x) < 8 && Math.abs(z) < 7) || (roadNear(x, z)?.d ?? 99) < 5 || polyNear(LOOK_TRAIL, x, z).d < 3 || Math.hypot(x - JEEP.x, z - JEEP.z) < 4) continue; CAMP_BUSHES.push(x, z, 0.8 + 1.1 * r()); } }
export let placedAt = null, lookSet = false;
export function placeThings(px, pz) {
  placedAt = { x: px, z: pz, h: +$('hour').value }; const nn = SPECIES.map(() => 0), seen = SPECIES.map(() => 0); let nc = 0, nr = 0, nl = 0, ns = 0, nb = 0;
  const put = (mesh, n, x, y, z, s, turn, flat) => { q.setFromAxisAngle(up, turn); m4.compose(v3.set(x, y, z), q, flat ? sc.set(s * 1.3, s * 0.7, s) : sc.set(s, s, s)); mesh.setMatrixAt(n, m4); };
  const nearBuf = SPECIES.map(() => []), cn = cards.map(() => 0), tree = (x, y, z, s, turn, thin, sp) => { const d2 = (x - px) ** 2 + (z - pz) ** 2; seen[sp] += s * s;
    const w = 0.82 + 0.36 * ((turn * 7.31) % 1);   // each tree its own width
    if (d2 < NEAR * NEAR && nearBuf[sp].length < NEAR_MAX[sp]) nearBuf[sp].push([d2, x, y, z, s, turn, w]);
    if (d2 > (NEAR - 12) ** 2 && d2 < CARD_R * CARD_R && nc < CARD_MAX) { const k = wedgeOf(x - px, z - pz); m4.compose(v3.set(x, y - 0.2, z), q.identity(), sc.set(s * w, s, s)); cards[k].setMatrixAt(cn[k], m4); cards[k].userData.sp.array[cn[k]++] = sp; nc++; } };
  for (let i = 0; i < SUMMIT_TREES.length; i += 7) tree(...SUMMIT_TREES.slice(i, i + 7));
  const t0 = Math.floor((px - CARD_R) / TILE), t1 = Math.floor((px + CARD_R) / TILE), u0 = Math.floor((pz - CARD_R) / TILE), u1 = Math.floor((pz + CARD_R) / TILE);
  const order = [];
  for (let tj = u0; tj <= u1; tj++) for (let ti = t0; ti <= t1; ti++) {
    const cx = Math.max(ti * TILE, Math.min(px, (ti + 1) * TILE)), cz = Math.max(tj * TILE, Math.min(pz, (tj + 1) * TILE)), d2 = (cx - px) ** 2 + (cz - pz) ** 2; if (d2 <= CARD_R * CARD_R) order.push([d2, ti, tj]); }
  order.sort((a, b) => a[0] - b[0]);   // nearest tiles first, so a full card budget drops the farthest trees
  for (const [d2, ti, tj] of order) {
    const t = tile(ti, tj);
    for (let i = 0; i < t.trees.length; i += 7) tree(t.trees[i], t.trees[i + 1], t.trees[i + 2], t.trees[i + 3], t.trees[i + 4], t.trees[i + 5], t.trees[i + 6]);
    if (d2 > ROCK_R * ROCK_R) continue;
    for (let i = 0; i < t.rocks.length; i += 5) { const x = t.rocks[i], z = t.rocks[i + 2]; if (nr < ROCK_MAX && (x - px) ** 2 + (z - pz) ** 2 < ROCK_R * ROCK_R) put(rocks, nr++, x, t.rocks[i + 1], z, t.rocks[i + 3], t.rocks[i + 4], true); }
    for (let i = 0; i < t.logs.length; i += 5) { const x = t.logs[i], z = t.logs[i + 2]; if (nl < LOG_MAX && (x - px) ** 2 + (z - pz) ** 2 < LOG_R * LOG_R) { q.setFromAxisAngle(up, t.logs[i + 4]); m4.compose(v3.set(x, t.logs[i + 1], z), q, sc.set(t.logs[i + 3], 0.5, 0.5)); logs.setMatrixAt(nl++, m4); } }
    for (let i = 0; i < t.saplings.length; i += 5) { const x = t.saplings[i], z = t.saplings[i + 2]; if ((x - px) ** 2 + (z - pz) ** 2 >= SAPLING_R * SAPLING_R) continue;
      if ((i / 5) % 5 < 2) continue; if (ns < SAPLING_MAX) put(saplings, ns++, x, t.saplings[i + 1], z, t.saplings[i + 3], t.saplings[i + 4]); }
  }
  nearBuf.forEach((B, sp) => { const cnt = near[sp].map(() => 0); let k = 0, kx = 0;
    for (const [d2, x, y, z, s, turn, w] of B) { q.setFromAxisAngle(up, turn); m4.compose(v3.set(x, y, z), q, sc.set(s * w, s, s * w)); const b = d2 < CLOSE_R * CLOSE_R ? WEDGES : wedgeOf(x - px, z - pz);
      near[sp][b].setMatrixAt(cnt[b]++, m4); if (d2 < SHADOW_FULL ** 2) nearSh[sp].setMatrixAt(k++, m4); else if (d2 < 45 * 45 || (d2 < SHADOW_R * SHADOW_R && (x - px) * sunDir.x + (z - pz) * sunDir.z > -6)) nearShX[sp].setMatrixAt(kx++, m4); }   // beyond 45 m only the sun side can shade the map
    near[sp].forEach((m, b) => { m.count = cnt[b]; }); nearSh[sp].userData.k = k; nearShX[sp].userData.k = kx; nearSh[sp].instanceMatrix.needsUpdate = nearShX[sp].instanceMatrix.needsUpdate = true; nn[sp] = nearN[sp] = B.length; });
  cards.forEach((m, k) => { m.count = cn[k]; m.userData.sp.needsUpdate = true; }); rocks.count = nr; logs.count = nl; saplings.count = ns; bushes.count = nb; for (const B of near) B[WEDGES].visible = B[WEDGES].count > 0; cullWedges();
  for (const m of ALL) m.instanceMatrix.needsUpdate = true;
  if (!lookSet) { lookSet = true; farForestLook(seen); }
}

