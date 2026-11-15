// Camp activities, shared parts: the geometry, materials and painted textures the chores share (a log, a soup bowl and its
// soup, the pot's surface shade, a bubble), made once when the page loads, and the food's names. Triangles: a log 24 with
// its caps, a bowl 16 and its soup 8 (which stays as the empty bowl's floor).
// Exports the parts by name, paintLogs(woodTex, spots) (the logs take the props' wood atlas at spots, from lived.glb), soupBowl() (a new bowl of soup),
// an(name) ("a" or "an") and flat(a, b) (the distance between two points on the ground).
import * as THREE from "three";
import { FRUIT, VEG as VEG_KINDS } from "../camp/food.js";
import { canvasTex } from "../camp/util.js";

// the food's names and emojis, in the order you take them: vegetables from the crate, fruit from the fruit plate
export const VN = VEG_KINDS.map((v) => v[0]), VEG = VEG_KINDS.map((v) => v[1]);
export const FN = FRUIT.map((f) => f[0]), FE = FRUIT.map((f) => f[1]);
export const an = (name) => (/^[aeiou]/.test(name) ? "an" : "a");
export const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);   // how far apart on the ground

const tex = (w, h, draw) => canvasTex(w, h, draw, { aniso: 1 });   // small textures seen up close: no anisotropic filtering
// a bark texture for logs: dark stripes along the length, a pale cut ring at one end of the strip
const barkTex = tex(64, 32, (g, w, h) => { g.fillStyle = "#6b4a32"; g.fillRect(0, 0, w, h); g.strokeStyle = "#4a3222"; g.lineWidth = 2;
  for (let y = 3; y < h; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (y % 2 ? 1 : -1)); g.stroke(); } });
export const logGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.6, 6, 1);   // 24 tris with caps
export const logMat = new THREE.MeshLambertMaterial({ map: barkTex });
// a little enamel bowl of soup: an open 8-sided cup (16 tris) with the soup as an 8-sided disc inside (8 tris)
export const bowlGeo = new THREE.CylinderGeometry(0.075, 0.048, 0.05, 8, 1, true); bowlGeo.translate(0, 0.025, 0);
export const bowlMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8, side: THREE.DoubleSide });   // cream enamel, so it reads on the wooden seats
export const soupGeo = new THREE.CircleGeometry(0.068, 8).rotateX(-Math.PI / 2); soupGeo.translate(0, 0.04, 0);
export const soupMat = new THREE.MeshLambertMaterial({ color: 0xd9822e });
// the bowl's floor once the soup is eaten: the soup disc stays at the bottom in a slightly shaded enamel, since the cup is open below
export const emptyMat = new THREE.MeshLambertMaterial({ color: 0xd9d0bd });
// the pot's surface: a soft radial shade, tinted per stage (iron, water, broth), 12 tris
export const surfTex = tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, "#ffffff"); r.addColorStop(0.75, "#d8d8d8"); r.addColorStop(1, "#8a8a8a"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
export const bubbleTex = tex(32, 32, (g) => { g.strokeStyle = "rgba(255,244,225,.95)"; g.lineWidth = 3; g.beginPath(); g.arc(16, 16, 11, 0, 7); g.stroke(); g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.arc(16, 16, 9, 0, 7); g.fill(); });

// The carried logs' spots in the stack's atlas (props/lived/wood_stack.jpg, 1024 px, y down), which has log ends on the
// top half and the logs seen from above bottom right: the sides take one log's strip (x0, y0, width, height; mirrored
// round, so no seam) and the caps one round end (centre x, y and half-size). They are set once, in props/lived/build_lived.py
// CARRIED, and the light bake puts them on the WoodStack in lived.glb (camp/campProps.js WOOD_SPOTS, review R2-243).
export function paintLogs(woodTex, spots) {
  if (!spots) { console.error("lived.txt's WoodStack has no carried spots; rebuild it (props/bake_all.py)"); return; }
  const px = (x, y) => [x / 1024, woodTex.flipY ? 1 - y / 1024 : y / 1024], uv = logGeo.attributes.uv, side = (6 + 1) * 2;
  const [sx, sy, sw, sh] = spots.side, [ex, ey, eh] = spots.end;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, ...(i < side ? px(sx + sw * Math.abs(2 * u - 1), sy + sh * v) : px(ex + (u - 0.5) * 2 * eh, ey + (v - 0.5) * 2 * eh))); }
  uv.needsUpdate = true; logMat.map = woodTex; logMat.needsUpdate = true;
}
// a bowl of soup: the cup and the soup's disc in one group
export const soupBowl = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(bowlGeo, bowlMat), new THREE.Mesh(soupGeo, soupMat)); return g; };
