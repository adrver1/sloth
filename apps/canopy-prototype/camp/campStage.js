// Canopy Camp's stage: hands the camp to the cast (stage.js setStage) before main.js imports it. What the camp makes later
// main.js hands over itself once it is made: the lanterns and the big trees' wood after buildProps and buildForest, the jeep
// after buildJeep, and the chores after buildChores (setStage takes only the names it is given).
// It also hands the camp to the shared player (player.js setPlayer: the camera, the ground, the clearing's bounds, the blockers)
// and puts you at the camp's start. Imported first by main.js, for its side effect.
import { D, KEYS, LIVED, OPT, S, camera, scene } from "./core.js";
import { me, setPlayer } from "./player.js";
import { campBounds, campStart } from "./campWalk.js";
import { blockers, blockersVersion } from "./campProps.js";
import { groundHeight } from "./terrain.js";
import { branchCurves, trunkR } from "./forest.js";
import { A0, CRATE, HAMMOCK, HERO, LAUNDRY, RC, SEATS, SEAT_GAPS, SEAT_R, SEAT_SLOT, SOUP_POT, TABLE, TENT } from "./layout.js";
import { setStage } from "./stage.js";
import { day } from "./daytime.js";

setStage({ day, scene, camera, OPT, LIVED, D, S, KEYS, me, groundAt: groundHeight, blockers, blockersVersion, branchCurves, trunkR,
  A0, CRATE, HAMMOCK, HERO, LAUNDRY, RC, SEATS, SEAT_GAPS, SEAT_R, SEAT_SLOT, SOUP_POT, TABLE, TENT });
setPlayer({ camera, groundAt: groundHeight, bounds: campBounds, blockers });
campStart(me);
