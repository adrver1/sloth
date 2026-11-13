// Canopy Camp HUD: the toast message and tap picking (a ray from the screen into a list of objects).
import * as THREE from "three";
import { $, camera } from "./core.js";

let toastT;
function toast(txt) { const t = $("toast"); t.textContent = txt; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1600); }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickAt(x, y, list) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObjects(list, false)[0]; }
const stickV = new THREE.Vector2();   // the phone stick (input.js sets it, the player walks by it)
const keys = new Set();

export { keys, pickAt, ray, stickV, toast };
