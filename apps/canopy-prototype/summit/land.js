// Summit Cabin land: pure layout and height. The erosion grids (models/summit-erosion-*.json, loaded with top-level await), seeded
// noise, height(x, z), the lakes, the road, bridge and tunnel line, the boardwalk, the clearing and the watch hill, where trees may
// grow (forestAt, with the slope and crest rules), the cabin's size and groundAt, where you stand. No scene, no DOM writes.
import { b64bytes } from '../bakedlight.js';


export const $ = (id) => document.getElementById(id);
export const isPhone = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
export const TRIS = [];

// ---------------------------------------------------------------- erosion
// The land within 1.3 km is reshaped by an offline landscape-evolution run (tools/lem.cjs: river incision, creep and
// scree), stored as the change in height on two grids (models/summit-erosion-world.json, summit-erosion-near.json) and added to hBase() below. ?ero=off shows the old land, ?bare=1 the land alone.
// Two grids: the world, 12.8 km at 25 m, and the play area, 2.56 km at 5 m; each fades out over the outer 15 % of its square.
// URL options, parsed here once (coding standards section 7):
//   ?ero=off   the land before erosion (default on)              read here (ERO)
//   ?bare=1    the grown land alone, nothing man-made             BARE: main.js, player.js, map.js, road.js
//   ?back=URL  the camp's address (camp/drive.js sets it): you have just driven here, so the jeep's arrival plays, and the
//              way home goes back to it (only an address on this site; default camp.html)          drive.js (from, back)
//   ?drivestay the way home ends here instead of loading the camp, for checks                         drive.js
//   ?time=H    the hour (0..24); otherwise the camp's saved hour, or 15.5                         daytime.js
//   ?cycle=1|0 the day cycle on or off; otherwise the camp's saved choice                             daytime.js
//   ?dev or ?debug   (one option, the same in the camp: Adriaen 2026-11-15) the fps line and the prototype's jumps, tests and triangle table in the ⚙️ menu     player.js
//   ?lm=0      the cabin and lookout without their baked light maps (the bake's exporter uses it)   lightmap.js
//   ?sound=0   start muted, ?station=ID start on that station (for that visit only, as in the camp)  audio.js
const Q = new URLSearchParams(location.search);
const sameSite = (u) => { try { return new URL(u, location.href).origin === location.origin; } catch { return false; } };
export const OPT = { ero: Q.get('ero') !== 'off', bare: Q.get('bare') === '1', from: Q.has('back'), back: Q.has('back') && sameSite(Q.get('back')) ? Q.get('back') : 'camp.html', drivestay: Q.has('drivestay'), touch: Q.has('touch') };
// the camp's saved settings, shared with it (camp/core.js KEYS and store): the hour, the day cycle and the sound carry over both ways
export const KEYS = { time: 'canopy-time', cycle: 'canopy-cycle', audio: 'canopy-audio' };
export const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
{ const v = Q.get('time') || store.get(KEYS.time), h = v ? Number(v) : 15.5;   // ?time= and ?cycle= as in the camp, for that visit
  OPT.time = h >= 0 && h < 24 ? h : 15.5; OPT.cycle = Q.has('cycle') ? Q.get('cycle') !== '0' : store.get(KEYS.cycle) === 'on'; }
OPT.sound = Q.get('sound') !== '0'; OPT.station = Q.get('station'); OPT.debug = Q.has('dev') || (Q.has('debug') && Q.get('debug') !== '0') || /claude/.test(location.hostname); OPT.lm = Q.get('lm') !== '0';   // debug: also on in a preview artifact (camp/core.js)
const ERO = await (async () => { if (!OPT.ero) return null;
  const load = async (f) => { const r = await fetch(`models/${f}.json`); if (!r.ok) throw new Error(`${f} ${r.status}`); const m = await r.json(); m.d = new Int16Array(b64bytes(m.d).buffer); return m; };   // d: the height change, int16 times scale, base64
  try { return await Promise.all([load('summit-erosion-world'), load('summit-erosion-near')]); } catch (e) { console.warn('no erosion', e); return null; } })();
