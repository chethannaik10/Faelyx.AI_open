// The 3D model's own geometry — edges, planar face boundaries and vertices — in model coordinates,
// for the sketch's Project 3D Element tool. The model is a triangle mesh (that is all the viewport
// has), so a "B-rep edge" here is a chain of sharp mesh edges and a "face" is a connected patch of
// coplanar triangles, found the same way the viewport finds the edges it lets you pick.
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export type Vec3 = number[];
export type Model3DEdge = { key: string; kind: 'line' | 'curve'; closed: boolean; length: number; mid: Vec3; path: Vec3[]; label?: string };
export type Model3DFace = { key: string; normal: Vec3; area: number; centroid: Vec3; /** outer loop first */ loops: Vec3[][] };
export type Model3DVertex = { key: string; p: Vec3; label?: string };
export type Model3DGeometry = { edges: Model3DEdge[]; faces: Model3DFace[]; vertices: Model3DVertex[] };

/** A sketch plane: origin, X direction and normal (Y = normal × X), as everywhere else in the app. */
export type PlaneFrame = { origin: number[]; xDir: number[]; normal: number[] };

const q = (v: number) => Math.round(v * 1000);
const vkey = (x: number, y: number, z: number) => `${q(x)},${q(y)},${q(z)}`;
const round1 = (n: number) => n.toFixed(1);

type Chain = { path: THREE.Vector3[]; closed: boolean; length: number };

