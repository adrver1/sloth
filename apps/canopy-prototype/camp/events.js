// Canopy Camp signals: the few messages between modules that do not import each other, all named here with what they carry,
// who sends them and who hears them (review R2-031: they were window events with no list). A plain list of listeners, run at
// once in the order they were added; nothing runs on import and nothing touches window, so modules outside camp/
// (activities.js and activities/) may import it like util.js.
//   EV                 the signal names:
//     EV.act    { kind, by, name }   something was done near the operator, so he may remark on it. kind: boop, feed (input.js),
//                                    log, water, veg, soup (activities.js, soupChore.js); by: "you" or "operator"; name: the
//                                    sloth's. Heard by operator/talk.js (react).
//     EV.food   { kind, at }         food set down for the sloths (activities/soupChore.js serve: a bowl on a log seat). Heard
//                                    by sloth/day.js watchFood: the nearest sloth at home goes to eat it.
//     EV.cheer  { at, max, words, life, skip }   the camp sloths nearest `at` (within max m), after the first skip of them
//                                    (default 0), one per word, perk up at once: a nod and the word over its head for life s
//                                    (activities/fireChore.js, soupChore.js, which queue the emit in their frame time when it
//                                    should come later). Heard by sloths.js; the chores no longer pick sloths or write their nods.
//   on(name, fn)       fn(detail) runs on every emit of name
//   emit(name, detail) runs every fn added for name with detail
const EV = { act: "act", food: "food", cheer: "cheer" };
const fns = new Map();
function on(name, fn) { if (!fns.has(name)) fns.set(name, []); fns.get(name).push(fn); }
function emit(name, detail) { for (const fn of fns.get(name) ?? []) fn(detail); }

export { EV, emit, on };
