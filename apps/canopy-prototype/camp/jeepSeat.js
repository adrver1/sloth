// Canopy Camp jeep seats (Adriaen 2026-11-13): sit in the driver's or the passenger's seat, like the log benches by the fire.
// "Get in" on a front door walks you round to it (opening it if shut), ducks you in under the roof and onto the seat with a
// little bounce of the springs, turns you to face the windscreen and swings the door shut. "Get out" (on the door), or walking
// off with the stick or the keys, opens it, ducks you back out and leaves you standing beside it, and the door shuts behind you.
// While you sit the view drifts gently like on a log (linger.js does that for any seat). The wheel is on +X (left-hand drive),
// so the camp-side door DoorP leads to the driver's seat (SeatP) and DoorD to the passenger's at -X.
// Never on a sloth: the driver's seat is the jeep sloth's home (sloths.js spot "jeep"; a napping guest uses it too), so it is
// busy while a sloth is in it, climbing in or out, or waiting at the door; then that door says so and you ride beside it from
// the other side. While you sit you hold the seat in window.__campLife ("jeep:driver" / "jeep:passenger"), and sloths.js
// sends a sloth coming home to it off for a wander until you get out.
// window.__jeep.sit(side) / stand() / seatedIn() ("driver" | "passenger" | null, only once you have settled) for car.js and checks;
// window.__car.doorOptions(d) gives each front door its Get in / Get out (input.js).
import * as THREE from "three";
import { uTime } from "./core.js";
import { V } from "./forest.js";
import { me } from "./player.js";
import { sloths } from "./sloths.js";
import { groundHeight } from "./terrain.js";
import { toast } from "./hud.js";

