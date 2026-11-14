// Canopy Camp ground: the one wild, lived-in ground of the camp (../ground.js): worn dirt round the fire, the props and the
// paths between them, grass tufts, tall grass, wildflowers and clover, with the baked ground (props/ground/bake_ground.py), its
// baked shadows and its night light. It replaces the forest floor disc (sky.js), shades the track's and path's overlays, and
// with the jeep's cabin light on, the floor and every baked prop take that light's shadow.
// Exports buildGround(mask): campLife.js calls it once, after the props, the deadwood and the sloths stand and before the
// tent's walls join the blockers, since the worn dirt is painted round the blockers as they are then; groundLife (what it
// built; null until then) and shadowStep(), which main.js calls each frame to re-cast the sun shadows while the props load.
import { createGround } from "../ground.js";
import { D, JEEP, LOOK, PROPS, S, renderer, scene, uTime } from "./core.js";
import { FLOOR_OVERLAYS, clearing, track, trackDist } from "./forest.js";
import { blockers, uNight } from "./campProps.js";
import { FAR, RC, TENT } from "./layout.js";
import { cabinLive } from "./jeep.js";
import "./deadwood.js";   // before the ground is built, so its plants grow round the log, the stump and the dead trunk
import { groundHeight, vnoise } from "./terrain.js";
import { ground as forestFloor } from "./sky.js";

let groundLife = null;
// baked: the ground mask core.js downloaded (PRE.groundMask), or null: then ground.js paints its wear map live
function buildGround(baked) {
  groundLife = createGround({ baked, height: groundHeight, far: FAR, forestMap: forestFloor.material.map, noise: vnoise, scene, RC, blockers, clearing, S, look: LOOK, fx: D.fx, uTime, night: uNight, trackDist, trackPts: track ? track.pts : [],
    bare: TENT.bare,   // no grass in the tent or through its planks
    shadowMap: `models/camp_shadow_${PROPS}_${JEEP}.png`, nightMap: `models/camp_ground_night_${PROPS}_${JEEP}.png` });   // night light, baked with the props   // baked ground shadows; for a set with no bake, ground.js renders them live
  forestFloor.visible = false;   // one ground now: the clearing, the bowl's rim and the forest floor (camp/terrain.js)
  for (const m of FLOOR_OVERLAYS) groundLife.shadeOn(m.material);
  if (cabinLive) {   // the jeep's cabin light is live: the floor and every baked prop take its shadow
    cabinLive.receive(groundLife.floor); scene.traverse((m) => { if (m.isMesh && m.material?.lightMap) m.receiveShadow = true; }); renderer.shadowMap.needsUpdate = true;
  }
  window.__ground = groundLife;   // tool contract: props/shadow/export_casters.cjs reads its layout for the bake
  return groundLife;
}

// sun shadows (ground.js castShadows): re-cast whenever the props in the clearing change, checked each second for the first
// half minute while they load. main.js calls it each frame, just before it draws.
let shadowTick = -1, shadowN = -1;
function shadowStep() {
  if (uTime.value < 30 && Math.floor(uTime.value) !== shadowTick) { shadowTick = Math.floor(uTime.value); const n = groundLife.casters().length; if (n !== shadowN) { shadowN = n; groundLife.castShadows(renderer); } }
}

export { buildGround, groundLife, shadowStep };
