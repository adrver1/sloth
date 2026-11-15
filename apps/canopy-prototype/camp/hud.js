// Canopy Camp and Summit Cabin HUD (both levels use it: Adriaen 2026-11-15, the same controls everywhere): the toast message
// (the page's #toast element) and tap picking (a ray from the screen into a list of objects, through the player's camera).
// Exports toast(text), pickAt(x, y, objects) and its ray, view (the camera picking uses: player.js setPlayer sets it), and what
// input.js fills in for player.js: keys (held down) and stickV (the phone stick).
import * as THREE from "three";

const view = { camera: null };
let toastT;
function toast(txt) { const t = document.getElementById("toast"); if (!t) return; t.textContent = txt; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1600); }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickAt(x, y, list) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, view.camera); return ray.intersectObjects(list, false)[0]; }
const stickV = new THREE.Vector2();   // the phone stick (input.js sets it, the player walks by it)
const keys = new Set();

export { keys, pickAt, ray, stickV, toast, view };
