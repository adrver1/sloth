// Summit Cabin ground cover: dry grass poking up through the snow round the camp and the cabin, in clumps, the way the
// jungle camp's ground carries its plants (Adriaen 2026-11-16: the summit looked "bland and boring compared to the jungle",
// and "needs a bit of detail and texture, as illustrated by the jungle"). One instanced draw of crossed cards (two quads,
// 4 triangles a tuft), painted blades on one small canvas texture, normals straight up so a tuft is lit like the snow under it.
// Placed once, on the summit's top only, kept off the paths, the trodden snow round the fire, the cabin, the road and the jeep.
// Exports buildCover() (main.js, after the forest).
import * as THREE from 'three';
import { JEEP, LOOK_TRAIL, TRIS, edgeR, height, isPhone, mulberry, polyNear, roadNear } from './land.js';
import { canvasTex, hazed, scene } from './core.js';

const N = isPhone ? 260 : 420;
export function buildCover() {
  const tex = canvasTex(128, 128, (g, w, h) => { const r = mulberry(5);   // thirty-odd blades fanning up from the bottom middle: straw, ochre and a few grey-green
    for (let i = 0; i < 34; i++) { const x0 = w / 2 + (r() - 0.5) * 30, lean = (r() - 0.5) * 70, top = h * (0.08 + 0.5 * r()), c = r();
      g.strokeStyle = c < 0.5 ? `rgb(${196 + r() * 30 | 0},${160 + r() * 30 | 0},${92 + r() * 20 | 0})` : c < 0.85 ? `rgb(${150 + r() * 30 | 0},${118 + r() * 20 | 0},${70 + r() * 15 | 0})` : `rgb(${120 + r() * 20 | 0},${128 + r() * 20 | 0},${96 | 0})`;
      g.lineWidth = 1.5 + r() * 1.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, h); g.quadraticCurveTo(x0 + lean * 0.3, h - (h - top) * 0.6, x0 + lean, top); g.stroke(); } });
  tex.colorSpace = THREE.SRGBColorSpace;
  const quad = (a) => { const c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5; return [-c, 0, -s, c, 0, s, c, 1, s, -c, 0, -s, c, 1, s, -c, 1, -s]; };
  const geo = new THREE.BufferGeometry(), pos = [...quad(0), ...quad(Math.PI / 2)], uv = [], nrm = [];
  for (let k = 0; k < 2; k++) uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  for (let i = 0; i < 12; i++) nrm.push(0, 1, 0);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const mat = hazed(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide }));
  const tufts = new THREE.InstancedMesh(geo, mat, N), r = mulberry(17), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), sc = new THREE.Vector3();
  const ok = (x, z) => { const a = Math.atan2(z, x); return Math.hypot(x, z) < edgeR(a) - 0.6 && Math.hypot(x - 0.5, z - 11.5) > 4.6 && !(Math.abs(x) < 7.4 && z > -7.6 && z < 5) && (roadNear(x, z)?.d ?? 99) > 3.6
    && polyNear(LOOK_TRAIL, x, z).d > 1.4 && Math.hypot(x - JEEP.x, z - JEEP.z) > 3.6 && Math.hypot(x + 0.9, z - 16.1) > 2.6 && Math.hypot(x - 3.9, z - 12.8) > 1.4 && Math.hypot(x + 2.8, z - 10.9) > 1.2; };
  let n = 0;
  for (let c = 0; c < 2000 && n < N; c++) { const cx = (r() - 0.5) * 60, cz = (r() - 0.5) * 60 + 4; if (!ok(cx, cz)) continue;   // a clump: three to nine tufts within a metre and a half
    for (let k = 0, m = 3 + (r() * 7 | 0); k < m && n < N; k++) { const x = cx + (r() - 0.5) * 1.6, z = cz + (r() - 0.5) * 1.6; if (!ok(x, z)) continue; const s = 0.25 + 0.3 * r();
      q.setFromAxisAngle(up, r() * 6.283); m4.compose(at.set(x, height(x, z) - 0.06, z), q, sc.set(s * 1.4, s, s * 1.4)); tufts.setMatrixAt(n++, m4); } }
  tufts.count = n; tufts.receiveShadow = true; scene.add(tufts);
  TRIS.push(['Dry grass through the snow (' + n + ' tufts, one draw)', 4 * n]);
}
