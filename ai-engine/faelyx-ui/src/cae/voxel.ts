// Structured voxel model for the CAE solvers.
// A closed triangle mesh (or several bodies, each with a material) is sampled on a regular grid
// of cubic cells. Every solver (FEM, thermal, electrostatic, FDTD, LBM) works on this grid.
// Units: millimetres. The grid is padded so every dimension is a multiple of 8 (geometric multigrid).

import type { Mesh } from '../cam/geometry';

export interface Body { mesh: Mesh; mat: number; name: string }   // mat < 0 carves (removes) material

export interface Grid {
  nx: number; ny: number; nz: number;       // voxels per axis (padded)
  h: number;                                // voxel edge, mm
  ox: number; oy: number; oz: number;       // origin of node (0,0,0), mm
  mat: Uint8Array;                          // per voxel: 0 = void, else material index + 1
  nElem: number;                            // solid voxels
  elem: Int32Array;                         // voxel index of every solid voxel
  bodyVolume: number;                       // mm³ of the voxelised solid
  warnings: string[];
}

export const MG_MULT = 8;

export function voxelize(bodies: Body[], h: number, margin = 0, pad = 0): Grid {
  const warnings: string[] = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], b.mesh.min[k]); max[k] = Math.max(max[k], b.mesh.max[k]); }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const m = margin * h, p = Math.max(0, pad);
  const dims = size.map((s) => {
    const need = Math.ceil((s + 2 * m) / h - 1e-9) + 2 * p;
    return Math.max(MG_MULT, Math.ceil(need / MG_MULT) * MG_MULT);
  });
  const [nx, ny, nz] = dims;
  const o = [0, 1, 2].map((k) => min[k] - (dims[k] * h - size[k]) / 2);
  const mat = new Uint8Array(nx * ny * nz);
  for (const body of bodies) fillBody(body, h, o, nx, ny, nz, mat, warnings);
  let n = 0;
  for (let i = 0; i < mat.length; i++) if (mat[i]) n++;
  const elem = new Int32Array(n);
  n = 0;
  for (let i = 0; i < mat.length; i++) if (mat[i]) elem[n++] = i;
  return { nx, ny, nz, h, ox: o[0], oy: o[1], oz: o[2], mat, nElem: n, elem, bodyVolume: n * h * h * h, warnings };
}

/** Marks voxels whose centre is inside the body (parity of vertical ray crossings). */
export function fillBody(body: Body, h: number, o: number[], nx: number, ny: number, nz: number, mat: Uint8Array, warnings: string[]) {
  const t = body.mesh.tris, nt = body.mesh.n;
  // bucket triangles per column
  const cols: number[][] = new Array(nx * ny);
  const jx = 1.7e-4 * h, jy = 2.3e-4 * h;       // irrational-ish jitter avoids edge / vertex hits
  const bad = { count: 0 };
  for (let f = 0; f < nt; f++) {
    const i9 = f * 9;
    const x0 = t[i9], y0 = t[i9 + 1], x1 = t[i9 + 3], y1 = t[i9 + 4], x2 = t[i9 + 6], y2 = t[i9 + 7];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-12) continue;      // vertical (edge-on) triangle: no crossing
    const minx = Math.min(x0, x1, x2), maxx = Math.max(x0, x1, x2), miny = Math.min(y0, y1, y2), maxy = Math.max(y0, y1, y2);
    const i0 = Math.max(0, Math.floor((minx - o[0] - jx) / h - 0.5)), i1 = Math.min(nx - 1, Math.ceil((maxx - o[0] - jx) / h - 0.5));
    const j0 = Math.max(0, Math.floor((miny - o[1] - jy) / h - 0.5)), j1 = Math.min(ny - 1, Math.ceil((maxy - o[1] - jy) / h - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * nx + i;
      (cols[c] ??= []).push(f);
    }
  }
  const z = new Float64Array(64);
  let zs: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const list = cols[j * nx + i];
    if (!list) continue;
    const px = o[0] + (i + 0.5) * h + jx, py = o[1] + (j + 0.5) * h + jy;
    zs = [];
    for (const f of list) {
      const i9 = f * 9;
      const ax = t[i9], ay = t[i9 + 1], az = t[i9 + 2], bx = t[i9 + 3], by = t[i9 + 4], bz = t[i9 + 5], cx = t[i9 + 6], cy = t[i9 + 7], cz = t[i9 + 8];
      const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((px - ax) * (cy - ay) - (cx - ax) * (py - ay)) / d;
      const v = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      zs.push(az + u * (bz - az) + v * (cz - az));
    }
    if (!zs.length) continue;
    zs.sort((a, b) => a - b);
    if (zs.length % 2) { bad.count++; zs.pop(); }
    for (let q = 0; q + 1 < zs.length; q += 2) {
      const k0 = Math.max(0, Math.ceil((zs[q] - o[2]) / h - 0.5)), k1 = Math.min(nz - 1, Math.floor((zs[q + 1] - o[2]) / h - 0.5));
      for (let k = k0; k <= k1; k++) mat[k * nx * ny + j * nx + i] = body.mat < 0 ? 0 : body.mat + 1;
    }
  }
  void z;
  if (bad.count > 0) warnings.push(`${body.name}: ${bad.count} ray columns crossed an odd number of faces. The model may have holes or inverted faces; the voxel model can have gaps.`);
}


