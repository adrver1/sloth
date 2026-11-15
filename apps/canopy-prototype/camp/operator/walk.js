// Canopy Camp operator, getting about: a path round the blockers (the sloths' planner when it is there), steering round the
// others walking about, stopping to listen when you speak to him, turning on the spot, and sitting down on a seat and
// rising from it with his feet planted. All generators: an activity script runs them with yield*, one step a frame.
// Turning, stepping and the walker ahead are actor.js's (turnYaw, stepAlong, ahead), with his own rates.
// Exports turnToward(yaw, dt, rate) (his turn, at most rate rad/s), yawToYou() (the yaw from him to the camera), wait(s, until), walkTo(to, { near }),
// face(yaw), faceFire(), sitOn(seat), standUp().
import { camera } from "../core.js";
import { V, yawTo } from "../util.js";
import { blockers } from "../campProps.js";
import { me } from "../player.js";
import { groundHeight as groundAt } from "../terrain.js";   // 0 across the camp floor
import { cur, play, root } from "./model.js";
import { RADIUS, op } from "./state.js";
import { eachMover } from "../places.js";
import { slothLife } from "../sloth/hooks.js";   // undefined with ?campsloths=0
import { ahead, stepAlong, turnYaw } from "../actor.js";

const WALK = 1.05, STRIDE = 1.28;                      // his walking speed, m/s; the walk clip's feet move 1.28 m a cycle
const tmp = V(), vW = V(), vS = V(), vWas = V(), vYou = V();   // scratch: a walking frame allocates nothing (review R2-019)
function pathTo(to) {
  const p = slothLife?.path(root.position, to);
  if (p?.length) return p.map((q) => q.clone());
  return [to.clone()];                                // no planner: straight there, steering round what's in the way
}
const turnToward = (yaw, dt, rate = 4) => turnYaw(root.rotation, "y", yaw, 1, rate * dt);
function* wait(s, until) { let t = 0; while (t < s) { if (until?.()) return; t += yield; } }
function* walkTo(to, { near = 0.12 } = {}) {
  const pts = pathTo(to); let stuck = 0, waited = 0;
  play("walk", 0.3, { speed: 0.9 });
  while (pts.length) {
    const dt = yield, p = root.position, goal = pts[0], d = tmp.set(goal.x - p.x, 0, goal.z - p.z), dist = d.length();
    if (op.talk.t > 0 && !op.carry) { yield* listen(); play("walk", 0.3, { speed: 0.9 }); continue; }   // spoken to: stop, turn to you, then walk on
    if (dist < (pts.length > 1 ? 0.3 : near)) { pts.shift(); continue; }
    const want = vW.copy(d).normalize();
    // keep clear of blockers (unless the goal is inside one: a seat, the bed) and of everyone walking about
    for (const { at: c, r: br } of blockers) {
      const ox = p.x - c.x, oz = p.z - c.z, od = Math.hypot(ox, oz), lim = br + RADIUS + 0.15;
      if (od < lim && Math.hypot(to.x - c.x, to.z - c.z) > br) { const k = (lim - od) / lim * 1.6 / od; want.x += ox * k; want.z += oz * k; }
    }
    let block = null;
    eachMover((mp, mr) => {
      if (mp === root.position) return;
      const n = ahead(p, want, mp, mr + RADIUS + 0.9); if (!n) return;
      const { x: ox, z: oz, d: od } = n;
      if (n.ahead > 0.3 && od < mr + RADIUS + 0.45 && !(mp === camera.position && me.seat)) block = [ox / od, oz / od];   // you sitting: he goes by in front of you
      if (n.ahead > 0) { const k = 0.6 * n.ahead / od; want.x -= oz * k; want.z += ox * k; }   // keep right of them
    });
    want.normalize();
    let speed = WALK * Math.min(1, dist / 0.4 + 0.35);
    // someone in the way: a short pause, then he steps round them and walks on past (Adriaen: he queued behind slow sloths,
    // and they waited for him too, so a jam formed); he keeps to the side he started overtaking on
    if (block) { waited += dt; if (waited < 0.6) speed = 0; else { if (op.pass) { op.pass.t = 1.6; op.pass.d = block; } else op.pass = { side: 1, t: 1.6, d: block }; if (waited > 4) { op.pass.side *= -1; waited = 0.6; } } } else waited = 0;   // no way past on that side (a table, someone sitting): try the other
    if (op.pass && waited >= 0.6 || op.pass?.t > 0 && !block) {   // overtaking: committed to the side step for 1.6 s, then back on his line
      op.pass.t -= dt; want.addScaledVector(vS.set(-op.pass.d[1], 0, op.pass.d[0]), 1.4 * op.pass.side * Math.min(1, op.pass.t + 0.4)).normalize(); speed = WALK * 0.8;
      if (op.pass.t <= 0 && !block) op.pass = null;
    }
    const turn = turnToward(yawTo(want), dt, 3.2); if (turn > 1.2) speed *= 0.3;
    const was = vWas.copy(p); stepAlong(p, root.rotation.y, speed * dt); p.y = groundAt(p.x, p.z);
    cur.timeScale = Math.max(0.35, speed / STRIDE);    // the clip's feet move 1.28 m a cycle: match it, so they don't slide
    stuck = was.distanceTo(p) < 0.15 * dt && !block ? stuck + dt : 0;
    if (stuck > 3) { pts.splice(0, pts.length, ...pathTo(to)); stuck = 0; }
  }
  play("idle", 0.4);
}
function* listen() {                                   // stop and turn to you while you talk, then a moment before going on
  play("idle", 0.3);
  yield* face(yawToYou());
  while (op.talk.t > 0) { const dt = yield; turnToward(yawToYou(), dt, 1.2); }
  yield* wait(0.6);
}
function* face(yaw) {                                  // turn on the spot with small steps (the walk clip, slow), easing in and out
  let d = Math.abs(Math.atan2(Math.sin(yaw - root.rotation.y), Math.cos(yaw - root.rotation.y))); if (d < 0.05) return;
  const prev = cur, a = play("walk", 0.25, { speed: 0.45 });
  for (let t = 0; ; ) { const dt = yield; t += dt; const left = turnToward(yaw, dt, 2.2 * Math.min(1, 0.3 + t * 1.5, 0.25 + d)); d = left; if (left < 0.02) break; }
  play(prev === a ? "idle" : prev?.getClip().name ?? "idle", 0.3);
}

// sitting: the clips keep his root under his hips, so seated his feet are 0.43 m ahead of it and standing they are under it.
// He walks to where his feet will be (in front of the seat, his back to it), and sits down with the stand_up clip played
// backwards while a foot lock (op.footLock, step.js opStep) keeps his feet planted, so his hips travel back onto the seat; he
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

const yawToYou = () => yawTo(vYou.set(camera.position.x - root.position.x, 0, camera.position.z - root.position.z));
function* faceFire() { yield* face(yawTo(V(-root.position.x, 0, -root.position.z))); }   // the fire is at the camp's origin
export { face, faceFire, sitOn, standUp, turnToward, wait, walkTo, yawToYou };
