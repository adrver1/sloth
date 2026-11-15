// Summit Cabin, the sloths' homes and food places (Adriaen 2026-11-15, plan L3): what the camp's sloth code (camp/sloth/) is
// given through camp/stage.js HOMES and FOOD at the summit, in the scout camp's frame (castStage.js). Each of the seven has its
// spot here, where it was in the first summit PR, and lives its camp day from it: errands to eat (no more than three away at
// once), naps somewhere cozy, a sit with him on his log, a hello to the ones it meets.
//   Sunny, Bandit, Figgy   on the three log seats, facing the fire (Sunny's is the bench seat: s'mores, and he may borrow it)
//   Hibi                   napping on the sheepskin by the fire (asleep there most of the time, as in the hammock in the camp)
//   Mango                  on the porch bench by the cabin door, looking out over the valley; up the porch steps to get there
//   Pip                    standing by the snowman, looking at the fire
//   Hazel                  peeking out of the tent doorway
// The cozy places for a nap away from home: the two in the tent's bed (as in the camp) and the other half of the sheepskin.
// The food: the camp's table and kitchen crate (the scout camp has both) and a basket of fruit on the porch, by the steps.
// Exports HOMES and FOOD (life.js hands them to the stage before the sloths are built) and the sheepskin's and the basket's
// meshes once made. Imported by life.js only after castStage.js (it pulls in the cast). Triangles: the basket 24, the
// sheepskin 2, the porch steps 36, a fruit 20 to 35 (camp/food.js).
import * as THREE from 'three';
import { SEAT_GAPS, SEAT_SLOT } from '../camp/layout.js';
import { seatKey } from '../camp/places.js';
import { seatSpot, tentBeds, tentSpot } from '../camp/sloth/spots.js';
import { GRAB, fruit, restOn } from '../camp/sloth/table.js';
import { isFree } from '../camp/sloth/walk.js';
import { scene } from '../camp/stage.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOP } from './land.js';
import { canvasTex, scene as world } from './core.js';
import { M } from './cabin.js';
import { BASKET, PLACES, STEPS } from './castStage.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const flat = (v) => v.clone().setY(0);

// ---------------------------------------------------------------- the homes
const rugA = SEAT_GAPS[2], RUG = V(Math.cos(rugA) * 1.75, 0.03, Math.sin(rugA) * 1.75);   // the sheepskin, in the gap between two logs
let rug = null;
function sheepskin() {   // a soft cream oval painted on one quad (2 triangles)
  const tex = canvasTex(128, 96, (g, w, h) => {
    g.fillStyle = '#efe6d6'; g.beginPath(); for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, r = 1 + 0.07 * Math.sin(i * 2.7) + 0.05 * Math.sin(i * 5.1);
      g.lineTo(w / 2 + Math.cos(a) * w * 0.46 * r, h / 2 + Math.sin(a) * h * 0.44 * r); } g.closePath(); g.fill();
    g.strokeStyle = 'rgba(160,140,115,.35)'; g.lineWidth = 2; for (let i = 0; i < 70; i++) { const x = w * (0.15 + 0.7 * ((i * 37) % 70) / 70), y = h * (0.18 + 0.64 * ((i * 53) % 70) / 70);
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 1.3); g.stroke(); } });
  rug = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3 }));
  rug.position.copy(RUG).setY(0.02); rug.receiveShadow = true; scene.add(rug);
}
// a spot on the ground or on the porch, in the stage's frame: it walks to door, then settles in
const ground = (name, who, at, yaw, clip, scale, door, more) => ({ name, for: who, parent: scene, at, yaw, clip, scale, door, doze: ['curl', 1], sitUp: true, ...more });
// the porch steps at the deck's west end (castStage.js STEPS, where the walkers' ground ramps up): three wooden steps, one draw
// in the cabin's wood (36 triangles). Their own mesh, not the cabin's, so the cabin's baked light map still fits it.
let steps = null;
function porchSteps() {
  const n = 3, run = (STEPS.x1 - STEPS.x0) / n, deep = STEPS.z1 - STEPS.z0;
  steps = new THREE.Mesh(mergeGeometries(Array.from({ length: n }, (_, i) => { const top = PLACES.deck * (i + 1) / (n + 1);
    return new THREE.BoxGeometry(run, top, deep).translate(STEPS.x0 + run * (i + 0.5), TOP + top / 2, (STEPS.z0 + STEPS.z1) / 2); })), M.wood);
  steps.castShadow = steps.receiveShadow = true; world.add(steps);
}
function spots() {
  sheepskin(); porchSteps();
  const S = PLACES.snowman, pip = V(S.at.x - 0.75, 0, S.at.z - 0.2);   // just off the snowman's side
  const bench = V(PLACES.bench.at.x + 0.7, PLACES.deck + 0.445, PLACES.bench.at.z + 0.02);   // the bench's middle (his end is the far one)
  return [
    seatSpot(0, SEAT_SLOT.sunny, { for: 'Sunny', bench: true, claims: [seatKey(0)] }),
    seatSpot(1, 0.2, { for: 'Bandit' }), seatSpot(2, -0.2, { for: 'Figgy' }),   // off the ends he sits on (SEAT_SLOT.op)
    ground('rug', 'Hibi', RUG.clone().setX(RUG.x - 0.2), rugA, 'nap', 2.2, flat(RUG).setLength(2.7), { asleep: true, doze: ['nap', 1], noHop: true }),
    ground('porch', 'Mango', bench, 0, 'reach', 1.9, bench.clone().setY(PLACES.deck).setZ(bench.z - 0.75)),
    ground('snowman', 'Pip', pip, Math.atan2(-pip.x, -pip.z), 'idle', 2.2, pip.clone().addScaledVector(pip.clone().sub(flat(S.at)).normalize(), 0.5), { noHop: true }),
    { ...tentSpot(), for: 'Hazel' },
  ];
}
function guests(guest) {
  const T = HOMES.made.find((q) => q.name === 'tent'), R = HOMES.made.find((q) => q.name === 'rug');
  if (T) tentBeds(T, guest);
  if (R) guest(R, { key: 'rug:1', at: RUG.clone().setX(RUG.x + 0.25), asleep: false });   // the other half of the sheepskin
}
export const HOMES = { made: [], spots: () => (HOMES.made = spots()), guests };

