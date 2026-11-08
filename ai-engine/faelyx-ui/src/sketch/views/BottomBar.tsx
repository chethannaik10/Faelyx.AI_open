// The canvas's bottom bar: the active tool's typed-value fields, toggles and prompt.
import {
  Ruler, RefreshCw, X } from 'lucide-react';
import { NEW_TOOL_HINTS } from '../tools';

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
import type { SketchUI } from '../handlers';

export function BottomBar({ core }: { core: SketchUI }) {
  const {
    applyCoordPoint, applyCurveOffset, applyDivision, applyLineNormal, applyLineSymmetric, applySuggestedDistance, arcs, cancelPending, cancelPendingConstraint, chamferAngle, chamferDistA, chamferDistB, chamferMode, chamferIssue, circCoordR, circCoordX, circCoordY, circle3ptR, circles, commitCircleCoord, commitLiveValue, commitPendingConstraint, commitTypedCircle, commitTypedEnd, commitTypedQuad, commitTypedStart, conicRho, coordMode, coordR, coordTheta, coordX, coordY, curveOffsetMode, curveOffsetValue, curveRef, curveTargetId, curves, dismissImportSummary, divideCount, divideFixedDistance, divideSpacingMode, divideTargetId, dragModeRef, editingGroupId, editingPointId, filletRadius, importSummary, importing, infiniteMode, lineNormalDistance, lineNormalPointFirst, lineNormalReverse, lineNormalStart, lineNormalSymmetric, lineNormalTargetId, lineSymAnchor, lineSymDistance, lineSymToggle, lines, liveInputRef, liveValue, measureFirstRef, numAngle, numEndH, numEndV, numHeight, numRadius, numSkew, numStartH, numStartV, numWidth, pending, pendingConstraint, points, polygonCircumscribed, polygonSides, profileChain, profileClosed, profileSegMode, profileThroughRef, selected, setChamferAngle, setChamferDistA, setChamferDistB, setChamferMode, setChamferIssue, setCircCoordR, setCircCoordX, setCircCoordY, setCircle3ptR, setCircleDefOpen, setConicRho, setCoordMode, setCoordR, setCoordTheta, setCoordX, setCoordY, setCurveOffsetMode, setCurveOffsetValue, setCurveRef, setDivideCount, setDivideFixedDistance, setDivideSpacingMode, setFilletRadius, setInfiniteMode, setIsEditingLive, setLineNormalDistance, setLineNormalPointFirst, setLineNormalReverse, setLineNormalStart, setLineNormalSymmetric, setLineNormalTargetId, setLineSymDistance, setLineSymToggle, setLiveValue, setNumAngle, setNumEndH, setNumEndV, setNumHeight, setNumRadius, setNumSkew, setNumStartH, setNumStartV, setNumWidth, setPaintStroke, setPendingConstraint, setPolygonCircumscribed, setPolygonSides, setProfileClosed, setProfileSegMode, setTrapMode, setTrapPoly, swapSpace, toU, tool, trapMode, trapPoly, uLabel, undoImport, unitMm, wizardPtsRef,
  } = core;
  return (
        <div className="viewport-hint">
          {importSummary ? (
            <div className="import-bar">
              <div className="import-bar-row">
                <span className="import-bar-notes">
                  Imported — {importSummary.notes}
                  {' — '}{importSummary.counts.points} point{importSummary.counts.points === 1 ? '' : 's'}, {importSummary.counts.lines} line{importSummary.counts.lines === 1 ? '' : 's'}, {importSummary.counts.circles} circle{importSummary.counts.circles === 1 ? '' : 's'}
                  {importSummary.counts.arcs ? `, ${importSummary.counts.arcs} arc${importSummary.counts.arcs === 1 ? '' : 's'}` : ''}
                  {importSummary.counts.curves ? `, ${importSummary.counts.curves} spline${importSummary.counts.curves === 1 ? '' : 's'}` : ''}
                  {importSummary.aiUsed || importSummary.notes.startsWith('Image to Sketch') ? '' : ' (AI review not configured — geometry only, no dimension reading)'}
                </span>
                <span className="import-bar-actions">
                  <button type="button" className="import-undo" onClick={undoImport}><RefreshCw size={12} /> Undo import</button>
                  <button type="button" onClick={dismissImportSummary}><X size={12} /> Dismiss</button>
                </span>
              </div>
              {importSummary.suggestedDimensions.length > 0 && (
                <div className="import-suggestions">
                  <span className="import-suggestions-label"><Ruler size={11} /> Suggested dimensions:</span>
                  {importSummary.suggestedDimensions.map((sd) => (
                    <button key={`${sd.p1}-${sd.p2}-${sd.label}`} type="button" className="suggestion-chip" onClick={() => applySuggestedDistance(sd)}>
                      {sd.label}: {toU(sd.valueMm).toFixed(unitMm === 1 ? 1 : 3)}{uLabel}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : importing ? (
            <span>Analyzing image…</span>
          ) : tool === 'line' || tool === 'circle' || tool === 'axis-construction' ? (
            // The guide's expanded Sketch tools row for Line / Circle / Axis:
            // Start (or Center) H/V before the first click, then Length +
            // Angle or End H/V (Radius for a circle) once it's placed.
            <div className="live-dim">
              {!pending ? (
                <>
                  <span className="live-dim-label">{tool === 'circle' ? 'Center' : 'Start'} H ({uLabel})</span>
                  <input type="number" value={numStartH} onChange={(event) => setNumStartH(event.target.value)} />
                  <span className="live-dim-label">V ({uLabel})</span>
                  <input
                    type="number" value={numStartV} onChange={(event) => setNumStartV(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (tool === 'circle') commitTypedCircle(); else commitTypedStart(); } }}
                  />
                  {tool === 'circle' && (
                    <>
                      <span className="live-dim-label">R ({uLabel})</span>
                      <input
                        type="number" value={numRadius} onChange={(event) => setNumRadius(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitTypedCircle(); } }}
                      />
                      <button type="button" className="import-undo" onClick={commitTypedCircle}>Add circle</button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span className="live-dim-label">{tool === 'circle' ? 'Radius' : 'Length'} ({uLabel})</span>
                  {tool !== 'axis-construction' && (
                    <input
                      ref={liveInputRef}
                      type="number"
                      value={liveValue}
                      onFocus={() => setIsEditingLive(true)}
                      onBlur={() => setIsEditingLive(false)}
                      onChange={(event) => setLiveValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); commitLiveValue(); }
                        else if (event.key === 'Escape') { event.preventDefault(); cancelPending(); }
                      }}
                    />
                  )}
                  {tool === 'line' && (
                    <>
                      <span className="live-dim-label">Angle (°)</span>
                      <input
                        type="number" placeholder="Cursor" value={numAngle} onChange={(event) => setNumAngle(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitLiveValue(); } }}
                      />
                    </>
                  )}
                  {tool !== 'circle' && (
                    <>
                      <span className="live-dim-label">End H</span>
                      <input type="number" value={numEndH} onChange={(event) => setNumEndH(event.target.value)} />
                      <span className="live-dim-label">V</span>
                      <input
                        type="number" value={numEndV} onChange={(event) => setNumEndV(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitTypedEnd(); } }}
                      />
                    </>
                  )}
                </>
              )}
              {tool === 'line' && (
                <span className="anchor-toggle">
                  <span className="live-dim-label">Symmetrical:</span>
                  <button type="button" className={!lineSymToggle ? 'anchor-active' : ''} onClick={() => setLineSymToggle(false)}>Off</button>
                  <button type="button" className={lineSymToggle ? 'anchor-active' : ''} onClick={() => setLineSymToggle(true)}>On</button>
                </span>
              )}
              <span className="live-dim-hint">{pending ? 'Enter to confirm · Esc to cancel' : `Click the canvas, or type values and press Enter${tool === 'line' && lineSymToggle ? ' — the first point is the midpoint' : ''}`}</span>
            </div>
          ) : tool === 'rectangle' || tool === 'rect-oriented' || tool === 'rect-parallelogram' ? (
            <div className="live-dim">
              <span className="live-dim-label">Corner H ({uLabel})</span>
              <input type="number" value={numStartH} onChange={(event) => setNumStartH(event.target.value)} />
              <span className="live-dim-label">V ({uLabel})</span>
              <input type="number" value={numStartV} onChange={(event) => setNumStartV(event.target.value)} />
              <span className="live-dim-label">Width</span>
              <input type="number" value={numWidth} onChange={(event) => setNumWidth(event.target.value)} />
              <span className="live-dim-label">Height</span>
              <input
                type="number" value={numHeight} onChange={(event) => setNumHeight(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitTypedQuad(); } }}
              />
              {(tool === 'rect-oriented' || tool === 'rect-parallelogram') && (
                <>
                  <span className="live-dim-label">A (°)</span>
                  <input
                    type="number" placeholder="0" value={numAngle} onChange={(event) => setNumAngle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitTypedQuad(); } }}
                  />
                </>
              )}
              {tool === 'rect-parallelogram' && (
                <>
                  <span className="live-dim-label">Angle (°)</span>
                  <input
                    type="number" value={numSkew} onChange={(event) => setNumSkew(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitTypedQuad(); } }}
                  />
                </>
              )}
              <button type="button" className="import-undo" onClick={commitTypedQuad}>{tool === 'rect-parallelogram' ? 'Add parallelogram' : 'Add rectangle'}</button>
              <span className="live-dim-hint">Click the canvas, or type values and press Enter</span>
            </div>
          ) : tool === 'circle-3pt' ? (
            <div className="live-dim">
              <span className="live-dim-label">R ({uLabel})</span>
              <input type="number" placeholder="Through 3 points" value={circle3ptR} onChange={(event) => setCircle3ptR(event.target.value)} />
              <span className="live-dim-hint">{circle3ptR.trim() ? 'Click 2 points on the circle, then a 3rd to pick the side' : 'Click 3 points on the circle — or type R to fix the radius'}</span>
            </div>
          ) : tool === 'line-infinite' ? (
            <div className="live-dim">
              <span className="anchor-toggle">
                <button type="button" className={infiniteMode === 'h' ? 'anchor-active' : ''} onClick={() => { setInfiniteMode('h'); wizardPtsRef.current = []; }}>Horizontal</button>
                <button type="button" className={infiniteMode === 'v' ? 'anchor-active' : ''} onClick={() => { setInfiniteMode('v'); wizardPtsRef.current = []; }}>Vertical</button>
                <button type="button" className={infiniteMode === '2pt' ? 'anchor-active' : ''} onClick={() => { setInfiniteMode('2pt'); wizardPtsRef.current = []; }}>Through Two Points</button>
              </span>
              <span className="live-dim-hint">{infiniteMode === '2pt' ? 'Click two points the line passes through' : 'Click the point the line passes through'}</span>
            </div>
          ) : tool === 'point-coord' ? (
            <div className="live-dim">
              <span className="anchor-toggle">
                <button type="button" className={coordMode === 'cartesian' ? 'anchor-active' : ''} onClick={() => setCoordMode('cartesian')}>Cartesian</button>
                <button type="button" className={coordMode === 'polar' ? 'anchor-active' : ''} onClick={() => setCoordMode('polar')}>Polar</button>
              </span>
              {coordMode === 'cartesian' ? (
                <>
                  <span className="live-dim-label">X-Offset ({uLabel})</span>
                  <input type="number" value={coordX} onChange={(event) => setCoordX(event.target.value)} />
                  <span className="live-dim-label">Y-Offset ({uLabel})</span>
                  <input
                    type="number"
                    value={coordY}
                    onChange={(event) => setCoordY(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyCoordPoint(); } }}
                  />
                </>
              ) : (
                <>
                  <span className="live-dim-label">Radius R ({uLabel})</span>
                  <input type="number" value={coordR} onChange={(event) => setCoordR(event.target.value)} />
                  <span className="live-dim-label">Angle θ (°)</span>
                  <input
                    type="number"
                    value={coordTheta}
                    onChange={(event) => setCoordTheta(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyCoordPoint(); } }}
                  />
                </>
              )}
              <button type="button" className="import-undo" onClick={applyCoordPoint}>{editingPointId ? 'Update Point' : 'Apply / Create Point'}</button>
              <span className="live-dim-hint">{editingPointId ? 'Editing an existing point — Enter (or the button) updates it in place' : 'Coordinates are relative to the active sketch origin — Enter (or the button) to add, then type new values to add another'}</span>
            </div>
          ) : tool === 'circle-coord' ? (
            <div className="live-dim">
              <span className="live-dim-label">Center H ({uLabel})</span>
              <input type="number" value={circCoordX} onChange={(event) => setCircCoordX(event.target.value)} />
              <span className="live-dim-label">V ({uLabel})</span>
              <input type="number" value={circCoordY} onChange={(event) => setCircCoordY(event.target.value)} />
              <span className="live-dim-label">Radius ({uLabel})</span>
              <input
                type="number"
                value={circCoordR}
                onChange={(event) => setCircCoordR(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitCircleCoord(); } }}
              />
              <button type="button" className="import-undo" onClick={commitCircleCoord}>Add circle</button>
              <button type="button" className="import-undo" onClick={() => setCircleDefOpen(true)}>Circle Definition…</button>
              <span className="live-dim-hint">Center is measured from the sketch origin — Enter (or the button) to add another</span>
            </div>
          ) : tool === 'point-oncurve' ? (
            <div className="live-dim">
              <span className="anchor-toggle">
                <button type="button" className={curveRef === 'start' ? 'anchor-active' : ''} onClick={() => setCurveRef('start')}>Start Point</button>
                <button type="button" className={curveRef === 'end' ? 'anchor-active' : ''} onClick={() => setCurveRef('end')}>End Point</button>
              </span>
              <span className="anchor-toggle">
                <button type="button" className={curveOffsetMode === 'length' ? 'anchor-active' : ''} onClick={() => setCurveOffsetMode('length')}>Length</button>
                <button type="button" className={curveOffsetMode === 'percent' ? 'anchor-active' : ''} onClick={() => setCurveOffsetMode('percent')}>%</button>
              </span>
              <span className="live-dim-label">Length {curveOffsetMode === 'percent' ? '(%)' : `(${uLabel})`}</span>
              <input
                type="number"
                value={curveOffsetValue}
                onChange={(event) => setCurveOffsetValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && curveTargetId) { event.preventDefault(); applyCurveOffset(); } }}
              />
              <button type="button" className="import-undo" onClick={() => setCurveRef((r) => (r === 'start' ? 'end' : 'start'))}>Flip Direction</button>
              <button type="button" className="import-undo" onClick={applyCurveOffset} disabled={!curveTargetId}>{editingPointId ? 'Update Point' : 'Apply / Create Point'}</button>
              <span className="live-dim-hint">{editingPointId ? 'Editing an existing point — Enter (or the button) updates it in place' : curveTargetId ? 'Preview shown — type the exact length, then Enter (or the button) to place it. Esc to pick a different entity' : 'Click a line, arc, circle, spline, or edge to select it'}</span>
            </div>
          ) : tool === 'point-divide' ? (
            <div className="live-dim">
              <span className="anchor-toggle">
                <button type="button" className={divideSpacingMode === 'equal' ? 'anchor-active' : ''} onClick={() => setDivideSpacingMode('equal')}>Equal Divisions</button>
                <button type="button" className={divideSpacingMode === 'fixed' ? 'anchor-active' : ''} onClick={() => setDivideSpacingMode('fixed')}>Fixed Length</button>
              </span>
              {divideSpacingMode === 'equal' ? (
                <>
                  <span className="live-dim-label">Divisions</span>
                  <input
                    type="number" min={2} value={divideCount}
                    onChange={(event) => setDivideCount(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && divideTargetId) { event.preventDefault(); applyDivision(); } }}
                  />
                </>
              ) : (
                <>
                  <span className="live-dim-label">Spacing ({uLabel})</span>
                  <input
                    type="number" min={0.1} value={divideFixedDistance}
                    onChange={(event) => setDivideFixedDistance(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && divideTargetId) { event.preventDefault(); applyDivision(); } }}
                  />
                </>
              )}
              <button type="button" className="import-undo" onClick={applyDivision} disabled={!divideTargetId}>{editingGroupId ? 'Update Points' : 'Add points'}</button>
              <span className="live-dim-hint">{editingGroupId ? 'Editing an existing divided set — Enter (or the button) regenerates it in place' : divideTargetId ? 'Enter (or the button) to drop the points — Esc to pick a different entity' : 'Click a line, circle, arc, spline, or edge to select it'}</span>
            </div>
          ) : tool === 'line-normal' && lineNormalPointFirst ? (
            <div className="live-dim">
              <span className="anchor-toggle">
                <span className="live-dim-label">Pick order:</span>
                <button type="button" onClick={() => { setLineNormalPointFirst(false); setLineNormalStart(null); }}>Curve first</button>
                <button type="button" className="anchor-active">Point first</button>
              </span>
              <span className="live-dim-hint">{lineNormalStart ? 'Click the line, circle, arc or curve the line should be normal to' : 'Click the start point of the line'}</span>
            </div>
          ) : tool === 'line-normal' ? (
            <div className="live-dim">
              <span className="anchor-toggle">
                <span className="live-dim-label">Pick order:</span>
                <button type="button" className="anchor-active">Curve first</button>
                <button type="button" onClick={() => { setLineNormalPointFirst(true); setLineNormalTargetId(null); }}>Point first</button>
              </span>
              <span className="live-dim-label">Length ({uLabel})</span>
              <input
                type="number" placeholder="Eyeballed" value={lineNormalDistance}
                onChange={(event) => setLineNormalDistance(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && lineNormalTargetId) { event.preventDefault(); applyLineNormal(); } }}
              />
              <span className="anchor-toggle">
                <span className="live-dim-label">Reverse:</span>
                <button type="button" className={!lineNormalReverse ? 'anchor-active' : ''} onClick={() => setLineNormalReverse(false)}>Off</button>
                <button type="button" className={lineNormalReverse ? 'anchor-active' : ''} onClick={() => setLineNormalReverse(true)}>On</button>
              </span>
              <span className="anchor-toggle">
                <span className="live-dim-label">Symmetrical:</span>
                <button type="button" className={!lineNormalSymmetric ? 'anchor-active' : ''} onClick={() => setLineNormalSymmetric(false)}>Off</button>
                <button type="button" className={lineNormalSymmetric ? 'anchor-active' : ''} onClick={() => setLineNormalSymmetric(true)}>On</button>
              </span>
              <button type="button" className="import-undo" onClick={() => applyLineNormal()} disabled={!lineNormalTargetId}>Apply / Create Line</button>
              <span className="live-dim-hint">{lineNormalTargetId ? 'Leave Length blank to eyeball it, or type an exact value — Enter (or the button) to place it, Esc to pick a different entity' : 'Click a line, circle, or arc to select it'}</span>
            </div>
          ) : tool === 'line-symmetric' ? (
            <div className="live-dim">
              <span className="live-dim-label">Length ({uLabel})</span>
              <input
                type="number" placeholder="Eyeballed" value={lineSymDistance}
                onChange={(event) => setLineSymDistance(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && lineSymAnchor) { event.preventDefault(); applyLineSymmetric(); } }}
              />
              <button type="button" className="import-undo" onClick={() => applyLineSymmetric()} disabled={!lineSymAnchor}>Apply / Create Line</button>
              <span className="live-dim-hint">{lineSymAnchor ? 'Leave Length blank to eyeball it, or type an exact total length — Enter (or the button) to place it, Esc to cancel' : 'Click anywhere on the canvas, or on an existing curve/entity, to set the anchor'}</span>
            </div>
          ) : tool === 'polygon-n' ? (
            <div className="live-dim">
              <span className="live-dim-label">Sides</span>
              <input type="number" min={3} value={polygonSides} onChange={(event) => setPolygonSides(event.target.value)} />
              <span className="anchor-toggle">
                <button type="button" className={!polygonCircumscribed ? 'anchor-active' : ''} onClick={() => setPolygonCircumscribed(false)}>Inscribed</button>
                <button type="button" className={polygonCircumscribed ? 'anchor-active' : ''} onClick={() => setPolygonCircumscribed(true)}>Circumscribed</button>
              </span>
              <span className="live-dim-hint">Click the center, then a vertex (inscribed) or edge midpoint (circumscribed)</span>
            </div>
          ) : tool === 'fillet-2d' ? (
            <div className="live-dim">
              <span className="live-dim-label">Radius ({uLabel})</span>
              <input type="number" value={filletRadius} onChange={(event) => setFilletRadius(event.target.value)} />
              <span className="live-dim-hint">Click two lines near their shared corner</span>
            </div>
          ) : tool === 'chamfer-2d' ? (
            <div className="live-dim">
              <span className="anchor-toggle">
                {([['angle', 'First length + angle'], ['hyp', 'Angle + hypotenuse'], ['lengths', 'Two lengths']] as const).map(([mode, label]) => (
                  <button key={mode} type="button" className={chamferMode === mode ? 'anchor-active' : ''} onClick={() => { setChamferMode(mode); setChamferIssue(null); }}>{label}</button>
                ))}
              </span>
              <span className="live-dim-label">{chamferMode === 'lengths' ? 'Distance A' : chamferMode === 'hyp' ? 'Hypotenuse' : 'First length'} ({uLabel})</span>
              <input type="number" min={0} value={chamferDistA} onChange={(event) => { setChamferDistA(event.target.value); setChamferIssue(null); }} />
              {chamferMode === 'lengths' ? (
                <>
                  <span className="live-dim-label">Distance B ({uLabel})</span>
                  <input type="number" min={0} value={chamferDistB} onChange={(event) => { setChamferDistB(event.target.value); setChamferIssue(null); }} />
                </>
              ) : (
                <>
                  <span className="live-dim-label">Angle (°)</span>
                  <input type="number" min={1} max={179} value={chamferAngle} onChange={(event) => { setChamferAngle(event.target.value); setChamferIssue(null); }} />
                </>
              )}
              {chamferIssue
                ? <span className="live-dim-hint live-dim-warning">{chamferIssue}</span>
                : <span className="live-dim-hint">Click the first element, then the second, each on the side that stays — {chamferMode === 'lengths' ? 'A is cut back along the first, B along the second' : chamferMode === 'hyp' ? 'the chamfer line is the hypotenuse, at the angle from the first element' : 'the length is cut back along the first element, the angle is measured from it'}</span>}
            </div>
          ) : tool === 'conic-rp' ? (
            <div className="live-dim">
              <span className="live-dim-label">Rho (0–1)</span>
              <input type="number" min={0.02} max={0.98} step={0.01} value={conicRho} onChange={(event) => setConicRho(event.target.value)} />
              <span className="live-dim-hint">Click the start point, the apex/tangent-intersection point, then the end point</span>
            </div>
          ) : tool === 'profile' ? (
            <div className="live-dim">
              <span className="anchor-toggle">
                <span className="live-dim-label">Closed profile:</span>
                <button type="button" className={profileClosed ? 'anchor-active' : ''} onClick={() => setProfileClosed(true)}>On</button>
                <button type="button" className={!profileClosed ? 'anchor-active' : ''} onClick={() => setProfileClosed(false)}>Off</button>
              </span>
              <span className="anchor-toggle">
                <button type="button" className={profileSegMode === 'line' ? 'anchor-active' : ''} onClick={() => { setProfileSegMode('line'); profileThroughRef.current = null; }}>Line</button>
                <button type="button" className={profileSegMode === 'tangent-arc' ? 'anchor-active' : ''} disabled={!profileChain?.lastDir} onClick={() => { setProfileSegMode('tangent-arc'); profileThroughRef.current = null; }}>Tangent Arc</button>
                <button type="button" className={profileSegMode === 'arc-3pt' ? 'anchor-active' : ''} disabled={!profileChain} onClick={() => { setProfileSegMode('arc-3pt'); profileThroughRef.current = null; }}>Three Point Arc</button>
              </span>
              <span className="live-dim-hint">{!profileChain ? 'Click the start point'
                : profileSegMode === 'tangent-arc' ? 'Click the end point of the tangent arc'
                : profileSegMode === 'arc-3pt' ? (profileThroughRef.current ? 'Click the end point of the arc' : 'Click a second point the arc passes through')
                : `Click the next point (${profileChain.segs} segment${profileChain.segs === 1 ? '' : 's'}) — click the start point to close, double-click to finish${profileClosed ? ' and close' : ' (left open)'}`}</span>
            </div>
          ) : pendingConstraint ? (
            <div className="live-dim">
              <span className="live-dim-label">
                {pendingConstraint.type === 'distance' ? 'Distance (' + uLabel + ')' : pendingConstraint.type === 'radius' ? 'Radius (' + uLabel + ')' : 'Angle (°)'}
              </span>
              <input
                autoFocus
                type="number"
                value={pendingConstraint.value}
                onChange={(event) => setPendingConstraint((p) => (p ? { ...p, value: event.target.value } : p))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); commitPendingConstraint(); }
                  else if (event.key === 'Escape') { event.preventDefault(); cancelPendingConstraint(); }
                }}
              />
              {pendingConstraint.anchor && (
                <span className="anchor-toggle">
                  <span className="live-dim-label">Keep fixed:</span>
                  {pendingConstraint.ids.map((id) => (
                    <button key={id} type="button" className={pendingConstraint.anchor === id ? 'anchor-active' : ''}
                      onClick={() => setPendingConstraint((p) => (p ? { ...p, anchor: id } : p))}>
                      {id}
                    </button>
                  ))}
                </span>
              )}
              <span className="live-dim-hint">Enter to confirm · Esc to cancel</span>
            </div>
          ) : tool === 'select' ? (
            <>
              <span className="anchor-toggle">
                <span className="live-dim-label">Trap:</span>
                {([
                  ['inside', 'Inside', 'Selection Trap'], ['intersecting', 'Crossing', 'Intersecting Trap'], ['polygon', 'Polygon', 'Polygon Trap'],
                  ['paint', 'Paint', 'Paint Stroke Selection'], ['outside', 'Outside', 'Outside Trap Selection'], ['intersecting-outside', 'Out+Cross', 'Intersecting Outside Trap Selection'],
                ] as const).map(([mode, label, full]) => (
                  <button key={mode} type="button" title={full} aria-label={full} className={trapMode === mode ? 'anchor-active' : ''} onClick={() => { setTrapMode(mode); setTrapPoly([]); setPaintStroke(null); }}>{label}</button>
                ))}
              </span>
              <span>{
                dragModeRef.current === 'move' ? 'Dragging selection — release to drop, Esc to cancel'
                  : trapMode === 'polygon' ? (trapPoly.length > 0 ? 'Click to add corners — double-click to close the polygon and select what is fully inside' : 'Click empty space to start a polygon (clicking an entity still selects it)')
                  : trapMode === 'paint' ? 'Drag across entities to select every one the stroke touches'
                  : trapMode === 'outside' ? 'Drag a box — selects everything fully outside it'
                  : trapMode === 'intersecting-outside' ? 'Drag a box — selects everything outside it or crossing it'
                  : trapMode === 'intersecting' ? 'Drag a box — selects everything inside it or crossing it'
                  : selected.length > 0 ? 'Click to select/deselect, drag a selected entity to move it, or drag empty space to box-select'
                  : 'Click entities to select, then choose a constraint — drag a box to select multiple'
              }</span>
              <b>•</b><span>{points.length + lines.length + circles.length + arcs.length + curves.length} entities</span>
            </>
          ) : (
            <>
              <span>{
                tool === 'hide-show' ? (swapSpace ? 'Click hidden elements to show them again — Esc to stop' : 'Click elements to hide them (they still take part in features) — Esc to stop')
                  : tool === 'trim' ? 'Click a line, circle, or arc to trim it'
                  : tool === 'measure-item' ? 'Click an entity to measure it'
                  : tool === 'measure-between' ? (measureFirstRef.current ? 'Click a second entity to measure the distance between them' : 'Click the first entity to measure from')
                  : NEW_TOOL_HINTS[tool] ?? `Click the canvas to place a ${tool}`
              }</span>
              <b>•</b><span>{points.length + lines.length + circles.length + arcs.length + curves.length} entities</span>
            </>
          )}
        </div>
  );
}
