// Turns a CaseInput into a voxel model: grid, per-body materials and the surface faces of every selection.

import type { Mesh } from '../cam/geometry';
import { MATERIALS, materialById, type Axis, type Material } from './materials';
import { MESH_PRESETS, type CaeBody, type CaseInput, type MeshSettings, type Region } from './model';
import { boxMesh } from './shapes';
import { FACE_NORMAL, nNodes, nodeXYZ, voxelize, voxelizeBox, vox, MG_MULT, cornerOffsets, elemBaseNodes, type Body, type Grid, type SurfFace } from './voxel';

export type V3 = [number, number, number];

export interface Box { min: V3; max: V3 }

export function bodiesBox(bodies: CaeBody[]): Box {
  const mn: V3 = [Infinity, Infinity, Infinity], mx: V3 = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies) {
    if (b.role === 'carve') continue;
    const t = b.tris;
    for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { const v = t[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  }
  if (!Number.isFinite(mn[0])) return { min: [0, 0, 0], max: [1, 1, 1] };
  return { min: mn, max: mx };
}

export const boxSize = (b: Box): V3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

/** Element edge for the mesh settings and the part size. */
export function elementSize(box: Box, mesh: MeshSettings): number {
  const s = boxSize(box), L = Math.max(s[0], s[1], s[2], 1e-6);
  if (mesh.preset === 'custom') return Math.max(mesh.size, L / 400);
  return L / (MESH_PRESETS[mesh.preset] ?? mesh.cells);
}

export function meshOf(b: CaeBody): Mesh {
  const t = b.tris, n = t.length / 9;
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { const v = t[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { tris: t, n, min, max };
}

export interface Prep {
  input: CaseInput;
  g: Grid;
  mats: Material[];                 // per grid material index (mat - 1)
  fibre: Axis[];
  bodyOf: number[];                 // grid material index → index in input.bodies (-1 = air box)
  matOf: Map<string, number>;       // body id → grid material index
  air: number;                      // grid material index of the air box (or -1)
  box: Box;                         // bounding box of the parts
  minDim: number;                   // smallest bounding-box edge of the parts
  warnings: string[];
  faces: (regionId: string) => SurfFace[];
  allFaces: () => SurfFace[];       // faces between solid material and void (or the domain boundary)
  bodyFaces: (bodyId: string) => SurfFace[];
  bodyNodes: (bodyId: string) => Uint8Array;
  targetNodes: (target: string) => Uint8Array;     // region id or body id → set of nodes (for Dirichlet conditions)
  isNodeRegion: (regionId: string) => boolean;     // the region is a set of picked edges or points (no faces)
  nodesOf: (regionId: string) => number[];         // surface nodes nearest to the picked edges / points
}

export function airMaterial(): Material {
  return materialById('air') ?? MATERIALS[0];
}

export interface PrepOpts { h?: number; airMargin?: number; maxCells?: number; fluidOnly?: boolean; clip?: Box; maxElems?: number }

export function prepare(input: CaseInput, opts: PrepOpts = {}): Prep {
  const warnings: string[] = [];
  const solids = input.bodies.filter((b) => b.role !== 'carve' && b.role !== 'fluid');
  const carves = input.bodies.filter((b) => b.role === 'carve');
  const box = bodiesBox(input.bodies.filter((b) => b.role !== 'carve'));
  const size = boxSize(box);
  const minDim = Math.min(size[0], size[1], size[2]);
  let h = opts.h ?? elementSize(box, input.mesh);
  if (opts.maxElems && !opts.clip) {
    const est = estimateMesh(input.bodies, { preset: 'custom', cells: 0, size: h }).elements;
    if (est > opts.maxElems) { const f = Math.cbrt(est / opts.maxElems); h *= f; warnings.push(`The mesh was coarsened to ${(h).toPrecision(3)} mm (about ${opts.maxElems.toLocaleString()} elements) because this analysis type is expensive.`); }
  }
  const maxCells = opts.maxCells ?? 4_500_000;
  const useAir = (opts.airMargin ?? 0) > 0;
  const L = Math.max(size[0], size[1], size[2]);
  const am = (opts.airMargin ?? 0) * L;
  const dimsFor = (hh: number) => [0, 1, 2].map((k) => Math.ceil((size[k] + 2 * am) / hh) + 2);
  for (let guard = 0; guard < 8; guard++) {
    const d = dimsFor(h);
    if (d[0] * d[1] * d[2] <= maxCells) break;
    h *= 1.15;
    if (guard === 7) warnings.push('The mesh was coarsened to fit the memory limit.');
  }
  const bodies: Body[] = [];
  const mats: Material[] = [], fibre: Axis[] = [], bodyOf: number[] = [];
  const matOf = new Map<string, number>();
  let air = -1;
  if (useAir) {
    const a = airMaterial();
    air = 0; mats.push(a); fibre.push(0); bodyOf.push(-1);
    const hm = 1.5 * h;
    bodies.push({ mesh: boxMesh(box.min[0] - am - hm, box.min[1] - am - hm, box.min[2] - am - hm, box.max[0] + am + hm, box.max[1] + am + hm, box.max[2] + am + hm), mat: 0, name: 'Air' });
  }
  for (const b of solids) {
    const mi = mats.length;
    mats.push(b.mat); fibre.push(b.fibre); bodyOf.push(input.bodies.indexOf(b)); matOf.set(b.id, mi);
    bodies.push({ mesh: meshOf(b), mat: mi, name: b.name });
  }
  for (const b of carves) bodies.push({ mesh: meshOf(b), mat: -1, name: b.name });
  const g = opts.clip ? voxelizeBox(bodies, h, opts.clip.min, opts.clip.max) : voxelize(bodies, h, useAir ? 0 : 1, useAir ? 0 : 1);
  warnings.push(...g.warnings);
  if (g.nElem === 0) warnings.push('The model produced no solid elements: check that the bodies are closed (watertight) solids.');

  const faceCache = new Map<string, SurfFace[]>();
  let surf: SurfFace[] | null = null;
  const solidFaces = (): SurfFace[] => {
    if (surf) return surf;
    surf = [];
    const nxy = g.nx * g.ny;
    for (let e = 0; e < g.nElem; e++) {
      const v = g.elem[e], m = g.mat[v];
      if (m === air + 1 && air >= 0) continue;
      const k = Math.floor(v / nxy), r = v - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
      const open = (nv: number, inside: boolean) => !inside || g.mat[nv] === 0 || (air >= 0 && g.mat[nv] === air + 1);
      if (open(v - 1, i > 0)) surf.push({ vox: v, dir: 0 });
      if (open(v + 1, i < g.nx - 1)) surf.push({ vox: v, dir: 1 });
      if (open(v - g.nx, j > 0)) surf.push({ vox: v, dir: 2 });
      if (open(v + g.nx, j < g.ny - 1)) surf.push({ vox: v, dir: 3 });
      if (open(v - nxy, k > 0)) surf.push({ vox: v, dir: 4 });
      if (open(v + nxy, k < g.nz - 1)) surf.push({ vox: v, dir: 5 });
    }
    return surf;
  };

  const bodyFaces = (bodyId: string): SurfFace[] => {
    const mi = matOf.get(bodyId);
    if (mi === undefined) return [];
    const key = 'b:' + bodyId;
    const c = faceCache.get(key); if (c) return c;
    const out: SurfFace[] = [];
    const nxy = g.nx * g.ny;
    for (let e = 0; e < g.nElem; e++) {
      const v = g.elem[e];
      if (g.mat[v] !== mi + 1) continue;
      const k = Math.floor(v / nxy), r = v - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
      const open = (nv: number, inside: boolean) => !inside || g.mat[nv] !== mi + 1;
      if (open(v - 1, i > 0)) out.push({ vox: v, dir: 0 });
      if (open(v + 1, i < g.nx - 1)) out.push({ vox: v, dir: 1 });
      if (open(v - g.nx, j > 0)) out.push({ vox: v, dir: 2 });
      if (open(v + g.nx, j < g.ny - 1)) out.push({ vox: v, dir: 3 });
      if (open(v - nxy, k > 0)) out.push({ vox: v, dir: 4 });
      if (open(v + nxy, k < g.nz - 1)) out.push({ vox: v, dir: 5 });
    }
    faceCache.set(key, out);
    return out;
  };

  const faces = (regionId: string): SurfFace[] => {
    const c = faceCache.get(regionId); if (c) return c;
    const r = input.regions.find((q) => q.id === regionId);
    let out: SurfFace[] = [];
    if (regionId.startsWith('body:')) out = bodyFaces(regionId.slice(5));
    else if (r) out = resolveRegion(g, r, solidFaces(), box, input.bodies, matOf, air);
    faceCache.set(regionId, out);
    return out;
  };

  const bodyNodes = (bodyId: string): Uint8Array => {
    const mi = matOf.get(bodyId), nd = new Uint8Array(nNodes(g));
    if (mi === undefined) return nd;
    const base = elemBaseNodes(g), off = cornerOffsets(g);
    for (let e = 0; e < g.nElem; e++) if (g.mat[g.elem[e]] === mi + 1) for (let a = 0; a < 8; a++) nd[base[e] + off[a]] = 1;
    return nd;
  };

  // ---- picked edges and points: the surface nodes closest to them ----------------------------------------------------
  let surfIdx: { cell: number; hash: Map<number, number[]> } | null = null;
  const surfaceIndex = () => {
    if (surfIdx) return surfIdx;
    const seen = new Uint8Array(nNodes(g)), hash = new Map<number, number[]>(), cell = 2 * g.h;
    const key = (i: number, j: number, k: number) => ((i + 4096) * 8192 + (j + 4096)) * 8192 + (k + 4096);
    for (const f of solidFaces()) for (const n of faceNodesLocal(g, f)) {
      if (seen[n]) continue; seen[n] = 1;
      const p = nodeXYZ(g, n), kk = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell));
      const l = hash.get(kk); if (l) l.push(n); else hash.set(kk, [n]);
    }
    surfIdx = { cell, hash };
    return surfIdx;
  };
  const nearestSurfaceNode = (p: V3, maxD: number): number => {
    const { cell, hash } = surfaceIndex();
    const ci = Math.floor(p[0] / cell), cj = Math.floor(p[1] / cell), ck = Math.floor(p[2] / cell);
    let best = -1, bd = maxD * maxD;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = hash.get(((ci + a + 4096) * 8192 + (cj + b + 4096)) * 8192 + (ck + c + 4096)); if (!l) continue;
      for (const n of l) { const q = nodeXYZ(g, n), d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2; if (d <= bd) { bd = d; best = n; } }
    }
    return best;
  };
  const nodeCache = new Map<string, number[]>();
  const isNodeRegion = (regionId: string) => { const r = input.regions.find((q) => q.id === regionId); return !!r && (r.kind === 'edge' || r.kind === 'point'); };
  const nodesOf = (regionId: string): number[] => {
    const hit = nodeCache.get(regionId); if (hit) return hit;
    const r = input.regions.find((q) => q.id === regionId), set = new Set<number>();
    if (r?.kind === 'point' && r.pts) {
      for (let i = 0; i + 2 < r.pts.length; i += 3) { const n = nearestSurfaceNode([r.pts[i], r.pts[i + 1], r.pts[i + 2]], 1.8 * g.h); if (n >= 0) set.add(n); }
    } else if (r?.kind === 'edge' && r.segs) {
      const step = 0.5 * g.h;
      for (let i = 0; i + 5 < r.segs.length; i += 6) {
        const a = [r.segs[i], r.segs[i + 1], r.segs[i + 2]], b = [r.segs[i + 3], r.segs[i + 4], r.segs[i + 5]];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = Math.max(1, Math.ceil(L / step));
        for (let q = 0; q <= m; q++) { const t = q / m, n = nearestSurfaceNode([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])], 1.8 * g.h); if (n >= 0) set.add(n); }
      }
    }
    const out = Array.from(set);
    nodeCache.set(regionId, out);
    return out;
  };

  const targetNodes = (target: string): Uint8Array => {
    if (target.startsWith('body:')) return bodyNodes(target.slice(5));
    const nd = new Uint8Array(nNodes(g));
    if (isNodeRegion(target)) { for (const n of nodesOf(target)) nd[n] = 1; return nd; }
    const fs = faces(target);
    for (const f of fs) for (const n of faceNodesLocal(g, f)) nd[n] = 1;
    return nd;
  };

  return { input, g, mats, fibre, bodyOf, matOf, air, box, minDim, warnings, faces, allFaces: solidFaces, bodyFaces, bodyNodes, targetNodes, isNodeRegion, nodesOf };
}

