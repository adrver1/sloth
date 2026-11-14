// Canopy Camp characters, the parts the sloths (camp/sloth/) and the operator (camp/operator/) share (review operator-09):
// stateless functions over the object and the numbers they are handed, so each character keeps its own constants and does
// exactly what it did before. Nothing runs on import, no scene object is made and no random number is drawn.
//   aimBone(bone, dir, w = 1)   turns a bone (it points along its own +Y) toward the world direction dir, by the weight w
import * as THREE from "three";
import { V } from "./util.js";

const Y = V(0, 1, 0);                                  // a bone points along its own +Y
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), vb = V();
export function aimBone(b, dir, w = 1) {
  const bq = b.getWorldQuaternion(qa), y = vb.copy(Y).applyQuaternion(bq);
  qb.setFromUnitVectors(y, dir).slerp(qc.identity(), 1 - w).multiply(bq);
  b.quaternion.copy(b.parent.getWorldQuaternion(qc).invert().multiply(qb));
}
