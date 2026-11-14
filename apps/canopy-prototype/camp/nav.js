// Canopy Camp wayfinding (Adriaen 2026-11-12: "fix wayfinding so sloths don't accidentally run into each other or other
// objects"; camp review operator-10, sloths-30: its own module). createNav(options) makes a grid over the clearing that
// marks every blocker (a [centre, radius] circle, grown by the walker's half-length), a ring round the fire and everything
// past the clearing's rim, and returns three functions over it:
//   isFree(p)            the cell p is in is free
//   clearLine(p, q)      the straight line from p to q crosses no blocked cell (sampled every 8 cm)
//   findPath(from, to)   an A* path on the grid, pulled straight where the way is clear, ending at `to` on the ground. A
//                        start or an end inside a blocker (a seat, the jeep's door) goes straight out to the nearest
//                        free cell. With no way through it is [to].
// options: blockers (campProps.js's live list of { at, r } circles: the grid is made again when its length changes, as when the tent's walls or an
// activity's prop are added), half (the grid covers -half..half in x and z), rim (blocked beyond this far from the
// middle), fireKeep (blocked within this of the middle: a wide berth round the fire), body (how far the walker keeps
// from a blocker's edge), cell (the cell size, 0.2 m). Nothing is built on import, and no random numbers are drawn.
import { V } from "./util.js";

export function createNav({ blockers, half, rim, fireKeep, body, cell = 0.2 }) {
  const GC = cell, GH = half, GN = Math.ceil(2 * GH / GC), tmp = V();
  let grid = null, gridFor = -1;
  const cellOf = (p) => [Math.max(0, Math.min(GN - 1, Math.floor((p.x + GH) / GC))), Math.max(0, Math.min(GN - 1, Math.floor((p.z + GH) / GC)))];
  const cellAt = (i, j) => V(-GH + (i + 0.5) * GC, 0, -GH + (j + 0.5) * GC);
  function freeGrid() {                               // rebuilt when a blocker is added (the tent's walls, the activities' props)
    if (grid && gridFor === blockers.length) return grid;
    grid = new Uint8Array(GN * GN); gridFor = blockers.length;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const q = cellAt(i, j), r = Math.hypot(q.x, q.z); if (r > rim || r < fireKeep) grid[j * GN + i] = 1; }
    for (const { at: c, r } of blockers) {
      const RR = r + body, [i0, j0] = cellOf(V(c.x - RR, 0, c.z - RR)), [i1, j1] = cellOf(V(c.x + RR, 0, c.z + RR));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const q = cellAt(i, j); if (Math.hypot(q.x - c.x, q.z - c.z) < RR) grid[j * GN + i] = 1; }
    }
    return grid;
  }
  const isFree = (p) => { const [i, j] = cellOf(p); return !freeGrid()[j * GN + i]; };
  function nearestFree(i, j) {
    const g = freeGrid();
    for (let r = 1; r < 30; r++) {
      let best = null, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= GN || b >= GN || g[b * GN + a]) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [a, b]; }
      }
      if (best) return best;
    }
    return [i, j];
  }
  function astar(ai, aj, bi, bj) {
    const g = freeGrid(), n = GN * GN, cost = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const heap = [], push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - bi), dy = Math.abs(j - bj); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const a = aj * GN + ai, b = bj * GN + bi; cost[a] = 0; push(h(ai, aj), a);
    while (heap.length) {
      const [, k] = pop(); if (done[k]) continue; done[k] = 1; if (k === b) break;
      const i = k % GN, j = (k / GN) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= GN || y >= GN) continue;
        const q = y * GN + x; if (g[q] || done[q]) continue;
        if (di && dj && (g[j * GN + x] || g[y * GN + i])) continue;   // no cutting corners
        const c = cost[k] + (di && dj ? 1.414 : 1); if (c < cost[q]) { cost[q] = c; from[q] = k; push(c + h(x, y), q); }
      }
    }
    if (!done[b]) return null;
    const out = []; for (let k = b; k >= 0; k = from[k]) out.push(cellAt(k % GN, (k / GN) | 0)); return out.reverse();
  }
  function clearLine(p, q) { const d = p.distanceTo(q), n = Math.ceil(d / 0.08); for (let k = 1; k < n; k++) if (!isFree(tmp.lerpVectors(p, q, k / n))) return false; return true; }
  function findPath(from, to) {
    const g = freeGrid(); let [ai, aj] = cellOf(from), [bi, bj] = cellOf(to);
    if (g[aj * GN + ai]) [ai, aj] = nearestFree(ai, aj);
    if (g[bj * GN + bi]) [bi, bj] = nearestFree(bi, bj);
    const raw = astar(ai, aj, bi, bj); if (!raw) return [to.clone().setY(0)];
    const pts = [raw[0]];
    for (let k = 0; k < raw.length - 1;) { let m = raw.length - 1; while (m > k + 1 && !clearLine(raw[k], raw[m])) m--; pts.push(raw[m]); k = m; }
    pts.push(to.clone().setY(0)); return pts;
  }
  return { clearLine, findPath, isFree };
}
