// Canopy Camp sloths, the body: one sloth from the model, with its fur, its clip and everything the other modules keep on it.
//   hang(p, dir, sc)   makes a sloth hanging under a branch at p, its head toward dir, at size sc, adds it to the scene with
//                      its tap sphere and to state.js's sloths and hit. Draws three numbers from the seeded stream.
//   SLOTH_WARM         the uniforms of the warm glow the sloths take at night from the lanterns and the fire (fur.js warm)
//   warmStep(lanternGlow, fl, dusk)   sets them each frame (main.js)
// review 2026-11-12 (P5, B4): Lambert body and fur like the camp; a fixed padded bounding sphere so off-screen sloths are
// culled; an 8x6 tap sphere.
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { WARM_N, furify } from "../../fur.js";
import { D, OPT, R, S, scene } from "../core.js";
import { V } from "../util.js";
import { SLOTH } from "../campProps.js";
import { SL, hit, sloths } from "./state.js";
import { eyeKit } from "./face.js";

const BR = { y: 0.10 * SL, z: 0.10 * SL };
let tinted = false;
// at night the camp's light is baked into the props, so the sloths take a warm glow from the lanterns and the fire nearby
// (fur.js warm; warmStep sets it each frame: lantern positions, the fire, and uWarm = dusk with the fire's flicker)
const SLOTH_WARM = { uWarm: { value: 0 }, uWarmPos: { value: Array.from({ length: WARM_N }, () => V(0, -99, 0)) }, uWarmK: { value: new Array(WARM_N).fill(0) } };
function warmStep(lanternGlow, fl, dusk) {             // each frame (main.js): where the lanterns are, the fire's flicker fl, how far the night is in
  const W = SLOTH_WARM, n = Math.min(lanternGlow.length, WARM_N - 1);
  for (let i = 0; i < n; i++) { W.uWarmPos.value[i].copy(lanternGlow[i]); W.uWarmK.value[i] = 0.15; }
  W.uWarmPos.value[WARM_N - 1].set(0, 0.6, 0); W.uWarmK.value[WARM_N - 1] = 0.9 * fl; W.uWarm.value = dusk;
}
function hang(p, dir, sc = SL) {                      // a sloth under a branch at p, its head toward dir
  const o = clone(SLOTH.scene); o.scale.setScalar(sc);
  furify(o, { shells: D.shells, lambert: OPT.slothmat !== "old", warm: SLOTH_WARM });   // ?slothmat=old: the GLB's physical material, as before
  o.traverse((m) => { if (m.isSkinnedMesh && !m.userData.fur) { m.geometry.computeBoundingSphere(); m.boundingSphere = m.geometry.boundingSphere.clone(); m.boundingSphere.radius *= 2; } });
  o.traverse((m) => { if (m.userData.fur) { const b = m.parent.children.find((q) => q.isSkinnedMesh && !q.userData.fur); m.boundingSphere = b.boundingSphere.clone(); m.frustumCulled = true; } });
  if (!tinted) { o.traverse((m) => m.isMesh && m.material.color?.setHex(S.slothTint)); tinted = true; }
  const mixer = new THREE.AnimationMixer(o), act = mixer.clipAction(SLOTH.animations.find((a) => a.name === "cling"));
  act.play(); act.time = R(0, 4); act.timeScale = 0.6;   // (kept as s.act)
  const yl = dir.clone().setY(dir.y * 0.5).normalize(), zl = V(0, -1, 0).addScaledVector(yl, yl.y).normalize(), xl = V().crossVectors(yl, zl);
  const rot = new THREE.Matrix4().makeBasis(xl, yl, zl);
  o.quaternion.setFromRotationMatrix(rot); o.position.copy(p).sub(V(0, BR.z * sc / SL, -BR.y * sc / SL).applyMatrix4(rot)); scene.add(o);
  const box = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); box.position.copy(p).add(V(0, -0.25, 0)); scene.add(box);
  const s = { o, mixer, box, p, sc, head: o.getObjectByName("head"), squish: 0, nod: 0, friend: false, shells: o.userData.furShells || [], eyes: eyeKit(o), blink: R(1, 6), look: 0, act, napT: R(4, 40), droop: 0, yawn: 0,
    arm: [o.getObjectByName("upper_armR") || o.getObjectByName("upper_arm.R"), o.getObjectByName("forearmR") || o.getObjectByName("forearm.R")],
    armL: [o.getObjectByName("upper_armL") || o.getObjectByName("upper_arm.L"), o.getObjectByName("forearmL") || o.getObjectByName("forearm.L")], gaze: 0, waveCD: 0, wave: 0 };
  s.lit = []; o.traverse((m) => { if (m.isSkinnedMesh && !m.userData.fur && !s.lit.length) s.lit.push(m); });   // what lights up when a tap would boop it (camp/highlight.js)
  box.userData.s = s; sloths.push(s); hit.push(box);
}

export { SLOTH_WARM, hang, warmStep };
