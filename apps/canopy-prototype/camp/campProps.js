// Canopy Camp props: the camp's blockers (the layout itself is layout.js), the picked props with their baked light map (lnight), the lived-in props,
// the laundry line, the campfire and soup pot. Models come from props/ (Blender); their light is baked by props/bake_all.py.
// Every baked node stands where its anchor tag says (stand, layout.js ANCHORS, review R2-249).
// main.js calls its three step functions each frame: fireStep (the fire's flicker), poolsStep (the light pools on the ground
// at night) and motesStep (the drifting motes). Exports those, CAMP, SLOTH (the sloth model), blockers and the props' parts
// other modules use (FIRE_CARDS, WOODPILE, WOOD_TEX, fireLight, glowTex, lanternGlow, LANTERNS, rayMat, uNight), and buildProps()
// (main.js, once), which builds them all.
import * as THREE from "three";
import { LIGHT_GLSL, LIGHT_MIX, bindLight, liveChunk } from "../bakedlight.js";
import { D, LIVED, PRE, rng, S, scene, sun, uTime } from "./core.js";
const { R } = rng("props");
import { V, canvasTex, patchMaterial } from "./util.js";
import { ANCHORS, HAMMOCK, HERO, LANTERN_TIES, RC, SEATS, TABLE, TENT, WOOD_PILE, wearBlockers } from "./layout.js";
import { lanternLayout, createLanterns } from "./lanterns.js";

// ---------------------------------------------------------------- the camp: fire, logs, tent, hammock, lanterns, snack table
const lanternGlow = [];   // where each lantern's light is (lanterns.js): the ground pools and the sloths' night glow
// the layout (layout.js): the log seats round the fire (the gap faces the gate), the tent, the hammock posts, the snack table
// and the lantern strings (lanterns.js, review B3, Adriaen 2026-11-12): a V from the tent's front A-frame and the hammock's
// near post up to the big tree behind the fire
const LANTERN_LAYOUT = lanternLayout(LANTERN_TIES);
// CAMP: the camp layout in the names operator.js, audio.js and radio.js know, built from layout.js's own vectors (the same objects, no
// copies). (It also carried the lantern strings' points, which nothing read: review props-08.)
const CAMP = { tentAt: TENT.at, hA: HAMMOCK.a, hB: HAMMOCK.b, tb: TABLE.at };
// blockers: [centre, radius] circles that keep plants, props and sloths apart. A few also carry a tighter shape for walking
// (.walk, player.js): the fire ring stops you at its stones, and each log seat is a thin capsule along the log, so there is
// a ring to walk round the fire between them (Adriaen 2026-11-13: the old circles walled the fire in)
// (the table, hammock posts, seats, lived props, laundry posts and jeep take their circles from layout.js WEAR, wearBlockers)
const blockers = [Object.assign([V(0, 0, 0), 0.9], { walk: { r: 0.75 } }), Object.assign([TENT.at.clone().multiplyScalar(1 + 0.275 / TENT.at.length()), 1.9], { tent: true }), ...wearBlockers("camp"), ...HERO.map((h) => [h, 1.4])];
wearBlockers("seats").forEach(([c, r], i) => { const a = SEATS[i].angle, t = V(-Math.sin(a), 0, Math.cos(a));
  blockers.push(Object.assign([c, r], { walk: { a: c.clone().addScaledVector(t, -0.6), b: c.clone().addScaledVector(t, 0.6), r: 0.25 } })); });   // build_camp.py rustic seat: a 1.5 m half log, 0.5 m deep
const FIRE_CARDS = [];   // the fire's flame cards (the activities flare them)
const uNight = { value: 0 };   // how far the baked night light is faded in (main.js sets it from the dusk)
let glowTex, LANTERNS, fireLight, rayMat, motes, pools, SLOTH, LMTEX, LMSUN, WOODPILE, WOOD_TEX;   // set by buildProps

