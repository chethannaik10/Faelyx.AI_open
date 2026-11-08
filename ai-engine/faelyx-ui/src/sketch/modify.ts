// Sketch MODIFY tools — the pure geometry behind Mirror, Translate, Rotate and Offset.
//
// Nothing in here touches React or the canvas: every function takes the sketch's
// arrays and returns new ones, so the same code drives the live preview, the
// committed result and the unit tests. Coordinates are the sketch's own (mm, Y down).
//
//  * Mirror / Translate / Rotate   — copy or move a set of entities (copyEntities / moveEntities).
//  * Offset                         — parallel copies of lines, arcs, circles, curves and chains,
//                                     with sharp / round / chained corner handling (planOffset).
import type { Arc, Circ, Constraint, Ln, Pt, SketchCurve } from './types';

export type XY = { x: number; y: number };
export type Sk = { points: Pt[]; lines: Ln[]; circles: Circ[]; arcs: Arc[]; curves: SketchCurve[]; constraints: Constraint[] };

const DEG = 180 / Math.PI;
const norm360 = (d: number) => ((d % 360) + 360) % 360;

// ---------------------------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------------------------
export type Xform =
  | { kind: 'mirror'; a: XY; b: XY }                 // reflect across the line through a and b
  | { kind: 'translate'; dx: number; dy: number }    // sketch units, Y down
  | { kind: 'rotate'; c: XY; phi: number };          // radians, in sketch (Y down) space: x' = cx + dx cosφ − dy sinφ …

export function applyPt(t: Xform, p: XY): XY {
  if (t.kind === 'translate') return { x: p.x + t.dx, y: p.y + t.dy };
  if (t.kind === 'rotate') {
    const dx = p.x - t.c.x, dy = p.y - t.c.y, c = Math.cos(t.phi), s = Math.sin(t.phi);
    return { x: t.c.x + dx * c - dy * s, y: t.c.y + dx * s + dy * c };
  }
  const ux = t.b.x - t.a.x, uy = t.b.y - t.a.y, len = Math.hypot(ux, uy) || 1;
  const dx = ux / len, dy = uy / len;
  const vx = p.x - t.a.x, vy = p.y - t.a.y, k = vx * dx + vy * dy;
  return { x: t.a.x + 2 * k * dx - vx, y: t.a.y + 2 * k * dy - vy };
}

/** How a direction angle (degrees, atan2 of sketch coordinates) changes under the transform. */
export function mapAngleDeg(t: Xform, deg: number): number {
  if (t.kind === 'translate') return deg;
  if (t.kind === 'rotate') return norm360(deg + t.phi * DEG);
  return norm360(2 * Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x) * DEG - deg);
}

/** The user-facing "rotate by α degrees counter-clockwise" as the sketch-space rotation. */
export const ccwToPhi = (alphaDeg: number) => (-alphaDeg * Math.PI) / 180;

export function curveRefs(cv: SketchCurve): string[] {
  switch (cv.kind) {
    case 'ellipse': return [cv.center];
    case 'parabola': return [cv.focus, cv.vertex];
    case 'hyperbola': return [cv.center, cv.focus, cv.vertex];
    case 'spline': case 'spline-cv': return cv.controlIds;
    case 'conic-rp': return [cv.p0, cv.papex, cv.p2];
    default: return cv.ptIds;
  }
}

// ---------------------------------------------------------------------------------------------
// Which entities (and points) a selection means
// ---------------------------------------------------------------------------------------------
export type Closure = { points: Set<string>; lines: Ln[]; circles: Circ[]; arcs: Arc[]; curves: SketchCurve[] };

export function collect(sk: Sk, ids: string[]): Closure {
  const want = new Set(ids);
  const out: Closure = { points: new Set(), lines: [], circles: [], arcs: [], curves: [] };
  const pt = new Set(sk.points.map((p) => p.id));
  for (const l of sk.lines) if (want.has(l.id) && pt.has(l.p1) && pt.has(l.p2)) { out.lines.push(l); out.points.add(l.p1); out.points.add(l.p2); }
  for (const c of sk.circles) if (want.has(c.id) && pt.has(c.center)) { out.circles.push(c); out.points.add(c.center); }
  for (const a of sk.arcs) if (want.has(a.id) && pt.has(a.center)) {
    out.arcs.push(a); out.points.add(a.center);
    if (a.p1 && pt.has(a.p1)) out.points.add(a.p1);
    if (a.p2 && pt.has(a.p2)) out.points.add(a.p2);
  }
  for (const cv of sk.curves) if (want.has(cv.id) && curveRefs(cv).every((id) => pt.has(id))) { out.curves.push(cv); for (const id of curveRefs(cv)) out.points.add(id); }
  for (const id of want) if (pt.has(id)) out.points.add(id);
  // A Center / Midpoint marker (the dot a rectangle carries) travels with the shape it centres.
  for (const k of sk.constraints) {
    if (k.type !== 'midpoint') continue;
    const centre = k.args.center, ends = k.args.points;
    if (typeof centre !== 'string' || !pt.has(centre) || out.points.has(centre) || !Array.isArray(ends) || ends.length === 0) continue;
    if (ends.every((e) => typeof e === 'string' && out.points.has(e))) out.points.add(centre);
  }
  return out;
}

