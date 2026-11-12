// Canopy Camp budget probe: loads a camp page headless (SwiftShader) and prints JSON with draw calls, triangles per object,
// every download with its size, textures and page errors. fps is meaningless under SwiftShader; the counts are exact.
// Usage (from the repo root, after npm install):
//   node tools/camp-probe.cjs "/apps/canopy-prototype/camp.html" out.png [width height] [js to run before the shot]
// three.js is served from node_modules, since the cloud proxy blocks jsDelivr.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const ROOT = path.resolve(__dirname, '..'), NM = ROOT + '/node_modules/three';
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } const ext = path.extname(f); r.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' }[ext] || 'text/plain' }); r.end(d); }); }).listen(8799);
(async () => {
  const url = process.argv[2], out = process.argv[3], vw = +(process.argv[4] || 1280), vh = +(process.argv[5] || 800);
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  // the repo's own playwright may want a browser build that isn't installed; fall back to the preinstalled Chromium
  const b = await chromium.launch({ args }).catch(() => chromium.launch({ args, executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }));
  const p = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.1\/(.*)/, (rt) => { const m = rt.request().url().match(/three@0\.186\.1\/(.*)/); rt.fulfill({ path: path.join(NM, m[1]), contentType: 'text/javascript' }); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (rt) => rt.fulfill({ body: '', contentType: 'text/css' }));
  // count shader programs linked (each is a compile the phone pays for)
  await p.addInitScript(() => { window.__programs = 0; for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const f = C.prototype.linkProgram; C.prototype.linkProgram = function (...a) { window.__programs++; return f.apply(this, a); }; } });
  const errs = [];
  // THROTTLE=mbps,latencyMs (e.g. 10,80) emulates a phone connection, to compare load times
  if (process.env.THROTTLE) { const [mb, lat] = process.env.THROTTLE.split(',').map(Number); const cdp = await p.context().newCDPSession(p);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: lat, downloadThroughput: mb * 125000, uploadThroughput: mb * 125000 }); }
  p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().slice(-60)); }); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const net=[]; p.on('requestfinished', async (rq) => { try { const r = await rq.response(); const b = await r.body(); net.push([rq.url().replace('http://localhost:8799/apps/canopy-prototype/','').slice(-70), b.length]); } catch {} });
  const t0 = Date.now();
  await p.goto('http://localhost:8799' + url);
  await p.waitForFunction(() => window.__ready, null, { timeout: 240000 });
  const tReady = Date.now() - t0;
  await p.waitForTimeout(6000);
  if (process.argv[6]) { await p.evaluate(process.argv[6]); await p.waitForTimeout(5000); }
  if (out) await p.screenshot({ path: out });
  const info = await p.evaluate(() => {
    const S = window.__scene, rows = [], tex = new Map();
    S.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine)) return;
      const g = o.geometry; const idx = g.index ? g.index.count : g.attributes.position.count;
      const inst = o.isInstancedMesh ? o.count : 1;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const fur = o.userData && o.userData.shell;
      let p = o, names = []; while (p && p !== S) { if (p.name) names.unshift(p.name); p = p.parent; }
      for (const m of mats) for (const k in m) { const v = m[k]; if (v && v.isTexture && v.image) { const im = v.image; const w = im.width || im.videoWidth, h = im.height; tex.set(v.uuid, { k, w, h, name: names.join('/') || m.type, src: (im.src || im.currentSrc || (im.tagName || 'data')).toString().slice(-60) }); } }
      rows.push({ n: names.join('/') || o.type, type: o.isInstancedMesh ? 'inst' : o.isSkinnedMesh ? 'skin' : o.type, tris: o.isPoints ? 0 : Math.round(idx / 3), inst, mat: mats.map((m) => m.type + (m.transparent ? '+T' : '') + (m.onBeforeCompile && m.onBeforeCompile.toString().length > 30 ? '+obc' : '')).join(','), vis: o.visible && (() => { let q = o; while (q) { if (!q.visible) return false; q = q.parent; } return true; })(), verts: g.attributes.position.count, attrs: Object.keys(g.attributes).join(' ') });
    });
    return { programs: window.__programs, stats: window.__stats, rows, tex: [...tex.values()] };
  });
  console.log(JSON.stringify({ net, tReady, errs: errs.slice(0, 10), ...info }));
  await b.close(); srv.close();
})();
