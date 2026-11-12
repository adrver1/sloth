// Canopy Camp deadwood (camp review B6): a fallen mossy log, a cut stump and a dead standing trunk at the clearing's edge,
// with orange shelf fungus on all three. Low poly (about 300 tris in all, one draw) with the detail painted into vertex
// colours the way the forest trunks are (forest.js bake()): moss on the up-facing bark, pale wood with rings on the cut ends.
// Lit live like the forest round them, so no light-map bake; their ground shadows join the GPU bake through window.__deadwood.
import * as THREE from "three";
import { S, canvasTex, scene } from "./core.js";
import { HERO, JEEP_AT, RC, V, trackDist } from "./forest.js";
import { blockers } from "./campProps.js";
import { groundHeight } from "./terrain.js";

let s = 9173; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, R = (a, b) => a + rnd() * (b - a);   // own stream: the shared one sets the rest of the layout
const barkA = new THREE.Color(S.bark[0]), barkB = new THREE.Color(S.bark[1]), mossC = new THREE.Color(S.moss), grey = new THREE.Color(0xb3ab9c), wood = new THREE.Color(0xc9a77a), ring = new THREE.Color(0x8a6440), fungus = new THREE.Color(0xe0782a), fungusRim = new THREE.Color(0xf6c060);
// the bark, painted once and multiplied over the vertex colours: grooves along the wood, flecks and lichen spots; the
// strip at u > 0.96 stays white for the fungus
const barkTex = canvasTex(128, 128, (g, w, h) => {
  let q = 51; const Q = (a, b) => { q = (q * 16807) % 2147483647; return a + (q / 2147483647) * (b - a); };
  g.fillStyle = "#e8e2d8"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const x = Q(0, w * 0.96); g.strokeStyle = `rgba(40,28,18,${Q(0.25, 0.55)})`; g.lineWidth = Q(1, 3); g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= h; y += 16) g.lineTo(x + Q(-2, 2), y); g.stroke(); }
  for (let i = 0; i < 90; i++) { g.fillStyle = Q(0, 1) < 0.7 ? `rgba(60,45,30,${Q(0.15, 0.35)})` : `rgba(200,210,170,${Q(0.2, 0.4)})`; g.beginPath(); g.ellipse(Q(0, w * 0.96), Q(0, h), Q(1, 3.5), Q(1, 2.5), 0, 0, 7); g.fill(); }
  g.fillStyle = "#ffffff"; g.fillRect(w * 0.965, 0, w * 0.035, h);
});
barkTex.wrapT = THREE.RepeatWrapping;
const deadMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: barkTex });
function merge(geos) {                               // position, normal, uv and colour; one draw
  const at = { position: [], normal: [], uv: [], color: [] };
  for (const g of geos) for (const k in at) at[k].push(...g.attributes[k].array);
  const m = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(at)) m.setAttribute(k, new THREE.Float32BufferAttribute(a, k === "uv" ? 2 : 3)); return m;
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// vertex colours: bark (or bleached grey for the dead trunk) with moss where a face looks up, darker low down;
// cap vertices (flagged by the caller) get pale wood, the cap's centre a darker heart, so the cut end shows rings
function paint(g, { bleach = 0, moss = 1, y0 = 0, y1 = 1, cap = () => -1, uv = [1, 1] }) {
  g.computeVertexNormals(); g = g.toNonIndexed();
  const t = g.attributes.uv; for (let i = 0; i < t.count; i++) t.setXY(i, t.getX(i) * uv[0] * 0.96, t.getY(i) * uv[1]);   // tiles of bark, kept off the clean strip   // smooth normals round the bark; three's cylinder caps have their own vertices, so the cut ends stay flat
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = cap(x, y, z, n.getX(i), n.getY(i), n.getZ(i));
    if (k >= 0) c.copy(wood).lerp(ring, k);
    else {
      c.copy(barkA).lerp(barkB, 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 7 + y * 3.1)).lerp(grey, bleach);
      c.lerp(mossC, sm(0.45, 0.9, n.getY(i) + 0.6 * Math.sin(x * 4.3 + z * 3.7 + y * 2.9) * Math.sin(x * 1.7 - z * 2.3 + 1.0)) * S.mossAmt * moss);   // moss in patches along the top
      c.multiplyScalar(0.7 + 0.3 * sm(y0, y1, y));
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); return g;
}
// a shelf fungus bracket: a flat half-disc fan (top and underside, 3 segments: 6 tris), orange with a pale rim
function bracket(r) {
  const P = [], C = [], top = (a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (let i = 0; i < 3; i++) { const a0 = (i / 3) * Math.PI, a1 = ((i + 1) / 3) * Math.PI;
    P.push(0, 0.05, 0, ...top(a1, -0.005), ...top(a0, -0.005));   // top, sloping off to the rim
    P.push(0, -0.02, 0, ...top(a0, -0.015), ...top(a1, -0.015));    // the paler underside
    C.push(...fungus.toArray(), ...fungusRim.toArray(), ...fungusRim.toArray(), ...fungusRim.toArray(), ...fungusRim.toArray(), ...fungusRim.toArray()); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(P.length / 3 * 2).fill(0).map((_, i) => i % 2 ? 0.5 : 0.985), 2)); g.computeVertexNormals(); return g;   // the texture's clean strip
}
// brackets stuck to a surface point, facing out along dir (xz), a little tilted
const shelf = (out, at, dir, r) => { const a = Math.atan2(dir.z, dir.x); out.push(bracket(r).rotateZ(R(-0.12, 0.08)).rotateY(-a + Math.PI / 2).translate(at.x, at.y, at.z)); };

