// Canopy Camp core: URL options, detail level, the renderer, scene, camera and lights, the named seeded random streams (rng), every download
// started at once (PRE, camp review P2) and the look's settings S (the small shared helpers are in util.js). Loaded first by camp.html via main.js.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { fetchBytes, initKtx, lightDir, loadLightMap } from "../bakedlight.js";
import { SUN } from "./layout.js";
import { swap } from "./util.js";

// ---------------------------------------------------------------- URL options and saved settings, all parsed here (review boot-17, crosscut-15)
// camp.html?name=value. "saved" is the ⚙️ menu's choice, kept per viewer in localStorage under KEYS.
//   option   values                        default                           read by
//   detail   low | medium | high           saved, else medium                core.js (D: counts, effects, resolution), main.js (DETAIL)
//   lm       2k | 1k | 4k (4k: local only) saved, else 1k on phones, 2k     core.js (the light maps)
//   jeep     expedition | none             expedition                        forest.js, terrain.js, jeep.js, campGround.js (JEEP)
//   seed     a number                      7                                 core.js rng (every named stream), forest.js (its own start)
//   lived    1 | 0                         1                                 core.js, campProps.js, chores.js, sloth/spots.js, debug.js (LIVED)
//   op       1 | 0                         1                                 core.js (the operator's downloads), operator.js and operator/step.js (0 leaves him out)
//   weather  clear | rain | changing       saved, else clear                 weather.js (checks it against its modes)
//   time     an hour, 0 up to 24 (21.5)    saved, else 12                    daytime.js (the hour set; anything else counts as 12)
//   cycle    1 | 0                         saved, else 0                     daytime.js (the day runs on by itself)
//   pos      x,z in metres                 by the fire (player.js)           main.js (where you stand at the start)
//   yaw      radians                       facing the fire (player.js)       main.js (where you look at the start)
//   pitch    radians                       0.08 (player.js)                  main.js
//   campsloths 1 | 0                       1                                 sloths.js, sloth/step.js, sloth/naps.js, labButton.js (0: only the two wild sloths, no camp sloths)
//   slothmat lambert | old                 lambert                           sloth/body.js (old: the sloth GLB's own physical material)
//   lab      (present)                     absent                            labButton.js (opens the move lab, lab.js, at the start, and shows its button)
//   dev      (present)                     absent                            core.js wireSettings, main.js, labButton.js (shows the fps pill and the
//                                                                            ⚙️ menu's Detail, Light and Move lab buttons; hidden from players)
//   touch    present or not                on a phone (a coarse pointer)     input.js (the phone stick and its hint, on a desktop too)
//   sound    0                             saved, else on                    audio/context.js (0 starts muted)
//   station  drift | campfire | kalimba | lullaby   saved, else drift        audio/context.js (checks it against its stations)
//   lmdir    a folder in the app, e.g.     models                            core.js (LMDIR: the light maps, camp_lights.json and the four light-mapped
//            lmpreview (letters, digits,                                     models), campGround.js (the ground's baked shadow and night maps): a preview
//            - and _, / between parts)                                       bake, props/camp/bake_camp_lightmap.py --preview; anything else keeps models
//   fur      1 | 0                         1                                 fur.js reads location itself (the pages in prototypes/ share it)
const qs = new URLSearchParams(location.search);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };   // a number, or null when it is missing or not a number
// localStorage keys: detail, lm (core.js), weather (weather.js), time and cycle (daytime.js), save (save.js: the camp's lived
// state, one part per owner), audio (audio.js and audio/context.js: volume, muted, music, its volume and the station, as one JSON object).
const KEYS = { detail: "canopy-detail", lm: "canopy-lm", weather: "canopy-weather", time: "canopy-time", cycle: "canopy-cycle", save: "canopy-camp-save", audio: "canopy-audio" };
// ---------------------------------------------------------------- window.__ names on camp.html (review C2, crosscut-03/04, boot-04)
// The modules talk through imports only. The window.__ names are for the headless tools (camp-probe.cjs, camp-replay.cjs,
// camp-scenarios.cjs and props/shadow/export_casters.cjs) and are all set in debug.js, which lists them with their readers.
// the look: Mossy real, the one picked. The Painterly and Low-poly looks were archived on 2026-11-12 (camp review; Adriaen):
// they live on in prototypes/index.html (the forest look prototype), and camp.html with all three, with their branches in forest.js,
// glade.js and sky.js, is in git history before commit "Canopy camp: start every download at once".
const $ = (id) => document.getElementById(id);

