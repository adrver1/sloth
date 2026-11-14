// Canopy Camp props: the camp's blockers (the layout itself is layout.js), the picked props with their baked light map (lnight), the lived-in props,
// the laundry line, the campfire and soup pot. Models come from props/ (Blender); their light is baked by props/bake_all.py.
// main.js calls its three step functions each frame: fireStep (the fire's flicker), poolsStep (the light pools on the ground
// at night) and motesStep (the drifting motes). Exports those, CAMP, the blockers (the list, read only:
// addBlocker({ at, r, walk, wild, tag }) adds one, dropBlockers(tag) takes a tag's out again; see the block above them) and the props' parts
// other modules use (FIRE_CARDS, fireLight, glowTex, LANTERNS, and WOODPILE, WOOD_TEX and rayMat, which stay null when their part is
// not built: ?lived=0, no sunbeams), and buildProps() (main.js, once), which builds them all. The sloth model is in sloth/state.js and
// uNight in core.js (R2-129).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LIGHT_GLSL, LIGHT_MIX, bindLight, liveChunk } from "../bakedlight.js";
import { D, LIVED, PRE, rng, S, scene, sun, uNight, uTime } from "./core.js";
const { R } = rng("props");
import { V, canvasTex, patchMaterial, swap } from "./util.js";
import { CRATE, HAMMOCK, HERO, LANTERN_TIES, LAUNDRY, RC, SEATS, TABLE, TENT, WOOD_PILE } from "./layout.js";
import { lanternLayout, createLanterns } from "./lanterns.js";

// ---------------------------------------------------------------- the camp: fire, logs, tent, hammock, lanterns, snack table
// the layout (layout.js): the log seats round the fire (the gap faces the gate), the tent, the hammock posts, the snack table
// and the lantern strings (lanterns.js, review B3, Adriaen 2026-11-12): a V from the tent's front A-frame and the hammock's
// near post up to the big tree behind the fire
const LANTERN_LAYOUT = lanternLayout(LANTERN_TIES);
// CAMP: the camp layout in the names operator.js, audio.js and radio.js know, built from layout.js's own vectors (the same objects, no
// copies). (It also carried the lantern strings' points, which nothing read: review props-08.)
const CAMP = { tentAt: TENT.at, hA: HAMMOCK.a, hB: HAMMOCK.b, tb: TABLE.at };
// blockers: the circles that keep plants, props and characters apart (review R2-038). Each is an object made by addBlocker:
//   at     its centre (a Vector3; only x and z count), r its radius in metres
//   walk   optional tighter shape for walking (player.js): { r } a smaller circle, or { a, b, r } a capsule from a to b. The fire
//          ring stops you at its stones, and each log seat is a thin capsule along the log, so there is a ring to walk round the
//          fire between them (Adriaen 2026-11-13: the old circles walled the fire in)
//   wild   true for the deadwood and the glade's props: plants grow round them but no worn dirt or path leads to them (ground.js)
//   tag    optional name, so a module can take its blockers out again (dropBlockers: the tent's one circle, tentInside.js)
// Who adds them, in main.js's build order: this file (the fixed camp, then buildProps), jeep.js, deadwood.js, glade.js, then the
// ground (campGround.js createGround) paints its worn dirt, paths and plants round the list as it stands at that moment; only
// after that do tentInside.js (the tent's walls) and the chores (the wood stand, through chores.js) add theirs. Readers: player.js,
// nav.js (the sloths' grid, made again when the list's length changes), operator/walk.js, operator/places.js, operator/buddy.js,
// deadwood.js and ground.js.
const blockers = [];
function addBlocker({ at, r, walk = null, wild = false, tag = null }) { const b = { at, r, walk, wild, tag }; blockers.push(b); return b; }
function dropBlockers(tag) { for (let i = blockers.length - 1; i >= 0; i--) if (blockers[i].tag === tag) blockers.splice(i, 1); }
addBlocker({ at: V(0, 0, 0), r: 0.9, walk: { r: 0.75 } });   // the fire
addBlocker({ at: TENT.at.clone().multiplyScalar(1 + 0.275 / TENT.at.length()), r: 1.9, tag: "tent" });   // the whole tent, until tentInside.js puts in its walls
addBlocker({ at: TABLE.at, r: 0.75 }); addBlocker({ at: HAMMOCK.a, r: 0.3 }); addBlocker({ at: HAMMOCK.b, r: 0.3 });
for (const h of HERO) addBlocker({ at: h.at, r: 1.4 });
for (const { angle: a, at: c } of SEATS) { const t = V(-Math.sin(a), 0, Math.cos(a));
  addBlocker({ at: c, r: 0.75, walk: { a: c.clone().addScaledVector(t, -0.6), b: c.clone().addScaledVector(t, 0.6), r: 0.25 } }); }   // build_camp.py rustic seat: a 1.5 m half log, 0.5 m deep
