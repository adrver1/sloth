// Canopy Camp main: the Rest button and the night palette, then the frame loop with the fps panel and the resolution safety net.
// camp.html loads this file; it imports the other camp modules in order, so they run top to bottom as one script did before.
import * as THREE from "three";
import { stepLight } from "../bakedlight.js";
import { WARM_N } from "../fur.js";
import "./input.js";   // run after the module before it, as one script did
import { $, D, DETAIL, R, S, camera, qs, renderer, scene, sun, uTime } from "./core.js";
import { stickV } from "./hud.js";
import { dome, moon, nightDome, sky, uSkyDusk } from "./sky.js";
import { GLADE, RC, V, sloPath } from "./forest.js";
import { fireLight, flames, glowTex, lanternGlow, lanterns, motes, pools, rayMat, uNight } from "./campProps.js";
import { jeepStep } from "./jeep.js";
import { SL, SLOTH_WARM, campStep, fx, slothLife, sloths } from "./sloths.js";
import { collide, me, step } from "./player.js";
import { acts, atmo, groundLife } from "./campLife.js";
import { boop, feed, resize } from "./input.js";

let pr = renderer.getPixelRatio();   // the resolution, lowered by the safety net in the loop
// rest: dusk falls, the lanterns and the fire glow brighter, fireflies come out
const hemiL = scene.children.find((o) => o.isHemisphereLight);
const DAY = { fog: new THREE.Color(S.fog[0]), hemi: hemiL.intensity, sun: sun.intensity, sky: hemiL.color.clone(), ground: hemiL.groundColor.clone(), sunC: sun.color.clone(), dens: scene.fog.density };
// night (camp review B1): deep blue-teal fog and backdrop, the forest in cool moonlight and near-black under the canopy, so the
// fire, the lanterns and the tent are the only warm colours. Warm near, cool far. The sky light from below is warm firelight off
// the ground, so the undersides of things (a sloth overhead) catch a little glow instead of going black.
const DUSK = new THREE.Color(0x0e1c2b), NIGHT_SKY = new THREE.Color(0x4a66a0), NIGHT_GROUND = new THREE.Color(0x4a2c16), MOONC = new THREE.Color(0x9fb4e6), BACK_NIGHT = new THREE.Color(0.08, 0.12, 0.22);
// the moon: up in the canopy gap, in front of you as you start (you face the fire), a little to the side
{ const f = me.pos.clone().setY(0).negate().normalize(), sd = V(-f.z, 0, f.x); moon.position.copy(f.multiplyScalar(11)).addScaledVector(sd, 3).setY(21); }
let dusk = 0, duskTo = 0;
const flies = (() => {
  const n = 120, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = R(0, 6.28), r = R(2, RC + 6); p.set([Math.cos(a) * r, R(0.4, 7), Math.sin(a) * r], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xd8ff7a, size: 0.14, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); scene.add(pts); return pts;
})();
$("rest").onclick = () => { duskTo = duskTo ? 0 : 1; $("rest").textContent = duskTo ? "Wake up ☀️" : "Rest 🌙"; };
flies.visible = false;   // atmosphere.js draws blinking fireflies instead

