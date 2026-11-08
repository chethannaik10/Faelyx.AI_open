// PartDesignPanel.tsx — the 3D Design Properties tab for a CATIA Part
// Design tool: its definition-box fields (from partDesign.ts's catalogue),
// the sketch support it builds on, the faces picked in the viewport, and
// Apply / Update / Delete.
import { useState } from 'react';
import { Check, Pencil, ScanFace, Settings2, Trash2, X } from 'lucide-react';
import { fieldLabel, fieldVisible, parsePlaneSource, refLabel, refPlaneLabel, refTypeHint, type EdgePick, type FacePick, type Field, type Form, type KeptSketch, type RefLike, type ToolSpec } from './partDesign';

export type SupportOption = { value: string; label: string };
export type PartDesignPanelProps = {
  spec: ToolSpec;
  form: Form;
  setForm: (form: Form) => void;
  // Edit mode: the tree item being edited.
  editing: { name: string; legacy: boolean } | null;
  onCancelEdit: () => void;
  onDelete: () => void;
  // Edit mode, sketch-based features: the parent sketch, selectable and re-assignable.
  parent?: {
    value: string; options: SupportOption[]; missing: boolean; changed: boolean; others: string[];
    onChange: (id: string) => void; onOpen?: () => void;
  };
  // The sketch the feature is built from: a kept sketch's id, or 'live'
  // for the sketch on the Sketch & 2D canvas.
  profileValue: string;
  profileOptions: SupportOption[];
  onProfile: (value: string) => void;
  // Where that sketch sits. Locked when other features already use it
  // (its support is then changed from the sketch's own definition).
  supportLocked: boolean;
  supportValue: string;
  supportOptions: SupportOption[];
  onSupport: (value: string) => void;
  planeOffset: number | null;          // null when the support isn't the sketch's own plane
  onPlaneOffset: (value: number) => void;
  sketchSummary: string;               // what the current sketch holds
  kept: KeptSketch[];
  refs: RefLike[];
  bodies: { id: string; name: string }[];
  featureNames: string[];
  edges: EdgePick[];
  onRemoveEdge: (index: number) => void;
  onClearEdges: () => void;
  faces: FacePick[];
  onRemoveFace: (index: number) => void;
  onClearFaces: () => void;
  inspectionResult: string | null;
  onApply: () => void;
  applying: boolean;
};