function eroGrid(G, x, z) { const { N, DX, X0, Z0, scale, d } = G, u = (x - X0) / DX, v = (z - Z0) / DX; if (!(u >= 0 && v >= 0 && u < N - 1 && v < N - 1)) return [0, 0];
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * N + i, e = Math.min(1, Math.min(u, v, N - 1 - u, N - 1 - v) / (N * 0.15));
  return [scale * ((d[k] * (1 - fu) + d[k + 1] * fu) * (1 - fv) + (d[k + N] * (1 - fu) + d[k + N + 1] * fu) * fv), e * e * (3 - 2 * e)]; }
// BARE: the grown land alone, with nothing man-made and none of the level's carving (Adriaen 2026-11-15: get a good, realistic
// foundation first, then add the cabin, road, bridge and boardwalk back). Now opt-in with ?bare=1.
export const BARE = !!ERO && OPT.bare;
// The play core (the summit, the clearing, the boardwalk and the watch hill: a capsule from the cabin to the hill) keeps the
// old land exactly, so the level fits as it was; erosion fades in from 150 m round it to full strength at 320 m.
function eroKeep(x, z) { const bx = 215, bz = 100, k = Math.max(0, Math.min(1, (x * bx + z * bz) / (bx * bx + bz * bz))), d = Math.hypot(x - bx * k, z - bz * k), t = Math.min(1, Math.max(0, (d - 150) / 170)); return t * t * (3 - 2 * t); }
function eroAt(x, z) { const [w, wf] = eroGrid(ERO[0], x, z), [n, nf] = eroGrid(ERO[1], x, z); return (w * wf + (n - w * wf) * nf) * eroKeep(x, z); }   // the near grid already includes the world's change

