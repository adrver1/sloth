// Summit Cabin terrain: clipmap rings round the player, each twice as coarse as the one inside, cut in eight slices that are
// drawn only when in view (cullTerrain); the far rings beyond 1 km are drawn only into the backdrop (layer 2). updateTerrain(x, z) each frame.
import * as THREE from 'three';
import { TOP, forestAt, height, isPhone, mulberry, onIce, sstep, trailDist, vnoise } from './land.js';
import { camera, canvasTex, hazed, me, scene } from './core.js';

// ---------------------------------------------------------------- terrain: square rings round the player, each twice as coarse
// Ten rings of 64 × 64 cells (48 on phones): 2 m cells round your feet, 1 km cells at 20 km. Each ring snaps to its own grid as you walk.
// Geomorphing hides the joins: every vertex also stores the height, normal and colour the next coarser ring would give it, and
// the vertex shader slides toward those values over the outer part of each ring, so at its edge a ring already looks exactly
// like the next one and nothing pops as rings move.
export const snowC = new THREE.Color('#fbf7f0'), rockC = new THREE.Color('#4b4b4f'), shadeC = new THREE.Color('#a9b3c9'), iceC = new THREE.Color('#93a9bb'), trailC = new THREE.Color('#e8dfd4'), tmpC = new THREE.Color(), rockV = new THREE.Color();
const snowTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); const r = mulberry(7);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(206,218,234,${0.04 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 50, 3 + r() * 6, 0.2, 0, 7); g.fill(); }
  for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(r() * w, r() * h, 1, 1); } }, true);
// Far forest: the ground takes the colour the tree cards would give it there. How much of the ground the trees hide depends on
// how flat you look across it (cotangent of the view angle): looking down from the summit you see snow between the trees, looking
// across a far slope you see a wall of trees. uTreeCol and uTreeK (cover per unit cotangent) are measured from the card itself.
export const uTreeCol = { value: new THREE.Color('#33463c') }, uTreeK = { value: 0.2 }, NEAR = isPhone ? 85 : 110, CARD_R = isPhone ? 700 : 850, uCardR = { value: CARD_R };
// three's ACES filmic curve (as the renderer applies on screen, exposure 1.05), for the backdrop's textures, which get none
const BAKE_ACES = `vec3 bakeRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 bakeACES(vec3 c) { const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602)); c *= 1.05 / 0.6; return clamp(O * bakeRRT(I * c), 0.0, 1.0); }\n`;
const morph = (half, far) => (sh) => {
  sh.uniforms.uHalf = half; sh.uniforms.uClipR = uClipR; sh.uniforms.uTreeCol = uTreeCol; sh.uniforms.uTreeK = uTreeK; sh.uniforms.uCardR = uCardR;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float hc; attribute vec3 nc; attribute vec3 cc; attribute float fm; uniform float uHalf, uTreeK, uCardR; varying float vForest; varying vec2 vWxz; varying vec3 vRk;')
    .replace('#include <color_vertex>', `vec2 mq = abs(position.xz - cameraPosition.xz); float mph = clamp((max(mq.x, mq.y) - 0.55 * uHalf) / (0.3 * uHalf), 0.0, 1.0);
      vColor = vec4(mix(color.rgb, cc, mph), 1.0);
      vec3 vd = cameraPosition - position; float fd = length(vd.xz); vd = normalize(vd);
      float cover = 1.0 - exp(-uTreeK * fm * length(vd.xz) / max(dot(vd, normalize(mix(normal, nc, mph))), 0.04));
      vForest = cover * smoothstep(0.8 * uCardR, uCardR, fd); vWxz = position.xz;`)   // only where the cards fade out (placeThings)
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mix(normal, nc, mph));')
    .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, mix(position.y, hc, mph), position.z); vec2 fh = normalize(vec2(-objectNormal.z, objectNormal.x) + 1e-4); vRk = vec3(dot(position.xz, fh), transformed.y, 1.0 - objectNormal.y);');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uTreeCol; uniform float uClipR; varying float vForest; varying vec2 vWxz; varying vec3 vRk;
