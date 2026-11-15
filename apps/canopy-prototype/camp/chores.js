// Canopy Camp chores: your camp activities (../activities.js, thread "Plan camp activities": wood on the fire, the soup pot,
// fruit and vegetables to give away) wired to this camp: where the wood pile, the fire, the pot, the table and the crate
// stand (layout.js), the props that light up when you can use each (highlight.js), and the fire the logs make bigger
// (boostFire: the one place the chores touch the camp's fire).
// Exports buildChores(): main.js calls it once, after the ground, the tent and the air; it makes the activities (acts,
// exported and returned), which input.js passes taps to,
// the operator reads (operator/cook.js and day.js cook with it, talk.js lets you give him the food in your hand), and main.js updates
// each frame; audio.js imports it too, for the pot's sounds. It also adds the things you can use to the tap targets
// (targets.js), and hands the chores the log seats (places.js logSeats), whose ends a bowl claims. A chore's message can name a sound to go with it (toast(text, sound)), which audio.js cue() plays.
import * as THREE from "three";
import { createActivities } from "../activities.js";
import { LIVED, camera, scene } from "./core.js";
import { toast } from "./hud.js";
import { cue } from "./audio.js";
import { FIRE_CARDS, WOODPILE, WOOD_SPOTS, WOOD_TEX, addBlocker, fireLight, glowTex } from "./campProps.js";
import { CRATE, FIRE, SOUP_POT, TABLE, WOOD_PILE } from "./layout.js";
import { burst } from "./fx.js";
import { me } from "./player.js";
import { addOption, addTargets } from "./targets.js";
import { claim, endFree, logSeats, release } from "./places.js";

// the logs you put on make the camp's fire bigger: each frame the fire chore says how much wider, taller and brighter, on top
// of what the day's light (campProps.js fireStep: fireLight) set for this frame. Only here.
const boostFire = (wide, tall, light) => {
  for (const c of FIRE_CARDS) c.scale.set(wide, tall, wide);
  fireLight.intensity *= light;
};

let acts = null;   // the activities, once buildChores has made them
function buildChores() {
  acts = createActivities({ scene, camera, me,
    places: { woodPile: { at: WOOD_PILE.at, built: !!WOODPILE }, fire: FIRE, pot: SOUP_POT, table: TABLE, crate: LIVED ? CRATE.at : null,
      seats: logSeats().map(({ o, c, along, ends }) => ({ o, c, along, ends: ends.map((e) => ({ at: e.at, free: () => endFree(e), take: () => claim(e.key, "bowl"), leave: () => release(e.key, "bowl") })) })) },   // a bowl holds its end (places.js)   // built: the props' pile stands there (not with ?lived=0, when the fire chore stacks plain logs)
    looks: Object.fromEntries(Object.entries({ woodpile: ["WoodStack", "LooseLogs"], fireOnly: ["Ring", "Fire"], pot: ["Pot"], crate: ["KitchenCrate", "KitchenThings"] })   // what lights up when you can use it (camp/highlight.js)
      .map(([k, ns]) => [k, ns.map((n) => scene.getObjectByName(n)).filter(Boolean)]).filter(([, v]) => v.length)),
    woodTex: WOOD_TEX ?? null, woodSpots: WOOD_SPOTS, glowTex, burst, toast: (text, sound) => { toast(text); if (sound) cue(sound); }, addBlocker: (at, r) => addBlocker({ at, r }), boostFire });
  // the things you can use light up and open a menu (targets.js): only ever the one thing a tap does now (the thing's own
  // label, activities.js). A thing that is part of another target's object (a log seat: t.on) adds its option to that
  // target instead, so a log has one menu (review R2-209)
  const sph = new THREE.Sphere(), lit = acts.things.filter((t) => t.look && !t.on);   // the things never change once made
  for (const t of acts.things) if (t.on) addOption(t.on, { ready: () => acts.ready(t), options: () => [[t.label(), () => acts.tap({ thing: t })]] });
  addTargets("things", () => lit, (t) => ({ get look() { return t.look; }, picks: [t.box],
    at: (v) => sph.set(v.copy(t.box.position), t.box.geometry.parameters.radius), ready: () => acts.ready(t), options: () => [[t.label(), () => acts.tap({ thing: t })]] }));
  return acts;
}

export { acts, buildChores };
