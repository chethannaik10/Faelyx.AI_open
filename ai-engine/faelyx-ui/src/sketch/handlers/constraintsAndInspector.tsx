// Sketch & 2D: constraints, the inspector's commit actions, plane switching and fully-constrained status.
// A hook built on useSketchCore's state (assembled in handlers/index.ts).
import type { Pt, Constraint, Plane } from '../types';
import { buildExample } from '../geometry';


import type { SketchCore } from '../useSketchCore';
import type { ViewAndAnnotations } from './viewAndAnnotations';
import type { SnapAndSelect } from './snapAndSelect';
import type { DrawingTools } from './drawingTools';
import type { TrimAndChamfer } from './trimAndChamfer';
import type { CanvasClick } from './canvasClick';

export function useConstraintsAndInspector(core: SketchCore, prev: ViewAndAnnotations & SnapAndSelect & DrawingTools & TrimAndChamfer & CanvasClick) {
  const {
    DEFAULT_VIEW_BOX, REF_HDIR, REF_ORIGIN, REF_VDIR, SKETCH_ORIGIN, angleBetweenLines, applyChamferValues, applyPayload, chamferInfo, scaleChamfer, arcs, cancelPending, circles, constraints, curveDefiningIds, curves, dimensions, dof, editBuffer, fixedIds, hiddenIds, lineAnchor, lines, pendingConstraint, pinPoint, plane, pointById, points, positioning, replaceSketch, samePair, selected, setArcs, setCircles, setConstraints, setCurves, setDimensions, setDof, setError, setLines, setMeasureResult, setPendingConstraint, setPlane, setPlanePickerOpen, setPoints, setResetConfirmOpen, setRotation, setSelected, setSelectedDimId, setStatus, setViewBox, setViewFlipped, sketchesRef, solve, status, toU, unitMm, unpinPoint, upsertInList,
  } = core;
  const {
    editArc, lenNum, lineLength, selectedArc, selectedCircle, selectedCurve, selectedLine, selectedPoint, uLabel, upsertConstraint,
  } = prev;
  const applyConstraint = (initialType: string) => {
    let type = initialType;
    // The AbsoluteAxis references count as a point (Origin) and lines
    // (HDirection/VDirection); they're listed last so the sketch's own
    // element is always the one that moves.
    const selPoints = [...selected.filter((id) => points.some((p) => p.id === id)), ...selected.filter((id) => id === REF_ORIGIN)];
    const selLines = [...selected.filter((id) => lines.some((l) => l.id === id)), ...selected.filter((id) => id === REF_HDIR || id === REF_VDIR)];
    const selCircles = selected.filter((id) => circles.some((c) => c.id === id));
    const selArcs = selected.filter((id) => arcs.some((a) => a.id === id));

    // Distance, Radius and Angle need a numeric value from the user before
    // the constraint can be built. These open the bottom-bar editor (see
    // pendingConstraint above) instead of building the constraint inline.
    if (type === 'distance') {
      if (selPoints.length !== 2) { setError('Distance needs exactly 2 selected points.'); return; }
      const ordered = selPoints[1] === REF_ORIGIN ? [selPoints[1], selPoints[0]] : selPoints;
      const at = (id: string) => (id === REF_ORIGIN ? SKETCH_ORIGIN : pointById.get(id));
      const a = at(ordered[0]), b = at(ordered[1]);
      const current = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 50;
      setError(null);
      setPendingConstraint({ type: 'distance', ids: [ordered[0], ordered[1]], value: toU(current).toFixed(2), anchor: ordered[0] });
      return;
    }
    if (type === 'radius') {
      if (selCircles.length !== 1) { setError('Radius needs exactly 1 selected circle.'); return; }
      const circle = circles.find((c) => c.id === selCircles[0]);
      setError(null);
      setPendingConstraint({ type: 'radius', ids: [selCircles[0]], value: toU(circle?.r ?? 10).toFixed(2) });
      return;
    }
    if (type === 'angle') {
      if (selLines.length !== 2) { setError('Angle needs exactly 2 selected lines.'); return; }
      setError(null);
      setPendingConstraint({ type: 'angle', ids: [selLines[0], selLines[1]], value: angleBetweenLines(selLines[0], selLines[1]).toFixed(2), anchor: selLines[0] });
      return;
    }

    let args: Record<string, unknown> = {};
    let label = type;
    let predicate: (c: Constraint) => boolean = () => false;

    try {
      switch (type) {
        case 'fixed': {
          if (selPoints.length !== 1 || selPoints[0] === REF_ORIGIN) throw new Error('Fixed needs exactly 1 selected sketch point.');
          const p = points.find((pt) => pt.id === selPoints[0]) as Pt;
          args = { point: p.id, x: p.x, y: p.y }; label = `Fixed: ${p.id}`;
          predicate = (c) => c.type === 'fixed' && c.args.point === p.id;
          break;
        }
        case 'coincident': {
          if (selPoints.length !== 2) throw new Error('Coincident needs exactly 2 selected points.');
          const [p1, p2] = selPoints;
          args = { p1, p2 }; label = `Coincident: ${selPoints.join(', ')}`;
          predicate = (c) => c.type === 'coincident' && samePair(c.args.p1, c.args.p2, p1, p2);
          break;
        }
        case 'horizontal': {
          if (selLines.length !== 1) throw new Error('Horizontal needs exactly 1 selected line.');
          const [line] = selLines;
          args = { line }; label = `Horizontal: ${line}`;
          predicate = (c) => c.type === 'horizontal' && c.args.line === line;
          break;
        }
        case 'vertical': {
          if (selLines.length !== 1) throw new Error('Vertical needs exactly 1 selected line.');
          const [line] = selLines;
          args = { line }; label = `Vertical: ${line}`;
          predicate = (c) => c.type === 'vertical' && c.args.line === line;
          break;
        }
        case 'parallel': {
          if (selLines.length !== 2) throw new Error('Parallel needs exactly 2 selected lines.');
          const [line1, line2] = selLines;
          args = { line1, line2 }; label = `Parallel: ${selLines.join(', ')}`;
          predicate = (c) => c.type === 'parallel' && samePair(c.args.line1, c.args.line2, line1, line2);
          break;
        }
        case 'perpendicular': {
          if (selLines.length !== 2) throw new Error('Perpendicular needs exactly 2 selected lines.');
          const [line1, line2] = selLines;
          args = { line1, line2 }; label = `Perpendicular: ${selLines.join(', ')}`;
          predicate = (c) => c.type === 'perpendicular' && samePair(c.args.line1, c.args.line2, line1, line2);
          break;
        }
        case 'equal_length': {
          if (selLines.length === 2 && selCircles.length === 0) {
            const [line1, line2] = selLines;
            args = { line1, line2 }; label = `Equal length: ${selLines.join(', ')}`;
            predicate = (c) => c.type === 'equal_length' && samePair(c.args.line1, c.args.line2, line1, line2);
          } else if (selCircles.length === 2 && selLines.length === 0) {
            type = 'equal_radius';
            const [circle1, circle2] = selCircles;
            args = { circle1, circle2 }; label = `Equal radius: ${selCircles.join(', ')}`;
            predicate = (c) => c.type === 'equal_radius' && samePair(c.args.circle1, c.args.circle2, circle1, circle2);
          } else {
            throw new Error('Equal needs 2 lines, or 2 circles.');
          }
          break;
        }
        case 'tangent': {
          if (selArcs.length > 0 && selArcs.length + selCircles.length === 2 && selLines.length === 0) {
            type = 'tangent_curves';
            const [curve1, curve2] = [...selCircles, ...selArcs];
            args = { curve1, curve2 }; label = `Tangent: ${curve1}, ${curve2}`;
            predicate = (c) => c.type === 'tangent_curves' && samePair(c.args.curve1, c.args.curve2, curve1, curve2);
          } else if (selArcs.length === 1 && selCircles.length === 0 && selLines.length === 1) {
            type = 'tangent_line_curve';
            const [line] = selLines; const [curve] = selArcs;
            args = { line, curve }; label = `Tangent: ${line}, ${curve}`;
            predicate = (c) => c.type === 'tangent_line_curve' && c.args.line === line && c.args.curve === curve;
          } else if (selCircles.length === 2 && selLines.length === 0) {
            type = 'tangent_circles';
            const [circle1, circle2] = selCircles;
            args = { circle1, circle2 }; label = `Tangent: ${selCircles.join(', ')}`;
            predicate = (c) => c.type === 'tangent_circles' && samePair(c.args.circle1, c.args.circle2, circle1, circle2);
          } else if (selCircles.length === 1 && selLines.length === 1) {
            type = 'tangent_line_circle';
            const [line] = selLines; const [circle] = selCircles;
            args = { line, circle }; label = `Tangent: ${line}, ${circle}`;
            predicate = (c) => c.type === 'tangent_line_circle' && c.args.line === line && c.args.circle === circle;
          } else {
            throw new Error('Tangent needs 2 circles/arcs, or 1 line + 1 circle/arc.');
          }
          break;
        }
        case 'symmetric': {
          if (selPoints.length !== 2 || selLines.length !== 1) throw new Error('Symmetric needs 2 points + 1 line (the symmetry axis).');
          const [p1, p2] = selPoints; const [line] = selLines;
          args = { p1, p2, line };
          label = `Symmetric: ${selPoints.join(', ')} about ${line}`;
          predicate = (c) => c.type === 'symmetric' && c.args.line === line && samePair(c.args.p1, c.args.p2, p1, p2);
          break;
        }
        default:
          throw new Error(`Unknown constraint: ${type}`);
      }
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    setSelected([]);
    setError(null);
    upsertConstraint(predicate, type, args, label);
  };

  const removeConstraint = (id: string) => {
    const next = constraints.filter((c) => c.id !== id);
    setConstraints(next);
    void solve(points, lines, circles, next);
  };

  // Commits the bottom-bar Distance/Radius/Angle editor opened by
  // applyConstraint() above. Distance and Angle also pin an anchor first
  // (see pendingConstraint.anchor and the Length/Angle comment below) so
  // the point/line the user picked to "stay fixed" actually does.
  const commitPendingConstraint = () => {
    if (!pendingConstraint) return;
    const value = pendingConstraint.type === 'angle' ? Number(pendingConstraint.value) : lenNum(pendingConstraint.value);
    const invalid = !Number.isFinite(value) || (pendingConstraint.type !== 'angle' && value <= 0);
    if (invalid) { setPendingConstraint(null); return; }
    const { type: pType, ids, anchor } = pendingConstraint;
    let next = constraints;
    if (pType === 'distance') {
      const [p1, p2] = ids;
      const anchorId = anchor ?? p1;
      const otherId = anchorId === p1 ? p2 : p1;
      next = unpinPoint(next, otherId);
      const anchorPt = pointById.get(anchorId);
      if (anchorPt) next = pinPoint(next, anchorPt.id, anchorPt);
      next = upsertInList(next, (c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, p1, p2), 'distance', { p1, p2, value }, `Distance: ${p1}–${p2} = ${value}mm`);
    } else if (pType === 'radius') {
      const [circle] = ids;
      next = upsertInList(next, (c) => c.type === 'radius' && c.args.circle === circle, 'radius', { circle, value }, `Radius: ${circle} = ${value}mm`);
    } else {
      const [line1, line2] = ids;
      // The anchor here is a whole *line* — pin both its endpoints so it's
      // fully rigid, leaving only the other line free to rotate to the
      // new angle (otherwise a single angle equation under-constrains
      // both lines' endpoints and either one can drift). Release the
      // *previous* anchor line's endpoints first (unless shared with the
      // new anchor line) so flipping "Keep fixed" doesn't leave both lines
      // pinned and over-constrain the sketch.
      const anchorLineId = anchor ?? line1;
      const otherLineId = anchorLineId === line1 ? line2 : line1;
      const anchorLine = lines.find((l) => l.id === anchorLineId);
      const otherLine = lines.find((l) => l.id === otherLineId);
      const anchorPointIds = new Set(anchorLine ? [anchorLine.p1, anchorLine.p2] : []);
      if (otherLine) {
        for (const pid of [otherLine.p1, otherLine.p2]) {
          if (!anchorPointIds.has(pid)) next = unpinPoint(next, pid);
        }
      }
      if (anchorLine) {
        const pa = pointById.get(anchorLine.p1);
        const pb = pointById.get(anchorLine.p2);
        if (pa) next = pinPoint(next, pa.id, pa);
        if (pb) next = pinPoint(next, pb.id, pb);
      }
      next = upsertInList(next, (c) => c.type === 'angle' && samePair(c.args.line1, c.args.line2, line1, line2), 'angle', { line1, line2, value }, `Angle: ${line1}, ${line2} = ${value}°`);
    }
    setSelected([]);
    setConstraints(next);
    void solve(points, lines, circles, next);
    setPendingConstraint(null);
  };

  // The quick-edit fields in the Selection panel below — typing an exact
  // position/length/radius/angle is shorthand for adding (or updating) the
  // same constraints the toolbox's Fixed/Distance/Radius/Angle buttons
  // create.
  const commitPointPosition = () => {
    if (!selectedPoint) return;
    const x = editBuffer.x !== undefined ? SKETCH_ORIGIN.x + lenNum(editBuffer.x) : selectedPoint.x;
    const y = editBuffer.y !== undefined ? SKETCH_ORIGIN.y - lenNum(editBuffer.y) : selectedPoint.y;
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    upsertConstraint((c) => c.type === 'fixed' && c.args.point === selectedPoint.id, 'fixed', { point: selectedPoint.id, x, y }, `Fixed: ${selectedPoint.id}`);
  };

  // A line has two endpoints, so setting its length alone leaves the
  // direction technically free — but pinning the anchor and dimensioning
  // the distance from it is a circle-radius constraint on the *other*
  // point, and the closest point on a circle to where that point already
  // sits is always straight out along the same ray from the anchor. So the
  // free end slides along the existing direction rather than swinging
  // anywhere, with no separate angle-lock needed.
  const commitLineLength = () => {
    if (!selectedLine) return;
    const value = lenNum(editBuffer.length ?? '');
    if (!value || value <= 0) return;
    // A chamfer's length rescales only that chamfer (see scaleChamfer).
    if (chamferInfo(selectedLine.id)) { scaleChamfer(selectedLine.id, value); return; }
    // Center: neither endpoint is "the" anchor — both move outward/inward
    // equally about the line's current midpoint, along its current
    // direction, so a line built symmetric (Symmetrical Extension, or Line
    // Normal to a Curve's own Symmetrical Extension toggle) stays symmetric
    // through the edit instead of stretching off whichever end Start/End
    // would have pinned. Both endpoints are unpinned first (in case an
    // earlier Start/End edit left one Fixed) since no single point is fixed
    // here — only their midpoint is preserved, by direct construction.
    if (lineAnchor === 'center') {
      const a = pointById.get(selectedLine.p1);
      const b = pointById.get(selectedLine.p2);
      if (!a || !b) return;
      const midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
      const curLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / curLen, uy = (b.y - a.y) / curLen;
      const half = value / 2;
      const na = { x: midx - ux * half, y: midy - uy * half };
      const nb = { x: midx + ux * half, y: midy + uy * half };
      const nextPoints = points.map((p) => (p.id === a.id ? { ...p, ...na } : p.id === b.id ? { ...p, ...nb } : p));
      setPoints(nextPoints);
      let next = unpinPoint(constraints, a.id);
      next = unpinPoint(next, b.id);
      next = upsertInList(next, (c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, selectedLine.p1, selectedLine.p2), 'distance', { p1: selectedLine.p1, p2: selectedLine.p2, value }, `Distance: ${selectedLine.p1}–${selectedLine.p2} = ${value}mm`);
      setConstraints(next);
      void solve(nextPoints, lines, circles, next);
      return;
    }
    const anchorId = lineAnchor === 'p1' ? selectedLine.p1 : selectedLine.p2;
    const otherId = anchorId === selectedLine.p1 ? selectedLine.p2 : selectedLine.p1;
    const anchorPt = pointById.get(anchorId);
    // Release the other endpoint first — otherwise flipping the Start/End
    // toggle just stacks a second Fixed constraint and over-constrains the
    // line the next time it's edited.
    let next = unpinPoint(constraints, otherId);
    if (anchorPt) next = pinPoint(next, anchorId, anchorPt);
    next = upsertInList(next, (c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, selectedLine.p1, selectedLine.p2), 'distance', { p1: selectedLine.p1, p2: selectedLine.p2, value }, `Distance: ${selectedLine.p1}–${selectedLine.p2} = ${value}mm`);
    setConstraints(next);
    void solve(points, lines, circles, next);
  };

  // Angle is the opposite case: the nearest point *on a line* (rather than
  // a circle) to where the free end currently sits is a perpendicular
  // projection, which generally shortens or lengthens the segment as a
  // side effect of rotating it. So an angle edit also re-pins the line's
  // *current* length alongside the new angle, making the free endpoint's
  // position fully determined — it swings like a clock hand around the
  // anchor at a constant radius, landing exactly on the new heading.
  const commitLineAngle = () => {
    if (!selectedLine) return;
    const value = Number(editBuffer.angle);
    if (!Number.isFinite(value)) return;
    // A chamfer's heading isn't free — it's set by its angle to its first
    // parent. Turn the typed heading into that angle, change only it.
    const ch = chamferInfo(selectedLine.id);
    if (ch) {
      const c1 = pointById.get(ch.cut1), c2 = pointById.get(ch.cut2), X = pointById.get(ch.corner);
      if (!c1 || !c2 || !X) return;
      // The typed heading (sketch terms, y up) as a ray from cut 1, turned
      // to point the same way the chamfer runs now (towards cut 2) — a
      // line's heading is only defined modulo 180°.
      const t = (value * Math.PI) / 180;
      let dir = { x: Math.cos(t), y: -Math.sin(t) };
      if (dir.x * (c2.x - c1.x) + dir.y * (c2.y - c1.y) < 0) dir = { x: -dir.x, y: -dir.y };
      const ux = X.x - c1.x, uy = X.y - c1.y;
      const cosA = (ux * dir.x + uy * dir.y) / (Math.hypot(ux, uy) || 1);
      const alpha = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
      const err = applyChamferValues(ch.id, { angle: alpha });
      if (err) setError(err);
      return;
    }
    // Center: rotate about the current midpoint instead of swinging around
    // either end — same reasoning as commitLineLength's 'center' branch.
    if (lineAnchor === 'center') {
      const a = pointById.get(selectedLine.p1);
      const b = pointById.get(selectedLine.p2);
      if (!a || !b) return;
      const midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
      const curLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const half = curLen / 2;
      const rad = (value * Math.PI) / 180;
      const ux = Math.cos(rad), uy = Math.sin(rad);
      const na = { x: midx - ux * half, y: midy - uy * half };
      const nb = { x: midx + ux * half, y: midy + uy * half };
      const nextPoints = points.map((p) => (p.id === a.id ? { ...p, ...na } : p.id === b.id ? { ...p, ...nb } : p));
      setPoints(nextPoints);
      let next = unpinPoint(constraints, a.id);
      next = unpinPoint(next, b.id);
      next = upsertInList(next, (c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, selectedLine.p1, selectedLine.p2), 'distance', { p1: selectedLine.p1, p2: selectedLine.p2, value: curLen }, `Distance: ${selectedLine.p1}–${selectedLine.p2} = ${curLen.toFixed(2)}mm`);
      next = upsertInList(next, (c) => c.type === 'line_angle' && c.args.line === selectedLine.id, 'line_angle', { line: selectedLine.id, value }, `Angle: ${selectedLine.id} = ${value}°`);
      setConstraints(next);
      void solve(nextPoints, lines, circles, next);
      return;
    }
    const anchorId = lineAnchor === 'p1' ? selectedLine.p1 : selectedLine.p2;
    const otherId = anchorId === selectedLine.p1 ? selectedLine.p2 : selectedLine.p1;
    const anchorPt = pointById.get(anchorId);
    const currentLength = lineLength(selectedLine);
    // Release the other endpoint first — see commitLineLength above.
    let next = unpinPoint(constraints, otherId);
    if (anchorPt) next = pinPoint(next, anchorId, anchorPt);
    next = upsertInList(next, (c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, selectedLine.p1, selectedLine.p2), 'distance', { p1: selectedLine.p1, p2: selectedLine.p2, value: currentLength }, `Distance: ${selectedLine.p1}–${selectedLine.p2} = ${currentLength.toFixed(2)}mm`);
    next = upsertInList(next, (c) => c.type === 'line_angle' && c.args.line === selectedLine.id, 'line_angle', { line: selectedLine.id, value }, `Angle: ${selectedLine.id} = ${value}°`);
    setConstraints(next);
    void solve(points, lines, circles, next);
  };

  const commitCircleRadius = () => {
    if (!selectedCircle) return;
    const value = lenNum(editBuffer.radius ?? '');
    if (!value || value <= 0) return;
    upsertConstraint((c) => c.type === 'radius' && c.args.circle === selectedCircle.id, 'radius', { circle: selectedCircle.id, value }, `Radius: ${selectedCircle.id} = ${value}mm`);
  };

  const commitArcRadius = () => {
    if (!selectedArc) return;
    const value = lenNum(editBuffer.radius ?? '');
    if (!value || value <= 0) return;
    editArc(selectedArc.id, { r: value });
  };

  const commitArcStart = () => {
    if (!selectedArc) return;
    const value = Number(editBuffer.arcStart);
    if (!Number.isFinite(value)) return;
    editArc(selectedArc.id, { start: ((value % 360) + 360) % 360 });
  };

  const commitArcEnd = () => {
    if (!selectedArc) return;
    const value = Number(editBuffer.arcEnd);
    if (!Number.isFinite(value)) return;
    editArc(selectedArc.id, { end: ((value % 360) + 360) % 360 });
  };

  // Ellipse/Parabola's own shape parameters — same direct, local-state
  // pattern as commitArcRadius/Start/End above (not a backend constraint —
  // see the SketchCurve type comment for why), so editing rx/ry/rotation
  // or a parabola's span updates the curve immediately.
  const commitCurveRx = () => {
    if (!selectedCurve || selectedCurve.kind !== 'ellipse') return;
    const value = lenNum(editBuffer.curveRx ?? '');
    if (!value || value <= 0) return;
    setCurves((cs) => cs.map((cv) => (cv.id === selectedCurve.id && cv.kind === 'ellipse' ? { ...cv, rx: value } : cv)));
  };

  const commitCurveRy = () => {
    if (!selectedCurve || selectedCurve.kind !== 'ellipse') return;
    const value = lenNum(editBuffer.curveRy ?? '');
    if (!value || value <= 0) return;
    setCurves((cs) => cs.map((cv) => (cv.id === selectedCurve.id && cv.kind === 'ellipse' ? { ...cv, ry: value } : cv)));
  };

  const commitCurveRot = () => {
    if (!selectedCurve || selectedCurve.kind !== 'ellipse') return;
    const value = Number(editBuffer.curveRot);
    if (!Number.isFinite(value)) return;
    setCurves((cs) => cs.map((cv) => (cv.id === selectedCurve.id && cv.kind === 'ellipse' ? { ...cv, rot: (value * Math.PI) / 180 } : cv)));
  };

  const commitCurveSpan = () => {
    if (!selectedCurve || selectedCurve.kind !== 'parabola') return;
    const value = lenNum(editBuffer.curveSpan ?? '');
    if (!value || value <= 0) return;
    setCurves((cs) => cs.map((cv) => (cv.id === selectedCurve.id && cv.kind === 'parabola' ? { ...cv, span: value } : cv)));
  };

  // General Conic (Rho) — same direct-local-state "phase 1" edit pattern as
  // Arc/Curve above, not solver-driven (see the SketchCurve type comment).
  const commitCurveRho = () => {
    if (!selectedCurve || selectedCurve.kind !== 'conic-rp') return;
    const value = Math.max(0.02, Math.min(0.98, Number(editBuffer.curveRho)));
    if (!Number.isFinite(value)) return;
    setCurves((cs) => cs.map((cv) => (cv.id === selectedCurve.id && cv.kind === 'conic-rp' ? { ...cv, rho: value } : cv)));
  };

  // The viewport topline's "Reset" button — deliberately NOT clearSketch:
  // it only wipes the plane you're currently looking at (`plane` — the live
  // points/lines/circles/arcs/curves/constraints below ARE that plane's
  // data; the other two planes only ever live in sketchesRef.current, which
  // this never touches), and it never switches planes or reopens the plane
  // picker. Any dimension measuring something on this plane is gone for
  // good along with it; a dimension measuring the other two planes is
  // completely unaffected since its entityId won't be in `deletedIds`.
  const confirmReset = () => {
    const deletedIds = new Set([...lines, ...circles, ...arcs, ...curves].map((e) => e.id));
    setPoints([]); setLines([]); setCircles([]); setArcs([]); setCurves([]); setConstraints([]); setSelected([]);
    setDof(null); setStatus('Empty sketch'); setError(null); cancelPending();
    setViewBox(DEFAULT_VIEW_BOX); setRotation(0); setViewFlipped(false);
    setDimensions((dims) => dims.filter((d) => (d.kind === 'pair' ? !(deletedIds.has(d.entityIdA!) || deletedIds.has(d.entityIdB!)) : !deletedIds.has(d.entityId!))));
    setSelectedDimId(null); setMeasureResult(null);
    setResetConfirmOpen(false);
  };

  // The plane-picker screen's own click handler: switching planes only
  // matters when a different one was chosen (switchPlane below is a no-op
  // "if next === plane" anyway, but skipping it here also skips clearing
  // sketchesRef's cache for no reason), then the picker gets out of the way.
  const choosePlane = (next: Plane) => {
    if (next !== plane) switchPlane(next);
    setPlanePickerOpen(false);
  };

  const loadExample = () => applyPayload(buildExample());

  // Stashes the current plane's geometry (so it's there when the user
  // switches back) and loads whatever was last saved for the target plane
  // — or a blank sketch, the first time that plane is visited.
  const switchPlane = (next: Plane) => {
    if (next === plane) return;
    sketchesRef.current[plane] = { points, lines, circles, arcs, curves, constraints, hidden: [...hiddenIds], positioning };
    setPlane(next);
    replaceSketch(sketchesRef.current[next] ?? { points: [], lines: [], circles: [], arcs: [], curves: [], constraints: [] }, dimensions);
  };

  // Over-constrained now comes from the solver's status (conflicting
  // equations), since its DOF is rank-based and never negative.
  const dofClass = dof === null ? '' : status === 'Over-constrained' ? 'over' : dof === 0 ? '' : 'under';

  // Fully constrained elements (green, as in CATIA): points/circles the
  // solver pinned, and lines/arcs whose defining points are all pinned.
  // Constraint names are stored with their value in mm; shown in the
  // current unit.
  const showLabel = (label: string) => (unitMm === 1 ? label
    : label.replace(/(-?\d+(?:\.\d+)?)mm\b/g, (_m, v: string) => `${toU(Number(v)).toFixed(3).replace(/\.?0+$/, '')}${uLabel}`));

  // Lookups built once per render (not a .find per drawn element).
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const arcById = new Map(arcs.map((a) => [a.id, a]));

  const curveById = new Map(curves.map((cv) => [cv.id, cv]));

  const isFixed = (id: string) => {
    if (fixedIds.has(id)) return true;
    const l = lineById.get(id);
    if (l) return fixedIds.has(l.p1) && fixedIds.has(l.p2);
    const a = arcById.get(id);
    if (a) return !!a.p1 && !!a.p2 && fixedIds.has(a.center) && fixedIds.has(a.p1) && fixedIds.has(a.p2);
    const cv = curveById.get(id);
    // An ellipse also has solver-owned radii (reported by id, above);
    // every other curve is pinned when all its defining points are.
    if (cv && cv.kind !== 'ellipse') return curveDefiningIds(cv).every((pid) => fixedIds.has(pid));
    return false;
  };

  // Points that belong to some line/circle/arc/curve are that element's
  // construction points (drawn as the small dot); a standalone point is a
  // standard Point, drawn as CATIA's "+".
  const usedPointIds = new Set<string>([
    ...lines.flatMap((l) => [l.p1, l.p2]),
    ...circles.map((c) => c.center),
    ...arcs.flatMap((a) => [a.center, a.p1 ?? '', a.p2 ?? '']),
    ...curves.flatMap((cv) => curveDefiningIds(cv)),
  ]);
  return {
    applyConstraint, removeConstraint, commitPendingConstraint, commitPointPosition, commitLineLength, commitLineAngle, commitCircleRadius, commitArcRadius, commitArcStart, commitArcEnd, commitCurveRx, commitCurveRy, commitCurveRot, commitCurveSpan, commitCurveRho, confirmReset, switchPlane, choosePlane, loadExample, dofClass, showLabel, lineById, arcById, curveById, isFixed, usedPointIds,
  };
}

export type ConstraintsAndInspector = ReturnType<typeof useConstraintsAndInspector>;
