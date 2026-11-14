// Canopy Camp forest: bark with baked AO and moss, the clearing floor with the path and track ribbons (the layout itself is layout.js),
// the two big mossy trees with their low branches, the forest wall of trunks, leaves in culled wedges, ferns and verge plants.
// Exports buildForest() (main.js, once), FLOOR_OVERLAYS, branchCurves (the big trees' low branches), grassTex (the clearing's
// grass tile, for ground.js), track and trackDist, and for glade.js's bushes leafGeo, leafM, perClump, cards(n), scatterLeaves,
// clumpN and withLeafN (the leaf card, its material, how many leaves a clump draws from its stream, how many of n become cards,
// the leaf scatter every leafy thing shares, a leaf's light normal and the card geometry that carries them).
import * as THREE from "three";
import { addMound, groundHeight, jeepDist } from "./terrain.js";
import { D, hex, JEEP, leafMat, OPT, rng, S, scene } from "./core.js";
// the forest starts its stream where it always restarted the old shared one (3000 + ?seed), so its trees, and the root mounds
// under them that shape the ground the light and ground bakes were made on, stay where they were baked
const { R, rnd } = rng("forest", 3000 + OPT.seed);
import { V, canvasTex, lcg, rand, sstep } from "./util.js";
import { GLADE, GLADE_R, HERO, JEEP_TRACK, PATH_A, PATH_HALF, RC, TRACK_HALF, pathDist, pathLane, sloPath } from "./layout.js";

// ---------------------------------------------------------------- bark with "baked" light: AO by height and crevice, moss on the upper sides
const barkA = new THREE.Color(S.bark[0]), barkB = new THREE.Color(S.bark[1]), mossC = new THREE.Color(S.moss);
function paintBark(geo, y0, y1) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const crev = 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 9 + y * 0.7 + Math.sin(y * 2.3) * 1.5);
    c.copy(barkA).lerp(barkB, crev * 0.7);
    const up = n.getY(i), m = sstep(0.05, 0.6, up + 0.35 * Math.sin(x * 3.1 + z * 2.7 + y * 1.9)) * S.mossAmt;
    c.lerp(mossC, m);
    c.multiplyScalar(0.45 + 0.55 * sstep(y0, y1, y));                       // darker near the forest floor
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
const barkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const woodGeos = [];
function merge(geos) {                               // position, normal, colour only; one draw for many parts
  const pos = [], nor = [], col = [];
  for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array); }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return m;
}

// ================================================================ layout (camp/layout.js)
// a round clearing (radius RC) with the camp in it; two big mossy trees at its edge lean their low branches over it,
// and that is where the sloths hang. Everything past the edge is the forest wall: instanced trunks, leaves and mist.
// The forest draws from its own stream (core.js rng), so it grows the same whatever the other systems drew.
// the jeep's track (layout.js JEEP_TRACK), unless ?jeep=none. trackDist() thins trunks, leaves and ferns off the track, the
// path and the glade.
const track = JEEP === "none" ? null : JEEP_TRACK;
function trackDist(x, z) { return Math.min(jeepDist(x, z), pathDist(x, z)); }   // anything kept open: the jeep's track, the path, the glade

const FLOOR_OVERLAYS = [];   // the path and track ribbons drawn on the floor: they take the ground's contact shadow (groundLife.shadeOn)
const branchCurves = [], TOP = 15;   // the big trees' low branches (the sloths hang from them), and their height
let grassTex, leafGeo, leafM, perClump, leafScale;   // set by buildForest
// buildForest (main.js, once, right after the sky) runs the steps below in this order. Every step but the crowns and the
// verge draws from the forest stream, so the order is what keeps the forest as it was baked: do not move a step.
function buildForest() {
  clearingFloor();               // the grass tile and the footpath to the glade
  trackRoad();                   // the jeep's dirt road and the tyre ruts (not with ?jeep=none)
  heroTrees();                   // the two big mossy trees, their low branches and lianas: one draw of bark
  const wall = forestWall();     // the forest wall's trunks, each on a root mound
  leafCard();                    // the leaf card everything leafy shares (leafGeo, leafM, perClump, leafScale)
  const clumps = wallLeaves(wall);   // the leaf clumps on the wall, the branches, the big crowns and the eye-height edge
  crowns(wall, clumps);          // limbs into the clumps and a crown on each near forest tree (its own stream)
  verge();                       // bushes along the jeep's track (its own stream)
  ferns();                       // ferns and undergrowth round the clearing
}

// A ribbon on the floor along a curve (the footpath and the jeep's track and ruts): n segments, half its width either side,
// y above 0, tex tiled along it every tile metres, alpha(point, metres along, length) per row, drawn in renderOrder order. Wound
// face up, so it needs no back side. It takes the ground's contact shadow (FLOOR_OVERLAYS, groundLife.shadeOn).
function ribbon(curve, { n, half, y, tex, alpha, tile, order }) {
  const pos = [], uv = [], col = [], idx = [], L = curve.getLength();
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), d = curve.getTangentAt(t), side = V(-d.z, 0, d.x).normalize(), a = alpha(p, t * L, L);
    for (const k of [-1, 1]) {
      const q = p.clone().addScaledVector(side, k * half);
      pos.push(q.x, y, q.z); uv.push((k + 1) / 2, (t * L) / tile); col.push(1, 1, 1, a);
    }
    if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
  tex.wrapT = THREE.RepeatWrapping;
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  mesh.renderOrder = order; scene.add(mesh); FLOOR_OVERLAYS.push(mesh);
}

