// Canopy Camp clock (diegetic controls, Adriaen 2026-11-13): a clock prop in the camp sets the time of day, instead of only the
// ⚙️ slider (which stays as a fallback). It lights up like the other things you can use; tapping it opens the pill menu with a
// few moments of the day and the day cycle. Its hands are drawn from the hour the light shows (daytime.js `shown`), so they
// spin round while the sky changes.
// PROTOTYPE: three looks to pick from, ?clock=a|b|c (default b, recommended):
//   a  a wind-up alarm clock on the snack table, about 56 triangles
//   b  a sun-and-moon dial on a post by the fire, the disc turns with the day, about 42 triangles
//   c  a round clock hung on the big tree behind the fire, about 46 triangles
// Faces, numbers, rims and grain are painted on canvas textures; nothing modelled that paint can do.
import * as THREE from "three";
import { camera, canvasTex, qs, scene } from "./core.js";
import { d0, t0, V, HERO } from "./forest.js";
import { me } from "./player.js";
import { addTarget } from "./input.js";
import { toast } from "./hud.js";
import { blockers } from "./campProps.js";
import { day } from "./daytime.js";

const KIND = ["a", "b", "c"].includes(qs.get("clock")) ? qs.get("clock") : "b";
const MOMENTS = [["Morning 🌅", 7.5], ["Midday ☀️", 12], ["Golden hour 🌇", 17.5], ["Night 🌙", 22]];
const lam = (o) => new THREE.MeshLambertMaterial(o);
const hand = (w, l, color) => new THREE.Mesh(new THREE.PlaneGeometry(w, l).translate(0, l * 0.4, 0), lam({ color, side: THREE.DoubleSide }));   // pivot near its base
const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };

// a clock face: cream disc, rim, ticks and the four big numbers
function faceTex({ bg = "#fff3dc", rim = "#e25a6e", ink = "#4a3426", numbers = ["12", "3", "6", "9"], rimW = 0.09 } = {}) {
  return canvasTex(256, 256, (c, w) => {
    const r = w / 2; c.fillStyle = rim; c.beginPath(); c.arc(r, r, r, 0, 7); c.fill();
    c.fillStyle = bg; c.beginPath(); c.arc(r, r, r * (1 - rimW), 0, 7); c.fill();
    c.strokeStyle = ink; c.lineCap = "round";
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, big = i % 3 === 0; if (big) continue; c.lineWidth = 5;
      c.beginPath(); c.moveTo(r + Math.sin(a) * r * 0.74, r - Math.cos(a) * r * 0.74); c.lineTo(r + Math.sin(a) * r * 0.82, r - Math.cos(a) * r * 0.82); c.stroke(); }
    c.fillStyle = ink; c.font = "700 46px Fredoka, Trebuchet MS, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    numbers.forEach((s, i) => { const a = i / 4 * Math.PI * 2; c.fillText(s, r + Math.sin(a) * r * 0.66, r - Math.cos(a) * r * 0.66 + 2); });
    c.beginPath(); c.arc(r, r, 9, 0, 7); c.fill();
  });
}

