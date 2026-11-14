// Canopy Camp operator, his hands each frame, after the clip has posed him: a sloth held under its arms, a bend at the
// waist, the reaches his activity asks for (op.ik), the open book, a hug, hands folded in his sleep, the soup bowl and
// spoon, the mug or the bowl in his right hand, the pail, the stirring spoon, a vegetable, and the hand that comes out
// for food you give him. Each block reads the state and places bones and props; the order is the order they were always in.
// Exports poseHands(dt) (step.js, each frame).
import * as THREE from "three";
import { uTime } from "../core.js";
import { SOUP_POT } from "../layout.js";
import { V, ease } from "../util.js";
import { book, bowl, mug, pail, spoon, stick, veg } from "./handProps.js";
import { THUMB, handQuat } from "./ik.js";
import { B, UP, clips, cs, csDir, cur, reach, root, turnHand } from "./model.js";
import { BED } from "./places.js";
import { op } from "./state.js";
import { mouthAt } from "./talk.js";

const tq = new THREE.Quaternion(), qc = new THREE.Quaternion(), va = V(), vb = V(), mA = new THREE.Matrix4();
function poseHands(dt) {
  if (op.carry) {                                      // a sloth in his hands: its armpits where the clip puts his hands, his hands under its arms
    const c = op.carry, sl = c.s.o, bone = (n) => sl.getObjectByName(n) || sl.getObjectByName(n.replace(/(L|R)$/, ".$1"));
    const hm = B.handL.getWorldPosition(va).add(B.handR.getWorldPosition(vb)).multiplyScalar(0.5);
    sl.updateMatrixWorld(true); const pL = bone("upper_armL").getWorldPosition(V()), pR = bone("upper_armR").getWorldPosition(V());
    const off = pL.clone().add(pR).multiplyScalar(0.5).sub(sl.position);
    const high = cur === clips.play_airplane, want = hm.clone().addScaledVector(UP, high ? 0.12 : -0.13).addScaledVector(csDir(0, 0, -1), high ? 0.05 : 0.12).sub(off);   // held out in front, its head below his chin (up overhead when it flies)
    sl.position.lerpVectors(c.from, want, c.k); sl.position.y += Math.sin(c.k * Math.PI) * 0.1; sl.quaternion.slerpQuaternions(c.q0, root.quaternion, c.k);
    sl.updateMatrixWorld(true); bone("upper_armL").getWorldPosition(pL); bone("upper_armR").getWorldPosition(pR);
    const side = pR.clone().sub(pL).normalize();
    reach("R", pR.addScaledVector(side, 0.03).addScaledVector(UP, -0.035), csDir(1, -0.8, 0.4), c.k);
    reach("L", pL.addScaledVector(side, -0.03).addScaledVector(UP, -0.035), csDir(-1, -0.8, 0.4), c.k);
  }
  // after the clip: hands (reach, the book, the hug), the head's look, blinks and a happy face
  if (op.lean) { B.spine?.rotateX(-0.6 * op.lean); B.chest.rotateX(-0.45 * op.lean); }   // bent forward at the waist (reaching down for the pail, out over the pot)
  const k = op.ik;
  if (k?.R) reach("R", k.R[0], csDir(1, -0.6, 0.2), k.R[1]);
  if (k?.L) reach("L", k.L[0], csDir(-1, -0.6, 0.2), k.L[1]);
  if (k?.book > 0) {                                   // the open book at reading distance, tilted up to his face, a hand under each half
    const sway = Math.sin(uTime.value * 0.7) * 0.012, c = cs(sway, 0.9, -0.34);
    book.position.copy(c); book.quaternion.copy(root.quaternion).multiply(tq.setFromEuler(new THREE.Euler(-0.62, 0, 0.03 * Math.sin(uTime.value * 0.5)))); book.visible = k.book > 0.4;
    book.updateMatrixWorld(true);
    // a hand behind each half at its lower outer corner, palm flat on the cover, fingers up and in along its back
    const e = ease(k.book), bq = book.getWorldQuaternion(tq).clone(), bd = (x, y, z) => V(x, y, z).applyQuaternion(bq);
    for (const [sd, S] of [[1, "R"], [-1, "L"]]) {
      reach(S, V(sd * 0.11, -0.09, 0).applyMatrix4(book.matrixWorld), csDir(sd, -1, 0.2), e);
      turnHand(S, handQuat(S, bd(-sd * 0.45, 1, 0), bd(-sd * 0.3, 0, 1)), e);
    }
  }
  if (k?.hug > 0 && op.buddy) {                        // his arms round the sloth on his lap (or on his chest)
    const b = op.buddy.o, c = b.getWorldPosition(V()).addScaledVector(V(0, 1, 0).applyQuaternion(b.getWorldQuaternion(tq)), 0.09 * (op.buddy.sc || 2)), side = csDir(1, 0, 0), fr = csDir(0, 0, -1);
    reach("R", c.clone().addScaledVector(side, 0.12).addScaledVector(fr, 0.05), csDir(1, -0.5, 0.4), k.hug);
    reach("L", c.clone().addScaledVector(side, -0.12).addScaledVector(fr, 0.05), csDir(-1, -0.5, 0.4), k.hug);
  }
  if (k?.sleep && !k.hug) {                            // asleep: hands folded on the tummy, the near arm over a sloth beside him
    const breathe = Math.sin(uTime.value * 1.3) * 0.008;
    reach("R", cs(0.05, 1.0, -0.17 - breathe), csDir(1, 0, -0.2), 1); reach("L", cs(-0.05, 1.02, -0.17 - breathe), csDir(-1, 0, -0.2), 1);
    if (k.nap > 0 && op.buddy) {
      const sd = csDir(1, 0, 0).dot(BED.across) > 0 ? "R" : "L", sl = op.buddy.o.getWorldPosition(V()), sc = op.buddy.sc || 2;
      reach(sd, sl.addScaledVector(BED.across, 0.06 * sc).addScaledVector(UP, 0.13 * sc), UP.clone().addScaledVector(BED.across, 0.5), k.nap);
    }
    B.chest.rotateX(breathe * 4);
  }
  if (op.eat) {                                        // soup: the bowl on his left palm in front of him, his right spooning from it to his mouth
    const e = op.eat, at = op.seated ? cs(0.02, 0.74, -0.3) : cs(0.02, 1.0, -0.33);
    bowl.position.copy(at); bowl.quaternion.copy(root.quaternion);
    // the left hand flat under the bowl, palm up, fingers forward and across (the bowl's foot on the palm)
    const fL = csDir(0.55, 0, -0.85), qL = handQuat("L", fL, UP);
    reach("L", at.clone().addScaledVector(fL, -0.045).addScaledVector(UP, -0.025), csDir(-1, -0.7, 0.3), 1); turnHand("L", qL);
    // one spoonful about every 4 s: dip, lift to the lips, back down (only once he sits; walking he holds the bowl in both hands)
    const ph = (e.t % 4) / 4, sm = (a, b) => THREE.MathUtils.smoothstep(ph, a, b), up = e.spoon * (sm(0.3, 0.5) - sm(0.62, 0.82));
    // the spoon held overhand like a pencil, between thumb and index: its tip in the soup, then at his lips, the hollow kept level
    const tipDip = at.clone().addScaledVector(csDir(1, 0, 0), 0.03).addScaledVector(UP, 0.045 - 0.02 * Math.sin(Math.min(1, ph / 0.3) * Math.PI));
    const lips = B.head.getWorldPosition(V()).addScaledVector(csDir(0, 0, -1), 0.13).addScaledVector(csDir(1, 0, 0), 0.01).addScaledVector(UP, -0.09);
    const d = csDir(-0.5, -0.75, -0.45).normalize().lerp(csDir(-0.7, 0.1, 0.7).normalize(), up).normalize();   // grip to tip
    const qR = handQuat("R", d.clone().add(csDir(0, 0.6, -0.4).multiplyScalar(1 - up)).addScaledVector(UP, 0.25 * up).normalize(),   // fingers over the bowl, the spoon angled down from them
       csDir(-0.4, -1, 0).lerp(csDir(-0.3, -0.6, 0.6), up)), thumb = THUMB.R.clone().applyQuaternion(qR), fR = UP.clone().applyQuaternion(qR);
    const tip = tipDip.lerp(lips, up), grip = tip.clone().addScaledVector(d, -0.14);
    reach("R", grip.clone().addScaledVector(fR, -0.06).addScaledVector(thumb, -0.02), csDir(1, -0.8, 0.3), 1); turnHand("R", qR);
    spoon.position.copy(grip); { const z = UP.clone().addScaledVector(d, -UP.dot(d)).normalize(); spoon.quaternion.setFromRotationMatrix(mA.makeBasis(V().crossVectors(d, z), d, z)); }   // +Y along d, the hollow (+Z) up
    op.look = op.seated ? -0.28 * (1 - up) : 0;
  }
  if (op.inHand === mug) {                             // the mug: held by its handle (fingers through it, thumb on top), upright at
    // his chest (lap when seated) with the handle to his right, lifted to his lips and tipped toward him as he sips (the sip
    // clip's time sets how far); the mug is placed first, then his right hand goes to the handle
    const a = clips.sip, st = cur === a ? a.time : 0, lift = THREE.MathUtils.smoothstep(st, 1.3, 1.75), tip = THREE.MathUtils.smoothstep(st, 1.45, 1.9);
    const tilt = 0.85 * tip, q = mug.quaternion.copy(root.quaternion).multiply(qc.setFromAxisAngle(V(1, 0, 0), tilt));
    const up = V(0, 1, 0).applyQuaternion(q), rest = op.seated ? cs(0.09, 0.93, -0.4) : cs(0.13, 1.08, -0.38);   // out in front, clear of his shirt
    const lips = mouthAt(V()).addScaledVector(csDir(0, 0, -1), 0.01).addScaledVector(UP, -0.012).addScaledVector(up, -0.088);   // the rim at his lips
    mug.position.lerpVectors(rest, lips, lift);
    const mx = V(1, 0, 0).applyQuaternion(q), mz = V(0, 0, -1).applyQuaternion(q);   // handle side, his forward (in the mug's frame)
    const grip = mug.position.clone().addScaledVector(up, 0.025).addScaledVector(mx, 0.08);
    reach("R", grip.addScaledVector(mz, -0.05).addScaledVector(mx, 0.012), csDir(1, -0.9, 0.2), 1);
    turnHand("R", handQuat("R", mz.clone().addScaledVector(mx, -0.35).normalize(), mx.clone().negate()));
  } else if (op.inHand) {                              // the bowl in his right hand: at the palm, upright
    const h = B.handR, p = op.inHand, a = clips.sip, tip = cur === a ? Math.min(1, Math.max(0, (a.time - 1.45) / 0.35)) : 0;
    h.getWorldPosition(p.position).addScaledVector(V(0, 1, 0).applyQuaternion(h.getWorldQuaternion(tq)), 0.06).addScaledVector(UP, -0.05).addScaledVector(csDir(0, 0, -1), 0.02);
    p.quaternion.copy(root.quaternion).multiply(qc.setFromAxisAngle(V(1, 0, 0), tip * 1.0));
  }
  // cooking: the pail hangs by its bail from his right hand (held out and tipped over the pot to pour); the long spoon goes
  // from his hand into the pot, stirring round; a vegetable sits in his right hand
  if (op.pail) {
    const P = op.pail, hang = B.handR.getWorldPosition(V()).add(V(0, -0.34, 0).applyQuaternion(root.quaternion));
    pail.quaternion.copy(root.quaternion).multiply(qc.setFromAxisAngle(V(1, 0, 0), -1.25 * P.tilt));   // pouring: its mouth tipped toward the pot
    if (P.tilt > 0) {   // held out over the pot's near rim, his hand on the bail
      const pot = SOUP_POT.at, over = pot.clone().add(V(root.position.x - pot.x, 0, root.position.z - pot.z).setLength(0.24)).setY(pot.y + 0.12);
      pail.position.lerpVectors(hang, over, THREE.MathUtils.smoothstep(P.tilt, 0, 0.5));
      reach("R", pail.position.clone().add(V(0, 0.3, 0).applyQuaternion(pail.quaternion)), csDir(1, -0.6, 0.2), Math.min(1, P.tilt * 2));
    } else if (P.from) pail.position.lerpVectors(P.from, hang, P.k); else pail.position.copy(hang);
  }
  if (op.stir) {
    const S = op.stir, pot = SOUP_POT.at, a = S.t * 2.2, tip = pot.clone().add(V(Math.cos(a) * 0.06, -0.02, Math.sin(a) * 0.06));
    reach("R", cs(0.1 + Math.cos(a) * 0.03, 1.2, -0.42 + Math.sin(a) * 0.025), csDir(1, -0.6, 0.2), S.k);
    const g = B.handR.getWorldPosition(V()), d = tip.sub(g); stick.position.copy(g); stick.scale.set(1, d.length() + 0.06, 1); stick.quaternion.setFromUnitVectors(UP, d.normalize());
  }
  if (op.veg) B.handR.getWorldPosition(veg.position).addScaledVector(V(0, 1, 0).applyQuaternion(B.handR.getWorldQuaternion(tq)), 0.07);
  // food you gave him (gift, below; Adriaen 2026-11-13: "they eat without hands"): his free hand comes out to take it, then
  // lifts it to his mouth a bite at a time and goes down again when it's gone
  if (op.talk.hand) {
    const H = op.talk.hand, S = H.side, sd = S === "R" ? 1 : -1, F = op.talk.food;
    const out = cs(0.16 * sd, op.seated ? 0.95 : 1.15, -0.4), lips = mouthAt(V()).add(V(0, -0.075, 0)).addScaledVector(csDir(0, 0, -1), 0.02).addScaledVector(csDir(sd, 0, 0), 0.02);
    const bite = F ? Math.max(0, Math.sin(F.t / 0.5 * Math.PI * 2 - 1)) : 0;   // in to the lips for each bite, a little away between
    lips.addScaledVector(csDir(0, -0.4, -1), 0.05 * (1 - bite));
    const toLips = F ? THREE.MathUtils.smoothstep(F.t, 0, 0.4) : H.down > 0 ? 1 : 0, w = H.down > 0 ? H.down / 0.5 : Math.min(1, H.t / 0.4);
    reach(S, out.lerp(lips, toLips), csDir(sd, -0.8, 0.3), w);
    H.t += dt; if (!F && !op.talk.fly && H.down <= 0) H.down = 0.5; if (H.down > 0) { H.down -= dt; if (H.down <= 0) op.talk.hand = null; }
  }
}

export { poseHands };
