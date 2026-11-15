// Summit Cabin sound (Adriaen 2026-11-15, plan: the camp's sound comes to the summit): the camp's sound engine and its four
// music stations (camp/audio/context.js and music.js, shared through context.js `hooks`), the camp's saved sound settings
// (the same key, so muting in one mutes the other), its little sounds (camp/audio/sfx.js SFX: boops, sips, radio static), and
// the summit's own beds instead of the jungle's:
//   wind      brown noise through a low-pass, in gusts, stronger in the snowstorm, with a thin whistle over the lookout's height
//   the fire  a soft roar and crackles at the fire ring, louder as you come near
//   snow      your footsteps crunch (a step every 0.7 m, softer and quicker when you run)
//   by day a raven calls far off now and then; at night the camp's owl
// The radio: a small wooden radio on the porch bench, beside Mango (a box, 12 triangles, its dial painted). Tap it: on, the next
// station (with a burst of static), and off after the last. The music comes from it (music.js musicFrom), loudest on the porch.
// The ⚙️ menu's Sound button is the fallback: All, Nature only, Off. ?sound=0 starts muted and ?station= picks one, for that
// visit only (land.js OPT), as in the camp.
// Nothing plays until the first tap or key (browsers block it before that). Exports buildAudio() (main.js, once),
// audioStep(dt) (main.js, each frame after the light) and cue(name, pos) for the sloths and the operator (a no-op until it runs).
// Levels: the mix is the camp's (context.js LEVEL); the summit's beds have their gains below. Cloud sessions can't hear any of it.
import * as THREE from 'three';
import { $, D, KEYS, OPT, TOP, TRIS, YB, store } from './land.js';
import { camera, canvasTex, me, renderer, scene } from './core.js';
import { LIGHT } from './daylight.js';
import { wind as windV } from './fx.js';
import { CAMP } from './scoutCamp.js';
import { BROWN, STATIONS, ac, applyGain, bus, env, filt, gain, hooks, loadSettings, makeHint, noise, osc, own, saved, set, showHint, spot, start, wake } from '../camp/audio/context.js';
import { SFX } from '../camp/audio/sfx.js';
import { mus, musicFrom, musicObj, musicPan } from '../camp/audio/music.js';

const R = (a, b) => a + Math.random() * (b - a);
const FIRE = new THREE.Vector3(CAMP.x, TOP + 0.4, CAMP.z);
const RADIO = new THREE.Vector3(-3.35, TOP + YB + 0.45 + 0.085, -(D / 2 + 0.4));
const beds = {}, tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3();
let radio = null, btn = null, gust = 0.5, gustT = 0, crackT = 0, callT = 8, stepD = 0, last = null;
const keep = () => { store.set(KEYS.audio, saved()); showBtn(); };

function winterBeds() {
  const t = ac.currentTime, loop = (dest) => { const s = ac.createBufferSource(); s.buffer = BROWN; s.loop = true; s.connect(dest); s.start(t, Math.random() * 3); };
  beds.wind = gain(bus.nature, 0); loop(filt('lowpass', 420, 0.6, beds.wind));
  beds.whistle = gain(bus.nature, 0); loop(filt('bandpass', 1100, 7, beds.whistle));
  beds.fire = gain(spot(FIRE, 2, bus.nature), 0); loop(filt('lowpass', 900, 0.5, beds.fire)); beds.fire.gain.value = 0.35;
}
// a crackle at the fire, a raven far off, a footstep in snow
const crackle = (big) => { const t = ac.currentTime, g = gain(spot(FIRE, 2, bus.nature), 0); env(g, t, 0.001, big ? R(0.2, 0.32) : R(0.04, 0.12), big ? 0.05 : R(0.008, 0.03)); noise(t, 0.08, filt('highpass', big ? 900 : R(1800, 4500), 0.8, g)); };
function raven() {
  const a = R(0, 6.28), pos = tmp.set(me.x + Math.cos(a) * 40, me.y + 15, me.z + Math.sin(a) * 40).clone(), out = spot(pos, 8, bus.nature), t = ac.currentTime, n = 2 + (Math.random() < 0.5);
  for (let i = 0; i < n; i++) { const t0 = t + i * 0.42, g = gain(out, 0); env(g, t0, 0.02, 0.07, 0.22, 0.05); const o = osc('sawtooth', R(310, 350), t0, 0.32, filt('bandpass', 1300, 3, g)); o.frequency.linearRampToValueAtTime(260, t0 + 0.3); }
}
function crunch(soft) {
  const t = ac.currentTime, g = gain(bus.sfx, 0); env(g, t, 0.01, soft ? 0.05 : 0.08, 0.13);
  noise(t, 0.16, filt('bandpass', R(900, 1400), 0.9, g)); const h = gain(g, 0.5); noise(t + 0.015, 0.1, filt('highpass', R(3000, 4500), 0.7, h));
}

