// Canopy Camp sloths, the way into a spot, and being at home there.
//   placeHome(s)                straight into its spot s.spot, as if it had always lived there (the start, and a saved nap)
//   enterSpot(s)                at its spot's door on the ground: in, the way each spot is reached: up the tree and along
//                               the branch, up the post (then the rope into the hammock, or along the laundry line), in
//                               through the jeep's door, or straight up onto its seat or into the tent
//   atHome(s, first)            (inside) it has arrived: it claims its place ("seat:Sunny") and gets the time to its next errand; a
//                               guest (a nap trip) goes straight to sleep; first: placed there at the start
//   the phases of the way in, each frame (s, T, sd, spot): doorStep (waits for the jeep's door), clamberStep (up onto its
//   sill), climbStep (up a post), turnStep (round from the post to hang under the rope or the line), lineStep (along the
//   line), ropeStep (down the rope), settleStep (up into its spot, growing or shrinking to its size there)
// The times to the next errand and the next nap draw from the sloths' stream (core.js rng("sloths")) as they happen.
import * as THREE from "three";
import { jeepApi } from "../jeep.js";
import { rng } from "../core.js";
const { R } = rng("sloths");
import { V, ease, yawFrom } from "../util.js";
import { LAUNDRY } from "../layout.js";
import { HAMMOCK_PIVOT } from "../swing.js";
import { HW, HW_POST } from "./state.js";
import { clipOf, play } from "./clips.js";
import { UP, barkProfile, climbYaw, linePose, ropeLen, ropePose, trunkAt, turnTo, underAt } from "./poses.js";
import { climbV, glide, slide } from "./moves.js";
import { brush, claimHome } from "./spots.js";
import { doze } from "./naps.js";

