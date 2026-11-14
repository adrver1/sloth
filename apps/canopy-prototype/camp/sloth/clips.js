// Canopy Camp sloths, the clips (characters/sloth_baby/sloth_rig.py: idle, walk, cling, hang_walk, nap, reach, curl, drive,
// peek, stretch, eat, eat_high):
//   clipOf(name)                         the clip of that name in the sloth model
//   play(s, name, fade, timeScale, at)   cross-fades sloth s to a clip, from `at` seconds in; kept as s.act
//   playOnce(s, name, fade, then, at)    the same for a clip played once (stretch, eat, eat_high); then() runs when it has
//                                        played through (the camp step watches s.once)
//   homeClip(s), dozeClip(s)             [clip, timeScale] for where it is: awake, and asleep
//   canStretch(s)                        it is sitting, or lying where it can sit up, so it can stretch when it wakes
import * as THREE from "three";
import { SLOTH } from "../campProps.js";

const clipOf = (n) => SLOTH.animations.find((a) => a.name === n);
const ONCE = new Set(["stretch", "eat", "eat_high"]);   // played once, then s.once() (see campStep)
function play(s, name, fade, timeScale = 1, at = 0) {
  const next = s.mixer.clipAction(clipOf(name)), once = ONCE.has(name); s.once = null;
  if (once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
  if (s.act === next && !once) { next.timeScale = timeScale; return; }
  next.reset(); next.time = at; next.timeScale = timeScale; next.play();
  if (s.act && s.act !== next) s.act.crossFadeTo(next, fade, false);
  s.act = next;
}
function playOnce(s, name, fade, then, at = 0) { play(s, name, fade, 1, at); s.once = then; }

const homeClip = (s) => s.trip?.phase === "rest" ? ["idle", 1] : !s.spot ? ["cling", 0.6] : [s.spot.clip, s.spot.clip === "cling" ? 0.6 : 1];
const dozeClip = (s) => s.spot?.guest || s.spot?.asleep ? [s.spot.clip, s.spot.clip === "nap" ? 1 : 1] : s.trip?.phase === "rest" || ["seat", "jeep"].includes(s.spot?.name) ? ["curl", 1] : s.spot?.name === "tent" ? ["peek", 0.15] : ["cling", 0.22];
const canStretch = (s) => s.trip?.phase === "rest" || (["seat", "jeep", "hammock"].includes(s.spot?.name) && s.spot.clip !== "curl") || (s.spot?.guest && s.spot.name === "tent");    // sitting, or lying where it can sit up (hammock, bed)

export { canStretch, clipOf, dozeClip, homeClip, play, playOnce };
