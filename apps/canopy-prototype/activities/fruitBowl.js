// Camp activities, the fruit plate: the white plate on the snack table, which the highlight lights up on its own (Adriaen
// 2026-11-13: light up just the bowl). From the next light rebake on, props/camp/build_camp.py exports it as its own object,
// "FruitBowl", a child of the Table (review R2-159), and splitBowl just hands that back. Until then the plate is part of the
// Table mesh in models/camp_picked_lm.txt, and splitBowl cuts it off at run time: the triangles over the plank tops within
// 17 cm of the plate's middle (Blender (-0.2, -0.05), radius 0.14) go into their own mesh, a child of the table with the same
// material, attributes and light map (a new index on the shared buffers), one more draw. A Table baked before review R2-176
// still has three red tomatoes on the plate; their triangles (red vertex colours) are left out. Once the rebaked GLB is in,
// the cutting code can go (keep the lookup).
// On the plate lie the fruit the plate hands out (review R2-176): one each of camp/food.js FRUIT (mango, apple, banana, fig
// and lime), merged into one mesh with food.js's material, lit live like the food in your hand: 116 triangles, one draw.
// Exports splitBowl(table): the FruitBowl mesh (the fruit is its child, so the highlight lights both), or null when the
// table has no plate.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FRUIT, makeFood } from "../camp/food.js";
import { V } from "../camp/util.js";

const PLATE = { x: -0.2, z: 0.05, top: 0.7 };   // the plate's middle and its top, in the Table's frame (three.js axes)
// where each fruit lies on the plate: [kind, x, z, height of its middle over the plate, yaw]; the banana lies on its side
const ON_PLATE = [["banana", 0, 0.045, 0.019, 0], ["mango", 0.055, -0.03, 0.0375, 1.2], ["apple", -0.05, -0.035, 0.0375, 0.4],
  ["fig", 0.0, -0.085, 0.0275, 0], ["lime", -0.09, 0.02, 0.0275, 0]];

function plateFruit() {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = V(1, 1, 1);
  const geos = ON_PLATE.filter(([k]) => FRUIT.some(([n]) => n === k)).map(([kind, x, z, y, yaw]) => {
    e.set(kind === "banana" ? -Math.PI / 2 : 0, yaw, 0, "YXZ");
    return makeFood(kind).geometry.clone().applyMatrix4(m.compose(V(PLATE.x + x, PLATE.top + y, PLATE.z + z), q.setFromEuler(e), one));
  });
  const fruit = new THREE.Mesh(mergeGeometries(geos), makeFood("apple").material);
  fruit.name = "PlateFruit";
  return fruit;
}

export function splitBowl(T) {
  const own = T.getObjectByName("FruitBowl");
  if (own) { own.geometry.boundingBox ?? own.geometry.computeBoundingBox(); own.add(plateFruit()); return own; }   // the rebaked model's own plate
  if (!T.isMesh || !T.geometry.index) return null;
  const g = T.geometry, idx = g.index.array, pos = g.attributes.position, col = g.attributes.color, keep = [], bowl = [];
  for (let i = 0; i < idx.length; i += 3) {
    let x = 0, y = 0, z = 0; for (let k = 0; k < 3; k++) { x += pos.getX(idx[i + k]) / 3; y += pos.getY(idx[i + k]) / 3; z += pos.getZ(idx[i + k]) / 3; }
    if (y > 0.675 && Math.hypot(x - PLATE.x, z - PLATE.z) < 0.17) {
      const red = col && col.getX(idx[i]) > 0.4 && col.getY(idx[i]) < 0.3;   // an old tomato: drop it
      if (!red) bowl.push(idx[i], idx[i + 1], idx[i + 2]);
    } else keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  if (!bowl.length) return null;
  const b = new THREE.BufferGeometry(); for (const k in g.attributes) b.setAttribute(k, g.attributes[k]);
  b.setIndex(bowl); g.setIndex(keep);
  // bounds from the indexed corners only (three's own would take every vertex of the shared buffer, so the whole table)
  const box = new THREE.Box3(); for (const i of bowl) box.expandByPoint(V().fromBufferAttribute(pos, i));
  b.boundingBox = box; b.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const m = new THREE.Mesh(b, T.material); m.name = "FruitBowl"; T.add(m);
  m.add(plateFruit());
  return m;
}
