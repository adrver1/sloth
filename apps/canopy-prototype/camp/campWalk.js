// Canopy Camp's walkable ground for the shared player (player.js setPlayer: campStage.js hands it over): the clearing, the
// first stretch of the jeep's track, the paths and the glades. campBounds(p) keeps the point p (a Vector3) on them, and
// campStart puts you where the camp starts you, facing the fire and the big tree behind it.
// Exports campBounds(p) and campStart(me).
import { track } from "./forest.js";
import { V, polyDist, yawTo } from "./util.js";
import { GLADES, PATHS, RC, d0, t0 } from "./layout.js";

const near = V();
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
export function campBounds(p) {
  const r = Math.hypot(p.x, p.z), lim = RC - 0.7;
  if (r <= lim) return;
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
export function campStart(me) { me.pos.copy(d0).multiplyScalar(-4.4).addScaledVector(t0, -0.6); me.yaw = yawTo(d0); me.pitch = 0.08; }
