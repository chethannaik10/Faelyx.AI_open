// Sketch & 2D: units, view controls (fit/zoom/normal view), hide/show, and editing of dimension annotations.
// A hook built on useSketchCore's state (assembled in handlers/index.ts).
import { useRef, useState } from 'react';
import type { Pt, Constraint, Dimension, ImportSummary } from '../types';
import { HIT_TOL, MIDPOINT_SNAP_TOL } from '../constants';
import { segParam, angleOfPts } from '../geometry';
import { DimensionLabel } from '../views/DimensionLabel';


import type { SketchCore, PointFeatureDivide, PointFeature, EntityGeom, PairMeasure } from '../useSketchCore';

export function useViewAndAnnotations(core: SketchCore, prev: Record<string, never>) {
  const {
    DEFAULT_VIEW_BOX, SKETCH_ORIGIN, allEntityGeoms, angleBetweenLines, chamferInfo, scaleChamfer, appearancePointRadius, arcs, circles, clientToSvg, colWidths, computePairMeasure, constraints, coordR, coordTheta, coordX, coordY, curveOffsetValue, curveTargetId, deleteIds, dimEditValue, dimensions, divideCount, divideFixedDistance, divideTargetId, editIsAngleRef, editingGroupId, editingPointId, entitiesAttached, geomById, grid, hiddenIds, lineAnchor, lineNormalDistance, lineNormalReverse, lineNormalSymmetric, lineNormalTargetId, lineSymAnchor, lineSymDistance, lines, mousePt, nextId, panLastRef, pinPoint, pointById, pointIdsForEntity, points, resizeStartRef, rotateLastRef, rotation, samePair, selected, selectedDimId, setArcs, setConstraints, setCurveTargetId, setDimEditValue, setDimensions, setDivideTargetId, setDraggingDimId, setDraggingLabelId, setEditingGroupId, setEditingPointId, setHiddenIds, setIsPanning, setIsRotating, setLineNormalDistance, setLineNormalTargetId, setLineSymAnchor, setLineSymDistance, setLines, setPoints, setResizingCol, setRotation, setError, setSelected, setSelectedDimId, setViewBox, setViewFlipped, solve, swapSpace, symmetricLineIdsRef, toU, unitMm, units, unpinPoint, upsertInList, viewBoxAround,
  } = core;
  void prev;
  const pointRadius = appearancePointRadius;

  // Snap step = the spacing between graduation lines (Primary Spacing ÷
  // Graduations), per direction.
  const gridStepX = grid.primaryH / Math.max(1, grid.gradH);

  const gridStepY = grid.primaryV / Math.max(1, grid.gradV);

  const uLabel = units;

  const lenNum = (s: string) => Number(s) * unitMm;

  const lenOrNull = (s: string) => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) ? n * unitMm : null; };

  const [coordMode, setCoordMode] = useState<'cartesian' | 'polar'>('cartesian');

  const [curveRef, setCurveRef] = useState<'start' | 'end'>('start');

  // Default anchor Start Point / default mode Length, per the CAD Workflow
  // spec — Percent stays available as a toggle, it's just no longer what a
  // freshly-picked entity starts on.
  const [curveOffsetMode, setCurveOffsetMode] = useState<'length' | 'percent'>('length');

  const [divideSpacingMode, setDivideSpacingMode] = useState<'equal' | 'fixed'>('equal');

  const pointFeaturesRef = useRef<Record<string, PointFeature>>({});

  // 2D Chamfer: two lengths, or a length plus the chamfer's angle to the
  // first element (CATIA's Length/Angle option).
  // Defaults to CATIA's own default, Length + Angle (45°).
  // 2D Chamfer modes (CATIA's three): two lengths, first length + angle, or
  // angle + hypotenuse (the chamfer line's own length).
  const [chamferMode, setChamferMode] = useState<'lengths' | 'angle' | 'hyp'>('angle');
  // Why the last chamfer (or the one being previewed) doesn't fit, if it doesn't.
  const [chamferIssue, setChamferIssue] = useState<string | null>(null);

  // Infinite Line's three options, and the Three Point Circle's optional
  // fixed radius (blank = pass through all three clicks).
  const [infiniteMode, setInfiniteMode] = useState<'h' | 'v' | '2pt'>('h');

  // Select toolbar's trap variants — which one a drag (or, for Polygon
  // Trap, a click sequence) on empty canvas performs in Select mode.
  const [trapMode, setTrapMode] = useState<'inside' | 'intersecting' | 'polygon' | 'paint' | 'outside' | 'intersecting-outside'>('inside');

  const isShown = (id: string) => hiddenIds.has(id) === swapSpace;

  // The "is my cursor over a start/end/midpoint right now" glyph — updated
  // on every canvas mousemove regardless of tool (see hoverSnapAt and
  // handleCanvasMouseMove), unlike mousePt/liveValue above which only
  // matter once a specific tool's own placement is already underway.
  const [hoverSnap, setHoverSnap] = useState<{ x: number; y: number; pointId: string | null; axis: 'h' | 'v' | null; guideH: Pt | null; guideV: Pt | null; onLine: boolean; midpoint: boolean; arcPoint?: boolean; onCurve?: boolean; curveKind?: 'intersection' | 'quadrant' | 'curve'; refPoint?: boolean; origin?: boolean; originMid?: boolean; label?: string } | null>(null);

  const startColResize = (key: 'col1' | 'col2' | 'col4') => (evt: React.MouseEvent) => {
    evt.preventDefault();
    resizeStartRef.current = { x: evt.clientX, width: colWidths[key] };
    setResizingCol(key);
  };

  // Radius / Start / End edits on an arc move its real endpoints (and so
  // anything joined to them), since the endpoints are what the arc is
  // re-derived from.
  const editArc = (id: string, patch: { r?: number; start?: number; end?: number }) => {
    const a = arcs.find((arc) => arc.id === id);
    if (!a) return;
    const next = { ...a, ...patch };
    const c = pointById.get(a.center);
    setArcs((as) => as.map((arc) => (arc.id === id ? next : arc)));
    if (!c) return;
    const at = (deg: number) => ({ x: c.x + next.r * Math.cos((deg * Math.PI) / 180), y: c.y + next.r * Math.sin((deg * Math.PI) / 180) });
    const e1 = at(next.start), e2 = at(next.end);
    const nextPoints = points.map((p) => (p.id === a.p1 ? { ...p, ...e1 } : p.id === a.p2 && a.p2 !== a.p1 ? { ...p, ...e2 } : p));
    setPoints(nextPoints);
    // Re-solve so anything tangent or joined to the arc follows the edit.
    void solve(nextPoints, lines, circles, constraints);
  };

  // Double-clicking a dimension's label opens this inline editor — typing a
  // new value and committing it actually redimensions the real geometry
  // (see commitDimensionEdit), the same "type a number, the sketch obeys"
  // idea as the Length/Radius fields in the selection editor, just reached
  // straight from the annotation instead of the sidebar.
  const [editingDimId, setEditingDimId] = useState<string | null>(null);

  // AI image-import: a picked file goes to POST /sketch_from_image, and
  // whatever it traces is merged straight into the real sketch — the same
  // points/lines/circles/constraints arrays as anything drawn by hand, so
  // it's instantly selectable and its dimensions editable, with no
  // separate preview/accept step and no reference image left behind.
  // importSummary is just a transient banner recording what was added, so
  // a bad trace can still be undone (see mergeImportedSketch/undoImport).
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const liveInputRef = useRef<HTMLInputElement>(null);

  const toSvgCoords = (evt: React.MouseEvent<SVGSVGElement>) => clientToSvg(evt.clientX, evt.clientY);

  const startPan = (evt: React.MouseEvent<SVGSVGElement>) => {
    evt.preventDefault();
    panLastRef.current = { x: evt.clientX, y: evt.clientY };
    setIsPanning(true);
  };

  const startRotate = (evt: React.MouseEvent<SVGSVGElement>) => {
    evt.preventDefault();
    rotateLastRef.current = { x: evt.clientX, y: evt.clientY };
    setIsRotating(true);
  };

  const fitView = () => { setViewBox(DEFAULT_VIEW_BOX); setRotation(0); setViewFlipped(false); };

  // Fit All In: every sketched element — and every dimension, which can
  // sit outside the geometry — brought into the visible space. Uses the
  // visible space only (Swap Visible Space fits the hidden elements).
  const fitAllIn = () => {
    const xs: number[] = [], ys: number[] = [];
    const add = (x: number, y: number) => { xs.push(x); ys.push(y); };
    for (const g of allEntityGeoms()) {
      if (!isShown(g.id)) continue;
      if (g.kind === 'point') add(g.x, g.y);
      else if (g.kind === 'line') { add(g.a.x, g.a.y); add(g.b.x, g.b.y); }
      else if (g.kind === 'circle' || g.kind === 'arc') { add(g.cx - g.r, g.cy - g.r); add(g.cx + g.r, g.cy + g.r); }
      else for (const p of g.pts) add(p.x, p.y);
    }
    // Dimensions: pad by the largest leader/offset so their text fits too.
    const dimPad = dimensions.reduce((m, d) => Math.max(m, Math.abs(d.offset) + 12), 0);
    if (xs.length === 0) { fitView(); return; }
    const minX = Math.min(...xs) - dimPad, maxX = Math.max(...xs) + dimPad;
    const minY = Math.min(...ys) - dimPad, maxY = Math.max(...ys) + dimPad;
    setViewBox(viewBoxAround(minX, minY, maxX, maxY));
  };

  // Zoom In / Zoom Out: one fixed increment per press, about the view center.
  const zoomStep = (factor: number) => setViewBox((vb) => {
    const f = Math.min(4000 / vb.w, Math.max(15 / vb.w, factor));
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    return { x: cx - (vb.w * f) / 2, y: cy - (vb.h * f) / 2, w: vb.w * f, h: vb.h * f };
  });

  // Normal View: re-orients the view normal to the sketch plane; if it
  // already is, reverses it (H flips 180°, V unchanged).
  const normalView = () => {
    if (rotation) { setRotation(0); return; }
    setViewFlipped((f) => !f);
  };

  // Hide/Show acts on the current selection: in the normal space it hides
  // it, in the swapped (hidden) space it shows it again. A hidden entity's
  // own defining points go with it, unless another visible entity still
  // uses them.
  const toggleHideSelection = (targets: string[] = selected) => {
    const picked = targets.filter((id) => !id.startsWith('__'));
    if (picked.length === 0) return;
    const ids = new Set<string>();
    for (const id of picked) {
      ids.add(id);
      for (const pid of pointIdsForEntity(id)) ids.add(pid);
    }
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (!swapSpace) {
        const keepVisible = new Set<string>();
        for (const l of lines) if (!ids.has(l.id) && !next.has(l.id)) { keepVisible.add(l.p1); keepVisible.add(l.p2); }
        for (const c of circles) if (!ids.has(c.id) && !next.has(c.id)) keepVisible.add(c.center);
        for (const a of arcs) if (!ids.has(a.id) && !next.has(a.id)) { keepVisible.add(a.center); if (a.p1) keepVisible.add(a.p1); if (a.p2) keepVisible.add(a.p2); }
        for (const id of ids) if (!(points.some((p) => p.id === id) && keepVisible.has(id) && !picked.includes(id))) next.add(id);
      } else {
        for (const id of ids) next.delete(id);
      }
      return next;
    });
    setSelected([]);
  };

  // Construction/Standard Element: flips the selected lines between a
  // standard (profile) element and a construction (reference-only) one.
  // Infinite lines are always construction, so they're left alone.
  const toggleConstructionSelection = () => {
    const ids = new Set(selected);
    if (!lines.some((l) => ids.has(l.id) && l.style !== 'infinite')) return;
    setLines((ls) => ls.map((l) => {
      if (!ids.has(l.id) || l.style === 'infinite') return l;
      return l.style === 'construction' ? { id: l.id, p1: l.p1, p2: l.p2 } : { ...l, style: 'construction' };
    }));
  };

  // Measure Item's dimension annotations — added to canvas the moment you
  // measure a Line/Circle/Arc (see the 'measure-item' branch of
  // handleCanvasClick below), and draggable afterwards (see the drag
  // effect + startDimDrag right below) so the extension/leader can be
  // pulled out as far as you like without ever landing back on top of the
  // real geometry it's measuring.
  const upsertDimension = (g: EntityGeom) => {
    if (g.kind !== 'line' && g.kind !== 'circle' && g.kind !== 'arc') return;
    setDimensions((prev) => {
      if (prev.some((d) => d.entityId === g.id)) return prev;
      if (g.kind === 'line') {
        const midx = (g.a.x + g.b.x) / 2, midy = (g.a.y + g.b.y) / 2;
        const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        // Default to whichever side of the line has less of the rest of
        // the sketch on it — away from every other point's centroid — so
        // a freshly-added dimension starts clear of nearby geometry
        // instead of guessing and sometimes landing right on top of it.
        const cx = points.reduce((s, p) => s + p.x, 0) / (points.length || 1);
        const cy = points.reduce((s, p) => s + p.y, 0) / (points.length || 1);
        const towardCentroid = (cx - midx) * nx + (cy - midy) * ny;
        const sign = towardCentroid > 0 ? -1 : 1;
        const offset = sign * Math.max(14, Math.min(36, len * 0.22));
        return [...prev, { id: `dim_${g.id}_${Date.now()}`, entityId: g.id, kind: 'line', offset }];
      }
      // Circle/Arc: point the leader away from the sketch's overall
      // centroid too, same reasoning as the line case above.
      const cx = points.reduce((s, p) => s + p.x, 0) / (points.length || 1);
      const cy = points.reduce((s, p) => s + p.y, 0) / (points.length || 1);
      const angle = Math.atan2(g.cy - cy, g.cx - cx) || -Math.PI / 4;
      return [...prev, { id: `dim_${g.id}_${Date.now()}`, entityId: g.id, kind: g.kind, offset: Math.max(14, g.r * 0.5), angle }];
    });
  };

  // A named constraint badge for a Point-flyout placement (Bisecting/Mid
  // Point's "Midpoint") — deliberately a no-op without a label, since the
  // "clean canvas, no coordinate text overlays" requirement means there's
  // no default coordinate callout to fall back to any more. Points by
  // Coordinates, Points on Curve and Divided Points get their "active
  // dimensional measurement" from addSegmentDimension's real length
  // dimensions instead (see its call sites) — this function is only ever
  // called with a label now.
  const commitPointDimension = (pointId: string, label?: string) => {
    if (!label) return;
    setDimensions((prev) => [...prev, { id: `dim_${pointId}_${Date.now()}`, kind: 'point', entityId: pointId, offset: 0, label }]);
  };

  // A distance dimension between two points that aren't necessarily joined
  // by a real sketch Ln — Points on Curve, Bisecting/Mid Point and
  // Divided Points all use this to show the segment length(s) their new
  // point(s) create relative to some reference (a curve's endpoint, a
  // line's two ends, each division's neighbors). Adds a lightweight
  // construction-style Ln purely so the existing Line dimension renderer
  // (which measures a real line entity) has something to attach to,
  // rather than teaching renderDimension a whole new "distance between two
  // arbitrary points" kind — offset direction mirrors upsertDimension's
  // own "away from the sketch's centroid" placement so a batch of these
  // (Divided Points especially) doesn't default to overlapping itself.
  const addSegmentDimension = (aId: string, bId: string) => {
    const a = pointById.get(aId);
    const b = pointById.get(bId);
    const lineId = nextId('ln');
    setLines((prev) => [...prev, { id: lineId, p1: aId, p2: bId, style: 'construction' }]);
    let offset = 10;
    if (a && b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const cx = points.reduce((s, p) => s + p.x, 0) / (points.length || 1);
      const cy = points.reduce((s, p) => s + p.y, 0) / (points.length || 1);
      const midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
      const towardCentroid = (cx - midx) * nx + (cy - midy) * ny;
      const sign = towardCentroid > 0 ? -1 : 1;
      offset = sign * Math.max(8, Math.min(20, len * 0.25));
    }
    setDimensions((prev) => [...prev, { id: `dim_${lineId}_${Date.now()}`, kind: 'line', entityId: lineId, offset }]);
    return lineId;
  };

  // Points by Coordinates' "Apply / Create Point" — reads whichever pair
  // of fields the Cartesian/Polar toggle currently shows and converts it
  // into an absolute canvas position relative to the active sketch
  // origin. Coordinates follow the same display convention as the
  // existing snap-tooltip/alignment-guide code above (dispX = ep.x -
  // SKETCH_ORIGIN.x, dispY = SKETCH_ORIGIN.y - ep.y — Y is flipped because
  // the sketch plane is Y-up while SVG is Y-down), inverted here so typing
  // Y-Offset=10 lands the point 10mm "up" on screen, and Polar's angle
  // runs counter-clockwise from the +X axis to match.
  const applyCoordPoint = () => {
    let x: number, y: number;
    if (coordMode === 'cartesian') {
      x = SKETCH_ORIGIN.x + (lenNum(coordX) || 0);
      y = SKETCH_ORIGIN.y - (lenNum(coordY) || 0);
    } else {
      const r = lenNum(coordR) || 0;
      const theta = ((Number(coordTheta) || 0) * Math.PI) / 180;
      x = SKETCH_ORIGIN.x + r * Math.cos(theta);
      y = SKETCH_ORIGIN.y - r * Math.sin(theta);
    }
    // No auto-dimension here on purpose — "places the point ... without
    // drawing coordinate text onto the workspace" is explicit for this
    // mode, and there's no other entity to attach a real length dimension
    // to (unlike Points on Curve/Divided Points, which measure from a
    // curve's own reference point instead).
    // Re-editing (a double-click on an existing Points-by-Coordinates
    // point) moves that same point id in place instead of creating a new
    // one, so Apply/Enter here really does "auto-update," not duplicate.
    if (editingPointId) {
      const id = editingPointId;
      setPoints((pts) => pts.map((p) => (p.id === id ? { ...p, x, y } : p)));
      pointFeaturesRef.current[id] = { mode: 'point-coord', coordMode, coordX, coordY, coordR, coordTheta };
      setEditingPointId(null);
      return;
    }
    const id = addPointExact(x, y);
    pointFeaturesRef.current[id] = { mode: 'point-coord', coordMode, coordX, coordY, coordR, coordTheta };
  };

  // Places a Points-on-Curve point at parametric t along entity g (see
  // pointAtCurveParam below), then adds its auto-dimension: a real segment
  // length back to whichever end curveRef points at (when that end has a
  // real Pt to measure from — see curveRefPointId) — no coordinate-text
  // callout on top, per the clean-canvas requirement. Shared by both the
  // canvas click-to-place path and the bottom bar's typed-offset Apply
  // button, so the two can never disagree about what they just placed.
  // `flipOverride` lets a direct click pass an already-absolute t (false)
  // without double-applying the Reference End toggle; omit it (as the
  // Apply button does) to fold curveRef in automatically.
  const commitCurvePoint = (g: EntityGeom, t: number, flipOverride?: boolean) => {
    const flip = flipOverride ?? curveRef === 'end';
    const pos = pointAtCurveParam(g, t, flip);
    if (!pos) return;
    // Re-editing an existing Points-on-Curve point: move that same point id
    // in place (never a new duplicate), drop its old auto-dimension
    // construction line (the reference end or target entity may have
    // changed) and add a fresh one, then refresh its feature record.
    if (editingPointId) {
      const id = editingPointId;
      const prevFeature = pointFeaturesRef.current[id];
      const prevDimLineId = prevFeature && prevFeature.mode === 'point-oncurve' ? prevFeature.dimLineId : null;
      if (prevDimLineId) {
        setLines((prev) => prev.filter((l) => l.id !== prevDimLineId));
        setDimensions((prev) => prev.filter((d) => d.entityId !== prevDimLineId));
      }
      setPoints((pts) => pts.map((p) => (p.id === id ? { ...p, x: pos.x, y: pos.y } : p)));
      const refId = curveRefPointId(g, curveRef);
      const dimLineId = refId && refId !== id ? addSegmentDimension(refId, id) : null;
      pointFeaturesRef.current[id] = { mode: 'point-oncurve', curveTargetId: g.id, curveRef, curveOffsetMode, curveOffsetValue, dimLineId };
      setEditingPointId(null);
      return;
    }
    const id = addPointExact(pos.x, pos.y);
    const refId = curveRefPointId(g, curveRef);
    const dimLineId = refId && refId !== id ? addSegmentDimension(refId, id) : null;
    pointFeaturesRef.current[id] = { mode: 'point-oncurve', curveTargetId: g.id, curveRef, curveOffsetMode, curveOffsetValue, dimLineId };
  };

  // The bottom bar's "Apply / Create Point" action for Points on Curve —
  // turns the typed Offset Distance/Percentage into a t (0..1) and hands
  // off to commitCurvePoint exactly like a canvas click would.
  const applyCurveOffset = () => {
    if (!curveTargetId) return;
    const g = geomById(curveTargetId);
    if (!g) return;
    const total = curveEntityLength(g);
    const val = (curveOffsetMode === 'percent' ? Number(curveOffsetValue) : lenNum(curveOffsetValue)) || 0;
    const t = curveOffsetMode === 'percent'
      ? Math.max(0, Math.min(100, val)) / 100
      : (total > 1e-6 ? Math.max(0, Math.min(total, val)) / total : 0);
    commitCurvePoint(g, t);
    setCurveTargetId(null);
  };

  // Equidistant/Divided Points' own "Apply / Create Point"-equivalent —
  // the bottom bar's Confirm button/Enter, and a 2nd canvas click, both
  // just call this. Equal Divisions splits the entity into exactly
  // divideCount equal segments (a line/arc/curve gets divideCount-1 new
  // interior points, since its own two ends already exist as real Pts; a
  // circle, having no end to anchor to, gets divideCount points spaced
  // all the way around instead). Fixed Distance Spacing instead walks the
  // entity in divideFixedDistance steps from its start until it runs out
  // of room (or, for a circle, rounds to however many equal steps come
  // closest to that spacing all the way around). Either way, every
  // segment the division creates — including the two end segments back to
  // the entity's own real endpoints — gets its own driving dimension, so
  // the on-canvas d1 = d2 = … reads as equal even though each is computed
  // independently off the live geometry.
  const applyDivision = () => {
    if (!divideTargetId) return;
    const g = geomById(divideTargetId);
    if (!g) return;
    // Re-editing an existing divided set (a double-click on any point in
    // it): the whole batch is regenerated from scratch rather than nudging
    // individual points, since Equal Divisions/Fixed Distance Spacing is a
    // single global layout, not N independently-movable points. deleteIds
    // cascades to the old points' own construction-line dimensions too.
    const priorGroupId = editingGroupId;
    if (priorGroupId) {
      const memberIds = Object.keys(pointFeaturesRef.current).filter((id) => {
        const f = pointFeaturesRef.current[id];
        return f && f.mode === 'point-divide' && f.groupId === priorGroupId;
      });
      if (memberIds.length) deleteIds(memberIds);
      memberIds.forEach((id) => { delete pointFeaturesRef.current[id]; });
    }
    const total = curveEntityLength(g);
    const isClosed = g.kind === 'circle';
    const newIds: string[] = [];
    const placeAt = (t: number) => { const pos = pointAtCurveParam(g, t, false); if (pos) newIds.push(addPointExact(pos.x, pos.y)); };
    if (divideSpacingMode === 'fixed') {
      const d = Math.max(1e-6, lenNum(divideFixedDistance) || 1);
      if (isClosed) {
        const n = Math.max(2, Math.round(total / d));
        for (let i = 0; i < n; i++) placeAt(i / n);
      } else {
        let count = Math.floor(total / d + 1e-6);
        if (count > 0 && Math.abs(count * d - total) < 1e-6) count -= 1; // don't duplicate the existing end point
        for (let i = 1; i <= count; i++) placeAt((i * d) / (total || 1));
      }
    } else {
      const n = Math.max(2, Math.round(Number(divideCount) || 5));
      if (isClosed) { for (let i = 0; i < n; i++) placeAt(i / n); }
      else { for (let i = 1; i < n; i++) placeAt(i / n); }
    }
    if (newIds.length === 0) { setDivideTargetId(null); setEditingGroupId(null); return; }
    const chain: string[] = [];
    const startId = isClosed ? null : curveRefPointId(g, 'start');
    const endId = isClosed ? null : curveRefPointId(g, 'end');
    if (startId) chain.push(startId);
    chain.push(...newIds);
    if (endId) chain.push(endId);
    for (let i = 1; i < chain.length; i++) addSegmentDimension(chain[i - 1], chain[i]);
    const groupId = priorGroupId ?? nextId('grp');
    const feature: PointFeatureDivide = { mode: 'point-divide', groupId, divideTargetId, divideCount, divideSpacingMode, divideFixedDistance, memberIds: newIds };
    newIds.forEach((id) => { pointFeaturesRef.current[id] = feature; });
    setDivideTargetId(null);
    setEditingGroupId(null);
  };

  // The perpendicular "foot" of a Line Normal to a Curve — the point on
  // entity g straight across from wherever (mx, my) currently is: for a
  // straight line, its parametric projection (segParam); for a circle/arc,
  // the point on it along the ray from center through (mx, my) (the true
  // normal direction on a circle is always radial); for a spline/curve,
  // the nearest sampled point; for an already-picked point entity, the
  // point itself. Factored out of the original click handler so both the
  // click-to-commit path and the live canvas preview compute the exact
  // same foot, and so the new Symmetrical Extension tool can reuse it when
  // its own first click lands on an existing curve/entity.
  const computeNormalFoot = (g: EntityGeom, mx: number, my: number): { x: number; y: number } => {
    if (g.kind === 'line') {
      // Midpoint detection takes priority over the generic projection —
      // same CATIA-style "the exact center wins over merely close" rule
      // findLineMidpoint gives the base Line tool (see resolveDrawPoint),
      // so hovering/clicking near a target line's own middle sets the foot
      // exactly there instead of at whatever the raw perpendicular
      // projection happens to compute for a cursor that's merely close.
      const mid = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
      if (Math.hypot(mid.x - mx, mid.y - my) < MIDPOINT_SNAP_TOL) return mid;
      const t = segParam(g.a, g.b, { x: mx, y: my });
      return { x: g.a.x + t * (g.b.x - g.a.x), y: g.a.y + t * (g.b.y - g.a.y) };
    }
    if (g.kind === 'circle' || g.kind === 'arc') {
      const ang = (angleOfPts({ x: g.cx, y: g.cy }, { x: mx, y: my }) * Math.PI) / 180;
      return { x: g.cx + g.r * Math.cos(ang), y: g.cy + g.r * Math.sin(ang) };
    }
    if (g.kind === 'curve') {
      let best = g.pts[0], bestD = Infinity;
      for (const p of g.pts) { const d = Math.hypot(p.x - mx, p.y - my); if (d < bestD) { bestD = d; best = p; } }
      return { x: best.x, y: best.y };
    }
    return { x: g.x, y: g.y }; // kind === 'point' — the foot is the point itself
  };

  // Line Normal to a Curve's full geometry — the foot (see above) plus the
  // two endpoints of the line that will actually get drawn, honoring the
  // Distance/Reverse/Symmetrical Extension controls. Direction is derived
  // from foot -> (mx, my), which for a straight line is already exactly
  // perpendicular to it (that's what segParam's projection guarantees) and
  // for a circle/arc is already exactly radial — the same direction the
  // original eyeballed implementation used, just now reusable with an
  // optional exact length and either toggle applied on top of it. When
  // Distance is left blank, `length` falls back to the raw eyeballed
  // foot-to-cursor distance, so leaving every new control untouched
  // reproduces the original, unchanged behavior exactly.
  const computeNormalLine = (
    g: EntityGeom, mx: number, my: number,
    distanceStr: string, reverse: boolean, symmetric: boolean,
  ): { footX: number; footY: number; x1: number; y1: number; x2: number; y2: number; length: number } => {
    const foot = computeNormalFoot(g, mx, my);
    let ux = mx - foot.x, uy = my - foot.y;
    let ulen = Math.hypot(ux, uy);
    if (ulen < 1e-6) {
      // The cursor sits exactly on the foot (e.g. Apply clicked before any
      // mouse movement past the pick) — fall back to a well-defined
      // direction instead of a degenerate zero-length one.
      if (g.kind === 'line') {
        const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y;
        const dl = Math.hypot(dx, dy) || 1;
        ux = -dy / dl; uy = dx / dl;
      } else if (g.kind === 'circle' || g.kind === 'arc') {
        ux = foot.x - g.cx; uy = foot.y - g.cy;
        const dl = Math.hypot(ux, uy) || 1; ux /= dl; uy /= dl;
      } else {
        ux = 0; uy = -1;
      }
      ulen = 1;
    }
    ux /= ulen; uy /= ulen;
    if (reverse) { ux = -ux; uy = -uy; }
    const typed = lenNum(distanceStr);
    const hasTyped = distanceStr !== '' && Number.isFinite(typed) && typed > 0;
    const rawDist = Math.hypot(mx - foot.x, my - foot.y) || 1;
    if (symmetric) {
      // A typed Length is the line's TOTAL length, split evenly to both
      // sides (half = typed / 2). Left blank, the mouse-side endpoint must
      // still land exactly on the cursor — same as the non-symmetric,
      // unchanged eyeballed behavior — so half is the full raw foot-to-
      // cursor distance, not half of it (halving that here was the bug:
      // it made the cursor visibly outrun the line by 2x while dragging).
      const half = hasTyped ? typed / 2 : rawDist;
      const length = half * 2;
      return { footX: foot.x, footY: foot.y, x1: foot.x - ux * half, y1: foot.y - uy * half, x2: foot.x + ux * half, y2: foot.y + uy * half, length };
    }
    const length = hasTyped ? typed : rawDist;
    return { footX: foot.x, footY: foot.y, x1: foot.x, y1: foot.y, x2: foot.x + ux * length, y2: foot.y + uy * length, length };
  };

  // Commits Line Normal to a Curve — called both by a second canvas click
  // (which passes that click's own (x, y) so it never disagrees with what
  // was just previewed there) and by the Inspector/bottom-bar Apply button
  // (which has no click position of its own, so it reuses the last-tracked
  // mousePt instead).
  const applyLineNormal = (mx?: number, my?: number) => {
    if (!lineNormalTargetId) return;
    const g = geomById(lineNormalTargetId);
    const mp = mx !== undefined && my !== undefined ? { x: mx, y: my } : mousePt;
    if (!g || !mp) return;
    const { x1, y1, x2, y2 } = computeNormalLine(g, mp.x, mp.y, lineNormalDistance, lineNormalReverse, lineNormalSymmetric);
    // placeLineEndpoint (not a raw addPointExact) — reuses an existing
    // point/midpoint the computed endpoint lands exactly on instead of
    // always creating a duplicate (see placeLineEndpoint above).
    const p1 = placeLineEndpoint(x1, y1);
    const p2 = placeLineEndpoint(x2, y2);
    const lineId = nextId('ln');
    setLines((ls) => [...ls, { id: lineId, p1, p2 }]);
    // Symmetrical Extension was on — remember this line as symmetric so a
    // later Length edit defaults to Center instead of Start (see
    // symmetricLineIdsRef above).
    if (lineNormalSymmetric) symmetricLineIdsRef.current.add(lineId);
    setLineNormalTargetId(null);
    setLineNormalDistance('');
  };

  // The Symmetrical Extension Line's full geometry — a straight line
  // centered on `anchor`, running toward (mx, my) on one side and mirrored
  // exactly opposite on the other, so the anchor is always the true
  // midpoint. Distance (when typed) is the line's TOTAL length, split
  // evenly to both sides; left blank, each side instead tracks the live
  // anchor-to-cursor distance, so dragging away from the anchor expands
  // both ends outward together.
  const computeSymmetricLine = (
    anchor: { x: number; y: number }, mx: number, my: number, distanceStr: string,
  ): { x1: number; y1: number; x2: number; y2: number; length: number } => {
    let ux = mx - anchor.x, uy = my - anchor.y;
    let ulen = Math.hypot(ux, uy);
    if (ulen < 1e-6) { ux = 1; uy = 0; ulen = 1; }
    ux /= ulen; uy /= ulen;
    const typed = lenNum(distanceStr);
    const half = distanceStr !== '' && Number.isFinite(typed) && typed > 0 ? typed / 2 : ulen;
    return { x1: anchor.x - ux * half, y1: anchor.y - uy * half, x2: anchor.x + ux * half, y2: anchor.y + uy * half, length: half * 2 };
  };

  // Commits the Symmetrical Extension Line — same click-vs-Apply dual entry
  // point as applyLineNormal above.
  const applyLineSymmetric = (mx?: number, my?: number) => {
    if (!lineSymAnchor) return;
    const mp = mx !== undefined && my !== undefined ? { x: mx, y: my } : mousePt;
    if (!mp) return;
    const { x1, y1, x2, y2 } = computeSymmetricLine(lineSymAnchor, mp.x, mp.y, lineSymDistance);
    // placeLineEndpoint — see applyLineNormal above for why this replaces
    // a raw addPointExact.
    const p1 = placeLineEndpoint(x1, y1);
    const p2 = placeLineEndpoint(x2, y2);
    const lineId = nextId('ln');
    setLines((ls) => [...ls, { id: lineId, p1, p2 }]);
    // Always symmetric by construction — see symmetricLineIdsRef above.
    symmetricLineIdsRef.current.add(lineId);
    setLineSymAnchor(null);
    setLineSymDistance('');
  };

  const startDimDrag = (evt: React.MouseEvent, id: string) => {
    evt.stopPropagation();
    evt.preventDefault();
    setDraggingDimId(id);
  };

  const startLabelDrag = (evt: React.MouseEvent, id: string) => {
    evt.stopPropagation();
    evt.preventDefault();
    setDraggingLabelId(id);
  };

  const commitDimensionEdit = (dim: Dimension) => {
    const value = editIsAngleRef.current ? Number(dimEditValue) : lenNum(dimEditValue);
    setEditingDimId(null);
    if (!Number.isFinite(value) || value <= 0) return;
    // A 'pair' dimension has no geometry of its own to redimension — it just
    // hands the typed value to whichever real constraint computePairMeasure
    // found for this pair (the same `commit` a click on the ephemeral
    // preview would have used), which is only ever present for the exact-fit
    // cases (point-point, line-line angle, circle/arc centers, or a line-line
    // gap that lands exactly on two endpoints) — never for a clearance/
    // tangent reading, since there's no constraint type to drive that safely.
    if (dim.kind === 'pair') {
      const gA = geomById(dim.entityIdA!); const gB = geomById(dim.entityIdB!);
      if (!gA || !gB) return;
      const m = computePairMeasure(gA, gB, entitiesAttached(gA, gB));
      if (!m) return;
      // Angle pair: the number just typed is whatever sector is currently
      // on screen (spanDeg), not necessarily the canonical line1/line2
      // angle commitPairAngle expects (baseAngleDeg) — the two adjacent
      // sectors read as that angle's supplement. angleCommitValue converts
      // back to the right family before handing it to commit, so typing
      // "60" while looking at the supplementary sector correctly drives
      // the base angle to 120 (which then redisplays as 60 in that sector).
      if (m.angle) {
        const pointerAngle = dim.angle ?? defaultAnglePointer(m.angle.dirA, m.angle.dirB);
        const { spanDeg } = angleSectorGeometry(m.angle, pointerAngle, dim.offset || 16);
        const baseAngleDeg = angleBetweenLines(gA.id, gB.id);
        m.commit?.(angleCommitValue(spanDeg, baseAngleDeg, value));
        return;
      }
      m.commit?.(value);
      return;
    }
    const g = geomById(dim.entityId!);
    if (!g) return;
    if (dim.kind === 'line' && g.kind === 'line') {
      // A chamfer's own length dimension only rescales that chamfer.
      if (chamferInfo(g.id)) { scaleChamfer(g.id, value); return; }
      // Center: same symmetric-about-the-midpoint handling as
      // commitLineLength's 'center' branch, for a dimension double-clicked
      // directly on the canvas rather than edited from the Selection panel.
      if (lineAnchor === 'center') {
        const midx = (g.a.x + g.b.x) / 2, midy = (g.a.y + g.b.y) / 2;
        const curLen = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) || 1;
        const ux = (g.b.x - g.a.x) / curLen, uy = (g.b.y - g.a.y) / curLen;
        const half = value / 2;
        const na = { x: midx - ux * half, y: midy - uy * half };
        const nb = { x: midx + ux * half, y: midy + uy * half };
        const nextPoints = points.map((p) => (p.id === g.a.id ? { ...p, ...na } : p.id === g.b.id ? { ...p, ...nb } : p));
        setPoints(nextPoints);
        let next = unpinPoint(constraints, g.a.id);
        next = unpinPoint(next, g.b.id);
        next = upsertInList(next, (c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, g.a.id, g.b.id), 'distance', { p1: g.a.id, p2: g.b.id, value }, `Distance: ${g.a.id}–${g.b.id} = ${value}mm`);
        setConstraints(next);
        void solve(nextPoints, lines, circles, next);
        return;
      }
      const anchorId = lineAnchor === 'p1' ? g.a.id : g.b.id;
      const otherId = anchorId === g.a.id ? g.b.id : g.a.id;
      const anchorPt = pointById.get(anchorId);
      let next = unpinPoint(constraints, otherId);
      if (anchorPt) next = pinPoint(next, anchorId, anchorPt);
      next = upsertInList(next, (c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, g.a.id, g.b.id), 'distance', { p1: g.a.id, p2: g.b.id, value }, `Distance: ${g.a.id}–${g.b.id} = ${value}mm`);
      setConstraints(next);
      void solve(points, lines, circles, next);
    } else if (dim.kind === 'circle' && g.kind === 'circle') {
      // The label (and the input the user just typed into) reads as a
      // Diameter for a circle — halve it back to the real radius before it
      // drives the underlying radius constraint.
      const radius = value / 2;
      upsertConstraint((c) => c.type === 'radius' && c.args.circle === g.id, 'radius', { circle: g.id, value: radius }, `Radius: ${g.id} = ${radius}mm`);
    } else if (dim.kind === 'arc' && g.kind === 'arc') {
      editArc(g.id, { r: value });
    }
  };

  // What a read-only reading (a clearance or tangent gap — nothing a
  // constraint can drive) says when a new value is typed into it.
  const READ_ONLY_EDIT = 'This measurement is read-only — no constraint can drive it (e.g. a clearance or tangent gap). Constrain the entities directly instead.';

  // The edit wiring every persisted Dimension label hands to DimensionLabel:
  // double-click seeds the editor, Enter/blur commits through
  // commitDimensionEdit, Escape cancels. `readOnly` labels still open the
  // editor (the same gesture everywhere) but explain instead of committing.
  const dimEditProps = (dim: Dimension, isAngle: boolean, readOnly = false) => ({
    editing: editingDimId === dim.id,
    onStartEdit: (seed: string) => { editIsAngleRef.current = isAngle; setDimEditValue(seed); setEditingDimId(dim.id); },
    onChange: setDimEditValue,
    onCommit: (_value: string, changed: boolean) => {
      if (!readOnly) { commitDimensionEdit(dim); return; }
      setEditingDimId(null);
      if (changed) setError(READ_ONLY_EDIT);
    },
    onCancel: () => setEditingDimId(null),
  });

  // A small filled triangle whose tip sits at `tip`, pointing along
  // `dir` (a unit vector) — used for both ends of a linear dimension, the
  // circle/arc leader's single arrowhead, and the sketch origin's H/V arrows
  // (which pass their own className to get the yellow axis styling instead
  // of the dimension green).
  const arrowhead = (tip: { x: number; y: number }, dir: { x: number; y: number }, size: number, className = 'dim-arrow') => {
    const back = { x: tip.x + dir.x * size, y: tip.y + dir.y * size };
    const px = -dir.y, py = dir.x;
    const left = { x: back.x + px * size * 0.42, y: back.y + py * size * 0.42 };
    const right = { x: back.x - px * size * 0.42, y: back.y - py * size * 0.42 };
    return <polygon points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`} className={className} />;
  };

  // Shared visual for "the cursor is precisely snapped onto X" — used both
  // by the Line tool's live preview once an anchor is placed and by its
  // hover-before-the-first-click preview (see handleCanvasMouseMove and the
  // two render blocks below). A plain square+crosshair reticle marks any
  // exact snap; an extra small ring is layered above-left of it whenever
  // the point isn't a literal stored vertex — an H/V lock, this line's own
  // midpoint, an alignment-guide intersection, or a point along an existing
  // line's span — so "square alone" reads as "this is a real endpoint" and
  // "square plus ring" reads as "this is a computed point", the same
  // distinction a CATIA-style snap cursor draws. A small live coordinate
  // readout (relative to the sketch origin, matching the H/V axis arrows'
  // own sense of direction — right and up are positive) floats just
  // above-right of the reticle either way.
  const renderSnapGlyph = (resolved: { x: number; y: number; pointId: string | null; axis: 'h' | 'v' | null; guideH: Pt | null; guideV: Pt | null; onLine: boolean; midpoint: boolean; arcPoint?: boolean; onCurve?: boolean; curveKind?: 'intersection' | 'quadrant' | 'curve'; refPoint?: boolean; origin?: boolean; originMid?: boolean; label?: string; tangentTo?: { id: string } | null }) => {
    // An arc's own start/end (arcPoint && !midpoint — see findArcSnap) is a
    // real endpoint of the arc even though it isn't a separate stored
    // Point, so it gets the same plain reticle a true vertex does, not the
    // ring+dot reserved for a computed/derived spot like a midpoint.
    // Locked on the plane's centre (0, 0): drawn by the canvas itself as the origin marker with its H / V crosshair (see CanvasStage).
    if (resolved.origin) return null;
    const isVertex = !!resolved.pointId || (!!resolved.arcPoint && !resolved.midpoint) || !!resolved.refPoint;
    const isComputed = !isVertex && !!(resolved.axis || resolved.guideH || resolved.guideV || resolved.midpoint || resolved.onLine || resolved.onCurve || resolved.tangentTo);
    if (!isVertex && !isComputed) return null;
    const ep = { x: resolved.x, y: resolved.y };
    // No coordinate text here per the "clean canvas" requirement — just the
    // geometric glyph (reticle for a real vertex, ring+dot added when it's
    // a computed snap). The live X/Y readout this used to show next to the
    // cursor is gone; Points by Coordinates' own Inspector/bottom-bar
    // fields are the place to read or type exact numbers now.
    return <g className="sketch-snap-glyph">
      {isComputed && <circle cx={ep.x - 3.4} cy={ep.y - 3.4} r={1.3} className="sketch-snap-ring" />}
      {isComputed && <circle cx={ep.x - 3.4} cy={ep.y - 3.4} r={0.55} className="sketch-snap-ring-dot" />}
      <rect x={ep.x - 1.6} y={ep.y - 1.6} width={3.2} height={3.2} className="sketch-snap-reticle" />
      {/* a snap onto a curve says what it found: a crossing gets an X, a quadrant point a diamond, any other spot on a curve a small label */}
      {resolved.curveKind === 'intersection' && <path d={`M${ep.x - 3} ${ep.y - 3}L${ep.x + 3} ${ep.y + 3}M${ep.x + 3} ${ep.y - 3}L${ep.x - 3} ${ep.y + 3}`} className="sketch-snap-ring" />}
      {resolved.curveKind === 'quadrant' && <path d={`M${ep.x} ${ep.y - 3.4}L${ep.x + 3.4} ${ep.y}L${ep.x} ${ep.y + 3.4}L${ep.x - 3.4} ${ep.y}Z`} className="sketch-snap-ring" />}
      {resolved.label && <text x={ep.x + 5} y={ep.y - 4} className="sketch-snap-coord">{resolved.label}</text>}
    </g>;
  };

  // Places a point at EXACTLY (x, y), bypassing the background grid round —
  // for the cases below the background grid snap, findAlignmentGuide and
  // findNearestPointOnLine, where the coordinate has already been snapped
  // onto something more meaningful than the grid (another point's own X/Y,
  // or a spot on an existing line): rounding it again afterward could pull
  // it back off that alignment whenever the thing it aligned to isn't
  // itself grid-aligned.
  const addPointExact = (x: number, y: number) => {
    const id = nextId('pt');
    setPoints((pts) => [...pts, { id, x, y }]);
    return id;
  };

  const findNearestPoint = (x: number, y: number): Pt | null => {
    let best: Pt | null = null; let bestD = HIT_TOL;
    for (const p of points) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  };

  // Offers a line's exact geometric midpoint as its own snap target —
  // distinct from findNearestPointOnLine's "anywhere along the span" foot
  // below, the same way a vertex is distinct from an edge. Checked with a
  // tighter, purpose-built tolerance (MIDPOINT_SNAP_TOL) so the midpoint
  // wins over the generic on-line snap whenever the cursor is genuinely
  // near center, rather than the two constantly fighting over the same
  // pixels. `excludeLineId` mirrors findNearestPointOnLine's own param.
  const findLineMidpoint = (x: number, y: number, excludeLineId?: string | null): { x: number; y: number } | null => {
    let best: { x: number; y: number } | null = null; let bestD = MIDPOINT_SNAP_TOL;
    for (const l of lines) {
      if (l.id === excludeLineId) continue;
      const a = pointById.get(l.p1); const b = pointById.get(l.p2);
      if (!a || !b) continue;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = Math.hypot(mid.x - x, mid.y - y);
      if (d < bestD) { bestD = d; best = mid; }
    }
    return best;
  };

  // The single choke point every Line-flyout tool (Line Normal to a Curve,
  // Symmetrical Extension, and any future one) routes its FINAL, already-
  // computed endpoint through before creating it — so start-point, end-
  // point and midpoint detection is the automatic default there too,
  // exactly like the base Line tool gets from resolveDrawPoint, rather than
  // each new tool having to reimplement it (or, as before this fix, skip it
  // entirely and always drop a fresh duplicate point via addPointExact even
  // when the computed coordinate lands exactly on a point or midpoint that
  // already exists). Deliberately narrower than resolveDrawPoint though: no
  // H/V axis-lock and no alignment-guide repositioning here, since those
  // are direction inferences for a freehand click, and this coordinate has
  // already been computed precisely (a perpendicular foot, an exact typed
  // Length, a symmetric half) — nudging it to "line up with" some unrelated
  // point would silently corrupt that geometry. It only reuses something
  // that is genuinely already sitting at that exact spot.
  // Same reuse-only priority as placeLineEndpoint (existing point beats an
  // existing line's exact midpoint beats the raw computed coordinate), but
  // returning the resolveDrawPoint-shaped result renderSnapGlyph already
  // knows how to draw — so the Line Normal to a Curve / Symmetrical
  // Extension live previews can show the same square-reticle-plus-ring
  // feedback the base Line tool shows, confirming ON SCREEN, before the
  // click that commits it, that a given endpoint will land on/reuse a real
  // point or midpoint rather than silently create a duplicate. One
  // resolver, used both to decide what placeLineEndpoint actually creates
  // and to decide what the preview glyph shows, so the two can never drift
  // out of sync with each other.
  const resolveLineEndpoint = (x: number, y: number): { x: number; y: number; pointId: string | null; axis: 'h' | 'v' | null; guideH: Pt | null; guideV: Pt | null; onLine: boolean; midpoint: boolean } => {
    const hit = findNearestPoint(x, y);
    if (hit) return { x: hit.x, y: hit.y, pointId: hit.id, axis: null, guideH: null, guideV: null, onLine: false, midpoint: false };
    const mid = findLineMidpoint(x, y);
    if (mid) return { x: mid.x, y: mid.y, pointId: null, axis: null, guideH: null, guideV: null, onLine: false, midpoint: true };
    return { x, y, pointId: null, axis: null, guideH: null, guideV: null, onLine: false, midpoint: false };
  };

  const placeLineEndpoint = (x: number, y: number): string => {
    const resolved = resolveLineEndpoint(x, y);
    return resolved.pointId ?? addPointExact(resolved.x, resolved.y);
  };

  // Total length "around" an entity — a line's own length, a circle's full
  // circumference, an arc's own sweep length, or a curve's cumulative
  // polyline length — the denominator Points on Curve's percentage mode
  // and Divided Points' Fixed Distance Spacing both divide by.
  const curveEntityLength = (g: EntityGeom): number => {
    if (g.kind === 'line') return Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
    if (g.kind === 'circle') return 2 * Math.PI * g.r;
    if (g.kind === 'arc') {
      const raw = arcs.find((a) => a.id === g.id);
      const sweep = raw ? (((raw.end - raw.start) % 360) + 360) % 360 || 360 : 360;
      return g.r * (sweep * Math.PI / 180);
    }
    if (g.kind === 'curve') {
      let len = 0;
      for (let i = 1; i < g.pts.length; i++) len += Math.hypot(g.pts[i].x - g.pts[i - 1].x, g.pts[i].y - g.pts[i - 1].y);
      return len;
    }
    return 0;
  };

  // A point at parametric position t (0..1) along an entity, measured from
  // its "start" — a line's own a, an arc's own start angle, a circle's 0°
  // (3 o'clock), or a curve's first control point — and reversed end-to-
  // end when `flip` is set (or Points on Curve's own Reference-End toggle
  // is "End", which callers fold into `flip` before getting here). This is
  // the one place Points on Curve and Divided Points both go to actually
  // place a point, so the two tools can never disagree about what "40%
  // along" or "point 3 of 5" means.
  const pointAtCurveParam = (g: EntityGeom, t: number, flip: boolean): { x: number; y: number } | null => {
    const tt = flip ? 1 - t : t;
    if (g.kind === 'line') return { x: g.a.x + tt * (g.b.x - g.a.x), y: g.a.y + tt * (g.b.y - g.a.y) };
    if (g.kind === 'circle') {
      const ang = tt * 2 * Math.PI;
      return { x: g.cx + g.r * Math.cos(ang), y: g.cy + g.r * Math.sin(ang) };
    }
    if (g.kind === 'arc') {
      const raw = arcs.find((a) => a.id === g.id);
      const start = raw ? raw.start : 0;
      const sweep = raw ? (((raw.end - raw.start) % 360) + 360) % 360 || 360 : 360;
      const ang = (start + tt * sweep) * (Math.PI / 180);
      return { x: g.cx + g.r * Math.cos(ang), y: g.cy + g.r * Math.sin(ang) };
    }
    if (g.kind === 'curve') {
      const pts = g.pts;
      if (pts.length === 0) return null;
      if (pts.length === 1) return pts[0];
      const total = curveEntityLength(g);
      if (total < 1e-6) return pts[0];
      const target = tt * total;
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (acc + seg >= target) {
          const localT = seg < 1e-9 ? 0 : (target - acc) / seg;
          return { x: pts[i - 1].x + localT * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + localT * (pts[i].y - pts[i - 1].y) };
        }
        acc += seg;
      }
      return pts[pts.length - 1];
    }
    return null;
  };

  // The Pt id anchoring t=0/t=1 for a given entity + reference-end choice
  // — used to draw Points on Curve's own auto-dimension (a segment back to
  // whichever end the offset was measured from). A circle has no real
  // endpoint to reference, so this only ever returns one for line/arc; an
  // arc's endpoints aren't stored as their own Pt, so this approximates by
  // finding the nearest existing point to that angle (true whenever the
  // arc's own start/end click left a real Pt there, which is the normal case).
  const curveRefPointId = (g: EntityGeom, ref: 'start' | 'end'): string | null => {
    if (g.kind === 'line') return ref === 'start' ? g.a.id : g.b.id;
    if (g.kind === 'arc') {
      const raw = arcs.find((a) => a.id === g.id);
      if (!raw) return null;
      const angDeg = ref === 'start' ? raw.start : raw.end;
      const ang = (angDeg * Math.PI) / 180;
      const near = findNearestPoint(g.cx + g.r * Math.cos(ang), g.cy + g.r * Math.sin(ang));
      return near ? near.id : null;
    }
    return null;
  };

  // The default arc position before anyone's dragged it — the bisector of
  // the shortest path from dirA to dirB, exactly what the angle arc always
  // used to be drawn at before it became draggable.
  const defaultAnglePointer = (dirA: number, dirB: number) => {
    let diff = dirB - dirA;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return dirA + diff / 2;
  };

  // Two lines' full (infinite) extensions split the plane around their
  // vertex into 4 angular sectors, not just the one between where the two
  // segments actually point — real CAD calls picking one of these an
  // "angular sector" (this is literally FreeCAD's term for it). Given
  // where the user last dragged the arc to (`pointerAngle`, full 360°
  // around the vertex — see dim.angle/previewOverrides), this works out
  // which of the 4 sectors it's sitting in: the two directions (each
  // either a line's real forward ray or its backward extension) that
  // bracket it, the arc between them, arrowheads pointing outward at each
  // end, and — for whichever bracketing direction is a *backward*
  // extension — a dashed leader from the vertex out to the arc, since the
  // real line segment doesn't reach that way and nothing else would draw
  // it. This is what makes dragging the arc past a segment's own end show
  // the supplementary/vertical angle on the other side, matching the
  // reference video's second, reflected angle reading.
  const angleSectorGeometry = (info: { vertex: { x: number; y: number }; dirA: number; dirB: number }, pointerAngle: number, R: number) => {
    const TWO_PI = Math.PI * 2;
    const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
    const dirs = [
      { theta: norm(info.dirA), reversed: false },
      { theta: norm(info.dirA + Math.PI), reversed: true },
      { theta: norm(info.dirB), reversed: false },
      { theta: norm(info.dirB + Math.PI), reversed: true },
    ].sort((a, b) => a.theta - b.theta);
    const p = norm(pointerAngle);
    let lo = dirs[3], hi = { theta: dirs[0].theta + TWO_PI, reversed: dirs[0].reversed };
    for (let i = 0; i < 3; i++) {
      if (p >= dirs[i].theta && p <= dirs[i + 1].theta) { lo = dirs[i]; hi = dirs[i + 1]; break; }
    }
    const spanDeg = ((hi.theta - lo.theta) * 180) / Math.PI;
    const p1 = { x: info.vertex.x + R * Math.cos(lo.theta), y: info.vertex.y + R * Math.sin(lo.theta) };
    const p2 = { x: info.vertex.x + R * Math.cos(hi.theta), y: info.vertex.y + R * Math.sin(hi.theta) };
    const mid = (lo.theta + hi.theta) / 2;
    const lx = info.vertex.x + (R + 9) * Math.cos(mid), ly = info.vertex.y + (R + 9) * Math.sin(mid);
    // Outward tangents for the two arrowheads — sweep always runs lo -> hi
    // (increasing angle) by construction, so "outward" is simply back
    // along the sweep at p1 and forward along it at p2.
    const tangent = (theta: number) => ({ x: -Math.sin(theta), y: Math.cos(theta) });
    const t1 = tangent(lo.theta), t2 = tangent(hi.theta);
    const arrowDir1 = { x: -t1.x, y: -t1.y };
    const arrowDir2 = t2;
    const extensions: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    if (lo.reversed) extensions.push({ from: info.vertex, to: { x: info.vertex.x + (R + 4) * Math.cos(lo.theta), y: info.vertex.y + (R + 4) * Math.sin(lo.theta) } });
    if (hi.reversed) extensions.push({ from: info.vertex, to: { x: info.vertex.x + (R + 4) * Math.cos(hi.theta), y: info.vertex.y + (R + 4) * Math.sin(hi.theta) } });
    return { p1, p2, lx, ly, spanDeg, arrowDir1, arrowDir2, extensions };
  };

  // Converts a typed value for whichever sector is currently on screen
  // back into the canonical line1/line2 angle commitPairAngle expects.
  // The 4 sectors come in two "families" of equal measure — the picked
  // sector and its vertical opposite share the base angle as-is, while the
  // two adjacent sectors are its supplement (180 - base) — so typing 60°
  // while looking at the supplementary sector has to drive the base angle
  // to 120° for the display to actually read 60° afterward, not silently
  // land on the wrong family.
  const angleCommitValue = (spanDeg: number, baseAngleDeg: number, typed: number) => {
    const sameFamily = Math.abs(spanDeg - baseAngleDeg) <= Math.abs(spanDeg - (180 - baseAngleDeg));
    return sameFamily ? typed : 180 - typed;
  };

  // A persisted Angle pair (dim.kind === 'pair', m.angle set — see
  // promotePairDimension). Now draggable exactly like a real Dimension
  // (see startDimDrag's own pair/angle branch above): dim.offset is the
  // arc's radius, dim.angle is the "pointer" — where around the vertex the
  // arc/label was last dragged to, full 360° — and angleSectorGeometry
  // turns that pointer into whichever of the two lines' 4 angular sectors
  // it's currently sitting in (see that helper's own comment for the
  // "extends in reverse"/FreeCAD-sector framing), plus the arrowhead
  // directions and any backward-extension leader line that sector needs.
  // The label always shows spanDeg — the CURRENTLY DISPLAYED sector's own
  // angle — rather than m.label/m.value (computePairMeasure's fixed
  // base-angle reading), since dragging into the supplementary sector
  // should read as that sector's own (180 - base) value, not the original
  // one; the double-click edit box seeds from the same spanDeg for the
  // same reason, and commitDimensionEdit converts whatever's typed back
  // to the base-angle family angleCommitValue expects before calling
  // m.commit. Wired to the same editingDimId/dimEditValue/
  // commitDimensionEdit/selectedDimId every other persisted Dimension
  // uses, so it survives deselecting the two lines exactly like before.
  const renderPersistedAngleDim = (dim: Dimension, gA: EntityGeom, gB: EntityGeom, m: PairMeasure) => {
    const info = m.angle!;
    const R = dim.offset || 16;
    const pointerAngle = dim.angle ?? defaultAnglePointer(info.dirA, info.dirB);
    const { p1, p2, lx, ly, spanDeg, arrowDir1, arrowDir2, extensions } = angleSectorGeometry(info, pointerAngle, R);
    const ARROW = 2;
    const clickable = !!m.commit;
    const isSelected = selected.includes(gA.id) || selected.includes(gB.id);
    const isFocused = selectedDimId === dim.id;
    const label = spanDeg.toFixed(1);
    const arcPath = `M ${p1.x} ${p1.y} A ${R} ${R} 0 0 1 ${p2.x} ${p2.y}`;
    return (
      <g key={dim.id} className={`dim-annotation ${isSelected ? 'dim-selected' : ''} ${isFocused ? 'dim-focused' : ''}`}>
        {extensions.map((ext, i) => (
          <line key={i} x1={ext.from.x} y1={ext.from.y} x2={ext.to.x} y2={ext.to.y} className="angle-ext-line" />
        ))}
        <path d={arcPath} className="sketch-preview-line angle-arc" fill="none" />
        {arrowhead(p1, arrowDir1, ARROW, 'angle-arrow')}
        {arrowhead(p2, arrowDir2, ARROW, 'angle-arrow')}
        <DimensionLabel x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          className={`sketch-preview-label dim-label ${clickable ? '' : 'dim-label-readonly'}`}
          seed={spanDeg.toFixed(1)} {...dimEditProps(dim, true, !clickable)}
          onMouseDown={(evt) => startDimDrag(evt, dim.id)}
          onClick={(evt) => { evt.stopPropagation(); setSelectedDimId(dim.id); }}
        >{label}</DimensionLabel>
        <path
          d={arcPath}
          fill="none"
          className="dim-hit"
          onMouseDown={(evt) => startDimDrag(evt, dim.id)}
          onClick={(evt) => { evt.stopPropagation(); setSelectedDimId(dim.id); }}
        />
      </g>
    );
  };

  // A persisted pair measurement (dim.kind === 'pair', created by
  // finalizePreviewDrag the moment the user drags one of the ephemeral pair
  // previews above) — visually the same extension-line/arrow/label layout
  // as renderDistancePreview, but sourced from dim.offset/dim.labelT
  // (real, stored state) instead of previewOverrides, and wired to the
  // exact same startDimDrag/startLabelDrag/commitDimensionEdit every other
  // Dimension uses (both already handle dim.kind === 'pair' — see above),
  // so once promoted it behaves exactly like a Measure Item dimension:
  // draggable, selectable, deletable, and — only when computePairMeasure
  // still finds a real constraint to drive — double-click editable. An
  // Angle pair (m.angle set) dispatches to renderPersistedAngleDim instead
  // — it has no offset/extension lines to draw, just the fixed-radius arc.
  const renderPairDimension = (dim: Dimension) => {
    const gA = geomById(dim.entityIdA!);
    const gB = geomById(dim.entityIdB!);
    if (!gA || !gB) return null;
    const m = computePairMeasure(gA, gB, entitiesAttached(gA, gB));
    if (!m) return null;
    if (m.angle) return renderPersistedAngleDim(dim, gA, gB, m);
    const { from, to, label, commit } = m;
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const ARROW = 2.5, EXT_GAP = 2.5, EXT_PAST = 2.5;
    const off = dim.offset;
    const a2 = { x: from.x + nx * off, y: from.y + ny * off };
    const b2 = { x: to.x + nx * off, y: to.y + ny * off };
    const s = off < 0 ? -1 : 1;
    const extA1 = { x: from.x + nx * EXT_GAP * s, y: from.y + ny * EXT_GAP * s };
    const extA2 = { x: from.x + nx * (Math.abs(off) + EXT_PAST) * s, y: from.y + ny * (Math.abs(off) + EXT_PAST) * s };
    const extB1 = { x: to.x + nx * EXT_GAP * s, y: to.y + ny * EXT_GAP * s };
    const extB2 = { x: to.x + nx * (Math.abs(off) + EXT_PAST) * s, y: to.y + ny * (Math.abs(off) + EXT_PAST) * s };
    const t = dim.labelT ?? 0.5;
    const lx = a2.x + (b2.x - a2.x) * t, ly = a2.y + (b2.y - a2.y) * t;
    const clickable = !!commit;
    const isSelected = selected.includes(gA.id) || selected.includes(gB.id);
    const isFocused = selectedDimId === dim.id;
    return (
      <g key={dim.id} className={`dim-annotation ${isSelected ? 'dim-selected' : ''} ${isFocused ? 'dim-focused' : ''}`}>
        <line x1={extA1.x} y1={extA1.y} x2={extA2.x} y2={extA2.y} className="dim-ext-line" />
        <line x1={extB1.x} y1={extB1.y} x2={extB2.x} y2={extB2.y} className="dim-ext-line" />
        <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} className="dim-line" />
        {arrowhead(a2, { x: ux, y: uy }, ARROW)}
        {arrowhead(b2, { x: -ux, y: -uy }, ARROW)}
        <DimensionLabel
          x={lx} y={ly} dy={-3} textAnchor="middle"
          className={`dim-label ${clickable ? '' : 'dim-label-readonly'}`}
          seed={toU(len).toFixed(2)} {...dimEditProps(dim, false, !clickable)}
          onMouseDown={(evt) => startLabelDrag(evt, dim.id)}
          onClick={(evt) => { evt.stopPropagation(); setSelectedDimId(dim.id); }}
        >{label}</DimensionLabel>
        <line
          x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} className="dim-hit"
          onMouseDown={(evt) => startDimDrag(evt, dim.id)}
          onClick={(evt) => { evt.stopPropagation(); setSelectedDimId(dim.id); }}
        />
      </g>
    );
  };

  // Single-upsert convenience wrapper for call sites that only ever touch
  // one constraint at a time.
  const upsertConstraint = (predicate: (c: Constraint) => boolean, type: string, args: Record<string, unknown>, label: string) => {
    const next = upsertInList(constraints, predicate, type, args, label);
    setConstraints(next);
    void solve(points, lines, circles, next);
  };
  return {
    pointRadius, gridStepX, gridStepY, uLabel, lenNum, lenOrNull, coordMode, setCoordMode, curveRef, setCurveRef, curveOffsetMode, setCurveOffsetMode, divideSpacingMode, setDivideSpacingMode, pointFeaturesRef, chamferMode, setChamferMode, chamferIssue, setChamferIssue, infiniteMode, setInfiniteMode, trapMode, setTrapMode, isShown, hoverSnap, setHoverSnap, startColResize, editArc, editingDimId, setEditingDimId, importSummary, setImportSummary, importError, setImportError, fileInputRef, liveInputRef, toSvgCoords, startPan, startRotate, fitView, fitAllIn, zoomStep, normalView, toggleHideSelection, toggleConstructionSelection, upsertDimension, commitPointDimension, addSegmentDimension, addPointExact, applyCoordPoint, curveEntityLength, pointAtCurveParam, findNearestPoint, curveRefPointId, commitCurvePoint, applyCurveOffset, applyDivision, computeNormalFoot, computeNormalLine, findLineMidpoint, resolveLineEndpoint, placeLineEndpoint, applyLineNormal, computeSymmetricLine, applyLineSymmetric, startDimDrag, startLabelDrag, defaultAnglePointer, angleSectorGeometry, angleCommitValue, upsertConstraint, commitDimensionEdit, dimEditProps, READ_ONLY_EDIT, arrowhead, renderSnapGlyph, renderPersistedAngleDim, renderPairDimension,
  };
}

export type ViewAndAnnotations = ReturnType<typeof useViewAndAnnotations>;
