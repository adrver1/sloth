// Canopy Camp sloths, the jeep's engine (Adriaen 2026-11-12: "a sloth can occasionally open the hood, take out a spanner
// and work on the engine"): the jeep's own sloth goes round to the front, opens the hood, climbs up onto the front of the
// engine bay and works at the engine with a spanner (its paw dipping and turning, the eat clip held round its grab), then
// climbs down and shuts the hood. Spanner: two boxes, 24 triangles, shown only while it works.
//   buildSpanner()         makes the spanner and adds it to the scene, hidden (sloths.js, in its place in the build order)
//   fixEngine(s, done)     s (holding the place "jeep:hood") walks to the jeep's front and starts the fix phase; done()
//                          runs when it is back on the ground and the hood is shut
//   fixStep(s, T, sd)      the fix phase, each frame
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { jeepApi, scene } from "../stage.js";
import { V } from "../util.js";
import { release } from "../places.js";
import { setTrip } from "./state.js";
import { play } from "./clips.js";
import { UP, yawOf } from "./poses.js";
import { turnYaw } from "../actor.js";
import { move, moveStep } from "./moves.js";
import { pawOf } from "./arms.js";
import { walkTo } from "./walk.js";

let spanner = null;
const paw = V(), qPaw = new THREE.Quaternion();
function buildSpanner() {
  spanner = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.012, 0.13, 0.006).translate(0, 0.065, 0), new THREE.BoxGeometry(0.04, 0.022, 0.007).translate(0, 0.135, 0)]), new THREE.MeshLambertMaterial({ color: 0x9aa3ab }));
  spanner.visible = false; scene.add(spanner);
}
function fixEngine(s, done) {
  const J = jeepApi, front = J.engineFront.clone();   // where it stands and where it sits to work (jeep.js jeepApi)
  walkTo(s, front, () => { setTrip(s, "fix", { st: "turn", front, sit: J.engineSeat.clone(), done }); play(s, "idle", 1); J.open("H"); });
}
function fixStep(s, T, sd) {
  const J = jeepApi, n = J.node, back = yawOf(n);   // facing the windscreen from the front (the jeep looks along its +Z)
  if (T.st === "turn") {
    turnYaw(T, "yaw", back, sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
    if (!J.isOpen("H")) J.open("H"); else if (T.t > 2.5) { T.yaw = back; play(s, "hang_walk", 1, 2); move(s, T, T.sit, 4, 0.15, -0.5, () => { T.st = "reach"; T.t = 0; play(s, "eat", 0.8); }); }
  } else if (T.st === "move") moveStep(s, T);
  else if (T.st === "reach") { if (s.act.time > 1.5) { T.st = "work"; T.t = 0; s.act.paused = true; } }
  else if (T.st === "work") {                      // the paw dips and turns at the engine, now and then a look at its work
    s.act.time = 1.85 + 0.28 * Math.sin(T.t * 3.2) * (0.6 + 0.4 * Math.sin(T.t * 0.7));
    if (T.t > 0.3) { spanner.visible = true; pawOf(s, paw); spanner.position.copy(paw); spanner.quaternion.copy(s.arm[1].getWorldQuaternion(qPaw)); spanner.scale.setScalar(s.sc / 2.4); }
    if (Math.sin(T.t * 0.9) > 0.97 && !s.nod) s.nod = 0.8;
    if (T.t > 14) { spanner.visible = false; s.act.paused = false; T.st = "down"; T.t = 0; play(s, "idle", 1); }
  } else if (T.st === "down") {
    if (T.t > 1.2) { play(s, "hang_walk", 1, -2); move(s, T, T.front, 4, 0.15, -0.5, () => { J.close("H"); release("jeep:hood", s); T.done(); }); }
  }
}

export { buildSpanner, fixEngine, fixStep };
