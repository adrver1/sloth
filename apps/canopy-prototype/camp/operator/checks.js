// Canopy Camp operator, the hooks the checks drive and read him with (tools/camp-scenarios.cjs merges opChecks into its
// T.op beside operator.js opApi). No camp module imports this file: the tool loads it by path, so the camp never carries
// these. With ?op=0, or before operator.js has built him, opApi is null and the tool leaves them alone.
// Exports opChecks: one member per hook, each said on its own line below.
import { camera } from "../core.js";
import { trisIn } from "../util.js";
import { opApi } from "../operator.js";
import { clearSpot } from "./buddy.js";
import { jumpTo } from "./day.js";
import { FID_T } from "./fidget.js";
import { bowl, mug } from "./handProps.js";
import { clips, mixer, root } from "./model.js";
import { SEATS } from "./places.js";
import { op } from "./state.js";
import { opStep } from "./step.js";
import { chestOnScreen, gift, talk, tapCol } from "./talk.js";

const r2 = (v) => +v.toFixed(2);
const opChecks = {
  acts: clips,                                         // his clips by name (the dump lists the running ones)
  mixer,
  go: (k) => { op.next = k; },                         // this activity next, once the current one ends
  jump: jumpTo,                                        // this activity now: the current one stops cleanly first (day.js lifeStop)
  sim: (sec) => { for (let t = 0; t < sec; t += 0.05) opStep(0.05); return opApi.state(); },   // run his life ahead
  talk, gift,                                          // tap him and talk, give him the food in your hand
  get tapCol() { return tapCol; },                     // the invisible tap column round him (talk.js)
  tapAt: chestOnScreen,                                // his chest on screen, CSS pixels [x, y]
  clearSpot,                                           // the free spot on the floor before him (buddy.js)
  fid: (k) => { op.fid = { kind: k, t: 0, k: 0, T: FID_T[k] * 3 }; op.cd.fid = 99; },   // this fidget now, held three times as long
  cd: (o) => { for (const k of ["cook", "join", "react"]) if (k in o) op.cd[k] = o[k]; },   // set his wait before cooking, joining you, remarking
  seats: () => SEATS.map((s) => [s.key, s.at.toArray().map(r2)]),
  tris: () => trisIn(root),
  // why he does or does not remark on what you did (talk.js react)
  why: () => ({ sl: op.sleeping, ly: op.lying, talk: op.talk.t, munch: op.talk.munch, cd: op.cd.react, carry: !!op.carry, cam: camera.position.distanceTo(root.position) }),
  // the prop in his hand, and every clip with weight on him by its effective weight (a paused one too, like the held smile)
  dbg: () => ({
    inHand: op.inHand && [op.inHand === bowl ? "bowl" : op.inHand === mug ? "mug" : op.inHand.name, op.inHand.visible, op.inHand.position.toArray().map(r2), !!op.inHand.parent],
    w: Object.entries(clips).filter(([, a]) => a.isScheduled() && a.getEffectiveWeight() > 0).map(([n, a]) => n + ":" + a.getEffectiveWeight().toFixed(2) + "@" + a.time.toFixed(2)),
  }),
};

export { opChecks };
