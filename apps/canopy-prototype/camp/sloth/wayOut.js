// Canopy Camp sloths, the way out of a spot: back out the way it came in, onto the ground, each spot in its own way.
//   exitSpot(s, go)              s (at home, its trip a fresh one) backs out of its spot: out of the tent's bed, down its
//                                tree, back along the laundry line and down the post, up the hammock's rope and down the
//                                post, out through the jeep's door, or just off its seat to the door; go() runs when it is
//                                on the ground
//   exitStep(s, T, sd, spot)     the exit phase (the jeep): waits for the door, onto the sill, down to the ground
// Climbing (Adriaen 2026-11-12: "climb down the tree rather than a vine"): a branch sloth turns round on its branch, goes
// hand over hand along it to the trunk, turns onto the trunk and climbs down it tail first, facing the bark, then steps
// off onto the ground (wayIn.js climbUp is the same the other way). Trunk radius from barkProfile; speed is hang_walk's.
import * as THREE from "three";
import { jeepApi } from "../jeep.js";
import { scene } from "../core.js";
import { V, yawFrom, yawTo } from "../util.js";
import { LAUNDRY } from "../layout.js";
import { HAMMOCK_PIVOT } from "../swing.js";
import { CRAWL, HW, HW_POST, WALK_TS, setTrip } from "./state.js";
import { play } from "./clips.js";
import { ROPE_L, barkProfile, climbYaw, linePose, postPose, ropePose, trunkAt, underAt, yawOf, yawQ } from "./poses.js";
import { climbV, glide, postV, slide, toGround } from "./moves.js";
import { brush } from "./spots.js";

const tmp = V();
function climbDown(s, then) {
  const { curve: c, t, t0, tree, out } = s.spot, L = c.getLength();
  const yTop = c.getPointAt(t0).y - 0.25 * s.sc, bark = barkProfile(tree, out, yTop), back = (u) => underAt(s, c.getPointAt(u), c.getTangentAt(u).negate());
  play(s, "hang_walk", 1.2, HW);
  glide(s, back(t), 2.5, () => slide(s, t, t0, climbV(s) / L, back, () => {
    play(s, "hang_walk", 1.5, -HW);
    glide(s, trunkAt(s, tree, out, yTop, bark), 3, () => slide(s, yTop, 0, climbV(s), (y) => trunkAt(s, tree, out, y, bark),
      () => toGround(s, tree.clone().addScaledVector(out, bark(0) + 0.45), yawTo(out), then)));
  }));
}
function downPost(s, spot, top, then) {             // from the top of a post, tail first down to the ground
  play(s, "hang_walk", 1.5, -HW_POST);
  glide(s, postPose(spot, top), 3, () => slide(s, top, 0, postV(s), (y) => postPose(spot, y),
    () => { const yaw = (spot.climbYaw ?? climbYaw) + Math.PI; toGround(s, spot.door.clone().add(V(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(0.3)), yaw, then); }));
}
// out of the tent bed (Adriaen 2026-11-13: "add a climb out of bed animation", not a glide): turn to the open side and
// crawl to the edge, reach down over it nose first, step down onto the floor, then off to the door. Tent frame: the bed
// lies along the left wall at x -0.92 (about 0.6 wide), the floor 0.02 up, +z out of the door.
function bedOut(s, spot, go) {
  const z = spot.at.z, top = spot.at.y, side = -Math.PI / 2, Q = (yaw, pitch = 0) => yawQ(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch));
  play(s, "walk", 1.2, WALK_TS);
  glide(s, { p: V(-0.62, top, z), q: Q(side) }, 2.4, () =>                                   // round and to the edge
    glide(s, { p: V(-0.5, top - 0.06, z), q: Q(side, -0.55) }, 1.2, () =>                    // paws over, nose down
      glide(s, { p: V(-0.36, 0.02, z), q: Q(side, -0.3) }, 1.4, () =>                       // down onto the floor
        glide(s, { p: V(-0.25, 0.02, z + 0.05), q: Q(side + 0.4) }, 1.0, () => {            // level again, turning to the door
          const door = spot.door, away = yawFrom(s.o.getWorldPosition(tmp), door);
          scene.attach(s.o); play(s, "walk", 1, WALK_TS);
          glide(s, { p: door.clone(), q: yawQ(away) }, 2.2, () => {
            const out = yawFrom(door, spot.via); s.trip.yaw = out;
            glide(s, { p: spot.via.clone(), q: yawQ(out) }, door.distanceTo(spot.via) / (CRAWL * s.sc), () => { s.trip.yaw = out; go(); });
          });
        }))));
}
function exitSpot(s, go) {
  const spot = s.spot;
  if (spot.bed) return bedOut(s, spot, go);
  if (spot.branch) return climbDown(s, go);
  if (spot.line) {                                  // hand over hand back along the line to post a, then down it
    const L = LAUNDRY.a.distanceTo(LAUNDRY.b);
    play(s, "hang_walk", 1.2, -HW_POST);
    return slide(s, spot.t, 0.05, postV(s) / L, (u, sd) => { const P = linePose(s, u); brush?.(P.at, true, sd); return P; }, () => downPost(s, spot, spot.top, go));
  }
  if (spot.climb) {                                 // the hammock: out of the sling, up the rope to the knot, down the post
    play(s, "hang_walk", 2, -HW_POST);
    return glide(s, ropePose(s, ROPE_L - 0.05), 3, () => slide(s, ROPE_L - 0.05, 0.1, postV(s), (u) => ropePose(s, u), () => { scene.attach(s.o); downPost(s, spot, HAMMOCK_PIVOT - 0.2 * s.sc, go); }));
  }
  if (spot.car) { setTrip(s, "exit", { go }); jeepApi.open("P"); return; }   // waits for the door, then climbs out (exitStep)
  const away = spot.via ? yawFrom(spot.door, spot.via) : yawFrom(s.o.getWorldPosition(tmp), spot.door);
  scene.attach(s.o); play(s, "walk", 1.5, WALK_TS);
  glide(s, { p: spot.door.clone(), q: yawQ(away) }, 2.5, () => {
    s.trip.yaw = away;
    if (!spot.via) return go();
    glide(s, { p: spot.via.clone(), q: yawQ(away) }, spot.door.distanceTo(spot.via) / (CRAWL * s.sc), () => { s.trip.yaw = away; go(); });
  });
}
function exitStep(s, T, sd, spot) {                 // out of the jeep: waits for the door, onto the sill, down to the ground
  const J = jeepApi;
  if (!J.isOpen("P")) J.open("P");
  else if (T.t > 1) {
    play(s, "hang_walk", 1, 2);
    glide(s, { p: spot.sill.clone(), q: yawQ(-Math.PI / 2) }, 3.5, () => {
      scene.attach(s.o); const yaw = yawOf(s.o);
      glide(s, { p: spot.door.clone(), q: yawQ(yaw) }, 2.5, () => { J.close("P"); s.trip.yaw = yaw; T.go(); });
    });
  }
}

export { exitSpot, exitStep };
