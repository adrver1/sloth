// Canopy Camp air: the camp's cozy atmosphere (../atmosphere.js) set in its places: smoke off the fire and out of the tent
// stove's pipe, sparks when you walk close, steam off the soup pot, butterflies by day that land on the sloths' noses and
// blinking fireflies at dusk (they replaced the old even firefly cloud, which is kept hidden).
// Exports buildAtmosphere(): main.js calls it once, after the tent; it makes the atmosphere (atmo, exported and returned), whose update(dt, time,
// dusk) main.js calls each frame.
import { createAtmosphere } from "../atmosphere.js";
import { D, camera, scene } from "./core.js";
import { RC, SOUP_POT, TENT } from "./layout.js";
import { sloths } from "./sloths.js";

let atmo = null;   // the atmosphere, once buildAtmosphere has made it
function buildAtmosphere() {
  return (atmo = createAtmosphere({ scene, camera, fx: D.fx, pot: SOUP_POT,
    chimneys: [TENT.fromLocal(...TENT.chimney)], sloths, roam: RC - 1.5 }));   // the tent stove's pipe mouth (build_camp.py wall_tent: STOVE, pipe top Z0 + H + 0.62)
}

export { atmo, buildAtmosphere };
