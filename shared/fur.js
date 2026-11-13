// Fuzzy shell fur for the baby sloths (look B from the fur options page): painted strands on the body,
// plus N thin shells (merged into one skinned mesh, one extra draw) pushed out along smoothed normals, with strands cut out of each.
// Only the fur swatches of the palette get fur; face mask, eyes and claws stay smooth.
// The one source: tools/sync-shared.cjs copies it next to every page that uses it (each app folder is published on its own).
// Usage: import { furify } from "./fur.js"; furify(clonedSlothScene) (4 layers; ?fur=0 on the page turns it off).
// Options, each independent and off by default (off = the plain look the sloth pages use):
// { colors: [0x8a6446, 0x5e4030] } other animals' palette fur swatches (karaoke crowd), instead of the sloth's.
// { lambert: true } shades body and shells with MeshLambertMaterial instead of the GLB's physical / standard ones (Canopy
// Camp, review 2026-11-12: cheaper, and matches the Lambert props). Each sloth's shell mesh is in root.userData.furShells.
// { warm } (with lambert): uniforms { uWarm (float), uWarmPos (vec3[WARM_N]), uWarmK (float[WARM_N]) } for a warm glow from
// nearby lanterns and the fire at night, falling off with distance (the camp's lights are baked, so without it the sloths
// go black next to a lit lantern).
import * as THREE from "three";

const FUR = [[0x8f, 0x7c, 0x62], [0x6a, 0x58, 0x44]];   // palette fur swatches (light, dark)
let pc, pg;
function prepare(geo, map, fur = FUR) {
  if (geo.userData.furReady) return;
  if (!pc) {
    const img = map.image;
    pc = document.createElement("canvas"); pc.width = img.width; pc.height = img.height;
    pg = pc.getContext("2d", { willReadFrequently: true }); pg.drawImage(img, 0, 0);
  }
  const px = pg.getImageData(0, 0, pc.width, pc.height).data;
  const uv = geo.attributes.uv, pos = geo.attributes.position, nr = geo.attributes.normal, n = pos.count;
  const mask = new Float32Array(n), smooth = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = Math.min(pc.width - 1, Math.floor(uv.getX(i) * pc.width)), y = Math.min(pc.height - 1, Math.floor(uv.getY(i) * pc.height));
    const o = (y * pc.width + x) * 4;
    mask[i] = fur.some((c) => Math.abs(c[0] - px[o]) + Math.abs(c[1] - px[o + 1]) + Math.abs(c[2] - px[o + 2]) < 40) ? 1 : 0;
  }
  // smoothed normals: average the flat normals of every vertex at the same spot, so shells don't split at facets
  const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const acc = new Map();
  for (let i = 0; i < n; i++) { const k = key(i); const a = acc.get(k) || [0, 0, 0]; a[0] += nr.getX(i); a[1] += nr.getY(i); a[2] += nr.getZ(i); acc.set(k, a); }
  for (let i = 0; i < n; i++) { const a = acc.get(key(i)); const l = Math.hypot(...a) || 1; smooth.set([a[0] / l, a[1] / l, a[2] / l], i * 3); }
  geo.setAttribute("furMask", new THREE.BufferAttribute(mask, 1));
  geo.setAttribute("furNormal", new THREE.BufferAttribute(smooth, 3));
  geo.userData.furReady = true;
}

// value noise for the strands, in the model's own space so the fur moves with the body
const NOISE = `
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float strands(vec3 p, float s){ vec3 q = p * vec3(s, s * 0.22, s); return 0.6 * vn(q) + 0.4 * vn(q * 2.3 + 7.1); }
`;
export const WARM_N = 10;
const WARM_GLSL = `uniform float uWarm; uniform vec3 uWarmPos[${WARM_N}]; uniform float uWarmK[${WARM_N}]; varying vec3 vWPos;
vec3 warmAt(vec3 p) { float a = 0.0; for (int i = 0; i < ${WARM_N}; i++) { vec3 d = uWarmPos[i] - p; a += uWarmK[i] / (1.0 + dot(d, d) * 2.5); }
  return vec3(1.0, 0.66, 0.36) * a * uWarm; }`;