// put(root, name, x, z, yaw, y): a copy of the object of that name in a loaded model (name: one name, or a list tried in order)
// stood at x, z (and y), turned to yaw, added to the scene; null when the model has none of those names
function put(root, name, x, z, yaw, y = 0) {
  const s = [name].flat().map((n) => root.getObjectByName(n)).find(Boolean); if (!s) return null;
  const o = s.clone(); o.position.set(x, y, z); o.rotation.set(0, yaw, 0); scene.add(o); return o;
}
const FIRE_CARDS = [];   // the fire's flame cards (the activities flare them)
let glowTex, LANTERNS, fireLight, motes, pools, LMTEX, LMSUN;   // set by buildProps
let rayMat = null, WOODPILE = null, WOOD_TEX = null;   // set by buildProps when it builds their part (the sunbeams, the lived-in props)

// ---------------------------------------------------------------- the camp's baked light (props/camp/bake_camp_lightmap.py: the whole scene, ground and props,
// baked as one; Adriaen 2026-11-12). This is the one description of the bake's outputs, which the bake's header and bakedlight.js
// point to. Every light channel holds that light in white as light / 4, gamma 2.2, in models/camp_lights.json's "channels" order
// (fire, stove, lanterns, moon), with the colours there too. On each prop's second UV set (TEXCOORD_1):
//   camp_lm_<k>.png      RGBA: fire, stove, lanterns, moon (+ night sky) (bakedlight.js colours, flickers and mixes them)
//   camp_lm_sun_<k>.png  R where the sun reaches (scales the live sun), G sky occlusion (scales the live sky light); B, A unused
// and on the ground, looked up by position (row 0 = page z -RR, column 0 = x -RR; ground.js):
//   camp_ground_night_picked_<jeep>.png  RGBA: the same four lights as camp_lm, with every prop's shadow in them
//   camp_shadow_picked_<jeep>.png        L: the day shadow, 1 - light / open ground (sun and sky)
// <k> is 4k, 2k or 1k; each map also ships as <map>.ktx2.txt (props/bake_all.py --only ktx), the PNG staying as the fallback.
// By day the props are lit live (sun and sky, shaded by the bake) plus a share of the warm lights; at night they show all four
// lights, baked, unlit, faded in with uNight. COLOR_0 alpha 0 marks faces that glow at night (lantern glass, the stove's fire).
// The lightMap slot only gives the shader its sampler and UV: three's own light-map read (lights_fragment_maps, whose envmap part
// these Lambert materials do not use) is cut out, so each pixel reads the map once, as lmQ (R2-096). Light button: 2K or 1K (4K: ?lm=4k, local only).
// the seat tops and the tripod's bamboo are the only light-mapped parts painted as textures, and their paintings came out far
// lighter and more saturated than the vertex-coloured props round them (sawn wood about 202,165,118; bamboo 196,184,114),
// so they glowed by day and at night (camp review B2). Toned down here, not in the textures, so the bake needs nothing.
const SAWN = new THREE.Color().setRGB(0.74, 0.71, 0.68, THREE.SRGBColorSpace), BAMBOO = new THREE.Color().setRGB(0.72, 0.67, 0.6, THREE.SRGBColorSpace);   // about 150,117,80 and 141,123,68
// one program for every material whose shader code comes out the same (review P3: keyed by uuid, each compiled its own);
// the hooks chained before and after this one (the laundry's swing) are part of the code, so their source is in the key (patchMaterial)
const lnight = (mat) => {
  mat.lightMap = LMTEX; mat.lightMapIntensity = 0;
  return patchMaterial(mat, "lmap", (sh) => {
    bindLight(sh); sh.uniforms.uNight = uNight; sh.uniforms.uSun = { value: LMSUN };
    sh.fragmentShader = "uniform float uNight; uniform sampler2D uSun;\n" + LIGHT_GLSL + swap(sh.fragmentShader,
      ["#include <lights_fragment_begin>", swap(liveChunk(), ["getDirectionalLightInfo( directionalLight, directLight );", "getDirectionalLightInfo( directionalLight, directLight );\ndirectLight.color *= sunT.r;"])],   // the sun's baked shadow
      ["#include <lights_fragment_maps>", ""],   // three's second read of the same texel, which intensity 0 threw away (R2-096)
      ["#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse *= 0.32 + 0.68 * sunT.g;"],   // sky occlusion on the sky light only
      ["#include <color_fragment>", `#include <color_fragment>
  vec3 baseC = diffuseColor.rgb; vec4 lmQ = lmDecode(texture2D(lightMap, vLightMapUv)); vec4 sunT = texture2D(uSun, vLightMapUv);
  #ifdef USE_COLOR_ALPHA
  float glowK = 1.0 - vColor.a;
  #else
  float glowK = 0.0;
  #endif`],
      ["#include <opaque_fragment>", LIGHT_MIX("baseC", "lmQ", "lmDecode2(sunT.ba)", "uNight", "vec3(0.0)", true) + `
  outgoingLight = mix(outgoingLight, min(baseC * 1.15, vec3(1.0)), glowK * uNight);
#include <opaque_fragment>`]);
  });
};
// buildProps (main.js, once, after the forest): the lanterns, the fire's light, the sunbeams and motes, then (once their downloads are
// in) the picked props, the lived-in props, the laundry line, the campfire and the night's light pools
async function buildProps() {
  // the lanterns (lanterns.js: a glow sprite round each jar) and the fire (its flame cards and glowing embers, below): no real-time
  // shadows; one warm point light for the fire's glow
  glowTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,240,200,1)"); r.addColorStop(0.3, "rgba(255,200,120,.7)"); r.addColorStop(1, "rgba(255,160,80,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  LANTERNS = createLanterns({ scene, layout: LANTERN_LAYOUT, glowTex });   // LANTERNS.lights: where each lantern's light is (the pools, the sloths' night glow, the bake's layout)
  // At Detail Low (D.fx 0) the light is made but not added to the scene: a point light at intensity 0 still costs every lit
  // shader per fragment (R2-087). Detail is fixed for the page's life (changing it reloads), so the light count never changes.
  fireLight = new THREE.PointLight(0xff9a4a, D.fx ? 6 : 0, 7, 1.6); fireLight.position.set(0, 0.9, 0); if (D.fx) scene.add(fireLight);

  // sunbeams into the clearing and floating motes
  if (S.rays && D.fx) {
    const tex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(255,240,200,0)"); gr.addColorStop(0.5, "rgba(255,240,200,1)"); gr.addColorStop(1, "rgba(255,240,200,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.2, "rgba(0,0,0,1)"); v.addColorStop(1, "rgba(0,0,0,0)"); g.globalCompositeOperation = "destination-in"; g.fillStyle = v; g.fillRect(0, 0, w, h); });
    rayMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: S.rays, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      forceSinglePass: true });   // one pass: three.js draws a see-through two-sided material twice (backs, then fronts) and re-keys its shader each time; a flat additive quad looks the same in one
    // the shafts slant down from the sun's side, all at the same angle like real morning light through a gap in the canopy (review B6).
    // All seven in one geometry, one draw (R2-103); additive with no depth write, so their order does not matter
    const sd = sun.position.clone().normalize(), up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion().setFromUnitVectors(up, sd), one = new THREE.Vector3(1, 1, 1), shafts = [];
    for (let i = 0; i < 7; i++) { const g = new THREE.PlaneGeometry(R(0.9, 2.4), 22), a = R(0, 6.28), d = R(0, RC - 3.5);   // the same draws, in the same order, as when each was its own mesh
      shafts.push(g.applyMatrix4(new THREE.Matrix4().compose(V(Math.cos(a) * d, 0, Math.sin(a) * d).addScaledVector(sd, 10), tilt.clone().multiply(new THREE.Quaternion().setFromAxisAngle(up, R(0, 3.14))), one))); }
    const rays = new THREE.Mesh(mergeGeometries(shafts), rayMat); rays.name = "Sunbeams"; scene.add(rays);
  }
  {
    const n = Math.round(S.motes * D.fx);
    if (n) {
      const p = new Float32Array(n * 3); for (let i = 0; i < n; i++) p.set([R(-RC, RC), R(0.5, 9), R(-RC, RC)], i * 3);
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      motes = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xfff3c0, size: 0.07, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
      scene.add(motes);
    }
  }

  // the light maps, loaded with everything else (core.js PRE)
  [LMTEX, LMSUN] = await PRE.lm;
  {
    const P = await PRE.props;
    const lamL = lnight(new THREE.MeshLambertMaterial({ vertexColors: true }));
    P.scene.traverse((m) => { if (m.isMesh) m.material = lamL; });
    // the picked set holds each copy on its own (Seat_0, Seat_1 ...), since each is lit where it stands
    SEATS.forEach(({ at, yaw }, i) => put(P.scene, [`Seat_${i}`, "Seat"], at.x, at.z, yaw));
    put(P.scene, "Tent", TENT.at.x, TENT.at.z, TENT.yaw);
    put(P.scene, "Hammock", HAMMOCK.mid.x, HAMMOCK.mid.z, HAMMOCK.yaw);
    put(P.scene, "Table", TABLE.at.x, TABLE.at.z, TABLE.yaw);
  }
  // ---------------------------------------------------------------- lived-in props (props/lived/build_lived.py): a wood pile (its log stack one textured block) with a hatchet in its
  // chopping stump on the jeep side of the fire, and a mug and an open book left on the seat you see first.
  // ?lived=0 hides them to compare.
  if (LIVED) {
    const L = await PRE.lived, lm = lnight(new THREE.MeshLambertMaterial({ vertexColors: true }));
    L.scene.traverse((m) => { if (m.isMesh) m.material = m.material.map ? lnight(new THREE.MeshLambertMaterial({ map: m.material.map, ...(m.name.startsWith("SeatTop") && { polygonOffset: true, polygonOffsetFactor: -2, color: SAWN }) })) : lm; });   // the stack, loose logs and seat tops are textured
    const { at: wp, yaw: wy, side } = WOOD_PILE;
    for (const n of ["WoodPile", "WoodStack", "LooseLogs"]) put(L.scene, n, wp.x, wp.z, wy); WOODPILE = wp;   // the activities take logs from here
    L.scene.getObjectByName("WoodStack").traverse((m) => { if (m.material?.map) WOOD_TEX = m.material.map; });   // and paint them like the stack
    addBlocker({ at: wp, r: 0.55 }); addBlocker({ at: wp.clone().addScaledVector(side, 1.0), r: 0.35 });
    put(L.scene, "SeatThings", SEATS[1].at.x, SEATS[1].at.z, SEATS[1].yaw);   // the middle seat
    { const t = TENT.at; put(L.scene, "TentSide", t.x, t.z, TENT.yaw); put(L.scene, "MatRoll", t.x, t.z, TENT.yaw); }   // wellies and the rolled mat on the planks by the door (tent frame)
    { const { at: k, yaw: ky } = CRATE; put(L.scene, "KitchenCrate", k.x, k.z, ky); put(L.scene, "KitchenThings", k.x, k.z, ky); addBlocker({ at: k, r: 0.35 }); }   // the kitchen crate beside the snack table, its front to the fire
    SEATS.forEach(({ at, yaw }, i) => put(L.scene, [`SeatTop_${i}`, "SeatTop"], at.x, at.z, yaw));   // the sawn top on each seat
  }
  // ---------------------------------------------------------------- the laundry line (props/lived/build_laundry.py): two forked sticks east of the fire,
  // between the snack table and the tent, with a towel and three sloth socks pegged on it (textured quads, about 110 triangles).
  // The gap on the line at hang (layout.js LAUNDRY.hang) is kept free for a sloth to hang from. Shown with the lived-in props.
  if (LIVED) {
    const LD = await PRE.laundry;
    LD.scene.traverse((m) => { if (m.isMesh) m.material = lnight(m.material.map ? new THREE.MeshLambertMaterial({ map: m.material.map, alphaTest: 0.5, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ vertexColors: true })); });
    const o = LD.scene; o.position.copy(LAUNDRY.mid); o.rotation.y = LAUNDRY.yaw; scene.add(o);
    for (const p of LAUNDRY.posts) addBlocker({ at: p, r: 0.25 });
  }
  // ---------------------------------------------------------------- the campfire and soup pot (props/lived/build_fire.py), picked 2026-11-11:
  // a teepee fire in a ring of sooty stones under the bamboo tripod, and an open iron pot of soup hanging on a chain (one
  // textured quad per link). The flames are three crossed cards with an animated flame shader instead of the old glow blobs;
  // the embers are unlit so they glow. (The first fire, rough rocks and split logs under a kettle, is archived with the rustic set.)
  {
    const F = await PRE.fire, fm = lnight(new THREE.MeshLambertMaterial({ vertexColors: true })), glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    fireLight.position.y = 0.4;                                    // inside the fire, below the pot (it hangs higher than the old kettle)
    for (const n of ["Ring", "Tripod", "TripodLegs", "Fire", "Embers", "Pot", "Chain"]) {
      const o = F.scene.getObjectByName(n); if (!o) continue;
      o.traverse((m) => { if (!m.isMesh) return;
        m.material = n === "Embers" ? glow : n === "Chain" ? lnight(new THREE.MeshLambertMaterial({ map: m.material.map, alphaTest: 0.5, side: THREE.DoubleSide }))
          : n === "TripodLegs" ? lnight(new THREE.MeshLambertMaterial({ map: m.material.map, color: BAMBOO })) : fm; });   // the legs: one tube each, nodes in the texture
      scene.add(o);
    }
    // the three crossed cards are one mesh (R2-103): each card's phase (0, 1, 2) is a vertex attribute instead of a uniform per card
    const H = 0.8, flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: "attribute float aPh; varying vec2 vUv; varying float vPh; void main() { vUv = uv; vPh = aPh; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vPh;
        void main() {
          float v = vUv.y, t = uTime * (1.0 + 0.15 * vPh) + vPh * 4.0;
          float x = vUv.x - 0.5;
          x += (sin(v * 9.0 - t * 7.0) * 0.05 + sin(v * 17.0 - t * 11.0 + 1.3) * 0.025) * v;          // the flame sways more toward its tip
          float tongues = 0.75 + 0.25 * sin(vUv.x * 23.0 + t * 3.0) * sin(vUv.x * 9.0 - t * 2.0);
          float w = 0.42 * pow(max(0.0, 1.0 - v / tongues), 0.75);                                      // wide at the base, tapering up
          float a = smoothstep(w, w * 0.35, abs(x)) * smoothstep(0.0, 0.08, v);
          vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.62, 0.15), smoothstep(w, w * 0.4, abs(x)));
          c = mix(c, vec3(1.0, 0.92, 0.6), smoothstep(0.5, 1.0, 1.0 - v) * smoothstep(w * 0.5, 0.0, abs(x)));
          gl_FragColor = vec4(c * a * 1.5, a);
        }` });
    const cards = [0, 1, 2].map((k) => { const g = new THREE.PlaneGeometry(0.7, H).translate(0, H / 2 + 0.03, 0).rotateY(k * Math.PI / 3);
      g.setAttribute("aPh", new THREE.Float32BufferAttribute([k, k, k, k], 1)); return g; });
    const flames = new THREE.Mesh(mergeGeometries(cards), flameMat); flames.name = "Flames";
    flames.renderOrder = 3; scene.add(flames); FIRE_CARDS.push(flames);   // the activities flare it (chores.js scales it: x and z alike, so it is the same as scaling each card)
  }
  // the static vertex-coloured props that nothing looks up by name, lights up or moves, merged into one draw (R2-103): the wood
  // pile's frame, the wellies by the tent, the tripod's head and the laundry posts. The seats, seat tops, seat things and the tent
  // are found by name and ray-cast (places.js, operator/places.js, sloth/spots.js), and the highlighted and moving parts
  // (chores.js looks, swing.js) stay apart too. A merged prop leaves an empty object of its name where it stood, for
  // props/shadow/export_casters.cjs's layout.
  {
    const parts = ["WoodPile", "TentSide", "Tripod", "LaundryPosts"].map((n) => scene.getObjectByName(n))
      .filter((m) => m?.isMesh && !m.children.length && !m.material.map && m.geometry.attributes.color);
    const geos = parts.map((m) => { m.updateWorldMatrix(true, false); return m.geometry.clone().applyMatrix4(m.matrixWorld); });
    const g = parts.length > 1 ? mergeGeometries(geos) : null;   // null too when their attributes differ: then they stay apart
    if (g) {
      const one = new THREE.Mesh(g, parts[0].material); one.name = "StaticProps"; scene.add(one);
      for (const m of parts) { const k = new THREE.Object3D(); k.name = m.name; k.position.copy(m.position); k.quaternion.copy(m.quaternion); k.scale.copy(m.scale); m.parent.add(k); m.removeFromParent(); }
    }
  }
  // light pools on the ground at night: one painted quad (2 triangles) under the fire and the lantern strings, faded in with the dusk;
  // drawn only while the ground has no baked night light (poolsStep)
  pools = (() => {
    const pts = [[0, 0, 3.4, 0.9, "255,140,60"], ...LANTERNS.lights.map((p) => [p.x, p.z, 1.4, 0.4, "255,200,120"])];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z, r] of pts) { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); }
    const span = Math.max(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;   // the quad's side (not core.js S, the look)
    const tex = canvasTex(256, 256, (g, w) => {
      for (const [x, z, r, k, c] of pts) {
        const u = (x - cx + span / 2) / span * w, v = (z - cz + span / 2) / span * w, gr = g.createRadialGradient(u, v, 0, u, v, r / span * w);
        gr.addColorStop(0, `rgba(${c},${k})`); gr.addColorStop(0.45, `rgba(${c},${k * 0.4})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.globalCompositeOperation = "lighter"; g.fillStyle = gr; g.fillRect(0, 0, w, w);
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(cx, 0.03, cz); m.visible = false; scene.add(m); return m;
  })();
}

