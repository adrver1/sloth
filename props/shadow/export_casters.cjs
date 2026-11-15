// Writes props/shadow/layout_picked.json, the clearing's layout for props/ground/bake_ground.py and
// props/camp/bake_camp_lightmap.py: the worn spots (camp/layout.js WEAR), the jeep's track, the path to the glade, the
// tent, the hammock, the deadwood, and "place": where the page stands each baked prop and light (the log seats,
// "anchors" = layout.js ANCHORS, the places the props' anchor tags name, review R2-249; the points the lanterns hang from
// and their lights, the jeep and the sun). The light bake places everything from that block and keeps no copy of its own.
// Everything but the deadwood comes from props/shadow/layout_pure.mjs, which works it out in node from the camp's pure
// modules (review R2-257). The deadwood still needs the page: deadwood.js seats it on the terrain, whose root mounds come
// from the forest's seeded stream. So this boots camp.html under SwiftShader, takes the deadwood from deadwood.js, and
// checks that the page agrees with layout_pure.mjs where the page builds things itself: the seats and the jeep as they
// stand in the scene, the lantern lights, the sun, the track and the worn spots ground.js used. A page error, a
// disagreement, or a layout with a part missing writes nothing and exits 1, so the bake stops instead of baking quietly
// wrong (review R2-232). props/bake_all.py runs it first (its "layout" step).
//   node props/shadow/export_casters.cjs [jeep]     jeep: expedition (the default) or none; only expedition writes the file
// It serves the repo itself on a free port (LAYOUT_PORT=<port> picks one) through tools/camp-page.cjs openCamp, the set-up
// every camp tool shares (review R2-127); CHROMIUM=<a Chrome> picks the browser when playwright has none of its own.
// (It used to write casters_picked_<jeep>.glb too, for a ground-shadow bake script that is gone: the light bake makes the
// ground's shadows now. The file name stays so the bake steps and notes that name it still match.)
// Any page error, console error or failed download (the same watch() as tools/camp-page.cjs) counts as a page error here
// (review R2-062).
const fs = require("fs"), path = require("path"), { pathToFileURL } = require("url");
const { openCamp, watch } = require("../../tools/camp-page.cjs");
const [jeep = "expedition"] = process.argv.slice(2);
if (!["expedition", "none"].includes(jeep)) { console.error(`only the expedition jeep (or none) exists now, not ${jeep}`); process.exit(2); }
(async () => {
  const { pureLayout } = await import(pathToFileURL(path.join(__dirname, "layout_pure.mjs")).href);
  const pure = pureLayout();
  // the ground's baked shadows are a bake output the layout does not need (a new jeep has none yet): an empty 1x1 PNG
  const blank = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  let errs = [];
  const before = async (p) => { ({ errs } = await watch(p)); await p.route(/camp_shadow_/, (r) => r.fulfill({ body: blank, contentType: "image/png" })); };
  // the smallest light maps: the layout needs none. Every module is built once __ready is set
  const { page: p, close } = await openCamp({ port: +(process.env.LAYOUT_PORT || 0), query: `?jeep=${jeep}&lm=1k`, width: 400, height: 300, before, timeout: 120000 });
  const page = await p.evaluate(async () => {
    // the modules already loaded: importing them again runs nothing
    const [{ deadwood }, { LANTERNS }, { sun }, { track }, { groundLife }, { jeepApi }] = await Promise.all(
      ["deadwood", "campProps", "core", "forest", "campGround", "jeep"].map((m) => import(`./camp/${m}.js`)));
    const at = (n) => { const os = []; window.__scene?.traverse((o) => { if (o.name === n) os.push(o); });   // exactly one, or none
      return os.length === 1 ? [os[0].position.x, os[0].position.z, os[0].rotation.y] : null; };
    const jn = jeepApi?.node, sd = sun.position.clone().normalize();
    return { deadwood: deadwood?.layout || [],   // each with y, seated on the terrain: occluders in props/camp/bake_camp_lightmap.py
      check: { seats: [0, 1, 2].map((i) => at(`Seat_${i}`)), lanternLights: LANTERNS.lights.map((v) => [v.x, v.y, v.z]), lanternHang: LANTERNS.hang.map((v) => [v.x, v.y, v.z]),
        jeep: jn ? [jn.position.x, jn.position.z, jn.rotation.y] : null, sun: [sd.x, sd.y, sd.z],
        track: track ? track.pts.map((q) => [q.x, q.z]) : [], wear: groundLife?.layout?.wear ?? null } };
  });
  const miss = [];
  if (errs.length) miss.push(`the page logged ${errs.length} error(s):\n  ` + errs.join("\n  "));
  if (!page.deadwood.length) miss.push("deadwood");
  // the page must agree with layout_pure.mjs (to 1e-6 m) wherever it builds the thing itself
  const want = { seats: pure.place.seats, lanternLights: pure.place.lanternLights, lanternHang: pure.place.lanternHang, jeep: jeep === "none" ? null : pure.place.jeep,
    sun: pure.place.sun, track: jeep === "none" ? [] : pure.track, wear: pure.wear.filter((w) => jeep !== "none" || !w.name.startsWith("jeep")) };
  const same = (a, c) => (typeof a === "number" && typeof c === "number") ? Math.abs(a - c) < 1e-6
    : Array.isArray(a) && Array.isArray(c) ? a.length === c.length && a.every((v, i) => same(v, c[i]))
    : a && c && typeof a === "object" && typeof c === "object" ? Object.keys({ ...a, ...c }).every((k) => same(a[k], c[k])) : a === c;
  for (const k of Object.keys(want)) if (!same(page.check[k], want[k])) miss.push(`the page's ${k} is not layout_pure.mjs's`);
  if (miss.length) { console.error("layout not written: " + miss.join(", ")); await close(); process.exit(1); }
  const layout = { ...pure, deadwood: page.deadwood };
  if (jeep === "expedition") fs.writeFileSync(path.join(__dirname, "layout_picked.json"), JSON.stringify(layout));   // for props/ground/bake_ground.py
  console.log(`layout_picked.json: ${layout.wear.length} worn spots, ${layout.deadwood.length} deadwood, track of ${layout.track.length}; the page agrees with layout_pure.mjs`); await close();
})().catch((e) => { console.error(e); process.exit(1); });
