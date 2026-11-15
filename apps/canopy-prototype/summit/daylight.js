// Summit Cabin light: the hemisphere light, the sun (also the moon) with its shadow, the sky palette by the sun's height, and the
// weather presets. SKY holds the preset the weather eases to (SKY.target) and the Distance haze switch (SKY.haze).
import * as THREE from 'three';
import { isPhone, sstep } from './land.js';
import { scene } from './core.js';

// ---------------------------------------------------------------- light
export const hemi = new THREE.HemisphereLight('#b8d4f4', '#a0a8b8', 1); scene.add(hemi); hemi.layers.enable(2);
export const sun = new THREE.DirectionalLight('#ffffff', 2.5); sun.castShadow = true; scene.add(sun); sun.layers.enable(2);
sun.shadow.mapSize.set(isPhone ? 1024 : 2048, isPhone ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 10, far: 500 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
export const moonDir = new THREE.Vector3(0.45, 0.42, 0.78).normalize();

// colours by the sun's height in degrees (night, blue hour, sunset, golden, winter day)
const KEYS = [
  { e: -14, zen: '#050a17', hor: '#101b30', sun: '#000000', hs: '#2b3d63', hg: '#18203a', hemi: 0.5, light: 0 },
  { e: -5, zen: '#101f45', hor: '#3d4e7c', sun: '#ff7a5a', hs: '#5466a0', hg: '#2a3050', hemi: 0.55, light: 0 },
  { e: 0, zen: '#26498a', hor: '#efa48a', sun: '#ff9256', hs: '#8a9cd0', hg: '#7a6c80', hemi: 0.8, light: 0.7 },
  { e: 6, zen: '#3f74c2', hor: '#f6d6b0', sun: '#ffc78e', hs: '#bcc8e8', hg: '#cdb294', hemi: 0.9, light: 1.7 },
  { e: 16, zen: '#3c78cc', hor: '#eadfcf', sun: '#ffe6c2', hs: '#c6d4ee', hg: '#d6c3a8', hemi: 0.95, light: 1.9 },
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
  clear: { haze: 1.2e-4, mist: 0.0006, fog: 0, storm: 0 },
  valley: { haze: 3.5e-4, mist: 0.0022, fog: 0, storm: 0 },
  storm: { haze: 5e-4, mist: 0, fog: 0.016, storm: 1 },
};
export const W_NOW = { ...WEATHER.clear }; export const SKY = { target: WEATHER.clear, haze: true };   // the preset the weather eases to (Weather buttons), and the Distance haze switch

