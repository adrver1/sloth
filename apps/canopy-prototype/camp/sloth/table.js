// Canopy Camp sloths, the food places (Adriaen 2026-11-12: "have them pick up the food item and eat it; crawl on top of the
// table or reach into the crate", no words or emojis): a fruit lies at each place, on the table top or on what fills the
// crate (the tins, or the plates on them: found by a ray down, so it never floats, Adriaen 2026-11-15). A new fruit is
// put out a while after one is eaten. The fruit are camp/food.js's (mango, apple, banana, fig, lime:
// 20 to 35 triangles each, one shared material), the same ones you carry and give.
//   buildTable()        measures where the paw is at the grab of the two eat clips (sloths.js, in its place in the build order)
//   buildPlaces()       makes the places and puts a fruit at each, drawing from the sloths' day stream (sloths.js
//                       buildSlothPlaces, called by main.js once the blockers are in); without a table or a crate (?lived=0)
//                       that one has none
//   pois()              the places: [{ name: "table" | "crate", c, slots }], two on the table (its two ends) and two at the
//                       crate; [] before buildPlaces. A slot: { name, key (the place it claims, places.js), p
//                       (where to walk to), u, yaw, clip (eat or eat_high), who, h (the table top), food: { at, mesh, back
//                       (seconds until a new fruit), grow } }
//   fruit(mesh)         a new fruit (camp/food.js makeFood), or the same mesh as a new kind (draws two numbers)
//   restOn(food)        lays the food's fruit on the surface at its place (eating.js: the next fruit a table eater takes)
//   sitFor(slot, sc)    where a sloth of size sc sits so that its paw meets the fruit
//   fruitStep(sd)       each frame: a fruit is put out again a while after one is eaten, and grows to its size
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { rng, scene } from "../core.js";
const { R } = rng("slothDay");
import { V, sstep } from "../util.js";
import { CRATE, RC, TABLE } from "../layout.js";
import { SLOTH } from "./state.js";
import { EAT_GRAB, clipOf } from "./clips.js";
import { armBones, pawOf } from "./arms.js";
import { yawQ } from "./poses.js";
import { isFree } from "./walk.js";
import { FRUIT, foodGeo, makeFood, restHeight } from "../food.js";

const DOWN = V(0, -1, 0), tmp = V(), ray = new THREE.Raycaster();
let POIS = null;
const GRAB = {};                                     // where the paw is at the grab, in the sloth's own frame at scale 1
function buildTable() {
  { const o = clone(SLOTH.scene), m = new THREE.AnimationMixer(o), arm = armBones(o, "R");
    for (const n of ["eat", "eat_high"]) { m.stopAllAction(); const a = m.clipAction(clipOf(n)); a.play(); a.time = EAT_GRAB; m.update(0); o.updateMatrixWorld(true); GRAB[n] = pawOf({ arm }, V()); } }
}
function fruit(m) {                                  // a new fruit (or the same mesh as a new kind), upright at its real size, so restOn sits it on its lowest point
  const kind = FRUIT[Math.floor(R(0, FRUIT.length))][0];
  if (m) { m.geometry = foodGeo(kind); m.name = `food_${kind}`; m.userData.kind = kind; } else m = makeFood(kind);
  m.scale.copy(m.userData.base); m.rotation.set(0, R(0, 6.3), 0); m.visible = true; if (!m.parent) scene.add(m); return m;
}
const restOn = (F) => F.mesh.position.copy(F.at).setY(F.at.y + restHeight(F.mesh));   // lying on the surface at F.at
function sitFor(slot, sc) {                          // where it sits so that its paw meets the fruit (scale sc)
  return slot.food.at.clone().sub(GRAB[slot.clip].clone().multiplyScalar(sc).applyQuaternion(yawQ(slot.yaw))).setY(slot.h);
}
// how far from c along u the top of obj reaches (to 2 cm, up to 1.48 m). It walks in from the far side of obj's bounding
// box and stops at the first hit, so it casts a handful of rays a direction instead of 75 (review R2-080).
function edgeOf(obj, box, c, u, minY) {             // box: obj's bounding box in the world
  let reach = 0; for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) reach = Math.max(reach, (x - c.x) * u.x + (z - c.z) * u.z);
  for (let k = Math.min(74, Math.ceil(reach / 0.02)); k > 0; k--) {
    const d = k * 0.02; ray.set(tmp.set(c.x + u.x * d, 3, c.z + u.z * d), DOWN); ray.far = 4;
    const h = ray.intersectObject(obj, true)[0]; if (h && h.point.y > minY) return d;
  }
  return 0;
}
const topAt = (objs, p) => { ray.set(tmp.set(p.x, 3, p.z), DOWN); ray.far = 4; return ray.intersectObjects(objs, true)[0]?.point.y ?? 0; };   // the highest of objs (a list) under p
// the places, made once in the build order (main.js, after the glade, the tent's walls and the chores have added their
// blockers, since a place's ground point must be free on the sloths' grid). They used to be made on the first frame.
function buildPlaces() {
  POIS = [];
  const inCrate = ["KitchenCrate", "KitchenThings"].map((n) => scene.getObjectByName(n)).filter(Boolean);   // the crate (its tins) and the pan, plates and jar on them
  for (const o of inCrate) o.updateWorldMatrix(true, false);   // stood in place (campProps.js stand) but not drawn yet, so the rays see them where they are
  for (const [name, obj, c, minY, n] of [["table", scene.getObjectByName("Table"), TABLE.at, 0.5, 2], ["crate", scene.getObjectByName("KitchenCrate"), CRATE.at, 0.15, 2]]) {
    if (!obj) continue;
    const cand = [], box = new THREE.Box3().setFromObject(obj);
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * 2 * Math.PI, u = V(Math.cos(a), 0, Math.sin(a)), edge = edgeOf(obj, box, c, u, minY); if (!edge) continue;
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
        slot.h = topAt([obj], c.clone().addScaledVector(q.u, q.edge - 0.1));
        at = c.clone().addScaledVector(q.u, q.edge - 0.16).add(GRAB.eat.clone().multiplyScalar(2).applyQuaternion(yawQ(yaw)));
        at.y = topAt([obj], at);
      } else {                                      // just inside the rim, lying on whatever is there: the tins that fill the crate, the plates
        at = c.clone().addScaledVector(q.u, q.edge - 0.09); at.y = topAt(inCrate, at);
      }
      slot.food = { at, mesh: fruit(), back: 0 }; restOn(slot.food);
      slots.push(slot);
    }
    POIS.push({ name, c, slots });
  }
}
const pois = () => POIS ?? [];
function fruitStep(sd) {
  if (!POIS) return;
  for (const P of POIS) for (const q of P.slots) {
    const F = q.food;
    if (F.back) {                                    // fruit put out again a while after one is eaten
      F.back = Math.max(0, F.back - sd);
      if (F.back > 0 || q.who) { if (!F.back) F.back = 1; }
      else { fruit(F.mesh); restOn(F); F.mesh.scale.multiplyScalar(0.01); F.grow = 0; }
    }
    if (F.grow != null) { F.grow = Math.min(1, F.grow + sd); F.mesh.scale.copy(F.mesh.userData.base).multiplyScalar(Math.max(0.01, sstep(0, 1, F.grow))); if (F.grow >= 1) F.grow = null; }   // and grows to its size
  }
}

export { buildPlaces, buildTable, fruit, fruitStep, pois, restOn, sitFor };
