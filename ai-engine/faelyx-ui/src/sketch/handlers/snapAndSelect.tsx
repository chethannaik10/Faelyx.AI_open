// Sketch & 2D: snapping and inference, picking and selection, measure readouts, and the on-canvas selection previews.
// A hook built on useSketchCore's state (assembled in handlers/index.ts).
import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../../config';
import type { Pt, Ln, Circ, Arc, Constraint, Dimension } from '../types';
import { HIT_TOL, HV_SNAP_DEG, ALIGN_TOL, LINE_SNAP_TOL, MIDPOINT_SNAP_TOL, CURVE_SNAP_TOL, ORIGIN_GUIDE_FACTOR } from '../constants';
import { findCurveSnap, CURVE_MAGNET_TOOLS, axisTargets, reflectedSketchTargets, referenceOnPlane, nearestRefPoint, type SnapTarget, type CurveSnap, type CurveSnapKind, type RefPoint } from '../snapCurves';
import { pointToSegmentDistance, segParam, angleOfPts, angleInSweep, distanceToPolyline, infiniteLineEndpoints } from '../geometry';


import type { SketchCore, EntityGeom, PreviewDragTarget } from '../useSketchCore';
import type { ViewAndAnnotations } from './viewAndAnnotations';
import { DimensionLabel } from '../views/DimensionLabel';

/** What a snap lookup found: where, and why (a stored point, an H/V lock, a midpoint, a guide, a spot on a line, or on a curve / crossing / quadrant). */
export type SnapResolved = {
  x: number; y: number; pointId: string | null; axis: 'h' | 'v' | null; guideH: Pt | null; guideV: Pt | null; onLine: boolean; midpoint: boolean;
  arcPoint?: boolean; onCurve?: boolean; curveKind?: CurveSnapKind; /** a reference point (vertex-like) */ refPoint?: boolean; /** what the snap found, shown beside the cursor */ label?: string; tangentTo?: { id: string; kind: 'circle' | 'arc' | 'curve' } | null;
  /** locked onto the plane's origin (0, 0) */ origin?: boolean; /** the line being drawn would be centred on the origin (its midpoint is (0, 0)) */ originMid?: boolean;
};

