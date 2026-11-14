// Canopy Camp fx: the words, hearts and z's that float in the air over the camp (camp review sloths-32: they are not sloths).
//   sprite(text, size)               a sprite with the text painted on it (a new texture each time; nothing is cached)
//   burst(at, text, n, life, size)   n of them drift up from `at` and fade over `life` seconds (boops, hellos); draws from the "fx" stream (core.js rng)
//   fx                               the list of what is in the air: { s, v, t, life } drifting, or { s, fly: { from, to }, t, life, done }
//                                    flying from one point to another (input.js: food on its way to a sloth)
//   fxStep(dt)                       moves and fades them each frame and takes the finished ones out (main.js)
import * as THREE from "three";
import { rng, scene } from "./core.js";
const { R } = rng("fx");
import { V, canvasTex, ease } from "./util.js";

const sprite = (txt, size = 96) => {
  const t = canvasTex(512, 128, (g) => { g.font = `600 ${size}px Fredoka, Trebuchet MS, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.strokeStyle = "rgba(74,52,38,.55)"; g.lineWidth = 10; g.strokeText(txt, 256, 68); g.fillText(txt, 256, 68); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.0, 0.25, 1); return s;
};
const fx = [];
function burst(p, txt, n, life, size) { for (let i = 0; i < n; i++) { const s = sprite(txt, size); s.scale.multiplyScalar(n > 1 ? 0.45 : 0.6); s.position.copy(p); scene.add(s); fx.push({ s, v: V(R(-0.4, 0.4) * (n > 1), R(0.25, 0.55), R(-0.4, 0.4) * (n > 1)), t: 0, life }); } }
function fxStep(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.fly) { const k = ease(Math.min(1, f.t / f.life)); f.s.position.lerpVectors(f.fly.from, f.fly.to, k); f.s.position.y += Math.sin(k * Math.PI) * 0.4; }
    else { f.s.position.addScaledVector(f.v, dt); f.v.multiplyScalar(0.96); f.s.material.opacity = 1 - f.t / f.life; }
    if (f.t > f.life) { scene.remove(f.s); fx.splice(i, 1); f.done?.(); }
  }
}

export { burst, fx, fxStep, sprite };
