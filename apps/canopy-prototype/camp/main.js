// Canopy Camp main: the frame loop, with the fps panel and the resolution safety net, and the hooks the tools and checks use.
// camp.html loads this file; it imports the other camp modules in order, so they run top to bottom as one script did before.
// Each frame it calls the modules' step functions in one fixed order. Three pieces of sloths.js's per-frame work are still
// written out in the loop (the squish and nod, the flying emojis, the night glow's uniforms) until the open PRs on that file
// land (review boot-06, crosscut-14).

// The order of these imports is the order the camp is built in: most modules build their part of the scene as they load, and
// four draw from the one seeded random stream (core.js) while they do: sky.js, forest.js, campProps.js and sloths.js, in that
// order, and createDaylight() below draws last. So moving a line here moves trees and sloths. A bare import ("./forest.js")
// holds a module's place in that order when main.js needs no name from it.
import * as THREE from "three";
import { stepLight } from "../bakedlight.js";
import { WARM_N } from "../fur.js";
import { $, DETAIL, OPT, camera, renderer, scene, uTime } from "./core.js";
import { V, ease } from "./util.js";
import { GLADE, sloPath } from "./layout.js";
import { stickV } from "./hud.js";
import "./sky.js";
import "./forest.js";
import { fireStep, lanternGlow, LANTERNS, motesStep, poolsStep, uNight } from "./campProps.js";
import { jeepStep } from "./jeep.js";
import { SL, SLOTH_WARM, campStep, fx, slothLife, sloths } from "./sloths.js";
import { collide, me, step } from "./player.js";
import { acts, atmo, groundLife, shadowStep } from "./campLife.js";
import { opStep } from "./operator.js";
import { aimStep, boop, feed, resize } from "./input.js";
import { weather } from "./weather.js";
import { lingerStep } from "./linger.js";
import { day, dayStep, wireTimeMenu } from "./daytime.js";
import { clockStep } from "./clock.js";
import { audioStep } from "./audio.js";
import { radioStep } from "./radio.js";
import { jeepSeatStep } from "./jeepSeat.js";
import { carStep } from "./car.js";
import { createDaylight, daylightStep, light, setLight } from "./daylight.js";

let pr = renderer.getPixelRatio();   // the resolution, lowered by the safety net in the loop
wireTimeMenu();     // the ⚙️ menu's time slider and Day cycle button (daytime.js)
createDaylight();   // the mist banks and the moon's place: last, after every module above has built its part (daylight.js)

// ================================================================ loop, with an fps panel and a resolution safety net
addEventListener("resize", resize); resize();
camera.far = 80;
if (OPT.pos) { const [x, z] = OPT.pos; me.pos.set(x, 0, z); }   // ?pos=, ?yaw=, ?pitch=: the start view (core.js OPT)
if (OPT.yaw !== null) me.yaw = OPT.yaw; if (OPT.pitch !== null) me.pitch = OPT.pitch;
const clock = new THREE.Clock(); let frames = 0, acc = 0, slow = 0;
window.__stats = {};   // tool contract: fps, draw calls, triangles and resolution, filled once a second below
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
    if (f.fly) { const k = ease(Math.min(1, f.t / f.life)); f.s.position.lerpVectors(f.fly.from, f.fly.to, k); f.s.position.y += Math.sin(k * Math.PI) * 0.4; }
    else { f.s.position.addScaledVector(f.v, dt); f.v.multiplyScalar(0.96); f.s.material.opacity = 1 - f.t / f.life; }
    if (f.t > f.life) { scene.remove(f.s); fx.splice(i, 1); f.done?.(); }
  }
  // from here to the lanterns the light is one frame behind: these use last frame's dusk, and the hour only moves on further
  // down, at setLight (review boot-06 noted the lag; it is kept exactly as it was, so that nothing changes)
  const duskLast = light.dusk;
  const fl = fireStep(duskLast);                           // campProps.js: the fire's flicker
  acts.update(dt, uTime.value); aimStep(dt);
  uNight.value = duskLast; stepLight(fl, uTime.value);     // the baked night light: how far it is faded in, and its flicker (bakedlight.js)
  { const W = SLOTH_WARM, n = Math.min(lanternGlow.length, WARM_N - 1);   // the sloths' night glow: lanterns, then the fire
    for (let i = 0; i < n; i++) { W.uWarmPos.value[i].copy(lanternGlow[i]); W.uWarmK.value[i] = 0.15; }
    W.uWarmPos.value[WARM_N - 1].set(0, 0.6, 0); W.uWarmK.value[WARM_N - 1] = 0.9 * fl; W.uWarm.value = duskLast; }
  poolsStep(duskLast, fl, groundLife.isNightBaked());
  LANTERNS.update(uTime.value, duskLast);
  const hour = dayStep(dt);                                // daytime.js: the day cycle, and the hour shown easing to the hour set
  weather.step(dt);
  const wet = weather.wet;
  setLight(hour, wet); const dusk = light.dusk;            // daylight.js: this frame's dusk, golden hour and mist
  clockStep(dt, dusk);
  daylightStep(dt, wet);                                   // the mist banks and the palette
  motesStep(dt);
  atmo.update(dt, uTime.value, dusk);
  audioStep(dt, dusk); radioStep(dt);
  shadowStep();                                            // campLife.js: the sun shadows, re-cast while the props load
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
// ---------------------------------------------------------------- window.__ hooks (core.js lists every global on the page)
window.__me = me;   // alias: sloths.js reads the player's seat from it (an import waits for the open PRs on that file)
// tool contract: tools/camp-replay.cjs's tour drives these (with __stats above), and all three tools wait for __ready
window.__boop = (i) => boop(sloths[i]); window.__feed = (i) => feed(sloths[i]); window.__time = (h) => day.setHour(h, true);   // __time jumps straight to an hour
window.__stick = (x, y) => stickV.set(x, y);
window.__scene = scene; window.__glade = { at: GLADE, path: sloPath.pts };   // __glade: props/shadow/export_casters.cjs (the bake's layout)
// debug hooks, for checks by hand in the console
window.__rest = () => day.setHour(23, true);
window.__face = (i) => { const s = sloths[i]; const flat = V(s.p.x, 0, s.p.z); me.pos.copy(flat.clone().multiplyScalar(Math.max(0, 1 - 2.2 / flat.length()))); collide(me.pos); step(0); const d = s.p.clone().add(V(0, -0.2, 0)).sub(camera.position); me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); me.lastDrag = 1e9; };
window.__slothS = sloths.map((s) => s.p.toArray().map((v) => +v.toFixed(1)));
window.__ready = true;
