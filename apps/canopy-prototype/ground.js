// Wild, lived-in camp ground for camp.html: worn dirt where the camp is used, and grass tufts, tall grass, wildflowers and clover on cards.
// Kept out of camp.html (which only calls createGround once) so the sibling threads' edits there don't collide.
// Floor: one disc (96 tris) that replaces the old flat clearing. A painted "wear map" over the clearing says where it is dirt (fire ring,
// seats, tent door, table, wood pile, jeep, the paths between them, worked out from camp.html's collision circles), where the grass
// is lush or dry, and where it is ash or mud; tiling grass and dirt textures give the close-up detail. The edge is ragged, not a circle.
// Plants: crossed-quad cards (4 tris each) from one painted atlas, all in one instanced draw, swaying in the vertex shader.
// They grow thick at the forest edge and against the props, thin out in the open, and never on the worn dirt.
import * as THREE from "three";
import { LIGHT_GLSL, LIGHT_MIX, bindLight, liveChunk, loadLightMap } from "./bakedlight.js";
import { canvasTex, lcg, patchMaterial, rand, sstep, tris } from "./camp/util.js";
// the contact shadow on whatever sits on the floor: a dark brown laid over it by the shadow map, faded at night (the night
// bake holds the night's shadows); xz is the point's world x, z
const SHADE = (xz) => `outgoingLight = mix(outgoingLight, vec3(0.0103, 0.0070, 0.0024), texture2D(uShadeT, ${xz} / (2.0 * uR) + 0.5).r * uShadeK * (1.0 - (0.5 + 0.5 * uGNon) * uNight) * step(length(${xz}), uR));`;   // the camp's baked lights, one channel each

// value noise on an integer lattice, the same as camp/terrain.js vnoise (an integer hash, so the page and the shader agree), and the
// big colour patches it drives: drier and yellower, or bluer and greener, 5 to 10 m across; the plants take the same tint as the ground
const NOISE_GLSL = `
  float hs(int i, int j) { uint h = uint(i) * 374761393u + uint(j) * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; h ^= h >> 16u; return float(h) / 4294967296.0; }
  float vnoise(vec2 p) { vec2 i = floor(p), f = p - i, u = f * f * (3.0 - 2.0 * f); int x = int(i.x), y = int(i.y);
    float a = hs(x, y), b = hs(x + 1, y), c = hs(x, y + 1), d = hs(x + 1, y + 1); return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y; }
  vec3 macroTint(float m) { return mix(vec3(1.1, 1.02, 0.74), vec3(0.8, 0.97, 0.95), m); }
`;
const macroTint = (m, c) => c.multiply(new THREE.Color(1.1 + (0.8 - 1.1) * m, 1.02 + (0.97 - 1.02) * m, 0.74 + (0.95 - 0.74) * m));

