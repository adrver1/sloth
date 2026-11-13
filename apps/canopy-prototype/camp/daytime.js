// Canopy Camp time of day: the hour set, the hour the light shows, and the day cycle, shared by the ⚙️ slider (main.js) and
// the clock prop (clock.js). The light follows `shown`, which eases forward to `set` (main.js, about 3 h a second), so a clock
// can draw its hands from `shown` and they spin round while the sky changes.
// It starts from ?time= and ?cycle=, or what was saved (core.js OPT), and saves each change under KEYS.time and KEYS.cycle.
import { KEYS, OPT, store } from "./core.js";

const day = {
  set: OPT.time, shown: OPT.time,
  cycle: OPT.cycle,
  listeners: [],
  // set the hour (0..24); `jump` skips the easing (checks)
  setHour(h, jump = false) { this.set = ((h % 24) + 24) % 24; if (jump) this.shown = this.set; store.set(KEYS.time, this.set.toFixed(2)); this.changed(); },
  setCycle(on) { this.cycle = on; store.set(KEYS.cycle, on ? "on" : "off"); this.changed(); },
  changed() { for (const f of this.listeners) f(); },
};
export { day };
