// Summit Cabin time of day (Adriaen 2026-11-15, plan: the summit follows the camp's clock): the hour and the day cycle are the
// camp's (land.js OPT.time and OPT.cycle, saved under the camp's own keys), so you arrive at the hour you left the camp and go
// home at the one you leave the summit. As in the camp (camp/daytime.js), a day takes 12 minutes with the cycle on, the hour
// shown eases forward to a new one (about 3 h a second, so a jump runs through the evening or the dawn), it is saved at once
// when you change it and every 30 s while the cycle runs, and the ⚙️ slider is the fallback to the clock.
// The clock: a round wall clock on the cabin's front wall between the window and the door, above Mango's bench (one quad, its
// face painted; two hands, 2 triangles each). It is one of the camp's clocks (camp/clock.js addClock, Adriaen 2026-11-15: the
// same controls in both levels): it lights up, and its menu has the camp's moments of the day and the day cycle; clockStep
// (main.js) turns its hands from the hour shown, so they spin round while the sky changes, and lights it at night.
// Exports buildDaytime() (main.js, once: the clock, the slider and the tap) and daytimeStep(dt) (main.js, first in the frame,
// before the light reads the slider).
import * as THREE from 'three';
import { $, D, KEYS, OPT, TOP, TRIS, YB, store } from './land.js';
import { canvasTex, scene } from './core.js';
import { addClock } from '../camp/clock.js';

const HOUR_S = 30;   // seconds for one hour while the cycle runs (a 12-minute day, as in the camp)
const AT = new THREE.Vector3(-1.2, TOP + YB + 1.95, -D / 2 - 0.04), R = 0.22;
const day = { set: OPT.time, shown: OPT.time, cycle: OPT.cycle,   // the camp's day's shape (camp/daytime.js), for the clocks
  setHour: (h) => { setHour(h); day.show?.(); }, setCycle: (on) => { day.cycle = on; store.set(KEYS.cycle, on ? 'on' : 'off'); save(); } };
let saveTick = 0;
const save = () => store.set(KEYS.time, day.set.toFixed(2));
const fmt = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

function clockFace() {
  return canvasTex(128, 128, (g, w) => {
    const r = w / 2; g.fillStyle = '#5b3a24'; g.beginPath(); g.arc(r, r, r, 0, 7); g.fill();   // a wooden rim
    g.fillStyle = '#f4ead6'; g.beginPath(); g.arc(r, r, r * 0.86, 0, 7); g.fill();
    g.fillStyle = '#3b2a1e'; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, l = i % 3 ? 0.06 : 0.12;
      g.save(); g.translate(r + Math.sin(a) * r * 0.72, r - Math.cos(a) * r * 0.72); g.rotate(a); g.fillRect(-2, -l * r, 4, l * r * 2 * (i % 3 ? 0.6 : 0.8)); g.restore(); }
  });
}
function buildClock() {
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), lam({ map: clockFace(), transparent: true, alphaTest: 0.5, emissive: '#ffe2b0', emissiveIntensity: 0 }));
  face.position.copy(AT); face.rotation.y = Math.PI; scene.add(face);   // facing the porch (-z)
  const hand = (w, l) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).translate(0, l * 0.4, 0), lam({ color: '#2a1d14' })); m.position.copy(AT).add(new THREE.Vector3(0, 0, -0.01)); m.rotation.y = Math.PI; scene.add(m); return m; };
  const hour = hand(0.03, 0.12), min = hand(0.02, 0.17);
  TRIS.push(['Porch clock (face and two hands)', 6]);
  addClock({ obj: face, hands: [hour, min], lume: face.material, glow: 0.35, name: 'porch' });
}
function setHour(h, jump = false) { day.set = ((h % 24) + 24) % 24; if (jump) day.shown = day.set; save(); }

export function buildDaytime() {
  buildClock();
  const show = () => { $('hour').value = String(day.shown); $('hourOut').textContent = fmt(day.shown); };
  $('hour').oninput = () => { setHour(+$('hour').value, true); show(); };
  addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  show(); day.show = show;
}
// first in the frame: the cycle moves the hour on, the hour shown eases after it, and the slider follows (the clocks' hands:
// camp/clock.js clockStep, main.js)
export function daytimeStep(dt) {
  if (day.cycle) { day.set = (day.set + dt / HOUR_S) % 24; if ((saveTick += dt) > 30) { saveTick = 0; save(); } }
  const ahead = (day.set - day.shown + 24) % 24;
  if (ahead > 1e-4) { day.shown = (day.shown + Math.min(ahead, dt * 3)) % 24; day.show?.(); }
}
// for checks (debug.js): set the hour at once
export const daytimeApi = { setHour: (h) => { setHour(h, true); day.show?.(); }, day };