/** Voxelises the bodies inside a given box (sub-model). The origin is `min`; dimensions are padded to a multiple of 8. */
export function voxelizeBox(bodies: Body[], h: number, min: number[], max: number[]): Grid {
  const warnings: string[] = [];
  const dims = [0, 1, 2].map((k) => Math.max(MG_MULT, Math.ceil(Math.ceil((max[k] - min[k]) / h - 1e-9) / MG_MULT) * MG_MULT));
  const [nx, ny, nz] = dims;
  const mat = new Uint8Array(nx * ny * nz);
  for (const body of bodies) fillBody(body, h, min, nx, ny, nz, mat, warnings);
  let n = 0;
  for (let i = 0; i < mat.length; i++) if (mat[i]) n++;
  const elem = new Int32Array(n);
  n = 0;
  for (let i = 0; i < mat.length; i++) if (mat[i]) elem[n++] = i;
  return { nx, ny, nz, h, ox: min[0], oy: min[1], oz: min[2], mat, nElem: n, elem, bodyVolume: n * h * h * h, warnings: [] };
}

export const vox = (g: Grid, i: number, j: number, k: number) => (k * g.ny + j) * g.nx + i;
export const nodeIndex = (g: Grid, i: number, j: number, k: number) => (k * (g.ny + 1) + j) * (g.nx + 1) + i;
export const nNodes = (g: Grid) => (g.nx + 1) * (g.ny + 1) * (g.nz + 1);

/** Offsets of the 8 corner nodes of a voxel relative to its (i,j,k) node, standard hex ordering. */
export function cornerOffsets(g: Grid): Int32Array {
  const sx = 1, sy = g.nx + 1, sz = (g.nx + 1) * (g.ny + 1);
  return Int32Array.from([0, sx, sx + sy, sy, sz, sz + sx, sz + sx + sy, sz + sy]);
}

/** Base node index (corner 0) of every solid voxel. */
export function elemBaseNodes(g: Grid): Int32Array {
  const out = new Int32Array(g.nElem);
  const nxy = g.nx * g.ny;
  for (let e = 0; e < g.nElem; e++) {
    const v = g.elem[e];
    const k = Math.floor(v / nxy), r = v - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
    out[e] = nodeIndex(g, i, j, k);
  }
  return out;
}

/** Nodes that belong to at least one solid voxel. */
export function activeNodes(g: Grid, base?: Int32Array): Uint8Array {
  const nn = nNodes(g), act = new Uint8Array(nn), off = cornerOffsets(g), b = base ?? elemBaseNodes(g);
  for (let e = 0; e < g.nElem; e++) for (let a = 0; a < 8; a++) act[b[e] + off[a]] = 1;
  return act;
}

