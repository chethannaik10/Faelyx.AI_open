// Sketch: "snap to any curve". Pure geometry (no React, no state) behind the cursor snapping onto circles, arcs, ellipses, splines, conics
// and the crossing points between them. The sketch hooks (handlers/snapAndSelect.tsx) turn their entities into SnapTargets and ask
// findCurveSnap what is under the cursor:
//   · intersection — where two visible entities cross (line × circle, arc × spline, …)
//   · quadrant     — the 0° / 90° / 180° / 270° points of a circle or arc
//   · curve        — the nearest point ON the curve itself, anywhere along it (the circumference of a circle, the length of an arc/spline)
// Only entities that pass within `tol` of the cursor are looked at, and intersections are only searched between those, so this stays
// cheap enough to run on every mouse move.
import { angleInSweep, angleOfPts, pointToSegmentDistance } from './geometry';

export type XY = { x: number; y: number };
/** `role`/`label` say what a target is when it is not ordinary sketch geometry: a sketch axis, or something from a reference plane / reference line. */
export type SnapMeta = { role?: 'axis' | 'reference'; label?: string };
export type SnapTarget = SnapMeta & (
  | { kind: 'circle'; id: string; cx: number; cy: number; r: number }
  | { kind: 'arc'; id: string; cx: number; cy: number; r: number; start: number; end: number }
  /** a sampled curve (ellipse, spline, conic …); `snapOn: false` = only used for crossings, not for "anywhere along it" */
  | { kind: 'poly'; id: string; pts: XY[]; snapOn?: boolean }
  /** a straight line segment; used for crossings, and for "anywhere along it" only when `snapOn` (a line's own edge/midpoint snaps live elsewhere) */
  | { kind: 'seg'; id: string; a: XY; b: XY; snapOn?: boolean }
);

export type CurveSnapKind = 'intersection' | 'quadrant' | 'curve';
export type CurveSnap = { x: number; y: number; kind: CurveSnapKind; /** the entities involved */ ids: string[]; d: number; /** role / label of the first entity involved */ role?: 'axis' | 'reference'; label?: string };
export type CurveSnapOptions = { intersections?: boolean; quadrants?: boolean; curves?: boolean };

const EPS = 1e-9;
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