function chainsFromSegments(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Chain[] {
  const nSeg = Math.floor(pos.count / 2);
  const keyOf = new Array<string>(pos.count);
  for (let i = 0; i < pos.count; i++) keyOf[i] = vkey(pos.getX(i), pos.getY(i), pos.getZ(i));
  const adj = new Map<string, number[]>();
  const link = (k: string, s: number) => { const l = adj.get(k); if (l) l.push(s); else adj.set(k, [s]); };
  for (let s = 0; s < nSeg; s++) if (keyOf[2 * s] !== keyOf[2 * s + 1]) { link(keyOf[2 * s], s); link(keyOf[2 * s + 1], s); }
  const visited = new Uint8Array(nSeg);
  const chains: Chain[] = [];
  const vec = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
  for (let start = 0; start < nSeg; start++) {
    if (visited[start] || keyOf[2 * start] === keyOf[2 * start + 1]) continue;
    visited[start] = 1;
    const path = [vec(2 * start), vec(2 * start + 1)];
    let closed = false;
    const walk = (fromKey: string, push: (v: THREE.Vector3) => void) => {
      let curKey = fromKey, curSeg = start;
      for (;;) {
        const list = adj.get(curKey);
        if (!list || list.length !== 2) return;
        const next = list[0] === curSeg ? list[1] : list[0];
        if (next === start) { closed = true; return; }
        if (visited[next]) return;
        visited[next] = 1;
        const a = keyOf[2 * next], b = keyOf[2 * next + 1];
        const forward = a === curKey;
        push(vec(forward ? 2 * next + 1 : 2 * next));
        curKey = forward ? b : a; curSeg = next;
      }
    };
    walk(keyOf[2 * start + 1], (v) => path.push(v));
    if (!closed) walk(keyOf[2 * start], (v) => path.unshift(v));
    let length = 0;
    for (let i = 1; i < path.length; i++) length += path[i].distanceTo(path[i - 1]);
    chains.push({ path, closed, length });
  }
  return chains;
}

function edgeOf(c: Chain, label?: string): Model3DEdge {
  const { path } = c;
  // the point halfway along the chain, a stable name for it
  const half = c.length / 2; let acc = 0; let mid = path[0].clone();
  for (let i = 1; i < path.length; i++) {
    const seg = path[i].distanceTo(path[i - 1]);
    if (acc + seg >= half) { mid = path[i - 1].clone().lerp(path[i], seg > 0 ? (half - acc) / seg : 0); break; }
    acc += seg;
  }
  const a = path[0], b = path[path.length - 1], dir = b.clone().sub(a);
  const straight = !c.closed && dir.lengthSq() > 0 && path.every((p) => p.clone().sub(a).cross(dir).length() / dir.length() < 0.02);
  return {
    key: `e${mid.toArray().map(round1).join(',')}`,
    kind: straight ? 'line' : 'curve', closed: c.closed, length: Math.round(c.length * 100) / 100,
    mid: mid.toArray(), path: path.map((p) => p.toArray()), label,
  };
}

/** Coplanar triangle patches and their boundary loops. */
function planarFaces(geom: THREE.BufferGeometry): Model3DFace[] {
  const pos = geom.getAttribute('position');
  const tri = Math.floor(pos.count / 3);
  if (tri === 0) return [];
  const ids = new Map<string, number>();
  const verts: THREE.Vector3[] = [];
  const idOf = (i: number) => {
    const k = vkey(pos.getX(i), pos.getY(i), pos.getZ(i));
    let id = ids.get(k);
    if (id === undefined) { id = verts.length; ids.set(k, id); verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))); }
    return id;
  };
  const T = new Int32Array(tri * 3);
  const N: THREE.Vector3[] = [];
  const D = new Float64Array(tri);
  const A = new Float64Array(tri);
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let t = 0; t < tri; t++) {
    for (let k = 0; k < 3; k++) T[t * 3 + k] = idOf(t * 3 + k);
    const a = verts[T[t * 3]], b = verts[T[t * 3 + 1]], c = verts[T[t * 3 + 2]];
    ab.subVectors(b, a); ac.subVectors(c, a);
    const n = ab.clone().cross(ac);
    A[t] = n.length() / 2;
    n.normalize();
    N.push(n); D[t] = n.dot(a);
  }
  // union triangles sharing an edge when they are coplanar
  const parent = new Int32Array(tri).map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const edgeTri = new Map<number, number>();
  const nv = verts.length;
  const ekey = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);
  for (let t = 0; t < tri; t++) {
    if (A[t] < 1e-9) continue;
    for (let k = 0; k < 3; k++) {
      const key = ekey(T[t * 3 + k], T[t * 3 + (k + 1) % 3]);
      const o = edgeTri.get(key);
      if (o === undefined) edgeTri.set(key, t);
      else if (N[o].dot(N[t]) > 0.99995 && Math.abs(D[o] - D[t]) < 2e-3) parent[find(o)] = find(t);
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < tri; t++) { if (A[t] < 1e-9) continue; const g = find(t); const l = groups.get(g); if (l) l.push(t); else groups.set(g, [t]); }
  const faces: Model3DFace[] = [];
  for (const members of groups.values()) {
    // boundary edges = those used by exactly one triangle of the patch (directed as that triangle walks them)
    const count = new Map<number, number>();
    for (const t of members) for (let k = 0; k < 3; k++) { const key = ekey(T[t * 3 + k], T[t * 3 + (k + 1) % 3]); count.set(key, (count.get(key) ?? 0) + 1); }
    const next = new Map<number, number[]>();
    for (const t of members) for (let k = 0; k < 3; k++) {
      const a = T[t * 3 + k], b = T[t * 3 + (k + 1) % 3];
      if (count.get(ekey(a, b)) === 1) { const l = next.get(a); if (l) l.push(b); else next.set(a, [b]); }
    }
    const used = new Set<string>();
    const loops: Vec3[][] = [];
    for (const [start, outs] of next) {
      for (const first of outs) {
        if (used.has(`${start}>${first}`)) continue;
        const ring = [start]; let a = start, b = first; let guard = 0;
        while (guard++ < 100000) {
          used.add(`${a}>${b}`);
          if (b === start) break;
          ring.push(b);
          const cand = (next.get(b) ?? []).filter((c) => !used.has(`${b}>${c}`));
          if (cand.length === 0) break;
          a = b; b = cand[0];
        }
        if (ring.length >= 3) loops.push(simplifyRing(ring.map((i) => verts[i])));
      }
    }
    if (loops.length === 0) continue;
    const n = N[members[0]].toArray();
    const area = members.reduce((s, t) => s + A[t], 0);
    const cen = new THREE.Vector3();
    let wsum = 0;
    for (const t of members) { const c = verts[T[t * 3]].clone().add(verts[T[t * 3 + 1]]).add(verts[T[t * 3 + 2]]).multiplyScalar(1 / 3); cen.addScaledVector(c, A[t]); wsum += A[t]; }
    cen.multiplyScalar(1 / (wsum || 1));
    // outer loop first: the one enclosing the most area
    const ringArea = (r: Vec3[]) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], qn = r[(i + 1) % r.length]; s += p[0] * qn[1] - qn[0] * p[1]; s += p[1] * qn[2] - qn[1] * p[2]; s += p[2] * qn[0] - qn[2] * p[0]; } return Math.abs(s); };
    loops.sort((p, r) => ringArea(r) - ringArea(p));
    faces.push({ key: `f${cen.toArray().map(round1).join(',')}|${n.map((v) => v.toFixed(2)).join(',')}`, normal: n, area: Math.round(area * 100) / 100, centroid: cen.toArray(), loops });
  }
  return faces;
}

/** Drop vertices that lie on the straight line between their neighbours. */
function simplifyRing(ring: THREE.Vector3[]): Vec3[] {
  const out: THREE.Vector3[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n], c = ring[i], x = ring[(i + 1) % n];
    const a = c.clone().sub(p), b = x.clone().sub(c);
    if (a.cross(b).length() > 1e-4 * Math.max(1, a.length() * b.length())) out.push(c);
  }
  return (out.length >= 3 ? out : ring).map((v) => v.toArray());
}

