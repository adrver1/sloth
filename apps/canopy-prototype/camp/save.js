// Canopy Camp save: one localStorage key (core.js KEYS.save, "canopy-camp-save") that holds the camp's lived state, one part per owner, so a
// reload (or the trip to the karaoke stage and back) carries on where you left off. Owners: operator (his lines still to come),
// sloths (sloths.js), trip (the karaoke trip). Settings (detail, time, weather, light map) keep their own keys in core.js.
//   load("sloths") -> the part as saved, or null;  save("sloths", data) -> written soon (batched, and on page hide).
// To start the camp fresh, remove the key from localStorage.
import { KEYS } from "./core.js";

const KEY = KEYS.save, V = 1;
let all = {};
try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d?.v === V && d.parts) all = d.parts; } catch {}
let due = 0;
function flush() { due = 0; try { localStorage.setItem(KEY, JSON.stringify({ v: V, at: Date.now(), parts: all })); } catch {} }
const load = (part) => all[part] ?? null;
function save(part, data) { all[part] = data; if (!due) due = setTimeout(flush, 500); }
addEventListener("pagehide", () => due && (clearTimeout(due), flush()));
document.addEventListener("visibilitychange", () => document.hidden && due && (clearTimeout(due), flush()));
export { load, save };
