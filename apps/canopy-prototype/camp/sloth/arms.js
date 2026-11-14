// Canopy Camp sloths, the arms, posed on the bones after the clip has run:
//   aimBone(bone, dir, w)   turns a bone (it points along its own +Y) toward the world direction dir, by the weight w
//   giftArm(s)              the right arm reaches out for a gift and brings it to the lips (gifts eaten away from the eat clip)
import * as THREE from "three";
import { V, sstep } from "../util.js";
import { FACE, mouthOf } from "./face.js";

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), q1 = new THREE.Quaternion(), vb = V(), UPV = V(0, 1, 0);
function aimBone(b, dir, w) {                          // turn bone b (it points along its own +Y) toward world dir, by w
  const bq = b.getWorldQuaternion(qa), y = vb.copy(UPV).applyQuaternion(bq);
  qb.setFromUnitVectors(y, dir).slerp(q1.identity(), 1 - w).multiply(bq);
  b.quaternion.copy(b.parent.getWorldQuaternion(q1).invert().multiply(qb));
}
// a gift eaten away from the eat clip (giftFly, in the life code below): a two-bone reach of the right arm, out in front to
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

export { aimBone, giftArm };
