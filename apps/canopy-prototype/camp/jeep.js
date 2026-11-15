// Canopy Camp jeep: the Expedition at the clearing edge, its doors, the live cabin light and its far LOD (props/jeep/); the
// working parts are jeepRig.js, which the summit's jeep shares.
// Exports (all stay at their empty value with ?jeep=none):
//   buildJeep()      main.js, once the props stand: waits for the jeep's downloads, parks it and adds its two blockers
//   jeepStep(dt)     main.js, each frame: moves the doors and fades the cabin light
//   jeepApi          { node, doors, open(w), close(w), isOpen(w), seat, sill, engineFront, engineSeat } for the other camp
//                    modules (the tools see it as window.__jeep, debug.js): w is "P" | "D" | "B" | "H" (the hood); seat (the
//                    driver's cushion top, SeatP), sill (DoorP's sill), engineFront (on the ground before the bumper) and
//                    engineSeat (on the front of the engine bay: sloth/fix.js) are world positions; doors is the doors' tap
//                    targets (jeepSeat.js, targets.js).
//                    Sitting in the front seats is not part of jeepApi: jeepSeat.js has its own seatApi, and no other module adds to it.
//   cabinLive        { receive(object) }: that object takes the cabin light's shadow (campGround.js gives it the floor and the baked props)
// The jeep (props/jeep/build_jeep.py) is parked at the clearing edge between the hammock and the first big tree (JEEP_AT, with its
// track, in layout.js), along the edge, its driver's side (local +X: left-hand drive) toward the fire. Its three doors and the
// hood open and close from their menus: DoorP (the camp side: the driver's door, to SeatP), DoorD (the passenger's, at -X),
// BackDoor (with the spare) and Hood, each a node on its hinge (the node names are build_jeep.py's).
// The cabin light is live (one shadowed spot light); the baked cabin light, door spill and headlights were dropped from the bake
// on 2026-11-12, and their shader path from the page (review R2-210). The unread cargo deck spots went too (R2-216).
import * as THREE from "three";
import { JEEP, PRE, camera, renderer, scene } from "./core.js";
import { trisIn } from "./util.js";
import { rigJeep } from "./jeepRig.js";
import { JEEP_AT, JEEP_TAN, wearBlockers } from "./layout.js";
import { addBlocker } from "./campProps.js";

let jeepStep = () => {}, jeepApi = null, cabinLive = null;
async function buildJeep() {
  if (JEEP === "none") return;
  const J = await PRE.jeep, at = JEEP_AT, tan = JEEP_TAN;
  const jeep = J.scene;
  const jm = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glassM = new THREE.MeshLambertMaterial({ color: 0xa9c4cc, transparent: true, opacity: 0.25, depthWrite: false });   // see-through, a little tinted
  jeep.traverse((m) => { if (m.isMesh) { m.material = m.name.startsWith("Glass") ? glassM : jm; if (m.name.startsWith("Glass")) m.renderOrder = 2; } });
  // far away (camp review P7): beyond about 12 m the JeepLOD (props/jeep/build_jeep.py jeep_lod, one mesh of under 700 triangles
  // after the R2-148/168/190/191 rebake) stands in for the full jeep (about 5,300 triangles in 10 meshes after that rebake;
  // build_jeep.py prints both counts), never while a door is open. Only the jeep's own meshes are hidden, so a sloth sitting
  // in it (parented to the jeep) stays.
  const far = (await PRE.jeepLod)?.scene;
  { let n = 0; jeep.traverse((m) => { if (m.isMesh) n++; }); console.log(`LOG jeep: ${trisIn(jeep)} tris in ${n} draws; far LOD: ${far ? `${trisIn(far)} tris` : "none"}`); }
  if (far) { far.traverse((m) => { if (m.isMesh) m.material = jm; }); far.visible = false; scene.add(far); }
  jeep.position.copy(at); jeep.rotation.set(0, Math.atan2(tan.x, tan.z), 0); scene.add(jeep); jeep.updateMatrixWorld(true);
  if (far) { far.position.copy(jeep.position); far.rotation.copy(jeep.rotation); }
  for (const b of wearBlockers("jeep")) addBlocker(b);   // two circles along the jeep (layout.js WEAR)
  // its doors, hood, cabin light and far look: the same rig as the summit's jeep (jeepRig.js)
  jeep.traverse((m) => { if (m.isMesh && !m.name.startsWith("Glass")) { m.castShadow = true; m.receiveShadow = true; } });
  cabinLive = { receive: (o) => o.traverse((m) => { if (m.isMesh) m.receiveShadow = true; }) };
  const rig = rigJeep(jeep, { camera, renderer, far: far || null });
  jeepStep = rig.step; jeepApi = rig.api;
}

export { buildJeep, cabinLive, jeepApi, jeepStep };
