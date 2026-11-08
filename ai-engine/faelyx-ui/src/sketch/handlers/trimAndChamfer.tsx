// Sketch & 2D: Trim and the 2D Chamfer, on lines, circles, arcs and free-form curves.
// A hook built on useSketchCore's state (assembled in handlers/index.ts).
import {
  intersectTargets, type TangentTarget,
} from '../../sketchGeometry2d';
import type { Pt, Ln, Arc, Constraint, SketchCurve } from '../types';
import { HIT_TOL } from '../constants';
import { pointToSegmentDistance, segParam, lineLineParam, lineCircleParams, angleOfPts, angleInSweep, distanceToPolyline } from '../geometry';


import type { SketchCore, EntityGeom } from '../useSketchCore';
import type { ViewAndAnnotations } from './viewAndAnnotations';
import type { SnapAndSelect } from './snapAndSelect';
import type { DrawingTools } from './drawingTools';

export function useTrimAndChamfer(core: SketchCore, prev: ViewAndAnnotations & SnapAndSelect & DrawingTools) {
  const {
    arcs, circles, constraints, curveDefiningIds, curvePoints, curves, deleteIds, lines, nextId, pointById, points, setArcs, setCircles, setConstraints, setCurves, setDimensions, setError, setLines, setPoints, setSelected, solve,
  } = core;
  const {
    asTarget, chamferCuts, chamferMode, curvePiece, findNearestPoint, isClosedPoly, polyNearestU, setChamferIssue,
  } = prev;
  // Applies the chamfer: each element is trimmed back to its cut and a
  // straight chamfer line joins the cuts. A line's end past the cut moves
  // there; an arc's end does the same; a full circle becomes the arc that
  // runs from its cut, away from the corner, to where it next meets the
  // other element. The cuts are new points, so a corner shared by both
  // elements (a rectangle's) is never dragged to one cut — that collapsed
  // the shape into a trapezium.
  const applyChamfer = (g1: EntityGeom, q1: { x: number; y: number }, g2: EntityGeom, q2: { x: number; y: number }) => {
    const res = chamferCuts(g1, q1, g2, q2);
    if (!res || !res.ok) {
      // Nothing is changed; say exactly why (shown in the bottom bar too).
      const reason = res ? res.reason : 'Chamfer works on lines, arcs, circles and curves.';
      setChamferIssue(reason); setError(reason);
      return;
    }
    setChamferIssue(null); setError(null);
    const { X } = res;
    const nextPoints = [...points];
    let nextLines = [...lines];
    let nextArcs = [...arcs];
    let nextCircles = [...circles];
    let nextConstraints = [...constraints];
    // Each cut gets a new point; the old corner point stays behind as a
    // construction point (as in CATIA) so any dimension or constraint on it
    // still means what it did, instead of dragging the cut back.
    const replacedCurves: { old: SketchCurve; piece: SketchCurve }[] = [];
    const nextPointsCoord = (id: string) => nextPoints.find((p) => p.id === id) ?? { x: NaN, y: NaN };
    // Whichever end of a spline piece sits on a cut (a real point the
    // chamfer line can join), or null for an ellipse piece.
    const pickEnd = (piece: ReturnType<typeof curvePiece>) => {
      const onCut = (id: string | null) => {
        if (!id) return false;
        const p = nextPointsCoord(id);
        return [res.cut1, res.cut2].some((c) => Math.hypot(p.x - c.x, p.y - c.y) < 1e-6);
      };
      return onCut(piece.startId) ? piece.startId : onCut(piece.endId) ? piece.endId : null;
    };
    const place = (cut: { x: number; y: number }) => {
      const fresh: Pt = { id: nextId('pt'), x: cut.x, y: cut.y };
      nextPoints.push(fresh);
      return fresh.id;
    };
    const trim = (g: EntityGeom, q: { x: number; y: number }, cut: { x: number; y: number }, other: EntityGeom): string | null => {
      if (g.kind === 'line') {
        const l = nextLines.find((ln) => ln.id === g.id)!;
        // The end that lies behind the cut (past the corner) is the one to move.
        const u = { x: q.x - X.x, y: q.y - X.y };
        const score = (p: { x: number; y: number }) => (p.x - X.x) * u.x + (p.y - X.y) * u.y;
        const moveP1 = score(g.a) <= score(g.b);
        const pid = place(cut);
        nextLines = nextLines.map((ln) => (ln.id === l.id ? (moveP1 ? { ...ln, p1: pid } : { ...ln, p2: pid }) : ln));
        return pid;
      }
      if (g.kind === 'arc') {
        const a = nextArcs.find((ar) => ar.id === g.id)!;
        const c = { x: g.cx, y: g.cy };
        const endPt = (id?: string) => nextPoints.find((p) => p.id === id);
        const P1 = endPt(a.p1), P2 = endPt(a.p2);
        const dist = (p?: { x: number; y: number }) => (p ? Math.hypot(p.x - X.x, p.y - X.y) : Infinity);
        const moveP1 = dist(P1) <= dist(P2);
        const ang = ((angleOfPts(c, cut) % 360) + 360) % 360;
        const pid = place(cut);
        nextArcs = nextArcs.map((ar) => (ar.id === a.id ? (moveP1 ? { ...ar, p1: pid, start: ang } : { ...ar, p2: pid, end: ang }) : ar));
        return pid;
      }
      if (g.kind === 'curve') {
        // Keep the part from the cut running away from the corner: to the
        // curve's end (open curve), or round to where it next meets the
        // other element (closed curve).
        const cv = curves.find((c) => c.id === g.id);
        if (!cv) return null;
        const pts = g.pts, n = pts.length - 1;
        const closed = isClosedPoly(pts);
        const uCut = polyNearestU(pts, cut), uX = polyNearestU(pts, X);
        let piece: ReturnType<typeof curvePiece>;
        if (!closed) {
          piece = uCut >= uX ? curvePiece(cv, pts, uCut, n) : curvePiece(cv, pts, 0, uCut);
        } else {
          const ot = asTarget(other);
          const stops = ot ? intersectTargets({ kind: 'poly', pts }, ot).map((p) => polyNearestU(pts, p)).filter((u) => Math.abs(u - uX) > 1e-4) : [];
          const away = (((uCut - uX) % n) + n) % n < n / 2 ? 1 : -1;
          const along = (u: number) => (away > 0 ? (((u - uCut) % n) + n) % n : (((uCut - u) % n) + n) % n);
          const stop = stops.length ? stops.reduce((m, u) => (along(u) < along(m) ? u : m)) : uX;
          piece = away > 0 ? curvePiece(cv, pts, uCut, stop) : curvePiece(cv, pts, stop, uCut);
        }
        replacedCurves.push({ old: cv, piece: piece.curve });
        nextPoints.push(...piece.newPoints);
        // A spline piece ends on a real point at the cut — join the chamfer there.
        const joinId = pickEnd(piece);
        if (joinId) return joinId;
        const cutPt: Pt = { id: nextId('pt'), x: cut.x, y: cut.y };
        nextPoints.push(cutPt);
        return cutPt.id;
      }
      if (g.kind === 'circle') {
        const c = { x: g.cx, y: g.cy };
        const norm = (d: number) => ((d % 360) + 360) % 360;
        const aCut = norm(angleOfPts(c, cut)), aX = norm(angleOfPts(c, X));
        const ot = asTarget(other);
        const others = ot ? intersectTargets({ kind: 'circle', cx: c.x, cy: c.y, r: g.r }, ot).map((p) => norm(angleOfPts(c, p))).filter((v) => Math.abs(v - aX) > 1e-4) : [];
        // Walk from the cut away from X to the next meeting with the other element.
        const awayIncreasing = !angleInSweep(aX, aCut, norm(aCut + 180));
        const along = (v: number) => (awayIncreasing ? norm(v - aCut) : norm(aCut - v));
        const stop = others.length ? others.reduce((m, v) => (along(v) < along(m) ? v : m)) : aX;
        const cutPt: Pt = { id: nextId('pt'), x: cut.x, y: cut.y };
        nextPoints.push(cutPt);
        const circ = nextCircles.find((cc) => cc.id === g.id)!;
        nextCircles = nextCircles.filter((cc) => cc.id !== g.id);
        nextConstraints = nextConstraints.filter((con) => !Object.values(con.args).includes(g.id));
        nextArcs.push(awayIncreasing
          ? { id: nextId('arc'), center: circ.center, r: g.r, start: aCut, end: stop, p1: cutPt.id }
          : { id: nextId('arc'), center: circ.center, r: g.r, start: stop, end: aCut, p2: cutPt.id });
        return cutPt.id;
      }
      return null;
    };
    const id1 = trim(g1, q1, res.cut1, g2);
    const id2 = trim(g2, q2, res.cut2, g1);
    if (!id1 || !id2) return;
    const chamferId = nextId('ln');
    nextLines = [...nextLines, { id: chamferId, p1: id1, p2: id2 }];
    // Line–line chamfer: a local parametric feature anchored on the corner
    // it cuts off. The corner point stays on both (now trimmed) parent
    // lines — their virtual intersection — and each cut sits a set
    // distance from it along its own parent line. Editing the chamfer only
    // changes those distances (see chamferInfo/applyChamferValues in
    // useSketchCore), so the cuts slide along the parents' own directions
    // and nothing else in the sketch — the parents' angles, the polygon's
    // other dimensions — is touched. Tagged with `chamfer`/`role` so the
    // chamfer can be found again; deleting the chamfer line drops them.
    const lineLine = g1.kind === 'line' && g2.kind === 'line';
    if (lineLine) {
      let corner = nextPoints.find((p) => Math.hypot(p.x - X.x, p.y - X.y) < 1e-6);
      if (!corner) { corner = { id: nextId('pt'), x: X.x, y: X.y }; nextPoints.push(corner); }
      const d1 = Math.hypot(res.cut1.x - X.x, res.cut1.y - X.y), d2 = Math.hypot(res.cut2.x - X.x, res.cut2.y - X.y);
      const tag = { chamfer: chamferId };
      nextConstraints = [
        ...nextConstraints,
        { id: nextId('c'), type: 'point_line_distance', args: { point: corner.id, line: g1.id, value: 0, ...tag, role: 'on1' }, label: `Chamfer corner on ${g1.id}` },
        { id: nextId('c'), type: 'point_line_distance', args: { point: corner.id, line: g2.id, value: 0, ...tag, role: 'on2' }, label: `Chamfer corner on ${g2.id}` },
        { id: nextId('c'), type: 'distance', args: { p1: corner.id, p2: id1, value: d1, ...tag, role: 'd1' }, label: `Chamfer distance A = ${d1.toFixed(2)}mm` },
        // Two lengths: B is its own parameter. Length + angle / hypotenuse:
        // the angle constraint below is the second parameter instead.
        ...(chamferMode === 'lengths' ? [{ id: nextId('c'), type: 'distance', args: { p1: corner.id, p2: id2, value: d2, ...tag, role: 'd2' }, label: `Chamfer distance B = ${d2.toFixed(2)}mm` }] : []),
      ];
    }
    // Show (and hold) the chamfer's angle to the first element, as CATIA
    // does: a real angle constraint plus its dimension on the canvas.
    // Only for a straight first element — an angle to a curve has no
    // single fixed reference direction. A two-lengths line–line chamfer
    // shows the angle as a dimension only (A and B already define it).
    if (g1.kind === 'line') {
      const dA = { x: res.X.x - res.cut1.x, y: res.X.y - res.cut1.y };
      const dC = { x: res.cut2.x - res.cut1.x, y: res.cut2.y - res.cut1.y };
      const l1 = nextLines.find((l) => l.id === g1.id);
      const p1 = l1 && nextPoints.find((p) => p.id === l1.p1), p2 = l1 && nextPoints.find((p) => p.id === l1.p2);
      if (l1 && p1 && p2) {
        // Same convention as the solver's angle constraint: from line1's
        // own direction (p1→p2) to the chamfer's, folded to [0, 180).
        const d1 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const deg = (Math.atan2(d1.x * dC.y - d1.y * dC.x, d1.x * dC.x + d1.y * dC.y) * 180) / Math.PI;
        const value = ((deg % 180) + 180) % 180;
        const shown = (Math.acos(Math.max(-1, Math.min(1, (dA.x * dC.x + dA.y * dC.y) / ((Math.hypot(dA.x, dA.y) * Math.hypot(dC.x, dC.y)) || 1)))) * 180) / Math.PI;
        if (!(lineLine && chamferMode === 'lengths')) {
          nextConstraints = [...nextConstraints, { id: nextId('c'), type: 'angle', args: { line1: g1.id, line2: chamferId, value }, label: `Chamfer angle: ${g1.id}, ${chamferId} = ${shown.toFixed(1)}°` }];
        }
        // Aim the dimension into the cut-off corner (between the direction
        // back to the old corner and the chamfer line), so it reads the
        // chamfer's own angle rather than its 180° supplement.
        const ua = Math.hypot(dA.x, dA.y) || 1, uc = Math.hypot(dC.x, dC.y) || 1;
        const pointer = Math.atan2(dA.y / ua + dC.y / uc, dA.x / ua + dC.x / uc);
        setDimensions((prev) => [...prev, { id: `dim_pair_${g1.id}_${chamferId}_${Date.now()}`, kind: 'pair', entityIdA: g1.id, entityIdB: chamferId, offset: 16, angle: pointer }]);
      }
    }
    let nextCurves = curves;
    for (const { old, piece } of replacedCurves) nextCurves = [...nextCurves.filter((c) => c.id !== old.id), piece];
    // A replaced spline's old control points are no longer used by anything.
    if (replacedCurves.length) {
      const used = new Set<string>([
        ...nextLines.flatMap((l) => [l.p1, l.p2]), ...nextCircles.map((c) => c.center),
        ...nextArcs.flatMap((a) => [a.center, a.p1 ?? '', a.p2 ?? '']), ...nextCurves.flatMap((c) => curveDefiningIds(c)),
      ]);
      const orphan = new Set(replacedCurves.flatMap(({ old }) => curveDefiningIds(old)).filter((id) => !used.has(id)));
      for (let i = nextPoints.length - 1; i >= 0; i--) if (orphan.has(nextPoints[i].id)) nextPoints.splice(i, 1);
      nextConstraints = nextConstraints.filter((c) => !Object.values(c.args).some((v) => typeof v === 'string' && (orphan.has(v) || replacedCurves.some(({ old }) => old.id === v))));
    }
    setPoints(nextPoints); setLines(nextLines); setArcs(nextArcs); setCircles(nextCircles); setConstraints(nextConstraints);
    if (replacedCurves.length) setCurves(nextCurves);
    setSelected([]);
    void solve(nextPoints, nextLines, nextCircles, nextConstraints);
  };

  // Trim: click a line, circle or arc and the piece nearest the click —
  // between the two intersections that bracket it — is removed. Every
  // crossing with every other line, circle, arc or curve is a candidate
  // cut. A line keeps what's left on either side as new lines; a circle
  // becomes the arc that remains; an arc splits into the arcs that remain.
  // An element with nothing bracketing the click is removed whole.
  const trimAt = (x: number, y: number) => {
    let bestLine: Ln | null = null; let bestLineD = HIT_TOL;
    for (const l of lines) {
      const a = pointById.get(l.p1); const b = pointById.get(l.p2);
      if (!a || !b) continue;
      const d = pointToSegmentDistance(x, y, a, b);
      if (d < bestLineD) { bestLineD = d; bestLine = l; }
    }
    if (bestLine) { trimLine(bestLine, x, y); return; }

    let bestCircleId: string | null = null; let bestCircleD = HIT_TOL;
    for (const c of circles) {
      const ctr = pointById.get(c.center);
      if (!ctr) continue;
      const d = Math.abs(Math.hypot(ctr.x - x, ctr.y - y) - c.r);
      if (d < bestCircleD) { bestCircleD = d; bestCircleId = c.id; }
    }
    if (bestCircleId) { trimRound(bestCircleId, x, y); return; }

    let bestArcId: string | null = null; let bestArcD = HIT_TOL;
    for (const a of arcs) {
      const ctr = pointById.get(a.center);
      if (!ctr) continue;
      if (!angleInSweep(angleOfPts(ctr, { x, y }), a.start, a.end)) continue;
      const d = Math.abs(Math.hypot(ctr.x - x, ctr.y - y) - a.r);
      if (d < bestArcD) { bestArcD = d; bestArcId = a.id; }
    }
    if (bestArcId) { trimRound(bestArcId, x, y); return; }

    let bestCurve: SketchCurve | null = null; let bestCurveD = HIT_TOL;
    for (const cv of curves) {
      const d = distanceToPolyline(x, y, curvePoints(cv));
      if (d < bestCurveD) { bestCurveD = d; bestCurve = cv; }
    }
    if (bestCurve) trimCurve(bestCurve, x, y);
  };

  // Every angle (SVG convention, 0-360) where the circle (cx, cy, r) is
  // crossed by another line segment, circle, arc or curve.
  const crossingAngles = (cx: number, cy: number, r: number, ownId: string) => {
    const me: TangentTarget = { kind: 'circle', cx, cy, r };
    const found: { x: number; y: number }[] = [];
    for (const l of lines) {
      if (l.style === 'infinite') {
        const a = pointById.get(l.p1), b = pointById.get(l.p2);
        if (a && b) found.push(...intersectTargets(me, { kind: 'line', a, b }));
        continue;
      }
      const a = pointById.get(l.p1), b = pointById.get(l.p2);
      if (!a || !b) continue;
      for (const q of intersectTargets(me, { kind: 'line', a, b })) {
        // Only where the segment itself (not its extension) crosses.
        const t = ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1);
        if (t >= -1e-6 && t <= 1 + 1e-6) found.push(q);
      }
    }
    for (const c of circles) {
      if (c.id === ownId) continue;
      const ctr = pointById.get(c.center);
      if (ctr) found.push(...intersectTargets(me, { kind: 'circle', cx: ctr.x, cy: ctr.y, r: c.r }));
    }
    for (const a of arcs) {
      if (a.id === ownId) continue;
      const ctr = pointById.get(a.center);
      if (!ctr) continue;
      for (const q of intersectTargets(me, { kind: 'circle', cx: ctr.x, cy: ctr.y, r: a.r })) {
        if (angleInSweep(angleOfPts(ctr, q), a.start, a.end)) found.push(q);
      }
    }
    for (const cv of curves) found.push(...intersectTargets(me, { kind: 'poly', pts: curvePoints(cv) }));
    const norm = (d: number) => ((d % 360) + 360) % 360;
    return found.map((q) => norm(angleOfPts({ x: cx, y: cy }, q)));
  };

  // Every u where the curve is crossed by another element (line segments,
  // circles, arcs within their sweep, other curves).
  const curveCrossingsU = (cv: SketchCurve, pts: { x: number; y: number }[]) => {
    const targets: { t: TangentTarget; ok: (q: { x: number; y: number }) => boolean }[] = [];
    for (const l of lines) {
      const a = pointById.get(l.p1), b = pointById.get(l.p2);
      if (!a || !b) continue;
      const infinite = l.style === 'infinite';
      targets.push({ t: { kind: 'line', a, b }, ok: (q) => {
        if (infinite) return true;
        const tt = ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1);
        return tt >= -1e-6 && tt <= 1 + 1e-6;
      } });
    }
    for (const c of circles) { const ctr = pointById.get(c.center); if (ctr) targets.push({ t: { kind: 'circle', cx: ctr.x, cy: ctr.y, r: c.r }, ok: () => true }); }
    for (const a of arcs) {
      const ctr = pointById.get(a.center);
      if (ctr) targets.push({ t: { kind: 'circle', cx: ctr.x, cy: ctr.y, r: a.r }, ok: (q) => angleInSweep(angleOfPts(ctr, q), a.start, a.end) });
    }
    for (const other of curves) if (other.id !== cv.id) { const op = curvePoints(other); targets.push({ t: { kind: 'poly', pts: op }, ok: () => true }); }
    const us: number[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], B = pts[i + 1], dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
      if (l2 < 1e-18) continue;
      for (const { t, ok } of targets) {
        for (const q of intersectTargets({ kind: 'line', a: A, b: B }, t)) {
          const tt = ((q.x - A.x) * dx + (q.y - A.y) * dy) / l2;
          if (tt >= -1e-9 && tt <= 1 + 1e-9 && ok(q)) us.push(i + Math.max(0, Math.min(1, tt)));
        }
      }
    }
    return [...new Set(us.map((u) => Math.round(u * 1e6) / 1e6))].sort((m, n) => m - n);
  };

  // Removes a curve, plus its defining points no other element uses (and
  // any constraint on them or on the curve).
  const withoutCurve = (cv: SketchCurve, keepCurves: SketchCurve[]) => {
    const used = new Set<string>([
      ...lines.flatMap((l) => [l.p1, l.p2]), ...circles.map((c) => c.center),
      ...arcs.flatMap((a) => [a.center, a.p1 ?? '', a.p2 ?? '']),
      ...keepCurves.filter((o) => o.id !== cv.id).flatMap((o) => curveDefiningIds(o)),
    ]);
    const orphan = new Set(curveDefiningIds(cv).filter((id) => !used.has(id)));
    return {
      points: points.filter((p) => !orphan.has(p.id)),
      constraints: constraints.filter((c) => !Object.values(c.args).some((v) => v === cv.id || (typeof v === 'string' && orphan.has(v)))),
    };
  };

  // Trim on a free-form curve, the same way as on a circle/arc: remove the
  // piece between the crossings that bracket the click.
  const trimCurve = (cv: SketchCurve, x: number, y: number) => {
    const pts = curvePoints(cv);
    if (pts.length < 2) return;
    const n = pts.length - 1;
    const closed = isClosedPoly(pts);
    const uc = polyNearestU(pts, { x, y });
    const cuts = curveCrossingsU(cv, pts).filter((u) => !closed || u < n - 1e-6);
    const pieces: [number, number][] = [];
    if (closed) {
      if (cuts.length < 2) { deleteIds([cv.id]); return; }
      const after = (u: number) => (((u - uc) % n) + n) % n;
      const hi = cuts.reduce((m, u) => (after(u) < after(m) ? u : m));
      const lo = cuts.reduce((m, u) => (after(u) > after(m) ? u : m));
      pieces.push([hi, lo]);
    } else {
      const lo = Math.max(0, ...cuts.filter((u) => u <= uc && u > 1e-6));
      const hi = Math.min(n, ...cuts.filter((u) => u >= uc && u < n - 1e-6));
      if (lo <= 1e-6 && hi >= n - 1e-6) { deleteIds([cv.id]); return; }
      if (lo > 1e-6) pieces.push([0, lo]);
      if (hi < n - 1e-6) pieces.push([hi, n]);
    }
    const made = pieces.map(([a, b]) => curvePiece(cv, pts, a, b));
    // The pieces may reuse the old curve's points (an elliptical arc keeps
    // its center), so those must survive the clean-up.
    const rest = withoutCurve(cv, [...curves.filter((c) => c.id !== cv.id), ...made.map((m) => m.curve)]);
    setPoints([...rest.points, ...made.flatMap((m) => m.newPoints)]);
    setConstraints(rest.constraints);
    setCurves((cs) => [...cs.filter((c) => c.id !== cv.id), ...made.map((m) => m.curve)]);
    setSelected([]);
  };

  // Trim on a circle or arc: remove the piece between the crossings that
  // bracket the click; what remains becomes arc(s) whose ends are real
  // points (the arc-endpoint sync attaches them, reusing a line's end if
  // one sits there). Constraints on the trimmed element are dropped — the
  // element they described no longer exists as it was.
  const trimRound = (id: string, x: number, y: number) => {
    const circle = circles.find((c) => c.id === id);
    const arc = arcs.find((a) => a.id === id);
    const centerId = circle?.center ?? arc?.center;
    const ctr = (centerId ? pointById.get(centerId) : undefined);
    if (!ctr || (!circle && !arc)) return;
    const r = circle ? circle.r : arc!.r;
    const norm = (d: number) => ((d % 360) + 360) % 360;
    const click = norm(angleOfPts(ctr, { x, y }));
    const cuts = [...new Set(crossingAngles(ctr.x, ctr.y, r, id).map((a) => Math.round(a * 1e6) / 1e6))];
    const dropConstraints = (list: Constraint[]) => list.filter((c) => !Object.values(c.args).includes(id));
    if (circle) {
      if (cuts.length < 2) { deleteIds([id]); return; }
      // Nearest crossings before (lo) and after (hi) the click, going round.
      const after = (a: number) => norm(a - click);
      const hi = cuts.reduce((m, a) => (after(a) < after(m) ? a : m));
      const lo = cuts.reduce((m, a) => (after(a) > after(m) ? a : m));
      setCircles((cs) => cs.filter((c) => c.id !== id));
      setConstraints((cs) => dropConstraints(cs));
      setArcs((as) => [...as, { id: nextId('arc'), center: circle.center, r, start: hi, end: lo }]);
      setSelected([]);
      return;
    }
    const a = arc!;
    const sweep = norm(a.end - a.start) || 360;
    const rel = (ang: number) => norm(ang - a.start);
    const u = rel(click);
    const inside = cuts.map(rel).filter((v) => v > 1e-6 && v < sweep - 1e-6);
    const lo = Math.max(0, ...inside.filter((v) => v <= u));
    const hi = Math.min(sweep, ...inside.filter((v) => v >= u));
    if (lo <= 1e-6 && hi >= sweep - 1e-6) { deleteIds([id]); return; }
    const pieces: Arc[] = [];
    if (lo > 1e-6) pieces.push({ id: nextId('arc'), center: a.center, r, start: a.start, end: norm(a.start + lo), p1: a.p1 });
    if (hi < sweep - 1e-6) pieces.push({ id: nextId('arc'), center: a.center, r, start: norm(a.start + hi), end: a.end, p2: a.p2 });
    setArcs((as) => [...as.filter((x2) => x2.id !== id), ...pieces]);
    setConstraints((cs) => dropConstraints(cs));
    setSelected([]);
  };

  const trimLine = (line: Ln, x: number, y: number) => {
    const a = pointById.get(line.p1); const b = pointById.get(line.p2);
    if (!a || !b) return;

    const params = new Set<number>();
    for (const other of lines) {
      if (other.id === line.id) continue;
      const oa = pointById.get(other.p1); const ob = pointById.get(other.p2);
      if (!oa || !ob) continue;
      const t = lineLineParam(a, b, oa, ob);
      if (t !== null) params.add(t);
    }
    for (const c of circles) {
      const ctr = pointById.get(c.center);
      if (!ctr) continue;
      for (const t of lineCircleParams(a, b, ctr, c.r)) params.add(t);
    }
    for (const arc of arcs) {
      const ctr = pointById.get(arc.center);
      if (!ctr) continue;
      for (const t of lineCircleParams(a, b, ctr, arc.r)) {
        const px = a.x + t * (b.x - a.x), py = a.y + t * (b.y - a.y);
        if (angleInSweep(angleOfPts(ctr, { x: px, y: py }), arc.start, arc.end)) params.add(t);
      }
    }

    for (const cv of curves) {
      for (const q of intersectTargets({ kind: 'line', a, b }, { kind: 'poly', pts: curvePoints(cv) })) {
        const t = ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1);
        if (t > 1e-6 && t < 1 - 1e-6) params.add(t);
      }
    }
    const sorted = Array.from(params).sort((p, q) => p - q).filter((t, i, arr) => i === 0 || t - arr[i - 1] > 1e-4);
    const tClick = segParam(a, b, { x, y });
    let lo = 0, hi = 1;
    for (const t of sorted) { if (t <= tClick + 1e-6) lo = t; }
    for (const t of sorted) { if (t >= tClick - 1e-6) { hi = t; break; } }

    // Nothing straddling the click on both sides (no crossings at all, or
    // the click landed past the outermost one) — there's no bounded
    // segment left to keep, so — matching real CAD trim on an isolated
    // edge — the whole line goes.
    if (lo >= hi - 1e-4 || (lo <= 1e-4 && hi >= 1 - 1e-4)) { deleteIds([line.id]); return; }

    const addedPoints: Pt[] = [];
    const pointAt = (t: number): string => {
      const px = a.x + t * (b.x - a.x), py = a.y + t * (b.y - a.y);
      const existing = findNearestPoint(px, py) ?? addedPoints.find((p) => Math.hypot(p.x - px, p.y - py) < HIT_TOL) ?? null;
      if (existing) return existing.id;
      const id = nextId('pt');
      addedPoints.push({ id, x: px, y: py });
      return id;
    };

    const newLines: Ln[] = [];
    if (lo > 1e-4) newLines.push({ id: nextId('ln'), p1: line.p1, p2: pointAt(lo) });
    if (hi < 1 - 1e-4) newLines.push({ id: nextId('ln'), p1: pointAt(hi), p2: line.p2 });

    const nextPoints = [...points, ...addedPoints];
    const nextLines = lines.filter((l) => l.id !== line.id).concat(newLines);
    const nextConstraints = constraints.filter((c) => !Object.values(c.args).some((v) => v === line.id));
    setPoints(nextPoints);
    setLines(nextLines);
    setConstraints(nextConstraints);
    setSelected([]);
    void solve(nextPoints, nextLines, circles, nextConstraints);
  };
  return {
    applyChamfer, curveCrossingsU, withoutCurve, trimCurve, crossingAngles, trimRound, trimLine, trimAt,
  };
}

export type TrimAndChamfer = ReturnType<typeof useTrimAndChamfer>;
