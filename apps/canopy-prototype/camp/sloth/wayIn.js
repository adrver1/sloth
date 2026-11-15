// Canopy Camp sloths, the way into a spot, and being at home there.
//   placeHome(s)                straight into its spot s.spot, as if it had always lived there (the start, and a saved nap)
//   enterSpot(s)                at its spot's door on the ground: in, the way each spot is reached: up the tree and along
//                               the branch, up the post (then the rope into the hammock, or along the laundry line), in
//                               through the jeep's door, or straight up onto its seat or into the tent
//   atHome(s, first)            (inside) it has arrived: it claims its place ("seat:Sunny") and gets the time to its next errand; a
//                               guest (a nap trip) goes straight to sleep; first: placed there at the start
//   doorStep(s, T, sd)          the door phase (the jeep): waits for its door, then up onto the sill (T.sill, in the world) and in
//   doorShutStep(sd)            each frame (step.js campStep): shuts the jeep's door 1.5 s (at the sloths' pace) after a sloth
//                               got in, a countdown in game time instead of a wall-clock setTimeout (review R2-118)
// Every other step of the way in is a slide or a glide (moves.js): up the trunk and along the branch, up the post, round
// onto the rope or the line and along it, and the settle into the spot, growing or shrinking to its size there (spots.js
// sizeIn: the spot's size times the sloth's own factor s.k).
// The times to the next errand and the next nap draw from the sloths' day stream (core.js rng("slothDay")) as they happen.
import { jeepApi } from "../jeep.js";
import { rng } from "../core.js";
const { R } = rng("slothDay");
import { yawFrom } from "../util.js";
import { HAMMOCK, LAUNDRY } from "../layout.js";
import { HW, HW_POST, setTrip } from "./state.js";
import { clipOf, play } from "./clips.js";
import { UP, barkOf, linePose, postPose, ropeLen, ropePose, trunkAt, turnTo, underAt, yawQ } from "./poses.js";
import { climbV, glide, postV, slide } from "./moves.js";
import { brush, claimHome, sizeIn } from "./spots.js";
import { doze } from "./naps.js";

let doorShut = 0;                                    // seconds (at the sloths' pace) until the jeep's door "P" swings shut
function atHome(s, first) {
  setTrip(s, "home"); s.spot.home = true;
  if (s.spot.guest) { s.errand = 1e9; doze(s, R(60, 120)); s.dozeIn = 1.2; }   // a nap trip: straight to sleep
  else {
    claimHome(s);
    s.errand = first ? R(4, 45) : R(35, 80) * (s.spot.asleep || s.spot.car ? 1.6 : 1);
    if (s.spot.asleep) { if (first) { s.dozing = s.asleep = true; s.eyes(true); s.dozeT = R(30, 150); s.dozeIn = 0; } else { doze(s, R(90, 180)); s.dozeIn = 1.5; } }   // Hibi: back in the hammock, a yawn and a long nap
  }
  if (s.spot.car && !first) doorShut = 1.5;          // in through the jeep's door: it shuts behind it (doorShutStep)
}
function doorShutStep(sd) { if (doorShut > 0 && (doorShut -= sd) <= 0) jeepApi?.close("P"); }
function placeHome(s) {                             // straight into its spot, as if it had always lived there
  const spot = s.spot; s.sc = sizeIn(s, spot); s.o.scale.setScalar(s.sc); s.act = s.mixer.existingAction(clipOf("cling"));
  setTrip(s, "home", { yaw: 0 });
  if (spot.branch || spot.line) {
    const P = spot.line ? linePose(s, spot.t) : underAt(s, spot.curve.getPointAt(spot.t), spot.curve.getTangentAt(spot.t));
    s.o.position.copy(P.p); s.o.quaternion.copy(P.q);
  } else {
    spot.parent.add(s.o); s.o.position.copy(spot.at); s.o.quaternion.copy(yawQ(spot.yaw));
    play(s, spot.clip, 0.01);
  }
  atHome(s, true);
}
function climbUp(s, spot) {                          // up the trunk and out along the branch to its tip
  const { curve: c, t, t0, tree, out } = spot, L = c.getLength(), yTop = c.getPointAt(t0).y - 0.25 * s.sc, bark = barkOf(spot);
  play(s, "hang_walk", 1.5, HW);
  glide(s, trunkAt(s, tree, out, 0.02, bark), 2.5, () => slide(s, 0.02, yTop, climbV(s), (y, sd, P) => trunkAt(s, tree, out, y, bark, P), () =>
    glide(s, underAt(s, c.getPointAt(t0), c.getTangentAt(t0)), 3, () => slide(s, t0, t, climbV(s) / L, (u, sd, P) => underAt(s, c.getPointAt(u, P.at), c.getTangentAt(u, P.dir), P),
      () => { play(s, "cling", 3, 0.6); atHome(s); }))));
}
function settleIn(s, fade) {                         // about 4 s (6 into the hammock): up into its spot, growing or shrinking to its size there
  const spot = s.spot; spot.parent.attach(s.o); play(s, spot.clip, fade);
  glide(s, { p: spot.at, q: yawQ(spot.yaw), lift: spot.climb || spot.noHop ? 0 : 0.12, sc: sizeIn(s, spot) }, spot.climb ? 6 : 4, () => atHome(s));
}
// up the post hand over hand until its arms reach the rope knot (or the line), then round to hang under the rope and down
// it into the sling, or along the line to its gap (wayOut.js exitSpot is the same the other way)
function upPost(s, spot) {
  const top = spot.top ?? HAMMOCK.pivot - 0.2 * s.sc, L = LAUNDRY.a.distanceTo(LAUNDRY.b);
  const along = () => spot.line
    ? slide(s, 0.05, spot.t, postV(s) / L, (u, sd, P) => { linePose(s, u, P); brush?.(P.at, true, sd); return P; }, () => { play(s, "cling", 3, 0.6); atHome(s); })
    : slide(s, 0.1, ropeLen() - 0.05, postV(s), (u, sd, P) => ropePose(s, u, P), () => settleIn(s, 3));
  play(s, "hang_walk", 1.2, HW_POST);
  glide(s, postPose(spot, 0), 1.2, () => slide(s, 0, top, postV(s), (y, sd, P) => postPose(spot, y, P), () => {   // round to face the post, then up
    spot.parent.attach(s.o);
    glide(s, spot.line ? linePose(s, 0.05) : ropePose(s, 0.1), 3, along);   // about 3 s: round from the post to hang under the rope or the line
  }));
}
function enterSpot(s) {                             // at its spot's door: in the way each spot is reached
  const spot = s.spot;
  if (spot.branch) return climbUp(s, spot);
  if (spot.climb) return upPost(s, spot);
  if (spot.car) { setTrip(s, "door", { sill: spot.parent.localToWorld(spot.sill.clone()) }); jeepApi.open("P"); return; }   // the jeep stands still
  settleIn(s, 2.5);
}
function doorStep(s, T, sd) {                       // waits, facing the door, until it has swung open, then about 4 s up onto the sill
  const J = jeepApi, sill = T.sill;
  turnTo(T, yawFrom(s.o.position, sill), sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
  if (!J.isOpen("P")) J.open("P");
  else if (T.t > 2) { play(s, "hang_walk", 1, 2); glide(s, { p: sill, lift: 0.1, tip: -0.5 }, 4, () => settleIn(s, 3)); }   // hauls itself up, facing T.yaw
}

export { doorShutStep, doorStep, enterSpot, placeHome };