export interface SurfFace { vox: number; dir: number }   // dir: 0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z
export function surfaceFaces(g: Grid): SurfFace[] {
  const out: SurfFace[] = [];
  const nxy = g.nx * g.ny;
  for (let e = 0; e < g.nElem; e++) {
    const v = g.elem[e];
    const k = Math.floor(v / nxy), r = v - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
    if (i === 0 || !g.mat[v - 1]) out.push({ vox: v, dir: 0 });
    if (i === g.nx - 1 || !g.mat[v + 1]) out.push({ vox: v, dir: 1 });
    if (j === 0 || !g.mat[v - g.nx]) out.push({ vox: v, dir: 2 });
    if (j === g.ny - 1 || !g.mat[v + g.nx]) out.push({ vox: v, dir: 3 });
    if (k === 0 || !g.mat[v - nxy]) out.push({ vox: v, dir: 4 });
    if (k === g.nz - 1 || !g.mat[v + nxy]) out.push({ vox: v, dir: 5 });
  }
  return out;
}

/** The four node indices of a voxel face (counter-clockwise seen from outside) */
export function faceNodes(g: Grid, f: SurfFace): [number, number, number, number] {
  const nxy = g.nx * g.ny;
  const k = Math.floor(f.vox / nxy), r = f.vox - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
  const n = (a: number, b: number, c: number) => nodeIndex(g, i + a, j + b, k + c);
  switch (f.dir) {
    case 0: return [n(0, 0, 0), n(0, 0, 1), n(0, 1, 1), n(0, 1, 0)];
    case 1: return [n(1, 0, 0), n(1, 1, 0), n(1, 1, 1), n(1, 0, 1)];
    case 2: return [n(0, 0, 0), n(1, 0, 0), n(1, 0, 1), n(0, 0, 1)];
    case 3: return [n(0, 1, 0), n(0, 1, 1), n(1, 1, 1), n(1, 1, 0)];
    case 4: return [n(0, 0, 0), n(0, 1, 0), n(1, 1, 0), n(1, 0, 0)];
    default: return [n(0, 0, 1), n(1, 0, 1), n(1, 1, 1), n(0, 1, 1)];
  }
}

export const FACE_NORMAL: [number, number, number][] = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

export function nodeXYZ(g: Grid, n: number): [number, number, number] {
  const sx = g.nx + 1, sxy = (g.nx + 1) * (g.ny + 1);
  const k = Math.floor(n / sxy), r = n - k * sxy, j = Math.floor(r / sx), i = r - j * sx;
  return [g.ox + i * g.h, g.oy + j * g.h, g.oz + k * g.h];
}

/** Axis-aligned bounding box of the solid voxels, mm */
export function solidBox(g: Grid): { min: [number, number, number]; max: [number, number, number] } {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const nxy = g.nx * g.ny;
  for (let e = 0; e < g.nElem; e++) {
    const v = g.elem[e], k = Math.floor(v / nxy), r = v - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
    if (i < mn[0]) mn[0] = i; if (i + 1 > mx[0]) mx[0] = i + 1;
    if (j < mn[1]) mn[1] = j; if (j + 1 > mx[1]) mx[1] = j + 1;
    if (k < mn[2]) mn[2] = k; if (k + 1 > mx[2]) mx[2] = k + 1;
  }
  return { min: [g.ox + mn[0] * g.h, g.oy + mn[1] * g.h, g.oz + mn[2] * g.h], max: [g.ox + mx[0] * g.h, g.oy + mx[1] * g.h, g.oz + mx[2] * g.h] };
}

/** Trilinear sample weights of a point on the node grid: returns [base node, fx, fy, fz] or null outside */
export function locate(g: Grid, x: number, y: number, z: number): { n0: number; fx: number; fy: number; fz: number } | null {
  const u = (x - g.ox) / g.h, v = (y - g.oy) / g.h, w = (z - g.oz) / g.h;
  let i = Math.floor(u), j = Math.floor(v), k = Math.floor(w);
  if (u < -1e-6 || v < -1e-6 || w < -1e-6 || u > g.nx + 1e-6 || v > g.ny + 1e-6 || w > g.nz + 1e-6) return null;
  i = Math.min(g.nx - 1, Math.max(0, i)); j = Math.min(g.ny - 1, Math.max(0, j)); k = Math.min(g.nz - 1, Math.max(0, k));
  return { n0: nodeIndex(g, i, j, k), fx: u - i, fy: v - j, fz: w - k };
}
