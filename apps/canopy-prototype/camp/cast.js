// Canopy Camp's seven named sloths (activities plan, "The seven sloths"; picked on names-prototype.html, which imports this
// list): each one's name, trait, favourite snack and how to dress it. dress(head, root) hangs the trait off the head bone
// (the cape off the body bone); call it after furify (and, in the camp, after body.js has given the body its bounding sphere).
// home: the spot it lives in (sloth/spots.js names: Hibi naps in the hammock, Sunny sits on the bench, Mango drives the jeep,
// Pip hangs on the laundry line, Hazel peeks out of the tent, Figgy and Bandit hang from the two low branches); scale: its
// size against the others (Pip is the smallest). sloths.js reads name, home, scale and dress. trait and fav are shown nowhere in the camp yet: they are kept for a menu that
// introduces the seven (review sloths-20). Exports CAST.
// Every trait mesh is marked userData.trait and named trait_<what> (sloths.js prints their triangles). The cards, the leaf hat
// and the plain-coloured parts (Figgy's stem, Bandit's vine, Sunny's scarf) are painted into one 256x256 atlas with one
// material, made the first time a sloth is dressed, and the parts on one bone are merged into one mesh (review R2-097). The
// bandana and the cape are skinned shells with their own textures (the bandana's pattern repeats), culled with the body.
// Triangles (sloths.js prints the camp's own): Hibi 2; Mango the bandana (grown from the head) + knot 2; Figgy 58 (leaf 48
// + stem 10, open at both ends: one is in the leaf, the other 8 mm across); Bandit the cape (grown from the back) + band 16
// + vine and knot 50 (a 3x8 ring); Hazel 2; Sunny 66 (scarf 64, a 4x8 ring: 3 sides made it a thin blade, + tails 2).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { canvasTex } from "./util.js";
// head bone frame (measured from the skinned mesh): head spans y 0.02..0.137, x ±0.078, z -0.092 (face) .. 0.049 (back);
// the neck is at y 0..0.015 (half width 0.045, z -0.04..0.033). Accessories hang off the head bone, the cape off the body bone.

