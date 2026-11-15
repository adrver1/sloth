// The cast's sounds, in every level (Adriaen 2026-11-15: "bring over as much as possible from one location to the other"):
// hears what the sloths and the operator did since the last frame and plays it (camp/audio/sfx.js SFX), so the cast's own
// modules need no sound calls. The sloths: a squeak when booped, munching, a yawn, a squeak when one waves, two when it greets
// another, the slow breath of the nearest sleeper. Him: his words, a sip, a page, a snore, the clink of a bowl or the pot, the
// stirring stick on the pot and a vegetable's plop, and his footsteps where the level has them (steps: the camp; none at the
// summit, Adriaen 2026-11-15 "remove both footsteps").
// Exports hearCast(dt, { sloths, op, ear, steps }) (the camp's audio/watch.js and summit/life.js, each frame while the sound
// runs): sloths the sloths to hear, op the operator's api (or null), ear the camera (the sleeper must be near it). The cast
// keeps its positions in the stage's frame (stage.js), so each sound's position is taken into the world (toWorld).
// It allocates nothing on a quiet frame: a sound's position is made only when it plays (review R2-085).
import * as THREE from "three";
import { SOUP_POT, toWorld } from "../stage.js";
import { rand as R } from "../util.js";   // R: a number between a and b from Math.random
import { ac } from "./context.js";
import { SFX } from "./sfx.js";

const tmp = new THREE.Vector3(), hd = new THREE.Vector3(), eye = new THREE.Vector3();
const was = new WeakMap(), opWas = { line: "", clip: "", kind: "", veg: false };
let stirT = 0, opT = 0, opStepD = 0, sleepT = 4, opClinkT = 3, opPageT = 6, opSnoreT = 2;
const opLast = new THREE.Vector3(); let opSeen = false;   // where he was last frame
const potAt = () => toWorld(new THREE.Vector3(SOUP_POT.at.x, SOUP_POT.at.y, SOUP_POT.at.z));
const slothAt = (s) => s.o.getWorldPosition(new THREE.Vector3()).setY(s.o.getWorldPosition(tmp).y + 0.25);   // the sloth's mesh is in the scene: world already

function hearSloths(dt, sloths, ear) {
  for (const s of sloths) {
    let w = was.get(s); if (!w) was.set(s, (w = { squish: 0, munch: 0, yawn: 0, wave: 0, gift: null, phase: null }));
    if (s.squish > w.squish + 0.5) SFX.boop(slothAt(s));
    if ((s.munch || 0) > w.munch + 0.5) SFX.munch(slothAt(s), s.munch);
    if (s.gift && !w.gift) setTimeout(() => ac && SFX.munch(slothAt(s), 2.4), 600);
    if (s.yawn && !w.yawn) SFX.yawn(slothAt(s), R(0.95, 1.1));
    if (s.wave && !w.wave) SFX.squeak(slothAt(s), 1.15);
    const ph = s.trip?.phase ?? null; if (ph === "greet" && w.phase !== "greet" && Math.random() < 0.7) { const p = slothAt(s); SFX.squeak(p, 0.95); setTimeout(() => ac && SFX.squeak(p, 1.1), 260); }
    w.squish = s.squish || 0; w.munch = s.munch || 0; w.yawn = s.yawn || 0; w.wave = s.wave || 0; w.gift = s.gift || null; w.phase = ph;
  }
  // the nearest sleeping sloth breathes slowly, if you are close enough to hear it
  if ((sleepT -= dt) < 0) { sleepT = R(3.2, 4.2); ear.getWorldPosition(eye); let best = null, bd = 4; for (const s of sloths) if (s.asleep) { const d = s.o.getWorldPosition(tmp).distanceTo(eye); if (d < bd) { bd = d; best = s; } } if (best) SFX.breath(slothAt(best)); }
}
function hearOperator(dt, O, steps) {
  const p = O.root.position;   // in the stage's frame
  if (steps && opSeen) { const d = Math.hypot(p.x - opLast.x, p.z - opLast.z); if (d < 0.5) { opStepD += d; if (opStepD > 0.64) { opStepD = 0; SFX.step(toWorld(p.clone().setY(0.05))); } } }
  opLast.copy(p); opSeen = true;
  // cooking (op.stir, op.veg in operator/state.js): the stirring stick knocks the pot, vegetables plop in
  const o = O.op;
  if (o?.stir && (stirT -= dt) < 0) { stirT = R(0.6, 1.1); SFX.knock(potAt()); SFX.bubble(); }
  if (opWas.veg && !o?.veg) SFX.plop(potAt());
  opWas.veg = !!o?.veg;
  if ((opT -= dt) > 0) return; opT = 0.1;
  const st = O.state(), line = O.line?.() || "", head = toWorld(hd.copy(p).setY(p.y + 1.6));   // ten times a second; each sound gets its own copy
  if (line && line !== opWas.line) SFX.babble(head.clone(), line.split(/\s+/).length, st.lying || st.sleeping);
  if (st.clip === "sip" && opWas.clip !== "sip") SFX.slurp(head.clone().setY(head.y - 0.15));
  if (st.clip?.startsWith("play") && Math.random() < 0.08) SFX.squeak(head.clone().setY(head.y + 0.3), 1.2);
  if (st.seated && (st.kind === "eat" || st.kind === "cook") && (opClinkT -= 0.1) < 0) { opClinkT = R(2, 4); SFX.clink(head.clone().setY(head.y - 0.5)); }
  if (st.kind === "cook" && !st.seated && (opClinkT -= 0.1) < 0) { opClinkT = R(1.2, 2.5); SFX.clink(potAt()); }
  if (st.seated && st.kind === "read" && (opPageT -= 0.1) < 0) { opPageT = R(8, 15); SFX.page(head.clone().setY(head.y - 0.5)); }
  if (st.sleeping && (opSnoreT -= 0.1) < 0) { opSnoreT = R(3.6, 4.4); SFX.breath(head.clone().setY(toWorld(tmp.copy(p)).y + 0.6), true); }
  opWas.line = line; opWas.clip = st.clip || ""; opWas.kind = st.kind;
}
export function hearCast(dt, { sloths, op = null, ear, steps = false }) {
  if (!ac || ac.state !== "running") return;
  hearSloths(dt, sloths, ear);
  if (op) hearOperator(dt, op, steps);
}