function clearingFloor() {
  // ---------------------------------------------------------------- clearing floor
  // the grass tile: ground.js paints the clearing with it (the flat clearing disc it was drawn on is gone)
  grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex(new THREE.Color(S.leaf[3]).lerp(new THREE.Color(0xd8e0a0), 0.25).getHex()); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.strokeStyle = hex(S.leaf[i % 4]); g.globalAlpha = R(0.2, 0.6); g.lineWidth = 1.5; const x = R(0, w), y = R(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-2, 2), y - R(3, 8)); g.stroke(); }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(6, 6);
  // the footpath to the glade: one ribbon of trodden earth (1 draw, 96 triangles); the glade's own floor is camp/glade.js
  {
    const Q = rand;   // texture noise only
    // packed earth, warmer and lighter than the forest floor so it reads from the camp (Adriaen 2026-11-14: "more prominent"): two darker
    // lanes where feet go, pebbles, a few fallen leaves, grass at the verges and a ragged edge (the texture tiles every 2.5 m)
    const earth = canvasTex(128, 512, (g, w, h) => {
      g.fillStyle = "#a3845a"; g.fillRect(0, 0, w, h);
      {
        for (const cx of [0.4, 0.6]) { const b = g.createLinearGradient(w * (cx - 0.12), 0, w * (cx + 0.12), 0); b.addColorStop(0, "rgba(110,84,56,0)"); b.addColorStop(0.5, "rgba(110,84,56,.45)"); b.addColorStop(1, "rgba(110,84,56,0)"); g.fillStyle = b; g.fillRect(0, 0, w, h); }
        for (let i = 0; i < 700; i++) { g.fillStyle = ["#8a6c48", "#b89a70", "#76593c"][i % 3]; g.globalAlpha = Q(0.2, 0.5); g.beginPath(); g.ellipse(Q(0, w), Q(0, h), Q(1, 4), Q(1, 2.5), Q(0, 3), 0, 7); g.fill(); }
        for (let i = 0; i < 60; i++) { g.fillStyle = ["#cbbd9f", "#9d927f"][i % 2]; g.globalAlpha = Q(0.6, 0.9); g.beginPath(); g.ellipse(Q(w * 0.2, w * 0.8), Q(0, h), Q(1.2, 2.6), Q(1, 2), Q(0, 3), 0, 7); g.fill(); }   // pebbles
        for (let i = 0; i < 26; i++) { g.fillStyle = ["#b8743a", "#d3a24a", "#8a5a2c"][i % 3]; g.globalAlpha = Q(0.6, 0.9); const x = Q(0, 1) < 0.7 ? (Q(0, 1) < 0.5 ? Q(8, 30) : Q(w - 30, w - 8)) : Q(30, w - 30); g.beginPath(); g.ellipse(x, Q(0, h), Q(3, 5), Q(1.4, 2.4), Q(0, 3), 0, 7); g.fill(); }   // fallen leaves, mostly at the sides
      }
      // grass at the verges
      g.globalAlpha = 1;
      for (let i = 0; i < 60; i++) { g.strokeStyle = hex(S.leaf[i % 4]); g.lineWidth = 2; const x = Q(0, 1) < 0.5 ? Q(4, 22) : Q(w - 22, w - 4), y = Q(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Q(-3, 3), y - Q(5, 11)); g.stroke(); }
      const img = g.getImageData(0, 0, w, h), d = img.data;   // a ragged edge: the verge wanders in and out along the path
      for (let y = 0; y < h; y++) { const t = (y / h) * 6.2832, l = 0.2 + 0.05 * Math.sin(t * 3 + 1) + 0.03 * Math.sin(t * 7), r = 0.8 + 0.05 * Math.sin(t * 2 + 4) + 0.03 * Math.sin(t * 9 + 2);
        for (let x = 0; x < w; x++) { const u = x / w; d[(y * w + x) * 4 + 3] *= sstep(l - 0.12, l + 0.04, u) * (1 - sstep(r - 0.04, r + 0.12, u)); } }
      g.putImageData(img, 0, 0);
    }, { read: true });
    // the ribbon starts in the camp, just past the log seats round the fire, and runs out between the tent and the laundry line
    // onto the glade path (Adriaen 2026-11-14: "continue past the tent to the camp"); sloPath itself, which the player and the
    // terrain follow, still starts at RC - 2. About 2 m wide, about 1.2 m of it bare earth; it fades in at the seats and out into the glade.
    const way = new THREE.CatmullRomCurve3([V(Math.cos(PATH_A) * 3.0, 0, Math.sin(PATH_A) * 3.0), V(Math.cos(PATH_A) * 5.0, 0, Math.sin(PATH_A) * 5.0), ...sloPath.curve.points]);
    ribbon(way, { n: 48, half: PATH_HALF * 1.35, y: 0.024, tex: earth, tile: 2.5, order: 1, alpha: (p, l, L) => sstep(0, 1.0, l) * (1 - sstep(L - 1.2, L, l)) });
  }
}

