// Canopy Camp sloths, the way in for the rest of the page. The sloths' code is in camp/sloth/, one job per module; this
// module puts the sloths in the scene (buildSloths, main.js, once the props and the jeep are in; it waits for the sloth model's
// download) and hands main.js their frame steps.
// Adriaen 2026-11-12 ("simplify the gameplay loop"): no befriending. One wild sloth hangs in each big tree, and the seven
// named sloths (cast.js) live in the camp from the start, one in each spot (sloth/spots.js). Each now and then leaves its
// spot, crawls to the snack table or the kitchen crate to eat, and goes back the way it came (sloth/day.js). Clips:
// characters/sloth_baby/sloth_rig.py. ?campsloths=0 leaves the named ones out; core.js pace (window.__campFast
// for the tools) speeds them up for checks.
// The order in buildSloths is the order things are made in: the mouth card's material, the wild sloths, then the spots,
// the wayfinding grid, the things the sloths use, the named sloths, the guest spots, the saved state, and last the hooks.
// Later steps use what earlier ones made.
// Two seeded streams (core.js rng, review R2-117): "sloths" places them (the wild sloths' branch points and makeSloth's
// draws, all made here in this fixed order), and "slothDay" times what they do once the camp runs (blinks, naps,
// errands, greetings, cards), so a change to their behaviour never moves where a wild sloth hangs. The modules in camp/sloth/ make nothing at their top level: that goes in a build
// function called from here. The food places come later, in buildSlothPlaces, which main.js calls once every blocker is in.
// Exports: buildSloths() (async: it waits for the sloth model), buildSlothPlaces(), sloths (every sloth), hit (their tap
// spheres), SLOTH (the sloth model, for operator/buddy.js), OUT (the trip phases in which a camp sloth is away from its spot,
// sloth/state.js; jeepSeat.js), and the frame steps main.js calls in this order: slothsStep(dt)
// (sloth/life.js), campStep(dt) (sloth/step.js), hammockStep(dt) (sloth/naps.js), warmStep(...) (sloth/body.js).
import { OPT, PRE, rng } from "./core.js";
const { R } = rng("sloths");        // placement only: which branch point each wild sloth hangs at (and makeSloth's three draws)
const day = rng("slothDay").R;      // the run-time timers (greetings, s'mores), like every module in sloth/ (review R2-117)
import { V, tris as triCount } from "./util.js";
import { HERO } from "./layout.js";
import { branchCurves } from "./forest.js";
import { CAST } from "./cast.js";
import { addLabButton } from "./labButton.js";
import { addCrowd } from "./places.js";
import { GROUND, OUT, SLOTH, camp, hit, setSloth, sloths, spots, wild } from "./sloth/state.js";
import { bodyWarm, makeSloth, placeUnder, warmStep } from "./sloth/body.js";
import { slothsStep } from "./sloth/life.js";
import { treeOf } from "./sloth/poses.js";
import { buildFace } from "./sloth/face.js";
import { buildGuests, buildSpots } from "./sloth/spots.js";
import { buildNav } from "./sloth/walk.js";
import { hammockStep } from "./sloth/naps.js";
import { buildPlaces, buildTable } from "./sloth/table.js";
import { buildCards } from "./sloth/cards.js";
import { buildSmore } from "./sloth/smore.js";
import { buildSpanner } from "./sloth/fix.js";
import { placeHome } from "./sloth/wayIn.js";
import { watchFood } from "./sloth/day.js";
import { restore } from "./sloth/saved.js";
import { campStep } from "./sloth/step.js";
import { addHooks } from "./sloth/hooks.js";

async function buildSloths() {
  setSloth(await PRE.sloth);   // the model every sloth is made from (core.js started its download; sloth/state.js keeps it)
  buildFace(bodyWarm);   // the mouth card's texture, material and geometry, with the body's warm glow (sloth/face.js)
  // one wild sloth in each big tree, on the low branch reaching furthest out, so the branches nearest the fire stay free for
  // the camp's two branch sloths (the tripod sloth is gone; Adriaen: too close to the fire)
  for (const { at: tree } of HERO) {
    const mine = branchCurves.filter((c) => c.low && treeOf(c).distanceTo(V(tree.x, 0, tree.z)) < 0.1).sort((a, b) => b.getPointAt(0.65).length() - a.getPointAt(0.65).length());
    for (const c of mine) {
      const t = R(0.5, 0.8), p = c.getPointAt(t), tan = c.getTangentAt(t);
      if (tan.x * p.x + tan.z * p.z > 0) tan.negate();   // head toward the middle of the clearing, so you meet its face
      if (sloths.every((s) => s.p.distanceTo(p) > 1.6)) { const s = makeSloth(); placeUnder(s, p, tan); s.wild = true; break; }
    }
  }
  if (OPT.campsloths) {
    buildSpots();   // the hammock, the seat, the jeep, the line, the tent and two branches
    buildNav();     // the wayfinding grid
    addCrowd((visit) => { for (const o of camp) if (GROUND.has(o.trip.phase)) visit(o.o.position, 0.18 * o.sc); });   // the sloths on the ground are movers (places.js)
    // the things they use: where the paw is at the grab and the fruits, the spanner, the cards, the s'more stick and marshmallow
    buildTable(); buildSpanner(); buildCards(); buildSmore();
    // the seven named sloths (cast.js), each in its own spot (its cast entry's home; the two branch sloths take the two
    // branches in cast order). A spot that is not there (no jeep, no laundry line) leaves its sloth out.
    const homed = new Set();
    for (const spot of spots) {
      const c = CAST.find((k) => k.home === spot.name && !homed.has(k)); if (!c) continue;
      homed.add(c);
      const k = c.scale ?? 1;   // its own size against the others (Pip is the smallest), kept as s.k for every spot it goes to
      const s = makeSloth(spot.scale * k); c.dress?.(s.head, s.o);
      Object.assign(s, { name: c.name, k, spot, greetCD: day(0, 10), smoreT: day(8, 20), gaze: 0, waveCD: 0 });
      spot.who = s; camp.push(s); placeHome(s);
    }
    { const per = []; let all = 0;   // every trait mesh (cast.js marks them), skinned or not, with its triangles
      for (const s of camp) s.o.traverse((m) => { if (m.userData.trait) { const n = triCount(m.geometry); all += n; per.push(`${s.name} ${m.name.replace("trait_", "")} ${n}`); } });
      console.info(`camp sloths: ${camp.length} named (${camp.map((s) => s.name).join(", ")}); trait triangles: ${per.join(", ")} (${all} in all); s'mores stick 8 + marshmallow 12`); }
    buildGuests();   // the cozy places for a nap away from home
    wild.push(...sloths.filter((s) => s.wild));
    restore();       // who was asleep, and who was napping where (the camp's save)
    watchFood(); addHooks();
  }
  addLabButton();   // the move lab's button in the ⚙️ menu, and ?lab (labButton.js), once there are sloths to inspect
}
// the food places at the snack table and the kitchen crate (sloth/table.js buildPlaces), once every blocker their ground
// points must keep clear of is in (main.js: after the glade, the tent's walls and the chores)
function buildSlothPlaces() { if (OPT.campsloths) buildPlaces(); }
export { OUT, buildSloths, buildSlothPlaces, campStep, hammockStep, hit, SLOTH, sloths, slothsStep, warmStep };
