// Canopy Camp layout: where everything in the camp stands, in one place (camp review C1: world-12, props-06, crosscut-10,
// operator-12, world-16). Only numbers, vectors and pure functions: no scene, no DOM, no random numbers (what is placed from the
// seeded stream, the forest wall, the ferns, the deadwood, stays where it is drawn), so any module can import it at any point
// without changing the order the camp is built in. Units are metres; y is up, the fire is at the origin.
// The bakes get the layout from the live page: props/shadow/export_casters.cjs writes the tent and hammock (from window.__camp),
// the track (from window.__ground.layout) and a "place" block (where each baked prop and light stands) to
// props/shadow/layout_picked.json, and props/camp/bake_camp_lightmap.py places everything from that block. Only the sun's
// direction is typed again there (the bake stops if the two differ). SEAT_R and JEEP_OUT are exported for checks (PATH_A also starts the path ribbon in forest.js);
// no module imports them.
// Older names still read through other modules (by files the clean-up has not reached yet, core.js names them): forest.js re-exports A0, RC and HERO;
// campProps.js re-exports SOUP_POT, puts tentAt, hA, hB, tb on window.__camp and the laundry line on window.__laundry.
import * as THREE from "three";
import { V, polyDist } from "./util.js";

// ---------------------------------------------------------------- the clearing and the ground
export const RC = 9;      // the clearing's radius: a round clearing with the camp in it; the forest wall starts past RC
export const FAR = 30;    // the ground mesh's radius (terrain.js, the old forest-floor disc), the backdrop's and the sky dome's
export const SUN = V(-4, 10, 3);   // the sun light's position (core.js); ground.js renders its live shadows from it

// the big tree at the clearing's edge: A0 is its direction from the fire, d0 that direction as a unit vector, t0 the one
// across it (d0 turned a quarter left). The camp is laid out in this frame: tent, hammock, table and seats.
export const A0 = -0.75, d0 = V(Math.cos(A0), 0, Math.sin(A0)), t0 = V(-d0.z, 0, d0.x);

// ---------------------------------------------------------------- the sloth tree's path and glade (Adriaen 2026-11-11)
// the second big tree stands in a small glade about 6 m into the forest; a footpath leaves the clearing between the tent and
// the laundry line and winds to it. pathDist() clears trunks and ferns off the path and the glade (forest.js, terrain.js).
export const PATH_A = 1.45, GLADE_R = 4.2, GLADE = V(Math.cos(PATH_A + 0.22), 0, Math.sin(PATH_A + 0.22)).multiplyScalar(RC + 9.5), PATH_W = 0.6;
export const PATH_HALF = 0.75;    // half the path ribbon's width (forest.js); terrain.js keeps the ground level well past it
export const sloPath = (() => {
  const P = (a, r) => V(Math.cos(a) * r, 0, Math.sin(a) * r);
  const curve = new THREE.CatmullRomCurve3([P(PATH_A, RC - 2), P(PATH_A, RC + 0.5), P(PATH_A - 0.1, RC + 2.5), P(PATH_A + 0.06, RC + 4.3), GLADE.clone().setLength(RC + 5.2), GLADE.clone().setLength(RC + 6.5)]);
  return { curve, pts: curve.getSpacedPoints(48) };
})();
export const pathLane = (x, z) => polyDist(sloPath.pts, x, z)[0];                                       // the path itself
export const pathDist = (x, z) => Math.min(pathLane(x, z), Math.max(0, Math.hypot(x - GLADE.x, z - GLADE.z) - GLADE_R));   // path or glade
// the two big mossy trees: one at the clearing's edge behind the fire, one in the glade
// the glade's tree stands 0.4 m off the glade's middle, away from where the karaoke route passes it (Adriaen 2026-11-14: clear of the path)
export const HERO = [d0.clone().multiplyScalar(RC + 0.4), GLADE.clone().add(V(0.35, 0, 0.19))];

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

