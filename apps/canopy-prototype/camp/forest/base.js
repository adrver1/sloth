// Canopy Camp forest base: what every forest step shares. The forest's random stream, the jeep's track and trackDist(), and UP.
// Exports R and rnd (the forest stream), track (layout.js JEEP_TRACK, or null with ?jeep=none), trackDist(x, z) and UP.
// The forest starts its stream where it always restarted the old shared one (3000 + ?seed), so its trees, and the root mounds
// under them that shape the ground the light and ground bakes were made on, stay where they were baked. Every step draws from
// this one stream in buildForest's order (forest.js), so do not draw from it at import time.
import { jeepDist } from "../terrain.js";
import { JEEP, OPT, rng } from "../core.js";
import { V } from "../util.js";
import { JEEP_TRACK, pathDist } from "../layout.js";

const { R, rnd } = rng("forest", 3000 + OPT.seed);
// the jeep's track (layout.js JEEP_TRACK), unless ?jeep=none. trackDist() thins trunks, leaves and ferns off the track, the
// path and the glade.
const track = JEEP === "none" ? null : JEEP_TRACK;
function trackDist(x, z) { return Math.min(jeepDist(x, z), pathDist(x, z)); }   // anything kept open: the jeep's track, the path, the glade
const UP = V(0, 1, 0);

export { R, rnd, track, trackDist, UP };
