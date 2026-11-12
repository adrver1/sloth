// Canopy Camp operator: the bearded operator from desk-at-night (engine/characters/bearded_operator, packed into
// models/operator.txt, with the clips of his survival build in models/operator_anims.txt) living in the camp. He goes about
// his day: soup from the pot on a log seat, a mug from the kitchen crate, a book, warming his hands at the fire, a stroll,
// sleep in the tent bed, and playing with a sloth (holds it up into the wind, flies it overhead). He shares the camp with the
// sloths through window.__campLife (camp/sloths.js): he claims the places he uses, registers as a mover and steers round
// the others, and a sloth that comes to his seat or his bed joins him there (a cuddle on his lap, a nap on his chest).
// Repack after a change in desk-at-night (engine/): in engine/web, node scripts/pack_chars.mjs <dir> ../characters/bearded_operator/bearded_operator.glb
// (mesh, no clips) and node scripts/pack_chars.mjs --clips idle,walk,seated_idle,stand_up,sip,hug,play,play_titanic,play_airplane,play_knees,wave,blink,happy,talk,phone,phone_down,step_down
// <dir2> ../characters/bearded_operator/bearded_operator_survival.glb (its anims.glb: the same rig, with the play clips), then base64 each into models/.
// ?op=0 leaves him out; window.__op drives him for checks (window.__op.go("read"), .state()).
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import "./sloths.js";   // run after the module before it, as one script did
import { PRE, R, camera, qs, scene, uTime } from "./core.js";
import { load, save } from "./save.js";
import { A0, RC, V } from "./forest.js";
import { SLOTH, SOUP_POT, blockers, uNight } from "./campProps.js";
import { addTarget } from "./input.js";
import { me } from "./player.js";
import { sprite } from "./sloths.js";
import { groundHeight } from "./terrain.js";

const ON = qs.get("op") !== "0";
const [OP, ANIM] = ON ? await Promise.all([PRE.operator, PRE.operatorAnims]) : [null, null];
const UP = V(0, 1, 0), tmp = V(), tq = new THREE.Quaternion(), ray = new THREE.Raycaster(), DOWN = V(0, -1, 0);
const life = () => window.__campLife || {};
const groundAt = groundHeight;                         // camp/terrain.js (the ground bowl): 0 across the camp floor
const RADIUS = 0.3, WALK = 1.05, STRIDE = 1.28, ME = "operator";

// ---------------------------------------------------------------- the model: one skinned mesh, 1,034 triangles, Lambert
const root = new THREE.Group(), clipOf = (n) => ANIM.animations.find((a) => a.name === n);
let body, mixer, B = {}, acts = {}, cur = null;
if (ON) {
  body = clone(OP.scene); root.add(body); scene.add(root);
  body.traverse((m) => {
    if (m.isBone) B[m.name] = m;
    if (m.isMesh) {
      const map = m.material.map; if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter; }
      m.material = new THREE.MeshLambertMaterial({ map, flatShading: true }); m.frustumCulled = false;
    }
  });
  mixer = new THREE.AnimationMixer(body);
  for (const a of ANIM.animations) acts[a.name] = mixer.clipAction(a);
  for (const n of ["blink", "happy"]) { const a = acts[n]; a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
  // a soft round shadow under him (2 triangles): the props' shadows are baked, and he moves
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.45,
    map: (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "rgba(30,24,16,1)"); r.addColorStop(0.55, "rgba(30,24,16,.5)"); r.addColorStop(1, "rgba(30,24,16,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })() }));
  shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1; scene.add(shadow); root.userData.shadow = shadow;
}
function play(name, fade = 0.35, { once = false, at = 0, speed = 1 } = {}) {
  const a = acts[name]; if (!a) return null;
  if (cur === a) { a.timeScale = speed; return a; }
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.time = at; a.timeScale = speed; a.enabled = true; a.setEffectiveWeight(1); a.play();
  if (cur) cur.crossFadeTo(a, fade, false); cur = a; return a;
}

// ---------------------------------------------------------------- props in his hands: a soup bowl, a mug, an open book (64 tris)
const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const bowl = (() => {   // an enamel bowl 20 cm across (Adriaen: bigger), open, 8 sides (32 tris), with the soup's surface (8)
  const g = new THREE.Group(), b = new THREE.Mesh(new THREE.LatheGeometry([V(0.001, 0), V(0.06, 0.006), V(0.1, 0.065)], 8), lam(0x3f6f8f)); b.material.side = THREE.DoubleSide;
  const s = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), lam(0xc7752e)); s.rotation.x = -Math.PI / 2; s.position.y = 0.05; g.add(b, s); return g;
})();
const spoon = (() => {   // a tin spoon: a flat handle (12 tris) and its bowl (6), along +Y from the grip
  const g = new THREE.Group(), m = lam(0xc9c4b8), h = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.004), m); h.position.y = 0.045;
  const b = new THREE.Mesh(new THREE.CircleGeometry(0.02, 6), m); b.material.side = THREE.DoubleSide; b.position.set(0, 0.125, 0.004); b.scale.set(0.8, 1.2, 1); g.add(h, b); return g;   // the head in the handle's plane, its hollow to +Z
})();
const mug = (() => {   // a tin mug, 8 sides, open top, bottom cap (22 tris), and a handle (2 tris)
  const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 8, 1, true), lam(0xd8d2c4)); m.material.side = THREE.DoubleSide; m.position.y = 0.045;
  const bot = new THREE.Mesh(new THREE.CircleGeometry(0.036, 8), m.material); bot.rotation.x = Math.PI / 2; bot.position.y = 0.001;
  const h = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.055), lam(0xbdb6a6)); h.material.side = THREE.DoubleSide; h.position.set(0.052, 0.05, 0); h.rotation.x = Math.PI / 2;
  g.add(m, bot, h); return g;
})();
const book = (() => {   // open book: two cover quads and two page quads (8 tris), spine along Y, pages facing +Z (the reader), halves cupped toward him
  const g = new THREE.Group(), pages = (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 32; const x = c.getContext("2d");
    x.fillStyle = "#f1ead8"; x.fillRect(0, 0, 64, 32); x.fillStyle = "#b9b09a"; for (let y = 5; y < 28; y += 3) { x.fillRect(4, y, 24, 1); x.fillRect(36, y, 24, 1); } x.fillStyle = "#cfc6b0"; x.fillRect(31, 0, 2, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const W = 0.15, H = 0.22, open = 0.3;                 // a hardback, 30 cm open (Adriaen: bigger)
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.rotation.y = -side * open;   // outer edges toward the reader, the spine away (Adriaen: it bent the wrong way)
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: pages }));
    const uv = p.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
    p.position.set(side * W / 2, 0, 0.004);
    const cv = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.008, H + 0.01), lam(0x7a3b2a)); cv.material.side = THREE.DoubleSide; cv.position.set(side * W / 2, 0, -0.001);
    leaf.add(p, cv); g.add(leaf);
  }
  return g;
})();
for (const p of [bowl, spoon, mug, book]) { p.visible = false; scene.add(p); }
function hold(prop) { op.inHand = prop; prop.visible = true; }   // placed at his right hand each frame (opStep), upright, tipped to his lips as he sips
function drop(prop) { prop.visible = false; if (op.inHand === prop) op.inHand = null; }