${far ? BAKE_ACES : ''}float tn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5),
  c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }`)
    // the painted forest is dappled like treetops (dark crowns, snowy gaps), fading to its plain average where it gets too small to see
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  ${far ? 'if (length(vWxz - cameraPosition.xz) < uClipR - 30.0) discard;' : 'if (length(vWxz - cameraPosition.xz) > uClipR) discard;'}`)
    // the far rings are only ever drawn into the backdrop's textures, where three applies no tone mapping or sRGB: do both here,
    // before the haze, exactly as on screen, so the painted land matches the real land at the seam
    .replace('#include <fog_fragment>', far ? 'gl_FragColor.rgb = sRGBTransferOETF(vec4(bakeACES(gl_FragColor.rgb), 1.0)).rgb;\n' + THREE.ShaderChunk.fog_fragment.replaceAll('linearToOutputTexel', 'sRGBTransferOETF') : '#include <fog_fragment>')   // real ground ends at uClipR; the painted backdrop starts a little inside it
    .replace('#include <color_fragment>', `#include <color_fragment>
  float px = length(fwidth(vWxz)), dap = (tn(vWxz / 9.0) * 0.65 + tn(vWxz / 31.0) * 0.35 - 0.5) * (1.0 - smoothstep(4.0, 14.0, px));
  diffuseColor.rgb = mix(diffuseColor.rgb, uTreeCol * (1.0 - 0.9 * dap), clamp(vForest * (1.0 + 1.4 * dap), 0.0, 1.0));
  // steep faces get painted rock: strata across the face, cracks down it, snow caught on the ledges (projected onto the face itself)
  { float st = smoothstep(0.42, 0.7, vRk.z), far = 1.0 - smoothstep(1.5, 8.0, px); vec2 rp = vRk.xy;
    float strata = tn(vec2(rp.x / 9.0, rp.y / 2.4)) * 0.6 + tn(rp / 2.0) * 0.4, crack = smoothstep(0.25, 0.55, tn(vec2(rp.x / 2.2, rp.y / 16.0)));
    float ledge = smoothstep(0.68, 0.74, tn(vec2(rp.x / 23.0, rp.y / 4.5)) * 0.85 + 0.15 * tn(rp / 1.7)) * smoothstep(0.85, 0.6, vRk.z);
    vec3 rock = vec3(0.11, 0.11, 0.12) * mix(1.0, (0.7 + 0.55 * strata) * (0.75 + 0.35 * crack), far);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(rock, vec3(0.85, 0.86, 0.9), ledge * 0.8), st); }`);
};
// every tree is drawn (near model or card) out to 80% of CARD_R; over the last 20% the cards dither out as the painted forest fades in, so the forest's tone stays the same
// trees per cell × mean size² / 100 at forest density f, matching tile(): old forest is denser and taller
const treeCover = (f) => Math.min(1, 1.1 * f) * (0.75 + 0.5 * f) ** 2 * (49 + 56 + 64 / 3) / 100;
// Only the rings out to CLIP_R (1 km) are real, moving with you; the far rings are built once round the play area and only
// painted into the backdrop (below), which draws them as eight flat panels.
const CLIP_R = 1000, uClipR = { value: CLIP_R };
export const LEVELS = 10, SLICES = 8, NC = isPhone ? 48 : 64, REAL = isPhone ? 6 : 5, NV = NC + 1, NB = NV + 2, levels = [], terrainMats = [];
// rebuild: the ring itself moved, so its vertices change. Heights, colours and tree cover of the vertices it still shares with
// where it was are copied over (a ring moves 2 cells at a time, so most are), and only the new rows and columns are worked out.
// Without rebuild only the hole for the finer ring is cut again (the ring inside moved), which is cheap.
export function updateLevel(lv, rebuild = true) {
  const { c, g, hb } = lv, half = (NC / 2) * c, x0 = lv.cx - half, z0 = lv.cz - half, H = (i, j) => hb[(j + 1) * NB + i + 1];
  const A = g.attributes, pos = A.position.array, nor = A.normal.array, col = A.color.array, uv = A.uv.array, hc = A.hc.array, nc = A.nc.array, cc = A.cc.array, fm = A.fm.array;
  if (rebuild) {
  const di = Number.isFinite(lv.bx) ? Math.round((x0 - lv.bx) / c) : NB, dj = Number.isFinite(lv.bz) ? Math.round((z0 - lv.bz) / c) : NB; lv.bx = x0; lv.bz = z0;
  const oldH = hb.slice(), oldC = col.slice(), oldF = fm.slice();
  for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) { const oi = i + di, oj = j + dj; hb[j * NB + i] = oi >= 0 && oi < NB && oj >= 0 && oj < NB ? oldH[oj * NB + oi] : height(x0 + (i - 1) * c, z0 + (j - 1) * c); }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const k = j * NV + i, x = x0 + i * c, z = z0 + j * c, h = H(i, j);
    let nx = H(i - 1, j) - H(i + 1, j), ny = 2 * c, nz = H(i, j - 1) - H(i, j + 1); const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz; uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
    { const oi = i + di, oj = j + dj; if (oi >= 0 && oi < NV && oj >= 0 && oj < NV) { const o = oj * NV + oi; col[k * 3] = oldC[o * 3]; col[k * 3 + 1] = oldC[o * 3 + 1]; col[k * 3 + 2] = oldC[o * 3 + 2]; fm[k] = oldF[o]; continue; } }
    const s = 1 - ny, ice = onIce(x, z, h), f = ice ? 0 : forestAt(x, z, h, s);
    if (ice) tmpC.copy(iceC).lerp(snowC, sstep(0.45, 0.75, vnoise(x / 160 + z / 400, z / 45)) * 0.75);   // blue-grey ice with wind-blown snow streaks
    else { rockV.copy(rockC).multiplyScalar(0.62 + 0.7 * vnoise(x / 11 + z / 17, h / 5));   // rock in bands and streaks, not one flat colour
      const ledge = sstep(0.5, 0.68, vnoise(h / 9 + x / 70, (x - z) / 45)) * (1 - sstep(0.55, 0.8, s));   // snow caught on ledges and in gullies
      tmpC.copy(snowC).lerp(rockV, Math.min(1, sstep(0.24, 0.45, s) * (0.6 + 0.4 * vnoise(x / 90, z / 90)) + sstep(TOP + 250, TOP + 800, h) * sstep(0.1, 0.28, s) * (0.3 + 0.5 * vnoise(x / 160 + 4, z / 60))) * (1 - ledge)).lerp(shadeC, 0.55 * f);   // rock on steep faces and high ribs; trodden, shaded snow under the trees
      if (c <= 8) tmpC.lerp(trailC, 1 - sstep(1.2, 2.4, trailDist(x, z))); }
    col[k * 3] = tmpC.r; col[k * 3 + 1] = tmpC.g; col[k * 3 + 2] = tmpC.b; fm[k] = treeCover(f);
  }
  // what the next coarser ring would show at each vertex: even vertices are its own; odd ones lie on its edges or its diagonal
  // (cells split from (i+1, j) to (i, j+1), as the index below), so they take the mean of the two ends
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const k = j * NV + i, oi = i & 1, oj = j & 1;
    const pair = oi && oj ? [(j - 1) * NV + i + 1, (j + 1) * NV + i - 1] : oi ? [k - 1, k + 1] : oj ? [k - NV, k + NV] : [k, k];
    const [a, b] = pair; hc[k] = (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2;
    for (let e = 0; e < 3; e++) { nc[k * 3 + e] = (nor[a * 3 + e] + nor[b * 3 + e]) / 2; cc[k * 3 + e] = (col[a * 3 + e] + col[b * 3 + e]) / 2; }
  }
  for (const a of Object.keys(A)) A[a].needsUpdate = true;
  }
  // cells inside the finer ring are left out
  const inner = lv.L && lv.L !== REAL ? levels[lv.L - 1] : null, ih = inner ? (NC / 2) * inner.c : 0, ns = lv.parts.map(() => 0); lv.tris = 0;
  for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
    const ax = x0 + i * c, az = z0 + j * c; if (inner && ax >= inner.cx - ih && ax + c <= inner.cx + ih && az >= inner.cz - ih && az + c <= inner.cz + ih) continue;
    const sl = Math.max(Math.abs(ax + c / 2 - lv.cx), Math.abs(az + c / 2 - lv.cz)) < 10 ? SLICES : Math.floor(((Math.atan2(az + c / 2 - lv.cz, ax + c / 2 - lv.cx) / (2 * Math.PI) + 1) % 1) * SLICES) % SLICES, idx = lv.parts[sl].index.array;   // which slice round the ring's centre
    const a = j * NV + i, b = a + 1, cc2 = a + NV, d = cc2 + 1; let n = ns[sl]; idx[n++] = a; idx[n++] = cc2; idx[n++] = b; idx[n++] = b; idx[n++] = cc2; idx[n++] = d; ns[sl] = n;
  }
  lv.parts.forEach((pg, k) => { pg.setDrawRange(0, ns[k]); pg.index.needsUpdate = true; lv.tris += ns[k] / 3; });
}
// show only the slices that can be in view: the ground right round your feet always, the rest when their 45°
// wedge overlaps the view's width plus a margin; looking steeply down shows the near rings whole
export function cullTerrain() {
  const fwd = Math.atan2(-Math.cos(me.yaw), -Math.sin(me.yaw)), hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect), reach = hf + Math.PI / SLICES + 0.08 + 0.5 * Math.abs(me.pitch);
  for (const lv of levels) if (lv.L < REAL) lv.parts.forEach((pg, k) => { const mid = ((k + 0.5) / SLICES) * 2 * Math.PI, d = Math.abs(((mid - fwd + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    pg.userData.mesh.visible = k === SLICES || (me.pitch < -0.7 && lv.L < 4) || d < reach + (lv.L === 0 ? 0.3 : lv.L === 1 ? 0.1 : 0); });   // the last part is the ground within 10 m of your feet, always drawn
}
export function updateTerrain(px, pz) {   // fine to coarse, since each ring cuts its hole from the one inside it
  let changed = false;
  for (const lv of levels) { if (lv.L >= REAL) break; const s = 2 * lv.c, cx = Math.round(px / s) * s, cz = Math.round(pz / s) * s; const moved = cx !== lv.cx || cz !== lv.cz; if (changed || moved) { lv.cx = cx; lv.cz = cz; updateLevel(lv, moved); changed = true; } }
  return changed;
}

export function buildTerrain() {
  for (let L = 0; L < LEVELS; L++) {
    const g = new THREE.BufferGeometry(), c = 2 ** (L + 1), half = { value: (NC / 2) * c };
    for (const [name, n] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2], ['hc', 1], ['nc', 3], ['cc', 3], ['fm', 1]]) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(NV * NV * n), n));
    const mat = hazed(new THREE.MeshLambertMaterial({ vertexColors: true, map: snowTex }), morph(half, L >= REAL), L >= REAL ? 'far' : 'near'); terrainMats.push(mat);
    // each ring is drawn as eight 45° slices round you sharing its vertices; cullTerrain() hides the slices outside your view
    const parts = [...Array(SLICES + 1)].map(() => { const pg = new THREE.BufferGeometry(); for (const k in g.attributes) pg.setAttribute(k, g.attributes[k]); pg.setIndex(new THREE.BufferAttribute(new Uint16Array((NC * NC * 6) / 4), 1));
      const mesh = new THREE.Mesh(pg, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; if (L >= REAL) mesh.layers.set(2); scene.add(mesh); pg.userData.mesh = mesh; return pg; });
    levels.push({ L, c, g, parts, cx: NaN, cz: NaN, hb: new Float32Array(NB * NB), tris: 0 });
  }
  { const P0 = { x: 95, z: 44 }; for (const lv of levels) if (lv.L >= REAL) { const s2 = 2 * lv.c; lv.cx = Math.round(P0.x / s2) * s2; lv.cz = Math.round(P0.z / s2) * s2; updateLevel(lv); } }   // the far rings, once
}
