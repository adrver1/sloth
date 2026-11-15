// Canopy Camp operator, talking to you: tap him for a few warm words (lines.js). He looks at you while he speaks, his jaw
// moves (the talk clip) and he smiles after; a speech bubble over his head. Food in your hand can be given to him: it flies
// to his free hand (or his mouth), he munches it a bite at a time and thanks you. Now and then he remarks on what you just
// did (camp/events.js EV.act, from the chores and the taps). What a tap finds is an invisible column round him (24
// triangles, never drawn: the skinned mesh is too costly to ray-test); no glow, like the sloths.
// Exports buildTalk() (operator.js, once his model is in), speak(text), talk(), gift(), talkStep(dt), mouthAt(out) and
// palmAt(side, out, d) (the points at his lips and in front of a palm, also for handPose.js), tapCol,
// saying() (the bubble's text) and chestOnScreen() (where his chest is on screen, for the checks: opChecks.tapAt).
import * as THREE from "three";
import { camera, chores, rng, scene } from "../stage.js";
const { R } = rng("operator");
import { V, timers } from "../util.js";
import { addTarget } from "../targets.js";
import { EV, on } from "../events.js";
import { fx } from "../fx.js";
import { bite } from "../actor.js";
import { LINES, line, pickLine } from "./lines.js";
import { B, clips, csDir, root } from "./model.js";
import { ME, freeHand, op } from "./state.js";

