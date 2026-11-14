// Canopy Camp core: URL options, detail level, the renderer, scene, camera and lights, the named seeded random streams (rng), every download
// started at once (PRE, camp review P2) and the look's leaf material (the small shared helpers are in util.js). Loaded first by camp.html via main.js.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { fetchBytes, initKtx, loadLightMap } from "../bakedlight.js";
import { SUN } from "./layout.js";

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
//   lab      (present)                     absent                            labButton.js (opens the move lab, lab.js, at the start)
//   touch    present or not                on a phone (a coarse pointer)     input.js (the phone stick and its hint, on a desktop too)
//   sound    0                             saved, else on                    audio/context.js (0 starts muted)
//   station  drift | campfire | kalimba | lullaby   saved, else drift        audio/context.js (checks it against its stations)
//   fur      1 | 0                         1                                 fur.js reads location itself (index.html and nooks.html share it)
const qs = new URLSearchParams(location.search);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };   // a number, or null when it is missing or not a number
// localStorage keys: detail, lm (core.js), weather (weather.js), time and cycle (daytime.js), save (save.js: the camp's lived
// state, one part per owner), audio (audio.js and audio/context.js: volume, muted, music, its volume and the station, as one JSON object).
const KEYS = { detail: "canopy-detail", lm: "canopy-lm", weather: "canopy-weather", time: "canopy-time", cycle: "canopy-cycle", save: "canopy-camp-save", audio: "canopy-audio" };
// ---------------------------------------------------------------- window.__ names on camp.html (review C2, crosscut-03/04, boot-04)
// The modules talk through imports only. The window.__ names are for the headless tools (camp-probe.cjs, camp-replay.cjs,
// camp-scenarios.cjs and props/shadow/export_casters.cjs) and are all set in debug.js, which lists them with their readers.
// the look: Mossy real, the one picked. The Painterly and Low-poly looks were archived on 2026-11-12 (camp review; Adriaen):
// they live on in index.html (the forest look prototype), and camp.html with all three, with their branches in forest.js,
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
  time: (() => { const h = Number(qs.get("time") ?? store.get(KEYS.time) ?? 12); return h >= 0 && h < 24 ? h : 12; })(),
  cycle: qs.has("cycle") ? qs.get("cycle") !== "0" : store.get(KEYS.cycle) === "on",
  pos: (() => { const p = (qs.get("pos") || "").split(",").map(parseFloat); return p.length === 2 && p.every(Number.isFinite) ? p : null; })(),   // the start view: null (or a value that isn't a number) keeps player.js's own
  yaw: num(qs.get("yaw")),
  pitch: num(qs.get("pitch")),
  campsloths: qs.get("campsloths") !== "0",
  slothmat: qs.get("slothmat") === "old" ? "old" : "lambert",
  lab: qs.has("lab"),
  touch: qs.has("touch"),
  sound: qs.get("sound") !== "0",
  station: qs.get("station"),
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
// the ⚙️ menu's own buttons: main.js calls wireSettings() once. One ⚙️ button opens the detail and light-map choices (the old
// row took a quarter of a phone screen); Detail and Light each step to the next choice, keep it and reload.
function wireSettings() {
  $("menu").onclick = () => { const o = $("opts"); o.hidden = !o.hidden; $("menu").setAttribute("aria-expanded", String(!o.hidden)); };
  $("detail").textContent = "Detail: " + DETAIL[0].toUpperCase() + DETAIL.slice(1);
  $("detail").onclick = () => { store.set(KEYS.detail, LEVELS[(LEVELS.indexOf(DETAIL) + 1) % 3]); location.reload(); };
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
// Every model, the light maps and the ground mask start loading here, while the forest below is grown, instead of one after
// another further down. Each section awaits its own entry in PRE (null when it isn't shown). The loading card counts them.
const LIVED = OPT.lived;   // ?lived=0 hides the lived-in props to compare
let loadN = 0, loadDone = 0;
const pre = (p) => { if (!p) return null; loadN++; const tick = () => { $("loadbar").style.width = `${4 + 86 * ++loadDone / loadN}%`; }; p.then(tick, tick); return p; };
initKtx(renderer);
// the 4K maps (?lm=4k, local only) have no KTX2 copy (bake_all.py converts the 2K and 1K maps), so they go straight to the PNG
const lmLoad = async (n) => { const t = await loadLightMap(`models/${n}_${LMSET}.png`, { ktx: LMSET !== "4k" }).catch(() => loadLightMap(`models/${n}_2k.png`));
  t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.channel = 1; t.anisotropy = 4; return t; };
const PRE = {
  sloth: pre(glb("models/sloth.txt")),
  operator: OPT.op ? pre(glb("models/operator.txt")) : null,                 // the bearded operator (camp/operator.js)
  operatorAnims: OPT.op ? pre(glb("models/operator_anims.txt")) : null,
  lm: pre(Promise.all([lmLoad("camp_lm"), lmLoad("camp_lm_sun")])),
  props: pre(glb("models/camp_picked_lm.txt")),
  lived: LIVED ? pre(glb("models/lived.txt")) : null,
  laundry: LIVED ? pre(glb("models/laundry.txt")) : null,
  fire: pre(glb("models/fire.txt")),
  jeep: JEEP !== "none" ? pre(glb(`models/jeep_${JEEP}.txt`)) : null,
  jeepLod: JEEP === "expedition" ? pre(glb("models/jeep_expedition_lod.txt").catch(() => null)) : null,
  groundMask: pre(new Promise((ok) => { const im = new Image(); im.onload = () => ok({ mask: im, soil: "models/camp_ground_picked.jpg" }); im.onerror = () => ok(null); im.src = "models/camp_ground_picked_mask.png"; })),
};
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(S.fog[0], S.fog[1]);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
scene.add(new THREE.HemisphereLight(S.hemi[0], S.hemi[1], S.hemi[2]));
const sun = new THREE.DirectionalLight(S.sun[0], S.sun[1]); sun.position.copy(SUN); scene.add(sun);

const uTime = { value: 0 };
// the camp's pace: fast runs the sloths' day and the jeep seats that many times as fast (unset: 1). The move lab (lab.js) sets it,
// and the tools through window.__campFast (debug.js)
const pace = { fast: undefined };
const leafMat = (opts, sway) => {
  const m = new THREE.MeshLambertMaterial(opts);
  // The sway is a uniform, not a number in the shader text: the hook's source is the same for every sway, so three gives
  // every leaf material one program, and each material keeps its own amount (review props-12).
  const uSway = { value: sway };
  if (sway) m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uSway = uSway;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uSway;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float w = sin(uTime * 1.4 + ip.x * 1.7 + ip.z * 1.3) + 0.5 * sin(uTime * 2.3 + ip.y * 2.1);
        transformed += vec3(1.0, 0.4, 0.6) * (w * uSway) * (0.5 + position.y);
        #endif`);
  };
  return m;
};
const hex = (n) => "#" + n.toString(16).padStart(6, "0");

async function glb(url) {   // url: the model's base64 .txt; fetchBytes takes the .glb instead where the host serves binary files
  const bin = await fetchBytes(url);
  return new Promise((ok, err) => new GLTFLoader().parse(bin.buffer, "", ok, err));
}

export { $, D, DETAIL, JEEP, KEYS, LIVED, OPT, PRE, S, camera, hex, leafMat, renderer, rng, scene, pace, store, sun, uTime, wireSettings };
