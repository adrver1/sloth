// Summit Cabin scout camp behind the cabin, made of the cozy camp's own GLBs (models/fire, camp_picked_lm, lived) in the camp's
// arrangement, toned down (mute) and lit live; plus the lantern string, the flag, the snowman and the firelight.
import * as THREE from 'three';
import { fetchBytes } from '../bakedlight.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { D, TOP, TRIS, W, YT, mulberry, sstep, vnoise } from './land.js';
import { canvasTex, hazed, scene } from './core.js';
import { tmpC } from './terrain.js';
import { WHITE, v3 } from './forest.js';
import { bakeStatic } from './cabin.js';

// ---------------------------------------------------------------- the scout camp behind the cabin, made of the cozy camp's own props
// The camp's fire ring with tripod and pot, its log seats, wall tent, table, wood stack and kit come straight from its GLBs
// (models/*.txt, base64), in the camp's own arrangement round the fire, lit live here (their vertex colours carry the baked
// shading). Added round them: a string of jar lanterns from the cabin to the tent, a flag, firelight and fire smoke.
export let flag;
export const mute = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, 0.6) * vec3(0.9, 0.92, 0.95);'); };   // the cozy camp's colours, toned down
export const CAMP = { x: 0.5, z: 11.5, turn: 0 }, campGroup = new THREE.Group();
// the camp's cast (castStage.js, life.js) measures some props by name: the log seats and their tops, the things on a seat, the
// tent (places.js, operator/places.js, sloth/spots.js). bakeStatic merges the props into a few draws and takes them away, so
// each of those keeps an invisible stand-in under its name (no draw: never drawn, only measured and ray-tested), and the drawn
// one is renamed. campReady resolves once all three GLBs are in.
const MEASURED = ['Seat_0', 'Seat_1', 'Seat_2', 'SeatTop_0', 'SeatTop_1', 'SeatTop_2', 'SeatThings', 'Tent'];
let campLoaded = null;
export const campReady = new Promise((ok) => { campLoaded = ok; });
export const fireLight = new THREE.PointLight('#ff9a48', 0, 14, 1.5);
export const flames = [];
export function tris0(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }
// a string of jar lanterns from the cabin's back corner to a pole by the tent, sagging between
const lanterns = new THREE.Group();
const jarMat = new THREE.MeshLambertMaterial({ color: '#ffd9a0', emissive: '#ffb04a', emissiveIntensity: 0.6 }), ropeMat = hazed(new THREE.MeshLambertMaterial({ color: '#4a3a2c' }));

