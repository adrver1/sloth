// Canopy Camp sloths: the sloths hanging in the trees (fur, blinks, looks), and the sloths that live in camp once fed.
import { WARM_N, furify } from "../fur.js";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import "./jeep.js";   // run after the module before it, as one script did
import { D, PROPS, R, S, camera, canvasTex, qs, scene, sstep, uTime } from "./core.js";
import { A0, GLADE, GLADE_R, RC, V, branchCurves, d0, sloPath, t0 } from "./forest.js";
import { SLOTH, blockers } from "./campProps.js";

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
  const s = { o, mixer, box, p, sc, head: o.getObjectByName("head"), squish: 0, nod: 0, friend: false, shells: o.userData.furShells || [], eyes: eyeKit(o), blink: R(1, 6), look: 0 };
  box.userData.s = s; sloths.push(s); hit.push(box);
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), va = V(), vb = V();
function slothLife(s, dt) {                            // after the clip: fur by distance, blinks, and a look at you when you're close
  s.head.getWorldPosition(va); const d = va.distanceTo(camera.position);
  const far = d > FUR_NEAR; if (s.shells[0] && s.shells[0].visible === far) s.shells.forEach((m) => (m.visible = !far));
  if (!s.asleep) {
    s.blink -= dt;
    if (s.blink < 0) { s.eyes(true); if (s.blink < -0.14) { s.eyes(false); s.blink = R(2.5, 7); } }
  }
  const T = s.trip, want = !s.asleep && d < LOOK_NEAR && (!T || T.phase === "home") ? 1 : 0;
  s.look += (want - s.look) * Math.min(1, dt * 1.5);
  if (s.look < 0.01) return;
  const hq = s.head.getWorldQuaternion(qa), face = vb.copy(FACE).applyQuaternion(hq), to = camera.position.clone().sub(va).normalize();
  const turn = qb.setFromUnitVectors(face, to), ang = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
  const w = s.look * 0.75 * Math.min(1, 1.2 / Math.max(ang, 1e-3));   // at most about 70 degrees, three quarters of the way
  turn.slerp(qa.identity(), 1 - Math.min(1, w)).multiply(s.head.getWorldQuaternion(new THREE.Quaternion()));
  s.head.quaternion.copy(s.head.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn));
}
for (const c of branchCurves.filter((c) => c.low)) {
  const t = R(0.5, 0.8), p = c.getPointAt(t), tan = c.getTangentAt(t);
  if (tan.x * p.x + tan.z * p.z > 0) tan.negate();   // head toward the middle of the clearing, so you meet its face
  if (sloths.every((s) => s.p.distanceTo(p) > 1.6)) hang(p, tan);
  if (sloths.length >= (window.__camp.string ? 6 : 7)) break;
}
// review 2026-11-12 (B4): one sloth where you start, hanging from the lantern string between two lanterns, about 3 m
// away and in the middle of the view, so the first thing you see is a sloth (it can be befriended like the others)
if (window.__camp.string && qs.get("campsloths") !== "0") {
  const st = window.__camp.string, eye = { pos: d0.clone().multiplyScalar(-4.4).addScaledVector(t0, -0.6), yaw: Math.atan2(-d0.x, -d0.z) }, fwd = V(-Math.sin(eye.yaw), 0, -Math.cos(eye.yaw));
  let best = 0, bs = -2;
  for (let i = 1; i < st.length - 1; i++) { const q = st[i].clone().sub(eye.pos).setY(0), d = q.length(), c = q.dot(fwd) / d - Math.abs(d - 3.8) * 0.15; if (c > bs) { bs = c; best = i; } }
  const n = st.length - 1, t = (Math.min(8, Math.max(0, Math.floor(best / n * 9))) + 0.5) / 9, k = t * n, i0 = Math.floor(k);   // halfway between two lanterns
  const p = st[i0].clone().lerp(st[Math.min(n, i0 + 1)], k - i0).setY(st[i0].y + (st[Math.min(n, i0 + 1)].y - st[i0].y) * (k - i0) - 0.02);
  const tan = st[Math.min(n, i0 + 1)].clone().sub(st[Math.max(0, i0 - 1)]).normalize(); if (tan.dot(fwd.clone().cross(V(0, 1, 0))) > 0) tan.negate();   // side on, head to your left
  hang(p, tan, 1.9);
}
// ---------------------------------------------------------------- sloths living in the camp (thread "Bring sloths to life in camp")
// Adriaen 2026-11-11: the camp spots stay empty until a sloth is befriended. Then that same sloth (flower crown and all)
// lowers itself from its branch on a vine and crawls slowly over the ground to the next free spot, in this order:
// the hammock (climbs its post and the rope into it, naps on its back, eyes shut, zzz; the hammock sways gently all the time), then the log seat right of the
// gap (sits and slowly reaches for the kettle), then the jeep's driver seat (in through the open door, plays at driving),
// then the laundry line (climbs the end post, goes hand over hand along the line, brushing the towel aside, to the gap and hangs there). Clips nap, reach, walk, hang_walk: characters/sloth_baby/sloth_rig.py.
// Befriending belongs to the camp activities: it fires window event "sloth-befriended" with detail.id = index into sloths.
// ?campsloths=0 turns the spots off; window.__campFast speeds the trips up for checks.
let hammockSway = null, campStep = () => {};
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
    { name: "seat", parent: seat, at: V(0, 0, 0), yaw: 0, clip: "reach", scale: 1.9, door: at.clone().setY(0).addScaledVector(at.clone().setY(0).normalize(), -0.6) },
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
  // two low branches right at the camp's edge (Adriaen 2026-11-12, friends 6 and 7): the tips nearest the fire that are
  // clear of the wild sloths' spots. It crawls under one and hauls itself back up on a vine (the way it came down), then
  // hangs there as on its old branch.
  const tips = [];
  for (const c of branchCurves.filter((c) => c.low)) for (const t of [0.8, 0.9, 1]) { const p = c.getPointAt(t); if (Math.hypot(p.x, p.z) < RC + 0.3) tips.push({ p, tan: c.getTangentAt(t) }); }
  tips.sort((a, b) => Math.hypot(a.p.x, a.p.z) - Math.hypot(b.p.x, b.p.z));
  for (const tip of tips) {
    if (spots.filter((q) => q.branch).length >= 2) break;
    if (sloths.some((s) => s.p.distanceTo(tip.p) < 1.2) || spots.some((q) => q.branch && q.top.distanceTo(tip.p) < 1.6)) continue;
    const tan = tip.tan.clone(); if (tan.x * tip.p.x + tan.z * tip.p.z > 0) tan.negate();   // head toward the fire, as the wild ones
    const g = tip.p.clone().setY(0); if (g.length() > RC - 1) g.setLength(RC - 1);
    spots.push({ name: "branch", branch: true, top: tip.p.clone(), tan, parent: scene, clip: "cling", scale: SL, door: g, ignore: 0.6 });
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
    const next = s.mixer.clipAction(clipOf(name)); if (s.act === next) return;
    next.reset(); next.timeScale = timeScale; next.play();
    if (s.act) s.act.crossFadeTo(next, fade, false);
    s.act = next;
  }
  addEventListener("sloth-befriended", (e) => {
    const s = sloths[e.detail?.id], spot = spots.find((p) => !p.who);   // hammock, log seat, jeep, line, tent, then the two edge branches
    if (!s || s.trip || !spot) return;
    spot.who = s; s.sc ??= SL;
    s.act = s.mixer.existingAction(clipOf("cling"));
    // down: lower itself on a vine to the ground right under its branch (kept inside the clearing)
    const g = s.o.position.clone().setY(0), inGlade = g.distanceTo(GLADE) < GLADE_R + 0.5;
    if (!inGlade && g.length() > RC - 1) g.setLength(RC - 1);
    const route = inGlade ? sloPath.pts.slice().reverse().filter((q) => Math.hypot(q.x, q.z) > RC - 2.5).filter((_, i) => i % 3 === 0) : [];   // from the glade: back along the path
    const vine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([s.p, s.p]), new THREE.LineBasicMaterial({ color: 0x4f6b2a }));
    scene.add(vine);
    s.trip = { spot, phase: "down", t: 0, from: s.o.position.clone(), q: s.o.quaternion.clone(), to: g, top: s.p.clone(), vine, sc0: s.sc, route };
    play(s, "hang_walk", 1.2, 1.4);
  });
  // steer round the fire, tent, posts, seats, table and trees (the blockers you walk round), sliding along them
  function steer(pos, door, ignore = 1.3) {
    const want = door.clone().sub(pos).setY(0), d = want.length(); want.divideScalar(Math.max(d, 1e-4));
    const out = want.clone();
    for (const [c, r] of blockers) {
      if (c.distanceTo(door) < ignore) continue;                          // what it is crawling up to
      tmp.set(pos.x - c.x, 0, pos.z - c.z); const k = tmp.length(), reach = r + 0.55;
      if (k > reach || k < 1e-4) continue;
      tmp.divideScalar(k); const w = (reach - k) / reach * 3;
      const side = V(-tmp.z, 0, tmp.x); if (side.dot(want) < 0) side.negate();
      out.addScaledVector(tmp, w).addScaledVector(side, w);
    }
    return out.normalize();
  }
  campStep = (dt) => {
    const fast = window.__campFast || 1;
    for (const spot of spots) {
      const s = spot.who; if (!s) continue;
      const T = s.trip;
      if (T && T.phase !== "home") {
        const sd = dt * fast; T.t += sd;
        if (fast > 1) s.mixer.update(sd - dt);
        if (T.phase === "down") {                     // about 10 s: slides down, turning from back-down to belly-down, facing its way
          const k = Math.min(1, T.t / 10), e = k * k * (3 - 2 * k);
          const aim = T.route?.[0] || spot.door, face = Math.atan2(-(aim.x - T.to.x), -(aim.z - T.to.z));
          s.o.position.lerpVectors(T.from, T.to, e); s.o.quaternion.slerpQuaternions(T.q, q0.setFromAxisAngle(UP, face), Math.min(1, e * 1.3));
          const pos = T.vine.geometry.attributes.position; pos.setXYZ(1, s.o.position.x, s.o.position.y + 0.25 * SL * (1 - e), s.o.position.z); pos.needsUpdate = true;
          T.vine.material.opacity = 1 - sstep(0.85, 1, k); T.vine.material.transparent = true;
          if (k >= 1) { T.phase = "crawl"; T.t = 0; T.yaw = face; scene.remove(T.vine); play(s, "walk", 1.5, 2.2); }
        } else if (T.phase === "crawl") {             // a slow belly crawl, about 0.15 m/s
          const pos = s.o.position, v = 0.027 * 2.2 * s.sc;
          while (T.route?.length && pos.distanceTo(T.route[0]) < 0.5) T.route.shift();               // the path's waypoints first
          if (spot.via && !T.passed && pos.distanceTo(spot.via) < 0.25) T.passed = true;   // the tent: the planks before the door first
          const goal = spot.via && !T.passed ? spot.via : spot.door;
          const dir = T.route?.length ? T.route[0].clone().sub(pos).setY(0).normalize() : steer(pos, goal, spot.ignore);
          const want = Math.atan2(-dir.x, -dir.z); let dy = want - T.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
          T.yaw += dy * Math.min(1, sd * 1.5); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
          pos.addScaledVector(V(-Math.sin(T.yaw), 0, -Math.cos(T.yaw)), v * sd);
          s.sc += (spot.scale - s.sc) * Math.min(1, sd * 0.05); s.o.scale.setScalar(s.sc);
          if (spot.via && !T.passed) { /* still on its way to the door */ }
          else if (pos.distanceTo(spot.door) < 0.12 + v * sd && spot.branch) {
            T.phase = "up"; T.t = 0; T.from = pos.clone(); T.q = s.o.quaternion.clone(); T.sc0 = s.sc; pos.copy(spot.door);
            T.vine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([spot.top, pos.clone()]), new THREE.LineBasicMaterial({ color: 0x4f6b2a, transparent: true, opacity: 0 }));
            scene.add(T.vine); play(s, "hang_walk", 1.5, 1.4);
            const yl = spot.tan.clone().setY(spot.tan.y * 0.5).normalize(), zl = V(0, -1, 0).addScaledVector(yl, yl.y).normalize(), xl = V().crossVectors(yl, zl);
            const rot = new THREE.Matrix4().makeBasis(xl, yl, zl);
            T.qTo = new THREE.Quaternion().setFromRotationMatrix(rot); T.to = spot.top.clone().sub(V(0, BR.z, -BR.y).applyMatrix4(rot));
          }
          else if (pos.distanceTo(spot.door) < 0.12 + v * sd && spot.climb) { T.phase = "climb"; T.t = 0; pos.copy(spot.door); }
          else if (pos.distanceTo(spot.door) < 0.12 + v * sd && spot.car) { T.phase = "door"; T.t = 0; pos.copy(spot.door); window.__jeep.open("P"); }
          else if (pos.distanceTo(spot.door) < 0.12 + v * sd) {
            T.phase = "settle"; T.t = 0; spot.parent.attach(s.o);
            T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); T.sc0 = s.sc;
            play(s, spot.clip, 2.5);
            if (spot.asleep) shutEyes(s.o);
          }
        } else if (T.phase === "door") {              // waits, facing the door, until it has swung open
          const sill = spot.parent.localToWorld(spot.sill.clone()), want = Math.atan2(-(sill.x - s.o.position.x), -(sill.z - s.o.position.z));
          let dy = want - T.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
          T.yaw += dy * Math.min(1, sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
          if (!window.__jeep.isOpen("P")) window.__jeep.open("P");
          else if (T.t > 2) { T.phase = "clamber"; T.t = 0; T.from = s.o.position.clone(); T.to = sill; play(s, "hang_walk", 1, 2); }
        } else if (T.phase === "clamber") {           // about 4 s: hauls itself up onto the door sill
          const k = Math.min(1, T.t / 4), e = k * k * (3 - 2 * k);
          s.o.position.lerpVectors(T.from, T.to, e); s.o.position.y += Math.sin(Math.PI * k) * 0.1;
          s.o.quaternion.setFromAxisAngle(UP, T.yaw).multiply(q0.setFromAxisAngle(V(1, 0, 0), -0.5 * Math.sin(Math.PI * k)));
          if (k >= 1) {
            T.phase = "settle"; T.t = 0; spot.parent.attach(s.o); T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); T.sc0 = s.sc;
            play(s, spot.clip, 3);
            if (spot.asleep) shutEyes(s.o);
          }
        } else if (T.phase === "up") {                // about 12 s: hauls itself up the vine to the branch, turning back-down under it
          const k = Math.min(1, T.t / 12), e = k * k * (3 - 2 * k);
          s.o.position.lerpVectors(T.from, T.to, e); s.o.quaternion.slerpQuaternions(T.q, T.qTo, Math.min(1, e * 1.3));
          s.sc = T.sc0 + (spot.scale - T.sc0) * e; s.o.scale.setScalar(s.sc);
          const vp = T.vine.geometry.attributes.position; vp.setXYZ(1, s.o.position.x, s.o.position.y + 0.25 * SL * e, s.o.position.z); vp.needsUpdate = true;
          T.vine.material.opacity = sstep(0, 0.08, k) * (1 - sstep(0.85, 1, k));
          if (k >= 1) { scene.remove(T.vine); T.phase = "home"; spot.home = true; play(s, "cling", 3, 0.6); }
        } else if (T.phase === "climb") {             // up the post hand over hand, about 15 s, until its arms reach the rope knot
          if (T.t < sd + 1e-6) play(s, "hang_walk", 1.2, 2.5);
          let dy = (spot.climbYaw ?? climbYaw) - T.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
          T.yaw += dy * Math.min(1, sd * 2); s.o.quaternion.setFromAxisAngle(UP, T.yaw);
          const top = spot.top ?? PIV - 0.2 * s.sc;
          s.o.position.y = Math.min(top, s.o.position.y + 0.015 * 2.5 * s.sc * sd * Math.min(1, T.t / 1.5));
          if (s.o.position.y >= top) { T.phase = "turn"; T.t = 0; spot.parent.attach(s.o); T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); }
        } else if (T.phase === "turn") {              // about 3 s: swings round from the post to hang under the rope (or the line)
          const k = Math.min(1, T.t / 3), e = k * k * (3 - 2 * k), R0 = spot.line ? linePose(s, 0.05) : ropePose(s, 0.1);
          s.o.position.lerpVectors(T.from, R0.p, e); s.o.quaternion.slerpQuaternions(T.q, R0.q, e);
          if (k >= 1) { T.phase = spot.line ? "line" : "rope"; T.t = 0; T.u = spot.line ? 0.05 : 0.1; }
        } else if (T.phase === "line") {              // hand over hand along the line to the gap, about 0.06 m/s
          T.u = Math.min(spot.t, T.u + 0.015 * 2.5 * s.sc * sd / LL.a.distanceTo(LL.b)); const P = linePose(s, T.u);
          s.o.position.copy(P.p); s.o.quaternion.copy(P.q); LL.brush?.(P.at, true, sd);
          if (T.u >= spot.t) { T.phase = "home"; spot.home = true; play(s, "cling", 3, 0.6); }
        } else if (T.phase === "rope") {              // down the rope to the sling's end, about 6 s
          T.u = Math.min(ROPE_L - 0.05, T.u + 0.015 * 2.5 * s.sc * sd); const R1 = ropePose(s, T.u);
          s.o.position.copy(R1.p); s.o.quaternion.copy(R1.q);
          if (T.u >= ROPE_L - 0.05) {
            T.phase = "settle"; T.t = 0; T.from = s.o.position.clone(); T.q = s.o.quaternion.clone(); T.sc0 = s.sc;
            play(s, spot.clip, 3);
            if (spot.asleep) shutEyes(s.o);
          }
        } else if (T.phase === "settle") {            // about 4 s: climbs up into its spot and settles
          const k = Math.min(1, T.t / (spot.climb ? 6 : 4)), e = k * k * (3 - 2 * k);
          s.o.position.lerpVectors(T.from, spot.at, e); if (!spot.climb && !spot.noHop) s.o.position.y += Math.sin(Math.PI * e) * 0.12;
          s.o.quaternion.slerpQuaternions(T.q, q0.setFromAxisAngle(UP, spot.yaw), e);
          s.sc = T.sc0 + (spot.scale - T.sc0) * e; s.o.scale.setScalar(s.sc);
          if (k >= 1) { T.phase = "home"; spot.home = true; }
        }
      }
      if (spot.line && T?.phase === "home") LL.brush?.(s.o.position, false, dt);   // the towel swings back
      // the hit sphere and the point hearts and words fly to follow the sloth
      s.o.getWorldPosition(s.box.position).y += 0.25 * s.sc / SL; s.p.copy(s.box.position);
    }
    const H = hammockSway, T = uTime.value, napper = spots[0].home ? spots[0].who : null;   // a slow swing, nudged harder for a while after a boop
    H.push = Math.max(0, H.push - dt * 0.25);
    H.sway.value = (0.055 + 0.1 * H.push) * Math.sin(T * 2 * Math.PI / 5.2); H.swing.rotation.x = H.sway.value;
    if (napper?.squish > 0.9) H.push = 1;
    if (napper) {
      H.zz ??= [0, 1, 2].map(() => { const z = sprite("z", 110); z.material.depthTest = true; scene.add(z); return z; });
      H.zz.forEach((z, i) => { const k = (T / 2.4 + i / 3) % 1; napper.head.getWorldPosition(z.position).add(V(0.1 * Math.sin(k * 6), 0.25 + 0.6 * k, 0));
        z.material.opacity = Math.sin(Math.PI * k) * (napper.squish > 0 ? 0 : 0.85); z.scale.set(0.3 + 0.35 * k, (0.3 + 0.35 * k) / 4, 1); });
    }
  };
  window.__spots = spots;
}
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
