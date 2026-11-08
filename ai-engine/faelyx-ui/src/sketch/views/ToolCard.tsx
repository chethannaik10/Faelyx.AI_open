// The Sketch Inspector's tool card: whatever was last picked in the Sketch
// Toolbox — a drawing tool, a measure tool, a constraint, Fillet / Chamfer
// / Trim, or AI Import — laid out the same way every time:
//
//   TOOL                               name + toolbox group
//   STATUS / INSTRUCTION               what to do next, live
//   PARAMETERS / DIMENSIONS            the tool's own inputs
//   ACTIVE CONSTRAINTS & REFERENCES    what it has picked / is working on
//
// Every input is bound to the same state the canvas preview and the bottom
// bar use, so the three always agree: type here and the preview follows,
// draw on the canvas and the numbers here follow. A tool with its own
// long-standing Inspector controls (the Point and Line flyout tools) passes
// them in as `children`, shown as its Parameters section.
import type { ReactNode } from 'react';
import { Ruler, Sparkles, SlidersHorizontal, Link2 } from 'lucide-react';
import type { SketchTool } from '../types';
import { entityTools, measureTools, constraintModeTools, NEW_TOOL_HINTS } from '../tools';
import type { SketchUI } from '../handlers';
import { isModifyTool } from '../handlers/modifyTools';
import { ModifyParams } from './ModifyCard';

type ToolMeta = { name: string; group: string };
const TOOL_META: Partial<Record<SketchTool, ToolMeta>> = Object.fromEntries([
  ...entityTools.flatMap((t) => [[t.mode, { name: t.name, group: 'SKETCH ENTITIES' }] as const, ...(t.flyout ?? []).map((v) => [v.mode, { name: v.name, group: `SKETCH ENTITIES · ${t.name.toUpperCase()}` }] as const)]),
  ...measureTools.map((t) => [t.mode, { name: t.name, group: 'MEASURE' }] as const),
  ...constraintModeTools.map((t) => [t.mode, { name: t.name, group: 'MODIFY' }] as const),
]);
const OTHER_TOOLS: Record<string, ToolMeta> = {
  select: { name: 'Select', group: 'SELECTION' },
  'hide-show': { name: 'Hide / Show', group: 'VIEW' },
};

// A labelled number field bound straight to a piece of tool state.
function Num({ label, value, set, onEnter, placeholder, min, step, onFocus, onBlur }: {
  label: string; value: string; set: (v: string) => void; onEnter?: () => void; placeholder?: string; min?: number; step?: number;
  onFocus?: () => void; onBlur?: () => void;
}) {
  return (
    <label className="property-input">{label}
      <input type="number" value={value} placeholder={placeholder} min={min} step={step}
        onFocus={onFocus} onBlur={onBlur}
        onChange={(event) => set(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && onEnter) { event.preventDefault(); onEnter(); } }} />
    </label>
  );
}

function Toggle<T extends string | boolean>({ label, value, options, set }: { label?: string; value: T; options: readonly (readonly [T, string])[]; set: (v: T) => void }) {
  return (
    <div className="tool-card-toggle">
      {label && <span className="tool-card-toggle-label">{label}</span>}
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" className={value === v ? 'anchor-active' : ''} onClick={() => set(v)}>{text}</button>
      ))}
    </div>
  );
}

