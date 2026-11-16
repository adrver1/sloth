// Summit Cabin light maps (Adriaen 2026-11-15: bake them before PR 1): the cabin with its porch and the fire lookout carry a
// baked light map on a second set of UVs (uv1). Two maps, made by props/summit/bake_summit_lightmap.py through
// props/bake_all.py --only summit (the GPU thread runs the bakes):
//   models/summit_lm_ao_<2k|1k>.png  sky occlusion (R): under the porch roof, the eaves, wall feet, the lookout's deck; three's
//                                  aoMap, so it darkens the sky light (the hemisphere) and nothing else; the sun stays live
//   models/summit_lm_night_<2k|1k>.png  the night light (RGB, sRGB): the windows, the door, the porch lamp and the scout camp's
//                                  fire on the walls, the deck and the snow on the roofs; three's lightMap, turned up after dark
//   models/summit_lm.json          { size, scale (what the night map was divided by, to fill the PNG), meshes: { name: triangles }, sig }
// The UVs are not stored: packLightmap() makes them here from the meshes themselves, the same way every time (the exporter,
// props/summit/export_summit.cjs, calls this same function, so the bake and the page agree). Each quad (two triangles side
// by side in one plane) and each lone triangle becomes a rectangle, laid flat, sized by its metres and shelf-packed into the
// atlas (2K, about 4 cm a texel; phones load the 1K copy). If the meshes no longer match the bake (a different triangle count or signature), the maps are left off and the
// console says to bake again, so a stale bake never smears light across the wrong faces.
// Exports receivers(groups), seeThrough(material) (glass the bake skips; export_summit.cjs too), packLightmap(meshes, size), buildLightmap(groups) (cabin.js, after the merges: loads the maps
// and applies them) and lightmapStep(night) (cabin.js cabinStep: the night map's strength).
import * as THREE from 'three';
import { OPT, isPhone } from './land.js';

const SIZE = 2048, PAD = 3, EDGE = 16;   // the atlas, the gap round each rectangle in texels, and a clear border
const NIGHT_GAIN = 1.6;
// the bake normalises the lookout's receivers (Lookout_<n>, LookoutDoor) on their own, by its lamps (bake_summit_lightmap.py), and
// they take more of it still: its lamps are what you climb by at night (Adriaen 2026-11-16: "impossible to see anything")
const GROUP_GAIN = { Lookout: 2.2, LookoutDoor: 2.2 };   // the night map's strength at full dark (the map is normalised by the bake): the knob to tune by eye
let night = null;

