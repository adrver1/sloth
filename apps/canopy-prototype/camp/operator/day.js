// Canopy Camp operator, his day: the things he does, one after another. Each is a generator that runs a step a frame: soup
// from the pot on a log seat, a mug from the kitchen crate, a book, warming his hands at the fire, a stroll, sleep in the
// tent bed, playing with a sloth, sitting with you by the fire, and making the soup (cook.js). What comes next is drawn by
// weight (other weights at night), never the same thing twice in a row.
// Exports lifeStep(dt) (step.js, each frame) and jumpTo(kind) (the checks: start that activity now, then carry on).
import * as THREE from "three";
import { R, scene } from "../core.js";
import { CRATE, RC, SOUP_POT } from "../layout.js";
import { V, ease } from "../util.js";
import { uNight } from "../campProps.js";
import { acts as chores } from "../campLife.js";   // your chores (activities.js): he cooks only when the pot and the pail are free
import { me } from "../player.js";
import { giveBack, cuddleSeated, host, napTogether, pickUp, putDown, unhost } from "./buddy.js";
import { cook } from "./cook.js";
import { book, bowl, dropAll, hold, mug, spoon } from "./handProps.js";
import { pickLine } from "./lines.js";
import { UP, cs, play, root } from "./model.js";
import { BED, claim, crateFront, findPlaces, fireGap, freeOf, freeSeat, release } from "./places.js";
import { ME, RADIUS, life, op } from "./state.js";
import { speak } from "./talk.js";
import { face, faceFire, sitOn, standUp, wait, walkTo, yawTo } from "./walk.js";

