// Summit Cabin entry: builds the parts in the order of the build list below, then runs the frame, which only calls each part's
// step in a fixed order, renders, repaints the backdrop and keeps the fps line and the pixel ratio.
// The tool hooks (window.__) are set by debug.js.
import * as THREE from 'three';
import { $, BARE, BIG_H, BW, CL, CL_Y, HT, HUT, JEEP, LAKE, ROAD, TOP, TOWER, TRIS, hBase, height, walkable } from './land.js';
import { adaptPixelRatio, buildCore, camera, me, renderer, scene, sky, tris } from './core.js';
import { buildTerrain, cullTerrain, levels, uCardR, uTreeCol, uTreeK, updateLevel, updateTerrain } from './terrain.js';
import { CARDS, SPECIES, TREES, buildForest, cards, cullWedges, logGeo, logs, near, nearN, placeThings, placedAt, rocks, saplings } from './forest.js';
import { MADE_FROM, buildHorizon, horizonStep } from './horizon.js';
import { buildCabin, cabinStep } from './cabin.js';
import { buildScoutCamp, campStep } from './scoutCamp.js';
import { buildCover } from './cover.js';
import { buildRoad, roadStep } from './road.js';
import { buildMap, carry } from './map.js';
import { buildFx, fxStep, wind } from './fx.js';
import { LIGHT, SKY, WEATHER, W_NOW, buildDaylight, daylightStep } from './daylight.js';
import { buildPlayer, jump, press, prof, showTris, testing, walk } from './player.js';
import { backdrop, buildBackdrop } from './backdrop.js';
import { ready, stats } from './debug.js';
import { buildDrive, driveApi, driveStep } from './drive.js';
import { buildLife, lifeHooks, lifeStep, seatStep } from './life.js';
import { buildDaytime, daytimeApi, daytimeStep } from './daytime.js';
import { audio, audioStep, buildAudio } from './audio.js';
import { clockStep } from '../camp/clock.js';
import { hearJeep } from '../camp/audio/jeepSound.js';
import { warmHighlight } from '../camp/input.js';
import { compileAll, lift, track, until } from '../camp/loading.js';
import { campReady } from './scoutCamp.js';
import { lmReady } from './lightmap.js';

// ---------------------------------------------------------------- the build list (the order the scene's children were added in the prototype)
buildCore();        // core.js: the canvas on the page, the sky dome
buildTerrain();     // terrain.js: the rings round you (needs the land and the haze chunk)
buildForest();      // forest.js: tree, log and rock buckets
buildCover();       // cover.js: dry grass through the snow round the camp and the cabin
buildHorizon();     // horizon.js: the painted ring; MADE_FROM counts the scene's children here, so what follows is man-made
buildCabin();       // cabin.js: the cabin and the fire lookout
buildScoutCamp();   // scoutCamp.js: the camp's GLBs round the fire (loading), lanterns, flag, snowman
buildLife();        // life.js: the camp's cast, the seven sloths and the operator, going about their summit day (loading; they start once the scout camp is in)
buildRoad();        // road.js: fences, the road, bridge and tunnel, the jeep (loading; the map goes on its hood when it arrives), mud
buildMap();         // map.js: the map and compass on the hood and in your hands
buildFx();          // fx.js: smoke plumes and the storm's snow
buildDaylight();    // daylight.js: hemisphere light and sun, the sun's shadow spot
buildPlayer();      // player.js: keys, stick, look drags, settings panel handlers
buildBackdrop();    // backdrop.js: eight painted panels for the land beyond 1 km
buildDaytime();     // daytime.js: the camp's hour and day cycle, the porch clock, the time slider
buildAudio();      // audio.js: the sound settings, the first-tap start, the porch radio (sound only after a tap)
buildDrive();       // drive.js: the drive's letterbox and the Drive back pill (needs the road's jeep group and the pill row); come from the camp, the arrival plays on the first frame
if (BARE) scene.children.slice(MADE_FROM).forEach((o) => { if (!o.isCamera) o.visible = false; });

