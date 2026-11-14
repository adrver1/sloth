// Canopy Camp operator, the camp's places for him: the free end of each log seat that is not Sunny's, the tent bed, the
// gaps between the logs at the fire, and the claims that keep him and the sloths out of each other's places (the sloths'
// life, window.__campLife).
// Exports SEATS, BED (null until findPlaces has found the tent), findPlaces(), fireGap(from), freeOf(p, r), freeSeat(),
// claim(key) and release().
import * as THREE from "three";
import { scene } from "../core.js";
import { SEAT_GAPS, TENT } from "../layout.js";
import { V } from "../util.js";
import { blockers } from "../campProps.js";
import { me } from "../player.js";
import { root } from "./model.js";
import { ME, RADIUS, life, op } from "./state.js";

const ray = new THREE.Raycaster(), DOWN = V(0, -1, 0);
const SEATS = [];                                      // the free end of each log seat that isn't Sunny's (Sunny's is Seat_0)
let BED = null;
function findPlaces() {
  if (SEATS.length) return true;
  for (const i of [1, 2]) {
    const log = scene.getObjectByName(`Seat_${i}`); if (!log) return false;
    log.updateMatrixWorld(true);
    const ax = V(1, 0, 0).transformDirection(log.matrixWorld).setY(0).normalize(), c = log.getWorldPosition(V());
    const things = scene.getObjectByName("SeatThings"); let side = i === 1 ? -1 : 1;
    if (things) { const t = new THREE.Box3().setFromObject(things).getCenter(V()); if (t.distanceTo(c) < 1.2) side = t.clone().sub(c).dot(ax) > 0 ? -1 : 1; }
    const at = c.clone().addScaledVector(ax, side * 0.36);
    ray.set(V(at.x, 3, at.z), DOWN); ray.far = 4;
    const tops = [log, scene.getObjectByName(`SeatTop_${i}`)].filter(Boolean), top = ray.intersectObjects(tops, true)[0]?.point.y ?? 0.42;
    SEATS.push({ key: `log:${i}`, at: at.setY(top), yaw: Math.atan2(c.x, c.z) });   // facing the fire
  }
  const tent = scene.getObjectByName("Tent");
  if (tent) {   // the bed along the tent's left wall (build_camp.py wall_tent: bed at (-W + 0.48, yb - 1.01), head toward +y; layout.js TENT.bed)
    const at = TENT.fromLocal, [bx, by] = TENT.bed;   // the tent's own frame: x across, y toward the back
    const c = at(bx, by); ray.set(V(c.x, 3, c.z), DOWN); ray.far = 4;
    const hits = ray.intersectObject(tent, true).filter((h) => h.point.y < 0.8 && h.point.y > 0.2), top = hits[0]?.point.y ?? 0.45;
    const head = at(bx, 1.2).sub(at(bx, 0)).normalize();
    BED = { key: "bed:0", c: c.setY(top), head, side: at(-0.28, 0.35), door: at(0, -1.7), inside: at(0, -0.45), across: at(1, 0).sub(at(0, 0)).normalize() };
  }
  return true;
}
const fireGap = (from) => {                            // a spot just off the fire ring, in the gap between logs nearest `from`
  const a = [...SEAT_GAPS].sort((p, q) => Math.hypot(Math.cos(p) * 1.4 - from.x, Math.sin(p) * 1.4 - from.z) - Math.hypot(Math.cos(q) * 1.4 - from.x, Math.sin(q) * 1.4 - from.z))[0];
  return V(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
};
function freeOf(p, r = RADIUS) { return !blockers.some(([c, br]) => Math.hypot(p.x - c.x, p.z - c.z) < br + r); }
const freeSeat = () => { findPlaces(); return SEATS.filter((s) => !life().holder?.(s.key) && !(me.seat && s.at.distanceTo(me.seat.pos) < 0.9)).sort((a, b) => a.at.distanceTo(root.position) - b.at.distanceTo(root.position))[0]; };
function claim(key) { const L = life(); if (L.claim && !L.claim(key, ME)) return false; op.place = key; return true; }
function release() { if (op.place) life().release?.(op.place, ME); op.place = null; }

export { BED, SEATS, claim, findPlaces, fireGap, freeOf, freeSeat, release };
