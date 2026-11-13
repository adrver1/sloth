// Canopy Camp core: URL options, detail level, the renderer, scene, camera and lights, the seeded random stream, every download
// started at once (PRE, camp review P2) and the look's leaf material (the small shared helpers are in util.js). Loaded first by camp.html via main.js.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { b64bytes, initKtx, loadLightMap } from "../bakedlight.js";
import { canvasTex, sstep } from "./util.js";
import { SUN } from "./layout.js";

// ---------------------------------------------------------------- URL options and saved settings, all parsed here (review boot-17, crosscut-15)
// camp.html?name=value. "saved" is the ⚙️ menu's choice, kept per viewer in localStorage under KEYS.
//   option   values                        default                           read by
//   detail   low | medium | high           saved, else medium                core.js (D: counts, effects, resolution), main.js (DETAIL)
//   lm       2k | 1k | 4k (4k: local only) saved, else 1k on phones, 2k     core.js (the light maps)
//   jeep     expedition | none             expedition                        forest.js, terrain.js, jeep.js, campLife.js (JEEP)
//   seed     a number                      7                                 core.js (the shared stream), forest.js (its restart)
//   lived    1 | 0                         1                                 core.js, campProps.js, campLife.js (LIVED)
//   op       1 | 0                         1                                 core.js (the operator's downloads); operator.js reads qs itself
//   weather  clear | rain | changing       saved, else clear                 weather.js (checks it against its modes)
//   time     an hour, 0 up to 24 (21.5)    saved, else 12                    daytime.js (the hour set; anything else counts as 12)
//   cycle    1 | 0                         saved, else 0                     daytime.js (the day runs on by itself)
//   pos      x,z in metres                 by the fire (player.js)           main.js (where you stand at the start)
//   yaw      radians                       facing the fire (player.js)       main.js (where you look at the start)
//   pitch    radians                       0.08 (player.js)                  main.js
//   fur      1 | 0                         1                                 fur.js reads location itself (index.html and nooks.html share it)
// still read with qs in the files the open PRs change (move them here once those land): touch (input.js), campsloths, slothmat,
// lab (sloths.js), op once more (operator.js), sound, station (audio.js).
const qs = new URLSearchParams(location.search);
// localStorage keys: detail, lm (core.js), weather (weather.js), time and cycle (daytime.js), save (save.js: the camp's lived
// state, one part per owner). audio.js keeps the sound settings under "canopy-audio", which it still types itself (open PRs).
const KEYS = { detail: "canopy-detail", lm: "canopy-lm", weather: "canopy-weather", time: "canopy-time", cycle: "canopy-cycle", save: "canopy-camp-save" };
// ---------------------------------------------------------------- window.__ globals on camp.html, in one list (review C2, crosscut-03/04, boot-04)
// API: modules that the open PRs change still read these; each is an alias of the exported object named here.
//   __camp       campProps.js CAMP        sloths.js, operator.js (and export_casters.cjs, below)
//   __jeep       jeep.js jeepApi          sloths.js, input.js
//   __laundry    layout.js LAUNDRY        sloths.js (set by campProps.js only when the line is shown)
//   __acts       campLife.js acts         operator.js
//   __groundHeight terrain.js            main.js
//   __campLife   sloths.js (its life)     input.js, operator.js, lab.js
//   __me         main.js (player.js me)   sloths.js (the player's seat)
//   __lab, __labStep, __campFast         sloths.js and the move lab (lab.js); camp-replay.cjs sets __campFast too
// tool contract: tools/camp-probe.cjs, tools/camp-replay.cjs and props/shadow/export_casters.cjs read these; keep the names.
//   __ready, __scene, __stats (main.js)                 all three tools
//   __ground (campLife.js), __glade (main.js), __deadwood (deadwood.js), __terrainGrid (terrain.js)   export_casters.cjs (the bake's layout)
//   __time, __boop, __feed, __stick (main.js), __sit (linger.js), __weather (weather.js)   camp-replay.cjs's tour
// debug hooks for checks by hand in the browser console: __rest, __face, __slothS (main.js), __errand, __path, __spots,
// __sloth (sloths.js), __op (operator.js).
// the look: Mossy real, the one picked. The Painterly and Low-poly looks were archived on 2026-11-12 (camp review; Adriaen):
// they live on in index.html (the forest look prototype), and camp.html with all three is in git history before commit
// "Canopy camp: start every download at once" (the looks were archived there). Their branches below are dead code until the forest moves to its own module.
const LOOK = "moss";
const $ = (id) => document.getElementById(id);
// settings: one ⚙️ button opens the detail and light-map choices (the old row took a quarter of a phone screen)
$("menu").onclick = () => { const o = $("opts"); o.hidden = !o.hidden; $("menu").setAttribute("aria-expanded", String(!o.hidden)); };

