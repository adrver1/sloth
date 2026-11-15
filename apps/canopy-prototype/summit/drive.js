// Summit Cabin drive (Adriaen 2026-11-15, plan in the project files, canopy-hide-and-seek/summit-level/plan.md): the second of
// the drive's two shots. Come from the camp (camp/drive.js sends you here with ?back=<the camp's address>), the jeep drives out
// of the tunnel onto the bridge, past the camera, and you then stand by it where it is parked at the head of the road. Near the
// parked jeep a "Drive back to camp" pill plays the way home: the jeep drives along the bridge into the tunnel, and the camp
// loads with ?from=summit, where its arrival plays. A tap skips a shot. ?drivestay (land.js OPT) ends the way home here, for checks.
// Exports buildDrive() (main.js, once the jeep's group exists), driveStep(dt) (main.js, each frame right after walk: the shot
// takes the camera, and holds you where the camera is so the ground and trees round it are the near ones), and driveApi
// { away(), home(), shot() } for checks, which import this module.
// The parked jeep itself drives, with everyone in it: camp/riders.js, the same as the camp's drive (him at the wheel, you, and
// the seven sloths in their winter gear; clones only while a shot plays). Arriving, the shot waits (dark) until the cast is
// built, at most 10 s. The letterbox, fade, skip layer and pill are page elements.
import { $, BARE, JEEP, OPT, ROAD, ROAD_Y, TOP, groundAt } from './land.js';
import { camera, me } from './core.js';
import { wheelsOf } from '../camp/util.js';
import { lifeHooks } from './life.js';

const CSS = `
.drive-bar { position: fixed; left: 0; right: 0; height: 0; background: #000; transition: height .6s ease; z-index: 20; pointer-events: none; }
.drive-bar.top { top: 0 } .drive-bar.bot { bottom: 0 }
body.drive-cut .drive-bar { height: 11vh; }
body.drive-cut #hud, body.drive-cut #hint, body.drive-cut #stats, body.drive-cut #stick, body.drive-cut #run, body.drive-cut #carry, body.drive-cut #bearing { visibility: hidden; }
.drive-fade { position: fixed; inset: 0; background: #000; opacity: 0; transition: opacity .7s; z-index: 21; pointer-events: none; }
.drive-fade.on { opacity: 1; }
.drive-skip { position: fixed; inset: 0; z-index: 22; }
`;
const DUR = 6;   // seconds a shot lasts
const P = ROAD.portal.s;
let shot = null, fade = null, skip = null, pill = null, homeDue = false, spin = null, boarding = false, waited = 0;

// the road s metres from the summit (it ends in the tunnel at P): where, its height, and the way toward the tunnel
function roadAt(s) {
  const pts = ROAD.pts, i = Math.max(0, Math.min(pts.length - 2, Math.floor(s / 2))), a = pts[i], b = pts[i + 1], k = (s - a[2]) / (b[2] - a[2]);
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
  return { x: a[0] + dx * k, z: a[1] + dz * k, y: ROAD_Y(s), dx: dx / l, dz: dz / l };
}
// arriving, the jeep comes out of the tunnel fast and slows down the bridge; leaving, it speeds up toward the tunnel
const along = (t, out) => { const k = Math.min(1, t / DUR); return out ? P + 8 - 78 * (1 - (1 - k) ** 2) : P - 95 + 97 * k * k; };

