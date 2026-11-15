// Summit Cabin sloths (Adriaen 2026-11-15: all seven named sloths come in the jeep; first PR "spots now, routines later"): each
// of the camp's seven (camp/cast.js, dressed as in the camp, plus winter.js's hat and scarf) has its spot at the summit and
// stays there, playing the camp's clip for that kind of spot, and dozing off after dark:
//   Sunny, Bandit, Figgy   on the scout camp's three log seats, facing the fire (clip reach, as the camp's seat sloth; curl at night)
//   Hibi                   napping on a sheepskin by the fire (nap)
//   Mango                  on the porch bench by the cabin door, looking out over the valley (reach; curl at night)
//   Pip                    standing by the snowman (idle; curl at night)
//   Hazel                  peeking out of the tent doorway (peek)
// A tap on a sloth boops it (it squishes and springs back). Out in the cold each one breathes little frosty puffs (one
// instanced draw for all of them, fx.js plume). The camp frame (layout.js, the fire at the origin) sits at scoutCamp.js CAMP.
// Exports buildSloths() (main.js, once: starts the model's download; the sloths appear when it is in) and slothsStep(dt, bright)
// (main.js, each frame after the light). Triangles: the sloth 826 + fur shells (4, 3 on a phone) + its trait + winter gear 96.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { fetchBytes } from '../bakedlight.js';
import { furify } from '../fur.js';
import { CAST } from '../camp/cast.js';
import { SEATS, SEAT_SLOT, SEAT_GAPS, TENT } from '../camp/layout.js';
import { D, TOP, TRIS, YB, isPhone } from './land.js';
import { camera, canvasTex, hazed, renderer, scene } from './core.js';
import { CAMP } from './scoutCamp.js';
import { plume } from './fx.js';
import { LIGHT } from './daylight.js';
import { winterGear } from './winter.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const inCamp = (x, y, z) => V(CAMP.x + x, TOP + y, CAMP.z + z);   // a point in the camp's frame (fire at the origin), in the world
const sloths = [];
let breath = null;
const tmp = V(), fwd = V(), puffAt = V(), up = V(0, 1, 0);

// where each one is: position, yaw (a sloth faces its own -Z), clip by day and by night, and its size (times its cast scale)
function spots() {
  const seat = (i, slot) => { const a = SEATS[i].angle, p = V(SEATS[i].at.x, 0.33, SEATS[i].at.z).addScaledVector(V(Math.sin(a), 0, -Math.cos(a)), slot);
    return { at: inCamp(p.x, p.y, p.z), yaw: Math.atan2(p.x, p.z), clip: 'reach', doze: 'curl', scale: 1.9 }; };
  const rugA = SEAT_GAPS[2], rug = V(Math.cos(rugA) * 1.75, 0.03, Math.sin(rugA) * 1.75);
  const tent = new THREE.Object3D(); tent.position.set(TENT.at.x, 0, TENT.at.z); tent.rotation.y = TENT.yaw; tent.updateMatrixWorld(true);
  const door = tent.localToWorld(V(0, 0.04, 0.9));
  const sx = CAMP.x - 3.3, sz = CAMP.z - 0.6;   // the snowman (scoutCamp.js)
  return {
    Sunny: seat(0, SEAT_SLOT.sunny), Bandit: seat(1, 0), Figgy: seat(2, 0),
    Hibi: { at: inCamp(rug.x, rug.y, rug.z), yaw: rugA, clip: 'nap', doze: 'nap', scale: 2.2, rug },
    Mango: { at: V(-2.7, TOP + YB + 0.445, -(D / 2 + 0.45)), yaw: 0, clip: 'reach', doze: 'curl', scale: 1.9 },
    Pip: { at: V(sx - 0.75, TOP, sz - 0.2), yaw: Math.atan2(sx - 0.75 - CAMP.x, sz - 0.2 - CAMP.z), clip: 'idle', doze: 'curl', scale: 2.2 },
    Hazel: { at: inCamp(door.x, door.y, door.z), yaw: TENT.yaw + Math.PI, clip: 'peek', doze: 'peek', scale: 1.9 },
  };
}

function sheepskin(at) {   // Hibi's rug: a soft cream oval painted on one quad (2 triangles)
  const tex = canvasTex(128, 96, (g, w, h) => {
    g.fillStyle = '#efe6d6'; g.beginPath(); for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, r = 1 + 0.07 * Math.sin(i * 2.7) + 0.05 * Math.sin(i * 5.1);
      g.lineTo(w / 2 + Math.cos(a) * w * 0.46 * r, h / 2 + Math.sin(a) * h * 0.44 * r); } g.closePath(); g.fill();
    g.strokeStyle = 'rgba(160,140,115,.35)'; g.lineWidth = 2; for (let i = 0; i < 70; i++) { const x = w * (0.15 + 0.7 * ((i * 37) % 70) / 70), y = h * (0.18 + 0.64 * ((i * 53) % 70) / 70);
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 1.3); g.stroke(); } });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8).rotateX(-Math.PI / 2), hazed(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3 })));
  m.position.copy(at).setY(TOP + 0.02); m.receiveShadow = true; scene.add(m); return m;
}

