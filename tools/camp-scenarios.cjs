// Canopy Camp scenarios: an optional behaviour diagnostic (not a gate: Adriaen, 2026-11-14). camp-replay.cjs walks one short tour; this runs many
// (tools/tours/scenarios.json): real taps on the page's menus, keys, the ⚙️ menu, whole camp days with the camp sped up
// (errands, naps, the hammock and laundry climbs, cards, s'mores, gifts, the operator's day), saved state restored on load,
// and the URL options. Same virtual clock and seeded random numbers as the replay (camp-page.cjs); the audio clock reads the
// virtual clock too. At each mark it writes rows-N.txt (the replay's rounded rows), exact-N.txt (every object's world
// matrix, material numbers, uniforms and buffers as bit-exact hashes), state-N.json (you, the camera, the jeep, the clocks,
// the day, the menus, localStorage, every sloth's and the operator's own state, the tour's log) and console.txt.
// Usage (from the repo root, after npm install):
//   npm run scenarios -- run --root <checkout> --out <dir> [--port 9050] [--shots] [name ...]   (no names: all of them)
//   npm run scenarios -- compare <dirA> <dirB> [name ...]
// Base against head: put the base in a second checkout (git worktree add ../base main, or git archive main | tar -x -C ../base),
// run the scenarios into two folders with this same tool, and compare them. A clean-up may change what the camp does, so a
// DIFF is something to look at (is the player's experience any worse?), not a failure in itself. Run the base twice first
// when a scenario is new, to see that it repeats itself exactly. The API's shape (which window.__ names
// and which members an API object has) is listed beside, not counted: a clean-up may change it on purpose.
// A tour is [[frame, "js"], ...]: the js runs in the page after that frame, with the helpers on window.__T (T.tap, T.choose,
// T.near, T.key, T.click, T.slider, ...) and the camp's APIs: T.op, T.acts, T.lab, T.life, T.jeep, T.car, T.audio, T.clocks,
// T.spots (from the modules' exports, or the old window.__ names on an older checkout).
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const page = require('./camp-page.cjs');
const argv = process.argv.slice(2), mode = argv[0];
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const TOURS = path.join(__dirname, 'tours'), LIST = JSON.parse(fs.readFileSync(path.join(TOURS, 'scenarios.json'), 'utf8'));
const pos = []; for (let i = 1; i < argv.length; i++) { if (['--root', '--out', '--port'].includes(argv[i])) { i++; continue; } if (!argv[i].startsWith('--')) pos.push(argv[i]); }   // dirs and names
const names = (from) => (pos.length > from ? pos.slice(from) : Object.keys(LIST));

