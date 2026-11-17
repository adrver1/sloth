// Summit Cabin sloths (Adriaen 2026-11-15, plan L3, L4): the camp's own seven, run by the camp's sloth code (camp/sloth/,
// sloth/build.js buildCast) in the scout camp's frame, with the summit's homes and food (slothHomes.js through the stage's
// HOMES and FOOD). Each lives its camp day from its summit spot: errands to the table, the crate or the porch basket (no more
// than three away at once), naps somewhere cozy (the tent's bed, the sheepskin), a sit with him on his log or his lap, a hello
// to the ones it meets, s'mores on Sunny's log. They start at their spots on every visit (nothing of them is saved here, L5).
// On top of the camp's look: each wears its knitted hat and scarf (winter.js), and breathes little frosty puffs in the cold
// (one instanced draw for all of them, fx.js plume).
// What you do (L4) is the camp's own (camp/input.js, the same menus, boop, feed and hold to feed as in the camp; the chores,
// camp/chores.js, life.js): the porch basket (it lights up) gives you a fruit to hold, which a sloth's menu then offers to give
// (it eats it with its eat clip when it sits up, camp/sloth/gifts.js); and keep looking at one for about 3 s and it waves slowly.
// Exports buildSlothLife(gltf) (life.js, once the sloth model is in, before he starts), slothStep(dt, now) (life.js, each
// frame once the stand-ins are synced) and hands { eat(s, mesh, from) } (life.js lifeHooks, for
// camp/input.js). Imported by life.js only after castStage.js (it pulls in the cast).
// Triangles: a sloth 826 + fur shells (3) + its trait + winter gear 96; the basket 24, the sheepskin 2, the porch steps 72.
import * as THREE from 'three';
import { buildCast } from '../camp/sloth/build.js';
import { camp } from '../camp/sloth/state.js';
export { camp };   // the seven, for life.js's shot hooks
import { slothsStep } from '../camp/sloth/life.js';
import { campStep } from '../camp/sloth/step.js';
import { warmStep } from '../camp/sloth/body.js';
import { buildPlaces } from '../camp/sloth/table.js';
import { eatGift } from '../camp/sloth/gifts.js';
import { fxStep } from '../camp/fx.js';
import { camera, setStage, toWorld } from '../camp/stage.js';
import { FOOD, HOMES, made } from './slothHomes.js';
import { TRIS } from './land.js';
import { scene } from './core.js';
import { winterGear } from './winter.js';
import { plume } from './fx.js';
import { LIGHT } from './daylight.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let breath = null;
const tmp = V(), fwd = V(), puffAt = V(), up = V(0, 1, 0), q = new THREE.Quaternion();

export function buildSlothLife(gltf) {
  setStage({ HOMES, FOOD });
  buildCast(gltf, { keep: false });   // the cast, in its homes here; nothing restored
  buildPlaces();                      // the table, the crate and the porch basket, each with a fruit
  let gear = 0; for (const s of camp) gear = winterGear(s.name, s.head);
  breath = plume(camp.length * 2); breath.mat.uniforms.uBright.value = 1; scene.add(breath.mesh);
  let n = 0; for (const s of camp) s.o.traverse((m) => { if (m.isMesh && m.visible) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  TRIS.push([`Sloths (${camp.length}, fur and winter gear ${gear} each)`, n], ['Sheepskin (painted)', 2], ['Fruit basket', 24], ['Porch steps (one draw)', 36], ['Frosty breath (one draw)', camp.length * 4]);
}

// what you do is the camp's own (camp/input.js and camp/chores.js: the porch basket is where your fruit comes from, life.js)
export const basket = () => made().basket;   // the porch basket, where your fruit comes from (life.js hands it to the chores)
export const hands = {
  eat: (s, mesh, from) => eatGift(s, mesh, from),
};

// ---------------------------------------------------------------- each frame
export function slothStep(dt, now) {
  if (!breath) return;
  slothsStep(dt); campStep(dt); fxStep(dt);
  warmStep(0.85 + 0.15 * Math.sin(now * 9) * Math.sin(now * 2.3), LIGHT.night);
  // two puffs each, a breath every 3.2 s: out from the mouth, rising and spreading as it fades
  for (const [i, s] of camp.entries()) {
    s.head.getWorldPosition(tmp); fwd.set(0, 0, -1).applyQuaternion(s.o.getWorldQuaternion(q)).setY(0).normalize();
    const far = !s.o.visible || tmp.distanceToSquared(toWorld(puffAt.copy(camera.position))) > 30 * 30, sc = s.o.getWorldScale(puffAt).x;
    for (let k = 0; k < 2; k++) {
      const t = ((now + i * 0.47) / 3.2 + k * 0.12) % 1, life = t / 0.45, j = i * 2 + k;
      if (far || life > 1) { breath.set(j, tmp, 0, 0); continue; }
      const p = puffAt.copy(tmp).addScaledVector(fwd, (0.08 + 0.25 * life) * sc / 2).addScaledVector(up, (0.02 + 0.12 * life) * sc / 2);
      breath.set(j, p, (0.05 + 0.2 * life) * sc / 2, 0.32 * Math.sin(Math.PI * life) * (0.4 + 0.6 * (1 - LIGHT.storm)));
    }
  }
  breath.mat.uniforms.uBright.value = 0.5 + 0.5 * LIGHT.bright; breath.done();
}
