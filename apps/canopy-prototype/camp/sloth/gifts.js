// Canopy Camp sloths, food you give one (activities.js food(), a mesh from camp/food.js leaving your hand; Adriaen
// 2026-11-13: the food is modelled so the sloths eat it with their own eat clip).
//   eatGift(s, mesh, from)   sloth s gets the food `mesh`, thrown from `from`. Sitting up and awake (resting in the
//                            clearing, or on its log or jeep seat) it plays eat, its paw takes the food out of the air and
//                            it bites it smaller, and its day carries on after: returns "eat". Anywhere else (walking,
//                            hanging, in bed, held) the food flies to its paw and it munches it: returns "munch".
//                            (window.__campLife.eatGift: input.js give())
//   giftStep(s)              each frame while it eats a gift with the eat clip: the food floats to its paw, then the chewing
//   giftFly(s, dt)           each frame otherwise: its right paw comes up (arms.js giftArm), the food flies into it, the
//                            paw lifts it to its lips and it shrinks a bite at a time while the mouth munches (Adriaen
//                            2026-11-13: "they eat without hands")
import { scene } from "../core.js";
import { V, sstep } from "../util.js";
import { EAT_GRAB, canStretch, homeClip, play, playOnce } from "./clips.js";
import { mouthOf } from "./face.js";
import { pawOf } from "./arms.js";
import { chewStep } from "./eating.js";

const paw = V(), mouthW = V();
function eatGift(s, mesh, from) {
  if (s.gift) { scene.remove(s.gift.mesh); s.gift = null; }
  mesh.position.copy(from); mesh.scale.copy(mesh.userData.base ?? V(1, 1, 1)); scene.add(mesh);
  const sitUp = canStretch(s) && !s.asleep && !s.dozing && !s.once && !s.smore && !s.wave && !s.yawn && (s.trip.phase === "rest" ? !s.trip.slept : s.trip.phase === "home");
  s.gift = { mesh, from: from.clone(), land: from.clone(), t: 0, clip: sitUp }; s.nod = 1.2;
  if (sitUp) playOnce(s, "eat", 0.5, () => { scene.remove(mesh); if (s.mouth) s.mouth.visible = false; s.gift = null; const [c, ts] = homeClip(s); play(s, c, 0.9, ts); }, EAT_GRAB - 0.9);
  return sitUp ? "eat" : "munch";
}
// a gift while it sits up: the food floats to its paw as the paw comes up, then the eat clip's chewing
function giftStep(s) {
  const G = s.gift, t = s.act.time;
  if (t < EAT_GRAB) { pawOf(s, paw); const k = sstep(EAT_GRAB - 0.9, EAT_GRAB, t); G.mesh.position.lerpVectors(G.from, paw, k); G.mesh.position.y += Math.sin(Math.PI * k) * 0.25; G.land.copy(paw); }
  else chewStep(s, G.mesh, G.land, EAT_GRAB);
}
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

export { eatGift, giftFly, giftStep };
