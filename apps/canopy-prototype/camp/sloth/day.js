// Canopy Camp sloths, a camp sloth's day (Adriaen 2026-11-12): every camp sloth now and then leaves its spot (no more than
// MAX_OUT at once), crawls to the snack table or the kitchen crate, sits and eats there, sometimes wanders off for a sit
// and a look round, then goes home the way it first came. Now and then the errand is a game of cards (cards.js), a nap
// somewhere cozy (a guest spot, spots.js), the jeep's engine (fix.js) or a bowl you set down.
//   leave(s)                    s gets up and backs out of its spot (wayOut.js), then goes on its errand
//   goHome(s)                   walks to its spot's door and in (wayIn.js); the jeep's sloth wanders on while you drive
//   wander(s)                   walks to a free point in the clearing for a sit and a look round (often a nap), or to the
//                               log the operator sits on, to sit with him
//   homeStep(s, sd, spot, out)  at home, each frame: s'mores on the seat, naps, the wait for its next errand; out: how many
//                               are away now. Returns how many it sent off (0, 1, or 2 for a game of cards)
//   restStep(s, T, sd)          the rest phase: sitting in the clearing, often a nap there, then home
//   watchFood()                 listens for food you put out (activities.js, window event "camp-food" {kind, at}): the
//                               nearest sloth that is awake at its own home and doing nothing else comes over to eat it
//                               (none comes if all are busy or asleep)
// What it does next, where it wanders and how long it sits draw from the sloths' stream (core.js rng("sloths")) as they happen.
import { jeepApi } from "../jeep.js";
import { rng, scene } from "../core.js";
const { R } = rng("sloths");
import { V, yawFrom } from "../util.js";
import { RC } from "../layout.js";
import { bedKey, claim, holder, hosted, join, seatKey, seatLog, taken } from "../places.js";
import { CRAWL, MAX_OUT, camp, guests } from "./state.js";
import { moveBack, moveInto, releaseHome } from "./spots.js";
import { play } from "./clips.js";
import { yawQ } from "./poses.js";
import { glide } from "./moves.js";
import { isFree, walkTo } from "./walk.js";
import { doze, napStep, wakeUp } from "./naps.js";
import { pois } from "./table.js";
import { startEat } from "./eating.js";
import { startCards } from "./cards.js";
import { fixEngine } from "./fix.js";
import { smoreStep } from "./smore.js";
import { exitSpot } from "./wayOut.js";
import { enterSpot } from "./wayIn.js";

