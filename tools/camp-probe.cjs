// Canopy Camp budget probe: loads a camp page headless (SwiftShader) and prints JSON with draw calls, triangles per object,
// every download with its size, textures and page errors. fps is meaningless under SwiftShader; the counts are exact.
// Usage (from the repo root, after npm ci):
//   [PORT=0] [ROOT=<checkout>] node tools/camp-probe.cjs [--phone] [--strict] "/apps/canopy-prototype/camp.html" out.png [width height] [js to run before the shot]
// PORT picks the local port (0, the default, takes a free one; the machine is shared; the server listens on 127.0.0.1 only and
// serves nothing outside ROOT); ROOT serves another checkout (a worktree of main) with this same tool.
// --phone: a 390x844 touch phone view (isMobile, ?touch=1 added to the URL); width and height then default to 390 844.
// --strict: exit 1 when the page logged an error or never became ready (otherwise it prints the errors and exits 0).
// npm run probe and npm run probe:phone run it on camp.html with --strict.
// The server, the browser and three.js from node_modules (the cloud proxy blocks jsDelivr) come from tools/camp-page.cjs
// openCamp, like every camp tool.
const { openCamp } = require('./camp-page.cjs');
const flags = process.argv.slice(2).filter((a) => a.startsWith('--')), argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PHONE = flags.includes('--phone'), STRICT = flags.includes('--strict');
(async () => {
  const url = PHONE ? argv[0] + (argv[0].includes('?') ? '&' : '?') + 'touch=1' : argv[0], out = argv[1], vw = +(argv[2] || (PHONE ? 390 : 1280)), vh = +(argv[3] || (PHONE ? 844 : 800)), PORT = +(process.env.PORT || 0);
  const errs = [], net = [];
  const before = async (p) => {
    // count shader programs linked (each is a compile the phone pays for); each is named by its material's name, or by its shader type when the material has none
    await p.addInitScript(() => { window.__programs = 0; for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const f = C.prototype.linkProgram; C.prototype.linkProgram = function (...a) { window.__programs++; try { const src = this.getAttachedShaders(a[0]).map((sh) => this.getShaderSource(sh)).join(''); let h = 0; for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) | 0; (window.__progSrc ??= {})[(h >>> 0).toString(16)] = (src.match(/#define [A-Z_0-9]+( [^\n]*)?/g) || []).filter((d) => !/attribute|varying|texture2D|gl_FragColor|SHADER_TYPE|PI|RECIPROCAL|EPSILON|saturate|whiteComplement|LOG2|HALF|TWO|DEFAULT|SHADER_NAME/.test(d)).join(' ') + ' | ' + (src.match(/uniform [^;]+;/g) || []).filter((u) => /u[A-Z]/.test(u)).join(' '); (window.__progNames ??= []).push(((src.match(/#define SHADER_NAME ([^\s]+)/) || src.match(/#define SHADER_TYPE ([^\s]+)/) || [])[1] || '?') + ':' + (h >>> 0).toString(16)); } catch {} return f.apply(this, a); }; } });
    // THROTTLE=mbps,latencyMs (e.g. 10,80) emulates a phone connection, to compare load times
    if (process.env.THROTTLE) { const [mb, lat] = process.env.THROTTLE.split(',').map(Number); const cdp = await p.context().newCDPSession(p);
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: lat, downloadThroughput: mb * 125000, uploadThroughput: mb * 125000 }); }
    p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().slice(-60)); }); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('requestfinished', async (rq) => { try { const r = await rq.response(); const b = await r.body(); net.push([rq.url().replace(/^http:\/\/(localhost|127\.0\.0\.1):\d+\/apps\/canopy-prototype\//, '').slice(-70), b.length]); } catch {} });
  };
  const camp = await openCamp({ root: process.env.ROOT, port: PORT, url, width: vw, height: vh, touch: PHONE, before }).catch((e) => ({ fail: e }));
  if (camp.fail) { console.log(JSON.stringify({ ready: false, why: String(camp.fail.message || camp.fail).slice(0, 200), errs: errs.slice(0, 10) })); process.exit(STRICT ? 1 : 0); }
  const { page: p, tReady, close } = camp;
  await p.waitForTimeout(6000);
  if (argv[4]) { await p.evaluate(argv[4]); await p.waitForTimeout(5000); }
  if (out) await p.screenshot({ path: out });
  const info = await p.evaluate(() => {
    const S = window.__scene, rows = [], tex = new Map();
    S.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine)) return;
      const g = o.geometry; const idx = g.index ? g.index.count : g.attributes.position.count;
      const inst = o.isInstancedMesh ? o.count : 1;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let p = o, names = []; while (p && p !== S) { if (p.name) names.unshift(p.name); p = p.parent; }
      for (const m of mats) for (const k in m) { const v = m[k]; if (v && v.isTexture && v.image) { const im = v.image; const w = im.width || im.videoWidth, h = im.height; tex.set(v.uuid, { k, w, h, name: names.join('/') || m.type, src: (im.src || im.currentSrc || (im.tagName || 'data')).toString().slice(-60) }); } }
      rows.push({ n: names.join('/') || o.type, type: o.isInstancedMesh ? 'inst' : o.isSkinnedMesh ? 'skin' : o.type, tris: o.isPoints ? 0 : Math.round(idx / 3), inst, mat: mats.map((m) => m.type + (m.transparent ? '+T' : '') + (m.onBeforeCompile && m.onBeforeCompile.toString().length > 30 ? '+obc' : '')).join(','), vis: o.visible && (() => { let q = o; while (q) { if (!q.visible) return false; q = q.parent; } return true; })(), verts: g.attributes.position.count, attrs: Object.keys(g.attributes).join(' ') });
    });
    return { programs: window.__programs, programNames: window.__progNames, progSrc: window.__progSrc, stats: window.__stats, rows, tex: [...tex.values()] };
  });
  console.log(JSON.stringify({ net, tReady, errs: errs.slice(0, 10), ...info }));
  await close();
  if (STRICT && errs.length) { console.error(`camp-probe --strict: ${errs.length} error(s) on the page`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
