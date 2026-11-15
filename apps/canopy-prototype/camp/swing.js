// Canopy Camp swing: the two props a sloth sets moving (camp review sloths-32: they are props, not sloths; they lived in
// sloths.js). Both add a vertex-shader hook after the prop's baked-light hook (campProps.js lnight) with util.js
// patchMaterial, as the other modules do (review props-13).
//   HAMMOCK_PIVOT          how high the hammock's rope knots are: the line it swings about
//   makeHammockSwing()     adds a group at the hammock's pivot line to the scene and gives the Hammock mesh a material of
//                          its own that swings the sling and its ropes about that line (the posts and the leaves on top stay
//                          put). Returns { swing: the group that swings with it (the napper lies in it), push: 0..1, a harder
//                          swing for a while (set it to 1 after a boop), step(dt): each frame, a slow swing that push adds to }
//   makeClothBrush()       the laundry line's towel and socks sway in a breeze (uTime), and swing aside round the line where
//                          a sloth brushes past. Returns brush(p, on, dt): p where the sloth is (world), on while it is at the
//                          cloth; or null when there is no cloth
// sloth/spots.js buildSpots calls both while it builds the camp sloths' spots, so the scene's objects keep their order; nothing runs on import.
import * as THREE from "three";
import { scene, uTime } from "./core.js";
import { HAMMOCK, LAUNDRY } from "./layout.js";
import { patchMaterial, swap } from "./util.js";

const HAMMOCK_PIVOT = 1.75;

function makeHammockSwing() {
  const PIV = HAMMOCK_PIVOT, sway = { value: 0 };
  const hg = new THREE.Group(); hg.position.set(HAMMOCK.mid.x, PIV, HAMMOCK.mid.z); hg.rotation.y = HAMMOCK.yaw; scene.add(hg);
  const swing = new THREE.Group(); hg.add(swing);
  const ham = scene.getObjectByName("Hammock");
  if (ham) {
    const mat = ham.material.clone(); mat.onBeforeCompile = ham.material.onBeforeCompile;   // clone() drops the hook: keep the baked night light and sun shadow (campProps.js lnight)
    patchMaterial(mat, "sway", (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = swap(sh.vertexShader, ["#include <common>", "#include <common>\nuniform float uSway;"], ["#include <begin_vertex>", `#include <begin_vertex>
        float sw = uSway * (1.0 - smoothstep(1.03, 1.43, abs(transformed.x))) * (1.0 - smoothstep(1.8, 1.95, transformed.y));
        vec2 q = transformed.yz - vec2(${PIV.toFixed(2)}, 0.0); float cs = cos(sw), sn = sin(sw);
        transformed.yz = vec2(${PIV.toFixed(2)}, 0.0) + vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);`]);
    });
    ham.material = mat;
  }
  const H = { swing, push: 0, step(dt) {
    H.push = Math.max(0, H.push - dt * 0.25);
    sway.value = (0.055 + 0.1 * H.push) * Math.sin(uTime.value * 2 * Math.PI / 5.2); swing.rotation.x = sway.value;
  } };
  return H;
}

function makeClothBrush() {
  const LL = LAUNDRY, cloth = scene.getObjectByName("LaundryCloth");
  if (!cloth?.material) return null;
  const L = LL.a.distanceTo(LL.b), u = { uX: { value: 0 }, uPush: { value: 0 }, uTime }, mat = cloth.material;   // uTime: the breeze (props thread)
  patchMaterial(mat, "brush", (sh) => {   // after the props thread's night light (lnight)
    Object.assign(sh.uniforms, u);
    sh.vertexShader = swap(sh.vertexShader, ["#include <common>", "#include <common>\nuniform float uX, uPush, uTime;"], ["#include <begin_vertex>", `#include <begin_vertex>
      float lt = transformed.x / ${L.toFixed(3)} + 0.5, ly = ${LL.a.y.toFixed(3)} - ${LL.sag.toFixed(3)} * 4.0 * lt * (1.0 - lt);
      float sw = -1.1 * uPush * (1.0 - smoothstep(0.2, 0.45, abs(transformed.x - uX)));
      vec2 q = transformed.yz - vec2(ly, 0.0);
      // a gentle breeze: slow gusts roll along the line, and the cloth bends a little more toward its hem (props thread)
      float gust = 0.55 + 0.45 * sin(uTime * 0.37 + 1.3) * sin(uTime * 0.23);
      sw += gust * (0.16 * sin(uTime * 1.6 - transformed.x * 1.8) + 0.06 * sin(uTime * 3.7 - transformed.x * 5.0)) * (1.0 + 2.5 * max(0.0, -q.x));
      float cs = cos(sw), sn = sin(sw);
      transformed.yz = vec2(ly, 0.0) + vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);`]);
  });
  mat.needsUpdate = true;
  return (p, on, dt) => { u.uX.value = cloth.worldToLocal(p.clone()).x; u.uPush.value += ((on ? 1 : 0) - u.uPush.value) * Math.min(1, dt * 2); };
}

export { HAMMOCK_PIVOT, makeClothBrush, makeHammockSwing };
