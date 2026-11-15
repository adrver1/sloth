// The jeep's sounds, the same in both levels (Adriaen 2026-11-15: "the engine sounds of the car are missing in the mountain
// level"): its doors and the hood as they open and shut, and its engine (car.js: off → crank → run): a click of the key and the
// starter cranking, the engine catching with a rev, a steady idle while it runs, and a few last chugs as it dies.
// hearJeep(J, engine) each frame while the sound runs (the camp's audio/watch.js; the summit's audio.js): J is the jeep's rig
// api (jeepRig.js: doors, node), engine car.js carApi.engine() ("off" with no car). Allocates nothing on a quiet frame.
import * as THREE from "three";
import { ac, BROWN, env, filt, gain, noise, osc, spot } from "./context.js";
import { SFX } from "./sfx.js";

const was = { door: [], engine: "off" };
function hearJeep(J, engine = "off") {
  if (!J?.doors || ac?.state !== "running") return;
  for (let i = 0; i < J.doors.length; i++) { const d = J.doors[i], o = d.open; if (was.door[i] !== undefined && o !== was.door[i]) SFX.door(d.o.getWorldPosition(new THREE.Vector3()), o); was.door[i] = o; }
  if (engine !== was.engine) {
    const at = J.node.localToWorld(new THREE.Vector3(0, 0.7, 1.2));   // the engine bay, wherever the jeep stands (the summit's is high up)
    if (engine === "crank") ENGINE.crank(at);
    if (engine === "run") ENGINE.idle(at, true);
    if (engine === "off") ENGINE.stop(at);
  }
  was.engine = engine;
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
export { hearJeep };