// ---------------------------------------------------------------- in the page: the bit-exact dump
function exact() {
  const S = window.__scene, rows = [], f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  const mk = () => { let h1 = 0x811c9dc5 | 0, h2 = 0x1234567 | 0; return { n(v) { f64[0] = v; h1 = Math.imul(h1 ^ u32[0], 16777619); h2 = Math.imul(h2 ^ u32[1], 0x5bd1e995) + (h1 >>> 7) | 0; h1 = Math.imul(h1 ^ u32[1], 16777619); }, s(str) { for (let i = 0; i < str.length; i++) { h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619); h2 = Math.imul(h2 + str.charCodeAt(i), 0x5bd1e995) ^ (h1 >>> 9); } }, out() { return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'); } }; };
  const buf = (a) => { let h = 0x811c9dc5 | 0; const v = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), w = v.length >> 2, dv = new DataView(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < w; i++) h = Math.imul(h ^ dv.getUint32(i * 4, true), 16777619); for (let i = w * 4; i < v.length; i++) h = Math.imul(h ^ v[i], 16777619); return (h >>> 0).toString(16); };
  const val = (H, v, depth = 0) => { if (typeof v === 'number') H.n(v); else if (typeof v === 'boolean') H.n(v ? 1 : 0); else if (typeof v === 'string') H.s(v); else if (!v) H.s('null');
    else if (v.isColor) { H.n(v.r); H.n(v.g); H.n(v.b); } else if (v.isVector2) { H.n(v.x); H.n(v.y); } else if (v.isVector3) { H.n(v.x); H.n(v.y); H.n(v.z); } else if (v.isVector4 || v.isQuaternion) { H.n(v.x); H.n(v.y); H.n(v.z); H.n(v.w); }
    else if (v.isMatrix3 || v.isMatrix4) { for (const e of v.elements) H.n(e); } else if (v.isTexture) { H.s('tex'); H.n(v.image ? (v.image.width || 0) : -1); H.n(v.image ? (v.image.height || 0) : -1); H.n(v.wrapS); H.n(v.wrapT); H.n(v.magFilter); H.n(v.minFilter); H.n(v.anisotropy); H.s(v.colorSpace || ''); H.n(v.flipY ? 1 : 0); H.n(v.offset.x); H.n(v.offset.y); H.n(v.repeat.x); H.n(v.repeat.y); H.n(v.rotation); H.n(v.channel); }
    else if (ArrayBuffer.isView(v)) H.s(buf(v)); else if (Array.isArray(v)) { H.n(v.length); if (depth < 3) for (const e of v) val(H, e, depth + 1); } else H.s('obj'); };
  S.updateMatrixWorld(true);
  const MATKEYS = ['type', 'transparent', 'opacity', 'side', 'blending', 'depthWrite', 'depthTest', 'alphaTest', 'visible', 'color', 'emissive', 'emissiveIntensity', 'map', 'lightMap', 'lightMapIntensity', 'emissiveMap', 'alphaMap', 'vertexColors', 'fog', 'size', 'sizeAttenuation', 'rotation', 'forceSinglePass', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'toneMapped', 'flatShading', 'wireframe', 'colorWrite', 'premultipliedAlpha', 'dithering', 'shadowSide', 'name'];
  const keys = new Set();   // the shader hooks' program keys: code, not state (listed with the API's shape)
  S.traverse((o) => {
    let vis = true, p = o; while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
    let names = []; p = o; while (p && p !== S) { names.unshift(p.name || p.type); p = p.parent; }
    const H = mk(); H.n(vis ? 1 : 0); H.n(o.visible ? 1 : 0); for (const e of o.matrixWorld.elements) H.n(e); const hm = H.out();
    H.n(o.renderOrder); H.n(o.frustumCulled ? 1 : 0); H.n(o.castShadow ? 1 : 0); H.n(o.receiveShadow ? 1 : 0); H.n(o.layers.mask);
    const G = mk(), M = mk();
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
      const g = o.geometry;
      if (g) { G.n(g.index ? g.index.count : -1); if (g.index) G.s(buf(g.index.array)); G.n(g.drawRange.start); G.n(g.drawRange.count === Infinity ? -1 : g.drawRange.count); for (const k of Object.keys(g.attributes).sort()) { const at = g.attributes[k]; G.s(k); G.n(at.count); G.n(at.itemSize); G.s(buf(at.array)); } }
      if (o.isInstancedMesh) { G.n(o.count); G.s(buf(o.instanceMatrix.array.subarray(0, o.count * 16))); if (o.instanceColor) G.s(buf(o.instanceColor.array.subarray(0, o.count * 3))); }
      for (const m of [].concat(o.material)) { for (const k of MATKEYS) if (k in m) { M.s(k); val(M, m[k]); }
        if (m.defines) M.s(JSON.stringify(m.defines));
        if (m.uniforms) for (const k of Object.keys(m.uniforms).sort()) { M.s(k); val(M, m.uniforms[k].value); }
        M.n(m.onBeforeCompile ? 1 : 0); if (typeof m.customProgramCacheKey === 'function') keys.add(String(m.customProgramCacheKey()).length + ':' + names.join('/')); }
    }
    if (o.isLight) { M.s(o.type); M.n(o.intensity); val(M, o.color); if (o.groundColor) val(M, o.groundColor); if (o.distance !== undefined) M.n(o.distance); if (o.decay !== undefined) M.n(o.decay); if (o.angle !== undefined) M.n(o.angle); if (o.penumbra !== undefined) M.n(o.penumbra); M.n(o.castShadow ? 1 : 0); }
    if (o.isCamera) { for (const e of o.projectionMatrix.elements) M.n(e); }
    rows.push([names.join('/'), hm, H.out(), G.out(), M.out()].join(' '));
  });
  const H = mk(); if (S.fog) { val(H, S.fog.color); H.n(S.fog.density ?? 0); } if (S.background && S.background.isColor) val(H, S.background);
  const C = window.__T.cam; if (C) { C.updateMatrixWorld(true); for (const e of C.matrixWorld.elements) H.n(e); for (const e of C.projectionMatrix.elements) H.n(e); H.n(C.fov); H.n(C.far); H.n(C.near); }
  rows.push('SCENE fog+background+camera ' + H.out());
  return { rows, progKeys: [...keys].sort() };
}

