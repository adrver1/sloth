const { chromium } = require('playwright');
const path = require('path');
const T = require('path').join(__dirname, '../../node_modules/three/');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: Number(process.argv[3] || 1200), height: 900 } });
  p.on('console', m => console.log('console', m.text())); p.on('pageerror', e => console.log('err', e.message));
  await p.route('https://cdn.jsdelivr.net/npm/three@0.186.1/**', r => {
    const rel = r.request().url().split('three@0.186.1/')[1];
    r.fulfill({ path: T + rel, contentType: 'application/javascript' });
  });
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('http://localhost:8765/index.html');
  await p.waitForFunction('window.__ready', null, { timeout: 60000 });
  const times = (process.argv[4] || '300').split(',').map(Number);
  let i = 0, last = 0;
  for (const t of times) { await p.waitForTimeout(t - last); last = t; await p.screenshot({ path: `${process.argv[2]}_${i++}.png`, fullPage: true }); }
  await b.close();
})();
