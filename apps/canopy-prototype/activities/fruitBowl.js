// Camp activities, the fruit plate: the white plate of three tomatoes on the snack table, which the highlight lights up on its
// own (Adriaen 2026-11-13: light up just the bowl). From the next light rebake on, props/camp/build_camp.py exports it as its
// own object, "FruitBowl", a child of the Table (review R2-159), and splitBowl just hands that back. Until then the plate is
// part of the Table mesh in models/camp_picked_lm.txt, and splitBowl cuts it off at run time: the triangles over the plank
// tops within 17 cm of the plate's middle (Blender (-0.2, -0.05), radius 0.14) go into their own mesh, a child of the table
// with the same material, attributes and light map (a new index on the shared buffers). No triangles added, one more draw.
// Once the rebaked GLB is in, the cutting code can go (keep the lookup).
// Exports splitBowl(table): the FruitBowl mesh, or null when the table has no such triangles.
import * as THREE from "three";
import { V } from "../camp/util.js";

export function splitBowl(T) {
  const own = T.getObjectByName("FruitBowl");
  if (own) { own.geometry.boundingBox ?? own.geometry.computeBoundingBox(); return own; }   // the rebaked model's own plate
  if (!T.isMesh || !T.geometry.index) return null;
  const g = T.geometry, idx = g.index.array, pos = g.attributes.position, keep = [], bowl = [];
  for (let i = 0; i < idx.length; i += 3) {
    let x = 0, y = 0, z = 0; for (let k = 0; k < 3; k++) { x += pos.getX(idx[i + k]) / 3; y += pos.getY(idx[i + k]) / 3; z += pos.getZ(idx[i + k]) / 3; }
    (y > 0.675 && Math.hypot(x + 0.2, z - 0.05) < 0.17 ? bowl : keep).push(idx[i], idx[i + 1], idx[i + 2]);
  }
  if (!bowl.length) return null;
  const b = new THREE.BufferGeometry(); for (const k in g.attributes) b.setAttribute(k, g.attributes[k]);
  b.setIndex(bowl); g.setIndex(keep);
  // bounds from the indexed corners only (three's own would take every vertex of the shared buffer, so the whole table)
  const box = new THREE.Box3(); for (const i of bowl) box.expandByPoint(V().fromBufferAttribute(pos, i));
  b.boundingBox = box; b.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const m = new THREE.Mesh(b, T.material); m.name = "FruitBowl"; T.add(m); return m;
}
