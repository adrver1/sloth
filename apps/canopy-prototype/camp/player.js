// Canopy Camp player: first person on the clearing floor, the walkable track, collisions with the blockers.
import "./sloths.js";   // run after the module before it, as one script did
import { camera, uTime } from "./core.js";
import { keys, stickV } from "./hud.js";
import { GLADE, GLADE_R, PATH_W, RC, V, d0, polyDist, sloPath, t0, track, tripPath } from "./forest.js";
import { blockers } from "./campProps.js";
import { groundHeight } from "./terrain.js";

// ================================================================ the player: first person, on the clearing floor
const EYE = 1.55, SPEED = 1.7;
const me = { vel: V(), mode: "ground", pos: d0.clone().multiplyScalar(-4.4).addScaledVector(t0, -0.6), s: 0, yaw: 0, pitch: 0.08, target: null, holding: false, walkT: 0, lastDrag: -9, mark: null, seat: null, sitK: 0 };   // seat: { pos, yaw } while sitting by the fire (linger.js); sitK eases 0..1
me.yaw = Math.atan2(-d0.x, -d0.z);       // face the fire and the big tree behind it
const look = V();
// the first stretch of the jeep's track is walkable: past the clearing edge you stay within WALK_W of its centre line,
// up to WALK_R from the middle, where it fades into the forest
const WALK_R = RC + 8, WALK_W = 0.9, walkPts = track ? track.pts.filter((q) => Math.hypot(q.x, q.z) < WALK_R) : [];
function onTrack(p) {                                  // the nearest point on the walkable stretch, and how far p is from it
  let best = null, bd = 1e9;
  for (let i = 1; i < walkPts.length; i++) {
    const a = walkPts[i - 1], b = walkPts[i], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    const x = a.x + dx * t, z = a.z + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = V(x, 0, z); }
  }
  return [best, bd];
}
function collide(p) {
  const r = Math.hypot(p.x, p.z), lim = RC - 0.7;
  if (r > lim) {
    const [q, d] = walkPts.length > 1 ? onTrack(p) : [null, 1e9];
    const [pd, px, pz] = polyDist(sloPath.pts, p.x, p.z), dg = Math.hypot(p.x - GLADE.x, p.z - GLADE.z), GR = GLADE_R - 0.4;
    const tp = polyDist(tripPath.trailPts, p.x, p.z);   // the whole karaoke trail is walkable
    if (dg < GR) {}                                                                          // in the sloth tree's glade
    else if (tp[0] < 1.3) { if (tp[0] > 0.9) { const c = V(tp[1], 0, tp[2]); p.sub(c).multiplyScalar(0.9 / tp[0]).add(c); } }   // on the karaoke trip's path
    else if (pd < PATH_W + 0.4) { if (pd > PATH_W) { const c = V(px, 0, pz); p.sub(c).multiplyScalar(PATH_W / pd).add(c); } }   // on the path: keep to it
    else if (d < WALK_W + 0.4) { if (d > WALK_W) p.sub(q).multiplyScalar(WALK_W / d).add(q); }   // on the track: keep to it
    else if (dg < GR + 0.8) p.sub(GLADE).multiplyScalar(GR / dg).add(GLADE);
    else p.multiplyScalar(lim / r);
  }
  for (const [c, rad] of blockers) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz); if (d < rad + 0.3) { const k = (rad + 0.3) / Math.max(d, 1e-4); p.x = c.x + dx * k; p.z = c.z + dz * k; } }
}
let landmark = -1;
function step(dt) {
  let moving = false;
  const fwd = V(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
  // walk with the stick (phone) or WASD / arrows (computer), like desk-at-night's free mode
  const right = V(-fwd.z, 0, fwd.x);
  const ax = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + stickV.x;
  const az = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - stickV.y;
  const wish = fwd.clone().multiplyScalar(az).addScaledVector(right, ax); if (wish.lengthSq() > 1) wish.normalize();
  if (me.seat && wish.lengthSq() > 0.01) me.seat = null;   // walking stands you up
  me.sitK += Math.sign((me.seat ? 1 : 0) - me.sitK) * Math.min(Math.abs((me.seat ? 1 : 0) - me.sitK), dt * 1.6);
  if (me.seat) { me.vel.set(0, 0, 0); me.pos.lerp(me.seat.pos, 1 - Math.exp(-4 * dt)); }
  else me.vel.lerp(wish.multiplyScalar(SPEED), 1 - Math.exp(-10 * dt));
  if (!me.seat && me.vel.length() > 0.05) { moving = true; const p = me.pos.clone().addScaledVector(me.vel, dt); collide(p); me.pos.copy(p); }
  if (moving) me.walkT += dt;
  const feet = me.pos; feet.y = groundHeight(feet.x, feet.z);   // level in the camp and on the paths; the rim rises a little at the edge
  const bob = moving ? Math.sin(me.walkT * 7) * 0.03 : 0;
  camera.position.set(feet.x, feet.y + EYE - 0.72 * me.sitK * me.sitK * (3 - 2 * me.sitK) + bob, feet.z);   // seated: eye at about 0.83 m
  look.set(-Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), -Math.cos(me.yaw) * Math.cos(me.pitch)).add(camera.position);
  camera.lookAt(look);
}
function turnTo(dir, dt) {                             // ease the view round to face the way you walk, unless you have just looked around
  if (uTime.value - me.lastDrag < 1.5) return;
  const want = Math.atan2(-dir.x, -dir.z); let d = want - me.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  me.yaw += d * Math.min(1, dt * 2.5);
}

export { collide, me, step };
