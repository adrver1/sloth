// Summit Cabin: the fire lookout on the watch hill, and walking on it (Adriaen 2026-11-16: "I want stairs going up, a small
// interior (when we're close), a flag on the top"; the look after the Long Dark's sunset lookout, summit-level/look/reference/).
// A timber tower 12 m tall on four legs with X braces, a deck all round the cab with a railing, and two flights of stairs up the
// outside: the first along the south face to a landing at the corner, the second up the east face to the deck. The cab has a
// door, glass all round and, within INNER_R of the camera, a small interior: the fire finder on its stand in the middle, a cot,
// a little stove with its pipe through the roof, a chair, a shelf, a map on the wall and a lamp. Further off its windows are the
// glowing panes the cabin's are (cabin.js winMat), so the cab reads as lit from the valley. A scout pennant flies from the roof's
// peak (flag.js). Everything is in the tower's own frame: x along its south face, z through it, y up from TOWER.y - 0.5.
// Exports buildLookout(tower, kit) (cabin.js buildCabin: fills the group; kit = { M, lam, part, winMat }), lookoutFloor(x, z,
// feet) and lookoutBlocks(x0, z0, x1, z1, feet) (player.js: the stairs, deck and cab under your feet, and what stops you) and
// lookoutStep(night) (each frame: the interior shown near, the panes far, the lamp after dark).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOWER, mulberry } from './land.js';
import { camera, canvasTex } from './core.js';
import { pennant, poleMat, scoutPennant } from './flag.js';

// ---------------------------------------------------------------- the plan (the tower's frame, metres)
const TURN = 0.5, BASE = TOWER.y - 0.5;   // the tower's turn and the height its frame starts at (cabin.js puts the group there)
const TH = 12, LEG = 2.6, DECK = 3.5, CAB = 2.3, G = 0.5, MID = 6.1, FLOOR = TH + 0.15;   // deck height, leg spread, deck and cab half-widths, the ground, the landing, the deck's top
const F1 = { x0: -3.6, x1: 3.5, z0: -4.7, z1: -3.6 };    // the first flight: along the south face, climbing toward +x, G to MID
const L1 = { x0: 3.5, x1: 4.7, z0: -4.7, z1: -3.5 };     // the corner landing, at MID
const F2 = { x0: 3.6, x1: 4.7, z0: -3.5, z1: 2.4 };      // the second flight: up the east face toward +z, MID to FLOOR
const L2 = { x0: 3.6, x1: 4.7, z0: 2.4, z1: 3.5 };       // the top landing, level with the deck: the gap in its railing
const DOOR = { z0: 0.75, z1: 1.85 };                      // the cab's door, in its east wall (+x), facing the stairs' top
const INNER_R = 32;   // the interior shows within this many metres of the camera
const inR = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const c = Math.cos(TURN), s = Math.sin(TURN);
const local = (x, z) => { const dx = x - TOWER.x, dz = z - TOWER.z; return [dx * c - dz * s, dx * s + dz * c]; };   // the inverse of the group's turn

// the floor under you in the tower's frame, or null off it: the flights are ramps, the landings and deck flat; the deck only
// counts once you are up (fy, your feet, above the legs' braces), so you can still walk under the tower
function floorLocal(lx, lz, fy) {
  if (inR(F1, lx, lz)) return G + ((MID - G) * (lx - F1.x0)) / (F1.x1 - F1.x0);
  if (inR(L1, lx, lz)) return MID;
  if (inR(F2, lx, lz)) return MID + ((FLOOR - MID) * (lz - F2.z0)) / (F2.z1 - F2.z0);
  if (inR(L2, lx, lz)) return FLOOR;
  if (Math.abs(lx) <= DECK && Math.abs(lz) <= DECK && fy > TH - 3) return FLOOR;
  return null;
}
// where your feet are on the tower (world y), or null where it is not under you (player.js then takes the ground)
export function lookoutFloor(x, z, feet) { const [lx, lz] = local(x, z), f = floorLocal(lx, lz, feet - BASE); return f === null ? null : BASE + f; }