// the radio on the porch bench: a box with its front painted (the dial, the speaker cloth, two knobs)
function buildRadio() {
  const front = canvasTex(128, 80, (g, w, h) => {
    g.fillStyle = '#6b4128'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9c39a'; g.fillRect(8, 8, 70, h - 16);
    g.strokeStyle = 'rgba(80,50,30,.5)'; for (let x = 12; x < 76; x += 5) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x, h - 10); g.stroke(); }
    g.fillStyle = '#f3e3b8'; g.fillRect(84, 10, 36, 22); g.fillStyle = '#b5302a'; g.fillRect(100, 10, 2, 22);
    g.fillStyle = '#2a1a10'; for (const x of [92, 112]) { g.beginPath(); g.arc(x, 56, 7, 0, 7); g.fill(); }
  });
  const wood = new THREE.MeshLambertMaterial({ color: '#6b4128' }), face = new THREE.MeshLambertMaterial({ map: front, emissive: '#ffb860', emissiveIntensity: 0 });
  radio = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.12), [wood, wood, wood, wood, wood, face]);   // +x, -x, +y, -y, +z, -z: the front faces the porch
  radio.position.copy(RADIO); radio.rotation.y = 0.25; radio.castShadow = true; scene.add(radio); radio.userData.face = face;
  TRIS.push(['Porch radio', 12]);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return; down = null;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); ray.far = 7;
    if (ray.intersectObject(radio).length) turnRadio();
  });
}
// on, the next station, and off after the last
function turnRadio() {
  start(); if (set.muted) { own('muted'); set.muted = false; set.music = false; }
  const i = STATIONS.findIndex((s) => s.id === set.station);
  if (!set.music) set.music = true;
  else if (i >= STATIONS.length - 1) { set.music = false; set.station = STATIONS[0].id; }
  else { own('station'); set.station = STATIONS[i + 1].id; if (ac?.state === 'running') SFX.tune(); }
  mus.st = null; if (ac) mus.next = ac.currentTime + 0.6; applyGain(); keep();
  const s = STATIONS.find((x) => x.id === set.station); say(set.music ? `📻 ${s.emoji} ${s.name}` : '📻 Off');
}
// the station's name, shown for a moment in the hint's place (on phones too, where the hint is hidden)
let sayT = 0, hintText = null;
function say(text) {
  const h = $('hint'); hintText ??= h.textContent; h.textContent = text; h.style.display = 'block';
  clearTimeout(sayT); sayT = setTimeout(() => { h.textContent = hintText; h.style.display = ''; }, 2500);
}

const btnText = () => `Sound: ${set.muted ? 'Off' : set.music ? 'All' : 'Nature only'}`;
function showBtn() { if (btn) btn.textContent = btnText(); }
export function buildAudio() {
  Object.assign(hooks, { stored: () => store.get(KEYS.audio), sound: OPT.sound, station: OPT.station, beds: winterBeds, started: keep });
  loadSettings();
  for (const ev of ['pointerup', 'keydown', 'touchend', 'click']) addEventListener(ev, () => { start(); setTimeout(showHint, 600); }, { capture: true, passive: true });
  makeHint();
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend().catch(() => {}); else wake(); });
  addEventListener('pageshow', wake); addEventListener('focus', wake);
  btn = $('sound');
  btn.onclick = () => { start(); own('muted'); if (set.muted) { set.muted = false; set.music = true; mus.st = null; } else if (set.music) set.music = false; else set.muted = true; applyGain(); keep(); };
  showBtn();
  buildRadio(); musicFrom(radio);
}
export function cue(name, pos) { if (ac?.state === 'running' && !set.muted) SFX[name]?.(pos); }

// each frame after the light: the ear, the beds by the wind, the storm and the hour, the fire's crackles, the calls, your steps
export function audioStep(dt) {
  if (radio) radio.userData.face.emissiveIntensity = set.music && !set.muted ? 0.25 + 0.35 * LIGHT.night : 0;   // the dial glows while it plays
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime, L = ac.listener; camera.getWorldPosition(tmp); camera.getWorldDirection(fwd); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (L.positionX) { L.positionX.value = tmp.x; L.positionY.value = tmp.y; L.positionZ.value = tmp.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z; }
  else { L.setPosition(tmp.x, tmp.y, tmp.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  if (musicObj && musicPan) { musicObj.getWorldPosition(tmp); if (musicPan.positionX) { musicPan.positionX.value = tmp.x; musicPan.positionY.value = tmp.y; musicPan.positionZ.value = tmp.z; } else musicPan.setPosition(tmp.x, tmp.y, tmp.z); }
  // the wind in gusts: its speed from fx.js, more in the storm, a thin whistle when you are high up (the lookout)
  if ((gustT -= dt) < 0) { gustT = R(2, 5); gust = R(0.3, 1); }
  const w = Math.min(1, windV.length() / 8), storm = LIGHT.storm, high = THREE.MathUtils.clamp((me.y - TOP - 4) / 8, 0, 1);
  beds.wind.gain.setTargetAtTime((0.05 + 0.1 * w * gust + 0.25 * storm * gust), t, 1.2);
  beds.whistle.gain.setTargetAtTime((0.004 + 0.02 * storm + 0.012 * high) * gust, t, 1.5);
  if ((crackT -= dt) < 0) { crackT = R(0.05, 0.4); crackle(Math.random() < 0.08); }
  if ((callT -= dt) < 0) { callT = R(18, 40); if (storm < 0.5) LIGHT.night > 0.6 ? SFX.owl() : raven(); }
  // your steps in the snow
  if (last) { const d = Math.hypot(me.x - last.x, me.z - last.z); if (d < 2) { stepD += d; if (stepD > (me.run ? 0.95 : 0.7)) { stepD = 0; crunch(me.run); } } }
  last = last || {}; last.x = me.x; last.z = me.z;
}
