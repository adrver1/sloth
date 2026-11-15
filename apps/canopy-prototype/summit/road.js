// Summit Cabin road: the level's edges (fences), the road in with its bridge and tunnel, the jeep (models/jeep_expedition.txt,
// a box LOD beyond 110 m, the map and compass go on its hood), and the mud tracks round the camp. Builds on import.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BW, BW_CORNERS, HT, JEEP, PLAT_R, ROAD, ROAD_Y, TOP, TOWER, TRIS, bwY, edgeR, groundAt, height, mulberry, polyNear, trailHalf } from './land.js';
import { camera, canvasTex, hazed, scene, tris } from './core.js';
import { tmpC } from './terrain.js';
import { m4, q, rockGeo, rocks, sc, up, v3 } from './forest.js';
import { fetchBytes } from '../bakedlight.js';
import { M, bakeStatic, placeTris } from './cabin.js';
import { mute, tris0 } from './scoutCamp.js';
import { carry } from './map.js';
import { P } from './daylight.js';

// ---------------------------------------------------------------- the level's edges, the road in, the jeep, mud round the camp
// The level is the summit, the road and the lookout trail. What stops you is what you see: a split-rail fence along the cliff
// and round the open side, a line of snowy boulders against the mountain behind, the road ending in the tunnel mouth.
const woodC = (top) => tmpC.set(top ? '#f1f0ee' : '#6b625a').clone();
const snowTopBox = (w, h, d, wood = '#6b625a') => { const g = new THREE.BoxGeometry(w, h, d), n = g.attributes.normal, C = [];
  for (let i = 0; i < n.count; i++) { tmpC.set(n.getY(i) > 0.5 ? '#f1f0ee' : wood); if (n.getY(i) < -0.5) tmpC.multiplyScalar(0.6); C.push(tmpC.r, tmpC.g, tmpC.b); } g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); return g; };