export const closureSize = (c: Closure) => c.points.size + c.lines.length + c.circles.length + c.arcs.length + c.curves.length;

/** Ids of every entity in the closure (points excluded when they only belong to another entity of it). */
export function closureEntityIds(c: Closure, sk: Sk): string[] {
  const owned = new Set<string>();
  for (const l of c.lines) { owned.add(l.p1); owned.add(l.p2); }
  for (const x of c.circles) owned.add(x.center);
  for (const a of c.arcs) { owned.add(a.center); if (a.p1) owned.add(a.p1); if (a.p2) owned.add(a.p2); }
  for (const cv of c.curves) for (const id of curveRefs(cv)) owned.add(id);
  const loose = sk.points.filter((p) => c.points.has(p.id) && !owned.has(p.id)).map((p) => p.id);
  return [...c.lines.map((l) => l.id), ...c.circles.map((x) => x.id), ...c.arcs.map((a) => a.id), ...c.curves.map((x) => x.id), ...loose];
}

// ---------------------------------------------------------------------------------------------
// Copying
// ---------------------------------------------------------------------------------------------
const COPY_TYPES = new Set([
  'coincident', 'parallel', 'perpendicular', 'equal_length', 'equal_radius', 'tangent_circles', 'tangent_line_circle',
  'tangent_line_curve', 'tangent_curves', 'distance', 'radius', 'angle', 'symmetric', 'midpoint', 'horizontal', 'vertical',
  'line_angle', 'point_line_distance',
]);

/** Whether a horizontal/vertical constraint survives the transform, and whether it swaps. */
function hvAfter(t: Xform, type: 'horizontal' | 'vertical'): 'horizontal' | 'vertical' | null {
  const m = norm360(mapAngleDeg(t, type === 'horizontal' ? 0 : 90)) % 180;
  const near = (v: number) => Math.abs(m - v) < 1e-6 || Math.abs(m - v - 180) < 1e-6;
  if (near(0)) return 'horizontal';
  if (near(90)) return 'vertical';
  return null;
}

export type CopyResult = {
  points: Pt[]; lines: Ln[]; circles: Circ[]; arcs: Arc[]; curves: SketchCurve[]; constraints: Constraint[];
  /** original point id → its image (the same id when the point lies on the mirror axis) */
  pointMap: Map<string, string>;
  /** every entity id that was created (points that are new + the new lines/circles/arcs/curves) */
  newIds: string[];
  /** the entity ids a user would select to carry on with the copies */
  selectIds: string[];
};

export type CopyOpts = {
  /** Mirror only: keep the copies tied to the originals with Symmetry (and equal-radius) constraints. */
  assoc?: { axisLineId: string } | null;
  /** Copy the constraints that exist only between the copied entities. Default true. */
  keepConstraints?: boolean;
};

