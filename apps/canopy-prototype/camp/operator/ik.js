// Canopy Camp operator, bones after the clip: aim a bone, a two-bone reach for an arm, and a hand's rotation from where its
// fingers and palm should point. Pure functions over a bone map B (the rig's names: upper_armL, forearmL, handL and the
// same with R); they know nothing of the operator's state, so another character on this rig could use them.
// Exports aimBone(bone, dir, w), reach(B, side, target, pole, w), handQuat(side, fingers, palm), turnHand(B, side, q, w)
// and THUMB, the hands' local thumb axes (handPose.js); PALM, the palm axes, is used only here.
import * as THREE from "three";
import { V } from "../util.js";

const Y = V(0, 1, 0);                                  // a bone points along its own +Y
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), vb = V();
export function aimBone(b, dir, w = 1) {                      // turn bone b (it points along its own +Y) toward world dir, by w
  const bq = b.getWorldQuaternion(qa), y = vb.copy(Y).applyQuaternion(bq);
  qb.setFromUnitVectors(y, dir).slerp(qc.identity(), 1 - w).multiply(bq);
  b.quaternion.copy(b.parent.getWorldQuaternion(qc).invert().multiply(qb));
}
export function reach(B, side, target, pole, w = 1) {   // two-bone reach: put the wrist at world target, the elbow toward pole
  if (w <= 0) return;
  const up = B["upper_arm" + side], fo = B["forearm" + side], ha = B["hand" + side];
  const s = up.getWorldPosition(V()), e = fo.getWorldPosition(V()), h = ha.getWorldPosition(V());
  const l1 = s.distanceTo(e), l2 = e.distanceTo(h);
  const goal = h.clone().lerp(target, w), d = Math.min(Math.max(s.distanceTo(goal), 0.05), l1 + l2 - 0.002);
  const dir = goal.clone().sub(s).normalize(), perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), a = Math.acos(Math.min(1, Math.max(-1, ca)));
  const u = dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a));
  aimBone(up, u); const elbow = s.clone().addScaledVector(u, l1); aimBone(fo, goal.clone().sub(elbow).normalize());
}
// turn a hand so its fingers point along world dir `fingers` with the palm facing world dir `palm` (by w). The rig's hands: fingers
// along +Y, the palm on local (1,0,-1) for the left hand and (-1,0,-1) for the right, the thumb and index side on (±1,0,1)
const PALM = { L: V(1, 0, -1).normalize(), R: V(-1, 0, -1).normalize() };
export const THUMB = { L: V(1, 0, 1).normalize(), R: V(-1, 0, 1).normalize() };
const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), qh = new THREE.Quaternion();
export function handQuat(side, fingers, palm) {               // the world rotation of that hand pose
  const y = fingers.clone().normalize(), p = palm.clone().addScaledVector(y, -palm.dot(y)).normalize(), c = V().crossVectors(y, p);
  const yl = Y, pl = PALM[side], cl = V().crossVectors(yl, pl);
  mA.makeBasis(y, p, c); mB.makeBasis(yl, pl, cl).transpose(); return new THREE.Quaternion().setFromRotationMatrix(mA.multiply(mB));
}
export function turnHand(B, side, q, w = 1) {             // after the arm's reach: set the hand's world rotation q
  const h = B["hand" + side]; h.parent.getWorldQuaternion(qh).invert().multiply(q); h.quaternion.slerp(qh, w);
}
