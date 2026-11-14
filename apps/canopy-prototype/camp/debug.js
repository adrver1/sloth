// Canopy Camp tool hooks: every window.__ name on camp.html, set in this one module (review crosscut-03, crosscut-04, C2). The
// camp's modules talk through imports; these names are only for the headless tools, which drive and read the page from
// outside. main.js calls ready() when the camp is built and its shaders are compiled; that sets them all. It makes no scene
// object and draws no random number. (The old debug hooks for checks by hand are gone: Adriaen does not use them,
// 2026-11-13, and tools/camp-scenarios.cjs reads the modules' exports instead.)
//   name             what                                                  read by
//   __ready          true once the camp runs (ready(), main.js)            all the tools: they wait for it
//   __scene          the three.js scene (core.js)                          all the tools (camp-page.cjs's fingerprint)
//   __stats          fps, draw calls, triangles, resolution (stats, filled by main.js once a second)   camp-probe.cjs, camp-replay.cjs
//   __time(h)        jumps the day to hour h (daytime.js)                  camp-replay.cjs's tour, the scenario tours (tools/tours/)
//   __boop(i), __feed(i)   you boop or feed sloth i (input.js)             camp-replay.cjs's tour, the scenario tours
//   __stick(x, y)    the phone stick held at x, y (hud.js stickV)          camp-replay.cjs's tour, the scenario tours
//   __sit(i)         you sit on log seat i (linger.js sit)                 camp-replay.cjs's tour, the scenario tours
//   __weather(mode)  the weather set at once (weather.js setWeather)       camp-replay.cjs's tour
//   __campFast       the camp's pace (core.js pace.fast): 6 runs the sloths' day and the jeep seats six times as fast   camp-replay.cjs's tour, the scenarios
//   __camp           CAMP: the tent and the hammock's posts (campProps.js)   props/shadow/export_casters.cjs (the bake's layout)
//   __jeep           jeepApi (jeep.js), when there is a jeep               export_casters.cjs (its place); camp-scenarios.cjs on old checkouts
//   __laundry        LAUNDRY (layout.js), when the line is shown           export_casters.cjs
//   __glade          the glade and the sloths' path (layout.js)            export_casters.cjs
//   __ground         groundLife (campGround.js, through campLife.js)       export_casters.cjs (its layout)
//   __deadwood       deadwood (deadwood.js): its layout and triangles      export_casters.cjs (the ground-shadow bake)
//   __terrainGrid(n) the ground's height grid (terrain.js heightGrid)      export_casters.cjs
// Exports stats and ready().
import { LIVED, pace, scene } from "./core.js";
import { GLADE, LAUNDRY, sloPath } from "./layout.js";
import { stickV } from "./hud.js";
import { heightGrid } from "./terrain.js";
import { deadwood } from "./deadwood.js";
import { CAMP } from "./campProps.js";
import { jeepApi } from "./jeep.js";
import { sloths } from "./sloths.js";
import { groundLife } from "./campLife.js";
import { boop, feed } from "./input.js";
import { setWeather } from "./weather.js";
import { sit } from "./linger.js";
import { day } from "./daytime.js";

const stats = {};
// every name is set here, once everything they point to is built, and __ready last
function ready() {
  Object.assign(window, {
    __scene: scene, __stats: stats,
    __time: (h) => day.setHour(h, true), __boop: (i) => boop(sloths[i]), __feed: (i) => feed(sloths[i]), __stick: (x, y) => stickV.set(x, y),
    __sit: sit, __weather: setWeather,
    __camp: CAMP, __glade: { at: GLADE, path: sloPath.pts }, __ground: groundLife, __deadwood: deadwood, __terrainGrid: heightGrid,
  });
  if (jeepApi) window.__jeep = jeepApi;
  if (LIVED) window.__laundry = LAUNDRY;
  Object.defineProperty(window, "__campFast", { get: () => pace.fast, set: (v) => { pace.fast = v; }, configurable: true });
  window.__ready = true;
}

export { ready, stats };
