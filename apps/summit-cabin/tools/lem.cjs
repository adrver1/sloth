// Landscape evolution for Summit Cabin: grows the land from tectonic uplift and river erosion (stream power law with the
// implicit solver of Braun & Willett 2013, as used for terrains by Cordonnier et al. 2016), plus hillslope creep and a scree
// angle. Two runs:
// 1) the world, 12.8 km at 25 m: uplift is the level's layout (uplift() below: summit dome, the walls north and west, a ring
//    of big mountains 2 to 4 km out), the two lakes and the square's edge are base level; heights come straight from the
//    evolved land, scaled once so its relief matches hLand's.
// 2) the play area, 2.56 km at 5 m, grown with the world's result as uplift; it keeps the world's shapes above ~150 m and
//    takes the gullies and spurs below that from its own run, scaled to the local relief (AMP).
// Writes models/erosion-world.txt and models/erosion-near.txt: the change from hLand in decimetres (Int16, base64 after a JSON
// header); the page fades each out at its square's edge. Seeded, so a run gives the same land.
// Usage: node tools/lem.cjs [steps=600] [amp=0.45]       (about 6 minutes)
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const { hLand, sstep, LAKE_P, BIG, NORTH_M, WEST_M, ridged } = new Function(html.slice(html.indexOf('function mulberry'), html.indexOf('function hBase(')) + '\nreturn { hLand, sstep, LAKE_P, BIG, NORTH_M, WEST_M, ridged };')();
// the level's layout as uplift (0..1): a high summit dome, the two walls behind and west, a ring of big mountains 2 to 4 km
// out, low ground elsewhere; the two lakes are base level (their water is where rivers end), as the window's edge is
function uplift(x, z) { const r = Math.hypot(x, z), g = (cx, cz, sx, sz) => Math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2));
  let u = 0.18 + 0.12 * ridged(x / 2500 + 3, z / 2500, 2);
  u += 0.55 * g(0, 0, 420, 340);
  u += 0.95 * g(NORTH_M.x, NORTH_M.z, NORTH_M.sx * 1.3, NORTH_M.sz * 1.3) + 0.8 * g(WEST_M.x, WEST_M.z, WEST_M.sx * 1.2, WEST_M.sz * 1.1);
  u += sstep(1700, 3200, r) * (0.55 + 0.45 * ridged(x / 1800 + 7, z / 1800 - 3, 3));
  return Math.min(1.4, u); }
const isLake = (x, z) => Math.hypot((x - BIG.x) / BIG.rx, (z - BIG.z) / BIG.rz) < 0.75 || Math.hypot(x - LAKE_P.x, z - LAKE_P.z) < LAKE_P.r * 0.8;
const [STEPS = '600', AMP = '0.45'] = process.argv.slice(2);
const N = 512, NN = N * N, NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const hk = new Int32Array(NN), hv = new Float64Array(NN); let hn = 0;
const push = (k, v) => { let c = hn++; hk[c] = k; hv[c] = v; while (c) { const p = (c - 1) >> 1; if (hv[p] <= hv[c]) break; const tk = hk[p], tv = hv[p]; hk[p] = hk[c]; hv[p] = hv[c]; hk[c] = tk; hv[c] = tv; c = p; } };
const pop = () => { const k = hk[0]; hn--; if (hn) { hk[0] = hk[hn]; hv[0] = hv[hn]; let c = 0; for (;;) { const a = 2 * c + 1, b = a + 1; let m = c; if (a < hn && hv[a] < hv[m]) m = a; if (b < hn && hv[b] < hv[m]) m = b; if (m === c) break; const tk = hk[m], tv = hv[m]; hk[m] = hk[c]; hv[m] = hv[c]; hk[c] = tk; hv[c] = tv; c = m; } } return k; };
function blur(src, r) { const a = Float64Array.from(src), b = new Float64Array(NN); for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < N; j++) { let s = 0; for (let i = -r; i <= r; i++) s += a[j * N + Math.min(N - 1, Math.max(0, i))]; for (let i = 0; i < N; i++) { b[j * N + i] = s / (2 * r + 1); s += a[j * N + Math.min(N - 1, i + r + 1)] - a[j * N + Math.max(0, i - r)]; } }
    for (let i = 0; i < N; i++) { let s = 0; for (let j = -r; j <= r; j++) s += b[Math.min(N - 1, Math.max(0, j)) * N + i]; for (let j = 0; j < N; j++) { a[j * N + i] = s / (2 * r + 1); s += b[Math.min(N - 1, j + r + 1) * N + i] - b[Math.max(0, j - r) * N + i]; } } } return a; }
