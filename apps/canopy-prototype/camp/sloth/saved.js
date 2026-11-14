// Canopy Camp sloths, what the camp remembers of them (Adriaen 2026-11-12: "can we also save the state of the sloths?"):
// who is asleep and for how long still, who is away napping in the bed, the hammock or the jeep, and when each will next
// nod off. Kept in the shared camp save (save.js, part "sloths"), written when it changes. A sloth out on an errand comes
// back at home; one on its way to a nap trip wakes up there, asleep.
//   restore()    puts the saved state back, once the named sloths and the guest spots are there (sloths.js)
//   keep()       each frame: every 2 s, writes the save when who sleeps where has changed
import { holder } from "../places.js";
import { load, save } from "../save.js";
import { camp, guests, wild } from "./state.js";
import { moveInto, releaseHome } from "./spots.js";
import { doze, wakeUp } from "./naps.js";
import { placeHome } from "./wayIn.js";

const snap = (s) => ({ nap: s.spot?.guest ? s.spot.key : null, sleep: s.dozing ? Math.max(5, Math.round(s.dozeT + Math.max(0, s.dozeIn))) : 0, napT: Math.round(s.napT) });
const doSleep = (s, d) => { doze(s, d.sleep); s.yawn = 0; s.dozeIn = 0.01; };
function restore() {
  const got = load("sloths");
  for (const d of got?.camp || []) {
    const s = camp.find((q) => q.name === d.name); if (!s) continue;
    if (Number.isFinite(d.napT)) s.napT = d.napT;
    const g = d.nap && guests.find((q) => q.key === d.nap);
    if (g && !holder(g.key)) {                  // back in the cozy spot it was napping in
      releaseHome(s); s.spot.home = false; moveInto(s, g); placeHome(s);
    }
    if (d.sleep > 0) doSleep(s, d); else if (s.spot.asleep && d.sleep === 0 && s.trip.phase === "home") wakeUp(s);
  }
  (got?.wild || []).forEach((d, i) => { if (wild[i] && d.sleep > 0) doSleep(wild[i], d); else if (wild[i] && Number.isFinite(d.napT)) wild[i].napT = d.napT; });
}
let saveT = 0, saved = "";
function keep() {
  const now = performance.now(); if (now < saveT) return; saveT = now + 2000;
  const data = { camp: camp.map((s) => ({ name: s.name, ...snap(s) })), wild: wild.map(snap) };
  const j = JSON.stringify({ ...data, camp: data.camp.map(({ napT, ...r }) => r), wild: data.wild.map(({ napT, ...r }) => r) });   // only a change in who sleeps where writes
  if (j !== saved) { saved = j; save("sloths", data); }
}

export { keep, restore };