// ---------------------------------------------------------------- random and noise
export function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const rnd = mulberry(20261114), R = (a, b) => a + rnd() * (b - a);
export const hash = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
export function fbm(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
export function ridged(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0, w = 1; for (let i = 0; i < o; i++) { let r = 1 - Math.abs(vnoise(x * f + i * 31.7, y * f + i * 5.3) * 2 - 1); r *= r * w; w = Math.min(1, r * 1.6); s += a * r; n += a; a *= 0.5; f *= 2.1; } return s / n; }
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the land
// a steep peak with the cabin on a flat top and a cliff south of the porch; forested hills and valleys round it; a frozen
// lake with a fishing hut 950 m north-west, a fire lookout on its own hill 1 km north-east, and a ring of high mountains 2 to 4 km out.
// Everything you see is the same ground, so you can walk to it.
export const LAKE_P = { x: -760, z: 560, r: 170 }, HILL_P = { x: 215, z: 100 };
export const CL = { x: 76, z: 12 };   // a clearing in the valley between the summit and the watch hill, ringed by knolls
const KNOLLS = [[112, 8, 14], [92, -9, 10], [56, -8, 8]];   // low hills round the clearing: one east, two on the cliff's rim
export const BIG = { x: 60, z: -700, rx: 560, rz: 330 };   // the big lake filling the valley below the cliff
// the level's walls: a tall mountain right behind the camp, and a steep one to the west that the road tunnels into
const NORTH_M = { x: -120, z: 300, sx: 200, sz: 170, h: 900 }, WEST_M = { x: -470, z: 10, sx: 180, sz: 280, h: 620 };
// hLand: the land's own shape (what erosion works on); hBase adds the erosion and the level's hand-placed hills on top
function hLand(x, z) {
  const r = Math.hypot(x, z), e = Math.hypot(x / 1.25, z);
  let h = 700 / (1 + (e / 520) ** 1.7);   // round only near the top, then concave, so every slope below is in view
  h += (fbm(x / 1500, z / 1500, 5) - 0.45) * 420;
  h += (fbm(x / 240, z / 240, 3) - 0.5) * 36 * Math.min(1, r / 400);
  // the two walls are real mountains: a smooth mass broken up by ridges and gullies (ridged noise), steep but never sheer
  h += NORTH_M.h * Math.exp(-(((x - NORTH_M.x) / NORTH_M.sx) ** 2 + ((z - NORTH_M.z) / NORTH_M.sz) ** 2)) * (0.6 + 0.7 * ridged(x / 260 + 3, z / 260 + 1, 4));
  { const d = Math.hypot((x - WEST_M.x) / WEST_M.sx, (z - WEST_M.z) / WEST_M.sz); h += WEST_M.h * sstep(1.55, 0.35, d) * (0.55 + 0.75 * ridged(x / 220 - 5, z / 220 + 2, 4)); }
  // a ring of big mountains 2 to 4 km out closes the valley in, so the view is grand but never needs drawing far
  h += sstep(1900, 3600, r) * (ridged(x / 1500 + 7, z / 1500 - 3, 5) * 1500 + 250) + sstep(3600, 6000, r) * 500;
  return h;
}
const landAt = (x, z) => hLand(x, z) + (typeof ERO !== 'undefined' && ERO ? eroAt(x, z) : 0);
// the watch hill is raised to about 20 m above the summit (more where the land round it is higher), whatever the land under it does
const HILL_A = typeof BARE !== 'undefined' && BARE ? 0 : 160;
export function hBase(x, z) {
  let h = landAt(x, z);
  h += HILL_A * Math.exp(-((x - HILL_P.x) ** 2 + (z - HILL_P.z) ** 2) / 115 ** 2);   // the watch hill, broad enough for stairs to zigzag up it
  if (typeof BARE === 'undefined' || !BARE) for (const [kx, kz, ka] of KNOLLS) h += ka * Math.exp(-((x - kx) ** 2 + (z - kz) ** 2) / 24 ** 2);   // low knolls round the clearing
  return h;
}
export const TOP = hBase(0, 0) + 2;
export let LAKE = 0;   // the lowest valley floors freeze into flat lakes; set from the height spread
{ const hs = []; for (let i = 0; i < 4000; i++) { const a = R(0, 6.283), r = R(1500, 7000); hs.push(hBase(Math.cos(a) * r, Math.sin(a) * r)); } hs.sort((a, b) => a - b); LAKE = hs[Math.floor(hs.length * (BARE ? 0.01 : 0.07))]; }
const LAKE_H = hBase(LAKE_P.x, LAKE_P.z) - 30;
// nearest point of a polyline [[x, z, s], ...]: distance d, distance along s, segment index i
export function polyNear(P, x, z) { let best = { d: 1e9, s: 0, i: 0 }; for (let i = 0; i < P.length - 1; i++) { const [ax, az, as] = P[i], [bx, bz, bs] = P[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * k, z - az - dz * k); if (d < best.d) best = { d, s: as + (bs - as) * k, i }; } return best; }
const withS = (P) => { let s = 0; return P.map((p, i) => { if (i) s += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]); return [p[0], p[1], s]; }); };
export const ROAD = (() => {   // sampled every 2 m: [x, z, s, y]; b0 where the bridge starts, portal where it meets the mountain
  const ctrl = [[-17, 2.5], [-50, 3.5], [-85, -1.5], [-120, -6], [-700, -6]], pts = []; let s = 0, y = TOP, b0 = 0, portal = null;
  for (let i = 0; i < ctrl.length - 1 && !portal; i++) { const [ax, az] = ctrl[i], [bx, bz] = ctrl[i + 1], L = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < L && !portal; d += 2, s += 2) { const x = ax + ((bx - ax) * d) / L, z = az + ((bz - az) * d) / L, g = hBase(x, z);
      if (!b0) { y = TOP - 0.07 * s; if (s > 30 && g < y - 6) b0 = s; } else if (g > y + 2) portal = { x, z, y, s };
      pts.push([x, z, s, y]); } }
  return { pts, b0, portal, y };
})();
export const CL_Y = TOP - 11;   // well below the summit, so the boardwalk drops into it and climbs out
export const BIG_H = (() => { const hs = []; for (let i = 0; i < 400; i++) { const a = (i * 2.39996) % 6.283, k = Math.sqrt((i + 0.5) / 400); hs.push(hBase(BIG.x + Math.cos(a) * BIG.rx * k, BIG.z + Math.sin(a) * BIG.rz * k)); } hs.sort((a, b) => a - b); return hs[60]; })();
const bigE = (x, z) => Math.hypot((x - BIG.x) / BIG.rx, (z - BIG.z) / BIG.rz);
// the watch hill's top, flattened for the tower
export const HT = (() => { let best = [0, 0, -1e9]; for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) { const x = HILL_P.x + i * 4, z = HILL_P.z + j * 4, h = hBase(x, z); if (h > best[2]) best = [x, z, h]; } return { x: best[0], z: best[1], y: best[2] }; })();
export const ROAD_Y = (s) => (s < ROAD.b0 ? TOP - 0.07 * s : ROAD.y);
export const roadNear = (x, z) => (x > -8 || x < ROAD.portal.x - 20 || z > 22 || z < -30 ? null : polyNear(ROAD.pts, x, z));
// the cliff's lip south of the cabin (Adriaen 2026-11-16: "the cabin needs to come back from the cliff a little bit"): it was
// at z -8.5 + 3 sin(x / 9), which put the porch's east corner over the edge; now 2.5 m further out and straighter
export const lip = (x) => -11 + 2.2 * Math.sin(x / 9);
// the snowman stands east of the cabin, in the open snow by the cliff rail (Adriaen 2026-11-16, from his phone still), facing
// back toward the porch and the path round the cabin
// the cabin sits on a flat top; just south of the porch the summit breaks off in a cliff, so the porch looks down over the valleys
export let BW_CUT = null, BW_CORNERS = [];   // set once the boardwalk is laid: the ground is dug down along it, so the stairs sit in a cutting where the hill is steeper than they are
export function height(x, z) {
  if (BARE) { const h = Math.max(LAKE, hBase(x, z)); return h + ((fbm(x / 38, z / 38, 3) - 0.5) * 3.2 + (vnoise(x / 7, z / 7) - 0.5) * 0.7) * sstep(LAKE + 1, LAKE + 4, h); }   // the land, frozen lakes in its lowest hollows, snow drifts
  const r = Math.hypot(x, z); let h = Math.max(LAKE, hBase(x, z));
  const dl = Math.hypot(x - LAKE_P.x, z - LAKE_P.z); if (dl < LAKE_P.r + 500) h = Math.min(h, LAKE_H + Math.max(0, dl - LAKE_P.r) * 0.3 + Math.max(0, dl - LAKE_P.r - 250) ** 2 * 0.012);   // the bowl steepens outward, so it meets the hills without a step
  if (dl > LAKE_P.r + 4) h += ((fbm(x / 38, z / 38, 3) - 0.5) * 3.2 + (vnoise(x / 7, z / 7) - 0.5) * 0.7) * sstep(LAKE + 1, LAKE + 4, h);   // snow drifts and hummocks underfoot
  if (r < 60) h = r < 18 ? TOP : TOP + (h - TOP) * sstep(18, 55, r);
  const d = lip(x) - z; if (d > 0 && r < 400) h -= 140 * (1 - Math.exp(-d / 22)) * (1 - sstep(70, 190, Math.abs(x))) * (1 - sstep(220, 400, r));   // a cliff bowl only below the cabin
  const rd = roadNear(x, z);
  if (rd && rd.d < 14 && rd.s < ROAD.b0) h += (ROAD_Y(rd.s) - 0.05 - h) * (1 - sstep(3.5, 13, rd.d)) * (r < 18 ? 0 : 1);   // the road bed
  if (rd && x < ROAD.portal.x + 14 && x > ROAD.portal.x - 3) h = Math.min(h, h + (ROAD.y - 2 - h) * (1 - sstep(7, 10.5, Math.abs(z - ROAD.portal.z))));   // the tunnel's cutting
  { const e = bigE(x, z); if (e < 2.2) { const dm = Math.max(0, e - 1) * BIG.rz; h = Math.min(h, BIG_H + dm * 0.35 + Math.max(0, dm - 120) ** 2 * 0.012); } }   // the big lake's bowl
  { const dc = Math.hypot(x - CL.x, z - CL.z); if (dc < 44) h += (CL_Y - h) * (1 - sstep(11, 44, dc)) * 0.92; }   // the clearing's floor
  { const dh = Math.hypot(x - HT.x, z - HT.z); if (dh < 21) h += (HT.y - h) * (1 - sstep(13, 21, dh)); }   // the hilltop, flat for the tower
  if (BW_CUT && x > BW_CUT[0] && x < BW_CUT[1] && z > BW_CUT[2] && z < BW_CUT[3]) { const b = polyNear(BW, x, z); if (b.d < 5) { const y = bwY(b) - 0.3; if (h > y) h += (y - h) * (1 - sstep(1.5, 5, b.d)); } }
  return Math.max(Math.min(LAKE, LAKE_H), h);
}
export const onIce = (x, z, h) => h <= LAKE + 0.05 || (h <= BIG_H + 0.05 && bigE(x, z) < 1.05) || (h <= LAKE_H + 0.05 && Math.hypot(x - LAKE_P.x, z - LAKE_P.z) < LAKE_P.r + 1);
const TREELINE = TOP + 110;   // just above the summit, so the cabin sits in a forest clearing but the mountains round it are bare on top
// the lookout stands on the top of its hill; the fishing hut out on the ice, 45 m from the shore nearest the cabin
export const TOWER = { x: HT.x, z: HT.z, y: height(HT.x, HT.z) };
const SHORE = (() => { const k = Math.hypot(LAKE_P.x, LAKE_P.z); return { x: LAKE_P.x - (LAKE_P.x / k) * LAKE_P.r, z: LAKE_P.z - (LAKE_P.z / k) * LAKE_P.r }; })();
export const HUT = { x: SHORE.x + (LAKE_P.x - SHORE.x) * 0.3, z: SHORE.z + (LAKE_P.z - SHORE.z) * 0.3, y: LAKE_H };
// two marked trails from the cabin: one down to the lake, one over to the lookout
// the way up to the watch hill: a timber boardwalk from the summit's trail head, landings where the ground is level and stair
// flights where it climbs (or dips), always just above the snow, railed both sides, ending on the hilltop by the tower
export const BW = (() => {
  // the route: down off the summit by short flights into the valley, along the clearing's north edge, then switchbacks up the
  // watch hill. Each leg turns off the fall line just far enough to climb at stair pitch (about 0.4), so every leg climbs and
  // the legs zigzag; each turn gets a flat landing.
  const ctrl = [[15.5, 15.5], [30, 16], [46, 17], [60, 20], [74, 23], [88, 24]], corners = new Set();
  const gH = (x, z) => [(hBase(x + 6, z) - hBase(x - 6, z)) / 12, (hBase(x, z + 6) - hBase(x, z - 6)) / 12];
  { let [px, pz] = ctrl[ctrl.length - 1], side = -1;
    for (let k = 0; k < 14 && Math.hypot(HT.x - px, HT.z - pz) > 30; k++) {
      const [gx, gz] = gH(px, pz), gl = Math.hypot(gx, gz) || 1, d = Math.hypot(HT.x - px, HT.z - pz), ux = 0.55 * gx / gl + 0.45 * (HT.x - px) / d, uz = 0.55 * gz / gl + 0.45 * (HT.z - pz) / d, ul = Math.hypot(ux, uz);
      const L = 19 + ((k * 5) % 3) * 2.5, y0 = height(px, pz); let best = null;
      for (let a = 0.8; a <= 1.4; a += 0.05) { const c = Math.cos(side * a), sn = Math.sin(side * a), qx = px + ((ux * c - uz * sn) / ul) * L, qz = pz + ((ux * sn + uz * c) / ul) * L; best = [qx, qz]; if ((height(qx, qz) - y0) / L < 0.42) break; }
      corners.add(ctrl.length - 1); ctrl.push(best); [px, pz] = best; side = -side; }
    corners.add(ctrl.length - 1); const d = Math.hypot(HT.x - px, HT.z - pz); ctrl.push([HT.x - ((HT.x - px) / d) * 9.5, HT.z - ((HT.z - pz) / d) * 9.5]); }
  BW_CORNERS = [...corners].map((i) => ctrl[i]);
  const pts = []; let s = 0;
  for (let i = 0; i < ctrl.length - 1; i++) { const [ax, az] = ctrl[i], [bx, bz] = ctrl[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.5);
    for (let k = i ? 1 : 0; k <= n; k++) { if (pts.length) s += L / n; const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n; pts.push([x, z, s, height(x, z) + 0.3, 0]); } }
  // follow the ground, smoothed over ±3 m, never steeper than stairs (0.7), starting on the summit and arriving on the hilltop
  const sm = pts.map((p, i) => { let a = 0, n = 0; for (let j = Math.max(0, i - 6); j <= Math.min(pts.length - 1, i + 6); j++) { a += pts[j][3]; n++; } return a / n; });
  sm[0] = TOP + 0.02; sm[sm.length - 1] = HT.y + 0.05;
  pts.forEach((p) => { if (BW_CORNERS.some(([cx, cz]) => Math.hypot(p[0] - cx, p[1] - cz) < 1.3)) p[4] = 1; });   // landings at the turns
  for (let i = 0; i < pts.length; i++) if (pts[i][4]) { let j = i; while (j + 1 < pts.length && pts[j + 1][4]) j++; const y = (sm[i] + sm[j]) / 2; for (let k = i; k <= j; k++) sm[k] = y; i = j; }
  for (let i = 1; i < sm.length; i++) { const ds = pts[i][2] - pts[i - 1][2]; sm[i] = Math.min(Math.max(sm[i], sm[i - 1] - 0.7 * ds), sm[i - 1] + 0.7 * ds); }
  for (let i = sm.length - 2; i >= 0; i--) { const ds = pts[i + 1][2] - pts[i][2]; sm[i] = Math.max(Math.min(sm[i], sm[i + 1] + 0.7 * ds), sm[i + 1] - 0.7 * ds); }
  pts.forEach((p, i) => { p[3] = sm[i]; });
  return pts; })();