// ---------------------------------------------------------------- in the page: the tours' helpers and the state dump
function helpers([base, present]) {
  const T = window.__T = { log: [], mods: {} };
  const mod = async (n) => (T.mods[n] ??= await import(base + n).catch((e) => ({ __err: String(e) })));
  // modules every checkout has, then the newer ones this checkout has (looked up on disk, so a missing one is never asked for)
  const MODS = ['camp/daytime.js', 'camp/player.js', 'camp/weather.js', 'camp/core.js', 'camp/hud.js', 'camp/layout.js', 'camp/forest.js', 'camp/jeep.js', 'camp/campProps.js', 'camp/sloths.js', 'camp/food.js', 'camp/operator.js', 'camp/car.js', 'camp/audio.js', 'camp/clock.js', 'camp/radio.js'];
  T.load = async () => { for (const n of MODS) await mod(n); for (const n of present) await mod(n);
    T.me = T.mods['camp/player.js'].me; T.cam = T.mods['camp/core.js'].camera; T.day = T.mods['camp/daytime.js'].day;
    return Object.entries(T.mods).filter(([, m]) => m.__err).map(([n, m]) => n + ': ' + m.__err); };
  // the camp's APIs: the module's export where it has one, else the window.__ name an older checkout set
  const api = (n, k, g) => T.mods[n]?.[k] ?? window[g];
  Object.defineProperties(T, {
    op: { get: () => api('camp/operator.js', 'opApi', '__op') }, acts: { get: () => T.mods['camp/chores.js']?.acts ?? api('camp/campLife.js', 'acts', '__acts') },   // chores.js since campLife.js went
    lab: { get: () => api('camp/sloth/hooks.js', 'labApi', '__lab') }, life: { get: () => api('camp/sloth/hooks.js', 'campLife', '__campLife') ?? (T.mods['camp/sloth/hooks.js']?.slothLife && { ...T.mods['camp/places.js'], ...T.mods['camp/sloth/hooks.js'].slothLife }) },   // since 2026-11-14 the places are camp/places.js and the sloths' part is slothLife
    jeep: { get: () => { const j = api('camp/jeep.js', 'jeepApi', '__jeep'), s = T.mods['camp/jeepSeat.js']?.seatApi; return j && s ? { ...j, ...s } : j; } },   // the seats have been jeepSeat.js seatApi since 2026-11-14 car: { get: () => api('camp/car.js', 'carApi', '__car') },
    audio: { get: () => api('camp/audio.js', 'audio', '__audio') }, clocks: { get: () => api('camp/clock.js', 'clocks', '__clocks') },
    spots: { get: () => api('camp/sloth/state.js', 'spots', '__spots') }, radio: { get: () => api('camp/radio.js', 'radio', '__radio') },
    fx: { get: () => T.mods['camp/fx.js']?.fx ?? T.mods['camp/sloths.js']?.fx },
  });
  // what the old debug hooks did: send a camp sloth on an errand (if it is home), and the hour to 23
  T.errand = (name) => { const L = T.lab, s = L?.camp.find((q) => q.name === name); if (s && s.trip.phase === 'home') L.leave(s); return s; };
  T.rest = () => T.day.setHour(23, true);
  const obj = (o) => typeof o === 'string' ? window.__scene.getObjectByName(o) : o;
  T.centre = (o) => { const B = T.cam.position.constructor; const v = new B(); o = obj(o); const pts = []; o.updateWorldMatrix(true, true); o.traverse((m) => { if (m.isMesh && m.geometry) { m.geometry.computeBoundingSphere(); pts.push(m.geometry.boundingSphere.center.clone().applyMatrix4(m.matrixWorld)); } }); if (!pts.length) return o.getWorldPosition(v); for (const p of pts) v.add(p); return v.multiplyScalar(1 / pts.length); };
  // stand `dist` from the thing, on the side given by `from` (a world x,z to come from; default the fire), and look at it
  T.near = (o, dist = 1.6, from = [0, 0]) => { const c = T.centre(o), me = T.me; let dx = from[0] - c.x, dz = from[1] - c.z; const L = Math.hypot(dx, dz) || 1; me.pos.set(c.x + dx / L * dist, 0, c.z + dz / L * dist); me.vel.set(0, 0, 0); T.face(o); T.log.push(['near', typeof o === 'string' ? o : o.name, +me.pos.x.toFixed(4), +me.pos.z.toFixed(4)]); };
  T.face = (o) => { const c = T.centre(o), me = T.me, e = T.cam.position; const dx = c.x - e.x, dy = c.y - e.y, dz = c.z - e.z; me.yaw = Math.atan2(-dx, -dz); me.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.hypot(dx, dz)))); };
  T.screen = (o) => { const c = T.centre(o).project(T.cam); return [(c.x + 1) / 2 * innerWidth, (1 - c.y) / 2 * innerHeight, c.z]; };
  // a real tap: pointerdown and pointerup on the canvas at the thing's place on screen (input.js tap())
  T.tapAt = (x, y) => { const c = document.getElementById('c'); for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true })); };
  T.tap = (o) => { const [x, y, z] = T.screen(o); T.tapAt(x, y); const m = T.menu(); T.log.push(['tap', typeof o === 'string' ? o : o.name, Math.round(x), Math.round(y), +z.toFixed(4), m]); return m; };
  const menuEl = () => [...document.body.children].find((e) => e.tagName === 'DIV' && e.style.transform.includes('-100%') && e.style.zIndex === '3' && e.querySelector('button'));   // a label with the same style can come first
  T.menu = () => { const m = menuEl(); return m && m.style.display !== 'none' ? [...m.querySelectorAll('button')].map((b) => b.textContent) : null; };
  T.menuPos = () => { const m = menuEl(); return m ? [m.style.display, m.style.left, m.style.top] : null; };
  T.choose = (start) => { const m = menuEl(); const b = m && m.style.display !== 'none' ? [...m.querySelectorAll('button')].find((b) => b.textContent.startsWith(start)) : null; T.log.push(['choose', start, b ? b.textContent : null]); if (b) b.click(); return !!b; };
  T.call = (label, f) => { let r; try { r = f(); } catch (e) { r = 'THROW ' + e.message; } T.log.push([label, r === undefined ? null : r]); return r; };
  T.slider = (h) => { const e = document.getElementById('time'); e.value = String(h); e.dispatchEvent(new Event('input', { bubbles: true })); T.log.push(['slider', h, e.value, document.getElementById('clock').textContent]); };
  T.click = (id) => { document.getElementById(id).click(); T.log.push(['click', id, document.getElementById(id).textContent]); };
  T.key = (code, down) => { dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true })); T.log.push(['key', code, down]); };
  T.clock = (n) => (T.clocks || []).find((c) => c.name === n);
  const flat = (v, d = 0) => { if (v === null || v === undefined) return null; const t = typeof v; if (t === 'number' || t === 'string' || t === 'boolean') return v; if (t === 'function') return 'fn';
    if (v.isVector3 || v.isVector2 || v.isQuaternion || v.isEuler || v.isColor) return v.toArray().slice(0, 4); if (v.isObject3D) return 'obj:' + (v.name || v.type) + (v.visible ? '' : ':hidden'); if (v.isAnimationAction) return 'clip:' + v.getClip().name + '@' + v.time; if (v.isAnimationMixer) return 'mixer';
    if (Array.isArray(v)) return d < 3 ? v.slice(0, 40).map((e) => flat(e, d + 1)) : 'arr' + v.length; if (v instanceof Set || v instanceof Map) return 'set' + v.size; if (d >= 3) return 'deep';
    const o = {}; for (const k of Object.keys(v).sort()) o[k] = flat(v[k], d + 1); return o; };
  T.flat = flat;
  const prim = (v) => v === null || v === undefined ? null : ['number', 'string', 'boolean'].includes(typeof v) ? v : (v.isVector3 || v.isQuaternion || v.isEuler) ? v.toArray().slice(0, 4) : undefined;
  // the plain fields, leaving out unset ones (null, undefined, false), so a field that is declared up front but not set yet
  // reads the same as one that is not there
  const shallow = (o) => { const r = {}; for (const k of Object.keys(o).sort()) { const v = prim(o[k]); if (v !== undefined && v !== null && v !== false) r[k] = v; } return r; };
  const nm = (s) => s ? (typeof s === 'string' ? s : s.name ?? 'wild') : null;
  const tryTo = (f) => { try { return f(); } catch (e) { return 'THROW ' + e.message; } };
  // every sloth: its place, its trip, its timers and flags, its clip
  const sloth = (s) => { const t = s.trip; return { name: s.name ?? null, wild: !!s.wild, sc: s.sc, p: s.p.toArray(), box: s.box.position.toArray(),
    trip: t ? flat(t) : null, flat: { ...shallow(s), trip: t ? shallow(t) : null, spot: s.spot ? shallow(s.spot) : null, gift: s.gift ? shallow(s.gift) : null },
    world: [...s.o.getWorldPosition(new s.o.position.constructor()).toArray(), ...s.o.quaternion.toArray()], parent: s.o.parent?.name || s.o.parent?.type || null,
    spot: s.spot ? [s.spot.name, s.spot.key ?? null, !!s.spot.home, nm(s.spot.who), s.spot.scale] : null, own: s.ownSpot ? s.ownSpot.name : null,
    b: ['asleep', 'dozing', 'wantFood', 'fixNext', 'food', 'cardsTo', 'napTo', 'once', 'roused', 'smore', 'gift', 'armRest', 'hand', 'mouth', 'zz'].map((k) => s[k] ? 1 : 0).join(''),
    smore: s.smore ? [s.smore.hold, !!s.smore.eating, !!s.smore.held] : null, roused: s.roused ? [s.roused.t, s.roused.dur, s.roused.back, s.roused.wave, s.roused.waved] : null,
    shells: s.shells.map((m) => m.visible ? 1 : 0).join(''), mouth: s.mouth ? [s.mouth.visible, ...s.mouth.scale.toArray()] : null,
    act: s.act ? [s.act.getClip().name, s.act.time, s.act.timeScale, s.act.paused, s.act.getEffectiveWeight()] : null }; };
  const CLAIMS = ['table:0', 'table:1', 'crate:0', 'crate:1', 'hammock:1', 'jeep:P', 'bed:0', 'bed:1', 'jeep:hood', 'jeep:driver', 'jeep:passenger', 'log:0', 'log:0:left', 'log:1', 'log:2', 'hammock:Hibi', 'seat:Sunny', 'jeep:Mango', 'line:Pip', 'tent:Hazel', 'branch:Figgy', 'branch:Bandit'];
  const OPK = ['kind', 'place', 'seated', 'lying', 'sleeping', 'look', 'face', 'gaze', 'ik', 'footLock', 'pass', 'cooking', 'fid', 'lean', 'eat', 'pail', 'stir', 'veg', 'happy', 'next', 'last', 'scr', 'prop'];
  const keysOf = (o) => o ? Object.keys(o).sort().join() : null;
  T.state = () => { const me = T.me, J = T.jeep, d = T.day, W = T.mods['camp/weather.js']?.weather, cam = T.cam, O = T.op, A = T.acts, L = T.lab, life = T.life, M = T.mods['camp/sloths.js'] || {};
    const st = { me: me ? { pos: me.pos.toArray(), yaw: me.yaw, pitch: me.pitch, sitK: me.sitK, drop: me.drop ?? null, vel: me.vel.toArray(), walkT: me.walkT, lastDrag: me.lastDrag, seat: me.seat ? { pos: me.seat.pos.toArray(), yaw: me.seat.yaw, drop: me.seat.drop ?? null, pitch: me.seat.pitch ?? null, car: me.seat.car ?? null, leave: typeof me.seat.leave } : null } : null,
      cam: cam ? [...cam.position.toArray(), ...cam.quaternion.toArray(), cam.fov, cam.far] : null,
      jeep: J ? { seated: J.seatedIn?.() ?? null, busy: [J.seatBusy?.('driver') ?? null, J.seatBusy?.('passenger') ?? null], doors: (J.doors || []).map((x) => [x.k, x.open, x.o.rotation.x, x.o.rotation.y]) } : null,
      car: T.car ? { inCar: T.car.inCar?.() ?? null, engine: T.car.engine?.() ?? null } : null,
      clocks: (T.clocks || []).map((c) => [c.name, c.shake, c.obj.rotation.z, c.base, c.lume ? c.lume.emissiveIntensity : null, c.hands ? c.hands.map((h) => h.rotation.z) : null, c.disc ? c.disc.rotation.z : null]),
      day: d ? { set: d.set, shown: d.shown, cycle: d.cycle, listeners: d.listeners.length } : null,
      weather: W ? { wet: W.wet, mode: W.mode ?? null } : null,
      ui: Object.fromEntries(['time', 'clock', 'cycle', 'weather', 'detail', 'lm', 'sound', 'q', 'toast', 'perf'].map((id) => { const e = document.getElementById(id); return [id, e ? [e.value ?? null, id === 'perf' ? '' : e.textContent, e.className, e.hidden, e.style.opacity] : null]; })),
      opts: document.getElementById('opts')?.hidden, stick: [document.getElementById('stick')?.hidden ?? null, getComputedStyle(document.getElementById('stick') || document.body).display], touch: document.body.className,
      menu: T.menu(), menuPos: T.menuPos(),
      ls: Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])),
      audio: T.audio ? { state: T.audio.state?.() ?? null } : null,
      mr: window.__mrN, rnd: window.__rndN ?? null, fast: window.__campFast ?? null,
      sloths: (M.sloths || []).map((s) => tryTo(() => sloth(s))),
      claims: life ? Object.fromEntries(CLAIMS.map((k) => [k, nm(life.holder(k))]).filter(([, v]) => v)) : null,
      movers: life ? life.movers().map(([p, r]) => [p.x, p.y, p.z, r]) : null, spots: (T.spots || []).map((q) => [q.name, !!q.home, nm(q.who), q.scale]),
      guests: L?.guests?.() ?? null,
      pois: L?.pois ? L.pois().map((P) => [P.name, P.slots.map((q) => [q.key, nm(q.who), q.h, q.yaw, q.p.toArray(), q.food.at.toArray(), q.food.back, q.food.grow ?? null, q.food.mesh ? [q.food.mesh.visible, ...q.food.mesh.scale.toArray(), q.food.mesh.material.color.getHex()] : null])]) : null,
      fx: T.fx ? T.fx.map((f) => [f.t, f.life, !!f.fly]) : null, hit: M.hit ? M.hit.length : null,
      op: O ? tryTo(() => { const o = O.op, dbg = O.dbg(); return { state: O.state(), op: Object.fromEntries(OPK.map((k) => [k, flat(o[k])]).filter(([, v]) => v !== null && v !== false && v !== 0)), buddy: o.buddy?.name ?? null, carry: o.carry ? [o.carry.s?.name, o.carry.k, flat(o.carry.from), flat(o.carry.q0)] : null, inHand: o.inHand ? [o.inHand.type, o.inHand.children.length, o.inHand.visible] : null,
        line: O.line(), why: O.why(), dbg: { inHand: dbg.inHand ?? null, w: dbg.w }, seats: O.seats(), root: [...O.root.position.toArray(), ...O.root.quaternion.toArray()], running: Object.entries(O.acts).filter(([, a]) => a.isRunning()).map(([n, a]) => [n, a.time, a.getEffectiveWeight(), a.timeScale]) }; }) : null,
      acts: A ? tryTo(() => ({ held: A.held, soup: flat(A.soup), burning: A.burning.map((b) => [b.t, b.slot]), level: A.level(), things: A.things.map((t) => [t.name, !!t.when(), A.ready(t), A.label ? A.label(t) : (t.label ? t.label() : null), t.why() || null, flat(t.look)]), food: flat(A.food()), cook: { can: A.cook.can(), wantsVeg: A.cook.wantsVeg(), stage: A.cook.stage, pail: flat(A.cook.pail), table: flat(A.cook.table) }, seats: A.seats.map((s) => [flat(s.c), s.top, !!s.bowl]) })) : null,
      radio: T.radio ? flat({ p: T.radio.position, r: T.radio.rotation, s: T.radio.scale }) : null,
      dom: [...document.body.children].filter((e) => e.tagName !== 'CANVAS' && e.tagName !== 'SCRIPT').map((e) => [e.tagName, e.id, e.className, e.hidden, e.style.cssText.replace(/\s+/g, ' ').slice(0, 400), e.id === 'perf' ? '' : e.textContent.slice(0, 300)]),
      labUi: document.getElementById('lab') ? [document.getElementById('lab').hidden, document.getElementById('labRead')?.textContent, [...document.querySelectorAll('#lab [data-do]')].map((b) => b.disabled ? 1 : 0).join('')] : null,
      optsButtons: [...(document.getElementById('opts')?.querySelectorAll('button') ?? [])].map((b) => b.textContent).join('|'),
      log: T.log.slice() };
    // the API's shape: reported beside the state, not compared as state (a clean-up may change it on purpose)
    const shape = { globals: Object.keys(window).filter((k) => k.startsWith('__') && !['__T', '__step', '__flushTimers', '__realTimeout', '__linked', '__mrN', '__rndN', '__evo'].includes(k)).sort().join(),
      jeep: keysOf(J), car: keysOf(T.car), op: keysOf(O), acts: keysOf(A), cook: keysOf(A?.cook), life: keysOf(life), lab: keysOf(L), sloths: keysOf(M), audio: keysOf(T.audio) };
    return { st, shape }; };
}

