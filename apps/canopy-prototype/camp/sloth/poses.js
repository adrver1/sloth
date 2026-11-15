// Canopy Camp sloths, poses: where a sloth is and which way it is turned on a branch, a trunk, a post, the hammock's rope or
// the laundry line, as { p: position, q: quaternion }, and the small yaw helpers. Pure: no scene objects are made or moved
// (barkOf only casts rays at the big trees' wood), and no random numbers are drawn.
// Each pose function takes an optional last argument `into`, a pose to write into (newPose()) instead of making a new one:
// a slide (moves.js) passes its own, so a sloth posed along a branch, a trunk or a rope each frame makes no new objects.
// A pose is { p, q, at, dir }: at and dir are spare vectors a caller may hand the pose as its own `at` and `head`.
//   newPose()                         a pose to write into
//   UP                                the world's up
//   yawQ(yaw)                         a quaternion turned by yaw about UP
//   yawOf(object)                     the yaw an object faces in the world (a sloth faces its own -Z)
//   underAt(s, at, head, into)        hanging back-down under a branch or pole at `at`, its head toward `head`
//   trunkAt(s, tree, out, y, R, into) upright on a trunk at height y, facing the bark on the side `out`; R(y) is the bark's radius
//   treeOf(curve)                     the big tree a branch grows from (its foot, on the ground)
//   barkOf(spot), branchBase(curve, tree)   a branch spot's trunk radius as measured on its side (a function of y, kept
//                                     on the spot as spot.bark), and the first point along a branch that is clear of the bark
//   HAMMOCK_IN, climbYaw              from the hammock toward the fire, and the yaw of a sloth climbing its post
//   ropeLen(), ropePose(s, u, into)   the hammock's rope from the post's knot to the sling (layout.js HAMMOCK): its length,
//                                     and hanging under it u metres down from the knot (in the swing's frame, swing.js). Both
//                                     read the rope when first called, after campProps.js has loaded the set (fromModel).
//   linePose(s, t, into)              hanging under the laundry line at fraction t from its end a (pose.at: the point on the line)
//   postPose(spot, y, into)           upright on the spot's post (the hammock's or the line's) at height y
import * as THREE from "three";
import { heroWood, trunkR } from "../forest.js";
import { V, yawTo } from "../util.js";
import { HAMMOCK, HERO, LAUNDRY } from "../layout.js";

