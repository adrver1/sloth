// Canopy Camp sound, the context: the settings (the mix's levels, the stations, the viewer's saved choices), the WebAudio
// context with its three buses into a gentle compressor, the small node helpers every sound is built from (spot, env, osc,
// noise, filt, gain), and starting it all: on the first tap (start, unlock: iOS needs a real tap and a silent sample), the
// Tap for sound pill (makeHint, showHint) and waking it after a tab switch (wake). Nothing is made on import.
// The settings: set (this visit's values), loadSettings(), saved() (the JSON to store: the URL's one-visit overrides left out)
// and own(key) (the viewer changed key, so it is stored from now on).
// Levels (Adriaen checks the mix by ear; cloud sessions can't hear it): LEVEL and the bus gains are the knobs.
import * as THREE from "three";
import { KEYS, OPT, store } from "../core.js";
import { startBeds } from "./sfx.js";
import { musicTick, routeMusic } from "./music.js";
import { keep } from "../audio.js";

const LEVEL = { master: 0.9, nature: 0.75, sfx: 0.85, music: 0.8 };   // the mix: music sits well under the camp
const STATIONS = [{ id: "drift", name: "Slow drift", emoji: "🌫️" }, { id: "campfire", name: "Campfire guitar", emoji: "🎸" }, { id: "kalimba", name: "Kalimba drift", emoji: "🎶" }, { id: "lullaby", name: "Music-box lullaby", emoji: "🌙" }];
// the settings: these defaults until initAudio() reads the viewer's saved ones and the URL (?sound=0, ?station=)
const set = { volume: 0.8, muted: false, music: true, musicVolume: 0.5, station: "drift" };
// the saved values that ?sound=0 and ?station= replace for this visit only: saved() writes these back instead, so a check
// link does not leave later visits muted (review R2-056). A setting the viewer changes on the page is theirs again (own).
const urlOnly = {};
function loadSettings() {
  Object.assign(set, (() => { try { return JSON.parse(store.get(KEYS.audio) || "{}"); } catch { return {}; } })());
  if (!(set.v >= 2)) { set.station = "drift"; set.v = 2; }   // Slow drift became the default station (Adriaen 2026-11-13)
  if (!OPT.sound) { urlOnly.muted = set.muted; set.muted = true; }
  if (STATIONS.some((s) => s.id === OPT.station)) { urlOnly.station = set.station; set.station = OPT.station; }
}
const own = (key) => { delete urlOnly[key]; };
const saved = () => JSON.stringify({ ...set, ...urlOnly });

let ac = null, master, comp, bus = {}, NOISE, BROWN, CRICKET;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- the graph: three buses into a gentle compressor
function boot() {
  if (ac) return true;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  try { ac = new AC({ latencyHint: "playback" }); } catch { return false; }
  ac.addEventListener?.("statechange", () => { showHint(); if (ac.state !== "running" && !document.hidden && started && !set.muted) kick = true; });
  comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  master = ac.createGain(); master.connect(comp); comp.connect(ac.destination);
  for (const k of ["nature", "sfx", "music"]) { bus[k] = ac.createGain(); bus[k].gain.value = LEVEL[k]; bus[k].connect(master); }
  // the radio's sound: music goes through a small speaker (a band-pass) when it comes from the radio
  bus.musicOut = ac.createGain(); bus.music.disconnect(); bus.music.connect(bus.musicOut); bus.musicOut.connect(master);
  NOISE = noiseBuf(2, "white"); BROWN = noiseBuf(4, "brown"); CRICKET = cricketBuf();
  applyGain(true); startBeds(); return true;
}
function noiseBuf(sec, kind) {
  const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); let last = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return b;
}
function cricketBuf() {   // one cricket: three quick chirps of a 4.6 kHz tone, then a rest; looped, at a few rates, round the clearing
  const sr = ac.sampleRate, n = Math.floor(sr * 1.1), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) { const t = i / sr, c = t % 0.11, on = t < 0.33 && c < 0.06 ? Math.sin(Math.PI * c / 0.06) : 0; d[i] = on * Math.sin(2 * Math.PI * 4600 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 90 * t)); }
  return b;
}
function applyGain(now) {
  if (!ac) return; const v = set.muted ? 0 : set.volume, t = ac.currentTime;
  master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(v * LEVEL.master, t, now ? 0.01 : 0.15);
  bus.musicOut.gain.setTargetAtTime(set.music ? set.musicVolume * 2 : 0, t, 0.3);
  clearTimeout(applyGain.sleep);   // muted: let the sound card rest once the fade is done (saves a phone's battery)
  if (set.muted) applyGain.sleep = setTimeout(() => set.muted && ac.state === "running" && ac.suspend(), 400);
  else if (started && !document.hidden && ac.state === "suspended") ac.resume().catch(() => {});
}