function patch(mat, frag, decl = "", nrm = "", pos = "", fdecl = "", warm = null) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float furMask;\nattribute vec3 furNormal;\nvarying float vFur;\nvarying vec3 vObj;\n" + decl + (warm ? "\nvarying vec3 vWPos;" : ""))
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n" + nrm)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFur = furMask; vObj = position;\n" + pos);
    if (warm) sh.vertexShader = sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFur;\nvarying vec3 vObj;\n" + NOISE + fdecl + (warm ? WARM_GLSL : ""))
      .replace("#include <map_fragment>", "#include <map_fragment>\n" + frag);
    if (warm) sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", "outgoingLight += diffuseColor.rgb * warmAt(vWPos);\n#include <opaque_fragment>");
    Object.assign(sh.uniforms, mat.userData.u || {}, warm || {});
  };
  mat.customProgramCacheKey = () => "fur" + mat.type + !!warm + frag + pos;
  return mat;
}
const BASE = `
  if (vFur > 0.5) {
    float s = strands(vObj, 95.0);
    float streak = vn(vObj * vec3(18.0, 3.5, 18.0));
    diffuseColor.rgb *= 0.78 + 0.42 * s;
    diffuseColor.rgb *= 0.86 + 0.22 * streak;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.12, 1.02), smoothstep(0.72, 0.95, s));
  }`;
const SHELL = `
  if (vFur < 0.5) discard;
  float s = strands(vObj, 260.0);
  float clump = vn(vObj * 60.0);
  if (s * (0.7 + 0.5 * clump) < uT * 0.92 + 0.08) discard;
  diffuseColor.rgb *= 0.72 + 0.5 * uT + 0.18 * s;`;
// all layers in one geometry: the fur triangles copied once per layer, each copy tagged with its layer (0..1]
function shellGeo(geo, shells) {
  const key = "furShells" + shells;
  if (geo.userData[key]) return geo.userData[key];
  const idx = geo.index ? geo.index.array : [...Array(geo.attributes.position.count).keys()];
  const mask = geo.attributes.furMask.array, tris = [];
  for (let i = 0; i < idx.length; i += 3) if (mask[idx[i]] + mask[idx[i + 1]] + mask[idx[i + 2]] > 0) tris.push(idx[i], idx[i + 1], idx[i + 2]);
  const out = new THREE.BufferGeometry(), n = tris.length;
  for (const name of ["position", "normal", "uv", "skinIndex", "skinWeight", "furMask", "furNormal"]) {
    // read through the accessors: packed models have interleaved, quantized attributes
    const src = geo.attributes[name], sz = src.itemSize, get = ["getX", "getY", "getZ", "getW"];
    const one = new (name === "skinIndex" ? Uint16Array : Float32Array)(n * sz);
    for (let j = 0; j < n; j++) for (let c = 0; c < sz; c++) one[j * sz + c] = src[get[c]](tris[j]);
    const arr = new one.constructor(n * shells * sz);
    for (let k = 0; k < shells; k++) arr.set(one, k * n * sz);
    out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
  }
  const layer = new Float32Array(n * shells);
  for (let k = 0; k < shells; k++) layer.fill((k + 1) / shells, k * n, (k + 1) * n);
  out.setAttribute("furLayer", new THREE.BufferAttribute(layer, 1));
  geo.userData[key] = out;
  return out;
}
const shellMats = new Map();   // one material per (map, length), shared by every sloth
function shellMat(map, len, lambert = false, warm = null) {
  const k = map.uuid + len + lambert + !!warm;
  if (shellMats.has(k)) return shellMats.get(k);
  const mat = lambert ? new THREE.MeshLambertMaterial({ map, alphaTest: 0.5 }) : new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, alphaTest: 0.5 });
  mat.userData.u = { uLen: { value: len } };
  patch(mat, SHELL, "attribute float furLayer; uniform float uLen; varying float uT;", "objectNormal = furNormal;",
    "uT = furLayer;\ntransformed += normalize(furNormal) * uLen * uT * furMask;\ntransformed.y -= uLen * 0.5 * uT * uT * furMask;", "varying float uT;\n", warm);
  shellMats.set(k, mat);
  return mat;
}
const baseMats = new Map();

export const FUR_ON = !/[?&]fur=0\b/.test(location.search);   // ?fur=0: the original flat sloth, kept as a backup
export function furify(root, { shells = 4, length = 0.0075, colors = null, lambert = false, warm = null } = {}) {
  if (!FUR_ON) return root;
  const meshes = [];
  root.traverse((m) => m.isSkinnedMesh && !m.userData.fur && meshes.push(m));
  for (const m of meshes) {
    const map = m.material.map;
    prepare(m.geometry, map, colors ? colors.map((h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]) : FUR);
    const bk = m.material.uuid + lambert + !!warm;
    if (!baseMats.has(bk)) baseMats.set(bk, patch(lambert ? new THREE.MeshLambertMaterial({ map, color: m.material.color }) : m.material.clone(), BASE, "", "", "", "", lambert && warm));
    m.material = baseMats.get(bk);
    const sh = new THREE.SkinnedMesh(shellGeo(m.geometry, shells), shellMat(map, length, lambert, lambert && warm));
    sh.bind(m.skeleton, m.bindMatrix);
    sh.frustumCulled = false;
    sh.userData.fur = true;
    m.parent.add(sh);
    (root.userData.furShells ??= []).push(sh);
  }
  return root;
}