// ---------------------------------------------------------------- the camp's baked light (props/camp/bake_camp_lightmap.py: the whole scene, ground and props,
// baked as one; Adriaen 2026-11-12). On each prop's second UV set (TEXCOORD_1):
//   camp_lm_<k>.png      one channel per light: fire, stove, lanterns, moon (bakedlight.js colours, flickers and mixes them)
//   camp_lm_sun_<k>.png  R where the sun reaches (scales the live sun), G sky occlusion (scales the live sky light)
// By day the props are lit live (sun and sky, shaded by the bake) plus a share of the warm lights; at night they show all four
// lights, baked, unlit, faded in with uNight. COLOR_0 alpha 0 marks faces that glow at night (lantern glass, the stove's fire).
// The lightMap slot (intensity 0) only gives the shader its sampler and UV; it adds no light. Light button: 2K or 1K (4K: ?lm=4k, local only).
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
  });
};
// stand: moves every node of a loaded props GLB into the scene where its anchor tag says (userData.anchor, a key of layout.js
// ANCHORS, written by the bake from props/lib/export.py tag, review R2-249), or onto the log seats ("seats": userData.seat,
// or one copy on each seat). Nodes with no anchor are left out.
// GLBs baked before R2-249 carry no tags, so until the next light bake rewrites them their nodes' anchors come from
// their names here; delete UNTAGGED once models/ holds GLBs with tags.
const UNTAGGED = { Seat: "seats", SeatTop: "seats", Tent: "tent", Hammock: "hammock", Table: "table", WoodPile: "woodPile", WoodStack: "woodPile",
  LooseLogs: "woodPile", SeatThings: "seatThings", TentSide: "tent", MatRoll: "tent", KitchenCrate: "kitchen", KitchenThings: "kitchen",
  LaundryPosts: "laundry", LaundryCloth: "laundry", Ring: "fire", Tripod: "fire", TripodLegs: "fire", Fire: "fire", Embers: "fire", Pot: "fire", Chain: "fire" };
