// Canopy Camp operator, starting him: his parts in a fixed order once his two downloads are in, then he stands at `at` facing
// `yaw`, idling, a mover in places.js from the start so the sloths steer round him (review R2-064). Every level that hosts
// him calls this (camp/operator.js, summit/life.js) and then opStep (step.js) each frame.
// Exports startOperator(gltf, anims, at, yaw): returns { root, op, state(), line() } (operator.js opApi: his sounds, the lab).
import { addMover } from "../places.js";
import { buildHandProps } from "./handProps.js";
import { buildSleepZ } from "./headPose.js";
import { buildModel, cur, play, root } from "./model.js";
import { RADIUS, op } from "./state.js";
import { buildRest } from "./step.js";
import { buildTalk, saying } from "./talk.js";

// his state in short, for his sounds and the checks
const state = () => ({ kind: op.kind, at: root.position.toArray().map((v) => +v.toFixed(2)), place: op.place, seated: op.seated, lying: op.lying,
  sleeping: op.sleeping, buddy: op.buddy?.name ?? null, clip: cur?.getClip().name });
function startOperator(gltf, anims, at, yaw) {
  // his parts: the model first (the others hang off its bones), then what he holds, his Z's, the clip's rest pose, his bubble
  buildModel(gltf, anims);
  buildHandProps();
  buildSleepZ(); buildRest();
  buildTalk();
  root.position.copy(at); root.rotation.y = yaw;
  play("idle", 0);
  addMover(root, RADIUS);
  return { root, op, state, line: saying };
}

export { startOperator };
