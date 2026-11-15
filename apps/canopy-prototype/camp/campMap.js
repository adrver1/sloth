// Canopy Camp's map: the level's side of the shared map and compass (mapCompass.js, on the jeep's bonnet in both levels:
// Adriaen 2026-11-15, "put the map and compass from the mountain in the jungle camp"). An 80 m square round the fire with
// 10 m grid squares: the forest, the clearing, the jeep's track, the footpath to the sloth glade and the karaoke road, and
// the camp's places, all from layout.js. buildCampMap() once; setHood(jeep) and dropHoodMap come from jeep.js, campMapStep(dt,
// bright) each frame (main.js).
import * as THREE from "three";
import { buildMapCompass } from "./mapCompass.js";
import { camera, scene } from "./core.js";
import { FIRE, GLADE, GLADE_R, HAMMOCK, JEEP_AT, JEEP_TRACK, PATHS, RC, TABLE, TENT, WOOD_PILE, tripPath } from "./layout.js";

const MAP = { cx: 0, cz: 0, S: 80, PX: 1024, G: 8 };
let carry = null;
function paint({ g, W, uv, line, tag, spot, grid }) {
  // the forest everywhere, a lighter clearing round the camp and round the glade
  g.fillStyle = "#9db48a"; g.fillRect(0, 0, W, W);
  const r = (m) => (m / MAP.S) * W, disc = (p, rad, col) => { const [u, v] = uv(p.x, p.z); g.fillStyle = col; g.beginPath(); g.arc(u, v, r(rad), 0, 7); g.fill(); };
  for (let i = 0; i < 260; i++) { const u = (i * 0.618 % 1) * W, v = ((i * 0.381 + i * i * 0.0007) % 1) * W; g.fillStyle = "rgba(70,105,60,0.35)"; g.beginPath(); g.arc(u, v, 10 + (i % 7) * 3, 0, 7); g.fill(); }   // tree crowns
  disc(FIRE, RC, "#e3dcc2"); disc(GLADE, GLADE_R, "#d9d6b4");
  // the jeep's track, the footpath and the karaoke road
  const pts = (P) => P.map((q) => [q.x, q.z]);
  line(pts(JEEP_TRACK.pts), "#7a6448", r(2.7)); line(pts(JEEP_TRACK.pts), "#a88f6c", r(1.8));
  for (const p of PATHS) line(pts(p.ribbon.getSpacedPoints(80)), "#b39c78", r(p.id === "karaoke" ? 2.2 : 1.2));
  line(pts(tripPath.cut.pts), "#b2361e", 3.2, [7, 4]);
  grid();
  // the camp's places are close together (12.8 px a metre): smaller labels, each to the side that is free
  spot(TENT.at.x, TENT.at.z, "Tent", 0, -24, "dot", 20); spot(FIRE.x, FIRE.z, "Fire", 34, -8, "tri", 20); spot(TABLE.at.x, TABLE.at.z, "Table", -48, 0, "dot", 20);
  spot(HAMMOCK.mid.x, HAMMOCK.mid.z, "Hammock", 58, 8, "dot", 20); spot(WOOD_PILE.at.x, WOOD_PILE.at.z, "Wood", -40, 6, "dot", 20); spot(JEEP_AT.x, JEEP_AT.z, "Jeep", 30, 22, "dot", 20);
  spot(GLADE.x, GLADE.z, "Sloth glade", 0, -30);
  const end = tripPath.pts[tripPath.pts.length - 1]; { const [u, v] = uv(end.x, end.z); tag("To karaoke", u, v + 30, 24, "#2a2420"); }
}
export function buildCampMap() { carry = buildMapCompass({ scene, camera, map: MAP, paint, lit: (o) => new THREE.MeshLambertMaterial(o) }); }
export const campMapHood = (jeep) => carry?.setHood(jeep);
export const campMapStep = (dt, bright) => carry?.step(dt, bright);
export const campMap = () => carry;
