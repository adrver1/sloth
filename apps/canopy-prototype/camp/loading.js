// The loading card, shared by both levels (Adriaen 2026-11-16: "in the jungle there is a load screen ... why don't we do the
// same in summit?"). The page carries <div id="load"> with its bar <i id="loadbar"> (styled in camp/hud.css); it covers the
// downloads (the models, the light maps, the ground's maps) and the shader compiles, so nothing pops in and the first look
// round doesn't stutter (camp review P2).
// Exports track(promise) (counts a download for the bar; returns the promise), until(test, ms) (a promise that resolves once
// test() is true, or after ms), compileAll(renderer, scene, camera) and lift() (the bar full, the card fades and goes).
let n = 0, done = 0;
const bar = (pc) => { const b = document.getElementById('loadbar'); if (b) b.style.width = `${pc}%`; };
export const track = (p) => { if (!p) return p; n++; const tick = () => bar(4 + 86 * ++done / n); p.then(tick, tick); return p; };
export const until = (test, ms) => new Promise((ok) => { const t0 = performance.now(); const go = () => (test() || performance.now() - t0 > ms ? ok() : setTimeout(go, 100)); go(); });
// three compiles only what is visible, so everything hidden now (the night dome, the mist, the rain, the jeep's far model, the
// highlight's hulls, things the sloths hold) is shown for the call and hidden again after. Lights are left as they are: the
// shaders are built for the lights that are on (review R2-102). compileAsync builds the programs before it returns (its promise
// only waits for the driver), so they are hidden again before any other code can run
export async function compileAll(renderer, scene, camera) {
  const hidden = []; scene.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } });
  const compiled = renderer.compileAsync(scene, camera);
  for (const o of hidden) o.visible = false;
  await compiled.catch(() => {});
}
export function lift() { const el = document.getElementById('load'); if (!el) return; bar(100); el.classList.add('done'); setTimeout(() => el.remove(), 700); }
