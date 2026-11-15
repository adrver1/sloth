// Summit Cabin time of day (Adriaen 2026-11-15, plan: the summit follows the camp's clock): the hour and the day cycle are the
// camp's (land.js OPT.time and OPT.cycle, saved under the camp's own keys), so you arrive at the hour you left the camp and go
// home at the one you leave the summit. As in the camp (camp/daytime.js), a day takes 12 minutes with the cycle on, the hour
// shown eases forward to a new one (about 3 h a second, so a jump runs through the evening or the dawn), it is saved at once
// when you change it and every 30 s while the cycle runs, and the ⚙️ slider is the fallback to the clock.
// The clock: a round wall clock on the cabin's front wall between the window and the door, above Mango's bench (one quad, its
// face painted; two hands, 2 triangles each). Tap it to move on to the next moment of the day: morning, midday, golden hour,
// night. Its hands show the hour shown, so they spin round while the sky changes.
// Exports buildDaytime() (main.js, once: the clock, the slider and the tap) and daytimeStep(dt) (main.js, first in the frame,
// before the light reads the slider).
import * as THREE from 'three';
import { $, D, KEYS, OPT, TOP, TRIS, YB, store } from './land.js';
import { camera, canvasTex, renderer, scene } from './core.js';

const HOUR_S = 30;   // seconds for one hour while the cycle runs (a 12-minute day, as in the camp)
const MOMENTS = [7.5, 12, 17.5, 22];   // the camp clock's moments: morning, midday, golden hour, night
const AT = new THREE.Vector3(-1.2, TOP + YB + 1.95, -D / 2 - 0.04), R = 0.22;
const day = { set: OPT.time, shown: OPT.time, cycle: OPT.cycle };
let hands = null, saveTick = 0;
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
  hands = { face, hour: hand(0.03, 0.12), min: hand(0.02, 0.17) };
  TRIS.push(['Porch clock (face and two hands)', 6]);
  // a tap (a press that hardly moves) on the clock, within reach, moves on to the next moment
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return; down = null;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); ray.far = 7;
    if (!ray.intersectObject(face).length) return;
    setHour(MOMENTS.find((m) => m > day.set + 0.25) ?? MOMENTS[0]);
  });
}
function setHour(h, jump = false) { day.set = ((h % 24) + 24) % 24; if (jump) day.shown = day.set; save(); }

export function buildDaytime() {
  buildClock();
  const show = () => { $('hour').value = String(day.shown); $('hourOut').textContent = fmt(day.shown); };
  $('hour').oninput = () => { setHour(+$('hour').value, true); show(); };
  addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  show(); day.show = show;
}
// first in the frame: the cycle moves the hour on, the hour shown eases after it, and the slider and the clock's hands follow
export function daytimeStep(dt) {
  if (day.cycle) { day.set = (day.set + dt / HOUR_S) % 24; if ((saveTick += dt) > 30) { saveTick = 0; save(); } }
  const ahead = (day.set - day.shown + 24) % 24;
  if (ahead > 1e-4) { day.shown = (day.shown + Math.min(ahead, dt * 3)) % 24; day.show?.(); }
  if (hands) { const h = day.shown, a = -((h % 12) / 12) * Math.PI * 2, m = -(h % 1) * Math.PI * 2;
    hands.hour.rotation.z = a; hands.min.rotation.z = m;
    hands.face.material.emissiveIntensity = h > 19 || h < 6.5 ? 0.35 : 0; }   // it glows softly at night, so you can still read it
}
// for checks (debug.js): set the hour at once
export const daytimeApi = { setHour: (h) => { setHour(h, true); day.show?.(); }, day };
