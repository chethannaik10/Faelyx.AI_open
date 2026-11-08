// CAM geometry kernel: STL parsing, mesh helpers, height-field rasterisation,
// Euclidean distance transform, marching-squares contours and feature
// recognition (holes, floors, slopes). Pure TypeScript, no three.js / DOM.

export type V3 = [number, number, number];
export type P2 = [number, number];

export interface Mesh { tris: Float32Array; n: number; min: V3; max: V3 }

export function meshFromTris(tris: Float32Array): Mesh {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = tris[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  }
  return { tris, n: tris.length / 9, min, max };
}

export function parseStl(buf: ArrayBuffer): Mesh {
  const dv = new DataView(buf);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength) {
      const t = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12;
        for (let k = 0; k < 9; k++) t[i * 9 + k] = dv.getFloat32(o + k * 4, true);
      }
      return meshFromTris(t);
    }
  }
  const text = new TextDecoder().decode(buf);
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(+m[1], +m[2], +m[3]);
  const len = out.length - (out.length % 9);
  return meshFromTris(new Float32Array(out.slice(0, len)));
}

export function transformMesh(m: Mesh, fn: (x: number, y: number, z: number) => V3): Mesh {
  const t = new Float32Array(m.tris.length);
  for (let i = 0; i < t.length; i += 3) {
    const p = fn(m.tris[i], m.tris[i + 1], m.tris[i + 2]);
    t[i] = p[0]; t[i + 1] = p[1]; t[i + 2] = p[2];
  }
  return meshFromTris(t);
}

export interface MeshStats { volume: number; area: number; size: V3; tris: number; watertight: boolean }
export function meshStats(m: Mesh): MeshStats {
  let vol = 0, area = 0;
  const t = m.tris;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  // edge manifold test on quantised vertices
  const q = (v: number) => Math.round(v * 1000);
  const key = (x: number, y: number, z: number) => `${q(x)},${q(y)},${q(z)}`;
  const edges = new Map<string, number>();
  const sample = Math.min(m.n, 60000);
  for (let f = 0; f < sample; f++) {
    const i = f * 9;
    const k = [key(t[i], t[i + 1], t[i + 2]), key(t[i + 3], t[i + 4], t[i + 5]), key(t[i + 6], t[i + 7], t[i + 8])];
    for (let e = 0; e < 3; e++) {
      const a = k[e], b = k[(e + 1) % 3];
      const ek = a < b ? a + '|' + b : b + '|' + a;
      edges.set(ek, (edges.get(ek) ?? 0) + 1);
    }
  }
  let bad = 0;
  edges.forEach((c) => { if (c !== 2) bad++; });
  return { volume: Math.abs(vol), area, size: [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]], tris: m.n, watertight: sample < m.n ? true : bad === 0 };
}

/** Rotate by C about Z then A about X (degrees), about the bbox centre, returning a fresh mesh. */
export function rotateAC(m: Mesh, aDeg: number, cDeg: number): Mesh {
  const a = (aDeg * Math.PI) / 180, c = (cDeg * Math.PI) / 180;
  const cx = (m.min[0] + m.max[0]) / 2, cy = (m.min[1] + m.max[1]) / 2, cz = (m.min[2] + m.max[2]) / 2;
  const cc = Math.cos(c), sc = Math.sin(c), ca = Math.cos(a), sa = Math.sin(a);
  return transformMesh(m, (x, y, z) => {
    x -= cx; y -= cy; z -= cz;
    const x1 = x * cc - y * sc, y1 = x * sc + y * cc;
    return [x1, y1 * ca - z * sa, y1 * sa + z * ca];
  });
}

// ---------------------------------------------------------------------------
// Height field

export interface HF { nx: number; ny: number; cell: number; x0: number; y0: number; z: Float32Array }
export const hfNew = (nx: number, ny: number, cell: number, x0: number, y0: number, fill = -Infinity): HF =>
  ({ nx, ny, cell, x0, y0, z: new Float32Array(nx * ny).fill(fill) });
