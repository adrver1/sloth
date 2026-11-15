// Canopy Camp operator, the camp's places for him: his end of each log seat that is not Sunny's (camp/places.js logSeats,
// the op slots: { at, yaw, key, who, end, bowlEnd }), the tent bed, the gaps between the logs at the fire, and the claims
// that keep him and the sloths out of each other's places (camp/places.js).
// Exports SEATS, BED (null until findPlaces has found the tent), findPlaces(), fireGap(from), crateFront() (where he stands
// at the kitchen crate), freeOf(p, r), freeSeat(), claimPlace(key) and releasePlace() (named apart from camp/places.js claim and release, which take a place and who).
import * as THREE from "three";
import { scene } from "../core.js";
import { CRATE, SEAT_GAPS, TENT } from "../layout.js";
import { V } from "../util.js";
import { blockers } from "../campProps.js";
import { me } from "../player.js";
import { root } from "./model.js";
import { ME, RADIUS, op } from "./state.js";
import { bedKey, claim, holder, logSeats, release, taken } from "../places.js";

const ray = new THREE.Raycaster(), DOWN = V(0, -1, 0);
const SEATS = [];                                      // his slot on each log seat that isn't Sunny's (places.js logSeats: the op slots)
let BED = null;
function findPlaces() {
  if (SEATS.length) return true;
  const seats = logSeats(); if (!seats.length) return false;
  for (const s of seats) if (s.slots.op) SEATS.push({ ...s.slots.op, bowlEnd: s.ends[s.slots.op.end] });
  const tent = scene.getObjectByName("Tent");
  if (tent) {   // the bed along the tent's left wall (build_camp.py wall_tent: bed at (-W + 0.48, yb - 1.01), head toward +y; layout.js TENT.bed)
    const at = TENT.fromLocal, [bx, by] = TENT.bed;   // the tent's own frame: x across, y toward the back
    const c = at(bx, by); ray.set(V(c.x, 3, c.z), DOWN); ray.far = 4;
    const hits = ray.intersectObject(tent, true).filter((h) => h.point.y < 0.8 && h.point.y > 0.2), top = hits[0]?.point.y ?? 0.45;
    const head = at(bx, 1.2).sub(at(bx, 0)).normalize();
    BED = { key: bedKey(0), c: c.setY(top), head, side: at(-0.28, 0.35), door: at(0, -1.7), inside: at(0, -0.45), across: at(1, 0).sub(at(0, 0)).normalize() };
  }
  return true;
}
const fireGap = (from) => {                            // a spot just off the fire ring, in the gap between logs nearest `from`
  const a = [...SEAT_GAPS].sort((p, q) => Math.hypot(Math.cos(p) * 1.4 - from.x, Math.sin(p) * 1.4 - from.z) - Math.hypot(Math.cos(q) * 1.4 - from.x, Math.sin(q) * 1.4 - from.z))[0];
  return V(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
};
function freeOf(p, r = RADIUS) { return !blockers.some((b) => Math.hypot(p.x - b.at.x, p.z - b.at.z) < b.r + r); }
// a free seat: no one on it, no bowl on his end (review R2-209: he sat on one), and not right by you
const freeSeat = () => { findPlaces(); return SEATS.filter((s) => !holder(s.key) && !taken(s.bowlEnd.key) && !(me.seat && s.at.distanceTo(me.seat.pos) < 0.9)).sort((a, b) => a.at.distanceTo(root.position) - b.at.distanceTo(root.position))[0]; };
function claimPlace(key) { if (!claim(key, ME)) return false; op.place = key; return true; }
function releasePlace() { if (op.place) release(op.place, ME); op.place = null; }

const crateFront = () => CRATE.at.clone().addScaledVector(CRATE.at.clone().negate().normalize(), 0.75);   // 0.75 m toward the fire
export { BED, SEATS, claimPlace, crateFront, findPlaces, fireGap, freeOf, freeSeat, releasePlace };
