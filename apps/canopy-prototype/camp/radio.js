// Canopy Camp radio (diegetic controls, Adriaen 2026-11-13): a little wooden valve radio on the snack table sets the music,
// instead of only the ⚙️ Sound button (which stays as a fallback). It lights up like the other things you can use; a tap
// opens the pill menu (shared with the jeep's radio, car.js): turn it on, next station (with a burst of static), quieter, louder, turn it off. The music comes from
// the radio (audio.musicFrom), so it is loudest by the table. While it plays, its dial window glows, the needle slides to
// the station and two music notes float up.
// Built here, painted on canvas: a box without a bottom (10), the needle (2), an aerial (6), two note cards (4): 22 triangles, in two draws (the case with its aerial, the needle) and the notes while it plays.
// Both levels have this radio (Adriaen 2026-11-15: the summit's porch radio is the camp's): buildRadio({ scene, audio, place })
// takes the level's scene (the radio stands in it, in world terms), its sound (audio/api.js makeAudio) and place(radio, H, W, Dp)
// to stand it (the camp's: onTable, on the snack table, once the props stand). radioStep(dt) runs each frame (the page's
// main.js); for the jeep's radio (car.js): radioOptions(source) (the menu), radioPlaying() and radioSource() (which radio the
// music comes from).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { V, canvasTex, lam, yawTo } from "./util.js";
import { TABLE } from "./layout.js";
import { me } from "./player.js";
import { addTarget } from "./targets.js";
import { toast } from "./hud.js";
import { toStage } from "./stage.js";

