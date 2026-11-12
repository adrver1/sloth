// Canopy Camp core: URL options, detail level, the renderer, scene, camera and lights, the seeded random stream, every download
// started at once (PRE, camp review P2) and the small helpers the other modules share. Loaded first by camp.html via main.js.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { initKtx, loadLightMap } from "../bakedlight.js";

const qs = new URLSearchParams(location.search);
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
const DETAIL = LEVELS.includes(qs.get("detail")) ? qs.get("detail") : LEVELS.includes(store.get("canopy-detail")) ? store.get("canopy-detail") : "medium";
const D = { low: { leaves: 0.55, ferns: 0.5, fx: 0, shells: 2, pr: 1.25, aa: false },
            medium: { leaves: 1, ferns: 1, fx: 1, shells: 3, pr: 1.75, aa: LOOK !== "moss" },
            high: { leaves: 1.6, ferns: 1.7, fx: 1.5, shells: 4, pr: 2, aa: true } }[DETAIL];
// the props: "Our camp" (the picked set) only. Storybook, Rustic, Jungle and the first code-drawn shapes are archived in
// props/camp/archive/ (camp review, Adriaen 2026-11-12); PROPS stays so the checks below read the same.
const PROPS = "picked";
$("detail").textContent = "Detail: " + DETAIL[0].toUpperCase() + DETAIL.slice(1);
// the jeep: the Expedition (Adriaen 2026-11-12; the Toy and Camper styles are in props/jeep/archive/); ?jeep=none hides it
const JEEP = qs.get("jeep") === "none" ? "none" : "expedition";
// the picked props' baked light: a 2K or 1K light map, or the older vertex colours (?lm=4k also works locally; 4k is too big to publish)
const LMS = ["2k", "1k"], LMNAME = { "4k": "4K map", "2k": "2K map", "1k": "1K map" };
const LMSET = [...LMS, "4k"].includes(qs.get("lm")) ? qs.get("lm") : LMS.includes(store.get("canopy-lm")) ? store.get("canopy-lm")
  : matchMedia("(pointer: coarse)").matches ? "1k" : "2k";   // phones start on the 1K maps (review P1: hard to tell apart at phone size, a quarter of the memory)
$("lm").textContent = "Light: " + LMNAME[LMSET];
$("lm").style.display = PROPS === "picked" ? "" : "none";
const CABIN = "live";   // the jeep's cabin light is live (one shadowed spot light): it looked much better than the bake (Adriaen 2026-11-12)
$("lm").onclick = () => { store.set("canopy-lm", LMS[(LMS.indexOf(LMSET) + 1) % LMS.length]); const u = new URL(location.href); u.searchParams.delete("lm"); location.replace(u); };
$("detail").onclick = () => { store.set("canopy-detail", LEVELS[(LEVELS.indexOf(DETAIL) + 1) % 3]); location.reload(); };

// seeded random, so all three looks grow the same tree and hide sloths in the same spots
let seed = Number(qs.get("seed") || 7);
const setSeed = (n) => { seed = n; };   // the forest restarts the seeded stream for its layout
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const R = (a, b) => a + rnd() * (b - a);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
const LIVED = qs.get("lived") !== "0";   // ?lived=0 hides the lived-in props to compare
let loadN = 0, loadDone = 0;
const pre = (p) => { if (!p) return null; loadN++; const tick = () => { $("loadbar").style.width = `${4 + 86 * ++loadDone / loadN}%`; }; p.then(tick, tick); return p; };
initKtx(renderer);
const lmLoad = async (n) => { const t = await loadLightMap(`models/${n}_${LMSET}.png`).catch(() => loadLightMap(`models/${n}_2k.png`));
  t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.channel = 1; t.anisotropy = 4; return t; };
const PRE = {
  sloth: pre(glb("models/sloth.txt")),
  operator: qs.get("op") !== "0" ? pre(glb("models/operator.txt")) : null,                 // the bearded operator (camp/operator.js)
  operatorAnims: qs.get("op") !== "0" ? pre(glb("models/operator_anims.txt")) : null,
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
const sun = new THREE.DirectionalLight(S.sun[0], S.sun[1]); sun.position.set(-4, 10, 3); scene.add(sun);

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
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const hex = (n) => "#" + n.toString(16).padStart(6, "0");

async function glb(url) {
  const txt = (await (await fetch(url)).text()).trim(), bin = Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));
  return new Promise((ok, err) => new GLTFLoader().parse(bin.buffer, "", ok, err));
}

export { $, CABIN, D, DETAIL, JEEP, LIVED, LOOK, PRE, PROPS, R, S, camera, canvasTex, hex, leafMat, qs, renderer, rnd, scene, setSeed, sstep, store, sun, uTime };
