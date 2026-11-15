// Summit Cabin tool hooks: every window.__ name on summit.html, set in this one module (coding standards section 3). The summit's
// modules talk through imports; these names are only for the headless shot and probe scripts. main.js calls ready(api) once the
// first frame is set up, and fills `stats` (also read by player.js's Speed test) twice a second.
//   name       what                                                                     read by
//   __ready    true once the summit runs                                                the shot scripts: they wait for it
//   __scene    { setHour, weather, jump, me, showTris, TRIS, scene, renderer, levels, backdrop, life, ... } (main.js)   the shot and draw-count scripts
//   __stats    fps, draw calls, triangles, pixel ratio                                  the probe scripts
export const stats = { calls: 0, tris: 0, fps: 0, pr: 1 };
export function ready(api) {
  window.__scene = api;
  window.__stats = stats;
  window.__ready = true;
}
