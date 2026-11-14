// Canopy Camp jeep: the Expedition at the clearing edge, its doors, the live cabin light and its far LOD (props/jeep/).
import * as THREE from "three";
import { GAIN } from "../bakedlight.js";
import { JEEP, PRE, camera, renderer, scene } from "./core.js";
import { V, canvasTex, ease } from "./util.js";
import { JEEP_AT, JEEP_TAN } from "./layout.js";
import { addBlocker } from "./campProps.js";

// ---------------------------------------------------------------- the adventure jeep (props/jeep/build_jeep.py), parked at the clearing edge
// between the hammock and the first big tree (JEEP_AT, with its track, in layout.js), along the edge, its
// passenger side (local +X) toward the fire. Its three doors and the hood open and close from their menus (jeepSeat.js adds jeepApi.doors as tap targets, targets.js):
// DoorP (passenger, camp side), DoorD (driver) and BackDoor (with the spare), each a node on its hinge. Other camp code
// uses jeepApi (the tools see it as window.__jeep, debug.js): open/close/isOpen("P" | "D" | "B" | "H" for the hood), seat (passenger cushion top), sill (passenger door sill),
// cargo (middle of the cargo deck) and cargoSlots (four spots on it), all world positions. Both stay null with ?jeep=none.
// Sitting in the front seats is not part of jeepApi: jeepSeat.js has its own seatApi (sit, stand, seatedIn, seatBusy), and no other module adds to jeepApi.
// cabinLive.receive(object): that object takes the cabin light's shadow (campGround.js gives it the floor and the baked props).
let jeepStep = () => {}, jeepApi = null, cabinLive = null;
// buildJeep (main.js, once the props stand): waits for the jeep's downloads and parks it; nothing with ?jeep=none
async function buildJeep() {
  if (JEEP === "none") return;
  const J = await PRE.jeep, at = JEEP_AT, tan = JEEP_TAN;
  const jeep = J.scene;
  const jm = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glassM = new THREE.MeshLambertMaterial({ color: 0xa9c4cc, transparent: true, opacity: 0.25, depthWrite: false });   // see-through, a little tinted
  jeep.traverse((m) => { if (m.isMesh) { m.material = m.name.startsWith("Glass") ? glassM : jm; if (m.name.startsWith("Glass")) m.renderOrder = 2; } });
  // far away (camp review P7): beyond about 12 m the 880-triangle JeepLOD (props/jeep/build_jeep.py jeep_lod) stands in for the
  // full jeep (6,002 triangles, 12 draws), never while a door is open. Only the jeep's own meshes are hidden, so a sloth sitting
  // in it (parented to the jeep) stays.
  const jeepMeshes = []; jeep.traverse((m) => { if (m.isMesh) jeepMeshes.push(m); });
  const far = (await PRE.jeepLod)?.scene;
  let isFar = false;
  if (far) { far.traverse((m) => { if (m.isMesh) m.material = jm; }); far.visible = false; scene.add(far); }
  jeep.position.copy(at); jeep.rotation.set(0, Math.atan2(tan.x, tan.z), 0); scene.add(jeep); jeep.updateMatrixWorld(true);
  if (far) { far.position.copy(jeep.position); far.rotation.copy(jeep.rotation); }
  for (const k of [-0.95, 0.95]) addBlocker({ at: at.clone().addScaledVector(tan, k), r: 1.05 });
  // how far each swings (rad) and about which axis, as in build_jeep.py; H is the hood (Adriaen 2026-11-12), hinged at the windscreen
  const D3 = { P: ["DoorP", -1.2, "y"], D: ["DoorD", 1.2, "y"], B: ["BackDoor", 1.75, "y"], H: ["Hood", -1.15, "x"] }, doors = {};
  for (const [k, [n, open, axis]] of Object.entries(D3)) { const o = jeep.getObjectByName(n); if (o) doors[k] = { o, open, axis, cur: 0, want: 0 }; }
  const world = (n) => jeep.getObjectByName(n)?.getWorldPosition(V()) ?? at.clone();
  const local = (x, y, z) => jeep.localToWorld(V(x, y, z));
  const boot = jeep.getObjectByName("Boot")?.position ?? V(0, 0.78, -1.06);
  // the cabin light (Adriaen 2026-11-12): on while any door stands open. CabinLight is its lens (unlit when on); the light it
  // throws is live: one shadowed spot light (cabSpot), redrawn while a cabin door moves; it replaced the baked keyframes.
  // The headlights were dropped (Adriaen 2026-11-12: "they don't add much"); the Lamps lenses stay as plain parts.
  const cabinL = jeep.getObjectByName("CabinLight");
  const cabOn = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  const OFF = new THREE.Color(0x8c8778), CL = new THREE.Color(0xffe2a8);
  // a soft glow round the cabin lamp (one sprite), so the lit cabin reads through the windows before any bake
  const glowTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,226,168,1)"); r.addColorStop(1, "rgba(255,226,168,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }, { srgb: false, aniso: 1 });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(0, 1.45, -0.25); glow.scale.setScalar(1.1); glow.visible = false; jeep.add(glow);
  // Cabin: live: one spot light under the roof aimed down (83 degree half-angle), shadowed by the jeep only; its shadow map is
  // redrawn only while a cabin door moves or the light fades, and every prop and the floor take its shadow
  let cabSpot;
  {   // the cabin light is live (one shadowed spot light): it looked much better than the bake (Adriaen 2026-11-12)
    // PCFShadowMap, not PCFSoftShadowMap: three 0.186 swaps the removed soft type for PCF on the first shadow render, which changed
    // every program's cache key after main.js compileAsync and made the first frames compile every shader again (review R2-003).
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
    cabSpot = new THREE.SpotLight(0xffe3a8, 0, 9, 1.45, 0.4, 2); cabSpot.position.set(0, 1.62, -0.25); cabSpot.target.position.set(0, 0, -0.25);
    cabSpot.castShadow = true; cabSpot.shadow.mapSize.set(512, 512); cabSpot.shadow.camera.near = 0.05; cabSpot.shadow.camera.far = 9; cabSpot.shadow.bias = -0.002;
    jeep.add(cabSpot, cabSpot.target);
    jeep.traverse((m) => { if (m.isMesh && !m.name.startsWith("Glass")) { m.castShadow = true; m.receiveShadow = true; } });
    cabinLive = { receive: (o) => o.traverse((m) => { if (m.isMesh) m.receiveShadow = true; }) };
  }
  // Each frame: move the doors that are not where they are wanted, then the cabin light; with every door at rest and the
  // cabin light faded to its end, neither does any work (R2-093). Only the three cabin doors drive the light and its shadow
  // map: the hood is outside the cabin, so its swing does not redraw the spot's shadows (R2-092).
  const doorList = Object.values(doors), cabinDoors = ["P", "D", "B"].filter((k) => doors[k]).map((k) => [k, doors[k]]);
  let cab = 0, lastCab = -1, lit = false;   // lit: the light has been set at least once
  const lightStep = (dt, moved) => {        // moved: a cabin door turned this frame
    let cWant = 0; for (const [, d] of cabinDoors) if (d.cur !== 0) { cWant = 1; break; }
    if (lit && !moved && cab === cWant) return;
    cab += (cWant - cab) * Math.min(1, dt * 4); if (Math.abs(cWant - cab) < 0.002) cab = cWant;
    if (cabinL) { cabinL.material = cab > 0.02 ? cabOn : jm; cabOn.color.copy(OFF).lerp(CL, cab); }
    glow.material.opacity = 0.55 * cab; glow.visible = cab > 0.02;
    GAIN.cabin = 0;   // live: the spot light instead of the bake
    for (const [k, d] of cabinDoors) GAIN.doors[k] = d.o.rotation[d.axis] / d.open;   // each door's spill (bakedlight.js), by its actual swing
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
    seat: world("SeatP"), sill: world("DoorSill"), cargo: world("Boot"),
    lights: { get cabin() { return cab; } },
    cargoSlots: [[-0.3, -0.75], [0.3, -0.75], [-0.3, -1.3], [0.3, -1.3]].map(([x, z]) => local(x, boot.y, z)),
  };
}

export { buildJeep, cabinLive, jeepApi, jeepStep };