export function copyEntities(sk: Sk, cl: Closure, t: Xform, nextId: (prefix: string) => string, opts: CopyOpts = {}): CopyResult {
  const byId = new Map(sk.points.map((p) => [p.id, p]));
  const res: CopyResult = { points: [], lines: [], circles: [], arcs: [], curves: [], constraints: [], pointMap: new Map(), newIds: [], selectIds: [] };
  const mapPt = (id: string): string => {
    const hit = res.pointMap.get(id);
    if (hit) return hit;
    const p = byId.get(id)!;
    const q = applyPt(t, p);
    // A point on the mirror axis is its own mirror image: reuse it so the copy joins up with the original.
    if (t.kind === 'mirror' && Math.hypot(q.x - p.x, q.y - p.y) < 1e-4) { res.pointMap.set(id, id); return id; }
    const np: Pt = { id: nextId('pt'), x: q.x, y: q.y };
    res.points.push(np); res.pointMap.set(id, np.id); res.newIds.push(np.id);
    return np.id;
  };
  for (const id of cl.points) if (byId.has(id)) mapPt(id);

  for (const l of cl.lines) {
    const p1 = mapPt(l.p1), p2 = mapPt(l.p2);
    if ((p1 === l.p1 && p2 === l.p2) || (p1 === l.p2 && p2 === l.p1)) continue;        // lies on the axis: its image is itself
    const nl: Ln = { id: nextId('ln'), p1, p2, ...(l.style && l.style !== 'projected' ? { style: l.style } : {}) };
    res.lines.push(nl); res.newIds.push(nl.id); res.selectIds.push(nl.id);
  }
  for (const c of cl.circles) {
    const nc: Circ = { id: nextId('cir'), center: mapPt(c.center), r: c.r };
    res.circles.push(nc); res.newIds.push(nc.id); res.selectIds.push(nc.id);
  }
  for (const a of cl.arcs) {
    const c = byId.get(a.center)!;
    const at = (deg: number): XY => ({ x: c.x + a.r * Math.cos((deg * Math.PI) / 180), y: c.y + a.r * Math.sin((deg * Math.PI) / 180) });
    const endId = (id: string | undefined, deg: number): string => {
      if (id && byId.has(id)) return mapPt(id);
      const q = applyPt(t, at(deg)); const np: Pt = { id: nextId('pt'), x: q.x, y: q.y };
      res.points.push(np); res.newIds.push(np.id); return np.id;
    };
    const s = endId(a.p1, a.start), e = a.p1 && a.p1 === a.p2 ? s : endId(a.p2, a.end);
    const mirror = t.kind === 'mirror';
    const na: Arc = mirror
      ? { id: nextId('arc'), center: mapPt(a.center), r: a.r, start: mapAngleDeg(t, a.end), end: mapAngleDeg(t, a.start), p1: e, p2: s }
      : { id: nextId('arc'), center: mapPt(a.center), r: a.r, start: mapAngleDeg(t, a.start), end: mapAngleDeg(t, a.end), p1: s, p2: e };
    res.arcs.push(na); res.newIds.push(na.id); res.selectIds.push(na.id);
  }
  for (const cv of cl.curves) {
    const m = (id: string) => mapPt(id);
    let nc: SketchCurve;
    switch (cv.kind) {
      case 'ellipse': {
        const rot = t.kind === 'mirror' ? 2 * Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x) - cv.rot : t.kind === 'rotate' ? cv.rot + t.phi : cv.rot;
        const partial = cv.start !== undefined && cv.end !== undefined;
        const [start, end] = !partial ? [undefined, undefined] : t.kind === 'mirror' ? [norm360(-cv.end!), norm360(-cv.start!)] : [cv.start, cv.end];
        nc = { id: nextId('cv'), kind: 'ellipse', center: m(cv.center), rx: cv.rx, ry: cv.ry, rot, ...(partial ? { start, end } : {}) };
        break;
      }
      case 'parabola': nc = { ...cv, id: nextId('cv'), focus: m(cv.focus), vertex: m(cv.vertex) }; break;
      case 'hyperbola': nc = { ...cv, id: nextId('cv'), center: m(cv.center), focus: m(cv.focus), vertex: m(cv.vertex) }; break;
      case 'spline': nc = { ...cv, id: nextId('cv'), controlIds: cv.controlIds.map(m) }; break;
      case 'spline-cv': nc = { ...cv, id: nextId('cv'), controlIds: cv.controlIds.map(m) }; break;
      case 'conic-rp': nc = { ...cv, id: nextId('cv'), p0: m(cv.p0), papex: m(cv.papex), p2: m(cv.p2) }; break;
      default: nc = { ...cv, id: nextId('cv'), ptIds: cv.ptIds.map(m) };
    }
    res.curves.push(nc); res.newIds.push(nc.id); res.selectIds.push(nc.id);
  }
  for (const id of cl.points) {
    const img = res.pointMap.get(id);
    if (img && img !== id && !res.selectIds.includes(img) && !closureOwnsPoint(cl, id)) res.selectIds.push(img);
  }

  // Entity images, for constraints that name lines / circles / arcs rather than points.
  const entMap = new Map<string, string>(res.pointMap);
  const pairUp = (src: { id: string }[], dst: { id: string }[], srcSkipped?: (x: never) => boolean) => { void srcSkipped; let j = 0; for (const s of src) { if (dst[j]) entMap.set(s.id, dst[j].id); j++; } };
  // lines may have been skipped (axis lines) — pair by points instead
  for (const l of cl.lines) {
    const p1 = res.pointMap.get(l.p1), p2 = res.pointMap.get(l.p2);
    const nl = res.lines.find((x) => (x.p1 === p1 && x.p2 === p2) || (x.p1 === p2 && x.p2 === p1));
    if (nl) entMap.set(l.id, nl.id);
  }
  pairUp(cl.circles, res.circles); pairUp(cl.arcs, res.arcs); pairUp(cl.curves, res.curves);

  if (opts.keepConstraints !== false) {
    for (const k of sk.constraints) {
      if (!COPY_TYPES.has(k.type)) continue;
      if ('role' in k.args || 'chamfer' in k.args) continue;
      if (k.type === 'line_angle' && t.kind !== 'translate') continue;
      if (k.type === 'point_line_distance' && t.kind === 'mirror') continue;
      let ok = true, changed = false;
      const args: Record<string, unknown> = {};
      const mapId = (v: string): string => {
        const to = entMap.get(v);
        if (to === undefined) { ok = false; return v; }
        if (to !== v) changed = true;
        return to;
      };
      for (const [key, v] of Object.entries(k.args)) {
        if (typeof v === 'string') args[key] = mapId(v);
        else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) args[key] = (v as string[]).map(mapId);
        else args[key] = v;
      }
      if (!ok || !changed) continue;
      let type = k.type;
      let label = `${k.label} (copy)`;
      if (type === 'horizontal' || type === 'vertical') {
        const nt = hvAfter(t, type);
        if (!nt) continue;
        if (nt !== type) label = `${nt === 'horizontal' ? 'Horizontal' : 'Vertical'}: ${String(args.line)} (copy)`;
        type = nt;
      }
      if (type === 'angle' && t.kind === 'mirror' && typeof args.value === 'number') args.value = (180 - (args.value as number)) % 180;
      res.constraints.push({ id: nextId('c'), type, args, label });
    }
  }

  // Associative mirror: the copies stay the exact reflection of the originals (the solver keeps them so).
  if (t.kind === 'mirror' && opts.assoc) {
    const axis = opts.assoc.axisLineId;
    for (const [orig, img] of res.pointMap) {
      if (orig === img) continue;
      res.constraints.push({ id: nextId('c'), type: 'symmetric', args: { p1: orig, p2: img, line: axis }, label: `Symmetry: ${orig}, ${img}` });
    }
    for (const c of cl.circles) {
      const nc = entMap.get(c.id);
      if (nc) res.constraints.push({ id: nextId('c'), type: 'equal_radius', args: { circle1: c.id, circle2: nc }, label: `Equal radius: ${c.id}, ${nc}` });
    }
  }
  return res;
}

