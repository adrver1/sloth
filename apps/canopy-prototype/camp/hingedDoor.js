// A door that swings on its hinge, the same in every level (Adriaen 2026-11-16: "make the door openable like the car door"):
// swingStep moves a door toward where it is wanted with the jeep's ease and pace (jeepRig.js swings the jeep's doors, boot and
// hood with it), and addDoor makes a door of its own that lights up and opens a menu (targets.js), "Open the door" or "Close
// the door", like the jeep's (jeepSeat.js).
//   swingStep(d, dt)    d = { o, open, axis, cur, want }: o turns about axis to open * ease(cur / open); true while it moves
//   addDoor({ o, open, axis, name, reach, ready })   o: the door (its origin on the hinge, shut at rotation 0); open: how far
//                       it swings (rad); name: what the menu calls it; reach: metres from the camera; ready(): any other
//                       condition (the lookout's: you are up on its deck). Returns d; read d.cur to know how open it is
//   doorsStep(dt)       each frame, the doors addDoor made (summit/lookout.js lookoutStep)
// Nothing runs on import.
import * as THREE from "three";
import { ease } from "./util.js";
import { addTarget, frameAt } from "./targets.js";
import { camera, toStage } from "./stage.js";

export function swingStep(d, dt) {
  if (d.cur === d.want) return false;
  const s = dt * 1.8; d.cur += Math.max(-s, Math.min(s, d.want - d.cur));
  d.o.rotation[d.axis] = d.open * ease(d.cur / d.open);   // ease in and out
  return true;
}

const doors = [];
export function addDoor({ o, open, axis = "y", name = "door", reach = 3, ready = () => true }) {
  const d = { o, open, axis, cur: 0, want: 0 }, picks = [], box = new THREE.Box3(), sph = new THREE.Sphere(), tmp = new THREE.Vector3();
  o.traverse((m) => m.isMesh && picks.push(m));
  const at = frameAt((v) => { box.setFromObject(o).getBoundingSphere(sph); toStage(sph.center); v.copy(sph.center); return sph; });   // once a frame, in the stage's frame, as every target
  addTarget(o, () => ({ look: o, picks, at, ready: () => !!camera && ready() && at(tmp).distanceToPoint(camera.position) < reach,
    options: () => [[(d.want ? "Close the " : "Open the ") + name, () => (d.want = d.want ? 0 : d.open)]] }));
  doors.push(d); return d;
}
export function doorsStep(dt) { for (const d of doors) swingStep(d, dt); }