const tmp = V();
const SIP = { hold: 1.25, top: 2.3 };                  // the sip clip: the mug at the chest at 1.25 s, at the lips 1.6 to 2.2 s
function* sipping(n) {                                 // n sips from what's in his right hand, resting it at his chest between
  const a = play("sip", 0.5, { at: SIP.hold }); a.timeScale = 0;
  for (let k = 0; k < n && !op.buddy; k++) {
    yield* wait(R(2.5, 6), () => op.buddy);
    if (op.buddy) break;
    for (let t = SIP.hold; t < SIP.top;) { t += (yield) * 0.9; a.time = Math.min(t, SIP.top); }
    yield* wait(R(0.4, 1.2));
    for (let t = SIP.top; t > SIP.hold;) { t -= (yield) * 1.3; a.time = Math.max(t, SIP.hold); }
  }
}
function* seatWith(activity) {                         // claim a seat, sit, do it, and cuddle any sloth that joins
  const s = freeSeat(); if (!s || !claim(s.key)) return;
  host(s.key);
  yield* sitOn(s);
  yield* activity();
  if (op.buddy) yield* cuddleSeated();
  unhost(); dropAll(); yield* standUp(); release();
}
const DO = {
  *eat() {                                             // a bowl of soup from the pot, eaten on a log seat
    yield* walkTo(fireGap(root.position)); yield* faceFire();
    const pot = SOUP_POT.at;
    for (let t = 0; t < 1.6;) { t += yield; op.ik = { R: [pot.clone().add(V(0, 0.12, 0)), Math.sin(Math.min(1, t / 1.6) * Math.PI) ** 2] }; }
    op.ik = null; bowl.visible = spoon.visible = true; op.eat = { t: 0, spoon: 0 };   // the bowl in both hands, the spoon in his right
    yield* seatWith(function* () {
      for (let t = 0, T = R(22, 38); t < T && !op.buddy;) { const dt = yield; t += dt; op.eat.spoon = Math.min(1, t / 1.5); op.eat.t += dt; }
    });
  },
  *drink() {                                           // a mug from the kitchen crate, drunk slowly on a log seat
    const crate = CRATE.at, front = crateFront();
    yield* walkTo(front); yield* face(yawTo(crate.clone().sub(root.position)));
    for (let t = 0; t < 1.4;) { t += yield; op.ik = { R: [crate.clone().setY(0.45), Math.sin(Math.min(1, t / 1.4) * Math.PI) ** 2] }; }
    op.ik = null; hold(mug);
    yield* seatWith(function* () { yield* sipping(Math.round(R(4, 7))); });
  },
  *read() {                                            // a book on a log seat, both hands on it, now and then a look at the fire
    yield* seatWith(function* () {
      book.visible = true; scene.add(book); op.ik = { book: 0 };
      for (let t = 0, T = R(30, 55); t < T && !op.buddy;) { t += yield; op.ik.book = Math.min(1, t / 1.2); op.look = (t % 14) > 11 ? 0 : -0.3; }
      for (let t = 0; t < 0.8;) { t += yield; if (op.ik) op.ik.book = 1 - t / 0.8; }
      book.visible = false; op.ik = null; op.look = 0;
    });
  },
  *warm() {                                            // hands out to the fire (most at dusk and at night)
    yield* walkTo(fireGap(root.position)); yield* faceFire();
    for (let t = 0, T = R(10, 18); t < T && !wantJoin();) {
      t += yield; const k = Math.min(1, t / 1.2, (T - t) / 1.2), rub = Math.sin(t * 3) * 0.03;
      op.ik = { R: [cs(0.12 + rub, 1.24, -0.5), k], L: [cs(-0.12 - rub, 1.24, -0.5), k] };
    }
    op.ik = null;
  },
  *stroll() {                                          // a slow walk to somewhere in the camp, a look round, a wave if you look at him
    let to = null;
    for (let k = 0; k < 30 && !to; k++) { const a = R(0, 6.28), r = R(1.6, RC - 1.8), p = V(Math.cos(a) * r, 0, Math.sin(a) * r); if (freeOf(p, 0.6)) to = p; }
    if (!to) return;
    yield* walkTo(to);
    for (let t = 0, T = R(5, 10); t < T && !wantJoin();) { t += yield; op.look = Math.sin(t * 0.7) * 0.5; }
    op.look = 0;
  },
  *sleep() {                                           // in the tent bed: sits on its edge, lies back, sleeps; at night until the day comes
    findPlaces(); if (!BED || !claim(BED.key)) return;
    host(BED.key);
    yield* walkTo(BED.door); yield* walkTo(BED.inside, { near: 0.15 }); yield* walkTo(BED.side, { near: 0.08 });
    const sitYaw = yawTo(BED.across);                  // his back to the bed: he faces across the tent, away from the wall
    yield* face(sitYaw);
    const edge = { at: BED.c.clone().addScaledVector(BED.across, 0.2).addScaledVector(BED.head, -0.25), yaw: sitYaw };
    yield* sitOn(edge); const sr = root.position.clone(), lock = op.footLock.clone(); op.footLock = null;
    yield* wait(1.2);
    // lie back: on his back along the bed, head on the pillow
    const lie = new THREE.Matrix4().makeBasis(V().crossVectors(BED.head, V(0, -1, 0)), BED.head, V(0, -1, 0)), lq = new THREE.Quaternion().setFromRotationMatrix(lie);
    const feet = BED.c.clone().addScaledVector(BED.head, -0.82).addScaledVector(BED.across, -0.1).setY(BED.c.y + 0.11), fq = root.quaternion.clone(); let from = root.position.clone();   // a little toward the wall: room for a sloth beside him
    play("idle", 0.9); op.lying = true;
    for (let t = 0; t < 1.3;) { t += yield; const e = ease(Math.min(1, t / 1.3)); root.position.lerpVectors(from, feet, e); root.quaternion.slerpQuaternions(fq, lq, e); }
    op.sleeping = true; op.ik = { sleep: 1 };
    const night = () => uNight.value > 0.5;
    for (let t = 0, T = R(40, 80); (night() ? true : t < T);) {
      t += yield;
      if (op.buddy && !op.buddy.cuddled) yield* napTogether();
      if (night() && t > 600) t = 0;
      if (!night() && op.wasNight && t > 8) break;     // the day has come: up a little after the light
      op.wasNight = night();
    }
    op.sleeping = false; op.ik = null; op.wasNight = false;
    if (op.buddy) giveBack();
    unhost();
    from = root.position.clone(); const q0 = root.quaternion.clone(), up = new THREE.Quaternion().setFromAxisAngle(UP, sitYaw);
    play("seated_idle", 0.9);
    for (let t = 0; t < 1.3;) { t += yield; const e = ease(Math.min(1, t / 1.3)); root.position.lerpVectors(from, sr, e); root.quaternion.slerpQuaternions(q0, up, e); }
    op.lying = false; root.rotation.set(0, sitYaw, 0); op.footLock = lock;
    yield* standUp(); release();
    yield* walkTo(BED.inside, { near: 0.15 }); yield* walkTo(BED.door);
  },
  *play() {                                            // borrow a sloth that's about on the ground and play with it
    const L = life(); if (!L.lend) return;
    const s = (L.sloths || []).filter((q) => q.o && q.o.getWorldPosition(tmp).y < 0.6 && Math.hypot(tmp.x, tmp.z) < RC - 1)
      .map((q) => [q, q.o.getWorldPosition(tmp).distanceTo(root.position) * R(0.5, 1.5) + (q.trip?.phase === "home" ? 3 : 0)]).sort((a, b) => a[1] - b[1]).map(([q]) => q).find((q) => L.lend(q, ME));   // nearest-ish, the ones out and about first
    if (!s) return;
    op.buddy = s; op.happy = true;
    const at = s.o.getWorldPosition(V()), d = at.clone().sub(root.position).setY(0);
    yield* walkTo(at.clone().addScaledVector(d.normalize(), -0.55));
    yield* face(yawTo(at.clone().sub(root.position)));
    for (const [clip, slothClip, T] of [["play_titanic", "titanic", R(8, 12)], ["play_airplane", "titanic", R(6, 9)]]) {
      if (!op.buddy) break;
      yield* pickUp(clip, slothClip);
      yield* wait(T);
    }
    yield* putDown(); op.happy = false;
  },
};
const WEIGHTS = (night) => night ? { sleep: 6, warm: 2, drink: 1, read: 0.3, stroll: 0.3, eat: 0.5, play: 0.3, cook: 0.3 }
  : { eat: 1.2, drink: 1.2, read: 1.6, warm: 0.5, stroll: 1.2, sleep: 0.5, play: 1.2, cook: 1.0 };
