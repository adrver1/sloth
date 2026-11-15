// Canopy Camp drive to the Summit Cabin (Adriaen 2026-11-15, plan in the project files, canopy-hide-and-seek/summit-level/plan.md):
// "Drive to the summit" on the jeep's key (car.js) plays the first of the drive's two shots, the jeep leaving the jungle: it
// comes round the bend from the clearing and up the muddy track (layout.js JEEP_TRACK) past the camera into the trees. Then
// summit.html loads, which plays the second shot (the jeep out of the tunnel onto the bridge, summit/drive.js). On the way home
// summit.html sends you back here with ?from=summit (core.js OPT.from), and the shot plays the other way: the jeep comes down the
// track into the camp, and you stand by its door. A tap skips a shot. ?drivestay (core.js OPT) ends the shot on the camp instead
// of going on to the summit, for checks.
// Exports buildDrive() (main.js, once the jeep and the input are built), driveStep(dt) (main.js, each frame after the player
// has moved: the shot takes the camera), and driveApi { away(), home(), shot() } for car.js (and checks, which import this module).
// Adds no triangles: the jeep itself drives. The letterbox and fade are two page elements.
import { OPT, camera } from "./core.js";
import { V, yawTo } from "./util.js";
import { JEEP_TRACK } from "./layout.js";
import { groundHeight } from "./terrain.js";
import { me } from "./player.js";
import { resize } from "./input.js";
import { jeepApi } from "./jeep.js";

const SUMMIT = "summit.html";
const CSS = `
.drive-bar { position: fixed; left: 0; right: 0; height: 0; background: #000; transition: height .6s ease; z-index: 20; pointer-events: none; }
.drive-bar.top { top: 0 } .drive-bar.bot { bottom: 0 }
body.drive-cut .drive-bar { height: 11vh; }
body.drive-cut .stick, body.drive-cut .bar, body.drive-cut .hud, body.drive-cut #q, body.drive-cut #toast { visibility: hidden; }
.drive-fade { position: fixed; inset: 0; background: #000; opacity: 0; transition: opacity .7s; z-index: 21; pointer-events: none; }
.drive-fade.on { opacity: 1; }
.drive-skip { position: fixed; inset: 0; z-index: 22; }
`;
const curve = JEEP_TRACK.curve, LEN = curve.getLength();
const DUR = 5;   // seconds a shot lasts
const S0 = 0.3 * LEN, S1 = 0.85 * LEN;   // the jeep's stretch: from just out of the clearing to where the track bends out of sight into the trees (the world ends at FAR)
let shot = null, fade = null, skip = null, NEAR0 = 0.1, parked = null;

// a point on the track s metres from the clearing (past its end it carries on straight), with the way it runs
function trackAt(s) {
  const t = Math.min(1, Math.max(0, s / LEN)), p = curve.getPointAt(t), d = curve.getTangentAt(t).setY(0).normalize();
  if (s > LEN) p.addScaledVector(d, s - LEN);
  p.y = groundHeight(p.x, p.z); return { p, d };
}
// the jeep's speed picks up as it leaves (away) and slows as it arrives (home): s from the time into the shot
const along = (t, home) => { const k = Math.min(1, t / DUR); return home ? S1 + (S0 - S1) * (1 - (1 - k) ** 2) : S0 + (S1 - S0) * k * k; };

function start(home) {
  if (shot || !jeepApi) return;
  const j = jeepApi.node;
  parked = { p: j.position.clone(), q: j.quaternion.clone() };
  for (const w of ["P", "D", "B"]) jeepApi.close(w);
  // the camera stands on the track where it leaves the clearing, high enough to see over the verge bushes, and turns to follow the jeep as
  // it drives off up the track and round the bend into the trees (home: as it comes down toward you and stops). The near plane
  // (1.5 m) clips the verge leaves by the lens.
  const cam = trackAt(0.12 * LEN).p.add(V(0, 3.4, 0));
  shot = { t: 0, home, cam, left: false };
  document.body.classList.add("drive-cut"); skip.hidden = false;
}
function step(dt) {
  const c = shot; c.t += dt;
  const j = jeepApi.node, s = along(c.t, c.home), f = trackAt(s);
  j.position.copy(f.p); j.rotation.set(0, Math.atan2(f.d.x, f.d.z) + (c.home ? Math.PI : 0), 0);   // the jeep's +Z is its front
  j.position.y += Math.abs(Math.sin(c.t * 9)) * 0.015;   // the bumps of the track
  if (jeepApi.lod) { jeepApi.lod.position.copy(j.position); jeepApi.lod.rotation.copy(j.rotation); }
  const upright = innerWidth / innerHeight < 0.8;
  camera.position.copy(c.cam); camera.near = 1.5; camera.fov = upright ? 62 : 40; camera.updateProjectionMatrix();
  camera.lookAt(j.position.x, j.position.y + 1.0, j.position.z);
  if (c.t > DUR - 0.8) fade.classList.add("on");
  if (c.t > DUR && !c.left) end();
}
function end() {
  const c = shot; c.left = true;
  if (!c.home && !OPT.drivestay) { location.href = SUMMIT + "?back=" + encodeURIComponent(location.href.split("#")[0].replace(/[?&]from=summit\b/, "")); return; }
  const j = jeepApi.node; j.position.copy(parked.p); j.quaternion.copy(parked.q);
  if (jeepApi.lod) { jeepApi.lod.position.copy(parked.p); jeepApi.lod.quaternion.copy(parked.q); }
  if (c.home) {   // you climb out by the driver's door, looking toward the fire
    const sill = jeepApi.sill, out = sill.clone().sub(j.position).setY(0).normalize();
    me.pos.copy(sill).addScaledVector(out, 0.7).setY(0); me.yaw = yawTo(V(-me.pos.x, 0, -me.pos.z)); me.pitch = 0.04;
  }
  shot = null; camera.near = NEAR0; resize();
  document.body.classList.remove("drive-cut"); skip.hidden = true;
  fade.classList.remove("on");   // its transition fades the view back in
}

function buildDrive() {
  NEAR0 = camera.near;
  if (!jeepApi) return;   // ?jeep=none
  document.head.append(Object.assign(document.createElement("style"), { textContent: CSS }));
  for (const k of ["top", "bot"]) document.body.append(Object.assign(document.createElement("div"), { className: `drive-bar ${k}` }));
  fade = Object.assign(document.createElement("div"), { className: "drive-fade" }); document.body.append(fade);
  skip = Object.assign(document.createElement("div"), { className: "drive-skip", hidden: true, title: "Tap to skip" }); document.body.append(skip);
  skip.addEventListener("pointerdown", (e) => { e.stopPropagation(); if (shot && !shot.left) { shot.t = Math.max(shot.t, DUR - 0.8); } });
  if (OPT.from === "summit") {   // home from the summit: start dark, and play the jeep's arrival on the first frame
    history.replaceState(null, "", location.href.replace(/([?&])from=summit&?/, "$1").replace(/[?&]$/, ""));
    fade.style.transition = "none"; fade.classList.add("on"); requestAnimationFrame(() => { fade.style.transition = ""; fade.classList.remove("on"); });
    homeDue = true;
  }
}
let homeDue = false;
function driveStep(dt) {
  if (homeDue) { homeDue = false; start(true); }
  if (!shot) return false;
  step(dt); return true;
}
const driveApi = { away: () => start(false), home: () => start(true), shot: () => shot };

export { buildDrive, driveApi, driveStep };
