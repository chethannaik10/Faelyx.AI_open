// sketchGeometry2d.ts
//
// Pure 2D construction math for the Sketcher tools added from the CATIA
// "Drawing Sketches in the Sketcher Workbench-I" guide (see
// docs/reference/changes/2026-09-28-drawing-2d.md): bi-tangent and
// bisecting lines, tri-tangent circles that include circles/arcs,
// intersection points, and the hit tests behind the Select toolbar's
// trap variants. Kept out of SketchWorkspace.tsx so none of it needs
// component state — every input is plain coordinates.

export type XY = { x: number; y: number };
export type TangentTarget =
  | { kind: 'line'; a: XY; b: XY }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  // Any other curve (ellipse, conic, spline…) as its sampled polyline.
  | { kind: 'poly'; pts: XY[] };

const sub = (p: XY, q: XY): XY => ({ x: p.x - q.x, y: p.y - q.y });
const dot = (p: XY, q: XY) => p.x * q.x + p.y * q.y;
const len = (p: XY) => Math.hypot(p.x, p.y);
const unit = (p: XY): XY => { const l = len(p) || 1; return { x: p.x / l, y: p.y / l }; };

// Bi-Tangent Line: every common tangent of two circles (external and
// internal), picked as the one whose two touch points land closest to
// where each circle was clicked — CATIA's "tangents are created as close
// as possible to where you clicked." Each tangent line is n·p = d with
// n·c_i - d = s_i·r_i, which gives n·(c2 - c1) = s2·r2 - s1·r1.
export function biTangentLine(c1: XY & { r: number }, c2: XY & { r: number }, q1: XY, q2: XY): { t1: XY; t2: XY } | null {
  const D = sub(c2, c1);
  const L = len(D);
  if (L < 1e-9) return null;
  const phi = Math.atan2(D.y, D.x);
  let best: { t1: XY; t2: XY; score: number } | null = null;
  for (const [s1, s2] of [[1, 1], [1, -1]] as const) {
    const k = s2 * c2.r - s1 * c1.r;
    if (Math.abs(k) > L) continue; // one circle inside the other — no such tangent
    const spread = Math.acos(Math.max(-1, Math.min(1, k / L)));
    for (const theta of [phi + spread, phi - spread]) {
      const n = { x: Math.cos(theta), y: Math.sin(theta) };
      const t1 = { x: c1.x - s1 * c1.r * n.x, y: c1.y - s1 * c1.r * n.y };
      const t2 = { x: c2.x - s2 * c2.r * n.x, y: c2.y - s2 * c2.r * n.y };
      if (len(sub(t1, t2)) < 1e-6) continue;
      const score = len(sub(t1, q1)) + len(sub(t2, q2));
      if (!best || score < best.score) best = { t1, t2, score };
    }
  }
  return best ? { t1: best.t1, t2: best.t2 } : null;
}

// Unit tangent direction at each vertex of a sampled curve.
function vertexTangents(pts: XY[]): XY[] {
  return pts.map((_, i) => unit(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])));
}

// Bi-Tangent Line for any two sampled curves (ellipses, conics, splines,
// or circles sampled): the chord a→b whose direction matches the curve's
// tangent at both a and b, preferring the one nearest the two clicks.
// Accurate to the sampling density of the curves.
export function biTangentSampled(A: XY[], B: XY[], q1: XY, q2: XY): { t1: XY; t2: XY } | null {
  if (A.length < 2 || B.length < 2) return null;
  const tA = vertexTangents(A), tB = vertexTangents(B);
  const all = [...A, ...B];
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const scale = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const cross = (p: XY, q: XY) => p.x * q.y - p.y * q.x;
  let best: { i: number; j: number; score: number; f: number } | null = null;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      const d = sub(B[j], A[i]);
      const L = len(d);
      if (L < 1e-6) continue;
      const u = { x: d.x / L, y: d.y / L };
      const f = cross(tA[i], u) ** 2 + cross(tB[j], u) ** 2;
      if (f > 4e-3) continue;
      const score = f * 50 + (len(sub(A[i], q1)) + len(sub(B[j], q2))) / scale;
      if (!best || score < best.score) best = { i, j, score, f };
    }
  }
  return best ? { t1: A[best.i], t2: B[best.j] } : null;
}