// ---------------------------------------------------------------- bones after the clip: reach, look
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), va = V(), vb = V(), vc = V(), vd = V();
function aimBone(b, dir, w = 1) {                      // turn bone b (it points along its own +Y) toward world dir, by w
  const bq = b.getWorldQuaternion(qa), y = vb.copy(UP).applyQuaternion(bq);
  qb.setFromUnitVectors(y, dir).slerp(qc.identity(), 1 - w).multiply(bq);
  b.quaternion.copy(b.parent.getWorldQuaternion(qc).invert().multiply(qb));
}
function reach(side, target, pole, w = 1) {            // two-bone reach: put the wrist at world target, the elbow toward pole
  if (w <= 0) return;
  const up = B["upper_arm" + side], fo = B["forearm" + side], ha = B["hand" + side];
  const s = up.getWorldPosition(V()), e = fo.getWorldPosition(V()), h = ha.getWorldPosition(V());
  const l1 = s.distanceTo(e), l2 = e.distanceTo(h);
  const goal = h.clone().lerp(target, w), d = Math.min(Math.max(s.distanceTo(goal), 0.05), l1 + l2 - 0.002);
  const dir = goal.clone().sub(s).normalize(), perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), a = Math.acos(Math.min(1, Math.max(-1, ca)));
  const u = dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a));
  aimBone(up, u); const elbow = s.clone().addScaledVector(u, l1); aimBone(fo, goal.clone().sub(elbow).normalize());
}
// turn a hand so its fingers point along world dir `fingers` with the palm facing world dir `palm` (by w). The rig's hands: fingers
// along +Y, the palm on local (1,0,-1) for the left hand and (-1,0,-1) for the right, the thumb and index side on (±1,0,1)
const PALM = { L: V(1, 0, -1).normalize(), R: V(-1, 0, -1).normalize() }, THUMB = { L: V(1, 0, 1).normalize(), R: V(-1, 0, 1).normalize() };
const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), qh = new THREE.Quaternion();
function handQuat(side, fingers, palm) {               // the world rotation of that hand pose
  const y = fingers.clone().normalize(), p = palm.clone().addScaledVector(y, -palm.dot(y)).normalize(), c = V().crossVectors(y, p);
  const yl = UP, pl = PALM[side], cl = V().crossVectors(yl, pl);
  mA.makeBasis(y, p, c); mB.makeBasis(yl, pl, cl).transpose(); return new THREE.Quaternion().setFromRotationMatrix(mA.multiply(mB));
}
function turnHand(side, q, w = 1) {                    // after the arm's reach: set the hand's world rotation q
  const h = B["hand" + side]; h.parent.getWorldQuaternion(qh).invert().multiply(q); h.quaternion.slerp(qh, w);
}
// character space (x his left-right, y up, z: -1 ahead, +1 behind) to world, for the pose he is in now
const cs = (x, y, z) => V(x, y, z).applyMatrix4(root.matrixWorld);
const csDir = (x, y, z) => V(x, y, z).transformDirection(root.matrixWorld);

