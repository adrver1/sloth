// Canopy Camp layout: where everything in the camp stands, in one place (camp review C1: world-12, props-06, crosscut-10,
// operator-12, world-16). Only numbers, vectors and pure functions: no scene, no DOM, no random numbers (what is placed at random, the forest wall, the
// ferns, the deadwood, stays where it is drawn), so any module can import it at any point. The one exception is fromModel,
// which copies the tent's and hammock's sizes in from their models once campProps.js has loaded them (review R2-250). Units
// are metres; y is up, the fire is at the origin. node can import it (and lanterns.js): props/shadow/layout_pure.mjs works out the bakes' layout from it with no browser
// (the tent, the hammock, the track, the glade path, WEAR and a "place" block, where each baked prop and light stands;
// review R2-257), props/shadow/export_casters.cjs adds the deadwood from the page and writes it all to
// props/shadow/layout_picked.json, and props/camp/bake_camp_lightmap.py places everything from that block (its "anchors"
// are ANCHORS, at the end of this file). Two values are
// typed again there: the sun's direction (the bake stops if the two differ) and the lantern drop, lanterns.js JAR_Y, with no
// check (review props-07). LAUNDRY and SOUP_POT restate build_laundry.py and build_fire.py; campProps.js checks them against
// the anchors in those GLBs (review R2-252). SEAT_R is read by operator/cook.js (the fire side of a seat, where he hands a bowl);
// JEEP_OUT is exported for checks, and no module imports it. PATH_A, where the footpath leaves the camp, also sets the glade path's lead points, where its ribbon starts (forest/floor.js).
// The karaoke trip's road is the PATHS entry tripPath (trip.js, forest/, glade.js); each path's ribbon is the curve its ribbon
// follows (built once here), ROAD_TRUNK_R how far out the road's trunks may stand, and cutSight(x, z, r) the trip's cut scene camera's lines of sight, which the forest keeps clear.
import * as THREE from "three";
import { V, lineDist, wrapPi, yawTo } from "./util.js";

// ---------------------------------------------------------------- the clearing and the ground
export const RC = 9;      // the clearing's radius: a round clearing with the camp in it; the forest wall starts past RC
// FAR: the ground mesh's radius (terrain.js, the old forest-floor disc), the backdrop's and the sky domes' (which follow the camera,
// sky.js skyStep). 40 m, so from the glade 18.5 m out the backdrop is still about 40 m away in the haze (review R2-161; it was 30)
export const FAR = 40;
// ROAD_TRUNK_R: how far from the fire the trunks lining the karaoke road may stand, along its cut scene stretch and past it
// (forest/trees.js forestWall). They are the ground's edge as it was when FAR was 30 (FAR - 1.6 and FAR - 0.5 then), kept so
// the road's trunks stand where the karaoke trip placed them.
export const ROAD_TRUNK_R = [28.4, 29.5];
export const SUN = V(-4, 10, 3);   // the sun light's position (core.js); ground.js renders its live shadows from it

// the big tree at the clearing's edge, the bearing the camp is laid out by (tent, hammock, table and seats): HERO_ANGLE is
// its direction from the fire, HERO_DIR that direction as a unit vector, HERO_ACROSS the one across it (HERO_DIR turned a
// quarter left). A0, d0 and t0 are the short names the older modules still import: the same values.
export const HERO_ANGLE = -0.75, HERO_DIR = V(Math.cos(HERO_ANGLE), 0, Math.sin(HERO_ANGLE)), HERO_ACROSS = V(-HERO_DIR.z, 0, HERO_DIR.x);
export const A0 = HERO_ANGLE, d0 = HERO_DIR, t0 = HERO_ACROSS;

