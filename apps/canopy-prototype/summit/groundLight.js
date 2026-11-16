// Summit Cabin: the scout camp's baked ground (Adriaen 2026-11-16: "in the summer camp we precompute shadows ... are we doing
// the same here?"). As the jungle camp's ground carries its baked shadows and night light (camp/campGround.js), the snow in a
// 44 m square round the cabin and the fire (the same square as road.js's painted mud and trodden snow) carries two maps that
// props/bake_all.py --only summit bakes on the GPU (props/summit/bake_summit_lightmap.py, from export_summit.cjs's scene):
//   models/summit_ground_ao.png     sky occlusion within 4 m (R): dark under the table, the seats, the tent, round the cabin's
//                                   walls, the woodpile, the snowman and the jeep; it takes the sky light, the sun stays live
//   models/summit_ground_night.png  the night light, one channel each, white in the bake and coloured here (sRGB-encoded):
//                                   R the fire, G the cabin (its windows, door, porch lamp and the light inside), B the lanterns
//   models/summit_ground.json       { cx, cz, size (the square, metres), scale: { fire, cabin, lantern } (what each channel
//                                   was divided by to fill the PNG), power: { fire, cabin, lantern } (the bake's watts) }
// Inside the square the live point lights (the fire, the porch lamp, the light inside) no longer light the snow: the bake
// does, with the props' shadows, and the fire channel flickers with the live fire. Without the maps (not baked yet, or
// ?lm=0) the snow is lit live as before.
// Exports groundLight(sh) (an onBeforeCompile extra for hazed(): terrain.js's near rings and road.js's mud), buildGroundLight()
// (main.js: loads the maps; returns a promise the loading card waits for) and groundLightStep(night, fire, porch) (each frame: the live fire's and porch lamp's intensities).
import * as THREE from 'three';
import { OPT } from './land.js';

const COL = { fire: new THREE.Color('#ff9a48'), cabin: new THREE.Color('#ffb760'), lantern: new THREE.Color('#ffc477') };
const CYCLES = 2.1;   // measured: open ground round the fire bakes at 0.47 of the formula below (Cycles' units against three's)
const GAIN = { fire: 1, cabin: 0.15, lantern: 0.5 };   // the knobs to tune by eye: the cabin's channel has its glowing windows too, which
// the live scene never had, so it is turned down; the lanterns have no live light (their strength at full dark)
const U = { uGbAo: { value: null }, uGbNight: { value: null }, uGbO: { value: new THREE.Vector2() }, uGbS: { value: 44 }, uGbOn: { value: 0 },
  uGbFire: { value: new THREE.Color(0, 0, 0) }, uGbCabin: { value: new THREE.Color(0, 0, 0) }, uGbLant: { value: new THREE.Color(0, 0, 0) } };
let J = null;

export function groundLight(sh) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uGbO; uniform float uGbS; varying vec2 vGbUv;')
    .replace('#include <fog_vertex>', 'vGbUv = ((modelMatrix * vec4(transformed, 1.0)).xz - uGbO) / uGbS + 0.5;\n#include <fog_vertex>');
  // gbIn: 1 inside the square, fading out over its outer 3% (the bake sees nothing past its edge)
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uGbAo, uGbNight; uniform float uGbOn; uniform vec3 uGbFire, uGbCabin, uGbLant; varying vec2 vGbUv;
float gbIn() { vec2 e = min(vGbUv, 1.0 - vGbUv); return uGbOn * smoothstep(0.0, 0.03, min(e.x, e.y)); }`)
    .replace('#include <lights_fragment_begin>', 'float gbK = gbIn();\n' + THREE.ShaderChunk.lights_fragment_begin.replace('getPointLightInfo( pointLight, geometryPosition, directLight );', 'getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.color *= 1.0 - gbK;'))
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  if (gbK > 0.0) { vec2 gu = clamp(vGbUv, 0.0, 1.0); vec3 gn = texture2D(uGbNight, gu).rgb * gbK;
    reflectedLight.indirectDiffuse *= mix(1.0, texture2D(uGbAo, gu).r, gbK);
    reflectedLight.indirectDiffuse += diffuseColor.rgb * (gn.r * uGbFire + gn.g * uGbCabin + gn.b * uGbLant); }`);
}

export function buildGroundLight() {
  if (!OPT.lm) return Promise.resolve();
  const load = (f, srgb) => new THREE.TextureLoader().loadAsync(f).then((t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
  const F = `${'models'}/summit_ground`;   // the bake's files (bake_all.py --only summit); the page works without them (lit live), so the name is built and npm run check doesn't require them before the GPU bake
  return fetch(`${F}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j) return;   // not baked yet: the snow stays lit live
    return Promise.all([load(`${F}_ao.png`), load(`${F}_night.png`, true)]).then(([ao, night]) => {
      U.uGbAo.value = ao; U.uGbNight.value = night; U.uGbO.value.set(j.cx, j.cz); U.uGbS.value = j.size; U.uGbOn.value = 1; J = j;
    });
  }).catch((e) => console.warn('summit ground light', e));
}

// each frame, after campStep and cabinStep (they set the live lights' intensities): each channel back to what three's live
// light of that strength gives (a bake value is P cos / (4 pi^2 d^2) for P watts; three's light of intensity I gives
// I cos / (pi d^2), so I = P / 4 pi), times the channel's colour
export function groundLightStep(night, fire, porch) {
  if (!J) return;
  const k = (I, ch) => (GAIN[ch] * CYCLES * I * 4 * Math.PI / J.power[ch]) * J.scale[ch];
  U.uGbFire.value.copy(COL.fire).multiplyScalar(k(fire, 'fire'));
  U.uGbCabin.value.copy(COL.cabin).multiplyScalar(k(porch, 'cabin'));
  U.uGbLant.value.copy(COL.lantern).multiplyScalar(GAIN.lantern * night * J.scale.lantern);
}
