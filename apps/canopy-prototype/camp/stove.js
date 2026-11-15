// The tent stove's fire, the same in both levels (Adriaen 2026-11-15: "in the mountain camp, the stove in the tent should
// also be lit, casting light"): an amber glow at its fire door and a warm pool on the floor before it, flickering, faint by
// day and full at night. Two additive quads (4 triangles, 2 draws), no scene light, so phones pay nothing per pixel. Its
// smoke is the atmosphere's (atmosphere.js chimneys).
// addStoveGlow({ into, camera, fog }) once the tent stands: into is the group the camp's frame is in (the camp's scene; the summit's
// campGroup); it reads the stage's clock and night (stage.js uTime, uNight), which each level sets.
import * as THREE from "three";
import { canvasTex } from "./util.js";
import { TENT } from "./layout.js";
import { uNight, uTime } from "./stage.js";

let glowTex = null;
export function addStoveGlow({ into, camera, fog = true }) {   // fog: false at the summit, whose fog chunk needs its own uniforms (summit/core.js)
  glowTex ??= canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,240,200,1)"); r.addColorStop(0.3, "rgba(255,200,120,.7)"); r.addColorStop(1, "rgba(255,160,80,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const at = TENT.fromLocal;   // the tent's own (Blender) frame: x across, -y toward the fire
  const amber = (size, y, onFloor) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog,
      polygonOffset: onFloor, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));   // the pool drawn over the floor planks (2 cm up) at any distance
    if (onFloor) m.rotation.x = -Math.PI / 2; m.position.copy(at(onFloor ? 0.45 : 0.76, TENT.stove[1])).setY(y); m.name = "StoveGlow"; m.renderOrder = 3;   // after the tent (at the summit its canvas is drawn with the see-through things and writes depth)
    m.onBeforeRender = () => { m.material.opacity = (onFloor ? 0.18 + 0.6 * uNight.value : 0.35 + 0.65 * uNight.value) * (0.75 + 0.25 * Math.sin(uTime.value * 9.1) * Math.sin(uTime.value * 5.3 + 1)); if (!onFloor) m.quaternion.copy(camera.quaternion); };
    into.add(m); return m; };
  amber(1.6, 0.045, true); amber(0.5, 0.42, false);
}
