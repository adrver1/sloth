// Canopy Camp operator, his head and face each frame: a look down at a book or a sloth, round the camp, or at you when you
// are near or talking to him (as far as a neck turns), a turn of his body to you, a wave back when you keep looking at
// him, blinks, eyes shut in his sleep, a smile, and the Z's over his head (one sprite).
// Exports buildSleepZ() (operator.js, after the hand props) and poseHead(dt) (step.js, each frame, after his hands).
import * as THREE from "three";
import { R, camera, scene } from "../core.js";
import { V } from "../util.js";
import { sprite } from "../sloths.js";
import { aimBone } from "./ik.js";
import { B, UP, clips, csDir, cur, mixer, play, root } from "./model.js";
import { op } from "./state.js";
import { turnToward, yawTo } from "./walk.js";

let zz = null;
function buildSleepZ() { zz = (() => { const z = sprite("z", 110); z.material.depthTest = true; z.material.opacity = 0; scene.add(z); return z; })(); }
function poseHead(dt) {
  // the head: a look down at a book or a sloth, round the camp, or at you when you're near and he's awake
  const camD = camera.position.distanceTo(root.position);
  // While you talk to him he looks at you as far as a neck can turn: up to about 75° either side of where his body faces, then
  // held at that limit; with you behind him (past 120°) he doesn't try (Adriaen: don't break his neck). Otherwise a glance
  // when you're near.
  const talking = op.talk.t > 0 || op.talk.smile > 1.5;
  if (!op.sleeping && !op.lying && (camD < 4 && op.look > -0.3 || talking && camD < 9)) {
    const hp = B.head.getWorldPosition(V()), to = camera.position.clone().sub(hp), f = csDir(0, 0, -1).setY(0).normalize();
    let a = Math.atan2(to.x, to.z) - Math.atan2(f.x, f.z); a = Math.atan2(Math.sin(a), Math.cos(a));
    const ok = Math.abs(a) < 2.1;
    op.anim.look = ok ? Math.min(1, op.anim.look + dt * 2) : Math.max(0, op.anim.look - dt * 2);
    if (op.anim.look > 0) {
      const lim = 1.3, ca = THREE.MathUtils.clamp(a, -lim, lim), hz = Math.hypot(to.x, to.z), dir = f.clone().applyAxisAngle(UP, ca).multiplyScalar(hz).setY(to.y).normalize();
      const w = talking ? 1 : 0.8;
      aimBone(B.neck, dir.clone().lerp(UP, 0.8).normalize(), 0.55 * op.anim.look * w); aimBone(B.head, dir.clone().lerp(UP, 0.55).normalize(), 0.5 * op.anim.look * w);
    }
  } else op.anim.look = Math.max(0, op.anim.look - dt * 2);
  const down = talking ? op.look * Math.max(0, 1 - op.anim.look) : op.look;   // he looks up from his bowl or book to you
  if (down) B.head.rotateX(down * 0.6), B.neck.rotateX(down * 0.3);
  // standing about with his hands free when you talk to him: he turns to you (walking, listen() stops him first)
  if (talking && !op.seated && !op.lying && cur === clips.idle && !op.ik && !op.eat && !op.inHand && !op.carry)
    turnToward(yawTo(V(camera.position.x - root.position.x, 0, camera.position.z - root.position.z)), dt, 1.2);
  // a wave back when you keep looking at him for 3 s (standing about, not busy)
  if (op.kind === "stroll" && cur === clips.idle && camD < 9) {
    const v = root.position.clone().add(V(0, 1.5, 0)).project(camera);
    op.gaze = Math.abs(v.x) < 0.25 && Math.abs(v.y) < 0.35 && v.z < 1 ? op.gaze + dt : 0;
    if (op.gaze > 3) { op.gaze = -12; const a = play("wave", 0.3, { once: true }); mixer.addEventListener("finished", function f(e) { if (e.action === a) { mixer.removeEventListener("finished", f); play("idle", 0.4); } }); }
  }
  // eyes: blink now and then; shut in his sleep (the blink clip held at its middle); a smile with a sloth
  const bl = clips.blink;
  if (op.sleeping) { bl.reset().play(); bl.time = bl.getClip().duration * 0.5; bl.timeScale = 0; }
  else { if (bl.timeScale === 0) { bl.timeScale = 1; bl.stop(); } op.anim.blink -= dt; if (op.anim.blink < 0) { bl.reset().play(); op.anim.blink = R(2, 5); } }
  const smile = op.happy || (op.talk.smile > 0 && op.talk.t <= 0 && !op.sleeping);
  const hp = clips.happy; if (smile && !hp.isRunning()) { hp.reset().play(); hp.time = 1.5; hp.timeScale = 0; } else if (!smile && hp.isRunning()) hp.stop();
  // breathing in his sleep, and the Z's
  if (op.sleeping) { op.anim.zz = (op.anim.zz + dt / 3) % 1; B.head.getWorldPosition(zz.position).add(V(0.08 * Math.sin(op.anim.zz * 6), 0.25 + 0.4 * op.anim.zz, 0)); zz.material.opacity = Math.sin(Math.PI * op.anim.zz) * 0.75; zz.scale.set(0.22 + 0.25 * op.anim.zz, (0.22 + 0.25 * op.anim.zz) / 4, 1); }
  else zz.material.opacity = 0;
}

export { buildSleepZ, poseHead };
