// Canopy Camp sloths: the wild sloths hanging in the trees, the seven named sloths living in camp and going about their day
// (errands to the snack table and crate, s'mores, saying hello, wayfinding), and their life: fur, blinks, looks and a wave.
import * as THREE from "three";
import { jeepApi } from "./jeep.js";
import { LIVED, OPT, R, scene } from "./core.js";
import { V } from "./util.js";
import { HERO, LAUNDRY, RC } from "./layout.js";
import { branchCurves } from "./forest.js";
import { CAMP } from "./campProps.js";
import { CAST } from "./cast.js";
import { load, save } from "./save.js";
import { burst, fx, sprite } from "./fx.js";
import { addLabButton } from "./labButton.js";
import { HAMMOCK_PIVOT } from "./swing.js";
import { CRAWL, GROUND, HW, HW_POST, MAX_OUT, SL, WALK_TS, camp, guests, hit, sloths, spots, wild } from "./sloth/state.js";
import { hang, warmStep } from "./sloth/body.js";
import { slothsStep } from "./sloth/life.js";
import { clipOf, homeClip, play, playOnce } from "./sloth/clips.js";
import { ROPE_L, UP, barkProfile, climbYaw, linePose, postPose, ropePose, treeOf, trunkAt, turnTo, underAt, yawOf } from "./sloth/poses.js";
import { climbV, glide, glideStep, slide, slideStep, toGround } from "./sloth/moves.js";
import { brush, buildGuests, buildSpots } from "./sloth/spots.js";
import { buildNav, findPath, greetStep, isFree, walkStep, walkTo } from "./sloth/walk.js";
import { doze, hammockStep, napStep, zStep } from "./sloth/naps.js";
import { buildTable, fruitStep, pois } from "./sloth/table.js";
import { eatStep, startEat } from "./sloth/eating.js";
import { buildCards, quitGame, startCards } from "./sloth/cards.js";
import { eatGift, giftFly, giftStep } from "./sloth/gifts.js";
import { buildSmore, smoreStep, stopSmore } from "./sloth/smore.js";
import { buildSpanner, fixEngine, fixStep } from "./sloth/fix.js";
import { addCrowd, addMover, claim, holder, host, hosted, join, movers, release, taken } from "./places.js";