// a free point in the clearing at least 1.2 m (on the ground plane) from every camp sloth. o.p is where each one is in the
// world; o.o.position is local for one in the hammock, the seat, the jeep or the tent (review R2-047).
function wanderPoint() {
  for (let k = 0; k < 60; k++) {
    const a = R(0, 2 * Math.PI), r = R(2.6, RC - 2), p = V(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (isFree(p) && camp.every((o) => Math.hypot(o.p.x - p.x, o.p.z - p.z) > 1.2)) return p;
  }
  return V(3, 0, -2);
}
// leaving home: back out of its spot the way it came in, onto the ground, then off on its errand
function leave(s) {
  if (s.gift?.clip) { scene.remove(s.gift.mesh); s.gift = null; s.once = null; }   // never left eating: the eat clip's end would never come
  const spot = s.spot; spot.home = false; s.trip = { phase: "glide", t: 0, yaw: 0 }; releaseHome(s);
  wakeUp(s); s.yawn = 0; s.roused = null; if (s.mouth) s.mouth.visible = false;
  exitSpot(s, () => errand(s));
}
const fed = (s) => () => { R(0, 1) < 0.35 ? wander(s) : goHome(s); };   // after a meal: a wander, or home
function errand(s) {                                // a place at the table or the crate with a fruit there (or a wander)
  const bowl = s.food; s.food = null;               // a bowl is for this errand only: one it does not go to is forgotten
  if (s.ownSpot) { moveBack(s); return goHome(s); }   // back from a nap trip
  if (s.cardsTo) { const slot = s.cardsTo; s.cardsTo = null; walkTo(s, slot.p, () => { startEat(s, slot, () => goHome(s)); s.trip.cards = true; }); s.trip.slot = slot; return; }   // trip.slot: lend() frees it
  if (s.napTo) { const g = s.napTo; s.napTo = null; moveInto(s, g); return goHome(s); }
  const want = s.wantFood; s.wantFood = false;   // the lab's Get food: no nap trip and no engine fix this time (R2-045)
  if (!want && !bowl && R(0, 1) < 0.3 && napTrip(s)) return;
  if (bowl) {                                       // a bowl you set down (activities' "camp-food"): eat from it there
    const at = bowl, u = V(at.x, 0, at.z).normalize(), g = V(at.x, 0, at.z).addScaledVector(u, 0.9);
    const slot = { name: "bowl", p: g, u, yaw: Math.atan2(u.x, u.z), clip: "eat", who: s, h: 0, food: { at: at.clone().setY(at.y + 0.05), mesh: null, bowl: true } };
    return walkTo(s, g, () => startEat(s, slot, fed(s)));
  }
  if (s.spot.car && jeepApi?.node?.getObjectByName("Hood") && (s.fixNext || (!want && R(0, 1) < 0.45)) && claim("jeep:hood", s)) { s.fixNext = false; return fixEngine(s, () => goHome(s)); }
  const free = pois().flatMap((P) => P.slots.filter((q) => !q.who && !taken(q.key) && q.food.mesh.visible && !q.food.back && (q.name === "table" || s.sc > 1.6)));   // the small ones can't reach over the crate's rim
  if (!free.length) return wander(s);
  const slot = free[Math.floor(R(0, free.length))]; slot.who = s; claim(slot.key, s);
  walkTo(s, slot.p, () => startEat(s, slot, fed(s))); s.trip.slot = slot;   // trip.slot: lend() frees the place if he borrows it on the way
}
function wander(s) {
  const i = [1, 2].find((k) => holder(seatKey(k)) === "operator" && hosted(seatKey(k))), lg = i && seatKey(i);   // he's on a log: now and then go and sit with him
  if (lg && R(0, 1) < 0.25) { const o = seatLog(i); if (o) { const c = o.position.clone().setY(0); return walkTo(s, c.clone().setLength(c.length() + 0.8), () => { if (!join(lg, s)) goHome(s); }); } }
  walkTo(s, wanderPoint(), () => { Object.assign(s.trip, { phase: "rest", t: 0, dur: R(5, 9), nap: R(0, 1) < 0.55 }); play(s, "idle", 1.2); });
}
const youDrive = () => holder("jeep:driver") === "player";   // you in the jeep's driver seat (jeepSeat.js): its sloth waits
function goHome(s) {
  const spot = s.spot;
  if (spot.car && youDrive()) return wander(s);   // a wander and a sit, then it tries again
  walkTo(s, spot.via ?? spot.door, () => {
    if (!spot.via) return arrive(s);
    const T = s.trip, yaw = yawFrom(spot.via, spot.door); T.yaw = yaw;
    glide(s, { p: spot.door.clone(), q: yawQ(yaw) }, spot.door.distanceTo(spot.via) / (CRAWL * s.sc), () => { s.trip.yaw = yaw; arrive(s); });
  });
}
function arrive(s) {                                // at its spot's door (a car spot is never a branch or a post climb)
  const spot = s.spot; s.o.position.copy(spot.door);
  if (spot.car && youDrive()) return wander(s);   // you got in while it was on its way
  enterSpot(s);
}
// nap trips (Adriaen 2026-11-12): now and then an errand is a nap somewhere cozy instead of food. The sloth goes there by
// its route (as if it were its home), sleeps a long while, then leaves the same way and goes home. A place the operator
// is using may still take it (places.js join), else it picks another.
function napTrip(s) {                               // a cozy place free (or shared with the operator); false if none
  const own = s.spot, ok = guests.filter((g) => !(g.car && youDrive()) && !(g.name === own.name && own.name !== "tent") && (s.sc < 2.0 || g.name !== "hammock"));
  let pick = ok[Math.floor(R(0, ok.length))]; if (!pick) return false;
  const b0 = holder(bedKey(0)); if (pick.key === bedKey(1) && b0 && !camp.includes(b0)) pick = guests.find((g) => g.key === bedKey(0));   // he lies along the whole bed
  const h = holder(pick.key);
  if (h && camp.includes(h)) return false;
  if (h) { walkTo(s, pick.via ?? pick.door, () => { if (!join(pick.key, s)) goHome(s); }); return true; }   // he's in it: ask to join him
  moveInto(s, pick);
  goHome(s); return true;
}
function homeStep(s, sd, spot, out) {
  if (spot.name === "seat") smoreStep(s, sd);
  napStep(s, sd, s.spot.guest ? () => leave(s) : undefined);
  s.errand -= sd;
  if (s.errand < 0 && !s.smore && !s.wave && !s.dozing && !s.roused && !s.once) {
    const mate = R(0, 1) < 0.2 && out < MAX_OUT - 1 && camp.find((q) => q !== s && q.trip.phase === "home" && !q.dozing && !q.smore && !q.gift && !q.spot.guest && q.spot.name !== "hammock");
    if (mate && s.spot.name !== "hammock" && startCards(s, mate, leave)) return 2;
    if (out < MAX_OUT) { leave(s); return 1; }
    s.errand = R(6, 15);
  }
  return 0;
}
function restStep(s, T, sd) {                       // a sit and a look round somewhere in the clearing; often a nap there
  if (T.nap && !T.slept && T.t > 2) { T.slept = true; doze(s, R(25, 50)); }
  if (T.slept) napStep(s, sd, () => goHome(s));
  else if (T.t > T.dur) goHome(s);
}
function watchFood() {
  addEventListener("camp-food", (e) => {
    const at = e.detail?.at; if (!at) return;
    // awake at its own home and doing nothing else (one napping on a guest spot goes home first, and its errand is spent)
    const s = camp.filter((q) => q.trip.phase === "home" && !q.spot.guest && !q.asleep && !q.dozing && !q.roused && !q.once && !q.smore && !q.wave && !q.gift).sort((a, b) => a.p.distanceTo(at) - b.p.distanceTo(at))[0];
    if (s) { s.food = at.clone(); leave(s); }
  });
}

export { goHome, homeStep, leave, restStep, wander, watchFood };
