// Exports what casts a shadow in Canopy Camp, in world space, for bake_ground_shadow.py (Adriaen 2026-11-12: bake the ground's
// shadows offline for quality; re-run both whenever something major is added to the clearing).
//   python3 -m http.server 8765   (from the repo root, in the background)
//   node props/shadow/export_casters.cjs [props=picked] [jeep=expedition]
// Opens camp.html in headless Chromium, takes ground.js's casters() (standing opaque props in the clearing; no trees, no sloths),
// bakes each one's world matrix into its geometry and writes props/shadow/casters_<props>_<jeep>.glb (geometry only).
// With the default jeep it also writes layout_<props>.json (prop spots, the track, the glade path) for props/ground/bake_ground.py.
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const [props = "picked", jeep = "expedition"] = process.argv.slice(2), root = path.resolve(__dirname, "../..");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  p.on("pageerror", (e) => console.log("PAGEERR", e.message));
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.1\/(.*)/, (r) => r.fulfill({ body: fs.readFileSync(root + "/node_modules/three/" + r.request().url().split("three@0.186.1/")[1]), contentType: "text/javascript" }));
  await p.route(/fonts\.(googleapis|gstatic)\.com|_lm_4k|camp_shadow_/, (r) => r.abort());
  await p.goto(`http://localhost:8765/apps/canopy-prototype/camp.html?props=${props}&jeep=${jeep}&lm=off`);
  await p.waitForFunction("window.__ready", null, { timeout: 120000 }); await p.waitForTimeout(5000);
  const out = await p.evaluate(async () => {
    const THREE = await import("three"), { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const g = new THREE.Group(), names = [];
    for (const o of window.__ground.casters()) {
      let geo = new THREE.BufferGeometry().setAttribute("position", o.geometry.attributes.position.clone());
      if (o.geometry.index) geo.setIndex(o.geometry.index.clone());
      geo.applyMatrix4(o.matrixWorld); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); m.name = o.name || "part"; g.add(m); names.push(m.name);
    }
    const buf = await new GLTFExporter().parseAsync(g, { binary: true });
    const L = window.__ground.layout, tent = window.__camp.tentAt;
    const layout = { ...L, glade: (window.__glade?.path || []).map((p) => [p.x, p.z]), tent: tent ? [tent.x, tent.z] : null,
      deadwood: window.__deadwood?.layout || [] };   // the fallen log, stump and dead trunk: occluders in props/camp/bake_camp_lightmap.py
    return { names, layout, b64: btoa(Array.from(new Uint8Array(buf), (c) => String.fromCharCode(c)).join("")) };
  });
  const f = path.join(__dirname, `casters_${props}_${jeep}.glb`); fs.writeFileSync(f, Buffer.from(out.b64, "base64"));
  if (jeep === "expedition") fs.writeFileSync(path.join(__dirname, `layout_${props}.json`), JSON.stringify(out.layout));   // for props/ground/bake_ground.py
  console.log(`${out.names.length} casters -> ${f}\n${out.names.join(", ")}`); await b.close();
})();
