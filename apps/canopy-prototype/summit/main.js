// Summit Cabin entry: imports the parts (each builds on import, land first) and runs the frame: walk, terrain and trees round you,
// weather, sun and palette, glows, wind, fire, smoke, snow, map, render, backdrop, then the fps line and pixel ratio.
// window.__scene and window.__stats are for the headless shot tools.
import * as THREE from 'three';
import { $, BARE, BIG_H, BW, CL, CL_Y, HT, HUT, JEEP, LAKE, ROAD, TOP, TOWER, TRIS, hBase, height, sstep, walkable } from './land.js';
import { U, adaptPixelRatio, camera, me, renderer, scene, sky, sunDir, tris } from './core.js';
import { cullTerrain, levels, tmpC, uCardR, uTreeCol, uTreeK, updateLevel, updateTerrain } from './terrain.js';
import { CARDS, SPECIES, TREES, cards, cullWedges, logGeo, logs, near, nearN, placeThings, placedAt, rocks, saplings, v3 } from './forest.js';
import { HOR_HI, HOR_LO, MADE_FROM, horMat, horizon } from './horizon.js';
import { doorMat, inside, porchLight, winMat } from './cabin.js';
import { CAMP, fireLight, flag, flames } from './scoutCamp.js';
import { carry } from './map.js';
import './road.js';   // the road, bridge, tunnel, jeep and mud (builds on import for now)
import { SNOW_N, chimneyTop, fireSmoke, flakes, smoke, snowGeo, tmpV } from './fx.js';
import { P, SKY, WEATHER, W_NOW, hemi, moonDir, palette, sun } from './daylight.js';
import { fmt, jump, press, prof, showTris, testing, walk } from './player.js';
import { backdrop } from './backdrop.js';