function FieldInput({ field, form, setForm, kept, refs, bodies, featureNames }: { field: Field; form: Form; setForm: (f: Form) => void; kept: KeptSketch[]; refs: RefLike[]; bodies: { id: string; name: string }[]; featureNames: string[] }) {
  const label = fieldLabel(field, form);
  const set = (value: string | boolean) => setForm({ ...form, [field.key]: value });
  const value = form[field.key] ?? field.def;
  switch (field.type) {
    case 'check':
      return <label className="property-input property-check"><input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} /> {label}</label>;
    case 'select':
      return <label className="property-input">{label}<select value={String(value)} onChange={(e) => set(e.target.value)}>{field.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
    case 'sketch':
      return <label className="property-input">{label}<select value={String(value)} onChange={(e) => set(e.target.value)}>
        <option value="">{kept.length ? 'Select a kept sketch…' : 'No kept sketches — draw one in Sketch & 2D and exit the workbench'}</option>
        {kept.map((k) => <option key={k.id} value={k.id}>{k.name}{k.openPath ? ' — open chain' : ''} ({k.plane})</option>)}
      </select></label>;
    case 'sketches': {
      const chosen = String(value).split(',').filter(Boolean);
      const toggle = (id: string) => set((chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]).join(','));
      return <div className="property-input">{label}
        {kept.length === 0 && <div className="sketch-hint">No kept sketches — draw each section in Sketch & 2D and exit the workbench (sketches are kept automatically).</div>}
        {kept.map((k) => <label key={k.id} className="property-check pd-multi"><input type="checkbox" checked={chosen.includes(k.id)} onChange={() => toggle(k.id)} /> {chosen.includes(k.id) ? `${chosen.indexOf(k.id) + 1}. ` : ''}{k.name} ({k.plane}, {k.loops.length} profile{k.loops.length === 1 ? '' : 's'})</label>)}
      </div>;
    }
    case 'refpoint':
      return <label className="property-input">{label}<select value={String(value)} onChange={(e) => set(e.target.value)}>
        <option value="coords">Coordinates (type them below)</option>
        {refs.filter((r) => r.kind === 'point').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select></label>;
    case 'refline':
      return <label className="property-input">{label}<select value={String(value)} onChange={(e) => set(e.target.value)}>
        {field.key === 'axisLine' && <option value="PLANE_H">Horizontal axis of the reference plane (through its origin)</option>}
        {field.key === 'axisLine' && <option value="PLANE_V">Vertical axis of the reference plane (through its origin)</option>}
        {['X', 'Y', 'Z'].map((a) => <option key={a} value={a}>{a} axis (through the origin)</option>)}
        {refs.filter((r) => r.kind === 'axis' || r.kind === 'line').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select></label>;
    case 'refseg':
      return <label className="property-input">{label}<select value={String(value)} onChange={(e) => set(e.target.value)}>
        <option value="">{refs.some((r) => r.kind === 'line') ? 'Select a Reference Line…' : 'No Reference Lines — make one with the Reference Line tool'}</option>
        {refs.filter((r) => r.kind === 'line').map((r) => <option key={r.id} value={r.id}>{refLabel(r)}</option>)}
      </select></label>;
    case 'refpoints': {
      const pts = refs.filter((r) => r.kind === 'point');
      const chosen = String(value).split(',').filter(Boolean);
      const toggle = (id: string) => set((chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]).join(','));
      return <div className="property-input">{label}
        {pts.length === 0 && <div className="sketch-hint">No Reference Points yet — type the points below, or make some with the Reference Point tool.</div>}
        {pts.map((r) => <label key={r.id} className="property-check pd-multi"><input type="checkbox" checked={chosen.includes(r.id)} onChange={() => toggle(r.id)} /> {refLabel(r)}</label>)}
      </div>;
    }
    case 'refplane':
      return <label className="property-input">{label}<select value={String(value)} onChange={(e) => set(e.target.value)}>
        <option value="XY">XY plane (Top)</option><option value="XZ">XZ plane (Front)</option><option value="YZ">YZ plane (Right)</option>
        {refs.filter((r) => r.kind === 'plane').map((r) => <option key={r.id} value={r.id}>{refPlaneLabel(r)}</option>)}
      </select></label>;
    case 'refsource': {
      const src = parsePlaneSource(String(value), refs);
      return <div className="property-input">
        <label>{label}<select value={String(value)} onChange={(e) => set(e.target.value)}>
          <option value="">{'Click a plane or a planar face in the 3D view…'}</option>
          <option value="XY">Top plane (XY)</option><option value="XZ">Front plane (XZ)</option><option value="YZ">Right plane (YZ)</option>
          {refs.filter((r) => r.kind === 'plane').map((r) => <option key={r.id} value={r.id}>{refPlaneLabel(r)}</option>)}
          {String(value).startsWith('face:') && src && <option value={String(value)}>Picked {src.label}</option>}
        </select></label>
        <div className="sketch-hint">{src ? `The new plane is parallel to the ${src.label}. That plane stays where it is; only the new plane moves when you change the distance.` : 'Pick the plane to offset from: click one of the planes, a Reference Plane or a flat face of the part in the 3D view.'}</div>
      </div>;
    }
    case 'body':
      return <label className="property-input">{label}<select value={String(value)} onChange={(e) => set(e.target.value)}>
        <option value="">Select a body…</option>
        {bodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select></label>;
    case 'feature':
      return <label className="property-input">{label}<select value={String(value)} onChange={(e) => set(e.target.value)}>
        <option value="">Select a feature…</option>
        {featureNames.map((n) => <option key={n} value={n}>{n}</option>)}
      </select></label>;
    default:
      return <label className="property-input">{label}<input value={String(value)} placeholder={'placeholder' in field ? field.placeholder : undefined} onChange={(e) => set(e.target.value)} /></label>;
  }
}

export default function PartDesignPanel(p: PartDesignPanelProps) {
  const { spec } = p;
  const buildsFromSketch = !!spec.sketch && spec.kind !== 'modifier';
  const unavailable = spec.kind === 'unavailable';
  const applyLabel = p.editing ? `Update ${p.editing.name}`
    : spec.kind === 'inspect' ? `Run ${spec.name}`
    : spec.kind === 'body' ? 'Insert body'
    : spec.kind === 'reference' ? 'Create'
    : 'Apply changes';
  return <div className="property-content">
    <div className="property-title"><Settings2 size={14} /><span><div className="eyebrow">{p.editing ? 'EDIT FEATURE' : 'FEATURE DEFINITION'}</div><strong>{p.editing ? p.editing.name : spec.name}</strong></span></div>
    <div className="sketch-hint">{spec.description}</div>
    {refTypeHint(spec.name, p.form) && <div className="sketch-hint pd-type-hint">{refTypeHint(spec.name, p.form)}</div>}
    {unavailable ? <div className="sketch-notice">{spec.reason}</div> : <>
      {buildsFromSketch && !p.editing && <>
        <div className="property-divider" />
        <div className="eyebrow"><Pencil size={10} /> SKETCH → 3D</div>
        <div className="sketch-hint pd-sketch-summary">{p.sketchSummary}</div>
        <label className="property-input">Profile<select value={p.profileValue} onChange={(e) => p.onProfile(e.target.value)}>
          {p.profileOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select></label>
        <label className="property-input">Sketch support<select value={p.supportValue} disabled={p.supportLocked} onChange={(e) => p.onSupport(e.target.value)}>
          {p.supportOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select></label>
        {p.planeOffset !== null && <label className="property-input">Sketch plane offset along its normal (mm)<input type="number" value={p.planeOffset} disabled={p.supportLocked} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) p.onPlaneOffset(v); }} /></label>}
        {p.supportLocked && <div className="sketch-hint">Other features already use this sketch. To move it, select it in the model tree and change its support there.</div>}
      </>}
      {buildsFromSketch && p.editing && !p.editing.legacy && p.parent && <>
        <div className="property-divider" />
        <div className="eyebrow"><Pencil size={10} /> PARENT SKETCH</div>
        {p.parent.missing && <div className="sketch-notice">The sketch this feature was built from was deleted. It keeps its stored copy until you pick another sketch below.</div>}
        <label className="property-input">Sketch<select value={p.parent.value} onChange={(e) => p.parent!.onChange(e.target.value)}>
          {p.parent.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select></label>
        {p.parent.changed
          ? <div className="sketch-hint">Click {applyLabel} to re-link this feature to the chosen sketch. It is rebuilt along with everything after it; if the part can't be built, the change is rejected.</div>
          : <div className="sketch-hint">Editing this sketch in Sketch &amp; 2D updates this feature automatically.</div>}
        {p.parent.others.length > 0 && <div className="sketch-hint">Also used by {p.parent.others.join(', ')}.</div>}
        {p.parent.onOpen && <button className="outline-action" onClick={p.parent.onOpen}><Pencil size={11} /> Edit sketch in Sketch &amp; 2D</button>}
      </>}
      {p.editing?.legacy && <div className="sketch-notice">Created before definition boxes were stored, so only Delete is available for it.</div>}
      {!p.editing?.legacy && (spec.fields ?? []).filter((f) => fieldVisible(f, p.form)).map((f) => <FieldInput key={f.key} field={f} form={p.form} setForm={p.setForm} kept={p.kept} refs={p.refs} bodies={p.bodies} featureNames={p.featureNames} />)}
      {spec.edges && <>
        <div className="property-divider" />
        <div className="eyebrow"><ScanFace size={10} /> SELECTED EDGES (optional)</div>
        <div className="sketch-hint">Click an edge of the part in the 3D view; Shift or Ctrl + click adds more, and clicking a picked edge again removes it. Picked edges win over the faces and the edge filter below.</div>
        {p.edges.map((e, i) => <div className="pd-face-row" key={e.key}><span>Edge {i + 1} · {e.kind} · {e.length.toFixed(1)} mm</span><button onClick={() => p.onRemoveEdge(i)} aria-label={`Remove edge ${i + 1}`}><X size={11} /></button></div>)}
        {p.edges.length > 0 && <button className="outline-action" onClick={p.onClearEdges}><X size={11} /> Clear edges</button>}
      </>}
      {spec.surface && (spec.name === 'Reference Line' ? p.form.method === 'normal_surface' : spec.name === 'Reference Plane' ? p.form.ptype === 'tangent_surface' : p.form.method === 'on_surface') && <>
        <div className="property-divider" />
        <div className="eyebrow"><ScanFace size={10} /> SURFACE POINT</div>
        <div className="sketch-hint">Click the part in the 3D view where the {spec.name === 'Reference Line' ? 'line should start; it runs along the surface normal there' : spec.name === 'Reference Plane' ? 'plane should touch the surface; it lies flat against it there' : 'point should go'}. The latest click is used.</div>
        {p.faces.map((f, i) => <div className="pd-face-row" key={i}><span>({f.point.map((v) => v.toFixed(1)).join(', ')}){f.normal ? ` · normal (${f.normal.map((v) => v.toFixed(2)).join(', ')})` : ''}</span><button onClick={() => p.onRemoveFace(i)} aria-label="Clear surface point"><X size={11} /></button></div>)}
      </>}
      {spec.faces && <>
        <div className="property-divider" />
        <div className="eyebrow"><ScanFace size={10} /> SELECTED FACES {spec.faces === 'required' ? '(required)' : '(optional)'}</div>
        <div className="sketch-hint">{spec.facesHint} Choose Select in the viewport toolbar, then click faces of the part.</div>
        {p.faces.map((f, i) => <div className="pd-face-row" key={i}><span>Face {i + 1} · {f.type} · ({f.point.map((v) => v.toFixed(1)).join(', ')})</span><button onClick={() => p.onRemoveFace(i)} aria-label={`Remove face ${i + 1}`}><X size={11} /></button></div>)}
        {p.faces.length > 0 && <button className="outline-action" onClick={p.onClearFaces}><X size={11} /> Clear selection</button>}
      </>}
      {!p.editing?.legacy && <button className="apply-property" data-enter-default onClick={p.onApply} disabled={p.applying}><Check size={12} /> {p.applying ? 'Building with Open Cascade…' : applyLabel}</button>}
      {p.inspectionResult && <div className="sketch-hint">{p.inspectionResult}</div>}
      {p.editing && <>
        <button className="outline-action danger" onClick={p.onDelete}><Trash2 size={11} /> Delete {p.editing.name}</button>
        <button className="outline-action" onClick={p.onCancelEdit}><X size={11} /> Stop editing — back to creating new</button>
      </>}
    </>}
  </div>;
}

// The Properties tab for a kept sketch (Sketch.N) selected in the model
// tree: what it holds, what it sits on, and Change sketch support — moving
// it to another plane or offset rebuilds the features made from it.
export function SketchDefinitionPanel(p: {
  name: string; summary: string; usedBy: string[];
  supportValue: string; supportOptions: SupportOption[]; planeOffset: number;
  onApplySupport: (value: string, offset: number) => void;
  canEdit: boolean; onEdit: () => void; onDelete: () => void; onClose: () => void; applying: boolean;
}) {
  const [support, setSupport] = useState(p.supportValue);
  const [offset, setOffset] = useState(String(p.planeOffset));
  const onPlane = support.startsWith('plane:');
  const offsetValue = Number(offset);
  const changed = support !== p.supportValue || (onPlane && offsetValue !== p.planeOffset);
  return <div className="property-content">
    <div className="property-title"><Settings2 size={14} /><span><div className="eyebrow">SKETCH DEFINITION</div><strong>{p.name}</strong></span></div>
    <div className="sketch-hint pd-sketch-summary">{p.summary}</div>
    <div className="sketch-hint">{p.usedBy.length ? `Used by ${p.usedBy.join(', ')} — ${p.usedBy.length === 1 ? 'it follows' : 'they follow'} this sketch.` : 'Not used by a feature yet — pick a Sketch-Based tool to build from it.'}</div>
    <button className="apply-property" onClick={p.onEdit} disabled={!p.canEdit}><Pencil size={12} /> Edit in Sketch &amp; 2D</button>
    {!p.canEdit && <div className="sketch-notice">Kept before sketches stored their 2D geometry, so it can't be reopened for editing.</div>}
    <div className="property-divider" />
    <div className="eyebrow"><Pencil size={10} /> CHANGE SKETCH SUPPORT</div>
    <label className="property-input">Sketch support<select value={support} onChange={(e) => setSupport(e.target.value)}>
      {p.supportOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select></label>
    {onPlane && <label className="property-input">Sketch plane offset along its normal (mm)<input type="number" value={offset} onChange={(e) => setOffset(e.target.value)} /></label>}
    <button className="apply-property" data-enter-default onClick={() => p.onApplySupport(support, onPlane && Number.isFinite(offsetValue) ? offsetValue : 0)} disabled={!changed || p.applying || (onPlane && !Number.isFinite(offsetValue))}><Check size={12} /> {p.applying ? 'Building with Open Cascade…' : 'Apply support'}</button>
    <button className="outline-action danger" onClick={p.onDelete}><Trash2 size={11} /> Delete {p.name}</button>
    <button className="outline-action" onClick={p.onClose}><X size={11} /> Close — back to the active tool</button>
  </div>;
}