// detail level, kept per viewer: how many leaves, ferns, fur shells and effects, and the resolution cap
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const LEVELS = ["low", "medium", "high"];
const LMS = ["2k", "1k"], LMNAME = { "4k": "4K map", "2k": "2K map", "1k": "1K map" };
const OPT = {
  detail: LEVELS.includes(qs.get("detail")) ? qs.get("detail") : LEVELS.includes(store.get(KEYS.detail)) ? store.get(KEYS.detail) : "medium",
  lm: [...LMS, "4k"].includes(qs.get("lm")) ? qs.get("lm") : LMS.includes(store.get(KEYS.lm)) ? store.get(KEYS.lm)
    : matchMedia("(pointer: coarse)").matches ? "1k" : "2k",   // phones start on the 1K maps (review P1: hard to tell apart at phone size, a quarter of the memory)
  jeep: qs.get("jeep") === "none" ? "none" : "expedition",
  seed: num(qs.get("seed")) ?? 7,   // a value that is not a number keeps 7
  lived: qs.get("lived") !== "0",
  op: qs.get("op") !== "0",
  weather: qs.get("weather"),
  time: (() => { const v = qs.get("time") || store.get(KEYS.time), h = v ? Number(v) : 12; return h >= 0 && h < 24 ? h : 12; })(),   // an empty ?time= counts as missing
  cycle: qs.has("cycle") ? qs.get("cycle") !== "0" : store.get(KEYS.cycle) === "on",
  pos: (() => { const p = (qs.get("pos") || "").split(",").map(parseFloat); return p.length === 2 && p.every(Number.isFinite) ? p : null; })(),   // the start view: null (or a value that isn't a number) keeps player.js's own
  yaw: num(qs.get("yaw")),
  pitch: num(qs.get("pitch")),
  campsloths: qs.get("campsloths") !== "0",
  slothmat: qs.get("slothmat") === "old" ? "old" : "lambert",
  lab: qs.has("lab"),
  dev: qs.has("dev"),
  touch: qs.has("touch"),
  sound: qs.get("sound") !== "0",
  station: qs.get("station"),
  lmdir: /^[\w-]+(\/[\w-]+)*\/?$/.test(qs.get("lmdir") || "") ? qs.get("lmdir").replace(/\/?$/, "/") : "models/",   // no dots, no host: only the app's own folders
};
const DETAIL = OPT.detail;
const D = { low: { leaves: 0.55, ferns: 0.5, fx: 0, shells: 2, pr: 1.25, aa: false },
            medium: { leaves: 1, ferns: 1, fx: 1, shells: 3, pr: 1.75, aa: false },
            high: { leaves: 1.6, ferns: 1.7, fx: 1.5, shells: 4, pr: 2, aa: true } }[DETAIL];