// ---------------------------------------------------------------- the camp's places for him
const SEATS = [];                                      // the free end of each log seat that isn't Sunny's (Sunny's is Seat_0)
let BED = null;
function findPlaces() {
  if (SEATS.length) return true;
  for (const i of [1, 2]) {
    const log = scene.getObjectByName(`Seat_${i}`); if (!log) return false;
    log.updateMatrixWorld(true);
    const ax = V(1, 0, 0).transformDirection(log.matrixWorld).setY(0).normalize(), c = log.getWorldPosition(V());
    const things = scene.getObjectByName("SeatThings"); let side = i === 1 ? -1 : 1;
    if (things) { const t = new THREE.Box3().setFromObject(things).getCenter(V()); if (t.distanceTo(c) < 1.2) side = t.clone().sub(c).dot(ax) > 0 ? -1 : 1; }
    const at = c.clone().addScaledVector(ax, side * 0.36);
    ray.set(V(at.x, 3, at.z), DOWN); ray.far = 4;
    const tops = [log, scene.getObjectByName(`SeatTop_${i}`)].filter(Boolean), top = ray.intersectObjects(tops, true)[0]?.point.y ?? 0.42;
    SEATS.push({ key: `log:${i}`, at: at.setY(top), yaw: Math.atan2(c.x, c.z) });   // facing the fire
  }
  const t = window.__camp?.tentAt, tent = scene.getObjectByName("Tent");
  if (t && tent) {   // the bed along the tent's left wall (build_camp.py wall_tent: bed at (-W + 0.48, yb - 1.01), head toward +y)
    const L = t.length(), fx = -t.x / L, fz = -t.z / L, at = (bx, by) => V(t.x + bx * fz - by * fx, 0, t.z - bx * fx - by * fz);
    const c = at(-0.92, 0.49); ray.set(V(c.x, 3, c.z), DOWN); ray.far = 4;
    const hits = ray.intersectObject(tent, true).filter((h) => h.point.y < 0.8 && h.point.y > 0.2), top = hits[0]?.point.y ?? 0.45;
    const head = at(-0.92, 1.2).sub(at(-0.92, 0)).normalize();
    BED = { key: "bed:0", c: c.setY(top), head, side: at(-0.28, 0.35), door: at(0, -1.7), inside: at(0, -0.45), across: at(1, 0).sub(at(0, 0)).normalize() };
  }
  return true;
}
const fireGap = (from) => {                            // a spot just off the fire ring, in the gap between logs nearest `from`
  const gaps = [A0, A0 + Math.PI - 0.575, A0 + Math.PI + 0.575];
  const a = gaps.sort((p, q) => Math.hypot(Math.cos(p) * 1.4 - from.x, Math.sin(p) * 1.4 - from.z) - Math.hypot(Math.cos(q) * 1.4 - from.x, Math.sin(q) * 1.4 - from.z))[0];
  return V(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
};

// ---------------------------------------------------------------- walking: a path round the blockers, steering round movers
const op = { kind: "start", it: null, place: null, seated: false, lying: false, buddy: null, prop: null, look: 0, face: 0, sleeping: false, ik: null, gaze: 0 };
function freeOf(p, r = RADIUS) { return !blockers.some(([c, br]) => Math.hypot(p.x - c.x, p.z - c.z) < br + r); }
function pathTo(to) {
  const p = life().path?.(root.position, to, RADIUS);
  if (p?.length) return p.map((q) => q.clone());
  return [to.clone()];                                // no planner: straight there, steering round what's in the way
}
const yawTo = (d) => Math.atan2(-d.x, -d.z);          // his forward is -Z
function turnToward(yaw, dt, rate = 4) { let d = yaw - root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); root.rotation.y += Math.sign(d) * Math.min(Math.abs(d), rate * dt); return Math.abs(d); }
function* wait(s, until) { let t = 0; while (t < s) { if (until?.()) return; t += yield; } }
function* walkTo(to, { near = 0.12 } = {}) {
  const pts = pathTo(to); let stuck = 0, waited = 0;
  play("walk", 0.3, { speed: 0.9 });
  while (pts.length) {
    const dt = yield, p = root.position, goal = pts[0], d = tmp.set(goal.x - p.x, 0, goal.z - p.z), dist = d.length();
    if (dist < (pts.length > 1 ? 0.3 : near)) { pts.shift(); continue; }
    const want = d.normalize().clone();
    // keep clear of blockers (unless the goal is inside one: a seat, the bed) and of everyone walking about
    for (const [c, br] of blockers) {
      const ox = p.x - c.x, oz = p.z - c.z, od = Math.hypot(ox, oz), lim = br + RADIUS + 0.15;
      if (od < lim && Math.hypot(to.x - c.x, to.z - c.z) > br) want.addScaledVector(V(ox / od, 0, oz / od), (lim - od) / lim * 1.6);
    }
    let block = null;
    for (const [mp, mr] of life().movers?.() ?? []) {
      if (mp === root.position) continue;
      const ox = mp.x - p.x, oz = mp.z - p.z, od = Math.hypot(ox, oz); if (od > mr + RADIUS + 0.9) continue;
      const ahead = (ox * want.x + oz * want.z) / (od || 1);
      if (ahead > 0.3 && od < mr + RADIUS + 0.45) block = [ox / od, oz / od];
      if (ahead > 0) want.add(V(-oz / od, 0, ox / od).multiplyScalar(0.6 * ahead));   // keep right of them
    }
    want.normalize();
    let speed = WALK * Math.min(1, dist / 0.4 + 0.35);
    if (block) { speed = 0; waited += dt; if (waited > 2.5) want.add(V(-block[1], 0, block[0])).normalize(); } else waited = 0;   // someone in the way: wait, then step round
    if (block && waited > 2.5) speed = WALK * 0.5;
    const turn = turnToward(yawTo(want), dt, 3.2); if (turn > 1.2) speed *= 0.3;
    const fwd = csDir(0, 0, -1).setY(0).normalize();
    const was = p.clone(); p.addScaledVector(fwd, speed * dt); p.y = groundAt(p.x, p.z);
    cur.timeScale = Math.max(0.35, speed / STRIDE);    // the clip's feet move 1.28 m a cycle: match it, so they don't slide
    stuck = was.distanceTo(p) < 0.15 * dt && !block ? stuck + dt : 0;
    if (stuck > 3) { pts.splice(0, pts.length, ...pathTo(to)); stuck = 0; }
  }
  play("idle", 0.4);
}
function* face(yaw) {                                  // turn on the spot with small steps (the walk clip, slow), easing in and out
  let d = Math.abs(Math.atan2(Math.sin(yaw - root.rotation.y), Math.cos(yaw - root.rotation.y))); if (d < 0.05) return;
  const prev = cur, a = play("walk", 0.25, { speed: 0.45 });
  for (let t = 0; ; ) { const dt = yield; t += dt; const left = turnToward(yaw, dt, 2.2 * Math.min(1, 0.3 + t * 1.5, 0.25 + d)); d = left; if (left < 0.02) break; }
  play(prev === a ? "idle" : prev?.getClip().name ?? "idle", 0.3);
}

// sitting: the clips keep his root under his hips, so seated his feet are 0.43 m ahead of it and standing they are under it.
// He walks to where his feet will be (in front of the seat, his back to it), and sits down with the stand_up clip played
// backwards while a foot lock (op.footLock, in opStep) keeps his feet planted, so his hips travel back onto the seat; he
// rises with it played forwards, his feet still planted, and walks off from there (Adriaen: he stood up into the bench).
const SIT_REACH = 0.43, SIT_LOW = 0.02, SIT_HIGH = 1.25;    // feet ahead of the hips seated; the clip's seated and standing ends
function seatFeet(s) {                                 // where his feet go for seat s (hips just behind its middle)
  const fwd = V(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)), f = s.at.clone().addScaledVector(fwd, SIT_REACH - 0.04);
  return f.setY(groundAt(f.x, f.z) + 0.09 + (s.at.y - 0.36));   // the clip seats him for a 0.36 m top (log seats); a higher top lifts him
}
function* sitOn(s) {
  const F = seatFeet(s);
  yield* walkTo(F.clone().setY(0), { near: 0.06 }); yield* face(s.yaw);
  op.footLock = F.clone().setY(groundAt(F.x, F.z) + 0.09);
  const a = play("stand_up", 0.3, { once: true, at: SIT_HIGH, speed: -0.85 });
  for (let k = 0; a.time > SIT_LOW + 0.01;) { k += yield; op.footLock.y = groundAt(F.x, F.z) + 0.09 + (F.y - groundAt(F.x, F.z) - 0.09) * Math.min(1, k / 1.2); }
  play("seated_idle", 0.4); op.seated = true; op.footLock.copy(F);
}
function* standUp() {
  op.seated = false; const F = op.footLock?.clone() ?? root.position.clone();
  const a = play("stand_up", 0.3, { once: true, at: SIT_LOW, speed: 0.85 });
  const gy = groundAt(F.x, F.z) + 0.09;
  for (let k = 0; a.time < SIT_HIGH;) { k += yield; if (op.footLock) op.footLock.y = F.y + (gy - F.y) * Math.min(1, k / 1.1); }
  play("idle", 0.45); yield* wait(0.45);
  op.footLock = null; root.position.y = groundAt(root.position.x, root.position.z);
}
const freeSeat = () => { findPlaces(); return SEATS.filter((s) => !life().holder?.(s.key)).sort((a, b) => a.at.distanceTo(root.position) - b.at.distanceTo(root.position))[0]; };
function claim(key) { const L = life(); if (L.claim && !L.claim(key, ME)) return false; op.place = key; return true; }
function release() { if (op.place) life().release?.(op.place, ME); op.place = null; }

