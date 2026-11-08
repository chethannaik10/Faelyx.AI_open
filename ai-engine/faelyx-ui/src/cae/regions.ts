// Face selections for the pre-processor: which triangles a region covers, flood-fill face picking and the load glyphs shown in the viewport.

import { LOAD_SPECS, type CaeBody, type Load, type Region } from './model';
import type { GlyphSpec, Highlight, V3 } from './CaeView';

export interface TriSet { body: number; tris: number[] }

export function bodiesBounds(bodies: CaeBody[], includeCarve = false): { min: V3; max: V3 } | null {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const b of bodies) {
    if (b.role === 'carve' && !includeCarve) continue;
    for (let i = 0; i < b.tris.length; i += 3) for (let k = 0; k < 3; k++) { const v = b.tris[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; any = true; }
  }
  return any ? { min, max } : null;
}

export function triNormal(t: Float32Array, i: number): V3 {
  const o = i * 9;
  const ux = t[o + 3] - t[o], uy = t[o + 4] - t[o + 1], uz = t[o + 5] - t[o + 2], vx = t[o + 6] - t[o], vy = t[o + 7] - t[o + 1], vz = t[o + 8] - t[o + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
export function triCentre(t: Float32Array, i: number): V3 {
  const o = i * 9;
  return [(t[o] + t[o + 3] + t[o + 6]) / 3, (t[o + 1] + t[o + 4] + t[o + 7]) / 3, (t[o + 2] + t[o + 5] + t[o + 8]) / 3];
}
export function triArea(t: Float32Array, i: number): number {
  const o = i * 9;
  const ux = t[o + 3] - t[o], uy = t[o + 4] - t[o + 1], uz = t[o + 5] - t[o + 2], vx = t[o + 6] - t[o], vy = t[o + 7] - t[o + 1], vz = t[o + 8] - t[o + 2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/** Triangles covered by a region, per body (approximation of how the solver resolves it on the voxel grid). */
export function regionTris(r: Region, bodies: CaeBody[]): TriSet[] {
  const out: TriSet[] = [];
  const solid = bodies.map((b, i) => [b, i] as const).filter(([b]) => b.role !== 'carve');
  if (r.kind === 'tris') { const b = bodies[r.bodyIndex ?? 0]; if (b && r.tris?.length) out.push({ body: r.bodyIndex ?? 0, tris: r.tris }); return out; }
  if (r.kind === 'body') { const b = bodies[r.bodyIndex ?? 0]; if (b) out.push({ body: r.bodyIndex ?? 0, tris: Array.from({ length: b.tris.length / 9 }, (_, i) => i) }); return out; }
  if (r.kind === 'all') { for (const [b, i] of solid) out.push({ body: i, tris: Array.from({ length: b.tris.length / 9 }, (_, k) => k) }); return out; }
  const bb = bodiesBounds(bodies);
  if (!bb) return out;
  if (r.kind === 'plane') {
    const ax = r.axis ?? 0, side = r.side ?? 0, target = side ? bb.max[ax] : bb.min[ax];
    const size = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]), tol = 0.012 * size;
    for (const [b, i] of solid) {
      const list: number[] = [];
      for (let t = 0; t < b.tris.length / 9; t++) {
        const n = triNormal(b.tris, t), c = triCentre(b.tris, t);
        if (n[ax] * (side ? 1 : -1) > 0.7 && Math.abs(c[ax] - target) <= tol) list.push(t);
      }
      if (list.length) out.push({ body: i, tris: list });
    }
    return out;
  }
  if (r.kind === 'box' && r.box) {
    const [x0, y0, z0, x1, y1, z1] = r.box;
    for (const [b, i] of solid) {
      const list: number[] = [];
      for (let t = 0; t < b.tris.length / 9; t++) { const c = triCentre(b.tris, t); if (c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1 && c[2] >= z0 && c[2] <= z1) list.push(t); }
      if (list.length) out.push({ body: i, tris: list });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Flood-fill face picking

interface Adj { nb: Int32Array; normals: Float32Array; ids: Int32Array; pos: number[] }
const adjCache = new WeakMap<Float32Array, Adj>();

function adjacency(tris: Float32Array): Adj {
  const hit = adjCache.get(tris);
  if (hit) return hit;
  const n = tris.length / 9;
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < tris.length; i++) { if (tris[i] < mn) mn = tris[i]; if (tris[i] > mx) mx = tris[i]; }
  const q = 1e4 / Math.max(1e-9, mx - mn);
  const vid = new Map<string, number>();
  const ids = new Int32Array(n * 3);
  const pos: number[] = [];
  for (let i = 0; i < n * 3; i++) {
    const k = `${Math.round(tris[3 * i] * q)},${Math.round(tris[3 * i + 1] * q)},${Math.round(tris[3 * i + 2] * q)}`;
    let v = vid.get(k); if (v === undefined) { v = vid.size; vid.set(k, v); pos.push(tris[3 * i], tris[3 * i + 1], tris[3 * i + 2]); }
    ids[i] = v;
  }
  const edge = new Map<number, number>();
  const nb = new Int32Array(n * 3).fill(-1);
  for (let t = 0; t < n; t++) for (let e = 0; e < 3; e++) {
    const a = ids[3 * t + e], b = ids[3 * t + ((e + 1) % 3)];
    const key = Math.min(a, b) * 4194304 + Math.max(a, b);
    const other = edge.get(key);
    if (other === undefined) edge.set(key, t * 3 + e);
    else { nb[t * 3 + e] = Math.floor(other / 3); nb[other] = t; }
  }
  const normals = new Float32Array(n * 3);
  for (let t = 0; t < n; t++) { const v = triNormal(tris, t); normals[3 * t] = v[0]; normals[3 * t + 1] = v[1]; normals[3 * t + 2] = v[2]; }
  const adj = { nb, normals, ids, pos };
  adjCache.set(tris, adj);
  return adj;
}

/** Triangles connected to `seed` through edges whose neighbouring normals differ by less than `angleDeg` (and stay within 100° of the seed). */
export function floodFace(tris: Float32Array, seed: number, angleDeg: number): number[] {
  const { nb, normals } = adjacency(tris);
  const lim = Math.cos((angleDeg * Math.PI) / 180), limSeed = Math.cos((100 * Math.PI) / 180);
  const seen = new Set<number>([seed]), stack = [seed];
  const sn = [normals[3 * seed], normals[3 * seed + 1], normals[3 * seed + 2]];
  while (stack.length) {
    const t = stack.pop()!;
    for (let e = 0; e < 3; e++) {
      const u = nb[3 * t + e];
      if (u < 0 || seen.has(u)) continue;
      const d = normals[3 * t] * normals[3 * u] + normals[3 * t + 1] * normals[3 * u + 1] + normals[3 * t + 2] * normals[3 * u + 2];
      const ds = sn[0] * normals[3 * u] + sn[1] * normals[3 * u + 1] + sn[2] * normals[3 * u + 2];
      if (d >= lim && ds >= limSeed) { seen.add(u); stack.push(u); }
    }
  }
  return Array.from(seen);
}

// ---------------------------------------------------------------------------------------------
// Edge and point picking

interface FeatEdge { a: number; b: number }          // vertex ids
interface Feat { edges: FeatEdge[]; at: Map<number, number[]>; angle: number }
const featCache = new WeakMap<Float32Array, Feat>();

/** Feature edges: mesh edges where the surface turns by more than `angleDeg` (or that are open), with a vertex → edges index. */
function featureEdges(tris: Float32Array, angleDeg: number): Feat {
  const hit = featCache.get(tris);
  if (hit && hit.angle === angleDeg) return hit;
  const { nb, normals, ids } = adjacency(tris);
  const n = tris.length / 9, lim = Math.cos((angleDeg * Math.PI) / 180);
  const edges: FeatEdge[] = [], at = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const k = edges.length; edges.push({ a, b });
    (at.get(a) ?? at.set(a, []).get(a)!).push(k); (at.get(b) ?? at.set(b, []).get(b)!).push(k);
  };
  for (let t = 0; t < n; t++) for (let e = 0; e < 3; e++) {
    const u = nb[3 * t + e], a = ids[3 * t + e], b = ids[3 * t + ((e + 1) % 3)];
    if (a === b) continue;
    if (u < 0) { add(a, b); continue; }
    if (u < t) continue;                                // each interior edge once
    const d = normals[3 * t] * normals[3 * u] + normals[3 * t + 1] * normals[3 * u + 1] + normals[3 * t + 2] * normals[3 * u + 2];
    if (d < lim) add(a, b);
  }
  const f = { edges, at, angle: angleDeg };
  featCache.set(tris, f);
  return f;
}

const segDist = (p: V3, a: V3, b: V3): number => {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 0 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * abx, p[1] - a[1] - t * aby, p[2] - a[2] - t * abz);
};

/** The feature edge nearest to a surface hit (searched over the neighbourhood of the hit triangle) and the whole smooth chain it belongs
 *  to, as segments of 6 floats (x0 y0 z0 x1 y1 z1). `null` when the surface has no feature edge nearby. */
export function pickEdge(tris: Float32Array, tri: number, hit: V3, angleDeg: number): { segs: number[]; snap: V3 } | null {
  const { nb, ids, pos } = adjacency(tris);
  const F = featureEdges(tris, Math.max(5, angleDeg));
  const P = (v: number): V3 => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
  // neighbourhood: triangles within 4 steps of the hit
  const seen = new Set<number>([tri]);
  let frontier = [tri];
  for (let d = 0; d < 4; d++) {
    const next: number[] = [];
    for (const t of frontier) for (let e = 0; e < 3; e++) { const u = nb[3 * t + e]; if (u >= 0 && !seen.has(u)) { seen.add(u); next.push(u); } }
    frontier = next;
  }
  const vset = new Set<number>();
  for (const t of seen) for (let e = 0; e < 3; e++) vset.add(ids[3 * t + e]);
  let best = -1, bd = Infinity;
  const tried = new Set<number>();
  for (const v of vset) for (const k of F.at.get(v) ?? []) {
    if (tried.has(k)) continue; tried.add(k);
    const e = F.edges[k], d = segDist(hit, P(e.a), P(e.b));
    if (d < bd) { bd = d; best = k; }
  }
  if (best < 0) return null;
  // grow along the chain
  const used = new Set<number>([best]);
  const chain: number[] = [best];
  const walk = (from: number, v: number, dir: V3, front: boolean) => {
    let cur = v, d = dir;
    for (let guard = 0; guard < 100000; guard++) {
      const cand = (F.at.get(cur) ?? []).filter((k) => !used.has(k));
      if (!cand.length) return;
      const lim = (F.at.get(cur) ?? []).length <= 2 ? Math.cos((65 * Math.PI) / 180) : Math.cos((35 * Math.PI) / 180);
      let bk = -1, bc = -2, bw = -1;
      for (const k of cand) {
        const e = F.edges[k], w = e.a === cur ? e.b : e.a, pw = P(w), pc = P(cur);
        const x = pw[0] - pc[0], y = pw[1] - pc[1], z = pw[2] - pc[2], l = Math.hypot(x, y, z) || 1;
        const c = (x * d[0] + y * d[1] + z * d[2]) / l;
        if (c > bc) { bc = c; bk = k; bw = w; }
      }
      if (bk < 0 || bc < lim) return;
      used.add(bk);
      if (front) chain.push(bk); else chain.unshift(bk);
      const pc = P(cur), pw = P(bw), l = Math.hypot(pw[0] - pc[0], pw[1] - pc[1], pw[2] - pc[2]) || 1;
      d = [(pw[0] - pc[0]) / l, (pw[1] - pc[1]) / l, (pw[2] - pc[2]) / l];
      cur = bw; void from;
    }
  };
  const e0 = F.edges[best], pa = P(e0.a), pb = P(e0.b), l0 = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) || 1;
  walk(e0.a, e0.b, [(pb[0] - pa[0]) / l0, (pb[1] - pa[1]) / l0, (pb[2] - pa[2]) / l0], true);
  walk(e0.b, e0.a, [(pa[0] - pb[0]) / l0, (pa[1] - pb[1]) / l0, (pa[2] - pb[2]) / l0], false);
  const segs: number[] = [];
  for (const k of chain) { const e = F.edges[k], a = P(e.a), b = P(e.b); segs.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
  // nearest point on the picked edge, for the cursor snap
  const ep = (() => { const a = P(e0.a), b = P(e0.b); const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1; const t = Math.max(0, Math.min(1, ((hit[0] - a[0]) * ab[0] + (hit[1] - a[1]) * ab[1] + (hit[2] - a[2]) * ab[2]) / l2)); return [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]] as V3; })();
  return { segs, snap: ep };
}

/** A point on the surface for a hit: a corner / mesh vertex when the click is close to one, otherwise the hit itself. */
export function pickPoint(tris: Float32Array, tri: number, hit: V3): { p: V3; vertex: boolean } {
  const o = tri * 9;
  let bi = -1, bd = Infinity, longest = 0;
  for (let k = 0; k < 3; k++) {
    const v: V3 = [tris[o + 3 * k], tris[o + 3 * k + 1], tris[o + 3 * k + 2]], w: V3 = [tris[o + 3 * ((k + 1) % 3)], tris[o + 3 * ((k + 1) % 3) + 1], tris[o + 3 * ((k + 1) % 3) + 2]];
    const d = Math.hypot(hit[0] - v[0], hit[1] - v[1], hit[2] - v[2]);
    if (d < bd) { bd = d; bi = k; }
    longest = Math.max(longest, Math.hypot(v[0] - w[0], v[1] - w[1], v[2] - w[2]));
  }
  if (bd <= 0.22 * longest) return { p: [tris[o + 3 * bi], tris[o + 3 * bi + 1], tris[o + 3 * bi + 2]], vertex: true };
  return { p: hit, vertex: false };
}

export const isGeoRegion = (r: Region | undefined): r is Region => !!r && (r.kind === 'edge' || r.kind === 'point');

/** Evenly spaced anchor points (along the edge chains by arc length, or the picked points) for the glyphs of a load. */
export function geoAnchors(r: Region, count: number): { p: V3; n: V3 }[] {
  const out: { p: V3; n: V3 }[] = [];
  const up: V3 = [0, 0, 1];
  if (r.kind === 'point' && r.pts) {
    const n = r.pts.length / 3;
    const take = Math.min(count, n);
    for (let i = 0; i < take; i++) { const k = take === 1 ? Math.floor(n / 2) : Math.round((i * (n - 1)) / (take - 1)); out.push({ p: [r.pts[3 * k], r.pts[3 * k + 1], r.pts[3 * k + 2]], n: up }); }
    return out;
  }
  if (r.kind === 'edge' && r.segs && r.segs.length >= 6) {
    const s = r.segs, m = s.length / 6;
    const len: number[] = []; let tot = 0;
    for (let i = 0; i < m; i++) { const l = Math.hypot(s[6 * i + 3] - s[6 * i], s[6 * i + 4] - s[6 * i + 1], s[6 * i + 5] - s[6 * i + 2]); len.push(l); tot += l; }
    for (let q = 0; q < count; q++) {
      let target = count === 1 ? tot / 2 : (tot * q) / Math.max(1, count - 1);
      let i = 0;
      while (i < m - 1 && target > len[i]) { target -= len[i]; i++; }
      const t = len[i] > 0 ? Math.min(1, target / len[i]) : 0;
      out.push({ p: [s[6 * i] + t * (s[6 * i + 3] - s[6 * i]), s[6 * i + 1] + t * (s[6 * i + 4] - s[6 * i + 1]), s[6 * i + 2] + t * (s[6 * i + 5] - s[6 * i + 2])], n: up });
    }
  }
  return out;
}

export interface Marks { segs: { s: number[]; color: string }[]; pts: { p: number[]; color: string }[] }

/** Edge and point selections to draw: the ones used by a load (in its colour), the others in their own colour, the pending pick in yellow. */
export function regionMarks(regions: Region[], loads: Load[], pending?: { segs: number[]; pts: number[] } | null, selId?: string | null, hover?: { segs: number[]; pts: number[] } | null): Marks {
  const m: Marks = { segs: [], pts: [] };
  const used = new Map<string, string>();
  for (const l of loads) if (l.on && !used.has(l.region)) used.set(l.region, loadColor(l));
  for (const r of regions) {
    if (!isGeoRegion(r)) continue;
    const color = selId === r.id ? '#ffffff' : used.get(r.id) ?? r.color;
    if (r.segs?.length) m.segs.push({ s: r.segs, color });
    if (r.pts?.length) m.pts.push({ p: r.pts, color });
  }
  if (hover?.segs.length) m.segs.push({ s: hover.segs, color: '#7be0ff' });
  if (hover?.pts.length) m.pts.push({ p: hover.pts, color: '#7be0ff' });
  if (pending?.segs.length) m.segs.push({ s: pending.segs, color: '#ffe14d' });
  if (pending?.pts.length) m.pts.push({ p: pending.pts, color: '#ffe14d' });
  return m;
}

// ---------------------------------------------------------------------------------------------
// Highlights and glyphs

export function loadColor(l: Load): string { return LOAD_SPECS.find((s) => s.type === l.type)?.color ?? '#ffffff'; }

export function regionHighlights(regions: Region[], loads: Load[], bodies: CaeBody[], selected?: { sets: TriSet[] } | null): Highlight[] {
  const hl: Highlight[] = [];
  const used = new Set<string>();
  for (const l of loads) {
    if (!l.on || used.has(l.region)) continue;
    const r = regions.find((x) => x.id === l.region); if (!r) continue;
    used.add(r.id);
    for (const s of regionTris(r, bodies)) hl.push({ body: s.body, tris: s.tris, color: loadColor(l) });
  }
  if (selected) for (const s of selected.sets) hl.push({ body: s.body, tris: s.tris, color: '#ffe14d' });
  return hl;
}

function sampleCentresTris(bodies: CaeBody[], sets: TriSet[], count: number): { p: V3; n: V3 }[] {
  const all: { b: number; t: number; a: number }[] = [];
  for (const s of sets) for (const t of s.tris) all.push({ b: s.body, t, a: triArea(bodies[s.body].tris, t) });
  if (!all.length) return [];
  // area-weighted centroid + a few spread samples
  let cx = 0, cy = 0, cz = 0, w = 0, nx = 0, ny = 0, nz = 0;
  for (const e of all) { const c = triCentre(bodies[e.b].tris, e.t), n = triNormal(bodies[e.b].tris, e.t); cx += c[0] * e.a; cy += c[1] * e.a; cz += c[2] * e.a; nx += n[0] * e.a; ny += n[1] * e.a; nz += n[2] * e.a; w += e.a; }
  const cen: V3 = [cx / w, cy / w, cz / w];
  const nl = Math.hypot(nx, ny, nz) || 1;
  const out: { p: V3; n: V3 }[] = [];
  if (count <= 1) {
    // snap to the triangle closest to the centroid
    let best = all[0], bd = Infinity;
    for (const e of all) { const c = triCentre(bodies[e.b].tris, e.t), d = (c[0] - cen[0]) ** 2 + (c[1] - cen[1]) ** 2 + (c[2] - cen[2]) ** 2; if (d < bd) { bd = d; best = e; } }
    out.push({ p: triCentre(bodies[best.b].tris, best.t), n: triNormal(bodies[best.b].tris, best.t) });
    return out;
  }
  // farthest-point sampling on triangle centres
  const picks: typeof all = [];
  const centres = all.map((e) => triCentre(bodies[e.b].tris, e.t));
  let first = 0, bd = Infinity;
  centres.forEach((c, i) => { const d = (c[0] - cen[0]) ** 2 + (c[1] - cen[1]) ** 2 + (c[2] - cen[2]) ** 2; if (d < bd) { bd = d; first = i; } });
  picks.push(all[first]);
  const dmin = new Float64Array(all.length).fill(Infinity);
  let last = first;
  for (let k = 1; k < Math.min(count, all.length); k++) {
    let far = 0, fd = -1;
    for (let i = 0; i < all.length; i++) {
      const d = (centres[i][0] - centres[last][0]) ** 2 + (centres[i][1] - centres[last][1]) ** 2 + (centres[i][2] - centres[last][2]) ** 2;
      if (d < dmin[i]) dmin[i] = d;
      if (dmin[i] > fd) { fd = dmin[i]; far = i; }
    }
    picks.push(all[far]); last = far;
  }
  void nl;
  for (const e of picks) out.push({ p: triCentre(bodies[e.b].tris, e.t), n: triNormal(bodies[e.b].tris, e.t) });
  return out;
}

export function loadGlyphs(bodies: CaeBody[], regions: Region[], loads: Load[]): GlyphSpec[] {
  const out: GlyphSpec[] = [];
  const bb = bodiesBounds(bodies);
  for (const l of loads) {
    if (!l.on) continue;
    const color = loadColor(l), p = l.p;
    const r = regions.find((x) => x.id === l.region);
    const sets = r ? regionTris(r, bodies) : [];
    const sampleCentres = (b: CaeBody[], s: TriSet[], k: number) => (isGeoRegion(r) ? geoAnchors(r, k) : sampleCentresTris(b, s, k));
    switch (l.type) {
      case 'fixed': case 'frictionless': case 'spring': {
        for (const s of sampleCentres(bodies, sets, 5)) out.push({ p: s.p, dir: s.n, kind: l.type === 'fixed' ? 'fix' : l.type === 'spring' ? 'spring' : 'slide', color });
        break;
      }
      case 'force': { const c = sampleCentres(bodies, sets, 1)[0]; if (c) out.push({ p: c.p, dir: [p.fx ?? 0, p.fy ?? 0, p.fz ?? 0], kind: 'arrow', color }); break; }
      case 'torque': { const c = sampleCentres(bodies, sets, 1)[0]; if (c) out.push({ p: c.p, dir: [p.ax ?? 0, p.ay ?? 0, p.az ?? 1], kind: 'torque', color }); break; }
      case 'pressure': { const sign = (p.p ?? 1) >= 0 ? -1 : 1; for (const s of sampleCentres(bodies, sets, 4)) out.push({ p: s.p, dir: [sign * s.n[0], sign * s.n[1], sign * s.n[2]], kind: 'pressure', color }); break; }
      case 'gravity': { if (bb) out.push({ p: [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, bb.max[2]], dir: [p.gx ?? 0, p.gy ?? 0, p.gz ?? -1], kind: 'arrow', color }); break; }
      case 'centrifugal': out.push({ p: [p.cx ?? 0, p.cy ?? 0, p.cz ?? 0], dir: [p.ax ?? 0, p.ay ?? 0, p.az ?? 1], kind: 'torque', color }); break;
      case 'coil': out.push({ p: [p.cx ?? 0, p.cy ?? 0, p.cz ?? 0], dir: [p.ax ?? 0, p.ay ?? 0, p.az ?? 1], kind: 'coil', color }); break;
      case 'temperature': case 'heatflux': case 'heatpower': case 'convection': case 'radiation':
        for (const s of sampleCentres(bodies, sets, 3)) out.push({ p: s.p, dir: s.n, kind: 'heat', color }); break;
      case 'voltage': case 'currentin':
        for (const s of sampleCentres(bodies, sets, 2)) out.push({ p: s.p, dir: s.n, kind: 'volt', color }); break;
    }
  }
  return out;
}
