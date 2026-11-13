// Canopy Camp clocks (diegetic controls, Adriaen 2026-11-13): clocks in the camp set the time of day, instead of only the ⚙️
// slider (which stays as a fallback). Each lights up like the other things you can use; tapping it opens the pill menu with a
// few moments of the day and the day cycle. Hands (or a dial disc) are drawn from the hour the light shows (daytime.js
// `shown`), so they spin round while the sky changes, and the face glows softly at night so you can still read it.
//   the alarm clock on a little crate by the bed in the tent (Adriaen: where it naturally belongs), 66 triangles
//   the sun-and-moon dial, small and weathered on the hammock's near post at eye height, 25 triangles (Adriaen 2026-11-13:
//     out of place in the middle of the camp; picked the post over a board above the tent door and no dial)
//   the jeep's dash clock lives in car.js and registers here with addClock.
// Faces, numbers, rims and grain are painted on canvas textures; nothing modelled that paint can do.
import * as THREE from "three";
import { camera, canvasTex, scene } from "./core.js";
import { V } from "./forest.js";
import { me } from "./player.js";
import { addTarget } from "./input.js";
import { toast } from "./hud.js";
import { day } from "./daytime.js";

const MOMENTS = [["Morning 🌅", 7.5], ["Midday ☀️", 12], ["Golden hour 🌇", 17.5], ["Night 🌙", 22]];
const lam = (o) => new THREE.MeshLambertMaterial(o);
const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
export const hand = (w, l, color) => new THREE.Mesh(new THREE.PlaneGeometry(w, l).translate(0, l * 0.4, 0), lam({ color, side: THREE.DoubleSide }));   // pivot near its base

// a clock face: cream disc, rim, ticks and the four big numbers
export function faceTex({ bg = "#fff3dc", rim = "#e25a6e", ink = "#4a3426", numbers = ["12", "3", "6", "9"], rimW = 0.09 } = {}) {
  return canvasTex(256, 256, (c, w) => {
    const r = w / 2; c.fillStyle = rim; c.beginPath(); c.arc(r, r, r, 0, 7); c.fill();
    c.fillStyle = bg; c.beginPath(); c.arc(r, r, r * (1 - rimW), 0, 7); c.fill();
    c.strokeStyle = ink; c.lineCap = "round";
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (i % 3 === 0) continue; c.lineWidth = 5;
      c.beginPath(); c.moveTo(r + Math.sin(a) * r * 0.74, r - Math.cos(a) * r * 0.74); c.lineTo(r + Math.sin(a) * r * 0.82, r - Math.cos(a) * r * 0.82); c.stroke(); }
    c.fillStyle = ink; c.font = "700 46px Fredoka, Trebuchet MS, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    numbers.forEach((s, i) => { const a = i / 4 * Math.PI * 2; c.fillText(s, r + Math.sin(a) * r * 0.66, r - Math.cos(a) * r * 0.66 + 2); });
    c.beginPath(); c.arc(r, r, 9, 0, 7); c.fill();
  });
}
// the sun-and-moon painting: day sky with the sun at the top (noon), night with a crescent moon at the bottom (midnight)
function dialTex({ faded = false } = {}) {
  return canvasTex(256, 256, (c, w) => {
    const r = w / 2; c.fillStyle = faded ? "#7d6450" : "#6b4630"; c.beginPath(); c.arc(r, r, r, 0, 7); c.fill();
    c.save(); c.beginPath(); c.arc(r, r, r * 0.9, 0, 7); c.clip();
    const dg = c.createLinearGradient(0, 0, 0, r); dg.addColorStop(0, faded ? "#a9c7c9" : "#8fd0f0"); dg.addColorStop(1, faded ? "#e8d6a8" : "#ffe0a0"); c.fillStyle = dg; c.fillRect(0, 0, w, r);
    const ng = c.createLinearGradient(0, r, 0, w); ng.addColorStop(0, faded ? "#4f5874" : "#40508a"); ng.addColorStop(1, faded ? "#2c3148" : "#1d2448"); c.fillStyle = ng; c.fillRect(0, r, w, r);
    const sun = faded ? "#e9c25a" : "#ffcf3a"; c.fillStyle = sun; c.beginPath(); c.arc(r, r * 0.38, 26, 0, 7); c.fill();
    c.strokeStyle = sun; c.lineWidth = 6; c.lineCap = "round";
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.beginPath(); c.moveTo(r + Math.cos(a) * 34, r * 0.38 + Math.sin(a) * 34); c.lineTo(r + Math.cos(a) * 44, r * 0.38 + Math.sin(a) * 44); c.stroke(); }
    c.fillStyle = "#f4f0d8"; c.beginPath(); c.arc(r, r * 1.62, 24, 0, 7); c.fill(); c.fillStyle = faded ? "#3a4060" : "#2a3466"; c.beginPath(); c.arc(r + 11, r * 1.62 - 6, 21, 0, 7); c.fill();
    c.fillStyle = "#fff6c8"; for (const [x, y] of [[0.3, 1.3], [0.7, 1.25], [0.25, 1.65], [0.78, 1.7], [0.5, 1.9], [0.62, 1.42]]) { c.beginPath(); c.arc(w * x, r * y, 3.5, 0, 7); c.fill(); }
    c.restore();
    if (faded) {   // weathered: paint worn off along the grain, a few scratches
      c.globalAlpha = 0.18; c.strokeStyle = "#f3e6cc"; c.lineWidth = 2;
      for (let y = 10; y < w; y += 7) { c.beginPath(); c.moveTo(0, y + Math.sin(y) * 3); c.lineTo(w, y + Math.cos(y * 0.7) * 3); c.stroke(); }
      c.globalAlpha = 1;
    }
    c.fillStyle = "#f3d9b0";
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; c.beginPath(); c.arc(r + Math.sin(a) * r * 0.95, r - Math.cos(a) * r * 0.95, i % 6 ? 2.5 : 5, 0, 7); c.fill(); }
  });
}

