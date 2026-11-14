// Canopy Camp replay check: runs the camp headless on a virtual clock with seeded Math.random, steps a fixed number of
// frames, and prints a fingerprint of the scene (every object's world transform and visibility, its vertices and instances, every material's key
// settings, draw calls, triangles, shader programs) plus screenshots at checkpoints. Two runs of the same code give the
// same fingerprint, so a refactor that is meant to change nothing can be checked: same fingerprint before and after.
// Usage (from the repo root, after npm install):
//   node tools/camp-replay.cjs [--root <repo>] [--frames 480] [--shots out/dir] [--query "?jeep=none"] [--port 8811]
//   node tools/camp-replay.cjs --compare dirA dirB     # the shots of two runs: pixels that differ by more than 2/255
// (the software renderer is off by 1/255 on a few pixels from run to run, so the shots are compared with that tolerance;
// the fingerprint is exact.)
// --root points at another checkout (for example a worktree of main) to fingerprint that code with this same tool.
// Each frame is 1/20 s of camp time. On the way a short tour uses the page's own test hooks (walk, boop, feed, night,
// rain, sit, a faster camp day), so the sloths, the operator, the night light and the weather all run.
const path = require('path'), fs = require('fs'), http = require('http'), crypto = require('crypto');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.resolve(__dirname, '..'))), FRAMES = +arg('frames', 480), SHOTS = arg('shots', ''), QS = arg('query', ''), PORT = +arg('port', 8811);
const { chromium } = require(path.resolve(__dirname, '..', 'node_modules', 'playwright'));
const NM = path.resolve(__dirname, '..', 'node_modules', 'three');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);

// runs in the page before any script: a virtual clock, a seeded Math.random, and animation frames that wait to be stepped
function virtualise() {
  let now = 1000, seed = 12345, id = 0; const q = new Map();
  performance.now = () => now; Date.now = () => 1700000000000 + Math.round(now);
  Math.random = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.requestAnimationFrame = (f) => { q.set(++id, f); return id; }; window.cancelAnimationFrame = (i) => q.delete(i);
  // timers run on the virtual clock too, in order, when a frame is stepped (the page's own timeouts: toasts, saves, errands)
  const timers = []; let tid = 0; const realSet = window.setTimeout.bind(window);
  window.__realTimeout = realSet;
  window.setTimeout = (f, ms = 0, ...a) => { timers.push({ id: ++tid, at: now + ms, f, a }); return tid; };
  window.clearTimeout = (i) => { const k = timers.findIndex((t) => t.id === i); if (k >= 0) timers.splice(k, 1); };
  window.setInterval = (f, ms = 0, ...a) => { const t = { id: ++tid, at: now + ms, f, a, every: ms }; timers.push(t); return t.id; };
  window.clearInterval = window.clearTimeout;
  const runTimers = () => { for (let guard = 0; guard < 1000; guard++) { timers.sort((x, y) => x.at - y.at || x.id - y.id); const t = timers[0]; if (!t || t.at > now) return;
    if (t.every !== undefined) t.at += Math.max(1, t.every); else timers.shift(); try { t.f(...t.a); } catch (e) { console.error(e); } } };
  // while the page loads, nothing steps the clock: fire whatever is waiting (three.js polls for compiled shaders with timeouts)
  window.__flushTimers = () => { const due = timers.splice(0).sort((x, y) => x.at - y.at || x.id - y.id); for (const t of due) { if (t.every !== undefined) timers.push(t); try { t.f(...t.a); } catch (e) { console.error(e); } } };
  window.__step = (n, dtMs) => { for (let i = 0; i < n; i++) { now += dtMs; runTimers(); const cbs = [...q.values()]; q.clear(); for (const f of cbs) f(now); } return q.size; };
  try { localStorage.clear(); } catch {}
}