// the meshes that take a light map: still, not instanced, lit (Lambert) and not glowing; named Cabin_3, Lookout_0, ...
// see-through glass (the lookout's) is neither lit by the bake nor in its way, so its room takes the sky and its lamp shines out
export const seeThrough = (m) => m.transparent && m.opacity < 0.5;
export function receivers(groups) {
  const out = [];
  // an unnamed mesh is named by its place among the group's unnamed ones, so a named thing added later (the tent's bed and
  // stove in the lookout, after the camp loads) never shifts the names the bake was made with
  for (const g of groups) { let i = 0; g.traverse((o) => { if (!o.isMesh || o.isInstancedMesh) return; if (!o.name) o.name = `${g.name}_${i++}`;
    const m = o.material; if (!Array.isArray(m) && m.isMeshLambertMaterial && !m.emissive?.getHex() && !seeThrough(m)) out.push(o); }); }
  return out;
}
// a signature of the receivers' shapes: their names, triangle counts and the sum of their positions, rounded
export function signature(meshes) {
  let s = 0; for (const o of meshes) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) s += p.getX(i) * 1.3 + p.getY(i) * 1.7 + p.getZ(i) * 1.9; }
  return `${meshes.map((o) => `${o.name}:${tri(o)}`).join(',')}|${s.toFixed(1)}`;
}
const tri = (o) => (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;

// gives every receiver a uv1 attribute: rectangles in metres (world scale), shelf-packed at the largest scale that fits
export function packLightmap(meshes, size = SIZE) {
  const rects = [], A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), n = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const o of meshes) {
    if (o.geometry.index) o.geometry = o.geometry.toNonIndexed();
    const p = o.geometry.attributes.position, nt = p.count / 3; o.updateMatrixWorld(true); o.getWorldScale(sc);
    const uv = new Float32Array(p.count * 2); o.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
    const at = (i, out) => out.fromBufferAttribute(p, i).multiply(sc);
    for (let t = 0; t < nt; t++) {
      // a quad: this triangle and the next share two corners and lie in one plane
      at(t * 3, A); at(t * 3 + 1, B); at(t * 3 + 2, C); n.subVectors(B, A).cross(C.clone().sub(A));
      const area = n.length(); n.normalize();
      let tris = [t];
      if (t + 1 < nt) { let shared = 0; const n2 = new THREE.Vector3(); const q = [0, 1, 2].map((k) => at((t + 1) * 3 + k, new THREE.Vector3()));
        for (const a of q) if (a.distanceToSquared(A) < 1e-8 || a.distanceToSquared(B) < 1e-8 || a.distanceToSquared(C) < 1e-8) shared++;
        n2.subVectors(q[1], q[0]).cross(q[2].clone().sub(q[0])).normalize();
        if (shared === 2 && n2.dot(n) > 0.999) tris = [t, t + 1]; }
      if (area < 1e-10) { for (const k of [0, 1, 2]) uv.set([0, 0], (t * 3 + k) * 2); continue; }   // a sliver: no texels
      u.subVectors(B, A).normalize(); v.crossVectors(n, u);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; const pts = [];
      for (const tt of tris) for (let k = 0; k < 3; k++) { at(tt * 3 + k, D); const pu = D.clone().sub(A).dot(u), pv = D.clone().sub(A).dot(v); pts.push([tt * 3 + k, pu, pv]); u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
      if (v1 - v0 > u1 - u0) { for (const q of pts) q.push(q.splice(1, 1)[0]); [u0, v0, u1, v1] = [v0, u0, v1, u1]; }   // lying down: shelves pack flat rectangles better
      rects.push({ o, uv, pts, u0, v0, w: u1 - u0, h: v1 - v0 });
      t += tris.length - 1;
    }
  }
  // the largest scale (texels a metre) at which a shelf packing fits the atlas
  const total = rects.reduce((s, r) => s + (r.w + 0.05) * (r.h + 0.05), 0);
  let s = Math.sqrt(((size - 2 * EDGE) ** 2) / total) * 0.95;
  rects.sort((a, b) => b.h - a.h || b.w - a.w);
  for (;;) {
    let x = EDGE, y = EDGE, rowH = 0, ok = true;
    for (const r of rects) { const w = Math.max(1, Math.ceil(r.w * s)) + 2 * PAD, h = Math.max(1, Math.ceil(r.h * s)) + 2 * PAD;
      if (x + w > size - EDGE) { x = EDGE; y += rowH; rowH = 0; }
      if (y + h > size - EDGE || w > size - 2 * EDGE) { ok = false; break; }
      r.x = x + PAD; r.y = y + PAD; x += w; rowH = Math.max(rowH, h); }
    if (ok) break; s *= 0.95;
  }
  for (const r of rects) for (const [i, pu, pv] of r.pts) r.uv.set([(r.x + (pu - r.u0) * s) / size, 1 - (r.y + (pv - r.v0) * s) / size], i * 2);
  return { texelsPerMetre: s, rects: rects.length, area: total };
}

export let lmReady = Promise.resolve();   // resolves once the maps are on (or left off): the loading card waits for it (summit/main.js)
export function buildLightmap(groups) {
  if (!OPT.lm) return;
  const meshes = receivers(groups);
  lmReady = fetch('models/summit_lm.json').then((r) => (r.ok ? r.json() : null)).then((J) => {
    if (!J) return;   // not baked yet
    const sig = signature(meshes);
    if (J.sig !== sig) { console.warn('summit light maps: the cabin or lookout changed since the bake; run props/bake_all.py --only summit'); return; }
    packLightmap(meshes, J.size);
    const k = isPhone ? 1 : J.size / 1024;   // phones take the 1K maps, as in the camp
    const load = (f, srgb) => new THREE.TextureLoader().loadAsync(f).then((t) => { t.channel = 1; t.flipY = true; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; });
    return Promise.all([load(`models/summit_lm_ao_${k}k.png`), load(`models/summit_lm_night_${k}k.png`, true)]).then(([ao, nightTex]) => {
      const mats = new Map();
      for (const o of meshes) {   // each look gets its own copy with the maps (a mesh without uv1 must never share one), and one per group gain
        const gain = NIGHT_GAIN * (GROUP_GAIN[o.name.split('_')[0]] ?? GROUP_GAIN[o.name] ?? 1), key = `${o.material.uuid}|${gain}`;
        if (!mats.has(key)) { const m0 = o.material, m = m0.clone(); m.onBeforeCompile = m0.onBeforeCompile; m.customProgramCacheKey = m0.customProgramCacheKey;
          m.aoMap = ao; m.aoMapIntensity = 0.8; m.lightMap = nightTex; m.lightMapIntensity = 0; m.userData.nightGain = gain; mats.set(key, m); }
        o.material = mats.get(key);
      }
      night = [...mats.values()];
    });
  }).catch((e) => console.warn('summit light maps', e));
}
// the night map's strength: off by day, up to the baked brightness after dark (night 0..1, daylight.js LIGHT)
export function lightmapStep(k) { if (night) for (const m of night) m.lightMapIntensity = m.userData.nightGain * k; }
