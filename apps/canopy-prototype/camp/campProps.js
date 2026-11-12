// Canopy Camp props: the camp layout and blockers, the picked props with their baked light map (lnight), the lived-in props,
// the laundry line, the campfire and soup pot. Models come from props/ (Blender); their light is baked by props/bake_all.py.
import * as THREE from "three";
import { LIGHT_GLSL, LIGHT_MIX, bindLight, liveChunk } from "../bakedlight.js";
import "./forest.js";   // run after the module before it, as one script did
import { D, LIVED, PRE, PROPS, R, S, canvasTex, scene, sun, uTime } from "./core.js";
import { A0, HERO, RC, V, d0, flatCol, merge, t0, woodMat } from "./forest.js";

// ---------------------------------------------------------------- the camp: fire, logs, tent, hammock, lanterns, snack table
const camp = [], lanternGlow = [];
{
  // the layout: the log seats round the fire (the gap faces the gate), the tent, the hammock posts and the snack table
  const tentAt = d0.clone().multiplyScalar(-4.2).addScaledVector(t0, 2.4);
  const hA = d0.clone().multiplyScalar(-1.5).addScaledVector(t0, -4.6), hB = hA.clone().addScaledVector(d0, -2.6).addScaledVector(t0, -1.2);
  const tb = d0.clone().multiplyScalar(1.6).addScaledVector(t0, 3.2);
  // lantern string from the tent ridge across to the hammock post
  const l0 = tentAt.clone().multiplyScalar(1 - 1.12 / tentAt.length()).setY(2.8), l1 = hA.clone().setY(2.5);   // picked: tied to the walk-in tent's front A-frame
  for (let i = 1; i < 9; i++) { const t = i / 9, p = l0.clone().lerp(l1, t); p.y -= Math.sin(Math.PI * t) * 0.45; lanternGlow.push(p); }
  const str = []; for (let i = 0; i <= 20; i++) { const t = i / 20, p = l0.clone().lerp(l1, t); p.y -= Math.sin(Math.PI * t) * 0.45 - 0.06; str.push(p); }
  camp.push(flatCol(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(str), 24, 0.01, 3), 0x5a4636));
  scene.add(new THREE.Mesh(merge(camp), woodMat));
  window.__camp = { tentAt, hA, hB, tb, string: str };   // string: the lantern string's points (a sloth hangs from it)
  // collision circles for walking round the camp
  var blockers = [[V(0, 0, 0), 0.9], Object.assign([tentAt.clone().multiplyScalar(1 + 0.275 / tentAt.length()), 1.9], { tent: true }), [tb, 0.75], [hA, 0.3], [hB, 0.3], ...HERO.map((h) => [h, 1.4])];
  for (let i = 0; i < 3; i++) { const a = A0 + Math.PI + (i - 1) * 1.15; blockers.push([V(Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1), 0.75]); }
}
// lanterns and the fire: bright sprites, no real-time shadows; one warm point light for the fire glow
const glowTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,240,200,1)"); r.addColorStop(0.3, "rgba(255,200,120,.7)"); r.addColorStop(1, "rgba(255,160,80,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const lanterns = lanternGlow.map((p, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: [0xffd27a, 0xffa3c0, 0xfff1b0][i % 3], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); s.position.copy(p); s.scale.setScalar(0.32); scene.add(s); return s; });
const flames = [0, 1, 2].map((i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: [0xffb347, 0xff7a3d, 0xffe08a][i], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.position.set(0, 0.45 + i * 0.12, 0); scene.add(s); return s; });
const fireLight = new THREE.PointLight(0xff9a4a, D.fx ? 6 : 0, 7, 1.6); fireLight.position.set(0, 0.9, 0); scene.add(fireLight);

