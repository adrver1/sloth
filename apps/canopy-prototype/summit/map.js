// Summit Cabin map and compass: drawn on the jeep's hood; take them (pill or Q) to hold them, M raises the map. carry.step(dt,
// bright) each frame, carry.setHood(group) once the jeep has loaded.
import * as THREE from 'three';
import { $, BIG, BW, CL, ROAD, TOWER, TRIS, forestAt, height, onIce } from './land.js';
import { camera, canvasTex, hazed, me, scene, touch } from './core.js';

// ---------------------------------------------------------------- the map and compass (Adriaen 2026-11-14: "I need a compass so I can tell you which points I'm referring to")
// They lie on the jeep's hood. Walk up to it and take them: you hold the compass low right and the map low left, as the camp
// holds its vegetables, with a "Put it back" pill (Q) that returns them to the hood. "Look at the map" (M) raises the map in
// front of you. The map is north-up with a lettered grid (columns A to H west to east, rows 1 to 8 north to south, 150 m
// squares), so a spot can be named as "D3". North is +z here: the noon sun stands over the cliff, which faces south.
// Compass and map: map 2 tris, compass card 16 + rim 32, the same again on the hood (Lambert, lit) and in your hands (unlit).
export let carry;
const MAP = { cx: -20, cz: -230, S: 1200, PX: 1024, G: 8 };   // 1.2 km square: the summit, the road and tunnel, the watch hill and the big lake below
const heading = (yaw) => ((Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI + 360) % 360;   // 0 north, 90 east
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], pointOf = (deg) => POINTS[Math.round(deg / 45) % 8];
const mapUV = (x, z) => [((MAP.cx + MAP.S / 2 - x) / MAP.S) * MAP.PX, ((MAP.cz + MAP.S / 2 - z) / MAP.S) * MAP.PX];   // east is -x
const mapCell = (x, z) => { const [u, v] = mapUV(x, z), k = MAP.PX / MAP.G; return u < 0 || v < 0 || u >= MAP.PX || v >= MAP.PX ? 'off the map' : 'ABCDEFGH'[Math.floor(u / k)] + (1 + Math.floor(v / k)); };
let mapBase = null;   // drawn the first time you pick the map up (about 40k height samples)
function drawMapBase() {
  const N = 300, img = new ImageData(N, N), H = new Float32Array(N * N), step = MAP.S / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = MAP.cx + MAP.S / 2 - (i + 0.5) * step, z = MAP.cz + MAP.S / 2 - (j + 0.5) * step; H[j * N + i] = height(x, z); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, h = H[k], hx = H[j * N + Math.min(i + 1, N - 1)] - H[j * N + Math.max(i - 1, 0)], hz = H[Math.min(j + 1, N - 1) * N + i] - H[Math.max(j - 1, 0) * N + i];
    const x = MAP.cx + MAP.S / 2 - (i + 0.5) * step, z = MAP.cz + MAP.S / 2 - (j + 0.5) * step, sl = Math.hypot(hx, hz) / (2 * step), ny = 1 / Math.sqrt(1 + sl * sl);
    const shade = Math.max(0.55, Math.min(1.12, 0.92 + (-hx + -hz) / (2 * step) * 0.35));   // lit from the north-west (map top left)
    let c = [236, 228, 208];   // paper
    if (onIce(x, z, h)) c = [196, 218, 230]; else { const f = forestAt(x, z, h, 1 - ny); c = [c[0] - 70 * f, c[1] - 46 * f, c[2] - 66 * f]; if (sl > 1.1) c = [c[0] - 30, c[1] - 30, c[2] - 26]; }
    const band = Math.floor(h / 25), cont = band !== Math.floor(H[j * N + Math.min(i + 1, N - 1)] / 25) || band !== Math.floor(H[Math.min(j + 1, N - 1) * N + i] / 25), major = cont && band % 4 === 0;
    const o = k * 4; for (let q = 0; q < 3; q++) img.data[o + q] = Math.max(0, Math.min(255, c[q] * shade * (cont ? (major ? 0.62 : 0.82) : 1))); img.data[o + 3] = 255; }
  const small = document.createElement('canvas'); small.width = small.height = N; small.getContext('2d').putImageData(img, 0, 0);
  const c = document.createElement('canvas'), W = MAP.PX; c.width = c.height = W; const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, W, W);
  const line = (P, col, w, dash = []) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.lineJoin = g.lineCap = 'round'; g.beginPath(); P.forEach(([x, z], i) => { const [u, v] = mapUV(x, z); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.stroke(); g.setLineDash([]); };
  line(ROAD.pts.map((p) => [p[0], p[1]]), '#3a2f28', 5); line(ROAD.pts.filter((p) => p[2] >= ROAD.b0).map((p) => [p[0], p[1]]), '#8a6a4a', 3);
  line(BW.filter((p, i) => i % 4 === 0).map((p) => [p[0], p[1]]), '#b2361e', 3.2, [7, 4]);
  // the grid: 150 m squares, lettered along the top and numbered down the side
  const k = W / MAP.G; g.strokeStyle = 'rgba(40,52,70,0.55)'; g.lineWidth = 2; for (let i = 1; i < MAP.G; i++) { g.beginPath(); g.moveTo(i * k, 0); g.lineTo(i * k, W); g.moveTo(0, i * k); g.lineTo(W, i * k); g.stroke(); }
  g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tag = (t, x, y, size = 30, col = '#24324a') => { g.font = `700 ${size}px system-ui, sans-serif`; g.lineWidth = size / 5; g.strokeStyle = 'rgba(245,240,226,0.9)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); };
  for (let i = 0; i < MAP.G; i++) { tag('ABCDEFGH'[i], i * k + k / 2, 22); tag(String(i + 1), 20, i * k + k / 2); }
  // places
  const spot = (x, z, label, dx = 0, dy = -26, mark = 'dot') => { const [u, v] = mapUV(x, z); g.fillStyle = '#b2361e'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath();
    if (mark === 'tri') { g.moveTo(u, v - 9); g.lineTo(u + 8, v + 6); g.lineTo(u - 8, v + 6); g.closePath(); } else g.arc(u, v, 7, 0, 7); g.stroke(); g.fill(); tag(label, u + dx, v + dy, 24, '#2a2420'); };
  spot(0, 0, 'Cabin', 0, -26); spot(TOWER.x, TOWER.z, 'Lookout', 0, -26, 'tri'); spot(CL.x, CL.z, 'Clearing', 0, 28);
  spot(ROAD.portal.x, ROAD.portal.z, 'Tunnel', 0, 26); tag('Big lake', ...mapUV(BIG.x, BIG.z + 140), 30, '#3b5f78');
  // north arrow and a 300 m scale bar
  g.fillStyle = '#24324a'; g.beginPath(); g.moveTo(W - 50, 46); g.lineTo(W - 36, 92); g.lineTo(W - 50, 82); g.lineTo(W - 64, 92); g.closePath(); g.fill(); tag('N', W - 50, 116, 26);
  g.fillStyle = '#24324a'; g.fillRect(W - 40 - k, W - 40, k, 8); tag('150 m', W - 40 - k / 2, W - 62, 22);
  g.strokeStyle = '#6b5a44'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, W - 10);
  return c;
}

