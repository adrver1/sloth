// Canopy Camp move lab (camp.html?lab, Adriaen 2026-11-12: "a little move lab where I can inspect the animations for flaws
// visually"). A panel over the camp: pick one of the seven camp sloths, start any of its moves (leave for food, wander, go
// home, s'more, wave, everyone out), slow it down, pause and step, follow it with an orbit camera (drag to turn round it,
// pinch or wheel to zoom), see the path it plans, and scrub any clip frame by frame on it. Opened from the ⚙️ menu (Move lab)
// or with ?lab (labButton.js does both); the ✕ closes it and gives back your own view, the normal speed and the live clips.
// It drives the sloths through labApi (sloth/hooks.js) and sets the camp's pace for everyone (core.js pace)
// (sloth/step.js and jeepSeat.js read it; tools/camp-replay.cjs sets it too). Exports toggle().
// Each move is one row of ACTIONS (its button, when it can start, what it does); the clip menu lists every clip the sloth
// model has (labApi.clipNames). The read-out and the greyed-out buttons are updated about 5 times a second (review R2-144).
import * as THREE from "three";
import { $, camera, pace, scene } from "./core.js";
import { V } from "./util.js";
import { me } from "./player.js";
import { holder } from "./places.js";
import { labApi } from "./sloth/hooks.js";
import { opApi } from "./operator.js";
import { setLabStep } from "./labButton.js";

const L = labApi, cs = L.camp;   // (with ?campsloths=0 there are no camp sloths, and labButton.js opens no lab)
// the moves, each once: its button (row, label), when it can start for sloth s (the button is greyed out otherwise) and what
// it does. A click runs it only when it can start.
const atHome = (s) => s.trip.phase === "home", sitting = (s) => atHome(s) || s.trip.phase === "rest";
const onGround = (s) => L.GROUND.has(s.trip.phase) && s.trip.phase !== "greet";
const ACTIONS = [
  { id: "leave", row: 0, label: "Get food", can: atHome, run: (s) => L.leave(s) },
  { id: "wander", row: 0, label: "Wander", can: onGround, run: (s) => L.wander(s) },
  { id: "home", row: 0, label: "Go home", can: onGround, run: (s) => L.goHome(s) },
  { id: "smore", row: 0, label: "S'more", can: (s) => !!s.spot.bench && atHome(s), run: (s) => L.smore(s) },
  { id: "wave", row: 0, label: "Wave", can: () => true, run: (s) => L.wave(s) },
  { id: "all", row: 0, label: "Everyone out", can: () => true, run: () => { for (const q of cs) if (atHome(q)) L.leave(q); } },
  { id: "nap", row: 1, label: "Nap", can: (s) => !s.dozing && sitting(s) && !s.spot.asleep, run: (s) => L.nap(s) },
  { id: "wake", row: 1, label: "Wake", can: (s) => !!s.dozing, run: (s) => L.wake(s) },
  { id: "yawn", row: 1, label: "Yawn", can: () => true, run: (s) => L.yawn(s) },
  { id: "stretch", row: 1, label: "Stretch", can: sitting, run: (s) => L.stretch(s) },
  { id: "fix", row: 1, label: "Fix engine", can: (s) => !!s.spot.car && atHome(s), run: (s) => L.fix(s) },
  { id: "trip", row: 1, label: "Cozy nap", can: (s) => atHome(s) && !s.spot.guest,
    run: (s) => { const k = L.guests().filter((k) => !holder(k)); L.napTrip(s, k[Math.floor(Math.random() * k.length)]); } },
  { id: "cards", row: 1, label: "Cards", can: (s) => atHome(s) && !s.spot.guest, run: (s) => L.cards(s) },
];
const css = document.createElement("style");
css.textContent = `
#lab { position: fixed; right: max(16px, env(safe-area-inset-right, 0px)); top: calc(96px + env(safe-area-inset-top, 0px)); width: min(300px, calc(100vw - 32px));
  background: rgb(255 248 238 / .94); border-radius: 16px; box-shadow: 0 3px 0 rgb(138 90 59 / .2); font: 500 13px var(--display); color: var(--ink); z-index: 4; touch-action: manipulation; }
@media (max-width: 700px) { #lab { left: max(16px, env(safe-area-inset-left, 0px)); right: max(16px, env(safe-area-inset-right, 0px)); width: auto; top: auto; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); } }
body.lab #q { display: none; } body.lab.follow #stick { display: none; }
#lab[hidden] { display: none; }
#lab summary { padding: 8px 12px; font-weight: 700; cursor: pointer; list-style: none; }
#lab summary::-webkit-details-marker { display: none; }
#lab .in { padding: 0 12px 12px; display: grid; gap: 8px; }
#lab .row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
#lab button, #lab select { font: 600 12px var(--display); color: var(--ink); background: #ffe9a8; border: 0; border-radius: 999px; padding: 6px 10px; cursor: pointer; }
#lab select { background: #fff; border: 1px solid #e6d3bb; }
#lab button.on { background: var(--pink); color: #fff; }
#lab button:disabled { opacity: .4; cursor: default; }
#lab input[type=range] { flex: 1; min-width: 120px; accent-color: #ff7fa8; }
#lab .read { font: 500 11.5px ui-monospace, Menlo, monospace; color: var(--soft); line-height: 1.4; white-space: pre-wrap; }
#lab .lbl { font-weight: 600; color: var(--soft); font-size: 11.5px; min-width: 42px; }`;
document.head.appendChild(css);
const box = document.createElement("details"); box.id = "lab"; box.open = true;
box.innerHTML = `<summary>🧪 Move lab <button id="labClose" style="float:right;padding:2px 9px" aria-label="Close the move lab">✕</button></summary><div class="in">
  <div class="row"><select id="labWho"></select><button id="labFollow" class="on">Follow</button><button id="labPath" class="on">Path</button></div>
  ${[0, 1].map((r) => `<div class="row">${ACTIONS.filter((a) => a.row === r).map((a) => `<button data-do="${a.id}">${a.label}</button>`).join("")}</div>`).join("")}
  <div class="row"><span class="lbl">Speed</span>${[0, 0.25, 0.5, 1, 2, 4].map((v) => `<button data-sp="${v}">${v ? v + "×" : "Pause"}</button>`).join("")}<button id="labStep">Step ▸</button></div>
  <div class="row"><span class="lbl">Clip</span><select id="labClip"><option value="">(live)</option></select><button id="labBack">Back to life</button></div>
  <div class="row"><input type="range" id="labT" min="0" max="1" step="0.001" value="0" disabled></div>
  <div class="read" id="labRead"></div></div>`;
