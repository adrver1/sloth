// Canopy Camp sloths, the bench sloth's s'mores: now and then, as its reach comes round, it holds a long stick out over the
// fire (the tip stays well clear of the flames), keeps it there while the marshmallow toasts golden, then draws it back
// and eats it. A stick (8 triangles) and a marshmallow (12), page-lit, one draw each, shown only while it toasts.
//   buildSmore()          makes the stick and the marshmallow and adds them to the scene, hidden (sloths.js, in its place
//                         in the build order)
//   smoreStep(s, dt)      each frame for the sloth on the seat while it is at home
//   stopSmore(s)          puts the stick away (it leaves its seat, or is borrowed)
// The wait until the next one draws from the sloths' day stream (core.js rng("slothDay")) as it happens.
import * as THREE from "three";
import { rng, scene, toStage } from "../stage.js";
const { R } = rng("slothDay");
import { V } from "../util.js";
import { play, playOnce } from "./clips.js";
import { UP } from "./poses.js";
import { mouthOf } from "./face.js";
import { pawOf } from "./arms.js";
import { chewStep } from "./eating.js";

let smoreStick = null, mallow = null;
const RAW = new THREE.Color(0xfff7ec), TOAST = new THREE.Color(0xd9984a), FIRE_AT = V(0, 0.8, 0), paw = V();
function buildSmore() {
  smoreStick = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, 1, 4, 1, true).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x7a5634 }));
  mallow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.06), new THREE.MeshLambertMaterial({ color: 0xfff7ec, emissive: 0x000000 }));
  smoreStick.visible = mallow.visible = false; scene.add(smoreStick, mallow);
}
function smoreStep(s, dt) {
  const act = s.act; if (!act) return;
  if (s.smore?.eating) return chewStep(s, mallow, s.smore.from, s.smore.at);
  if (act.getClip().name !== "reach") return;
  if (!s.smore) { s.smoreT -= dt; if (s.smoreT < 0 && act.time < 0.3 && !s.dozing) s.smore = { hold: 0 }; else return; }
  const sm = s.smore;
  if (act.time >= 3.9 && sm.hold < 9) { act.timeScale = 0; sm.hold += dt; sm.held = true; } else act.timeScale = 1;
  toStage(pawOf(s, paw));
  const to = FIRE_AT.clone().sub(paw), L = Math.max(0.3, Math.min(1.15, to.length() - 0.7));
  smoreStick.position.copy(paw); smoreStick.quaternion.setFromUnitVectors(UP, to.normalize()); smoreStick.scale.set(1, L, 1);
  mallow.position.copy(paw).addScaledVector(to, L - 0.03); mallow.quaternion.copy(smoreStick.quaternion);
  mallow.material.color.lerpColors(RAW, TOAST, Math.min(1, sm.hold / 9));
  smoreStick.visible = mallow.visible = true;
  if (sm.held && sm.hold >= 9 && act.time > 5.6) {    // drawn back in: it slides the marshmallow off the stick and eats it (no words: Adriaen)
    smoreStick.visible = false; sm.eating = true; sm.from = mallow.position.clone(); sm.at = 2.4; mallow.userData.base = V(1, 1, 1);
    playOnce(s, "eat", 0.8, () => { mallow.visible = false; mouthOf(s).visible = false; s.smore = null; s.smoreT = R(25, 45); play(s, "reach", 1.5); }, 2.4);
  }
}
function stopSmore(s) { if (!s.smore) return; s.smore = null; s.smoreT = R(20, 40); smoreStick.visible = mallow.visible = false; if (s.mouth) s.mouth.visible = false; if (s.act) s.act.timeScale = 1; }

export { buildSmore, smoreStep, stopSmore };
