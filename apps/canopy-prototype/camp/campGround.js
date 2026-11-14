// Canopy Camp ground: the one wild, lived-in ground of the camp (../ground.js): worn dirt round the fire, the props and the
// paths between them, grass tufts, tall grass, wildflowers and clover, with the baked ground (props/ground/bake_ground.py), its
// baked shadows and its night light: one ground for the clearing, the bowl's rim and the forest floor (camp/terrain.js),
// painted with the forest's grass tile and sky.js's forest-floor tile. It shades the track's and path's overlays, and
// with the jeep's cabin light on, the floor and every baked prop take that light's shadow.
// Exports buildGround(mask): main.js calls it once, after the props, the sloths, the deadwood and the glade stand and before
// the tent's walls join the blockers, since the worn dirt is painted round the blockers as they are then; it makes groundLife
// (exported and returned); and castSunShadows(), which main.js calls once, when everything that stands in the clearing is built.
import { createGround } from "../ground.js";
import { D, JEEP, S, renderer, scene, uTime } from "./core.js";
import { FLOOR_OVERLAYS, grassTex, track, trackDist } from "./forest.js";
import { blockers, uNight } from "./campProps.js";
import { FAR, RC, TENT } from "./layout.js";
import { cabinLive } from "./jeep.js";
import { gladePlants } from "./glade.js";   // filled by buildGlade before the ground is built: its plants go in the ground's one draw
import { groundHeight, vnoise } from "./terrain.js";
import { forestFloorTex } from "./sky.js";

let groundLife = null;
// baked: the ground mask core.js downloaded (PRE.groundMask), or null: then ground.js paints its wear map live
function buildGround(baked) {
  groundLife = createGround({ baked, height: groundHeight, far: FAR, forestMap: forestFloorTex, noise: vnoise, scene, RC, blockers, grassMap: grassTex, S, fx: D.fx, uTime, night: uNight, trackDist, trackPts: track ? track.pts : [], extra: gladePlants,
    bare: TENT.bare,   // no grass in the tent or through its planks
    // the baked ground shadows (for a set with no bake, ground.js renders them live) and the night light baked with the
    // props; only the jeep's set has a night bake, so ?jeep=none asks for none and lights the ground live (no 404s)
    shadowMap: `models/camp_shadow_picked_${JEEP}.png`, nightMap: JEEP === "expedition" ? "models/camp_ground_night_picked_expedition.png" : null });
  for (const m of FLOOR_OVERLAYS) groundLife.shadeOn(m.material);
  if (cabinLive) {   // the jeep's cabin light is live: the floor and every baked prop take its shadow
    cabinLive.receive(groundLife.floor); scene.traverse((m) => { if (m.isMesh && m.material?.lightMap) m.receiveShadow = true; }); renderer.shadowMap.needsUpdate = true;
  }
  return groundLife;
}

// sun shadows (ground.js castShadows): rendered live once, and only when the baked shadow map (shadowMap above) failed to
// load; main.js calls this once every prop is built, and it waits for that download. Nothing runs per frame (R2-088: it used
// to scan the scene every second for half a minute).
function castSunShadows() { groundLife.shadowLoad.then(() => { if (!groundLife.isBaked()) groundLife.castShadows(renderer); }); }

export { buildGround, castSunShadows, groundLife };
