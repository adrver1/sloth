// Canopy Camp radio (diegetic controls, Adriaen 2026-11-13): a little wooden valve radio on the snack table sets the music,
// instead of only the ⚙️ Sound button (which stays as a fallback). It lights up like the other things you can use; a tap
// opens the pill menu (shared with the jeep's radio, car.js): turn it on, next station (with a burst of static), quieter, louder, turn it off. The music comes from
// the radio (audio.musicFrom), so it is loudest by the table. While it plays, its dial window glows, the needle slides to
// the station and two music notes float up.
// Built here, painted on canvas: a box without a bottom (10), the needle (2), an aerial (6), two note cards (4): 22 triangles.
import * as THREE from "three";
import { canvasTex, scene } from "./core.js";
import { d0, t0 } from "./forest.js";
import { me } from "./player.js";
import { addTarget } from "./input.js";
import { toast } from "./hud.js";
import { audio } from "./audio.js";

const W = 0.3, H = 0.19, Dp = 0.13, lam = (o) => new THREE.MeshLambertMaterial(o);
const N = audio.stations.length, DIAL = { x0: -0.105, x1: 0.105, y: 0.035 };   // the dial window on the front, in metres from its middle
// the front: walnut case, a cloth speaker grille, the dial window with a mark per station, two knobs
const front = canvasTex(256, 160, (c, w, h) => {
  c.fillStyle = "#7a4a2c"; c.fillRect(0, 0, w, h); c.fillStyle = "#8f5a36"; c.fillRect(6, 6, w - 12, h - 12);
  c.fillStyle = "#d9c49a"; c.beginPath(); c.roundRect(18, 76, 150, 72, 12); c.fill();                      // the grille cloth
  c.strokeStyle = "#b39a6e"; c.lineWidth = 3; for (let x = 26; x < 168; x += 9) { c.beginPath(); c.moveTo(x, 80); c.lineTo(x, 144); c.stroke(); }
  c.fillStyle = "#f3e2b0"; c.beginPath(); c.roundRect(40, 18, 176, 40, 10); c.fill();                      // the dial window
  c.fillStyle = "#6b4630"; c.font = "600 20px Fredoka, Trebuchet MS, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  audio.stations.forEach((s, i) => { const x = 40 + 22 + i * (176 - 44) / (N - 1); c.fillRect(x - 1.5, 22, 3, 8); c.fillText(s.emoji, x, 44); });
  for (const x of [196, 228]) { c.fillStyle = "#3d2a1d"; c.beginPath(); c.arc(x - 6, 112, 15, 0, 7); c.fill(); c.fillStyle = "#c9a86a"; c.beginPath(); c.arc(x - 6, 112, 5, 0, 7); c.fill(); }
});
// the glow of the dial lamp: only the window lights up
const glowMap = canvasTex(256, 160, (c, w, h) => { c.fillStyle = "#000"; c.fillRect(0, 0, w, h); c.fillStyle = "#ffb347"; c.beginPath(); c.roundRect(40, 18, 176, 40, 10); c.fill(); });
const wood = lam({ color: 0x7a4a2c }), face = lam({ map: front, emissive: 0xffffff, emissiveMap: glowMap, emissiveIntensity: 0 });
// a box without a bottom: BoxGeometry's groups are +x, -x, +y, -y, +z, -z; drop -y and paint +z
const box = new THREE.BoxGeometry(W, H, Dp); box.groups.splice(3, 1);
const radio = new THREE.Mesh(box, [wood, wood, wood, face, wood]);   // after the splice: +x, -x, +y, +z, -z
box.groups.forEach((g, i) => (g.materialIndex = i));
const needle = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.034), lam({ color: 0xd2343f }));
needle.position.set(0, DIAL.y, Dp / 2 + 0.002); radio.add(needle);
const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.32, 3, 1, true).translate(0, 0.16, 0), lam({ color: 0x9a9a9a }));
aerial.position.set(W / 2 - 0.03, H / 2, -0.02); aerial.rotation.z = -0.5; radio.add(aerial);
const noteTex = canvasTex(64, 64, (c) => { c.fillStyle = "#fff8ee"; c.font = "700 48px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.shadowColor = "#8a5a3b"; c.shadowBlur = 4; c.fillText("♪", 32, 34); });
const notes = [0, 1].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, transparent: true, opacity: 0, depthWrite: false })); s.scale.setScalar(0.09); radio.add(s); return s; });
// on the near end of the snack table, its front to the fire
{
  const tb = window.__camp.tb, table = scene.getObjectByName("Table"), top = table ? new THREE.Box3().setFromObject(table).max.y : 0.75;
  const at = tb.clone().addScaledVector(d0, -0.4).addScaledVector(t0, -0.1);
  radio.position.set(at.x, top + H / 2, at.z); radio.rotation.y = Math.atan2(-at.x, -at.z) + 0.25;
}
radio.name = "Radio"; scene.add(radio);
{ let n = 0; radio.traverse((m) => { if (m.isMesh || m.isSprite) n += m.isSprite ? 2 : (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); console.log(`LOG radio: ${n} tris`); }
audio.musicFrom(radio);

let source = radio;   // the radio the music comes from (the last one you used)
// the menu, shared with the jeep's radio (car.js): using a radio moves the music to it
const playing = () => { const s = audio.state(); return s.music && !s.muted; };
const say = () => { const s = audio.station(); toast(`${s.emoji} ${s.name}`); };
function radioOptions(src) {
  audio.start();
  const use = (fn) => () => { audio.musicFrom(src); source = src; fn(); };
  if (!playing()) return [["Turn the radio on 📻", use(() => { audio.muted(false); audio.music(true); say(); })]];
  const v = audio.musicVolume(), nx = audio.stations[(audio.stations.findIndex((s) => s.id === audio.station().id) + 1) % N];
  return [[`Next: ${nx.name} ${nx.emoji}`, use(() => { audio.next(); say(); })],
    ...(v > 0.12 ? [["Quieter 🔉", use(() => { audio.musicVolume(v - 0.15); toast("Quieter 🔉"); })]] : []),
    ...(v < 0.98 ? [["Louder 🔊", use(() => { audio.musicVolume(v + 0.15); toast("Louder 🔊"); })]] : []),
    ["Turn it off 📴", () => { audio.music(false); toast("Radio off"); }]];
}
{
  const picks = [radio], sph = new THREE.Sphere(), tmp = new THREE.Vector3();
  const at = (v) => { radio.getWorldPosition(v); sph.center.copy(v); sph.radius = 0.25; return sph; };
  addTarget(radio, () => ({ look: radio, picks, at, ready: () => at(tmp).center.distanceTo(me.pos) < 3.5, options: () => radioOptions(radio) }));
}

// the dial lamp, the needle and the notes follow the radio's state
let lamp = 0, nx = 0, t = 0;
function step(dt) {
  t += dt; const on = playing() && audio.state().started && source === radio, i = audio.stations.findIndex((s) => s.id === audio.station().id);
  lamp += ((on ? 1 : 0) - lamp) * Math.min(1, dt * 4); face.emissiveIntensity = 0.7 * lamp;
  const x = DIAL.x0 + (DIAL.x1 - DIAL.x0) * (i / (N - 1)); nx += (x - nx) * Math.min(1, dt * 5); needle.position.x = nx;
  notes.forEach((s, k) => { const f = (t * 0.45 + k * 0.5) % 1; s.position.set(-0.05 + k * 0.08 + Math.sin((f + k) * 6) * 0.02, H / 2 + 0.03 + f * 0.25, 0.02); s.material.opacity = lamp * Math.sin(f * Math.PI) * (0.6 + 0.4 * (audio.musicVolume() > 0.3)); });
  radio.scale.y = 1 + lamp * 0.012 * Math.max(0, Math.sin(t * 9));   // a tiny bob to the music
}
window.__radio = radio;
const radioSource = () => source;
export { radioSource, playing as radioPlaying, radioOptions, step as radioStep };
