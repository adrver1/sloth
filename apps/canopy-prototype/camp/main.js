// Canopy Camp main: builds the camp in one explicit order, then runs the frame loop, with the fps panel and the resolution
// safety net; once the camp is built it calls debug.js ready() (the tools' window.__ names are all in debug.js).
// camp.html loads this file. Importing a camp module builds nothing: each exports a build function, and the list below calls
// them in order. Each system draws from its own named random stream (core.js rng), so moving a step does not move the
// trees or the sloths; a step only has to come after the steps whose parts it uses, as the comments say.
// Each frame it calls the modules' step functions in one fixed order (review boot-06, crosscut-14).
import * as THREE from "three";
import { stepLight } from "../bakedlight.js";
import { $, DETAIL, OPT, PRE, camera, renderer, scene, uTime, wireSettings } from "./core.js";
import { buildSky } from "./sky.js";
import { buildForest } from "./forest.js";
import { buildProps, fireStep, lanternGlow, LANTERNS, motesStep, poolsStep, uNight } from "./campProps.js";
import { buildJeep, jeepStep } from "./jeep.js";
import { buildSloths, campStep, hammockStep, slothsStep, warmStep } from "./sloths.js";
import { labStep } from "./labButton.js";
import { fxStep } from "./fx.js";
import { me, step } from "./player.js";
import { buildDeadwood } from "./deadwood.js";
import { buildGlade } from "./glade.js";
import { buildGround, groundLife, shadowStep } from "./campGround.js";
import { buildTentInside } from "./tentInside.js";
import { atmo, buildAtmosphere } from "./campAir.js";
import { acts, buildChores } from "./chores.js";
import { buildOperator, opStep } from "./operator.js";
import { aimStep, initInput, resize } from "./input.js";
import { buildWeather, weather } from "./weather.js";
import { buildLinger, lingerStep } from "./linger.js";
import { dayStep, wireTimeMenu } from "./daytime.js";
import { buildClocks, clockStep } from "./clock.js";
import { audioStep, initAudio } from "./audio.js";
import { buildRadio, radioStep } from "./radio.js";
import { buildJeepSeats, jeepSeatStep } from "./jeepSeat.js";
import { buildCar, carStep } from "./car.js";
import { createDaylight, daylightStep, light, setLight } from "./daylight.js";
import { ready, stats } from "./debug.js";

// ================================================================ the build, in order (every download started at once in core.js PRE)
// the world: the sky, then the forest (its root mounds shape the ground's height, which everything after stands on), then the
// props on the clearing and the jeep at its edge (they wait for their downloads)
buildSky();                            // sky.js: the backdrop, the domes, the moon
buildForest();                         // forest.js: the big trees, the forest wall, the ribbons on the floor, leaves, ferns
await buildProps();                    // campProps.js: lanterns, fire, the baked props, the lived-in props, the laundry
await buildJeep();                     // jeep.js (?jeep=none: nothing)
// the characters: the sloths use the big trees' branches, the props and the jeep
buildSloths();                         // sloths.js: the wild sloths, then the camp's seven in their spots
// the lived-in clearing, set down on the finished props and sloths in this order: the deadwood and the glade first, then the
// ground, painted round the blockers as they stand then; the tent's walls join the blockers only after that
buildDeadwood();                       // deadwood.js
buildGlade();                          // glade.js: its plants go into the ground's draw
buildGround(await PRE.groundMask);     // campGround.js: waits for the ground mask's download
buildTentInside();                     // tentInside.js
buildAtmosphere();                     // campAir.js
buildChores();                         // chores.js: your activities
await buildOperator();                 // operator.js: waits for his downloads (?op=0: nothing)
// the things you use, in this order: input.js first (the listeners, the highlight and the menu), then the modules that add
// tap targets and props of their own. car.js comes after the jeep seats, the radio and the clocks, whose menus it shares.
wireSettings();                        // core.js: the ⚙️ menu, and its Detail and Light buttons
initInput();                           // input.js
initAudio();                           // audio.js: the first-tap listeners, the Tap for sound pill, the ⚙️ Sound button
buildWeather();                        // weather.js: the ⚙️ Weather button and the rain streaks
buildLinger();                         // linger.js: the log seats light up
wireTimeMenu();                        // daytime.js: the ⚙️ menu's time slider and Day cycle button
buildClocks();                         // clock.js: the tent's alarm clock and the dial on the hammock post
buildRadio();                          // radio.js: the radio on the snack table
buildJeepSeats();                      // jeepSeat.js: the jeep's doors and seats
buildCar();                            // car.js: the key, the dash radio and the dash clock
createDaylight();                      // daylight.js: the mist banks, and the moon put where the start view sees it

