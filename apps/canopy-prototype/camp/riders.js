// Canopy Camp and Summit Cabin: everyone in the jeep for the drive's cut scenes (Adriaen 2026-11-15: "while driving the car,
// the people and sloths are not in the car"; plan Q7 in the project files, canopy-hide-and-seek/summit-level/plan.md: all
// seven named sloths pile in, in the load bed, on the roof rack and one on her lap). He drives with his hands on the wheel,
// you (the ponytail engineer, her model from the karaoke trip) ride beside him, the smallest sloth on your lap, three sloths
// on the cargo deck behind and three on the roof rack in front of its load. Both levels' drives (camp/drive.js and
// summit/drive.js) board them, so a change here shows in both.
// The riders are clones of the cast as it is right now (camp/sloth/state.js camp, camp/operator/model.js root), so they wear
// what the level dressed them in: the summit's winter gear and his winter puffer come along. Clones are made only when a shot
// starts and dropped when it ends. While they ride, the real named sloths are hidden (nothing else sets their visibility),
// so the camp's jeep sloth is not sitting in his seat too.
// Exports boardRiders(jeep) (the jeep's group, +Z its front, as the jeep GLB's empties SeatP and WheelHub place them):
// a promise of { step(dt) (each frame of the shot), remove() }, or null while the cast is not built; and herModel(), the
// karaoke trip's model of her (trip.js uses it too).
// Triangles while a shot plays: him 1,082 (camp) or 1,354 (winter), her 1,326, seven sloths at 826 each plus fur and gear.
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { b64bytes } from "../bakedlight.js";
import { toStage } from "./stage.js";
import { V } from "./util.js";
import { kitLook } from "./actor.js";
import { reach } from "./operator/ik.js";
import { clips as opClips, root as opRoot } from "./operator/model.js";
import { SLOTH, camp } from "./sloth/state.js";

let her = null;
export const herModel = () => her ??= fetch("karaoke/models/her.txt").then((r) => { if (!r.ok) throw new Error(`karaoke/models/her.txt ${r.status}`); return r.text(); })
  .then((txt) => new Promise((ok, err) => new GLTFLoader().parse(b64bytes(txt.trim()).buffer, "", ok, err)));

// In the jeep's frame (props/jeep/build_jeep.py): the front seats' cushion tops at y 0.86 either side of x 0 (SeatP is the
// driver's, on +X), the folded rear seats a flat deck 1.08 wide at y 0.78 round z -1.06 (Boot), and the roof rack's bars
// at y 1.82 from z 0.22 back to -1.56 with its jerry cans and crate from z -0.55 back, so its front part is free.
const SEAT_Y = 0.86, HIP = 0.27;   // the kit's seated clip keeps the root 0.27 m under the seat's top (operator/walk.js: 0.36 m logs, root at ground + 0.09)
// The cab is built for sloths and you (1.70 m to the roof): seated on the cushion his head went through it, so the two people
// sit 0.22 m lower and a little smaller. Below the window line (y 1.06) nobody sees where their hips and legs are.
const SINK = 0.22, PEOPLE = 0.92;
const DECK = [V(-0.34, 0.78, -1.06), V(0, 0.78, -1.1), V(0.34, 0.78, -1.06)];
const RACK = [V(-0.42, 1.83, -0.2), V(0, 1.83, -0.12), V(0.42, 1.83, -0.2)];
const RIDE = 1.6;   // a riding sloth's size (the trip's wagon size: 0.46 m tall sitting), times its own cast size

function person(src, clip) {   // a kit character sitting (both share the kit rig, so his seated clip seats her too)
  const o = src; o.position.set(0, 0, 0); o.rotation.set(0, Math.PI, 0); o.scale.multiplyScalar(PEOPLE);   // the kit faces -Z; the jeep's front is +Z
  o.traverse((n) => { if (n.isSprite) n.visible = false; });   // no speech bubble or Z's riding along
  const B = {}; o.traverse((n) => { if (n.isBone) B[n.name] = n; });
  const mixer = new THREE.AnimationMixer(o); mixer.clipAction(clip).play();
  return { o, B, mixer };
}
function sloth(s, at, sc, ph) {   // a clone of a camp sloth as it is dressed, sitting up (its drive clip), facing ahead
  const o = clone(s.o); o.visible = true; o.position.copy(at); o.rotation.set(0, Math.PI, 0); o.scale.setScalar(sc);
  const mixer = new THREE.AnimationMixer(o), a = mixer.clipAction(SLOTH.animations.find((c) => c.name === "drive"));
  a.play(); a.timeScale = 0.35; a.time = ph;
  return { o, mixer };
}

export async function boardRiders(jeep) {
  const seven = camp.filter((s) => s.name);
  if (!SLOTH || !seven.length) return null;
  const HER = opRoot && opClips.seated_idle ? await herModel().catch(() => null) : null;
  jeep.updateMatrixWorld(true);
  const seat = jeep.getObjectByName("SeatP")?.position ?? V(0.36, SEAT_Y, -0.18), hub = jeep.getObjectByName("WheelHub")?.position ?? V(0.36, 1.15, 0.05);
  const riders = [], people = [];
  if (HER) {
    const clip = opClips.seated_idle.getClip();
    const him = person(clone(opRoot), clip), you = person(kitLook(clone(HER.scene)), clip);
    him.o.position.set(seat.x, seat.y - HIP - SINK, seat.z - 0.02); you.o.position.set(-seat.x, seat.y - HIP - SINK, seat.z - 0.02);
    him.mixer.setTime(0.6); you.mixer.setTime(2.1);
    people.push(him, you); riders.push(him, you);
    him.hands = { L: hub.clone().add(V(0.13, 0.02, -0.02)), R: hub.clone().add(V(-0.13, 0.02, -0.02)) };   // on the rim, a quarter to three (facing +Z, his left is +X)
  }
  // who sits where: the smallest on your lap (or on the passenger seat when you are not there), then the deck, then the rack
  const bySize = seven.slice().sort((a, b) => (a.k ?? 1) - (b.k ?? 1)), lap = bySize[0], rest = seven.filter((s) => s !== lap);
  const lapAt = V(-seat.x, seat.y + (HER ? 0.17 - SINK : 0), seat.z + (HER ? 0.2 : 0));
  riders.push(sloth(lap, lapAt, RIDE * (lap.k ?? 1), 0));
  rest.forEach((s, i) => riders.push(sloth(s, (i < 3 ? DECK[i] : RACK[i - 3]) ?? RACK[2], RIDE * (s.k ?? 1), 0.4 + i * 0.37)));
  for (const r of riders) jeep.add(r.o);
  const hidden = seven.filter((s) => s.o.visible); for (const s of hidden) s.o.visible = false;
  const w = V(), pole = V();
  return {
    step(dt) {
      for (const r of riders) r.mixer.update(dt);
      for (const p of people) if (p.hands) { p.o.updateMatrixWorld(true);
        for (const side of ["L", "R"]) reach(p.B, side, toStage(jeep.localToWorld(w.copy(p.hands[side]))), pole.set(side === "L" ? 1 : -1, -1, -0.6).transformDirection(jeep.matrixWorld)); }
    },
    remove() { for (const r of riders) { jeep.remove(r.o); r.mixer.stopAllAction(); } for (const s of hidden) s.o.visible = true; },
  };
}
