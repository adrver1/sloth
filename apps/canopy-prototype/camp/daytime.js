// Canopy Camp time of day: the hour set, the hour the light shows, and the day cycle, shared by the ⚙️ slider (main.js) and
// the clock prop (clock.js). The light follows `shown`, which eases forward to `set` (main.js, about 3 h a second), so a clock
// can draw its hands from `shown` and they spin round while the sky changes.
import { qs, store } from "./core.js";

let set = Number(qs.get("time") ?? store.get("canopy-time") ?? 12); if (!(set >= 0 && set < 24)) set = 12;
const day = {
  set, shown: set,
  cycle: qs.has("cycle") ? qs.get("cycle") !== "0" : store.get("canopy-cycle") === "on",
  listeners: [],
  // set the hour (0..24); `jump` skips the easing (checks)
  setHour(h, jump = false) { this.set = ((h % 24) + 24) % 24; if (jump) this.shown = this.set; store.set("canopy-time", this.set.toFixed(2)); this.changed(); },
  setCycle(on) { this.cycle = on; store.set("canopy-cycle", on ? "on" : "off"); this.changed(); },
  changed() { for (const f of this.listeners) f(); },
};
export { day };