function trackRoad() {
  // ---------------------------------------------------------------- the jeep's track: a dirt road out through the forest, and muddy tyre ruts up to its wheels
  if (track) {
    const Q = rand;   // texture noise only: leaves the seeded layout alone
    const mud = ["#8a6c4a", "#6b5038", "#4a3626"];
    const dirt = canvasTex(128, 512, (g, w, h) => {
      g.fillStyle = mud[0]; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { g.fillStyle = mud[1 + (i % 2)]; g.globalAlpha = Q(0.15, 0.45); g.beginPath(); g.ellipse(Q(0, w), Q(0, h), Q(1, 5), Q(1, 3), Q(0, 3), 0, 7); g.fill(); }
      g.globalAlpha = 1;
      for (let i = 0; i < 26; i++) { g.strokeStyle = hex(S.leaf[i % 4]); g.lineWidth = 2; const x = Q(0, w) < w / 2 ? Q(0, 16) : Q(w - 16, w), y = Q(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Q(-2, 2), y - Q(4, 9)); g.stroke(); }   // grass tufts at the verges
      const e = g.createLinearGradient(0, 0, w, 0); e.addColorStop(0, "rgba(0,0,0,0)"); e.addColorStop(0.18, "rgba(0,0,0,1)"); e.addColorStop(0.82, "rgba(0,0,0,1)"); e.addColorStop(1, "rgba(0,0,0,0)");
      g.globalCompositeOperation = "destination-in"; g.fillStyle = e; g.fillRect(0, 0, w, h);
    });
    const ruts = canvasTex(128, 256, (g, w, h) => {
      for (const cx of [w * 0.14, w * 0.86]) {
        const b = g.createLinearGradient(cx - 14, 0, cx + 14, 0); b.addColorStop(0, "rgba(60,42,28,0)"); b.addColorStop(0.25, "rgba(60,42,28,.85)"); b.addColorStop(0.75, "rgba(60,42,28,.85)"); b.addColorStop(1, "rgba(60,42,28,0)");
        g.fillStyle = b; g.fillRect(cx - 14, 0, 28, h);
        // tread chevrons
        g.strokeStyle = "rgba(30,20,12,.7)";
        g.lineWidth = 3;
        for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(cx - 9, y + 6); g.lineTo(cx, y); g.lineTo(cx + 9, y + 6); g.stroke(); }
        g.fillStyle = "rgba(150,135,110,.35)";                                   // wet shine in a few spots
        for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(cx + Q(-3, 3), Q(0, h), 5, Q(10, 22), 0, 0, 7); g.fill(); }
      }
    });
    // the dirt fades out as the track meets the clearing; the ruts run on to the jeep's front wheels
    ribbon(track.curve, { n: 140, half: TRACK_HALF, y: 0.022, tex: dirt, tile: 3.2, order: 1, alpha: (p) => sstep(RC - 3, RC + 0.5, Math.hypot(p.x, p.z)) });
    ribbon(track.curve, { n: 140, half: 0.81, y: 0.028, tex: ruts, tile: 1.6, order: 2, alpha: (p, l) => sstep(0, 0.6, l) * (0.7 + 0.25 * sstep(RC - 4, RC, Math.hypot(p.x, p.z))) });
  }
}

