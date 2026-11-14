// Canopy Camp linger (camp review B7): sit by the fire. Each log seat round the fire lights up like the other things you can
// use; "Sit by the fire" sets you down on it, facing the flames, with the eye lowered to a seated 1.13 m (player.js eases it).
// While you sit and don't look round yourself, the view drifts slowly over the fire and the soup, like letting your gaze
// wander. Walking (stick or keys) stands you up; so does "Stand up" on the seat.
import * as THREE from "three";
import { scene, uTime } from "./core.js";
import { V, wrapPi } from "./util.js";
import { SEATS } from "./layout.js";
import { me } from "./player.js";
import { addTarget } from "./input.js";

const seats = SEATS.map((_, i) => scene.getObjectByName(`Seat_${i}`)).filter(Boolean);   // campProps.js puts one log on each of layout.js's seats
// where you sit on a log: its middle, a little to its back edge. Seat_0 is Sunny's bench (sloths.js "seat", just right of its
// middle as you face the fire), so there you always shift 0.55 m to the left and leave Sunny room (Adriaen 2026-11-12)
function seatSpot(o) {
  const c = o.position.clone().setY(0), a = Math.atan2(c.z, c.x), pos = c.clone().multiplyScalar(1 + 0.12 / c.length());
  if (o.name === "Seat_0") pos.addScaledVector(V(-Math.sin(a), 0, Math.cos(a)), 0.55);
  return { pos, yaw: Math.atan2(pos.x, pos.z) };   // facing the fire in the middle
}
const box = new THREE.Box3(), sph = new THREE.Sphere();
let drift = 0;
for (const o of seats) {
  const picks = []; o.traverse((m) => m.isMesh && picks.push(m));
  const at = (v) => { box.setFromObject(o).getBoundingSphere(sph); v.copy(sph.center); return sph; };
  const { pos, yaw } = seatSpot(o);
  const sitHere = () => { me.seat = { pos, yaw }; me.yaw = yaw; me.pitch = -0.12; me.lastDrag = -9; drift = 0; };
  addTarget(o, () => ({ look: o, picks, at,
    ready: () => me.seat?.pos === pos || at(V()).center.distanceTo(me.pos) < 3.2,
    options: () => me.seat?.pos === pos ? [["Stand up", () => { me.seat = null; }]] : [["Sit by the fire 🔥", sitHere]] }));
}
// the slow drift: a few degrees either side of the fire and a gentle nod, eased in after you stop looking round yourself
function step(dt) {
  if (!me.seat) return;
  const idle = uTime.value - me.lastDrag > 3; drift = Math.min(1, drift + (idle ? dt * 0.3 : -drift));
  if (drift <= 0) return;
  const t = uTime.value, yaw = me.seat.yaw + 0.16 * Math.sin(t * 0.11) + 0.05 * Math.sin(t * 0.27), pitch = (me.seat.pitch ?? -0.13) + 0.05 * Math.sin(t * 0.08 + 1);   // a seat may say where the gaze rests (jeepSeat.js: down at the dash)
  const k = 1 - Math.exp(-0.8 * dt * drift); me.yaw += wrapPi(yaw - me.yaw) * k; me.pitch += (pitch - me.pitch) * k;
}
window.__sit = (i = 0) => { const t = seats[i]; if (t) { me.seat = seatSpot(t); me.yaw = me.seat.yaw; me.pitch = -0.12; me.pos.copy(me.seat.pos); me.sitK = 1; } };   // tool contract: camp-replay.cjs's tour sits down with it
export { step as lingerStep };
