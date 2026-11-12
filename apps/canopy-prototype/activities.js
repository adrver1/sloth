// Camp activities for camp.html (thread "Plan camp activities", plan in project files canopy-hide-and-seek/activities-plan.md).
// Kept out of camp.html so the sibling threads' edits there don't collide; camp.html only wires taps and the frame loop in.
// Calm by design: no timer, no score, no fail. Walk up to a thing, it lights up when you can use it (camp/highlight.js), tap it. You carry one thing at a time.
// Chunk 1: wood on the fire. Take a log from the wood pile, carry it to the fire and tap: the fire flares for about a minute,
// then settles over a few minutes and never goes out. Up to three logs burn at once. The camp sloth nearest the fire blinks happily.
// Triangle budget: the carried log and each burning log are 6-sided cylinders (24 tris); sparks are single quads.
import * as THREE from "three";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NEAR = 2.5;                          // tap range
const HOLD = 60, SETTLE = 180, MAX_LOGS = 3;

const canvasTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
// a bark texture for logs: dark stripes along the length, a pale cut ring at one end of the strip
const barkTex = canvasTex(64, 32, (g, w, h) => { g.fillStyle = "#6b4a32"; g.fillRect(0, 0, w, h); g.strokeStyle = "#4a3222"; g.lineWidth = 2;
  for (let y = 3; y < h; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (y % 2 ? 1 : -1)); g.stroke(); } });
const logGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.6, 6, 1);   // 24 tris with caps
const logMat = new THREE.MeshLambertMaterial({ map: barkTex });