// Shortest distance from p to a polyline.
export function distanceToPolyline(p: XY, pts: XY[]): number {
  if (pts.length === 1) return len(sub(p, pts[0]));
  let bestD = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = sub(b, a);
    const l2 = dot(d, d);
    const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), d) / l2));
    bestD = Math.min(bestD, Math.hypot(p.x - (a.x + d.x * t), p.y - (a.y + d.y * t)));
  }
  return bestD;
}

// Bisecting Line: the line through two lines' intersection that splits
// the angle on the side each line was clicked. Parallel lines get the
// midway line instead. Returns a point on it plus a unit direction.
export function bisectingLine(a1: XY, b1: XY, a2: XY, b2: XY, q1: XY, q2: XY): { p: XY; dir: XY } | null {
  let u1 = unit(sub(b1, a1));
  let u2 = unit(sub(b2, a2));
  const denom = u1.x * u2.y - u1.y * u2.x;
  if (Math.abs(denom) < 1e-9) {
    // Parallel: midway between them, same direction.
    const foot = a2.x === b2.x && a2.y === b2.y ? a2 : projectOntoLine(a1, a2, b2);
    return { p: { x: (a1.x + foot.x) / 2, y: (a1.y + foot.y) / 2 }, dir: u1 };
  }
  const t = ((a2.x - a1.x) * u2.y - (a2.y - a1.y) * u2.x) / denom;
  const X = { x: a1.x + u1.x * t, y: a1.y + u1.y * t };
  if (dot(sub(q1, X), u1) < 0) u1 = { x: -u1.x, y: -u1.y };
  if (dot(sub(q2, X), u2) < 0) u2 = { x: -u2.x, y: -u2.y };
  let dir = { x: u1.x + u2.x, y: u1.y + u2.y };
  if (len(dir) < 1e-9) dir = { x: -u1.y, y: u1.x };
  return { p: X, dir: unit(dir) };
}

export function projectOntoLine(p: XY, a: XY, b: XY): XY {
  const d = sub(b, a);
  const l2 = dot(d, d) || 1;
  const t = dot(sub(p, a), d) / l2;
  return { x: a.x + d.x * t, y: a.y + d.y * t };
}

// Intersection Point: every crossing between two lines (treated as
// infinite, as CATIA does), a line and a circle, or two circles.
export function intersectTargets(g1: TangentTarget, g2: TangentTarget): XY[] {
  if (g1.kind === 'line' && g2.kind === 'line') {
    const d1 = sub(g1.b, g1.a), d2 = sub(g2.b, g2.a);
    const denom = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(denom) < 1e-9) return [];
    const t = ((g2.a.x - g1.a.x) * d2.y - (g2.a.y - g1.a.y) * d2.x) / denom;
    return [{ x: g1.a.x + d1.x * t, y: g1.a.y + d1.y * t }];
  }
  if (g1.kind === 'poly' || g2.kind === 'poly') return intersectSampled(g1, g2);
  if (g1.kind === 'circle' && g2.kind === 'line') return intersectTargets(g2, g1);
  if (g1.kind === 'line' && g2.kind === 'circle') {
    const foot = projectOntoLine({ x: g2.cx, y: g2.cy }, g1.a, g1.b);
    const h = Math.hypot(foot.x - g2.cx, foot.y - g2.cy);
    if (h > g2.r + 1e-9) return [];
    const u = unit(sub(g1.b, g1.a));
    const half = Math.sqrt(Math.max(0, g2.r * g2.r - h * h));
    if (half < 1e-9) return [foot];
    return [{ x: foot.x + u.x * half, y: foot.y + u.y * half }, { x: foot.x - u.x * half, y: foot.y - u.y * half }];
  }
  if (g1.kind === 'circle' && g2.kind === 'circle') {
    const d = Math.hypot(g2.cx - g1.cx, g2.cy - g1.cy);
    if (d < 1e-9 || d > g1.r + g2.r + 1e-9 || d < Math.abs(g1.r - g2.r) - 1e-9) return [];
    const a = (g1.r * g1.r - g2.r * g2.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, g1.r * g1.r - a * a));
    const ux = (g2.cx - g1.cx) / d, uy = (g2.cy - g1.cy) / d;
    const mx = g1.cx + ux * a, my = g1.cy + uy * a;
    if (h < 1e-9) return [{ x: mx, y: my }];
    return [{ x: mx - uy * h, y: my + ux * h }, { x: mx + uy * h, y: my - ux * h }];
  }
  return [];
}

