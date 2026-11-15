// Summit Cabin life (Adriaen 2026-11-15, "life at the summit", plan L1 to L5): the camp's own cast runs here, nothing copied.
// The seven sloths (slothLife.js: the camp's sloth code with the summit's homes and food, slothHomes.js) and the bearded
// operator (camp/operator/, started with operator/start.js startOperator) in his winter puffer (models/operator_winter.txt,
// npm run pack:operator-winter) with the camp's clips, going about his summit day (opDay.js: the camp's day plus firewood,
// the porch bench and the snowman). They live in the scout camp's frame (castStage.js: the stage, the stand-in camera and
// you), so camp/layout.js's places are theirs here too.
// A tap goes to the cast's targets (camp/targets.js): him (talk.js's tap column: Talk, or Whisper goodnight while he sleeps),
// a sloth (Boop, Give the fruit you hold) and the porch basket (Take a fruit); one choice runs at once, more show as pills.
// Exports buildLife() (main.js, once: the downloads; the cast starts once the scout camp's props are in) and lifeStep(dt)
// (main.js, each frame after the light). Triangles: his mesh 1,354 (winter_a), one draw; the armful 30, a mug, a book, the
// shadow 2; the sloths' in slothLife.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fetchBytes } from '../bakedlight.js';
import { setStage, uNight, uTime } from '../camp/stage.js';
import { A0 } from '../camp/layout.js';
import { V, yawTo } from '../camp/util.js';
import { allTargets, targetOf, tick } from '../camp/targets.js';
import { TRIS } from './land.js';
import { camera, me, renderer } from './core.js';
import { campReady } from './scoutCamp.js';
import { LIGHT } from './daylight.js';
import { CAST_O, syncBack, syncCast } from './castStage.js';
import { cue } from './audio.js';

let opApi = null, opStep = null, jumpTo = null, slothStep = null, slothList = null;
// for the shot scripts (main.js hands it to debug.js __scene.life): him, the sloths, an activity now (day.js jumpTo), the day run ahead
export const lifeHooks = { get op() { return opApi; }, get sloths() { return slothList; }, jump: (k) => jumpTo(k), origin: () => CAST_O,
  sim: (sec) => { for (let t = 0; t < sec; t += 0.05) lifeStep(0.05); return opApi.state(); } };   // his day run ahead
// The cast is imported here, once castStage.js has run, never statically: land.js awaits at its top level, so the browser runs
// every module that doesn't hang off it (the cast's among them) before castStage.js, and the cast reads the stage as it loads.
const cast = () => Promise.all(['../camp/operator/start.js', '../camp/operator/step.js', '../camp/operator/day.js', './opDay.js', './slothLife.js'].map((f) => import(f)));
export function buildLife() {
  const load = (f) => fetchBytes(f).then((bin) => new Promise((ok, no) => new GLTFLoader().parse(bin.buffer, '', ok, no)));
  Promise.all([load('models/operator_winter.txt'), load('models/operator_anims.txt'), load('models/sloth.txt'), cast(), campReady]).then(([G, A, SL, [start, step, day, opDay, sl]]) => {
    setStage({ OP_DAY: opDay.OP_DAY_SUMMIT }); opStep = step.opStep; jumpTo = day.jumpTo;
    sl.buildSlothLife(SL); slothStep = sl.slothStep; slothList = sl.camp;   // the sloths first, as in the camp: he finds them in their places
    // he starts by the fire on its woodpile side, looking at it, as in the camp
    const p = V(Math.cos(A0 + 0.9) * 2.6, 0, Math.sin(A0 + 0.9) * 2.6);
    opApi = start.startOperator(G, A, p, yawTo(p.clone().negate()));
    let n = 0; opApi.root.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    TRIS.push(['Operator (one draw)', n]);
  }).catch((e) => console.warn('summit life', e));
  wireTaps();
}

// each frame after the light: the stand-ins follow the camera and you, the night and the clock go to the cast, the sloths' step
// (slothLife.js), his step
export function lifeStep(dt) {
  if (!opApi) return;
  syncCast(); uNight.value = LIGHT.night; uTime.value += dt;
  slothStep(dt, uTime.value);
  opStep(dt);
  syncBack();
  opApi.root.visible = Math.hypot(me.x - CAST_O.x - opApi.root.position.x, me.z - CAST_O.z - opApi.root.position.z) < 70;
  hear(dt);
}

// his sounds, as the camp's audio/watch.js hears them there: his steps in the snow, his words, a sip, a page, a snore (summit/audio.js cue,
// a no-op until the sound has started; the cloud sessions that wrote this heard none of it)
const was = { line: '', clip: '' }, at = new THREE.Vector3(), last = new THREE.Vector3();
let stepD = 0, seen = false, tq = 0, pageT = 0, snoreT = 0;
function hear(dt) {
  const p = opApi.root.position;
  if (seen) { const d = Math.hypot(p.x - last.x, p.z - last.z); if (d < 0.5 && (stepD += d) > 0.64) { stepD = 0; cue('crunch', at.copy(p).add(CAST_O).setY(at.y + 0.05)); } }
  last.copy(p); seen = true;
  if ((tq -= dt) > 0) return; tq = 0.1;
  const st = opApi.state(), line = opApi.line?.() || '', head = () => at.copy(p).add(CAST_O).setY(p.y + CAST_O.y + 1.6).clone();
  if (line && line !== was.line) cue('babble', head(), line.split(/\s+/).length, st.lying || st.sleeping);
  if (st.clip === 'sip' && was.clip !== 'sip') cue('slurp', head().setY(at.y - 0.15));
  if (st.seated && st.kind === 'read' && (pageT -= 0.1) < 0) { pageT = 8 + Math.random() * 7; cue('page', head().setY(at.y - 0.5)); }
  if (st.sleeping && (snoreT -= 0.1) < 0) { snoreT = 3.6 + Math.random() * 0.8; cue('breath', head().setY(p.y + CAST_O.y + 0.6), true); }
  was.line = line; was.clip = st.clip || '';
}

// ---------------------------------------------------------------- taps: the cast's targets (his column), and their menus
let menu = null;
function closeMenu() { menu?.remove(); menu = null; }
function openMenu(opts, x, y) {
  closeMenu(); if (!opts.length) return;
  if (opts.length === 1) { opts[0][1](); return; }
  menu = document.createElement('div'); menu.className = 'castMenu';
  menu.style.cssText = `position:fixed;left:${Math.min(innerWidth - 200, Math.max(12, x - 90))}px;top:${Math.max(12, y - 30 - opts.length * 46)}px;z-index:5;display:flex;flex-direction:column;gap:6px`;
  for (const [label, fn] of opts) {
    const b = document.createElement('button'); b.textContent = label; b.className = 'panel pill';
    b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.onclick = (e) => { e.stopPropagation(); closeMenu(); fn(); };
    menu.append(b);
  }
  document.body.append(menu); setTimeout(closeMenu, 6000);
}
function wireTaps() {
  const cv = renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return; down = null;
    tick(); const ts = allTargets().filter((t) => t.ready()); if (!ts.length) { closeMenu(); return; }
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(ts.flatMap((t) => t.picks), false)[0], t = hit && targetOf(hit.object);
    if (t) openMenu(t.options(), e.clientX, e.clientY); else closeMenu();
  });
}