function faceNodesLocal(g: Grid, f: SurfFace): number[] {
  const nxy = g.nx * g.ny;
  const k = Math.floor(f.vox / nxy), r = f.vox - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
  const sx = 1, sy = g.nx + 1, sz = (g.nx + 1) * (g.ny + 1), b = i + j * sy + k * sz;
  switch (f.dir) {
    case 0: return [b, b + sz, b + sz + sy, b + sy];
    case 1: return [b + sx, b + sx + sy, b + sx + sy + sz, b + sx + sz];
    case 2: return [b, b + sx, b + sx + sz, b + sz];
    case 3: return [b + sy, b + sy + sz, b + sy + sx + sz, b + sy + sx];
    case 4: return [b, b + sy, b + sy + sx, b + sx];
    default: return [b + sz, b + sz + sx, b + sz + sx + sy, b + sz + sy];
  }
}
export { faceNodesLocal };

export function faceCenter(g: Grid, f: SurfFace): V3 {
  const nxy = g.nx * g.ny;
  const k = Math.floor(f.vox / nxy), r = f.vox - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
  const n = FACE_NORMAL[f.dir];
  return [g.ox + (i + 0.5 + 0.5 * n[0]) * g.h, g.oy + (j + 0.5 + 0.5 * n[1]) * g.h, g.oz + (k + 0.5 + 0.5 * n[2]) * g.h];
}

