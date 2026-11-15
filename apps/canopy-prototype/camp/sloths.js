// Canopy Camp sloths, the way in for the rest of the page. The sloths' code is in camp/sloth/, one job per module; this
// module puts the sloths in the scene (buildSloths, main.js, once the props and the jeep are in; it waits for the sloth model's
// download) and hands main.js their frame steps.
// Adriaen 2026-11-12 ("simplify the gameplay loop"): no befriending. One wild sloth hangs in each big tree, and the seven
// named sloths (cast.js) live in the camp from the start, one in each spot (sloth/spots.js). Each now and then leaves its
// spot, crawls to the snack table or the kitchen crate to eat, and goes back the way it came (sloth/day.js). Clips:
// characters/sloth_baby/sloth_rig.py. ?campsloths=0 leaves the named ones out; core.js pace (window.__campFast
// for the tools) speeds them up for checks.
// sloth/build.js buildCast makes them, in its fixed order (the summit builds the same cast with it). The modules in camp/sloth/
// make nothing at their top level. The food places come later, in buildSlothPlaces, which main.js calls once every blocker is in.
// Exports: buildSloths() (async: it waits for the sloth model), buildSlothPlaces(), sloths (every sloth), hit (their tap
// spheres), OUT (the trip phases in which a camp sloth is away from its spot, sloth/state.js; jeepSeat.js), and the
// frame steps main.js calls in this order: slothsStep(dt)
// (sloth/life.js), campStep(dt) (sloth/step.js), hammockStep(dt) (sloth/naps.js), warmStep(...) (sloth/body.js).
import { OPT, PRE } from "./core.js";
import { V } from "./util.js";
import { addLabButton } from "./labButton.js";
import { EV, on } from "./events.js";
import { burst } from "./fx.js";
import { OUT, hit, sloths } from "./sloth/state.js";
import { warmStep } from "./sloth/body.js";
import { slothsStep } from "./sloth/life.js";
import { hammockStep } from "./sloth/naps.js";
import { buildPlaces } from "./sloth/table.js";
import { campStep } from "./sloth/step.js";
import { buildCast } from "./sloth/build.js";

// a chore near some camp sloths (events.js EV.cheer): the nearest ones after the first `skip`, one per word, nod and say it
// at once; a chore that wants them later queues the emit in its own frame time (review R2-031: the chores used to pick the
// sloths and write their nods themselves; R2-050: no setTimeout)
function cheer({ at, max, words, life, skip = 0 }) {
  const near = sloths.filter((s) => !s.wild && s.p).map((s) => [s, s.p.distanceTo(at)]).filter(([, d]) => d < max).sort((a, b) => a[1] - b[1]).map(([s]) => s);
  words.forEach((w, i) => { const s = near[skip + i]; if (s) { s.nod = 1.6; burst(s.p.clone().add(V(0, 0.3, 0)), w, life, 60); } });
}

async function buildSloths() {
  buildCast(await PRE.sloth);   // the model every sloth is made from (core.js started its download); sloth/build.js makes them
  on(EV.cheer, cheer);   // the camp sloths perk up at the chores (events.js); none with ?campsloths=0, as before
  addLabButton();   // the move lab's button in the ⚙️ menu, and ?lab (labButton.js), once there are sloths to inspect
}
// the food places at the snack table and the kitchen crate (sloth/table.js buildPlaces), once every blocker their ground
// points must keep clear of is in (main.js: after the glade, the tent's walls and the chores)
function buildSlothPlaces() { if (OPT.campsloths) buildPlaces(); }
export { OUT, buildSloths, buildSlothPlaces, campStep, hammockStep, hit, sloths, slothsStep, warmStep };
