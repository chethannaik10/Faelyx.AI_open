// Plain 2D geometry used by the sketch tools (distances, intersections,
// fillets, tri-tangent circles…) plus the "Load example" sketch.
import type { Pt, Ln, Circ, Constraint} from './types';

// ---------------------------------------------------------------------
// Example sketch — the same rectangle-with-two-holes sketch_solver.py's
// own __main__ block solves, so "Load example" is a one-click smoke
// test that the backend wiring actually works.
// ---------------------------------------------------------------------
export function buildExample() {
  const points: Pt[] = [
    { id: 'p1', x: 40, y: 40 }, { id: 'p2', x: 135, y: 43 },
    { id: 'p3', x: 138, y: 117 }, { id: 'p4', x: 42, y: 122 },
    { id: 'h1_ctr', x: 65, y: 60 }, { id: 'h2_ctr', x: 115, y: 60 },
  ];
  const lines: Ln[] = [
    { id: 'bottom', p1: 'p1', p2: 'p2' }, { id: 'right', p1: 'p2', p2: 'p3' },
    { id: 'top', p1: 'p3', p2: 'p4' }, { id: 'left', p1: 'p4', p2: 'p1' },
  ];
  const circles: Circ[] = [
    { id: 'hole1', center: 'h1_ctr', r: 4 }, { id: 'hole2', center: 'h2_ctr', r: 4 },
  ];
  const constraints: Constraint[] = [
    { id: 'c1', type: 'fixed', args: { point: 'p1', x: 40, y: 40 }, label: 'Fixed: p1' },
    { id: 'c2', type: 'horizontal', args: { line: 'bottom' }, label: 'Horizontal: bottom' },
    { id: 'c3', type: 'horizontal', args: { line: 'top' }, label: 'Horizontal: top' },
    { id: 'c4', type: 'vertical', args: { line: 'left' }, label: 'Vertical: left' },
    { id: 'c5', type: 'vertical', args: { line: 'right' }, label: 'Vertical: right' },
    { id: 'c6', type: 'distance', args: { p1: 'p1', p2: 'p2', value: 100 }, label: 'Distance: p1–p2 = 100mm' },
    { id: 'c7', type: 'distance', args: { p1: 'p1', p2: 'p4', value: 80 }, label: 'Distance: p1–p4 = 80mm' },
    { id: 'c8', type: 'distance', args: { p1: 'p1', p2: 'h1_ctr', value: 32 }, label: 'Distance: p1–h1_ctr = 32mm' },
    { id: 'c9', type: 'radius', args: { circle: 'hole1', value: 5 }, label: 'Radius: hole1 = 5mm' },
    { id: 'c10', type: 'distance', args: { p1: 'p2', p2: 'h2_ctr', value: 32 }, label: 'Distance: p2–h2_ctr = 32mm' },
    { id: 'c11', type: 'radius', args: { circle: 'hole2', value: 5 }, label: 'Radius: hole2 = 5mm' },
  ];
  return { points, lines, circles, constraints };
}

export function pointToSegmentDistance(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// Where along a→b (0..1, clamped) the closest point to p falls — used to
// find which sub-segment a Trim click landed in.
export function segParam(a: Pt, b: Pt, p: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
}

// Real line/line and line/circle intersection math for the Trim tool —
// the same kind of geometry CATIA's own Trim relies on, just scoped here
// to "cut a line back to its nearest crossings". Each returns the
// intersection's t-parameter(s) along segment a→b, clamped to [0,1] (i.e.
// only intersections that actually fall on both finite segments/on the
// line's own extent, not their infinite extensions).
export function lineLineParam(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null; // parallel (or coincident) — no single cut point
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return Math.max(0, Math.min(1, t));
}

export function lineCircleParams(a: Pt, b: Pt, center: { x: number; y: number }, r: number): number[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fx = a.x - center.x, fy = a.y - center.y;
  const A = dx * dx + dy * dy;
  if (A < 1e-9) return [];
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  const out: number[] = [];
  for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
    if (t >= -1e-6 && t <= 1 + 1e-6) out.push(Math.max(0, Math.min(1, t)));
  }
  return out;
}

