// The map and compass on the jeep's bonnet, the same in both levels (Adriaen 2026-11-15: "put the map and compass from the
// mountain in the jungle camp"; summit 2026-11-14: "I need a compass so I can tell you which points I'm referring to").
// They lie on the bonnet and light up like every other thing you can use (targets.js): tap them and their menu offers "Take
// the map and compass". You then hold the compass low right and the map low left, with two pills: "Look at the map" (M)
// raises the map in front of you, "Put it back" (Q) lays them back on the bonnet. A readout under them gives your bearing
// and grid square. The map is north-up with a lettered grid (columns A to H west to east, rows 1 to 8 north to south), so a
// spot can be named as "D3". North is +z and east -x in both levels.
// buildMapCompass({ scene, camera, map, paint, lit }) -> { step(dt, bright), setHood(jeep), setHeld(v), hoodAt, held }:
//   map    { cx, cz, S, PX, G }: the square the map covers (centre, metres across), its canvas size and grid squares across
//   paint  paint(kit): the level's own drawing of its ground and places (summit/map.js, camp/campMap.js), done the first time
//          the map is needed; kit is { g, W, uv(x, z), line(pts, col, width, dash), tag(text, u, v, size, col), spot(x, z,
//          label, dx, dy, mark, size), grid() }, and the north arrow, scale bar and frame are added after it
//   lit    lit(opts): the level's lit material for the copy on the bonnet (the summit's fog, the camp's plain Lambert)
//   setHood(jeep), once the jeep has loaded and after rigJeep (so its merged copy leaves these out): lays them on the bonnet,
//   on the Hood node, so they ride up with it when it opens; dropHoodMap(jeep), before rigJeep, takes the jeep model's own
//   painted map off the bonnet. step(dt, bright) each frame (bright: the daylight, 0..1, for the copy in your hands).
// In your hands they draw over everything (renderOrder 10 and 11, depth always passing).
// Triangles: the map 2, the compass 48 (card 16 and rim 32, one mesh), on the bonnet (lit) and in your hands (unlit): 100.
// Draws: 2 on the bonnet; 2 while you hold them.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { canvasTex } from "./util.js";
import { me } from "./player.js";
import { addTarget } from "./targets.js";
import { toStage } from "./stage.js";

const CSS = `
#mapPills { position: fixed; right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(64px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; align-items: flex-end; gap: 8px; z-index: 3; }
body.touch #mapPills { bottom: calc(200px + env(safe-area-inset-bottom, 0px)); }
#bearing { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(56px + env(safe-area-inset-bottom, 0px)); z-index: 3; padding: 6px 12px; border-radius: 999px;
  font: 600 15px var(--display, system-ui); font-variant-numeric: tabular-nums; white-space: nowrap; color: #4a3426; background: rgb(255 248 238 / .9); box-shadow: 0 3px 0 rgb(138 90 59 / .25); }
body.touch #bearing { bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }
body.drive-cut #mapPills, body.drive-cut #bearing { visibility: hidden; }
`;
const heading = (yaw) => ((Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI + 360) % 360;   // 0 north, 90 east
const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], pointOf = (deg) => POINTS[Math.round(deg / 45) % 8];
// where the jeep model's own map lies (props/jeep/build_jeep.py MAP_AT: centre x -0.2, 0.98 ahead of the jeep's middle, turned
// 0.1, 1.0 by 0.74 m) on the bonnet (bonnet_z: 1.06 high at z 0.42, falling 0.05 m over 1.14 m toward the front), in the jeep's frame
const BONNET = (z) => 1.06 - (0.05 * (z - 0.42)) / 1.14, AT = { x: -0.2, z: 0.98, turn: 0.1 };

// The jeep model's painted map and compass (build_jeep.py hood_map, joined into the Hood mesh) come off, as this map lies in
// their place: the triangles wholly inside the sheet and above the bonnet's top; the bonnet itself stays. In the jeep's frame,
// so it works wherever the jeep stands.
export function dropHoodMap(jeep) {
  const hood = jeep.getObjectByName("Hood"); if (!hood?.isMesh || !hood.geometry.index) return;
  jeep.updateMatrixWorld(true);
  const rel = jeep.matrixWorld.clone().invert().multiply(hood.matrixWorld);
  const g = hood.geometry, p = g.attributes.position, idx = g.index, v = new THREE.Vector3(), keep = [], c = Math.cos(AT.turn), s = Math.sin(AT.turn);
  const onMap = (i) => { v.fromBufferAttribute(p, i).applyMatrix4(rel); const dx = v.x - AT.x, dz = v.z - AT.z;
    return Math.abs(dx * c - dz * s) < 0.53 && Math.abs(dx * s + dz * c) < 0.4 && v.y > BONNET(v.z) + 0.002; };
  for (let t = 0; t < idx.count; t += 3) { const i = idx.getX(t), j = idx.getX(t + 1), k = idx.getX(t + 2); if (!(onMap(i) && onMap(j) && onMap(k))) keep.push(i, j, k); }
  g.setIndex(keep);
}