// Crossings involving a sampled curve: segment-by-segment intersections
// against the other element (a line is extended well past its ends).
function intersectSampled(g1: TangentTarget, g2: TangentTarget): XY[] {
  const asPoly = (g: TangentTarget): XY[] => {
    if (g.kind === 'poly') return g.pts;
    if (g.kind === 'circle') return sampleArc(g.cx, g.cy, g.r, 0, 360, 180);
    const u = unit(sub(g.b, g.a));
    return [{ x: g.a.x - u.x * 1e4, y: g.a.y - u.y * 1e4 }, { x: g.b.x + u.x * 1e4, y: g.b.y + u.y * 1e4 }];
  };
  const A = asPoly(g1), B = asPoly(g2);
  const outPts: XY[] = [];
  for (let i = 1; i < A.length; i++) {
    for (let j = 1; j < B.length; j++) {
      const p = A[i - 1], r = sub(A[i], p), q = B[j - 1], sv = sub(B[j], q);
      const den = r.x * sv.y - r.y * sv.x;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((q.x - p.x) * sv.y - (q.y - p.y) * sv.x) / den;
      const u = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const x = { x: p.x + r.x * t, y: p.y + r.y * t };
      if (!outPts.some((o) => len(sub(o, x)) < 1e-6)) outPts.push(x);
    }
  }
  return outPts;
}

// Tri-Tangent Circle for any mix of lines and circles/arcs: Gauss-Newton
// on (cx, cy, r), seeded from the incircle of the three click points so
// the result lands near where each element was clicked. Which side of
// each line, and inside/outside each circle, is fixed from that seed.
export function triTangentGeneral(targets: [TangentTarget, TangentTarget, TangentTarget], clicks: [XY, XY, XY]): { x: number; y: number; r: number } | null {
  const [A, B, C] = clicks;
  const la = len(sub(B, C)), lb = len(sub(A, C)), lc = len(sub(A, B));
  const per = la + lb + lc;
  let s: [number, number, number] = per > 1e-6
    ? [(la * A.x + lb * B.x + lc * C.x) / per, (la * A.y + lb * B.y + lc * C.y) / per, 0]
    : [A.x, A.y, 0];
  const seed = { x: s[0], y: s[1] };
  const signedLineDist = (t: { a: XY; b: XY }, p: XY) => {
    const n = unit({ x: -(t.b.y - t.a.y), y: t.b.x - t.a.x });
    return dot(sub(p, t.a), n);
  };
  const sides = targets.map((t) => (t.kind === 'line'
    ? (signedLineDist(t, seed) >= 0 ? 1 : -1)
    : t.kind === 'circle' ? (Math.hypot(seed.x - t.cx, seed.y - t.cy) >= t.r ? 1 : -1) : 1));
  const seedR = targets.reduce((acc, t) => acc + (t.kind === 'line'
    ? Math.abs(signedLineDist(t, seed))
    : t.kind === 'circle' ? Math.abs(Math.hypot(seed.x - t.cx, seed.y - t.cy) - t.r) : distanceToPolyline(seed, t.pts)), 0) / 3;
  s = [s[0], s[1], Math.max(0.5, seedR)];
  const residuals = (v: [number, number, number]) => targets.map((t, i) => {
    const p = { x: v[0], y: v[1] };
    if (t.kind === 'line') return sides[i] * signedLineDist(t, p) - v[2];
    // A sampled curve: the circle just touches it (from either side).
    if (t.kind === 'poly') return distanceToPolyline(p, t.pts) - v[2];
    const d = Math.hypot(p.x - t.cx, p.y - t.cy);
    return sides[i] > 0 ? d - (t.r + v[2]) : (t.r - v[2]) - d;
  });
  for (let iter = 0; iter < 60; iter++) {
    const f = residuals(s);
    if (Math.max(...f.map(Math.abs)) < 1e-7) break;
    const J: number[][] = [];
    for (let j = 0; j < 3; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(s[j]));
      const sp = [...s] as [number, number, number]; sp[j] += h;
      const fp = residuals(sp);
      for (let i = 0; i < 3; i++) { J[i] = J[i] ?? []; J[i][j] = (fp[i] - f[i]) / h; }
    }
    const step = solve3(J, f.map((v) => -v));
    if (!step) return null;
    s = [s[0] + step[0], s[1] + step[1], s[2] + step[2]];
  }
  const f = residuals(s);
  if (!(s[2] > 1e-6) || Math.max(...f.map(Math.abs)) > 1e-4) return null;
  return { x: s[0], y: s[1], r: s[2] };
}