const q0 = new THREE.Quaternion();
function atHome(s, first) {
  if (s.spot.guest) { s.trip.phase = "home"; s.spot.home = true; s.errand = 1e9; doze(s, R(60, 120)); s.dozeIn = 1.2; if (s.spot.car) setTimeout(() => jeepApi?.close("P"), 1500); return; }   // a nap trip: straight to sleep
  s.trip.phase = "home"; s.spot.home = true; claimHome(s);
  s.errand = first ? R(4, 45) : R(35, 80) * (s.spot.asleep || s.spot.car ? 1.6 : 1);
  if (s.spot.asleep) { if (first) { s.dozing = s.asleep = true; s.eyes(true); s.dozeT = R(30, 150); s.dozeIn = 0; } else { doze(s, R(90, 180)); s.dozeIn = 1.5; } }   // Hibi: back in the hammock, a yawn and a long nap
  if (s.spot.car && !first) setTimeout(() => jeepApi?.close("P"), 1500);
}
function placeHome(s) {                             // straight into its spot, as if it had always lived there
  const spot = s.spot; s.sc = spot.scale; s.o.scale.setScalar(s.sc); s.act = s.mixer.existingAction(clipOf("cling"));
  s.trip = { phase: "home", t: 0, yaw: 0 };
  if (spot.branch || spot.line) {
    const P = spot.line ? linePose(s, spot.t) : underAt(s, spot.curve.getPointAt(spot.t), spot.curve.getTangentAt(spot.t));
    s.o.position.copy(P.p); s.o.quaternion.copy(P.q);
  } else {
    spot.parent.add(s.o); s.o.position.copy(spot.at); s.o.quaternion.setFromAxisAngle(UP, spot.yaw);
    play(s, spot.clip, 0.01);
  }
  atHome(s, true);
}
function climbUp(s, spot) {                          // up the trunk and out along the branch to its tip
  const { curve: c, t, t0, tree, out } = spot, L = c.getLength(), yTop = c.getPointAt(t0).y - 0.25 * s.sc, R = barkProfile(tree, out, yTop);
  play(s, "hang_walk", 1.5, HW);
  glide(s, trunkAt(s, tree, out, 0.02, R), 2.5, () => slide(s, 0.02, yTop, climbV(s), (y) => trunkAt(s, tree, out, y, R), () =>
    glide(s, underAt(s, c.getPointAt(t0), c.getTangentAt(t0)), 3, () => slide(s, t0, t, climbV(s) / L, (u) => underAt(s, c.getPointAt(u), c.getTangentAt(u)),
      () => { play(s, "cling", 3, 0.6); atHome(s); }))));
}
function settleIn(s, fade) {
  const T = s.trip, spot = s.spot; T.phase = "settle"; T.t = 0; spot.parent.attach(s.o);
  T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); T.sc0 = s.sc;
  play(s, spot.clip, fade);
}
function enterSpot(s) {                             // at its spot's door: in the way each spot is reached
  const spot = s.spot, T = s.trip;
  if (spot.branch) return climbUp(s, spot);
  if (spot.climb) { T.phase = "climb"; T.t = 0; return; }
  if (spot.car) { T.phase = "door"; T.t = 0; jeepApi.open("P"); return; }
  settleIn(s, 2.5);
}
function doorStep(s, T, sd, spot) {                 // waits, facing the door, until it has swung open
  const J = jeepApi, sill = spot.parent.localToWorld(spot.sill.clone());
  turnTo(T, yawFrom(s.o.position, sill), sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
  if (!J.isOpen("P")) J.open("P");
  else if (T.t > 2) { T.phase = "clamber"; T.t = 0; T.from = s.o.position.clone(); T.to = sill; play(s, "hang_walk", 1, 2); }
}
function clamberStep(s, T) {                        // about 4 s: hauls itself up onto the door sill
  const k = Math.min(1, T.t / 4), e = ease(k);
  s.o.position.lerpVectors(T.from, T.to, e); s.o.position.y += Math.sin(Math.PI * k) * 0.1;
  s.o.quaternion.setFromAxisAngle(UP, T.yaw).multiply(q0.setFromAxisAngle(V(1, 0, 0), -0.5 * Math.sin(Math.PI * k)));
  if (k >= 1) settleIn(s, 3);
}
function climbStep(s, T, sd, spot) {                // up the post hand over hand until its arms reach the rope knot (or the line)
  if (T.t < sd + 1e-6) play(s, "hang_walk", 1.2, HW_POST);
  turnTo(T, spot.climbYaw ?? climbYaw, sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
  const top = spot.top ?? HAMMOCK_PIVOT - 0.2 * s.sc;
  s.o.position.y = Math.min(top, s.o.position.y + 0.015 * HW_POST * s.sc * sd * Math.min(1, T.t / 1.5));
  if (s.o.position.y >= top) { T.phase = "turn"; T.t = 0; spot.parent.attach(s.o); T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); }
}
function turnStep(s, T, sd, spot) {                 // about 3 s: swings round from the post to hang under the rope (or the line)
  const k = Math.min(1, T.t / 3), e = ease(k), R0 = spot.line ? linePose(s, 0.05) : ropePose(s, 0.1);
  s.o.position.lerpVectors(T.from, R0.p, e); s.o.quaternion.slerpQuaternions(T.q, R0.q, e);
  if (k >= 1) { T.phase = spot.line ? "line" : "rope"; T.t = 0; T.u = spot.line ? 0.05 : 0.1; }
}
function lineStep(s, T, sd, spot) {                 // hand over hand along the line to the gap
  T.u = Math.min(spot.t, T.u + 0.015 * HW_POST * s.sc * sd / LAUNDRY.a.distanceTo(LAUNDRY.b)); const P = linePose(s, T.u);
  s.o.position.copy(P.p); s.o.quaternion.copy(P.q); brush?.(P.at, true, sd);
  if (T.u >= spot.t) { play(s, "cling", 3, 0.6); atHome(s); }
}
function ropeStep(s, T, sd) {                       // down the rope to the sling's end
  T.u = Math.min(ropeLen() - 0.05, T.u + 0.015 * HW_POST * s.sc * sd); const R1 = ropePose(s, T.u);
  s.o.position.copy(R1.p); s.o.quaternion.copy(R1.q);
  if (T.u >= ropeLen() - 0.05) settleIn(s, 3);
}
function settleStep(s, T, sd, spot) {               // about 4 s: climbs up into its spot and settles
  const k = Math.min(1, T.t / (spot.climb ? 6 : 4)), e = ease(k);
  s.o.position.lerpVectors(T.from, spot.at, e); if (!spot.climb && !spot.noHop) s.o.position.y += Math.sin(Math.PI * e) * 0.12;
  s.o.quaternion.slerpQuaternions(T.q, q0.setFromAxisAngle(UP, spot.yaw), e);
  s.sc = T.sc0 + (spot.scale - T.sc0) * e; s.o.scale.setScalar(s.sc);
  if (k >= 1) atHome(s);
}

export { clamberStep, climbStep, doorStep, enterSpot, lineStep, placeHome, ropeStep, settleStep, turnStep };
