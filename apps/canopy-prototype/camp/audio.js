// Canopy Camp sound: every sound and the music are made here in WebAudio at run time (no files to download, nothing licensed).
// Nature: leaves in the wind, birds by day, crickets, frogs and an owl at night, rain (louder drumming under the tent), the
// fire's crackle and the soup bubbling over it, all placed in the camp (equal-power panning, so it stays cheap on a phone).
// Life: sloth squeaks (a boop, a wave, saying hello), munching, yawns and sleepy breathing; the bearded operator's footsteps,
// his mumbled speech (a babble, one syllable a beat), sips, spoon clinks, page turns and snores; your own steps; the jeep's
// doors; a soft tock on every menu button. Most of it is heard by watching the camp's state each frame (squish, munch,
// yawn, wave, his clip), so the other modules need no sound calls.
// Music: four generated stations (Slow drift, the default: ambient tape loops; campfire guitar, kalimba, music-box lullaby), quiet under the nature sounds.
// Nothing plays until the first tap or key (browsers block it before that). main.js calls audioStep(dt, dusk) every frame.
// The radio prop drives it through `audio` (also window.__audio): start, volume, muted, music, musicVolume, station, next,
// tune (a burst of static between stations), musicFrom(object3D | null: the music then comes from it), state, onChange.
// The ⚙️ menu has a fallback: Sound: All / Nature only / Off. ?sound=0 starts muted. Settings are kept per viewer.
// Levels (Adriaen checks the mix by ear; cloud sessions can't hear it): the bus gains below are the knobs.
import * as THREE from "three";
import { $, camera, qs, store } from "./core.js";
import { sloths } from "./sloths.js";
import { me } from "./player.js";
import { weather } from "./weather.js";
import { SOUP_POT } from "./campProps.js";

const LEVEL = { master: 0.9, nature: 0.75, sfx: 0.85, music: 0.8 };   // the mix: music sits well under the camp
const STATIONS = [{ id: "drift", name: "Slow drift", emoji: "🌫️" }, { id: "campfire", name: "Campfire guitar", emoji: "🎸" }, { id: "kalimba", name: "Kalimba drift", emoji: "🎶" }, { id: "lullaby", name: "Music-box lullaby", emoji: "🌙" }];
const set = Object.assign({ volume: 0.8, muted: false, music: true, musicVolume: 0.5, station: "drift" }, (() => { try { return JSON.parse(store.get("canopy-audio") || "{}"); } catch { return {}; } })());
if (!(set.v >= 2)) { set.station = "drift"; set.v = 2; }   // Slow drift became the default station (Adriaen 2026-11-13)
if (qs.get("sound") === "0") set.muted = true;
if (STATIONS.some((s) => s.id === qs.get("station"))) set.station = qs.get("station");
const listeners = new Set();
const keep = () => { store.set("canopy-audio", JSON.stringify(set)); listeners.forEach((f) => { try { f(audio.state()); } catch {} }); showBtn(); };

let ac = null, master, comp, bus = {}, NOISE, BROWN, CRICKET;
const R = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3();