function heroTrees() {
  // ---------------------------------------------------------------- the big mossy trees (as in the tree demo), low branches reaching over the clearing
  for (const [k, c] of HERO.entries()) {
    const g = new THREE.CylinderGeometry(0.6, 1.05, TOP, 14, 16, true); g.translate(0, TOP / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const f = 1 + 0.08 * Math.sin(a * 5 + y * 0.6) + 0.05 * Math.sin(a * 11 - y * 1.3) + 0.7 * Math.exp(-y * 1.5) * (0.5 + 0.5 * Math.cos(a * 4 + k));
      p.setXYZ(i, x * f + Math.sin(y * 0.35) * 0.2, y, z * f);
    }
    woodGeos.push(paintBark(g, 0, 7).translate(c.x, 0, c.z));
    const inward = Math.atan2(-c.z, -c.x);
    for (let i = 0; i < 9; i++) {
      const low = i < 5, h = (low ? 2.05 + i * 0.16 : 4.6 + (i - 5) * 1.2) + R(-0.08, 0.08);   // low ones at head height: you meet the sloths face to face
      const a = low ? inward + (i % 2 ? 1 : -1) * (0.25 + i * 0.22) + R(-0.1, 0.1) : inward + Math.PI + i * 2.39996;
      const L = low ? R(2.8, 3.8) : R(2.4, 3.4), dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x), pts = [];
      for (let j = 0; j <= 5; j++) { const t = j / 5; pts.push(dir.clone().multiplyScalar(0.45 + L * t).addScaledVector(side, Math.sin(t * 3 + i) * 0.3).setY(h + (low ? 0.25 * t - 0.3 * t * t : 0.7 * t - 0.65 * t * t))); }
      const curve = new THREE.CatmullRomCurve3(pts);
      woodGeos.push(paintBark(tube(curve, 0.2, 0.07, low ? 10 : 5, low ? 7 : 4), 0, 7).translate(c.x, 0, c.z));
      curve.points.forEach((q) => q.add(V(c.x, 0, c.z))); curve.updateArcLengths(); curve.low = low; branchCurves.push(curve);
    }
    // lianas from the low branches down to the ground
    // each hangs from a point on its branch to the ground, never over or onto a path (Adriaen 2026-11-14:
    // the glade tree's vines came down onto the path): a random point on its branch first; if that would land on a path, the
    // next points along the branch are tried, and with none clear the liana is left out
    for (let i = 0; i < 3; i++) {
      const b = branchCurves[branchCurves.length - 9 + i], t0 = R(0.55, 0.95), out = (q) => V(q.x - c.x, 0, q.z - c.z).normalize();
      const land = (t) => { const p0 = b.getPointAt(t), p1 = p0.clone().addScaledVector(out(p0), 0.35); p1.setY(groundHeight(p1.x, p1.z)); return [p0, p1, out(p0).multiplyScalar(0.25)]; };
      const pick = [t0, 0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35].map(land).find(([p0, p1]) => pathLane(p1.x, p1.z) > 1.4 && pathLane(p0.x, p0.z) > 1.1 && jeepDist(p1.x, p1.z) > 1.8);   // neither its foot nor where it hangs from over a path
      if (!pick) continue;
      const [p0, p1, bow] = pick, mid = p0.clone().lerp(p1, 0.5).add(bow);
      woodGeos.push(paintBark(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p0, mid, p1]), 8, 0.025, 3), 0, 7));
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
}

// The wall's trees, as { x, z, s, y0, top }: where each stands, its girth scale, the height its trunk is seated at, and its
// trunk's top (0 for a tree left out on the track or the path), which the crown limbs grow from.
function forestWall() {
  // ---------------------------------------------------------------- the forest wall: many trunks (one draw) and a leafy roof that leaves the sky open over the clearing
  const wall = [];
  const g = paintBark(wallTrunk(), 0, 9);
  for (let i = 0; i < 400 && wall.length < 70; i++) {
    const a = R(0, 6.28), r = RC + 1.2 + Math.pow(rnd(), 1.4) * 15, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (HERO.some((h) => Math.hypot(h.x - x, h.z - z) < 3) || wall.some((w) => Math.hypot(w.x - x, w.z - z) < 1.6)) continue;
    wall.push({ x, z, s: R(0.6, 1.4), y0: 0, top: 0 });
  }
  // each tree on its own root mound
  for (const { x, z, s } of wall) if (trackDist(x, z) > 2.2) addMound(x, z, 0.9 + 0.9 * s, 0.12 + 0.18 * s);
  // each trunk is seated by the lowest ground round its base, not at its centre, so no side of the base stands above the
  // ground on a slope or a hummock (review R2-164)
  const seat = (x, z, s) => {
    let y = Infinity;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; y = Math.min(y, groundHeight(x + Math.cos(a) * 0.65 * s, z + Math.sin(a) * 0.65 * s)); }
    return y - 0.05;
  };
  const im = new THREE.InstancedMesh(g, barkMat, wall.length), m = new THREE.Matrix4(), q = new THREE.Quaternion();
  wall.forEach((w, i) => {
    const keep = trackDist(w.x, w.z) > 2.2 ? 1 : 0, ry = R(0, 6), sy = R(0.8, 1.1);
    w.y0 = seat(w.x, w.z, w.s);
    w.top = keep ? w.y0 + 20 * sy : 0;
    m.compose(V(w.x, w.y0, w.z), q.setFromAxisAngle(UP, ry), V(w.s * keep, sy * keep, w.s * keep));
    im.setMatrixAt(i, m);
  });
  scene.add(im);
  return wall;
}

// One trunk shape for the whole wall (one instanced draw): 8 sides tapering from 0.65 to 0.35 m over 20 m, with a buttress
// flare in its bottom metre and a slight bend, as the big trees have (review R2-201). Its rings stand at -0.25, 0.5, 1.5, 6.7,
// 13.3 and 20 m: the two low ones shape the flare, and the bottom one is 0.25 m under the ground, so the base meets the ground
// even where the ground mesh cuts across a root mound lower than groundHeight (review R2-164). 80 triangles.
function wallTrunk() {
  const ys = [20, 13.33, 6.67, 1.5, 0.5, -0.25], g = new THREE.CylinderGeometry(1, 1, 1, 8, ys.length - 1, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const ring = Math.round((0.5 - p.getY(i)) * (ys.length - 1)), y = ys[ring], a = Math.atan2(p.getZ(i), p.getX(i));
    const r = (0.65 - 0.3 * Math.max(0, y) / 20) * (1 + 0.6 * Math.exp(-1.5 * Math.max(0, y)) * (0.5 + 0.5 * Math.cos(4 * a + 0.4)));
    p.setXYZ(i, Math.cos(a) * r + 0.15 * Math.sin(0.3 * y), y, Math.sin(a) * r);
  }
  return g;
}

