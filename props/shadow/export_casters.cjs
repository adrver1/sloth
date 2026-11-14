// Writes props/shadow/layout_<props>.json, the clearing's layout for props/ground/bake_ground.py and
// props/camp/bake_camp_lightmap.py: the worn spots (camp/layout.js WEAR), the jeep's track, the path to the glade, the
// tent, the hammock, the deadwood, and "place": where the page stands each baked prop and light (the log seats,
// "anchors" = layout.js ANCHORS, the places the props' anchor tags name, review R2-249; the lantern lights, the jeep and
// the sun). The light bake places everything from that block and keeps no copy of its own.
// Everything but the deadwood comes from props/shadow/layout_pure.mjs, which works it out in node from the camp's pure
// modules (review R2-257). The deadwood still needs the page: deadwood.js seats it on the terrain, whose root mounds come
// from the forest's seeded stream. So this boots camp.html under SwiftShader, takes the deadwood from deadwood.js, and
// checks that the page agrees with layout_pure.mjs where the page builds things itself: the seats and the jeep as they
// stand in the scene, the lantern lights, the sun, the track and the worn spots ground.js used. A page error, a
// disagreement, or a layout with a part missing writes nothing and exits 1, so the bake stops instead of baking quietly
// wrong (review R2-232). props/bake_all.py runs it first (its "layout" step), serving the repo on a free port it passes
// as LAYOUT_PORT.
//   python3 -m http.server 8765   (from the repo root, in the background; LAYOUT_PORT=<port> to use another port)
//   node props/shadow/export_casters.cjs [props=picked] [jeep=expedition]
// (It used to write casters_<props>_<jeep>.glb too, for a ground-shadow bake script that is gone: the light bake makes the
// ground's shadows now. The file name stays so the bake steps and notes that name it still match.)
const { chromium } = require("playwright"), fs = require("fs"), path = require("path"), { pathToFileURL } = require("url");
const [props = "picked", jeep = "expedition"] = process.argv.slice(2), root = path.resolve(__dirname, "../..");
if (props !== "picked" || !["expedition", "none"].includes(jeep)) { console.error(`only picked props and the expedition jeep (or none) exist now, not ${props} / ${jeep}`); process.exit(2); }
(async () => {
  const { pureLayout } = await import(pathToFileURL(path.join(__dirname, "layout_pure.mjs")).href);
  const pure = pureLayout();
  const b = await chromium.launch({ executablePath: process.env.CHROME || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  const pageErrors = []; p.on("pageerror", (e) => { console.error("PAGEERR", e.message); pageErrors.push(e.message); });
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.1\/(.*)/, (r) => r.fulfill({ body: fs.readFileSync(root + "/node_modules/three/" + r.request().url().split("three@0.186.1/")[1]), contentType: "text/javascript" }));
  await p.route(/fonts\.(googleapis|gstatic)\.com|_lm_4k|camp_shadow_/, (r) => r.abort());
  await p.goto(`http://localhost:${process.env.LAYOUT_PORT || 8765}/apps/canopy-prototype/camp.html?jeep=${jeep}&lm=1k`);   // the smallest light maps: the layout needs none
  await p.waitForFunction("window.__ready", null, { timeout: 120000 });   // every module is built once __ready is set
  const page = await p.evaluate(async () => {
    // the modules already loaded: importing them again runs nothing
    const [{ deadwood }, { lanternGlow }, { sun }, { track }, { groundLife }, { jeepApi }] = await Promise.all(
      ["deadwood", "campProps", "core", "forest", "campGround", "jeep"].map((m) => import(`./camp/${m}.js`)));
    const at = (n) => { const os = []; window.__scene?.traverse((o) => { if (o.name === n) os.push(o); });   // exactly one, or none
      return os.length === 1 ? [os[0].position.x, os[0].position.z, os[0].rotation.y] : null; };
    const jn = jeepApi?.node, sd = sun.position.clone().normalize();
    return { deadwood: deadwood?.layout || [],   // each with y, seated on the terrain: occluders in props/camp/bake_camp_lightmap.py
      check: { seats: [0, 1, 2].map((i) => at(`Seat_${i}`)), lanternLights: lanternGlow.map((v) => [v.x, v.y, v.z]),
        jeep: jn ? [jn.position.x, jn.position.z, jn.rotation.y] : null, sun: [sd.x, sd.y, sd.z],
        track: track ? track.pts.map((q) => [q.x, q.z]) : [], wear: groundLife?.layout?.wear ?? null } };
  });
  const miss = [];
  if (pageErrors.length) miss.push(`${pageErrors.length} page error(s), first: ${pageErrors[0]}`);
  if (!page.deadwood.length) miss.push("deadwood");
  // the page must agree with layout_pure.mjs (to 1e-6 m) wherever it builds the thing itself
  const want = { seats: pure.place.seats, lanternLights: pure.place.lanternLights, jeep: jeep === "none" ? null : pure.place.jeep,
    sun: pure.place.sun, track: jeep === "none" ? [] : pure.track, wear: pure.wear.filter((w) => jeep !== "none" || !w.name.startsWith("jeep")) };
  const same = (a, c) => (typeof a === "number" && typeof c === "number") ? Math.abs(a - c) < 1e-6
    : Array.isArray(a) && Array.isArray(c) ? a.length === c.length && a.every((v, i) => same(v, c[i]))
    : a && c && typeof a === "object" && typeof c === "object" ? Object.keys({ ...a, ...c }).every((k) => same(a[k], c[k])) : a === c;
  for (const k of Object.keys(want)) if (!same(page.check[k], want[k])) miss.push(`the page's ${k} is not layout_pure.mjs's`);
  if (miss.length) { console.error("layout not written: " + miss.join(", ")); await b.close(); process.exit(1); }
  const layout = { ...pure, deadwood: page.deadwood };
  if (jeep === "expedition") fs.writeFileSync(path.join(__dirname, `layout_${props}.json`), JSON.stringify(layout));   // for props/ground/bake_ground.py
  console.log(`layout_${props}.json: ${layout.wear.length} worn spots, ${layout.deadwood.length} deadwood, track of ${layout.track.length}; the page agrees with layout_pure.mjs`); await b.close();
})();