// ---------------------------------------------------------------- the graph: three buses into a gentle compressor
function boot() {
  if (ac) return true;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  try { ac = new AC({ latencyHint: "playback" }); } catch { return false; }
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

// ---------------------------------------------------------------- the sounds
const SFX = {
  tock() { const t = ac.currentTime, g = gain(bus.sfx, 0); env(g, t, 0.003, 0.035, 0.07); osc("sine", 900, t, 0.1, g).frequency.exponentialRampToValueAtTime(520, t + 0.06); },
  // a baby sloth's squeak: a high whistle that rises and falls, with a little wobble
  squeak(pos, k = 1) {
    const t = ac.currentTime, g = gain(spot(pos, 1.2), 0), f0 = R(1700, 2100) * k, len = R(0.18, 0.3); env(g, t, 0.03, 0.15, len);
    const o = osc("sine", f0, t, len + 0.1, g); o.frequency.linearRampToValueAtTime(f0 * 1.35, t + len * 0.4); o.frequency.linearRampToValueAtTime(f0 * 1.1, t + len);
    osc("sine", 24, t, len + 0.1, gain(o.frequency, 40)); const h = gain(g, 0.2); osc("triangle", f0 * 2, t, len + 0.1, h).frequency.linearRampToValueAtTime(f0 * 2.7, t + len * 0.4);
  },
  boop(pos) { const t = ac.currentTime, g = gain(spot(pos, 1.2), 0); env(g, t, 0.004, 0.16, 0.12); osc("sine", 520, t, 0.15, g).frequency.exponentialRampToValueAtTime(170, t + 0.1); setTimeout(() => ac && SFX.squeak(pos), 90); },
  chomp(pos) {   // one bite: a short crunchy burst through a soft band
    const t = ac.currentTime, g = gain(spot(pos, 1), 0); env(g, t, 0.005, R(0.3, 0.45), R(0.05, 0.09));
    noise(t, 0.12, filt("bandpass", R(900, 1600), 1.6, g)); const c = gain(g, 0.25); noise(t, 0.04, filt("highpass", 3500, 0.7, c));
  },
  munch(pos, dur = 2.4) { let n = Math.floor(dur / 0.3); const bite = () => { if (!ac || n-- <= 0) return; SFX.chomp(pos); setTimeout(bite, R(240, 330)); }; bite(); },
  // a yawn: a small voice (sawtooth through two vowel formants) sliding from "aa" to "oo", breathy
  yawn(pos, k = 1) {
    const t = ac.currentTime, len = 1.4, out = gain(spot(pos, 1.2), 0); env(out, t, 0.35, 0.16, 0.9, 0.2);
    const f1 = filt("bandpass", 950, 5, out), f2 = filt("bandpass", 1500, 6, gain(out, 0.6)); f1.frequency.linearRampToValueAtTime(450, t + len); f2.frequency.linearRampToValueAtTime(900, t + len);
    const o = osc("sawtooth", 560 * k, t, len, f1); o.connect(f2); o.frequency.linearRampToValueAtTime(620 * k, t + 0.3); o.frequency.exponentialRampToValueAtTime(330 * k, t + len);
    noise(t, len, filt("bandpass", 1200, 1, gain(out, 0.35)));
  },
  breath(pos, deep = false) {   // a sleepy breath in and out (a snore for him)
    const t = ac.currentTime, g = gain(spot(pos, deep ? 1.4 : 0.9), 0); env(g, t, 0.9, deep ? 0.1 : 0.045, 1.4);
    noise(t, 2.5, filt("lowpass", deep ? 380 : 700, 0.8, g)); if (deep) { const r = gain(g, 0.5); const o = osc("sawtooth", 62, t, 2.4, filt("lowpass", 240, 1, r)); o.frequency.linearRampToValueAtTime(55, t + 2); }
  },
  step(pos, soft) {   // a footstep on packed dirt and leaves
    const t = ac.currentTime, g = gain(spot(pos, 1.6), 0); env(g, t, 0.004, soft ? R(0.05, 0.07) : R(0.09, 0.13), 0.09);
    noise(t, 0.12, filt("lowpass", R(500, 800), 0.7, g)); const l = gain(g, 0.3); noise(t + 0.02, 0.06, filt("bandpass", R(2500, 4000), 1.5, l));
  },
  // his voice: a mumble, one syllable a beat, low and warm (a whisper at night, when he is lying down)
  babble(pos, words, whisper) {
    const syl = Math.min(14, Math.max(2, Math.round(words * 1.2))); let t = ac.currentTime + 0.05, f = R(115, 135);
    const out = spot(pos, 1.6);
    for (let i = 0; i < syl; i++) {
      const len = R(0.08, 0.15), g = gain(out, 0); env(g, t, 0.02, whisper ? 0.08 : 0.2, len);
      const [a, b] = pick([[700, 1200], [400, 2000], [550, 900], [300, 2300], [600, 1700]]), f1 = filt("bandpass", a, 4, g), f2 = filt("bandpass", b, 6, gain(g, 0.5));
      if (whisper) { noise(t, len + 0.05, f1); noise(t, len + 0.05, f2); }
      else { const o = osc("sawtooth", f, t, len + 0.05, f1); o.connect(f2); o.frequency.linearRampToValueAtTime(f * R(0.9, 1.1), t + len); }
      f = THREE.MathUtils.clamp(f * R(0.92, 1.08), 100, 160); t += len + R(0.03, 0.08) + (Math.random() < 0.15 ? 0.15 : 0);
    }
  },
  slurp(pos) { const t = ac.currentTime, g = gain(spot(pos, 1.2), 0); env(g, t, 0.08, 0.07, 0.3, 0.15); const b = filt("bandpass", 700, 3, g); b.frequency.exponentialRampToValueAtTime(2400, t + 0.5); noise(t, 0.6, b); },
  clink(pos) { const t = ac.currentTime, g = gain(spot(pos, 1.2), 0); env(g, t, 0.002, 0.06, 0.25); osc("sine", R(2700, 3000), t, 0.3, g); osc("sine", R(4200, 4500), t, 0.2, gain(g, 0.5)); },
  page(pos) { const t = ac.currentTime, g = gain(spot(pos, 1), 0); env(g, t, 0.06, 0.05, 0.18); const b = filt("highpass", 1800, 0.7, g); b.frequency.linearRampToValueAtTime(4000, t + 0.25); noise(t, 0.3, b); },
  door(pos, open) {   // the jeep door: a short creak opening, a soft clunk shutting
    const t = ac.currentTime, out = spot(pos, 1.5);
    if (open) { const g = gain(out, 0); env(g, t, 0.05, 0.05, 0.25, 0.2); const o = osc("sawtooth", 320, t, 0.5, filt("bandpass", 1100, 8, g)); o.frequency.linearRampToValueAtTime(260, t + 0.45); osc("sine", 13, t, 0.5, gain(o.frequency, 30)); }
    const g = gain(out, 0), tt = open ? t : t + 0.02; env(g, tt, 0.003, open ? 0.04 : 0.1, 0.14); osc("sine", 95, tt, 0.18, g).frequency.exponentialRampToValueAtTime(55, tt + 0.15); noise(tt, 0.05, filt("lowpass", 1200, 0.7, gain(g, 0.6)));
  },
  tune() {   // radio static between stations
    const t = ac.currentTime, g = gain(bus.musicOut, 0); env(g, t, 0.02, 0.25, 0.2, 0.25);
    const b = filt("bandpass", 2200, 0.8, g); b.frequency.linearRampToValueAtTime(900, t + 0.4); noise(t, 0.5, b);
    const w = gain(g, 0.25); osc("sine", 1500, t, 0.45, w).frequency.exponentialRampToValueAtTime(400, t + 0.4);
  },
  // birds by day (made up, not any real species): a two-note whistle, a trill, a soft coo, a chirpy run
  bird() {
    const a = R(0, 6.28), pos = tmp.set(Math.cos(a) * R(11, 17), R(5, 10), Math.sin(a) * R(11, 17)).clone(), out = spot(pos, 3, bus.nature), t = ac.currentTime, kind = Math.random();
    if (kind < 0.35) { for (let i = 0; i < 2; i++) { const g = gain(out, 0), tt = t + i * 0.28, f = R(2000, 2600); env(g, tt, 0.02, 0.09, 0.2); const o = osc("sine", i ? f * 1.25 : f, tt, 0.25, g); o.frequency.linearRampToValueAtTime((i ? f * 1.4 : f * 0.9), tt + 0.2); } }
    else if (kind < 0.6) { const g = gain(out, 0), len = R(0.5, 0.9); env(g, t, 0.05, 0.06, 0.2, len - 0.2); const am = gain(g, 0); osc("sine", R(3600, 4400), t, len, am); osc("square", R(18, 28), t, len, gain(am.gain, 0.5)); am.gain.value = 0.5; }
    else if (kind < 0.8) { for (let i = 0; i < 3; i++) { const g = gain(out, 0), tt = t + i * 0.42 + (i === 2 ? 0.1 : 0); env(g, tt, 0.06, 0.07, 0.3); osc("sine", i === 1 ? 620 : 560, tt, 0.4, filt("lowpass", 900, 1, g)); } }
    else { for (let i = 0; i < 5; i++) { const g = gain(out, 0), tt = t + i * 0.09, f = R(3000, 3800); env(g, tt, 0.01, 0.05, 0.06); osc("sine", f, tt, 0.08, g).frequency.exponentialRampToValueAtTime(f * 0.7, tt + 0.07); } }
  },
  frog() { const a = R(0, 6.28), pos = tmp.set(Math.cos(a) * R(10, 15), 0.2, Math.sin(a) * R(10, 15)).clone(), out = spot(pos, 2.5, bus.nature), t = ac.currentTime;
    for (let i = 0; i < 2; i++) { const g = gain(out, 0), tt = t + i * 0.13; env(g, tt, 0.01, 0.08, 0.08); osc("square", R(170, 220), tt, 0.1, filt("bandpass", 700, 3, g)); } },
  owl() { const a = R(0, 6.28), pos = tmp.set(Math.cos(a) * 16, 9, Math.sin(a) * 16).clone(), out = spot(pos, 4, bus.nature), t = ac.currentTime;
    [[0, 0.35], [0.55, 0.2], [0.8, 0.6]].forEach(([d, l]) => { const g = gain(out, 0); env(g, t + d, 0.06, 0.08, l); const o = osc("sine", 390, t + d, l + 0.1, filt("lowpass", 700, 1, g)); o.frequency.linearRampToValueAtTime(350, t + d + l); }); },
  crackle(big) { const t = ac.currentTime, g = gain(fire.out, 0); env(g, t, 0.001, big ? R(0.25, 0.4) : R(0.04, 0.14), big ? 0.05 : R(0.008, 0.03)); noise(t, 0.08, filt("highpass", big ? 900 : R(1800, 4500), 0.8, g)); },
  bubble() { const t = ac.currentTime, g = gain(fire.pot, 0), f = R(250, 450); env(g, t, 0.005, R(0.03, 0.07), 0.05); osc("sine", f, t, 0.08, g).frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05); },
  knock(pos) { const t = ac.currentTime, g = gain(spot(pos, 1), 0); env(g, t, 0.003, 0.08, 0.08); osc("sine", R(260, 340), t, 0.1, g); noise(t, 0.04, filt("bandpass", 1200, 2, gain(g, 0.5))); },
  plop(pos) { const t = ac.currentTime, g = gain(spot(pos, 1), 0); env(g, t, 0.005, 0.14, 0.18); osc("sine", 180, t, 0.2, g).frequency.exponentialRampToValueAtTime(520, t + 0.12); noise(t, 0.15, filt("bandpass", 900, 1.2, gain(g, 0.4))); },
  slosh(pos) { const t = ac.currentTime, g = gain(spot(pos, 1), 0); env(g, t, 0.04, 0.07, 0.3, 0.1); const b = filt("bandpass", 600, 2, g); b.frequency.linearRampToValueAtTime(1100, t + 0.15); b.frequency.linearRampToValueAtTime(700, t + 0.4); noise(t, 0.5, b); },
  pour(pos) { const t = ac.currentTime, g = gain(spot(pos, 1.2), 0); env(g, t, 0.15, 0.09, 0.5, 1); const b = filt("bandpass", 900, 1.5, g); b.frequency.linearRampToValueAtTime(1600, t + 1.4); noise(t, 1.8, b); },
  drip(under) { const t = ac.currentTime, g = gain(under ? rain.roof : rain.drips, 0), f = under ? R(500, 900) : R(1800, 3500); env(g, t, 0.002, under ? R(0.04, 0.09) : R(0.02, 0.05), under ? 0.05 : 0.04); osc("sine", f, t, 0.08, g).frequency.exponentialRampToValueAtTime(f * (under ? 0.6 : 1.5), t + 0.04); },
};

