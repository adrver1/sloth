// Canopy Camp sloths, what the sloth modules share: the lists of sloths and the few constants more than one of them needs.
// Nothing else lives here, nothing is built on import, and nothing is kept on window.
//   SL        a wild sloth's size (the model is 1; the camp sloths have their spot's size)
//   sloths    every sloth, wild and named, in the order they were made (main.js's __boop(i) and __feed(i) index it)
//   hit       their tap spheres, one each (input.js casts its ray at these)
//   camp      the seven named sloths that live in the camp (empty with ?campsloths=0)
//   LIVELY    the phases of a camp sloth's day in which it looks at you and waves (see life.js)
export const SL = 2.6;
export const sloths = [], hit = [], camp = [];
export const LIVELY = new Set(["home", "eat", "rest", "greet"]);