/** Nearest point on a segment (clamped to its span). */
export function footOnSegment(a: XY, b: XY, p: XY): XY {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (l2 < EPS) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Nearest point on a full circle (null only for the centre itself, where every point is equally near). */
export function footOnCircle(cx: number, cy: number, r: number, p: XY): XY | null {
  const d = Math.hypot(p.x - cx, p.y - cy);
  if (d < EPS) return null;
  return { x: cx + ((p.x - cx) / d) * r, y: cy + ((p.y - cy) / d) * r };
}

const arcEnds = (t: { cx: number; cy: number; r: number; start: number; end: number }): XY[] => [t.start, t.end].map((deg) => {
  const rad = (deg * Math.PI) / 180;
  return { x: t.cx + t.r * Math.cos(rad), y: t.cy + t.r * Math.sin(rad) };
});

/** Nearest point of one target to p, or null when it has none (a degenerate shape). Arcs only count inside their sweep, otherwise the nearer end. */
export function nearestOnTarget(t: SnapTarget, p: XY): XY | null {
  if (t.kind === 'seg') return footOnSegment(t.a, t.b, p);
  if (t.kind === 'circle') return footOnCircle(t.cx, t.cy, t.r, p);
  if (t.kind === 'arc') {
    const f = footOnCircle(t.cx, t.cy, t.r, p);
    if (f && angleInSweep(angleOfPts({ x: t.cx, y: t.cy }, f), t.start, t.end)) return f;
    const ends = arcEnds(t);
    return dist(ends[0], p) <= dist(ends[1], p) ? ends[0] : ends[1];
  }
  let best: XY | null = null, bestD = Infinity;
  if (t.pts.length === 1) return { x: t.pts[0].x, y: t.pts[0].y };
  for (let i = 0; i + 1 < t.pts.length; i++) {
    const f = footOnSegment(t.pts[i], t.pts[i + 1], p);
    const d = dist(f, p);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

/** The 0° / 90° / 180° / 270° points of a circle or arc (arcs: only those inside the sweep). */
export function quadrantPoints(t: SnapTarget): XY[] {
  if (t.kind !== 'circle' && t.kind !== 'arc') return [];
  const out: XY[] = [];
  for (const deg of [0, 90, 180, 270]) {
    if (t.kind === 'arc' && !angleInSweep(deg, t.start, t.end)) continue;
    const rad = (deg * Math.PI) / 180;
    out.push({ x: t.cx + t.r * Math.cos(rad), y: t.cy + t.r * Math.sin(rad) });
  }
  return out;
}

// ---- crossings ------------------------------------------------------------------------------------------------------------------
type Prim = { segs: [XY, XY][]; circ: { cx: number; cy: number; r: number; arc: { start: number; end: number } | null } | null };

/** The pieces of a target that can cross something near `win` (a box around the cursor): all of a circle, only nearby segments of a curve. */
function primitives(t: SnapTarget, win: { x0: number; y0: number; x1: number; y1: number }): Prim {
  if (t.kind === 'circle') return { segs: [], circ: { cx: t.cx, cy: t.cy, r: t.r, arc: null } };
  if (t.kind === 'arc') return { segs: [], circ: { cx: t.cx, cy: t.cy, r: t.r, arc: { start: t.start, end: t.end } } };
  const raw: [XY, XY][] = t.kind === 'seg' ? [[t.a, t.b]] : t.pts.slice(0, -1).map((p, i) => [p, t.pts[i + 1]] as [XY, XY]);
  const segs = raw.filter(([a, b]) => Math.max(a.x, b.x) >= win.x0 && Math.min(a.x, b.x) <= win.x1 && Math.max(a.y, b.y) >= win.y0 && Math.min(a.y, b.y) <= win.y1);
  return { segs, circ: null };
}

function segSeg(a: [XY, XY], b: [XY, XY]): XY | null {
  const r = { x: a[1].x - a[0].x, y: a[1].y - a[0].y }, s = { x: b[1].x - b[0].x, y: b[1].y - b[0].y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < EPS) return null;                                   // parallel — no single crossing
  const qp = { x: b[0].x - a[0].x, y: b[0].y - a[0].y };
  const t = (qp.x * s.y - qp.y * s.x) / den, u = (qp.x * r.y - qp.y * r.x) / den;
  const slack = 1e-9;
  if (t < -slack || t > 1 + slack || u < -slack || u > 1 + slack) return null;
  return { x: a[0].x + t * r.x, y: a[0].y + t * r.y };
}

const onArcSweep = (c: Prim['circ'] & object, p: XY) => !c.arc || angleInSweep(angleOfPts({ x: c.cx, y: c.cy }, p), c.arc.start, c.arc.end);

function segCircle(s: [XY, XY], c: NonNullable<Prim['circ']>): XY[] {
  const dx = s[1].x - s[0].x, dy = s[1].y - s[0].y, fx = s[0].x - c.cx, fy = s[0].y - c.cy;
  const A = dx * dx + dy * dy;
  if (A < EPS) return [];
  const B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc), out: XY[] = [];
  for (const t of disc < EPS ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const p = { x: s[0].x + t * dx, y: s[0].y + t * dy };
    if (onArcSweep(c, p)) out.push(p);
  }
  return out;
}

function circleCircle(a: NonNullable<Prim['circ']>, b: NonNullable<Prim['circ']>): XY[] {
  const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy);
  if (d < EPS || d > a.r + b.r + 1e-9 || d < Math.abs(a.r - b.r) - 1e-9) return [];   // concentric, apart, or one inside the other
  const l = (a.r * a.r - b.r * b.r + d * d) / (2 * d), h2 = a.r * a.r - l * l;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const mx = a.cx + (l * dx) / d, my = a.cy + (l * dy) / d;
  const cand: XY[] = h < 1e-9 ? [{ x: mx, y: my }] : [{ x: mx - (h * dy) / d, y: my + (h * dx) / d }, { x: mx + (h * dy) / d, y: my - (h * dx) / d }];
  return cand.filter((p) => onArcSweep(a, p) && onArcSweep(b, p));
}

/** Every crossing of two targets that lies inside `win`. */
export function crossings(a: SnapTarget, b: SnapTarget, win: { x0: number; y0: number; x1: number; y1: number }): XY[] {
  const pa = primitives(a, win), pb = primitives(b, win), out: XY[] = [];
  for (const sa of pa.segs) for (const sb of pb.segs) { const p = segSeg(sa, sb); if (p) out.push(p); }
  if (pa.circ) for (const sb of pb.segs) out.push(...segCircle(sb, pa.circ));
  if (pb.circ) for (const sa of pa.segs) out.push(...segCircle(sa, pb.circ));
  if (pa.circ && pb.circ) out.push(...circleCircle(pa.circ, pb.circ));
  return out.filter((p) => p.x >= win.x0 && p.x <= win.x1 && p.y >= win.y0 && p.y <= win.y1);
}

// ---- the lookup -----------------------------------------------------------------------------------------------------------------
/** Distance from p to the target (for deciding which targets are "under the cursor"). */
function distanceTo(t: SnapTarget, p: XY): number {
  if (t.kind === 'seg') return pointToSegmentDistance(p.x, p.y, t.a, t.b);
  const f = nearestOnTarget(t, p);
  return f ? dist(f, p) : Infinity;
}

/**
 * What the cursor at (x, y) should snap to among `targets`, within `tol` (sketch units). Crossings beat quadrant points, which beat "anywhere
 * on the curve". Returns null when nothing is within reach. Targets that are hidden or being drawn right now should not be passed in.
 */
export function findCurveSnap(targets: SnapTarget[], x: number, y: number, tol: number, opts: CurveSnapOptions = {}): CurveSnap | null {
  const { intersections = true, quadrants = true, curves = true } = opts;
  const p = { x, y };
  const near = targets.filter((t) => distanceTo(t, p) <= tol);
  if (!near.length) return null;

  if (intersections && near.length > 1) {
    const win = { x0: x - tol, y0: y - tol, x1: x + tol, y1: y + tol };
    let best: CurveSnap | null = null;
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      for (const q of crossings(near[i], near[j], win)) {
        const d = dist(q, p);
        if (d <= tol && (!best || d < best.d)) best = { x: q.x, y: q.y, kind: 'intersection', ids: [near[i].id, near[j].id], d, role: near[i].role ?? near[j].role, label: near[i].label ?? near[j].label };
      }
    }
    if (best) return best;
  }

  if (quadrants) {
    let best: CurveSnap | null = null;
    for (const t of near) for (const q of quadrantPoints(t)) {
      const d = dist(q, p);
      if (d <= tol && (!best || d < best.d)) best = { x: q.x, y: q.y, kind: 'quadrant', ids: [t.id], d, role: t.role, label: t.label };
    }
    if (best) return best;
  }

  if (curves) {
    let best: CurveSnap | null = null;
    for (const t of near) {
      if ((t.kind === 'seg' && !t.snapOn) || (t.kind === 'poly' && t.snapOn === false)) continue;
      const f = nearestOnTarget(t, p);
      if (!f) continue;
      const d = dist(f, p);
      if (d <= tol && (!best || d < best.d)) best = { x: f.x, y: f.y, kind: 'curve', ids: [t.id], d, role: t.role, label: t.label };
    }
    if (best) return best;
  }
  return null;
}