// runs in the page: a fingerprint of everything in the scene
function fingerprint() {
  const S = window.__scene, r = (v) => Math.round(v * 1e4) / 1e4, rows = []; let draws = 0, tris = 0;
  const sum = (a, n) => { let h = 0; for (let i = 0; i < n; i++) h = (Math.imul(h, 31) + Math.round(a[i] * 1e3)) | 0; return h; };   // a hash of a buffer: leaves, grass, particles, vertices
  S.updateMatrixWorld(true);
  S.traverse((o) => {
    let vis = true, p = o; while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
    let names = []; p = o; while (p && p !== S) { names.unshift(p.name || p.type); p = p.parent; }
    const row = [names.join('/'), vis ? 1 : 0, ...Array.from(o.matrixWorld.elements, r)];
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
      const g = o.geometry, n = g ? (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) : 0;
      row.push(n, o.isInstancedMesh ? o.count : -1, o.renderOrder, o.frustumCulled ? 1 : 0);
      if (o.isInstancedMesh) row.push(sum(o.instanceMatrix.array, o.count * 16), o.instanceColor ? sum(o.instanceColor.array, o.count * 3) : 0);
      if (g) for (const k of Object.keys(g.attributes).sort()) { const at = g.attributes[k]; row.push(k, at.count, sum(at.array, at.array.length)); }
      for (const m of [].concat(o.material)) { row.push(m.type, m.transparent ? 1 : 0, r(m.opacity), m.side, m.blending, m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0, r(m.alphaTest || 0), m.visible ? 1 : 0, m.color ? m.color.getHex() : -1, m.emissive ? m.emissive.getHex() : -1, r(m.emissiveIntensity ?? -1), m.map ? 1 : 0, m.lightMap ? 1 : 0, m.vertexColors ? 1 : 0, m.fog ? 1 : 0);
        if (m.uniforms) for (const k of Object.keys(m.uniforms).sort()) { const v = m.uniforms[k].value; if (typeof v === 'number') row.push(k, r(v)); else if (v && v.isVector3) row.push(k, r(v.x), r(v.y), r(v.z)); else if (v && v.isColor) row.push(k, v.getHex()); } }
      if (vis) { draws++; tris += o.isPoints || o.isSprite ? 0 : Math.round(n / 3) * (o.isInstancedMesh ? o.count : 1); }
    }
    if (o.isLight) row.push(o.type, r(o.intensity), o.color.getHex());
    rows.push(row.join(','));
  });
  const fog = S.fog ? [S.fog.color.getHex(), r(S.fog.density ?? 0)] : [];
  const st = window.__stats || {};
  return { objects: rows.length, draws, tris, calls: st.calls, rtris: st.tris, fog, rows };
}

async function compare(A, B) {
  const b = await chromium.launch().catch(() => chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })); const p = await b.newPage(); let bad = 0;
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
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const b = await chromium.launch({ args }).catch(() => chromium.launch({ args, executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }));
  const p = await b.newPage({ viewport: { width: 480, height: 300 }, deviceScaleFactor: 1 });
  // three.js is served from node_modules. Its uuids (one per object, material, texture) draw from Math.random; here they get a
  // stream of their own, so that making one object more or fewer does not shift the random numbers the page itself draws
  const core = fs.readFileSync(path.join(NM, 'build/three.core.js'), 'utf8').replace('function generateUUID() {', 'let __us = 1; const __ur = () => { __us = (Math.imul(__us, 1664525) + 1013904223) >>> 0; return __us / 4294967296; };\nfunction generateUUID() {').replace(/const (d[0-3]) = Math\.random\(\)/g, 'const $1 = __ur()');
  if (!core.includes('const d3 = __ur()')) { console.error('three.core.js: generateUUID not found'); process.exit(2); }
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.1\/(.*)/, (rt) => { const m = rt.request().url().match(/three@0\.186\.1\/(.*)/); if (m[1] === 'build/three.core.js') return rt.fulfill({ body: core, contentType: 'text/javascript' }); rt.fulfill({ path: path.join(NM, m[1]), contentType: m[1].endsWith('.wasm') ? 'application/wasm' : 'text/javascript' }); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (rt) => rt.fulfill({ body: '', contentType: 'text/css' }));
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().slice(-70)); });
  let programs = 0; await p.exposeFunction('__linked', () => { programs++; });
  await p.addInitScript(() => { for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const f = C.prototype.linkProgram; C.prototype.linkProgram = function (...a) { window.__linked(); return f.apply(this, a); }; } });
  await p.addInitScript(virtualise);
  await p.goto(`http://localhost:${PORT}/apps/canopy-prototype/camp.html${QS}`);
  // loading: modules wait on their downloads with top-level await; pump the virtual timers (no frames) until the page is ready
  for (let i = 0; i < 2400 && !(await p.evaluate(() => { window.__flushTimers(); return !!window.__ready; })); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await p.evaluate(() => !!window.__ready))) { console.error('page never became ready', errs); process.exit(2); }
  await p.waitForLoadState('networkidle'); await new Promise((r) => setTimeout(r, 1500));
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
    for (; done < m;) { const n = Math.min(10, m - done); await p.evaluate(([k]) => window.__step(k, 50), [n]); done += n; await p.waitForLoadState('networkidle'); }
    for (const [f, js] of TOUR) if (f === m) await p.evaluate(js);
    if (!marks.has(m)) continue;
    const f = await p.evaluate(fingerprint);
    const hash = crypto.createHash('sha1').update(f.rows.join('\n')).digest('hex').slice(0, 16);
    out.marks[m] = { hash, objects: f.objects, draws: f.draws, tris: f.tris, calls: f.calls };
    if (SHOTS) { fs.writeFileSync(path.join(SHOTS, `rows-${m}.txt`), f.rows.join('\n')); await p.screenshot({ path: path.join(SHOTS, `frame-${m}.png`) }); }
  }
  out.programs = programs; out.errors = errs.slice(0, 10);
  // the fingerprint covers the scene only; draw calls and programs are printed beside it, since a fix may lower them on purpose
  out.fingerprint = crypto.createHash('sha1').update(Object.values(out.marks).map((m) => m.hash).join()).digest('hex').slice(0, 16);
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.close();
  process.exit(errs.length ? 1 : 0);
})();
