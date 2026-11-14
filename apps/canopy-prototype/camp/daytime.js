// Canopy Camp time of day: the hour set, the hour the light shows, and the day cycle, with the ⚙️ menu's time slider and
// Day cycle button. The clock props (clock.js) set the hour too. The light (daylight.js) follows `shown`, which eases forward
// to `set` (dayStep, about 3 h a second), so moving the slider from noon to night passes through golden hour, and from night
// to morning through the dawn mist, and a clock can draw its hands from `shown` and they spin round while the sky changes.
// With the cycle on, a day takes 12 minutes (Adriaen 2026-11-12: the slider replaced the Rest button, and the cycle is optional).
// It starts from ?time= and ?cycle=, or what was saved (core.js OPT), and saves each change under KEYS.time and KEYS.cycle.
//   day             { set, shown, cycle, setHour(h, jump), setCycle(on), listeners }: state only, nothing on the page is
//                   touched when this file is imported
//   wireTimeMenu()  joins the slider, the clock beside it and the Day cycle button to `day`; main.js calls it once
//   dayStep(dt)     each frame: moves the hour on and returns the hour shown
import { $, KEYS, OPT, store } from "./core.js";

const HOUR_S = 30;   // seconds for one camp hour while the cycle runs
const day = {
  set: OPT.time, shown: OPT.time,
  cycle: OPT.cycle,
  listeners: [],
  // set the hour (0..24); `jump` skips the easing (checks)
  setHour(h, jump = false) { this.set = ((h % 24) + 24) % 24; if (jump) this.shown = this.set; store.set(KEYS.time, this.set.toFixed(2)); this.changed(); },
  setCycle(on) { this.cycle = on; store.set(KEYS.cycle, on ? "on" : "off"); this.changed(); },
  changed() { for (const f of this.listeners) f(); },
};
// the ⚙️ menu: the slider and the clock beside it show the hour set, whoever set it. main.js calls this once every module
// has loaded, where it did the wiring itself before, so a page without the menu can still import the day's state
const clockText = (h) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60 / 15) * 15).padStart(2, "0")}`;
const showTime = () => { $("time").value = String(day.set); $("clock").textContent = clockText(day.set); $("cycle").textContent = "Day cycle: " + (day.cycle ? "on" : "off"); };
function wireTimeMenu() {
  day.listeners.push(showTime);   // the clock prop (clock.js) sets the hour too
  $("time").oninput = () => day.setHour(Number($("time").value));
  $("cycle").onclick = () => day.setCycle(!day.cycle);
  showTime();
}

// each frame (main.js): the cycle moves the hour set on, saving it and telling the listeners every 2 s; the hour shown
// eases after the hour set. Returns the hour shown.
let clockTick = 0;
function dayStep(dt) {
  if (day.cycle) { day.set = (day.set + dt / HOUR_S) % 24; if ((clockTick += dt) > 2) { clockTick = 0; day.setHour(day.set); } }
  { const ahead = (day.set - day.shown + 24) % 24; day.shown = (day.shown + Math.min(ahead, dt * 3)) % 24; }   // always forward, like a day
  return day.shown;
}
export { day, dayStep, wireTimeMenu };