function closureOwnsPoint(cl: Closure, id: string): boolean {
  return cl.lines.some((l) => l.p1 === id || l.p2 === id) || cl.circles.some((c) => c.center === id)
    || cl.arcs.some((a) => a.center === id || a.p1 === id || a.p2 === id) || cl.curves.some((cv) => curveRefs(cv).includes(id));
}

// ---------------------------------------------------------------------------------------------
// Moving in place
// ---------------------------------------------------------------------------------------------
export type MoveResult = { points: Pt[]; arcs: Arc[]; curves: SketchCurve[]; constraints: Constraint[]; /** Horizontal / Vertical / angle constraints a rotation could not keep */ released: number };

export function moveEntities(sk: Sk, cl: Closure, t: Xform): MoveResult {
  const points = sk.points.map((p) => (cl.points.has(p.id) ? { ...p, ...applyPt(t, p) } : p));
  const arcIds = new Set(cl.arcs.map((a) => a.id));
  const arcs = sk.arcs.map((a) => (arcIds.has(a.id) ? { ...a, start: mapAngleDeg(t, a.start), end: mapAngleDeg(t, a.end) } : a));
  const curveIds = new Set(cl.curves.map((c) => c.id));
  const curves = sk.curves.map((cv) => {
    if (!curveIds.has(cv.id) || cv.kind !== 'ellipse') return cv;
    return t.kind === 'rotate' ? { ...cv, rot: cv.rot + t.phi } : cv;
  });
  // A Fixed constraint pins a point to coordinates: pinning it where it used to be would pull the move straight back.
  const lineIds = new Set(cl.lines.map((l) => l.id));
  let released = 0;
  const constraints: Constraint[] = [];
  for (const k of sk.constraints) {
    if (k.type === 'fixed' && typeof k.args.point === 'string' && cl.points.has(k.args.point)) {
      const q = applyPt(t, { x: Number(k.args.x), y: Number(k.args.y) });
      constraints.push({ ...k, args: { ...k.args, x: q.x, y: q.y } });
      continue;
    }
    // A rotation turns the lines it moves: Horizontal becomes Vertical after a quarter turn and neither holds at any
    // other angle — keeping them would make the solver rotate the profile straight back.
    if (t.kind === 'rotate' && (k.type === 'horizontal' || k.type === 'vertical' || k.type === 'line_angle')
      && typeof k.args.line === 'string' && lineIds.has(k.args.line)) {
      const nt = k.type === 'line_angle' ? null : hvAfter(t, k.type);
      if (!nt) { released++; continue; }
      if (nt !== k.type) {
        constraints.push({ ...k, type: nt, label: `${nt === 'horizontal' ? 'Horizontal' : 'Vertical'}: ${k.args.line}` });
        continue;
      }
    }
    constraints.push(k);
  }
  return { points, arcs, curves, constraints, released };
}

// ---------------------------------------------------------------------------------------------
// Offset
// ---------------------------------------------------------------------------------------------
export type OffsetCorner = 'sharp' | 'round' | 'chain';
export type OffsetPropagation = 'none' | 'tangent' | 'point';
/** One element of a chain in travel order; `rev` = travelled from the entity's end to its start. */
export type OffsetItem = { id: string; rev: boolean };
export type OffsetChain = { items: OffsetItem[]; closed: boolean };
/** The stored definition of an offset: everything needed to rebuild it from the (possibly edited) sources. */
export type OffsetSpec = { chains: OffsetChain[]; dist: number; corner: OffsetCorner; /** per chain: +1 left of travel / outward for circles, −1 the other way, 0 both */ sides: (1 | -1 | 0)[] };

export type PlanPt = { key: string; x: number; y: number };
export type OffsetPlan = {
  points: PlanPt[];
  lines: { key: string; p1: string; p2: string; style?: Ln['style'] }[];
  arcs: { key: string; center: string; p1: string; p2: string; r: number; start: number; end: number }[];
  circles: { key: string; center: string; r: number }[];
  curves: { key: string; ctrl: string[] }[];
  warnings: string[];
};

type Elem =
  | { kind: 'line'; id: string; a: XY; b: XY }                                                    // travel order a → b
  | { kind: 'arc'; id: string; c: XY; r: number; a0: number; a1: number; dir: 1 | -1 }           // angle a0 → a1 travelled in direction dir (+1 = increasing)
  ;