// ---------------------------------------------------------------- the beds: wind in the leaves, the fire, rain, crickets
const fire = {}, rain = {}, wind = {}, night = {};
function startBeds() {
  const t = ac.currentTime;
  // wind: soft noise in the leaves, its level wandering slowly (gusts)
  wind.g = gain(bus.nature, 0.0); noise(t, 1e5, filt("lowpass", 1700, 0.5, filt("bandpass", 650, 0.4, wind.g)));
  // the fire at the centre of the camp: a low roar plus crackles (SFX.crackle), and the soup over it (SFX.bubble)
  fire.out = spot(new THREE.Vector3(0, 0.45, 0), 1.3, bus.nature);
  const roar = gain(fire.out, 0.22); noise(t, 1e5, filt("lowpass", 420, 0.6, roar), BROWN);
  fire.pot = spot(new THREE.Vector3(SOUP_POT.at.x, SOUP_POT.at.y, SOUP_POT.at.z), 0.7, bus.nature);
  // rain: a hiss everywhere, drips on leaves around you, and the drumming on the tent's roof when you are under it
  rain.g = gain(bus.nature, 0); noise(t, 1e5, filt("lowpass", 5200, 0.5, filt("highpass", 500, 0.5, rain.g)));
  rain.drips = gain(bus.nature, 0); rain.roof = gain(bus.nature, 0);
  // crickets at night: four loops at slightly different rates, placed round the clearing
  night.g = gain(bus.nature, 0);
  for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.4, s = ac.createBufferSource(); s.buffer = CRICKET; s.loop = true; s.playbackRate.value = R(0.85, 1.15); s.connect(spot(new THREE.Vector3(Math.cos(a) * 12, 0.3, Math.sin(a) * 12), 4, gain(night.g, R(0.06, 0.1)))); s.start(t + R(0, 1)); }
}
const underTent = (p) => {   // as weather.js dry(): inside the tent's roof and planks
  const t = window.__camp?.tentAt; if (!t) return false;
  const L = t.length(), fx = -t.x / L, fz = -t.z / L, dx = p.x - t.x, dz = p.z - t.z, a = dx * fx + dz * fz, b = dx * fz - dz * fx;
  return a > -1.9 && a < 2.2 && Math.abs(b) < 2.0;
};

