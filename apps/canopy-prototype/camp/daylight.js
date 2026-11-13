// Canopy Camp daylight: what the hour and the weather do to the light. One palette from day through golden hour and dusk to
// night, with the dawn mist and the grey of rain: the fog, the sky light, the sun (which turns into cool moonlight), the
// backdrop and the sky domes (sky.js), the moon, the light shafts (campProps.js) and the low banks of mist over the clearing.
// Only colour and a few soft sprites, so nothing to bake.
//   light            { dusk, gold, mist }, each 0..1: this frame's levels, once setLight has run
//   createDaylight() builds the mist banks (and the old firefly cloud, kept hidden) and puts the moon where the start view
//                    sees it. main.js calls it once, after every other module has built its part of the scene: the sprites
//                    draw from the shared seeded stream (core.js R), last of all, and join the scene last
//   setLight(hour, wet)   the levels for an hour (daytime.js `shown`) and how wet it is (weather.js, 0..1)
//   daylightStep(dt, wet) moves the mist banks and sets every colour from the levels
// It builds nothing itself when it is imported, but its own imports (sky.js, terrain.js, campProps.js, player.js) are built
// where it is first imported, so it stays last in main.js's import list: moved up, it builds the props before the forest and
// the seeded stream comes out in another order (measured: the replay fingerprint moves).
import * as THREE from "three";
import { D, R, S, scene, sun, uTime } from "./core.js";
import { V } from "./util.js";
import { RC } from "./layout.js";
import { dome, moon, nightDome, sky, uSkyDusk, uSkyFog, uSkyHaze } from "./sky.js";
import { groundHeight } from "./terrain.js";
import { glowTex, rayMat } from "./campProps.js";
import { me } from "./player.js";

// night (camp review B1): deep blue-teal fog and backdrop, the forest in cool moonlight and near-black under the canopy, so the
// fire, the lanterns and the tent are the only warm colours. Warm near, cool far. The sky light from below is warm firelight off
// the ground, so the undersides of things (a sloth overhead) catch a little glow instead of going black.
const DUSK = new THREE.Color(0x0e1c2b), NIGHT_SKY = new THREE.Color(0x4a66a0), NIGHT_GROUND = new THREE.Color(0x4a2c16), MOONC = new THREE.Color(0x9fb4e6), BACK_NIGHT = new THREE.Color(0.08, 0.12, 0.22);
// golden hour and dawn mist (camp review B7): toward evening the light lingers in a warm golden band (low amber sun, honey
// fog, the light shafts turn gold and brighten); in the morning a pale mist lies over the clearing and burns off by
// mid-morning. Rain greys the fog and the backdrop and takes the shafts away.
const RAIN_FOG = new THREE.Color(0x7d8c86), BACK_RAIN = new THREE.Color(0.72, 0.78, 0.8), BACK_DAWN = new THREE.Color(1.25, 1.3, 1.36), BACK_GOLD = new THREE.Color(1.15, 0.82, 0.5), GOLD_SUN = new THREE.Color(0xffa040), GOLD_FOG = new THREE.Color(0xc89a62), DAWN_FOG = new THREE.Color(0xc8ccd6), RAY_DAY = new THREE.Color(0xffffff), RAY_GOLD = new THREE.Color(0xffb050);
// the levels by the hour (0..24)
const sm = THREE.MathUtils.smoothstep;
const duskOf = (h) => h >= 20.5 || h < 5.5 ? 1 : h < 7.5 ? 1 - sm(h, 5.5, 7.5) : h < 17 ? 0 : h < 19 ? 0.45 * sm(h, 17, 19) : 0.45 + 0.55 * sm(h, 19, 20.5);
const goldOf = (h) => sm(h, 16.3, 17.6) * (1 - sm(h, 18.9, 19.8));                       // low warm sun before dusk
const mistOf = (h) => sm(h, 5, 6.3) * (1 - sm(h, 7.8, 10.5));                            // dawn mist, burnt off by mid-morning
const light = { dusk: 0, gold: 0, mist: 0 };
function setLight(hour, wet) { light.dusk = duskOf(hour); light.gold = goldOf(hour) * (1 - wet); light.mist = mistOf(hour); }

