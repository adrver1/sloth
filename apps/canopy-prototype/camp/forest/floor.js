// Canopy Camp forest floor: the clearing's grass tile, the footpath's ribbon to the glade and the jeep's dirt road with its ruts.
// Exports FLOOR_OVERLAYS (the ribbons, which take the ground's contact shadow: groundLife.shadeOn), grassTex (the grass tile,
// set by clearingFloor, for campGround.js), clearingFloor() and trackRoad() (buildForest steps, forest.js).
import * as THREE from "three";
import { hex, S, scene } from "../core.js";
import { V, canvasTex, rand, sstep } from "../util.js";
import { PATHS, RC, TRACK_HALF } from "../layout.js";
import { R, track } from "./base.js";

const FLOOR_OVERLAYS = [];   // the path and track ribbons drawn on the floor: they take the ground's contact shadow (groundLife.shadeOn)
let grassTex;   // set by clearingFloor

// A ribbon on the floor along a curve (the footpath and the jeep's track and ruts): n segments, half its width either side,
// y above 0, tex tiled along it every tile metres, alpha(point, metres along, length) per row, drawn in renderOrder order. Wound
// face up, so it needs no back side. It takes the ground's contact shadow (FLOOR_OVERLAYS, groundLife.shadeOn).
function ribbon(curve, { n, half, y, tex, alpha, tile, order }) {
  const pos = [], uv = [], col = [], idx = [], L = curve.getLength();
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), d = curve.getTangentAt(t), side = V(-d.z, 0, d.x).normalize(), a = alpha(p, t * L, L);
    for (const k of [-1, 1]) {
      const q = p.clone().addScaledVector(side, k * half);
      pos.push(q.x, y, q.z); uv.push((k + 1) / 2, (t * L) / tile); col.push(1, 1, 1, a);
    }
    if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
  tex.wrapT = THREE.RepeatWrapping;
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  mesh.renderOrder = order; scene.add(mesh); FLOOR_OVERLAYS.push(mesh);
}

function clearingFloor() {
  // ---------------------------------------------------------------- clearing floor
  // the grass tile: ground.js paints the clearing with it (the flat clearing disc it was drawn on is gone)
  grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex(new THREE.Color(S.leaf[3]).lerp(new THREE.Color(0xd8e0a0), 0.25).getHex()); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.strokeStyle = hex(S.leaf[i % 4]); g.globalAlpha = R(0.2, 0.6); g.lineWidth = 1.5; const x = R(0, w), y = R(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-2, 2), y - R(3, 8)); g.stroke(); }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(6, 6);
  // the footpath to the glade: one ribbon of trodden earth (1 draw, 96 triangles); the glade's own floor is camp/glade.js
  {
    const Q = rand;   // texture noise only
    // packed earth, warmer and lighter than the forest floor so it reads from the camp (Adriaen 2026-11-14: "more prominent"): two darker
    // lanes where feet go, pebbles, a few fallen leaves, grass at the verges and a ragged edge (the texture tiles every 2.5 m)
    const earth = canvasTex(128, 512, (g, w, h) => {
      g.fillStyle = "#a3845a"; g.fillRect(0, 0, w, h);
      {
        for (const cx of [0.4, 0.6]) { const b = g.createLinearGradient(w * (cx - 0.12), 0, w * (cx + 0.12), 0); b.addColorStop(0, "rgba(110,84,56,0)"); b.addColorStop(0.5, "rgba(110,84,56,.45)"); b.addColorStop(1, "rgba(110,84,56,0)"); g.fillStyle = b; g.fillRect(0, 0, w, h); }
        for (let i = 0; i < 700; i++) { g.fillStyle = ["#8a6c48", "#b89a70", "#76593c"][i % 3]; g.globalAlpha = Q(0.2, 0.5); g.beginPath(); g.ellipse(Q(0, w), Q(0, h), Q(1, 4), Q(1, 2.5), Q(0, 3), 0, 7); g.fill(); }
        for (let i = 0; i < 60; i++) { g.fillStyle = ["#cbbd9f", "#9d927f"][i % 2]; g.globalAlpha = Q(0.6, 0.9); g.beginPath(); g.ellipse(Q(w * 0.2, w * 0.8), Q(0, h), Q(1.2, 2.6), Q(1, 2), Q(0, 3), 0, 7); g.fill(); }   // pebbles
        for (let i = 0; i < 26; i++) { g.fillStyle = ["#b8743a", "#d3a24a", "#8a5a2c"][i % 3]; g.globalAlpha = Q(0.6, 0.9); const x = Q(0, 1) < 0.7 ? (Q(0, 1) < 0.5 ? Q(8, 30) : Q(w - 30, w - 8)) : Q(30, w - 30); g.beginPath(); g.ellipse(x, Q(0, h), Q(3, 5), Q(1.4, 2.4), Q(0, 3), 0, 7); g.fill(); }   // fallen leaves, mostly at the sides
      }
      // grass at the verges
      g.globalAlpha = 1;
      for (let i = 0; i < 60; i++) { g.strokeStyle = hex(S.leaf[i % 4]); g.lineWidth = 2; const x = Q(0, 1) < 0.5 ? Q(4, 22) : Q(w - 22, w - 4), y = Q(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Q(-3, 3), y - Q(5, 11)); g.stroke(); }
      const img = g.getImageData(0, 0, w, h), d = img.data;   // a ragged edge: the verge wanders in and out along the path
      for (let y = 0; y < h; y++) { const t = (y / h) * 6.2832, l = 0.2 + 0.05 * Math.sin(t * 3 + 1) + 0.03 * Math.sin(t * 7), r = 0.8 + 0.05 * Math.sin(t * 2 + 4) + 0.03 * Math.sin(t * 9 + 2);
        for (let x = 0; x < w; x++) { const u = x / w; d[(y * w + x) * 4 + 3] *= sstep(l - 0.12, l + 0.04, u) * (1 - sstep(r - 0.04, r + 0.12, u)); } }
      g.putImageData(img, 0, 0);
    }, { read: true });
    // one ribbon per path (layout.js PATHS): it starts at the path's lead points in the camp (the glade path's: just past the log
    // seats round the fire, out between the tent and the laundry line, Adriaen 2026-11-14: "continue past the tent to the camp")
    // and runs along the path's own curve, which the player and the terrain follow. About 2 m wide, about 1.2 m of it bare
    // earth; it fades in at the seats and out into the glade.
    for (const path of PATHS)
      ribbon(new THREE.CatmullRomCurve3([...path.lead, ...path.curve.points]), { n: 48, half: path.half * 1.35, y: 0.024, tex: earth, tile: 2.5, order: 1, alpha: (p, l, L) => sstep(0, 1.0, l) * (1 - sstep(L - 1.2, L, l)) });
  }
}

