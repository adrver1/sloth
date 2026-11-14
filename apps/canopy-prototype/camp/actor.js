// Canopy Camp characters, the parts the sloths (camp/sloth/) and the operator (camp/operator/) share (review operator-09):
// stateless functions over the object and the numbers they are handed, so each character keeps its own constants and does
// exactly what it did before. Nothing runs on import, no scene object is made and no random number is drawn.
//   aimBone(bone, dir, w = 1)   turns a bone (it points along its own +Y) toward the world direction dir, by the weight w
//   crossFade(cur, next, fade, { once, at, speed, reps, restart, weigh })   starts clip action `next` `at` seconds in at
//                               `speed`, looping or played once and held on its last frame, and cross-fades the playing
//                               action `cur` into it over `fade` s; returns next. If next is the one playing, only its speed
//                               changes, unless it is played once and restart is set. Where the two characters differ:
//                               reps, the repetitions a once clip is given (the sloths 1, the operator three.js's default);
//                               restart (the sloths start a once clip over, the operator leaves it running); weigh (the
//                               operator also enables the clip and sets its weight to 1 before it plays)
import * as THREE from "three";
import { V } from "./util.js";

const Y = V(0, 1, 0);                                  // a bone points along its own +Y
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), vb = V();
export function aimBone(b, dir, w = 1) {
  const bq = b.getWorldQuaternion(qa), y = vb.copy(Y).applyQuaternion(bq);
  qb.setFromUnitVectors(y, dir).slerp(qc.identity(), 1 - w).multiply(bq);
  b.quaternion.copy(b.parent.getWorldQuaternion(qc).invert().multiply(qb));
}

export function crossFade(cur, next, fade, { once = false, at = 0, speed = 1, reps = Infinity, restart = false, weigh = false } = {}) {
  if (cur === next && !(once && restart)) { next.timeScale = speed; return next; }
  next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? reps : Infinity); next.clampWhenFinished = once;
  next.time = at; next.timeScale = speed;
  if (weigh) { next.enabled = true; next.setEffectiveWeight(1); }
  next.play();
  if (cur && cur !== next) cur.crossFadeTo(next, fade, false);
  return next;
}
