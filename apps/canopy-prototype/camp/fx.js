// Canopy Camp fx: the words, hearts and z's that float in the air over the camp (camp review sloths-32: they are not sloths).
//   sprite(text, size)               a sprite with the text painted on it. Its texture is made once per text and size and
//                                    kept (a handful of words and emoji); each sprite has its own material, for its own fade.
//                                    One painted before the Fredoka font has loaded is not kept, so the font shows once it is in
//   burst(at, text, n, life, size)   n of them drift up from `at` and fade over `life` seconds (boops, hellos); draws from the "fx" stream (core.js rng)
//   fx                               the list of what is in the air: { s, v, t, life } drifting, or { s, fly: { from, to }, t, life, done }
//                                    flying from one point to another (input.js: food on its way to a sloth; the operator's
//                                    food and vegetables, which are meshes, not sprites)
//   fxStep(dt)                       moves and fades them each frame and takes the finished ones out (main.js); a finished
//                                    sprite's material is disposed (its texture too when it is not kept), a mesh is only taken out
import * as THREE from "three";
import { rng, scene } from "./core.js";
const { R } = rng("fx");
import { V, canvasTex, ease } from "./util.js";

const TEX = new Map();   // "size|text" -> its 512x128 canvas texture (review R2-018: one used to be made per sprite and never freed)
const sprite = (txt, size = 96) => {
  const key = size + "|" + txt;
  let t = TEX.get(key), own = false;
  if (!t) {
    const font = `600 ${size}px Fredoka, Trebuchet MS, sans-serif`;
    t = canvasTex(512, 128, (g) => { g.font = font; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.strokeStyle = "rgba(74,52,38,.55)"; g.lineWidth = 10; g.strokeText(txt, 256, 68); g.fillText(txt, 256, 68); });
    if (document.fonts?.check(font) ?? true) TEX.set(key, t); else own = true;   // painted before Fredoka loaded: this sprite's own, freed with it
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.0, 0.25, 1); s.userData.fx = own ? "own" : true; return s;
};
const fx = [];
function burst(p, txt, n, life, size) { for (let i = 0; i < n; i++) { const s = sprite(txt, size); s.scale.multiplyScalar(n > 1 ? 0.45 : 0.6); s.position.copy(p); scene.add(s); fx.push({ s, v: V(R(-0.4, 0.4) * (n > 1), R(0.25, 0.55), R(-0.4, 0.4) * (n > 1)), t: 0, life }); } }
function fxStep(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.fly) { const k = ease(Math.min(1, f.t / f.life)); f.s.position.lerpVectors(f.fly.from, f.fly.to, k); f.s.position.y += Math.sin(k * Math.PI) * 0.4; }
    else { f.s.position.addScaledVector(f.v, dt); f.v.multiplyScalar(0.96); f.s.material.opacity = 1 - f.t / f.life; }
    if (f.t > f.life) { scene.remove(f.s); if (f.s.userData.fx) { if (f.s.userData.fx === "own") f.s.material.map.dispose(); f.s.material.dispose(); } fx.splice(i, 1); f.done?.(); }
  }
}

export { burst, fx, fxStep, sprite };
