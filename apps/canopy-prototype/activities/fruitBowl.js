// Camp activities, the fruit plate: the white plate on the snack table, which the highlight lights up on its own (Adriaen
// 2026-11-13: light up just the bowl). props/camp/build_camp.py exports it as its own object, "FruitBowl", a child of the
// Table (review R2-159), and splitBowl hands that back with the fruit on it.
// On the plate lie the fruit the plate hands out (review R2-176): one each of camp/food.js FRUIT (mango, apple, banana, fig
// and lime), merged into one mesh with food.js's material, lit live like the food in your hand: 116 triangles, one draw.
// Exports splitBowl(table): the FruitBowl mesh (the fruit is its child, so the highlight lights both), or null (and a console
// error) when the table has no plate.
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
  if (!own) { console.error("camp_picked_lm.txt's Table has no FruitBowl; rebuild it (props/bake_all.py)"); return null; }
  own.geometry.boundingBox ?? own.geometry.computeBoundingBox(); own.add(plateFruit());
  return own;
}
