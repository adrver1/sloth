// Canopy Camp operator: the bearded operator from desk-at-night (engine/characters/bearded_operator in its camp_cargo
// outfit, packed into models/operator.txt, with the clips of his survival build in models/operator_anims.txt) living in the camp. He goes about
// his day: soup from the pot on a log seat, a mug from the kitchen crate, a book, warming his hands at the fire, a stroll,
// sleep in the tent bed, making the soup, and playing with a sloth (holds it up into the wind, flies it overhead). He shares
// the camp with the sloths through camp/places.js and sloth/hooks.js slothLife: he claims the places he uses, registers as a mover
// and steers round the others, and a sloth that comes to his seat or his bed joins him there (a cuddle on his lap, a nap on
// his chest).
// buildOperator() (main.js, once the sloths and the chores are in) waits for his two downloads, builds his parts and sets
// opApi.
// The parts are in operator/: state.js (the one state object and its resets), model.js (mesh, clips, shadow), ik.js (reach
// and hands over a bone map), handProps.js, places.js, walk.js (walking, turning, sitting), buddy.js (with a sloth), day.js
// (his activities and what comes next), cook.js, lines.js (what he says), talk.js (the bubble, gifts, the tap column),
// handPose.js, fidget.js and headPose.js (the poses laid over the clip), step.js (each frame) and checks.js (the checks'
// hooks, loaded only by the tools).
// Repack after a change in desk-at-night (engine/) with npm run pack:operator (tools/pack-chars.cjs, which holds the list of
// clips the camp plays; only those are packed, review R2-213: add a new clip there).
// ?op=0 leaves him out: nothing of him is made. Exports buildOperator(), opStep (main.js, each frame) and opApi (null with
// ?op=0, or until he is built): his root, his state object op, state() (a short summary) and line() (what his bubble says),
// read by audio.js for his sounds and by lab.js. The hooks the checks drive him with are operator/checks.js opChecks.
import { OPT, PRE } from "./core.js";
import { A0 } from "./layout.js";
import { addMover } from "./places.js";
import { V, yawTo } from "./util.js";
import { buildHandProps } from "./operator/handProps.js";
import { buildSleepZ } from "./operator/headPose.js";
import { buildModel, cur, play, root } from "./operator/model.js";
import { RADIUS, op } from "./operator/state.js";
import { buildRest, opStep } from "./operator/step.js";
import { buildTalk, saying } from "./operator/talk.js";

let opApi = null;
// his state in short, for his sounds and the checks
const state = () => ({ kind: op.kind, at: root.position.toArray().map((v) => +v.toFixed(2)), place: op.place, seated: op.seated, lying: op.lying,
  sleeping: op.sleeping, buddy: op.buddy?.name ?? null, clip: cur?.getClip().name });
async function buildOperator() {
  if (!OPT.op) return;
  const [OP, ANIM] = await Promise.all([PRE.operator, PRE.operatorAnims]);
  // his parts: the model first (the others hang off its bones), then what he holds, his Z's, the clip's rest pose, his bubble
  buildModel(OP, ANIM);
  buildHandProps();
  buildSleepZ(); buildRest();
  buildTalk();

  // start: standing by the woodpile side of the fire, looking at it
  const p = V(Math.cos(A0 + 0.9) * 2.6, 0, Math.sin(A0 + 0.9) * 2.6); root.position.copy(p); root.rotation.y = yawTo(p.clone().negate());
  play("idle", 0);
  addMover(root, RADIUS);   // a mover in camp/places.js from the start, so the sloths steer round him (review R2-064)
  // what audio.js (his sounds) and lab.js read; the checks' hooks are in operator/checks.js (review R2-121)
  opApi = { root, op, state, line: saying };
}

export { buildOperator, opApi, opStep };