// Cards (the leaves, the crown leaves, the verge bushes and the ferns) are collected as raw matrices and colours (cardSet),
// then split into sectors (addSectors), one InstancedMesh each, so three.js culls the sectors out of view: an InstancedMesh
// is culled as a whole, so one mesh for all of them drew every leaf every frame (camp review P4, 2026-11-12). The sectors are
// wedges round the clearing and, with split, a band at eye height apart from the canopy above it, so looking at the edge
// does not draw the crowns 15 m up (review R2-078). In each sector the cards go near to far from the clearing's centre,
// where the camera nearly always is, so near leaves write depth first and hide the alpha-tested ones behind them (R2-162).
// A card scaled to nothing (kept off the track and the path) is simply not added.
const EYE = 5;   // metres: below it the eye-height edge, above it the canopy and the crowns
// a card set: n, when given, is the card's light normal (clumpN), for the leaf cards' clumpLit material (core.js leafMat)
function cardSet() {
  const mats = [], cols = [], nrm = [];
  return { mats, cols, nrm, add(m, c, n) { m.toArray(mats, mats.length); cols.push(c.r, c.g, c.b); if (n) nrm.push(n.x, n.y, n.z); } };
}
// A leaf's light normal (review R2-175): out from its clump's centre (u is the leaf's offset from it), blended 70/30 with up
const UP = V(0, 1, 0);
const clumpN = (u, out = V()) => out.copy(u).normalize().multiplyScalar(0.7).addScaledVector(UP, 0.3).normalize();
// geo for one instanced mesh with its cards' light normals (nrm: 3 numbers per instance): the card's own buffers are shared
function withLeafN(geo, nrm) {
  const g = new THREE.BufferGeometry(); g.setIndex(geo.index); for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  if (!geo.boundingSphere) geo.computeBoundingSphere(); g.boundingSphere = geo.boundingSphere;
  g.setAttribute("aLeafN", new THREE.InstancedBufferAttribute(nrm instanceof Float32Array ? nrm : new Float32Array(nrm), 3));
  return g;
}
function addSectors(set, geo, mat, { wedges = 8, split = false } = {}) {
  const M = set.mats, groups = new Map();
  for (let i = 0, n = set.cols.length / 3; i < n; i++) {
    const x = M[i * 16 + 12], y = M[i * 16 + 13], z = M[i * 16 + 14], w = Math.floor((Math.atan2(z, x) / (2 * Math.PI) + 0.5) * wedges) % wedges;
    const key = split && y > EYE ? w + wedges : w; if (!groups.has(key)) groups.set(key, []); groups.get(key).push([Math.hypot(x, z), i]);
  }
  const c = new THREE.Color(), box = new THREE.Box3(), p = V(), m = new THREE.Matrix4();
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const geoR = geo.boundingSphere.center.length() + geo.boundingSphere.radius;   // the card's reach from its own origin
  for (const g of groups.values()) {
    g.sort((a, b) => a[0] - b[0]);
    const N = set.nrm.length ? new Float32Array(g.length * 3) : null;
    if (N) g.forEach(([, i], j) => N.set(set.nrm.slice(i * 3, i * 3 + 3), j * 3));
    const s = new THREE.InstancedMesh(N ? withLeafN(geo, N) : geo, mat, g.length), A = s.instanceMatrix.array;
    g.forEach(([, i], j) => { for (let k = 0; k < 16; k++) A[j * 16 + k] = M[i * 16 + k]; s.setColorAt(j, c.fromArray(set.cols, i * 3)); });
    // a tight sphere: round the middle of the cards' box, out to the farthest card's corner (three's own sphere is a running
    // union that depends on the order and comes out larger than this)
    box.makeEmpty(); for (let j = 0; j < g.length; j++) box.expandByPoint(p.fromArray(A, j * 16 + 12));
    s.boundingSphere = new THREE.Sphere(); box.getCenter(s.boundingSphere.center); let r = 0;
    for (let j = 0; j < g.length; j++) { m.fromArray(A, j * 16); r = Math.max(r, p.fromArray(A, j * 16 + 12).distanceTo(s.boundingSphere.center) + geoR * m.getMaxScaleOnAxis()); }
    s.boundingSphere.radius = r; scene.add(s);
  }
}

