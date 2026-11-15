// Canopy Camp sloths, the face: which way it points, the eyes that open and shut, the mouth card and the yawn.
//   FACE            which way the face points in the head bone's frame
//   buildFace(warm) makes the mouth card's texture, material and geometry, with the body's warm glow at night when warm is
//                   its uniforms (body.js bodyWarm; null: none, like the body) (sloths.js, once, first in its body)
//   eyeKit(o)       per sloth: a function (closed) that shuts or opens its eyes, by switching its body to the eyes-shut UVs
//   mouthOf(s)      the sloth's mouth card (made the first time): it opens for a yawn and as it chews
//   openMouth(s, x, y)   how far its mouth is open across (x) and down (y), 0..1 of the card's size (eating.js, life.js)
//   yawnStep(s, dt) a yawn while s.yawn > 0, about 2.8 s (life.js calls it each frame)
import * as THREE from "three";
import { V, canvasTex, patchMaterial, sstep } from "../util.js";
import { SLOTH } from "./state.js";
import { warmShader } from "../../fur.js";

const FACE = V();                                      // which way the face points in the head bone's frame (the sloth faces -Z at rest); set by buildFace
// the eyes (review R2-105): every sloth shares the body's one geometry, which gets a second UV set once, uvShut, with
// the eye vertices moved onto the eye patch's colour (the palette read from the texture). Each sloth's body has its own
// clone of the shared body material (one program for all), whose uShut picks the open or the shut UVs. The fur shells
// have no eyes (their fragments off the fur are discarded), so they are left alone.
function shutUVs(g, map) {                             // the eyes-shut UVs, made once per geometry; false when it has no eye patch
  if (g.userData.eyeShut != null) return g.userData.eyeShut;
  const img = map.image, cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const w = cv.width, h = cv.height, px = cx.getImageData(0, 0, w, h).data, uv = g.attributes.uv, kind = [];
  for (let i = 0; i < uv.count; i++) {
    const k = (Math.min(h - 1, Math.floor(uv.getY(i) * h)) * w + Math.min(w - 1, Math.floor(uv.getX(i) * w))) * 4, r = px[k], gg = px[k + 1], b = px[k + 2];
    kind.push(r < 40 && gg < 40 && b < 45 ? "eye" : r > 235 && gg > 235 && b > 230 ? "eye" : r < 75 && r > gg && gg > b ? "patch" : "");
  }
  const pi = kind.indexOf("patch"); if (pi < 0) return (g.userData.eyeShut = false);
  const shut = new THREE.BufferAttribute(new Float32Array(uv.count * 2), 2);
  for (let i = 0; i < uv.count; i++) shut.setXY(i, kind[i] === "eye" ? uv.getX(pi) : uv.getX(i), kind[i] === "eye" ? uv.getY(pi) : uv.getY(i));
  g.setAttribute("uvShut", shut); return (g.userData.eyeShut = true);
}
function eyeKit(o) {                                   // per sloth: its body's own material, with uShut to shut the eyes
  const flags = [];
  o.traverse((m) => {
    if (!m.isSkinnedMesh || m.userData.fur || !m.material.map || !shutUVs(m.geometry, m.material.map)) return;
    const base = m.material, mat = base.clone(), uShut = { value: 0 };
    // fur.js's hook, which clone() leaves out; patchMaterial chains this one after it. That hook is a plain function whose
    // source is the same for every fur variant, so the id carries fur's own program key: two eye-patched fur variants on
    // one page then get their own programs instead of sharing one
    mat.onBeforeCompile = base.onBeforeCompile;
    patchMaterial(mat, "eyes|" + base.customProgramCacheKey(), (sh) => {
      sh.uniforms.uShut = uShut;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 uvShut;\nuniform float uShut;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = mix(vMapUv, (mapTransform * vec3(uvShut, 1.0)).xy, uShut);\n#endif");
    });
    m.material = mat; flags.push(uShut);
  });
  return (closed) => { for (const u of flags) u.value = closed ? 1 : 0; };
}
// a yawn (Adriaen 2026-11-12): the head tips back, the eyes squeeze shut and a mouth opens wide (a painted card on the
// muzzle, 2 triangles, made the first time), about 2.8 s. Before a doze, after one, and now and then.
// buildFace(warm) works out FACE from the model and makes the card's texture, material and geometry; sloths.js calls it first
// thing, before any sloth is made.
// The card (review R2-182): Lambert, so it takes the camp's light like the face (it used to be unlit and glowed at night),
// and the same warm glow from the lanterns and the fire as the face round it (fur.js warmShader), so it is not darker by night;
// 2 mm further back than it was, with a small depth offset, so it stands less proud of the muzzle; and it is not drawn
// when seen nearly edge-on, so in profile it no longer shows as a flat disc or a sliver off the snout. (A card bent onto
// the face was tried: the chin falls back 3 cm under the smile, so the lower half of the mouth vanished behind the chin
// and the scarf.) One material for every sloth; the card's scale opens and shuts it (openMouth).
const MOUTH_AT = V(0, 0.024, -0.085);
let mouthMat, mouthGeo;
function buildFace(warm) {
  SLOTH.scene.updateMatrixWorld(true); const h = SLOTH.scene.getObjectByName("head");
  FACE.set(0, 0, -1).applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(SLOTH.scene.getWorldQuaternion(new THREE.Quaternion())));
  const mouthTex = canvasTex(64, 64, (g) => { g.fillStyle = "#4a1c26"; g.beginPath(); g.ellipse(32, 32, 28, 28, 0, 0, 7); g.fill();
    g.fillStyle = "#e07a8a"; g.beginPath(); g.ellipse(32, 48, 16, 11, 0, 0, 7); g.fill(); });
  mouthMat = new THREE.MeshLambertMaterial({ map: mouthTex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  patchMaterial(mouthMat, warm ? "edgeOn|warm" : "edgeOn", (sh) => {   // seen within about 17 degrees of edge-on: not drawn
    sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "if (abs(dot(normalize(vNormal), normalize(vViewPosition))) < 0.3) discard;\n#include <map_fragment>");
    if (warm) warmShader(sh, warm);
  });
  mouthGeo = new THREE.PlaneGeometry(0.036, 0.034);
}
// the mouth card sits on the smile (head frame y 0.031, z -0.083), a little below and in front of it so it opens downward;
// the nose is at y 0.046 (Adriaen 2026-11-13: the yawn was on the nose)
function mouthOf(s) {                                 // also opens and closes as it chews (eating, below)
  if (!s.mouth) { s.mouth = new THREE.Mesh(mouthGeo, mouthMat); s.mouth.position.copy(MOUTH_AT); s.mouth.rotation.set(-0.15, Math.PI, 0); s.mouth.visible = false; s.head.add(s.mouth); }
  return s.mouth;
}
// the painted mouth at x of its full width and y of its full height, about its middle
function openMouth(s, x, y) { mouthOf(s).scale.set(x, Math.max(0.01, y), 1); }
function yawnStep(s, dt) {
  s.yawn += dt; const k = s.yawn, e = sstep(0.1, 1.0, k) * (1 - sstep(1.9, 2.8, k));
  mouthOf(s);
  s.head.rotation.x += 0.55 * e; s.mouth.visible = e > 0.03; openMouth(s, 0.55 + 0.45 * e, e);
  if (k > 0.5 && k < 2.4) s.eyes(true);
  if (k > 2.8) { s.yawn = 0; s.mouth.visible = false; if (!s.asleep) s.eyes(false); }
}

export { FACE, buildFace, eyeKit, mouthOf, openMouth, yawnStep };
