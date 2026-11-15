// Canopy Camp static check (review R2-004): runs in a second with no browser, so CI can run it on every pull request and
// before every deploy. It exits 1 and lists every problem when:
//   - a camp module does not parse (every .js file under apps/canopy-prototype/),
//   - a named import does not match an export of the module it names (the modules are linked as the browser links them,
//     with three.js and its addons taken from node_modules through camp.html's import map; nothing is run),
//   - a "models/..." path written as a plain string in a camp module does not exist in apps/canopy-prototype/models/
//     (paths built with ${...} are not checked),
//   - camp_lights.json stamps its KTX2 maps (bake_all.py --only ktx) and a map's PNG no longer has the stamped hash, so the
//     .ktx2.txt next to it is stale and must be made again (bake_all.py --only ktx).
// Usage (from the repo root, after npm ci): node tools/check-imports.cjs   (npm run check runs it with the other checks)
// It needs node's vm modules; when they are off, it starts itself again with --experimental-vm-modules.
const path = require('path'), fs = require('fs'), crypto = require('crypto'), vm = require('vm'), { spawnSync } = require('child_process');
if (!vm.SourceTextModule) {
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const ROOT = path.resolve(__dirname, '..'), APP = path.join(ROOT, 'apps/canopy-prototype'), THREE = path.join(ROOT, 'node_modules/three');
const problems = [], rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name);
  if (e.isDirectory()) { if (e.name !== 'models' && e.name !== 'node_modules') walk(f); } else if (e.name.endsWith('.js')) files.push(f); } })(APP);

// camp.html's import map, pointed at node_modules
const map = JSON.parse(fs.readFileSync(path.join(APP, 'camp.html'), 'utf8').match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const local = (spec) => { for (const [k, v] of Object.entries(map)) { const p = v.replace(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, THREE + '/');
  if (k.endsWith('/') ? spec.startsWith(k) : spec === k) return k.endsWith('/') ? p + spec.slice(k.length) : p; } return null; };

(async () => {
  // bare imports (three, its addons) become synthetic modules with the real export names, read once
  const bare = new Map();
  const bareModule = async (spec) => {
    if (!bare.has(spec)) { const p = local(spec); if (!p) throw new Error(`no import map entry for "${spec}"`);
      const ns = await import(require('url').pathToFileURL(p).href), names = Object.keys(ns);
      bare.set(spec, names); }
    const names = bare.get(spec);
    return new vm.SyntheticModule(names, function () { for (const n of names) this.setExport(n, undefined); }, { identifier: spec });
  };
  const src = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

  // 1. syntax, file by file
  const ok = new Set();
  for (const f of files) { try { new vm.SourceTextModule(src.get(f), { identifier: rel(f) }); ok.add(f); } catch (e) { problems.push(`${rel(f)}: ${e.message}`); } }

  // 2. imports: link each module as a root, in a fresh graph, after the modules it imports, so a failure is its own
  const deps = (f) => { const m = new vm.SourceTextModule(src.get(f)); return m.dependencySpecifiers.filter((s) => s.startsWith('.')).map((s) => path.resolve(path.dirname(f), s)); };
  const state = new Map();   // file -> 'busy' | true | false
  // a failed link names the export and the module asked for, not the importer (with import cycles the root may not be it):
  // find the module in the graph whose import list asks for that name from that path
  const seen = new Set(), report = (made, root, e) => {
    const m = e.message.match(/requested module '([^']+)' does not provide an export named '([^']+)'/);
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const who = m && [...made.keys()].find((f) => new RegExp(`import\\s*\\{[^}]*\\b${esc(m[2])}\\b[^}]*\\}\\s*from\\s*["']${esc(m[1])}["']`).test(src.get(f)));
    const line = `${rel(who || root)}: ${e.message}`; if (!seen.has(line)) { seen.add(line); problems.push(line); }
  };
  const SKIP = new Error('reaches a module that does not parse');   // already reported, once
  const link = async (root) => {
    const made = new Map();
    const mod = (f) => { if (!ok.has(f)) throw SKIP; if (!made.has(f)) made.set(f, new vm.SourceTextModule(src.get(f), { identifier: rel(f) })); return made.get(f); };
    try { await mod(root).link(async (spec, ref) => {
      if (!spec.startsWith('.')) return bareModule(spec);
      const f = path.resolve(path.dirname(path.join(ROOT, ref.identifier)), spec);
      if (!src.has(f)) throw new Error(`${ref.identifier}: imports "${spec}", which does not exist`);
      return mod(f);
    }); } catch (e) { if (e !== SKIP) report(made, root, e); return false; }
    return true;
  };
  const check = async (f) => {
    if (state.has(f)) return state.get(f) !== false;
    state.set(f, 'busy');
    let good = true;
    for (const d of deps(f)) if (src.has(d)) good = (ok.has(d) ? await check(d) : false) && good;   // a module that does not parse is reported once, above
    if (good) good = await link(f);
    state.set(f, good); return good;
  };
  for (const f of files) if (ok.has(f)) await check(f);

  // 3. model paths written as plain strings
  for (const f of files) for (const m of src.get(f).matchAll(/["'`](models\/[^"'`$\s]+)["'`]/g))
    if (!fs.existsSync(path.join(APP, m[1]))) problems.push(`${rel(f)}: names ${m[1]}, which does not exist`);

  // 4. the KTX2 maps' stamps (written by bake_all.py --only ktx: map name -> the first 16 hex digits of its PNG's sha256)
  const lights = JSON.parse(fs.readFileSync(path.join(APP, 'models/camp_lights.json'), 'utf8'));
  if (lights.ktx2 && typeof lights.ktx2 === 'object') for (const [name, hash] of Object.entries(lights.ktx2)) {
    const png = path.join(APP, 'models', name + '.png');
    if (!fs.existsSync(png)) { problems.push(`camp_lights.json: ktx2 names ${name}, which has no .png`); continue; }
    const now = crypto.createHash('sha256').update(fs.readFileSync(png)).digest('hex').slice(0, 16);
    if (now !== hash) problems.push(`models/${name}.ktx2.txt is stale: ${name}.png changed since bake_all.py --only ktx made it`);
  }

  if (problems.length) { console.error(problems.length + ' problem(s):\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log(`check-imports: ${files.length} modules parse and link, ${bare.size} three.js entry points, model paths and KTX2 stamps are fine`);
})().catch((e) => { console.error(e); process.exit(1); });
