// Canopy Camp sloths, the spots: where each named sloth lives, and the cozy places one goes to for a nap away from home.
// Adriaen 2026-11-12: one in the hammock (naps on its back; the hammock sways all the time), one on the log seat right of
// the gap, one in the jeep's driver seat (plays at driving), one on the laundry line, one in the tent doorway and two on
// low branches at the camp's edge.
//   buildSpots()    fills state.js's spots, in the order they are filled with sloths: hammock, seat, jeep, line, tent and up
//                   to two branches. It adds the hammock's swing, the seat's and the tent's groups to the scene.
//   buildGuests()   fills state.js's guests: a second place in the hammock, the jeep's passenger seat and two in the tent's
//                   bed. Called once the named sloths are in their spots (it copies the spots as they are then).
//   claimHome(s), releaseHome(s)   s takes, or gives up, the place its spot is in the camp's registry (places.js), e.g.
//                   "seat:Sunny" or "jeep:Mango"; the seat's sloth holds its log too ("log:0"), so no one else sits there
//   hammock         the hammock's swing (swing.js makeHammockSwing), with zz for its napper's z's (naps.js)
//   brush           brush(p, on, dt): the laundry swings aside where a sloth passes (swing.js); null without the line
// A spot: { name, parent (the group it is local to), at, yaw, clip (what it plays there), scale (its size there), door (the
// point on the ground it crawls to before going in), who (its sloth), home (its sloth is in) } and what its way in needs:
// climb (up a post first), car + sill (through the jeep's door), line + t + top + climbYaw (along the laundry line),
// via (a point to pass on the way to the door), noHop, asleep (it sleeps there most of the time), branch + top, tan, curve,
// t, t0, tree, out (hanging at t along a branch of that tree). A guest spot is a copy with guest, key (the place it claims,
// places.js) and bed. Nothing runs on import; sloths.js calls the two builders in their place in the build order.
import * as THREE from "three";
import { jeepApi } from "../jeep.js";
import { LIVED, PROPS, scene } from "../core.js";
import { V } from "../util.js";
import { yawTo } from "../actor.js";
import { HAMMOCK, LAUNDRY, RC, SEATS, TENT } from "../layout.js";
import { branchCurves } from "../forest.js";
import { HAMMOCK_PIVOT, makeClothBrush, makeHammockSwing } from "../swing.js";
import { claim, release } from "../places.js";
import { SL, guests, sloths, spots } from "./state.js";
import { HAMMOCK_IN, branchBase, treeOf, trunkR0 } from "./poses.js";

const PIV = HAMMOCK_PIVOT, DOWN = V(0, -1, 0), ray = new THREE.Raycaster();
let hammock = null, brush = null;

