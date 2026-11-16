// Summit Cabin road: the level's edges (fences), the road in with its bridge and tunnel, the jeep (models/jeep_expedition.txt,
// a box LOD beyond 110 m, the map and compass go on its hood), and the mud tracks round the camp. Builds on import.
import * as THREE from 'three';
import { groundLight, setRelief } from './groundLight.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BW, BW_CORNERS, HT, JEEP, PLAT_R, ROAD, ROAD_Y, SNOWMAN as SM, TOP, TOWER, TRIS, bwY, edgeR, groundAt, height, isPhone, mulberry, polyNear, roadNear, trailHalf } from './land.js';
import { camera, canvasTex, hazed, renderer, scene, tris } from './core.js';
import { rigJeep } from '../camp/jeepRig.js';
import { tmpC } from './terrain.js';
import { m4, q, rockGeo, rocks, sc, up, v3 } from './forest.js';
import { fetchBytes } from '../bakedlight.js';
import { M, bakeStatic, placeTris } from './cabin.js';
import { mute, tris0 } from './scoutCamp.js';
import { carry } from './map.js';
import { dropHoodMap } from '../camp/mapCompass.js';
import { P } from './daylight.js';

// ---------------------------------------------------------------- the level's edges, the road in, the jeep, mud round the camp
// The level is the summit, the road and the lookout trail. What stops you is what you see: a split-rail fence along the cliff
// and round the open side, a line of snowy boulders against the mountain behind, the road ending in the tunnel mouth.
const woodC = (top) => tmpC.set(top ? '#f1f0ee' : '#6b625a').clone();
const snowTopBox = (w, h, d, wood = '#6b625a') => { const g = new THREE.BoxGeometry(w, h, d), n = g.attributes.normal, C = [];
  for (let i = 0; i < n.count; i++) { tmpC.set(n.getY(i) > 0.5 ? '#f1f0ee' : wood); if (n.getY(i) < -0.5) tmpC.multiplyScalar(0.6); C.push(tmpC.r, tmpC.g, tmpC.b); } g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); return g; };
const fenceMat = hazed(new THREE.MeshLambertMaterial({ vertexColors: true }));
// a post's drift: the snow heaped round its foot (Adriaen 2026-11-16: the ground's snow should look as deep as the roof's), a
// eight-sided open cone in snow white, its foot 4 cm under the ground, its tip inside the post; 8 triangles, in the post's draw.
// r: its reach (m), h: its height, g: where the ground is in the post's frame
function driftCollar(r, h, g) { const c = new THREE.ConeGeometry(r, h, 8, 1, true).translate(0, g - 0.04 + h / 2, 0), C = [];
  for (let i = 0; i < c.attributes.position.count; i++) { tmpC.set('#f1f0ee'); C.push(tmpC.r, tmpC.g, tmpC.b); }
  c.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); return c; }
