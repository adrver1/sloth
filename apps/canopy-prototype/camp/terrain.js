// Canopy Camp terrain (forest-ground note, Adriaen 2026-11-12: "I support the bowl geometry and small height variations"):
// one height function for the ground, shared by everything that stands on it. The camp floor stays level (at most a 3 cm dip,
// so the props stay seated without a rebake), a shallow bowl rim rises at the clearing's edge, the forest floor beyond is
// hummocky, the trees stand on root mounds, and the height is exactly 0 wherever people and sloths walk: the camp, the glade
// path, the glade and the jeep's track (camp/layout.js). ground.js builds the mesh.
//   groundHeight(x, z)  metres above y = 0 (called for every ground vertex and plant and for the camera each frame, so it
//                       returns early inside the camp and scans the path and the track only where there is height to level)
//   jeepDist(x, z)      distance to the jeep's track, or 1e9 with ?jeep=none (no track)
//   addMound(x, z, r, h) a round root mound (forest.js puts one under each forest tree)
//   heightGrid(n)       an n x n grid over 2 * FAR metres, rows +z, for the GPU bake (props/shadow/export_casters.cjs)
// It imports core.js only for the ?jeep option (JEEP); core.js is always evaluated first anyway (main.js imports it before
// forest.js), so this changes no load order, but it does tie the height function to the page's boot module.
import { JEEP } from "./core.js";
import { FAR, HERO, JEEP_TRACK, RC, pathDist } from "./layout.js";
import { lineDist, sstep } from "./util.js";

const mounds = [];                                    // [x, z, radius, height, outX, outZ]: out = 0,0 for a round mound
let flatIn = RC - 0.8;                                // inside this radius there is no bowl, no hummock and no mound: only the dip
const pushMound = (m) => { mounds.push(m); flatIn = Math.min(flatIn, Math.hypot(m[0], m[1]) - m[2]); };
// value noise on an integer lattice (a fixed integer hash, so it is the same on every device), smooth, 0..1
const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// two octaves only: a finer one (period about 1 m) is finer than the ground mesh's rings, so the mesh could not follow it and the
// trunks, ferns and plants placed by this function floated or sank by up to 27 cm (review R2-164). ground.js paints that octave
// as a shading bump instead; the 0.075 keeps the hummocks' mean height where the third octave had it.
const fbm = (x, z) => 0.55 * vnoise(x, z) + 0.3 * vnoise(x * 2.1 + 5.2, z * 2.1 - 1.3) + 0.075;
export const jeepDist = JEEP === "none" ? () => 1e9 : (x, z) => lineDist(JEEP_TRACK.pts, x, z);
// the track's bounding box grown by the bank's outer edge (6.4 m): the track levels nothing outside it, so groundHeight skips the scan there
const JB = (() => { const b = [1e9, 1e9, -1e9, -1e9]; if (JEEP !== "none") for (const p of JEEP_TRACK.pts) { b[0] = Math.min(b[0], p.x); b[1] = Math.min(b[1], p.z); b[2] = Math.max(b[2], p.x); b[3] = Math.max(b[3], p.z); }
  return [b[0] - 6.4, b[1] - 6.4, b[2] + 6.4, b[3] + 6.4]; })();
// the big tree at the clearing's edge sits on a root mound on its forest side only: the sloths come down its camp side
{ const h0 = HERO[0], l0 = Math.hypot(h0.x, h0.z); pushMound([h0.x, h0.z, 2.6, 0.45, h0.x / l0, h0.z / l0]); }
export function addMound(x, z, r, h) { pushMound([x, z, r, h, 0, 0]); }

// The camp inside flatIn has no bowl, hummocks or mound, so most calls end after the dip, and the two polyline scans
// for the level ground run only where there is height to level (review R2-075).
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const dip = -0.03 * vnoise(x * 0.28 + 3.1, z * 0.28 - 8.4) * (1 - sstep(RC - 2.5, RC - 1.2, r));   // a gentle swell in the camp: catches the light
  if (r < flatIn) return dip;
  let mound = 0;
  for (const [mx, mz, mr, mh, ox, oz] of mounds) {
    const dx = x - mx, dz = z - mz, d = Math.hypot(dx, dz); if (d > mr) continue;
    const side = ox || oz ? sstep(-0.35, 0.45, (dx * ox + dz * oz) / Math.max(d, 1e-3)) : 1;
    mound = Math.max(mound, mh * (1 - sstep(0, mr, d)) * side);
  }
  const k = vnoise(Math.atan2(z, x) * 1.6 + 11, 0.5);
  const bowl = (0.22 + 0.3 * k) * sstep(RC - 0.8, RC + 2.2, r);                                     // the rim: 0.2 to 0.5 m, a shallow bowl
  const humm = r < RC + 0.5 ? 0 : (1.1 * fbm(x * 0.22, z * 0.22) - 0.25) * sstep(RC + 0.5, RC + 5, r);   // hummocks and hollows in the forest
  const lift = bowl + humm + mound; if (lift === 0) return dip;
  // kept level where people walk: the glade path and glade (ribbon PATH_HALF, 0.75 m each side) and the jeep's track (TRACK_HALF, 1.35 m), plus a
  // ground-mesh cell, then a bank about 3 m wide. Level a full mesh cell past the ribbons and the glade's grass disc, so the bank never slopes up through them
  const onPath = sstep(3.0, 6.0, pathDist(x, z)); if (onPath === 0) return dip;
  const offTrack = x < JB[0] || z < JB[1] || x > JB[2] || z > JB[3] ? 1 : sstep(3.4, 6.4, jeepDist(x, z));
  return dip + lift * Math.min(onPath, offTrack);
}
export function heightGrid(n = 128) {
  const out = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = +groundHeight(((i + 0.5) / n * 2 - 1) * FAR, ((j + 0.5) / n * 2 - 1) * FAR).toFixed(3);
  return { n, far: FAR, rows: "+z", data: out };
}
export { vnoise };
