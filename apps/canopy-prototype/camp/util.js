// Canopy Camp helpers: the small functions every module used to paste in again (camp review world-15, crosscut-09, props-13).
// Nothing runs on import (no scene, no renderer, no DOM until a helper is called), so the pages' shared modules outside camp/
// (ground.js, atmosphere.js) can import it too. The seeded stream the layout draws from is not here: it lives in core.js.
//   V(x, y, z)                    a Vector3
//   sstep(a, b, x)                smoothstep: 0 below a, 1 above b
//   rand(a, b)                    a number between a and b from Math.random: for noise that must not touch any seeded stream
//   lcg(seed)                     a private random stream { rnd, R } (Park-Miller, 16807): its own numbers, so drawing from it
//                                 leaves the shared seeded stream alone. Same seed, same numbers as the copies it replaced
//   canvasTex(w, h, draw, opts)   a CanvasTexture painted by draw(ctx, w, h); opts { srgb = true, aniso = 4 }
//   polyDist(pts, x, z)           distance in x, z to a polyline, and the nearest point on it: [d, x, z]
//   lineDist(pts, x, z)           the same distance alone, without the array
//   tris(geometry)                its triangle count
//   lam(color, opts)              a MeshLambertMaterial of that colour
//   patchMaterial(mat, id, hook)  adds a shader hook after the material's current one, with a program cache key made of
//                                 the id, this hook's source, the key of the hook before it (its source, or its own key when
//                                 patchMaterial put it there, so stacked hooks all stay in the key) and the source of any
//                                 hook chained after it later by hand (one program per distinct code)
import * as THREE from "three";

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const rand = (a, b) => a + Math.random() * (b - a);

export function lcg(seed) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return { rnd, R: (a, b) => a + rnd() * (b - a) };
}

export function canvasTex(w, h, draw, { srgb = true, aniso = 4 } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t;
}

// the nearest point on each segment, kept when it is closer than the best so far
export function polyDist(pts, x, z) {
  let best = 1e9, bx = 0, bz = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z, dx = pts[i].x - ax, dz = pts[i].z - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t); if (d < best) { best = d; bx = ax + dx * t; bz = az + dz * t; }
  }
  return [best, bx, bz];
}
export function lineDist(pts, x, z) {
  let best = 1e9;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z, dx = pts[i].x - ax, dz = pts[i].z - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

export const lam = (color, opts) => new THREE.MeshLambertMaterial({ color, ...opts });

// a hook's part of the program key: patchMaterial's own wrappers carry their key (their source is the same generic wrapper)
const hookKey = (f) => (f ? (f.programKey ? f.programKey() : f.toString()) : "");
export function patchMaterial(mat, id, hook) {
  const prev = mat.onBeforeCompile;
  const own = (sh, r) => { prev?.call(mat, sh, r); hook(sh, r); };
  own.programKey = () => [id, hookKey(prev), hook.toString()].join("|");
  mat.onBeforeCompile = own;
  mat.customProgramCacheKey = () => (mat.onBeforeCompile === own ? own.programKey() : own.programKey() + "|" + hookKey(mat.onBeforeCompile));
  return mat;
}