// ---------------------------------------------------------------- each frame
const clock = new THREE.Timer(); let frames = 0, acc = 0;
// the jeep's working parts once road.js has rigged it; its seats module is imported then (it pulls in the cast's places, which
// must load after castStage.js: life.js)
let seats = null;
function jeepStep(dt) {
  if (!JEEP.rig) return;
  JEEP.rig.step(dt);
  // the camp's seats and dash (key, radio, clock: camp/car.js), once the jeep is in; imported here, after the stage is set
  if (!seats) { seats = 'loading'; Promise.all([import('../camp/jeepSeat.js'), import('../camp/car.js')]).then(([m, car]) => {
    m.buildJeepSeats(JEEP.rig.api); car.buildCar(JEEP.rig.api, { audio, drive: ['Drive back to camp 🌴', () => driveApi.away()] }); seats = { step: (d) => { m.jeepSeatStep(d); car.carStep(d); hearJeep(JEEP.rig.api, car.carApi?.engine()); } };   // its doors and engine heard as in the camp (camp/audio/jeepSound.js)
  }).catch((e) => console.warn('jeep seats', e)); }
  else if (seats !== 'loading') seats.step(dt);
}
const dist = (p) => Math.hypot(p.x - me.x, p.z - me.z), metres = (d) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`);
function frame() {
  clock.update(); const dt = Math.min(clock.getDelta(), 0.05), now = clock.getElapsed();
  jeepStep(dt);   // the jeep's doors and lamp, and its seats (the camp's: camp/jeepRig.js, camp/jeepSeat.js), before you move as in the camp
  seatStep(dt);   // your log seat by the fire (camp/linger.js), as in the camp
  walk(dt);   // you move first (camp/player.js), so the ground, the trees and the shadow spot follow this frame's position
  driveStep(dt);   // a drive shot takes the camera, and moves you to it so the near ground and trees are round it
  const pf = prof.on ? performance.now() : 0;
  updateTerrain(me.x, me.z); cullTerrain(); cullWedges();
  if (prof.on) prof.mark('ground', pf);
  if (!placedAt || Math.hypot(me.x - placedAt.x, me.z - placedAt.z) > 12 || Math.abs(+$('hour').value - placedAt.h) > 0.75) { const t = performance.now(); placeThings(me.x, me.z); if (prof.on) prof.mark('trees', t); }
  daytimeStep(dt);    // the camp's hour: the cycle, the eased hour shown and the slider (the light reads the slider)
  daylightStep(dt);   // before everything lit: sets LIGHT, the sun, the sky's uniforms and the shadow map's redraw flag
  clockStep(dt, LIGHT.night);   // the camp's clocks (camp/clock.js): the porch clock and the jeep's dash clock, hands and glow
  sky.position.copy(camera.position); horizonStep();
  cabinStep(LIGHT.night);
  fxStep(dt, now, LIGHT.storm, LIGHT.bright);   // sets the wind before the flag reads it
  campStep(now, LIGHT.night, wind);
  lifeStep(dt);          // after the light: the camp's cast, the sloths' and his summit day
  audioStep(dt);         // after the light and the wind: the ear, the beds, the crackles and calls, your steps
  if (!BARE) { carry.step(dt, LIGHT.bright); roadStep(); }
  const shNow = renderer.shadowMap.needsUpdate, tr = performance.now();
  renderer.render(scene, camera); const mainInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  if (prof.on) prof.mark(shNow ? 'render+shadow' : 'render', tr);
  const tb = performance.now(); if (backdrop.step() && prof.on) prof.mark('panel', tb);   // after the frame, so the shadow map it reads already exists
  frames++; acc += dt;
  if (acc > 0.5) { const i = mainInfo;   // the frame itself, not the backdrop's repaint
    adaptPixelRatio(frames / acc, now > 5 && !testing);
    $('perf').innerHTML = `${Math.round(frames / acc)} fps · ${i.calls} draws · ${(i.triangles / 1000).toFixed(1)}k tris<br>Altitude ${Math.round(me.y - 1.65 - LAKE)} m · Cabin ${metres(dist({ x: 0, z: 0 }))}<br>Lookout ${metres(dist(TOWER))}`;
    Object.assign(stats, { calls: i.calls, tris: i.triangles, fps: Math.round(frames / acc), pr: renderer.getPixelRatio() }); frames = 0; acc = 0; if (!$('opts').hidden) showTris(); }
}
updateTerrain(me.x, me.z); placeThings(me.x, me.z); console.table(showTris());
renderer.setAnimationLoop(frame);   // the world builds round you behind the loading card
// the camp's loading card (camp/loading.js; Adriaen 2026-11-16): it stays up until the scout camp's props, the cast, the jeep and the
// cabin's light maps are in (or 20 s on a slow line), then every shader is compiled, hidden things too, and it lifts, so nothing
// pops in and the first look round doesn't stutter
const loaded = BARE ? [] : [track(campReady), track(until(() => lifeHooks.op && lifeHooks.sloths, 20000)), track(until(() => JEEP.rig, 20000)), track(lmReady)];   // ?bare=1 has none of them
Promise.race([Promise.all(loaded), until(() => false, 25000)])   // a model that never comes in doesn't keep the card up
  .then(() => { warmHighlight(); return compileAll(renderer, scene, camera); }).then(lift, lift);
ready({ setHour: daytimeApi.setHour, weather: (w) => { SKY.target = WEATHER[w]; Object.assign(W_NOW, WEATHER[w]); press($('weather'), 'w', w); }, jump, me, showTris, dbg: { cards: () => cards, near: () => near, cardR: (r) => { uCardR.value = r; }, k: uTreeK, col: uTreeCol }, looks: () => JSON.stringify(CARDS.look), counts: () => [nearN.join('/'), saplings.count, logs.count, cards.reduce((n, m) => n + m.count, 0), rocks.count, SPECIES.map((n) => tris(TREES[n])).join('/'), tris(logGeo), uTreeCol.value.getHexString(), uTreeK.value], TRIS, LAKE, TOP, TOWER, HUT, height, hBase, ROAD, walkable, HT, BIG_H, CL, CL_Y, BWP: () => BW, carry, scene, renderer, levels, backdrop, updateLevel, life: lifeHooks });