async function start(out) {   // out: arriving from the camp (the jeep comes OUT of the tunnel)
  if (shot || boarding || !JEEP.node) return;
  boarding = true;   // everyone gets in first (imported here, not statically: the cast's modules load after castStage.js, life.js)
  const riders = await import('../camp/riders.js').then((m) => m.boardRiders(JEEP.node)).catch((e) => { console.warn('riders', e); return null; }); boarding = false;
  // the camera hangs over the gorge beside the bridge (on the side away from the cliff), 6 m out and 2.5 m up, where the
  // arriving jeep passes it as it slows, or the leaving one as it speeds up, and turns to follow the jeep
  const r = roadAt(out ? P - 62 : P - 50), cam = { x: r.x + r.dz * 6, y: r.y + 2.5, z: r.z - r.dx * 6 };
  spin ??= wheelsOf(JEEP.node);
  shot = { t: 0, out, cam, left: false, s: along(0, out), riders };
  document.body.classList.add('drive-cut'); skip.hidden = false;
  if (out) fade.classList.remove('on');   // the page opened dark; its transition fades up on the jeep coming out of the tunnel
}
function step(dt) {
  const c = shot; c.t += dt;
  const g = JEEP.node, s = along(c.t, c.out), r = roadAt(s), dir = c.out ? -1 : 1;   // arriving it faces away from the tunnel
  spin(dir * (s - c.s)); c.s = s;   // the wheels turn with the way driven
  c.riders?.step(dt);
  g.position.set(r.x, r.y + Math.abs(Math.sin(c.t * 9)) * 0.012, r.z); g.rotation.set(0, Math.atan2(r.dx * dir, r.dz * dir), 0);   // the jeep's +Z is its front
  me.x = c.cam.x; me.z = c.cam.z; me.y = c.cam.y;   // the near ground and trees follow the camera
  const upright = innerWidth / innerHeight < 0.8;
  camera.position.set(c.cam.x, c.cam.y, c.cam.z); camera.fov = upright ? 62 : 40; camera.updateProjectionMatrix();
  camera.lookAt(g.position.x, g.position.y + 1.0, g.position.z);
  if (c.t > DUR - 0.8) fade.classList.add('on');
  if (c.t > DUR && !c.left) end();
}
function end() {
  const c = shot; c.left = true;
  const g = JEEP.node; g.position.set(JEEP.x, TOP, JEEP.z); g.rotation.set(0, JEEP.turn, 0);
  if (!c.out && !OPT.drivestay) { location.href = OPT.back + (OPT.back.includes('?') ? '&' : '?') + 'from=summit'; return; }
  // you stand by the driver's door (the jeep's +X side), facing past the cabin's porch corner to the view south
  const sx = Math.sin(JEEP.turn), cx = Math.cos(JEEP.turn), lx = 1.9, lz = 0.4;
  me.x = JEEP.x + lx * cx + lz * sx; me.z = JEEP.z - lx * sx + lz * cx; me.y = groundAt(me.x, me.z) + 1.65;
  me.yaw = Math.atan2(me.x, me.z + 10); me.pitch = -0.08;
  c.riders?.remove();   // everyone is out at the summit
  camera.fov = 60; camera.updateProjectionMatrix();
  shot = null; document.body.classList.remove('drive-cut'); skip.hidden = true;
  fade.classList.remove('on');   // its transition fades the view back in
}

export function buildDrive() {
  if (BARE) return;
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
  for (const k of ['top', 'bot']) document.body.append(Object.assign(document.createElement('div'), { className: `drive-bar ${k}` }));
  fade = Object.assign(document.createElement('div'), { className: 'drive-fade' }); document.body.append(fade);
  skip = Object.assign(document.createElement('div'), { className: 'drive-skip', hidden: true, title: 'Tap to skip' }); document.body.append(skip);
  skip.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (shot && !shot.left) shot.t = Math.max(shot.t, DUR - 0.8); });
  pill = Object.assign(document.createElement('button'), { className: 'panel pill', textContent: '🚙 Drive back to camp', hidden: true });
  pill.onclick = (e) => { e.stopPropagation(); start(false); }; $('carry').append(pill);
  if (OPT.from) {   // come from the camp: start dark, and play the jeep's arrival on the first frame
    history.replaceState(null, '', location.href.replace(/([?&])back=[^&#]*&?/, '$1').replace(/[?&]$/, ''));
    fade.style.transition = 'none'; fade.classList.add('on'); requestAnimationFrame(() => { fade.style.transition = ''; });   // start() fades up once everyone is in
    homeDue = true;
  }
}
// each frame, right after walk(): a shot takes the camera; otherwise the pill shows while you stand by the parked jeep
export function driveStep(dt) {
  if (!fade) return false;
  if (homeDue && JEEP.node && ((lifeHooks.op && lifeHooks.sloths) || (waited += dt) > 10)) { homeDue = false; start(true); }
  if (shot) { step(dt); return true; }
  pill.hidden = Math.hypot(me.x - JEEP.x, me.z - JEEP.z) > 5;
  return false;
}
export const driveApi = { away: () => start(false), home: () => start(true), shot: () => shot };
