// Screenshots Sloth Playtime (apps/playtime/index.html) at a few moments, to check its play clips headless.
// Usage: start the repo server first (npm run serve, port 8765, or PORT=<port>), then
//   node tools/playtime/shot.cjs <out prefix> [width=1200] [ms list=300]
// It waits for the page's window.__ready, then writes <out prefix>_0.png, _1.png... at each time in the comma-separated
// ms list (counted from ready), full page, 900 px tall. Browser, three.js and fonts come from tools/camp-page.cjs:
// Chromium on SwiftShader (the repo's playwright, else CHROMIUM=<a Chromium>), three.js from node_modules, no web fonts.
// Moved here from apps/playtime-tools/ (review R2-222), which pointed at /index.html and had no browser fallback.
const { launch, routeThree } = require('../camp-page.cjs');
const [out, width = 1200, msList = '300'] = process.argv.slice(2), PORT = process.env.PORT || 8765;
if (!out) { console.error('usage: node tools/playtime/shot.cjs <out prefix> [width] [ms list]'); process.exit(2); }
(async () => {
  const { browser: b, page: p } = await launch({ width: Number(width), height: 900 });
  p.on('console', (m) => console.log('console', m.text())); p.on('pageerror', (e) => console.log('err', e.message));
  await routeThree(p);
  await p.goto(`http://localhost:${PORT}/apps/playtime/index.html`);
  await p.waitForFunction('window.__ready', null, { timeout: 60000 });
  let i = 0, last = 0;
  for (const t of msList.split(',').map(Number)) { await p.waitForTimeout(t - last); last = t; await p.screenshot({ path: `${out}_${i++}.png`, fullPage: true }); }
  await b.close();
})();
