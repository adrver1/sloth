// Canopy Camp input: keys, the phone stick, drag to look, pinch to zoom, tap to boop, hold to feed, and resize.
import * as THREE from "three";
import "./campLife.js";   // run after the module before it, as one script did
import { $, R, camera, qs, renderer, scene, uTime } from "./core.js";
import { pickAt, ray, stickV, toast } from "./hud.js";
import { V } from "./forest.js";
import { COUNT, burst, flowerCrown, fx, hit, sloths, sprite } from "./sloths.js";
import { me } from "./player.js";
import { acts } from "./campLife.js";
import { createHighlight } from "./highlight.js";

// ---------------------------------------------------------------- input
const coarse = matchMedia("(pointer: coarse)").matches || qs.has("touch");
const stick = $("stick"); let stickId = null;
stick.hidden = !coarse;
document.body.classList.toggle("touch", coarse);   // the hint moves up above the stick
if (!coarse) $("q").innerHTML = "WASD or arrows to walk · drag to look<br>Click what lights up to see what you can do";
function hideHelp() { setTimeout(() => ($("q").style.opacity = 0), 3000); }
function stickMove(e) {
  const r = stick.getBoundingClientRect(), v = new THREE.Vector2(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2).divideScalar(r.width / 2);
  if (v.length() > 1) v.normalize(); stickV.copy(v); stick.firstElementChild.style.transform = `translate(${v.x * 37}px, ${v.y * 37}px)`;
}
stick.addEventListener("pointerdown", (e) => { e.stopPropagation(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); hideHelp(); });
stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickId) stickMove(e); });
const stickEnd = (e) => { if (e.pointerId !== stickId) return; stickId = null; stickV.set(0, 0); stick.firstElementChild.style.transform = ""; };
stick.addEventListener("pointerup", stickEnd); stick.addEventListener("pointercancel", stickEnd);
// anywhere else: drag to look, two fingers to zoom, a short tap on a lit thing opens its menu, a hold on a sloth feeds it
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
// within AIM of it, so you only have to look roughly at it. Only things in reach light up. Tapping a lit thing opens a small
// menu of what you can do with it (Adriaen 2026-11-12): Boop / Feed for a sloth, Open / Close for a jeep door, the chore for
// the wood pile and the fire. A hold on a sloth still feeds it straight away.
const glow = createHighlight(scene, renderer, { width: coarse ? 3.5 : 3 });
const AIM = 0.45, fwd = new THREE.Vector3(), to = new THREE.Vector3(), box3 = new THREE.Box3(), sph = new THREE.Sphere();
let hover = null, lit = null, menuFor = null;
$("c").addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") hover = { x: e.clientX, y: e.clientY }; });
$("c").addEventListener("pointerleave", () => (hover = null));
// every thing that can light up, made once per thing: what lights, where it is (a sphere), what a ray can hit, when it is in
// reach, and its menu
const targets = new Map(), byPick = new Map();
function target(key, make) { let t = targets.get(key); if (!t) { t = make(); targets.set(key, t); for (const o of t.picks) byPick.set(o, t); } return t; }
const SLOTH_REACH = 7, DOOR_REACH = 4;
const DOOR_NAME = { P: "door", D: "door", B: "boot" };
function allTargets() {
  const out = [];
  for (const t of acts.things) if (t.look) out.push(target(t, () => ({ look: t.look, picks: [t.box], at: (v) => sph.set(v.copy(t.box.position), t.box.geometry.parameters.radius),
    ready: () => acts.ready(t), options: () => [[t.name === "fire" ? "Add the log 🔥" : "Take a log 🪵", () => acts.tap({ thing: t })]] })));
  for (const s of sloths) out.push(target(s, () => ({ look: s.lit ?? s.o, picks: [s.box], at: (v) => sph.set(v.copy(s.box.position), 0.42),
    ready: () => s.o.visible && camera.position.distanceTo(s.box.position) < SLOTH_REACH, options: () => [["Boop 👉", () => boop(s)], ["Feed 🌺", () => feed(s)]] })));
  for (const d of window.__jeep?.doors ?? []) out.push(target(d, () => {
    const picks = []; d.o.traverse((m) => m.isMesh && picks.push(m));
    const at = (v) => { box3.setFromObject(d.o).getBoundingSphere(sph); v.copy(sph.center); return sph; };
    return { look: d.o, picks, at, ready: () => d.o.visible !== false && picks[0]?.visible && at(to).distanceToPoint(camera.position) < DOOR_REACH,
      options: () => [[(d.open ? "Close the " : "Open the ") + DOOR_NAME[d.k], d.toggle]] };
  }));
  return out;
}
// the ready target under the screen point x, y (or null)
function targetAt(x, y) {
  const list = allTargets().filter((t) => t.ready()).flatMap((t) => t.picks);
  const h = pickAt(x, y, list); return h ? byPick.get(h.object) : null;
}
function aimStep(dt) {
  let best = null;
  if (menuFor) best = menuFor.ready() ? menuFor : (closeMenu(), null);
  else if (hover) best = looks.size ? lit : targetAt(hover.x, hover.y);   // a mouse: what it is over (kept while dragging)
  else {
    camera.getWorldDirection(fwd); let bestA = AIM;
    for (const t of allTargets()) {
      if (!t.ready()) continue;
      const S = t.at(to); to.sub(camera.position); const d = to.length();
      const ang = fwd.angleTo(to) - Math.asin(Math.min(1, S.radius / d));
      if (ang < bestA) { bestA = ang; best = t; }
    }
  }
  lit = best; glow.set(best?.look ?? null); glow.update(dt);
  if (menuFor) placeMenu();
}
// the menu: a few pill buttons over the thing, following it while it is open
const menu = document.createElement("div");
menu.style.cssText = "position:fixed;left:0;top:0;display:none;flex-direction:column;gap:6px;transform:translate(-50%,-100%);z-index:3";
document.body.append(menu);
for (const ev of ["pointerdown", "pointerup"]) menu.addEventListener(ev, (e) => e.stopPropagation());
function openMenu(t) {
  menuFor = t; menu.replaceChildren(...t.options().map(([label, fn]) => {
    const b = document.createElement("button"); b.textContent = label;
    b.style.cssText = "font:600 16px var(--display);color:var(--ink);background:rgb(255 248 238 / .94);border:0;border-radius:999px;padding:9px 16px;box-shadow:0 3px 0 rgb(138 90 59 / .25);cursor:pointer;white-space:nowrap";
    b.onclick = (e) => { e.stopPropagation(); closeMenu(); fn(); }; return b; }));
  menu.style.display = "flex"; placeMenu();
}
function closeMenu() { menuFor = null; menu.style.display = "none"; }
function placeMenu() {
  const S = menuFor.at(to); to.y += S.radius * 0.8; to.project(camera);
  if (to.z > 1) { closeMenu(); return; }   // behind you
  const x = THREE.MathUtils.clamp((to.x + 1) / 2 * innerWidth, 90, innerWidth - 90), y = THREE.MathUtils.clamp((1 - to.y) / 2 * innerHeight - 8, 130, innerHeight - 40);
  menu.style.left = x + "px"; menu.style.top = y + "px";
}
function tap(x, y) {
  if (menuFor) { closeMenu(); return; }                  // a tap anywhere else closes the menu
  const t = targetAt(x, y);
  if (t) { openMenu(t); return; }
  if (lit && coarse) { lit.at(to).center; to.project(camera);   // a finger: a tap near the lit thing opens its menu
    if (Math.hypot((to.x + 1) / 2 * innerWidth - x, (1 - to.y) / 2 * innerHeight - y) < 0.22 * Math.min(innerWidth, innerHeight)) { openMenu(lit); return; } }
  const h = pickAt(x, y, hit), a = acts.pick(ray);       // out of reach, or a chore that isn't ready: say why
  if (a && (!h || a.distance < h.distance)) { acts.tap(a); return; }
  if (h || pickAt(x, y, allTargets().flatMap((t) => t.picks))) toast("Get a bit closer");
}

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = (camera.aspect < 0.8 ? 70 : 58) + fovAdd; camera.updateProjectionMatrix(); }

export { aimStep, boop, feed, resize };