export const bwY = (b) => { const P = BW[b.i], Q = BW[Math.min(b.i + 1, BW.length - 1)], k = Q[2] > P[2] ? (b.s - P[2]) / (Q[2] - P[2]) : 0; return P[3] + (Q[3] - P[3]) * k; };
BW_CUT = [Math.min(...BW.map((p) => p[0])) - 6, Math.max(...BW.map((p) => p[0])) + 6, Math.min(...BW.map((p) => p[1])) - 6, Math.max(...BW.map((p) => p[1])) + 6];
const TRAILS = [BW.filter((p, i) => i % 10 === 0 || i === BW.length - 1).map((p) => [p[0], p[1]])];
export function trailDist(x, z) { let best = 1e9; for (const t of TRAILS) for (let i = 0; i < t.length - 1; i++) { const [ax, az] = t[i], [bx, bz] = t[i + 1], dx = bx - ax, dz = bz - az, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - ax - dx * k, z - az - dz * k)); } return best; }
export const LOOK_TRAIL = BW, JEEP = { x: -12, z: 1.2, turn: Math.PI / 2 };   // the jeep that brought us, parked at the head of the road (road.js adds node, its group, and lod)
// where you may walk: the summit inside its rail and rocks, the road to the tunnel, the lookout trail (wider as it leaves the
// summit) and the lookout's hilltop. Everything else is fenced off by what you see: the cliff rail, rocks, the mountain walls.
export const PLAT_R = 22;
export const SNOWMAN = { x: 12, z: -4.4, face: [6.5, -3] };
export function edgeR(a) { const cx = Math.cos(a), cz = Math.sin(a); if (PLAT_R * cz >= lip(PLAT_R * cx) + 0.9) return PLAT_R; let lo = 0, hi = PLAT_R;
  for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (m * cz < lip(m * cx) + 0.9) hi = m; else lo = m; } return lo; }
