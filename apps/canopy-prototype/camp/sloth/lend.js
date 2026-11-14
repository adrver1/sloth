// Canopy Camp sloths, borrowing one for a while (the operator picks one up to cuddle or play: operator.js, through
// sloth/hooks.js slothLife): only one on the ground (state.js LENDABLE), or Sunny on its log. While lent its phase is "held": its day, errands and
// greetings stop; its clip, blinks and fur keep going.
//   lend(s, who, opt)       who takes s; false when it can't be borrowed now. It gives up its place at the table, its card
//                           game, its s'more and its home claim, and wakes (opt.asleep: it sleeps on in his arms)
//   giveBack(s, at, yaw)    s is put down on the ground at `at`, facing yaw, and sits there a moment before going home
import { rng, scene } from "../core.js";
const { R } = rng("sloths");
import { release } from "../places.js";
import { LENDABLE, camp, setTrip } from "./state.js";
import { play } from "./clips.js";
import { yawQ } from "./poses.js";
import { quitGame } from "./cards.js";
import { stopSmore } from "./smore.js";
import { wakeUp } from "./naps.js";
import { releaseHome } from "./spots.js";

function lend(s, who, opt = {}) {
  const ph = s.trip?.phase; if (!camp.includes(s) || s.gift?.clip || !(LENDABLE.has(ph) || (ph === "home" && s.spot.bench))) return false;
  if (s.trip.slot?.key && s.trip.slot.who === s) { s.trip.slot.who = null; release(s.trip.slot.key, s); }
  quitGame(s);   // its card game ends: the other one goes home
  stopSmore(s); wakeUp(s); s.once = null;
  releaseHome(s); s.spot.home = false;
  scene.attach(s.o); setTrip(s, "held", { yaw: 0, who }); if (opt.asleep) { s.asleep = true; s.eyes(true); } return true;
}
function giveBack(s, at, yaw) {
  if (s.trip?.phase !== "held") return;
  if (s.asleep) wakeUp(s);   // it slept on in his arms
  scene.attach(s.o); s.o.position.set(at.x, 0, at.z); s.o.quaternion.copy(yawQ(yaw)); s.o.scale.setScalar(s.sc);
  setTrip(s, "rest", { yaw, dur: R(1.5, 3) }); play(s, "idle", 0.6);
}

export { giveBack, lend };
