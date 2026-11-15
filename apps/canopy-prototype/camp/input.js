// Canopy Camp and Summit Cabin input (both levels use it: Adriaen 2026-11-15, "the controls are not behaving the same in both
// levels"): keys, the phone stick, drag to look, pinch to zoom, a tap that opens a menu (on a sloth: boop, feed or give), a hold
// on a sloth that feeds it, and resize; and the things you can use: which one lights up (highlight.js) and the pill menu a tap
// on it opens. The things themselves are tap targets (targets.js), added by the modules that own them; input.js adds the sloths.
// The level hands over its page with initInput({ renderer, scene, camera, canvas, stick, help, touch, carry, eat, missed }): its
// renderer, scene and camera (the world's: picking, the highlight and the menu's place), the canvas and the phone stick's
// element (a box whose first child is the knob), the help line (or null), ?touch, and what you carry: carry.food() (what you
// hold, { name, emoji }, or null) and carry.give() (hands it over: { mesh, from, emoji } or null); camp/chores.js acts for
// the camp, the summit's basket fruit for the summit; eat(sloth, mesh, from) has a camp sloth eat it (sloth/hooks.js
// slothLife.eatGift, true once it does). missed(x, y, hit) (optional) answers a tap that hit nothing in reach (the camp:
// a chore that isn't ready says why). The cast's positions are in the stage's frame (stage.js toStage), which input.js turns
// into the world's for the camera; in the camp the two are the same.
// Exports initInput(level) (main.js, once), aimStep(dt) (main.js, each frame), boop(sloth), feed(sloth) (debug.js), resize()
// (main.js) and warmHighlight() (main.js, once, before the shaders are compiled).
import * as THREE from "three";
import { rng, scene as stageScene, toStage, toWorld, uTime, camera as stageCamera } from "./stage.js";
import { keys, pickAt, stickV, toast } from "./hud.js";
import { V } from "./util.js";
import { hit, sloths } from "./sloth/state.js";
import { burst, fx, sprite } from "./fx.js";
import { me } from "./player.js";
import { EV, emit } from "./events.js";
import { createHighlight } from "./highlight.js";
import { addTargets, allTargets, targetOf, tick } from "./targets.js";

