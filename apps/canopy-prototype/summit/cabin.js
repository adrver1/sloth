// Summit Cabin: the big log cabin with its porch to the south, the fire lookout on the watch hill, and bakeStatic(root), which
// merges a group's still meshes into one draw per look. Windows, door and porch lights are exported for main.js's night glow.
// The cabin and lookout carry baked light maps (lightmap.js); bakeSources() gives the bake its night lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { D, R, RH, RIDGE, TOP, TOWER, TRIS, W, WH, YB, YT, mulberry } from './land.js';
import { canvasTex, hazed, scene, tris } from './core.js';
import { m4, q, sc, up, v3 } from './forest.js';
import { buildLightmap, lightmapStep } from './lightmap.js';

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
export const porchLight = new THREE.PointLight('#ffb760', 0, 22, 1.6);
export const inside = new THREE.PointLight('#ffad55', 0, 16, 1.6);

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
  bakeStatic(cabin);
  tower.position.set(TOWER.x, TOWER.y - 0.5, TOWER.z);
  tower.rotation.y = 0.5;
  scene.add(tower);
  { // a fire lookout: four legs, painted X braces, a glazed cab and a pyramid roof under snow
    const TH = 12, LS = 2.2;
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, TH, 0.28), M.wood, 4); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => legs.setMatrixAt(i, m4.makeTranslation(a * LS, TH / 2, b * LS))); legs.castShadow = true; tower.add(legs);
    const braceTex = canvasTex(128, 256, (g, w, h) => { g.strokeStyle = '#5a3c26'; g.lineWidth = 9; for (let k = 0; k < 3; k++) { const y0 = (k * h) / 3, y1 = ((k + 1) * h) / 3; g.beginPath(); g.moveTo(4, y0); g.lineTo(w - 4, y1); g.moveTo(w - 4, y0); g.lineTo(4, y1); g.moveTo(0, y0 + 4); g.lineTo(w, y0 + 4); g.stroke(); } });
    const braceMat = lam({ map: braceTex, alphaTest: 0.5, side: THREE.DoubleSide });
    for (const [x, z, ry] of [[0, -LS, 0], [0, LS, 0], [-LS, 0, Math.PI / 2], [LS, 0, Math.PI / 2]]) { const b = part(new THREE.PlaneGeometry(LS * 2, TH - 0.5), braceMat, x, (TH - 0.5) / 2, z, tower); b.rotation.y = ry; }
    part(new THREE.BoxGeometry(6.2, 0.3, 6.2), M.wood, 0, TH, 0, tower);   // the deck
    const cab = part(new THREE.BoxGeometry(4.6, 2.4, 4.6), M.log, 0, TH + 1.35, 0, tower);
    const glass = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.8, 1.1), winMat, 4);
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; glass.setMatrixAt(i, m4.compose(v3.set(Math.sin(a) * 2.32, TH + 1.6, Math.cos(a) * 2.32), q.setFromAxisAngle(up, a), sc.set(1, 1, 1))); }
    tower.add(glass);
    const roof = part(new THREE.ConeGeometry(4.1, 1.8, 4, 1, true), M.snow, 0, TH + 3.45, 0, tower); roof.rotation.y = Math.PI / 4;
  }
  // (the fishing hut on the lake was removed 2026-11-15: you can't walk there or see it from the level)
  TRIS.push(['Fire lookout', placeTris(tower)]);
  bakeStatic(tower);
  buildLightmap([cabin, tower]);   // lightmap.js: sky occlusion and the night light, baked (loads; left off until baked)
}
// for the light-map bake (props/summit/export_summit.cjs): the night lights in the world, as the bake makes them. Windows and
// the door are glowing rectangles (centre, the way they face, width, height); the porch lamp, the light inside and the scout
// camp's fire are points. Kinds: window, door, point (with the page's colour and range).
export function bakeSources() {
  const out = [], mw = new THREE.Matrix4(), p = new THREE.Vector3(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), n = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  for (const g of [cabin, tower]) g.traverse((o) => {
    if (o.isInstancedMesh && o.material === winMat) { const w = o.geometry.parameters.width, h = o.geometry.parameters.height;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mw); mw.premultiply(o.matrixWorld).decompose(p, qq, s); n.set(0, 0, 1).applyQuaternion(qq);
        out.push({ kind: 'window', at: p.toArray(), normal: n.toArray(), w: w * s.x, h: h * s.y }); } }
    if (o.isMesh && o.material === doorMat) { o.matrixWorld.decompose(p, qq, s); n.set(0, 0, 1).applyQuaternion(qq); out.push({ kind: 'door', at: p.toArray(), normal: n.toArray(), w: 1.2, h: 2.3 }); } });
  scene.traverse((l) => { if (l.isPointLight) out.push({ kind: 'point', at: l.getWorldPosition(p).toArray(), color: '#' + l.color.getHexString(), distance: l.distance, name: l === porchLight ? 'porch' : l === inside ? 'inside' : 'fire' }); });
  return out;
}

// each frame: warm windows, always a little lit, glowing after dark (night 0..1, daylight.js LIGHT)
export function cabinStep(night) {
  const glow = 0.25 + 2.4 * night;
  winMat.emissiveIntensity = glow; doorMat.emissiveIntensity = glow; porchLight.intensity = 9 * night; inside.intensity = 6 * night;
  lightmapStep(night);
}
