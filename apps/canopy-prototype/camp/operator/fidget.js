// Canopy Camp operator, little things he does while standing or sitting about with his hands free (Adriaen 2026-11-13: more
// organic): scratch his beard, stretch, look round, point something out up in the trees, shift his weight; at dusk and at
// night rub his hands, yawn. Each is a pose laid over the clip for a few seconds, eased in and out.
// Exports fidgetStep(dt) (step.js, each frame, after his hands' pose) and FID_T (how long each lasts, s).
import * as THREE from "three";
import { rng, uNight } from "../core.js";
const { R } = rng("operator");
import { V } from "../util.js";
import { B, UP, clips, csDir, cur, reach } from "./model.js";
import { op } from "./state.js";

const FID_T = { scratch: 3, stretch: 3.4, look: 5.5, point: 3.2, shift: 4.5, rub: 3.5, yawn: 3 };
function pickFid() {
  const late = uNight.value > 0.3, w = late ? { rub: 2, yawn: 1.5, scratch: 1, look: 1, stretch: 0.6, shift: 1 }
    : { scratch: 2, stretch: 1.2, look: 2, point: op.seated ? 0.4 : 1.1, shift: 1.5 };
  let r = R(0, Object.values(w).reduce((a, b) => a + b, 0)); for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k; return "look";
}
function fidget(F, e) {
  const t = F.t, head = B.head.getWorldPosition(V()), fw = csDir(0, 0, -1), sd = csDir(1, 0, 0);
  switch (F.kind) {
    case "scratch": reach("R", head.clone().addScaledVector(fw, 0.13).addScaledVector(UP, -0.12).addScaledVector(sd, 0.015 + 0.012 * Math.sin(t * 13)), csDir(1, -0.5, 0.2), e);
      B.head.rotateX(0.12 * e); B.head.rotateZ(-0.06 * e); break;   // fingers in his beard, chin up a little
    case "stretch": for (const [S, x] of [["R", 1], ["L", -1]]) reach(S, head.clone().addScaledVector(UP, 0.42).addScaledVector(sd, 0.17 * x).addScaledVector(fw, -0.02), csDir(x, 0, 0.3), e);
      B.chest.rotateX(0.1 * e); B.head.rotateX(0.18 * e); break;   // both arms up over his head, leaning back
    case "look": { const a = Math.sin(t * 0.8) * 0.9 * e; B.neck.rotateY(a * 0.45); B.head.rotateY(a * 0.45); break; }   // a slow look round
    case "point": reach("R", head.clone().addScaledVector(fw, 0.42).addScaledVector(UP, 0.36).addScaledVector(sd, 0.24), csDir(1, -0.3, 0), e);
      B.head.rotateX(0.35 * e); B.head.rotateY(-0.2 * e); break;   // "look, up there"
    case "shift": B.chest.rotateZ(0.07 * Math.sin(t * 1.1) * e); B.head.rotateZ(-0.04 * Math.sin(t * 1.1) * e); break;   // weight from foot to foot
    case "rub": { const c = head.clone().addScaledVector(fw, 0.3).addScaledVector(UP, -0.42), r = 0.02 * Math.sin(t * 10);
      reach("R", c.clone().addScaledVector(sd, 0.03 + r), csDir(1, -0.6, 0.2), e); reach("L", c.clone().addScaledVector(sd, -0.03 + r), csDir(-1, -0.6, 0.2), e); break; }   // warming his hands
    case "yawn": reach("L", head.clone().addScaledVector(fw, 0.12).addScaledVector(UP, -0.06), csDir(-1, -0.5, 0.2), e);
      B.head.rotateX(0.3 * e); B.neck.rotateX(0.1 * e); break;   // a hand over his mouth, head back
  }
}
function fidgetStep(dt) {
  const handsFree = !op.talk.hand && !op.ik && !op.eat && !op.inHand && !op.carry && !op.pail && !op.stir && !op.veg && !op.lying && !op.sleeping && !op.lean && !op.footLock === !op.seated;
  const still = cur === clips.idle || cur === clips.seated_idle;
  op.cd.fid -= dt;
  if (!op.fid && handsFree && still && op.talk.t <= 0 && op.cd.fid < 0) { const kind = pickFid(); op.fid = { kind, t: 0, k: 0, T: FID_T[kind] }; op.cd.fid = R(5, 12); }
  if (op.fid) {
    const F = op.fid; F.t += dt; const on = handsFree && still && F.t < F.T;
    F.k = on ? Math.min(1, F.k + dt * 1.6) : Math.max(0, F.k - dt * 2.2);
    if (!on && F.k <= 0) op.fid = null; else fidget(F, THREE.MathUtils.smoothstep(F.k, 0, 1));
  }
}

export { FID_T, fidgetStep };
