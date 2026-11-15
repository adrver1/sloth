// Summit Cabin walking, first person: keyboard, stick, drag to look, Run, Jump to; the settings panel's handlers (time, weather,
// haze, wireframe), the Speed and Walk tests (prof), and showTris for the triangle table. walk(dt) each frame.
import * as THREE from 'three';
import { $, BARE, BIG, D, HILL_P, HT, JEEP, LAKE, TRIS, W, groundAt, height, walkable } from './land.js';
import { camera, me, renderer, scene, touch, tris } from './core.js';
import { levels, terrainMats } from './terrain.js';
import { SPECIES, SUMMIT_TREES, TCELL, TILE, TREES, bushGeo, bushes, cards, logGeo, logs, nearN, rocks, saplings, tile } from './forest.js';
import { CAMP } from './scoutCamp.js';
import { SKY, WEATHER } from './daylight.js';

// ---------------------------------------------------------------- walking
// First person. Keyboard: WASD or arrows, Shift to run. Phone: the stick to walk, the Run button, drag anywhere else to look.
const faceTo = (x, z, t) => Math.atan2(-(t.x - x), -(t.z - z));   // the yaw that looks from (x, z) at t
const PLACES = { porch: [0, -D / 2 - 1.6, 0], tower: [HT.x - 6, HT.z - 6, { x: 0, z: 0 }], camp: [CAMP.x + 1.2, CAMP.z - 5.2, { x: CAMP.x - 0.4, z: CAMP.z + 2 }] };
if (BARE) {   // on the bare land: the highest point near the old summit, a high point on the ridge north-east, and the big lake's shore
  const top = (cx, cz, R, st) => { let b = [cx, cz, -1e9]; for (let i = -R; i <= R; i += st) for (let j = -R; j <= R; j += st) { const h = height(cx + i, cz + j); if (h > b[2]) b = [cx + i, cz + j, h]; } return b; };
  const S1 = top(0, 0, 400, 8), S2 = top(HILL_P.x, HILL_P.z, 260, 8);
  let shore = [BIG.x, BIG.z + BIG.rz * 1.2]; for (let k = 0; k <= 60; k++) { const z = BIG.z + BIG.rz * (1.2 - k * 0.02); if (height(BIG.x, z) <= LAKE + 0.5) { shore = [BIG.x, z + 25]; break; } }
  PLACES.porch = [S1[0], S1[1], { x: BIG.x, z: BIG.z }]; PLACES.tower = [S2[0], S2[1], { x: S1[0], z: S1[1] }]; PLACES.camp = [shore[0], shore[1], { x: BIG.x, z: BIG.z }];
  document.querySelectorAll('#jump button').forEach((b) => { b.textContent = { porch: 'Summit', tower: 'Ridge', camp: 'Lake shore' }[b.dataset.p]; });
  me.x = S1[0]; me.z = S1[1]; me.y = S1[2] + 1.65; me.yaw = faceTo(S1[0], S1[1], { x: BIG.x, z: BIG.z });
}
const keys = new Set(), stick = { x: 0, y: 0 };
if (touch) document.body.classList.add('touch');
addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys.add(e.code); }); addEventListener('keyup', (e) => keys.delete(e.code)); addEventListener('blur', () => keys.clear());
const cv = renderer.domElement; let look = null;
cv.addEventListener('pointerdown', (e) => { look = { id: e.pointerId, x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
// drags are gathered here and turned into camera turns once per frame, eased over ~3 frames (walk()): touch events come at
// their own pace, not the screen's, so applying them as they arrive made turning judder even at 60 fps
const lookPend = { x: 0, y: 0 };
cv.addEventListener('pointermove', (e) => { if (!look || e.pointerId !== look.id) return; lookPend.x += (e.clientX - look.x) * 0.0045; lookPend.y += (e.clientY - look.y) * 0.0045; look.x = e.clientX; look.y = e.clientY; });
cv.addEventListener('pointerup', () => { look = null; }); cv.addEventListener('pointercancel', () => { look = null; });
{ const el = $('stick'), knob = $('knob'); let id = null;
  let r = null; const set = (e) => { const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), l = Math.hypot(dx, dy), k = Math.min(1, l / 50) / (l || 1); stick.x = dx * k; stick.y = dy * k; knob.style.transform = `translate3d(${stick.x * 38}px, ${stick.y * 38}px, 0)`; };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); r = el.getBoundingClientRect(); set(e); });   // the stick's box is measured once per touch, not on every move
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = () => { id = null; stick.x = stick.y = 0; knob.style.transform = ''; }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); }
$('run').onclick = () => { me.run = !me.run; $('run').setAttribute('aria-pressed', String(me.run)); };
function pushOut(x, z, cx, cz, hx, hz, turn) {   // out of a box (half sizes hx, hz, turned by `turn`)
  const c = Math.cos(turn), s = Math.sin(turn), lx = (x - cx) * c - (z - cz) * s, lz = (x - cx) * s + (z - cz) * c;
  if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return [x, z];
  const ox = hx - Math.abs(lx), oz = hz - Math.abs(lz), nx = ox < oz ? Math.sign(lx) * hx : lx, nz = ox < oz ? lz : Math.sign(lz) * hz;
  return [cx + nx * c + nz * s, cz - nx * s + nz * c];
}
// you can't walk through a tree: each grid cell holds at most one, so only the 3 × 3 cells round you are checked
function treePush(x, z) {
  const n = TILE / TCELL, ci = Math.floor(x / TCELL), cj = Math.floor(z / TCELL), push = (tx, tz, r) => { const dx = x - tx, dz = z - tz, d = Math.hypot(dx, dz); if (d < r && d > 1e-4) { x = tx + (dx / d) * r; z = tz + (dz / d) * r; } };
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const gi = ci + di, gj = cj + dj, ti = Math.floor(gi / n), tj = Math.floor(gj / n), t = tile(ti, tj), k = t.cell[(gj - tj * n) * n + (gi - ti * n)];
    if (k >= 0) push(t.trees[k], t.trees[k + 2], 0.35 + t.trees[k + 3] * (t.trees[k + 6] === 0 || t.trees[k + 6] === 4 ? 0.09 : 0.02)); }
  for (let i = 0; i < SUMMIT_TREES.length; i += 7) push(SUMMIT_TREES[i], SUMMIT_TREES[i + 2], 0.35 + SUMMIT_TREES[i + 3] * 0.09);
  return [x, z];
}
export function walk(dt) {
  { const k = 1 - Math.exp(-dt * 30), tx = lookPend.x * k, ty = lookPend.y * k; lookPend.x -= tx; lookPend.y -= ty; me.yaw -= tx; me.pitch = Math.max(-1.35, Math.min(1.2, me.pitch - ty)); }
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  f -= stick.y; s += stick.x; const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
  const speed = (me.run || keys.has('ShiftLeft') || keys.has('ShiftRight') ? 12 : 3.2) * dt, sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
  let x = me.x + (-sy * f + cy * s) * speed, z = me.z + (-cy * f - sy * s) * speed;
  if (!BARE) { [x, z] = pushOut(x, z, 0, 0, W / 2 + 0.35, D / 2 + 0.35, 0); }
  [x, z] = treePush(x, z);
  if (!BARE) [x, z] = pushOut(x, z, JEEP.x, JEEP.z, 2.0, 1.0, 0);   // the jeep lies along x
  if (!walkable(x, z)) { if (walkable(x, me.z)) z = me.z; else if (walkable(me.x, z)) x = me.x; else { x = me.x; z = me.z; } }
  me.x = x; me.z = z;
  const gy = groundAt(x, z) + 1.65 + (me.hover || 0); me.y += (gy - me.y) * Math.min(1, dt * 12);   // hover: a debug lift for overview shots
  camera.position.set(me.x, me.y, me.z); camera.rotation.set(me.pitch, me.yaw, 0, 'YXZ');
}
export const press = (group, attr, val) => group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === val)));
export const jump = (p) => { const [x, z, t] = PLACES[p]; me.x = x; me.z = z; me.yaw = t ? faceTo(x, z, t) : 0; me.pitch = p === 'tower' ? -0.18 : -0.08; me.y = groundAt(x, z) + 1.65; };
$('jump').onclick = (e) => { const p = e.target.dataset?.p; if (p) jump(p); };
// Speed test: times frames on this device with one part of the scene switched off at a time, so we can see where the time goes
export let testing = false;
// prof: while a walk test runs, the frame records how long (ms of script) each kind of work took
export const prof = { on: false, t: {}, mark(k, t0) { const d = performance.now() - t0, e = this.t[k] || (this.t[k] = { n: 0, sum: 0, max: 0 }); e.n++; e.sum += d; e.max = Math.max(e.max, d); } };
$('walkBtn').onclick = async () => {
  if (testing) return; testing = true; const out = $('speed'); out.hidden = false; $('menu').open = false;
  jump('camp'); await new Promise((r) => setTimeout(r, 1500));
  const dts = []; prof.t = {}; prof.on = true; keys.add('KeyW'); keys.add('ShiftLeft');
  await new Promise((done) => { let last = 0; const t0 = performance.now(); const f = (t) => { if (last) dts.push(t - last); last = t; me.yaw += 0.5 / 60; if (t - t0 < 12000) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  keys.delete('KeyW'); keys.delete('ShiftLeft'); prof.on = false;
  const sorted = [...dts].sort((a, b) => a - b), avg = dts.reduce((a, b) => a + b, 0) / dts.length, q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
  out.textContent = `Walk test (running in a circle, 12 s, ratio ${renderer.getPixelRatio()})\nframes ${dts.length}: avg ${avg.toFixed(1)} ms (${(1000 / avg).toFixed(0)} fps), 95% ${q(0.95).toFixed(1)}, worst ${sorted[sorted.length - 1].toFixed(1)}\nslow frames: ${dts.filter((d) => d > 20).length} over 20 ms, ${dts.filter((d) => d > 34).length} over 34 ms\nscript per kind (times, avg, worst ms):\n` +
    Object.entries(prof.t).map(([k, e]) => `${k.padEnd(14)}${String(e.n).padStart(4)} ${(e.sum / e.n).toFixed(1).padStart(6)} ${e.max.toFixed(1).padStart(6)}`).join('\n');
  $('menu').open = true; testing = false;
};
$('speedBtn').onclick = async () => {
  if (testing) return; testing = true; const out = $('speed'); out.hidden = false;
  const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info'), gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';
  const time = (ms) => new Promise((done) => { let n = 0, t0 = 0; const f = (t) => { if (!t0) t0 = t; else n++; if (t - t0 < ms) requestAnimationFrame(f); else done(n ? (t - t0) / n : 0); }; requestAnimationFrame(f); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hideAll = (test) => { const l = []; scene.traverse((m) => { if ((m.isMesh || m.isPoints) && m.visible && test(m)) { m.visible = false; l.push(m); } }); return () => l.forEach((m) => (m.visible = true)); };
  const terr = (m) => levels.some((l) => l.parts.some((p) => p.userData.mesh === m));
  const pts = []; scene.traverse((l) => { if (l.isPointLight) pts.push(l); });
  const plain = new THREE.MeshLambertMaterial({ color: '#c8c8c8' });
  const steps = [
    ['As it is', () => () => {}],
    ['Half resolution', () => { const k = renderer.getPixelRatio(); renderer.setPixelRatio(k / 2); return () => renderer.setPixelRatio(k); }],
    ['No trees, rocks, logs', () => hideAll((m) => m.isInstancedMesh && !terr(m))],
    ['No ground', () => hideAll(terr)],
    ['No lamp and fire lights', () => { pts.forEach((l) => (l.visible = false)); return () => pts.forEach((l) => (l.visible = true)); }],
    ['Plain grey materials', () => { scene.overrideMaterial = plain; return () => { scene.overrideMaterial = null; }; }],
    ['Nothing drawn', () => hideAll(() => true)],
  ];
  const rows = [], head = `${renderer.domElement.width}×${renderer.domElement.height} px, ratio ${renderer.getPixelRatio()}, ${window.__stats?.calls} draws, ${(window.__stats?.tris / 1000).toFixed(0)}k tris`; let base = 0;
  for (const [name, set] of steps) { out.textContent = `Testing: ${name}…\n` + rows.join('\n'); const undo = set(); await wait(900); const ms = await time(2200); undo(); await wait(300);
    if (!base) base = ms; rows.push(`${name.padEnd(23)}${ms.toFixed(1).padStart(6)} ms${base !== ms ? ` ${ms < base ? '−' : '+'}${Math.abs(base - ms).toFixed(1)}` : ` ${(1000 / ms).toFixed(0)} fps`}`); }
  out.textContent = `${gpu}\n${head}\n` + rows.join('\n');
  testing = false;
};
$('weather').onclick = (e) => { const w = e.target.dataset?.w; if (!w) return; SKY.target = WEATHER[w]; press($('weather'), 'w', w); };
$('hazeOn').onchange = (e) => { SKY.haze = e.target.checked; };
$('wire').onchange = (e) => { for (const m of terrainMats) m.wireframe = e.target.checked; };
export const fmt = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
$('hour').oninput = () => { $('hourOut').textContent = fmt(+$('hour').value); };
export function showTris() {
  const rows = [['Terrain rings (10, round you)', levels.reduce((n, l) => n + l.tris, 0)], ...SPECIES.map((n, i) => [`${n[0].toUpperCase() + n.slice(1)} near (${nearN[i]} × ${tris(TREES[n])})`, nearN[i] * tris(TREES[n])]), [`Young spruces (${saplings.count} × ${tris(TREES.spruce)})`, saplings.count * tris(TREES.spruce)], [`Snowy bushes (${bushes.count} × ${tris(bushGeo)})`, bushes.count * tris(bushGeo)], [`Tree cards (${cards.reduce((n, m) => n + m.count, 0)} × 2)`, cards.reduce((n, m) => n + m.count, 0) * 2], [`Rocks (${rocks.count} × 20)`, rocks.count * 20], [`Fallen logs (${logs.count} × ${tris(logGeo)})`, logs.count * tris(logGeo)], ...TRIS];
  $('tris').innerHTML = rows.map(([n, t]) => `<tr><td>${n}</td><td>${Math.round(t).toLocaleString('en')}</td></tr>`).join('') + `<tr><td><b>Total</b></td><td><b>${Math.round(rows.reduce((s, [, t]) => s + t, 0)).toLocaleString('en')}</b></td></tr>`;
  return rows;
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

