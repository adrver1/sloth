// Summit Cabin entry: builds the parts in the order of the build list below, then runs the frame, which only calls each part's
// step in a fixed order, renders, repaints the backdrop and keeps the fps line and the pixel ratio.
// The tool hooks (window.__) are set by debug.js.
import * as THREE from 'three';
import { $, BARE, BIG_H, BW, CL, CL_Y, HT, HUT, LAKE, ROAD, TOP, TOWER, TRIS, hBase, height, walkable } from './land.js';
import { adaptPixelRatio, buildCore, camera, me, renderer, scene, sky, tris } from './core.js';
import { buildTerrain, cullTerrain, levels, uCardR, uTreeCol, uTreeK, updateLevel, updateTerrain } from './terrain.js';
import { CARDS, SPECIES, TREES, buildForest, cards, cullWedges, logGeo, logs, near, nearN, placeThings, placedAt, rocks, saplings } from './forest.js';
import { MADE_FROM, buildHorizon, horizonStep } from './horizon.js';
import { buildCabin, cabinStep } from './cabin.js';
import { buildScoutCamp, campStep } from './scoutCamp.js';
import { buildRoad, roadStep } from './road.js';
import { buildMap, carry } from './map.js';
import { buildFx, fxStep, wind } from './fx.js';
import { LIGHT, SKY, WEATHER, W_NOW, buildDaylight, daylightStep } from './daylight.js';
import { buildPlayer, fmt, jump, press, prof, showTris, testing, walk } from './player.js';
import { backdrop, buildBackdrop } from './backdrop.js';
import { ready, stats } from './debug.js';

// ---------------------------------------------------------------- the build list (the order the scene's children were added in the prototype)
buildCore();        // core.js: the canvas on the page, the sky dome
buildTerrain();     // terrain.js: the rings round you (needs the land and the haze chunk)
buildForest();      // forest.js: tree, log and rock buckets
buildHorizon();     // horizon.js: the painted ring; MADE_FROM counts the scene's children here, so what follows is man-made
buildCabin();       // cabin.js: the cabin and the fire lookout
buildScoutCamp();   // scoutCamp.js: the camp's GLBs round the fire (loading), lanterns, flag, snowman
buildRoad();        // road.js: fences, the road, bridge and tunnel, the jeep (loading; the map goes on its hood when it arrives), mud
buildMap();         // map.js: the map and compass on the hood and in your hands
buildFx();          // fx.js: smoke plumes and the storm's snow
buildDaylight();    // daylight.js: hemisphere light and sun, the sun's shadow spot
buildPlayer();      // player.js: keys, stick, look drags, settings panel handlers
buildBackdrop();    // backdrop.js: eight painted panels for the land beyond 1 km
if (BARE) scene.children.slice(MADE_FROM).forEach((o) => { if (!o.isCamera) o.visible = false; });

// ---------------------------------------------------------------- each frame
const clock = new THREE.Timer(); let frames = 0, acc = 0;
const dist = (p) => Math.hypot(p.x - me.x, p.z - me.z), metres = (d) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`);
function frame() {
  clock.update(); const dt = Math.min(clock.getDelta(), 0.05), now = clock.getElapsed();
  walk(dt);   // you move first, so the ground, the trees and the shadow spot follow this frame's position
  const pf = prof.on ? performance.now() : 0;
  updateTerrain(me.x, me.z); cullTerrain(); cullWedges();
  if (prof.on) prof.mark('ground', pf);
  if (!placedAt || Math.hypot(me.x - placedAt.x, me.z - placedAt.z) > 12 || Math.abs(+$('hour').value - placedAt.h) > 0.75) { const t = performance.now(); placeThings(me.x, me.z); if (prof.on) prof.mark('trees', t); }
  daylightStep(dt);   // before everything lit: sets LIGHT, the sun, the sky's uniforms and the shadow map's redraw flag
  sky.position.copy(camera.position); horizonStep();
  cabinStep(LIGHT.night);
  fxStep(dt, now, LIGHT.storm, LIGHT.bright);   // sets the wind before the flag reads it
  campStep(now, LIGHT.night, wind);
  if (!BARE) { carry.step(dt, LIGHT.bright); roadStep(); }
  const shNow = renderer.shadowMap.needsUpdate, tr = performance.now();
  renderer.render(scene, camera); const mainInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  if (prof.on) prof.mark(shNow ? 'render+shadow' : 'render', tr);
  const tb = performance.now(); if (backdrop.step() && prof.on) prof.mark('panel', tb);   // after the frame, so the shadow map it reads already exists
  frames++; acc += dt;
  if (acc > 0.5) { const i = mainInfo;   // the frame itself, not the backdrop's repaint
    adaptPixelRatio(frames / acc, now > 5 && !testing);
    $('stats').innerHTML = `${Math.round(frames / acc)} fps · ${i.calls} draws · ${(i.triangles / 1000).toFixed(1)}k tris<br>Altitude ${Math.round(me.y - 1.65 - LAKE)} m · Cabin ${metres(dist({ x: 0, z: 0 }))}<br>Lookout ${metres(dist(TOWER))}`;
    Object.assign(stats, { calls: i.calls, tris: i.triangles, fps: Math.round(frames / acc), pr: renderer.getPixelRatio() }); frames = 0; acc = 0; if ($('menu').open) showTris(); }
}
updateTerrain(me.x, me.z); placeThings(me.x, me.z); console.table(showTris());
renderer.setAnimationLoop(frame);
ready({ setHour: (h) => { $('hour').value = h; $('hourOut').textContent = fmt(h); }, weather: (w) => { SKY.target = WEATHER[w]; Object.assign(W_NOW, WEATHER[w]); press($('weather'), 'w', w); }, jump, me, showTris, dbg: { cards: () => cards, near: () => near, cardR: (r) => { uCardR.value = r; }, k: uTreeK, col: uTreeCol }, looks: () => JSON.stringify(CARDS.look), counts: () => [nearN.join('/'), saplings.count, logs.count, cards.reduce((n, m) => n + m.count, 0), rocks.count, SPECIES.map((n) => tris(TREES[n])).join('/'), tris(logGeo), uTreeCol.value.getHexString(), uTreeK.value], TRIS, LAKE, TOP, TOWER, HUT, height, hBase, ROAD, walkable, HT, BIG_H, CL, CL_Y, BWP: () => BW, carry, scene, renderer, levels, backdrop, updateLevel });
