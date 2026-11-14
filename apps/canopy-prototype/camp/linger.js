// Canopy Camp linger (camp review B7): sit by the fire. Each log seat round the fire lights up like the other things you can
// use; "Sit by the fire" sets you down on it, facing the flames, with the eye lowered to a seated 1.13 m (player.js eases it).
// While you sit and don't look round yourself, the view drifts slowly over the fire and the soup, like letting your gaze
// wander. Walking (stick or keys) stands you up; so does "Stand up" on the seat.
// The log you sit on is yours in the camp's registry (places.js), so no one sits on you: "log:<i>", and on Sunny's bench
// its left end, seatKey(0, true) (Sunny keeps "log:0"). lingerStep keeps that claim in step with me.seat, whoever set it
// (review R2-029: the sloths' step used to do it).
// Exports buildLinger() (main.js, once the props and input.js are in: it adds each seat's tap target), lingerStep(dt)
// (main.js, each frame: your seat's claim, then the drift) and sit(i), which sits you on seat i at once (the tools:
// debug.js __sit). A log seat's me.seat is { pos, yaw, log: its index in layout.js SEATS }.
import * as THREE from "three";
import { uTime } from "./core.js";
import { V, wrapPi } from "./util.js";
import { SEATS } from "./layout.js";
import { me } from "./player.js";
import { addTarget } from "./targets.js";
import { claim, release, seatKey, seatLog } from "./places.js";

let seats = [];   // the log seats, by their index in layout.js's SEATS (campProps.js puts one log on each); undefined if missing
// where you sit on a log: its middle, a little to its back edge. Seat_0 is Sunny's bench (sloths.js "seat", just right of its
// middle as you face the fire), so there you always shift 0.55 m to the left and leave Sunny room (Adriaen 2026-11-12)
function seatSpot(o, log) {
  const c = o.position.clone().setY(0), a = Math.atan2(c.z, c.x), pos = c.clone().multiplyScalar(1 + 0.12 / c.length());
  if (o === seatLog(0)) pos.addScaledVector(V(-Math.sin(a), 0, Math.cos(a)), 0.55);
  return { pos, yaw: Math.atan2(pos.x, pos.z), log };   // facing the fire in the middle
}
const box = new THREE.Box3(), sph = new THREE.Sphere();
let drift = 0;
function buildLinger() {
  seats = SEATS.map((_, i) => seatLog(i));
  seats.forEach((o, i) => { if (!o) return;
    const picks = []; o.traverse((m) => m.isMesh && picks.push(m));
    const at = (v) => { box.setFromObject(o).getBoundingSphere(sph); v.copy(sph.center); return sph; };
    const { pos, yaw } = seatSpot(o, i);
    const sitHere = () => { me.seat = { pos, yaw, log: i }; me.yaw = yaw; me.pitch = -0.12; me.lastDrag = -9; drift = 0; };
    addTarget(o, () => ({ look: o, picks, at,
      ready: () => me.seat?.pos === pos || at(V()).center.distanceTo(me.pos) < 3.2,
      options: () => me.seat?.pos === pos ? [["Stand up", () => { me.seat = null; }]] : [["Sit by the fire 🔥", sitHere]] }));
  });
}
let held = -1;                                      // the log whose place you hold now, or -1
function holdLog() {
  const i = me.seat?.log ?? -1; if (i === held) return;
  if (held >= 0) release(seatKey(held, held === 0), "player");
  if (i >= 0) claim(seatKey(i, i === 0), "player");
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
const sit = (i = 0) => { const t = seats[i]; if (t) { me.seat = seatSpot(t, i); me.yaw = me.seat.yaw; me.pitch = -0.12; me.pos.copy(me.seat.pos); me.sitK = 1; } };   // the tools sit down with it (debug.js __sit)
export { buildLinger, sit, step as lingerStep };
