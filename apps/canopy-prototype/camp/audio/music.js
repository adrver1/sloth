// Canopy Camp sound, the music: four generated stations (Slow drift, the default: ambient tape loops; campfire guitar,
// kalimba, music-box lullaby), a lookahead scheduler (musicTick), and the radio's position: musicFrom(object3D | null)
// plays the music from that object through a small speaker (routeMusic).
import * as THREE from "three";
import { rand as R } from "../util.js";   // a number between a and b from Math.random
import { ac, bus, env, filt, gain, noise, osc, pick, set } from "./context.js";

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
// the radio prop (audio.musicFrom): the music comes from this object, or from everywhere again with null
function musicFrom(o) { musicObj = o || null; routeMusic(); }

export { mus, musicFrom, musicObj, musicPan, musicTick, routeMusic };
