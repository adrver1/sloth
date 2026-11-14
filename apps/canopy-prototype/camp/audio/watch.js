// Canopy Camp sound, watching the camp: audioStep(dt, dusk), each frame, moves the ear to the camera, sets the beds for the
// weather and the hour, and hears what the camp did since the last frame (a sloth squished, munching, yawning or waving;
// the operator's steps, speech, cooking, reading and snores; the jeep's doors and engine; your own steps), so the other
// modules need no sound calls. It reads the chores (chores.js acts), the operator (operator.js opApi) and the car
// (car.js carApi) once main.js has built them.
import * as THREE from "three";
import { SOUP_POT } from "../layout.js";
import { acts } from "../chores.js";   // the pot's stage (null until main.js has built the chores)
import { camera } from "../core.js";
import { carApi } from "../car.js";   // the engine (null with ?jeep=none, or until main.js has built the car)
import { jeepApi } from "../jeep.js";
import { me } from "../player.js";
import { opApi } from "../operator.js";   // his sounds (null with ?op=0, or until main.js has built him)
import { sloths } from "../sloths.js";
import { weather } from "../weather.js";
import { rand as R } from "../util.js";   // a number between a and b from Math.random
import { ac, BROWN, env, filt, gain, noise, osc, spot } from "./context.js";
import { night, rain, SFX, underTent, wind } from "./sfx.js";
import { musicObj, musicPan, musicTick } from "./music.js";

const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3();

