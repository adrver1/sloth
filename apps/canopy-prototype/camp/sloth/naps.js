// Canopy Camp sloths, naps (Adriaen 2026-11-12: "the sloths need to nap much more"): awake 20 to 45 s, then a yawn and
// asleep 50 to 110 s where they are, eyes shut, head sinking, a slow z rising. Sitting ones curl up (curl); hanging ones
// keep their grip and just slow right down; the tent one lays its head down. They wake on their own or when booped or fed;
// sitting ones then have a big stretch, the others a yawn. The hammock napper (Hibi) naps longest, 1.5 to 3 minutes, with
// only 10 to 25 s awake between, and yawns and stretches like the rest (Adriaen 2026-11-13). No errands or s'mores while
// asleep.
//   doze(s, dur)             a yawn, then asleep for dur seconds
//   wakeUp(s)                the state of being awake: not dozing, not asleep, eyes open (what it does next is the caller's)
//   wake(s, after)           (inside, for napStep) awake: a stretch where it can sit up (after() when it has stretched), else a yawn
//   rouse(s, back)           (inside, for napStep) woken by a boop or by its nap trip running out: awake where it is for a while, then back to
//                            sleep (back) or on with its day
//   napStep(s, sd, after)    each frame for a sloth that may sleep: nods off, sleeps, wakes; with after, a nap that ends
//                            in after() instead of the next nap
//   zStep(s, sd)             the three z's rising off a sleeper (not the hammock's own napper), sd: the camp's paced time
//   hammockStep(dt)          the hammock's swing and its napper's z's, each frame (main.js); the z's rise at core.js
//                            pace like the sloths (the move lab's Pause stops them), the swing goes on
// Every length of a nap draws from the sloths' stream (core.js rng("sloths")) as it happens.
import { OPT, pace, rng } from "../core.js";
const { R } = rng("sloths");
import { makeZ, zAt } from "../actor.js";
import { spots } from "./state.js";
import { canStretch, dozeClip, homeClip, play, playOnce } from "./clips.js";
import { hammock } from "./spots.js";

function doze(s, dur = s.spot?.asleep && s.trip?.phase === "home" ? R(90, 180) : R(50, 110)) { s.dozing = true; s.yawn = 1e-3; s.dozeIn = 2.4; s.dozeT = dur; }
const wakeUp = (s) => { s.dozing = s.asleep = false; s.eyes(false); };
function wake(s, after) {
  wakeUp(s); s.napT = s.spot?.asleep ? R(10, 25) : R(20, 45);
  const [c, ts] = homeClip(s), back = after ?? (() => play(s, c, 1.5, ts));
  if (canStretch(s)) playOnce(s, "stretch", 1.5, back); else { s.yawn = 1e-3; play(s, c, 2, ts); after?.(); }
}
// woken (Adriaen 2026-11-13: "they don't have to start moving just because they're booped"): a stretch where it can sit up,
// else a yawn; often a slow wave at you; a while awake where it is; then, two times in three, back to sleep (a yawn and
// nod off). A nap trip that runs out does the same and then gets up.
function rouse(s, back) {
  wakeUp(s); s.dozeIn = 0; s.napT = s.spot?.asleep ? R(10, 25) : R(20, 45);
  s.roused = { t: 0, dur: R(4, 8), back, wave: R(0, 1) < 0.5, waved: false };
  const [c, ts] = homeClip(s);
  if (canStretch(s)) playOnce(s, "stretch", 1.5, () => play(s, c, 1.5, ts)); else { s.yawn = 1e-3; play(s, c, 2, ts); }
}
function napStep(s, sd, after) {
  if (s.dozing) {
    if (s.dozeIn > 0) { s.dozeIn -= sd; if (s.dozeIn <= 0) { s.asleep = true; s.eyes(true); const [c, ts] = dozeClip(s); play(s, c, 2.5, ts); } }
    else { s.dozeT -= sd; if (s.squish > 0.9 || s.nod > 2) rouse(s, R(0, 1) < 2 / 3); else if (s.dozeT < 0) after ? rouse(s, false) : wake(s); }
  } else if (s.roused) {                            // awake in its place for a bit: maybe a wave at you, then back to sleep or off
    const r = s.roused; r.t += sd;
    if (r.wave && !r.waved && r.t > 3.5 && !s.once && !s.yawn) { r.waved = true; s.wave = 1e-3; s.waveCD = 15; }
    if (r.t > r.dur && !s.once && !s.wave && !s.yawn) { s.roused = null; if (r.back) doze(s); else after?.(); }
  } else if (!after) { s.napT -= sd; if (s.napT < 0 && !s.smore && !s.wave && !s.once) doze(s); }
}
// three z sprites, added to the scene hidden (the first time a sleeper or the hammock's napper needs them)
const makeZs = () => [0, 1, 2].map(() => { const z = makeZ(); z.visible = false; return z; });
const ZS = { wob: 0.1, y0: 0.25, rise: 0.6, w0: 0.3, w1: 0.35 };   // how a sloth's z's sway, rise and grow (actor.js zAt)
// the three z's over sloth s while on, k0 (0..1) the first one's rise, f their size; hushed while it wobbles from a boop.
// Off, they are hidden and cost nothing more (review R2-017: they used to stay in the scene at opacity 0).
function zsStep(zz, s, k0, on, f = 1) {
  if (!on) { if (zz[0].visible) for (const z of zz) z.visible = false; return; }
  const a = s.squish > 0 ? 0 : 0.85;
  zz.forEach((z, i) => { const k = (k0 + i / 3) % 1; z.visible = true; zAt(z, s.head, k, ZS, f); z.material.opacity = Math.sin(Math.PI * k) * a; });
}
// z's rising off each sleeper, three at a time like the hammock napper's (Adriaen 2026-11-13: "sleeping sloths should have
// zzzzs like the hammock sloth"); a little smaller on the small ones
function zStep(s, sd) {
  const on = s.dozing && s.asleep && !s.spot?.asleep;
  if (!on && !s.zz) return;
  s.zz ??= makeZs();
  s.zk = ((s.zk ?? R(0, 1)) + sd / 2.4) % 1;
  zsStep(s.zz, s, s.zk, on, Math.min(1, Math.max(0.6, s.sc / 2.2)));
}
// the hammock's swing and its napper's z's (main.js calls it after the move lab's step, which used to run just before it).
// Without the camp sloths (?campsloths=0) the hammock was never given its swing, and it hangs still.
function hammockStep(dt) {
  if (!OPT.campsloths) return;
  const H = hammock, napper = spots[0].home ? spots[0].who : null, sd = dt * (pace.fast ?? 1);   // a slow swing, nudged harder for a while after a boop
  H.step(dt);
  if (napper?.squish > 0.9) H.push = 1;
  const on = !!napper?.asleep;
  if (!on && !H.zz) return;
  H.zz ??= makeZs(); H.zk = (H.zk + sd / 2.4) % 1;
  zsStep(H.zz, napper, H.zk, on);
}

export { doze, hammockStep, napStep, wakeUp, zStep };