// the atlas: each cell [x, y, w, h] in pixels (y down) and what is painted there, in the cell's own frame (w, h)
const CELLS = {
  leaf: [0, 0, 256, 128, (g, w, h) => {
    g.fillStyle = "#4caf3c"; g.beginPath(); g.moveTo(4, h / 2);
    g.bezierCurveTo(w * 0.3, -h * 0.15, w * 0.8, h * 0.05, w - 4, h / 2), g.bezierCurveTo(w * 0.8, h * 0.95, w * 0.3, h * 1.15, 4, h / 2);
    g.closePath(); g.fill(); g.strokeStyle = "#2f7a26"; g.lineWidth = 5; g.beginPath(); g.moveTo(4, h / 2); g.lineTo(w - 6, h / 2); g.stroke(); g.lineWidth = 2.5;
    for (let x = 30; x < w - 20; x += 34) for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + 26, h / 2 + sg * h * 0.42); g.stroke(); } }],
  hibiscus: [0, 128, 64, 64, (g, s) => { g.translate(s / 2, s / 2); g.fillStyle = "#ff4f86"; for (let k = 0; k < 5; k++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.ellipse(0, -13, 10, 14, 0, 0, 7); g.fill(); }
    g.fillStyle = "#c2185b"; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill(); g.strokeStyle = "#ffd23f"; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(9, -12); g.stroke(); }],
  bandanaKnot: [64, 128, 64, 64, (g) => { g.fillStyle = "#ff8a1f"; g.strokeStyle = "#c95f0a"; g.lineWidth = 2; g.beginPath(); g.ellipse(32, 18, 9, 8, 0, 0, 7); g.fill(); g.stroke();
    for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(32 + sg * 4, 24); g.lineTo(32 + sg * 16, 60); g.lineTo(32 + sg * 4, 56); g.closePath(); g.fill(); g.stroke(); } }],
  vineKnot: [128, 128, 64, 64, (g) => { g.fillStyle = "#3f7f24"; g.beginPath(); g.arc(32, 26, 10, 0, 7); g.fill(); for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(32, 30); g.lineTo(32 + sg * 14, 62); g.lineTo(32 + sg * 4, 62); g.fill(); } }],
  bow: [192, 128, 64, 64, (g) => { g.fillStyle = "#5aa7e8"; g.strokeStyle = "#2f74b5"; g.lineWidth = 2;
    for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + sg * 30, 12); g.lineTo(32 + sg * 30, 52); g.closePath(); g.fill(); g.stroke(); } g.beginPath(); g.arc(32, 32, 7, 0, 7); g.fill(); g.stroke(); }],
  tails: [0, 192, 64, 64, (g) => { g.fillStyle = "#ffcf33"; g.strokeStyle = "#d9a300"; g.lineWidth = 2; for (const [x, a] of [[22, -0.15], [40, 0.25]]) { g.save(); g.translate(x, 4); g.rotate(a); g.fillRect(-8, 0, 16, 52); g.strokeRect(-8, 0, 16, 52); g.fillStyle = "#ff8a1f"; g.fillRect(-8, 46, 16, 4); g.restore(); } }],
  // plain colours, side by side so they bleed only into each other in the small mip levels
  vine: [64, 192, 64, 64, "#3f7f24"], stem: [128, 192, 64, 64, "#5a3f22"], scarf: [192, 192, 64, 64, "#ffcf33"],
};
const AW = 256, AH = 256;
let atlasMat = null;
function atlas() {                                    // the atlas's one material, made the first time a sloth is dressed
  if (atlasMat) return atlasMat;
  const map = canvasTex(AW, AH, (g) => { for (const [x, y, w, h, paint] of Object.values(CELLS)) {
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    if (typeof paint === "string") { g.fillStyle = paint; g.fillRect(0, 0, w, h); } else paint(g, w, h);
    g.restore(); } });
  return (atlasMat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide }));
}
// a geometry's UVs moved into its cell (a plain colour: every UV on the cell's middle), then placed by position, rotation
// (an Euler's x, y, z) and scale in the bone's frame
function inCell(g, cell, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const [x, y, w, h, paint] = CELLS[cell], uv = g.attributes.uv, u0 = x / AW, v0 = 1 - (y + h) / AH, du = w / AW, dv = h / AH;
  for (let i = 0; i < uv.count; i++) typeof paint === "string" ? uv.setXY(i, u0 + du / 2, v0 + dv / 2) : uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
}
// the atlas parts on one bone as one mesh
function wear(bone, name, ...parts) {
  const m = new THREE.Mesh(parts.length > 1 ? mergeGeometries(parts) : parts[0], atlas());
  m.name = `trait_${name}`; m.userData.trait = true; bone.add(m); return m;
}
const card = (w, h) => new THREE.PlaneGeometry(w, h);
function bentPlane(w, l, sw, sl, bend) { const g = new THREE.PlaneGeometry(l, w, sl, sw), p = g.attributes.position; for (let i = 0; i < p.count; i++) bend(p, i); g.computeVertexNormals(); return g; }

