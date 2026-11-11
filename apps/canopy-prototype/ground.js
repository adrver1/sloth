// Wild, lived-in camp ground for camp.html: worn dirt where the camp is used, and grass tufts, tall grass, wildflowers and clover on cards.
// Kept out of camp.html (which only calls createGround once) so the sibling threads' edits there don't collide.
// Floor: one disc (96 tris) that replaces the old flat clearing. A painted "wear map" over the clearing says where it is dirt (fire ring,
// seats, tent door, table, wood pile, jeep, the paths between them, worked out from camp.html's collision circles), where the grass
// is lush or dry, and where it is ash or mud; tiling grass and dirt textures give the close-up detail. The edge is ragged, not a circle.
// Plants: crossed-quad cards (4 tris each) from one painted atlas, all in one instanced draw, swaying in the vertex shader.
// They grow thick at the forest edge and against the props, thin out in the open, and never on the worn dirt.
import * as THREE from "three";

const canvasTex = (w, h, draw, srgb = true) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createGround({ scene, RC, blockers, clearing, S, look, fx, uTime, night = { value: 0 }, trackDist = () => 1e9, trackPts = [], bare = () => false, seed = 77 }) {
  // night: camp.html's uNight (0 day .. 1 rested); the ground and plants sink to a dim blue so the fire and lantern pools read
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, R = (a, b) => a + rnd() * (b - a);
  const RR = RC + 0.8, M = 256, px = (x) => (x / (2 * RR) + 0.5) * M;      // world x/z to wear-map pixels

  // things in the camp (not the big trees at the edge), from the collision circles
  const spots = blockers.filter(([c, r]) => Math.hypot(c.x, c.z) < RC - 1 && r < 1.6 && Math.hypot(c.x, c.z) > 0.01);
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
    for (const [c, r] of spots) dirt(c.x, c.z, r + R(0.6, 0.9), 0.75);            // in front of and round each thing you use
    const path = (a, b, w) => {                                                     // a worn footpath: a wobbly line, soft edges
      const n = Math.max(6, Math.round(a.distanceTo(b) / 0.4)), side = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize(), bend = R(-0.5, 0.5);
      for (let k = 0; k <= n; k++) { const t = k / n, p = a.clone().lerp(b, t).addScaledVector(side, Math.sin(t * Math.PI) * bend + R(-0.06, 0.06)); dirt(p.x, p.z, w * R(0.85, 1.15), 0.32); }
    };
    for (const [c, r] of spots) { const d = c.clone().setY(0), L = d.length(); if (L > 2.2) path(d.clone().multiplyScalar(2.4 / L), d.clone().multiplyScalar((L - r * 0.7) / L), 0.55); }
    if (entry) path(new THREE.Vector3(entry.x, 0, entry.z).multiplyScalar(2.6 / Math.hypot(entry.x, entry.z)), new THREE.Vector3(entry.x, 0, entry.z), 0.6);   // to the track
    // break it up: grass islands in the dirt, ragged edges
    g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 220; i++) { const a = R(0, 6.28), r = Math.sqrt(rnd()) * RC, X = px(Math.cos(a) * r), Z = px(Math.sin(a) * r); g.fillStyle = `rgba(0,${Math.round(R(90, 170))},0,${R(0.15, 0.4)})`; g.beginPath(); g.ellipse(X, Z, R(1.5, 4), R(1, 3), R(0, 3), 0, 7); g.fill(); }
    // ash right round the fire, wet mud by the table, the jeep and the track
    g.globalCompositeOperation = "lighter";
    blob(0, 0, 1.25, "rgba(0,0,255,.75)");
    for (const [c, r] of spots) if (rnd() < 0.5) blob(c.x + R(-0.3, 0.3), c.z + R(-0.3, 0.3), r * 0.6 + 0.3, "rgba(0,0,180,.3)");
    if (entry) blob(entry.x * 0.95, entry.z * 0.95, 1.1, "rgba(0,0,200,.45)");
  }, false);
  wear.anisotropy = 1; wear.flipY = false;   // canvas rows run with +z, like the shader's lookup
  const mk = wear.image.getContext("2d").getImageData(0, 0, M, M).data;
  const sample = (x, z, ch) => { const X = Math.min(M - 1, Math.max(0, Math.floor(px(x)))), Z = Math.min(M - 1, Math.max(0, Math.floor(px(z)))); return mk[(Z * M + X) * 4 + ch] / 255; };

  // ---------------------------------------------------------------- dirt detail, tiled: packed earth with pebbles, twigs and a few dry leaves
  const mud = look === "low" ? ["#a88a60", "#947654", "#7a5e42"] : ["#a08460", "#8a6e4e", "#73583e"];
  const dirtTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = mud[0]; g.fillRect(0, 0, w, h);
    const Q = (a, b) => a + Math.random() * (b - a);
    const wrap = (f) => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.save(); g.translate(dx, dy); f(); g.restore(); } };
    if (look !== "low") for (let i = 0; i < 700; i++) { const x = Q(0, w), y = Q(0, h), rx = Q(1, 6), ry = Q(1, 4), r = Q(0, 3), c = mud[1 + (i % 2)], a = Q(0.15, 0.45); wrap(() => { g.fillStyle = c; g.globalAlpha = a; g.beginPath(); g.ellipse(x, y, rx, ry, r, 0, 7); g.fill(); }); }
    g.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { const x = Q(0, w), y = Q(0, h), r = Q(1.5, 4), c = ["#9b948a", "#7f786e", "#b0a89a"][i % 3]; wrap(() => { g.fillStyle = "rgba(40,28,20,.35)"; g.beginPath(); g.ellipse(x + 1, y + 1.2, r, r * 0.75, 0, 0, 7); g.fill(); g.fillStyle = c; g.beginPath(); g.ellipse(x, y, r, r * 0.75, 0, 0, 7); g.fill(); g.fillStyle = "rgba(255,255,255,.25)"; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.3, 0, 0, 7); g.fill(); }); }   // pebbles
    for (let i = 0; i < 9; i++) { const x = Q(0, w), y = Q(0, h), a = Q(0, 3.14), L = Q(10, 26); wrap(() => { g.strokeStyle = "#4a3424"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.lineTo(x + Math.cos(a) * L + 4, y + Math.sin(a) * L - 3); g.stroke(); }); }   // twigs
    for (let i = 0; i < 14; i++) { const x = Q(0, w), y = Q(0, h), r = Q(0, 3), c = ["#a8672e", "#c28a3a", "#8a5a2a"][i % 3]; wrap(() => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, 4, 2, r, 0, 7); g.fill(); }); }   // dry leaves
  });
  dirtTex.wrapS = dirtTex.wrapT = THREE.RepeatWrapping;

  // ---------------------------------------------------------------- the floor: one disc in world coordinates, grass and dirt blended by the wear map
  const geo = new THREE.CircleGeometry(RR, 48).rotateX(-Math.PI / 2).translate(0, 0.012, 0);
  const grassMap = clearing.material.map;
  const mat = new THREE.MeshLambertMaterial({ map: grassMap });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uMask: { value: wear }, uDirt: { value: dirtTex }, uR: { value: RR }, uNight: night });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vG;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvG = position.xz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vG; uniform sampler2D uMask, uDirt; uniform float uR, uNight;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        float rr = length(vG);
        float h = fract(sin(dot(floor(vG * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
        if (h < smoothstep(uR - 1.0, uR, rr)) discard;                        // a ragged edge into the forest floor
        vec4 mk = texture2D(uMask, vG / (2.0 * uR) + 0.5);
        vec3 dt = sRGBTransferEOTF(texture2D(uDirt, vG * 0.45)).rgb;
        vec3 gr = diffuseColor.rgb * mix(vec3(1.18, 1.1, 0.82), vec3(0.72, 0.9, 0.62), mk.g);   // dry and pale ... lush and deep
        float d = 0.92 * smoothstep(0.3, 0.7, mk.r + (dot(dt, vec3(0.33)) - 0.25) * 0.6);
        vec3 c = mix(gr, dt, d);
        float ashy = 1.0 - smoothstep(1.0, 1.6, rr);                         // grey ash by the fire, dark wet mud elsewhere
        diffuseColor.rgb = mix(c * (1.0 - 0.45 * mk.b * d), mix(c, vec3(0.30, 0.28, 0.26) * (0.8 + 0.4 * dot(dt, vec3(0.33))), 0.85 * mk.b), ashy);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.38, 0.42, 0.6), uNight);`);
  };
  const floor = new THREE.Mesh(geo, mat); scene.add(floor);
  clearing.visible = false;

  // ---------------------------------------------------------------- plant atlas: tuft, tall grass, wildflowers, clover (2 x 2 cells of 128)
  const leaf = S.leaf.map((c) => "#" + new THREE.Color(c).lerp(new THREE.Color(0xd8e0a0), 0.3).getHexString());   // a bit lighter than the canopy, like the lawn
  const atlas = canvasTex(256, 256, (g) => {
    const Q = (a, b) => a + Math.random() * (b - a);
    const blade = (x0, y0, len, lean, w, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x0 - w, y0); g.quadraticCurveTo(x0 + lean * 0.4, y0 - len * 0.6, x0 + lean, y0 - len); g.quadraticCurveTo(x0 + lean * 0.4 + w * 0.3, y0 - len * 0.6, x0 + w, y0); g.closePath(); g.fill(); };
    const cell = (cx, cy, f) => { g.save(); g.beginPath(); g.rect(cx + 2, cy + 2, 124, 124); g.clip(); g.translate(cx, cy); f(); g.restore(); };
    cell(0, 0, () => { for (let i = 0; i < 22; i++) blade(64 + Q(-14, 14), 128, Q(55, 118), Q(-40, 40), Q(2, 3.5), leaf[i % 4]); for (let i = 0; i < 6; i++) blade(64 + Q(-8, 8), 128, Q(40, 90), Q(-30, 30), 1.6, "#c8d88a"); });   // a grass tuft
    cell(128, 0, () => {                                                                                                                                                 // tall grass with seed heads
      for (let i = 0; i < 14; i++) blade(64 + Q(-16, 16), 128, Q(80, 122), Q(-26, 26), Q(1.6, 2.6), leaf[i % 4]);
      for (let i = 0; i < 4; i++) { const x = 64 + Q(-24, 24), top = Q(6, 20), lean = Q(-12, 12); g.strokeStyle = leaf[1]; g.lineWidth = 1.2; g.beginPath(); g.moveTo(64, 128); g.quadraticCurveTo(x, 60, x + lean, top + 14); g.stroke();
        g.fillStyle = "#d8c88a"; for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(x + lean + (k % 2 ? 1.6 : -1.6), top + k * 3, 1.1, 2.4, k % 2 ? 0.5 : -0.5, 0, 7); g.fill(); } }
    });
    cell(0, 128, () => {                                                                                                                                                 // wildflowers
      for (let i = 0; i < 10; i++) blade(64 + Q(-18, 18), 128, Q(30, 60), Q(-20, 20), 2.2, leaf[i % 4]);
      const kinds = [["#ffffff", "#ffd23a"], ["#ff8fb3", "#ffe08a"], ["#ffd23a", "#e8a020"], ["#b79cff", "#fff1a8"], ["#ffffff", "#ffd23a"]];
      for (let i = 0; i < 6; i++) {
        const x = Q(26, 102), y = Q(26, 66), [pet, mid] = kinds[i % kinds.length];
        g.strokeStyle = leaf[2]; g.lineWidth = 2; g.beginPath(); g.moveTo(64 + Q(-10, 10), 128); g.quadraticCurveTo(x, 100, x, y); g.stroke();
        g.fillStyle = pet; for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.28; g.beginPath(); g.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 5, 5, 3.4, a, 0, 7); g.fill(); }
        g.fillStyle = mid; g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill();
      }
    });
    cell(128, 128, () => {                                                                                                                                               // clover and low leaves
      for (let i = 0; i < 16; i++) { const x = 64 + Q(-44, 44), y = Q(70, 120); g.strokeStyle = leaf[2]; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 128); g.lineTo(x, y); g.stroke();
        g.fillStyle = leaf[i % 4]; for (let k = 0; k < 3; k++) { const a = -1.57 + (k - 1) * 1.1; g.beginPath(); g.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 6, 5, a, 0, 7); g.fill(); } }
      for (let i = 0; i < 4; i++) { const x = 64 + Q(-36, 36), y = Q(56, 80); g.fillStyle = "#fff6f0"; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.fillStyle = "#ffc8d8"; g.beginPath(); g.arc(x, y + 2, 4, 0, 3.14); g.fill(); }
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
  const want = { 0: Math.round(650 * k), 1: Math.round(130 * k), 2: Math.round(170 * k), 3: Math.round(140 * k) };
  const pick = [];
  for (const type of [1, 2, 0, 3]) {
    let n = 0;
    for (let tries = 0; tries < want[type] * 40 && n < want[type]; tries++) {
      const a = R(0, 6.28), r = Math.sqrt(rnd()) * (RC + 0.6), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const dirt = sample(x, z, 0), lush = sample(x, z, 1), edge = smooth(RC - 2.5, RC, r), hug = nearThing(x, z);
      if (inside(x, z, type === 1 ? 0.1 : 0) || bare(x, z) || trackDist(x, z) < 1.1) continue;   // bare: kept clear, e.g. under the tent's planks
      let p;
      if (type === 0) p = (0.18 + 0.7 * edge + 0.5 * hug + 0.3 * lush) * (1 - smooth(0.25, 0.5, dirt)) + 0.35 * smooth(0.15, 0.3, dirt) * (1 - smooth(0.3, 0.45, dirt));   // and along path edges
      else if (type === 1) p = (0.9 * smooth(RC - 2, RC, r) + 0.7 * hug) * (1 - smooth(0.2, 0.35, dirt));
      else if (type === 2) p = (0.9 * flowerField(x, z) + 0.25 * hug + 0.12 * edge) * (1 - smooth(0.2, 0.35, dirt));
      else p = (0.25 + 0.4 * lush) * (1 - edge) * (1 - smooth(0.15, 0.3, dirt));
      if (rnd() > p) continue;
      const size = type === 0 ? R(0.22, 0.42) * (1 + 0.4 * edge) : type === 1 ? R(0.55, 0.95) : type === 2 ? R(0.28, 0.45) : R(0.13, 0.22);
      pick.push([x, z, type, size]); n++;
    }
  }
  const im = new THREE.InstancedMesh(card, null, pick.length);
  const cellA = new Float32Array(pick.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  pick.forEach(([x, z, type, size], i) => {
    q.setFromAxisAngle(up, R(0, 6.28)); m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(size * (type === 3 ? 1.6 : 1.1), size, size * (type === 3 ? 1.6 : 1.1))); im.setMatrixAt(i, m4);
    const dry = 1 - sample(x, z, 1); im.setColorAt(i, col.setRGB(1, 1, 1).lerp(new THREE.Color(1.15, 1.08, 0.75), type < 2 ? dry * 0.5 : 0).multiplyScalar(R(0.8, 1.05)));
    cellA[i] = type;
  });
  card.setAttribute("aCell", new THREE.InstancedBufferAttribute(cellA, 1));
  const pmat = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide });
  pmat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime; attribute float aCell;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vMapUv * 0.5 + vec2(mod(aCell, 2.0), 1.0 - floor(aCell / 2.0)) * 0.5;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        float w = sin(uTime * 1.6 + ip.x * 1.3 + ip.z * 1.7) + 0.4 * sin(uTime * 3.1 + ip.x * 3.0);
        transformed.xz += vec2(w * 0.06, w * 0.035) * position.y * position.y;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uNight;").replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), vec3(0.38, 0.42, 0.6), uNight);").replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);");   // both sides lit like the ground, never black from behind
  };
  im.material = pmat; im.frustumCulled = false; scene.add(im);
  const counts = [0, 1, 2, 3].map((t) => pick.filter((p) => p[2] === t).length);
  return { floor, plants: im, tris: { floor: geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3, plants: pick.length * 4 }, counts: { tufts: counts[0], tall: counts[1], flowers: counts[2], clover: counts[3] } };
}
