// Canopy Camp jeep: the Expedition at the clearing edge, its doors, the live cabin light and its far LOD (props/jeep/).
// Exports (all stay at their empty value with ?jeep=none):
//   buildJeep()      main.js, once the props stand: waits for the jeep's downloads, parks it and adds its two blockers
//   jeepStep(dt)     main.js, each frame: moves the doors and fades the cabin light
//   jeepApi          { node, doors, open(w), close(w), isOpen(w), seat, sill, engineFront, engineSeat } for the other camp
//                    modules (the tools see it as window.__jeep, debug.js): w is "P" | "D" | "B" | "H" (the hood); seat (the
//                    driver's cushion top, SeatP), sill (DoorP's sill), engineFront (on the ground before the bumper) and
//                    engineSeat (on the front of the engine bay: sloth/fix.js) are world positions; doors is the doors' tap
//                    targets (jeepSeat.js, targets.js).
//                    Sitting in the front seats is not part of jeepApi: jeepSeat.js has its own seatApi, and no other module adds to it.
//   cabinLive        { receive(object) }: that object takes the cabin light's shadow (campGround.js gives it the floor and the baked props)
// The jeep (props/jeep/build_jeep.py) is parked at the clearing edge between the hammock and the first big tree (JEEP_AT, with its
// track, in layout.js), along the edge, its driver's side (local +X: left-hand drive) toward the fire. Its three doors and the
// hood open and close from their menus: DoorP (the camp side: the driver's door, to SeatP), DoorD (the passenger's, at -X),
// BackDoor (with the spare) and Hood, each a node on its hinge (the node names are build_jeep.py's).
// The cabin light is live (one shadowed spot light); the baked cabin light, door spill and headlights were dropped from the bake
// on 2026-11-12, and their shader path from the page (review R2-210). The unread cargo deck spots went too (R2-216).
import * as THREE from "three";
import { JEEP, PRE, camera, renderer, scene } from "./core.js";
import { V, canvasTex, ease, trisIn } from "./util.js";
import { JEEP_AT, JEEP_TAN, wearBlockers } from "./layout.js";
import { addBlocker } from "./campProps.js";

