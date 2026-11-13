// Canopy Camp main: the Rest button and the night palette, then the frame loop with the fps panel and the resolution safety net.
// camp.html loads this file; it imports the other camp modules in order, so they run top to bottom as one script did before.
import * as THREE from "three";
import { stepLight } from "../bakedlight.js";
import { WARM_N } from "../fur.js";
import { $, D, DETAIL, OPT, R, S, camera, renderer, scene, sun, uTime } from "./core.js";
import { stickV } from "./hud.js";
import { dome, moon, nightDome, sky, uSkyDusk } from "./sky.js";
import { GLADE, RC, V, sloPath } from "./forest.js";
import { fireLight, flames, glowTex, lanternGlow, LANTERNS, motes, pools, rayMat, uNight } from "./campProps.js";
import { jeepStep } from "./jeep.js";
import { SL, SLOTH_WARM, campStep, fx, slothLife, sloths } from "./sloths.js";
import { collide, me, step } from "./player.js";
import { acts, atmo, groundLife } from "./campLife.js";
import { opStep } from "./operator.js";
import { aimStep, boop, feed, resize } from "./input.js";
import { weather } from "./weather.js";
import { lingerStep } from "./linger.js";
import { day } from "./daytime.js";
import { clockStep } from "./clock.js";
import { audioStep } from "./audio.js";
import { radioStep } from "./radio.js";
import { jeepSeatStep } from "./jeepSeat.js";
import { carStep } from "./car.js";

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
let dusk = 0;
// the time of day (Adriaen 2026-11-12: a slider in the ⚙️ menu replaces the Rest button, and the day cycle is optional).
// Hours 0..24; the light follows the hour shown, which eases forward to the hour set (about 3 h a second), so moving the
// slider from noon to night passes through golden hour, and from night to morning through the dawn mist. With the cycle on,
// a day takes 12 minutes. ?time=21.5 sets the hour, ?cycle=1 starts the cycle.
const sm = THREE.MathUtils.smoothstep, HOUR_S = 30;
const duskOf = (h) => h >= 20.5 || h < 5.5 ? 1 : h < 7.5 ? 1 - sm(h, 5.5, 7.5) : h < 17 ? 0 : h < 19 ? 0.45 * sm(h, 17, 19) : 0.45 + 0.55 * sm(h, 19, 20.5);
const goldOf = (h) => sm(h, 16.3, 17.6) * (1 - sm(h, 18.9, 19.8));                       // low warm sun before dusk
const mistOf = (h) => sm(h, 5, 6.3) * (1 - sm(h, 7.8, 10.5));                            // dawn mist, burnt off by mid-morning
const clockText = (h) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60 / 15) * 15).padStart(2, "0")}`;
const showTime = () => { $("time").value = String(day.set); $("clock").textContent = clockText(day.set); $("cycle").textContent = "Day cycle: " + (day.cycle ? "on" : "off"); };
day.listeners.push(showTime);   // the clock prop (clock.js) sets the hour too
$("time").oninput = () => day.setHour(Number($("time").value));
$("cycle").onclick = () => day.setCycle(!day.cycle);
showTime();
// golden hour and dawn mist (camp review B7): on the way to Rest the light lingers in a warm golden band (dusk 0.12 .. 0.5:
// low amber sun, honey fog, the light shafts turn gold and brighten); on waking, a pale mist lies over the clearing and burns
// off slowly over half a minute. Both are only colour and a few soft sprites, so nothing to bake.
const RAIN_FOG = new THREE.Color(0x7d8c86), BACK_RAIN = new THREE.Color(0.72, 0.78, 0.8), BACK_DAWN = new THREE.Color(1.25, 1.3, 1.36), BACK_GOLD = new THREE.Color(1.15, 0.82, 0.5), GOLD_SUN = new THREE.Color(0xffa040), GOLD_FOG = new THREE.Color(0xc89a62), DAWN_FOG = new THREE.Color(0xc8ccd6), RAY_DAY = new THREE.Color(0xffffff), RAY_GOLD = new THREE.Color(0xffb050);
let mist = 0, gold = 0, clockTick = 0;
const mistSprites = (() => {   // low banks of mist over the clearing floor, each a big soft sprite; they follow the ground when it gets height
  const g = new THREE.Group(), n = D.fx ? 16 : 8, mat = new THREE.SpriteMaterial({ map: glowTex, color: 0xe6ebf2, transparent: true, opacity: 0, depthWrite: false, fog: false });
  for (let i = 0; i < n; i++) { const a = R(0, 6.28), r = Math.sqrt(R(0.05, 1)) * (RC + 1), sp = new THREE.Sprite(mat), x = Math.cos(a) * r, z = Math.sin(a) * r;
    sp.scale.set(R(5, 8), R(1.2, 1.8), 1); sp.position.set(x, (window.__groundHeight?.(x, z) ?? 0) + R(0.35, 0.7), z); sp.userData = { a, r, w: R(0.01, 0.025) * (i % 2 ? 1 : -1) }; g.add(sp); }
  g.visible = false; scene.add(g); return g;
})();
const flies = (() => {
  const n = 120, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = R(0, 6.28), r = R(2, RC + 6); p.set([Math.cos(a) * r, R(0.4, 7), Math.sin(a) * r], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xd8ff7a, size: 0.14, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); scene.add(pts); return pts;
})();
flies.visible = false;   // atmosphere.js draws blinking fireflies instead

// ================================================================ loop, with an fps panel and a resolution safety net
addEventListener("resize", resize); resize();
camera.far = 80;
if (OPT.pos) { const [x, z] = OPT.pos; me.pos.set(x, 0, z); }   // ?pos=, ?yaw=, ?pitch=: the start view (core.js OPT)
if (OPT.yaw !== null) me.yaw = OPT.yaw; if (OPT.pitch !== null) me.pitch = OPT.pitch;
const clock = new THREE.Clock(); let frames = 0, acc = 0, slow = 0;
window.__stats = {};
let shadowTick = -1, shadowN = -1;
// compile every shader before the first frame (camp review P2), so the first look round doesn't stutter; then lift the card
await renderer.compileAsync(scene, camera).catch(() => {});
$("loadbar").style.width = "100%"; $("load").classList.add("done"); setTimeout(() => $("load").remove(), 700);
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05); uTime.value += dt;
  jeepSeatStep(dt); lingerStep(dt); step(dt);
  for (const s of sloths) {
    s.mixer.update(dt);
    slothLife(s, dt);
    if (s.squish > 0) { s.squish = Math.max(0, s.squish - dt * 1.4); const k = Math.sin(s.squish * Math.PI * 3) * s.squish * 0.18; const sc = s.sc || SL; s.o.scale.set(sc * (1 + k), sc * (1 - k), sc * (1 + k)); }
    if (s.nod > 0) { s.nod = Math.max(0, s.nod - dt); s.head.rotation.x += Math.sin(s.nod * 9) * 0.25 * Math.min(1, s.nod); }
  }
  campStep(dt);
  opStep(dt);
  jeepStep(dt); carStep(dt);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.fly) { const e = Math.min(1, f.t / f.life), k = e * e * (3 - 2 * e); f.s.position.lerpVectors(f.fly.from, f.fly.to, k); f.s.position.y += Math.sin(k * Math.PI) * 0.4; }
    else { f.s.position.addScaledVector(f.v, dt); f.v.multiplyScalar(0.96); f.s.material.opacity = 1 - f.t / f.life; }
    if (f.t > f.life) { scene.remove(f.s); fx.splice(i, 1); f.done?.(); }
  }
  const fl = 0.85 + 0.15 * Math.sin(uTime.value * 13) * Math.sin(uTime.value * 7.3);
  flames.forEach((s, i) => { s.scale.setScalar((0.9 - i * 0.2) * fl * (1 + 0.3 * dusk)); s.position.y = 0.45 + i * 0.14 + Math.sin(uTime.value * (5 + i)) * 0.03; });
  fireLight.intensity = (D.fx ? 6 : 0) * fl * (1 + 1.5 * dusk);
  acts.update(dt, uTime.value); aimStep(dt);
  uNight.value = dusk; stepLight(fl, uTime.value);
  { const W = SLOTH_WARM, n = Math.min(lanternGlow.length, WARM_N - 1);   // the sloths' night glow: lanterns, then the fire
    for (let i = 0; i < n; i++) { W.uWarmPos.value[i].copy(lanternGlow[i]); W.uWarmK.value[i] = 0.15; }
    W.uWarmPos.value[WARM_N - 1].set(0, 0.6, 0); W.uWarmK.value[WARM_N - 1] = 0.9 * fl; W.uWarm.value = dusk; } pools.visible = dusk > 0 && !groundLife.isNightBaked(); pools.material.opacity = dusk * (0.9 + 0.1 * fl);
  LANTERNS.update(uTime.value, dusk);
  if (day.cycle) { day.set = (day.set + dt / HOUR_S) % 24; if ((clockTick += dt) > 2) { clockTick = 0; day.setHour(day.set); } }
  { const ahead = (day.set - day.shown + 24) % 24; day.shown = (day.shown + Math.min(ahead, dt * 3)) % 24; }   // always forward, like a day
  const tShown = day.shown;
  weather.step(dt);
  const wet = weather.wet;
  dusk = duskOf(tShown); gold = goldOf(tShown) * (1 - wet); mist = mistOf(tShown);
  clockStep(dt, dusk);
  mistSprites.visible = mist > 0.01;
  if (mistSprites.visible) { const k = mist * (1 - dusk); mistSprites.children[0].material.opacity = 0.32 * k;
    for (const sp of mistSprites.children) { const u = sp.userData; u.a += u.w * dt; sp.position.x = Math.cos(u.a) * u.r; sp.position.z = Math.sin(u.a) * u.r; } }
  {
    scene.fog.color.copy(DAY.fog).lerp(GOLD_FOG, 0.55 * gold).lerp(DUSK, dusk).lerp(DAWN_FOG, 0.5 * mist * (1 - dusk)).lerp(RAIN_FOG, 0.6 * wet * (1 - dusk)); scene.fog.density = DAY.dens * (1 + 0.6 * dusk + 0.7 * mist * (1 - dusk) + 0.5 * wet);
    hemiL.intensity = DAY.hemi * (1 - 0.72 * dusk) * (1 - 0.2 * wet); hemiL.color.copy(DAY.sky).lerp(NIGHT_SKY, dusk); hemiL.groundColor.copy(DAY.ground).lerp(NIGHT_GROUND, dusk);
    sun.intensity = DAY.sun * (1 - 0.62 * dusk + 0.35 * gold) * (1 - 0.5 * wet); sun.color.copy(DAY.sunC).lerp(GOLD_SUN, 0.8 * gold).lerp(MOONC, THREE.MathUtils.smoothstep(dusk, 0.35, 1));                      // the sun turns into cool moonlight
    sky.material.color.setRGB(1, 1, 1).lerp(BACK_GOLD, 0.7 * gold).lerp(BACK_DAWN, 0.6 * mist * (1 - dusk)).lerp(BACK_RAIN, 0.5 * wet).lerp(BACK_NIGHT, dusk); uSkyDusk.value = Math.min(1, dusk * 1.3); dome.material.color.setScalar(1 - 0.75 * dusk).lerp(BACK_GOLD, 0.6 * gold); scene.background.set(S.sky[0]).lerp(DUSK, dusk);
    nightDome.visible = moon.visible = dusk > 0.01; nightDome.material.opacity = Math.min(1, dusk * 1.3); moon.material.opacity = Math.max(0, dusk * 1.5 - 0.5); flies.material.opacity = dusk; flies.rotation.y += dt * 0.02;
    if (typeof rayMat !== "undefined") rayMat.color.copy(RAY_DAY).lerp(RAY_GOLD, gold), rayMat.opacity = S.rays * Math.max(1 - dusk, 1.8 * gold) * (1 - wet) * (0.85 + 0.15 * Math.sin(uTime.value * 0.21) * Math.sin(uTime.value * 0.13 + 1.0));   // a slow shimmer as leaves move over the gap
  }
  if (motes) motes.rotation.y += dt * 0.02;
  atmo.update(dt, uTime.value, dusk);
  audioStep(dt, dusk); radioStep(dt);
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
window.__me = me; window.__boop = (i) => boop(sloths[i]); window.__feed = (i) => feed(sloths[i]); window.__rest = () => day.setHour(23, true); window.__time = (h) => day.setHour(h, true);   // checks: jump straight to an hour
window.__face = (i) => { const s = sloths[i]; const flat = V(s.p.x, 0, s.p.z); me.pos.copy(flat.clone().multiplyScalar(Math.max(0, 1 - 2.2 / flat.length()))); collide(me.pos); step(0); const d = s.p.clone().add(V(0, -0.2, 0)).sub(camera.position); me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); me.lastDrag = 1e9; };
window.__stick = (x, y) => stickV.set(x, y);
window.__slothS = sloths.map((s) => s.p.toArray().map((v) => +v.toFixed(1)));
window.__scene = scene; window.__glade = { at: GLADE, path: sloPath.pts };
window.__ready = true;

