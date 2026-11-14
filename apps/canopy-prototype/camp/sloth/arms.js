// Canopy Camp sloths, the arms, posed on the bones after the clip has run:
//   giftArm(s)              the right arm reaches out for a gift and brings it to the lips (gifts eaten away from the eat clip)
// and read off them:
//   armBones(o, side)       the upper arm and forearm bones of the model o, side "R" or "L"
//   pawOf(s, out, arm)      where a paw is in the world: the end of the forearm (it bends 55 % of the way down the arm);
//                           the right paw (s.arm) unless another arm is given
//   lpawOf(s, out)          the left paw
import * as THREE from "three";
import { V, sstep } from "../util.js";
import { aimBone } from "../actor.js";
import { FACE, mouthOf } from "./face.js";

const qa = new THREE.Quaternion(), vb = V(), UPV = V(0, 1, 0);
// the two bones of an arm in a sloth model o, side "R" or "L" (the rig's names came with and without a dot)
const armBones = (o, side) => [o.getObjectByName(`upper_arm${side}`) || o.getObjectByName(`upper_arm.${side}`), o.getObjectByName(`forearm${side}`) || o.getObjectByName(`forearm.${side}`)];
const shoulder = V(), elbow = V(), qPaw = new THREE.Quaternion();
const pawOf = (s, out, arm = s.arm) => {             // the end of the forearm (it bends 55 % of the way down the arm)
  arm[0].getWorldPosition(shoulder); arm[1].getWorldPosition(elbow);
  return out.copy(UPV).applyQuaternion(arm[1].getWorldQuaternion(qPaw)).multiplyScalar(shoulder.distanceTo(elbow) * 0.82).add(elbow);
};
const lpawOf = (s, out) => pawOf(s, out, s.armL);
// a gift eaten away from the eat clip (gifts.js giftFly): a two-bone reach of the right arm, out in front to
// take it, then up to the lips; the paw is at 0.82 of the forearm (pawOf)
const gS = V(), gE = V(), gGoal = V(), gDir = V(), gPerp = V(), gM = V();
function giftArm(s) {
  const G = s.gift, t = G.t, w = sstep(0, 0.5, t) * (1 - sstep(3.6, 4.2, t)); if (!s.armRest) s.armRest = [s.arm[0].quaternion.clone(), s.arm[1].quaternion.clone()];
  if (w <= 0) return;
  const [up, fo] = s.arm; up.getWorldPosition(gS); fo.getWorldPosition(gE);
  const l1 = gS.distanceTo(gE), l2 = l1 * 0.82, face = vb.copy(FACE).applyQuaternion(s.head.getWorldQuaternion(qa));
  mouthOf(s).getWorldPosition(gM);
  const bite = Math.max(0, Math.sin((t - 1.2) / 0.6 * Math.PI * 2));   // the paw in to the lips at each bite
  const take = gM.clone().addScaledVector(face, 1.1 * l1).addScaledVector(UPV, -0.6 * l1), lips = gM.clone().addScaledVector(face, (0.35 - 0.12 * bite) * l1).addScaledVector(UPV, -0.25 * l1);
  gGoal.copy(take).lerp(lips, sstep(0.8, 1.3, t));
  const d = Math.min(Math.max(gS.distanceTo(gGoal), 0.01), (l1 + l2) * 0.999);
  gDir.copy(gGoal).sub(gS).normalize(); gPerp.set(0, -1, 0).addScaledVector(gDir, gDir.y).normalize();   // the elbow down
  const a = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  aimBone(up, gDir.clone().multiplyScalar(Math.cos(a)).addScaledVector(gPerp, Math.sin(a)), w);
  up.updateMatrixWorld(true); fo.getWorldPosition(gE); aimBone(fo, gGoal.clone().sub(gE).normalize(), w);
}

export { armBones, giftArm, lpawOf, pawOf };