// ---------------------------------------------------------------- the footpaths, the glades and the big trees (Adriaen 2026-11-11)
// They are data, so a second path, glade or big tree is one more entry (review R2-036). PATHS lists the footpaths, each
//   { id, curve, pts (its spaced points), half (the ribbon's half width, forest.js), lane (the half width the player keeps to,
//   player.js), lead (points in the camp the ribbon starts from before the path's own curve, forest.js), and optionally covers
//   (the id of a path whose ribbon this one's runs along and replaces), segs and fade (the ribbon's segments, 48, and the metres
//   it fades out over at its end, 1.2), wide ([a, b]: the ribbon is PATH_HALF wide up to a and its own half from b, 0..1 along it) },
//   and ribbon, the curve its ribbon follows (its lead points, then its own curve's, on the ground plane), built once below.
// GLADES lists the glades { id, at, r, tree (its HERO entry) }. HERO lists the big mossy trees { id, at, flare (the phase of its
// root flare, forest.js), roots (how many surface roots, deadwood.js), mound (null, or { r, h }: a root mound on its forest side
// only, terrain.js) }. pathLane, pathDist, terrain.js's levelling, the path ribbons, player.js's keep-to-the-path rule, the
// forest's clearings, the blockers, the roots and the wild sloths all loop over these lists.
// Changing an entry's numbers, or adding one, moves trees, roots and ground in the light and ground bakes: rebake after.
// the sloth tree's glade: the second big tree stands in a small glade about 6 m into the forest; a footpath leaves the clearing
// between the tent and the laundry line and winds to it. glade.js dresses this glade (GLADE, GLADE_R, sloPath).
export const PATH_A = 1.45, GLADE_R = 4.2, GLADE = V(Math.cos(PATH_A + 0.22), 0, Math.sin(PATH_A + 0.22)).multiplyScalar(RC + 9.5), PATH_W = 0.6;
export const PATH_HALF = 0.75;    // half the path ribbon's width (forest.js); terrain.js keeps the ground level well past it
export const sloPath = (() => {
  const P = (a, r) => V(Math.cos(a) * r, 0, Math.sin(a) * r);
  const curve = new THREE.CatmullRomCurve3([P(PATH_A, RC - 2), P(PATH_A, RC + 0.5), P(PATH_A - 0.1, RC + 2.5), P(PATH_A + 0.06, RC + 4.3), GLADE.clone().setLength(RC + 5.2), GLADE.clone().setLength(RC + 6.5)]);
  // lead: the ribbon starts in the camp, just past the log seats round the fire (Adriaen 2026-11-14), while the path the player
  // and the terrain follow starts at RC - 2
  return { id: "glade", curve, pts: curve.getSpacedPoints(48), half: PATH_HALF, lane: PATH_W, lead: [P(PATH_A, 3.0), P(PATH_A, 5.0)] };
})();
// the karaoke trip's road (Adriaen 2026-11-12/14, trip.js): the glade path goes on round the glade tree, on the side away from
// the bench, and leaves the glade as a road straight away from the camp, like the jeep's, until it is lost in a thicket near
// where the ground ends. Its curve runs from the bend round the tree to the thicket; the player keeps within its lane. Its ribbon
// (ribbonCurve) starts at its lead, the glade path's lead and first five points, so the glade path, the bend and the road are
// drawn as ONE strip with no seams at the joins (Adriaen 2026-11-13); it covers the glade path's own ribbon, which is then not
// drawn. The ribbon is the glade path's width up to wide[0] (0..1 along it) and widens to its own 2.5 m (half * 1.35: two
// walking hand in hand) by wide[1], where the road starts; segs and fade: its segments and the metres it fades out over.
// cut: the road's straight stretch { curve, pts }, along which the sign stands and the wagon cut scene walks (trip.js); walking
// far enough down it asks "Go to karaoke?" too.
const GU = GLADE.clone().normalize(), GW = V(-GU.z, 0, GU.x), atGlade = (a, b) => GLADE.clone().addScaledVector(GU, a).addScaledVector(GW, b);
export const tripPath = (() => {
  const dir = (b) => GU.clone().multiplyScalar(Math.cos(b)).addScaledVector(GW, Math.sin(b)), D = dir(1.0), S0 = atGlade(1.0, 2.5), at = (s) => S0.clone().addScaledVector(D, s);
  const cut = new THREE.CatmullRomCurve3([at(0), at(3), at(6), at(9)]);
  const trail = [at(0), at(3), at(6), at(9), at(10.4).addScaledVector(dir(1.0 + Math.PI / 2), 0.25), at(9).addScaledVector(dir(1.3), 3.0)];   // a slight bend at the end, into the trees
  const curve = new THREE.CatmullRomCurve3([atGlade(-2.6, 1.25), atGlade(-0.6, 2.25), ...trail]);
  const path = { id: "karaoke", curve, pts: curve.getSpacedPoints(64), half: 1.25 / 1.35, lane: 0.9, lead: [...sloPath.lead, ...sloPath.curve.points.slice(0, 5)],
    covers: "glade", segs: 160, fade: 2.5, wide: [0, 1], cut: { curve: cut, pts: cut.getSpacedPoints(40) } };
  path.ribbon = ribbonCurve(path);
  const pts = path.ribbon.getSpacedPoints(160), near = (c) => pts.reduce((b, q, i) => (q.distanceTo(c) < pts[b].distanceTo(c) ? i : b), 0) / 160;
  path.wide = [near(atGlade(-2.0, 1.7)), near(at(0))];
  return path;
})();
export const PATHS = [sloPath, tripPath];
for (const p of PATHS) p.ribbon ??= ribbonCurve(p);   // one curve per path, read by forest/floor.js, forest/plants.js and glade.js
// ribbonCurve(path): the curve a path's ribbon is drawn along, its lead points then its own curve's
function ribbonCurve(path) { return new THREE.CatmullRomCurve3([...path.lead, ...path.curve.points].map((q) => q.clone().setY(0))); }
// cutSight(x, z, r): true when a thing of radius r at (x, z) stands in the karaoke cut scene camera's line of sight (or the drive's, below). trip.js films
// the wagon from the camp's side of the road (side on, and three-quarter from ahead on an upright phone), so the forest keeps
// those lines clear of trunks (forest/trees.js) and bushes (forest/plants.js)
const sight = [];
{ const c = tripPath.cut.curve, L = c.getLength();
  for (let s = 0.3 * L; s <= L; s += 0.5) { const t = s / L, p = c.getPointAt(t), d = c.getTangentAt(t), sd = V(-d.z, 0, d.x), inn = sd.dot(p) > 0 ? -1 : 1;
    sight.push([p, p.clone().addScaledVector(sd, 6 * inn).addScaledVector(d, 2.6)], [p, p.clone().addScaledVector(sd, 3 * inn).addScaledVector(d, 5)]); } }
