// Summit Cabin: the fire lookout on the watch hill, and walking on it (Adriaen 2026-11-16: "I want stairs going up, a small
// interior (when we're close), a flag on the top"; the look after the Long Dark's sunset lookout, summit-level/look/reference/).
// A timber tower 12 m tall on four legs with X braces, a deck all round the cab with a railing, and against its east face a
// switchback stair (Adriaen 2026-11-16, after the Long Dark's: "make the stairs more like this", then "hug the main tower, so
// that two of the support legs become the supports for the stairs as well"): the tower's two east legs and two posts outside
// carry five steep flights in two lanes, the outer climbing north and the inner south, with a landing at each turn and the top
// landing opening onto the deck. The cab has a
// door, glass all round and, within INNER_R of the camera, a small interior: the fire finder on its stand in the middle, the
// scout tent's own bed and stove (Adriaen: "use the bed and stove from the tent"; furnishFromTent cuts them out of the tent's
// model when the scout camp loads it), the stove's pipe through the roof, a chair, a shelf, a map on the wall and a lamp. Further off its windows are the
// glowing panes the cabin's are (cabin.js winMat), so the cab reads as lit from the valley. A scout pennant flies from the roof's
// peak (flag.js). Everything is in the tower's own frame: x along its south face, z through it, y up from TOWER.y - 0.5.
// Exports buildLookout(tower, kit) (cabin.js buildCabin: fills the group; kit = { M, lam, part, winMat }), lookoutFloor(x, z,
// feet) and lookoutBlocks(x0, z0, x1, z1, feet) (player.js: the stairs, deck and cab under your feet, and what stops you) and
// lookoutStep(night) (each frame: the interior shown near, the panes far, the lamp after dark) and furnishFromTent(tent) (scoutCamp.js,
// with the camp set's Tent mesh as it loads).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOWER, mulberry } from './land.js';
import { camera, canvasTex } from './core.js';
import { pennant, poleMat, scoutPennant } from './flag.js';

// ---------------------------------------------------------------- the plan (the tower's frame, metres)
const TURN = 0.5, BASE = TOWER.y - 0.5;   // the tower's turn and the height its frame starts at (cabin.js puts the group there)
const TH = 12, LEG = 2.6, DECK = 3.5, CAB = 2.3, G = 0.5, MID = 6.1, FLOOR = TH + 0.15;   // deck height, leg spread, deck and cab half-widths, the ground, the landing, the deck's top
// the stair tower: x0..xm the inner lane, xm..x1 the outer; the flights run between zA and zB, the landings span both lanes
// south of zA (from s0) and north of zB (to n1). Flight k climbs RISE from G + k RISE, northward in the outer lane when k is even.
const SC = { x0: LEG + 0.15, xm: LEG + 1.2, x1: LEG + 2.25, s0: -LEG, zA: -1.5, zB: 1.5, n1: LEG };   // the inner edge just off the legs' faces, the ends on their line
const NF = 5, RISE = (FLOOR - G) / NF;
const flightY = (k, lz) => { const t = (lz - SC.zA) / (SC.zB - SC.zA); return G + RISE * (k + (k % 2 ? 1 - t : t)); };
const DOOR = { z0: 0.75, z1: 1.85 };                      // the cab's door, in its east wall (+x), facing the stairs' top
const INNER_R = 32;   // the interior shows within this many metres of the camera
const inCol = (x, z, p = 0) => x >= SC.x0 + p && x <= SC.x1 - p && z >= SC.s0 + p && z <= SC.n1 - p;
const inRun = (x, z) => inCol(x, z) && z >= SC.zA && z <= SC.zB;   // over a flight, not a landing
const c = Math.cos(TURN), s = Math.sin(TURN);
const local = (x, z) => { const dx = x - TOWER.x, dz = z - TOWER.z; return [dx * c - dz * s, dx * s + dz * c]; };   // the inverse of the group's turn