const rad = (d: number) => (d * Math.PI) / 180;
const pol = (c: XY, r: number, deg: number): XY => ({ x: c.x + r * Math.cos(rad(deg)), y: c.y + r * Math.sin(rad(deg)) });
const sub = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: XY, b: XY) => a.x * b.x + a.y * b.y;
const len = (a: XY) => Math.hypot(a.x, a.y);
const unit = (a: XY): XY => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };

/** Unit tangent of an element at its start (`atEnd` false) or end, in travel direction. */
function tangentAt(e: Elem, atEnd: boolean): XY {
  if (e.kind === 'line') return unit(sub(e.b, e.a));
  const deg = atEnd ? e.a1 : e.a0;
  return { x: -Math.sin(rad(deg)) * e.dir, y: Math.cos(rad(deg)) * e.dir };
}
const leftNormal = (t: XY): XY => ({ x: t.y, y: -t.x });

function startPt(e: Elem): XY { return e.kind === 'line' ? e.a : pol(e.c, e.r, e.a0); }
function endPt(e: Elem): XY { return e.kind === 'line' ? e.b : pol(e.c, e.r, e.a1); }

/** Offset one element by `d` to its left (`side` = +1) or right (−1). Null when it collapses. */
function offsetElem(e: Elem, d: number, side: 1 | -1): Elem | null {
  if (e.kind === 'line') {
    const n = leftNormal(unit(sub(e.b, e.a)));
    const o = { x: n.x * d * side, y: n.y * d * side };
    return { ...e, a: { x: e.a.x + o.x, y: e.a.y + o.y }, b: { x: e.b.x + o.x, y: e.b.y + o.y } };
  }
  // left of travel is outward (+radial) when travelling in the increasing-angle direction
  const r = e.r + side * e.dir * d;
  if (r < 1e-6) return null;
  return { ...e, r };
}

type Carrier = { kind: 'line'; p: XY; dir: XY } | { kind: 'circle'; c: XY; r: number };
const carrierOf = (e: Elem): Carrier => (e.kind === 'line' ? { kind: 'line', p: e.a, dir: unit(sub(e.b, e.a)) } : { kind: 'circle', c: e.c, r: e.r });

function intersectCarriers(A: Carrier, B: Carrier): XY[] {
  if (A.kind === 'line' && B.kind === 'line') {
    const den = A.dir.x * B.dir.y - A.dir.y * B.dir.x;
    if (Math.abs(den) < 1e-9) return [];
    const w = sub(B.p, A.p);
    const s = (w.x * B.dir.y - w.y * B.dir.x) / den;
    return [{ x: A.p.x + A.dir.x * s, y: A.p.y + A.dir.y * s }];
  }
  if (A.kind === 'circle' && B.kind === 'line') return intersectCarriers(B, A);
  if (A.kind === 'line' && B.kind === 'circle') {
    const f = sub(A.p, B.c);
    const b = dot(f, A.dir), c = dot(f, f) - B.r * B.r;
    const disc = b * b - c;
    if (disc < 0) return [];
    const sq = Math.sqrt(disc);
    return [-b - sq, -b + sq].map((s) => ({ x: A.p.x + A.dir.x * s, y: A.p.y + A.dir.y * s }));
  }
  const a = A as Extract<Carrier, { kind: 'circle' }>, b = B as Extract<Carrier, { kind: 'circle' }>;
  const d = len(sub(b.c, a.c));
  if (d < 1e-9 || d > a.r + b.r + 1e-9 || d < Math.abs(a.r - b.r) - 1e-9) return [];
  const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.r * a.r - x * x));
  const ex = unit(sub(b.c, a.c)), ey = { x: -ex.y, y: ex.x };
  const m = { x: a.c.x + ex.x * x, y: a.c.y + ex.y * x };
  return [{ x: m.x + ey.x * h, y: m.y + ey.y * h }, { x: m.x - ey.x * h, y: m.y - ey.y * h }];
}

/** Rebuild a travel-order element list from a chain's entity ids and the live sketch. */
function chainElems(sk: Sk, ch: OffsetChain): Elem[] | null {
  const pts = new Map(sk.points.map((p) => [p.id, p]));
  const out: Elem[] = [];
  for (const it of ch.items) {
    const ln = sk.lines.find((l) => l.id === it.id);
    if (ln) {
      const a = pts.get(ln.p1), b = pts.get(ln.p2);
      if (!a || !b) return null;
      out.push(it.rev ? { kind: 'line', id: it.id, a: b, b: a } : { kind: 'line', id: it.id, a, b });
      continue;
    }
    const ar = sk.arcs.find((x) => x.id === it.id);
    if (ar) {
      const c = pts.get(ar.center);
      if (!c) return null;
      const p1 = ar.p1 ? pts.get(ar.p1) : undefined, p2 = ar.p2 ? pts.get(ar.p2) : undefined;
      const start = p1 ? norm360(Math.atan2(p1.y - c.y, p1.x - c.x) * DEG) : ar.start;
      const end = p2 ? norm360(Math.atan2(p2.y - c.y, p2.x - c.x) * DEG) : ar.end;
      const r = p1 ? Math.hypot(p1.x - c.x, p1.y - c.y) : ar.r;
      out.push(it.rev ? { kind: 'arc', id: it.id, c, r, a0: end, a1: start, dir: -1 } : { kind: 'arc', id: it.id, c, r, a0: start, a1: end, dir: 1 });
      continue;
    }
    return null;
  }
  return out;
}

