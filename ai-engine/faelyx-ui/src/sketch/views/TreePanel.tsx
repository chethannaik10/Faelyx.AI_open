// The SKETCH TREE panel (left): Sketch.1, its plane and AbsoluteAxis, entity counts and the constraint list.
import {
  Target, Minus, Circle, Crosshair, ArrowLeftRight,
  ArrowDownToLine, Trash2, ChevronDown, RefreshCw, Square, Spline, Orbit, Axis3d, Image as ImageIcon, Eye, EyeOff, Lock, Wand2 } from 'lucide-react';
import { PanelHeaderLite, TreeRowLite } from '../PlanePicker';

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

export function TreePanel({ core }: { core: SketchUI }) {
  const {
    REF_HDIR, REF_ORIGIN, REF_VDIR, arcs, circles, clearSketch, constraints, curves, lines, loadExample, plane, points, removeConstraint, selected, setImageDialogOpen, setRefImage, setSelected, showLabel, refImage, updateRefImage,
  } = core;
  return (
    <aside className="model-panel">
      <PanelHeaderLite eyebrow="WORKSPACE" title="SKETCH TREE" />
      <div className="tree-content">
        <TreeRowLite icon={ChevronDown} label="Sketch.1" depth={0} />
        <TreeRowLite icon={Square} label={`${plane} Plane`} depth={1} muted />
        {/* AbsoluteAxis and its three levels (guide L689-709): selecting
            AbsoluteAxis highlights both axes; each level is selectable for
            constraints. */}
        <button type="button" className="tree-ref-row" onClick={() => setSelected([REF_HDIR, REF_VDIR])}><TreeRowLite icon={Axis3d} label="AbsoluteAxis" depth={1} /></button>
        <button type="button" className="tree-ref-row" onClick={() => setSelected([REF_ORIGIN])}><TreeRowLite icon={Crosshair} label="Origin" depth={2} muted={!selected.includes(REF_ORIGIN)} /></button>
        <button type="button" className="tree-ref-row" onClick={() => setSelected([REF_HDIR])}><TreeRowLite icon={ArrowLeftRight} label="HDirection" depth={2} muted={!selected.includes(REF_HDIR)} /></button>
        <button type="button" className="tree-ref-row" onClick={() => setSelected([REF_VDIR])}><TreeRowLite icon={ArrowDownToLine} label="VDirection" depth={2} muted={!selected.includes(REF_VDIR)} /></button>
        <TreeRowLite icon={Target} label={`${points.length} point${points.length === 1 ? '' : 's'}`} depth={1} muted />
        <TreeRowLite icon={Minus} label={`${lines.length} line${lines.length === 1 ? '' : 's'}`} depth={1} muted />
        <TreeRowLite icon={Circle} label={`${circles.length} circle${circles.length === 1 ? '' : 's'}`} depth={1} muted />
        <TreeRowLite icon={Spline} label={`${arcs.length} arc${arcs.length === 1 ? '' : 's'}`} depth={1} muted />
        <TreeRowLite icon={Orbit} label={`${curves.length} curve${curves.length === 1 ? '' : 's'}`} depth={1} muted />
        {/* Image to Sketch reference layer: locked (can't be picked or constrained), so it never interferes with the sketch or an extrusion. */}
        {refImage && (
          <div className="ref-layer" title="Reference image — locked: it can't be selected, constrained or extruded">
            <div className="ref-layer-row">
              <ImageIcon size={12} /><span className="ref-layer-name">{refImage.name}</span>
              <Lock size={10} className="ref-layer-lock" aria-label="Locked" />
              <button type="button" onClick={() => updateRefImage({ visible: !refImage.visible })} aria-label={refImage.visible ? 'Hide reference image' : 'Show reference image'}>{refImage.visible ? <Eye size={11} /> : <EyeOff size={11} />}</button>
              <button type="button" onClick={() => setImageDialogOpen(true)} aria-label="Trace again" title="Trace again"><Wand2 size={11} /></button>
              <button type="button" onClick={() => setRefImage(null)} aria-label="Remove reference image"><Trash2 size={11} /></button>
            </div>
            <label className="ref-layer-op"><span>Opacity</span>
              <input type="range" min={0.05} max={1} step={0.05} value={refImage.opacity} onChange={(e) => updateRefImage({ opacity: Number(e.target.value) })} /></label>
          </div>
        )}
        <div className="tree-separator">CONSTRAINTS ({constraints.length})</div>
        {constraints.map((c) => (
          <div className="constraint-row" key={c.id}>
            <span>{showLabel(c.label)}</span>
            <button onClick={() => removeConstraint(c.id)} aria-label={`Remove ${c.label}`}><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
      <div className="tree-footer">
        <button onClick={loadExample}><RefreshCw size={11} /> Load example</button>
        <button onClick={clearSketch}><Trash2 size={13} /></button>
      </div>
    </aside>
  );
}