export function createGround({ scene, RC, blockers, clearing, S, look, fx, uTime, night = { value: 0 }, trackDist = () => 1e9, trackPts = [], bare = () => false, shadowMap = null, nightMap = null, baked = null, seed = 77, height = () => 0, far = 0, forestMap = null, noise = null }) {
  // height (camp/terrain.js groundHeight): the floor, the plants and the roots follow it; far > 0 makes the floor one mesh out to far metres,
  // the forest floor included (forestMap is its tile, 6 m across), instead of the flat clearing disc
  // night: camp.html's uNight (0 day .. 1 rested); the ground and plants sink to a dim blue so the fire and lantern pools read
  const { rnd, R } = lcg(seed);
  const RR = RC + 0.8, M = 256, px = (x) => (x / (2 * RR) + 0.5) * M;      // world x/z to wear-map pixels

  // things in the camp (not the big trees at the edge), from the collision circles
  const spots = blockers.filter(([c, r]) => Math.hypot(c.x, c.z) < RC - 1 && r < 1.6 && Math.hypot(c.x, c.z) > 0.01);
  const used = spots.filter((b) => !b.wild);   // what people use gets worn dirt and a path; the deadwood (wild) only gets plants round it (Adriaen 2026-11-12)
  const entry = trackPts.find((p) => Math.hypot(p.x, p.z) > RC - 0.6);        // where the jeep's track meets the clearing

  // ---------------------------------------------------------------- wear map: R dirt, G lushness (0.5 neutral), B ash / wet mud
  const wear = canvasTex(M, M, (g) => {
    g.fillStyle = "rgb(0,128,0)"; g.fillRect(0, 0, M, M);
    const blob = (x, z, r, rgba) => { const X = px(x), Z = px(z), Rp = (r / (2 * RR)) * M, gr = g.createRadialGradient(X, Z, 0, X, Z, Rp); gr.addColorStop(0, rgba); gr.addColorStop(1, rgba.replace(/[\d.]+\)$/, "0)")); g.fillStyle = gr; g.fillRect(X - Rp, Z - Rp, 2 * Rp, 2 * Rp); };
    // lushness: richer grass at the edge and in random patches, drier patches in the open
    g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 26; i++) { const a = R(0, 6.28), r = R(1.5, RC), lush = rnd() < 0.6; blob(Math.cos(a) * r, Math.sin(a) * r, R(0.8, 2.2), lush ? "rgba(0,200,0,.5)" : "rgba(0,40,0,.45)"); }
    for (let i = 0; i < 40; i++) { const a = (i / 40) * 6.28, r = RC - R(0, 0.8); blob(Math.cos(a) * r, Math.sin(a) * r, R(1.2, 2), "rgba(0,230,0,.5)"); }
    // dirt (red channel only, added on top)
    g.globalCompositeOperation = "lighter";
    const dirt = (x, z, r, a) => blob(x, z, r, `rgba(255,0,0,${a})`);
    dirt(0, 0, 3.3, 0.8); dirt(0, 0, 2.2, 0.7);                                  // round the fire and the seats
    for (const [c, r] of used) dirt(c.x, c.z, r + R(0.6, 0.9), 0.75);            // in front of and round each thing you use
    const path = (a, b, w) => {                                                     // a worn footpath: a wobbly line, soft edges
      const n = Math.max(6, Math.round(a.distanceTo(b) / 0.4)), side = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize(), bend = R(-0.5, 0.5);
      for (let k = 0; k <= n; k++) { const t = k / n, p = a.clone().lerp(b, t).addScaledVector(side, Math.sin(t * Math.PI) * bend + R(-0.06, 0.06)); dirt(p.x, p.z, w * R(0.85, 1.15), 0.32); }
    };
    for (const [c, r] of used) { const d = c.clone().setY(0), L = d.length(); if (L > 2.2) path(d.clone().multiplyScalar(2.4 / L), d.clone().multiplyScalar((L - r * 0.7) / L), 0.55); }
    if (entry) path(new THREE.Vector3(entry.x, 0, entry.z).multiplyScalar(2.6 / Math.hypot(entry.x, entry.z)), new THREE.Vector3(entry.x, 0, entry.z), 0.6);   // to the track
    // break it up: grass islands in the dirt, ragged edges
    g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 220; i++) { const a = R(0, 6.28), r = Math.sqrt(rnd()) * RC, X = px(Math.cos(a) * r), Z = px(Math.sin(a) * r); g.fillStyle = `rgba(0,${Math.round(R(90, 170))},0,${R(0.15, 0.4)})`; g.beginPath(); g.ellipse(X, Z, R(1.5, 4), R(1, 3), R(0, 3), 0, 7); g.fill(); }
    // ash right round the fire, wet mud by the table, the jeep and the track
    g.globalCompositeOperation = "lighter";
    blob(0, 0, 1.25, "rgba(0,0,255,.75)");
    for (const [c, r] of used) if (rnd() < 0.5) blob(c.x + R(-0.3, 0.3), c.z + R(-0.3, 0.3), r * 0.6 + 0.3, "rgba(0,0,180,.3)");
    if (entry) blob(entry.x * 0.95, entry.z * 0.95, 1.1, "rgba(0,0,200,.45)");
  }, { srgb: false });
  if (baked) { const g = wear.image.getContext("2d"); g.globalCompositeOperation = "copy"; g.drawImage(baked.mask, 0, 0, M, M); wear.needsUpdate = true; }   // the baked wear map (props/ground/bake_ground.py) for the plants' lookups
  wear.anisotropy = 1; wear.flipY = false;   // canvas rows run with +z, like the shader's lookup

  // ---------------------------------------------------------------- shadows (Adriaen 2026-11-12): the page has no shadow maps, so castShadows(renderer)
  // renders every standing prop once from the sun into a texture, softened, and the ground and plants read it. Two passes kept with a max blend:
  // the sun's direction, and straight down for a fainter contact darkening under each thing. Nothing per frame; call it again when props are added.
  const SUN = new THREE.Vector3(-4, 10, 3), SM = 1024;
  const rtOpt = { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false };
  const silRT = new THREE.WebGLRenderTarget(SM, SM, rtOpt), tmpRT = new THREE.WebGLRenderTarget(SM, SM, rtOpt), outRT = new THREE.WebGLRenderTarget(SM, SM, rtOpt);
  const shade = outRT.texture;
  const uDir = { value: new THREE.Vector3() }, uK = { value: 0 };
  const silMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  silMat.onBeforeCompile = (sh) => { sh.uniforms.uDir = uDir; sh.uniforms.uK = uK; sh.uniforms.uR = { value: RR };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform vec3 uDir; uniform float uK, uR; varying float vK;")
      .replace("#include <project_vertex>", `vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp; float hy = max(wp.y, 0.0);
        vec2 g = wp.xz - uDir.xz * (hy / uDir.y);                       // where the ray through this point toward the sun meets the ground
        vK = uK * (1.0 - 0.45 * smoothstep(0.2, 2.8, hy));            // higher parts cast fainter shadows (more sky gets under them)
        gl_Position = vec4(g.x / uR, g.y / uR, 0.0, 1.0);`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vK;").replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4(vec3(vK), 1.0);"); };
  const blurMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: null }, uD: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false,
    vertexShader: "varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `uniform sampler2D uT; uniform vec2 uD; varying vec2 vUv;
      void main() { float s = 0.0; float w[5] = float[](0.204, 0.180, 0.124, 0.066, 0.028);
        s += texture2D(uT, vUv).r * w[0]; for (int i = 1; i < 5; i++) s += (texture2D(uT, vUv + uD * float(i)).r + texture2D(uT, vUv - uD * float(i)).r) * w[i];
        gl_FragColor = vec4(vec3(s), 1.0); }` });
  const quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), blurMat);
  quad.frustumCulled = false; const qScene = new THREE.Scene(); qScene.add(quad);
  const SHADOW_LAYER = 7, cam = new THREE.Camera(); cam.layers.set(SHADOW_LAYER);
  const own = new Set();                                                      // the ground's own meshes never cast
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const living = (o) => { for (; o && o !== scene; o = o.parent) if (o.isBone || o.isSkinnedMesh || o.children.some((c) => c.isSkinnedMesh)) return true; return false; };   // the sloths and what they wear
  const bb = new THREE.Box3(), cc = new THREE.Vector3();
  function casters() {
    const out = [];
    scene.updateMatrixWorld();
    scene.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || own.has(o) || !o.geometry) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || !m.visible || m.transparent || m.blending !== THREE.NormalBlending || !shown(o)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); bb.getCenter(cc);
      if (bb.max.y < 0.08 || bb.max.y > 4.5 || Math.hypot(cc.x, cc.z) > RR || living(o.parent)) return;   // flat ground bits, the trees, far things, the sloths
      out.push(o);
    });
    return out;
  }
  function castShadows(renderer) {
    const list = casters(), was = renderer.getRenderTarget(), bg = scene.background, ov = scene.overrideMaterial, ac = renderer.autoClear, cl = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    for (const o of list) o.layers.enable(SHADOW_LAYER);
    scene.background = null; scene.overrideMaterial = silMat; renderer.autoClear = false; renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(silRT); renderer.clear();
    uDir.value.copy(SUN).normalize(); uK.value = 0.62; renderer.render(scene, cam);    // the sun
    uDir.value.set(0, 1, 0); uK.value = 0.4; renderer.render(scene, cam);                // contact darkening right under
    scene.overrideMaterial = ov; scene.background = bg;
    for (const o of list) o.layers.disable(SHADOW_LAYER);
    const px = 1.6 / SM;                                                      // ~6 cm a tap: soft edges, poles stay visible
    blurMat.uniforms.uT.value = silRT.texture; blurMat.uniforms.uD.value.set(px, 0); renderer.setRenderTarget(tmpRT); renderer.render(qScene, cam0);
    blurMat.uniforms.uT.value = tmpRT.texture; blurMat.uniforms.uD.value.set(0, px); renderer.setRenderTarget(outRT); renderer.render(qScene, cam0);
    renderer.setRenderTarget(was); renderer.autoClear = ac; renderer.setClearColor(cl, ca);
    return list.length;
  }
  const cam0 = new THREE.Camera();
  const mk = wear.image.getContext("2d").getImageData(0, 0, M, M).data;
  const sample = (x, z, ch) => { const X = Math.min(M - 1, Math.max(0, Math.floor(px(x)))), Z = Math.min(M - 1, Math.max(0, Math.floor(px(z)))); return mk[(Z * M + X) * 4 + ch] / 255; };

  // ---------------------------------------------------------------- dirt detail, tiled: packed earth with pebbles, twigs and a few dry leaves
  const mud = look === "low" ? ["#a88a60", "#947654", "#7a5e42"] : ["#a08460", "#8a6e4e", "#73583e"];
  const dirtTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = mud[0]; g.fillRect(0, 0, w, h);
    const Q = rand;
    const wrap = (f) => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.save(); g.translate(dx, dy); f(); g.restore(); } };
    if (look !== "low") for (let i = 0; i < 700; i++) { const x = Q(0, w), y = Q(0, h), rx = Q(1, 6), ry = Q(1, 4), r = Q(0, 3), c = mud[1 + (i % 2)], a = Q(0.15, 0.45); wrap(() => { g.fillStyle = c; g.globalAlpha = a; g.beginPath(); g.ellipse(x, y, rx, ry, r, 0, 7); g.fill(); }); }
    g.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { const x = Q(0, w), y = Q(0, h), r = Q(1.5, 4), c = ["#9b948a", "#7f786e", "#b0a89a"][i % 3]; wrap(() => { g.fillStyle = "rgba(40,28,20,.35)"; g.beginPath(); g.ellipse(x + 1, y + 1.2, r, r * 0.75, 0, 0, 7); g.fill(); g.fillStyle = c; g.beginPath(); g.ellipse(x, y, r, r * 0.75, 0, 0, 7); g.fill(); g.fillStyle = "rgba(255,255,255,.25)"; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.3, 0, 0, 7); g.fill(); }); }   // pebbles
    for (let i = 0; i < 9; i++) { const x = Q(0, w), y = Q(0, h), a = Q(0, 3.14), L = Q(10, 26); wrap(() => { g.strokeStyle = "#4a3424"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.lineTo(x + Math.cos(a) * L + 4, y + Math.sin(a) * L - 3); g.stroke(); }); }   // twigs
    for (let i = 0; i < 14; i++) { const x = Q(0, w), y = Q(0, h), r = Q(0, 3), c = ["#a8672e", "#c28a3a", "#8a5a2a"][i % 3]; wrap(() => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, 4, 2, r, 0, 7); g.fill(); }); }   // dry leaves
  });
  dirtTex.wrapS = dirtTex.wrapT = THREE.RepeatWrapping;

  // ---------------------------------------------------------------- leaf litter, tiled (forest-ground note 2b): fallen leaves in the camp's
  // browns and olives, each with its own height in alpha (0 between leaves), so the shader shows more or fewer whole leaves where litter
  // gathers. A DataTexture, so the alpha isn't premultiplied away
  const litterTex = (() => {
    const W = 256, cv = document.createElement("canvas"); cv.width = cv.height = W; const g = cv.getContext("2d");
    const hc = document.createElement("canvas"); hc.width = hc.height = W; const gh = hc.getContext("2d");
    g.fillStyle = "#8a6438"; g.fillRect(0, 0, W, W); gh.fillStyle = "#000"; gh.fillRect(0, 0, W, W);
    const LEAF = ["#96602a", "#b27e36", "#7a4a24", "#a06e3c", "#6c5a2e", "#8c8046", "#5e6a2c", "#c49446"];
    const { R: Q } = lcg(4242);
    for (let i = 0; i < 120; i++) {
      const x = Q(0, W), y = Q(0, W), a = Q(0, 6.28), L = Q(7, 15), w = L * Q(0.38, 0.55), col = LEAF[i % LEAF.length], hgt = Math.round(Q(40, 255));
      for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) for (const [cx, fill] of [[g, col], [gh, `rgb(${hgt},${hgt},${hgt})`]]) {
        cx.save(); cx.translate(x + dx, y + dy); cx.rotate(a); cx.fillStyle = fill; cx.beginPath(); cx.moveTo(-L, 0); cx.quadraticCurveTo(0, -w * 1.3, L, 0); cx.quadraticCurveTo(0, w * 1.3, -L, 0); cx.fill();
        if (cx === g) { cx.strokeStyle = "rgba(60,36,16,.45)"; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(-L, 0); cx.lineTo(L * 0.9, 0); cx.stroke(); }
        cx.restore(); }
    }
    const rgb = g.getImageData(0, 0, W, W).data, hh = gh.getImageData(0, 0, W, W).data, out = new Uint8Array(W * W * 4);
    for (let i = 0; i < W * W; i++) { out[i * 4] = rgb[i * 4]; out[i * 4 + 1] = rgb[i * 4 + 1]; out[i * 4 + 2] = rgb[i * 4 + 2]; out[i * 4 + 3] = hh[i * 4]; }
    const t = new THREE.DataTexture(out, W, W); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4; t.flipY = false; t.needsUpdate = true; return t;
  })();

  // ---------------------------------------------------------------- the floor: one disc in world coordinates, grass and dirt blended by the wear map
  // one ground (forest-ground note, 2026-11-12): rings round the fire, sparse in the level camp, dense over the bowl's rim and the
  // banks of the glade path and the track, sparse again in the far forest; about 3,600 triangles, one draw, no seam with the forest
  // floor. Each vertex sits on the height; uv is the old disc's, so the grass tiles as before
  const geo = far ? ringGround() : new THREE.CircleGeometry(RR, 48).rotateX(-Math.PI / 2).translate(0, 0.012, 0);
  function ringGround() {
    const rings = [[0, 1]];
    for (const r of [1.6, 3.2, 4.8, 6.2]) rings.push([r, 40]);
    rings.push([7.0, 64]);
    for (let r = 7.6; r < 15.5; r += 0.7) rings.push([r, 80]);
    for (let r = 16.4; r < 25.5; r += 1.2) rings.push([r, 64]);
    for (const r of [27.5, far]) rings.push([r, 48]);
    const pos = [], uv = [], idx = [], start = [];
    for (const [r, n] of rings) { start.push(pos.length / 3);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        pos.push(x, height(x, z) + 0.012, z); uv.push(x / (2 * RR) + 0.5, -z / (2 * RR) + 0.5); } }
    for (let k = 1; k < rings.length; k++) {                     // stitch ring k-1 (n1 points) to ring k (n2), walking round by angle
      const a0 = start[k - 1], n1 = rings[k - 1][1], b0 = start[k], n2 = rings[k][1];
      let i = 0, j = 0;
      while (i < n1 || j < n2) {
        const ai = (i + 1) / n1, bj = (j + 1) / n2;
        if (n1 > 1 && (j >= n2 || (i < n1 && ai < bj))) { idx.push(a0 + (i % n1), b0 + (j % n2), a0 + ((i + 1) % n1)); i++; }
        else { idx.push(a0 + (i % n1), b0 + (j % n2), b0 + ((j + 1) % n2)); j++; if (n1 === 1 && j >= n2) i = n1; }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]]; g.setIndex(idx); g.computeVertexNormals(); }   // face up
    return g;
  }
  const grassMap = clearing.material.map;
  let bakedMask = null, bakedSoil = null;
  if (baked) {
    bakedMask = new THREE.CanvasTexture(baked.mask); bakedMask.flipY = false; bakedMask.colorSpace = THREE.NoColorSpace;
    bakedSoil = new THREE.TextureLoader().load(baked.soil); bakedSoil.flipY = false; bakedSoil.anisotropy = 4;   // sRGB, decoded in the shader like the dirt tile
  }
  // the baked night light on the ground (props/camp/bake_camp_lightmap.py: fire, lanterns, stove and moon, with the props' and the
  // jeep's shadows), one channel per light, coloured and mixed as on the props (bakedlight.js), the warm ones a little by day too; uGNon = 0 until it loads
  const uGN = { value: null }, uGJ = { value: null }, uGDP = { value: null }, uGDD = { value: null }, uGDB = { value: null }, uGNon = { value: 0 };   // uGD: the cabin light's spill through each door (patch round the jeep)   // uGJ: the jeep's headlights (R) and cabin light (G)
  const mat = new THREE.MeshLambertMaterial({ map: grassMap });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uMask: { value: bakedMask || wear }, uDirt: { value: dirtTex }, uSoil: { value: bakedSoil }, uR: { value: RR }, uNight: night, uGN, uGJ, uGDP, uGDD, uGDB, uGNon, uShadeT: uShade, uShadeK }); bindLight(sh);
    if (baked) sh.defines = { ...sh.defines, BAKED: 1 };
    if (far) sh.defines = { ...sh.defines, FAR: 1 };
    if (!fx) sh.defines = { ...sh.defines, LOWFX: 1 };
    Object.assign(sh.uniforms, { uLitter: { value: litterTex }, uForest: { value: forestMap || grassMap }, uRC: { value: RC } });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vG; varying vec3 vNw;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvG = position.xz; vNw = normal;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vG; varying vec3 vNw; uniform sampler2D uMask, uDirt, uSoil, uGN, uGJ, uGDP, uGDD, uGDB, uShadeT, uLitter, uForest; uniform float uR, uRC, uNight, uGNon, uShadeK; vec3 albedoG; float hB = 0.0;\n" + NOISE_GLSL + LIGHT_GLSL)
      .replace("#include <lights_fragment_begin>", liveChunk())   // keeps the live cabin light's share apart (Cabin: live)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        #ifndef LOWFX
        {                                                                   // the painted relief (sunk paths, their lip, pebbles, litter) as a bump
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition), r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          normal = normalize(abs(det) * normal - sign(det) * (dFdx(hB) * r1 + dFdy(hB) * r2));
        }
        #endif`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        // forest ground (2026-11-12 note): grass at two scales and big colour patches, grass and dirt blended by height so the
        // edge is ragged, packed path centres, moss in the shade, leaf litter at the rim and against things, the forest floor beyond
        float rr = length(vG), inD = step(rr, uR);
        vec2 uvC = vG / (2.0 * uR) + 0.5;
        float mN = vnoise(vG * 0.13 + vec2(3.7, -1.2)), mS = vnoise(vG * 0.9 + vec2(-4.1, 8.3));
        #ifndef LOWFX
          vec3 g2 = texture2D(map, vG * 0.071 * mat2(0.8, 0.6, -0.6, 0.8)).rgb * diffuse;   // a second, turned grass tile: the 3 m repeat stops showing
          diffuseColor.rgb = mix(diffuseColor.rgb, g2, 0.5 * smoothstep(0.35, 0.65, vnoise(vG * 0.35 + 2.0)));
        #endif
        float hg = dot(diffuseColor.rgb, vec3(1.0)) / max(1e-3, dot(textureLod(map, vec2(0.5), 10.0).rgb * diffuse, vec3(1.0))) - 1.0;   // grass height: the blades are lighter
        vec4 mk = texture2D(uMask, uvC);
        vec3 dt = sRGBTransferEOTF(texture2D(uDirt, vG * 0.45)).rgb, dtM = sRGBTransferEOTF(textureLod(uDirt, vec2(0.5), 10.0)).rgb;
        float hd = dot(dt, vec3(1.0)) / dot(dtM, vec3(1.0)) - 1.0;           // dirt height: the pebbles stand up
        vec3 gr = diffuseColor.rgb * mix(vec3(1.18, 1.1, 0.82), vec3(0.72, 0.9, 0.62), mk.g) * macroTint(mN);   // dry and pale ... lush and deep, and drier or bluer in big patches
        float dB = mk.r, dC = mk.r;
        #ifdef BAKED
          dB = texture2D(uMask, uvC, 2.0).r; dC = texture2D(uMask, uvC, 4.5).r;   // the wear a little blurred, and well blurred (1 in a path's middle)
        #endif
        gr *= (0.84 + 0.32 * mS) * (0.78 + 0.34 * vnoise(vG * 0.33 + vec2(-6.0, 2.5)));   // mottled at 1 m and 3 m: no two patches the same
        gr = mix(gr, gr * vec3(0.98, 0.9, 0.7) * 0.82, 0.6 * smoothstep(0.04, 0.45, dB));   // trampled, darker and browner next to the dirt
        float shd = texture2D(uShadeT, uvC).r * inD;                          // the baked sun and sky shadow: where it's shady
        float moss = smoothstep(0.22, 0.55, shd + 0.3 * (mS - 0.5)) * (0.3 + 0.7 * smoothstep(uR - 4.5, uR - 0.8, rr));
        gr = mix(gr, vec3(0.085, 0.16, 0.03) * (0.75 + 0.5 * mS), 0.55 * moss);
        float d = 0.0, centre = 0.0;
        #ifdef BAKED
          // baked soil (props/ground/bake_ground.py): its own colour, ash and litter. Edges: the dirt shows first between the grass
          // blades and round the pebbles (height blend); the middle of a path is packed smooth and paler; the tiled dirt adds grain
          d = smoothstep(0.3, 0.7, (dB - 0.5) * 2.2 + 0.5 + (hd - 1.2 * hg) * 1.4) * inD;
          centre = smoothstep(0.8, 0.97, dC) * inD;
          vec3 soil = sRGBTransferEOTF(texture2D(uSoil, uvC)).rgb * mix(1.0, dot(dt, vec3(1.0)) / dot(dtM, vec3(1.0)), 0.3 * (1.0 - 0.75 * centre)) * (1.0 + 0.1 * centre);
          vec3 c = mix(gr, soil, d);
          hB = -0.035 * smoothstep(0.15, 0.85, dB) + 0.012 * exp(-pow((dB - 0.28) / 0.14, 2.0)) + 0.004 * hd * d * (1.0 - centre);   // paths sunk a few cm, with a lip
        #else
          d = 0.92 * smoothstep(0.3, 0.7, mk.r + (dot(dt, vec3(0.33)) - 0.25) * 0.6);
          vec3 c = mix(gr, dt, d);
          float ashy = 1.0 - smoothstep(1.0, 1.6, rr);                       // grey ash by the fire, dark wet mud elsewhere
          c = mix(c * (1.0 - 0.45 * mk.b * d), mix(c, vec3(0.30, 0.28, 0.26) * (0.8 + 0.4 * dot(dt, vec3(0.33))), 0.85 * mk.b), ashy);
        #endif
        // the forest floor past the rim: dark speckled earth, moss on the slopes turned from the sun, litter almost everywhere
        float inC = 1.0 - smoothstep(uR - 1.1, uR - 0.1, rr + 0.7 * (mS - 0.5));
        #ifdef FAR
          vec3 fc = texture2D(uForest, vG / 6.0).rgb * macroTint(mN) * 0.9;
          float away = smoothstep(0.02, 0.3, dot(vNw.xz, normalize(vec2(4.0, -3.0)))) * smoothstep(uR, uR + 2.0, rr);
          fc = mix(fc, vec3(0.07, 0.14, 0.025) * (0.7 + 0.6 * mS), 0.7 * max(away, 0.6 * smoothstep(0.6, 0.8, vnoise(vG * 0.4 + 9.0))));
          c = mix(fc, c, inC);
        #endif
        // leaf litter: two turned layers of painted leaves, each leaf with its own height in alpha, so a leaf shows whole or not at all
        vec4 l1 = texture2D(uLitter, vG * 0.62);
        #ifndef LOWFX
          vec4 l2 = texture2D(uLitter, mat2(0.6, -0.8, 0.8, 0.6) * vG * 0.41 + 0.37); if (l2.a > l1.a) l1 = l2;
        #endif
        float litW = clamp(smoothstep(uRC - 3.0, uRC + 0.6, rr) * (0.55 + 0.45 * mN) + 0.3 * smoothstep(0.45, 0.75, shd), 0.0, 0.92) * (1.0 - 0.95 * d);
        float show = smoothstep(1.0 - litW - 0.03, 1.0 - litW + 0.03, l1.a) * step(0.01, l1.a);
        c = mix(c, sRGBTransferEOTF(vec4(l1.rgb, 1.0)).rgb * (0.85 + 0.3 * mS), show);
        hB = hB * inD + 0.006 * show;
        diffuseColor.rgb = c;
        albedoG = diffuseColor.rgb;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.38, 0.42, 0.6), uNight);`)
      .replace("#include <opaque_fragment>", `vec4 gq = lmDecode(texture2D(uGN, uvC)) * uGNon * vec4(vec3(inD), 1.0 - 0.4 * smoothstep(uR, uR + 8.0, rr));
        vec2 gj = lmDecode2(texture2D(uGJ, uvC).rg) * uGNon * inD;
        vec2 du = lmDoorUv(vG); vec3 gd = all(greaterThan(du, vec2(0.0))) && all(lessThan(du, vec2(1.0))) ? vec3(doorKey(lmDecode(texture2D(uGDP, du)), uLD.x), doorKey(lmDecode(texture2D(uGDD, du)), uLD.y), doorKey(lmDecode(texture2D(uGDB, du)), uLD.z)) * uGNon : vec3(0.0);${LIGHT_MIX("albedoG", "gq", "gj", "(uNight * uGNon)", "gd", true)}
        ${SHADE("vG")}
