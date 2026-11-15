// Canopy Camp sloths, what the sloth modules share: the lists of sloths, the sloth model, the few constants more than one of
// them needs, and setTrip. Nothing else lives here, nothing is built on import, and nothing is kept on window.
//   SLOTH     the sloth model (models/sloth.txt: its scene and clips), set once by sloths.js buildSloths (setSloth) before any
//             sloth is made from it; null until then (review R2-129: it used to live in campProps.js)
//   SL        a wild sloth's size (the model is 1; the camp sloths have their spot's size)
//   sloths    every sloth, wild and named, in the order they were made (debug.js's __boop(i) and __feed(i) index it)
//   hit       their tap spheres, one each (input.js casts its ray at these)
//   camp      the seven named sloths that live in the camp (empty with ?campsloths=0)
//   wild      the ones in the trees (filled once the named ones are placed)
//   spots     the homes in the camp, one per named sloth, in the order they are filled (spots.js builds them; spots[0] is
//             the hammock); guests: the cozy places a sloth goes to for a nap away from home (spots.js)
//   PHASES    every phase of a camp sloth's trip (s.trip.phase) with what it is (step.js has each one's frame step):
//             lively: it looks at you and waves (life.js); ground: it is on the ground, where the others walk round it
//             (walk.js, places.js movers); lend: the operator may pick it up (lend.js; at home only Sunny on its log);
//             out: it is away from its spot, not in it or on its way in or out (jeepSeat.js: the driver's seat is free)
//   LIVELY, GROUND, LENDABLE, OUT   the sets of phases with each of those, made from PHASES
//   SPEED     (inside) crawling and climbing are 1.4x what they first were (Adriaen: "sliiightly faster"): CRAWL metres a second per
//             unit of size, WALK_TS the walk clip's pace, HW and HW_POST the hang_walk clip's pace on a branch and on a post
//   MAX_OUT   how many may be away from home at once
//   setTrip(s, phase, fields)   starts a phase on a fresh trip record { phase, t: 0, yaw, ...fields }, keeping only the yaw
//             (fields may give its own), so nothing from an earlier phase is left on it (review R2-030: a rest kept the
//             last rest's slept and never went home). The steps inside a phase (eat's st, a greet in a walk) keep its record.
export let SLOTH = null;
export const setSloth = (gltf) => { SLOTH = gltf; };
export const SL = 2.6;
export const sloths = [], hit = [], camp = [], wild = [];
export const spots = [], guests = [];
// A new phase: add it here with its flags, and its step to step.js's STEP (or none, like home and held).
export const PHASES = {
  home: { lively: true },                                 // in its spot (day.js homeStep)
  walk: { ground: true, lend: true, out: true },          // along a path on the ground (walk.js)
  greet: { lively: true, ground: true, lend: true, out: true },   // sitting up to say hello to another (walk.js)
  eat: { lively: true, ground: true, out: true },         // at a food place, or playing cards there (eating.js)
  rest: { lively: true, ground: true, lend: true, out: true },    // sitting in the clearing (day.js)
  fix: { out: true },                                     // at the jeep's engine (fix.js)
  held: { out: true },                                    // borrowed by the operator (lend.js)
  exit: {}, door: {},                                     // out through the jeep's door, and in (wayOut.js, wayIn.js)
  slide: {}, glide: {},                                   // the two moves the ways in and out are made of (moves.js)
};
const having = (flag) => new Set(Object.keys(PHASES).filter((ph) => PHASES[ph][flag]));
export const LIVELY = having("lively"), GROUND = having("ground"), LENDABLE = having("lend"), OUT = having("out");
export const setTrip = (s, phase, fields) => (s.trip = { phase, t: 0, yaw: s.trip?.yaw ?? 0, ...fields });
const SPEED = 1.4;
export const CRAWL = 0.027 * 2.2 * SPEED, WALK_TS = 2.2 * SPEED, HW = 3.75 * SPEED, HW_POST = 2.5 * SPEED, MAX_OUT = 3;
