// Canopy Camp chores: your camp activities (../activities.js, thread "Plan camp activities": wood on the fire, the soup pot,
// fruit and vegetables to give away) wired to this camp: where the wood pile, the fire, the pot, the table and the crate
// stand (layout.js), the props that light up when you can use each (highlight.js), and the fire the logs make bigger
// (boostFire: the one place the chores touch the camp's fire).
// Exports buildChores(): campLife.js calls it once, last; it returns the activities (acts), which input.js passes taps to,
// operator.js cooks with, and main.js updates each frame. window.__acts is the same object, for audio.js.
import { createActivities } from "../activities.js";
import { LIVED, camera, scene } from "./core.js";
import { toast } from "./hud.js";
import { FIRE_CARDS, WOODPILE, WOOD_TEX, blockers, fireLight, flames, glowTex } from "./campProps.js";
import { CRATE, FIRE, SOUP_POT, TABLE, WOOD_PILE } from "./layout.js";
import { burst, sloths } from "./sloths.js";
import { me } from "./player.js";

// the logs you put on make the camp's fire bigger: each frame the fire chore says how much wider, taller and brighter, on top
// of what campProps.js (the cards and the old sprites) and the day's light (fireLight) set for this frame. Only here.
const boostFire = (wide, tall, light) => {
  for (const c of FIRE_CARDS) c.scale.set(wide, tall, wide);
  for (const s of flames) s.scale.multiplyScalar(wide);
  fireLight.intensity *= light;
};

function buildChores() {
  const acts = createActivities({ scene, camera, me, sloths,
    places: { woodPile: { at: WOOD_PILE.at, built: !!WOODPILE }, fire: FIRE, pot: SOUP_POT, table: TABLE, crate: LIVED ? CRATE.at : null },   // built: the props' pile stands there (not with ?lived=0, when the fire chore stacks plain logs)
    looks: Object.fromEntries(Object.entries({ woodpile: ["WoodStack", "LooseLogs"], fireOnly: ["Ring", "Fire"], pot: ["Pot"], crate: ["KitchenCrate", "KitchenThings"] })   // what lights up when you can use it (camp/highlight.js)
      .map(([k, ns]) => [k, ns.map((n) => scene.getObjectByName(n)).filter(Boolean)]).filter(([, v]) => v.length)),
    woodTex: WOOD_TEX ?? null, glowTex, burst, toast, addBlocker: (c, r) => blockers.push([c, r]), boostFire });
  window.__acts = acts;   // alias: audio.js reads the pot's stage from it (it is evaluated before the chores are built, so it cannot import them)
  return acts;
}

export { buildChores };