// Fences (Adriaen 2026-11-16: "the fence / rail needs to be better aligned ... no unnatural gaps or weird angles"): a post at
// every corner of the line and evenly between (about every `step` m), two rails from post to post that climb and fall with the
// ground, so they meet the posts at the same height on both sides. Fences end on the boardwalk's own end posts (shared, so
// no gap and no double post) and at the road's shoulder.
// fencePosts(line, step): the posts along a polyline [[x, z], ...], corners (a turn of more than 12°) kept as posts
function fencePosts(line, step) {
  const out = [line[0]], cut = [0];
  for (let i = 1; i < line.length - 1; i++) { const [ax, az] = line[i - 1], [bx, bz] = line[i], [cx, cz] = line[i + 1], t = Math.abs(Math.atan2((bx - ax) * (cz - bz) - (bz - az) * (cx - bx), (bx - ax) * (cx - bx) + (bz - az) * (cz - bz))); if (t > 0.21) cut.push(i); }
  cut.push(line.length - 1);
  for (let c = 0; c < cut.length - 1; c++) { const seg = line.slice(cut[c], cut[c + 1] + 1), acc = [0];
    for (let i = 1; i < seg.length; i++) acc.push(acc[i - 1] + Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]));
    const L = acc[acc.length - 1], n = Math.max(1, Math.round(L / step));
    for (let k = 1; k <= n; k++) { const d = (L * k) / n; let i = 1; while (i < seg.length - 1 && acc[i] < d) i++; const t = (d - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
      out.push([seg[i - 1][0] + (seg[i][0] - seg[i - 1][0]) * t, seg[i - 1][1] + (seg[i][1] - seg[i - 1][1]) * t]); } }
  return out;
}
// railLine(ps, label, { skip }): posts at ps (but not at the indices in skip: they are another fence's), rails between them
function railLine(ps, label, { skip = [] } = {}) {
  const postG = mergeGeometries([snowTopBox(0.16, 2.25, 0.16).translate(0, 0.12, 0), driftCollar(0.38, 0.16, 0.05)]), railG = snowTopBox(1, 0.1, 0.09), np = ps.length - skip.length;
  const posts = new THREE.InstancedMesh(postG, fenceMat, np), rails = new THREE.InstancedMesh(railG, fenceMat, (ps.length - 1) * 2), e = new THREE.Euler();
  let n = 0; ps.forEach(([x, z], i) => { const g = groundAt(x, z); if (!skip.includes(i)) posts.setMatrixAt(n++, m4.makeTranslation(x, g - 0.05, z));   // 1 m of each post is in the ground: coarser terrain rings further off sit lower than height() across a slope
    if (i) { const [px, pz] = ps[i - 1], pg = groundAt(px, pz), L = Math.hypot(x - px, z - pz), rise = g - pg, yaw = -Math.atan2(z - pz, x - px);
      for (const [k, hh] of [[0, 0.5], [1, 1.02]]) { const sag = k ? 0 : 0.03 * Math.sin(i * 2.1);   // the lower rail a little uneven, as split rails are
        rails.setMatrixAt((i - 1) * 2 + k, m4.compose(v3.set((x + px) / 2, (g + pg) / 2 + hh + sag, (z + pz) / 2), q.setFromEuler(e.set(0, yaw, Math.atan2(rise, L), 'YZX')), sc.set(Math.hypot(L, rise) + 0.12, 1, 1))); } } });
  posts.castShadow = rails.castShadow = true; scene.add(posts, rails);
  TRIS.push([`${label} (${np} posts × 20 with their drift, ${(ps.length - 1) * 2} rails × 12)`, tris(postG, np) + tris(railG, (ps.length - 1) * 2)]);
}
// the boardwalk's joints: where its pieces meet (a bend, a stair's foot or head, or every 3 m), with the mitred side offset
// there, so its rails meet at the corners; its posts and the fences that end on it stand on these
const BW_SIDE = 1.0;
export const BW_JOINTS = (() => {
  const dir = (i) => { const P = BW[Math.max(i - 1, 0)], Q = BW[Math.min(i, BW.length - 1)]; return Math.atan2(Q[1] - P[1], Q[0] - P[0]); };
  const at = [0]; let st = 0; for (let i = 1; i <= BW.length; i++) if (i === BW.length || Math.abs(dir(i) - dir(st + 1)) > 0.02 || BW[i][2] - BW[st][2] > 3) { const e = Math.min(i, BW.length - 1); if (e !== at[at.length - 1]) at.push(e); st = i; }
  const J = at.map((i) => ({ i, x: BW[i][0], z: BW[i][1], y: BW[i][3], stair: BW[i][4] }));
  J.forEach((j, k) => { const nrm = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
    const n0 = k ? nrm(J[k - 1], j) : nrm(j, J[k + 1]), n1 = k < J.length - 1 ? nrm(j, J[k + 1]) : n0; let nx = n0[0] + n1[0], nz = n0[1] + n1[1]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const m = BW_SIDE / Math.max(0.5, nx * n0[0] + nz * n0[1]); j.side = (sd) => [j.x + nx * m * sd, j.z + nz * m * sd]; });
  return J;
})();
{ // the cliff rail: from the boardwalk's south rail where it leaves the summit, round the edge (land.js edgeR), clockwise along
  // the cliff, to the road's shoulder; and the hilltop's ring, from one of the boardwalk's end posts round to the other
  const s0 = BW_JOINTS[0].side(-1), line = [s0]; let a = Math.atan2(s0[1], s0[0]);
  for (; a > -3.3; a -= 0.004) { const r = edgeR(a), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.hypot(x - s0[0], z - s0[1]) < 0.6 && line.length === 1) continue;
    const rd = x < -12 ? roadNear(x, z) : null; if (rd && rd.d < 3.1) { line.push([x, z]); break; } line.push([x, z]); }
  railLine(fencePosts(line, 2.4), 'Cliff rail', { skip: [0] });
  const end = BW_JOINTS[BW_JOINTS.length - 1], A = end.side(1), B = end.side(-1), R = (Math.hypot(A[0] - HT.x, A[1] - HT.z) + Math.hypot(B[0] - HT.x, B[1] - HT.z)) / 2;
  let a0 = Math.atan2(A[1] - HT.z, A[0] - HT.x), a1 = Math.atan2(B[1] - HT.z, B[0] - HT.x); const g = ((a1 - a0) % 6.283 + 6.283) % 6.283;   // the long way round: from A over to B the far side of the hilltop
  const sweep = g > Math.PI ? g : g - 6.283, ring = [A]; for (let k = 1; k < 120; k++) { const t = a0 + (sweep * k) / 120; ring.push([HT.x + Math.cos(t) * R, HT.z + Math.sin(t) * R]); } ring.push(B);
  const hp = fencePosts(ring, 2.4); railLine(hp, 'Hilltop rail', { skip: [0, hp.length - 1] });
}
const roadTex = canvasTex(128, 256, (g, w, h) => { const r = mulberry(31);   // packed snow and mud, two dark wheel ruts, slush thrown to the sides
  g.fillStyle = '#b9b3ab'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '95,82,70' : '230,232,236'},${0.15 + 0.3 * r()})`; g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 8, 2 + r() * 14, 0, 0, 7); g.fill(); }
  for (const cx of [0.3, 0.7]) { const gr = g.createLinearGradient(w * (cx - 0.1), 0, w * (cx + 0.1), 0); gr.addColorStop(0, 'rgba(70,58,48,0)'); gr.addColorStop(0.5, 'rgba(62,50,40,.95)'); gr.addColorStop(1, 'rgba(70,58,48,0)'); g.fillStyle = gr; g.fillRect(w * (cx - 0.1), 0, w * 0.2, h);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(40,32,26,${0.3 + 0.4 * r()})`; g.fillRect(w * cx + (r() - 0.5) * 10, r() * h, 2 + r() * 3, 4 + r() * 10); } }
  for (const ex of [0, 1]) { const gr = g.createLinearGradient(ex ? w * 0.88 : 0, 0, ex ? w : w * 0.12, 0); gr.addColorStop(ex ? 0 : 1, 'rgba(245,246,248,0)'); gr.addColorStop(ex ? 1 : 0, 'rgba(245,246,248,1)'); g.fillStyle = gr; g.fillRect(ex ? w * 0.88 : 0, 0, w * 0.12, h); } }, true);
