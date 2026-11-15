// Canopy Camp and Summit Cabin player (both levels walk with it: Adriaen 2026-11-15, one shared player): first person, the
// walk with the keys or the phone stick, sitting (linger.js, jeepSeat.js), the head bob, and the push out of the blockers.
// The level hands over the rest with setPlayer({ camera, groundAt(x, z), bounds(p), blockers }): its camera, its ground's
// height, where you may walk (bounds keeps the point p, a Vector3, inside the walkable part: the camp's clearing, track,
// paths and glades in campWalk.js; the summit's fence, trees, cabin and jeep in summit/player.js), and the blockers (circles,
// or a .walk circle or capsule) you slide round. me is the player: where you stand (pos, the feet), where you look, and the
// seat you are on; me.x, me.z (pos) and me.y (the eye's height, as step() last put it) are there for the summit's modules.
// Exports me, setPlayer(level), step(dt) (the page's main.js, each frame) and feetAt(x, z) (the level's ground).
import { keys, stickV, view } from "./hud.js";
import { V } from "./util.js";

// ================================================================ the player: first person
const EYE = 1.55, BODY = 0.25;
const pace = { speed: 1.7, stride: 4 };   // m/s: a stroll, and a long walk's pace; the debug sliders change them (speedSliders)   // BODY: how far you keep from things (was 0.3)
// vel: walking speed; walkT: seconds walked (the head bob); lastDrag: when you last looked round yourself, on the camp's clock;
// seat: { pos, yaw, and for the jeep's drop, pitch, leave } while you sit (linger.js, jeepSeat.js); sitK eases 0..1 as you sit
// down; step() adds drop, how far the eye is lowered on that seat
const me = { vel: V(), pos: V(), yaw: 0, pitch: 0.08, walkT: 0, lastDrag: -9, seat: null, sitK: 0, eye: EYE,
  get x() { return this.pos.x; }, set x(v) { this.pos.x = v; }, get z() { return this.pos.z; }, set z(v) { this.pos.z = v; },
  get y() { return this.eye; }, set y(v) { this.eye = v; } };
const level = { camera: null, groundAt: () => 0, bounds: () => {}, blockers: [] };
function setPlayer(o) { Object.assign(level, o); if (o.camera) view.camera = o.camera; }
const feetAt = (x, z) => level.groundAt(x, z);   // the level's ground in the world (jeepSeat.js ducks you in and out over it)
const look = V(), fwd = V(), right = V(), wish = V(), next = V();   // scratch vectors, reused every frame
function collide(p) {
  level.bounds(p);
  // push out of each blocker along the shortest way, so you slide round it instead of stopping; three passes, so a corner
  // where two touch settles too. A blocker's .walk shape (campProps.js) is used when it has one: a circle, or a capsule a..b
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const B of level.blockers) {
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
  // a long walk speeds up (Adriaen 2026-11-15, the summit's lookout was too far at a stroll): after 2.5 s of walking you ease
  // up from a stroll (pace.speed) to a long walk's pace (pace.stride) over 3 s; stopping or sitting starts you at a stroll again. No run button (Adriaen 2026-11-15)
  me.strideT = !me.seat && wish.lengthSq() > 0.25 ? (me.strideT || 0) + dt : 0;
  const k = Math.min(1, Math.max(0, (me.strideT - 2.5) / 3));
  if (!me.seat) me.vel.lerp(wish.multiplyScalar(pace.speed + (pace.stride - pace.speed) * k * k * (3 - 2 * k)), 1 - Math.exp(-10 * dt));
  if (!me.seat && me.vel.length() > 0.05) { moving = true; next.copy(me.pos).addScaledVector(me.vel, dt); collide(next); me.pos.copy(next); }
  if (moving) me.walkT += dt;
  const feet = me.pos; feet.y = level.groundAt(feet.x, feet.z);   // the level's ground: the camp's clearing and paths, the summit's snow and porch deck
  const bob = moving ? Math.sin(me.walkT * 7) * 0.03 : 0;
  if (me.seat) me.drop = me.seat.drop ?? 0.42;   // how far the eye drops seated: 0.42 on a log (eye at about 1.13 m, level with the bearded's seated beside you: Adriaen 2026-11-14, at 0.83 m you looked up at him); a seat may say (jeepSeat.js: the jeep's is high)
  // the drop eases in with sitK, written out and not as util.js ease(): drop * ease(sitK) multiplies in another order and
  // rounds differently in the last bit, which would move the camera
  const camera = level.camera;
  camera.position.set(feet.x, feet.y + EYE - (me.drop ?? 0.42) * me.sitK * me.sitK * (3 - 2 * me.sitK) + bob, feet.z);
  look.set(-Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), -Math.cos(me.yaw) * Math.cos(me.pitch)).add(camera.position);
  camera.lookAt(look); me.eye = camera.position.y;
}

// the debug tools' walking speed sliders (Adriaen 2026-11-15: "walking speed access as a slider in debug mode"), in the
// level's debug menu: camp ?dev (core.js), summit ?debug=1 (summit/player.js); styled by camp/hud.css .time
function speedSliders(into) {
  for (const [k, label, max] of [["speed", "🚶 Stroll", 6], ["stride", "🥾 Long walk", 12]]) {
    const row = document.createElement("label"), inp = document.createElement("input"), out = document.createElement("span");
    row.className = "time"; inp.type = "range"; inp.min = "0.5"; inp.max = String(max); inp.step = "0.1"; inp.value = String(pace[k]); inp.setAttribute("aria-label", label);
    const show = () => { out.textContent = `${pace[k].toFixed(1)} m/s`; }; show();
    inp.oninput = () => { pace[k] = +inp.value; show(); };
    row.append(label + " ", inp, out); into.append(row);
  }
}
export { feetAt, me, pace, setPlayer, speedSliders, step };
