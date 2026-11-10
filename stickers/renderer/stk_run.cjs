const { chromium } = require('playwright');
const fs = require('fs');
const T = require('path').join(__dirname, '../../node_modules/three/');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 1100 } });
  p.on('pageerror', e => console.log('err', e.message));
  p.on('console', m => m.type() === 'error' && console.log('cons', m.text()));
  await p.route('https://cdn.jsdelivr.net/npm/three@0.186.1/**', r => r.fulfill({ path: T + r.request().url().split('three@0.186.1/')[1], contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/stickers/renderer/index.html' + (process.env.Q || ''));
  await p.waitForFunction('window.__ready', null, { timeout: 60000 });
  if (process.env.K) await p.evaluate((k) => window.__k = JSON.parse(k), process.env.K);
  const names = process.argv[2] ? process.argv[2].split(',') : await p.evaluate('window.__names');
  fs.mkdirSync(__dirname + '/raw', { recursive: true });
  const meta = fs.existsSync(__dirname + '/raw/meta.json') ? JSON.parse(fs.readFileSync(__dirname + '/raw/meta.json')) : {};
  for (const n of names) {
    const r = await p.evaluate((n) => window.render(n), n);
    fs.writeFileSync(`${__dirname}/raw/${n}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
    meta[n] = r.opt;
  }
  fs.writeFileSync(__dirname + '/raw/meta.json', JSON.stringify(meta, null, 1));
  await b.close();
})();
