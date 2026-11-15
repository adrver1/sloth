// The camp's baked lights, shared by the props (camp.html) and the ground and plants (ground.js).
// props/camp/bake_camp_lightmap.py bakes the whole scene once and keeps each light on its own channel, in white,
// as light / 4 with gamma 2.2 (models/camp_lights.json has the colours):
//   camp_lm / camp_ground_night   R fire, G stove, B lanterns, A moon (+ night sky)
//   camp_lm_sun A / camp_ground_jeep G   the jeep's cabin light (B / R held the headlights, dropped 2026-11-12)
// so the page colours them, flickers the fire and the stove on their own, switches the jeep's lights (the jeep code sets
// GAIN.cabin and GAIN.doors, 0..1), dims or brightens any of them live, and adds the warm ones a little by day (they
// show in the shade; the sun drowns them in the open).
// Exports: lightDir(dir) (where camp_lights.json is), initKtx(renderer), fetchBytes(txt), loadLightMap(png, { ktx }), LIGHT and GAIN
// (the uniforms and gains), LIGHT_GLSL, LIGHT_MIX(...), liveChunk(chunk), bindLight(shader), stepLight(fl, t).
import * as THREE from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

// the light maps ship as KTX2 (UASTC + zstd, props/bake_all.py --only ktx): about half the download of the PNGs and a quarter
// of the GPU memory; a map with no .ktx2 next to it (or a browser that can't take it) falls back to its .png.
// camp_lights.json "ktx2" says which maps have one: an object of map name -> the hash of the PNG it was made from (written by
// bake_all.py; tools/check-imports.cjs uses the hash to find a stale .ktx2.txt), or true from older bakes, when every map is tried
let ktx = null, META = null;
// lightDir(dir): the folder that holds camp_lights.json (default "models/"; camp.html?lmdir= points it at a preview bake,
// props/camp/bake_camp_lightmap.py --preview). Call it before the first loadLightMap; the file is read once, on first use.
let DIR = "models/";
export function lightDir(dir) { DIR = dir; }
const meta = () => (META ??= fetch(DIR + "camp_lights.json").then((r) => r.json()).then((j) => {
  [...j.channels, ...(j.jeep_channels || [])].forEach((g, i) => j.colour[g] && LIGHT.uLCol.value[i].set(...j.colour[g]));
  if (j.door_patch) LIGHT.uGP.value.set(j.door_patch.x0, j.door_patch.z0, j.door_patch.size);
  return j;
}).catch(() => ({})));
export function initKtx(renderer) {
  ktx = new KTX2Loader().setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/basis/").detectSupport(renderer);
}
// base64 text -> bytes. The models and the KTX2 maps are committed as base64 .txt files (artifacts serve text and images only).
// Uint8Array.from(atob(txt), callback) called the callback per character: 140 ms for the 3 MB light map, against 8 ms for
// this loop and 2 ms where the browser has Uint8Array.fromBase64 (measured in Chromium).
function b64bytes(txt) {
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(txt);
  const s = atob(txt), n = s.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = s.charCodeAt(i); return u;
}
// How the host serves them: base64 .txt (the default, for artifacts and a checkout), or the binary files (X.txt as X.glb,
// X.ktx2.txt as X.ktx2) when the page has <meta name="camp-models" content="binary">. The Pages deploy decodes the .txt files
// and sets that (.github/workflows/pages.yml, review R2-214): about a fifth less to download and nothing to decode.
const BINARY = document.querySelector('meta[name="camp-models"]')?.content === "binary";
// fetchBytes(txt): the bytes of the model or map whose base64 copy is at the URL txt, from the binary file where it is served
export async function fetchBytes(txt) {
  const r = await fetch(BINARY ? txt.replace(/(\.ktx2)?\.txt$/, (m, k) => k || ".glb") : txt);
  if (!r.ok) throw new Error(`${r.status} ${r.url}`);
  if (!r.ok) throw new Error(`${txt} ${r.status}`);   // a failed download names its file (review R2-058)
  return BINARY ? new Uint8Array(await r.arrayBuffer()) : b64bytes((await r.text()).trim());
}
// loadLightMap(png, { ktx }): the map as a texture, from its .ktx2.txt when there is one, else the .png. ktx: false skips the
// KTX2 try (core.js passes it for the 4K maps, which bake_all.py does not convert), so no request 404s.
export async function loadLightMap(png, { ktx: tryKtx = true } = {}) {
  let t = null;
  // artifacts don't serve .ktx2, so the maps are committed base64 in .ktx2.txt files like the models (fetchBytes)
  const has = (await meta()).ktx2, name = png.replace(/^.*\//, "").replace(/\.png$/, "");   // meta() also gives LIGHT the bake's colours, once
  if (ktx && tryKtx && (has === true || (has && typeof has === "object" && name in has))) t = await fetchBytes(png.replace(/\.png$/, ".ktx2.txt"))
    .then((u) => new Promise((ok, no) => ktx.parse(u.buffer, ok, no))).catch(() => null);   // only once the bake wrote them
  t ??= await new THREE.TextureLoader().loadAsync(png);
  t.flipY = false; t.colorSpace = THREE.NoColorSpace; return t;   // data, decoded in the shaders
}

const C = (r, g, b) => new THREE.Vector3(r, g, b);
export const LIGHT = {
  uLCol: { value: [C(1.0, 0.5, 0.2), C(1.0, 0.55, 0.15), C(1.0, 0.72, 0.38), C(0.55, 0.65, 1.0), C(1.0, 0.8, 0.62), C(1.0, 0.89, 0.66)] },   // fire, stove, lanterns, moon, headlights, cabin
  uLK: { value: new THREE.Vector4(1, 1, 1, 1) },      // fire, stove, lanterns, moon strength this frame (flicker x gain)
  uLJ: { value: new THREE.Vector2(0, 0) },            // (unused, cabin): the cabin light (0 = off)
  uLD: { value: new THREE.Vector3(0, 0, 0) },         // how far each door is open (passenger, driver, back): picks its spill keyframes
  uGP: { value: new THREE.Vector3(-5.2, -9.4, 6) },  // that spill's ground patch: x0, z0, size (models/camp_lights.json)
  uLDay: { value: 0.5 },                               // how much of the warm camp lights shows by day
};
export const GAIN = { fire: 1, stove: 1, lanterns: 1, moon: 1, day: 0.5, headlights: 0, cabin: 0, cabinBoost: 3, doors: { P: 0, D: 0, B: 0 } };   // doors: how far each is open, 0..1

// GLSL: decode texels, the camp's night light, its warm lights alone, the jeep's lights, and the hue-keeping tone
export const LIGHT_GLSL = `
uniform vec3 uLCol[6]; uniform vec4 uLK; uniform vec2 uLJ; uniform vec3 uLD, uGP; uniform float uLDay;
vec4 lmDecode(vec4 t) { return pow(t, vec4(2.2)); }
vec2 lmDecode2(vec2 t) { return pow(t, vec2(2.2)); }
vec3 lmNight(vec4 q) { q *= uLK; return uLCol[0] * q.x + uLCol[1] * q.y + uLCol[2] * q.z + uLCol[3] * q.w; }
vec3 lmWarm(vec4 q) { q *= uLK; return uLCol[0] * q.x + uLCol[1] * q.y + uLCol[2] * q.z; }
vec3 lmJeep(vec2 j) { return uLCol[5] * j.y * uLJ.y; }   // the cabin light (the .x channel held the headlights, dropped)
vec3 lmDoors(vec3 d) { return uLCol[5] * (d.x + d.y + d.z) * uLJ.y; }   // d: each door's spill, from doorKey
// a door's spill at opening f (0..1) from its four baked openings (RGBA = a quarter, half, three quarters, full open)
float doorKey(vec4 k, float f) { f *= 4.0; return f < 1.0 ? k.x * f : f < 2.0 ? mix(k.x, k.y, f - 1.0) : f < 3.0 ? mix(k.y, k.z, f - 2.0) : mix(k.z, k.w, min(f - 3.0, 1.0)); }
vec2 lmDoorUv(vec2 xz) { return (xz - uGP.xy) / uGP.z; }   // the door patch's UV for a ground point (page x, z)
vec3 nightTone(vec3 x) { float l = max(dot(x, vec3(0.2126, 0.7152, 0.0722)), 1e-4); return min(x * (1.0 - exp(-l)) / l, vec3(1.0)); }
`;
// the colour a surface of albedo `base` takes, from its camp light q (vec4) and jeep light j (vec2):
// day = the live light + a share of the warm camp lights + the jeep's lights when on; night = all of them, baked, unlit
// spot = true where the shader's light loop went through liveChunk: the page's one spot light (the live cabin light, Cabin: live)
// stays on at night instead of being blended away with the rest of the live light
export const LIGHT_MIX = (base, q, j, night, doors = "vec3(0.0)", spot = false) => `
  outgoingLight += ${base} * (lmWarm(${q}) * uLDay + lmJeep(${j}) + lmDoors(${doors})) * 6.4 * (1.0 - ${night});
  outgoingLight = mix(outgoingLight, nightTone(6.4 * ${base} * (lmNight(${q}) + lmJeep(${j}) + lmDoors(${doors}))), ${night});${spot ? `
  outgoingLight += spotDiffuse * ${night};` : ""}`;
// three.js's light loop, keeping the spot lights' share apart (spotDiffuse) for LIGHT_MIX
export const liveChunk = (chunk = THREE.ShaderChunk.lights_fragment_begin) => chunk
  .replace("#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )", "vec3 dBeforeS = reflectedLight.directDiffuse;\n#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )")
  .replace("#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )", "vec3 spotDiffuse = reflectedLight.directDiffuse - dBeforeS;\n#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )");

export function bindLight(sh) { Object.assign(sh.uniforms, LIGHT); }

// per frame: fl = the fire's flicker (0.7 .. 1), t = time
export function stepLight(fl, t) {
  const st = 0.85 + 0.15 * Math.sin(t * 5.1) * Math.sin(t * 2.3 + 1.7);       // the stove: slower, from behind its door
  LIGHT.uLK.value.set(GAIN.fire * fl, GAIN.stove * st, GAIN.lanterns, GAIN.moon);
  LIGHT.uLJ.value.set(0, GAIN.cabin * GAIN.cabinBoost);   // the cabin's 15 W bake reads dim: boosted, doors included (lmDoors uses uLJ.y)
  LIGHT.uLD.value.set(GAIN.doors.P, GAIN.doors.D, GAIN.doors.B);
  LIGHT.uLDay.value = GAIN.day;
}