const roadMat = hazed(new THREE.MeshLambertMaterial({ map: roadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
const bridge = new THREE.Group();

export function buildRoad() {
  { // the boardwalk itself: every piece a scaled snow-topped box in one draw (deck planks, stair treads, stringers, rails, posts, legs)
    const M4 = [], put = (x, y, z, sx, sy, sz, yaw = 0, pitch = 0) => M4.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, pitch, 'YZX')), new THREE.Vector3(sx, sy, sz)));
    // pieces: a new one wherever landing turns to stair, the path bends, or 3 m is reached, so boards, rails and posts all follow the path
    const dir = (i) => { const P = BW[Math.max(i - 1, 0)], Q = BW[Math.min(i, BW.length - 1)]; return Math.atan2(Q[1] - P[1], Q[0] - P[0]); };
    const runs = []; let st = 0; for (let i = 1; i <= BW.length; i++) if (i === BW.length || Math.abs(dir(i) - dir(st + 1)) > 0.02 || BW[i][2] - BW[st][2] > 3) { runs.push([st, Math.min(i, BW.length - 1), BW[st][4]]); st = i; }
    for (const [i0, i1] of runs) { const A = BW[i0], B = BW[i1], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz); if (L < 0.05) continue; const yaw = -Math.atan2(dz, dx), nx = -dz / L, nz = dx / L, rise = B[3] - A[3], stair = Math.abs(rise) / L > 0.1;
      if (!stair) put((A[0] + B[0]) / 2, (A[3] + B[3]) / 2 - 0.06, (A[1] + B[1]) / 2, Math.hypot(L, rise) + 0.04, 0.12, 1.9, yaw, Math.atan2(rise, L));   // deck, gently sloping
      else { const n = Math.max(1, Math.round(Math.abs(rise) / 0.22)); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; put(A[0] + dx * t, A[3] + rise * ((k + (rise > 0 ? 1 : 0)) / n) - 0.06, A[1] + dz * t, L / n + 0.05, 0.1, 1.9, yaw); }   // treads
        for (const sd of [-1, 1]) put((A[0] + B[0]) / 2 + nx * 0.98 * sd, (A[3] + B[3]) / 2 - 0.15, (A[1] + B[1]) / 2 + nz * 0.98 * sd, Math.hypot(L, rise), 0.28, 0.08, yaw, Math.atan2(rise, L)); }   // stringers
    }
    for (const [cx, cz] of BW_CORNERS) { const b = polyNear(BW, cx, cz), P = BW[Math.max(b.i - 4, 0)], Q = BW[Math.min(b.i + 4, BW.length - 1)]; put(cx, bwY(b) - 0.06, cz, 2.3, 0.12, 2.3, -Math.atan2((P[1] + Q[1]) / 2 - cz, (P[0] + Q[0]) / 2 - cx)); }   // a square landing at each turn
    // hand rails from joint to joint on the mitred sides, so they meet at the bends; a post at every joint, from 0.8 m in the ground (so it
    // never floats over the coarser terrain further off) up
    // through the rail (BW_JOINTS: the cliff rail and the hilltop's ring end on the first and last of these)
    for (let k = 0; k < BW_JOINTS.length; k++) { const j = BW_JOINTS[k];
      for (const sd of [-1, 1]) { const [px, pz] = j.side(sd), g = height(px, pz); put(px, (j.y + 1.2 + g - 0.8) / 2, pz, 0.12, j.y + 1.2 - g + 0.8, 0.12);
        if (k) { const [qx, qz] = BW_JOINTS[k - 1].side(sd), L = Math.hypot(px - qx, pz - qz), rise = j.y - BW_JOINTS[k - 1].y; put((px + qx) / 2, (j.y + BW_JOINTS[k - 1].y) / 2 + 1.0, (pz + qz) / 2, Math.hypot(L, rise) + 0.1, 0.09, 0.09, -Math.atan2(pz - qz, px - qx), Math.atan2(rise, L)); } } }
    const geo = snowTopBox(1, 1, 1), wMat = hazed(new THREE.MeshLambertMaterial({ vertexColors: true }), (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n gl_Position = projectionMatrix * vec4(mvPosition.xyz * 0.975, 1.0);'); }, 'boardwalk');
    const cells = new Map(); for (const m of M4) { const k = Math.floor(m.elements[12] / 40) + ',' + Math.floor(m.elements[14] / 40); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(m); }
    for (const list of cells.values()) { const walk = new THREE.InstancedMesh(geo, wMat, list.length); list.forEach((m, i) => walk.setMatrixAt(i, m)); walk.computeBoundingSphere(); walk.castShadow = walk.receiveShadow = true; scene.add(walk); }   // 40 m pieces, so the parts out of view (and out of the shadow map) are skipped   // drawn 2.5 % nearer the eye (same spot on screen): far terrain is coarser than the cutting
    TRIS.push([`Boardwalk and stairs (${BW[BW.length - 1][2].toFixed(0)} m, climbs ${(BW[BW.length - 1][3] - TOP).toFixed(0)} m; ${M4.length} boards × 12)`, tris(geo, M4.length)]);
  }
  { // boulders: a wall of them behind the camp where the mountain begins, and a few along the lookout trail and round its hill
    const spots = [];
    for (let a = 2.74; a > 0.98; a -= 0.1) { const r = PLAT_R + 1.5 + Math.sin(a * 13) * 0.8; spots.push([Math.cos(a) * r, Math.sin(a) * r, 1.5 + 0.7 * Math.abs(Math.sin(a * 7.3))]); }
    if (false) for (let a = 0; a < 6.283; a += 0.09) spots.push([TOWER.x + Math.cos(a) * 162, TOWER.z + Math.sin(a) * 162, 1.2 + 0.7 * Math.abs(Math.sin(a * 5.1))]);
    const edge = new THREE.InstancedMesh(rockGeo, rocks.material, spots.length);
    spots.forEach(([x, z, sz], i) => edge.setMatrixAt(i, m4.compose(v3.set(x, height(x, z) + sz * 0.2, z), q.setFromAxisAngle(up, i * 2.4), sc.set(sz, sz, sz)))); edge.castShadow = true; scene.add(edge);
    TRIS.push([`Edge boulders (${spots.length} × 20)`, tris(rockGeo, spots.length)]);
  }
  { // the road on land: a 5 m ribbon laid on its bed
    const P = [], UV = [], I = [], pts = ROAD.pts.filter((p) => p[2] <= ROAD.b0 + 4);
    pts.forEach(([x, z, s2], i) => { const n = pts[Math.min(i + 1, pts.length - 1)], m = pts[Math.max(i - 1, 0)], dx = n[0] - m[0], dz = n[1] - m[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
      for (const sd of [-1, 1]) { const px = x + nx * 2.6 * sd, pz = z + nz * 2.6 * sd; P.push(px, Math.max(height(px, pz), ROAD_Y(s2) - 0.05) + 0.06, pz); UV.push(sd < 0 ? 0 : 1, s2 / 7); }
      if (i) I.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
    const road = new THREE.Mesh(g, roadMat); road.receiveShadow = true; scene.add(road); TRIS.push(['Road on land', I.length / 3]);
  }
  scene.add(bridge);
  { // the bridge: a deck from where the ground falls away straight into the tunnel, timber posts and rails, concrete piers
    const A = ROAD.pts.find((p) => p[2] >= ROAD.b0), B = ROAD.portal, L = Math.hypot(B.x - A[0], B.z - A[1]), yaw = -Math.atan2(B.z - A[1], B.x - A[0]), y = ROAD.y;
    const along = (k, side = 0) => { const dx = (B.x - A[0]) / L, dz = (B.z - A[1]) / L; return [A[0] + dx * L * k - dz * side, A[1] + dz * L * k + dx * side]; };
    const put = (geo, mat, k, side, yy, sx = 1, sy = 1, sz = 1) => { const [x, z] = along(k, side), m = new THREE.Mesh(geo, mat); m.position.set(x, yy, z); m.rotation.y = yaw; m.scale.set(sx, sy, sz); m.castShadow = m.receiveShadow = true; bridge.add(m); return m; };
    put(new THREE.BoxGeometry(L + 1, 0.7, 6.2), M.wood, 0.5, 0, y - 0.38);
    const top = put(new THREE.PlaneGeometry(L + 1, 5.2).rotateX(-Math.PI / 2), roadMat, 0.5, 0, y + 0.01); roadTex.wrapS = THREE.RepeatWrapping;
    { const uv = top.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, (u * (L + 1)) / 7); } }
    const n = Math.round(L / 3), postG = snowTopBox(0.2, 1.1, 0.2).translate(0, 0.55, 0), posts = new THREE.InstancedMesh(postG, fenceMat, (n + 1) * 2);
    for (let i = 0; i <= n; i++) for (const sd of [-1, 1]) { const [x, z] = along(i / n, sd * 2.9); posts.setMatrixAt(i * 2 + (sd > 0), m4.makeTranslation(x, y, z)); }
    posts.castShadow = true; bridge.add(posts);
    for (const sd of [-1, 1]) for (const hh of [0.55, 1.08]) put(snowTopBox(L, 0.12, 0.12), fenceMat, 0.5, sd * 2.9, y + hh);
    const pierG = snowTopBox(1.4, 1, 4.6, '#7d7a75').translate(0, -0.5, 0); let piers = 0;
    for (let k = 0.18; k < 0.95; k += 0.2) { const [x, z] = along(k), gh = height(x, z); if (y - gh > 3) { put(pierG, fenceMat, k, 0, y - 0.7, 1, y - 0.7 - gh + 2, 1); piers++; } }
    TRIS.push([`Bridge (${L.toFixed(0)} m: deck, ${(n + 1) * 2} posts, 4 rails, ${piers} piers)`, placeTris(bridge)]); bakeStatic(bridge);
  }
  { // the tunnel mouth, painted: a concrete portal in the rock with darkness inside and icicles on the lip
    const tex = canvasTex(512, 384, (g, w, h) => { const r = mulberry(17);
      g.fillStyle = '#55555a'; g.beginPath(); for (let i = 0; i <= 40; i++) { const a = Math.PI + (i / 40) * Math.PI, rr = 0.86 + 0.14 * r(); g.lineTo(w / 2 + Math.cos(a) * w * 0.5 * rr, h - (Math.sin(-a) * h * 0.95 * rr)); } g.closePath(); g.fill(); g.save(); g.clip();
      for (let i = 0; i < 260; i++) { const c = 70 + r() * 60 | 0; g.fillStyle = `rgba(${c},${c - 4},${c - 8},.6)`; g.beginPath(); g.moveTo(r() * w, r() * h); g.lineTo(r() * w, r() * h); g.lineTo(r() * w, r() * h); g.fill(); }
      g.fillStyle = '#f2f2f0'; for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(r() * w, r() * h * 0.6, 10 + r() * 30, 3 + r() * 6, 0, 0, 7); g.fill(); }
      g.restore(); g.fillStyle = '#9b978f'; g.fillRect(w * 0.22, h * 0.25, w * 0.56, h * 0.75); g.beginPath(); g.ellipse(w / 2, h * 0.47, w * 0.28, h * 0.22, 0, Math.PI, 0); g.fill();
      const gr = g.createLinearGradient(0, h * 0.35, 0, h); gr.addColorStop(0, '#07080a'); gr.addColorStop(1, '#1c1b1a'); g.fillStyle = gr;
      g.beginPath(); g.moveTo(w * 0.29, h); g.lineTo(w * 0.29, h * 0.5); g.ellipse(w / 2, h * 0.5, w * 0.21, h * 0.17, 0, Math.PI, 0); g.lineTo(w * 0.71, h); g.fill();
      g.fillStyle = '#e8eef4'; for (let i = 0; i < 18; i++) { const x = w * (0.3 + 0.4 * r()); g.beginPath(); g.moveTo(x - 4, h * 0.36); g.lineTo(x + 4, h * 0.36); g.lineTo(x, h * (0.4 + 0.08 * r())); g.fill(); }
      g.fillStyle = '#f4f4f2'; g.fillRect(w * 0.2, h * 0.22, w * 0.6, h * 0.04); });
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(22, 16.5).rotateY(Math.PI / 2), hazed(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 }), (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n gl_Position = projectionMatrix * vec4(mvPosition.xyz * 0.93, 1.0);'); }, 'mouth'));   // its rock is coarse far away; the painted mouth must still show
    mouth.position.set(ROAD.portal.x + 0.3, ROAD.y - 0.7 + 16.5 * 0.5, ROAD.portal.z); mouth.receiveShadow = true; scene.add(mouth);
    TRIS.push(['Tunnel mouth (painted)', 2]);
  }
  { // the jeep that brought us, parked at the head of the road; the camp's own Expedition model
    const g = new THREE.Group(); g.position.set(JEEP.x, TOP, JEEP.z); g.rotation.y = JEEP.turn; scene.add(g); JEEP.node = g;   // drive.js drives it
    fetchBytes('models/jeep_expedition.txt').then((bin) => {
      new GLTFLoader().parse(bin.buffer, '', (gl) => { let n = 0;
        const glass = hazed(new THREE.MeshLambertMaterial({ color: 0xa9c4cc, transparent: true, opacity: 0.25, depthWrite: false }), null, 'glass');   // see-through, a little tinted, as camp/jeep.js does
        gl.scene.traverse((o) => { if (!o.isMesh) return; if (o.name.startsWith('Glass')) { o.material = glass; o.renderOrder = 2; o.castShadow = false; n += tris0(o.geometry); return; } const m0 = o.material; o.material = hazed(new THREE.MeshLambertMaterial({ map: m0.map || null, color: m0.map ? 0xffffff : m0.color, vertexColors: !!o.geometry.attributes.color, side: m0.side, transparent: m0.transparent, opacity: m0.opacity, alphaTest: m0.alphaTest }), mute, 'mute');
          o.castShadow = false; o.receiveShadow = true; n += tris0(o.geometry); });
        dropHoodMap(gl.scene);   // the map and compass lie there instead (camp/mapCompass.js)
        // not merged: the road wheels (they turn, drive.js), the doors and the hood (they swing, camp/jeepRig.js) and the cabin lamp's lens (it lights)
        const moves = (o) => { for (let q = o; q && q !== gl.scene; q = q.parent) if (q.userData.roll || q.userData.open !== undefined || q.name === 'CabinLight') return true; return false; };
        bakeStatic(gl.scene, moves);
        // its shadow comes from seven boxes (84 triangles) round body, cab, load and wheels, not its 6k triangles; drawn depth-only, never seen
        const box = (x0, y0, z0, x1, y1, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        const sh = new THREE.Mesh(mergeGeometries([box(-0.88, 0.45, -1.75, 0.88, 1.15, 1.95), box(-0.8, 1.15, -1.65, 0.8, 1.65, 0.4), box(-0.6, 1.65, -1.4, 0.6, 2.1, 0.2), ...[[-1, -1.15], [1, -1.15], [-1, 1.25], [1, 1.25]].map(([sx, z]) => box(sx * 0.9 - 0.12, 0, z - 0.33, sx * 0.9 + 0.12, 0.6, z + 0.33))]), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
        sh.castShadow = true; gl.scene.add(sh);
        const far = new THREE.Mesh(sh.geometry, hazed(new THREE.MeshLambertMaterial({ color: '#56603f' }))); far.visible = false; g.add(far); JEEP.lod = [gl.scene, far];   // the same boxes, painted, stand in beyond 110 m
        TRIS.push(['Jeep shadow boxes, and the jeep beyond 110 m', 84]);
        g.add(gl.scene); TRIS.push(['Jeep (Expedition)', n]);
        // its doors, hood and cabin lamp work as the camp's (camp/jeepRig.js; no cabin spot light here: one more light would
        // recompile every material in this big scene); main.js steps it and seats you in it (camp/jeepSeat.js)
        JEEP.rig = rigJeep(gl.scene, { camera, renderer, spot: false });
        carry.setHood(gl.scene);   // after the rig, so its merged copy leaves them out
      }); }).catch((e) => console.warn('jeep', e));
  }

  { // mud: wheel ruts from the road to the jeep, and the paths worn between jeep, porch, camp, woodpile and the trail head
    const S = 44, PX = isPhone ? 1024 : 2048, k = PX / S, tex = canvasTex(PX, PX, (g) => { const r = mulberry(23), at = ([x, z]) => [(x + S / 2) * k, (z + S / 2) * k];
      paintCampSnow(g, at, k, mulberry(31));   // the lived-in snow round the camp first, the paths over it
      const path = (pts, wid, col, a) => { g.lineCap = g.lineJoin = 'round'; for (let pass = 0; pass < 3; pass++) { g.strokeStyle = col; g.globalAlpha = a * (pass === 0 ? 0.35 : pass === 1 ? 0.55 : 0.9); g.lineWidth = wid * k * (pass === 0 ? 1.8 : pass === 1 ? 1.3 : 0.8);
        g.beginPath(); pts.forEach((p, i) => { const [x, y] = at(p); const j = pass && wid > 0.6 ? (r() - 0.5) * 4 : 0; i ? g.lineTo(x + j, y + j) : g.moveTo(x, y); }); g.stroke(); } g.globalAlpha = 1; };
      const ruts = (pts) => { for (const o of [-0.8, 0.8]) path(pts.map(([x, z], i) => { const n = pts[Math.min(i + 1, pts.length - 1)], m = pts[Math.max(i - 1, 0)], dx = n[0] - m[0], dz = n[1] - m[1], l = Math.hypot(dx, dz) || 1; return [x - (dz / l) * o, z + (dx / l) * o]; }), 0.32, '#5e4d40', 0.55); };
      path([[-17.4, 2.45], [-13, 1.6], [-9, 1.4]], 2.8, '#8a7a6a', 0.55); ruts([[-17.4, 2.45], [-14.5, 1.6], [-13, 1.3]]);   // from where the road's ribbon ends (x -17), not over it: drawn twice it read as a doubled road (Adriaen 2026-11-15)
      const foot = (pts) => { path(pts, 1.3, '#a99b8c', 0.45); path(pts, 0.6, '#7a6a5c', 0.5); };
      // one network, every path starting or ending on another (Adriaen 2026-11-16: "the dirt paths are disconnected", "there is no
      // path to the front door, which would be the most frequented one"): the front door's step (DOOR) is the hub, with the
      // jeep's mud (ROADEND), the fire, both porch steps round the cabin's ends, and the trail head off it. Shared points are
      // the same array, so the strokes' round ends overlap.
      const DOOR = [0, 6.3], ROADEND = [-9, 1.4], FIREW = [0.4, 9.6], EAST = [-7.1, -5.6], WEST = [7.1, -5.6], WSIDE = [7.4, -1.6], NW = [4.2, 6.9];
      path([DOOR, [-0.3, 7.6], FIREW], 1.9, '#a99b8c', 0.35);   // the busiest stretch, door to fire: wider worn ground under the foot path
      foot([ROADEND, [-6.2, 3.3], [-3, 5.9], DOOR]);   // jeep to the front door, past the chopping stump
      foot([DOOR, [-0.3, 7.6], FIREW]);   // the front door to the fire
      foot([ROADEND, [-9.3, -1.2], [-8.7, -4.3], EAST]);   // round the cabin's east end to the porch steps
      foot([DOOR, NW, [6.9, 4.4], [7.6, 0.4], WSIDE, WEST]);   // round the west end to the other porch steps
      foot([NW, [7.5, 10.4], [11, 11.5], [15.5, 15.5], [19, 19.5]]); });   // the trail head, off the west path. No loose mud spots round the camp: on the snow they read as gray splotches (Adriaen 2026-11-15)
    const mud = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), hazed(new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), groundLight, 'mud'));   // lit as the snow under it (groundLight.js)
    setRelief(tex);   // its paint is pressed into the snow round it too (groundLight.js RELIEF)
    mud.position.set(0, TOP + 0.02, 0); mud.receiveShadow = true; mud.renderOrder = 1; scene.add(mud); TRIS.push(['Mud tracks (painted)', 2]);
  }
}
// each frame: the jeep shows as its boxes beyond 110 m from the camera (wherever it is: drive.js drives it)
export function roadStep() {
  if (!JEEP.lod) return;
  const p = JEEP.node.position, far = Math.hypot(camera.position.x - p.x, camera.position.z - p.z) > 110; JEEP.lod[0].visible = !far; JEEP.lod[1].visible = far;
}

