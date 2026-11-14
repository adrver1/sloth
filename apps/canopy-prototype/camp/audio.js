// Canopy Camp sound: every sound and the music are made here in WebAudio at run time (no files to download, nothing licensed).
// Nature: leaves in the wind, birds by day, crickets, frogs and an owl at night, rain (louder drumming under the tent), the
// fire's crackle and the soup bubbling over it, all placed in the camp (equal-power panning, so it stays cheap on a phone).
// Life: sloth squeaks (a boop, a wave, saying hello), munching, yawns and sleepy breathing; the bearded operator's footsteps,
// his mumbled speech (a babble, one syllable a beat), sips, spoon clinks, page turns and snores; your own steps; the jeep's
// doors and engine; a soft tock on every menu button.
// Music: four generated stations (Slow drift, the default: ambient tape loops; campfire guitar, kalimba, music-box lullaby), quiet under the nature sounds.
// This file is the way in: the API and the settings UI. The work is in audio/: context.js (the settings, the WebAudio graph,
// the node helpers, starting on the first tap), sfx.js (the sounds and the beds), music.js (the stations and the radio's
// position) and watch.js (audioStep: hearing the camp each frame).
// Nothing plays until the first tap or key (browsers block it before that). Importing this file builds nothing: main.js
// calls initAudio() once (the tap listeners, the Tap for sound pill, the ⚙️ Sound button) and audioStep(dt, dusk) every
// frame. The chores name their own sounds: chores.js plays cue(name) with a chore's message ("knock", "slosh", "clink", "roar").
// The radio prop drives it through `audio`: start, volume, muted, music, musicVolume, station, next,
// tune (a burst of static between stations), musicFrom(object3D | null: the music then comes from it), state, onChange.
// The ⚙️ menu has a fallback: Sound: All / Nature only / Off. ?sound=0 starts muted, ?station= picks one (core.js OPT). Settings are kept per viewer (KEYS.audio).
// Levels (Adriaen checks the mix by ear; cloud sessions can't hear it): audio/context.js LEVEL and the bus gains are the knobs.
import * as THREE from "three";
import { $, KEYS, camera, store } from "./core.js";
import { STATIONS, ac, applyGain, bus, comp, loadSettings, makeHint, set, showHint, start, wake } from "./audio/context.js";
import { SFX } from "./audio/sfx.js";
import { mus, musicFrom } from "./audio/music.js";
import { audioStep } from "./audio/watch.js";

const listeners = new Set();
const keep = () => { store.set(KEYS.audio, JSON.stringify(set)); listeners.forEach((f) => { try { f(audio.state()); } catch {} }); showBtn(); };

// a chore's sound (chores.js plays it with the chore's message: a log picked up, the water pail, a vegetable, a bowl),
// heard in your hands, a little in front of and below the camera. "roar" is the fire's burst of crackles.
function cue(name) {
  if (ac?.state !== "running") return;
  if (name === "roar") { for (let i = 0; i < 4; i++) setTimeout(() => ac && SFX.crackle(i === 0), i * 90); return; }
  const near = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 0.6).setY(camera.position.y - 0.4);
  SFX[name]?.(near);
}

// ---------------------------------------------------------------- the API (the radio prop) and the ⚙️ fallback
const audio = {
  stations: STATIONS,
  start,
  volume(v) { if (v !== undefined) { set.volume = THREE.MathUtils.clamp(+v, 0, 1); applyGain(); keep(); } return set.volume; },
  muted(m) { if (m !== undefined) { set.muted = !!m; applyGain(); keep(); } return set.muted; },
  music(on) { if (on !== undefined) { set.music = !!on; if (on) mus.st = null; applyGain(); keep(); } return set.music; },
  musicVolume(v) { if (v !== undefined) { set.musicVolume = THREE.MathUtils.clamp(+v, 0, 1); applyGain(); keep(); } return set.musicVolume; },
  station(s) { if (s !== undefined) { const st = typeof s === "number" ? STATIONS[((s % STATIONS.length) + STATIONS.length) % STATIONS.length] : STATIONS.find((x) => x.id === s); if (st) { set.station = st.id; mus.st = null; if (ac) mus.next = ac.currentTime + 0.6; keep(); } } return STATIONS.find((x) => x.id === set.station); },
  next() { const i = STATIONS.findIndex((x) => x.id === set.station); audio.tune(); return audio.station(i + 1); },
  tune() { if (ac?.state === "running") SFX.tune(); },
  musicFrom,
  state: () => ({ ctx: ac?.state ?? "none", started: !!ac && ac.state === "running", volume: set.volume, muted: set.muted, music: set.music, musicVolume: set.musicVolume, station: set.station }),
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  play(name, pos) { if (ac?.state === "running" && SFX[name]) SFX[name](pos || null); },   // any sound by name, for other modules and checks
  levels() {   // checks: the loudness of the mix now, in dBFS, over 0.2 s
    if (!ac) return null; if (!audio._an) { audio._an = ac.createAnalyser(); audio._an.fftSize = 8192; comp.connect(audio._an); }
    const a = new Float32Array(audio._an.fftSize); audio._an.getFloatTimeDomainData(a); let s = 0, pk = 0; for (const x of a) { s += x * x; pk = Math.max(pk, Math.abs(x)); }
    return { rms: +(10 * Math.log10(s / a.length + 1e-12)).toFixed(1), peak: +(20 * Math.log10(pk + 1e-9)).toFixed(1) };
  },
  _bus: () => bus,
};

// ⚙️ fallback: one button that cycles All (music and camp), then Nature only (no music), then Off
let btn = null;
function showBtn() { if (!btn) return; btn.textContent = "Sound: " + (set.muted ? "Off 🔇" : set.music ? "All 🔊" : "Nature only 🌿"); }

// ---------------------------------------------------------------- initAudio(): main.js calls it once, with initInput()
// It reads the saved settings, listens for the first tap or key (browsers block sound before that), makes the Tap for sound
// pill, wakes the sound when you come back to the tab, and wires the ⚙️ Sound button.
function initAudio() {
  loadSettings();
  // start only on events that count as a tap everywhere (iOS ignores pointerdown and touchstart for audio)
  for (const ev of ["pointerup", "keydown", "touchend", "click"]) addEventListener(ev, () => { start(); setTimeout(showHint, 600); }, { capture: true, passive: true });
  makeHint();   // the Tap for sound pill
  document.addEventListener("click", (e) => { if (e.target.closest?.("button")) { start(); if (ac?.state === "running") SFX.tock(); } }, true);
  document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend().catch(() => {}); else wake(); });
  addEventListener("pageshow", wake); addEventListener("focus", wake);
  btn = $("sound");
  if (btn) btn.onclick = () => { start(); if (set.muted) { set.muted = false; set.music = true; mus.st = null; } else if (set.music) set.music = false; else set.muted = true; applyGain(); keep(); };
  showBtn();
}

export { audio, audioStep, cue, initAudio, keep };
