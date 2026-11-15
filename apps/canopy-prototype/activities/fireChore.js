// Camp activities, chunk 1: wood on the fire. Take a log from the wood pile, carry it to the fire and tap: the fire flares
// for about a minute, then settles over a few minutes and never goes out. Up to three logs burn at once; each leans into the
// teepee, burns at full for HOLD s, then chars and shrinks over SETTLE s and is gone. The camp sloth nearest the fire blinks
// happily. A quick shower of sparks when a log goes on (a fixed pool of 24 quads in one draw, atmosphere.js pool).
// Triangles: 24 a burning log; the plain stack for ?lived=0 six logs. Placed round fire, wherever layout.js puts it.
// Exports MAX_LOGS, createWoodPile (the plain stack, when the props' pile is not there) and createFireChore({ scene, fire,
// glowTex, boostFire }): { burning, level(), flare (0 to 3, eased), addLog(), update(dt) }. The fire itself
// belongs to the camp: update() hands boostFire(wide, tall, light) the factors and the camp applies them (camp/chores.js).
// The sloth's blink is asked for with camp/events.js EV.cheer; sloths.js picks the sloth.
import * as THREE from "three";
import { timers, yawTo } from "../camp/util.js";
import { pool } from "../atmosphere.js";
import { EV, emit } from "../camp/events.js";
import { logGeo, logMat } from "./parts.js";

const HOLD = 60, SETTLE = 180;
export const MAX_LOGS = 3;

// the wood pile: the props thread's pile when it is there (built), else a plain stack of the same logs in the same spot.
// Returns where it is and, for the plain stack, the object that lights up
export function createWoodPile({ scene, woodPile, addBlocker }) {
  const at = woodPile.at.clone();
  let stand = null;
  if (!woodPile.built) {
    const yaw = yawTo(at), g = new THREE.Group();
    [[-0.13, 0.06], [0, 0.06], [0.13, 0.06], [-0.065, 0.17], [0.065, 0.17], [0, 0.28]].forEach(([x, y]) => { const l = new THREE.Mesh(logGeo, logMat); l.rotation.z = Math.PI / 2; l.rotation.y = Math.PI / 2; l.position.set(x, y, 0); g.add(l); });
    g.position.copy(at); g.rotation.y = yaw; scene.add(g); stand = g; addBlocker(at, 0.5);
  }
  return { at, stand };
}

export function createFireChore({ scene, fire, glowTex, boostFire }) {
  const burning = [];
  const ANG = [0.4, 2.5, 4.6];
  // one material per slot, made on its first log and kept: each log chars on its own, and no clone is left behind when it
  // burns away (made then, not now, so it takes the wood texture parts.js may set after this is built)
  const mats = [];
  const later = timers();   // the sloth's blink a moment after the log goes on, in frame time (review R2-050)
  function addLog() {
    const slot = [0, 1, 2].find((k) => !burning.some((b) => b.slot === k)), a = ANG[slot];
    const mat = (mats[slot] ??= logMat.clone()); mat.color.setScalar(1);
    const m = new THREE.Mesh(logGeo, mat);
    m.position.set(fire.x + Math.cos(a) * 0.24, fire.y + 0.2, fire.z + Math.sin(a) * 0.24); m.lookAt(fire.x, fire.y + 0.55, fire.z); m.rotateX(Math.PI / 2); scene.add(m);
    burning.push({ m, t: 0, slot }); pop = 1;
    for (let i = 0; i < 14; i++) spark();
    // the camp sloth nearest the fire turns to it with a slow, happy blink
    later.after(0.9, () => emit(EV.cheer, { at: fire, max: 6, words: ["*happy blink*"], life: 2.2 }));
  }
  const level = () => burning.reduce((s, b) => s + (b.t < HOLD ? 1 : Math.max(0, 1 - (b.t - HOLD) / SETTLE)), 0);
  const sparks = pool(scene, 24, glowTex, THREE.AdditiveBlending, 5); sparks.mat.uniforms.tint.value.set(0xffb35a);
  let pop = 0, flare = 0;
  function spark() {
    const a = Math.random() * 6.28, out = 0.2 + Math.random() * 0.5;
    sparks.add({ x: fire.x + Math.cos(a) * 0.1, y: fire.y + 0.45, z: fire.z + Math.sin(a) * 0.1, vx: Math.cos(a) * out, vy: 1.4 + Math.random() * 1.4, vz: Math.sin(a) * out,
      t: 0, life: 0.8 + Math.random() * 0.8, size: 0.07, alpha: 1, spin: 0 });
  }
  return {
    burning, level, addLog,
    get flare() { return flare; },
    update(dt) {
      later.step(dt);
      // burning logs char and shrink as they settle; the fire's size follows how many are burning
      for (let i = burning.length - 1; i >= 0; i--) { const b = burning[i]; b.t += dt; const k = b.t < HOLD ? 0 : Math.min(1, (b.t - HOLD) / SETTLE);
        b.m.material.color.setScalar(1 - 0.75 * Math.min(1, b.t / 40)); b.m.scale.set(1 - 0.5 * k, 1 - 0.7 * k, 1 - 0.5 * k);
        if (k >= 1) { scene.remove(b.m); burning.splice(i, 1); } }
      flare += (level() - flare) * Math.min(1, dt * 1.5); pop = Math.max(0, pop - dt * 0.8);
      const f = 1 + 0.08 * flare + 0.12 * pop, w = 1 + 0.17 * flare + 0.15 * pop;   // wider more than taller: the pot hangs just over the flames
      boostFire(w, f, 1 + 0.45 * flare + 0.4 * pop);
      if (flare > 0.3 && Math.random() < dt * 3 * flare) spark();
      const L = sparks.live;
      for (let i = L.length - 1; i >= 0; i--) { const s = L[i]; s.t += dt; if (s.t > s.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vy -= dt * 0.9; s.vx *= 0.985; s.vy *= 0.985; s.vz *= 0.985; s.size = 0.07 * (1 - s.t / s.life); }
      sparks.flush();
    },
  };
}
