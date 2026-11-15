// Summit Cabin horizon: far ranges painted on one ring at 22 km that follows the camera (main.js moves it). MADE_FROM marks
// where the man-made scene starts, for ?bare=1.
import * as THREE from 'three';
import { TRIS, ridged } from './land.js';
import { canvasTex, hazed, scene, tris } from './core.js';

// ---------------------------------------------------------------- the painted horizon: far ranges on a ring at 22 km
export const HOR_R = 22000, HOR_LO = -1500, HOR_HI = 3800;
const horizonTex = canvasTex(4096, 512, (g, w, h) => {
  const row = (m) => ((HOR_HI - m) / (HOR_HI - HOR_LO)) * h;
  const layers = [{ base: 700, amp: 2400, k: 3, snow: '#eef3f9', shade: '#b8c6d8', foot: '#a3b2c6' }, { base: 300, amp: 1700, k: 5, snow: '#e6edf5', shade: '#9fb0c4', foot: '#8c9db3' }, { base: -100, amp: 1100, k: 8, snow: '#dfe7f0', shade: '#8798ae', foot: '#73859c' }];
  for (const L of layers) {
    const sil = new Float32Array(w);
    for (let x = 0; x < w; x++) { const a = (x / w) * Math.PI * 2; sil[x] = L.base + L.amp * ridged(Math.cos(a) * L.k + L.k * 3, Math.sin(a) * L.k - L.k, 5); }
    for (let x = 0; x < w; x++) { const y = row(sil[x]), dy = sil[(x + 1) % w] - sil[(x + w - 1) % w];
      g.fillStyle = dy > 0 ? L.snow : L.shade; g.fillRect(x, y, 1, 26 + (sil[x] - L.base) / 40);
      g.fillStyle = L.foot; g.fillRect(x, y + 26 + (sil[x] - L.base) / 40, 1, h); }
  }
});
horizonTex.wrapS = THREE.RepeatWrapping; horizonTex.repeat.x = 2;
export const horMat = hazed(new THREE.MeshBasicMaterial({ map: horizonTex, transparent: true, depthWrite: false, side: THREE.BackSide }));
horMat.defines = { HAZE_MUL: '0.55' };
export const horizon = new THREE.Mesh(new THREE.CylinderGeometry(HOR_R, HOR_R, HOR_HI - HOR_LO, 64, 1, true), horMat);
horizon.position.y = (HOR_HI + HOR_LO) / 2; horizon.frustumCulled = false; horizon.renderOrder = -5; scene.add(horizon); export const MADE_FROM = scene.children.length;   // everything added from here to the snow is man-made (hidden when BARE)
// the horizon texture is painted with its own transparent sky; a transparent object drawn after the opaque terrain only shows where nothing nearer is
TRIS.push(['Painted horizon ring', tris(horizon.geometry)]);

