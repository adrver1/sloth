// Canopy Camp move lab (camp.html?lab, Adriaen 2026-11-12: "a little move lab where I can inspect the animations for flaws
// visually"). A panel over the camp: pick one of the seven camp sloths, start any of its moves (leave for food, wander, go
// home, s'more, wave, everyone out), slow it down, pause and step, follow it with an orbit camera (drag to turn round it,
// pinch or wheel to zoom), see the path it plans, and scrub any clip frame by frame on it. Opened from the ⚙️ menu (Move lab)
// or with ?lab; the ✕ closes it and gives back your own view, the normal speed and the live clips.
import * as THREE from "three";
import { camera, scene } from "./core.js";
import { V } from "./forest.js";
import { me } from "./player.js";

const L = window.__lab, cs = L.camp;
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
  <div class="row"><button data-do="leave">Get food</button><button data-do="wander">Wander</button><button data-do="home">Go home</button>
    <button data-do="smore">S'more</button><button data-do="wave">Wave</button><button data-do="all">Everyone out</button></div>
  <div class="row"><span class="lbl">Speed</span>${[0, 0.25, 0.5, 1, 2, 4].map((v) => `<button data-sp="${v}">${v ? v + "×" : "Pause"}</button>`).join("")}<button id="labStep">Step ▸</button></div>
  <div class="row"><span class="lbl">Clip</span><select id="labClip"><option value="">(live)</option></select><button id="labBack">Back to life</button></div>
  <div class="row"><input type="range" id="labT" min="0" max="1" step="0.001" value="0" disabled></div>
  <div class="read" id="labRead"></div></div>`;
document.body.appendChild(box); box.hidden = true;
for (const e of ["pointerdown", "pointerup", "pointermove", "wheel"]) box.addEventListener(e, (ev) => ev.stopPropagation());
const $ = (id) => document.getElementById(id);
const who = $("labWho"), clipSel = $("labClip"), slider = $("labT"), read = $("labRead");
cs.forEach((s, i) => who.add(new Option(`${s.name} (${s.spot.name})`, i)));
for (const n of ["idle", "walk", "cling", "hang_walk", "nap", "reach", "curl", "drive", "peek", "titanic"]) if (L.clipOf(n)) clipSel.add(new Option(n, n));

let sel = cs[0], follow = true, showPath = true, speed = 1, stepLeft = 0, scrub = null, dist = 1.6 + cs[0].sc * 0.4;
const pick = () => (sel = cs[+who.value]);
who.onchange = () => { endScrub(); pick(); dist = 1.6 + sel.sc * 0.4; };
$("labClose").onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggle(); };
$("labFollow").onclick = (e) => { follow = !follow; e.target.classList.toggle("on", follow); document.body.classList.toggle("follow", follow); };
$("labPath").onclick = (e) => { showPath = !showPath; e.target.classList.toggle("on", showPath); };
const setSpeed = (v) => { speed = v; window.__campFast = v; box.querySelectorAll("[data-sp]").forEach((b) => b.classList.toggle("on", +b.dataset.sp === v)); };
box.querySelectorAll("[data-sp]").forEach((b) => (b.onclick = () => setSpeed(+b.dataset.sp)));
setSpeed(1);
$("labStep").onclick = () => { if (speed) setSpeed(0); stepLeft = 3; };   // three frames at 1x, then paused again
box.querySelectorAll("[data-do]").forEach((b) => (b.onclick = () => {
  endScrub(); const s = sel, ph = s.trip.phase, d = b.dataset.do;
  if (d === "leave" && ph === "home") L.leave(s);
  if (d === "wander" && L.GROUND.has(ph) && ph !== "greet") L.wander(s);
  if (d === "home" && L.GROUND.has(ph) && ph !== "greet") L.goHome(s);
  if (d === "smore") L.smore(s);
  if (d === "wave") L.wave(s);
  if (d === "all") for (const q of cs) if (q.trip.phase === "home") L.leave(q);
}));
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
addEventListener("wheel", (e) => { if (follow) dist = THREE.MathUtils.clamp(dist + e.deltaY * 0.003, 0.6, 8); }, { passive: true });

// the planned path, as a line on the ground
const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff3d7f, depthTest: false }));
pathLine.renderOrder = 9; pathLine.frustumCulled = false; scene.add(pathLine);
const tgt = V(), wp = V();
const labStep = (dt) => {
  if (stepLeft > 0 && --stepLeft === 0) window.__campFast = 0; else if (stepLeft > 0) window.__campFast = 1;
  const s = sel, T = s.trip;
  pathLine.visible = showPath && T.phase === "walk" && T.path?.length > 0;
  if (pathLine.visible) pathLine.geometry.setFromPoints([s.o.getWorldPosition(wp).clone(), ...T.path].map((p) => V(p.x, 0.04, p.z)));
  if (follow) {                                       // orbit: drag turns round it (me.yaw), up and down tilts (me.pitch)
    s.o.getWorldPosition(tgt).y += 0.2 * s.sc / 2.6;
    const el = THREE.MathUtils.clamp(0.35 - me.pitch, -0.2, 1.3);
    camera.position.set(tgt.x + Math.sin(me.yaw) * Math.cos(el) * dist, tgt.y + Math.sin(el) * dist, tgt.z + Math.cos(me.yaw) * Math.cos(el) * dist);
    camera.lookAt(tgt);
  }
  const a = scrub ? scrub.a : s.act;
  read.textContent = `${s.name}: ${T.phase}${T.phase === "walk" ? ` · ${T.path.length} pts left` : ""}\nclip ${a?.getClip().name ?? "-"} ${a ? a.time.toFixed(2) + " / " + a.getClip().duration.toFixed(2) + " s" : ""} × ${a?.timeScale.toFixed(2) ?? ""}\n` +
    `at ${s.o.getWorldPosition(wp).toArray().map((v) => v.toFixed(2)).join(", ")} · size ${s.sc.toFixed(2)}`;
  box.querySelectorAll("[data-do]").forEach((b) => {
    const ph = T.phase, d = b.dataset.do;
    b.disabled = d === "leave" ? ph !== "home" : d === "wander" || d === "home" ? !L.GROUND.has(ph) || ph === "greet" : d === "smore" ? s.spot.name !== "seat" || ph !== "home" : false;
  });
};

// open and close: closed, the panel is hidden, nothing is driven and you have your own view back
export function toggle() {
  const open = box.hidden; box.hidden = !open;
  document.body.classList.toggle("lab", open); document.body.classList.toggle("follow", open && follow);
  if (open) { window.__labStep = labStep; setSpeed(1); return; }
  endScrub(); setSpeed(1); window.__campFast = 1; window.__labStep = null; pathLine.visible = false;
}