// ---------------------------------------------------------------- what he does
const SIP = { hold: 1.25, top: 2.3 };                  // the sip clip: the mug at the chest at 1.25 s, at the lips 1.6 to 2.2 s
function* sipping(n, prop) {                           // n sips from what's in his right hand, resting it at his chest between
  const a = play("sip", 0.5, { at: SIP.hold }); a.timeScale = 0;
  for (let k = 0; k < n && !op.buddy; k++) {
    yield* wait(R(2.5, 6), () => op.buddy);
    if (op.buddy) break;
    for (let t = SIP.hold; t < SIP.top;) { t += (yield) * 0.9; a.time = Math.min(t, SIP.top); }
    yield* wait(R(0.4, 1.2));
    for (let t = SIP.top; t > SIP.hold;) { t -= (yield) * 1.3; a.time = Math.max(t, SIP.hold); }
  }
}
function* seatWith(activity) {                         // claim a seat, sit, do it, and cuddle any sloth that joins
  const s = freeSeat(); if (!s || !claim(s.key)) return;
  host(s.key);
  yield* sitOn(s);
  yield* activity();
  if (op.buddy) yield* cuddleSeated();
  unhost(); dropAll(); yield* standUp(); release();
}
function dropAll() { for (const p of [bowl, spoon, mug, book]) drop(p); op.ik = null; op.eat = null; }
const DO = {
  *eat() {                                             // a bowl of soup from the pot, eaten on a log seat
    yield* walkTo(fireGap(root.position)); yield* face(yawTo(V(-root.position.x, 0, -root.position.z)));
    const pot = SOUP_POT?.at ?? V(0, 0.885, 0);
    for (let t = 0; t < 1.6;) { t += yield; op.ik = { R: [pot.clone().add(V(0, 0.12, 0)), Math.sin(Math.min(1, t / 1.6) * Math.PI) ** 2] }; }
    op.ik = null; bowl.visible = spoon.visible = true; op.eat = { t: 0, spoon: 0 };   // the bowl in both hands, the spoon in his right
    yield* seatWith(function* () {
      for (let t = 0, T = R(22, 38); t < T && !op.buddy;) { const dt = yield; t += dt; op.eat.spoon = Math.min(1, t / 1.5); op.eat.t += dt; }
    });
  },
  *drink() {                                           // a mug from the kitchen crate, drunk slowly on a log seat
    const crate = V(4.55, 0, 1.7), front = crate.clone().addScaledVector(crate.clone().negate().normalize(), 0.75);
    yield* walkTo(front); yield* face(yawTo(crate.clone().sub(root.position)));
    for (let t = 0; t < 1.4;) { t += yield; op.ik = { R: [crate.clone().setY(0.45), Math.sin(Math.min(1, t / 1.4) * Math.PI) ** 2] }; }
    op.ik = null; hold(mug);
    yield* seatWith(function* () { yield* sipping(Math.round(R(4, 7)), mug); });
  },
  *read() {                                            // a book on a log seat, both hands on it, now and then a look at the fire
    yield* seatWith(function* () {
      book.visible = true; scene.add(book); op.ik = { book: 0 };
      for (let t = 0, T = R(30, 55); t < T && !op.buddy;) { t += yield; op.ik.book = Math.min(1, t / 1.2); op.look = (t % 14) > 11 ? 0 : -0.3; }
      for (let t = 0; t < 0.8;) { t += yield; if (op.ik) op.ik.book = 1 - t / 0.8; }
      book.visible = false; op.ik = null; op.look = 0;
    });
  },
  *warm() {                                            // hands out to the fire (most at dusk and at night)
    yield* walkTo(fireGap(root.position)); yield* face(yawTo(V(-root.position.x, 0, -root.position.z)));
    for (let t = 0, T = R(10, 18); t < T;) {
      t += yield; const k = Math.min(1, t / 1.2, (T - t) / 1.2), rub = Math.sin(t * 3) * 0.03;
      op.ik = { R: [cs(0.12 + rub, 1.24, -0.5), k], L: [cs(-0.12 - rub, 1.24, -0.5), k] };
    }
    op.ik = null;
  },
  *stroll() {                                          // a slow walk to somewhere in the camp, a look round, a wave if you look at him
    let to = null;
    for (let k = 0; k < 30 && !to; k++) { const a = R(0, 6.28), r = R(1.6, RC - 1.8), p = V(Math.cos(a) * r, 0, Math.sin(a) * r); if (freeOf(p, 0.6)) to = p; }
    if (!to) return;
    yield* walkTo(to);
    for (let t = 0, T = R(5, 10); t < T;) { t += yield; op.look = Math.sin(t * 0.7) * 0.5; op.face = 0; }
    op.look = 0;
  },
  *sleep() {                                           // in the tent bed: sits on its edge, lies back, sleeps; at night until the day comes
    findPlaces(); if (!BED || !claim(BED.key)) return;
    host(BED.key);
    yield* walkTo(BED.door); yield* walkTo(BED.inside, { near: 0.15 }); yield* walkTo(BED.side, { near: 0.08 });
    yield* face(yawTo(BED.across.clone().negate().multiplyScalar(-1)));
    const sitYaw = yawTo(BED.across);                  // his back to the bed: he faces across the tent, away from the wall
    yield* face(sitYaw);
    const edge = { at: BED.c.clone().addScaledVector(BED.across, 0.2).addScaledVector(BED.head, -0.25), yaw: sitYaw };
    yield* sitOn(edge); const sr = root.position.clone(), lock = op.footLock.clone(); op.footLock = null;
    yield* wait(1.2);
    // lie back: on his back along the bed, head on the pillow
    const lie = new THREE.Matrix4().makeBasis(V().crossVectors(BED.head, V(0, -1, 0)), BED.head, V(0, -1, 0)), lq = new THREE.Quaternion().setFromRotationMatrix(lie);
    const feet = BED.c.clone().addScaledVector(BED.head, -0.82).addScaledVector(BED.across, -0.1).setY(BED.c.y + 0.11), fq = root.quaternion.clone(); let from = root.position.clone();   // a little toward the wall: room for a sloth beside him
    play("idle", 0.9); op.lying = true;
    for (let t = 0; t < 1.3;) { t += yield; const k = Math.min(1, t / 1.3), e = k * k * (3 - 2 * k); root.position.lerpVectors(from, feet, e); root.quaternion.slerpQuaternions(fq, lq, e); }
    op.sleeping = true; op.ik = { sleep: 1 };
    const night = () => uNight.value > 0.5;
    for (let t = 0, T = R(40, 80); (night() ? true : t < T);) {
      t += yield;
      if (op.buddy && !op.buddy.cuddled) yield* napTogether();
      if (night() && t > 600) t = 0;
      if (!night() && op.wasNight && t > 8) break;     // the day has come: up a little after the light
      op.wasNight = night();
    }
    op.sleeping = false; op.ik = null; op.wasNight = false;
    if (op.buddy) giveBack();
    unhost();
    from = root.position.clone(); const q0 = root.quaternion.clone(), up = new THREE.Quaternion().setFromAxisAngle(UP, sitYaw);
    play("seated_idle", 0.9);
    for (let t = 0; t < 1.3;) { t += yield; const k = Math.min(1, t / 1.3), e = k * k * (3 - 2 * k); root.position.lerpVectors(from, sr, e); root.quaternion.slerpQuaternions(q0, up, e); }
    op.lying = false; root.rotation.set(0, sitYaw, 0); op.footLock = lock;
    yield* standUp(); release();
    yield* walkTo(BED.inside, { near: 0.15 }); yield* walkTo(BED.door);
  },
  *play() {                                            // borrow a sloth that's about on the ground and play with it
    const L = life(); if (!L.lend) return;
    const s = (L.sloths || []).filter((q) => q.o && q.o.getWorldPosition(tmp).y < 0.6 && Math.hypot(tmp.x, tmp.z) < RC - 1)
      .map((q) => [q, q.o.getWorldPosition(tmp).distanceTo(root.position) * R(0.5, 1.5) + (q.trip?.phase === "home" ? 3 : 0)]).sort((a, b) => a[1] - b[1]).map(([q]) => q).find((q) => L.lend(q, ME));   // nearest-ish, the ones out and about first
    if (!s) return;
    op.buddy = s; op.happy = true;
    const at = s.o.getWorldPosition(V()), d = at.clone().sub(root.position).setY(0);
    yield* walkTo(at.clone().addScaledVector(d.normalize(), -0.55));
    yield* face(yawTo(at.clone().sub(root.position)));
    for (const [clip, slothClip, T] of [["play_titanic", "titanic", R(8, 12)], ["play_airplane", "titanic", R(6, 9)]]) {
      if (!op.buddy) break;
      yield* pickUp(clip, slothClip);
      yield* wait(T);
    }
    yield* putDown(); op.happy = false;
  },
};
const WEIGHTS = (night) => night ? { sleep: 6, warm: 2, drink: 1, read: 0.3, stroll: 0.3, eat: 0.5, play: 0.3 }
  : { eat: 1.2, drink: 1.2, read: 1.6, warm: 0.5, stroll: 1.2, sleep: 0.5, play: 1.2 };
