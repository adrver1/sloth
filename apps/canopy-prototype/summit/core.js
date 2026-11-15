// Summit Cabin view: the renderer, scene and camera, the haze and fog chunk every material shares (hazed, uniforms U), the sky dome,
// the adaptive pixel ratio (adaptPixelRatio, called by main.js twice a second), and the shared state: me (your eye, moved by
// player.js), touch, and sunDir (set by main.js each frame).
import * as THREE from 'three';
import { $, D, TOP, TRIS, YB, isPhone } from './land.js';

// ---------------------------------------------------------------- renderer, scene, camera
export const renderer = new THREE.WebGLRenderer({ antialias: !isPhone, powerPreference: 'high-performance' });
let pr = Math.min(devicePixelRatio, isPhone ? 1.5 : 2), prTop = pr, slow = 0, fast = 0, raised = false;
// called twice a second with the frame rate; not in the first 5 s (shaders compiling, live false); a step back up that then runs slow is not tried again
export function adaptPixelRatio(fpsNow, live) {
  // a steady 30 is Safari's cap for embedded pages until you tap them (or Low Power Mode), not a slow frame
  slow = live && fpsNow < 45 && Math.abs(fpsNow - 30) > 1.5 ? slow + 1 : 0;
  fast = live && fpsNow > 57 ? fast + 1 : 0;
  if (slow >= 4 && pr > 1) { if (raised) prTop = pr - 0.25; pr = Math.max(1, pr - 0.25); raised = false; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); slow = 0; }
  else if (fast >= 16 && pr < prTop) { pr = Math.min(prTop, pr + 0.25); raised = true; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); fast = 0; }
  else if (fast >= 16) raised = false;
  return pr;
}   // frame() lowers it if the frame rate drops, like the camp, and raises it again when there is room
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 1, 2);   // switches the fog chunk on; the chunk itself is ours (below)
export const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 40000);

// ---------------------------------------------------------------- haze and fog: one shader chunk for every material
// optical depth of a fog whose density falls off with height (density c at height h0, scale 1/b), along a ray of length t
export const U = {
  uHor: { value: new THREE.Color() }, uSkyLo: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uHaze: { value: 0.7e-4 }, uMist: { value: 0 }, uMistTop: { value: 130 }, uMistCol: { value: new THREE.Color() },
  uFogDen: { value: 0 }, uFogCol: { value: new THREE.Color() },
};
// The haze, mist and fog colours depend only on the view direction, so they are worked out (and turned into screen sRGB) per
// vertex; only how much of each to mix in is worked out per pixel. (They were per pixel, three sRGB conversions each.)
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
varying vec3 vFogW, vHazeO, vMistO, vFogO;
uniform vec3 uHor, uSkyLo, uSunCol, uSunDir, uMistCol, uFogCol;
vec3 fogOETF(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(vec3(0.0031308), c)); }
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vec4 fogW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    fogW = instanceMatrix * fogW;
  #endif
  vFogW = (modelMatrix * fogW).xyz;
  { float fs = max(dot(normalize(vFogW - cameraPosition), uSunDir), 0.0), f2 = fs * fs, f4 = f2 * f2;
    vHazeO = fogOETF(mix(uSkyLo, uHor, 0.35 + 0.65 * f2) + uSunCol * (f4 * 0.5));   // a warm glow toward the sun, like the camp's sunlit mist
    vMistO = fogOETF(uMistCol + uSunCol * (f4 * 0.25)); vFogO = fogOETF(uFogCol); }
#endif`;
// a sprite's shader has no `transformed` for the fog above: give it its centre (the cast's sleep z's and hearts are sprites)
THREE.ShaderLib.sprite.vertexShader = THREE.ShaderLib.sprite.vertexShader.replace('#include <fog_vertex>', 'vec3 transformed = vec3(0.0);\n#include <fog_vertex>');
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
varying vec3 vFogW, vHazeO, vMistO, vFogO;
uniform float uHaze, uMist, uMistTop, uFogDen;
#ifndef HAZE_MUL
#define HAZE_MUL 1.0
#endif
float hfog(float c, float b, float h0, vec3 ro, vec3 rd, float t) { float k = rd.y * b; float e = abs(k) < 1e-6 ? t : (1.0 - exp(-t * k)) / k; return c * exp(-(ro.y - h0) * b) * e; }
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  vec3 fv = vFogW - cameraPosition; float ft = length(fv); vec3 frd = fv / ft;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vHazeO, 1.0 - exp(-hfog(uHaze, 1.0 / 1600.0, 0.0, cameraPosition, frd, ft) * HAZE_MUL));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vMistO, 1.0 - exp(-hfog(uMist, 1.0 / 45.0, uMistTop, cameraPosition, frd, ft)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vFogO, 1.0 - exp(-uFogDen * ft));
#endif`;
export function hazed(mat, extra, key = '') { mat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U); extra?.(sh); }; if (extra) mat.customProgramCacheKey = () => extra.toString() + key; return mat; }   // key: tells apart materials whose extra differs only in captured values

export function canvasTex(w, h, draw, repeat) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
export const tris = (geo, n = 1) => ((geo.index ? geo.index.count : geo.attributes.position.count) / 3) * n;

// ---------------------------------------------------------------- sky: gradient, sun, stars; follows the camera
export const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
  uniforms: { uZen: { value: new THREE.Color() }, uHor: U.uHor, uSkyLo: U.uSkyLo, uSunCol: U.uSunCol, uSunDir: U.uSunDir, uMoonDir: { value: new THREE.Vector3() }, uNight: { value: 0 }, uFog: { value: 0 }, uFogCol: U.uFogCol },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 uZen, uHor, uSkyLo, uSunCol, uSunDir, uMoonDir, uFogCol; uniform float uNight, uFog; varying vec3 vDir;
  void main(){ vec3 d = normalize(vDir); float y = max(d.y, 0.0); float sf = max(dot(d, uSunDir), 0.0); vec3 c = mix(mix(uSkyLo, uHor, 0.3 + 0.7 * sf * sf), uZen, pow(y, 0.6)); c = mix(uHor, c, smoothstep(0.0, 0.06, y) * 0.6 + 0.4 * (1.0 - sf * sf));
    float s = max(dot(d, uSunDir), 0.0); c += uSunCol * (pow(s, 6.0) * 0.35 + pow(s, 90.0) * 0.8 + smoothstep(0.9994, 0.9997, s) * 6.0);
    if (uNight > 0.0) { vec3 p = floor(d * 380.0); float h = fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); c += vec3(0.85, 0.9, 1.0) * smoothstep(0.9972, 1.0, h) * uNight * smoothstep(0.0, 0.25, y) * 2.0;
      float m = max(dot(d, uMoonDir), 0.0); c += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99955, 0.9997, m) * 1.6 + pow(m, 400.0) * 0.2) * uNight; }
    c = mix(c, uFogCol, uFog); gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`,
  side: THREE.BackSide, depthWrite: false, depthTest: false,
}));
sky.frustumCulled = false;


// you: where your eyes are and which way you look (player.js moves it), and the sun's direction (daylight.js sets it)
export const me = { x: 0, z: -D / 2 - 1.6, y: TOP + YB + 1.65, yaw: 0, pitch: -0.12, run: false };
export const touch = matchMedia('(pointer: coarse)').matches;
export const sunDir = new THREE.Vector3();

export function buildCore() {
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;   // redrawn only when needed (frame())
  $('stage').appendChild(renderer.domElement);
  sky.renderOrder = -10;
  scene.add(sky);
  TRIS.push(['Sky dome', tris(sky.geometry)]);
}
