// Canopy Camp player: first person on the clearing floor, the walkable track, collisions with the blockers.
// me is the player: where you stand, where you look, and the seat you are on (linger.js, jeepSeat.js). Exports me and step(dt)
// (main.js, each frame).
import { camera } from "./core.js";
import { keys, stickV } from "./hud.js";
import { track } from "./forest.js";
import { V, polyDist, yawTo } from "./util.js";
import { GLADES, PATHS, RC, d0, t0 } from "./layout.js";
import { blockers } from "./campProps.js";
import { groundHeight } from "./terrain.js";

// ================================================================ the player: first person, on the clearing floor
const EYE = 1.55, SPEED = 1.7, BODY = 0.25;   // BODY: how far you keep from things (was 0.3)
// vel: walking speed; walkT: seconds walked (the head bob); lastDrag: when you last looked round yourself, on the camp's clock;
// seat: { pos, yaw, and for the jeep's drop, pitch, leave } while you sit (linger.js, jeepSeat.js); sitK eases 0..1 as you sit
// down; step() adds drop, how far the eye is lowered on that seat
const me = { vel: V(), pos: d0.clone().multiplyScalar(-4.4).addScaledVector(t0, -0.6), yaw: 0, pitch: 0.08, walkT: 0, lastDrag: -9, seat: null, sitK: 0 };
me.yaw = yawTo(d0);       // face the fire and the big tree behind it
const look = V(), fwd = V(), right = V(), wish = V(), next = V(), near = V();   // scratch vectors, reused every frame
// the first stretch of the jeep's track is walkable: past the clearing edge you stay within WALK_W of its centre line,
// up to WALK_R from the middle, where it fades into the forest
const WALK_R = RC + 8, WALK_W = 0.9, walkPts = track ? track.pts.filter((q) => Math.hypot(q.x, q.z) < WALK_R) : [];
// (util.js polyDist finds the same point, but takes the distance before rounding the point, so its last bits differ; this one stays)
function onTrack(p) {                                  // the nearest point on the walkable stretch, and how far p is from it
  let found = false, bd = 1e9;
  for (let i = 1; i < walkPts.length; i++) {
    const a = walkPts[i - 1], b = walkPts[i], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    const x = a.x + dx * t, z = a.z + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; near.set(x, 0, z); found = true; }
  }
  return [found ? near : null, bd];   // the point is the shared scratch vector near: use it before the next call
}
function collide(p) {
  const r = Math.hypot(p.x, p.z), lim = RC - 0.7;
  if (r > lim) {
    const [q, d] = walkPts.length > 1 ? onTrack(p) : [null, 1e9];
    // the paths and glades are layout.js PATHS and GLADES: the nearest glade, and the path you are on (within its lane + 0.4 m)
    let gl = null, dc = 0, on = null, pd = 0, px = 0, pz = 0;   // dc: the distance to the glade's middle
    for (const g of GLADES) { const c = Math.hypot(p.x - g.at.x, p.z - g.at.z); if (!gl || c - g.r < dc - gl.r) { gl = g; dc = c; } }
    for (const w of PATHS) { const [d1, x1, z1] = polyDist(w.pts, p.x, p.z); if (d1 < w.lane + 0.4 && (!on || d1 - w.lane < pd - on.lane)) { on = w; pd = d1; px = x1; pz = z1; } }
    const GR = gl ? gl.r - 0.4 : 0;
    if (gl && dc < GR) {}                                                                    // in a glade
    else if (on) { if (pd > on.lane) { const c = V(px, 0, pz); p.sub(c).multiplyScalar(on.lane / pd).add(c); } }   // on a path: keep to it
    else if (d < WALK_W + 0.4) { if (d > WALK_W) p.sub(q).multiplyScalar(WALK_W / d).add(q); }   // on the track: keep to it
    else if (gl && dc < GR + 0.8) p.sub(gl.at).multiplyScalar(GR / dc).add(gl.at);           // just out of a glade: back into it
    else p.multiplyScalar(lim / r);
  }
  // push out of each blocker along the shortest way, so you slide round it instead of stopping; three passes, so a corner
  // where two touch settles too. A blocker's .walk shape (campProps.js) is used when it has one: a circle, or a capsule a..b
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const B of blockers) {
      const w = B.walk, rad = (w ? w.r : B.r) + BODY;
      let cx = B.at.x, cz = B.at.z;
      if (w?.a) { const ax = w.a.x, az = w.a.z, dx = w.b.x - ax, dz = w.b.z - az, t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz))); cx = ax + dx * t; cz = az + dz * t; }
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d < rad) { const k = rad / Math.max(d, 1e-4); p.x = cx + dx * k; p.z = cz + dz * k; moved = true; }
    }
    if (!moved) break;
  }
}
function step(dt) {
  let moving = false;
  fwd.set(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
  // walk with the stick (phone) or WASD / arrows (computer), like desk-at-night's free mode
  right.set(-fwd.z, 0, fwd.x);
  const ax = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + stickV.x;
  const az = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - stickV.y;
  wish.copy(fwd).multiplyScalar(az).addScaledVector(right, ax); if (wish.lengthSq() > 1) wish.normalize();
  if (me.seat && wish.lengthSq() > 0.01) { if (me.seat.leave) me.seat.leave(); else me.seat = null; }   // walking stands you up (a seat with .leave, the jeep's, gets you out its own way)
  me.sitK += Math.sign((me.seat ? 1 : 0) - me.sitK) * Math.min(Math.abs((me.seat ? 1 : 0) - me.sitK), dt * 1.6);
  if (me.seat) { me.vel.set(0, 0, 0); me.pos.lerp(me.seat.pos, 1 - Math.exp(-4 * dt)); }
  else me.vel.lerp(wish.multiplyScalar(SPEED), 1 - Math.exp(-10 * dt));
  if (!me.seat && me.vel.length() > 0.05) { moving = true; next.copy(me.pos).addScaledVector(me.vel, dt); collide(next); me.pos.copy(next); }
  if (moving) me.walkT += dt;
  const feet = me.pos; feet.y = groundHeight(feet.x, feet.z);   // level in the camp and on the paths; the rim rises a little at the edge
  const bob = moving ? Math.sin(me.walkT * 7) * 0.03 : 0;
  if (me.seat) me.drop = me.seat.drop ?? 0.42;   // how far the eye drops seated: 0.42 on a log (eye at about 1.13 m, level with the bearded's seated beside you: Adriaen 2026-11-14, at 0.83 m you looked up at him); a seat may say (jeepSeat.js: the jeep's is high)
  // the drop eases in with sitK, written out and not as util.js ease(): drop * ease(sitK) multiplies in another order and
  // rounds differently in the last bit, which would move the camera
  camera.position.set(feet.x, feet.y + EYE - (me.drop ?? 0.42) * me.sitK * me.sitK * (3 - 2 * me.sitK) + bob, feet.z);
  look.set(-Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), -Math.cos(me.yaw) * Math.cos(me.pitch)).add(camera.position);
  camera.lookAt(look);
}

export { me, step };