function stand(root) {
  for (const o of [...root.children]) {
    const k = o.userData.anchor ?? UNTAGGED[o.name.replace(/_\d+$/, "")];
    if (k === "seats") {
      const i = o.userData.seat ?? o.name.match(/_(\d+)$/)?.[1];
      (i == null ? SEATS : [SEATS[+i]]).forEach(({ at, yaw }, j) => { const c = j ? o.clone() : o; c.position.set(at.x, 0, at.z); c.rotation.set(0, yaw, 0); scene.add(c); });
    } else if (ANCHORS[k]) {
      const { at, yaw } = ANCHORS[k]; o.position.set(at.x, 0, at.z); o.rotation.set(0, yaw, 0); scene.add(o);
    }
  }
}
// buildProps (main.js, once, after the forest): the lanterns, the fire's light, the sunbeams and motes, then (once their downloads are
// in) the picked props, the lived-in props, the laundry line, the campfire and the night's light pools
async function buildProps() {
  // the lanterns (lanterns.js) and the fire: glow sprites, no real-time shadows; one warm point light for the fire glow
  glowTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,240,200,1)"); r.addColorStop(0.3, "rgba(255,200,120,.7)"); r.addColorStop(1, "rgba(255,160,80,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  LANTERNS = createLanterns({ scene, layout: LANTERN_LAYOUT, glowTex }); lanternGlow.push(...LANTERNS.lights);
  fireLight = new THREE.PointLight(0xff9a4a, D.fx ? 6 : 0, 7, 1.6); fireLight.position.set(0, 0.9, 0); scene.add(fireLight);

  // sunbeams into the clearing and floating motes
  if (S.rays && D.fx) {
    const tex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(255,240,200,0)"); gr.addColorStop(0.5, "rgba(255,240,200,1)"); gr.addColorStop(1, "rgba(255,240,200,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.2, "rgba(0,0,0,1)"); v.addColorStop(1, "rgba(0,0,0,0)"); g.globalCompositeOperation = "destination-in"; g.fillStyle = v; g.fillRect(0, 0, w, h); });
    rayMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: S.rays, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      forceSinglePass: true });   // one draw per shaft: three.js draws a see-through two-sided material twice (backs, then fronts) and re-keys its shader each time; a flat additive quad looks the same in one
    // the shafts slant down from the sun's side, all at the same angle like real morning light through a gap in the canopy (review B6)
    const sd = sun.position.clone().normalize(), up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion().setFromUnitVectors(up, sd);
    for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.PlaneGeometry(R(0.9, 2.4), 22), rayMat); const a = R(0, 6.28), d = R(0, RC - 3.5);
      r.quaternion.copy(tilt).multiply(new THREE.Quaternion().setFromAxisAngle(up, R(0, 3.14))); r.position.set(Math.cos(a) * d, 0, Math.sin(a) * d).addScaledVector(sd, 10); scene.add(r); }
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

  // the sloth model (sloths.js and camp/sloth/ make the sloths from it) and the light maps, loaded with everything else (core.js PRE)
  SLOTH = await PRE.sloth;
  [LMTEX, LMSUN] = await PRE.lm;
  {
    const P = await PRE.props;
    const lamL = lnight(new THREE.MeshLambertMaterial({ vertexColors: true }));
    P.scene.traverse((m) => { if (m.isMesh) m.material = lamL; });
    stand(P.scene);   // the seats (each copy on its own, Seat_0-2, since each is lit where it stands), the tent, the hammock and the table
  }
  // ---------------------------------------------------------------- lived-in props (props/lived/build_lived.py): a wood pile (its log stack one textured block) with a hatchet in its
  // chopping stump on the jeep side of the fire, and a mug and an open book left on the seat you see first. Shown with the
  // rustic seats (Our camp, Rustic); ?lived=0 hides them to compare.
  if (LIVED) {
    const L = await PRE.lived, lm = lnight(new THREE.MeshLambertMaterial({ vertexColors: true }));
    L.scene.traverse((m) => { if (m.isMesh) m.material = m.material.map ? lnight(new THREE.MeshLambertMaterial({ map: m.material.map, ...(m.name.startsWith("SeatTop") && { polygonOffset: true, polygonOffsetFactor: -2, color: SAWN }) })) : lm; });   // the stack, loose logs and seat tops are textured
    L.scene.getObjectByName("WoodStack").traverse((m) => { if (m.material?.map) WOOD_TEX = m.material.map; });   // the activities paint their logs like the stack
    // the wood pile, the mug and book on the middle seat, the wellies and rolled mat by the tent door, the kitchen crate
    // beside the snack table (its front to the fire) and the sawn top on each seat
    stand(L.scene);
    WOODPILE = WOOD_PILE.at;   // the activities take logs from here
    blockers.push(...wearBlockers("lived"));   // the wood pile, its chopping stump and the kitchen crate
  }
  // ---------------------------------------------------------------- the laundry line (props/lived/build_laundry.py): two forked sticks east of the fire,
  // between the snack table and the tent, with a towel and three sloth socks pegged on it (textured quads, about 110 triangles).
  // The gap on the line at hang (layout.js LAUNDRY.hang) is kept free for a sloth to hang from. Shown with the lived-in props.
  if (LIVED) {
    const LD = await PRE.laundry;
    LD.scene.traverse((m) => { if (m.isMesh) m.material = lnight(m.material.map ? new THREE.MeshLambertMaterial({ map: m.material.map, alphaTest: 0.5, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ vertexColors: true })); });
    stand(LD.scene);
    blockers.push(...wearBlockers("laundry"));   // the two posts
  }
  // ---------------------------------------------------------------- the campfire and soup pot (props/lived/build_fire.py), picked 2026-11-11:
  // a teepee fire in a ring of sooty stones under the bamboo tripod, and an open iron pot of soup hanging on a chain (one
  // textured quad per link). The flames are three crossed cards with an animated flame shader instead of the old glow blobs;
  // the embers are unlit so they glow. (The first fire, rough rocks and split logs under a kettle, is archived with the rustic set.)
  {
    const F = await PRE.fire, fm = lnight(new THREE.MeshLambertMaterial({ vertexColors: true })), glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    fireLight.position.y = 0.4;                                    // inside the fire, below the pot (it hangs higher than the old kettle)
    for (const o of F.scene.children) { const n = o.name;
      o.traverse((m) => { if (!m.isMesh) return;
        m.material = n === "Embers" ? glow : n === "Chain" ? lnight(new THREE.MeshLambertMaterial({ map: m.material.map, alphaTest: 0.5, side: THREE.DoubleSide }))
          : n === "TripodLegs" ? lnight(new THREE.MeshLambertMaterial({ map: m.material.map, color: BAMBOO })) : fm; });   // the legs: one tube each, nodes in the texture
    }
    stand(F.scene);   // the ring, tripod, fire, embers, pot and chain, at the fire
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
  pools = (() => {
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
}

// ---------------------------------------------------------------- each frame (main.js calls these, in its order)
// the fire's flicker: the fire's point light, brighter toward night (the flame cards' own flicker is their shader). Returns the flicker (0.7 .. 1), which the baked light, the sloths' glow and the pools follow too.
function fireStep(dusk) {
  const fl = 0.85 + 0.15 * Math.sin(uTime.value * 13) * Math.sin(uTime.value * 7.3);
  fireLight.intensity = (D.fx ? 6 : 0) * fl * (1 + 1.5 * dusk);
  return fl;
}
// the light pools on the ground: faded in with dusk, flickering with the fire; not shown where the ground's night light is baked
function poolsStep(dusk, fl, nightBaked) { pools.visible = dusk > 0 && !nightBaked; pools.material.opacity = dusk * (0.9 + 0.1 * fl); }
// the motes drift slowly round the clearing
function motesStep(dt) { if (motes) motes.rotation.y += dt * 0.02; }

export { buildProps, CAMP, FIRE_CARDS, SLOTH, WOODPILE, WOOD_TEX, blockers, fireLight, fireStep, glowTex, lanternGlow, LANTERNS, motesStep, poolsStep, rayMat, uNight };
