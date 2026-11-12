// Canopy Camp jeep: the Expedition at the clearing edge, its doors, the live cabin light and its far LOD (props/jeep/).
import * as THREE from "three";
import "./campProps.js";   // run after the module before it, as one script did
import { CABIN, JEEP, PRE, camera, renderer, scene } from "./core.js";
import { pickAt, toast } from "./hud.js";
import { JEEP_AT, JEEP_OUT, JEEP_TAN, V } from "./forest.js";
import { blockers } from "./campProps.js";

// ---------------------------------------------------------------- the adventure jeep (props/jeep/build_jeep.py), parked at the clearing edge
// between the hammock and the first big tree (JEEP_AT, set with the track in the layout section), along the edge, its
// passenger side (local +X, the camper's ladder) toward the fire. Its three doors open and close when you tap them:
// DoorP (passenger, camp side), DoorD (driver) and BackDoor (with the spare), each a node on its hinge. Other camp code
// uses window.__jeep: open/close/isOpen("P" | "D" | "B"), seat (passenger cushion top), sill (passenger door sill),
// cargo (middle of the cargo deck) and cargoSlots (four spots on it), all world positions.
let jeepStep = () => {}, jeepTap = () => false;
if (JEEP !== "none") {
  const J = await PRE.jeep, at = JEEP_AT, out = JEEP_OUT, tan = JEEP_TAN;
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
  for (const k of [-0.95, 0.95]) blockers.push([at.clone().addScaledVector(tan, k), 1.05]);
  if (JEEP === "camper") blockers.push([at.clone().addScaledVector(out, -2.3), 0.4]);   // the ladder foot
  const D3 = { P: ["DoorP", -1.2], D: ["DoorD", 1.2], B: ["BackDoor", 1.75] }, doors = {};   // how far each swings (rad), as in build_jeep.py
  for (const [k, [n, open]] of Object.entries(D3)) { const o = jeep.getObjectByName(n); if (o) doors[k] = { o, open, cur: 0, want: 0 }; }
  const world = (n) => jeep.getObjectByName(n)?.getWorldPosition(V()) ?? at.clone();
  const local = (x, y, z) => jeep.localToWorld(V(x, y, z));
  const boot = jeep.getObjectByName("Boot")?.position ?? V(0, 0.78, -1.06);
  // the cabin light (Adriaen 2026-11-12): on while any door stands open. CabinLight is its lens (unlit when on); the light it
  // throws is live: one shadowed spot light (cabSpot), redrawn while a door moves; it replaced the baked keyframes.
  // The headlights were dropped (Adriaen 2026-11-12: "they don't add much"); the Lamps lenses stay as plain parts.
  const cabinL = jeep.getObjectByName("CabinLight");
  const cabOn = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  const OFF = new THREE.Color(0x8c8778), CL = new THREE.Color(0xffe2a8);
  // a soft glow round the cabin lamp (one sprite), so the lit cabin reads through the windows before any bake
  const glowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,226,168,1)"); r.addColorStop(1, "rgba(255,226,168,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(0, 1.45, -0.25); glow.scale.setScalar(1.1); glow.visible = false; jeep.add(glow);
  // Cabin: live: one spot light under the roof aimed down (83 degree half-angle), shadowed by the jeep only; its shadow map is
  // redrawn only while a door moves or the light fades, and every prop and the floor take its shadow
  let cabSpot = null;
  if (CABIN === "live") {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    cabSpot = new THREE.SpotLight(0xffe3a8, 0, 9, 1.45, 0.4, 2); cabSpot.position.set(0, 1.62, -0.25); cabSpot.target.position.set(0, 0, -0.25);
    cabSpot.castShadow = true; cabSpot.shadow.mapSize.set(512, 512); cabSpot.shadow.camera.near = 0.05; cabSpot.shadow.camera.far = 9; cabSpot.shadow.bias = -0.002;
    jeep.add(cabSpot, cabSpot.target);
    jeep.traverse((m) => { if (m.isMesh && !m.name.startsWith("Glass")) { m.castShadow = true; m.receiveShadow = true; } });
    window.__cabinLive = { receive: (o) => o.traverse((m) => { if (m.isMesh) m.receiveShadow = true; }) };
  }
  let cab = 0, lastCab = -1;
  const lightStep = (dt) => {
    const cWant = Object.values(doors).some((d) => d.cur !== 0) ? 1 : 0;
    cab += (cWant - cab) * Math.min(1, dt * 4);
    if (cabinL) { cabinL.material = cab > 0.02 ? cabOn : jm; cabOn.color.copy(OFF).lerp(CL, cab); }
    glow.material.opacity = 0.55 * cab; glow.visible = cab > 0.02;
    if (window.__lights) { window.__lights.cabin = cabSpot ? 0 : cab;   // live: the spot light instead of the bake
      for (const k of ["P", "D", "B"]) window.__lights.doors[k] = doors[k] ? doors[k].o.rotation.y / doors[k].open : 0; }   // each door's spill (bakedlight.js), by its actual swing
    if (cabSpot) { cabSpot.intensity = 6 * cab;
      if (Object.values(doors).some((d) => d.cur !== d.want) || Math.abs(cab - lastCab) > 0.01) { renderer.shadowMap.needsUpdate = true; lastCab = cab; } }
  };
  jeepStep = (dt) => {
    for (const d of Object.values(doors)) {
      if (d.cur === d.want) continue;
      const step = dt * 1.8; d.cur += Math.max(-step, Math.min(step, d.want - d.cur));
      const k = d.cur / d.open, e = k * k * (3 - 2 * k);                // ease in and out
      d.o.rotation.y = d.open * e;
    }
    lightStep(dt);
    if (far) {
      const d = camera.position.distanceTo(jeep.position), shut = Object.values(doors).every((q) => q.cur === 0);
      const want = shut && d > (isFar ? 11.5 : 12.5);   // a little hysteresis so it doesn't flicker at the edge
      if (want !== isFar) { isFar = want; far.visible = want; for (const m of jeepMeshes) m.visible = !want; }
    }
  };
  const meshes = []; for (const d of Object.values(doors)) d.o.traverse((m) => { if (m.isMesh) { m.userData.door = d; meshes.push(m); } });
  jeepTap = (x, y) => {
    const h = pickAt(x, y, meshes); if (!h) return false;
    if (h.distance > 6) { toast("Get a bit closer"); return true; }
    const d = h.object.userData.door; d.want = d.want ? 0 : d.open; return true;
  };
  window.__jeep = {
    node: jeep,
    open: (w = "B") => { const d = doors[w]; if (d) d.want = d.open; }, close: (w = "B") => { const d = doors[w]; if (d) d.want = 0; },
    isOpen: (w = "B") => !!doors[w] && Math.abs(doors[w].cur) > Math.abs(doors[w].open) * 0.8,
    seat: world("SeatP"), sill: world("DoorSill"), cargo: world("Boot"),
    lights: { get cabin() { return cab; } },
    cargoSlots: [[-0.3, -0.75], [0.3, -0.75], [-0.3, -1.3], [0.3, -1.3]].map(([x, z]) => local(x, boot.y, z)),
  };
}

export { jeepStep, jeepTap };
