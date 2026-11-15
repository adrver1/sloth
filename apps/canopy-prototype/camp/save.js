// Canopy Camp save: one localStorage key (core.js KEYS.save, "canopy-camp-save") that holds the camp's lived state, one part per owner, so a
// reload (or the trip to the karaoke stage and back) carries on where you left off. Owners: operator (his lines still to come),
// sloths (sloth/saved.js), trip (the karaoke trip). Settings (detail, time, weather, light map) keep their own keys in core.js.
//   load("sloths") -> the part as saved, or null;  save("sloths", data) -> written soon (batched, and on page hide).
//   flush() -> everything saved is written now (trip.js, before the page goes to the karaoke stage).
//   track("sloths", snap) -> snap() is called for a fresh copy of the part whenever the page is hidden or left, so a value
//                            that changes all the time (a nap's seconds still to go) need not be saved each time it changes
//                            (review R2-081)
// To start the camp fresh, remove the key from localStorage.
import { KEYS } from "./core.js";

const KEY = KEYS.save, V = 1;
let all = {};
try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d?.v === V && d.parts) all = d.parts; } catch {}
let due = 0;
const snaps = {};                                   // part -> its snapshot function (track)
function flush() { due = 0; try { localStorage.setItem(KEY, JSON.stringify({ v: V, at: Date.now(), parts: all })); } catch {} }
const load = (part) => all[part] ?? null;
function save(part, data) { all[part] = data; if (!due) due = setTimeout(flush, 500); }
function track(part, snap) { snaps[part] = snap; }
function hide() {                                   // the page is hidden or left: fresh copies of the tracked parts, written now
  const parts = Object.keys(snaps); if (!due && !parts.length) return;
  clearTimeout(due); for (const k of parts) all[k] = snaps[k](); flush();
}
addEventListener("pagehide", hide);
document.addEventListener("visibilitychange", () => document.hidden && hide());
export { flush, load, save, track };