// ---------------------------------------------------------------- the food: the table, the crate and the porch basket
let basket = null;
function makeBasket(h) {   // a round wicker basket, 8 sides, open at the top; its weave painted (24 triangles)
  const tex = canvasTex(64, 32, (g, w, hh) => { g.fillStyle = '#b07a42'; g.fillRect(0, 0, w, hh); g.fillStyle = 'rgba(70,40,15,.45)';
    for (let y = 0; y < hh; y += 6) for (let x = (y / 6) % 2 ? 0 : 4; x < w; x += 8) g.fillRect(x, y, 4, 3); g.fillStyle = '#7a4f28'; g.fillRect(0, 0, w, 3); });
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const b = new THREE.Group(), side = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, h * 0.7, 8, 1, true), mat), floor = new THREE.Mesh(new THREE.CircleGeometry(0.17, 8).rotateX(-Math.PI / 2), mat);
  side.position.y = h * 0.35; floor.position.y = h * 0.55; side.castShadow = true; b.add(side, floor);   // the fruit lies on a false floor just under the rim, so it shows
  b.position.copy(BASKET); scene.add(b); b.name = 'Basket';
  return b;
}
// two places at the basket, on the deck off its front and its open side; a sloth sits there and reaches in (eat_high)
function basketPlaces() {
  const reach = GRAB.eat_high.y * 2, h = Math.max(0.12, Math.min(0.3, reach / 0.55 * 0.9));   // so a sloth of size 2 meets the fruit lying in it
  basket = makeBasket(h);
  const c = BASKET.clone(), slots = [];
  for (let k = 0; k < 12 && slots.length < 2; k++) {
    const a = -Math.PI / 2 - Math.PI * 0.75 + k * Math.PI / 8, u = V(Math.cos(a), 0, Math.sin(a)), g = c.clone().addScaledVector(u, 0.62);
    if (!isFree(g) || slots.some((q) => q.u.dot(u) > 0.5)) continue;
    const at = c.clone().addScaledVector(u, 0.06).setY(c.y + h * 0.55);
    const slot = { name: 'basket', key: `basket:${slots.length}`, p: g, u, yaw: Math.atan2(u.x, u.z), clip: 'eat_high', who: null, h: c.y, food: { at, mesh: fruit(), back: 0 } };
    restOn(slot.food); slots.push(slot);
  }
  return { name: 'basket', c, slots };
}
export const FOOD = (tableAndCrate) => [...tableAndCrate(), basketPlaces()];
export const made = () => ({ rug, basket, steps });