function buildSpots() {
  const hA = HAMMOCK.a, inward = HAMMOCK_IN;   // the hammock's first post (layout.js)
  // the hammock (swing.js): the sling swings about the line between the rope knots, and the napper lies in the group
  // that swings with it
  hammock = makeHammockSwing(); hammock.zz = null;   // zz: the napper's three z's (naps.js hammockStep)
  const swing = hammock.swing;
  // the log seat right of the gap, facing the fire and the kettle
  const sa = SEATS[0].angle, at = V(SEATS[0].at.x, 0.33, SEATS[0].at.z).addScaledVector(V(-Math.sin(sa), 0, Math.cos(sa)), -0.12);   // on the log's top, 12 cm along it
  const seat = new THREE.Group(); seat.position.copy(at); seat.rotation.y = Math.atan2(at.x, at.z); scene.add(seat);
  // each spot: where the sloth ends up (local to its group), the clip it plays there, its size there, and the door on the
  // ground it crawls to before climbing in
  spots.push(
    { name: "hammock", parent: swing, at: V(0.08, 0.72 - PIV, 0), yaw: -Math.PI / 2, clip: "nap", scale: 2.2, asleep: true,
      door: hA.clone().setY(0).addScaledVector(inward, 0.1 * 2.2), climb: true },   // the foot of the -x post, fire side: climbs it, then the rope
    { name: "seat", parent: seat, at: V(0, 0, 0), yaw: 0, clip: "reach", scale: 1.9, door: at.clone().setY(0).addScaledVector(at.clone().setY(0).normalize(), 0.8) },   // gets on from behind the log, away from the fire
  );
  // the jeep (thread "jeep"): it waits outside the passenger door, which opens for it (jeep.js jeepApi), clambers onto the
  // sill and onto the passenger seat, and curls up asleep there facing forward. In the jeep's frame: +Z ahead, passenger
  // side +X, cushion top (0.36, 0.86, -0.18), sill (0.8, 0.56, -0.13).
  const J = jeepApi;
  if (J?.node) {
    J.node.updateMatrixWorld(true);
    const sillL = J.node.worldToLocal(J.sill.clone()), seatL = J.node.worldToLocal(J.seat.clone());
    // left-hand drive since 2026-11-11: the wheel (empty WheelHub) is in front of this seat, so it sits up behind it and plays
    // at driving (clip drive). The clip's paws circle a rim 0.062 across, 0.11 up and 0.10 ahead of the sloth (x its scale),
    // so at scale 2.4 they hold the 0.16 rim of the jeep's wheel; it sits where that puts the hub, no lower than the cushion.
    const hubN = J.node.getObjectByName("WheelHub"), hub = hubN ? J.node.worldToLocal(hubN.getWorldPosition(V())) : V(0.36, 1.15, 0.05), dsc = 2.4;
    const drv = V(hub.x, Math.max(seatL.y, hub.y - 0.11 * dsc), hub.z - 0.10 * dsc);
    spots.push({ name: "jeep", parent: J.node, at: drv, yaw: Math.PI, clip: "drive", scale: dsc, car: true,
      sill: sillL, door: J.node.localToWorld(sillL.clone().add(V(0.5, 0, 0))).setY(0) });
  }
  // the laundry line (thread "lived-in props", layout.js LAUNDRY; there only with the lived-in props): it crawls round to the outer side of post a, climbs it
  // facing along the line, swings under the line and goes hand over hand along the sag to the gap at hang, then hangs there
  // as on its old branch (cling). The towel and socks swing aside round the line as it brushes past them (vertex shader).
  const LL = LIVED ? LAUNDRY : null;
  if (LL) {
    const sc = 1.7;
    spots.push({ name: "line", parent: scene, clip: "cling", scale: sc, line: true, climb: true,
      door: LL.a.clone().setY(0).addScaledVector(LL.dir, -0.1 * sc), climbYaw: yawTo(LL.dir), top: LL.a.y - 0.2 * sc,
      t: Math.max(0, Math.min(1, LL.hang.clone().sub(LL.a).dot(LL.dir) / LL.a.distanceTo(LL.b))) });
  }
  brush = LL ? makeClothBrush() : null;   // swing.js: the towel and socks swing aside as it brushes past them
  // the tent (Adriaen 2026-11-12, "our camp" walk-in tent only): it crawls to the planks before the door, in, turns round
  // and lies on its belly in the doorway, chin on its paws, peeking out (clip peek). Tent frame: +Z out of the door,
  // doorway at z 0.95, floor 0.02 up.
  if (PROPS === "picked") {
    const tg = new THREE.Group(); tg.position.copy(TENT.at).setY(0); tg.rotation.y = TENT.yaw; scene.add(tg); tg.updateMatrixWorld(true);
    spots.push({ name: "tent", parent: tg, at: V(0, 0.04, 0.9), yaw: Math.PI, clip: "peek", scale: 1.9, noHop: true,
      via: tg.localToWorld(V(0, 0, 1.7)).setY(0), door: tg.localToWorld(V(0, 0, 0.3)).setY(0) });
  }
  // two low branches right at the camp's edge (Adriaen 2026-11-12): the tips nearest the fire clear of the wild sloths
  const tips = [];
  for (const c of branchCurves.filter((c) => c.low)) for (const t of [0.8, 0.9, 1]) { const p = c.getPointAt(t); if (Math.hypot(p.x, p.z) < RC + 0.3) tips.push({ p, tan: c.getTangentAt(t), c, t }); }
  tips.sort((a, b) => Math.hypot(a.p.x, a.p.z) - Math.hypot(b.p.x, b.p.z));
  for (const tip of tips) {
    if (spots.filter((q) => q.branch).length >= 2) break;
    if (sloths.some((s) => s.p.distanceTo(tip.p) < 1.2) || spots.some((q) => q.branch && q.top.distanceTo(tip.p) < 1.6)) continue;
    const tan = tip.tan.clone(); if (tan.x * tip.p.x + tan.z * tip.p.z > 0) tan.negate();   // head toward the fire, as the wild ones
    const tree = treeOf(tip.c), t0 = branchBase(tip.c, tree), out = tip.c.getPointAt(t0).sub(tree).setY(0).normalize();
    spots.push({ name: "branch", branch: true, top: tip.p.clone(), tan, curve: tip.c, t: tip.t, t0, tree, out, parent: scene, clip: "cling", scale: SL,
      door: tree.clone().addScaledVector(out, trunkR0(0) + 0.35) });
  }
}

// nap trips (Adriaen 2026-11-12: "room for multiple sloths in the bed in the tent, much cozier than the ground; room for
// multiple in the hammock, they can cuddle together; more seats in the car a sleepy sloth could sleep in"): the places a
// sloth may go to for a nap instead of food (day.js napTrip). Two in the bed or the hammock lie side by side.
function buildGuests() {
  const H = spots.find((q) => q.name === "hammock"), Jp = spots.find((q) => q.name === "jeep"), Tp = spots.find((q) => q.name === "tent");
  if (H) guests.push({ ...H, key: "hammock:1", at: V(-0.42, 0.72 - PIV + 0.04, 0.02), asleep: false, guest: true, home: false, who: null });
  if (Jp && jeepApi?.seat) guests.push({ ...Jp, key: "jeep:P", at: Jp.parent.worldToLocal(jeepApi.seat.clone()), yaw: Math.PI, clip: "curl", scale: 2.2, guest: true, home: false, who: null });
  if (Tp) {                                         // the bed along the tent's left wall (campLife.js), tent frame: x -0.92, z -1.2 .. 0.4
    const tent = scene.getObjectByName("Tent"), top = (x, z) => { const w = Tp.parent.localToWorld(V(x, 0, z)); ray.set(V(w.x, 1.2, w.z), DOWN); ray.far = 1.2; const h = tent && ray.intersectObject(tent, true)[0]; return h ? h.point.y : 0.3; };
    for (const [i, dx, yaw] of [[0, 0.1, Math.PI - 0.2], [1, -0.1, Math.PI + 0.2]]) { const x = -0.92 + dx, z = -0.45; guests.push({ ...Tp, bed: true, key: `bed:${i}`, at: V(x, top(x, z) - 0.07, z), yaw, clip: "nap", scale: 1.9, guest: true, home: false, who: null }); }
  }
}

const claimHome = (s) => { claim(`${s.spot.name}:${s.name}`, s); if (s.spot.name === "seat") claim("log:0", s); };
const releaseHome = (s) => { release(`${s.spot.name}:${s.name}`, s); if (s.spot.name === "seat") release("log:0", s); };

export { brush, buildGuests, buildSpots, claimHome, hammock, releaseHome };
