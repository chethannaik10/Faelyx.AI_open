// Geometry extraction from result grids: boundary quads of the solid voxels, 2-D slices and iso-surfaces (marching tetrahedra).

import type { FieldDef, VolGrid } from './model';

export interface Surf {
  quads: number;
  base: Float32Array;       // 4 vertices × 3 per quad: undeformed positions (mm)
  nrm: Float32Array;        // static normals
  node: Int32Array;         // node index of every vertex
  cell: Int32Array;         // voxel index of every quad
  dir: Uint8Array;          // face direction of every quad (0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z)
  index: Uint32Array;       // triangle indices
  lines: Uint32Array;       // edge indices (quad outlines)
}

const NORMALS: [number, number, number][] = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

export function nodeCount(g: VolGrid) { return (g.nx + 1) * (g.ny + 1) * (g.nz + 1); }
export function cellCount(g: VolGrid) { return g.nx * g.ny * g.nz; }

/** Boundary faces of the cells where mask != 0 (restricted to cells accepted by `pick`). */
export function buildSurface(g: VolGrid, mask: Uint8Array, pick?: (cell: number) => boolean): Surf {
  const { nx, ny, nz, h } = g, nxy = nx * ny;
  const sx = nx + 1, sxy = (nx + 1) * (ny + 1);
  const list: number[] = [];                                 // cell*8 + dir encoded as pairs
  const solid = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && mask[(k * ny + j) * nx + i] !== 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = k * nxy + j * nx + i;
    if (!mask[c]) continue;
    if (pick && !pick(c)) continue;
    if (!solid(i - 1, j, k)) list.push(c, 0);
    if (!solid(i + 1, j, k)) list.push(c, 1);
    if (!solid(i, j - 1, k)) list.push(c, 2);
    if (!solid(i, j + 1, k)) list.push(c, 3);
    if (!solid(i, j, k - 1)) list.push(c, 4);
    if (!solid(i, j, k + 1)) list.push(c, 5);
  }
  const q = list.length / 2;
  const base = new Float32Array(q * 12), nrm = new Float32Array(q * 12), node = new Int32Array(q * 4), cell = new Int32Array(q), dir = new Uint8Array(q);
  const index = new Uint32Array(q * 6), lines = new Uint32Array(q * 8);
  for (let f = 0; f < q; f++) {
    const c = list[2 * f], d = list[2 * f + 1];
    const k = Math.floor(c / nxy), r = c - k * nxy, j = Math.floor(r / nx), i = r - j * nx;
    const n = (a: number, b: number, e: number) => (k + e) * sxy + (j + b) * sx + (i + a);
    let v: [number, number, number, number];
    switch (d) {
      case 0: v = [n(0, 0, 0), n(0, 0, 1), n(0, 1, 1), n(0, 1, 0)]; break;
      case 1: v = [n(1, 0, 0), n(1, 1, 0), n(1, 1, 1), n(1, 0, 1)]; break;
      case 2: v = [n(0, 0, 0), n(1, 0, 0), n(1, 0, 1), n(0, 0, 1)]; break;
      case 3: v = [n(0, 1, 0), n(0, 1, 1), n(1, 1, 1), n(1, 1, 0)]; break;
      case 4: v = [n(0, 0, 0), n(0, 1, 0), n(1, 1, 0), n(1, 0, 0)]; break;
      default: v = [n(0, 0, 1), n(1, 0, 1), n(1, 1, 1), n(0, 1, 1)];
    }
    cell[f] = c; dir[f] = d;
    for (let a = 0; a < 4; a++) {
      const nd = v[a];
      node[4 * f + a] = nd;
      const kk = Math.floor(nd / sxy), rr = nd - kk * sxy, jj = Math.floor(rr / sx), ii = rr - jj * sx;
      const o = (4 * f + a) * 3;
      base[o] = g.ox + ii * h; base[o + 1] = g.oy + jj * h; base[o + 2] = g.oz + kk * h;
      nrm[o] = NORMALS[d][0]; nrm[o + 1] = NORMALS[d][1]; nrm[o + 2] = NORMALS[d][2];
    }
    const b = 4 * f;
    index.set([b, b + 1, b + 2, b, b + 2, b + 3], 6 * f);
    lines.set([b, b + 1, b + 1, b + 2, b + 2, b + 3, b + 3, b], 8 * f);
  }
  return { quads: q, base, nrm, node, cell, dir, index, lines };
}

/** Value of the field at the cell, or interpolated at a node */
export function cellValue(g: VolGrid, f: FieldDef, cell: number): number {
  if (f.loc === 'cell') return f.data[cell];
  const { nx, ny } = g, nxy = nx * ny, sx = nx + 1, sxy = (nx + 1) * (ny + 1);
  const k = Math.floor(cell / nxy), r = cell - k * nxy, j = Math.floor(r / nx), i = r - j * nx;
  const b = k * sxy + j * sx + i;
  return 0.125 * (f.data[b] + f.data[b + 1] + f.data[b + sx] + f.data[b + sx + 1] + f.data[b + sxy] + f.data[b + sxy + 1] + f.data[b + sxy + sx] + f.data[b + sxy + sx + 1]);
}