// ================================================================ loop, with an fps panel and a resolution safety net
addEventListener("resize", resize); resize();
camera.far = 80;
if (qs.has("pos")) { const [x, z] = qs.get("pos").split(",").map(Number); me.pos.set(x, 0, z); }
if (qs.has("yaw")) me.yaw = +qs.get("yaw"); if (qs.has("pitch")) me.pitch = +qs.get("pitch");
const clock = new THREE.Clock(); let frames = 0, acc = 0, slow = 0;
window.__stats = {};
let shadowTick = -1, shadowN = -1;
// compile every shader before the first frame (camp review P2), so the first look round doesn't stutter; then lift the card
await renderer.compileAsync(scene, camera).catch(() => {});
$("loadbar").style.width = "100%"; $("load").classList.add("done"); setTimeout(() => $("load").remove(), 700);
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05); uTime.value += dt;
  step(dt);
  for (const s of sloths) {
    s.mixer.update(dt);
    slothLife(s, dt);
    if (s.squish > 0) { s.squish = Math.max(0, s.squish - dt * 1.4); const k = Math.sin(s.squish * Math.PI * 3) * s.squish * 0.18; const sc = s.sc || SL; s.o.scale.set(sc * (1 + k), sc * (1 - k), sc * (1 + k)); }
    if (s.nod > 0) { s.nod = Math.max(0, s.nod - dt); s.head.rotation.x += Math.sin(s.nod * 9) * 0.25 * Math.min(1, s.nod); }
  }
  campStep(dt);
  jeepStep(dt);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.fly) { const e = Math.min(1, f.t / f.life), k = e * e * (3 - 2 * e); f.s.position.lerpVectors(f.fly.from, f.fly.to, k); f.s.position.y += Math.sin(k * Math.PI) * 0.4; }
    else { f.s.position.addScaledVector(f.v, dt); f.v.multiplyScalar(0.96); f.s.material.opacity = 1 - f.t / f.life; }
    if (f.t > f.life) { scene.remove(f.s); fx.splice(i, 1); f.done?.(); }
  }
  const fl = 0.85 + 0.15 * Math.sin(uTime.value * 13) * Math.sin(uTime.value * 7.3);
  flames.forEach((s, i) => { s.scale.setScalar((0.9 - i * 0.2) * fl * (1 + 0.3 * dusk)); s.position.y = 0.45 + i * 0.14 + Math.sin(uTime.value * (5 + i)) * 0.03; });
  fireLight.intensity = (D.fx ? 6 : 0) * fl * (1 + 1.5 * dusk);
  acts.update(dt, uTime.value);
  uNight.value = dusk; stepLight(fl, uTime.value);
  { const W = SLOTH_WARM, n = Math.min(lanternGlow.length, WARM_N - 1);   // the sloths' night glow: lanterns, then the fire
    for (let i = 0; i < n; i++) { W.uWarmPos.value[i].copy(lanternGlow[i]); W.uWarmK.value[i] = 0.15; }
    W.uWarmPos.value[WARM_N - 1].set(0, 0.6, 0); W.uWarmK.value[WARM_N - 1] = 0.9 * fl; W.uWarm.value = dusk; } pools.visible = dusk > 0 && !groundLife.isNightBaked(); pools.material.opacity = dusk * (0.9 + 0.1 * fl);
  lanterns.forEach((s, i) => { s.material.opacity = 0.45 + 0.5 * dusk; s.position.y = lanternGlow[i].y + Math.sin(uTime.value * 1.2 + i) * 0.015; });
  dusk += Math.sign(duskTo - dusk) * Math.min(Math.abs(duskTo - dusk), dt * 0.25);
  if (dusk || duskTo) {
    scene.fog.color.copy(DAY.fog).lerp(DUSK, dusk); scene.fog.density = DAY.dens * (1 + 0.6 * dusk);
    hemiL.intensity = DAY.hemi * (1 - 0.72 * dusk); hemiL.color.copy(DAY.sky).lerp(NIGHT_SKY, dusk); hemiL.groundColor.copy(DAY.ground).lerp(NIGHT_GROUND, dusk);
    sun.intensity = DAY.sun * (1 - 0.62 * dusk); sun.color.copy(DAY.sunC).lerp(MOONC, dusk);                      // the sun turns into cool moonlight
    sky.material.color.setRGB(1, 1, 1).lerp(BACK_NIGHT, dusk); uSkyDusk.value = Math.min(1, dusk * 1.3); dome.material.color.setScalar(1 - 0.75 * dusk); scene.background.set(S.sky[0]).lerp(DUSK, dusk);
    nightDome.visible = moon.visible = dusk > 0.01; nightDome.material.opacity = Math.min(1, dusk * 1.3); moon.material.opacity = Math.max(0, dusk * 1.5 - 0.5); flies.material.opacity = dusk; flies.rotation.y += dt * 0.02;
    if (typeof rayMat !== "undefined") rayMat.opacity = S.rays * (1 - dusk) * (0.85 + 0.15 * Math.sin(uTime.value * 0.21) * Math.sin(uTime.value * 0.13 + 1.0));   // a slow shimmer as leaves move over the gap
  }
  if (motes) motes.rotation.y += dt * 0.02;
  atmo.update(dt, uTime.value, dusk);
  // sun shadows (ground.js castShadows): re-cast whenever the props in the clearing change, checked each second for the first half minute while they load
  if (uTime.value < 30 && Math.floor(uTime.value) !== shadowTick) { shadowTick = Math.floor(uTime.value); const n = groundLife.casters().length; if (n !== shadowN) { shadowN = n; groundLife.castShadows(renderer); } }
  renderer.render(scene, camera);
  frames++; acc += raw;
  if (acc >= 1) {
    const fps = frames / acc, i = renderer.info.render;
    slow = fps < 45 ? slow + 1 : 0;
    if (slow >= 2 && pr > 1) { pr = Math.max(1, pr - 0.25); renderer.setPixelRatio(pr); resize(); slow = 0; }
    Object.assign(window.__stats, { fps: Math.round(fps), calls: i.calls, tris: i.triangles, pr, detail: DETAIL });
    $("perf").innerHTML = `${Math.round(fps)} fps<br>${i.calls} draws · ${(i.triangles / 1000).toFixed(0)}k tris`;
    frames = 0; acc = 0;
  }
});
window.__me = me; window.__boop = (i) => boop(sloths[i]); window.__feed = (i) => feed(sloths[i]); window.__rest = () => { duskTo = 1; dusk = 1; };
window.__face = (i) => { const s = sloths[i]; const flat = V(s.p.x, 0, s.p.z); me.pos.copy(flat.clone().multiplyScalar(Math.max(0, 1 - 2.2 / flat.length()))); collide(me.pos); step(0); const d = s.p.clone().add(V(0, -0.2, 0)).sub(camera.position); me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); me.lastDrag = 1e9; };
window.__stick = (x, y) => stickV.set(x, y);
window.__slothS = sloths.map((s) => s.p.toArray().map((v) => +v.toFixed(1)));
window.__scene = scene; window.__glade = { at: GLADE, path: sloPath.pts };
window.__ready = true;

