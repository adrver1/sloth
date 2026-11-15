// Canopy Camp replay check: runs the camp headless on a virtual clock with seeded Math.random, steps a fixed number of
// frames, and prints a fingerprint of the scene (every object's world transform and visibility, its vertices and instances, every material's key
// settings, draw calls, triangles, shader programs) plus screenshots at checkpoints. Two runs of the same code give the
// same fingerprint. It is an optional diagnostic, not a gate (Adriaen, 2026-11-14): a clean-up may change the camp's
// behaviour and so the fingerprint; what it must not do is add errors, break the tour's interactions or cost more draws.
// Usage (from the repo root, after npm ci):
//   node tools/camp-replay.cjs [--root <repo>] [--frames 480] [--shots out/dir] [--query "?jeep=none"] [--port 8811]
//   node tools/camp-replay.cjs --compare dirA dirB     # the shots of two runs: pixels that differ by more than 2/255
// (the software renderer is off by 1/255 on a few pixels from run to run, so the shots are compared with that tolerance;
// the fingerprint is exact.)
// --root points at another checkout (for example a worktree of main) to fingerprint that code with this same tool.
// Each frame is 1/20 s of camp time. On the way a short tour uses the page's own test hooks (walk, boop, feed, night,
// rain, sit, a faster camp day), so the sloths, the operator, the night light and the weather all run.
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.resolve(__dirname, '..'))), FRAMES = +arg('frames', 480), SHOTS = arg('shots', ''), QS = arg('query', ''), PORT = +arg('port', 8811);
const { serve, launch, routeThree, stubFonts, watch, virtualise, loadCamp, stepFrames, fingerprint } = require('./camp-page.cjs');   // the shared set-up
const srv = serve(ROOT, PORT);

async function compare(A, B) {
  const { browser: b, page: p } = await launch(); let bad = 0;
  for (const f of fs.readdirSync(A).filter((f) => f.endsWith('.png')).sort((x, y) => parseInt(x.slice(6)) - parseInt(y.slice(6)))) {
    if (!fs.existsSync(path.join(B, f))) { console.log(`${f}: missing in ${B}`); bad++; continue; }
    const n = await p.evaluate(async ([a, c]) => { const px = async (d) => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const cv = new OffscreenCanvas(im.width, im.height), g = cv.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const x = await px(a), y = await px(c); if (x.length !== y.length) return -1; let n = 0; for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) > 2 || Math.abs(x[i + 1] - y[i + 1]) > 2 || Math.abs(x[i + 2] - y[i + 2]) > 2) n++; return n; },
      [fs.readFileSync(path.join(A, f)).toString('base64'), fs.readFileSync(path.join(B, f)).toString('base64')]);
    console.log(`${f}: ${n < 0 ? 'different size' : n + ' pixels differ'}`); if (n) bad++;
  }
  for (const f of fs.readdirSync(A).filter((f) => f.startsWith('rows-'))) if (fs.existsSync(path.join(B, f)) && fs.readFileSync(path.join(A, f), 'utf8') !== fs.readFileSync(path.join(B, f), 'utf8')) { console.log(`${f}: scene rows differ`); bad++; }
  console.log(bad ? `${bad} differences` : 'same'); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
}

(async () => {
  const ci = process.argv.indexOf('--compare'); if (ci > 0) return compare(process.argv[ci + 1], process.argv[ci + 2]);
  const { browser: b, page: p } = await launch();
  await routeThree(p); await stubFonts(p);
  const { errs, programs } = await watch(p);
  await p.addInitScript(virtualise);
  await loadCamp(p, PORT, QS, errs);
  await p.addStyleTag({ content: 'body > :not(canvas) { visibility: hidden !important; }' });   // the HUD fades on real time; the shots compare the 3D view only
  // the tour: [frame, what to do]; hooks a page doesn't have are skipped
  const TOUR = [[20, 'window.__stick?.(0, 1)'], [70, 'window.__stick?.(0.6, 0.3)'], [100, 'window.__stick?.(0, 0)'], [110, 'window.__boop?.(0)'], [130, 'window.__feed?.(1)'],
    [150, 'window.__time?.(21)'], [200, 'window.__weather?.("rain")'], [250, 'window.__sit?.(0)'], [300, 'window.__time?.(8); window.__weather?.("clear")'], [330, 'window.__campFast = 6'],
    [400, 'window.__stick?.(-0.5, -1)'], [440, 'window.__stick?.(0, 0); window.__time?.(18.5)']];
  const stops = new Set([1, FRAMES]); for (let i = 1; i <= 8; i++) stops.add(Math.round(FRAMES * i / 8)); for (const [f] of TOUR) if (f < FRAMES) stops.add(f);
  const order = [...stops].sort((x, y) => x - y), marks = new Set([1, ...Array.from({ length: 8 }, (_, i) => Math.round(FRAMES * (i + 1) / 8))]);
  const out = { frames: FRAMES, marks: {} }; let done = 0;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (const m of order) {
    await stepFrames(p, m - done); done = m;
    for (const [f, js] of TOUR) if (f === m) await p.evaluate(js);
    if (!marks.has(m)) continue;
    const f = await p.evaluate(fingerprint);
    const hash = crypto.createHash('sha1').update(f.rows.join('\n')).digest('hex').slice(0, 16);
    out.marks[m] = { hash, objects: f.objects, draws: f.draws, tris: f.tris, calls: f.calls };
    if (SHOTS) { fs.writeFileSync(path.join(SHOTS, `rows-${m}.txt`), f.rows.join('\n')); await p.screenshot({ path: path.join(SHOTS, `frame-${m}.png`) }); }
  }
  out.programs = programs(); out.errors = errs.slice(0, 10);
  // the fingerprint covers the scene only; draw calls and programs are printed beside it, since a fix may lower them on purpose
  out.fingerprint = crypto.createHash('sha1').update(Object.values(out.marks).map((m) => m.hash).join()).digest('hex').slice(0, 16);
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.close();
  process.exit(errs.length ? 1 : 0);
})();