const W = 0.3, H = 0.19, Dp = 0.13;
const DIAL = { x0: -0.105, x1: 0.105, y: 0.035 };   // the dial window on the front, in metres from its middle
let radio, face, needle, notes, source, audio;   // built by buildRadio; source: the radio the music comes from (the last one you used)
function buildRadio({ scene, audio: sound, place = onTable }) {
  audio = sound;
  // the front: walnut case, a cloth speaker grille, the dial window with a mark per station, two knobs
  // The case and the aerial take their colour from swatches below the front (rows 160 to 192), so the whole radio but the needle
  // is one mesh with one material, one draw (Adriaen 2026-11-15, "gotta get those draws down"; it was 6)
  const front = canvasTex(256, 192, (c, w) => {
    const h = 160; c.fillStyle = "#7a4a2c"; c.fillRect(0, 0, w, 192); c.fillStyle = "#9a9a9a"; c.fillRect(128, 164, 128, 28);
    c.fillStyle = "#7a4a2c"; c.fillRect(0, 0, w, h); c.fillStyle = "#8f5a36"; c.fillRect(6, 6, w - 12, h - 12);
    c.fillStyle = "#d9c49a"; c.beginPath(); c.roundRect(18, 76, 150, 72, 12); c.fill();                      // the grille cloth
    c.strokeStyle = "#b39a6e"; c.lineWidth = 3; for (let x = 26; x < 168; x += 9) { c.beginPath(); c.moveTo(x, 80); c.lineTo(x, 144); c.stroke(); }
    c.fillStyle = "#f3e2b0"; c.beginPath(); c.roundRect(40, 18, 176, 40, 10); c.fill();                      // the dial window
    c.fillStyle = "#6b4630"; c.font = "600 20px Fredoka, Trebuchet MS, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    audio.stations.forEach((s, i) => { const x = 40 + 22 + i * (176 - 44) / (audio.stations.length - 1); c.fillRect(x - 1.5, 22, 3, 8); c.fillText(s.emoji, x, 44); });
    for (const x of [196, 228]) { c.fillStyle = "#3d2a1d"; c.beginPath(); c.arc(x - 6, 112, 15, 0, 7); c.fill(); c.fillStyle = "#c9a86a"; c.beginPath(); c.arc(x - 6, 112, 5, 0, 7); c.fill(); }
  });
  // the glow of the dial lamp: only the window lights up
  const glowMap = canvasTex(256, 192, (c, w) => { c.fillStyle = "#000"; c.fillRect(0, 0, w, 192); c.fillStyle = "#ffb347"; c.beginPath(); c.roundRect(40, 18, 176, 40, 10); c.fill(); });
  face = new THREE.MeshLambertMaterial({ map: front, emissive: 0xffffff, emissiveMap: glowMap, emissiveIntensity: 0 });
  // a box without a bottom: BoxGeometry's faces are +x, -x, +y, -y, +z, -z, 4 vertices and 6 indices each; drop -y, the front
  // (+z) shows the painted front (the canvas's top 160 rows), the other faces the wood swatch
  const box = new THREE.BoxGeometry(W, H, Dp), uv = box.attributes.uv, TOPV = 1 - 160 / 192;
  for (let i = 0; i < 24; i++) if (i >= 16 && i < 20) uv.setY(i, TOPV + uv.getY(i) * (1 - TOPV)); else uv.setXY(i, 0.25, 0.04);
  box.setIndex([...box.index.array.slice(0, 18), ...box.index.array.slice(24)]); box.clearGroups();
  const aerial = new THREE.CylinderGeometry(0.003, 0.004, 0.32, 3, 1, true).translate(0, 0.16, 0)
    .applyMatrix4(new THREE.Matrix4().compose(V(W / 2 - 0.03, H / 2, -0.02), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.5), V(1, 1, 1)));
  for (let i = 0; i < aerial.attributes.uv.count; i++) aerial.attributes.uv.setXY(i, 0.75, 0.04);   // the grey swatch
  radio = new THREE.Mesh(mergeGeometries([box, aerial]), face);
  needle = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.034), lam(0xd2343f));
  needle.position.set(0, DIAL.y, Dp / 2 + 0.002); radio.add(needle);
  const noteTex = canvasTex(64, 64, (c) => { c.fillStyle = "#fff8ee"; c.font = "700 48px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.shadowColor = "#8a5a3b"; c.shadowBlur = 4; c.fillText("♪", 32, 34); });
  notes = [0, 1].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, transparent: true, opacity: 0, depthWrite: false })); s.scale.setScalar(0.09); radio.add(s); return s; });
  place(radio, scene);
  radio.name = "Radio"; scene.add(radio);
  { let n = 0; radio.traverse((m) => { if (m.isMesh || m.isSprite) n += m.isSprite ? 2 : (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); console.log(`LOG radio: ${n} tris`); }
  audio.musicFrom(radio); source = radio;
  // it lights up and opens the menu
  {
    const picks = [radio], sph = new THREE.Sphere(), tmp = new THREE.Vector3();
    const at = (v) => { radio.getWorldPosition(v); toStage(v); sph.center.copy(v); sph.radius = 0.25; return sph; };   // in the stage's frame, as every target
    addTarget(radio, () => ({ look: radio, picks, at, ready: () => radio.getWorldPosition(tmp).distanceTo(me.pos) < 3.5, options: () => radioOptions(radio) }));
  }
}

// the camp's place: on the snack table, its front to the fire
function onTable(radio, scene) {
  const tb = TABLE.at, table = scene.getObjectByName("Table");
  // the table's far end from where it was (Adriaen 2026-11-13: more to the left, there's more room), past the fruit bowl:
  // 0.42 m along its long side (table local +x, the table is turned by layout.js TABLE.yaw), at its middle across
  const ty = TABLE.yaw, at = tb.clone().add(V(0.42 * Math.cos(ty) - 0.03 * Math.sin(ty), 0, -0.42 * Math.sin(ty) - 0.03 * Math.cos(ty)));
  radio.rotation.y = yawTo(at) - 0.2;
  // stood on the planks under it (Adriaen 2026-11-13: it floated, sat on the fruit's height): the highest plank under each
  // corner of its base, found by a ray down, so it sits flush and doesn't hang over a gap between planks
  let top = 0.63;
  if (table) {
    table.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(), down = V(0, -1, 0), c = Math.cos(radio.rotation.y), s = Math.sin(radio.rotation.y), ys = [];
    for (const [x, z] of [[-W / 2, -Dp / 2], [W / 2, -Dp / 2], [-W / 2, Dp / 2], [W / 2, Dp / 2], [0, 0]]) {
      rc.set(V(at.x + x * c + z * s, 2, at.z - x * s + z * c), down);
      const hit = rc.intersectObject(table, true)[0]; if (hit) ys.push(hit.point.y);
    }
    if (ys.length) top = Math.max(...ys);
  }
  radio.position.set(at.x, top + H / 2, at.z);
}

// the menu, shared with the jeep's radio (car.js): using a radio moves the music to it
const playing = () => audio.playing();
const say = () => { const s = audio.station(); toast(`${s.emoji} ${s.name}`); };
function radioOptions(src) {
  audio.start();
  const use = (fn) => () => { audio.musicFrom(src); source = src; fn(); };
  if (!playing()) return [["Turn the radio on 📻", use(() => { audio.muted(false); audio.music(true); say(); })]];
  const v = audio.musicVolume(), nx = audio.stations[(audio.stationIndex() + 1) % audio.stations.length];
  return [[`Next: ${nx.name} ${nx.emoji}`, use(() => { audio.next(); say(); })],
    ...(v > 0.12 ? [["Quieter 🔉", use(() => { audio.musicVolume(v - 0.15); toast("Quieter 🔉"); })]] : []),
    ...(v < 0.98 ? [["Louder 🔊", use(() => { audio.musicVolume(v + 0.15); toast("Louder 🔊"); })]] : []),
    ["Turn it off 📴", () => { audio.music(false); toast("Radio off"); }]];
}

// the dial lamp, the needle and the notes follow the radio's state; each frame, so it makes no objects (review R2-085)
let lamp = 0, nx = 0, t = 0;
function step(dt) {
  t += dt; const on = source === radio && audio.playing() && audio.running(), i = audio.stationIndex();
  lamp += ((on ? 1 : 0) - lamp) * Math.min(1, dt * 4); face.emissiveIntensity = 0.7 * lamp;
  const x = DIAL.x0 + (DIAL.x1 - DIAL.x0) * (i / (audio.stations.length - 1)); nx += (x - nx) * Math.min(1, dt * 5); needle.position.x = nx;
  const loud = 0.6 + 0.4 * (audio.musicVolume() > 0.3);
  for (let k = 0; k < notes.length; k++) { const s = notes[k], f = (t * 0.45 + k * 0.5) % 1; s.position.set(-0.05 + k * 0.08 + Math.sin((f + k) * 6) * 0.02, H / 2 + 0.03 + f * 0.25, 0.02); s.material.opacity = lamp * Math.sin(f * Math.PI) * loud; s.visible = lamp > 0.01; }   // hidden while off: no draw at opacity 0 (R2-087)
  radio.scale.y = 1 + lamp * 0.012 * Math.max(0, Math.sin(t * 9));   // a tiny bob to the music
}
const radioSource = () => source;
export const RADIO_SIZE = { W, H, D: Dp };   // its width, height and depth (m), for a level's place()
export { buildRadio, radio, radioSource, playing as radioPlaying, radioOptions, step as radioStep };   // radio: the prop (the scenarios read it)
