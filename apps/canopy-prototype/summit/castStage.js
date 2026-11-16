// Summit Cabin's stage for the camp's cast (Adriaen 2026-11-15, plan L1: the camp's life engine runs here too, nothing copied):
// hands the summit to camp/stage.js before main.js imports the cast. The cast lives in the scout camp's frame, scoutCamp.js
// campGroup at CAMP (the fire at its origin, the camp's own props in the camp's own arrangement), so camp/layout.js's places
// are the summit's too; origin tells the cast where that frame sits in the world. What differs from the camp is set here:
//   camera, me      stand-ins in the camp's frame, kept on the summit's camera and you each frame (syncCast, before the cast's
//                   step; syncBack after it, so his nudge moves you): castCam is a camera inside campGroup, castMe.pos your feet
//   groundAt        the land under the camp's frame, and the porch deck where it is
//   blockers        the fire, the tent, the camp's seats, table, crate and woodpile (layout.js WEAR), the snowman, the poles,
//                   the cabin's walls and porch posts, the cabin's woodpile
//   chores          your chores (camp/chores.js), set by life.js once they are built; none until then
//   walkY, NAV      the sloths walk on groundAt too (up the porch steps), on a grid wide enough for the porch
//   OPT             the camp's sloths too, saving nothing of them (plan L5: they start at their spots each visit)
//   HOMES, FOOD     their homes and food places (slothHomes.js), set by life.js once it is built
//   OP_DAY          his summit day (opDay.js), set by life.js once it is built
//   LANTERNS        the jar lanterns on the string from the cabin to the tent: the sloths glow warm near them at night, as in the camp
// No jeep, hammock, laundry line or big trees here (HAMMOCK and LAUNDRY still get the camp's values, which
// the sloths' poses measure from when they load; no spot here uses them). Exports castCam, castMe, syncCast(), syncBack(), CAST_O
// and the summit's places in the camp's frame (PLACES: the cabin's woodpile, the porch bench, the snowman, the way round the cabin).
// Imported by life.js, which imports the cast only after it (see life.js).
import * as THREE from 'three';
import { D, SNOWMAN, TOP, W, YB, height } from './land.js';
import { camera, me } from './core.js';
import { CAMP, CHOP, campGroup, lanternLights } from './scoutCamp.js';
import { A0, CRATE, HAMMOCK, LAUNDRY, RC, SEATS, SEAT_GAPS, SEAT_R, SEAT_SLOT, SOUP_POT, TABLE, TENT, WOOD_PILE, wearBlockers } from '../camp/layout.js';
import { setStage } from '../camp/stage.js';
import { daytimeApi } from './daytime.js';
import { yawTo } from '../camp/util.js';

if (CAMP.turn) throw new Error('castStage.js: the cast keeps a shifted frame only, so the scout camp must not turn');
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const CAST_O = V(CAMP.x, TOP, CAMP.z);           // where the camp's frame sits in the world
const st = (x, y, z) => V(x - CAST_O.x, y, z - CAST_O.z);   // a world x, z (and a height over TOP) in the camp's frame

// ---------------------------------------------------------------- the summit's places, in the camp's frame
const PORCH = { x0: -W / 2, x1: W / 2, z0: -(D / 2 + 3), z1: -D / 2 };   // the porch deck, world x and z (cabin.js: W wide, 3 m deep)
const onPorch = (x, z) => x > PORCH.x0 && x < PORCH.x1 && z > PORCH.z0 && z < PORCH.z1;
// the porch steps at both ends of the deck (slothHomes.js porchSteps: three steps up to the deck, z -5.0 to -6.2, reaching `run`
// out past the deck's end; Adriaen 2026-11-16: no way down on the west end), a ramp for the walkers
export const STEPS = { run: 0.85, z0: -(D / 2 + 2.2), z1: -(D / 2 + 1.0) };
const onSteps = (x, z) => Math.abs(x) >= W / 2 && Math.abs(x) < W / 2 + STEPS.run && z > STEPS.z0 && z < STEPS.z1;
export const PLACES = {
  // the cabin's woodpile against its west wall (cabin.js: 0.9 x 3.4 m at x -(W/2 + 0.55)); he stands off its outer face
  woodpile: { stand: st(-(W / 2 + 1.55), 0, 0.4), at: st(-(W / 2 + 0.55), 0, 0.4), yaw: yawTo(V(1, 0, 0)) },
  // the porch bench by the door (cabin.js: 1.8 x 0.45 x 0.5 at x -2.7, against the wall), its top 0.45 m over the deck; he sits
  // facing out over the valley (-z), his end the one away from the door
  bench: { at: st(-3.2, 0.45, -(D / 2 + 0.47)), yaw: yawTo(V(0, 0, -1)), key: 'porch:bench' },
  // the snowman (land.js SNOWMAN, east of the cabin), turned toward the porch; he stands 0.95 m in front of it
  snowman: (() => { const c = st(SNOWMAN.x, 0, SNOWMAN.z), f = st(SNOWMAN.face[0], 0, SNOWMAN.face[1]).sub(c).setY(0).normalize(); return { at: c, front: c.clone().addScaledVector(f, 0.95) }; })(),
  // the way round the cabin's west end to the porch: off its back corner, beside the porch's west end, then up onto the deck
  round: [st(-(W / 2 + 1.6), 0, D / 2 + 0.9), st(-(W / 2 + 1.6), 0, -(D / 2 + 1.4)), st(-W / 2 + 0.5, 0, -(D / 2 + 1.6))],
  deck: YB,   // the porch deck's top over the ground
};
export const BASKET = st(-5.0, YB, -(D / 2 + 0.55));   // the sloths' fruit basket on the porch, by the steps (slothHomes.js)

