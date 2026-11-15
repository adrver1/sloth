// Canopy Camp sloths, the life every sloth has on top of its clip, wild or named (review 2026-11-12, P5, B4):
//   slothLife(s, dt)   (inside, for slothsStep, which sets the camera's view direction camDir once a frame) fur shells
//                      by distance (furStep), blinks, a look at you when you come close (LOOK_NEAR), a slow wave when
//                      you keep looking at it, the gift arm, the sinking head of a sleeper, a yawn, munching
//   slothsStep(dt)     each frame, for every sloth (main.js): its clip, slothLife, the squish of a boop and a nod
// Blinks draw from the sloths' day stream (core.js rng("slothDay")) as they happen.
import * as THREE from "three";
import { camera, rng, toStage } from "../stage.js";
const { R } = rng("slothDay");
import { V, sstep } from "../util.js";
import { LIVELY, SL, sloths } from "./state.js";
import { FACE, mouthOf, openMouth, yawnStep } from "./face.js";
import { aimBone, gazeStep, watched } from "../actor.js";
import { giftArm } from "./arms.js";

const FUR_NEAR = 8, FUR_FULL = 3, LOOK_NEAR = 4.5;
// the fur by distance (review R2-074): every layer of the detail level within FUR_FULL, two layers of the same length out to
// FUR_NEAR (fur.js lod), none beyond. A 0.3 m margin keeps it from flicking between two tiers at the line.
function furStep(s, d) {
  const t = s.furTier, tier = d > FUR_NEAR + (t > 0 ? 0.3 : 0) ? 0 : d > FUR_FULL + (t === 2 ? 0.3 : 0) ? 1 : 2;
  if (tier === t) return;
  s.furTier = tier;
  for (const m of s.shells) { m.visible = tier > 0; const L = m.userData.furLod; if (L) m.geometry = tier === 2 ? L.full : L.two; }
}
// scratch objects, reused every frame so slothLife allocates nothing; camDir is the camera's view direction, set once a
// frame by slothsStep for every sloth (review R2-083)
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), oq = new THREE.Quaternion();
const va = V(), vb = V(), vc = V(), wa = V(), wf = V(), camDir = V();
// a slow wave (Adriaen 2026-11-12): when you keep looking right at a sloth for about 3 s (it stays near the middle of your
// view, within 10 m) it looks back and slowly waves its right paw over its head, then waits a while before it waves again.
// Done on the bones after the clip, so it works whatever it is doing (hanging, sitting, driving), except asleep or on the move.
const GAZE_S = 3, WAVE_S = 4.6;
function slothLife(s, dt) {                            // after the clip: fur by distance, blinks, a look at you when you're close, a wave
  toStage(s.head.getWorldPosition(va)); const d = va.distanceTo(camera.position);
  furStep(s, d);
  if (!s.asleep) {
    s.blink -= dt;
    if (s.blink < 0) { s.eyes(true); if (s.blink < -0.14) { s.eyes(false); s.blink = R(2.5, 7); } }
  }
  const T = s.trip, still = !s.asleep && (!T || LIVELY.has(T.phase));
  // the gaze: how long you have kept it near the middle of your view
  s.gaze = gazeStep(s.gaze, still && watched(va, camDir, 10), dt, 1.5);
  s.waveCD -= dt;
  if (s.gaze > GAZE_S && s.waveCD <= 0 && !s.wave) { s.wave = 1e-3; s.waveCD = 15; s.gaze = 0; }
  if (s.wave) { s.wave += dt; if (s.wave > WAVE_S || !still) s.wave = 0; }
  const want = still && (d < LOOK_NEAR || s.wave) ? 1 : 0;
  s.look += (want - s.look) * Math.min(1, dt * 1.5);
  if (s.look >= 0.01) {
    const hq = s.head.getWorldQuaternion(qa), face = vb.copy(FACE).applyQuaternion(hq), to = vc.copy(camera.position).sub(va).normalize();
    const turn = qb.setFromUnitVectors(face, to), ang = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
    const w = s.look * 0.75 * Math.min(1, 1.2 / Math.max(ang, 1e-3));   // at most about 70 degrees, three quarters of the way
    qc.copy(hq); turn.slerp(qa.identity(), 1 - Math.min(1, w)).multiply(qc);   // the head's world turn, kept from above
    s.head.quaternion.copy(s.head.parent.getWorldQuaternion(qc).invert().multiply(turn));
  }
  if (s.wave && s.arm[1]) {                            // upper arm up and out beside the head, the forearm swinging slowly side to side
    const k = s.wave, e = sstep(0, 0.9, k) * (1 - sstep(WAVE_S - 0.9, WAVE_S, k));
    const left = s.spot?.bench && s.armL?.[1], arm = left ? s.armL : s.arm, sg = left ? -1 : 1;   // Sunny waves with its left: the right holds the s'more stick (Adriaen)
    s.o.getWorldQuaternion(oq);
    aimBone(arm[0], wa.set(0.55 * sg, 0.8, -0.25).normalize().applyQuaternion(oq), e);
    const sw = Math.sin((k - 0.9) * 2 * Math.PI * 0.55) * 0.5 * sstep(0.6, 1.2, k);
    aimBone(arm[1], wf.set((0.15 + sw) * sg, 1, -0.2).normalize().applyQuaternion(oq), e);
  }
  if (s.gift && !s.gift.clip && s.arm[1]) giftArm(s);
  else if (s.armRest) { s.arm[0].quaternion.copy(s.armRest[0]); s.arm[1].quaternion.copy(s.armRest[1]); s.armRest = null; }   // the clip may not write a still bone again
  // asleep (a doze, below): the head sinks; the curled-up clip already tucks it, so less then
  s.droop += ((s.dozing && s.asleep ? 1 : 0) - s.droop) * Math.min(1, dt * 0.8);
  if (s.droop > 0.01) s.head.rotation.x -= (s.act?.getClip().name === "curl" ? 0.12 : 0.4) * s.droop;
  if (s.yawn) yawnStep(s, dt);
  if (s.munch > 0) {                                   // munching what you fed it: the mouth opens and shuts a few times
    s.munch = Math.max(0, s.munch - dt); const m = mouthOf(s), o = s.munch > 0.1 ? Math.max(0, Math.sin(s.munch * 9)) : 0;
    m.visible = o > 0.08; openMouth(s, 0.75, o * 0.6); s.head.rotation.x += 0.08 * o;
  }
}
// each frame, for every sloth (main.js): its clip, its life on top of the clip, the squish of a boop and a nod
function slothsStep(dt) {
  camera.getWorldDirection(camDir);
  for (const s of sloths) {
    s.mixer.update(dt);
    slothLife(s, dt);
    if (s.squish > 0) { s.squish = Math.max(0, s.squish - dt * 1.4); const k = Math.sin(s.squish * Math.PI * 3) * s.squish * 0.18; const sc = s.sc || SL; s.o.scale.set(sc * (1 + k), sc * (1 - k), sc * (1 + k)); }
    if (s.nod > 0) { s.nod = Math.max(0, s.nod - dt); s.head.rotation.x += Math.sin(s.nod * 9) * 0.25 * Math.min(1, s.nod); }
  }
}

export { slothsStep };