// a skinned shell grown from the sloth's own surface: the triangles whose corners all pass keep(v) (v in the given bone's
// bind frame), pushed out along smoothed normals by off (bone units; the fur is only about 0.0012 deep there), so it hugs
// the head or back and bends with them. The smoothed normals are fur.js's furNormal when the body has fur (else averaged
// here). It is culled with the body's bounding sphere when the page has given the body one (body.js).
function shellFrom(o, boneName, keep, off, mat, uvOf, minW = 0.5) {
  let src; o.traverse((m) => { if (m.isSkinnedMesh && !src && !m.userData.fur) src = m; });
  const g = src.geometry, sk = src.skeleton, bi = sk.bones.findIndex((b) => b.name === boneName), inv = sk.boneInverses[bi];
  const P = g.attributes.position, n = P.count, v = new THREE.Vector3(), loc = [], ok = [];
  let NS = g.attributes.furNormal;
  if (!NS) {                                          // no fur: average the flat normals of every vertex at the same spot
    const N = g.attributes.normal, acc = new Map(), key = (i) => `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
    for (let i = 0; i < n; i++) { const a = acc.get(key(i)) || [0, 0, 0]; a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i); acc.set(key(i), a); }
    NS = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    for (let i = 0; i < n; i++) { const a = acc.get(key(i)), l = Math.hypot(...a) || 1; NS.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  }
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(src.bindMatrix).applyMatrix4(inv); loc.push(v.clone());
    let w = 0; for (let c = 0; c < 4; c++) if (g.attributes.skinIndex.getComponent(i, c) === bi) w += g.attributes.skinWeight.getComponent(i, c);
    ok.push((minW < 0 || w > minW) && keep(v, w, sk.bones[g.attributes.skinIndex.getComponent(i, 0)].name)); }
  // offsets are given in the bone's frame (where the head is 0.14 tall); the packed geometry has its own scale
  const K = new THREE.Vector3().setFromMatrixScale(inv.clone().multiply(src.bindMatrix)).x;
  const idx = g.index ? g.index.array : [...Array(n).keys()], tris = [];
  for (let i = 0; i < idx.length; i += 3) if (ok[idx[i]] && ok[idx[i + 1]] && ok[idx[i + 2]]) tris.push(idx[i], idx[i + 1], idx[i + 2]);
  const out = new THREE.BufferGeometry(), m = tris.length, pos = new Float32Array(m * 3), uv = new Float32Array(m * 2), si = new Float32Array(m * 4), sw = new Float32Array(m * 4);
  tris.forEach((i, k) => { const d = (typeof off === "function" ? off(loc[i]) : off) / K;
    pos.set([P.getX(i) + NS.getX(i) * d, P.getY(i) + NS.getY(i) * d, P.getZ(i) + NS.getZ(i) * d], k * 3);
    uv.set(uvOf(loc[i]), k * 2); for (let c = 0; c < 4; c++) { si[k * 4 + c] = g.attributes.skinIndex.getComponent(i, c); sw[k * 4 + c] = g.attributes.skinWeight.getComponent(i, c); } });
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4)); out.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4)); out.computeVertexNormals();
  const sh = new THREE.SkinnedMesh(out, mat); sh.bind(sk, src.bindMatrix); src.parent.add(sh);
  if (src.boundingSphere) sh.boundingSphere = src.boundingSphere.clone(); else sh.frustumCulled = false;
  sh.userData.trait = true; sh.userData.kept = tris.map((i) => loc[i]); return sh;
}
export const CAST = [
  { name: "Hibi", home: "hammock", trait: "flower by the ear", fav: "🌺 hibiscus", dress(h) { wear(h, "hibiscus", inCell(card(0.055, 0.055), "hibiscus", [0.068, 0.11, -0.045], [0, 0.45, -0.3])); } },
  { name: "Mango", home: "jeep", trait: "orange bandana", fav: "🥭 mango", dress(h, o) {
    const t = canvasTex(128, 128, (g, w, hh) => { g.fillStyle = "#ff8a1f"; g.fillRect(0, 0, w, hh); g.fillStyle = "#fff4dc"; for (let y = 6; y < hh; y += 16) for (let x = (y % 32 ? 0 : 8); x < w; x += 16) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); } });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; const m = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
    shellFrom(o, "head", (v) => v.y > (v.z < -0.02 ? 0.066 - 0.2 * (v.z + 0.02) : 0.066 - 0.9 * (v.z + 0.02)), 0.004, m, (v) => [Math.atan2(v.x, -v.z) / 1.6, v.y * 9]).name = "trait_bandana";
    wear(h, "bandanaKnot", inCell(card(0.075, 0.075), "bandanaKnot", [0, 0.06, 0.06], [-0.15, 0, 0])); } },
  { name: "Figgy", home: "branch", trait: "leaf hat", fav: "🟣 fig", dress(h) {
    const C = new THREE.Vector3(0, 0.066, -0.02), RR = 0.088;
    const leaf = bentPlane(0.12, 0.2, 4, 6, (p, i) => { const u = p.getX(i) + 0.02, v = p.getY(i), r = Math.hypot(u, v) || 1e-6, a = r / RR;
      p.setXYZ(i, C.x + RR * Math.sin(a) * v / r, C.y + RR * Math.cos(a) * 0.95, C.z + RR * Math.sin(a) * -u / r); });
    // the hat (leaf and stem) is turned on the head as a whole
    const hat = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.005, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.9, 0.3)), new THREE.Vector3(1, 1, 1));
    const stem = inCell(new THREE.CylinderGeometry(0.004, 0.005, 0.03, 5, 1, true), "stem", [0, RR * 0.95 + C.y + 0.012, C.z + 0.01], [0.4, 0, 0]);
    wear(h, "leafHat", inCell(leaf, "leaf").applyMatrix4(hat), stem.applyMatrix4(hat)); } },
  { name: "Bandit", home: "branch", trait: "banana-leaf cape", fav: "🍌 banana", dress(h, o) {
    const t = canvasTex(128, 128, (g, w, hh) => { g.fillStyle = "#79c046"; g.fillRect(0, 0, w, hh); g.strokeStyle = "#4f8f2c"; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, hh); g.stroke();
      g.lineWidth = 1.6; for (let y = -w; y < hh; y += 6) for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + sg * w / 2, y + w * 0.35); g.stroke(); }
      g.globalCompositeOperation = "destination-out"; for (let x = 0; x < w; x += 11) { g.beginPath(); g.moveTo(x, hh); g.lineTo(x + 5.5, hh - 9 - (x % 22 ? 0 : 6)); g.lineTo(x + 11, hh); g.fill(); } });
    const m = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
    const cape = shellFrom(o, "body", (v) => v.z > -0.012 && v.y > -0.06 + Math.abs(v.x) * 0.3, (v) => 0.005 + Math.max(0, 0.08 - v.y) * 0.1, m, (v) => [0.5 + v.x * 6.5, 1 - (0.12 - v.y) * 6.5], 0.3);
    cape.name = "trait_cape";
    // the vine that holds it: a thin ring round the shoulders at the cape's top edge (in the body bone's frame), knotted at the chest
    // the body mesh stops at the shoulders (y 0.09) and the neck belongs to the head, so a short open band (16 tris) carries the cape
    // from its top edge up to the neck (y 0.112), round the back and sides, where the vine ties it
    const ks = cape.userData.kept, y0 = Math.max(...ks.map((v) => v.y)), top = 0.112, r0 = 0.065, r1 = 0.056;
    const band = new THREE.CylinderGeometry(r1, r0, top - y0, 8, 1, true, -1.95, 3.9); band.translate(0, (top + y0) / 2, 0.002);
    const bp = band.attributes.position, bu = band.attributes.uv; for (let i = 0; i < bp.count; i++) bu.setXY(i, 0.5 + bp.getX(i) * 6.5, 1 - (0.12 - bp.getY(i)) * 6.5);
    const bm = new THREE.Mesh(band, m); bm.name = "trait_capeBand"; bm.userData.trait = true; h.parent.add(bm);
    const rx = r1 + 0.004;
    wear(h.parent, "vine", inCell(new THREE.TorusGeometry(1, 0.007 / rx, 3, 8), "vine", [0, top - 0.002, 0.002], [Math.PI / 2, 0, 0], [rx, rx * 0.8, rx]),
      inCell(card(0.035, 0.035), "vineKnot", [0, top - 0.01, 0.002 - rx * 0.8 - 0.004], [0, Math.PI, 0])); } },
  { name: "Pip", home: "line", trait: "the smallest", fav: "🌺 hibiscus", scale: 0.72 },
  { name: "Hazel", home: "tent", trait: "blue bow", fav: "🟣 fig", dress(h) { wear(h, "bow", inCell(card(0.06, 0.04), "bow", [-0.035, 0.128, -0.05], [-0.35, -0.3, 0.4])); } },
  { name: "Sunny", home: "seat", trait: "yellow scarf", fav: "🥭 mango", dress(h) {
    wear(h, "scarf", inCell(new THREE.TorusGeometry(0.05, 0.017, 4, 8), "scarf", [0, 0.012, -0.006], [Math.PI / 2, 0, 0], [1.08, 0.9, 1]),
      inCell(card(0.05, 0.07), "tails", [0.02, -0.022, -0.06], [0.25, 0, 0])); } },
];