export function createActivities({ scene, camera, me, woodPile, woodTex, fire = V(0, 0, 0), fireCards = [], flames = [], fireLight, glowTex, burst, toast, spots = () => [], addBlocker, looks = {} }) {
  if (!camera.parent) scene.add(camera);
  // logs painted like the props thread's stack: its atlas (props/lived/wood_stack.jpg) has log ends on the top half and the logs
  // seen from above bottom right, so the sides take one log's strip (mirrored round, so no seam) and the caps one round end
  if (woodTex) {
    const px = (x, y) => [x / 1024, woodTex.flipY ? 1 - y / 1024 : y / 1024], uv = logGeo.attributes.uv, side = (6 + 1) * 2;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, ...(i < side ? px(540 + 62 * Math.abs(2 * u - 1), 555 + 455 * v) : px(440 + (u - 0.5) * 120, 92 + (v - 0.5) * 120))); }
    uv.needsUpdate = true; logMat.map = woodTex; logMat.needsUpdate = true;
  }   // so things held in your hand (children of the camera) are drawn
  // the wood pile: the props thread's pile when it is there, else a plain stack of the same logs in the same spot
  const pileAt = woodPile ? woodPile.clone() : V(-0.55, 0, -3.15);
  let stand = null;
  if (!woodPile) {
    const yaw = Math.atan2(-pileAt.x, -pileAt.z), g = new THREE.Group();
    [[-0.13, 0.06], [0, 0.06], [0.13, 0.06], [-0.065, 0.17], [0.065, 0.17], [0, 0.28]].forEach(([x, y]) => { const l = new THREE.Mesh(logGeo, logMat); l.rotation.z = Math.PI / 2; l.rotation.y = Math.PI / 2; l.position.set(x, y, 0); g.add(l); });
    g.position.copy(pileAt); g.rotation.y = yaw; scene.add(g); stand = g; addBlocker?.(pileAt, 0.5);
  }

  // what you carry, shown low in the bottom right of the view
  let held = null; const hand = new THREE.Group(); hand.position.set(0.36, -0.36, -0.85); hand.scale.setScalar(0.55); camera.add(hand);
  const handLog = new THREE.Mesh(logGeo, logMat); handLog.rotation.set(1.1, 0.5, 0.9); handLog.visible = false; hand.add(handLog);
  function hold(what) { held = what; handLog.visible = what === "log"; hand.userData.t = 0; }

  // the logs on the fire: each leans into the teepee, burns at full for HOLD s, then settles over SETTLE s and is gone
  const burning = [];
  const ANG = [0.4, 2.5, 4.6];
  function addLog() {
    const slot = [0, 1, 2].find((k) => !burning.some((b) => b.slot === k));
    const m = new THREE.Mesh(logGeo, logMat.clone()), a = ANG[slot];
    m.position.set(Math.cos(a) * 0.24, 0.2, Math.sin(a) * 0.24); m.lookAt(fire.x, 0.55, fire.z); m.rotateX(Math.PI / 2); scene.add(m);
    burning.push({ m, t: 0, slot }); pop = 1;
    for (let i = 0; i < 14; i++) spark();
    // the camp sloth nearest the fire turns to it with a slow, happy blink
    const near = spots().filter((p) => p.who).map((p) => p.who).sort((a, b) => a.o.position.distanceTo(fire) - b.o.position.distanceTo(fire))[0];
    if (near) setTimeout(() => { near.nod = 1.6; burst(near.o.position.clone().add(V(0, 0.75, 0)), "*happy blink*", 1, 2.2, 60); }, 900);
  }
  const level = () => burning.reduce((s, b) => s + (b.t < HOLD ? 1 : Math.max(0, 1 - (b.t - HOLD) / SETTLE)), 0);

  // a quick shower of sparks when a log goes on (a fixed little pool of quads)
  const sparks = [], sparkMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffb35a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  let pop = 0, flare = 0;
  function spark() {
    const s = sparks.find((p) => !p.live) || (sparks.length < 24 && (() => { const p = { o: new THREE.Sprite(sparkMat), v: V() }; scene.add(p.o); sparks.push(p); return p; })()); if (!s) return;
    const a = Math.random() * 6.28, out = 0.2 + Math.random() * 0.5;
    s.live = true; s.t = 0; s.life = 0.8 + Math.random() * 0.8; s.o.visible = true; s.o.position.set(fire.x + Math.cos(a) * 0.1, 0.45, fire.z + Math.sin(a) * 0.1); s.v.set(Math.cos(a) * out, 1.4 + Math.random() * 1.4, Math.sin(a) * out); s.o.scale.setScalar(0.07);
  }

  // things you can tap: an invisible sphere each, when it applies, what a tap does, and what lights up (looks[name]: the
  // props' own objects, so the highlight hugs the real wood pile; the stand-in stack when there is none)
  const things = [], hitList = [];
  function thing(name, at, r, when, act, look) {
    const box = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); box.position.copy(at).setY(at.y + r * 0.6); scene.add(box);
    const t = { name, at, box, when, act, look: looks[name] ?? look ?? null }; box.userData.thing = t; things.push(t); hitList.push(box); return t;
  }
  thing("woodpile", pileAt, 0.55, () => !held, () => { hold("log"); toast("Got a log 🪵"); }, stand);
  thing("fire", fire, 0.6, () => held === "log", () => {
    if (burning.length >= MAX_LOGS) { toast("The fire is roaring already 🔥"); return; }
    hold(null); addLog();
  });
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  return {
    // camp.html calls this on a tap before booping sloths: the nearest tappable thing under the finger, or null
    pick(ray) { const h = ray.intersectObjects(hitList, false)[0]; return h ? { distance: h.distance, thing: h.object.userData.thing } : null; },
    tap(hit) {
      const t = hit.thing;
      if (flat(me.pos, t.at) > NEAR + 0.6) { toast("Get a bit closer"); return true; }
      if (t.when()) { t.act(); return true; }
      if (t.name === "fire" && !held) { toast("Grab a log from the wood pile"); return true; }
      if (t.name === "woodpile" && held) { toast("Your paws are full"); return true; }
      return true;
    },
    update(dt, time) {
      // the held log sways a little as you walk
      hand.userData.t = (hand.userData.t || 0) + dt; hand.position.x = 0.1 + 0.26 * Math.min(1, camera.aspect);   // stays in view on a narrow phone
      hand.position.y = -0.36 + Math.sin(me.walkT * 7) * 0.01 + (1 - Math.min(1, hand.userData.t * 4)) * -0.2;
      // burning logs char and shrink as they settle; the fire's size follows how many are burning
      for (let i = burning.length - 1; i >= 0; i--) { const b = burning[i]; b.t += dt; const k = b.t < HOLD ? 0 : Math.min(1, (b.t - HOLD) / SETTLE);
        b.m.material.color.setScalar(1 - 0.75 * Math.min(1, b.t / 40)); b.m.scale.set(1 - 0.5 * k, 1 - 0.7 * k, 1 - 0.5 * k);
        if (k >= 1) { scene.remove(b.m); burning.splice(i, 1); } }
      flare += (level() - flare) * Math.min(1, dt * 1.5); pop = Math.max(0, pop - dt * 0.8);
      const f = 1 + 0.08 * flare + 0.12 * pop, w = 1 + 0.17 * flare + 0.15 * pop;   // wider more than taller: the pot hangs just over the flames
      for (const c of fireCards) c.scale.set(w, f, w);
      for (const s of flames) s.scale.multiplyScalar(w);
      if (fireLight) fireLight.intensity *= 1 + 0.45 * flare + 0.4 * pop;
      if (flare > 0.3 && Math.random() < dt * 3 * flare) spark();
      for (const s of sparks) { if (!s.live) continue; s.t += dt; s.o.position.addScaledVector(s.v, dt); s.v.y -= dt * 0.9; s.v.multiplyScalar(0.985);
        s.o.material.opacity = 1; s.o.scale.setScalar(0.07 * (1 - s.t / s.life)); if (s.t > s.life) { s.live = false; s.o.visible = false; } }
    },
    get held() { return held; }, burning, level, things,
    ready(t) { return t.when() && flat(me.pos, t.at) <= NEAR + 0.6; },   // the highlight lights a thing only when a tap would use it
  };
}