// ---------------------------------------------------------------- what the cast walks round
export const blockers = [];   // also the player's, in the world's frame (player.js)
const block = (at, r, walk = null) => blockers.push({ at, r, walk, wild: false, tag: null });
block(V(0, 0, 0), 0.9, { r: 0.75 });                                                    // the fire, as in the camp
block(TENT.at.clone().multiplyScalar(1 + 0.275 / TENT.at.length()), 1.9);               // the whole tent, as in the camp before its walls
for (const b of [...wearBlockers('camp'), ...wearBlockers('lived')]) if (!b.at.equals(WOOD_PILE.at)) block(b.at, b.r);   // the seats, the table, the crate
block(CHOP.at, CHOP.r);                                                                    // the chopping stump, by the cabin's woodpile (scoutCamp.js)
block(PLACES.snowman.at, 0.55);
block(st(CAMP.x - 5.2, 0, CAMP.z + 3.4), 0.15);                                          // the lantern string's pole
block(st(CAMP.x + 5.5, 0, CAMP.z + 2.5), 0.15);                                          // the flag's pole
for (let x = -W / 2 + 0.4; x <= W / 2 - 0.4; x += 1) { block(st(x, 0, D / 2 - 0.45), 0.6); block(st(x, 0, -D / 2 + 0.45), 0.6); }   // the cabin's long walls
for (const x of [-0.8, 0, 0.8]) block(st(x, 0, D / 2 + 0.9), 0.55);   // the entrance's stoop (cabin.js ENTRY): they walk round it
for (let z = -D / 2 + 1.4; z <= D / 2 - 1.4; z += 1) { block(st(-W / 2 + 0.45, 0, z), 0.6); block(st(W / 2 - 0.45, 0, z), 0.6); }   // its ends
block(PLACES.woodpile.at.clone().setZ(PLACES.woodpile.at.z - 1.1), 0.6); block(PLACES.woodpile.at, 0.6); block(PLACES.woodpile.at.clone().setZ(PLACES.woodpile.at.z + 1.1), 0.6);
for (const x of [-5.6, -1.9, 1.9, 5.6]) block(st(x, 0, -(D / 2 + 2.8)), 0.2);             // the porch posts
block(st(-2.7, 0, -(D / 2 + 0.45)), 0.6, { r: 0.25 });                                     // the bench (his seat's feet are inside it, so he still reaches them)
// the deck's edges, so walkers come up the steps: along its front, its east end, and its west end either side of the steps
for (let x = -W / 2 + 0.2; x <= W / 2 - 0.2; x += 0.5) block(st(x, 0, -(D / 2 + 3)), 0.25);
for (let z = -(D / 2 + 0.5); z >= -(D / 2 + 2.8); z -= 0.5) block(st(W / 2, 0, z), 0.25);
block(st(-W / 2, 0, -(D / 2 + 0.5)), 0.25); block(st(-W / 2, 0, -(D / 2 + 2.8)), 0.25);
block(BASKET, 0.22);                                                                       // the basket

// ---------------------------------------------------------------- you and the camera, in the camp's frame
export const castCam = new THREE.PerspectiveCamera();
castCam.matrixAutoUpdate = true;
export const castMe = { pos: V(), seat: null, vel: V(), walkT: 0 };
const was = V();
// before the cast's step: the stand-in camera and you, from the summit's camera and you
export function syncCast() {
  if (castCam.parent !== campGroup) campGroup.add(castCam);
  castCam.position.copy(camera.position).sub(CAST_O); castCam.quaternion.copy(camera.quaternion);
  castCam.projectionMatrix.copy(camera.projectionMatrix); castCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  castCam.updateMatrixWorld(true);
  castMe.pos.set(me.x - CAST_O.x, groundAt(me.x - CAST_O.x, me.z - CAST_O.z), me.z - CAST_O.z); was.copy(castMe.pos); castMe.walkT = me.walkT;   // how far you have walked: what you carry sways with it (activities/carry.js)
  // your seat (a log by the fire: camp/linger.js, or the jeep's), in the camp's frame: he comes and joins you at the fire (operator/day.js)
  const s = me.seat; if (s !== seatWas) { seatWas = s; castMe.seat = s && { ...s, pos: s.pos.clone().sub(CAST_O) }; }
  else if (s) castMe.seat.pos.copy(s.pos).sub(CAST_O);
}
let seatWas = null;
// after it: a nudge he gave you (operator/step.js) moves you
export function syncBack() { if (castMe.pos.x !== was.x || castMe.pos.z !== was.z) { me.x += castMe.pos.x - was.x; me.z += castMe.pos.z - was.z; } }

function groundAt(x, z) { const wx = x + CAST_O.x, wz = z + CAST_O.z; return onPorch(wx, wz) ? YB : onSteps(wx, wz) ? YB * (W / 2 + STEPS.run - Math.abs(wx)) / STEPS.run : height(wx, wz) - TOP; }

const NO_CHORES = { cook: { stage: 'none', can: () => false }, food: () => null };
setStage({ day: daytimeApi.day, scene: campGroup, camera: castCam, origin: CAST_O, OPT: { op: true, campsloths: true, slothsave: false, slothmat: 'lambert' }, LIVED: true,
  D: { shells: 3 }, S: { slothTint: 0xffffff }, KEYS: { save: 'canopy-camp-save' }, me: castMe, groundAt, walkY: groundAt, NAV: { half: 20, rim: 19.5 }, blockers, blockersVersion: () => 0,
  LANTERNS: { lights: lanternLights }, jeepApi: null, branchCurves: [], heroWood: null, trunkR: null, chores: NO_CHORES,
  A0, CRATE, HAMMOCK, HERO: [], LAUNDRY, RC, SEATS, SEAT_GAPS, SEAT_R, SEAT_SLOT, SOUP_POT, TABLE, TENT });