function solve3(M: number[][], b: number[]): number[] | null {
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(M);
  if (Math.abs(d) < 1e-12) return null;
  return [0, 1, 2].map((col) => det(M.map((row, i) => row.map((v, j) => (j === col ? b[i] : v)))) / d);
}

// --- Select toolbar traps -------------------------------------------------
// Each entity is handed in as a sampled polyline (a point is a single
// sample). "Inside" means every sample is inside; "touches" means any
// sample is inside or any segment crosses the region's boundary.
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

export function segmentsCross(p1: XY, p2: XY, q1: XY, q2: XY): boolean {
  const o = (a: XY, b: XY, c: XY) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = o(q1, q2, p1), d2 = o(q1, q2, p2), d3 = o(p1, p2, q1), d4 = o(p1, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

export function pointInPoly(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

const rectPoly = (r: Rect): XY[] => [{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY }];

const polylineCrossesPolygon = (pts: XY[], poly: XY[]) => {
  for (let i = 1; i < pts.length; i++) {
    for (let j = 0; j < poly.length; j++) {
      if (segmentsCross(pts[i - 1], pts[i], poly[j], poly[(j + 1) % poly.length])) return true;
    }
  }
  return false;
};

export const samplesInsidePolygon = (pts: XY[], poly: XY[]) => pts.length > 0 && pts.every((p) => pointInPoly(p, poly));
export const samplesTouchPolygon = (pts: XY[], poly: XY[]) => pts.some((p) => pointInPoly(p, poly)) || polylineCrossesPolygon(pts, poly);
export const samplesInsideRect = (pts: XY[], r: Rect) => pts.length > 0 && pts.every((p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY);
export const samplesTouchRect = (pts: XY[], r: Rect) => pts.some((p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY) || polylineCrossesPolygon(pts, rectPoly(r));

// Paint Stroke: any entity segment crossing the stroke, or any sample
// within `tol` of it (so a stroke brushing over a lone point still counts).
export function samplesTouchStroke(pts: XY[], stroke: XY[], tol: number): boolean {
  for (let i = 1; i < pts.length; i++) {
    for (let j = 1; j < stroke.length; j++) if (segmentsCross(pts[i - 1], pts[i], stroke[j - 1], stroke[j])) return true;
  }
  return pts.some((p) => stroke.some((s, j) => {
    if (j === 0) return Math.hypot(p.x - s.x, p.y - s.y) < tol;
    const a = stroke[j - 1];
    const f = projectOntoLine(p, a, s);
    const t = dot(sub(f, a), sub(s, a)) / (dot(sub(s, a), sub(s, a)) || 1);
    const q = t < 0 ? a : t > 1 ? s : f;
    return Math.hypot(p.x - q.x, p.y - q.y) < tol;
  }));
}

// Samples a straight segment densely enough that "touches the box" works
// even when neither endpoint is inside it.
export function sampleSegment(a: XY, b: XY, n = 24): XY[] {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

// Samples a circle/arc sweep (degrees, same increasing-angle convention as
// describeArcPath) as a polyline.
export function sampleArc(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number, n = 48): XY[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((startDeg + (sweepDeg * i) / n) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}
