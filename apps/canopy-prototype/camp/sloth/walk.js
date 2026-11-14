// Canopy Camp sloths, on the ground: finding the way, walking it, and saying hello to a sloth met on the way.
// Wayfinding (nav.js): the sloths' grid over the clearing. They keep 0.28 m (half a sloth) from every blocker and a wide
// berth round the fire (Adriaen: too close is too dangerous). On the way, a sloth gives way to the others and to you: it
// keeps to the right of anyone ahead and slows when close.
//   buildNav()                    makes the grid's three functions below (sloths.js, in its place in the build order)
//   isFree(p), findPath(from, to)   nav.js, over the camp's blockers (and clearLine(p, q), used only in here)
//   walkTo(s, goal, arrive)       starts the walk phase along a path to goal; arrive() runs there
//   walkStep(s, T, sd)            the walk phase, each frame
//   greetStep(s, T, sd)           the greet phase: two that meet sit up, face each other, say hello and carry on (a pause
//                                 inside a walk, on the walk's trip record, so the path is kept)
// The words of a hello draw from the sloths' stream (core.js rng("sloths")) as they happen.
import { camera, rng } from "../core.js";
const { R } = rng("sloths");
import { V, yawFrom, yawTo } from "../util.js";
import { RC } from "../layout.js";
import { blockers } from "../campProps.js";
import { createNav } from "../nav.js";
import { walkers } from "../places.js";
import { burst } from "../fx.js";
import { CRAWL, GROUND, WALK_TS, camp, setTrip } from "./state.js";
import { play } from "./clips.js";
import { UP, turnTo, yawOf } from "./poses.js";

let clearLine, findPath, isFree;
const wDir = V(), wPath0 = V(), wWas = V(), wFwd = V();   // walkStep's scratch vectors, reused every frame
function buildNav() { ({ clearLine, findPath, isFree } = createNav({ blockers, half: RC + 0.5, rim: RC - 0.8, fireKeep: 2.3, body: 0.28 })); }

