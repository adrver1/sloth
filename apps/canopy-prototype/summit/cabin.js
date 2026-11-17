// Summit Cabin: the big log cabin with its porch to the south, the fire lookout on the watch hill, and bakeStatic(root), which
// merges a group's still meshes into one draw per look. Windows, door and porch lights are exported for main.js's night glow.
// The cabin and lookout carry baked light maps (lightmap.js); bakeSources() gives the bake its night lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { D, R, RH, RIDGE, TOP, TOWER, TRIS, W, WH, YB, YT, mulberry, sstep } from './land.js';
import { canvasTex, hazed, scene, tris } from './core.js';
import { m4, q, sc, up, v3 } from './forest.js';
import { buildLightmap, lightmapStep } from './lightmap.js';
import { snowC, snowTex } from './terrain.js';
import { groundPaint } from './groundLight.js';
import { buildLookout, lookoutInside, lookoutLamps, lookoutRoomLamp } from './lookout.js';

// ---------------------------------------------------------------- the cabin: a big log cabin with a porch toward the south (-z)
const cabin = new THREE.Group();
const logTex = canvasTex(256, 512, (g, w, h) => { const n = 11, lh = h / n, r = mulberry(3);
  for (let k = 0; k < n; k++) { const y = k * lh, gr = g.createLinearGradient(0, y, 0, y + lh);
    gr.addColorStop(0, '#463d36'); gr.addColorStop(0.2, '#857a6c'); gr.addColorStop(0.5, '#a39784'); gr.addColorStop(0.85, '#6e6355'); gr.addColorStop(1, '#3c342e');
    g.fillStyle = gr; g.fillRect(0, y, w, lh); g.strokeStyle = 'rgba(30,24,20,.45)'; for (let i = 0; i < 9; i++) { const yy = y + r() * lh; g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy + R(-3, 3)); g.stroke(); }
    g.fillStyle = '#cfc5b6'; g.fillRect(0, y + lh - 2, w, 3); } }, true);
const stoneTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#4c4f55'; g.fillRect(0, 0, w, h); const r = mulberry(5);
  for (let i = 0; i < 40; i++) { const c = 90 + r() * 50 | 0; g.fillStyle = `rgb(${c},${c + 3},${c + 8})`; g.beginPath(); g.ellipse(r() * w, r() * h, 9 + r() * 10, 6 + r() * 6, r() * 3, 0, 7); g.fill(); } }, true);
const winTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3a2416'; g.fillRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h * 0.62, 4, w / 2, h / 2, w * 0.62);
  gr.addColorStop(0, '#ffe7ad'); gr.addColorStop(1, '#d0782c'); g.fillStyle = gr; g.fillRect(12, 12, w - 24, h - 24);
  g.fillStyle = '#3a2416'; g.fillRect(w / 2 - 4, 12, 8, h - 24); g.fillRect(12, h / 2 - 4, w - 24, 8); g.fillStyle = '#f4f7fb'; g.fillRect(2, h - 13, w - 4, 11); });
const doorTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#5b3a24'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(30,18,10,.6)'; for (let x = 0; x < w; x += 13) g.fillRect(x, 0, 2, h);
  const gr = g.createRadialGradient(w / 2, 30, 2, w / 2, 30, 20); gr.addColorStop(0, '#ffe7ad'); gr.addColorStop(1, '#d0782c'); g.fillStyle = gr; g.fillRect(16, 14, w - 32, 32); g.fillStyle = '#d9b36a'; g.fillRect(w - 14, 70, 5, 5); });