// sunbeams into the clearing and floating motes
if (S.rays && D.fx) {
  const tex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(255,240,200,0)"); gr.addColorStop(0.5, "rgba(255,240,200,1)"); gr.addColorStop(1, "rgba(255,240,200,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.2, "rgba(0,0,0,1)"); v.addColorStop(1, "rgba(0,0,0,0)"); g.globalCompositeOperation = "destination-in"; g.fillStyle = v; g.fillRect(0, 0, w, h); });
  var rayMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: S.rays, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  // the shafts slant down from the sun's side, all at the same angle like real morning light through a gap in the canopy (review B6)
  const sd = sun.position.clone().normalize(), up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion().setFromUnitVectors(up, sd);
  for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.PlaneGeometry(R(0.9, 2.4), 22), rayMat); const a = R(0, 6.28), d = R(0, RC - 3.5);
    r.quaternion.copy(tilt).multiply(new THREE.Quaternion().setFromAxisAngle(up, R(0, 3.14))); r.position.set(Math.cos(a) * d, 0, Math.sin(a) * d).addScaledVector(sd, 10); scene.add(r); }
}
let motes;
{
  const n = Math.round(S.motes * D.fx);
  if (n) {
    const p = new Float32Array(n * 3); for (let i = 0; i < n; i++) p.set([R(-RC, RC), R(0.5, 9), R(-RC, RC)], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    motes = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xfff3c0, size: 0.07, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(motes);
  }
}

// ================================================================ sloths: hanging under the low branches over the clearing
const SLOTH = await PRE.sloth;
// ---------------------------------------------------------------- the camp's baked light (props/camp/bake_camp_lightmap.py: the whole scene, ground and props,
// baked as one; Adriaen 2026-11-12). On each prop's second UV set (TEXCOORD_1):
//   camp_lm_<k>.png      one channel per light: fire, stove, lanterns, moon (bakedlight.js colours, flickers and mixes them)
//   camp_lm_sun_<k>.png  R where the sun reaches (scales the live sun), G sky occlusion (scales the live sky light)
// By day the props are lit live (sun and sky, shaded by the bake) plus a share of the warm lights; at night they show all four
// lights, baked, unlit, faded in with uNight. COLOR_0 alpha 0 marks faces that glow at night (lantern glass, the stove's fire).
// The lightMap slot (intensity 0) only gives the shader its sampler and UV; it adds no light. Light button: 2K or 1K (4K: ?lm=4k, local only).
const uNight = { value: 0 };
const [LMTEX, LMSUN] = await PRE.lm;   // loaded with everything else at the top (lmLoad)
// the seat tops and the tripod's bamboo are the only light-mapped parts painted as textures, and their paintings came out far
// lighter and more saturated than the vertex-coloured props round them (sawn wood about 202,165,118; bamboo 196,184,114),
// so they glowed by day and at night (camp review B2). Toned down here, not in the textures, so the bake needs nothing.
const SAWN = new THREE.Color().setRGB(0.74, 0.71, 0.68, THREE.SRGBColorSpace), BAMBOO = new THREE.Color().setRGB(0.72, 0.67, 0.6, THREE.SRGBColorSpace);   // about 150,117,80 and 141,123,68
const lnight = (mat) => {
  const prev = mat.onBeforeCompile;
  mat.lightMap = LMTEX; mat.lightMapIntensity = 0;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    bindLight(sh); sh.uniforms.uNight = uNight; sh.uniforms.uSun = { value: LMSUN };
    sh.fragmentShader = "uniform float uNight; uniform sampler2D uSun;\n" + LIGHT_GLSL + sh.fragmentShader
      .replace("#include <lights_fragment_begin>", liveChunk().replace("getDirectionalLightInfo( directionalLight, directLight );",
        "getDirectionalLightInfo( directionalLight, directLight );\ndirectLight.color *= sunT.r;"))   // the sun's baked shadow
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse *= 0.32 + 0.68 * sunT.g;")   // sky occlusion on the sky light only
      .replace("#include <color_fragment>", `#include <color_fragment>
  vec3 baseC = diffuseColor.rgb; vec4 lmQ = lmDecode(texture2D(lightMap, vLightMapUv)); vec4 sunT = texture2D(uSun, vLightMapUv);
  #ifdef USE_COLOR_ALPHA
  float glowK = 1.0 - vColor.a;
  #else
  float glowK = 0.0;
  #endif`)
      .replace("#include <opaque_fragment>", LIGHT_MIX("baseC", "lmQ", "lmDecode2(sunT.ba)", "uNight", "vec3(0.0)", true) + `
  outgoingLight = mix(outgoingLight, min(baseC * 1.15, vec3(1.0)), glowK * uNight);
#include <opaque_fragment>`);
  };
  // one program for every material whose shader code comes out the same (review P3: keyed by uuid, each compiled its own);
  // the hooks chained before and after this one (the laundry's swing) are part of the code, so their source is in the key
  const own = mat.onBeforeCompile;
  mat.customProgramCacheKey = () => ["lmap", prev ? prev.toString() : "", mat.onBeforeCompile === own ? "" : mat.onBeforeCompile.toString()].join("|");
  return mat;
};
{
  const P = await PRE.props, { tentAt, hA, hB, tb } = window.__camp;
  const lamL = lnight(new THREE.MeshLambertMaterial({ vertexColors: true }));
  P.scene.traverse((m) => { if (m.isMesh) m.material = lamL; });
  // the picked set holds each copy on its own (Seat_0, Lantern_3 ...), since each is lit where it stands
  const put = (n, x, z, yaw, y = 0, i = 0) => { const s = P.scene.getObjectByName(`${n}_${i}`) ?? P.scene.getObjectByName(n); if (!s) return null; const o = s.clone(); o.position.set(x, y, z); o.rotation.set(0, yaw, 0); scene.add(o); return o; };
  for (let i = 0; i < 3; i++) { const a = A0 + Math.PI + (i - 1) * 1.15; put("Seat", Math.cos(a) * 2.1, Math.sin(a) * 2.1, -a + Math.PI / 2, 0, i); }
  put("Tent", tentAt.x, tentAt.z, Math.atan2(-tentAt.x, -tentAt.z));
  const hm = hA.clone().add(hB).multiplyScalar(0.5), hd = hB.clone().sub(hA); put("Hammock", hm.x, hm.z, -Math.atan2(hd.z, hd.x));
  put("Table", tb.x, tb.z, 0.6);
  lanternGlow.forEach((p, i) => { put("Lantern", p.x, p.z, i, p.y + 0.02, i); lanterns[i].position.y -= 0.1; lanternGlow[i] = p.clone().setY(p.y - 0.1); });
}
// ---------------------------------------------------------------- lived-in props (props/lived/build_lived.py): a wood pile (its log stack one textured block) with a hatchet in its
// chopping stump on the jeep side of the fire, and a mug and an open book left on the seat you see first. Shown with the
// rustic seats (Our camp, Rustic); ?lived=0 hides them to compare.
if (LIVED) {
  const L = await PRE.lived, lm = lnight(new THREE.MeshLambertMaterial({ vertexColors: true }));
  L.scene.traverse((m) => { if (m.isMesh) m.material = m.material.map ? lnight(new THREE.MeshLambertMaterial({ map: m.material.map, ...(m.name.startsWith("SeatTop") && { polygonOffset: true, polygonOffsetFactor: -2, color: SAWN }) })) : lm; });   // the stack, loose logs and seat tops are textured
  const put = (n, x, z, yaw) => { const o = L.scene.getObjectByName(n).clone(); o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); scene.add(o); return o; };
  const wp = V(-0.55, 0, -3.15), wy = Math.atan2(-wp.x, -wp.z);
  put("WoodPile", wp.x, wp.z, wy); put("WoodStack", wp.x, wp.z, wy); put("LooseLogs", wp.x, wp.z, wy); var WOODPILE = wp;   // the activities take logs from here
  var WOOD_TEX; L.scene.getObjectByName("WoodStack").traverse((m) => { if (m.material?.map) WOOD_TEX = m.material.map; });   // and paint them like the stack
  const side = V(Math.cos(wy), 0, -Math.sin(wy));                     // the pile's local +X (where the stump stands) in the world
  blockers.push([wp, 0.55], [wp.clone().addScaledVector(side, 1.0), 0.35]);
  const a = A0 + Math.PI; put("SeatThings", Math.cos(a) * 2.1, Math.sin(a) * 2.1, -a + Math.PI / 2);
  if (PROPS === "picked") { const t = window.__camp.tentAt, ty = Math.atan2(-t.x, -t.z); put("TentSide", t.x, t.z, ty); put("MatRoll", t.x, t.z, ty); }   // wellies and the rolled mat on the planks by the door (tent frame)
  { const k = V(4.55, 0, 1.7), ky = Math.atan2(-k.x, -k.z); put("KitchenCrate", k.x, k.z, ky); put("KitchenThings", k.x, k.z, ky); blockers.push([k, 0.35]); }   // the kitchen crate beside the snack table, its front to the fire
  for (let i = 0; i < 3; i++) { const b = A0 + Math.PI + (i - 1) * 1.15; put(L.scene.getObjectByName(`SeatTop_${i}`) ? `SeatTop_${i}` : "SeatTop", Math.cos(b) * 2.1, Math.sin(b) * 2.1, -b + Math.PI / 2); }   // the sawn top on each seat
}
// ---------------------------------------------------------------- the laundry line (props/lived/build_laundry.py): two forked sticks east of the fire,
// between the snack table and the tent, with a towel and three sloth socks pegged on it (textured quads, about 110 triangles).
// The gap on the line at hang (window.__laundry) is kept free for a sloth to hang from. Shown with the lived-in props.
if (LIVED) {
  const LD = await PRE.laundry, A = V(1.3, 0, 4.3), B = V(4.0, 0, 3.0), mid = A.clone().lerp(B, 0.5), yaw = Math.atan2(-(B.z - A.z), B.x - A.x);
  LD.scene.traverse((m) => { if (m.isMesh) m.material = lnight(m.material.map ? new THREE.MeshLambertMaterial({ map: m.material.map, alphaTest: 0.5, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ vertexColors: true })); });
  const o = LD.scene; o.position.copy(mid); o.rotation.y = yaw; scene.add(o);
  const dir = B.clone().sub(A).normalize(), L = 3.0, t = 0.42;   // the line is 3 m post to post (A, B are where it's tied, roughly)
  blockers.push([mid.clone().addScaledVector(dir, -L / 2), 0.25], [mid.clone().addScaledVector(dir, L / 2), 0.25]);
  window.__laundry = { a: mid.clone().addScaledVector(dir, -L / 2).setY(1.62), b: mid.clone().addScaledVector(dir, L / 2).setY(1.62), sag: 0.13,
    hang: mid.clone().addScaledVector(dir, -L / 2 + L * t).setY(1.62 - 0.13 * 4 * t * (1 - t)), dir };
}
// ---------------------------------------------------------------- the campfire and soup pot (props/lived/build_fire.py), picked 2026-11-11:
// a teepee fire in a ring of sooty stones under the bamboo tripod, and an open iron pot of soup hanging on a chain (one
// textured quad per link). The flames are three crossed cards with an animated flame shader instead of the old glow blobs;
// the embers are unlit so they glow. (The first fire, rough rocks and split logs under a kettle, is archived with the rustic set.)
var FIRE_CARDS = [];
{
  const F = await PRE.fire, fm = lnight(new THREE.MeshLambertMaterial({ vertexColors: true })), glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  flames.forEach((f) => (f.visible = false));
  fireLight.position.y = 0.4;                                    // inside the fire, below the pot (it hangs higher than the old kettle)
  for (const n of ["Ring", "Tripod", "TripodLegs", "Fire", "Embers", "Pot", "Chain"]) {
    const o = F.scene.getObjectByName(n); if (!o) continue;
    o.traverse((m) => { if (!m.isMesh) return;
      m.material = n === "Embers" ? glow : n === "Chain" ? lnight(new THREE.MeshLambertMaterial({ map: m.material.map, alphaTest: 0.5, side: THREE.DoubleSide }))
        : n === "TripodLegs" ? lnight(new THREE.MeshLambertMaterial({ map: m.material.map, color: BAMBOO })) : fm; });   // the legs: one tube each, nodes in the texture
    scene.add(o);
  }
  var SOUP_POT = { at: V(0, 0.885, 0), r: 0.147 };              // the soup's surface; atmosphere.js lets steam rise off all of it
  const H = 0.8, flameMat = (ph) => new THREE.ShaderMaterial({
    uniforms: { uTime, uPh: { value: ph } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime, uPh; varying vec2 vUv;
      void main() {
        float v = vUv.y, t = uTime * (1.0 + 0.15 * uPh) + uPh * 4.0;
        float x = vUv.x - 0.5;
        x += (sin(v * 9.0 - t * 7.0) * 0.05 + sin(v * 17.0 - t * 11.0 + 1.3) * 0.025) * v;          // the flame sways more toward its tip
        float tongues = 0.75 + 0.25 * sin(vUv.x * 23.0 + t * 3.0) * sin(vUv.x * 9.0 - t * 2.0);
        float w = 0.42 * pow(max(0.0, 1.0 - v / tongues), 0.75);                                      // wide at the base, tapering up
        float a = smoothstep(w, w * 0.35, abs(x)) * smoothstep(0.0, 0.08, v);
        vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.62, 0.15), smoothstep(w, w * 0.4, abs(x)));
        c = mix(c, vec3(1.0, 0.92, 0.6), smoothstep(0.5, 1.0, 1.0 - v) * smoothstep(w * 0.5, 0.0, abs(x)));
        gl_FragColor = vec4(c * a * 1.5, a);
      }` });
  for (let k = 0; k < 3; k++) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.7, H).translate(0, H / 2 + 0.03, 0), flameMat(k));
    card.rotation.y = k * Math.PI / 3; card.renderOrder = 3; scene.add(card); FIRE_CARDS.push(card);   // the activities flare these
  }
}
// light pools on the ground at night: one painted quad (2 triangles) under the fire and the lantern string, faded in as you rest
const pools = (() => {
  const pts = [[0, 0, 3.4, 0.9, "255,140,60"], ...lanternGlow.map((p) => [p.x, p.z, 1.4, 0.4, "255,200,120"])];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z, r] of pts) { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); }
  const S = Math.max(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const tex = canvasTex(256, 256, (g, w) => {
    for (const [x, z, r, k, c] of pts) {
      const u = (x - cx + S / 2) / S * w, v = (z - cz + S / 2) / S * w, gr = g.createRadialGradient(u, v, 0, u, v, r / S * w);
      gr.addColorStop(0, `rgba(${c},${k})`); gr.addColorStop(0.45, `rgba(${c},${k * 0.4})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.globalCompositeOperation = "lighter"; g.fillStyle = gr; g.fillRect(0, 0, w, w);
    }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.position.set(cx, 0.03, cz); m.visible = false; scene.add(m); return m;
})();

export { FIRE_CARDS, SLOTH, SOUP_POT, WOODPILE, WOOD_TEX, blockers, fireLight, flames, glowTex, lanternGlow, lanterns, motes, pools, rayMat, uNight };
