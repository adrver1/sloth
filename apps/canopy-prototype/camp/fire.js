// The campfire's look, the same in both levels (Adriaen 2026-11-15: "the whole campfire looks different, are you sure it's the
// same?"): props/lived/build_fire.py's teepee fire in a ring of sooty stones under the bamboo tripod, with the open pot of soup
// on its chain, dressed as the camp dresses it, and its flames: three crossed cards with an animated flame shader, one mesh.
// dressFire(root, { into, wrap }) paints the fire GLB's nodes under root (the ring, legs, logs, embers, pot, chain) and adds
// the flames to `into` at the fire's foot (its origin); wrap(material) is the level's own touch on every lit material (the
// camp's baked night light, campProps.js lnight; the summit's fog and mute, scoutCamp.js). Returns the flames' mesh, which the
// activities flare (chores.js scales it).
// Triangles: the flames 6 (three cards); the rest is the GLB's (build_fire.py prints them).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { uTime } from "./stage.js";

export const BAMBOO = new THREE.Color().setRGB(0.72, 0.67, 0.6, THREE.SRGBColorSpace);   // the tripod's legs, about 141,123,68

export function dressFire(root, { into, wrap = (m) => m }) {
  const fm = wrap(new THREE.MeshLambertMaterial({ vertexColors: true })), glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  // the ring's ash bed lies 12 mm up (build_fire.py ring()), exactly where the camp's ground mesh is under the fire (terrain.js
  // FLAT, R2-181): the ring is drawn pulled a little toward the eye, like a decal on the ground, so it always wins the tie
  const ringMat = wrap(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  for (const o of root.children) { const n = o.name;
    o.traverse((m) => { if (!m.isMesh) return;
      m.material = n === "Embers" ? glow : n === "Chain" ? wrap(new THREE.MeshLambertMaterial({ map: m.material.map, alphaTest: 0.5, side: THREE.DoubleSide }))
        : n === "TripodLegs" ? wrap(new THREE.MeshLambertMaterial({ map: m.material.map, color: BAMBOO })) : n === "Ring" ? ringMat : fm; });   // the legs: one tube each, nodes in the texture
  }
  // the three crossed cards are one mesh (R2-103): each card's phase (0, 1, 2) is a vertex attribute instead of a uniform per card
  const H = 0.8, flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: "attribute float aPh; varying vec2 vUv; varying float vPh; void main() { vUv = uv; vPh = aPh; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vPh;
      void main() {
        float v = vUv.y, t = uTime * (1.0 + 0.15 * vPh) + vPh * 4.0;
        float x = vUv.x - 0.5;
        x += (sin(v * 9.0 - t * 7.0) * 0.05 + sin(v * 17.0 - t * 11.0 + 1.3) * 0.025) * v;          // the flame sways more toward its tip
        float tongues = 0.75 + 0.25 * sin(vUv.x * 23.0 + t * 3.0) * sin(vUv.x * 9.0 - t * 2.0);
        float w = 0.42 * pow(max(0.0, 1.0 - v / tongues), 0.75);                                      // wide at the base, tapering up
        float a = smoothstep(w, w * 0.35, abs(x)) * smoothstep(0.0, 0.08, v);
        vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.62, 0.15), smoothstep(w, w * 0.4, abs(x)));
        c = mix(c, vec3(1.0, 0.92, 0.6), smoothstep(0.5, 1.0, 1.0 - v) * smoothstep(w * 0.5, 0.0, abs(x)));
        gl_FragColor = vec4(c * a * 1.5, a);
      }` });
  const cards = [0, 1, 2].map((k) => { const g = new THREE.PlaneGeometry(0.7, H).translate(0, H / 2 + 0.03, 0).rotateY(k * Math.PI / 3);
    g.setAttribute("aPh", new THREE.Float32BufferAttribute([k, k, k, k], 1)); return g; });
  const flames = new THREE.Mesh(mergeGeometries(cards), flameMat); flames.name = "Flames";
  flames.renderOrder = 3; into.add(flames);
  return flames;
}