// Scatters leaf cards round clump centres ({ x, y, z, r }): per(clump) leaves each, and every leaf draws from rand in the
// same order: three numbers for its offset's direction, one for its distance, three for its turn and one for its size. So each
// caller keeps its own stream, and the layout it was baked with. shape(clump) is [lo, hi, reach]: the direction's height is
// rand(lo, hi) and the distance r * cbrt(rand) * reach. leaf(clump, k, u, q, size) gets the offset u, the turn q and the drawn
// size (from leafScale) and adds the card or not; end(clump), if given, runs after each clump. The wall leaves, the crowns
// and the verge use it, and glade.js's bushes.
function scatterLeaves(clumps, rand, per, shape, leaf, end) {
  const u = V(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const cl of clumps) {
    const n = per(cl), [lo, hi, reach] = shape(cl);
    for (let k = 0; k < n; k++) {
      u.set(rand(-1, 1), rand(lo, hi), rand(-1, 1)).normalize().multiplyScalar(cl.r * Math.cbrt(rand(0, 1)) * reach);
      e.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)); q.setFromEuler(e);
      leaf(cl, k, u, q, rand(leafScale[0], leafScale[1]));
    }
    if (end) end(cl);
  }
}
// a leaf card's colour: the four leaf greens in turn (i counts the leaves), darker low down
const leafColour = (c, i, y) => c.setHex(S.leaf[i % 4]).multiplyScalar(0.72 + 0.4 * sstep(0, 14, y));

// The leaf card: three sprigs of nine leaves painted close together on one 512 px card, so a clump needs CARD_KEEP of
// the cards it had with one nine-leaf sprig per card, each card 1.35 times as wide. That keeps the leaves about as many
// and as big, with about 40 % fewer alpha-tested card layers and 60 % fewer cards to sway (review R2-162).
// perClump is still how many leaves a clump draws from its stream (so the layout stays as it was baked); cards(n) is how
// many of those n become cards.
const CARD_KEEP = 0.4;
const cards = (n) => Math.max(1, Math.round(n * CARD_KEEP));
function leafCard() {
  {
    for (let k = 0; k < 45; k++) rnd();   // the old one-sprig card drew 45 numbers from the forest stream: still skip them
    const { R: Q } = lcg(2626);
    const tex = canvasTex(512, 512, (g, w, h) => {
      g.translate(w / 2, h / 2);
      for (let sprig = 0; sprig < 3; sprig++) {
        const a = sprig * 2.094 + Q(-0.3, 0.3), d = Q(80, 98);
        g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d); g.scale(1.7, 1.7); const turn = Q(0, 6.28);
        for (let k = 0; k < 9; k++) {
          g.save(); g.rotate(turn + k * 0.7 + Q(-0.2, 0.2)); g.translate(0, -Q(26, 52));
          g.fillStyle = new THREE.Color(S.leaf[(k + sprig) % 4]).multiplyScalar(Q(0.85, 1.15)).getStyle(); g.beginPath(); g.ellipse(0, 0, Q(16, 22), Q(34, 46), 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = "rgba(255,255,220,.35)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -38); g.lineTo(0, 38); g.stroke();
          g.restore();
        }
        g.restore();
      }
    });
    leafGeo = new THREE.PlaneGeometry(1, 1);
    leafM = leafMat({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }, 0.04, true);
    perClump = Math.round(24 * D.leaves);
    leafScale = [0.8 * 1.35, 1.25 * 1.35];
  }
}

// The leaf clumps, as { x, y, z, r } plus tree (the wall tree it grows on) or hero (the big tree whose crown it is in):
// two on each wall tree, along the big trees' branches, in the big trees' crowns, and a thick leafy edge at eye height.
function wallLeaves(wall) {
  const clumps = [];
  for (const tree of wall) for (let k = 0; k < 2; k++) {
    const y = tree.y0 + 10 * tree.s + R(-1, 4), x = tree.x + R(-2, 2), z = tree.z + R(-2, 2);
    if (Math.hypot(x, z) > RC + 1.5) clumps.push({ x, y, z, r: 2.2 * tree.s, tree });
  }
  for (const c of branchCurves) for (let t = 0.35; t <= 1; t += 0.3) {
    const p = c.getPointAt(Math.min(1, t));
    clumps.push({ x: p.x, y: p.y + (c.low ? 1.2 : 0.9), z: p.z, r: R(0.6, 0.9) });
  }
  // the big trees' crowns
  for (const hero of HERO) for (let k = 0; k < 18; k++) {
    const a = R(0, 6.28), d = R(0, 4.5);
    clumps.push({ x: hero.x + Math.cos(a) * d, y: TOP + R(-2, 1.5), z: hero.z + Math.sin(a) * d, r: R(1.3, 1.9), hero });
  }
  // a thick leafy edge at eye height all round the clearing
  for (let i = 0; i < 70; i++) {
    const a = R(0, 6.28), d = RC + R(0.3, 2.2), x = Math.cos(a) * d, z = Math.sin(a) * d, y = R(0.4, 2.8);
    clumps.push({ x, y: y + groundHeight(x, z), z, r: R(0.7, 1.2) });
  }
  // up in the crowns (above 4 m) the leaves are packed closer (0.6) and bigger, so they overlap into a mass
  const tight = (cl) => cl.y > 4 ? 0.6 : 1;
  const leaves = cardSet(), clump = cardSet(), keep = cards(perClump), m = new THREE.Matrix4(), c = new THREE.Color(), n = V(), p = V(), sc = V();
  let i = 0, cut = false;
  scatterLeaves(clumps, R, () => perClump, (cl) => { const t = tight(cl); return [-0.5 * (t < 1 ? 0.7 : 1), 0.8 * (t < 1 ? 0.7 : 1), t]; }, (cl, k, u, q, size) => {
    p.set(cl.x + u.x, cl.y + u.y, cl.z + u.z);
    // keep the track and the path open at eye height
    const s = p.y < 4.5 && Math.min(jeepDist(p.x, p.z), pathLane(p.x, p.z)) < 1.9 ? 0 : size / tight(cl) * Math.pow(D.leaves, -0.33);
    if (!s) cut = true;
    leafColour(c, k + i, p.y); i++;
    if (k < keep) clump.add(m.compose(p, q, sc.setScalar(s)), c, clumpN(u, n));
  }, () => {
    // a clump the path or track clipped goes as a whole: its last few leaves left alone looked like they floated (Adriaen 2026-11-14)
    if (!cut) { leaves.mats.push(...clump.mats); leaves.cols.push(...clump.cols); leaves.nrm.push(...clump.nrm); }
    clump.mats.length = clump.cols.length = clump.nrm.length = 0; cut = false;
  });
  addSectors(leaves, leafGeo, leafM, { split: true });
  return clumps;
}