// The snow round the camp, lived in as the jungle camp's ground is (Adriaen 2026-11-16: "bland and boring compared to the
// jungle"), painted under the paths on the same canvas (world metres; at() takes [x, z] to pixels, k pixels a metre). All of it
// in the snow's own blue-white and earth tones, soft-edged: plain grey spots read as dirt splotches here (Adriaen 2026-11-15).
//   trodden snow: packed, a little blue, round the fire and the seats, to the table, the tent, the crate and the cabin's door
//   boot prints: pairs along the ways people walk and scattered round the fire, sloth prints (three toes) round the seats
//   the fire's melt ring: wet dark earth and ash under the stones, slush round it
//   sawdust and chips round the chopping stump, needles and twigs here and there
function paintCampSnow(g, at, k, r) {
  const blob = (x, z, rad, col, a) => { const [px, py] = at([x, z]), R = rad * k, gr = g.createRadialGradient(px, py, 0, px, py, R);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.6, `rgba(${col},${a * 0.6})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(px - R, py - R, 2 * R, 2 * R); };
  const along = (pts, step, fn) => { for (let i = 0; i < pts.length - 1; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
    for (let d = 0; d < L; d += step) { const t = d / L; fn(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, (x1 - x0) / L, (z1 - z0) / L); } } };
  const FIRE = [0.5, 11.5], SEATS = [[1.2, 13.5], [-1, 12.9], [-1.4, 10.7]], TABLE = [3.9, 12.8], TENT = [-0.9, 16.1], CRATE = [5, 13.2], DOOR = [0, 4.6], SNOWMAN = [SM.x, SM.z], CHOP = [-6.75, 2.9];
  // trodden: overlapping soft blotches, densest at the fire
  for (let i = 0; i < 70; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 3.6; blob(FIRE[0] + Math.cos(a) * d, FIRE[1] + Math.sin(a) * d, 0.6 + r() * 0.9, '150,168,196', 0.10 + r() * 0.08); }
  for (const to of [TABLE, TENT, CRATE, DOOR, ...SEATS]) along([FIRE, to], 0.45, (x, z) => blob(x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, 0.5 + r() * 0.4, '150,168,196', 0.09 + r() * 0.06));
  // trodden round the snowman, and the way to him from the path round the cabin
  for (let i = 0; i < 18; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 1.6; blob(SM.x + Math.cos(a) * d, SM.z + Math.sin(a) * d, 0.5 + r() * 0.6, '150,168,196', 0.09 + r() * 0.07); }
  along([[7.4, -1.6], SNOWMAN], 0.45, (x, z) => blob(x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.45 + r() * 0.35, '150,168,196', 0.08 + r() * 0.05));
  // the fire's melt ring under and round the stones
  blob(FIRE[0], FIRE[1], 2.1, '205,214,228', 0.35); blob(FIRE[0], FIRE[1], 1.55, '120,118,120', 0.45); blob(FIRE[0], FIRE[1], 1.1, '74,60,48', 0.85); blob(FIRE[0], FIRE[1], 0.7, '52,46,44', 0.9);
  for (let i = 0; i < 40; i++) { const a = r() * 6.28, d = 0.9 + r() * 0.5; blob(FIRE[0] + Math.cos(a) * d, FIRE[1] + Math.sin(a) * d, 0.08 + r() * 0.12, '96,92,90', 0.4); }   // ash flecks
  // boot prints: a left and a right, 0.3 m apart along the way, toes pointing on
  const boot = (x, z, dx, dz, side) => { const [px, py] = at([x - dz * side * 0.09, z + dx * side * 0.09]); g.save(); g.translate(px, py); g.rotate(Math.atan2(dz, dx));
    g.fillStyle = 'rgba(128,146,178,0.42)'; g.beginPath(); g.ellipse(0.04 * k, 0, 0.085 * k, 0.045 * k, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(-0.1 * k, 0, 0.045 * k, 0.04 * k, 0, 0, 7); g.fill(); g.restore(); };
  const walk = (pts) => { let side = 1; along(pts, 0.36, (x, z, dx, dz) => { if (r() < 0.85) boot(x + (r() - 0.5) * 0.05, z + (r() - 0.5) * 0.05, dx, dz, side); side = -side; }); };
  walk([[7.4, -1.6], SNOWMAN]);
  for (const to of [TABLE, TENT, CRATE]) walk([[FIRE[0] + (to[0] - FIRE[0]) * 0.35, FIRE[1] + (to[1] - FIRE[1]) * 0.35], to]);
  walk([[-1.5, 9.6], [-0.6, 7.2], DOOR]); walk([DOOR, [-3.5, 4.2], [-6.2, 3.2]]); walk([[3.2, 9.2], [7.4, 5.6], [7.6, 0]]);
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = 1.6 + r() * 1.9; boot(FIRE[0] + Math.cos(a) * d, FIRE[1] + Math.sin(a) * d, Math.cos(a + 1.6 + r()), Math.sin(a + 1.6 + r()), r() < 0.5 ? 1 : -1); }
  // sloth prints: three long toe marks, small, round the seats and the crate
  for (let i = 0; i < 34; i++) { const c = [...SEATS, CRATE, TENT][i % 5], a = r() * 6.28, d = 0.5 + r() * 1.1, [px, py] = at([c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d]);
    g.save(); g.translate(px, py); g.rotate(r() * 6.28); g.fillStyle = 'rgba(120,138,170,0.4)'; for (const o of [-1, 0, 1]) { g.beginPath(); g.ellipse(0.05 * k, o * 0.025 * k, 0.045 * k, 0.01 * k, o * 0.25, 0, 7); g.fill(); } g.restore(); }
  // sawdust and chips round the chopping stump, needles and twigs under the camp
  for (let i = 0; i < 160; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 1.3, [px, py] = at([CHOP[0] + Math.cos(a) * d, CHOP[1] + Math.sin(a) * d]); g.fillStyle = `rgba(${190 + r() * 30 | 0},${145 + r() * 30 | 0},${90 + r() * 25 | 0},${0.5 + r() * 0.4})`; g.fillRect(px, py, 1 + r() * 0.06 * k, 1 + r() * 0.03 * k); }
  for (let i = 0; i < 140; i++) { const a = r() * 6.28, d = 2.4 + r() * 6, [px, py] = at([FIRE[0] + Math.cos(a) * d, FIRE[1] + Math.sin(a) * d]), L = (0.04 + r() * 0.12) * k, b = r() * 6.28;
    g.strokeStyle = `rgba(${70 + r() * 30 | 0},${52 + r() * 20 | 0},${36 + r() * 12 | 0},${0.35 + r() * 0.35})`; g.lineWidth = r() < 0.2 ? 2 : 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(b) * L, py + Math.sin(b) * L); g.stroke(); }
}
