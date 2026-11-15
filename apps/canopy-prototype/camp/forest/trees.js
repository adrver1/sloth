// Canopy Camp forest trees: bark painted with "baked" light (AO by height and crevice, moss on the upper sides), the two big
// mossy trees with their low branches and lianas, the forest wall of trunks on root mounds, and the crowns of limbs and leaves.
// Exports heroTrees(), forestWall() (returns the wall's trees), crowns(wall, clumps) (buildForest steps, forest.js),
// branchCurves (the big trees' low branches, which the sloths hang from), TOP (the big trees' height), and heroWood (the big
// trees' wood, one mesh) and trunkR(y) (their trunk's widest radius at height y), both for the sloths' climbs (review R2-082).
import * as THREE from "three";
import { addMound, groundHeight, jeepDist } from "../terrain.js";
import { D, S, scene } from "../core.js";
import { V, lcg, sstep } from "../util.js";
import { FAR, GLADE, GLADE_EXIT, GLADE_R, HERO, RC, gladeTurn, pathLane } from "../layout.js";
import { R, rnd, trackDist, UP } from "./base.js";
import { addSectors, cards, cardSet, clumpN, leafColour, leafGeo, leafM, perClump, scatterLeaves } from "./cards.js";

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

const branchCurves = [], TOP = 15;   // the big trees' low branches (the sloths hang from them), and their height
// a big tree's trunk: a cylinder 1.05 across at the foot to 0.6 at the top, with a wobble of up to about 10% and a root flare
// (heroTrees). trunkR(y) is its radius at height y at its widest, which the sloths' climbs start from (sloth/poses.js).
const TRUNK_FOOT = 1.05, TRUNK_TOP = 0.6;
const trunkR = (y) => (TRUNK_FOOT + (TRUNK_TOP - TRUNK_FOOT) * y / TOP) * (1.1 + 0.7 * Math.exp(-1.5 * y));
let heroWood = null;   // the big trees' bark, branches and lianas: one mesh (heroTrees), which the sloths' climbs measure

