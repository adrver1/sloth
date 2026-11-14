// Canopy Camp glade: the sloth tree's clearing at the end of the footpath behind the tent, dressed like the camp (Adriaen 2026-11-14:
// "the same treatment as the main camp with beautification and making it real"). One painted floor (lush grass with sun flecks, a moss
// ring at the tree's foot, a trodden patch where the path ends and people stand to look up at the sloths, leaf litter thickening into
// the forest), a plank bench on two log ends facing the tree, a fallen mossy log with shelf fungus, mossy stones, two clusters of
// mushrooms, three sunbeams through the canopy gap and bushes in the ring you can't walk into. The plants (tufts, tall grass, wildflowers, clover and the heliconia, bromeliad,
// fern and orchid clumps at its edge) go in ground.js's one instanced draw: campLife.js passes gladePlants to createGround.
// The glade lies outside the baked light map and ground-shadow square (ground.js RR), so it is lit live like the forest round it:
// nothing here needs a bake. Props: one draw (vertex colours); floor: one draw; sunbeams: one draw on the camp's rayMat (daylight.js
// fades it with the time of day and the weather).
import * as THREE from "three";
import { D, LOOK, S, scene, sun } from "./core.js";
import { V, canvasTex, lcg, sstep, tris } from "./util.js";
import { GLADE, GLADE_R, pathLane, sloPath } from "./layout.js";
import { blockers, rayMat } from "./campProps.js";
import { leafGeo, leafM, leafScale, perClump } from "./forest.js";

const { R, rnd } = lcg(5150);   // own stream: the shared one sets the rest of the layout
const k = D.fx > 1 ? 1.5 : D.fx ? 1 : 0.5;   // how much to grow, as ground.js
const G = GLADE, FR = GLADE_R + 1.2;          // the floor disc's radius: soft edge into the forest floor past GLADE_R
// the frame: `in` points from the glade's centre back down the path (where you arrive), `across` a quarter turn from it
const end = sloPath.pts[sloPath.pts.length - 1], inDir = V(end.x - G.x, 0, end.z - G.z).normalize(), across = V(-inDir.z, 0, inDir.x);
const at = (r, turn) => { const a = Math.atan2(inDir.z, inDir.x) + turn; return V(G.x + Math.cos(a) * r, 0, G.z + Math.sin(a) * r); };
const TRUNK = 1.25;   // the big tree's foot with its flare (forest.js HERO trunk)

// where things stand (also what the plants keep clear of)
const BENCH = { at: at(3.05, 1.15), yaw: 0 };   // to the right as you arrive, looking at the tree
BENCH.yaw = Math.atan2(G.x - BENCH.at.x, G.z - BENCH.at.z);
const LOG = { at: at(3.5, -2.3), len: 2.3, r: 0.24 };   // across the glade, lying along its edge
LOG.yaw = Math.atan2(LOG.at.z - G.z, LOG.at.x - G.x) + Math.PI / 2 + 0.25;
const STONES = [[at(3.3, -0.85), 0.32], [at(3.7, -0.65), 0.2], [at(2.9, 2.05), 0.26], [at(3.9, 2.9), 0.36]];
const SHROOMS = [[LOG.at.clone().addScaledVector(V(Math.cos(LOG.yaw), 0, Math.sin(LOG.yaw)), 1.25), 5], [at(TRUNK + 0.35, 2.6), 4]];
const STAND = at(2.2, 0);   // the trodden spot under the low branches, where the path ends
const pathEnd = (x, z) => { let d = 1e9; for (let i = sloPath.pts.length - 12; i < sloPath.pts.length; i++) d = Math.min(d, Math.hypot(sloPath.pts[i].x - x, sloPath.pts[i].z - z)); return d; };
// how worn the ground is: the path's last stretch running on to the trodden spot (0 grass .. 1 bare earth)
const worn = (x, z) => {
  const s = STAND, e = end, dx = s.x - e.x, dz = s.z - e.z, t = Math.max(0, Math.min(1, ((x - e.x) * dx + (z - e.z) * dz) / (dx * dx + dz * dz)));
  const lane = Math.hypot(x - (e.x + dx * t), z - (e.z + dz * t));
  return Math.max(1 - sstep(0.35, 0.8, Math.min(lane, pathEnd(x, z))), 1 - sstep(0.55, 1.15, Math.hypot(x - s.x, z - s.z)));
};
const taken = (x, z, pad) => Math.hypot(x - G.x, z - G.z) < TRUNK + 0.15 + pad || Math.hypot(x - BENCH.at.x, z - BENCH.at.z) < 0.85 + pad
  || STONES.some(([c, r]) => Math.hypot(x - c.x, z - c.z) < r + pad) || (() => { const ax = Math.cos(LOG.yaw), az = Math.sin(LOG.yaw), u = (x - LOG.at.x) * ax + (z - LOG.at.z) * az, v = -(x - LOG.at.x) * az + (z - LOG.at.z) * ax;
    return Math.abs(u) < LOG.len / 2 + pad && Math.abs(v) < LOG.r + 0.1 + pad; })();