/**
 * The geometry of an offset, as plain data (keys instead of ids). Lines / arcs / chains are joined at every
 * vertex: where the offset pieces cross they are trimmed to the crossing; where they would leave a gap
 * the corner is closed according to `corner` — extended to a sharp point, rounded with an arc, or
 * bridged by a straight segment.
 */
export function planOffset(sk: Sk, spec: OffsetSpec, sample: (curveId: string) => XY[]): OffsetPlan {
  const plan: OffsetPlan = { points: [], lines: [], arcs: [], circles: [], curves: [], warnings: [] };
  const d = spec.dist;
  if (!(d > 0)) { plan.warnings.push('The offset distance must be greater than zero.'); return plan; }
  const ptByKey = new Map<string, PlanPt>();
  const addPt = (key: string, p: XY): string => { if (!ptByKey.has(key)) { const q = { key, x: p.x, y: p.y }; ptByKey.set(key, q); plan.points.push(q); } return key; };

  spec.chains.forEach((chain, ci) => {
    const sides: (1 | -1)[] = spec.sides[ci] === 0 ? [1, -1] : [(spec.sides[ci] ?? 1) as 1 | -1];
    sides.forEach((side) => {
      const tag = `o${ci}${side > 0 ? 'a' : 'b'}`;
      const first = chain.items[0];
      if (!first) return;
      // ---- single circle / curve ----
      const circ = sk.circles.find((c) => c.id === first.id);
      if (circ) {
        const c = sk.points.find((p) => p.id === circ.center);
        if (!c) return;
        const r = circ.r + side * d;
        if (r < 1e-6) { plan.warnings.push('The offset circle would have no radius.'); return; }
        plan.circles.push({ key: `${tag}c`, center: addPt(`${tag}cc`, c), r });
        return;
      }
      const cv = sk.curves.find((c) => c.id === first.id);
      if (cv) {
        const pts = sample(cv.id);
        if (pts.length < 3) return;
        const ordered = first.rev ? [...pts].reverse() : pts;
        const n = ordered.length;
        const closedCurve = len(sub(ordered[0], ordered[n - 1])) < 1e-6 * (1 + len(ordered[0]));
        const offs: XY[] = ordered.map((p, i) => {
          const a = ordered[Math.max(0, i - 1)], b = ordered[Math.min(n - 1, i + 1)];
          const nn = leftNormal(unit(sub(b, a)));
          return { x: p.x + nn.x * d * side, y: p.y + nn.y * d * side };
        });
        // thin out to a manageable number of control points
        const keep = Math.min(offs.length, 24);
        const idx = Array.from({ length: keep }, (_, i) => Math.round((i * (offs.length - 1)) / (keep - 1)));
        const ctrl = idx.map((ix, i) => addPt(`${tag}k${i}`, offs[ix]));
        if (closedCurve) ctrl[ctrl.length - 1] = ctrl[0];
        plan.curves.push({ key: `${tag}s`, ctrl: closedCurve ? ctrl.slice(0, -1).concat(ctrl[0]) : ctrl });
        return;
      }
      // ---- a chain of lines and arcs ----
      const src = chainElems(sk, chain);
      if (!src || src.length === 0) return;
      let elems = src.map((e, i) => ({ src: e, off: offsetElem(e, d, side), i }));
      const dropped: string[] = [];
      for (const x of elems) if (!x.off) dropped.push(x.src.id);
      let live = elems.filter((x) => x.off) as { src: Elem; off: Elem; i: number }[];
      type Joint = { ends: XY; starts: XY; shared: boolean; bridge: 'none' | 'line' | 'arc'; corner?: XY };
      let ends: { s: XY; e: XY }[] = [];
      for (let guard = 0; guard < 8; guard++) {
        const n = live.length;
        if (n === 0) break;
        const closed = chain.closed && n > 1;
        ends = live.map((x) => ({ s: startPt(x.off), e: endPt(x.off) }));
        const joints: (Joint | null)[] = [];
        for (let j = 0; j < (closed ? n : n - 1); j++) {
          const A = live[j], B = live[(j + 1) % n];
          const eA = endPt(A.off), sB = startPt(B.off);
          const V = endPt(A.src);
          if (len(sub(eA, sB)) < 1e-4) { joints.push({ ends: eA, starts: sB, shared: true, bridge: 'none' }); continue; }
          const cands = intersectCarriers(carrierOf(A.off), carrierOf(B.off));
          const mid = { x: (eA.x + sB.x) / 2, y: (eA.y + sB.y) / 2 };
          let best: XY | null = null;
          for (const c of cands) if (!best || len(sub(c, mid)) < len(sub(best, mid))) best = c;
          if (best) {
            const tA = tangentAt(A.off, true), tB = tangentAt(B.off, false);
            const trimA = dot(sub(best, eA), tA) <= 1e-6, trimB = dot(sub(best, sB), tB) >= -1e-6;
            const extA = dot(sub(best, eA), tA) > 1e-6, extB = dot(sub(best, sB), tB) < -1e-6;
            if (trimA && trimB) { joints.push({ ends: best, starts: best, shared: true, bridge: 'none' }); continue; }
            if (extA && extB && spec.corner === 'sharp' && len(sub(best, V)) <= 8 * d) { joints.push({ ends: best, starts: best, shared: true, bridge: 'none' }); continue; }
          }
          joints.push({ ends: eA, starts: sB, shared: false, bridge: spec.corner === 'round' ? 'arc' : 'line', corner: V });
        }
        // Apply the joints to the element ends, then look for pieces that ran backwards (collapsed).
        const adj = live.map((x) => ({ x, s: startPt(x.off), e: endPt(x.off) }));
        joints.forEach((jt, j) => {
          if (!jt) return;
          adj[j].e = jt.ends; adj[(j + 1) % n].s = jt.starts;
        });
        let removed = false;
        for (let j = n - 1; j >= 0; j--) {
          const a = adj[j];
          const t0 = tangentAt(a.x.off, false);
          const reversed = a.x.off.kind === 'line'
            ? dot(sub(a.e, a.s), t0) < -1e-6 || len(sub(a.e, a.s)) < 1e-6
            : false;
          if (reversed) { dropped.push(a.x.src.id); live = live.filter((_, k) => k !== j); removed = true; break; }
        }
        if (removed) continue;
        // ---- emit ----
        const pk = (j: number, w: 's' | 'e') => `${tag}${w}${live[j].i}`;
        const pointFor = (j: number, w: 's' | 'e'): string => {
          // shared joints use one key for both sides
          if (w === 'e') {
            const jt = joints[j];
            if (jt?.shared) return addPt(`${tag}j${j}`, jt.ends);
            return addPt(pk(j, 'e'), adj[j].e);
          }
          const pj = closed ? (j - 1 + n) % n : j - 1;
          const jt = pj >= 0 ? joints[pj] : null;
          if (jt?.shared) return addPt(`${tag}j${pj}`, jt.starts);
          return addPt(pk(j, 's'), adj[j].s);
        };
        live.forEach((x, j) => {
          const sKey = pointFor(j, 's'), eKey = pointFor(j, 'e');
          const e = x.off;
          if (e.kind === 'line') {
            plan.lines.push({ key: `${tag}l${x.i}`, p1: sKey, p2: eKey });
          } else {
            const cKey = addPt(`${tag}ac${x.i}`, e.c);
            const sp = ptByKey.get(sKey)!, ep = ptByKey.get(eKey)!;
            const aS = norm360(Math.atan2(sp.y - e.c.y, sp.x - e.c.x) * DEG), aE = norm360(Math.atan2(ep.y - e.c.y, ep.x - e.c.x) * DEG);
            // the entity arc always runs in the increasing-angle direction
            const [p1, p2, st, en] = e.dir === 1 ? [sKey, eKey, aS, aE] : [eKey, sKey, aE, aS];
            plan.arcs.push({ key: `${tag}a${x.i}`, center: cKey, p1, p2, r: e.r, start: st, end: en });
          }
        });
        joints.forEach((jt, j) => {
          if (!jt || jt.shared) return;
          const kA = pointFor(j, 'e'), kB = pointFor((j + 1) % n, 's');
          if (jt.bridge === 'arc' && jt.corner) {
            const ca = addPt(`${tag}rc${j}`, jt.corner);
            const pa = ptByKey.get(kA)!, pb = ptByKey.get(kB)!;
            const a1 = norm360(Math.atan2(pa.y - jt.corner.y, pa.x - jt.corner.x) * DEG), a2 = norm360(Math.atan2(pb.y - jt.corner.y, pb.x - jt.corner.x) * DEG);
            const inc = norm360(a2 - a1) <= 180;           // short way round is the increasing-angle one
            const [p1, p2, st, en] = inc ? [kA, kB, a1, a2] : [kB, kA, a2, a1];
            plan.arcs.push({ key: `${tag}r${j}`, center: ca, p1, p2, r: d, start: st, end: en });
          } else {
            plan.lines.push({ key: `${tag}b${j}`, p1: kA, p2: kB });
          }
        });
        break;
      }
      void ends;
      if (live.length === 0) plan.warnings.push('The offset is too large for this profile — nothing is left of it.');
      else if (dropped.length) plan.warnings.push(`${dropped.length} piece${dropped.length > 1 ? 's' : ''} of the profile ${dropped.length > 1 ? 'are' : 'is'} too small for this offset and ${dropped.length > 1 ? 'were' : 'was'} left out.`);
    });
  });
  return plan;
}