#include <opaque_fragment>`);
  };
  const floor = new THREE.Mesh(geo, mat); scene.add(floor);
  // the contact shadows: the floor darkens itself by the shadow map (review P8: it was a see-through disc blended over the whole
  // floor every frame); the track and path ribbons on top take the same darkening through shadeOn()
  const uShade = { value: shade }, uShadeK = { value: 1 };
  clearing.visible = false;

  // ---------------------------------------------------------------- plant atlas (4 x 2 cells of 128): tuft, tall grass, wildflowers, clover;
  // then the clearing-edge accents (review B6): heliconia with red bracts, a bromeliad, a dark fern for framing, ground orchids
  const leaf = S.leaf.map((c) => "#" + new THREE.Color(c).lerp(new THREE.Color(0xd8e0a0), 0.3).getHexString());   // a bit lighter than the canopy, like the lawn
  const atlas = canvasTex(512, 256, (g) => {
    const Q = rand;
    const blade = (x0, y0, len, lean, w, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x0 - w, y0); g.quadraticCurveTo(x0 + lean * 0.4, y0 - len * 0.6, x0 + lean, y0 - len); g.quadraticCurveTo(x0 + lean * 0.4 + w * 0.3, y0 - len * 0.6, x0 + w, y0); g.closePath(); g.fill(); };
    const cell = (cx, cy, f) => { g.save(); g.beginPath(); g.rect(cx + 2, cy + 2, 124, 124); g.clip(); g.translate(cx, cy); f(); g.restore(); };
    cell(0, 0, () => { for (let i = 0; i < 22; i++) blade(64 + Q(-14, 14), 128, Q(55, 118), Q(-40, 40), Q(2, 3.5), leaf[i % 4]); for (let i = 0; i < 6; i++) blade(64 + Q(-8, 8), 128, Q(40, 90), Q(-30, 30), 1.6, "#c8d88a"); });   // a grass tuft
    cell(128, 0, () => {                                                                                                                                                 // tall grass with seed heads
      for (let i = 0; i < 14; i++) blade(64 + Q(-16, 16), 128, Q(80, 122), Q(-26, 26), Q(1.6, 2.6), leaf[i % 4]);
      for (let i = 0; i < 4; i++) { const x = 64 + Q(-24, 24), top = Q(6, 20), lean = Q(-12, 12); g.strokeStyle = leaf[1]; g.lineWidth = 1.2; g.beginPath(); g.moveTo(64, 128); g.quadraticCurveTo(x, 60, x + lean, top + 14); g.stroke();
        g.fillStyle = "#d8c88a"; for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(x + lean + (k % 2 ? 1.6 : -1.6), top + k * 3, 1.1, 2.4, k % 2 ? 0.5 : -0.5, 0, 7); g.fill(); } }
    });
    cell(256, 0, () => {                                                                                                                                                 // wildflowers
      for (let i = 0; i < 10; i++) blade(64 + Q(-18, 18), 128, Q(30, 60), Q(-20, 20), 2.2, leaf[i % 4]);
      const kinds = [["#ffffff", "#ffd23a"], ["#ff8fb3", "#ffe08a"], ["#ffd23a", "#e8a020"], ["#b79cff", "#fff1a8"], ["#ffffff", "#ffd23a"]];
      for (let i = 0; i < 6; i++) {
        const x = Q(26, 102), y = Q(26, 66), [pet, mid] = kinds[i % kinds.length];
        g.strokeStyle = leaf[2]; g.lineWidth = 2; g.beginPath(); g.moveTo(64 + Q(-10, 10), 128); g.quadraticCurveTo(x, 100, x, y); g.stroke();
        g.fillStyle = pet; for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.28; g.beginPath(); g.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 5, 5, 3.4, a, 0, 7); g.fill(); }
        g.fillStyle = mid; g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill();
      }
    });
    cell(384, 0, () => {                                                                                                                                                 // clover and low leaves
      for (let i = 0; i < 16; i++) { const x = 64 + Q(-44, 44), y = Q(70, 120); g.strokeStyle = leaf[2]; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 128); g.lineTo(x, y); g.stroke();
        g.fillStyle = leaf[i % 4]; for (let k = 0; k < 3; k++) { const a = -1.57 + (k - 1) * 1.1; g.beginPath(); g.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 6, 5, a, 0, 7); g.fill(); } }
      for (let i = 0; i < 4; i++) { const x = 64 + Q(-36, 36), y = Q(56, 80); g.fillStyle = "#fff6f0"; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.fillStyle = "#ffc8d8"; g.beginPath(); g.arc(x, y + 2, 4, 0, 3.14); g.fill(); }
    });
    const dk = ["#2f5a26", "#3d6a2f", "#24481f", "#4a7a34"];   // the forest's darker greens for the big edge plants
    const paddle = (x0, y0, len, ang, w, col) => {   // a broad leaf on a stem, with a pale midrib
      const ex = x0 + Math.sin(ang) * len, ey = y0 - Math.cos(ang) * len, mx = (x0 + ex) / 2, my = (y0 + ey) / 2, nx = Math.cos(ang) * w, ny = Math.sin(ang) * w;
      g.fillStyle = col; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx + nx, my + ny, ex, ey); g.quadraticCurveTo(mx - nx, my - ny, x0, y0); g.fill();
      g.strokeStyle = "rgba(220,235,180,.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(ex, ey); g.stroke();
    };
    cell(0, 128, () => {                                                                                                                                                 // heliconia: paddle leaves and a stalk of red bracts
      for (let i = 0; i < 5; i++) { const x = 64 + Q(-14, 14), a = Q(-0.7, 0.7), L = Q(60, 100); g.strokeStyle = dk[1]; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, 128); g.lineTo(x + Math.sin(a) * L * 0.35, 128 - L * 0.35); g.stroke();
        paddle(x + Math.sin(a) * L * 0.35, 128 - L * 0.35, L * 0.7, a, Q(11, 15), dk[i % 4]); }
      const sx = 64 + Q(-8, 8); g.strokeStyle = "#5a7a2a"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(sx, 128); g.lineTo(sx + 2, 22); g.stroke();
      for (let k = 0; k < 6; k++) { const y = 34 + k * 13, d = k % 2 ? 1 : -1, x = sx + 1;   // alternating boat-shaped bracts, red with yellow lips
        g.fillStyle = "#d8261c"; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + d * 16, y + 2, x + d * 21, y - 12); g.quadraticCurveTo(x + d * 8, y - 4, x, y - 6); g.fill();
        g.fillStyle = "#ffcf3a"; g.beginPath(); g.ellipse(x + d * 19, y - 10, 3, 1.6, d * -0.7, 0, 7); g.fill(); }
    });
    cell(128, 128, () => {                                                                                                                                               // bromeliad: a rosette of straps and a pink spike
      for (let i = 0; i < 16; i++) { const a = -1.35 + (i / 15) * 2.7 + Q(-0.08, 0.08), L = Q(46, 70) * (1 - 0.25 * Math.abs(a));
        g.strokeStyle = i % 3 ? dk[i % 4] : "#6e8a3a"; g.lineWidth = Q(6, 8); g.lineCap = "round"; g.beginPath(); g.moveTo(64, 124); g.quadraticCurveTo(64 + Math.sin(a) * L * 0.5, 124 - L * 0.7, 64 + Math.sin(a) * L * 1.05, 124 - L * 0.55 * Math.cos(a) - 8); g.stroke(); }
      g.fillStyle = "#e0306a"; g.beginPath(); g.moveTo(56, 100); g.quadraticCurveTo(64, 30, 72, 100); g.fill();
      g.fillStyle = "#ff7fa6"; for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(64 + (k % 2 ? 4 : -4), 52 + k * 7, 4, 2.2, k % 2 ? 0.6 : -0.6, 0, 7); g.fill(); }
      g.fillStyle = "#b2a0ff"; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(64 + (k % 2 ? 6 : -6), 56 + k * 10, 1.8, 0, 7); g.fill(); }
    });
    cell(256, 128, () => {                                                                                                                                               // a dark fern: arching fronds of small leaflets
      for (let f = 0; f < 7; f++) { const a = -1.1 + (f / 6) * 2.2 + Q(-0.1, 0.1), L = Q(80, 118), bend = a * 0.6;
        const pt = (t) => [64 + Math.sin(a) * L * t + Math.sin(bend) * L * 0.35 * t * t, 128 - Math.cos(a) * L * t + L * 0.45 * t * t * Math.abs(Math.sin(a))];
        g.strokeStyle = dk[2]; g.lineWidth = 1.6; g.beginPath(); for (let t = 0; t <= 1.001; t += 0.1) { const [x, y] = pt(t); t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
        g.fillStyle = dk[f % 4]; for (let t = 0.18; t < 0.98; t += 0.055) { const [x, y] = pt(t), [x2, y2] = pt(t + 0.02), d = Math.atan2(y2 - y, x2 - x), w = 11 * (1 - t) + 3;
          for (const s of [1, -1]) { g.beginPath(); g.ellipse(x + Math.cos(d + s * 1.3) * w * 0.5, y + Math.sin(d + s * 1.3) * w * 0.5, w * 0.55, 2.2, d + s * 1.3, 0, 7); g.fill(); } } }
    });
    cell(384, 128, () => {                                                                                                                                               // ground orchids: low leaves, arching stems of flowers
      for (let i = 0; i < 6; i++) paddle(64 + Q(-10, 10), 126, Q(26, 40), Q(-1.2, 1.2), 6, dk[i % 4]);
      const kinds = [["#f2b4ff", "#a640c8"], ["#ffffff", "#e050a0"], ["#ffd6e8", "#c83070"]];
      for (let st = 0; st < 3; st++) { const [pet, lip] = kinds[st], a = Q(-0.5, 0.5), L = Q(70, 100);
        const pt = (t) => [64 + Math.sin(a) * L * t + (a > 0 ? 1 : -1) * 22 * t * t, 128 - L * t + 18 * t * t];
        g.strokeStyle = "#5a7a2a"; g.lineWidth = 1.4; g.beginPath(); for (let t = 0; t <= 1.001; t += 0.1) { const [x, y] = pt(t); t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
        for (let t = 0.6; t <= 1.001; t += 0.13) { const [x, y] = pt(t);
          g.fillStyle = pet; for (let k = 0; k < 5; k++) { const b = (k / 5) * 6.28 - 1.57; g.beginPath(); g.ellipse(x + Math.cos(b) * 4.5, y + Math.sin(b) * 4.5, 4.2, 2.4, b, 0, 7); g.fill(); }
          g.fillStyle = lip; g.beginPath(); g.ellipse(x, y + 2.5, 2.6, 3.2, 0, 0, 7); g.fill(); } }
    });
  });

  // crossed quads, normals pointing up so the cards light like the ground they stand on
  const card = new THREE.BufferGeometry();
  const P = [], U = [], N = [], I = [];
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    const b = P.length / 3; P.push(-0.5 * ax, 0, -0.5 * az, 0.5 * ax, 0, 0.5 * az, 0.5 * ax, 1, 0.5 * az, -0.5 * ax, 1, -0.5 * az);
    U.push(0, 0, 1, 0, 1, 1, 0, 1); N.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  card.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); card.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); card.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3)); card.setIndex(I);

  // ---------------------------------------------------------------- where plants grow
  const k = fx > 1 ? 1.5 : fx ? 1 : 0.5;
  const inside = (x, z, pad) => blockers.some(([c, r]) => Math.hypot(x - c.x, z - c.z) < r * 0.85 + pad);
  const nearThing = (x, z) => Math.max(0, ...spots.map(([c, r]) => 1 - Math.abs(Math.hypot(x - c.x, z - c.z) - r - 0.25) / 0.45));   // hugging a prop's foot
  const patches = Array.from({ length: 7 }, () => { const a = R(0, 6.28), r = R(3.2, RC - 1); return [Math.cos(a) * r, Math.sin(a) * r, R(0.8, 1.5)]; });
  const flowerField = (x, z) => Math.max(0, ...patches.map(([px_, pz, pr]) => 1 - Math.hypot(x - px_, z - pz) / pr));
  // ground plants grow in clumps, not evenly sprinkled (review B6): small clump centres, and the odds rise near one
  const clumps = Array.from({ length: 46 }, () => { const a = R(0, 6.28), r = Math.sqrt(rnd()) * (RC + 0.4); return [Math.cos(a) * r, Math.sin(a) * r, R(0.35, 0.8)]; });
  const clump = (x, z) => 0.3 + 1.1 * Math.max(0, ...clumps.map(([cx, cz, cr]) => 1 - Math.hypot(x - cx, z - cz) / cr));
  const want = { 0: Math.round(650 * k), 1: Math.round(130 * k), 2: Math.round(170 * k), 3: Math.round(140 * k) };
  const pick = [];
  for (const type of [1, 2, 0, 3]) {
    let n = 0;
    for (let tries = 0; tries < want[type] * 40 && n < want[type]; tries++) {
      const a = R(0, 6.28), r = Math.sqrt(rnd()) * (RC + 0.6), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const dirt = sample(x, z, 0), lush = sample(x, z, 1), edge = sstep(RC - 2.5, RC, r), hug = nearThing(x, z);
      if (inside(x, z, type === 1 ? 0.1 : 0) || bare(x, z) || trackDist(x, z) < 1.1) continue;   // bare: kept clear, e.g. under the tent's planks
      let p;
      if (type === 0) p = ((0.18 + 0.7 * edge + 0.5 * hug + 0.3 * lush) * (1 - sstep(0.25, 0.5, dirt)) + 0.35 * sstep(0.15, 0.3, dirt) * (1 - sstep(0.3, 0.45, dirt))) * clump(x, z);   // and along path edges
      else if (type === 1) p = (0.9 * sstep(RC - 2, RC, r) + 0.7 * hug) * (1 - sstep(0.2, 0.35, dirt)) + 0.55 * sstep(0.04, 0.14, dirt) * (1 - sstep(0.24, 0.4, dirt));   // and the verges: nobody steps there
      else if (type === 2) p = (0.9 * flowerField(x, z) + 0.25 * hug + 0.12 * edge) * (1 - sstep(0.2, 0.35, dirt));
      else p = (0.25 + 0.4 * lush) * (1 - edge) * (1 - sstep(0.15, 0.3, dirt)) * clump(x, z);
      if (rnd() > p) continue;
      const size = type === 0 ? R(0.22, 0.42) * (1 + 0.4 * edge) : type === 1 ? R(0.55, 0.95) : type === 2 ? R(0.28, 0.45) : R(0.13, 0.22);
      pick.push([x, z, type, size]); n++;
    }
  }
  // the clearing's edge: clusters of heliconia, bromeliads and orchids among dark ferns, so the green rim has some colour in it;
  // more ferns alone around the rim frame the view (review B6)
  {
    const groups = [[4, 6, 6], [5, 7, 6], [4, 5, 6], [7, 6, 6], [4, 7, 5], [5, 6, 6]], nG = Math.round(9 * Math.min(k, 1.2));
    const ok = (x, z) => !inside(x, z, 0.15) && !bare(x, z) && trackDist(x, z) > 1.3;
    const SZ = { 4: [0.95, 1.4], 5: [0.38, 0.55], 6: [0.7, 1.15], 7: [0.42, 0.6] };
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < nG; tries++) {
      const a = R(0, 6.28), r = R(RC - 1.9, RC + 0.3), cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      if (!ok(cx, cz) || pick.some((p) => p[2] >= 4 && Math.hypot(p[0] - cx, p[1] - cz) < 2.2)) continue;
      const kinds = groups[placed % groups.length]; placed++;
      for (let i = 0; i < 6; i++) { const t = kinds[i % 3], b = R(0, 6.28), d = R(0, 0.75), x = cx + Math.cos(b) * d, z = cz + Math.sin(b) * d;
        if (ok(x, z)) pick.push([x, z, t, R(...SZ[t])]); }
    }
    for (let n = 0, tries = 0; tries < 2000 && n < Math.round(46 * k); tries++) {
      const a = R(0, 6.28), r = R(RC - 1.2, RC + 0.6), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (ok(x, z)) { pick.push([x, z, 6, R(0.75, 1.3)]); n++; }
    }
  }
  const im = new THREE.InstancedMesh(card, null, pick.length);
  const cellA = new Float32Array(pick.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  pick.forEach(([x, z, type, size], i) => {
    q.setFromAxisAngle(up, R(0, 6.28)); m4.compose(new THREE.Vector3(x, height(x, z), z), q, new THREE.Vector3(size * (type === 3 ? 1.6 : 1.1), size, size * (type === 3 ? 1.6 : 1.1))); im.setMatrixAt(i, m4);
    const dry = 1 - sample(x, z, 1); im.setColorAt(i, col.setRGB(1, 1, 1).lerp(new THREE.Color(1.15, 1.08, 0.75), type < 2 ? dry * 0.5 : 0).multiplyScalar(type === 6 ? R(0.6, 0.85) : R(0.8, 1.05)));
    if (noise) { im.getColorAt(i, col); im.setColorAt(i, macroTint(noise(x * 0.13 + 3.7, z * 0.13 - 1.2), col)); }   // the ground's big colour patches
    cellA[i] = type;
  });
  card.setAttribute("aCell", new THREE.InstancedBufferAttribute(cellA, 1));
  const pmat = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide });
  pmat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uNight = night; sh.uniforms.uShade = uShade; sh.uniforms.uR = { value: RR }; sh.uniforms.uGN = uGN; sh.uniforms.uGJ = uGJ; sh.uniforms.uGNon = uGNon; bindLight(sh);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime, uR; uniform sampler2D uShade, uGN, uGJ; attribute float aCell; varying float vShade; varying vec4 vGN; varying vec2 vGJ;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vMapUv * vec2(0.25, 0.5) + vec2(mod(aCell, 4.0) * 0.25, (1.0 - floor(aCell / 4.0)) * 0.5);")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        float w = sin(uTime * 1.6 + ip.x * 1.3 + ip.z * 1.7) + 0.4 * sin(uTime * 3.1 + ip.x * 3.0);
        transformed.xz += vec2(w * 0.06, w * 0.035) * position.y * position.y;
        vShade = texture2D(uShade, ip.xz / (2.0 * uR) + 0.5).r;
        vGN = pow(texture2D(uGN, ip.xz / (2.0 * uR) + 0.5), vec4(2.2));
        vGJ = pow(texture2D(uGJ, ip.xz / (2.0 * uR) + 0.5).rg, vec2(2.2));`);   // the plants take the ground's night light where they stand
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uNight, uGNon; varying float vShade; varying vec4 vGN; varying vec2 vGJ; vec3 albedoP;\n" + LIGHT_GLSL)
      .replace("#include <opaque_fragment>", LIGHT_MIX("albedoP", "(vGN * uGNon)", "(vGJ * uGNon)", "(uNight * uGNon)") + "\n#include <opaque_fragment>")
      .replace("#include <map_fragment>", "#include <map_fragment>\nalbedoP = diffuseColor.rgb;\ndiffuseColor.rgb *= mix(vec3(1.0), vec3(0.38, 0.42, 0.6), uNight) * (1.0 - vShade * (1.0 - 0.5 * uNight));").replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);");   // both sides lit like the ground, never black from behind
  };
  im.material = pmat; im.frustumCulled = false; scene.add(im);
  own.add(floor).add(im);
  const counts = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => pick.filter((p) => p[2] === t).length);
  // the baked map (props/shadow/bake_ground_shadow.py, Cycles: soft sun + sky occlusion) wins; the live render above is the fallback
  // for prop sets and jeeps that have no bake yet
  let shadowBaked = false;
  if (shadowMap) new THREE.TextureLoader().load(shadowMap, (t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 1;
    shadowBaked = true; uShade.value = t; uShadeK.value = 0.85; }, undefined, () => {});
  // the same darkening for a material drawn on the floor (the track and path ribbons): its world x, z looks up the shadow map
  function shadeOn(m) {
    patchMaterial(m, "shade", (sh) => {
      Object.assign(sh.uniforms, { uShadeT: uShade, uShadeK, uR: { value: RR }, uNight: night, uGNon });
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vSW;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vSW; uniform sampler2D uShadeT; uniform float uShadeK, uR, uNight, uGNon;")
        .replace("#include <opaque_fragment>", SHADE("vSW") + "\n#include <opaque_fragment>");
    });
    m.needsUpdate = true;
    return m;
  }
  let nightBaked = false;
  if (nightMap) loadLightMap(nightMap).then((t) => { t.anisotropy = 4;
    uGN.value = t; uGNon.value = 1; nightBaked = true; }).catch(() => {});
  uGJ.value = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); uGJ.value.needsUpdate = true;   // no jeep light until its map loads
  for (const [k, u] of [["P", uGDP], ["D", uGDD], ["B", uGDB]]) { u.value = uGJ.value;   // each door's spill at four openings
  }
  const cast = (renderer) => shadowBaked ? 0 : castShadows(renderer);
  const layout = { RR, RC, spots: used.map(([c, r]) => [c.x, c.z, r]), entry: entry ? [entry.x, entry.z] : null, track: trackPts.map((p) => [p.x, p.z]) };   // for props/ground/bake_ground.py
  return { floor, plants: im, shade, castShadows: cast, casters, isBaked: () => shadowBaked, isNightBaked: () => nightBaked, shadeOn, layout, tris: { floor: tris(geo), plants: pick.length * 4 }, counts: { tufts: counts[0], tall: counts[1], flowers: counts[2], clover: counts[3], heliconia: counts[4], bromeliad: counts[5], fern: counts[6], orchid: counts[7] } };
}
