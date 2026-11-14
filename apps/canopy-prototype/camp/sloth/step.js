// Canopy Camp sloths, the camp step: each frame, what every named sloth is doing, by the phase of its trip (s.trip.phase):
//   home      in its spot (day.js homeStep)          walk     on the ground along a path (walk.js)
//   greet     saying hello (walk.js)                 eat      at a food place, or playing cards there (eating.js)
//   fix       at the jeep's engine (fix.js)          rest     sitting in the clearing (day.js)
//   exit      out through the jeep's door (wayOut.js)
//   slide, glide   the two generic moves every way in and out is made of (moves.js)
//   door, clamber, climb, turn, line, rope, settle   the way into a spot (wayIn.js)
//   held      borrowed (lend.js): nothing here moves it
//   campStep(dt, seat)   each frame (main.js): seat is the log seat you are on (player.js me.seat) or null. Does nothing
//                        with ?campsloths=0.
//   findSeats()          looks up the three log seats (sloths.js, once the props are in)
// window.__campFast speeds the sloths' day up for checks (the move lab slows and pauses it the same way).
import { OPT, scene } from "../core.js";
import { claim, release } from "../places.js";
import { SL, camp, wild } from "./state.js";
import { glideStep, slideStep } from "./moves.js";
import { brush } from "./spots.js";
import { greetStep, walkStep } from "./walk.js";
import { napStep, zStep } from "./naps.js";
import { fruitStep, pois } from "./table.js";
import { eatStep } from "./eating.js";
import { giftFly, giftStep } from "./gifts.js";
import { stopSmore } from "./smore.js";
import { fixStep } from "./fix.js";
import { exitStep } from "./wayOut.js";
import { clamberStep, climbStep, doorStep, lineStep, ropeStep, settleStep, turnStep } from "./wayIn.js";
import { homeStep, restStep } from "./day.js";
import { keep } from "./saved.js";

// each phase's step, called as step(s, T, sd, spot); "home" is called by name below (it counts who is out), "held" has none
const PHASE = { walk: walkStep, greet: greetStep, eat: eatStep, fix: fixStep, rest: restStep, exit: exitStep, door: doorStep, clamber: clamberStep,
  slide: slideStep, glide: glideStep, climb: climbStep, turn: turnStep, line: lineStep, rope: ropeStep, settle: settleStep };

// you on a log seat by the fire (linger.js) hold it as "log:<i>" (Seat_<i>), so no one sits on you
let mySeat = -1, LOGS = [];
function findSeats() { LOGS = [0, 1, 2].map((i) => scene.getObjectByName(`Seat_${i}`)); }
function seatWatch(st) {                            // st: the seat you are on (player.js me.seat), or null
  let i = -1;
  if (st) { let best = 1.2; LOGS.forEach((o, k) => { if (o) { const d = Math.hypot(o.position.x - st.pos.x, o.position.z - st.pos.z); if (d < best) { best = d; i = k; } } }); }
  if (i === mySeat) return;
  const key = (k) => k === 0 ? "log:0:left" : `log:${k}`;   // Sunny's bench: you sit to its left (linger.js), Sunny keeps "log:0"
  if (mySeat >= 0) release(key(mySeat), "player");
  if (i >= 0) claim(key(i), "player");
  mySeat = i;
}
function campStep(dt, seat) {
  if (!OPT.campsloths) return;
  pois();   // the food places, made once the props are in (table.js)
  seatWatch(seat); keep();
  const fast = window.__campFast || 1, sd = dt * fast;
  let out = camp.filter((s) => s.trip.phase !== "home").length;
  for (const s of camp) {
    const spot = s.spot, T = s.trip;   // as they are now: a clip's end (s.once) may start a new trip, which waits for the next frame
    if (fast !== 1) s.mixer.update(sd - dt);   // the clip at the same pace (slow motion and pause in the move lab too)
    T.t += sd; s.greetCD -= sd;
    if (s.once && s.act.time >= s.act.getClip().duration - 0.02) { const f = s.once; s.once = null; f(); }   // a stretch or a bite done
    if (s.gift?.clip) giftStep(s);   // eating what you gave it: its day waits until it's done
    else if (T.phase === "home") out += homeStep(s, sd, spot, out);
    else PHASE[T.phase]?.(s, T, sd, spot);
    if (T.phase !== "home" && s.smore) stopSmore(s);
    if (s.gift && !s.gift.clip) giftFly(s, sd);
    zStep(s, dt);
    if (spot.line && T.phase === "home") brush?.(s.o.position, false, dt);   // the towel swings back
    // the hit sphere and the point hearts and words fly to follow the sloth
    s.o.getWorldPosition(s.box.position).y += 0.25 * s.sc / SL; s.p.copy(s.box.position);
  }
  for (const s of wild) { napStep(s, sd); if (s.gift) giftFly(s, sd); zStep(s, dt); }   // a wild one munches what you give it
  fruitStep(sd);
}

export { campStep, findSeats };
