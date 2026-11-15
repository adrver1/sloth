// Canopy Camp operator, his head and face each frame: a look down at a book or a sloth, round the camp, or at you when you
// are near or talking to him (as far as a neck turns), a turn of his body to you, a wave back when you keep looking at
// him, blinks, eyes shut in his sleep, a smile, and the Z's over his head (one sprite).
// Exports buildSleepZ() (operator.js, after the hand props) and poseHead(dt) (step.js, each frame, after his hands).
import * as THREE from "three";
import { camera, rng } from "../stage.js";
const { R } = rng("operator.face");   // its own stream: blinks and fidgets follow frame timing, so they must not move his day's picks (review R2-122)
import { V, wrapPi } from "../util.js";
import { aimBone, gazeStep, makeZ, watched, zAt } from "../actor.js";
import { B, UP, clips, csDir, cur, play, root } from "./model.js";
import { handsBusy, op } from "./state.js";
import { turnToward, yawToYou } from "./walk.js";

let zz = null;
function buildSleepZ() { zz = makeZ(); zz.material.opacity = 0; }
const vHp = V(), vTo = V(), vF = V(), vDir = V(), vA = V(), vY = V(), vCam = V();   // scratch: no allocation per frame (review R2-019)
const ZS = { wob: 0.08, y0: 0.25, rise: 0.4, w0: 0.22, w1: 0.25 };   // how his z sways, rises and grows (actor.js zAt)
function poseHead(dt) {
  // the head: a look down at a book or a sloth, round the camp, or at you when you're near and he's awake
  const camD = camera.position.distanceTo(root.position);
  // While you talk to him he looks at you as far as a neck can turn: up to about 75° either side of where his body faces, then
  // held at that limit; with you behind him (past 120°) he doesn't try (Adriaen: don't break his neck). Otherwise a glance
  // when you're near.
  const talking = op.talk.t > 0 || op.talk.smile > 1.5;
  if (!op.sleeping && !op.lying && (camD < 4 && op.look > -0.3 || talking && camD < 9)) {
    const hp = B.head.getWorldPosition(vHp), to = vTo.copy(camera.position).sub(hp), f = csDir(0, 0, -1, vF).setY(0).normalize();
    let a = Math.atan2(to.x, to.z) - Math.atan2(f.x, f.z); a = wrapPi(a);
    const ok = Math.abs(a) < 2.1;
    op.anim.look = ok ? Math.min(1, op.anim.look + dt * 2) : Math.max(0, op.anim.look - dt * 2);
    if (op.anim.look > 0) {
      const lim = 1.3, ca = THREE.MathUtils.clamp(a, -lim, lim), hz = Math.hypot(to.x, to.z), dir = vDir.copy(f).applyAxisAngle(UP, ca).multiplyScalar(hz).setY(to.y).normalize();
      const w = talking ? 1 : 0.8;
      aimBone(B.neck, vA.copy(dir).lerp(UP, 0.8).normalize(), 0.55 * op.anim.look * w); aimBone(B.head, vA.copy(dir).lerp(UP, 0.55).normalize(), 0.5 * op.anim.look * w);
    }
  } else op.anim.look = Math.max(0, op.anim.look - dt * 2);
  const down = talking ? op.look * Math.max(0, 1 - op.anim.look) : op.look;   // he looks up from his bowl or book to you
  if (down) B.head.rotateX(down * 0.6), B.neck.rotateX(down * 0.3);
  // standing about with his hands free when you talk to him: he turns to you (walking, listen() stops him first)
  if (talking && !op.seated && !op.lying && cur === clips.idle && !handsBusy())
    turnToward(yawToYou(), dt, 1.2);
  // a wave back when you keep looking right at him for 3 s (standing about, not busy): the sloths' test (actor.js watched)
  // on his face, 1.5 m up. Looking away starts the 3 s over; a wave sets the timer 12 s back, so a gaze kept on him waves
  // again only after 15 s
  if (op.kind === "stroll" && cur === clips.idle && camD < 9) {
    op.gaze = gazeStep(op.gaze, watched(vA.copy(root.position).add(vY.set(0, 1.5, 0)), camera.getWorldDirection(vCam), 9), dt);
    if (op.gaze > 3) { op.gaze = -12; play("wave", 0.3, { once: true }); op.anim.wave = clips.wave.getClip().duration; }
  }
  // the wave's end: back to idle, unless something else (a walk) has taken over by then. A timer, not a "finished" listener:
  // that one also fired when a walk began in the wave's last moments, and leaked when the wave was faded out (review R2-068)
  if (op.anim.wave > 0 && (op.anim.wave -= dt) <= 0) { op.anim.wave = 0; if (cur === clips.wave) play("idle", 0.4); }
  // eyes: blink now and then; shut in his sleep (the blink clip paused at its middle); a smile with a sloth or after a line
  // (the happy clip paused 1.5 s in). Both are started and stopped only when they change: a paused or zero-speed action is
  // not isRunning() in three, so testing that every frame restarted the smile each frame and never stopped it (review R2-008).
  const bl = clips.blink;
  if (op.sleeping !== op.anim.shut) {
    op.anim.shut = op.sleeping;
    if (op.sleeping) { bl.reset(); bl.time = bl.getClip().duration * 0.5; bl.paused = true; bl.play(); } else bl.stop();
  }
  if (!op.sleeping) { op.anim.blink -= dt; if (op.anim.blink < 0) { bl.reset().play(); op.anim.blink = R(2, 5); } }
  const smile = op.happy || (op.talk.smile > 0 && op.talk.t <= 0 && !op.sleeping), hp = clips.happy;
  if (smile !== op.anim.smiling) {
    op.anim.smiling = smile;
    if (smile) { hp.reset(); hp.time = 1.5; hp.paused = true; hp.setEffectiveWeight(1); hp.play(); } else hp.fadeOut(0.3);
  }
  // breathing in his sleep, and the Z's
  if (op.sleeping) { op.anim.zz = (op.anim.zz + dt / 3) % 1; zAt(zz, B.head, op.anim.zz, ZS); zz.material.opacity = Math.sin(Math.PI * op.anim.zz) * 0.75; }
  else zz.material.opacity = 0;
}

export { buildSleepZ, poseHead };