function heroTrees() {
  // ---------------------------------------------------------------- the big mossy trees (as in the tree demo), low branches reaching over the clearing
  for (const { at: c, flare: k } of HERO) {
    const g = new THREE.CylinderGeometry(TRUNK_TOP, TRUNK_FOOT, TOP, 14, 16, true); g.translate(0, TOP / 2, 0);
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
  heroWood = new THREE.Mesh(merge(woodGeos), barkMat); scene.add(heroWood);
}

// The wall's trees, as { x, z, s, y0, top, glade }: where each stands, its girth scale, the height its trunk is seated at, its
// trunk's top (0 for a tree left out on the track or the path), which the crown limbs grow from, and glade (true for the
// glade's own trees, last in the list).
// The glade's trees (review R2-161, Adriaen's pick C): GLADE_TREES more trunks round the glade's outer half, so near 3D trees stand
// between it and the backdrop. They draw from their own stream (GLADE_SEED; their leaves GLADE_SEED + 1, plants.js), come after
// every forest tree, and stand clear of the glade's edge, its path, the karaoke road's wedge (layout.js GLADE_EXIT) and, with
// their root mounds, the baked ground square (RC + 0.8 each way), so the forest stream, the bakes and the glade stay as they were.
const GLADE_TREES = 25, GLADE_SEED = 1610;
function forestWall() {
  // ---------------------------------------------------------------- the forest wall: many trunks (one draw) and a leafy roof that leaves the sky open over the clearing
  const wall = [];
  const g = paintBark(wallTrunk(), 0, 9);
  for (let i = 0; i < 400 && wall.length < 70; i++) {
    const a = R(0, 6.28), r = RC + 1.2 + Math.pow(rnd(), 1.4) * 15, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (HERO.some(({ at: h }) => Math.hypot(h.x - x, h.z - z) < 3) || wall.some((w) => Math.hypot(w.x - x, w.z - z) < 1.6)) continue;
    wall.push({ x, z, s: R(0.6, 1.4), y0: 0, top: 0 });
  }
  const Gs = lcg(GLADE_SEED), out = GLADE.clone().normalize();
  for (let i = 0, n = 0; i < 600 && n < GLADE_TREES; i++) {
    const a = Gs.R(0, 6.28), r = GLADE_R + 2.4 + Math.pow(Gs.rnd(), 1.2) * 7, x = GLADE.x + Math.cos(a) * r, z = GLADE.z + Math.sin(a) * r, t = gladeTurn(x, z);
    if (Math.cos(a) * out.x + Math.sin(a) * out.z < -0.25 || Math.max(Math.abs(x), Math.abs(z)) < RC + 3.3 || Math.hypot(x, z) > FAR - 1.5 || (t > GLADE_EXIT[0] - 0.15 && t < GLADE_EXIT[1] + 0.15)) continue;
    if (trackDist(x, z) < 2.3 || HERO.some(({ at: h }) => Math.hypot(h.x - x, h.z - z) < 3) || wall.some((w) => Math.hypot(w.x - x, w.z - z) < 1.7)) continue;
    wall.push({ x, z, s: Gs.R(0.6, 1.3), y0: 0, top: 0, glade: true }); n++;
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
    const draw = w.glade ? Gs.R : R, keep = trackDist(w.x, w.z) > 2.2 ? 1 : 0, ry = draw(0, 6), sy = draw(0.8, 1.1);
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
    const side = (cl) => {
      if (cl.tree) {                                                      // a forest tree's side clump: one limb up and out from the trunk
        const { x, z, s, top } = cl.tree;
        if (!top) return;
        const y0 = Math.min(cl.y - Q(1.5, 2.5), top - 1.5), p1 = V(cl.x, cl.y - cl.r * 0.25, cl.z);
        limb(V(x, y0, z).addScaledVector(p1.clone().setY(y0).sub(V(x, y0, z)).normalize(), 0.2 * s), p1, 0.2 * s, 0.07 * s, twigs + 1);
      } else if (cl.hero) {                                               // a big tree's crown clump: limbs from the top of the trunk
        const p1 = V(cl.x, cl.y - 0.4, cl.z), dir = p1.clone().setY(0).sub(V(cl.hero.at.x, 0, cl.hero.at.z)).normalize();
        limb(V(cl.hero.at.x, TOP - 3.2, cl.hero.at.z).addScaledVector(dir, 0.4), p1, 0.32, 0.1, twigs);
      }
    };
    // the crown on top of each forest tree
    const crown = ({ x, z, s, top }) => {
      if (!top) return;
      const n = Math.round(Q(3, 5)), a0 = Q(0, 6.28);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.28 + Q(-0.3, 0.3), out = Q(1.6, 3.2) * s, y0 = top * Q(0.78, 0.9);
        const p1 = V(x + Math.cos(a) * out, top + Q(0.3, 1.8) * s, z + Math.sin(a) * out);
        limb(V(x + Math.cos(a) * 0.2 * s, y0, z + Math.sin(a) * 0.2 * s), p1, 0.2 * s, 0.07 * s, twigs + 1);
        tops.push({ x: p1.x, y: p1.y + 0.3, z: p1.z, r: Q(1.2, 1.8) * s });
      }
      tops.push({ x, y: top + 0.4, z, r: 1.3 * s, cover: true });   // covers the cut top of the trunk (kept on every detail level)
    };
    // the glade's trees (forestWall) after all the rest, so the forest's crowns keep their draws from this stream
    const glade = (o) => !!(o.glade || o.tree?.glade);
    for (const cl of clumps) if (!glade(cl)) side(cl);
    for (const w of wall) if (!glade(w)) crown(w);
    for (const cl of clumps) if (glade(cl)) side(cl);
    for (const w of wall) if (glade(w)) crown(w);
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

export { branchCurves, crowns, forestWall, heroTrees, heroWood, TOP, trunkR };
