// Canopy Camp operator, with a sloth: lifting one into his hands to play, setting it down on a clear bit of ground, a cuddle
// on his lap when one joins him on a log, a nap together when one joins him in bed, and the hosting that lets a sloth join
// him at a place he holds (camp/sloths.js: a sloth that comes there calls life.join, which asks his host).
// Exports pickUp(clip, slothClip), putDown(), giveBack(at = clearSpot(), yaw = facing him), clearSpot(), cuddleSeated(), napTogether(), host(key), unhost().
import * as THREE from "three";
import { blockers, groundAt, RC, rng, scene } from "../stage.js";
const { R } = rng("operator");
import { V, ease, yawTo } from "../util.js";
import { dropAll } from "./handProps.js";
import { B, UP, body, cs, play, root } from "./model.js";
import { BED } from "./places.js";
import { ME, op } from "./state.js";
import { host as hostPlace } from "../places.js";
import { slothLife } from "../sloth/hooks.js";   // undefined with ?campsloths=0

// the sloth's pose in his hands, on his lap or in bed: played through the sloths' own clips (slothLife.pose), so it becomes the
// sloth's s.act and lend.js giveBack cross-fades it out again (review R2-001: a stopAllAction here left it blended in for good)
const slothPose = (s, clip, fade = 0.3) => slothLife?.pose(s, clip, fade);
function* lift(s, bone, local, quat, dur = 0.5) {      // move the sloth from where it is into his hold, then it rides on the bone
  scene.attach(s.o); const p0 = s.o.position.clone(), q0 = s.o.quaternion.clone();
  for (let t = 0; t < dur;) {
    t += yield; const e = ease(Math.min(1, t / dur));
    body.updateMatrixWorld(true); const wp = bone.localToWorld(local.clone()), wq = bone.getWorldQuaternion(new THREE.Quaternion()).multiply(quat);
    s.o.position.lerpVectors(p0, wp, e); s.o.position.y += Math.sin(e * Math.PI) * 0.12; s.o.quaternion.slerpQuaternions(q0, wq, e);
  }
  bone.add(s.o); s.o.position.copy(local); s.o.quaternion.copy(quat);
}
// one of the sloth's bones by its name (upper_armL), or the same name with a dot (upper_arm.L)
const slothBone = (o, n) => o.getObjectByName(n) || o.getObjectByName(n.replace(/(L|R)$/, ".$1"));
function* pickUp(clip, slothClip) {                    // lift the sloth into his hands: they hold it under its arms (handPose.js: op.carry)
  const s = op.buddy; play(clip, 0.45); slothPose(s, slothClip);
  // its two upper arms are found here, once per hold: a name search walks the whole sloth (review R2-084)
  if (!op.carry) { scene.attach(s.o); op.carry = { s, k: 0, from: s.o.position.clone(), q0: s.o.quaternion.clone(), arms: [slothBone(s.o, "upper_armL"), slothBone(s.o, "upper_armR")] }; }
  for (let t = 0; t < 0.7;) { t += yield; op.carry.k = Math.max(op.carry.k, THREE.MathUtils.smoothstep(t, 0, 0.7)); }
}
// set the sloth down at `at` (a clear spot beside him by default, never inside a blocker: review R2-010), turned to `yaw`
// (facing him by default; putDown passes the yaw it already turned the sloth to, so it does not snap round: review R2-012)
function giveBack(at = clearSpot(), yaw = facing(at)) {
  const s = op.buddy; if (!s) return; op.buddy = null; op.happy = false; op.carry = null;
  scene.attach(s.o); at.y = groundAt(at.x, at.z);
  s.o.position.copy(at); s.o.rotation.set(0, yaw, 0); s.cuddled = false;
  slothLife?.giveBack(s, at, yaw);
}
const facing = (p) => yawTo(root.position.clone().sub(p)) + Math.PI;   // the yaw that turns a sloth at p to face him
// a bit of open ground beside him to set the sloth on: in front if it's free, else a little round to either side, clear of the
// log seats, the table, the fire and the rest (campProps blockers), never inside one (Adriaen: it was dropped through a bench)
function clearSpot() {
  for (const d of [0.55, 0.75, 0.95]) for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
    const p = root.localToWorld(V(Math.sin(a) * d, 0, -Math.cos(a) * d)); p.y = 0;
    if (Math.hypot(p.x, p.z) > RC - 1) continue;
    if (blockers.every((b) => Math.hypot(p.x - b.at.x, p.z - b.at.z) > b.r + 0.22)) return p;
  }
  return root.localToWorld(V(0.1, 0, -0.55));
}
function* putDown() {                                   // set it down in front of him, facing him, and let it go
  if (!op.buddy || !op.carry) return; const c = op.carry, to = clearSpot(); to.y = groundAt(to.x, to.z);
  const yaw = facing(to); play("idle", 0.6); c.from.copy(to); c.q0.setFromAxisAngle(UP, yaw);
  for (let t = 0; t < 0.8;) { t += yield; c.k = 1 - THREE.MathUtils.smoothstep(t, 0, 0.8); }
  op.carry = null; giveBack(to, yaw);
}
function* cuddleSeated() {                             // a sloth joined him on the log: on his lap, his arms round it, his head on its
  const s = op.buddy; dropAll(); op.happy = true; play("seated_idle", 0.4);
  const lap = cs(0, 0.52, -0.22), q = new THREE.Quaternion();   // the sloth faces the fire with him
  slothPose(s, "idle"); s.cuddled = true;
  yield* lift(s, B.hips, B.hips.worldToLocal(lap.clone()), B.hips.getWorldQuaternion(q).invert().multiply(root.getWorldQuaternion(new THREE.Quaternion())), 0.8);
  op.ik = { hug: 0 };
  for (let t = 0, T = R(20, 35); t < T;) { t += yield; op.ik.hug = Math.min(1, t / 1, (T - t) / 1); op.look = -0.35 - 0.1 * Math.sin(t * 0.8); }
  op.ik = null; op.look = 0; giveBack();
}
function* napTogether() {                              // a sloth joined him in bed: it curls up beside him, under his arm, and they both sleep
  const s = op.buddy; s.cuddled = true; scene.attach(s.o); slothPose(s, "curl", 0.5);
  const at = BED.c.clone().addScaledVector(BED.across, 0.2).addScaledVector(BED.head, 0.05).setY(BED.c.y - 0.01);
  const q1 = new THREE.Quaternion().setFromAxisAngle(UP, yawTo(BED.across) + Math.PI * 0.1);   // facing him, a little toward his head
  const p0 = s.o.position.clone(), q0 = s.o.quaternion.clone();
  for (let t = 0; t < 1.2;) { t += yield; const e = THREE.MathUtils.smoothstep(t, 0, 1.2); s.o.position.lerpVectors(p0, at, e); s.o.position.y += Math.sin(e * Math.PI) * 0.25; s.o.quaternion.slerpQuaternions(q0, q1, e); }
  op.ik = { sleep: 1, nap: 0 };
  for (let t = 0; t < 1.5;) { t += yield; op.ik.nap = THREE.MathUtils.smoothstep(t, 0, 1.5); }
}

// places a sloth can join him in (camp/sloths.js: a sloth that comes to a place he holds calls life.join, which asks his host)
const hosted = new Set();
function welcome(s) {                                  // say yes when he's settled there and has no sloth with him yet
  if (op.buddy || !(op.seated || op.sleeping) || !slothLife?.lend(s, ME, { asleep: op.sleeping })) return false;
  op.buddy = s; return true;
}
function host(key) { hosted.add(key); hostPlace(key, welcome); }
function unhost() { for (const k of hosted) hostPlace(k, null); hosted.clear(); }

export { clearSpot, cuddleSeated, giveBack, host, napTogether, pickUp, putDown, unhost };