// ---------------------------------------------------------------- music: three generated stations
// Notes as MIDI numbers; a lookahead scheduler queues them 0.3 s ahead. Each station plays an 8-bar phrase made once and
// repeated with small changes, so it has a tune you can hum but doesn't loop like a jingle.
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12), plucks = new Map();
function pluckBuf(m) {   // a nylon string (Karplus-Strong), made once per note
  if (plucks.has(m)) return plucks.get(m);
  const sr = ac.sampleRate, f = hz(m), N = Math.max(2, Math.round(sr / f)), n = Math.floor(sr * 2.2), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), ring = new Float32Array(N);
  let prev = 0; for (let i = 0; i < N; i++) { const w = Math.random() * 2 - 1; ring[i] = prev = prev * 0.5 + w * 0.5; }   // a soft pick: low-passed noise
  const k = 0.4985 + 0.0012 * Math.min(1, 220 / f);
  for (let i = 0, j = 0; i < n; i++, j = (j + 1) % N) { const nx = ring[(j + 1) % N]; d[i] = ring[j]; ring[j] = (ring[j] + nx) * k; }
  plucks.set(m, b); return b;
}
const INST = {
  pluck(m, t, v) { const s = ac.createBufferSource(); s.buffer = pluckBuf(m); const g = gain(bus.music, v * 0.55); s.connect(filt("lowpass", 3200, 0.5, g)); s.start(t); },
  kalimba(m, t, v) { const f = hz(m), g = gain(bus.music, 0); env(g, t, 0.004, v * 0.3, 1.6); osc("sine", f, t, 1.8, g); const h = gain(bus.music, 0); env(h, t, 0.002, v * 0.08, 0.14); osc("sine", f * 5.4, t, 0.2, h); },
  box(m, t, v) { const f = hz(m), g = gain(bus.music, 0); env(g, t, 0.003, v * 0.22, 1.3); osc("sine", f, t, 1.4, g); const h = gain(bus.music, 0); env(h, t, 0.002, v * 0.07, 0.5); osc("sine", f * 3.01, t, 0.6, h); const i = gain(bus.music, 0); env(i, t, 0.001, v * 0.04, 0.2); osc("sine", f * 4.2, t, 0.25, i); },
  bass(m, t, v, len = 1) { const g = gain(bus.music, 0); env(g, t, 0.01, v * 0.3, len); osc("triangle", hz(m), t, len + 0.1, filt("lowpass", 500, 0.7, g)); },
  pad(ms, t, len, v) { const g = gain(bus.music, 0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.05, t + 1.2); g.gain.setValueAtTime(v * 0.05, t + len - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len + 1.5);
    const lp = filt("lowpass", 900, 0.5, g); for (const m of ms) for (const d of [-4, 4]) { const o = osc("triangle", hz(m), t, len + 1.6, lp); o.detune.value = d; } },
  shaker(t, v) { const g = gain(bus.music, 0); env(g, t, 0.01, v * 0.035, 0.06); noise(t, 0.1, filt("highpass", 6000, 0.7, g)); },
};
// chords as MIDI notes, root first
const C = { C: [48, 55, 60, 64, 67, 71], Am: [45, 52, 57, 60, 64, 67], F: [41, 48, 53, 57, 60, 64], G: [43, 50, 55, 59, 62, 65], Em: [40, 47, 52, 55, 59, 62], Dm: [38, 45, 50, 53, 57, 60], Bb: [46, 53, 58, 62, 65, 69] };
const STYLE = {
  // fingerpicked nylon guitar, 76 bpm: bass on 1 and 3, an arpeggio in eighths, now and then a melody note up high
  campfire: { bpm: 76, beats: 4, prog: ["C", "Am", "F", "G", "C", "Em", "F", "G"], scale: [60, 62, 64, 67, 69, 72, 74, 76],
    bar(ch, t, b, ph, s) { const c = C[ch], e = 60 / s.bpm / 2, pat = [0, 2, 3, 4, 2, 3, 5, 3];
      for (let i = 0; i < 8; i++) { const sw = i % 2 ? e * 0.08 : 0; INST.pluck(i === 0 || i === 4 ? c[i === 0 ? 0 : 1] : c[pat[i]], t + i * e + sw, i % 4 === 0 ? 0.9 : 0.55); }
      ph[b]?.forEach(([beat, m]) => INST.pluck(m + 12, t + beat * e * 2 + 0.01, 0.75)); } },
  // kalimba over a slow pad, 64 bpm, F major pentatonic
  kalimba: { bpm: 64, beats: 4, prog: ["F", "Dm", "Bb", "C", "F", "Dm", "Bb", "C"], scale: [65, 67, 69, 72, 74, 77, 79, 81],
    bar(ch, t, b, ph, s) { const q = 60 / s.bpm; INST.pad(C[ch].slice(1, 4).map((m) => m + 12), t, q * 4, 1); INST.bass(C[ch][0], t, 0.8, 2.5);
      ph[b]?.forEach(([beat, m]) => INST.kalimba(m, t + beat * q, 0.8)); for (let i = 0; i < 4; i++) INST.shaker(t + (i + 0.5) * q, i % 2 ? 1 : 0.6); } },
  // a music box waltz, 3/4 at 84 bpm: the low note on 1, the chord on 2 and 3, the tune on top
  lullaby: { bpm: 84, beats: 3, prog: ["C", "Am", "F", "G", "C", "Am", "Dm", "G"], scale: [72, 74, 76, 77, 79, 81, 83, 84],
    bar(ch, t, b, ph, s) { const c = C[ch], q = 60 / s.bpm; INST.box(c[0] + 12, t, 0.7); INST.box(c[2] + 12, t + q, 0.4); INST.box(c[3] + 12, t + q, 0.35); INST.box(c[2] + 12, t + 2 * q, 0.4); INST.box(c[3] + 12, t + 2 * q, 0.35);
      INST.pad(c.slice(1, 4), t, q * 3, 0.7); ph[b]?.forEach(([beat, m]) => INST.box(m + 12, t + beat * q, 0.85)); } },
};
// a phrase: per bar a few [beat, note] pairs, the notes walking the scale and landing on a chord tone
function phrase(s) {
  const out = []; let i = 3;
  for (let b = 0; b < s.prog.length; b++) {
    const notes = [], n = s.beats === 3 ? pick([1, 2, 3]) : pick([0, 1, 2, 2, 3]), beats = s.beats === 3 ? [0, 1, 2] : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].filter((x, k) => s.id === "kalimba" || k % 2 === 0 || Math.random() < 0.3);
    const at = beats.sort(() => Math.random() - 0.5).slice(0, n).sort((a, b2) => a - b2);
    for (const beat of at) { i = THREE.MathUtils.clamp(i + pick([-2, -1, -1, 1, 1, 2, 0]), 0, s.scale.length - 1); let m = s.scale[i];
      const tones = C[s.prog[b]].map((x) => x % 12); if (beat === at[0] && !tones.includes(m % 12)) m = s.scale.reduce((a, x) => (tones.includes(x % 12) && Math.abs(x - m) < Math.abs(a - m) ? x : a), m); notes.push([beat, m]); }
    out.push(notes);
  }
  return out;
}
// Slow drift (Adriaen 2026-11-13: ambient, organic, evolving, generative, in the airport-ambient tradition): tape-loop style.
// Seven voices, each one note on its own loop of 17..32 s; the lengths share no common beat, so the notes meet in ever new
// clusters and the piece never repeats. Every few turns a voice moves to a neighbouring note, or changes from a soft
// piano tone to a sung "ooh" pad and back, so it evolves slowly. A low drone swells under it now and then. All of it goes
// through a long, dark reverb (a 6 s room made from decaying noise).
const DRIFT_NOTES = [53, 56, 60, 61, 63, 65, 68, 72, 73, 75];   // F Ab C Db Eb, over two octaves: Db major, warm and open
let reverbIn = null;
function reverb() {
  if (reverbIn) return reverbIn;
  const sr = ac.sampleRate, n = Math.floor(sr * 6), b = ac.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const k = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.42 * k); d[i] = lp * Math.pow(1 - k, 2.2) * (i < sr * 0.03 ? i / (sr * 0.03) : 1); } }   // darker as it fades
  const cv = ac.createConvolver(); cv.buffer = b; cv.connect(gain(bus.music, 0.9));
  reverbIn = ac.createGain(); reverbIn.connect(cv); return reverbIn;
}
const AMB = {
  piano(m, t, v, out) { const f = hz(m), g = gain(out, 0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.16, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
    osc("sine", f, t, 7.1, g); const h = gain(g, 0.25); osc("sine", f * 2, t, 3, h); h.gain.setTargetAtTime(0, t, 0.6); const k = gain(g, 0.06); osc("triangle", f * 3.01, t, 1.2, k); k.gain.setTargetAtTime(0, t, 0.25); },
  ooh(m, t, v, out) { const f = hz(m), g = gain(out, 0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.07, t + 2.8); g.gain.setValueAtTime(v * 0.07, t + 4); g.gain.linearRampToValueAtTime(0.0001, t + 9);
    const lp = filt("lowpass", f * 3, 0.7, g); for (const d of [-6, 0, 7]) { const o = osc(d ? "sine" : "triangle", f, t, 9.1, lp); o.detune.value = d; osc("sine", R(4, 5.5), t, 9.1, gain(o.detune, 4)); } },
  drone(m, t, v, out) { const g = gain(out, 0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.08, t + 8); g.gain.linearRampToValueAtTime(0.0001, t + 20);
    const lp = filt("lowpass", 300, 0.5, g); for (const d of [-4, 4]) { const o = osc("sine", hz(m), t, 20.1, lp); o.detune.value = d; } osc("sine", hz(m + 7), t, 20.1, gain(lp, 0.4)); },
};
const drift = { voices: null, droneT: 0 };
function driftTick() {
  const now = ac.currentTime, rv = reverb();
  if (!drift.voices) {
    drift.dry = gain(bus.music, 0.55); drift.wet = gain(rv, 1);
    const LOOPS = [17.3, 19.7, 21.1, 23.9, 25.7, 29.3, 31.7];
    drift.voices = LOOPS.map((len, i) => ({ len, i: 1 + Math.floor(Math.random() * (DRIFT_NOTES.length - 2)), kind: i % 3 === 2 ? "ooh" : "piano", next: now + 0.5 + Math.random() * len * 0.6, turns: 0 }));
    drift.droneT = now + 4;
  }
  for (const v of drift.voices) {
    if (v.next > now + 0.35) continue;
    if (v.next < now - 1) v.next = now + Math.random() * 2;   // after a pause
    const send = (fn) => { const o = gain(drift.dry, 1); o.connect(drift.wet); fn(DRIFT_NOTES[v.i], v.next, R(0.75, 1), o); };
    send(AMB[v.kind]);
    if (++v.turns % 3 === 0 && Math.random() < 0.6) v.i = THREE.MathUtils.clamp(v.i + pick([-1, 1]), 0, DRIFT_NOTES.length - 1);   // drift to a neighbouring note
    if (Math.random() < 0.08) v.kind = v.kind === "piano" ? "ooh" : "piano";
    v.next += v.len;
  }
  if (drift.droneT < now + 0.35) { const o = gain(drift.dry, 1); o.connect(drift.wet); AMB.drone(pick([37, 41, 44]), Math.max(drift.droneT, now), 1, o); drift.droneT = Math.max(drift.droneT, now) + R(30, 55); }
}

const mus = { st: null, next: 0, bar: 0, ph: null, rep: 0, timer: 0 };
function musicTick() {
  if (!ac || !set.music || set.muted || ac.state !== "running") return;
  if (set.station === "drift") { mus.st = null; driftTick(); return; }
  drift.voices = null;   // a fresh start next time it's tuned in
  const st = STYLE[set.station]; if (!st) return; st.id = set.station;
  if (mus.next < ac.currentTime) mus.next = ac.currentTime + 0.1;   // after a pause, carry on from now
  if (mus.st !== st) { mus.st = st; mus.bar = 0; mus.ph = phrase(st); mus.rep = 0; mus.next = Math.max(mus.next, ac.currentTime + 0.15); }
  while (mus.next < ac.currentTime + 0.35) {
    const b = mus.bar % st.prog.length; st.bar(st.prog[b], mus.next, b, mus.ph, st);
    mus.next += 60 / st.bpm * st.beats; mus.bar++;
    if (mus.bar % st.prog.length === 0) { mus.rep++; if (mus.rep % 2 === 0) mus.ph = phrase(st); else mus.ph = mus.ph.map((n) => Math.random() < 0.25 ? [] : n); }   // a phrase twice (the 2nd a little sparser), then a new one
  }
}

// ---------------------------------------------------------------- the radio's position: music from it, through a small speaker
let musicObj = null, musicPan = null;
function routeMusic() {
  if (!ac) return; bus.music.disconnect();
  if (musicObj && !musicPan) {
    musicPan = ac.createPanner(); musicPan.panningModel = "equalpower"; musicPan.distanceModel = "inverse"; musicPan.refDistance = 3; musicPan.rolloffFactor = 0.5;   // fills the camp, a little louder near the radio
    musicPan.connect(bus.musicOut); musicPan.inp = filt("highpass", 160, 0.7, filt("lowpass", 6000, 0.6, musicPan));
  }
  bus.music.connect(musicObj ? musicPan.inp : bus.musicOut);
}

// ---------------------------------------------------------------- watching the camp: who did what since the last frame
const was = new WeakMap(), opWas = { line: "", clip: "", kind: "", door: [] };
let potStage = null, stirT = 0, started = false, nextBird = 3, nextFrog = 5, nextOwl = 30, crackleT = 0, bubbleT = 0, dripT = 0, gustT = 0, gust = 0.5, opT = 0, opStepD = 0, meStepD = 0, opLast = null, meLast = null, sleepT = 4, opClinkT = 3, opPageT = 6, opSnoreT = 2;
const potAt = () => new THREE.Vector3(SOUP_POT.at.x, SOUP_POT.at.y, SOUP_POT.at.z);
const slothAt = (s) => s.o.getWorldPosition(new THREE.Vector3()).setY(s.o.getWorldPosition(tmp).y + 0.25);
function watchSloths(dt) {
  for (const s of sloths) {
    const w = was.get(s) || { squish: 0, munch: 0, yawn: 0, wave: 0, gift: null, phase: null };
    if (s.squish > w.squish + 0.5) SFX.boop(slothAt(s));
    if ((s.munch || 0) > w.munch + 0.5) SFX.munch(slothAt(s), s.munch);
    if (s.gift && !w.gift) setTimeout(() => ac && SFX.munch(slothAt(s), 2.4), 600);
    if (s.yawn && !w.yawn) SFX.yawn(slothAt(s), R(0.95, 1.1));
    if (s.wave && !w.wave) SFX.squeak(slothAt(s), 1.15);
    const ph = s.trip?.phase ?? null; if (ph === "greet" && w.phase !== "greet" && Math.random() < 0.7) { const p = slothAt(s); SFX.squeak(p, 0.95); setTimeout(() => ac && SFX.squeak(p, 1.1), 260); }
    Object.assign(w, { squish: s.squish || 0, munch: s.munch || 0, yawn: s.yawn || 0, wave: s.wave || 0, gift: s.gift || null, phase: ph }); was.set(s, w);
  }
  // the nearest sleeping sloth breathes slowly, if you are close enough to hear it
  if ((sleepT -= dt) < 0) { sleepT = R(3.2, 4.2); let best = null, bd = 4; for (const s of sloths) if (s.asleep) { const d = s.o.getWorldPosition(tmp).distanceTo(camera.position); if (d < bd) { bd = d; best = s; } } if (best) SFX.breath(slothAt(best)); }
}
function watchOperator(dt) {
  const O = window.__op; if (!O) return;
  const p = O.root.position, head = tmp.copy(p).setY(p.y + 1.6).clone();
  if (opLast) { const d = Math.hypot(p.x - opLast.x, p.z - opLast.z); if (d < 0.5) { opStepD += d; if (opStepD > 0.64) { opStepD = 0; SFX.step(p.clone().setY(0.05)); } } }
  opLast = p.clone();
  // cooking (op.stir, op.veg in operator.js): the stirring stick knocks the pot, vegetables plop in
  const o = O.op || {}, pot = potAt();
  if (o.stir && (stirT -= dt) < 0) { stirT = R(0.6, 1.1); SFX.knock(pot); SFX.bubble(); }
  if (opWas.veg && !o.veg) SFX.plop(pot);
  opWas.veg = !!o.veg;
  if ((opT -= dt) > 0) return; opT = 0.1;
  const st = O.state(), line = O.line?.() || "";
  if (line && line !== opWas.line) SFX.babble(head, line.split(/\s+/).length, st.lying || st.sleeping);
  if (st.clip === "sip" && opWas.clip !== "sip") SFX.slurp(head.clone().setY(head.y - 0.15));
  if (st.clip?.startsWith("play") && Math.random() < 0.08) SFX.squeak(head.clone().setY(head.y + 0.3), 1.2);
  if (st.seated && (st.kind === "eat" || st.kind === "cook") && (opClinkT -= 0.1) < 0) { opClinkT = R(2, 4); SFX.clink(head.clone().setY(head.y - 0.5)); }
  if (st.kind === "cook" && !st.seated && (opClinkT -= 0.1) < 0) { opClinkT = R(1.2, 2.5); SFX.clink(new THREE.Vector3(SOUP_POT.at.x, SOUP_POT.at.y, SOUP_POT.at.z)); }
  if (st.seated && st.kind === "read" && (opPageT -= 0.1) < 0) { opPageT = R(8, 15); SFX.page(head.clone().setY(head.y - 0.5)); }
  if (st.sleeping && (opSnoreT -= 0.1) < 0) { opSnoreT = R(3.6, 4.4); SFX.breath(head.clone().setY(p.y + 0.6), true); }
  Object.assign(opWas, { line, clip: st.clip || "", kind: st.kind });
}
function watchJeep() {
  const J = window.__jeep; if (!J?.doors) return;
  J.doors.forEach((d, i) => { const o = d.open; if (opWas.door[i] !== undefined && o !== opWas.door[i]) SFX.door(d.o.getWorldPosition(new THREE.Vector3()), o); opWas.door[i] = o; });
}

function audioStep(dt, dusk = 0) {
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime, wet = weather.wet, day = 1 - dusk;
  // the ear: the camera
  const L = ac.listener; camera.getWorldPosition(tmp); camera.getWorldDirection(fwd); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (L.positionX) { L.positionX.value = tmp.x; L.positionY.value = tmp.y; L.positionZ.value = tmp.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z; }
  else { L.setPosition(tmp.x, tmp.y, tmp.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  if (musicObj && musicPan) { musicObj.getWorldPosition(tmp); if (musicPan.positionX) { musicPan.positionX.value = tmp.x; musicPan.positionY.value = tmp.y; musicPan.positionZ.value = tmp.z; } else musicPan.setPosition(tmp.x, tmp.y, tmp.z); }
  // beds
  if ((gustT -= dt) < 0) { gustT = R(2, 5); gust = R(0.3, 1); }
  wind.g.gain.setTargetAtTime((0.05 + 0.06 * gust) * (1 - 0.5 * dusk) * (1 - 0.6 * wet), t, 1.2);
  rain.g.gain.setTargetAtTime(0.065 * wet, t, 0.8);
  const under = wet > 0.05 && underTent(me.pos);
  rain.drips.gain.setTargetAtTime(under ? 0.2 : 1, t, 0.3); rain.roof.gain.setTargetAtTime(under ? 1 : 0, t, 0.3);
  if (wet > 0.05 && (dripT -= dt) < 0) { dripT = R(0.02, 0.12) / wet; SFX.drip(false); if (under) { SFX.drip(true); if (Math.random() < 0.6) SFX.drip(true); } }
  night.g.gain.setTargetAtTime(THREE.MathUtils.smoothstep(dusk, 0.4, 0.9) * (1 - 0.6 * wet), t, 1.5);
  if ((crackleT -= dt) < 0) { crackleT = R(0.03, 0.35); SFX.crackle(Math.random() < 0.04); }
  // the pot (activities.js soup, read through __acts.cook): quiet when empty, a faint simmer of water, a lively bubble while
  // it cooks, a gentle one when it's soup; water pouring in (yours or his) when it fills. Without that, a gentle simmer.
  const stage = window.__acts?.cook?.stage ?? "ready", rate = { empty: 0, water: 0.6, cooking: 6, ready: 2 }[stage] ?? 2;
  if (potStage === "empty" && stage === "water") SFX.pour(potAt());
  if (potStage === "water" && stage === "cooking") SFX.plop(potAt());
  potStage = stage;
  if (rate && (bubbleT -= dt) < 0) { bubbleT = R(0.4, 1.6) / rate; SFX.bubble(); }
  if ((nextBird -= dt) < 0) { nextBird = R(2.5, 8) / Math.max(0.15, day * (1 - 0.7 * wet)); if (day > 0.3 && Math.random() < day * (1 - 0.7 * wet)) SFX.bird(); }
  if ((nextFrog -= dt) < 0) { nextFrog = R(2, 7); if (dusk > 0.6 || wet > 0.5) SFX.frog(); }
  if ((nextOwl -= dt) < 0) { nextOwl = R(25, 60); if (dusk > 0.8) SFX.owl(); }
  // life
  watchSloths(dt); watchOperator(dt); watchJeep();
  if (meLast) { const d = Math.hypot(me.pos.x - meLast.x, me.pos.z - meLast.z); if (d < 0.5 && !me.seat) { meStepD += d; if (meStepD > 0.78) { meStepD = 0; SFX.step(null, true); } } }
  meLast = me.pos.clone();
  musicTick();
}

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
  if (ac.state !== "running" && !set.muted) { unlock(); ac.resume().catch(() => {}); }
  if (!started) { started = true; routeMusic(); setInterval(musicTick, 100); keep(); }   // music keeps time even when frames drop
  return true;
}
// start only on events that count as a tap everywhere (iOS ignores pointerdown and touchstart for audio)
for (const ev of ["pointerup", "keydown", "touchend", "click"]) addEventListener(ev, () => { start(); setTimeout(showHint, 600); }, { capture: true, passive: true });
// a small pill if the sound still hasn't started after a tap (some phones and in-app browsers): tapping it starts it for sure
const hint = document.createElement("button"); hint.textContent = "🔇 Tap for sound";
hint.style.cssText = "position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:4;display:none;font:600 15px var(--display);color:var(--ink);background:rgb(255 248 238 / .94);border:0;border-radius:999px;padding:9px 16px;box-shadow:0 3px 0 rgb(138 90 59 / .25)";
hint.addEventListener("pointerdown", (e) => e.stopPropagation()); hint.onclick = (e) => { e.stopPropagation(); start(); setTimeout(showHint, 400); };
document.body.append(hint);
function showHint() { hint.style.display = ac && !set.muted && ac.state !== "running" ? "block" : "none"; }
document.addEventListener("click", (e) => { if (e.target.closest?.("button")) { start(); if (ac?.state === "running") SFX.tock(); } }, true);
document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend(); else if (started && !set.muted) ac.resume().catch(() => {}); });

