// Copies the shared source files in shared/ into every app folder that uses them, each copy marked as generated.
// Each app folder is published on its own (as an artifact and on GitHub Pages), so a page needs its own copy next to it;
// shared/ is the one place to edit. Run after changing a file in shared/:
//   node tools/sync-shared.cjs           # (npm run sync-shared) write the copies
//   node tools/sync-shared.cjs --check   # (npm run check-shared) exit 1 if any copy differs from its source
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
// source in shared/ -> the folders that keep a copy of it under the same name
const COPIES = {
  'fur.js': ['apps/canopy-prototype', 'apps/catch-the-baby', 'apps/fur-options', 'apps/karaoke', 'apps/playtime', 'stickers/renderer'],
};
const header = (src) => `// GENERATED from shared/${src} by tools/sync-shared.cjs. Do not edit this copy: edit shared/${src}, then run npm run sync-shared.\n`;

const check = process.argv.includes('--check');
let bad = 0, written = 0;
for (const [src, dirs] of Object.entries(COPIES)) {
  const want = header(src) + fs.readFileSync(path.join(ROOT, 'shared', src), 'utf8');
  for (const dir of dirs) {
    const rel = path.posix.join(dir, src), file = path.join(ROOT, rel);
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (have === want) continue;
    if (check) { console.error(`${rel} differs from shared/${src} (run npm run sync-shared)`); bad++; }
    else { fs.writeFileSync(file, want); console.log(`wrote ${rel}`); written++; }
  }
}
if (check) { if (bad) process.exit(1); console.log('shared copies are up to date'); }
else if (!written) console.log('shared copies were already up to date');
