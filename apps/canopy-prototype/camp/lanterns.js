// The camp's lantern strings and lanterns (review B3, Adriaen picked "B: V to the big tree" on 2026-11-12): two strings rise
// from the tent's front A-frame and the hammock's near post to the big tree behind the fire, tied round its trunk, so they
// frame the top of the view like a canopy of lights instead of cutting across it. Four small glass jar lanterns hang on
// each, a candle in each jar. By day they are plain glass and tin; from dusk the glass glows with a warm gradient, the
// candle burns and a soft glow sprite shows round each. They sway slowly. Page-lit (no light map: they move), drawn in
// five draws for all eight: tin and cords, glass, candles, flames, glows.
// The light bake (props/camp/bake_camp_lightmap.py) reads where each lantern's light is from the "place" block that
// props/shadow/export_casters.cjs writes from this page; only the drop below the hang point is still a copy there (the bake's
// 0.12 m against JAR_Y's 0.125 m, review props-07).
import * as THREE from "three";

const SAG = 0.5, PER = 4, TREE_Y = 4.6, TREE_IN = 1.0;   // string sag (m), lanterns per string, tie height and how far in from the tree's centre
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// l0: the tent end (on its front A-frame), post: the hammock post's top, tree: the big tree's centre (y ignored)
export function lanternLayout({ l0, post, tree }) {
  const tie = tree.clone().addScaledVector(V(tree.x, 0, tree.z).normalize(), -TREE_IN).setY(TREE_Y);
  const strings = [], hang = [];
  for (const e of [l0, post]) {
    const pts = [];
    for (let i = 0; i <= 30; i++) { const t = i / 30, p = e.clone().lerp(tie, t); p.y -= Math.sin(Math.PI * t) * SAG; pts.push(p); }
    strings.push(pts);
    for (let i = 1; i <= PER; i++) { const t = (i / (PER + 1)) * 0.8, p = e.clone().lerp(tie, t); p.y -= Math.sin(Math.PI * t) * SAG; hang.push(p); }
  }
  return { strings, hang, tie };
}