let clock, hourH = null, minH = null, disc = null, shake = 0, lume = null;
if (KIND === "a") {
  // a wind-up alarm clock standing on the snack table, its face to the fire. Body: an open 10-sided drum (20), face and back
  // discs (20), two bells (open 6-sided cones, 12), hands (4).
  const R = 0.11, Dp = 0.07, red = lam({ color: 0xe25a6e });
  clock = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Dp, 10, 1, true).rotateX(Math.PI / 2), red);
  lume = lam({ map: faceTex(), emissive: 0xfff0c8, emissiveIntensity: 0 });
  const face = new THREE.Mesh(new THREE.CircleGeometry(R, 10).translate(0, 0, Dp / 2), lume);
  const back = new THREE.Mesh(new THREE.CircleGeometry(R, 10).rotateY(Math.PI).translate(0, 0, -Dp / 2), red);
  const bellG = new THREE.ConeGeometry(0.05, 0.04, 6, 1, true), bellM = lam({ color: 0xd9a94a, side: THREE.DoubleSide });
  for (const s of [-1, 1]) { const b = new THREE.Mesh(bellG, bellM); b.position.set(s * 0.07, R + 0.005, 0); b.rotation.z = -s * 0.5; clock.add(b); }
  hourH = hand(0.014, 0.065, 0x4a3426); minH = hand(0.01, 0.09, 0x4a3426); hourH.position.z = Dp / 2 + 0.004; minH.position.z = Dp / 2 + 0.006;
  clock.add(body, face, back, hourH, minH);
  const tb = window.__camp.tb, table = scene.getObjectByName("Table");
  const top = table ? new THREE.Box3().setFromObject(table).max.y : 0.75;
  // at the near end of the table, clear of the fruit plate; leaning back a touch
  const at = tb.clone().addScaledVector(d0, -0.45).addScaledVector(t0, -0.1);
  clock.position.set(at.x, top + R - 0.01, at.z); clock.rotation.y = Math.atan2(-at.x, -at.z); clock.rotation.x = -0.12;
} else if (KIND === "b") {
  // a sun-and-moon dial on a post between the fire and the snack table: a painted disc (day sky with the sun on one half, night
  // with the moon and stars on the other) turns once a day behind a fixed arrow, so the half up top is the time it is now.
  // Post: open 4-sided (8), disc front and back (32), arrow (1, both sides), a little roof board (2, both sides).
  clock = new THREE.Group();
  const wood = lam({ color: 0x8a5a3b }), H = 1.45, R = 0.34;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, H, 4, 1, true).translate(0, H / 2, 0).rotateY(Math.PI / 4), wood);
  const dialTex = canvasTex(256, 256, (c, w) => {
    const r = w / 2; c.fillStyle = "#6b4630"; c.beginPath(); c.arc(r, r, r, 0, 7); c.fill();
    c.save(); c.beginPath(); c.arc(r, r, r * 0.9, 0, 7); c.clip();
    const day = c.createLinearGradient(0, 0, 0, r); day.addColorStop(0, "#8fd0f0"); day.addColorStop(1, "#ffe0a0"); c.fillStyle = day; c.fillRect(0, 0, w, r);
    const night = c.createLinearGradient(0, r, 0, w); night.addColorStop(0, "#40508a"); night.addColorStop(1, "#1d2448"); c.fillStyle = night; c.fillRect(0, r, w, r);
    c.fillStyle = "#ffcf3a"; c.beginPath(); c.arc(r, r * 0.38, 26, 0, 7); c.fill();                     // the sun at the top: noon
    c.strokeStyle = "#ffcf3a"; c.lineWidth = 6; c.lineCap = "round";
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.beginPath(); c.moveTo(r + Math.cos(a) * 34, r * 0.38 + Math.sin(a) * 34); c.lineTo(r + Math.cos(a) * 44, r * 0.38 + Math.sin(a) * 44); c.stroke(); }
    c.fillStyle = "#f4f0d8"; c.beginPath(); c.arc(r, r * 1.62, 24, 0, 7); c.fill(); c.fillStyle = "#2a3466"; c.beginPath(); c.arc(r + 11, r * 1.62 - 6, 21, 0, 7); c.fill();   // a crescent moon at the bottom: midnight
    c.fillStyle = "#fff6c8"; for (const [x, y] of [[0.3, 1.3], [0.7, 1.25], [0.25, 1.65], [0.78, 1.7], [0.5, 1.9], [0.62, 1.42]]) { c.beginPath(); c.arc(w * x, r * y, 3.5, 0, 7); c.fill(); }
    c.restore(); c.fillStyle = "#f3d9b0";
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; c.beginPath(); c.arc(r + Math.sin(a) * r * 0.95, r - Math.cos(a) * r * 0.95, i % 6 ? 2.5 : 5, 0, 7); c.fill(); }   // 24 hour pips on the rim
  });
  disc = new THREE.Group(); disc.position.set(0, H + 0.05, 0.06);
  disc.add(new THREE.Mesh(new THREE.CircleGeometry(R, 16), lam({ map: dialTex })), new THREE.Mesh(new THREE.CircleGeometry(R, 16).rotateY(Math.PI).translate(0, 0, -0.005), wood));
  const arrow = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([V(-0.06, 0.1, 0), V(0.06, 0.1, 0), V(0, -0.02, 0)]), lam({ color: 0xe25a6e, side: THREE.DoubleSide }));
  arrow.position.set(0, H + 0.05 + R + 0.0, 0.075);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14).rotateX(-Math.PI / 2 + 0.35), lam({ color: 0x6b4630, side: THREE.DoubleSide }));
  roof.position.set(0, H + 0.05 + R + 0.13, 0.02);
  lume = disc.children[0].material; lume.emissive = new THREE.Color(0xffffff); lume.emissiveMap = dialTex; lume.emissiveIntensity = 0;
  clock.add(post, disc, arrow, roof);
  const at = d0.clone().multiplyScalar(3.1).addScaledVector(t0, -1.4);   // behind the fire on the wood pile side, in view as you start and from the seats
  clock.position.copy(at); clock.position.y = window.__groundHeight?.(at.x, at.z) ?? 0; clock.rotation.y = Math.atan2(-at.x, -at.z) - 0.3;
  blockers.push(Object.assign([at.clone().setY(0), 0.35], { walk: { r: 0.12 } }));   // walk round the post, keep plants and sloths off it
} else {
  // a round clock hung on the big tree behind the fire, at eye height, facing the camp: face disc (14), an open case drum (28),
  // hands (4)
  const R = 0.26, Dp = 0.07;
  clock = new THREE.Group();
  lume = lam({ map: faceTex({ bg: "#fbf3e0", rim: "#6b4630", numbers: ["XII", "III", "VI", "IX"], rimW: 0.12 }), emissive: 0xfff0c8, emissiveIntensity: 0 });
  clock.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, Dp, 14, 1, true).rotateX(Math.PI / 2), lam({ color: 0x6b4630 })), new THREE.Mesh(new THREE.CircleGeometry(R, 14).translate(0, 0, Dp / 2), lume));
  hourH = hand(0.03, 0.15, 0x2e2018); minH = hand(0.02, 0.21, 0x2e2018); hourH.position.z = Dp / 2 + 0.006; minH.position.z = Dp / 2 + 0.01;
  clock.add(hourH, minH);
  // on the bark where a ray from the camp meets the trunk, turned a little off the fire line so the low branches don't hide it
  const tree = HERO[0], inward = tree.clone().setY(0).negate().normalize().applyAxisAngle(V(0, 1, 0), -0.35), Y = 1.7;
  const from = tree.clone().addScaledVector(inward, 3).setY(Y), rc = new THREE.Raycaster(from, inward.clone().negate(), 0, 3);
  const trunks = []; scene.traverse((m) => { if (m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh && m.geometry.boundingSphere?.radius !== 0) trunks.push(m); });
  rc.camera = camera; const hit = rc.intersectObjects(trunks, false)[0];
  const at = hit ? hit.point.addScaledVector(inward, Dp / 2 + 0.02) : tree.clone().addScaledVector(inward, 1.3).setY(Y);
  clock.position.copy(at); clock.rotation.y = Math.atan2(inward.x, inward.z); clock.rotation.x = 0.06;
}
clock.name = "Clock"; scene.add(clock);
console.log(`LOG clock ${KIND}: ${tris(clock)} tris`);