// the props: "Our camp" (the picked set, the "picked" in the model file names) only. Storybook, Rustic, Jungle and the first
// code-drawn shapes are archived in props/camp/archive/ (camp review, Adriaen 2026-11-12).
// the jeep: the Expedition (Adriaen 2026-11-12; the Toy and Camper styles are in props/jeep/archive/); ?jeep=none hides it
const JEEP = OPT.jeep;
// the picked props' baked light: a 2K or 1K light map (?lm=4k also works locally; 4k is too big to publish)
const LMSET = OPT.lm;
// where the baked light and the models baked with it come from: models/, or a preview bake's folder (?lmdir=)
const LMDIR = OPT.lmdir;
lightDir(LMDIR);
// the ⚙️ menu's own buttons: main.js calls wireSettings() once. One ⚙️ button opens the detail and light-map choices (the old
// row took a quarter of a phone screen); Detail and Light each step to the next choice, keep it and reload without their URL option (which would win over the kept choice).
// Detail, Light and the fps pill are for developers: shown only with ?dev (review R2-206).
function wireSettings() {
  $("detail").hidden = $("lm").hidden = $("perf").hidden = !OPT.dev;
  $("menu").onclick = () => { const o = $("opts"); o.hidden = !o.hidden; $("menu").setAttribute("aria-expanded", String(!o.hidden)); };
  $("detail").textContent = "Detail: " + DETAIL[0].toUpperCase() + DETAIL.slice(1);
  $("detail").onclick = () => { store.set(KEYS.detail, LEVELS[(LEVELS.indexOf(DETAIL) + 1) % 3]); const u = new URL(location.href); u.searchParams.delete("detail"); location.replace(u); };
  $("lm").textContent = "Light: " + LMNAME[LMSET];
  $("lm").onclick = () => { store.set(KEYS.lm, LMS[(LMS.indexOf(LMSET) + 1) % LMS.length]); const u = new URL(location.href); u.searchParams.delete("lm"); location.replace(u); };
}

// seeded random, so every visit grows the same tree and hides sloths in the same spots. Each system draws from its own named
// stream (rng("forest"), rng("sloths"), ...), seeded from ?seed and the name, so one system drawing more or less, or earlier,
// never moves another's numbers. The same name always hands back the same stream, so the sloth modules share one.
// start: the stream's own start instead of one mixed from ?seed and the name (forest.js keeps the start its layout was baked with)
const streams = new Map();
function rng(name, start) {
  let st = streams.get(name);
  if (st) return st;
  let seed = OPT.seed | 0;
  if (start !== undefined) seed = start | 0;
  else for (let i = 0; i < name.length; i++) seed = Math.imul(seed ^ name.charCodeAt(i), 0x01000193);   // FNV-style mix of the name into the seed
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // mulberry32
  st = { rnd, R: (a, b) => a + rnd() * (b - a) };
  streams.set(name, st);
  return st;
}

