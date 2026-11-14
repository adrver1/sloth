// Canopy Camp operator, the model: the bearded operator's skinned mesh (1,034 triangles, Lambert, faceted) under a root
// group, his clips on one mixer, and a soft round shadow under him (2 triangles: the props' shadows are baked, and he moves).
// Nothing is built when this module loads: operator.js calls buildModel first, so objects are made in a fixed order.
// Exports root, body, mixer, cur (the clip playing now), B (his bones by name), clips (his clip actions by name),
// buildModel(gltf, anims), play(name, fade, { once, at, speed }), cs and csDir (his own frame to the world), reach and
// turnHand (ik.js on his bones) and UP.
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { scene } from "../core.js";
import { V, canvasTex } from "../util.js";
import * as ik from "./ik.js";

const UP = V(0, 1, 0);
let root = null, body = null, mixer = null, cur = null;
const B = {}, clips = {};

// gltf and anims: the two downloads (core.js PRE.operator, PRE.operatorAnims), or null with ?op=0, when only the root is made
function buildModel(gltf, anims) {
  root = new THREE.Group();
  if (!gltf) return;
  body = clone(gltf.scene); root.add(body); scene.add(root);
  body.traverse((m) => {
    if (m.isBone) B[m.name] = m;
    if (m.isMesh) {
      const map = m.material.map; if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter; }
      m.material = new THREE.MeshLambertMaterial({ map, flatShading: true }); m.frustumCulled = false;
    }
  });
  mixer = new THREE.AnimationMixer(body);
  for (const a of anims.animations) clips[a.name] = mixer.clipAction(a);
  for (const n of ["blink", "happy"]) { const a = clips[n]; a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
  // a soft round shadow under him (2 triangles): the props' shadows are baked, and he moves
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.45,
    map: canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "rgba(30,24,16,1)"); r.addColorStop(0.55, "rgba(30,24,16,.5)"); r.addColorStop(1, "rgba(30,24,16,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }, { srgb: false, aniso: 1 }) }));
  shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1; scene.add(shadow); root.userData.shadow = shadow;
}
function play(name, fade = 0.35, { once = false, at = 0, speed = 1 } = {}) {
  const a = clips[name]; if (!a) return null;
  if (cur === a) { a.timeScale = speed; return a; }
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.time = at; a.timeScale = speed; a.enabled = true; a.setEffectiveWeight(1); a.play();
  if (cur) cur.crossFadeTo(a, fade, false); cur = a; return a;
}
// character space (x his left-right, y up, z: -1 ahead, +1 behind) to world, for the pose he is in now
const cs = (x, y, z) => V(x, y, z).applyMatrix4(root.matrixWorld);
const csDir = (x, y, z) => V(x, y, z).transformDirection(root.matrixWorld);
// his own arms and hands (ik.js works on any bone map)
const reach = (side, target, pole, w) => ik.reach(B, side, target, pole, w);
const turnHand = (side, q, w) => ik.turnHand(B, side, q, w);

export { B, UP, body, buildModel, clips, cs, csDir, cur, mixer, play, reach, root, turnHand };
