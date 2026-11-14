// Canopy Camp operator, with a sloth: lifting one into his hands to play, setting it down on a clear bit of ground, a cuddle
// on his lap when one joins him on a log, a nap together when one joins him in bed, and the hosting that lets a sloth join
// him at a place he holds (camp/sloths.js: a sloth that comes there calls life.join, which asks his host).
// Exports pickUp(clip, slothClip), putDown(), giveBack(at), clearSpot(), cuddleSeated(), napTogether(), host(key), unhost().
import * as THREE from "three";
import { R, scene } from "../core.js";
import { RC } from "../layout.js";
import { V, ease } from "../util.js";
import { SLOTH, blockers } from "../campProps.js";
import { groundHeight as groundAt } from "../terrain.js";
import { dropAll } from "./handProps.js";
import { B, UP, body, cs, play, root } from "./model.js";
import { BED } from "./places.js";
import { ME, life, op } from "./state.js";
import { yawTo } from "./walk.js";

function slothPose(s, clip) {
  const c = SLOTH.animations.find((q) => q.name === clip); if (!c) return;
  const a = s.mixer.clipAction(c); s.mixer.stopAllAction(); a.reset().play();
}
function* lift(s, bone, local, quat, dur = 0.5) {      // move the sloth from where it is into his hold, then it rides on the bone
  scene.attach(s.o); const p0 = s.o.position.clone(), q0 = s.o.quaternion.clone();
  for (let t = 0; t < dur;) {
    t += yield; const e = ease(Math.min(1, t / dur));
    body.updateMatrixWorld(true); const wp = bone.localToWorld(local.clone()), wq = bone.getWorldQuaternion(new THREE.Quaternion()).multiply(quat);
    s.o.position.lerpVectors(p0, wp, e); s.o.position.y += Math.sin(e * Math.PI) * 0.12; s.o.quaternion.slerpQuaternions(q0, wq, e);
  }
  bone.add(s.o); s.o.position.copy(local); s.o.quaternion.copy(quat);
}
function* pickUp(clip, slothClip) {                    // lift the sloth into his hands: they hold it under its arms (camp/opStep: op.carry)
  const s = op.buddy; play(clip, 0.45); slothPose(s, slothClip);
  if (!op.carry) { scene.attach(s.o); op.carry = { s, k: 0, from: s.o.position.clone(), q0: s.o.quaternion.clone() }; }
  for (let t = 0; t < 0.7;) { t += yield; op.carry.k = Math.max(op.carry.k, THREE.MathUtils.smoothstep(t, 0, 0.7)); }
}
function giveBack(at) {
  const s = op.buddy; if (!s) return; op.buddy = null; op.happy = false; op.carry = null;
  scene.attach(s.o);
  const p = at || root.localToWorld(V(0.25, 0, -0.55)); p.y = groundAt(p.x, p.z);
  s.o.position.copy(p); s.o.rotation.set(0, R(0, 6.28), 0); s.cuddled = false;
  life().giveBack?.(s, p, s.o.rotation.y);
}
// a bit of open ground beside him to set the sloth on: in front if it's free, else a little round to either side, clear of the
// log seats, the table, the fire and the rest (campProps blockers), never inside one (Adriaen: it was dropped through a bench)
function clearSpot() {
  for (const d of [0.55, 0.75, 0.95]) for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
    const p = root.localToWorld(V(Math.sin(a) * d, 0, -Math.cos(a) * d)); p.y = 0;
    if (Math.hypot(p.x, p.z) > RC - 1) continue;
    if (blockers.every(([c, r]) => Math.hypot(p.x - c.x, p.z - c.z) > r + 0.22)) return p;
  }
  return root.localToWorld(V(0.1, 0, -0.55));
}
function* putDown() {                                   // set it down in front of him, facing him, and let it go
  if (!op.buddy || !op.carry) return; const c = op.carry, to = clearSpot(); to.y = groundAt(to.x, to.z);
  play("idle", 0.6); c.from.copy(to); c.q0.setFromAxisAngle(UP, yawTo(root.position.clone().sub(to)) + Math.PI);   // facing him
  for (let t = 0; t < 0.8;) { t += yield; c.k = 1 - THREE.MathUtils.smoothstep(t, 0, 0.8); }
  op.carry = null; giveBack(to);
}
function* cuddleSeated() {                             // a sloth joined him on the log: on his lap, his arms round it, his head on its
  const s = op.buddy; dropAll(); op.happy = true; play("seated_idle", 0.4);
  const lap = cs(0, 0.52, -0.22), q = new THREE.Quaternion();   // the sloth faces the fire with him
  slothPose(s, "idle"); s.cuddled = true;
  yield* lift(s, B.hips, B.hips.worldToLocal(lap.clone()), B.hips.getWorldQuaternion(q).invert().multiply(root.getWorldQuaternion(new THREE.Quaternion())), 0.8);
  op.ik = { hug: 0 };
  for (let t = 0, T = R(20, 35); t < T;) { t += yield; op.ik.hug = Math.min(1, t / 1, (T - t) / 1); op.look = -0.35 - 0.1 * Math.sin(t * 0.8); }
  op.ik = null; op.look = 0; giveBack(root.localToWorld(V(0.5, 0, -0.45)));
}
function* napTogether() {                              // a sloth joined him in bed: it curls up beside him, under his arm, and they both sleep
  const s = op.buddy; s.cuddled = true; scene.attach(s.o); slothPose(s, "curl");
  const at = BED.c.clone().addScaledVector(BED.across, 0.2).addScaledVector(BED.head, 0.05).setY(BED.c.y - 0.01);
  const q1 = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-BED.across.x, -BED.across.z) + Math.PI * 0.1);   // facing him, a little toward his head
  const p0 = s.o.position.clone(), q0 = s.o.quaternion.clone();
  for (let t = 0; t < 1.2;) { t += yield; const e = THREE.MathUtils.smoothstep(t, 0, 1.2); s.o.position.lerpVectors(p0, at, e); s.o.position.y += Math.sin(e * Math.PI) * 0.25; s.o.quaternion.slerpQuaternions(q0, q1, e); }
  op.ik = { sleep: 1, nap: 0 };
  for (let t = 0; t < 1.5;) { t += yield; op.ik.nap = THREE.MathUtils.smoothstep(t, 0, 1.5); }
}

// places a sloth can join him in (camp/sloths.js: a sloth that comes to a place he holds calls life.join, which asks his host)
const hosted = new Set();
function welcome(s) {                                  // say yes when he's settled there and has no sloth with him yet
  if (op.buddy || !(op.seated || op.sleeping) || !life().lend?.(s, ME, { asleep: op.sleeping })) return false;
  op.buddy = s; return true;
}
function host(key) { hosted.add(key); life().host?.(key, welcome); }
function unhost() { for (const k of hosted) life().host?.(k, null); hosted.clear(); }

export { clearSpot, cuddleSeated, giveBack, host, napTogether, pickUp, putDown, unhost };