function pick() {
  const w = Object.entries(WEIGHTS(uNight.value > 0.5)).filter(([k]) => k !== op.last && (k !== "play" || life().lend));
  let r = R(0, w.reduce((s, [, v]) => s + v, 0)); for (const [k, v] of w) if ((r -= v) <= 0) return k; return w[0][0];
}
function* lifeLoop() {
  yield* wait(R(2, 5));
  for (;;) {
    const kind = op.next || pick(); op.next = null; op.kind = kind;
    yield* DO[kind](); op.kind = "idle"; op.last = kind;
    yield* wait(R(2, 6), () => op.next);
  }
}

// ---------------------------------------------------------------- with a sloth: playing, a cuddle on the seat, a nap on the bed
function slothPose(s, clip) {
  const c = SLOTH.animations.find((q) => q.name === clip); if (!c) return;
  const a = s.mixer.clipAction(c); s.mixer.stopAllAction(); a.reset().play();
}
function* lift(s, bone, local, quat, dur = 0.5) {      // move the sloth from where it is into his hold, then it rides on the bone
  scene.attach(s.o); const p0 = s.o.position.clone(), q0 = s.o.quaternion.clone();
  for (let t = 0; t < dur;) {
    t += yield; const k = Math.min(1, t / dur), e = k * k * (3 - 2 * k);
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
function* putDown() {                                   // set it down in front of him, facing him, and let it go
  if (!op.buddy || !op.carry) return; const c = op.carry, to = root.localToWorld(V(0.1, 0, -0.55)); to.y = groundAt(to.x, to.z);
  play("idle", 0.6); c.from.copy(to); c.q0.setFromAxisAngle(UP, root.rotation.y + Math.PI);
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

// ---------------------------------------------------------------- each frame
const zz = ON ? (() => { const z = sprite("z", 110); z.material.depthTest = true; z.material.opacity = 0; scene.add(z); return z; })() : null;
const REST = ON ? ["neck", "head", "chest", "upper_armR", "forearmR", "upper_armL", "forearmL", "handR", "handL"].map((n) => [B[n], B[n].quaternion.clone()]) : [];
let blinkT = 2, zk = 0, it = null, lookT = 0;
function opStep(dt) {
  if (!ON) return;
  if (!it) { it = lifeLoop(); it.next(); life().addMover?.(root, RADIUS); }
  if (!life().movers && !op.moverTry) op.moverTry = 1;
  else if (op.moverTry === 1 && life().addMover) { life().addMover(root, RADIUS); op.moverTry = 2; }
  it.next(dt);
  // the bones touched after the clip go back to the clip's pose first: three's mixer only writes a value when it changes (a held
  // clip, a bone no clip keys), so otherwise the touches below would stay or add up
  for (const [b, q] of REST) b.quaternion.copy(q);
  mixer.update(dt);
  for (const [b, q] of REST) q.copy(b.quaternion);
  if (op.footLock) {                                   // keep the feet where they are planted (sitting down, rising), moving the root instead
    root.updateMatrixWorld(true); const m = B.footL.getWorldPosition(va).add(B.footR.getWorldPosition(vb)).multiplyScalar(0.5);
    root.position.add(vc.copy(op.footLock).sub(m));
  }
  root.updateMatrixWorld(true);
  if (op.carry) {                                      // a sloth in his hands: its armpits where the clip puts his hands, his hands under its arms
    const c = op.carry, sl = c.s.o, bone = (n) => sl.getObjectByName(n) || sl.getObjectByName(n.replace(/(L|R)$/, ".$1"));
    const hm = B.handL.getWorldPosition(va).add(B.handR.getWorldPosition(vb)).multiplyScalar(0.5);
    sl.updateMatrixWorld(true); const pL = bone("upper_armL").getWorldPosition(V()), pR = bone("upper_armR").getWorldPosition(V());
    const off = pL.clone().add(pR).multiplyScalar(0.5).sub(sl.position);
    const high = cur === acts.play_airplane, want = hm.clone().addScaledVector(UP, high ? 0.12 : -0.13).addScaledVector(csDir(0, 0, -1), high ? 0.05 : 0.12).sub(off);   // held out in front, its head below his chin (up overhead when it flies)
    sl.position.lerpVectors(c.from, want, c.k); sl.position.y += Math.sin(c.k * Math.PI) * 0.1; sl.quaternion.slerpQuaternions(c.q0, root.quaternion, c.k);
    sl.updateMatrixWorld(true); bone("upper_armL").getWorldPosition(pL); bone("upper_armR").getWorldPosition(pR);
    const side = pR.clone().sub(pL).normalize();
    reach("R", pR.addScaledVector(side, 0.03).addScaledVector(UP, -0.035), csDir(1, -0.8, 0.4), c.k);
    reach("L", pL.addScaledVector(side, -0.03).addScaledVector(UP, -0.035), csDir(-1, -0.8, 0.4), c.k);
  }
  // after the clip: hands (reach, the book, the hug), the head's look, blinks and a happy face
  const k = op.ik;
  if (k?.R) reach("R", k.R[0], csDir(1, -0.6, 0.2), k.R[1]);
  if (k?.L) reach("L", k.L[0], csDir(-1, -0.6, 0.2), k.L[1]);
  if (k?.book > 0) {                                   // the open book at reading distance, tilted up to his face, a hand under each half
    const sway = Math.sin(uTime.value * 0.7) * 0.012, c = cs(sway, 0.9, -0.34);
    book.position.copy(c); book.quaternion.copy(root.quaternion).multiply(tq.setFromEuler(new THREE.Euler(-0.62, 0, 0.03 * Math.sin(uTime.value * 0.5)))); book.visible = k.book > 0.4;
    book.updateMatrixWorld(true);
    // a hand behind each half at its lower outer corner, palm flat on the cover, fingers up and in along its back
    const e = k.book * k.book * (3 - 2 * k.book), bq = book.getWorldQuaternion(tq).clone(), bd = (x, y, z) => V(x, y, z).applyQuaternion(bq);
    for (const [sd, S] of [[1, "R"], [-1, "L"]]) {
      reach(S, V(sd * 0.11, -0.09, 0).applyMatrix4(book.matrixWorld), csDir(sd, -1, 0.2), e);
      turnHand(S, handQuat(S, bd(-sd * 0.45, 1, 0), bd(-sd * 0.3, 0, 1)), e);
    }
  }
  if (k?.hug > 0 && op.buddy) {                        // his arms round the sloth on his lap (or on his chest)
    const b = op.buddy.o, c = b.getWorldPosition(V()).addScaledVector(V(0, 1, 0).applyQuaternion(b.getWorldQuaternion(tq)), 0.09 * (op.buddy.sc || 2)), side = csDir(1, 0, 0), fr = csDir(0, 0, -1);
    reach("R", c.clone().addScaledVector(side, 0.12).addScaledVector(fr, 0.05), csDir(1, -0.5, 0.4), k.hug);
    reach("L", c.clone().addScaledVector(side, -0.12).addScaledVector(fr, 0.05), csDir(-1, -0.5, 0.4), k.hug);
  }
  if (k?.sleep && !k.hug) {                            // asleep: hands folded on the tummy, the near arm over a sloth beside him
    const breathe = Math.sin(uTime.value * 1.3) * 0.008;
    reach("R", cs(0.05, 1.0, -0.17 - breathe), csDir(1, 0, -0.2), 1); reach("L", cs(-0.05, 1.02, -0.17 - breathe), csDir(-1, 0, -0.2), 1);
    if (k.nap > 0 && op.buddy) {
      const sd = csDir(1, 0, 0).dot(BED.across) > 0 ? "R" : "L", sl = op.buddy.o.getWorldPosition(V()), sc = op.buddy.sc || 2;
      reach(sd, sl.addScaledVector(BED.across, 0.06 * sc).addScaledVector(UP, 0.13 * sc), UP.clone().addScaledVector(BED.across, 0.5), k.nap);
    }
    B.chest.rotateX(breathe * 4);
  }
  if (op.eat) {                                        // soup: the bowl on his left palm in front of him, his right spooning from it to his mouth
    const e = op.eat, at = op.seated ? cs(0.02, 0.74, -0.3) : cs(0.02, 1.0, -0.33);
    bowl.position.copy(at); bowl.quaternion.copy(root.quaternion);
    // the left hand flat under the bowl, palm up, fingers forward and across (the bowl's foot on the palm)
    const fL = csDir(0.55, 0, -0.85), qL = handQuat("L", fL, UP);
    reach("L", at.clone().addScaledVector(fL, -0.045).addScaledVector(UP, -0.025), csDir(-1, -0.7, 0.3), 1); turnHand("L", qL);
    // one spoonful about every 4 s: dip, lift to the lips, back down (only once he sits; walking he holds the bowl in both hands)
    const ph = (e.t % 4) / 4, sm = (a, b) => THREE.MathUtils.smoothstep(ph, a, b), up = e.spoon * (sm(0.3, 0.5) - sm(0.62, 0.82));
    // the spoon held overhand like a pencil, between thumb and index: its tip in the soup, then at his lips, the hollow kept level
    const tipDip = at.clone().addScaledVector(csDir(1, 0, 0), 0.03).addScaledVector(UP, 0.045 - 0.02 * Math.sin(Math.min(1, ph / 0.3) * Math.PI));
    const lips = B.head.getWorldPosition(V()).addScaledVector(csDir(0, 0, -1), 0.13).addScaledVector(csDir(1, 0, 0), 0.01).addScaledVector(UP, -0.09);
    const d = csDir(-0.5, -0.75, -0.45).normalize().lerp(csDir(-0.7, 0.1, 0.7).normalize(), up).normalize();   // grip to tip
    const qR = handQuat("R", d.clone().add(csDir(0, 0.6, -0.4).multiplyScalar(1 - up)).addScaledVector(UP, 0.25 * up).normalize(),   // fingers over the bowl, the spoon angled down from them
       csDir(-0.4, -1, 0).lerp(csDir(-0.3, -0.6, 0.6), up)), thumb = THUMB.R.clone().applyQuaternion(qR), fR = UP.clone().applyQuaternion(qR);
    const tip = tipDip.lerp(lips, up), grip = tip.clone().addScaledVector(d, -0.14);
    reach("R", grip.clone().addScaledVector(fR, -0.06).addScaledVector(thumb, -0.02), csDir(1, -0.8, 0.3), 1); turnHand("R", qR);
    spoon.position.copy(grip); { const z = UP.clone().addScaledVector(d, -UP.dot(d)).normalize(); spoon.quaternion.setFromRotationMatrix(mA.makeBasis(V().crossVectors(d, z), d, z)); }   // +Y along d, the hollow (+Z) up
    op.look = op.seated ? -0.28 * (1 - up) : 0;
  }
  if (op.inHand) {                                     // the bowl or mug in his right hand: at the palm, upright, tipped toward him at the sip
    const h = B.handR, p = op.inHand, a = acts.sip, tip = cur === a ? Math.min(1, Math.max(0, (a.time - 1.45) / 0.35)) : 0;
    h.getWorldPosition(p.position).addScaledVector(V(0, 1, 0).applyQuaternion(h.getWorldQuaternion(tq)), 0.06).addScaledVector(UP, -0.05).addScaledVector(csDir(0, 0, -1), 0.02);
    p.quaternion.copy(root.quaternion).multiply(qc.setFromAxisAngle(V(1, 0, 0), tip * 1.0));
  }
  // the head: a look down at a book or a sloth, round the camp, or at you when you're near and he's awake
  const camD = camera.position.distanceTo(root.position);
  if (!op.sleeping && !op.lying && (camD < 4 && op.look > -0.3 || talkSt.t > 0 && camD < 8)) {
    lookT = Math.min(1, lookT + dt * 2);
    const to = camera.position.clone().sub(B.head.getWorldPosition(V())).normalize(), f = csDir(0, 0, -1);
    if (to.dot(f) > -0.1) aimBone(B.neck, to.clone().lerp(UP, 0.82).normalize(), 0.5 * lookT), aimBone(B.head, to.clone().lerp(UP, 0.6).normalize(), 0.4 * lookT);
  } else lookT = Math.max(0, lookT - dt * 2);
  if (op.look) B.head.rotateX(op.look * 0.6), B.neck.rotateX(op.look * 0.3);
  // a wave back when you keep looking at him for 3 s (standing about, not busy)
  if (op.kind === "stroll" && cur === acts.idle && camD < 9) {
    const v = root.position.clone().add(V(0, 1.5, 0)).project(camera);
    op.gaze = Math.abs(v.x) < 0.25 && Math.abs(v.y) < 0.35 && v.z < 1 ? op.gaze + dt : 0;
    if (op.gaze > 3) { op.gaze = -12; const a = play("wave", 0.3, { once: true }); mixer.addEventListener("finished", function f(e) { if (e.action === a) { mixer.removeEventListener("finished", f); play("idle", 0.4); } }); }
  }
  // eyes: blink now and then; shut in his sleep (the blink clip held at its middle); a smile with a sloth
  const bl = acts.blink;
  if (op.sleeping) { bl.reset().play(); bl.time = bl.getClip().duration * 0.5; bl.timeScale = 0; }
  else { if (bl.timeScale === 0) { bl.timeScale = 1; bl.stop(); } blinkT -= dt; if (blinkT < 0) { bl.reset().play(); blinkT = R(2, 5); } }
  const smile = op.happy || (talkSt.smile > 0 && talkSt.t <= 0 && !op.sleeping);
  const hp = acts.happy; if (smile && !hp.isRunning()) { hp.reset().play(); hp.time = 1.5; hp.timeScale = 0; } else if (!smile && hp.isRunning()) hp.stop();
  // breathing in his sleep, and the Z's
  if (op.sleeping) { zk = (zk + dt / 3) % 1; B.head.getWorldPosition(zz.position).add(V(0.08 * Math.sin(zk * 6), 0.25 + 0.4 * zk, 0)); zz.material.opacity = Math.sin(Math.PI * zk) * 0.75; zz.scale.set(0.22 + 0.25 * zk, (0.22 + 0.25 * zk) / 4, 1); }
  else zz.material.opacity = 0;
  // the tap column follows his chest (seated or lying too), and the speech bubble follows his head
  B.chest.getWorldPosition(tapCol.position); tapCol.scale.y = op.seated || op.lying ? 0.6 : 1; tapCol.position.y -= op.seated || op.lying ? -0.05 : 0.3; talkStep(dt);   // seated: just his body above the log, so the log's own tap does not win
  // his shadow on the ground, and a nudge so you can't walk through him
  const sh = root.userData.shadow; sh.position.set(root.position.x, groundAt(root.position.x, root.position.z) + 0.012, root.position.z); sh.visible = !op.lying && !op.seated;
  if (!op.lying) { const dx = me.pos.x - root.position.x, dz = me.pos.z - root.position.z, d = Math.hypot(dx, dz), lim = RADIUS + 0.25; if (d < lim && d > 1e-3) me.pos.set(root.position.x + dx / d * lim, me.pos.y, root.position.z + dz / d * lim); }
}

// ---------------------------------------------------------------- talking to you: tap him for a few warm words
// (Adriaen: words of encouragement and love, to his life partner "bonita"). He looks at you while he speaks, his jaw moves (the talk clip) and he smiles
// after. A speech bubble over his head; lines come from a shuffled bag, so none repeats until all have been said.
const LINES = {   // spoken to his life partner, "bonita" (Adriaen, 2026-11-12)
  awake: [
    "You're doing great, bonita. You know that?", "I'm so glad it's you I get to share this with.", "Proud of you. Always, bonita.",
    "You mean more to me than you know.", "Whatever today was, you made it through. I'm right here.", "Be gentle with yourself today, my love.",
    "Small steps are still steps. I'll walk them with you.", "I love you, exactly as you are.", "My favourite part of the day? Seeing you.",
    "Take your time, bonita. Nobody rushes in our camp.", "You've got this. And if not, we'll figure it out together.",
    "The world's a bit warmer with you in it. Mine especially.", "Breathe in... and out. There you go, bonita.",
    "You don't have to carry it all alone. That's what I'm for.", "I believe in you. Always have.", "The sloths adore you. Not as much as I do.",
    "Rest a little, my love. You've earned it.", "You're braver than you feel right now, bonita.", "Look how far you've come. I'm so proud.",
    "It's okay to not be okay. I'm right here, always.",
  ],
  eat: ["I saved you the best bowl, bonita.", "Good food, and you beside me. That's all I need."],
  read: ["This book is good, but you're my favourite story.", "Every story has a hard chapter. Ours only gets better."],
  drink: ["Come sit with me, bonita. I made enough for two.", "A warm drink and you. Perfect evening."],
  warm: ["Come warm your hands with me, my love.", "The fire's nice, but you light up the whole camp."],
  play: ["Look at them, bonita! They get that smile from you.", "Want a turn? They love you almost as much as I do."],
  sleep: ["Mmm... love you too, bonita...", "Zz... you're doing fine, my love... zz", "Mm... come here... sleep well, bonita..."],
};
// the lines still to come are kept in the camp save (camp/save.js; Adriaen: a reload carries on where he left off); lines no longer in LINES drop out
const bag = (() => { try { const b = { ...(load("operator")?.lines || {}) }; for (const k in b) b[k] = Array.isArray(b[k]) ? b[k].filter((l) => LINES[k]?.includes(l)) : []; return b; } catch { return {}; } })();
function line() {
  // an activity's own lines only once he is actually at it (the bowl, the book, the mug, his hands at the fire, a sloth in his
  // hands), not on the walk there; asleep, only the sleepy ones; otherwise the general lines
  const doing = { eat: !!op.eat, read: op.ik?.book > 0.4, drink: !!op.inHand && op.inHand === mug, warm: op.kind === "warm" && !!op.ik?.R, play: !!op.carry }[op.kind];
  const k = op.sleeping ? "sleep" : (doing && Math.random() < 0.35 ? op.kind : "awake");
  if (!bag[k]?.length) bag[k] = [...LINES[k]].sort(() => Math.random() - 0.5);
  const l = bag[k].pop(); save("operator", { lines: bag }); return l;
}
const bubble = document.createElement("div");
bubble.style.cssText = "position:fixed;left:0;top:0;z-index:3;pointer-events:none;transform:translate(-50%,-100%) scale(.85);opacity:0;transition:opacity .35s,transform .35s;" +
  "max-width:min(260px,70vw);text-align:center;font:600 16px/1.3 var(--display);color:var(--ink);background:rgb(255 248 238 / .96);border-radius:18px;padding:9px 14px;box-shadow:0 3px 0 rgb(138 90 59 / .25)";
const tail = document.createElement("i"); tail.style.cssText = "position:absolute;left:50%;bottom:-7px;width:14px;height:14px;margin-left:-7px;background:inherit;transform:rotate(45deg);border-radius:0 0 3px 0";
const say = document.createElement("span"); bubble.append(say, tail); if (ON) document.body.append(bubble);
const talkSt = { t: 0, smile: 0 };
function talk() {
  const txt = line(); say.textContent = txt; talkSt.t = Math.min(7, 2.2 + txt.split(" ").length * 0.32); talkSt.smile = talkSt.t + 3;
  if (!op.sleeping) { const a = acts.talk; a.reset(); a.setLoop(THREE.LoopRepeat); a.setEffectiveWeight(1); a.play(); }
}
function talkStep(dt) {
  { const v = B.chest.getWorldPosition(V()).project(camera); op.scr = [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }   // checks (__op.tapAt)
  talkSt.t = Math.max(0, talkSt.t - dt); talkSt.smile = Math.max(0, talkSt.smile - dt);
  if (talkSt.t <= 0 && acts.talk.isRunning()) acts.talk.fadeOut(0.3);
  const on = talkSt.t > 0; bubble.style.opacity = on ? 1 : 0; bubble.style.transform = `translate(-50%,-100%) scale(${on ? 1 : 0.85})`;
  if (!on && bubble.style.opacity === "0") return;
  const v = B.head.getWorldPosition(V()).add(V(0, 0.34, 0)).project(camera);
  if (v.z > 1) { bubble.style.opacity = 0; return; }
  bubble.style.left = THREE.MathUtils.clamp((v.x + 1) / 2 * innerWidth, 140, innerWidth - 140) + "px";
  bubble.style.top = THREE.MathUtils.clamp((1 - v.y) / 2 * innerHeight, 120, innerHeight - 60) + "px";
}
// what a tap finds: an invisible column round him (the skinned mesh is too costly to ray-test); no glow, like the sloths
const tapCol = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.75, 6), new THREE.MeshBasicMaterial({ visible: false }));
if (ON) {
  scene.add(tapCol); const sph = new THREE.Sphere();
  addTarget(tapCol, () => ({ look: null, quiet: true, picks: [tapCol], at: (v) => { v.copy(tapCol.position); sph.center.copy(v); sph.radius = 0.6; return sph; },
    ready: () => camera.position.distanceTo(tapCol.position) < 7, options: () => [[op.sleeping ? "Whisper goodnight 🌙" : "Talk 💬", talk]] }));
}

// start: standing by the woodpile side of the fire, looking at it
if (ON) {
  const p = V(Math.cos(A0 + 0.9) * 2.6, 0, Math.sin(A0 + 0.9) * 2.6); root.position.copy(p); root.rotation.y = yawTo(p.clone().negate());
  play("idle", 0);
  window.__op = { root, op, acts, mixer, go: (k) => { op.next = k; },
    dbg: () => ({ inHand: op.inHand && [op.inHand === bowl ? 'bowl' : 'mug', op.inHand.visible, op.inHand.position.toArray().map((v) => +v.toFixed(2)), !!op.inHand.parent], w: Object.entries(acts).filter(([, a]) => a.isRunning()).map(([n, a]) => n + ':' + a.getEffectiveWeight().toFixed(2) + '@' + a.time.toFixed(2)) }),
    state: () => ({ kind: op.kind, at: root.position.toArray().map((v) => +v.toFixed(2)), place: op.place, seated: op.seated, lying: op.lying, sleeping: op.sleeping, buddy: op.buddy?.name ?? null, clip: cur?.getClip().name }),
    talk, tapCol, line: () => say.textContent, tapAt: () => op.scr,
    sim: (sec) => { for (let t = 0; t < sec; t += 0.05) opStep(0.05); return window.__op.state(); },   // run his life ahead (checks)
    tris: () => { let n = 0; root.traverse((m) => { if (m.isMesh) n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3; }); return n; },
    jump: (k) => { if (op.buddy) giveBack(); dropAll(); unhost(); release(); Object.assign(op, { seated: false, lying: false, sleeping: false, look: 0, footLock: null, carry: null }); root.rotation.set(0, root.rotation.y, 0); root.position.y = 0; play("idle", 0);
      it = (function* () { op.kind = k; yield* DO[k](); op.kind = "idle"; yield* lifeLoop(); })(); it.next(); } };
}

export { opStep };