export const hfX = (h: HF, i: number) => h.x0 + (i + 0.5) * h.cell;
export const hfY = (h: HF, j: number) => h.y0 + (j + 0.5) * h.cell;
export const hfI = (h: HF, x: number) => Math.floor((x - h.x0) / h.cell);
export const hfJ = (h: HF, y: number) => Math.floor((y - h.y0) / h.cell);
/** Nearest-cell lookup; returns -Infinity outside the grid. */
export function hfAt(h: HF, x: number, y: number): number {
  const i = Math.floor((x - h.x0) / h.cell), j = Math.floor((y - h.y0) / h.cell);
  if (i < 0 || j < 0 || i >= h.nx || j >= h.ny) return -Infinity;
  return h.z[j * h.nx + i];
}

/** Top surface (maximum z) of a mesh seen from +Z. Uncovered cells stay -Infinity. */
export function rasterTop(m: Mesh, x0: number, y0: number, nx: number, ny: number, cell: number): HF {
  const h = hfNew(nx, ny, cell, x0, y0);
  const t = m.tris, z = h.z;
  for (let f = 0; f < t.length; f += 9) {
    const ax = t[f], ay = t[f + 1], az = t[f + 2], bx = t[f + 3], by = t[f + 4], bz = t[f + 5], cx = t[f + 6], cy = t[f + 7], cz = t[f + 8];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell - 0.5)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / cell - 0.5));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / cell - 0.5)), j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - y0) / cell - 0.5));
    const eps = -1e-7;
    for (let j = j0; j <= j1; j++) {
      const py = y0 + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * cell;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < eps || l2 < eps || l3 < eps) continue;
        const zz = l1 * az + l2 * bz + l3 * cz;
        const k = j * nx + i;
        if (zz > z[k]) z[k] = zz;
      }
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Distance transform

const INF = 1e20;
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, zz: Float64Array) {
  let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= zz[k]) { k--; if (k < 0) { k = 0; break; } } else break;
    }
    if (k >= 0 && s > zz[k]) { k++; v[k] = q; zz[k] = s; zz[k + 1] = INF; }
    else { v[0] = q; zz[0] = -INF; zz[1] = INF; k = 0; }
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (zz[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** For every cell with feature[i] != 0, distance (in cells) to the nearest cell with feature == 0. Zero cells get 0. */
export function distToZero(feature: Uint8Array, nx: number, ny: number): Float32Array {
  const n = Math.max(nx, ny);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1);
  const g = new Float64Array(nx * ny);
  for (let i = 0; i < g.length; i++) g[i] = feature[i] ? INF : 0;
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) f[y] = g[y * nx + x];
    edt1d(f, ny, d, v, zz);
    for (let y = 0; y < ny; y++) g[y * nx + x] = d[y];
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) f[x] = g[y * nx + x];
    edt1d(f, nx, d, v, zz);
    for (let x = 0; x < nx; x++) g[y * nx + x] = d[x];
  }
  const out = new Float32Array(nx * ny);
  for (let i = 0; i < out.length; i++) out[i] = g[i] >= INF / 2 ? 1e6 : Math.sqrt(g[i]);
  return out;
}

/** Signed distance (mm) of a binary mask: positive inside, negative outside, zero contour on the boundary. */
export function signedDistance(mask: Uint8Array, nx: number, ny: number, cell: number): Float32Array {
  const inside = distToZero(mask, nx, ny);
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const outside = distToZero(inv, nx, ny);
  const sd = new Float32Array(mask.length);
  for (let i = 0; i < sd.length; i++) sd[i] = mask[i] ? Math.min(inside[i], 1e5) * cell - cell / 2 : -(Math.min(outside[i], 1e5) * cell - cell / 2);
  return sd;
}

// ---------------------------------------------------------------------------
// Marching squares

