// Canopy Camp operator: the bearded operator from desk-at-night (engine/characters/bearded_operator in its camp_cargo
// outfit, packed into models/operator.txt, with the clips of his survival build in models/operator_anims.txt) living in the camp. He goes about
// his day: soup from the pot on a log seat, a mug from the kitchen crate, a book, warming his hands at the fire, a stroll,
// sleep in the tent bed, making the soup, and playing with a sloth (holds it up into the wind, flies it overhead). He shares
// the camp with the sloths through camp/places.js and sloth/hooks.js slothLife: he claims the places he uses, registers as a mover
// and steers round the others, and a sloth that comes to his seat or his bed joins him there (a cuddle on his lap, a nap on
// his chest).
// buildOperator() (main.js, once the sloths and the chores are in) waits for his two downloads and starts him by the fire
// (operator/start.js startOperator, which the Summit Cabin calls too), and sets opApi.
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
import { V, yawTo } from "./util.js";
import { startOperator } from "./operator/start.js";
import { opStep } from "./operator/step.js";

let opApi = null;
async function buildOperator() {
  if (!OPT.op) return;
  const [OP, ANIM] = await Promise.all([PRE.operator, PRE.operatorAnims]);
  // start: standing by the woodpile side of the fire, looking at it
  const p = V(Math.cos(A0 + 0.9) * 2.6, 0, Math.sin(A0 + 0.9) * 2.6);
  opApi = startOperator(OP, ANIM, p, yawTo(p.clone().negate()));   // what audio.js (his sounds) and lab.js read
}

export { buildOperator, opApi, opStep };
