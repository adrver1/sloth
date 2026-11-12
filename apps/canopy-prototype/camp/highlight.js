// Canopy Camp highlight: lights up the thing you can use right now (the wood pile, the fire) with a thin warm outline and a
// soft glow on its faces, instead of a hint icon floating over it. Taken from desk-at-night's free mode (web/src/highlight.js):
// the outline is the inverted-hull trick (the object's back faces pushed out a fixed number of pixels along smoothed normals,
// so it is the same width near and far) and the glow an additive rim pass. No new geometry and no postprocessing: while
// something is lit it is drawn twice more (outline, glow), and nothing extra otherwise.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const COLOR = new THREE.Color(1.0, 0.9, 0.62);   // warm cream, like the fire light

const outlineMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, fog: false,
  uniforms: { uColor: { value: COLOR }, uWidth: { value: 2.5 }, uRes: { value: new THREE.Vector2(1, 1) }, uAlpha: { value: 1 } },
  vertexShader: `uniform float uWidth; uniform vec2 uRes;
    void main() {
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vec2 dir = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
      dir = length(dir) > 1e-5 ? normalize(dir) : vec2(0.0);
      clip.xy += dir * uWidth * 2.0 / uRes * clip.w;
      gl_Position = clip;
    }`,
  fragmentShader: `uniform vec3 uColor; uniform float uAlpha; void main() { gl_FragColor = vec4(uColor, uAlpha); }`,
});
const glowMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, blending: THREE.AdditiveBlending, fog: false,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  uniforms: { uColor: { value: COLOR }, uK: { value: 0 } },
  vertexShader: `varying float vRim;
    void main() { vec4 v = modelViewMatrix * vec4(position, 1.0); vRim = 1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-v.xyz))); gl_Position = projectionMatrix * v; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uK; varying float vRim; void main() { gl_FragColor = vec4(uColor * uK * (0.35 + 0.65 * vRim * vRim), 1.0); }`,
});

export function createHighlight(scene, renderer, { width = 2.5 } = {}) {
  const group = new THREE.Group(), parts = new Map();
  scene.add(group);
  let current = [], fade = 0, t = 0;
  // the two overlay meshes for one mesh, made the first time it is lit; the hull is welded so hard edges share one normal and it has no cracks
  function partsFor(mesh) {
    let p = parts.get(mesh); if (p) return p;
    const g = mesh.geometry, hull = new THREE.BufferGeometry().setAttribute("position", g.getAttribute("position"));
    if (g.index) hull.setIndex(g.index);
    const welded = mergeVertices(hull, 1e-4); welded.computeVertexNormals();
    p = { outline: new THREE.Mesh(welded, outlineMat), glow: new THREE.Mesh(g, glowMat) };
    for (const m of [p.outline, p.glow]) { m.matrixAutoUpdate = false; m.frustumCulled = false; m.visible = false; group.add(m); }
    p.glow.renderOrder = 2; parts.set(mesh, p); return p;
  }
  // the meshes under an object (an object, a list of objects, or null for nothing)
  const meshesOf = (objs) => { const out = []; for (const o of [objs ?? []].flat()) o.traverse((m) => { if (m.isMesh && !m.isSkinnedMesh) out.push(m); }); return out; };
  let key = null;
  return {
    set(objs) {
      if (objs === key) return; key = objs;
      for (const m of current) { const p = parts.get(m); if (p) p.outline.visible = p.glow.visible = false; }
      current = meshesOf(objs); fade = 0;
    },
    update(dt) {
      if (!current.length) return;
      t += dt; fade = Math.min(1, fade + dt / 0.12);
      renderer.getDrawingBufferSize(outlineMat.uniforms.uRes.value);
      outlineMat.uniforms.uWidth.value = width * renderer.getPixelRatio();
      outlineMat.uniforms.uAlpha.value = 0.9 * fade;
      glowMat.uniforms.uK.value = fade * (0.2 + 0.06 * Math.sin(t * 4));
      for (const mesh of current) {
        const p = partsFor(mesh); mesh.updateWorldMatrix(true, false);
        p.outline.matrix.copy(mesh.matrixWorld); p.glow.matrix.copy(mesh.matrixWorld);
        p.outline.visible = p.glow.visible = mesh.visible;
      }
    },
    get lit() { return key; },
  };
}