// the lit thing and its menu (input.js targets)
{
  const picks = []; clock.traverse((m) => m.isMesh && picks.push(m));
  const box = new THREE.Box3(), sph = new THREE.Sphere(), tmp = new THREE.Vector3();
  const at = (v) => { box.setFromObject(clock).getBoundingSphere(sph); v.copy(sph.center); sph.radius = Math.max(sph.radius, 0.2); return sph; };
  const pick = (h, name) => () => { day.setHour(h); shake = 0.7; toast(name); };
  addTarget(clock, () => ({ look: clock, picks, at,
    ready: () => at(tmp).center.distanceTo(me.pos) < (KIND === "c" ? 5 : 3.5),
    options: () => [...MOMENTS.map(([n, h]) => [n, pick(h, n)]), [day.cycle ? "Stop the clock ⏸️" : "Let the day run ⏳", () => { day.setCycle(!day.cycle); toast(day.cycle ? "The day runs on" : "The clock stops"); }]] }));
}

// hands from the hour the light shows: they spin forward while the sky eases to the new hour
const baseRot = clock.rotation.z;
function step(dt, dusk) {
  const h = day.shown;
  if (hourH) { hourH.rotation.z = -(h % 12) / 12 * Math.PI * 2; minH.rotation.z = -(h % 1) * Math.PI * 2; }
  if (disc) disc.rotation.z = (h - 12) / 24 * Math.PI * 2;   // the sun at the top at noon, the moon at midnight
  if (lume) lume.emissiveIntensity = (KIND === "b" ? 0.35 : 0.55) * dusk;   // a soft glow at night, so you can still read it
  if (shake > 0) { shake = Math.max(0, shake - dt); clock.rotation.z = baseRot + Math.sin(shake * 60) * 0.06 * shake; }   // a little rattle when you set it
}
window.__clock = { obj: clock, kind: KIND }; window.__camera ??= camera; window.__clockCenter = () => new THREE.Box3().setFromObject(clock).getCenter(new THREE.Vector3());   // checks
export { step as clockStep };
