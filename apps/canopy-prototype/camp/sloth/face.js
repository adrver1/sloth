// Canopy Camp sloths, the face: which way it points, the eyes that open and shut, the mouth card and the yawn.
//   FACE            which way the face points in the head bone's frame
//   eyeKit(o)       per sloth: a function (closed) that shuts or opens its eyes, by swapping the UVs of its eye vertices
//   mouthOf(s)      the sloth's mouth card (made the first time): it opens for a yawn and as it chews
//   yawnStep(s, dt) a yawn while s.yawn > 0, about 2.8 s (life.js calls it each frame)
import * as THREE from "three";
import { V, canvasTex, sstep } from "../util.js";
import { SLOTH } from "../campProps.js";

const FACE = (() => {                                  // which way the face points in the head bone's frame (the sloth faces -Z at rest)
  SLOTH.scene.updateMatrixWorld(true); const h = SLOTH.scene.getObjectByName("head");
  return V(0, 0, -1).applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(SLOTH.scene.getWorldQuaternion(new THREE.Quaternion())));
})();
let palette = null;
function eyeKit(o) {                                   // per sloth: its own copy of the meshes' UVs with the eyes open and shut
  const kit = [];
  o.traverse((m) => {
    if (!m.isSkinnedMesh || !m.material.map) return;
    if (!palette) { const img = m.material.map.image, cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext("2d"); g.drawImage(img, 0, 0); palette = { w: cv.width, h: cv.height, px: g.getImageData(0, 0, cv.width, cv.height).data }; }
    const { w, h, px } = palette;
    m.geometry = m.geometry.clone(); const uv = m.geometry.attributes.uv, kind = [];
    for (let i = 0; i < uv.count; i++) {
      const k = (Math.min(h - 1, Math.floor(uv.getY(i) * h)) * w + Math.min(w - 1, Math.floor(uv.getX(i) * w))) * 4, r = px[k], gg = px[k + 1], b = px[k + 2];
      kind.push(r < 40 && gg < 40 && b < 45 ? "eye" : r > 235 && gg > 235 && b > 230 ? "eye" : r < 75 && r > gg && gg > b ? "patch" : "");
    }
    const pi = kind.indexOf("patch"); if (pi < 0) return;
    const shut = new THREE.BufferAttribute(new Float32Array(uv.count * 2), 2);
    for (let i = 0; i < uv.count; i++) shut.setXY(i, kind[i] === "eye" ? uv.getX(pi) : uv.getX(i), kind[i] === "eye" ? uv.getY(pi) : uv.getY(i));
    kit.push([m.geometry, uv, shut]);
  });
  return (closed) => kit.forEach(([g, open, shut]) => { g.attributes.uv = closed ? shut : open; });
}
// a yawn (Adriaen 2026-11-12): the head tips back, the eyes squeeze shut and a mouth opens wide (a painted card on the
// muzzle, 2 triangles, made the first time), about 2.8 s. Before a doze, after one, and now and then.
const mouthTex = canvasTex(64, 64, (g) => { g.fillStyle = "#4a1c26"; g.beginPath(); g.ellipse(32, 32, 28, 28, 0, 0, 7); g.fill();
  g.fillStyle = "#e07a8a"; g.beginPath(); g.ellipse(32, 48, 16, 11, 0, 0, 7); g.fill(); });
const mouthMat = new THREE.MeshBasicMaterial({ map: mouthTex, alphaTest: 0.5 }), mouthGeo = new THREE.PlaneGeometry(0.036, 0.034);
// the mouth card sits on the smile (head frame y 0.031, z -0.083), a little below and in front of it so it opens downward;
// the nose is at y 0.046 (Adriaen 2026-11-13: the yawn was on the nose)
function mouthOf(s) {                                 // also opens and closes as it chews (eating, below)
  if (!s.mouth) { s.mouth = new THREE.Mesh(mouthGeo, mouthMat); s.mouth.position.set(0, 0.024, -0.087); s.mouth.rotation.set(-0.15, Math.PI, 0); s.mouth.visible = false; s.head.add(s.mouth); }
  return s.mouth;
}
function yawnStep(s, dt) {
  s.yawn += dt; const k = s.yawn, e = sstep(0.1, 1.0, k) * (1 - sstep(1.9, 2.8, k));
  mouthOf(s);
  s.head.rotation.x += 0.55 * e; s.mouth.visible = e > 0.03; s.mouth.scale.set(0.55 + 0.45 * e, Math.max(0.01, e), 1);
  if (k > 0.5 && k < 2.4) s.eyes(true);
  if (k > 2.8) { s.yawn = 0; s.mouth.visible = false; if (!s.asleep) s.eyes(false); }
}

export { FACE, eyeKit, mouthOf, yawnStep };
