// The camp's lantern strings and lanterns (review B3, Adriaen picked "B: V to the big tree" on 2026-11-12): two strings rise
// from the tent's front A-frame and the hammock's near post to the big tree behind the fire, ending at its trunk, so they
// frame the top of the view like a canopy of lights instead of cutting across it. Four glass jar lanterns hang on each, a
// candle in each jar, with small fabric bunting flags between them for colour by day (R2-196). By day they are plain glass and
// tin; from dusk the glass glows with a warm gradient, the candle burns and a soft glow shows round each. The lanterns sway
// slowly. Page-lit (no light map: they move), drawn in five draws for all eight: the strings with their flags, tin and cords,
// glass, candles, and the flames and glows together (camera-facing quads, not point sprites, which phone GPUs cap in size
// when you stand close: R2-188).
// The light bake (props/camp/bake_camp_lightmap.py) reads where each lantern hangs from the "place" block that
// props/shadow/layout_pure.mjs works out with lanternLayout (no browser, review R2-257) (lanternHang); the bake hangs its light
// 0.12 m below that on purpose, 5 mm above JAR_Y's 0.125 m (review props-07, R2-187), so the bake stays as it was.
// Exports lanternLayout({ l0, post, tree }) -> { strings, hang, flags } (the strings' points, where each lantern hangs, and each
// bunting flag's two ends on the string; campProps.js, layout_pure.mjs; pure), lanternLights(layout) (where each lantern's
// light is: its hang point lowered by JAR_Y; pure), and createLanterns({ scene, layout, glowTex }) -> { lights, hang,
// update(t, dusk) }: it adds the lanterns to the scene; lights are the jars' world positions (the light pools and the sloths'
// glow), hang the points they hang from, and main.js calls update each frame. Importing it builds nothing, so node can import it too.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { V, canvasTex, tris } from "./util.js";

const SAG = 0.5, PER = 4, TREE_Y = 4.6, TREE_IN = 1.0;   // string sag (m), lanterns per string, tie height and how far in from the tree's centre
// the bunting flags along each string: where each sits (in t: 0 the string's low end, 1 the tree), half a flag's width (in t;
// a string is 5 to 7 m long, so a flag is about 0.12 m wide) and how far its tip hangs. Two in each gap between the lanterns
// (which hang at t = 0.16, 0.32, 0.48 and 0.64) and four on toward the tree; none on a lantern
const FLAG_T = [0.06, 0.11, 0.21, 0.27, 0.37, 0.43, 0.53, 0.59, 0.71, 0.78, 0.86, 0.93], FLAG_W = 0.01, FLAG_DROP = 0.15;
const FLAG_COL = [0xb5523b, 0xd1a03a, 0x3f8a86, 0xe6dcc3];   // faded red, mustard, teal, cream

// l0: the tent end (on its front A-frame), post: the hammock post's top, tree: the big tree's centre (y ignored)
export function lanternLayout({ l0, post, tree }) {
  const tie = tree.clone().addScaledVector(V(tree.x, 0, tree.z).normalize(), -TREE_IN).setY(TREE_Y);
  const strings = [], hang = [], flags = [];
  for (const e of [l0, post]) {
    const on = (t) => { const p = e.clone().lerp(tie, t); p.y -= Math.sin(Math.PI * t) * SAG; return p; };   // the point at t (0 the end, 1 the tree) on this string
    strings.push(Array.from({ length: 17 }, (_, i) => on(i / 16)));
    for (let i = 1; i <= PER; i++) hang.push(on((i / (PER + 1)) * 0.8));
    for (const t of FLAG_T) flags.push([on(t - FLAG_W), on(t + FLAG_W)]);   // the bunting, in the gaps between the lanterns
  }
  return { strings, hang, flags };
}

// where each lantern's light is: its jar, JAR_Y below the hang point
export function lanternLights(layout) { return layout.hang.map((p) => p.clone().setY(p.y + JAR_Y)); }

