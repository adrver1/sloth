// Canopy Camp tap targets (review boot-08): every thing that lights up when you look at it (highlight.js) and opens a small
// menu when tapped. input.js does the lighting and the menus; the module that owns a thing adds it here. A target is made
// once per key, the first time it is asked for: { look (what lights up, or null), quiet (never lights up: a sloth, the
// operator), picks (what a tap's ray can hit), at(v) (its place: a sphere), ready() (in reach now), options() ([label, fn]
// pairs for the menu), and optionally tap() (a thing with one obvious use: a tap does it at once instead of opening the menu,
// trip.js's karaoke sign) }.
//   addTarget(key, make)        one thing (linger.js the log seats, clock.js, radio.js, car.js the key and the dash radio,
//                               operator/talk.js the operator, trip.js the karaoke sign)
//   addTargets(kind, items, make)  a set: items() gives its things (the same array while they stay the same, so nothing is
//                               rebuilt each frame), make(item) makes one's target, and each item is its key. kind is one
//                               of KINDS: "things" (chores.js: the wood pile, the fire, the pot...), "sloths" (input.js: their
//                               menu is your boop, feed and gift), "doors" (jeepSeat.js: the jeep's doors)
//   addOption(key, { ready, options })  more for the target of that key, from another module (chores.js: setting a bowl
//                               down on a log seat, whose target is linger.js's), so one thing has one menu (review
//                               R2-209). The target is then ready when it or any of these is, and its menu lists these
//                               options first (each while its ready() holds), then its own. Add them before the first
//                               allTargets() call (main.js's build list)
//   allTargets()                every target: the single things in the order they were added, then the sets in KINDS order.
//                               The same array each call, refilled: use it before the next call
//   targetOf(object)            the target a picked object belongs to
//   tick()                      input.js, at the start of each frame: a new frame for frameAt
//   frameAt(at)                 at(v) worked out at most once a frame, for a thing whose bounds take work (clock.js, the
//                               jeep's doors): at must return a sphere of its own, not one shared with other targets
// Nothing runs on import. (review R2-100: no lists, pairs or closures are made per frame)
const KINDS = ["things", "sloths", "doors"];
const single = [], sets = new Map(), targets = new Map(), byPick = new Map(), extra = new Map(), out = [];
let frame = 0;
const addTarget = (key, make) => single.push([key, make]);
const addTargets = (kind, items, make) => { if (!KINDS.includes(kind)) throw new Error("targets.js: unknown kind " + kind); sets.set(kind, [items, make]); };
function addOption(key, part) { let a = extra.get(key); if (!a) extra.set(key, (a = [])); a.push(part); }
function withExtra(t, parts) {
  if (!parts) return t;
  const ready = t.ready, options = t.options;
  t.ready = () => ready() || parts.some((p) => p.ready());
  t.options = () => { const o = []; for (const p of parts) if (p.ready()) o.push(...p.options()); if (ready()) o.push(...options()); return o; };
  return t;
}
function target(key, make, arg) { let t = targets.get(key); if (!t) { t = withExtra(make(arg), extra.get(key)); targets.set(key, t); for (const o of t.picks) byPick.set(o, t); } return t; }
function allTargets() {
  out.length = 0;
  for (const [k, make] of single) out.push(target(k, make));
  for (const kind of KINDS) { const s = sets.get(kind); if (s) for (const item of s[0]()) out.push(target(item, s[1], item)); }
  return out;
}
const targetOf = (o) => byPick.get(o);
const tick = () => { frame++; };
function frameAt(at) {
  let f = -1, S = null;
  return (v) => { if (f !== frame) { f = frame; S = at(v); } else v.copy(S.center); return S; };
}

export { addOption, addTarget, addTargets, allTargets, frameAt, targetOf, tick };