// ---------------------------------------------------------------- the look's settings (Mossy real)
const S = { sky: ["#dfe9d2", "#a9c39a", "#5d7d58"], fog: [0x9fb592, 0.055], bark: [0x5b4636, 0x3a2c22], moss: 0x6f8f3a, mossAmt: 0.75,
            leaf: [0x4f7f34, 0x6b9a3c, 0x3d6a2f, 0x85a845], hemi: [0xf4f0dc, 0x3b4a2a, 1.6], sun: [0xffe7c0, 2.0], rays: 0.3, motes: 260, slothTint: 0xc9d9a6 };

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas: $("c"), antialias: D.aa, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, D.pr));   // main.js lowers it if the frame rate drops
renderer.outputColorSpace = THREE.SRGBColorSpace;
// ---------------------------------------------------------------- downloads, all started at once (camp review P2, 2026-11-12)
// Every model, the light maps and the ground's baked maps start loading here, while the forest below is grown, instead of one after
// another further down. Each section awaits its own entry in PRE (null when it isn't shown). The loading card counts them.
const LIVED = OPT.lived;   // ?lived=0 hides the lived-in props to compare
let loadN = 0, loadDone = 0;
const pre = (p) => { if (!p) return null; loadN++; const tick = () => { $("loadbar").style.width = `${4 + 86 * ++loadDone / loadN}%`; }; p.then(tick, tick); return p; };
initKtx(renderer);
const tex = (url) => new THREE.TextureLoader().loadAsync(url).catch(() => null);
// the 4K maps (?lm=4k, local only) have no KTX2 copy (bake_all.py converts the 2K and 1K maps), so they go straight to the PNG;
// on the props' second UV set
const lmLoad = (n) => loadLightMap(`${LMDIR}${n}_${LMSET}.png`, { channel: 1, ktx: LMSET !== "4k" }).catch(() => loadLightMap(`${LMDIR}${n}_2k.png`, { channel: 1 }));
const PRE = {
  sloth: pre(glb("models/sloth.txt")),
  operator: OPT.op ? pre(glb("models/operator.txt")) : null,                 // the bearded operator (camp/operator.js)
  operatorAnims: OPT.op ? pre(glb("models/operator_anims.txt")) : null,
  lm: pre(Promise.all([lmLoad("camp_lm"), lmLoad("camp_lm_sun")])),
  props: pre(glb(`${LMDIR}camp_picked_lm.txt`)),
  lived: LIVED ? pre(glb(`${LMDIR}lived.txt`)) : null,
  laundry: LIVED ? pre(glb(`${LMDIR}laundry.txt`)) : null,
  fire: pre(glb(`${LMDIR}fire.txt`)),
  jeep: JEEP !== "none" ? pre(glb(`models/jeep_${JEEP}.txt`)) : null,
  jeepLod: JEEP === "expedition" ? pre(glb("models/jeep_expedition_lod.txt").catch(() => null)) : null,
  // the ground (campGround.js): the baked wear mask, soil, shadows and night light, each null when it is missing
  groundMask: pre(new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = "models/camp_ground_picked_mask.png"; })),
  groundSoil: pre(tex("models/camp_ground_picked.jpg")),
  // the baked shadows and night light come from LMDIR with the props' light (models/, or a preview bake's folder)
  // only the jeep's set is baked: ?jeep=none (a debug view) asks for neither, so no 404s, and the ground casts its shadows live (R2-217)
  groundShadow: JEEP === "expedition" ? pre(tex(`${LMDIR}camp_shadow_picked_expedition.png`)) : null,
  groundNight: JEEP === "expedition" ? pre(loadLightMap(`${LMDIR}camp_ground_night_picked_expedition.png`).catch(() => null)) : null,   // only the jeep's set has a night bake
};
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(S.fog[0], S.fog[1]);
// the field of view is input.js setFov's (58 degrees, 70 on a tall phone screen, set again on every resize); things beyond 80 m are not drawn
// (far 80 m: from the end of the jeep's track, about 30 m out, the backdrop on the far side of the camp is 60 m away, review R2-179)
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80);
const hemi = new THREE.HemisphereLight(S.hemi[0], S.hemi[1], S.hemi[2]); scene.add(hemi);   // the sky light; daylight.js dims and tints it by the hour
const sun = new THREE.DirectionalLight(S.sun[0], S.sun[1]); sun.position.copy(SUN); scene.add(sun);

const uTime = { value: 0 };
const uNight = { value: 0 };   // how far the night is in (0 day .. 1 rested; main.js sets it from the dusk): the baked night light, the ground, the operator's mood (R2-129)
// the camp's pace: fast runs the sloths' day and the jeep seats that many times as fast (unset: 1). The move lab (lab.js) sets it,
// and the tools through window.__campFast (debug.js)
const pace = { fast: undefined };
const hex = (n) => "#" + n.toString(16).padStart(6, "0");

// a base64 model (or the .glb where the host serves binary files, fetchBytes): a download that fails (a 404, a server error)
// throws an error naming the file, so camp.html's loading card says it did not load instead of the parser failing on an
// error page (review R2-058)
async function glb(url) {
  const bin = await fetchBytes(url);
  return new Promise((ok, err) => new GLTFLoader().parse(bin.buffer, "", ok, err));
}

export { $, D, DETAIL, JEEP, KEYS, LIVED, LMDIR, OPT, PRE, S, camera, hemi, hex, renderer, rng, scene, pace, store, sun, uNight, uTime, wireSettings };
