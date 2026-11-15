// Summit Cabin, the operator's summit day (Adriaen 2026-11-15, plan L2): the camp's day (camp/operator/day.js: a mug from the
// kitchen crate, a book on a log, his hands at the fire, a stroll, sleep in the tent bed, a sloth to play with) plus three of
// the summit's own, given to it through camp/stage.js OP_DAY:
//   firewood   to the cabin's woodpile round its west end, bends for an armful (three logs, painted bark, 30 triangles),
//              carries it in both arms back to the fire and drops it on
//   porch      round the cabin to the porch bench, sits looking out over the valley a while (a sloth that comes sits on his lap)
//   snowman    over to the snowman, pats its middle, has a look at it
// The camp's soup and cooking are not here (no pot of soup at the summit). Weights: more fire and sleep at night, the porch
// by day.
// Exports OP_DAY_SUMMIT ({ weights(night), DO }); life.js hands it to the stage.
import * as THREE from 'three';
import { rng, scene } from '../camp/stage.js';
import { V, ease, yawTo } from '../camp/util.js';
import { seatWith } from '../camp/operator/day.js';
import { cs, root } from '../camp/operator/model.js';
import { op } from '../camp/operator/state.js';
import { face, faceFire, wait, walkTo } from '../camp/operator/walk.js';
import { fireGap } from '../camp/operator/places.js';
import { PLACES } from './castStage.js';

const { R } = rng('operator');
// a generator run step by step with `each` before every step (the armful riding in his arms while he walks)
function* during(g, each) { let v = g.next(); while (!v.done) { const dt = yield; each(dt); v = g.next(dt); } return v.value; }
// round the cabin's west end, in order or back again, from wherever he is: only the waypoints on the far side of where he is
function* roundTo(porch) {
  const pts = porch ? PLACES.round : [...PLACES.round].reverse();
  for (const p of pts) yield* walkTo(p, { near: 0.35 });
}
const onPorchSide = () => root.position.z < PLACES.round[1].z + 1;

// the armful: three logs side by side, open cylinders (no caps: the ends face his chest and the fire)
let armful = null;
function makeArmful() {
  if (armful) return armful;
  armful = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.055, 0.06, 0.46, 5, 1, true).rotateZ(Math.PI / 2), mat = new THREE.MeshLambertMaterial({ color: '#6b4a32', flatShading: true });
  for (const [x, y, z] of [[0, 0, -0.06], [0, 0, 0.05], [0.02, 0.09, 0]]) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; armful.add(m); }
  armful.visible = false; scene.add(armful);
  return armful;
}
const holdArmful = () => {   // in front of his tummy, a hand under each end
  armful.position.copy(cs(0, 1.0, -0.33)); armful.quaternion.copy(root.quaternion);
  op.ik = { R: [cs(0.2, 0.96, -0.32), 1], L: [cs(-0.2, 0.96, -0.32), 1] };
};

const DO = {
  *firewood() {
    makeArmful();
    if (onPorchSide()) yield* roundTo(false);
    yield* walkTo(PLACES.round[0], { near: 0.35 });
    yield* walkTo(PLACES.woodpile.stand); yield* face(PLACES.woodpile.yaw);
    for (let t = 0; t < 1.2;) { t += yield; const k = Math.min(1, t / 0.8); op.lean = 0.6 * k; op.ik = { R: [cs(0.15, 0.55, -0.5), k], L: [cs(-0.15, 0.55, -0.5), k] }; }
    armful.visible = true;
    for (let t = 0; t < 0.8;) { t += yield; op.lean = 0.6 * (1 - Math.min(1, t / 0.8)); holdArmful(); }
    op.lean = 0;
    try {
      yield* during(walkTo(PLACES.round[0], { near: 0.35 }), holdArmful);
      yield* during(walkTo(fireGap(root.position)), holdArmful);
      yield* during(faceFire(), holdArmful);
      const from = armful.position.clone(), to = V(0, 0.25, 0);   // onto the fire, in the camp's frame
      for (let t = 0; t < 0.9;) { t += yield; const k = ease(Math.min(1, t / 0.9)); op.lean = 0.45 * Math.sin(k * Math.PI); armful.position.lerpVectors(from, to, k); armful.position.y += Math.sin(k * Math.PI) * 0.15; op.ik = { R: [cs(0.18, 0.9, -0.5), 1 - k], L: [cs(-0.18, 0.9, -0.5), 1 - k] }; }
    } finally { armful.visible = false; op.ik = null; op.lean = 0; }
    yield* wait(R(2, 4));   // watches it catch
  },
  *porch() {
    if (!onPorchSide()) yield* roundTo(true);
    yield* seatWith(function* () {
      for (let t = 0, T = R(30, 55); t < T && !op.buddy;) { t += yield; op.look = Math.sin(t * 0.25) * 0.45; }
      op.look = 0;
    }, PLACES.bench);
    yield* roundTo(false);
  },
  *snowman() {
    if (onPorchSide()) yield* roundTo(false);
    const S = PLACES.snowman; yield* walkTo(S.front, { near: 0.15 }); yield* face(yawTo(S.at.clone().sub(root.position)));
    const pat = S.at.clone().add(V(0, 1.15, 0)).addScaledVector(S.front.clone().sub(S.at).normalize(), 0.36);
    for (let n = 0; n < 2; n++) for (let t = 0; t < 1.1;) { t += yield; op.ik = { R: [pat, Math.sin(Math.min(1, t / 1.1) * Math.PI)] }; }
    op.ik = null; op.happy = true;
    for (let t = 0, T = R(5, 9); t < T;) { t += yield; op.look = Math.sin(t * 0.6) * 0.3 - 0.1; }
    op.look = 0; op.happy = false;
  },
};
// what comes next, by weight (the camp's own day.js WEIGHTS shape); no soup, no cooking here
const weights = (night) => night ? { sleep: 6, warm: 2, firewood: 1, drink: 1, read: 0.3, stroll: 0.3, play: 0.3, porch: 0.2 }
  : { firewood: 1.2, porch: 1.2, snowman: 0.7, drink: 1.2, read: 1.2, warm: 0.6, stroll: 0.8, sleep: 0.4, play: 1.2 };
export const OP_DAY_SUMMIT = { weights, DO };