// a 6-sided prism (or one cap only, h = 0) as plain triangles: the sides, and fans of sides - 2 triangles for the caps asked for
function prism(r0, r1, h, y, sides, caps) {
  const pos = [], ring = (r, yy) => Array.from({ length: sides }, (_, k) => V(r * Math.cos(k / sides * 2 * Math.PI), yy, r * Math.sin(k / sides * 2 * Math.PI)));
  const lo = ring(r0, y - h / 2), hi = ring(r1, y + h / 2), tri = (a, b, d) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
  if (h) for (let k = 0; k < sides; k++) { const j = (k + 1) % sides; tri(lo[k], hi[k], lo[j]); tri(lo[j], hi[k], hi[j]); }
  if (caps.includes("top")) for (let k = 1; k < sides - 1; k++) tri(hi[0], hi[k + 1], hi[k]);
  if (caps.includes("bottom")) for (let k = 1; k < sides - 1; k++) tri(lo[0], lo[k], lo[k + 1]);
  return pos;
}
function quad(w, h, y) { return [-w / 2, y - h / 2, 0, w / 2, y - h / 2, 0, w / 2, y + h / 2, 0, -w / 2, y - h / 2, 0, w / 2, y + h / 2, 0, -w / 2, y + h / 2, 0]; }
function geo(parts) {      // [[positions, colour], ...] -> one flat-shaded, vertex-coloured geometry
  const pos = [], col = [];
  for (const [p, color] of parts) { const c = new THREE.Color(color); pos.push(...p); for (let i = 0; i < p.length / 3; i++) col.push(c.r, c.g, c.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

function paintAll(g, color) {   // one vertex colour over a whole geometry
  const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g;
}

// the lantern hangs from its pivot (the point on the string): a short cord, the wire handle, then the jar
// the jar is 0.14 m tall (it was 0.1 m, a speck by day: R2-196); its centre stays at JAR_Y, so its light is where it was
const TIN = 0x57514a, CORD = 0x5a4636, JAR_H = 0.14, JAR_R = 0.055, JAR_Y = -0.125;
function frameGeo() {        // the cord and the handle one quad each, the tin lid (sides and top), the base (a flat hexagon): 24 triangles
  return geo([[quad(0.004, 0.03, -0.015), CORD], [quad(0.085, 0.03, -0.04), TIN],
    [prism(0.062, 0.042, 0.024, JAR_Y + JAR_H / 2 + 0.012, 6, ["top"]), TIN], [prism(0.06, 0.06, 0, JAR_Y - JAR_H / 2, 6, ["bottom"]), TIN]]);
}

export function createLanterns({ scene, layout, glowTex }) {
  const n = layout.hang.length;
  // the strings, one thin 3-sided tube each, 16 segments through the 17 points lanternLayout gives (they end at the trunk)
  // and the bunting: one triangle per flag hanging from the string, in the strings' draw (vertex colours; the strings' are CORD)
  const strMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const tubes = layout.strings.map((s) => { const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(s), 16, 0.009, 3).toNonIndexed(); g.deleteAttribute("uv"); return paintAll(g, CORD); });
  const flagPos = [], flagCol = [], c = new THREE.Color();
  layout.flags.forEach(([a, b], i) => { const m = a.clone().lerp(b, 0.5); m.y -= FLAG_DROP; flagPos.push(a.x, a.y, a.z, b.x, b.y, b.z, m.x, m.y, m.z);
    c.set(FLAG_COL[i % FLAG_COL.length]); for (let k = 0; k < 3; k++) flagCol.push(c.r, c.g, c.b); });
  const flags = new THREE.BufferGeometry(); flags.setAttribute("position", new THREE.Float32BufferAttribute(flagPos, 3)); flags.setAttribute("color", new THREE.Float32BufferAttribute(flagCol, 3));
  flags.computeVertexNormals();
  scene.add(new THREE.Mesh(mergeGeometries([...tubes, flags]), strMat));   // both strings and their flags in one draw (R2-103)

  const frame = new THREE.InstancedMesh(frameGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), n);
  // the glass: an open 6-sided jar (12 triangles); its emissive map is a warm gradient, brightest low by the flame
  const emissiveMap = canvasTex(4, 64, (x) => { const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, "#5c2c0c"); g.addColorStop(0.55, "#ffb45c"); g.addColorStop(1, "#ffd9a0"); x.fillStyle = g; x.fillRect(0, 0, 4, 64); }, { aniso: 1 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xdcebe4, transparent: true, opacity: 0.35, emissive: 0xffffff, emissiveMap, emissiveIntensity: 0, depthWrite: false, flatShading: true });
  const glassGeo = new THREE.CylinderGeometry(JAR_R, JAR_R, JAR_H, 6, 1, true).translate(0, JAR_Y, 0).toNonIndexed();
  const glass = new THREE.InstancedMesh(glassGeo, glassMat, n);
  // the candle: a 4-sided stub with a top (10 triangles), lit from dusk
  const candleMat = new THREE.MeshLambertMaterial({ color: 0xf2eadb, emissive: 0xffc98a, emissiveIntensity: 0, flatShading: true, side: THREE.DoubleSide });
  const candle = new THREE.InstancedMesh(geo([[prism(0.014, 0.014, 0.065, JAR_Y - JAR_H / 2 + 0.0325, 4, ["top"]), 0xffffff]]), candleMat, n);   // its top 5 mm under JAR_Y, under the flame
  for (const m of [frame, glass, candle]) { m.frustumCulled = false; scene.add(m); }
  console.info(`lanterns: ${n} x ${tris(frame.geometry) + tris(glassGeo) + tris(candle.geometry)} triangles (tin ${tris(frame.geometry)}, glass ${tris(glassGeo)}, candle ${tris(candle.geometry)}), strings ${tubes.reduce((a, t) => a + tris(t), 0)}, flags ${tris(flags)}`);
  glass.renderOrder = 2;

  // the flames and the glows: a camera-facing quad each per lantern, all 2n in one instanced draw (R2-188: point sprites stop
  // growing at the GPU's point-size cap, 511 px on iPhones, so a glow seen from closer than about 1.3 m looked small and
  // hard-edged). Each quad is as wide as the point it replaced: size / projection[1][1] metres for a point of `size`. The
  // instance attributes: iAt the centre (written each frame from dusk), iSC its size and colour (fixed: the glows' 0.85 opacity is in their colour).
  const flameC = new THREE.Color(0xffd27a), glowC = new THREE.Color(0xffb867).multiplyScalar(0.85);
  const qGeo = new THREE.InstancedBufferGeometry();
  qGeo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  qGeo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); qGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const iAt = new THREE.InstancedBufferAttribute(new Float32Array(2 * n * 3), 3).setUsage(THREE.DynamicDrawUsage), sc = new Float32Array(2 * n * 4);
  for (let i = 0; i < 2 * n; i++) { const [size, col] = i < n ? [0.06, flameC] : [0.9, glowC]; sc.set([size, col.r, col.g, col.b], i * 4); }
  qGeo.setAttribute("iAt", iAt); qGeo.setAttribute("iSC", new THREE.InstancedBufferAttribute(sc, 4)); qGeo.instanceCount = 2 * n;
  const lightMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uOpacity: { value: 0 } }]),
    vertexShader: `attribute vec3 iAt; attribute vec4 iSC; varying vec2 vUv; varying vec3 vCol;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vCol = iSC.yzw;
        vec4 mvPosition = modelViewMatrix * vec4(iAt, 1.0); mvPosition.xy += position.xy * iSC.x / projectionMatrix[1][1]; gl_Position = projectionMatrix * mvPosition;
        vec3 transformed = iAt;   // the summit's fog chunk (summit/core.js) reads the point it fogs from here
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform float uOpacity; varying vec2 vUv; varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * vCol, t.a * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
  lightMat.uniforms.map.value = glowTex;   // after the merge, which would clone the texture
  const quads = new THREE.Mesh(qGeo, lightMat); quads.frustumCulled = false; quads.renderOrder = 3; quads.visible = false; scene.add(quads);

  const piv = new THREE.Object3D(), m4 = new THREE.Matrix4(), flameAt = V(0, JAR_Y + 0.01, 0), glowAt = V(0, JAR_Y, 0), tmp = V(0, 0, 0);
  const lights = lanternLights(layout);   // where each lantern's light is (for the ground pools)
  const swaying = [frame, glass, candle], hang = layout.hang;
  return {
    lights, hang,
    // each frame (main.js): the sway, and from dusk the flames and glows; by day the flames and glows are hidden, not drawn
    // at opacity 0, and their quads are not moved (R2-091, R2-093)
    update(t, dusk) {
      const lit = dusk > 0.001;
      for (let i = 0; i < hang.length; i++) {
        piv.position.copy(hang[i]);
        piv.rotation.set(Math.sin(t * 0.45 + i * 2.2) * 0.05, 0, Math.sin(t * 0.6 + i * 1.7) * 0.07);   // a slow sway
        piv.updateMatrix(); m4.copy(piv.matrix);
        frame.setMatrixAt(i, m4); glass.setMatrixAt(i, m4); candle.setMatrixAt(i, m4);
        if (!lit) continue;
        tmp.copy(flameAt).applyMatrix4(m4); iAt.setXYZ(i, tmp.x, tmp.y, tmp.z);
        tmp.copy(glowAt).applyMatrix4(m4); iAt.setXYZ(n + i, tmp.x, tmp.y, tmp.z);
      }
      for (const m of swaying) m.instanceMatrix.needsUpdate = true;
      quads.visible = lit;
      if (lit) iAt.needsUpdate = true;
      const fl = 0.9 + 0.1 * Math.sin(t * 11) * Math.sin(t * 6.7);
      glassMat.emissiveIntensity = 0.65 * dusk * fl; candleMat.emissiveIntensity = dusk * fl;
      lightMat.uniforms.uOpacity.value = dusk * fl;
    },
  };
}
