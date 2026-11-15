// Canopy Camp linger (camp review B7): sit by the fire. Each log seat round the fire lights up like the other things you can
// use; "Sit by the fire" sets you down on it, facing the flames, with the eye lowered to a seated 1.13 m (player.js eases it).
// While you sit and don't look round yourself, the view drifts slowly over the fire and the soup, like letting your gaze
// wander. Walking (stick or keys) stands you up; so does "Stand up" on the seat.
// Where you sit on each log is its "you" slot in places.js logSeats (its middle, a little back; on Sunny's bench its left
// end). That place is yours in the camp's registry, so no one sits on you: "log:<i>", and on Sunny's bench "log:0:left"
// (Sunny keeps "log:0"). lingerStep keeps that claim in step with me.seat, whoever set it (review R2-029: the sloths' step
// used to do it). Each log is one tap target; other modules add their options to it (chores.js: setting a bowl down).
// Exports buildLinger() (main.js, once the props are in: it adds each seat's tap target), lingerStep(dt)
// (main.js, each frame: your seat's claim, then the drift) and sit(i), which sits you on seat i at once (the tools:
// debug.js __sit). A log seat's me.seat is { pos, yaw, log: its index in layout.js SEATS }.
import * as THREE from "three";
import { toStage, toWorld, uTime } from "./stage.js";
import { V, wrapPi } from "./util.js";
import { me } from "./player.js";
import { addTarget } from "./targets.js";
import { claim, logSeats, release } from "./places.js";

const seatSpot = (seat) => ({ pos: toWorld(seat.slots.you.at.clone()), yaw: seat.slots.you.yaw, log: seat.i });   // facing the fire in the middle; you walk in the world (the slot is in the stage's frame)
const vAt = V();
let drift = 0;
function buildLinger() {
  logSeats().forEach((seat) => { const { o, i } = seat;
    const picks = []; o.traverse((m) => m.isMesh && picks.push(m));
    let S = null;   // the log never moves: its bounds are worked out once, when first asked for
    const at = (v) => { if (!S) { S = new THREE.Box3().setFromObject(o).getBoundingSphere(new THREE.Sphere()); toStage(S.center); } v.copy(S.center); return S; };   // in the stage's frame, as every target
    const { pos, yaw } = seatSpot(seat);
    const sitHere = () => { me.seat = { pos, yaw, log: i }; me.yaw = yaw; me.pitch = -0.12; me.lastDrag = -9; drift = 0; };
    addTarget(o, () => ({ look: o, picks, at,
      ready: () => me.seat?.pos === pos || toWorld(vAt.copy(at(vAt).center)).distanceTo(me.pos) < 3.2,
      options: () => me.seat?.pos === pos ? [["Stand up", () => { me.seat = null; }]] : [["Sit by the fire 🔥", sitHere]] }));
  });
}
let held = -1;                                      // the log whose place you hold now, or -1
function holdLog() {
  const i = me.seat?.log ?? -1; if (i === held) return;
  const seats = logSeats();
  if (held >= 0) release(seats[held].slots.you.key, "player");
  if (i >= 0) claim(seats[i].slots.you.key, "player");
  held = i;
}
// the slow drift: a few degrees either side of the fire and a gentle nod, eased in after you stop looking round yourself
function step(dt) {
  holdLog();
  if (!me.seat) return;
  const idle = uTime.value - me.lastDrag > 3; drift = Math.min(1, drift + (idle ? dt * 0.3 : -drift));
  if (drift <= 0) return;
  const t = uTime.value, yaw = me.seat.yaw + 0.16 * Math.sin(t * 0.11) + 0.05 * Math.sin(t * 0.27), pitch = (me.seat.pitch ?? -0.13) + 0.05 * Math.sin(t * 0.08 + 1);   // a seat may say where the gaze rests (jeepSeat.js: down at the dash)
  const k = 1 - Math.exp(-0.8 * dt * drift); me.yaw += wrapPi(yaw - me.yaw) * k; me.pitch += (pitch - me.pitch) * k;
}
const sit = (i = 0) => { const t = logSeats()[i]; if (t) { me.seat = seatSpot(t); me.yaw = me.seat.yaw; me.pitch = -0.12; me.pos.copy(me.seat.pos); me.sitK = 1; } };   // the tools sit down with it (debug.js __sit)
export { buildLinger, sit, step as lingerStep };
