// Canopy Camp sloths, what the sloth modules share: the lists of sloths, the sloth model and the few constants more than one of them needs.
// Nothing else lives here, nothing is built on import, and nothing is kept on window.
//   SLOTH     the sloth model (models/sloth.txt: its scene and clips), set once by sloths.js buildSloths (setSloth) before any
//             sloth is made from it; null until then (review R2-129: it used to live in campProps.js)
//   SL        a wild sloth's size (the model is 1; the camp sloths have their spot's size)
//   sloths    every sloth, wild and named, in the order they were made (debug.js's __boop(i) and __feed(i) index it)
//   hit       their tap spheres, one each (input.js casts its ray at these)
//   camp      the seven named sloths that live in the camp (empty with ?campsloths=0)
//   wild      the ones in the trees (filled once the named ones are placed)
//   spots     the homes in the camp, one per named sloth, in the order they are filled (spots.js builds them; spots[0] is
//             the hammock); guests: the cozy places a sloth goes to for a nap away from home (spots.js)
//   LIVELY    the phases of a camp sloth's day in which it looks at you and waves (see life.js)
//   GROUND    the phases in which it is on the ground, where the others walk round it
//   SPEED     (inside) crawling and climbing are 1.4x what they first were (Adriaen: "sliiightly faster"): CRAWL metres a second per
//             unit of size, WALK_TS the walk clip's pace, HW and HW_POST the hang_walk clip's pace on a branch and on a post
//   MAX_OUT   how many may be away from home at once
export let SLOTH = null;
export const setSloth = (gltf) => { SLOTH = gltf; };
export const SL = 2.6;
export const sloths = [], hit = [], camp = [], wild = [];
export const spots = [], guests = [];
export const LIVELY = new Set(["home", "eat", "rest", "greet"]);
export const GROUND = new Set(["walk", "greet", "eat", "rest"]);
const SPEED = 1.4;
export const CRAWL = 0.027 * 2.2 * SPEED, WALK_TS = 2.2 * SPEED, HW = 3.75 * SPEED, HW_POST = 2.5 * SPEED, MAX_OUT = 3;
