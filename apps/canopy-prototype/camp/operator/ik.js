// Canopy Camp operator, bones after the clip: a two-bone reach for an arm, and a hand's rotation from where its fingers and
// palm should point. Pure functions over a bone map B (the rig's names: upper_armL, forearmL, handL and the same with R);
// they know nothing of the operator's state, so another character on this rig could use them. reach aims the bones with
// actor.js aimBone, which the sloths share.
// Exports reach(B, side, target, pole, w), handQuat(side, fingers, palm, out), turnHand(B, side, q, w) and THUMB, the hands'
// local thumb axes (handPose.js); PALM, the palm axes, is used only here.
import * as THREE from "three";
import { V } from "../util.js";
import { aimBone } from "../actor.js";
import { toStage } from "../stage.js";

const Y = V(0, 1, 0);                                  // a bone points along its own +Y
// scratch, so a reach or a hand pose allocates nothing (review R2-019); the arguments are only read
const vs = V(), ve = V(), vh = V(), vg = V(), vd = V(), vp = V(), vu = V();
export function reach(B, side, target, pole, w = 1) {   // two-bone reach: put the wrist at target (in the stage's frame, stage.js), the elbow toward pole
  if (w <= 0) return;
  const up = B["upper_arm" + side], fo = B["forearm" + side], ha = B["hand" + side];
  const s = toStage(up.getWorldPosition(vs)), e = toStage(fo.getWorldPosition(ve)), h = toStage(ha.getWorldPosition(vh));
  const l1 = s.distanceTo(e), l2 = e.distanceTo(h);
  const goal = vg.copy(h).lerp(target, w), d = Math.min(Math.max(s.distanceTo(goal), 0.05), l1 + l2 - 0.002);
  const dir = vd.copy(goal).sub(s).normalize(), perp = vp.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), a = Math.acos(Math.min(1, Math.max(-1, ca)));
  const u = vu.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a));
  aimBone(up, u); const elbow = s.addScaledVector(u, l1); aimBone(fo, goal.sub(elbow).normalize());
}
// turn a hand so its fingers point along world dir `fingers` with the palm facing world dir `palm` (by w). The rig's hands: fingers
// along +Y, the palm on local (1,0,-1) for the left hand and (-1,0,-1) for the right, the thumb and index side on (±1,0,1)
const PALM = { L: V(1, 0, -1).normalize(), R: V(-1, 0, -1).normalize() };
export const THUMB = { L: V(1, 0, 1).normalize(), R: V(-1, 0, 1).normalize() };
const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), qh = new THREE.Quaternion();
export function handQuat(side, fingers, palm, out = new THREE.Quaternion()) {   // the world rotation of that hand pose, into out
  const y = vs.copy(fingers).normalize(), p = ve.copy(palm).addScaledVector(y, -palm.dot(y)).normalize(), c = vh.crossVectors(y, p);
  const yl = Y, pl = PALM[side], cl = vg.crossVectors(yl, pl);
  mA.makeBasis(y, p, c); mB.makeBasis(yl, pl, cl).transpose(); return out.setFromRotationMatrix(mA.multiply(mB));
}
export function turnHand(B, side, q, w = 1) {             // after the arm's reach: set the hand's world rotation q
  const h = B["hand" + side]; h.parent.getWorldQuaternion(qh).invert().multiply(q); h.quaternion.slerp(qh, w);
}
