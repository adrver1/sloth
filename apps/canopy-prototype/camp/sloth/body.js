// Canopy Camp sloths, the body: one sloth from the model, with its fur, its clip and everything the other modules keep on it.
//   hang(p, dir, sc)   makes a sloth hanging under a branch at p (poses.js underAt), its head toward dir, at size sc, adds
//                      it to the scene with its tap sphere and to state.js's sloths and hit. Draws three numbers from the
//                      sloths' stream. It is the one place a sloth object is made, and it lists every field one has, with
//                      its meaning (review sloths-34).
//   warmStep(fl, dusk)   each frame (main.js): sets the fire's part of SLOTH_WARM, the uniforms (kept in here) of the warm
//                      glow the sloths take at night from the lanterns and the fire (fur.js warm); the first hang() puts the
//                      lanterns in, since their light positions are fixed (R2-093)
// review 2026-11-12 (P5, B4): Lambert body and fur like the camp; a fixed padded bounding sphere so off-screen sloths are
// culled; an 8x6 tap sphere.
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { WARM_N, furify } from "../../fur.js";
import { D, OPT, rng, S, scene } from "../core.js";
const { R } = rng("sloths");
import { V } from "../util.js";
import { LANTERNS } from "../campProps.js";
import { SL, SLOTH, hit, sloths } from "./state.js";
import { eyeKit } from "./face.js";
import { armBones } from "./arms.js";
import { underAt } from "./poses.js";

