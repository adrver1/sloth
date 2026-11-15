// Summit Cabin effects: chimney and fire smoke (plume: one instanced draw each) and the storm's falling snow; main.js moves them each frame.
import * as THREE from 'three';
import { TOP, YT, isPhone, mulberry } from './land.js';
import { camera, canvasTex, scene } from './core.js';
import { CAMP } from './scoutCamp.js';
import { v3 } from './forest.js';

// chimney smoke: a few soft sprites rising and drifting with the wind
const puff = canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(235,238,242,.75)'); gr.addColorStop(1, 'rgba(235,238,242,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
// each plume is one draw: n camera-facing quads, one instance per puff with its own place, size and opacity (was a sprite each)
function plume(n) { const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1)); g.instanceCount = n;
  const P = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), A = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  P.setUsage(THREE.DynamicDrawUsage); A.setUsage(THREE.DynamicDrawUsage); g.setAttribute('puff', P); g.setAttribute('alpha', A);
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: puff }, uBright: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute vec4 puff; attribute float alpha; varying vec2 vUv; varying float vA; void main() { vUv = uv; vA = alpha; vec4 mv = viewMatrix * vec4(puff.xyz, 1.0); mv.xy += position.xy * puff.w; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; uniform float uBright; varying vec2 vUv; varying float vA; void main() { vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb * uBright, c.a * vA);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  return { n, P, A, mat, mesh, t: Array.from({ length: n }, (_, i) => i / n), set(i, p, size, a) { P.setXYZW(i, p.x, p.y, p.z, size); A.setX(i, a); }, done() { P.needsUpdate = A.needsUpdate = true; } };
}
export const fireSmoke = plume(10), smoke = plume(14), tmpV = new THREE.Vector3();
export const chimneyTop = new THREE.Vector3(3.4, TOP + YT + 4.3, 1.7);

// falling snow round the camera, for the storm
export const SNOW_N = isPhone ? 2200 : 4000, snowPos = new Float32Array(SNOW_N * 3);
{ const r = mulberry(31), R = (a, b) => a + r() * (b - a); for (let i = 0; i < SNOW_N; i++) snowPos.set([R(-40, 40), R(-20, 30), R(-40, 40)], i * 3); }   // its own stream
export const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
export const flakes = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.09, transparent: true, opacity: 0, depthWrite: false, fog: false }));
flakes.frustumCulled = false;

export const wind = new THREE.Vector3();   // m/s, set by fxStep, read by campStep for the flag

export function buildFx() {
  scene.add(fireSmoke.mesh, smoke.mesh, flakes);
}
// each frame after the light: the wind gusts (much stronger in a storm), the fire's and the chimney's smoke drift with it, and
// in a storm the snow falls in a box round the camera
export function fxStep(dt, now, storm, bright) {
  wind.set(Math.sin(now * 0.13) * 0.6 + 1.2 + 6 * storm, 0, 0.6 + Math.cos(now * 0.11) * 0.4 + 3 * storm);
  for (let i = 0; i < fireSmoke.n; i++) { const t = (fireSmoke.t[i] = (fireSmoke.t[i] + dt * 0.12) % 1);
    fireSmoke.set(i, tmpV.set(CAMP.x, TOP + 1.2, CAMP.z).addScaledVector(wind, t * 3).add(v3.set(Math.sin(t * 8) * 0.2, t * 6, 0)), 0.4 + t * 1.8, 0.35 * Math.sin(Math.PI * t) * (1 - 0.7 * storm)); }
  fireSmoke.mat.uniforms.uBright.value = 0.4 + 0.6 * bright; fireSmoke.done();
  for (let i = 0; i < smoke.n; i++) { const t = (smoke.t[i] = (smoke.t[i] + dt * 0.09) % 1);
    smoke.set(i, tmpV.copy(chimneyTop).addScaledVector(wind, t * 9).add(v3.set(Math.sin(t * 10) * 0.3, t * 9, 0)), 0.6 + t * 2.6, 0.55 * Math.sin(Math.PI * t) * (1 - 0.7 * storm)); }
  smoke.mat.uniforms.uBright.value = 0.35 + 0.65 * bright; smoke.done();
  flakes.material.opacity = 0.9 * storm; flakes.visible = storm > 0.01;
  if (!flakes.visible) return;
  const p = snowGeo.attributes.position.array, c = camera.position;
  for (let i = 0; i < SNOW_N; i++) { let x = p[i * 3] + (wind.x + Math.sin(now + i) * 0.5) * dt, y = p[i * 3 + 1] - 1.8 * dt, z = p[i * 3 + 2] + wind.z * dt;
    if (y < -20) y += 50; if (x > 40) x -= 80; if (x < -40) x += 80; if (z > 40) z -= 80; if (z < -40) z += 80; p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; }
  snowGeo.attributes.position.needsUpdate = true; flakes.position.set(c.x, c.y, c.z);
}