export function buildMapCompass({ scene, camera, map: MAP, paint: paintLevel, lit }) {
  if (!document.getElementById("mapCompassCss")) document.head.append(Object.assign(document.createElement("style"), { id: "mapCompassCss", textContent: CSS }));
  const uv = (x, z) => [((MAP.cx + MAP.S / 2 - x) / MAP.S) * MAP.PX, ((MAP.cz + MAP.S / 2 - z) / MAP.S) * MAP.PX];   // east is -x
  const cell = (x, z) => { const [u, v] = uv(x, z), k = MAP.PX / MAP.G; return u < 0 || v < 0 || u >= MAP.PX || v >= MAP.PX ? "off the map" : "ABCDEFGH"[Math.floor(u / k)] + (1 + Math.floor(v / k)); };
  let base = null;   // the level's map with grid and frame, drawn once
  function drawBase() {
    const c = document.createElement("canvas"), W = MAP.PX; c.width = c.height = W; const g = c.getContext("2d"), k = W / MAP.G;
    g.fillStyle = "#ece4d0"; g.fillRect(0, 0, W, W);   // paper
    const line = (P, col, w, dash = []) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.lineJoin = g.lineCap = "round"; g.beginPath(); P.forEach(([x, z], i) => { const [u, v] = uv(x, z); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.stroke(); g.setLineDash([]); };
    const tag = (t, x, y, size = 30, col = "#24324a") => { g.font = `700 ${size}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = size / 5; g.strokeStyle = "rgba(245,240,226,0.9)"; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); };
    const spot = (x, z, label, dx = 0, dy = -26, mark = "dot", size = 24) => { const [u, v] = uv(x, z); g.fillStyle = "#b2361e"; g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath();
      if (mark === "tri") { g.moveTo(u, v - 9); g.lineTo(u + 8, v + 6); g.lineTo(u - 8, v + 6); g.closePath(); } else g.arc(u, v, 7, 0, 7); g.stroke(); g.fill(); tag(label, u + dx, v + dy, size, "#2a2420"); };
    const grid = () => { g.strokeStyle = "rgba(40,52,70,0.55)"; g.lineWidth = 2; for (let i = 1; i < MAP.G; i++) { g.beginPath(); g.moveTo(i * k, 0); g.lineTo(i * k, W); g.moveTo(0, i * k); g.lineTo(W, i * k); g.stroke(); }
      for (let i = 0; i < MAP.G; i++) { tag("ABCDEFGH"[i], i * k + k / 2, 22); tag(String(i + 1), 20, i * k + k / 2); } };
    paintLevel({ g, W, uv, line, tag, spot, grid });
    // the north arrow, a scale bar one grid square long, and the frame
    g.fillStyle = "#24324a"; g.beginPath(); g.moveTo(W - 50, 46); g.lineTo(W - 36, 92); g.lineTo(W - 50, 82); g.lineTo(W - 64, 92); g.closePath(); g.fill(); tag("N", W - 50, 116, 26);
    g.fillStyle = "#24324a"; g.fillRect(W - 40 - k, W - 40, k, 8); tag(`${Math.round(MAP.S / MAP.G)} m`, W - 40 - k / 2, W - 62, 22);
    g.strokeStyle = "#6b5a44"; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, W - 10);
    return c;
  }
  const mapCv = document.createElement("canvas"); mapCv.width = mapCv.height = MAP.PX; const mapG = mapCv.getContext("2d");
  mapG.fillStyle = "#ece4d0"; mapG.fillRect(0, 0, MAP.PX, MAP.PX); mapG.fillStyle = "#6b5a44"; mapG.font = "700 60px system-ui"; mapG.textAlign = "center"; mapG.fillText("MAP", MAP.PX / 2, MAP.PX / 2);
  const mapTex = new THREE.CanvasTexture(mapCv); mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.anisotropy = 8;
  // the compass card, with the rim's grey painted in its top left corner (outside the card's circle), so card and rim are one mesh
  const card = canvasTex(256, 256, (g, w) => { const c = w / 2; g.fillStyle = "#3b3f44"; g.fillRect(0, 0, 24, 24); g.fillStyle = "#f3efe4"; g.beginPath(); g.arc(c, c, c - 2, 0, 7); g.fill();
    g.strokeStyle = "#2b2b2b"; for (let d = 0; d < 360; d += 10) { const a = (d * Math.PI) / 180, r0 = d % 90 ? c - 22 : c - 34; g.lineWidth = d % 30 ? 2 : 4; g.beginPath(); g.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); g.lineTo(c + Math.sin(a) * (c - 8), c - Math.cos(a) * (c - 8)); g.stroke(); }
    g.textAlign = "center"; g.textBaseline = "middle"; g.font = "800 40px system-ui, sans-serif"; [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(([t, d]) => { const a = (d * Math.PI) / 180; g.fillStyle = t === "N" ? "#c0281c" : "#222"; g.fillText(t, c + Math.sin(a) * (c - 58), c - Math.cos(a) * (c - 58)); });
    g.fillStyle = "#c0281c"; g.beginPath(); g.moveTo(c, 34); g.lineTo(c + 13, c); g.lineTo(c - 13, c); g.fill(); g.fillStyle = "#e8e8e8"; g.strokeStyle = "#555"; g.lineWidth = 2; g.beginPath(); g.moveTo(c, w - 34); g.lineTo(c + 13, c); g.lineTo(c - 13, c); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#333"; g.beginPath(); g.arc(c, c, 7, 0, 7); g.fill(); });
  const rimG = new THREE.CylinderGeometry(1.08, 1.08, 0.28, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.1);
  for (let i = 0; i < rimG.attributes.uv.count; i++) rimG.attributes.uv.setXY(i, 0.04, 0.96);
  const compG = mergeGeometries([rimG, new THREE.CircleGeometry(1, 16)]), mapG3 = new THREE.PlaneGeometry(1, 1);   // the rim first: in your hands (no depth test) the card draws over it
  const make = (onHood) => { const M = (o) => onHood ? lit(o) : new THREE.MeshBasicMaterial({ ...o, fog: false, toneMapped: false, depthFunc: THREE.AlwaysDepth });   // over everything, and its depth written, so the highlight's glow behind it does not shine through
    const side = onHood ? THREE.FrontSide : THREE.DoubleSide;   // on the bonnet only their tops are seen (and no new shader for the camp)
    const sheet = new THREE.Mesh(mapG3, M({ map: mapTex, side })), comp = new THREE.Mesh(compG, M({ map: card, side }));
    if (!onHood) [sheet, comp].forEach((m, i) => { m.renderOrder = 10 + i; m.frustumCulled = false; });
    return { sheet, comp, mats: [sheet.material, comp.material] }; };
  // on the bonnet: the map open where the model's own lay, the same size across, the compass where its compass lay
  const hood = make(true), hoodAt = new THREE.Group(); hoodAt.name = "MapAndCompass"; hoodAt.add(hood.sheet, hood.comp); hoodAt.visible = false;
  hood.sheet.scale.set(0.78, 0.78, 1); hood.sheet.rotation.set(-Math.PI / 2, 0, 0); hood.sheet.position.set(0, 0.004, 0); hood.comp.scale.setScalar(0.05); hood.comp.rotation.x = -Math.PI / 2; hood.comp.position.set(0.21, 0.018, 0.17);
  const setHood = (jeep) => {
    jeep.add(hoodAt); hoodAt.position.set(AT.x, BONNET(AT.z), AT.z); hoodAt.rotation.set(Math.atan(0.05 / 1.14), AT.turn, 0, "YXZ");
    const lid = jeep.getObjectByName("Hood"); if (lid) lid.attach(hoodAt);   // it rides up with the bonnet
    placed = true; hoodAt.visible = !held; };
  // in your hands
  const hand = make(false), hands = new THREE.Group(); hands.add(hand.sheet, hand.comp); camera.add(hands); if (!camera.parent) scene.add(camera); hands.visible = false;
  hand.comp.rotation.x = -1.05;
  let held = false, placed = false, raised = 0, raiseTo = 0, drawT = 0;
  const box = document.createElement("div"); box.id = "mapPills"; document.body.append(box);
  const read = Object.assign(document.createElement("div"), { id: "bearing", hidden: true }); document.body.append(read);
  const btn = (label, fn) => { const b = document.createElement("button"); b.className = "tap-pill"; b.textContent = label; b.hidden = true; b.onclick = (e) => { e.stopPropagation(); fn(); }; box.append(b); return b; };
  const lookLabel = () => (raiseTo ? "🗺 Lower the map" : "🗺 Look at the map");
  const look = btn("🗺 Look at the map", () => { raiseTo = raiseTo ? 0 : 1; look.textContent = lookLabel(); }), back = btn("✋ Put it back", () => setHeld(false));
  function setHeld(v) { if (v === held || (v && !placed)) return; held = v; if (v && !base) base = drawBase(); hands.visible = v; hoodAt.visible = !v && placed; raiseTo = 0; look.textContent = lookLabel(); look.hidden = back.hidden = read.hidden = !v; drawT = 0; }
  // it lights up and its menu takes it (targets.js), as the radio and the clocks
  { const W = new THREE.Vector3(), sph = new THREE.Sphere(), picks = [hood.sheet, hood.comp];
    const at = (v) => { hoodAt.getWorldPosition(v); toStage(v); sph.center.copy(v); sph.radius = 0.45; return sph; };   // in the stage's frame, as every target
    addTarget(hoodAt, () => ({ look: hoodAt, picks, at, ready: () => placed && !held && hoodAt.getWorldPosition(W).distanceTo(me.pos) < 3.4, options: () => [["Take the map and compass 🧭", () => setHeld(true)]] })); }
  addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT") return; if ((e.code === "KeyQ" || e.code === "Backspace") && held) setHeld(false); else if (e.code === "KeyM" && held) look.click(); });
  function step(dt, bright) {
    if (!held) return;
    const hd = heading(me.yaw); read.textContent = `${Math.round(hd)}° ${pointOf(hd)} · grid ${cell(me.pos.x, me.pos.z)}`;
    raised += (raiseTo - raised) * Math.min(1, dt * 8);
    // sized to the view: on a narrow phone screen both still fit side by side
    const touch = document.body.classList.contains("touch"), hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.5, hw = hh * camera.aspect, s = Math.min(0.15, hw * 0.8), r = Math.min(0.045, hw * 0.27);
    const lift = touch ? hh * 0.34 : 0, t = THREE.MathUtils.smoothstep(raised, 0, 1), big = Math.min(hw * 2, hh * 2) * 0.94;
    hand.sheet.scale.setScalar(s + (big - s) * t); hand.sheet.position.set(Math.max(-hw * 0.5, -hw + s * 0.6) * (1 - t), (-hh + s * 0.42 + lift) * (1 - t), -0.5); hand.sheet.rotation.set(-0.55 * (1 - t), 0.25 * (1 - t), 0.12 * (1 - t));
    hand.comp.scale.setScalar(r); hand.comp.position.set(touch ? 0 : Math.min(hw * 0.5, hw - r * 1.3), -hh + r * 0.9 + (touch ? hh * 0.16 : 0) - 0.3 * t, -0.5); hand.comp.rotation.z = THREE.MathUtils.degToRad(hd);   // on a phone above the bearing, clear of the stick
    for (const m of hand.mats) m.color.setScalar(0.3 + 0.7 * bright);
    drawT -= dt; if (drawT <= 0) { drawT = 0.15; paint(); }
  }
  function paint() {   // the map with your arrow on it
    if (!base) return; const [u, v] = uv(me.pos.x, me.pos.z), a = THREE.MathUtils.degToRad(heading(me.yaw));
    mapG.drawImage(base, 0, 0); mapG.save(); mapG.translate(u, v); mapG.rotate(a);
    mapG.fillStyle = "#1a5fd0"; mapG.strokeStyle = "#fff"; mapG.lineWidth = 4; mapG.beginPath(); mapG.moveTo(0, -22); mapG.lineTo(13, 14); mapG.lineTo(0, 7); mapG.lineTo(-13, 14); mapG.closePath(); mapG.stroke(); mapG.fill(); mapG.restore(); mapTex.needsUpdate = true;
  }
  setTimeout(() => { if (!base) base = drawBase(); paint(); }, 2500);   // the bonnet's copy shows the map too
  return { step, setHood, setHeld, hoodAt, get held() { return held; } };
}