// ---------------------------------------------------------------- where: three spread-out spots at the edge, clear of the props, the
// track, the big trees and the jeep
const ok = (x, z, r) => trackDist(x, z) > 2.2 + r && Math.hypot(x - JEEP_AT.x, z - JEEP_AT.z) > 3.6 + r && !blockers.some(([c, br]) => Math.hypot(x - c.x, z - c.z) < br + r + 0.8) && !HERO.some((h) => Math.hypot(x - h.x, z - h.z) < 2.6 + r);
const spots = [];
for (const [rad, need] of [[RC - 1.3, 1.4], [RC - 1.4, 0.6], [RC + 0.2, 0.5]]) {   // the log, the stump, the dead trunk
  const a0 = R(0, 6.28);
  for (let i = 0; i < 120; i++) { const a = a0 + i * 0.0523, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (ok(x, z, need) && spots.every((q) => Math.hypot(q.x - x, q.z - z) > 5)) { spots.push(V(x, 0, z)); break; } }
}
const parts = [], tris = {}, layout = [];
// seated on the ground (camp/terrain.js): each piece moves up or down by the height under it, a little sunk
const lift = (from, c) => { const y = groundHeight(c.x, c.z) - 0.03; for (const g of parts.slice(from)) g.translate(0, y, 0); return y; };
const count = (name, from) => { tris[name] = parts.slice(from).reduce((n, g) => n + g.attributes.position.count / 3, 0); };

