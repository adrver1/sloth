// The jeep's headlights, the same in both levels (Adriaen 2026-11-15: "driving the car at night I noticed that we actually need
// headlights after all"; he picked glow, beams and a pool of light over live spot lights): a glow on each lens, a soft beam out
// of each (a vertical and a flat card, crossed), and a warm pool of light on the ground ahead. No scene light: one additive
// mesh with one painted texture, 14 triangles in 1 draw, hidden while they are off.
// addHeadlights(jeep) -> { step(dt, on) }: jeepRig.js adds them to the jeep's node (they ride with it) and steps them each frame,
// on (0..1) from the rig (api.engineOn from car.js, api.driving from the drive shots, times the night, stage.js uNight).
// The lenses (props/jeep/build_jeep.py LAMP_X, LAMP_Z, FRONT): x +-0.6, 0.83 up, 1.65 ahead of the jeep's middle (+Z its front).
import * as THREE from "three";
import { canvasTex } from "./util.js";

const LAMP = { x: 0.6, y: 0.83, z: 1.66 };
let tex = null;
// one texture: the lens glow (top left), the beam (top right: bright at the lens end, fading along and across), the pool (bottom half)
function paint() {
  return canvasTex(256, 256, (g) => {
    let r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,250,230,1)"); r.addColorStop(0.25, "rgba(255,236,190,.8)"); r.addColorStop(1, "rgba(255,220,160,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x++) { const along = Math.pow(1 - x / 128, 1.6);
      for (let y = 0; y < 128; y++) { const across = Math.exp(-(((y - 64) / 34) ** 2)); g.fillStyle = `rgba(255,236,190,${(along * across).toFixed(3)})`; g.fillRect(128 + x, y, 1, 1); } }
    g.save(); g.translate(128, 192); g.scale(1, 0.5); r = g.createRadialGradient(0, 0, 0, 0, 0, 128); r.addColorStop(0, "rgba(255,232,180,.9)"); r.addColorStop(0.6, "rgba(255,220,160,.35)"); r.addColorStop(1, "rgba(255,210,150,0)");
    g.fillStyle = r; g.fillRect(-128, -128, 256, 256); g.restore();
  });
}

export function addHeadlights(jeep) {
  tex ??= paint();
  const pos = [], uv = [], idx = [];
  const quad = (a, b, c, d, [u0, v0, u1, v1]) => { const n = pos.length / 3; pos.push(...a, ...b, ...c, ...d); uv.push(u0, v0, u1, v0, u1, v1, u0, v1); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
  const GLOW = [0, 0.5, 0.5, 1], BEAM = [0.5, 0.5, 1, 1], POOL = [0, 0, 1, 0.5], L = 6;   // L: the beams' length, metres
  for (const s of [-1, 1]) {
    const x = s * LAMP.x, { y, z } = LAMP, g = 0.22;
    quad([x - g, y - g, z + 0.01], [x + g, y - g, z + 0.01], [x + g, y + g, z + 0.01], [x - g, y + g, z + 0.01], GLOW);   // on the lens, facing ahead
    // the beam: u runs along it (lens to tip), v across; it widens and dips a little toward the ground
    quad([x, y - 0.08, z], [x, y - 0.6, z + L], [x, y + 0.5, z + L], [x, y + 0.08, z], BEAM);
    quad([x - 0.08, y, z], [x - 0.9, y - 0.45, z + L], [x + 0.9, y - 0.45, z + L], [x + 0.08, y, z], BEAM);
  }
  quad([-1.6, 0.1, 2.2], [1.6, 0.1, 2.2], [1.8, 0.1, 8.5], [-1.8, 0.1, 8.5], POOL);   // the pool on the ground ahead, 10 cm up so bumps in the ground ahead do not swallow it
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true, fog: false,   // one pass (a double-sided see-through material draws twice, with two shaders)
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = "Headlights"; mesh.visible = false; mesh.renderOrder = 3; mesh.raycast = () => {};   // taps go through the light
  jeep.add(mesh);
  let k = 0;
  return {
    step(dt, on) { k += (on - k) * Math.min(1, dt * 4); if (k < 0.01 && on === 0) k = 0; mesh.visible = k > 0; mat.opacity = 0.85 * k; },
  };
}