// ---------------------------------------------------------------- one scenario
async function runOne(name, sc, root, port, outDir, shots) {
  const EVO = !!sc.evalorder;
  // the seeded draws are counted (core.js rnd); with evalorder, each module also notes when it starts and how many
  // numbers were drawn by then
  const srv = page.serve(root, port, (f, d) => {
    if (!f.endsWith('.js') || !(EVO || f.endsWith('camp/core.js'))) return d;
    let t = d.toString('utf8');
    // the one shared stream of older checkouts, or every named stream (core.js rng) of newer ones, counted together
    if (f.endsWith('camp/core.js')) for (const at of ['const rnd = () => { seed |= 0;', 'const rnd = () => { seed = (seed + 0x6d2b79f5) | 0;']) t = t.replace(at, at + ' window.__rndN = (window.__rndN || 0) + 1;');
    return Buffer.from(!EVO ? t : `(window.__evo ??= []).push(${JSON.stringify(path.relative(root, f).replace('apps/canopy-prototype/', ''))} + ' @' + (window.__rndN || 0) + ' m' + (window.__mrN || 0));` + t); });
  const { browser, page: p } = await page.launch({ width: sc.vw || 480, height: sc.vh || 300, touch: !!sc.touch });
  try { return await drive(name, sc, root, port, outDir, shots, p, EVO); } finally { await browser.close().catch(() => {}); srv.close(); }
}
async function drive(name, sc, root, port, outDir, shots, p, EVO) {
  const FRAMES = sc.frames, EVERY = sc.every || 20;
  await page.routeThree(p);
  const { errs, cons, programs } = await page.watch(p);
  await p.addInitScript(page.virtualise);
  if ((sc.audio || 'tie') === 'tie') await p.addInitScript(() => { Object.defineProperty(BaseAudioContext.prototype, 'currentTime', { get() { return (performance.now() - 1000) / 1000; } }); });
  if (sc.audio === 'block') await p.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; window.AudioContext = undefined; window.webkitAudioContext = undefined; });
  if (sc.storage) await p.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, sc.storage);
  await page.loadCamp(p, port, sc.query || '', errs);
  const rndReady = await p.evaluate(() => [window.__rndN ?? null, window.__mrN ?? null]);
  await p.addStyleTag({ content: 'body > :not(canvas) { visibility: hidden !important; }' });
  const present = ['camp/sloth/hooks.js', 'camp/sloth/state.js', 'camp/fx.js', 'camp/places.js', 'camp/campLife.js', 'camp/chores.js', 'camp/jeepSeat.js'].filter((n) => fs.existsSync(path.join(root, 'apps/canopy-prototype', n)));
  await p.evaluate(helpers, [`http://localhost:${port}/apps/canopy-prototype/`, present]);
  const loadErr = await p.evaluate(() => window.__T.load());
  const TOUR = sc.tour ? JSON.parse(fs.readFileSync(path.join(TOURS, sc.tour), 'utf8')) : [];
  const marks = new Set(sc.marks || [1, ...Array.from({ length: Math.floor(FRAMES / EVERY) }, (_, i) => (i + 1) * EVERY)]);
  const stops = new Set([...marks, FRAMES]); for (const [f] of TOUR) if (f <= FRAMES) stops.add(f);
  const out = { frames: FRAMES, query: sc.query || '', loadErr, marks: {}, shape: {} }; let done = 0;
  const dir = path.join(outDir, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
  for (const m of [...stops].sort((x, y) => x - y)) {
    await page.stepFrames(p, m - done); done = m;
    for (const [f, js] of TOUR) if (f === m) await p.evaluate(`(async () => { ${js} })().catch((e) => { window.__T.log.push(['TOUR THROW at ${f}', String(e && e.message || e)]); })`);
    if (!marks.has(m)) continue;
    const f = await p.evaluate(page.fingerprint), ex = await p.evaluate(exact), { st, shape } = await p.evaluate(() => window.__T.state());
    shape.progKeys = ex.progKeys;
    out.marks[m] = { hash: sha(f.rows.join('\n')), exact: sha(ex.rows.join('\n')), state: sha(JSON.stringify(st)), objects: f.objects, draws: f.draws, tris: f.tris, calls: f.calls, rtris: f.rtris };
    out.shape[m] = shape;
    fs.writeFileSync(path.join(dir, `rows-${m}.txt`), f.rows.join('\n')); fs.writeFileSync(path.join(dir, `exact-${m}.txt`), ex.rows.join('\n')); fs.writeFileSync(path.join(dir, `state-${m}.json`), JSON.stringify(st, null, 1));
    if (shots) for (let t = 0; ; t++) { try { await p.screenshot({ path: path.join(dir, `frame-${m}.png`), timeout: 60000 }); break; } catch (e) { if (t >= 2) throw e; } }
  }
  out.programs = programs(); out.rndReady = rndReady; out.mrEnd = await p.evaluate(() => window.__mrN);
  if (EVO) { out.evalorder = await p.evaluate(() => window.__evo); out.rndAtEnd = await p.evaluate(() => window.__rndN); }
  out.errors = errs.slice(0, 20); out.console = cons.length;
  for (const k of ['hash', 'exact', 'state']) out[k + 'All'] = sha(Object.values(out.marks).map((m) => m[k]).join());
  fs.writeFileSync(path.join(dir, 'console.txt'), cons.join('\n'));
  fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(out, null, 1));
  return out;
}

