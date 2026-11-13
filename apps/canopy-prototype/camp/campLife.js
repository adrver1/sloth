// Canopy Camp life: the lived-in ground (ground.js), the walk-in tent, the atmosphere (atmosphere.js) and the activities (activities.js).
import { createGround } from "../ground.js";
import * as THREE from "three";
import { createAtmosphere } from "../atmosphere.js";
import { createActivities } from "../activities.js";
import { D, JEEP, LIVED, LOOK, PRE, PROPS, S, camera, renderer, scene, uTime } from "./core.js";
import { toast } from "./hud.js";
import { FLOOR_OVERLAYS, clearing, track, trackDist } from "./forest.js";
import { FIRE_CARDS, WOODPILE, WOOD_TEX, blockers, fireLight, flames, glowTex, uNight } from "./campProps.js";
import { CRATE, FAR, RC, SOUP_POT, TABLE, TENT } from "./layout.js";
import { cabinLive } from "./jeep.js";
import { burst, sloths } from "./sloths.js";
import { me } from "./player.js";
import "./deadwood.js";
import { groundHeight, vnoise } from "./terrain.js";
import { ground as forestFloor } from "./sky.js";   // before the ground, so its plants grow round the log, stump and dead trunk

// cozy atmosphere (atmosphere.js): fire smoke, sparks when you walk close, steam off the soup pot
// and butterflies by day that land on the sloths' noses, and blinking fireflies at dusk (they replace the old even firefly cloud, kept hidden)
// wild, lived-in ground (ground.js): worn dirt round the fire, the props and the paths between them; grass tufts, tall grass, wildflowers and clover
// the baked ground (props/ground/bake_ground.py) for the sets that have one; others paint their wear map live
const groundBake = await PRE.groundMask;
const groundLife = createGround({ baked: groundBake, height: groundHeight, far: FAR, forestMap: forestFloor.material.map, noise: vnoise, scene, RC, blockers, clearing, S, look: LOOK, fx: D.fx, uTime, night: uNight, trackDist, trackPts: track ? track.pts : [],
    bare: PROPS === "picked" ? TENT.bare : undefined,   // no grass in the tent or through its planks
    shadowMap: `models/camp_shadow_${PROPS}_${JEEP}.png`, nightMap: `models/camp_ground_night_${PROPS}_${JEEP}.png` });   // night light, baked with the props   // baked ground shadows; for a set with no bake, ground.js renders them live
forestFloor.visible = false;   // one ground now: the clearing, the bowl's rim and the forest floor (camp/terrain.js)
for (const m of FLOOR_OVERLAYS) groundLife.shadeOn(m.material);
if (cabinLive) {   // Cabin: live: the floor and every baked prop take the cabin light's shadow
  cabinLive.receive(groundLife.floor); scene.traverse((m) => { if (m.isMesh && m.material?.lightMap) m.receiveShadow = true; }); renderer.shadowMap.needsUpdate = true;
}
window.__ground = groundLife;   // tool contract: props/shadow/export_casters.cjs reads its layout for the bake
// the walk-in tent (picked props; build_camp.py wall_tent, keep in step; layout.js TENT): walls stop you, the doorway lets
// you in, the bed and the stove are in the way
if (PROPS === "picked") {
  const at = TENT.fromLocal;   // the tent's own (Blender) frame: x across, -y toward the fire
  const { W, yf, yb, DW } = TENT, wall = [];
  for (let y = yf; y <= yb + 0.01; y += 0.3) wall.push([-W, y], [W, y]);
  for (let x = -W + 0.3; x < W; x += 0.3) { wall.push([x, yb]); if (Math.abs(x) > DW + 0.12) wall.push([x, yf]); }
  const i = blockers.findIndex((b) => b.tent); if (i >= 0) blockers.splice(i, 1);
  for (const [x, y] of wall) blockers.push([at(x, y), 0.1]);
  for (let y = yb - 0.3; y > yb - 1.9; y -= 0.35) blockers.push([at(-W + 0.48, y), 0.18]);   // the bed, along the left wall
  blockers.push([at(...TENT.stove), 0.3]);                                               // the stove
  // the stove's amber light: a glow at its fire door and a warm pool on the floor before it, flickering with the
  // fire; faint by day, full at night (two additive quads, no extra scene light, so phones pay nothing per pixel)
  const amber = (size, y, onFloor) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    if (onFloor) m.rotation.x = -Math.PI / 2; m.position.copy(at(onFloor ? 0.45 : 0.76, TENT.stove[1])).setY(y);
    m.onBeforeRender = () => { m.material.opacity = (onFloor ? 0.18 + 0.6 * uNight.value : 0.35 + 0.65 * uNight.value) * (0.75 + 0.25 * Math.sin(uTime.value * 9.1) * Math.sin(uTime.value * 5.3 + 1)); if (!onFloor) m.quaternion.copy(camera.quaternion); };
    scene.add(m); return m; };
  amber(1.6, 0.035, true); amber(0.5, 0.42, false);
}
const atmo = createAtmosphere({ scene, camera, fx: D.fx, pot: SOUP_POT,
  chimneys: PROPS === "picked" ? [TENT.fromLocal(...TENT.chimney)] : [], sloths, roam: RC - 1.5 });   // the tent stove's pipe mouth (build_camp.py wall_tent: STOVE, pipe top Z0 + H + 0.62)
// camp activities (activities.js, thread "Plan camp activities"): chores, snacks, the friendship book and the photo album, built in chunks
const acts = createActivities({ scene, camera, me, woodPile: typeof WOODPILE !== "undefined" ? WOODPILE : null, woodTex: typeof WOOD_TEX !== "undefined" ? WOOD_TEX : null, fireCards: FIRE_CARDS, flames, fireLight, glowTex, burst, toast,
  pot: SOUP_POT, table: TABLE.at, crate: LIVED ? CRATE.at : null, blockers, sloths,
  addBlocker: (c, r) => blockers.push([c, r]),
  looks: Object.fromEntries(Object.entries({ woodpile: ["WoodStack", "LooseLogs"], fireOnly: ["Ring", "Fire"], pot: ["Pot"], crate: ["KitchenCrate", "KitchenThings"] })   // what lights up when you can use it (camp/highlight.js)
    .map(([k, ns]) => [k, ns.map((n) => scene.getObjectByName(n)).filter(Boolean)]).filter(([, v]) => v.length)) });
window.__acts = acts;   // alias: operator.js reads it (audio.js in the open PRs too)

export { acts, atmo, groundLife };
