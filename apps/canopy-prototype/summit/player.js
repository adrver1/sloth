// Summit Cabin walking: the camp's own player and input (camp/player.js, camp/input.js; Adriaen 2026-11-15, the same controls
// in both levels: keys or the stick to walk, drag to look, pinch to zoom, tap what lights up, hold a sloth to feed it), with the
// summit's ground and where you may walk handed over (setPlayer): the snow and the porch deck (land.js groundAt), the fence
// and the cliff (walkable), the trees, the cabin, the jeep and the cast's blockers (castStage.js: the fire, the tent, the seats,
// the porch's edges, so you come up its steps). Also Jump to, the settings panel's handlers (time, weather, haze, wireframe), the
// Speed and Walk tests (prof), and showTris for the triangle table; the tests, jumps, table and fps line show with ?debug=1.
// walk(dt) each frame (the camp's step and the aim of what lights up).
import { stats } from './debug.js';
import * as THREE from 'three';
import { $, BARE, BIG, D, HILL_P, HT, JEEP, LAKE, OPT, TRIS, W, groundAt, height, walkable } from './land.js';
import { camera, me, renderer, scene, touch, tris } from './core.js';
import { keys, stickV } from '../camp/hud.js';
import { setPlayer, step } from '../camp/player.js';
import { aimStep, initInput, resize } from '../camp/input.js';
import { CAST_O, blockers as castBlockers } from './castStage.js';
import { lifeHooks } from './life.js';
import { levels, terrainMats } from './terrain.js';
import { SPECIES, SUMMIT_TREES, TCELL, TILE, TREES, bushGeo, bushes, cards, logGeo, logs, nearN, rocks, saplings, tile } from './forest.js';
import { CAMP } from './scoutCamp.js';
import { SKY, WEATHER } from './daylight.js';

// ---------------------------------------------------------------- walking
const faceTo = (x, z, t) => Math.atan2(-(t.x - x), -(t.z - z));   // the yaw that looks from (x, z) at t
const PLACES = { porch: [0, -D / 2 - 1.6, 0], tower: [HT.x - 6, HT.z - 6, { x: 0, z: 0 }], camp: [CAMP.x + 1.2, CAMP.z - 5.2, { x: CAMP.x - 0.4, z: CAMP.z + 2 }] };
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
// where you may walk (the shared player's bounds): p is where this step would take you, me.pos where you stand
function bounds(p) {
  let x = p.x, z = p.z;
  if (!BARE) [x, z] = pushOut(x, z, 0, 0, W / 2 + 0.35, D / 2 + 0.35, 0);   // the cabin
  [x, z] = treePush(x, z);
  if (!BARE) [x, z] = pushOut(x, z, JEEP.x, JEEP.z, 2.0, 1.0, 0);   // the jeep lies along x
  if (!walkable(x, z)) { if (walkable(x, me.z)) z = me.z; else if (walkable(me.x, z)) x = me.x; else { x = me.x; z = me.z; } }
  p.x = x; p.z = z;
}
// the cast's blockers are in the camp's frame (castStage.js); the player walks in the world's
const walkBlockers = BARE ? [] : castBlockers.map((b) => ({ ...b, at: b.at.clone().add(new THREE.Vector3(CAST_O.x, 0, CAST_O.z)) }));
export function walk(dt) { step(dt); aimStep(dt); }
export const press = (group, attr, val) => group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === val)));
export const jump = (p) => { const [x, z, t] = PLACES[p]; me.x = x; me.z = z; me.yaw = t ? faceTo(x, z, t) : 0; me.pitch = p === 'tower' ? -0.18 : -0.08; };
// Speed test: times frames on this device with one part of the scene switched off at a time, so we can see where the time goes
export let testing = false;
// prof: while a walk test runs, the frame records how long (ms of script) each kind of work took
export const prof = { on: false, t: {}, mark(k, t0) { const d = performance.now() - t0, e = this.t[k] || (this.t[k] = { n: 0, sum: 0, max: 0 }); e.n++; e.sum += d; e.max = Math.max(e.max, d); } };
export function showTris() {
  const rows = [['Terrain rings (10, round you)', levels.reduce((n, l) => n + l.tris, 0)], ...SPECIES.map((n, i) => [`${n[0].toUpperCase() + n.slice(1)} near (${nearN[i]} × ${tris(TREES[n])})`, nearN[i] * tris(TREES[n])]), [`Young spruces (${saplings.count} × ${tris(TREES.spruce)})`, saplings.count * tris(TREES.spruce)], [`Snowy bushes (${bushes.count} × ${tris(bushGeo)})`, bushes.count * tris(bushGeo)], [`Tree cards (${cards.reduce((n, m) => n + m.count, 0)} × 2)`, cards.reduce((n, m) => n + m.count, 0) * 2], [`Rocks (${rocks.count} × 20)`, rocks.count * 20], [`Fallen logs (${logs.count} × ${tris(logGeo)})`, logs.count * tris(logGeo)], ...TRIS];
  $('tris').innerHTML = rows.map(([n, t]) => `<tr><td>${n}</td><td>${Math.round(t).toLocaleString('en')}</td></tr>`).join('') + `<tr><td><b>Total</b></td><td><b>${Math.round(rows.reduce((s, [, t]) => s + t, 0)).toLocaleString('en')}</b></td></tr>`;
  return rows;
}