// the floor under you in the tower's frame, or null off it: the flights are ramps, the landings and deck flat. Flights and
// landings are stacked, so the one nearest your feet (fy) within a step up or a short drop is yours; the deck only counts once
// you are up (above the legs' braces), so you can still walk under the tower
function floorLocal(lx, lz, fy) {
  if (inCol(lx, lz)) {
    const ys = [];
    if (lz >= SC.zA && lz <= SC.zB) { for (let k = lx >= SC.xm ? 0 : 1; k < NF; k += 2) ys.push(flightY(k, lz)); }
    else for (let k = lz > SC.zB ? 1 : 2; k <= NF; k += 2) ys.push(G + RISE * k);
    let best = null; for (const y of ys) if (y <= fy + 0.6 && y >= fy - 1.2 && (best === null || Math.abs(y - fy) < Math.abs(best - fy))) best = y;
    if (best !== null) return best;
  }
  if (Math.abs(lx) <= DECK && Math.abs(lz) <= DECK && fy > TH - 3) return FLOOR;
  return null;
}
// where your feet are on the tower (world y), or null where it is not under you (player.js then takes the ground)
export function lookoutFloor(x, z, feet) { const [lx, lz] = local(x, z), f = floorLocal(lx, lz, feet - BASE); return f === null ? null : BASE + f; }

// what stops a step from (x0, z0) to (x1, z1): the legs and the stairs' posts and flights (down below), the stairs' sides and the
// rail between their lanes, the deck's railing (only the top landing opens onto it), the cab's walls (only the door) and the
// things inside. Climbing more than a step or dropping off an edge is player.js's rule. BODY keeps you off railings; walls keep
// you WALL off, past the camera's near plane (0.3 m, core.js) and its corners, so you never see through them.
const BODY = 0.25, WALL = 0.45;
const POSTS = [[-LEG, -LEG], [-LEG, LEG], [LEG, -LEG], [LEG, LEG], [SC.x1, SC.s0], [SC.x1, SC.n1]];
export function lookoutBlocks(x0, z0, x1, z1, feet) {
  const [ax, az] = local(x0, z0), [bx, bz] = local(x1, z1), fy = feet - BASE;
  if (Math.hypot(bx, bz) > 8) return false;
  const lane = (x) => x >= SC.xm, crossLane = inCol(bx, bz) && (inRun(ax, az) || inRun(bx, bz)) && lane(ax) !== lane(bx);
  if (fy < G + 0.4) {   // on the ground: the posts, and the flights overhead, entered only at the foot of the first
    for (const [x, z] of POSTS) if (Math.hypot(bx - x, bz - z) < 0.2 + BODY) return true;
    if (inRun(bx, bz) && !inRun(ax, az)) return !(lane(bx) && lane(ax) && az < SC.zA && ax <= SC.x1);
    return inRun(ax, az) && crossLane;
  }
  if (crossLane) return true;
  const onStairs = (x, z) => inCol(x, z, BODY);
  if (fy < FLOOR - 0.3) return onStairs(ax, az) !== onStairs(bx, bz);   // on a flight or a lower landing: its rails all round
  // up top: the deck's railing all round but for the top landing, which keeps you in by the stairs' rails
  const deck = (x, z) => Math.abs(x) <= DECK - BODY && Math.abs(z) <= DECK - BODY, gap = (x, z) => x >= DECK - BODY - 0.01 && x <= SC.x1 - BODY && z >= SC.zB + BODY && z <= SC.n1 - BODY;
  if (deck(ax, az) !== deck(bx, bz) && !gap(ax, az) && !gap(bx, bz)) return true;
  if (!deck(bx, bz) && !gap(bx, bz) && !onStairs(bx, bz)) return true;
  // the cab: its walls keep you WALL off on either side; the doorway lets you through
  const r = Math.max(Math.abs(bx), Math.abs(bz)), door = bx > 0 && bz > DOOR.z0 + BODY && bz < DOOR.z1 - BODY && Math.abs(bz) < CAB - 0.06;
  if (r > CAB - 0.06 - WALL && r < CAB + 0.06 + WALL && !door) return true;
  if (r <= CAB - 0.06 - WALL) for (const [x, z, rr] of INSIDE_BLOCK) if (Math.hypot(bx - x, bz - z) < rr + BODY) return true;
  return false;
}
const INSIDE_BLOCK = [[0, 0, 0.45], [-1.65, -1.6, 0.35], [-1.8, 0.45, 0.4], [-1.8, 1.0, 0.4], [-1.8, 1.55, 0.4]];   // the fire finder, the stove, the bed (three circles)

