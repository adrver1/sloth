// A static file server for the repo with caching off, for working on the pages and making stickers (npm run serve), so no
// npx download is needed and the same server runs on every machine (review R2-026).
// Usage (from the repo root): node tools/serve.cjs [port=8765] [root=.]   then open http://localhost:8765/apps/karaoke/index.html
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +(process.argv[2] || 8765), ROOT = path.resolve(process.argv[3] || '.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (f !== ROOT && !f.startsWith(ROOT + path.sep)) { r.writeHead(403); r.end(); return; }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(d);
  });
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}/`));
