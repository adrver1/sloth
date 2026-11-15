// Canopy Camp sloths, food you give one (activities.js food(), a mesh from camp/food.js leaving your hand; Adriaen
// 2026-11-13: the food is modelled so the sloths eat it with their own eat clip).
//   eatGift(s, mesh, from)   sloth s gets the food `mesh`, thrown from `from`. Sitting up and awake (resting in the
//                            clearing, or on its log or jeep seat) it plays eat, its paw takes the food out of the air and
//                            it bites it smaller, and its day carries on after: returns "eat". On its way across the
//                            clearing (walking or greeting) it stops, sits and eats it the same way, sits a moment more,
//                            then walks on (Adriaen 2026-11-14). Anywhere else (hanging, in bed, held) the food flies to
//                            its paw and it munches it: returns "munch".
//                            A gift while it still eats the last one ends that one, and it eats the new one.
//                            Camp sloths only (a wild one has no trip: input.js gives it a flower's feed instead).
//                            (slothLife.eatGift, sloth/hooks.js: input.js give())
//   giftStep(s, sd)          each frame while it eats a gift with the eat clip: the food floats to its paw, then the chewing;
//                            after a gift eaten on foot, the moment it sits on before it walks on
//   giftFly(s, dt)           each frame otherwise: its right paw comes up (arms.js giftArm), the food flies into it, the
//                            paw lifts it to its lips and it shrinks a bite at a time while the mouth munches (Adriaen
//                            2026-11-13: "they eat without hands")
import { rng, scene } from "../stage.js";
const { R } = rng("slothDay");
import { V, sstep } from "../util.js";
import { WALK_TS } from "./state.js";
import { EAT_GRAB, canStretch, homeClip, play, playOnce } from "./clips.js";
import { mouthOf } from "./face.js";
import { pawOf } from "./arms.js";
import { chewStep } from "./eating.js";
import { bite } from "../actor.js";

const paw = V(), mouthW = V();
// back to what its day was doing: walking on, standing to greet, or its clip at home
function resume(s) {
  const ph = s.trip?.phase;
  if (ph === "walk") play(s, "walk", 1, WALK_TS); else if (ph === "greet") play(s, "idle", 0.8); else { const [c, ts] = homeClip(s); play(s, c, 0.9, ts); }
}
function eatGift(s, mesh, from) {
  // a gift while it still eats the last one: that one is done (its eat clip's end is dropped, R2-007), and the new one is
  // eaten from the start
  const was = s.gift; s.gift = null;
  if (was?.mesh) scene.remove(was.mesh);
  if (was?.clip) { s.once = null; if (s.mouth) s.mouth.visible = false; }
  mesh.position.copy(from); mesh.scale.copy(mesh.userData.base ?? V(1, 1, 1)); scene.add(mesh);
  // on its way across the clearing (Adriaen 2026-11-14: "it should stop and sit down for a bit while eating"): it stops,
  // sits and eats it the same way, sits a moment more, then walks on
  const onFoot = (s.trip.phase === "walk" || s.trip.phase === "greet") && !s.asleep && !s.once && !s.wave;
  const sitUp = onFoot || canStretch(s) && !s.asleep && !s.dozing && !s.once && !s.smore && !s.wave && !s.yawn && (s.trip.phase === "rest" ? !s.trip.slept : s.trip.phase === "home");
  s.gift = { mesh, from: from.clone(), land: from.clone(), t: 0, clip: sitUp }; s.nod = 1.2;
  if (sitUp) playOnce(s, "eat", onFoot ? 0.8 : 0.5, () => { scene.remove(mesh); if (s.mouth) s.mouth.visible = false;
    if (onFoot) { s.gift = { clip: true, wait: R(1.5, 3) }; play(s, "idle", 0.9); return; }   // a moment more sitting, then on (giftStep)
    s.gift = null; const [c, ts] = homeClip(s); play(s, c, 0.9, ts); }, EAT_GRAB - (onFoot ? 1.3 : 0.9));
  else if (was?.clip) resume(s);   // it cannot sit up for this one: out of the last eat clip, and it munches
  return sitUp ? "eat" : "munch";
}
// a gift while it sits up: the food floats to its paw as the paw comes up, then the eat clip's chewing
function giftStep(s, sd) {
  const G = s.gift, t = s.act.time;
  if (G.wait != null) { G.wait -= sd; if (G.wait < 0) { s.gift = null; resume(s); } return; }
  if (t < EAT_GRAB) { pawOf(s, paw); const k = sstep(EAT_GRAB - 0.9, EAT_GRAB, t); G.mesh.position.lerpVectors(G.from, paw, k); G.mesh.position.y += Math.sin(Math.PI * k) * 0.25; G.land.copy(paw); }
  else chewStep(s, G.mesh, G.land, EAT_GRAB);
}
function giftFly(s, dt) {
  const G = s.gift; G.t += dt; mouthOf(s).getWorldPosition(mouthW); pawOf(s, paw);
  if (G.t < 0.9) { const k = sstep(0, 0.9, G.t); G.mesh.position.lerpVectors(G.from, paw, k); G.mesh.position.y += Math.sin(Math.PI * k) * 0.3; return; }
  if (G.t < 3.6) {
    if (!G.at && G.t > 1.2) { G.at = true; s.nod = 0.8; s.munch = 2.4; }
    G.mesh.position.copy(paw).lerp(mouthW, 0.45 * sstep(0.9, 1.3, G.t));
    bite(G.mesh, Math.max(0, Math.floor((G.t - 1.2) / 0.6)), 0.22);
  } else if (G.mesh.parent) scene.remove(G.mesh);
  if (G.t > 4.2) s.gift = null;
}

export { eatGift, giftFly, giftStep };