// ---------------------------------------------------------------- building it
let inner = null, panes = null, glass = null, lampMat = null, warmLam = null;
export function buildLookout(tower, { M, lam, part, winMat }) {
  const box = (w, h, d, mat, x, y, z, ry = 0, rz = 0, parent = tower) => { const m = part(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent); m.rotation.set(0, ry, rz, 'YZX'); return m; };
  // legs, a girt at the landing's height and painted X braces between the legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.3, TH, 0.3, M.wood, sx * LEG, TH / 2, sz * LEG);
  const braceTex = canvasTex(128, 256, (g, w, h) => { g.strokeStyle = '#5a3c26'; g.lineWidth = 9; for (let k = 0; k < 3; k++) { const y0 = (k * h) / 3, y1 = ((k + 1) * h) / 3; g.beginPath(); g.moveTo(4, y0); g.lineTo(w - 4, y1); g.moveTo(w - 4, y0); g.lineTo(4, y1); g.moveTo(0, y0 + 4); g.lineTo(w, y0 + 4); g.stroke(); } });
  const braceMat = lam({ map: braceTex, alphaTest: 0.5, side: THREE.DoubleSide });
  for (const [x, z, ry] of [[0, -LEG, 0], [0, LEG, 0], [-LEG, 0, Math.PI / 2], [LEG, 0, Math.PI / 2]]) { const b = part(new THREE.PlaneGeometry(LEG * 2, TH - 0.5), braceMat, x, (TH - 0.5) / 2, z, tower); b.rotation.y = ry; }
  // the deck, its joists' ends showing under it, and a railing round it with its gap at the top landing
  box(DECK * 2, 0.22, DECK * 2, M.wood, 0, TH + 0.04, 0);
  box(DECK * 2 - 0.4, 0.3, 0.2, M.wood, 0, TH - 0.2, 0); box(0.2, 0.3, DECK * 2 - 0.4, M.wood, 0, TH - 0.2, 0);
  const rail = (x0, z0, x1, z1, y0, y1, posts = true) => { const L = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), pitch = Math.atan2(y1 - y0, L);
    for (const dy of [1.0, 0.5]) box(Math.hypot(L, y1 - y0), 0.08, 0.07, M.wood, (x0 + x1) / 2, (y0 + y1) / 2 + dy, (z0 + z1) / 2, ry, pitch);
    if (posts) for (const [x, z, y] of [[x0, z0, y0], [x1, z1, y1]]) box(0.1, 1.08, 0.1, M.wood, x, y + 0.5, z); };
  const E = DECK - 0.05;
  rail(-E, -E, E, -E, FLOOR, FLOOR); rail(-E, E, E, E, FLOOR, FLOOR); rail(-E, -E, -E, E, FLOOR, FLOOR); rail(E, -E, E, SC.zB, FLOOR, FLOOR); rail(E, SC.n1, E, E, FLOOR, FLOOR);
  for (const x of [-E / 2, 0, E / 2]) { box(0.1, 1.08, 0.1, M.wood, x, FLOOR + 0.5, -E); box(0.1, 1.08, 0.1, M.wood, x, FLOOR + 0.5, E); box(0.1, 1.08, 0.1, M.wood, -E, FLOOR + 0.5, x); }
  // the stairs: treads, two stringers and a hand rail on the open side of each flight; the corner landing on four posts
  const flight = (ax, az, bx, bz, ya, yb, wx, wz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.round((yb - ya) / 0.24), ry = -Math.atan2(bz - az, bx - ax), dx = (bx - ax) / L, dz = (bz - az) / L;
    const tread = new THREE.BoxGeometry(L / n + 0.04, 0.06, 1.0), treads = [];
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; treads.push(tread.clone().rotateY(ry).translate(ax + (bx - ax) * t, ya + ((yb - ya) * (k + 1)) / n - 0.03, az + (bz - az) * t)); }
    part(mergeGeometries(treads), M.wood, 0, 0, 0, tower);
    for (const o of [-0.53, 0.53]) box(Math.hypot(L, yb - ya), 0.26, 0.06, M.wood, (ax + bx) / 2 + wx * o, (ya + yb) / 2 - 0.12, (az + bz) / 2 + wz * o, ry, Math.atan2(yb - ya, L));
    rail(ax + wx * 0.55 - dx * 0.1, az + wz * 0.55 - dz * 0.1, bx + wx * 0.55, bz + wz * 0.55, ya, yb); };
  for (let k = 0; k < NF; k++) { const out = k % 2 === 0, cx = out ? (SC.xm + SC.x1) / 2 : (SC.x0 + SC.xm) / 2, y0 = G + RISE * k;
    if (out) flight(cx, SC.zA, cx, SC.zB, y0, y0 + RISE, 1, 0); else flight(cx, SC.zB, cx, SC.zA, y0, y0 + RISE, -1, 0); }
  // its landings (north after the odd rises, south after the even), railed round except where the flights or the deck meet them,
  // and its two outer posts, run on below the ground in case the hill dips
  const W = SC.x1 - SC.x0, XC = (SC.x0 + SC.x1) / 2;
  for (let k = 1; k <= NF; k++) { const y = G + RISE * k, north = k % 2 === 1, z0 = north ? SC.zB : SC.s0, z1 = north ? SC.n1 : SC.zA, ze = north ? SC.n1 : SC.s0;
    box(W + 0.1, 0.12, z1 - z0 + 0.1, M.wood, XC, y - 0.06, (z0 + z1) / 2);
    rail(k < NF ? SC.x0 : E, ze, SC.x1, ze, y, y, false); rail(SC.x1, z0, SC.x1, z1, y, y, false); }   // the top one's starts at the deck's railing, not over the deck   // the inner side is the tower's braced face
  for (const z of [SC.s0, SC.n1]) box(0.22, FLOOR + 1.08 + 1.5, 0.22, M.wood, SC.x1, (FLOOR + 1.08 - 1.5) / 2, z);   // the two outer posts; the inner ones are the tower's legs
  for (let k = 1; k <= NF; k++) for (const z of [SC.s0, SC.n1]) box(SC.x1 - LEG, 0.16, 0.12, M.wood, (SC.x1 + LEG) / 2, G + RISE * k - 0.2, z);   // ties from the legs to the posts under each landing level
  // the cab: log walls below and above a band of windows, corner posts and mullions, the door in the east wall, a ceiling
  const Y0 = FLOOR, SILL = 1.0, HEAD = 2.15, TOPW = 2.45, T = 0.12;
  for (const [ry, nx, nz] of [[0, 0, -1], [0, 0, 1], [Math.PI / 2, -1, 0], [Math.PI / 2, 1, 0]]) {
    const at = (o) => [nx * CAB + (nz ? o : 0), nz * CAB + (nx ? o : 0)], door = nx > 0;
    if (door) { for (const [o0, o1] of [[-CAB, DOOR.z0], [DOOR.z1, CAB]]) { const [x, z] = at((o0 + o1) / 2); box(o1 - o0, SILL, T, M.log, x, Y0 + SILL / 2, z, ry); }
      const [x, z] = at((DOOR.z0 + DOOR.z1) / 2); box(DOOR.z1 - DOOR.z0, TOPW - 2.0, T, M.log, x, Y0 + (2.0 + TOPW) / 2, z, ry); }
    else { const [x, z] = at(0); box(CAB * 2, SILL, T, M.log, x, Y0 + SILL / 2, z, ry); }
    { const [x, z] = at(0); box(CAB * 2 + T, TOPW - HEAD, T, M.log, x, Y0 + (HEAD + TOPW) / 2, z, ry); }
    for (const o of [-CAB, -CAB / 3, CAB / 3, CAB]) { if (door && o > DOOR.z0 - 0.1 && o < DOOR.z1 + 0.1) continue; const [x, z] = at(o); box(0.1, HEAD - SILL, 0.1, M.wood, x, Y0 + (SILL + HEAD) / 2, z); }
  }
  { const w = DOOR.z1 - DOOR.z0 - 0.04; box(w, 2.0, 0.05, M.wood, CAB - w / 2 - 0.04, Y0 + 1.0, DOOR.z1 - 0.02); }   // the door, open inward against the north wall's sill
  box(CAB * 2, 0.08, CAB * 2, M.wood, 0, Y0 + TOPW + 0.04, 0);   // the ceiling, so from inside you see boards, not the sky
  // the roof: a hipped cap over the deck, snow on it, a stove pipe and the pennant on the peak
  const roof = part(new THREE.ConeGeometry(4.3, 1.9, 4, 1, true), M.roof, 0, Y0 + TOPW + 0.95, 0, tower); roof.rotation.y = Math.PI / 4;
  const snowCap = part(new THREE.ConeGeometry(3.9, 1.75, 4, 1, true), M.snow, 0, Y0 + TOPW + 1.06, 0, tower); snowCap.rotation.y = Math.PI / 4;
  part(new THREE.CylinderGeometry(0.09, 0.09, 1.45, 6), M.stone, -1.65, Y0 + TOPW + 0.72, -1.6, tower);   // the stove pipe: just clear of the roof, well below the flag
  // the panes: glowing, as the cabin's, seen from afar; clear glass and the room behind it near
  panes = new THREE.InstancedMesh(new THREE.PlaneGeometry(CAB * 2 - 0.1, HEAD - SILL), winMat, 4);
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; panes.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(a) * (CAB + 0.07), Y0 + (SILL + HEAD) / 2, Math.cos(a) * (CAB + 0.07)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(1, 1, 1))); }
  tower.add(panes);
  glass = new THREE.Mesh(mergeGeometries([0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2; return new THREE.PlaneGeometry(CAB * 2 - 0.1, HEAD - SILL).rotateY(a).translate(Math.sin(a) * (CAB + 0.02), Y0 + (SILL + HEAD) / 2, Math.cos(a) * (CAB + 0.02)); })),
    lam({ color: '#cfe0ee', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  glass.userData.keep = true; glass.renderOrder = 2; tower.add(glass);
  // the room, near only
  inner = new THREE.Group(); inner.name = 'LookoutInside'; tower.add(inner);
  const r = mulberry(41);
  const mapTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,96,64,.5)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(w / 2 + (r() - 0.5) * 60, h / 2 + (r() - 0.5) * 60, 20 + i * 8, 14 + i * 7, r(), 0, 7); g.stroke(); }
    g.strokeStyle = '#7a3a2a'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 6, 0, 7); g.stroke(); g.beginPath(); g.moveTo(w / 2, 8); g.lineTo(w / 2, h - 8); g.moveTo(8, h / 2); g.lineTo(w - 8, h / 2); g.stroke(); g.fillStyle = '#3a6a8a'; g.fillRect(40, 150, 60, 30); });
  const shelfTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#4a3424'; g.fillRect(0, 0, w, h); for (let x = 4; x < w - 6;) { const bw = 5 + r() * 7; g.fillStyle = ['#8a3a2a', '#2f5a6a', '#c8a050', '#4a6a3a', '#6a4a7a'][(r() * 5) | 0]; g.fillRect(x, 8 + r() * 8, bw, 24); x += bw + 1; } g.fillStyle = '#2a1c12'; g.fillRect(0, 32, w, 4); for (let x = 6; x < w - 10; x += 16) { g.fillStyle = '#d8c8a8'; g.fillRect(x, 42, 10, 14); } });
    const warm = (o) => { const m = lam(o); m.emissive.set('#5a3418'); m.emissiveIntensity = 0; return m; };   // lit a little by the lamp after dark (lookoutStep)
  const IW = warm({ color: '#8a6a4a' }), IM = warm({ map: mapTex }), IS = warm({ map: shelfTex }), IK = warm({ color: '#2a2624' });
  const ib = (w, h, d, mat, x, y, z, ry = 0) => box(w, h, d, mat, x, Y0 + y, z, ry, 0, inner);
  ib(0.18, 0.9, 0.18, IW, 0, 0.45, 0); ib(0.9, 0.05, 0.9, IW, 0, 0.92, 0);   // the fire finder's stand
  part(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14), IM, 0, Y0 + 0.97, 0, inner);   // its map, the sighting ring round it
  part(new THREE.TorusGeometry(0.41, 0.02, 4, 16).rotateX(Math.PI / 2), IK, 0, Y0 + 1.0, 0, inner);
  ib(0.04, 0.22, 0.02, IK, 0.38, 1.1, 0); ib(0.04, 0.22, 0.02, IK, -0.38, 1.1, 0);   // the sights
  part(new THREE.CylinderGeometry(0.07, 0.07, TOPW - 0.75, 6), IK, -1.65, Y0 + 0.75 + (TOPW - 0.75) / 2, -1.6, inner);   // the stove's pipe up through the roof (the bed and stove: furnishFromTent)
  warmLam = (o) => warm(o);
  ib(0.42, 0.06, 0.42, IW, 1.2, 0.45, -1.1); ib(0.42, 0.5, 0.05, IW, 1.2, 0.73, -1.3); for (const [x, z] of [[1.0, -0.9], [1.4, -0.9], [1.0, -1.3], [1.4, -1.3]]) ib(0.04, 0.45, 0.04, IW, x, 0.22, z);   // a chair
  ib(1.4, 0.7, 0.3, IS, 0.6, SILL / 2 + 0.02, -CAB + 0.24);   // a shelf of books and jars under the south windows
  ib(0.9, 0.6, 0.02, IM, -0.5, 0.55, CAB - 0.08);   // the area map, pinned under the north windows
  lampMat = new THREE.MeshBasicMaterial({ color: '#ffd28a' }); ib(0.14, 0.2, 0.14, lampMat, 0.6, 0.8, -CAB + 0.24);   // the lamp on the shelf
  // the flag on the peak
  return pennant({ parent: tower, at: new THREE.Vector3(0, Y0 + TOPW + 1.85, 0), pole: 2.4, size: 1.0, tex: scoutPennant(), poleMat });
}
export const lookoutInside = () => inner;