export const cutSight = (x, z, r) => sight.some(([a, b]) => lineDist([a, b], x, z) < r + 0.5);
// the big tree at the clearing's edge behind the fire, and the glade's tree, 0.4 m off the glade's middle, away from where the
// karaoke road passes it (Adriaen 2026-11-14: clear of the path)
const campTree = { id: "camp", at: d0.clone().multiplyScalar(RC + 0.4), flare: 0, roots: 10, mound: { r: 2.6, h: 0.45 } };
const gladeTree = { id: "glade", at: GLADE.clone().add(V(0.35, 0, 0.19)), flare: 1, roots: 8, mound: null };
export const HERO = [campTree, gladeTree];
export const GLADES = [{ id: "sloth", at: GLADE, r: GLADE_R, tree: gladeTree }];
export const pathLane = (x, z) => { let d = 1e9; for (const p of PATHS) d = Math.min(d, lineDist(p.pts, x, z)); return d; };   // the paths themselves
// gladeTurn(x, z): where (x, z) lies round the glade, as the angle from the direction back down the footpath (its last point),
// in -pi..pi. The karaoke road leaves the glade between GLADE_EXIT's two turns, so nothing grows there (glade.js, forest/trees.js)
const gladeIn = Math.atan2(sloPath.pts[sloPath.pts.length - 1].z - GLADE.z, sloPath.pts[sloPath.pts.length - 1].x - GLADE.x);
export const gladeTurn = (x, z) => wrapPi(Math.atan2(z - GLADE.z, x - GLADE.x) - gladeIn);
export const GLADE_EXIT = [-2.35, -1.75];
export const pathDist = (x, z) => { let d = pathLane(x, z); for (const g of GLADES) d = Math.min(d, Math.max(0, Math.hypot(x - g.at.x, z - g.at.z) - g.r)); return d; };   // a path or a glade