// when you sit by the fire he comes and sits with you on another log (Adriaen 2026-11-13), not again for a while after (op.cd.join)
const wantJoin = () => !!me.seat && !op.seated && !op.lying && op.cd.join <= 0 && !op.buddy && !op.carry && !op.cooking;
DO.hold = function* () { yield* wait(1e9); };   // checks only (window.__op.jump("hold")): stand still
DO.join = function* () {
  op.cd.join = 1e9;
  yield* seatWith(function* () {
    let away = 0, chat = R(6, 12);
    for (let t = 0, T = R(70, 120); t < T && !op.buddy;) {
      const dt = yield; t += dt; away = me.seat ? 0 : away + dt; if (away > 3) break;   // you got up: he stays a moment, then goes on
      chat -= dt; if (chat < 0 && op.talk.t <= 0 && me.seat) { speak(pickLine("fire")); chat = R(30, 50); }
    }
  });
  op.cd.join = R(90, 150);
};
DO.cook = cook;
function* lifeLoop() {
  yield* wait(R(2, 5));
  for (;;) {
    const kind = op.next || (wantJoin() ? "join" : pick()); op.next = null; op.kind = kind;
    yield* DO[kind](); op.kind = "idle"; op.last = kind;
    yield* wait(R(2, 6), () => op.next || wantJoin());
  }
}
function pick() {
  const w = Object.entries(WEIGHTS(uNight.value > 0.5)).filter(([k]) => k !== op.last && (k !== "play" || life().lend) && (k !== "cook" || (op.cd.cook <= 0 && chores.cook.can())));
  let r = R(0, w.reduce((s, [, v]) => s + v, 0)); for (const [k, v] of w) if ((r -= v) <= 0) return k; return w[0][0];
}

// each frame: start his day on the first, register him as a mover with the sloths' life (again later if it was not there
// yet), then run the activity one step
let it = null;
function lifeStep(dt) {
  if (!it) { it = lifeLoop(); it.next(); life().addMover?.(root, RADIUS); }
  if (!life().movers && !op.moverTry) op.moverTry = 1;
  else if (op.moverTry === 1 && life().addMover) { life().addMover(root, RADIUS); op.moverTry = 2; }
  it.next(dt);
}
// the checks (opApi.jump): this activity now, then his day goes on
function jumpTo(k) { it = (function* () { op.kind = k; yield* DO[k](); op.kind = "idle"; yield* lifeLoop(); })(); it.next(); }

export { jumpTo, lifeStep };