// ---- chain discovery ---------------------------------------------------------------------

/** Lines and arcs that touch the point, with the end that touches it. */
function touching(sk: Sk, pid: string): { id: string; end: 'p1' | 'p2' }[] {
  const out: { id: string; end: 'p1' | 'p2' }[] = [];
  for (const l of sk.lines) {
    if (l.style === 'infinite') continue;
    if (l.p1 === pid) out.push({ id: l.id, end: 'p1' });
    if (l.p2 === pid) out.push({ id: l.id, end: 'p2' });
  }
  for (const a of sk.arcs) {
    if (a.p1 === pid && a.p1 !== a.p2) out.push({ id: a.id, end: 'p1' });
    if (a.p2 === pid && a.p1 !== a.p2) out.push({ id: a.id, end: 'p2' });
  }
  return out;
}
const endsOf = (sk: Sk, id: string): { p1: string; p2: string } | null => {
  const l = sk.lines.find((x) => x.id === id);
  if (l) return { p1: l.p1, p2: l.p2 };
  const a = sk.arcs.find((x) => x.id === id);
  if (a && a.p1 && a.p2) return { p1: a.p1, p2: a.p2 };
  return null;
};

function tangentContinuous(sk: Sk, a: OffsetItem, b: OffsetItem): boolean {
  const ea = chainElems(sk, { items: [a], closed: false })?.[0], eb = chainElems(sk, { items: [b], closed: false })?.[0];
  if (!ea || !eb) return false;
  const ta = tangentAt(ea, true), tb = tangentAt(eb, false);
  return dot(ta, tb) > Math.cos(rad(1.5));
}