// the fallen log: lying along the edge, half sunk, one end broken off; moss along its back
if (spots[0]) { const c = spots[0], yaw = Math.atan2(c.z, c.x) + Math.PI / 2 + R(-0.3, 0.3), L = 2.6, r = 0.27, from = parts.length;
  const g = new THREE.CylinderGeometry(r * 0.92, r, L, 8, 3, false).rotateZ(Math.PI / 2);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x < -L / 2 + 0.01) p.setXYZ(i, x - (p.getY(i) > 0 ? 0.12 : 0) + Math.sin(i * 2.7) * 0.06, p.getY(i), p.getZ(i)); p.setY(i, p.getY(i) + 0.04 * Math.sin(x * 2.1)); }   // the broken end splinters
  parts.push(paint(g, { y0: -r, y1: r, cap: (x, y, z, nx) => Math.abs(nx) > 0.9 && x > 0 ? Math.min(1, Math.hypot(y, z) < 0.02 ? 1 : 0.15) : -1, uv: [1, 2] }).rotateY(-yaw).translate(c.x, r * 0.75, c.z));
  const stub = new THREE.ConeGeometry(0.07, 0.6, 5, 1).rotateZ(-0.9).translate(0.35, r + 0.15, 0.1);   // a broken branch stub
  parts.push(paint(stub, { moss: 0.5, y0: 0, y1: 0.6 }).rotateY(-yaw).translate(c.x, r * 0.75 - 0.1, c.z));
  const ax = V(Math.cos(yaw), 0, Math.sin(yaw)), side = V(-ax.z, 0, ax.x);
  for (let i = 0; i < 3; i++) { const t = R(-0.9, 0.9), sd = i % 2 ? 1 : -1; shelf(parts, c.clone().addScaledVector(ax, t).addScaledVector(side, sd * r * 0.98).setY(r * 0.75 + R(-0.05, 0.08)), side.clone().multiplyScalar(sd), R(0.12, 0.16)); }
  for (const t of [-0.9, 0, 0.9]) blockers.push(Object.assign([c.clone().addScaledVector(ax, t), 0.35], { wild: true }));
  layout.push({ name: "FallenLog", x: c.x, z: c.z, y: lift(from, c), yaw, L, r }); count("log", from);
}
// the stump: a cut stump with flared roots and a ringed top
if (spots[1]) { const c = spots[1], r = 0.36, h = 0.48, from = parts.length;
  const g = new THREE.CylinderGeometry(r * 0.85, r * 1.2, h, 9, 2, false).translate(0, h / 2, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), f = 1 + (y < 0.01 ? 0.7 * Math.max(0, Math.cos(a * 4 + 0.4)) : y < h - 0.01 ? 0.12 * Math.max(0, Math.cos(a * 4 + 0.4)) : 0);   // roots flare out at the foot
    p.setXYZ(i, x * f, y > h - 0.01 ? h + 0.03 * Math.sin(a * 2) * Math.hypot(x, z) / r : y < 0.01 ? -0.02 : y, z * f); }
  parts.push(paint(g, { y0: 0, y1: h, cap: (x, y, z, nx, ny) => ny > 0.8 ? (Math.hypot(x, z) < 0.02 ? 1 : 0.2) : -1, uv: [2, 0.5] }).translate(c.x, 0, c.z));
  const out = c.clone().normalize().negate();
  for (let i = 0; i < 2; i++) { const a = Math.atan2(out.z, out.x) + (i ? 0.7 : -0.6), d = V(Math.cos(a), 0, Math.sin(a)); shelf(parts, c.clone().addScaledVector(d, r * 1.02).setY(0.18 + i * 0.14), d, R(0.12, 0.15)); }
  blockers.push(Object.assign([c.clone(), r + 0.1], { wild: true })); layout.push({ name: "Stump", x: c.x, z: c.z, y: lift(from, c), r, h }); count("stump", from);
}
// the dead trunk: a bleached snag, snapped off at the top, a broken limb, fungus climbing it
if (spots[2]) { const c = spots[2], H = 4.6, from = parts.length;
  const g = new THREE.CylinderGeometry(0.2, 0.34, H, 7, 3, true).translate(0, H / 2, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    p.setXYZ(i, x + Math.sin(y * 0.6) * 0.12, y > H - 0.01 ? H - 0.5 * (0.5 + 0.5 * Math.sin(a * 3 + 1)) : y, z); }   // jagged snapped top
  parts.push(paint(g, { bleach: 0.8, moss: 0.6, y0: 0, y1: 2.5, uv: [1, 4] }).translate(c.x, 0, c.z));
  const limb = new THREE.ConeGeometry(0.08, 1.1, 5, 1).rotateZ(-1.1).translate(0.45, 3.0, 0);
  parts.push(paint(limb, { bleach: 0.8, moss: 0.3, y0: 0, y1: 2.5 }).rotateY(R(0, 6.28)).translate(c.x, 0, c.z));
  const out = c.clone().normalize().negate();
  for (let i = 0; i < 4; i++) { const a = Math.atan2(out.z, out.x) + R(-0.8, 0.8), d = V(Math.cos(a), 0, Math.sin(a)), y = 0.5 + i * 0.42 + R(-0.1, 0.1), rr = 0.34 - y * 0.03; shelf(parts, c.clone().addScaledVector(d, rr).setY(y), d, R(0.13, 0.19)); }
  blockers.push(Object.assign([c.clone(), 0.45], { wild: true }));   // wild: no worn dirt or path to it (ground.js) layout.push({ name: "DeadTrunk", x: c.x, z: c.z, y: lift(from, c), H }); count("deadTrunk", from);
}
// roots (forest-ground note 2b): low half-round roots spreading 1.5 to 2.6 m from both big trees over the ground, across the sloths'
// way down, so the trees sit in the ground instead of on it. 16 triangles each, in the same draw and bark as the deadwood.
{ const from = parts.length;
  for (const [k, h] of HERO.entries()) for (let i = 0, n = k ? 8 : 10; i < n; i++) {
    const a = (i / n) * 6.28 + R(-0.25, 0.25), L = R(1.5, 2.6), r0 = R(0.11, 0.15), dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x), bend = R(-0.35, 0.35);
    const P = [], U = [], I = [];
    for (let j = 0; j <= 2; j++) { const t = j / 2, rad = r0 * (1 - 0.75 * t), c = h.clone().addScaledVector(dir, 0.9 + t * L).addScaledVector(side, bend * t * t);
      for (let q = 0; q <= 4; q++) { const th = (q / 4) * Math.PI, x = c.x + side.x * Math.cos(th) * rad, z = c.z + side.z * Math.cos(th) * rad;
        P.push(x, groundHeight(x, z) - 0.015 - 0.04 * t * t + Math.sin(th) * rad * 0.7, z); U.push(q / 4, t * L * 1.5); } }
    for (let j = 0; j < 2; j++) for (let q = 0; q < 4; q++) { const b = j * 5 + q; I.push(b, b + 5, b + 1, b + 1, b + 5, b + 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
    parts.push(paint(g, { moss: 0.8, y0: -2, y1: -1 }));
  }
  count("roots", from);
}
const geo = merge(parts), mesh = new THREE.Mesh(geo, deadMat); mesh.name = "Deadwood"; scene.add(mesh);
tris.total = geo.attributes.position.count / 3;
window.__deadwood = { layout, tris };   // for the GPU thread's ground-shadow bake (props/bake_all.py) and the tris report
export { mesh as deadwood };
