// Canopy Camp sloths, what the camp remembers of them (Adriaen 2026-11-12: "can we also save the state of the sloths?"):
// who is asleep and for how long still, who is away napping in the bed, the hammock or the jeep, and when each will next
// nod off. Kept in the shared camp save (save.js, part "sloths"). A sloth out on an errand comes back at home; one on its
// way to a nap trip wakes up there, asleep.
//   restore()    puts the saved state back, once the named sloths and the guest spots are there (sloths.js), and has save.js
//                take a fresh copy whenever the page is hidden or left (track), so the seconds of sleep still to go are right
//   keep(dt)     each frame (step.js; dt in real seconds, so a paused move lab still saves): every 2 s, writes the save
//                when who sleeps where has changed (who is asleep, not for how long still: review R2-081, it used to
//                write every 2 s while anyone slept). A countdown on the frame's dt, not the wall clock (review R2-118).
import { holder } from "../places.js";
import { load, save, track } from "../save.js";
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
  track("sloths", data);
}
const data = () => ({ camp: camp.map((s) => ({ name: s.name, ...snap(s) })), wild: wild.map(snap) });
const key = (s) => `${s.spot?.guest ? s.spot.key : ""}:${s.dozing ? 1 : 0}`;   // who sleeps where, not for how long still
let saveT = 0, saved = "";                     // seconds until the next look; the last key written
function keep(dt) {
  if ((saveT -= dt) > 0) return; saveT = 2;
  const k = camp.map((s) => s.name + key(s)).join() + "|" + wild.map(key).join();
  if (k !== saved) { saved = k; save("sloths", data()); }
}

export { keep, restore };
