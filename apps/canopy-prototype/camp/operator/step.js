// Canopy Camp operator, each frame: his day moves on a step, the clips pose him, his feet stay planted while he sits down
// or rises, then the poses laid over the clip in a fixed order (hands, a fidget, head and face), the tap column and the
// speech bubble follow him, his shadow goes under him and you are nudged out of him.
// Exports buildRest() (operator.js, after the Z's) and opStep(dt) (main.js, each frame; nothing with ?op=0, when he is not built).
import { groundAt, me, OPT, toStage } from "../stage.js";
import { V } from "../util.js";
import { lifeStep } from "./day.js";
import { fidgetStep } from "./fidget.js";
import { poseHands } from "./handPose.js";
import { poseHead } from "./headPose.js";
import { B, mixer, root } from "./model.js";
import { RADIUS, op } from "./state.js";
import { talkStep, tapCol } from "./talk.js";

// the bones touched after the clip, each with the clip's own pose for it (see opStep below)
let REST = [];
function buildRest() { REST = ["spine", "neck", "head", "chest", "upper_armR", "forearmR", "upper_armL", "forearmL", "handR", "handL"].map((n) => [B[n], B[n].quaternion.clone()]); }
const va = V(), vb = V(), vc = V();
function opStep(dt) {
  if (!OPT.op) return;
  lifeStep(dt);
  op.cd.react -= dt; op.cd.join -= dt; op.cd.cook -= dt;
  // the bones touched after the clip go back to the clip's pose first: three's mixer only writes a value when it changes (a held
  // clip, a bone no clip keys), so otherwise the touches below would stay or add up
  for (const [b, q] of REST) b.quaternion.copy(q);
  mixer.update(dt);
  for (const [b, q] of REST) q.copy(b.quaternion);
  if (op.footLock) {                                   // keep the feet where they are planted (sitting down, rising), moving the root instead
    root.updateMatrixWorld(true); const m = toStage(B.footL.getWorldPosition(va)).add(toStage(B.footR.getWorldPosition(vb))).multiplyScalar(0.5);
    root.position.add(vc.copy(op.footLock).sub(m));
  }
  root.updateMatrixWorld(true);
  poseHands(dt);      // after the clip: a sloth in his hands, reaches, the book, the hug, what he holds
  fidgetStep(dt);
  poseHead(dt);
  // the tap column follows his chest (seated or lying too), and the speech bubble follows his head
  toStage(B.chest.getWorldPosition(tapCol.position)); tapCol.scale.y = op.seated || op.lying ? 0.6 : 1; tapCol.position.y -= op.seated || op.lying ? -0.05 : 0.3; talkStep(dt);   // seated: just his body above the log, so the log's own tap does not win
  // his shadow on the ground, and a nudge so you can't walk through him
  const sh = root.userData.shadow; sh.position.set(root.position.x, groundAt(root.position.x, root.position.z) + 0.012, root.position.z); sh.visible = !op.lying && !op.seated;
  if (!op.lying) { const dx = me.pos.x - root.position.x, dz = me.pos.z - root.position.z, d = Math.hypot(dx, dz), lim = RADIUS + 0.25; if (d < lim && d > 1e-3) me.pos.set(root.position.x + dx / d * lim, me.pos.y, root.position.z + dz / d * lim); }
}

export { buildRest, opStep };