// ================================================================ loop, with an fps panel and a resolution safety net
let pr = renderer.getPixelRatio();   // the resolution, lowered by the safety net in the loop
addEventListener("resize", resize); resize();
camera.far = 80;
if (OPT.pos) { const [x, z] = OPT.pos; me.pos.set(x, 0, z); }   // ?pos=, ?yaw=, ?pitch=: the start view (core.js OPT)
if (OPT.yaw !== null) me.yaw = OPT.yaw; if (OPT.pitch !== null) me.pitch = OPT.pitch;
const clock = new THREE.Clock(); let frames = 0, acc = 0, slow = 0;
// compile every shader before the first frame (camp review P2), so the first look round doesn't stutter; then lift the card
await renderer.compileAsync(scene, camera).catch(() => {});
$("loadbar").style.width = "100%"; $("load").classList.add("done"); setTimeout(() => $("load").remove(), 700);
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05); uTime.value += dt;
  jeepSeatStep(dt); lingerStep(dt); step(dt);
  slothsStep(dt);                                          // sloths.js: every sloth's clip, its life on top of it, the squish of a boop and its nod
  campStep(dt);                                            // sloths.js: the camp sloths' day (linger.js has claimed the log you sit on)
  labStep(dt);                                             // labButton.js: the move lab, while it is open
  hammockStep(dt);                                         // sloths.js: the hammock's swing and its napper's z's
  opStep(dt);
  jeepStep(dt); carStep(dt);
  fxStep(dt);                                              // fx.js: the words and hearts in the air
  // this frame's light first, so the fire, the baked night light, the sloths' glow, the pools and the lanterns all use it
  // (review boot-06: they used to read last frame's dusk)
  const hour = dayStep(dt);                                // daytime.js: the day cycle, and the hour shown easing to the hour set
  weather.step(dt);
  const wet = weather.wet;
  setLight(hour, wet); const dusk = light.dusk;            // daylight.js: this frame's dusk, golden hour and mist
  const fl = fireStep(dusk);                               // campProps.js: the fire's flicker
  acts.update(dt, uTime.value); aimStep(dt);               // the chores (after fireStep: a log on the fire boosts its light) and what lights up
  uNight.value = dusk; stepLight(fl, uTime.value);         // the baked night light: how far it is faded in, and its flicker (bakedlight.js)
  warmStep(lanternGlow, fl, dusk);                         // sloths.js: the sloths' night glow, from the lanterns and the fire
  poolsStep(dusk, fl, groundLife.isNightBaked());
  LANTERNS.update(uTime.value, dusk);
  clockStep(dt, dusk);
  daylightStep(dt, wet);                                   // the mist banks and the palette
  motesStep(dt);
  atmo.update(dt, uTime.value, dusk);
  audioStep(dt, dusk); radioStep(dt);
  shadowStep();                                            // campGround.js: the sun shadows, re-cast while the props load
  renderer.render(scene, camera);
  frames++; acc += raw;
  if (acc >= 1) {
    const fps = frames / acc, i = renderer.info.render;
    slow = fps < 45 ? slow + 1 : 0;
    if (slow >= 2 && pr > 1) { pr = Math.max(1, pr - 0.25); renderer.setPixelRatio(pr); resize(); slow = 0; }
    Object.assign(stats, { fps: Math.round(fps), calls: i.calls, tris: i.triangles, pr, detail: DETAIL });
    $("perf").innerHTML = `${Math.round(fps)} fps<br>${i.calls} draws · ${(i.triangles / 1000).toFixed(0)}k tris`;
    frames = 0; acc = 0;
  }
});
ready();   // debug.js: window.__ready, which the tools wait for
