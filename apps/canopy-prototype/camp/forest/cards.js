// Canopy Camp leaf cards: the leaf card everything leafy shares, the leaf scatter, and the culled sectors cards are drawn in.
// Exports leafCard() (a buildForest step, forest.js) and what it sets: leafGeo, leafM, perClump (how many leaves a clump
// draws from its stream). Also cardSet(), addSectors(set, geo, mat, { wedges, split }), scatterLeaves(clumps, rand, per,
// shape, leaf, end), leafColour(c, i, y), cards(n) (how many of n leaves become cards), clumpN(u, out) (a leaf's light
// normal), withLeafN(geo, nrm) (card geometry carrying those normals) and leafMat(opts, sway, clumpLit) (the leaf material).
// The forest's steps and glade.js's bushes use them.
import * as THREE from "three";
import { D, S, scene, uTime } from "../core.js";
import { V, canvasTex, lcg, sstep, swap } from "../util.js";
import { rnd, UP } from "./base.js";

let leafGeo, leafM, perClump, leafScale;   // set by leafCard

// leafMat(opts, sway, clumpLit): a Lambert leaf material that sways in the wind (the forest's leaves and glade.js's bushes). With
// clumpLit, each card is lit by its own per-instance normal (the aLeafN attribute: clumpN, pointing out of the card's clump and a
// little up) on both sides, so a clump shades light on top and dark underneath like one mass; lit by their own random card
// normals, many leaves rendered near-black (review R2-175). Every mesh drawn with a clumpLit material must carry aLeafN (withLeafN).
const leafMat = (opts, sway, clumpLit = false) => {
  const m = new THREE.MeshLambertMaterial(opts);
  if (clumpLit) m.defines = { LEAF_N: "" };
  // The sway is a uniform, not a number in the shader text: the hook's source is the same for every sway, so three gives
  // every leaf material one program, and each material keeps its own amount (review props-12). LEAF_N is a define, so it
  // keys the program too.
  const uSway = { value: sway };
  // A clumpLit material needs the hook for its aLeafN normal even when it does not sway.
  if (sway || clumpLit) m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uSway = uSway;
    sh.vertexShader = swap(sh.vertexShader, ["#include <common>", "#include <common>\nuniform float uTime;\nuniform float uSway;\n#ifdef LEAF_N\nattribute vec3 aLeafN;\n#endif"],
      ["#include <defaultnormal_vertex>", "#include <defaultnormal_vertex>\n#ifdef LEAF_N\ntransformedNormal = normalMatrix * aLeafN;\n#endif"],
      ["#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float w = sin(uTime * 1.4 + ip.x * 1.7 + ip.z * 1.3) + 0.5 * sin(uTime * 2.3 + ip.y * 2.1);
        transformed += vec3(1.0, 0.4, 0.6) * (w * uSway) * (0.5 + position.y);
        #endif`]);
    sh.fragmentShader = swap(sh.fragmentShader, ["#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n#ifdef LEAF_N\nnormal = normalize(vNormal);\n#endif"]);   // the same normal on both sides
  };
  return m;
};


// Cards (the leaves, the crown leaves, the verge bushes and the ferns) are collected as raw matrices and colours (cardSet),
// then split into sectors (addSectors), one InstancedMesh each, so three.js culls the sectors out of view: an InstancedMesh
// is culled as a whole, so one mesh for all of them drew every leaf every frame (camp review P4, 2026-11-12). The sectors are
// wedges round the clearing and, with split, a band at eye height apart from the canopy above it, so looking at the edge
// does not draw the crowns 15 m up (review R2-078). In each sector the cards go near to far from the clearing's centre,
// where the camera nearly always is, so near leaves write depth first and hide the alpha-tested ones behind them (R2-162).
// A card scaled to nothing (kept off the track and the path) is simply not added.
const EYE = 5;   // metres: below it the eye-height edge, above it the canopy and the crowns
// a card set: n, when given, is the card's light normal (clumpN), for the leaf cards' clumpLit material (leafMat below)
function cardSet() {
  const mats = [], cols = [], nrm = [];
  return { mats, cols, nrm, add(m, c, n) { m.toArray(mats, mats.length); cols.push(c.r, c.g, c.b); if (n) nrm.push(n.x, n.y, n.z); } };
}
// A leaf's light normal (review R2-175): out from its clump's centre (u is the leaf's offset from it), blended 70/30 with up
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

export { leafMat, addSectors, cards, cardSet, clumpN, leafCard, leafColour, leafGeo, leafM, perClump, scatterLeaves, withLeafN };
