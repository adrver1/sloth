// Canopy Camp in the jeep (diegetic controls, Adriaen 2026-11-13): open the driver's door (DoorP, the camp side) and "Get in"
// sits you at the wheel; while the jeep's sloth is playing at driving there, you ride beside it (either front door). In there three things light up like everything else you can use:
//   the key in the ignition: "Turn the key" cranks and starts the engine (the key turns, the jeep shakes, then idles with a
//     gentle tremble); "Drive somewhere" is the placeholder for fast travel to other levels; "Turn the engine off"
//   the radio in the middle of the dash: the same menu as the radio on the snack table (radio.js); the music then plays from it
//   the dash clock: the same menu as the camp's other clocks (clock.js)
// "Get out" on the door, or walking off with the stick or the keys, puts you back outside the door you came in by.
// Built here and painted on canvas, nothing added to the baked jeep: key 4, ignition ring 6, radio face 2, clock 10 + hands 4 =
// 26 triangles. The jeep's own nodes (build_jeep.py): SeatP is the driver's cushion top, WheelHub the steering wheel's middle;
// the dash's face toward the driver is at local z 0.14, from y 0.93 to 1.13.
import * as THREE from "three";
import { camera, canvasTex, scene } from "./core.js";
import { V } from "./forest.js";
import { me } from "./player.js";
import { addTarget } from "./input.js";
import { toast } from "./hud.js";
import { audio } from "./audio.js";
import { radioOptions, radioPlaying, radioSource } from "./radio.js";
import { addClock, faceTex, hand } from "./clock.js";
import { sloths } from "./sloths.js";

