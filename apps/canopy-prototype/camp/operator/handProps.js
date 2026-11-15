// Canopy Camp operator, the props in his hands: a soup bowl (40 triangles) and its spoon (18), a mug (46 with its handle),
// an open book (8) and, for cooking, the water pail (camp/pail.js, 60) carried by its bail, a long wooden stirring
// spoon (a 4-sided stick stretched from his hand to the pot, 8) and a vegetable from the crate (camp/food.js). All faceted,
// like him. They stand hidden in the scene; the per-frame hand pose (handPose.js) puts the ones in use at his hands.
// Nothing is built when this module loads: operator.js calls buildHandProps after the model.
// Exports the seven props, buildHandProps(), hold(prop), drop(prop) and dropAll() (everything down, his hands' state reset).
import * as THREE from "three";
import { scene } from "../core.js";
import { V, canvasTex, lam } from "../util.js";
import { makePail } from "../pail.js";
import { op, reset } from "./state.js";

let bowl, spoon, mug, book, pail, stick, veg;
const facetLam = (c) => lam(c, { flatShading: true });   // his props are faceted, like him
function buildHandProps() {
  bowl = (() => {   // an enamel bowl 20 cm across (Adriaen: bigger), open, 8 sides (32 tris), with the soup's surface (8)
    const g = new THREE.Group(), b = new THREE.Mesh(new THREE.LatheGeometry([V(0.001, 0), V(0.06, 0.006), V(0.1, 0.065)], 8), facetLam(0x3f6f8f)); b.material.side = THREE.DoubleSide;
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), facetLam(0xc7752e)); s.rotation.x = -Math.PI / 2; s.position.y = 0.05; g.add(b, s); return g;
  })();
  spoon = (() => {   // a tin spoon: a flat handle (12 tris) and its bowl (6), along +Y from the grip
    const g = new THREE.Group(), m = facetLam(0xc9c4b8), h = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.004), m); h.position.y = 0.045;
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.02, 6), m); b.material.side = THREE.DoubleSide; b.position.set(0, 0.125, 0.004); b.scale.set(0.8, 1.2, 1); g.add(h, b); return g;   // the head in the handle's plane, its hollow to +Z
  })();
  mug = (() => {   // a tin mug, 8 sides, open top, bottom cap (22 tris), and a handle (24 tris)
    const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 8, 1, true), facetLam(0x5f86ad));   // blue enamel, so it reads against his white shirt m.material.side = THREE.DoubleSide; m.position.y = 0.045;
    const bot = new THREE.Mesh(new THREE.CircleGeometry(0.036, 8), m.material); bot.rotation.x = Math.PI / 2; bot.position.y = 0.001;
    // the handle: a half ring on the +X side (24 tris; Adriaen 2026-11-13: he held the cup oddly, a flat tab gave his hand
    // nothing to hold), seen up close as he sips
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.005, 3, 4, Math.PI), facetLam(0x55799c)); h.rotation.z = -Math.PI / 2; h.position.set(0.039, 0.048, 0);
    g.add(m, bot, h); return g;
  })();
  book = (() => {   // open book: two cover quads and two page quads (8 tris), spine along Y, pages facing +Z (the reader), halves cupped toward him
    const g = new THREE.Group(), pages = canvasTex(64, 32, (x) => {
      x.fillStyle = "#f1ead8"; x.fillRect(0, 0, 64, 32); x.fillStyle = "#b9b09a"; for (let y = 5; y < 28; y += 3) { x.fillRect(4, y, 24, 1); x.fillRect(36, y, 24, 1); } x.fillStyle = "#cfc6b0"; x.fillRect(31, 0, 2, 32); }, { aniso: 1 });
    const W = 0.15, H = 0.22, open = 0.3;                 // a hardback, 30 cm open (Adriaen: bigger)
    for (const side of [-1, 1]) {
      const leaf = new THREE.Group(); leaf.rotation.y = -side * open;   // outer edges toward the reader, the spine away (Adriaen: it bent the wrong way)
      const p = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: pages }));
      const uv = p.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      p.position.set(side * W / 2, 0, 0.004);
      const cv = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.008, H + 0.01), facetLam(0x7a3b2a)); cv.material.side = THREE.DoubleSide; cv.position.set(side * W / 2, 0, -0.001);
      leaf.add(p, cv); g.add(leaf);
    }
    return g;
  })();
  // for cooking: the water pail (camp/pail.js, 60 tris) carried by its bail, a long wooden stirring spoon (a 4-sided stick
  // stretched from his hand to the pot, 8 tris), and a vegetable from the crate (camp/food.js)
  pail = makePail();
  stick = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 1, 4, 1, true).translate(0, 0.5, 0), facetLam(0x9a6b3f)); stick.material.side = THREE.DoubleSide;
  veg = new THREE.Group();
  for (const p of [bowl, spoon, mug, book, pail, stick, veg]) { p.visible = false; scene.add(p); }
}
function hold(prop) { op.inHand = prop; prop.visible = true; }   // placed at his right hand each frame (handPose.js), upright, tipped to his lips as he sips
function drop(prop) { prop.visible = false; if (op.inHand === prop) op.inHand = null; }
function dropAll() { for (const p of [bowl, spoon, mug, book, pail, stick, veg]) drop(p); reset("hands"); }

export { book, bowl, buildHandProps, drop, dropAll, hold, mug, pail, spoon, stick, veg };
