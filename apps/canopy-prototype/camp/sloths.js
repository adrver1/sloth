// Canopy Camp sloths, the way in for the rest of the page. The sloths' code is in camp/sloth/, one job per module; this
// module puts the sloths in the scene (buildSloths, main.js, once the props and the jeep are in) and hands main.js their
// frame steps.
// Adriaen 2026-11-12 ("simplify the gameplay loop"): no befriending. One wild sloth hangs in each big tree, and the seven
// named sloths (cast.js) live in the camp from the start, one in each spot (sloth/spots.js). Each now and then leaves its
// spot, crawls to the snack table or the kitchen crate to eat, and goes back the way it came (sloth/day.js). Clips:
// characters/sloth_baby/sloth_rig.py. ?campsloths=0 leaves the named ones out; core.js pace (window.__campFast
// for the tools) speeds them up for checks.
// The order in buildSloths is the order things are made in: the mouth card's material, the wild sloths, then the spots,
// the wayfinding grid, the things the sloths use, the named sloths, the guest spots, the saved state, and last the hooks.
// Later steps use what earlier ones made. The modules in camp/sloth/ make nothing at their top level: that goes in a build
// function called from here.
// Exports: sloths (every sloth), hit (their tap spheres), OUT (the trip phases in which a camp sloth is away from its spot,
// sloth/state.js; jeepSeat.js), and the frame steps main.js calls in this order: slothsStep(dt)
// (sloth/life.js), campStep(dt) (sloth/step.js), hammockStep(dt) (sloth/naps.js), warmStep(...) (sloth/body.js).
import { OPT, rng } from "./core.js";
const { R } = rng("sloths");
import { V, tris as triCount } from "./util.js";
import { HERO } from "./layout.js";
import { branchCurves } from "./forest.js";
import { CAST } from "./cast.js";
import { addLabButton } from "./labButton.js";
import { addCrowd } from "./places.js";
import { GROUND, OUT, camp, hit, sloths, spots, wild } from "./sloth/state.js";
import { hang, warmStep } from "./sloth/body.js";
import { slothsStep } from "./sloth/life.js";
import { treeOf } from "./sloth/poses.js";
import { buildFace } from "./sloth/face.js";
import { buildGuests, buildSpots } from "./sloth/spots.js";
import { buildNav } from "./sloth/walk.js";
import { hammockStep } from "./sloth/naps.js";
import { buildTable } from "./sloth/table.js";
import { buildCards } from "./sloth/cards.js";
import { buildSmore } from "./sloth/smore.js";
import { buildSpanner } from "./sloth/fix.js";
import { placeHome } from "./sloth/wayIn.js";
import { watchFood } from "./sloth/day.js";
import { restore } from "./sloth/saved.js";
import { campStep } from "./sloth/step.js";
import { addHooks } from "./sloth/hooks.js";

function buildSloths() {
  buildFace();   // the mouth card's texture, material and geometry (sloth/face.js)
  // one wild sloth in each big tree, on the low branch reaching furthest out, so the branches nearest the fire stay free for
  // the camp's two branch sloths (the tripod sloth is gone; Adriaen: too close to the fire)
  for (const tree of HERO) {
    const mine = branchCurves.filter((c) => c.low && treeOf(c).distanceTo(V(tree.x, 0, tree.z)) < 0.1).sort((a, b) => b.getPointAt(0.65).length() - a.getPointAt(0.65).length());
    for (const c of mine) {
      const t = R(0.5, 0.8), p = c.getPointAt(t), tan = c.getTangentAt(t);
      if (tan.x * p.x + tan.z * p.z > 0) tan.negate();   // head toward the middle of the clearing, so you meet its face
      if (sloths.every((s) => s.p.distanceTo(p) > 1.6)) { hang(p, tan); sloths.at(-1).wild = true; break; }
    }
  }
  if (OPT.campsloths) {
    buildSpots();   // the hammock, the seat, the jeep, the line, the tent and two branches
    buildNav();     // the wayfinding grid
    addCrowd(() => camp.filter((o) => GROUND.has(o.trip.phase)).map((o) => [o.o.position, 0.18 * o.sc]));   // the sloths on the ground are movers (places.js)
    // the things they use: where the paw is at the grab and the fruits, the spanner, the cards, the s'more stick and marshmallow
    buildTable(); buildSpanner(); buildCards(); buildSmore();
    // the seven named sloths (cast.js), each in its own spot (its cast entry's home; the two branch sloths take the two
    // branches in cast order). A spot that is not there (no jeep, no laundry line) leaves its sloth out.
    const homed = new Set();
    for (const spot of spots) {
      const c = CAST.find((k) => k.home === spot.name && !homed.has(k)); if (!c) continue;
      homed.add(c);
      const k = c.scale ?? 1;   // its own size against the others (Pip is the smallest), kept as s.k for every spot it goes to
      hang(V(0, 0, 0), V(1, 0, 0), spot.scale * k);
      const s = sloths.at(-1); c.dress?.(s.head, s.o);
      Object.assign(s, { name: c.name, k, spot, greetCD: R(0, 10), smoreT: R(8, 20), gaze: 0, waveCD: 0 });
      spot.who = s; camp.push(s); placeHome(s);
    }
    { let tris = 0; for (const s of camp) s.o.traverse((m) => { if (m.isMesh && !m.isSkinnedMesh && m.geometry) tris += triCount(m.geometry); });
      console.info(`camp sloths: ${camp.length} named (${camp.map((s) => s.name).join(", ")}), traits ${tris} triangles in all; s'mores stick 8 + marshmallow 12`); }
    buildGuests();   // the cozy places for a nap away from home
    wild.push(...sloths.filter((s) => s.wild));
    restore();       // who was asleep, and who was napping where (the camp's save)
    watchFood(); addHooks();
  }
  addLabButton();   // the move lab's button in the ⚙️ menu, and ?lab (labButton.js), once there are sloths to inspect
}
export { OUT, buildSloths, campStep, hammockStep, hit, sloths, slothsStep, warmStep };