// ---------------------------------------------------------------- the jeep and its track
// the jeep is parked at JEEP_AT along the clearing edge (facing JEEP_TAN, its right side to the fire) and came in on a muddy
// track cut through the forest wall behind it. JEEP_TRACK is that track; with ?jeep=none there is no track (forest.js track).
export const JEEP_AT = V(-2.2, 0, -6.4), JEEP_OUT = JEEP_AT.clone().normalize();
export const JEEP_TAN = (() => { const t = V(-JEEP_OUT.z, 0, JEEP_OUT.x); return V(t.z, 0, -t.x).dot(JEEP_OUT) > 0 ? t.negate() : t; })();   // its right side faces the fire
export const TRACK_HALF = 1.35;   // half the dirt road's width (forest.js); terrain.js keeps the ground level well past it
export const JEEP_TRACK = (() => {
  const P = (b, o) => JEEP_AT.clone().addScaledVector(JEEP_TAN, b).addScaledVector(JEEP_OUT, o);
  const curve = new THREE.CatmullRomCurve3([P(1.2, 0), P(-1.5, 0), P(-3.6, 0.5), P(-4.9, 2.4), P(-5.6, 5.5), P(-5.4, 10), P(-4.2, 16), P(-3, 24)]);
  return { curve, pts: curve.getSpacedPoints(90) };
})();
// the drive's shot (drive.js) films the jeep from the track's start (0.12 of the way) as it drives up the track and round the bend:
// the forest keeps those lines of sight clear too (cutSight), or the verge bushes on the bend's inside hid the jeep (Adriaen
// 2026-11-15: "driving off from the jungle camp, the car can't be seen")
export const DRIVE_CAM_S = 0.12;
{ const c = JEEP_TRACK.curve, cam = c.getPointAt(DRIVE_CAM_S);
  for (let t = 0.26; t <= 0.8; t += 0.03) sight.push([cam, c.getPointAt(t)]); }

// ---------------------------------------------------------------- the camp: log seats round the fire, tent, hammock, table
export const FIRE = V(0, 0, 0);   // the campfire stands at the origin
// three log seats round the fire, the gap toward the gate: angle round the fire, where each stands and its yaw
export const SEAT_R = 2.1;
export const SEATS = [0, 1, 2].map((i) => { const a = A0 + Math.PI + (i - 1) * 1.15; return { angle: a, at: V(Math.cos(a) * SEAT_R, 0, Math.sin(a) * SEAT_R), yaw: -a + Math.PI / 2 }; });
// where things go on a log seat (places.js logSeats builds each seat's slots from these): metres along the log from its
// middle, + to your right as you face the fire from it. sunny: Sunny's spot on Seat_0, just right of its middle (sloth/spots.js);
// youOn0: you on Sunny's bench, at its left end, leaving Sunny room (Adriaen 2026-11-12); back: how far you sit back from the
// middle, away from the fire; op: the operator's end of Seat_1 and Seat_2; bowl: a bowl of soup at either end, a little in
// from the edge (activities/soupChore.js serve)
export const SEAT_SLOT = { sunny: 0.12, youOn0: -0.55, back: 0.12, op: 0.36, bowl: 0.32 };
// the ways in to the fire between the logs, as angles round it: the gate's gap, and half way between each pair of seats
// (0.575 is half the seats' 1.15). The operator stands in one to reach the pot (operator/places.js fireGap)
export const SEAT_GAPS = [A0, A0 + Math.PI - 0.575, A0 + Math.PI + 0.575];
// the walk-in tent (build_camp.py wall_tent): its door faces the fire. Its own (Blender) frame: bx across, by toward the back
// (-by toward the fire). toLocal(x, z) gives [a: ahead of the tent's centre toward the fire, b: across]; fromLocal(bx, by, y)
// a world point. W, yf, yb: the walls' half width, front and back; DW: the doorway's half width; stove, chimney: where they are;
// bed: the middle of the bed along the left wall, [bx, by] (the operator sleeps there, and the sloths nap there: sloth/spots.js
// buildGuests, sloth/wayOut.js bedOut). In a group at the tent turned by its yaw (the sloths' tent frame), that is (bx, 0, -by).
// floor: see bare below.
// These sizes are build_camp.py's: fromModel (below) copies them from the Tent node once the camp set has loaded.
const tentAt = d0.clone().multiplyScalar(-4.2).addScaledVector(t0, 2.4);
export const TENT = (() => {
  const t = tentAt, L = t.length(), fx = -t.x / L, fz = -t.z / L;
  return { at: t, yaw: yawTo(t),   // fromModel adds W, yf, yb, DW, stove, chimney (the pipe's mouth [bx, by, height]), bed and pegs (the guy ropes' pegs [bx, by])
    toLocal: (x, z) => { const dx = x - t.x, dz = z - t.z; return [dx * fx + dz * fz, dx * fz - dz * fx]; },
    fromLocal: (bx, by, y = 0) => V(t.x + bx * fz - by * fx, y, t.z - bx * fx - by * fz),
    // in toLocal's terms: the floor rectangle (a from a0 to a1, |b| below b) is kept level (terrain.js) and has no grass in the tent or
    // through its planks (ground.js); dry is the wider rectangle under its roof and planks (weather.js)
    floor: { a0: -1.8, a1: 2.1, b: 1.95 },
    bare: (x, z) => { const [a, b] = TENT.toLocal(x, z), f = TENT.floor; return a > f.a0 && a < f.a1 && Math.abs(b) < f.b; },
    dry: (x, z) => { const [a, b] = TENT.toLocal(x, z); return a > -1.9 && a < 2.2 && Math.abs(b) < 2.0; } };
})();
// the hammock between two posts (a and b), and where it hangs from. The rest is the hammock model's own shape (build_camp.py),
// in its frame (x along the span, y up from the ground): pivot, the height of the rope knots, the line the sling swings
// about (swing.js); knotX, where the knots are along the span (on each post, at +-knotX); endX and endY, where each rope
// meets the sling's end (+-endX, endY below the knots); sling, the height of the sling's bed; roof, the band of y over
// which the swing fades out, so the posts and the leaves on top stay put. swing.js bends the sling in its vertex shader
// with these, and the sloths climb the rope along them (sloth/poses.js, review R2-141).
// pivot, knotX, endX and endY are build_camp.py's ROPE and post spacing: fromModel copies them from the Hammock node's knot and
// rope_end, like the tent's sizes.
const hA = d0.clone().multiplyScalar(-1.5).addScaledVector(t0, -4.6), hB = hA.clone().addScaledVector(d0, -2.6).addScaledVector(t0, -1.2);
export const HAMMOCK = { a: hA, b: hB, mid: hA.clone().add(hB).multiplyScalar(0.5), yaw: (() => { const hd = hB.clone().sub(hA); return -Math.atan2(hd.z, hd.x); })(),
  sling: 0.72, roof: [1.8, 1.95] };