export const trailHalf = (s) => Math.min(20, 2.5 + s * 0.35);
export function walkable(x, z) {
  if (BARE) return true;
  if (Math.hypot(x, z) < edgeR(Math.atan2(z, x)) - 0.4) return true;
  const rd = roadNear(x, z); if (rd && rd.d < 2.4 && x > ROAD.portal.x + 1.2) return true;
  if (polyNear(BW, x, z).d < 0.85) return true;   // on the boardwalk, between its rails
  if (Math.hypot(x - CL.x, z - CL.z) < 15) return true;   // step off into the clearing
  return Math.hypot(x - HT.x, z - HT.z) < 9.1;   // the hilltop, inside its rail (road.js: a ring through the boardwalk's end posts, about 9.55 m round the top)
}
// Trees only grow where the ground is gentle enough (Adriaen 2026-11-15: trees on very steep ground look wrong): full forest up
// to 30°, thinning out to none at 40°. s is 1 - cos(slope angle). Boulders follow the same rule (they would roll off steeper
// ground), most common on the rough slopes just under the limit.
export const TREE_S = [1 - Math.cos((30 * Math.PI) / 180), 1 - Math.cos((40 * Math.PI) / 180)];
export function forestAt(x, z, h, s) {
  if (onIce(x, z, h)) return 0;
  return sstep(0.3, 0.42, fbm(x / 650 + 3, z / 650 - 7, 3)) * (1 - sstep(TREELINE - 50, TREELINE, h)) * (1 - sstep(TREE_S[0], TREE_S[1], s));
}


