// Summit Cabin backdrop: the land beyond 1 km painted by eight cameras at your eye onto eight flat panels 3 km out, repainted
// one panel a frame after you move 20 m or climb 8 m, or the time, weather or haze change. backdrop.step() after each frame.
import * as THREE from 'three';
import { $, TRIS, isPhone } from './land.js';
import { camera, renderer, scene } from './core.js';
import { REAL, SLICES, levels, tmpC } from './terrain.js';
import { SKY, W_NOW } from './daylight.js';

// ---------------------------------------------------------------- the backdrop: the land beyond 1 km, painted on eight flat panels
// (Adriaen 2026-11-15: "the far away mountains can be painted as flat surfaces, since we never reach them"). Eight cameras at
// your eye, 45° apart, render only the far rings (layer 2, with the real ground's range cut out) into eight textures; each is
// shown on a flat panel 3 km out, square to its camera, so from where it was painted it looks exactly like the land. It is
// painted again, one panel a frame, when you have walked 20 m or climbed 8 m, or the time, weather or haze change.
export const backdrop = (() => {
  const W = isPhone ? 512 : 768, VF = 60, OV = 1.03, A = (OV * Math.tan(Math.PI / 8)) / Math.tan(THREE.MathUtils.degToRad(VF / 2)),   // OV: each panel 3 % wider, so neighbours overlap and no sky shows through the seam
    H = Math.round(W / A), RD = 3000;
  const cam = new THREE.PerspectiveCamera(VF, A, 1, 40000); cam.layers.set(2);
  const panels = [...Array(8)].map((_, k) => { const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * RD * OV * Math.tan(Math.PI / 8), 2 * RD * Math.tan(THREE.MathUtils.degToRad(VF / 2))), new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthWrite: false, fog: false, toneMapped: false }));
    m.material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <colorspace_fragment>', ''); };   // the texture already holds screen colours
    m.renderOrder = -4; scene.add(m); return { rt, m, yaw: (k * Math.PI) / 4 }; });
  let at = null, key = '', next = 8, pend = null;
  const stateKey = () => [+$('hour').value, SKY.haze ? 1 : 0, ...Object.values(W_NOW).map((v) => v.toFixed(2))].join();
  function paint(P, c) {
    cam.position.set(c.x, c.y, c.z); cam.rotation.set(0, P.yaw, 0); cam.updateMatrixWorld();
    const fwd = Math.atan2(-Math.cos(P.yaw), -Math.sin(P.yaw));   // only the far slices this panel can see
    for (const lv of levels) if (lv.L >= REAL) lv.parts.forEach((pg, k) => { const d = Math.abs(((((k + 0.5) / SLICES) * 2 * Math.PI - fwd + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); pg.userData.mesh.visible = k === SLICES || d < Math.PI / 4 + 0.2; });
    const keepRT = renderer.getRenderTarget(), auto = renderer.shadowMap.autoUpdate, cc = renderer.getClearAlpha(); renderer.getClearColor(tmpC);
    renderer.shadowMap.autoUpdate = false; renderer.setRenderTarget(P.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    renderer.setRenderTarget(keepRT); renderer.setClearColor(tmpC, cc); renderer.shadowMap.autoUpdate = auto;
    P.m.position.set(c.x - Math.sin(P.yaw) * RD, c.y, c.z - Math.cos(P.yaw) * RD); P.m.rotation.set(0, P.yaw, 0);
  }
  function step(all) {
    all = all || !at; const e = camera.position, k2 = stateKey();
    if (!at || Math.hypot(e.x - at.x, e.z - at.z) > 20 || Math.abs(e.y - at.y) > 8 || k2 !== key) { at = { x: e.x, y: e.y, z: e.z }; key = k2; pend = { ...at }; next = 0; }
    const was = next; do { if (next < 8) paint(panels[next++], pend); } while (all && next < 8);
    return next !== was;   // painted a panel this frame
  }
  TRIS.push(['Painted backdrop beyond 1 km (8 panels)', 16]);
  return { step, panels };
})();