function trackRoad() {
  // ---------------------------------------------------------------- the jeep's track: a dirt road out through the forest, and muddy tyre ruts up to its wheels
  if (track) {
    const Q = rand;   // texture noise only: leaves the seeded layout alone
    const mud = ["#8a6c4a", "#6b5038", "#4a3626"];
    const dirt = canvasTex(128, 512, (g, w, h) => {
      g.fillStyle = mud[0]; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { g.fillStyle = mud[1 + (i % 2)]; g.globalAlpha = Q(0.15, 0.45); g.beginPath(); g.ellipse(Q(0, w), Q(0, h), Q(1, 5), Q(1, 3), Q(0, 3), 0, 7); g.fill(); }
      g.globalAlpha = 1;
      for (let i = 0; i < 26; i++) { g.strokeStyle = hex(S.leaf[i % 4]); g.lineWidth = 2; const x = Q(0, w) < w / 2 ? Q(0, 16) : Q(w - 16, w), y = Q(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Q(-2, 2), y - Q(4, 9)); g.stroke(); }   // grass tufts at the verges
      const e = g.createLinearGradient(0, 0, w, 0); e.addColorStop(0, "rgba(0,0,0,0)"); e.addColorStop(0.18, "rgba(0,0,0,1)"); e.addColorStop(0.82, "rgba(0,0,0,1)"); e.addColorStop(1, "rgba(0,0,0,0)");
      g.globalCompositeOperation = "destination-in"; g.fillStyle = e; g.fillRect(0, 0, w, h);
    });
    const ruts = canvasTex(128, 256, (g, w, h) => {
      for (const cx of [w * 0.14, w * 0.86]) {
        const b = g.createLinearGradient(cx - 14, 0, cx + 14, 0); b.addColorStop(0, "rgba(60,42,28,0)"); b.addColorStop(0.25, "rgba(60,42,28,.85)"); b.addColorStop(0.75, "rgba(60,42,28,.85)"); b.addColorStop(1, "rgba(60,42,28,0)");
        g.fillStyle = b; g.fillRect(cx - 14, 0, 28, h);
        // tread chevrons
        g.strokeStyle = "rgba(30,20,12,.7)";
        g.lineWidth = 3;
        for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(cx - 9, y + 6); g.lineTo(cx, y); g.lineTo(cx + 9, y + 6); g.stroke(); }
        g.fillStyle = "rgba(150,135,110,.35)";                                   // wet shine in a few spots
        for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(cx + Q(-3, 3), Q(0, h), 5, Q(10, 22), 0, 0, 7); g.fill(); }
      }
    });
    // the dirt fades out as the track meets the clearing; the ruts run on to the jeep's front wheels. 60 segments, about 0.5 m
    // each: the curve reads as smooth as with 140 (R2-192)
    ribbon(track.curve, { n: 60, half: TRACK_HALF, y: 0.022, tex: dirt, tile: 3.2, order: 1, alpha: (p) => sstep(RC - 3, RC + 0.5, Math.hypot(p.x, p.z)) });
    ribbon(track.curve, { n: 60, half: 0.81, y: 0.028, tex: ruts, tile: 1.6, order: 2, alpha: (p, l) => sstep(0, 0.6, l) * (0.7 + 0.25 * sstep(RC - 4, RC, Math.hypot(p.x, p.z))) });
  }
}

export { FLOOR_OVERLAYS, clearingFloor, grassTex, trackRoad };
