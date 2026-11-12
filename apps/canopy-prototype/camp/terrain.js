// Canopy Camp terrain (forest-ground note, Adriaen 2026-11-12: "I support the bowl geometry and small height variations"):
// one height function for the ground, shared by everything that stands on it. The camp floor stays level (at most a 3 cm dip,
// so the props stay seated without a rebake), a shallow bowl rim rises at the clearing's edge, the forest floor beyond is
// hummocky, the trees stand on root mounds, and the height is exactly 0 wherever people and sloths walk: the camp, the glade
// path, the glade and the jeep's track. forest.js calls initTerrain() once its layout is known; ground.js builds the mesh.
//   groundHeight(x, z)  metres above y = 0 (also window.__groundHeight, for modules that load before or without this one)
//   heightGrid(n)       an n x n grid over 2 * FAR metres, rows +z, for the GPU bake (props/shadow/export_casters.cjs)
let L = null;
const mounds = [];                                    // [x, z, radius, height, outX, outZ]: out = 0,0 for a round mound
// value noise on an integer lattice (a fixed integer hash, so it is the same on every device), smooth, 0..1
const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => 0.55 * vnoise(x, z) + 0.3 * vnoise(x * 2.1 + 5.2, z * 2.1 - 1.3) + 0.15 * vnoise(x * 4.3 - 7.1, z * 4.3 + 2.9);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const FAR = 30;                                // the ground mesh's radius (the old forest-floor disc)

export function initTerrain({ RC, pathDist, jeepDist, hero }) {
  L = { RC, pathDist, jeepDist };
  // the big tree at the clearing's edge sits on a root mound on its forest side only: the sloths come down its camp side
  const h0 = hero[0], l0 = Math.hypot(h0.x, h0.z); mounds.push([h0.x, h0.z, 2.6, 0.45, h0.x / l0, h0.z / l0]);
}
export function addMound(x, z, r, h) { mounds.push([x, z, r, h, 0, 0]); }

export function groundHeight(x, z) {
  if (!L) return 0;
  const { RC } = L, r = Math.hypot(x, z);
  const dip = -0.03 * vnoise(x * 0.28 + 3.1, z * 0.28 - 8.4) * (1 - ss(RC - 2.5, RC - 1.2, r));   // a gentle swell in the camp: catches the light
  const k = vnoise(Math.atan2(z, x) * 1.6 + 11, 0.5);
  const bowl = (0.22 + 0.3 * k) * ss(RC - 0.8, RC + 2.2, r);                                     // the rim: 0.2 to 0.5 m, a shallow bowl
  const humm = (1.1 * fbm(x * 0.22, z * 0.22) - 0.25) * ss(RC + 0.5, RC + 5, r);                // hummocks and hollows in the forest
  let mound = 0;
  for (const [mx, mz, mr, mh, ox, oz] of mounds) {
    const dx = x - mx, dz = z - mz, d = Math.hypot(dx, dz); if (d > mr) continue;
    const side = ox || oz ? ss(-0.35, 0.45, (dx * ox + dz * oz) / Math.max(d, 1e-3)) : 1;
    mound = Math.max(mound, mh * (1 - ss(0, mr, d)) * side);
  }
  // kept level where people walk: the glade path and glade (ribbon 0.75 m each side) and the jeep's track (1.35 m), plus a
  // ground-mesh cell, then a bank about 3 m wide
  const open = Math.min(ss(3.0, 6.0, L.pathDist(x, z)), ss(3.4, 6.4, L.jeepDist(x, z)));   // level a full mesh cell past the ribbons and the glade's grass disc, so the bank never slopes up through them
  return dip + (bowl + humm + mound) * open;
}
export function heightGrid(n = 128) {
  const out = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = +groundHeight(((i + 0.5) / n * 2 - 1) * FAR, ((j + 0.5) / n * 2 - 1) * FAR).toFixed(3);
  return { n, far: FAR, rows: "+z", data: out };
}
export { vnoise };
window.__groundHeight = groundHeight; window.__terrainGrid = heightGrid;