/** The chain through `seedId`: extended through shared points (and optionally only while tangent). */
export function buildChain(sk: Sk, seedId: string, mode: OffsetPropagation): OffsetChain | null {
  if (sk.circles.some((c) => c.id === seedId) || sk.curves.some((c) => c.id === seedId)) return { items: [{ id: seedId, rev: false }], closed: false };
  const seedEnds = endsOf(sk, seedId);
  if (!seedEnds) return null;
  const items: OffsetItem[] = [{ id: seedId, rev: false }];
  if (mode === 'none') return { items, closed: false };
  const used = new Set([seedId]);
  let closed = false;
  const grow = (forward: boolean) => {
    for (;;) {
      const tip = forward ? items[items.length - 1] : items[0];
      const e = endsOf(sk, tip.id)!;
      const tipPoint = forward ? (tip.rev ? e.p1 : e.p2) : (tip.rev ? e.p2 : e.p1);
      const near = touching(sk, tipPoint);
      // branching (more than two pieces at one point) ends the chain, as does the end of the geometry
      if (near.length !== 2) return;
      const nxt = near.find((n) => n.id !== tip.id);
      if (!nxt) return;
      if (nxt.id === items[forward ? 0 : items.length - 1].id && items.length > 1) { closed = true; return; }
      if (used.has(nxt.id)) return;
      // travelling forward we leave the new piece from the end opposite to the one we entered through
      const item: OffsetItem = forward ? { id: nxt.id, rev: nxt.end === 'p2' } : { id: nxt.id, rev: nxt.end === 'p1' };
      const cand = forward ? [tip, item] : [item, tip];
      if (mode === 'tangent' && !tangentContinuous(sk, cand[0], cand[1])) return;
      used.add(nxt.id);
      if (forward) items.push(item); else items.unshift(item);
    }
  };
  grow(true);
  if (!closed) grow(false);
  return { items, closed };
}

/** Which side (+1 left of travel / outward, −1 right / inward) of a chain a point lies on. */
export function sideOfChain(sk: Sk, chain: OffsetChain, p: XY): 1 | -1 {
  const first = chain.items[0];
  const circ = sk.circles.find((c) => c.id === first.id);
  if (circ) {
    const c = sk.points.find((q) => q.id === circ.center);
    return c && len(sub(p, c)) < circ.r ? -1 : 1;
  }
  const cv = sk.curves.find((c) => c.id === first.id);
  if (cv) return 1;
  const elems = chainElems(sk, chain);
  if (!elems) return 1;
  let best: { d: number; side: 1 | -1 } = { d: Infinity, side: 1 };
  for (const e of elems) {
    if (e.kind === 'line') {
      const ab = sub(e.b, e.a), L = len(ab) || 1, tt = Math.max(0, Math.min(1, dot(sub(p, e.a), ab) / (L * L)));
      const q = { x: e.a.x + ab.x * tt, y: e.a.y + ab.y * tt };
      const dist = len(sub(p, q));
      const n = leftNormal(unit(ab));
      const side: 1 | -1 = dot(sub(p, q), n) >= 0 ? 1 : -1;
      if (dist < best.d) best = { d: dist, side };
    } else {
      const dist = Math.abs(len(sub(p, e.c)) - e.r);
      const outward = len(sub(p, e.c)) >= e.r;
      const side: 1 | -1 = (outward ? 1 : -1) * e.dir === 1 ? 1 : -1;
      if (dist < best.d) best = { d: dist, side };
    }
  }
  return best.side;
}

/** Offset specs for a set of seed entities. */
export function specFor(sk: Sk, seeds: string[], mode: OffsetPropagation): OffsetChain[] {
  const out: OffsetChain[] = [];
  const done = new Set<string>();
  for (const id of seeds) {
    if (done.has(id)) continue;
    const ch = buildChain(sk, id, mode);
    if (!ch) continue;
    ch.items.forEach((i) => done.add(i.id));
    out.push(ch);
  }
  return out;
}

export { norm360 };
