// Canopy Camp forest: bark with baked AO and moss, the layout (clearing, sloth path and glade, the jeep's track), the clearing floor,
// the two big mossy trees with their low branches, the forest wall of trunks, leaves in culled wedges, ferns and verge plants.
import * as THREE from "three";
import { addMound, groundHeight, initTerrain } from "./terrain.js";
import "./sky.js";   // run after the module before it, as one script did
import { D, JEEP, LOOK, R, S, canvasTex, hex, leafMat, qs, rnd, scene, setSeed, sstep } from "./core.js";

// ---------------------------------------------------------------- bark with "baked" light: AO by height and crevice, moss on the upper sides
const barkA = new THREE.Color(S.bark[0]), barkB = new THREE.Color(S.bark[1]), mossC = new THREE.Color(S.moss);
function bake(geo, y0, y1) {
  if (S.flat) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const crev = 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 9 + y * 0.7 + Math.sin(y * 2.3) * 1.5);
    c.copy(barkA).lerp(barkB, S.flat ? 0.2 : crev * 0.7);
    const up = n.getY(i), m = sstep(0.05, 0.6, up + 0.35 * Math.sin(x * 3.1 + z * 2.7 + y * 1.9)) * S.mossAmt;
    c.lerp(mossC, m);
    c.multiplyScalar(0.45 + 0.55 * sstep(y0, y1, y));                       // darker near the forest floor
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
const barkMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: S.flat });
const woodGeos = [];
const woodMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: S.flat });
const flatCol = (geo, hexc, dark = 1) => {          // a plain colour baked into vertex colours, so props can merge into one draw
  const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals();
  const c = new THREE.Color(hexc).multiplyScalar(dark), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g;
};
function merge(geos) {                               // position, normal, colour only; one draw for many parts
  const pos = [], nor = [], col = [];
  for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array); }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ================================================================ layout