export function isoContours(field: Float32Array, nx: number, ny: number, level: number, cell: number, x0: number, y0: number): P2[][] {
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    let la = adj.get(a); if (!la) adj.set(a, (la = [])); la.push(b);
    let lb = adj.get(b); if (!lb) adj.set(b, (lb = [])); lb.push(a);
  };
  // edge ids: horizontal edge (i,j)-(i+1,j) = (j*nx+i)*2 ; vertical edge (i,j)-(i,j+1) = (j*nx+i)*2+1
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = field[j * nx + i] >= level ? 1 : 0, b = field[j * nx + i + 1] >= level ? 1 : 0;
      const c = field[(j + 1) * nx + i + 1] >= level ? 1 : 0, d = field[(j + 1) * nx + i] >= level ? 1 : 0;
      const code = a | (b << 1) | (c << 2) | (d << 3);
      if (code === 0 || code === 15) continue;
      const B = (j * nx + i) * 2, R = (j * nx + i + 1) * 2 + 1, T = ((j + 1) * nx + i) * 2, L = (j * nx + i) * 2 + 1;
      switch (code) {
        case 1: case 14: link(L, B); break;
        case 2: case 13: link(B, R); break;
        case 3: case 12: link(L, R); break;
        case 4: case 11: link(R, T); break;
        case 6: case 9: link(B, T); break;
        case 7: case 8: link(L, T); break;
        case 5: case 10: {
          const cen = (field[j * nx + i] + field[j * nx + i + 1] + field[(j + 1) * nx + i + 1] + field[(j + 1) * nx + i]) / 4 >= level;
          if ((code === 5) === cen) { link(B, R); link(L, T); } else { link(L, B); link(R, T); }
          break;
        }
      }
    }
  }
  const pt = (id: number): P2 => {
    const e = id >> 1, i = e % nx, j = (e - i) / nx;
    if ((id & 1) === 0) {
      const v0 = field[j * nx + i], v1 = field[j * nx + i + 1];
      const t = v1 === v0 ? 0.5 : (level - v0) / (v1 - v0);
      return [x0 + (i + 0.5 + t) * cell, y0 + (j + 0.5) * cell];
    }
    const v0 = field[j * nx + i], v1 = field[(j + 1) * nx + i];
    const t = v1 === v0 ? 0.5 : (level - v0) / (v1 - v0);
    return [x0 + (i + 0.5) * cell, y0 + (j + 0.5 + t) * cell];
  };
  const seen = new Set<number>();
  const loops: P2[][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    // walk to one end of an open chain if there is one
    let s = start;
    for (let guard = 0; guard < 1e6; guard++) {
      const n = adj.get(s)!;
      if (n.length < 2) break;
      const prev = n[0] === s ? n[1] : n[0];
      // step back along the chain until we loop or hit an end
      s = prev; if (s === start) break;
    }
    const chain: P2[] = [];
    let cur = s, prev = -1;
    for (let guard = 0; guard < 5e6; guard++) {
      seen.add(cur);
      chain.push(pt(cur));
      const nb = adj.get(cur)!;
      let next = -1;
      for (const q of nb) if (q !== prev && !seen.has(q)) { next = q; break; }
      if (next < 0) break;
      prev = cur; cur = next;
    }
    if (chain.length > 2) loops.push(chain);
  }
  return loops;
}

export const polyLength = (p: P2[], closed = true) => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  if (closed && p.length > 2) s += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
  return s;
};
export function polyArea(p: P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
}