// your chores (activities.js), heard through the message they show: a log picked up, the water pail, a vegetable, a bowl
const toastEl = $("toast"); let toastWas = "";
if (toastEl) new MutationObserver(() => {
  const x = toastEl.textContent; if (x === toastWas || !ac || ac.state !== "running") { toastWas = x; return; } toastWas = x;
  const near = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 0.6).setY(camera.position.y - 0.4);
  if (/🪵/.test(x)) SFX.knock(near);
  else if (/💧/.test(x) && /^Got/.test(x)) SFX.slosh(near);
  else if (/🍲/.test(x) && !/bubbling/.test(x)) SFX.clink(near);
  else if (/^Got/.test(x)) SFX.knock(near);
  if (/🔥/.test(x)) for (let i = 0; i < 4; i++) setTimeout(() => ac && SFX.crackle(i === 0), i * 90);
}).observe(toastEl, { childList: true, characterData: true, subtree: true });

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
  musicFrom(o) { musicObj = o || null; routeMusic(); },
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
window.__audio = audio;

// ⚙️ fallback: one button that cycles All (music and camp) → Nature only (no music) → Off
const btn = $("sound");
function showBtn() { if (!btn) return; btn.textContent = "Sound: " + (set.muted ? "Off 🔇" : set.music ? "All 🔊" : "Nature only 🌿"); }
if (btn) btn.onclick = () => { start(); if (set.muted) { set.muted = false; set.music = true; mus.st = null; } else if (set.music) set.music = false; else set.muted = true; applyGain(); keep(); };
showBtn();

export { audio, audioStep };