// what stops a step from (x0, z0) to (x1, z1): the legs (down below), the deck's railing (only the top landing opens onto it), the
// cab's walls (only the door) and the things inside. Climbing more than a step or dropping off an edge is player.js's rule.
const BODY = 0.25;
export function lookoutBlocks(x0, z0, x1, z1, feet) {
  const [ax, az] = local(x0, z0), [bx, bz] = local(x1, z1);
  if (Math.hypot(bx, bz) > 8) return false;
  if (feet - BASE < TH - 3) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (Math.hypot(bx - sx * LEG, bz - sz * LEG) < 0.2 + BODY) return true; return false; }
  const deck = (x, z) => Math.abs(x) <= DECK - BODY && Math.abs(z) <= DECK - BODY, onL2 = (x, z) => inR(L2, x, z) || inR({ x0: DECK - BODY - 0.01, x1: DECK + 0.2, z0: L2.z0 + BODY, z1: L2.z1 - BODY }, x, z);
  if (deck(ax, az) !== deck(bx, bz) && !onL2(ax, az) && !onL2(bx, bz)) return true;
  const cab = (x, z) => Math.abs(x) < CAB + 0.06 + BODY && Math.abs(z) < CAB + 0.06 + BODY;
  if (cab(ax, az) !== cab(bx, bz) && !(bx > 0 && ax > 0 && bz > DOOR.z0 + BODY && bz < DOOR.z1 - BODY)) return true;
  if (cab(bx, bz)) for (const [x, z, r] of INSIDE_BLOCK) if (Math.hypot(bx - x, bz - z) < r + BODY) return true;
  return false;
}
const INSIDE_BLOCK = [[0, 0, 0.45], [-1.65, -1.6, 0.35], [-1.85, 0.6, 0.45], [-1.85, 1.3, 0.45]];   // the fire finder, the stove, the cot (two circles)