/** Node-located copy of a field (cell fields are averaged over the finite neighbouring cells). */
export function toNodes(g: VolGrid, f: FieldDef): Float32Array {
  if (f.loc === 'node') return f.data;
  const { nx, ny, nz } = g, sx = nx + 1, sxy = (nx + 1) * (ny + 1);
  const out = new Float32Array(nodeCount(g)), cnt = new Uint8Array(out.length);
  let c = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) {
    const v = f.data[c];
    if (!Number.isFinite(v)) continue;
    const b = k * sxy + j * sx + i;
    for (const o of [0, 1, sx, sx + 1, sxy, sxy + 1, sxy + sx, sxy + sx + 1]) { out[b + o] += v; cnt[b + o]++; }
  }
  for (let n = 0; n < out.length; n++) out[n] = cnt[n] ? out[n] / cnt[n] : NaN;
  return out;
}

export interface Slice { w: number; h: number; vals: Float32Array; origin: [number, number, number]; du: [number, number, number]; dv: [number, number, number] }

/** Slice through cell layer `layer` normal to `axis`. Cells outside `keep` (when given) are NaN. */
export function sliceField(g: VolGrid, f: FieldDef, axis: 0 | 1 | 2, layer: number, keep?: (cell: number) => boolean): Slice {
  const { nx, ny, nz, h } = g;
  const dims = [nx, ny, nz];
  const a = axis === 0 ? 1 : 0, b = axis === 2 ? 1 : 2;     // in-plane axes
  const w = dims[a], hh = dims[b];
  const vals = new Float32Array(w * hh);
  for (let v = 0; v < hh; v++) for (let u = 0; u < w; u++) {
    const ijk = [0, 0, 0]; ijk[axis] = layer; ijk[a] = u; ijk[b] = v;
    const c = (ijk[2] * ny + ijk[1]) * nx + ijk[0];
    vals[v * w + u] = keep && !keep(c) ? NaN : cellValue(g, f, c);
  }
  const o: [number, number, number] = [g.ox, g.oy, g.oz];
  o[axis] += (layer + 0.5) * h;
  const du: [number, number, number] = [0, 0, 0], dv: [number, number, number] = [0, 0, 0];
  du[a] = w * h; dv[b] = hh * h;
  return { w, h: hh, vals, origin: o, du, dv };
}

// ---------------------------------------------------------------------------------------------
// Marching tetrahedra

const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
const CORNER: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];

/** Triangles of the surface where the node field equals `level`. Returns positions (9 floats per triangle, mm). */
export function isoSurface(g: VolGrid, nodeVals: Float32Array, level: number, valid?: (cell: number) => boolean, step = 1): Float32Array {
  const { nx, ny, nz, h } = g, sx = nx + 1, sxy = (nx + 1) * (ny + 1);
  const out: number[] = [];
  const cv = new Float64Array(8), cp = new Float64Array(24);
  const edge = (a: number, b: number, o: number) => {
    const va = cv[a], vb = cv[b], t = va === vb ? 0.5 : (level - va) / (vb - va);
    out.push(cp[3 * a] + t * (cp[3 * b] - cp[3 * a]), cp[3 * a + 1] + t * (cp[3 * b + 1] - cp[3 * a + 1]), cp[3 * a + 2] + t * (cp[3 * b + 2] - cp[3 * a + 2]));
    void o;
  };
  for (let k = 0; k < nz; k += step) for (let j = 0; j < ny; j += step) for (let i = 0; i < nx; i += step) {
    if (valid && !valid((k * ny + j) * nx + i)) continue;
    let mn = Infinity, mx = -Infinity, bad = false;
    for (let c = 0; c < 8; c++) {
      const o = CORNER[c];
      const v = nodeVals[(k + o[2] * step) * sxy + (j + o[1] * step) * sx + (i + o[0] * step)];
      if (!Number.isFinite(v)) { bad = true; break; }
      cv[c] = v; if (v < mn) mn = v; if (v > mx) mx = v;
      cp[3 * c] = g.ox + (i + o[0] * step) * h; cp[3 * c + 1] = g.oy + (j + o[1] * step) * h; cp[3 * c + 2] = g.oz + (k + o[2] * step) * h;
    }
    if (bad || level < mn || level > mx) continue;
    for (const t of TETS) {
      const inside: number[] = [], outside: number[] = [];
      for (const c of t) (cv[c] < level ? inside : outside).push(c);
      if (!inside.length || !outside.length) continue;
      if (inside.length === 1 || outside.length === 1) {
        const lone = inside.length === 1 ? inside[0] : outside[0], rest = inside.length === 1 ? outside : inside;
        edge(lone, rest[0], 0); edge(lone, rest[1], 0); edge(lone, rest[2], 0);
      } else {
        const [a, b] = inside, [c, d] = outside;
        edge(a, c, 0); edge(a, d, 0); edge(b, d, 0);
        edge(a, c, 0); edge(b, d, 0); edge(b, c, 0);
      }
    }
  }
  return Float32Array.from(out);
}