/** Ramer–Douglas–Peucker for an open polyline. */
export function simplify(pts: P2[], tol: number): P2[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
export function simplifyClosed(pts: P2[], tol: number): P2[] {
  if (pts.length < 6) return pts;
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const a = simplify(pts.slice(0, far + 1), tol);
  const b = simplify([...pts.slice(far), pts[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

// ---------------------------------------------------------------------------
// Morphology

/** Flat-disc grey dilation (max filter) with radius in cells. */
export function dilateFlat(src: Float32Array, nx: number, ny: number, rCells: number): Float32Array {
  const r = Math.max(0, Math.round(rCells));
  if (r === 0) return Float32Array.from(src);
  const out = new Float32Array(nx * ny).fill(-Infinity);
  const byHw = new Map<number, number[]>();
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 1e-9);
    let l = byHw.get(hw); if (!l) byHw.set(hw, (l = [])); l.push(dy);
  }
  const H = new Float32Array(nx * ny);
  const dq = new Int32Array(nx + 2);
  for (const [hw, dys] of byHw) {
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      let head = 0, tail = 0;
      for (let i = 0; i < nx + hw; i++) {
        if (i < nx) {
          const v = src[row + i];
          while (tail > head && src[row + dq[tail - 1]] <= v) tail--;
          dq[tail++] = i;
        }
        const out_i = i - hw;
        if (out_i >= 0) {
          while (dq[head] < out_i - hw) head++;
          H[row + out_i] = src[row + dq[head]];
        }
      }
    }
    for (const dy of dys) {
      for (let j = 0; j < ny; j++) {
        const jj = j + dy;
        if (jj < 0 || jj >= ny) continue;
        const a = j * nx, b = jj * nx;
        for (let i = 0; i < nx; i++) if (H[b + i] > out[a + i]) out[a + i] = H[b + i];
      }
    }
  }
  return out;
}

/** Cells within radius `rMm` of any non-zero cell of `mask`. */
export function dilateMask(mask: Uint8Array, nx: number, ny: number, rMm: number, cell: number): Uint8Array {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const d = distToZero(inv, nx, ny);
  const out = new Uint8Array(mask.length);
  const lim = rMm / cell + 0.5;
  for (let i = 0; i < out.length; i++) out[i] = d[i] <= lim ? 1 : 0;
  return out;
}


// ---------------------------------------------------------------------------
// Connected components + feature recognition

export interface Component { id: number; cells: number[]; minI: number; maxI: number; minJ: number; maxJ: number; touchesEdge: boolean }
export function components(mask: Uint8Array, nx: number, ny: number, minCells = 1): Component[] {
  const lab = new Int32Array(mask.length).fill(-1);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const comp: Component = { id: out.length, cells: [], minI: nx, maxI: 0, minJ: ny, maxJ: 0, touchesEdge: false };
    stack.push(s); lab[s] = comp.id;
    while (stack.length) {
      const k = stack.pop()!;
      comp.cells.push(k);
      const i = k % nx, j = (k - i) / nx;
      if (i < comp.minI) comp.minI = i; if (i > comp.maxI) comp.maxI = i;
      if (j < comp.minJ) comp.minJ = j; if (j > comp.maxJ) comp.maxJ = j;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) comp.touchesEdge = true;
      if (i > 0 && mask[k - 1] && lab[k - 1] < 0) { lab[k - 1] = comp.id; stack.push(k - 1); }
      if (i < nx - 1 && mask[k + 1] && lab[k + 1] < 0) { lab[k + 1] = comp.id; stack.push(k + 1); }
      if (j > 0 && mask[k - nx] && lab[k - nx] < 0) { lab[k - nx] = comp.id; stack.push(k - nx); }
      if (j < ny - 1 && mask[k + nx] && lab[k + nx] < 0) { lab[k + nx] = comp.id; stack.push(k + nx); }
    }
    if (comp.cells.length >= minCells) out.push(comp); else for (const k of comp.cells) lab[k] = -2;
  }
  return out;
}

export interface HoleFeature {
  id: number; x: number; y: number; d: number; depth: number; zTop: number; zBottom: number;
  through: boolean; counterbore?: { d: number; depth: number };
}

/**
 * Round holes seen from the top: flat-bottomed circular components lying below a higher rim.
 * `footprint` is the filled silhouette of the part (enclosed holes included), `floorZ` the part
 * bottom: footprint cells with no surface above are treated as through holes.
 */