// ---------------------------------------------------------------- building it
let inner = null, panes = null, glass = null, lampMat = null;
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
  rail(-E, -E, E, -E, FLOOR, FLOOR); rail(-E, E, E, E, FLOOR, FLOOR); rail(-E, -E, -E, E, FLOOR, FLOOR); rail(E, -E, E, L2.z0, FLOOR, FLOOR);
  for (const x of [-E / 2, 0, E / 2]) { box(0.1, 1.08, 0.1, M.wood, x, FLOOR + 0.5, -E); box(0.1, 1.08, 0.1, M.wood, x, FLOOR + 0.5, E); box(0.1, 1.08, 0.1, M.wood, -E, FLOOR + 0.5, x); }
  // the stairs: treads, two stringers and a hand rail on the open side of each flight; the corner landing on four posts
  const flight = (ax, az, bx, bz, ya, yb, wx, wz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.round((yb - ya) / 0.24), ry = -Math.atan2(bz - az, bx - ax), dx = (bx - ax) / L, dz = (bz - az) / L;
    const tread = new THREE.BoxGeometry(L / n + 0.04, 0.06, 1.0), treads = [];
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; treads.push(tread.clone().rotateY(ry).translate(ax + (bx - ax) * t, ya + ((yb - ya) * (k + 1)) / n - 0.03, az + (bz - az) * t)); }
    part(mergeGeometries(treads), M.wood, 0, 0, 0, tower);
    for (const o of [-0.53, 0.53]) box(Math.hypot(L, yb - ya), 0.26, 0.06, M.wood, (ax + bx) / 2 + wx * o, (ya + yb) / 2 - 0.12, (az + bz) / 2 + wz * o, ry, Math.atan2(yb - ya, L));
    rail(ax + wx * 0.55 - dx * 0.1, az + wz * 0.55 - dz * 0.1, bx + wx * 0.55, bz + wz * 0.55, ya, yb); };
  flight(F1.x0, (F1.z0 + F1.z1) / 2, F1.x1, (F1.z0 + F1.z1) / 2, G, MID, 0, -1);
  flight((F2.x0 + F2.x1) / 2, F2.z0, (F2.x0 + F2.x1) / 2, F2.z1, MID, FLOOR, 1, 0);
  box(L1.x1 - L1.x0 + 0.1, 0.12, L1.z1 - L1.z0 + 0.1, M.wood, (L1.x0 + L1.x1) / 2, MID - 0.06, (L1.z0 + L1.z1) / 2);
  box(L2.x1 - L2.x0 + 0.1, 0.12, L2.z1 - L2.z0 + 0.1, M.wood, (L2.x0 + L2.x1) / 2, FLOOR - 0.06, (L2.z0 + L2.z1) / 2);
  for (const [x, z] of [[L1.x1, L1.z0], [L1.x0 + 0.1, L1.z0], [L1.x1, L1.z1]]) box(0.16, MID, 0.16, M.wood, x, MID / 2, z);
  for (const [x, z] of [[L2.x1, L2.z1], [L2.x1, L2.z0]]) box(0.16, FLOOR, 0.16, M.wood, x, FLOOR / 2, z);
  rail(L1.x0, L1.z0, L1.x1, L1.z0, MID, MID, false); rail(L1.x1, L1.z0, L1.x1, L1.z1, MID, MID, false); rail(L2.x1, L2.z0, L2.x1, L2.z1, FLOOR, FLOOR, false); rail(L2.x0, L2.z1, L2.x1, L2.z1, FLOOR, FLOOR, false);
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
  part(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), M.stone, -1.65, Y0 + TOPW + 1.2, -1.6, tower);
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
  const blanket = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#7a2a24'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8d8b0'; for (const y of [10, 50]) g.fillRect(0, y, w, 4); g.fillStyle = '#2a4a3a'; g.fillRect(0, 16, w, 3); g.fillRect(0, 45, w, 3); });
  const warm = (o) => { const m = lam(o); m.emissive.set('#5a3418'); m.emissiveIntensity = 0; return m; };   // lit a little by the lamp after dark (lookoutStep)
  const IW = warm({ color: '#8a6a4a' }), IM = warm({ map: mapTex }), IS = warm({ map: shelfTex }), IB = warm({ map: blanket }), IK = warm({ color: '#2a2624' });
  const ib = (w, h, d, mat, x, y, z, ry = 0) => box(w, h, d, mat, x, Y0 + y, z, ry, 0, inner);
  ib(0.18, 0.9, 0.18, IW, 0, 0.45, 0); ib(0.9, 0.05, 0.9, IW, 0, 0.92, 0);   // the fire finder's stand
  part(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14), IM, 0, Y0 + 0.97, 0, inner);   // its map, the sighting ring round it
  part(new THREE.TorusGeometry(0.41, 0.02, 4, 16).rotateX(Math.PI / 2), IK, 0, Y0 + 1.0, 0, inner);
  ib(0.04, 0.22, 0.02, IK, 0.38, 1.1, 0); ib(0.04, 0.22, 0.02, IK, -0.38, 1.1, 0);   // the sights
  ib(0.8, 0.35, 1.9, IW, -1.85, 0.18, 0.95); ib(0.78, 0.12, 1.85, IB, -1.85, 0.42, 0.95); ib(0.6, 0.1, 0.35, warm({ color: '#e8e0d0' }), -1.85, 0.52, 1.7);   // the cot, its blanket and pillow
  ib(0.5, 0.55, 0.45, IK, -1.65, 0.28, -1.6); ib(0.3, 0.12, 0.3, IK, -1.65, 0.6, -1.6);   // the stove (its pipe goes up through the roof)
  part(new THREE.CylinderGeometry(0.07, 0.07, TOPW - 0.6, 6), IK, -1.65, Y0 + 0.6 + (TOPW - 0.6) / 2, -1.6, inner);
  ib(0.42, 0.06, 0.42, IW, 1.2, 0.45, -1.1); ib(0.42, 0.5, 0.05, IW, 1.2, 0.73, -1.3); for (const [x, z] of [[1.0, -0.9], [1.4, -0.9], [1.0, -1.3], [1.4, -1.3]]) ib(0.04, 0.45, 0.04, IW, x, 0.22, z);   // a chair
  ib(1.4, 0.7, 0.3, IS, 0.6, SILL / 2 + 0.02, -CAB + 0.24);   // a shelf of books and jars under the south windows
  ib(0.9, 0.6, 0.02, IM, -0.5, 0.55, CAB - 0.08);   // the area map, pinned under the north windows
  lampMat = new THREE.MeshBasicMaterial({ color: '#ffd28a' }); ib(0.14, 0.2, 0.14, lampMat, 0.6, 0.8, -CAB + 0.24);   // the lamp on the shelf
  // the flag on the peak
  return pennant({ parent: tower, at: new THREE.Vector3(0, Y0 + TOPW + 1.85, 0), pole: 2.4, size: 1.0, tex: scoutPennant(), poleMat });
}
export const lookoutInside = () => inner;

// each frame: the room and its clear glass near, the glowing panes far; the lamp and the room's glow after dark
const wp = new THREE.Vector3();
export function lookoutStep(night) {
  if (!inner) return;
  const near = camera.position.distanceTo(wp.set(TOWER.x, BASE + FLOOR, TOWER.z)) < INNER_R;
  inner.visible = glass.visible = near; panes.visible = !near;
  if (near) { lampMat.color.setScalar(0.55 + 0.45 * night).multiply(new THREE.Color('#ffd28a')); inner.traverse((o) => { if (o.material?.emissive) o.material.emissiveIntensity = 1.4 * night; }); }
}