function resolveRegion(g: Grid, r: Region, all: SurfFace[], box: Box, bodies: CaeBody[], matOf: Map<string, number>, air: number): SurfFace[] {
  void air;
  if (r.kind === 'all') return all;
  if (r.kind === 'body') {
    const b = bodies[r.bodyIndex ?? 0]; if (!b) return [];
    const mi = matOf.get(b.id);
    return all.filter((f) => g.mat[f.vox] === (mi ?? -2) + 1);
  }
  if (r.kind === 'plane') {
    const ax = r.axis ?? 0, side = r.side ?? 0, tol = 0.6 * g.h;
    const target = side ? box.max[ax] : box.min[ax];
    return all.filter((f) => {
      const n = FACE_NORMAL[f.dir];
      if (Math.abs(n[ax]) !== 1 || n[ax] !== (side ? 1 : -1)) return false;
      return Math.abs(faceCenter(g, f)[ax] - target) <= tol + 0.5 * g.h;
    });
  }
  if (r.kind === 'box' && r.box) {
    const [x0, y0, z0, x1, y1, z1] = r.box, e = 0.51 * g.h;
    return all.filter((f) => { const c = faceCenter(g, f); return c[0] >= x0 - e && c[0] <= x1 + e && c[1] >= y0 - e && c[1] <= y1 + e && c[2] >= z0 - e && c[2] <= z1 + e; });
  }
  if (r.kind === 'tris') {
    const body = bodies[r.bodyIndex ?? 0]; if (!body || !r.tris?.length) return [];
    const mi = matOf.get(body.id);
    return facesNearTris(g, all.filter((f) => mi === undefined || g.mat[f.vox] === mi + 1), body.tris, r.tris);
  }
  return [];
}

