// Food you can carry and give (Adriaen 2026-11-13: "3d model these instead of using the emoji", so a sloth can eat one
// with its eat clip and it doesn't look out of place). Vegetables come from the kitchen crate, fruit from the plate
// on the snack table (activities.js). Each item is one mesh at its real size in metres, centred on its middle, with
// userData.base = its normal scale (sloths.js chewStep shrinks it a bite at a time from that). Flat-shaded, coloured per
// vertex, one shared material for all of them. Triangles: carrot 15, potato 20, onion 36, mushroom 36, mango, fig and lime 20, apple 21, banana 35.
// The fruit match the sloths' own table fruit in camp/sloths.js (FRUIT): same colours and sizes (the banana here is bent).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

// a lathe from a profile of [radius, y] points, bottom to top; a point with radius 0 closes the end with a fan (no
// degenerate triangles, so the counts above are exact); each part has its own colour
function lathe(out, prof, seg, col, rot = 0) {
  const c = new THREE.Color(col);
  const ring = (r, y, k) => { const a = rot + (k / seg) * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    for (let k = 0; k < seg; k++) {
      const a = ring(r0, y0, k), b = ring(r0, y0, k + 1), d = ring(r1, y1, k), e = ring(r1, y1, k + 1);
      if (r0 > 0 && r1 > 0) out.push([a, d, e, c], [a, e, b, c]);
      else if (r0 === 0) out.push([a, d, e, c]);   // a is the bottom point
      else out.push([a, d, b, c]);                 // d is the top point
    }
  }
  return out;
}
// triangles [[p, p, p, colour], ...] into one non-indexed geometry
function build(tris) {
  const pos = [], cols = [];
  for (const [a, b, d, c] of tris) { pos.push(...a, ...b, ...d); for (let i = 0; i < 3; i++) cols.push(c.r, c.g, c.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals(); return g;
}
// an icosahedron (20 triangles) stretched to size [x, y, z], with a little jitter so it isn't too perfect
function blob(size, col, jit = 0, seed = 1) {
  const g = new THREE.IcosahedronGeometry(0.5, 0), p = g.attributes.position, c = new THREE.Color(col), cols = [];
  let r = seed; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280 - 0.5) * 2;
  const moved = new Map();   // the same corner moves the same way on every face, so no cracks
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!moved.has(key)) moved.set(key, 1 + rnd() * jit);
    const k = moved.get(key); p.setXYZ(i, p.getX(i) * size[0] * k, p.getY(i) * size[1] * k, p.getZ(i) * size[2] * k); cols.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); g.deleteAttribute("uv"); g.computeVertexNormals(); return g;
}

const MAKE = {
  // a carrot lying along x once in a hand: an orange 6-sided cone with a flat top, and three green leaf blades
  carrot() {
    const t = []; lathe(t, [[0, -0.075], [0.019, 0.06], [0, 0.06]], 6, 0xf07a22);
    const leaf = new THREE.Color(0x4f9a3a);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2, s = 0.012;
      t.push([[Math.cos(a) * s, 0.058, Math.sin(a) * s], [-Math.cos(a) * s * 0.3, 0.058, -Math.sin(a) * s * 0.3], [Math.cos(a) * 0.022, 0.125, Math.sin(a) * 0.022], leaf]); }
    return build(t);
  },
  potato: () => blob([0.085, 0.055, 0.065], 0xc0915a, 0.14, 7),
  // a golden onion: a squat bulb, pointed on top
  onion() { const t = []; lathe(t, [[0, -0.032], [0.03, -0.016], [0.032, 0.006], [0.013, 0.028], [0, 0.05]], 6, 0xd99a4a, 0.3); return build(t); },
  // a brown cap (cep), pale gills under it and a cream stem
  mushroom() {
    const t = []; lathe(t, [[0.038, 0.012], [0.028, 0.032], [0, 0.042]], 6, 0x8a5434);
    lathe(t, [[0, 0.012], [0.038, 0.012]], 6, 0xe6d6b8);
    lathe(t, [[0.012, -0.038], [0.011, 0.012]], 6, 0xf2e6cc);
    // the stem's bottom: open, the mushroom is seen from the side or above
    return build(t);
  },
  mango: () => blob([0.08, 0.075, 0.11], 0xffa531, 0.04, 3),
  apple() {   // with a little stalk (one triangle)
    const g = blob([0.08, 0.075, 0.08], 0xe8473a, 0.03, 5), st = build([[[-0.003, 0.03, 0], [0.003, 0.03, 0], [0.006, 0.055, 0], new THREE.Color(0x5a3a22)]]);
    return mergeGeometries([g, st]);
  },
  // a banana: a 5-sided tube bent along an arc, pointed at both ends, a brown stalk end
  banana() {
    const t = [], c = new THREE.Color(0xffd94d), st = new THREE.Color(0x6b5a2a), R0 = 0.15, A = 1.15;
    const prof = [[0, 0], [0.016, 0.2], [0.019, 0.5], [0.016, 0.8], [0.004, 1]];
    const ring = (r, u, k) => { const a = (u - 0.5) * A, ctr = [Math.sin(a) * R0, -Math.cos(a) * R0 + R0 - 0.03, 0], n = [Math.sin(a), -Math.cos(a), 0], ph = (k / 5) * Math.PI * 2;
      return [ctr[0] + n[0] * Math.cos(ph) * r, ctr[1] + n[1] * Math.cos(ph) * r, Math.sin(ph) * r]; };
    for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < 5; k++) {
      const [r0, u0] = prof[i], [r1, u1] = prof[i + 1], a = ring(r0, u0, k), b = ring(r0, u0, k + 1), d = ring(r1, u1, k), e = ring(r1, u1, k + 1);
      if (r0 === 0) t.push([a, d, e, c]); else t.push([a, d, e, i === 3 ? st : c], [a, e, b, i === 3 ? st : c]);
    }
    return build(t);   // 5 + 3 * 10 = 35 triangles; the stalk end is open (5 % of a banana, not worth a cap)
  },
  fig: () => blob([0.05, 0.055, 0.05], 0x8a4fa8, 0.05, 9),
  lime: () => blob([0.055, 0.05, 0.055], 0x9fd36a, 0.03, 11),
};
const geos = {};

// what each one is called and its emoji (for menus and toasts; fig and lime have none that shows everywhere)
export const VEG = [["carrot", "🥕"], ["potato", "🥔"], ["onion", "🧅"], ["mushroom", "🍄"]];
export const FRUIT = [["mango", "🥭"], ["apple", "🍎"], ["banana", "🍌"], ["fig", ""], ["lime", ""]];

// a new mesh of one kind ("carrot", "mango", ...)
export function makeFood(kind) {
  const m = new THREE.Mesh(geos[kind] ??= MAKE[kind](), mat);
  m.name = `food_${kind}`; m.userData.kind = kind; m.userData.base = new THREE.Vector3(1, 1, 1); return m;
}