export function findHoles(top: HF, footprint: Uint8Array, floorZ: number, minD = 1.5, maxD = 40): HoleFeature[] {
  const { nx, ny, cell, z } = top;
  const holes: HoleFeature[] = [];
  // 1) through holes: uncovered cells enclosed by the footprint
  const open = new Uint8Array(nx * ny);
  for (let k = 0; k < open.length; k++) open[k] = footprint[k] && !(z[k] > -Infinity) ? 1 : 0;
  const compsOpen = components(open, nx, ny, 3);
  for (const c of compsOpen) {
    if (c.touchesEdge) continue;
    const f = describeRound(c, top, z, cell);
    if (!f) continue;
    if (f.d < minD || f.d > maxD) continue;
    const rim = rimHeight(c, z, nx, ny);
    holes.push({ id: 0, x: f.x, y: f.y, d: f.d, depth: rim - floorZ, zTop: rim, zBottom: floorZ, through: true });
  }
  // 2) blind holes: flat floors at levels below the surroundings
  const levels = flatLevels(top, footprint);
  for (const L of levels) {
    const m = new Uint8Array(nx * ny);
    for (let k = 0; k < m.length; k++) m[k] = footprint[k] && Math.abs(z[k] - L) < cell * 0.18 + 0.03 ? 1 : 0;
    for (const c of components(m, nx, ny, 3)) {
      const f = describeRound(c, top, z, cell);
      if (!f || f.d < minD || f.d > maxD) continue;
      const rim = rimHeight(c, z, nx, ny);
      if (rim - L < 1.0) continue;
      // surrounded by material that is higher at every ring cell?
      if (!ringHigher(c, z, nx, ny, L + 0.5)) continue;
      holes.push({ id: 0, x: f.x, y: f.y, d: f.d, depth: rim - L, zTop: rim, zBottom: L, through: false });
    }
  }
  // counterbores: a larger hole concentric with a smaller one
  holes.sort((a, b) => b.d - a.d);
  const out: HoleFeature[] = [];
  for (const h of holes) {
    const cb = out.find((o) => Math.hypot(o.x - h.x, o.y - h.y) < 0.6 && o.d > h.d + 0.5 && o.zBottom >= h.zTop - 0.3);
    if (cb) { /* handled below */ }
    out.push(h);
  }
  // merge concentric: keep the smaller (deeper) one as the hole and note the larger as a counterbore
  const merged: HoleFeature[] = [];
  const used = new Set<number>();
  for (let i = 0; i < out.length; i++) {
    if (used.has(i)) continue;
    const big = out[i];
    let partner = -1;
    for (let j = i + 1; j < out.length; j++) {
      if (used.has(j)) continue;
      const sm = out[j];
      if (Math.hypot(big.x - sm.x, big.y - sm.y) < 0.8 && big.d > sm.d + 0.8) { partner = j; break; }
    }
    if (partner >= 0) {
      const sm = out[partner]; used.add(partner);
      merged.push({ ...sm, zTop: big.zTop, depth: sm.zBottom === big.zBottom ? sm.depth : big.zTop - sm.zBottom, counterbore: { d: big.d, depth: big.zTop - big.zBottom } });
    } else merged.push(big);
  }
  merged.sort((a, b) => a.y - b.y || a.x - b.x);
  merged.forEach((h, i) => { h.id = i + 1; });
  return merged;
}

function describeRound(c: Component, top: HF, _z: Float32Array, cell: number): { x: number; y: number; d: number } | null {
  const bw = (c.maxI - c.minI + 1) * cell, bh = (c.maxJ - c.minJ + 1) * cell;
  const area = c.cells.length * cell * cell;
  const dEq = Math.sqrt((4 * area) / Math.PI);
  if (Math.abs(bw - bh) > 0.18 * Math.max(bw, bh) + cell) return null;
  const fill = area / (bw * bh);
  if (fill < 0.68 || fill > 0.9) return null;
  let sx = 0, sy = 0;
  for (const k of c.cells) { sx += hfX(top, k % top.nx); sy += hfY(top, Math.floor(k / top.nx)); }
  return { x: sx / c.cells.length, y: sy / c.cells.length, d: dEq };
}

function rimHeight(c: Component, z: Float32Array, nx: number, ny: number): number {
  const inC = new Set(c.cells);
  const vals: number[] = [];
  for (const k of c.cells) {
    const i = k % nx, j = (k - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const q = jj * nx + ii;
      if (inC.has(q)) continue;
      if (z[q] > -Infinity) vals.push(z[q]);
    }
  }
  if (!vals.length) return -Infinity;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length * 0.75)];
}

