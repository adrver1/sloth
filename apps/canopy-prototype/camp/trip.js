// Canopy Camp karaoke trip (Adriaen 2026-11-12, thread "Connect camp to karaoke stage"; plan in the project files,
// canopy-hide-and-seek/karaoke-trip/plan.md). The glade path goes on round the glade tree and out of the glade as a road
// (layout.js tripPath, a PATHS entry: the forest draws its ribbon, lines it with trunks and bushes and keeps the cut scene's
// lines of sight clear), with a square sign by it. Tapping the sign, or walking far enough down the road, asks "Go to
// karaoke?". Yes plays a short letterboxed cut scene: the bearded operator pulls a red toy wagon, you (the ponytail engineer)
// walk beside him holding his hand, and up to three sloths who were free sway and sing in the wagon under rising notes. Then
// the karaoke stage loads (karaoke/index.html?from=camp, the same page as the Sloth Karaoke artifact, in its camp mode; in the
// app folder karaoke/ is a link to apps/karaoke); the trip part of the camp save (save.js) says who came, and "Back to camp"
// there brings you back by the sign, to a second cut scene of the walk home with the sloths nodding off in the wagon.
// Picked on trip-prototype.html: wagon A, sign A. ?tripstay (core.js OPT) keeps the camp page when the cut scene ends, for checks.
// Exports buildTrip() (main.js, once the operator, the sloths and the input are built), tripStep(dt) (main.js, each frame, after
// the player has moved: the cut scene takes the camera), and tripApi { ask(), start(names, home), sign, cut(), asking(),
// counts } for debug.js (window.__trip).
// Triangles: sign 16, wagon 214; the cut scene's cast are clones made only when it starts (operator 1,034, ponytail 1,326,
// sloths 826 each plus fur), and her model (karaoke/models/her.txt) is fetched only once the question is asked. The road's
// trunks are the wall's instanced trunk (no new draw) and its bushes one more leaf draw (forest/plants.js trailVerge).
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { b64bytes } from "../bakedlight.js";
import { furify } from "../fur.js";
import { OPT, PRE, camera, scene } from "./core.js";
import { V, canvasTex, lam, polyDist, timers, trisIn } from "./util.js";
import { GLADE, tripPath } from "./layout.js";
import { groundHeight } from "./terrain.js";
import { me } from "./player.js";
import { addTarget } from "./targets.js";
import { resize } from "./input.js";
import { sloths } from "./sloths.js";
import { toast } from "./hud.js";
import { CAST } from "./cast.js";
import { flush, load, save } from "./save.js";
import { opApi } from "./operator.js";
import { kitLook } from "./actor.js";
import { reach } from "./operator/ik.js";
import { roadForest } from "./forest.js";

const KARAOKE = "karaoke/index.html?from=camp";
const curve = tripPath.cut.curve, LEN = curve.getLength(), CUT_PTS = tripPath.cut.pts;
const tm = timers();   // the trip's delays, in frame time (tripStep)
let NEAR0 = 0.1, fade = null, card = null, sign = null;

// ---------------------------------------------------------------- the page bits: the question card, the letterbox bars, the fade
const CSS = `
.trip-bar { position: fixed; left: 0; right: 0; height: 0; background: #000; transition: height .6s ease; z-index: 20; pointer-events: none; }
.trip-bar.top { top: 0 } .trip-bar.bot { bottom: 0 }
body.trip-cut .trip-bar { height: 11vh; }
body.trip-cut .stick, body.trip-cut .bar, body.trip-cut .hud, body.trip-cut #q, body.trip-cut #toast { visibility: hidden; }
.trip-fade { position: fixed; inset: 0; background: #000; opacity: 0; transition: opacity .7s; z-index: 21; pointer-events: none; }
.trip-fade.on { opacity: 1; }
.trip-ask { position: fixed; left: 50%; bottom: calc(150px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); width: min(340px, calc(100vw - 32px)); box-sizing: border-box; z-index: 15;
  background: rgb(255 248 238 / .95); color: var(--ink, #4a2f3d); border-radius: 20px; padding: 16px 18px; text-align: center; box-shadow: 0 8px 30px rgb(0 0 0 / .3); font-family: var(--display, system-ui); }
.trip-ask h2 { margin: 0 0 4px; font-size: 21px; } .trip-ask p { margin: 0 0 12px; font-size: 14px; opacity: .75; }
.trip-ask button { font: 600 16px var(--display, system-ui); border: 0; border-radius: 999px; padding: 10px 18px; margin: 0 4px; cursor: pointer; }
.trip-ask .yes { background: #ff6fa6; color: #fff; } .trip-ask .no { background: #eadfe4; color: #4a2f3d; }
`;
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); const n = t.content.firstChild; document.body.append(n); return n; };

