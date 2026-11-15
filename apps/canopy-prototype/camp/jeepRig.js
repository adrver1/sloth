// The jeep's working parts, in every level it stands in (Adriaen 2026-11-15: the summit's jeep must open, light up and seat you
// like the camp's): its doors and hood swinging on their hinges, the cabin light while a cabin door stands open, and the far
// look swapped in beyond about 12 m. camp/jeep.js parks the camp's jeep and rigs it; summit/road.js rigs the summit's.
// rigJeep(jeep, { camera, renderer, far, spot }) takes the jeep's loaded scene (props/jeep/build_jeep.py: the nodes DoorP,
// DoorD, BackDoor, Hood, CabinLight and the empties SeatP and DoorSill), already placed with its materials, and returns
//   step(dt)   each frame: moves the doors and fades the cabin light
//   api        { node, lod, doors, open(w), close(w), isOpen(w), seat, sill, engineFront, engineSeat }: w is "P" | "D" | "B" |
//              "H" (the hood); doors is the doors' tap targets (jeepSeat.js); seat (the driver's cushion top, SeatP), sill
//              (DoorP's sill), engineFront (on the ground before the bumper) and engineSeat (on the front of the engine bay:
//              sloth/fix.js) are world positions where the jeep stands now
// far: the far look's own scene object (the camp's JeepLOD) or null; spot: false leaves out the cabin's shadowed spot light
// (the summit: one more light would recompile every material in its big scene), keeping the lens and its glow.
// Draw calls (Adriaen 2026-11-15, "gotta get those draws down"): the jeep is some 14 meshes (body, four tyres, three doors, the
// hood, the lamp, four panes) so they can move. While it stands shut, you are not beside it and it is not driving, one merged
// copy per material draws instead (whole: the paint, the glass), 2 draws in place of 14; the parts come back as you walk up
// (NEAR), when a door or the hood moves, and while the jeep moves (the drives roll its tyres). The dash (car.js, api.inside)
// is hidden with the parts: through the windows from 6 m it is a few pixels.
import * as THREE from "three";
import { V, canvasTex, ease } from "./util.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { addHeadlights } from "./headlights.js";
import { uNight } from "./stage.js";

