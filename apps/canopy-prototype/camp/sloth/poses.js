// Canopy Camp sloths, poses: where a sloth is and which way it is turned on a branch, a trunk, a post, the hammock's rope or
// the laundry line, as { p: position, q: quaternion }, and the small yaw helpers. Pure: no scene objects are made or moved
// (barkProfile only casts rays at the trees), and no random numbers are drawn.
//   UP                                the world's up
//   yawQ(yaw)                         a quaternion turned by yaw about UP
//   yawOf(object)                     the yaw an object faces in the world (a sloth faces its own -Z)
//   turnTo(T, want, k)                turns the trip's yaw T.yaw toward `want` by the share k, the short way round; returns
//                                     how far off it still was
//   underAt(s, at, head)              hanging back-down under a branch or pole at `at`, its head toward `head`
//   trunkAt(s, tree, out, y, R)       upright on a trunk at height y, facing the bark on the side `out`; R(y) is the bark's radius
//   treeOf(curve)                     the big tree a branch grows from (its foot, on the ground)
//   trunkR0(y), barkProfile(tree, out, yTop), branchBase(curve, tree)   the trunk's radius by formula, as measured on one
//                                     side, and the first point along a branch that is clear of the bark
//   HAMMOCK_IN, climbYaw              from the hammock toward the fire, and the yaw of a sloth climbing its post
//   ropeLen(), ropePose(s, u)         the hammock's rope from the post's knot to the sling (layout.js HAMMOCK.knot, ropeEnd):
//                                     its length, and hanging under it u metres down from the knot (in the swing's frame,
//                                     swing.js). Both read the rope when first called, after campProps.js has loaded the set.
//   linePose(s, t)                    hanging under the laundry line at fraction t from its end a: { at, p, q }
//   postPose(spot, y)                 upright on the spot's post (the hammock's or the line's) at height y
import * as THREE from "three";
import { scene } from "../core.js";
import { V, wrapPi, yawTo } from "../util.js";
import { HAMMOCK, HERO, LAUNDRY } from "../layout.js";

