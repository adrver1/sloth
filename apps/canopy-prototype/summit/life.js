// Summit Cabin life (Adriaen 2026-11-15, "life at the summit", plan L1 to L5): the camp's own cast runs here, nothing copied.
// The seven sloths (slothLife.js: the camp's sloth code with the summit's homes and food, slothHomes.js) and the bearded
// operator (camp/operator/, started with operator/start.js startOperator) in his winter puffer (models/operator_winter.txt,
// npm run pack:operator-winter) with the camp's clips, going about his summit day (opDay.js: the camp's day plus firewood,
// the porch bench and the snowman). They live in the scout camp's frame (castStage.js: the stage, the stand-in camera and
// you), so camp/layout.js's places are theirs here too.
// Taps, highlights and feeding are the camp's own (camp/input.js, set up by summit/player.js): him (talk.js's tap column),
// a sloth (Boop, Feed, Give what you hold), sitting by the fire (camp/linger.js) and your chores (camp/chores.js: logs on the
// fire, the soup, fruit from the porch basket); lifeHooks hands input.js what you hold and a chore out of reach. The cast's
// sounds are the camp's too (camp/audio/castSounds.js).
// Exports buildLife() (main.js, once: the downloads; the cast starts once the scout camp's props are in) and seatStep(dt) (main.js, each frame before you move: camp/linger.js, the log seats by the fire), lifeStep(dt)
// (main.js, each frame after the light). Triangles: his mesh 1,354 (winter_a), one draw; the armful 30, a mug, a book, the
// shadow 2; the sloths' in slothLife.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fetchBytes } from '../bakedlight.js';
import { setStage, uNight, uTime } from '../camp/stage.js';
import { A0 } from '../camp/layout.js';
import { V, yawTo } from '../camp/util.js';
import { TRIS } from './land.js';
import { camera, me } from './core.js';
import { campReady } from './scoutCamp.js';
import { LIGHT } from './daylight.js';
import { CAST_O, PLACES, blockers, castCam, castMe, syncBack, syncCast } from './castStage.js';
import { ray, toast } from '../camp/hud.js';
import { campGroup, fireLight, flames } from './scoutCamp.js';
import { createAtmosphere } from '../atmosphere.js';
import { SOUP_POT, TENT } from '../camp/layout.js';
import { addStoveGlow } from '../camp/stove.js';
import { cue } from './audio.js';
import { hearCast } from '../camp/audio/castSounds.js';

let opApi = null, opStep = null, jumpTo = null, slothStep = null, slothList = null, lingerStep = null;
// for the shot scripts (main.js hands it to debug.js __scene.life): him, the sloths, an activity now (day.js jumpTo), the day run ahead
// and for the camp's input (player.js hands them to camp/input.js): what you hold from the basket, handing it over, the
// camp's eating, and a boop's sound (slothLife.js)
let hands = null, atmo = null, acts = null, food = null, handOver = null;   // acts: your chores (camp/chores.js); food, handOver: what you hold   // atmo: the camp's fire smoke, sparks, the soup's steam and the tent stove's smoke (../atmosphere.js)
export const lifeHooks = { get op() { return opApi; }, get atmo() { return atmo; }, get sloths() { return slothList; }, jump: (k) => jumpTo(k), origin: () => CAST_O,
  held: () => food?.() ?? null, give: () => handOver?.() ?? null, missed: (h) => { const a = acts?.pick(ray); if (a && (!h || a.distance < h.distance)) { acts.tap(a); return true; } return false; }, eat: (s, mesh, from) => hands?.eat(s, mesh, from),
  sim: (sec) => { for (let t = 0; t < sec; t += 0.05) lifeStep(0.05); return opApi.state(); } };   // his day run ahead
