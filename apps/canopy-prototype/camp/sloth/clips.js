// Canopy Camp sloths, the clips (characters/sloth_baby/sloth_rig.py: idle, walk, cling, hang_walk, nap, reach, curl, drive,
// peek, stretch, eat, eat_high):
//   clipOf(name)                         the clip of that name in the sloth model
//   play(s, name, fade, timeScale, at)   cross-fades sloth s to a clip, from `at` seconds in; kept as s.act
//   playOnce(s, name, fade, then, at)    the same for a clip played once (stretch, eat, eat_high); then() runs when it has
//                                        played through (the camp step watches s.once)
//   homeClip(s), dozeClip(s)             [clip, timeScale] for where it is: awake, and asleep
//   EAT_GRAB                             how many seconds into the eat clips the claws close on the food
//   canStretch(s)                        it is sitting, or lying where it can sit up, so it can stretch when it wakes
import { SLOTH } from "../campProps.js";
import { crossFade } from "../actor.js";

const clipOf = (n) => SLOTH.animations.find((a) => a.name === n);
const EAT_GRAB = 1.85;                                // s into the eat clips: the claws close on the fruit
const ONCE = new Set(["stretch", "eat", "eat_high"]);   // played once, then s.once() (see campStep)
function play(s, name, fade, timeScale = 1, at = 0) {   // (actor.js crossFade: a clip played once starts over, given 1 repetition)
  const once = ONCE.has(name); s.once = null;
  s.act = crossFade(s.act, s.mixer.clipAction(clipOf(name)), fade, { once, at, speed: timeScale, reps: 1, restart: true });
}
function playOnce(s, name, fade, then, at = 0) { play(s, name, fade, 1, at); s.once = then; }

const homeClip = (s) => s.trip?.phase === "rest" ? ["idle", 1] : !s.spot ? ["cling", 0.6] : [s.spot.clip, s.spot.clip === "cling" ? 0.6 : 1];
// asleep: curled up on the ground in the clearing, else its spot's doze clip (spots.js), a wild one still clinging
const dozeClip = (s) => s.trip?.phase === "rest" ? ["curl", 1] : s.spot?.doze ?? ["cling", 0.22];
const canStretch = (s) => s.trip?.phase === "rest" || !!s.spot?.sitUp;   // sitting, or lying where it can sit up (spots.js)

export { EAT_GRAB, canStretch, clipOf, dozeClip, homeClip, play, playOnce };
