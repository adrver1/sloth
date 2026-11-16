// Summit Cabin scout camp behind the cabin, made of the cozy camp's own GLBs (models/fire, camp_picked_lm, lived) in the camp's
// arrangement, toned down (mute) and lit live; plus the lantern string, the flag, the snowman and the firelight.
import * as THREE from 'three';
import { fetchBytes, loadLightMap } from '../bakedlight.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { D, SNOWMAN, TOP, TRIS, W, YT, isPhone, mulberry, sstep, vnoise } from './land.js';
import { canvasTex, hazed, scene } from './core.js';
import { tmpC } from './terrain.js';
import { WHITE, v3 } from './forest.js';
import { bakeStatic } from './cabin.js';
import { ANCHORS, SEATS, fromModel } from '../camp/layout.js';
import { dressFire } from '../camp/fire.js';
import { createLanterns } from '../camp/lanterns.js';
import { glowTex } from '../camp/util.js';
import { flagsStep, pennant, poleMat, scoutPennant } from './flag.js';
import { furnishFromTent, lookoutLamps } from './lookout.js';

// ---------------------------------------------------------------- the scout camp behind the cabin, made of the cozy camp's own props
// The camp's fire ring with tripod and pot, its log seats, wall tent, table, wood stack and kit come straight from its GLBs
// (models/*.txt, base64), in the camp's own arrangement round the fire, lit live here (their vertex colours carry the baked
// shading). Added round them: a string of jar lanterns from the cabin to the tent, a flag, firelight and fire smoke.
// the cozy camp's colours, only a touch cooler in the snow light (they were greyed 40% here, which left the props flat and
// lifeless next to the jungle's: Adriaen 2026-11-16 "bland and boring compared to the jungle")
export const mute = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, 0.92) * vec3(0.97, 0.98, 1.0);'); };
// the camp's baked sky occlusion (models/camp_lm_sun_<k>.png G, on the props' second UVs, the same atlas the camp reads:
// camp/campProps.js) grounds them as it does in the camp: dark under the table and the seats, in the tent, between the logs.
// The sun stays live (its shadows are the summit's own); the occlusion takes most of the sky light and a little of the sun.
const campAO = (sh) => { mute(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', `
  float campAo = texture2D(aoMap, vAoMapUv).g;
  reflectedLight.indirectDiffuse *= 0.22 + 0.78 * campAo;
  reflectedLight.directDiffuse *= 0.6 + 0.4 * smoothstep(0.1, 0.7, campAo);`); };
export const CAMP = { x: 0.5, z: 11.5, turn: 0 }, campGroup = new THREE.Group();
// The chopping stump (lived.glb WoodPile, its stump at local (1.0, 0, 0.15): props/lived/build_lived.py wood_pile) stands by
// the cabin's woodpile, not by the fire (Adriaen 2026-11-15): 0.8 m past the pile's camp-side end (cabin.js: x -(W/2 + 0.55),
// z -1.3 to 2.1), against the west wall. WoodPile's end posts hold the camp's stack, which the summit has not got, so they
// go; its loose logs (LooseLogs, the same frame) lie on along the wall. CHOP: the stump in the camp's frame, and its radius
// with the roots, for castStage.js's blockers; turned a quarter so the pile's local -X (its logs) runs along the wall away from the pile.
const CHOP_YAW = Math.PI / 2;
export const CHOP = { at: new THREE.Vector3(-(W / 2 + 0.75) - CAMP.x, 0, 2.9 - CAMP.z), r: 0.4 };
const CHOP_NODE = CHOP.at.clone().sub(new THREE.Vector3(1.0, 0, 0.15).applyAxisAngle(new THREE.Vector3(0, 1, 0), CHOP_YAW));
const POST = (x, y) => y > 0.04 && Math.abs(x) < 0.66;   // a WoodPile triangle's centre on an end post (at x ±0.53, up to 0.55 m); the stump starts at x 0.73
function dropPosts(node) {
  node.traverse((o) => { if (!o.isMesh || !o.geometry.index) return;
    const p = o.geometry.attributes.position, idx = o.geometry.index, keep = [];
    for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (!POST((p.getX(a) + p.getX(b) + p.getX(c)) / 3, (p.getY(a) + p.getY(b) + p.getY(c)) / 3)) keep.push(a, b, c); }
    o.geometry.setIndex(keep); });
}
// the camp's cast (castStage.js, life.js) measures some props by name: the log seats and their tops, the things on a seat, the
// tent, the table and the kitchen crate (places.js, operator/places.js, sloth/spots.js, sloth/table.js). bakeStatic merges the props into a few draws and takes them away, so
// each of those keeps an invisible stand-in under its name (no draw: never drawn, only measured, ray-tested and lit up by
// camp/highlight.js, userData.standIn), and the drawn
// one is renamed. campReady resolves once all three GLBs are in.
const MEASURED = ['Seat_0', 'Seat_1', 'Seat_2', 'SeatTop_0', 'SeatTop_1', 'SeatTop_2', 'SeatThings', 'Tent', 'Table', 'KitchenCrate', 'KitchenThings', 'LooseLogs', 'Ring', 'Pot'];   // the last three light up for the chores (camp/chores.js)
let campLoaded = null;
export const campReady = new Promise((ok) => { campLoaded = ok; });
export const fireLight = new THREE.PointLight('#ff9a48', 0, 10, 2);   // a pool of warm light round the fire, the night's teal snow beyond it
export const lanternLights = [];   // where each jar lantern hangs, in the world: the sloths take a warm glow from them at night (castStage.js LANTERNS, camp/sloth/body.js)
export const flames = [];   // the flame cards (camp/fire.js dressFire)
export function tris0(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }
// a string of jar lanterns from the cabin's back corner to a pole by the tent, sagging between
const lanterns = new THREE.Group();
let lanternSet = null;   // camp/lanterns.js createLanterns, stepped in campStep
const ropeMat = poleMat;   // the lantern pole and the flag's: flag.js

export function buildScoutCamp() {
  campGroup.position.set(CAMP.x, TOP, CAMP.z);
  campGroup.rotation.y = CAMP.turn;
  scene.add(campGroup);
  fireLight.position.set(0, 0.9, 0);
  campGroup.add(fireLight);
  { const KEEP = { fire: null, camp_picked_lm: ['Seat_0', 'Seat_1', 'Seat_2', 'Table', 'Tent'], lived: ['KitchenCrate', 'KitchenThings', 'LooseLogs', 'MatRoll', 'SeatThings', 'SeatTop_0', 'SeatTop_1', 'SeatTop_2', 'TentSide', 'WoodPile'] };
    const loader = new GLTFLoader(); let tris = 0, loaded = 0;
    const AO = loadLightMap(`models/camp_lm_sun_${isPhone ? 1 : 2}k.png`, { channel: 1, ktx: false }).catch(() => null);   // phones take the 1K map, as in the camp
    for (const [file, keep] of Object.entries(KEEP)) Promise.all([fetchBytes(`models/${file}.txt`), AO]).then(([bin, ao]) => {
      loader.parse(bin.buffer, '', (gl) => {
        if (file === 'camp_picked_lm') fromModel(gl.scene.getObjectByName('Tent')?.userData, gl.scene.getObjectByName('Hammock')?.userData);   // the tent's sizes (its bed) for the cast, as campProps.js does
        // the fire is dressed as the camp dresses it, flames and all (camp/fire.js), with the summit's fog and mute on top
        if (file === 'fire') flames.push(dressFire(gl.scene, { into: campGroup, wrap: (m) => hazed(m, mute, 'mute') }));
        for (const node of [...gl.scene.children]) { if (keep && !keep.includes(node.name)) continue;
          { const k = node.userData.anchor, A = k === 'seats' ? SEATS[node.userData.seat] : ANCHORS[k];   // stood where its anchor says, as the camp's campProps.js stand does
            if (A) { node.position.set(A.at.x, 0, A.at.z); node.rotation.set(0, A.yaw, 0); } }
          if (node.name === 'WoodPile' || node.name === 'LooseLogs') { node.position.copy(CHOP_NODE); node.rotation.set(0, CHOP_YAW, 0); if (node.name === 'WoodPile') dropPosts(node); }
          node.traverse((o) => { if (!o.isMesh) return;
            const m0 = o.material, glow = node.name === 'Embers';
            const lit = ao && o.geometry.attributes.uv1;   // the camp's occlusion where the prop has its light-map UVs
            if (file !== 'fire') o.material = hazed(new THREE.MeshLambertMaterial({ map: m0.map || null, vertexColors: !!o.geometry.attributes.color, side: m0.side, transparent: m0.transparent, alphaTest: m0.alphaTest, aoMap: lit ? ao : null }), lit ? campAO : mute, lit ? 'campAO' : 'mute');
            o.castShadow = !glow; o.receiveShadow = true; tris += tris0(o.geometry); });
          if (node.name === 'Tent' && node.isMesh) TRIS.push(['Fire lookout room: the tent\'s bed and stove (lookout.js furnishFromTent)', furnishFromTent(node)]);
          if (MEASURED.includes(node.name)) { const m = node.clone(true); m.traverse((o) => { o.visible = false; o.userData.standIn = true; }); node.name += '_look'; campGroup.add(m); }
          campGroup.add(node); }
        TRIS.push([`Scout camp: ${file}`, tris]); tris = 0; bakeStatic(campGroup, (o) => flames.includes(o) || o.parent?.name === 'Embers' || o.name === 'Embers');   // the flames (their shader moves them) and the glowing embers stay apart
        if (++loaded === 3) campLoaded();
      });
    }).catch((e) => console.warn('camp props', e));
  }
  scene.add(lanterns);
  { const A = new THREE.Vector3(W / 2 - 0.2, TOP + YT + 0.1, D / 2 + 0.1), B = new THREE.Vector3(CAMP.x - 5.2, TOP + 2.6, CAMP.z + 3.4), pts = [];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.75, 6), ropeMat); pole.position.set(B.x, TOP + 1.35, B.z); pole.castShadow = true; lanterns.add(pole);
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector3().lerpVectors(A, B, t).add(v3.set(0, -0.9 * 4 * t * (1 - t), 0))); }
    // the camp's own lanterns on it (camp/lanterns.js: tin, glass, a candle that lights at dusk, a glow, and the bunting
    // between them for colour by day), seven along this one string, two flags in each gap
    const curve = new THREE.CatmullRomCurve3(pts), on = (t) => curve.getPoint(t), hang = [], flags = [];
    for (let i = 1; i < 8; i++) hang.push(on(i / 8));
    hang.push(...lookoutLamps());   // and the fire lookout's (lookout.js), hung with these so they cost no draws of their own
    for (let k = 0; k < 8; k++) for (const f of [0.33, 0.67]) { const t = (k + f) / 8; flags.push([on(t - 0.006), on(t + 0.006)]); }
    lanternSet = createLanterns({ scene, layout: { strings: [pts], hang, flags }, glowTex: glowTex() });
    lanternLights.push(...lanternSet.lights);
    TRIS.push(['Lantern pole (the string, jars and bunting: camp/lanterns.js)', tris0(pole.geometry)]); bakeStatic(lanterns); }
  // a scout flag on a pole: a green pennant that sways in the wind (flag.js, shared with the lookout's)
  { const g = new THREE.Group(); g.position.set(CAMP.x + 5.5, TOP, CAMP.z + 2.5); scene.add(g);
    TRIS.push(['Flag and pole', pennant({ parent: g, at: new THREE.Vector3(), pole: 5, size: 1.1, tex: scoutPennant(), poleMat: ropeMat })]); }
  // a snowman east of the cabin (land.js SNOWMAN): three lumpy snowballs, coal eyes and buttons, a carrot nose, stick arms, a scout scarf and a bobble hat
  { const g = new THREE.Group(), sx = SNOWMAN.x, sz = SNOWMAN.z; g.position.set(sx, TOP - 0.05, sz); g.rotation.y = Math.atan2(SNOWMAN.face[0] - sx, SNOWMAN.face[1] - sz); scene.add(g);
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
// each frame after fxStep (it reads the wind): the fire's flickering light, the flag turning in the wind
export function campStep(now, night, wind) {
  const fl = 0.8 + 0.2 * Math.sin(now * 13) * Math.sin(now * 7.3 + 1);
  fireLight.intensity = (5 + 6 * night) * fl;   // the flames flicker in their own shader (camp/fire.js)
  lanternSet?.update(now, night);   // the candles light at dusk, as in the camp
  flagsStep(now, wind);   // flag.js: the camp's flag and the lookout's
}