export function ToolCard({ core, children }: { core: SketchUI; children?: ReactNode }) {
  const c = core;
  const { tool, toolboxPick, uLabel, selected, constraints, describeEntityId, showLabel, setSelected } = c;
  const pick = toolboxPick;
  const meta: ToolMeta = pick
    ? { name: pick.name, group: pick.kind === 'ai' ? 'AI IMPORT' : 'CONSTRAINTS' }
    : TOOL_META[tool] ?? OTHER_TOOLS[tool] ?? { name: tool, group: 'SKETCH TOOL' };

  // ---- Status / instruction ------------------------------------------------
  const wizardCount = c.wizardIdsRef.current.length;
  let instruction: string;
  if (pick?.kind === 'constraint') {
    instruction = c.pendingConstraint ? 'Type the value and press Enter (or Apply) — Esc cancels.' : `${pick.hint} (select first — the sketch Origin, HDirection and VDirection count too), then click ${pick.name} again or Apply.`;
  } else if (pick?.kind === 'ai') {
    instruction = c.importing ? 'Analyzing image…' : c.importSummary ? 'Imported — review the traced geometry; Undo import if the trace is off.' : 'Open Image to Sketch to load a PNG, JPG or SVG — it is traced into editable geometry.';
  } else if (isModifyTool(tool)) {
    instruction = c.modNote ?? c.modInstruction ?? 'Pick an element.';
  } else if (tool === 'chamfer-2d') {
    instruction = c.chamferIssue ?? (wizardCount === 0 ? 'Click the first element, on the side that stays.' : 'Click the second element, on the side that stays.');
  } else if (tool === 'fillet-2d') {
    instruction = wizardCount === 0 ? 'Click the first line near the corner to round.' : 'Click the second line near the same corner.';
  } else if (tool === 'measure-between') {
    instruction = c.measureFirstRef.current ? 'Click a second entity to measure the distance between them.' : 'Click the first entity to measure from.';
  } else if (tool === 'measure-item') {
    instruction = 'Click an entity to read its length, radius, angle or coordinates.';
  } else if (tool === 'trim') {
    instruction = 'Click a line, circle, arc or curve between its intersections to cut that piece away.';
  } else if (tool === 'select') {
    instruction = selected.length > 0 ? 'Drag a selected entity to move it, pick a constraint, or edit it below.' : 'Click entities to select them, or drag a box to select several.';
  } else if ((tool === 'line' || tool === 'circle' || tool === 'axis-construction') && c.pending) {
    instruction = 'Click the end point, or type the values below and press Enter — Esc cancels.';
  } else {
    instruction = NEW_TOOL_HINTS[tool] ?? `Click the canvas to place a ${meta.name.toLowerCase()}.`;
  }

  // ---- Parameters ------------------------------------------------------------
  const params: ReactNode = (() => {
    if (pick?.kind === 'constraint') {
      const pc = c.pendingConstraint;
      return <>
        {pc && (
          <>
            <Num label={pc.type === 'distance' ? `Distance (${uLabel})` : pc.type === 'radius' ? `Radius (${uLabel})` : 'Angle (°)'}
              value={pc.value} set={(v) => c.setPendingConstraint((p) => (p ? { ...p, value: v } : p))} onEnter={c.commitPendingConstraint} />
            {pc.anchor && <Toggle label="Keep fixed" value={pc.anchor} options={pc.ids.map((id) => [id, id] as const)} set={(id) => c.setPendingConstraint((p) => (p ? { ...p, anchor: id } : p))} />}
          </>
        )}
        <div className="tool-card-actions">
          {pc ? (<>
            <button className="outline-action" onClick={c.commitPendingConstraint}>Apply</button>
            <button className="outline-action" onClick={c.cancelPendingConstraint}>Cancel</button>
          </>) : <button className="outline-action" onClick={() => c.applyConstraint(pick.type)} disabled={selected.length === 0}>Apply {pick.name} to selection</button>}
        </div>
      </>;
    }
    if (pick?.kind === 'ai') {
      const s = c.importSummary;
      return <>
        {s && <div className="measurement-grid">
          <div><span>Points</span><b>{s.counts.points}</b></div><div><span>Lines</span><b>{s.counts.lines}</b></div><div><span>Circles</span><b>{s.counts.circles}</b></div>
        </div>}
        {s?.suggestedDimensions.map((sd) => (
          <button key={`${sd.p1}-${sd.p2}-${sd.label}`} className="outline-action" onClick={() => c.applySuggestedDistance(sd)}>{sd.label}: {c.toU(sd.valueMm).toFixed(2)} {uLabel}</button>
        ))}
        <div className="tool-card-actions">
          <button className="outline-action" disabled={c.importing} onClick={() => c.setImageDialogOpen(true)}><Sparkles size={12} /> Open Image to Sketch…</button>
          {s && <button className="outline-action" onClick={c.undoImport}>Undo import</button>}
        </div>
      </>;
    }
    if (children) return children;
    if (isModifyTool(tool)) return <ModifyParams core={c} />;
    switch (tool) {
      case 'line': case 'circle': case 'axis-construction': {
        const isCircle = tool === 'circle';
        if (!c.pending) return <>
          <Num label={`${isCircle ? 'Center' : 'Start'} H (${uLabel})`} value={c.numStartH} set={c.setNumStartH} />
          <Num label={`${isCircle ? 'Center' : 'Start'} V (${uLabel})`} value={c.numStartV} set={c.setNumStartV} onEnter={isCircle ? c.commitTypedCircle : c.commitTypedStart} />
          {isCircle && <Num label={`Radius (${uLabel})`} value={c.numRadius} set={c.setNumRadius} onEnter={c.commitTypedCircle} />}
          {isCircle && <button className="outline-action" onClick={c.commitTypedCircle}>Add circle</button>}
          {tool === 'line' && <Toggle label="Symmetrical" value={c.lineSymToggle} options={[[false, 'Off'], [true, 'On']] as const} set={c.setLineSymToggle} />}
        </>;
        return <>
          {tool !== 'axis-construction' && <Num label={`${isCircle ? 'Radius' : 'Length'} (${uLabel})`} value={c.liveValue} set={c.setLiveValue} onEnter={c.commitLiveValue}
            onFocus={() => c.setIsEditingLive(true)} onBlur={() => c.setIsEditingLive(false)} />}
          {tool === 'line' && <Num label="Angle (°)" value={c.numAngle} set={c.setNumAngle} placeholder="Cursor" onEnter={c.commitLiveValue} />}
          {!isCircle && <>
            <Num label="End H" value={c.numEndH} set={c.setNumEndH} />
            <Num label="End V" value={c.numEndV} set={c.setNumEndV} onEnter={c.commitTypedEnd} />
          </>}
        </>;
      }
      case 'rectangle': case 'rect-oriented': case 'rect-parallelogram':
        return <>
          <Num label={`Corner H (${uLabel})`} value={c.numStartH} set={c.setNumStartH} />
          <Num label={`Corner V (${uLabel})`} value={c.numStartV} set={c.setNumStartV} />
          <Num label={`Width (${uLabel})`} value={c.numWidth} set={c.setNumWidth} />
          <Num label={`Height (${uLabel})`} value={c.numHeight} set={c.setNumHeight} onEnter={c.commitTypedQuad} />
          {tool !== 'rectangle' && <Num label="Rotation A (°)" value={c.numAngle} set={c.setNumAngle} placeholder="0" onEnter={c.commitTypedQuad} />}
          {tool === 'rect-parallelogram' && <Num label="Skew angle (°)" value={c.numSkew} set={c.setNumSkew} onEnter={c.commitTypedQuad} />}
          <button className="outline-action" onClick={c.commitTypedQuad}>{tool === 'rect-parallelogram' ? 'Add parallelogram' : 'Add rectangle'}</button>
        </>;
      case 'circle-3pt':
        return <Num label={`Radius (${uLabel})`} value={c.circle3ptR} set={c.setCircle3ptR} placeholder="Through 3 points" />;
      case 'circle-coord':
        return <>
          <Num label={`Center H (${uLabel})`} value={c.circCoordX} set={c.setCircCoordX} />
          <Num label={`Center V (${uLabel})`} value={c.circCoordY} set={c.setCircCoordY} />
          <Num label={`Radius (${uLabel})`} value={c.circCoordR} set={c.setCircCoordR} onEnter={c.commitCircleCoord} />
          <button className="outline-action" onClick={c.commitCircleCoord}>Add circle</button>
        </>;
      case 'line-infinite':
        return <Toggle value={c.infiniteMode} options={[['h', 'Horizontal'], ['v', 'Vertical'], ['2pt', 'Two points']] as const} set={(m) => { c.setInfiniteMode(m); c.wizardPtsRef.current = []; }} />;
      case 'polygon-n':
        return <>
          <Num label="Sides" value={c.polygonSides} set={c.setPolygonSides} min={3} />
          <Toggle value={c.polygonCircumscribed} options={[[false, 'Inscribed'], [true, 'Circumscribed']] as const} set={c.setPolygonCircumscribed} />
        </>;
      case 'fillet-2d':
        return <Num label={`Fillet radius (${uLabel})`} value={c.filletRadius} set={c.setFilletRadius} min={0} />;
      case 'chamfer-2d':
        return <>
          <Toggle value={c.chamferMode} options={[['angle', 'Length + angle'], ['hyp', 'Angle + hypotenuse'], ['lengths', 'Two lengths']] as const} set={(m) => { c.setChamferMode(m); c.setChamferIssue(null); }} />
          <Num label={`${c.chamferMode === 'lengths' ? 'Chamfer distance A' : c.chamferMode === 'hyp' ? 'Hypotenuse' : 'Chamfer distance'} (${uLabel})`} value={c.chamferDistA} set={(v) => { c.setChamferDistA(v); c.setChamferIssue(null); }} min={0} />
          {c.chamferMode === 'lengths'
            ? <Num label={`Chamfer distance B (${uLabel})`} value={c.chamferDistB} set={(v) => { c.setChamferDistB(v); c.setChamferIssue(null); }} min={0} />
            : <Num label="Chamfer angle (°)" value={c.chamferAngle} set={(v) => { c.setChamferAngle(v); c.setChamferIssue(null); }} min={1} />}
        </>;
      case 'conic-rp':
        return <Num label="Rho (0–1)" value={c.conicRho} set={c.setConicRho} min={0.02} step={0.01} />;
      case 'profile':
        return <>
          <Toggle label="Closed" value={c.profileClosed} options={[[true, 'On'], [false, 'Off']] as const} set={c.setProfileClosed} />
          <Toggle label="Next segment" value={c.profileSegMode} options={[['line', 'Line'], ['tangent-arc', 'Tangent arc'], ['arc-3pt', '3-point arc']] as const} set={(m) => { c.setProfileSegMode(m); c.profileThroughRef.current = null; }} />
          {c.profileChain && <div className="measurement-grid"><div><span>Segments</span><b>{c.profileChain.segs}</b></div></div>}
        </>;
      case 'measure-item': case 'measure-between':
        return c.measureResult
          ? <div className="measurement-grid">{c.measureResult.lines.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
          : <div className="tool-card-empty">Readings appear here once you click {tool === 'measure-item' ? 'an entity' : 'two entities'}.</div>;
      // Select's Trap toggle lives in the bottom bar only (see BottomBar.tsx)
      // — it was duplicated here too, but a selection-box mode toggle isn't
      // really a "parameter" of a picked entity the way every other card's
      // Parameters section is, and having it editable from two different
      // panels at once was confusing. Returning null (not an empty
      // fallback) is what tells the section wrapper below to hide the
      // whole "PARAMETERS / DIMENSIONS" card for Select entirely, rather
      // than showing it with nothing in it.
      case 'select':
        return null;
      default:
        return <div className="tool-card-empty">No typed parameters — the shape is set by where you click{wizardCount ? ` (${wizardCount} picked)` : ''}.</div>;
    }
  })();

  // ---- Active constraints & references ---------------------------------------
  const refs: { id: string; label: string; select?: boolean }[] = [];
  const addRef = (id: string | null | undefined, label?: string) => { if (id && !refs.some((r) => r.id === id)) refs.push({ id, label: label ?? describeEntityId(id), select: true }); };
  if (c.pending) addRef(c.pending, `Start: ${describeEntityId(c.pending)}`);
  c.wizardIdsRef.current.forEach((id, i) => addRef(id, `Pick ${i + 1}: ${describeEntityId(id)}`));
  addRef(c.lineNormalTargetId, `Target: ${describeEntityId(c.lineNormalTargetId ?? '')}`);
  addRef(c.curveTargetId, `Target: ${describeEntityId(c.curveTargetId ?? '')}`);
  addRef(c.divideTargetId, `Target: ${describeEntityId(c.divideTargetId ?? '')}`);
  if (c.lineSymAnchor) refs.push({ id: 'anchor', label: `Anchor (${c.toU(c.lineSymAnchor.x - c.SKETCH_ORIGIN.x).toFixed(2)}, ${c.toU(c.SKETCH_ORIGIN.y - c.lineSymAnchor.y).toFixed(2)})` });
  selected.forEach((id) => addRef(id));
  const refIds = new Set(refs.map((r) => r.id));
  const related = constraints.filter((k) => Object.values(k.args).some((v) => typeof v === 'string' && refIds.has(v)));
  // Chamfer / Fillet: the chamfers already in the sketch, each selectable
  // (selecting one opens its own editable A/B/length/angle below).
  const chamfers = tool === 'chamfer-2d' || tool === 'fillet-2d'
    ? constraints.filter((k) => k.args.role === 'd1').map((k) => String(k.args.chamfer)).filter((id, i, all) => all.indexOf(id) === i)
    : [];

  return (
    <section className="tool-card" data-tool-card={pick ? `${pick.kind}:${pick.type}` : tool}>
      <div className="tool-card-head">
        {pick?.kind === 'ai' ? <Sparkles size={14} /> : tool.startsWith('measure') ? <Ruler size={14} /> : <SlidersHorizontal size={14} />}
        <span><div className="eyebrow">{meta.group} · {c.plane.toUpperCase()} PLANE</div><strong>{meta.name}</strong></span>
      </div>
      <div className="tool-card-section" data-section="status">
        <div className="eyebrow">STATUS / INSTRUCTION</div>
        <div className="tool-card-instruction">{instruction}</div>
        <div className="tool-card-live">{c.points.length + c.lines.length + c.circles.length + c.arcs.length + c.curves.length} entities · {c.dof === null ? 'empty sketch' : `${c.dof} DOF`}</div>
      </div>
      {/* params is only ever null for Select now (see the 'select' case
          above) — every other tool still gets its own Parameters card,
          even a wholly empty one ("No typed parameters…"), unchanged. */}
      {params !== null && (
        <div className="tool-card-section" data-section="parameters">
          <div className="eyebrow">PARAMETERS / DIMENSIONS</div>
          {params}
        </div>
      )}
      <div className="tool-card-section" data-section="references">
        <div className="eyebrow"><Link2 size={10} /> ACTIVE CONSTRAINTS &amp; REFERENCES</div>
        {refs.length === 0 && related.length === 0 && chamfers.length === 0 && <div className="tool-card-empty">Nothing picked yet.</div>}
        {refs.length > 0 && <div className="relations-row"><span>References</span>
          {refs.map((r) => <button key={r.id} onClick={() => r.select && setSelected([r.id])}>{r.label}</button>)}
        </div>}
        {related.length > 0 && <div className="relations-row"><span>Constraints</span>
          {related.slice(0, 12).map((k) => <button key={k.id} onClick={() => setSelected(Object.values(k.args).filter((v): v is string => typeof v === 'string' && refIds.has(v)))}>{showLabel(k.label)}</button>)}
          {related.length > 12 && <span>+{related.length - 12} more</span>}
        </div>}
        {chamfers.length > 0 && <div className="relations-row"><span>Chamfers</span>
          {chamfers.map((id) => <button key={id} onClick={() => { c.setTool('select'); setSelected([id]); }}>{id}</button>)}
        </div>}
      </div>
    </section>
  );
}

