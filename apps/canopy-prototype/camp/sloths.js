// Canopy Camp sloths: the wild sloths hanging in the trees, the seven named sloths living in camp and going about their day
// (errands to the snack table and crate, s'mores, saying hello, wayfinding), and their life: fur, blinks, looks and a wave.
import { WARM_N, furify } from "../fur.js";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import "./jeep.js";   // run after the module before it, as one script did
import { D, PROPS, R, S, camera, canvasTex, qs, scene, sstep, uTime } from "./core.js";
import { A0, HERO, RC, V, branchCurves } from "./forest.js";
import { SLOTH, blockers } from "./campProps.js";
import { CAST } from "./cast.js";

const SL = 2.6, BR = { y: 0.10 * SL, z: 0.10 * SL };
const sloths = [], hit = [];
let tinted = false;
// review 2026-11-12 (P5, B4): Lambert body and fur like the camp; fur shells only within FUR_NEAR of the camera; a fixed
// padded bounding sphere so off-screen sloths are culled; an 8x6 tap sphere; and a little life: they blink now and
// then, and turn their heads to look at you when you come close (LOOK_NEAR).
const FUR_NEAR = 8, LOOK_NEAR = 4.5;
// at night the camp's light is baked into the props, so the sloths take a warm glow from the lanterns and the fire nearby
// (fur.js warm; set each frame in the loop: lantern positions, the fire, and uWarm = dusk with the fire's flicker)
const SLOTH_WARM = { uWarm: { value: 0 }, uWarmPos: { value: Array.from({ length: WARM_N }, () => V(0, -99, 0)) }, uWarmK: { value: new Array(WARM_N).fill(0) } };
const FACE = (() => {                                  // which way the face points in the head bone's frame (the sloth faces -Z at rest)
  SLOTH.scene.updateMatrixWorld(true); const h = SLOTH.scene.getObjectByName("head");
  return V(0, 0, -1).applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(SLOTH.scene.getWorldQuaternion(new THREE.Quaternion())));
})();
let palette = null;
function eyeKit(o) {                                   // per sloth: its own copy of the meshes' UVs with the eyes open and shut
  const kit = [];
  o.traverse((m) => {
    if (!m.isSkinnedMesh || !m.material.map) return;
    if (!palette) { const img = m.material.map.image, cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext("2d"); g.drawImage(img, 0, 0); palette = { w: cv.width, h: cv.height, px: g.getImageData(0, 0, cv.width, cv.height).data }; }
    const { w, h, px } = palette;
    m.geometry = m.geometry.clone(); const uv = m.geometry.attributes.uv, kind = [];
    for (let i = 0; i < uv.count; i++) {
      const k = (Math.min(h - 1, Math.floor(uv.getY(i) * h)) * w + Math.min(w - 1, Math.floor(uv.getX(i) * w))) * 4, r = px[k], gg = px[k + 1], b = px[k + 2];
      kind.push(r < 40 && gg < 40 && b < 45 ? "eye" : r > 235 && gg > 235 && b > 230 ? "eye" : r < 75 && r > gg && gg > b ? "patch" : "");
    }
    const pi = kind.indexOf("patch"); if (pi < 0) return;
    const shut = new THREE.BufferAttribute(new Float32Array(uv.count * 2), 2);
    for (let i = 0; i < uv.count; i++) shut.setXY(i, kind[i] === "eye" ? uv.getX(pi) : uv.getX(i), kind[i] === "eye" ? uv.getY(pi) : uv.getY(i));
    kit.push([m.geometry, uv, shut]);
  });
  return (closed) => kit.forEach(([g, open, shut]) => { g.attributes.uv = closed ? shut : open; });
}
function hang(p, dir, sc = SL) {                      // a sloth under a branch at p, its head toward dir
  const o = clone(SLOTH.scene); o.scale.setScalar(sc);
  furify(o, { shells: D.shells, lambert: qs.get("slothmat") !== "old", warm: SLOTH_WARM });   // ?slothmat=old: the GLB's physical material, as before
  o.traverse((m) => { if (m.isSkinnedMesh && !m.userData.fur) { m.geometry.computeBoundingSphere(); m.boundingSphere = m.geometry.boundingSphere.clone(); m.boundingSphere.radius *= 2; } });
  o.traverse((m) => { if (m.userData.fur) { const b = m.parent.children.find((q) => q.isSkinnedMesh && !q.userData.fur); m.boundingSphere = b.boundingSphere.clone(); m.frustumCulled = true; } });
  if (!tinted) { o.traverse((m) => m.isMesh && m.material.color?.setHex(S.slothTint)); tinted = true; }
  const mixer = new THREE.AnimationMixer(o), act = mixer.clipAction(SLOTH.animations.find((a) => a.name === "cling"));
  act.play(); act.time = R(0, 4); act.timeScale = 0.6;
  const yl = dir.clone().setY(dir.y * 0.5).normalize(), zl = V(0, -1, 0).addScaledVector(yl, yl.y).normalize(), xl = V().crossVectors(yl, zl);
  const rot = new THREE.Matrix4().makeBasis(xl, yl, zl);
  o.quaternion.setFromRotationMatrix(rot); o.position.copy(p).sub(V(0, BR.z * sc / SL, -BR.y * sc / SL).applyMatrix4(rot)); scene.add(o);
  const box = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); box.position.copy(p).add(V(0, -0.25, 0)); scene.add(box);
  const s = { o, mixer, box, p, sc, head: o.getObjectByName("head"), squish: 0, nod: 0, friend: false, shells: o.userData.furShells || [], eyes: eyeKit(o), blink: R(1, 6), look: 0,
    arm: [o.getObjectByName("upper_armR") || o.getObjectByName("upper_arm.R"), o.getObjectByName("forearmR") || o.getObjectByName("forearm.R")], gaze: 0, waveCD: 0, wave: 0 };
  s.lit = []; o.traverse((m) => { if (m.isSkinnedMesh && !m.userData.fur && !s.lit.length) s.lit.push(m); });   // what lights up when a tap would boop it (camp/highlight.js)
  box.userData.s = s; sloths.push(s); hit.push(box);
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), va = V(), vb = V();
// a slow wave (Adriaen 2026-11-12): when you keep looking right at a sloth for about 3 s (it stays near the middle of your
// view, within 10 m) it looks back and slowly waves its right paw over its head, then waits a while before it waves again.
// Done on the bones after the clip, so it works whatever it is doing (hanging, sitting, driving), except asleep or on the move.
const GAZE_S = 3, WAVE_S = 4.6, camDir = V(), UPV = V(0, 1, 0);
const LIVELY = new Set(["home", "eat", "rest", "greet"]);
function aimBone(b, dir, w) {                          // turn bone b (it points along its own +Y) toward world dir, by w
  const bq = b.getWorldQuaternion(qa), y = vb.copy(UPV).applyQuaternion(bq);
  qb.setFromUnitVectors(y, dir).slerp(q1.identity(), 1 - w).multiply(bq);
  b.quaternion.copy(b.parent.getWorldQuaternion(q1).invert().multiply(qb));
}
const q1 = new THREE.Quaternion(), oq = new THREE.Quaternion(), wa = V(), wf = V();
function slothLife(s, dt) {                            // after the clip: fur by distance, blinks, a look at you when you're close, a wave
  s.head.getWorldPosition(va); const d = va.distanceTo(camera.position);
  const far = d > FUR_NEAR; if (s.shells[0] && s.shells[0].visible === far) s.shells.forEach((m) => (m.visible = !far));
  if (!s.asleep) {
    s.blink -= dt;
    if (s.blink < 0) { s.eyes(true); if (s.blink < -0.14) { s.eyes(false); s.blink = R(2.5, 7); } }
  }
  const T = s.trip, still = !s.asleep && (!T || LIVELY.has(T.phase));
  // the gaze: how long you have kept it near the middle of your view
  camera.getWorldDirection(camDir); const off = Math.sqrt(Math.max(0, d * d - (camDir.dot(wa.copy(va).sub(camera.position))) ** 2));
  s.gaze = still && d < 10 && camDir.dot(wa) > 0 && off < 0.5 + d * 0.04 ? s.gaze + dt : Math.max(0, s.gaze - dt * 1.5);
  s.waveCD -= dt;
  if (s.gaze > GAZE_S && s.waveCD <= 0 && !s.wave) { s.wave = 1e-3; s.waveCD = 15; s.gaze = 0; }
  if (s.wave) { s.wave += dt; if (s.wave > WAVE_S || !still) s.wave = 0; }
  const want = still && (d < LOOK_NEAR || s.wave) ? 1 : 0;
  s.look += (want - s.look) * Math.min(1, dt * 1.5);
  if (s.look >= 0.01) {
    const hq = s.head.getWorldQuaternion(qa), face = vb.copy(FACE).applyQuaternion(hq), to = camera.position.clone().sub(va).normalize();
    const turn = qb.setFromUnitVectors(face, to), ang = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
    const w = s.look * 0.75 * Math.min(1, 1.2 / Math.max(ang, 1e-3));   // at most about 70 degrees, three quarters of the way
    turn.slerp(qa.identity(), 1 - Math.min(1, w)).multiply(s.head.getWorldQuaternion(new THREE.Quaternion()));
    s.head.quaternion.copy(s.head.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn));
  }
  if (s.wave && s.arm[1]) {                            // upper arm up and out beside the head, the forearm swinging slowly side to side
    const k = s.wave, e = sstep(0, 0.9, k) * (1 - sstep(WAVE_S - 0.9, WAVE_S, k));
    s.o.getWorldQuaternion(oq);
    aimBone(s.arm[0], wa.set(0.55, 0.8, -0.25).normalize().applyQuaternion(oq), e);
    const sw = Math.sin((k - 0.9) * 2 * Math.PI * 0.55) * 0.5 * sstep(0.6, 1.2, k);
    aimBone(s.arm[1], wf.set(0.15 + sw, 1, -0.2).normalize().applyQuaternion(oq), e);
  }
}
const treeOf = (c) => HERO.reduce((a, b) => (b.distanceTo(c.points[0].clone().setY(0)) < a.distanceTo(c.points[0].clone().setY(0)) ? b : a)).clone().setY(0);
// Adriaen 2026-11-12 ("simplify the gameplay loop"): no befriending. One wild sloth still hangs in each big tree (on the low
// branch reaching furthest out, so the branches nearest the fire stay free for the camp's two branch sloths); the seven
// named sloths live in the camp from the start (below). The tripod sloth is gone (Adriaen: too close to the fire).
for (const tree of HERO) {
  const mine = branchCurves.filter((c) => c.low && treeOf(c).distanceTo(V(tree.x, 0, tree.z)) < 0.1).sort((a, b) => b.getPointAt(0.65).length() - a.getPointAt(0.65).length());
  for (const c of mine) {
    const t = R(0.5, 0.8), p = c.getPointAt(t), tan = c.getTangentAt(t);
    if (tan.x * p.x + tan.z * p.z > 0) tan.negate();   // head toward the middle of the clearing, so you meet its face
    if (sloths.every((s) => s.p.distanceTo(p) > 1.6)) { hang(p, tan); Object.assign(sloths.at(-1), { wild: true, perch: { curve: c, t, tree } }); break; }
  }
}
// ---------------------------------------------------------------- sloths living in the camp (thread "Bring sloths to life in camp")
// Adriaen 2026-11-12: the seven named sloths (cast.js) live in camp from the start, one in each spot: the hammock (naps on
// its back, eyes shut, zzz; the hammock sways gently all the time), the log seat right of the gap, the jeep's driver seat
// (plays at driving), the laundry line, the tent doorway and two low branches at the camp's edge. Each now and then leaves
// its spot, crawls to the snack table or the kitchen crate to eat, and goes back the way it came (daily life, below).
// Clips nap, reach, walk, hang_walk, drive, peek: characters/sloth_baby/sloth_rig.py.
// ?campsloths=0 turns them off; window.__campFast speeds them up for checks, window.__errand(name) sends one off now.
// ---------------------------------------------------------------- sloths living in the camp (thread "Bring sloths to life in camp")
// Adriaen 2026-11-11: the camp spots stay empty until a sloth is befriended. Then that same sloth (flower crown and all)
// lowers itself from its branch on a vine and crawls slowly over the ground to the next free spot, in this order:
// the hammock (climbs its post and the rope into it, naps on its back, eyes shut, zzz; the hammock sways gently all the time), then the log seat right of the
// gap (sits and slowly reaches for the kettle), then the jeep's driver seat (in through the open door, plays at driving),
// then the laundry line (climbs the end post, goes hand over hand along the line, brushing the towel aside, to the gap and hangs there). Clips nap, reach, walk, hang_walk: characters/sloth_baby/sloth_rig.py.
// Befriending belongs to the camp activities: it fires window event "sloth-befriended" with detail.id = index into sloths.
// ?campsloths=0 turns the spots off; window.__campFast speeds the trips up for checks.
let hammockSway = null, campStep = () => {};
const camp = [];   // the named camp sloths
if (qs.get("campsloths") !== "0") {
  const { hA, hB } = window.__camp, hm = hA.clone().add(hB).multiplyScalar(0.5), hd = hB.clone().sub(hA), hYaw = -Math.atan2(hd.z, hd.x);
  const clipOf = (n) => SLOTH.animations.find((a) => a.name === n);
  function shutEyes(o) {                              // asleep: the eyes (and their glints on the fur) take the dark patch colour round them
    const s = sloths.find((q) => q.o === o); if (!s) return;
    s.asleep = true; s.eyes(true);
  }

  // the hammock: the sling and its ropes swing about the line between the rope knots on the posts (1.75 m up);
  // the posts and the leaves on top stay put. The same swing turns the group the napper lies in.
  const PIV = 1.75, sway = { value: 0 };
  const hg = new THREE.Group(); hg.position.set(hm.x, PIV, hm.z); hg.rotation.y = hYaw; scene.add(hg);
  const swing = new THREE.Group(); hg.add(swing);
  const ham = scene.getObjectByName("Hammock");
  if (ham) {
    const mat = ham.material.clone();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uSway;").replace("#include <begin_vertex>", `#include <begin_vertex>
        float sw = uSway * (1.0 - smoothstep(1.03, 1.43, abs(transformed.x))) * (1.0 - smoothstep(1.8, 1.95, transformed.y));
        vec2 q = transformed.yz - vec2(${PIV.toFixed(2)}, 0.0); float cs = cos(sw), sn = sin(sw);
        transformed.yz = vec2(${PIV.toFixed(2)}, 0.0) + vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);`);
    };
    ham.material = mat;
  }
  hammockSway = { sway, swing, zz: null, push: 0 };
  const inward = V(-hd.z, 0, hd.x).normalize(); if (inward.dot(hm) > 0) inward.negate();   // from the hammock toward the fire
  // the log seat right of the gap, facing the fire and the kettle
  const sa = A0 + Math.PI - 1.15, at = V(Math.cos(sa) * 2.1, 0.33, Math.sin(sa) * 2.1).addScaledVector(V(-Math.sin(sa), 0, Math.cos(sa)), -0.12);
  const seat = new THREE.Group(); seat.position.copy(at); seat.rotation.y = Math.atan2(at.x, at.z); scene.add(seat);
  // each spot: where the sloth ends up (local to its group), the clip it plays there, its size there, and the door on the
  // ground it crawls to before climbing in
  const spots = [
    { name: "hammock", parent: swing, at: V(0.08, 0.72 - PIV, 0), yaw: -Math.PI / 2, clip: "nap", scale: 2.2, asleep: true,
      door: hA.clone().setY(0).addScaledVector(inward, 0.1 * 2.2), climb: true },   // the foot of the -x post, fire side: climbs it, then the rope
    { name: "seat", parent: seat, at: V(0, 0, 0), yaw: 0, clip: "reach", scale: 1.9, door: at.clone().setY(0).addScaledVector(at.clone().setY(0).normalize(), 0.8) },   // gets on from behind the log, away from the fire
  ];
  // the jeep (thread "jeep"): it waits outside the passenger door, which opens for it (window.__jeep), clambers onto the
  // sill and onto the passenger seat, and curls up asleep there facing forward. In the jeep's frame: +Z ahead, passenger
  // side +X, cushion top (0.36, 0.86, -0.18), sill (0.8, 0.56, -0.13).
  const J = window.__jeep;
  if (J?.node) {
    J.node.updateMatrixWorld(true);
    const sillL = J.node.worldToLocal(J.sill.clone()), seatL = J.node.worldToLocal(J.seat.clone());
    // left-hand drive since 2026-11-11: the wheel (empty WheelHub) is in front of this seat, so it sits up behind it and plays
    // at driving (clip drive). The clip's paws circle a rim 0.062 across, 0.11 up and 0.10 ahead of the sloth (x its scale),
    // so at scale 2.4 they hold the 0.16 rim of the jeep's wheel; it sits where that puts the hub, no lower than the cushion.
    const hubN = J.node.getObjectByName("WheelHub"), hub = hubN ? J.node.worldToLocal(hubN.getWorldPosition(V())) : V(0.36, 1.15, 0.05), dsc = 2.4;
    const drv = V(hub.x, Math.max(seatL.y, hub.y - 0.11 * dsc), hub.z - 0.10 * dsc);
    spots.push({ name: "jeep", parent: J.node, at: drv, yaw: Math.PI, clip: "drive", scale: dsc, car: true, ignore: 2.2,
      sill: sillL, door: J.node.localToWorld(sillL.clone().add(V(0.5, 0, 0))).setY(0) });
  }
  // the laundry line (thread "lived-in props", window.__laundry): it crawls round to the outer side of post a, climbs it
  // facing along the line, swings under the line and goes hand over hand along the sag to the gap at hang, then hangs there
  // as on its old branch (cling). The towel and socks swing aside round the line as it brushes past them (vertex shader).
  const LL = window.__laundry;
  if (LL) {
    const sc = 1.7;
    spots.push({ name: "line", parent: scene, clip: "cling", scale: sc, line: true, climb: true, ignore: 0.6,
      door: LL.a.clone().setY(0).addScaledVector(LL.dir, -0.1 * sc), climbYaw: Math.atan2(-LL.dir.x, -LL.dir.z), top: LL.a.y - 0.2 * sc,
      t: Math.max(0, Math.min(1, LL.hang.clone().sub(LL.a).dot(LL.dir) / LL.a.distanceTo(LL.b))) });
    const cloth = scene.getObjectByName("LaundryCloth");
    if (cloth?.material) {
      const L = LL.a.distanceTo(LL.b), u = { uX: { value: 0 }, uPush: { value: 0 }, uTime }, mat = cloth.material;   // uTime: the breeze (props thread)
      const prevHook = mat.onBeforeCompile;   // keeps the props thread's night light (lnight)
      mat.onBeforeCompile = (sh, r) => {
        prevHook?.call(mat, sh, r);
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uX, uPush, uTime;").replace("#include <begin_vertex>", `#include <begin_vertex>
          float lt = transformed.x / ${L.toFixed(3)} + 0.5, ly = ${LL.a.y.toFixed(3)} - ${LL.sag.toFixed(3)} * 4.0 * lt * (1.0 - lt);
          float sw = -1.1 * uPush * (1.0 - smoothstep(0.2, 0.45, abs(transformed.x - uX)));
          vec2 q = transformed.yz - vec2(ly, 0.0);
          // a gentle breeze: slow gusts roll along the line, and the cloth bends a little more toward its hem (props thread)
          float gust = 0.55 + 0.45 * sin(uTime * 0.37 + 1.3) * sin(uTime * 0.23);
          sw += gust * (0.16 * sin(uTime * 1.6 - transformed.x * 1.8) + 0.06 * sin(uTime * 3.7 - transformed.x * 5.0)) * (1.0 + 2.5 * max(0.0, -q.x));
          float cs = cos(sw), sn = sin(sw);
          transformed.yz = vec2(ly, 0.0) + vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);`);
      };
      mat.needsUpdate = true;
      LL.brush = (p, on, dt) => { u.uX.value = cloth.worldToLocal(p.clone()).x; u.uPush.value += ((on ? 1 : 0) - u.uPush.value) * Math.min(1, dt * 2); };
    }
  }
  // the tent (Adriaen 2026-11-12, "our camp" walk-in tent only): it crawls to the planks before the door, in, turns round
  // and lies on its belly in the doorway, chin on its paws, peeking out (clip peek). Tent frame: +Z out of the door,
  // doorway at z 0.95, floor 0.02 up.
  if (PROPS === "picked") {
    const tA = window.__camp.tentAt, tg = new THREE.Group(); tg.position.copy(tA).setY(0); tg.rotation.y = Math.atan2(-tA.x, -tA.z); scene.add(tg); tg.updateMatrixWorld(true);
    spots.push({ name: "tent", parent: tg, at: V(0, 0.04, 0.9), yaw: Math.PI, clip: "peek", scale: 1.9, noHop: true, ignore: 2.2,
      via: tg.localToWorld(V(0, 0, 1.7)).setY(0), door: tg.localToWorld(V(0, 0, 0.3)).setY(0) });
  }
  // two low branches right at the camp's edge (Adriaen 2026-11-12): the tips nearest the fire clear of the wild sloths.
  // Their sloths climb down the trunk and back up it (climbDown, climbUp below). Trunk radius after forest.js (1.05 at the
  // foot to 0.6 at 15 m, with the root flare).
  const trunkR0 = (y) => (1.05 - 0.03 * y) * (1.1 + 0.7 * Math.exp(-1.5 * y));
  // the bark's real distance from the tree's centre on one side, measured once per climb by casting rays at the tree's wood
  // every 20 cm up (the trunk wobbles and flares, so a formula leaves the sloth floating in front of it)
  const ray = new THREE.Raycaster();
  let woodMesh = null;
  function barkProfile(tree, out, yTop) {
    woodMesh ??= scene.children.filter((m) => m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh && !m.material.transparent && m.geometry.attributes.position.count > 2000);   // trunks, branches and other big solid meshes
    const ys = [], rs = [];
    for (let y = 0; y <= yTop + 0.4; y += 0.2) {   // (the first ray at 0.1 up, clear of the floor)
      let r = trunkR0(y);
      if (woodMesh) { ray.set(tree.clone().addScaledVector(out, 5).setY(Math.max(0.1, y)), out.clone().negate()); ray.far = 5; const h = ray.intersectObjects(woodMesh, false)[0]; if (h) r = 5 - h.distance; }
      ys.push(y); rs.push(r);
    }
    return (y) => { const k = Math.max(0, Math.min(ys.length - 1.001, y / 0.2)), i = Math.floor(k); return rs[i] + (rs[i + 1] - rs[i]) * (k - i); };
  }
  function branchBase(c, tree) {                      // the first point along the branch clear of the bark
    for (let t = 0; t <= 1; t += 0.02) { const p = c.getPointAt(t); if (Math.hypot(p.x - tree.x, p.z - tree.z) > trunkR0(p.y) + 0.25) return t; }
    return 0.3;
  }
  const tips = [];
  for (const c of branchCurves.filter((c) => c.low)) for (const t of [0.8, 0.9, 1]) { const p = c.getPointAt(t); if (Math.hypot(p.x, p.z) < RC + 0.3) tips.push({ p, tan: c.getTangentAt(t), c, t }); }
  tips.sort((a, b) => Math.hypot(a.p.x, a.p.z) - Math.hypot(b.p.x, b.p.z));
  for (const tip of tips) {
    if (spots.filter((q) => q.branch).length >= 2) break;
    if (sloths.some((s) => s.p.distanceTo(tip.p) < 1.2) || spots.some((q) => q.branch && q.top.distanceTo(tip.p) < 1.6)) continue;
    const tan = tip.tan.clone(); if (tan.x * tip.p.x + tan.z * tip.p.z > 0) tan.negate();   // head toward the fire, as the wild ones
    const tree = treeOf(tip.c), t0 = branchBase(tip.c, tree), out = tip.c.getPointAt(t0).sub(tree).setY(0).normalize();
    spots.push({ name: "branch", branch: true, top: tip.p.clone(), tan, curve: tip.c, t: tip.t, t0, tree, out, parent: scene, clip: "cling", scale: SL,
      door: tree.clone().addScaledVector(out, trunkR0(0) + 0.35), ignore: 2.2 });
  }
  const UP = V(0, 1, 0), q0 = new THREE.Quaternion(), tmp = V();
  // the hammock route, in the swing's frame (x along the span, the knots on the pivot line): up the -x post to its rope knot
  // (x -1.43, y 0), then hand over hand down the rope to the sling's end (x -1.03, y -0.40), hanging back-down under it
  // as on a branch (hang_walk), then onto the sling. hang_walk keeps its paws on a line 0.10 (x scale) over its belly,
  // spanning 0..0.20 toward its head, so the same clip climbs the post when the sloth is upright facing it.
  const KNOT = V(-1.43, 0, 0), ROPE_END = V(-1.03, -0.40, 0), ROPE = ROPE_END.clone().sub(KNOT), ROPE_L = ROPE.length(); ROPE.normalize();
  const climbYaw = Math.atan2(inward.x, inward.z), m4 = new THREE.Matrix4();
  function ropePose(s, u) {                           // the sloth hanging under the rope, its grip centre u metres down from the knot
    const yl = ROPE.clone().setY(ROPE.y * 0.5).normalize(), zl = V(0, -1, 0).addScaledVector(yl, yl.y).normalize(), xl = V().crossVectors(yl, zl);
    m4.makeBasis(xl, yl, zl);
    return { q: new THREE.Quaternion().setFromRotationMatrix(m4), p: KNOT.clone().addScaledVector(ROPE, u).sub(V(0, 0.1 * s.sc, -0.1 * s.sc).applyMatrix4(m4)) };
  }
  function linePose(s, t) {                           // hanging back-down under the laundry line at fraction t from a, its head toward b
    const L = LL.a.distanceTo(LL.b), y = (k) => LL.a.y - LL.sag * 4 * k * (1 - k);
    const at = LL.a.clone().addScaledVector(LL.dir, L * t).setY(y(t)), tan = LL.dir.clone().setY((y(t + 0.01) - y(t)) / (0.01 * L)).normalize();
    const yl = tan.clone().setY(tan.y * 0.5).normalize(), zl = V(0, -1, 0).addScaledVector(yl, yl.y).normalize(), xl = V().crossVectors(yl, zl);
    m4.makeBasis(xl, yl, zl);
    return { at, q: new THREE.Quaternion().setFromRotationMatrix(m4), p: at.clone().sub(V(0, 0.1 * s.sc, -0.1 * s.sc).applyMatrix4(m4)) };
  }
  function play(s, name, fade, timeScale = 1) {
    const next = s.mixer.clipAction(clipOf(name)); if (s.act === next) { next.timeScale = timeScale; return; }
    next.reset(); next.timeScale = timeScale; next.play();
    if (s.act) s.act.crossFadeTo(next, fade, false);
    s.act = next;
  }
  // poses for climbing: hanging back-down under a branch or pole at `at`, head toward `head` (as hang() places them), and
  // upright on a trunk at height y, facing the bark on the side `out` points to
  function underAt(s, at, head) {
    const yl = head.clone().setY(head.y * 0.5).normalize(), zl = V(0, -1, 0).addScaledVector(yl, yl.y).normalize(), xl = V().crossVectors(yl, zl);
    m4.makeBasis(xl, yl, zl);
    return { q: new THREE.Quaternion().setFromRotationMatrix(m4), p: at.clone().sub(V(0, 0.1 * s.sc, -0.1 * s.sc).applyMatrix4(m4)) };
  }
  const trunkAt = (s, tree, out, y, R) => ({ p: tree.clone().addScaledVector(out, R(Math.max(0, y)) + 0.07 * s.sc).setY(y), q: new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(out.x, out.z)) });
  const climbV = (s) => 0.015 * HW * s.sc;              // m/s, with hang_walk at HW so the paws keep pace
  // two generic moves: slide (a parameter u runs to `to` at `speed` per second, posed by pose(u)) and glide (ease from where
  // it is to a pose over dur seconds); each calls next() when done
  function slide(s, from, to, speed, pose, next) { s.trip.phase = "slide"; s.trip.sl = { u: from, to, speed, pose, next }; }
  function glide(s, to, dur, next) { const T = s.trip; T.phase = "glide"; T.t = 0; T.gl = { fp: s.o.position.clone(), fq: s.o.quaternion.clone(), to, dur, next }; }
  function toGround(s, at, yaw, then) {               // step off onto the ground at `at`, belly down, facing yaw
    play(s, "walk", 2, 1);
    glide(s, { p: at.clone().setY(0), q: new THREE.Quaternion().setFromAxisAngle(UP, yaw) }, 2.5, () => { s.trip.yaw = yaw; then(); });
  }
  // climbing (Adriaen 2026-11-12: "climb down the tree rather than a vine"): a branch sloth turns round on its branch, goes
  // hand over hand along it to the trunk, turns onto the trunk and climbs down it tail first, facing the bark, then steps
  // off onto the ground; climbUp is the same the other way. Trunk radius from barkProfile; speed is hang_walk's.
  function climbDown(s, then) {
    const { curve: c, t, t0, tree, out } = s.spot, L = c.getLength();
    const yTop = c.getPointAt(t0).y - 0.25 * s.sc, R = barkProfile(tree, out, yTop), back = (u) => underAt(s, c.getPointAt(u), c.getTangentAt(u).negate());
    play(s, "hang_walk", 1.2, HW);
    glide(s, back(t), 2.5, () => slide(s, t, t0, climbV(s) / L, back, () => {
      play(s, "hang_walk", 1.5, -HW);
      glide(s, trunkAt(s, tree, out, yTop, R), 3, () => slide(s, yTop, 0, climbV(s), (y) => trunkAt(s, tree, out, y, R),
        () => toGround(s, tree.clone().addScaledVector(out, R(0) + 0.45), Math.atan2(-out.x, -out.z), then)));
    }));
  }
  function climbUp(s, spot) {                          // up the trunk and out along the branch to its tip
    const { curve: c, t, t0, tree, out } = spot, L = c.getLength(), yTop = c.getPointAt(t0).y - 0.25 * s.sc, R = barkProfile(tree, out, yTop);
    play(s, "hang_walk", 1.5, HW);
    glide(s, trunkAt(s, tree, out, 0.02, R), 2.5, () => slide(s, 0.02, yTop, climbV(s), (y) => trunkAt(s, tree, out, y, R), () =>
      glide(s, underAt(s, c.getPointAt(t0), c.getTangentAt(t0)), 3, () => slide(s, t0, t, climbV(s) / L, (u) => underAt(s, c.getPointAt(u), c.getTangentAt(u)),
        () => { play(s, "cling", 3, 0.6); atHome(s); }))));
  }

  // ---------------------------------------------------------------- wayfinding (Adriaen 2026-11-12: "fix wayfinding so sloths
  // don't accidentally run into each other or other objects"). A 20 cm grid over the clearing marks every blocker (grown by
  // the sloth's half-length) and a wide ring round the fire; a trip plans an A* path on it and pulls it straight where the
  // way is clear. Starts and ends inside a blocker (a seat, the jeep's door) go straight out to the nearest free cell.
  // On the way, a sloth gives way to the others and to you: it keeps to the right of anyone ahead and slows when close.
  const GC = 0.2, GH = RC + 0.5, GN = Math.ceil(2 * GH / GC), BODY = 0.28, FIRE_KEEP = 2.3;   // a wide berth round the fire (Adriaen: too close is too dangerous)
  let grid = null, gridFor = -1;
  const cellOf = (p) => [Math.max(0, Math.min(GN - 1, Math.floor((p.x + GH) / GC))), Math.max(0, Math.min(GN - 1, Math.floor((p.z + GH) / GC)))];
  const cellAt = (i, j) => V(-GH + (i + 0.5) * GC, 0, -GH + (j + 0.5) * GC);
  function freeGrid() {                               // rebuilt when a blocker is added (the tent's walls, the activities' props)
    if (grid && gridFor === blockers.length) return grid;
    grid = new Uint8Array(GN * GN); gridFor = blockers.length;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const q = cellAt(i, j), r = Math.hypot(q.x, q.z); if (r > RC - 0.8 || r < FIRE_KEEP) grid[j * GN + i] = 1; }
    for (const [c, r] of blockers) {
      const RR = r + BODY, [i0, j0] = cellOf(V(c.x - RR, 0, c.z - RR)), [i1, j1] = cellOf(V(c.x + RR, 0, c.z + RR));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const q = cellAt(i, j); if (Math.hypot(q.x - c.x, q.z - c.z) < RR) grid[j * GN + i] = 1; }
    }
    return grid;
  }
  const isFree = (p) => { const [i, j] = cellOf(p); return !freeGrid()[j * GN + i]; };
  function nearestFree(i, j) {
    const g = freeGrid();
    for (let r = 1; r < 30; r++) {
      let best = null, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= GN || b >= GN || g[b * GN + a]) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [a, b]; }
      }
      if (best) return best;
    }
    return [i, j];
  }
  function astar(ai, aj, bi, bj) {
    const g = freeGrid(), n = GN * GN, cost = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const heap = [], push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - bi), dy = Math.abs(j - bj); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const a = aj * GN + ai, b = bj * GN + bi; cost[a] = 0; push(h(ai, aj), a);
    while (heap.length) {
      const [, k] = pop(); if (done[k]) continue; done[k] = 1; if (k === b) break;
      const i = k % GN, j = (k / GN) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= GN || y >= GN) continue;
        const q = y * GN + x; if (g[q] || done[q]) continue;
        if (di && dj && (g[j * GN + x] || g[y * GN + i])) continue;   // no cutting corners
        const c = cost[k] + (di && dj ? 1.414 : 1); if (c < cost[q]) { cost[q] = c; from[q] = k; push(c + h(x, y), q); }
      }
    }
    if (!done[b]) return null;
    const out = []; for (let k = b; k >= 0; k = from[k]) out.push(cellAt(k % GN, (k / GN) | 0)); return out.reverse();
  }
  function clearLine(p, q) { const d = p.distanceTo(q), n = Math.ceil(d / 0.08); for (let k = 1; k < n; k++) if (!isFree(tmp.lerpVectors(p, q, k / n))) return false; return true; }
  function findPath(from, to) {
    const g = freeGrid(); let [ai, aj] = cellOf(from), [bi, bj] = cellOf(to);
    if (g[aj * GN + ai]) [ai, aj] = nearestFree(ai, aj);
    if (g[bj * GN + bi]) [bi, bj] = nearestFree(bi, bj);
    const raw = astar(ai, aj, bi, bj); if (!raw) return [to.clone().setY(0)];
    const pts = [raw[0]];
    for (let k = 0; k < raw.length - 1;) { let m = raw.length - 1; while (m > k + 1 && !clearLine(raw[k], raw[m])) m--; pts.push(raw[m]); k = m; }
    pts.push(to.clone().setY(0)); return pts;
  }

  // ---------------------------------------------------------------- daily life (Adriaen 2026-11-12): every camp sloth now and
  // then leaves its spot (no more than MAX_OUT at once), crawls to the snack table or the kitchen crate, sits and eats its
  // favourite there, sometimes wanders off for a sit and a look round, then goes home the way it first came. Two that meet
  // stop, sit up, face each other and say hello. Crawling and climbing are 1.4x what they were (Adriaen: "sliiightly faster").
  const SPEED = 1.4, CRAWL = 0.027 * 2.2 * SPEED, WALK_TS = 2.2 * SPEED, HW = 3.75 * SPEED, HW_POST = 2.5 * SPEED, MAX_OUT = 3;
  const GROUND = new Set(["walk", "greet", "eat", "rest"]);
  const CRATE = V(4.55, 0, 1.7);                      // the kitchen crate (campProps.js), beside the snack table
  let POIS = null;
  function pois() {                                   // two or three places to sit round the table and the crate, on the camp side
    if (POIS) return POIS;
    POIS = [{ name: "table", c: window.__camp.tb, r: 0.75, n: 3 }, { name: "crate", c: CRATE, r: 0.35, n: 2 }].map((P) => {
      const cand = [];
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * 2 * Math.PI, p = P.c.clone().setY(0).add(V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(P.r + 0.34));
        if (Math.hypot(p.x, p.z) > RC - 1.5 || !isFree(p) || blockers.some(([c, r]) => Math.hypot(c.x - P.c.x, c.z - P.c.z) > 0.05 && Math.hypot(p.x - c.x, p.z - c.z) < r + 0.32)) continue;
        cand.push(p);
      }
      cand.sort((a, b) => a.length() - b.length());
      const slots = []; for (const p of cand) if (slots.length < P.n && slots.every((q) => q.p.distanceTo(p) > 0.8)) slots.push({ p, who: null });
      return { ...P, slots };
    });
    return POIS;
  }
  function wanderPoint() {
    for (let k = 0; k < 60; k++) { const a = R(0, 2 * Math.PI), r = R(2.6, RC - 2), p = V(Math.cos(a) * r, 0, Math.sin(a) * r); if (isFree(p) && camp.every((o) => o.o.position.distanceTo(p) > 1.2)) return p; }
    return V(3, 0, -2);
  }
  const yawOf = (o) => { const f = V(0, 0, -1).applyQuaternion(o.getWorldQuaternion(qWorld)); return Math.atan2(-f.x, -f.z); };
  const qWorld = new THREE.Quaternion();
  const turnTo = (T, want, k) => { let d = want - T.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; T.yaw += d * Math.min(1, k); return Math.abs(d); };
  function atHome(s, first) {
    s.trip.phase = "home"; s.spot.home = true;
    s.errand = first ? R(4, 45) : R(35, 80) * (s.spot.asleep || s.spot.car ? 1.6 : 1);
    if (s.spot.car && !first) setTimeout(() => window.__jeep?.close("P"), 1500);
  }
  function placeHome(s) {                             // straight into its spot, as if it had always lived there
    const spot = s.spot; s.sc = spot.scale; s.o.scale.setScalar(s.sc); s.act = s.mixer.existingAction(clipOf("cling"));
    s.trip = { phase: "home", t: 0, yaw: 0 };
    if (spot.branch || spot.line) {
      const P = spot.line ? linePose(s, spot.t) : underAt(s, spot.curve.getPointAt(spot.t), spot.curve.getTangentAt(spot.t));
      s.o.position.copy(P.p); s.o.quaternion.copy(P.q);
    } else {
      spot.parent.add(s.o); s.o.position.copy(spot.at); s.o.quaternion.setFromAxisAngle(UP, spot.yaw);
      play(s, spot.clip, 0.01); if (spot.asleep) shutEyes(s.o);
    }
    atHome(s, true);
  }
  // leaving home: back out of its spot the way it came in, onto the ground, then off on its errand
  const postPose = (spot, y) => ({ p: spot.door.clone().setY(y), q: new THREE.Quaternion().setFromAxisAngle(UP, spot.climbYaw ?? climbYaw) });
  function downPost(s, spot, top, then) {             // from the top of a post, tail first down to the ground
    play(s, "hang_walk", 1.5, -HW_POST);
    glide(s, postPose(spot, top), 3, () => slide(s, top, 0, 0.015 * HW_POST * s.sc, (y) => postPose(spot, y),
      () => { const yaw = (spot.climbYaw ?? climbYaw) + Math.PI; toGround(s, spot.door.clone().add(V(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(0.3)), yaw, then); }));
  }
  function leave(s) {
    const spot = s.spot, J = window.__jeep; spot.home = false; s.trip = { phase: "glide", t: 0, yaw: 0 };
    if (s.asleep) { s.asleep = false; s.eyes(false); }
    const go = () => errand(s);
    if (spot.branch) return climbDown(s, go);
    if (spot.line) {                                  // hand over hand back along the line to post a, then down it
      const L = LL.a.distanceTo(LL.b);
      play(s, "hang_walk", 1.2, -HW_POST);
      return slide(s, spot.t, 0.05, 0.015 * HW_POST * s.sc / L, (u) => { const P = linePose(s, u); LL.brush?.(P.at, true, 1 / 60); return P; }, () => downPost(s, spot, spot.top, go));
    }
    if (spot.climb) {                                 // the hammock: out of the sling, up the rope to the knot, down the post
      play(s, "hang_walk", 2, -HW_POST);
      return glide(s, ropePose(s, ROPE_L - 0.05), 3, () => slide(s, ROPE_L - 0.05, 0.1, 0.015 * HW_POST * s.sc, (u) => ropePose(s, u), () => { scene.attach(s.o); downPost(s, spot, PIV - 0.2 * s.sc, go); }));
    }
    if (spot.car) { s.trip.phase = "exit"; J.open("P"); return; }   // waits for the door, then climbs out (see "exit")
    const away = spot.via ? Math.atan2(-(spot.via.x - spot.door.x), -(spot.via.z - spot.door.z)) : Math.atan2(-(spot.door.x - s.o.getWorldPosition(tmp).x), -(spot.door.z - tmp.z));
    scene.attach(s.o); play(s, "walk", 1.5, WALK_TS);
    glide(s, { p: spot.door.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, away) }, 2.5, () => {
      s.trip.yaw = away;
      if (!spot.via) return go();
      glide(s, { p: spot.via.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, away) }, spot.door.distanceTo(spot.via) / (CRAWL * s.sc), () => { s.trip.yaw = away; go(); });
    });
  }
  function walkTo(s, goal, arrive) {
    const T = s.trip; Object.assign(T, { phase: "walk", t: 0, path: findPath(s.o.position, goal), arrive, yaw: yawOf(s.o) });
    play(s, "walk", 1.5, WALK_TS);
  }
  function errand(s) {                                // the table or the crate, whichever has a free place (or a wander)
    const free = pois().flatMap((P) => P.slots.filter((q) => !q.who).map((q) => [P, q]));
    if (!free.length) return wander(s);
    const [P, slot] = free[Math.floor(R(0, free.length))]; slot.who = s;
    walkTo(s, slot.p, () => { Object.assign(s.trip, { phase: "eat", t: 0, poi: P, slot, got: false, nom: false }); play(s, "reach", 1.2); });
  }
  function wander(s) { walkTo(s, wanderPoint(), () => { Object.assign(s.trip, { phase: "rest", t: 0, dur: R(5, 9) }); play(s, "idle", 1.2); }); }
  function goHome(s) {
    const spot = s.spot;
    walkTo(s, spot.via ?? spot.door, () => {
      if (!spot.via) return arriveDoor(s);
      const T = s.trip, yaw = Math.atan2(-(spot.door.x - spot.via.x), -(spot.door.z - spot.via.z)); T.yaw = yaw;
      glide(s, { p: spot.door.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, yaw) }, spot.door.distanceTo(spot.via) / (CRAWL * s.sc), () => { s.trip.yaw = yaw; arriveDoor(s); });
    });
  }
  function settleIn(s, fade) {
    const T = s.trip, spot = s.spot; T.phase = "settle"; T.t = 0; spot.parent.attach(s.o);
    T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); T.sc0 = s.sc;
    play(s, spot.clip, fade); if (spot.asleep) shutEyes(s.o);
  }
  function arriveDoor(s) {                            // at its spot's door: in the way each spot is reached
    const spot = s.spot, T = s.trip; s.o.position.copy(spot.door);
    if (spot.branch) return climbUp(s, spot);
    if (spot.climb) { T.phase = "climb"; T.t = 0; return; }
    if (spot.car) { T.phase = "door"; T.t = 0; window.__jeep.open("P"); return; }
    settleIn(s, 2.5);
  }
  // on the ground: follow the path, keep right of anyone ahead (a sloth or you), slow when close, and greet a sloth it meets
  function walkStep(s, T, sd) {
    const pos = s.o.position;
    while (T.path.length > 1 && Math.hypot(pos.x - T.path[0].x, pos.z - T.path[0].z) < 0.3) T.path.shift();
    const aim = T.path[0], dir = V(aim.x - pos.x, 0, aim.z - pos.z), dist = dir.length(); dir.divideScalar(Math.max(dist, 1e-4));
    let slow = 1;
    const others = camp.filter((o) => o !== s && GROUND.has(o.trip.phase)).map((o) => [o.o.position, 0.18 * (s.sc + o.sc) + 0.1, o]);
    others.push([camera.position, 0.45, null]);
    for (const [p, near, o] of others) {
      const dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz);
      if (d > near + 0.6) continue;
      if (o && d < 0.95 && s.greetCD <= 0 && o.greetCD <= 0) { greet(s, o); return; }
      const ahead = (dx * dir.x + dz * dir.z) / Math.max(d, 1e-4); if (ahead <= 0) continue;
      const w = Math.min(1.5, (near + 0.6 - d) / 0.6) * ahead * 1.4; const rx = -dir.z, rz = dir.x; dir.x += rx * w; dir.z += rz * w; dir.normalize();   // to the right
      if (d < near) slow = Math.min(slow, 0.25);
    }
    const off = turnTo(T, Math.atan2(-dir.x, -dir.z), sd * 2.5); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
    const v = CRAWL * s.sc * sd * slow * (off > 1 ? 0.3 : 1);
    pos.addScaledVector(V(-Math.sin(T.yaw), 0, -Math.cos(T.yaw)), v); pos.y = 0;
    if (T.path.length === 1 && dist < 0.1 + v) { pos.x = aim.x; pos.z = aim.z; T.arrive(); }
  }
  const SNACKS = ["🍌", "🥭", "🌺", "🍇", "🍎"];   // a random snack each time, so a favourite stays something to find out (activities plan)
  const HELLO = ["👋", "💗", "hi!", "*slow wave*"];
  function greet(s, o) {
    for (const [a, b, lead] of [[s, o, true], [o, s, false]]) {
      a.greetCD = R(25, 40);
      if (a.trip.phase !== "walk") { a.nod = 1.4; continue; }   // one at the table just nods back
      Object.assign(a.trip, { phase: "greet", t: 0, with: b, lead, said: false }); play(a, "idle", 0.8);
    }
  }

  // the bench sloth's s'mores: now and then, as its reach comes round, it holds a long stick out over the fire (the tip
  // stays well clear of the flames), keeps it there while the marshmallow toasts golden, then draws it back and eats it.
  // A stick (8 triangles) and a marshmallow (12), page-lit, one draw each, shown only while it toasts.
  const smoreStick = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, 1, 4, 1, true).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x7a5634 }));
  const mallow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.06), new THREE.MeshLambertMaterial({ color: 0xfff7ec, emissive: 0x000000 }));
  smoreStick.visible = mallow.visible = false; scene.add(smoreStick, mallow);
  const RAW = new THREE.Color(0xfff7ec), TOAST = new THREE.Color(0xd9984a), FIRE_AT = V(0, 0.8, 0), paw = V(), elbow = V(), shoulder = V();
  function smoreStep(s, dt) {
    const act = s.act; if (!act || act.getClip().name !== "reach") return;
    if (!s.smore) { s.smoreT -= dt; if (s.smoreT < 0 && act.time < 0.3) s.smore = { hold: 0 }; else return; }
    const S = s.smore;
    if (act.time >= 3.9 && S.hold < 9) { act.timeScale = 0; S.hold += dt; S.held = true; } else act.timeScale = 1;
    // the paw: the end of the right forearm (it bends 55 % of the way down the arm, so the forearm is 45/55 of the upper arm)
    s.arm[0].getWorldPosition(shoulder); s.arm[1].getWorldPosition(elbow);
    paw.copy(V(0, 1, 0).applyQuaternion(s.arm[1].getWorldQuaternion(qWorld))).multiplyScalar(shoulder.distanceTo(elbow) * 0.82).add(elbow);
    const to = FIRE_AT.clone().sub(paw), L = Math.max(0.3, Math.min(1.15, to.length() - 0.7));
    smoreStick.position.copy(paw); smoreStick.quaternion.setFromUnitVectors(UP, to.normalize()); smoreStick.scale.set(1, L, 1);
    mallow.position.copy(paw).addScaledVector(to, L - 0.03); mallow.quaternion.copy(smoreStick.quaternion);
    mallow.material.color.lerpColors(RAW, TOAST, Math.min(1, S.hold / 9));
    smoreStick.visible = mallow.visible = true;
    if (S.held && S.hold >= 9 && act.time < 1.5) {    // drawn back in: eaten
      smoreStick.visible = mallow.visible = false; s.smore = null; s.smoreT = R(25, 45); s.nod = 1.6;
      burst(s.p.clone().add(V(0, 0.35, 0)), "s'more! 😋", 1, 1.8, 60);
    }
  }
  function stopSmore(s) { if (!s.smore) return; s.smore = null; s.smoreT = R(20, 40); smoreStick.visible = mallow.visible = false; if (s.act) s.act.timeScale = 1; }

  // the seven named sloths (cast.js), each in its own spot: Hibi naps in the hammock, Sunny sits on the bench and toasts
  // s'mores, Mango drives the jeep, Pip (the smallest) hangs on the laundry line, Hazel peeks out of the tent, and Figgy and
  // Bandit hang from the two low branches at the edge of camp
  const WHO = { hammock: ["Hibi"], seat: ["Sunny"], jeep: ["Mango"], line: ["Pip"], tent: ["Hazel"], branch: ["Figgy", "Bandit"] };
  for (const spot of spots) {
    const nm = WHO[spot.name]?.shift(), c = CAST.find((k) => k.name === nm); if (!c) continue;
    if (c.scale) spot.scale *= c.scale;
    hang(V(0, 0, 0), V(1, 0, 0), spot.scale);
    const s = sloths.at(-1); c.dress?.(s.head, s.o);
    Object.assign(s, { name: c.name, fav: c.fav.split(" ")[0], spot, greetCD: R(0, 10), smoreT: R(8, 20), gaze: 0, waveCD: 0 });
    spot.who = s; camp.push(s); placeHome(s);
  }
  { let tris = 0; for (const s of camp) s.o.traverse((m) => { if (m.isMesh && !m.isSkinnedMesh && m.geometry) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    console.info(`camp sloths: ${camp.length} named (${camp.map((s) => s.name).join(", ")}), traits ${tris} triangles in all; s'mores stick 8 + marshmallow 12`); }

  campStep = (dt) => {
    const fast = window.__campFast || 1, sd = dt * fast, J = window.__jeep;
    let out = camp.filter((s) => s.trip.phase !== "home").length;
    for (const s of camp) {
      const spot = s.spot, T = s.trip;
      if (fast !== 1) s.mixer.update(sd - dt);   // the clip at the same pace (slow motion and pause in the move lab too)
      T.t += sd; s.greetCD -= sd;
      if (T.phase === "home") {
        if (spot.name === "seat") smoreStep(s, sd);
        s.errand -= sd;
        if (s.errand < 0 && !s.smore && !s.wave) { if (out < MAX_OUT) { leave(s); out++; } else s.errand = R(6, 15); }
      } else if (T.phase === "walk") walkStep(s, T, sd);
      else if (T.phase === "greet") {                // sit up, face each other, say hello, carry on
        const o = T.with.o.position, pos = s.o.position;
        turnTo(T, Math.atan2(-(o.x - pos.x), -(o.z - pos.z)), sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
        if (!T.said && T.t > 0.9) { T.said = true; s.nod = 1.2; s.squish = 0.5; if (T.lead) burst(pos.clone().lerp(o, 0.5).setY(0.75), HELLO[Math.floor(R(0, HELLO.length))], 1, 1.8, 64); }
        if (T.t > 3.4) { T.phase = "walk"; play(s, "walk", 1, WALK_TS); }
      } else if (T.phase === "eat") {                // sits by the table or the crate and slowly reaches for its favourite
        const c = T.poi.c, pos = s.o.position; turnTo(T, Math.atan2(-(c.x - pos.x), -(c.z - pos.z)), sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
        if (!T.got && T.t > 3.8) { T.got = true; burst(s.p.clone().add(V(0, 0.3, 0)), SNACKS[Math.floor(R(0, SNACKS.length))], 1, 1.6, 90); }
        if (!T.nom && T.t > 6.2) { T.nom = true; s.nod = 1.2; burst(s.p.clone().add(V(0, 0.4, 0)), "nom nom", 1, 1.4, 60); }
        if (T.t > 8.2) { T.slot.who = null; R(0, 1) < 0.35 ? wander(s) : goHome(s); }
      } else if (T.phase === "rest") {               // a sit and a look round somewhere in the clearing
        if (T.t > T.dur) goHome(s);
      } else if (T.phase === "exit") {               // out of the jeep: waits for the door, onto the sill, down to the ground
        if (!J.isOpen("P")) J.open("P");
        else if (T.t > 1) {
          T.phase = "glide"; play(s, "hang_walk", 1, 2);
          glide(s, { p: spot.sill.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI / 2) }, 3.5, () => {
            scene.attach(s.o); const yaw = yawOf(s.o);
            glide(s, { p: spot.door.clone(), q: new THREE.Quaternion().setFromAxisAngle(UP, yaw) }, 2.5, () => { J.close("P"); s.trip.yaw = yaw; errand(s); });
          });
        }
      } else if (T.phase === "door") {               // waits, facing the door, until it has swung open
        const sill = spot.parent.localToWorld(spot.sill.clone());
        turnTo(T, Math.atan2(-(sill.x - s.o.position.x), -(sill.z - s.o.position.z)), sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
        if (!J.isOpen("P")) J.open("P");
        else if (T.t > 2) { T.phase = "clamber"; T.t = 0; T.from = s.o.position.clone(); T.to = sill; play(s, "hang_walk", 1, 2); }
      } else if (T.phase === "clamber") {            // about 4 s: hauls itself up onto the door sill
        const k = Math.min(1, T.t / 4), e = k * k * (3 - 2 * k);
        s.o.position.lerpVectors(T.from, T.to, e); s.o.position.y += Math.sin(Math.PI * k) * 0.1;
        s.o.quaternion.setFromAxisAngle(UP, T.yaw).multiply(q0.setFromAxisAngle(V(1, 0, 0), -0.5 * Math.sin(Math.PI * k)));
        if (k >= 1) settleIn(s, 3);
      } else if (T.phase === "slide") {              // see slide(): along a branch, a trunk, a post, a rope or the line
        const L = T.sl, step = L.speed * sd; L.u = Math.abs(L.to - L.u) <= step ? L.to : L.u + Math.sign(L.to - L.u) * step;
        const P = L.pose(L.u); s.o.position.copy(P.p); s.o.quaternion.copy(P.q);
        if (L.u === L.to) L.next();
      } else if (T.phase === "glide") {              // see glide()
        const G = T.gl, k = Math.min(1, T.t / G.dur), e = k * k * (3 - 2 * k);
        s.o.position.lerpVectors(G.fp, G.to.p, e); s.o.quaternion.slerpQuaternions(G.fq, G.to.q, e);
        if (k >= 1) G.next();
      } else if (T.phase === "climb") {              // up the post hand over hand until its arms reach the rope knot (or the line)
        if (T.t < sd + 1e-6) play(s, "hang_walk", 1.2, HW_POST);
        turnTo(T, spot.climbYaw ?? climbYaw, sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
        const top = spot.top ?? PIV - 0.2 * s.sc;
        s.o.position.y = Math.min(top, s.o.position.y + 0.015 * HW_POST * s.sc * sd * Math.min(1, T.t / 1.5));
        if (s.o.position.y >= top) { T.phase = "turn"; T.t = 0; spot.parent.attach(s.o); T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); }
      } else if (T.phase === "turn") {               // about 3 s: swings round from the post to hang under the rope (or the line)
        const k = Math.min(1, T.t / 3), e = k * k * (3 - 2 * k), R0 = spot.line ? linePose(s, 0.05) : ropePose(s, 0.1);
        s.o.position.lerpVectors(T.from, R0.p, e); s.o.quaternion.slerpQuaternions(T.q, R0.q, e);
        if (k >= 1) { T.phase = spot.line ? "line" : "rope"; T.t = 0; T.u = spot.line ? 0.05 : 0.1; }
      } else if (T.phase === "line") {               // hand over hand along the line to the gap
        T.u = Math.min(spot.t, T.u + 0.015 * HW_POST * s.sc * sd / LL.a.distanceTo(LL.b)); const P = linePose(s, T.u);
        s.o.position.copy(P.p); s.o.quaternion.copy(P.q); LL.brush?.(P.at, true, sd);
        if (T.u >= spot.t) { play(s, "cling", 3, 0.6); atHome(s); }
      } else if (T.phase === "rope") {               // down the rope to the sling's end
        T.u = Math.min(ROPE_L - 0.05, T.u + 0.015 * HW_POST * s.sc * sd); const R1 = ropePose(s, T.u);
        s.o.position.copy(R1.p); s.o.quaternion.copy(R1.q);
        if (T.u >= ROPE_L - 0.05) settleIn(s, 3);
      } else if (T.phase === "settle") {             // about 4 s: climbs up into its spot and settles
        const k = Math.min(1, T.t / (spot.climb ? 6 : 4)), e = k * k * (3 - 2 * k);
        s.o.position.lerpVectors(T.from, spot.at, e); if (!spot.climb && !spot.noHop) s.o.position.y += Math.sin(Math.PI * e) * 0.12;
        s.o.quaternion.slerpQuaternions(T.q, q0.setFromAxisAngle(UP, spot.yaw), e);
        s.sc = T.sc0 + (spot.scale - T.sc0) * e; s.o.scale.setScalar(s.sc);
        if (k >= 1) atHome(s);
      }
      if (T.phase !== "home" && s.smore) stopSmore(s);
      if (spot.line && T.phase === "home") LL.brush?.(s.o.position, false, dt);   // the towel swings back
      // the hit sphere and the point hearts and words fly to follow the sloth
      s.o.getWorldPosition(s.box.position).y += 0.25 * s.sc / SL; s.p.copy(s.box.position);
    }
    const H = hammockSway, T = uTime.value, napper = spots[0].home ? spots[0].who : null;   // a slow swing, nudged harder for a while after a boop
    window.__labStep?.(dt);
    H.push = Math.max(0, H.push - dt * 0.25);
    H.sway.value = (0.055 + 0.1 * H.push) * Math.sin(T * 2 * Math.PI / 5.2); H.swing.rotation.x = H.sway.value;
    if (napper?.squish > 0.9) H.push = 1;
    H.zz ??= [0, 1, 2].map(() => { const z = sprite("z", 110); z.material.depthTest = true; scene.add(z); return z; });
    H.zz.forEach((z, i) => { const k = (T / 2.4 + i / 3) % 1; if (napper) napper.head.getWorldPosition(z.position).add(V(0.1 * Math.sin(k * 6), 0.25 + 0.6 * k, 0));
      z.material.opacity = napper?.asleep ? Math.sin(Math.PI * k) * (napper.squish > 0 ? 0 : 0.85) : 0; z.scale.set(0.3 + 0.35 * k, (0.3 + 0.35 * k) / 4, 1); });
  };
  window.__spots = spots; window.__sloth = (i) => sloths[i]; window.__camp.sloths = camp;
  window.__errand = (name) => { const s = camp.find((q) => q.name === name); if (s && s.trip.phase === "home") leave(s); return s; };
  window.__path = findPath;
  // the move lab (camp.html?lab, camp/lab.js): drives these to show each move on its own
  window.__lab = { camp, GROUND, leave, goHome, wander, clipOf, smore: (s) => { s.smoreT = 0; }, wave: (s) => { s.wave = 1e-3; s.waveCD = 15; } };
}
if (qs.has("lab")) import("./lab.js");
const COUNT = sloths.length;

// sprites: words, hearts, flowers
const sprite = (txt, size = 96) => {
  const t = canvasTex(512, 128, (g) => { g.font = `600 ${size}px Fredoka, Trebuchet MS, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.strokeStyle = "rgba(74,52,38,.55)"; g.lineWidth = 10; g.strokeText(txt, 256, 68); g.fillText(txt, 256, 68); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.0, 0.25, 1); return s;
};
const fx = [];
function burst(p, txt, n, life, size) { for (let i = 0; i < n; i++) { const s = sprite(txt, size); s.scale.multiplyScalar(n > 1 ? 0.45 : 0.6); s.position.copy(p); scene.add(s); fx.push({ s, v: V(R(-0.4, 0.4) * (n > 1), R(0.25, 0.55), R(-0.4, 0.4) * (n > 1)), t: 0, life }); } }
function flowerCrown(s) {
  const c = new THREE.Group(), cols = [0xff7fa8, 0xffd66e, 0xffffff];
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.016, 0), new THREE.MeshLambertMaterial({ color: cols[k % 3], emissive: 0x331100 })); f.position.set(Math.cos(a) * 0.058, 0, Math.sin(a) * 0.052); c.add(f); }
  c.position.set(0, 0.105, 0); c.rotation.x = -0.25; s.head.add(c);
}


export { COUNT, SL, SLOTH_WARM, burst, campStep, flowerCrown, fx, hit, slothLife, sloths, sprite };
