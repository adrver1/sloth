// Summit Cabin light: the hemisphere light, the sun (also the moon) with its shadow, the sky palette by the sun's height, and the
// weather presets. SKY holds the preset the weather eases to (SKY.target) and the Distance haze switch (SKY.haze).
import * as THREE from 'three';
import { $, isPhone, sstep } from './land.js';
import { U, me, renderer, scene, sky, sunDir } from './core.js';
import { placedAt } from './forest.js';

// ---------------------------------------------------------------- light
export const hemi = new THREE.HemisphereLight('#b8d4f4', '#a0a8b8', 1);
export const sun = new THREE.DirectionalLight('#ffffff', 2.5);
sun.shadow.mapSize.set(isPhone ? 1024 : 2048, isPhone ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 10, far: 500 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
export const moonDir = new THREE.Vector3(0.45, 0.42, 0.78).normalize();

// colours by the sun's height in degrees (night, blue hour, sunset, golden, winter day)
// The Long Dark's look (Adriaen 2026-11-16, references in the project files, summit-level/look/reference/): the sky's colour
// floods the scene, with an orange sunset, a pink dusk and a teal-green night; the sky light (hs) and its bounce off the snow (hg)
// carry that colour into the shade, and the haze (core.js) paints the far land in it. The hemisphere stays low against the
// sun, so the shade reads as colour and the lit faces stand out.
const KEYS = [
  { e: -14, zen: '#06120f', hor: '#16362d', sun: '#000000', hs: '#2f6455', hg: '#183a30', hemi: 0.55, light: 0 },
  { e: -5, zen: '#3b3866', hor: '#e597a8', sun: '#ff8090', hs: '#8a8cc4', hg: '#6a5272', hemi: 0.6, light: 0 },
  { e: 0, zen: '#b4583e', hor: '#ff8a3c', sun: '#ff7428', hs: '#9a8cb4', hg: '#b06a4c', hemi: 0.6, light: 1.3 },
  { e: 6, zen: '#8e8cb0', hor: '#ffad6a', sun: '#ffaa64', hs: '#93a6d6', hg: '#d29a74', hemi: 0.6, light: 2.4 },
  { e: 16, zen: '#5c8ccc', hor: '#f2d6c4', sun: '#ffe0b4', hs: '#a2bce6', hg: '#d8c0a0', hemi: 0.66, light: 2.6 },
].map((k) => ({ ...k, zen: new THREE.Color(k.zen), hor: new THREE.Color(k.hor), sun: new THREE.Color(k.sun), hs: new THREE.Color(k.hs), hg: new THREE.Color(k.hg) }));
export const P = { zen: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), hemi: 1, light: 1 };
export function palette(e) {
  let i = 0; while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = sstep(a.e, b.e, e);
  for (const k of ['zen', 'hor', 'sun', 'hs', 'hg']) P[k].lerpColors(a[k], b[k], t);
  P.hemi = a.hemi + (b.hemi - a.hemi) * t; P.light = a.light + (b.light - a.light) * t;
}

// weather: three presets the scene eases between
export const WEATHER = {
  clear: { haze: 2.6e-4, mist: 0.0006, fog: 0, storm: 0 },
  valley: { haze: 3.5e-4, mist: 0.0022, fog: 0, storm: 0 },
  storm: { haze: 5e-4, mist: 0, fog: 0.016, storm: 1 },
};
export const W_NOW = { ...WEATHER.clear };
export const SKY = { target: WEATHER.clear, haze: true };   // the preset the weather eases to (Weather buttons), and the Distance haze switch

// the light this frame, read by the other steps: the sun's height in degrees (el), the storm (0..1), how lit the scene is (bright)
// and how dark (night, 0 by day .. 1)
export const LIGHT = { el: 0, storm: 0, bright: 1, night: 0 };
const fogGrey = new THREE.Color('#b9c4d2'), white = new THREE.Color('#ffffff');
const shadowAt = new THREE.Object3D(); let lastShKey = '';

export function buildDaylight() {
  scene.add(shadowAt); sun.target = shadowAt;
  scene.add(hemi);
  hemi.layers.enable(2);
  sun.castShadow = true;
  scene.add(sun);
  sun.layers.enable(2);
}

// each frame, first of the light: the weather eases toward its preset, the sun takes its place for the hour (a low winter arc,
// up from 07:00 to 17:00, at most 26 degrees high), and the sky, haze, fog and lights follow
export function daylightStep(dt) {
  const k = 1 - Math.exp(-dt * 1.2); for (const key in W_NOW) W_NOW[key] += (SKY.target[key] - W_NOW[key]) * k;
  const storm = W_NOW.storm;
  const h = +$('hour').value, el = 26 * Math.sin((Math.PI * (h - 7)) / 10), az = ((h - 12) * Math.PI) / 10, er = (el * Math.PI) / 180;
  sunDir.set(Math.sin(az) * Math.cos(er), Math.sin(er), -Math.cos(az) * Math.cos(er));
  palette(el);
  const day = sstep(-6, 4, el), bright = Math.max(0.1, P.hemi / 0.85) * (1 - 0.25 * storm);
  Object.assign(LIGHT, { el, storm, bright, night: 1 - sstep(-6, 5, el) });
  U.uSunDir.value.copy(sunDir); U.uHor.value.copy(P.hor); U.uSkyLo.value.copy(P.hs); U.uSunCol.value.copy(P.sun).multiplyScalar(sstep(-4, 2, el) * (1 - storm));
  U.uHaze.value = SKY.haze ? W_NOW.haze : 0; U.uMist.value = W_NOW.mist;
  U.uMistCol.value.copy(P.hor).lerp(white, 0.45).multiplyScalar(0.25 + 0.75 * day);
  U.uFogDen.value = W_NOW.fog; U.uFogCol.value.copy(P.hor).lerp(fogGrey, 0.55).multiplyScalar(0.3 + 0.6 * bright);
  const su = sky.material.uniforms; su.uT.value += dt; su.uZen.value.copy(P.zen); su.uNight.value = 1 - sstep(-10, -3, el); su.uMoonDir.value.copy(moonDir); su.uFog.value = 0.92 * storm;
  hemi.color.copy(P.hs); hemi.groundColor.copy(P.hg); hemi.intensity = P.hemi * (1 - 0.3 * storm);
  // the sun's shadow map is redrawn only when its 4 m grid spot or the light changes, or after new trees are placed:
  // standing still or turning round costs no shadow pass at all (the flag's cloth casts none, since it flaps)
  shadowAt.position.set(Math.round(me.x / 4) * 4, Math.round((me.y - 1.65) / 2) * 2, Math.round(me.z / 4) * 4);
  const shKey = `${shadowAt.position.x},${shadowAt.position.y},${shadowAt.position.z},${sunDir.x.toFixed(3)},${sunDir.y.toFixed(3)},${el > -3},${placedAt?.x}`;
  if (shKey !== lastShKey) { renderer.shadowMap.needsUpdate = true; lastShKey = shKey; }
  if (el > -3) { sun.color.copy(P.sun); sun.intensity = P.light * (1 - 0.85 * storm); sun.position.copy(shadowAt.position).addScaledVector(sunDir, 250); }
  else { sun.color.set('#9fb4e6'); sun.intensity = 0.75 * (1 - 0.8 * storm); sun.position.copy(shadowAt.position).addScaledVector(moonDir, 250); }
}
