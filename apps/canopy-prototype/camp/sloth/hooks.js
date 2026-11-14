// Canopy Camp sloths, what the rest of the page gets of the camp sloths, on window (the modules that still read these are
// another branch's to change; the checks in tools/ read them too):
//   window.__campLife   for the camp's other characters and the player's modules: the places (places.js claim, release,
//                       holder, host, addMover, movers), path(from, to), lend and giveBack (lend.js), sloths (the named
//                       ones), eatGift (gifts.js). operator.js reads all but eatGift, jeepSeat.js claim and release,
//                       input.js eatGift
//   window.__lab        labApi, what the move lab drives (lab.js imports it; the global is for checks): each move on its own
//   window.__spots, __sloth(i), __errand(name), __path(from, to)   for checks
//   addHooks()          sets them all (sloths.js, once the camp sloths are built); nothing is set with ?campsloths=0
import { addMover, claim, holder, host, movers, release } from "../places.js";
import { GROUND, camp, guests, sloths, spots } from "./state.js";
import { clipOf, homeClip, play, playOnce } from "./clips.js";
import { findPath, isFree, walkTo } from "./walk.js";
import { doze } from "./naps.js";
import { pois } from "./table.js";
import { startCards } from "./cards.js";
import { eatGift } from "./gifts.js";
import { goHome, leave, wander } from "./day.js";
import { giveBack, lend } from "./lend.js";

let labApi;   // undefined with ?campsloths=0
function addHooks() {
  window.__campLife = { claim, release, holder, addMover, host, movers, path: (from, to) => findPath(from, to), lend, giveBack, sloths: camp, eatGift };
  window.__spots = spots; window.__sloth = (i) => sloths[i];
  window.__errand = (name) => { const s = camp.find((q) => q.name === name); if (s && s.trip.phase === "home") { s.wantFood = true; leave(s); } return s; };
  window.__path = findPath;
  // the move lab (camp.html?lab, camp/lab.js): drives these to show each move on its own
  labApi = window.__lab = { camp, GROUND, leave: (s) => { s.wantFood = true; leave(s); }, goHome, wander, walkTo, clipOf, pois, isFree, smore: (s) => { s.smoreT = 0; }, wave: (s) => { s.wave = 1e-3; s.waveCD = 15; },
    fix: (s) => { if (s.spot.car && s.trip.phase === "home") { s.fixNext = true; leave(s); } },
    nap: (s) => { if (!s.dozing) doze(s); },
    guests: () => guests.map((g) => g.key),
    cards: (s) => { const mate = camp.find((q) => q !== s && q.trip.phase === "home" && !q.spot.guest && q.spot.name !== "hammock"); return mate && s.trip.phase === "home" && startCards(s, mate, leave); },
    napTrip: (s, key) => { if (s.trip.phase !== "home" || s.spot.guest) return; const g = guests.find((q) => q.key === key); if (g && !holder(key)) { s.napTo = g; leave(s); } }, wake: (s) => { if (s.dozing) s.dozeIn > 0 ? (s.dozeIn = 0.01, s.dozeT = 0) : (s.dozeT = 0); },
    yawn: (s) => { s.yawn = 1e-3; }, stretch: (s) => { const [c, ts] = homeClip(s); playOnce(s, "stretch", 1.2, () => play(s, c, 1.5, ts)); } };
}

export { addHooks, labApi };
