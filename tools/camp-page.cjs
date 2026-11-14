// Canopy Camp headless page: the browser set-up every camp tool shares (review crosscut-22, R2-127): tools/camp-probe.cjs,
// tools/camp-gpu.cjs, tools/camp-replay.cjs, tools/camp-scenarios.cjs and props/shadow/export_casters.cjs. The camp runs in
// Chromium (WebGL on SwiftShader, or the real GPU), served from a checkout by a small static server, with three.js from
// node_modules (the cloud proxy blocks jsDelivr) and, in virtualise(), a virtual clock and a seeded Math.random, so two
// runs of the same code do exactly the same thing.
// Exports:
//   THREE_VER                       the three.js version camp.html loads, read from its import map (the one place it is typed)
//   serve(root, port, transform)    a static server for that checkout; transform(file, bytes) may rewrite a .js file.
//                                   Port 0 takes a free port; await listening(server) for the port it got
//   listening(server)               a promise of the port the server listens on
//   launch({ width, height, touch, dpr, gpu, headed, userAgent, args })   { browser, page }: Chromium with WebGL on
//                                   SwiftShader, or with gpu (or CAMP_GPU=1) on the machine's real GPU. The browser is
//                                   CHROMIUM=<path> when it is set (CHROME= is read too, its old name), else the repo's
//                                   playwright build, else the preinstalled /opt/pw-browsers/chromium. args adds flags.
//   openCamp({ root, port, query, url, before, timeout, ...launch options })   serves the checkout (root: this repo; port 0,
//                                   the default, takes a free one), opens the browser, routes three.js, runs before(page)
//                                   (listeners and init scripts the tool needs), opens camp.html with query (or the page
//                                   at url, a path from the root) and waits for window.__ready on the real clock.
//                                   Returns { page, browser, port, tReady (ms), close() }
//   routeThree(page)                three.js from node_modules; its uuids draw from a stream of their own, so that making one
//                                   object more or fewer does not shift the numbers the page itself draws
//   watch(page)                     { errs, cons, programs() }: page errors, console errors and HTTP errors; every console
//                                   line; and how many shader programs were linked
//   virtualise                      runs in the page before any script: the virtual clock, timers on it, seeded Math.random
//                                   (counted in window.__mrN), animation frames that wait to be stepped (window.__step)
//   loadCamp(page, port, query, errs)   opens camp.html and pumps the virtual timers until window.__ready (exits 2 if never)
//   stepFrames(page, n)             steps n frames of 1/20 s, ten at a time, letting downloads settle in between
//   fingerprint                     runs in the page: one row per scene object (rounded to 1e-4), with draws and triangles
const path = require('path'), fs = require('fs'), http = require('http');
const NM = path.resolve(__dirname, '..', 'node_modules');
const { chromium } = require(path.join(NM, 'playwright'));
const THREE_VER = (fs.readFileSync(path.resolve(__dirname, '../apps/canopy-prototype/camp.html'), 'utf8').match(/three@(\d+\.\d+\.\d+)\//) || [])[1];
if (!THREE_VER) { console.error('camp.html: no three@<version> in its import map'); process.exit(2); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain',
  '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };

function serve(root, port, transform) {
  return http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    if (transform) d = transform(f, d);
    r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(port);
}
const listening = (srv) => new Promise((ok, err) => { if (srv.listening) ok(srv.address().port); else { srv.once('listening', () => ok(srv.address().port)); srv.once('error', err); } });

async function launch({ width = 480, height = 300, touch = false, dpr = 1, gpu = !!process.env.CAMP_GPU, headed = false, userAgent, args: extra = [] } = {}) {
  // gpu (or CAMP_GPU=1) uses the machine's real GPU (ANGLE on D3D11 on Windows): much faster on a desktop with a graphics card.
  // Pixels can differ a little from SwiftShader's, so compare runs made the same way.
  const args = [...(gpu ? ['--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']), ...extra];
  const exe = process.env.CHROMIUM || process.env.CHROME, opts = { args, headless: !headed };
  const browser = exe ? await chromium.launch({ ...opts, executablePath: exe })
    : await chromium.launch(opts).catch(() => chromium.launch({ ...opts, executablePath: '/opt/pw-browsers/chromium' }));
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, ...(touch ? { hasTouch: true, isMobile: true } : {}), ...(userAgent ? { userAgent } : {}) });
  return { browser, page };
}

async function openCamp({ root = path.resolve(__dirname, '..'), port = 0, query = '', url, before, timeout = 240000, ...opts } = {}) {
  const srv = serve(path.resolve(root), port), at = await listening(srv);
  const { browser, page } = await launch(opts);
  const close = async () => { await browser.close().catch(() => {}); srv.close(); };
  try {
    await routeThree(page);
    if (before) await before(page);
    const t0 = Date.now();
    await page.goto(`http://localhost:${at}${url || '/apps/canopy-prototype/camp.html' + query}`);
    await page.waitForFunction(() => window.__ready, null, { timeout });
    return { page, browser, port: at, tReady: Date.now() - t0, close };
  } catch (e) { await close(); throw e; }
}

async function routeThree(page) {
  const core = fs.readFileSync(path.join(NM, 'three/build/three.core.js'), 'utf8').replace('function generateUUID() {', 'let __us = 1; const __ur = () => { __us = (Math.imul(__us, 1664525) + 1013904223) >>> 0; return __us / 4294967296; };\nfunction generateUUID() {').replace(/const (d[0-3]) = Math\.random\(\)/g, 'const $1 = __ur()');
  if (!core.includes('const d3 = __ur()')) { console.error('three.core.js: generateUUID not found'); process.exit(2); }
  const at = new RegExp(`cdn\\.jsdelivr\\.net/npm/three@${THREE_VER.replace(/\./g, '\\.')}/(.*)`);
  await page.route(at, (rt) => { const m = rt.request().url().match(at); if (m[1] === 'build/three.core.js') return rt.fulfill({ body: core, contentType: 'text/javascript' }); rt.fulfill({ path: path.join(NM, 'three', m[1]), contentType: m[1].endsWith('.wasm') ? 'application/wasm' : 'text/javascript' }); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (rt) => rt.fulfill({ body: '', contentType: 'text/css' }));
}

async function watch(page) {
  const errs = [], cons = []; let programs = 0;
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { cons.push(m.type() + ' ' + m.text()); if (m.type() === 'error') errs.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().slice(-70)); });
  await page.exposeFunction('__linked', () => { programs++; });
  await page.addInitScript(() => { for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const f = C.prototype.linkProgram; C.prototype.linkProgram = function (...a) { window.__linked(); return f.apply(this, a); }; } });
  return { errs, cons, programs: () => programs };
}

