// The camp's baked lights, shared by the props (camp/campProps.js lnight) and the ground and its plants (ground.js).
// props/camp/bake_camp_lightmap.py bakes the whole scene once and keeps each light on its own channel, in white, as light / 4
// with gamma 2.2; models/camp_lights.json names the channels and their colours. The channel layout is written down once, in
// camp/campProps.js above lnight (the props' camp_lm and camp_lm_sun); the ground's camp_ground_night has the same four light
// channels as camp_lm. So the page colours each light, flickers the fire and the stove on their own, dims or brightens any of
// them live (GAIN), and adds the warm ones a little by day (they show in the shade; the sun drowns them in the open).
// The jeep's cabin light is live (one spot light, camp/jeep.js); its baked light, door spill and headlights were dropped from the
// bake on 2026-11-12 and their shader path from here (review R2-210).
// Exports initKtx(renderer), b64bytes(txt), loadLightMap(png, { channel, anisotropy }), doneLoading(), LIGHT (the uniforms),
// GAIN (each light's strength), LIGHT_GLSL, LIGHT_MIX(base, q, night, spot), liveChunk(chunk), bindLight(shader) and
// stepLight(fl, t) (main.js, each frame).
import * as THREE from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { swap } from "./camp/util.js";

// the light maps ship as KTX2 (UASTC + zstd, props/bake_all.py --only ktx): about half the download of the PNGs and a quarter
// of the GPU memory; a map with no .ktx2 next to it (or a browser that can't take it) falls back to its .png
let ktx = null;
const META = fetch("models/camp_lights.json").then((r) => r.json()).catch(() => ({}));
export function initKtx(renderer) {
  ktx = new KTX2Loader().setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/basis/").detectSupport(renderer);
}
// base64 text -> bytes. The models and the KTX2 maps ship as base64 .txt files (artifacts serve text and images only).
// Uint8Array.from(atob(txt), callback) called the callback per character: 140 ms for the 3 MB light map, against 8 ms for
// this loop and 2 ms where the browser has Uint8Array.fromBase64 (measured in Chromium).
export function b64bytes(txt) {
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(txt);
  const s = atob(txt), n = s.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = s.charCodeAt(i); return u;
}
// loadLightMap(png, { channel, anisotropy }): one light map as a data texture (no flip, no colour space: the shaders decode it),
// on the UV set `channel` (the props' second set is 1; the ground looks its maps up by position, 0). doneLoading() releases
// the KTX2 transcoder's workers once every map asked for so far has settled; a map asked for after that loads its PNG.
const pending = new Set();
export function loadLightMap(png, { channel = 0, anisotropy = 4 } = {}) {
  const p = (async () => {
    let t = null;
    // artifacts don't serve .ktx2, so the maps ship base64 in .ktx2.txt files like the models (still well under the PNGs)
    if (ktx && (await META).ktx2) t = await fetch(png.replace(/\.png$/, ".ktx2.txt")).then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((b64) => new Promise((ok, no) => ktx.parse(b64bytes(b64.trim()).buffer, ok, no))).catch(() => null);   // only once the bake wrote them
    t ??= await new THREE.TextureLoader().loadAsync(png);
    t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.channel = channel; t.anisotropy = anisotropy; return t;
  })();
  pending.add(p); p.catch(() => {}).finally(() => pending.delete(p));
  return p;
}
// main.js calls this once the props' maps (core.js PRE.lm) and the ground's night map (ground.js) have been asked for
export function doneLoading() {
  return Promise.allSettled([...pending]).then(() => { ktx?.dispose(); ktx = null; });
}