/** Surface faces lying within about one cell of the chosen triangles and facing the same way. */
export function facesNearTris(g: Grid, faces: SurfFace[], tris: Float32Array, ids: number[]): SurfFace[] {
  const s = 2 * g.h, hash = new Map<number, number[]>();
  const key = (i: number, j: number, k: number) => ((i + 1024) * 2048 + (j + 1024)) * 2048 + (k + 1024);
  const tri: Float64Array[] = [];
  const pad = 1.05 * g.h;
  for (let q = 0; q < ids.length; q++) {
    const o = ids[q] * 9;
    const a = [tris[o], tris[o + 1], tris[o + 2]], b = [tris[o + 3], tris[o + 4], tris[o + 5]], c = [tris[o + 6], tris[o + 7], tris[o + 8]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    tri.push(Float64Array.from([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], nx, ny, nz]));
    const mn = [Math.min(a[0], b[0], c[0]) - pad, Math.min(a[1], b[1], c[1]) - pad, Math.min(a[2], b[2], c[2]) - pad];
    const mx = [Math.max(a[0], b[0], c[0]) + pad, Math.max(a[1], b[1], c[1]) + pad, Math.max(a[2], b[2], c[2]) + pad];
    for (let i = Math.floor(mn[0] / s); i <= Math.floor(mx[0] / s); i++) for (let j = Math.floor(mn[1] / s); j <= Math.floor(mx[1] / s); j++) for (let k = Math.floor(mn[2] / s); k <= Math.floor(mx[2] / s); k++) {
      const kk = key(i, j, k); const l = hash.get(kk); if (l) l.push(q); else hash.set(kk, [q]);
    }
  }
  const out: SurfFace[] = [];
  const lim = 1.0 * g.h;
  for (const f of faces) {
    const c = faceCenter(g, f), n = FACE_NORMAL[f.dir];
    const l = hash.get(key(Math.floor(c[0] / s), Math.floor(c[1] / s), Math.floor(c[2] / s)));
    if (!l) continue;
    for (const q of l) {
      const t = tri[q];
      if (t[9] * n[0] + t[10] * n[1] + t[11] * n[2] < 0.25) continue;
      if (distPointTri(c, t) <= lim) { out.push(f); break; }
    }
  }
  return out;
}

