// Cozy camp atmosphere for camp.html: cheap particle effects round the fire, kept out of camp.html so the sibling threads' edits there don't collide.
// Batch 1: smoke curling up from the fire, sparks that pop more often as you walk close, and steam off the soup pot.
// Later: thin smoke from the tent stove's chimney, curling out from under its rain cap.
// Batch 2: butterflies by day that flutter round the clearing and now and then land on a sloth's nose; blinking fireflies at dusk.
// Each effect is one instanced draw of camera-facing quads (no point sprites, so phone GPUs' point-size caps don't matter) with a fixed pool, scaled by the detail level.
import * as THREE from "three";

const canvasTex = (s, draw) => { const c = document.createElement("canvas"); c.width = c.height = s; draw(c.getContext("2d"), s); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const rnd = (a, b) => a + Math.random() * (b - a);   // effect noise only: leaves the seeded layout alone

// a soft lumpy puff: a few overlapping radial blobs
const puffTex = () => canvasTex(64, (g, s) => {
  for (let i = 0; i < 7; i++) {
    const x = s / 2 + rnd(-9, 9), y = s / 2 + rnd(-9, 9), r = rnd(14, 22), gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
});
const sparkTex = () => canvasTex(32, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, "rgba(255,255,230,1)"); gr.addColorStop(0.35, "rgba(255,190,90,.8)"); gr.addColorStop(1, "rgba(255,120,40,0)"); g.fillStyle = gr; g.fillRect(0, 0, s, s); });