function ringHigher(c: Component, z: Float32Array, nx: number, ny: number, min: number): boolean {
  const inC = new Set(c.cells);
  let tot = 0, hi = 0;
  for (const k of c.cells) {
    const i = k % nx, j = (k - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) { tot++; continue; }
      const q = jj * nx + ii;
      if (inC.has(q)) continue;
      tot++;
      if (z[q] > min) hi++;
    }
  }
  return tot > 0 && hi / tot > 0.92;
}

/** Dominant flat floor heights (histogram peaks of the top surface). */
export function flatLevels(top: HF, footprint?: Uint8Array): number[] {
  const bins = new Map<number, number>();
  const { z, nx, ny } = top;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i, v = z[k];
      if (footprint && !footprint[k]) continue;
      if (!(v > -Infinity)) continue;
      if (Math.abs(z[k + 1] - v) > 0.02 || Math.abs(z[k - 1] - v) > 0.02 || Math.abs(z[k + nx] - v) > 0.02 || Math.abs(z[k - nx] - v) > 0.02) continue;
      const b = Math.round(v / 0.1);
      bins.set(b, (bins.get(b) ?? 0) + 1);
    }
  }
  const sorted = [...bins.entries()].filter(([, c]) => c >= 6).sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  let acc: { sum: number; cnt: number; last: number } | null = null;
  for (const [b, c] of sorted) {
    if (acc && b - acc.last <= 1) { acc.sum += b * c; acc.cnt += c; acc.last = b; }
    else { if (acc) out.push((acc.sum / acc.cnt) * 0.1); acc = { sum: b * c, cnt: c, last: b }; }
  }
  if (acc) out.push((acc.sum / acc.cnt) * 0.1);
  return out;
}

export interface SurfaceClass { flat: number; slope: number; wall: number }
/** Fractions of footprint area that are flat (<4°), sloped / curved (4–75°) and steep (>75°). */
export function classifySurface(top: HF, footprint: Uint8Array): { stats: SurfaceClass; slopeDeg: Float32Array } {
  const { nx, ny, cell, z } = top;
  const slope = new Float32Array(nx * ny);
  let flat = 0, mid = 0, wall = 0, tot = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!footprint[k] || !(z[k] > -Infinity)) continue;
      const g = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? a - b : 0);
      const gx = g(z[i < nx - 1 ? k + 1 : k], z[i > 0 ? k - 1 : k]) / ((i > 0 && i < nx - 1 ? 2 : 1) * cell);
      const gy = g(z[j < ny - 1 ? k + nx : k], z[j > 0 ? k - nx : k]) / ((j > 0 && j < ny - 1 ? 2 : 1) * cell);
      const deg = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
      slope[k] = deg;
      tot++;
      if (deg < 4) flat++; else if (deg < 75) mid++; else wall++;
    }
  }
  tot = Math.max(tot, 1);
  return { stats: { flat: flat / tot, slope: mid / tot, wall: wall / tot }, slopeDeg: slope };
}

// ---------------------------------------------------------------------------
// Built-in sample parts (used when nothing has been modelled yet)

/** Height-map mesh: closed solid from a per-cell height function (0 or less = empty). */
function solidFromHeight(nx: number, ny: number, cell: number, hfn: (i: number, j: number) => number): Float32Array {
  const out: number[] = [];
  const H = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : hfn(i, j));
  const quad = (a: V3, b: V3, c: V3, d: V3) => { out.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const h = H(i, j);
      if (h <= 0) continue;
      const x0 = i * cell, x1 = x0 + cell, y0 = j * cell, y1 = y0 + cell;
      quad([x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]);
      quad([x0, y1, 0], [x1, y1, 0], [x1, y0, 0], [x0, y0, 0]);
      const walls: [number, number, V3, V3][] = [
        [i - 1, j, [x0, y1, 0], [x0, y0, 0]], [i + 1, j, [x1, y0, 0], [x1, y1, 0]],
        [i, j - 1, [x0, y0, 0], [x1, y0, 0]], [i, j + 1, [x1, y1, 0], [x0, y1, 0]],
      ];
      for (const [ni, nj, p, q] of walls) {
        const hn = H(ni, nj);
        if (hn < h) quad([p[0], p[1], hn], [q[0], q[1], hn], [q[0], q[1], h], [p[0], p[1], h]);
      }
    }
  }
  return new Float32Array(out);
}

