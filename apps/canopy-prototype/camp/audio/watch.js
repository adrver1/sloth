// Canopy Camp sound, watching the camp: audioStep(dt, dusk), each frame, moves the ear to the camera, sets the beds for the
// weather and the hour, and hears what the camp did since the last frame (the sloths and the operator: castSounds.js; the
// pot; the jeep's doors and engine: jeepSound.js; your own steps), so the other
// modules need no sound calls. It reads the chores (chores.js acts), the operator (operator.js opApi) and the car
// (car.js carApi) once main.js has built them.
// It runs every frame, so it allocates nothing on a quiet frame: the last positions are copied into vectors held here, and
// a sound's position is made only when the sound plays (review R2-085).
import * as THREE from "three";
import { SOUP_POT } from "../layout.js";
import { acts } from "../chores.js";   // the pot's stage (null until main.js has built the chores)
import { camera } from "../core.js";
import { carApi } from "../car.js";   // the engine (null with ?jeep=none, or until main.js has built the car)
import { jeepApi } from "../jeep.js";
import { me } from "../player.js";
import { opApi } from "../operator.js";   // his sounds (null with ?op=0, or until main.js has built him)
import { sloths } from "../sloths.js";
import { weather } from "../weather.js";
import { rand as R, sstep } from "../util.js";   // R: a number between a and b from Math.random
import { ac } from "./context.js";
import { night, rain, SFX, underTent, wind } from "./sfx.js";
import { hearJeep } from "./jeepSound.js";
import { hearCast } from "./castSounds.js";
import { musicObj, musicPan, musicTick } from "./music.js";

const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3();

// ---------------------------------------------------------------- watching the camp: who did what since the last frame
let potStage = null, nextBird = 3, nextFrog = 5, nextOwl = 30, crackleT = 0, bubbleT = 0, dripT = 0, gustT = 0, gust = 0.5, meStepD = 0;
const meLast = new THREE.Vector3(); let meSeen = false;   // where you were last frame
const RATE = { empty: 0, water: 0.6, cooking: 6, ready: 2 };   // the pot's bubbles a second, by its stage
const potAt = () => new THREE.Vector3(SOUP_POT.at.x, SOUP_POT.at.y, SOUP_POT.at.z);
function audioStep(dt, dusk = 0) {
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime, wet = weather.wet, day = 1 - dusk;
  // the ear: the camera
  const L = ac.listener; camera.getWorldPosition(tmp); camera.getWorldDirection(fwd); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (L.positionX) { L.positionX.value = tmp.x; L.positionY.value = tmp.y; L.positionZ.value = tmp.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z; }
  else { L.setPosition(tmp.x, tmp.y, tmp.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  if (musicObj && musicPan) { musicObj.getWorldPosition(tmp); if (musicPan.positionX) { musicPan.positionX.value = tmp.x; musicPan.positionY.value = tmp.y; musicPan.positionZ.value = tmp.z; } else musicPan.setPosition(tmp.x, tmp.y, tmp.z); }
  // beds
  if ((gustT -= dt) < 0) { gustT = R(2, 5); gust = R(0.3, 1); }
  wind.g.gain.setTargetAtTime((0.05 + 0.06 * gust) * (1 - 0.5 * dusk) * (1 - 0.6 * wet), t, 1.2);
  rain.g.gain.setTargetAtTime(0.065 * wet, t, 0.8);
  const under = wet > 0.05 && underTent(me.pos);
  rain.drips.gain.setTargetAtTime(under ? 0.2 : 1, t, 0.3); rain.roof.gain.setTargetAtTime(under ? 1 : 0, t, 0.3);
  if (wet > 0.05 && (dripT -= dt) < 0) { dripT = R(0.02, 0.12) / wet; SFX.drip(false); if (under) { SFX.drip(true); if (Math.random() < 0.6) SFX.drip(true); } }
  night.g.gain.setTargetAtTime(sstep(0.4, 0.9, dusk) * (1 - 0.6 * wet), t, 1.5);
  if ((crackleT -= dt) < 0) { crackleT = R(0.03, 0.35); SFX.crackle(Math.random() < 0.04); }
  // the pot (activities.js soup, read through acts.cook): quiet when empty, a faint simmer of water, a lively bubble while
  // it cooks, a gentle one when it's soup; water pouring in (yours or his) when it fills. Without that, a gentle simmer.
  const stage = acts?.cook?.stage ?? "ready", rate = RATE[stage] ?? 2;
  if (potStage === "empty" && stage === "water") SFX.pour(potAt());
  if (potStage === "water" && stage === "cooking") SFX.plop(potAt());
  potStage = stage;
  if (rate && (bubbleT -= dt) < 0) { bubbleT = R(0.4, 1.6) / rate; SFX.bubble(); }
  if ((nextBird -= dt) < 0) { nextBird = R(2.5, 8) / Math.max(0.15, day * (1 - 0.7 * wet)); if (day > 0.3 && Math.random() < day * (1 - 0.7 * wet)) SFX.bird(); }
  if ((nextFrog -= dt) < 0) { nextFrog = R(2, 7); if (dusk > 0.6 || wet > 0.5) SFX.frog(); }
  if ((nextOwl -= dt) < 0) { nextOwl = R(25, 60); if (dusk > 0.8) SFX.owl(); }
  // life
  hearCast(dt, { sloths, op: opApi, ear: camera, steps: true }); hearJeep(jeepApi, carApi?.engine());   // castSounds.js and jeepSound.js, shared with the summit
  if (meSeen) { const d = Math.hypot(me.pos.x - meLast.x, me.pos.z - meLast.z); if (d < 0.5 && !me.seat) { meStepD += d; if (meStepD > 0.78) { meStepD = 0; SFX.step(null, true); } } }
  meLast.copy(me.pos); meSeen = true;
  musicTick();
}

export { audioStep };