// a round clearing (radius RC) with the camp in it; two big mossy trees at its edge lean their low branches over it,
// and that is where the sloths hang. Everything past the edge is the forest wall: instanced trunks, leaves and mist.
const RC = 9;
setSeed(3000 + Number(qs.get("seed") || 7));
const A0 = -0.75, d0 = V(Math.cos(A0), 0, Math.sin(A0)), t0 = V(-d0.z, 0, d0.x);
// the sloth tree's path (Adriaen 2026-11-11): the second big tree no longer stands behind the tent. A footpath leaves the
// clearing between the tent and the laundry line and winds about 6 m into the forest to a small glade, where that tree
// stands with its sloths. pathDist() clears trunks and ferns off the path and the glade like trackDist() does for the jeep.
const PATH_A = 1.45, GLADE_R = 4.2, GLADE = V(Math.cos(PATH_A + 0.22), 0, Math.sin(PATH_A + 0.22)).multiplyScalar(RC + 9.5), PATH_W = 0.6;
const sloPath = (() => {
  const P = (a, r) => V(Math.cos(a) * r, 0, Math.sin(a) * r);
  const curve = new THREE.CatmullRomCurve3([P(PATH_A, RC - 2), P(PATH_A, RC + 0.5), P(PATH_A - 0.1, RC + 2.5), P(PATH_A + 0.06, RC + 4.3), GLADE.clone().setLength(RC + 5.2), GLADE.clone().setLength(RC + 6.5)]);
  return { curve, pts: curve.getSpacedPoints(48) };
})();
function polyDist(pts, x, z) {                         // distance from (x, z) to a polyline, and the nearest point on it
  let best = 1e9, bx = 0, bz = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z, dx = pts[i].x - ax, dz = pts[i].z - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t); if (d < best) { best = d; bx = ax + dx * t; bz = az + dz * t; }
  }
  return [best, bx, bz];
}
const pathLane = (x, z) => polyDist(sloPath.pts, x, z)[0];                                       // the path itself
const pathDist = (x, z) => Math.min(pathLane(x, z), Math.max(0, Math.hypot(x - GLADE.x, z - GLADE.z) - GLADE_R));   // path or glade
const HERO = [d0.clone().multiplyScalar(RC + 0.4), GLADE.clone()];
const nearPath = () => false;
initTerrain({ RC, pathDist, jeepDist, hero: HERO });   // the bowl rim, the hummocks and the mounds (terrain.js); level where people walk
// the jeep's track: the jeep is parked at JEEP_AT along the clearing edge (facing JEEP_TAN) and came in on a muddy track
// cut through the forest wall behind it. trackDist() thins trunks, leaves and ferns off the track (scaled to zero, so the
// seeded layout of everything else stays the same).
const JEEP_AT = V(-2.2, 0, -6.4), JEEP_OUT = JEEP_AT.clone().normalize();
const JEEP_TAN = (() => { const t = V(-JEEP_OUT.z, 0, JEEP_OUT.x); return V(t.z, 0, -t.x).dot(JEEP_OUT) > 0 ? t.negate() : t; })();   // its right side faces the fire
const track = JEEP === "none" ? null : (() => {
  const P = (b, o) => JEEP_AT.clone().addScaledVector(JEEP_TAN, b).addScaledVector(JEEP_OUT, o);
  const curve = new THREE.CatmullRomCurve3([P(1.2, 0), P(-1.5, 0), P(-3.6, 0.5), P(-4.9, 2.4), P(-5.6, 5.5), P(-5.4, 10), P(-4.2, 16), P(-3, 24)]);
  const pts = curve.getSpacedPoints(90);
  return { curve, pts };
})();
function trackDist(x, z) { return Math.min(jeepDist(x, z), pathDist(x, z)); }   // anything kept open: the jeep's track, the path, the glade
function jeepDist(x, z) {
  if (!track) return 1e9;
  let best = 1e9; const p = track.pts;
  for (let i = 1; i < p.length; i++) {
    const ax = p[i - 1].x, az = p[i - 1].z, dx = p[i].x - ax, dz = p[i].z - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// ---------------------------------------------------------------- clearing floor
const FLOOR_OVERLAYS = [];   // the path and track ribbons drawn on the floor: they take the ground's contact shadow (groundLife.shadeOn)
const grass = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = hex(new THREE.Color(S.leaf[3]).lerp(new THREE.Color(0xd8e0a0), LOOK === "low" ? 0.1 : 0.25).getHex()); g.fillRect(0, 0, w, h);
  if (LOOK !== "low") for (let i = 0; i < 1400; i++) { g.strokeStyle = hex(S.leaf[i % 4]); g.globalAlpha = R(0.2, 0.6); g.lineWidth = 1.5; const x = R(0, w), y = R(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-2, 2), y - R(3, 8)); g.stroke(); }
});
grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(6, 6);
const clearing = new THREE.Mesh(new THREE.CircleGeometry(RC + 0.8, 48), new THREE.MeshLambertMaterial({ map: grass }));
clearing.rotation.x = -Math.PI / 2; clearing.position.y = 0.01; scene.add(clearing);
// the glade's grass and the footpath to it: one circle and one ribbon of trodden earth (2 draws, about 200 triangles)
{
  const soft = canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2); r.addColorStop(0, "#fff"); r.addColorStop(1, "#000"); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  soft.colorSpace = THREE.NoColorSpace;
  const glade = new THREE.Mesh(new THREE.CircleGeometry(GLADE_R + 1.2, 24), new THREE.MeshLambertMaterial({ map: clearing.material.map, alphaMap: soft, transparent: true, depthWrite: false }));   // a soft edge into the forest floor
  glade.material.map = clearing.material.map.clone(); glade.material.map.repeat.set(3, 3); glade.material.map.needsUpdate = true;
  glade.rotation.x = -Math.PI / 2; glade.position.set(GLADE.x, 0.022, GLADE.z); glade.material.polygonOffset = true; glade.material.polygonOffsetFactor = -2; scene.add(glade);   // above the ground mesh (0.012), or the two flicker
  const Q = (a, b) => a + Math.random() * (b - a);   // texture noise only
  const earth = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = LOOK === "low" ? "#a88a5e" : "#8f7653"; g.fillRect(0, 0, w, h);
    if (LOOK !== "low") for (let i = 0; i < 260; i++) { g.fillStyle = ["#7a6245", "#a58b66", "#6e5a40"][i % 3]; g.globalAlpha = Q(0.2, 0.5); g.beginPath(); g.ellipse(Q(0, w), Q(0, h), Q(1, 3), Q(1, 2), 0, 0, 7); g.fill(); }
    g.globalAlpha = 1; for (let i = 0; i < 18; i++) { g.strokeStyle = hex(S.leaf[i % 4]); g.lineWidth = 2; const x = Q(0, 1) < 0.5 ? Q(0, 9) : Q(w - 9, w), y = Q(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Q(-2, 2), y - Q(4, 8)); g.stroke(); }
    const e = g.createLinearGradient(0, 0, w, 0); e.addColorStop(0, "rgba(0,0,0,0)"); e.addColorStop(0.25, "rgba(0,0,0,1)"); e.addColorStop(0.75, "rgba(0,0,0,1)"); e.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in"; g.fillStyle = e; g.fillRect(0, 0, w, h);
  });
  earth.wrapT = THREE.RepeatWrapping;
  const n = 40, pos = [], uv = [], col = [], idx = [], L = sloPath.curve.getLength();
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = sloPath.curve.getPointAt(t), d = sloPath.curve.getTangentAt(t), side = V(-d.z, 0, d.x).normalize(), r = Math.hypot(p.x, p.z);
    const a = sstep(RC - 0.6, RC + 0.4, r) * (1 - sstep(L - 1.2, L, t * L));   // takes over from the baked ground's path at the clearing edge, fades out into the glade
    for (const k of [-1, 1]) { const q = p.clone().addScaledVector(side, k * 0.75); pos.push(q.x, 0.024, q.z); uv.push((k + 1) / 2, t * L / 2); col.push(1, 1, 1, a); }
    if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }   // facing up (it was wound face down, so culled: the path vanished at the clearing edge)
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: earth, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 1; scene.add(m); FLOOR_OVERLAYS.push(m);
}