export type Reference3D = { points: { name: string; p: Vec3 }[]; lines: { name: string; a: Vec3; b: Vec3 }[] };

export function buildModelGeometry(stl: ArrayBuffer | null, refs?: Reference3D): Model3DGeometry {
  const out: Model3DGeometry = { edges: [], faces: [], vertices: [] };
  const seen = new Set<string>();
  const addVertex = (p: Vec3, label?: string) => {
    const k = `v${vkey(p[0], p[1], p[2])}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.vertices.push({ key: k, p, label });
  };
  if (stl && stl.byteLength > 0) {
    try {
      const geometry = new STLLoader().parse(stl);
      const edgesGeometry = new THREE.EdgesGeometry(geometry, 25);
      const chains = chainsFromSegments(edgesGeometry.getAttribute('position'));
      for (const c of chains) {
        if (c.length < 1e-6) continue;
        out.edges.push(edgeOf(c));
        if (!c.closed) { addVertex(c.path[0].toArray()); addVertex(c.path[c.path.length - 1].toArray()); }
      }
      out.faces = planarFaces(geometry);
      geometry.dispose(); edgesGeometry.dispose();
    } catch { /* an unreadable mesh simply offers no edges */ }
  }
  for (const r of refs?.points ?? []) addVertex(r.p, r.name);
  for (const r of refs?.lines ?? []) {
    const c: Chain = { path: [new THREE.Vector3(...r.a), new THREE.Vector3(...r.b)], closed: false, length: new THREE.Vector3(...r.a).distanceTo(new THREE.Vector3(...r.b)) };
    if (c.length > 1e-6) out.edges.push({ ...edgeOf(c, r.name), key: `r:${r.name}`, kind: 'line' });
  }
  return out;
}

// ---- projection onto a sketch plane ------------------------------------------------------------------

const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The frame's Y axis (normal × X). */
export const frameY = (f: PlaneFrame) => cross3(f.normal, f.xDir);

/** In-plane (u, v) of a model point: along the frame's X and Y axes, in mm. */
export function planeCoords(f: PlaneFrame, p: Vec3): { u: number; v: number } {
  const d = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]];
  return { u: dot3(d, f.xDir), v: dot3(d, frameY(f)) };
}

/** Distance of a model point from the plane, along the normal. */
export const planeDistance = (f: PlaneFrame, p: Vec3) => dot3([p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]], f.normal);

export const frameKey = (f: PlaneFrame) => [...f.origin, ...f.xDir, ...f.normal].map((v) => v.toFixed(3)).join(',');

/** Finds where a stored source now lives in a (possibly changed) model: same key, else the nearest of the same kind. */
export function matchEdge(geom: Model3DGeometry, key: string, mid: Vec3, length: number): Model3DEdge | null {
  const exact = geom.edges.find((e) => e.key === key);
  if (exact) return exact;
  let best: Model3DEdge | null = null, bestScore = Infinity;
  for (const e of geom.edges) {
    const dm = Math.hypot(e.mid[0] - mid[0], e.mid[1] - mid[1], e.mid[2] - mid[2]);
    const score = dm + 0.5 * Math.abs(e.length - length);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best && bestScore <= Math.max(8, length * 0.6) ? best : null;
}
export function matchFace(geom: Model3DGeometry, key: string, centroid: Vec3, normal: Vec3, area: number): Model3DFace | null {
  const exact = geom.faces.find((f) => f.key === key);
  if (exact) return exact;
  let best: Model3DFace | null = null, bestScore = Infinity;
  for (const f of geom.faces) {
    if (dot3(f.normal, normal) < 0.98) continue;
    const dm = Math.hypot(f.centroid[0] - centroid[0], f.centroid[1] - centroid[1], f.centroid[2] - centroid[2]);
    const score = dm + 0.02 * Math.abs(f.area - area);
    if (score < bestScore) { bestScore = score; best = f; }
  }
  return best && bestScore <= Math.max(10, Math.sqrt(area) * 0.8) ? best : null;
}
export function matchVertex(geom: Model3DGeometry, key: string, p: Vec3): Model3DVertex | null {
  const exact = geom.vertices.find((v) => v.key === key);
  if (exact) return exact;
  let best: Model3DVertex | null = null, bestD = Infinity;
  for (const v of geom.vertices) { const d = Math.hypot(v.p[0] - p[0], v.p[1] - p[1], v.p[2] - p[2]); if (d < bestD) { bestD = d; best = v; } }
  return best && bestD <= 10 ? best : null;
}