// fromModel(tent, hammock): the camp set's Tent and Hammock nodes carry build_camp.py's sizes as glTF extras (their userData;
// review R2-250), and this copies them into TENT and HAMMOCK. The Hammock node's knot and rope_end are the -x post's rope in
// the model's Blender frame [x along the span, y across, z up]. campProps.js buildProps calls it as soon as the set has
// loaded, before any module reads them. It throws when a size is missing: the tent and the hammock cannot work without them.
const TENT_SIZES = ["W", "yf", "yb", "DW", "stove", "chimney", "bed", "pegs"];
export function fromModel(tent = {}, hammock = {}) {
  const miss = [...TENT_SIZES.filter((k) => tent[k] === undefined), ...["knot", "rope_end"].filter((k) => !hammock[k])];
  if (miss.length) throw new Error(`camp_picked_lm.txt's Tent or Hammock lacks ${miss.join(", ")}; rebuild it (props/bake_all.py)`);
  for (const k of TENT_SIZES) TENT[k] = tent[k];
  const { knot: k, rope_end: e } = hammock;
  Object.assign(HAMMOCK, { pivot: k[2], knotX: -k[0], endX: -e[0], endY: e[2] - k[2] });
}
export const TABLE = { at: d0.clone().multiplyScalar(1.6).addScaledVector(t0, 3.2), yaw: 0.6 };   // the snack table
// the lantern strings (lanterns.js, review B3, Adriaen 2026-11-12): a V from the tent's front A-frame (l0) and the hammock's
// near post (post) up to the big tree behind the fire (tree)
export const LANTERN_TIES = { l0: tentAt.clone().multiplyScalar(1 - 1.12 / tentAt.length()).setY(2.8), post: hA.clone().setY(2.35), tree: campTree.at };