/**
 * The drawing tools whose clicks PLACE geometry — for these the cursor is pulled onto a curve / crossing / quadrant before the tool sees it (the
 * Line and Point tools do the same inside resolveDrawPoint, in their own priority order, so they are not listed). Picking tools (select, trim,
 * fillet, mirror …) are left alone: they need the real cursor position.
 */
export const CURVE_MAGNET_TOOLS: ReadonlySet<string> = new Set([
  'circle', 'rectangle', 'arc', 'hexagon', 'circle-2pt', 'polygon-n', 'axis-construction', 'line-infinite', 'profile', 'spline', 'spline-cv',
  'rect-oriented', 'rect-parallelogram', 'rect-centered', 'rect-center3', 'rect-parallelogram-center', 'slot', 'slot-cyl', 'slot-arc', 'keyhole',
  'circle-3pt', 'ellipse', 'ellipse-arc', 'parabola', 'hyperbola', 'conic', 'conic-rp', 'arc-3pt', 'arc-3pt-limits',
]);

// ---- reference geometry ---------------------------------------------------------------------------------------------------------
export type Vec3 = number[];
/** A sketch plane: origin, X direction and normal (Y = normal × X) — same as modelGeometry.ts's PlaneFrame. */
export type Frame3 = { origin: Vec3; xDir: Vec3; normal: Vec3 };
export type RefPoint = { x: number; y: number; label: string };
export type RefSeg = { a: XY; b: XY; label: string };

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * 3D Reference Points / Lines / Axes as they lie on the sketch plane that is open: a point is projected onto the plane, a line becomes its
 * projected segment, and where a line pierces the plane that spot is offered as a point too (a line square to the plane projects to just that
 * point). `origin` is the sketch origin on the canvas (u runs right, v runs up, so the canvas y is origin.y - v).
 */