// detail level, kept per viewer: how many leaves, ferns, fur shells and effects, and the resolution cap
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const LEVELS = ["low", "medium", "high"];
const LMS = ["2k", "1k"], LMNAME = { "4k": "4K map", "2k": "2K map", "1k": "1K map" };
const OPT = {
  detail: LEVELS.includes(qs.get("detail")) ? qs.get("detail") : LEVELS.includes(store.get(KEYS.detail)) ? store.get(KEYS.detail) : "medium",
  lm: [...LMS, "4k"].includes(qs.get("lm")) ? qs.get("lm") : LMS.includes(store.get(KEYS.lm)) ? store.get(KEYS.lm)
    : matchMedia("(pointer: coarse)").matches ? "1k" : "2k",   // phones start on the 1K maps (review P1: hard to tell apart at phone size, a quarter of the memory)
  jeep: qs.get("jeep") === "none" ? "none" : "expedition",
  seed: Number(qs.get("seed") || 7),
  lived: qs.get("lived") !== "0",
  op: qs.get("op") !== "0",
  weather: qs.get("weather"),
  time: (() => { const h = Number(qs.get("time") ?? store.get(KEYS.time) ?? 12); return h >= 0 && h < 24 ? h : 12; })(),
  cycle: qs.has("cycle") ? qs.get("cycle") !== "0" : store.get(KEYS.cycle) === "on",
  pos: qs.has("pos") ? qs.get("pos").split(",").map(Number) : null,   // the start view: null keeps player.js's own
  yaw: qs.has("yaw") ? +qs.get("yaw") : null,
  pitch: qs.has("pitch") ? +qs.get("pitch") : null,
};
const DETAIL = OPT.detail;
const D = { low: { leaves: 0.55, ferns: 0.5, fx: 0, shells: 2, pr: 1.25, aa: false },
            medium: { leaves: 1, ferns: 1, fx: 1, shells: 3, pr: 1.75, aa: LOOK !== "moss" },
            high: { leaves: 1.6, ferns: 1.7, fx: 1.5, shells: 4, pr: 2, aa: true } }[DETAIL];
// the props: "Our camp" (the picked set) only. Storybook, Rustic, Jungle and the first code-drawn shapes are archived in
// props/camp/archive/ (camp review, Adriaen 2026-11-12); PROPS stays so the checks below read the same.
const PROPS = "picked";
$("detail").textContent = "Detail: " + DETAIL[0].toUpperCase() + DETAIL.slice(1);
// the jeep: the Expedition (Adriaen 2026-11-12; the Toy and Camper styles are in props/jeep/archive/); ?jeep=none hides it
const JEEP = OPT.jeep;
// the picked props' baked light: a 2K or 1K light map (?lm=4k also works locally; 4k is too big to publish)
const LMSET = OPT.lm;
$("lm").textContent = "Light: " + LMNAME[LMSET];
$("lm").style.display = PROPS === "picked" ? "" : "none";
const CABIN = "live";   // the jeep's cabin light is live (one shadowed spot light): it looked much better than the bake (Adriaen 2026-11-12)
$("lm").onclick = () => { store.set(KEYS.lm, LMS[(LMS.indexOf(LMSET) + 1) % LMS.length]); const u = new URL(location.href); u.searchParams.delete("lm"); location.replace(u); };
$("detail").onclick = () => { store.set(KEYS.detail, LEVELS[(LEVELS.indexOf(DETAIL) + 1) % 3]); location.reload(); };

// seeded random, so all three looks grow the same tree and hide sloths in the same spots
let seed = OPT.seed;
const setSeed = (n) => { seed = n; };   // the forest restarts the seeded stream for its layout
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const R = (a, b) => a + rnd() * (b - a);

