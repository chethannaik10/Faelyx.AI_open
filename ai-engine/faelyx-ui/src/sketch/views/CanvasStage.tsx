// The sketch canvas: topline, floating View toolbar, dialogs, orientation compass and the SVG with every entity, preview and dimension.
import {
  Trash2, Maximize2, AlertTriangle,
  Infinity as ZoomIn, ZoomOut, Scan, MoveVertical, FlipHorizontal2, EyeOff, Repeat2, Fullscreen, SquareDashedBottom,
} from 'lucide-react';
import {
  bisectingLine, } from '../../sketchGeometry2d';
import { angleOfPts, describeArcPath, normalizeRect, perpDistanceToLine, infiniteLineIntersect, infiniteLineEndpoints, regularPolygonPoints, computeFillet, circumcenter3 } from '../geometry';
import { DimensionLabel } from './DimensionLabel';
import { sampleEllipse, sampleParabola, sampleHyperbola, sampleConicFrom5Points, sampleConicRho, polylineToPathD } from '../curves';

// `hidden`: App.tsx keeps this component mounted at all times now (instead
// of unmounting it whenever you switch to another workspace tab), so the
// sketch geometry — and the `ref` that 3D Design's "Apply changes" reads
// via getExtrudeProfile() — survives the tab switch. Previously the ref
// went null the moment you left Sketch & 2D, so Extrude/Pocket could never
// actually see what you'd drawn; this prop just hides the canvas visually
// while it keeps running underneath.
// `snapEnabled`/`showGrid`: driven by the Snap/Grid toggles in App.tsx's
// bottom statusbar. Both default to on so the canvas behaves the same as
// before if a caller doesn't pass them at all.
// The six `appearance*` props below are driven by the new "Style" popover
// beside those same Grid/Snap toggles (see App.tsx) — each is `null` until
// the user actually touches that control, so a sketch that's never opened
// the popover renders with exactly the original hardcoded colors/widths
// (the CSS var()s this feeds all fall back to those same originals — see
// the --sketch-* custom properties below and their uses in index.css).
import type { EntityGeom } from '../useSketchCore';
import type { SketchUI } from '../handlers';

