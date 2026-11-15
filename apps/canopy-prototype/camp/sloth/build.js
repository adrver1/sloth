// Canopy Camp sloths, building them (moved out of sloths.js so another level builds the same cast: the summit, Adriaen
// 2026-11-15 "life at the summit"). buildCast(gltf, { keep }) makes them from the sloth model, in this order: the mouth
// card's material, the wild sloths (one in each big tree, stage.js HERO; none at the summit), the spots (spots.js; a level's
// own with stage.js HOMES), the wayfinding grid, the things the sloths use, the seven named sloths (cast.js), each in the spot
// for it (its cast entry's home, or the spot's `for`), the guest spots, the saved state (keep: false leaves it out, and
// step.js then saves none either, with OPT.slothsave false), and last the hooks. Later steps use what earlier ones made.
// Two seeded streams (stage.js rng, review R2-117): "sloths" places them (the wild sloths' branch points and makeSloth's
// draws, all made here in this fixed order), and "slothDay" times what they do once they run.
import { branchCurves, HERO, OPT, rng } from "../stage.js";
const { R } = rng("sloths");
const day = rng("slothDay").R;
import { V, tris as triCount } from "../util.js";
import { CAST } from "../cast.js";
import { addCrowd } from "../places.js";
import { GROUND, camp, setSloth, sloths, spots, wild } from "./state.js";
import { bodyWarm, makeSloth, placeUnder } from "./body.js";
import { treeOf } from "./poses.js";
import { buildFace } from "./face.js";
import { buildGuests, buildSpots } from "./spots.js";
import { buildNav } from "./walk.js";
import { buildTable } from "./table.js";
import { buildCards } from "./cards.js";
import { buildSmore } from "./smore.js";
import { buildSpanner } from "./fix.js";
import { placeHome } from "./wayIn.js";
import { watchFood } from "./day.js";
import { restore } from "./saved.js";
import { addHooks } from "./hooks.js";

function buildCast(gltf, { keep = true } = {}) {
  setSloth(gltf);   // the model every sloth is made from (sloth/state.js keeps it)
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
      const c = CAST.find((k) => (spot.for ? k.name === spot.for : k.home === spot.name) && !homed.has(k)); if (!c) continue;   // a level's own home names its sloth (for)
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
    if (keep) restore();   // who was asleep, and who was napping where (the camp's save; the summit keeps none)
    watchFood(); addHooks();
  }
}

export { buildCast };
