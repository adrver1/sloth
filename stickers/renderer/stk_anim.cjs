// Render animated sticker frames: stk/anim_raw/<name>/000.png ... and stk/anim_raw/meta.json
const { chromium } = require('playwright');
const fs = require('fs');
const T = require('path').join(__dirname, '../../node_modules/three/');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 700, height: 700 } });
  p.on('pageerror', e => console.log('err', e.message));
  await p.route('https://cdn.jsdelivr.net/npm/three@0.186.1/**', r => r.fulfill({ path: T + r.request().url().split('three@0.186.1/')[1], contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/stickers/renderer/index.html?size=640');
  await p.waitForFunction('window.__ready', null, { timeout: 60000 });
  const names = process.argv[2] ? process.argv[2].split(',') : await p.evaluate('window.__names');
  const fps = +(process.env.FPS || 12);
  const metaP = __dirname + '/anim_raw/meta.json';
  fs.mkdirSync(__dirname + '/anim_raw', { recursive: true });
  const meta = fs.existsSync(metaP) ? JSON.parse(fs.readFileSync(metaP)) : {};
  for (const n of names) {
    const t = Date.now();
    const r = await p.evaluate(([n, fps]) => window.renderAnim(n, fps), [n, fps]);
    const d = `${__dirname}/anim_raw/${n}`; fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
    r.urls.forEach((u, i) => fs.writeFileSync(`${d}/${String(i).padStart(3, '0')}.png`, Buffer.from(u.split(',')[1], 'base64')));
    meta[n] = r.opt; console.log(n, r.opt.frames, 'frames', r.opt.loop.toFixed(2), 's', ((Date.now() - t) / 1000).toFixed(0), 's to render');
  }
  fs.writeFileSync(metaP, JSON.stringify(meta, null, 1));
  await b.close();
})();
