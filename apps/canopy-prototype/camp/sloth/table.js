// Canopy Camp sloths, the food places (Adriaen 2026-11-12: "have them pick up the food item and eat it; crawl on top of the
// table or reach into the crate", no words or emojis): a fruit lies at each place, on the table top or on the things in the
// crate. A new fruit is put out a while after one is eaten. Fruit: one 20-triangle icosahedron each, coloured and
// stretched per kind.
//   buildTable()        measures where the paw is at the grab of the two eat clips and makes the fruits' shape (sloths.js,
//                       in its place in the build order)
//   pois()              the places: [{ name: "table" | "crate", c, slots }], two on the table (its two ends) and two at the
//                       crate; made the first time it is called once the props are in (it puts a fruit at each, drawing
//                       from the seeded stream), [] until then. A slot: { name, key (the place it claims, places.js), p
//                       (where to walk to), u, yaw, clip (eat or eat_high), who, h (the table top), food: { at, mesh, back
//                       (seconds until a new fruit), grow } }
//   fruit(mesh)         a new fruit, or the same mesh as a new kind (draws two numbers)
//   restOn(food)        lays the food's fruit on the surface at its place (eating.js: the next fruit a table eater takes)
//   sitFor(slot, sc)    where a sloth of size sc sits so that its paw meets the fruit
//   fruitStep(sd)       each frame: a fruit is put out again a while after one is eaten, and grows to its size
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { R, scene } from "../core.js";
import { V, sstep } from "../util.js";
import { CRATE, RC, TABLE } from "../layout.js";
import { SLOTH } from "../campProps.js";
import { EAT_GRAB, clipOf } from "./clips.js";
import { armBones, pawOf } from "./arms.js";
import { yawQ } from "./poses.js";
import { isFree } from "./walk.js";