let hemiL, DAY, mistSprites, flies;
function createDaylight() {
  hemiL = scene.children.find((o) => o.isHemisphereLight);
  DAY = { fog: new THREE.Color(S.fog[0]), hemi: hemiL.intensity, sun: sun.intensity, sky: hemiL.color.clone(), ground: hemiL.groundColor.clone(), sunC: sun.color.clone(), dens: scene.fog.density };
  // the moon: up in the canopy gap, in front of you as you start (you face the fire), a little to the side
  { const f = me.pos.clone().setY(0).negate().normalize(), sd = V(-f.z, 0, f.x); moon.position.copy(f.multiplyScalar(11)).addScaledVector(sd, 3).setY(21); }
  mistSprites = (() => {   // low banks of mist over the clearing floor, each a big soft sprite standing on the ground (terrain.js)
    const g = new THREE.Group(), n = D.fx ? 16 : 8, mat = new THREE.SpriteMaterial({ map: glowTex, color: 0xe6ebf2, transparent: true, opacity: 0, depthWrite: false, fog: false });
    for (let i = 0; i < n; i++) { const a = R(0, 6.28), r = Math.sqrt(R(0.05, 1)) * (RC + 1), sp = new THREE.Sprite(mat), x = Math.cos(a) * r, z = Math.sin(a) * r;
      sp.scale.set(R(5, 8), R(1.2, 1.8), 1); sp.position.set(x, groundHeight(x, z) + R(0.35, 0.7), z); sp.userData = { a, r, w: R(0.01, 0.025) * (i % 2 ? 1 : -1) }; g.add(sp); }
    g.visible = false; scene.add(g); return g;
  })();
  flies = (() => {
    const n = 120, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = R(0, 6.28), r = R(2, RC + 6); p.set([Math.cos(a) * r, R(0.4, 7), Math.sin(a) * r], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xd8ff7a, size: 0.14, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); scene.add(pts); return pts;
  })();
  flies.visible = false;   // atmosphere.js draws blinking fireflies instead
}

function daylightStep(dt, wet) {
  const { dusk, gold, mist } = light;
  mistSprites.visible = mist > 0.01;
  if (mistSprites.visible) { const k = mist * (1 - dusk); mistSprites.children[0].material.opacity = 0.32 * k;
    for (const sp of mistSprites.children) { const u = sp.userData; u.a += u.w * dt; sp.position.x = Math.cos(u.a) * u.r; sp.position.z = Math.sin(u.a) * u.r; } }
  scene.fog.color.copy(DAY.fog).lerp(GOLD_FOG, 0.55 * gold).lerp(DUSK, dusk).lerp(DAWN_FOG, 0.5 * mist * (1 - dusk)).lerp(RAIN_FOG, 0.6 * wet * (1 - dusk)); scene.fog.density = DAY.dens * (1 + 0.6 * dusk + 0.7 * mist * (1 - dusk) + 0.5 * wet);
  hemiL.intensity = DAY.hemi * (1 - 0.72 * dusk) * (1 - 0.2 * wet); hemiL.color.copy(DAY.sky).lerp(NIGHT_SKY, dusk); hemiL.groundColor.copy(DAY.ground).lerp(NIGHT_GROUND, dusk);
  sun.intensity = DAY.sun * (1 - 0.62 * dusk + 0.35 * gold) * (1 - 0.5 * wet); sun.color.copy(DAY.sunC).lerp(GOLD_SUN, 0.8 * gold).lerp(MOONC, THREE.MathUtils.smoothstep(dusk, 0.35, 1));                      // the sun turns into cool moonlight
  sky.material.color.setRGB(1, 1, 1).lerp(BACK_GOLD, 0.7 * gold).lerp(BACK_DAWN, 0.6 * mist * (1 - dusk)).lerp(BACK_RAIN, 0.5 * wet).lerp(BACK_NIGHT, dusk); uSkyDusk.value = Math.min(1, dusk * 1.3); uSkyFog.value = scene.fog.color; uSkyHaze.value = 0.75 * Math.max(dusk, gold, mist * (1 - dusk), 0.7 * wet); dome.material.color.setScalar(1 - 0.75 * dusk).lerp(BACK_GOLD, 0.6 * gold); scene.background.set(S.sky[0]).lerp(DUSK, dusk);
  nightDome.visible = moon.visible = dusk > 0.01; nightDome.material.opacity = Math.min(1, dusk * 1.3); moon.material.opacity = Math.max(0, dusk * 1.5 - 0.5); flies.material.opacity = dusk; flies.rotation.y += dt * 0.02;
  if (rayMat) rayMat.color.copy(RAY_DAY).lerp(RAY_GOLD, gold), rayMat.opacity = S.rays * Math.max(1 - dusk, 1.8 * gold) * (1 - wet) * (0.85 + 0.15 * Math.sin(uTime.value * 0.21) * Math.sin(uTime.value * 0.13 + 1.0));   // a slow shimmer as leaves move over the gap
}

export { createDaylight, daylightStep, light, setLight };