const UP = V(0, 1, 0), m4 = new THREE.Matrix4(), LL = LAUNDRY;
const yawQ = (yaw) => new THREE.Quaternion().setFromAxisAngle(UP, yaw);
const yawOf = (o) => { const f = V(0, 0, -1).applyQuaternion(o.getWorldQuaternion(qWorld)); return yawTo(f); };
const qWorld = new THREE.Quaternion();
const turnTo = (T, want, k) => { const d = wrapPi(want - T.yaw); T.yaw += d * Math.min(1, k); return Math.abs(d); };
// poses for climbing: hanging back-down under a branch or pole at `at`, head toward `head`, and upright on a trunk at
// height y, facing the bark on the side `out` points to. underAt is the one hanging pose: body.js hang() places a new
// sloth with it, and the rope and the line below are it too. Its grip is 0.1 of its size over its belly and toward its head.
function underAt(s, at, head) {
  const yl = head.clone().setY(head.y * 0.5).normalize(), zl = V(0, -1, 0).addScaledVector(yl, yl.y).normalize(), xl = V().crossVectors(yl, zl);
  m4.makeBasis(xl, yl, zl);
  return { q: new THREE.Quaternion().setFromRotationMatrix(m4), p: at.clone().sub(V(0, 0.1 * s.sc, -0.1 * s.sc).applyMatrix4(m4)) };
}
const trunkAt = (s, tree, out, y, R) => ({ p: tree.clone().addScaledVector(out, R(Math.max(0, y)) + 0.07 * s.sc).setY(y), q: yawQ(Math.atan2(out.x, out.z)) });
const treeOf = (c) => HERO.reduce((a, b) => (b.distanceTo(c.points[0].clone().setY(0)) < a.distanceTo(c.points[0].clone().setY(0)) ? b : a)).clone().setY(0);
// two low branches right at the camp's edge (Adriaen 2026-11-12): the tips nearest the fire clear of the wild sloths.
// Their sloths climb down the trunk and back up it (climbDown, climbUp below). Trunk radius after forest.js (1.05 at the
// foot to 0.6 at 15 m, with the root flare).
const trunkR0 = (y) => (1.05 - 0.03 * y) * (1.1 + 0.7 * Math.exp(-1.5 * y));
// the bark's real distance from the tree's centre on one side, measured once per climb by casting rays at the tree's wood
// every 20 cm up (the trunk wobbles and flares, so a formula leaves the sloth floating in front of it)
const ray = new THREE.Raycaster();
let woodMesh = null;
function barkProfile(tree, out, yTop) {
  woodMesh ??= scene.children.filter((m) => m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh && !m.material.transparent && m.geometry.attributes.position.count > 2000);   // trunks, branches and other big solid meshes
  const ys = [], rs = [];
  for (let y = 0; y <= yTop + 0.4; y += 0.2) {   // (the first ray at 0.1 up, clear of the floor)
    let r = trunkR0(y);
    if (woodMesh) { ray.set(tree.clone().addScaledVector(out, 5).setY(Math.max(0.1, y)), out.clone().negate()); ray.far = 5; const h = ray.intersectObjects(woodMesh, false)[0]; if (h) r = 5 - h.distance; }
    ys.push(y); rs.push(r);
  }
  return (y) => { const k = Math.max(0, Math.min(ys.length - 1.001, y / 0.2)), i = Math.floor(k); return rs[i] + (rs[i + 1] - rs[i]) * (k - i); };
}
function branchBase(c, tree) {                      // the first point along the branch clear of the bark
  for (let t = 0; t <= 1; t += 0.02) { const p = c.getPointAt(t); if (Math.hypot(p.x - tree.x, p.z - tree.z) > trunkR0(p.y) + 0.25) return t; }
  return 0.3;
}
const HAMMOCK_IN = (() => {                               // from the hammock toward the fire
  const hd = HAMMOCK.b.clone().sub(HAMMOCK.a), inward = V(-hd.z, 0, hd.x).normalize(); if (inward.dot(HAMMOCK.mid) > 0) inward.negate(); return inward;
})();
// the hammock route, in the swing's frame (x along the span, the knots on the pivot line, y up from them): up the -x post to
// its rope knot (HAMMOCK.knot), then hand over hand down the rope to the sling's end (HAMMOCK.ropeEnd), hanging back-down
// under it as on a branch (hang_walk), then onto the sling. hang_walk keeps its paws on a line 0.10 (x scale) over its belly,
// spanning 0..0.20 toward its head, so the same clip climbs the post when the sloth is upright facing it.
let rope = null;   // { knot, dir, L }: the knot, the rope's unit direction and its length, read once (ropeOf)
function ropeOf() {
  if (!rope) { const [kx, , kz] = HAMMOCK.knot, [ex, , ez] = HAMMOCK.ropeEnd, d = V(ex - kx, ez - kz, 0);
    rope = { knot: V(kx, 0, 0), L: d.length(), dir: d.normalize() }; }
  return rope;
}
const ropeLen = () => ropeOf().L;
const climbYaw = Math.atan2(HAMMOCK_IN.x, HAMMOCK_IN.z);
const ropePose = (s, u) => { const r = ropeOf(); return underAt(s, r.knot.clone().addScaledVector(r.dir, u), r.dir); };   // hanging under the rope, its grip centre u metres down from the knot
function linePose(s, t) {                           // hanging back-down under the laundry line at fraction t from a, its head toward b
  const L = LL.a.distanceTo(LL.b), y = (k) => LL.a.y - LL.sag * 4 * k * (1 - k);
  const at = LL.a.clone().addScaledVector(LL.dir, L * t).setY(y(t)), tan = LL.dir.clone().setY((y(t + 0.01) - y(t)) / (0.01 * L)).normalize();
  return { at, ...underAt(s, at, tan) };
}
const postPose = (spot, y) => ({ p: spot.door.clone().setY(y), q: yawQ(spot.climbYaw ?? climbYaw) });

export { HAMMOCK_IN, UP, barkProfile, branchBase, climbYaw, linePose, postPose, ropeLen, ropePose, treeOf, trunkAt, trunkR0, turnTo, underAt, yawOf, yawQ };