// ---------------------------------------------------------------- the jeep's track: a dirt road out through the forest, and muddy tyre ruts up to its wheels
if (track) {
  const Q = (a, b) => a + Math.random() * (b - a);   // texture noise only: leaves the seeded layout alone
  const ribbon = (width, y, tex, alpha, tile, order) => {
    const n = 140, pos = [], uv = [], col = [], idx = [], L = track.curve.getLength();
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = track.curve.getPointAt(t), d = track.curve.getTangentAt(t), side = V(-d.z, 0, d.x).normalize(), a = alpha(p, t * L);
      for (const k of [-1, 1]) { const q = p.clone().addScaledVector(side, k * width / 2); pos.push(q.x, y, q.z); uv.push((k + 1) / 2, (t * L) / tile); col.push(1, 1, 1, a); }
      if (i) { const b = (i - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
    tex.wrapT = THREE.RepeatWrapping;
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
      forceSinglePass: true }));   // flat on the ground, so one draw shows the same as three.js's two passes for see-through two-sided materials
    mesh.renderOrder = order; scene.add(mesh); FLOOR_OVERLAYS.push(mesh);
  };
  const mud = LOOK === "low" ? ["#9a7a52", "#7d6040", "#5c4530"] : ["#8a6c4a", "#6b5038", "#4a3626"];
  const dirt = canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = mud[0]; g.fillRect(0, 0, w, h);
    if (LOOK !== "low") for (let i = 0; i < 900; i++) { g.fillStyle = mud[1 + (i % 2)]; g.globalAlpha = Q(0.15, 0.45); g.beginPath(); g.ellipse(Q(0, w), Q(0, h), Q(1, 5), Q(1, 3), Q(0, 3), 0, 7); g.fill(); }
    g.globalAlpha = 1;
    for (let i = 0; i < 26; i++) { g.strokeStyle = hex(S.leaf[i % 4]); g.lineWidth = 2; const x = Q(0, w) < w / 2 ? Q(0, 16) : Q(w - 16, w), y = Q(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Q(-2, 2), y - Q(4, 9)); g.stroke(); }   // grass tufts at the verges
    const e = g.createLinearGradient(0, 0, w, 0); e.addColorStop(0, "rgba(0,0,0,0)"); e.addColorStop(0.18, "rgba(0,0,0,1)"); e.addColorStop(0.82, "rgba(0,0,0,1)"); e.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in"; g.fillStyle = e; g.fillRect(0, 0, w, h);
  });
  const ruts = canvasTex(128, 256, (g, w, h) => {
    for (const cx of [w * 0.14, w * 0.86]) {
      const b = g.createLinearGradient(cx - 14, 0, cx + 14, 0); b.addColorStop(0, "rgba(60,42,28,0)"); b.addColorStop(0.25, "rgba(60,42,28,.85)"); b.addColorStop(0.75, "rgba(60,42,28,.85)"); b.addColorStop(1, "rgba(60,42,28,0)");
      g.fillStyle = b; g.fillRect(cx - 14, 0, 28, h);
      g.strokeStyle = "rgba(30,20,12,.7)"; g.lineWidth = 3;                    // tread chevrons
      for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(cx - 9, y + 6); g.lineTo(cx, y); g.lineTo(cx + 9, y + 6); g.stroke(); }
      g.fillStyle = "rgba(150,135,110,.35)";                                   // wet shine in a few spots
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(cx + Q(-3, 3), Q(0, h), 5, Q(10, 22), 0, 0, 7); g.fill(); }
    }
  });
  // the dirt fades out as the track meets the clearing; the ruts run on to the jeep's front wheels
  ribbon(2.7, 0.022, dirt, (p) => sstep(RC - 3, RC + 0.5, Math.hypot(p.x, p.z)), 3.2, 1);
  ribbon(1.62, 0.028, ruts, (p, l) => sstep(0, 0.6, l) * (0.7 + 0.25 * sstep(RC - 4, RC, Math.hypot(p.x, p.z))), 1.6, 2);
}

