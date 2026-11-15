// Summit Cabin sound (Adriaen 2026-11-15, plan: the camp's sound comes to the summit): the camp's sound engine and its four
// music stations (camp/audio/context.js and music.js, shared through context.js `hooks`), the camp's saved sound settings
// (the same key, so muting in one mutes the other), its little sounds (camp/audio/sfx.js SFX: boops, sips, radio static), and
// the summit's own beds instead of the jungle's:
//   wind      brown noise through a low-pass, in gusts, stronger in the snowstorm, with a thin whistle over the lookout's height
//   the fire  a soft roar and crackles at the fire ring, louder as you come near
//   snow      your footsteps crunch (a step every 0.7 m)
//   by day a raven calls far off now and then; at night the camp's owl
// The radio is the camp's own (camp/radio.js, Adriaen 2026-11-15: "use the one from the original camp"), on the porch bench beside
// Mango: it lights up, its menu turns it on, changes the station, quieter, louder, off, and the music comes from it, loudest on
// the porch. `audio` is the camp's sound API (camp/audio/api.js) over the summit's settings.
// The ⚙️ menu's Sound button is the fallback: All, Nature only, Off. ?sound=0 starts muted and ?station= picks one, for that
// visit only (land.js OPT), as in the camp.
// Nothing plays until the first tap or key (browsers block it before that). Exports buildAudio() (main.js, once),
// audioStep(dt) (main.js, each frame after the light) and cue(name, pos) for the sloths and the operator (a no-op until it runs).
// Levels: the mix is the camp's (context.js LEVEL); the summit's beds have their gains below. Cloud sessions can't hear any of it.
import * as THREE from 'three';
import { $, D, KEYS, OPT, TOP, TRIS, YB, store } from './land.js';
import { camera, me, scene } from './core.js';
import { LIGHT } from './daylight.js';
import { wind as windV } from './fx.js';
import { CAMP } from './scoutCamp.js';
import { BROWN, ac, applyGain, bus, env, filt, gain, hooks, loadSettings, makeHint, noise, osc, own, saved, set, showHint, spot, start, wake } from '../camp/audio/context.js';
import { SFX } from '../camp/audio/sfx.js';
import { mus, musicObj, musicPan } from '../camp/audio/music.js';
import { makeAudio } from '../camp/audio/api.js';
import { RADIO_SIZE, buildRadio, radioStep } from '../camp/radio.js';

const R = (a, b) => a + Math.random() * (b - a);
const FIRE = new THREE.Vector3(CAMP.x, TOP + 0.4, CAMP.z);
const RADIO = new THREE.Vector3(-1.95, TOP + YB + 0.45, -(D / 2 + 0.4));   // on the porch bench's seat
const beds = {}, tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3();
let btn = null, gust = 0.5, gustT = 0, crackT = 0, callT = 8, stepD = 0, last = null;
const keep = () => { store.set(KEYS.audio, saved()); showBtn(); };
export const audio = makeAudio(keep);   // the camp's sound API, which the radio drives

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
function crunch(soft, pos = null) {   // pos: someone else's step, heard where it is (his, life.js)
  const t = ac.currentTime, g = gain(pos ? spot(pos, 1) : bus.sfx, 0); env(g, t, 0.01, soft ? 0.05 : 0.08, 0.13);
  noise(t, 0.16, filt('bandpass', R(900, 1400), 0.9, g)); const h = gain(g, 0.5); noise(t + 0.015, 0.1, filt('highpass', R(3000, 4500), 0.7, h));
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
  buildRadio({ scene, audio, place: (r) => { r.position.copy(RADIO).setY(RADIO.y + RADIO_SIZE.H / 2); r.rotation.y = 0.25 + Math.PI; r.castShadow = true; } });   // its front to the porch
  TRIS.push(['Porch radio', 22]);
}
const OWN = { crunch: (pos) => crunch(true, pos) };   // the summit's own sounds a cue can name, before the camp's SFX
export function cue(name, pos, ...more) { if (ac?.state === 'running' && !set.muted) (OWN[name] ?? SFX[name])?.(pos, ...more); }

// each frame after the light: the ear, the beds by the wind, the storm and the hour, the fire's crackles, the calls, your steps
export function audioStep(dt) {
  radioStep(dt);   // the dial lamp, the needle and the notes
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
  if (last) { const d = Math.hypot(me.x - last.x, me.z - last.z); if (d < 2) { stepD += d; if (stepD > 0.7) { stepD = 0; crunch(false); } } }
  last = last || {}; last.x = me.x; last.z = me.z;
}
