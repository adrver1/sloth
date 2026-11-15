// Canopy Camp places: who is where (Adriaen 2026-11-12: "coordinate such that characters take each other into account";
// camp review operator-10, sloths-30: the camp's registry, not the sloths'). A place is a string key that the characters
// agree on: a seat ("log:1"), a bed ("bed:0"), a place at the table ("table:0"), a sloth's home ("seat:Sunny"). Whoever
// uses one claims it, so no one sits or lies on someone else. Anyone walking about is a mover, and the walkers steer round
// the movers. No random numbers, nothing built on import.
//   claim(place, who) -> true when it is who's now (or already was); release(place, who) frees it if who holds it (or
//   whoever holds it, with no who); holder(place) -> who, or undefined; taken(place) -> someone (or something) holds it
//   host(place, fn), hosted(place), join(place, s): a place someone is using may still take a sloth too (a bed or a seat
//   the operator is in): its user registers fn, and host(place, null) when they leave; join asks it, and fn takes the
//   sloth (sloth/lend.js lend) if it says yes
//   addMover(object3D, radius): a single walker (the operator); addCrowd(fn): a group, fn(visit) calls visit(position,
//   radius) for each of them (the sloths on the ground); walkers: the single ones as [object3D, radius]
//   eachMover(visit): visit(position, radius) for the crowds, then the single walkers, then you (the camera, 0.3 m), with
//   no arrays made (the operator's walk, each frame); movers() -> [[position, radius], ...]: the same as a list (the tools)
//   logSeats(): the log seats round the fire, the one table of them (review R2-209), built once from Seat_<i> (campProps.js
//   stands one on each of layout.js's SEATS) the first time it is asked for after buildProps; [] while one is missing. A
//   seat is { i, key: seatKey(i), o (the log), c (its middle, on the ground), along (its long axis, to your right as you
//   face the fire from it), slots, ends }. slots are where someone sits, each { at, yaw (facing the fire), key (the place
//   it holds), who }: you (who "player": its middle, a little back, at ground height; on Sunny's bench, Seat_0, its left end,
//   seatKey(0, "left")), sunny (Seat_0 only: Sunny's spot on its top, key "log:0", no who: sloth/spots.js claims it for whichever sloth is there), op
//   (Seat_1 and Seat_2: the operator's end, away from the things on the middle log, on the log's top; who "operator",
//   end: which of ends it sits on). On logs 1 and 2 you and the operator hold the same key: one of you sits there at a time.
//   ends are the log's two ends, where a bowl of soup goes (layout.js SEAT_SLOT.bowl), each { at (on the top), key:
//   seatKey(i, "end0") (+along) or "end1", seat }; a bowl holds its end as "bowl" (activities/soupChore.js via chores.js)
//   endFree(end): no bowl on that end and no one sitting on it (the operator on his end)
//   seatKey(i, part): a seat's place, "log:<i>", or "log:<i>:<part>" for a
//   part of it (Sunny holds "log:0", you on that bench "log:0:left"); bedKey(i): the tent bed's two places, "bed:0" and
//   "bed:1" (the operator lies along the whole bed as "bed:0"). Build these keys with seatKey and bedKey, never by hand.
import * as THREE from "three";
import { camera, scene, SEAT_SLOT, SEATS, toStage, toWorld } from "./stage.js";

const claims = new Map(), hosts = new Map(), walkers = [], crowds = [];

function claim(place, who) { const h = claims.get(place); if (h && h !== who) return false; claims.set(place, who); return true; }
function release(place, who) { if (!who || claims.get(place) === who) claims.delete(place); }
const holder = (place) => claims.get(place);
const taken = (place) => claims.has(place);

function host(place, fn) { if (fn) hosts.set(place, fn); else hosts.delete(place); }   // fn null: no longer hosted (review R2-046)
const hosted = (place) => hosts.has(place);
function join(place, s) { const fn = hosts.get(place); return !!fn && !!fn(s); }

function addMover(obj, r) { walkers.push([obj, r]); }
function addCrowd(fn) { crowds.push(fn); }
function eachMover(visit) { for (const fn of crowds) fn(visit); for (const [o, r] of walkers) visit(o.position, r); visit(camera.position, 0.3); }
const movers = () => { const out = []; eachMover((p, r) => out.push([p, r])); return out; };

const seatLog = (i) => scene.getObjectByName(`Seat_${i}`);
const seatKey = (i, part) => part ? `log:${i}:${part}` : `log:${i}`;
const bedKey = (i) => `bed:${i}`;

let seatTable = null;
function logSeats() {
  if (seatTable) return seatTable;
  const logs = SEATS.map((_, i) => seatLog(i)); if (logs.some((o) => !o)) return [];
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), things = scene.getObjectByName("SeatThings");
  const thingsAt = things && toStage(new THREE.Box3().setFromObject(things).getCenter(new THREE.Vector3()));
  const toFire = (p) => Math.atan2(p.x, p.z);
  seatTable = logs.map((o, i) => {
    o.updateMatrixWorld(true);
    const c = toStage(o.getWorldPosition(new THREE.Vector3())).setY(0), along = new THREE.Vector3(1, 0, 0).transformDirection(o.matrixWorld).setY(0).normalize();
    const tops = [o, scene.getObjectByName(`SeatTop_${i}`)].filter(Boolean), boxTop = toStage(new THREE.Box3().setFromObject(o).max).y;
    const onTop = (d) => { const p = c.clone().addScaledVector(along, d); ray.set(toWorld(p.clone().setY(3)), down); ray.far = 4; const h = ray.intersectObjects(tops, true)[0]; return p.setY(h ? toStage(h.point).y : boxTop); };
    const seat = { i, key: seatKey(i), o, c, along, slots: {}, ends: [] };
    seat.ends = [1, -1].map((sg, e) => ({ at: onTop(sg * SEAT_SLOT.bowl), key: seatKey(i, "end" + e), seat }));
    const you = c.clone().multiplyScalar(1 + SEAT_SLOT.back / c.length());
    if (i === 0) {
      you.addScaledVector(along, SEAT_SLOT.youOn0);
      const sunny = onTop(SEAT_SLOT.sunny); seat.slots.sunny = { at: sunny, yaw: toFire(sunny), key: seatKey(0) };
    }
    seat.slots.you = { at: you, yaw: toFire(you), key: i === 0 ? seatKey(0, "left") : seatKey(i), who: "player" };
    if (i > 0) {   // the operator's end: the first log's -along end, the second's +along, or away from the things on the log
      let side = i === 1 ? -1 : 1;
      if (thingsAt && thingsAt.distanceTo(toStage(o.getWorldPosition(new THREE.Vector3()))) < 1.2) side = thingsAt.clone().sub(c).dot(along) > 0 ? -1 : 1;
      seat.slots.op = { at: onTop(side * SEAT_SLOT.op), yaw: toFire(c), key: seatKey(i), who: "operator", end: side > 0 ? 0 : 1 };
    }
    return seat;
  });
  return seatTable;
}
function endFree(end) {
  if (taken(end.key)) return false;
  const s = end.seat.slots.op;
  return !(s && end.seat.ends[s.end] === end && holder(s.key) === s.who);
}

export { addCrowd, bedKey, endFree, logSeats, seatKey, addMover, claim, eachMover, holder, host, hosted, join, movers, release, taken, walkers };