// ---------------------------------------------------------------- the lived-in props (props/lived/)
// the wood pile and the crate are turned by yawTo(at): it points their local -Z away from the fire, so their fronts (+Z) face it
export const WOOD_PILE = (() => { const at = V(-0.55, 0, -3.15), yaw = yawTo(at); return { at, yaw, side: V(Math.cos(yaw), 0, -Math.sin(yaw)) }; })();   // side: its local +X, where the chopping stump stands
export const CRATE = (() => { const at = V(4.55, 0, 1.7); return { at, yaw: yawTo(at) }; })();   // the kitchen crate beside the snack table, its front to the fire
export const SOUP_POT = { at: V(0, 0.885, 0), r: 0.147 };   // the soup's surface in the pot over the fire (build_fire.py SOUP, SOUP_R); atmosphere.js lets steam rise off all of it
// the laundry line (build_laundry.py): two plain sticks east of the fire, between the table and the tent. A and B are
// roughly where the line is tied; it is 3 m post to post. a, b: its ends; sag at the middle; hang: the gap kept free for a
// sloth (t = 0.42 along it); dir: a to b. posts: the sticks' feet. The sloths (sloth/poses.js, sloth/spots.js, swing.js) read a, b, sag, hang and dir.
export const LAUNDRY = (() => {
  const A = V(1.3, 0, 4.3), B = V(4.0, 0, 3.0), mid = A.clone().lerp(B, 0.5), yaw = Math.atan2(-(B.z - A.z), B.x - A.x);
  const dir = B.clone().sub(A).normalize(), L = 3.0, t = 0.42;
  return { a: mid.clone().addScaledVector(dir, -L / 2).setY(1.62), b: mid.clone().addScaledVector(dir, L / 2).setY(1.62), sag: 0.13,
    hang: mid.clone().addScaledVector(dir, -L / 2 + L * t).setY(1.62 - 0.13 * 4 * t * (1 - t)), dir,
    mid, yaw, posts: [mid.clone().addScaledVector(dir, -L / 2), mid.clone().addScaledVector(dir, L / 2)] };
})();

// ---------------------------------------------------------------- where each baked prop stands, by its anchor
// Each baked prop's builder tags it with one of these keys (custom property "anchor", three.js userData; props/lib/export.py
// tag, review R2-249), or with "seats" for one copy on every log seat (SEATS; userData.seat is which). campProps.js stands
// every lived and picked node from its anchor in one loop, and export_casters.cjs hands these to the light bake in the place
// block's "anchors". A new prop needs only its tag; a new place, a key here.
export const ANCHORS = { tent: TENT, hammock: { at: HAMMOCK.mid, yaw: HAMMOCK.yaw }, table: TABLE, woodPile: WOOD_PILE,
  seatThings: SEATS[1], kitchen: CRATE, laundry: { at: LAUNDRY.mid, yaw: LAUNDRY.yaw }, fire: { at: V(0, 0, 0), yaw: 0 } };   // seatThings: the middle seat

// ---------------------------------------------------------------- the worn ground round the things people use (review R2-255)
// One named entry per thing: { name, at, r, path, set }. r is its footprint, and also its collision radius: campProps.js
// and jeep.js put their blockers down from these entries (wearBlockers), so the wear and the collision cannot drift apart.
// path: a footpath runs to it from the fire. set: which part of the camp it belongs to, "camp" (always there), "seats"
// (SEATS order), "lived" and "laundry" (only with the lived-in props, ?lived=1) or "jeep" (only with a jeep). ground.js
// paints its live wear map from these (campGround.js filters them), and export_casters.cjs hands
// them to props/ground/bake_ground.py as "wear", which gives each entry its own random stream keyed by its name, so adding
// a thing re-rolls only its own patch and path. The hammock's posts have no path: the bake wears a patch along the
// hammock itself. The deadwood is wild and gets no worn ground.
export const WEAR = [
  { name: "table", at: TABLE.at, r: 0.75, path: true, set: "camp" },
  ...SEATS.map((s, i) => ({ name: `seat${i}`, at: s.at, r: 0.75, path: false, set: "seats" })),   // inside the trampled ring round the fire
  { name: "hammockA", at: HAMMOCK.a, r: 0.3, path: false, set: "camp" }, { name: "hammockB", at: HAMMOCK.b, r: 0.3, path: false, set: "camp" },
  { name: "woodPile", at: WOOD_PILE.at, r: 0.55, path: true, set: "lived" },
  { name: "choppingStump", at: WOOD_PILE.at.clone().addScaledVector(WOOD_PILE.side, 1.0), r: 0.35, path: true, set: "lived" },
  { name: "kitchen", at: CRATE.at, r: 0.35, path: true, set: "lived" },
  ...LAUNDRY.posts.map((p, i) => ({ name: `laundry${i}`, at: p, r: 0.25, path: true, set: "laundry" })),
  ...[-0.95, 0.95].map((k, i) => ({ name: `jeep${i}`, at: JEEP_AT.clone().addScaledVector(JEEP_TAN, k), r: 1.05, path: true, set: "jeep" })),
];
// the blockers ([centre, radius], campProps.js) of one WEAR set, in WEAR's order
export const wearBlockers = (set) => WEAR.filter((w) => w.set === set).map((w) => ({ at: w.at, r: w.r }));   // for campProps.js addBlocker