export function buildPlayer() {
  if (OPT.debug) { $('dev').hidden = false; $('stats').hidden = false; }   // the prototype's tools, for checks (Adriaen 2026-11-15 Q16: they go from the game)
  if (BARE) {   // on the bare land: the highest point near the old summit, a high point on the ridge north-east, and the big lake's shore
    const top = (cx, cz, R, st) => { let b = [cx, cz, -1e9]; for (let i = -R; i <= R; i += st) for (let j = -R; j <= R; j += st) { const h = height(cx + i, cz + j); if (h > b[2]) b = [cx + i, cz + j, h]; } return b; };
    const S1 = top(0, 0, 400, 8), S2 = top(HILL_P.x, HILL_P.z, 260, 8);
    let shore = [BIG.x, BIG.z + BIG.rz * 1.2]; for (let k = 0; k <= 60; k++) { const z = BIG.z + BIG.rz * (1.2 - k * 0.02); if (height(BIG.x, z) <= LAKE + 0.5) { shore = [BIG.x, z + 25]; break; } }
    PLACES.porch = [S1[0], S1[1], { x: BIG.x, z: BIG.z }]; PLACES.tower = [S2[0], S2[1], { x: S1[0], z: S1[1] }]; PLACES.camp = [shore[0], shore[1], { x: BIG.x, z: BIG.z }];
    document.querySelectorAll('#jump button').forEach((b) => { b.textContent = { porch: 'Summit', tower: 'Ridge', camp: 'Lake shore' }[b.dataset.p]; });
    me.x = S1[0]; me.z = S1[1]; me.y = S1[2] + 1.65; me.yaw = faceTo(S1[0], S1[1], { x: BIG.x, z: BIG.z });
  }
  setPlayer({ camera, groundAt: (x, z) => groundAt(x, z) + (me.hover || 0), bounds, blockers: walkBlockers });   // hover: a debug lift for overview shots
  // the camp's input: what you carry is a fruit from the porch basket (slothLife.js), eaten by the camp's own eating
  initInput({ renderer, scene, camera, canvas: renderer.domElement, stick: $('stick'), help: $('hint'), touch: OPT.touch,
    carry: { food: () => lifeHooks.held?.() ?? null, give: () => lifeHooks.give?.() ?? null }, eat: (s, mesh, from) => !!lifeHooks.eat && (lifeHooks.eat(s, mesh, from), true),
    onBoop: (s) => lifeHooks.booped?.(s) });
  resize();
  $('jump').onclick = (e) => { const p = e.target.dataset?.p; if (p) jump(p); };
  $('walkBtn').onclick = async () => {
    if (testing) return; testing = true; const out = $('speed'); out.hidden = false; $('menu').open = false;
    jump('camp'); await new Promise((r) => setTimeout(r, 1500));
    const dts = []; prof.t = {}; prof.on = true; keys.add('KeyW');
    await new Promise((done) => { let last = 0; const t0 = performance.now(); const f = (t) => { if (last) dts.push(t - last); last = t; me.yaw += 0.5 / 60; if (t - t0 < 12000) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
    keys.delete('KeyW'); prof.on = false;
    const sorted = [...dts].sort((a, b) => a - b), avg = dts.reduce((a, b) => a + b, 0) / dts.length, q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
    out.textContent = `Walk test (walking in a circle, 12 s, ratio ${renderer.getPixelRatio()})\nframes ${dts.length}: avg ${avg.toFixed(1)} ms (${(1000 / avg).toFixed(0)} fps), 95% ${q(0.95).toFixed(1)}, worst ${sorted[sorted.length - 1].toFixed(1)}\nslow frames: ${dts.filter((d) => d > 20).length} over 20 ms, ${dts.filter((d) => d > 34).length} over 34 ms\nscript per kind (times, avg, worst ms):\n` +
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
    const rows = [], head = `${renderer.domElement.width}×${renderer.domElement.height} px, ratio ${renderer.getPixelRatio()}, ${stats.calls} draws, ${(stats.tris / 1000).toFixed(0)}k tris`; let base = 0;
    for (const [name, set] of steps) { out.textContent = `Testing: ${name}…\n` + rows.join('\n'); const undo = set(); await wait(900); const ms = await time(2200); undo(); await wait(300);
      if (!base) base = ms; rows.push(`${name.padEnd(23)}${ms.toFixed(1).padStart(6)} ms${base !== ms ? ` ${ms < base ? '−' : '+'}${Math.abs(base - ms).toFixed(1)}` : ` ${(1000 / ms).toFixed(0)} fps`}`); }
    out.textContent = `${gpu}\n${head}\n` + rows.join('\n');
    testing = false;
  };
  $('weather').onclick = (e) => { const w = e.target.dataset?.w; if (!w) return; SKY.target = WEATHER[w]; press($('weather'), 'w', w); };
  $('hazeOn').onchange = (e) => { SKY.haze = e.target.checked; };
  $('wire').onchange = (e) => { for (const m of terrainMats) m.wireframe = e.target.checked; };
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); resize(); });   // the canvas's style here, then the camp's camera and zoom (input.js)
}
