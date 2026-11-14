// Canopy Camp operator: the bearded operator from desk-at-night (engine/characters/bearded_operator, packed into
// models/operator.txt, with the clips of his survival build in models/operator_anims.txt) living in the camp. He goes about
// his day: soup from the pot on a log seat, a mug from the kitchen crate, a book, warming his hands at the fire, a stroll,
// sleep in the tent bed, making the soup, and playing with a sloth (holds it up into the wind, flies it overhead). He shares
// the camp with the sloths through their camp life (sloth/hooks.js campLife): he claims the places he uses, registers as a mover
// and steers round the others, and a sloth that comes to his seat or his bed joins him there (a cuddle on his lap, a nap on
// his chest).
// This file waits for his two downloads, builds his parts in a fixed order and holds the hooks the checks drive him with.
// The parts are in operator/: state.js (the one state object and its resets), model.js (mesh, clips, shadow), ik.js (reach
// and hands over a bone map), handProps.js, places.js, walk.js (walking, turning, sitting), buddy.js (with a sloth), day.js
// (his activities and what comes next), cook.js, lines.js (what he says), talk.js (the bubble, gifts, the tap column),
// handPose.js, fidget.js and headPose.js (the poses laid over the clip) and step.js (each frame).
// Repack after a change in desk-at-night (engine/): in engine/web, node scripts/pack_chars.mjs <dir> ../characters/bearded_operator/bearded_operator.glb
// (mesh, no clips) and node scripts/pack_chars.mjs --clips idle,walk,seated_idle,stand_up,sip,hug,play,play_titanic,play_airplane,play_knees,wave,blink,happy,talk,phone,phone_down,step_down
// <dir2> ../characters/bearded_operator/bearded_operator_survival.glb (its anims.glb: the same rig, with the play clips), then base64 each into models/.
// ?op=0 leaves him out. Exports opStep (main.js, each frame) and opApi (null with ?op=0): his root, state and the hooks the
// checks drive him with (opApi.go("read"), .state()); window.__op is the same object.
import { OPT, PRE, camera } from "./core.js";
import { A0 } from "./layout.js";
import { V, trisIn } from "./util.js";
import { clearSpot, giveBack, unhost } from "./operator/buddy.js";
import { jumpTo } from "./operator/day.js";
import { FID_T } from "./operator/fidget.js";
import { bowl, buildHandProps, dropAll } from "./operator/handProps.js";
import { buildSleepZ } from "./operator/headPose.js";
import { buildModel, clips, cur, mixer, play, root } from "./operator/model.js";
import { SEATS, release } from "./operator/places.js";
import { op, reset, useLife } from "./operator/state.js";
import { buildRest, opStep } from "./operator/step.js";
import { buildTalk, gift, saying, talk, tapCol } from "./operator/talk.js";
import { yawTo } from "./actor.js";
import { campLife } from "./sloth/hooks.js";   // made when the sloths were built (sloths.js), before this module runs

const ON = OPT.op;
const [OP, ANIM] = ON ? await Promise.all([PRE.operator, PRE.operatorAnims]) : [null, null];
let opApi = null;

useLife(campLife);   // claims, movers and loans: operator/state.js life()

// built in this order, so every object, material and page element is made in the order it always was (with ?op=0 his root,
// his hand props, the bubble and the tap column are still made, as before, but nothing of him is shown or stepped)
buildModel(OP, ANIM);
buildHandProps();
if (ON) { buildSleepZ(); buildRest(); }
buildTalk(ON);

// start: standing by the woodpile side of the fire, looking at it
if (ON) {
  const p = V(Math.cos(A0 + 0.9) * 2.6, 0, Math.sin(A0 + 0.9) * 2.6); root.position.copy(p); root.rotation.y = yawTo(p.clone().negate());
  play("idle", 0);
  opApi = { root, op, acts: clips, mixer, go: (k) => { op.next = k; },
    dbg: () => ({ inHand: op.inHand && [op.inHand === bowl ? 'bowl' : 'mug', op.inHand.visible, op.inHand.position.toArray().map((v) => +v.toFixed(2)), !!op.inHand.parent], w: Object.entries(clips).filter(([, a]) => a.isRunning()).map(([n, a]) => n + ':' + a.getEffectiveWeight().toFixed(2) + '@' + a.time.toFixed(2)) }),
    state: () => ({ kind: op.kind, at: root.position.toArray().map((v) => +v.toFixed(2)), place: op.place, seated: op.seated, lying: op.lying, sleeping: op.sleeping, buddy: op.buddy?.name ?? null, clip: cur?.getClip().name }),
    talk, gift, tapCol, fid: (k) => { op.fid = { kind: k, t: 0, k: 0, T: FID_T[k] * 3 }; op.cd.fid = 99; }, cd: (o) => { if ("cook" in o) op.cd.cook = o.cook; if ("join" in o) op.cd.join = o.join; if ("react" in o) op.cd.react = o.react; }, clearSpot, line: saying, tapAt: () => op.scr, seats: () => SEATS.map((s) => [s.key, s.at.toArray().map((v) => +v.toFixed(2))]), why: () => ({ sl: op.sleeping, ly: op.lying, talk: op.talk.t, munch: op.talk.munch, cd: op.cd.react, carry: !!op.carry, cam: camera.position.distanceTo(root.position) }),
    sim: (sec) => { for (let t = 0; t < sec; t += 0.05) opStep(0.05); return opApi.state(); },   // run his life ahead (checks)
    tris: () => trisIn(root),
    // this activity now: whatever he held, hosted and claimed is let go and his body's state reset first
    jump: (k) => { if (op.buddy) giveBack(); dropAll(); unhost(); release(); reset("body"); root.rotation.set(0, root.rotation.y, 0); root.position.y = 0; play("idle", 0); jumpTo(k); } };
  // alias: audio.js reads window.__op for his sounds (it is evaluated before this module, while campLife.js waits for the ground
  // mask, so an import of opApi would move it and everything after it); the checks drive him through it too
  window.__op = opApi;
}

export { opApi, opStep };