// ---------------------------------------------------------------- the big mossy trees (as in the tree demo), low branches reaching over the clearing
const branchCurves = [], TOP = 15;
for (const [k, c] of HERO.entries()) {
  const g = new THREE.CylinderGeometry(0.6, 1.05, TOP, S.flat ? 9 : 14, S.flat ? 8 : 16, true); g.translate(0, TOP / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const f = 1 + 0.08 * Math.sin(a * 5 + y * 0.6) + 0.05 * Math.sin(a * 11 - y * 1.3) + 0.7 * Math.exp(-y * 1.5) * (0.5 + 0.5 * Math.cos(a * 4 + k));
    p.setXYZ(i, x * f + Math.sin(y * 0.35) * 0.2, y, z * f);
  }
  woodGeos.push(bake(g, 0, 7).translate(c.x, 0, c.z));
  const inward = Math.atan2(-c.z, -c.x);
  for (let i = 0; i < 9; i++) {
    const low = i < 5, h = (low ? 2.05 + i * 0.16 : 4.6 + (i - 5) * 1.2) + R(-0.08, 0.08);   // low ones at head height: you meet the sloths face to face
    const a = low ? inward + (i % 2 ? 1 : -1) * (0.25 + i * 0.22) + R(-0.1, 0.1) : inward + Math.PI + i * 2.39996;
    const L = low ? R(2.8, 3.8) : R(2.4, 3.4), dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x), pts = [];
    for (let j = 0; j <= 5; j++) { const t = j / 5; pts.push(dir.clone().multiplyScalar(0.45 + L * t).addScaledVector(side, Math.sin(t * 3 + i) * 0.3).setY(h + (low ? 0.25 * t - 0.3 * t * t : 0.7 * t - 0.65 * t * t))); }
    const curve = new THREE.CatmullRomCurve3(pts);
    woodGeos.push(bake(tube(curve, 0.2, 0.07, low ? (S.flat ? 6 : 10) : 5, low ? (S.flat ? 5 : 7) : 4), 0, 7).translate(c.x, 0, c.z));
    curve.points.forEach((q) => q.add(V(c.x, 0, c.z))); curve.updateArcLengths(); curve.low = low; branchCurves.push(curve);
  }
  // lianas from the low branches down to the ground
  for (let i = 0; i < 3; i++) {
    const b = branchCurves[branchCurves.length - 9 + i], p0 = b.getPointAt(R(0.55, 0.95)), p1 = p0.clone().multiplyScalar(1.08), _y = p1.setY(groundHeight(p1.x, p1.z)), mid = p0.clone().lerp(p1, 0.5).addScaledVector(V(p0.x, 0, p0.z).normalize(), 0.4);
    woodGeos.push(bake(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p0, mid, p1]), 8, 0.025, 3), 0, 7));
  }
}
function tube(curve, r0, r1, segs, rad) {
  const g = new THREE.TubeGeometry(curve, segs, 1, rad, false), p = g.attributes.position, v = V();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t), r = THREE.MathUtils.lerp(r0, r1, t);
    for (let j = 0; j <= rad; j++) { const k = i * (rad + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  return g;
}
scene.add(new THREE.Mesh(merge(woodGeos), barkMat));


// ---------------------------------------------------------------- the forest wall: many trunks (one draw) and a leafy roof that leaves the sky open over the clearing
const wall = [];
{
  const g = bake(new THREE.CylinderGeometry(0.35, 0.65, 20, S.flat ? 6 : 8, 3, true).translate(0, 10, 0), 0, 9);
  for (let i = 0; i < 400 && wall.length < 70; i++) {
    const a = R(0, 6.28), r = RC + 1.2 + Math.pow(rnd(), 1.4) * 15, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (HERO.some((h) => Math.hypot(h.x - x, h.z - z) < 3) || wall.some((w) => Math.hypot(w[0] - x, w[1] - z) < 1.6)) continue;
    wall.push([x, z, R(0.6, 1.4)]);
  }
  for (const [x, z, s] of wall) if (trackDist(x, z) > 2.2) addMound(x, z, 0.9 + 0.9 * s, 0.12 + 0.18 * s);   // each tree on its own root mound
  const im = new THREE.InstancedMesh(g, barkMat, wall.length), m = new THREE.Matrix4();
  wall.forEach((w, i) => { const [x, z, s] = w, keep = trackDist(x, z) > 2.2 ? 1 : 0, ry = R(0, 6), sy = R(0.8, 1.1), y0 = groundHeight(x, z) - 0.15; w[3] = keep ? y0 + 20 * sy : 0;   // w[3]: trunk top, for the crown limbs
    w[4] = y0; m.compose(V(x, y0, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ry), V(s * keep, sy * keep, s * keep)); im.setMatrixAt(i, m); });
  scene.add(im);
}
// leaves and ferns go in as 8 wedges round the clearing, one InstancedMesh each, so three.js culls the wedges behind you:
// an InstancedMesh is culled as a whole, so before this every leaf was drawn every frame (camp review P4, 2026-11-12).
// Instances scaled to nothing (kept off the track and the path) are dropped. Same geometry and material as before.
function addSectors(im, n = 8) {
  const m = new THREE.Matrix4(), p = V(), c = new THREE.Color(), groups = Array.from({ length: n }, () => []);
  for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); if (Math.abs(m.determinant()) < 1e-9) continue;
    p.setFromMatrixPosition(m); groups[Math.floor((Math.atan2(p.z, p.x) / (2 * Math.PI) + 0.5) * n) % n].push(i); }
  for (const g of groups) {
    if (!g.length) continue;
    const s = new THREE.InstancedMesh(im.geometry, im.material, g.length);
    g.forEach((i, j) => { im.getMatrixAt(i, m); s.setMatrixAt(j, m); if (im.instanceColor) { im.getColorAt(i, c); s.setColorAt(j, c); } });
    s.computeBoundingSphere(); scene.add(s);
  }
}
let leafGeo, leafM, perClump, leafScale;
if (LOOK === "moss") {
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2);
    for (let k = 0; k < 9; k++) {
      g.save(); g.rotate(k * 0.7 + R(-0.2, 0.2)); g.translate(0, -R(30, 70));
      g.fillStyle = new THREE.Color(S.leaf[k % 4]).multiplyScalar(R(0.85, 1.15)).getStyle(); g.beginPath(); g.ellipse(0, 0, R(18, 26), R(40, 56), 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(255,255,220,.35)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -45); g.lineTo(0, 45); g.stroke();
      g.restore();
    }
  });
  leafGeo = new THREE.PlaneGeometry(1, 1); leafM = leafMat({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }, 0.04); perClump = Math.round(24 * D.leaves); leafScale = [0.8, 1.25];
} else if (LOOK === "paint") {
  const grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  leafGeo = new THREE.IcosahedronGeometry(0.5, 1); leafM = new THREE.MeshToonMaterial({ gradientMap: grad }); leafM.onBeforeCompile = leafMat({}, 0.03).onBeforeCompile; perClump = Math.round(8 * D.leaves); leafScale = [0.6, 1.1];
} else { leafGeo = new THREE.IcosahedronGeometry(0.5, 0); leafM = leafMat({}, 0.02); perClump = Math.round(5 * D.leaves); leafScale = [0.6, 1.1]; }
const clumps = [];
for (const [x, z, s, , y0] of wall) for (let k = 0; k < 2; k++) { const y = y0 + 10 * s + R(-1, 4), cx = x + R(-2, 2), cz = z + R(-2, 2); if (Math.hypot(cx, cz) > RC + 1.5) clumps.push([cx, y, cz, 2.2 * s, x, z, s]); }
for (const c of branchCurves) for (let t = 0.35; t <= 1; t += 0.3) { const p = c.getPointAt(Math.min(1, t)); clumps.push([p.x, p.y + (c.low ? 1.2 : 0.9), p.z, R(0.6, 0.9)]); }
for (const h of HERO) for (let k = 0; k < 18; k++) { const a = R(0, 6.28), r = R(0, 4.5); clumps.push([h.x + Math.cos(a) * r, TOP + R(-2, 1.5), h.z + Math.sin(a) * r, R(1.3, 1.9), h.x, h.z, 0]); }   // the big trees' crowns
for (let i = 0; i < 70; i++) { const a = R(0, 6.28), r = RC + R(0.3, 2.2), x = Math.cos(a) * r, z = Math.sin(a) * r, y = R(0.4, 2.8); clumps.push([x, y + groundHeight(x, z), z, R(0.7, 1.2)]); }   // a thick leafy edge at eye height all round the clearing
const leaves = new THREE.InstancedMesh(leafGeo, leafM, clumps.length * perClump);
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(); let i = 0;
  for (const [x, y, z, r] of clumps) for (let k = 0; k < perClump; k++) {
    const tight = LOOK === "moss" && y > 4 ? 0.6 : 1;                  // up in the crowns: leaves packed close and bigger, so they overlap into a mass
    const u = V(R(-1, 1), R(-0.5, 0.8) * (tight < 1 ? 0.7 : 1), R(-1, 1)).normalize().multiplyScalar(r * Math.cbrt(rnd()) * tight);
    e.set(R(0, 6.28), R(0, 6.28), R(0, 6.28)); q.setFromEuler(e);
    const s = R(leafScale[0], leafScale[1]) * (LOOK === "moss" ? 1 / tight : r * 0.9) * Math.pow(D.leaves, -0.33);
    const k0 = y + u.y < 4.5 && Math.min(jeepDist(x + u.x, z + u.z), pathLane(x + u.x, z + u.z)) < 1.9 ? 0 : s;   // keep the track and the path open at eye height
    m.compose(V(x + u.x, y + u.y, z + u.z), q, V(k0, k0, k0)); leaves.setMatrixAt(i, m);
    leaves.setColorAt(i, c.setHex(S.leaf[(k + i) % 4]).multiplyScalar(0.72 + 0.4 * sstep(0, 14, y + u.y))); i++;
  }
}
addSectors(leaves);
// crowns on branches: a forked limb from the trunk into every leaf clump, and a spreading crown of limbs, twigs and leaves on
// top of each forest tree, so the treetops are wood and leaves, not floating leaves (one draw for the wood, one for the new
// leaves; their own random stream, so the seeded layout stays the same). Twigs scale with the detail level.
{
  const NEAR = RC + 6;   // only the trees you can see clearly get limbs (fewest triangles that still look good)
  let s4 = 777; const Q = (a, b) => { s4 = (s4 * 16807) % 2147483647; return a + (s4 / 2147483647) * (b - a); };
  const geos = [], tops = [], twigs = D.fx > 1 ? 2 : D.fx ? 1 : 0, seg = 2;   // a limb is a flat strip with two bends: 4 triangles
  // a limb as a flat tapered strip, its wide side facing down: from the ground, looking up, it reads as round wood
  const strip = (curve, r0, r1, n) => {
    const pos = [];
    const P = (i) => { const t = i / n, p = curve.getPointAt(t), d = curve.getTangentAt(t), sd = V(-d.z, 0, d.x); if (sd.lengthSq() < 1e-4) sd.set(1, 0, 0); sd.normalize().multiplyScalar(THREE.MathUtils.lerp(r0, r1, t)); return [p.clone().sub(sd), p.clone().add(sd)]; };
    for (let i = 0; i < n; i++) { const [a, b] = P(i), [c, d] = P(i + 1); pos.push(...a.toArray(), ...c.toArray(), ...b.toArray(), ...b.toArray(), ...c.toArray(), ...d.toArray()); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); return g;
  };
  const limb = (p0, p1, r0, r1, fork) => {
    if (Math.hypot(p0.x, p0.z) > NEAR) return;                       // out in the mist the leaves alone read as a crown: no wood
    const d = p1.clone().sub(p0), mid = p0.clone().lerp(p1, 0.5).add(V(Q(-0.2, 0.2), d.length() * Q(0.08, 0.18), Q(-0.2, 0.2)));
    const c = new THREE.CatmullRomCurve3([p0, mid, p1]); geos.push(bake(strip(c, r0, r1, seg), 0, 18));
    for (let i = 0; i < fork; i++) {                                    // twigs off the outer half, splaying up and sideways
      const q = c.getPointAt(Q(0.5, 0.8)), side = V(-d.z, 0, d.x).normalize().multiplyScalar(i % 2 ? 1 : -1), L = d.length() * Q(0.35, 0.55);
      const e = q.clone().addScaledVector(d.clone().normalize(), L * 0.5).addScaledVector(side, L * 0.7).add(V(0, L * 0.5, 0));
      geos.push(bake(strip(new THREE.CatmullRomCurve3([q, q.clone().lerp(e, 0.5).add(V(0, L * 0.12, 0)), e]), r1 * 0.9, r1 * 0.35, seg), 0, 18));
      tops.push([e.x, e.y + 0.3, e.z, L * 0.6 + 0.5, 0.3]);
    }
  };
  for (const [cx, cy, cz, r, tx, tz, ts] of clumps) {
    if (tx === undefined) continue;
    if (ts) {                                                           // a forest tree's side clump: one limb up and out from the trunk
      const top = wall.find((w) => w[0] === tx && w[1] === tz)?.[3]; if (!top) continue;
      const y0 = Math.min(cy - Q(1.5, 2.5), top - 1.5), p1 = V(cx, cy - r * 0.25, cz);
      limb(V(tx, y0, tz).addScaledVector(p1.clone().setY(y0).sub(V(tx, y0, tz)).normalize(), 0.2 * ts), p1, 0.2 * ts, 0.07 * ts, twigs + 1);
    } else {                                                            // a big tree's crown clump: limbs from the top of the trunk
      const p1 = V(cx, cy - 0.4, cz), dir = p1.clone().setY(0).sub(V(tx, 0, tz)).normalize();
      limb(V(tx, TOP - 3.2, tz).addScaledVector(dir, 0.4), p1, 0.32, 0.1, twigs);
    }
  }
  for (const [x, z, s, top] of wall) {                                 // the crown on top of each forest tree
    if (!top) continue;
    const n = Math.round(Q(3, 5)), a0 = Q(0, 6.28);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 6.28 + Q(-0.3, 0.3), out = Q(1.6, 3.2) * s, y0 = top * Q(0.78, 0.9);
      const p1 = V(x + Math.cos(a) * out, top + Q(0.3, 1.8) * s, z + Math.sin(a) * out);
      limb(V(x + Math.cos(a) * 0.2 * s, y0, z + Math.sin(a) * 0.2 * s), p1, 0.2 * s, 0.07 * s, twigs + 1);
      tops.push([p1.x, p1.y + 0.3, p1.z, Q(1.2, 1.8) * s]);
    }
    tops.push([x, top + 0.4, z, 1.3 * s]);                              // covers the cut top of the trunk
  }
  scene.add(new THREE.Mesh(merge(geos), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: S.flat, side: THREE.DoubleSide })));
  // fewer leaves per crown for the big ball leaves of the other looks
  const per = (f) => LOOK === "moss" ? Math.max(1, Math.round(perClump * (f || 0.5) * 0.6)) : f ? 0 : 1, lm = new THREE.InstancedMesh(leafGeo, leafM, tops.reduce((n, t) => n + per(t[4]), 0)), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(); let i = 0;
  for (const [x, y, z, r, f] of tops) for (let k = 0; k < per(f); k++) {
    const u = V(Q(-1, 1), Q(-0.3, 0.6), Q(-1, 1)).normalize().multiplyScalar(r * Math.cbrt(Q(0, 1)) * (LOOK === "moss" ? 0.65 : 1));
    e.set(Q(0, 6.28), Q(0, 6.28), Q(0, 6.28)); q.setFromEuler(e);
    const sc = Q(leafScale[0], leafScale[1]) * (LOOK === "moss" ? 1.5 : r * 0.9) * Math.pow(D.leaves, -0.33);
    m.compose(V(x + u.x, y + u.y, z + u.z), q, V(sc, sc, sc)); lm.setMatrixAt(i, m);
    lm.setColorAt(i, c.setHex(S.leaf[(k + i) % 4]).multiplyScalar(0.72 + 0.4 * sstep(0, 14, y + u.y))); i++;
  }
  addSectors(lm);
}
// bushes along both verges of the jeep's track, so the walk out feels like a lane through the jungle
// (their own random stream, so the seeded layout of everything else stays the same)
if (track) {
  let s2 = 991; const Q2 = (a, b) => { s2 = (s2 * 16807) % 2147483647; return a + (s2 / 2147483647) * (b - a); };
  const vc = [], L = track.curve.getLength();
  for (let l = 2.5; l < L; l += 1.3) {
    const t = l / L, p = track.curve.getPointAt(t), d = track.curve.getTangentAt(t), side = V(-d.z, 0, d.x).normalize();
    if (Math.hypot(p.x, p.z) < RC - 0.5) continue;
    for (const k of [-1, 1]) vc.push([p.x + side.x * k * Q2(2.2, 3.2), Q2(0.5, 2.6), p.z + side.z * k * Q2(2.2, 3.2), Q2(0.7, 1.2)]);
  }
  for (const v of vc) v[1] += groundHeight(v[0], v[2]);   // on the banks beside the track
  const vm = new THREE.InstancedMesh(leafGeo, leafM, vc.length * perClump), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(); let i = 0;
  for (const [x, y, z, r] of vc) for (let k = 0; k < perClump; k++) {
    const u = V(Q2(-1, 1), Q2(-0.5, 0.8), Q2(-1, 1)).normalize().multiplyScalar(r * Math.cbrt(Q2(0, 1)));
    e.set(Q2(0, 6.28), Q2(0, 6.28), Q2(0, 6.28)); q.setFromEuler(e);
    const sc = Q2(leafScale[0], leafScale[1]) * (LOOK === "moss" ? 1 : r * 0.9) * Math.pow(D.leaves, -0.33) * (trackDist(x + u.x, z + u.z) < 1.6 ? 0 : 1);
    m.compose(V(x + u.x, y + u.y, z + u.z), q, V(sc, sc, sc)); vm.setMatrixAt(i, m);
    vm.setColorAt(i, c.setHex(S.leaf[(k + i) % 4]).multiplyScalar(0.72 + 0.4 * sstep(0, 14, y + u.y))); i++;
  }
  addSectors(vm);
}
// ferns and undergrowth in a thick band round the clearing
{
  let g, mat;
  if (LOOK === "moss") {
    const tex = canvasTex(256, 256, (cx, w, h) => {
      cx.translate(w / 2, h);
      for (let f = 0; f < 7; f++) { cx.save(); cx.rotate(-1.1 + f * 0.37); cx.strokeStyle = hex(S.leaf[f % 4]); cx.lineWidth = 3; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -220); cx.stroke(); cx.fillStyle = hex(S.leaf[(f + 1) % 4]);
        for (let s = 20; s < 215; s += 13) { const l = 30 * (1 - s / 230); cx.beginPath(); cx.ellipse(-l / 2, -s, l / 2, 4, -0.4, 0, 7); cx.ellipse(l / 2, -s, l / 2, 4, 0.4, 0, 7); cx.fill(); }
        cx.restore(); }
    });
    const a = new THREE.PlaneGeometry(1.4, 1.2).translate(0, 0.6, 0).toNonIndexed(), b = a.clone().rotateY(Math.PI / 2);
    g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([...a.attributes.position.array, ...b.attributes.position.array], 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute([...a.attributes.uv.array, ...b.attributes.uv.array], 2)); g.computeVertexNormals();
    mat = leafMat({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }, 0.03);
  } else if (LOOK === "paint") { g = new THREE.IcosahedronGeometry(0.5, 2).scale(1, 0.7, 1); mat = leafM; }
  else { g = new THREE.ConeGeometry(0.4, 1, 5).translate(0, 0.5, 0); mat = leafMat({}, 0); }
  const spots = [];
  for (let i = 0; i < 2000 && spots.length < Math.round(260 * D.ferns); i++) { const a = R(0, 6.28), r = RC - 0.6 + Math.pow(rnd(), 1.6) * 12, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!nearPath(x, z, 0.2, 1.1)) spots.push([x, z]); }
  const im = new THREE.InstancedMesh(g, mat, spots.length), m = new THREE.Matrix4(), c = new THREE.Color();
  spots.forEach(([x, z], i) => { const s = R(0.7, 1.5) * (trackDist(x, z) < 1.25 ? 0 : 1); m.compose(V(x, groundHeight(x, z) - 0.03, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), R(0, 6.28)), V(s, s, s)); im.setMatrixAt(i, m); im.setColorAt(i, c.setHex(S.leaf[i % 4]).multiplyScalar(0.75)); });
  addSectors(im);
}


export { A0, FLOOR_OVERLAYS, GLADE, GLADE_R, HERO, JEEP_AT, JEEP_OUT, JEEP_TAN, PATH_W, RC, V, branchCurves, clearing, d0, flatCol, jeepDist, merge, pathDist, polyDist, sloPath, t0, track, trackDist, woodMat };
