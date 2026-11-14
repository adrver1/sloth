// Canopy Camp weather (camp review B7): warm rain. A box of falling streaks round the camera, kept off the tent and its planks so
// you can shelter there, ripples where drops land near you, and the light the rain brings: grey-green fog, a dimmer sun, no shafts.
// Weather is set in the ⚙️ menu: Clear, Rain, or Changing (a shower every few minutes). ?weather=rain sets it.
// The streaks are camera-facing quads 3 cm wide with a soft tail, one instanced draw (WebGL lines are 1 device pixel, which
// all but vanished on a high-DPI phone), and the ripples a pool of 40 rings on the ground, one more instanced draw (review R2-202).
// buildWeather() (main.js, once) wires the ⚙️ button and makes the streaks and ripples; main.js steps it each frame and hands
// weather.wet (0 dry .. 1 pouring) to daylight.js for the light; audio.js makes the rain's sound.
import * as THREE from "three";
import { $, D, KEYS, OPT, camera, scene, store } from "./core.js";
import { rand } from "./util.js";
import { TENT } from "./layout.js";
import { groundHeight } from "./terrain.js";

const MODES = ["clear", "rain", "changing"], NAME = { clear: "Clear ☀️", rain: "Rain 🌧️", changing: "Changing 🌦️" };
let mode = MODES.includes(OPT.weather) ? OPT.weather : MODES.includes(store.get(KEYS.weather)) ? store.get(KEYS.weather) : "clear";
const show = () => { $("weather").textContent = "Weather: " + NAME[mode]; };

// the drops: N streaks in a 18 x 12 x 18 m box that follows the camera; each falls at its own speed, a little slanted (0.6 m/s
// sideways). drop holds x, y, z (the streak's lowest point) and speed per drop, and is the streaks' instance attribute as it is.
const N = D.fx ? (D.fx > 1 ? 1400 : 900) : 450, BOX = 9, TOP = 11, LEN = 0.38, WIDTH = 0.03, DRIFT = 0.6;
const drop = new Float32Array(N * 4);
function reset(i, anyY) { drop.set([camera.position.x + rand(-BOX, BOX), anyY ? rand(-1, TOP) : TOP + rand(0, 2), camera.position.z + rand(-BOX, BOX), rand(8, 11)], i * 4); }
// the ripples: RIPS rings, each x, y, z and the time it started; a ring grows to 20 cm and fades over RIP_LIFE seconds. Only
// drops landing within RIP_R metres of the camera make one, and only into a ring that has finished.
const RIPS = 40, RIP_LIFE = 0.6, RIP_R = 7;
const rip = new Float32Array(RIPS * 4).fill(-99);
const uOpacity = { value: 0 }, uT = { value: 0 };
let nextRip = 0, streaks, ripples, dropAttr, ripAttr;

// a ShaderMaterial with the scene's fog, the renderer's colour space, and the rain's colour; uOpacity and uT are shared by both
const rainMat = (vertex, fragment, extra = {}) => new THREE.ShaderMaterial({
  uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uColor: { value: new THREE.Color(0xc8d6e0) }, uOpacity, uT, ...extra },
  vertexShader: `#include <common>\n#include <fog_pars_vertex>\n${vertex}`,
  fragmentShader: `uniform vec3 uColor; uniform float uOpacity;\n#include <common>\n#include <fog_pars_fragment>\n${fragment}`,
  transparent: true, depthWrite: false, fog: true,
});
const quad = (geo, attr, name) => {
  const g = new THREE.InstancedBufferGeometry(); g.setIndex(geo.index); g.setAttribute("position", geo.attributes.position);
  g.setAttribute(name, attr); return g;
};

