// Canopy Camp sky: the painted forest backdrop in the mist, the open sky dome with clouds, the night dome with stars, the moon, the forest floor.
import * as THREE from "three";
import "./hud.js";   // run after the module before it, as one script did
import { LOOK, R, S, hex, scene } from "./core.js";
import { canvasTex, lcg } from "./util.js";
import { FAR } from "./layout.js";

// ---------------------------------------------------------------- backdrop: painted forest layers in the mist (no geometry behind them)
// Four layers, far to near, each fading into the mist: tall rainforest trees with buttress roots, forked branches and
// crowns built from many small leaf clusters, palms, tree ferns, hanging lianas, and an undergrowth band at the foot.
// Low-poly paints the same trees in flat stacked shapes. Its own random stream, so the seeded layout stays the same.
const back = canvasTex(2048, 512, (g, w, h) => {
  const { R: Q } = lcg(4242);
  const gr = g.createLinearGradient(0, 0, 0, h); S.sky.forEach((c, i) => gr.addColorStop(i / (S.sky.length - 1), c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const LOW = LOOK === "low", fogC = new THREE.Color(S.fog[0]), skyTop = new THREE.Color(S.sky[0]);
  const wrap = (x, f) => { f(x); if (x < 160) f(x + w); if (x > w - 160) f(x - w); };     // draw across the seam so the texture tiles
  const blob = (x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); };
  const leafy = (x, y, r, n, flat) => {                                     // a crown cluster: many small leaves, not one ball
    for (let i = 0; i < n; i++) { const a = Q(0, 6.28), d = r * Math.sqrt(Q(0, 1)); const lx = x + Math.cos(a) * d * (flat ? 1.5 : 1), ly = y + Math.sin(a) * d * (flat ? 0.55 : 0.8);
      if (LOW) { g.beginPath(); g.moveTo(lx, ly - r * 0.35); g.lineTo(lx + r * 0.3, ly + r * 0.2); g.lineTo(lx - r * 0.3, ly + r * 0.2); g.fill(); }
      else blob(lx, ly, Q(3, 7) * r / 26, Q(2, 4) * r / 26, Q(-0.8, 0.8)); }
  };
  const L = LOW ? 3 : 4;
  for (let l = 0; l < L; l++) {
    const k = l / (L - 1), col = fogC.clone().lerp(new THREE.Color(S.leaf[2]), 0.18 + k * 0.5), dark = col.clone().multiplyScalar(0.86), lite = col.clone().lerp(skyTop, 0.18);
    const base = h * (0.66 + k * 0.12), sc = 0.55 + k * 0.55;            // nearer layers sit lower and bigger
    // trees
    for (let x = Q(-40, 0); x < w; x += Q(55, 120) * sc) wrap(x, (x) => {
      const kind = Q(0, 1), top = h * Q(0.08, 0.3) + k * h * 0.12, tw = Q(5, 9) * sc;
      g.fillStyle = dark.getStyle();
      if (!LOW && kind < 0.18) {                                            // a palm: thin curved stem and drooping fronds
        const lean = Q(-20, 20), tx = x + lean, ty = top + h * 0.08;
        g.lineWidth = tw * 0.6; g.strokeStyle = dark.getStyle(); g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + lean * 0.2, (base + ty) / 2, tx, ty); g.stroke();
        g.lineWidth = 3 * sc; g.strokeStyle = col.getStyle();
        for (let f = 0; f < 9; f++) { const a = -Math.PI / 2 + (f - 4) * 0.42 + Q(-0.1, 0.1), len = Q(38, 58) * sc, ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.5 + len * 0.45;
          g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6, ex, ey); g.stroke();
          g.fillStyle = col.getStyle(); for (let t = 0.3; t < 1; t += 0.12) { const px = tx + (ex - tx) * t, py = ty + (ey - ty) * t - Math.sin(t * 3) * 6 * sc; blob(px, py + 4 * sc, 2 * sc, 6 * sc * (1 - t * 0.5), a); } }
        return;
      }
      if (!LOW && kind < 0.32) {                                            // a tree fern: short stem, arching frond rosette
        const ty = base - h * Q(0.12, 0.2) * sc; g.fillRect(x - tw * 0.3, ty, tw * 0.6, base - ty);
        g.strokeStyle = col.getStyle(); g.lineWidth = 2.5 * sc;
        for (let f = 0; f < 8; f++) { const a = -Math.PI + f * (Math.PI / 7), len = Q(26, 40) * sc; g.beginPath(); g.moveTo(x, ty); g.quadraticCurveTo(x + Math.cos(a) * len * 0.7, ty - len * 0.45, x + Math.cos(a) * len, ty + Math.abs(Math.sin(a)) * len * 0.1 + 6 * sc); g.stroke(); }
        return;
      }
      // a tall rainforest tree: tapered trunk, buttress roots, forked limbs, a spreading crown of leaf clusters
      g.beginPath(); g.moveTo(x - tw, base); g.lineTo(x - tw * 0.45, top + 20); g.lineTo(x + tw * 0.45, top + 20); g.lineTo(x + tw, base); g.fill();
      if (!LOW) for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(x + sd * tw * 0.5, base - Q(18, 34) * sc); g.quadraticCurveTo(x + sd * tw * 1.2, base - 6, x + sd * Q(16, 26) * sc, base); g.lineTo(x, base); g.fill(); }
      const limbs = LOW ? 0 : Math.round(Q(2, 4)), cr = Q(24, 38) * sc;
      g.strokeStyle = dark.getStyle(); g.lineCap = "round";
      const tips = [[x, top + 10]];
      for (let i = 0; i < limbs; i++) { const sd = i % 2 ? 1 : -1, y0 = top + Q(20, 60), ex = x + sd * Q(18, 40) * sc, ey = y0 - Q(10, 30) * sc;
        g.lineWidth = tw * 0.45; g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + sd * 6, y0 - 4, ex, ey); g.stroke(); tips.push([ex, ey]); }
      if (LOW) { g.fillStyle = col.getStyle(); for (let t = 0; t < 3; t++) { const yy = top + t * 22 * sc, rw = (18 + t * 10) * sc; g.beginPath(); g.moveTo(x, yy - 26 * sc); g.lineTo(x + rw, yy + 18 * sc); g.lineTo(x - rw, yy + 18 * sc); g.fill(); } return; }
      for (const [tx, ty] of tips) { g.fillStyle = dark.getStyle(); leafy(tx, ty + 4, cr * 0.9, 60, true); g.fillStyle = col.getStyle(); leafy(tx, ty - 2, cr * 0.8, 55, true); g.fillStyle = lite.getStyle(); leafy(tx - cr * 0.2, ty - cr * 0.25, cr * 0.45, 18, true); }
      if (Q(0, 1) < 0.6) { g.strokeStyle = dark.getStyle(); g.lineWidth = 1.2 * sc;   // lianas hanging from the crown
        for (let v = 0; v < 3; v++) { const vx = x + Q(-cr, cr), vy = top + Q(0, 20), len = Q(40, 110) * sc; g.beginPath(); g.moveTo(vx, vy); g.quadraticCurveTo(vx + Q(-8, 8), vy + len * 0.6, vx + Q(-4, 4), vy + len); g.stroke(); } }
    });
    // undergrowth band at the foot of the layer, then mist over it so the far layers fade
    g.fillStyle = dark.getStyle(); g.fillRect(0, base, w, h - base);
    if (!LOW) for (let x = 0; x < w; x += 22 * sc) { g.fillStyle = (Q(0, 1) < 0.5 ? col : dark).getStyle(); leafy(x, base - Q(2, 10) * sc, Q(12, 20) * sc, 26, true); }
    else for (let x = 0; x < w; x += 30 * sc) { g.fillStyle = col.getStyle(); g.beginPath(); g.moveTo(x, base + 6); g.lineTo(x + 15 * sc, base - 18 * sc); g.lineTo(x + 30 * sc, base + 6); g.fill(); }
    if (l < L - 1) { const m = g.createLinearGradient(0, 0, 0, h); const fc = (a) => `rgba(${Math.round(fogC.r * 255)},${Math.round(fogC.g * 255)},${Math.round(fogC.b * 255)},${a})`;
      m.addColorStop(0, fc(0.04)); m.addColorStop(0.55, fc(0.26)); m.addColorStop(1, fc(0.42)); g.fillStyle = m; g.fillRect(0, 0, w, h); }
  }
});
back.wrapS = THREE.RepeatWrapping; back.repeat.x = 2;
const sky = new THREE.Mesh(new THREE.CylinderGeometry(FAR, FAR, 34, 32, 1, true), new THREE.MeshBasicMaterial({ map: back, side: THREE.BackSide, fog: false }));
sky.position.y = 10; scene.add(sky);
// at night the backdrop's top melts into the night dome's rim colour, so there's no hard line where the two meet (Adriaen 2026-11-12)
const uSkyDusk = { value: 0 }, uSkyRim = { value: new THREE.Color(0x0b1622) };
sky.material.onBeforeCompile = (sh) => { sh.uniforms.uDusk = uSkyDusk; sh.uniforms.uRim = uSkyRim;
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uDusk; uniform vec3 uRim;")
    .replace("#include <opaque_fragment>", "outgoingLight = mix(outgoingLight, uRim, uDusk * smoothstep(0.45, 0.96, vMapUv.y));\n#include <opaque_fragment>"); };