// the cabin's size (its floor YB above the summit, walls WH, roof RH) and where you stand on the summit
export const W = 12, D = 8, WH = 3.4, RH = 3.0, YB = 0.6, YT = YB + WH, RIDGE = YT + RH;
// standing on the cabin's floor and porch; walls and the lookout's legs push you out
export function groundAt(x, z) { if (BARE) return height(x, z); if (Math.abs(x) < W / 2 + 0.2 && z > -D / 2 - 3 && z < D / 2 + 0.2) return TOP + YB;
  if (Math.abs(x) < 1.3 && z >= D / 2 && z < D / 2 + 1.95) return TOP + (z < D / 2 + 1.5 ? YB : 0.28);   // the entrance's stoop and step (cabin.js ENTRY)
  const g = height(x, z), rd = roadNear(x, z); if (rd && rd.s >= ROAD.b0 && rd.d < 3.2) return Math.max(g, ROAD.y);
  if (BW_CUT && x > BW_CUT[0] && x < BW_CUT[1] && z > BW_CUT[2] && z < BW_CUT[3]) { const b = polyNear(BW, x, z); if (b.d < 1.3) return Math.max(g, bwY(b) + 0.06); } return g; }   // on the bridge or the boardwalk you walk on its boards   // on the bridge you walk on its deck
