// Runs a Python script with the first Python found, so the npm scripts work on Windows (python), on a Mac or Linux box with
// only python3, and in CI. Usage: node tools/py.cjs <script.py> [args...]. Set PYTHON to pick one (a venv, Blender's own).
// It tries PYTHON, then python and python3 (python3 first outside Windows, where the Store alias python3 is a stub), and
// exits with the script's exit code.
const { spawnSync } = require('child_process');
const order = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
const py = [process.env.PYTHON, ...order].filter(Boolean).find((c) => spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0);
if (!py) { console.error('py.cjs: no Python found (tried ' + [process.env.PYTHON, ...order].filter(Boolean).join(', ') + '); set PYTHON'); process.exit(1); }
const r = spawnSync(py, process.argv.slice(2), { stdio: 'inherit' });
process.exit(r.status ?? 1);
