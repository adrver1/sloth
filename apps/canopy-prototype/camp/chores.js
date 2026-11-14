// Canopy Camp chores: your camp activities (../activities.js, thread "Plan camp activities": wood on the fire, the soup pot,
// fruit and vegetables to give away) wired to this camp: where the wood pile, the fire, the pot, the table and the crate
// stand (layout.js), the props that light up when you can use each (highlight.js), and the fire the logs make bigger.
// Exports buildChores(): campLife.js calls it once, last; it returns the activities (acts), which input.js passes taps to,
// operator.js cooks with, and main.js updates each frame. window.__acts is the same object, for audio.js.
import { createActivities } from "../activities.js";
import { LIVED, camera, scene } from "./core.js";
import { toast } from "./hud.js";
import { FIRE_CARDS, WOODPILE, WOOD_TEX, blockers, fireLight, flames, glowTex } from "./campProps.js";
import { CRATE, FIRE, SOUP_POT, TABLE, WOOD_PILE } from "./layout.js";
import { burst, sloths } from "./sloths.js";
import { me } from "./player.js";

function buildChores() {
  const acts = createActivities({ scene, camera, me, woodPile: { at: WOOD_PILE.at, built: !!WOODPILE }, woodTex: WOOD_TEX ?? null,   // built: the props' pile stands there (not with ?lived=0, when activities.js stacks plain logs)
    fire: FIRE, fireCards: FIRE_CARDS, flames, fireLight, glowTex, burst, toast,
    pot: SOUP_POT, table: TABLE, crate: LIVED ? CRATE.at : null, sloths,
    addBlocker: (c, r) => blockers.push([c, r]),
    looks: Object.fromEntries(Object.entries({ woodpile: ["WoodStack", "LooseLogs"], fireOnly: ["Ring", "Fire"], pot: ["Pot"], crate: ["KitchenCrate", "KitchenThings"] })   // what lights up when you can use it (camp/highlight.js)
    .map(([k, ns]) => [k, ns.map((n) => scene.getObjectByName(n)).filter(Boolean)]).filter(([, v]) => v.length)) });
  window.__acts = acts;   // alias: audio.js reads the pot's stage from it (it is evaluated before the chores are built, so it cannot import them)
  return acts;
}

export { buildChores };
