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
// tune (a burst of static between stations), musicFrom(object3D | null: the music then comes from it), state, onChange,
// and three cheap reads for its every-frame step that make no objects (review R2-085): running() (the sound is on),
// playing() (music on and not muted) and stationIndex() (the station's place in stations).
// The ⚙️ menu has a fallback: Sound: All / Nature only / Off. ?sound=0 starts muted and ?station= picks one, for that visit only (core.js OPT). Settings are kept per viewer (KEYS.audio).
// Levels (Adriaen checks the mix by ear; cloud sessions can't hear it): audio/context.js LEVEL and the bus gains are the knobs.
import * as THREE from "three";
import { $, KEYS, OPT, camera, store } from "./core.js";
import { ac, applyGain, hooks, loadSettings, makeHint, own, saved, set, showHint, start, wake } from "./audio/context.js";
import { makeAudio } from "./audio/api.js";
import { SFX, startBeds } from "./audio/sfx.js";
import { mus } from "./audio/music.js";
import { audioStep } from "./audio/watch.js";

const listeners = new Set();
// keep(): store the settings (without the URL's one-visit ?sound=0 and ?station=, context.js saved()) and tell the listeners
const keep = () => { store.set(KEYS.audio, saved()); listeners.forEach((f) => { try { f(audio.state()); } catch {} }); showBtn(); };

// a chore's sound (chores.js plays it with the chore's message: a log picked up, the water pail, a vegetable, a bowl),
// heard in your hands, a little in front of and below the camera. "roar" is the fire's burst of crackles.
function cue(name) {
  if (ac?.state !== "running") return;
  if (name === "roar") { for (let i = 0; i < 4; i++) setTimeout(() => ac && SFX.crackle(i === 0), i * 90); return; }
  const near = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 0.6).setY(camera.position.y - 0.4);
  SFX[name]?.(near);
}

// ---------------------------------------------------------------- the API (the radio prop) and the ⚙️ fallback
// the shared API (audio/api.js, the summit's too) and the camp's listeners (onChange)
const audio = makeAudio(keep);
audio.onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// ⚙️ fallback: one button that cycles All (music and camp), then Nature only (no music), then Off
let btn = null;
function showBtn() { if (!btn) return; btn.textContent = "Sound: " + (set.muted ? "Off 🔇" : set.music ? "All 🔊" : "Nature only 🌿"); }

// ---------------------------------------------------------------- initAudio(): main.js calls it once, with initInput()
// It reads the saved settings, listens for the first tap or key (browsers block sound before that), makes the Tap for sound
// pill, wakes the sound when you come back to the tab, and wires the ⚙️ Sound button.
function initAudio() {
  Object.assign(hooks, { stored: () => store.get(KEYS.audio), sound: OPT.sound, station: OPT.station, beds: startBeds, started: keep });   // the camp's parts of the shared engine (audio/context.js)
  loadSettings();
  // start only on events that count as a tap everywhere (iOS ignores pointerdown and touchstart for audio)
  for (const ev of ["pointerup", "keydown", "touchend", "click"]) addEventListener(ev, () => { start(); setTimeout(showHint, 600); }, { capture: true, passive: true });
  makeHint();   // the Tap for sound pill
  document.addEventListener("click", (e) => { if (e.target.closest?.("button")) { start(); if (ac?.state === "running") SFX.tock(); } }, true);
  document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend().catch(() => {}); else wake(); });
  addEventListener("pageshow", wake); addEventListener("focus", wake);
  btn = $("sound");
  if (btn) btn.onclick = () => { start(); own("muted"); if (set.muted) { set.muted = false; set.music = true; mus.st = null; } else if (set.music) set.music = false; else set.muted = true; applyGain(); keep(); };
  showBtn();
}

export { audio, audioStep, cue, initAudio, keep };