document.body.appendChild(box); box.hidden = true;
for (const e of ["pointerdown", "pointerup", "pointermove", "wheel"]) box.addEventListener(e, (ev) => ev.stopPropagation());
const who = $("labWho"), clipSel = $("labClip"), slider = $("labT"), read = $("labRead");
cs.forEach((s, i) => who.add(new Option(`${s.name} (${s.spot.name})`, i)));
for (const n of L.clipNames()) clipSel.add(new Option(n, n));   // every clip the sloth model has
const buttons = ACTIONS.map((a) => [a, box.querySelector(`[data-do="${a.id}"]`)]);

let readT = 0;   // seconds to the next read-out (readOut, below); 0 updates it on the next frame
let sel = cs[0], follow = true, showPath = true, speed = 1, stepLeft = 0, scrub = null, dist = 1.6 + cs[0].sc * 0.4;
const pick = () => (sel = cs[+who.value]);
who.onchange = () => { endScrub(); pick(); dist = 1.6 + sel.sc * 0.4; readT = 0; };
$("labClose").onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggle(); };
$("labFollow").onclick = (e) => { follow = !follow; e.target.classList.toggle("on", follow); document.body.classList.toggle("follow", follow); };
$("labPath").onclick = (e) => { showPath = !showPath; e.target.classList.toggle("on", showPath); };
const setSpeed = (v) => { speed = v; pace.fast = v; box.querySelectorAll("[data-sp]").forEach((b) => b.classList.toggle("on", +b.dataset.sp === v)); };
box.querySelectorAll("[data-sp]").forEach((b) => (b.onclick = () => setSpeed(+b.dataset.sp)));
setSpeed(1);
$("labStep").onclick = () => { if (speed) setSpeed(0); stepLeft = 3; };   // three frames at 1x, then paused again
for (const [a, b] of buttons) b.onclick = () => { endScrub(); if (a.can(sel)) a.run(sel); readT = 0; };
// the clip scrubber: everything paused, the chosen clip held on the sloth at the slider's time
function endScrub() {
  if (!scrub) return;
  const s = scrub.s; s.mixer.stopAllAction(); if (s.act) { s.act.reset().setEffectiveWeight(1).play(); }
  scrub = null; clipSel.value = ""; slider.disabled = true;
}
clipSel.onchange = () => {
  endScrub(); if (!clipSel.value) return;
  setSpeed(0); const s = sel, a = s.mixer.clipAction(L.clipOf(clipSel.value));
  s.mixer.stopAllAction(); a.reset().setEffectiveWeight(1).play(); a.paused = true; scrub = { s, a }; slider.disabled = false; slider.value = 0;
};
slider.oninput = () => { if (scrub) { scrub.a.time = +slider.value * scrub.a.getClip().duration; scrub.s.mixer.update(0); } };
$("labBack").onclick = () => { endScrub(); setSpeed(1); };
addEventListener("wheel", (e) => { if (follow && !box.hidden) dist = THREE.MathUtils.clamp(dist + e.deltaY * 0.003, 0.6, 8); }, { passive: true });

