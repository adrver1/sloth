// The clearing's layout for the bakes, worked out in node from the camp's pure modules, with no browser (review R2-257):
// camp/layout.js (every place, WEAR, the jeep's track, the glade path) and camp/lanterns.js (lanternLayout, lanternLights).
// Exports pureLayout(), which returns everything props/shadow/layout_picked.json holds except the deadwood:
//   RR, RC        the ground disc's half width (ground.js: RC + 0.8) and the clearing's radius
//   wear          layout.js WEAR as [{ name, x, z, r, path }], every entry (the bake has the lived props and the jeep)
//   entry, track  where the jeep's track meets the clearing ([x, z], as ground.js finds it) and the track's points
//   glade, tent, hammock   the glade path's points (sloPath.pts), the tent's place, the hammock's two posts
//   place         where the page stands each baked prop and light: seats ([x, z, yaw] each), anchors (layout.js
//                 ANCHORS), lanternHang (where each lantern hangs, [x, y, z]; the bake's lights), lanternLights (the page's
//                 jar centres, [x, y, z]; checked against the page), jeep ([x, z, yaw]) and sun (the unit vector toward it)
// The deadwood is not here: deadwood.js seats it on camp/terrain.js's ground, whose root mounds come from the forest's
// seeded stream, which only the page draws (forest.js; changing its draws needs a rebake). So props/shadow/
// export_casters.cjs still boots the page, takes the deadwood from it, and checks that the page agrees with this module.
//   node props/shadow/layout_pure.mjs     prints this layout as JSON
// All points are three.js metres: x, z on the ground, y up, the fire at the origin.
import { pathToFileURL } from "node:url";
import { ANCHORS, HAMMOCK, JEEP_AT, JEEP_TAN, JEEP_TRACK, LANTERN_TIES, RC, SEATS, SUN, TENT, WEAR, sloPath } from "../../apps/canopy-prototype/camp/layout.js";
import { lanternLayout, lanternLights } from "../../apps/canopy-prototype/camp/lanterns.js";

export function pureLayout() {
  const xz = (p) => [p.x, p.z];
  const entry = JEEP_TRACK.pts.find((p) => Math.hypot(p.x, p.z) > RC - 0.6);   // as ground.js finds it
  const sun = SUN.clone().normalize(), lantern = lanternLayout(LANTERN_TIES);
  return {
    RR: RC + 0.8, RC,
    wear: WEAR.map(({ name, at, r, path }) => ({ name, x: at.x, z: at.z, r, path })),
    entry: entry ? xz(entry) : null, track: JEEP_TRACK.pts.map(xz),
    glade: sloPath.pts.map(xz), tent: xz(TENT.at), hammock: [xz(HAMMOCK.a), xz(HAMMOCK.b)],
    place: {
      seats: SEATS.map((s) => [s.at.x, s.at.z, s.yaw]),
      anchors: Object.fromEntries(Object.entries(ANCHORS).map(([k, { at, yaw }]) => [k, [at.x, at.z, yaw]])),
      lanternHang: lantern.hang.map((v) => [v.x, v.y, v.z]),   // the bake hangs its lights from these (R2-187)
      lanternLights: lanternLights(lantern).map((v) => [v.x, v.y, v.z]),
      jeep: [JEEP_AT.x, JEEP_AT.z, Math.atan2(JEEP_TAN.x, JEEP_TAN.z)],   // jeep.js: rotation.y = atan2(tan.x, tan.z)
      sun: [sun.x, sun.y, sun.z],
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(pureLayout()));
