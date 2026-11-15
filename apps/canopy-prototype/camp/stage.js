// The stage: the level the cast lives in (Adriaen 2026-11-15, "life at the summit": the camp's sloths and operator run in more
// than one level). The cast is camp/sloth/, camp/operator/ and the helpers they share (places.js, actor.js, fx.js, save.js,
// swing.js); they read the level from here, never from a level's own modules (core.js, player.js, campProps.js, terrain.js,
// jeep.js, forest.js, chores.js, layout.js), so a page other than camp.html can host them without loading the camp.
// Two kinds of names:
//   made here, the same in every level   rng(name, start) (the named seeded streams, seeded from ?seed), pace (the move lab's
//                                        and the tools' speed-up), uTime and uNight (the shader clock and how far the night is in)
//   set by the level, setStage({...})    the page calls it once before it imports the cast (camp/campStage.js for the camp), and
//                                        again with what it makes later (the camp: jeepApi once the jeep is in, chores once the
//                                        chores are). A name a level has no use for may stay null (the summit has no laundry)
//     scene, camera, OPT, LIVED, D, S, KEYS     the page's core (OPT: campsloths, op, slothmat; D: the detail's counts; S: the look)
//     me                                        the player (seat, position)
//     groundAt(x, z)                            the ground's height
//     blockers, blockersVersion(), LANTERNS     what walkers steer round, and the lanterns that warm the sloths
//     jeepApi, branchCurves, heroWood, trunkR    the camp's jeep and big trees
//     chores                                    your activities (camp/chores.js acts)
//     OP_DAY                                    the level's own day for the operator, { weights(night), DO } (operator/day.js);
//                                               null in the camp
//     HOMES, NAV, FOOD, walkY                   the level's own sloth homes and food places, null in the camp, which has its own:
//                                               HOMES { spots() (the homes, sloth/spots.js shape, each with `for`, its sloth's
//                                               name), guests(guest) (the nap places: calls guest(fromSpot, fields) for each) },
//                                               NAV { half, rim } (the sloths' grid, sloth/walk.js; the camp's is round its
//                                               clearing, RC), FOOD() (the food places, sloth/table.js pois' shape),
//                                               walkY(x, z) (the height a sloth walks at; 0 in the camp, whose clearing is flat)
//     day                                       the time of day, { set, shown, cycle, setHour(h), setCycle(on) } (the clocks:
//                                               clock.js; camp/daytime.js day, summit/daytime.js day)
//     origin                                    where the stage's frame sits in the world (a Vector3), when scene is a group
//                                               moved off the world's origin (the summit's scout camp); null in the camp. The
//                                               cast keeps every position in the stage's frame (the fire at the origin, the
//                                               ground near y = 0): toStage(v) takes a world point (getWorldPosition,
//                                               localToWorld) into it and toWorld(v) back; both change v in place and return it,
//                                               and do nothing when origin is null. Rotation is never used, only a shift
//     A0, CRATE, HAMMOCK, HERO, LAUNDRY, RC, SEATS, SEAT_GAPS, SEAT_R, SEAT_SLOT, SOUP_POT, TABLE, TENT   the places (camp/layout.js)
// ---------------------------------------------------------------- made here
const qs = new URLSearchParams(location.search);
const SEED = (() => { const n = parseFloat(qs.get("seed")); return Number.isFinite(n) ? n : 7; })();   // ?seed, else 7 (core.js OPT.seed)
// seeded random, so every visit grows the same tree and hides sloths in the same spots. Each system draws from its own named
// stream (rng("forest"), rng("sloths"), ...), seeded from ?seed and the name, so one system drawing more or less, or earlier,
// never moves another's numbers. The same name always hands back the same stream, so the sloth modules share two:
// "sloths" for where they are placed and "slothDay" for what they do once the camp runs.
// start: the stream's own start instead of one mixed from ?seed and the name (forest.js keeps the start its layout was baked with)
const streams = new Map();
function rng(name, start) {
  let st = streams.get(name);
  if (st) return st;
  let seed = SEED | 0;
  if (start !== undefined) seed = start | 0;
  else for (let i = 0; i < name.length; i++) seed = Math.imul(seed ^ name.charCodeAt(i), 0x01000193);   // FNV-style mix of the name into the seed
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // mulberry32
  st = { rnd, R: (a, b) => a + rnd() * (b - a) };
  streams.set(name, st);
  return st;
}
const uTime = { value: 0 };
const uNight = { value: 0 };   // how far the night is in (0 day .. 1 rested; the page sets it from the dusk): the baked night light, the ground, the operator's mood (R2-129)
// the pace: fast runs the sloths' day and the jeep seats that many times as fast (unset: 1). The move lab (lab.js) sets it,
// and the tools through window.__campFast (debug.js)
const pace = { fast: undefined };