function buildWeather() {
  $("weather").onclick = () => { mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; store.set(KEYS.weather, mode); show(); };
  show();
  for (let i = 0; i < N; i++) reset(i, true);
  // a streak: a quad from the drop up its tail (position.y 0..1), turned round its own axis to face the camera; bright at
  // the drop, fading up the tail and soft at the sides
  dropAttr = new THREE.InstancedBufferAttribute(drop, 4).setUsage(THREE.DynamicDrawUsage);
  const sg = quad(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), dropAttr, "aDrop");
  streaks = new THREE.Mesh(sg, rainMat(`
    attribute vec4 aDrop; varying vec2 vUv;
    void main() {
      vec3 tail = vec3(-${DRIFT.toFixed(2)} / aDrop.w, 1.0, 0.0) * ${LEN.toFixed(2)};
      vec3 side = normalize(cross(tail, cameraPosition - aDrop.xyz));
      vec4 mvPosition = modelViewMatrix * vec4(aDrop.xyz + tail * position.y + side * position.x * ${WIDTH.toFixed(3)}, 1.0);
      gl_Position = projectionMatrix * mvPosition; vUv = position.xy + vec2(0.5, 0.0);
      #include <fog_vertex>
    }`, `
    varying vec2 vUv;
    void main() {
      gl_FragColor = vec4(uColor, uOpacity * (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.1, vUv.y) * (1.0 - vUv.y));
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`));
  // a ripple: a flat quad round where the drop landed, a thin ring growing out and fading
  ripAttr = new THREE.InstancedBufferAttribute(rip, 4).setUsage(THREE.DynamicDrawUsage);
  const rg = quad(new THREE.PlaneGeometry(1, 1), ripAttr, "aRip");
  rg.instanceCount = RIPS;
  ripples = new THREE.Mesh(rg, rainMat(`
    uniform float uT; attribute vec4 aRip; varying vec2 vUv; varying float vAge;
    void main() {
      vAge = (uT - aRip.w) / ${RIP_LIFE.toFixed(2)};
      float r = step(0.0, vAge) * step(vAge, 1.0) * (0.06 + 0.34 * vAge);   // 0 outside its life: the quad collapses to a point
      vec4 mvPosition = modelViewMatrix * vec4(aRip.xyz + vec3(position.x, 0.0, -position.y) * r, 1.0);
      gl_Position = projectionMatrix * mvPosition; vUv = position.xy * 2.0;
      #include <fog_vertex>
    }`, `
    varying vec2 vUv; varying float vAge;
    void main() {
      float ring = 1.0 - smoothstep(0.0, 0.12, abs(length(vUv) - 0.85));
      gl_FragColor = vec4(uColor, 0.8 * uOpacity * ring * (1.0 - vAge));
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`));
  ripples.material.polygonOffset = true; ripples.material.polygonOffsetFactor = -2;
  for (const m of [streaks, ripples]) { m.frustumCulled = false; m.visible = false; scene.add(m); }
}

// dry under the tent: its roof and planks (layout.js TENT.dry, in the tent's own frame), below 3.4 m
const dry = (x, z, y) => y <= 3.4 && TENT.dry(x, z);

// a ripple where a drop landed, if it is near the camera and the next ring has finished
function splash(x, z, cx, cz) {
  const o = nextRip * 4;
  if ((x - cx) ** 2 + (z - cz) ** 2 > RIP_R * RIP_R || uT.value - rip[o + 3] < RIP_LIFE) return;
  rip[o] = x; rip[o + 1] = groundHeight(x, z) + 0.01; rip[o + 2] = z; rip[o + 3] = uT.value;
  nextRip = (nextRip + 1) % RIPS;
  ripAttr.needsUpdate = true;
}

const weather = { wet: 0, mode: () => mode };
let showerT = rand(90, 180), raining = mode === "rain";   // Changing: dry spells of 1.5..3 min, showers of 1..1.5 min
weather.step = (dt) => {
  if (mode === "changing") { showerT -= dt; if (showerT < 0) { raining = !raining; showerT = raining ? rand(60, 90) : rand(90, 180); } }
  else raining = mode === "rain";
  weather.wet += Math.sign((raining ? 1 : 0) - weather.wet) * Math.min(Math.abs((raining ? 1 : 0) - weather.wet), dt / 6);   // the rain comes and goes over 6 s
  streaks.visible = ripples.visible = weather.wet > 0.01;
  if (!streaks.visible) return;
  uOpacity.value = 0.55 * weather.wet;   // the streaks fade to their sides, so a little more than the old lines' 0.42
  uT.value += dt;
  // a light shower shows fewer streaks: only the first `shown` drops are drawn and make ripples
  const cx = camera.position.x, cz = camera.position.z, shown = Math.ceil(N * weather.wet);
  for (let i = 0; i < N; i++) {
    let x = drop[i * 4], y = drop[i * 4 + 1], z = drop[i * 4 + 2]; const v = drop[i * 4 + 3];
    y -= v * dt; x += DRIFT * dt;
    if (y < 0 || dry(x, z, y) || Math.abs(x - cx) > BOX || Math.abs(z - cz) > BOX) {
      if (y < 0 && i < shown) splash(x, z, cx, cz);
      reset(i, false); continue;
    }
    drop[i * 4] = x; drop[i * 4 + 1] = y; drop[i * 4 + 2] = z;
  }
  streaks.geometry.instanceCount = shown;
  dropAttr.needsUpdate = true;
};
const setWeather = (m) => { mode = m; raining = m === "rain"; weather.wet = raining ? 1 : 0; show(); };   // at once (the tools: debug.js __weather)
export { buildWeather, setWeather, weather };