// ---------------------------------------------------------------- the camp: log seats round the fire, tent, hammock, table
// three log seats round the fire, the gap toward the gate: angle round the fire, where each stands and its yaw
export const SEAT_R = 2.1;
export const SEATS = [0, 1, 2].map((i) => { const a = A0 + Math.PI + (i - 1) * 1.15; return { angle: a, at: V(Math.cos(a) * SEAT_R, 0, Math.sin(a) * SEAT_R), yaw: -a + Math.PI / 2 }; });
// the walk-in tent (build_camp.py wall_tent): its door faces the fire. Its own (Blender) frame: bx across, by toward the back
// (-by toward the fire). toLocal(x, z) gives [a: ahead of the tent's centre toward the fire, b: across]; fromLocal(bx, by, y)
// a world point. W, yf, yb: the walls' half width, front and back; DW: the doorway's half width; stove, chimney: where they are
const tentAt = d0.clone().multiplyScalar(-4.2).addScaledVector(t0, 2.4);
export const TENT = (() => {
  const t = tentAt, L = t.length(), fx = -t.x / L, fz = -t.z / L;
  return { at: t, yaw: Math.atan2(-t.x, -t.z), W: 1.4, yf: -0.95, yb: 1.5, DW: 0.45, stove: [1.0, 0.85], chimney: [1.0, 0.97, 3.32],   // chimney: the pipe's mouth (Z0 + H + 0.62)
    toLocal: (x, z) => { const dx = x - t.x, dz = z - t.z; return [dx * fx + dz * fz, dx * fz - dz * fx]; },
    fromLocal: (bx, by, y = 0) => V(t.x + bx * fz - by * fx, y, t.z - bx * fx - by * fz),
    // in toLocal's terms: no grass in the tent or through its planks (ground.js), and dry under its roof and planks (weather.js)
    bare: (x, z) => { const [a, b] = TENT.toLocal(x, z); return a > -1.8 && a < 2.1 && Math.abs(b) < 1.95; },
    dry: (x, z) => { const [a, b] = TENT.toLocal(x, z); return a > -1.9 && a < 2.2 && Math.abs(b) < 2.0; } };
})();
// the hammock between two posts (a and b), and where it hangs from
const hA = d0.clone().multiplyScalar(-1.5).addScaledVector(t0, -4.6), hB = hA.clone().addScaledVector(d0, -2.6).addScaledVector(t0, -1.2);
export const HAMMOCK = { a: hA, b: hB, mid: hA.clone().add(hB).multiplyScalar(0.5), yaw: (() => { const hd = hB.clone().sub(hA); return -Math.atan2(hd.z, hd.x); })() };
export const TABLE = { at: d0.clone().multiplyScalar(1.6).addScaledVector(t0, 3.2), yaw: 0.6 };   // the snack table
// the lantern strings (lanterns.js, review B3, Adriaen 2026-11-12): a V from the tent's front A-frame (l0) and the hammock's
// near post (post) up to the big tree behind the fire (tree)
export const LANTERN_TIES = { l0: tentAt.clone().multiplyScalar(1 - 1.12 / tentAt.length()).setY(2.8), post: hA.clone().setY(2.35), tree: HERO[0] };

// ---------------------------------------------------------------- the lived-in props (props/lived/)
const facing = (p) => Math.atan2(-p.x, -p.z);   // the yaw that turns a prop's front to the fire
export const WOOD_PILE = (() => { const at = V(-0.55, 0, -3.15), yaw = facing(at); return { at, yaw, side: V(Math.cos(yaw), 0, -Math.sin(yaw)) }; })();   // side: its local +X, where the chopping stump stands
export const CRATE = (() => { const at = V(4.55, 0, 1.7); return { at, yaw: facing(at) }; })();   // the kitchen crate beside the snack table, its front to the fire
export const SOUP_POT = { at: V(0, 0.885, 0), r: 0.147 };   // the soup's surface in the pot over the fire; atmosphere.js lets steam rise off all of it
// the laundry line (build_laundry.py): two forked sticks east of the fire, between the table and the tent. A and B are
// roughly where the line is tied; it is 3 m post to post. a, b: its ends; sag at the middle; hang: the gap kept free for a
// sloth (t = 0.42 along it); dir: a to b. posts: the sticks' feet. sloths.js reads a, b, sag, hang and dir (window.__laundry).
export const LAUNDRY = (() => {
  const A = V(1.3, 0, 4.3), B = V(4.0, 0, 3.0), mid = A.clone().lerp(B, 0.5), yaw = Math.atan2(-(B.z - A.z), B.x - A.x);
  const dir = B.clone().sub(A).normalize(), L = 3.0, t = 0.42;
  return { a: mid.clone().addScaledVector(dir, -L / 2).setY(1.62), b: mid.clone().addScaledVector(dir, L / 2).setY(1.62), sag: 0.13,
    hang: mid.clone().addScaledVector(dir, -L / 2 + L * t).setY(1.62 - 0.13 * 4 * t * (1 - t)), dir,
    mid, yaw, posts: [mid.clone().addScaledVector(dir, -L / 2), mid.clone().addScaledVector(dir, L / 2)] };
})();
