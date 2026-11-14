// Canopy Camp sloths: the wild sloths hanging in the trees, the seven named sloths living in camp and going about their day
// (errands to the snack table and crate, s'mores, saying hello, wayfinding), and their life: fur, blinks, looks and a wave.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { jeepApi } from "./jeep.js";
import { LIVED, OPT, R, scene } from "./core.js";
import { V, canvasTex, sstep } from "./util.js";
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
import { mouthOf } from "./sloth/face.js";
import { slothsStep } from "./sloth/life.js";
import { EAT_GRAB, canStretch, clipOf, homeClip, play, playOnce } from "./sloth/clips.js";
import { ROPE_L, UP, barkProfile, climbYaw, linePose, postPose, ropePose, treeOf, trunkAt, turnTo, underAt, yawOf } from "./sloth/poses.js";
import { climbV, glide, glideStep, move, moveStep, slide, slideStep, toGround } from "./sloth/moves.js";
import { lpawOf, pawOf } from "./sloth/arms.js";
import { brush, buildGuests, buildSpots } from "./sloth/spots.js";
import { buildNav, findPath, greetStep, isFree, walkStep, walkTo } from "./sloth/walk.js";
import { doze, hammockStep, napStep, zStep } from "./sloth/naps.js";
import { buildTable, fruit, fruitStep, pois, sitFor } from "./sloth/table.js";
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
      if (game?.players.includes(s)) game.over = true;   // its card game ends: the other one goes home
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
    // food you give it (activities.js food(), a mesh from camp/food.js leaving your hand at `from`; Adriaen 2026-11-13: the
    // food is modelled so the sloths eat it with their own eat clip). Sitting up and awake (resting in the clearing, or on
    // its log or jeep seat): it plays eat, its paw takes the food out of the air and it bites it smaller (chewStep), and
    // its day carries on after. Anywhere else (walking, hanging, in bed, held): it flies to its mouth and it munches it.
    eatGift(s, mesh, from) {
      if (s.gift) { scene.remove(s.gift.mesh); s.gift = null; }
      mesh.position.copy(from); mesh.scale.copy(mesh.userData.base ?? V(1, 1, 1)); scene.add(mesh);
      const sitUp = canStretch(s) && !s.asleep && !s.dozing && !s.once && !s.smore && !s.wave && !s.yawn && (s.trip.phase === "rest" ? !s.trip.slept : s.trip.phase === "home");
      s.gift = { mesh, from: from.clone(), land: from.clone(), t: 0, clip: sitUp }; s.nod = 1.2;
      if (sitUp) playOnce(s, "eat", 0.5, () => { scene.remove(mesh); if (s.mouth) s.mouth.visible = false; s.gift = null; const [c, ts] = homeClip(s); play(s, c, 0.9, ts); }, EAT_GRAB - 0.9);
      return sitUp ? "eat" : "munch";
    },
  };
  // Eating (Adriaen 2026-11-12: "have them pick up the food item and eat it; crawl on top of the table or reach into the
  // crate", no words or emojis): a fruit lies at each place, on the table top or on the things in the crate. A sloth comes
  // to the place, climbs onto the table (or sits up against the crate), and plays eat (or eat_high, up over the crate's
  // rim): its paw closes on the fruit, brings it to its mouth, and the fruit gets smaller with each chew until it's gone.
  // A new fruit is put out a while later. Fruit: one 20-triangle icosahedron each, coloured and stretched per kind.
  const paw = V(), qPaw = new THREE.Quaternion();
  buildTable();   // where the paw is at the grab, and the fruits (table.js)
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
  function errand(s) {                                // a place at the table or the crate with a fruit there (or a wander)
    if (s.ownSpot) { life.release(s.spot.key, s); s.spot.who = null; s.spot = s.ownSpot; s.ownSpot = null; return goHome(s); }   // back from a nap trip
    if (s.cardsTo) { const slot = s.cardsTo; s.cardsTo = null; walkTo(s, slot.p, () => { startEat(s, slot); s.trip.cards = true; }); s.trip.slot = slot; return; }   // trip.slot: lend() frees it
    if (s.napTo) { const g = s.napTo; s.napTo = null; life.claim(g.key, s); s.ownSpot = s.spot; s.spot = g; g.who = s; return goHome(s); }
    const want = s.wantFood; s.wantFood = false;   // the lab's Get food
    if (!want && !s.food && R(0, 1) < 0.3 && napTrip(s)) return;
    if (s.food) {                                     // a bowl you set down (activities' "camp-food"): eat from it there
      const at = s.food; s.food = null; const u = V(at.x, 0, at.z).normalize(), g = V(at.x, 0, at.z).addScaledVector(u, 0.9);
      const slot = { name: "bowl", p: g, u, yaw: Math.atan2(u.x, u.z), clip: "eat", who: s, h: 0, food: { at: at.clone().setY(at.y + 0.05), mesh: null, bowl: true } };
      return walkTo(s, g, () => startEat(s, slot));
    }
    if (s.spot.car && jeepApi?.node?.getObjectByName("Hood") && (s.fixNext || (!s.wantFood && R(0, 1) < 0.45)) && life.claim("jeep:hood", s)) { s.fixNext = false; return fixEngine(s); }
    const free = pois().flatMap((P) => P.slots.filter((q) => !q.who && !taken(q.key) && q.food.mesh.visible && !q.food.back && (q.name === "table" || s.sc > 1.6)));   // the small ones can't reach over the crate's rim
    if (!free.length) return wander(s);
    const slot = free[Math.floor(R(0, free.length))]; slot.who = s; life.claim(slot.key, s);
    walkTo(s, slot.p, () => startEat(s, slot)); s.trip.slot = slot;   // trip.slot: lend() frees the place if he borrows it on the way
  }
  // the jeep's engine (Adriaen 2026-11-12: "a sloth can occasionally open the hood, take out a spanner and work on the
  // engine"): the jeep's own sloth goes round to the front, opens the hood, climbs up onto the front of the engine bay and
  // works at the engine with a spanner (its paw dipping and turning, the eat clip held round its grab), then climbs down,
  // shuts the hood and goes home. Spanner: two boxes, 24 triangles, shown only while it works.
  const spanner = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.012, 0.13, 0.006).translate(0, 0.065, 0), new THREE.BoxGeometry(0.04, 0.022, 0.007).translate(0, 0.135, 0)]), new THREE.MeshLambertMaterial({ color: 0x9aa3ab }));
  spanner.visible = false; scene.add(spanner);
  function fixEngine(s) {
    const J = jeepApi, n = J.node, front = n.localToWorld(V(0.3, 0, 2.35)).setY(0);
    walkTo(s, front, () => { Object.assign(s.trip, { phase: "fix", st: "turn", t: 0, front, sit: n.localToWorld(V(0.25, 0.94, 1.5)) }); play(s, "idle", 1); J.open("H"); });
  }
  function fixStep(s, T, sd) {
    const J = jeepApi, n = J.node, back = yawOf(n);   // facing the windscreen from the front (the jeep looks along its +Z)
    if (T.st === "turn") {
      turnTo(T, back, sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
      if (!J.isOpen("H")) J.open("H"); else if (T.t > 2.5) { T.yaw = back; play(s, "hang_walk", 1, 2); move(s, T, T.sit, 4, 0.15, -0.5, () => { T.st = "reach"; T.t = 0; play(s, "eat", 0.8); }); }
    } else if (T.st === "move") moveStep(s, T);
    else if (T.st === "reach") { if (s.act.time > 1.5) { T.st = "work"; T.t = 0; s.act.paused = true; } }
    else if (T.st === "work") {                      // the paw dips and turns at the engine, now and then a look at its work
      s.act.time = 1.85 + 0.28 * Math.sin(T.t * 3.2) * (0.6 + 0.4 * Math.sin(T.t * 0.7));
      if (T.t > 0.3) { spanner.visible = true; pawOf(s, paw); spanner.position.copy(paw); spanner.quaternion.copy(s.arm[1].getWorldQuaternion(qPaw)); spanner.scale.setScalar(s.sc / 2.4); }
      if (Math.sin(T.t * 0.9) > 0.97 && !s.nod) s.nod = 0.8;
      if (T.t > 14) { spanner.visible = false; s.act.paused = false; T.st = "down"; T.t = 0; play(s, "idle", 1); }
    } else if (T.st === "down") {
      if (T.t > 1.2) { play(s, "hang_walk", 1, -2); move(s, T, T.front, 4, 0.15, -0.5, () => { J.close("H"); life.release("jeep:hood", s); goHome(s); }); }
    }
  }
  function startEat(s, slot) { Object.assign(s.trip, { phase: "eat", st: "turn", t: 0, slot, cards: false }); play(s, "idle", 1); }
  function eatStep(s, T, sd) {
    const slot = T.slot, F = slot?.food;
    if (T.st === "turn") {                           // face the fruit, then up onto the table or up against the crate
      if (turnTo(T, slot.yaw, sd * 2) < 0.05 || T.t > 3) {
        const sit = sitFor(slot, s.sc);
        if (slot.name === "table") { play(s, "hang_walk", 1, 2); move(s, T, sit, 3.5, 0.12, -0.5, () => T.cards ? cardsSit(s, T) : chew(s, T)); }
        else { play(s, "walk", 1, WALK_TS); move(s, T, sit, 1.6, 0, 0, () => chew(s, T)); }
      }
      s.o.quaternion.setFromAxisAngle(UP, T.yaw);
    } else if (T.st === "move") moveStep(s, T);
    else if (T.st === "cards") cardsStep(s, T, sd);
    else if (T.st === "eat") {
      if (!F.mesh && s.act.time > EAT_GRAB - 0.1) { F.mesh = fruit(); F.mesh.position.copy(pawOf(s, paw)); }   // a bowl: the fruit comes up out of it
      if (F.mesh) chewStep(s, F.mesh, F.from ??= F.at.clone().setY(F.at.y + (F.mesh.userData.base?.y ?? 0) / 2), EAT_GRAB);
    }
  }
  // cards (Adriaen 2026-11-12: "sloths playing cards together, of course with the occasional dozing off"): now and then two
  // sloths climb onto the two ends of the table, facing each other, each holding a fan of three cards in its left paw. In
  // turn, slowly, one reaches out and lays a card on the pile between them. Now and then one nods off mid-game (eyes shut,
  // head sinking, a z) and the other waits for it. After a minute or two they climb down and go home. Cards: quads (2
  // triangles each) with one painted texture, a fan of 3 per player and a pile of at most 8: 44 triangles while they play.
  const cardTex = canvasTex(64, 96, (g) => { g.fillStyle = "#fff8ee"; g.fillRect(0, 0, 64, 96); g.strokeStyle = "#c9a27a"; g.lineWidth = 4; g.strokeRect(3, 3, 58, 90);
    g.fillStyle = "#e0566f"; g.beginPath(); g.moveTo(32, 66); g.bezierCurveTo(4, 44, 18, 22, 32, 38); g.bezierCurveTo(46, 22, 60, 44, 32, 66); g.fill(); });
  const cardMat = new THREE.MeshLambertMaterial({ map: cardTex, side: THREE.DoubleSide }), cardGeo = new THREE.PlaneGeometry(0.055, 0.08);
  const pile = []; let game = null;
  const lpaw = V();
  function startCards(a, b) {                         // a and b (both at home, awake) go and play at the table
    const P = pois().find((q) => q.name === "table"); if (!P || P.slots.length < 2 || game) return false;
    if (P.slots.some((q) => q.who || taken(q.key))) return false;
    game = { P, players: [a, b], over: false, len: R(70, 120), t: 0, turn: 0 };
    [a, b].forEach((s, i) => { const slot = P.slots[i]; slot.who = s; life.claim(slot.key, s); s.cardsTo = slot; if (s.trip.phase === "home") leave(s); });
    return true;
  }
  function cardsSit(s, T) {
    T.st = "cards"; T.t = 0; T.next = R(3, 6); play(s, "idle", 1);
    if (!s.hand) { s.hand = new THREE.Group(); for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(cardGeo, cardMat); c.position.set((k - 1) * 0.016, 0.04, k * 0.002); c.rotation.z = (1 - k) * 0.35; s.hand.add(c); } scene.add(s.hand); }
    s.hand.visible = true;
  }
  function cardsStep(s, T, sd) {
    const g = game, other = g?.players.find((q) => q !== s);
    lpawOf(s, lpaw); s.hand.position.copy(lpaw).y += 0.05 * s.sc / 2; s.hand.quaternion.copy(s.o.quaternion).multiply(q0.setFromAxisAngle(V(1, 0, 0), 0.35)); s.hand.scale.setScalar(s.sc / 2);   // held up before it, faces toward it
    if (!g || g.over) {                               // the game's over: down off the table and home
      if (s.dozing) { s.dozing = s.asleep = false; s.eyes(false); s.yawn = 1e-3; }
      if (s.once) return;
      s.hand.visible = false; T.st = "done"; play(s, "hang_walk", 1, -2); T.yaw = T.slot.yaw;
      return move(s, T, T.slot.p.clone(), 3.5, 0.12, -0.5, () => { T.slot.who = null; life.release(T.slot.key, s); if (g && g.players.every((q) => q.trip.st === "done" || q.trip.phase !== "eat")) { pile.forEach((c) => (c.visible = false)); game = null; } goHome(s); });
    }
    if (s.dozing) {                                   // nodded off mid-game
      s.dozeT -= sd; if (s.dozeT < 0 || s.squish > 0.9) { s.dozing = s.asleep = false; s.eyes(false); s.yawn = 1e-3; T.next = R(2, 4); }
      return;
    }
    if (other?.trip.st !== "cards") return;           // wait for the other to sit down
    g.t += sd / 2; if (g.t > g.len) g.over = true;
    if (s.once) {                                     // laying a card: at the reach's far end it goes onto the pile, then back to sitting
      if (!T.laid && s.act.time > 1.7) { T.laid = true; const c = pile.find((q) => !q.visible) ?? (pile.length < 8 ? (pile.push(new THREE.Mesh(cardGeo, cardMat)), pile.at(-1)) : pile[0]); scene.add(c); c.visible = true;
        const u = g.P.slots[0].u, mid = g.P.c.clone().add(V(-u.z, 0, u.x).multiplyScalar(0.22));   // beside the fruit plate, between them
        c.position.set(mid.x + R(-0.03, 0.03), T.slot.h + 0.004 + pile.filter((q) => q.visible).length * 0.002, mid.z + R(-0.03, 0.03)); c.rotation.set(-Math.PI / 2, 0, R(0, 6.3)); }
      if (s.act.time > 2.3) { s.once = null; play(s, "idle", 0.9); g.turn = 1 - g.players.indexOf(s); T.next = R(4, 8); }
      return;
    }
    if (g.turn !== g.players.indexOf(s)) { if (other.dozing && T.t % 7 < sd) s.nod = 1; return; }   // its turn? (a nod at a sleeping partner)
    T.next -= sd;
    if (T.next < 0 && !other.dozing) {
      if (R(0, 1) < 0.18) { s.dozing = true; s.asleep = true; s.eyes(true); s.dozeT = R(10, 22); g.turn = 1 - g.turn; return; }   // dozes off instead
      T.laid = false; playOnce(s, "eat", 0.8, () => {});
    }
  }
  function chew(s, T) {
    T.st = "eat"; T.t = 0;
    playOnce(s, T.slot.clip, 0.8, () => {            // eaten: down off the table, then on its way
      const slot = T.slot, F = slot.food; mouthOf(s).visible = false;
      F.from = null;
      if (F.bowl) { F.mesh && scene.remove(F.mesh); F.mesh = null; } else { F.mesh.visible = false; F.back = R(25, 45); }
      const go = () => { slot.who = null; if (slot.key) life.release(slot.key, s); R(0, 1) < 0.35 ? wander(s) : goHome(s); };
      if (slot.name === "table") { play(s, "hang_walk", 1, -2); T.yaw = slot.yaw; move(s, T, slot.p.clone(), 3.5, 0.12, -0.5, go); }
      else go();
    });
  }
  // during an eat clip: from the grab the food is in its paw, and it gets a bite smaller each time the mouth closes (the
  // clip's head bobs nine times a clip, four while it holds it to its mouth, 3.2 to 6.8 s); a painted mouth opens and shuts
  const mouthW = V();
  function chewStep(s, mesh, from, t0) {
    const t = s.act.time; if (t < t0) return;
    pawOf(s, paw); mesh.position.lerpVectors(from, paw, sstep(t0, t0 + 0.35, t));
    mouthOf(s).getWorldPosition(mouthW); mesh.position.lerp(mouthW, 0.75 * sstep(2.8, 3.3, t) * (1 - sstep(6.6, 7.0, t)));   // right up to its lips while it bites
    const bites = t < 3.2 ? 0 : Math.floor((t - 3.2) / (8 / 9)), base = mesh.userData.base;
    if (base) mesh.scale.copy(base).multiplyScalar(1 - 0.22 * bites);
    mesh.visible = bites < 4;
    const m = mouthOf(s), open = t > 3.0 && t < 6.9 ? Math.max(0, Math.sin(2 * Math.PI * 9 * (t / 8 - 0.4) + 0.6)) : 0;
    m.visible = open > 0.08; m.scale.set(0.9, Math.max(0.01, open), 1);
  }
  // a gift (life.eatGift) while it sits up: the food floats to its paw as the paw comes up, then the eat clip's chewing
  function giftStep(s) {
    const G = s.gift, t = s.act.time;
    if (t < EAT_GRAB) { pawOf(s, paw); const k = sstep(EAT_GRAB - 0.9, EAT_GRAB, t); G.mesh.position.lerpVectors(G.from, paw, k); G.mesh.position.y += Math.sin(Math.PI * k) * 0.25; G.land.copy(paw); }
    else chewStep(s, G.mesh, G.land, EAT_GRAB);
  }
  // anywhere else (hanging, lying, on the move): its right paw comes up (giftArm, after the clip), the food flies into it,
  // the paw lifts it to its lips and it shrinks a bite at a time while the mouth munches; then the paw goes back
  // (Adriaen 2026-11-13: "they eat without hands")
  function giftFly(s, dt) {
    const G = s.gift; G.t += dt; mouthOf(s).getWorldPosition(mouthW); pawOf(s, paw);
    if (G.t < 0.9) { const k = sstep(0, 0.9, G.t); G.mesh.position.lerpVectors(G.from, paw, k); G.mesh.position.y += Math.sin(Math.PI * k) * 0.3; return; }
    if (G.t < 3.6) {
      if (!G.at && G.t > 1.2) { G.at = true; s.nod = 0.8; s.munch = 2.4; }
      G.mesh.position.copy(paw).lerp(mouthW, 0.45 * sstep(0.9, 1.3, G.t));
      G.mesh.scale.copy(G.mesh.userData.base ?? V(1, 1, 1)).multiplyScalar(Math.max(0.1, 1 - 0.22 * Math.max(0, Math.floor((G.t - 1.2) / 0.6))));
    } else if (G.mesh.parent) scene.remove(G.mesh);
    if (G.t > 4.2) s.gift = null;
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
  // the bench sloth's s'mores: now and then, as its reach comes round, it holds a long stick out over the fire (the tip
  // stays well clear of the flames), keeps it there while the marshmallow toasts golden, then draws it back and eats it.
  // A stick (8 triangles) and a marshmallow (12), page-lit, one draw each, shown only while it toasts.
  const smoreStick = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, 1, 4, 1, true).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x7a5634 }));
  const mallow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.06), new THREE.MeshLambertMaterial({ color: 0xfff7ec, emissive: 0x000000 }));
  smoreStick.visible = mallow.visible = false; scene.add(smoreStick, mallow);
  const RAW = new THREE.Color(0xfff7ec), TOAST = new THREE.Color(0xd9984a), FIRE_AT = V(0, 0.8, 0);
  function smoreStep(s, dt) {
    const act = s.act; if (!act) return;
    if (s.smore?.eating) return chewStep(s, mallow, s.smore.from, s.smore.at);
    if (act.getClip().name !== "reach") return;
    if (!s.smore) { s.smoreT -= dt; if (s.smoreT < 0 && act.time < 0.3 && !s.dozing) s.smore = { hold: 0 }; else return; }
    const S = s.smore;
    if (act.time >= 3.9 && S.hold < 9) { act.timeScale = 0; S.hold += dt; S.held = true; } else act.timeScale = 1;
    pawOf(s, paw);
    const to = FIRE_AT.clone().sub(paw), L = Math.max(0.3, Math.min(1.15, to.length() - 0.7));
    smoreStick.position.copy(paw); smoreStick.quaternion.setFromUnitVectors(UP, to.normalize()); smoreStick.scale.set(1, L, 1);
    mallow.position.copy(paw).addScaledVector(to, L - 0.03); mallow.quaternion.copy(smoreStick.quaternion);
    mallow.material.color.lerpColors(RAW, TOAST, Math.min(1, S.hold / 9));
    smoreStick.visible = mallow.visible = true;
    if (S.held && S.hold >= 9 && act.time > 5.6) {    // drawn back in: it slides the marshmallow off the stick and eats it (no words: Adriaen)
      smoreStick.visible = false; S.eating = true; S.from = mallow.position.clone(); S.at = 2.4; mallow.userData.base = V(1, 1, 1);
      playOnce(s, "eat", 0.8, () => { mallow.visible = false; mouthOf(s).visible = false; s.smore = null; s.smoreT = R(25, 45); play(s, "reach", 1.5); }, 2.4);
    }
  }
  function stopSmore(s) { if (!s.smore) return; s.smore = null; s.smoreT = R(20, 40); smoreStick.visible = mallow.visible = false; if (s.mouth) s.mouth.visible = false; if (s.act) s.act.timeScale = 1; }

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
          if (mate && s.spot.name !== "hammock" && startCards(s, mate)) out += 2;
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
    cards: (s) => { const mate = camp.find((q) => q !== s && q.trip.phase === "home" && !q.spot.guest && q.spot.name !== "hammock"); return mate && s.trip.phase === "home" && startCards(s, mate); },
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