// Angle from `center` to `pt`, in degrees, 0-360 — same atan2 convention
// as lineAngleDeg below (increasing clockwise on screen, since SVG's Y
// axis points down).
export function angleOfPts(center: { x: number; y: number }, pt: { x: number; y: number }) {
  const deg = (Math.atan2(pt.y - center.y, pt.x - center.x) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

// Whether `angle` falls within the arc's start→end sweep, walking in the
// increasing-angle direction and wrapping through 0/360 if end < start —
// matching how describeArcPath below actually draws it.
export function angleInSweep(angle: number, start: number, end: number) {
  const norm = (a: number) => ((a % 360) + 360) % 360;
  const s = norm(start), e = norm(end), a = norm(angle);
  if (Math.abs(norm(end - start)) < 1e-6) return true; // 0° or 360° sweep — treat as a full circle
  return s <= e ? a >= s - 1e-4 && a <= e + 1e-4 : a >= s - 1e-4 || a <= e + 1e-4;
}

// SVG <path> "d" for an arc from `start` to `end` degrees (always sweeping
// in the increasing-angle direction, wrapping through 360° if needed —
// same convention angleInSweep checks against).
export function describeArcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const norm = (a: number) => ((a % 360) + 360) % 360;
  const s = norm(start);
  const rawSweep = norm(end) - s;
  const sweep = rawSweep <= 1e-6 ? rawSweep + 360 : rawSweep;
  const toXY = (deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
  const p0 = toXY(s);
  const p1 = toXY(s + sweep);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
}

// ---------------------------------------------------------------------
// Selection traps — CATIA's Selection Trap / Intersecting Trap / Polygon
// Trap / Paint Stroke / Outside Trap selection, as drag/click gestures on
// the Select tool's canvas (the variant is picked in the bottom bar). The
// hit tests themselves live in sketchGeometry2d.ts.
// ---------------------------------------------------------------------
export function normalizeRect(box: { x1: number; y1: number; x2: number; y2: number }) {
  return { minX: Math.min(box.x1, box.x2), minY: Math.min(box.y1, box.y2), maxX: Math.max(box.x1, box.x2), maxY: Math.max(box.y1, box.y2) };
}

// Plain {x,y} line/line intersection test (no Pt/id required) — used to
// tell whether a line crosses one of the drag-box's four edges, which
// lineLineParam above can't do directly since a box corner isn't a Pt.
export function segmentsIntersect(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }) {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  return t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6;
}

// Standard ray-casting point-in-polygon test, for the Polygon Trap.
export function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Minimum distance from a point to any segment of a polyline (the Paint
// Stroke tool's brush path) — reuses the same point-to-segment math the
// Trim tool's hit-testing already relies on.
export function distanceToPolyline(x: number, y: number, poly: { x: number; y: number }[]) {
  if (poly.length === 1) return Math.hypot(x - poly[0].x, y - poly[0].y);
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const d = pointToSegmentDistance(x, y, poly[i], poly[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------
// CATIA Sketcher flyout tools (Profile/predefined shapes, Circle
// variants, Ellipse/conics, Spline, Line variants, Point variants) — the
// geometry math each construction needs, kept module-level like the trap
// and Trim helpers above since none of it touches component state.
// ---------------------------------------------------------------------

// Perpendicular distance from (px,py) to the *infinite* line through a,b —
// unlike pointToSegmentDistance (used by Trim/hit-testing) this is never
// clamped to the segment, which is what "how wide should this slot/profile
// be" needs (the 3rd click can land past either center).
export function perpDistanceToLine(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(px - a.x, py - a.y);
  return Math.abs((px - a.x) * dy - (py - a.y) * dx) / len;
}

// Infinite-line/infinite-line intersection (unclamped — unlike
// segmentsIntersect above, which only cares whether two finite segments
// cross). Used by Fillet/Chamfer to find the corner two picked lines would
// meet at even if their actual drawn segments don't quite reach it.
export function infiniteLineIntersect(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }) {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

// Extends a short direction segment (p1→p2) far in both directions for
// rendering/hit-testing an Infinite/Construction Line (NOT the Axis tool —
// a datum/revolve axis stays a finite 'construction'-style segment between
// the two clicked points, see the axis-construction click handler) —
// "far" just needs to safely outlast the sketch's own pan/zoom range, not
// be literally infinite.
export function infiniteLineEndpoints(p1: { x: number; y: number }, p2: { x: number; y: number }, reach = 5000) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  return [{ x: p1.x - ux * reach, y: p1.y - uy * reach }, { x: p2.x + ux * reach, y: p2.y + uy * reach }];
}

// Regular Polygon — inscribed (the picked vertex point lands exactly on
// the polygon, i.e. circumradius = picked distance) or circumscribed (the
// picked point lands on the middle of the nearest edge, i.e. the picked
// distance is the apothem/inradius) N-sided polygon. Generalizes the
// hardcoded 6-sided Hexagon tool below to any side count.
export function regularPolygonPoints(cx: number, cy: number, sides: number, vx: number, vy: number, circumscribed: boolean) {
  const n = Math.max(3, Math.round(sides));
  const d = Math.hypot(vx - cx, vy - cy);
  const baseAngle = Math.atan2(vy - cy, vx - cx);
  const R = circumscribed ? d / Math.cos(Math.PI / n) : d;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = baseAngle + (2 * Math.PI * i) / n;
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  return pts;
}

// 2D Corner Fillet — offset both lines toward the angle's bisector by the
// radius; their new intersection is the arc center, and the feet of the
// perpendiculars from that center back onto each *original* infinite line
// are both where the fillet arc meets its line and where that line gets
// trimmed back to. `cornerIsA1`/`cornerIsB1` say which endpoint of each
// picked line sits at the corner (nearest the other line) — the caller
// works this out once via infiniteLineIntersect before calling in.
export function computeFillet(
  a1: { x: number; y: number }, a2: { x: number; y: number },
  b1: { x: number; y: number }, b2: { x: number; y: number },
  cornerIsA1: boolean, cornerIsB1: boolean, radius: number,
) {
  const corner = cornerIsA1 ? a1 : a2;
  const farA = cornerIsA1 ? a2 : a1;
  const farB = cornerIsB1 ? b2 : b1;
  const lenA = Math.hypot(farA.x - corner.x, farA.y - corner.y) || 1;
  const lenB = Math.hypot(farB.x - corner.x, farB.y - corner.y) || 1;
  const uA = { x: (farA.x - corner.x) / lenA, y: (farA.y - corner.y) / lenA };
  const uB = { x: (farB.x - corner.x) / lenB, y: (farB.y - corner.y) / lenB };
  const bis = { x: uA.x + uB.x, y: uA.y + uB.y };
  const bisLen = Math.hypot(bis.x, bis.y);
  if (bisLen < 1e-6) return null; // the two lines are (nearly) parallel/opposite — no well-defined fillet
  const pickPerp = (u: { x: number; y: number }) => {
    const n1 = { x: -u.y, y: u.x }, n2 = { x: u.y, y: -u.x };
    return n1.x * bis.x + n1.y * bis.y >= n2.x * bis.x + n2.y * bis.y ? n1 : n2;
  };
  const nA = pickPerp(uA), nB = pickPerp(uB);
  const center = infiniteLineIntersect(
    { x: corner.x + nA.x * radius, y: corner.y + nA.y * radius },
    { x: farA.x + nA.x * radius, y: farA.y + nA.y * radius },
    { x: corner.x + nB.x * radius, y: corner.y + nB.y * radius },
    { x: farB.x + nB.x * radius, y: farB.y + nB.y * radius },
  );
  if (!center) return null;
  const footOn = (p: { x: number; y: number }, u: { x: number; y: number }) => {
    const s = (center.x - p.x) * u.x + (center.y - p.y) * u.y;
    return { x: p.x + u.x * s, y: p.y + u.y * s };
  };
  const tanA = footOn(corner, uA), tanB = footOn(corner, uB);
  let start = angleOfPts(center, tanA), end = angleOfPts(center, tanB);
  let diff = end - start;
  if (diff < 0) diff += 360;
  if (diff > 180) [start, end] = [end, start];
  return { center, radius, start, end, tanA, tanB };
}

// Three-Point Circle — the unique circle through 3 non-colinear points.
export function circumcenter3(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null; // colinear — no unique circle
  const ax2y2 = a.x * a.x + a.y * a.y, bx2y2 = b.x * b.x + b.y * b.y, cx2y2 = c.x * c.x + c.y * c.y;
  const ux = (ax2y2 * (b.y - c.y) + bx2y2 * (c.y - a.y) + cx2y2 * (a.y - b.y)) / d;
  const uy = (ax2y2 * (c.x - b.x) + bx2y2 * (a.x - c.x) + cx2y2 * (b.x - a.x)) / d;
  return { x: ux, y: uy, r: Math.hypot(ux - a.x, uy - a.y) };
}

// Tri-Tangent Circle — a circle tangent to 3 picked lines. Written as
// ax+by+c=0 (normalized so a²+b²=1), the tangent circle's center/radius
// solve a small linear system for each of the 8 sign choices (which side
// of each line the circle sits on); of the ones with a real positive
// radius, the incircle-like solution — the one that actually sits inside
// the triangle the 3 lines form — wins, falling back to the smallest
// positive radius when the 3 lines don't bound a proper triangle.
export function triTangentCircle(l1: [{ x: number; y: number }, { x: number; y: number }], l2: typeof l1, l3: typeof l1) {
  const lineEq = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const a = p2.y - p1.y, b = p1.x - p2.x, c = -(a * p1.x + b * p1.y);
    const norm = Math.hypot(a, b) || 1;
    return { a: a / norm, b: b / norm, c: c / norm };
  };
  const solve3x3 = (A: number[][], rhs: number[]) => {
    const det3 = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
      - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det3(A);
    if (Math.abs(D) < 1e-12) return null;
    const Ax = A.map((row, i) => [rhs[i], row[1], row[2]]);
    const Ay = A.map((row, i) => [row[0], rhs[i], row[2]]);
    const Az = A.map((row, i) => [row[0], row[1], rhs[i]]);
    return [det3(Ax) / D, det3(Ay) / D, det3(Az) / D];
  };
  const eqs = [lineEq(l1[0], l1[1]), lineEq(l2[0], l2[1]), lineEq(l3[0], l3[1])];
  const signCombos = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]];
  const candidates: { x: number; y: number; r: number }[] = [];
  for (const s of signCombos) {
    const A = eqs.map((e, i) => [e.a, e.b, -s[i]]);
    const rhs = eqs.map((e) => -e.c);
    const sol = solve3x3(A, rhs);
    if (!sol) continue;
    const [x, y, r] = sol;
    if (r > 1e-6) candidates.push({ x, y, r });
  }
  if (candidates.length === 0) return null;
  const lineIntersectInf = (e1: typeof eqs[0], e2: typeof eqs[0]) => {
    const d = e1.a * e2.b - e2.a * e1.b;
    if (Math.abs(d) < 1e-9) return null;
    return { x: (-e1.c * e2.b + e2.c * e1.b) / d, y: (-e1.a * e2.c + e2.a * e1.c) / d };
  };
  const pAB = lineIntersectInf(eqs[0], eqs[1]), pBC = lineIntersectInf(eqs[1], eqs[2]), pCA = lineIntersectInf(eqs[2], eqs[0]);
  if (pAB && pBC && pCA) {
    const inside = candidates.filter((p) => pointInPolygon(p.x, p.y, [pAB, pBC, pCA]));
    if (inside.length) return inside.sort((a, b) => a.r - b.r)[0];
  }
  return candidates.sort((a, b) => a.r - b.r)[0];
}
