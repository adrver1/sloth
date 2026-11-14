// Camp activities for camp.html (thread "Plan camp activities", plan in project files canopy-hide-and-seek/activities-plan.md).
// Calm by design: no timer, no score, no fail. Walk up to a thing, it lights up when you can use it (camp/highlight.js), tap
// it. You carry one thing at a time. This file is the list of things you can tap: where each is, when a tap does something,
// what it does, what the tap menu calls it and what to say when it does not apply. The work behind them is in activities/:
// carry.js (what you hold, and putting it back), fireChore.js (logs on the fire), soupChore.js (the pot, the pail, the bowls
// on the seats), fruitBowl.js (the fruit plate, the table model's FruitBowl child) and parts.js (the shared geometry and names).
// It knows the camp only through what camp/chores.js hands it (the places, the props that light up, the fire's boost);
// camp/input.js passes taps in and camp/main.js calls update() each frame.
// Exports createActivities(camp): { pick(ray), tap(hit), ready(thing), update(dt, time), things, held, burning, level(),
// soup, seats, food(), give(), cook }.
import * as THREE from "three";
import { createCarry } from "./activities/carry.js";
import { MAX_LOGS, createFireChore, createWoodPile } from "./activities/fireChore.js";
import { splitBowl } from "./activities/fruitBowl.js";
import { an, flat, paintLogs } from "./activities/parts.js";
import { createSoupChore } from "./activities/soupChore.js";
import { V } from "./camp/util.js";
import { EV, emit } from "./camp/events.js";

const NEAR = 2.5;                          // tap range