/** Blocky closed mesh from a voxel occupancy function (faces between occupied and empty voxels). */
function solidFromVoxels(nx: number, ny: number, nz: number, cell: number, occ: (i: number, j: number, k: number) => boolean): Float32Array {
  const out: number[] = [];
  const O = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && occ(i, j, k);
  const quad = (a: V3, b: V3, c: V3, d: V3) => { out.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!O(i, j, k)) continue;
    const x0 = i * cell, x1 = x0 + cell, y0 = j * cell, y1 = y0 + cell, z0 = k * cell, z1 = z0 + cell;
    if (!O(i + 1, j, k)) quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
    if (!O(i - 1, j, k)) quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);
    if (!O(i, j + 1, k)) quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]);
    if (!O(i, j - 1, k)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (!O(i, j, k + 1)) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    if (!O(i, j, k - 1)) quad([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]);
  }
  return new Float32Array(out);
}

export interface SamplePart { id: string; name: string; for: string; build: () => Mesh }
export const SAMPLE_PARTS: SamplePart[] = [
  {
    id: 'bracket', name: 'Bracket plate (pocket, holes, boss)', for: 'Milling · 3-axis / 3+2',
    build: () => {
      const cell = 0.5, W = 80, D = 50, nx = W / cell, ny = D / cell;
      const holes: [number, number, number][] = [[10, 10, 4.2], [70, 10, 4.2], [10, 40, 4.2], [70, 40, 4.2]];
      const cb: [number, number, number] = [40, 25, 6.8];
      const mesh = solidFromHeight(nx, ny, cell, (i, j) => {
        const x = (i + 0.5) * cell, y = (j + 0.5) * cell;
        for (const [hx, hy, hd] of holes) if (Math.hypot(x - hx, y - hy) < hd / 2) return 0;
        if (Math.hypot(x - cb[0], y - cb[1]) < cb[2] / 2) return 0;
        // rounded outline (r = 6)
        const r = 6;
        const cx = Math.min(Math.max(x, r), W - r), cy = Math.min(Math.max(y, r), D - r);
        if (Math.hypot(x - cx, y - cy) > r) return 0;
        // central pocket 30 x 16, depth 6 (floor at 6 of 12)
        if (Math.abs(x - 40) < 15 && Math.abs(y - 25) < 8) return 6;
        // raised boss with a slanted face
        if (x > 56 && x < 66 && y > 18 && y < 32) return 12 + (x - 56) * 0.4;
        // blind holes
        if (Math.hypot(x - 22, y - 25) < 3) return 5;
        return 12;
      });
      return meshFromTris(mesh);
    },
  },
  {
    id: 'mold', name: 'Dome with fillets (3D surface)', for: 'Milling · surface finishing',
    build: () => {
      const cell = 0.5, W = 60, D = 60, nx = W / cell, ny = D / cell;
      return meshFromTris(solidFromHeight(nx, ny, cell, (i, j) => {
        const x = (i + 0.5) * cell - 30, y = (j + 0.5) * cell - 30;
        const r = Math.hypot(x, y);
        if (r > 29) return 0;
        const dome = r < 22 ? 6 + Math.sqrt(Math.max(0, 22 * 22 - r * r)) * 0.55 : 6;
        const ridge = Math.abs(y) < 2.5 && Math.abs(x) < 26 ? 4 : 0;
        return dome + ridge;
      }));
    },
  },
  {
    id: 'shaft', name: 'Stepped shaft (turned part)', for: 'Lathe turning',
    build: () => {
      // profile (z along axis, radius), revolved about Z, base at z=0
      const prof: [number, number][] = [[0, 0], [0, 10], [12, 10], [12, 14], [34, 14], [34, 11], [34, 11], [48, 11], [48, 8], [62, 8], [62, 0]];
      const seg = 64, out: number[] = [];
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        for (let p = 0; p < prof.length - 1; p++) {
          const [z0, r0] = prof[p], [z1, r1] = prof[p + 1];
          const P = (r: number, a: number, z: number): V3 => [r * Math.cos(a), r * Math.sin(a), z];
          if (r0 === r1 && z0 === z1) continue;
          const a = P(r0, a0, z0), b = P(r0, a1, z0), c = P(r1, a1, z1), d = P(r1, a0, z1);
          if (r0 === 0 && r1 === 0) continue;
          if (r0 === 0) out.push(...a, ...c, ...d); else if (r1 === 0) out.push(...a, ...b, ...c); else out.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
      }
      return meshFromTris(new Float32Array(out));
    },
  },
  {
    id: 'plate', name: 'Flat profile plate (3 mm sheet)', for: 'Laser / plasma cutting',
    build: () => {
      const cell = 0.5, W = 100, D = 60, nx = W / cell, ny = D / cell;
      return meshFromTris(solidFromHeight(nx, ny, cell, (i, j) => {
        const x = (i + 0.5) * cell, y = (j + 0.5) * cell;
        const r = 5, cx = Math.min(Math.max(x, r), W - r), cy = Math.min(Math.max(y, r), D - r);
        if (Math.hypot(x - cx, y - cy) > r) return 0;
        if (Math.hypot(x - 20, y - 30) < 8) return 0;
        if (Math.hypot(x - 50, y - 30) < 4) return 0;
        if (Math.abs(x - 75) < 10 && Math.abs(y - 30) < 4) return 0;
        if (Math.hypot(x - 90, y - 10) < 2.5 || Math.hypot(x - 10, y - 50) < 2.5) return 0;
        return 3;
      }));
    },
  },
  {
    id: 'manifold', name: 'Manifold block (top and side holes)', for: 'Milling · 3+2 indexing',
    build: () => {
      const cell = 0.5, W = 56, D = 44, H = 28;
      return meshFromTris(solidFromVoxels(W / cell, D / cell, H / cell, cell, (i, j, k) => {
        const x = (i + 0.5) * cell, y = (j + 0.5) * cell, z = (k + 0.5) * cell;
        if (Math.hypot(x - 28, y - 22) < 4.2) return false;           // vertical Ø8.4 through hole
        if (Math.hypot(y - 22, z - 14) < 3 && x > 0) return false;     // Ø6 cross hole along X
        if (Math.hypot(x - 14, z - 14) < 2.1) return false;            // Ø4.2 cross hole along Y
        return true;
      }));
    },
  },
  { id: 'overhang', name: 'Overhang test (stem + shelf)', for: 'Printing · supports', build: () => overhangDemo() },
];