const C = (r, g, b) => new THREE.Vector3(r, g, b);
// uLCol's colours are only the fallback for a missing models/camp_lights.json: the bake (props/camp/bake_camp_lightmap.py LIGHTS)
// writes each light's colour there, and the reader below the table puts them in
export const LIGHT = {
  uLCol: { value: [C(1.0, 0.5, 0.2), C(1.0, 0.55, 0.15), C(1.0, 0.72, 0.38), C(0.55, 0.65, 1.0)] },   // fire, stove, lanterns, moon
  uLK: { value: new THREE.Vector4(1, 1, 1, 1) },      // fire, stove, lanterns, moon strength this frame (flicker x gain)
  uLDay: { value: 0.5 },                               // how much of the warm camp lights shows by day
};
export const GAIN = { fire: 1, stove: 1, lanterns: 1, moon: 1, day: 0.5 };
META.then((j) => { j.channels.slice(0, 4).forEach((g, i) => { if (j.colour[g]) LIGHT.uLCol.value[i].set(...j.colour[g]); }); }).catch(() => {});

// GLSL: decode texels, the camp's night light, its warm lights alone, and the hue-keeping tone
export const LIGHT_GLSL = `
uniform vec3 uLCol[4]; uniform vec4 uLK; uniform float uLDay;
vec4 lmDecode(vec4 t) { return pow(t, vec4(2.2)); }
vec3 lmNight(vec4 q) { q *= uLK; return uLCol[0] * q.x + uLCol[1] * q.y + uLCol[2] * q.z + uLCol[3] * q.w; }
vec3 lmWarm(vec4 q) { q *= uLK; return uLCol[0] * q.x + uLCol[1] * q.y + uLCol[2] * q.z; }
vec3 nightTone(vec3 x) { float l = max(dot(x, vec3(0.2126, 0.7152, 0.0722)), 1e-4); return min(x * (1.0 - exp(-l)) / l, vec3(1.0)); }
// the warm lights' share by day, as a multiple of the surface colour, eased off so it never passes WARM_CAP times it, hue kept:
// unbounded, it turned the fire ring's stones, the ash bed and the tripod's legs near-white and flat orange by day (R2-160)
const float WARM_CAP = 0.6;
vec3 dayWarm(vec3 w) { float l = max(dot(w, vec3(0.2126, 0.7152, 0.0722)), 1e-4); return w * (WARM_CAP * (1.0 - exp(-l / WARM_CAP)) / l); }
`;
// the colour a surface of albedo `base` takes, from its camp light q (vec4): day = the live light + a share of the warm camp
// lights (eased off by dayWarm); night = all four, baked, unlit. night is how far the night light is faded in (GLSL float).
// spot = true where the shader's light loop went through liveChunk: the page's one spot light (the jeep's live cabin light)
// stays on at night instead of being blended away with the rest of the live light
export const LIGHT_MIX = (base, q, night, spot = false) => `
  outgoingLight += ${base} * dayWarm(lmWarm(${q}) * uLDay * 6.4) * (1.0 - ${night});
  outgoingLight = mix(outgoingLight, nightTone(6.4 * ${base} * lmNight(${q})), ${night});${spot ? `
  outgoingLight += spotDiffuse * ${night};` : ""}`;
// three.js's light loop, keeping the spot lights' share apart (spotDiffuse) for LIGHT_MIX
export const liveChunk = (chunk = THREE.ShaderChunk.lights_fragment_begin) => swap(chunk,
  ["#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )", "vec3 dBeforeS = reflectedLight.directDiffuse;\n#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )"],
  ["#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )", "vec3 spotDiffuse = reflectedLight.directDiffuse - dBeforeS;\n#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )"]);

export function bindLight(sh) { Object.assign(sh.uniforms, LIGHT); }

// per frame: fl = the fire's flicker (0.7 .. 1), t = time
export function stepLight(fl, t) {
  const st = 0.85 + 0.15 * Math.sin(t * 5.1) * Math.sin(t * 2.3 + 1.7);       // the stove: slower, from behind its door
  LIGHT.uLK.value.set(GAIN.fire * fl, GAIN.stove * st, GAIN.lanterns, GAIN.moon);
  LIGHT.uLDay.value = GAIN.day;
}