function distPointTri(p: V3, t: Float64Array): number {
  const ax = t[0], ay = t[1], az = t[2], bx = t[3], by = t[4], bz = t[5], cx = t[6], cy = t[7], cz = t[8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = p[0] - ax, apy = p[1] - ay, apz = p[2] - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const hyp = (x: number, y: number, z: number) => Math.hypot(p[0] - x, p[1] - y, p[2] - z);
  if (d1 <= 0 && d2 <= 0) return hyp(ax, ay, az);
  const bpx = p[0] - bx, bpy = p[1] - by, bpz = p[2] - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return hyp(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return hyp(ax + v * abx, ay + v * aby, az + v * abz); }
  const cpx = p[0] - cx, cpy = p[1] - cy, cpz = p[2] - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return hyp(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return hyp(ax + w * acx, ay + w * acy, az + w * acz); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return hyp(bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz)); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return hyp(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

/** Estimated element and DOF counts without voxelising (for the UI). */
export function estimateMesh(bodies: CaeBody[], mesh: MeshSettings): { h: number; elements: number; dof: number; acrossMin: number } {
  const box = bodiesBox(bodies), h = elementSize(box, mesh), s = boxSize(box);
  let vol = 0;
  for (const b of bodies) {
    if (b.role === 'carve') continue;
    const t = b.tris;
    let v = 0;
    for (let i = 0; i < t.length; i += 9) {
      v += (t[i] * (t[i + 4] * t[i + 8] - t[i + 5] * t[i + 7]) - t[i + 1] * (t[i + 3] * t[i + 8] - t[i + 5] * t[i + 6]) + t[i + 2] * (t[i + 3] * t[i + 7] - t[i + 4] * t[i + 6])) / 6;
    }
    vol += Math.abs(v);
  }
  const elements = Math.round(vol / (h * h * h));
  return { h, elements, dof: Math.round(elements * 3.6), acrossMin: Math.min(s[0], s[1], s[2]) / h };
}

export { vox, MG_MULT };