// ---------------------------------------------------------------- each frame
if (BARE) scene.children.slice(MADE_FROM).forEach((o) => { if (!o.isCamera) o.visible = false; });
const clock = new THREE.Timer(), wind = new THREE.Vector3(); let frames = 0, acc = 0;
const fogGrey = new THREE.Color('#b9c4d2'), white = new THREE.Color('#ffffff');
const shadowAt = new THREE.Object3D(); scene.add(shadowAt); sun.target = shadowAt; let lastShKey = '';
const dist = (p) => Math.hypot(p.x - me.x, p.z - me.z), metres = (d) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`);
function frame() {
  clock.update(); const dt = Math.min(clock.getDelta(), 0.05), now = clock.getElapsed();
  walk(dt);
  const pf = prof.on ? performance.now() : 0;
  updateTerrain(me.x, me.z); cullTerrain(); cullWedges();
  if (prof.on) prof.mark('ground', pf);
  if (!placedAt || Math.hypot(me.x - placedAt.x, me.z - placedAt.z) > 12 || Math.abs(+$('hour').value - placedAt.h) > 0.75) { const t = performance.now(); placeThings(me.x, me.z); if (prof.on) prof.mark('trees', t); }
  // weather eases toward its preset
  const k = 1 - Math.exp(-dt * 1.2); for (const key in W_NOW) W_NOW[key] += (SKY.target[key] - W_NOW[key]) * k;
  const storm = W_NOW.storm;
  // the sun: a low winter arc, up from 07:00 to 17:00, at most 26 degrees high
  const h = +$('hour').value, el = 26 * Math.sin((Math.PI * (h - 7)) / 10), az = ((h - 12) * Math.PI) / 10, er = (el * Math.PI) / 180;
  sunDir.set(Math.sin(az) * Math.cos(er), Math.sin(er), -Math.cos(az) * Math.cos(er));
  palette(el);
  const day = sstep(-6, 4, el), bright = Math.max(0.1, P.hemi / 0.85) * (1 - 0.25 * storm);
  U.uSunDir.value.copy(sunDir); U.uHor.value.copy(P.hor); U.uSkyLo.value.copy(P.hs); U.uSunCol.value.copy(P.sun).multiplyScalar(sstep(-4, 2, el) * (1 - storm));
  U.uHaze.value = SKY.haze ? W_NOW.haze : 0; U.uMist.value = W_NOW.mist;
  U.uMistCol.value.copy(P.hor).lerp(white, 0.45).multiplyScalar(0.25 + 0.75 * day);
  U.uFogDen.value = W_NOW.fog; U.uFogCol.value.copy(P.hor).lerp(fogGrey, 0.55).multiplyScalar(0.3 + 0.6 * bright);
  sky.material.uniforms.uZen.value.copy(P.zen); sky.material.uniforms.uNight.value = 1 - sstep(-10, -3, el); sky.material.uniforms.uMoonDir.value.copy(moonDir); sky.material.uniforms.uFog.value = 0.92 * storm;
  hemi.color.copy(P.hs); hemi.groundColor.copy(P.hg); hemi.intensity = P.hemi * (1 - 0.3 * storm);
  // the sun's shadow map is redrawn only when its 4 m grid spot or the light changes, or after new trees are placed:
  // standing still or turning round costs no shadow pass at all (the flag's cloth casts none, since it flaps)
  shadowAt.position.set(Math.round(me.x / 4) * 4, Math.round((me.y - 1.65) / 2) * 2, Math.round(me.z / 4) * 4);
  const shKey = `${shadowAt.position.x},${shadowAt.position.y},${shadowAt.position.z},${sunDir.x.toFixed(3)},${sunDir.y.toFixed(3)},${el > -3},${placedAt?.x}`;
  if (shKey !== lastShKey) { renderer.shadowMap.needsUpdate = true; lastShKey = shKey; }
  if (el > -3) { sun.color.copy(P.sun); sun.intensity = P.light * (1 - 0.85 * storm); sun.position.copy(shadowAt.position).addScaledVector(sunDir, 250); }
  else { sun.color.set('#9fb4e6'); sun.intensity = 0.75 * (1 - 0.8 * storm); sun.position.copy(shadowAt.position).addScaledVector(moonDir, 250); }
  horMat.color.copy(P.hs).multiplyScalar(0.35 * P.hemi).add(tmpC.copy(P.sun).multiplyScalar(0.25 * P.light));
  // warm windows: always a little lit, glowing after dark
  const night = 1 - sstep(-6, 5, el), glow = 0.25 + 2.4 * night;
  winMat.emissiveIntensity = glow; doorMat.emissiveIntensity = glow; porchLight.intensity = 9 * night; inside.intensity = 6 * night;
  // wind, smoke and snow
  wind.set(Math.sin(now * 0.13) * 0.6 + 1.2 + 6 * storm, 0, 0.6 + Math.cos(now * 0.11) * 0.4 + 3 * storm);
  // the camp fire: flickering light and flames, smoke, the flag in the wind
  const fl = 0.8 + 0.2 * Math.sin(now * 13) * Math.sin(now * 7.3 + 1);
  fireLight.intensity = (5 + 8 * night) * fl; for (const f of flames) f.scale.set(1, 0.85 + 0.25 * fl, 1);
  flag.rotation.y = -Math.atan2(wind.z, wind.x) + Math.sin(now * 3.1) * 0.25; flag.scale.y = 1 - 0.1 * Math.abs(Math.sin(now * 5));
  for (let i = 0; i < fireSmoke.n; i++) { const t = (fireSmoke.t[i] = (fireSmoke.t[i] + dt * 0.12) % 1);
    fireSmoke.set(i, tmpV.set(CAMP.x, TOP + 1.2, CAMP.z).addScaledVector(wind, t * 3).add(v3.set(Math.sin(t * 8) * 0.2, t * 6, 0)), 0.4 + t * 1.8, 0.35 * Math.sin(Math.PI * t) * (1 - 0.7 * storm)); }
  fireSmoke.mat.uniforms.uBright.value = 0.4 + 0.6 * bright; fireSmoke.done();
  for (let i = 0; i < smoke.n; i++) { const t = (smoke.t[i] = (smoke.t[i] + dt * 0.09) % 1);
    smoke.set(i, tmpV.copy(chimneyTop).addScaledVector(wind, t * 9).add(v3.set(Math.sin(t * 10) * 0.3, t * 9, 0)), 0.6 + t * 2.6, 0.55 * Math.sin(Math.PI * t) * (1 - 0.7 * storm)); }
  smoke.mat.uniforms.uBright.value = 0.35 + 0.65 * bright; smoke.done();
  flakes.material.opacity = 0.9 * storm; flakes.visible = storm > 0.01;
  if (flakes.visible) { const p = snowGeo.attributes.position.array, c = camera.position;
    for (let i = 0; i < SNOW_N; i++) { let x = p[i * 3] + (wind.x + Math.sin(now + i) * 0.5) * dt, y = p[i * 3 + 1] - 1.8 * dt, z = p[i * 3 + 2] + wind.z * dt;
      if (y < -20) y += 50; if (x > 40) x -= 80; if (x < -40) x += 80; if (z > 40) z -= 80; if (z < -40) z += 80; p.set([x, y, z], i * 3); }
    snowGeo.attributes.position.needsUpdate = true; flakes.position.set(c.x, c.y, c.z); }
  sky.position.copy(camera.position); horizon.position.x = camera.position.x; horizon.position.z = camera.position.z; horizon.position.y = (HOR_HI + HOR_LO) / 2 + (camera.position.y - TOP);
  if (!BARE) carry.step(dt, bright);
  if (JEEP.lod && !BARE) { const f = Math.hypot(me.x - JEEP.x, me.z - JEEP.z) > 110; JEEP.lod[0].visible = !f; JEEP.lod[1].visible = f; }
  const shNow = renderer.shadowMap.needsUpdate, tr = performance.now();
  renderer.render(scene, camera); const mainInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  if (prof.on) prof.mark(shNow ? 'render+shadow' : 'render', tr);
  const tb = performance.now(); if (backdrop.step() && prof.on) prof.mark('panel', tb);   // after the frame, so the shadow map it reads already exists
  frames++; acc += dt;
  if (acc > 0.5) { const i = mainInfo;   // the frame itself, not the backdrop's repaint
    adaptPixelRatio(frames / acc, now > 5 && !testing);
    $('stats').innerHTML = `${Math.round(frames / acc)} fps · ${i.calls} draws · ${(i.triangles / 1000).toFixed(1)}k tris<br>Altitude ${Math.round(me.y - 1.65 - LAKE)} m · Cabin ${metres(dist({ x: 0, z: 0 }))}<br>Lookout ${metres(dist(TOWER))}`;
    window.__stats = { calls: i.calls, tris: i.triangles, fps: Math.round(frames / acc), pr: renderer.getPixelRatio() }; frames = 0; acc = 0; if ($('menu').open) showTris(); }
}
updateTerrain(me.x, me.z); placeThings(me.x, me.z); console.table(showTris());
renderer.setAnimationLoop(frame);
window.__scene = { setHour: (h) => { $('hour').value = h; $('hourOut').textContent = fmt(h); }, weather: (w) => { SKY.target = WEATHER[w]; Object.assign(W_NOW, WEATHER[w]); press($('weather'), 'w', w); }, jump, me, showTris, dbg: { cards: () => cards, near: () => near, cardR: (r) => { uCardR.value = r; }, k: uTreeK, col: uTreeCol }, looks: () => JSON.stringify(CARDS.look), counts: () => [nearN.join('/'), saplings.count, logs.count, cards.reduce((n, m) => n + m.count, 0), rocks.count, SPECIES.map((n) => tris(TREES[n])).join('/'), tris(logGeo), uTreeCol.value.getHexString(), uTreeK.value], TRIS, LAKE, TOP, TOWER, HUT, height, hBase, ROAD, walkable, HT, BIG_H, CL, CL_Y, BWP: () => BW, carry, scene, renderer, levels, backdrop, updateLevel };
window.__ready = true;