const UP = V(0, 1, 0), m4 = new THREE.Matrix4(), LL = LAUNDRY, LL_L = LL.a.distanceTo(LL.b);
const newPose = () => ({ p: V(), q: new THREE.Quaternion(), at: V(), dir: V() });
const yl = V(), zl = V(), xl = V(), grip = V();   // underAt's scratch
const yawQ = (yaw) => new THREE.Quaternion().setFromAxisAngle(UP, yaw);
const yawOf = (o) => { const f = V(0, 0, -1).applyQuaternion(o.getWorldQuaternion(qWorld)); return yawTo(f); };
const qWorld = new THREE.Quaternion();
// poses for climbing: hanging back-down under a branch or pole at `at`, head toward `head`, and upright on a trunk at
// height y, facing the bark on the side `out` points to. underAt is the one hanging pose: body.js placeUnder() hangs a new
// sloth with it, and the rope and the line below are it too. Its grip is 0.1 of its size over its belly and toward its head.
function underAt(s, at, head, into = newPose()) {
  yl.copy(head).setY(head.y * 0.5).normalize(); zl.set(0, -1, 0).addScaledVector(yl, yl.y).normalize(); xl.crossVectors(yl, zl);
  m4.makeBasis(xl, yl, zl); into.q.setFromRotationMatrix(m4);
  into.p.copy(at).sub(grip.set(0, 0.1 * s.sc, -0.1 * s.sc).applyMatrix4(m4)); return into;
}
function trunkAt(s, tree, out, y, R, into = newPose()) {
  into.p.copy(tree).addScaledVector(out, R(Math.max(0, y)) + 0.07 * s.sc).setY(y); into.q.setFromAxisAngle(UP, Math.atan2(out.x, out.z)); return into;
}
const treeOf = (c) => HERO.map((h) => h.at).reduce((a, b) => (b.distanceTo(c.points[0].clone().setY(0)) < a.distanceTo(c.points[0].clone().setY(0)) ? b : a)).clone().setY(0);
// two low branches right at the camp's edge (Adriaen 2026-11-12): the tips nearest the fire clear of the wild sloths.
// Their sloths climb down the trunk and back up it (wayOut.js climbDown, wayIn.js climbUp). The trunk's radius by formula is
// forest.js trunkR (forest/trees.js heroTrees).
// the bark's real distance from the tree's centre on one side, measured by casting rays at the big trees' wood (forest.js
// heroWood) every 20 cm up to yTop + 0.4 (the trunk wobbles and flares, so a formula leaves the sloth floating in front of
// it). The climbs measure it once per spot (spot.bark) and keep it, since a branch spot's height never changes (review R2-082).
const ray = new THREE.Raycaster();
function barkProfile(tree, out, yTop) {
  const ys = [], rs = [];
  for (let y = 0; y <= yTop + 0.4; y += 0.2) {   // (the first ray at 0.1 up, clear of the floor)
    let r = trunkR(y);
    if (heroWood) { ray.set(tree.clone().addScaledVector(out, 5).setY(Math.max(0.1, y)), out.clone().negate()); ray.far = 5; const h = ray.intersectObject(heroWood, false)[0]; if (h) r = 5 - h.distance; }
    ys.push(y); rs.push(r);
  }
  return (y) => { const k = Math.max(0, Math.min(ys.length - 1.001, y / 0.2)), i = Math.floor(k); return rs[i] + (rs[i + 1] - rs[i]) * (k - i); };
}
// a branch spot's bark profile, measured the first time one of its climbs needs it, up to the branch's base (the highest
// any sloth climbs the trunk there) and kept on the spot
const barkOf = (spot) => (spot.bark ??= barkProfile(spot.tree, spot.out, spot.curve.getPointAt(spot.t0).y));
function branchBase(c, tree) {                      // the first point along the branch clear of the bark
  for (let t = 0; t <= 1; t += 0.02) { const p = c.getPointAt(t); if (Math.hypot(p.x - tree.x, p.z - tree.z) > trunkR(p.y) + 0.25) return t; }
  return 0.3;
}
const HAMMOCK_IN = (() => {                               // from the hammock toward the fire
  const hd = HAMMOCK.b.clone().sub(HAMMOCK.a), inward = V(-hd.z, 0, hd.x).normalize(); if (inward.dot(HAMMOCK.mid) > 0) inward.negate(); return inward;
})();
// the hammock route, in the swing's frame (x along the span, the knots on the pivot line): up the -x post to its rope knot
// (x -knotX, y 0), then hand over hand down the rope to the sling's end (x -endX, y endY; layout.js HAMMOCK), hanging back-down under it
// as on a branch (hang_walk), then onto the sling. hang_walk keeps its paws on a line 0.10 (x scale) over its belly,
// spanning 0..0.20 toward its head, so the same clip climbs the post when the sloth is upright facing it.
let rope = null;   // { knot, dir, L }: the knot, the rope's unit direction and its length, read once (ropeOf)
function ropeOf() {
  if (!rope) { const d = V(HAMMOCK.knotX - HAMMOCK.endX, HAMMOCK.endY, 0); rope = { knot: V(-HAMMOCK.knotX, 0, 0), L: d.length(), dir: d.normalize() }; }
  return rope;
}
const ropeLen = () => ropeOf().L;
const climbYaw = Math.atan2(HAMMOCK_IN.x, HAMMOCK_IN.z);
const ropePose = (s, u, into = newPose()) => { const r = ropeOf(); return underAt(s, into.at.copy(r.knot).addScaledVector(r.dir, u), r.dir, into); };   // hanging under the rope, its grip centre u metres down from the knot
const lineY = (k) => LL.a.y - LL.sag * 4 * k * (1 - k);   // the laundry line's height at fraction k from a
function linePose(s, t, into = newPose()) {         // hanging back-down under the laundry line at fraction t from a, its head toward b
  into.at.copy(LL.a).addScaledVector(LL.dir, LL_L * t).setY(lineY(t)); into.dir.copy(LL.dir).setY((lineY(t + 0.01) - lineY(t)) / (0.01 * LL_L)).normalize();
  return underAt(s, into.at, into.dir, into);
}
function postPose(spot, y, into = newPose()) { into.p.copy(spot.door).setY(y); into.q.setFromAxisAngle(UP, spot.climbYaw ?? climbYaw); return into; }

export { HAMMOCK_IN, UP, barkOf, branchBase, climbYaw, linePose, newPose, postPose, ropeLen, ropePose, treeOf, trunkAt, underAt, yawOf, yawQ };
