// Canopy Camp, lived in: the last things set down on the finished clearing, in the order they must happen. Each is built by
// its own module; this file only holds the order, and waits for the ground mask's download:
//   1. the ground (campGround.js): painted round the blockers as the props, the deadwood and the sloths left them
//   2. the tent's walls, bed and stove (tentInside.js): they join the blockers only now, after the ground has read them
//   3. the atmosphere (campAir.js)
//   4. your chores (chores.js)
// Exports acts, atmo, groundLife and shadowStep (campGround.js's), which main.js steps each frame. Nothing to do with
// sloth/hooks.js campLife, the sloths' API for who is where; main.js imports from here, so the name stays for now.
import { PRE } from "./core.js";
import { buildGround, shadowStep } from "./campGround.js";
import { buildTentInside } from "./tentInside.js";
import { buildAtmosphere } from "./campAir.js";
import { buildChores } from "./chores.js";

const groundLife = buildGround(await PRE.groundMask);
buildTentInside();
const atmo = buildAtmosphere();
const acts = buildChores();

export { acts, atmo, groundLife, shadowStep };