// ---------------------------------------------------------------- every clock: what lights, how it turns, when it is in reach
const clocks = [];
// obj: the thing that lights up; hands: [hour, minute] meshes (rotation.z), disc: a mesh turned once a day; lume: the face
// material that glows at night; reach: metres, or ready(): a function; name: for checks
function addClock({ obj, hands = null, disc = null, lume = null, glow = 0.55, reach = 3.5, ready = null, name }) {
  const c = { obj, hands, disc, lume, glow, shake: 0, base: obj.rotation.z, name };
  const picks = []; obj.traverse((m) => m.isMesh && picks.push(m));
  const box = new THREE.Box3(), sph = new THREE.Sphere(), tmp = new THREE.Vector3();
  const at = (v) => { box.setFromObject(obj).getBoundingSphere(sph); v.copy(sph.center); sph.radius = Math.max(sph.radius, 0.2); return sph; };
  const set = (h, n) => () => { day.setHour(h); c.shake = 0.7; toast(n); };
  addTarget(obj, () => ({ look: obj, picks, at,
    ready: ready ?? (() => at(tmp).center.distanceTo(camera.position) < reach),
    options: () => [...MOMENTS.map(([n, h]) => [n, set(h, n)]), [day.cycle ? "Stop the clock ⏸️" : "Let the day run ⏳", () => { day.setCycle(!day.cycle); toast(day.cycle ? "The day runs on" : "The clock stops"); }]] }));
  console.log(`LOG clock ${name}: ${tris(obj)} tris`);
  clocks.push(c); return c;
}

