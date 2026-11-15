// Canopy Camp characters: the one layer the sloths (camp/sloth/) and the operator (camp/operator/) share for their clips,
// walking, steering, turning, the gaze before a wave, the sleep Zs and eating (reviews operator-09, R2-212). Stateless
// functions over the object and the numbers they are handed: each character keeps its own state machine and its own
// constants (the sloths turn by a share of the gap, the operator at a capped rate; 0.22 or 0.24 of the food a bite).
// Nothing runs on import, no scene object is made and no random number is drawn (ringPoint draws from the stream it is given).
// Looks of the kit characters
//   kitLook(obj)                gives every mesh under obj (a clone of a kit character's scene: the operator, or the
//                               ponytail engineer in the karaoke cut scene) the camp's kit look: its texture sampled
//                               nearest (crisp pixels), a flat-shaded Lambert material, and no frustum culling (the
//                               skinned bounds lag the pose); returns obj
// Clips
//   crossFade(cur, next, fade, { once, at, speed, reps, restart, weigh })   starts clip action `next` `at` seconds in at
//                               `speed`, looping or played once and held on its last frame, and cross-fades the playing
//                               action `cur` into it over `fade` s; returns next. If next is the one playing, only its speed
//                               changes, unless it is played once and restart is set. Where the two characters differ:
//                               reps, the repetitions a once clip is given (the sloths 1, the operator three.js's default);
//                               restart (the sloths start a once clip over, the operator leaves it running); weigh (the
//                               operator also enables the clip and sets its weight to 1 before it plays)
// Turning and walking (a yaw faces -Z turned about +Y, as util.js yawTo gives it)
//   turnYaw(h, key, want, share = 1, cap = Infinity)   turns the yaw h[key] toward `want` the short way round, by the
//                               share `share` of the gap (the sloths: their trip's T.yaw) and at most `cap` radians (the
//                               operator: his root.rotation.y at a rate times dt); returns how far off it was
//   stepAlong(pos, yaw, dist)   moves pos dist metres the way the yaw faces, on the ground plane; returns pos
//   ahead(pos, dir, p, range)   another walker at p seen from pos walking along the unit vector dir: null beyond range,
//                               else { d, x, z, ahead } (its distance, the offset to it and how far ahead it is, the cosine
//                               of its angle off dir), one object reused for every call. Each character steers round it
//                               its own way (the operator bends his heading, the sloths step aside on their grid)
//   ringPoint(R, r0, r1, ok, tries)   a point on the ground r0..r1 m from the fire, in a random direction, that ok(p)
//                               accepts, drawn from the caller's stream R (one angle then one radius a try); null after tries
// Looks and life
//   aimBone(bone, dir, w = 1)   turns a bone (it points along its own +Y) toward the world direction dir, by the weight w
//   watched(p, dir, maxD)       you are looking right at the point p: it is within maxD m of the camera, ahead of it, and
//                               within 0.5 m plus 4 % of its distance of the line of sight (dir, the camera's view direction)
//   gazeStep(g, on, dt, fade)   a gaze timer: up by dt while on, else down by fade a second (to 0), or back to 0 at once
//                               without a fade; a character waves once it has run long enough
//   makeZ()                     a z sprite (fx.js), drawn over the scene's depth like the others but hidden behind things, added to the scene
//   zAt(z, head, k, Z, f = 1)   a z rising off a sleeper, k (0..1) of the way up: over the head bone when one is given,
//                               swaying as it rises, and growing. Z: { wob, y0, rise, w0, w1 }, the character's own numbers;
//                               f scales it (the small sloths). Its opacity and how fast k runs stay with the character.
//   bite(mesh, n, per, min = 0.1)   food n bites smaller: its scale is its userData.base (or 1) times 1 - per x n, at least min
import * as THREE from "three";
import { camera, scene, toStage } from "./stage.js";
import { V, wrapPi } from "./util.js";
import { sprite } from "./fx.js";

const Y = V(0, 1, 0);                                  // a bone points along its own +Y
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), vb = V(), vw = V(), vr = V();
export function aimBone(b, dir, w = 1) {
  const bq = b.getWorldQuaternion(qa), y = vb.copy(Y).applyQuaternion(bq);
  qb.setFromUnitVectors(y, dir).slerp(qc.identity(), 1 - w).multiply(bq);
  b.quaternion.copy(b.parent.getWorldQuaternion(qc).invert().multiply(qb));
}

export function kitLook(obj) {
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const map = m.material.map; if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter; }
    m.material = new THREE.MeshLambertMaterial({ map, flatShading: true }); m.frustumCulled = false;
  });
  return obj;
}

export function crossFade(cur, next, fade, { once = false, at = 0, speed = 1, reps = Infinity, restart = false, weigh = false } = {}) {
  if (cur === next && !(once && restart)) { next.timeScale = speed; return next; }
  next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? reps : Infinity); next.clampWhenFinished = once;
  next.time = at; next.timeScale = speed;
  if (weigh) { next.enabled = true; next.setEffectiveWeight(1); }
  next.play();
  if (cur && cur !== next) cur.crossFadeTo(next, fade, false);
  return next;
}

export function turnYaw(h, key, want, share = 1, cap = Infinity) {
  const d = wrapPi(want - h[key]), step = d * Math.min(1, share);
  h[key] += Math.sign(step) * Math.min(Math.abs(step), cap);
  return Math.abs(d);
}
export function stepAlong(pos, yaw, dist) { pos.x -= Math.sin(yaw) * dist; pos.z -= Math.cos(yaw) * dist; return pos; }
const near = { d: 0, x: 0, z: 0, ahead: 0 };
export function ahead(pos, dir, p, range) {
  const x = p.x - pos.x, z = p.z - pos.z, d = Math.hypot(x, z);
  if (d > range) return null;
  near.d = d; near.x = x; near.z = z; near.ahead = (x * dir.x + z * dir.z) / Math.max(d, 1e-4);
  return near;
}
export function ringPoint(R, r0, r1, ok, tries) {
  for (let k = 0; k < tries; k++) {
    const a = R(0, 2 * Math.PI), r = R(r0, r1), p = vr.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (ok(p)) return p.clone();
  }
  return null;
}

export function watched(p, dir, maxD) {
  const d = p.distanceTo(camera.position); if (d >= maxD) return false;
  const along = dir.dot(vw.copy(p).sub(camera.position));
  return along > 0 && Math.sqrt(Math.max(0, d * d - along * along)) < 0.5 + d * 0.04;
}
export const gazeStep = (g, on, dt, fade) => on ? g + dt : fade === undefined ? 0 : Math.max(0, g - dt * fade);

export function makeZ() { const z = sprite("z", 110); z.material.depthTest = true; scene.add(z); return z; }
export function zAt(z, head, k, Z, f = 1) {
  if (head) toStage(head.getWorldPosition(z.position)).add(vb.set(Z.wob * f * Math.sin(k * 6), (Z.y0 + Z.rise * k) * f, 0));
  const w = (Z.w0 + Z.w1 * k) * f; z.scale.set(w, w / 4, 1);
}

export function bite(mesh, n, per, min = 0.1) {
  const k = Math.max(min, 1 - per * n), base = mesh.userData.base;
  if (base) mesh.scale.copy(base).multiplyScalar(k); else mesh.scale.setScalar(k);
}
