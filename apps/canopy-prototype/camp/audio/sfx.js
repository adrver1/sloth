// Canopy Camp sound, the sounds: every one-shot effect (SFX: squeaks, munching, steps, the fire's crackle, the pot, birds,
// frogs, the owl, the jeep's doors, the menu's tock...) and the beds that run all the time (wind, the fire's roar, rain,
// crickets), all made from the context's nodes (context.js). startBeds() runs once, when the context is made.
import * as THREE from "three";
import { SOUP_POT, TENT } from "../layout.js";
import { rand as R } from "../util.js";   // a number between a and b from Math.random
import { ac, BROWN, bus, CRICKET, env, filt, gain, noise, osc, pick, spot } from "./context.js";

const tmp = new THREE.Vector3();

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
  bubble() { if (!fire.pot) return; const t = ac.currentTime, g = gain(fire.pot, 0), f = R(250, 450); env(g, t, 0.005, R(0.03, 0.07), 0.05); osc("sine", f, t, 0.08, g).frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05); },
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
const underTent = (p) => TENT.dry(p.x, p.z);   // inside the tent's roof and planks (layout.js, as weather.js)

export { night, rain, SFX, startBeds, underTent, wind };
