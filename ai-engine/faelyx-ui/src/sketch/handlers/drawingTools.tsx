// Sketch & 2D: the canvas mouse gestures and the drawing tools: typed entry, rectangles, profile chains, tangent/bi-tangent/tri-tangent constructions.
// A hook built on useSketchCore's state (assembled in handlers/index.ts).
import {
  biTangentLine, biTangentSampled, intersectTargets, triTangentGeneral, sampleSegment, sampleArc,
  samplesInsideRect, samplesTouchRect, samplesInsidePolygon, samplesTouchStroke,
  type TangentTarget,
} from '../../sketchGeometry2d';
import type { Pt, Ln, Arc, Constraint, SketchCurve } from '../types';
import { HIT_TOL } from '../constants';
import { angleOfPts, angleInSweep, normalizeRect, perpDistanceToLine, infiniteLineEndpoints, circumcenter3, triTangentCircle } from '../geometry';


import type { SketchCore, EntityGeom } from '../useSketchCore';
import type { ViewAndAnnotations } from './viewAndAnnotations';
import type { SnapAndSelect } from './snapAndSelect';

export function useDrawingTools(core: SketchCore, prev: ViewAndAnnotations & SnapAndSelect) {
  const {
    SKETCH_ORIGIN, allEntityGeoms, arcs, cancelPending, chamferAngle, chamferDistA, chamferDistB, circCoordR, circCoordX, circCoordY, circle3ptR, circles, constraints, cursorPosRef, dragBox, dragModeRef, dragMovedRef, dragStartClientRef, dragStartRef, finishProfile, geomById, hoverEntity, isEditingLive, lineSymToggle, lines, liveValue, mousePt, moveBaseRef, moveIdsRef, moveOriginRef, moveSolveDebounceRef, nextId, numAngle, numEndH, numEndV, numHeight, numRadius, numSkew, numStartH, numStartV, numWidth, paintStroke, pendingRef, pointById, points, profileChain, profileSegMode, profileThroughRef, rawClientToSvg, resetToolState, selected, setArcs, setCircles, setConstraints, setCoordR, setCoordTheta, setCoordX, setCoordY, setCurveOffsetValue, setCurveTargetId, setCurves, setDivideCount, setDivideFixedDistance, setDivideTargetId, setDragBox, setEditingGroupId, setEditingPointId, setFlyoutOpen, setHoverEntity, setLines, setLiveValue, setMousePt, setNumAngle, setPaintStroke, setPending, setPoints, setProfileChain, setProfileSegMode, setSelected, setTool, setTrapPoly, setViewBox, setViewGesture, setWizardPolyPts, setZoomAreaBox, solve, suppressClickRef, symmetricLineIdsRef, toU, tool, trapPoly, upsertInList, viewBox, viewBoxAround, viewDragRef, viewGesture, wizardPolyPts, zoomAreaBox,
  } = core;
  const {
    addPoint, addPointExact, magnetPoint, chamferMode, entityOwningPoint, findNearestPoint, gridSnap, hoverSnapAt, isShown, lenNum, lenOrNull, pickEntityAt, pointFeaturesRef, pointIdsForSelection, resolveDrawPoint, setCoordMode, setCurveOffsetMode, setCurveRef, setDivideSpacingMode, setHoverSnap, showOriginGuide, originGuideAt, originLockForMove, moveLockRef, markOrigin, markOriginMid, applyOriginLocks, snapLineToHV, startPan, startRotate, toSvgCoords, trapMode, uLabel,
  } = prev;
  // Called on every mouse move over the canvas while a line/circle's 2nd
  // point hasn't been placed yet — drives the dashed preview and keeps the
  // bottom-bar length/radius field in sync with the cursor, unless the user
  // is actively typing into it (isEditingLive), in which case their typed
  // value wins until they commit or cancel.
  const handleCanvasMouseMove = (evt: React.MouseEvent<SVGSVGElement>) => {
    // Tracked unconditionally, ahead of every tool-specific branch below
    // (several of which return early) — this is App.tsx's statusbar X/Y/Z
    // readout, not tied to any particular tool's own preview state.
    cursorPosRef.current = toSvgCoords(evt);
    // Same "unconditional, ahead of every branch" placement — the hover
    // snap glyph (see hoverSnapAt) has to update no matter which tool is
    // active, or whether one is active at all.
    setHoverSnap(hoverSnapAt(cursorPosRef.current.x, cursorPosRef.current.y));
    // The H / V crosshair through the plane's centre while the cursor is approaching or locked onto (0, 0).
    showOriginGuide(originGuideAt(cursorPosRef.current.x, cursorPosRef.current.y));
    // Hand cursor over a pickable element — hit-tested here, once per mouse
    // move, rather than on every render.
    if (tool === 'select' || tool === 'hide-show') {
      const over = !!pickEntityAt(cursorPosRef.current.x, cursorPosRef.current.y);
      if (over !== hoverEntity) setHoverEntity(over);
    }
    // View toolbar drags (Zoom Area / Zoom In Out) sit on top of any tool.
    if (viewDragRef.current) {
      const drag = viewDragRef.current;
      if (viewGesture === 'zoom-area') {
        const p = rawClientToSvg(evt.clientX, evt.clientY);
        setZoomAreaBox({ x1: drag.start.x, y1: drag.start.y, x2: p.x, y2: p.y });
      } else if (viewGesture === 'zoom-drag') {
        // Drag up zooms in, drag down zooms out, about the view center.
        const f = Math.min(4000 / drag.vb.w, Math.max(15 / drag.vb.w, Math.exp((evt.clientY - drag.clientY) * 0.01)));
        const cx = drag.vb.x + drag.vb.w / 2, cy = drag.vb.y + drag.vb.h / 2;
        setViewBox({ x: cx - (drag.vb.w * f) / 2, y: cy - (drag.vb.h * f) / 2, w: drag.vb.w * f, h: drag.vb.h * f });
      }
      return;
    }
    if (tool === 'profile' && profileChain) { const pp = toSvgCoords(evt); setMousePt(magnetPoint(pp.x, pp.y)); return; }
    if (tool === 'select') {
      const { x, y } = toSvgCoords(evt);
      if (trapMode === 'polygon' && trapPoly.length > 0) setMousePt({ x, y });
      if (dragModeRef.current === 'paint' && paintStroke) {
        if (!dragMovedRef.current && dragStartClientRef.current && Math.hypot(evt.clientX - dragStartClientRef.current.x, evt.clientY - dragStartClientRef.current.y) > 4) dragMovedRef.current = true;
        setPaintStroke((st) => (st ? [...st, { x, y }] : st));
        return;
      }
      // Screen-pixel distance, not sketch-space distance — see
      // dragStartClientRef's comment: a fixed sketch-unit threshold shrinks
      // below a real pixel whenever the view is zoomed out, so ordinary
      // mouse jitter during a plain click was getting misread as a drag
      // and silently swallowing the click instead of selecting.
      if (!dragMovedRef.current && dragStartClientRef.current) {
        const pxDist = Math.hypot(evt.clientX - dragStartClientRef.current.x, evt.clientY - dragStartClientRef.current.y);
        if (pxDist > 4) dragMovedRef.current = true;
      }
      if (dragModeRef.current === 'box' && dragStartRef.current) {
        setDragBox({ x1: dragStartRef.current.x, y1: dragStartRef.current.y, x2: x, y2: y });
        return;
      }
      if (dragModeRef.current === 'move' && moveOriginRef.current) {
        let dx = x - moveOriginRef.current.x, dy = y - moveOriginRef.current.y;
        // A moving point (or a moving line's midpoint) that comes within reach of the origin is pulled exactly onto it.
        const lock = dragMovedRef.current ? originLockForMove(dx, dy, moveBaseRef.current) : null;
        if (lock) { dx += lock.ddx; dy += lock.ddy; }
        moveLockRef.current = lock ? { pointId: lock.pointId, lineId: lock.lineId } : null;
        showOriginGuide(lock ? 'locked' : originGuideAt(x, y));
        const nextPoints = points.map((p) => {
          const base = moveBaseRef.current.get(p.id);
          return base ? { ...p, x: base.x + dx, y: base.y + dy } : p;
        });
        setPoints(nextPoints);
        if (dragMovedRef.current) {
          if (moveSolveDebounceRef.current !== null) window.clearTimeout(moveSolveDebounceRef.current);
          moveSolveDebounceRef.current = window.setTimeout(() => {
            moveSolveDebounceRef.current = null;
            void solve(nextPoints, lines, circles, constraints);
          }, 150);
        }
        return;
      }
      return;
    }
    // General Profile / Spline share the same click-to-add/double-click-
    // to-finish gesture as the Polygon Trap above — same rubber-band idea.
    if ((tool === 'spline' || tool === 'spline-cv') && wizardPolyPts.length > 0) {
      const rawSp = toSvgCoords(evt);
      const { x, y } = magnetPoint(rawSp.x, rawSp.y);
      // Every control point after the first snaps to the grid the same way
      // the first one (placed via addPoint) already does — see the
      // matching gridSnap in this tool's own canvasClick.tsx commit.
      setMousePt(gridSnap(x, y));
      return;
    }
    // The Profile/Circle/Ellipse/Line flyout tools track their stage via
    // wizardPtsRef/wizardIdsRef instead of pendingRef, so they need mousePt
    // tracked without the pendingRef gate below — this is what drives their
    // own dashed-preview + measurement blocks further down in the JSX.
    if ([
      'rect-oriented', 'rect-parallelogram', 'slot', 'slot-cyl', 'keyhole', 'circle-3pt', 'circle-tritangent',
      'ellipse', 'parabola', 'hyperbola', 'conic', 'line-normal', 'line-symmetric', 'spline-connect',
      'rect-center3', 'rect-parallelogram-center', 'arc-3pt', 'arc-3pt-limits', 'slot-arc', 'ellipse-arc', 'conic-rp',
      'point-midpoint', 'fillet-2d', 'chamfer-2d', 'arc-tangent',
      'line-infinite', 'line-bitangent', 'line-bisect', 'point-intersect', 'point-project',
      'mirror-2d', 'translate-2d', 'rotate-2d', 'offset-2d', 'project-3d',
    ].includes(tool)) {
      const rawW = toSvgCoords(evt);
      setMousePt(magnetPoint(rawW.x, rawW.y));
      return;
    }
    // Line tool with no anchor placed yet, and the plain Point tool (a
    // canvas click is its entire gesture, no pending anchor ever involved)
    // both still want mousePt tracked — that's what drives the "what
    // would clicking now snap onto" reticle preview further down in the
    // JSX (see renderSnapGlyph), matching the same snap feedback the Line
    // tool's own hover-before-first-click already gets.
    if ((tool === 'line' && !pendingRef.current) || tool === 'point') {
      const { x, y } = toSvgCoords(evt);
      setMousePt({ x, y });
      return;
    }
    if (!pendingRef.current || !['line', 'circle', 'rectangle', 'arc', 'hexagon', 'circle-2pt', 'axis-construction', 'polygon-n'].includes(tool)) return;
    const rawP = toSvgCoords(evt);
    const { x, y } = magnetPoint(rawP.x, rawP.y);   // (the Line tool is not a magnet tool — it resolves its own snaps)
    // Line's own preview re-derives through resolveDrawPoint just below,
    // fed this exact raw position so it can still catch a nearby off-grid
    // point (see resolveDrawPoint's own grid-snap fallback for what happens
    // once nothing else claims it) — grid-snapping mousePt itself first
    // would blind that lookup. Every other tool here has no such downstream
    // pass, so this is their only chance to show the same grid intersection
    // a click would actually land on (see the matching gridSnap calls their
    // own canvasClick.tsx commits now use) instead of trailing the raw
    // pixel the whole time they're dragged.
    const trackedPt = tool === 'line' ? { x, y } : gridSnap(x, y);
    setMousePt(trackedPt);
    // Rectangle/Arc drive their own preview off mousePt directly (a W×H
    // box, or a radius/sweep) — only Line/Circle use the bottom-bar
    // Length/Radius live-value field.
    if (tool !== 'line' && tool !== 'circle') return;
    if (isEditingLive) return;
    const anchor = pointById.get(pendingRef.current);
    if (!anchor) return;
    // For a line, reflect whatever a click would actually commit right now
    // (see resolveDrawPoint) — once the H/V inference is active the real
    // endpoint is locked onto that axis, not sitting exactly under the
    // cursor, so the raw hypot here would show a length that's subtly off
    // from the one you'd actually get.
    const target = tool === 'line' ? resolveDrawPoint(x, y, anchor) : trackedPt;
    if ('originMid' in target && target.originMid) showOriginGuide('locked');
    setLiveValue(toU(Math.hypot(target.x - anchor.x, target.y - anchor.y)).toFixed(2));
  };

  // Select tool's only drag gesture: starting on empty canvas box-selects
  // (unchanged); starting directly on an already-selected entity instead
  // drags the whole selection (handleCanvasMouseMove does the actual
  // translating once dragModeRef is set here). Click-to-select/deselect is
  // handleCanvasClick's job, since that doesn't involve holding the mouse
  // down.
  const handleCanvasMouseDown = (evt: React.MouseEvent<SVGSVGElement>) => {
    // Alt+middle/right-drag to rotate the view — the same buttons pan uses
    // on their own, so a plain middle/right-drag still pans. Left stays out
    // of this entirely: a left mouseup fires a real click afterward (tool
    // actions live there), which a drag-to-rotate would fire spuriously.
    if (evt.altKey && (evt.button === 1 || evt.button === 2)) { startRotate(evt); return; }
    // Universal scheme: the middle button pans; the right button does nothing alone (it only joins the middle one to zoom).
    if (evt.button === 1) { startPan(evt); return; }
    if (evt.button === 2) { evt.preventDefault(); return; }
    if (viewGesture && evt.button === 0) {
      evt.preventDefault();
      viewDragRef.current = { start: rawClientToSvg(evt.clientX, evt.clientY), clientY: evt.clientY, vb: viewBox };
      return;
    }
    if (tool !== 'select') return;
    const { x, y } = toSvgCoords(evt);
    dragMovedRef.current = false;
    dragStartClientRef.current = { x: evt.clientX, y: evt.clientY };
    const hit = pickEntityAt(x, y);
    // Polygon Trap collects clicks instead of dragging a box.
    if (trapMode === 'polygon' && (trapPoly.length > 0 || !hit || !selected.includes(hit.id))) { dragModeRef.current = null; return; }
    if (trapMode === 'paint' && !(hit && selected.includes(hit.id))) {
      dragModeRef.current = 'paint';
      setPaintStroke([{ x, y }]);
      return;
    }
    if (hit && selected.includes(hit.id)) {
      dragModeRef.current = 'move';
      moveOriginRef.current = { x, y };
      moveIdsRef.current = pointIdsForSelection(selected);
      const base = new Map<string, { x: number; y: number }>();
      for (const pid of moveIdsRef.current) {
        const pt = pointById.get(pid);
        if (pt) base.set(pid, { x: pt.x, y: pt.y });
      }
      moveBaseRef.current = base;
    } else {
      dragModeRef.current = 'box';
      dragStartRef.current = { x, y };
      setDragBox({ x1: x, y1: y, x2: x, y2: y });
    }
  };

  const handleCanvasMouseUp = () => {
    if (viewDragRef.current) {
      // Zoom Area magnifies the dragged box; Zoom In Out simply ends on
      // release. Either way the gesture is one-shot.
      if (viewGesture === 'zoom-area' && zoomAreaBox) {
        const r = normalizeRect(zoomAreaBox);
        if (r.maxX - r.minX > 1e-3 && r.maxY - r.minY > 1e-3) setViewBox(viewBoxAround(r.minX, r.minY, r.maxX, r.maxY, 0));
      }
      viewDragRef.current = null;
      setZoomAreaBox(null);
      setViewGesture(null);
      suppressClickRef.current = true;
      return;
    }
    if (tool !== 'select') return;
    if (dragModeRef.current === 'paint') {
      if (paintStroke && paintStroke.length > 1) {
        const stroke = paintStroke;
        addToSelection(trapHits((pts) => samplesTouchStroke(pts, stroke, HIT_TOL)));
      }
      setPaintStroke(null); dragModeRef.current = null; dragStartClientRef.current = null;
      return;
    }
    if (dragModeRef.current === 'box') {
      if (dragStartRef.current && dragBox) {
        // The box's trap variant: fully inside (Selection Trap), inside or
        // crossing (Intersecting Trap), fully outside (Outside Trap), or
        // outside or crossing (Intersecting Outside Trap).
        const rect = normalizeRect(dragBox);
        const test = trapMode === 'intersecting' ? (pts: { x: number; y: number }[]) => samplesTouchRect(pts, rect)
          : trapMode === 'outside' ? (pts: { x: number; y: number }[]) => !samplesTouchRect(pts, rect)
          : trapMode === 'intersecting-outside' ? (pts: { x: number; y: number }[]) => !samplesInsideRect(pts, rect)
          : (pts: { x: number; y: number }[]) => samplesInsideRect(pts, rect);
        // A bare click (no real drag) must not select everything outside it.
        if (dragMovedRef.current) addToSelection(trapHits(test));
      }
      dragStartRef.current = null; dragStartClientRef.current = null; setDragBox(null); dragModeRef.current = null;
      return;
    }
    if (dragModeRef.current === 'move') {
      if (moveSolveDebounceRef.current !== null) { window.clearTimeout(moveSolveDebounceRef.current); moveSolveDebounceRef.current = null; }
      // A drag that ended locked onto the origin keeps that lock as a real constraint (a Coincident to the Origin for a point, a Midpoint for a
      // line); otherwise it is the usual solve of the new positions.
      const lk = moveLockRef.current; moveLockRef.current = null; showOriginGuide(null);
      if (lk && dragMovedRef.current) { if (lk.pointId) markOrigin(lk.pointId); if (lk.lineId) markOriginMid(lk.lineId); }
      if (dragMovedRef.current && !(lk && applyOriginLocks())) void solve(points, lines, circles, constraints);
      dragModeRef.current = null;
      dragStartClientRef.current = null;
      moveOriginRef.current = null; moveIdsRef.current = new Set(); moveBaseRef.current = new Map();
    }
  };

  const handleCanvasDoubleClick = (evt: React.MouseEvent<SVGSVGElement>) => {
    // Feature Persistence & Re-Editing: double-clicking any existing point
    // that a Point Tool sub-mode created re-opens the Sketch Inspector in
    // that exact sub-mode with its stored parameters loaded back in, ready
    // to edit and re-Apply in place. Skipped while a click-to-add wizard
    // (General Profile / Spline) is actively collecting points, so a
    // double-click meant to close the polygon isn't hijacked by a stray
    // existing point underneath the cursor.
    if (tool === 'select' && trapMode === 'polygon' && trapPoly.length > 0) {
      // The double-click's own two clicks each added a corner at the same
      // spot; drop that duplicate before closing the polygon.
      const poly = trapPoly.filter((p, i) => i === 0 || Math.hypot(p.x - trapPoly[i - 1].x, p.y - trapPoly[i - 1].y) > 1e-6);
      if (poly.length >= 3) addToSelection(trapHits((pts) => samplesInsidePolygon(pts, poly)));
      setTrapPoly([]); setMousePt(null);
      return;
    }
    if (tool === 'profile') { finishProfile(true); return; }
    if (tool !== 'spline' && tool !== 'spline-cv') {
      const { x, y } = toSvgCoords(evt);
      const hitPoint = findNearestPoint(x, y);
      const feature = hitPoint ? pointFeaturesRef.current[hitPoint.id] : null;
      if (hitPoint && feature) {
        resetToolState();
        setFlyoutOpen(null);
        if (feature.mode === 'point-coord') {
          setCoordMode(feature.coordMode); setCoordX(feature.coordX); setCoordY(feature.coordY);
          setCoordR(feature.coordR); setCoordTheta(feature.coordTheta);
          setEditingPointId(hitPoint.id);
          setTool('point-coord');
        } else if (feature.mode === 'point-oncurve') {
          if (geomById(feature.curveTargetId)) {
            setCurveRef(feature.curveRef); setCurveOffsetMode(feature.curveOffsetMode); setCurveOffsetValue(feature.curveOffsetValue);
            setCurveTargetId(feature.curveTargetId);
            setEditingPointId(hitPoint.id);
            setTool('point-oncurve');
          }
        } else if (feature.mode === 'point-divide') {
          if (geomById(feature.divideTargetId)) {
            setDivideCount(feature.divideCount); setDivideSpacingMode(feature.divideSpacingMode); setDivideFixedDistance(feature.divideFixedDistance);
            setDivideTargetId(feature.divideTargetId);
            setEditingGroupId(feature.groupId);
            setTool('point-divide');
          }
        } else if (feature.mode === 'point-midpoint') {
          // Read-only: a midpoint is definitionally locked to its parent,
          // so there's nothing to load into editable state — just switch
          // into the sub-mode and select it so the Inspector's own
          // point-midpoint panel can show its parent reference (see the
          // Inspector JSX, which reads pointFeaturesRef directly off `selected`).
          setTool('point-midpoint');
          setSelected([hitPoint.id]);
        }
        return;
      }
      // Double-click any other element with Select: it's selected and its
      // values open for editing in the Inspector (first field focused).
      const hit = tool === 'select' ? pickEntityAt(x, y) : null;
      if (hit && !hit.id.startsWith('__')) {
        setSelected([hit.id]);
        window.setTimeout(() => {
          const field = document.querySelector<HTMLInputElement>('[data-edit-group] input');
          field?.focus(); field?.select();
        }, 50);
        return;
      }
    }
    // Spline: each clicked point becomes a real, shared Pt (its control points),
    // fit through with a Catmull-Rom curve resampled live off them — see
    // the SketchCurve type comment above.
    if (tool === 'spline' && wizardPolyPts.length >= 2) {
      const controlIds = wizardPolyPts.map((p) => addPoint(p.x, p.y));
      setCurves((cv) => [...cv, { id: nextId('cv'), kind: 'spline', controlIds }]);
      setWizardPolyPts([]);
    } else if (tool === 'spline-cv' && wizardPolyPts.length >= 2) {
      const controlIds = wizardPolyPts.map((p) => addPoint(p.x, p.y));
      setCurves((cv) => [...cv, { id: nextId('cv'), kind: 'spline-cv', controlIds }]);
      setWizardPolyPts([]);
    }
  };

  // Commits the pending line/circle using the typed liveValue instead of a
  // second click — same direction the mouse is currently on (for a line),
  // defaulting to +X if the mouse hasn't moved yet.
  const commitLiveValue = () => {
    if (!pendingRef.current) return;
    const anchor = pointById.get(pendingRef.current);
    const value = lenNum(liveValue);
    if (!anchor || !value || value <= 0) return;
    const startId = pendingRef.current;
    if (tool === 'line') {
      let dx = 1, dy = 0;
      let axis: 'h' | 'v' | null = null;
      const typedAngle = numOrNull(numAngle);
      if (typedAngle !== null) {
        // Length + Angle typed (counter-clockwise from H, V up) — exact
        // direction, with 0/90/180/270° still becoming a real H/V line.
        const rad = (typedAngle * Math.PI) / 180;
        dx = Math.cos(rad); dy = -Math.sin(rad);
        const m = ((typedAngle % 180) + 180) % 180;
        axis = Math.abs(m) < 1e-9 ? 'h' : Math.abs(m - 90) < 1e-9 ? 'v' : null;
      } else if (mousePt) {
        // Same H/V inference the preview/click path uses (see
        // resolveDrawPoint) — so typing a length while the rubber-band is
        // showing the cyan H/V lock still produces a real Horizontal/
        // Vertical line, not just one that happens to be the right length.
        const snapped = snapLineToHV(anchor, mousePt);
        const dirSource = snapped.axis ? snapped.point : mousePt;
        axis = snapped.axis;
        const len = Math.hypot(dirSource.x - anchor.x, dirSource.y - anchor.y);
        if (len > 1e-6) { dx = (dirSource.x - anchor.x) / len; dy = (dirSource.y - anchor.y) / len; }
      }
      finishLine(startId, { x: anchor.x + dx * value, y: anchor.y + dy * value }, null, axis);
      // A typed angle applies to this line only; the next one follows the cursor again.
      setNumAngle('');
      return;
    } else if (tool === 'circle') {
      setCircles((cs) => [...cs, { id: nextId('cir'), center: startId, r: value }]);
    }
    cancelPending();
  };

  // Elongated Hole / Cylindrical Elongated Hole — two equal-radius arcs
  // (the rounded ends) joined by two straight tangent lines, built from
  // just the two slot-end centers and a radius. Since both ends share one
  // radius, the external tangent lines are simply offset by r
  // perpendicular to the axis on each side — the far half of the sweep at
  // c1, the near half at c2 (describeArcPath/angleInSweep normalize mod
  // 360° internally, so angles past 360 here are fine).
  const buildSlot = (c1: { x: number; y: number }, c2: { x: number; y: number }, r: number) => {
    const a = angleOfPts(c1, c2);
    // Every point exact (not grid-snapped): the caps' endpoints are the
    // straight sides' endpoints, so the slot is one closed line/arc chain.
    const id1 = addPointExact(c1.x, c1.y), id2 = addPointExact(c2.x, c2.y);
    const mk = (c: { x: number; y: number }, ang: number) => ({ x: c.x + r * Math.cos((ang * Math.PI) / 180), y: c.y + r * Math.sin((ang * Math.PI) / 180) });
    const topA = mk(c1, a + 90), topB = mk(c2, a + 90);
    const botA = mk(c1, a - 90), botB = mk(c2, a - 90);
    const idTopA = addPointExact(topA.x, topA.y), idTopB = addPointExact(topB.x, topB.y);
    const idBotA = addPointExact(botA.x, botA.y), idBotB = addPointExact(botB.x, botB.y);
    const arc1: Arc = { id: nextId('arc'), center: id1, r, start: a + 90, end: a + 270, p1: idTopA, p2: idBotA };
    const arc2: Arc = { id: nextId('arc'), center: id2, r, start: a - 90, end: a + 90, p1: idBotB, p2: idTopB };
    setArcs((as) => [...as, arc1, arc2]);
    setLines((ls) => [...ls, { id: nextId('ln'), p1: idTopA, p2: idTopB }, { id: nextId('ln'), p1: idBotA, p2: idBotB }]);
  };

  // Keyhole: small circle at c1 (0.4 × the large radius), large circle at
  // c2 sized by the 3rd click, joined by the two exact external tangents.
  // Returns the tangent points and, for each circle, the arc facing away
  // from the other (start/end in the Arc convention, from P to Q).
  const keyholeShape = (c1: { x: number; y: number }, c2: { x: number; y: number }, x: number, y: number) => {
    const r2 = Math.max(3, perpDistanceToLine(x, y, c1, c2));
    const r1 = Math.max(1.5, r2 * 0.4);
    if (Math.hypot(c2.x - c1.x, c2.y - c1.y) <= r2 - r1 + 1e-6) return null;
    const a = angleOfPts(c1, c2), rad = (a * Math.PI) / 180;
    const n = { x: -Math.sin(rad), y: Math.cos(rad) };
    const side = (sgn: number) => biTangentLine({ ...c1, r: r1 }, { ...c2, r: r2 },
      { x: c1.x + n.x * r1 * sgn, y: c1.y + n.y * r1 * sgn }, { x: c2.x + n.x * r2 * sgn, y: c2.y + n.y * r2 * sgn });
    const top = side(1), bot = side(-1);
    if (!top || !bot) return null;
    const norm = (d: number) => ((d % 360) + 360) % 360;
    const sweepFacing = (c: { x: number; y: number }, P: { x: number; y: number }, Q: { x: number; y: number }, farDeg: number) => {
      const aP = norm(angleOfPts(c, P)), aQ = norm(angleOfPts(c, Q));
      return angleInSweep(farDeg, aP, aQ) ? { start: aP, end: aQ, pFirst: true } : { start: aQ, end: aP, pFirst: false };
    };
    return {
      r1, r2, top, bot,
      small: sweepFacing(c1, top.t1, bot.t1, norm(a + 180)),
      big: sweepFacing(c2, top.t2, bot.t2, norm(a)),
    };
  };

  // 3-Point Arc — the unique arc through 3 points, swept so it actually
  // passes through the 3rd (middle) point rather than the "wrong way
  // around" the same circle. Shared by 3-Point Arc and 3-Point Arc with
  // Limits (the latter differs only in that its start/end angles are meant
  // to be pulled afterward, which the existing Radius/Start/End Inspector
  // fields already support — see the Arc property block below).
  const build3PtArc = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) => {
    const cc = circumcenter3(p1, p2, p3);
    if (!cc) return null;
    const norm = (d: number) => ((d % 360) + 360) % 360;
    let start = norm(angleOfPts(cc, p1));
    let end = norm(angleOfPts(cc, p2));
    const mid = norm(angleOfPts(cc, p3));
    const within = norm(mid - start) <= norm(end - start);
    if (!within) [start, end] = [end, start];
    return { cx: cc.x, cy: cc.y, r: cc.r, start, end };
  };

  // --- Typed (Sketch tools) entry --------------------------------------
  // H/V are offsets from the sketch origin with V pointing up, exactly as
  // Points by Coordinates reads them (see applyCoordPoint).
  const fromHV = (h: number, v: number) => ({ x: SKETCH_ORIGIN.x + h, y: SKETCH_ORIGIN.y - v });

  const numOrNull = (s: string) => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) ? n : null; };

  const fixedAt = (id: string, x: number, y: number): Constraint => ({ id: nextId('c'), type: 'fixed', args: { point: id, x, y }, label: `Fixed: ${id}` });

  const distanceOf = (p1: string, p2: string, value: number): Constraint => ({ id: nextId('c'), type: 'distance', args: { p1, p2, value }, label: `Distance: ${p1}–${p2} = ${value.toFixed(2)}mm` });

  // Commits one line from an existing start point, honoring the Line
  // tool's Symmetrical Extension toggle (the start becomes the midpoint).
  // Builds every new point explicitly so the solve that follows sees them.
  const finishLine = (startId: string, end: { x: number; y: number }, endId: string | null, axis: 'h' | 'v' | null, fixEnd = false, tangentTo: { id: string; kind: 'circle' | 'arc' | 'curve' } | null = null, originMid = false) => {
    const anchor = pointById.get(startId);
    if (!anchor) { cancelPending(); return; }
    const newPts: Pt[] = [];
    const extra: Constraint[] = [];
    let e = endId;
    if (!e) {
      e = nextId('pt'); newPts.push({ id: e, x: end.x, y: end.y });
      // An end point that landed exactly on the origin is locked there (see markOrigin).
      if (!fixEnd && Math.hypot(end.x - SKETCH_ORIGIN.x, end.y - SKETCH_ORIGIN.y) < 1e-9) markOrigin(e);
    }
    if (fixEnd) extra.push(fixedAt(e, end.x, end.y));
    let s = startId;
    if (lineSymToggle) { s = nextId('pt'); newPts.push({ id: s, x: 2 * anchor.x - end.x, y: 2 * anchor.y - end.y }); }
    const lineId = nextId('ln');
    const nextPoints = [...points, ...newPts];
    const nextLines = [...lines, { id: lineId, p1: s, p2: e }];
    let nextConstraints = [...constraints, ...extra];
    if (axis) {
      const ctype = axis === 'h' ? 'horizontal' : 'vertical';
      nextConstraints = upsertInList(nextConstraints, (c) => c.type === ctype && c.args.line === lineId, ctype, { line: lineId }, `${axis === 'h' ? 'Horizontal' : 'Vertical'}: ${lineId}`);
    }
    if (tangentTo) {
      nextConstraints = [...nextConstraints, tangentTo.kind === 'circle'
        ? { id: nextId('c'), type: 'tangent_line_circle', args: { line: lineId, circle: tangentTo.id }, label: `Tangent: ${lineId}, ${tangentTo.id}` }
        : { id: nextId('c'), type: 'tangent_line_curve', args: { line: lineId, curve: tangentTo.id }, label: `Tangent: ${lineId}, ${tangentTo.id}` }];
    }
    if (lineSymToggle) symmetricLineIdsRef.current.add(lineId);
    if (originMid && !lineSymToggle) markOriginMid(lineId);
    setPoints(nextPoints); setLines(nextLines); setConstraints(nextConstraints);
    cancelPending();
    if (axis || extra.length || tangentTo) void solve(nextPoints, nextLines, circles, nextConstraints);
  };

  // Line / Axis "Start Point H/V" + Enter: places the (fixed) start point
  // and arms the second stage, as if it had been clicked.
  const commitTypedStart = () => {
    const h = lenOrNull(numStartH), v = lenOrNull(numStartV);
    if (h === null || v === null) return;
    const pos = fromHV(h, v);
    const existing = findNearestPoint(pos.x, pos.y);
    const id = existing && Math.hypot(existing.x - pos.x, existing.y - pos.y) < 1e-6 ? existing.id : addPointExact(pos.x, pos.y);
    setConstraints((cs) => [...cs, fixedAt(id, pos.x, pos.y)]);
    pendingRef.current = id; setPending(id);
    setMousePt(pos); setLiveValue('0.00');
  };

  // Line / Axis "End Point H/V" + Enter.
  const commitTypedEnd = () => {
    const startId = pendingRef.current;
    const h = lenOrNull(numEndH), v = lenOrNull(numEndV);
    if (!startId || h === null || v === null) return;
    const pos = fromHV(h, v);
    if (tool === 'axis-construction') {
      const endId = nextId('pt');
      const nextPoints = [...points, { id: endId, x: pos.x, y: pos.y }];
      const nextLines = [...lines, { id: nextId('ln'), p1: startId, p2: endId, style: 'construction' as const }];
      const nextConstraints = [...constraints, fixedAt(endId, pos.x, pos.y)];
      setPoints(nextPoints); setLines(nextLines); setConstraints(nextConstraints);
      cancelPending();
      void solve(nextPoints, nextLines, circles, nextConstraints);
      return;
    }
    finishLine(startId, pos, null, null, true);
  };

  // Circle "Center H/V + R" + Enter, with no click at all.
  const commitTypedCircle = () => {
    const h = lenOrNull(numStartH), v = lenOrNull(numStartV), r = lenOrNull(numRadius);
    if (h === null || v === null || r === null || r <= 0) return;
    const pos = fromHV(h, v);
    const centerId = nextId('pt'), circleId = nextId('cir');
    const nextPoints = [...points, { id: centerId, x: pos.x, y: pos.y }];
    const nextCircles = [...circles, { id: circleId, center: centerId, r }];
    const nextConstraints = [...constraints, fixedAt(centerId, pos.x, pos.y), { id: nextId('c'), type: 'radius', args: { circle: circleId, value: r }, label: `Radius: ${circleId} = ${r}mm` }];
    setPoints(nextPoints); setCircles(nextCircles); setConstraints(nextConstraints);
    void solve(nextPoints, lines, nextCircles, nextConstraints);
  };

  // Circle Using Coordinates (bar or Circle Definition dialog): center H/V
  // from the sketch origin plus radius, in the current unit.
  const commitCircleCoord = () => {
    const h = lenOrNull(circCoordX), v = lenOrNull(circCoordY), r = lenOrNull(circCoordR);
    if (h === null || v === null || r === null || r <= 0) return false;
    const c = fromHV(h, v);
    const centerId = addPointExact(c.x, c.y);
    setCircles((cs) => [...cs, { id: nextId('cir'), center: centerId, r }]);
    return true;
  };

  // Rectangle: four individual lines, auto-constrained Horizontal/Vertical.
  // `anchor` is the first corner (already on the canvas for a click, or a
  // brand-new point for typed values, which also get a Fixed corner and
  // Width/Height distances — the "few dimensions and constraints" the
  // guide says typed values apply).
  const commitRectangle = (anchor: Pt, anchorIsNew: boolean, x: number, y: number, typed: boolean) => {
    if (Math.abs(x - anchor.x) < 1e-3 && Math.abs(y - anchor.y) < 1e-3) return;
    const p2: Pt = { id: nextId('pt'), x, y: anchor.y };
    const p3: Pt = { id: nextId('pt'), x, y };
    const p4: Pt = { id: nextId('pt'), x: anchor.x, y };
    // A real, selectable center point — same as every other polygon shape
    // here already gets (Hexagon/Regular Polygon are drawn center-first;
    // 3-Point Center Rectangle/Center Parallelogram add one explicitly
    // below). Starts at the exact midpoint of the two clicked corners,
    // never grid-snapped — and a real "midpoint" solver constraint (see
    // sketch_solver.py's constrain_midpoint) keeps it there through any
    // later edit (a dragged corner, a resized dimension), the same way
    // Horizontal/Vertical below keep the edges level after a drag rather
    // than only being true at the instant they're drawn.
    const centerPt: Pt = { id: nextId('pt'), x: (anchor.x + x) / 2, y: (anchor.y + y) / 2 };
    const lnBottom = nextId('ln'), lnRight = nextId('ln'), lnTop = nextId('ln'), lnLeft = nextId('ln');
    const newLines: Ln[] = [
      { id: lnBottom, p1: anchor.id, p2: p2.id },
      { id: lnRight, p1: p2.id, p2: p3.id },
      { id: lnTop, p1: p3.id, p2: p4.id },
      { id: lnLeft, p1: p4.id, p2: anchor.id },
    ];
    const newConstraints: Constraint[] = [
      { id: nextId('c'), type: 'horizontal', args: { line: lnBottom }, label: `Horizontal: ${lnBottom}` },
      { id: nextId('c'), type: 'horizontal', args: { line: lnTop }, label: `Horizontal: ${lnTop}` },
      { id: nextId('c'), type: 'vertical', args: { line: lnLeft }, label: `Vertical: ${lnLeft}` },
      { id: nextId('c'), type: 'vertical', args: { line: lnRight }, label: `Vertical: ${lnRight}` },
      { id: nextId('c'), type: 'midpoint', args: { center: centerPt.id, points: [anchor.id, p2.id, p3.id, p4.id] }, label: `Center: ${centerPt.id}` },
    ];
    if (typed) newConstraints.push(fixedAt(anchor.id, anchor.x, anchor.y), distanceOf(anchor.id, p2.id, Math.abs(x - anchor.x)), distanceOf(anchor.id, p4.id, Math.abs(y - anchor.y)));
    const nextPoints = [...points, ...(anchorIsNew ? [anchor] : []), p2, p3, p4, centerPt];
    const nextLines = [...lines, ...newLines];
    const nextConstraints = [...constraints, ...newConstraints];
    setPoints(nextPoints);
    setLines(nextLines);
    setConstraints(nextConstraints);
    void solve(nextPoints, nextLines, circles, nextConstraints);
  };

  // Oriented Rectangle / Parallelogram: four new corners in order. Parallel
  // + equal-length opposite sides keep either shape true under the
  // solver; the oriented rectangle adds a perpendicular corner.
  const commitQuad = (c: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }], kind: 'oriented' | 'parallelogram', typed: boolean) => {
    const id1 = nextId('pt'), id2 = nextId('pt'), id3 = nextId('pt'), id4 = nextId('pt');
    const newPts: Pt[] = [{ id: id1, ...c[0] }, { id: id2, ...c[1] }, { id: id3, ...c[2] }, { id: id4, ...c[3] }];
    // Same real, solver-tracked center point commitRectangle adds — the
    // centroid of the 4 corners, exact, never grid-snapped, and kept there
    // by the same "midpoint" constraint (see sketch_solver.py) so it
    // follows this shape through later edits too.
    const centerPt: Pt = { id: nextId('pt'), x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4, y: (c[0].y + c[1].y + c[2].y + c[3].y) / 4 };
    const ln1 = nextId('ln'), ln2 = nextId('ln'), ln3 = nextId('ln'), ln4 = nextId('ln');
    const newLines: Ln[] = [{ id: ln1, p1: id1, p2: id2 }, { id: ln2, p1: id2, p2: id3 }, { id: ln3, p1: id3, p2: id4 }, { id: ln4, p1: id4, p2: id1 }];
    const newConstraints: Constraint[] = [
      { id: nextId('c'), type: 'parallel', args: { line1: ln1, line2: ln3 }, label: `Parallel: ${ln1} / ${ln3}` },
      { id: nextId('c'), type: 'parallel', args: { line1: ln2, line2: ln4 }, label: `Parallel: ${ln2} / ${ln4}` },
      ...(kind === 'oriented' ? [{ id: nextId('c'), type: 'perpendicular', args: { line1: ln1, line2: ln2 }, label: `Perpendicular: ${ln1} / ${ln2}` }] : []),
      { id: nextId('c'), type: 'equal_length', args: { line1: ln1, line2: ln3 }, label: `Equal length: ${ln1}, ${ln3}` },
      { id: nextId('c'), type: 'equal_length', args: { line1: ln2, line2: ln4 }, label: `Equal length: ${ln2}, ${ln4}` },
      { id: nextId('c'), type: 'midpoint', args: { center: centerPt.id, points: [id1, id2, id3, id4] }, label: `Center: ${centerPt.id}` },
    ];
    if (typed) {
      newConstraints.push(
        fixedAt(id1, c[0].x, c[0].y),
        distanceOf(id1, id2, Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y)),
        distanceOf(id2, id3, Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y)),
      );
    }
    const nextPoints = [...points, ...newPts, centerPt];
    const nextLines = [...lines, ...newLines];
    const nextConstraints = [...constraints, ...newConstraints];
    setPoints(nextPoints);
    setLines(nextLines);
    setConstraints(nextConstraints);
    void solve(nextPoints, nextLines, circles, nextConstraints);
  };

  // Rectangle / Oriented Rectangle / Parallelogram from typed values:
  // first corner H/V, Width along the first side, Height along the second,
  // and either the orientation angle A (Oriented Rectangle) or the angle
  // between the sides (Parallelogram). Angles run counter-clockwise from H.
  const commitTypedQuad = () => {
    const h = lenOrNull(numStartH), v = lenOrNull(numStartV), w = lenOrNull(numWidth), ht = lenOrNull(numHeight);
    if (h === null || v === null || w === null || ht === null || w === 0 || ht === 0) return;
    const p1 = fromHV(h, v);
    const dirAt = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: -Math.sin((deg * Math.PI) / 180) });
    if (tool === 'rectangle') {
      commitRectangle({ id: nextId('pt'), ...p1 }, true, p1.x + w, p1.y - ht, true);
      return;
    }
    // A: the first side's orientation (both tools); a parallelogram's
    // second side leaves at its own Angle from the first.
    const a = numOrNull(numAngle) ?? 0;
    const side2 = tool === 'rect-oriented' ? a + 90 : a + (numOrNull(numSkew) ?? 90);
    const u = dirAt(a), n = dirAt(side2);
    const p2 = { x: p1.x + u.x * w, y: p1.y + u.y * w };
    const p3 = { x: p2.x + n.x * ht, y: p2.y + n.y * ht };
    const p4 = { x: p1.x + n.x * ht, y: p1.y + n.y * ht };
    commitQuad([p1, p2, p3, p4], tool === 'rect-oriented' ? 'oriented' : 'parallelogram', true);
  };

  // --- Profile tool (lines + tangent / three point arcs) -----------------
  // Tangent arc leaving P along direction t and passing through E, stored
  // in the Arc convention (increasing-angle sweep from start to end).
  // endDir is the travel direction where it arrives at E.
  const tangentArcFrom = (P: { x: number; y: number }, t: { x: number; y: number }, E: { x: number; y: number }) => {
    const n = { x: -t.y, y: t.x };
    const ex = E.x - P.x, ey = E.y - P.y;
    const projN = ex * n.x + ey * n.y, projD = ex * t.x + ey * t.y;
    if (Math.abs(projN) < 1e-6) return null;
    const rs = (projD * projD + projN * projN) / (2 * projN);
    const cx = P.x + n.x * rs, cy = P.y + n.y * rs;
    const aP = angleOfPts({ x: cx, y: cy }, P), aE = angleOfPts({ x: cx, y: cy }, E);
    const radP = (aP * Math.PI) / 180, radE = (aE * Math.PI) / 180;
    const increasing = -Math.sin(radP) * t.x + Math.cos(radP) * t.y > 0;
    const endDir = increasing ? { x: -Math.sin(radE), y: Math.cos(radE) } : { x: Math.sin(radE), y: -Math.cos(radE) };
    return { cx, cy, r: Math.abs(rs), start: increasing ? aP : aE, end: increasing ? aE : aP, endDir, increasing };
  };

  // Three point arc from P (the chain's end) through T to E.
  const threePtArcFrom = (P: { x: number; y: number }, T: { x: number; y: number }, E: { x: number; y: number }) => {
    const built = build3PtArc(P, E, T);
    if (!built) return null;
    const norm = (d: number) => ((d % 360) + 360) % 360;
    const increasing = Math.abs(norm(built.start - angleOfPts({ x: built.cx, y: built.cy }, P))) < 1e-6
      || Math.abs(norm(built.start - angleOfPts({ x: built.cx, y: built.cy }, P)) - 360) < 1e-6;
    const radE = (angleOfPts({ x: built.cx, y: built.cy }, E) * Math.PI) / 180;
    const endDir = increasing ? { x: -Math.sin(radE), y: Math.cos(radE) } : { x: Math.sin(radE), y: -Math.cos(radE) };
    return { ...built, endDir, increasing };
  };

  const profileClick = (x: number, y: number) => {
    const hit = findNearestPoint(x, y);
    const snapped = gridSnap(x, y);
    const ep = hit ? { id: hit.id, x: hit.x, y: hit.y, isNew: false } : { id: nextId('pt'), x: snapped.x, y: snapped.y, isNew: true };
    if (!profileChain) {
      if (ep.isNew) setPoints((ps) => [...ps, { id: ep.id, x: ep.x, y: ep.y }]);
      setProfileChain({ firstId: ep.id, lastId: ep.id, lastDir: null, segs: 0 });
      setMousePt({ x, y });
      return;
    }
    const last = pointById.get(profileChain.lastId);
    if (!last) { finishProfile(false); return; }
    // The repeated click of a double-click lands on the point just placed.
    if (Math.hypot(ep.x - last.x, ep.y - last.y) < 1e-6) return;
    if (profileSegMode === 'arc-3pt' && !profileThroughRef.current) { profileThroughRef.current = { x, y }; return; }
    const minSegs = profileSegMode === 'line' ? 2 : 1;
    if (ep.id === profileChain.firstId && profileChain.segs < minSegs) return;
    const closing = ep.id === profileChain.firstId;
    const newPts: Pt[] = ep.isNew ? [{ id: ep.id, x: ep.x, y: ep.y }] : [];
    let endDir: { x: number; y: number };
    let segId: string;
    if (profileSegMode === 'line') {
      const l = Math.hypot(ep.x - last.x, ep.y - last.y);
      endDir = { x: (ep.x - last.x) / l, y: (ep.y - last.y) / l };
      segId = nextId('ln');
      setLines((ls) => [...ls, { id: segId, p1: last.id, p2: ep.id }]);
    } else {
      const tangent = profileSegMode === 'tangent-arc';
      const arc = tangent
        ? (profileChain.lastDir ? tangentArcFrom(last, profileChain.lastDir, ep) : null)
        : threePtArcFrom(last, profileThroughRef.current!, ep);
      profileThroughRef.current = null;
      if (!arc) return;
      const centerId = nextId('pt');
      newPts.push({ id: centerId, x: arc.cx, y: arc.cy });
      segId = nextId('arc');
      // The arc's endpoints are the chain's own points, in sweep order.
      const [p1, p2] = arc.increasing ? [last.id, ep.id] : [ep.id, last.id];
      const nextArcs = [...arcs, { id: segId, center: centerId, r: arc.r, start: arc.start, end: arc.end, p1, p2 }];
      setArcs(nextArcs);
      endDir = arc.endDir;
      setProfileSegMode('line');
      // Tangent Arc: a real tangent constraint to the segment it leaves
      // from (the guide's "constraint is applied between the line and the arc").
      const prev = profileChain.lastSegId;
      if (tangent && prev) {
        const prevIsLine = lines.some((l) => l.id === prev);
        const con: Constraint = prevIsLine
          ? { id: nextId('c'), type: 'tangent_line_curve', args: { line: prev, curve: segId }, label: `Tangent: ${prev}, ${segId}` }
          : { id: nextId('c'), type: 'tangent_curves', args: { curve1: prev, curve2: segId }, label: `Tangent: ${prev}, ${segId}` };
        setConstraints((cs) => [...cs, con]);
      }
    }
    if (newPts.length) setPoints((ps) => [...ps, ...newPts]);
    if (closing) { setProfileChain(null); setProfileSegMode('line'); setMousePt(null); return; }
    setProfileChain({ ...profileChain, lastId: ep.id, lastDir: endDir, segs: profileChain.segs + 1, lastSegId: segId });
  };

  // --- Line / Point flyout additions --------------------------------------
  // A picked line/circle/arc as the plain shape the construction math in
  // sketchGeometry2d.ts takes (arcs use their full circle).
  const asTarget = (g: EntityGeom): TangentTarget | null => {
    if (g.kind === 'line') return { kind: 'line', a: g.a, b: g.b };
    if (g.kind === 'circle' || g.kind === 'arc') return { kind: 'circle', cx: g.cx, cy: g.cy, r: g.r };
    if (g.kind === 'curve') return { kind: 'poly', pts: g.pts };
    return null;
  };

  // Bi-Tangent Line between any two curved elements: exact for two
  // circles/arcs, sampled for ellipses, conics and splines.
  const biTangentFor = (g1: EntityGeom, g2: EntityGeom, q1: { x: number; y: number }, q2: { x: number; y: number }) => {
    const round = (g: EntityGeom) => g.kind === 'circle' || g.kind === 'arc';
    if (round(g1) && round(g2)) {
      const a = g1 as Extract<EntityGeom, { kind: 'circle' | 'arc' }>, b = g2 as Extract<EntityGeom, { kind: 'circle' | 'arc' }>;
      return biTangentLine({ x: a.cx, y: a.cy, r: a.r }, { x: b.cx, y: b.cy, r: b.r }, q1, q2);
    }
    const sampled = (g: EntityGeom) => (g.kind === 'curve' ? g.pts : entitySamples(g));
    return biTangentSampled(sampled(g1), sampled(g2), q1, q2);
  };

  const isCurved = (g: EntityGeom | null): g is EntityGeom => !!g && (g.kind === 'circle' || g.kind === 'arc' || g.kind === 'curve');

  // Three Point Circle with a typed R: the circle of that radius through
  // the first two clicks, on whichever side passes nearest the third.
  // Null when no R is typed (or it can't span the two points).
  const circle3ptFixedR = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) => {
    const R = lenOrNull(circle3ptR);
    if (R === null || R <= 0) return null;
    const half = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
    if (half < 1e-9 || R < half) return null;
    const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const n = { x: -(p2.y - p1.y) / (2 * half), y: (p2.x - p1.x) / (2 * half) };
    const h = Math.sqrt(R * R - half * half);
    const cands = [{ x: m.x + n.x * h, y: m.y + n.y * h, r: R }, { x: m.x - n.x * h, y: m.y - n.y * h, r: R }];
    const miss = (c: { x: number; y: number }) => Math.abs(Math.hypot(p3.x - c.x, p3.y - c.y) - R);
    return miss(cands[0]) <= miss(cands[1]) ? cands[0] : cands[1];
  };

  // Tri-Tangent Circle: three lines keep the exact closed-form solution;
  // any circle/arc in the mix goes through the numeric solver.
  const triTangentFor = (ids: string[], clicks: { x: number; y: number }[]) => {
    const gs = ids.map((id) => geomById(id));
    if (gs.some((g) => !g)) return null;
    const [g1, g2, g3] = gs as EntityGeom[];
    if (g1.kind === 'line' && g2.kind === 'line' && g3.kind === 'line') return triTangentCircle([g1.a, g1.b], [g2.a, g2.b], [g3.a, g3.b]);
    const ts = gs.map((g) => asTarget(g as EntityGeom));
    if (ts.some((t) => !t)) return null;
    return triTangentGeneral(ts as [TangentTarget, TangentTarget, TangentTarget], clicks as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }]);
  };

  // A click that lands on an existing point resolves to whatever that
  // point builds (see entityOwningPoint), so line/curve picks still work
  // when the click is right on an endpoint.
  const pickCurveAt = (x: number, y: number): EntityGeom | null => {
    const hit = pickEntityAt(x, y);
    return hit && hit.kind === 'point' ? entityOwningPoint(hit.id) : hit;
  };

  // Adds lines with brand-new endpoints (plus any constraints) in one go,
  // so the follow-up solve sees the new points.
  const addLinesWithPoints = (newPts: Pt[], newLines: Ln[], newConstraints: Constraint[] = []) => {
    const nextPoints = [...points, ...newPts];
    const nextLines = [...lines, ...newLines];
    const nextConstraints = [...constraints, ...newConstraints];
    setPoints(nextPoints); setLines(nextLines); setConstraints(nextConstraints);
    if (newConstraints.length) void solve(nextPoints, nextLines, circles, nextConstraints);
  };

  // An infinite (construction) line through `p` along `dir`; the second
  // anchor only sets the direction.
  const addInfiniteLine = (p: { x: number; y: number }, dir: { x: number; y: number }, axis: 'h' | 'v' | null) => {
    const a: Pt = { id: nextId('pt'), x: p.x, y: p.y };
    const b: Pt = { id: nextId('pt'), x: p.x + dir.x * 20, y: p.y + dir.y * 20 };
    const lineId = nextId('ln');
    const cons: Constraint[] = axis ? [{ id: nextId('c'), type: axis === 'h' ? 'horizontal' : 'vertical', args: { line: lineId }, label: `${axis === 'h' ? 'Horizontal' : 'Vertical'}: ${lineId}` }] : [];
    addLinesWithPoints([a, b], [{ id: lineId, p1: a.id, p2: b.id, style: 'infinite' }], cons);
  };

  // Samples any entity as a polyline for the Select toolbar traps.
  const entitySamples = (g: EntityGeom): { x: number; y: number }[] => {
    if (g.kind === 'point') return [{ x: g.x, y: g.y }];
    if (g.kind === 'line') {
      const raw = lines.find((l) => l.id === g.id);
      const [a, b] = raw?.style === 'infinite' ? infiniteLineEndpoints(g.a, g.b) : [g.a, g.b];
      return sampleSegment(a, b);
    }
    if (g.kind === 'circle') return sampleArc(g.cx, g.cy, g.r, 0, 360);
    if (g.kind === 'arc') {
      const raw = arcs.find((a) => a.id === g.id);
      const start = raw ? raw.start : 0;
      const sweep = raw ? (((raw.end - raw.start) % 360) + 360) % 360 || 360 : 360;
      return sampleArc(g.cx, g.cy, g.r, start, sweep);
    }
    return g.pts;
  };

  const trapHits = (test: (pts: { x: number; y: number }[]) => boolean) =>
    allEntityGeoms().filter((g) => !g.id.startsWith('__') && isShown(g.id) && test(entitySamples(g))).map((g) => g.id);

  const addToSelection = (ids: string[]) => { if (ids.length) setSelected((sel) => Array.from(new Set([...sel, ...ids]))); };

  // --- 2D Chamfer ------------------------------------------------------
  // Where a chamfer between two elements (line / arc / circle) cuts each
  // one: X is their intersection nearest the clicks (lines treated as
  // infinite, so a corner that doesn't quite meet still works); each cut
  // lies on its element, on the side that was clicked. "Two lengths" puts
  // the cuts at those distances from X (a chord distance on a circle/arc);
  // "Length + angle" puts the first cut at the length and aims the chamfer
  // line at the given angle from the first element until it meets the
  // second. Returns null when there's no corner (parallel, or not meeting).
  type XY = { x: number; y: number };
  type ChamferResult = { ok: true; X: XY; cut1: XY; cut2: XY } | { ok: false; reason: string; X?: XY; cut1?: XY };
  const chamferCuts = (g1: EntityGeom, q1: XY, g2: EntityGeom, q2: XY): ChamferResult | null => {
    const t1 = asTarget(g1), t2 = asTarget(g2);
    if (!t1 || !t2) return null;
    const within = (g: EntityGeom, p: XY) => {
      if (g.kind !== 'arc') return true;
      const raw = arcs.find((a) => a.id === g.id);
      return !raw || angleInSweep(angleOfPts({ x: g.cx, y: g.cy }, p), raw.start - 1, raw.end + 1);
    };
    const mid = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 };
    const cands = intersectTargets(t1, t2).filter((p) => within(g1, p) && within(g2, p));
    if (cands.length === 0) return { ok: false, reason: 'These two elements don’t meet (even extended) — nothing to chamfer.' };
    const X = cands.reduce((m, p) => (Math.hypot(p.x - mid.x, p.y - mid.y) < Math.hypot(m.x - mid.x, m.y - mid.y) ? p : m));
    const fmt = (mm: number) => `${toU(mm).toFixed(2)} ${uLabel}`;
    // For a line: the unit direction from X toward the clicked side, and
    // how far the line actually reaches that way (its far end) — a cut
    // must land before that end or the chamfer would run off the element.
    const lineSide = (g: Extract<EntityGeom, { kind: 'line' }>, q: XY) => {
      const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) || 1;
      let u = { x: (g.b.x - g.a.x) / L, y: (g.b.y - g.a.y) / L };
      if ((q.x - X.x) * u.x + (q.y - X.y) * u.y < 0) u = { x: -u.x, y: -u.y };
      const reach = Math.max((g.a.x - X.x) * u.x + (g.a.y - X.y) * u.y, (g.b.x - X.x) * u.x + (g.b.y - X.y) * u.y);
      return { u, reach };
    };
    // The point at distance d from X along element g, on q's side, or null
    // when the element doesn't extend that far.
    const cutOn = (g: EntityGeom, q: XY, d: number): XY | null => {
      if (g.kind === 'line') {
        const { u, reach } = lineSide(g, q);
        if (d >= reach - 1e-6) return null;
        return { x: X.x + u.x * d, y: X.y + u.y * d };
      }
      if (g.kind === 'curve') {
        // Walk along the curve from X toward the click until the straight
        // (chord) distance from X reaches d.
        const pts = g.pts, n = pts.length - 1;
        const closed = isClosedPoly(pts);
        const uX = polyNearestU(pts, X), uq = polyNearestU(pts, q);
        let dir = uq >= uX ? 1 : -1;
        if (closed && Math.abs(uq - uX) > n / 2) dir = -dir;
        let prev = X;
        for (let k = 0; k <= n; k++) {
          let idx = dir > 0 ? Math.floor(uX) + 1 + k : Math.ceil(uX) - 1 - k;
          if (closed) idx = ((idx % n) + n) % n; else if (idx < 0 || idx > n) return null;
          const P = pts[idx];
          if (Math.hypot(P.x - X.x, P.y - X.y) >= d) {
            // Solve |prev + s(P - prev) - X| = d for s in [0, 1].
            const ex = P.x - prev.x, ey = P.y - prev.y, fx0 = prev.x - X.x, fy0 = prev.y - X.y;
            const A = ex * ex + ey * ey, B = 2 * (fx0 * ex + fy0 * ey), C = fx0 * fx0 + fy0 * fy0 - d * d;
            const sq = Math.sqrt(Math.max(0, B * B - 4 * A * C));
            const sParam = A > 0 ? Math.min(1, Math.max(0, (-B + sq) / (2 * A))) : 0;
            return { x: prev.x + ex * sParam, y: prev.y + ey * sParam };
          }
          prev = P;
        }
        return null;
      }
      if (g.kind !== 'circle' && g.kind !== 'arc') return null;
      if (d >= 2 * g.r) return null;
      const delta = 2 * Math.asin(d / (2 * g.r));
      const a0 = Math.atan2(X.y - g.cy, X.x - g.cx);
      const opts = [a0 + delta, a0 - delta].map((t) => ({ x: g.cx + g.r * Math.cos(t), y: g.cy + g.r * Math.sin(t) }))
        .filter((p) => within(g, p));
      if (!opts.length) return null;
      return opts.reduce((m, p) => (Math.hypot(p.x - q.x, p.y - q.y) < Math.hypot(m.x - q.x, m.y - q.y) ? p : m));
    };
    // Is p on element 2, on the clicked side of X and before its end?
    const onElement2 = (p: XY) => {
      if (g2.kind !== 'line') return within(g2, p);
      const { u, reach } = lineSide(g2, q2);
      const t = (p.x - X.x) * u.x + (p.y - X.y) * u.y;
      return t > 1e-6 && t < reach - 1e-6;
    };
    // From cut1, the line at `deg` from element 1 (toward element 2's
    // side), and where it first meets element 2 — anywhere on its line.
    const rayCut = (cut1: XY, deg: number) => {
      const theta = (deg * Math.PI) / 180;
      const back = { x: X.x - cut1.x, y: X.y - cut1.y };
      const bl = Math.hypot(back.x, back.y) || 1;
      const b = { x: back.x / bl, y: back.y / bl };
      const rot = (sgn: number) => ({ x: b.x * Math.cos(sgn * theta) - b.y * Math.sin(sgn * theta), y: b.x * Math.sin(sgn * theta) + b.y * Math.cos(sgn * theta) });
      const side2 = { x: q2.x - cut1.x, y: q2.y - cut1.y };
      const dir = [rot(1), rot(-1)].reduce((m, d) => (d.x * side2.x + d.y * side2.y > m.x * side2.x + m.y * side2.y ? d : m));
      const hits = intersectTargets({ kind: 'line', a: cut1, b: { x: cut1.x + dir.x, y: cut1.y + dir.y } }, t2)
        .filter((p) => (p.x - cut1.x) * dir.x + (p.y - cut1.y) * dir.y > 1e-6);
      return hits.length ? hits.reduce((m, p) => (Math.hypot(p.x - cut1.x, p.y - cut1.y) < Math.hypot(m.x - cut1.x, m.y - cut1.y) ? p : m)) : null;
    };
    const reach1 = g1.kind === 'line' ? lineSide(g1, q1).reach : Infinity;
    const angleDeg = Number(chamferAngle);
    if (chamferMode !== 'lengths' && !(angleDeg > 0 && angleDeg < 180)) {
      return { ok: false, reason: 'Angle must be between 0° and 180° (typically 1°–89°).', X };
    }
    // Largest angle that still lands on element 2 (a line) from this cut.
    const maxAngleFrom = (cut1: XY) => {
      if (g2.kind !== 'line') return null;
      const { u, reach } = lineSide(g2, q2);
      const end = { x: X.x + u.x * reach, y: X.y + u.y * reach };
      const v1 = { x: X.x - cut1.x, y: X.y - cut1.y }, v2 = { x: end.x - cut1.x, y: end.y - cut1.y };
      return (Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1)))) * 180) / Math.PI;
    };

    if (chamferMode === 'hyp') {
      // Angle + hypotenuse (CATIA's sketch default): find how far back along
      // element 1 the chamfer starts so that the chamfer line itself is H.
      const H = Math.max(0.1, lenNum(chamferDistA) || 10);
      const lenAt = (d: number) => { const c1 = cutOn(g1, q1, d); const c2 = c1 && rayCut(c1, angleDeg); return c1 && c2 && onElement2(c2) ? Math.hypot(c2.x - c1.x, c2.y - c1.y) : null; };
      // The chamfer grows with how far back it starts, until it would
      // overshoot one of the elements. Scan for the first start distance
      // that reaches H, then narrow it down.
      const hiLimit = Number.isFinite(reach1) ? reach1 * 0.999 : Math.max(H * 4, 1);
      const N = 400;
      let prevD = 0, found: number | null = null, best = 0;
      for (let k = 1; k <= N; k++) {
        const d = (hiLimit * k) / N, v = lenAt(d);
        if (v === null) continue;
        best = Math.max(best, v);
        if (v >= H) { found = d; break; }
        prevD = d;
      }
      if (found === null) {
        return { ok: false, reason: best > 0 ? `Too long for this corner at ${angleDeg}° — the chamfer can be at most about ${fmt(best)} here.` : 'At this angle the chamfer line never reaches the second element.', X };
      }
      let lo = prevD, hi = found;
      for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; const v = lenAt(m); if (v === null || v < H) lo = m; else hi = m; }
      const c1 = cutOn(g1, q1, hi)!;
      return { ok: true, X, cut1: c1, cut2: rayCut(c1, angleDeg)! };
    }

    const dA = Math.max(0.1, lenNum(chamferDistA) || 10);
    const cut1 = cutOn(g1, q1, dA);
    if (!cut1) {
      return { ok: false, reason: Number.isFinite(reach1) ? `First length ${fmt(dA)} is longer than the first element reaches from the corner (${fmt(reach1)}).` : 'The first length doesn’t fit on the first element.', X };
    }
    if (chamferMode === 'lengths') {
      const dB = Math.max(0.1, lenNum(chamferDistB) || 10);
      const cut2 = cutOn(g2, q2, dB);
      const reach2 = g2.kind === 'line' ? lineSide(g2, q2).reach : null;
      if (!cut2) return { ok: false, reason: reach2 !== null ? `Distance B ${fmt(dB)} is longer than the second element reaches from the corner (${fmt(reach2)}).` : 'Distance B doesn’t fit on the second element.', X, cut1 };
      return { ok: true, X, cut1, cut2 };
    }
    // First length + angle: from cut1 at the angle to element 1, to element 2.
    const cut2 = rayCut(cut1, angleDeg);
    if (!cut2 || !onElement2(cut2)) {
      const maxA = maxAngleFrom(cut1);
      return { ok: false, reason: maxA !== null ? `At ${angleDeg}° the chamfer runs past the end of the second element — with this length use at most ${maxA.toFixed(1)}°.` : `At ${angleDeg}° the chamfer line doesn’t reach the second element.`, X, cut1 };
    }
    return { ok: true, X, cut1, cut2 };
  };

  // --- Free-form curves (ellipse, spline, conic…) as trimmable elements --
  // A position along a curve is a fractional index u into its sampled
  // polyline (curvePoints): u = i + t lies t of the way along segment i.
  const polyAt = (pts: { x: number; y: number }[], u: number) => {
    const i = Math.max(0, Math.min(pts.length - 2, Math.floor(u)));
    const t = u - i;
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
  };

  const isClosedPoly = (pts: { x: number; y: number }[]) => pts.length > 3 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6;

  // Nearest fractional index to p.
  const polyNearestU = (pts: { x: number; y: number }[], p: { x: number; y: number }) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
      if (d < bestD) { bestD = d; best = i + t; }
    }
    return best;
  };

  // The part of a curve from u0 to u1 (wrapping past the end when u1 < u0
  // on a closed curve) as a new curve. An ellipse stays an exact elliptical
  // arc; any other kind becomes an interpolating spline through its own
  // samples over that range (visually the same curve). Returns the new
  // points/curve, and the ids of any real points at its two ends.
  const curvePiece = (cv: SketchCurve, pts: { x: number; y: number }[], u0: number, u1: number) => {
    const n = pts.length - 1;
    if (cv.kind === 'ellipse') {
      const a0 = cv.start ?? 0;
      const a1 = cv.start === undefined || cv.end === undefined ? 360 : cv.end > cv.start ? cv.end : cv.end + 360;
      const ang = (u: number) => (((a0 + ((a1 - a0) * u) / n) % 360) + 360) % 360;
      const piece: SketchCurve = { ...cv, id: nextId('cv'), start: ang(u0), end: ang(u1) };
      return { curve: piece, newPoints: [] as Pt[], startId: null as string | null, endId: null as string | null };
    }
    const seq: { x: number; y: number }[] = [polyAt(pts, u0)];
    if (u1 >= u0) { for (let i = Math.floor(u0) + 1; i < u1; i++) seq.push(pts[i]); }
    else { for (let i = Math.floor(u0) + 1; i <= n; i++) seq.push(pts[i]); for (let i = 1; i < u1; i++) seq.push(pts[i]); }
    seq.push(polyAt(pts, u1));
    // At most ~16 control points, always keeping both ends.
    const step = Math.max(1, Math.ceil((seq.length - 2) / 14));
    const ctrl = seq.filter((_, i) => i === 0 || i === seq.length - 1 || i % step === 0);
    const newPoints: Pt[] = ctrl.map((q) => ({ id: nextId('pt'), x: q.x, y: q.y }));
    const piece: SketchCurve = { id: nextId('cv'), kind: 'spline', controlIds: newPoints.map((p) => p.id) };
    return { curve: piece, newPoints, startId: newPoints[0].id, endId: newPoints[newPoints.length - 1].id };
  };
  return {
    handleCanvasMouseMove, handleCanvasMouseDown, entitySamples, trapHits, addToSelection, handleCanvasMouseUp, handleCanvasDoubleClick, numOrNull, fixedAt, finishLine, commitLiveValue, buildSlot, keyholeShape, build3PtArc, fromHV, distanceOf, commitTypedStart, commitTypedEnd, commitTypedCircle, commitCircleCoord, commitRectangle, commitQuad, commitTypedQuad, tangentArcFrom, threePtArcFrom, profileClick, asTarget, biTangentFor, isCurved, circle3ptFixedR, triTangentFor, pickCurveAt, addLinesWithPoints, addInfiniteLine, isClosedPoly, polyNearestU, chamferCuts, polyAt, curvePiece,
  };
}

export type DrawingTools = ReturnType<typeof useDrawingTools>;