export function rigJeep(jeep, { camera, renderer, far = null, spot = true }) {
  jeep.updateMatrixWorld(true);
  const jeepMeshes = []; jeep.traverse((m) => { if (m.isMesh) jeepMeshes.push(m); });
  let isFar = false;
  // the merged copy, one mesh per material, in the jeep's own frame with every door shut (as the GLB comes); none if a
  // material's meshes do not share their attributes (then the parts always draw)
  const whole = new THREE.Group(); whole.name = "JeepWhole";
  { const inv = jeep.matrixWorld.clone().invert(), byMat = new Map();
    for (const m of jeepMeshes) { if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(m); }
    for (const [mat, ms] of byMat) {
      const g = mergeGeometries(ms.map((m) => m.geometry.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld))));
      if (!g) { whole.clear(); break; }
      const w = new THREE.Mesh(g, mat); w.renderOrder = ms[0].renderOrder; w.castShadow = ms[0].castShadow; w.receiveShadow = ms[0].receiveShadow;
      w.raycast = () => {};   // taps and the door targets use the parts
      whole.add(w);
    } }
  whole.visible = false; jeep.add(whole);
  // the headlights (headlights.js; Adriaen 2026-11-15): on at dusk and night while the engine runs (car.js sets api.engineOn) or
  // the jeep drives in a shot (the drives set api.driving); added after the parts are listed, so they are never merged or hidden with them
  const heads = addHeadlights(jeep);
  const NEAR = 6, at = V(), last = jeep.getWorldPosition(V()); let moving = 0, live = true;   // last: where it stood last frame (parked now)
  // the doors and the hood (Adriaen 2026-11-12, hinged at the windscreen): how far each swings (rad) and about which axis come
  // from the node's glTF extras, "open" and "axis", which build_jeep.py writes from its HINGES and HOOD_OPEN (review R2-250).
  const doors = {};
  for (const [k, n] of Object.entries({ P: "DoorP", D: "DoorD", B: "BackDoor", H: "Hood" })) {
    const o = jeep.getObjectByName(n); if (!o) continue;
    const { open, axis } = o.userData;
    if (open === undefined || !axis) { console.error(`the jeep's ${n} has no open/axis extras; rebuild it (props/jeep/build_jeep.py)`); continue; }
    doors[k] = { o, open, axis, cur: 0, want: 0 };
  }
  const world = (n) => jeep.getObjectByName(n)?.getWorldPosition(V()) ?? jeep.position.clone();
  const local = (x, y, z) => jeep.localToWorld(V(x, y, z));   // a point in the jeep's frame, in the world
  // the cabin light (Adriaen 2026-11-12): on while any door stands open. CabinLight is its lens (unlit when on); the light it
  // throws is live: one shadowed spot light (cabSpot), redrawn while a cabin door moves; it replaced the baked keyframes.
  // The headlights were dropped (Adriaen 2026-11-12: "they don't add much"); the lenses are plain parts of the body.
  const cabinL = jeep.getObjectByName("CabinLight"), lensOff = cabinL?.material;
  const cabOn = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  const OFF = new THREE.Color(0x8c8778), CL = new THREE.Color(0xffe2a8);
  // a soft glow round the cabin lamp (one sprite), so the lit cabin reads through the windows before any bake
  const glowTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,226,168,1)"); r.addColorStop(1, "rgba(255,226,168,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }, { srgb: false, aniso: 1 });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(0, 1.45, -0.25); glow.scale.setScalar(1.1); glow.visible = false; jeep.add(glow);
  // one spot light under the roof aimed down (83 degree half-angle), shadowed by the jeep only: it looked much better than the bake
  // (Adriaen 2026-11-12). Its shadow map is redrawn only while a cabin door moves or the light fades, and every prop and the floor take its shadow.
  // PCFShadowMap, not PCFSoftShadowMap: three 0.186 swaps the removed soft type for PCF on the first shadow render, which changed
  // every program's cache key after main.js compileAsync and made the first frames compile every shader again (review R2-003).
  let cabSpot = null;
  if (spot) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
    cabSpot = new THREE.SpotLight(0xffe3a8, 0, 9, 1.45, 0.4, 2); cabSpot.position.set(0, 1.62, -0.25); cabSpot.target.position.set(0, 0, -0.25);
    cabSpot.castShadow = true; cabSpot.shadow.mapSize.set(512, 512); cabSpot.shadow.camera.near = 0.05; cabSpot.shadow.camera.far = 9; cabSpot.shadow.bias = -0.002;
    jeep.add(cabSpot, cabSpot.target);
  }
  // Each frame: move the doors that are not where they are wanted, then the cabin light; with every door at rest and the
  // cabin light faded to its end, neither does any work (R2-093). Only the three cabin doors drive the light and its shadow
  // map: the hood is outside the cabin, so its swing does not redraw the spot's shadows (R2-092).
  const doorList = Object.values(doors), cabinDoors = ["P", "D", "B"].filter((k) => doors[k]).map((k) => doors[k]);
  let cab = 0, lastCab = -1, lit = false;   // lit: the light has been set at least once
  const lightStep = (dt, moved) => {        // moved: a cabin door turned this frame
    let cWant = 0; for (const d of cabinDoors) if (d.cur !== 0) { cWant = 1; break; }
    if (lit && !moved && cab === cWant) return;
    cab += (cWant - cab) * Math.min(1, dt * 4); if (Math.abs(cWant - cab) < 0.002) cab = cWant;
    if (cabinL) { cabinL.material = cab > 0.02 ? cabOn : lensOff; cabOn.color.copy(OFF).lerp(CL, cab); }
    glow.material.opacity = 0.55 * cab; glow.visible = cab > 0.02;
    if (cabSpot) {
      cabSpot.intensity = 6 * cab;
      if (moved || Math.abs(cab - lastCab) > 0.01 || (cab === cWant && cab !== lastCab)) { renderer.shadowMap.needsUpdate = true; lastCab = cab; }
    }
    lit = true;
  };
  const step = (dt) => {
    let moved = false, shut = true;
    for (const d of doorList) {
      if (d.cur !== d.want) {
        const s = dt * 1.8; d.cur += Math.max(-s, Math.min(s, d.want - d.cur));
        d.o.rotation[d.axis] = d.open * ease(d.cur / d.open);                // ease in and out
        if (d.axis === "y") moved = true;                                    // a cabin door (the hood turns about x)
        // on purpose, the hood's swing does not redraw the cabin spot's shadow map, so the hood's shadow from it lags until a cabin door moves
      }
      if (d.cur !== 0) shut = false;
    }
    lightStep(dt, moved);
    heads.step(dt, (api.engineOn || api.driving ? 1 : 0) * THREE.MathUtils.smoothstep(uNight.value, 0.25, 0.6));
    jeep.getWorldPosition(at); if (at.distanceToSquared(last) > 1e-8) { moving = 0.5; last.copy(at); } else moving -= dt;
    const d = camera.position.distanceTo(at);
    if (far) {
      const want = shut && d > (isFar ? 11.5 : 12.5);   // a little hysteresis so it doesn't flicker at the edge
      if (want !== isFar) { isFar = want; far.visible = want; }
    }
    let rest = true; for (const k of doorList) if (k.cur !== 0 || k.want !== 0) { rest = false; break; }
    const wantLive = !whole.children.length || !rest || moving > 0 || d < (live ? NEAR + 0.5 : NEAR);
    const showParts = wantLive && !isFar, showWhole = !wantLive && !isFar;
    if (showParts !== jeepMeshes[0]?.visible) for (const m of jeepMeshes) m.visible = showParts;
    for (const o of api.inside) o.visible = showParts;
    whole.visible = showWhole; live = wantLive;
  };
  const api = {
    // lod: the far look, its own scene object (drive.js moves it with the jeep); inside: things in the cab (car.js's dash)
    // that draw only with the parts
    node: jeep, lod: far, inside: [], engineOn: false, driving: false,   // engineOn, driving: the headlights' switches (car.js, the drives)
    doors: Object.entries(doors).map(([k, d]) => ({ k, o: d.o, toggle: () => (d.want = d.want ? 0 : d.open), get open() { return d.want !== 0; } })),   // for the highlight and its menu (jeepSeat.js, targets.js)
    open: (w = "B") => { const d = doors[w]; if (d) d.want = d.open; }, close: (w = "B") => { const d = doors[w]; if (d) d.want = 0; },
    isOpen: (w = "B") => !!doors[w] && Math.abs(doors[w].cur) > Math.abs(doors[w].open) * 0.8,
    seat: world("SeatP"), sill: world("DoorSill"),
    // the engine fix (sloth/fix.js): where a sloth stands before the front bumper, and where it sits on the front of the
    // engine bay to work, in the jeep's frame (+Z ahead) as build_jeep.py shapes the bonnet (review R2-141)
    engineFront: local(0.3, 0, 2.35).setY(0), engineSeat: local(0.25, 0.94, 1.5),
  };
  return { step, api };
}