const DOWN = V(0, -1, 0), tmp = V(), ray = new THREE.Raycaster();
let POIS = null, fruitGeo = null;
const GRAB = {};                                     // where the paw is at the grab, in the sloth's own frame at scale 1
function buildTable() {
  { const o = clone(SLOTH.scene), m = new THREE.AnimationMixer(o), arm = armBones(o, "R");
    for (const n of ["eat", "eat_high"]) { m.stopAllAction(); const a = m.clipAction(clipOf(n)); a.play(); a.time = EAT_GRAB; m.update(0); o.updateMatrixWorld(true); GRAB[n] = pawOf({ arm }, V()); } }
  fruitGeo = new THREE.IcosahedronGeometry(0.5, 0);   // unit size, scaled to the fruit
}
// each fruit its real size in metres, across x up y long z (Adriaen: "appropriately sized for what they are")
const FRUIT = [[0xffa531, [0.08, 0.075, 0.11]], [0xe8473a, [0.08, 0.075, 0.08]], [0xffd94d, [0.036, 0.036, 0.18]], [0x8a4fa8, [0.05, 0.055, 0.05]], [0x9fd36a, [0.055, 0.05, 0.055]]];   // mango, apple, banana, fig, lime
function fruit(m) {                                  // a new fruit (or the same mesh as a new kind)
  m ??= new THREE.Mesh(fruitGeo, new THREE.MeshLambertMaterial());
  const [c, k] = FRUIT[Math.floor(R(0, FRUIT.length))]; m.material.color.setHex(c); m.userData.base = V(...k); m.scale.copy(m.userData.base);
  m.rotation.set(0, R(0, 6.3), 0.3); m.visible = true; if (!m.parent) scene.add(m); return m;
}
const restOn = (F) => F.mesh.position.copy(F.at).setY(F.at.y + F.mesh.userData.base.y / 2);   // lying on the surface at F.at
function sitFor(slot, sc) {                          // where it sits so that its paw meets the fruit (scale sc)
  return slot.food.at.clone().sub(GRAB[slot.clip].clone().multiplyScalar(sc).applyQuaternion(yawQ(slot.yaw))).setY(slot.h);
}
function edgeOf(obj, c, u, minY) {                    // how far from c along u the top of obj reaches
  let edge = 0;
  for (let d = 0; d < 1.5; d += 0.02) { ray.set(V(c.x + u.x * d, 3, c.z + u.z * d), DOWN); ray.far = 4; const h = ray.intersectObject(obj, true)[0]; if (h && h.point.y > minY) edge = d; }
  return edge;
}
const topAt = (obj, p) => { ray.set(V(p.x, 3, p.z), DOWN); ray.far = 4; return ray.intersectObject(obj, true)[0]?.point.y ?? 0; };
function pois() {                                   // two places on the table (its two ends) and two at the crate
  if (POIS) return POIS;
  const kc = scene.getObjectByName("KitchenCrate");   // (the lived-in props come in a moment after the rest)
  if (kc && kc.getWorldPosition(tmp).distanceTo(CRATE.at) > 0.3) return [];
  POIS = [];
  for (const [name, obj, c, minY, n] of [["table", scene.getObjectByName("Table"), TABLE.at, 0.5, 2], ["crate", scene.getObjectByName("KitchenCrate"), CRATE.at, 0.15, 2]]) {
    if (!obj) continue;
    const cand = [];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * 2 * Math.PI, u = V(Math.cos(a), 0, Math.sin(a)), edge = edgeOf(obj, c, u, minY); if (!edge) continue;
      const g = c.clone().setY(0).addScaledVector(u, edge + (name === "table" ? 0.36 : 0.62));   // on the ground just off the edge
      if (Math.hypot(g.x, g.z) > RC - 1.2 || !isFree(g)) continue;
      cand.push({ u, edge, g });
    }
    if (name === "table") cand.sort((a, b) => b.edge - a.edge); else cand.sort((a, b) => a.g.length() - b.g.length());   // the table's long ends; the crate's camp side
    const slots = [];
    for (const q of cand) {
      if (slots.length >= n || slots.some((o) => o.u.dot(q.u) > (name === "table" ? 0.3 : 0.6))) continue;
      const yaw = Math.atan2(q.u.x, q.u.z), clip = name === "table" ? "eat" : "eat_high", slot = { name, key: `${name}:${slots.length}`, p: q.g, u: q.u, yaw, clip, who: null, h: 0 };
      let at;
      if (name === "table") {                       // a sloth of scale 2 sits 16 cm in from the edge; the fruit where its paw lands
        slot.h = topAt(obj, c.clone().addScaledVector(q.u, q.edge - 0.1));
        at = c.clone().addScaledVector(q.u, q.edge - 0.16).add(GRAB.eat.clone().multiplyScalar(2).applyQuaternion(yawQ(yaw)));
        at.y = topAt(obj, at);
      } else {                                      // just inside the rim, on the things in the crate
        at = c.clone().addScaledVector(q.u, q.edge - 0.09); at.y = 0.27;
      }
      slot.food = { at, mesh: fruit(), back: 0 }; restOn(slot.food);
      slots.push(slot);
    }
    POIS.push({ name, c, slots });
  }
  return POIS;
}
function fruitStep(sd) {
  for (const P of POIS ?? []) for (const q of P.slots) {   // fruit put out again a while after one is eaten
    const F = q.food; if (!F.back) continue;
    F.back = Math.max(0, F.back - sd); if (F.back > 0 || q.who) { if (!F.back) F.back = 1; continue; }
    fruit(F.mesh); restOn(F); F.mesh.scale.multiplyScalar(0.01); F.grow = 0;
  }
  for (const P of POIS ?? []) for (const q of P.slots) { const F = q.food; if (F.grow != null) { F.grow = Math.min(1, F.grow + sd); F.mesh.scale.copy(F.mesh.userData.base).multiplyScalar(Math.max(0.01, sstep(0, 1, F.grow))); if (F.grow >= 1) F.grow = null; } }
}

export { buildTable, fruit, fruitStep, pois, restOn, sitFor };