// the scout tent's bed and stove (build_camp.py wall_tent: soft_bed, the stove and its kettle), cut out of the camp set's Tent
// mesh by their boxes in its frame (glTF: x across, y up, z = -Blender y; TENT's bed and stove are Blender [x, y]) and stood in
// the cab: the bed along the west wall, the stove in the south-west corner under its pipe. The floor, the walls and the pipe
// that leave the boxes stay with the tent. Returns the triangles added (0 when the tent has no bed or stove sizes).
export function furnishFromTent(tent) {
  const { bed, stove, W } = tent.userData || {};
  if (!inner || !bed || !stove || !tent.geometry) return 0;
  const g0 = tent.geometry.index ? tent.geometry.toNonIndexed() : tent.geometry, P = g0.attributes.position, UV = g0.attributes.uv, C = g0.attributes.color;
  const cut = ([cx, cz], hx, hz, top, to, flip = false) => { const pos = [], uv = [], col = [], f = flip ? -1 : 1;   // flip: turned half round, its door to the room
    for (let t = 0; t < P.count; t += 3) { let ok = true, hi = 0;
      for (let i = t; i < t + 3 && ok; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); ok = Math.abs(x - cx) <= hx && Math.abs(z - cz) <= hz && y <= top && Math.abs(x) < W - 0.01; hi = Math.max(hi, y); }
      if (!ok || hi < 0.09) continue;   // the floor's planks are lower
      for (let i = t; i < t + 3; i++) { pos.push(f * (P.getX(i) - cx) + to[0], P.getY(i), f * (P.getZ(i) - cz) + to[1]); if (UV) uv.push(UV.getX(i), UV.getY(i)); if (C) col.push(C.getX(i), C.getY(i), C.getZ(i)); } }
    return { pos, uv, col }; };
  const parts = [cut([bed[0], -bed[1]], 0.5, 1.1, 0.9, [-1.8, 1.0]), cut([stove[0], -stove[1]], 0.42, 0.42, 1.0, [-1.65, -1.72], true)];   // the stove turned so its collar (0.12 m behind its middle) sits under the pipe
  const g = new THREE.BufferGeometry(), cat = (k) => parts.flatMap((q) => q[k]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(cat('pos'), 3));
  if (UV) g.setAttribute('uv', new THREE.Float32BufferAttribute(cat('uv'), 2));
  if (C) g.setAttribute('color', new THREE.Float32BufferAttribute(cat('col'), 3));
  g.computeVertexNormals();
  const m0 = tent.material, mesh = new THREE.Mesh(g, warmLam({ map: m0.map || null, vertexColors: !!C, side: m0.side }));
  mesh.position.y = FLOOR; mesh.name = 'LookoutTentFurniture'; inner.add(mesh);
  return g.attributes.position.count / 3;
}

// each frame: the room and its clear glass near, the glowing panes far; the lamp and the room's glow after dark
const wp = new THREE.Vector3();
export function lookoutStep(night) {
  if (!inner) return;
  const near = camera.position.distanceTo(wp.set(TOWER.x, BASE + FLOOR, TOWER.z)) < INNER_R;
  inner.visible = glass.visible = near; panes.visible = !near;
  if (near) { lampMat.color.setScalar(0.55 + 0.45 * night).multiply(new THREE.Color('#ffd28a')); inner.traverse((o) => { if (o.material?.emissive) o.material.emissiveIntensity = 1.4 * night; }); }
}
