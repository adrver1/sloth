// Canopy Camp input: keys, the phone stick, drag to look, pinch to zoom, tap to boop, hold to feed, and resize.
import * as THREE from "three";
import "./campLife.js";   // run after the module before it, as one script did
import { $, R, camera, qs, renderer, scene, uTime } from "./core.js";
import { pickAt, ray, stickV, toast } from "./hud.js";
import { V } from "./forest.js";
import { jeepTap } from "./jeep.js";
import { COUNT, burst, flowerCrown, fx, hit, sloths, sprite } from "./sloths.js";
import { me } from "./player.js";
import { acts } from "./campLife.js";
import { createHighlight } from "./highlight.js";

// ---------------------------------------------------------------- input
const coarse = matchMedia("(pointer: coarse)").matches || qs.has("touch");
const stick = $("stick"); let stickId = null;
stick.hidden = !coarse;
document.body.classList.toggle("touch", coarse);   // the hint moves up above the stick
if (!coarse) $("q").innerHTML = "WASD or arrows to walk · drag to look<br>Click a sloth to boop it, hold on it to feed it";
function hideHelp() { setTimeout(() => ($("q").style.opacity = 0), 3000); }
function stickMove(e) {
  const r = stick.getBoundingClientRect(), v = new THREE.Vector2(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2).divideScalar(r.width / 2);
  if (v.length() > 1) v.normalize(); stickV.copy(v); stick.firstElementChild.style.transform = `translate(${v.x * 37}px, ${v.y * 37}px)`;
}
stick.addEventListener("pointerdown", (e) => { e.stopPropagation(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); hideHelp(); });
stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickId) stickMove(e); });
const stickEnd = (e) => { if (e.pointerId !== stickId) return; stickId = null; stickV.set(0, 0); stick.firstElementChild.style.transform = ""; };
stick.addEventListener("pointerup", stickEnd); stick.addEventListener("pointercancel", stickEnd);
// anywhere else: drag to look, two fingers to zoom, a short tap boops a sloth, a hold on one feeds it
const looks = new Map(); let pinch0 = 0, fov0 = 0, fovAdd = 0;
$("c").addEventListener("pointerdown", (e) => {
  const L = { x: e.clientX, y: e.clientY, moved: 0, t0: performance.now(), held: false };
  looks.set(e.pointerId, L);
  if (looks.size === 2) { const [a, b] = [...looks.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = fovAdd; return; }
  const h = pickAt(e.clientX, e.clientY, hit);
  if (h) L.holdT = setTimeout(() => { if (L.moved > 12) return; L.held = true; h.distance < 7 ? feed(h.object.userData.s) : toast("Get a bit closer"); }, 450);
});
$("c").addEventListener("pointermove", (e) => {
  const L = looks.get(e.pointerId); if (!L) return;
  const dx = e.clientX - L.x, dy = e.clientY - L.y; L.x = e.clientX; L.y = e.clientY; L.moved += Math.hypot(dx, dy);
  if (looks.size === 2) { const [a, b] = [...looks.values()]; fovAdd = THREE.MathUtils.clamp(fov0 + (pinch0 - Math.hypot(a.x - b.x, a.y - b.y)) * 0.06, -20, 6); resize(); return; }
  me.yaw -= dx * 0.005; me.pitch = THREE.MathUtils.clamp(me.pitch - dy * 0.004, -1.2, 1.2); me.lastDrag = uTime.value;
});
const lookEnd = (e) => {
  const L = looks.get(e.pointerId); looks.delete(e.pointerId); if (!L) return; clearTimeout(L.holdT);
  if (L.moved < 12 && !L.held && performance.now() - L.t0 < 450) tap(e.clientX, e.clientY);
};
$("c").addEventListener("pointerup", lookEnd); $("c").addEventListener("pointercancel", (e) => { const L = looks.get(e.pointerId); if (L) clearTimeout(L.holdT); looks.delete(e.pointerId); });
addEventListener("wheel", (e) => { fovAdd = THREE.MathUtils.clamp(fovAdd + e.deltaY * 0.02, -20, 6); resize(); }, { passive: true });
function tap(x, y) {
  const h = pickAt(x, y, hit), a = acts.pick(ray);            // camp activities (activities.js) win when they are nearer than a sloth
  if (a && (!h || a.distance < h.distance)) { acts.tap(a); return; }
  if (!h && lit && coarse) { to.copy(lit.box.position).project(camera);   // a finger: a tap near the lit thing uses it
    if (Math.hypot((to.x + 1) / 2 * innerWidth - x, (1 - to.y) / 2 * innerHeight - y) < 0.22 * Math.min(innerWidth, innerHeight)) { acts.tap({ thing: lit }); return; } }
  if (!h) { jeepTap(x, y); return; }
  if (h.distance < 7) boop(h.object.userData.s); else toast("Get a bit closer");
}
const BOOP = ["eep!", "hehe", "*slow blink*", "boop", "mmh?", "*yawn*"];
function boop(s) { s.squish = 1; s.nod = 0.6; burst(s.p.clone().add(V(0, 0.25, 0)), BOOP[Math.floor(R(0, BOOP.length))], 1, 1.6, 64); }
let friends = 0;
function feed(s) {
  const f = sprite("🌺", 96); f.position.copy(camera.position).add(V(0.15, -0.35, -0.6).applyQuaternion(camera.quaternion)); scene.add(f);
  fx.push({ s: f, fly: { from: f.position.clone(), to: s.p.clone().add(V(0, -0.15, 0)) }, t: 0, life: 0.9, done() {
    s.nod = 2.4; burst(s.p.clone().add(V(0, 0.2, 0)), "💗", 5, 1.6, 80);
    if (!s.friend) { s.friend = true; friends++; dispatchEvent(new CustomEvent("sloth-befriended", { detail: { id: sloths.indexOf(s) } }));   /* stand-in until the activities' befriend(s) */ flowerCrown(s); $("score").textContent = `💗 ${friends} friend${friends > 1 ? "s" : ""}`; toast(friends === COUNT ? "Everyone's your friend! 🌸" : "New friend! 🌸"); }
    else burst(s.p.clone().add(V(0, 0.45, 0)), "nom nom", 1, 1.4, 60);
  } });
}

// ---------------------------------------------------------------- what you can use lights up (camp/highlight.js, as in desk-at-night's free mode)
// With a mouse, the thing under the pointer; otherwise (and always on a phone) the usable thing nearest the middle of the view,
// within AIM of it, so you only have to look roughly at the wood pile. Only things a tap would use right now light up.
const glow = createHighlight(scene, renderer, { width: coarse ? 3.5 : 3 });
const AIM = 0.45, fwd = new THREE.Vector3(), to = new THREE.Vector3(); let hover = null, lit = null;
$("c").addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") hover = { x: e.clientX, y: e.clientY }; });
$("c").addEventListener("pointerleave", () => (hover = null));
function aimStep(dt) {
  let best = null;
  if (hover) { if (!looks.size) { const h = pickAt(hover.x, hover.y, hit), a = acts.pick(ray); if (a && acts.ready(a.thing) && (!h || a.distance < h.distance)) best = a.thing; else if (h && h.distance < 7) best = { look: h.object.userData.s.lit }; } else best = lit; }   // a mouse: what it is over (kept while dragging); a sloth lights up when a tap would boop it
  else {
    camera.getWorldDirection(fwd); let bestA = AIM;
    for (const box of hit) {                          // the sloths you could boop or feed (within reach, as tap() asks)
      to.subVectors(box.position, camera.position); const d = to.length(); if (d > 7) continue;
      const ang = fwd.angleTo(to) - Math.asin(Math.min(1, 0.42 / d));
      if (ang < bestA) { bestA = ang; best = { look: box.userData.s.lit }; }
    }
    for (const t of acts.things) {
      if (!t.look || !acts.ready(t)) continue;
      to.subVectors(t.box.position, camera.position); const d = to.length(), r = t.box.geometry.parameters.radius;
      const ang = fwd.angleTo(to) - Math.asin(Math.min(1, r / d));
      if (ang < bestA) { bestA = ang; best = t; }
    }
  }
  lit = best; glow.set(best?.look ?? null); glow.update(dt);
}

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = (camera.aspect < 0.8 ? 70 : 58) + fovAdd; camera.updateProjectionMatrix(); }

export { aimStep, boop, feed, resize };
