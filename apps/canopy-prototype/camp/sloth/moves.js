// Canopy Camp sloths, the moves a trip is made of. Each starts a phase (or a step of the eat phase) on the sloth's trip
// s.trip, and its step function, called each frame by the camp step, carries it out and calls the next thing when done:
//   slide(s, from, to, speed, pose, next)       a parameter u runs from `from` to `to` at `speed` per second, the sloth posed
//                                               by pose(u) (along a branch, a trunk, a post, a rope, the line): slideStep
//   glide(s, to, dur, next)                     eases from where it is to the pose `to` over dur seconds: glideStep
//   toGround(s, at, yaw, then)                  steps off onto the ground at `at`, belly down, facing yaw (a glide)
//   move(s, T, to, dur, lift, tip, then)        inside the eat and fix phases: from where it is to `to` over dur seconds,
//                                               lifted by `lift` in the middle and tipped back by `tip`: moveStep
//   climbV(s)                                   how fast it climbs, in m/s, so that hang_walk's paws keep pace
import * as THREE from "three";
import { V } from "../util.js";
import { HW } from "./state.js";
import { play } from "./clips.js";
import { UP } from "./poses.js";

const q0 = new THREE.Quaternion();
const climbV = (s) => 0.015 * HW * s.sc;              // m/s, with hang_walk at HW so the paws keep pace
// two generic moves: slide (a parameter u runs to `to` at `speed` per second, posed by pose(u)) and glide (ease from where
// it is to a pose over dur seconds); each calls next() when done
function slide(s, from, to, speed, pose, next) { s.trip.phase = "slide"; s.trip.sl = { u: from, to, speed, pose, next }; }
function glide(s, to, dur, next) { const T = s.trip; T.phase = "glide"; T.t = 0; T.gl = { fp: s.o.position.clone(), fq: s.o.quaternion.clone(), to, dur, next }; }
function toGround(s, at, yaw, then) {               // step off onto the ground at `at`, belly down, facing yaw
  play(s, "walk", 2, 1);
  glide(s, { p: at.clone().setY(0), q: new THREE.Quaternion().setFromAxisAngle(UP, yaw) }, 2.5, () => { s.trip.yaw = yaw; then(); });
}
function slideStep(s, T, sd) {
  const L = T.sl, step = L.speed * sd; L.u = Math.abs(L.to - L.u) <= step ? L.to : L.u + Math.sign(L.to - L.u) * step;
  const P = L.pose(L.u); s.o.position.copy(P.p); s.o.quaternion.copy(P.q);
  if (L.u === L.to) L.next();
}
function glideStep(s, T) {
  const G = T.gl, k = Math.min(1, T.t / G.dur), e = k * k * (3 - 2 * k);
  s.o.position.lerpVectors(G.fp, G.to.p, e); s.o.quaternion.slerpQuaternions(G.fq, G.to.q, e);
  if (k >= 1) G.next();
}
// a move inside the eat phase: from where it is to `to` over dur s, lifted by `lift` in the middle, tipped back by `tip`
function move(s, T, to, dur, lift, tip, then) { T.mv = { fp: s.o.position.clone(), to, dur, lift, tip, then }; T.st = "move"; T.t = 0; }
function moveStep(s, T) {
  const M = T.mv, k = Math.min(1, T.t / M.dur), e = k * k * (3 - 2 * k);
  s.o.position.lerpVectors(M.fp, M.to, e); s.o.position.y += Math.sin(Math.PI * k) * M.lift;
  s.o.quaternion.setFromAxisAngle(UP, T.yaw).multiply(q0.setFromAxisAngle(V(1, 0, 0), M.tip * Math.sin(Math.PI * k)));
  if (k >= 1) M.then();
}

export { climbV, glide, glideStep, move, moveStep, slide, slideStep, toGround };
