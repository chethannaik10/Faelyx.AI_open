// Sketch & 2D: the canvas click handler (what a click does for every tool).
// A hook built on useSketchCore's state (assembled in handlers/index.ts).
import {
  bisectingLine, intersectTargets, } from '../../sketchGeometry2d';
import type { Pt, Ln, Arc, Constraint } from '../types';
import { angleOfPts, angleInSweep, perpDistanceToLine, infiniteLineIntersect, regularPolygonPoints, computeFillet, circumcenter3 } from '../geometry';


import type { SketchCore, EntityGeom } from '../useSketchCore';
import type { ViewAndAnnotations } from './viewAndAnnotations';
import type { SnapAndSelect } from './snapAndSelect';
import type { DrawingTools } from './drawingTools';
import type { TrimAndChamfer } from './trimAndChamfer';
import { isModifyTool, type ModifyTools } from './modifyTools';

export function useCanvasClick(core: SketchCore, prev: ViewAndAnnotations & SnapAndSelect & DrawingTools & TrimAndChamfer & ModifyTools) {
  const {
    arcDraftRef, arcs, cancelPending, circles, conicRho, constraints, curveTargetId, divideTargetId, dragMovedRef, filletRadius, geomById, lineNormalPointFirst, lineNormalStart, lineNormalTargetId, lineSymAnchor, lines, measureFirstRef, nextId, pendingRef, pointById, points, polygonCircumscribed, polygonSides, selectedDimId, setArcs, setCircles, setConstraints, setCurveOffsetValue, setCurveTargetId, setCurves, setDivideTargetId, setLineNormalStart, setLineNormalTargetId, setLineSymAnchor, setLines, setLiveValue, setMeasureResult, setMousePt, setPending, setPoints, setSelected, setSelectedDimId, setTool, setTrapPoly, setWizardPolyPts, solve, suppressClickRef, toU, tool, trapPoly, wizardIdsRef, wizardPtsRef,
  } = core;
  const {
    addInfiniteLine, addLinesWithPoints, addPoint, addPointExact, magnetPoint, addSegmentDimension, applyChamfer, applyDivision, applyLineNormal, applyLineSymmetric, asTarget, biTangentFor, build3PtArc, buildSlot, circle3ptFixedR, commitPointDimension, commitQuad, commitRectangle, commitResolvedPoint, computeNormalFoot, curveEntityLength, curveRefPointId, describeItem, entityOwningPoint, findNearestPoint, finishLine, gridSnap, infiniteMode, isCurved, keyholeShape, lenNum, measureBetween, pickCurveAt, pickEntityAt, pointAtCurveParam, pointFeaturesRef, profileClick, resolveDrawPoint, setCurveOffsetMode, setCurveRef, tangentArcFrom, toSvgCoords, toggleHideSelection, toggleSelect, trapMode, triTangentFor, trimAt, upsertDimension,
  } = prev;
  const { modHandleClick } = prev;
  const handleCanvasClick = (evt: React.MouseEvent<SVGSVGElement>) => {
    // The click trailing a Zoom Area / Zoom In Out drag isn't a tool click.
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    // Placing tools see the click pulled onto a curve / crossing / quadrant point under the cursor (picking tools get it unchanged).
    const rawPt = toSvgCoords(evt);
    const { x, y } = magnetPoint(rawPt.x, rawPt.y);
    // A click that reaches here never originated on a dimension's own
    // hit-line or label — those stop propagation before setting
    // selectedDimId themselves (see renderDimension) — so any click that
    // does reach here is "somewhere else," and clears that selection the
    // same way clicking empty canvas clears an entity selection.
    if (selectedDimId) setSelectedDimId(null);

    // MODIFY tools: Mirror / Translate / Rotate / Offset / Project 3D Element (handlers/modifyTools.tsx)
    if (isModifyTool(tool)) { modHandleClick(x, y); return; }

    if (tool === 'select') {
      // A click that's really just the tail end of a genuine box/move drag
      // (mousedown -> mousemove -> mouseup all fire a trailing click too) —
      // don't also toggle-select whatever's under the release point.
      if (dragMovedRef.current) { dragMovedRef.current = false; return; }
      const hit = pickEntityAt(x, y);
      // Polygon Trap: once a polygon is started every click adds a corner
      // (double-click closes it); a first click on empty canvas starts one.
      if (trapMode === 'polygon' && (trapPoly.length > 0 || !hit)) {
        setTrapPoly((pts) => [...pts, { x, y }]);
        setMousePt({ x, y });
        return;
      }
      if (hit) toggleSelect(hit.id);
      else setSelected([]);
      return;
    }

    if (tool === 'measure-item') {
      const hit = pickEntityAt(x, y);
      if (hit) { setSelected([hit.id]); setMeasureResult({ kind: 'item', lines: describeItem(hit) }); upsertDimension(hit); }
      return;
    }

    if (tool === 'measure-between') {
      const hit = pickEntityAt(x, y);
      if (!hit) return;
      if (!measureFirstRef.current) {
        measureFirstRef.current = hit.id;
        setSelected([hit.id]);
        setMeasureResult(null);
      } else {
        const first = measureFirstRef.current === hit.id ? null : geomById(measureFirstRef.current);
        measureFirstRef.current = null;
        if (first) {
          setSelected([first.id, hit.id]);
          setMeasureResult({ kind: 'between', lines: measureBetween(first, hit) });
          // Done: drop back to Select instead of silently re-arming for a
          // 3rd click. This also makes the on-canvas CATIA-style preview
          // show up automatically — selectionPreview only draws while
          // tool === 'select' (see selectionPreview below), so switching
          // now is what lets this pair render/drag/edit exactly like a
          // plain 2-click Select-tool pick, instead of the picked pair
          // only ever showing up as text in the Inspector panel.
          setTool('select');
        } else {
          // Clicked the same entity twice — treat as a cancel and stay
          // armed for a fresh first pick, same as before.
          setSelected([]);
        }
      }
      return;
    }

    if (tool === 'point') { commitResolvedPoint(x, y); return; }

    // Hide/Show as its own tool (choose it, then click elements): hides
    // what's clicked in the normal space, shows it again in the swapped one.
    if (tool === 'hide-show') {
      const hit = pickEntityAt(x, y);
      if (hit) toggleHideSelection([hit.id]);
      return;
    }

    if (tool === 'line') {
      // resolveDrawPoint carries the exact same CATIA-style priority the
      // live preview below already shows you (existing point > H/V lock
      // off the line's own start > alignment guide to some other point's
      // X/Y > a snap onto an existing line's own span > the raw, grid-
      // snapped cursor) — computed fresh here rather than trusting
      // whatever the last mousemove saw, so a click that lands slightly
      // off from the last rendered preview frame still resolves the same
      // way the user was shown it would.
      const anchor = pendingRef.current ? pointById.get(pendingRef.current) ?? null : null;
      const resolved = resolveDrawPoint(x, y, anchor);
      const passthroughGrid = !resolved.pointId && !resolved.axis && !resolved.guideH && !resolved.guideV && !resolved.onLine && !resolved.midpoint && !resolved.onCurve;
      if (pendingRef.current) {
        // Second click: through finishLine, which also handles the
        // Symmetrical Extension toggle. The H/V lock isn't just a placement
        // snap — finishLine adds the same real Horizontal/Vertical
        // constraint the toolbar's own H/V buttons add, so the line stays
        // level/plumb after later edits too.
        const end = passthroughGrid ? gridSnap(resolved.x, resolved.y) : { x: resolved.x, y: resolved.y };
        finishLine(pendingRef.current, end, resolved.pointId ?? null, resolved.axis ?? null, false, 'tangentTo' in resolved ? resolved.tangentTo ?? null : null, !!resolved.originMid);
        return;
      }
      const id = resolved.pointId ?? (passthroughGrid ? addPoint(resolved.x, resolved.y) : addPointExact(resolved.x, resolved.y));
      pendingRef.current = id; setPending(id);
      setMousePt({ x, y }); setLiveValue('0.00');
      return;
    }

    if (tool === 'circle') {
      if (!pendingRef.current) {
        const hit = findNearestPoint(x, y);
        const id = hit ? hit.id : addPoint(x, y);
        pendingRef.current = id; setPending(id);
        setMousePt({ x, y }); setLiveValue('0.00');
      } else {
        const center = pointById.get(pendingRef.current);
        if (center) {
          // The radius-fixing click snaps the same way the center did —
          // matches the now grid-snapped live preview (see
          // handleCanvasMouseMove's trackedPt) so the circle that lands is
          // never a surprise relative to what was just shown while dragging.
          const rim = gridSnap(x, y);
          const r = Math.max(2, Math.hypot(rim.x - center.x, rim.y - center.y));
          setCircles((cs) => [...cs, { id: nextId('cir'), center: center.id, r }]);
        }
        cancelPending();
      }
      return;
    }

    // Rectangle: click one corner, then the opposite corner — an
    // axis-aligned box built the same way CATIA's own Rectangle tool
    // does, with Horizontal/Vertical constraints applied to its 4 edges
    // immediately, so it's fully constrained (only draggable at its
    // corners, not skewable) the instant it's drawn.
    if (tool === 'rectangle') {
      if (!pendingRef.current) {
        const hit = findNearestPoint(x, y);
        const id = hit ? hit.id : addPoint(x, y);
        pendingRef.current = id; setPending(id);
        setMousePt({ x, y });
      } else {
        const anchor = pointById.get(pendingRef.current);
        if (anchor) { const corner = gridSnap(x, y); commitRectangle(anchor, false, corner.x, corner.y, false); }
        cancelPending();
      }
      return;
    }

    // Arc: 3 clicks — center, then a point on the circle that fixes the
    // radius and start angle, then a 3rd click that fixes the end angle.
    // Stored as a center point + radius + start/end sweep, same as a
    // circle plus angular bounds (see the Arc type comment up top for why
    // the radius/sweep aren't solver-driven yet).
    if (tool === 'arc') {
      if (!pendingRef.current) {
        const hit = findNearestPoint(x, y);
        const id = hit ? hit.id : addPoint(x, y);
        pendingRef.current = id; setPending(id);
        arcDraftRef.current = null;
        setMousePt({ x, y });
        return;
      }
      const center = pointById.get(pendingRef.current);
      if (!center) { cancelPending(); return; }
      if (!arcDraftRef.current) {
        const rim = gridSnap(x, y);
        const r = Math.max(2, Math.hypot(rim.x - center.x, rim.y - center.y));
        const start = angleOfPts(center, rim);
        arcDraftRef.current = { r, start };
        setMousePt({ x, y });
        return;
      }
      const sweepPt = gridSnap(x, y);
      const end = angleOfPts(center, sweepPt);
      const { r, start } = arcDraftRef.current;
      setArcs((as) => [...as, { id: nextId('arc'), center: center.id, r, start, end }]);
      cancelPending();
      return;
    }

    // --- Point flyout: Point by Coordinates / Points on Curve ---
    // Point by Coordinates is driven entirely by the X/Y (or R/θ) fields in
    // the bottom bar (see the viewport-hint section below) — a canvas
    // click isn't part of its workflow, so there's nothing to do here.
    if (tool === 'point-oncurve') {
      // First click just picks the target entity — curveTargetId is real
      // React state (not a ref) specifically so the Inspector/bottom bar's
      // Reference End / Distance / Flip controls can react to it and drive
      // a live preview (see the canvas preview block and the bottom-bar
      // block further down). Fix for the Dimension Sync Bug: there is no
      // "2nd click = eyeball placement" fallback any more — a stray click
      // used to silently override a typed Distance with whatever arbitrary
      // spot it landed on. Committing now happens ONLY via Apply/Enter (see
      // applyCurveOffset) or the on-canvas dimension text's inline edit, so
      // the placed point always matches the typed value 1:1. Once an
      // entity is picked, further bare canvas clicks are no-ops — Esc picks
      // a different one.
      if (curveTargetId) return;
      const hit = pickEntityAt(x, y);
      if (hit && hit.kind !== 'point') {
        setCurveTargetId(hit.id);
        // "Always set default anchor to Start Point and default mode to
        // Length" — reset on every fresh pick, not just the state's own
        // initial default, so re-picking after a Length/% or Start/End
        // change doesn't carry it into the next entity.
        setCurveRef('start');
        setCurveOffsetMode('length');
        // Seed a concrete, non-arbitrary starting value (half the entity's
        // length) so "a preview point immediately appears... at a default
        // position" has something real to show before the user types anything.
        const half = curveEntityLength(hit) / 2;
        setCurveOffsetValue(half > 1e-6 ? toU(half).toFixed(2) : '0');
      }
      return;
    }

    // --- Line flyout: Line Normal to Curve ---
    if (tool === 'line-normal' && lineNormalPointFirst) {
      if (!lineNormalStart) {
        const hit = findNearestPoint(x, y);
        setLineNormalStart(hit ? { x: hit.x, y: hit.y, id: hit.id } : { ...gridSnap(x, y), id: null });
        setMousePt({ x, y });
        return;
      }
      const g = pickCurveAt(x, y);
      if (!g || g.kind === 'point') return;
      const foot = computeNormalFoot(g, lineNormalStart.x, lineNormalStart.y);
      if (Math.hypot(foot.x - lineNormalStart.x, foot.y - lineNormalStart.y) < 1e-6) return;
      const newPts: Pt[] = [];
      const startId = lineNormalStart.id ?? nextId('pt');
      if (!lineNormalStart.id) newPts.push({ id: startId, x: lineNormalStart.x, y: lineNormalStart.y });
      const footPt: Pt = { id: nextId('pt'), x: foot.x, y: foot.y };
      const lineId = nextId('ln');
      // A normal to a line is a real perpendicular constraint.
      const cons: Constraint[] = g.kind === 'line' && !g.id.startsWith('__')
        ? [{ id: nextId('c'), type: 'perpendicular', args: { line1: g.id, line2: lineId }, label: `Perpendicular: ${g.id} / ${lineId}` }] : [];
      addLinesWithPoints([...newPts, footPt], [{ id: lineId, p1: startId, p2: footPt.id }], cons);
      setLineNormalStart(null);
      return;
    }
    if (tool === 'line-normal') {
      // First click just picks the target entity — lineNormalTargetId is
      // real React state (not the old wizardIdsRef) specifically so the
      // Inspector/bottom bar's Distance/Reverse/Symmetrical Extension
      // controls can react to it and drive a live preview (see the canvas
      // preview block and the Inspector panel further down), the same
      // reactive-state pattern Points on Curve uses for curveTargetId.
      // Once an entity is picked, a further click commits the line using
      // THIS click's own position — Esc picks a different entity.
      if (!lineNormalTargetId) {
        const hit = pickEntityAt(x, y);
        // A click that lands on an existing point resolves to that point
        // (pickEntityAt's own priority), but the target here has to be a
        // curve-like entity — look up what that point is actually built
        // from (see entityOwningPoint) instead of silently ignoring the
        // click, so clicking directly on a line/curve's own endpoint still
        // picks it, with the foot anchored right there.
        const resolvedHit = hit && hit.kind === 'point' ? entityOwningPoint(hit.id) : hit;
        if (resolvedHit) {
          setLineNormalTargetId(resolvedHit.id);
          setMousePt({ x, y });
        }
        return;
      }
      applyLineNormal(x, y);
      return;
    }
    // --- Line flyout: Symmetrical Extension ---
    if (tool === 'line-symmetric') {
      // First click sets the anchor (center) the line will expand out from
      // on both sides — landing on an existing point keeps that exact
      // point's position (start/end-point detection), landing on a bare
      // line/circle/arc/curve projects onto it (reusing the same foot math
      // Line Normal to Curve uses, which now also snaps onto that line's
      // own midpoint — see computeNormalFoot), and landing on empty canvas
      // just uses the click position directly. A further click commits the
      // line, routing its computed endpoints through placeLineEndpoint so
      // start/end-point and midpoint detection apply there too.
      if (!lineSymAnchor) {
        const hit = pickEntityAt(x, y);
        const anchor = hit ? (hit.kind === 'point' ? { x: hit.x, y: hit.y } : computeNormalFoot(hit, x, y)) : { x, y };
        setLineSymAnchor(anchor);
        setMousePt({ x, y });
        return;
      }
      applyLineSymmetric(x, y);
      return;
    }

    // --- Line flyout: Infinite / Bi-Tangent / Bisecting Line ---
    if (tool === 'line-infinite') {
      const hit = findNearestPoint(x, y);
      const p = hit ? { x: hit.x, y: hit.y } : gridSnap(x, y);
      if (infiniteMode === 'h') { addInfiniteLine(p, { x: 1, y: 0 }, 'h'); return; }
      if (infiniteMode === 'v') { addInfiniteLine(p, { x: 0, y: -1 }, 'v'); return; }
      const pts = wizardPtsRef.current;
      if (pts.length === 0) { wizardPtsRef.current = [p]; setMousePt({ x, y }); return; }
      wizardPtsRef.current = [];
      const d = Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
      if (d < 1e-6) return;
      addInfiniteLine(pts[0], { x: (p.x - pts[0].x) / d, y: (p.y - pts[0].y) / d }, null);
      return;
    }
    if (tool === 'line-bitangent') {
      const hit = pickCurveAt(x, y);
      if (!isCurved(hit)) return;
      if (wizardIdsRef.current.length === 0) { wizardIdsRef.current = [hit.id]; wizardPtsRef.current = [{ x, y }]; return; }
      if (hit.id === wizardIdsRef.current[0]) return;
      const g1 = geomById(wizardIdsRef.current[0]);
      const q1 = wizardPtsRef.current[0];
      wizardIdsRef.current = []; wizardPtsRef.current = [];
      if (!isCurved(g1)) return;
      const res = biTangentFor(g1, hit, q1, { x, y });
      if (!res) return;
      const a: Pt = { id: nextId('pt'), ...res.t1 }, b: Pt = { id: nextId('pt'), ...res.t2 };
      const lineId = nextId('ln');
      // Tangent constraints at both ends — circles, arcs and free-form
      // curves (ellipse, conic, spline) are all solver elements now.
      const cons: Constraint[] = [g1, hit].map((g) => ({
        id: nextId('c'), type: 'tangent_line_curve', args: { line: lineId, curve: g.id }, label: `Tangent: ${lineId}, ${g.id}`,
      }));
      addLinesWithPoints([a, b], [{ id: lineId, p1: a.id, p2: b.id }], cons);
      return;
    }
    if (tool === 'line-bisect') {
      const hit = pickCurveAt(x, y);
      if (!hit || hit.kind !== 'line') return;
      if (wizardIdsRef.current.length === 0) { wizardIdsRef.current = [hit.id]; wizardPtsRef.current = [{ x, y }]; return; }
      if (hit.id === wizardIdsRef.current[0]) return;
      const g1 = geomById(wizardIdsRef.current[0]);
      const q1 = wizardPtsRef.current[0];
      wizardIdsRef.current = []; wizardPtsRef.current = [];
      if (!g1 || g1.kind !== 'line') return;
      const res = bisectingLine(g1.a, g1.b, hit.a, hit.b, q1, { x, y });
      if (res) addInfiniteLine(res.p, res.dir, null);
      return;
    }
    // --- Point flyout: Intersection / Projection Point ---
    if (tool === 'point-intersect') {
      const hit = pickCurveAt(x, y);
      if (!hit || !asTarget(hit)) return;
      if (wizardIdsRef.current.length === 0) { wizardIdsRef.current = [hit.id]; setSelected([hit.id]); return; }
      if (hit.id === wizardIdsRef.current[0]) return;
      const g1 = geomById(wizardIdsRef.current[0]);
      wizardIdsRef.current = [];
      setSelected([]);
      if (!g1) return;
      const t1 = asTarget(g1), t2 = asTarget(hit);
      if (!t1 || !t2) return;
      // An arc only counts where the crossing falls within its sweep.
      const onArc = (g: EntityGeom, p: { x: number; y: number }) => {
        if (g.kind !== 'arc') return true;
        const raw = arcs.find((a) => a.id === g.id);
        return !raw || angleInSweep(angleOfPts({ x: g.cx, y: g.cy }, p), raw.start, raw.end);
      };
      for (const p of intersectTargets(t1, t2)) if (onArc(g1, p) && onArc(hit, p)) addPointExact(p.x, p.y);
      return;
    }
    if (tool === 'point-project') {
      if (wizardIdsRef.current.length === 0) {
        const pt = findNearestPoint(x, y);
        if (pt) { wizardIdsRef.current = [pt.id]; setSelected([pt.id]); }
        return;
      }
      const hit = pickEntityAt(x, y);
      if (!hit || hit.kind === 'point') return;
      const src = pointById.get(wizardIdsRef.current[0]);
      wizardIdsRef.current = [];
      setSelected([]);
      if (!src) return;
      const foot = computeNormalFoot(hit, src.x, src.y);
      addPointExact(foot.x, foot.y);
      return;
    }

    // --- Profile flyout: predefined shapes (all built from ordinary points/lines/arcs) ---
    if (tool === 'rect-oriented') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [p1, p2] = pts; wizardPtsRef.current = [];
      const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy);
      if (len < 1e-3) return;
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const h = (x - p1.x) * nx + (y - p1.y) * ny;
      // Parallel + perpendicular + equal-length opposite sides (see
      // commitQuad) — the same relationships a Rectangle gets via
      // Horizontal/Vertical, just at whatever angle it was drawn at.
      commitQuad([p1, p2, { x: p2.x + nx * h, y: p2.y + ny * h }, { x: p1.x + nx * h, y: p1.y + ny * h }], 'oriented', false);
      return;
    }
    if (tool === 'rect-parallelogram') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [p1, p2] = pts; wizardPtsRef.current = [];
      const p3 = { x, y };
      // Parallel + equal-length on each opposite-side pair — no
      // perpendicular, since a parallelogram's corners aren't 90°.
      commitQuad([p1, p2, p3, { x: p1.x + p3.x - p2.x, y: p1.y + p3.y - p2.y }], 'parallelogram', false);
      return;
    }
    if (tool === 'slot') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [c1, c2] = pts; wizardPtsRef.current = [];
      buildSlot(c1, c2, Math.max(2, perpDistanceToLine(x, y, c1, c2)));
      return;
    }
    if (tool === 'slot-cyl') {
      // Defined by midpoint + one end (rather than the two end-centers
      // directly), matching how CATIA distinguishes this from a plain
      // Elongated Hole — same resulting slot shape either way.
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [mid, end] = pts; wizardPtsRef.current = [];
      const c1 = end;
      const c2 = { x: mid.x * 2 - end.x, y: mid.y * 2 - end.y };
      buildSlot(c1, c2, Math.max(2, perpDistanceToLine(x, y, c1, c2)));
      return;
    }
    if (tool === 'keyhole') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [c1, c2] = pts; wizardPtsRef.current = [];
      const kh = keyholeShape(c1, c2, x, y);
      if (!kh) return; // one circle inside the other — no keyhole
      // One closed outline: the far side of each circle as an arc, joined
      // by the two exact common (external) tangents, all sharing endpoints
      // and tangent-constrained — so it extrudes as a single keyhole.
      const mk = (q: { x: number; y: number }): Pt => ({ id: nextId('pt'), x: q.x, y: q.y });
      const C1 = mk(c1), C2 = mk(c2), T1 = mk(kh.top.t1), T2 = mk(kh.top.t2), B1 = mk(kh.bot.t1), B2 = mk(kh.bot.t2);
      const arcSmall: Arc = { id: nextId('arc'), center: C1.id, r: kh.r1, start: kh.small.start, end: kh.small.end, p1: kh.small.pFirst ? T1.id : B1.id, p2: kh.small.pFirst ? B1.id : T1.id };
      const arcBig: Arc = { id: nextId('arc'), center: C2.id, r: kh.r2, start: kh.big.start, end: kh.big.end, p1: kh.big.pFirst ? T2.id : B2.id, p2: kh.big.pFirst ? B2.id : T2.id };
      const lnTop: Ln = { id: nextId('ln'), p1: T1.id, p2: T2.id }, lnBot: Ln = { id: nextId('ln'), p1: B1.id, p2: B2.id };
      const tan = (line: string, curve: string): Constraint => ({ id: nextId('c'), type: 'tangent_line_curve', args: { line, curve }, label: `Tangent: ${line}, ${curve}` });
      const nextPoints = [...points, C1, C2, T1, T2, B1, B2];
      const nextLines = [...lines, lnTop, lnBot];
      const nextConstraints = [...constraints, tan(lnTop.id, arcSmall.id), tan(lnTop.id, arcBig.id), tan(lnBot.id, arcSmall.id), tan(lnBot.id, arcBig.id)];
      setPoints(nextPoints); setLines(nextLines); setArcs((as) => [...as, arcSmall, arcBig]); setConstraints(nextConstraints);
      return;
    }
    if (tool === 'hexagon') {
      if (!pendingRef.current) {
        const hit = findNearestPoint(x, y);
        const id = hit ? hit.id : addPoint(x, y);
        pendingRef.current = id; setPending(id);
        setMousePt({ x, y });
        return;
      }
      const center = pointById.get(pendingRef.current);
      cancelPending();
      if (!center) return;
      const rim = gridSnap(x, y);
      const r = Math.hypot(rim.x - center.x, rim.y - center.y);
      const a0 = angleOfPts(center, rim);
      const newPts: Pt[] = Array.from({ length: 6 }, (_, i) => {
        const ang = ((a0 + i * 60) * Math.PI) / 180;
        return { id: nextId('pt'), x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) };
      });
      const ids = newPts.map((p) => p.id);
      const hexLines: Ln[] = ids.map((id, i) => ({ id: nextId('ln'), p1: id, p2: ids[(i + 1) % 6] }));
      // Chain all 6 sides equal-length, so the solver keeps it a regular
      // hexagon (equilateral) rather than letting it drift into an
      // arbitrary hexagon if a constraint later moves one of its points.
      const newConstraints: Constraint[] = hexLines.slice(1).map((ln, i) => ({
        id: nextId('c'), type: 'equal_length', args: { line1: hexLines[i].id, line2: ln.id }, label: `Equal length: ${hexLines[i].id}, ${ln.id}`,
      }));
      // The center click is a real point already (added on the first
      // click above) — this "midpoint" constraint (see sketch_solver.py's
      // constrain_midpoint) is what keeps it centered if the hexagon is
      // later edited, rather than freezing it at today's position.
      newConstraints.push({ id: nextId('c'), type: 'midpoint', args: { center: center.id, points: ids }, label: `Center: ${center.id}` });
      const nextPoints = [...points, ...newPts];
      const nextLines = [...lines, ...hexLines];
      const nextConstraints = [...constraints, ...newConstraints];
      setPoints(nextPoints);
      setLines(nextLines);
      setConstraints(nextConstraints);
      void solve(nextPoints, nextLines, circles, nextConstraints);
      return;
    }
    if (tool === 'profile') { profileClick(x, y); return; }
    if (tool === 'spline' || tool === 'spline-cv') { setWizardPolyPts((pts) => [...pts, gridSnap(x, y)]); return; }

    // --- Circle flyout: 3-Point / Center+2 Points / Tri-Tangent ---
    if (tool === 'circle-3pt') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [p1, p2] = pts; wizardPtsRef.current = [];
      const cc = circle3ptFixedR(p1, p2, { x, y }) ?? circumcenter3(p1, p2, { x, y });
      if (!cc) return; // colinear clicks — no unique circle, just drop the attempt
      const centerId = addPoint(cc.x, cc.y);
      setCircles((cs) => [...cs, { id: nextId('cir'), center: centerId, r: cc.r }]);
      return;
    }
    if (tool === 'circle-2pt') {
      if (!pendingRef.current) {
        const hit = findNearestPoint(x, y);
        const id = hit ? hit.id : addPoint(x, y);
        pendingRef.current = id; setPending(id);
        wizardPtsRef.current = [];
        setMousePt({ x, y });
        return;
      }
      const center = pointById.get(pendingRef.current);
      if (!center) { cancelPending(); return; }
      if (wizardPtsRef.current.length === 0) { wizardPtsRef.current = [gridSnap(x, y)]; return; }
      const rim2 = gridSnap(x, y);
      const r1 = Math.hypot(wizardPtsRef.current[0].x - center.x, wizardPtsRef.current[0].y - center.y);
      const r2 = Math.hypot(rim2.x - center.x, rim2.y - center.y);
      setCircles((cs) => [...cs, { id: nextId('cir'), center: center.id, r: Math.max(2, (r1 + r2) / 2) }]);
      wizardPtsRef.current = [];
      cancelPending();
      return;
    }
    if (tool === 'circle-tritangent') {
      // Lines, circles or arcs. Each pick's click position is kept too:
      // the circle's tangent points land as close as possible to them.
      const hit = pickCurveAt(x, y);
      if (!hit || !asTarget(hit)) return;
      const ids = wizardIdsRef.current;
      if (ids.includes(hit.id)) return; // needs 3 distinct elements
      if (ids.length < 2) { wizardIdsRef.current = [...ids, hit.id]; wizardPtsRef.current = [...wizardPtsRef.current, { x, y }]; return; }
      const allIds = [...ids, hit.id];
      const clicks = [...wizardPtsRef.current, { x, y }];
      wizardIdsRef.current = []; wizardPtsRef.current = [];
      const tt = triTangentFor(allIds, clicks);
      if (!tt) return;
      // Exact center (grid-snapping it would break the tangency), and a
      // real tangent constraint to each of the three elements.
      const center: Pt = { id: nextId('pt'), x: tt.x, y: tt.y };
      const circleId = nextId('cir');
      const nextCircles = [...circles, { id: circleId, center: center.id, r: tt.r }];
      const nextPoints = [...points, center];
      const nextConstraints = [...constraints, ...allIds.map((id): Constraint => (lines.some((l) => l.id === id)
        ? { id: nextId('c'), type: 'tangent_line_circle', args: { line: id, circle: circleId }, label: `Tangent: ${id}, ${circleId}` }
        : { id: nextId('c'), type: 'tangent_curves', args: { curve1: circleId, curve2: id }, label: `Tangent: ${circleId}, ${id}` }))];
      setPoints(nextPoints); setCircles(nextCircles); setConstraints(nextConstraints);
      void solve(nextPoints, lines, nextCircles, nextConstraints);
      return;
    }

    // --- Ellipse flyout: Ellipse / Parabola / Hyperbola / Conic ---
    // Every defining point below is a real, shared Pt (via addPoint) —
    // just like a Circle's center or an Arc's center — so it's the same
    // selectable/movable/constrainable/solver-sent point as anything else,
    // and the curve itself resamples live off it (see curvePoints above).
    if (tool === 'ellipse') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [center, majorPt] = pts; wizardPtsRef.current = [];
      const rx = Math.hypot(majorPt.x - center.x, majorPt.y - center.y);
      if (rx < 1e-3) return;
      const rot = Math.atan2(majorPt.y - center.y, majorPt.x - center.x);
      const ry = Math.max(1, perpDistanceToLine(x, y, center, majorPt));
      const centerId = addPoint(center.x, center.y);
      setCurves((cv) => [...cv, { id: nextId('cv'), kind: 'ellipse', center: centerId, rx, ry, rot }]);
      return;
    }
    if (tool === 'parabola') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [focus, vertex] = pts; wizardPtsRef.current = [];
      const span = Math.max(5, Math.abs(perpDistanceToLine(x, y, vertex, focus)));
      if (Math.hypot(focus.x - vertex.x, focus.y - vertex.y) < 1e-3) return;
      const focusId = addPoint(focus.x, focus.y), vertexId = addPoint(vertex.x, vertex.y);
      setCurves((cv) => [...cv, { id: nextId('cv'), kind: 'parabola', focus: focusId, vertex: vertexId, span }]);
      return;
    }
    if (tool === 'hyperbola') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [center, focus] = pts; wizardPtsRef.current = [];
      if (Math.hypot(focus.x - center.x, focus.y - center.y) < 1e-3) return;
      const centerId = addPoint(center.x, center.y), focusId = addPoint(focus.x, focus.y), vertexId = addPoint(x, y);
      setCurves((cv) => [...cv, { id: nextId('cv'), kind: 'hyperbola', center: centerId, focus: focusId, vertex: vertexId }]);
      return;
    }
    if (tool === 'conic') {
      const pts = wizardPtsRef.current;
      if (pts.length < 4) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const pts5 = [...pts, { x, y }]; wizardPtsRef.current = [];
      const ptIds = pts5.map((p) => addPoint(p.x, p.y));
      setCurves((cv) => [...cv, { id: nextId('cv'), kind: 'conic', ptIds }]);
      return;
    }

    // --- Spline flyout: Connect Curves ---
    if (tool === 'spline-connect') {
      const hit = pickEntityAt(x, y);
      if (!hit || (hit.kind !== 'line' && hit.kind !== 'curve')) return;
      const ids = wizardIdsRef.current;
      if (ids.length === 0) { wizardIdsRef.current = [hit.id]; return; }
      if (hit.id === ids[0]) return;
      const g1 = geomById(ids[0]);
      wizardIdsRef.current = [];
      if (!g1 || (g1.kind !== 'line' && g1.kind !== 'curve')) return;
      const endpointsOf = (g: EntityGeom): [{ x: number; y: number }, { x: number; y: number }] | null => {
        if (g.kind === 'line') return [g.a, g.b];
        if (g.kind === 'curve') { const n = g.pts.length; return n >= 2 ? [g.pts[0], g.pts[n - 1]] : null; }
        return null;
      };
      const e1 = endpointsOf(g1), e2 = endpointsOf(hit);
      if (!e1 || !e2) return;
      // Connect whichever pair of endpoints (one from each entity) is
      // nearest each other, so the blend joins the two closest ends
      // rather than crossing over to the far ones.
      let best = { p1: e1[0], p2: e2[0], d: Infinity };
      for (const p1 of e1) for (const p2 of e2) {
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (d < best.d) best = { p1, p2, d };
      }
      const mid = { x: (best.p1.x + best.p2.x) / 2, y: (best.p1.y + best.p2.y) / 2 };
      const controlIds = [addPoint(best.p1.x, best.p1.y), addPoint(mid.x, mid.y), addPoint(best.p2.x, best.p2.y)];
      setCurves((cv) => [...cv, { id: nextId('cv'), kind: 'spline', controlIds }]);
      return;
    }

    // --- Point flyout: Bisecting/Mid Point / Equidistant/Divided Points ---
    if (tool === 'point-midpoint') {
      // Primary interaction per spec: a single click directly on a bare
      // line/arc/curve body snaps straight to its true parametric midpoint
      // and auto-dimensions it. A click that lands on an existing vertex
      // (an endpoint, or some other point already sitting on the entity)
      // instead falls back to the original two-point "click A, click B,
      // drop the point exactly between them" flow, so that flow keeps
      // working unchanged for arbitrary point pairs.
      const vertexHit = findNearestPoint(x, y);
      const entHit = !vertexHit ? pickEntityAt(x, y) : null;
      if (entHit && wizardIdsRef.current.length === 0 && (entHit.kind === 'line' || entHit.kind === 'arc' || entHit.kind === 'curve')) {
        const pos = pointAtCurveParam(entHit, 0.5, false);
        if (!pos) return;
        const id = addPointExact(pos.x, pos.y);
        if (entHit.kind === 'line') {
          addSegmentDimension(entHit.a.id, id);
          addSegmentDimension(id, entHit.b.id);
        } else {
          const startId = curveRefPointId(entHit, 'start');
          const endId = curveRefPointId(entHit, 'end');
          if (startId) addSegmentDimension(startId, id);
          if (endId) addSegmentDimension(id, endId);
        }
        commitPointDimension(id, 'Midpoint');
        pointFeaturesRef.current[id] = { mode: 'point-midpoint', parentEntityId: entHit.id, parentAId: null, parentBId: null };
        return;
      }
      const hit = vertexHit;
      if (!hit) return;
      const ids = wizardIdsRef.current;
      if (ids.length === 0) { wizardIdsRef.current = [hit.id]; return; }
      if (hit.id === ids[0]) return; // need 2 distinct points
      const p1 = pointById.get(ids[0]);
      wizardIdsRef.current = [];
      if (!p1) return;
      const midx = (p1.x + hit.x) / 2, midy = (p1.y + hit.y) / 2;
      const id = addPointExact(midx, midy);
      addSegmentDimension(p1.id, id);
      addSegmentDimension(id, hit.id);
      commitPointDimension(id, 'Midpoint');
      pointFeaturesRef.current[id] = { mode: 'point-midpoint', parentEntityId: null, parentAId: p1.id, parentBId: hit.id };
      return;
    }
    if (tool === 'point-divide') {
      if (!divideTargetId) {
        const hit = pickEntityAt(x, y);
        if (!hit) return;
        setDivideTargetId(hit.id);
        return;
      }
      applyDivision();
      return;
    }



    // --- Axis: a datum/reference line between the two clicked points,
    // dashed like a Construction Line but — unlike the actual Infinite/
    // Construction Line tool above — NOT extended past either end. A
    // revolve or symmetry axis only ever needs to reach as far as the two
    // points that define it, so stretching it off to the edges of the
    // sketch just clutters the view; kept as its own tool/style (rather
    // than reusing 'construction' verbatim elsewhere) for a future "axis
    // of symmetry" mirror tool to key off. ---
    if (tool === 'axis-construction') {
      if (!pendingRef.current) {
        const hit = findNearestPoint(x, y);
        const id = hit ? hit.id : addPoint(x, y);
        pendingRef.current = id; setPending(id);
        setMousePt({ x, y });
        return;
      }
      const startId = pendingRef.current;
      const hit = findNearestPoint(x, y);
      const id = hit ? hit.id : addPoint(x, y);
      setLines((ls) => [...ls, { id: nextId('ln'), p1: startId, p2: id, style: 'construction' }]);
      cancelPending();
      return;
    }

    // --- Rectangle flyout additions: Centered Rectangle / 3-Point Center Rectangle / Center Parallelogram ---
    // Centered Rectangle: click the center, then a corner — the simple,
    // always-axis-aligned case (unlike 3-Point Center Rectangle just
    // below, which can rotate). Same click pattern as Hexagon/Regular
    // Polygon above: the first click snaps to an existing point or adds a
    // real one via addPoint, so — like those — the center is a genuine
    // point from the start, not just a coordinate read off wizardPtsRef.
    if (tool === 'rect-centered') {
      if (!pendingRef.current) {
        const hit = findNearestPoint(x, y);
        const id = hit ? hit.id : addPoint(x, y);
        pendingRef.current = id; setPending(id);
        setMousePt({ x, y });
        return;
      }
      const center = pointById.get(pendingRef.current);
      cancelPending();
      if (!center) return;
      const corner = gridSnap(x, y);
      const halfW = Math.abs(corner.x - center.x), halfH = Math.abs(corner.y - center.y);
      if (halfW < 1e-3 || halfH < 1e-3) return;
      const corners = [
        { x: center.x - halfW, y: center.y - halfH },
        { x: center.x + halfW, y: center.y - halfH },
        { x: center.x + halfW, y: center.y + halfH },
        { x: center.x - halfW, y: center.y + halfH },
      ];
      const newPts: Pt[] = corners.map((c) => ({ id: nextId('pt'), x: c.x, y: c.y }));
      const ids = newPts.map((p) => p.id);
      const lnBottom = nextId('ln'), lnRight = nextId('ln'), lnTop = nextId('ln'), lnLeft = nextId('ln');
      const newLines: Ln[] = [
        { id: lnBottom, p1: ids[0], p2: ids[1] }, { id: lnRight, p1: ids[1], p2: ids[2] },
        { id: lnTop, p1: ids[2], p2: ids[3] }, { id: lnLeft, p1: ids[3], p2: ids[0] },
      ];
      const newConstraints: Constraint[] = [
        { id: nextId('c'), type: 'horizontal', args: { line: lnBottom }, label: `Horizontal: ${lnBottom}` },
        { id: nextId('c'), type: 'horizontal', args: { line: lnTop }, label: `Horizontal: ${lnTop}` },
        { id: nextId('c'), type: 'vertical', args: { line: lnLeft }, label: `Vertical: ${lnLeft}` },
        { id: nextId('c'), type: 'vertical', args: { line: lnRight }, label: `Vertical: ${lnRight}` },
        // Same solver-tracked center as the plain Rectangle tool (see
        // commitRectangle) — keeps `center` at the true centroid of the 4
        // corners through later edits, rather than freezing it in place.
        { id: nextId('c'), type: 'midpoint', args: { center: center.id, points: ids }, label: `Center: ${center.id}` },
      ];
      const nextPoints = [...points, ...newPts];
      const nextLines = [...lines, ...newLines];
      const nextConstraints = [...constraints, ...newConstraints];
      setPoints(nextPoints); setLines(nextLines); setConstraints(nextConstraints);
      void solve(nextPoints, nextLines, circles, nextConstraints);
      return;
    }
    if (tool === 'rect-center3') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [center, edgeMid] = pts; wizardPtsRef.current = [];
      const dx = edgeMid.x - center.x, dy = edgeMid.y - center.y, halfW = Math.hypot(dx, dy);
      if (halfW < 1e-3) return;
      const ux = dx / halfW, uy = dy / halfW, nx = -uy, ny = ux;
      const halfH = (x - center.x) * nx + (y - center.y) * ny;
      const corners = [
        { x: center.x + ux * halfW + nx * halfH, y: center.y + uy * halfW + ny * halfH },
        { x: center.x - ux * halfW + nx * halfH, y: center.y - uy * halfW + ny * halfH },
        { x: center.x - ux * halfW - nx * halfH, y: center.y - uy * halfW - ny * halfH },
        { x: center.x + ux * halfW - nx * halfH, y: center.y + uy * halfW - ny * halfH },
      ];
      const newPts: Pt[] = corners.map((c) => ({ id: nextId('pt'), x: c.x, y: c.y }));
      const ids = newPts.map((p) => p.id);
      // A real center point, in the SAME batch as the corners (previously
      // this was added via a separate addPoint() call after solve() had
      // already run once without it — floating, grid-snapped, and never
      // tied to the shape). The "midpoint" constraint below is what keeps
      // it centered through later edits, same as commitRectangle/commitQuad.
      const centerPt: Pt = { id: nextId('pt'), x: center.x, y: center.y };
      const ln1 = nextId('ln'), ln2 = nextId('ln'), ln3 = nextId('ln'), ln4 = nextId('ln');
      const newLines: Ln[] = [
        { id: ln1, p1: ids[0], p2: ids[1] }, { id: ln2, p1: ids[1], p2: ids[2] },
        { id: ln3, p1: ids[2], p2: ids[3] }, { id: ln4, p1: ids[3], p2: ids[0] },
      ];
      const newConstraints: Constraint[] = [
        { id: nextId('c'), type: 'parallel', args: { line1: ln1, line2: ln3 }, label: `Parallel: ${ln1} / ${ln3}` },
        { id: nextId('c'), type: 'parallel', args: { line1: ln2, line2: ln4 }, label: `Parallel: ${ln2} / ${ln4}` },
        { id: nextId('c'), type: 'perpendicular', args: { line1: ln1, line2: ln2 }, label: `Perpendicular: ${ln1} / ${ln2}` },
        { id: nextId('c'), type: 'equal_length', args: { line1: ln1, line2: ln3 }, label: `Equal length: ${ln1}, ${ln3}` },
        { id: nextId('c'), type: 'equal_length', args: { line1: ln2, line2: ln4 }, label: `Equal length: ${ln2}, ${ln4}` },
        { id: nextId('c'), type: 'midpoint', args: { center: centerPt.id, points: ids }, label: `Center: ${centerPt.id}` },
      ];
      const nextPoints = [...points, ...newPts, centerPt];
      const nextLines = [...lines, ...newLines];
      const nextConstraints = [...constraints, ...newConstraints];
      setPoints(nextPoints); setLines(nextLines); setConstraints(nextConstraints);
      void solve(nextPoints, nextLines, circles, nextConstraints);
      return;
    }
    if (tool === 'rect-parallelogram-center') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [center, a] = pts; wizardPtsRef.current = [];
      const b = { x, y };
      const c = { x: 2 * center.x - a.x, y: 2 * center.y - a.y };
      const d = { x: 2 * center.x - b.x, y: 2 * center.y - b.y };
      const newPts: Pt[] = [a, b, c, d].map((p) => ({ id: nextId('pt'), x: p.x, y: p.y }));
      const ids = newPts.map((p) => p.id);
      // Same real, solver-tracked center point as 3-Point Center Rectangle
      // above, in the same batch as the corners.
      const centerPt: Pt = { id: nextId('pt'), x: center.x, y: center.y };
      const ln1 = nextId('ln'), ln2 = nextId('ln'), ln3 = nextId('ln'), ln4 = nextId('ln');
      const newLines: Ln[] = [
        { id: ln1, p1: ids[0], p2: ids[1] }, { id: ln2, p1: ids[1], p2: ids[2] },
        { id: ln3, p1: ids[2], p2: ids[3] }, { id: ln4, p1: ids[3], p2: ids[0] },
      ];
      const newConstraints: Constraint[] = [
        { id: nextId('c'), type: 'parallel', args: { line1: ln1, line2: ln3 }, label: `Parallel: ${ln1} / ${ln3}` },
        { id: nextId('c'), type: 'parallel', args: { line1: ln2, line2: ln4 }, label: `Parallel: ${ln2} / ${ln4}` },
        { id: nextId('c'), type: 'equal_length', args: { line1: ln1, line2: ln3 }, label: `Equal length: ${ln1}, ${ln3}` },
        { id: nextId('c'), type: 'equal_length', args: { line1: ln2, line2: ln4 }, label: `Equal length: ${ln2}, ${ln4}` },
        { id: nextId('c'), type: 'midpoint', args: { center: centerPt.id, points: ids }, label: `Center: ${centerPt.id}` },
      ];
      const nextPoints = [...points, ...newPts, centerPt];
      const nextLines = [...lines, ...newLines];
      const nextConstraints = [...constraints, ...newConstraints];
      setPoints(nextPoints); setLines(nextLines); setConstraints(nextConstraints);
      void solve(nextPoints, nextLines, circles, nextConstraints);
      return;
    }

    // --- Circle flyout addition: Coordinate Circle is driven entirely by
    // the X/Y/Radius fields in the bottom bar — see viewport-hint section
    // below — nothing to do on a canvas click. ---

    // --- Arc flyout: 3-Point Arc / Tangent Arc / 3-Point Arc with Limits ---
    if (tool === 'arc-3pt' || tool === 'arc-3pt-limits') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [p1, p2] = pts; wizardPtsRef.current = [];
      // Three Point Arc: start, pass-through, end. Starting With Limits:
      // start, end, then the pass-through point.
      const built = tool === 'arc-3pt' ? build3PtArc(p1, { x, y }, p2) : build3PtArc(p1, p2, { x, y });
      if (!built) return;
      const centerId = addPoint(built.cx, built.cy);
      setArcs((as) => [...as, { id: nextId('arc'), center: centerId, r: built.r, start: built.start, end: built.end }]);
      return;
    }
    if (tool === 'arc-tangent') {
      if (wizardIdsRef.current.length === 0) {
        const hit = pickEntityAt(x, y);
        if (hit && hit.kind === 'line') wizardIdsRef.current = [hit.id];
        return;
      }
      const g = geomById(wizardIdsRef.current[0]);
      wizardIdsRef.current = [];
      if (!g || g.kind !== 'line') return;
      const dA = Math.hypot(g.a.x - x, g.a.y - y), dB = Math.hypot(g.b.x - x, g.b.y - y);
      const tangentPt = dA < dB ? g.a : g.b;
      const otherPt = dA < dB ? g.b : g.a;
      const dirLen = Math.hypot(tangentPt.x - otherPt.x, tangentPt.y - otherPt.y) || 1;
      // Leaves the line's end in the line's own direction, sweeping
      // whichever way reaches the click (see tangentArcFrom), starting from
      // the line's real endpoint and tangent-constrained to the line.
      const arc = tangentArcFrom(tangentPt, { x: (tangentPt.x - otherPt.x) / dirLen, y: (tangentPt.y - otherPt.y) / dirLen }, { x, y });
      if (!arc) return; // clicked end point lies on the tangent line itself — no arc
      const centerId = nextId('pt'), endId = nextId('pt'), arcId = nextId('arc');
      const [p1, p2] = arc.increasing ? [tangentPt.id, endId] : [endId, tangentPt.id];
      setPoints((ps) => [...ps, { id: centerId, x: arc.cx, y: arc.cy }, { id: endId, x, y }]);
      setArcs((as) => [...as, { id: arcId, center: centerId, r: arc.r, start: arc.start, end: arc.end, p1, p2 }]);
      setConstraints((cs) => [...cs, { id: nextId('c'), type: 'tangent_line_curve', args: { line: g.id, curve: arcId }, label: `Tangent: ${g.id}, ${arcId}` }]);
      return;
    }

    // --- Polygons & Slots: Regular Polygon / Curved Slot ---
    if (tool === 'polygon-n') {
      if (!pendingRef.current) {
        const hit = findNearestPoint(x, y);
        const id = hit ? hit.id : addPoint(x, y);
        pendingRef.current = id; setPending(id);
        setMousePt({ x, y });
        return;
      }
      const center = pointById.get(pendingRef.current);
      cancelPending();
      if (!center) return;
      const sides = Math.max(3, Math.round(Number(polygonSides) || 6));
      const rim = gridSnap(x, y);
      const verts = regularPolygonPoints(center.x, center.y, sides, rim.x, rim.y, polygonCircumscribed);
      const newPts: Pt[] = verts.map((v) => ({ id: nextId('pt'), x: v.x, y: v.y }));
      const ids = newPts.map((p) => p.id);
      const polyLines: Ln[] = ids.map((id, i) => ({ id: nextId('ln'), p1: id, p2: ids[(i + 1) % sides] }));
      const newConstraints: Constraint[] = polyLines.slice(1).map((ln, i) => ({
        id: nextId('c'), type: 'equal_length', args: { line1: polyLines[i].id, line2: ln.id }, label: `Equal length: ${polyLines[i].id}, ${ln.id}`,
      }));
      // Same solver-tracked center as Hexagon above — keeps the center
      // click centered through later edits instead of freezing it in place.
      newConstraints.push({ id: nextId('c'), type: 'midpoint', args: { center: center.id, points: ids }, label: `Center: ${center.id}` });
      const nextPoints = [...points, ...newPts];
      const nextLines = [...lines, ...polyLines];
      const nextConstraints = [...constraints, ...newConstraints];
      setPoints(nextPoints); setLines(nextLines); setConstraints(nextConstraints);
      void solve(nextPoints, nextLines, circles, nextConstraints);
      return;
    }
    if (tool === 'slot-arc') {
      // Curved Slot: center, then a point fixing the path radius + start
      // angle, then a point fixing the end angle, then this 4th click's
      // perpendicular distance from the path sets the slot's width — same
      // "last click sets the cross size" idea as the straight Slot tools
      // above (buildSlot), just swept along an arc instead of a line. The
      // two ends are closed with straight radial caps rather than the
      // rounded caps a straight slot gets — a deliberate phase-1
      // simplification, same spirit as Keyhole's approximate tangent
      // points above.
      const pts = wizardPtsRef.current;
      if (pts.length < 3) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [center, startPt, endPt] = pts; wizardPtsRef.current = [];
      const r = Math.hypot(startPt.x - center.x, startPt.y - center.y);
      if (r < 1e-3) return;
      const startAngle = angleOfPts(center, startPt);
      const endAngle = angleOfPts(center, endPt);
      const w = Math.max(2, Math.abs(Math.hypot(x - center.x, y - center.y) - r) * 2);
      const centerId = addPointExact(center.x, center.y);
      const rOuter = r + w / 2, rInner = Math.max(1, r - w / 2);
      const mkPt = (ang: number, rad: number) => ({ x: center.x + rad * Math.cos((ang * Math.PI) / 180), y: center.y + rad * Math.sin((ang * Math.PI) / 180) });
      const s1 = mkPt(startAngle, rOuter), s2 = mkPt(startAngle, rInner);
      const e1 = mkPt(endAngle, rOuter), e2 = mkPt(endAngle, rInner);
      // Exact points shared by the arcs and the end caps — one closed chain.
      const idS1 = addPointExact(s1.x, s1.y), idS2 = addPointExact(s2.x, s2.y);
      const idE1 = addPointExact(e1.x, e1.y), idE2 = addPointExact(e2.x, e2.y);
      setArcs((as) => [...as,
        { id: nextId('arc'), center: centerId, r: rOuter, start: startAngle, end: endAngle, p1: idS1, p2: idE1 },
        { id: nextId('arc'), center: centerId, r: rInner, start: startAngle, end: endAngle, p1: idS2, p2: idE2 },
      ]);
      setLines((ls) => [...ls, { id: nextId('ln'), p1: idS1, p2: idS2 }, { id: nextId('ln'), p1: idE1, p2: idE2 }]);
      return;
    }

    // --- Fillet & Chamfer: pick two lines, cut them back at their
    // (possibly-extended) intersection, and bridge the corner with a
    // tangent arc (Fillet) or a straight bevel (Chamfer). Radius/distances
    // come from the bottom-bar fields below, typed once and reused for
    // every corner picked until changed — matching how Distance/Radius
    // constraints work elsewhere in this file. ---
    if (tool === 'chamfer-2d') {
      // Two elements (lines, arcs or circles), each clicked on the side
      // that stays; see chamferCuts / applyChamfer.
      const hit = pickCurveAt(x, y);
      if (!hit || hit.kind === 'point') return;
      const ids = wizardIdsRef.current;
      if (ids.length === 0) { wizardIdsRef.current = [hit.id]; wizardPtsRef.current = [{ x, y }]; return; }
      if (hit.id === ids[0]) return;
      const g1 = geomById(ids[0]);
      const q1 = wizardPtsRef.current[0];
      wizardIdsRef.current = []; wizardPtsRef.current = [];
      if (!g1) return;
      applyChamfer(g1, q1, hit, { x, y });
      return;
    }
    if (tool === 'fillet-2d') {
      const hit = pickEntityAt(x, y);
      if (!hit || hit.kind !== 'line') return;
      const ids = wizardIdsRef.current;
      if (ids.length === 0) { wizardIdsRef.current = [hit.id]; return; }
      if (hit.id === ids[0]) return; // need 2 distinct lines
      const g1 = geomById(ids[0]);
      wizardIdsRef.current = [];
      if (!g1 || g1.kind !== 'line') return;
      const g2 = hit;
      const corner = infiniteLineIntersect(g1.a, g1.b, g2.a, g2.b);
      if (!corner) return; // parallel lines — no corner to round
      const cornerIsA1 = Math.hypot(g1.a.x - corner.x, g1.a.y - corner.y) < Math.hypot(g1.b.x - corner.x, g1.b.y - corner.y);
      const cornerIsB1 = Math.hypot(g2.a.x - corner.x, g2.a.y - corner.y) < Math.hypot(g2.b.x - corner.x, g2.b.y - corner.y);
      const lineObj1 = lines.find((l) => l.id === g1.id);
      const lineObj2 = lines.find((l) => l.id === g2.id);
      if (!lineObj1 || !lineObj2) return;
      const radius = Math.max(1, lenNum(filletRadius) || 10);
      const result = computeFillet(g1.a, g1.b, g2.a, g2.b, cornerIsA1, cornerIsB1, radius);
      if (!result) return; // near-parallel lines — no well-defined fillet
      // The two lines usually share their corner point (a rectangle): the
      // second line then gets its own new end, or both would be dragged to
      // the same tangent point and the shape would collapse.
      // Both lines get new ends at the tangent points; the old corner point
      // stays as a construction point (as in CATIA), so a shared corner is
      // never dragged to one tangent point and its dimensions keep meaning.
      const tA: Pt = { id: nextId('pt'), x: result.tanA.x, y: result.tanA.y };
      const tB: Pt = { id: nextId('pt'), x: result.tanB.x, y: result.tanB.y };
      const cornerPtId1 = tA.id, cornerPtId2 = tB.id;
      let nextPoints = [...points, tA, tB];
      const nextLines = lines.map((l) => (l.id === g1.id ? (cornerIsA1 ? { ...l, p1: tA.id } : { ...l, p2: tA.id })
        : l.id === g2.id ? (cornerIsB1 ? { ...l, p1: tB.id } : { ...l, p2: tB.id }) : l));
      // Exact center (a grid-snapped one would pull the arc off both
      // tangent points), endpoints shared with the two trimmed lines, and
      // a tangent constraint to each.
      const center: Pt = { id: nextId('pt'), x: result.center.x, y: result.center.y };
      nextPoints = [...nextPoints, center];
      const arcId = nextId('arc');
      const startsAtA = Math.hypot(result.center.x + result.radius * Math.cos((result.start * Math.PI) / 180) - result.tanA.x,
        result.center.y + result.radius * Math.sin((result.start * Math.PI) / 180) - result.tanA.y) < 1e-3;
      const [p1, p2] = startsAtA ? [cornerPtId1, cornerPtId2] : [cornerPtId2, cornerPtId1];
      const nextConstraints = [...constraints,
        { id: nextId('c'), type: 'tangent_line_curve', args: { line: g1.id, curve: arcId }, label: `Tangent: ${g1.id}, ${arcId}` },
        { id: nextId('c'), type: 'tangent_line_curve', args: { line: g2.id, curve: arcId }, label: `Tangent: ${g2.id}, ${arcId}` },
      ];
      setPoints(nextPoints); setLines(nextLines);
      setArcs((as) => [...as, { id: arcId, center: center.id, r: result.radius, start: result.start, end: result.end, p1, p2 }]);
      setConstraints(nextConstraints);
      return;
    }

    // --- Ellipse flyout additions: Elliptical Arc / General Conic (Rho) ---
    if (tool === 'ellipse-arc') {
      const pts = wizardPtsRef.current;
      if (pts.length < 3) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [center, majorPt, radiusPt] = pts; wizardPtsRef.current = [];
      const rx = Math.hypot(majorPt.x - center.x, majorPt.y - center.y);
      if (rx < 1e-3) return;
      const rot = Math.atan2(majorPt.y - center.y, majorPt.x - center.x);
      const ry = Math.max(1, perpDistanceToLine(radiusPt.x, radiusPt.y, center, majorPt));
      // Recovers the parametric angle t (same t sampleEllipse's x0=rx·cos t,
      // y0=ry·sin t uses) for a world point by undoing the rotation and the
      // rx/ry scaling — this is what lets the picked start/end points land
      // exactly where they were clicked.
      const localAngle = (p: { x: number; y: number }) => {
        const dx = p.x - center.x, dy = p.y - center.y;
        const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
        const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
        return (Math.atan2(ly / (ry || 1), lx / (rx || 1)) * 180) / Math.PI;
      };
      const start = localAngle(radiusPt);
      const end = localAngle({ x, y });
      const centerId = addPoint(center.x, center.y);
      setCurves((cv) => [...cv, { id: nextId('cv'), kind: 'ellipse', center: centerId, rx, ry, rot, start, end }]);
      return;
    }
    if (tool === 'conic-rp') {
      const pts = wizardPtsRef.current;
      if (pts.length < 2) { wizardPtsRef.current = [...pts, { x, y }]; return; }
      const [p0, papex] = pts; wizardPtsRef.current = [];
      const p0Id = addPoint(p0.x, p0.y), papexId = addPoint(papex.x, papex.y), p2Id = addPoint(x, y);
      const rho = Math.max(0.02, Math.min(0.98, Number(conicRho) || 0.5));
      setCurves((cv) => [...cv, { id: nextId('cv'), kind: 'conic-rp', p0: p0Id, papex: papexId, p2: p2Id, rho }]);
      return;
    }

    if (tool === 'trim') { trimAt(x, y); return; }
  };
  return {
    handleCanvasClick,
  };
}

export type CanvasClick = ReturnType<typeof useCanvasClick>;
