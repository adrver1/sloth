// Canopy Camp sloths, eating at a food place (table.js): a sloth comes to the place, climbs onto the table (or sits up
// against the crate), and plays eat (or eat_high, up over the crate's rim): its paw closes on the fruit, brings it to its
// mouth, and the fruit gets smaller with each chew until it's gone. A bowl you set down works the same: the fruit comes
// up out of it.
//   startEat(s, slot, done)          starts the eat phase at a slot it has walked to; done() runs when it has eaten and is
//                                    back on the ground (or, at the card table, when the game is over: cards.js). Up on
//                                    the table it eats two or three fruits in a row before it climbs down
//   eatStep(s, T, sd)                the eat phase, each frame: turn to the food, up onto the table, eat (or play cards)
//   chewStep(s, mesh, from, t0)      during an eat clip, from t0 seconds in: the food goes from `from` into its paw and to
//                                    its lips, a bite smaller each time the painted mouth closes
import { rng, scene } from "../core.js";
const { R } = rng("sloths");
import { V, sstep } from "../util.js";
import { release } from "../places.js";
import { WALK_TS, setTrip } from "./state.js";
import { EAT_GRAB, play, playOnce } from "./clips.js";
import { UP, turnTo } from "./poses.js";
import { move, moveStep } from "./moves.js";
import { mouthOf } from "./face.js";
import { pawOf } from "./arms.js";
import { fruit, restOn, sitFor } from "./table.js";
import { cardsSit, cardsStep } from "./cards.js";

const paw = V(), mouthW = V();
function startEat(s, slot, done) { setTrip(s, "eat", { st: "turn", slot, cards: false, done }); play(s, "idle", 1); }
function eatStep(s, T, sd) {
  const slot = T.slot, F = slot?.food;
  if (T.st === "turn") {                           // face the fruit, then up onto the table or up against the crate
    if (turnTo(T, slot.yaw, sd * 2) < 0.05 || T.t > 3) {
      const sit = sitFor(slot, s.sc);
      if (slot.name === "table") { play(s, "hang_walk", 1, 2); move(s, T, sit, 3.5, 0.12, -0.5, () => T.cards ? cardsSit(s, T) : chew(s, T)); }
      else { play(s, "walk", 1, WALK_TS); move(s, T, sit, 1.6, 0, 0, () => chew(s, T)); }
    }
    s.o.quaternion.setFromAxisAngle(UP, T.yaw);
  } else if (T.st === "move") moveStep(s, T);
  else if (T.st === "cards") cardsStep(s, T, sd);
  else if (T.st === "eat") {
    if (!F.mesh && s.act.time > EAT_GRAB - 0.1) { F.mesh = fruit(); F.mesh.position.copy(pawOf(s, paw)); }   // a bowl: the fruit comes up out of it
    if (F.mesh) chewStep(s, F.mesh, F.from ??= F.at.clone().setY(F.at.y + (F.mesh.userData.base?.y ?? 0) / 2), EAT_GRAB);
  }
}
function chew(s, T) {
  T.st = "eat"; T.t = 0;
  playOnce(s, T.slot.clip, 0.8, () => {            // eaten: down off the table, then on its way
    const slot = T.slot, F = slot.food; mouthOf(s).visible = false;
    F.from = null;
    // up on the table it must be hungry (Adriaen 2026-11-14): two or three fruits in a row, each the next from the plate
    if (slot.name === "table" && !F.bowl && (T.more ??= Math.floor(R(1, 3))) > 0) { T.more--; fruit(F.mesh); restOn(F); F.mesh.visible = true; F.mesh.scale.multiplyScalar(0.01); F.grow = 0; return chew(s, T); }
    T.more = undefined;
    if (F.bowl) { F.mesh && scene.remove(F.mesh); F.mesh = null; } else { F.mesh.visible = false; F.back = R(25, 45); }
    const go = () => { slot.who = null; if (slot.key) release(slot.key, s); T.done(); };
    if (slot.name === "table") { play(s, "hang_walk", 1, -2); T.yaw = slot.yaw; move(s, T, slot.p.clone(), 3.5, 0.12, -0.5, go); }
    else go();
  });
}
// during an eat clip: from the grab the food is in its paw, and it gets a bite smaller each time the mouth closes (the
// clip's head bobs nine times a clip, four while it holds it to its mouth, 3.2 to 6.8 s); a painted mouth opens and shuts
function chewStep(s, mesh, from, t0) {
  const t = s.act.time; if (t < t0) return;
  pawOf(s, paw); mesh.position.lerpVectors(from, paw, sstep(t0, t0 + 0.35, t));
  mouthOf(s).getWorldPosition(mouthW); mesh.position.lerp(mouthW, 0.75 * sstep(2.8, 3.3, t) * (1 - sstep(6.6, 7.0, t)));   // right up to its lips while it bites
  const bites = t < 3.2 ? 0 : Math.floor((t - 3.2) / (8 / 9)), base = mesh.userData.base;
  if (base) mesh.scale.copy(base).multiplyScalar(1 - 0.22 * bites);
  mesh.visible = bites < 4;
  const m = mouthOf(s), open = t > 3.0 && t < 6.9 ? Math.max(0, Math.sin(2 * Math.PI * 9 * (t / 8 - 0.4) + 0.6)) : 0;
  m.visible = open > 0.08; m.scale.set(0.9, Math.max(0.01, open), 1);
}

export { chewStep, eatStep, startEat };