// a pool of n billboard quads in one draw; each live particle has position, size, alpha and spin
function pool(scene, n, map, blending, order) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), sa = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);   // xyz | size, alpha, spin
  at.setUsage(THREE.DynamicDrawUsage); sa.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("iAt", at); geo.setAttribute("iSA", sa); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, tint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `attribute vec3 iAt; attribute vec3 iSA; varying vec2 vUv; varying float vA;
      void main() { vUv = uv; vA = iSA.y; float c = cos(iSA.z), s = sin(iSA.z);
        vec4 mv = modelViewMatrix * vec4(iAt, 1.0); mv.xy += mat2(c, s, -s, c) * position.xy * iSA.x; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 tint; varying vec2 vUv; varying float vA;
      void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * tint, t.a * vA); if (gl_FragColor.a < 0.004) discard;
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = order; scene.add(mesh);
  const live = [];
  return {
    mat, live, n,
    add(p) { if (live.length < n) live.push(p); },
    flush() {                                          // write the live particles into the instance buffers
      for (let i = 0; i < live.length; i++) { const p = live[i]; at.setXYZ(i, p.x, p.y, p.z); sa.setXYZ(i, p.size, p.alpha, p.spin); }
      geo.instanceCount = live.length; at.needsUpdate = sa.needsUpdate = true;
    },
  };
}

// fire at the clearing centre; pot = { at: the centre of the soup's surface in world space, r: its radius }: steam rises from
// the whole surface (null: no steam). The kettle and its spout steam went with the kettle (the open pot replaced it).
// chimneys: world points at the mouth of a stovepipe (the tent's, under its rain cap); thin smoke curls out sideways from under the cap and rises
export function createAtmosphere({ scene, camera, fx, fire = new THREE.Vector3(0, 0, 0), pot = null, chimneys = [], sloths = [], roam = 7.5 }) {
  const k = fx > 1 ? 1.5 : fx ? 1 : 0.5;   // detail: low, medium, high
  const puff = puffTex();
  const smoke = pool(scene, Math.round(26 * k), puff, THREE.NormalBlending, 3);
  const steam = pot ? pool(scene, Math.round(22 * k), puff, THREE.NormalBlending, 4) : null;
  const sparks = pool(scene, Math.round(60 * k), sparkTex(), THREE.AdditiveBlending, 5);
  const chim = chimneys.length ? pool(scene, Math.round(14 * k) * chimneys.length, puff, THREE.NormalBlending, 3) : null;
  let tChim = 0;
  const DAY_SMOKE = new THREE.Color(0xd6d2cb), DUSK_SMOKE = new THREE.Color(0x4a4652);
  let tSmoke = 0, tSteam = 0, tSpark = 0, wind = 0;

  function update(dt, time, dusk) {
    wind = Math.sin(time * 0.13) * 0.12 + Math.sin(time * 0.31) * 0.06;    // a slow breeze that leans the smoke

    // smoke: a puff every 1/3 s at medium, rising, widening, fading in then out over about 7 s
    tSmoke -= dt;
    while (tSmoke <= 0) {
      tSmoke += 7 / smoke.n;
      smoke.add({ x: fire.x + rnd(-0.08, 0.08), y: fire.y + 0.75, z: fire.z + rnd(-0.08, 0.08), vx: rnd(-0.03, 0.03), vz: rnd(-0.03, 0.03), vy: rnd(0.32, 0.45),
        t: 0, life: rnd(6, 7.5), s0: rnd(0.22, 0.32), s1: rnd(1.3, 1.9), spin: rnd(0, 6.28), spinV: rnd(-0.25, 0.25), a: rnd(0.28, 0.4), ph: rnd(0, 6.28), size: 0, alpha: 0 });
    }
    // sparks: a few now and then; many more when you stand within about 3 m, and a crackle burst every few seconds
    const d = Math.hypot(camera.position.x - fire.x, camera.position.z - fire.z), near = Math.min(1, Math.max(0, (3.4 - d) / 2));
    tSpark -= dt * (0.8 + 14 * near);
    let burst = Math.random() < dt * (0.15 + 0.5 * near) ? Math.round(rnd(4, 9)) : 0;
    while (tSpark <= 0 || burst > 0) {
      if (tSpark <= 0) tSpark += 1; else burst--;
      const up = rnd(1.1, 2.1), a = rnd(0, 6.28), out = rnd(0.1, 0.5);
      sparks.add({ x: fire.x + rnd(-0.12, 0.12), y: fire.y + rnd(0.4, 0.6), z: fire.z + rnd(-0.12, 0.12), vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: up,
        t: 0, life: rnd(0.8, 1.7), s0: rnd(0.05, 0.08), spin: 0, a: 1, ph: rnd(0, 6.28), size: 0, alpha: 0 });
    }
    // steam: soft curls lifting off the soup, anywhere on its surface
    if (steam) {
      tSteam -= dt;
      while (tSteam <= 0) {
        tSteam += 2.3 / steam.n;
        const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * pot.r * 0.85;
        steam.add({ x: pot.at.x + Math.cos(a) * r, y: pot.at.y + 0.01, z: pot.at.z + Math.sin(a) * r, vx: rnd(-0.03, 0.03), vz: rnd(-0.03, 0.03), vy: rnd(0.14, 0.24),
          t: 0, life: rnd(1.8, 2.6), s0: pot.r * rnd(0.5, 0.8), s1: rnd(0.3, 0.42), spin: rnd(0, 6.28), spinV: rnd(-0.5, 0.5), a: rnd(0.35, 0.5), ph: rnd(0, 6.28), size: 0, alpha: 0 });
      }
    }

    // chimney smoke: a small wisp every half second from under the cap, pushed out sideways, then up and away on the breeze
    if (chim) {
      tChim -= dt;
      while (tChim <= 0) {
        tChim += 7 / chim.n;
        for (const c of chimneys) { const a = rnd(0, 6.28);
          chim.add({ x: c.x + Math.cos(a) * 0.08, y: c.y + 0.03, z: c.z + Math.sin(a) * 0.08, vx: Math.cos(a) * 0.12, vz: Math.sin(a) * 0.12, vy: rnd(0.22, 0.32),
            t: 0, life: rnd(5, 6.5), s0: rnd(0.08, 0.12), s1: rnd(0.7, 1.0), spin: rnd(0, 6.28), spinV: rnd(-0.3, 0.3), a: rnd(0.3, 0.4), ph: rnd(0, 6.28), size: 0, alpha: 0 }); }
      }
    }

    // move and fade
    const fade = 1 - 0.35 * dusk;   // thinner smoke at dusk, so it doesn't read as a pale fog against the dark
    const age = (P, f) => { for (let i = P.live.length - 1; i >= 0; i--) { const p = P.live[i]; p.t += dt; if (p.t >= p.life) { P.live[i] = P.live[P.live.length - 1]; P.live.pop(); continue; } f(p, p.t / p.life); } P.flush(); };
    age(smoke, (p, e) => {
      p.x += (p.vx + wind * e + Math.sin(time * 0.7 + p.ph) * 0.04) * dt; p.z += (p.vz + Math.cos(time * 0.6 + p.ph) * 0.04) * dt; p.y += p.vy * (1 - 0.4 * e) * dt;
      p.spin += p.spinV * dt; p.size = p.s0 + (p.s1 - p.s0) * Math.sqrt(e); p.alpha = p.a * Math.min(1, e * 6) * (1 - e) * (1 - e) * 1.6 * fade;
    });
    age(sparks, (p, e) => {
      p.vy -= 0.9 * dt; p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
      p.x += (p.vx + Math.sin(time * 9 + p.ph) * 0.25 + wind) * dt; p.z += (p.vz + Math.cos(time * 8 + p.ph) * 0.25) * dt; p.y += p.vy * dt;
      p.size = p.s0 * (1 - 0.5 * e); p.alpha = (1 - e) * (0.75 + 0.25 * Math.sin(time * 30 + p.ph));   // a little flicker
    });
    if (chim) age(chim, (p, e) => {
      p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
      p.x += (p.vx + wind * 1.4 * e + Math.sin(time * 0.8 + p.ph) * 0.03) * dt; p.z += (p.vz + Math.cos(time * 0.7 + p.ph) * 0.03) * dt; p.y += p.vy * (1 - 0.3 * e) * dt;
      p.spin += p.spinV * dt; p.size = p.s0 + (p.s1 - p.s0) * Math.sqrt(e); p.alpha = p.a * Math.min(1, e * 5) * (1 - e) * (1 - e) * 1.6 * fade;
    });
    if (steam) age(steam, (p, e) => {
      p.vx *= 1 - dt * 2; p.vy += 0.25 * dt; p.x += (p.vx + wind * 0.5) * dt; p.z += p.vz * dt; p.y += p.vy * dt;
      p.spin += p.spinV * dt; p.size = p.s0 + (p.s1 - p.s0) * e; p.alpha = p.a * Math.min(1, e * 8) * (1 - e);
    });

    // at dusk the smoke goes grey-blue and the sparks read brighter against the dark
    smoke.mat.uniforms.tint.value.copy(DAY_SMOKE).lerp(DUSK_SMOKE, dusk);
    if (chim) chim.mat.uniforms.tint.value.copy(smoke.mat.uniforms.tint.value);
    if (steam) steam.mat.uniforms.tint.value.setScalar(1 - 0.45 * dusk);
    sparks.mat.uniforms.tint.value.setScalar(1 + 0.4 * dusk);
    flutter.update(dt, time, dusk);
    flies.update(dt, time, dusk);
  }
  const flutter = butterflies(scene, Math.round(8 * k), sloths, roam);
  const flies = fireflies(scene, Math.round(70 * k), roam);
  return { update, flutter, stats: () => ({ smoke: smoke.live.length, chimney: chim ? chim.live.length : 0, sparks: sparks.live.length, steam: steam ? steam.live.length : 0, landed: flutter.landed() }) };
}

// ---------------------------------------------------------------- butterflies: two wing quads each, hinged on the body and flapped in the shader; all in one draw
// A butterfly wanders between random spots in the clearing. Every 10 to 30 s it picks a sloth that has no butterfly on it,
// flies to the tip of its nose (followed every frame, so it lands on a swaying napper too), sits there 5 to 9 s slowly
// opening and closing its wings, then flutters off. At dusk they fold away (scale to nothing) and the fireflies take over.
const wingTex = () => canvasTex(64, (g, s) => {
  // one wing, hinge at the left edge (u = 0), the front of the butterfly at the top (v = 1)
  const wing = (path) => { g.beginPath(); path(); g.closePath(); };
  const fore = () => { g.moveTo(1, 30); g.bezierCurveTo(14, 4, 46, -2, 62, 6); g.bezierCurveTo(60, 20, 46, 30, 1, 34); };
  const hind = () => { g.moveTo(1, 32); g.bezierCurveTo(30, 34, 52, 44, 44, 56); g.bezierCurveTo(34, 64, 10, 60, 1, 40); };
  for (const f of [fore, hind]) { wing(f); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 5; g.strokeStyle = "#3a2a22"; g.stroke(); }
  g.fillStyle = "rgba(58,42,34,.85)"; for (const [x, y, r] of [[52, 9, 2.2], [44, 6, 1.8], [36, 48, 3.2]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.fillStyle = "#fff8e0"; for (const [x, y] of [[57, 9], [49, 6]]) { g.beginPath(); g.arc(x, y, 1.4, 0, 7); g.fill(); }
  g.fillStyle = "#2b1f1a"; g.fillRect(0, 22, 3, 30);   // the body along the hinge
});
const PASTEL = [0xffb3cf, 0xffd36e, 0x9fd3ff, 0xffa06a, 0xc9a6ff, 0xfff1a8, 0x7fc8ff, 0xff8fa8];

// where a sloth's nose sits, in its head bone's space: the frontmost head-weighted vertex of the rest pose
function noseOf(o) {
  let m = null; o.traverse((c) => { if (!m && c.isSkinnedMesh) m = c; }); if (!m) return null;
  const sk = m.skeleton, hi = sk.bones.findIndex((b) => b.name === "head"); if (hi < 0) return null;
  const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, v = new THREE.Vector3();
  let best = null, bz = Infinity;
  for (let i = 0; i < pos.count; i++) {
    let w = 0; for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === hi) w += sw.getComponent(i, j);
    if (w < 0.9) continue;
    v.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix);
    if (v.z < bz) { bz = v.z; best = v.clone(); }        // glTF: the character faces -Z
  }
  if (!best) return null;
  best.z -= 0.03;                                         // a hair in front of the nose, so the butterfly sits on it, not in it
  return { bone: sk.bones[hi], local: best.applyMatrix4(sk.boneInverses[hi]) };
}

function butterflies(scene, n, sloths, roam) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.5, 1, 0, -0.5, 1, 0, 0.5, 0, 0, 0.5, 0, 0, -0.5, -1, 0, -0.5, -1, 0, 0.5, 0, 0, 0.5], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  const P = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), W = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), C = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  P.setUsage(THREE.DynamicDrawUsage); W.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("iP", P); geo.setAttribute("iW", W); geo.setAttribute("iC", C); geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: wingTex() }, light: { value: 1 } },
    vertexShader: `attribute vec4 iP; attribute vec4 iW; attribute vec3 iC; varying vec2 vUv; varying vec3 vC;
      void main() { vUv = uv; vC = iC;
        float a = iW.x, ax = abs(position.x);
        vec3 p = vec3(position.x * cos(a), ax * sin(a), position.z);            // wings raised by a about the body
        float cp = cos(iW.w), sp = sin(iW.w); p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);   // body pitch
        float cy = cos(iP.w), sy = sin(iP.w); p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);  // heading
        gl_Position = projectionMatrix * viewMatrix * vec4(iP.xyz + p * iW.y, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float light; varying vec2 vUv; varying vec3 vC;
      void main() { vec4 t = texture2D(map, vUv); if (t.a < 0.5) discard; gl_FragColor = vec4(t.rgb * vC * light, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);
  const noses = new Map(), V3 = () => new THREE.Vector3(), tmp = V3();
  const nosePos = (s, out) => { let n = noses.get(s); if (n === undefined) { n = noseOf(s.o); noses.set(s, n); } if (!n) return null; n.bone.updateWorldMatrix(true, false); return out.copy(n.local).applyMatrix4(n.bone.matrixWorld); };
  const spot = (out) => { const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * roam; return out.set(Math.cos(a) * r, rnd(0.5, 2.4), Math.sin(a) * r); };
  const bs = [];
  for (let i = 0; i < n; i++) {
    const c = new THREE.Color(PASTEL[i % PASTEL.length]); C.setXYZ(i, c.r, c.g, c.b);
    const b = { p: spot(V3()), v: V3(), to: spot(V3()), yaw: rnd(0, 6.28), ph: rnd(0, 6.28), size: rnd(0.07, 0.09), state: "fly", sloth: null, t: 0, next: rnd(4, 20) + i * 2, flap: 0.5 };
    bs.push(b);
  }
  function update(dt, time, dusk) {
    const show = 1 - Math.min(1, dusk * 2);
    for (let i = 0; i < n; i++) {
      const b = bs[i]; b.t += dt; b.next -= dt;
      if (b.state === "fly") {
        // now and then, head for a free sloth's nose
        if (b.next <= 0 && show > 0.9 && sloths.length) {
          const free = sloths.filter((s) => !bs.some((o) => o.sloth === s)); b.next = rnd(10, 30);
          if (free.length) { b.sloth = free[Math.floor(Math.random() * free.length)]; b.state = "go"; }
        }
        if (b.p.distanceTo(b.to) < 0.4) spot(b.to);
      }
      if (b.state === "go" && (!nosePos(b.sloth, b.to) || show < 0.9)) { b.state = "fly"; b.sloth = null; spot(b.to); }
      if (b.state === "sit") {
        if (!nosePos(b.sloth, b.p)) b.t = 99;
        b.flap = 1.2 - 0.9 * Math.max(0, Math.sin(b.t * 1.1 + b.ph));      // wings slowly open and fold
        W.setXYZW(i, b.flap, b.size * show * Math.min(1, (b.sloth?.sc || 2.6) / 2.6), 0, -0.1);   // smaller on a baby's nose
        if (b.t > b.stay || show < 0.9) { b.state = "fly"; b.sloth = null; b.v.set(rnd(-0.3, 0.3), 0.6, rnd(-0.3, 0.3)); spot(b.to); b.next = rnd(10, 30); }
      } else {
        // fluttering flight: steer at the target, with a jittery bob and weave
        const d = tmp.copy(b.to).sub(b.p), dist = d.length(), near = b.state === "go" ? Math.min(1, dist / 0.5) : 1;
        const speed = (0.7 + 0.25 * Math.sin(time * 1.7 + b.ph)) * (0.25 + 0.75 * near);
        d.multiplyScalar(speed / Math.max(dist, 1e-3));
        d.x += Math.sin(time * 3.1 + b.ph) * 0.35 * near; d.z += Math.cos(time * 2.7 + b.ph * 1.3) * 0.35 * near; d.y += Math.sin(time * 7 + b.ph) * 0.5 * near;
        b.v.lerp(d, 1 - Math.exp(-4 * dt)); b.p.addScaledVector(b.v, dt);
        if (b.p.y < 0.3) b.p.y = 0.3;
        if (Math.hypot(b.v.x, b.v.z) > 0.05) { const want = Math.atan2(b.v.x, b.v.z); let dy = want - b.yaw; dy -= Math.round(dy / 6.2832) * 6.2832; b.yaw += dy * Math.min(1, dt * 6); }
        b.flap = 0.35 + 0.95 * Math.sin(time * (b.state === "go" && near < 0.3 ? 14 : 22) + b.ph);
        W.setXYZW(i, b.flap, b.size * show, 0, 0.25);
        if (b.state === "go" && dist < 0.03) { b.state = "sit"; b.t = 0; b.stay = rnd(5, 9); b.p.copy(b.to); }
      }
      P.setXYZW(i, b.p.x, b.p.y, b.p.z, b.yaw);
    }
    P.needsUpdate = W.needsUpdate = true;
    mat.uniforms.light.value = 1 - 0.5 * dusk;
  }
  return { update, list: bs, sloths, landed: () => bs.filter((b) => b.state === "sit").length,
    land: (i, k = 0) => { const b = bs[i]; b.sloth = sloths[k]; b.state = "go"; nosePos(b.sloth, b.to); b.p.copy(b.to).add(new THREE.Vector3(0.3, 0.2, 0)); } };   // for screenshots
}

// ---------------------------------------------------------------- fireflies at dusk: each drifts round its own home spot and blinks on its own slow rhythm
function fireflies(scene, n, roam) {
  const glow = canvasTex(32, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, "rgba(250,255,210,1)"); gr.addColorStop(0.25, "rgba(220,255,120,.75)"); gr.addColorStop(1, "rgba(180,255,90,0)"); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  const P = pool(scene, n, glow, THREE.AdditiveBlending, 6);
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.28), r = i < n * 0.6 ? roam * (0.75 + 0.5 * Math.random()) : Math.sqrt(Math.random()) * roam;   // most along the forest edge, some in the camp
    P.live.push({ hx: Math.cos(a) * r, hy: rnd(0.3, i % 4 ? 2.2 : 5), hz: Math.sin(a) * r, x: 0, y: 0, z: 0, ph: rnd(0, 6.28), per: rnd(2.5, 5.5), f: rnd(0.3, 0.7), size: 0, alpha: 0, spin: 0 });
  }
  function update(dt, time, dusk) {
    if (dusk <= 0) { if (P.live[0].alpha) { P.live.forEach((p) => (p.alpha = 0)); P.flush(); } return; }
    for (const p of P.live) {
      p.x = p.hx + Math.sin(time * 0.31 * p.f + p.ph) * 0.8 + Math.sin(time * 0.9 * p.f + p.ph * 2) * 0.25;
      p.z = p.hz + Math.cos(time * 0.27 * p.f + p.ph) * 0.8 + Math.cos(time * 0.8 * p.f + p.ph * 3) * 0.25;
      p.y = p.hy + Math.sin(time * 0.5 * p.f + p.ph) * 0.35;
      const c = ((time + p.ph * p.per) % p.per) / p.per, blink = c < 0.5 ? Math.sin((c / 0.5) * Math.PI) : 0;   // glow up and fade, then dark a while
      p.alpha = dusk * (0.15 + 0.85 * blink); p.size = 0.14 + 0.14 * blink;
    }
    P.flush();
  }
  return { update };
}