export function CanvasStage({ core }: { core: SketchUI }) {
  const {
    ORIGIN_ARM, originGuide, originTol, unitsPerPx, refImage, reflected, REF_HDIR, REF_ORIGIN, REF_VDIR, SKETCH_ORIGIN, appearanceStyle, arcDraftRef, arcs, arrowhead, asTarget, biTangentFor, build3PtArc, chamferCuts, circCoordR, circCoordX, circCoordY, circle3ptFixedR, circleDefOpen, circles, commitCircleCoord, computeNormalFoot, computeNormalLine, computeSymmetricLine, confirmReset, conicRho, coordMode, coordR, coordTheta, coordX, coordY, cursorPosRef, curveDimEditValue, curveDimEditing, curveEntityLength, curveOffsetMode, curveOffsetValue, curvePoints, curveRef, curveTargetId, curves, dimensions, divideCount, divideFixedDistance, divideSpacingMode, divideTargetId, dof, dofClass, dragBox, dragModeRef, filletRadius, findNearestPoint, fitAllIn, fitView, geomById, grid, gridStepX, gridStepY, handleCanvasClick, handleCanvasDoubleClick, handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp, hoverEntity, hoverSnap, infiniteMode, isCurved, isFixed, isPanning, isShown, keyholeShape, lenNum, lineNormalDimEditValue, lineNormalDimEditing, lineNormalDistance, lineNormalPointFirst, lineNormalReverse, lineNormalStart, lineNormalSymmetric, lineNormalTargetId, lineSymAnchor, lineSymDimEditValue, lineSymDimEditing, lineSymDistance, lineSymToggle, lines, liveValue, mousePt, normalView, onExitWorkbench, onFaceSupport, paintStroke, pending, pickCurveAt, pickEntityAt, plane, pointAtCurveParam, pointById, pointRadius, points, polygonCircumscribed, polygonSides, positioning, positioningOpen, profileChain, profileSegMode, profileThroughRef, renderDimension, renderPairPreview, renderSinglePreview, renderSnapGlyph, resetConfirmOpen, resetToolState, resolveDrawPoint, resolveLineEndpoint, rotation, selected, selectionPreview, setCircCoordR, setCircCoordX, setCircCoordY, setCircleDefOpen, setCurveDimEditValue, setCurveDimEditing, setCurveOffsetValue, setLineNormalDimEditValue, setLineNormalDimEditing, setLineNormalDistance, setLineSymDimEditValue, setLineSymDimEditing, setLineSymDistance, setPlanePickerOpen, setPositioning, setPositioningOpen, setResetConfirmOpen, setSelected, setSwapSpace, setTool, setViewGesture, showCursorCoords, showGrid, solving, svgRef, swapSpace, switchPlane, tangentArcFrom, threePtArcFrom, toU, toggleConstructionSelection, toggleHideSelection, tool, trapPoly, triTangentFor, uLabel, unitMm, usedPointIds, viewBox, viewFlipped, viewGesture, wizardIdsRef, wizardPolyPts, wizardPtsRef, zoomAreaBox, zoomStep,
  } = core;
  const { modPreview, modProjectedIds, modLostIds } = core;
  return (
    <>
        <div className="viewport-topline">
          <span>START WORKSPACE <b>/</b> SKETCH &amp; 2D <b>/</b> SKETCH_001
            <span className="plane-switcher">
              {(['Front', 'Top', 'Right'] as const).map((p) => (
                <button key={p} className={plane === p ? 'plane-active' : ''} onClick={() => switchPlane(p)}>{p}</button>
              ))}
              {onFaceSupport && <button className="plane-active" title="This sketch sits on the face picked in 3D Design — Pad/Pocket/Revolve build there" disabled>On face</button>}
              <button className="plane-switcher-exit" onClick={() => setPlanePickerOpen(true)} aria-label="Exit plane">Exit Plane</button>
            </span>
          </span>
          <span className="viewport-live">
            <span className={`dof-badge ${dofClass}`}>
              {solving ? 'Solving…' : dof === null ? 'Empty' : `DOF: ${dof} — ${status}`}
            </span>
            {/* Recenter View: pan/zoom/rotation only, nothing on the sketch is
                touched — the "just bring back my starting point" option. */}
            <button className="viewport-text-action" onClick={fitView} aria-label="Recenter view">
              <Maximize2 size={12} /> Recenter View
            </button>

            {/* Reset: the destructive one — erases only the currently active
                plane's geometry and dimensions (Top/Right stay exactly as
                they are), so it always confirms first (see the overlay
                below, which names the plane) rather than firing straight
                from this click. */}
            <button className="viewport-text-action viewport-text-action-danger" onClick={() => setResetConfirmOpen(true)} aria-label={`Reset ${plane} plane`}>
              <Trash2 size={12} /> Reset
            </button>
          </span>
        </div>
        {circleDefOpen && (
          <div className="reset-confirm-overlay" onClick={() => setCircleDefOpen(false)}>
            <div className="reset-confirm-box sketch-dialog" onClick={(evt) => evt.stopPropagation()}>
              <div className="reset-confirm-title">Circle Definition</div>
              <label className="property-input">Center H ({uLabel})<input type="number" value={circCoordX} onChange={(event) => setCircCoordX(event.target.value)} /></label>
              <label className="property-input">Center V ({uLabel})<input type="number" value={circCoordY} onChange={(event) => setCircCoordY(event.target.value)} /></label>
              <label className="property-input">Radius ({uLabel})<input type="number" value={circCoordR} onChange={(event) => setCircCoordR(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (commitCircleCoord()) setCircleDefOpen(false); } }} /></label>
              <div className="reset-confirm-actions">
                <button className="reset-confirm-no" onClick={() => setCircleDefOpen(false)}>Cancel</button>
                <button className="reset-confirm-yes sketch-dialog-ok" onClick={() => { if (commitCircleCoord()) setCircleDefOpen(false); }}>OK</button>
              </div>
            </div>
          </div>
        )}
        {positioningOpen && (() => {
          const commit = (form: HTMLFormElement) => {
            const f = new FormData(form);
            const num = (k: string) => Number(f.get(k));
            const [oh, ov, ang] = [num('oh'), num('ov'), num('ang')];
            if (![oh, ov, ang].every(Number.isFinite)) return;
            setPositioning({ originH: oh * unitMm, originV: ov * unitMm, angle: ang });
            setPositioningOpen(false);
          };
          return (
            <div className="reset-confirm-overlay" onClick={() => setPositioningOpen(false)}>
              <form className="reset-confirm-box sketch-dialog" onClick={(evt) => evt.stopPropagation()} onSubmit={(evt) => { evt.preventDefault(); commit(evt.currentTarget); }}>
                <div className="reset-confirm-title">Sketch Positioning</div>
                <p className="reset-confirm-body">Where this sketch's absolute axis sits on the {plane} plane. Extrude, Pocket and Revolve place the profile there; the canvas keeps showing the sketch's own axes.</p>
                <label className="property-input">Origin H offset ({uLabel})<input name="oh" type="number" step="any" defaultValue={toU(positioning.originH)} /></label>
                <label className="property-input">Origin V offset ({uLabel})<input name="ov" type="number" step="any" defaultValue={toU(positioning.originV)} /></label>
                <label className="property-input">H direction angle (°)<input name="ang" type="number" step="any" defaultValue={positioning.angle} /></label>
                <div className="reset-confirm-actions">
                  <button type="button" className="reset-confirm-no" onClick={() => setPositioningOpen(false)}>Cancel</button>
                  <button type="button" className="reset-confirm-no" onClick={() => { setPositioning({ originH: 0, originV: 0, angle: 0 }); setPositioningOpen(false); }}>Reset</button>
                  <button type="submit" className="reset-confirm-yes sketch-dialog-ok">OK</button>
                </div>
              </form>
            </div>
          );
        })()}
        {resetConfirmOpen && (
          <div className="reset-confirm-overlay" onClick={() => setResetConfirmOpen(false)}>
            <div className="reset-confirm-box" onClick={(evt) => evt.stopPropagation()}>
              <div className="reset-confirm-title"><AlertTriangle size={16} /> Reset the {plane} plane?</div>
              <p className="reset-confirm-body">
                This erases every line, circle, arc, curve, and dimension on the <b>{plane}</b> plane
                only, and returns the view to its default pan, zoom, and rotation. The {(['Front', 'Top', 'Right'] as const).filter((p) => p !== plane).join(' and ')} planes
                are not touched. This can't be undone.
              </p>
              <div className="reset-confirm-actions">
                <button className="reset-confirm-no" onClick={() => setResetConfirmOpen(false)}>No</button>
                <button className="reset-confirm-yes" onClick={confirmReset}>Yes, reset</button>
              </div>
            </div>
          </div>
        )}
        {/* CATIA's View toolbar (Fit All In, Zoom In/Out, Zoom Area, Zoom In
            Out, Normal View) plus Hide/Show, Swap Visible Space and
            Construction/Standard — a small floating row at the top of the
            canvas, in the topline's own button style. */}
        <div className="sketch-view-toolbar">
          <button className={`viewport-text-action ${positioning.originH || positioning.originV || positioning.angle ? 'viewport-text-action-on' : ''}`} onClick={() => setPositioningOpen(true)} title="Sketch with Absolute Axis Definition — position this sketch's axis on its plane" aria-label="Sketch Positioning">Positioning</button>
          {onExitWorkbench && <button className="viewport-text-action" onClick={onExitWorkbench} title="Exit workbench — go to 3D Design to turn this sketch into a feature" aria-label="Exit workbench">Exit Workbench</button>}
            <button className="viewport-text-action" onClick={fitAllIn} title="Fit All In — fit every element and dimension in view" aria-label="Fit All In"><Fullscreen size={12} /></button>
            <button className="viewport-text-action" onClick={() => zoomStep(0.8)} title="Zoom In" aria-label="Zoom In"><ZoomIn size={12} /></button>
            <button className="viewport-text-action" onClick={() => zoomStep(1.25)} title="Zoom Out" aria-label="Zoom Out"><ZoomOut size={12} /></button>
            <button className={`viewport-text-action ${viewGesture === 'zoom-area' ? 'viewport-text-action-on' : ''}`} onClick={() => setViewGesture((g) => (g === 'zoom-area' ? null : 'zoom-area'))} title="Zoom Area — drag a box to magnify it" aria-label="Zoom Area"><Scan size={12} /></button>
            <button className={`viewport-text-action ${viewGesture === 'zoom-drag' ? 'viewport-text-action-on' : ''}`} onClick={() => setViewGesture((g) => (g === 'zoom-drag' ? null : 'zoom-drag'))} title="Zoom In Out — hold the left button and drag up to zoom in, down to zoom out" aria-label="Zoom In Out"><MoveVertical size={12} /></button>
            <button className={`viewport-text-action ${viewFlipped ? 'viewport-text-action-on' : ''}`} onClick={normalView} title="Normal View — view normal to the sketch plane; choose again to reverse it" aria-label="Normal View"><FlipHorizontal2 size={12} /></button>
            <button className={`viewport-text-action ${tool === 'hide-show' ? 'viewport-text-action-on' : ''}`}
              onClick={() => { if (selected.length > 0) toggleHideSelection(); else { resetToolState(); setTool(tool === 'hide-show' ? 'select' : 'hide-show'); } }}
              title={swapSpace ? 'Hide/Show — show the selected hidden elements again, or with nothing selected, click elements to show them' : 'Hide/Show — hide the selected elements, or with nothing selected, click elements to hide them (they still take part in features)'} aria-label="Hide/Show"><EyeOff size={12} /></button>
            <button className={`viewport-text-action ${swapSpace ? 'viewport-text-action-on' : ''}`} onClick={() => { setSwapSpace((v) => !v); setSelected([]); }} title="Swap Visible Space — show only the hidden elements; choose again to return" aria-label="Swap Visible Space"><Repeat2 size={12} /></button>
            <button className="viewport-text-action" onClick={toggleConstructionSelection} disabled={!lines.some((l) => selected.includes(l.id) && l.style !== 'infinite')} title="Construction/Standard Element — switch the selected lines between profile and reference-only" aria-label="Construction/Standard Element"><SquareDashedBottom size={12} /></button>
        </div>
        {/* Small top-right orientation compass — spins along with the view
            rotation above (Alt+drag) so it's always clear which way X/Y
            actually point, the same idea as a 3D viewport's axis triad. */}
        <div className={`sketch-axis-indicator ${viewFlipped ? 'sketch-axis-flipped' : ''}`} aria-hidden="true">
          <svg viewBox="-18 -18 36 36">
            <g transform={[rotation ? `rotate(${rotation})` : '', viewFlipped ? 'scale(-1 1)' : ''].join(' ').trim() || undefined}>
              <line x1={0} y1={0} x2={13} y2={0} className="axis-line axis-line-x" />
              <text x={17} y={4} className="axis-label axis-label-x">X</text>
              <line x1={0} y1={0} x2={0} y2={13} className="axis-line axis-line-y" />
              <text x={0} y={25} textAnchor="middle" className="axis-label axis-label-y">Y</text>
            </g>
          </svg>
        </div>
        <div className="model-stage" style={{ inset: '30px 0 0' }}>
          <svg ref={svgRef} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} className={`sketch-svg ${isPanning ? 'sketch-panning' : viewGesture ? 'sketch-zoom-gesture' : tool === 'select' ? 'sketch-select-mode' : ''} ${swapSpace ? 'sketch-swap-space' : ''} ${viewFlipped ? 'sketch-view-flipped' : ''} ${hoverEntity && (tool === 'select' || tool === 'hide-show') && !isPanning ? 'sketch-hover-entity' : ''}`}
            style={appearanceStyle as React.CSSProperties}
            onClick={handleCanvasClick} onMouseMove={handleCanvasMouseMove}
            onMouseDown={handleCanvasMouseDown} onMouseUp={handleCanvasMouseUp} onDoubleClick={handleCanvasDoubleClick}
            onMouseLeave={() => { cursorPosRef.current = null; }}
            onContextMenu={(evt) => evt.preventDefault()}>
            <defs>
              {/* Graduation lines (dotted in CATIA) every Primary Spacing ÷
                  Graduations, and stronger Primary Spacing lines, both
                  aligned to the sketch origin. */}
              <pattern id="sketchGrid" width={gridStepX} height={gridStepY} patternUnits="userSpaceOnUse" patternTransform={`translate(${SKETCH_ORIGIN.x} ${SKETCH_ORIGIN.y})`}>
                <path d={`M ${gridStepX} 0 L 0 0 0 ${gridStepY}`} fill="none" stroke="#201c2c" strokeWidth="0.5" />
              </pattern>
              <pattern id="sketchGridPrimary" width={grid.primaryH} height={grid.primaryV} patternUnits="userSpaceOnUse" patternTransform={`translate(${SKETCH_ORIGIN.x} ${SKETCH_ORIGIN.y})`}>
                <path d={`M ${grid.primaryH} 0 L 0 0 0 ${grid.primaryV}`} fill="none" stroke="#2e2842" strokeWidth="0.9" />
              </pattern>
            </defs>
            {/* Everything visible lives inside this one rotated group — a
                pure view-space spin (see the rotation state above), so it
                never touches the real point/line/circle coordinates below. */}
            <g transform={[
              rotation ? `rotate(${rotation} ${viewBox.x + viewBox.w / 2} ${viewBox.y + viewBox.h / 2})` : '',
              // Normal View's reversed view: H mirrored about the view center.
              viewFlipped ? `translate(${viewBox.x + viewBox.w / 2} 0) scale(-1 1) translate(${-(viewBox.x + viewBox.w / 2)} 0)` : '',
            ].join(' ').trim() || undefined}>
            {showGrid && <rect x={-100000} y={-100000} width={200000} height={200000} fill="url(#sketchGrid)" />}
            {showGrid && <rect x={-100000} y={-100000} width={200000} height={200000} fill="url(#sketchGridPrimary)" />}
            {/* Image to Sketch reference layer: locked and non-selectable — it never takes a click, a hover or a box
                select, is not part of the sketch geometry, and is never extruded. */}
            {refImage && refImage.visible && <image className="sketch-ref-image" href={refImage.src} x={refImage.x} y={refImage.y} width={refImage.w} height={refImage.h}
              opacity={refImage.opacity} preserveAspectRatio="none" pointerEvents="none" style={{ pointerEvents: 'none' }} />}
            {/* Reflected sketches: sketches of the other, parallel planes shown here (locked, dashed, never selectable, snapped to or
                extruded) so a sketch can be drawn relative to them. A view only — nothing is copied into this sketch. */}
            {reflected.length > 0 && <g className="sketch-reflected" pointerEvents="none" style={{ pointerEvents: 'none' }} fill="none" stroke="#4fd1c5" strokeWidth={1.3} strokeDasharray="7 4" opacity={0.7}>
              {reflected.map((r) => {
                const byId = new Map<string, { x: number; y: number }>(r.data.points.map((p): [string, { x: number; y: number }] => [p.id, p]));
                const hid = new Set(r.data.hidden ?? []);
                const xs: number[] = []; const ys: number[] = [];
                const parts: JSX.Element[] = [];
                for (const l of r.data.lines) {
                  if (hid.has(l.id) || l.style) continue;
                  const a = byId.get(l.p1); const b = byId.get(l.p2);
                  if (!a || !b) continue;
                  xs.push(a.x, b.x); ys.push(a.y, b.y);
                  parts.push(<line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />);
                }
                for (const c of r.data.circles) {
                  const ctr = byId.get(c.center);
                  if (hid.has(c.id) || !ctr) continue;
                  xs.push(ctr.x - c.r, ctr.x + c.r); ys.push(ctr.y - c.r, ctr.y + c.r);
                  parts.push(<circle key={c.id} cx={ctr.x} cy={ctr.y} r={c.r} vectorEffect="non-scaling-stroke" />);
                }
                for (const arc of r.data.arcs ?? []) {
                  const ctr = byId.get(arc.center);
                  if (hid.has(arc.id) || !ctr) continue;
                  xs.push(ctr.x - arc.r, ctr.x + arc.r); ys.push(ctr.y - arc.r, ctr.y + arc.r);
                  parts.push(<path key={arc.id} d={describeArcPath(ctr.x, ctr.y, arc.r, arc.start, arc.end)} vectorEffect="non-scaling-stroke" />);
                }
                if (!parts.length) return null;
                return <g key={r.id}>
                  {parts}
                  <text x={Math.min(...xs)} y={Math.min(...ys) - 6} fill="#4fd1c5" stroke="none" fontSize={viewBox.w / 80} opacity={0.9}>{r.name} · {r.label} (reflected)</text>
                </g>;
              })}
            </g>}
            {/* Sketch origin marker: short yellow H/V arrows off the center
                point, always drawn for whichever plane is open — a fixed
                "start here" landmark, not an interactive entity (no hit
                area, nothing snaps to it). */}
            <g className={`sketch-origin-marker ${selected.some((id) => id === REF_ORIGIN || id === REF_HDIR || id === REF_VDIR) ? 'sketch-origin-selected' : ''}`}>
              {/* No full-viewport reference line here any more — the origin
                  is marked only by its short H/V arrows and center dot
                  below, per "axis lines must strictly represent finite
                  datum lines or short reference indicators," not a long
                  line stretching across the whole canvas regardless of
                  zoom. */}
              <line x1={SKETCH_ORIGIN.x} y1={SKETCH_ORIGIN.y} x2={SKETCH_ORIGIN.x + ORIGIN_ARM} y2={SKETCH_ORIGIN.y} className={`sketch-axis-arrow ${selected.includes(REF_HDIR) ? 'sketch-axis-selected' : ''}`} />
              {arrowhead({ x: SKETCH_ORIGIN.x + ORIGIN_ARM, y: SKETCH_ORIGIN.y }, { x: -1, y: 0 }, 4, 'sketch-axis-arrowhead')}
              <text x={SKETCH_ORIGIN.x + ORIGIN_ARM + 6} y={SKETCH_ORIGIN.y - 3} className="sketch-axis-label">H</text>
              <line x1={SKETCH_ORIGIN.x} y1={SKETCH_ORIGIN.y} x2={SKETCH_ORIGIN.x} y2={SKETCH_ORIGIN.y - ORIGIN_ARM} className={`sketch-axis-arrow ${selected.includes(REF_VDIR) ? 'sketch-axis-selected' : ''}`} />
              {arrowhead({ x: SKETCH_ORIGIN.x, y: SKETCH_ORIGIN.y - ORIGIN_ARM }, { x: 0, y: 1 }, 4, 'sketch-axis-arrowhead')}
              <text x={SKETCH_ORIGIN.x + 4} y={SKETCH_ORIGIN.y - ORIGIN_ARM - 4} className="sketch-axis-label">V</text>
              <circle cx={SKETCH_ORIGIN.x} cy={SKETCH_ORIGIN.y} r={2.2} className={`sketch-axis-dot ${selected.includes(REF_ORIGIN) ? 'sketch-axis-selected' : ''}`} />
            </g>
            {lines.map((l) => {
              if (!isShown(l.id)) return null;
              const a = pointById.get(l.p1); const b = pointById.get(l.p2);
              if (!a || !b) return null;
              // Only the actual Infinite/Construction Line tool (style ===
              // 'infinite') renders extended far past its two defining
              // points (a large fixed reach, not literal infinity — see
              // infiniteLineEndpoints); a 'construction'-style line —
              // including the Axis tool's datum line — stays a plain
              // finite segment, just dashed.
              const [e1, e2] = l.style === 'infinite' ? infiniteLineEndpoints(a, b) : [a, b];
              return <line key={l.id} x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} className={`sketch-line ${l.style === 'infinite' ? 'sketch-line-infinite' : ''} ${l.style === 'construction' ? 'sketch-line-construction' : ''} ${l.style === 'projected' ? `sketch-line-projected ${modLostIds.has(l.id) ? 'sketch-line-lost' : ''}` : ''} ${selected.includes(l.id) ? 'sketch-selected' : ''} ${isFixed(l.id) ? 'sketch-fixed' : ''}`} />;
            })}
            {circles.map((c) => {
              if (!isShown(c.id)) return null;
              const ctr = pointById.get(c.center);
              if (!ctr) return null;
              return <circle key={c.id} cx={ctr.x} cy={ctr.y} r={c.r} className={`sketch-circle ${selected.includes(c.id) ? 'sketch-selected' : ''} ${isFixed(c.id) ? 'sketch-fixed' : ''}`} />;
            })}
            {arcs.map((arc) => {
              if (!isShown(arc.id)) return null;
              const ctr = pointById.get(arc.center);
              if (!ctr) return null;
              return <path key={arc.id} d={describeArcPath(ctr.x, ctr.y, arc.r, arc.start, arc.end)} className={`sketch-arc ${selected.includes(arc.id) ? 'sketch-selected' : ''} ${isFixed(arc.id) ? 'sketch-fixed' : ''}`} />;
            })}
            {curves.filter((cv) => isShown(cv.id)).map((cv) => (
              <path key={cv.id} d={polylineToPathD(curvePoints(cv), cv.kind === 'ellipse' ? cv.start === undefined : false)} className={`sketch-curve ${selected.includes(cv.id) ? 'sketch-selected' : ''} ${isFixed(cv.id) ? 'sketch-fixed' : ''}`} />
            ))}
            {pending && mousePt && tool === 'line' && (() => {
              const anchor = pointById.get(pending);
              if (!anchor) return null;
              // Same resolveDrawPoint the click handler commits with (see
              // its own comment there) — so what you see here is exactly
              // what clicking now would produce, never a preview that
              // shows one thing and commits another.
              const resolved = resolveDrawPoint(mousePt.x, mousePt.y, anchor);
              const ep = { x: resolved.x, y: resolved.y };
              return <g>
                {resolved.guideH && <line x1={resolved.guideH.x} y1={resolved.guideH.y} x2={ep.x} y2={ep.y} className="sketch-align-guide" />}
                {resolved.guideV && <line x1={resolved.guideV.x} y1={resolved.guideV.y} x2={ep.x} y2={ep.y} className="sketch-align-guide" />}
                <line x1={lineSymToggle ? 2 * anchor.x - ep.x : anchor.x} y1={lineSymToggle ? 2 * anchor.y - ep.y : anchor.y} x2={ep.x} y2={ep.y} className={resolved.axis ? 'sketch-preview-line-hv' : 'sketch-preview-line'} />
                {renderSnapGlyph(resolved)}
                {'tangentTo' in resolved && resolved.tangentTo && (() => {
                  // Inference line: the tangent carried on past the touch point.
                  const d = Math.hypot(ep.x - anchor.x, ep.y - anchor.y) || 1;
                  const far = { x: ep.x + ((ep.x - anchor.x) / d) * 40, y: ep.y + ((ep.y - anchor.y) / d) * 40 };
                  return <g>
                    <line x1={ep.x} y1={ep.y} x2={far.x} y2={far.y} className="sketch-align-guide" />
                    <text x={ep.x + 5} y={ep.y - 5} className="sketch-hv-glyph">Tangent</text>
                  </g>;
                })()}
                {resolved.axis && <text x={ep.x + 6} y={ep.y - 13} className="sketch-hv-glyph">{resolved.axis === 'h' ? 'H' : 'V'}</text>}
                <text x={(anchor.x + ep.x) / 2} y={(anchor.y + ep.y) / 2 - 4} className="sketch-preview-label">{liveValue}</text>
              </g>;
            })()}
            {!pending && mousePt && tool === 'line' && (() => {
              // Hovering to place the FIRST point of a new line gets the
              // same snap feedback as the second (see renderSnapGlyph) —
              // there's no anchor yet, so no H/V inference and no
              // rubber-band preview line, just whichever of an existing
              // vertex, a line's own midpoint, an alignment guide, or a
              // point along an existing line's span the cursor is
              // currently locked onto.
              const resolved = resolveDrawPoint(mousePt.x, mousePt.y, null);
              return renderSnapGlyph(resolved);
            })()}
            {mousePt && tool === 'point' && (() => {
              // The Point tool gets the exact same hover feedback as the
              // Line tool's own first-point preview above — see
              // commitResolvedPoint, which is what a click here actually
              // commits, so the reticle/ring you see is always what you're
              // about to get: a real vertex reused (reticle only), or a
              // line's midpoint/an alignment guide/a point along an
              // existing line's span (reticle plus ring).
              const resolved = resolveDrawPoint(mousePt.x, mousePt.y, null);
              return renderSnapGlyph(resolved);
            })()}
            {pending && mousePt && tool === 'circle' && (() => {
              const anchor = pointById.get(pending);
              if (!anchor) return null;
              const r = Math.hypot(mousePt.x - anchor.x, mousePt.y - anchor.y);
              return <g>
                <circle cx={anchor.x} cy={anchor.y} r={r} className="sketch-preview-circle" />
                <text x={anchor.x + r + 4} y={anchor.y - 4} className="sketch-preview-label">R{liveValue}</text>
              </g>;
            })()}
            {pending && mousePt && tool === 'rectangle' && (() => {
              const anchor = pointById.get(pending);
              if (!anchor) return null;
              const rx = Math.min(anchor.x, mousePt.x), ry = Math.min(anchor.y, mousePt.y);
              const w = Math.abs(mousePt.x - anchor.x), h = Math.abs(mousePt.y - anchor.y);
              return <g>
                <rect x={rx} y={ry} width={w} height={h} className="sketch-preview-rect" />
                <text x={rx} y={ry - 4} className="sketch-preview-label">{toU(w).toFixed(1)} × {toU(h).toFixed(1)}</text>
              </g>;
            })()}
            {pending && mousePt && tool === 'arc' && (() => {
              const center = pointById.get(pending);
              if (!center) return null;
              if (!arcDraftRef.current) {
                const r = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
                return <g>
                  <line x1={center.x} y1={center.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <circle cx={center.x} cy={center.y} r={r} className="sketch-preview-circle" />
                  <text x={center.x + r + 4} y={center.y - 4} className="sketch-preview-label">R{toU(r).toFixed(1)}</text>
                </g>;
              }
              const { r, start } = arcDraftRef.current;
              const end = angleOfPts(center, mousePt);
              return <path d={describeArcPath(center.x, center.y, r, start, end)} className="sketch-preview-arc" />;
            })()}

            {/* --- Live dashed-preview + measurement label for the Profile flyout's --- */}
            {/* predefined shapes — same idea as Line/Circle/Rectangle/Arc above, just */}
            {/* one block per shape since each has its own wizard stage(s). */}
            {mousePt && tool === 'rect-oriented' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [p1] = wp;
                const len = Math.hypot(mousePt.x - p1.x, mousePt.y - p1.y);
                return <g>
                  <line x1={p1.x} y1={p1.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(p1.x + mousePt.x) / 2} y={(p1.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(len).toFixed(1)}</text>
                </g>;
              }
              if (wp.length === 2) {
                const [p1, p2] = wp;
                const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy);
                if (len < 1e-3) return null;
                const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
                const h = (mousePt.x - p1.x) * nx + (mousePt.y - p1.y) * ny;
                const p3 = { x: p2.x + nx * h, y: p2.y + ny * h };
                const p4 = { x: p1.x + nx * h, y: p1.y + ny * h };
                return <g>
                  <polygon points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`} className="sketch-preview-rect" />
                  <text x={p4.x} y={p4.y - 4} className="sketch-preview-label">{toU(len).toFixed(1)} × {toU(Math.abs(h)).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {mousePt && tool === 'rect-parallelogram' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [p1] = wp;
                const len = Math.hypot(mousePt.x - p1.x, mousePt.y - p1.y);
                return <g>
                  <line x1={p1.x} y1={p1.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(p1.x + mousePt.x) / 2} y={(p1.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(len).toFixed(1)}</text>
                </g>;
              }
              if (wp.length === 2) {
                const [p1, p2] = wp;
                const p3 = mousePt;
                const p4 = { x: p1.x + p3.x - p2.x, y: p1.y + p3.y - p2.y };
                const side2 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
                return <g>
                  <polygon points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`} className="sketch-preview-rect" />
                  <text x={p3.x + 4} y={p3.y - 4} className="sketch-preview-label">{toU(side2).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {mousePt && (tool === 'slot' || tool === 'slot-cyl') && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [p1] = wp;
                const len = Math.hypot(mousePt.x - p1.x, mousePt.y - p1.y);
                return <g>
                  <line x1={p1.x} y1={p1.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(p1.x + mousePt.x) / 2} y={(p1.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(len).toFixed(1)}</text>
                </g>;
              }
              if (wp.length === 2) {
                let c1 = wp[0], c2 = wp[1];
                if (tool === 'slot-cyl') { const [mid, end] = wp; c1 = end; c2 = { x: mid.x * 2 - end.x, y: mid.y * 2 - end.y }; }
                const r = Math.max(2, perpDistanceToLine(mousePt.x, mousePt.y, c1, c2));
                const a = angleOfPts(c1, c2);
                const mk = (c: { x: number; y: number }, ang: number) => ({ x: c.x + r * Math.cos((ang * Math.PI) / 180), y: c.y + r * Math.sin((ang * Math.PI) / 180) });
                const topA = mk(c1, a + 90), topB = mk(c2, a + 90);
                const botA = mk(c1, a - 90), botB = mk(c2, a - 90);
                return <g>
                  <path d={describeArcPath(c1.x, c1.y, r, a + 90, a + 270)} className="sketch-preview-arc" />
                  <path d={describeArcPath(c2.x, c2.y, r, a - 90, a + 90)} className="sketch-preview-arc" />
                  <line x1={topA.x} y1={topA.y} x2={topB.x} y2={topB.y} className="sketch-preview-line" />
                  <line x1={botA.x} y1={botA.y} x2={botB.x} y2={botB.y} className="sketch-preview-line" />
                  <text x={topA.x} y={topA.y - 4} className="sketch-preview-label">D{toU((r * 2)).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {mousePt && tool === 'keyhole' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [c1] = wp;
                const len = Math.hypot(mousePt.x - c1.x, mousePt.y - c1.y);
                return <g>
                  <line x1={c1.x} y1={c1.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(c1.x + mousePt.x) / 2} y={(c1.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(len).toFixed(1)}</text>
                </g>;
              }
              if (wp.length === 2) {
                const [c1, c2] = wp;
                const kh = keyholeShape(c1, c2, mousePt.x, mousePt.y);
                if (!kh) return null;
                return <g>
                  <path d={describeArcPath(c1.x, c1.y, kh.r1, kh.small.start, kh.small.end)} className="sketch-preview-arc" />
                  <path d={describeArcPath(c2.x, c2.y, kh.r2, kh.big.start, kh.big.end)} className="sketch-preview-arc" />
                  <line x1={kh.top.t1.x} y1={kh.top.t1.y} x2={kh.top.t2.x} y2={kh.top.t2.y} className="sketch-preview-line" />
                  <line x1={kh.bot.t1.x} y1={kh.bot.t1.y} x2={kh.bot.t2.x} y2={kh.bot.t2.y} className="sketch-preview-line" />
                  <text x={kh.top.t1.x} y={kh.top.t1.y - 4} className="sketch-preview-label">R{toU(kh.r1).toFixed(1)} / R{toU(kh.r2).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {pending && mousePt && tool === 'rect-centered' && (() => {
              const center = pointById.get(pending);
              if (!center) return null;
              const halfW = Math.abs(mousePt.x - center.x), halfH = Math.abs(mousePt.y - center.y);
              const corners = [
                { x: center.x - halfW, y: center.y - halfH },
                { x: center.x + halfW, y: center.y - halfH },
                { x: center.x + halfW, y: center.y + halfH },
                { x: center.x - halfW, y: center.y + halfH },
              ];
              return <g>
                <polygon points={corners.map((p) => `${p.x},${p.y}`).join(' ')} className="sketch-preview-rect" />
                <text x={center.x} y={center.y - 4} className="sketch-preview-label">{toU(halfW * 2).toFixed(1)} × {toU(halfH * 2).toFixed(1)}</text>
              </g>;
            })()}
            {mousePt && tool === 'rect-center3' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [center] = wp;
                const halfW = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
                return <g>
                  <line x1={center.x} y1={center.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(center.x + mousePt.x) / 2} y={(center.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(halfW).toFixed(1)} (half-width)</text>
                </g>;
              }
              if (wp.length === 2) {
                const [center, edgeMid] = wp;
                const dx = edgeMid.x - center.x, dy = edgeMid.y - center.y, halfW = Math.hypot(dx, dy);
                if (halfW < 1e-3) return null;
                const ux = dx / halfW, uy = dy / halfW, nx = -uy, ny = ux;
                const halfH = (mousePt.x - center.x) * nx + (mousePt.y - center.y) * ny;
                const corners = [
                  { x: center.x + ux * halfW + nx * halfH, y: center.y + uy * halfW + ny * halfH },
                  { x: center.x - ux * halfW + nx * halfH, y: center.y - uy * halfW + ny * halfH },
                  { x: center.x - ux * halfW - nx * halfH, y: center.y - uy * halfW - ny * halfH },
                  { x: center.x + ux * halfW - nx * halfH, y: center.y + uy * halfW - ny * halfH },
                ];
                return <g>
                  <polygon points={corners.map((p) => `${p.x},${p.y}`).join(' ')} className="sketch-preview-rect" />
                  <text x={center.x} y={center.y - 4} className="sketch-preview-label">{toU((halfW * 2)).toFixed(1)} × {toU(Math.abs(halfH * 2)).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {mousePt && tool === 'rect-parallelogram-center' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [center] = wp;
                const len = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
                return <g>
                  <line x1={center.x} y1={center.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(center.x + mousePt.x) / 2} y={(center.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(len).toFixed(1)}</text>
                </g>;
              }
              if (wp.length === 2) {
                const [center, a] = wp;
                const b = mousePt;
                const c = { x: 2 * center.x - a.x, y: 2 * center.y - a.y };
                const d = { x: 2 * center.x - b.x, y: 2 * center.y - b.y };
                return <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`} className="sketch-preview-rect" />;
              }
              return null;
            })()}
            {mousePt && tool === 'slot-arc' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [center] = wp;
                return <line x1={center.x} y1={center.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />;
              }
              if (wp.length === 2) {
                const [center, startPt] = wp;
                const r = Math.hypot(startPt.x - center.x, startPt.y - center.y);
                return <path d={describeArcPath(center.x, center.y, r, angleOfPts(center, startPt), angleOfPts(center, mousePt))} className="sketch-preview-arc" />;
              }
              if (wp.length === 3) {
                const [center, startPt, endPt] = wp;
                const r = Math.hypot(startPt.x - center.x, startPt.y - center.y);
                if (r < 1e-3) return null;
                const startAngle = angleOfPts(center, startPt), endAngle = angleOfPts(center, endPt);
                const w = Math.max(2, Math.abs(Math.hypot(mousePt.x - center.x, mousePt.y - center.y) - r) * 2);
                const rOuter = r + w / 2, rInner = Math.max(1, r - w / 2);
                return <g>
                  <path d={describeArcPath(center.x, center.y, rOuter, startAngle, endAngle)} className="sketch-preview-arc" />
                  <path d={describeArcPath(center.x, center.y, rInner, startAngle, endAngle)} className="sketch-preview-arc" />
                  <text x={center.x} y={center.y - 4} className="sketch-preview-label">width {toU(w).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {pending && mousePt && tool === 'hexagon' && (() => {
              const center = pointById.get(pending);
              if (!center) return null;
              const r = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
              const a0 = angleOfPts(center, mousePt);
              const hexPts = Array.from({ length: 6 }, (_, i) => {
                const ang = ((a0 + i * 60) * Math.PI) / 180;
                return { x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) };
              });
              return <g>
                <line x1={center.x} y1={center.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                <polygon points={hexPts.map((p) => `${p.x},${p.y}`).join(' ')} className="sketch-preview-circle" />
                <text x={center.x + r + 4} y={center.y - 4} className="sketch-preview-label">R{toU(r).toFixed(1)}</text>
              </g>;
            })()}

            {/* --- Live dashed-preview + measurement label for the Circle flyout --- */}
            {pending && mousePt && tool === 'polygon-n' && (() => {
              const center = pointById.get(pending);
              if (!center) return null;
              const sides = Math.max(3, Math.round(Number(polygonSides) || 6));
              const verts = regularPolygonPoints(center.x, center.y, sides, mousePt.x, mousePt.y, polygonCircumscribed);
              const r = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
              return <g>
                <line x1={center.x} y1={center.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                <polygon points={verts.map((p) => `${p.x},${p.y}`).join(' ')} className="sketch-preview-circle" />
                <text x={center.x + r + 4} y={center.y - 4} className="sketch-preview-label">{sides}-gon, {polygonCircumscribed ? 'apothem' : 'R'} {toU(r).toFixed(1)}</text>
              </g>;
            })()}
            {mousePt && (tool === 'arc-3pt' || tool === 'arc-3pt-limits') && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [p1] = wp;
                // The dotted chord from the first point to the cursor.
                return <line x1={p1.x} y1={p1.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />;
              }
              if (wp.length === 2) {
                const [p1, p2] = wp;
                const built = tool === 'arc-3pt' ? build3PtArc(p1, mousePt, p2) : build3PtArc(p1, p2, mousePt);
                if (!built) return null;
                return <g>
                  <path d={describeArcPath(built.cx, built.cy, built.r, built.start, built.end)} className="sketch-preview-arc" />
                  <text x={built.cx + built.r + 4} y={built.cy - 4} className="sketch-preview-label">R{toU(built.r).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {tool === 'arc-tangent' && mousePt && wizardIdsRef.current.length === 1 && (() => {
              const g = geomById(wizardIdsRef.current[0]);
              if (!g || g.kind !== 'line') return null;
              const dA = Math.hypot(g.a.x - mousePt.x, g.a.y - mousePt.y), dB = Math.hypot(g.b.x - mousePt.x, g.b.y - mousePt.y);
              const tangentPt = dA < dB ? g.a : g.b, otherPt = dA < dB ? g.b : g.a;
              const dirLen = Math.hypot(tangentPt.x - otherPt.x, tangentPt.y - otherPt.y) || 1;
              const arc = tangentArcFrom(tangentPt, { x: (tangentPt.x - otherPt.x) / dirLen, y: (tangentPt.y - otherPt.y) / dirLen }, mousePt);
              return arc ? <path d={describeArcPath(arc.cx, arc.cy, arc.r, arc.start, arc.end)} className="sketch-preview-arc" /> : null;
            })()}
            {mousePt && tool === 'circle-3pt' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [p1] = wp;
                const len = Math.hypot(mousePt.x - p1.x, mousePt.y - p1.y);
                return <g>
                  <line x1={p1.x} y1={p1.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(p1.x + mousePt.x) / 2} y={(p1.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(len).toFixed(1)}</text>
                </g>;
              }
              if (wp.length === 2) {
                const [p1, p2] = wp;
                const cc = circle3ptFixedR(p1, p2, mousePt) ?? circumcenter3(p1, p2, mousePt);
                if (!cc) return null;
                return <g>
                  <circle cx={cc.x} cy={cc.y} r={cc.r} className="sketch-preview-circle" />
                  <text x={cc.x + cc.r + 4} y={cc.y - 4} className="sketch-preview-label">R{toU(cc.r).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {pending && mousePt && tool === 'circle-2pt' && (() => {
              const center = pointById.get(pending);
              if (!center) return null;
              const wp = wizardPtsRef.current;
              if (wp.length === 0) {
                const r = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
                return <g>
                  <circle cx={center.x} cy={center.y} r={r} className="sketch-preview-circle" />
                  <text x={center.x + r + 4} y={center.y - 4} className="sketch-preview-label">R{toU(r).toFixed(1)}</text>
                </g>;
              }
              const r1 = Math.hypot(wp[0].x - center.x, wp[0].y - center.y);
              const r2 = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
              const r = (r1 + r2) / 2;
              return <g>
                <circle cx={center.x} cy={center.y} r={r} className="sketch-preview-circle" />
                <text x={center.x + r + 4} y={center.y - 4} className="sketch-preview-label">R{toU(r).toFixed(1)} (avg)</text>
              </g>;
            })()}
            {mousePt && tool === 'circle-tritangent' && wizardIdsRef.current.length === 2 && (() => {
              const hit = pickCurveAt(mousePt.x, mousePt.y);
              if (!hit || !asTarget(hit) || wizardIdsRef.current.includes(hit.id)) return null;
              const tt = triTangentFor([...wizardIdsRef.current, hit.id], [...wizardPtsRef.current, mousePt]);
              if (!tt) return null;
              return <g>
                <circle cx={tt.x} cy={tt.y} r={tt.r} className="sketch-preview-circle" />
                <text x={tt.x + tt.r + 4} y={tt.y - 4} className="sketch-preview-label">R{toU(tt.r).toFixed(1)}</text>
              </g>;
            })()}

            {/* --- Live dashed-preview + measurement label for the Ellipse flyout --- */}
            {mousePt && tool === 'ellipse' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [center] = wp;
                const rx = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
                return <g>
                  <line x1={center.x} y1={center.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(center.x + mousePt.x) / 2} y={(center.y + mousePt.y) / 2 - 4} className="sketch-preview-label">rx {toU(rx).toFixed(1)}</text>
                </g>;
              }
              if (wp.length === 2) {
                const [center, majorPt] = wp;
                const rx = Math.hypot(majorPt.x - center.x, majorPt.y - center.y);
                if (rx < 1e-3) return null;
                const rot = Math.atan2(majorPt.y - center.y, majorPt.x - center.x);
                const ry = Math.max(1, perpDistanceToLine(mousePt.x, mousePt.y, center, majorPt));
                return <g>
                  <path d={polylineToPathD(sampleEllipse(center.x, center.y, rx, ry, rot, 48), true)} className="sketch-preview-circle" />
                  <text x={center.x} y={center.y - ry - 6} className="sketch-preview-label">{toU(rx).toFixed(1)} × {toU(ry).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {mousePt && tool === 'parabola' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [focus] = wp;
                const d = Math.hypot(mousePt.x - focus.x, mousePt.y - focus.y);
                return <g>
                  <line x1={focus.x} y1={focus.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(focus.x + mousePt.x) / 2} y={(focus.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(d).toFixed(1)}</text>
                </g>;
              }
              if (wp.length === 2) {
                const [focus, vertex] = wp;
                if (Math.hypot(focus.x - vertex.x, focus.y - vertex.y) < 1e-3) return null;
                const span = Math.max(5, Math.abs(perpDistanceToLine(mousePt.x, mousePt.y, vertex, focus)));
                return <g>
                  <path d={polylineToPathD(sampleParabola(focus, vertex, span), false)} className="sketch-preview-circle" />
                  <text x={vertex.x} y={vertex.y - 6} className="sketch-preview-label">span {toU(span).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {mousePt && tool === 'hyperbola' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [center] = wp;
                const d = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
                return <g>
                  <line x1={center.x} y1={center.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                  <text x={(center.x + mousePt.x) / 2} y={(center.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(d).toFixed(1)}</text>
                </g>;
              }
              if (wp.length === 2) {
                const [center, focus] = wp;
                if (Math.hypot(focus.x - center.x, focus.y - center.y) < 1e-3) return null;
                const vDist = Math.hypot(mousePt.x - center.x, mousePt.y - center.y);
                return <g>
                  <path d={polylineToPathD(sampleHyperbola(center, focus, mousePt), false)} className="sketch-preview-circle" />
                  <text x={mousePt.x + 4} y={mousePt.y - 4} className="sketch-preview-label">a {toU(vDist).toFixed(1)}</text>
                </g>;
              }
              return null;
            })()}
            {mousePt && tool === 'conic' && (() => {
              const wp = wizardPtsRef.current;
              const fitted = wp.length === 4 ? sampleConicFrom5Points([...wp, mousePt]) : [];
              return <g>
                <polyline points={`${wp.map((p) => `${p.x},${p.y}`).join(' ')} ${mousePt.x},${mousePt.y}`} className="sketch-preview-line" fill="none" />
                {fitted.length > 0 && <path d={polylineToPathD(fitted, true)} className="sketch-preview-circle" />}
                <text x={mousePt.x + 6} y={mousePt.y - 6} className="sketch-preview-label">Point {wp.length + 1} of 5</text>
              </g>;
            })()}
            {mousePt && tool === 'ellipse-arc' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [center] = wp;
                return <line x1={center.x} y1={center.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />;
              }
              if (wp.length === 2) {
                const [center, majorPt] = wp;
                const rx = Math.hypot(majorPt.x - center.x, majorPt.y - center.y);
                if (rx < 1e-3) return null;
                const rot = Math.atan2(majorPt.y - center.y, majorPt.x - center.x);
                const ry = Math.max(1, perpDistanceToLine(mousePt.x, mousePt.y, center, majorPt));
                return <path d={polylineToPathD(sampleEllipse(center.x, center.y, rx, ry, rot, 48), true)} className="sketch-preview-circle" />;
              }
              if (wp.length === 3) {
                const [center, majorPt, radiusPt] = wp;
                const rx = Math.hypot(majorPt.x - center.x, majorPt.y - center.y);
                if (rx < 1e-3) return null;
                const rot = Math.atan2(majorPt.y - center.y, majorPt.x - center.x);
                const ry = Math.max(1, perpDistanceToLine(radiusPt.x, radiusPt.y, center, majorPt));
                const localAngle = (p: { x: number; y: number }) => {
                  const dx = p.x - center.x, dy = p.y - center.y;
                  const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
                  const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
                  return (Math.atan2(ly / (ry || 1), lx / (rx || 1)) * 180) / Math.PI;
                };
                const start = localAngle(radiusPt), end = localAngle(mousePt);
                return <path d={polylineToPathD(sampleEllipse(center.x, center.y, rx, ry, rot, 48, start, end), false)} className="sketch-preview-circle" />;
              }
              return null;
            })()}
            {mousePt && tool === 'conic-rp' && (() => {
              const wp = wizardPtsRef.current;
              if (wp.length === 1) {
                const [p0] = wp;
                return <line x1={p0.x} y1={p0.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />;
              }
              if (wp.length === 2) {
                const [p0, papex] = wp;
                const rho = Math.max(0.02, Math.min(0.98, Number(conicRho) || 0.5));
                return <g>
                  <polyline points={`${p0.x},${p0.y} ${papex.x},${papex.y} ${mousePt.x},${mousePt.y}`} className="sketch-preview-line" fill="none" />
                  <path d={polylineToPathD(sampleConicRho(p0, papex, mousePt, rho, 40), false)} className="sketch-preview-circle" />
                </g>;
              }
              return null;
            })()}

            {/* --- Live dashed-preview + measurement label for the Spline flyout --- */}
            {mousePt && tool === 'spline-connect' && wizardIdsRef.current.length === 1 && (() => {
              const hit = pickEntityAt(mousePt.x, mousePt.y);
              if (!hit || (hit.kind !== 'line' && hit.kind !== 'curve') || hit.id === wizardIdsRef.current[0]) return null;
              const g1 = geomById(wizardIdsRef.current[0]);
              if (!g1 || (g1.kind !== 'line' && g1.kind !== 'curve')) return null;
              const endpointsOf = (g: EntityGeom): [{ x: number; y: number }, { x: number; y: number }] | null => {
                if (g.kind === 'line') return [g.a, g.b];
                if (g.kind === 'curve') { const n = g.pts.length; return n >= 2 ? [g.pts[0], g.pts[n - 1]] : null; }
                return null;
              };
              const e1 = endpointsOf(g1), e2 = endpointsOf(hit);
              if (!e1 || !e2) return null;
              let best = { p1: e1[0], p2: e2[0], d: Infinity };
              for (const p1 of e1) for (const p2 of e2) {
                const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                if (d < best.d) best = { p1, p2, d };
              }
              return <g>
                <line x1={best.p1.x} y1={best.p1.y} x2={best.p2.x} y2={best.p2.y} className="sketch-preview-line" />
                <text x={(best.p1.x + best.p2.x) / 2} y={(best.p1.y + best.p2.y) / 2 - 4} className="sketch-preview-label">{toU(best.d).toFixed(1)}</text>
              </g>;
            })()}

            {/* Centre snap (0, 0): while the cursor (or a dragged point / a line's midpoint) approaches the plane's origin the H and V axes are
                drawn as a dashed crosshair through it, with the snap reach ringed; once it locks on, the origin lights up as concentric
                yellow / red rings and a glowing centre dot. Sized in screen pixels so it reads the same at any zoom, and drawn in the sketch's
                own plane coordinates, so it is identical on Front / Top / Right and on every Reference Plane. */}
            {originGuide && (() => {
              const o = SKETCH_ORIGIN, upp = unitsPerPx(), locked = originGuide === 'locked', ext = 1e5;
              const lineProps = { stroke: locked ? '#ffd24a' : '#e9c46a', strokeWidth: 1, strokeDasharray: '5 4', opacity: locked ? 0.9 : 0.55, vectorEffect: 'non-scaling-stroke' as const, pointerEvents: 'none' as const };
              return <g className="sketch-origin-guide" pointerEvents="none">
                <line x1={o.x - ext} y1={o.y} x2={o.x + ext} y2={o.y} {...lineProps} />
                <line x1={o.x} y1={o.y - ext} x2={o.x} y2={o.y + ext} {...lineProps} />
                {!locked && <circle cx={o.x} cy={o.y} r={originTol()} fill="none" stroke="#ffd24a" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} vectorEffect="non-scaling-stroke" />}
                {locked && <>
                  <circle cx={o.x} cy={o.y} r={14 * upp} fill="rgba(255,59,59,0.14)" />
                  <circle cx={o.x} cy={o.y} r={10 * upp} fill="none" stroke="#ff3b3b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <circle cx={o.x} cy={o.y} r={6 * upp} fill="none" stroke="#ffd24a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <circle cx={o.x} cy={o.y} r={2.4 * upp} fill="#ff3b3b" stroke="#fff3b0" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <text x={o.x + 13 * upp} y={o.y - 12 * upp} fontSize={11 * upp} fill="#ffd24a" style={{ userSelect: 'none' }}>Origin (0, 0)</text>
                </>}
              </g>;
            })()}

            {/* Always-on hover snap feedback — the start/end/midpoint glyph
                (see hoverSnapAt) tracking wherever the cursor currently is,
                regardless of which tool is active or whether one is active
                at all (unlike every other preview block here, which only
                draws once a specific tool's own placement is underway). */}
            {hoverSnap && renderSnapGlyph(hoverSnap)}

            {/* Line Normal to a Curve: once an entity is picked, a live
                dashed preview + editable Distance callout tracks the
                cursor, honoring Reverse/Symmetrical Extension exactly like
                applyLineNormal will — double-click the length text to type
                an exact Distance directly on the canvas, same effect as
                typing it in the Inspector. */}
            {tool === 'line-normal' && lineNormalTargetId && mousePt && (() => {
              const g = geomById(lineNormalTargetId);
              if (!g) return null;
              const { x1, y1, x2, y2, length } = computeNormalLine(g, mousePt.x, mousePt.y, lineNormalDistance, lineNormalReverse, lineNormalSymmetric);
              const labelText = lineNormalDistance || toU(length).toFixed(1);
              const midx = (x1 + x2) / 2, midy = (y1 + y2) / 2;
              const commitLineNormalDimEdit = () => {
                setLineNormalDimEditing(false);
                if (lineNormalDimEditValue !== '' && Number.isFinite(Number(lineNormalDimEditValue)) && Number(lineNormalDimEditValue) > 0) setLineNormalDistance(lineNormalDimEditValue);
              };
              return <g>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="sketch-preview-line" />
                {/* Snap feedback for where each endpoint will actually land
                    (see resolveLineEndpoint/placeLineEndpoint) — a reticle
                    on a real existing point, ring+reticle on an existing
                    line's exact midpoint, nothing when it's just a plain
                    computed spot, matching the base Line tool's own
                    on-screen snap cue. */}
                {renderSnapGlyph(resolveLineEndpoint(x1, y1))}
                {renderSnapGlyph(resolveLineEndpoint(x2, y2))}
                <DimensionLabel x={midx} y={midy - 4} className="sketch-preview-label sketch-preview-label-commit" seed={String(labelText)}
                  editing={lineNormalDimEditing}
                  onStartEdit={(v) => { setLineNormalDimEditValue(v); setLineNormalDimEditing(true); }}
                  onChange={setLineNormalDimEditValue} onCommit={commitLineNormalDimEdit} onCancel={() => setLineNormalDimEditing(false)}
                  onMouseDown={(e) => e.stopPropagation()}
                >{labelText}</DimensionLabel>
              </g>;
            })()}
            {/* Axis preview: just the two clicked points, not stretched to
                infiniteLineEndpoints like the old Infinite Line tool used
                to — matches the finite 'construction'-style line this tool
                commits (see the axis-construction click handler). */}
            {pending && mousePt && tool === 'axis-construction' && (() => {
              const anchor = pointById.get(pending);
              if (!anchor) return null;
              return <line x1={anchor.x} y1={anchor.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />;
            })()}
            {/* Symmetrical Extension Line: once an anchor is set, a live
                dashed preview mirrored on both sides of it + editable
                Distance callout, mirroring the Line Normal preview above. */}
            {tool === 'line-symmetric' && lineSymAnchor && mousePt && (() => {
              const { x1, y1, x2, y2, length } = computeSymmetricLine(lineSymAnchor, mousePt.x, mousePt.y, lineSymDistance);
              const labelText = lineSymDistance || toU(length).toFixed(1);
              const midx = (x1 + x2) / 2, midy = (y1 + y2) / 2;
              const commitLineSymDimEdit = () => {
                setLineSymDimEditing(false);
                if (lineSymDimEditValue !== '' && Number.isFinite(Number(lineSymDimEditValue)) && Number(lineSymDimEditValue) > 0) setLineSymDistance(lineSymDimEditValue);
              };
              return <g>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="sketch-preview-line" />
                <circle cx={lineSymAnchor.x} cy={lineSymAnchor.y} r={3} className="sketch-preview-circle" />
                {/* Snap feedback for both mirrored endpoints — see the same
                    resolveLineEndpoint call in the Line Normal preview
                    above. */}
                {renderSnapGlyph(resolveLineEndpoint(x1, y1))}
                {renderSnapGlyph(resolveLineEndpoint(x2, y2))}
                <DimensionLabel x={midx} y={midy - 4} className="sketch-preview-label sketch-preview-label-commit" seed={String(labelText)}
                  editing={lineSymDimEditing}
                  onStartEdit={(v) => { setLineSymDimEditValue(v); setLineSymDimEditing(true); }}
                  onChange={setLineSymDimEditValue} onCommit={commitLineSymDimEdit} onCancel={() => setLineSymDimEditing(false)}
                  onMouseDown={(e) => e.stopPropagation()}
                >{labelText}</DimensionLabel>
              </g>;
            })()}
            {mousePt && tool === 'point-midpoint' && wizardIdsRef.current.length === 1 && (() => {
              const p1 = pointById.get(wizardIdsRef.current[0]);
              if (!p1) return null;
              const mid = { x: (p1.x + mousePt.x) / 2, y: (p1.y + mousePt.y) / 2 };
              return <g>
                <line x1={p1.x} y1={p1.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                <circle cx={mid.x} cy={mid.y} r={3} className="sketch-preview-circle" />
              </g>;
            })()}
            {/* Bisecting/Mid Point's new direct-click case: hovering a bare
                line/arc/curve (no vertex under the cursor, and no
                two-point pick already started) previews exactly where a
                click would drop the midpoint — see the matching click
                handler above. */}
            {mousePt && tool === 'point-midpoint' && wizardIdsRef.current.length === 0 && !findNearestPoint(mousePt.x, mousePt.y) && (() => {
              const hit = pickEntityAt(mousePt.x, mousePt.y);
              if (!hit || (hit.kind !== 'line' && hit.kind !== 'arc' && hit.kind !== 'curve')) return null;
              const pos = pointAtCurveParam(hit, 0.5, false);
              if (!pos) return null;
              return <circle cx={pos.x} cy={pos.y} r={3} className="sketch-preview-circle" />;
            })()}
            {/* Points by Coordinates: previews the exact spot the typed X/Y
                (or R/θ) would plot, live — no click needed to see it, and
                no text label alongside it (per the clean-canvas, no-
                coordinate-text requirement — just the node). */}
            {tool === 'point-coord' && (() => {
              let px: number, py: number;
              if (coordMode === 'cartesian') {
                px = SKETCH_ORIGIN.x + (lenNum(coordX) || 0);
                py = SKETCH_ORIGIN.y - (lenNum(coordY) || 0);
              } else {
                const r = lenNum(coordR) || 0;
                const theta = ((Number(coordTheta) || 0) * Math.PI) / 180;
                px = SKETCH_ORIGIN.x + r * Math.cos(theta);
                py = SKETCH_ORIGIN.y - r * Math.sin(theta);
              }
              return <circle cx={px} cy={py} r={3.5} className="sketch-preview-circle" />;
            })()}
            {/* Points on Curve: once an entity is picked, immediately (no
                mouse-hover dependency — this is the "preview point
                immediately appears" requirement) preview the exact spot
                the Reference/Distance/Flip combination would place, live
                as those fields change — see applyCurveOffset, which this
                mirrors — plus an editable dimension-text callout right
                next to it: double-click to type a new distance directly on
                the canvas, same effect as typing it in the Inspector. */}
            {tool === 'point-oncurve' && curveTargetId && (() => {
              const g = geomById(curveTargetId);
              if (!g) return null;
              const total = curveEntityLength(g);
              const val = (curveOffsetMode === 'percent' ? Number(curveOffsetValue) : lenNum(curveOffsetValue)) || 0;
              const t = curveOffsetMode === 'percent'
                ? Math.max(0, Math.min(100, val)) / 100
                : (total > 1e-6 ? Math.max(0, Math.min(total, val)) / total : 0);
              const pos = pointAtCurveParam(g, t, curveRef === 'end');
              if (!pos) return null;
              const labelText = `${curveOffsetValue || 0}${curveOffsetMode === 'percent' ? '%' : ''}`;
              const commitCurveDimEdit = () => {
                setCurveDimEditing(false);
                if (curveDimEditValue !== '' && Number.isFinite(Number(curveDimEditValue))) setCurveOffsetValue(curveDimEditValue);
              };
              return <g>
                <circle cx={pos.x} cy={pos.y} r={3.5} className="sketch-preview-circle" />
                <DimensionLabel x={pos.x + 6} y={pos.y - 5} className="dim-label sketch-oncurve-dim" seed={String(curveOffsetValue || 0)}
                  editing={curveDimEditing}
                  onStartEdit={(v) => { setCurveDimEditValue(v); setCurveDimEditing(true); }}
                  onChange={setCurveDimEditValue} onCommit={commitCurveDimEdit} onCancel={() => setCurveDimEditing(false)}
                  onMouseDown={(e) => e.stopPropagation()}
                >{labelText}</DimensionLabel>
              </g>;
            })()}
            {/* Equidistant/Divided Points: once an entity is picked, preview
                every division node live as the count/spacing-mode/distance
                fields change — mirrors applyDivision's own t-per-point math
                so the preview never disagrees with what Apply will drop. */}
            {tool === 'point-divide' && divideTargetId && (() => {
              const g = geomById(divideTargetId);
              if (!g) return null;
              const total = curveEntityLength(g);
              const isClosed = g.kind === 'circle';
              const ts: number[] = [];
              if (divideSpacingMode === 'fixed') {
                const d = Math.max(1e-6, lenNum(divideFixedDistance) || 1);
                if (isClosed) {
                  const n = Math.max(2, Math.round(total / d));
                  for (let i = 0; i < n; i++) ts.push(i / n);
                } else {
                  let count = Math.floor(total / d + 1e-6);
                  if (count > 0 && Math.abs(count * d - total) < 1e-6) count -= 1;
                  for (let i = 1; i <= count; i++) ts.push((i * d) / (total || 1));
                }
              } else {
                const n = Math.max(2, Math.round(Number(divideCount) || 5));
                if (isClosed) { for (let i = 0; i < n; i++) ts.push(i / n); }
                else { for (let i = 1; i < n; i++) ts.push(i / n); }
              }
              return <g>{ts.map((t, i) => {
                const pos = pointAtCurveParam(g, t, false);
                return pos ? <circle key={i} cx={pos.x} cy={pos.y} r={3} className="sketch-preview-circle" /> : null;
              })}</g>;
            })()}
            {mousePt && tool === 'fillet-2d' && wizardIdsRef.current.length === 1 && (() => {
              const g1 = geomById(wizardIdsRef.current[0]);
              const hit = pickEntityAt(mousePt.x, mousePt.y);
              if (!g1 || g1.kind !== 'line' || !hit || hit.kind !== 'line' || hit.id === wizardIdsRef.current[0]) return null;
              const g2 = hit;
              const corner = infiniteLineIntersect(g1.a, g1.b, g2.a, g2.b);
              if (!corner) return null;
              const cornerIsA1 = Math.hypot(g1.a.x - corner.x, g1.a.y - corner.y) < Math.hypot(g1.b.x - corner.x, g1.b.y - corner.y);
              const cornerIsB1 = Math.hypot(g2.a.x - corner.x, g2.a.y - corner.y) < Math.hypot(g2.b.x - corner.x, g2.b.y - corner.y);
              if (tool === 'fillet-2d') {
                const radius = Math.max(1, lenNum(filletRadius) || 10);
                const result = computeFillet(g1.a, g1.b, g2.a, g2.b, cornerIsA1, cornerIsB1, radius);
                if (!result) return null;
                return <path d={describeArcPath(result.center.x, result.center.y, result.radius, result.start, result.end)} className="sketch-preview-arc" />;
              }
              return null;
            })()}
            {mousePt && tool === 'chamfer-2d' && wizardIdsRef.current.length === 1 && (() => {
              const g1 = geomById(wizardIdsRef.current[0]);
              const hit = pickCurveAt(mousePt.x, mousePt.y);
              if (!g1 || !hit || hit.id === g1.id) return null;
              const res = chamferCuts(g1, wizardPtsRef.current[0], hit, mousePt);
              if (!res) return null;
              if (!res.ok) {
                // Doesn't fit: show where it would start (if known) and why, in the warning colour.
                return <g>
                  {res.cut1 && <circle cx={res.cut1.x} cy={res.cut1.y} r={1.4} className="sketch-preview-warning" />}
                  <text x={mousePt.x + 4} y={mousePt.y - 6} className="sketch-preview-label sketch-preview-warning-text">{res.reason}</text>
                </g>;
              }
              return <g>
                <line x1={res.cut1.x} y1={res.cut1.y} x2={res.cut2.x} y2={res.cut2.y} className="sketch-preview-line-hv" />
                <circle cx={res.cut1.x} cy={res.cut1.y} r={1.4} className="sketch-preview-circle" />
                <circle cx={res.cut2.x} cy={res.cut2.y} r={1.4} className="sketch-preview-circle" />
                {(() => {
                  // Live readout: the length cut back along the first element
                  // and the chamfer's angle to it.
                  const dA = { x: res.X.x - res.cut1.x, y: res.X.y - res.cut1.y }, dC = { x: res.cut2.x - res.cut1.x, y: res.cut2.y - res.cut1.y };
                  const ang = (Math.acos(Math.max(-1, Math.min(1, (dA.x * dC.x + dA.y * dC.y) / ((Math.hypot(dA.x, dA.y) * Math.hypot(dC.x, dC.y)) || 1)))) * 180) / Math.PI;
                  const L = Math.hypot(res.cut1.x - res.X.x, res.cut1.y - res.X.y);
                  return <text x={(res.cut1.x + res.cut2.x) / 2 + 3} y={(res.cut1.y + res.cut2.y) / 2 - 3} className="sketch-preview-label">L {toU(L).toFixed(1)} · {ang.toFixed(1)}°</text>;
                })()}
              </g>;
            })()}

            {modPreview && (
              <g className="modify-preview" pointerEvents="none">
                {modPreview.bgPolys.map((poly, i) => <polyline key={`bg${i}`} points={poly.map((p) => `${p.x},${p.y}`).join(' ')} className="modify-bg" />)}
                {modPreview.bgDots.map((p, i) => <circle key={`bd${i}`} cx={p.x} cy={p.y} r={1.7} className="modify-bg-dot" />)}
                {modPreview.guides.map((g, i) => <polyline key={`g${i}`} points={g.map((p) => `${p.x},${p.y}`).join(' ')} className="modify-guide" />)}
                {modPreview.polys.map((poly, i) => <polyline key={`p${i}`} points={poly.map((p) => `${p.x},${p.y}`).join(' ')} className="modify-ghost" />)}
                {modPreview.dots.map((p, i) => <circle key={`d${i}`} cx={p.x} cy={p.y} r={1.8} className="modify-ghost-dot" />)}
                {modPreview.marks.map((p, i) => <path key={`m${i}`} d={`M ${p.x - 4} ${p.y} H ${p.x + 4} M ${p.x} ${p.y - 4} V ${p.y + 4}`} className="modify-mark" />)}
                {modPreview.arrow && (() => {
                  const [a, b] = modPreview.arrow;
                  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
                  const h = Math.min(5, L / 3);
                  return <g className="modify-arrow"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} /><polygon points={`${b.x},${b.y} ${b.x - ux * h - uy * h * 0.5},${b.y - uy * h + ux * h * 0.5} ${b.x - ux * h + uy * h * 0.5},${b.y - uy * h - ux * h * 0.5}`} /></g>;
                })()}
                {modPreview.sweep && <path d={modPreview.sweep.to >= modPreview.sweep.from ? describeArcPath(modPreview.sweep.c.x, modPreview.sweep.c.y, modPreview.sweep.r, modPreview.sweep.from, modPreview.sweep.to) : describeArcPath(modPreview.sweep.c.x, modPreview.sweep.c.y, modPreview.sweep.r, modPreview.sweep.to, modPreview.sweep.from)} className="modify-sweep" />}
                {modPreview.label && <text x={modPreview.label.at.x + 3} y={modPreview.label.at.y - 3} className="sketch-preview-label">{modPreview.label.text}</text>}
                {modPreview.warn && mousePt && <text x={mousePt.x + 4} y={mousePt.y - 6} className="sketch-preview-label sketch-preview-warning-text">{modPreview.warn}</text>}
              </g>
            )}

            {points.filter((p) => isShown(p.id)).map((p) => {
              const cls = `sketch-point ${selected.includes(p.id) ? 'sketch-selected' : ''} ${pending === p.id ? 'sketch-pending' : ''} ${isFixed(p.id) ? 'sketch-fixed' : ''} ${modProjectedIds.has(p.id) ? `sketch-point-projected ${modLostIds.has(p.id) ? 'sketch-point-lost' : ''}` : ''}`;
              if (usedPointIds.has(p.id)) return <circle key={p.id} cx={p.x} cy={p.y} r={pointRadius ?? 1.5} className={cls} />;
              const k = (pointRadius ?? 1.5) * 2;
              return <g key={p.id} className={`${cls} sketch-point-plus`}>
                <circle cx={p.x} cy={p.y} r={k} className="sketch-point-hit" />
                <path d={`M ${p.x - k} ${p.y} H ${p.x + k} M ${p.x} ${p.y - k} V ${p.y + k}`} />
              </g>;
            })}
            {dragBox && tool === 'select' && dragModeRef.current === 'box' && (() => {
              const rect = normalizeRect(dragBox);
              return <rect x={rect.minX} y={rect.minY} width={rect.maxX - rect.minX} height={rect.maxY - rect.minY}
                className="sketch-preview-rect" />;
            })()}
            {tool === 'spline' && wizardPolyPts.length > 0 && (() => {
              const last = wizardPolyPts[wizardPolyPts.length - 1];
              const len = mousePt ? Math.hypot(mousePt.x - last.x, mousePt.y - last.y) : 0;
              return <g>
                <polyline points={`${wizardPolyPts.map((p) => `${p.x},${p.y}`).join(' ')}${mousePt ? ` ${mousePt.x},${mousePt.y}` : ''}`} className="sketch-preview-line" fill="none" />
                {mousePt && <text x={(last.x + mousePt.x) / 2} y={(last.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(len).toFixed(1)}</text>}
              </g>;
            })()}
            {tool === 'profile' && profileChain && mousePt && (() => {
              // The next segment of the chain, in whichever mode is active.
              const last = pointById.get(profileChain.lastId);
              if (!last) return null;
              if (profileSegMode === 'tangent-arc' && profileChain.lastDir) {
                const arc = tangentArcFrom(last, profileChain.lastDir, mousePt);
                return arc ? <path d={describeArcPath(arc.cx, arc.cy, arc.r, arc.start, arc.end)} className="sketch-preview-arc" /> : null;
              }
              if (profileSegMode === 'arc-3pt' && profileThroughRef.current) {
                const arc = threePtArcFrom(last, profileThroughRef.current, mousePt);
                return arc ? <path d={describeArcPath(arc.cx, arc.cy, arc.r, arc.start, arc.end)} className="sketch-preview-arc" /> : null;
              }
              const len = Math.hypot(mousePt.x - last.x, mousePt.y - last.y);
              return <g>
                <line x1={last.x} y1={last.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />
                {profileSegMode === 'line' && <text x={(last.x + mousePt.x) / 2} y={(last.y + mousePt.y) / 2 - 4} className="sketch-preview-label">{toU(len).toFixed(1)}</text>}
              </g>;
            })()}
            {tool === 'line-infinite' && mousePt && (() => {
              const first = wizardPtsRef.current[0];
              const [a, b] = infiniteMode === 'h' ? [mousePt, { x: mousePt.x + 1, y: mousePt.y }]
                : infiniteMode === 'v' ? [mousePt, { x: mousePt.x, y: mousePt.y + 1 }]
                : first && Math.hypot(mousePt.x - first.x, mousePt.y - first.y) > 1e-6 ? [first, mousePt] : [null, null];
              if (!a || !b) return null;
              const [e1, e2] = infiniteLineEndpoints(a, b);
              return <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} className="sketch-preview-line" />;
            })()}
            {tool === 'line-bitangent' && mousePt && wizardIdsRef.current.length === 1 && (() => {
              const g1 = geomById(wizardIdsRef.current[0]);
              const hit = pickCurveAt(mousePt.x, mousePt.y);
              if (!isCurved(g1) || !isCurved(hit) || hit.id === g1.id) return null;
              const res = biTangentFor(g1, hit, wizardPtsRef.current[0], mousePt);
              return res ? <line x1={res.t1.x} y1={res.t1.y} x2={res.t2.x} y2={res.t2.y} className="sketch-preview-line" /> : null;
            })()}
            {tool === 'line-bisect' && mousePt && wizardIdsRef.current.length === 1 && (() => {
              const g1 = geomById(wizardIdsRef.current[0]);
              const hit = pickCurveAt(mousePt.x, mousePt.y);
              if (!g1 || g1.kind !== 'line' || !hit || hit.kind !== 'line' || hit.id === g1.id) return null;
              const res = bisectingLine(g1.a, g1.b, hit.a, hit.b, wizardPtsRef.current[0], mousePt);
              if (!res) return null;
              const [e1, e2] = infiniteLineEndpoints(res.p, { x: res.p.x + res.dir.x, y: res.p.y + res.dir.y });
              return <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} className="sketch-preview-line" />;
            })()}
            {tool === 'select' && trapPoly.length > 0 && (
              <polyline points={`${trapPoly.map((p) => `${p.x},${p.y}`).join(' ')}${mousePt ? ` ${mousePt.x},${mousePt.y}` : ''}`} className="sketch-preview-rect" />
            )}
            {tool === 'select' && paintStroke && paintStroke.length > 1 && (
              <polyline points={paintStroke.map((p) => `${p.x},${p.y}`).join(' ')} className="sketch-preview-rect" />
            )}
            {tool === 'line-normal' && lineNormalPointFirst && lineNormalStart && mousePt && (() => {
              const g = pickCurveAt(mousePt.x, mousePt.y);
              if (!g || g.kind === 'point') return <line x1={lineNormalStart.x} y1={lineNormalStart.y} x2={mousePt.x} y2={mousePt.y} className="sketch-preview-line" />;
              const foot = computeNormalFoot(g, lineNormalStart.x, lineNormalStart.y);
              return <line x1={lineNormalStart.x} y1={lineNormalStart.y} x2={foot.x} y2={foot.y} className="sketch-preview-line-hv" />;
            })()}
            {showCursorCoords && tool !== 'select' && tool !== 'hide-show' && cursorPosRef.current && !viewGesture && (
              // CATIA shows the cursor's coordinates just above it while a
              // sketching tool is active (guide L1000-1002).
              <text x={cursorPosRef.current.x + 4} y={cursorPosRef.current.y - 5} className="sketch-cursor-coords">
                H {toU(cursorPosRef.current.x - SKETCH_ORIGIN.x).toFixed(2)}  V {toU(SKETCH_ORIGIN.y - cursorPosRef.current.y).toFixed(2)}
              </text>
            )}
            {dimensions.map(renderDimension)}
            {selectionPreview?.kind === 'single' && renderSinglePreview(selectionPreview.g)}
            {selectionPreview?.kind === 'pair' && renderPairPreview(selectionPreview.gA, selectionPreview.gB, selectionPreview.attached)}
            </g>
            {zoomAreaBox && (() => {
              const r = normalizeRect(zoomAreaBox);
              return <rect x={r.minX} y={r.minY} width={r.maxX - r.minX} height={r.maxY - r.minY} className="sketch-preview-rect" />;
            })()}
          </svg>
        </div>
    </>
  );
}
