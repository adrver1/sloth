// Canopy Camp sloths, what the rest of the page gets of the camp sloths:
//   slothLife           for the operator and the player's modules, what only the camp sloths can do: path(from, to) (the
//                       sloths' path planner), lend and giveBack (lend.js), pose(s, clip, fade) (clips.js play: the pose
//                       of a lent sloth, kept as its s.act so giveBack fades it out), sloths (the named ones), eatGift (gifts.js).
//                       The operator reads all but eatGift, input.js eatGift. The places everyone shares (claims, movers,
//                       hosts) are camp/places.js, which the others import themselves.
//   labApi              what the move lab drives (lab.js imports it): each move on its own, and pois (the food places,
//                       read by tools/camp-scenarios.cjs, not by lab.js). Only what one of the two reads is in it (review R2-215).
//   addHooks()          makes both (sloths.js, once the camp sloths are built); they stay undefined with ?campsloths=0
import { holder } from "../places.js";
import { GROUND, camp, guests } from "./state.js";
import { clipNames, clipOf, homeClip, play, playOnce } from "./clips.js";
import { findPath } from "./walk.js";
import { doze } from "./naps.js";
import { pois } from "./table.js";
import { startCards } from "./cards.js";
import { eatGift } from "./gifts.js";
import { goHome, leave, wander } from "./day.js";
import { giveBack, lend } from "./lend.js";

let labApi, slothLife;   // undefined with ?campsloths=0
function addHooks() {
  slothLife = { path: findPath, lend, giveBack, pose: play, sloths: camp, eatGift };
  // the move lab (camp.html?lab, camp/lab.js): drives these to show each move on its own
  labApi = { camp, GROUND, leave: (s) => { s.wantFood = true; leave(s); }, goHome, wander, clipOf, clipNames, pois, smore: (s) => { s.smoreT = 0; }, wave: (s) => { s.wave = 1e-3; s.waveCD = 15; },
    fix: (s) => { if (s.spot.car && s.trip.phase === "home") { s.fixNext = true; leave(s); } },
    nap: (s) => { if (!s.dozing) doze(s); },
    guests: () => guests.map((g) => g.key),
    cards: (s) => { const mate = camp.find((q) => q !== s && q.trip.phase === "home" && !q.spot.guest && !q.spot.asleep); return mate && s.trip.phase === "home" && startCards(s, mate, leave); },
    napTrip: (s, key) => { if (s.trip.phase !== "home" || s.spot.guest) return; const g = guests.find((q) => q.key === key); if (g && !holder(key)) { s.napTo = g; leave(s); } }, wake: (s) => { if (s.dozing) s.dozeIn > 0 ? (s.dozeIn = 0.01, s.dozeT = 0) : (s.dozeT = 0); },
    yawn: (s) => { s.yawn = 1e-3; }, stretch: (s) => { const [c, ts] = homeClip(s); playOnce(s, "stretch", 1.2, () => play(s, c, 1.5, ts)); } };
}

export { addHooks, labApi, slothLife };