// a place in the camp a sound comes from; for a sound everywhere (your own steps, the menu) pass null
function spot(pos, ref = 1.5, out = bus.sfx) {
  if (!pos) return out;
  const p = ac.createPanner(); p.panningModel = "equalpower"; p.distanceModel = "inverse"; p.refDistance = ref; p.rolloffFactor = 1.2; p.maxDistance = 60;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
  p.connect(out); return p;
}
function env(g, t, a, peak, d, hold = 0) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); if (hold) g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d); }
function osc(type, f, t, dur, dest) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; }
function noise(t, dur, dest, buf = NOISE) { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(dest); s.start(t, Math.random() * (buf.duration - 0.5)); s.stop(t + dur + 0.05); return s; }
function filt(type, f, q, dest) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; }
function gain(dest, v = 1) { const g = ac.createGain(); g.gain.value = v; g.connect(dest); return g; }

// ---------------------------------------------------------------- starting on the first gesture, pausing when hidden
// Phones (Adriaen 2026-11-13: "can't hear anything"): iOS only lets sound start inside a real tap (touchend or click, not
// pointerdown), and by default treats web audio as "ambient", which the silent switch mutes. So on every tap until it plays:
// resume the context, play one silent sample, and ask for the "playback" audio session (Safari 16.4+), with a looping silent
// <audio> element as the older way to get the same.
let silentEl = null;
function silentWav() {   // 0.25 s of silence as a WAV
  const n = 2000, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}
function unlock() {
  try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch {}
  if (!silentEl && !navigator.audioSession) { try { silentEl = new Audio(silentWav()); silentEl.loop = true; silentEl.setAttribute("playsinline", ""); } catch {} }
  silentEl?.play?.().catch(() => {});
  try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, ac.sampleRate); s.connect(ac.destination); s.start(0); } catch {}
}
function start() {
  if (!boot()) return false;
  if ((ac.state !== "running" || kick) && !set.muted) { kick = false; unlock(); ac.resume().catch(() => {}); }
  if (!started) { started = true; routeMusic(); setInterval(musicTick, 100); keep(); }   // music keeps time even when frames drop
  return true;
}
// the "Tap for sound" pill (made by makeHint, which initAudio calls): shown if the sound still hasn't started after a tap
let hint = null, started = false;
const HINT_CSS = "position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:4;display:none;font:600 15px var(--display);color:var(--ink);background:rgb(255 248 238 / .94);border:0;border-radius:999px;padding:9px 16px;box-shadow:0 3px 0 rgb(138 90 59 / .25)";
function showHint() { if (hint) hint.style.display = ac && !set.muted && ac.state !== "running" ? "block" : "none"; }
// switching tabs or apps (Adriaen 2026-11-14: the sound didn't come back): pause while hidden, and on the way back try to
// resume at once. Phones often refuse that without a tap (iOS can also leave the context "running" but silent), so the next
// tap anywhere wakes it again inside the tap, and the Tap for sound pill shows if it is still off.
let kick = false;
function wake() { if (!ac || !started || set.muted || document.hidden) return; kick = true; ac.resume().catch(() => {}); setTimeout(showHint, 700); }

// a small pill if the sound still hasn't started after a tap (some phones and in-app browsers): tapping it starts it for sure
function makeHint() {
  hint = document.createElement("button"); hint.textContent = "🔇 Tap for sound";
  hint.style.cssText = HINT_CSS;
  hint.addEventListener("pointerdown", (e) => e.stopPropagation()); hint.onclick = (e) => { e.stopPropagation(); start(); setTimeout(showHint, 400); };
  document.body.append(hint);
}

export { ac, applyGain, BROWN, bus, comp, CRICKET, env, filt, gain, loadSettings, makeHint, noise, osc, own, pick, saved, set, showHint, spot, start, STATIONS, wake };