// ---------------------------------------------------------------- set by the level
let scene = null, camera = null, OPT = null, LIVED = true, D = null, S = null, KEYS = null, me = null;
let groundAt = () => 0, blockers = [], blockersVersion = () => 0, LANTERNS = { lights: [] };
let jeepApi = null, branchCurves = [], heroWood = null, trunkR = null, chores = null, OP_DAY = null, HOMES = null, NAV = null, FOOD = null, walkY = null;
let origin = null, day = null;
const toStage = (v) => (origin ? v.sub(origin) : v), toWorld = (v) => (origin ? v.add(origin) : v);
let A0 = 0, CRATE = null, HAMMOCK = null, HERO = [], LAUNDRY = null, RC = 0, SEATS = [], SEAT_GAPS = [], SEAT_R = 0, SEAT_SLOT = null, SOUP_POT = null, TABLE = null, TENT = null;
const NAMES = ["day", "scene", "camera", "OPT", "LIVED", "D", "S", "KEYS", "me", "groundAt", "blockers", "blockersVersion", "LANTERNS", "jeepApi", "branchCurves",
  "heroWood", "trunkR", "chores", "OP_DAY", "HOMES", "NAV", "FOOD", "walkY", "origin", "A0", "CRATE", "HAMMOCK", "HERO", "LAUNDRY", "RC", "SEATS", "SEAT_GAPS", "SEAT_R", "SEAT_SLOT", "SOUP_POT", "TABLE", "TENT"];
// the level's names: only those given change, so a page can hand over what it makes later; an unknown name is a mistake
function setStage(o) {
  for (const k of Object.keys(o)) if (!NAMES.includes(k)) throw new Error(`stage.js: no stage name ${k}`);
  ({ day = day, scene = scene, camera = camera, OPT = OPT, LIVED = LIVED, D = D, S = S, KEYS = KEYS, me = me, groundAt = groundAt, blockers = blockers,
    blockersVersion = blockersVersion, LANTERNS = LANTERNS, jeepApi = jeepApi, branchCurves = branchCurves, heroWood = heroWood, trunkR = trunkR,
    chores = chores, OP_DAY = OP_DAY, HOMES = HOMES, NAV = NAV, FOOD = FOOD, walkY = walkY, origin = origin, A0 = A0, CRATE = CRATE, HAMMOCK = HAMMOCK, HERO = HERO, LAUNDRY = LAUNDRY, RC = RC, SEATS = SEATS, SEAT_GAPS = SEAT_GAPS,
    SEAT_R = SEAT_R, SEAT_SLOT = SEAT_SLOT, SOUP_POT = SOUP_POT, TABLE = TABLE, TENT = TENT } = o);
}

export { A0, CRATE, day, D, FOOD, HAMMOCK, HERO, HOMES, KEYS, LANTERNS, LAUNDRY, LIVED, OP_DAY, OPT, RC, S, SEATS, SEAT_GAPS, SEAT_R, SEAT_SLOT, SOUP_POT, TABLE, TENT,
  blockers, blockersVersion, branchCurves, camera, chores, groundAt, heroWood, jeepApi, me, NAV, origin, pace, rng, scene, setStage, toStage, toWorld, trunkR, uNight, uTime, walkY };