export function buildScoutCamp() {
  campGroup.position.set(CAMP.x, TOP, CAMP.z);
  campGroup.rotation.y = CAMP.turn;
  scene.add(campGroup);
  fireLight.position.set(0, 0.9, 0);
  campGroup.add(fireLight);
  { const KEEP = { fire: null, camp_picked_lm: ['Seat_0', 'Seat_1', 'Seat_2', 'Table', 'Tent'], lived: ['KitchenCrate', 'KitchenThings', 'LooseLogs', 'MatRoll', 'SeatThings', 'SeatTop_0', 'SeatTop_1', 'SeatTop_2', 'TentSide', 'WoodPile'] };
    const loader = new GLTFLoader(); let tris = 0, loaded = 0;
    for (const [file, keep] of Object.entries(KEEP)) fetchBytes(`models/${file}.txt`).then((bin) => {
      loader.parse(bin.buffer, '', (gl) => {
        for (const node of [...gl.scene.children]) { if (keep && !keep.includes(node.name)) continue;
          node.traverse((o) => { if (!o.isMesh) return;
            const m0 = o.material, flame = node.name === 'Fire' || node.name === 'Embers';
            o.material = flame ? new THREE.MeshBasicMaterial({ color: node.name === 'Fire' ? '#ffb15a' : '#ff6a2a', vertexColors: !!o.geometry.attributes.color, transparent: node.name === 'Fire', opacity: 0.9, depthWrite: node.name !== 'Fire' })
              : hazed(new THREE.MeshLambertMaterial({ map: m0.map || null, vertexColors: !!o.geometry.attributes.color, side: m0.side, transparent: m0.transparent, alphaTest: m0.alphaTest }), mute, 'mute');
            o.castShadow = !flame; o.receiveShadow = true; tris += tris0(o.geometry); if (node.name === 'Fire') flames.push(o); });
          if (MEASURED.includes(node.name)) { const m = node.clone(true); m.traverse((o) => { o.visible = false; }); node.name += '_look'; campGroup.add(m); }
          campGroup.add(node); }
        TRIS.push([`Scout camp: ${file}`, tris]); tris = 0; bakeStatic(campGroup, (o) => flames.includes(o) || o.parent?.name === 'Embers' || o.name === 'Embers');
        if (++loaded === 3) campLoaded();
      });
    }).catch((e) => console.warn('camp props', e));
  }
  scene.add(lanterns);
  { const A = new THREE.Vector3(W / 2 - 0.2, TOP + YT + 0.1, D / 2 + 0.1), B = new THREE.Vector3(CAMP.x - 5.2, TOP + 2.6, CAMP.z + 3.4), pts = [];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.75, 6), ropeMat); pole.position.set(B.x, TOP + 1.35, B.z); pole.castShadow = true; lanterns.add(pole);
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector3().lerpVectors(A, B, t).add(v3.set(0, -0.9 * 4 * t * (1 - t), 0))); }
    const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 4), ropeMat); lanterns.add(rope);
    const jarGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.16, 7);
    for (let i = 1; i < 8; i++) { const p = pts[i * 2]; const j = new THREE.Mesh(jarGeo, jarMat); j.position.set(p.x, p.y - 0.14, p.z); lanterns.add(j); }
    TRIS.push(['Lantern string, pole and 7 jars', tris0(rope.geometry) + tris0(pole.geometry) + 7 * tris0(jarGeo)]); bakeStatic(lanterns); }
  // a scout flag on a pole: a green pennant that sways in the wind
  flag = (() => { const g = new THREE.Group(); g.position.set(CAMP.x + 5.5, TOP, CAMP.z + 2.5); scene.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 5, 6), ropeMat); pole.position.y = 2.5; pole.castShadow = true; g.add(pole);
    const tex = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#2f6a3c'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h / 2); c.lineTo(0, h); c.fill(); c.fillStyle = '#f2d27a'; c.beginPath(); c.moveTo(18, 14); c.lineTo(34, 32); c.lineTo(18, 50); c.lineTo(26, 32); c.fill(); });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55, 6, 1).translate(0.55, 0, 0), hazed(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide })));
    cloth.position.y = 4.65; g.add(cloth); TRIS.push(['Flag and pole', tris0(pole.geometry) + tris0(cloth.geometry)]); return cloth; })();
  // a snowman by the fire: three lumpy snowballs, coal eyes and buttons, a carrot nose, stick arms, a scout scarf and a bobble hat
  { const g = new THREE.Group(), sx = CAMP.x - 3.3, sz = CAMP.z - 0.6; g.position.set(sx, TOP - 0.05, sz); g.rotation.y = Math.atan2(CAMP.x + 1.2 - sx, CAMP.z - 5.2 - sz); scene.add(g);
    const snowM = hazed(new THREE.MeshLambertMaterial({ color: '#fbf7f0', vertexColors: true })), coalM = hazed(new THREE.MeshLambertMaterial({ color: '#22201f' })), carrotM = hazed(new THREE.MeshLambertMaterial({ color: '#e8742a' }));
    const stickM = hazed(new THREE.MeshLambertMaterial({ color: '#5a3c26' })), scarfM = hazed(new THREE.MeshLambertMaterial({ color: '#2f6a3c' })), hatM = hazed(new THREE.MeshLambertMaterial({ color: '#c8452f' }));
    let n = 0; const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = o.receiveShadow = true; g.add(o); n += tris0(geo); return o; };
    const ball = (r, seed) => { const geo = new THREE.SphereGeometry(r, 10, 7), p = geo.attributes.position, rr = mulberry(seed), C = [];   // lumpy, lavender-shaded underneath
      for (let i = 0; i < p.count; i++) { const k = 1 + (vnoise(p.getX(i) * 5 + seed, p.getZ(i) * 5 + p.getY(i) * 3) - 0.5) * 0.12; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.94, p.getZ(i) * k); const t = p.getY(i) / r * 0.5 + 0.5; tmpC.set('#c9c2dc').lerp(WHITE, sstep(0.05, 0.6, t)); C.push(tmpC.r, tmpC.g, tmpC.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.computeVertexNormals(); return geo; };
    add(ball(0.55, 3), snowM, 0, 0.48, 0); add(ball(0.4, 7), snowM, 0, 1.18, 0); add(ball(0.29, 11), snowM, 0, 1.68, 0);
    const coal = new THREE.OctahedronGeometry(0.035, 0);
    add(coal, coalM, -0.1, 1.76, 0.25); add(coal, coalM, 0.1, 1.76, 0.25); for (const y of [1.3, 1.16, 1.02]) add(coal, coalM, 0, y, 0.38 - Math.abs(y - 1.16) * 0.35);
    for (let i = 0; i < 5; i++) { const a = -0.55 + i * 0.27; add(new THREE.OctahedronGeometry(0.02, 0), coalM, Math.sin(a) * 0.2, 1.6 - Math.cos(a * 1.2) * 0.04 - 0.02, Math.cos(a) * 0.24); }   // a smile
    add(new THREE.ConeGeometry(0.04, 0.26, 6).rotateX(Math.PI / 2).translate(0, 0, 0.13), carrotM, 0, 1.68, 0.26, 0.08, 0, 0);
    const arm = new THREE.CylinderGeometry(0.014, 0.022, 0.75, 4).translate(0, 0.375, 0), twig = new THREE.CylinderGeometry(0.008, 0.012, 0.2, 3).translate(0, 0.1, 0);
    for (const sd of [-1, 1]) { const a = add(arm, stickM, sd * 0.34, 1.25, 0, 0, 0, -sd * 1.05); add(twig, stickM, sd * 0.85, 1.6, 0, 0, 0, -sd * 0.4); a.rotation.y = sd * 0.25; }
    add(new THREE.TorusGeometry(0.27, 0.06, 4, 10).rotateX(Math.PI / 2), scarfM, 0, 1.44, 0); add(new THREE.BoxGeometry(0.11, 0.34, 0.03), scarfM, 0.14, 1.28, 0.33, 0.15, 0, 0.12);
    add(new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, 1.86, 0, -0.12, 0, 0.1); add(new THREE.TorusGeometry(0.21, 0.04, 4, 10).rotateX(Math.PI / 2), snowM, 0, 1.87, 0, -0.12, 0, 0.1); add(new THREE.IcosahedronGeometry(0.06, 0), snowM, 0.02, 2.09, -0.02);
    TRIS.push(['Snowman', n]); bakeStatic(g); }
}
// each frame after fxStep (it reads the wind): the fire's flickering light and flames, the flag turning in the wind
export function campStep(now, night, wind) {
  const fl = 0.8 + 0.2 * Math.sin(now * 13) * Math.sin(now * 7.3 + 1);
  fireLight.intensity = (5 + 8 * night) * fl; for (const f of flames) f.scale.set(1, 0.85 + 0.25 * fl, 1);
  flag.rotation.y = -Math.atan2(wind.z, wind.x) + Math.sin(now * 3.1) * 0.25; flag.scale.y = 1 - 0.1 * Math.abs(Math.sin(now * 5));
}