// the open sky over the clearing: a low dome capping the backdrop, painted with soft clouds and a fringe of leaves round its rim
// (planar UVs, so the clouds don't pinch at the top); one draw, no fog, dimmed at dusk with the backdrop
const ZENITH = { moss: ["#e8f1df", "#a6cdd6"], paint: ["#fdf0dc", "#a3d5ec"], low: ["#e6f8ff", "#7fcfff"] }[LOOK];
const domeTex = canvasTex(1024, 1024, (g, w, h) => {
  const c = w / 2, gr = g.createRadialGradient(c * 1.1, c * 0.9, 0, c, c, c);
  gr.addColorStop(0, ZENITH[1]); gr.addColorStop(0.55, ZENITH[0]); gr.addColorStop(1, S.sky[0]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const sunG = g.createRadialGradient(c * 0.8, c * 1.15, 0, c * 0.8, c * 1.15, c * 0.35);   // a warm glow where the sun is (sun light comes from -x, +z)
  sunG.addColorStop(0, "rgba(255,246,214,.9)"); sunG.addColorStop(1, "rgba(255,246,214,0)"); g.fillStyle = sunG; g.fillRect(0, 0, w, h);
  for (let i = 0; i < (LOOK === "low" ? 9 : 16); i++) {              // clouds: clusters of soft (or, low-poly, crisp) puffs with a shaded underside
    const a = R(0, 6.28), r = R(0.05, 0.62) * c, x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, n = Math.round(R(4, 8)), sz = R(26, 56);
    for (const [dy, col] of [[sz * 0.18, LOOK === "moss" ? "rgba(196,210,200," : "rgba(214,226,236,"], [0, "rgba(255,255,255,"]]) for (let k = 0; k < n; k++) {
      const px = x + (k - n / 2) * sz * 0.55 + R(-8, 8), py = y + dy + R(-10, 6), rr = sz * R(0.55, 1);
      if (LOOK === "low") { g.fillStyle = col + "1)"; g.beginPath(); g.arc(px, py, rr, 0, 7); g.fill(); continue; }
      const b = g.createRadialGradient(px, py, 0, px, py, rr); b.addColorStop(0, col + ".75)"); b.addColorStop(0.6, col + ".45)"); b.addColorStop(1, col + "0)");
      g.fillStyle = b; g.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    }
  }
});
const domeGeo = new THREE.SphereGeometry(FAR, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1);
{ const p = domeGeo.attributes.position, uv = domeGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * FAR), 0.5 - p.getZ(i) / (2 * FAR)); }
const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide, fog: false }));
dome.position.y = 27; scene.add(dome);
// the night sky (camp review B1, Adriaen 2026-11-12): a second dome, deep blue to near black at the rim, with stars and a few faint
// wisps, faded in over the day dome with dusk; and the moon, a soft disc with a halo, up in the canopy gap where the start view sees
// it (one sprite each, no fog). Same dome geometry, so 2 draws more at night only.
const nightTex = canvasTex(1024, 1024, (g, w, h) => {
  const { R: Q } = lcg(777);
  const c = w / 2, gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, "#0d1a33"); gr.addColorStop(0.6, "#122440"); gr.addColorStop(1, "#0b1622"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {                                     // stars: many faint, a few bright with a glint
    const a = Q(0, 6.28), r = Math.sqrt(Q(0, 1)) * c * 0.95, x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, b = Q(0, 1) ** 3;
    g.fillStyle = `rgba(${220 + Q(0, 35) | 0},${225 + Q(0, 30) | 0},255,${0.25 + 0.75 * b})`; g.beginPath(); g.arc(x, y, 0.6 + b * 1.6, 0, 7); g.fill();
    if (b > 0.7) { const s = g.createRadialGradient(x, y, 0, x, y, 7); s.addColorStop(0, "rgba(200,215,255,.35)"); s.addColorStop(1, "rgba(200,215,255,0)"); g.fillStyle = s; g.fillRect(x - 7, y - 7, 14, 14); }
  }
  for (let i = 0; i < 7; i++) { const x = Q(0.2, 0.8) * w, y = Q(0.2, 0.8) * h, rr = Q(60, 140);   // thin moonlit wisps
    const b = g.createRadialGradient(x, y, 0, x, y, rr); b.addColorStop(0, "rgba(120,140,185,.16)"); b.addColorStop(1, "rgba(120,140,185,0)"); g.fillStyle = b; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
});
const nightDome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ map: nightTex, side: THREE.BackSide, fog: false, transparent: true, opacity: 0, depthWrite: false }));
nightDome.position.y = 27; nightDome.visible = false; nightDome.renderOrder = -1; scene.add(nightDome);
const moonTex = canvasTex(128, 128, (g, w) => {
  const c = w / 2, h = g.createRadialGradient(c, c, 0, c, c, c); h.addColorStop(0, "rgba(220,230,255,.55)"); h.addColorStop(0.28, "rgba(190,205,250,.28)"); h.addColorStop(1, "rgba(160,180,240,0)");
  g.fillStyle = h; g.fillRect(0, 0, w, w);
  const d = g.createRadialGradient(c - 4, c - 4, 0, c, c, w * 0.16); d.addColorStop(0, "#fbfcff"); d.addColorStop(0.85, "#e4e9f6"); d.addColorStop(1, "#cdd5ea");
  g.fillStyle = d; g.beginPath(); g.arc(c, c, w * 0.16, 0, 7); g.fill();
  g.fillStyle = "rgba(150,160,190,.25)"; for (const [x, y, r] of [[-5, -3, 4], [4, 5, 3], [6, -6, 2.4], [-2, 7, 2]]) { g.beginPath(); g.arc(c + x, c + y, r, 0, 7); g.fill(); }   // maria
});
const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, opacity: 0, depthWrite: false }));
moon.scale.setScalar(9); moon.visible = false; moon.renderOrder = -1; scene.add(moon);
scene.background = new THREE.Color(S.sky[0]);
const gTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = hex(new THREE.Color(S.leaf[2]).lerp(new THREE.Color(S.bark[1]), 0.45).getHex()); g.fillRect(0, 0, w, h);
  for (let i = 0; i < (LOOK === "low" ? 0 : 900); i++) { g.fillStyle = hex(S.leaf[i % 4]); g.globalAlpha = R(0.15, 0.5); g.beginPath(); g.ellipse(R(0, w), R(0, h), R(2, 8), R(1, 3), R(0, 3), 0, 7); g.fill(); }
});
gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(10, 10);
const ground = new THREE.Mesh(new THREE.CircleGeometry(FAR, 40), new THREE.MeshLambertMaterial({ map: gTex }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);


export { dome, ground, moon, nightDome, sky, uSkyDusk };   // ground: the old forest-floor disc, hidden once the one ground mesh (ground.js) is up