// ---------------------------------------------------------------- the alarm clock by the bed in the tent
// A red wind-up alarm clock (open 10-sided drum 20, face and back 20, two bells 12, hands 4 = 56) on an upturned crate used as
// a bedside table (5 visible sides, 10), beside the pillow at the back of the tent.
function makeAlarm() {
  const R = 0.075, Dp = 0.05, red = lam({ color: 0xe25a6e }), o = new THREE.Group();
  const lume = lam({ map: faceTex(), emissive: 0xfff0c8, emissiveIntensity: 0 });
  o.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, Dp, 10, 1, true).rotateX(Math.PI / 2), red),
    new THREE.Mesh(new THREE.CircleGeometry(R, 10).translate(0, 0, Dp / 2), lume),
    new THREE.Mesh(new THREE.CircleGeometry(R, 10).rotateY(Math.PI).translate(0, 0, -Dp / 2), red));
  const bellG = new THREE.ConeGeometry(0.034, 0.028, 6, 1, true), bellM = lam({ color: 0xd9a94a, side: THREE.DoubleSide });
  for (const s of [-1, 1]) { const b = new THREE.Mesh(bellG, bellM); b.position.set(s * 0.048, R + 0.004, 0); b.rotation.z = -s * 0.5; o.add(b); }
  const hh = hand(0.01, 0.045, 0x4a3426), mh = hand(0.007, 0.062, 0x4a3426); hh.position.z = Dp / 2 + 0.003; mh.position.z = Dp / 2 + 0.005; o.add(hh, mh);
  return { o, hands: [hh, mh], lume, R };
}
{
  const t = window.__camp.tentAt, L = t.length(), fx = -t.x / L, fz = -t.z / L;
  const at = (bx, by, y = 0) => V(t.x + bx * fz - by * fx, y, t.z - bx * fx - by * fz);   // the tent's own (Blender) frame, as campLife.js tentAt3
  const crateTex = canvasTex(128, 128, (c, w) => { c.fillStyle = "#a8743f"; c.fillRect(0, 0, w, w); c.fillStyle = "#8a5c30";
    for (let y = 0; y < w; y += 32) c.fillRect(0, y + 29, w, 3); c.fillStyle = "#5e3f22"; c.fillRect(0, 0, w, 4); c.fillRect(0, w - 4, w, 4); c.fillRect(0, 0, 4, w); c.fillRect(w - 4, 0, 4, w); });
  const S = 0.3, cg = new THREE.BoxGeometry(S, S, S); cg.groups.splice(3, 1); cg.groups.forEach((g, i) => (g.materialIndex = 0));   // no bottom
  const crate = new THREE.Mesh(cg, lam({ map: crateTex })), spot = at(-0.32, 1.22); crate.position.copy(spot).setY(S / 2 + 0.06);
  const yaw = Math.atan2(fx, fz) + Math.PI;   // facing the tent's door... turned round below to face the bed
  crate.rotation.y = yaw; scene.add(crate);
  const A = makeAlarm(); A.o.position.copy(spot).setY(S + 0.06 + A.R - 0.004);
  // face the middle of the tent (toward the doorway and the bed's foot), a little toward the pillow
  const mid = at(-0.2, 0.2); A.o.rotation.y = Math.atan2(mid.x - spot.x, mid.z - spot.z) - 0.35; A.o.rotation.x = -0.08;
  A.o.name = "TentClock"; scene.add(A.o);
  console.log(`LOG tent crate: ${tris(crate)} tris`);
  addClock({ obj: A.o, hands: A.hands, lume: A.lume, reach: 2.6, name: "tent" });
}

// ---------------------------------------------------------------- the sun-and-moon dial on the hammock post (Adriaen picked 2026-11-13)
{
  // small and weathered, nailed to the hammock's near post at eye height, facing the fire: disc front and back (24), a little
  // pointer (1, both sides): 25 triangles
  const R = 0.17, o = new THREE.Group(), tex = dialTex({ faded: true }), face = lam({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 12), face); o.add(disc, new THREE.Mesh(new THREE.CircleGeometry(R, 12).rotateY(Math.PI).translate(0, 0, -0.004), lam({ color: 0x6b5442 })));
  const ptr = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([V(-0.035, 0.05, 0), V(0.035, 0.05, 0), V(0, -0.012, 0)]), lam({ color: 0x8a3a30, side: THREE.DoubleSide }));
  ptr.position.set(0, R + 0.005, 0.008); o.add(ptr);
  const { hA } = window.__camp, toFire = hA.clone().setY(0).negate().normalize();
  o.position.copy(hA).addScaledVector(toFire, 0.075).setY(1.55); o.rotation.y = Math.atan2(toFire.x, toFire.z);
  o.name = "Dial"; scene.add(o);
  addClock({ obj: o, disc, lume: face, glow: 0.3, name: "dial post" });
}

// hands from the hour the light shows: they spin forward while the sky eases to the new hour
function step(dt, dusk) {
  const h = day.shown;
  for (const c of clocks) {
    if (c.hands) { c.hands[0].rotation.z = -(h % 12) / 12 * Math.PI * 2; c.hands[1].rotation.z = -(h % 1) * Math.PI * 2; }
    if (c.disc) c.disc.rotation.z = (h - 12) / 24 * Math.PI * 2;   // the sun at the top at noon, the moon at midnight
    if (c.lume) c.lume.emissiveIntensity = c.glow * dusk;
    if (c.shake > 0) { c.shake = Math.max(0, c.shake - dt); c.obj.rotation.z = c.base + Math.sin(c.shake * 60) * 0.06 * c.shake; }   // a little rattle when you set it
  }
}
window.__clocks = clocks;   // checks
export { addClock, step as clockStep };
