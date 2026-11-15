// Makes every sticker in order (review R2-039): serves the repo on :8765 (tools/serve.cjs; the renderer pages load from there),
// then runs the four steps README.md lists, stopping at the first that fails:
//   stickers/renderer/stk_run.cjs        still frames to stickers/renderer/raw
//   stickers/renderer/stk_post.py        cut-out WebP files to stickers/renderer/out (stops on a clipped or oversize sticker)
//   stickers/renderer/stk_anim.cjs       animated frames
//   stickers/renderer/stk_anim_post.py   animated WebP files (stops on one over WhatsApp's 500 KB)
// Usage (from the repo root, after npm ci and pip install -r props/requirements.txt): npm run stickers. PYTHON=<python> picks
// the Python (default python).
const path = require('path'), { spawn, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), PY = process.env.PYTHON || 'python';
const srv = spawn(process.execPath, [path.join(__dirname, 'serve.cjs'), '8765', ROOT], { stdio: 'ignore' });
const steps = [[process.execPath, 'stickers/renderer/stk_run.cjs'], [PY, 'stickers/renderer/stk_post.py'],
  [process.execPath, 'stickers/renderer/stk_anim.cjs'], [PY, 'stickers/renderer/stk_anim_post.py']];
setTimeout(() => {
  let status = 0;
  for (const [cmd, script] of steps) {
    console.log('>', path.basename(cmd), script);
    const r = spawnSync(cmd, [script], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) { status = r.status || 1; console.error(`${script} failed`); break; }
  }
  srv.kill(); process.exit(status);
}, 500);