export function useSnapAndSelect(core: SketchCore, prev: ViewAndAnnotations) {
  const {
    ORIGIN_ARM, REF_HDIR, REF_ORIGIN, REF_VDIR, SKETCH_ORIGIN, arcs, circles, commitPointDistance, computePairMeasure, constraints, curveDefiningIds, curvePoints, curves, describeSolveError, dimensions, dragModeRef, draggingPreviewCircleRef, draggingPreviewLabelRef, draggingPreviewRef, editIsAngleRef, entitiesAttached, geomById, importing, latestPreviewOverrideRef, lines, nextId, pinPoint, pointById, pointIdsForEntity, points, previewDragMovedRef, previewDragTargetRef, previewEditValue, previewOverrides, promotePairDimension, samePair, selected, selectedDimId, selectedSingleId, setCircles, setConstraints, setDof, setError, setImporting, setIsDraggingPreview, setIsDraggingPreviewCircle, setIsDraggingPreviewLabel, setLines, setPoints, setPreviewEditValue, setSelected, setSelectedDimId, setStatus, snapEnabled, solve, swapSpace, toU, tool, unitMm, upsertInList, viewBox, DEFAULT_VIEW_BOX, reflected, referenceGeometry, supportFrame, svgRef, originSnapPx, originAutoConstrain, lineSymToggle,
  } = core;
  const {
    addPointExact, arrowhead, dimEditProps, READ_ONLY_EDIT, editArc, findLineMidpoint, findNearestPoint, gridStepX, gridStepY, importSummary, isShown, lenNum, renderPairDimension, setImportError, setImportSummary, startDimDrag, startLabelDrag, upsertConstraint, upsertDimension,
  } = prev;
  const renderDimension = (dim: Dimension) => {
    // A persisted pair measurement — see renderPairDimension near
    // computePairMeasure below, which this delegates to since it needs
    // entityIdA/entityIdB and computePairMeasure, not a single entityId.
    if (dim.kind === 'pair') return renderPairDimension(dim);
    const g = geomById(dim.entityId!);
    if (!g) return null;
    const ARROW = 2.5, EXT_GAP = 2.5, EXT_PAST = 2.5;

    // The Point flyout's auto-dimension (see commitPointDimension) — only
    // ever a named constraint badge now (Bisecting/Mid Point's
    // "Midpoint"), never a raw coordinate callout: the "clean canvas, no
    // coordinate text overlays" requirement means Points by Coordinates,
    // Points on Curve and Divided Points rely on addSegmentDimension's
    // real length dimensions instead (see its call sites) rather than a
    // second, redundant X/Y-from-origin readout. commitPointDimension
    // itself is a no-op without a label, so there's nothing to render here
    // when one wasn't given.
    if (dim.kind === 'point' && g.kind === 'point') {
      if (!dim.label) return null;
      const isSelected = selected.includes(dim.entityId!);
      return (
        <g key={dim.id} className={`dim-annotation point-dim ${isSelected ? 'dim-selected' : ''}`}>
          <text x={g.x} y={g.y - 5} textAnchor="middle" className="point-dim-badge">{dim.label}</text>
        </g>
      );
    }

    if (dim.kind === 'line' && g.kind === 'line') {
      const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return null;
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;
      const off = dim.offset;
      const sign = off < 0 ? -1 : 1;
      const a2 = { x: g.a.x + nx * off, y: g.a.y + ny * off };
      const b2 = { x: g.b.x + nx * off, y: g.b.y + ny * off };
      const extA1 = { x: g.a.x + nx * EXT_GAP * sign, y: g.a.y + ny * EXT_GAP * sign };
      const extA2 = { x: g.a.x + nx * (Math.abs(off) + EXT_PAST) * sign, y: g.a.y + ny * (Math.abs(off) + EXT_PAST) * sign };
      const extB1 = { x: g.b.x + nx * EXT_GAP * sign, y: g.b.y + ny * EXT_GAP * sign };
      const extB2 = { x: g.b.x + nx * (Math.abs(off) + EXT_PAST) * sign, y: g.b.y + ny * (Math.abs(off) + EXT_PAST) * sign };
      const isSelected = !!dim.entityId && selected.includes(dim.entityId);
      const isFocused = selectedDimId === dim.id;
      // Where the label actually sits — dragged anywhere from the dimension
      // line's own start (t=0) to its far end (t=1), defaulting to the
      // middle exactly like before a label's ever been dragged.
      const t = dim.labelT ?? 0.5;
      const lx = a2.x + (b2.x - a2.x) * t, ly = a2.y + (b2.y - a2.y) * t;
      return (
        <g key={dim.id} className={`dim-annotation ${isSelected ? 'dim-selected' : ''} ${isFocused ? 'dim-focused' : ''}`}>
          <line x1={extA1.x} y1={extA1.y} x2={extA2.x} y2={extA2.y} className="dim-ext-line" />
          <line x1={extB1.x} y1={extB1.y} x2={extB2.x} y2={extB2.y} className="dim-ext-line" />
          <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} className="dim-line" />
          {arrowhead(a2, { x: ux, y: uy }, ARROW)}
          {arrowhead(b2, { x: -ux, y: -uy }, ARROW)}
          {/* Always upright, never rotated to match the line — same reason
              renderPairDimension (point-to-point measurements) never
              rotates its label either: a sideways "read tilt your head"
              number for any vertical/steep edge was the actual "very
              ugly" complaint, not a sizing bug in DimensionLabel's own
              chip-fit math (that part measures correctly either way). */}
          <DimensionLabel
            x={lx} y={ly} dy={-3} textAnchor="middle"
            className="dim-label" seed={toU(len).toFixed(2)} {...dimEditProps(dim, false)}
            onMouseDown={(evt) => startLabelDrag(evt, dim.id)}
            onClick={(evt) => { evt.stopPropagation(); setSelectedDimId(dim.id); }}
          >{toU(len).toFixed(2)}</DimensionLabel>
          <line
            x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} className="dim-hit"
            onMouseDown={(evt) => startDimDrag(evt, dim.id)}
            onClick={(evt) => { evt.stopPropagation(); setSelectedDimId(dim.id); }}
          />
        </g>
      );
    }

    if ((dim.kind === 'circle' || dim.kind === 'arc') && (g.kind === 'circle' || g.kind === 'arc')) {
      const angle = dim.angle ?? -Math.PI / 4;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const edge = { x: g.cx + g.r * cos, y: g.cy + g.r * sin };
      const tip = { x: g.cx + (g.r + dim.offset) * cos, y: g.cy + (g.r + dim.offset) * sin };
      const isSelected = !!dim.entityId && selected.includes(dim.entityId);
      const textAnchor = cos >= 0 ? 'start' : 'end';
      const t = dim.labelT ?? 1;
      const lx = edge.x + (tip.x - edge.x) * t + cos * 4, ly = edge.y + (tip.y - edge.y) * t + sin * 4;
      // A full circle reads by its Diameter by default (the CAD-standard
      // callout, "⌀"/D + the across-the-whole-circle size) — an Arc, which
      // has no "across" to measure, keeps reading by Radius. Either way the
      // dimension still just drives the real, single radius value
      // underneath (see commitDimensionEdit): a circle's typed number is
      // halved back into a radius before it's applied.
      const isCircle = dim.kind === 'circle';
      const displayValue = toU(isCircle ? g.r * 2 : g.r).toFixed(2);
      const prefix = isCircle ? 'D' : 'R';
      const isFocused = selectedDimId === dim.id;
      // A Diameter reads as one straight line spanning the whole circle
      // through its center — starting at the rim on the far side, crossing
      // the center, and continuing out through the near rim (edge) to the
      // label (tip) — the standard CAD diameter callout, not just a leader
      // poking out from one edge. A Radius (arcs have no "across" to span)
      // instead starts right at the center and reads straight out to the arc.
      const lineStart = isCircle ? { x: g.cx - g.r * cos, y: g.cy - g.r * sin } : { x: g.cx, y: g.cy };
      return (
        <g key={dim.id} className={`dim-annotation ${isSelected ? 'dim-selected' : ''} ${isFocused ? 'dim-focused' : ''}`}>
          <line x1={lineStart.x} y1={lineStart.y} x2={tip.x} y2={tip.y} className="dim-line" />
          {arrowhead(edge, { x: -cos, y: -sin }, ARROW)}
          <DimensionLabel
            x={lx} y={ly} dy={3} textAnchor={textAnchor}
            className="dim-label" seed={displayValue} {...dimEditProps(dim, false)}
            onMouseDown={(evt) => startLabelDrag(evt, dim.id)}
            onClick={(evt) => { evt.stopPropagation(); setSelectedDimId(dim.id); }}
          >{prefix}{displayValue}</DimensionLabel>
          <line
            x1={lineStart.x} y1={lineStart.y} x2={tip.x} y2={tip.y} className="dim-hit"
            onMouseDown={(evt) => startDimDrag(evt, dim.id)}
            onClick={(evt) => { evt.stopPropagation(); setSelectedDimId(dim.id); }}
          />
        </g>
      );
    }
    return null;
  };

  // Snap to Grid: every *new* point placed on the canvas goes through here,
  // so this one spot is what "Snap: ON" actually means for the whole tool
  // set — every draw tool eventually calls addPoint for whichever
  // coordinate isn't reused from an existing entity. Picking/hit-testing
  // (findNearestPoint, pickEntityAt) deliberately stays on the raw,
  // unsnapped cursor position below, so Select/Trim/Measure and snapping
  // onto an existing (possibly off-grid) point keep working exactly as
  // before — only where a point doesn't already exist does this land it
  // exactly on a grid intersection instead of wherever the mouse happened
  // to be.
  // Snap to Point: the nearest intersection of graduation lines, counted
  // from the sketch origin so the grid always passes through it.
  // The plane's centre origin (0, 0) always attracts the cursor, even with Snap off: it is the same
  // point on Front / Top / Right and on every Reference Plane, since a sketch is always drawn in plane-local coordinates.
  // The reach is a screen distance (Sketcher options > Centre snap distance, 10 px by default), converted with the current zoom so it feels the
  // same zoomed in or out. Everything below works in the sketch's own plane coordinates, whose (0, 0) is SKETCH_ORIGIN on Front / Top / Right
  // and on every Reference Plane alike — so the same test is the "distance to the local origin of the active plane".
  const unitsPerPx = () => {
    const ctm = svgRef.current?.getScreenCTM();
    const k = ctm ? Math.hypot(ctm.a, ctm.b) : 0;
    return k > 1e-9 ? 1 / k : viewBox.w / 800;
  };
  const originTol = () => (originSnapPx > 0 ? originSnapPx * unitsPerPx() : 0);
  const nearOrigin = (x: number, y: number) => !swapSpace && originSnapPx > 0 && Math.hypot(x - SKETCH_ORIGIN.x, y - SKETCH_ORIGIN.y) < originTol();
  /** the H / V crosshair: 'locked' once within snap reach of (0, 0), 'near' while approaching it */
  const originGuideAt = (x: number, y: number): 'near' | 'locked' | null => {
    if (swapSpace || originSnapPx <= 0) return null;
    const d = Math.hypot(x - SKETCH_ORIGIN.x, y - SKETCH_ORIGIN.y), t = originTol();
    return d < t ? 'locked' : d < t * ORIGIN_GUIDE_FACTOR ? 'near' : null;
  };
  const [originGuide, setOriginGuide] = useState<'near' | 'locked' | null>(null);
  const showOriginGuide = (g: 'near' | 'locked' | null) => setOriginGuide((prevG) => (prevG === g ? prevG : g));
  /** a stored point already sitting exactly on the origin, to reuse instead of stacking a second one there */
  const originPointId = (): string | null => points.find((p) => Math.hypot(p.x - SKETCH_ORIGIN.x, p.y - SKETCH_ORIGIN.y) < 1e-6)?.id ?? null;

  // Persistent lock: a point that was snapped onto the origin gets a Coincident constraint to the Origin, and a line snapped so its midpoint is
  // the origin gets a Midpoint constraint on it — so the geometry stays centred after any later edit. Tools call markOrigin / markOriginMid when
  // they create (or drag) such a point or line; the constraints are added once the new geometry has landed in state (a tool sets its own
  // constraint list in the same handler, so adding ours from here, a render later, never gets overwritten).
  const originPendingRef = useRef<Set<string>>(new Set());
  const originMidPendingRef = useRef<Set<string>>(new Set());
  const markOrigin = (id: string) => { if (originAutoConstrain) originPendingRef.current.add(id); };
  const markOriginMid = (lineId: string) => { if (originAutoConstrain) originMidPendingRef.current.add(lineId); };
  const applyOriginLocks = (): boolean => {
    const pend = originPendingRef.current, pendMid = originMidPendingRef.current;
    if (!pend.size && !pendMid.size) return false;
    const O = SKETCH_ORIGIN;
    const add: Constraint[] = [];
    const lockedPt = (id: string) => constraints.some((c) => (c.type === 'coincident' && ((c.args.p1 === id && c.args.p2 === REF_ORIGIN) || (c.args.p2 === id && c.args.p1 === REF_ORIGIN))) || (c.type === 'fixed' && c.args.point === id));
    for (const id of [...pend]) {
      const pt = pointById.get(id);
      if (!pt) continue;                       // not in state yet — try again after the next update
      pend.delete(id);
      if (Math.hypot(pt.x - O.x, pt.y - O.y) > 1e-6 || lockedPt(id)) continue;
      add.push({ id: nextId('c'), type: 'coincident', args: { p1: id, p2: REF_ORIGIN }, label: `Coincident: ${id}, Origin` });
    }
    for (const lid of [...pendMid]) {
      const ln = lines.find((l) => l.id === lid);
      if (!ln) continue;
      pendMid.delete(lid);
      const a = pointById.get(ln.p1), b = pointById.get(ln.p2);
      if (!a || !b || Math.hypot((a.x + b.x) / 2 - O.x, (a.y + b.y) / 2 - O.y) > 1e-6) continue;
      if (constraints.some((c) => c.type === 'midpoint' && c.args.center === REF_ORIGIN && Array.isArray(c.args.points) && (c.args.points as string[]).includes(ln.p1) && (c.args.points as string[]).includes(ln.p2))) continue;
      add.push({ id: nextId('c'), type: 'midpoint', args: { center: REF_ORIGIN, points: [ln.p1, ln.p2] }, label: `Midpoint: ${lid}, Origin` });
    }
    if (pend.size > 200) pend.clear();
    if (pendMid.size > 200) pendMid.clear();
    if (!add.length) return false;
    const next = [...constraints, ...add];
    setConstraints((cs) => [...cs, ...add.filter((a) => !cs.some((c) => c.id === a.id))]);
    void solve(points, lines, circles, next);
    return true;
  };
  useEffect(() => { applyOriginLocks(); }, [points, lines]);   // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * While a selection is dragged: if one of the moving points, or the midpoint of a moving line, would end up within reach of the origin, the whole
   * selection is nudged so it lands exactly on (0, 0). `dx, dy` is the drag offset so far; the result says what locked and how far to nudge.
   */
  const moveLockRef = useRef<{ pointId?: string; lineId?: string } | null>(null);
  const originLockForMove = (dx: number, dy: number, base: Map<string, { x: number; y: number }>): { ddx: number; ddy: number; pointId?: string; lineId?: string } | null => {
    if (swapSpace || originSnapPx <= 0) return null;
    const O = SKETCH_ORIGIN;
    let best: { ddx: number; ddy: number; pointId?: string; lineId?: string } | null = null, bestD = originTol();
    for (const [id, b] of base) {
      const px = b.x + dx, py = b.y + dy, d = Math.hypot(px - O.x, py - O.y);
      if (d < bestD) { bestD = d; best = { ddx: O.x - px, ddy: O.y - py, pointId: id }; }
    }
    for (const l of lines) {
      const a = base.get(l.p1), b = base.get(l.p2);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2 + dx, my = (a.y + b.y) / 2 + dy, d = Math.hypot(mx - O.x, my - O.y);
      if (d < bestD) { bestD = d; best = { ddx: O.x - mx, ddy: O.y - my, lineId: l.id }; }
    }
    return best;
  };
  // A point that already sits exactly on a circle / arc / curve (or at a crossing or quadrant point) got there from the curve snap below, so
  // the grid must not round it off again.
  const gridSnap = (x: number, y: number) => (nearOrigin(x, y) ? { x: SKETCH_ORIGIN.x, y: SKETCH_ORIGIN.y } : snapEnabled && !onSnapCurve(x, y)
    ? { x: SKETCH_ORIGIN.x + Math.round((x - SKETCH_ORIGIN.x) / gridStepX) * gridStepX, y: SKETCH_ORIGIN.y + Math.round((y - SKETCH_ORIGIN.y) / gridStepY) * gridStepY }
    : { x, y });

  const addPoint = (x: number, y: number) => {
    const id = nextId('pt');
    const { x: px, y: py } = gridSnap(x, y);
    if (nearOrigin(x, y)) markOrigin(id);
    setPoints((pts) => [...pts, { id, x: px, y: py }]);
    return id;
  };

  // CATIA-style Horizontal/Vertical inference while drawing a line: once
  // the segment from `anchor` to the live cursor is within HV_SNAP_DEG of
  // dead-level or dead-plumb, lock the free endpoint exactly onto that axis
  // (rather than just visually rounding the angle) — this is what a real H
  // or V constraint needs to be worth adding, since "looks straight" and
  // "is exactly 0°/90°" are different things below the pixel level. Returns
  // the raw point unchanged (axis: null) outside that tolerance. Deliberately
  // angle-based rather than pixel-based so the snap is just as easy to hit
  // whether the line is short or long, close-up or zoomed out — matching
  // how CATIA's own inference doesn't get harder to trigger at any zoom.
  const snapLineToHV = (anchor: { x: number; y: number }, raw: { x: number; y: number }): { point: { x: number; y: number }; axis: 'h' | 'v' | null } => {
    const dx = raw.x - anchor.x, dy = raw.y - anchor.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { point: raw, axis: null };
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
    const distTo = (target: number) => Math.abs(((deg - target + 540) % 360) - 180);
    const hDist = Math.min(distTo(0), distTo(180));
    const vDist = Math.min(distTo(90), distTo(-90));
    if (hDist <= HV_SNAP_DEG && hDist <= vDist) return { point: { x: raw.x, y: anchor.y }, axis: 'h' };
    if (vDist <= HV_SNAP_DEG) return { point: { x: anchor.x, y: raw.y }, axis: 'v' };
    return { point: raw, axis: null };
  };

  // The other half of CATIA's inference: a blue dashed guide line to
  // whichever existing point shares roughly the same X or Y as the point
  // you're about to place, even if that point has nothing to do with the
  // entity being drawn — snapping the shared coordinate exactly onto it.
  // Purely positional (no constraint gets added, unlike snapLineToHV above)
  // since lining up with some unrelated point is a drafting convenience,
  // not a geometric relationship worth locking in permanently. `excludeId`
  // keeps a line's own anchor point out of the search — it's already
  // handled explicitly (and more usefully, with a real constraint) by
  // snapLineToHV, so it shouldn't also show up as a plain alignment guide.
  const findAlignmentGuide = (x: number, y: number, excludeId?: string | null): { x: number; y: number; guideH: Pt | null; guideV: Pt | null } => {
    let guideH: Pt | null = null, guideV: Pt | null = null;
    let bestHD = ALIGN_TOL, bestVD = ALIGN_TOL;
    for (const p of points) {
      if (p.id === excludeId) continue;
      const dy = Math.abs(p.y - y);
      if (dy < bestHD) { bestHD = dy; guideH = p; }
      const dx = Math.abs(p.x - x);
      if (dx < bestVD) { bestVD = dx; guideV = p; }
    }
    return { x: guideV ? guideV.x : x, y: guideH ? guideH.y : y, guideH, guideV };
  };

  // Snaps onto the nearest point ALONG an existing line's own span (its
  // perpendicular foot, clamped to the segment — never its infinite
  // extension) when the cursor lands close enough — the "grab an edge, not
  // just its endpoints" counterpart to findNearestPoint above. Deliberately
  // checked only when neither an existing point nor an alignment guide
  // already claimed the click (see resolveDrawPoint), and given a more
  // generous tolerance than a plain point (LINE_SNAP_TOL) so catching an
  // edge feels as easy as CATIA's own edge-snap, not a pixel-hunt.
  const findNearestPointOnLine = (x: number, y: number, excludeLineId?: string | null): { x: number; y: number } | null => {
    let best: { x: number; y: number } | null = null; let bestD = LINE_SNAP_TOL;
    for (const l of lines) {
      if (l.id === excludeLineId) continue;
      const a = pointById.get(l.p1); const b = pointById.get(l.p2);
      if (!a || !b) continue;
      const t = segParam(a, b, { x, y });
      const foot = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      const d = Math.hypot(foot.x - x, foot.y - y);
      if (d < bestD) { bestD = d; best = foot; }
    }
    return best;
  };

  // An arc's start/end aren't stored Points the way a line's are — just a
  // center point plus a start/end sweep angle (see the Arc type) — so
  // findNearestPoint alone can never notice a cursor near one. This fills
  // that gap for hover feedback (see hoverSnapAt below): the two sweep
  // endpoints (computed the same way describeArcPath/angleOfPts already
  // do) plus the arc's own angular midpoint, walked in the same increasing-
  // angle sweep direction angleInSweep uses so the "midpoint" returned is
  // actually on the drawn arc and not its unswept complement. Endpoints
  // beat the midpoint on a tie, same "vertex before computed" priority as
  // everywhere else.
  const findArcSnap = (x: number, y: number): { x: number; y: number; isMid: boolean } | null => {
    let best: { x: number; y: number; isMid: boolean } | null = null; let bestD = MIDPOINT_SNAP_TOL;
    const norm = (a: number) => ((a % 360) + 360) % 360;
    for (const arc of arcs) {
      const c = pointById.get(arc.center);
      if (!c) continue;
      const s = norm(arc.start), e = norm(arc.end);
      const sweep = e >= s ? e - s : 360 - s + e;
      const angles: { deg: number; isMid: boolean }[] = [{ deg: s, isMid: false }, { deg: e, isMid: false }, { deg: norm(s + sweep / 2), isMid: true }];
      for (const { deg, isMid } of angles) {
        const rad = (deg * Math.PI) / 180;
        const pt = { x: c.x + arc.r * Math.cos(rad), y: c.y + arc.r * Math.sin(rad) };
        const d = Math.hypot(pt.x - x, pt.y - y);
        // Endpoints win a tie over the midpoint — checked as "d < bestD, or
        // exactly tied but this candidate is the endpoint" rather than
        // relying on array order surviving future edits.
        if (d < bestD || (d === bestD && best?.isMid && !isMid)) { bestD = d; best = { x: pt.x, y: pt.y, isMid }; }
      }
    }
    return best;
  };

  // ---- Snap to any curve ---------------------------------------------------------------------------------------------
  // The cursor is pulled onto the circumference of a circle, along an arc, ellipse, spline or conic, onto the 0/90/180/270 degree points of a
  // circle or arc, and onto the crossing of any two visible lines / circles / arcs / curves (see sketch/snapCurves.ts for the geometry).
  // The reach scales with the zoom, so it feels the same on screen whether the sketch is zoomed in or out.
  const curveTol = () => CURVE_SNAP_TOL * Math.min(5, Math.max(0.02, viewBox.w / DEFAULT_VIEW_BOX.w));
  // Everything the cursor can snap onto, gathered once per render: this sketch's own lines / circles / arcs / curves, the sketch axes, the sketches of
  // other planes shown here as reflected references (parallel planes and reference planes), and the 3D Reference Points / Lines / Axes lying on
  // this plane. The geometry is in this sketch's own plane coordinates, so it works the same on Front / Top / Right and on any reference plane.
  let targetsCache: { targets: SnapTarget[]; refPts: RefPoint[] } | null = null;
  const gatherSnapGeometry = () => {
    if (targetsCache) return targetsCache;
    const targets: SnapTarget[] = [], refPts: RefPoint[] = [];
    for (const l of lines) {
      if (!isShown(l.id)) continue;
      const a = pointById.get(l.p1), b = pointById.get(l.p2);
      if (a && b) targets.push({ kind: 'seg', id: l.id, a, b });
    }
    for (const c of circles) { const ctr = pointById.get(c.center); if (ctr && isShown(c.id)) targets.push({ kind: 'circle', id: c.id, cx: ctr.x, cy: ctr.y, r: c.r }); }
    for (const a of arcs) { const ctr = pointById.get(a.center); if (ctr && isShown(a.id)) targets.push({ kind: 'arc', id: a.id, cx: ctr.x, cy: ctr.y, r: a.r, start: a.start, end: a.end }); }
    for (const cv of curves) { if (isShown(cv.id)) { const pts = curvePoints(cv); if (pts.length > 1) targets.push({ kind: 'poly', id: cv.id, pts }); } }
    if (!swapSpace) targets.push(...axisTargets(SKETCH_ORIGIN, REF_HDIR, REF_VDIR));
    for (const r of reflected) { const g = reflectedSketchTargets(r); targets.push(...g.targets); refPts.push(...g.points); }
    if (referenceGeometry && supportFrame && (referenceGeometry.points.length || referenceGeometry.lines.length)) {
      const g = referenceOnPlane(referenceGeometry, supportFrame, SKETCH_ORIGIN);
      g.segs.forEach((sg, i) => targets.push({ kind: 'seg', id: `ref-line:${i}`, a: sg.a, b: sg.b, snapOn: true, role: 'reference', label: sg.label }));
      refPts.push(...g.points);
    }
    targetsCache = { targets, refPts };
    return targetsCache;
  };
  const snapTargets = (): SnapTarget[] => gatherSnapGeometry().targets;
  const findCurveSnapAt = (x: number, y: number): CurveSnap | null => findCurveSnap(snapTargets(), x, y, curveTol());
  /** whether (x, y) already lies on a curve / crossing / quadrant point (to float precision) */
  const onSnapCurve = (x: number, y: number) => findCurveSnap(snapTargets(), x, y, 1e-6) !== null || nearestRefPoint(gatherSnapGeometry().refPts, x, y, 1e-6) !== null;
  /** a reference point (a reflected sketch's end / centre, a 3D Reference Point, where a Reference Line crosses this plane) within reach */
  const findRefPointAt = (x: number, y: number): RefPoint | null => nearestRefPoint(gatherSnapGeometry().refPts, x, y, curveTol() * 0.9);
  const snapLabel = (cs: CurveSnap): string => {
    if (cs.kind === 'intersection') return 'Intersection';
    if (cs.kind === 'quadrant') return 'Quadrant';
    if (cs.role === 'axis') return 'On axis';
    if (cs.role === 'reference') return `On ${cs.label ?? 'reference'}`;
    return 'On curve';
  };
  const curveResolved = (cs: CurveSnap): SnapResolved => ({ x: cs.x, y: cs.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: false, midpoint: false, onCurve: true, curveKind: cs.kind, label: snapLabel(cs) });
  const refPointResolved = (rp: RefPoint): SnapResolved => ({ x: rp.x, y: rp.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: false, midpoint: false, refPoint: true, label: rp.label });

  /**
   * The click / mouse position as a placing tool should see it: an existing point, the origin, a line's midpoint or an arc's end / middle keep
   * priority (and the tools already reuse them), then the nearest curve / crossing / quadrant pulls the position onto itself. Picking tools get
   * the position back unchanged.
   */
  const magnetPoint = (x: number, y: number): { x: number; y: number } => {
    if (!CURVE_MAGNET_TOOLS.has(tool)) return { x, y };
    if (findNearestPoint(x, y)) return { x, y };
    if (nearOrigin(x, y)) return { x: SKETCH_ORIGIN.x, y: SKETCH_ORIGIN.y };
    const arcHit = findArcSnap(x, y); if (arcHit) return { x: arcHit.x, y: arcHit.y };
    const mid = findLineMidpoint(x, y); if (mid) return { x: mid.x, y: mid.y };
    const rp = findRefPointAt(x, y); if (rp) return { x: rp.x, y: rp.y };
    const cs = findCurveSnapAt(x, y);
    return cs ? { x: cs.x, y: cs.y } : { x, y };
  };

  // Hover-only snap detection: unlike resolveDrawPoint/resolveLineEndpoint
  // (which only ever run once a placement is already in progress, tied to
  // a specific tool's own commit), this runs on every canvas mousemove
  // regardless of which tool is active or whether one is active at all —
  // "identify the start point, end point and midpoint of any curve while
  // hovering, whether or not a tool is selected". Same vertex-beats-
  // midpoint priority as everywhere else: a real stored point (covers
  // every line/curve's actual start and end, since those are just Points
  // like any other) first, then an arc's own start/end/mid (the one
  // geometry in this app whose endpoints aren't stored Points — see
  // findArcSnap), then a line's own midpoint. Returns null (nothing drawn)
  // rather than resolveDrawPoint's raw-cursor fallback, since a glyph
  // following the mouse everywhere it goes would be noise, not feedback.
  const hoverSnapAt = (x: number, y: number): SnapResolved | null => {
    const hit = findNearestPoint(x, y);
    const hitAtOrigin = !!hit && Math.hypot(hit.x - SKETCH_ORIGIN.x, hit.y - SKETCH_ORIGIN.y) < 1e-6;
    if (hit && !(hitAtOrigin && nearOrigin(x, y))) return { x: hit.x, y: hit.y, pointId: hit.id, axis: null, guideH: null, guideV: null, onLine: false, midpoint: false };
    if (nearOrigin(x, y)) return { x: SKETCH_ORIGIN.x, y: SKETCH_ORIGIN.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: false, midpoint: false, origin: true, label: 'Origin (0, 0)' };
    const arcHit = findArcSnap(x, y);
    if (arcHit) return { x: arcHit.x, y: arcHit.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: false, midpoint: arcHit.isMid, arcPoint: true };
    const mid = findLineMidpoint(x, y);
    if (mid) return { x: mid.x, y: mid.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: false, midpoint: true };
    const rp = findRefPointAt(x, y);
    if (rp) return refPointResolved(rp);
    // Any curve under the cursor: a crossing, a quadrant point or simply the nearest spot on it — and a line's own edge.
    const cs = findCurveSnapAt(x, y);
    if (cs) return curveResolved(cs);
    const edge = findNearestPointOnLine(x, y);
    if (edge) return { x: edge.x, y: edge.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: true, midpoint: false };
    return null;
  };

  // The full priority order behind every new point this app places while
  // drawing (used by the Line tool's own click/preview below, and reusable
  // wherever else a click needs the same "what would CATIA snap this to"
  // answer): an existing point wins outright (exact reuse, not just nearby);
  // failing that, an H/V lock relative to `anchor` (only meaningful for a
  // line's own second point — see snapLineToHV) beats everything else, since
  // it's the most specific and most valuable inference; failing that, a
  // line's own midpoint; failing that, an alignment guide to some other
  // point's X/Y; failing that, a snap onto the nearest line segment; and
  // only then the raw (grid-snapped-on-click) cursor position.
  // Tangency inference (the guide's Figure 1-14): with a line's start
  // placed, the points on each visible circle, arc or curve where a line
  // from that start would just touch it. Within reach of the cursor, the
  // endpoint snaps there and the line gets a real tangent constraint.
  const findTangentSnap = (x: number, y: number, anchor: { x: number; y: number }) => {
    let best: { x: number; y: number; id: string; kind: 'circle' | 'arc' | 'curve' } | null = null;
    let bestD = HIT_TOL * 1.5;
    const consider = (id: string, kind: 'circle' | 'arc' | 'curve', cx: number, cy: number, r: number, arc?: Arc) => {
      const d = Math.hypot(anchor.x - cx, anchor.y - cy);
      if (d <= r + 1e-6) return;
      const phi = Math.atan2(anchor.y - cy, anchor.x - cx), alpha = Math.acos(r / d);
      for (const t of [phi + alpha, phi - alpha]) {
        const T = { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
        if (arc && !angleInSweep(angleOfPts({ x: cx, y: cy }, T), arc.start, arc.end)) continue;
        const dd = Math.hypot(T.x - x, T.y - y);
        if (dd < bestD) { bestD = dd; best = { ...T, id, kind }; }
      }
    };
    for (const c of circles) { const ctr = pointById.get(c.center); if (ctr && isShown(c.id)) consider(c.id, 'circle', ctr.x, ctr.y, c.r); }
    for (const a of arcs) { const ctr = pointById.get(a.center); if (ctr && isShown(a.id)) consider(a.id, 'arc', ctr.x, ctr.y, a.r, a); }
    // Ellipses, splines and conics: where the line from the anchor to a
    // curve point runs along the curve's own tangent there — a sign change
    // of cross(P - anchor, tangent) between samples, refined by
    // interpolation.
    for (const cv of curves) {
      if (!isShown(cv.id)) continue;
      const ptsC = curvePoints(cv);
      const f = ptsC.map((P, i) => {
        const A = ptsC[Math.max(0, i - 1)], B = ptsC[Math.min(ptsC.length - 1, i + 1)];
        return (P.x - anchor.x) * (B.y - A.y) - (P.y - anchor.y) * (B.x - A.x);
      });
      for (let i = 0; i + 1 < ptsC.length; i++) {
        if (f[i] === 0 || f[i] * f[i + 1] < 0) {
          const t = f[i] === 0 ? 0 : f[i] / (f[i] - f[i + 1]);
          const T = { x: ptsC[i].x + (ptsC[i + 1].x - ptsC[i].x) * t, y: ptsC[i].y + (ptsC[i + 1].y - ptsC[i].y) * t };
          if (Math.hypot(T.x - anchor.x, T.y - anchor.y) < 1e-6) continue;
          const dd = Math.hypot(T.x - x, T.y - y);
          if (dd < bestD) { bestD = dd; best = { ...T, id: cv.id, kind: 'curve' }; }
        }
      }
    }
    return best as { x: number; y: number; id: string; kind: 'circle' | 'arc' | 'curve' } | null;
  };

  const resolveDrawPoint = (x: number, y: number, anchor?: { x: number; y: number } | null): SnapResolved => {
    const hit = findNearestPoint(x, y);
    const hitAtOrigin = !!hit && Math.hypot(hit.x - SKETCH_ORIGIN.x, hit.y - SKETCH_ORIGIN.y) < 1e-6;
    if (hit) return { x: hit.x, y: hit.y, pointId: hit.id as string | null, axis: null as 'h' | 'v' | null, guideH: null as Pt | null, guideV: null as Pt | null, onLine: false, midpoint: false, origin: hitAtOrigin, tangentTo: null as { id: string; kind: 'circle' | 'arc' | 'curve' } | null };
    // The plane's centre (0, 0): reuses a point already sitting there, otherwise the new point is placed exactly on it (and locked, see markOrigin).
    if (nearOrigin(x, y)) return { x: SKETCH_ORIGIN.x, y: SKETCH_ORIGIN.y, pointId: originPointId() as string | null, axis: null as 'h' | 'v' | null, guideH: null as Pt | null, guideV: null as Pt | null, onLine: false, midpoint: false, origin: true, label: 'Origin (0, 0)', tangentTo: null as { id: string; kind: 'circle' | 'arc' | 'curve' } | null };
    // A line that would be centred on the origin: with its start placed, the end snaps to the mirror image of the start through (0, 0).
    if (anchor && !lineSymToggle && originSnapPx > 0 && !swapSpace && Math.hypot(anchor.x - SKETCH_ORIGIN.x, anchor.y - SKETCH_ORIGIN.y) > originTol()) {
      const R = { x: 2 * SKETCH_ORIGIN.x - anchor.x, y: 2 * SKETCH_ORIGIN.y - anchor.y };
      if (Math.hypot(x - R.x, y - R.y) < originTol()) return { x: R.x, y: R.y, pointId: null as string | null, axis: null as 'h' | 'v' | null, guideH: null as Pt | null, guideV: null as Pt | null, onLine: false, midpoint: true, originMid: true, label: 'Midpoint on origin', tangentTo: null as { id: string; kind: 'circle' | 'arc' | 'curve' } | null };
    }
    if (anchor) {
      const tan = findTangentSnap(x, y, anchor);
      if (tan) return { x: tan.x, y: tan.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: false, midpoint: false, tangentTo: { id: tan.id, kind: tan.kind } };
    }
    if (anchor) {
      const snapped = snapLineToHV(anchor, { x, y });
      if (snapped.axis) return { x: snapped.point.x, y: snapped.point.y, pointId: null, axis: snapped.axis, guideH: null, guideV: null, onLine: false, midpoint: false };
    }
    const mid = findLineMidpoint(x, y);
    if (mid) return { x: mid.x, y: mid.y, pointId: null, axis: null as 'h' | 'v' | null, guideH: null as Pt | null, guideV: null as Pt | null, onLine: false, midpoint: true };
    const rp = findRefPointAt(x, y);
    if (rp) return refPointResolved(rp);
    // Circles, arcs, ellipses, splines and conics (and where any two entities cross) pull the point onto themselves.
    const cs = findCurveSnapAt(x, y);
    if (cs) return curveResolved(cs);
    const guide = findAlignmentGuide(x, y);
    if (guide.guideH || guide.guideV) return { x: guide.x, y: guide.y, pointId: null, axis: null, guideH: guide.guideH, guideV: guide.guideV, onLine: false, midpoint: false };
    const onLine = findNearestPointOnLine(x, y);
    if (onLine) return { x: onLine.x, y: onLine.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: true, midpoint: false };
    // Nothing more specific claimed it — CATIA's own last resort is never
    // the raw pixel, it's the nearest grid intersection (see gridSnap's own
    // comment above: this is "where a point doesn't already exist", exactly
    // the case landed on here). A no-op when Snap is off (gridSnap returns
    // x,y unchanged then), so this only ever adds behavior, never removes it.
    const snapped = gridSnap(x, y);
    return { x: snapped.x, y: snapped.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: false, midpoint: false };
  };

  // The Point tool's own click-to-place, but routed through the exact same
  // CATIA-style resolveDrawPoint the Line tool commits with (see there for
  // the full priority order) — so clicking near an existing vertex reuses
  // it instead of dropping a redundant duplicate on top, clicking near a
  // line's midpoint lands exactly there rather than wherever the mouse
  // happened to be, and only a click that resolved nothing more specific
  // falls back to the plain, grid-snapped-on-click placement addPoint
  // already gave every Point click before this. Used by the base Point
  // tool's own plain "click somewhere" gesture — the other flyout variants
  // (Points on Curve, Bisecting/Mid Point, Divided Points) each run their
  // own multi-step pick instead.
  const commitResolvedPoint = (x: number, y: number) => {
    const resolved = resolveDrawPoint(x, y, null);
    const passthroughGrid = !resolved.pointId && !resolved.axis && !resolved.guideH && !resolved.guideV && !resolved.onLine && !resolved.midpoint;
    return resolved.pointId ?? (passthroughGrid ? addPoint(resolved.x, resolved.y) : addPointExact(resolved.x, resolved.y));
  };

  const toggleSelect = (id: string) => {
    setSelected((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]));
  };

  const selectedPoint = selectedSingleId ? pointById.get(selectedSingleId) ?? null : null;

  const selectedLine = selectedSingleId ? lines.find((l) => l.id === selectedSingleId) ?? null : null;

  const selectedCircle = selectedSingleId ? circles.find((c) => c.id === selectedSingleId) ?? null : null;

  const selectedArc = selectedSingleId ? arcs.find((a) => a.id === selectedSingleId) ?? null : null;

  const selectedCurve = selectedSingleId ? curves.find((cv) => cv.id === selectedSingleId) ?? null : null;

  // A short, human label for any entity id, for the Parents/Children panel
  // and the Constraints list below — mirrors CATIA's Specification Tree
  // showing "Line.1", "Circle.2" etc. rather than raw internal ids alone.
  const describeEntityId = (id: string): string => {
    if (points.some((p) => p.id === id)) return `Point ${id}`;
    if (lines.some((l) => l.id === id)) return `Line ${id}`;
    if (circles.some((c) => c.id === id)) return `Circle ${id}`;
    if (arcs.some((a) => a.id === id)) return `Arc ${id}`;
    const curve = curves.find((cv) => cv.id === id);
    if (curve) return `${curve.kind[0].toUpperCase()}${curve.kind.slice(1)} ${id}`;
    return id;
  };

  // CATIA Workbook's Parents/Children tool, scoped to what this app's flat
  // sketch data model actually has: which points a curve is built from
  // (parents), which curves/constraints are in turn built on a given point
  // (children), and which constraints reference the selected entity at
  // all. Read-only — selecting a listed relation just highlights it, same
  // as CATIA's Parents and Children window.
  const relationsFor = (id: string): { parents: { id: string; label: string }[]; children: { id: string; label: string }[]; constraints: { id: string; label: string }[] } => {
    const parentIds: string[] = [];
    const line = lines.find((l) => l.id === id);
    if (line) parentIds.push(line.p1, line.p2);
    const circle = circles.find((c) => c.id === id);
    if (circle) parentIds.push(circle.center);
    const arc = arcs.find((a) => a.id === id);
    if (arc) parentIds.push(arc.center);
    const curve = curves.find((cv) => cv.id === id);
    if (curve) parentIds.push(...curveDefiningIds(curve));

    const childIds: string[] = [];
    for (const l of lines) { if ((l.p1 === id || l.p2 === id) && l.id !== id) childIds.push(l.id); }
    for (const c of circles) { if (c.center === id) childIds.push(c.id); }
    for (const a of arcs) { if (a.center === id) childIds.push(a.id); }
    for (const cv of curves) { if (curveDefiningIds(cv).includes(id)) childIds.push(cv.id); }

    const relatedConstraints = constraints.filter((c) => Object.values(c.args).some((v) => v === id));

    return {
      parents: parentIds.map((pid) => ({ id: pid, label: describeEntityId(pid) })),
      children: childIds.map((cid) => ({ id: cid, label: describeEntityId(cid) })),
      constraints: relatedConstraints.map((c) => ({ id: c.id, label: c.label })),
    };
  };

  // Same hit-testing order the old inline Select-tool click handler used
  // (nearest point, then circles, then arcs, then lines, then curves) —
  // factored out so Measure Between/Item can reuse it instead of a second
  // copy.
  // Only what's displayed in the current space (see Hide/Show) is pickable.
  const pickEntityAt = (x: number, y: number): EntityGeom | null => {
    const hitPoint = findNearestPoint(x, y);
    if (hitPoint && isShown(hitPoint.id)) return { kind: 'point', id: hitPoint.id, x: hitPoint.x, y: hitPoint.y };
    for (const c of circles) {
      if (!isShown(c.id)) continue;
      const center = pointById.get(c.center);
      if (!center) continue;
      if (Math.abs(Math.hypot(center.x - x, center.y - y) - c.r) < HIT_TOL) return { kind: 'circle', id: c.id, cx: center.x, cy: center.y, r: c.r };
    }
    for (const a of arcs) {
      if (!isShown(a.id)) continue;
      const center = pointById.get(a.center);
      if (!center) continue;
      if (!angleInSweep(angleOfPts(center, { x, y }), a.start, a.end)) continue;
      if (Math.abs(Math.hypot(center.x - x, center.y - y) - a.r) < HIT_TOL) return { kind: 'arc', id: a.id, cx: center.x, cy: center.y, r: a.r };
    }
    for (const l of lines) {
      if (!isShown(l.id)) continue;
      const a = pointById.get(l.p1); const b = pointById.get(l.p2);
      if (!a || !b) continue;
      // An infinite line is pickable anywhere along its (drawn) extent.
      const [e1, e2] = l.style === 'infinite' ? infiniteLineEndpoints(a, b) : [a, b];
      if (pointToSegmentDistance(x, y, e1, e2) < HIT_TOL) return { kind: 'line', id: l.id, a, b };
    }
    for (const cv of curves) {
      if (!isShown(cv.id)) continue;
      const pts = curvePoints(cv);
      if (distanceToPolyline(x, y, pts) < HIT_TOL) return { kind: 'curve', id: cv.id, pts };
    }
    // Last: the AbsoluteAxis references (only in the normal space).
    if (!swapSpace) {
      const o = SKETCH_ORIGIN;
      if (Math.hypot(x - o.x, y - o.y) < HIT_TOL) return geomById(REF_ORIGIN);
      if (Math.abs(y - o.y) < HIT_TOL && x > o.x && x < o.x + ORIGIN_ARM) return geomById(REF_HDIR);
      if (Math.abs(x - o.x) < HIT_TOL && y < o.y && y > o.y - ORIGIN_ARM) return geomById(REF_VDIR);
    }
    return null;
  };

  // A tool that needs a curve-like target (Line Normal to a Curve, Points
  // on Curve) discards a `pickEntityAt` hit that resolves to `kind:
  // 'point'` — findNearestPoint takes priority inside pickEntityAt, so a
  // click that lands ON an existing line/curve's own endpoint returns that
  // point, not the line/curve, and the target-pick silently does nothing.
  // That's exactly the "start-point/end-point detection isn't working"
  // gap: clicking a line's own endpoint to aim Line Normal to a Curve from
  // there should still pick that line. This looks up whichever line/curve/
  // circle/arc the clicked point is actually built from, so the click
  // resolves to something instead of being swallowed. Lines first (the
  // most common case, and what a "for lines" fix is about), then curves,
  // then circle/arc — a point shared by more than one (a junction of two
  // lines) is inherently ambiguous, so this just takes the first match
  // rather than trying to guess which one the user meant.
  const entityOwningPoint = (pointId: string): EntityGeom | null => {
    const line = lines.find((l) => l.p1 === pointId || l.p2 === pointId);
    if (line) return geomById(line.id);
    const curve = curves.find((cv) => curveDefiningIds(cv).includes(pointId));
    if (curve) return geomById(curve.id);
    const circle = circles.find((c) => c.center === pointId);
    if (circle) return geomById(circle.id);
    const arc = arcs.find((a) => a.center === pointId);
    if (arc) return geomById(arc.id);
    return null;
  };

  const pointIdsForSelection = (ids: string[]): Set<string> => {
    const out = new Set<string>();
    for (const id of ids) for (const pid of pointIdsForEntity(id)) out.add(pid);
    return out;
  };

  // The two CAD-standard radial-dimension prefixes — used everywhere a
  // Radius or Diameter is read out (Measure Item, a real circle/arc
  // Dimension, and every drawing tool's own live "how big is this circle"
  // preview): "R"/"D" directly in front of the number, no unit suffix,
  // matching how these are conventionally marked on a drawing regardless
  // of context. Every OTHER measurement (length, angle, area, a generic
  // distance/clearance reading, …) shows just the bare number — no "mm",
  // no "°", no other symbol — since unlike Radius/Diameter they aren't
  // read as a fixed notation on their own.
  const fmtRadius = (r: number, decimals = 2) => `R${toU(r).toFixed(decimals)}`;

  const fmtDiameter = (r: number, decimals = 2) => `D${toU(r * 2).toFixed(decimals)}`;

  // Measure Item — a single entity's own dimensions. Every value here is
  // just the bare number now (no "mm"/"°"/"mm²" unit suffix) — the row's
  // own label already says what it is — except Radius/Diameter, which get
  // the standard CAD-drafting "R"/"D" prefix instead (see fmtRadius/
  // fmtDiameter) since those two are conventionally read that way even
  // out of context.
  const describeItem = (g: EntityGeom): [string, string][] => {
    if (g.kind === 'point') return [['H', toU(g.x - SKETCH_ORIGIN.x).toFixed(2)], ['V', toU(SKETCH_ORIGIN.y - g.y).toFixed(2)]];
    if (g.kind === 'line') {
      const len = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
      return [['Length', toU(len).toFixed(2)], ['Angle', angleOfPts(g.a, g.b).toFixed(2)]];
    }
    if (g.kind === 'circle') {
      return [
        ['Radius', fmtRadius(g.r)], ['Diameter', fmtDiameter(g.r)],
        ['Circumference', toU(2 * Math.PI * g.r).toFixed(2)], ['Area', (Math.PI * g.r * g.r / unitMm / unitMm).toFixed(2)],
      ];
    }
    if (g.kind === 'curve') {
      let len = 0;
      for (let i = 0; i < g.pts.length - 1; i++) len += Math.hypot(g.pts[i + 1].x - g.pts[i].x, g.pts[i + 1].y - g.pts[i].y);
      return [['Approx. length', toU(len).toFixed(2)], ['Sampled points', `${g.pts.length}`]];
    }
    return [['Radius', fmtRadius(g.r)], ['Center', `H ${toU(g.cx - SKETCH_ORIGIN.x).toFixed(2)} · V ${toU(SKETCH_ORIGIN.y - g.cy).toFixed(2)}`]];
  };

  // Measure Between — CATIA's own tool reports the minimum distance
  // between whatever two elements are picked; each combination below is
  // the same point/segment/circle math already used for hit-testing and
  // Trim, just aimed at "how far apart" instead of "did this click land
  // on it." A curve's distance to anything else is approximated as the
  // closest of its own sampled points — not exact segment-by-segment
  // math, but close given how densely each curve is sampled, and
  // consistent with the rest of this phase-1 pass.
  const measureBetween = (g1: EntityGeom, g2: EntityGeom): [string, string][] => {
    let dist = 0;
    if (g1.kind === 'point' && g2.kind === 'point') dist = Math.hypot(g2.x - g1.x, g2.y - g1.y);
    else if (g1.kind === 'point' && g2.kind === 'line') dist = pointToSegmentDistance(g1.x, g1.y, g2.a, g2.b);
    else if (g1.kind === 'line' && g2.kind === 'point') dist = pointToSegmentDistance(g2.x, g2.y, g1.a, g1.b);
    else if (g1.kind === 'point' && (g2.kind === 'circle' || g2.kind === 'arc')) dist = Math.max(0, Math.hypot(g1.x - g2.cx, g1.y - g2.cy) - g2.r);
    else if ((g1.kind === 'circle' || g1.kind === 'arc') && g2.kind === 'point') dist = Math.max(0, Math.hypot(g2.x - g1.cx, g2.y - g1.cy) - g1.r);
    else if (g1.kind === 'line' && g2.kind === 'line') {
      dist = Math.min(
        pointToSegmentDistance(g1.a.x, g1.a.y, g2.a, g2.b), pointToSegmentDistance(g1.b.x, g1.b.y, g2.a, g2.b),
        pointToSegmentDistance(g2.a.x, g2.a.y, g1.a, g1.b), pointToSegmentDistance(g2.b.x, g2.b.y, g1.a, g1.b),
      );
    } else if ((g1.kind === 'circle' || g1.kind === 'arc') && (g2.kind === 'circle' || g2.kind === 'arc')) {
      dist = Math.max(0, Math.hypot(g2.cx - g1.cx, g2.cy - g1.cy) - g1.r - g2.r);
    } else if (g1.kind === 'curve' || g2.kind === 'curve') {
      const curve = g1.kind === 'curve' ? g1 : (g2.kind === 'curve' ? g2 : null);
      const other = g1.kind === 'curve' ? g2 : g1;
      if (curve) {
        if (other.kind === 'point') dist = distanceToPolyline(other.x, other.y, curve.pts);
        else if (other.kind === 'line') dist = Math.min(...curve.pts.map((p) => pointToSegmentDistance(p.x, p.y, other.a, other.b)));
        else if (other.kind === 'circle' || other.kind === 'arc') dist = Math.max(0, Math.min(...curve.pts.map((p) => Math.hypot(p.x - other.cx, p.y - other.cy))) - other.r);
        else if (other.kind === 'curve') dist = Math.min(...curve.pts.map((p) => distanceToPolyline(p.x, p.y, other.pts)));
      }
    } else {
      const line = g1.kind === 'line' ? g1 : g2.kind === 'line' ? g2 : null;
      const circ = g1.kind === 'circle' || g1.kind === 'arc' ? g1 : g2.kind === 'circle' || g2.kind === 'arc' ? g2 : null;
      if (line && circ) dist = Math.max(0, pointToSegmentDistance(circ.cx, circ.cy, line.a, line.b) - circ.r);
    }
    return [['Distance', toU(dist).toFixed(2)]];
  };

  const [editingPreviewKey, setEditingPreviewKey] = useState<string | null>(null);

  const startPreviewDrag = (evt: React.MouseEvent, key: string, from: { x: number; y: number }, to: { x: number; y: number }, target: PreviewDragTarget) => {
    evt.stopPropagation(); evt.preventDefault();
    draggingPreviewRef.current = { key, from, to };
    previewDragTargetRef.current = target;
    previewDragMovedRef.current = false;
    latestPreviewOverrideRef.current = null;
    setIsDraggingPreview(true);
  };

  const startPreviewCircleDrag = (evt: React.MouseEvent, key: string, cx: number, cy: number, r: number, target: PreviewDragTarget) => {
    evt.stopPropagation(); evt.preventDefault();
    draggingPreviewCircleRef.current = { key, cx, cy, r };
    previewDragTargetRef.current = target;
    previewDragMovedRef.current = false;
    latestPreviewOverrideRef.current = null;
    setIsDraggingPreviewCircle(true);
  };

  const startPreviewLabelDrag = (evt: React.MouseEvent, key: string, from: { x: number; y: number }, to: { x: number; y: number }, offset: number, target: PreviewDragTarget) => {
    evt.stopPropagation(); evt.preventDefault();
    draggingPreviewLabelRef.current = { key, from, to, offset };
    previewDragTargetRef.current = target;
    previewDragMovedRef.current = false;
    latestPreviewOverrideRef.current = null;
    setIsDraggingPreviewLabel(true);
  };

  // Commits a double-click edit's typed number through whichever commit
  // path applies (commitSinglePreview for a single entity, or a
  // PairMeasure's own `commit` for a pair) — same "type a number, the
  // sketch obeys" idea as commitDimensionEdit, just reached from an
  // auto-preview instead of a persisted Dimension. Only ever wired up to a
  // preview that already has a real, exact-fit constraint path (a
  // clickable one) — never a read-only reading like a clearance or offset,
  // since there's no constraint type to drive that change without silently
  // guessing at which other geometry should move to absorb it (the
  // "without disturbing the object" half of the ask).
  const commitPreviewEdit = (key: string, onCommit: ((value?: number) => void) | null) => {
    const value = editIsAngleRef.current ? Number(previewEditValue) : lenNum(previewEditValue);
    setEditingPreviewKey(null);
    if (!onCommit || !Number.isFinite(value) || value <= 0) return;
    onCommit(value);
  };

  // Click-to-convert for the single-entity preview: a Line becomes a real
  // pinned Distance (its current length, or `value` when driven from a
  // double-click edit), a Circle a real Radius — both exact-fit
  // constraints — while an Arc (sketch_solver.py has no radius constraint
  // type for arcs) either stays purely visual (a plain click) or, when a
  // typed edit value is given, has its radius set directly — the same
  // direct-mutation fallback commitDimensionEdit's own arc branch uses for
  // exactly the same reason. Either way it also adds the on-canvas
  // Dimension, so it stops being an ephemeral preview and starts behaving
  // exactly like one made with Measure Item.
  const commitSinglePreview = (g: EntityGeom, value?: number) => {
    if (g.kind === 'line') {
      const len = value ?? Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
      commitPointDistance(g.a.id, g.b.id, len);
    } else if (g.kind === 'circle') {
      const r = value !== undefined ? value / 2 : g.r;
      upsertConstraint((c) => c.type === 'radius' && c.args.circle === g.id, 'radius', { circle: g.id, value: r }, `Radius: ${g.id} = ${r.toFixed(2)}mm`);
    } else if (g.kind === 'arc' && value !== undefined) {
      editArc(g.id, { r: value });
    }
    upsertDimension(g);
  };

  // Selection-driven preview — recomputed fresh every render straight from
  // `selected`, so it needs no state of its own and Esc/deselect hiding it
  // is automatic (see the Escape-key handler above and handleCanvasClick's
  // empty-space deselect below). Suppressed mid-drag (nothing useful to
  // preview while a move/box-drag is live) and, for a single line/circle/
  // arc, suppressed once a real Dimension already exists for it — no point
  // drawing a duplicate over the real one.
  const selectionPreview: { kind: 'single'; g: EntityGeom } | { kind: 'pair'; gA: EntityGeom; gB: EntityGeom; attached: boolean } | null =
    tool !== 'select' || dragModeRef.current
      ? null
      : selected.length === 1
        ? (() => {
            const g = geomById(selected[0]);
            if (!g || (g.kind !== 'line' && g.kind !== 'circle' && g.kind !== 'arc')) return null;
            if (dimensions.some((d) => d.entityId === g.id)) return null;
            return { kind: 'single' as const, g };
          })()
        : selected.length === 2
          ? (() => {
              const gA = geomById(selected[0]); const gB = geomById(selected[1]);
              if (!gA || !gB) return null;
              // Already promoted to a real, persisted pair Dimension (see
              // finalizePreviewDrag) — that renders via dimensions.map
              // instead, so the ephemeral preview steps aside rather than
              // drawing a duplicate on top of it.
              if (dimensions.some((d) => d.kind === 'pair' && ((d.entityIdA === gA.id && d.entityIdB === gB.id) || (d.entityIdA === gB.id && d.entityIdB === gA.id)))) return null;
              return { kind: 'pair' as const, gA, gB, attached: entitiesAttached(gA, gB) };
            })()
          : null;

  // The edit wiring every ephemeral preview label (Measure Item, Measure
  // Between distance/angle) hands to DimensionLabel — the preview-side twin
  // of dimEditProps: same double-click → seeded editor → Enter/blur commit
  // (through commitPreviewEdit) → Escape cancel. A reading with nothing to
  // drive it (`onCommit` null) still opens the editor, then explains.
  // Its label's single click is swallowed too (not committed), so the
  // selection — and the label — survive to receive the double-click.
  const previewEditProps = (key: string, isAngle: boolean, onCommit: ((value?: number) => void) | null) => ({
    editing: editingPreviewKey === key,
    onStartEdit: (seed: string) => { editIsAngleRef.current = isAngle; setPreviewEditValue(seed); setEditingPreviewKey(key); },
    onChange: setPreviewEditValue,
    onCommit: (_value: string, changed: boolean) => {
      if (onCommit) { commitPreviewEdit(key, onCommit); return; }
      setEditingPreviewKey(null);
      if (changed) setError(READ_ONLY_EDIT);
    },
    onCancel: () => setEditingPreviewKey(null),
  });

  // Case A (single entity): rendered with the exact same classes
  // renderDimension's own Line/Circle/Arc dimensions use (dim-ext-line/
  // dim-line/dim-arrow/dim-label — the app's real, green, extension-line-
  // and-arrowheads CATIA look), not a separate "preview" palette, per the
  // "make it look exactly like [a real dimension]" follow-up. Now also
  // draggable (drag the dimension line to extend it, drag the label to
  // slide it) exactly like a real Measure Item Dimension — see
  // previewOverrides/startPreviewDrag/startPreviewCircleDrag/
  // startPreviewLabelDrag above — and double-click-editable the same way
  // (see commitPreviewEdit/commitSinglePreview). Single-click on the label
  // still promotes it into an actual Dimension (see commitSinglePreview);
  // dim-label-commit only swaps the cursor to pointer instead of dim-
  // label's own default "move" affordance.
  const renderSinglePreview = (g: EntityGeom) => {
    const ARROW = 2.5, EXT_GAP = 2.5, EXT_PAST = 2.5;
    const key = `single:${g.id}`;
    const override = previewOverrides[key];
    if (g.kind === 'line') {
      const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return null;
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;
      let off: number;
      if (override) {
        off = override.offset;
      } else {
        const cx = points.reduce((s, p) => s + p.x, 0) / (points.length || 1);
        const cy = points.reduce((s, p) => s + p.y, 0) / (points.length || 1);
        const midx0 = (g.a.x + g.b.x) / 2, midy0 = (g.a.y + g.b.y) / 2;
        const towardCentroid = (cx - midx0) * nx + (cy - midy0) * ny;
        const sign = towardCentroid > 0 ? -1 : 1;
        off = sign * Math.max(14, Math.min(36, len * 0.22));
      }
      const a2 = { x: g.a.x + nx * off, y: g.a.y + ny * off };
      const b2 = { x: g.b.x + nx * off, y: g.b.y + ny * off };
      const s = off < 0 ? -1 : 1;
      const extA1 = { x: g.a.x + nx * EXT_GAP * s, y: g.a.y + ny * EXT_GAP * s };
      const extA2 = { x: g.a.x + nx * (Math.abs(off) + EXT_PAST) * s, y: g.a.y + ny * (Math.abs(off) + EXT_PAST) * s };
      const extB1 = { x: g.b.x + nx * EXT_GAP * s, y: g.b.y + ny * EXT_GAP * s };
      const extB2 = { x: g.b.x + nx * (Math.abs(off) + EXT_PAST) * s, y: g.b.y + ny * (Math.abs(off) + EXT_PAST) * s };
      const t = override?.labelT ?? 0.5;
      const lx = a2.x + (b2.x - a2.x) * t, ly = a2.y + (b2.y - a2.y) * t;
      return (
        <g key="single-preview" className="dim-annotation">
          <line x1={extA1.x} y1={extA1.y} x2={extA2.x} y2={extA2.y} className="dim-ext-line" />
          <line x1={extB1.x} y1={extB1.y} x2={extB2.x} y2={extB2.y} className="dim-ext-line" />
          <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} className="dim-line" />
          {arrowhead(a2, { x: ux, y: uy }, ARROW)}
          {arrowhead(b2, { x: -ux, y: -uy }, ARROW)}
          {/* Always upright — see renderDimension's identical note above;
              this preview must stay pixel-identical to what it turns into
              the instant it's committed. */}
          <DimensionLabel x={lx} y={ly} dy={-3} textAnchor="middle"
            className="dim-label dim-label-commit"
            seed={toU(len).toFixed(2)} {...previewEditProps(key, false, (v) => commitSinglePreview(g, v))}
            onMouseDown={(evt) => startPreviewLabelDrag(evt, key, g.a, g.b, off, { mode: 'single', g })}
            onClick={(evt) => { evt.stopPropagation(); commitSinglePreview(g); }}
          >{toU(len).toFixed(2)}</DimensionLabel>
          <line
            x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} className="dim-hit"
            onMouseDown={(evt) => startPreviewDrag(evt, key, g.a, g.b, { mode: 'single', g })}
          />
        </g>
      );
    }
    if (g.kind === 'circle' || g.kind === 'arc') {
      const cx = points.reduce((s, p) => s + p.x, 0) / (points.length || 1);
      const cy = points.reduce((s, p) => s + p.y, 0) / (points.length || 1);
      const angle = override?.angle ?? (Math.atan2(g.cy - cy, g.cx - cx) || -Math.PI / 4);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const off = override?.offset ?? Math.max(14, g.r * 0.5);
      const edge = { x: g.cx + g.r * cos, y: g.cy + g.r * sin };
      const tip = { x: g.cx + (g.r + off) * cos, y: g.cy + (g.r + off) * sin };
      const isCircle = g.kind === 'circle';
      const displayValue = toU(isCircle ? g.r * 2 : g.r).toFixed(2);
      const prefix = isCircle ? 'D' : 'R';
      const lineStart = isCircle ? { x: g.cx - g.r * cos, y: g.cy - g.r * sin } : { x: g.cx, y: g.cy };
      const textAnchor = cos >= 0 ? 'start' : 'end';
      const t = override?.labelT ?? 1;
      const lx = edge.x + (tip.x - edge.x) * t + cos * 4, ly = edge.y + (tip.y - edge.y) * t + sin * 4;
      return (
        <g key="single-preview" className="dim-annotation">
          <line x1={lineStart.x} y1={lineStart.y} x2={tip.x} y2={tip.y} className="dim-line" />
          {arrowhead(edge, { x: -cos, y: -sin }, ARROW)}
          <DimensionLabel x={lx} y={ly} dy={3} textAnchor={textAnchor}
            className="dim-label dim-label-commit"
            seed={displayValue} {...previewEditProps(key, false, (v) => commitSinglePreview(g, v))}
            onMouseDown={(evt) => startPreviewCircleDrag(evt, key, g.cx, g.cy, g.r, { mode: 'single', g })}
            onClick={(evt) => { evt.stopPropagation(); commitSinglePreview(g); }}
          >{prefix}{displayValue}</DimensionLabel>
          <line
            x1={lineStart.x} y1={lineStart.y} x2={tip.x} y2={tip.y} className="dim-hit"
            onMouseDown={(evt) => startPreviewCircleDrag(evt, key, g.cx, g.cy, g.r, { mode: 'single', g })}
          />
        </g>
      );
    }
    return null;
  };

  // Case B, angle sub-case: a small arc swept the short way between the
  // two rays at the vertex, with the degree label on its bisector — drawn
  // with this app's existing sketch-preview-line/sketch-preview-label
  // classes (the same light-purple, dashed "in-progress" look every other
  // rubber-band preview in this file already uses), per the same "match
  // the reference" follow-up, rather than a bespoke palette.
  // Editable (double-click, when clickable) exactly like the distance case
  // below — R (the arc's own radius, purely cosmetic) isn't drag-adjustable
  // since it carries no measurement of its own to extend.
  const renderAngleArc = (key: string, info: { vertex: { x: number; y: number }; dirA: number; dirB: number }, label: string, clickable: boolean, onCommit: ((value?: number) => void) | null, value?: number) => {
    const R = 16;
    let diff = info.dirB - info.dirA;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const endAngle = info.dirA + diff;
    const sweepFlag = diff >= 0 ? 1 : 0;
    const p1 = { x: info.vertex.x + R * Math.cos(info.dirA), y: info.vertex.y + R * Math.sin(info.dirA) };
    const p2 = { x: info.vertex.x + R * Math.cos(endAngle), y: info.vertex.y + R * Math.sin(endAngle) };
    const mid = info.dirA + diff / 2;
    const lx = info.vertex.x + (R + 9) * Math.cos(mid), ly = info.vertex.y + (R + 9) * Math.sin(mid);
    return (
      <g key="pair-preview" className="dim-annotation">
        <path d={`M ${p1.x} ${p1.y} A ${R} ${R} 0 0 ${sweepFlag} ${p2.x} ${p2.y}`} className="sketch-preview-line angle-arc" fill="none" />
        <DimensionLabel x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          className="sketch-preview-label sketch-preview-label-commit"
          seed={value !== undefined ? value.toFixed(1) : label.replace(/[^\d.]/g, '')} {...previewEditProps(key, true, clickable ? onCommit : null)}
          onClick={(evt) => { evt.stopPropagation(); if (clickable) onCommit?.(); }}
        >{label}</DimensionLabel>
      </g>
    );
  };

  // Case B, distance sub-case: the exact same extension-line + dimension-
  // line + arrowheads + label layout as a real Line dimension (see
  // renderSinglePreview's line branch above, which this mirrors), treating
  // `from`→`to` as the two points to dimension between. Draggable (extend
  // the offset, slide the label) exactly like a real Dimension regardless
  // of whether it's committable — a read-only reading (a clearance, an
  // offset) can still be pulled out further to read clearly, it just can't
  // be edited (no onDoubleClick wired up) since there's no constraint type
  // to drive that change safely. When it IS committable, `len` computed
  // right here is always the exact value `onCommit` applies — every
  // committable case sets from/to to the two real points being
  // constrained, so there's no need to separately track/parse it.
  const renderDistancePreview = (key: string, from: { x: number; y: number }, to: { x: number; y: number }, label: string, clickable: boolean, onCommit: ((value?: number) => void) | null, gA: EntityGeom, gB: EntityGeom) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const ARROW = 2.5, EXT_GAP = 2.5, EXT_PAST = 2.5;
    const override = previewOverrides[key];
    let off: number;
    if (override) {
      off = override.offset;
    } else {
      const cx = points.reduce((s, p) => s + p.x, 0) / (points.length || 1);
      const cy = points.reduce((s, p) => s + p.y, 0) / (points.length || 1);
      const midx0 = (from.x + to.x) / 2, midy0 = (from.y + to.y) / 2;
      const towardCentroid = (cx - midx0) * nx + (cy - midy0) * ny;
      const sign = towardCentroid > 0 ? -1 : 1;
      off = sign * Math.max(10, Math.min(28, len * 0.18));
    }
    const a2 = { x: from.x + nx * off, y: from.y + ny * off };
    const b2 = { x: to.x + nx * off, y: to.y + ny * off };
    const s = off < 0 ? -1 : 1;
    const extA1 = { x: from.x + nx * EXT_GAP * s, y: from.y + ny * EXT_GAP * s };
    const extA2 = { x: from.x + nx * (Math.abs(off) + EXT_PAST) * s, y: from.y + ny * (Math.abs(off) + EXT_PAST) * s };
    const extB1 = { x: to.x + nx * EXT_GAP * s, y: to.y + ny * EXT_GAP * s };
    const extB2 = { x: to.x + nx * (Math.abs(off) + EXT_PAST) * s, y: to.y + ny * (Math.abs(off) + EXT_PAST) * s };
    const t = override?.labelT ?? 0.5;
    const lx = a2.x + (b2.x - a2.x) * t, ly = a2.y + (b2.y - a2.y) * t;
    return (
      <g key="pair-preview" className="dim-annotation">
        <line x1={extA1.x} y1={extA1.y} x2={extA2.x} y2={extA2.y} className="dim-ext-line" />
        <line x1={extB1.x} y1={extB1.y} x2={extB2.x} y2={extB2.y} className="dim-ext-line" />
        <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} className="dim-line" />
        {arrowhead(a2, { x: ux, y: uy }, ARROW)}
        {arrowhead(b2, { x: -ux, y: -uy }, ARROW)}
        <DimensionLabel x={lx} y={ly} dy={-3} textAnchor="middle"
          className={`dim-label ${clickable ? 'dim-label-commit' : 'dim-label-readonly'}`}
          seed={toU(len).toFixed(2)} {...previewEditProps(key, false, clickable ? onCommit : null)}
          onMouseDown={(evt) => startPreviewLabelDrag(evt, key, from, to, off, { mode: 'pair', gA, gB })}
          onClick={(evt) => { evt.stopPropagation(); if (clickable) onCommit?.(); }}
        >{label}</DimensionLabel>
        <line
          x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} className="dim-hit"
          onMouseDown={(evt) => startPreviewDrag(evt, key, from, to, { mode: 'pair', gA, gB })}
        />
      </g>
    );
  };

  // Case B (two entities): dispatches to the arc (Angle, purple preview
  // style) or arrowed-dimension (Distance, real dimension-green style)
  // renderer above — clickable only when computePairMeasure found an
  // exact-fit constraint to commit. `key` is a stable, order-independent id
  // for this entity pair so previewOverrides/editingPreviewKey survive a
  // re-render of the same two-entity selection. The distance case drags-to-
  // persist (see finalizePreviewDrag); the angle case has no drag gesture
  // (its arc's R is fixed and purely cosmetic, nothing to extend), so its
  // commit is wrapped to promote straight away instead — see
  // promotePairDimension — otherwise it would apply the constraint but the
  // arc/label would still vanish the instant you deselect the two lines.
  const renderPairPreview = (gA: EntityGeom, gB: EntityGeom, attached: boolean) => {
    const m = computePairMeasure(gA, gB, attached);
    if (!m) return null;
    const key = `pair:${[gA.id, gB.id].sort().join('|')}`;
    const clickable = !!m.commit;
    if (m.angle) {
      const commit = m.commit;
      const commitAndPromote = commit ? (v?: number) => { commit(v); promotePairDimension(gA, gB); } : null;
      return renderAngleArc(key, m.angle, m.label, clickable, commitAndPromote, m.value);
    }
    return renderDistancePreview(key, m.from, m.to, m.label, clickable, m.commit, gA, gB);
  };

  const lineLength = (l: Ln) => {
    const a = pointById.get(l.p1); const b = pointById.get(l.p2);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  };

  // A single line's own heading relative to +X, in [0, 360) — unlike
  // angleBetweenLines this has a real direction (p1 -> p2), so the full
  // circle is meaningful rather than folding it mod 180°.
  const lineAngleDeg = (l: Ln) => {
    const a = pointById.get(l.p1); const b = pointById.get(l.p2);
    if (!a || !b) return 0;
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return deg < 0 ? deg + 360 : deg;
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
      reader.readAsDataURL(file);
    });

  // "AI FEATURE" for the sketch canvas: hands an uploaded image to
  // cad_server.py's /sketch_from_image (OpenCV trace, optionally refined
  // and dimensioned by a local Ollama vision model — see image_to_sketch.py
  // for which), then merges whatever comes back straight into the real
  // sketch via mergeImportedSketch — no preview step, no reference image.
  const handleImageFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // so picking the same file again still fires onChange
    if (!file || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch(`${API_BASE}/sketch_from_image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      mergeImportedSketch(result);
    } catch (err) {
      setImportError(describeSolveError(err));
    } finally {
      setImporting(false);
    }
  };

  // Merges the preview into the real sketch: every previewed id is
  // rewritten to a fresh nextId() first (exactly how a freshly-clicked
  // point/line/circle gets its id everywhere else in this file) so an
  // import can never collide with existing or future entities, then the
  // merged sketch is solved once so any imported dimensions immediately
  // pull the geometry to the exact values that were read. Every added id
  // is kept in importSummary so undoImport() can remove exactly this
  // import — and nothing the user drew before or after it.
  const mergeImportedSketch = (result: {
    points: Pt[]; lines: Ln[]; circles: Circ[];
    constraints: { type: string; args: Record<string, unknown> }[];
    notes: string; ai_used: boolean;
    suggested_dimensions?: { label: string; p1: string; p2: string; value_mm: number }[];
  }) => {
    const pointIdMap = new Map<string, string>();
    const newPoints: Pt[] = result.points.map((p) => {
      const id = nextId('pt');
      pointIdMap.set(p.id, id);
      return { id, x: p.x, y: p.y };
    });
    const lineIdMap = new Map<string, string>();
    const newLines: Ln[] = result.lines.map((l) => {
      const id = nextId('ln');
      lineIdMap.set(l.id, id);
      return { id, p1: pointIdMap.get(l.p1) ?? l.p1, p2: pointIdMap.get(l.p2) ?? l.p2 };
    });
    const newCircles: Circ[] = result.circles.map((c) => ({
      id: nextId('ci'), center: pointIdMap.get(c.center) ?? c.center, r: c.r,
    }));
    const remapArg = (value: unknown): unknown =>
      typeof value === 'string' ? (pointIdMap.get(value) ?? lineIdMap.get(value) ?? value) : value;
    const newConstraints: Constraint[] = result.constraints.map((c) => {
      const args: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(c.args)) args[key] = remapArg(value);
      return { id: nextId('c'), type: c.type, args, label: `${c.type} (from image)` };
    });
    // Suggested dimensions reference the same "ip.../ishapec" ids as the
    // geometry above, so they need the same id remap — otherwise clicking
    // one later would try to dimension a point that no longer exists.
    const suggestedDimensions = (result.suggested_dimensions ?? []).map((sd) => ({
      label: sd.label,
      p1: pointIdMap.get(sd.p1) ?? sd.p1,
      p2: pointIdMap.get(sd.p2) ?? sd.p2,
      valueMm: sd.value_mm,
    }));

    const nextPoints = [...points, ...newPoints];
    const nextLines = [...lines, ...newLines];
    const nextCircles = [...circles, ...newCircles];
    const nextConstraints = [...constraints, ...newConstraints];
    setPoints(nextPoints);
    setLines(nextLines);
    setCircles(nextCircles);
    setConstraints(nextConstraints);
    setImportSummary({
      notes: result.notes,
      aiUsed: result.ai_used,
      counts: { points: newPoints.length, lines: newLines.length, circles: newCircles.length },
      pointIds: newPoints.map((p) => p.id),
      lineIds: newLines.map((l) => l.id),
      circleIds: newCircles.map((c) => c.id),
      constraintIds: newConstraints.map((c) => c.id),
      suggestedDimensions,
    });
    void solve(nextPoints, nextLines, nextCircles, nextConstraints);
  };

  // Removes exactly the entities/constraints the last image import added —
  // and nothing the user has drawn or edited since — the escape hatch for
  // a bad trace now that import lands directly on the canvas instead of
  // waiting behind an accept step.
  const undoImport = () => {
    if (!importSummary) return;
    const { pointIds, lineIds, circleIds, constraintIds } = importSummary;
    const deletedIds = new Set([...pointIds, ...lineIds, ...circleIds]);
    const nextPoints = points.filter((p) => !deletedIds.has(p.id));
    const nextLines = lines.filter((l) => !deletedIds.has(l.id));
    const nextCircles = circles.filter((c) => !deletedIds.has(c.id));
    // Also drops any *later* constraint the user applied against an
    // imported entity (e.g. clicking a "Suggested dimensions" chip) — that
    // constraint's own id was never tracked in importSummary, but it's
    // just as orphaned as the entity it pointed at once the entity is
    // gone. Same referencesDeleted check deleteSelected() uses for the
    // same reason: an Undo that left a dangling Distance/Fixed constraint
    // pointing at a deleted point would break the next solve.
    const referencesDeleted = (c: Constraint) => Object.values(c.args).some((v) => typeof v === 'string' && deletedIds.has(v));
    const nextConstraints = constraints.filter((c) => !constraintIds.includes(c.id) && !referencesDeleted(c));
    setPoints(nextPoints);
    setLines(nextLines);
    setCircles(nextCircles);
    setConstraints(nextConstraints);
    setImportSummary(null);
    if (nextPoints.length === 0 && nextLines.length === 0 && nextCircles.length === 0) {
      setDof(null); setStatus('Empty sketch'); setError(null);
    } else {
      void solve(nextPoints, nextLines, nextCircles, nextConstraints);
    }
  };

  const dismissImportSummary = () => setImportSummary(null);

  // One-click version of picking 2 points, clicking Distance, and typing a
  // value — for a suggested dimension whose points and estimated value are
  // already known. Mirrors commitPendingConstraint's 'distance' branch
  // (pin the first point as an anchor, upsert the constraint) but applies
  // straight away instead of opening the bottom-bar editor first; the
  // value is just image_to_sketch.py's best-effort estimate from the
  // traced pixels, so it's still a normal, later-editable Distance
  // constraint, not read-only. Removes the one suggestion that was
  // clicked from the banner so it can't be double-applied.
  const applySuggestedDistance = (sd: { label: string; p1: string; p2: string; valueMm: number }) => {
    const anchorPt = pointById.get(sd.p1);
    let next = anchorPt ? pinPoint(constraints, sd.p1, anchorPt) : constraints;
    next = upsertInList(
      next,
      (c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, sd.p1, sd.p2),
      'distance',
      { p1: sd.p1, p2: sd.p2, value: sd.valueMm },
      `Distance: ${sd.p1}–${sd.p2} = ${sd.valueMm}mm (${sd.label})`,
    );
    setConstraints(next);
    setImportSummary((prev) => (prev ? { ...prev, suggestedDimensions: prev.suggestedDimensions.filter((s) => s !== sd) } : prev));
    void solve(points, lines, circles, next);
  };
  return {
    renderDimension, gridSnap, addPoint, magnetPoint, unitsPerPx, originTol, originGuide, showOriginGuide, originGuideAt, markOrigin, markOriginMid, applyOriginLocks, originLockForMove, moveLockRef, findCurveSnapAt, findRefPointAt, snapLineToHV, findAlignmentGuide, findNearestPointOnLine, findArcSnap, hoverSnapAt, findTangentSnap, resolveDrawPoint, commitResolvedPoint, toggleSelect, selectedPoint, selectedLine, selectedCircle, selectedArc, selectedCurve, describeEntityId, relationsFor, pickEntityAt, entityOwningPoint, pointIdsForSelection, fmtRadius, fmtDiameter, describeItem, measureBetween, editingPreviewKey, setEditingPreviewKey, startPreviewDrag, startPreviewCircleDrag, startPreviewLabelDrag, commitPreviewEdit, commitSinglePreview, selectionPreview, renderSinglePreview, renderAngleArc, renderDistancePreview, renderPairPreview, lineLength, lineAngleDeg, readFileAsDataUrl, mergeImportedSketch, handleImageFileSelected, undoImport, dismissImportSummary, applySuggestedDistance,
  };
}

export type SnapAndSelect = ReturnType<typeof useSnapAndSelect>;
