// Canopy Camp chores, in every level (Adriaen 2026-11-15: "bring over as much as possible from one location to the other"):
// your camp activities (../activities.js, thread "Plan camp activities": wood on the fire, the soup pot, the water pail,
// vegetables from the crate, fruit to give away, bowls on the log seats) wired to the level's camp: where the pot, the table
// and the crate stand (stage.js: layout.js's places, the same in both levels), the props that light up when you can use each
// (highlight.js, found by name in the stage's scene), and what the level hands over (level below).
// Exports buildChores(level), food() and handOver() (below): the level's page calls it once, after its props and air, before the log seats' targets
// (linger.js); it makes the activities (acts, exported and returned), which input.js passes taps to, the operator reads
// (operator/cook.js and day.js cook with it, talk.js lets you give him the food in your hand), and the page updates each
// frame (acts.update). The camp's audio/watch.js imports acts too, for the pot's sounds. It also adds the things you can use
// to the tap targets (targets.js), and hands the chores the log seats (places.js logSeats), whose ends a bowl claims.
// level: { woodPile: { at, built } (where you take a log, in the stage's frame; built: a prop stands there, otherwise the
// chores stack plain logs), boostFire(wide, tall, light) (the logs you put on make the level's fire bigger: each frame, on
// top of what its light set), toast(text, sound) (a chore's message and the sound that goes with it), addBlocker(at, r),
// glowTex (the sparks; util.js's by default), woodTex and woodSpots (the carried logs painted like the level's stack; null: plain), fruit: the
// place fruit comes from, { at, r, look } (the summit's porch basket), or null for the snack table's plate (the camp) }.
import * as THREE from "three";
import { createActivities } from "../activities.js";
import { LIVED, camera, me, scene, toStage } from "./stage.js";
import { CRATE, FIRE, SOUP_POT, TABLE } from "./layout.js";
import { burst } from "./fx.js";
import { glowTex as sharedGlow } from "./util.js";
import { addOption, addTargets } from "./targets.js";
import { claim, endFree, logSeats, release } from "./places.js";

let acts = null;   // the activities, once buildChores has made them
function buildChores({ woodPile, boostFire, toast, addBlocker, glowTex = sharedGlow(), woodTex = null, woodSpots = null, fruit = null }) {
  acts = createActivities({ scene, camera, me,
    places: { woodPile, fire: FIRE, pot: SOUP_POT, table: TABLE, crate: LIVED ? CRATE.at : null, fruit,
      seats: logSeats().map(({ o, c, along, ends }) => ({ o, c, along, ends: ends.map((e) => ({ at: e.at, free: () => endFree(e), take: () => claim(e.key, "bowl"), leave: () => release(e.key, "bowl") })) })) },   // a bowl holds its end (places.js)
    looks: Object.fromEntries(Object.entries({ woodpile: ["WoodStack", "LooseLogs"], fireOnly: ["Ring", "Fire"], pot: ["Pot"], crate: ["KitchenCrate", "KitchenThings"] })   // what lights up when you can use it (camp/highlight.js); the summit has no WoodStack, its loose logs by the cabin's pile light up
      .map(([k, ns]) => [k, ns.map((n) => scene.getObjectByName(n)).filter(Boolean)]).filter(([, v]) => v.length)),
    woodTex, woodSpots, glowTex, burst, toast, addBlocker, boostFire });
  // the things you can use light up and open a menu (targets.js): only ever the one thing a tap does now (the thing's own
  // label, activities.js). A thing that is part of another target's object (a log seat: t.on) adds its option to that
  // target instead, so a log has one menu (review R2-209)
  const sph = new THREE.Sphere(), lit = acts.things.filter((t) => t.look && !t.on);   // the things never change once made
  for (const t of acts.things) if (t.on) addOption(t.on, { ready: () => acts.ready(t), options: () => [[t.label(), () => acts.tap({ thing: t })]] });
  addTargets("things", () => lit, (t) => ({ get look() { return t.look; }, picks: [t.box],
    at: (v) => sph.set(v.copy(t.box.position), t.box.geometry.parameters.radius), ready: () => acts.ready(t), options: () => [[t.label(), () => acts.tap({ thing: t })]] }));
  return acts;
}

// what you hold, for camp/input.js's carry hooks in either level: food() names it, handOver() gives it (the food's mesh, made
// now, and where it leaves your hand, in the stage's frame)
const food = () => acts?.food() ?? null;
function handOver() { const f = acts?.give(); return f && { mesh: f.make(), from: toStage(f.from), emoji: f.emoji }; }

export { acts, buildChores, food, handOver };
