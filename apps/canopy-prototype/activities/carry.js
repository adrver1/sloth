// Camp activities, what you carry: one thing at a time (a log, the water pail, a vegetable, a fruit or a bowl of soup), shown
// low in the bottom right of the view, swaying a little as you walk.
// Putting things back (Adriaen 2026-11-13: a vegetable taken before the pot had water left you stuck, hands full): a
// "Put it back" pill in the corner whenever you carry something (Q or Backspace on a keyboard), and the place it came
// from (wood pile, crate, pail spot) takes it back too. It goes back where it came from; a bowl goes back in the pot.
// Triangles: the log 24, the pail 60 (camp/pail.js), a bowl 24, the food 15 to 36 (camp/food.js).
// Exports createCarry({ camera, me, toast }): { held, hold(what), putBack(), onPutBack(what, fn), takeNext("veg" | "fruit"),
// next(kind) and now(kind) (the [name, emoji] you would take, and the one you hold), food(), give(), update(dt, time) }.
import * as THREE from "three";
import { makePail } from "../camp/pail.js";
import { makeFood } from "../camp/food.js";
import { V } from "../camp/util.js";
import { FE, FN, VEG, VN, logGeo, logMat, soupBowl } from "./parts.js";

export function createCarry({ camera, me, toast }) {
  let held = null; const hand = new THREE.Group(); hand.position.set(0.36, -0.36, -0.85); hand.scale.setScalar(0.55); camera.add(hand);
  const inHand = {
    log: new THREE.Mesh(logGeo, logMat),
    water: makePail(),
    food: new THREE.Group(),   // a vegetable or a fruit (camp/food.js), shown bigger than life so it reads in the corner
    bowl: soupBowl(),
  };
  inHand.water.position.set(-0.08, -0.02, 0); inHand.water.scale.setScalar(0.9);   // the pail stays fully in view on a phone
  inHand.bowl.rotation.x = 0.25; inHand.bowl.position.y = -0.05; inHand.bowl.scale.setScalar(1.6);
  for (const k in inHand) { inHand[k].visible = false; hand.add(inHand[k]); }
  inHand.log.rotation.set(1.1, 0.5, 0.9); inHand.water.rotation.set(0.15, -0.5, 0.1);
  inHand.food.rotation.set(0.5, 0.6, 0.35);
  // which vegetable and which fruit: the one you hold or held last; taking one moves on to the next kind
  const at = { veg: 0, fruit: 0 }, NAMES = { veg: [VN, VEG], fruit: [FN, FE] };
  const pair = (kind, i) => [NAMES[kind][0][i], NAMES[kind][1][i]];
  const now = (kind) => pair(kind, at[kind]), next = (kind) => pair(kind, (at[kind] + 1) % NAMES[kind][0].length);
  const kindNow = () => held === "veg" ? VN[at.veg] : held === "fruit" ? FN[at.fruit] : null;
  function hold(what) {
    held = what; for (const k in inHand) inHand[k].visible = k === what || (k === "food" && (what === "veg" || what === "fruit")); hand.userData.t = 0;
    inHand.food.clear(); if (kindNow()) { const m = makeFood(kindNow()); m.geometry.computeBoundingSphere(); m.scale.setScalar(0.085 / m.geometry.boundingSphere.radius); inHand.food.add(m); }   // all about the same size in the corner
    dropBtn.style.display = what ? "block" : "none";
  }
  function takeNext(kind) { at[kind] = (at[kind] + 1) % NAMES[kind][0].length; hold(kind); return now(kind); }
  const dropBtn = document.createElement("button"); dropBtn.textContent = "✋ Put it back";
  dropBtn.style.cssText = "position:fixed;z-index:3;display:none;right:max(16px,env(safe-area-inset-right,0px));" +
    "font:600 15px var(--display);color:var(--ink);background:rgb(255 248 238 / .94);border:0;border-radius:999px;padding:9px 15px;box-shadow:0 3px 0 rgb(138 90 59 / .25);cursor:pointer";
  for (const ev of ["pointerdown", "pointerup"]) dropBtn.addEventListener(ev, (e) => e.stopPropagation());
  dropBtn.onclick = (e) => { e.stopPropagation(); putBack(); };
  dropBtn.id = "putBack"; document.body.append(dropBtn);
  document.head.append(Object.assign(document.createElement("style"), { textContent:   // above what you hold; on a phone also above the hint and stick row
    "#putBack{bottom:calc(150px + env(safe-area-inset-bottom,0px))} body.touch #putBack{bottom:calc(220px + env(safe-area-inset-bottom,0px))}" }));
  addEventListener("keydown", (e) => { if ((e.key === "q" || e.key === "Q" || e.key === "Backspace") && held && !e.target.closest?.("input,textarea")) putBack(); });
  // what else happens when a thing goes back (the pail stands under the table again, the bowl's soup is back in the pot):
  // its chore says so with onPutBack
  const returned = {};
  function putBack() {
    if (!held) return;
    const what = held;
    returned[what]?.();
    hold(null);
    toast(what === "log" ? "Log back on the pile 🪵" : what === "water" ? "Pail put back 💧" : what === "veg" ? `The ${VN[at.veg]} is back in the crate` : what === "fruit" ? `The ${FN[at.fruit]} is back in the bowl` : "Bowl back in the pot 🍲",
      what === "log" ? "knock" : what === "bowl" ? "clink" : null);   // the log knocks back on the pile, the bowl clinks on the pot
  }
  return {
    get held() { return held; }, hold, putBack, takeNext, next, now,
    onPutBack(what, fn) { returned[what] = fn; },
    // food in your hand can be given to a sloth or to the operator, who eat it (Adriaen 2026-11-13): what it is, and the giving.
    // make() gives a new mesh of it (real size, userData.base for the eater's bites); from is where it leaves your hand
    food() {
      const k = kindNow();
      if (k) return { kind: k, name: k, emoji: held === "veg" ? VEG[at.veg] : FE[at.fruit], make: () => makeFood(k) };
      if (held === "bowl") return { kind: "soup", name: "bowl of soup", emoji: "🍲", make: () => { const g = soupBowl(); g.position.y = -0.025; const o = new THREE.Group(); o.add(g); o.userData.base = V(1, 1, 1); return o; } };
      return null;
    },
    give() { const f = this.food(); if (!f) return null; f.from = (inHand.food.visible ? inHand.food : inHand.bowl).getWorldPosition(V()); hold(null); return f; },
    // what you hold sways a little as you walk
    update(dt, time) {
      hand.userData.t = (hand.userData.t || 0) + dt; hand.position.x = 0.1 + 0.26 * Math.min(1, camera.aspect);   // stays in view on a narrow phone
      hand.position.y = -0.36 + Math.sin(me.walkT * 7) * 0.01 + (1 - Math.min(1, hand.userData.t * 4)) * -0.2;
      if (inHand.food.visible) inHand.food.rotation.z = 0.35 + Math.sin(time * 2) * 0.1;
    },
  };
}