// runs in the page before any script: a virtual clock, a seeded Math.random, and animation frames that wait to be stepped
function virtualise() {
  let now = 1000, seed = 12345, id = 0; const q = new Map();
  performance.now = () => now; Date.now = () => 1700000000000 + Math.round(now);
  Math.random = () => { window.__mrN = (window.__mrN || 0) + 1; seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
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

// loading: modules wait on their downloads with top-level await; pump the virtual timers (no frames) until the page is ready
async function loadCamp(page, port, query, errs) {
  await page.goto(`http://localhost:${port}/apps/canopy-prototype/camp.html${query}`);
  for (let i = 0; i < 2400 && !(await page.evaluate(() => { window.__flushTimers(); return !!window.__ready; })); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await page.evaluate(() => !!window.__ready))) { console.error('page never became ready', errs); process.exit(2); }
  await page.waitForLoadState('networkidle'); await new Promise((r) => setTimeout(r, 1500));
}
async function stepFrames(page, n) {
  for (let done = 0; done < n;) { const k = Math.min(10, n - done); await page.evaluate(([j]) => window.__step(j, 50), [k]); done += k; await page.waitForLoadState('networkidle'); }
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

module.exports = { THREE_VER, serve, listening, launch, openCamp, routeThree, watch, virtualise, loadCamp, stepFrames, fingerprint, chromium };
