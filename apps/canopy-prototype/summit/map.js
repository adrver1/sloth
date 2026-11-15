// Summit Cabin's map: the level's side of the shared map and compass (camp/mapCompass.js, which both levels use: Adriaen
// 2026-11-15). buildMap() lays them on the jeep's hood once it has loaded (road.js calls carry.setHood); carry.step(dt, bright)
// each frame. This file paints the summit's ground: the hill shading, contours, forest, ice, the road, the ridge walk and
// the places, on a 1.2 km square (MAP) with 150 m grid squares.
import * as THREE from 'three';
import { BIG, BW, CL, ROAD, TOWER, TRIS, forestAt, height, onIce } from './land.js';
import { camera, hazed, scene } from './core.js';
import { buildMapCompass } from '../camp/mapCompass.js';

export let carry;
const MAP = { cx: -20, cz: -230, S: 1200, PX: 1024, G: 8 };   // 1.2 km square: the summit, the road and tunnel, the watch hill and the big lake below
// paint(kit): about 90k height samples, the first time the map is needed
function paint({ g, W, uv, line, tag, spot, grid }) {
  const N = 300, img = new ImageData(N, N), H = new Float32Array(N * N), step = MAP.S / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = MAP.cx + MAP.S / 2 - (i + 0.5) * step, z = MAP.cz + MAP.S / 2 - (j + 0.5) * step; H[j * N + i] = height(x, z); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, h = H[k], hx = H[j * N + Math.min(i + 1, N - 1)] - H[j * N + Math.max(i - 1, 0)], hz = H[Math.min(j + 1, N - 1) * N + i] - H[Math.max(j - 1, 0) * N + i];
    const x = MAP.cx + MAP.S / 2 - (i + 0.5) * step, z = MAP.cz + MAP.S / 2 - (j + 0.5) * step, sl = Math.hypot(hx, hz) / (2 * step), ny = 1 / Math.sqrt(1 + sl * sl);
    const shade = Math.max(0.55, Math.min(1.12, 0.92 + (-hx + -hz) / (2 * step) * 0.35));   // lit from the north-west (map top left)
    let c = [236, 228, 208];   // paper
    if (onIce(x, z, h)) c = [196, 218, 230]; else { const f = forestAt(x, z, h, 1 - ny); c = [c[0] - 70 * f, c[1] - 46 * f, c[2] - 66 * f]; if (sl > 1.1) c = [c[0] - 30, c[1] - 30, c[2] - 26]; }
    const band = Math.floor(h / 25), cont = band !== Math.floor(H[j * N + Math.min(i + 1, N - 1)] / 25) || band !== Math.floor(H[Math.min(j + 1, N - 1) * N + i] / 25), major = cont && band % 4 === 0;
    const o = k * 4; for (let q = 0; q < 3; q++) img.data[o + q] = Math.max(0, Math.min(255, c[q] * shade * (cont ? (major ? 0.62 : 0.82) : 1))); img.data[o + 3] = 255; }
  const small = document.createElement('canvas'); small.width = small.height = N; small.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, W, W);
  line(ROAD.pts.map((p) => [p[0], p[1]]), '#3a2f28', 5); line(ROAD.pts.filter((p) => p[2] >= ROAD.b0).map((p) => [p[0], p[1]]), '#8a6a4a', 3);
  line(BW.filter((p, i) => i % 4 === 0).map((p) => [p[0], p[1]]), '#b2361e', 3.2, [7, 4]);
  grid();
  // places
  spot(0, 0, 'Cabin', 0, -26); spot(TOWER.x, TOWER.z, 'Lookout', 0, -26, 'tri'); spot(CL.x, CL.z, 'Clearing', 0, 28);
  spot(ROAD.portal.x, ROAD.portal.z, 'Tunnel', 0, 26); tag('Big lake', ...uv(BIG.x, BIG.z + 140), 30, '#3b5f78');
}

export function buildMap() {
  carry = buildMapCompass({ scene, camera, map: MAP, paint, lit: (o) => hazed(new THREE.MeshLambertMaterial(o)) });
  TRIS.push(['Map and compass (on the hood and in your hands, 2 + 48 each)', 100]);
}
