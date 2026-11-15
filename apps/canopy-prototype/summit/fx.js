// Summit Cabin effects: chimney and fire smoke (plume: one instanced draw each) and the storm's falling snow; main.js moves them each frame.
import * as THREE from 'three';
import { R, TOP, YT, isPhone } from './land.js';
import { canvasTex, scene } from './core.js';

// chimney smoke: a few soft sprites rising and drifting with the wind
const puff = canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(235,238,242,.75)'); gr.addColorStop(1, 'rgba(235,238,242,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
// each plume is one draw: n camera-facing quads, one instance per puff with its own place, size and opacity (was a sprite each)
function plume(n) { const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1)); g.instanceCount = n;
  const P = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), A = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  P.setUsage(THREE.DynamicDrawUsage); A.setUsage(THREE.DynamicDrawUsage); g.setAttribute('puff', P); g.setAttribute('alpha', A);
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: puff }, uBright: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute vec4 puff; attribute float alpha; varying vec2 vUv; varying float vA; void main() { vUv = uv; vA = alpha; vec4 mv = viewMatrix * vec4(puff.xyz, 1.0); mv.xy += position.xy * puff.w; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; uniform float uBright; varying vec2 vUv; varying float vA; void main() { vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb * uBright, c.a * vA);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; scene.add(mesh);
  return { n, P, A, mat, t: Array.from({ length: n }, (_, i) => i / n), set(i, p, size, a) { P.setXYZW(i, p.x, p.y, p.z, size); A.setX(i, a); }, done() { P.needsUpdate = A.needsUpdate = true; } };
}
export const fireSmoke = plume(10), smoke = plume(14), tmpV = new THREE.Vector3();
export const chimneyTop = new THREE.Vector3(3.4, TOP + YT + 4.3, 1.7);

// falling snow round the camera, for the storm
export const SNOW_N = isPhone ? 2200 : 4000, snowPos = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) snowPos.set([R(-40, 40), R(-20, 30), R(-40, 40)], i * 3);
export const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
export const flakes = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.09, transparent: true, opacity: 0, depthWrite: false, fog: false }));
flakes.frustumCulled = false; scene.add(flakes);