// ---------------------------------------------------------------- the sign: a square board on a post, where the road starts past the glade
// tree. Adriaen 2026-11-14: the arrow board along the road could only be read once you were nearly past it, so it is a board
// facing you as you come round the tree, an arrow pointing up (straight on) over "Karaoke".
const SIGN_T = 0.1;
function makeSign() {
  const g = new THREE.Group(), wood = lam(0x6e4a28);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), wood); post.position.y = 0.65; g.add(post);   // 12 tris
  const front = canvasTex(256, 224, (c, w, h) => {
    c.fillStyle = "#c08a50"; c.fillRect(6, 6, w - 12, h - 12); c.strokeStyle = "#7a5230"; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = "rgba(90,58,32,.22)"; for (let i = 0; i < 9; i++) c.fillRect(16, 24 + i * 22, w - 32, 2);   // the grain
    c.fillStyle = "#5a3a20"; c.beginPath(); c.moveTo(w / 2, 22); c.lineTo(w / 2 + 44, 74); c.lineTo(w / 2 + 16, 74); c.lineTo(w / 2 + 16, 118); c.lineTo(w / 2 - 16, 118);
    c.lineTo(w / 2 - 16, 74); c.lineTo(w / 2 - 44, 74); c.closePath(); c.fill();   // straight on
    c.font = "bold 46px Fredoka, Trebuchet MS, sans-serif"; c.textAlign = "center"; c.fillText("Karaoke ♪", w / 2, 178);
  });
  const back = canvasTex(64, 56, (c, w, h) => { c.fillStyle = "#a97a46"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(90,58,32,.25)"; for (let i = 0; i < 5; i++) c.fillRect(2, 6 + i * 10, w - 4, 1); });
  for (const [map, ry] of [[front, 0], [back, Math.PI]]) {   // two one-sided quads back to back (4 tris)
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.56), lam(0xffffff, { map })); b.rotation.y = ry; b.position.set(0, 1.3, ry ? -0.045 : 0.045); g.add(b);
  }
  const p = curve.getPointAt(SIGN_T), d = curve.getTangentAt(SIGN_T).setY(0).normalize(), side = V(-d.z, 0, d.x);
  if (side.dot(V(-p.x, 0, -p.z)) < 0) side.negate();   // on the camp's side of the road
  g.position.copy(p).addScaledVector(side, 1.05); g.position.y = groundHeight(g.position.x, g.position.z);
  // its face looks back down the road, toward the tree you come round (turned a little toward the glade, so it reads from there too)
  const n = d.clone().negate().lerp(GLADE.clone().sub(g.position).setY(0).normalize(), 0.3).normalize();
  g.rotation.y = Math.atan2(n.x, n.z);
  scene.add(g); return g;
}

// ---------------------------------------------------------------- who comes along: up to three of the camp's named sloths who are free
function riders() {
  const camp = sloths.filter((s) => s.name), free = camp.filter((s) => !s.asleep && !s.dozing && s.trip?.phase !== "held");
  const pick = (free.length ? free : camp).slice().sort(() => Math.random() - 0.5).slice(0, free.length ? 3 : 2);
  return pick.map((s) => s.name);
}
let her = null;
const herModel = () => her ??= fetch("karaoke/models/her.txt").then((r) => { if (!r.ok) throw new Error(`karaoke/models/her.txt ${r.status}`); return r.text(); })
  .then((txt) => new Promise((ok, err) => new GLTFLoader().parse(b64bytes(txt.trim()).buffer, "", ok, err)));
let asked = null, cooled = true, cut = null;
function ask() {
  if (cut || !card.hidden) return;
  asked = riders(); herModel().catch(() => {});
  const names = asked.length > 1 ? asked.slice(0, -1).join(", ") + " and " + asked.at(-1) : asked[0];
  card.querySelector("p").textContent = `${names} want${asked.length > 1 ? "" : "s"} to come along`;
  card.hidden = false; cooled = false;
}

