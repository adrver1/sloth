// Summit Cabin operator (Adriaen 2026-11-15, plan step 4, "spots now, routines later" as for the sloths): the bearded operator
// comes in the jeep too. For now he has one spot, his end of the middle log seat by the fire (camp/layout.js SEAT_SLOT.op, as in
// the camp), sitting with the camp's seated clip, sipping from his mug now and then, and waving when you come up to the fire.
// His camp activities (firewood, the pot, the porch with a sloth) come with the routines follow-up.
// The model and clips are the camp's (models/operator.txt, operator_anims.txt), with the camp's kit look (camp/actor.js kitLook:
// a crisp texture, flat-shaded Lambert), copied here because camp/actor.js pulls in the camp's core.
// Exports buildOperator() (main.js, once: starts the downloads) and operatorStep(dt) (main.js, each frame after the sloths).
// Triangles: his mesh (camp_cargo outfit, 1,082), one draw; he casts the sun's shadow like the sloths.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fetchBytes } from '../bakedlight.js';
import { SEATS, SEAT_SLOT } from '../camp/layout.js';
import { TOP, TRIS } from './land.js';
import { me, scene } from './core.js';
import { CAMP } from './scoutCamp.js';
import { cue } from './audio.js';

let op = null;

function kitLook(obj) {
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const map = m.material.map; if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter; }
    m.material = new THREE.MeshLambertMaterial({ map, flatShading: true }); m.frustumCulled = false; m.castShadow = true;
  });
  return obj;
}
function play(name, { once = false, fade = 0.4 } = {}) {
  const a = op.clips[name]; if (!a || a === op.cur) return;
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once; a.play();
  if (op.cur) op.cur.crossFadeTo(a, fade, false);
  op.cur = a;
}

export function buildOperator() {
  const load = (f) => fetchBytes(f).then((bin) => new Promise((ok, no) => new GLTFLoader().parse(bin.buffer, '', ok, no)));
  Promise.all([load('models/operator.txt'), load('models/operator_anims.txt')]).then(([G, A]) => {
    // his end of the middle log, across the fire from where you come in (Bandit sits in its middle), facing the fire
    const s = SEATS[1], along = new THREE.Vector3(Math.sin(s.angle), 0, -Math.cos(s.angle)), seat = s.at.clone().addScaledVector(along, SEAT_SLOT.op + 0.12);
    const root = kitLook(G.scene); root.position.set(CAMP.x + seat.x, TOP, CAMP.z + seat.z);   // seated, the clips keep his root under his hips (camp/operator/walk.js) root.rotation.y = Math.atan2(seat.x, seat.z);
    scene.add(root);
    const mixer = new THREE.AnimationMixer(root), clips = {};
    for (const a of A.animations) clips[a.name] = mixer.clipAction(a);
    op = { root, mixer, clips, cur: null, t: 6, waved: false };
    play('seated_idle'); mixer.addEventListener('finished', () => play('seated_idle'));
    let n = 0; root.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    TRIS.push(['Operator (one draw)', n]);
  }).catch((e) => console.warn('operator', e));
}

// each frame: a sip every 12 to 20 s, and a wave the first time you come within 4 m of him (again once you have gone 10 m off)
export function operatorStep(dt) {
  if (!op) return;
  const d = Math.hypot(me.x - op.root.position.x, me.z - op.root.position.z);
  op.root.visible = d < 70; if (!op.root.visible) return;
  op.t -= dt;
  if (op.cur === op.clips.seated_idle) {
    if (!op.waved && d < 4) { op.waved = true; play('wave', { once: true }); }
    else if (op.t < 0) { op.t = 12 + Math.random() * 8; play('sip', { once: true }); setTimeout(() => cue('slurp', op.root.position.clone().setY(op.root.position.y + 1.2)), 900); }
  }
  if (d > 10) op.waved = false;
  op.mixer.update(dt);
}
