// Canopy Camp weather (camp review B7): warm rain. A box of falling streaks round the camera (one draw of line segments),
// kept off the tent and its planks so you can shelter there, and the light it brings: grey-green fog, a dimmer sun, no
// shafts. Weather is set in the ⚙️ menu: Clear, Rain, or Changing (a shower every few minutes). ?weather=rain sets it.
// main.js reads weather.wet (0 dry .. 1 pouring) for the light. No sound (cloud sessions can't hear it).
import * as THREE from "three";
import { $, D, camera, qs, scene, store } from "./core.js";
import { rand } from "./util.js";
import { TENT } from "./layout.js";

const MODES = ["clear", "rain", "changing"], NAME = { clear: "Clear ☀️", rain: "Rain 🌧️", changing: "Changing 🌦️" };
let mode = MODES.includes(qs.get("weather")) ? qs.get("weather") : MODES.includes(store.get("canopy-weather")) ? store.get("canopy-weather") : "clear";
const show = () => { $("weather").textContent = "Weather: " + NAME[mode]; };
$("weather").onclick = () => { mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; store.set("canopy-weather", mode); show(); };
show();

// the drops: N streaks in a 18 x 12 x 18 m box that follows the camera; each falls at its own speed, a little slanted
const N = D.fx ? (D.fx > 1 ? 1400 : 900) : 450, BOX = 9, TOP = 11, LEN = 0.38;
const pos = new Float32Array(N * 6), drop = new Float32Array(N * 4);   // x, y, z, speed
function reset(i, anyY) { drop.set([camera.position.x + rand(-BOX, BOX), anyY ? rand(-1, TOP) : TOP + rand(0, 2), camera.position.z + rand(-BOX, BOX), rand(8, 11)], i * 4); }
for (let i = 0; i < N; i++) reset(i, true);
const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
const mat = new THREE.LineBasicMaterial({ color: 0xc8d6e0, transparent: true, opacity: 0, depthWrite: false });
const rain = new THREE.LineSegments(geo, mat); rain.frustumCulled = false; rain.visible = false; scene.add(rain);

// dry under the tent: its roof and planks (layout.js TENT.dry, in the tent's own frame), below 3.4 m
const dry = (x, z, y) => y <= 3.4 && TENT.dry(x, z);

const weather = { wet: 0, mode: () => mode };
let showerT = rand(90, 180), raining = mode === "rain";   // Changing: dry spells of 1.5..3 min, showers of 1..1.5 min
weather.step = (dt) => {
  if (mode === "changing") { showerT -= dt; if (showerT < 0) { raining = !raining; showerT = raining ? rand(60, 90) : rand(90, 180); } }
  else raining = mode === "rain";
  weather.wet += Math.sign((raining ? 1 : 0) - weather.wet) * Math.min(Math.abs((raining ? 1 : 0) - weather.wet), dt / 6);   // the rain comes and goes over 6 s
  rain.visible = weather.wet > 0.01; if (!rain.visible) return;
  mat.opacity = 0.42 * weather.wet;
  const cx = camera.position.x, cz = camera.position.z, shown = Math.ceil(N * weather.wet);
  for (let i = 0; i < N; i++) {
    let x = drop[i * 4], y = drop[i * 4 + 1], z = drop[i * 4 + 2]; const v = drop[i * 4 + 3];
    y -= v * dt; x += 0.6 * dt;
    if (y < 0 || dry(x, z, y) || Math.abs(x - cx) > BOX || Math.abs(z - cz) > BOX) { reset(i, false); x = drop[i * 4]; y = drop[i * 4 + 1]; z = drop[i * 4 + 2]; }
    drop[i * 4] = x; drop[i * 4 + 1] = y; drop[i * 4 + 2] = z;
    const o = i * 6; if (i >= shown) { pos.fill(0, o, o + 6); pos[o + 1] = pos[o + 4] = -50; continue; }   // a light shower shows fewer streaks
    pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; pos[o + 3] = x - 0.6 * LEN / v; pos[o + 4] = y + LEN; pos[o + 5] = z;
  }
  geo.attributes.position.needsUpdate = true;
};
window.__weather = (m) => { mode = m; raining = m === "rain"; weather.wet = raining ? 1 : 0; show(); };   // checks: set it at once
export { weather };
