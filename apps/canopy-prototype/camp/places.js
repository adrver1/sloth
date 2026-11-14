// Canopy Camp places: who is where (Adriaen 2026-11-12: "coordinate such that characters take each other into account";
// camp review operator-10, sloths-30: the camp's registry, not the sloths'). A place is a string key that the characters
// agree on: a seat ("log:1"), a bed ("bed:0"), a place at the table ("table:0"), a sloth's home ("seat:Sunny"). Whoever
// uses one claims it, so no one sits or lies on someone else. Anyone walking about is a mover, and the walkers steer round
// the movers. No random numbers, nothing built on import.
//   claim(place, who) -> true when it is who's now (or already was); release(place, who) frees it if who holds it (or
//   whoever holds it, with no who); holder(place) -> who, or undefined; taken(place) -> someone (or something) holds it
//   host(place, fn), hosted(place), join(place, s): a place someone is using may still take a sloth too (a bed or a seat
//   the operator is in): its user registers fn; join asks it, and fn takes the sloth (sloth/lend.js lend) if it says yes
//   addMover(object3D, radius): a single walker (the operator); addCrowd(fn): a group, fn(add) calls add(position, radius)
//   for each of them (the sloths on the ground); walkers: the single ones as [object3D, radius]
//   movers() -> [[position, radius], ...]: the crowds, then the single walkers, then you (the camera, 0.3 m). The array and
//   its pairs are reused on the next call (review R2-019: no allocation per walking frame), so read it at once, never keep it.
//   seatLog(i): the log seat Seat_<i> round the fire (campProps.js puts one on each of layout.js's SEATS), or undefined;
//   seatKey(i, left): its place, "log:<i>"; on Sunny's bench (Seat_0) Sunny holds "log:0" and you sit at its left end,
//   seatKey(0, true) = "log:0:left"; bedKey(i): the tent bed's two places, "bed:0" and "bed:1" (the operator lies along
//   the whole bed as "bed:0")
import { camera, scene } from "./core.js";

const claims = new Map(), hosts = new Map(), walkers = [], crowds = [];

function claim(place, who) { const h = claims.get(place); if (h && h !== who) return false; claims.set(place, who); return true; }
function release(place, who) { if (!who || claims.get(place) === who) claims.delete(place); }
const holder = (place) => claims.get(place);
const taken = (place) => claims.has(place);

function host(place, fn) { hosts.set(place, fn); }
const hosted = (place) => hosts.has(place);
function join(place, s) { const fn = hosts.get(place); return !!fn && !!fn(s); }

function addMover(obj, r) { walkers.push([obj, r]); }
function addCrowd(fn) { crowds.push(fn); }
const moving = [], pairs = [];
const add = (p, r) => { const e = pairs[moving.length] ??= [null, 0]; e[0] = p; e[1] = r; moving.push(e); };
function movers() {
  moving.length = 0;
  for (const fn of crowds) fn(add);
  for (const [o, r] of walkers) add(o.position, r);
  add(camera.position, 0.3); return moving;
}

const seatLog = (i) => scene.getObjectByName(`Seat_${i}`);
const seatKey = (i, left = false) => left ? `log:${i}:left` : `log:${i}`;
const bedKey = (i) => `bed:${i}`;

export { addCrowd, bedKey, seatKey, seatLog, addMover, claim, holder, host, hosted, join, movers, release, taken, walkers };