let jeepStep = () => {}, jeepApi = null, cabinLive = null;
async function buildJeep() {
  if (JEEP === "none") return;
  const J = await PRE.jeep, at = JEEP_AT, tan = JEEP_TAN;
  const jeep = J.scene;
  const jm = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glassM = new THREE.MeshLambertMaterial({ color: 0xa9c4cc, transparent: true, opacity: 0.25, depthWrite: false });   // see-through, a little tinted
  jeep.traverse((m) => { if (m.isMesh) { m.material = m.name.startsWith("Glass") ? glassM : jm; if (m.name.startsWith("Glass")) m.renderOrder = 2; } });
  // far away (camp review P7): beyond about 12 m the JeepLOD (props/jeep/build_jeep.py jeep_lod, one mesh of under 700 triangles
  // after the R2-148/168/190/191 rebake) stands in for the full jeep (about 5,300 triangles in 10 meshes after that rebake;
  // build_jeep.py prints both counts), never while a door is open. Only the jeep's own meshes are hidden, so a sloth sitting
  // in it (parented to the jeep) stays.
  const jeepMeshes = []; jeep.traverse((m) => { if (m.isMesh) jeepMeshes.push(m); });
  const far = (await PRE.jeepLod)?.scene;
  console.log(`LOG jeep: ${trisIn(jeep)} tris in ${jeepMeshes.length} draws; far LOD: ${far ? `${trisIn(far)} tris` : "none"}`);
  let isFar = false;
  if (far) { far.traverse((m) => { if (m.isMesh) m.material = jm; }); far.visible = false; scene.add(far); }
  jeep.position.copy(at); jeep.rotation.set(0, Math.atan2(tan.x, tan.z), 0); scene.add(jeep); jeep.updateMatrixWorld(true);
  if (far) { far.position.copy(jeep.position); far.rotation.copy(jeep.rotation); }
  for (const b of wearBlockers("jeep")) addBlocker(b);   // two circles along the jeep (layout.js WEAR)
  // the doors and the hood (Adriaen 2026-11-12, hinged at the windscreen): how far each swings (rad) and about which axis come
  // from the node's glTF extras, "open" and "axis", which build_jeep.py writes from its HINGES and HOOD_OPEN (review R2-250).
  // OLD stands in for a jeep GLB built before the extras; drop it once the jeep is rebuilt and baked again.
  const OLD = { DoorP: [-1.2, "y"], DoorD: [1.2, "y"], BackDoor: [1.75, "y"], Hood: [-1.15, "x"] }, doors = {};
  for (const [k, n] of Object.entries({ P: "DoorP", D: "DoorD", B: "BackDoor", H: "Hood" })) {
    const o = jeep.getObjectByName(n); if (!o) continue;
    const { open = OLD[n][0], axis = OLD[n][1] } = o.userData;
    doors[k] = { o, open, axis, cur: 0, want: 0 };
  }
  const world = (n) => jeep.getObjectByName(n)?.getWorldPosition(V()) ?? at.clone();
  const local = (x, y, z) => jeep.localToWorld(V(x, y, z));   // a point in the jeep's frame, in the world
  // the cabin light (Adriaen 2026-11-12): on while any door stands open. CabinLight is its lens (unlit when on); the light it
  // throws is live: one shadowed spot light (cabSpot), redrawn while a cabin door moves; it replaced the baked keyframes.
  // The headlights were dropped (Adriaen 2026-11-12: "they don't add much"); the lenses are plain parts of the body.
  const cabinL = jeep.getObjectByName("CabinLight");
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
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  const cabSpot = new THREE.SpotLight(0xffe3a8, 0, 9, 1.45, 0.4, 2); cabSpot.position.set(0, 1.62, -0.25); cabSpot.target.position.set(0, 0, -0.25);
  cabSpot.castShadow = true; cabSpot.shadow.mapSize.set(512, 512); cabSpot.shadow.camera.near = 0.05; cabSpot.shadow.camera.far = 9; cabSpot.shadow.bias = -0.002;
  jeep.add(cabSpot, cabSpot.target);
  jeep.traverse((m) => { if (m.isMesh && !m.name.startsWith("Glass")) { m.castShadow = true; m.receiveShadow = true; } });
  cabinLive = { receive: (o) => o.traverse((m) => { if (m.isMesh) m.receiveShadow = true; }) };
  // Each frame: move the doors that are not where they are wanted, then the cabin light; with every door at rest and the
  // cabin light faded to its end, neither does any work (R2-093). Only the three cabin doors drive the light and its shadow
  // map: the hood is outside the cabin, so its swing does not redraw the spot's shadows (R2-092).
  const doorList = Object.values(doors), cabinDoors = ["P", "D", "B"].filter((k) => doors[k]).map((k) => doors[k]);
  let cab = 0, lastCab = -1, lit = false;   // lit: the light has been set at least once
  const lightStep = (dt, moved) => {        // moved: a cabin door turned this frame
    let cWant = 0; for (const d of cabinDoors) if (d.cur !== 0) { cWant = 1; break; }
    if (lit && !moved && cab === cWant) return;
    cab += (cWant - cab) * Math.min(1, dt * 4); if (Math.abs(cWant - cab) < 0.002) cab = cWant;
    if (cabinL) { cabinL.material = cab > 0.02 ? cabOn : jm; cabOn.color.copy(OFF).lerp(CL, cab); }
    glow.material.opacity = 0.55 * cab; glow.visible = cab > 0.02;
    cabSpot.intensity = 6 * cab;
    if (moved || Math.abs(cab - lastCab) > 0.01 || (cab === cWant && cab !== lastCab)) { renderer.shadowMap.needsUpdate = true; lastCab = cab; }
    lit = true;
  };
  jeepStep = (dt) => {
    let moved = false, shut = true;
    for (const d of doorList) {
      if (d.cur !== d.want) {
        const step = dt * 1.8; d.cur += Math.max(-step, Math.min(step, d.want - d.cur));
        d.o.rotation[d.axis] = d.open * ease(d.cur / d.open);                // ease in and out
        if (d.axis === "y") moved = true;                                    // a cabin door (the hood turns about x)
        // on purpose, the hood's swing does not redraw the cabin spot's shadow map, so the hood's shadow from it lags until a cabin door moves
      }
      if (d.cur !== 0) shut = false;
    }
    lightStep(dt, moved);
    if (far) {
      const d = camera.position.distanceTo(jeep.position);
      const want = shut && d > (isFar ? 11.5 : 12.5);   // a little hysteresis so it doesn't flicker at the edge
      if (want !== isFar) { isFar = want; far.visible = want; for (const m of jeepMeshes) m.visible = !want; }
    }
  };
  jeepApi = {
    node: jeep,
    doors: Object.entries(doors).map(([k, d]) => ({ k, o: d.o, toggle: () => (d.want = d.want ? 0 : d.open), get open() { return d.want !== 0; } })),   // for the highlight and its menu (jeepSeat.js, targets.js)
    open: (w = "B") => { const d = doors[w]; if (d) d.want = d.open; }, close: (w = "B") => { const d = doors[w]; if (d) d.want = 0; },
    isOpen: (w = "B") => !!doors[w] && Math.abs(doors[w].cur) > Math.abs(doors[w].open) * 0.8,
    seat: world("SeatP"), sill: world("DoorSill"),
    // the engine fix (sloth/fix.js): where a sloth stands before the front bumper, and where it sits on the front of the
    // engine bay to work, in the jeep's frame (+Z ahead) as build_jeep.py shapes the bonnet (review R2-141)
    engineFront: local(0.3, 0, 2.35).setY(0), engineSeat: local(0.25, 0.94, 1.5),
  };
}

export { buildJeep, cabinLive, jeepApi, jeepStep };
