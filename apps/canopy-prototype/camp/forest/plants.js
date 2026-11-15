// Canopy Camp forest plants: the leaf clumps on the wall trees, the big trees' branches and crowns and the eye-height edge,
// the bushes along the jeep's track, and the ferns round the clearing.
// Exports wallLeaves(wall) (returns the clumps), verge() and ferns() (buildForest steps, forest.js).
import * as THREE from "three";
import { groundHeight, jeepDist } from "../terrain.js";
import { D, hex, S } from "../core.js";
import { V, canvasTex, lcg } from "../util.js";
import { HERO, RC, pathLane } from "../layout.js";
import { R, rnd, track, trackDist } from "./base.js";
import { addSectors, cards, cardSet, clumpN, leafColour, leafGeo, leafM, leafMat, perClump, scatterLeaves } from "./cards.js";
import { branchCurves, TOP } from "./trees.js";

// The leaf clumps, as { x, y, z, r } plus tree (the wall tree it grows on) or hero (the layout.js HERO entry whose crown it is in):
// two on each wall tree, along the big trees' branches, in the big trees' crowns, and a thick leafy edge at eye height. The glade's
// trees (forest/trees.js forestWall, review R2-161) get theirs from their own stream, last, into the same draws.
const GLADE_LEAF_SEED = 1611;
function wallLeaves(wall) {
  const clumps = [];
  for (const tree of wall) if (!tree.glade) for (let k = 0; k < 2; k++) {
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
    clumps.push({ x: hero.at.x + Math.cos(a) * d, y: TOP + R(-2, 1.5), z: hero.at.z + Math.sin(a) * d, r: R(1.3, 1.9), hero });
  }
  // a thick leafy edge at eye height all round the clearing
  for (let i = 0; i < 70; i++) {
    const a = R(0, 6.28), d = RC + R(0.3, 2.2), x = Math.cos(a) * d, z = Math.sin(a) * d, y = R(0.4, 2.8);
    clumps.push({ x, y: y + groundHeight(x, z), z, r: R(0.7, 1.2) });
  }
  // up in the crowns (above 4 m) the leaves are packed closer (0.6) and bigger, so they overlap into a mass
  const tight = (cl) => cl.y > 4 ? 0.6 : 1;
  const G = lcg(GLADE_LEAF_SEED), glade = [];
  for (const tree of wall) if (tree.glade) for (let k = 0; k < 2; k++)
    glade.push({ x: tree.x + G.R(-2, 2), y: tree.y0 + 10 * tree.s + G.R(-1, 4), z: tree.z + G.R(-2, 2), r: 2.2 * tree.s, tree });
  const leaves = cardSet(), clump = cardSet(), keep = cards(perClump), m = new THREE.Matrix4(), c = new THREE.Color(), n = V(), p = V(), sc = V();
  let i = 0, cut = false;
  const shape = (cl) => { const t = tight(cl); return [-0.5 * (t < 1 ? 0.7 : 1), 0.8 * (t < 1 ? 0.7 : 1), t]; };
  const leaf = (cl, k, u, q, size) => {
    p.set(cl.x + u.x, cl.y + u.y, cl.z + u.z);
    // keep the track and the path open at eye height
    const s = p.y < 4.5 && Math.min(jeepDist(p.x, p.z), pathLane(p.x, p.z)) < 1.9 ? 0 : size / tight(cl) * Math.pow(D.leaves, -0.33);
    if (!s) cut = true;
    leafColour(c, k + i, p.y); i++;
    if (k < keep) clump.add(m.compose(p, q, sc.setScalar(s)), c, clumpN(u, n));
  };
  // a clump the path or track clipped goes as a whole: its last few leaves left alone looked like they floated (Adriaen 2026-11-14)
  const end = () => {
    if (!cut) { leaves.mats.push(...clump.mats); leaves.cols.push(...clump.cols); leaves.nrm.push(...clump.nrm); }
    clump.mats.length = clump.cols.length = clump.nrm.length = 0; cut = false;
  };
  scatterLeaves(clumps, R, () => perClump, shape, leaf, end);
  scatterLeaves(glade, G.R, () => perClump, shape, leaf, end);
  addSectors(leaves, leafGeo, leafM, { split: true });
  return [...clumps, ...glade];
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

export { ferns, verge, wallLeaves };