const J = window.__jeep, jeep = J?.node;
let carStep = () => {};
if (jeep) {
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  const DASH_Z = 0.137, local = (x, y, z) => jeep.localToWorld(V(x, y, z));
  const seatL = jeep.worldToLocal(jeep.getObjectByName("SeatP").getWorldPosition(V()));   // the driver's cushion top, jeep space
  const onDash = (o, x, y, tilt = 0) => { o.position.set(x, y, DASH_Z); o.rotation.set(tilt, Math.PI, 0); jeep.add(o); return o; };   // its front toward the driver (-z)
  const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };

  // ---------------------------------------------------------------- getting in and out
  let seat = null;
  const inCar = () => me.seat != null && me.seat === seat;
  // the jeep's own sloth plays at driving in the driver's seat (sloths.js spot "jeep"); while it is in, you take the
  // passenger seat beside it and reach over for the key, the radio and the clock
  const slothAtWheel = () => sloths.some((s) => s.spot?.car && s.spot.home && s.o.visible);
  let side = 1;   // +1 the driver's seat (camp side), -1 the passenger's
  function getIn(force) {
    side = force ?? (slothAtWheel() ? -1 : 1);
    const p = local(seatL.x * side, 0, seatL.z - 0.08), fwd = V(0, 0, 1).transformDirection(jeep.matrixWorld).setY(0).normalize();
    const eyeY = jeep.position.y + seatL.y + 0.68 - (window.__groundHeight?.(p.x, p.z) ?? 0);   // seated eye height above the ground
    seat = { pos: p.setY(0), yaw: Math.atan2(-fwd.x, -fwd.z), drop: 1.55 - eyeY, car: true };
    // look down at the dash, a little toward the middle where the radio, the clock and the key are
    const eye = p.clone().setY(jeep.position.y + seatL.y + 0.68), aim = local(0.18 * side, 1.0, DASH_Z).sub(eye);
    me.seat = seat; me.yaw = Math.atan2(-aim.x, -aim.z); me.pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z)) + 0.12; me.lastDrag = -9; seat.yaw = me.yaw;
    toast(side > 0 ? "At the wheel 🚙" : "Riding with the sloth at the wheel 🦥");
  }
  function getOut() {
    if (me.seat === seat) me.seat = null;
    const out = local((seatL.x + 1.25) * side, 0, seatL.z).setY(0);   // beside the door you came in by
    me.pos.copy(out); me.sitK = 0; seat = null;
  }
  // the door's menu (input.js asks window.__car.doorOptions for each jeep door)
  window.__car = {
    doorOptions: (d) => d.k !== "P" && d.k !== "D" ? [] : inCar() ? [["Get out 🚪", getOut]] : d.open ? [["Get in 🚙", getIn]] : [],
    inCar, getIn, getOut,
  };

  // ---------------------------------------------------------------- the key: turn it to start the engine
  // the key head (a brass bow and blade, a leather fob) on one quad that turns about the slot, and a chrome ring round the slot
  const keyTex = canvasTex(64, 128, (c, w, h) => {
    c.fillStyle = "#7a4a2c"; c.beginPath(); c.roundRect(14, 70, 36, 52, 10); c.fill(); c.fillStyle = "#c9a86a"; c.beginPath(); c.arc(32, 112, 4, 0, 7); c.fill();   // the fob
    c.strokeStyle = "#9a9a9a"; c.lineWidth = 4; c.beginPath(); c.arc(32, 66, 7, 0, 7); c.stroke();                                                          // the ring
    c.fillStyle = "#e0b84a"; c.beginPath(); c.roundRect(14, 26, 36, 34, 12); c.fill(); c.fillStyle = "#b08a2e"; c.beginPath(); c.arc(32, 50, 4, 0, 7); c.fill();   // the bow
    c.fillStyle = "#d8d8d8"; c.fillRect(28, 0, 8, 28);                                                                                                      // the blade going in
  });
  const key = new THREE.Group(), keyQuad = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.07).translate(0, -0.035 + 0.0055, 0), lam({ map: keyTex, alphaTest: 0.5, side: THREE.DoubleSide }));
  keyQuad.rotation.x = 0.35; keyQuad.position.z = 0.012; key.add(keyQuad);   // hanging down from the slot, its fob tipped toward you
  const ring = new THREE.Mesh(new THREE.CircleGeometry(0.016, 6).translate(0, 0, 0.002), lam({ map: canvasTex(32, 32, (c, w) => { c.fillStyle = "#b8b8b8"; c.fillRect(0, 0, w, w); c.fillStyle = "#222"; c.fillRect(14, 6, 4, 20); }) }));
  const ign = new THREE.Group(); ign.add(ring, key); onDash(ign, seatL.x + 0.22, 0.99);   // right of the steering column, clear of the wheel's rim
  ign.name = "Ignition"; console.log(`LOG car key: ${tris(ign)} tris`);
  // the engine: off → cranking (the key held over, the jeep shudders) → running (an idle tremble)
  let engine = "off", crank = 0, keyA = 0;
  const KEY_RUN = -0.9, KEY_CRANK = -1.25;
  function start() { if (engine !== "off") return; engine = "crank"; crank = 0; toast("Turning the key… 🔑"); }
  function stop() { engine = "off"; toast("Engine off"); }
  addTarget(ign, () => ({ look: ign, picks: [keyQuad, ring], at: (v) => { ign.getWorldPosition(v); return new THREE.Sphere(v.clone(), 0.08); }, ready: inCar,
    options: () => engine === "off" ? [["Turn the key 🔑", start]]
      : [["Drive somewhere 🗺️", () => toast("Trips by jeep are coming soon 🚧")], ["Turn the engine off", stop]] }));

  // ---------------------------------------------------------------- the radio, in the middle of the dash
  // its face: a chrome bezel, a glowing display that shows the station, two knobs; the display is redrawn when the station changes
  const rc = document.createElement("canvas"); rc.width = 256; rc.height = 96;
  const rTex = new THREE.CanvasTexture(rc); rTex.colorSpace = THREE.SRGBColorSpace;
  const gc = document.createElement("canvas"); gc.width = 256; gc.height = 96; { const g = gc.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 256, 96); g.fillStyle = "#ffb347"; g.fillRect(52, 22, 152, 52); }
  const gTex = new THREE.CanvasTexture(gc);
  let shown = "";
  function drawRadio() {
    const st = audio.station(), on = radioPlaying() && radioSource() === carRadio, k = (on ? st.id : "off");
    if (k === shown) return; shown = k;
    const c = rc.getContext("2d"); c.fillStyle = "#9a9a9a"; c.fillRect(0, 0, 256, 96); c.fillStyle = "#2b2b2b"; c.fillRect(4, 4, 248, 88);
    c.fillStyle = on ? "#3a2a12" : "#1a1a1a"; c.fillRect(52, 22, 152, 52);
    c.fillStyle = on ? "#ffd27a" : "#555"; c.font = "600 22px Fredoka, Trebuchet MS, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(on ? `${st.emoji} ${st.name.split(" ")[0]}` : "— — —", 128, 49);
    for (const x of [26, 230]) { c.fillStyle = "#cfcfcf"; c.beginPath(); c.arc(x, 48, 15, 0, 7); c.fill(); c.fillStyle = "#555"; c.fillRect(x - 2, 35, 4, 12); }
    rTex.needsUpdate = true;
  }
  const rMat = lam({ map: rTex, emissive: 0xffffff, emissiveMap: gTex, emissiveIntensity: 0 });
  const carRadio = onDash(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.075), rMat), -0.1, 1.02, -0.1);
  carRadio.name = "CarRadio"; drawRadio();
  addTarget(carRadio, () => ({ look: carRadio, picks: [carRadio], at: (v) => { carRadio.getWorldPosition(v); return new THREE.Sphere(v.clone(), 0.1); }, ready: inCar, options: () => radioOptions(carRadio) }));

  // ---------------------------------------------------------------- the dash clock, between the radio and the wheel
  const clock = new THREE.Group(), lume = lam({ map: faceTex({ bg: "#f6efe0", rim: "#3a3a3a", numbers: ["12", "3", "6", "9"], rimW: 0.12 }), emissive: 0xfff0c8, emissiveIntensity: 0 });
  clock.add(new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), lume));
  const hh = hand(0.006, 0.026, 0x2a2a2a), mh = hand(0.004, 0.036, 0x2a2a2a); hh.position.z = 0.002; mh.position.z = 0.003; clock.add(hh, mh);
  onDash(clock, 0.1, 1.03, -0.1); clock.name = "CarClock";
  addClock({ obj: clock, hands: [hh, mh], lume, glow: 0.8, ready: inCar, name: "car" });

  // ---------------------------------------------------------------- per frame: the key, the shake, walking off, the radio display
  const base = jeep.position.clone();
  let t = 0;
  carStep = (dt) => {
    t += dt;
    if (seat && me.seat !== seat) getOut();   // walked off (player.js clears the seat)
    if (engine === "crank") { crank += dt; if (crank > 1.1) { engine = "run"; toast("Brrrm! The engine is running 🚙"); } }
    const want = engine === "off" ? 0 : engine === "crank" ? KEY_CRANK : KEY_RUN;
    keyA += (want - keyA) * Math.min(1, dt * (engine === "crank" ? 14 : 8)); key.rotation.z = keyA;
    const amp = engine === "crank" ? 0.012 * Math.min(1, crank * 3) : engine === "run" ? 0.0035 : 0;
    jeep.position.set(base.x, base.y + amp * Math.sin(t * 61) * Math.sin(t * 7.3), base.z + amp * 0.5 * Math.sin(t * 47));
    jeep.rotation.z = amp * 0.6 * Math.sin(t * 53);
    drawRadio(); rMat.emissiveIntensity = shown === "off" ? 0 : 0.8;
  };
  window.__car.engine = () => engine; window.__camera ??= camera;   // checks
}
export { carStep };