// ---------------------------------------------------------------- the floor: one disc, painted once (canvas x, y = world dx, dz)
const PX = 512, W = (x) => (x / FR + 1) * PX / 2;
const leaf = S.leaf.map((c) => new THREE.Color(c).lerp(new THREE.Color(0xd8e0a0), LOOK === "low" ? 0.15 : 0.3));
const floorTex = canvasTex(PX, PX, (g) => {
  const blob = (x, z, r, col, a) => { const gr = g.createRadialGradient(W(x), W(z), 0, W(x), W(z), r * PX / (2 * FR)); gr.addColorStop(0, col.replace("A", a)); gr.addColorStop(1, col.replace("A", 0)); g.fillStyle = gr; g.fillRect(0, 0, PX, PX); };
  g.fillStyle = "#" + leaf[3].clone().lerp(leaf[1], 0.35).getHexString(); g.fillRect(0, 0, PX, PX);
  for (let i = 0; i < 16; i++) { const a = R(0, 6.28), r = R(0, GLADE_R); blob(Math.cos(a) * r, Math.sin(a) * r, R(0.8, 2.0), rnd() < 0.5 ? "rgba(214,212,130,A)" : "rgba(52,110,60,A)", R(0.25, 0.45)); }   // drier and lusher patches
  blob(0, 0, TRUNK + 1.3, "rgba(78,104,40,A)", 0.85);                                                          // moss round the tree's foot, under the roots
  blob(0, 0, TRUNK + 0.4, "rgba(70,62,40,A)", 0.6);                                                           // bare and dark where the canopy drips
  for (let i = 0; i < 14; i++) { const a = R(0, 6.28), r = R(0.6, GLADE_R - 0.6); blob(Math.cos(a) * r, Math.sin(a) * r, R(0.3, 0.7), "rgba(255,246,190,A)", R(0.18, 0.3)); }   // sun flecks through the leaves
  // the trodden earth from the path's end to the spot under the branches: soft-edged, a little darker in the middle where most feet go
  const img = g.getImageData(0, 0, PX, PX), d = img.data, mud = [143, 118, 83], mid = [118, 96, 66];
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    const wx = G.x + (x / PX * 2 - 1) * FR, wz = G.z + (y / PX * 2 - 1) * FR, w0 = worn(wx, wz); if (w0 <= 0.01) continue;
    const n = 0.5 + 0.5 * Math.sin(wx * 9.1 + wz * 3.3) * Math.sin(wx * 2.7 - wz * 8.3), w = Math.min(1, w0 * (0.85 + 0.3 * n)), c = sstep(0.75, 1, w0), i = (y * PX + x) * 4;
    for (let j = 0; j < 3; j++) d[i + j] = d[i + j] * (1 - w) + (mud[j] * (1 - c) + mid[j] * c) * w;
  }
  g.putImageData(img, 0, 0);
  if (LOOK !== "low") {
    for (let i = 0; i < 900; i++) { const a = R(0, 6.28), r = Math.sqrt(rnd()) * FR, x = Math.cos(a) * r, z = Math.sin(a) * r;   // grass strokes, sparse on the earth
      if (worn(G.x + x, G.z + z) > 0.6 && rnd() < 0.85) continue; g.strokeStyle = "#" + leaf[i % 4].getHexString(); g.globalAlpha = R(0.25, 0.6); g.lineWidth = 1.2; g.beginPath(); g.moveTo(W(x), W(z)); g.lineTo(W(x) + R(-1.5, 1.5), W(z) - R(2, 5)); g.stroke(); }
    for (let i = 0; i < 70; i++) { const a = R(0, 6.28), r = R(0, GLADE_R), x = Math.cos(a) * r, z = Math.sin(a) * r;                 // pebbles kicked onto the trodden earth
      if (worn(G.x + x, G.z + z) < 0.4) continue; g.globalAlpha = R(0.4, 0.8); g.fillStyle = ["#b8ab92", "#8d8270", "#cfc3a8"][i % 3]; g.beginPath(); g.ellipse(W(x), W(z), R(0.8, 2), R(0.6, 1.5), R(0, 3), 0, 7); g.fill(); }
    for (let i = 0; i < 520; i++) { const a = R(0, 6.28), r = FR * Math.pow(rnd(), 0.45), x = Math.cos(a) * r, z = Math.sin(a) * r;       // fallen leaves, thicker toward the forest
      if (rnd() > 0.15 + 0.85 * sstep(GLADE_R - 1.8, FR, r) || worn(G.x + x, G.z + z) > 0.5) continue;
      g.globalAlpha = R(0.55, 0.9); g.fillStyle = ["#b8743a", "#d3a24a", "#8a5a2c", "#a8823c"][i % 4]; g.beginPath(); g.ellipse(W(x), W(z), R(2, 3.6), R(1, 1.8), R(0, 3), 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
  // the edge: a ragged soft fade into the forest floor
  const e = g.getImageData(0, 0, PX, PX), ed = e.data;
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) { const dx = x / PX * 2 - 1, dz = y / PX * 2 - 1, r = Math.hypot(dx, dz) * FR, a = Math.atan2(dz, dx);
    const rim = GLADE_R + 0.25 + 0.35 * Math.sin(a * 5 + 1) + 0.2 * Math.sin(a * 11 + 2.3); ed[(y * PX + x) * 4 + 3] = 255 * (1 - sstep(rim - 0.9, rim + 0.6, r)); }
  g.putImageData(e, 0, 0);
});
const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const floor = new THREE.Mesh(new THREE.CircleGeometry(FR, 24), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.set(G.x, 0.022, G.z); floor.name = "GladeFloor"; scene.add(floor);   // above the ground mesh (0.012), or the two flicker

// ---------------------------------------------------------------- the props: one merged mesh, detail in vertex colours
const parts = [], triCount = {};
const C = (h) => new THREE.Color(h);
const barkA = C(S.bark[0]), barkB = C(S.bark[1]), mossC = C(S.moss), plank = C(0xa77b52), plankD = C(0x7d5636), endWood = C(0xc9a77a), ring = C(0x8a6440);
const stone = C(0x8f8a7e), fungus = C(0xe0782a), cap = [C(0xb07a48), C(0xd9b88a), C(0x9a5a34)], stem = C(0xefe6d0);
function paint(g, f) {   // f(x, y, z, nx, ny, nz) -> colour, per vertex, faces kept flat
  g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.set(f(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)).toArray(), i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); for (const a of Object.keys(g.attributes)) if (a !== "position" && a !== "normal" && a !== "color") g.deleteAttribute(a);
  return g;
}
const bark = (x, y, z, nx, ny, nz, moss = 1) => barkA.clone().lerp(barkB, 0.5 + 0.5 * Math.sin(Math.atan2(nz, nx) * 5 + y * 4)).lerp(mossC, sstep(0.35, 0.85, ny + 0.4 * Math.sin(x * 5 + z * 4)) * S.mossAmt * moss);
const add = (name, list) => { triCount[name] = list.reduce((n, g) => n + tris(g), 0); parts.push(...list); };
const place = (g, c, yaw, y = 0) => g.rotateY(yaw).translate(c.x, y, c.z);

// the bench: a thick plank on two sawn log ends (no faces underneath or where they touch)
{
  const L = 1.5, Wd = 0.34, T = 0.07, H = 0.42, list = [];
  const top = paint(new THREE.BoxGeometry(L, T, Wd).translate(0, H + T / 2, 0), (x, y, z, nx, ny) => (Math.abs(nx) > 0.5 ? endWood : ny > 0.5 ? plank.clone().lerp(plankD, 0.25 + 0.25 * Math.sin(x * 23) * Math.sin(z * 31)) : plankD));
  const pos = top.attributes.position; const keep = []; for (let i = 0; i < pos.count; i += 3) if (top.attributes.normal.getY(i) > -0.5) keep.push(i);   // drop the underside
  const tb = new THREE.BufferGeometry(); for (const a of ["position", "normal", "color"]) { const s = top.attributes[a], o = []; for (const i of keep) for (let j = 0; j < 3; j++) for (let q = 0; q < 3; q++) o.push(s.getComponent(i + j, q)); tb.setAttribute(a, new THREE.Float32BufferAttribute(o, 3)); }
  list.push(tb);
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.15, 0.17, H, 7, 1, true).translate(s * (L / 2 - 0.25), H / 2, 0);
    list.push(paint(g, (x, y, z, nx, ny, nz) => bark(x, y, z, nx, ny, nz, 0.4).multiplyScalar(0.75 + 0.35 * y / H)));
  }
  list.forEach((g) => place(g, BENCH.at, BENCH.yaw));   // its length across the way it faces
  add("bench", list);
  blockers.push(Object.assign([BENCH.at.clone(), 0.55], { wild: true, walk: { a: BENCH.at.clone().addScaledVector(V(Math.cos(BENCH.yaw), 0, -Math.sin(BENCH.yaw)), -0.55), b: BENCH.at.clone().addScaledVector(V(Math.cos(BENCH.yaw), 0, -Math.sin(BENCH.yaw)), 0.55), r: 0.2 } }));
}
// the fallen log: half sunk, moss along its back, one sawn end with rings, shelf fungus on the side you see
{
  const { len, r } = LOG, list = [];
  const g = new THREE.CylinderGeometry(r * 0.9, r, len, 7, 2, true).rotateZ(Math.PI / 2);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.04 * Math.sin(p.getX(i) * 2.3));
  list.push(paint(g, (x, y, z, nx, ny, nz) => bark(x, y, z, nx, ny, nz, 1.2)));
  const endCap = new THREE.CircleGeometry(r * 0.9, 7).rotateY(-Math.PI / 2).translate(-len / 2, 0, 0);   // the sawn end facing the bench
  list.push(paint(endCap, (x, y, z) => endWood.clone().lerp(ring, sstep(0.0, r, Math.hypot(y, z)) * 0.5 + (Math.hypot(y, z) < 0.03 ? 0.6 : 0))));
  for (const [t, s] of [[-0.3, 1], [0.45, 1], [0.1, -1]]) {   // shelf fungus: flat half-disc fans, top and underside (6 tris)
    const f = new THREE.CircleGeometry(0.13, 3, 0, Math.PI).rotateX(-Math.PI / 2 + 0.15).rotateY(s > 0 ? 0 : Math.PI).translate(t * len, R(-0.02, 0.08), s * r * 0.95);
    list.push(paint(f, () => fungus.clone().multiplyScalar(R(0.9, 1.1))), paint(f.clone().translate(0, -0.015, 0), () => C(0xf6c060)));
  }
  list.forEach((q) => place(q, LOG.at, -LOG.yaw, r * 0.7));
  add("log", list);
  const ax = V(Math.cos(LOG.yaw), 0, Math.sin(LOG.yaw));
  for (const t of [-0.8, 0, 0.8]) blockers.push(Object.assign([LOG.at.clone().addScaledVector(ax, t), 0.33], { wild: true }));
}
// mossy stones: a low icosahedron each (20 tris), squashed and turned, moss on top
{
  const list = [];
  for (const [c, s] of STONES) {
    const g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * s * R(0.95, 1.15), Math.max(-0.2, p.getY(i)) * s * 0.55, p.getZ(i) * s * R(0.8, 1.0));
    list.push(place(paint(g, (x, y, z, nx, ny) => stone.clone().multiplyScalar(0.8 + 0.25 * sstep(-0.5, 1, ny)).lerp(mossC, sstep(0.45, 0.85, ny + 0.25 * Math.sin(x * 9 + z * 7)) * 0.85)), c, R(0, 6.28), s * 0.06));
    blockers.push(Object.assign([c.clone(), s * 0.9], { wild: true }));
  }
  add("stones", list);
}
// mushrooms in two clusters: a 5-sided cap (5 tris, its underside left out) on a 4-sided stem (8 tris)
{
  const list = [];
  for (const [c, n] of SHROOMS) for (let i = 0; i < Math.round(n * Math.min(k, 1)); i++) {
    const h = R(0.06, 0.14), cr = h * R(0.55, 0.8), x = c.x + R(-0.35, 0.35), z = c.z + R(-0.35, 0.35), tone = cap[i % 3];
    const st = new THREE.CylinderGeometry(cr * 0.22, cr * 0.28, h, 4, 1, true).translate(0, h / 2, 0);
    const cp = new THREE.ConeGeometry(cr, cr * 0.75, 5, 1, true).translate(0, h + cr * 0.3, 0);
    const lean = R(-0.2, 0.2), yaw = R(0, 6.28);
    list.push(paint(st, () => stem).rotateZ(lean).rotateY(yaw).translate(x, 0, z), paint(cp, (px, py) => tone.clone().lerp(C(0xf1dcb8), sstep(h + cr * 0.6, h, py) * 0.4)).rotateZ(lean).rotateY(yaw).translate(x, 0, z));
  }
  add("mushrooms", list);
}
{
  const at_ = { position: [], normal: [], color: [] };
  for (const g of parts) for (const a in at_) at_[a].push(...g.attributes[a].array);
  const geo = new THREE.BufferGeometry(); for (const [a, v] of Object.entries(at_)) geo.setAttribute(a, new THREE.Float32BufferAttribute(v, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); mesh.name = "GladeProps"; scene.add(mesh);   // two-sided: the open stump and stem ends, the fungus fans
  triCount.total = tris(geo);
}

// ---------------------------------------------------------------- sunbeams through the canopy gap over the glade (one draw, the camp's rayMat)
if (rayMat) {
  const sd = sun.position.clone().normalize(), up = V(0, 1, 0), tilt = new THREE.Quaternion().setFromUnitVectors(up, sd), gs = [];
  for (const [r, turn, w] of [[1.8, 1.9, 1.6], [2.6, -1.0, 1.1], [0.6, -2.6, 2.0]]) {
    const c = at(r, turn).addScaledVector(sd, 10), q = tilt.clone().multiply(new THREE.Quaternion().setFromAxisAngle(up, R(0, 3.14)));
    gs.push(new THREE.PlaneGeometry(w, 22).applyQuaternion(q).translate(c.x, c.y, c.z));
  }
  const at_ = { position: [], uv: [] }; for (const g of gs) for (const a in at_) at_[a].push(...g.toNonIndexed().attributes[a].array);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(at_.position, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(at_.uv, 2));
  const beams = new THREE.Mesh(geo, rayMat); beams.name = "GladeBeams"; scene.add(beams);
  triCount.beams = tris(geo);
}

// ---------------------------------------------------------------- bushes in the ring you can't walk into (Adriaen 2026-11-14): between the
// walkable glade (player.js keeps you within GLADE_R - 0.4) and the forest wall; low leafy mounds of the forest's own leaf cards
// (forest.js leafGeo, 2 tris each), one instanced draw. Kept off the footpath from camp and the way out on the far side (the karaoke
// route runs round the tree and leaves away from the camp).
{
  const B = [];
  for (let tries = 0; tries < 400 && B.length < Math.round(16 * Math.min(k, 1.2)); tries++) {
    const turn = R(-Math.PI, Math.PI), r = R(GLADE_R - 0.2, GLADE_R + 1.1), c = at(r, turn);
    if (Math.abs(turn) < 0.55 || Math.abs(Math.abs(turn) - Math.PI) < 0.75 || pathLane(c.x, c.z) < 1.8 || taken(c.x, c.z, 0.5) || B.some((b) => Math.hypot(b[0] - c.x, b[2] - c.z) < 1.1)) continue;
    B.push([c.x, R(0.35, 0.7), c.z, R(0.55, 0.9)]);
  }
  const per = Math.max(8, Math.round(perClump * 0.75)), im = new THREE.InstancedMesh(leafGeo, leafM, B.length * per), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(); let i = 0;
  for (const [x, y, z, r] of B) for (let j = 0; j < per; j++) {
    const u = V(R(-1, 1), R(-0.6, 0.7), R(-1, 1)).normalize().multiplyScalar(r * Math.cbrt(rnd()));
    e.set(R(0, 6.28), R(0, 6.28), R(0, 6.28)); q.setFromEuler(e);
    const sc = R(leafScale[0], leafScale[1]) * (LOOK === "moss" ? 0.85 : r * 0.9);
    m.compose(V(x + u.x, Math.max(0.12, y + u.y), z + u.z), q, V(sc, sc, sc)); im.setMatrixAt(i, m);
    im.setColorAt(i, c.setHex(S.leaf[(j + i) % 4]).multiplyScalar(R(0.7, 0.95))); i++;
  }
  im.name = "GladeBushes"; scene.add(im);
  triCount.bushes = B.length * per * tris(leafGeo); triCount.bushCount = B.length;
}

// ---------------------------------------------------------------- plants for ground.js: [x, z, type, size], its atlas cells (0 tuft, 1 tall grass,
// 2 wildflowers, 3 clover, 4 heliconia, 5 bromeliad, 6 fern, 7 orchid). A meadow in the middle, thick verges and colour at the edge.
const gladePlants = [];
{
  const fl = Array.from({ length: 4 }, () => { const a = R(0, 6.28), r = R(1.8, GLADE_R - 0.8); return [G.x + Math.cos(a) * r, G.z + Math.sin(a) * r, R(0.9, 1.5)]; });
  const flower = (x, z) => Math.max(0, ...fl.map(([fx, fz, fr]) => 1 - Math.hypot(x - fx, z - fz) / fr));
  const want = [Math.round(170 * k), Math.round(45 * k), Math.round(80 * k), Math.round(45 * k)];
  for (const type of [1, 2, 0, 3]) for (let n = 0, tries = 0; tries < want[type] * 40 && n < want[type]; tries++) {
    const a = R(0, 6.28), r = Math.sqrt(rnd()) * (GLADE_R + 0.6), x = G.x + Math.cos(a) * r, z = G.z + Math.sin(a) * r, w = worn(x, z), edge = sstep(GLADE_R - 1.6, GLADE_R + 0.3, r);
    if (w > 0.45 || taken(x, z, type === 1 ? 0.1 : 0)) continue;
    const verge = sstep(0.05, 0.3, w) * (1 - sstep(0.3, 0.45, w));   // the strip along the trodden earth: nobody steps there
    const p = type === 0 ? 0.35 + 0.5 * edge + 0.6 * verge : type === 1 ? 0.05 + 0.8 * edge + 0.5 * verge : type === 2 ? 0.08 + 0.9 * flower(x, z) : (0.4 - 0.3 * edge) * (1 - w);
    if (rnd() > p) continue;
    gladePlants.push([x, z, type, type === 0 ? R(0.22, 0.42) * (1 + 0.4 * edge) : type === 1 ? R(0.55, 0.95) : type === 2 ? R(0.28, 0.45) : R(0.13, 0.22)]); n++;
  }
  // clumps of colour round the edge, and dark ferns between them; one clump each side of the bench and at the log's ends
  const SZ = { 4: [0.95, 1.4], 5: [0.38, 0.55], 6: [0.7, 1.15], 7: [0.42, 0.6] }, groups = [[4, 6, 6], [5, 7, 6], [7, 6, 5], [4, 7, 6], [5, 6, 6]];
  const centres = [at(GLADE_R - 0.3, 1.6), at(GLADE_R - 0.4, 0.7), at(GLADE_R - 0.1, -1.6), at(GLADE_R - 0.2, -3.0), at(GLADE_R - 0.2, 2.6)];
  centres.slice(0, Math.max(3, Math.round(5 * Math.min(k, 1)))).forEach((c, gi) => {
    for (let i = 0; i < 6; i++) { const t = groups[gi % groups.length][i % 3], b = R(0, 6.28), d = R(0, 0.7), x = c.x + Math.cos(b) * d, z = c.z + Math.sin(b) * d;
      if (!taken(x, z, 0.15) && worn(x, z) < 0.1) gladePlants.push([x, z, t, R(...SZ[t])]); }
  });
  for (let n = 0, tries = 0; tries < 600 && n < Math.round(22 * k); tries++) {
    const a = R(0, 6.28), r = R(GLADE_R - 0.9, GLADE_R + 0.7), x = G.x + Math.cos(a) * r, z = G.z + Math.sin(a) * r;
    if (!taken(x, z, 0.15) && worn(x, z) < 0.1 && pathEnd(x, z) > 1.3) { gladePlants.push([x, z, 6, R(0.75, 1.3)]); n++; }
  }
  triCount.plants = gladePlants.length * 4;
}
triCount.floor = tris(floor.geometry);
window.__gladeTris = triCount;   // for the tris report (tools/camp-probe.cjs lists the meshes too)

export { gladePlants };