function crowns(wall, clumps) {
  // crowns on branches: a forked limb from the trunk into every leaf clump, and a spreading crown of limbs, twigs and leaves on
  // top of each forest tree, so the treetops are wood and leaves, not floating leaves (one draw for the wood, one for the new
  // leaves; their own random stream, so the seeded layout stays the same). Twigs scale with the detail level.
  {
    const NEAR = RC + 6;   // only the trees you can see clearly get limbs (fewest triangles that still look good)
    const { R: Q } = lcg(777);
    // tops: the leaf clumps the crowns add, as { x, y, z, r }, with f (a twig's tuft, a smaller share of perClump) or cover
    // (the clump over a trunk's cut top)
    const geos = [], tops = [], twigs = D.fx > 1 ? 2 : D.fx ? 1 : 0;
    const seg = 2;   // a limb is a flat strip with two bends: 4 triangles
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
      const c = new THREE.CatmullRomCurve3([p0, mid, p1]); geos.push(paintBark(strip(c, r0, r1, seg), 0, 18));
      for (let i = 0; i < fork; i++) {                                    // twigs off the outer half, splaying up and sideways
        const q = c.getPointAt(Q(0.5, 0.8)), side = V(-d.z, 0, d.x).normalize().multiplyScalar(i % 2 ? 1 : -1), L = d.length() * Q(0.35, 0.55);
        const e = q.clone().addScaledVector(d.clone().normalize(), L * 0.5).addScaledVector(side, L * 0.7).add(V(0, L * 0.5, 0));
        geos.push(paintBark(strip(new THREE.CatmullRomCurve3([q, q.clone().lerp(e, 0.5).add(V(0, L * 0.12, 0)), e]), r1 * 0.9, r1 * 0.35, seg), 0, 18));
        tops.push({ x: e.x, y: e.y + 0.3, z: e.z, r: L * 0.6 + 0.5, f: 0.3 });
      }
    };
    for (const cl of clumps) {
      if (cl.tree) {                                                      // a forest tree's side clump: one limb up and out from the trunk
        const { x, z, s, top } = cl.tree;
        if (!top) continue;
        const y0 = Math.min(cl.y - Q(1.5, 2.5), top - 1.5), p1 = V(cl.x, cl.y - cl.r * 0.25, cl.z);
        limb(V(x, y0, z).addScaledVector(p1.clone().setY(y0).sub(V(x, y0, z)).normalize(), 0.2 * s), p1, 0.2 * s, 0.07 * s, twigs + 1);
      } else if (cl.hero) {                                               // a big tree's crown clump: limbs from the top of the trunk
        const p1 = V(cl.x, cl.y - 0.4, cl.z), dir = p1.clone().setY(0).sub(V(cl.hero.x, 0, cl.hero.z)).normalize();
        limb(V(cl.hero.x, TOP - 3.2, cl.hero.z).addScaledVector(dir, 0.4), p1, 0.32, 0.1, twigs);
      }
    }
    // the crown on top of each forest tree
    for (const { x, z, s, top } of wall) {
      if (!top) continue;
      const n = Math.round(Q(3, 5)), a0 = Q(0, 6.28);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.28 + Q(-0.3, 0.3), out = Q(1.6, 3.2) * s, y0 = top * Q(0.78, 0.9);
        const p1 = V(x + Math.cos(a) * out, top + Q(0.3, 1.8) * s, z + Math.sin(a) * out);
        limb(V(x + Math.cos(a) * 0.2 * s, y0, z + Math.sin(a) * 0.2 * s), p1, 0.2 * s, 0.07 * s, twigs + 1);
        tops.push({ x: p1.x, y: p1.y + 0.3, z: p1.z, r: Q(1.2, 1.8) * s });
      }
      tops.push({ x, y: top + 0.4, z, r: 1.3 * s, cover: true });   // covers the cut top of the trunk (kept on every detail level)
    }
    scene.add(new THREE.Mesh(merge(geos), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    const per = (cl) => Math.max(1, Math.round(perClump * (cl.f || 0.5) * 0.6));
    const lm = cardSet(), m = new THREE.Matrix4(), c = new THREE.Color(), n = V(), p = V(), sc = V();
    let i = 0;
    // on low detail the spreading crown leaves past NEAR are left out (they are fog-grey there anyway); the clump that covers
    // each trunk's cut top stays (review R2-162)
    const far = D.leaves < 1;
    scatterLeaves(tops, Q, per, () => [-0.3, 0.6, 0.65], (cl, k, u, q, size) => {
      p.set(cl.x + u.x, cl.y + u.y, cl.z + u.z); m.compose(p, q, sc.setScalar(size * 1.5 * Math.pow(D.leaves, -0.33)));
      leafColour(c, k + i, p.y); i++;
      if (k < cards(per(cl)) && (!far || cl.cover || Math.hypot(cl.x, cl.z) <= NEAR)) lm.add(m, c, clumpN(u, n));
    });
    addSectors(lm, leafGeo, leafM);
  }
}