// a 6-sided prism (or one cap only, h = 0) as plain triangles: the sides, and fans of sides - 2 triangles for the caps asked for
function prism(r0, r1, h, y, sides, caps, color) {
  const pos = [], c = new THREE.Color(color), ring = (r, yy) => Array.from({ length: sides }, (_, k) => V(r * Math.cos(k / sides * 2 * Math.PI), yy, r * Math.sin(k / sides * 2 * Math.PI)));
  const lo = ring(r0, y - h / 2), hi = ring(r1, y + h / 2), tri = (a, b, d) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
  if (h) for (let k = 0; k < sides; k++) { const j = (k + 1) % sides; tri(lo[k], hi[k], lo[j]); tri(lo[j], hi[k], hi[j]); }
  if (caps.includes("top")) for (let k = 1; k < sides - 1; k++) tri(hi[0], hi[k + 1], hi[k]);
  if (caps.includes("bottom")) for (let k = 1; k < sides - 1; k++) tri(lo[0], lo[k], lo[k + 1]);
  return pos;
}
function quad(w, h, y, color) { return [-w / 2, y - h / 2, 0, w / 2, y - h / 2, 0, w / 2, y + h / 2, 0, -w / 2, y - h / 2, 0, w / 2, y + h / 2, 0, -w / 2, y + h / 2, 0]; }
function geo(parts) {      // [[positions, colour], ...] -> one flat-shaded, vertex-coloured geometry
  const pos = [], col = [];
  for (const [p, color] of parts) { const c = new THREE.Color(color); pos.push(...p); for (let i = 0; i < p.length / 3; i++) col.push(c.r, c.g, c.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

// the lantern hangs from its pivot (the point on the string): a short cord, the wire handle, then the jar
const TIN = 0x57514a, CORD = 0x5a4636, JAR_H = 0.1, JAR_R = 0.045, JAR_Y = -0.125;
const tris = (g) => g.attributes.position.count / 3;
function frameGeo() {        // the cord and the handle one quad each, the tin lid (sides and top), the base (a flat hexagon): 24 triangles
  return geo([[quad(0.004, 0.06, -0.03), CORD], [quad(0.07, 0.03, -0.06), TIN],
    [prism(0.05, 0.034, 0.022, JAR_Y + JAR_H / 2 + 0.011, 6, ["top"]), TIN], [prism(0.05, 0.05, 0, JAR_Y - JAR_H / 2, 6, ["bottom"]), TIN]]);
}

export function createLanterns({ scene, layout, glowTex }) {
  const n = layout.hang.length;
  // the strings, and a wrap of string round the trunk where they are tied
  const strMat = new THREE.MeshLambertMaterial({ color: CORD });
  const tubes = layout.strings.map((s) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(s), 16, 0.009, 3));
  for (const t of tubes) scene.add(new THREE.Mesh(t, strMat));

  const frame = new THREE.InstancedMesh(frameGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), n);
  // the glass: an open 6-sided jar (12 triangles); its emissive map is a warm gradient, brightest low by the flame
  const gc = document.createElement("canvas"); gc.width = 4; gc.height = 64;
  { const x = gc.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, "#5c2c0c"); g.addColorStop(0.55, "#ffb45c"); g.addColorStop(1, "#ffd9a0"); x.fillStyle = g; x.fillRect(0, 0, 4, 64); }
  const emissiveMap = new THREE.CanvasTexture(gc); emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xdcebe4, transparent: true, opacity: 0.35, emissive: 0xffffff, emissiveMap, emissiveIntensity: 0, depthWrite: false, flatShading: true });
  const glassGeo = new THREE.CylinderGeometry(JAR_R, JAR_R, JAR_H, 6, 1, true).translate(0, JAR_Y, 0).toNonIndexed();
  const glass = new THREE.InstancedMesh(glassGeo, glassMat, n);
  // the candle: a 4-sided stub with a top (10 triangles), lit from dusk
  const candleMat = new THREE.MeshLambertMaterial({ color: 0xf2eadb, emissive: 0xffc98a, emissiveIntensity: 0, flatShading: true, side: THREE.DoubleSide });
  const candle = new THREE.InstancedMesh(geo([[prism(0.012, 0.012, 0.045, JAR_Y - JAR_H / 2 + 0.0225, 4, ["top"]), 0xffffff]]), candleMat, n);
  for (const m of [frame, glass, candle]) { m.frustumCulled = false; scene.add(m); }
  console.info(`lanterns: ${n} x ${tris(frame.geometry) + tris(glassGeo) + tris(candle.geometry)} triangles (tin ${tris(frame.geometry)}, glass ${tris(glassGeo)}, candle ${tris(candle.geometry)}), strings ${tubes.reduce((a, t) => a + t.index.count / 3, 0)}`);
  glass.renderOrder = 2;

  // the flames and the glows: one point each per lantern, in two draws
  const pts = (size, color) => {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color, size, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.frustumCulled = false; p.renderOrder = 3; scene.add(p); return p;
  };
  const flames = pts(0.06, 0xffd27a), glows = pts(0.9, 0xffb867);

  const piv = new THREE.Object3D(), m4 = new THREE.Matrix4(), flameAt = V(0, JAR_Y + 0.01, 0), glowAt = V(0, JAR_Y, 0), tmp = V(0, 0, 0);
  const lights = layout.hang.map((p) => p.clone().setY(p.y + JAR_Y));   // where each lantern's light is (for the ground pools)
  return {
    lights,
    update(t, dusk) {
      const fp = flames.geometry.attributes.position, gp = glows.geometry.attributes.position;
      layout.hang.forEach((p, i) => {
        piv.position.copy(p);
        piv.rotation.set(Math.sin(t * 0.45 + i * 2.2) * 0.05, 0, Math.sin(t * 0.6 + i * 1.7) * 0.07);   // a slow sway
        piv.updateMatrix(); m4.copy(piv.matrix);
        frame.setMatrixAt(i, m4); glass.setMatrixAt(i, m4); candle.setMatrixAt(i, m4);
        tmp.copy(flameAt).applyMatrix4(m4); fp.setXYZ(i, tmp.x, tmp.y, tmp.z);
        tmp.copy(glowAt).applyMatrix4(m4); gp.setXYZ(i, tmp.x, tmp.y, tmp.z);
      });
      for (const m of [frame, glass, candle]) m.instanceMatrix.needsUpdate = true;
      fp.needsUpdate = gp.needsUpdate = true;
      const fl = 0.9 + 0.1 * Math.sin(t * 11) * Math.sin(t * 6.7);
      glassMat.emissiveIntensity = 0.65 * dusk * fl; candleMat.emissiveIntensity = dusk * fl;
      flames.material.opacity = dusk * fl; glows.material.opacity = 0.85 * dusk * fl;
    },
  };
}