let L = null;   // the level's page (initInput)
// the look of what input.js and hud.js put on the page, in both levels: the pills of a tap's menu (.tap-pill, also car.js's
// and trip.js's in the camp), the menu over the thing, and the toast (hud.js)
const CSS = `
.tap-pill { font: 600 16px var(--display, system-ui); color: #4a3426; background: rgb(255 248 238 / .94); border: 0; border-radius: 999px; padding: 9px 16px; box-shadow: 0 3px 0 rgb(138 90 59 / .25); cursor: pointer; white-space: nowrap; }
#tapmenu { position: fixed; left: 0; top: 0; display: none; flex-direction: column; gap: 6px; transform: translate(-50%, -100%); z-index: 3; }
#toast { position: fixed; left: 50%; top: 30%; transform: translate(-50%, -50%) scale(.6); opacity: 0; transition: .35s; pointer-events: none; z-index: 6;
  font: 700 34px var(--display, system-ui); color: #fff; text-shadow: 0 3px 0 #d95c86, 0 0 18px rgb(255 127 168 / .7); white-space: nowrap; }
#toast.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
`;
let fxR = null;   // the boop words' stream (stage.js rng "fx"), taken the first time
// ---------------------------------------------------------------- input
let coarse = false, stick = null, stickId = null, glow = null, menu = null;   // set by initInput
function hideHelp() { if (L.help) setTimeout(() => (L.help.style.opacity = 0), 3000); }
function stickMove(e) {
  const r = stick.getBoundingClientRect(), v = new THREE.Vector2(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2).divideScalar(r.width / 2);
  if (v.length() > 1) v.normalize(); stickV.copy(v); stick.firstElementChild.style.transform = `translate(${v.x * 37}px, ${v.y * 37}px)`;
}
const stickEnd = (e) => { if (e.pointerId !== stickId) return; stickId = null; stickV.set(0, 0); stick.firstElementChild.style.transform = ""; };
// anywhere else: drag to look, two fingers to zoom, a short tap on a lit thing opens its menu, a hold on a sloth feeds it
const looks = new Map(); let pinch0 = 0, fov0 = 0, fovAdd = 0;
function lookStart(e) {
  const L = { x: e.clientX, y: e.clientY, moved: 0, t0: performance.now(), held: false };
  looks.set(e.pointerId, L);
  if (looks.size >= 2) {   // a pinch: no finger in it feeds on a hold or taps when it lifts
    for (const P of looks.values()) { clearTimeout(P.holdT); P.pinch = true; }
    if (looks.size === 2) { const [a, b] = [...looks.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = fovAdd; }
    return;
  }
  const h = pickAt(e.clientX, e.clientY, hit);
  if (h) L.holdT = setTimeout(() => { if (L.moved > 12) return; L.held = true; h.distance < 7 ? feed(h.object.userData.s) : toast("Get a bit closer"); }, 450);
}
function lookMove(e) {
  const L = looks.get(e.pointerId); if (!L) return;
  const dx = e.clientX - L.x, dy = e.clientY - L.y; L.x = e.clientX; L.y = e.clientY; L.moved += Math.hypot(dx, dy);
  if (looks.size === 2) { const [a, b] = [...looks.values()]; zoomTo(fov0 + (pinch0 - Math.hypot(a.x - b.x, a.y - b.y)) * 0.06); return; }
  me.yaw -= dx * 0.005; me.pitch = THREE.MathUtils.clamp(me.pitch - dy * 0.004, -1.2, 1.2); me.lastDrag = uTime.value;
}
const lookEnd = (e) => {
  const L = looks.get(e.pointerId); looks.delete(e.pointerId); if (!L) return; clearTimeout(L.holdT);
  if (L.moved < 12 && !L.held && !L.pinch && performance.now() - L.t0 < 450) tap(e.clientX, e.clientY);
};
const BOOP = ["eep!", "hehe", "*slow blink*", "boop", "mmh?", "*yawn*"];
const told = (kind, s) => emit(EV.act, { kind, by: "you", name: s.name });   // the operator may remark on it (events.js)
function boop(s) { told("boop", s); s.squish = 1; s.nod = 0.6; fxR ??= rng("fx").R; burst(s.p.clone().add(V(0, 0.25, 0)), BOOP[Math.floor(fxR(0, BOOP.length))], 1.6, 64); L?.onBoop?.(s); }
// feeding (Adriaen 2026-11-12: every camp sloth is already your friend, so no friend counter or "new friend"; and eating
// shows no words or emojis): a flower flies from you to its mouth, it nods and munches it (slothLife's mouth)
function feed(s, emoji = "🌺") {
  told("feed", s);
  const cam = L.camera, f = sprite(emoji, 96); f.position.copy(cam.position).add(V(0.15, -0.35, -0.6).applyQuaternion(cam.quaternion)); toStage(f.position); stageScene.add(f);
  fx.push({ s: f, fly: { from: f.position.clone(), to: toStage(s.head.getWorldPosition(V())) }, t: 0, life: 0.9, done() { s.nod = 2.4; s.munch = 2.6; } });
}

// giving it what you carry (a vegetable, a fruit or a bowl of soup): the modelled food (camp/food.js) leaves your hand and
// a camp sloth eats it, with its eat clip when it is sitting up (sloth/hooks.js slothLife.eatGift); a wild sloth, which has
// no day for the eating to pause, gets it the way it gets a flower (it threw on a wild sloth: play-test 2026-11-14)
function give(s) { const f = L.carry.give(); if (!f) return; if (!s.wild && L.eat?.(s, f.mesh, f.from)) told("feed", s); else feed(s, f.emoji); }

// ---------------------------------------------------------------- what you can use lights up (camp/highlight.js, as in desk-at-night's free mode)
// With a mouse, the thing under the pointer; otherwise (and always on a phone) the usable thing nearest the middle of the view,
// within AIM of it, so you only have to look roughly at it. Only things in reach light up. Tapping a lit thing opens a small
// menu of what you can do with it (Adriaen 2026-11-12): Boop / Feed for a sloth, Open / Close for a jeep door, the chore for
// the wood pile and the fire. Sloths never light up (Adriaen: too many, too distracting), but a tap on one still opens
// its menu, and a hold still feeds it straight away.
const AIM = 0.45, fwd = new THREE.Vector3(), to = new THREE.Vector3(), sph = new THREE.Sphere();
let hover = null, lit = null, menuFor = null;
const picksNow = [];   // scratch: what a ray may hit, refilled for each pick
// the ready target under the screen point x, y (or null)
function targetAt(x, y) {
  picksNow.length = 0; for (const t of allTargets()) if (t.ready()) picksNow.push(...t.picks);
  const h = pickAt(x, y, picksNow); return h ? targetOf(h.object) : null;
}
function aimStep(dt) {
  tick();                                               // a new frame for the targets' bounds (targets.js frameAt)
  let best = null;
  if (menuFor) best = menuFor.ready() ? menuFor : (closeMenu(), null);
  else if (hover) { best = looks.size ? lit : targetAt(hover.x, hover.y); if (best?.quiet) best = null; }   // a mouse: what it is over (kept while dragging)
  else {
    const cam = L.camera; cam.getWorldDirection(fwd); let bestA = AIM;
    for (const t of allTargets()) {
      if (t.quiet || !t.ready()) continue;
      const S = t.at(to); toWorld(to).sub(cam.position); const d = to.length();
      const ang = fwd.angleTo(to) - Math.asin(Math.min(1, S.radius / d));
      if (ang < bestA) { bestA = ang; best = t; }
    }
  }
  lit = best; glow.set(best?.look ?? null); glow.update(dt);
  if (menuFor) placeMenu();
}
function openMenu(t) {
  if (t.tap) { t.tap(); return; }   // a thing with one obvious use does it straight away (targets.js: trip.js's karaoke sign asks its question)
  menuFor = t; menu.replaceChildren(...t.options().map(([label, fn]) => {
    const b = document.createElement("button"); b.textContent = label; b.className = "tap-pill";   // styled in camp.html
    b.onclick = (e) => { e.stopPropagation(); closeMenu(); fn(); }; return b; }));
  menu.style.display = "flex"; placeMenu();
}
function closeMenu() { menuFor = null; menu.style.display = "none"; }
function placeMenu() {
  const S = menuFor.at(to); to.y += S.radius * 0.8; toWorld(to).project(L.camera);
  if (to.z > 1) { closeMenu(); return; }   // behind you
  const x = THREE.MathUtils.clamp((to.x + 1) / 2 * innerWidth, 90, innerWidth - 90), y = THREE.MathUtils.clamp((1 - to.y) / 2 * innerHeight - 8, Math.max(130, menu.offsetHeight + 60), innerHeight - 40);   // a tall menu (the clock's) stays on screen
  menu.style.left = x + "px"; menu.style.top = y + "px";
}
function tap(x, y) {
  if (menuFor) { closeMenu(); return; }                  // a tap anywhere else closes the menu
  const t = targetAt(x, y);
  if (t && !t.quiet) { openMenu(t); return; }
  if (lit && coarse) { lit.at(to); toWorld(to).project(L.camera);   // a finger: a tap near the lit thing opens its menu, before a sloth sitting behind it
    if (Math.hypot((to.x + 1) / 2 * innerWidth - x, (1 - to.y) / 2 * innerHeight - y) < 0.22 * Math.min(innerWidth, innerHeight)) { openMenu(lit); return; } }
  if (t) { openMenu(t); return; }
  const h = pickAt(x, y, hit);                          // out of reach, or (the camp) a chore that isn't ready: say why
  if (L.missed?.(x, y, h)) return;
  if (h || pickAt(x, y, allTargets().flatMap((t) => t.picks))) toast("Get a bit closer");
}

// zooming only changes the field of view (a tall phone screen sees wider); resize() also sizes the canvas
function setFov() { const camera = L.camera; camera.fov = (camera.aspect < 0.8 ? 70 : 58) + fovAdd; camera.updateProjectionMatrix(); }
function zoomTo(add) { fovAdd = THREE.MathUtils.clamp(add, -20, 6); setFov(); }   // -20 (zoomed in) .. +6 degrees
function resize() { L.renderer.setSize(innerWidth, innerHeight, false); L.camera.aspect = innerWidth / innerHeight; setFov(); }

// ---------------------------------------------------------------- initInput (main.js, once the sloths and the chores are built)
// the listeners, the highlight, the pill menu and the sloths' tap targets
function initInput(level) {
  L = level; const cv = L.canvas;
  document.head.append(Object.assign(document.createElement("style"), { textContent: CSS }));
  if (!document.getElementById("toast")) document.body.append(Object.assign(document.createElement("div"), { id: "toast" }));
  coarse = matchMedia("(pointer: coarse)").matches || L.touch;   // ?touch: the phone stick on a desktop too
  stick = L.stick;
  stick.hidden = !coarse;
  document.body.classList.toggle("touch", coarse);   // the hint moves up above the stick
  if (L.help) L.help.innerHTML = coarse ? "Stick to walk · drag to look<br>Tap a sloth, or anything that lights up, to see what you can do" : "WASD or arrows to walk · drag to look<br>Click a sloth, or anything that lights up, to see what you can do";
  // the keys the player walks by (player.js reads them); the split into modules had dropped these listeners
  // (not while a slider, a select or a text field has the focus: its arrows are its own, review R2-055)
  addEventListener("keydown", (e) => { const t = e.target; if ((t.matches?.("input[type=range], select") && /^(Arrow|Page|Home|End)/.test(e.code)) || t.closest?.("textarea, input:not([type=range])") || t.isContentEditable) return; keys.add(e.code); hideHelp(); }); addEventListener("keyup", (e) => keys.delete(e.code)); addEventListener("blur", () => keys.clear());
  stick.addEventListener("pointerdown", (e) => { e.stopPropagation(); stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch {} /* a pointer that is no longer down (or a made-up one) cannot be captured */ stickMove(e); hideHelp(); });
  stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickId) stickMove(e); });
  stick.addEventListener("pointerup", stickEnd); stick.addEventListener("pointercancel", stickEnd);
  cv.addEventListener("pointerdown", lookStart);
  cv.addEventListener("pointermove", lookMove);
  cv.addEventListener("pointerup", lookEnd); cv.addEventListener("pointercancel", (e) => { const L = looks.get(e.pointerId); if (L) clearTimeout(L.holdT); looks.delete(e.pointerId); });
  addEventListener("wheel", (e) => { zoomTo(fovAdd + e.deltaY * 0.02); }, { passive: true });
  glow = createHighlight(L.scene, L.renderer, { width: coarse ? 3.5 : 3 });
  cv.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") hover = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener("pointerleave", () => (hover = null));
  // every thing that can light up is a target (targets.js), added by the module that owns it; the sloths are added here, since
  // their menu is what you do to them (boop, feed, give)
  const SLOTH_REACH = 7;
  addTargets("sloths", () => sloths, (s) => ({ look: null, quiet: true, picks: [s.box], at: (v) => sph.set(v.copy(s.box.position), 0.42),
    ready: () => s.o.visible && stageCamera.position.distanceTo(s.box.position) < SLOTH_REACH, options: () => { const f = L.carry.food(); return [...(f ? [[`Give the ${f.name} ${f.emoji}`, () => give(s)]] : []), ["Boop 👉", () => boop(s)], ["Feed 🌺", () => feed(s)]]; } }));
  // the menu: a few pill buttons over the thing, following it while it is open (its look is camp.html's #tapmenu rules)
  menu = document.createElement("div"); menu.id = "tapmenu";
  document.body.append(menu);
  for (const ev of ["pointerdown", "pointerup"]) menu.addEventListener(ev, (e) => e.stopPropagation());
}

// before the shaders are compiled (main.js): the highlight's hulls for every thing that can light up, so the first look at
// one neither welds a hull nor compiles the outline (review R2-102)
const warmHighlight = () => glow.warm(allTargets().filter((t) => !t.quiet && t.look).flatMap((t) => t.look));
export { aimStep, boop, feed, initInput, resize, warmHighlight };