// ---------------------------------------------------------------- compare two folders of runs
function compare(A, B, list) {
  const norm = (s) => s.replace(/localhost:\d+/g, 'localhost:PORT');
  let bad = 0;
  for (const n of list) {
    let a, b; try { a = JSON.parse(fs.readFileSync(path.join(A, n + '.json'))); b = JSON.parse(fs.readFileSync(path.join(B, n + '.json'))); } catch (e) { console.log(n.padEnd(12), 'MISSING', e.message.slice(0, 90)); bad++; continue; }
    const ms = Object.keys(a.marks), d = [], info = [];
    if (ms.join() !== Object.keys(b.marks).join()) d.push('marks differ in number');
    let rowsD = 0, exD = 0, stD = 0, cnt = 0; const exNames = new Set(), stKeys = new Set(), shapeKeys = new Set();
    for (const m of ms) { const x = a.marks[m], y = b.marks[m] || {};
      if (x.hash !== y.hash) rowsD++;
      if ([x.objects, x.draws, x.tris, x.calls, x.rtris].join() !== [y.objects, y.draws, y.tris, y.calls, y.rtris].join()) cnt++;
      const ea = fs.readFileSync(path.join(A, n, `exact-${m}.txt`), 'utf8').split('\n'), eb = fs.readFileSync(path.join(B, n, `exact-${m}.txt`), 'utf8').split('\n');
      if (ea.join('\n') !== eb.join('\n')) { exD++; for (let i = 0; i < Math.max(ea.length, eb.length); i++) if (ea[i] !== eb[i]) { const pa = (ea[i] || '').split(' '), pb = (eb[i] || '').split(' '); const ta = pa.slice(-4), tb = pb.slice(-4); exNames.add((pa.slice(0, -4).join(' ') || '?') + ' [' + ['matrix', 'object', 'geometry', 'material'].filter((_, k) => ta[k] !== tb[k]).join('+') + ']'); } }
      const sa = JSON.parse(norm(fs.readFileSync(path.join(A, n, `state-${m}.json`), 'utf8'))), sb = JSON.parse(norm(fs.readFileSync(path.join(B, n, `state-${m}.json`), 'utf8')));
      if (JSON.stringify(sa) !== JSON.stringify(sb)) { stD++; for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) if (JSON.stringify(sa[k]) !== JSON.stringify(sb[k])) stKeys.add(k); }
      const ha = a.shape?.[m] || {}, hb = b.shape?.[m] || {}; for (const k of new Set([...Object.keys(ha), ...Object.keys(hb)])) if (JSON.stringify(ha[k]) !== JSON.stringify(hb[k])) shapeKeys.add(k);
    }
    if (rowsD) d.push(`rounded rows differ at ${rowsD} marks`); if (exD) d.push(`exact rows differ at ${exD} marks: ${[...exNames].slice(0, 6).join('; ')}${exNames.size > 6 ? ' … ' + exNames.size + ' objects' : ''}`);
    if (stD) d.push(`state differs at ${stD} marks in: ${[...stKeys].join(',')}`); if (cnt) d.push(`counts differ at ${cnt} marks`);
    if (a.programs !== b.programs) d.push(`programs ${a.programs} vs ${b.programs}`);
    if (norm(JSON.stringify(a.errors)) !== norm(JSON.stringify(b.errors))) d.push(`errors differ: ${JSON.stringify(a.errors).slice(0, 200)} vs ${JSON.stringify(b.errors).slice(0, 200)}`);
    if (JSON.stringify(a.rndReady) !== JSON.stringify(b.rndReady) || a.mrEnd !== b.mrEnd) d.push(`random draws ${a.rndReady}/${a.mrEnd} vs ${b.rndReady}/${b.mrEnd}`);
    if (JSON.stringify(a.loadErr) !== JSON.stringify(b.loadErr)) d.push('helper load errors differ');
    if (a.evalorder) { const shared = b.evalorder.filter((x) => a.evalorder.includes(x)), mods = (l) => l.map((x) => x.split(' @')[0]);
      const gone = mods(a.evalorder).filter((x) => !mods(b.evalorder).includes(x)), added = mods(b.evalorder).filter((x) => !mods(a.evalorder).includes(x));
      if (JSON.stringify(shared) !== JSON.stringify(a.evalorder.filter((x) => !gone.includes(x.split(' @')[0])))) d.push('modules both have are evaluated in another order or after other draw counts');
      if (a.rndAtEnd !== b.rndAtEnd) d.push(`seeded draws by the end ${a.rndAtEnd} vs ${b.rndAtEnd}`);
      if (gone.length || added.length) info.push(`modules gone: ${gone.join(' ') || '-'}; new: ${added.join(' ') || '-'}`); }
    const ca = norm(fs.readFileSync(path.join(A, n, 'console.txt'), 'utf8')), cb = norm(fs.readFileSync(path.join(B, n, 'console.txt'), 'utf8'));
    if (ca !== cb) { const la = ca.split('\n'), lb = cb.split('\n'); const onlyA = la.filter((l) => !lb.includes(l)), onlyB = lb.filter((l) => !la.includes(l)); d.push(onlyA.length || onlyB.length ? `console differs: only A: ${JSON.stringify(onlyA).slice(0, 300)} only B: ${JSON.stringify(onlyB).slice(0, 300)}` : 'console: same lines in another order'); }
    if (shapeKeys.size) info.push(`API shape changed: ${[...shapeKeys].join(',')}`);
    if (d.length) bad++;
    console.log(n.padEnd(12), `${ms.length} marks`, `exact ${a.exactAll}/${b.exactAll}`, `programs ${a.programs}/${b.programs}`, `errors ${a.errors.length}/${b.errors.length}`, d.length ? 'DIFF: ' + d.join(' | ') : 'ALL SAME', info.length ? '(' + info.join('; ') + ')' : '');
  }
  console.log(bad ? `${bad} scenario(s) differ` : 'all same');
  return bad;
}

(async () => {
  if (mode === 'compare') process.exit(compare(path.resolve(pos[0]), path.resolve(pos[1]), names(2)) ? 1 : 0);
  if (mode !== 'run') { console.error('usage: camp-scenarios.cjs run --root <checkout> --out <dir> [--port N] [--shots] [name ...] | compare <dirA> <dirB> [name ...]'); process.exit(2); }
  const root = path.resolve(arg('root', path.resolve(__dirname, '..'))), outDir = path.resolve(arg('out', 'scenarios-out')), port = +arg('port', 9050), shots = flag('shots');
  fs.mkdirSync(outDir, { recursive: true });
  const list = names(0);
  for (const n of list) {
    const sc = LIST[n]; if (!sc) { console.error('no scenario named', n); process.exit(2); }
    for (let t = 1; ; t++) { try { const o = await runOne(n, sc, root, port, outDir, shots); console.log(`${n}: ${Object.keys(o.marks).length} marks, exact ${o.exactAll}, ${o.errors.length} errors`); break; }
      catch (e) { console.error(`${n}: try ${t} failed: ${e.message}`); if (t >= 3) { process.exitCode = 3; break; } } }
  }
  process.exit();
})();