// camp: the scene, the camera and you (me); places { woodPile: { at, built }, fire, pot: { at, r }, table:
// { at, yaw }, crate (or null) }; looks (what lights up for a thing, by name); the wood and glow textures; and what the camp
// does for the chores: burst (a word in the air: the pot's splash and plop), toast(text, sound) (the message, and the sound that goes with it, if any), addBlocker and boostFire (the logs make the camp's fire bigger)
export function createActivities({ scene, camera, me, places: { woodPile, fire, pot, table, crate }, looks, woodTex, glowTex, burst, toast, addBlocker, boostFire }) {
  if (!camera.parent) scene.add(camera);   // so things held in your hand (children of the camera) are drawn
  if (woodTex) paintLogs(woodTex);
  const pile = createWoodPile({ scene, woodPile, addBlocker });
  // what you just did, for the operator to remark on (camp/events.js EV.act, heard by camp/operator/talk.js); by: "you" or
  // "operator". The sloths' part in the chores goes through EV.cheer and EV.food, so the chores never touch a sloth.
  const told = (kind, by = "you") => emit(EV.act, { kind, by });
  const carry = createCarry({ camera, me, toast });
  const fireChore = createFireChore({ scene, fire, glowTex, boostFire });
  const soupChore = createSoupChore({ scene, me, pot, fire, carry, burst, toast, told });
  const { soup, seats } = soupChore, { burning } = fireChore;

  // ---------------------------------------------------------------- things you can tap
  // an invisible sphere each; when: a tap does something now; act: what it does; label: the words on the tap menu (what a
  // tap does now, with what you are carrying); why: what to say when it doesn't apply; look: what lights up when it applies
  // (looks[name], the props' own objects, so the highlight hugs the real thing; look may be a function of what you hold)
  const things = [], hitList = [];
  function thing({ name, at, r, when, act, label, why = () => null, look = null }) {
    const box = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); box.position.copy(at).setY(at.y + r * 0.6); scene.add(box);
    const own = looks[name] ?? look ?? null;
    const t = { name, at, box, when, act, label, why, get look() { return typeof own === "function" ? own() : own; } }; box.userData.thing = t; things.push(t); hitList.push(box); return t;
  }
  const held = () => carry.held, full = "Your hands are full. Put it back first ✋";
  // somewhere you take one thing from, and that takes it back: free hands or that thing in them
  const source = (what, take) => ({ when: () => !held() || held() === what, act: () => { if (held()) { carry.putBack(); return; } take(); }, why: () => held() && full });

  thing({ name: "woodpile", at: pile.at, r: 0.55, look: pile.stand, ...source("log", () => { carry.hold("log"); toast("Got a log 🪵", "knock"); }),
    label: () => held() === "log" ? "Put the log back 🪵" : "Take a log 🪵" });
  // the fire and the pot over it are one place: what a tap does there depends on what you hold
  thing({ name: "fire", at: fire, r: 0.6, when: () => held() === "log" || soupChore.wants(),
    act() {
      if (held() === "log") { if (burning.length >= MAX_LOGS) { toast("The fire is roaring already 🔥", "roar"); return; } carry.hold(null); fireChore.addLog(); told("log"); return; }
      if (held() === "water") { carry.hold(null); soupChore.pour(); soup.by = "you"; canister.pail.visible = true; told("water"); return; }
      if (held() === "veg") { carry.hold(null); soupChore.addVeg(); told("veg"); return; }
      carry.hold("bowl"); soupChore.ladle(); toast("Set it on a log seat 🍲", "clink");
    },
    label() {
      if (held() === "veg") { const [n, e] = carry.now("veg"); return `Add the ${n} to the pot ${e}`; }
      return held() === "log" ? "Put the log on the fire 🔥" : held() === "water" ? "Pour the water in the pot 💧" : "Fill a bowl of soup 🍲";
    },
    why() {
      if (held() === "water") return "Water's in already";
      if (held() === "veg") return soup.stage === "empty" ? "Fill the pot first 💧" : "Enough veg, let it cook";
      if (held() === "bowl") return "Put it on a log seat";
      if (held() === "fruit") return "Fruit is a snack: give it to someone hungry 🍎";
      if (!held() && soup.stage === "empty") return "Fetch water first 💧";
      if (!held() && soup.stage === "water") return "Add veg from the crate 🥕";
      if (!held() && soup.stage === "cooking") return "Still cooking…";
      return null;
    },
    look: () => (held() === "log" ? looks.fireOnly : looks.pot) ?? null });   // the fire lights up for a log, the pot for everything else
  // the water pail under the snack table (built here, after the fire's sphere: the order things are made in is kept)
  const canister = soupChore.placePail(table);
  // the pail is not there while the operator carries it (cook.takePail hides it): no second one from the empty spot (review R2-069)
  thing({ name: "canister", at: canister.at, r: 0.3, look: [canister.pail], when: () => (!held() && soup.stage === "empty" && canister.pail.visible) || held() === "water",
    act() { if (held()) { carry.putBack(); return; } carry.hold("water"); canister.pail.visible = false; toast("Got the water 💧", "slosh"); },
    label: () => held() === "water" ? "Put the pail back 💧" : "Take the pail of water 💧",
    why: () => held() ? full : soup.stage !== "empty" ? "Water's in already" : !canister.pail.visible ? "He's fetching water already 💧" : null });
  // the kitchen crate: one vegetable at a time, a different one each time
  if (crate) thing({ name: "crate", at: crate, r: 0.4, look: looks.crate ?? null, ...source("veg", () => { const [n, e] = carry.takeNext("veg"); toast(`Got a ${n} ${e}`, "knock"); }),
    label: () => { const [n, e] = held() === "veg" ? carry.now("veg") : carry.next("veg"); return held() === "veg" ? `Put the ${n} back ${e}` : `Take a ${n} ${e}`; } });
  // the fruit plate on the snack table (the Table's FruitBowl child, activities/fruitBowl.js): one fruit at a time to give to a
  // sloth or the operator (Adriaen 2026-11-13: veg from the crate, fruit from the fruit bowl)
  const tableObj = scene.getObjectByName("Table");
  const fruitBowl = tableObj && splitBowl(tableObj);
  if (tableObj) {
    tableObj.updateMatrixWorld(true);
    const bowlAt = fruitBowl ? fruitBowl.localToWorld(fruitBowl.geometry.boundingBox.getCenter(V())) : tableObj.localToWorld(V(-0.2, 0.72, 0.05));   // the plate's middle
    thing({ name: "fruitbowl", at: bowlAt, r: 0.28, look: [fruitBowl ?? tableObj], ...source("fruit", () => { const [n, e] = carry.takeNext("fruit"); toast(`Got ${an(n)} ${n} ${e}`.trim(), "knock"); }),
      label: () => { const [n, e] = held() === "fruit" ? carry.now("fruit") : carry.next("fruit"); return (held() === "fruit" ? `Put the ${n} back ${e}` : `Take ${an(n)} ${n} ${e}`).trim(); } });
  }
  // the log seats: somewhere to set a bowl down
  for (const seat of seats) thing({ name: `seat${seats.indexOf(seat)}`, at: seat.c.clone().setY(0), r: 0.6, look: [seat.o], when: () => held() === "bowl" && !seat.bowl,
    act() { carry.hold(null); soupChore.serve(seat); }, label: () => "Set the bowl down 🍲",
    why: () => held() === "bowl" && seat.bowl ? "A bowl's there already" : null });

  return {
    // camp/input.js calls this on a tap before booping sloths: the nearest tappable thing under the finger, or null
    pick(ray) {
      const hits = ray.intersectObjects(hitList, false);
      // seats only count while you hold a bowl, so a tap on a sloth sitting on one still boops it
      const h = hits.find((x) => !x.object.userData.thing.name.startsWith("seat") || held() === "bowl");
      return h ? { distance: h.distance, thing: h.object.userData.thing } : null;
    },
    tap(hit) {
      const t = hit.thing;
      if (flat(me.pos, t.at) > NEAR + 0.6) { toast("Get a bit closer"); return true; }
      if (t.when()) { t.act(); return true; }
      const why = t.why(); if (why) toast(why);
      return true;
    },
    ready(t) { return t.when() && flat(me.pos, t.at) <= NEAR + 0.6; },   // the highlight lights a thing only when a tap would use it
    // each frame, in this order: what you hold, then the fire (it boosts the camp's fire), then the pot (it cooks faster on a big fire)
    update(dt, time) { carry.update(dt, time); fireChore.update(dt); soupChore.update(dt, fireChore.flare); },
    get held() { return carry.held; }, burning, level: fireChore.level, things, soup, seats,
    food: () => carry.food(), give: () => carry.give(),   // what is in your hand to give to a sloth or the operator, and the giving
    cook: soupChore.cook,   // the operator's soup-making steps (camp/operator/cook.js)
  };
}
