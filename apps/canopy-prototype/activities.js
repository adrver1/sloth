// Camp activities for camp.html (thread "Plan camp activities", plan in project files canopy-hide-and-seek/activities-plan.md).
// Kept out of the camp's own modules so the sibling threads' edits there don't collide; camp/campLife.js creates it, camp/input.js
// passes taps in and camp/main.js calls update() each frame.
// Calm by design: no timer, no score, no fail. Walk up to a thing, it lights up when you can use it (camp/highlight.js), tap it. You carry one thing at a time.
// Chunk 1: wood on the fire. Take a log from the wood pile, carry it to the fire and tap: the fire flares for about a minute,
// then settles over a few minutes and never goes out. Up to three logs burn at once. The camp sloth nearest the fire blinks happily.
// Chunk 2: the soup pot. The pot over the fire starts empty. Carry the water canister (by the snack table) to it and pour; take
// vegetables one at a time from the kitchen crate and drop them in; after two it bubbles for about 20 s and is soup. Tap the pot
// with empty hands to ladle a bowl, carry it to a log seat and set it down: the sloths nearby perk up (window event "camp-food").
// One pot makes three bowls, then it is empty again. The pot model (props/lived/build_fire.py) is not touched: a flat disc at
// the soup's surface shows it empty, water or broth, and fades away once the soup is done so the modelled soup shows.
// Triangle budget: carried and burning logs 24 each; the water pail 60; the surface disc 12; a bowl 24; bubbles, sparks and
// the carried food comes from camp/food.js (15 to 36 each).
import * as THREE from "three";
import { makePail } from "./camp/canister.js";
import { FRUIT, VEG as VEG_KINDS, makeFood } from "./camp/food.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NEAR = 2.5;                          // tap range
const HOLD = 60, SETTLE = 180, MAX_LOGS = 3;
const COOK = 20, BOWLS = 3, VN = VEG_KINDS.map((v) => v[0]), VEG = VEG_KINDS.map((v) => v[1]);
const FN = FRUIT.map((f) => f[0]), FE = FRUIT.map((f) => f[1]);

const canvasTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
// a bark texture for logs: dark stripes along the length, a pale cut ring at one end of the strip
const barkTex = canvasTex(64, 32, (g, w, h) => { g.fillStyle = "#6b4a32"; g.fillRect(0, 0, w, h); g.strokeStyle = "#4a3222"; g.lineWidth = 2;
  for (let y = 3; y < h; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (y % 2 ? 1 : -1)); g.stroke(); } });
const logGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.6, 6, 1);   // 24 tris with caps
const logMat = new THREE.MeshLambertMaterial({ map: barkTex });
// the water: a wooden pail (camp/canister.js, 60 tris)
// a little enamel bowl of soup: an open 8-sided cup (16 tris) with the soup as an 8-sided disc inside (8 tris)
const bowlGeo = new THREE.CylinderGeometry(0.075, 0.048, 0.05, 8, 1, true); bowlGeo.translate(0, 0.025, 0);
const bowlMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8, side: THREE.DoubleSide });   // cream enamel, so it reads on the wooden seats
const soupGeo = new THREE.CircleGeometry(0.068, 8).rotateX(-Math.PI / 2); soupGeo.translate(0, 0.04, 0);
const soupMat = new THREE.MeshLambertMaterial({ color: 0xd9822e });
// the pot's surface: a soft radial shade, tinted per stage (iron, water, broth), 12 tris
const surfTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, "#ffffff"); r.addColorStop(0.75, "#d8d8d8"); r.addColorStop(1, "#8a8a8a"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const bubbleTex = canvasTex(32, 32, (g) => { g.strokeStyle = "rgba(255,244,225,.95)"; g.lineWidth = 3; g.beginPath(); g.arc(16, 16, 11, 0, 7); g.stroke(); g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.arc(16, 16, 9, 0, 7); g.fill(); });
const STAGE = { empty: 0x2e2824, water: 0x86a9b0, 1: 0xc8a466, 2: 0xd9852f, 3: 0xd6712a };

// the fruit plate (a white plate of three tomatoes, Blender (-0.2, -0.05), radius 0.14) is part of the Table model
// (props/camp/build_camp.py, the picked set, joins it in), so the highlight lit the whole table (Adriaen 2026-11-13: light up
// just the bowl). Split it off here: the triangles over the plank tops within 17 cm of the plate's middle go into their own mesh, a child of the table with the same material, attributes and light map
// (a new index on the shared buffers). No triangles added, one more draw.
function splitBowl(T) {
  if (!T.isMesh || !T.geometry.index || T.getObjectByName("FruitBowl")) return T.getObjectByName("FruitBowl") ?? null;
  const g = T.geometry, idx = g.index.array, pos = g.attributes.position, keep = [], bowl = [];
  for (let i = 0; i < idx.length; i += 3) {
    let x = 0, y = 0, z = 0; for (let k = 0; k < 3; k++) { x += pos.getX(idx[i + k]) / 3; y += pos.getY(idx[i + k]) / 3; z += pos.getZ(idx[i + k]) / 3; }
    (y > 0.675 && Math.hypot(x + 0.2, z - 0.05) < 0.17 ? bowl : keep).push(idx[i], idx[i + 1], idx[i + 2]);
  }
  if (!bowl.length) return null;
  const b = new THREE.BufferGeometry(); for (const k in g.attributes) b.setAttribute(k, g.attributes[k]);
  b.setIndex(bowl); g.setIndex(keep);
  // bounds from the indexed corners only (three's own would take every vertex of the shared buffer, so the whole table)
  const box = new THREE.Box3(); for (const i of bowl) box.expandByPoint(V().fromBufferAttribute(pos, i));
  b.boundingBox = box; b.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const m = new THREE.Mesh(b, T.material); m.name = "FruitBowl"; T.add(m); return m;
}

export function createActivities({ scene, camera, me, woodPile, woodTex, fire = V(0, 0, 0), pot: potAt = null, table = null, crate = null, blockers = [], fireCards = [], flames = [], fireLight, glowTex, burst, toast, sloths = [], addBlocker, looks = {} }) {
  if (!camera.parent) scene.add(camera);   // so things held in your hand (children of the camera) are drawn
  // logs painted like the props thread's stack: its atlas (props/lived/wood_stack.jpg) has log ends on the top half and the logs
  // seen from above bottom right, so the sides take one log's strip (mirrored round, so no seam) and the caps one round end
  if (woodTex) {
    const px = (x, y) => [x / 1024, woodTex.flipY ? 1 - y / 1024 : y / 1024], uv = logGeo.attributes.uv, side = (6 + 1) * 2;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, ...(i < side ? px(540 + 62 * Math.abs(2 * u - 1), 555 + 455 * v) : px(440 + (u - 0.5) * 120, 92 + (v - 0.5) * 120))); }
    uv.needsUpdate = true; logMat.map = woodTex; logMat.needsUpdate = true;
  }
  // the wood pile: the props thread's pile when it is there, else a plain stack of the same logs in the same spot
  const pileAt = woodPile ? woodPile.clone() : V(-0.55, 0, -3.15);
  let stand = null;
  if (!woodPile) {
    const yaw = Math.atan2(-pileAt.x, -pileAt.z), g = new THREE.Group();
    [[-0.13, 0.06], [0, 0.06], [0.13, 0.06], [-0.065, 0.17], [0.065, 0.17], [0, 0.28]].forEach(([x, y]) => { const l = new THREE.Mesh(logGeo, logMat); l.rotation.z = Math.PI / 2; l.rotation.y = Math.PI / 2; l.position.set(x, y, 0); g.add(l); });
    g.position.copy(pileAt); g.rotation.y = yaw; scene.add(g); stand = g; addBlocker?.(pileAt, 0.5);
  }
  const nearSloth = (at, max = 4) => sloths.filter((s) => !s.wild && s.p).map((s) => [s, s.p.distanceTo(at)]).filter(([, d]) => d < max).sort((a, b) => a[1] - b[1]).map(([s]) => s);

  // what you carry, shown low in the bottom right of the view
  let held = null; const hand = new THREE.Group(); hand.position.set(0.36, -0.36, -0.85); hand.scale.setScalar(0.55); camera.add(hand);
  const inHand = {
    log: new THREE.Mesh(logGeo, logMat),
    water: makePail(),
    food: new THREE.Group(),   // a vegetable or a fruit (camp/food.js), shown bigger than life so it reads in the corner
    bowl: new THREE.Group(),
  };
  inHand.water.position.set(-0.08, -0.02, 0); inHand.water.scale.setScalar(0.9);   // the pail stays fully in view on a phone
  inHand.bowl.add(new THREE.Mesh(bowlGeo, bowlMat), new THREE.Mesh(soupGeo, soupMat)); inHand.bowl.rotation.x = 0.25; inHand.bowl.position.y = -0.05; inHand.bowl.scale.setScalar(1.6);
  for (const k in inHand) { inHand[k].visible = false; hand.add(inHand[k]); }
  inHand.log.rotation.set(1.1, 0.5, 0.9); inHand.water.rotation.set(0.15, -0.5, 0.1);
  let vegNow = 0, fruitNow = 0;
  inHand.food.rotation.set(0.5, 0.6, 0.35);
  const kindNow = () => held === "veg" ? VN[vegNow] : held === "fruit" ? FN[fruitNow] : null;
  function hold(what) {
    held = what; for (const k in inHand) inHand[k].visible = k === what || (k === "food" && (what === "veg" || what === "fruit")); hand.userData.t = 0;
    inHand.food.clear(); if (kindNow()) { const m = makeFood(kindNow()); m.geometry.computeBoundingSphere(); m.scale.setScalar(0.085 / m.geometry.boundingSphere.radius); inHand.food.add(m); }   // all about the same size in the corner
    dropBtn.style.display = what ? "block" : "none";
  }
  // Putting things back (Adriaen 2026-11-13: a vegetable taken before the pot had water left you stuck, hands full): a
  // "Put it back" pill in the corner whenever you carry something (Q or Backspace on a keyboard), and the place it came
  // from (wood pile, crate, pail spot) takes it back too. It goes back where it came from; a bowl goes back in the pot.
  const dropBtn = document.createElement("button"); dropBtn.textContent = "✋ Put it back";
  dropBtn.style.cssText = "position:fixed;z-index:3;display:none;right:max(16px,env(safe-area-inset-right,0px));" +
    "font:600 15px var(--display);color:var(--ink);background:rgb(255 248 238 / .94);border:0;border-radius:999px;padding:9px 15px;box-shadow:0 3px 0 rgb(138 90 59 / .25);cursor:pointer";
  for (const ev of ["pointerdown", "pointerup"]) dropBtn.addEventListener(ev, (e) => e.stopPropagation());
  dropBtn.onclick = (e) => { e.stopPropagation(); putBack(); };
  dropBtn.id = "putBack"; document.body.append(dropBtn);
  document.head.append(Object.assign(document.createElement("style"), { textContent:   // above what you hold; on a phone also above the hint and stick row
    "#putBack{bottom:calc(150px + env(safe-area-inset-bottom,0px))} body.touch #putBack{bottom:calc(220px + env(safe-area-inset-bottom,0px))}" }));
  addEventListener("keydown", (e) => { if ((e.key === "q" || e.key === "Q" || e.key === "Backspace") && held && !e.target.closest?.("input,textarea")) putBack(); });
  function putBack() {
    if (!held) return;
    const what = held;
    if (what === "water") canister.visible = true;
    if (what === "bowl" && soup.stage === "ready" && soup.bowls > 0) soup.bowls--;
    hold(null);
    toast(what === "log" ? "Log back on the pile 🪵" : what === "water" ? "Pail put back 💧" : what === "veg" ? `The ${VN[vegNow]} is back in the crate` : what === "fruit" ? `The ${FN[fruitNow]} is back in the bowl` : "Bowl back in the pot 🍲");
  }

  // ---------------------------------------------------------------- chunk 1: the logs on the fire
  // each leans into the teepee, burns at full for HOLD s, then settles over SETTLE s and is gone
  const burning = [];
  const ANG = [0.4, 2.5, 4.6];
  function addLog() {
    const slot = [0, 1, 2].find((k) => !burning.some((b) => b.slot === k));
    const m = new THREE.Mesh(logGeo, logMat.clone()), a = ANG[slot];
    m.position.set(Math.cos(a) * 0.24, 0.2, Math.sin(a) * 0.24); m.lookAt(fire.x, 0.55, fire.z); m.rotateX(Math.PI / 2); scene.add(m);
    burning.push({ m, t: 0, slot }); pop = 1;
    for (let i = 0; i < 14; i++) spark();
    // the camp sloth nearest the fire turns to it with a slow, happy blink
    const near = nearSloth(fire, 6)[0];
    if (near) setTimeout(() => { near.nod = 1.6; burst(near.p.clone().add(V(0, 0.3, 0)), "*happy blink*", 1, 2.2, 60); }, 900);
  }
  const level = () => burning.reduce((s, b) => s + (b.t < HOLD ? 1 : Math.max(0, 1 - (b.t - HOLD) / SETTLE)), 0);
  // a quick shower of sparks when a log goes on (a fixed little pool of quads)
  const sparks = [], sparkMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffb35a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  let pop = 0, flare = 0;
  function spark() {
    const s = sparks.find((p) => !p.live) || (sparks.length < 24 && (() => { const p = { o: new THREE.Sprite(sparkMat), v: V() }; scene.add(p.o); sparks.push(p); return p; })()); if (!s) return;
    const a = Math.random() * 6.28, out = 0.2 + Math.random() * 0.5;
    s.live = true; s.t = 0; s.life = 0.8 + Math.random() * 0.8; s.o.visible = true; s.o.position.set(fire.x + Math.cos(a) * 0.1, 0.45, fire.z + Math.sin(a) * 0.1); s.v.set(Math.cos(a) * out, 1.4 + Math.random() * 1.4, Math.sin(a) * out); s.o.scale.setScalar(0.07);
  }

  // ---------------------------------------------------------------- chunk 2: the soup pot
  const pot = { at: potAt ? potAt.at.clone() : V(fire.x, 0.885, fire.z), r: potAt ? potAt.r : 0.147 };
  const soup = { stage: "empty", veg: 0, cook: 0, bowls: 0, fade: 1 };   // stage: empty, water, cooking, ready
  const surf = new THREE.Mesh(new THREE.CircleGeometry(pot.r + 0.002, 12).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: surfTex, color: STAGE.empty, transparent: true, depthWrite: true }));
  surf.position.copy(pot.at).setY(pot.at.y + 0.012); surf.renderOrder = 1; scene.add(surf);
  const surfCol = new THREE.Color(STAGE.empty), surfTo = new THREE.Color(STAGE.empty);
  const bubbles = Array.from({ length: 10 }, () => { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false })); o.visible = false; scene.add(o); return { o, live: false, t: 0, life: 1 }; });
  function bubble(big = 1) {
    const b = bubbles.find((q) => !q.live); if (!b) return;
    const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * pot.r * 0.8;
    b.live = true; b.t = 0; b.life = 0.5 + Math.random() * 0.7; b.big = big * (0.02 + Math.random() * 0.025); b.o.visible = true; b.o.position.set(pot.at.x + Math.cos(a) * r, pot.at.y + 0.022, pot.at.z + Math.sin(a) * r);
  }
  function pour() {   // the water goes in: the surface turns to water with a burst of bubbles
    soup.stage = "water"; soup.veg = 0; surfTo.set(STAGE.water); soup.fade = 1;
    for (let i = 0; i < 8; i++) setTimeout(() => bubble(1.4), i * 70);
    burst(pot.at.clone().add(V(0, 0.25, 0)), "splash!", 1, 1.2, 60);
  }
  function addVeg() {
    soup.veg++; surfTo.set(STAGE[Math.min(3, soup.veg)]);
    burst(pot.at.clone().add(V(0, 0.25, 0)), "plop!", 1, 1.2, 60); for (let i = 0; i < 4; i++) bubble(1.2);
    if (soup.veg === 2 && soup.stage === "water") { soup.stage = "cooking"; soup.cook = 0; setTimeout(() => toast("The soup is bubbling 🍲"), 700); }
  }
  // the bowls on the log seats: each seat holds one; a bowl is eaten up after a while and goes
  const seats = [];
  scene.traverse((o) => { if (/^Seat(_\d)?$/.test(o.name) && o.parent === scene) { const b = new THREE.Box3().setFromObject(o), c = b.getCenter(V()); seats.push({ o, top: b.max.y, c, bowl: null }); } });
  const bowlsOut = [];
  function serve(seat) {
    // set it at the seat's end nearer to you, a little in from the edge, so it doesn't sit under a sloth on the middle of it
    const along = V(1, 0, 0).applyQuaternion(seat.o.quaternion).setY(0).normalize(), toMe = V(me.pos.x - seat.c.x, 0, me.pos.z - seat.c.z);
    const at = seat.c.clone().addScaledVector(along, (toMe.dot(along) >= 0 ? 1 : -1) * 0.32).setY(seat.top);
    const g = new THREE.Group(), s = new THREE.Mesh(soupGeo, soupMat); g.add(new THREE.Mesh(bowlGeo, bowlMat), s); g.position.copy(at); g.scale.setScalar(1.3); scene.add(g);
    const b = { g, s, t: 0, seat }; seat.bowl = b; bowlsOut.push(b);
    const near = nearSloth(at, 4);
    near.slice(0, 2).forEach((sl, i) => setTimeout(() => { sl.nod = 1.6; burst(sl.p.clone().add(V(0, 0.3, 0)), i ? "🍲" : "*sniff sniff*", 1, 2, 60); }, 600 + i * 700));
    dispatchEvent(new CustomEvent("camp-food", { detail: { kind: "soup", at: at.clone() } }));   // for the sloths' own lives (sloth life thread)
  }

  // ---------------------------------------------------------------- things you can tap
  // an invisible sphere each, when it applies, what a tap does, what to say when it doesn't apply, and what lights up when
  // it applies (looks[name]: the props' own objects, so the highlight hugs the real thing; look() may pick by what you hold)
  const things = [], hitList = [];
  function thing(name, at, r, when, act, why = () => null, look = null) {
    const box = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); box.position.copy(at).setY(at.y + r * 0.6); scene.add(box);
    const own = looks[name] ?? look ?? null;
    const t = { name, at, box, when, act, why, get look() { return typeof own === "function" ? own() : own; } }; box.userData.thing = t; things.push(t); hitList.push(box); return t;
  }
  const full = "Your hands are full. Put it back first ✋";
  thing("woodpile", pileAt, 0.55, () => !held || held === "log", () => { if (held) { putBack(); return; } hold("log"); toast("Got a log 🪵"); }, () => held && full, stand);
  // the fire and the pot over it are one place: what a tap does there depends on what you hold
  const potWants = () => (held === "water" && soup.stage === "empty") || (held === "veg" && (soup.stage === "water" || (soup.stage === "cooking" && soup.veg < 3))) || (!held && soup.stage === "ready");
  thing("fire", fire, 0.6, () => held === "log" || potWants(), () => {
    if (held === "log") { if (burning.length >= MAX_LOGS) { toast("The fire is roaring already 🔥"); return; } hold(null); addLog(); return; }
    if (held === "water") { hold(null); pour(); canister.visible = true; return; }
    if (held === "veg") { hold(null); addVeg(); return; }
    hold("bowl"); soup.bowls++; toast("Set it on a log seat 🍲");
    if (soup.bowls >= BOWLS) setTimeout(() => { soup.stage = "empty"; soup.veg = 0; soup.bowls = 0; surfTo.set(STAGE.empty); surf.material.opacity = 1; soup.fade = 1; }, 400);
  }, () => {
    if (held === "water") return "Water's in already";
    if (held === "veg") return soup.stage === "empty" ? "Fill the pot first 💧" : "Enough veg, let it cook";
    if (held === "bowl") return "Put it on a log seat";
    if (held === "fruit") return "Fruit is a snack: give it to someone hungry 🍎";
    if (!held && soup.stage === "empty") return "Fetch water first 💧";
    if (!held && soup.stage === "water") return "Add veg from the crate 🥕";
    if (!held && soup.stage === "cooking") return "Still cooking…";
    return null;
  }, () => (held === "log" ? looks.fireOnly : looks.pot) ?? null);   // the fire lights up for a log, the pot for everything else
  // the water pail, under the snack table out of the way (Adriaen 2026-11-13): between its legs (local x +-0.45), nudged
  // to the fire side of the top's middle so it peeks out; the table's own blocker keeps you off it, so it adds none
  const tb = table || V(1.6, 0, 3.2);
  const canAt = (() => { const ax = V(Math.sin(0.6), 0, Math.cos(0.6));   // the table top's short axis (campProps.js put("Table", .., 0.6))
    const side = Math.sign(ax.dot(V(fire.x - tb.x, 0, fire.z - tb.z))) || 1;
    return tb.clone().setY(0).addScaledVector(ax, side * 0.2); })();
  const canister = makePail(); canister.position.copy(canAt); canister.rotation.y = Math.atan2(fire.x - canAt.x, fire.z - canAt.z); scene.add(canister);
  thing("canister", canAt, 0.3, () => (!held && soup.stage === "empty") || held === "water", () => { if (held) { putBack(); return; } hold("water"); canister.visible = false; toast("Got the water 💧"); },
    () => held ? full : soup.stage !== "empty" ? "Water's in already" : null, [canister]);
  // the kitchen crate: one vegetable at a time, a different one each time
  if (crate) thing("crate", crate, 0.4, () => !held || held === "veg", () => { if (held) { putBack(); return; } vegNow = (vegNow + 1) % VEG.length; hold("veg"); toast(`Got a ${VN[vegNow]} ${VEG[vegNow]}`); }, () => held && full, looks.crate ?? null);
  // the fruit plate on the snack table (split off the Table model, splitBowl above): one fruit at a time to give to a
  // sloth or the operator (Adriaen 2026-11-13: veg from the crate, fruit from the fruit bowl)
  const tableObj = scene.getObjectByName("Table");
  const fruitBowl = tableObj && splitBowl(tableObj);
  if (tableObj) {
    tableObj.updateMatrixWorld(true);
    const bowlAt = fruitBowl ? fruitBowl.localToWorld(fruitBowl.geometry.boundingBox.getCenter(V())) : tableObj.localToWorld(V(-0.2, 0.72, 0.05));   // the plate's middle
    thing("fruitbowl", bowlAt, 0.28, () => !held || held === "fruit", () => { if (held) { putBack(); return; } fruitNow = (fruitNow + 1) % FN.length; hold("fruit"); toast(`Got ${/^[aeiou]/.test(FN[fruitNow]) ? "an" : "a"} ${FN[fruitNow]} ${FE[fruitNow]}`.trim()); },
      () => held && full, [fruitBowl ?? tableObj]);
  }
  // the log seats: somewhere to set a bowl down
  for (const seat of seats) thing(`seat${seats.indexOf(seat)}`, seat.c.clone().setY(0), 0.6, () => held === "bowl" && !seat.bowl, () => { hold(null); serve(seat); },
    () => held === "bowl" && seat.bowl ? "A bowl's there already" : null, [seat.o]);
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  return {
    // camp/input.js calls this on a tap before booping sloths: the nearest tappable thing under the finger, or null
    pick(ray) {
      const hits = ray.intersectObjects(hitList, false);
      // seats only count while you hold a bowl, so a tap on a sloth sitting on one still boops it
      const h = hits.find((x) => !x.object.userData.thing.name.startsWith("seat") || held === "bowl");
      return h ? { distance: h.distance, thing: h.object.userData.thing } : null;
    },
    tap(hit) {
      const t = hit.thing;
      if (flat(me.pos, t.at) > NEAR + 0.6) { toast("Get a bit closer"); return true; }
      if (t.when()) { t.act(); return true; }
      const why = t.why(); if (why) toast(why);
      return true;
    },
    update(dt, time) {
      // what you hold sways a little as you walk
      hand.userData.t = (hand.userData.t || 0) + dt; hand.position.x = 0.1 + 0.26 * Math.min(1, camera.aspect);   // stays in view on a narrow phone
      hand.position.y = -0.36 + Math.sin(me.walkT * 7) * 0.01 + (1 - Math.min(1, hand.userData.t * 4)) * -0.2;
      if (inHand.food.visible) inHand.food.rotation.z = 0.35 + Math.sin(time * 2) * 0.1;
      // burning logs char and shrink as they settle; the fire's size follows how many are burning
      for (let i = burning.length - 1; i >= 0; i--) { const b = burning[i]; b.t += dt; const k = b.t < HOLD ? 0 : Math.min(1, (b.t - HOLD) / SETTLE);
        b.m.material.color.setScalar(1 - 0.75 * Math.min(1, b.t / 40)); b.m.scale.set(1 - 0.5 * k, 1 - 0.7 * k, 1 - 0.5 * k);
        if (k >= 1) { scene.remove(b.m); burning.splice(i, 1); } }
      flare += (level() - flare) * Math.min(1, dt * 1.5); pop = Math.max(0, pop - dt * 0.8);
      const f = 1 + 0.08 * flare + 0.12 * pop, w = 1 + 0.17 * flare + 0.15 * pop;   // wider more than taller: the pot hangs just over the flames
      for (const c of fireCards) c.scale.set(w, f, w);
      for (const s of flames) s.scale.multiplyScalar(w);
      if (fireLight) fireLight.intensity *= 1 + 0.45 * flare + 0.4 * pop;
      if (flare > 0.3 && Math.random() < dt * 3 * flare) spark();
      for (const s of sparks) { if (!s.live) continue; s.t += dt; s.o.position.addScaledVector(s.v, dt); s.v.y -= dt * 0.9; s.v.multiplyScalar(0.985);
        s.o.material.opacity = 1; s.o.scale.setScalar(0.07 * (1 - s.t / s.life)); if (s.t > s.life) { s.live = false; s.o.visible = false; } }
      // the pot: the surface eases to its stage's colour; cooking bubbles harder as it goes (faster with a big fire), then the
      // disc fades and the modelled soup shows
      surfCol.lerp(surfTo, Math.min(1, dt * 1.5)); surf.material.color.copy(surfCol);
      if (soup.stage === "cooking") {
        soup.cook += dt * (1 + 0.25 * flare); const k = Math.min(1, soup.cook / COOK);
        if (Math.random() < dt * (2 + 10 * k)) bubble(0.8 + 0.6 * k);
        if (k >= 1) { soup.stage = "ready"; soup.fade = 1; const s = nearSloth(fire, 6)[0]; if (s) { s.nod = 1.6; burst(s.p.clone().add(V(0, 0.3, 0)), "*smells good*", 1, 2.2, 60); } toast("Soup's ready 🍲"); }
      } else if (soup.stage === "ready") {
        soup.fade = Math.max(0, soup.fade - dt / 2); surf.material.opacity = soup.fade; surf.visible = soup.fade > 0.01;
        if (Math.random() < dt * 2) bubble(0.7);
      } else { surf.visible = true; surf.material.opacity = 1; if (soup.stage === "water" && Math.random() < dt * 0.6) bubble(0.6); }
      for (const b of bubbles) { if (!b.live) continue; b.t += dt; const k = b.t / b.life; b.o.scale.setScalar(b.big * (0.4 + k)); b.o.material.opacity = 1 - k * k; if (k >= 1) { b.live = false; b.o.visible = false; } }
      // bowls on the seats: the soup goes down over a minute and a half, then the bowl is taken away
      for (let i = bowlsOut.length - 1; i >= 0; i--) { const b = bowlsOut[i]; b.t += dt;
        b.s.position.y = -0.03 * Math.min(1, b.t / 90); b.s.visible = b.t < 90;
        if (b.t > 120) { scene.remove(b.g); b.seat.bowl = null; bowlsOut.splice(i, 1); } }
    },
    // the words on the tap menu (camp/input.js): what a tap on t does now, with what you are carrying
    label(t) {
      if (t.name === "woodpile") return held === "log" ? "Put the log back 🪵" : "Take a log 🪵";
      if (t.name === "canister") return held === "water" ? "Put the pail back 💧" : "Take the pail of water 💧";
      if (t.name === "crate" && held === "veg") return `Put the ${VN[vegNow]} back ${VEG[vegNow]}`;
      if (t.name === "crate") { const n = (vegNow + 1) % VEG.length; return `Take a ${VN[n]} ${VEG[n]}`; }
      if (t.name === "fruitbowl" && held === "fruit") return `Put the ${FN[fruitNow]} back ${FE[fruitNow]}`.trim();
      if (t.name === "fruitbowl") { const n = (fruitNow + 1) % FN.length; return `Take ${/^[aeiou]/.test(FN[n]) ? "an" : "a"} ${FN[n]} ${FE[n]}`.trim(); }
      if (t.name.startsWith("seat")) return "Set the bowl down 🍲";
      if (t.name === "fire") return held === "log" ? "Put the log on the fire 🔥" : held === "water" ? "Pour the water in the pot 💧" : held === "veg" ? `Add the ${VN[vegNow]} to the pot ${VEG[vegNow]}` : "Fill a bowl of soup 🍲";
      return "Use it";
    },
    get held() { return held; }, burning, level, things, soup, seats,
    // food in your hand can be given to a sloth or to the operator, who eat it (Adriaen 2026-11-13): what it is, and the giving
    // make() gives a new mesh of it (real size, userData.base for the eater's bites); from is where it leaves your hand
    food() {
      const k = kindNow();
      if (k) return { kind: k, name: k, emoji: held === "veg" ? VEG[vegNow] : FE[fruitNow], make: () => makeFood(k) };
      if (held === "bowl") return { kind: "soup", name: "bowl of soup", emoji: "🍲", make: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(bowlGeo, bowlMat), new THREE.Mesh(soupGeo, soupMat)); g.position.y = -0.025; const o = new THREE.Group(); o.add(g); o.userData.base = V(1, 1, 1); return o; } };
      return null;
    },
    give() { const f = this.food(); if (!f) return null; f.from = (inHand.food.visible ? inHand.food : inHand.bowl).getWorldPosition(V()); hold(null); return f; },
    ready(t) { return t.when() && flat(me.pos, t.at) <= NEAR + 0.6; },   // the highlight lights a thing only when a tap would use it
  };
}