const J = window.__jeep, jeep = J?.node;
let jeepSeatStep = () => {};
if (jeep) {
  const S0 = jeep.worldToLocal(jeep.getObjectByName("SeatP").getWorldPosition(V()));   // the driver's cushion top, jeep space
  const EYE_UP = 0.55, STAND = 1.55, WALK = 1.7;
  const SIDES = { driver: { k: "P", x: 1 }, passenger: { k: "D", x: -1 } };
  for (const [name, s] of Object.entries(SIDES)) {
    s.name = name;
    s.seat = V(S0.x * s.x, 0, S0.z - 0.08);           // where you sit, a little back on the cushion
    s.door = V(s.x * (Math.abs(S0.x) + 0.99), 0, S0.z); // standing outside the open door
  }
  const W = (v) => jeep.localToWorld(v.clone());
  const fwdYaw = () => { const f = V(0, 0, 1).transformDirection(jeep.matrixWorld); return Math.atan2(-f.x, -f.z); };
  const yawTo = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z));
  const eyeWorld = () => jeep.position.y + S0.y + EYE_UP;
  const life = () => window.__campLife;

  // a sloth in (or getting into or out of) the driver's seat: the jeep sloth at home, a guest napping there, one at the door
  const OUTSIDE = new Set(["walk", "greet", "eat", "rest", "fix", "held"]);
  const slothIn = (side) => side === "driver"
    ? sloths.find((s) => s.spot?.car && !OUTSIDE.has(s.trip?.phase))
    : sloths.find((s) => { const p = s.o.getWorldPosition(V()), l = jeep.worldToLocal(p); return l.y > 0.4 && Math.abs(l.x - SIDES.passenger.seat.x) < 0.3 && Math.abs(l.z - SIDES.passenger.seat.z) < 0.4; });

  let cur = null;   // { side, phase: "walk" | "door" | "in" | "settle" | "sat" | "open" | "out", t, ... }
  const seat = { pos: V(), yaw: 0, drop: 0, pitch: -0.3, car: true, leave: () => stand() };   // pitch: the gaze rests on the dash (linger.js), where the key, clock and radio are
  const ease = (k) => k * k * (3 - 2 * k);
  // the way round to the door: out to the side first, and round the front or the back if you start on the other side
  function route(from, s) {
    const p = jeep.worldToLocal(from.clone()), pts = [], X = 1.65 * s.x, END = 2.45;
    if (Math.sign(p.x) !== s.x && Math.abs(p.z) < END) { const z = p.z >= 0 ? END : -END; pts.push(V(p.x, 0, z), V(X, 0, z)); }
    else if (Math.abs(p.x) < Math.abs(X)) pts.push(V(X, 0, Math.abs(p.z) > END ? p.z : Math.max(-END, Math.min(END, p.z))));
    pts.push(s.door.clone());
    return [from.clone().setY(0), ...pts.map((q) => W(q).setY(0))];
  }
  function claim(side, on) { const L = life(); if (!L) return; on ? L.claim(`jeep:${side}`, "player") : L.release(`jeep:${side}`, "player"); }
  function sit(side = "driver") {
    if (cur) return false;
    const s = SIDES[side]; if (!s) return false;
    const who = slothIn(side); if (who) { toast(`${who.name} is in that seat 🦥`); return false; }
    claim(side, true);
    const path = route(me.pos, s); let len = 0; for (let i = 1; i < path.length; i++) len += path[i].distanceTo(path[i - 1]);
    cur = { side, s, phase: "walk", t: 0, path, len, yaw0: me.yaw };
    me.seat = seat; me.sitK = 1; seat.drop = 0; seat.pos.copy(me.pos);
    return true;
  }
  function stand() {
    if (cur && (cur.phase === "walk" || cur.phase === "door")) { claim(cur.side, false); cur = null; me.seat = null; me.sitK = 0; return true; }   // walked off on the way
    if (!cur || cur.phase !== "sat") return false;
    cur.phase = "open"; cur.t = 0; J.open(cur.s.k); me.seat = seat;   // walking cleared it; stay put until you are out
    return true;
  }
  const seatedIn = () => cur?.phase === "sat" ? cur.side : null;
  function setStand(pos) { seat.pos.copy(pos); me.pos.copy(pos); seat.drop = 0; }
  function setIn(k, yaw0, yaw1) {                     // k 0 at the door, 1 on the seat: duck in under the roof, turn to face ahead
    const s = cur.s, e = ease(k), p = W(s.door.clone().lerp(s.seat, e)).setY(0), g = groundHeight(p.x, p.z);
    const h = THREE.MathUtils.lerp(g + STAND, eyeWorld(), e) - 0.16 * Math.sin(Math.PI * Math.min(1, k * 1.3));   // the duck under the door frame
    seat.pos.copy(p); me.pos.copy(p); seat.drop = g + STAND - h;
    let d = yaw1 - yaw0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    me.yaw = yaw0 + d * ease(Math.min(1, k * 1.15)); seat.yaw = yaw1;
  }
  const sideYaw = (s) => yawTo(W(s.door), W(s.seat));   // facing in through the door
  jeepSeatStep = (dt) => {
    if (!cur) return;
    const T = cur, s = T.s; T.t += dt * (window.__campFast || 1);   // __campFast: quicker for checks
    if (T.phase !== "sat") me.lastDrag = uTime.value;   // no gaze drift while moving (linger.js)
    if (me.seat !== seat) { if (T.phase === "sat") { if (!stand()) return; } else me.seat = seat; }
    if (T.phase === "walk") {                          // round to the door, opening it when you get close
      let d = Math.min(T.len, T.t * WALK), i = 1;
      while (i < T.path.length - 1 && d > T.path[i].distanceTo(T.path[i - 1])) { d -= T.path[i].distanceTo(T.path[i - 1]); i++; }
      const a = T.path[i - 1], b = T.path[i], seg = a.distanceTo(b), p = seg > 1e-4 ? a.clone().lerp(b, Math.min(1, d / seg)) : b.clone();
      setStand(p);
      const want = T.len - T.t * WALK > 0.15 ? yawTo(a, b) : sideYaw(s);
      let dy = want - me.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; me.yaw += dy * Math.min(1, dt * 6);
      me.pitch += (-0.05 - me.pitch) * Math.min(1, dt * 4);
      if (T.len - T.t * WALK < 1.5) J.open(s.k);
      if (T.t * WALK >= T.len) { T.phase = "door"; T.t = 0; T.yaw0 = me.yaw; }
    } else if (T.phase === "door") {                   // wait for the door to swing open
      if (J.isOpen(s.k) && T.t > 0.15) { T.phase = "in"; T.t = 0; T.yaw0 = me.yaw; }
    } else if (T.phase === "in") {                     // about 1.3 s in
      const k = Math.min(1, T.t / 1.3); setIn(k, T.yaw0, fwdYaw()); me.pitch += (-0.2 - me.pitch) * Math.min(1, dt * 3);
      if (k >= 1) { T.phase = "settle"; T.t = 0; }
    } else if (T.phase === "settle") {                 // a little bounce on the springs, then the door swings shut
      const k = Math.min(1, T.t / 0.45); setIn(1, me.yaw, fwdYaw()); seat.drop += 0.03 * Math.sin(Math.PI * k) * (1 - k * 0.5);
      if (k >= 1) { T.phase = "sat"; T.t = 0; J.close(s.k); seat.yaw = fwdYaw(); me.lastDrag = -9;
        toast(T.side === "driver" ? "At the wheel 🚙" : (slothIn("driver") ? `Riding with ${slothIn("driver").name} 🦥` : "In the passenger seat 🚙")); }
    } else if (T.phase === "sat") {
      setIn(1, me.yaw, me.yaw);
    } else if (T.phase === "open") {                   // the door opens first
      setIn(1, me.yaw, me.yaw);
      if (J.isOpen(s.k) && T.t > 0.15) { T.phase = "out"; T.t = 0; T.yaw0 = me.yaw; }
    } else if (T.phase === "out") {                    // about 1.1 s out, turning toward the door
      const k = Math.min(1, T.t / 1.1); setIn(1 - k, sideYaw(s) + Math.PI, T.yaw0);
      { let d = sideYaw(s) + Math.PI - T.yaw0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; me.yaw = T.yaw0 + d * ease(k); }
      me.pitch += (0 - me.pitch) * Math.min(1, dt * 3);
      if (k >= 1) { const k2 = s.k; setStand(W(s.door).setY(0)); me.seat = null; me.sitK = 0; me.drop = 0; claim(T.side, false); cur = null; setTimeout(() => J.close(k2), 700); }
    }
  };
  Object.assign(J, { sit, stand, seatedIn, seatBusy: (side) => slothIn(side)?.name ?? null });
  // the front doors' menus (input.js): Get in on the closed or open door, Get out while you sit there
  window.__car = Object.assign(window.__car ?? {}, {
    doorOptions: (d) => {
      const side = d.k === "P" ? "driver" : d.k === "D" ? "passenger" : null; if (!side) return [];
      if (cur) return cur.side === side && cur.phase === "sat" ? [["Get out 🚪", stand]] : [];
      const who = slothIn(side);
      if (who) return [[`${who.name} is at the wheel: hop in the other side 🦥`, () => toast("Round the front to the other door 🦥")]];
      return [[side === "driver" ? "Sit at the wheel 🚙" : "Sit in the passenger seat 🚙", () => sit(side)]];
    },
  });
}
export { jeepSeatStep };
