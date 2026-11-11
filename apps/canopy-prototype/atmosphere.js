// Cozy camp atmosphere for camp.html: cheap particle effects round the fire, kept out of camp.html so the sibling threads' edits there don't collide.
// Batch 1: smoke curling up from the fire, sparks that pop more often as you walk close, and steam from the kettle spout.
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

// fire at the clearing centre; spout is the kettle spout tip in world space, or null when the props have no kettle
export function createAtmosphere({ scene, camera, fx, fire = new THREE.Vector3(0, 0, 0), spout = null }) {
  const k = fx > 1 ? 1.5 : fx ? 1 : 0.5;   // detail: low, medium, high
  const puff = puffTex();
  const smoke = pool(scene, Math.round(26 * k), puff, THREE.NormalBlending, 3);
  const steam = spout ? pool(scene, Math.round(16 * k), puff, THREE.NormalBlending, 4) : null;
  const sparks = pool(scene, Math.round(60 * k), sparkTex(), THREE.AdditiveBlending, 5);
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
    // steam: little wisps out of the spout, then up
    if (steam) {
      tSteam -= dt;
      while (tSteam <= 0) {
        tSteam += 1.8 / steam.n;
        steam.add({ x: spout.x, y: spout.y, z: spout.z, vx: rnd(0.12, 0.22), vz: rnd(-0.04, 0.04), vy: rnd(0.12, 0.2),
          t: 0, life: rnd(1.4, 1.9), s0: rnd(0.04, 0.06), s1: rnd(0.22, 0.32), spin: rnd(0, 6.28), spinV: rnd(-0.6, 0.6), a: rnd(0.45, 0.6), ph: rnd(0, 6.28), size: 0, alpha: 0 });
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
    if (steam) age(steam, (p, e) => {
      p.vx *= 1 - dt * 2; p.vy += 0.25 * dt; p.x += (p.vx + wind * 0.5) * dt; p.z += p.vz * dt; p.y += p.vy * dt;
      p.spin += p.spinV * dt; p.size = p.s0 + (p.s1 - p.s0) * e; p.alpha = p.a * Math.min(1, e * 8) * (1 - e);
    });

    // at dusk the smoke goes grey-blue and the sparks read brighter against the dark
    smoke.mat.uniforms.tint.value.copy(DAY_SMOKE).lerp(DUSK_SMOKE, dusk);
    if (steam) steam.mat.uniforms.tint.value.setScalar(1 - 0.45 * dusk);
    sparks.mat.uniforms.tint.value.setScalar(1 + 0.4 * dusk);
  }
  return { update, stats: () => ({ smoke: smoke.live.length, sparks: sparks.live.length, steam: steam ? steam.live.length : 0 }) };
}