function make(G, c, s) {
  const o = clone(G.scene);
  o.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.material = m.material.clone(); if (c.tint) m.material.color.setHex(c.tint); } });
  furify(o, { shells: isPhone ? 3 : 4, lambert: true, smooth: true });
  o.scale.setScalar(s.scale * (c.scale || 1)); o.position.copy(s.at); o.rotation.y = s.yaw;
  const head = o.getObjectByName('head'); c.dress?.(head, o);
  const gear = winterGear(c.name, head);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
  const mixer = new THREE.AnimationMixer(o), clip = (n) => G.animations.find((a) => a.name === n);
  const day = mixer.clipAction(clip(s.clip)), night = s.doze !== s.clip ? mixer.clipAction(clip(s.doze)) : null;
  day.play(); mixer.setTime(sloths.length * 0.9);
  scene.add(o);
  let tris = 0; o.traverse((m) => { if (m.isMesh && m.visible) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  return { name: c.name, o, head, mixer, day, night, asleep: false, base: o.scale.x, squish: 0, ph: sloths.length * 0.47, tris, gear };
}

export function buildSloths() {
  const S = spots();
  if (S.Hibi.rug) sheepskin(S.Hibi.at);
  breath = plume(CAST.length * 2); breath.mat.uniforms.uBright.value = 1; scene.add(breath.mesh);
  fetchBytes('models/sloth.txt').then((bin) => new GLTFLoader().parse(bin.buffer, '', (G) => {
    for (const c of CAST) if (S[c.name]) sloths.push(make(G, c, S[c.name]));
    const n = sloths.reduce((a, s) => a + s.tris, 0);
    TRIS.push([`Sloths (${sloths.length}, fur and winter gear ${sloths[0]?.gear} each)`, n], ['Sheepskin (painted)', 2], ['Frosty breath (one draw)', CAST.length * 4]);
    console.info(`summit sloths: ${sloths.map((s) => `${s.name} ${s.tris}`).join(', ')}`);
  })).catch((e) => console.warn('sloths', e));
  // a tap (a press that hardly moves) on a sloth boops it
  const cv = renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), sph = new THREE.Sphere(); let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return; down = null;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    let best = null, bd = 6;   // within reach
    for (const s of sloths) { sph.set(tmp.copy(s.o.position).addScaledVector(up, 0.12 * s.base), 0.16 * s.base); const hit = ray.ray.intersectSphere(sph, puffAt);
      if (hit) { const d = hit.distanceTo(camera.position); if (d < bd) { bd = d; best = s; } } }
    if (best) best.squish = 1;
  });
}

// each frame after the light: clips, dozing off after dark and waking at dawn, the boop's squish, and the frosty breath
export function slothsStep(dt, now) {
  if (!breath) return;
  const sleepy = LIGHT.night > 0.6;
  for (const [i, s] of sloths.entries()) {
    const far = s.o.position.distanceToSquared(camera.position) > 70 * 70; s.o.visible = !far;
    if (s.night && sleepy !== s.asleep) { s.asleep = sleepy; const [from, to] = sleepy ? [s.day, s.night] : [s.night, s.day]; to.reset().play(); from.crossFadeTo(to, 1.5, false); }
    if (!far) s.mixer.update(dt);
    if (s.squish > 0) { s.squish = Math.max(0, s.squish - dt * 1.6); const k = Math.sin(s.squish * Math.PI * 3) * s.squish * 0.14; s.o.scale.set(s.base * (1 + k * 0.5), s.base * (1 - k), s.base * (1 + k * 0.5)); }
    // two puffs each, a breath every 3.2 s: out from the mouth, rising and spreading as it fades
    s.head.getWorldPosition(tmp); fwd.set(-Math.sin(s.o.rotation.y), 0, -Math.cos(s.o.rotation.y));
    for (let k = 0; k < 2; k++) {
      const t = ((now + s.ph) / 3.2 + k * 0.12) % 1, life = t / 0.45, j = i * 2 + k;
      if (far || life > 1) { breath.set(j, tmp, 0, 0); continue; }
      const p = puffAt.copy(tmp).addScaledVector(fwd, (0.08 + 0.25 * life) * s.base / 2).addScaledVector(up, (0.02 + 0.12 * life) * s.base / 2);
      breath.set(j, p, (0.05 + 0.2 * life) * s.base / 2, 0.32 * Math.sin(Math.PI * life) * (0.4 + 0.6 * (1 - LIGHT.storm)));
    }
  }
  breath.mat.uniforms.uBright.value = 0.5 + 0.5 * LIGHT.bright; breath.done();
}
