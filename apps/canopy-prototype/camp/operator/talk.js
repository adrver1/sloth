// Canopy Camp operator, talking to you: tap him for a few warm words (lines.js). He looks at you while he speaks, his jaw
// moves (the talk clip) and he smiles after; a speech bubble over his head. Food in your hand can be given to him: it flies
// to his free hand (or his mouth), he munches it a bite at a time and thanks you. Now and then he remarks on what you just
// did (window event "camp-act" from the chores and the taps). What a tap finds is an invisible column round him (24
// triangles, never drawn: the skinned mesh is too costly to ray-test); no glow, like the sloths.
// Exports buildTalk() (operator.js, once his model is in), speak(text), talk(), gift(), talkStep(dt), mouthAt(out), tapCol and saying() (the bubble's text).
import * as THREE from "three";
import { camera, rng, scene } from "../core.js";
const { R } = rng("operator");
import { V } from "../util.js";
import { acts as chores } from "../chores.js";   // your chores (activities.js): the food in your hand
import { addTarget } from "../targets.js";
import { fx } from "../fx.js";
import { LINES, bag, line, pickLine } from "./lines.js";
import { B, clips, csDir, root } from "./model.js";
import { ME, op } from "./state.js";

const tq = new THREE.Quaternion();
let bubble = null, say = null, tapCol = null;
// a remark on what you just did, when he's near, awake and not mid-sentence; at most one every 40 s or so, not every time
function react(e) {
  const { kind, by, name } = e.detail || {}; if (by === ME || !LINES["react_" + kind]) return;
  if (op.sleeping || op.lying || op.talk.t > 0 || op.talk.munch > 0 || op.cd.react > 0 || op.carry) return;
  if (camera.position.distanceTo(root.position) > 9 || Math.random() > 0.7) return;
  op.cd.react = R(35, 50);
  let l = pickLine("react_" + kind); if (l.includes("{name}")) l = l.replace("{name}", name || "that one").replace(/^t/, "T");
  setTimeout(() => { if (!op.sleeping && op.talk.t <= 0) speak(l); }, 800);
}
function buildTalk() {
  addEventListener("camp-act", react);
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
const mouthAt = (out) => B.head.getWorldPosition(out).addScaledVector(csDir(0, 0, -1), 0.12).add(V(0, 0.025, 0));
const palmAt = (S, out) => B["hand" + S].getWorldPosition(out).addScaledVector(V(0, 1, 0).applyQuaternion(B["hand" + S].getWorldQuaternion(tq)), 0.07);
// the hand that's free: the right unless it holds something; none while eating soup, reading, cuddling or lying down
const freeHand = () => op.eat || op.ik?.book || op.ik?.hug || op.carry || op.lying || op.sleeping || op.ik?.L ? null : op.inHand || op.pail || op.stir || op.veg || op.ik?.R ? "L" : "R";
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
    setTimeout(() => { a.timeScale = 1; if (!bag.thanks?.length) bag.thanks = [...LINES.thanks].sort(() => Math.random() - 0.5); speak(bag.thanks.pop().replace("{food}", f.name)); }, 2200);
  } });
}
function speak(txt) {
  // its size is fixed when it appears: a fixed-position box shrinks to fit the room left of the screen edge, so as he moved
  // toward an edge the text re-wrapped (Adriaen: hard to read). Measure it free, then pin the width.
  say.textContent = txt; bubble.style.width = ""; bubble.style.left = "0px"; bubble.style.width = bubble.offsetWidth + 1 + "px"; op.talk.t = Math.min(7, 2.2 + txt.split(" ").length * 0.32); op.talk.smile = op.talk.t + 3;
  if (!op.sleeping) { const a = clips.talk; a.reset(); a.setLoop(THREE.LoopRepeat); a.setEffectiveWeight(1); a.play(); }
}
function talkStep(dt) {
  { const v = B.chest.getWorldPosition(V()).project(camera); op.scr = [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }   // checks (opApi.tapAt)
  op.talk.t = Math.max(0, op.talk.t - dt); op.talk.smile = Math.max(0, op.talk.smile - dt);
  op.talk.munch = Math.max(0, (op.talk.munch || 0) - dt);
  const hd = op.talk.hand?.side;
  if (op.talk.fly) hd ? palmAt(hd, op.talk.fly.to) : mouthAt(op.talk.fly.to);
  if (op.talk.food) { const F = op.talk.food; F.t += dt; if (hd) palmAt(hd, F.m.position).lerp(mouthAt(V()), 0.35 * THREE.MathUtils.smoothstep(F.t, 0.2, 0.4)); else mouthAt(F.m.position); F.m.scale.copy(F.m.userData.base).multiplyScalar(Math.max(0.1, 1 - 0.24 * Math.floor(F.t / 0.5)));
    if (F.t > 2.1) { scene.remove(F.m); op.talk.food = null; } }
  if (op.talk.t <= 0 && !op.talk.munch && clips.talk.isRunning() && clips.talk.getEffectiveWeight() > 0.99) clips.talk.fadeOut(0.3);
  const on = op.talk.t > 0; bubble.style.opacity = on ? 1 : 0; bubble.style.transform = `translate(-50%,-100%) scale(${on ? 1 : 0.85})`;
  if (!on && bubble.style.opacity === "0") return;
  const v = B.head.getWorldPosition(V()).add(V(0, 0.34, 0)).project(camera);
  if (v.z > 1) { bubble.style.opacity = 0; return; }
  const half = bubble.offsetWidth / 2 + 8; bubble.style.left = THREE.MathUtils.clamp((v.x + 1) / 2 * innerWidth, half, innerWidth - half) + "px";   // kept whole on screen
  bubble.style.top = THREE.MathUtils.clamp((1 - v.y) / 2 * innerHeight, 120, innerHeight - 60) + "px";
}

export { buildTalk, gift, mouthAt, saying, speak, talk, talkStep, tapCol };