/** Overhang test part: an L-shaped solid (stem with a cantilevered shelf), extruded along Y. */
export function overhangDemo(): Mesh {
  const prof: P2[] = [[0, 0], [20, 0], [20, 15], [40, 15], [40, 25], [0, 25]];
  const out: number[] = [];
  const y0 = 0, y1 = 20;
  // side caps (fan; the L polygon is simple, triangulate by hand)
  const tri = (a: V3, b: V3, c: V3) => out.push(...a, ...b, ...c);
  const caps: [number, number][][] = [[[0, 0], [20, 0], [20, 25], [0, 25]].map((p) => p as [number, number]), [[20, 15], [40, 15], [40, 25], [20, 25]].map((p) => p as [number, number])];
  for (const q of caps) {
    tri([q[0][0], y0, q[0][1]], [q[2][0], y0, q[2][1]], [q[1][0], y0, q[1][1]]);
    tri([q[0][0], y0, q[0][1]], [q[3][0], y0, q[3][1]], [q[2][0], y0, q[2][1]]);
    tri([q[0][0], y1, q[0][1]], [q[1][0], y1, q[1][1]], [q[2][0], y1, q[2][1]]);
    tri([q[0][0], y1, q[0][1]], [q[2][0], y1, q[2][1]], [q[3][0], y1, q[3][1]]);
  }
  for (let i = 0; i < prof.length; i++) {
    const a = prof[i], b = prof[(i + 1) % prof.length];
    tri([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]]);
    tri([a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]);
  }
  return meshFromTris(new Float32Array(out));
}
