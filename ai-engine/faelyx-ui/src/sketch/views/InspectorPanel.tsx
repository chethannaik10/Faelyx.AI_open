// The SKETCH INSPECTOR panel (right): status, the selection editor and per-tool settings.
import {
  Crosshair, ArrowLeftRight,
  Ruler, Trash2, Settings2, PanelRight,
  X, GitFork,
  Workflow, Grip } from 'lucide-react';
import { PanelHeaderLite } from '../PlanePicker';

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
import type { PointFeatureMidpoint } from '../useSketchCore';
import { ConstraintValues } from './ConstraintValues';
import { ChamferPanel } from './ChamferPanel';
import { LinkedGroupPanel } from './LinkedGroupPanel';
import { ToolCard } from './ToolCard';
import HowToUse from '../../HowToUse';
import { guide2D, START_2D } from '../howTo2D';

// Tools whose own long-standing Inspector controls become the card's Parameters.
const OWN_PANEL_TOOLS = new Set(['point-coord', 'point-oncurve', 'point-midpoint', 'point-divide', 'line-normal', 'line-symmetric']);
import type { SketchUI } from '../handlers';

export function InspectorPanel({ core }: { core: SketchUI }) {
  const {
    SKETCH_ORIGIN, applyCoordPoint, applyCurveOffset, applyDivision, applyLineNormal, applyLineSymmetric, arcs, circles, commitArcEnd, commitArcRadius, commitArcStart, commitCircleRadius, commitCurveRho, commitCurveRot, commitCurveRx, commitCurveRy, commitCurveSpan, commitLineAngle, commitLineLength, commitPointPosition, constraints, coordMode, coordR, coordTheta, coordX, coordY, curveDistInputRef, curveOffsetMode, curveOffsetValue, curveRef, curveTargetId, curves, deleteSelected, divideCount, divideFixedDistance, divideSpacingMode, divideTargetId, dof, dofClass, editBuffer, editingGroupId, editingPointId, error, importError, lineAnchor, lineAngleDeg, lineLength, lineNormalDistInputRef, lineNormalDistance, lineNormalReverse, lineNormalSymmetric, lineNormalTargetId, lineSymAnchor, lineSymDistance, lines, measureFirstRef, measureResult, plane, pointFeaturesRef, points, relationsFor, removeConstraint, selected, selectedArc, selectedCircle, selectedCurve, selectedLine, selectedPoint, selectedSingleId, setCoordMode, setCoordR, setCoordTheta, setCoordX, setCoordY, setCurveOffsetMode, setCurveOffsetValue, setCurveRef, setDivideCount, setDivideFixedDistance, setDivideSpacingMode, setEditBuffer, setLineAnchor, setLineNormalDistance, setLineNormalReverse, setLineNormalSymmetric, setLineSymDistance, setMeasureResult, setSelected, setShowConstraintsList, showConstraintsList, showLabel, toU, tool, toolboxPick, uLabel,
  } = core;
  return (
    <aside className="inspector-panel">
      <PanelHeaderLite eyebrow="FAELYX INTELLIGENCE" title="SKETCH INSPECTOR" action={<PanelRight size={14} />} />
      <div className="property-content">
        <div className="property-title"><Settings2 size={14} /><span><div className="eyebrow">STATUS</div><strong>{dof === null ? 'Empty sketch' : status}</strong></span></div>
        {/* The active toolbox pick, in the standard Tool / Status / Parameters /
            References layout (views/ToolCard.tsx). The Point and Line flyout
            tools keep their own controls, passed in as the card's Parameters. */}
        <ToolCard core={core}>{OWN_PANEL_TOOLS.has(tool) && !toolboxPick ? (<>
        {/* Full duplicate of each sub-mode's bottom-bar controls, wired to
            the exact same state/apply-functions (applyCoordPoint,
            applyCurveOffset, applyDivision) — so the Inspector card is a
            fully working control surface on its own, not just a label,
            per "dynamically populates all relevant parameters, controls,
            and buttons inside the Sketch Inspector card rather than
            relying solely on the bottom bar." The bottom bar stays too
            (kept in sync automatically, same state) since the spec's own
            Bottom Bar Accessibility section still expects it there. */}
        {tool === 'point-coord' && (
          <div className="property-group" style={{ borderBottom: 'none' }}>
            <span className="anchor-toggle">
              <button type="button" className={coordMode === 'cartesian' ? 'anchor-active' : ''} onClick={() => setCoordMode('cartesian')}>Cartesian</button>
              <button type="button" className={coordMode === 'polar' ? 'anchor-active' : ''} onClick={() => setCoordMode('polar')}>Polar</button>
            </span>
            {coordMode === 'cartesian' ? (
              <>
                <label className="property-input">X-Offset ({uLabel})
                  <input type="number" value={coordX} onChange={(event) => setCoordX(event.target.value)} />
                </label>
                <label className="property-input">Y-Offset ({uLabel})
                  <input type="number" value={coordY} onChange={(event) => setCoordY(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyCoordPoint(); } }} />
                </label>
              </>
            ) : (
              <>
                <label className="property-input">Radius R ({uLabel})
                  <input type="number" value={coordR} onChange={(event) => setCoordR(event.target.value)} />
                </label>
                <label className="property-input">Angle θ (°)
                  <input type="number" value={coordTheta} onChange={(event) => setCoordTheta(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyCoordPoint(); } }} />
                </label>
              </>
            )}
            <button className="outline-action" onClick={applyCoordPoint}><Crosshair size={12} /> {editingPointId ? 'Update Point' : 'Apply / Create Point'}</button>
            <div className="sketch-hint">{editingPointId ? 'Editing an existing point — Enter or the button updates it in place.' : `Relative to the active sketch origin on the ${plane} plane.`}</div>
          </div>
        )}
        {tool === 'point-oncurve' && (
          <div className="property-group" style={{ borderBottom: 'none' }}>
            <span className="anchor-toggle">
              <button type="button" className={curveRef === 'start' ? 'anchor-active' : ''} onClick={() => setCurveRef('start')}>Start Point</button>
              <button type="button" className={curveRef === 'end' ? 'anchor-active' : ''} onClick={() => setCurveRef('end')}>End Point</button>
            </span>
            <span className="anchor-toggle">
              <button type="button" className={curveOffsetMode === 'length' ? 'anchor-active' : ''} onClick={() => setCurveOffsetMode('length')}>Length</button>
              <button type="button" className={curveOffsetMode === 'percent' ? 'anchor-active' : ''} onClick={() => setCurveOffsetMode('percent')}>%</button>
            </span>
            <label className="property-input">Length {curveOffsetMode === 'percent' ? '(%)' : `(${uLabel})`}
              <input ref={curveDistInputRef} type="number" value={curveOffsetValue} onChange={(event) => setCurveOffsetValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && curveTargetId) { event.preventDefault(); applyCurveOffset(); } }} />
            </label>
            <button className="outline-action" onClick={() => setCurveRef((r) => (r === 'start' ? 'end' : 'start'))}><ArrowLeftRight size={12} /> Flip Direction</button>
            <button className="outline-action" onClick={applyCurveOffset} disabled={!curveTargetId}><Crosshair size={12} /> {editingPointId ? 'Update Point' : 'Apply / Create Point'}</button>
            <div className="sketch-hint">
              {editingPointId ? 'Editing an existing point — Enter or the button updates it in place.'
                : curveTargetId ? 'Preview shown on the canvas — type the exact length (or double-click its on-canvas text), then Enter or the button to place it.'
                : 'Click a line, arc, circle, spline, or edge on the canvas to select it.'}
            </div>
          </div>
        )}
        {tool === 'point-midpoint' && (
          <div className="property-group" style={{ borderBottom: 'none' }}>
            {selected.length === 1 && pointFeaturesRef.current[selected[0]]?.mode === 'point-midpoint' ? (() => {
              const feature = pointFeaturesRef.current[selected[0]] as PointFeatureMidpoint;
              const parentLabel = feature.parentEntityId
                ? `Parent entity: ${feature.parentEntityId}`
                : feature.parentAId && feature.parentBId
                  ? `Parent points: ${feature.parentAId} / ${feature.parentBId}`
                  : 'Parent reference unavailable';
              return <>
                <div className="sketch-hint">{parentLabel}</div>
                <div className="sketch-hint">Status: Locked (Midpoint) — always 50% along its parent, read-only.</div>
              </>;
            })() : (
              <div className="sketch-hint">Click a single line, arc, axis, or curve segment — its exact midpoint is detected automatically. Click two existing points instead to drop one exactly between them. Double-click an existing midpoint to view its parent reference here.</div>
            )}
          </div>
        )}
        {tool === 'point-divide' && (
          <div className="property-group" style={{ borderBottom: 'none' }}>
            <span className="anchor-toggle">
              <button type="button" className={divideSpacingMode === 'equal' ? 'anchor-active' : ''} onClick={() => setDivideSpacingMode('equal')}>Equal Divisions</button>
              <button type="button" className={divideSpacingMode === 'fixed' ? 'anchor-active' : ''} onClick={() => setDivideSpacingMode('fixed')}>Fixed Length</button>
            </span>
            {divideSpacingMode === 'equal' ? (
              <label className="property-input">Divisions
                <input type="number" min={2} value={divideCount} onChange={(event) => setDivideCount(event.target.value)} />
              </label>
            ) : (
              <label className="property-input">Spacing ({uLabel})
                <input type="number" min={0.1} value={divideFixedDistance} onChange={(event) => setDivideFixedDistance(event.target.value)} />
              </label>
            )}
            <button className="outline-action" onClick={applyDivision} disabled={!divideTargetId}><Grip size={12} /> {editingGroupId ? 'Update Points' : 'Add points'}</button>
            <div className="sketch-hint">
              {editingGroupId ? 'Editing an existing divided set — Enter or the button regenerates it in place.'
                : divideTargetId ? 'Entity selected — Enter or the button to drop the points.'
                : 'Click a line, circle, arc, spline, or edge on the canvas to select it.'}
            </div>
          </div>
        )}
        {tool === 'line-normal' && (
          <div className="property-group" style={{ borderBottom: 'none' }}>
            <label className="property-input">Length ({uLabel})
              <input ref={lineNormalDistInputRef} type="number" value={lineNormalDistance} placeholder="Eyeballed"
                onChange={(event) => setLineNormalDistance(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && lineNormalTargetId) { event.preventDefault(); applyLineNormal(); } }} />
            </label>
            <span className="anchor-toggle">
              <span className="live-dim-label">Reverse:</span>
              <button type="button" className={!lineNormalReverse ? 'anchor-active' : ''} onClick={() => setLineNormalReverse(false)}>Off</button>
              <button type="button" className={lineNormalReverse ? 'anchor-active' : ''} onClick={() => setLineNormalReverse(true)}>On</button>
            </span>
            <span className="anchor-toggle">
              <span className="live-dim-label">Symmetrical Extension:</span>
              <button type="button" className={!lineNormalSymmetric ? 'anchor-active' : ''} onClick={() => setLineNormalSymmetric(false)}>Off</button>
              <button type="button" className={lineNormalSymmetric ? 'anchor-active' : ''} onClick={() => setLineNormalSymmetric(true)}>On</button>
            </span>
            <button className="outline-action" onClick={() => applyLineNormal()} disabled={!lineNormalTargetId}><Workflow size={12} /> Apply / Create Line</button>
            <div className="sketch-hint">
              {lineNormalTargetId ? 'Preview shown on the canvas — leave Length blank to place it where you click (or double-click the on-canvas text), or type an exact length, then Enter or the button to place it.'
                : 'Click a line, circle, or arc on the canvas to select it.'}
            </div>
          </div>
        )}
        {tool === 'line-symmetric' && (
          <div className="property-group" style={{ borderBottom: 'none' }}>
            <label className="property-input">Length ({uLabel})
              <input type="number" value={lineSymDistance} placeholder="Eyeballed"
                onChange={(event) => setLineSymDistance(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && lineSymAnchor) { event.preventDefault(); applyLineSymmetric(); } }} />
            </label>
            <button className="outline-action" onClick={() => applyLineSymmetric()} disabled={!lineSymAnchor}><Grip size={12} /> Apply / Create Line</button>
            <div className="sketch-hint">
              {lineSymAnchor ? 'Preview shown on the canvas — leave Length blank to place it where you click (or double-click the on-canvas text), or type an exact total length, then Enter or the button to place it.'
                : 'Click anywhere on the canvas, or on an existing curve/entity, to set the anchor it will expand out from.'}
            </div>
          </div>
        )}
        </>) : null}</ToolCard>
        {dof !== null && (
          <div className="property-group">
            <div><span>Degrees of freedom</span><b>{dof}</b></div>
            <div><span>Points / Lines / Circles</span><b>{points.length} / {lines.length} / {circles.length}</b></div>
            <div>
              <span>Constraints applied</span>
              <b>
                {constraints.length}
                {constraints.length > 0 && (
                  <button className="constraints-toggle" onClick={() => setShowConstraintsList((v) => !v)}>
                    {showConstraintsList ? 'Hide' : 'View'}
                  </button>
                )}
              </b>
            </div>
          </div>
        )}
        {showConstraintsList && constraints.length > 0 && (
          <div className="property-group constraints-list" style={{ borderBottom: 'none' }}>
            <div className="eyebrow">CONSTRAINTS — click to select, ✕ to delete{dofClass === 'over' ? ' (over-constrained — remove one)' : ''}</div>
            <div className="constraints-scroll">
              {constraints.map((c) => (
                <div key={c.id} className={`insp-constraint-row ${selected.length > 0 && Object.values(c.args).some((v) => selected.includes(v as string)) ? 'insp-constraint-row-active' : ''}`}>
                  <button className="insp-constraint-select" onClick={() => {
                    const ids = Object.values(c.args).filter((v): v is string => typeof v === 'string' && (points.some((p) => p.id === v) || lines.some((l) => l.id === v) || circles.some((ci) => ci.id === v) || arcs.some((a) => a.id === v) || curves.some((cv) => cv.id === v)));
                    setSelected(ids);
                  }}>{showLabel(c.label)}</button>
                  <button className="insp-constraint-delete" aria-label={`Delete ${c.label}`} onClick={() => removeConstraint(c.id)}><X size={11} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* A solver-unreachable message (see describeSolveError) is routine,
            not a crash — sketching keeps working — so it gets the calmer
            amber "notice" treatment instead of the red error block a real
            solve failure gets. */}
        {error && <div className={error.startsWith('Solver offline') ? 'sketch-notice' : 'sketch-error'}>{error}</div>}
        {importError && (
          <div className={importError.startsWith('Solver offline') ? 'sketch-notice' : 'sketch-error'}>
            {importError.startsWith('Solver offline') ? importError : `Image import failed: ${importError}`}
          </div>
        )}
        {measureResult && !tool.startsWith('measure') && (
          <div className="property-group" style={{ borderBottom: 'none' }}>
            <div className="measurement-header">
              <span><Ruler size={11} /> {measureResult.kind === 'between' ? 'MEASURE BETWEEN' : 'MEASURE ITEM'}</span>
              <button onClick={() => { setMeasureResult(null); measureFirstRef.current = null; setSelected([]); }}>Clear</button>
            </div>
            <div className="measurement-grid">
              {measureResult.lines.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}
            </div>
          </div>
        )}
        {selected.length > 0 && (
          <div className="property-group" style={{ borderBottom: 'none' }} data-edit-group>
            <div className="eyebrow">SELECTED ({selected.length})</div>
            {selectedSingleId && (() => {
              const relations = relationsFor(selectedSingleId);
              if (relations.parents.length === 0 && relations.children.length === 0 && relations.constraints.length === 0) return null;
              // CATIA Workbook's Parents/Children tool — read-only, click a
              // listed relation to select it (same select-and-highlight
              // gesture the Constraints list above uses).
              return (
                <div className="relations-panel">
                  <div className="eyebrow"><GitFork size={10} /> PARENTS / CHILDREN</div>
                  {relations.parents.length > 0 && (
                    <div className="relations-row"><span>Built from</span>
                      {relations.parents.map((r) => <button key={r.id} onClick={() => setSelected([r.id])}>{r.label}</button>)}
                    </div>
                  )}
                  {relations.children.length > 0 && (
                    <div className="relations-row"><span>Used by</span>
                      {relations.children.map((r) => <button key={r.id} onClick={() => setSelected([r.id])}>{r.label}</button>)}
                    </div>
                  )}
                  {relations.constraints.length > 0 && (
                    <div className="relations-row"><span>Constrained by</span>
                      {relations.constraints.map((r) => <button key={r.id} onClick={() => setSelected(Object.values(constraints.find((c) => c.id === r.id)?.args ?? {}).filter((v): v is string => typeof v === 'string'))}>{r.label}</button>)}
                    </div>
                  )}
                </div>
              );
            })()}
            <LinkedGroupPanel core={core} />
            {selectedPoint && (
              <>
                <label className="property-input">X ({uLabel})
                  <input type="number" value={editBuffer.x ?? toU(selectedPoint.x - SKETCH_ORIGIN.x).toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, x: event.target.value }))}
                    onBlur={commitPointPosition}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitPointPosition(); } }} />
                </label>
                <label className="property-input">Y ({uLabel})
                  <input type="number" value={editBuffer.y ?? toU(SKETCH_ORIGIN.y - selectedPoint.y).toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, y: event.target.value }))}
                    onBlur={commitPointPosition}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitPointPosition(); } }} />
                </label>
              </>
            )}
            {selectedLine && (
              <>
                <div className="property-input">Anchor (stays put)
                  <span className="anchor-toggle">
                    <button type="button" className={lineAnchor === 'p1' ? 'anchor-active' : ''} onClick={() => setLineAnchor('p1')}>Start</button>
                    <button type="button" className={lineAnchor === 'p2' ? 'anchor-active' : ''} onClick={() => setLineAnchor('p2')}>End</button>
                    <button type="button" className={lineAnchor === 'center' ? 'anchor-active' : ''} onClick={() => setLineAnchor('center')}>Center</button>
                  </span>
                </div>
                <label className="property-input">Length ({uLabel})
                  <input type="number" value={editBuffer.length ?? toU(lineLength(selectedLine)).toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, length: event.target.value }))}
                    onBlur={commitLineLength}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitLineLength(); } }} />
                </label>
                <label className="property-input">Angle (°)
                  <input type="number" value={editBuffer.angle ?? lineAngleDeg(selectedLine).toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, angle: event.target.value }))}
                    onBlur={commitLineAngle}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitLineAngle(); } }} />
                </label>
              </>
            )}
            {selectedLine && <ChamferPanel core={core} lineId={selectedLine.id} />}
            {selectedCircle && (
              <label className="property-input">Radius ({uLabel})
                <input type="number" value={editBuffer.radius ?? toU(selectedCircle.r).toFixed(2)}
                  onChange={(event) => setEditBuffer((b) => ({ ...b, radius: event.target.value }))}
                  onBlur={commitCircleRadius}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitCircleRadius(); } }} />
              </label>
            )}
            {selectedArc && (
              <>
                <label className="property-input">Radius ({uLabel})
                  <input type="number" value={editBuffer.radius ?? toU(selectedArc.r).toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, radius: event.target.value }))}
                    onBlur={commitArcRadius}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitArcRadius(); } }} />
                </label>
                <label className="property-input">Start angle (°)
                  <input type="number" value={editBuffer.arcStart ?? selectedArc.start.toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, arcStart: event.target.value }))}
                    onBlur={commitArcStart}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitArcStart(); } }} />
                </label>
                <label className="property-input">End angle (°)
                  <input type="number" value={editBuffer.arcEnd ?? selectedArc.end.toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, arcEnd: event.target.value }))}
                    onBlur={commitArcEnd}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitArcEnd(); } }} />
                </label>
                <div className="sketch-hint">The center point above is a real, constrainable point — radius/sweep constraints for arcs are a later pass.</div>
              </>
            )}
            {selectedCurve && selectedCurve.kind === 'ellipse' && (
              <>
                <label className="property-input">Major radius — rx ({uLabel})
                  <input type="number" value={editBuffer.curveRx ?? toU(selectedCurve.rx).toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, curveRx: event.target.value }))}
                    onBlur={commitCurveRx}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitCurveRx(); } }} />
                </label>
                <label className="property-input">Minor radius — ry ({uLabel})
                  <input type="number" value={editBuffer.curveRy ?? toU(selectedCurve.ry).toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, curveRy: event.target.value }))}
                    onBlur={commitCurveRy}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitCurveRy(); } }} />
                </label>
                <label className="property-input">Rotation (°)
                  <input type="number" value={editBuffer.curveRot ?? ((selectedCurve.rot * 180) / Math.PI).toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, curveRot: event.target.value }))}
                    onBlur={commitCurveRot}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitCurveRot(); } }} />
                </label>
                <div className="sketch-hint">The center point above is a real, constrainable point — rx/ry/rotation are edited directly, the same phase-1 approach as an Arc's own radius/sweep.</div>
              </>
            )}
            {selectedCurve && selectedCurve.kind === 'parabola' && (
              <>
                <label className="property-input">Span ({uLabel})
                  <input type="number" value={editBuffer.curveSpan ?? toU(selectedCurve.span).toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, curveSpan: event.target.value }))}
                    onBlur={commitCurveSpan}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitCurveSpan(); } }} />
                </label>
                <div className="sketch-hint">The focus and vertex points above are real, constrainable points — moving either reshapes the parabola live.</div>
              </>
            )}
            {selectedCurve && selectedCurve.kind === 'hyperbola' && (
              <div className="sketch-hint">Defined entirely by its center, focus and vertex points above — all three are real, constrainable points; move any of them and the branch redraws live.</div>
            )}
            {selectedCurve && selectedCurve.kind === 'spline' && (
              <div className="sketch-hint">{selectedCurve.controlIds.length} control points, all real and constrainable — move any of them and the spline redraws live.</div>
            )}
            {selectedCurve && selectedCurve.kind === 'conic' && (
              <div className="sketch-hint">Fitted through {selectedCurve.ptIds.length} real, constrainable points — move any of them and the conic refits live.</div>
            )}
            {selectedCurve && selectedCurve.kind === 'spline-cv' && (
              <div className="sketch-hint">{selectedCurve.controlIds.length} control vertices, all real and constrainable — the curve is a clamped uniform cubic B-spline pulled toward them (it doesn't pass through the interior ones, unlike the interpolating Spline).</div>
            )}
            {selectedCurve && selectedCurve.kind === 'conic-rp' && (
              <>
                <label className="property-input">Shape parameter — Rho
                  <input type="number" min={0.02} max={0.98} step={0.01} value={editBuffer.curveRho ?? selectedCurve.rho.toFixed(2)}
                    onChange={(event) => setEditBuffer((b) => ({ ...b, curveRho: event.target.value }))}
                    onBlur={commitCurveRho}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitCurveRho(); } }} />
                </label>
                <div className="sketch-hint">The start, apex and end points above are real, constrainable points — Rho (0–1) sweeps the conic from near-flat toward the apex; 0.5 is a parabola-like curve.</div>
              </>
            )}
            {selectedSingleId && <ConstraintValues core={core} id={selectedSingleId} />}
            {selected.length === 1 && <div className="sketch-hint">Double-click an element to edit it; type a value and press Enter. Ctrl/⌘+Z undo · Ctrl/⌘+Y redo · Ctrl/⌘+C, X, V copy, cut, paste.</div>}
            {!selectedPoint && !selectedLine && !selectedCircle && !selectedArc && !selectedCurve && (
              <div className="sketch-hint">{selected.length} entities selected — pick a constraint from the toolbox, or delete them.</div>
            )}
            <button className="outline-action danger" onClick={deleteSelected}>
              <Trash2 size={12} /> Delete selected{selected.length > 1 ? ` (${selected.length})` : ''}
            </button>
          </div>
        )}
        {!error && selected.length === 0 && dof === null && <div className="sketch-hint">Pick Point/Line/Circle from the toolbox and click the canvas to start sketching, or click "Load example" for a working rectangle + two mounting holes.</div>}
      </div>
      <HowToUse guide={tool === 'select' && !toolboxPick && dof === null ? START_2D : guide2D(tool, toolboxPick)} />
    </aside>
  );
}