function verge() {
  // bushes along both verges of the jeep's track, so the walk out feels like a lane through the jungle
  // (their own random stream, so the seeded layout of everything else stays the same)
  if (track) {
    const { R: Q2 } = lcg(991);
    const vc = [], L = track.curve.getLength();
    for (let l = 2.5; l < L; l += 1.3) {
      const t = l / L, p = track.curve.getPointAt(t), d = track.curve.getTangentAt(t), side = V(-d.z, 0, d.x).normalize();
      if (Math.hypot(p.x, p.z) < RC - 0.5) continue;
      for (const k of [-1, 1]) vc.push({ x: p.x + side.x * k * Q2(2.2, 3.2), y: Q2(0.5, 2.6), z: p.z + side.z * k * Q2(2.2, 3.2), r: Q2(0.7, 1.2) });
    }
    for (const v of vc) v.y += groundHeight(v.x, v.z);   // on the banks beside the track
    const vm = cardSet(), m = new THREE.Matrix4(), c = new THREE.Color(), n = V(), p = V(), sc = V(), keep = cards(perClump);
    let i = 0;
    scatterLeaves(vc, Q2, () => perClump, () => [-0.5, 0.8, 1], (cl, k, u, q, size) => {
      p.set(cl.x + u.x, cl.y + u.y, cl.z + u.z);
      leafColour(c, k + i, p.y); i++;
      if (k < keep && trackDist(p.x, p.z) >= 1.6) vm.add(m.compose(p, q, sc.setScalar(size * Math.pow(D.leaves, -0.33))), c, clumpN(u, n));
    });
    addSectors(vm, leafGeo, leafM);
  }
}

function ferns() {
  // ferns and undergrowth in a thick band round the clearing
  {
    let g, mat;
    {
      const tex = canvasTex(256, 256, (cx, w, h) => {
        cx.translate(w / 2, h);
        for (let f = 0; f < 7; f++) { cx.save(); cx.rotate(-1.1 + f * 0.37); cx.strokeStyle = hex(S.leaf[f % 4]); cx.lineWidth = 3; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -220); cx.stroke(); cx.fillStyle = hex(S.leaf[(f + 1) % 4]);
          for (let s = 20; s < 215; s += 13) { const l = 30 * (1 - s / 230); cx.beginPath(); cx.ellipse(-l / 2, -s, l / 2, 4, -0.4, 0, 7); cx.ellipse(l / 2, -s, l / 2, 4, 0.4, 0, 7); cx.fill(); }
          cx.restore(); }
      });
      const a = new THREE.PlaneGeometry(1.4, 1.2).translate(0, 0.6, 0).toNonIndexed(), b = a.clone().rotateY(Math.PI / 2);
      g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([...a.attributes.position.array, ...b.attributes.position.array], 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute([...a.attributes.uv.array, ...b.attributes.uv.array], 2)); g.computeVertexNormals();
      mat = leafMat({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }, 0.03);
    }
    const spots = [];
    for (let i = 0; i < 2000 && spots.length < Math.round(260 * D.ferns); i++) { const a = R(0, 6.28), r = RC - 0.6 + Math.pow(rnd(), 1.6) * 12, x = Math.cos(a) * r, z = Math.sin(a) * r; spots.push([x, z]); }
    const set = cardSet(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    spots.forEach(([x, z], i) => { const s = R(0.7, 1.5) * (trackDist(x, z) < 1.25 ? 0 : 1), ry = R(0, 6.28); if (!s) return;
      m.compose(V(x, groundHeight(x, z) - 0.03, z), q.setFromAxisAngle(V(0, 1, 0), ry), V(s, s, s)); set.add(m, c.setHex(S.leaf[i % 4]).multiplyScalar(0.75)); });
    addSectors(set, g, mat);
  }
}

export { buildForest, FLOOR_OVERLAYS, branchCurves, cards, clumpN, grassTex, leafGeo, leafM, perClump, scatterLeaves, track, trackDist, withLeafN };