// the planned path: one fixed buffer of points (it grows if a path is longer), written in place each frame and drawn up to
// the path's length, so a shorter path keeps no old tail and nothing is allocated per frame (review R2-059)
const pathBuf = (n) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage)); return g; };
const pathLine = new THREE.Line(pathBuf(128), new THREE.LineBasicMaterial({ color: 0xff3d7f, depthTest: false }));
pathLine.renderOrder = 9; pathLine.frustumCulled = false; scene.add(pathLine);
function drawPath(from, path) {
  const n = path.length + 1;
  if (n > pathLine.geometry.attributes.position.count) { pathLine.geometry.dispose(); pathLine.geometry = pathBuf(Math.max(n, 2 * pathLine.geometry.attributes.position.count)); }
  const pos = pathLine.geometry.attributes.position;
  pos.setXYZ(0, from.x, 0.04, from.z);
  for (let i = 1; i < n; i++) pos.setXYZ(i, path[i - 1].x, 0.04, path[i - 1].z);
  pos.needsUpdate = true; pathLine.geometry.setDrawRange(0, n);
}
const tgt = V(), wp = V();
// the follow camera stays in front of anything solid between it and the sloth (play-test 2026-11-14: with Sunny in the
// operator's arms it ended up inside a surface and showed a flat beige view). The solids are the camp's opaque meshes and
// the operator (not the leaves, the sloths or the see-through cards), gathered again every 2 s while the lab follows, since
// ?lab opens it before the rest of the camp is built; the camera stops 0.12 m short of the first one the ray from the
// sloth meets.
let solids = [], solidsT = 0;
const ray = new THREE.Raycaster(), dir = V();
function findSolids() {
  const op = opApi?.root, inOp = (o) => { for (let p = o; p; p = p.parent) if (p === op) return true; return false; };
  const list = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || pathLine === o) return;
    if (o.isSkinnedMesh && !inOp(o)) return;   // the sloths
    if ([].concat(o.material).some((m) => m.transparent || m.depthWrite === false)) return;
    list.push(o);
  });
  return list;
}
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
// the read-out and the buttons' greying, about 5 times a second (and at once after a pick or a click)
function readOut(s) {
  const T = s.trip, a = scrub ? scrub.a : s.act, p = s.o.getWorldPosition(wp);
  read.textContent = `${s.name}: ${T.phase}${T.st ? "/" + T.st : ""}${s.dozing ? " · asleep" : ""}${T.phase === "walk" ? ` · ${T.path.length} pts left` : ""}\nclip ${a?.getClip().name ?? "-"} ${a ? a.time.toFixed(2) + " / " + a.getClip().duration.toFixed(2) + " s" : ""} × ${a?.timeScale.toFixed(2) ?? ""}\n` +
    `at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} · size ${s.sc.toFixed(2)}`;
  for (const [act, b] of buttons) { const off = !act.can(s); if (b.disabled !== off) b.disabled = off; }
}
const labStep = (dt) => {
  if (stepLeft > 0 && --stepLeft === 0) pace.fast = 0; else if (stepLeft > 0) pace.fast = 1;
  const s = sel, T = s.trip;
  pathLine.visible = showPath && T.phase === "walk" && T.path?.length > 0;
  if (pathLine.visible) drawPath(s.o.getWorldPosition(wp), T.path);
  if (follow) {                                       // orbit: drag turns round it (me.yaw), up and down tilts (me.pitch)
    s.o.getWorldPosition(tgt).y += 0.2 * s.sc / 2.6;
    const el = THREE.MathUtils.clamp(0.35 - me.pitch, -0.2, 1.3);
    if ((solidsT -= dt) < 0) { solids = findSolids(); solidsT = 2; }
    dir.set(Math.sin(me.yaw) * Math.cos(el), Math.sin(el), Math.cos(me.yaw) * Math.cos(el));
    ray.set(tgt, dir); ray.near = 0.15; ray.far = dist;
    const hit = ray.intersectObjects(solids, false).find((h) => shown(h.object));
    camera.position.copy(tgt).addScaledVector(dir, hit ? Math.max(0.25, hit.distance - 0.12) : dist);
    camera.lookAt(tgt);
  }
  if ((readT -= dt) <= 0) { readT = 0.2; readOut(s); }
};

// open and close: closed, the panel is hidden, nothing is driven and you have your own view back
export function toggle() {
  const open = box.hidden; box.hidden = !open;
  document.body.classList.toggle("lab", open); document.body.classList.toggle("follow", open && follow);
  if (open) { setLabStep(labStep); setSpeed(1); return; }
  endScrub(); setSpeed(1); pace.fast = 1; setLabStep(null); pathLine.visible = false;
}
