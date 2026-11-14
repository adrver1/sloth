// Canopy Camp operator, making the soup (the chores' cook steps, activities/soupChore.js, the same pot and pail as yours).
// Exports cook(), one of his activities (day.js DO.cook).
import * as THREE from "three";
import { R, camera, scene } from "../core.js";
import { CRATE, SOUP_POT } from "../layout.js";
import { V, yawTo } from "../util.js";
import { acts as chores } from "../campLife.js";
import { VEG, makeFood } from "../food.js";
import { me } from "../player.js";
import { fx } from "../fx.js";
import { bowl, drop, hold, pail, stick, veg } from "./handProps.js";
import { pickLine } from "./lines.js";
import { UP, cs, root } from "./model.js";
import { crateFront, fireGap } from "./places.js";
import { op } from "./state.js";
import { speak } from "./talk.js";
import { face, faceFire, wait, walkTo } from "./walk.js";

// cooking (Adriaen 2026-11-13): the soup from start to finish, the same steps as yours: the pail from under the snack table,
// water in the pot, two vegetables from the crate tossed in, a stir while it bubbles, then a bowl ladled out and brought to
// you (into your hands if they're free, else on the seat nearest you). A step you did first is skipped; if the pot is taken
// over or you've emptied it he gives up quietly.
const potSpot = () => fireGap(root.position).setLength(0.86);   // at the stones, inside the fire's walk-round circle
function* toPot() {   // already there (between steps at the pot): stay put; a path from inside the fire's ring went out and back in (Adriaen: he walked in circles)
  const at = potSpot(); if (Math.hypot(at.x - root.position.x, at.z - root.position.z) > 0.3) yield* walkTo(at, { near: 0.1 });
  yield* faceFire();
}
function* cook() {
  const K = chores.cook; if (!K.can()) return;
  op.cooking = true; op.cd.cook = R(240, 420);
  // the pail: stand at the table's edge, bend over, hook it out from under the top by its bail, straighten up with it
  const out = K.pail.clone().sub(K.table).setY(0).normalize(), stand = K.table.clone().addScaledVector(out, 1.22);
  yield* walkTo(stand, { near: 0.15 }); const yaw = yawTo(K.pail.clone().sub(root.position).setY(0)); yield* face(yaw);
  for (let t = 0; t < 0.8;) { t += yield; op.lean = 1.3 * THREE.MathUtils.smoothstep(t, 0, 0.8); }
  if (!K.takePail()) { for (let t = 0; t < 0.6;) { t += yield; op.lean = 1.3 * (1 - t / 0.6); } op.lean = 0; op.cooking = false; return; }
  pail.visible = true; pail.quaternion.setFromAxisAngle(UP, yaw); const p0 = K.pail.clone(), p1 = cs(0.1, 0, -0.4).setY(0);
  for (let t = 0; t < 1.1;) { t += yield; const e = THREE.MathUtils.smoothstep(t, 0.15, 1.1); pail.position.lerpVectors(p0, p1, e);
    op.ik = { R: [pail.position.clone().setY(0.36), Math.min(1, t / 0.4)] }; }
  op.ik = null; op.pail = { tilt: 0, from: pail.position.clone(), k: 0 };   // his hand on the bail, the pail rises into it
  for (let t = 0; t < 0.35;) { t += yield; op.pail.k = THREE.MathUtils.smoothstep(t, 0, 0.35); } op.pail.from = null;
  for (let t = 0; t < 0.8;) { t += yield; op.lean = 1.3 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.8)); }
  op.lean = 0;
  // water in the pot
  yield* toPot();
  for (let t = 0; t < 2.8;) { t += yield; op.pail.tilt = Math.sin(Math.min(1, t / 2.8) * Math.PI); op.lean = 0.5 * op.pail.tilt; if (t > 1.3 && !op.poured) { op.poured = true; K.pour(); } }
  op.lean = 0;
  op.poured = false; op.pail = null; pail.visible = false;   // the pail goes back under the table (activities.js shows it there)
  // two vegetables from the crate, tossed in
  const crate = CRATE.at, front = crateFront();
  for (let n = 0; n < 2 && K.wantsVeg(); n++) {
    yield* walkTo(front); yield* face(yawTo(crate.clone().sub(root.position)));
    for (let t = 0; t < 1.2;) { t += yield; op.ik = { R: [crate.clone().setY(0.45), Math.sin(Math.min(1, t / 1.2) * Math.PI) ** 2] }; }
    op.ik = null; veg.clear(); veg.add(makeFood(VEG[Math.floor(R(0, VEG.length))][0])); veg.visible = true; op.veg = true;
    yield* toPot();
    for (let t = 0; t < 0.5;) { t += yield; op.ik = { R: [cs(0.1, 1.35, -0.45), Math.min(1, t / 0.35)] }; }   // a little swing up
    op.veg = false; op.ik = null; const v = veg.children[0]; scene.attach(v); veg.visible = false;
    fx.push({ s: v, fly: { from: v.position.clone(), to: SOUP_POT.at.clone() }, t: 0, life: 0.6 });
    yield* wait(0.6); if (!K.addVeg()) break;
    yield* wait(0.5);
  }
  // a stir while it cooks
  if (K.stage === "cooking") {
    yield* toPot(); stick.visible = true; op.stir = { t: 0, k: 0 }; let said = false;
    for (let t = 0; t < 45 && K.stage === "cooking";) { const dt = yield; t += dt; op.stir.t += dt; op.stir.k = Math.min(1, t / 0.8);
      if (!said && t > 6 && camera.position.distanceTo(root.position) < 7 && op.talk.t <= 0) { said = true; if (Math.random() < 0.6) speak(pickLine("cookStir")); } }
    op.stir = null; stick.visible = false;
  }
  // a bowl for you
  if (K.ladle()) {
    for (let t = 0; t < 0.9;) { t += yield; op.ik = { R: [SOUP_POT.at.clone().add(V(0, 0.15, 0)), Math.sin(Math.min(1, t / 0.9) * Math.PI) ** 2] }; }
    op.ik = null; hold(bowl);
    let given = false;
    for (let tries = 0; tries < 4 && !given; tries++) {
      const you = me.pos.clone().setY(0), to = you.clone().add(root.position.clone().setY(0).sub(you).setLength(0.95));
      yield* walkTo(to, { near: 0.25 });
      if (me.pos.distanceTo(root.position) > 1.6) continue;   // you moved on: after you
      yield* face(yawTo(V(me.pos.x - root.position.x, 0, me.pos.z - root.position.z)));
      speak(pickLine("cookGive"));
      for (let t = 0; t < 1.2;) { t += yield; op.ik = { R: [cs(0.08, 1.15, -0.5), Math.min(1, t / 0.6)] }; }
      given = true;
    }
    op.ik = null; drop(bowl);
    if (!K.handToYou()) K.setDown();
  }
  op.cooking = false;
}

export { cook };