// ---------------------------------------------------------------- the cut scene
function wagon() {   // the red toy wagon (prototype A), roomy enough for three babies in a row: an open bed (10 tris), 4 wheels with painted spokes on
  // two axles (Adriaen: it had none; 10 tris each), a long handle with a T grip; 214 tris
  const g = new THREE.Group(), red = lam(0xe0473c, { side: THREE.DoubleSide }), redD = lam(0xb33429), tyre = lam(0x2e2a2a);
  const add = (pw, ph, x, y, z, rx, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), red); m.position.set(x, y + 0.2, z); m.rotation.set(rx, ry, 0); g.add(m); };
  const L = 1.3, W = 0.72, H = 0.22;
  add(L, W, 0, 0, 0, -Math.PI / 2, 0); add(L, H, 0, H / 2, W / 2, 0, 0); add(L, H, 0, H / 2, -W / 2, 0, 0); add(W, H, L / 2, H / 2, 0, 0, Math.PI / 2); add(W, H, -L / 2, H / 2, 0, 0, Math.PI / 2);
  const spokes = canvasTex(128, 128, (c) => { c.fillStyle = "#2e2a2a"; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.fillStyle = "#e9e2d0"; c.beginPath(); c.arc(64, 64, 50, 0, 7); c.fill();
    c.strokeStyle = "#2e2a2a"; c.lineWidth = 9; for (let a = 0; a < 6; a++) { c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + 50 * Math.cos(a), 64 + 50 * Math.sin(a)); c.stroke(); } c.fillStyle = "#e0473c"; c.beginPath(); c.arc(64, 64, 13, 0, 7); c.fill(); });
  const cap = lam(0xffffff, { map: spokes }), wheels = [];
  for (const x of [0.45, -0.45]) { const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, W + 0.12, 5, 1, true), tyre); ax.rotation.x = Math.PI / 2; ax.position.set(x, 0.13, 0); g.add(ax); }
  for (const [x, z] of [[0.45, W / 2 + 0.04], [-0.45, W / 2 + 0.04], [0.45, -W / 2 - 0.04], [-0.45, -W / 2 - 0.04]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10), [tyre, cap, cap]); w.rotation.x = Math.PI / 2; w.position.set(x, 0.13, z); g.add(w); wheels.push(w); }
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.03, 0.03), redD); h.position.set(1.05, 0.47, 0); h.rotation.z = 0.594; g.add(h);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), tyre); grip.position.set(1.45, 0.74, 0); g.add(grip);
  g.userData = { tip: V(1.45, 0.74, 0), seats: [V(0.4, 0.21, 0), V(0, 0.21, 0), V(-0.4, 0.21, 0)], wheels };   // one behind the other, facing the way they go
  return g;
}
function person(src, anims) {   // a clone of a kit character walking (both share the kit rig, so the operator's walk clip drives her too)
  const o = kitLook(clone(src.scene));   // actor.js: the same look as the operator's
  const B = {}; o.traverse((n) => { if (n.isBone) B[n.name] = n; });
  const mixer = new THREE.AnimationMixer(o); mixer.clipAction(anims.find((a) => a.name === "walk")).play();
  const rest = []; o.traverse((n) => n.isBone && rest.push([n, n.quaternion.clone()]));
  scene.add(o); return { o, B, mixer, rest };
}
const noteTex = [];   // ♪ ♫ ♥ z, painted the first time a cut scene starts
function notes() {
  if (!noteTex.length) noteTex.push(...["♪", "♫", "♥", "z"].map((ch, i) => canvasTex(64, 64, (c) => { c.font = "bold 50px Trebuchet MS, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineWidth = 6; c.strokeStyle = "#fff"; c.strokeText(ch, 32, 34); c.fillStyle = ["#ff5f9e", "#8a5cff", "#ff8a3d", "#6a8fd8"][i]; c.fillText(ch, 32, 34); })));
  return noteTex;
}

const DUR = 6.2, SPEED = 0.85;   // seconds, m/s
// out: from partway down the road on, away from camp. home (Adriaen 2026-11-12: "Back to camp should go to another cut scene
// with the sloths and the wagon"): the same walk the other way, back toward the glade, with the sloths sleepy after the show,
// nodding off in the wagon under a few slow z's instead of notes.
async function start(names, home = false, said = names) {   // said: the riders the homeward toast names (the saved list)
  if (cut) return;
  document.body.classList.add("trip-cut");
  const [OP, ANIM, SLOTH, HER] = await Promise.all([PRE.operator, PRE.operatorAnims, PRE.sloth, herModel()]).catch(() => []);
  if (!OP || !HER) { document.body.classList.remove("trip-cut"); fade.classList.remove("on"); toast("The path is too dark right now"); return; }
  const w = wagon(); scene.add(w);
  const op = person(OP, ANIM.animations), pony = person(HER, ANIM.animations);
  const riding = names.map((n, i) => {
    const c = CAST.find((k) => k.name === n), o = clone(SLOTH.scene); o.scale.setScalar(1.6 * (c?.scale || 1));   // 0.36 m wide, 0.3 deep, 0.46 tall sitting: three fit in the bed without poking through
    furify(o, { shells: 3, lambert: true }); c?.dress?.(o.getObjectByName("head"), o);
    const mixer = new THREE.AnimationMixer(o); mixer.clipAction(SLOTH.animations.find((a) => a.name === "drive")).play(); mixer.setTime(0.2);
    const B = {}; o.traverse((q) => { if (q.isBone) B[q.name] = q; });
    const rest = []; o.traverse((q) => q.isBone && rest.push([q, q.quaternion.clone()]));
    const g = new THREE.Group(); g.add(o); o.rotation.y = -Math.PI / 2; g.position.copy(w.userData.seats[i]); w.add(g);
    return { o, g, B, rest, ph: i * 1.3 };
  });
  const tex = notes();
  const flying = Array.from({ length: 6 }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: home ? (i % 2 ? tex[3] : tex[i % 3]) : tex[i % 3], transparent: true, depthWrite: false, fog: false })); s.scale.setScalar(0.22); scene.add(s); return { s, ph: i / 6 }; });
  if (opApi) opApi.root.visible = false;   // he can't be in two places
  cut = { t: 0, w, op, pony, riding, notes: flying, names, said, home, dir: home ? -1 : 1, s0: (home ? 0.84 : 0.42) * LEN };
  if (home) tm.after(0.06, () => fade.classList.remove("on"));   // the page opened black; fade up on them
}
const frameAt = (s, dir = 1) => { const t = THREE.MathUtils.clamp(s / LEN, 0, 1), p = curve.getPointAt(t), d = curve.getTangentAt(t).multiplyScalar(dir); p.y = groundHeight(p.x, p.z); return { p, d, side: V(-d.z, 0, d.x).normalize() }; };   // d: the way they walk, side: their right
function place(o, s, off = 0, dir = 1) { const f = frameAt(s, dir); o.position.copy(f.p).addScaledVector(f.side, off); o.rotation.set(0, Math.atan2(f.d.x, f.d.z) + Math.PI, 0); return f; }   // the kit faces -Z
function cutStep(dt) {
  const c = cut; c.t += dt; const t = c.t, dir = c.dir, s = c.s0 + dir * t * SPEED;
  for (const k of [c.op, c.pony]) { k.rest.forEach(([n, q]) => n.quaternion.copy(q)); k.mixer.setTime(t * 0.9 + (k === c.pony ? 0.04 : 0)); }   // in step, as people holding hands fall into
  const f = place(c.op.o, s, 0.28, dir);   // the two of them walk in the middle of the road
  const inward = f.side.dot(V(-f.p.x, 0, -f.p.z)) > 0 ? 1 : -1;   // +1 when side points back toward the camp
  place(c.pony.o, s + 0.05 * dir, -0.28, dir);   // she walks close on his left (side is his right), holding his hand (Adriaen 2026-11-12)
  const fw = frameAt(s - 1.77 * dir, dir); c.w.position.copy(fw.p).addScaledVector(fw.side, 0.48); c.w.rotation.set(0, Math.atan2(-fw.d.z, fw.d.x), 0);   // the wagon's +X along the road, a little to his right so the handle comes up beside his hip
  c.w.rotation.z = Math.sin(t * 5.6) * 0.008; c.w.position.y += Math.abs(Math.sin(t * 5.6)) * 0.008;   // a little rattle on the road
  for (const wh of c.w.userData.wheels) wh.rotation.y = -t * SPEED / 0.13;
  scene.updateMatrixWorld(true);
  reach(c.op.B, "R", c.w.localToWorld(c.w.userData.tip.clone()), V(0, -0.4, 0).addScaledVector(f.d, -1));   // he pulls with his right hand hanging a little behind his hip, arm nearly straight, elbow back (Adriaen: the bent-up arm looked painful)
  { // and holds hers with his left: both hands meet halfway between them, low and a little ahead, swinging gently with the stride
    const hold = f.p.clone().addScaledVector(f.d, 0.12 + 0.05 * Math.sin(t * 0.9 * Math.PI * 2)).setY(f.p.y + 0.86);
    reach(c.op.B, "L", hold, V(0, -1, 0).addScaledVector(f.side, -0.5)); reach(c.pony.B, "R", hold, V(0, -1, 0).addScaledVector(f.side, 0.5));
  }
  { const k = Math.sin(t * 0.7); c.pony.B.neck.rotation.y += k > 0 ? 0.5 * k : 0.25 * k; c.pony.B.head.rotation.y += k > 0 ? 0.35 * k : 0.2 * k; }   // she looks back at the sloths, then over at him
  for (const r of c.riding) {   // sway side to side on the beat, a little out of step with each other, paws up, heads bobbing
    r.rest.forEach(([n, q]) => n.quaternion.copy(q));
    const b = t * (c.home ? 1.3 : 2.6) + r.ph, sw = c.home ? 0.4 : 1;   // home: slow and sleepy
    r.g.rotation.x = Math.sin(b) * 0.1 * sw;   // a sway small enough to stay inside the bed
    { const wz = V(Math.sin(c.w.rotation.y), 0, Math.cos(c.w.rotation.y)), toCam = camera.position.clone().sub(c.w.position).dot(wz) > 0 ? 1 : -1;
      r.o.rotation.y = -Math.PI / 2 - toCam * 0.35; }   // turned a little toward the camera, so you see their faces
    r.B.head.rotation.z += Math.sin(b + 0.6) * 0.25 * sw; r.B.head.rotation.x += c.home ? 0.35 + 0.12 * Math.max(0, Math.sin(b * 0.7)) : -0.15 + Math.sin(b * 2) * 0.08;   // home: heads droop, nodding off
    if (!c.home) for (const [sd, sg] of [["L", 1], ["R", -1]]) { const u = r.B["upper_arm" + sd]; if (u) { u.rotation.z += sg * (1.1 + 0.25 * Math.sin(b * 2 + sg)); u.rotation.x += -0.5; } }
  }
  c.notes.forEach((n, i) => { const k = (t * (c.home ? 0.22 : 0.35) + n.ph) % 1; n.s.position.copy(c.w.position).add(V(0, 0.95 + k * 1.0, 0)).addScaledVector(fw.d, 0.3 - k * 0.6 + Math.sin(k * 9 + i) * 0.15).addScaledVector(fw.side, (i % 3 - 1) * 0.25);
    n.s.material.opacity = Math.min(1, k * 5, (1 - k) * 3) * Math.min(1, t * 2); });
  // the camera: side on, tracking, from the camp's side of the road (landscape); three-quarter from ahead on an upright phone,
  // so both of them stay in the frame (the forest keeps both lines clear: layout.js cutSight). The near plane clips any leaf by the lens.
  const mid = frameAt(s - 0.5 * dir, dir), upright = innerWidth / innerHeight < 0.8;
  if (upright) camera.position.copy(mid.p).addScaledVector(mid.d, 5.0).addScaledVector(mid.side, 3.0 * inward).add(V(0, 1.8, 0));
  else camera.position.copy(mid.p).addScaledVector(mid.side, 6.0 * inward).addScaledVector(mid.d, 2.6).add(V(0, 1.35, 0));   // a little ahead of side on, so she isn't hidden behind him
  camera.near = 1.2; camera.fov = upright ? 60 : 34; camera.updateProjectionMatrix();
  camera.lookAt(mid.p.clone().add(V(0, upright ? 0.7 : 0.85, 0)).addScaledVector(mid.side, upright ? -0.45 * inward : 0).addScaledVector(mid.d, upright ? -0.4 : 0));
  if (t > DUR - 0.9) fade.classList.add("on");
  if (c.home && t > DUR && !c.left) { c.left = true; tm.after(0.75, endCut); return; }
  if (t > DUR && !c.left) {
    c.left = true;
    save("trip", { state: "out", riders: c.names, at: Date.now() }); flush();
    // the way back is the camp page's own address (on GitHub Pages and in the artifact it differs); ?tripstay: checks stay on the camp
    if (!OPT.tripstay) location.href = KARAOKE + "&back=" + encodeURIComponent(location.href.split("#")[0]);
    else tm.after(0.75, endCut);
  }
}
function endCut() {   // a cut scene is over: put the camp back as it was, and you by the sign
  const c = cut; if (!c) return;
  for (const o of [c.w, c.op.o, c.pony.o, ...c.notes.map((n) => n.s)]) scene.remove(o);
  if (opApi) opApi.root.visible = true;
  cut = null; camera.near = NEAR0; resize();   // input.js resize() puts the camera's fov back
  document.body.classList.remove("trip-cut"); fade.classList.remove("on");
  if (!c.home) return;
  const R = c.said;
  tm.after(0.5, () => toast(R.length ? `Back from karaoke with ${R.length > 1 ? R.slice(0, -1).join(", ") + " and " + R.at(-1) : R[0]} 🎤` : "Back from karaoke 🎤"));
}