const fenceMat = hazed(new THREE.MeshLambertMaterial({ vertexColors: true }));
function railLine(ps, label) {

  const postG = snowTopBox(0.16, 1.25, 0.16).translate(0, 0.62, 0), railG = snowTopBox(1, 0.1, 0.09);
  const posts = new THREE.InstancedMesh(postG, fenceMat, ps.length), rails = new THREE.InstancedMesh(railG, fenceMat, (ps.length - 1) * 2);
  ps.forEach(([x, z], i) => { posts.setMatrixAt(i, m4.makeTranslation(x, groundAt(x, z) - 0.05, z));
    if (i) { const [px, pz] = ps[i - 1], L = Math.hypot(x - px, z - pz), yaw = -Math.atan2(z - pz, x - px), y0 = (groundAt(x, z) + groundAt(px, pz)) / 2;
      for (const [k, hh] of [[0, 0.5], [1, 1.02]]) rails.setMatrixAt((i - 1) * 2 + k, m4.compose(v3.set((x + px) / 2, y0 + hh + (k ? 0 : 0.04 * Math.sin(i * 2.1)), (z + pz) / 2), q.setFromAxisAngle(up, yaw), sc.set(L + 0.1, 1, 1))); } });
  posts.castShadow = rails.castShadow = true; scene.add(posts, rails);
  TRIS.push([`${label} (${ps.length} posts × 12, ${(ps.length - 1) * 2} rails × 12)`, tris(postG, ps.length) + tris(railG, (ps.length - 1) * 2)]);
}
{ // the rail: posts every 2.4 m round the edge from the trail head, clockwise along the cliff, to the road; and round the hilltop
  const ps = []; for (let a = 0.66; a > -3.06; ) { const r = edgeR(a); ps.push([Math.cos(a) * r, Math.sin(a) * r]); a -= 2.4 / Math.max(r, 4); }
  railLine(ps, 'Cliff rail');
  const end = BW[BW.length - 1], a0 = Math.atan2(end[1] - HT.z, end[0] - HT.x), hp = [];
  for (let a = a0 + 0.24; a < a0 + 6.283 - 0.24; a += 2.4 / 11) hp.push([HT.x + Math.cos(a) * 11, HT.z + Math.sin(a) * 11]);   // well inside the flat top, so coarse far terrain still holds it
  railLine(hp, 'Hilltop rail');
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
      for (const sd of [-1, 1]) put((A[0] + B[0]) / 2 + nx * 1.0 * sd, (A[3] + B[3]) / 2 + 1.0, (A[1] + B[1]) / 2 + nz * 1.0 * sd, Math.hypot(L, rise) + 0.05, 0.09, 0.09, yaw, Math.atan2(rise, L)); }   // hand rails
    for (const [cx, cz] of BW_CORNERS) { const b = polyNear(BW, cx, cz), P = BW[Math.max(b.i - 4, 0)], Q = BW[Math.min(b.i + 4, BW.length - 1)]; put(cx, bwY(b) - 0.06, cz, 2.3, 0.12, 2.3, -Math.atan2((P[1] + Q[1]) / 2 - cz, (P[0] + Q[0]) / 2 - cx)); }   // a square landing at each turn
    for (let i = 0; i < BW.length; i += 6) { const [x, z, , y] = BW[i], P2 = BW[Math.min(i + 1, BW.length - 1)], P1 = BW[Math.max(i - 1, 0)], dx = P2[0] - P1[0], dz = P2[1] - P1[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      for (const sd of [-1, 1]) { const px = x + nx * 1.0 * sd, pz = z + nz * 1.0 * sd, g = height(px, pz); put(px, (y + 1.05 + g) / 2, pz, 0.12, y + 1.05 - g + 0.3, 0.12); } }   // posts from the ground up through the rail
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
        const turns = (o) => { for (let q = o; q; q = q.parent) if (q.userData.roll) return true; return false; };   // the road wheels turn (drive.js): not merged
        bakeStatic(gl.scene, turns);
        // its shadow comes from seven boxes (84 triangles) round body, cab, load and wheels, not its 6k triangles; drawn depth-only, never seen
        const box = (x0, y0, z0, x1, y1, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        const sh = new THREE.Mesh(mergeGeometries([box(-0.88, 0.45, -1.75, 0.88, 1.15, 1.95), box(-0.8, 1.15, -1.65, 0.8, 1.65, 0.4), box(-0.6, 1.65, -1.4, 0.6, 2.1, 0.2), ...[[-1, -1.15], [1, -1.15], [-1, 1.25], [1, 1.25]].map(([sx, z]) => box(sx * 0.9 - 0.12, 0, z - 0.33, sx * 0.9 + 0.12, 0.6, z + 0.33))]), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
        sh.castShadow = true; gl.scene.add(sh);
        const far = new THREE.Mesh(sh.geometry, hazed(new THREE.MeshLambertMaterial({ color: '#56603f' }))); far.visible = false; g.add(far); JEEP.lod = [gl.scene, far];   // the same boxes, painted, stand in beyond 110 m
        TRIS.push(['Jeep shadow boxes, and the jeep beyond 110 m', 84]);
        g.add(gl.scene); carry.setHood(g); TRIS.push(['Jeep (Expedition)', n]); }); }).catch((e) => console.warn('jeep', e));
  }

  { // mud: wheel ruts from the road to the jeep, and the paths worn between jeep, porch, camp, woodpile and the trail head
    const S = 44, PX = 1024, k = PX / S, tex = canvasTex(PX, PX, (g) => { const r = mulberry(23), at = ([x, z]) => [(x + S / 2) * k, (z + S / 2) * k];
      const path = (pts, wid, col, a) => { g.lineCap = g.lineJoin = 'round'; for (let pass = 0; pass < 3; pass++) { g.strokeStyle = col; g.globalAlpha = a * (pass === 0 ? 0.35 : pass === 1 ? 0.55 : 0.9); g.lineWidth = wid * k * (pass === 0 ? 1.8 : pass === 1 ? 1.3 : 0.8);
        g.beginPath(); pts.forEach((p, i) => { const [x, y] = at(p); const j = pass && wid > 0.6 ? (r() - 0.5) * 4 : 0; i ? g.lineTo(x + j, y + j) : g.moveTo(x, y); }); g.stroke(); } g.globalAlpha = 1; };
      const ruts = (pts) => { for (const o of [-0.8, 0.8]) path(pts.map(([x, z], i) => { const n = pts[Math.min(i + 1, pts.length - 1)], m = pts[Math.max(i - 1, 0)], dx = n[0] - m[0], dz = n[1] - m[1], l = Math.hypot(dx, dz) || 1; return [x - (dz / l) * o, z + (dx / l) * o]; }), 0.32, '#5e4d40', 0.55); };
      path([[-22, 2.6], [-17, 2.4], [-13, 1.6], [-9, 1.4]], 2.8, '#8a7a6a', 0.55); ruts([[-24, 2.7], [-20, 2.6], [-17, 2.2], [-14.5, 1.6], [-13, 1.3]]);
      const foot = (pts) => { path(pts, 1.3, '#a99b8c', 0.45); path(pts, 0.6, '#7a6a5c', 0.5); };
      foot([[-9.5, -0.5], [-8.2, -4.5], [-5, -7], [-1.5, -7.4]]); foot([[3, -7.3], [7.4, -5.6], [7.6, 0], [6.8, 5.5], [3.5, 7.4]]);
      foot([[2.5, 8.2], [7.5, 11], [11, 11.5], [15.5, 15.5], [19, 19.5]]); foot([[-8, 2.6], [-6, 6.5], [-2.2, 8.4]]); foot([[-9.5, 2.8], [-8.6, 2.2]]); });   // no loose mud spots round the camp: on the snow they read as gray splotches (Adriaen 2026-11-15)
    const mud = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), hazed(new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
    mud.position.set(0, TOP + 0.02, 0); mud.receiveShadow = true; mud.renderOrder = 1; scene.add(mud); TRIS.push(['Mud tracks (painted)', 2]);
  }
}
// each frame: the jeep shows as its boxes beyond 110 m from the camera (wherever it is: drive.js drives it)
export function roadStep() {
  if (!JEEP.lod) return;
  const p = JEEP.node.position, far = Math.hypot(camera.position.x - p.x, camera.position.z - p.z) > 110; JEEP.lod[0].visible = !far; JEEP.lod[1].visible = far;
}
