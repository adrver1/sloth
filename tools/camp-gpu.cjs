// Canopy Camp on a real GPU: loads the camp in Chromium with hardware WebGL (ANGLE on D3D11 on Windows, the default GL elsewhere),
// then prints JSON with the GPU it ran on, the start-up times, real frame times over a few seconds of free running, draw calls,
// triangles and shader programs, and takes a screenshot. Use it on a machine with a GPU (Adriaen's desktop, through Remote Control);
// under SwiftShader in the cloud the times mean nothing (use camp-probe.cjs there, whose counts are exact). The "gpu" field is the
// WebGL renderer string, and a warning goes to stderr when it is software GL (SwiftShader, llvmpipe).
// Usage (from the repo root, after npm ci):
//   node tools/camp-gpu.cjs [--query "?time=21.5"] [--vw 1280 --vh 800 --dpr 1] [--seconds 10] [--shot out.png] [--headed]
//   node tools/camp-gpu.cjs --phone ...     the same as --vw 390 --vh 844 --dpr 3 --query "?touch=1" plus a phone user agent
// Frame times are wall-clock times between animation frames, so they include vsync: a 60 Hz screen caps at 16.7 ms. The p95 and the
// worst frame show stutter. --seconds counts after the camp says it is ready and a 3 s settle.
const path = require('path'), fs = require('fs'), http = require('http');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const PHONE = has('phone');
const QS = arg('query', PHONE ? '?touch=1' : ''), VW = +arg('vw', PHONE ? 390 : 1280), VH = +arg('vh', PHONE ? 844 : 800), DPR = +arg('dpr', PHONE ? 3 : 1);
const SECS = +arg('seconds', 10), SHOT = arg('shot', ''), PORT = +arg('port', 8833), ROOT = path.resolve(arg('root', path.resolve(__dirname, '..')));
const { chromium } = require(path.resolve(__dirname, '..', 'node_modules', 'playwright'));
const NM = path.resolve(__dirname, '..', 'node_modules', 'three');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });

(async () => {
  await new Promise((ok) => srv.listen(PORT, ok));
  const args = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-vsync', '--disable-frame-rate-limit'];
  if (process.platform === 'win32') args.push('--use-angle=d3d11');
  const b = await chromium.launch({ headless: !has('headed'), args }).catch(() => chromium.launch({ headless: !has('headed'), args, executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }));
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: PHONE, hasTouch: PHONE,
    userAgent: PHONE ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' : undefined });
  const p = await ctx.newPage();
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.1\/(.*)/, (rt) => { const m = rt.request().url().match(/three@0\.186\.1\/(.*)/); rt.fulfill({ path: path.join(NM, m[1].split('?')[0]), contentType: 'text/javascript' }); });
  await p.addInitScript(() => {
    window.__programs = 0;
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const f = C.prototype.linkProgram; C.prototype.linkProgram = function (...a) { window.__programs++; return f.apply(this, a); }; }
    window.__ft = []; let last = 0; const tick = (t) => { if (last) window.__ft.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().slice(-80)); });
  const t0 = Date.now();
  await p.goto(`http://localhost:${PORT}/apps/canopy-prototype/camp.html${QS}`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
  const tReady = Date.now() - t0;
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), programsAtReady: window.__programs }; });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { window.__ft.length = 0; });
  await p.waitForTimeout(SECS * 1000);
  const out = await p.evaluate(() => {
    const ft = window.__ft.slice().sort((a, b) => a - b), q = (k) => ft.length ? +ft[Math.min(ft.length - 1, Math.floor(k * ft.length))].toFixed(2) : null;
    const gl = document.querySelector('canvas').getContext('webgl2') || document.querySelector('canvas').getContext('webgl');
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const st = window.__stats || {};   // main.js fills it once a second: calls, tris, pr (pixel ratio), detail
    return { gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown', frames: ft.length, msMedian: q(0.5), msP95: q(0.95), msWorst: ft.length ? +ft[ft.length - 1].toFixed(2) : null,
      fps: ft.length ? +(1000 * ft.length / ft.reduce((a, b) => a + b, 0)).toFixed(1) : null, programs: window.__programs,
      draws: st.calls ?? null, triangles: st.tris ?? null, pixelRatio: st.pr ?? null, detail: st.detail ?? null };
  });
  // Chromium on Linux or macOS can fall back to software GL silently (review R2-135): say so, since the times are then SwiftShader's
  if (/swiftshader|llvmpipe|software/i.test(out.gpu)) console.error(`Warning: the WebGL renderer is ${out.gpu}, software GL, not the GPU: the frame times mean nothing`);
  if (SHOT) await p.screenshot({ path: SHOT });
  console.log(JSON.stringify({ query: QS, viewport: [VW, VH, DPR], phone: PHONE, msToReady: tReady, ...nav, ...out, errors: errs.slice(0, 20) }, null, 1));
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
