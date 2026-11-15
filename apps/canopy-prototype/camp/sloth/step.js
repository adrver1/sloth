// Canopy Camp sloths, the camp step: each frame, what every named sloth is doing, by the phase of its trip (s.trip.phase;
// state.js PHASES lists them with what each one is):
//   home      in its spot (day.js homeStep)          walk     on the ground along a path (walk.js)
//   greet     saying hello (walk.js)                 eat      at a food place, or playing cards there (eating.js)
//   fix       at the jeep's engine (fix.js)          rest     sitting in the clearing (day.js)
//   exit      out through the jeep's door (wayOut.js)  door     in through it (wayIn.js)
//   slide, glide   the two generic moves every other step of the way in and out is made of (moves.js)
//   held      borrowed (lend.js): nothing here moves it
//   campStep(dt)         each frame (main.js). Does nothing with ?campsloths=0. (The log seat you sit on is claimed by
//                        linger.js, so no sloth sits on you.)
// core.js pace (window.__campFast for the tools) speeds the sloths' day up for checks; the move lab slows it, and pauses it
// with 0 (the camp sloths' clips, trips and z's stop; blinks, the look at you and the wild sloths' clips go on).
import { OPT, pace } from "../stage.js";
import { SL, camp, wild } from "./state.js";
import { glideStep, slideStep } from "./moves.js";
import { brush } from "./spots.js";
import { greetStep, walkStep } from "./walk.js";
import { napStep, zStep } from "./naps.js";
import { fruitStep } from "./table.js";
import { eatStep } from "./eating.js";
import { giftFly, giftStep } from "./gifts.js";
import { stopSmore } from "./smore.js";
import { fixStep } from "./fix.js";
import { exitStep } from "./wayOut.js";
import { doorShutStep, doorStep } from "./wayIn.js";
import { homeStep, restStep } from "./day.js";
import { keep } from "./saved.js";

// each phase's step (the phases and what they are: state.js PHASES), called as step(s, T, sd, spot); "home" is called by
// name below (it counts who is out), "held" has none
const STEP = { walk: walkStep, greet: greetStep, eat: eatStep, fix: fixStep, rest: restStep, exit: exitStep, door: doorStep,
  slide: slideStep, glide: glideStep };

function campStep(dt) {
  if (!OPT.campsloths) return;
  keep(dt);
  const fast = pace.fast ?? 1, sd = dt * fast;   // ?? not ||: the lab's Pause and Step set 0 (review R2-044)
  doorShutStep(sd);
  let out = 0; for (const s of camp) if (s.trip.phase !== "home") out++;
  for (const s of camp) {
    if (fast !== 1) s.mixer.update(sd - dt);   // the clip at the same pace (slow motion and pause in the move lab too)
    s.trip.t += sd; s.greetCD -= sd;
    if (s.once && s.act.time >= s.act.getClip().duration - 0.02) { const f = s.once; s.once = null; f(); }   // a stretch or a bite done
    // its trip and spot as they are now: the clip's end may have started a new phase (setTrip makes a fresh record), and
    // the step below may start another, which the checks after it read
    const spot = s.spot, T = s.trip;
    if (s.gift?.clip) giftStep(s, sd);   // eating what you gave it: its day waits until it's done
    else if (T.phase === "home") out += homeStep(s, sd, spot, out);
    else STEP[T.phase]?.(s, T, sd, spot);
    if (s.trip.phase !== "home" && s.smore) stopSmore(s);
    if (s.gift && !s.gift.clip) giftFly(s, sd);
    zStep(s, sd);
    if (s.spot.line && s.trip.phase === "home") brush?.(s.o.position, false, sd);   // the towel swings back, at the sloths' pace
    // the hit sphere and the point hearts and words fly to follow the sloth
    s.o.getWorldPosition(s.box.position).y += 0.25 * s.sc / SL; s.p.copy(s.box.position);
  }
  for (const s of wild) { napStep(s, sd); if (s.gift) giftFly(s, sd); zStep(s, sd); }   // a wild one munches what you give it
  fruitStep(sd);
}

export { campStep };
