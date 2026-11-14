// Canopy Camp sloths, the moves a trip is made of. Each starts a phase (or a step of the eat phase) on the sloth's trip
// s.trip, and its step function, called each frame by the camp step, carries it out and calls the next thing when done.
// Every way in and out of a spot (wayIn.js, wayOut.js) is made of slide and glide (review R2-027: they used to have
// phases of their own).
//   slide(s, from, to, speed, pose, next)       a parameter u runs from `from` to `to` at `speed` per second, the sloth posed
//                                               by pose(u, sd, into) (along a branch, a trunk, a post, a rope, the line; sd
//                                               is the frame's seconds; into is the slide's own pose to write into, poses.js
//                                               newPose): slideStep
//   glide(s, to, dur, next)                     eases from where it is to `to` over dur seconds: glideStep. to is a tween
//                                               target (below)
//   toGround(s, at, yaw, then)                  steps off onto the ground at `at`, belly down, facing yaw (a glide)
//   move(s, T, to, dur, lift, tip, then)        inside the eat and fix phases: from where it is to the point `to` over dur
//                                               seconds, lifted by `lift` in the middle and tipped back by `tip`: moveStep
//   climbV(s), postV(s)                         how fast it climbs a trunk and a post (or the rope, the line), in m/s, so
//                                               that hang_walk's paws keep pace
// The one tween behind glide and move: to = { p, q, lift, tip, sc }. The sloth eases from where it is to the position p
// and, with q, the turn q (without q it faces the trip's yaw T.yaw); lift raises it in an arc on the way, tip tips it
// back about its own x in the middle, sc eases its size to sc.
import * as THREE from "three";
import { V, ease } from "../util.js";
import { HW, HW_POST, setTrip } from "./state.js";
import { play } from "./clips.js";
import { UP, newPose, yawQ } from "./poses.js";

const q0 = new THREE.Quaternion(), X = V(1, 0, 0);
const climbV = (s) => 0.015 * HW * s.sc;              // m/s, with hang_walk at HW so the paws keep pace
const postV = (s) => 0.015 * HW_POST * s.sc;          // the same at HW_POST, up and down a post, the rope and the line
function slide(s, from, to, speed, pose, next) { setTrip(s, "slide", { sl: { u: from, to, speed, pose, next } }); }
function tween(s, T, to, dur, next) { T.t = 0; T.tw = { fp: s.o.position.clone(), fq: s.o.quaternion.clone(), sc0: s.sc, to, dur, next }; }
function tweenStep(s, T) {
  const W = T.tw, to = W.to, k = Math.min(1, T.t / W.dur), e = ease(k), arc = Math.sin(Math.PI * k);
  s.o.position.lerpVectors(W.fp, to.p, e); if (to.lift) s.o.position.y += arc * to.lift;
  if (to.q) s.o.quaternion.slerpQuaternions(W.fq, to.q, e); else s.o.quaternion.setFromAxisAngle(UP, T.yaw);
  if (to.tip) s.o.quaternion.multiply(q0.setFromAxisAngle(X, to.tip * arc));
  if (to.sc != null) { s.sc = W.sc0 + (to.sc - W.sc0) * e; s.o.scale.setScalar(s.sc); }
  if (k >= 1) W.next();
}
function glide(s, to, dur, next) { tween(s, setTrip(s, "glide"), to, dur, next); }
function toGround(s, at, yaw, then) {               // step off onto the ground at `at`, belly down, facing yaw
  play(s, "walk", 2, 1);
  glide(s, { p: at.clone().setY(0), q: yawQ(yaw) }, 2.5, () => { s.trip.yaw = yaw; then(); });
}
function slideStep(s, T, sd) {
  const L = T.sl, step = L.speed * sd; L.u = Math.abs(L.to - L.u) <= step ? L.to : L.u + Math.sign(L.to - L.u) * step;
  const P = L.pose(L.u, sd, L.into ??= newPose()); s.o.position.copy(P.p); s.o.quaternion.copy(P.q);
  if (L.u === L.to) L.next();
}
const glideStep = tweenStep;
// a move inside the eat and fix phases (their step "move"), facing the trip's yaw
function move(s, T, to, dur, lift, tip, then) { T.st = "move"; tween(s, T, { p: to, lift, tip }, dur, then); }
const moveStep = tweenStep;

export { climbV, glide, glideStep, move, moveStep, postV, slide, slideStep, toGround };