const tinTex = canvasTex(128, 128, (g, w, h) => { const r = mulberry(4);   // corrugated tin gone to rust: ridges across, streaks running down
  for (let x = 0; x < w; x += 8) { const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, '#4a2a22'); gr.addColorStop(0.5, '#86503a'); gr.addColorStop(1, '#3a201a'); g.fillStyle = gr; g.fillRect(x, 0, 8, h); }
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '170,90,45' : '60,50,48'},${0.25 + 0.35 * r()})`; g.fillRect(r() * w, r() * h * 0.5, 2 + r() * 6, h * (0.3 + 0.7 * r())); } }, true);
tinTex.repeat.set(5, 1);
const lam = (o) => hazed(new THREE.MeshLambertMaterial(o));
// Fewer draw calls (Adriaen 2026-11-15: "how can we get 150 draws down?"): once a prop group is built, its still meshes are
// merged into one mesh per look. Plain-coloured materials become one material with the colours moved into vertex colours;
// textured or glowing ones keep their own material and merge only with meshes that share it. Instanced, multi-material and
// skipped meshes stay as they are.
export function bakeStatic(root, skip = () => false) {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), rel = new THREE.Matrix4(), c = new THREE.Color();
  root.traverse((o) => { if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || !o.visible || skip(o)) return;
    const m = o.material, own = !!(m.map || m.aoMap || m.emissiveMap || m.emissive?.getHex() || !(m.isMeshLambertMaterial || m.isMeshBasicMaterial) || !m.colorWrite);
    const key = [own ? (m.emissive?.getHex() ? m.uuid : [m.type, m.map?.uuid, m.aoMap?.uuid, m.color.getHex(), m.vertexColors, m.colorWrite].join()) : m.type,   // glowing materials change at night, so only meshes sharing one merge
      m.side, m.transparent, m.opacity, m.alphaTest, m.depthWrite, m.customProgramCacheKey(), o.castShadow, o.receiveShadow, o.renderOrder].join('|');
    let g = o.geometry.clone().applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)); if (g.index) g = g.toNonIndexed(); if (!g.attributes.normal) g.computeVertexNormals();
    const keep = ['position', 'normal', ...(own && m.map ? ['uv'] : []), ...(m.aoMap ? ['uv1'] : []), ...(own && m.vertexColors ? ['color'] : [])];   // uv1: a baked map's own UVs (the scout camp's occlusion)
    if (!own) { const n = g.attributes.position.count, C = new Float32Array(n * 3), vc = m.vertexColors && g.attributes.color; c.copy(m.color);
      for (let i = 0; i < n; i++) { C[i * 3] = c.r * (vc ? vc.getX(i) : 1); C[i * 3 + 1] = c.g * (vc ? vc.getY(i) : 1); C[i * 3 + 2] = c.b * (vc ? vc.getZ(i) : 1); }
      g.setAttribute('color', new THREE.BufferAttribute(C, 3)); keep.push('color'); }
    if (keep.includes('uv') && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const a of Object.keys(g.attributes)) { if (!keep.includes(a)) { g.deleteAttribute(a); continue; }   // plain floats, colour as RGB, so every mesh merges
      const A = g.attributes[a], k = a === 'color' ? 3 : A.itemSize, F = new Float32Array(A.count * k); for (let i = 0; i < A.count; i++) for (let e = 0; e < k; e++) F[i * k + e] = A.getComponent(i, e);
      g.setAttribute(a, new THREE.BufferAttribute(F, k)); }
    if (!buckets.has(key)) buckets.set(key, { o, own, geos: [], gone: [] }); const b = buckets.get(key); b.geos.push(g); b.gone.push(o); });
  let n = 0;
  for (const b of buckets.values()) { if (b.geos.length < 2 && b.own) continue;
    let mat = b.o.material; if (!b.own) { const m0 = mat; mat = m0.clone(); mat.onBeforeCompile = m0.onBeforeCompile; mat.customProgramCacheKey = m0.customProgramCacheKey; mat.color.set(0xffffff); mat.vertexColors = true; }
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), mat); mesh.castShadow = b.o.castShadow; mesh.receiveShadow = b.o.receiveShadow; mesh.renderOrder = b.o.renderOrder; root.add(mesh);
    for (const o of b.gone) o.removeFromParent(); n += b.gone.length - 1; }
  return n;   // draws saved
}
export const M = { log: lam({ map: logTex }), stone: lam({ map: stoneTex }), roof: lam({ map: tinTex }), snow: lam({ color: '#f3f7fc' }), wood: lam({ color: '#5a5048' }) };
const part = (geo, mat, x, y, z, parent = cabin) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
{ // walls: four log planes and the two gable triangles, one draw, 10 triangles
  const plane = (w, ry, x, z) => new THREE.PlaneGeometry(w, WH).rotateY(ry).translate(x, YB + WH / 2, z).toNonIndexed();
  const gable = (sx) => { const x = sx * W / 2, p = [[x, YT, -D / 2], [x, YT, D / 2], [x, RIDGE, 0]], o = sx > 0 ? [0, 2, 1] : [0, 1, 2], P = [], UV = [];
    for (const i of o) { P.push(...p[i]); UV.push(p[i][2] / D + 0.5, (p[i][1] - YB) / WH); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.computeVertexNormals(); return g; };
  part(mergeGeometries([plane(W, Math.PI, 0, -D / 2), plane(W, 0, 0, D / 2), plane(D, -Math.PI / 2, -W / 2, 0), plane(D, Math.PI / 2, W / 2, 0), gable(1), gable(-1)]), M.log, 0, 0, 0);
}
part(new THREE.BoxGeometry(W + 0.3, 0.9, D + 0.3), M.stone, 0, 0.15, 0);
const roofSide = (ry, len, pitch, at, width, slab = 0.22) => {   // a roof slab hinged at `at`, sloping away along +z of its turn, with snow on it
  const turn = new THREE.Group(); turn.position.copy(at); turn.rotation.y = ry; cabin.add(turn);
  const tilt = new THREE.Group(); tilt.rotation.x = pitch; turn.add(tilt);
  part(new THREE.BoxGeometry(width, slab, len), M.roof, 0, 0, len / 2, tilt); part(new THREE.BoxGeometry(width + 0.1, 0.28, len * 0.72), M.snow, 0, slab / 2 + 0.12, len * 0.36, tilt);   // the snow has slid, the rusty tin shows at the eaves
};
const pitch = Math.atan2(RH, D / 2), rlen = Math.hypot(RH, D / 2) + 0.75;
roofSide(0, rlen, pitch, new THREE.Vector3(0, RIDGE + 0.05, 0), W + 1.4);
roofSide(Math.PI, rlen, pitch, new THREE.Vector3(0, RIDGE + 0.05, 0), W + 1.4);
roofSide(Math.PI, 3.5, 0.14, new THREE.Vector3(0, YT - 0.15, -D / 2), W + 0.6, 0.18);   // the porch roof
roofSide(0, 1.7, 0.42, new THREE.Vector3(0, YB + 2.78, D / 2 - 0.05), 2.6, 0.12);   // the entrance's little roof (ENTRY, below)
part(new THREE.BoxGeometry(1.0, 4.4, 1.0), M.stone, 3.4, YT + 1.9, 1.7);
part(new THREE.BoxGeometry(1.15, 0.22, 1.15), M.snow, 3.4, YT + 4.2, 1.7);
part(new THREE.BoxGeometry(W, 0.3, 3.0), M.wood, 0, YB - 0.15, -(D / 2 + 1.5));   // porch deck
part(new THREE.BoxGeometry(1.8, 0.45, 0.5), M.wood, -2.7, YB + 0.22, -(D / 2 + 0.45));   // bench by the door
{ const ends = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3b2a1c'; g.fillRect(0, 0, w, h); const r = mulberry(9);
    for (let y = 8; y < h; y += 15) for (let x = 8 + (y % 2) * 7; x < w; x += 15) { const rr = 6 + r() * 2.5; g.fillStyle = '#c99c66'; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,80,45,.7)'; g.beginPath(); g.arc(x, y, rr * 0.5, 0, 7); g.stroke(); } }, true);
  const em = lam({ map: ends }); part(new THREE.BoxGeometry(0.9, 1.6, 3.4), [em, em, M.snow, em, em, em], -(W / 2 + 0.55), 0.8, 0.4); }   // woodpile: log ends painted, not modelled
export const winMat = lam({ map: winTex, emissive: '#ffffff', emissiveMap: winTex });
const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), winMat, 6);
[[-3.6, YB + 1.9, -D / 2 - 0.02, Math.PI, 1.5], [3.6, YB + 1.9, -D / 2 - 0.02, Math.PI, 1.5], [-3.2, YB + 1.9, D / 2 + 0.02, 0, 1.4], [2.0, YB + 1.9, D / 2 + 0.02, 0, 1.4], [W / 2 + 0.02, YT + 0.9, 0, Math.PI / 2, 1.1], [-W / 2 - 0.02, YT + 0.9, 0, -Math.PI / 2, 1.1]]
  .forEach(([x, y, z, ry, s], i) => windows.setMatrixAt(i, m4.compose(v3.set(x, y, z), q.setFromAxisAngle(up, ry), sc.set(s, s, 1))));
export const doorMat = lam({ map: doorTex, emissive: '#ffffff', emissiveMap: doorTex });
const door = part(new THREE.PlaneGeometry(1.2, 2.3), doorMat, 0, YB + 1.15, -D / 2 - 0.02);
const lampMat = new THREE.MeshBasicMaterial({ color: '#ffd28a' });
part(new THREE.BoxGeometry(0.18, 0.28, 0.18), lampMat, 1.05, YB + 2.45, -D / 2 - 0.14);
// the main entrance, on the camp side (Adriaen 2026-11-16: "it needs a main entrance on the camp side. Keep the veranda with the
// view, but improve the opposite side"): a door in a plank frame under a little tin roof on two brackets, a stoop with a step
// down to the snow, a lamp by the door, a mat, and a pair of snowshoes leaning on the wall. The trodden path from the fire
// already ends here (road.js paintCampSnow DOOR). It stays bakeStatic's own mesh (userData.door), so bakeSources finds it.
const ENTRY = { x: 0, w: 2.6, deep: 1.5 };
const backDoor = part(new THREE.PlaneGeometry(1.2, 2.3), doorMat, ENTRY.x, YB + 1.15, D / 2 + 0.02); backDoor.userData.door = true; door.userData.door = true;
for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.14, 2.45, 0.1), M.wood, ENTRY.x + sx * 0.67, YB + 1.22, D / 2 + 0.05);   // the frame's jambs
part(new THREE.BoxGeometry(1.6, 0.16, 0.12), M.wood, ENTRY.x, YB + 2.4, D / 2 + 0.06);   // and its head
part(new THREE.BoxGeometry(ENTRY.w, 0.3, ENTRY.deep), M.wood, ENTRY.x, YB - 0.15, D / 2 + ENTRY.deep / 2);   // the stoop
part(new THREE.BoxGeometry(1.7, 0.28, 0.45), M.wood, ENTRY.x, 0.14, D / 2 + ENTRY.deep + 0.22);   // its step
part(new THREE.BoxGeometry(1.0, 0.02, 0.6), lam({ color: '#7a4632' }), ENTRY.x, YB + 0.01, D / 2 + 0.5);   // the mat
for (const sx of [-1, 1]) { const b = part(new THREE.BoxGeometry(0.1, 0.1, 1.0), M.wood, ENTRY.x + sx * 1.1, YB + 2.3, D / 2 + 0.38); b.rotation.x = -0.75; }   // the roof's brackets
part(new THREE.BoxGeometry(0.16, 0.26, 0.16), lampMat, ENTRY.x + 1.0, YB + 2.05, D / 2 + 0.12);   // the lamp
{ const shoeTex = canvasTex(64, 160, (g, w, h) => { g.strokeStyle = '#6b4a2e'; g.lineWidth = 7; g.beginPath(); g.ellipse(w / 2, h * 0.42, w / 2 - 5, h * 0.4 - 4, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 6, h * 0.8); g.lineTo(w / 2, h - 4); g.lineTo(w / 2 + 6, h * 0.8); g.stroke();   // the frame and its tail
    g.strokeStyle = 'rgba(210,190,150,.9)'; g.lineWidth = 2; for (let y = 18; y < h * 0.78; y += 9) { g.beginPath(); g.moveTo(8, y); g.lineTo(w - 8, y + 5); g.moveTo(w - 8, y); g.lineTo(8, y + 5); g.stroke(); } });   // the lacing
  const shoeM = lam({ map: shoeTex, alphaTest: 0.5, side: THREE.DoubleSide });
  for (const [x, ry] of [[-1.3, 0.12], [-1.62, -0.08]]) { const s = part(new THREE.PlaneGeometry(0.34, 0.85), shoeM, ENTRY.x + x, YB + 0.44, D / 2 + 0.16); s.rotation.set(-0.22, ry, 0); s.castShadow = true; } }
export const porchLight = new THREE.PointLight('#ffb760', 0, 22, 1.6);
export const inside = new THREE.PointLight('#ffad55', 0, 16, 1.6);

// ---------------------------------------------------------------- the snow banked against the cabin
// Adriaen 2026-11-16: "a solid 10 cm of snow on the roof, but on the ground it's not nearly as deep". Snow drifts up the stone
// footing on the east, north and west walls (the porch covers the south one, the entrance's stoop the middle of the north one):
// 0.15 to 0.6 m up the wall in slow swells, fuller in the corners, out 0.5 to 1.5 m (Adriaen: the first, even bank "doesn't look
// very organic"). Its own mesh, outside the cabin's group, so the cabin's baked light map still fits; it takes the ground's bake
// and the ground's paint (groundLight.js groundPaint: the paths and prints run over it, not under it) and the terrain's snow texture. 276 triangles, one draw.
function snowBank() {
  const X = (W + 0.3) / 2, Z = (D + 0.3) / 2, OUT = [[-0.04, 1], [0.32, 0.74], [0.7, 0.26], [1.05, -0.06]];   // the profile: (out, share of the height), as a share of the reach
  const pts = [];   // [x, z, outward normal x, z, distance along the wall]
  let run = 0, nooks = [];   // nooks: where along the wall the corners are
  const side = (x0, z0, x1, z1, nx, nz) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 0.7));
    for (let i = 0; i <= n; i++) { pts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, nx, nz, run + L * i / n]); } run += L; };
  const corner = (x, z, a0, a1) => { for (let i = 1; i < 4; i++) { const a = a0 + (a1 - a0) * i / 4; pts.push([x, z, Math.cos(a), Math.sin(a), run]); } nooks.push(run); };
  // the drift's height and reach along the wall: slow swells (sums of sines, so neighbours agree), fuller in the corners, and
  // sloping away to nothing over the last 2 m at each end, so no end shows a cut
  const swell = (d, k) => 0.5 + 0.28 * Math.sin(d * 0.83 + k) + 0.16 * Math.sin(d * 2.1 + 2 * k) + 0.06 * Math.sin(d * 4.7 + k);
  const strips = [];
  const strip = () => { const P = [], UV = [], I = [], k = 1.7 * strips.length + 0.4, len = pts[pts.length - 1][4];
    pts.forEach(([x, z, nx, nz, d], i) => { const nook = 0.2 * Math.max(0, ...nooks.map((c) => 1 - sstep(0, 1.6, Math.abs(d - c)))), fade = sstep(0, 2, Math.min(d, len - d));
      const hh = (0.16 + 0.3 * swell(d, k) + nook) * fade, reach = (0.55 + 0.6 * swell(d * 0.7, k + 2) + 1.5 * nook) * (0.35 + 0.65 * fade);
      for (const [o, f] of OUT) { const px = x + nx * o * reach, pz = z + nz * o * reach; P.push(px, f * hh, pz); UV.push(px / 6, pz / 6); } });
    for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < OUT.length - 1; j++) { const a = i * OUT.length + j, b = a + OUT.length; I.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); strips.push(g); pts.length = 0; run = 0; nooks = []; };
  // the east wall (x -) from the porch round to the stoop, then the stoop round the west wall (x +) to the porch
  side(-X, -Z, -X, Z, -1, 0); corner(-X, Z, Math.PI, Math.PI / 2); side(-X, Z, -1.3, Z, 0, 1); strip();
  side(1.3, Z, X, Z, 0, 1); corner(X, Z, Math.PI / 2, 0); side(X, Z, X, -Z, 1, 0); strip();
  const geo = mergeGeometries(strips); geo.computeVertexNormals();
  const bank = new THREE.Mesh(geo, hazed(new THREE.MeshLambertMaterial({ color: snowC, map: snowTex }), groundPaint, 'bank'));
  bank.position.set(0, TOP, 0); bank.receiveShadow = true; bank.name = 'SnowBank'; scene.add(bank);
  TRIS.push(['Snow banked on the cabin', tris(geo)]);
}

// ---------------------------------------------------------------- places to walk to: the fire lookout
export const placeTris = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n += tris(o.geometry, o.isInstancedMesh ? o.count : 1); }); return n; };
const tower = new THREE.Group();

export function buildCabin() {
  cabin.name = 'Cabin'; tower.name = 'Lookout';   // the light map's mesh names (lightmap.js receivers)
  cabin.position.set(0, TOP, 0);
  scene.add(cabin);
  { const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 2.85, 0.24), M.wood, 4); [-5.6, -1.9, 1.9, 5.6].forEach((x, i) => posts.setMatrixAt(i, m4.makeTranslation(x, YB + 1.42, -(D / 2 + 2.8)))); posts.castShadow = true; cabin.add(posts); }
  cabin.add(windows);
  door.rotation.y = Math.PI;
  porchLight.position.set(1.05, YB + 2.3, -D / 2 - 0.6);
  cabin.add(porchLight);
  inside.position.set(0, YB + 1.8, D / 2 + 1.4);
  cabin.add(inside);   // the glow from the back windows on the snow
  { let n = 0; cabin.traverse((o) => { if (o.isMesh) n += tris(o.geometry, o.isInstancedMesh ? o.count : 1); }); TRIS.push(['Cabin, porch, woodpile', n]); }
  bakeStatic(cabin, (o) => o.userData.door);   // each door its own mesh, for bakeSources
  snowBank();
  tower.position.set(TOWER.x, TOWER.y - 0.5, TOWER.z);
  tower.rotation.y = 0.5;
  scene.add(tower);
  buildLookout(tower, { M, lam, part, winMat });   // lookout.js: the tower, its stairs, deck, cab and room, and its flag
  // (the fishing hut on the lake was removed 2026-11-15: you can't walk there or see it from the level)
  { const room = lookoutInside(); let n = 0; room.traverse((o) => { if (o.isMesh) n += tris(o.geometry); });
    TRIS.push(['Fire lookout (tower, stairs, deck, cab, flag)', placeTris(tower) - n], ['Fire lookout room (near only)', n]);
    bakeStatic(tower, (o) => o.userData.keep || o.parent === room); bakeStatic(room); }
  buildLightmap([cabin, tower]);   // lightmap.js: sky occlusion and the night light, baked (loads; left off until baked)
}
// for the light-map bake (props/summit/export_summit.cjs): the night lights in the world, as the bake makes them. Windows and
// the door are glowing rectangles (centre, the way they face, width, height); the porch lamp, the light inside and the scout
// camp's fire are points, and the lookout room's lamp, which is baked only (no live light). Kinds: window, door, point (with the
// page's colour and range).
export function bakeSources() {
  const out = [], mw = new THREE.Matrix4(), p = new THREE.Vector3(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), n = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  for (const g of [cabin, tower]) g.traverse((o) => {
    if (o.isInstancedMesh && o.material === winMat) { const w = o.geometry.parameters.width, h = o.geometry.parameters.height;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mw); mw.premultiply(o.matrixWorld).decompose(p, qq, s); n.set(0, 0, 1).applyQuaternion(qq);
        out.push({ kind: 'window', at: p.toArray(), normal: n.toArray(), w: w * s.x, h: h * s.y }); } }
    if (o.isMesh && o.material === doorMat) { o.matrixWorld.decompose(p, qq, s); n.set(0, 0, 1).applyQuaternion(qq); out.push({ kind: 'door', at: p.toArray(), normal: n.toArray(), w: 1.2, h: 2.3 }); } });
  out.push({ kind: 'point', at: lookoutRoomLamp().toArray(), color: '#ffe6c8', distance: 0, name: 'lookout' });   // the lookout room's lamp, brighter than a lantern and whiter (lookout.js; Adriaen 2026-11-17: too orange at 10x), bake only
  for (const p of lookoutLamps().slice(0, -1)) out.push({ kind: 'point', at: p.add(new THREE.Vector3(0, -0.125, 0)).toArray(), color: '#ffe6c8', distance: 0, name: 'lookout_lamp' });   // its stair and door lanterns, at their jars
  scene.traverse((l) => { if (l.isPointLight) out.push({ kind: 'point', at: l.getWorldPosition(p).toArray(), color: '#' + l.color.getHexString(), distance: l.distance, name: l === porchLight ? 'porch' : l === inside ? 'inside' : 'fire' }); });
  return out;
}

// each frame: warm windows, always a little lit, glowing after dark (night 0..1, daylight.js LIGHT)
export function cabinStep(night) {
  const glow = 0.25 + 2.4 * night;
  winMat.emissiveIntensity = glow; doorMat.emissiveIntensity = glow; porchLight.intensity = 9 * night; inside.intensity = 6 * night;
  lightmapStep(night);
}
