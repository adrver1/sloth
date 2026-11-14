// Canopy Camp tap targets (review boot-08): every thing that lights up when you look at it (highlight.js) and opens a small
// menu when tapped. input.js does the lighting and the menus; the module that owns a thing adds it here. A target is made
// once per key, the first time it is asked for: { look (what lights up, or null), quiet (never lights up: a sloth, the
// operator), picks (what a tap's ray can hit), at(v) (its place: a sphere), ready() (in reach now), options() ([label, fn]
// pairs for the menu) }.
//   addTarget(key, make)        one thing (linger.js the log seats, clock.js, radio.js, car.js the key and the dash radio,
//                               operator/talk.js the operator)
//   addTargets(kind, list)      a set that changes: list() gives [key, make] pairs each time it is asked. kind is one of
//                               KINDS: "things" (chores.js: the wood pile, the fire, the pot...), "sloths" (input.js: their
//                               menu is your boop, feed and gift), "doors" (jeepSeat.js: the jeep's doors)
//   allTargets()                every target: the single things in the order they were added, then the sets in KINDS order
//   targetOf(object)            the target a picked object belongs to
// Nothing runs on import.
const KINDS = ["things", "sloths", "doors"];
const single = [], sets = new Map(), targets = new Map(), byPick = new Map();
const addTarget = (key, make) => single.push([key, make]);
const addTargets = (kind, list) => { if (!KINDS.includes(kind)) throw new Error("targets.js: unknown kind " + kind); sets.set(kind, list); };
function target(key, make) { let t = targets.get(key); if (!t) { t = make(); targets.set(key, t); for (const o of t.picks) byPick.set(o, t); } return t; }
function allTargets() {
  const out = [];
  for (const [k, make] of single) out.push(target(k, make));
  for (const kind of KINDS) { const list = sets.get(kind); if (list) for (const [k, make] of list()) out.push(target(k, make)); }
  return out;
}
const targetOf = (o) => byPick.get(o);

export { addTarget, addTargets, allTargets, targetOf };