// ---------------------------------------------------------------- buildTrip (main.js) and each frame
let homeDue = null;   // the homeward cut scene, due on the first frame after the camp has loaded: { show (who rides in the wagon), said (who the save says came) }
function buildTrip() {
  NEAR0 = camera.near;
  document.head.append(Object.assign(document.createElement("style"), { textContent: CSS }));
  el('<div class="trip-bar top"></div>'); el('<div class="trip-bar bot"></div>');
  fade = el('<div class="trip-fade"></div>');
  card = el('<div class="trip-ask" hidden role="dialog" aria-label="Go to karaoke?"><h2>Go to karaoke? 🎤</h2><p></p><button class="yes" type="button">Yes, let\'s go!</button><button class="no" type="button">Not now</button></div>');
  for (const ev of ["pointerdown", "pointerup"]) card.addEventListener(ev, (e) => e.stopPropagation());
  card.querySelector(".no").onclick = () => { card.hidden = true; };
  card.querySelector(".yes").onclick = () => { card.hidden = true; start(asked); };
  sign = makeSign();
  tripApi.sign = sign;
  console.info(`karaoke trip: sign ${trisIn(sign)} triangles; the road: ${roadForest.trunks} trunks, ${roadForest.verge?.clumps ?? 0} bushes (${roadForest.verge?.tris ?? 0} tris)`);
  const picks = []; sign.traverse((m) => m.isMesh && picks.push(m));
  const sph = new THREE.Sphere();
  addTarget("trip:sign", () => ({ look: sign.children[0], picks, at: (v) => { v.copy(sign.position).setY(sign.position.y + 0.9); return sph.set(v, 0.6); },
    tap: ask, ready: () => !cut && sign.position.distanceTo(me.pos) < 4.5, options: () => [["Go to karaoke? 🎤", ask]] }));
  // home from the karaoke stage (or the page was left mid-trip): stand by the sign, facing the glade
  const back = load("trip");
  if (back?.state === "back" || back?.state === "out") {
    const f = frameAt(SIGN_T * LEN + 1.2); me.pos.copy(f.p); me.yaw = Math.atan2(f.d.x, f.d.z); me.pitch = 0.02;
    save("trip", null);
    // with no riders saved, Hibi rides in the wagon, but the toast says only "Back from karaoke"
    if (back.state === "back") { const said = back.riders ?? []; homeDue = { show: said.length ? said : ["Hibi"], said }; fade.style.transition = "none"; fade.classList.add("on"); requestAnimationFrame(() => (fade.style.transition = "")); }
  }
}
function tripStep(dt) {
  tm.step(dt);
  if (!card) return false;   // not built
  if (homeDue) { const { show, said } = homeDue; homeDue = null; start(show, true, said); }
  if (cut) { cutStep(dt); return true; }
  // walking far enough down the road asks too; it asks again only after you have gone back toward the glade
  const [d] = polyDist(CUT_PTS, me.pos.x, me.pos.z);
  if (d < 1.2) {
    const at = nearestU(me.pos);
    if (at > 0.5 && cooled && card.hidden) ask();
    if (at < 0.3) cooled = true;
  } else cooled = true;
  return false;
}
function nearestU(p) { let best = 0, bd = 1e9; CUT_PTS.forEach((q, i) => { const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (dd < bd) { bd = dd; best = i / (CUT_PTS.length - 1); } }); return best; }
// for debug.js (window.__trip): ask the question, start a cut scene (names: the riders, or a fresh pick), the sign, the cut
// scene running (or null), whether the question is up, and the road's forest counts
const tripApi = { ask: () => ask(), start: (n, home) => start(n ?? riders(), home), sign: null, cut: () => cut, asking: () => !!card && !card.hidden, counts: roadForest };

export { buildTrip, tripApi, tripStep };
