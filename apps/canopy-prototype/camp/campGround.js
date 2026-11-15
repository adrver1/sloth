// Canopy Camp ground: the one wild, lived-in ground of the camp (../ground.js): worn dirt round the fire, the props and the
// paths between them, grass tufts, tall grass, wildflowers and clover, with the baked ground (props/ground/bake_ground.py), its
// baked shadows and its night light: one ground for the clearing, the bowl's rim and the forest floor (camp/terrain.js),
// painted with the forest's grass tile and sky.js's forest-floor tile. It shades the track's and path's overlays, and
// with the jeep's cabin light on, the floor and every baked prop take that light's shadow.
// Exports buildGround(): main.js awaits it once, after the props, the sloths, the deadwood and the glade stand and before the
// tent's walls join the blockers, since the plants keep off the blockers as they are then (the worn dirt and paths come from
// layout.js WEAR, review R2-255). It waits for the ground's downloads (core.js PRE groundMask, groundSoil, groundShadow,
// groundNight), so the baked maps are there from the first frame, and makes groundLife (exported and returned) and, when the
// ground has no baked night light, the painted light pools (campProps.js buildPools). castSunShadows(), which main.js calls
// once, when everything that stands in the clearing is built, casts the sun shadows live only when there is no baked shadow map.
import { createGround } from "../ground.js";
import { D, JEEP, LIVED, PRE, S, renderer, scene, uNight, uTime } from "./core.js";
import { FLOOR_OVERLAYS, grassTex, track, trackDist } from "./forest.js";
import { blockers, buildPools } from "./campProps.js";
import { FAR, RC, TENT, WEAR } from "./layout.js";
import { cabinLive } from "./jeep.js";
import { gladePlants } from "./glade.js";   // filled by buildGlade before the ground is built: its plants go in the ground's one draw
import { groundHeight } from "./terrain.js";
import { forestFloorTex } from "./sky.js";

let groundLife = null;
// with no mask or soil, ground.js paints its wear map live; with no shadow map it casts the shadows live
async function buildGround() {
  const [mask, soil, shadowMap, nightMap] = await Promise.all([PRE.groundMask, PRE.groundSoil, PRE.groundShadow, PRE.groundNight]);
  groundLife = createGround({ baked: mask && soil ? { mask, soil } : null, height: groundHeight, far: FAR, forestMap: forestFloorTex, scene, RC, blockers, grassMap: grassTex, S, fx: D.fx, uTime, night: uNight, trackDist, trackPts: track ? track.pts : [], extra: gladePlants,
    wear: WEAR.filter((w) => ({ lived: LIVED, laundry: LIVED, jeep: JEEP !== "none" })[w.set] ?? true),   // the worn dirt and paths: only the things that are there
    bare: TENT.bare,   // no grass in the tent or through its planks
    // the baked ground shadows (ground.js renders them live without) and the night light baked with the props (only the
    // jeep's set has one, so with ?jeep=none core.js asks for none and the ground is lit live, with no 404s), both from
    // core.js LMDIR (models/, or a preview bake's folder)
    shadowMap, nightMap });
  groundLife.nightLoad.then(() => { if (!groundLife.isNightBaked()) buildPools(); });   // the light pools stand in only where there is no night bake
  for (const m of FLOOR_OVERLAYS) groundLife.shadeOn(m.material);
  if (cabinLive) {   // the jeep's cabin light is live: the floor and every baked prop take its shadow
    cabinLive.receive(groundLife.floor); scene.traverse((m) => { if (m.isMesh && m.material?.lightMap) m.receiveShadow = true; }); renderer.shadowMap.needsUpdate = true;
  }
  return groundLife;
}

// sun shadows (ground.js castShadows): rendered live once, and only when there is no baked shadow map (shadowMap above failed
// to load, or ?jeep=none asked for none); main.js calls this once every prop is built, and it waits for that download. Nothing runs per frame (R2-088: it used
// to scan the scene every second for half a minute).
function castSunShadows() { groundLife.shadowLoad.then(() => { if (!groundLife.isBaked()) groundLife.castShadows(renderer); }); }

export { buildGround, castSunShadows, groundLife };