// ---------------------------------------------------------------- look settings (structure differs, not just colour)
const S = {
  moss:  { sky: ["#dfe9d2", "#a9c39a", "#5d7d58"], fog: [0x9fb592, 0.055], bark: [0x5b4636, 0x3a2c22], moss: 0x6f8f3a, mossAmt: 0.75,
           leaf: [0x4f7f34, 0x6b9a3c, 0x3d6a2f, 0x85a845], hemi: [0xf4f0dc, 0x3b4a2a, 1.6], sun: [0xffe7c0, 2.0], rays: 0.3, motes: 260, flat: false, slothTint: 0xc9d9a6 },
  paint: { sky: ["#fde8cf", "#cfe6c4", "#8fb889"], fog: [0xcfe0c0, 0.045], bark: [0x9a6b4c, 0x6e4a36], moss: 0x9cc46a, mossAmt: 0.45,
           leaf: [0x7cc06a, 0x9bd27a, 0x5fae63, 0xb7dd85], hemi: [0xfff6e6, 0x6e8f62, 2.0], sun: [0xffe2b8, 1.6], rays: 0.16, motes: 160, flat: false, slothTint: 0xe2ecc4 },
  low:   { sky: ["#bfeaff", "#d9f5e8", "#a8dca0"], fog: [0xc8eedd, 0.032], bark: [0x9b6440, 0x7a4b30], moss: 0x8bcf5a, mossAmt: 0.35,
           leaf: [0x5cc45a, 0x7fd860, 0x45b35a, 0xa3e36a], hemi: [0xffffff, 0x7fb070, 2.2], sun: [0xfff3dc, 1.5], rays: 0, motes: 0, flat: true, slothTint: 0xdaf0c0 },
}[LOOK];

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas: $("c"), antialias: D.aa, powerPreference: "high-performance" });
let pr = Math.min(devicePixelRatio, D.pr);
renderer.setPixelRatio(pr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// ---------------------------------------------------------------- downloads, all started at once (camp review P2, 2026-11-12)
// Every model, the light maps and the ground mask start loading here, while the forest below is grown, instead of one after
// another further down. Each section awaits its own entry in PRE (null when it isn't shown). The loading card counts them.
const LIVED = OPT.lived;   // ?lived=0 hides the lived-in props to compare
let loadN = 0, loadDone = 0;
const pre = (p) => { if (!p) return null; loadN++; const tick = () => { $("loadbar").style.width = `${4 + 86 * ++loadDone / loadN}%`; }; p.then(tick, tick); return p; };
initKtx(renderer);
const lmLoad = async (n) => { const t = await loadLightMap(`models/${n}_${LMSET}.png`).catch(() => loadLightMap(`models/${n}_2k.png`));
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
  groundMask: pre(new Promise((ok) => { const im = new Image(); im.onload = () => ok({ mask: im, soil: `models/camp_ground_${PROPS}.jpg` }); im.onerror = () => ok(null); im.src = `models/camp_ground_${PROPS}_mask.png`; })),
};
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(S.fog[0], S.fog[1]);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
scene.add(new THREE.HemisphereLight(S.hemi[0], S.hemi[1], S.hemi[2]));
const sun = new THREE.DirectionalLight(S.sun[0], S.sun[1]); sun.position.copy(SUN); scene.add(sun);

const uTime = { value: 0 };
const leafMat = (opts, sway) => {
  const m = S.flat ? new THREE.MeshLambertMaterial({ flatShading: true, ...opts }) : new THREE.MeshLambertMaterial(opts);
  if (sway) m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float w = sin(uTime * 1.4 + ip.x * 1.7 + ip.z * 1.3) + 0.5 * sin(uTime * 2.3 + ip.y * 2.1);
        transformed += vec3(w * ${sway.toFixed(3)}, w * ${(sway * 0.4).toFixed(3)}, w * ${(sway * 0.6).toFixed(3)}) * (0.5 + position.y);
        #endif`);
  };
  return m;
};
const hex = (n) => "#" + n.toString(16).padStart(6, "0");

async function glb(url) {
  const bin = b64bytes((await (await fetch(url)).text()).trim());
  return new Promise((ok, err) => new GLTFLoader().parse(bin.buffer, "", ok, err));
}

export { $, CABIN, D, DETAIL, JEEP, KEYS, LIVED, LOOK, OPT, PRE, PROPS, R, S, camera, hex, leafMat, renderer, rnd, scene, setSeed, store, sun, uTime };
export { qs };   // back-compat: input.js, main.js, operator.js and sloths.js still read their own options with it (see the table above), and so do audio.js and daytime.js on the open PRs #15/#16
export { canvasTex, sstep };   // back-compat: sloths.js still imports these two from here, and car.js, clock.js and radio.js (open PR #16) import canvasTex (util.js is their home)