function walkTo(s, goal, arrive) {
  setTrip(s, "walk", { path: findPath(s.o.position, goal), arrive, yaw: yawOf(s.o) });
  play(s, "walk", 1.5, WALK_TS);
}
// on the ground: follow the path, keep right of anyone ahead (a sloth or you), slow when close, and greet a sloth it meets
function walkStep(s, T, sd) {
  const pos = s.o.position;
  // a point near enough is passed only when the way on from here to the next one is clear, so in a narrow gap (the crate
  // and the table end) it still steps through the gap's corner instead of cutting it
  while (T.path.length > 1 && Math.hypot(pos.x - T.path[0].x, pos.z - T.path[0].z) < (T.snap ? 0.1 : 0.3) && (T.snap || T.path.length === 2 || clearLine(pos, T.path[1]))) { T.path.shift(); T.snap = false; }
  const aim = T.path[0], dir = wDir.set(aim.x - pos.x, 0, aim.z - pos.z), dist = dir.length(); dir.divideScalar(Math.max(dist, 1e-4));
  let slow = 1;
  const others = camp.filter((o) => o !== s && GROUND.has(o.trip.phase)).map((o) => [o.o.position, 0.18 * (s.sc + o.sc) + 0.1, o]);
  others.push([camera.position, 0.45, null], ...walkers.map(([o, r]) => [o.position, r + 0.18 * s.sc + 0.1, null]));
  // giving way (Adriaen 2026-11-13: "wayfinding needs a bit of work", a sloth was walking into a log seat): it steps
  // aside to the right of anyone ahead, or to the left when the right is a blocker; someone sitting in a seat or a bed
  // (inside a blocker the path already goes round) is left out, so the operator on his log doesn't push it into the log
  const path0 = wPath0.copy(dir); let side = 0;
  for (const [p, near, o] of others) {
    const dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz);
    if (d > near + 0.6) continue;
    if (o && d < 0.95 && s.greetCD <= 0 && o.greetCD <= 0) { greet(s, o); return; }
    if (!o && !isFree(p)) continue;
    const ahead = (dx * path0.x + dz * path0.z) / Math.max(d, 1e-4); if (ahead <= 0) continue;
    side += Math.min(1.5, (near + 0.6 - d) / 0.6) * ahead * 1.4;
    if (d < near) slow = Math.min(slow, 0.25);
  }
  if (side > 0) {
    const step = 0.18 + 0.12 * s.sc, tryDir = (sg) => V(path0.x - path0.z * side * sg, 0, path0.z + path0.x * side * sg).normalize();
    const r = tryDir(1), l = tryDir(-1), ok = (d) => isFree(V(pos.x + d.x * step, 0, pos.z + d.z * step));
    if (ok(r)) dir.copy(r); else if (ok(l)) dir.copy(l); else slow = Math.min(slow, 0.25);   // boxed in: on along its path, slowly
  }
  const off = turnTo(T, yawTo(dir), sd * 2.5); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
  const v = CRAWL * s.sc * sd * slow * (off > 1 ? 0.3 : 1) * (T.snap || dist < 0.35 ? Math.max(0.1, Math.cos(Math.min(off, 1.5))) : 1);   // close to a point: turn first, so it can't circle it
  const was = wWas.copy(pos); pos.addScaledVector(wFwd.set(-Math.sin(T.yaw), 0, -Math.cos(T.yaw)), v); pos.y = 0;
  if (!isFree(pos) && isFree(was) && (T.path.length > 1 || isFree(aim))) {   // about to walk into something: slide along its path line instead
    // (Adriaen 2026-11-13, Mango stuck between the crate and the table end): the line from where it is to the next point
    // can clip a blocked cell the planned line (from a cell's middle) missed, so it slides along a wall: along the path
    // line, else along x or z alone toward the point. Still stuck, it plans afresh and first walks to the middle of its
    // own cell (T.snap), where the planned lines start, so the same clip can't stop it again.
    const tries = [path0, V(Math.sign(path0.x), 0, 0), V(0, 0, Math.sign(path0.z))];
    let ok = false; for (const d of tries) { if (!d.lengthSq()) continue; pos.copy(was).addScaledVector(d, v); if (isFree(pos)) { ok = true; break; } }
    if (!ok) { pos.copy(was); T.stuck = (T.stuck || 0) + sd; }
    if (T.stuck > 1.5) { T.stuck = 0; T.path = findPath(pos, T.path[T.path.length - 1]); T.snap = T.path.length > 1; }   // a fresh path from here
  }
  if (T.path.length === 1 && dist < 0.1 + v) { pos.x = aim.x; pos.z = aim.z; T.arrive(); }
}
const HELLO = ["👋", "💗", "hi!", "*slow wave*"];
function greet(s, o) {
  for (const [a, b, lead] of [[s, o, true], [o, s, false]]) {
    a.greetCD = R(25, 40);
    if (a.trip.phase !== "walk") { a.nod = 1.4; continue; }   // one at the table just nods back
    Object.assign(a.trip, { phase: "greet", t: 0, with: b, lead, said: false }); play(a, "idle", 0.8);
  }
}
function greetStep(s, T, sd) {                        // sit up, face each other, say hello, carry on
  const o = T.with.o.position, pos = s.o.position;
  turnTo(T, yawFrom(pos, o), sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
  if (!T.said && T.t > 0.9) { T.said = true; s.nod = 1.2; s.squish = 0.5; if (T.lead) burst(pos.clone().lerp(o, 0.5).setY(0.75), HELLO[Math.floor(R(0, HELLO.length))], 1, 1.8, 64); }
  if (T.t > 3.4) { T.phase = "walk"; play(s, "walk", 1, WALK_TS); }
}

export { buildNav, findPath, greetStep, isFree, walkStep, walkTo };
