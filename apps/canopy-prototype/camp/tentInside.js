// Canopy Camp tent, inside: what stops you in the walk-in tent and the stove's glow (build_camp.py wall_tent, keep in step;
// the tent's frame and sizes are layout.js TENT). The walls stop you and the doorway lets you in, the bed along the left wall,
// the stove and the guy ropes' pegs outside are in the way: all circles added with campProps.js addBlocker, in place of the one big circle that stood for
// the tent until the ground was painted round it. The stove's amber light is two additive quads, no scene light.
// Exports buildTentInside(): main.js calls it once, after the ground is built (the ground reads the blockers first).
import * as THREE from "three";
import { camera, scene, uNight, uTime } from "./core.js";
import { addBlocker, dropBlockers, glowTex } from "./campProps.js";
import { TENT } from "./layout.js";

function buildTentInside() {
  const at = TENT.fromLocal;   // the tent's own (Blender) frame: x across, -y toward the fire
  const { W, yf, yb, DW } = TENT, wall = [];
  for (let y = yf; y <= yb + 0.01; y += 0.3) wall.push([-W, y], [W, y]);
  for (let x = -W + 0.3; x < W; x += 0.3) { wall.push([x, yb]); if (Math.abs(x) > DW + 0.12) wall.push([x, yf]); }
  dropBlockers("tent");
  for (const [x, y] of wall) addBlocker({ at: at(x, y), r: 0.1 });
  for (let y = yb - 0.3; y > yb - 1.9; y -= 0.35) addBlocker({ at: at(-W + 0.48, y), r: 0.18 });   // the bed, along the left wall
  addBlocker({ at: at(...TENT.stove), r: 0.3 });                                                 // the stove
  for (const g of TENT.pegs) addBlocker({ at: at(...g), r: 0.12 });                                // the guy ropes' pegs, outside
  // the stove's amber light: a glow at its fire door and a warm pool on the floor before it, flickering with the
  // fire; faint by day, full at night (two additive quads, no extra scene light, so phones pay nothing per pixel)
  const amber = (size, y, onFloor) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    if (onFloor) m.rotation.x = -Math.PI / 2; m.position.copy(at(onFloor ? 0.45 : 0.76, TENT.stove[1])).setY(y);
    m.onBeforeRender = () => { m.material.opacity = (onFloor ? 0.18 + 0.6 * uNight.value : 0.35 + 0.65 * uNight.value) * (0.75 + 0.25 * Math.sin(uTime.value * 9.1) * Math.sin(uTime.value * 5.3 + 1)); if (!onFloor) m.quaternion.copy(camera.quaternion); };
    scene.add(m); return m; };
  amber(1.6, 0.035, true); amber(0.5, 0.42, false);
}

export { buildTentInside };