export function buildMap() {
  carry = (() => {
    const mapCv = document.createElement('canvas'); mapCv.width = mapCv.height = MAP.PX; const mapG = mapCv.getContext('2d');
    mapG.fillStyle = '#ece4d0'; mapG.fillRect(0, 0, MAP.PX, MAP.PX); mapG.fillStyle = '#6b5a44'; mapG.font = '700 60px system-ui'; mapG.textAlign = 'center'; mapG.fillText('MAP', MAP.PX / 2, MAP.PX / 2);
    const mapTex = new THREE.CanvasTexture(mapCv); mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.anisotropy = 8;
    const card = canvasTex(256, 256, (g, w) => { const c = w / 2; g.fillStyle = '#f3efe4'; g.beginPath(); g.arc(c, c, c - 2, 0, 7); g.fill();
      g.strokeStyle = '#2b2b2b'; for (let d = 0; d < 360; d += 10) { const a = (d * Math.PI) / 180, r0 = d % 90 ? c - 22 : c - 34; g.lineWidth = d % 30 ? 2 : 4; g.beginPath(); g.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); g.lineTo(c + Math.sin(a) * (c - 8), c - Math.cos(a) * (c - 8)); g.stroke(); }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 40px system-ui, sans-serif'; [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, d]) => { const a = (d * Math.PI) / 180; g.fillStyle = t === 'N' ? '#c0281c' : '#222'; g.fillText(t, c + Math.sin(a) * (c - 58), c - Math.cos(a) * (c - 58)); });
      g.fillStyle = '#c0281c'; g.beginPath(); g.moveTo(c, 34); g.lineTo(c + 13, c); g.lineTo(c - 13, c); g.fill(); g.fillStyle = '#e8e8e8'; g.strokeStyle = '#555'; g.lineWidth = 2; g.beginPath(); g.moveTo(c, w - 34); g.lineTo(c + 13, c); g.lineTo(c - 13, c); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#333'; g.beginPath(); g.arc(c, c, 7, 0, 7); g.fill(); });
    const cardG = new THREE.CircleGeometry(1, 16), rimG = new THREE.CylinderGeometry(1.08, 1.08, 0.28, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.1), mapG3 = new THREE.PlaneGeometry(1, 1);
    const make = (lit) => { const M = (o) => lit ? hazed(new THREE.MeshLambertMaterial(o)) : new THREE.MeshBasicMaterial({ ...o, fog: false, toneMapped: false, depthTest: false });
      const map = new THREE.Mesh(mapG3, M({ map: mapTex, side: THREE.DoubleSide })), comp = new THREE.Group(), face = new THREE.Mesh(cardG, M({ map: card })), rim = new THREE.Mesh(rimG, M({ color: '#3b3f44', side: THREE.DoubleSide }));
      comp.add(rim, face); if (!lit) [map, face, rim].forEach((m, i) => { m.renderOrder = 10 + [0, 2, 1][i]; m.frustumCulled = false; });
      return { map, comp, face, mats: [map.material, face.material, rim.material] }; };
    // on the hood: the map folded open beside the compass
    const hood = make(true), hoodAt = new THREE.Group(); hoodAt.add(hood.map, hood.comp); scene.add(hoodAt);
    // where the camp's own bonnet map lay (props/jeep/build_jeep.py MAP_AT, hood_map: centre x -0.2, 0.98 ahead of the jeep's
    // middle, turned 0.1; road.js takes that one off the hood), the same size across, flat on the bonnet, which falls 0.05 m
    // toward the front over 1.14 m (bonnet_z), with the compass where the camp's compass lay (Adriaen 2026-11-15: it floated off the hood's corner)
    hood.map.scale.set(0.78, 0.78, 1); hood.map.rotation.set(-Math.PI / 2, 0, 0); hood.map.position.set(0, 0.004, 0); hood.comp.scale.setScalar(0.05); hood.comp.rotation.x = -Math.PI / 2; hood.comp.position.set(0.21, 0.018, 0.17);
    hoodAt.visible = false;   // placed once the jeep has loaded (setHood)
    const setHood = (root) => {   // root: the jeep's group (drive.js moves it), so the map rides along with the jeep
      root.add(hoodAt); hoodAt.position.set(-0.2, 1.06 - (0.05 * (0.98 - 0.42)) / 1.14, 0.98); hoodAt.rotation.set(Math.atan(0.05 / 1.14), 0.1, 0, 'YXZ');
      hoodAt.userData.placed = true; hoodAt.visible = !held; };
    const HOOD = new THREE.Vector3();
    // in your hands
    const hand = make(false), hands = new THREE.Group(); hands.add(hand.map, hand.comp); camera.add(hands); if (!camera.parent) scene.add(camera); hands.visible = false;
    hand.comp.rotation.x = -1.05;
    let held = false, raised = 0, raiseTo = 0, drawT = 0;
    const btn = (id, label, fn) => { const b = document.createElement('button'); b.id = id; b.className = 'panel pill'; b.textContent = label; b.hidden = true; b.onclick = (e) => { e.stopPropagation(); fn(); }; $('carry').append(b); return b; };
    const take = btn('take', '🧭 Take the map and compass', () => setHeld(true)), look = btn('mapBtn', '🗺 Look at the map', () => { raiseTo = raiseTo ? 0 : 1; look.textContent = raiseTo ? '🗺 Lower the map' : '🗺 Look at the map'; }), back = btn('putBack', '✋ Put it back', () => setHeld(false));
    const read = $('bearing');
    function setHeld(v) { if (v === held) return; held = v; if (v && !mapBase) { mapBase = drawMapBase(); } hands.visible = v; hoodAt.visible = !v && hoodAt.userData.placed; raiseTo = 0; look.textContent = '🗺 Look at the map'; drawT = 0; }
    addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; if (e.code === 'KeyE' && !take.hidden) setHeld(true); else if ((e.code === 'KeyQ' || e.code === 'Backspace') && held) setHeld(false); else if (e.code === 'KeyM' && held) look.click(); });
    function step(dt, bright) {
      const near = hoodAt.userData.placed && (hoodAt.getWorldPosition(HOOD), Math.hypot(me.x - HOOD.x, me.z - HOOD.z) < 3.4);
      take.hidden = held || !near; look.hidden = back.hidden = !held; read.hidden = !held;
      if (!held) return;
      const hd = heading(me.yaw); read.textContent = `${Math.round(hd)}° ${pointOf(hd)} · grid ${mapCell(me.x, me.z)}`;
      raised += (raiseTo - raised) * Math.min(1, dt * 8);
      // sized to the view: on a narrow phone screen both still fit side by side
      const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.5, hw = hh * camera.aspect, s = Math.min(0.15, hw * 0.8), r = Math.min(0.045, hw * 0.27);
      const lift = touch ? hh * 0.34 : 0, t = THREE.MathUtils.smoothstep(raised, 0, 1), big = Math.min(hw * 2, hh * 2) * 0.94;
      hand.map.scale.setScalar(s + (big - s) * t); hand.map.position.set(Math.max(-hw * 0.5, -hw + s * 0.6) * (1 - t), (-hh + s * 0.42 + lift) * (1 - t), -0.5); hand.map.rotation.set(-0.55 * (1 - t), 0.25 * (1 - t), 0.12 * (1 - t));
      hand.comp.scale.setScalar(r); hand.comp.position.set(touch ? 0 : Math.min(hw * 0.5, hw - r * 1.3), -hh + r * 0.9 + (touch ? hh * 0.16 : 0) - 0.3 * t, -0.5); hand.face.rotation.z = THREE.MathUtils.degToRad(hd);   // on a phone above the bearing, clear of the stick
      for (const m of hand.mats) m.color.setScalar(0.3 + 0.7 * bright);
      drawT -= dt; if (drawT <= 0 && mapBase) { drawT = 0.15; paint(); }
    }
    function paint() {   // the map with your arrow on it
      if (!mapBase) return; const hd = heading(me.yaw);
      { const [u, v] = mapUV(me.x, me.z), a = THREE.MathUtils.degToRad(hd); mapG.drawImage(mapBase, 0, 0); mapG.save(); mapG.translate(u, v); mapG.rotate(a);
        mapG.fillStyle = '#1a5fd0'; mapG.strokeStyle = '#fff'; mapG.lineWidth = 4; mapG.beginPath(); mapG.moveTo(0, -22); mapG.lineTo(13, 14); mapG.lineTo(0, 7); mapG.lineTo(-13, 14); mapG.closePath(); mapG.stroke(); mapG.fill(); mapG.restore(); mapTex.needsUpdate = true; }
    }
    setTimeout(() => { if (!mapBase) mapBase = drawMapBase(); drawT = 0; paint(); }, 2500);   // the hood's copy shows the map too
    return { step, setHood, setHeld, hoodAt, get held() { return held; } };
  })();
  TRIS.push(['Map and compass (on the hood and in your hands, 2 + 48 each)', 100]);
}