// Adriaen 2026-11-12 ("simplify the gameplay loop"): no befriending. One wild sloth still hangs in each big tree (on the low
// branch reaching furthest out, so the branches nearest the fire stay free for the camp's two branch sloths); the seven
// named sloths live in the camp from the start (below). The tripod sloth is gone (Adriaen: too close to the fire).
for (const tree of HERO) {
  const mine = branchCurves.filter((c) => c.low && treeOf(c).distanceTo(V(tree.x, 0, tree.z)) < 0.1).sort((a, b) => b.getPointAt(0.65).length() - a.getPointAt(0.65).length());
  for (const c of mine) {
    const t = R(0.5, 0.8), p = c.getPointAt(t), tan = c.getTangentAt(t);
    if (tan.x * p.x + tan.z * p.z > 0) tan.negate();   // head toward the middle of the clearing, so you meet its face
    if (sloths.every((s) => s.p.distanceTo(p) > 1.6)) { hang(p, tan); Object.assign(sloths.at(-1), { wild: true, perch: { curve: c, t, tree } }); break; }
  }
}
// ---------------------------------------------------------------- sloths living in the camp (thread "Bring sloths to life in camp")
// Adriaen 2026-11-12: the seven named sloths (cast.js) live in camp from the start, one in each spot: the hammock (naps on
// its back, eyes shut, zzz; the hammock sways gently all the time), the log seat right of the gap, the jeep's driver seat
// (plays at driving), the laundry line, the tent doorway and two low branches at the camp's edge. Each now and then leaves
// its spot, crawls to the snack table or the kitchen crate to eat, and goes back the way it came (daily life, below).
// Clips nap, reach, walk, hang_walk, drive, peek: characters/sloth_baby/sloth_rig.py.
// ?campsloths=0 turns them off; window.__campFast speeds them up for checks, window.__errand(name) sends one off now.
// ---------------------------------------------------------------- sloths living in the camp (thread "Bring sloths to life in camp")
// Adriaen 2026-11-11: the camp spots stay empty until a sloth is befriended. Then that same sloth (flower crown and all)
// lowers itself from its branch on a vine and crawls slowly over the ground to the next free spot, in this order:
// the hammock (climbs its post and the rope into it, naps on its back, eyes shut, zzz; the hammock sways gently all the time), then the log seat right of the
// gap (sits and slowly reaches for the kettle), then the jeep's driver seat (in through the open door, plays at driving),
// then the laundry line (climbs the end post, goes hand over hand along the line, brushing the towel aside, to the gap and hangs there). Clips nap, reach, walk, hang_walk: characters/sloth_baby/sloth_rig.py.
// Befriending belongs to the camp activities: it fires window event "sloth-befriended" with detail.id = index into sloths.
// ?campsloths=0 turns the spots off; window.__campFast speeds the trips up for checks.
let campStep = () => {}, labApi;   // labApi: what the move lab drives (lab.js); undefined with ?campsloths=0
if (OPT.campsloths) {
  function shutEyes(o) {                              // asleep: the eyes (and their glints on the fur) take the dark patch colour round them
    const s = sloths.find((q) => q.o === o); if (!s) return;
    s.asleep = true; s.eyes(true);
  }

  const q0 = new THREE.Quaternion(), tmp = V(), PIV = HAMMOCK_PIVOT, LL = LIVED ? LAUNDRY : null;
  buildSpots();   // the hammock, the seat, the jeep, the line, the tent and two branches (spots.js)
  // climbing (Adriaen 2026-11-12: "climb down the tree rather than a vine"): a branch sloth turns round on its branch, goes
  // hand over hand along it to the trunk, turns onto the trunk and climbs down it tail first, facing the bark, then steps
  // off onto the ground; climbUp is the same the other way. Trunk radius from barkProfile; speed is hang_walk's.
  function climbDown(s, then) {
    const { curve: c, t, t0, tree, out } = s.spot, L = c.getLength();
    const yTop = c.getPointAt(t0).y - 0.25 * s.sc, R = barkProfile(tree, out, yTop), back = (u) => underAt(s, c.getPointAt(u), c.getTangentAt(u).negate());
    play(s, "hang_walk", 1.2, HW);
    glide(s, back(t), 2.5, () => slide(s, t, t0, climbV(s) / L, back, () => {
      play(s, "hang_walk", 1.5, -HW);
      glide(s, trunkAt(s, tree, out, yTop, R), 3, () => slide(s, yTop, 0, climbV(s), (y) => trunkAt(s, tree, out, y, R),
        () => toGround(s, tree.clone().addScaledVector(out, R(0) + 0.45), Math.atan2(-out.x, -out.z), then)));
    }));
  }
  function climbUp(s, spot) {                          // up the trunk and out along the branch to its tip
    const { curve: c, t, t0, tree, out } = spot, L = c.getLength(), yTop = c.getPointAt(t0).y - 0.25 * s.sc, R = barkProfile(tree, out, yTop);
    play(s, "hang_walk", 1.5, HW);
    glide(s, trunkAt(s, tree, out, 0.02, R), 2.5, () => slide(s, 0.02, yTop, climbV(s), (y) => trunkAt(s, tree, out, y, R), () =>
      glide(s, underAt(s, c.getPointAt(t0), c.getTangentAt(t0)), 3, () => slide(s, t0, t, climbV(s) / L, (u) => underAt(s, c.getPointAt(u), c.getTangentAt(u)),
        () => { play(s, "cling", 3, 0.6); atHome(s); }))));
  }

  buildNav();   // the wayfinding grid (walk.js)

  // ---------------------------------------------------------------- daily life (Adriaen 2026-11-12): every camp sloth now and
  // then leaves its spot (no more than MAX_OUT at once), crawls to the snack table or the kitchen crate, sits and eats its
  // favourite there, sometimes wanders off for a sit and a look round, then goes home the way it first came. Two that meet
  // stop, sit up, face each other and say hello. Crawling and climbing are 1.4x what they were (Adriaen: "sliiightly faster").
  // who is where (places.js): a place is claimed by whoever uses it, and anyone walking about is a mover. `life` is what
  // the camp's other characters and the player's modules get of it and of the sloths (window.__campLife).
  addCrowd(() => camp.filter((o) => GROUND.has(o.trip.phase)).map((o) => [o.o.position, 0.18 * o.sc]));   // the sloths on the ground are movers
  const life = window.__campLife = {
    claim, release, holder, addMover, host, join, movers,
    // borrowing a sloth for a while (the operator picks one up to cuddle or play): only one on the ground, or Sunny on its
    // log. While lent its phase is "held": its life step, errands and greetings stop; its clip, blinks and fur keep going.
    path: (from, to) => findPath(from, to),
    lend(s, who, opt = {}) {
      const ph = s.trip?.phase; if (!camp.includes(s) || s.gift?.clip || !(["rest", "walk", "greet"].includes(ph) || (ph === "home" && s.spot.name === "seat"))) return false;
      if (s.trip.slot?.key && s.trip.slot.who === s) { s.trip.slot.who = null; life.release(s.trip.slot.key, s); }
      quitGame(s);   // its card game ends: the other one goes home
      stopSmore(s); s.dozing = s.asleep = false; s.eyes(false); s.once = null;
      life.release(`${s.spot.name}:${s.name}`, s); if (s.spot.name === "seat") life.release("log:0", s); s.spot.home = false;
      scene.attach(s.o); s.trip = { phase: "held", t: 0, yaw: 0, who }; if (opt.asleep) { s.asleep = true; s.eyes(true); } return true;
    },
    giveBack(s, at, yaw) {
      if (s.trip?.phase !== "held") return;
      if (s.asleep) { s.asleep = false; s.eyes(false); }
      scene.attach(s.o); s.o.position.set(at.x, 0, at.z); s.o.quaternion.setFromAxisAngle(UP, yaw); s.o.scale.setScalar(s.sc);
      s.trip = { phase: "rest", t: 0, yaw, dur: R(1.5, 3) }; play(s, "idle", 0.6);
    },
    sloths: camp,
    eatGift,   // food you give it (gifts.js)
  };
  // the things they use, made here in this order (the scene's objects and materials keep their order): where the paw is at
  // the grab and the fruits (table.js), the spanner (fix.js), the cards (cards.js), the s'more stick and marshmallow (smore.js)
  buildTable(); buildSpanner(); buildCards(); buildSmore();
  function wanderPoint() {
    for (let k = 0; k < 60; k++) { const a = R(0, 2 * Math.PI), r = R(2.6, RC - 2), p = V(Math.cos(a) * r, 0, Math.sin(a) * r); if (isFree(p) && camp.every((o) => o.o.position.distanceTo(p) > 1.2)) return p; }
    return V(3, 0, -2);
  }
  function atHome(s, first) {
    if (s.spot.guest) { s.trip.phase = "home"; s.spot.home = true; s.errand = 1e9; doze(s, R(60, 120)); s.dozeIn = 1.2; if (s.spot.car) setTimeout(() => jeepApi?.close("P"), 1500); return; }   // a nap trip: straight to sleep
    s.trip.phase = "home"; s.spot.home = true; life.claim(`${s.spot.name}:${s.name}`, s); if (s.spot.name === "seat") life.claim("log:0", s);   // e.g. "seat:Sunny", "jeep:Mango"
    s.errand = first ? R(4, 45) : R(35, 80) * (s.spot.asleep || s.spot.car ? 1.6 : 1);
    if (s.spot.asleep) { if (first) { s.dozing = s.asleep = true; s.eyes(true); s.dozeT = R(30, 150); s.dozeIn = 0; } else { doze(s, R(90, 180)); s.dozeIn = 1.5; } }   // Hibi: back in the hammock, a yawn and a long nap
    if (s.spot.car && !first) setTimeout(() => jeepApi?.close("P"), 1500);
  }
  function placeHome(s) {                             // straight into its spot, as if it had always lived there
    const spot = s.spot; s.sc = spot.scale; s.o.scale.setScalar(s.sc); s.act = s.mixer.existingAction(clipOf("cling"));
    s.trip = { phase: "home", t: 0, yaw: 0 };
    if (spot.branch || spot.line) {
      const P = spot.line ? linePose(s, spot.t) : underAt(s, spot.curve.getPointAt(spot.t), spot.curve.getTangentAt(spot.t));
      s.o.position.copy(P.p); s.o.quaternion.copy(P.q);
    } else {
      spot.parent.add(s.o); s.o.position.copy(spot.at); s.o.quaternion.setFromAxisAngle(UP, spot.yaw);
      play(s, spot.clip, 0.01);
    }
    atHome(s, true);
  }
  // leaving home: back out of its spot the way it came in, onto the ground, then off on its errand
  function downPost(s, spot, top, then) {             // from the top of a post, tail first down to the ground
    play(s, "hang_walk", 1.5, -HW_POST);
    glide(s, postPose(spot, top), 3, () => slide(s, top, 0, 0.015 * HW_POST * s.sc, (y) => postPose(spot, y),
      () => { const yaw = (spot.climbYaw ?? climbYaw) + Math.PI; toGround(s, spot.door.clone().add(V(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(0.3)), yaw, then); }));
  }
  // out of the tent bed (Adriaen 2026-11-13: "add a climb out of bed animation", not a glide): turn to the open side and
  // crawl to the edge, reach down over it nose first, step down onto the floor, then off to the door. Tent frame: the bed
  // lies along the left wall at x -0.92 (about 0.6 wide), the floor 0.02 up, +z out of the door.
  function bedOut(s, spot, go) {
    const z = spot.at.z, top = spot.at.y, side = -Math.PI / 2, Q = (yaw, pitch = 0) => new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch));
    play(s, "walk", 1.2, WALK_TS);
    glide(s, { p: V(-0.62, top, z), q: Q(side) }, 2.4, () =>                                   // round and to the edge
      glide(s, { p: V(-0.5, top - 0.06, z), q: Q(side, -0.55) }, 1.2, () =>                    // paws over, nose down
        glide(s, { p: V(-0.36, 0.02, z), q: Q(side, -0.3) }, 1.4, () =>                       // down onto the floor
          glide(s, { p: V(-0.25, 0.02, z + 0.05), q: Q(side + 0.4) }, 1.0, () => {            // level again, turning to the door
            const door = spot.door, away = Math.atan2(-(door.x - s.o.getWorldPosition(tmp).x), -(door.z - tmp.z));
            scene.attach(s.o); play(s, "walk", 1, WALK_TS);
            glide(s, { p: door.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, away) }, 2.2, () => {
              const out = Math.atan2(-(spot.via.x - door.x), -(spot.via.z - door.z)); s.trip.yaw = out;
              glide(s, { p: spot.via.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, out) }, door.distanceTo(spot.via) / (CRAWL * s.sc), () => { s.trip.yaw = out; go(); });
            });
          }))));
  }
  function leave(s) {
    if (s.gift?.clip) { scene.remove(s.gift.mesh); s.gift = null; s.once = null; }   // never left eating: the eat clip's end would never come
    const spot = s.spot, J = jeepApi; spot.home = false; s.trip = { phase: "glide", t: 0, yaw: 0 }; life.release(`${spot.name}:${s.name}`, s); if (spot.name === "seat") life.release("log:0", s);
    if (s.asleep) { s.asleep = false; s.eyes(false); }
    s.dozing = false; s.yawn = 0; s.roused = null; if (s.mouth) s.mouth.visible = false;
    const go = () => errand(s);
    if (spot.bed) return bedOut(s, spot, go);
    if (spot.branch) return climbDown(s, go);
    if (spot.line) {                                  // hand over hand back along the line to post a, then down it
      const L = LL.a.distanceTo(LL.b);
      play(s, "hang_walk", 1.2, -HW_POST);
      return slide(s, spot.t, 0.05, 0.015 * HW_POST * s.sc / L, (u) => { const P = linePose(s, u); brush?.(P.at, true, 1 / 60); return P; }, () => downPost(s, spot, spot.top, go));
    }
    if (spot.climb) {                                 // the hammock: out of the sling, up the rope to the knot, down the post
      play(s, "hang_walk", 2, -HW_POST);
      return glide(s, ropePose(s, ROPE_L - 0.05), 3, () => slide(s, ROPE_L - 0.05, 0.1, 0.015 * HW_POST * s.sc, (u) => ropePose(s, u), () => { scene.attach(s.o); downPost(s, spot, PIV - 0.2 * s.sc, go); }));
    }
    if (spot.car) { s.trip.phase = "exit"; J.open("P"); return; }   // waits for the door, then climbs out (see "exit")
    const away = spot.via ? Math.atan2(-(spot.via.x - spot.door.x), -(spot.via.z - spot.door.z)) : Math.atan2(-(spot.door.x - s.o.getWorldPosition(tmp).x), -(spot.door.z - tmp.z));
    scene.attach(s.o); play(s, "walk", 1.5, WALK_TS);
    glide(s, { p: spot.door.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, away) }, 2.5, () => {
      s.trip.yaw = away;
      if (!spot.via) return go();
      glide(s, { p: spot.via.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, away) }, spot.door.distanceTo(spot.via) / (CRAWL * s.sc), () => { s.trip.yaw = away; go(); });
    });
  }
  const fed = (s) => () => { R(0, 1) < 0.35 ? wander(s) : goHome(s); };   // after a meal: a wander, or home
  function errand(s) {                                // a place at the table or the crate with a fruit there (or a wander)
    if (s.ownSpot) { life.release(s.spot.key, s); s.spot.who = null; s.spot = s.ownSpot; s.ownSpot = null; return goHome(s); }   // back from a nap trip
    if (s.cardsTo) { const slot = s.cardsTo; s.cardsTo = null; walkTo(s, slot.p, () => { startEat(s, slot, () => goHome(s)); s.trip.cards = true; }); s.trip.slot = slot; return; }   // trip.slot: lend() frees it
    if (s.napTo) { const g = s.napTo; s.napTo = null; life.claim(g.key, s); s.ownSpot = s.spot; s.spot = g; g.who = s; return goHome(s); }
    const want = s.wantFood; s.wantFood = false;   // the lab's Get food
    if (!want && !s.food && R(0, 1) < 0.3 && napTrip(s)) return;
    if (s.food) {                                     // a bowl you set down (activities' "camp-food"): eat from it there
      const at = s.food; s.food = null; const u = V(at.x, 0, at.z).normalize(), g = V(at.x, 0, at.z).addScaledVector(u, 0.9);
      const slot = { name: "bowl", p: g, u, yaw: Math.atan2(u.x, u.z), clip: "eat", who: s, h: 0, food: { at: at.clone().setY(at.y + 0.05), mesh: null, bowl: true } };
      return walkTo(s, g, () => startEat(s, slot, fed(s)));
    }
    if (s.spot.car && jeepApi?.node?.getObjectByName("Hood") && (s.fixNext || (!s.wantFood && R(0, 1) < 0.45)) && life.claim("jeep:hood", s)) { s.fixNext = false; return fixEngine(s, () => goHome(s)); }
    const free = pois().flatMap((P) => P.slots.filter((q) => !q.who && !taken(q.key) && q.food.mesh.visible && !q.food.back && (q.name === "table" || s.sc > 1.6)));   // the small ones can't reach over the crate's rim
    if (!free.length) return wander(s);
    const slot = free[Math.floor(R(0, free.length))]; slot.who = s; life.claim(slot.key, s);
    walkTo(s, slot.p, () => startEat(s, slot, fed(s))); s.trip.slot = slot;   // trip.slot: lend() frees the place if he borrows it on the way
  }
  function wander(s) {
    const lg = ["log:1", "log:2"].find((k) => holder(k) === "operator" && hosted(k));   // he's on a log: now and then go and sit with him
    if (lg && R(0, 1) < 0.25) { const o = scene.getObjectByName(`Seat_${lg[4]}`); if (o) { const c = o.position.clone().setY(0); return walkTo(s, c.clone().setLength(c.length() + 0.8), () => { if (!life.join(lg, s)) goHome(s); }); } }
    walkTo(s, wanderPoint(), () => { Object.assign(s.trip, { phase: "rest", t: 0, dur: R(5, 9), nap: R(0, 1) < 0.55 }); play(s, "idle", 1.2); }); }
  const youDrive = () => holder("jeep:driver") === "player";   // you in the jeep's driver seat (jeepSeat.js): its sloth waits
  function goHome(s) {
    const spot = s.spot;
    if (spot.car && youDrive()) return wander(s);   // a wander and a sit, then it tries again
    walkTo(s, spot.via ?? spot.door, () => {
      if (!spot.via) return arriveDoor(s);
      const T = s.trip, yaw = Math.atan2(-(spot.door.x - spot.via.x), -(spot.door.z - spot.via.z)); T.yaw = yaw;
      glide(s, { p: spot.door.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, yaw) }, spot.door.distanceTo(spot.via) / (CRAWL * s.sc), () => { s.trip.yaw = yaw; arriveDoor(s); });
    });
  }
  function settleIn(s, fade) {
    const T = s.trip, spot = s.spot; T.phase = "settle"; T.t = 0; spot.parent.attach(s.o);
    T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); T.sc0 = s.sc;
    play(s, spot.clip, fade);
  }
  function arriveDoor(s) {                            // at its spot's door: in the way each spot is reached
    const spot = s.spot, T = s.trip; s.o.position.copy(spot.door);
    if (spot.branch) return climbUp(s, spot);
    if (spot.climb) { T.phase = "climb"; T.t = 0; return; }
    if (spot.car && youDrive()) return wander(s);   // you got in while it was on its way
    if (spot.car) { T.phase = "door"; T.t = 0; jeepApi.open("P"); return; }
    settleIn(s, 2.5);
  }
  // the seven named sloths (cast.js), each in its own spot: Hibi naps in the hammock, Sunny sits on the bench and toasts
  // s'mores, Mango drives the jeep, Pip (the smallest) hangs on the laundry line, Hazel peeks out of the tent, and Figgy and
  // Bandit hang from the two low branches at the edge of camp
  const WHO = { hammock: ["Hibi"], seat: ["Sunny"], jeep: ["Mango"], line: ["Pip"], tent: ["Hazel"], branch: ["Figgy", "Bandit"] };
  for (const spot of spots) {
    const nm = WHO[spot.name]?.shift(), c = CAST.find((k) => k.name === nm); if (!c) continue;
    if (c.scale) spot.scale *= c.scale;
    hang(V(0, 0, 0), V(1, 0, 0), spot.scale);
    const s = sloths.at(-1); c.dress?.(s.head, s.o);
    Object.assign(s, { name: c.name, fav: c.fav.split(" ")[0], spot, greetCD: R(0, 10), smoreT: R(8, 20), gaze: 0, waveCD: 0 });
    spot.who = s; camp.push(s); placeHome(s);
  }
  { let tris = 0; for (const s of camp) s.o.traverse((m) => { if (m.isMesh && !m.isSkinnedMesh && m.geometry) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    console.info(`camp sloths: ${camp.length} named (${camp.map((s) => s.name).join(", ")}), traits ${tris} triangles in all; s'mores stick 8 + marshmallow 12`); }

  buildGuests();   // the cozy places for a nap away from home (spots.js)
  wild.push(...sloths.filter((s) => s.wild));
  function napTrip(s) {                               // a cozy place free (or shared with the operator); false if none
    const own = s.spot, ok = guests.filter((g) => !(g.car && youDrive()) && !(g.name === own.name && own.name !== "tent") && (s.sc < 2.0 || g.name !== "hammock"));
    let pick = ok[Math.floor(R(0, ok.length))]; if (!pick) return false;
    const b0 = holder("bed:0"); if (pick.key === "bed:1" && b0 && !camp.includes(b0)) pick = guests.find((g) => g.key === "bed:0");   // he lies along the whole bed
    const h = holder(pick.key);
    if (h && camp.includes(h)) return false;
    if (h) { walkTo(s, pick.via ?? pick.door, () => { if (!life.join(pick.key, s)) goHome(s); }); return true; }   // he's in it: ask to join him
    life.claim(pick.key, s); s.ownSpot = own; s.spot = pick; pick.who = s;
    goHome(s); return true;
  }

  // the camp remembers (Adriaen 2026-11-12: "can we also save the state of the sloths?"): who is asleep and for how long
  // still, who is away napping in the bed, the hammock or the jeep, and when each will next nod off. Kept in the shared
  // camp save (save.js, part "sloths"), written when it changes. A sloth out on an errand comes back at home; one on its
  // way to a nap trip wakes up there, asleep.
  const snap = (s) => ({ nap: s.spot?.guest ? s.spot.key : null, sleep: s.dozing ? Math.max(5, Math.round(s.dozeT + Math.max(0, s.dozeIn))) : 0, napT: Math.round(s.napT) });
  const doSleep = (s, d) => { doze(s, d.sleep); s.yawn = 0; s.dozeIn = 0.01; };
  {
    const got = load("sloths");
    for (const d of got?.camp || []) {
      const s = camp.find((q) => q.name === d.name); if (!s) continue;
      if (Number.isFinite(d.napT)) s.napT = d.napT;
      const g = d.nap && guests.find((q) => q.key === d.nap);
      if (g && !holder(g.key)) {                  // back in the cozy spot it was napping in
        life.release(`${s.spot.name}:${s.name}`, s); if (s.spot.name === "seat") life.release("log:0", s);
        s.spot.home = false; life.claim(g.key, s); s.ownSpot = s.spot; s.spot = g; g.who = s; placeHome(s);
      }
      if (d.sleep > 0) doSleep(s, d); else if (s.spot.asleep && d.sleep === 0 && s.trip.phase === "home") { s.dozing = s.asleep = false; s.eyes(false); }
    }
    (got?.wild || []).forEach((d, i) => { if (wild[i] && d.sleep > 0) doSleep(wild[i], d); else if (wild[i] && Number.isFinite(d.napT)) wild[i].napT = d.napT; });
  }
  let saveT = 0, saved = "";
  function keep(dt) {
    const now = performance.now(); if (now < saveT) return; saveT = now + 2000;
    const data = { camp: camp.map((s) => ({ name: s.name, ...snap(s) })), wild: wild.map(snap) };
    const j = JSON.stringify({ ...data, camp: data.camp.map(({ napT, ...r }) => r), wild: data.wild.map(({ napT, ...r }) => r) });   // only a change in who sleeps where writes
    if (j !== saved) { saved = j; save("sloths", data); }
  }

  // you on a log seat by the fire (linger.js) hold it as "log:<i>" (Seat_<i>), so no one sits on you
  let mySeat = -1;
  const LOGS = [0, 1, 2].map((i) => scene.getObjectByName(`Seat_${i}`));
  function seatWatch(st) {                            // st: the seat you are on (player.js me.seat), or null
    let i = -1;
    if (st) { let best = 1.2; LOGS.forEach((o, k) => { if (o) { const d = Math.hypot(o.position.x - st.pos.x, o.position.z - st.pos.z); if (d < best) { best = d; i = k; } } }); }
    if (i === mySeat) return;
    const key = (k) => k === 0 ? "log:0:left" : `log:${k}`;   // Sunny's bench: you sit to its left (linger.js), Sunny keeps "log:0"
    if (mySeat >= 0) life.release(key(mySeat), "player");
    if (i >= 0) life.claim(key(i), "player");
    mySeat = i;
  }
  campStep = (dt, seat) => {
    pois();   // the food places, made once the props are in (table.js)
    seatWatch(seat); keep(dt);
    const fast = window.__campFast || 1, sd = dt * fast, J = jeepApi;
    let out = camp.filter((s) => s.trip.phase !== "home").length;
    for (const s of camp) {
      const spot = s.spot, T = s.trip;
      if (fast !== 1) s.mixer.update(sd - dt);   // the clip at the same pace (slow motion and pause in the move lab too)
      T.t += sd; s.greetCD -= sd;
      if (s.once && s.act.time >= s.act.getClip().duration - 0.02) { const f = s.once; s.once = null; f(); }   // a stretch or a bite done
      if (s.gift?.clip) giftStep(s);   // eating what you gave it: its day waits until it's done
      else if (T.phase === "home") {
        if (spot.name === "seat") smoreStep(s, sd);
        napStep(s, sd, s.spot.guest ? () => leave(s) : undefined);
        s.errand -= sd;
        if (s.errand < 0 && !s.smore && !s.wave && !s.dozing && !s.roused && !s.once) {
          const mate = R(0, 1) < 0.2 && out < MAX_OUT - 1 && camp.find((q) => q !== s && q.trip.phase === "home" && !q.dozing && !q.smore && !q.gift && !q.spot.guest && q.spot.name !== "hammock");
          if (mate && s.spot.name !== "hammock" && startCards(s, mate, leave)) out += 2;
          else if (out < MAX_OUT) { leave(s); out++; } else s.errand = R(6, 15);
        }
      } else if (T.phase === "walk") walkStep(s, T, sd);
      else if (T.phase === "greet") greetStep(s, T, sd);
      else if (T.phase === "eat") eatStep(s, T, sd);
      else if (T.phase === "fix") fixStep(s, T, sd);   // up onto the table or against the crate, picks up a fruit, eats it
      else if (T.phase === "rest") {                 // a sit and a look round somewhere in the clearing; often a nap there
        if (T.nap && !T.slept && T.t > 2) { T.slept = true; doze(s, R(25, 50)); }
        if (T.slept) napStep(s, sd, () => goHome(s));
        else if (T.t > T.dur) goHome(s);
      } else if (T.phase === "exit") {               // out of the jeep: waits for the door, onto the sill, down to the ground
        if (!J.isOpen("P")) J.open("P");
        else if (T.t > 1) {
          T.phase = "glide"; play(s, "hang_walk", 1, 2);
          glide(s, { p: spot.sill.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI / 2) }, 3.5, () => {
            scene.attach(s.o); const yaw = yawOf(s.o);
            glide(s, { p: spot.door.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, yaw) }, 2.5, () => { J.close("P"); s.trip.yaw = yaw; errand(s); });
          });
        }
      } else if (T.phase === "door") {               // waits, facing the door, until it has swung open
        const sill = spot.parent.localToWorld(spot.sill.clone());
        turnTo(T, Math.atan2(-(sill.x - s.o.position.x), -(sill.z - s.o.position.z)), sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
        if (!J.isOpen("P")) J.open("P");
        else if (T.t > 2) { T.phase = "clamber"; T.t = 0; T.from = s.o.position.clone(); T.to = sill; play(s, "hang_walk", 1, 2); }
      } else if (T.phase === "clamber") {            // about 4 s: hauls itself up onto the door sill
        const k = Math.min(1, T.t / 4), e = k * k * (3 - 2 * k);
        s.o.position.lerpVectors(T.from, T.to, e); s.o.position.y += Math.sin(Math.PI * k) * 0.1;
        s.o.quaternion.setFromAxisAngle(UP, T.yaw).multiply(q0.setFromAxisAngle(V(1, 0, 0), -0.5 * Math.sin(Math.PI * k)));
        if (k >= 1) settleIn(s, 3);
      } else if (T.phase === "slide") slideStep(s, T, sd);   // along a branch, a trunk, a post, a rope or the line
      else if (T.phase === "glide") glideStep(s, T);
      else if (T.phase === "climb") {              // up the post hand over hand until its arms reach the rope knot (or the line)
        if (T.t < sd + 1e-6) play(s, "hang_walk", 1.2, HW_POST);
        turnTo(T, spot.climbYaw ?? climbYaw, sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
        const top = spot.top ?? PIV - 0.2 * s.sc;
        s.o.position.y = Math.min(top, s.o.position.y + 0.015 * HW_POST * s.sc * sd * Math.min(1, T.t / 1.5));
        if (s.o.position.y >= top) { T.phase = "turn"; T.t = 0; spot.parent.attach(s.o); T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); }
      } else if (T.phase === "turn") {               // about 3 s: swings round from the post to hang under the rope (or the line)
        const k = Math.min(1, T.t / 3), e = k * k * (3 - 2 * k), R0 = spot.line ? linePose(s, 0.05) : ropePose(s, 0.1);
        s.o.position.lerpVectors(T.from, R0.p, e); s.o.quaternion.slerpQuaternions(T.q, R0.q, e);
        if (k >= 1) { T.phase = spot.line ? "line" : "rope"; T.t = 0; T.u = spot.line ? 0.05 : 0.1; }
      } else if (T.phase === "line") {               // hand over hand along the line to the gap
        T.u = Math.min(spot.t, T.u + 0.015 * HW_POST * s.sc * sd / LL.a.distanceTo(LL.b)); const P = linePose(s, T.u);
        s.o.position.copy(P.p); s.o.quaternion.copy(P.q); brush?.(P.at, true, sd);
        if (T.u >= spot.t) { play(s, "cling", 3, 0.6); atHome(s); }
      } else if (T.phase === "rope") {               // down the rope to the sling's end
        T.u = Math.min(ROPE_L - 0.05, T.u + 0.015 * HW_POST * s.sc * sd); const R1 = ropePose(s, T.u);
        s.o.position.copy(R1.p); s.o.quaternion.copy(R1.q);
        if (T.u >= ROPE_L - 0.05) settleIn(s, 3);
      } else if (T.phase === "settle") {             // about 4 s: climbs up into its spot and settles
        const k = Math.min(1, T.t / (spot.climb ? 6 : 4)), e = k * k * (3 - 2 * k);
        s.o.position.lerpVectors(T.from, spot.at, e); if (!spot.climb && !spot.noHop) s.o.position.y += Math.sin(Math.PI * e) * 0.12;
        s.o.quaternion.slerpQuaternions(T.q, q0.setFromAxisAngle(UP, spot.yaw), e);
        s.sc = T.sc0 + (spot.scale - T.sc0) * e; s.o.scale.setScalar(s.sc);
        if (k >= 1) atHome(s);
      }
      if (T.phase !== "home" && s.smore) stopSmore(s);
      if (s.gift && !s.gift.clip) giftFly(s, sd);
      zStep(s, dt);
      if (spot.line && T.phase === "home") brush?.(s.o.position, false, dt);   // the towel swings back
      // the hit sphere and the point hearts and words fly to follow the sloth
      s.o.getWorldPosition(s.box.position).y += 0.25 * s.sc / SL; s.p.copy(s.box.position);
    }
    for (const s of wild) { napStep(s, sd); if (s.gift) giftFly(s, sd); zStep(s, dt); }   // a wild one munches what you give it
    fruitStep(sd);
  };
  // food you put out (activities.js, window event "camp-food" {kind, at}): the nearest sloth at home comes over to eat it
  addEventListener("camp-food", (e) => {
    const at = e.detail?.at; if (!at) return;
    const s = camp.filter((q) => q.trip.phase === "home" && !q.smore && !q.wave && !q.gift).sort((a, b) => a.p.distanceTo(at) - b.p.distanceTo(at))[0];
    if (s) { s.food = at.clone(); leave(s); }
  });
  window.__spots = spots; window.__sloth = (i) => sloths[i]; CAMP.sloths = camp;
  window.__errand = (name) => { const s = camp.find((q) => q.name === name); if (s && s.trip.phase === "home") { s.wantFood = true; leave(s); } return s; };
  window.__path = findPath;
  // the move lab (camp.html?lab, camp/lab.js): drives these to show each move on its own
  labApi = window.__lab = { camp, GROUND, leave: (s) => { s.wantFood = true; leave(s); }, goHome, wander, walkTo, clipOf, pois, isFree, smore: (s) => { s.smoreT = 0; }, wave: (s) => { s.wave = 1e-3; s.waveCD = 15; },
    fix: (s) => { if (s.spot.car && s.trip.phase === "home") { s.fixNext = true; leave(s); } },
    nap: (s) => { if (!s.dozing) doze(s); },
    guests: () => guests.map((g) => g.key),
    cards: (s) => { const mate = camp.find((q) => q !== s && q.trip.phase === "home" && !q.spot.guest && q.spot.name !== "hammock"); return mate && s.trip.phase === "home" && startCards(s, mate, leave); },
    napTrip: (s, key) => { if (s.trip.phase !== "home" || s.spot.guest) return; const g = guests.find((q) => q.key === key); if (g && !holder(key)) { s.napTo = g; leave(s); } }, wake: (s) => { if (s.dozing) s.dozeIn > 0 ? (s.dozeIn = 0.01, s.dozeT = 0) : (s.dozeT = 0); },
    yawn: (s) => { s.yawn = 1e-3; }, stretch: (s) => { const [c, ts] = homeClip(s); playOnce(s, "stretch", 1.2, () => play(s, c, 1.5, ts)); } };
}
addLabButton();   // the move lab's button in the ⚙️ menu, and ?lab (labButton.js): here, where it has always been added
const COUNT = sloths.length;

function flowerCrown(s) {
  const c = new THREE.Group(), cols = [0xff7fa8, 0xffd66e, 0xffffff];
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.016, 0), new THREE.MeshLambertMaterial({ color: cols[k % 3], emissive: 0x331100 })); f.position.set(Math.cos(a) * 0.058, 0, Math.sin(a) * 0.052); c.add(f); }
  c.position.set(0, 0.105, 0); c.rotation.x = -0.25; s.head.add(c);
}


export { COUNT, campStep, flowerCrown, hammockStep, hit, labApi, sloths, slothsStep, warmStep };
export { burst, fx, sprite };   // back-compat: campLife.js, input.js and operator.js still import these three from here (their home is fx.js)