// ---------------------------------------------------------------- each frame (main.js calls these, in its order)
// the fire's flicker: the fire's point light, brighter toward night (the flame cards' own flicker is their shader). Returns the flicker (0.7 .. 1), which the baked light, the sloths' glow and the pools follow too.
function fireStep(dusk) {
  const fl = 0.85 + 0.15 * Math.sin(uTime.value * 13) * Math.sin(uTime.value * 7.3);
  // by day a fifth of the dusk's light: the baked warm light (bakedlight.js dayWarm) already warms what stands round the fire, and
  // the full light on top of it, an arm's length away, turned the ring's stones and the ash bed near-white (R2-160)
  fireLight.intensity = (D.fx ? 6 : 0) * fl * (0.3 + 2.2 * dusk);
  return fl;
}
// the light pools on the ground: faded in with dusk, flickering with the fire; not shown where the ground's night light is baked
function poolsStep(dusk, fl, nightBaked) { pools.visible = dusk > 0 && !nightBaked; pools.material.opacity = dusk * (0.9 + 0.1 * fl); }
// the motes drift slowly round the clearing
function motesStep(dt) { if (motes) motes.rotation.y += dt * 0.02; }

export { addBlocker, buildProps, CAMP, dropBlockers, FIRE_CARDS, WOODPILE, WOOD_TEX, blockers, fireLight, fireStep, glowTex, LANTERNS, motesStep, poolsStep, rayMat };