const tq = new THREE.Quaternion(), vM = V(), vU = V(), vB = V(), LIFT = V(0, 0.025, 0), OVER = V(0, 0.34, 0);   // scratch (review R2-019)
let bubble = null, say = null, tapCol = null;
const later = timers();   // a remark a moment after what you did, the thanks after the munching: in his frame time, stepped by talkStep (review R2-050)
// the bubble's state as last written, so a frame touches its style only when something changed and never forces a layout
// (review R2-019): shown, on screen, its half width (measured once per line, in speak) and the position written
const bub = { shown: false, vis: true, half: 0, left: "", top: "" };
// a remark on what you just did, when he's near, awake and not mid-sentence; at most one every 40 s or so, not every time
function react({ kind, by, name } = {}) { if (by === ME || !LINES["react_" + kind]) return;
  if (op.sleeping || op.lying || op.talk.t > 0 || op.talk.munch > 0 || op.cd.react > 0 || op.carry) return;
  if (camera.position.distanceTo(root.position) > 9 || Math.random() > 0.7) return;
  op.cd.react = R(35, 50);
  let l = pickLine("react_" + kind); if (l.includes("{name}")) l = l.replace("{name}", name || "that one").replace(/^t/, "T");
  later.after(0.8, () => { if (!op.sleeping && op.talk.t <= 0) speak(l); });
}
function buildTalk() {
  on(EV.act, react);
  bubble = document.createElement("div");
  bubble.style.cssText = "position:fixed;left:0;top:0;z-index:3;pointer-events:none;transform:translate(-50%,-100%) scale(.85);opacity:0;transition:opacity .35s,transform .35s;" +
    "max-width:min(260px,70vw);text-align:center;font:600 16px/1.3 var(--display);color:var(--ink);background:rgb(255 248 238 / .96);border-radius:18px;padding:9px 14px;box-shadow:0 3px 0 rgb(138 90 59 / .25)";
  const tail = document.createElement("i"); tail.style.cssText = "position:absolute;left:50%;bottom:-7px;width:14px;height:14px;margin-left:-7px;background:inherit;transform:rotate(45deg);border-radius:0 0 3px 0";
  say = document.createElement("span"); bubble.append(say, tail); document.body.append(bubble);
  // what a tap finds: an invisible column round him
  tapCol = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.75, 6), new THREE.MeshBasicMaterial({ visible: false }));
  scene.add(tapCol); const sph = new THREE.Sphere();
  addTarget(tapCol, () => ({ look: null, quiet: true, picks: [tapCol], at: (v) => { v.copy(tapCol.position); sph.center.copy(v); sph.radius = 0.6; return sph; },
    ready: () => camera.position.distanceTo(tapCol.position) < 7, options: () => { const f = !op.sleeping && !munching() && chores.food(); return [...(f ? [[`Give the ${f.name} ${f.emoji}`, gift]] : []), [op.sleeping ? "Whisper goodnight 🌙" : "Talk 💬", talk]]; } }));
}
const saying = () => say.textContent;
function talk() { speak(line()); }
// food you hand him (camp activities: a vegetable or a bowl of soup): it flies to his mouth, he munches, then thanks you
const mouthAt = (out) => B.head.getWorldPosition(out).addScaledVector(csDir(0, 0, -1, vM), 0.12).add(LIFT);
// d m out from the palm of hand S ("R" or "L"), along the way the fingers point: where a thing he holds sits
const palmAt = (S, out, d = 0.07) => B["hand" + S].getWorldPosition(out).addScaledVector(vU.set(0, 1, 0).applyQuaternion(B["hand" + S].getWorldQuaternion(tq)), d);
// where his chest is on screen, in CSS pixels [x, y] (the checks, opChecks.tapAt): worked out when asked, not every frame
const chestOnScreen = () => { const v = B.chest.getWorldPosition(V()).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
// one gift at a time: while the last one is flying to him or at his lips the menu offers none (a second one overwrote the
// first's flight and left its food floating at his mouth: review R2-009)
const munching = () => !!(op.talk.fly || op.talk.food);
function gift() {
  if (munching()) return;
  const f = chores.give(); if (!f) return;
  // the modelled food (camp/food.js) flies from your hand to his mouth, stays at his lips and gets a bite smaller each
  // munch (talkStep), then he thanks you
  const s = f.make(); s.position.copy(f.from); scene.add(s);
  const side = freeHand(); op.talk.hand = side ? { side, t: 0, down: 0 } : null; op.fid = null;
  const fly = { from: s.position.clone(), to: side ? palmAt(side, V()) : mouthAt(V()) }; op.talk.fly = fly;   // talkStep keeps "to" on his hand (or mouth) as he moves
  fx.push({ s, fly, t: 0, life: 0.9, done() {
    op.talk.fly = null;
    scene.add(s); op.talk.food = { m: s, t: 0 };
    const a = clips.talk; a.reset(); a.setLoop(THREE.LoopRepeat); a.timeScale = 1.6; a.setEffectiveWeight(1); a.play(); op.talk.munch = 2.2; op.talk.smile = 4;   // munching
    later.after(2.2, () => { a.timeScale = 1; if (op.sleeping) return;   // no thanks in his sleep
      speak(pickLine("thanks").replace("{food}", f.name)); });
  } });
}
function speak(txt) {
  // its size is fixed when it appears: a fixed-position box shrinks to fit the room left of the screen edge, so as he moved
  // toward an edge the text re-wrapped (Adriaen: hard to read). Measure it free, then pin the width.
  say.textContent = txt; bubble.style.width = ""; bubble.style.left = "0px"; bubble.style.width = bubble.offsetWidth + 1 + "px"; bub.half = bubble.offsetWidth / 2 + 8; bub.left = "0px"; op.talk.t = Math.min(7, 2.2 + txt.split(" ").length * 0.32); op.talk.smile = op.talk.t + 3;
  if (!op.sleeping) { const a = clips.talk; a.reset(); a.setLoop(THREE.LoopRepeat); a.setEffectiveWeight(1); a.play(); }
}
function talkStep(dt) {
  later.step(dt);
  op.talk.t = Math.max(0, op.talk.t - dt); op.talk.smile = Math.max(0, op.talk.smile - dt);
  op.talk.munch = Math.max(0, (op.talk.munch || 0) - dt);
  const hd = op.talk.hand?.side;
  if (op.talk.fly) hd ? palmAt(hd, op.talk.fly.to) : mouthAt(op.talk.fly.to);
  if (op.talk.food) { const F = op.talk.food; F.t += dt; if (hd) palmAt(hd, F.m.position).lerp(mouthAt(vB), 0.35 * THREE.MathUtils.smoothstep(F.t, 0.2, 0.4)); else mouthAt(F.m.position); bite(F.m, Math.floor(F.t / 0.5), 0.24);
    if (F.t > 2.1) { scene.remove(F.m); op.talk.food = null; } }
  if (op.talk.t <= 0 && !op.talk.munch && clips.talk.isRunning() && clips.talk.getEffectiveWeight() > 0.99) clips.talk.fadeOut(0.3);
  const on = op.talk.t > 0;
  if (on !== bub.shown) { bub.shown = on; bub.vis = on; bubble.style.opacity = on ? 1 : 0; bubble.style.transform = `translate(-50%,-100%) scale(${on ? 1 : 0.85})`; }
  if (!on) return;   // fading out where it was
  const v = B.head.getWorldPosition(vB).add(OVER).project(camera), vis = v.z <= 1;
  if (vis !== bub.vis) { bub.vis = vis; bubble.style.opacity = vis ? 1 : 0; }
  if (!vis) return;
  const left = Math.round(THREE.MathUtils.clamp((v.x + 1) / 2 * innerWidth, bub.half, innerWidth - bub.half)) + "px";   // kept whole on screen
  const top = Math.round(THREE.MathUtils.clamp((1 - v.y) / 2 * innerHeight, 120, innerHeight - 60)) + "px";
  if (left !== bub.left) bubble.style.left = bub.left = left;
  if (top !== bub.top) bubble.style.top = bub.top = top;
}

export { buildTalk, chestOnScreen, gift, mouthAt, palmAt, saying, speak, talk, talkStep, tapCol };
