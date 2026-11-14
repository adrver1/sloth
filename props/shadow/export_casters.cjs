// Writes props/shadow/layout_<props>.json, the clearing's layout as the live page has it (prop spots, the jeep's track,
// the path to the glade, the tent, the hammock, the deadwood and the ground's height grid), for props/ground/bake_ground.py
// and props/camp/bake_camp_lightmap.py, plus "place": where the page stands each baked prop and light (seats, tent,
// hammock, table, wood pile, kitchen crate, laundry line, lantern lights, jeep, sun), read from the live page. The light
// bake places everything from that block (it keeps no copy of its own). props/bake_all.py runs it first (its "layout" step) and serves the repo on :8765.
//   python3 -m http.server 8765   (from the repo root, in the background; LAYOUT_PORT=<port> to use another port)
//   node props/shadow/export_casters.cjs [props=picked] [jeep=expedition]
// (It used to write casters_<props>_<jeep>.glb too, for a ground-shadow bake script that is gone: the light bake makes the
// ground's shadows now. The file name stays so the bake steps and notes that name it still match.)
// It exits 1, writing nothing, when the page logs any error (a page error, a console error or a failed download; the same
// watch() as tools/camp-page.cjs) or the layout has parts missing, so the bake never runs on a half-built page (review R2-062).
// The browser is tools/camp-page.cjs launch(): the repo's playwright, else CHROMIUM=<a Chromium or Chrome> (CHROME= still works).
const fs = require("fs"), path = require("path");
process.env.CHROMIUM ||= process.env.CHROME || "";
const { launch, routeThree, watch } = require("../../tools/camp-page.cjs");
const [props = "picked", jeep = "expedition"] = process.argv.slice(2), root = path.resolve(__dirname, "../..");
if (props !== "picked" || !["expedition", "none"].includes(jeep)) { console.error(`only picked props and the expedition jeep (or none) exist now, not ${props} / ${jeep}`); process.exit(2); }
(async () => {
  const { browser: b, page: p } = await launch({ width: 400, height: 300 });
  const { errs } = await watch(p);
  await routeThree(p);   // three.js from node_modules, no web fonts
  // the ground's baked shadows are a bake output the layout does not need (a new jeep has none yet): an empty 1x1 PNG
  const blank = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  await p.route(/camp_shadow_/, (r) => r.fulfill({ body: blank, contentType: "image/png" }));
  await p.goto(`http://localhost:${process.env.LAYOUT_PORT || 8765}/apps/canopy-prototype/camp.html?jeep=${jeep}&lm=1k`);   // the smallest light maps: the layout needs none
  await p.waitForFunction("window.__ready", null, { timeout: 120000 }); await p.waitForTimeout(5000);
  const out = await p.evaluate(async () => {
    const L = window.__ground?.layout, tent = window.__camp?.tentAt;
    if (!L) return { error: "window.__ground.layout is missing" };
    // where the page stands each baked prop, [x, z, yaw] (three.js metres, yaw about +y), and the lights; the light bake
    // (props/camp/bake_camp_lightmap.py) reads them from this block and keeps no copy of its own
    const at = (n) => { const os = []; window.__scene?.traverse((o) => { if (o.name === n) os.push(o); });   // exactly one, or none
      return os.length === 1 ? [os[0].position.x, os[0].position.z, os[0].rotation.y] : null; };
    const { lanternGlow } = await import("./camp/campProps.js"), { sun } = await import("./camp/core.js");   // the modules already loaded: no second run
    const ld = window.__laundry, jn = window.__jeep?.node, sd = sun.position.clone().normalize();
    const place = { seats: [0, 1, 2].map((i) => at(`Seat_${i}`)), tent: at("Tent"), hammock: at("Hammock"), table: at("Table"),
      woodPile: at("WoodPile"), seatThings: at("SeatThings"), tentSide: at("TentSide"), kitchen: at("KitchenCrate"),
      laundry: ld ? [(ld.a.x + ld.b.x) / 2, (ld.a.z + ld.b.z) / 2, Math.atan2(-ld.dir.z, ld.dir.x)] : null,
      lanternLights: lanternGlow.map((v) => [v.x, v.y, v.z]), jeep: jn ? [jn.position.x, jn.position.z, jn.rotation.y] : null, sun: [sd.x, sd.y, sd.z] };
    return { layout: { ...L, glade: (window.__glade?.path || []).map((p) => [p.x, p.z]), tent: tent ? [tent.x, tent.z] : null,
      hammock: window.__camp?.hA ? [[window.__camp.hA.x, window.__camp.hA.z], [window.__camp.hB.x, window.__camp.hB.z]] : null,
      deadwood: window.__deadwood?.layout || [],   // each with y, seated on the terrain: occluders in props/camp/bake_camp_lightmap.py
      height: window.__terrainGrid?.(128) || null, place } };   // camp/terrain.js: the ground's height, 128 x 128 over 60 m (rows +z), for the bake's ground mesh
  });
  // a layout with parts missing would bake quietly wrong, so stop the bake here instead
  const miss = out.error ? [out.error] : ["spots", "track", "glade", "tent", "hammock", "height"].filter((k) => !out.layout[k] || out.layout[k].length === 0);
  if (!out.error && !out.layout.deadwood.length) miss.push("deadwood");
  if (!out.error) for (const [k, v] of Object.entries(out.layout.place)) if (v === null || (Array.isArray(v) && (!v.length || v.includes(null)))) miss.push(`place.${k}`);
  if (miss.length) { console.error("layout incomplete, nothing written: " + miss.join(", ")); await b.close(); process.exit(1); }
  if (errs.length) { console.error(`the page logged ${errs.length} error(s), nothing written:\n  ` + errs.join("\n  ")); await b.close(); process.exit(1); }
  if (jeep === "expedition") fs.writeFileSync(path.join(__dirname, `layout_${props}.json`), JSON.stringify(out.layout));   // for props/ground/bake_ground.py
  console.log(`layout_${props}.json: ${out.layout.spots.length} spots, ${out.layout.deadwood.length} deadwood, track of ${out.layout.track.length}`); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