// The cast is imported here, once castStage.js has run, never statically: land.js awaits at its top level, so the browser runs
// every module that doesn't hang off it (the cast's among them) before castStage.js, and the cast reads the stage as it loads.
const cast = () => Promise.all(['../camp/operator/start.js', '../camp/operator/step.js', '../camp/operator/day.js', './opDay.js', './slothLife.js', '../camp/linger.js', '../camp/chores.js'].map((f) => import(f)));
export function buildLife() {
  const load = (f) => fetchBytes(f).then((bin) => new Promise((ok, no) => new GLTFLoader().parse(bin.buffer, '', ok, no)));
  Promise.all([load('models/operator_winter.txt'), load('models/operator_anims.txt'), load('models/sloth.txt'), cast(), campReady]).then(([G, A, SL, [start, step, day, opDay, sl, linger, chores]]) => {
    setStage({ OP_DAY: opDay.OP_DAY_SUMMIT }); opStep = step.opStep; jumpTo = day.jumpTo;
    // the camp's own air round the fire (Adriaen 2026-11-15: "add smoke to the campfire like in the cozy camp"), in the camp's
    // frame like the cast; no butterflies or fireflies in the snow
    atmo = createAtmosphere({ scene: campGroup, camera: castCam, fx: 1, pot: SOUP_POT, chimneys: [TENT.fromLocal(...TENT.chimney)], bugs: false });
    addStoveGlow({ into: campGroup, camera: castCam, fog: false });   // the tent stove's fire, as the camp's (camp/stove.js)
    sl.buildSlothLife(SL); slothStep = sl.slothStep; slothList = sl.camp; hands = sl.hands;   // the sloths first, as in the camp: he finds them in their places
    // he starts by the fire on its woodpile side, looking at it, as in the camp
    const p = V(Math.cos(A0 + 0.9) * 2.6, 0, Math.sin(A0 + 0.9) * 2.6);
    opApi = start.startOperator(G, A, p, yawTo(p.clone().negate()));
    // your chores, the camp's own (camp/chores.js): logs from the cabin's woodpile (or the loose ones by it) onto the fire, the pail under
    // the table, vegetables from the crate, soup in the pot, bowls on the log seats, and fruit from the porch basket
    // the cabin's woodpile (cabin.js: a 0.9 x 1.6 x 3.4 m stack against its west wall, merged into the cabin's draws) gets an
    // invisible stand-in, so the whole stack lights up and takes a tap, with the loose logs by the stump (Adriaen 2026-11-15)
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 3.4), new THREE.MeshBasicMaterial());
    stack.position.copy(PLACES.woodpile.at).setY(0.8); stack.visible = false; stack.userData.standIn = true; stack.name = 'CabinWoodStack'; campGroup.add(stack);
    const basket = sl.basket();
    acts = chores.buildChores({ woodPile: { at: PLACES.woodpile.at, built: true, r: 0.9, look: [stack], picks: [stack] },
      fruit: basket && { at: basket.position, r: 0.3, look: basket.children },
      toast: (text, sound) => { toast(text); if (sound) cue(sound, castMe.pos.clone().add(CAST_O)); }, addBlocker: (at, r) => blockers.push({ at, r, walk: null, wild: false, tag: null }),
      boostFire: (wide, tall, light) => { for (const c of flames) c.scale.set(wide, tall, wide); fireLight.intensity *= light; } });
    setStage({ chores: acts }); food = chores.food; handOver = chores.handOver;   // he cooks and eats with them (operator/cook.js, opDay.js)
    linger.buildLinger(); lingerStep = linger.lingerStep;   // the log seats light up, "Sit by the fire" (camp/linger.js), as in the camp
    let n = 0; opApi.root.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    TRIS.push(['Operator (one draw)', n]);
  }).catch((e) => console.warn('summit life', e));
}

// each frame before you move (main.js, after the jeep's seats, as in the camp): your log seat's claim and the slow drift of the view while you sit (camp/linger.js)
export const seatStep = (dt) => lingerStep?.(dt);

// each frame after the light: the stand-ins follow the camera and you, the night and the clock go to the cast, the sloths' step
// (slothLife.js), his step
export function lifeStep(dt) {
  uTime.value += dt;   // the flames' shader runs on it too (camp/fire.js), before the cast is in
  if (!opApi) return;
  syncCast(); uNight.value = LIGHT.night;
  atmo?.update(dt, uTime.value, LIGHT.night);
  acts.update(dt, uTime.value);   // the chores, after the fire's light (scoutCamp.js campStep): a log on the fire boosts it
  slothStep(dt, uTime.value);
  opStep(dt);
  syncBack();
  opApi.root.visible = Math.hypot(me.x - CAST_O.x - opApi.root.position.x, me.z - CAST_O.z - opApi.root.position.z) < 70;
  hearCast(dt, { sloths: slothList, op: opApi, ear: camera });   // the sloths' squeaks, munching, yawns and waves, and his words, sips, pages and snores: the camp's own (camp/audio/castSounds.js); no footsteps here
}