// ---------------------------------------------------------------- watching the camp: who did what since the last frame
const was = new WeakMap(), opWas = { line: "", clip: "", kind: "", door: [] };
let potStage = null, stirT = 0, nextBird = 3, nextFrog = 5, nextOwl = 30, crackleT = 0, bubbleT = 0, dripT = 0, gustT = 0, gust = 0.5, opT = 0, opStepD = 0, meStepD = 0, opLast = null, meLast = null, sleepT = 4, opClinkT = 3, opPageT = 6, opSnoreT = 2;
const potAt = () => new THREE.Vector3(SOUP_POT.at.x, SOUP_POT.at.y, SOUP_POT.at.z);
const slothAt = (s) => s.o.getWorldPosition(new THREE.Vector3()).setY(s.o.getWorldPosition(tmp).y + 0.25);
function watchSloths(dt) {
  for (const s of sloths) {
    const w = was.get(s) || { squish: 0, munch: 0, yawn: 0, wave: 0, gift: null, phase: null };
    if (s.squish > w.squish + 0.5) SFX.boop(slothAt(s));
    if ((s.munch || 0) > w.munch + 0.5) SFX.munch(slothAt(s), s.munch);
    if (s.gift && !w.gift) setTimeout(() => ac && SFX.munch(slothAt(s), 2.4), 600);
    if (s.yawn && !w.yawn) SFX.yawn(slothAt(s), R(0.95, 1.1));
    if (s.wave && !w.wave) SFX.squeak(slothAt(s), 1.15);
    const ph = s.trip?.phase ?? null; if (ph === "greet" && w.phase !== "greet" && Math.random() < 0.7) { const p = slothAt(s); SFX.squeak(p, 0.95); setTimeout(() => ac && SFX.squeak(p, 1.1), 260); }
    Object.assign(w, { squish: s.squish || 0, munch: s.munch || 0, yawn: s.yawn || 0, wave: s.wave || 0, gift: s.gift || null, phase: ph }); was.set(s, w);
  }
  // the nearest sleeping sloth breathes slowly, if you are close enough to hear it
  if ((sleepT -= dt) < 0) { sleepT = R(3.2, 4.2); let best = null, bd = 4; for (const s of sloths) if (s.asleep) { const d = s.o.getWorldPosition(tmp).distanceTo(camera.position); if (d < bd) { bd = d; best = s; } } if (best) SFX.breath(slothAt(best)); }
}
function watchOperator(dt) {
  const O = opApi; if (!O) return;
  const p = O.root.position, head = tmp.copy(p).setY(p.y + 1.6).clone();
  if (opLast) { const d = Math.hypot(p.x - opLast.x, p.z - opLast.z); if (d < 0.5) { opStepD += d; if (opStepD > 0.64) { opStepD = 0; SFX.step(p.clone().setY(0.05)); } } }
  opLast = p.clone();
  // cooking (op.stir, op.veg in operator/state.js): the stirring stick knocks the pot, vegetables plop in
  const o = O.op || {}, pot = potAt();
  if (o.stir && (stirT -= dt) < 0) { stirT = R(0.6, 1.1); SFX.knock(pot); SFX.bubble(); }
  if (opWas.veg && !o.veg) SFX.plop(pot);
  opWas.veg = !!o.veg;
  if ((opT -= dt) > 0) return; opT = 0.1;
  const st = O.state(), line = O.line?.() || "";
  if (line && line !== opWas.line) SFX.babble(head, line.split(/\s+/).length, st.lying || st.sleeping);
  if (st.clip === "sip" && opWas.clip !== "sip") SFX.slurp(head.clone().setY(head.y - 0.15));
  if (st.clip?.startsWith("play") && Math.random() < 0.08) SFX.squeak(head.clone().setY(head.y + 0.3), 1.2);
  if (st.seated && (st.kind === "eat" || st.kind === "cook") && (opClinkT -= 0.1) < 0) { opClinkT = R(2, 4); SFX.clink(head.clone().setY(head.y - 0.5)); }
  if (st.kind === "cook" && !st.seated && (opClinkT -= 0.1) < 0) { opClinkT = R(1.2, 2.5); SFX.clink(new THREE.Vector3(SOUP_POT.at.x, SOUP_POT.at.y, SOUP_POT.at.z)); }
  if (st.seated && st.kind === "read" && (opPageT -= 0.1) < 0) { opPageT = R(8, 15); SFX.page(head.clone().setY(head.y - 0.5)); }
  if (st.sleeping && (opSnoreT -= 0.1) < 0) { opSnoreT = R(3.6, 4.4); SFX.breath(head.clone().setY(p.y + 0.6), true); }
  Object.assign(opWas, { line, clip: st.clip || "", kind: st.kind });
}
function watchJeep() {
  const J = jeepApi; if (!J?.doors) return;
  J.doors.forEach((d, i) => { const o = d.open; if (opWas.door[i] !== undefined && o !== opWas.door[i]) SFX.door(d.o.getWorldPosition(new THREE.Vector3()), o); opWas.door[i] = o; });
  // the engine (car.js: off → crank → run): a click of the key and the starter cranking, the engine catching with a rev,
  // a steady idle while it runs, and a few last chugs as it dies when you turn it off
  const st = carApi?.engine() ?? "off", was = opWas.engine ?? "off", at = J.node.getWorldPosition(new THREE.Vector3()).setY(0.7);
  if (st !== was) {
    if (st === "crank") ENGINE.crank(at);
    if (st === "run") { ENGINE.idle(at, true); }
    if (st === "off" && was !== "off") ENGINE.stop(at);
  }
  opWas.engine = st;
}
// the jeep's engine: a low sawtooth with a sub, through a low-pass, pulsed at the firing rate by an LFO
const ENGINE = {
  click(at) { const t = ac.currentTime, g = gain(spot(at, 1), 0); env(g, t, 0.001, 0.12, 0.04); noise(t, 0.05, filt("bandpass", 3200, 2, g)); },
  crank(at) {   // the starter motor: "rr-rr-rr-rr", about 1.1 s
    ENGINE.click(at); const t = ac.currentTime + 0.08, out = spot(at, 1.5), g = gain(out, 0);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.08); g.gain.setValueAtTime(0.28, t + 0.95); g.gain.linearRampToValueAtTime(0.0001, t + 1.1);
    const lp = filt("lowpass", 900, 1, g), am = gain(lp, 0.5); const o = osc("sawtooth", 140, t, 1.15, am); o.frequency.linearRampToValueAtTime(175, t + 1);
    osc("sine", 6.5, t, 1.15, gain(am.gain, 0.5)).frequency.linearRampToValueAtTime(8.5, t + 1);   // the compression strokes
    noise(t, 1.15, filt("bandpass", 1800, 1.5, gain(g, 0.25)));
  },
  idle(at, catching) {
    if (ENGINE.on) return; const t = ac.currentTime, out = spot(at, 1.8), g = gain(out, 0), lp = filt("lowpass", 380, 1.2, g), am = gain(lp, 0.6);
    const f0 = catching ? 70 : 34;   // it catches high, revs, and settles to idle
    const o = osc("sawtooth", f0, t, 1e5, am), sub = osc("square", f0 / 2, t, 1e5, gain(lp, 0.35)), lfo = osc("sine", f0 * 0.75, t, 1e5, gain(am.gain, 0.5));
    for (const x of [o, sub]) x.frequency.setTargetAtTime(x === o ? 34 : 17, t + 0.25, 0.35);
    lfo.frequency.setTargetAtTime(25, t + 0.25, 0.35);
    const rumble = noise(t, 1e5, filt("lowpass", 220, 0.7, gain(g, 0.5)), BROWN);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.12); g.gain.setTargetAtTime(0.16, t + 0.4, 0.4);   // the rev, then a quiet idle
    ENGINE.on = { g, nodes: [o, sub, lfo, rumble] };
  },
  stop(at) {
    const e = ENGINE.on; ENGINE.on = null; ENGINE.click(at); if (!e) return; const t = ac.currentTime;
    for (const n of e.nodes) if (n.frequency) n.frequency.setTargetAtTime(n.frequency.value * 0.45, t, 0.35);   // it runs down
    e.g.gain.cancelScheduledValues(t); e.g.gain.setValueAtTime(e.g.gain.value, t); e.g.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    e.nodes.forEach((n) => n.stop(t + 1));
    const c = gain(spot(at, 1.5), 0); env(c, t + 0.85, 0.01, 0.12, 0.25); osc("sine", 70, t + 0.85, 0.3, c).frequency.exponentialRampToValueAtTime(40, t + 1.1);   // a last shudder
  },
};