export function referenceOnPlane(
  refs: { points: { name: string; p: Vec3 }[]; lines: { name: string; a: Vec3; b: Vec3 }[] }, frame: Frame3, origin: XY,
): { points: RefPoint[]; segs: RefSeg[] } {
  const yDir = cross3(frame.normal, frame.xDir);
  const toCanvas = (p: Vec3): XY => {
    const d = [p[0] - frame.origin[0], p[1] - frame.origin[1], p[2] - frame.origin[2]];
    return { x: origin.x + dot3(d, frame.xDir), y: origin.y - dot3(d, yDir) };
  };
  const dist = (p: Vec3) => dot3([p[0] - frame.origin[0], p[1] - frame.origin[1], p[2] - frame.origin[2]], frame.normal);
  const points: RefPoint[] = [], segs: RefSeg[] = [];
  for (const r of refs.points) { const c = toCanvas(r.p); points.push({ ...c, label: r.name }); }
  for (const l of refs.lines) {
    const a = toCanvas(l.a), b = toCanvas(l.b);
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-6) segs.push({ a, b, label: l.name });
    else points.push({ ...a, label: l.name });
    const da = dist(l.a), db = dist(l.b);
    if (Math.abs(da - db) > 1e-9 && da * db <= 0) {
      const t = da / (da - db);
      const q = toCanvas([l.a[0] + t * (l.b[0] - l.a[0]), l.a[1] + t * (l.b[1] - l.a[1]), l.a[2] + t * (l.b[2] - l.a[2])]);
      points.push({ ...q, label: `${l.name} · plane crossing` });
    }
  }
  return { points, segs };
}

/** The nearest of `pts` within `tol` of (x, y), or null. */
export function nearestRefPoint(pts: RefPoint[], x: number, y: number, tol: number): RefPoint | null {
  let best: RefPoint | null = null, bestD = tol;
  for (const p of pts) { const d = Math.hypot(p.x - x, p.y - y); if (d <= bestD) { bestD = d; best = p; } }
  return best;
}

/** The two sketch axes through the origin as long snap targets (a sketch axis has no end; 1e5 sketch units is far beyond any view). */
export function axisTargets(origin: XY, idH: string, idV: string): SnapTarget[] {
  const R = 1e5;
  return [
    { kind: 'seg', id: idH, a: { x: origin.x - R, y: origin.y }, b: { x: origin.x + R, y: origin.y }, snapOn: true, role: 'axis', label: 'axis' },
    { kind: 'seg', id: idV, a: { x: origin.x, y: origin.y - R }, b: { x: origin.x, y: origin.y + R }, snapOn: true, role: 'axis', label: 'axis' },
  ];
}

/** The pieces of a sketch of another plane (shown here as a "reflected" reference) as snap targets and vertex points. Hidden and styled lines are skipped, as they are not drawn. */
export function reflectedSketchTargets(
  r: { id: string; name: string; label: string; data: { points: { id: string; x: number; y: number }[]; lines: { id: string; p1: string; p2: string; style?: string }[];
    circles: { id: string; center: string; r: number }[]; arcs?: { id: string; center: string; r: number; start: number; end: number }[]; hidden?: string[] } },
): { targets: SnapTarget[]; points: RefPoint[] } {
  const byId = new Map(r.data.points.map((p) => [p.id, p] as const));
  const hid = new Set(r.data.hidden ?? []);
  const tag = `${r.name} · ${r.label}`;
  const targets: SnapTarget[] = [], points: RefPoint[] = [];
  for (const l of r.data.lines) {
    if (hid.has(l.id) || l.style) continue;
    const a = byId.get(l.p1), b = byId.get(l.p2);
    if (!a || !b) continue;
    targets.push({ kind: 'seg', id: `${r.id}:${l.id}`, a, b, snapOn: true, role: 'reference', label: tag });
    points.push({ x: a.x, y: a.y, label: tag }, { x: b.x, y: b.y, label: tag });
  }
  for (const c of r.data.circles) {
    const ctr = byId.get(c.center);
    if (hid.has(c.id) || !ctr) continue;
    targets.push({ kind: 'circle', id: `${r.id}:${c.id}`, cx: ctr.x, cy: ctr.y, r: c.r, role: 'reference', label: tag });
    points.push({ x: ctr.x, y: ctr.y, label: tag });
  }
  for (const a of r.data.arcs ?? []) {
    const ctr = byId.get(a.center);
    if (hid.has(a.id) || !ctr) continue;
    targets.push({ kind: 'arc', id: `${r.id}:${a.id}`, cx: ctr.x, cy: ctr.y, r: a.r, start: a.start, end: a.end, role: 'reference', label: tag });
    points.push({ x: ctr.x, y: ctr.y, label: tag }, ...arcEnds({ cx: ctr.x, cy: ctr.y, r: a.r, start: a.start, end: a.end }).map((e) => ({ x: e.x, y: e.y, label: tag })));
  }
  return { targets, points };
}
