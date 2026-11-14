// Canopy Camp terrain (forest-ground note, Adriaen 2026-11-12: "I support the bowl geometry and small height variations"):
// one height function for the ground, shared by everything that stands on it. The camp floor stays level (at most a 3 cm dip,
// and none under the props: FLAT), a shallow bowl rim rises at the clearing's edge, the forest floor beyond is
// hummocky, the trees stand on root mounds, and the height is exactly 0 wherever people and sloths walk: the camp, the glade
// path, the glade and the jeep's track (camp/layout.js). ground.js builds the mesh.
//   groundHeight(x, z)  metres above y = 0
//   jeepDist(x, z)      distance to the jeep's track, or 1e9 with ?jeep=none (no track)
//   addMound(x, z, r, h) a round root mound (forest.js puts one under each forest tree)
//   heightGrid(n)       an n x n grid over 2 * FAR metres, rows +z, for the GPU bake (props/shadow/export_casters.cjs)
// It imports core.js only for the ?jeep option (JEEP); core.js is always evaluated first anyway (main.js imports it before
// forest.js), so this changes no load order, but it does tie the height function to the page's boot module.
import { JEEP } from "./core.js";
import { CRATE, FAR, FIRE, HAMMOCK, HERO, JEEP_TRACK, LAUNDRY, RC, SEATS, TABLE, TENT, WOOD_PILE, pathDist } from "./layout.js";
import { lineDist, sstep, vnoise } from "./util.js";

const mounds = [];                                    // [x, z, radius, height, outX, outZ]: out = 0,0 for a round mound
const fbm = (x, z) => 0.55 * vnoise(x, z) + 0.3 * vnoise(x * 2.1 + 5.2, z * 2.1 - 1.3) + 0.15 * vnoise(x * 4.3 - 7.1, z * 4.3 + 2.9);
export const jeepDist = JEEP === "none" ? () => 1e9 : (x, z) => lineDist(JEEP_TRACK.pts, x, z);
// a big tree with a mound (layout.js HERO: the one at the clearing's edge) sits on it on its forest side only: the sloths come down its camp side
for (const { at: h, mound: m } of HERO) if (m) { const l = Math.hypot(h.x, h.z); mounds.push([h.x, h.z, m.r, m.h, h.x / l, h.z / l]); }
export function addMound(x, z, r, h) { mounds.push([x, z, r, h, 0, 0]); }
// where the props stand on the camp floor, [x, z, radius]: the swell is kept at exactly 0 under them, so they neither float nor sink
// (R2-181: up to 4 cm, the crate, a seat and the wood pile), easing back in over FLAT_EDGE metres; the tent's floor is the rectangle
// TENT.bare keeps free of grass
const FLAT = [[FIRE.x, FIRE.z, 1.3], ...SEATS.map(({ at }) => [at.x, at.z, 0.95]), [TABLE.at.x, TABLE.at.z, 0.9], [CRATE.at.x, CRATE.at.z, 0.8],
  [WOOD_PILE.at.x + 0.3 * WOOD_PILE.side.x, WOOD_PILE.at.z + 0.3 * WOOD_PILE.side.z, 1.2], [HAMMOCK.a.x, HAMMOCK.a.z, 0.4], [HAMMOCK.b.x, HAMMOCK.b.z, 0.4],
  ...LAUNDRY.posts.map((p) => [p.x, p.z, 0.35])];
const FLAT_EDGE = 0.6;
function propFloor(x, z) {   // 1 under a prop, easing to 0 FLAT_EDGE metres out
  let d = 1e9;
  for (const [fx, fz, r] of FLAT) d = Math.min(d, Math.hypot(x - fx, z - fz) - r);
  const [a, b] = TENT.toLocal(x, z); d = Math.min(d, Math.max(-1.8 - a, a - 2.1, Math.abs(b) - 1.95));
  return 1 - sstep(0, FLAT_EDGE, d);
}

export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const dip = r < RC - 1.2 ? -0.03 * vnoise(x * 0.28 + 3.1, z * 0.28 - 8.4) * (1 - sstep(RC - 2.5, RC - 1.2, r)) * (1 - propFloor(x, z)) : 0;   // a gentle swell in the camp, between the props: catches the light
  const k = vnoise(Math.atan2(z, x) * 1.6 + 11, 0.5);
  const bowl = (0.22 + 0.3 * k) * sstep(RC - 0.8, RC + 2.2, r);                                     // the rim: 0.2 to 0.5 m, a shallow bowl
  const humm = (1.1 * fbm(x * 0.22, z * 0.22) - 0.25) * sstep(RC + 0.5, RC + 5, r);                // hummocks and hollows in the forest
  let mound = 0;
  for (const [mx, mz, mr, mh, ox, oz] of mounds) {
    const dx = x - mx, dz = z - mz, d = Math.hypot(dx, dz); if (d > mr) continue;
    const side = ox || oz ? sstep(-0.35, 0.45, (dx * ox + dz * oz) / Math.max(d, 1e-3)) : 1;
    mound = Math.max(mound, mh * (1 - sstep(0, mr, d)) * side);
  }
  // kept level where people walk: the glade path and glade (ribbon PATH_HALF, 0.75 m each side) and the jeep's track (TRACK_HALF, 1.35 m), plus a
  // ground-mesh cell, then a bank about 3 m wide
  const open = Math.min(sstep(3.0, 6.0, pathDist(x, z)), sstep(3.4, 6.4, jeepDist(x, z)));   // level a full mesh cell past the ribbons and the glade's grass disc, so the bank never slopes up through them
  return dip + (bowl + humm + mound) * open;
}
export function heightGrid(n = 128) {
  const out = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = +groundHeight(((i + 0.5) / n * 2 - 1) * FAR, ((j + 0.5) / n * 2 - 1) * FAR).toFixed(3);
  return { n, far: FAR, rows: "+z", data: out };
}