function audioStep(dt, dusk = 0) {
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime, wet = weather.wet, day = 1 - dusk;
  // the ear: the camera
  const L = ac.listener; camera.getWorldPosition(tmp); camera.getWorldDirection(fwd); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (L.positionX) { L.positionX.value = tmp.x; L.positionY.value = tmp.y; L.positionZ.value = tmp.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z; }
  else { L.setPosition(tmp.x, tmp.y, tmp.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  if (musicObj && musicPan) { musicObj.getWorldPosition(tmp); if (musicPan.positionX) { musicPan.positionX.value = tmp.x; musicPan.positionY.value = tmp.y; musicPan.positionZ.value = tmp.z; } else musicPan.setPosition(tmp.x, tmp.y, tmp.z); }
  // beds
  if ((gustT -= dt) < 0) { gustT = R(2, 5); gust = R(0.3, 1); }
  wind.g.gain.setTargetAtTime((0.05 + 0.06 * gust) * (1 - 0.5 * dusk) * (1 - 0.6 * wet), t, 1.2);
  rain.g.gain.setTargetAtTime(0.065 * wet, t, 0.8);
  const under = wet > 0.05 && underTent(me.pos);
  rain.drips.gain.setTargetAtTime(under ? 0.2 : 1, t, 0.3); rain.roof.gain.setTargetAtTime(under ? 1 : 0, t, 0.3);
  if (wet > 0.05 && (dripT -= dt) < 0) { dripT = R(0.02, 0.12) / wet; SFX.drip(false); if (under) { SFX.drip(true); if (Math.random() < 0.6) SFX.drip(true); } }
  night.g.gain.setTargetAtTime(THREE.MathUtils.smoothstep(dusk, 0.4, 0.9) * (1 - 0.6 * wet), t, 1.5);
  if ((crackleT -= dt) < 0) { crackleT = R(0.03, 0.35); SFX.crackle(Math.random() < 0.04); }
  // the pot (activities.js soup, read through acts.cook): quiet when empty, a faint simmer of water, a lively bubble while
  // it cooks, a gentle one when it's soup; water pouring in (yours or his) when it fills. Without that, a gentle simmer.
  const stage = acts?.cook?.stage ?? "ready", rate = { empty: 0, water: 0.6, cooking: 6, ready: 2 }[stage] ?? 2;
  if (potStage === "empty" && stage === "water") SFX.pour(potAt());
  if (potStage === "water" && stage === "cooking") SFX.plop(potAt());
  potStage = stage;
  if (rate && (bubbleT -= dt) < 0) { bubbleT = R(0.4, 1.6) / rate; SFX.bubble(); }
  if ((nextBird -= dt) < 0) { nextBird = R(2.5, 8) / Math.max(0.15, day * (1 - 0.7 * wet)); if (day > 0.3 && Math.random() < day * (1 - 0.7 * wet)) SFX.bird(); }
  if ((nextFrog -= dt) < 0) { nextFrog = R(2, 7); if (dusk > 0.6 || wet > 0.5) SFX.frog(); }
  if ((nextOwl -= dt) < 0) { nextOwl = R(25, 60); if (dusk > 0.8) SFX.owl(); }
  // life
  watchSloths(dt); watchOperator(dt); watchJeep();
  if (meLast) { const d = Math.hypot(me.pos.x - meLast.x, me.pos.z - meLast.z); if (d < 0.5 && !me.seat) { meStepD += d; if (meStepD > 0.78) { meStepD = 0; SFX.step(null, true); } } }
  meLast = me.pos.clone();
  musicTick();
}

export { audioStep };