let tinted = false;
// at night the camp's light is baked into the props, so the sloths take a warm glow from the lanterns and the fire nearby
// (fur.js warm): the lanterns' positions and strengths are set once, by the first hang() (campProps.js has made the
// lanterns by then); warmStep sets the fire's strength with its flicker, and uWarm = dusk, each frame
const SLOTH_WARM = { uWarm: { value: 0 }, uWarmPos: { value: Array.from({ length: WARM_N }, () => V(0, -99, 0)) }, uWarmK: { value: new Array(WARM_N).fill(0) } };
SLOTH_WARM.uWarmPos.value[WARM_N - 1].set(0, 0.6, 0);   // the last slot is the fire
function placeLanterns() {
  const W = SLOTH_WARM, lights = LANTERNS.lights, n = Math.min(lights.length, WARM_N - 1);
  for (let i = 0; i < n; i++) { W.uWarmPos.value[i].copy(lights[i]); W.uWarmK.value[i] = 0.15; }
}
function warmStep(fl, dusk) {                          // each frame (main.js): the fire's flicker fl, how far the night is in
  SLOTH_WARM.uWarmK.value[WARM_N - 1] = 0.9 * fl; SLOTH_WARM.uWarm.value = dusk;
}
function hang(p, dir, sc = SL) {                      // a sloth under a branch at p, its head toward dir
  const o = clone(SLOTH.scene); o.scale.setScalar(sc);
  furify(o, { shells: D.shells, lambert: OPT.slothmat !== "old", warm: SLOTH_WARM });   // ?slothmat=old: the GLB's physical material, as before
  o.traverse((m) => { if (m.isSkinnedMesh && !m.userData.fur) { m.geometry.computeBoundingSphere(); m.boundingSphere = m.geometry.boundingSphere.clone(); m.boundingSphere.radius *= 2; } });
  o.traverse((m) => { if (m.userData.fur) { const b = m.parent.children.find((q) => q.isSkinnedMesh && !q.userData.fur); m.boundingSphere = b.boundingSphere.clone(); m.frustumCulled = true; } });
  if (!tinted) { o.traverse((m) => m.isMesh && m.material.color?.setHex(S.slothTint)); placeLanterns(); tinted = true; }
  const mixer = new THREE.AnimationMixer(o), act = mixer.clipAction(SLOTH.animations.find((a) => a.name === "cling"));
  act.play(); act.time = R(0, 4); act.timeScale = 0.6;   // (kept as s.act)
  const P = underAt({ sc }, p, dir); o.quaternion.copy(P.q); o.position.copy(P.p); scene.add(o);
  const box = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); box.position.copy(p).add(V(0, -0.25, 0)); scene.add(box);
  const eyes = eyeKit(o), blink = R(1, 6), napT = R(4, 40);   // (in this order: eyeKit makes the eye meshes' own shapes, then two seeded draws)
  // Every field a sloth has, with what it means. The ones that start undefined are set later by the module named; the
  // camp's other modules read and set these too (input.js: squish, nod, munch; operator.js: trip, spot, asleep, and its
  // own s.cuddled).
  const s = {
    // the body
    o,                           // the model's root (its place, turn and size in the scene)
    sc,                          // its size now (the model is 1); a camp sloth grows or shrinks to its spot's size (wayIn.js)
    head: o.getObjectByName("head"),   // the head bone
    arm: armBones(o, "R"), armL: armBones(o, "L"),   // [upper arm, forearm] bones, right and left
    shells: o.userData.furShells || [],   // the fur shells, shown only near the camera (life.js)
    eyes,                        // eyes(closed): shuts or opens them (face.js eyeKit)
    mouth: undefined,            // the mouth card, made the first time it yawns or chews (face.js mouthOf)
    mixer, act,                  // its animation mixer and the clip playing now (clips.js play)
    once: undefined,             // what to do when a clip played once has run through (clips.js playOnce)
    // where a tap finds it
    box,                         // its tap sphere (input.js); follows a camp sloth each frame (step.js)
    p,                           // the point hearts and words fly to: the sphere's middle
    // who it is
    wild: undefined,             // true for the ones in the trees (sloths.js)
    name: undefined,             // a camp sloth's name (cast.js); the wild ones have none
    // its life on top of the clip (life.js)
    squish: 0,                   // > 0 after a boop: seconds of wobble left (input.js sets it)
    nod: 0,                      // > 0: seconds of nodding left
    blink,                       // seconds to its next blink
    look: 0,                     // 0..1: how far its head is turned to you
    gaze: 0,                     // seconds you have kept looking at it
    wave: 0,                     // > 0: seconds into a wave
    waveCD: 0,                   // seconds until it may wave again
    munch: undefined,            // > 0: seconds of munching left (what you fed it)
    yawn: 0,                     // > 0: seconds into a yawn (face.js yawnStep)
    droop: 0,                    // 0..1: how far its head has sunk in sleep
    // naps (naps.js)
    napT,                        // seconds awake until it next nods off
    dozing: undefined,           // true from the yawn before a nap until it wakes
    asleep: undefined,           // true while its eyes are shut in sleep
    dozeIn: undefined,           // seconds until a dozing one is asleep
    dozeT: undefined,            // seconds of sleep left
    roused: undefined,           // woken where it is: { t, dur, back (to sleep after), wave, waved }
    zz: undefined, zk: undefined,   // the three z's over a sleeper and where they are in their rise (naps.js zStep)
    // a camp sloth's day (sloths.js places it; day.js, wayIn.js, wayOut.js)
    spot: undefined,             // where it lives now: its home, or the guest spot of a nap trip (spots.js)
    ownSpot: undefined,          // its own home while it is away on a nap trip
    trip: undefined,             // what it is doing: { phase, t (seconds in it), yaw, ... } (step.js lists the phases)
    errand: undefined,           // seconds at home until it next sets off
    greetCD: undefined,          // seconds until it may say hello again (walk.js)
    wantFood: undefined,         // the move lab's "Get food": the next errand is food (hooks.js)
    fixNext: undefined,          // the move lab's "Fix": the next errand is the jeep's engine
    food: undefined,             // where a bowl you set down is: the next errand is to eat from it (day.js watchFood)
    cardsTo: undefined,          // its place at the table for the game it is on its way to (cards.js)
    napTo: undefined,            // the guest spot the move lab sent it to for a nap
    hand: undefined,             // its fan of cards, made the first time it plays
    smoreT: undefined,           // seconds until the seat's sloth next toasts a s'more (smore.js)
    smore: undefined,            // the s'more it is toasting or eating: { hold, eating, held }
    // food you give it (gifts.js)
    gift: undefined,             // { mesh, from, land, t, clip (eaten with the eat clip), at }
    armRest: undefined,          // its arm bones' rest turn, kept while the arm reaches for a gift (arms.js giftArm)
  };
  box.userData.s = s; sloths.push(s); hit.push(box);
}

export { hang, warmStep };