// grow land on an N×N grid of cell DX whose uplift follows T (the target heights); returns the evolved heights
function evolve(T, DX, steps, U = null, base = null) {
  let lo = Infinity, hi = -Infinity; for (const v of T) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const H = new Float64Array(NN); if (!U) U = Float64Array.from(T, (v) => ((v - lo) / (hi - lo)) ** 1.2); for (let k = 0; k < NN; k++) H[k] = rnd() * 0.5;
  const fixed = (k) => { const i = k % N, j = (k / N) | 0; return !i || !j || i === N - 1 || j === N - 1 || (base && base[k]); };
  const F = new Float64Array(NN), rec = new Int32Array(NN), rl = new Float64Array(NN), ord = new Int32Array(NN), A = new Float64Array(NN), seen = new Uint8Array(NN);
  const K = +(process.env['K' + DX] || (DX >= 25 ? 0.03 : 0.01)), M = 0.5, UMAX = 0.6, KD = 0.04, TAL = Math.tan((40 * Math.PI) / 180), t0 = Date.now();   // K scaled so a run looks alike at either cell size
  for (let it = 0; it < steps; it++) {
    for (let k = 0; k < NN; k++) if (!fixed(k)) H[k] += U[k] * UMAX;
    seen.fill(0); hn = 0; let n = 0;   // flood from the edge, which is base level
    for (let k = 0; k < NN; k++) if (fixed(k)) { seen[k] = 1; F[k] = H[k]; push(k, F[k]); }
    while (hn) { const k = pop(); ord[n++] = k; const i = k % N, j = (k / N) | 0;
      for (const [di, dj] of NB) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue; const q = b * N + a; if (seen[q]) continue; seen[q] = 1; F[q] = Math.max(H[q], F[k] + 1e-3); push(q, F[q]); } }
    // a lower neighbour picked at random, weighted by slope², so channels don't lock onto the grid's 8 directions
    for (let k = 0; k < NN; k++) { const i = k % N, j = (k / N) | 0; rec[k] = k; if (fixed(k)) continue; let tot = 0; const c = [];
      for (const [di, dj, l] of NB) { const q = (j + dj) * N + i + di, s = (F[k] - F[q]) / (l * DX); if (s > 0) { c.push(q, s, l); tot += s * s; } }
      let r = rnd() * tot; for (let t = 0; t < c.length; t += 3) { r -= c[t + 1] * c[t + 1]; if (r <= 0 || t === c.length - 3) { rec[k] = c[t]; rl[k] = c[t + 2] * DX; break; } } }
    A.fill(DX * DX); for (let o = n - 1; o >= 0; o--) { const k = ord[o]; if (rec[k] !== k) A[rec[k]] += A[k]; }
    for (let o = 0; o < n; o++) { const k = ord[o], r = rec[k]; if (r === k) continue; const f = (K * A[k] ** M) / rl[k]; H[k] = Math.min(H[k], (H[k] + f * H[r]) / (1 + f)); }
    const P = Float64Array.from(H); for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const k = j * N + i; if (base && base[k]) continue; H[k] += KD * (P[k - 1] + P[k + 1] + P[k - N] + P[k + N] - 4 * P[k]);
      for (const q of [k - 1, k + 1, k - N, k + N]) { const dh = P[k] - P[q] - TAL * DX; if (dh > 0) { H[k] -= dh * 0.2; H[q] += dh * 0.2; } } }
    if (it % 100 === 99) console.log(`  ${DX} m grid: step ${it + 1}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  return H;
}
// hLand's big shapes plus the evolved land's smaller ones, scaled to the local relief
function combine(T, H, R, amp = +AMP) { const bT = blur(T, R), bH = blur(H, R); let lo = Infinity; for (const v of T) lo = Math.min(lo, v); let hl = Infinity; for (const v of bH) hl = Math.min(hl, v);
  const s = Float64Array.from(bT, (v, k) => Math.min(10, (v - lo + 20) / (bH[k] - hl + 5))), sb = blur(s, R);
  return Float64Array.from(T, (_, k) => bT[k] + (H[k] - bH[k]) * sb[k] * amp); }
function write(name, G, OUT, BASE) { const out = new Int16Array(NN); let mn = 0, mx = 0;
  for (let k = 0; k < NN; k++) { const d = OUT[k] - BASE[k]; out[k] = Math.max(-32767, Math.min(32767, Math.round(d * 10))); mn = Math.min(mn, d); mx = Math.max(mx, d); }
  fs.writeFileSync(path.join(__dirname, `../models/erosion-${name}.txt`), JSON.stringify({ N, DX: G.DX, X0: G.X0, Z0: G.Z0, scale: 0.1 }) + '\n' + Buffer.from(out.buffer).toString('base64'));
  if (process.env.DUMP) for (const [s, a] of [['base', BASE], ['out', OUT]]) fs.writeFileSync(`${process.env.DUMP}-${name}-${s}.f32`, Buffer.from(Float32Array.from(a).buffer));
  console.log(`erosion-${name}: change ${mn.toFixed(0)} to +${mx.toFixed(0)} m`); }
const grid = (DX) => ({ DX, X0: 60 - (N / 2) * DX, Z0: -(N / 2) * DX });
// 1) the world
const GW = grid(25), TW = new Float64Array(NN); for (let k = 0; k < NN; k++) TW[k] = hLand(GW.X0 + (k % N) * 25, GW.Z0 + ((k / N) | 0) * 25);
const UW = new Float64Array(NN), BW = new Uint8Array(NN); for (let k = 0; k < NN; k++) { const x = GW.X0 + (k % N) * 25, z = GW.Z0 + ((k / N) | 0) * 25; UW[k] = uplift(x, z); BW[k] = isLake(x, z) ? 1 : 0; }
const TWs = blur(TW, Math.round(400 / 25)), HW = evolve(TWs, 25, +STEPS, UW, BW); if (process.env.DUMP) fs.writeFileSync(`${process.env.DUMP}-world-raw.f32`, Buffer.from(Float32Array.from(HW).buffer));
const pct = (a, p) => Float64Array.from(a).sort()[Math.floor(p * (a.length - 1))];
const W = (() => { const lo = pct(TWs, 0.02), hi = pct(TWs, 0.98), hl = pct(HW, 0.02), hh = pct(HW, 0.98), k = (hi - lo) / (hh - hl); return Float64Array.from(HW, (v) => lo + (v - hl) * k * +(process.env.AW || 1)); })(); write('world', GW, W, TW);
if (process.env.ONLY === 'world') process.exit(0);
// 2) the play area, grown from the world's result
const GN = grid(5), sampleW = (x, z) => { const u = (x - GW.X0) / 25, v = (z - GW.Z0) / 25, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * N + i; return (W[k] * (1 - fu) + W[k + 1] * fu) * (1 - fv) + (W[k + N] * (1 - fu) + W[k + N + 1] * fu) * fv; };
const TN = new Float64Array(NN), LN = new Float64Array(NN); for (let k = 0; k < NN; k++) { const x = GN.X0 + (k % N) * 5, z = GN.Z0 + ((k / N) | 0) * 5; TN[k] = sampleW(x, z); LN[k] = hLand(x, z); }
write('near', GN, combine(TN, evolve(TN, 5, +STEPS), Math.round(150 / 5)), LN);
