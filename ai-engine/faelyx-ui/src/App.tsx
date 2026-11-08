import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import StlViewport, { type CompassMode, type Inertia, type QuickView, type RenderStyle, type StlViewportHandle, type CameraState, type ReferenceGeom, type RefCreatePreview, type LinePreview, type SelectFilter, type ViewSketch } from './StlViewport';
import SketchWorkspace, { type ProfileLoop, type SketchWorkspaceHandle } from './SketchWorkspace';
import { API_BASE, SKETCH_ORIGIN_SVG, setSavedApiBase } from './config';
import DrawingWorkspace from './DrawingWorkspace';
import RenderWorkspace from './render/RenderWorkspace';
import CamWorkspace from './cam/CamWorkspace';
import CaeWorkspace from './cae/CaeWorkspace';
import { COMMON_KEYS, NAV_SCHEMES, NAV_SCHEME_LIST, loadNavSettings, saveNavSettings, type NavScheme, type NavSettings } from './navigation';
import { SECTION_DEFAULT, withPos, type SectionCfg, type SectionInfo } from './section';
import PartDesignPanel, { SketchDefinitionPanel } from './PartDesignPanel';
import HowToUse from './HowToUse';
import ImageTo3DDialog, { type MeshMeta } from './ImageTo3DDialog';
import { abToB64, b64ToAb } from './imageTo3D';
import { installUniversalEnter } from './universalEnter';
import { guide3D } from './howTo3D';
import { buildModelGeometry } from './modelGeometry';
import {
  PLANE_BASIS, REF_PLANE, SKETCH_LIFT_MM, TOOLS, TOOL_GROUPS, buildOperation, buildReferenceElement, defaultForm, extractOpenPath, featureSketchIds, mergeStl, mirrorFeatureLoop,
  buildReferencePlane, fieldLabel, fieldVisible, offsetCustomPlanes, parsePlaneSource, planeEntry, refLabel, refPlaneFrameOf, refPlaneLabel, referencePlanePositions, snapSlots, relinkFeature, sketchFits, sketchPlaneFrame, standalonePoints, supportFrame, toLocal, refLineOf,
  type EdgePick, type FacePick, type Form, type Frame, type KeptSketch, type OpContext, type OpenPath, type RefPlaneAxis, type SketchPlane, type SketchSupportRef, type ToolSpec,
} from './partDesign';
import { PLANE_COLORS } from './sketch/constants';
type IconType = React.ForwardRefExoticComponent<LucideProps & React.RefAttributes<SVGSVGElement>> | ((props: React.SVGProps<SVGSVGElement>) => React.ReactElement);
import {
  Activity, AlertTriangle, Archive, ArrowDownToLine, ArrowLeftRight, ArrowRight, ArrowUpRight, Axis3d, Box,
  BoxSelect, BrainCircuit, Check, ChevronDown, ChevronRight, Circle, CircleDot,
  CircleEllipsis, Command, Component, Copy, Crosshair, Cuboid, Download, Expand,
  Eye, EyeOff, FileBox, FileCheck, FilePlus2, FileText, FolderOpen, Grid2X2, Hammer, ImagePlus, Inspect, Landmark, Layers3,
  Link2, ListFilter, Maximize2, Menu, Minus, Move, Move3D, MousePointer2, PanelLeft,
  PanelRight, Paperclip, Palette, Pencil, Plus, Redo2, Rotate3d, RotateCw, Ruler, Scissors, ScanFace,
  Search, Send, Settings2, ShieldCheck, Sigma, Sparkles, Square, Target, Trash2, Undo2,
  Upload, FileSpreadsheet, WandSparkles, X, Zap, ZoomIn,
} from 'lucide-react';

type ProjectSummary = { name: string; updated_at: string };

// One real Pad or Pocket, CATIA Part Design style — the actual unit of
// the FEATURE HISTORY tree now, not decorative labels. `loops` is the
// committed sketch's traced profile (see SketchWorkspace's
// traceLoops/getExtrudeProfile) and `zOffset` is where that sketch plane
// sat along Z at the moment it was committed, so re-sending the whole
// list to cad_server.py's /build_part always rebuilds the same stack in
// the same order — see rebuildFromFeatures below.
// `plane`: set when the feature was sketched on a picked planar face
// instead of the default XY stack (see sketchSupport below).
// `local`: the origin is the sketch origin marker (sketch-local profiles).
// Supports saved before that put the origin at the canvas corner instead;
// loadProject converts them.
type SketchSupport = { origin: number[]; xDir: number[]; normal: number[]; local?: boolean };
// `tool`/`form`: the Part Design tool and definition-box values it was made
// with (so the tree can reopen it for editing); `extra`: the CATIA options
// sent on top of the base fields (see partDesign.buildOperation); `body`:
// which body it belongs to (absent = PartBody); `source`: the sketch
// geometry it was built from, kept so an edit rebuilds from the same sketch.
// `sketchId`: the kept sketch (Sketch.N) it was built from — when that
// sketch is edited or moved, the feature is re-derived from it.
// Features saved before these existed have none of them and rebuild as before.
type AppFeature = {
  id: string; name: string; op: string; depth: number; zOffset: number; loops: ProfileLoop[]; axis?: string; angle?: number; plane?: SketchSupport;
  tool?: string; form?: Form; extra?: Record<string, unknown>; body?: string; sketchId?: string;
  source?: { loops: ProfileLoop[]; openPath: OpenPath | null; points: [number, number][] };
};
// A whole-body op applied after the features — Dress-Up and Transformation
// features — sent to cad_server.py's /build_part alongside `features` (see
// Modifier there). The named fields are the pre-Part-Design shape; new
// modifiers carry everything in `extra`.
type AppModifier = {
  id: string; name: string; op: string; radius?: number; edgeFilter?: string; chamferAngle?: number; length2?: number; thickness?: number; plane?: string; axis?: string; spacing?: number; count?: number; angle?: number; factor?: number;
  tool?: string; form?: Form; extra?: Record<string, unknown>; body?: string; faces?: FacePick[]; edges?: EdgePick[];
};
// Bodies and Boolean operations (CATIA's Insert Body + Add/Remove/…).
type Body = { id: string; name: string; polarity: 'add' | 'remove' };
// A triangle mesh in the model (Image to 3D): the tree keeps this record; the STL itself lives in meshStoreRef
// (and in the saved project), so it stays out of the undo history.
type MeshBody = { id: string; name: string; visible: boolean; engine: string; faces: number; size: number[]; volume: number; printable: boolean; source: string };
type BooleanEntry = { id: string; name: string; op: string; tool?: string; target: string; form?: Form };
const bodyOf = (x: { body?: string }) => x.body ?? 'PartBody';
// Items saved before definition boxes were stored: which tool made them.
const LEGACY_TOOL: Record<string, string> = {
  pad: 'Pad', pocket: 'Pocket', revolve: 'Shaft', fillet: 'Edge Fillet', chamfer: 'Chamfer', shell: 'Shell', mirror_body: 'Mirror',
  linear_pattern_body: 'Rectangular Pattern', circular_pattern_body: 'Circular Pattern', scale_body: 'Scaling',
};
// ReferenceGeom (Reference Plane/Axis/Coordinate System) is defined in and
// imported from StlViewport.tsx, since it's purely viewport-rendering state
// — see the import above.

// Formula / Parameters editor (CATIA Workbook: the Formula/Knowledge
// toolbar's Formula editor + Design Table) — named parameters with a
// simple formula expression that can reference other parameters by name.
type Param = { id: string; name: string; formula: string };

// Resolves `expr` to a number given already-known parameter values,
// substituting known names (longest first, so "Wall_Thickness" doesn't
// get partially matched by a shorter name that happens to be a prefix)
// before handing the rest to a strict numbers-and-operators-only check —
// this is what keeps Function() below from ever running anything but
// arithmetic, no matter what the user types.
function evaluateFormula(expr: string, values: Record<string, number>): number | null {
  let substituted = expr;
  for (const name of Object.keys(values).sort((a, b) => b.length - a.length)) {
    substituted = substituted.split(name).join(`(${values[name]})`);
  }
  if (!substituted.trim() || !/^[0-9+\-*/().\s]*$/.test(substituted)) return null;
  try {
    const result = Function(`"use strict"; return (${substituted});`)();
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

// Iteratively resolves every parameter's formula, so "B = A + 2" works
// regardless of which order A and B were defined in — each pass resolves
// whatever it now has enough known values for, up to a handful of passes
// (more than enough for the depth of parameter chaining a phase-1
// Formula editor is meant to support).
function computeParamValues(parameters: Param[]): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  for (const p of parameters) values[p.name] = null;
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    const known: Record<string, number> = {};
    for (const [name, value] of Object.entries(values)) if (value !== null) known[name] = value;
    for (const p of parameters) {
      if (values[p.name] !== null) continue;
      const result = evaluateFormula(p.formula, known);
      if (result !== null) { values[p.name] = result; changed = true; }
    }
    if (!changed) break;
  }
  return values;
}

// Minimal CSV parser for Design Table import — plain comma-separated
// cells, no quoted-field escaping, matching the scope of this phase-1
// pass (CATIA's own Design Table is an actual spreadsheet; a fuller CSV
// parser is a later enhancement, not a "port this workbook chapter" one).
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(',').map((c) => c.trim()));
  return { headers, rows };
}

function FormulaEditorPanel({ parameters, onAdd, onRename, onFormula, onRemove, onClose, designTable, onImportClick, onApplyRow }: {
  parameters: Param[];
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onFormula: (id: string, formula: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  designTable: { headers: string[]; rows: string[][] } | null;
  onImportClick: () => void;
  onApplyRow: (row: string[]) => void;
}) {
  const values = computeParamValues(parameters);
  return <div className="formula-editor" onClick={(event) => event.stopPropagation()}>
    <div className="formula-editor-head"><span><Sigma size={13} /> FORMULA EDITOR</span><button onClick={onClose} aria-label="Close"><X size={12} /></button></div>
    <div className="formula-editor-list">
      {parameters.map((p) => (
        <div className="formula-row" key={p.id}>
          <input className="formula-name" value={p.name} onChange={(event) => onRename(p.id, event.target.value)} />
          <span>=</span>
          <input className="formula-expr" value={p.formula} onChange={(event) => onFormula(p.id, event.target.value)} placeholder="e.g. Wall_Thickness * 2" />
          <span className={`formula-value ${values[p.name] === null ? 'formula-invalid' : ''}`}>{values[p.name] === null ? '—' : values[p.name]!.toFixed(3)}</span>
          <button onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name}`}><Trash2 size={11} /></button>
        </div>
      ))}
      {parameters.length === 0 && <div className="sketch-hint">No parameters yet — add one, or import a Design Table CSV below.</div>}
    </div>
    <button className="formula-add" onClick={onAdd}><Plus size={12} /> Add parameter</button>
    <div className="property-divider" />
    <div className="formula-dt-row">
      <span><FileSpreadsheet size={12} /> Design Table</span>
      <button onClick={onImportClick}><Upload size={11} /> Import CSV</button>
    </div>
    {designTable ? (
      <div className="formula-dt-table">
        <div className="formula-dt-header">{designTable.headers.map((h) => <span key={h}>{h}</span>)}<span /></div>
        {designTable.rows.map((row, index) => (
          <div className="formula-dt-row-data" key={index}>
            {row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}
            <button onClick={() => onApplyRow(row)}>Apply</button>
          </div>
        ))}
      </div>
    ) : (
      <div className="sketch-hint">Import a CSV with a header row of parameter names to load configurations, same as CATIA's own Design Table — each row's "Apply" creates or overwrites parameters to match.</div>
    )}
  </div>;
}

type TreeProps = { icon: IconType; label: string; depth?: number; selected?: boolean; muted?: boolean; warning?: boolean; onClick?: () => void; onDoubleClick?: () => void; onDelete?: () => void; badge?: string; title?: string };

// Toolbox icons for the CATIA Part Design tools (partDesign.TOOL_GROUPS).
const TOOL_ICONS: Record<string, IconType> = {
  'Image to 3D': Sparkles, Pad: ArrowDownToLine, Pocket: ScissorsIcon as IconType, Shaft: RotateCw, Groove: RotateCw, Hole: CircleDot,
  Rib: Rotate3d, Slot: Rotate3d, Stiffener: Minus, 'Multi-sections Solid': Layers3, 'Removed Multi-sections Solid': Layers3, 'Drafted Filleted Pad': ArrowDownToLine,
  'Edge Fillet': Circle, 'Variable Fillet': Circle, Chamfer: ArrowLeftRight, Draft: BoxSelect, Shell: Cuboid, Thickness: Layers3, 'Thread/Tap': Sigma,
  'Remove Face': Trash2, 'Face-Face Fillet': Circle, 'Tritangent Fillet': Circle,
  Split: ScissorsIcon as IconType, 'Thick Surface': Layers3, 'Close Surface': Box, 'Sew Surface': Link2,
  Translation: Move, Rotation: RotateCw, Symmetry: ArrowLeftRight, Mirror: Copy, 'Mirror Feature': ArrowLeftRight, 'Rectangular Pattern': ListFilter,
  'Circular Pattern': CircleEllipsis, 'User Pattern': Crosshair, Scaling: Expand,
  'Insert Body': Plus, Add: Plus, Remove: Minus, Intersect: Component, Assemble: Component, 'Remove Lump': Trash2, 'Union Trim': ScissorsIcon as IconType,
  'Reference Plane': Square, 'Reference Axis': Axis3d, 'Coordinate System': Crosshair, 'Reference Point': CircleDot, 'Reference Line': ArrowUpRight,
  'Mass Properties': Activity, 'Interference Check': Inspect, 'Model Validation': ShieldCheck,
  'AI Feature Assist': WandSparkles, 'AI Analyze Model': BrainCircuit, 'Optimize Design': Sparkles,
};

// Takes lucide's `size` like the other icons (an unknown `size` attribute
// on <svg> otherwise leaves it without a width/height).
function ScissorsIcon({ size = 24, ...props }: React.ComponentProps<'svg'> & { size?: number }) { return <svg width={size} height={size} {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.5 8.5 10 10M8.5 15.5l10-10"/></svg>; }
function MoreDots({ vertical = false }: { vertical?: boolean }) { return <span className={`more-dots ${vertical ? 'more-dots-v' : ''}`}><i /><i /><i /></span>; }

function IconButton({ icon: Icon, label, active = false, onClick, disabled = false }: { icon: IconType; label: string; active?: boolean; onClick?: () => void; disabled?: boolean }) {
  // title, not just aria-label — aria-label is screen-reader-only and
  // shows nothing on hover; every one of these is an icon with no
  // visible text, so the native browser tooltip is what actually
  // answers "what does this button do" for a mouse user.
  return <button className={`icon-btn ${active ? 'active' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}><Icon size={14} /></button>;
}

function PanelHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="panel-header"><div><div className="eyebrow">{eyebrow}</div><strong>{title}</strong></div>{action}</div>;
}

// A toolbox entry. Tools with no working implementation are disabled; the
// tooltip says why (partDesign.ToolSpec.reason).
function ToolButton({ tool, active, onClick }: { tool: ToolSpec; active: boolean; onClick: () => void }) {
  const Icon = (TOOL_ICONS[tool.name] ?? Box) as IconType;
  const off = tool.kind === 'unavailable';
  return <button className={`tool-item ${active ? 'selected' : ''} ${off ? 'tool-unavailable' : ''}`} onClick={onClick} disabled={off}>
    <span className="tool-icon"><Icon size={14} /></span><span>{tool.name}</span>{tool.shortcut && <kbd>{tool.shortcut}</kbd>}
    <span className="custom-tooltip"><strong>{tool.name.toUpperCase()}</strong><small>{tool.description}</small>{off && <em>{tool.reason}</em>}{tool.shortcut && <em>Shortcut: {tool.shortcut}</em>}</span>
  </button>;
}

function TreeNode({ icon: Icon, label, depth = 0, selected = false, muted = false, warning = false, onClick, onDoubleClick, onDelete, badge, title }: TreeProps) {
  return <div className={`tree-row-wrap ${selected ? 'tree-selected-wrap' : ''}`}>
    <button className={`tree-row ${selected ? 'tree-selected' : ''} ${muted ? 'muted' : ''}`} style={{ paddingLeft: `${10 + depth * 14}px` }} onClick={onClick} onDoubleClick={onDoubleClick} title={title}>
      <Icon size={13} /><span>{label}</span>{badge && <span className="tree-badge">{badge}</span>}{warning && <span className="tree-warning">!</span>}
    </button>
    {onDelete && <button className="tree-delete" onClick={onDelete} aria-label={`Delete ${label}`} title={`Delete ${label}`}><Trash2 size={11} /></button>}
  </div>;
}

// CATIA's Quick View toolbar (Front/Back/Left/Right/Top/Bottom/Iso) and its
// View Mode toolbar (Wireframe/Shading/Shading with Edges) — the labels the
// rest of this file already used (`orientation`, `display`) map onto them
// one-to-one, so the existing state doubles as the real thing instead of
// needing a parallel set of enums.
// `name` is what the Views menu (top right of the 3D viewport) shows, in
// this order.
const QUICK_VIEWS: { key: QuickView; label: string; name: string }[] = [
  { key: 'iso', label: 'ISO', name: 'Isometric (Iso)' },
  { key: 'front', label: 'FRONT', name: 'Front' }, { key: 'back', label: 'BACK', name: 'Back' },
  { key: 'left', label: 'LEFT', name: 'Left' }, { key: 'right', label: 'RIGHT', name: 'Right' },
  { key: 'top', label: 'TOP', name: 'Top' }, { key: 'bottom', label: 'BOTTOM', name: 'Bottom' },
];
const orientationToQuickView = (label: string): QuickView =>
  (QUICK_VIEWS.find((v) => v.label === label.toUpperCase())?.key) ?? 'iso';
const RENDER_STYLES: { key: RenderStyle; label: string }[] = [
  { key: 'shaded', label: 'Shaded' },
  { key: 'shaded-edges', label: 'Shaded with Edges' },
  { key: 'wireframe', label: 'Wireframe' },
];
const displayToRenderStyle = (label: string): RenderStyle =>
  (RENDER_STYLES.find((s) => s.label === label)?.key) ?? 'shaded-edges';

// CATIA's Apply Material tool: a small material library with real
// densities (g/cm³), so picking one gives the Measure Inertia panel a
// genuine Mass instead of a made-up number. Not CATIA's full Material
// Library Workbench — just enough to make "Apply Material" mean something.
const MATERIALS: { id: string; label: string; densityGPerCm3: number }[] = [
  { id: 'aluminum-6061', label: 'Aluminum 6061', densityGPerCm3: 2.70 },
  { id: 'steel-1018', label: 'Steel (1018)', densityGPerCm3: 7.87 },
  { id: 'stainless-304', label: 'Stainless Steel 304', densityGPerCm3: 8.00 },
  { id: 'titanium-ti6al4v', label: 'Titanium (Ti-6Al-4V)', densityGPerCm3: 4.43 },
  { id: 'brass-c360', label: 'Brass (C360)', densityGPerCm3: 8.50 },
  { id: 'abs-plastic', label: 'ABS Plastic', densityGPerCm3: 1.04 },
  { id: 'nylon-pa6', label: 'Nylon (PA6)', densityGPerCm3: 1.14 },
];

// Named Views: camera angles the user saves from the Views menu. Kept in
// localStorage (a per-browser convenience) — every read/write is guarded
// because storage can be blocked or empty.
type NamedView = { id: string; name: string; camera: CameraState };
const NAMED_VIEWS_KEY = 'faelyx.namedViews';
const loadNamedViews = (): NamedView[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(NAMED_VIEWS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string' && v.camera?.position && v.camera?.target && v.camera?.up) : [];
  } catch { return []; }
};
const saveNamedViews = (views: NamedView[]) => { try { localStorage.setItem(NAMED_VIEWS_KEY, JSON.stringify(views)); } catch { /* storage unavailable — views stay in memory for this session */ } };

function ModelViewport({
  display, orientation, selectedFeature, stlData, generating, stlViewportRef, sketchLoops, previewFrame, previewLabel, referenceGeoms,
  partHidden, onToggleHidden, compassMode, onSetCompassMode, onQuickView, onRotateStep, onFitAll,
  interactionMode, onSetInteractionMode, onSetRenderStyle, onInertia, onNormalView, sketchSupport, onSketchOnFace, onClearSketchSupport,
  faceButtonEnabled, faceButtonTitle, pickedFaceStatus, onFacePicked,
  keptSketches, showPlanes, onShowPlanes, showAxes, onShowAxes, onPlaneDoubleClick, onSketchDoubleClick, selectionCount, onReset, modelItemCount,
  edgePickEnabled, selectedEdges, onEdgePicked, onSketchPicked, onReferencePlaneDoubleClick, onBoxSelect, pickHint,
  refCreate, refPickEnabled, onRefSourcePicked, onRefDistanceEdit, onRefFlip, onRefDelta, snapPickEnabled, onSnapPicked, linePreview, selectedRefIds, onRefPicked, selectFilter, onSelectFilter,
  sectionOn, onSectionOn,
}: {
  display: string; orientation: string; selectedFeature: string; stlData: ArrayBuffer | null; generating: boolean;
  stlViewportRef: React.RefObject<StlViewportHandle>;
  sketchLoops: ProfileLoop[]; previewFrame: Frame; previewLabel: string; referenceGeoms: ReferenceGeom[];
  partHidden: boolean; onToggleHidden: () => void;
  compassMode: CompassMode | null; onSetCompassMode: (mode: CompassMode | null) => void;
  onQuickView: (view: QuickView, label: string) => void; onRotateStep: (degrees: number) => void; onFitAll: () => void;
  interactionMode: 'select' | 'orbit' | 'pan' | 'zoom'; onSetInteractionMode: (mode: 'select' | 'orbit' | 'pan' | 'zoom') => void;
  onSetRenderStyle: (style: RenderStyle, label: string) => void;
  onInertia: (inertia: Inertia | null) => void; onNormalView: () => void;
  sketchSupport: SketchSupport | null; onSketchOnFace: () => void; onClearSketchSupport: () => void;
  faceButtonEnabled: boolean; faceButtonTitle: string; pickedFaceStatus: string | null;
  onFacePicked: (face: { point: [number, number, number]; normal: [number, number, number] } | null) => void;
  keptSketches: ViewSketch[]; showPlanes: boolean; onShowPlanes: (show: boolean) => void; showAxes: boolean; onShowAxes: (show: boolean) => void;
  onPlaneDoubleClick: (plane: SketchPlane) => void; onSketchDoubleClick: (id: string) => void; selectionCount: number; onReset: () => void; modelItemCount: number;
  edgePickEnabled: boolean; selectedEdges: EdgePick[]; onEdgePicked: (edge: EdgePick | null, additive: boolean) => void; onSketchPicked: (id: string) => void; onReferencePlaneDoubleClick: (refId: string) => void; onBoxSelect: React.ComponentProps<typeof StlViewport>['onBoxSelect']; pickHint: string | null;
  refCreate: RefCreatePreview | null; refPickEnabled: boolean; onRefSourcePicked: (value: string | null, note?: string) => void; onRefDistanceEdit: (distance: number) => void; onRefFlip: () => void; onRefDelta: (delta: number) => void; snapPickEnabled: boolean; onSnapPicked: (point: number[]) => void; linePreview: LinePreview | null;
  selectedRefIds: string[]; onRefPicked: (id: string | null, additive: boolean) => void; selectFilter: SelectFilter; onSelectFilter: (filter: SelectFilter) => void;
  sectionOn: boolean; onSectionOn: (on: boolean) => void;
}) {
  const selected = selectedFeature !== 'None';
  // Cross-section tool (the Section button in the bottom bar turns it on): plane settings live here, the cut and its numbers come from StlViewport.
  const [sec, setSec] = useState<SectionCfg>(SECTION_DEFAULT);
  const [secInfo, setSecInfo] = useState<SectionInfo | null>(null);
  const secCfg = useMemo(() => ({ ...sec, on: sectionOn }), [sec, sectionOn]);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // The Views menu (⋮, top right): closes on Esc and on a click outside it.
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  useEffect(() => {
    if (!viewMenuOpen) return;
    const onDown = (event: PointerEvent) => { if (!(event.target as Element).closest?.('.view-menu, .view-menu-button')) setViewMenuOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setViewMenuOpen(false); } };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey, true); };
  }, [viewMenuOpen]);
  // Mouse navigation scheme + zoom-to-cursor (Hotkeys & Navigation settings, saved per browser).
  const [nav, setNav] = useState<NavSettings>(loadNavSettings);
  useEffect(() => { stlViewportRef.current?.setNavigation(nav); saveNavSettings(nav); }, [nav, stlViewportRef]);
  const navDef = NAV_SCHEMES[nav.scheme];
  const [namedViews, setNamedViews] = useState<NamedView[]>(loadNamedViews);
  const [newViewName, setNewViewName] = useState('');
  const updateNamedViews = (next: NamedView[]) => { setNamedViews(next); saveNamedViews(next); };
  const saveCurrentView = () => {
    const camera = stlViewportRef.current?.getCameraState();
    if (!camera) return;
    const name = newViewName.trim() || `View ${namedViews.length + 1}`;
    updateNamedViews([...namedViews, { id: `nv-${Date.now().toString(36)}`, name, camera }]);
    setNewViewName('');
  };
  const currentView = orientationToQuickView(orientation);
  return <div className={`model-viewport display-${display.toLowerCase().replace(/ /g, '-')}`}>
    <div className="viewport-grid" />
    <div className="viewport-topline"><span>START WORKSPACE <b>/</b> 3D DESIGN <b>/</b> PART_001</span><span className="viewport-live"><span className="live-dot" /> {stlData ? 'LIVE — OPEN CASCADE' : 'LIVE PREVIEW'}
      {/* Same two actions, in the same spot, as Sketch & 2D's top bar. Recenter View moves only the camera; Reset (below) clears the model after confirming. */}
      <button className="viewport-text-action" onClick={onFitAll} aria-label="Recenter view"><Maximize2 size={12} /> Recenter View</button>
      <button className="viewport-text-action viewport-text-action-danger" onClick={() => { setResetConfirmOpen(true); setViewMenuOpen(false); setViewSettingsOpen(false); }} aria-label="Reset part"><Trash2 size={12} /> Reset</button>
      <button className={viewSettingsOpen ? 'view-settings-on' : ''} aria-label="View settings" title="View settings" aria-expanded={viewSettingsOpen} onClick={() => { setViewSettingsOpen((v) => !v); setViewMenuOpen(false); }}><Grid2X2 size={12} /></button><button className={`view-menu-button ${viewMenuOpen ? 'view-settings-on' : ''}`} aria-label="Views" title="Views" aria-haspopup="menu" aria-expanded={viewMenuOpen} onClick={() => { setViewMenuOpen((v) => !v); setViewSettingsOpen(false); }}><MoreDots vertical /></button></span></div>
    {viewMenuOpen && <div className="view-menu" role="menu" aria-label="Views">
      {QUICK_VIEWS.map((v) => <button key={v.key} role="menuitemradio" aria-checked={currentView === v.key} onClick={() => { onQuickView(v.key, v.label); setViewMenuOpen(false); }}><span>{v.name}</span>{currentView === v.key && <span className="view-menu-check">✓</span>}</button>)}
      <div className="view-menu-divider" role="separator" />
      <div className="view-menu-heading">Named Views</div>
      {namedViews.length === 0 && <div className="view-menu-empty">No saved views yet</div>}
      {namedViews.map((v) => <div key={v.id} className="view-menu-named">
        <button role="menuitem" title={`Go to ${v.name}`} onClick={() => { stlViewportRef.current?.setCameraState(v.camera); setViewMenuOpen(false); }}><span>{v.name}</span></button>
        <button className="view-menu-delete" role="menuitem" aria-label={`Delete named view ${v.name}`} onClick={() => updateNamedViews(namedViews.filter((n) => n.id !== v.id))}><X size={11} /></button>
      </div>)}
      <div className="view-menu-save">
        <input value={newViewName} placeholder="Name this view" aria-label="Named view name" maxLength={40} onChange={(event) => setNewViewName(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') saveCurrentView(); }} />
        <button role="menuitem" aria-label="Save current view" title="Save current camera angle" onClick={saveCurrentView}><Plus size={11} /></button>
      </div>
    </div>}
    {resetConfirmOpen && <div className="reset-confirm-overlay" onClick={() => setResetConfirmOpen(false)}>
      <div className="reset-confirm-box" onClick={(evt) => evt.stopPropagation()}>
        <div className="reset-confirm-title"><AlertTriangle size={16} /> Reset the part?</div>
        <p className="reset-confirm-body">
          This clears the {modelItemCount} item{modelItemCount === 1 ? '' : 's'} in the model tree (features, sketches kept from Sketch &amp; 2D, bodies, Boolean operations and reference elements) and returns the view to Isometric. The sketch on the Sketch &amp; 2D canvas is not touched. Ctrl+Z brings the part back.
        </p>
        <div className="reset-confirm-actions">
          <button className="reset-confirm-no" onClick={() => setResetConfirmOpen(false)}>No</button>
          <button className="reset-confirm-yes" onClick={() => { setResetConfirmOpen(false); onReset(); }}>Yes, reset</button>
        </div>
      </div>
    </div>}
    {viewSettingsOpen && <div className="view-settings" onClick={(event) => event.stopPropagation()}>
      <div className="appearance-panel-head">VIEW SETTINGS<button onClick={() => setViewSettingsOpen(false)} aria-label="Close view settings"><X size={12} /></button></div>
      <label className="appearance-row"><span>Show planes (Front, Top, Right)</span><input type="checkbox" checked={showPlanes} onChange={(event) => onShowPlanes(event.target.checked)} /></label>
      <label className="appearance-row"><span>Show X, Y, Z axes</span><input type="checkbox" checked={showAxes} onChange={(event) => onShowAxes(event.target.checked)} /></label>
      <div className="appearance-panel-head appearance-panel-subhead">HOTKEYS &amp; NAVIGATION</div>
      <label className="appearance-row"><span>Mouse scheme</span><select value={nav.scheme} onChange={(event) => setNav((n) => ({ ...n, scheme: event.target.value as NavScheme }))}>{NAV_SCHEME_LIST.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
      <label className="appearance-row"><span>Zoom toward cursor</span><input type="checkbox" checked={nav.zoomToCursor} onChange={(event) => setNav((n) => ({ ...n, zoomToCursor: event.target.checked }))} /></label>
      <dl className="nav-keys">{[...navDef.rows, ...COMMON_KEYS].map(([action, binding]) => <div key={action}><dt>{action}</dt><dd>{binding}</dd></div>)}</dl>
    </div>}
    <div className="model-stage">
      {/* StlViewport (and its orbit/pan/zoom camera) is now ALWAYS mounted
          here, not just once a part exists — real Open Cascade geometry
          when stlData is present, and either way a live purple outline of
          whatever's currently sketched in Sketch & 2D at Z=stackTop (see
          sketchLoops). That's what makes Orbit/Pan/Zoom do something even
          before your first Apply changes, and is the actual "link" between
          the 2D and 3D workspaces — not just data plumbing at extrude time. */}
      <StlViewport ref={stlViewportRef} section={secCfg} onSectionChange={setSec} onSectionInfo={setSecInfo} stlData={stlData} sketchLoops={sketchLoops} sketchPlane={previewFrame} referenceGeoms={referenceGeoms} onInertia={onInertia} onFacePicked={onFacePicked}
        keptSketches={keptSketches} sketchLift={SKETCH_LIFT_MM} showPlanes={showPlanes} showAxes={showAxes} onPlaneDoubleClick={onPlaneDoubleClick} onSketchDoubleClick={onSketchDoubleClick} onMiddleDoubleClick={onFitAll}
        edgePickEnabled={edgePickEnabled} selectedEdges={selectedEdges} onEdgePicked={onEdgePicked} onSketchPicked={onSketchPicked} onReferencePlaneDoubleClick={onReferencePlaneDoubleClick} onBoxSelect={onBoxSelect}
        refCreate={refCreate} refPickEnabled={refPickEnabled} onRefSourcePicked={onRefSourcePicked} onRefDistanceEdit={onRefDistanceEdit} onRefFlip={onRefFlip} onRefDelta={onRefDelta} snapPickEnabled={snapPickEnabled} onSnapPicked={onSnapPicked} linePreview={linePreview} selectedRefIds={selectedRefIds} onRefPicked={onRefPicked} selectFilter={selectFilter} />
      <div className="select-filter" role="group" aria-label="Selection filter">
        {([['all', 'All', 'Select anything (Shift+A)'], ['points', 'Points', 'Select only points (Shift+P)'], ['lines', 'Lines', 'Select only lines, curves and edges (Shift+L)'], ['faces', 'Faces', 'Select only faces and planes (Shift+F)']] as const).map(([key, label, title]) => <button key={key} type="button" className={selectFilter === key ? 'select-filter-on' : ''} title={title} aria-pressed={selectFilter === key} onClick={() => onSelectFilter(key)}>{label}</button>)}
      </div>
      {pickHint && <div className="pick-hint">{pickHint}</div>}
      {pickedFaceStatus && pickedFaceStatus !== 'checking' && <div className={`model-label face-chip face-chip-${pickedFaceStatus}`} style={{ top: sketchSupport ? 40 : 12, left: 12 }}><ScanFace size={11} /> {faceButtonTitle}</div>}
      {sketchSupport && <div className="model-label" style={{ top: 12, left: 12 }}><Pencil size={11} /> Sketch support: picked face — the next sketch-based feature builds there <button className="viewport-text-action" onClick={onClearSketchSupport}>Use sketch plane</button></div>}
      {generating && <div className="model-label" style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}><Sparkles size={11} /> Generating with Open Cascade…</div>}
      {selected && <div className="selection-toolbar"><b>{selectedFeature}</b><button><Pencil size={12} /> Edit</button><button><Ruler size={12} /> Measure</button><button onClick={onToggleHidden}>{partHidden ? <EyeOff size={12} /> : <Eye size={12} />} {partHidden ? 'Show' : 'Hide'}</button><button><Sparkles size={12} /> AI Analyze</button></div>}
      {stlData && partHidden && <div className="model-label" style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}><EyeOff size={12} /> Part hidden — Show it above or from the toolbar below.</div>}
    </div>
    {sectionOn && <SectionPanel cfg={sec} info={secInfo} hasPart={!!stlData} onCfg={setSec} onClose={() => onSectionOn(false)} onLook={() => stlViewportRef.current?.viewSection()} />}
    <ViewCube orientation={orientation} onFace={(view, label) => onQuickView(view, label)} onRotateStep={onRotateStep} />
    <div className="coordinate-readout"><span>X: <b>42.50</b></span><span>Y: <b>18.25</b></span><span>Z: <b>12.40</b></span></div>
    <div className="coordinate-triad"><span className="triad-x">X</span><span className="triad-y">Y</span><span className="triad-z">Z</span><i className="triad-line-x" /><i className="triad-line-y" /><i className="triad-line-z" /></div>
    <div className="navigation-bar">
      <IconButton icon={MousePointer2} label="Select" active={interactionMode === 'select'} onClick={() => onSetInteractionMode('select')} />
      <IconButton icon={Rotate3d} label="Orbit" active={interactionMode === 'orbit'} onClick={() => onSetInteractionMode('orbit')} />
      <IconButton icon={Move} label="Pan" active={interactionMode === 'pan'} onClick={() => onSetInteractionMode('pan')} />
      <IconButton icon={ZoomIn} label="Zoom" active={interactionMode === 'zoom'} onClick={() => onSetInteractionMode('zoom')} />
      <IconButton icon={Maximize2} label="Fit all" onClick={onFitAll} />
      <IconButton icon={ScanFace} label="Normal view" onClick={onNormalView} />
      <IconButton icon={Pencil} label={faceButtonTitle} active={!!sketchSupport} disabled={!faceButtonEnabled} onClick={onSketchOnFace} />
      <span className="nav-divider" />
      <IconButton icon={Move3D} label="Compass" active={compassMode !== null} onClick={() => onSetCompassMode(compassMode === null ? 'translate' : compassMode === 'translate' ? 'rotate' : null)} />
      {compassMode && <span className="nav-compass-mode">{compassMode === 'translate' ? 'move' : 'rotate'}</span>}
    </div>
    <div className="render-style-bar">{RENDER_STYLES.map((s) => <button key={s.key} className={displayToRenderStyle(display) === s.key ? 'nav-active' : ''} onClick={() => onSetRenderStyle(s.key, s.label)}>{s.label}</button>)}</div>
  </div>;
}

// Bottom-of-viewport panel for the cross-section tool: how the plane is chosen, where it is, and the section properties of the cut face.
const secNum = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3 ? v.toExponential(3) : String(+v.toPrecision(5)));
function SectionPanel({ cfg, info, hasPart, onCfg, onClose, onLook }: {
  cfg: SectionCfg; info: SectionInfo | null; hasPart: boolean; onCfg: (cfg: SectionCfg) => void; onClose: () => void; onLook: () => void;
}) {
  const ok = !!info && hasPart;
  const range = ok ? info.max - info.min : 0;
  const move = (value: number) => { if (ok && Number.isFinite(value)) onCfg(withPos(cfg, value, info)); };
  return <div className="section-panel" role="group" aria-label="Cross section" onKeyDown={(event) => event.stopPropagation()}>
    <div className="section-row">
      <span className="section-title"><Scissors size={12} /> CROSS SECTION</span>
      <div className="section-seg" role="group" aria-label="What the left mouse button does">
        <button className={cfg.mode === 'slide' ? 'on' : ''} onClick={() => onCfg({ ...cfg, mode: 'slide' })} title="Hold the left mouse button and drag in the view: the cut slides along with the mouse">Slide plane</button>
        <button className={cfg.mode === 'line' ? 'on' : ''} onClick={() => onCfg({ ...cfg, mode: 'line' })} title="Hold the left mouse button and drag a line across the part: it is cut along that line">Draw line</button>
      </div>
      <div className="section-seg" role="group" aria-label="Section plane">
        {(['x', 'y', 'z'] as const).map((a) => <button key={a} className={cfg.axis === a ? 'on' : ''} onClick={() => onCfg({ ...cfg, axis: a, pos: null })} title={`Cut with a plane normal to ${a.toUpperCase()}`}>{a.toUpperCase()}</button>)}
        <button className={cfg.axis === 'free' ? 'on' : ''} disabled={cfg.axis !== 'free'} title="A plane drawn with Draw line">Free</button>
      </div>
      <label className="section-pos"><span>{cfg.axis === 'free' ? 'Offset' : cfg.axis.toUpperCase()}</span>
        <input type="range" disabled={!ok || range <= 0} min={ok ? info.min : 0} max={ok ? info.max : 1} step={range > 0 ? range / 400 : 1} value={ok ? info.pos : 0} onChange={(event) => move(parseFloat(event.target.value))} aria-label="Section position" />
        <input type="number" className="section-num" disabled={!ok} step={0.5} value={ok ? +info.pos.toFixed(3) : 0} onChange={(event) => move(parseFloat(event.target.value))} aria-label="Section position in mm" /><em>mm</em>
      </label>
      <button className="section-btn" onClick={() => onCfg({ ...cfg, flip: !cfg.flip })} title="Cut away the other side"><ArrowLeftRight size={11} /> Flip side</button>
      <button className="section-btn" disabled={!ok || info.empty} onClick={onLook} title="Look straight at the cut face"><ScanFace size={11} /> Look at cut</button>
      <button className="section-btn" onClick={() => onCfg({ ...SECTION_DEFAULT, mode: cfg.mode })} title="Back to the middle Z plane"><RotateCw size={11} /> Reset</button>
      <button className="section-close" onClick={onClose} aria-label="Close the cross-section" title="Close the cross-section"><X size={12} /></button>
    </div>
    <div className="section-row section-readout">
      {!hasPart ? <span className="section-hint">Build a part first — then cut it here.</span>
        : !info || info.empty ? <span className="section-hint">The plane does not cut the part — drag it back over the part.</span>
        : <>
          <span>Area <b>{secNum(info.area)}</b> mm²</span>
          <span>Centroid <b>{info.centroid.map(secNum).join(', ')}</b></span>
          <span>I<sub>{info.uName}</sub> <b>{secNum(info.iu)}</b> mm⁴</span>
          <span>I<sub>{info.vName}</sub> <b>{secNum(info.iv)}</b> mm⁴</span>
          <span>Size <b>{secNum(info.width)} × {secNum(info.height)}</b> mm</span>
          <span>Perimeter <b>{secNum(info.perimeter)}</b> mm</span>
          <span>{info.loops} loop{info.loops === 1 ? '' : 's'}{info.holes ? ` · ${info.holes} hole${info.holes === 1 ? '' : 's'}` : ''}{info.open ? ' · open mesh' : ''}</span>
        </>}
    </div>
    <div className="section-hint">{cfg.mode === 'slide' ? 'Hold the left mouse button and drag in the view to slide the cut.' : 'Hold the left mouse button and drag a line across the part: the cut passes through that line.'} Middle and right buttons still pan, zoom and orbit.</div>
  </div>;
}

// The orientation cube, top right of the 3D viewport: an isometric cube
// whose TOP / FRONT / RIGHT faces snap to that view, in the same plane
// colours as Sketch & 2D and the primary planes; the face matching the
// current view is highlighted. Below it, the view's name between the two
// 45° rotate buttons.
const CUBE_FACES: { key: QuickView; label: string; plane: SketchPlane }[] = [
  { key: 'top', label: 'Top', plane: 'Top' }, { key: 'front', label: 'Front', plane: 'Front' }, { key: 'right', label: 'Right', plane: 'Right' },
];
function ViewCube({ orientation, onFace, onRotateStep }: { orientation: string; onFace: (view: QuickView, label: string) => void; onRotateStep: (degrees: number) => void }) {
  const current = orientation.toLowerCase();
  return <div className="view-cube-wrap">
    <div className="view-cube">{CUBE_FACES.map((f) => <button key={f.key} className={`cube-face cube-${f.key} ${current === f.key ? 'cube-active' : ''}`} style={{ '--cube-color': PLANE_COLORS[f.plane] } as React.CSSProperties}
      aria-label={`${f.label} view`} aria-pressed={current === f.key} title={`${f.label} view`} onClick={() => onFace(f.key, f.label)}>{f.label.toUpperCase()}</button>)}</div>
    <div className="cube-arrows"><button aria-label="Rotate view left 45°" title="Rotate 45° left" onClick={() => onRotateStep(-45)}>‹</button><span className="cube-caption">{current.startsWith('iso') ? 'ISO' : orientation.toUpperCase()}</span><button aria-label="Rotate view right 45°" title="Rotate 45° right" onClick={() => onRotateStep(45)}>›</button></div>
  </div>;
}

function WelcomeScreen({ onNewPart, onNewAssembly, onNewDrawing, onImportCad, projects, loadingProjects, onOpenProject, onBrowseProjects }: {
  onNewPart: () => void;
  onNewAssembly: () => void;
  onNewDrawing: () => void;
  onImportCad: () => void;
  projects: ProjectSummary[];
  loadingProjects: boolean;
  onOpenProject: (name: string) => void;
  onBrowseProjects: () => void;
}) {
  const fileColors = ['violet', 'blue', 'amber', 'teal'];
  return <main className="welcome-shell">
    <div className="welcome-state">
      <div className="welcome-mark"><Sparkles size={18} /><span>AI-NATIVE ENGINEERING</span></div>
      <h1>Welcome to <em>Faelyx</em> AI</h1>
      <p>Design. Analyze. Optimize. Manufacture.</p>
      <div className="start-actions">
        <button className="start-card primary" onClick={onNewPart}><span className="start-icon"><Plus size={19} /></span><span><strong>New Part</strong><small>Start a parametric design — sketch first, in 2D</small></span><ArrowRight size={14} /></button>
        <button className="start-card" onClick={onNewAssembly}><span className="start-icon"><Component size={18} /></span><span><strong>New Assembly</strong><small>Build a multi-body system</small></span><ArrowRight size={14} /></button>
        <button className="start-card" onClick={onNewDrawing}><span className="start-icon"><FileText size={18} /></span><span><strong>New Drawing</strong><small>Create a technical drawing</small></span><ArrowRight size={14} /></button>
      </div>
      <div className="welcome-lower">
        <div className="recent-title"><span>RECENT PROJECTS</span><button onClick={onBrowseProjects}><FolderOpen size={13} /> Browse all</button></div>
        <div className="recent-grid">
          {loadingProjects ? <div className="welcome-empty">Loading…</div>
            : projects.length === 0 ? <div className="welcome-empty">No saved projects yet — start with New Part.</div>
            : projects.slice(0, 4).map((project, index) => (
              <button className="recent-item" key={project.name} onClick={() => onOpenProject(project.name)}>
                <span className={`file-icon ${fileColors[index % fileColors.length]}`}><FileBox size={16} /></span>
                <span className="recent-detail"><strong>{project.name}</strong><small>{new Date(project.updated_at).toLocaleString()}</small></span>
                <ArrowUpRight size={13} />
              </button>
            ))}
        </div>
        <button className="import-button" onClick={onImportCad}><Upload size={14} /> Import CAD <span>STEP · IGES · STL</span></button>
      </div>
    </div>
  </main>;
}

function App() {
  // Every build/save/load failure used to go through window.alert(). Chrome
  // (and other browsers) silently drops repeated alert()/confirm() calls
  // once a page has shown "too many" of them — or once the user ticks
  // "Prevent this page from creating additional dialogs" — so a real
  // failure could produce zero visible feedback: you click Apply, nothing
  // happens, nothing to even suggest why. This banner can't be suppressed
  // that way, so every one of those paths now sets this instead.
  const [appError, setAppError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState('Pad');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => Object.fromEntries(TOOL_GROUPS.map((g) => [g.label, g.label !== 'AI ENGINEERING'])));
  // Each tool's definition-box values, remembered per tool while you work.
  const [forms, setForms] = useState<Record<string, Form>>({});
  const form = forms[activeTool] ?? defaultForm(activeTool);
  const setForm = (next: Form) => setForms((prev) => ({ ...prev, [activeTool]: next }));
  // The feature/modifier whose definition is open for editing (tree click).
  const [editingId, setEditingId] = useState<string | null>(null);
  // Edit mode: a different kept sketch picked as the feature's parent (applied with Update).
  const [editParent, setEditParent] = useState<string | null>(null);
  useEffect(() => { setEditParent(null); }, [editingId]);
  // Sketch → 3D: which plane the sketch in Sketch & 2D is on (polled below),
  // each plane's offset along its normal, and the chosen support ('sketch'
  // = the sketch's own plane, or a Reference Plane's id).
  const [sketchPlaneName, setSketchPlaneName] = useState<SketchPlane>('Front');
  const [planeOffsets, setPlaneOffsets] = useState<Record<SketchPlane, number>>({ Top: 0, Front: 0, Right: 0 });
  const [supportChoice, setSupportChoice] = useState('sketch');
  const [sketchSummary, setSketchSummary] = useState('');
  // Kept sketches (Sketch.N), bodies and Boolean operations.
  const [keptSketches, setKeptSketches] = useState<KeptSketch[]>([]);
  // Sketch → 3D transfer. `profileChoice`: which sketch the next
  // sketch-based feature takes its profile from — a kept sketch's id,
  // 'live' (what is on the Sketch & 2D canvas) or 'auto' (the selected
  // kept sketch, else the newest unused one). `editingSketchId`: the kept
  // sketch open for editing in Sketch & 2D. `sketchPanelId`: the kept
  // sketch whose definition the Properties tab shows.
  const [profileChoice, setProfileChoice] = useState('auto');
  const [editingSketchId, setEditingSketchId] = useState<string | null>(null);
  const [sketchPanelId, setSketchPanelId] = useState<string | null>(null);
  // A short, self-dismissing message that isn't an error.
  const [appNotice, setAppNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!appNotice) return;
    const id = window.setTimeout(() => setAppNotice(null), 8000);
    return () => window.clearTimeout(id);
  }, [appNotice]);
  // View settings: the three primary planes in the 3D viewport. A display
  // preference, remembered in this browser like the sketch appearance.
  const [showPlanes, setShowPlanes] = useState(() => { try { return localStorage.getItem('faelyx-show-planes') !== '0'; } catch { return true; } });
  useEffect(() => {
    try { localStorage.setItem('faelyx-show-planes', showPlanes ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [showPlanes]);
  // Keep Sketch (bottom bar): ON by default. While ON every sketch — on the principal planes, on Reference Planes and on any plane
  // opened in the Sketch & 2D workbench — is kept in the model tree automatically when you leave Sketch & 2D or move to another
  // plane. OFF leaves the sketch in the workbench.
  const [autoKeep, setAutoKeep] = useState(() => { try { return localStorage.getItem('faelyx-auto-keep') !== '0'; } catch { return true; } });
  useEffect(() => {
    try { localStorage.setItem('faelyx-auto-keep', autoKeep ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [autoKeep]);
  // Reflect (bottom bar): ON by default. The open sketch plane shows the sketches of the other, parallel planes as a locked,
  // non-selectable reflection — a view only, nothing is copied.
  const [reflectOn, setReflectOn] = useState(() => { try { return localStorage.getItem('faelyx-reflect') !== '0'; } catch { return true; } });
  useEffect(() => {
    try { localStorage.setItem('faelyx-reflect', reflectOn ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [reflectOn]);
  const [showAxes, setShowAxes] = useState(() => { try { return localStorage.getItem('faelyx-show-axes') !== '0'; } catch { return true; } });
  useEffect(() => {
    try { localStorage.setItem('faelyx-show-axes', showAxes ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [showAxes]);
  const [bodies, setBodies] = useState<Body[]>([{ id: 'PartBody', name: 'PartBody', polarity: 'add' }]);
  const [meshBodies, setMeshBodies] = useState<MeshBody[]>([]);
  const meshStoreRef = useRef<Map<string, ArrayBuffer>>(new Map());
  const [activeBody, setActiveBody] = useState('PartBody');
  const [booleans, setBooleans] = useState<BooleanEntry[]>([]);
  // Faces clicked in the viewport (Select mode) for Dress-Up tools.
  const [selectedFaces, setSelectedFaces] = useState<FacePick[]>([]);
  // Edges picked in the 3D view for Fillet / Chamfer / Variable Fillet.
  const [selectedEdges, setSelectedEdges] = useState<EdgePick[]>([]);
  const [treeSelection, setTreeSelection] = useState('Part 001');
  // Ctrl+A: ids of every model-tree item selected at once. Clicking any one
  // item (which changes treeSelection) drops back to a single selection.
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const keepMultiRef = useRef(false);
  useEffect(() => { if (keepMultiRef.current) { keepMultiRef.current = false; return; } setMultiSel([]); }, [treeSelection]);
  const [inspectorTab, setInspectorTab] = useState('AI ASSISTANT');
  const [display, setDisplay] = useState('Shaded with Edges');
  const [orientation, setOrientation] = useState('Isometric');
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [sectionOn, setSectionOn] = useState(false);
  // Sketch appearance (the "Style" popover beside Grid/Snap below) — line
  // and point width/color, plus measurement- and construction-line color.
  // Each stays `null` (meaning "use the sketch's own built-in default")
  // until the user actually moves that control, so a sketch nobody has
  // customized still renders exactly as before this feature existed; see
  // the appearance* props on SketchWorkspace. Persisted to localStorage
  // (purely a local display preference, unlike real project geometry —
  // see the "no mocks" project-persistence note above) so a chosen look
  // survives a reload; failures there are non-fatal, same as the rest of
  // this app's "never let a display nicety break the workspace" approach.
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [sketchLineColor, setSketchLineColor] = useState<string | null>(null);
  const [sketchLineWidth, setSketchLineWidth] = useState<number | null>(null);
  const [sketchPointColor, setSketchPointColor] = useState<string | null>(null);
  const [sketchPointRadius, setSketchPointRadius] = useState<number | null>(null);
  const [sketchMeasureColor, setSketchMeasureColor] = useState<string | null>(null);
  const [sketchConstructionColor, setSketchConstructionColor] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('faelyx-sketch-appearance') || '{}');
      if (saved.lineColor != null) setSketchLineColor(saved.lineColor);
      if (saved.lineWidth != null) setSketchLineWidth(saved.lineWidth);
      if (saved.pointColor != null) setSketchPointColor(saved.pointColor);
      if (saved.pointRadius != null) setSketchPointRadius(saved.pointRadius);
      if (saved.measureColor != null) setSketchMeasureColor(saved.measureColor);
      if (saved.constructionColor != null) setSketchConstructionColor(saved.constructionColor);
    } catch { /* no saved appearance yet, or it's corrupt — just use the defaults */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('faelyx-sketch-appearance', JSON.stringify({
        lineColor: sketchLineColor, lineWidth: sketchLineWidth,
        pointColor: sketchPointColor, pointRadius: sketchPointRadius,
        measureColor: sketchMeasureColor, constructionColor: sketchConstructionColor,
      }));
    } catch { /* storage unavailable/full — the picked look just won't survive a reload */ }
  }, [sketchLineColor, sketchLineWidth, sketchPointColor, sketchPointRadius, sketchMeasureColor, sketchConstructionColor]);
  // Sketcher options (CATIA's Tools > Options > Sketcher / Units): grid
  // Primary Spacing and Graduations per direction — V follows H unless
  // Allow Distortions is on — the document unit, and whether the cursor's
  // H/V is shown next to it while drawing. Same localStorage persistence as
  // the appearance settings above.
  const [sketchOptions, setSketchOptions] = useState<{ primaryH: number; gradH: number; primaryV: number; gradV: number; allowDistortions: boolean; units: 'mm' | 'cm' | 'in'; cursorCoords: boolean; originSnapPx: number; originConstraint: boolean }>(
    { primaryH: 100, gradH: 10, primaryV: 100, gradV: 10, allowDistortions: false, units: 'mm', cursorCoords: true, originSnapPx: 10, originConstraint: true },
  );
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('faelyx-sketch-options') || 'null');
      if (saved) setSketchOptions((o) => ({ ...o, ...saved }));
    } catch { /* nothing saved yet */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('faelyx-sketch-options', JSON.stringify(sketchOptions)); } catch { /* storage unavailable */ }
  }, [sketchOptions]);
  const setGridValue = (key: 'primaryH' | 'gradH' | 'primaryV' | 'gradV', raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    const value = key.startsWith('grad') ? Math.max(1, Math.round(v)) : v;
    setSketchOptions((o) => {
      const next = { ...o, [key]: value };
      // Without Allow Distortions the V row mirrors the H row.
      if (!o.allowDistortions) { next.primaryV = next.primaryH; next.gradV = next.gradH; }
      return next;
    });
  };
  const sketchGrid = { primaryH: sketchOptions.primaryH, gradH: sketchOptions.gradH, primaryV: sketchOptions.primaryV, gradV: sketchOptions.gradV };
  const resetSketchAppearance = () => {
    setSketchLineColor(null); setSketchLineWidth(null);
    setSketchPointColor(null); setSketchPointRadius(null);
    setSketchMeasureColor(null); setSketchConstructionColor(null);
  };
  // Resizable panes for the 3D Design workspace-grid (Model Tree / Toolbox /
  // Canvas / Inspector) — dragged via the .col-resizer handles between them.
  // The canvas column itself stays a flexible minmax(500px,1fr) track (see
  // the inline gridTemplateColumns below) so it can never be squeezed away
  // to nothing no matter how the side panels are resized.
  const [colWidths, setColWidths] = useState({ col1: 197, col2: 214, col4: 255 });
  const [resizingCol, setResizingCol] = useState<'col1' | 'col2' | 'col4' | null>(null);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
  const startColResize = (key: 'col1' | 'col2' | 'col4') => (evt: React.MouseEvent) => {
    evt.preventDefault();
    resizeStartRef.current = { x: evt.clientX, width: colWidths[key] };
    setResizingCol(key);
  };
  useEffect(() => {
    if (!resizingCol) return;
    const onMove = (evt: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const delta = evt.clientX - start.x;
      // col4 is the inspector panel on the right — you drag ITS left edge,
      // so moving the mouse right should shrink it, the opposite sign from
      // col1/col2 which grow when dragged right.
      const signedDelta = resizingCol === 'col4' ? -delta : delta;
      const next = Math.max(150, Math.min(480, start.width + signedDelta));
      setColWidths((prev) => ({ ...prev, [resizingCol]: next }));
    };
    const onUp = () => setResizingCol(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [resizingCol]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [image3dOpen, setImage3dOpen] = useState(false);       // the Image to 3D pop-up (TripoSR / Hunyuan3D 2.1)
  const [search, setSearch] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [uploadReady, setUploadReady] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  // The solid built by Open Cascade; what the viewport, Analyse and Machine get (stlData) is that plus the visible mesh bodies.
  const [solidStl, setStlData] = useState<ArrayBuffer | null>(null);
  const stlData = useMemo(() => {
    const parts = [solidStl, ...meshBodies.filter((m) => m.visible).map((m) => meshStoreRef.current.get(m.id) ?? null)].filter((p): p is ArrayBuffer => !!p);
    return parts.length === 0 ? null : parts.length === 1 ? parts[0] : mergeStl(parts);
  }, [solidStl, meshBodies]);
  // "Analyse" / "Machine" in 3D Design: a counter the destination workspace compares with the last request it handled.
  const [pushed, setPushed] = useState({ cae: 0, cam: 0 });
  const [generating, setGenerating] = useState(false);
  // The real FEATURE HISTORY: every Pad/Pocket committed so far, replayed
  // in order by cad_server.py's /build_part on every change (see
  // rebuildFromFeatures) — this is what "Apply changes" actually drives
  // now, not a fixed cube. `stackTop` is the old XY-stack height, only
  // carried through Save/Open for projects saved before sketches were
  // built on their own plane (planeOffsets above replaced it).
  const [features, setFeatures] = useState<AppFeature[]>([]);
  const [stackTop, setStackTop] = useState(0);
  // Sketch on Face: when a planar face of the part has been picked as the
  // sketch support, the next Pad/Pocket/Revolve is built on that plane
  // (pads grow along its outward normal) instead of the XY stack.
  const [sketchSupport, setSketchSupport] = useState<SketchSupport | null>(null);
  // The face last clicked in the 3D view (Select mode), checked against the
  // real B-rep by /face_at: only a planar face can carry a sketch. Drives
  // the Sketch on Face button's enabled state, tooltip and status chip.
  type FaceInfo = { point: number[]; normal: number[]; xDir: number[]; edges: number[][][] };
  const [pickedFace, setPickedFace] = useState<{ status: 'checking' | 'planar' | 'not-planar' | 'error'; message?: string; info?: FaceInfo } | null>(null);
  const faceCheckSeqRef = useRef(0);
  const handleFacePicked = (face: { point: [number, number, number]; normal: [number, number, number] } | null) => {
    const seq = ++faceCheckSeqRef.current;
    if (!face) { setPickedFace(null); return; }
    // Reference Point / Line on a surface: remember the clicked point and its normal; no backend round trip needed.
    if (TOOLS[activeTool]?.surface) { setSelectedFaces([{ point: face.point, type: 'surface', normal: face.normal }]); return; }
    setPickedFace({ status: 'checking' });
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/face_at`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...activeBodyApi(), point: face.point, normal: face.normal }),
        });
        if (seq !== faceCheckSeqRef.current) return;
        if (!res.ok) { setPickedFace({ status: 'error', message: await res.text() }); return; }
        const body = await res.json();
        setPickedFace(body.planar ? { status: 'planar', info: body } : { status: 'not-planar', message: body.reason });
        // Dress-Up tools that take faces collect every face clicked.
        if (TOOLS[activeTool]?.faces && !/^no face/.test(String(body.reason ?? ''))) {
          const type = body.planar ? 'planar' : /cylind/i.test(String(body.reason ?? '')) ? 'cylindrical' : 'curved';
          setSelectedFaces((prev) => [...prev, { point: face.point, type }]);
        }
      } catch {
        if (seq === faceCheckSeqRef.current) setPickedFace({ status: 'error', message: `backend not reachable at ${API_BASE}` });
      }
    })();
  };
  const faceButtonTitle = sketchSupport && pickedFace?.status !== 'planar'
    ? 'Sketching on a picked face — click to go back to the XY stack'
    : pickedFace?.status === 'planar' ? 'Sketch on this face — the next Pad/Pocket/Revolve builds on it'
    : pickedFace?.status === 'checking' ? 'Checking the picked face…'
    : pickedFace?.status === 'not-planar' ? `Can't sketch here: ${pickedFace.message ?? 'not a planar face'}`
    : pickedFace?.status === 'error' ? `Couldn't check the face: ${pickedFace.message ?? ''}`
    : 'Sketch on face — choose Select, then click a planar face of the part';
  const faceButtonEnabled = pickedFace?.status === 'planar' || (!!sketchSupport && pickedFace?.status !== 'checking');
  const sketchOnPickedFace = () => {
    if (pickedFace?.status !== 'planar' || !pickedFace.info) {
      // Button in its "active" state with nothing new picked: back to XY.
      if (sketchSupport) { setSketchSupport(null); sketchRef.current?.setProjectedEdges(null); }
      return;
    }
    const { point, normal: n, xDir: x, edges } = pickedFace.info;
    const y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
    // The sketch's own origin marker sits on the picked point: features
    // are built from sketch-local profiles, so the frame origin is the
    // point itself.
    const O = SKETCH_ORIGIN_SVG;
    const origin = [...point];
    setSketchSupport({ origin, xDir: x, normal: n, local: true });
    // The face's edges, projected into the new sketch as construction
    // geometry to snap to and dimension from (canvas coordinates: the
    // marker at O, canvas y down).
    const toCanvas = (P: number[]) => {
      const d = P.map((v, i) => v - origin[i]);
      return { x: O.x + d[0] * x[0] + d[1] * x[1] + d[2] * x[2], y: O.y - (d[0] * y[0] + d[1] * y[1] + d[2] * y[2]) };
    };
    sketchRef.current?.setProjectedEdges(edges.map((poly) => poly.map(toCanvas)));
    setPickedFace(null);
    setWorkspace('Sketch & 2D');
  };
  // Whole-body Modifiers (Fillet/Chamfer/Shell/Mirror Body/patterns/Scale)
  // applied after the feature stack above — see AppModifier. Reference
  // geometry (planes/axes/coordinate systems) is visual-only so it lives
  // separately and never goes to the backend.
  const [modifiers, setModifiers] = useState<AppModifier[]>([]);
  const [referenceGeoms, setReferenceGeoms] = useState<ReferenceGeom[]>([]);
  const [inspectionResult, setInspectionResult] = useState<{ tool: string; text: string } | null>(null);
  // Formula / Parameters editor state (see the Param type + helpers
  // above) — independent of the per-feature Depth/Radius/etc. fields
  // above; this is the standalone, cross-feature named-parameter set
  // CATIA's own ƒx/Knowledge toolbar manages.
  const [parameters, setParameters] = useState<Param[]>([
    { id: 'param1', name: 'Wall_Thickness', formula: '3' },
    { id: 'param2', name: 'Hole_Diameter', formula: 'Wall_Thickness * 2 + 4' },
  ]);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [designTable, setDesignTable] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const paramFileInputRef = useRef<HTMLInputElement>(null);
  // 3D Design viewport controls (CATIA Workbook: Quick View, View Mode /
  // Render Style, Hide/Show, Compass) — these actually drive the live
  // Three.js viewport via stlViewportRef's imperative handle, they aren't
  // just labels anymore. `display` and `orientation` above already held
  // the right shape of state (a render-style label and a view label) so
  // they're reused rather than duplicated.
  const stlViewportRef = useRef<StlViewportHandle>(null);
  const [partHidden, setPartHidden] = useState(false);
  const [compassMode, setCompassMode] = useState<CompassMode | null>(null);
  const [interactionMode, setInteractionMode] = useState<'select' | 'orbit' | 'pan' | 'zoom'>('orbit');
  // CATIA Workbook's Apply Material + Measure Inertia: `inertia` is the
  // real volume/area/centroid computed from the actual STL mesh (see
  // StlViewport's onInertia callback) and `materialId` picks a density
  // from MATERIALS, so Mass in the dock below is genuinely volume ×
  // density rather than a fixed placeholder number.
  // Only the setter/initial value are read today (no Mass dock or
  // material picker is rendered yet), so the unused halves are skipped.
  const [, setInertia] = useState<Inertia | null>(null);
  const [materialId] = useState<string>('aluminum-6061');
  // The app now always starts in 2D: on the Welcome screen, then into
  // Sketch & 2D (Front Plane) once a part is started. 3D Design is
  // something you switch to afterwards, once there's a profile to
  // extrude — see startNew() and the projectOpen gate below.
  const [workspace, setWorkspace] = useState('Sketch & 2D');
  // Gates the whole editing chrome behind a Welcome screen (New Part /
  // New Assembly / New Drawing / recent projects). Starts true — the app
  // now boots straight into Sketch & 2D's plane picker (same screen
  // startNew('Sketch & 2D') lands on) instead of stopping at Welcome first;
  // every other piece of state above (workspace, projectName, features,
  // stackTop, dimension, stlData) already carries the exact same fresh-part
  // defaults startNew() would set, so nothing else needs to change to make
  // that the real starting screen. Nothing in the app currently flips this
  // back to false, so WelcomeScreen (New Assembly/Drawing, Import CAD,
  // Recent Projects) is unreachable for now — say the word if any of those
  // still need a way in and we'll wire up a "Home" entry point back to it.
  const [projectOpen, setProjectOpen] = useState(true);

  // Project save/open — real files on disk via cad_server.py's /projects
  // endpoints (see the "Project persistence" section there), not
  // localStorage: a project saved on one machine is visible to anyone
  // else running that same backend, same as the rest of this app's
  // "no mocks" approach.
  const sketchRef = useRef<SketchWorkspaceHandle>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'synced' | 'unsaved' | 'saving'>('unsaved');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [pendingSketchLoad, setPendingSketchLoad] = useState<ReturnType<SketchWorkspaceHandle['getProjectData']> | null>(null);
  // Double-click-to-rename on the breadcrumb's project name (see the
  // mode-label JSX below) — a separate step from Save, per the user's
  // spec: rename first, Save persists it under the new name.
  const [renamingProject, setRenamingProject] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Flips on after the project's first successful save (whether that came
  // from the rename-then-Save flow, the legacy Save-prompts-for-a-name
  // fallback, or loading an already-saved project) — from then on, edits
  // persist themselves instead of waiting for another manual Save click.
  // See the dirty-tracking/autosave effect further down, after
  // saveProject is defined.
  const [autoSaveOn, setAutoSaveOn] = useState(false);
  // JSON fingerprint of the payload as of the last successful save/load —
  // null means "never saved," which is also what gates dirty-tracking off
  // (comparing against nothing would just mark a brand-new project dirty
  // the instant anything's drawn, before there's anywhere to save it to).
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const autoSaveDebounceRef = useRef<number | null>(null);
  // Set by loadProject; consumed by the dirty-tracking effect's very next
  // tick, which seeds lastSavedSnapshotRef from the settled post-load
  // state instead of reading it back synchronously (see loadProject).
  const needsSnapshotSeedRef = useRef(false);
  // "New part"/"New Assembly"/"New Drawing" go through requestNew (below
  // saveProject) instead of calling startNew directly, so an unsaved
  // sketch gets a save-or-discard prompt first — this is that prompt's
  // open/closed state, doubling as "which target was requested" (null =
  // closed).
  const [pendingNewTarget, setPendingNewTarget] = useState<string | null>(null);

  // Live preview of whatever's currently sketched in Sketch & 2D, shown as
  // an outline in the 3D viewport (see ModelViewport/StlViewport's
  // sketchLoops prop) — this is the actual "link" between the two
  // workspaces the user asked for. SketchWorkspace stays mounted at all
  // times now (the earlier fix for Extrude losing the sketch on tab
  // switch), so its ref is always live; a light poll is simpler and more
  // robust here than plumbing a change-callback through every sketch tool.
  const [sketchPreview, setSketchPreview] = useState<ProfileLoop[]>([]);
  // Sketch & 2D's own undo/redo history (see SketchWorkspace.tsx) lives
  // entirely inside that component; these two just mirror its canUndo/
  // canRedo booleans each tick so the toolbar buttons below can enable/
  // disable themselves and actually call into it.
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Live cursor position for the Sketch & 2D canvas, mirrored the same way
  // as canUndo/canRedo above — SketchWorkspace.tsx no longer draws its own
  // in-canvas coordinate badge (moved out per user request), so this drives
  // the X/Y/Z readout in the statusbar below instead. null while no
  // placement tool is tracking the cursor (or the mouse is off-canvas).
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const profile = sketchRef.current?.getExtrudeProfile();
      const data = sketchRef.current?.getProjectData();
      const open = extractOpenPath(data);
      const loops = profile && !profile.error ? profile.loops.map(toLocal) : [];
      // The 3D preview shows closed profiles and an open chain (a Rib
      // center curve or Stiffener profile) alike, sketch-local like the
      // features built from them.
      setSketchPreview(open ? [...loops, { kind: 'path', ...open }] : loops);
      if (data?.plane) setSketchPlaneName(data.plane);
      const pts = standalonePoints(data).length;
      setSketchSummary([
        loops.length ? `${loops.length} closed profile${loops.length === 1 ? '' : 's'}` : null,
        open ? 'an open chain' : null,
        pts ? `${pts} point${pts === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(', ') || 'The sketch in Sketch & 2D is empty.');
      const hist = sketchRef.current?.getHistoryState();
      setCanUndo(!!hist?.canUndo);
      setCanRedo(!!hist?.canRedo);
      setCursorPos(sketchRef.current?.getCursorPosition() ?? null);
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  // CATIA-standard Grid/Snap shortcuts — G and S, matching the [Grid:
  // ON/OFF]/[Snap: ON/OFF] statusbar toggles below exactly (same
  // setGrid/setSnap setters, so the badges update immediately either
  // way). Scoped to the Sketch & 2D tab, where grid/snap actually apply,
  // and skipped while typing in a field so "S"/"G" in a project name (or
  // anywhere else) types normally instead of toggling the grid.
  useEffect(() => {
    const onKey = (evt: KeyboardEvent) => {
      if (workspace !== 'Sketch & 2D') return;
      if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (evt.key.toLowerCase() === 'g') { evt.preventDefault(); setGrid((v) => !v); }
      else if (evt.key.toLowerCase() === 's') { evt.preventDefault(); setSnap((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspace]);

  // Calls the real backend (cad_server.py's /build_part — build123d / Open
  // Cascade) with the WHOLE feature list every time, the same "replay the
  // full history" model CATIA/SolidWorks use — so undo/redo, a project
  // reload, or one more Pocket on top all just mean "send the current
  // list, get the current solid back." Takes an explicit list so a
  // project load or a fresh commitFeature() can pass the just-updated
  // array without waiting on setFeatures to land first.
  // Shared by rebuildFromFeatures (/build_part) and runInspection
  // (/inspect_part) so the two never drift apart on what a Feature/Modifier
  // actually sends over the wire.
  const toApiFeatures = (list: AppFeature[]) => list.map((f) => ({
    id: f.id,
    op: f.op,
    zOffset: f.zOffset,
    // Pad/Revolve add material; Pocket cuts back into whatever's already
    // built (-depth) — the sign build123d's extrude() reads as direction.
    // Revolve ignores depth entirely (it uses axis/angle instead).
    depth: f.op === 'pocket' ? -Math.abs(f.depth) : Math.abs(f.depth),
    loops: f.loops,
    ...(f.plane ? { plane: f.plane } : {}),
    axis: f.axis ?? 'X',
    angle: f.angle ?? 360,
    ...(f.extra ?? {}),
  }));
  const toApiModifiers = (list: AppModifier[]) => list.map((m) => ({
    id: m.id,
    op: m.op,
    radius: m.radius,
    edgeFilter: m.edgeFilter ?? 'all',
    thickness: m.thickness,
    plane: m.plane ?? 'YZ',
    axis: m.axis ?? 'X',
    spacing: m.spacing,
    count: m.count ?? 2,
    angle: m.angle ?? 360,
    factor: m.factor,
    ...(m.chamferAngle !== undefined ? { chamferAngle: m.chamferAngle } : {}),
    ...(m.length2 !== undefined ? { length2: m.length2 } : {}),
    ...(m.extra ?? {}),
  }));
  // The active body's own feature history — what face picking and the
  // Inspect tools look at.
  const activeBodyApi = (fl: AppFeature[] = features, ml: AppModifier[] = modifiers) => ({
    features: toApiFeatures(fl.filter((f) => bodyOf(f) === activeBody)),
    modifiers: toApiModifiers(ml.filter((m) => bodyOf(m) === activeBody)),
  });

  // Rebuilds everything and shows it. One body and no Boolean operations:
  // /build_part, as always. Otherwise /build_bodies, once per body that
  // isn't consumed by a Boolean, merged into one mesh. Returns whether the
  // build succeeded, so a new feature that can't build can be taken back.
  const rebuildFromFeatures = async (list: AppFeature[], modList: AppModifier[] = modifiers, bodyList: Body[] = bodies, opList: BooleanEntry[] = booleans): Promise<boolean> => {
    if (list.length === 0) { setStlData(null); return true; }
    setGenerating(true);
    setAppError(null);
    try {
      const post = async (path: string, body: unknown) => {
        const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(await res.text());
        return res.arrayBuffer();
      };
      const used = bodyList.filter((b) => list.some((f) => bodyOf(f) === b.id));
      if (opList.length === 0 && used.length <= 1) {
        setStlData(await post('/build_part', { features: toApiFeatures(list), modifiers: toApiModifiers(modList) }));
      } else {
        const specs = used.map((b) => ({
          id: b.id, name: b.name, polarity: b.polarity,
          features: toApiFeatures(list.filter((f) => bodyOf(f) === b.id)),
          modifiers: toApiModifiers(modList.filter((m) => bodyOf(m) === b.id)),
        }));
        const operations = opList.map((o) => ({ id: o.id, op: o.op, target: o.target, ...(o.tool ? { tool: o.tool } : {}) }));
        const consumed = new Set(opList.map((o) => o.tool).filter(Boolean));
        const shown = specs.filter((s) => !consumed.has(s.id));
        const meshes = await Promise.all(shown.map((s) => post('/build_bodies', { bodies: specs, operations, result: s.id })));
        setStlData(mergeStl(meshes));
      }
      return true;
    } catch (err) {
      console.error('Part build failed — is cad_server.py running on :8000?', err);
      setAppError(`Could not build the part — is cad_server.py running on :8000?\n${(err as Error).message}`);
      return false;
    } finally {
      setGenerating(false);
    }
  };

  const runInspection = async () => {
    if (!features.some((f) => bodyOf(f) === activeBody)) { setAppError(`Build at least one feature in ${activeBody} before running ${activeTool}.`); return; }
    setGenerating(true);
    setAppError(null);
    try {
      const res = await fetch(`${API_BASE}/inspect_part`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeBodyApi()),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const text = activeTool === 'Interference Check'
        ? (data.solidCount > 1
          ? `${data.solidCount} disjoint solids found in the current body — features never fully fused (a real interference/gap signal, not a placeholder).`
          : `No interference detected — one watertight solid, ${data.faceCount} faces, ${data.edgeCount} edges.`)
        : `${data.isSingleWatertightSolid ? 'Valid: single watertight solid.' : `${data.solidCount} solids — check connectivity.`} Volume ${data.volumeMm3.toFixed(1)} mm³ · surface area ${data.surfaceAreaMm2.toFixed(1)} mm² · bounding box ${data.boundingBoxMm.x.toFixed(1)} × ${data.boundingBoxMm.y.toFixed(1)} × ${data.boundingBoxMm.z.toFixed(1)} mm.`;
      setInspectionResult({ tool: activeTool, text });
    } catch (err) {
      console.error(`${activeTool} failed — is cad_server.py running on :8000?`, err);
      setAppError(`Could not run ${activeTool} — is cad_server.py running on :8000?\n${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  // Where the next sketch-based feature is built: a picked face (Sketch on
  // Face), a Reference Plane, or the sketch's own plane at its offset.
  const refPlanes = referenceGeoms.filter((r) => r.kind === 'plane');
  const supportRef = refPlanes.find((r) => r.id === supportChoice);
  // If the sketch canvas is switched to a different plane than the active Reference Plane's, the reference plane is no longer the support.
  const supportRefNow = useRef<ReferenceGeom | undefined>(undefined);
  supportRefNow.current = supportRef;
  useEffect(() => {
    const r = supportRefNow.current;
    if (r && REF_PLANE[r.axis as RefPlaneAxis].sketch !== sketchPlaneName) setSupportChoice('sketch');
  }, [sketchPlaneName]);
  // A kept sketch open for editing stays on its own frame.
  const editingSketch = keptSketches.find((k) => k.id === editingSketchId);
  const currentFrame: Frame = useMemo(
    () => editingSketch?.frame ?? sketchSupport ?? (supportRef ? refPlaneFrameOf(supportRef) : sketchPlaneFrame(sketchPlaneName, planeOffsets[sketchPlaneName])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingSketch?.frame, sketchSupport, supportRef?.id, supportRef?.axis, supportRef?.offset, supportRef?.frame, sketchPlaneName, planeOffsets],
  );
  // What a kept sketch sits on, in words.
  const supportLabel = (k: KeptSketch) => {
    const sup = k.support;
    if (!sup) return 'its stored position';
    if (sup.kind === 'face') return 'the picked face';
    if (sup.kind === 'ref') return sup.frame ? `${referenceGeoms.find((r) => r.id === sup.refId)?.name ?? 'a reference plane'} (custom plane)` : `${referenceGeoms.find((r) => r.id === sup.refId)?.name ?? 'a reference plane'} (${sup.axis}, ${sup.offset} mm)`;
    return `${PLANE_BASIS[sup.plane].label}, offset ${sup.offset} mm`;
  };
  const currentSupportLabel = editingSketch ? supportLabel(editingSketch) : sketchSupport ? 'the picked face' : supportRef ? refPlaneLabel(supportRef) : `${PLANE_BASIS[sketchPlaneName].label}, offset ${planeOffsets[sketchPlaneName]} mm`;
  // Project 3D Element (Sketch & 2D): the model's edges, flat-face outlines and vertices, built on demand and
  // rebuilt whenever the solid or the reference geometry changes. `modelRevision` tells the open sketch to re-lay
  // the 3D elements it has projected.
  const modelRevCounter = useRef(0);
  const getModelGeometry = useMemo(() => {
    let cache: ReturnType<typeof buildModelGeometry> | null = null;
    return () => {
      if (!cache) {
        cache = buildModelGeometry(stlData, {
          points: referenceGeoms.filter((r) => r.kind === 'point' && r.a).map((r) => ({ name: r.name, p: r.a as number[] })),
          lines: referenceGeoms.filter((r) => r.kind === 'line' && r.a && r.b).map((r) => ({ name: r.name, a: r.a as number[], b: r.b as number[] })),
        });
      }
      return cache;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stlData, referenceGeoms]);
  const modelRevision = useMemo(() => ++modelRevCounter.current, [getModelGeometry]);
  // The Reference Points, Lines and Axes (model coordinates) for the sketch canvas: its cursor snaps to them as they lie on the open plane.
  const sketchReferenceGeometry = useMemo(() => {
    const points = referenceGeoms.filter((r) => r.kind === 'point' && r.a).map((r) => ({ name: r.name, p: r.a as number[] }));
    const lines: { name: string; a: number[]; b: number[] }[] = [];
    for (const r of referenceGeoms) {
      if (r.kind === 'line' && r.a && r.b) lines.push({ name: r.name, a: r.a, b: r.b });
      else if (r.kind === 'axis') {
        const l = refLineOf(r);
        if (l) lines.push({ name: r.name, a: l.p.map((v, i) => v - l.d[i] * 1000), b: l.p.map((v, i) => v + l.d[i] * 1000) });
      }
    }
    return { points, lines };
  }, [referenceGeoms]);
  // The reflection: every kept sketch on another plane parallel to the one open in Sketch & 2D (same orientation, different position)
  // is shown on the canvas as a locked reference, so a sketch on a new parallel plane can be drawn against the one on the old plane.
  useEffect(() => {
    const handle = sketchRef.current;
    if (!handle) return;
    const here = currentFrame;
    const items = reflectOn && workspace === 'Sketch & 2D' && !sketchSupport
      ? keptSketches.filter((k) => {
        if (!k.data || k.id === editingSketchId || k.plane !== sketchPlaneName || k.support?.kind === 'face') return false;
        const par = Math.abs(k.frame.normal[0] * here.normal[0] + k.frame.normal[1] * here.normal[1] + k.frame.normal[2] * here.normal[2]);
        const gap = [0, 1, 2].reduce((acc, i) => acc + (k.frame.origin[i] - here.origin[i]) * here.normal[i], 0);
        return par > 1 - 1e-6 && Math.abs(gap) > 1e-6;
      }).map((k) => ({ id: k.id, name: k.name, label: k.support?.kind === 'ref' ? (referenceGeoms.find((r) => r.id === (k.support as { refId: string }).refId)?.name ?? 'reference plane') : PLANE_BASIS[k.plane].label, data: k.data! }))
      : [];
    handle.setReflectedSketches(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reflectOn, workspace, keptSketches, sketchPlaneName, sketchSupport, currentFrame, editingSketchId, referenceGeoms]);
  // Enter confirms the value in any field, everywhere (see universalEnter.ts).
  useEffect(() => installUniversalEnter(), []);

  const supportOptions = sketchSupport
    ? [{ value: 'face', label: 'Picked face (Sketch on Face)' }]
    : [{ value: 'sketch', label: `Sketch plane — ${PLANE_BASIS[sketchPlaneName].label}` }, ...refPlanes.map((r) => ({ value: r.id, label: refPlaneLabel(r) }))];

  const nextName = (base: string, taken: string[]) => { let n = 1; while (taken.includes(`${base}.${n}`)) n++; return `${base}.${n}`; };
  const takenNames = () => [...features, ...modifiers, ...keptSketches, ...bodies, ...meshBodies, ...booleans, ...referenceGeoms].map((x) => x.name);
  const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const toolFor = (x: { tool?: string; op: string }) => x.tool ?? LEGACY_TOOL[x.op] ?? 'Pad';

  // The current sketch as a feature's input.
  const readSketch = () => {
    const profile = sketchRef.current?.getExtrudeProfile();
    const data = sketchRef.current?.getProjectData();
    return {
      loops: profile && !profile.error ? profile.loops.map(toLocal) : [],
      profileError: profile?.error,
      openPath: extractOpenPath(data),
      points: standalonePoints(data),
      data,
    };
  };
  const liveIsEmpty = () => {
    const d = sketchRef.current?.getProjectData();
    return !d || !(d.points.length || d.lines.length || d.circles.length || d.arcs?.length || d.curves?.length);
  };
  // The features that depend on a kept sketch: built from it, or using it
  // as a center curve or a section.
  const sketchUsers = (id: string, list: AppFeature[] = features) => list.filter((f) => featureSketchIds(f).includes(id));
  const describeSketch = (k: KeptSketch) => [
    k.loops.length ? `${k.loops.length} closed profile${k.loops.length === 1 ? '' : 's'}` : null,
    k.openPath ? 'an open chain' : null,
    k.points?.length ? `${k.points.length} point${k.points.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(', ') || 'no profile';

  // The canvas sketch as a kept sketch (not yet in the tree), positioned
  // where it sits now. Null when it holds neither a closed profile nor an
  // open chain of lines/arcs.
  const sketchFromLive = (name: string): KeptSketch | null => {
    const sk = readSketch();
    if (!sk.loops.length && !sk.openPath) return null;
    const plane = sk.data?.plane ?? sketchPlaneName;
    const support: SketchSupportRef = sketchSupport ? { kind: 'face' }
      : supportRef ? { kind: 'ref', refId: supportRef.id, axis: supportRef.axis as RefPlaneAxis, offset: supportRef.offset, ...(supportRef.frame ? { frame: supportRef.frame } : {}) }
      : { kind: 'plane', plane, offset: planeOffsets[plane] };
    return { id: newId('sk'), name, plane, frame: supportFrame(support, currentFrame), loops: sk.loops, openPath: sk.openPath, points: sk.points, data: sk.data, body: activeBody, support };
  };

  // Every sketch that can be kept right now: the one on the canvas plus any cached for other planes in the workbench
  // (switching planes there keeps them). Each sits on its own plane at that plane's offset.
  const collectKeepable = (): KeptSketch[] => {
    const taken = takenNames();
    const out: KeptSketch[] = [];
    for (const e of sketchRef.current?.getInactiveSketches() ?? []) {
      const openPath = extractOpenPath(e.data);
      if (!e.loops.length && !openPath) continue;
      const support: SketchSupportRef = { kind: 'plane', plane: e.plane, offset: planeOffsets[e.plane] };
      const name = nextName('Sketch', taken); taken.push(name);
      out.push({ id: newId('sk'), name, plane: e.plane, frame: supportFrame(support, sketchPlaneFrame(e.plane, planeOffsets[e.plane])), loops: e.loops.map(toLocal), openPath, points: standalonePoints(e.data), data: e.data, body: activeBody, support });
    }
    const cur = sketchFromLive(nextName('Sketch', taken));
    if (cur) out.push(cur);
    return out;
  };
  const liveIsKeepable = () => { const sk = readSketch(); return !!(sk.loops.length || sk.openPath); };
  // Stores every keepable sketch in the tree (the canvas is left for the caller to clear).
  const keepAllSketches = (): KeptSketch[] => {
    const all = collectKeepable();
    if (!all.length) return all;
    setKeptSketches((prev) => [...prev, ...all]);
    setTreeSelection(all[all.length - 1].name);
    setProfileChoice('auto');
    if (all.length > 1) setAppNotice(`Kept ${all.map((k) => `${k.name} (${PLANE_BASIS[k.plane].label})`).join(', ')}.`);
    return all;
  };
  // With Keep Sketch ON, the sketch on the canvas is kept before the workbench moves to another plane or support, so no plane's
  // sketch is lost or silently re-attached to the new plane. Returns true when it did, and the canvas is then a blank sketch on `target`.
  const keepBeforeSwitch = (target: SketchPlane): boolean => {
    if (!autoKeep || liveIsEmpty() || !liveIsKeepable()) return false;
    if (!keepAllSketches().length) return false;
    sketchRef.current?.openSketch({ points: [], lines: [], circles: [], constraints: [], plane: target });
    return true;
  };

  // The sketch the next sketch-based feature is built from: a kept sketch,
  // or null for the canvas sketch (see profileChoice).
  const profileNeed = TOOLS[activeTool]?.kind === 'feature' ? TOOLS[activeTool].sketch : undefined;
  const profileSketch: KeptSketch | null = (() => {
    if (!profileNeed || profileChoice === 'live') return null;
    const explicit = keptSketches.find((k) => k.id === profileChoice);
    if (explicit) return explicit;
    const picked = keptSketches.find((k) => k.name === treeSelection);
    if (picked && sketchFits(picked, profileNeed)) return picked;
    if (sketchPreview.length) return null;
    return [...keptSketches].reverse().find((k) => sketchFits(k, profileNeed) && !sketchUsers(k.id).length) ?? null;
  })();

  // 3D-view picking. A click on a kept sketch picks it: it is highlighted, and when the active tool
  // builds from a sketch it becomes the profile (or the new parent sketch, when editing a feature).
  const pickSketch3D = (id: string) => {
    const k = keptSketches.find((x) => x.id === id);
    if (!k) return;
    setAppError(null);
    setTreeSelection(k.name);
    if (!profileNeed) return;
    if (!sketchFits(k, profileNeed)) {
      setAppError(`${k.name} has no ${profileNeed === 'open' ? 'open chain' : profileNeed === 'circles' ? 'circle' : profileNeed === 'points' ? 'points' : 'closed profile'} that ${activeTool} can use.`);
      return;
    }
    const feat = features.find((f) => f.id === editingId);
    if (feat) setEditParent(k.id !== feat.sketchId ? k.id : null);
    else setProfileChoice(k.id);
  };
  // A click on an edge: replaces the selection, or (Shift/Ctrl/Cmd) adds it / removes it if already picked. null = empty click.
  const handleEdgePicked = (edge: EdgePick | null, additive: boolean) => {
    if (!edge) { setSelectedEdges([]); return; }
    setSelectedEdges((prev) => {
      const has = prev.some((e) => e.key === edge.key);
      if (additive) return has ? prev.filter((e) => e.key !== edge.key) : [...prev, edge];
      return has && prev.length === 1 ? [] : [edge];
    });
  };
  // A left-drag box in the 3D view. Window (drag right) takes what lies fully inside, crossing (drag left) whatever touches.
  // With an edge tool active it selects edges; otherwise kept sketches. Shift/Ctrl/Cmd adds to what is already selected.
  const boxSelect3D = (hit: { sketchIds: string[]; edges: EdgePick[]; additive: boolean; crossing: boolean }) => {
    setAppError(null);
    const { sketchIds, edges, additive } = hit;
    if (edgePickOn) {
      if (edges.length) setSelectedEdges((prev) => (additive ? [...prev, ...edges.filter((e) => !prev.some((p) => p.key === e.key))] : edges));
      else if (!additive) setSelectedEdges([]);
      return;
    }
    // A box that catches nothing clears the selection, like clicking empty space in the sketcher.
    if (sketchIds.length === 0) { if (!additive) { setMultiSel([]); setTreeSelection('Faelyx_Project'); } return; }
    if (sketchIds.length === 1 && !additive) { pickSketch3D(sketchIds[0]); return; }
    if (profileNeed && !additive) {
      const fit = sketchIds.map((id) => keptSketches.find((x) => x.id === id)).find((k) => k && sketchFits(k, profileNeed));
      pickSketch3D(fit ? fit.id : sketchIds[0]);
      return;
    }
    if (treeSelection !== 'Faelyx_Project') keepMultiRef.current = true;
    setTreeSelection('Faelyx_Project');
    setMultiSel((prev) => (additive ? [...prev, ...sketchIds.filter((id) => !prev.includes(id))] : sketchIds));
  };
  // New geometry: the picked edges no longer refer to anything.
  useEffect(() => { setSelectedEdges([]); }, [stlData]);
  // --- Reference Plane creation (3D) -------------------------------------------------------------------------
  // With the tool open, a click on a plane or planar face picks the plane to offset from; the new plane is previewed live with its
  // distance (double-click the value in the view to type it). The picked plane never moves. Creating the planes leaves the user in
  // 3D Design: Sketch & 2D opens only when they ask for it (double-click a plane, or the Sketch & 2D tab with the plane selected).
  const [selectFilter, setSelectFilter] = useState<SelectFilter>('all');
  const refPickOn = activeTool === 'Reference Plane' && (form.ptype ?? 'offset') === 'offset' && inspectorTab === 'PROPERTIES' && !sketchPanelId;
  const refSource = parsePlaneSource(String(form.source ?? ''), referenceGeoms);
  // A tool that takes a plane (Angle/Normal to plane, Parallel through point, Point on plane, Line/plane intersection, …): a click on that
  // plane in the 3D view or in the model tree fills the field, so the new element is built from the plane you picked — not from the default XY.
  const planeField = useMemo(() => {
    if (inspectorTab !== 'PROPERTIES' || sketchPanelId) return null;
    const f = (TOOLS[activeTool]?.fields ?? []).find((fl) => fl.type === 'refplane' && fieldVisible(fl, form));
    return f ? { key: f.key, label: fieldLabel(f, form) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, form, inspectorTab, sketchPanelId]);
  const pickPlaneField = (value: string) => {
    if (!planeField) return;
    setAppError(null);
    setForm({ ...form, [planeField.key]: value });
    const r = referenceGeoms.find((x) => x.id === value && x.kind === 'plane');
    setTreeSelection(r ? r.name : 'Faelyx_Project');
    setMultiSel([]);
  };
  const refDistance = Number(form.distance);
  const refCountN = Math.max(1, Math.min(50, Math.floor(Number(form.count)) || 1));
  const refDelta = refSource && Number.isFinite(refDistance) && refDistance !== 0 ? refSource.dir * (form.flip ? -1 : 1) * refDistance : null;
  const refCreate = useMemo<RefCreatePreview | null>(
    () => (refPickOn && refSource && !refSource.frame && refDelta !== null ? { axis: refSource.axis, base: refSource.base, delta: refDelta, count: refCountN, label: refSource.label } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refPickOn, refSource?.axis, refSource?.base, refSource?.dir, refSource?.label, refDelta, refCountN],
  );
  const onRefSourcePicked = (value: string | null, note?: string) => {
    if (planeField && !refPickOn) {
      if (value === null || value.startsWith('face:')) { setAppError('Click one of the three planes or a Reference Plane here — a face of the part cannot be used for this.'); return; }
      pickPlaneField(value);
      return;
    }
    if (value === null) { setAppError(note ?? 'A new Reference Plane cannot be offset from that.'); return; }
    setAppError(null);
    setForm({ ...form, source: value });
  };
  // A typed value: its size is the distance; a minus sign takes the other side of the plane (the arrow in the callout shows which).
  const onRefDistanceEdit = (v: number) => setForm({ ...form, distance: String(Math.round(Math.abs(v) * 1e4) / 1e4), flip: v < 0 ? !form.flip : !!form.flip });
  const onRefFlip = () => setForm({ ...form, flip: !form.flip });
  // Dragging the handle on the new plane: its signed position along the fixed axis, from the source; the side decides the flip.
  const onRefDelta = (delta: number) => {
    if (!refSource) return;
    setForm({ ...form, distance: String(Math.abs(delta)), flip: delta * refSource.dir < 0 });
  };
  // Reference Line / Reference Point: a click on a snap indicator in the 3D view (origin, circle centre, sketch point, end, midpoint) gives the point.
  const lineMethod = String(form.method ?? '');
  // The points a Reference Plane / Line / Point type takes by a click on a snap indicator, in order.
  const pickSlots = useMemo(() => snapSlots(activeTool, form), [activeTool, form]);
  const snapPickOn = inspectorTab === 'PROPERTIES' && !sketchPanelId && !editingId && pickSlots.length > 0;
  const [linePickSlot, setLinePickSlot] = useState(0);
  // Which of the two points of a Point – Point line have been picked in the view (the form's default coordinates are not picks).
  const [linePicked, setLinePicked] = useState({ start: false, end: false });
  const pickKey = `${activeTool}:${String(form.method ?? form.ptype ?? '')}`;
  useEffect(() => { setLinePickSlot(0); setLinePicked({ start: false, end: false }); }, [pickKey]);
  const xyzOf = (v: unknown): number[] | null => { const p = String(v ?? '').split(',').map((t) => Number(t.trim())); return p.length === 3 && p.every(Number.isFinite) ? p : null; };
  // Picked points as markers with the line between them, before Create — the same flow as defining a line in CATIA.
  const linePreview = useMemo<LinePreview | null>(
    () => (snapPickOn && activeTool === 'Reference Line' && lineMethod === 'point_point' && (linePicked.start || linePicked.end)
      ? { a: linePicked.start && form.start === 'coords' ? xyzOf(form.startXYZ) : null, b: linePicked.end && form.end === 'coords' ? xyzOf(form.endXYZ) : null }
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapPickOn, activeTool, lineMethod, linePicked.start, linePicked.end, form.start, form.end, form.startXYZ, form.endXYZ],
  );
  const onSnapPicked = (pt: number[]) => {
    if (!pickSlots.length) return;
    const idx = Math.min(linePickSlot, pickSlots.length - 1);
    const slot = pickSlots[idx];
    if (slot === 'xyz') setForm({ ...form, x: String(pt[0]), y: String(pt[1]), z: String(pt[2]) });
    else setForm({ ...form, [slot.sel]: 'coords', [slot.xyz]: pt.map((v) => String(v)).join(', ') });
    if (activeTool === 'Reference Line' && lineMethod === 'point_point') setLinePicked((p) => ({ ...p, [idx === 0 ? 'start' : 'end']: true }));
    setLinePickSlot((idx + 1) % pickSlots.length);
  };
  // Reference elements selected in the tree or the view (highlighted in the 3D view).
  const selectedRefIds = useMemo(() => referenceGeoms.filter((r) => treeSelection === r.name || multiSel.includes(r.id)).map((r) => r.id), [referenceGeoms, treeSelection, multiSel]);
  const onRefPicked = (id: string | null, additive: boolean) => {
    if (!id) {
      if (selectedRefIds.length) { setMultiSel((prev) => prev.filter((x) => !selectedRefIds.includes(x))); setTreeSelection('Faelyx_Project'); }
      return;
    }
    const r = referenceGeoms.find((x) => x.id === id);
    if (!r) return;
    if (additive) { setMultiSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])); return; }
    setMultiSel([]);
    setTreeSelection(r.name);
    // A selected plane is the sketch support the next time Sketch & 2D is opened (the workspace itself does not change).
    if (r.kind === 'plane') activateRefSupport(r);
  };
  // Selection filter keys: Shift+A all, Shift+P points, Shift+L lines, Shift+F faces (not while typing, and 3D Design only).
  useEffect(() => {
    if (workspace !== '3D Design') return;
    const onKey = (evt: KeyboardEvent) => {
      if (!evt.shiftKey || evt.ctrlKey || evt.metaKey || evt.altKey) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement as HTMLElement | null)?.isContentEditable) return;
      const next = ({ a: 'all', p: 'points', l: 'lines', f: 'faces' } as Record<string, SelectFilter>)[evt.key.toLowerCase()];
      if (next) { evt.preventDefault(); setSelectFilter(next); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspace]);

  const edgePickOn = !!TOOLS[activeTool]?.edges && inspectorTab === 'PROPERTIES' && !sketchPanelId;
  const planeHint = planeField && !refPickOn ? `${activeTool}: click a plane in the view or in the model tree to set the ${planeField.label.replace(/\s*\(.*$/, '').toLowerCase()}${snapPickOn ? ' · click a point (origin, centre, sketch point, end, midpoint) to set the point' : ''}` : '';
  const pickHint = planeHint ? planeHint : edgePickOn
    ? `${activeTool}: click edges of the part to select them — Shift/Ctrl + click adds${selectedEdges.length ? ` · ${selectedEdges.length} selected` : ''}`
    : snapPickOn
      ? (activeTool === 'Reference Point' && pickSlots[0] === 'xyz' ? 'Reference Point: click the origin, a circle centre, a sketch point, an end or a midpoint to use its coordinates' : `${activeTool}: click a point in the view to set the ${pickSlots.length > 1 ? `${['First', 'Second', 'Third'][Math.min(linePickSlot, pickSlots.length - 1)]} ` : ''}point — origin, circle centres, sketch points, ends, midpoints`)
    : refPickOn
      ? (refSource ? 'Reference Plane: drag the yellow handle or double-click the value to set the offset · ⇅ flips the side · click another plane or face to change the source' : 'Reference Plane: click a plane, a Reference Plane or a planar face to offset from')
    : profileNeed && inspectorTab === 'PROPERTIES' && !sketchPanelId && keptSketches.length > 0 && stlData === null
      ? 'Click a sketch in the view to use it as the profile'
      : profileNeed && inspectorTab === 'PROPERTIES' && !sketchPanelId && keptSketches.length > 0 ? 'Tip: click a sketch in the view to use it as the profile' : null;

  // Commit (or, when editing, update) a feature or modifier from the active
  // tool's definition box. Rebuilds first and only keeps the change if the
  // part builds, so a feature that can't be built never lands in the tree.
  const commitOperation = async () => {
    const editingFeature = features.find((f) => f.id === editingId);
    const editingModifier = modifiers.find((m) => m.id === editingId);
    const spec = TOOLS[activeTool];
    // The sketch this operation reads: the feature's own kept sketch, the
    // chosen profile, or the canvas sketch — which is kept as Sketch.N
    // along with the feature, so every sketch-based feature has a sketch
    // it stays linked to.
    let own: KeptSketch | null = null;
    let fresh = false;
    let sk: { loops: ProfileLoop[]; openPath: OpenPath | null; points: [number, number][]; profileError?: string };
    let frame: Frame = currentFrame;
    if (editingFeature) {
      own = keptSketches.find((k) => k.id === (editParent ?? editingFeature.sketchId)) ?? null;
      if (editParent && own && editParent !== editingFeature.sketchId && profileNeed && !sketchFits(own, profileNeed)) {
        throw new Error(`${own.name} has no ${profileNeed === 'open' ? 'open chain' : profileNeed === 'circles' ? 'circle' : profileNeed === 'points' ? 'points' : 'closed profile'} that ${activeTool} can use. Pick another sketch.`);
      }
      sk = own ? { loops: own.loops, openPath: own.openPath, points: own.points ?? [] }
        : { loops: editingFeature.source?.loops ?? editingFeature.loops, openPath: editingFeature.source?.openPath ?? null, points: editingFeature.source?.points ?? [] };
      frame = own?.frame ?? editingFeature.plane ?? currentFrame;
    } else if (spec?.kind === 'feature' && spec.sketch) {
      own = profileSketch;
      if (!own) { own = sketchFromLive(nextName('Sketch', takenNames())); fresh = !!own; }
      sk = own ? { loops: own.loops, openPath: own.openPath, points: own.points ?? [] } : readSketch();
      if (own) frame = own.frame;
    } else {
      sk = readSketch();
      // A User Pattern's positions: the canvas sketch's points, else a kept sketch's.
      if (!sk.points.length) {
        const withPoints = [keptSketches.find((k) => k.name === treeSelection), ...[...keptSketches].reverse()].find((k) => k?.points?.length);
        if (withPoints) { sk = { ...sk, points: withPoints.points! }; frame = withPoints.frame; }
      }
    }
    const faces = selectedFaces.length ? selectedFaces : editingModifier?.faces ?? [];
    const edges = spec?.edges ? selectedEdges : [];
    const ctx: OpContext = { ...sk, frame, kept: keptSketches, faces, edges, refs: referenceGeoms };
    const op = buildOperation(activeTool, form, ctx);
    if (op.kind === 'feature') {
      const base = { op: op.feature.op, depth: op.feature.depth, loops: op.feature.loops, axis: op.feature.axis, angle: op.feature.angle, extra: op.feature.extra, tool: activeTool, form };
      let next: AppFeature[];
      let name: string;
      if (editingFeature) {
        name = editingFeature.name;
        // A new parent sketch: the feature is re-linked to it (its loops, plane and stored source follow).
        const relink = editParent && own && editParent !== editingFeature.sketchId
          ? { sketchId: own.id, plane: frame, source: { loops: sk.loops, openPath: sk.openPath, points: sk.points } } : {};
        next = features.map((f) => (f.id === editingFeature.id ? { ...f, ...base, ...relink } : f));
      } else {
        name = nextName(activeTool, takenNames());
        const f: AppFeature = { id: newId('feat'), name, zOffset: 0, plane: frame, body: activeBody, source: { loops: sk.loops, openPath: sk.openPath, points: sk.points }, ...(own ? { sketchId: own.id } : {}), ...base };
        next = [...features, f];
      }
      if (!(await rebuildFromFeatures(next))) return;
      setFeatures(next);
      setTreeSelection(name);
      setEditParent(null);
      if (!editingFeature) {
        setProfileChoice('auto');
        if (fresh && own) { const kept = own; setKeptSketches((prev) => [...prev, kept]); sketchRef.current?.clear(); }
        // Like the old XY stack: a plain pad on a sketch plane raises that
        // plane's offset (where the next sketch on it goes) to the pad's top.
        const sup = own?.support;
        if (op.advancesPlane && sup?.kind === 'plane') setPlaneOffsets((o) => ({ ...o, [sup.plane]: sup.offset + op.advancesPlane! }));
      }
    } else {
      const base = { op: op.modifier.op, extra: op.modifier.extra, tool: activeTool, form, faces, edges };
      let next: AppModifier[];
      let name: string;
      if (editingModifier) {
        name = editingModifier.name;
        next = modifiers.map((m) => (m.id === editingModifier.id ? { ...m, ...base } : m));
      } else {
        if (!features.some((f) => bodyOf(f) === activeBody)) throw new Error(`Build a Pad, Shaft, Rib or Multi-sections Solid in ${activeBody} before adding ${activeTool}.`);
        name = nextName(activeTool, takenNames());
        next = [...modifiers, { id: newId('mod'), name, body: activeBody, ...base }];
      }
      if (!(await rebuildFromFeatures(features, next))) return;
      setModifiers(next);
      setTreeSelection(name);
      setSelectedFaces([]);
      setSelectedEdges([]);
    }
  };

  // A kept sketch changed (its geometry, or what it sits on): store it,
  // re-derive every feature that depends on it and rebuild. The change is
  // kept even when the part no longer builds — the last good solid stays
  // on screen, the error says what failed, and Undo steps back.
  const applySketchChange = async (updated: KeptSketch) => {
    const nextKept = keptSketches.map((k) => (k.id === updated.id ? updated : k));
    const failed: string[] = [];
    const nextFeatures = features.map((f) => {
      if (!featureSketchIds(f).includes(updated.id)) return f;
      try { return relinkFeature(f, nextKept, referenceGeoms); } catch (err) { failed.push(`${f.name}: ${(err as Error).message}`); return f; }
    });
    setKeptSketches(nextKept);
    setFeatures(nextFeatures);
    const undoHint = 'The last good solid is still shown — Undo (Ctrl+Z) goes back to the previous sketch.';
    if (failed.length) { setAppError(`${updated.name} was changed, but a feature built from it can no longer be made.\n${failed.join('\n')}\n${undoHint}`); return; }
    if (JSON.stringify(nextFeatures) === JSON.stringify(features)) return;
    if (!(await rebuildFromFeatures(nextFeatures))) setAppError((prev) => `${updated.name} was changed, but the part no longer builds.\n${undoHint}${prev ? `\n${prev}` : ''}`);
  };

  // Move a kept sketch to another plane / offset; its features follow.
  const changeSketchSupport = (id: string, value: string, offset: number) => {
    const k = keptSketches.find((x) => x.id === id);
    if (!k) return;
    let support: SketchSupportRef | undefined = k.support;
    if (value.startsWith('plane:')) support = { kind: 'plane', plane: value.slice(6) as SketchPlane, offset };
    else if (value.startsWith('ref:')) {
      const r = refPlanes.find((x) => x.id === value.slice(4));
      if (r) support = { kind: 'ref', refId: r.id, axis: r.axis as RefPlaneAxis, offset: r.offset, ...(r.frame ? { frame: r.frame } : {}) };
    }
    if (!support || JSON.stringify(support) === JSON.stringify(k.support)) return;
    const plane = support.kind === 'plane' ? support.plane : k.plane;
    setAppError(null);
    void applySketchChange({ ...k, support, plane, frame: supportFrame(support, k.frame), data: k.data ? { ...k.data, plane } : k.data });
  };

  // Leaving Sketch & 2D for 3D Design (Exit Workbench, or the 3D Design
  // tab): the sketch is carried over with no prompt. A new sketch becomes
  // the next Sketch.N and is selected; a kept sketch that was open for
  // editing is updated and its features rebuilt. Then the project is saved
  // (see the exitSaveTick effect).
  const [exitSaveTick, setExitSaveTick] = useState(0);
  const exitSketch = () => {
    setAppError(null);
    setSketchPanelId(null);
    const editing = keptSketches.find((k) => k.id === editingSketchId);
    if (editing) {
      setEditingSketchId(null);
      setTreeSelection(editing.name);
      if (liveIsEmpty()) setAppNotice(`${editing.name} was left unchanged — the canvas was empty when you left Sketch & 2D.`);
      else {
        const sk = readSketch();
        void applySketchChange({ ...editing, loops: sk.loops, openPath: sk.openPath, points: sk.points, data: sk.data ? { ...sk.data, plane: editing.plane } : editing.data });
      }
      sketchRef.current?.clear();
    } else if (!autoKeep) {
      if (!liveIsEmpty()) setAppNotice('Keep Sketch is OFF, so the sketch stays in Sketch & 2D. Switch Keep Sketch ON in the bottom bar to store it in the tree.');
    } else if (liveIsEmpty() || liveIsKeepable()) {
      if (keepAllSketches().length) sketchRef.current?.clear();
    } else {
      setAppNotice(`Nothing was carried into 3D Design: ${readSketch().profileError ?? 'the sketch has no closed profile or open chain of lines/arcs'} The sketch is still in Sketch & 2D.`);
    }
    setWorkspace('3D Design');
    setExitSaveTick((t) => t + 1);
  };
  const sendModel = (label: 'Engineering Analysis' | 'CAM & CNC') => {
    if (!stlData) return;
    setPushed((p) => (label === 'CAM & CNC' ? { ...p, cam: p.cam + 1 } : { ...p, cae: p.cae + 1 }));
    setWorkspace(label);
  };
  const goToWorkspace = (label: string) => {
    if (workspace === 'Sketch & 2D' && label === '3D Design') exitSketch();
    else setWorkspace(label);
  };

  // Re-entry from 3D Design. A kept sketch opens in Sketch & 2D with its
  // geometry and constraints; a primary plane starts a new sketch on it.
  const editSketch = (id: string) => {
    const k = keptSketches.find((x) => x.id === id);
    if (!k) return;
    setAppError(null);
    if (editingSketchId === id) { setWorkspace('Sketch & 2D'); return; }
    const busy = keptSketches.find((x) => x.id === editingSketchId);
    if (busy) { setAppError(`${busy.name} is still open for editing — go to Sketch & 2D and click Exit Workbench first.`); return; }
    if (!k.data) { setAppNotice(`${k.name} was kept before sketches stored their 2D geometry, so it can't be reopened for editing.`); return; }
    if (!liveIsEmpty()) {
      // Whatever is still on the canvas is kept first, so opening this
      // sketch doesn't overwrite it.
      const pending = sketchFromLive(nextName('Sketch', takenNames()));
      if (!pending) { setAppError('Sketch & 2D still holds geometry that is neither a closed profile nor an open chain. Finish or clear it before opening another sketch.'); return; }
      setKeptSketches((prev) => [...prev, pending]);
    }
    sketchRef.current?.openSketch({ ...k.data, plane: k.plane });
    setEditingSketchId(id);
    setSketchPanelId(null);
    setTreeSelection(k.name);
    setWorkspace('Sketch & 2D');
  };
  const sketchOnPlane = (plane: SketchPlane) => {
    const busy = keptSketches.find((x) => x.id === editingSketchId);
    if (busy) { setAppError(`${busy.name} is still open for editing — go to Sketch & 2D and click Exit Workbench first.`); return; }
    setAppError(null);
    // Coming from another plane or support: the sketch there is kept first (Keep Sketch ON).
    const stays = !supportRef && !sketchSupport && plane === sketchPlaneName;
    const kept = !stays && keepBeforeSwitch(plane);
    // The plane that was clicked is the one at the origin.
    setSketchSupport(null);
    sketchRef.current?.setProjectedEdges(null);
    setSupportChoice('sketch');
    setPlaneOffsets((o) => (o[plane] === 0 ? o : { ...o, [plane]: 0 }));
    if (!kept) sketchRef.current?.openPlane(plane);
    setWorkspace('Sketch & 2D');
  };
  // Makes a Reference Plane the support of the sketch on the Sketch & 2D canvas (without leaving the current workspace):
  // the canvas switches to that plane's orientation and the sketch will be kept on the reference plane's axis and offset.
  const activateRefSupport = (r: ReferenceGeom): boolean => {
    if (r.kind !== 'plane') return false;
    const busy = keptSketches.find((x) => x.id === editingSketchId);
    if (busy) { setAppError(`${busy.name} is still open for editing — go to Sketch & 2D and click Exit Workbench first.`); return false; }
    setAppError(null);
    const target = REF_PLANE[r.axis as RefPlaneAxis].sketch;
    const kept = supportChoice !== r.id && keepBeforeSwitch(target);
    setSketchSupport(null);
    sketchRef.current?.setProjectedEdges(null);
    setSupportChoice(r.id);
    if (!kept) sketchRef.current?.openPlane(target);
    return true;
  };
  // Double-click on a Reference Plane (in the 3D view or the model tree), or creating one: Sketch Mode on it, exactly as on
  // Front / Top / Right — same orientation, sketch tools, offset and properties — except the support is the reference plane
  // itself (its axis and offset), so the sketch sits on it and follows it.
  const openSketchOnRef = (r: ReferenceGeom) => {
    if (!activateRefSupport(r)) return;
    setTreeSelection(r.name);
    setWorkspace('Sketch & 2D');
  };
  const sketchOnReferencePlane = (refId: string) => {
    const r = referenceGeoms.find((x) => x.id === refId && x.kind === 'plane');
    if (r) openSketchOnRef(r);
  };
  const selectSketch = (k: KeptSketch) => {
    setTreeSelection(k.name);
    setSketchPanelId(k.id);
    setEditingId(null);
    setInspectorTab('PROPERTIES');
  };

  const insertBody = () => {
    const n = bodies.length + 1;
    let name = `Body.${n}`;
    for (let i = n; takenNames().includes(name); i++) name = `Body.${i + 1}`;
    const body: Body = { id: newId('body'), name, polarity: form.polarity === 'remove' ? 'remove' : 'add' };
    setBodies((prev) => [...prev, body]);
    setActiveBody(body.id);
    setTreeSelection(name);
  };

  const BOOLEAN_OPS: Record<string, string> = { Add: 'add', Remove: 'remove', Intersect: 'intersect', Assemble: 'assemble', 'Remove Lump': 'remove_lump' };
  const commitBoolean = async () => {
    const op = BOOLEAN_OPS[activeTool];
    const target = String(form.target || 'PartBody');
    const tool = op === 'remove_lump' ? undefined : String(form.tool || '');
    const bodyName = (id: string) => bodies.find((b) => b.id === id)?.name ?? id;
    const consumed = new Set(booleans.map((o) => o.tool).filter(Boolean));
    if (op !== 'remove_lump') {
      if (!tool) throw new Error(`Choose the body to ${activeTool.toLowerCase()}.`);
      if (tool === target) throw new Error('The body and the target must be different bodies.');
      if (consumed.has(tool)) throw new Error(`${bodyName(tool)} is already used by another Boolean operation.`);
    }
    if (consumed.has(target)) throw new Error(`${bodyName(target)} was already consumed by another Boolean operation.`);
    const entry: BooleanEntry = { id: newId('bool'), name: nextName(activeTool, takenNames()), op, target, ...(tool ? { tool } : {}), form };
    const next = [...booleans, entry];
    if (!(await rebuildFromFeatures(features, modifiers, bodies, next))) return;
    setBooleans(next);
    setTreeSelection(entry.name);
    if (tool && activeBody === tool) setActiveBody(target);
  };

  const commitReference = () => {
    if (activeTool === 'Reference Point' || activeTool === 'Reference Line') {
      const isPoint = activeTool === 'Reference Point';
      const made = buildReferenceElement(activeTool, form, { kept: keptSketches, refs: referenceGeoms, surface: selectedFaces[0] ?? null });
      const name = nextName(isPoint ? 'Point' : 'Line', takenNames());
      setReferenceGeoms((prev) => [...prev, { id: newId('ref'), name, kind: isPoint ? 'point' : 'line', axis: '', offset: 0, a: made.a, ...(made.b ? { b: made.b } : {}), note: made.note }]);
      setSelectedFaces([]);
      setTreeSelection(name);
      // Ready for the next line: the next click picks its first point again.
      setLinePicked({ start: false, end: false });
      setLinePickSlot(0);
      return;
    }
    if (activeTool === 'Reference Plane') {
      const made: ReferenceGeom[] = [];
      const round = (n: number) => Math.round(n * 1e4) / 1e4;
      const ptype = String(form.ptype ?? 'offset');
      if (ptype !== 'offset') {
        // The CATIA plane types other than the offset: the plane is computed from the points, lines, curves or equation.
        const built = buildReferencePlane(form, { kept: keptSketches, refs: referenceGeoms, surface: selectedFaces[0] ?? null });
        made.push({ id: newId('ref'), name: nextName('Reference Plane', takenNames()), kind: 'plane', ...planeEntry(built.frame), note: built.note });
        setSelectedFaces([]);
      } else {
        const src = parsePlaneSource(String(form.source ?? ''), referenceGeoms);
        if (!src) throw new Error('Click a plane or a planar face in the 3D view to offset from first.');
        const distance = Number(form.distance);
        if (!Number.isFinite(distance) || distance === 0) throw new Error('Offset distance must be a number other than 0.');
        const count = Math.floor(Number(form.count));
        if (!Number.isFinite(count) || count < 1 || count > 50) throw new Error('Number of planes must be a whole number from 1 to 50.');
        if (src.frame) {
          // The source is a custom plane: the new ones run along its normal.
          offsetCustomPlanes(src, distance, !!form.flip, count).forEach((fr, i) => {
            const name = nextName('Reference Plane', [...takenNames(), ...made.map((m) => m.name)]);
            made.push({ id: newId('ref'), name, kind: 'plane', ...planeEntry(fr), note: i === 0 && count === 1 ? `${round(Math.abs(distance))} mm from the ${src.label}` : `Plane ${i + 1} of ${count}: ${round(Math.abs(distance) * (i + 1))} mm from the ${src.label}` });
          });
        } else {
          referencePlanePositions(src, distance, !!form.flip, count).forEach((offset, i) => {
            const name = nextName('Reference Plane', [...takenNames(), ...made.map((m) => m.name)]);
            made.push({ id: newId('ref'), name, kind: 'plane', axis: src.axis, offset, note: i === 0 && count === 1 ? `${round(Math.abs(distance))} mm from the ${src.label}` : `Plane ${i + 1} of ${count}: ${round(Math.abs(distance) * (i + 1))} mm from the ${src.label}` });
          });
        }
      }
      setReferenceGeoms((prev) => [...prev, ...made]);
      const last = made[made.length - 1];
      setTreeSelection(last.name);
      setMultiSel([]);
      // Stay in 3D Design, ready for the next plane: the source is cleared, the new plane is selected (and is what Sketch & 2D opens on when asked).
      setForm({ ...form, source: '', flip: false, count: '1' });
      const busy = keptSketches.find((x) => x.id === editingSketchId);
      if (!busy) activateRefSupport(last);
      return;
    }
    const kind = activeTool === 'Reference Axis' ? 'axis' : 'csys';
    const offset = Number(form.offset);
    if (!Number.isFinite(offset)) throw new Error('Offset must be a number.');
    const name = nextName(activeTool, takenNames());
    const entry: ReferenceGeom = { id: newId('ref'), name, kind, axis: String(form.orient || 'Z'), offset };
    setReferenceGeoms((prev) => [...prev, entry]);
    setTreeSelection(name);
  };

  // Mirror Feature: a pure 2D transform, not a backend modifier — reflects
  // one already-committed feature's own loops across the X or Y axis of
  // the sketch plane it was drawn on, then appends the mirrored loops as a
  // brand new Pad/Pocket/Revolve feature through the ordinary /build_part
  // path. Real geometry (every point is actually reflected), just scoped
  // to one feature at a time rather than arbitrary 3D face picking.
  const commitMirrorFeature = async () => {
    const source = features.find((f) => f.name === form.feature);
    if (!source) throw new Error('Select a feature to mirror first.');
    if (!source.loops.length) throw new Error(`${source.name} has no sketch profile to mirror.`);
    const axis: 'X' | 'Y' = form.axis === 'X' ? 'X' : 'Y';
    const name = nextName('Mirror Feature', takenNames());
    const copy: AppFeature = { ...source, id: newId('feat'), name, loops: source.loops.map((l) => mirrorFeatureLoop(l, axis)), source: undefined, sketchId: undefined, form: source.form };
    const next = [...features, copy];
    if (!(await rebuildFromFeatures(next))) return;
    setFeatures(next);
    setTreeSelection(name);
  };

  // "Apply changes" / "Update": route the active tool to what it builds.
  const commitFeature = async () => {
    setAppError(null);
    setInspectionResult(null);
    const spec = TOOLS[activeTool];
    if (!spec || spec.kind === 'unavailable') return;
    try {
      if (spec.kind === 'inspect') await runInspection();
      else if (spec.kind === 'reference') commitReference();
      else if (spec.kind === 'body') insertBody();
      else if (spec.kind === 'boolean') await commitBoolean();
      else if (spec.kind === 'mirror-feature') await commitMirrorFeature();
      else await commitOperation();
    } catch (err) {
      setAppError((err as Error).message);
    }
  };

  // Model tree: open an item's definition for editing, or delete it. A
  // delete that leaves the part unbuildable is taken back.
  const editItem = (item: AppFeature | AppModifier) => {
    const tool = toolFor(item);
    setActiveTool(tool);
    if (item.form) setForms((prev) => ({ ...prev, [tool]: item.form! }));
    setEditingId(item.id);
    setSketchPanelId(null);
    setSelectedFaces([]);
    setSelectedEdges('edges' in item && item.edges ? item.edges : []);
    setInspectorTab('PROPERTIES');
    setTreeSelection(item.name);
    setActiveBody(bodyOf(item));
  };
  const stopEditing = () => { setEditingId(null); setSelectedFaces([]); setSelectedEdges([]); };
  const deleteItem = async (id: string) => {
    setAppError(null);
    if (features.some((f) => f.id === id) || modifiers.some((m) => m.id === id)) {
      const fl = features.filter((f) => f.id !== id), ml = modifiers.filter((m) => m.id !== id);
      const name = [...features, ...modifiers].find((x) => x.id === id)?.name;
      if (fl.length === 0) { setFeatures([]); setModifiers([]); setBooleans([]); setStlData(null); }
      else {
        if (!(await rebuildFromFeatures(fl, ml))) { setAppError(`Can't delete ${name}: the part no longer builds without it.`); void rebuildFromFeatures(features, modifiers); return; }
        setFeatures(fl); setModifiers(ml);
      }
    } else if (booleans.some((o) => o.id === id)) {
      const ol = booleans.filter((o) => o.id !== id);
      if (!(await rebuildFromFeatures(features, modifiers, bodies, ol))) { void rebuildFromFeatures(features, modifiers); return; }
      setBooleans(ol);
    } else if (meshBodies.some((m) => m.id === id)) {
      setMeshBodies((prev) => prev.filter((m) => m.id !== id));
    } else if (bodies.some((b) => b.id === id)) {
      if (features.some((f) => bodyOf(f) === id) || booleans.some((o) => o.tool === id || o.target === id)) { setAppError('Delete the body\'s features and Boolean operations first.'); return; }
      setBodies((prev) => prev.filter((b) => b.id !== id));
      if (activeBody === id) setActiveBody('PartBody');
    } else {
      setKeptSketches((prev) => prev.filter((k) => k.id !== id));
      setReferenceGeoms((prev) => prev.filter((r) => r.id !== id));
      if (supportChoice === id) setSupportChoice('sketch');
      if (profileChoice === id) setProfileChoice('auto');
      if (sketchPanelId === id) setSketchPanelId(null);
      if (editingSketchId === id) { setEditingSketchId(null); sketchRef.current?.clear(); }
    }
    if (editingId === id) stopEditing();
  };

  // Delete several tree items at once (Ctrl+A, Delete): one rebuild for the
  // whole set, and if the part can't be built without them nothing is lost.
  const deleteItems = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (ids.length === 1) { await deleteItem(ids[0]); return; }
    setAppError(null);
    const gone = new Set(ids);
    const fl = features.filter((f) => !gone.has(f.id)), ml = modifiers.filter((m) => !gone.has(m.id)), ol = booleans.filter((o) => !gone.has(o.id));
    // A body goes only when nothing is left in it or built from it.
    const bl = bodies.filter((b) => !(gone.has(b.id) && b.id !== 'PartBody' && !fl.some((f) => bodyOf(f) === b.id) && !ol.some((o) => o.tool === b.id || o.target === b.id)));
    if (fl.length !== features.length || ml.length !== modifiers.length || ol.length !== booleans.length) {
      if (fl.length === 0) { setFeatures([]); setModifiers([]); setBooleans([]); setStlData(null); }
      else {
        if (!(await rebuildFromFeatures(fl, ml, bl, ol))) { setAppError("Can't delete the selection: the part no longer builds without it."); void rebuildFromFeatures(features, modifiers, bodies, booleans); return; }
        setFeatures(fl); setModifiers(ml); setBooleans(ol);
      }
    }
    setBodies(bl);
    setMeshBodies((prev) => prev.filter((m) => !gone.has(m.id)));
    setKeptSketches((prev) => prev.filter((k) => !gone.has(k.id)));
    setReferenceGeoms((prev) => prev.filter((r) => !gone.has(r.id)));
    if (!bl.some((b) => b.id === activeBody)) setActiveBody('PartBody');
    if (gone.has(supportChoice)) setSupportChoice('sketch');
    if (gone.has(profileChoice)) setProfileChoice('auto');
    if (sketchPanelId && gone.has(sketchPanelId)) setSketchPanelId(null);
    if (editingSketchId && gone.has(editingSketchId)) { setEditingSketchId(null); sketchRef.current?.clear(); }
    if (editingId && gone.has(editingId)) stopEditing();
    setMultiSel([]); setTreeSelection('Faelyx_Project');
  };
  // Everything in the tree that can be selected and deleted (the base body stays).
  const selectableIds = () => [...bodies.filter((b) => b.id !== 'PartBody'), ...meshBodies, ...keptSketches, ...features, ...modifiers, ...booleans, ...referenceGeoms].map((x) => x.id);
  const selectAll3D = () => { if (treeSelection !== 'Faelyx_Project') keepMultiRef.current = true; setTreeSelection('Faelyx_Project'); setMultiSel(selectableIds()); };
  const deleteSelection3D = () => {
    if (multiSel.length) { void deleteItems(multiSel); return; }
    const named = [...bodies.filter((b) => b.id !== 'PartBody'), ...meshBodies, ...keptSketches, ...features, ...modifiers, ...booleans, ...referenceGeoms].find((x) => x.name === treeSelection);
    if (named) void deleteItem(named.id);
  };
  // Esc: cancel whatever is in progress and deselect.
  const cancelSelection3D = () => {
    setMultiSel([]); setTreeSelection('Faelyx_Project');
    if (editingId) stopEditing();
    setSelectedFaces([]); setSelectedEdges([]); setSketchPanelId(null);
    stlViewportRef.current?.clearPick();
    if (compassMode !== null) handleSetCompassMode(null);
    if (interactionMode !== 'select') handleSetInteractionMode('select');
    // Leave a Reference creation tool (plane / point / line / axis): drop its pick mode.
    if (!editingId && activeTool.startsWith('Reference') && inspectorTab === 'PROPERTIES') setInspectorTab('AI ASSISTANT');
  };
  // Ctrl+A, Delete / Backspace, Esc in 3D Design. Skipped while a text field has the focus.
  const editKeysRef = useRef({ selectAll3D, deleteSelection3D, cancelSelection3D });
  editKeysRef.current = { selectAll3D, deleteSelection3D, cancelSelection3D };
  useEffect(() => {
    if (workspace !== '3D Design') return;
    const onKey = (evt: KeyboardEvent) => {
      if (evt.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = (el?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
      if ((evt.ctrlKey || evt.metaKey) && !evt.altKey && !evt.shiftKey && evt.key.toLowerCase() === 'a') { evt.preventDefault(); editKeysRef.current.selectAll3D(); }
      else if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
      else if (evt.key === 'Delete' || evt.key === 'Backspace') { evt.preventDefault(); editKeysRef.current.deleteSelection3D(); }
      else if (evt.key === 'Escape') editKeysRef.current.cancelSelection3D();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspace]);

  // SketchWorkspace is always mounted now (see the render below), so
  // sketchRef.current is available as soon as a load arrives — no need to
  // wait for `workspace` to become 'Sketch & 2D' first. That old gate meant
  // a project saved while on 3D Design (or any other tab) would silently
  // never restore its sketch, since the effect never fired.
  useEffect(() => {
    if (pendingSketchLoad && sketchRef.current) {
      sketchRef.current.loadProjectData(pendingSketchLoad);
      setPendingSketchLoad(null);
    }
  }, [pendingSketchLoad]);

  // Returns whether the save actually went through — callers that chain
  // another action after saving (see saveAndStartNew below) need to know
  // it didn't just silently no-op (e.g. the name prompt below being
  // cancelled) before treating the project as safely persisted.
  // Everything the 3D Design tab holds — saved, loaded and dirty-tracked
  // as one object so the three can't drift apart.
  const threeDState = () => ({ features, stackTop, sketchSupport, modifiers, referenceGeoms, keptSketches, bodies, booleans, planeOffsets, activeBody, meshBodies });
  const savingRef = useRef(false);
  const saveProject = async (): Promise<boolean> => {
    let name = projectName;
    if (!name) {
      name = window.prompt('Project name?', 'Untitled')?.trim() || '';
      if (!name) return false;
    }
    setSaveState('saving');
    savingRef.current = true;
    try {
      // Always saved regardless of which tab is active — the sketch on
      // canvas (the NEXT feature's not-yet-committed profile) and the
      // real feature history (every Pad/Pocket already committed) are two
      // separate, independent things now, not one-or-the-other by tab.
      const payload = {
        workspace,
        sketch: sketchRef.current?.getProjectData() ?? null,
        threeD: threeDState(),
      };
      // Mesh bodies carry their STL (base64) in the saved file only; it is not part of the dirty-tracking snapshot.
      const meshData: Record<string, string> = {};
      for (const m of meshBodies) { const buf = meshStoreRef.current.get(m.id); if (buf) meshData[m.id] = abToB64(buf); }
      const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meshBodies.length ? { ...payload, threeD: { ...payload.threeD, meshData } } : payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setProjectName(name);
      setSaveState('synced');
      // Same payload object that was just POSTed, so this baseline's JSON
      // always matches what the dirty-tracking effect below builds the
      // same way on every poll — no risk of a false "unsaved" from the
      // two sides constructing the object with different key order.
      lastSavedSnapshotRef.current = JSON.stringify(payload);
      setAutoSaveOn(true);
      return true;
    } catch (err) {
      console.error('Save failed — is cad_server.py running on :8000?', err);
      setSaveState('unsaved');
      setAppError('Could not save — is cad_server.py running on :8000?');
      return false;
    } finally {
      savingRef.current = false;
    }
  };
  // Mirrors the latest saveProject closure into a ref, refreshed every
  // render (no deps). The dirty-tracking interval below only recreates
  // when workspace/features/stackTop/autoSaveOn change, NOT on every
  // rename — without this, a rename that happens while autosave is
  // already on (so autoSaveOn doesn't flip and force a fresh interval
  // closure) would leave that interval calling an old saveProject closed
  // over the project's PREVIOUS name, and the next sketch-triggered
  // autosave would save under the wrong name.
  const saveProjectRef = useRef<() => Promise<boolean>>(async () => false);
  useEffect(() => { saveProjectRef.current = saveProject; });
  // Exit Workbench saves on its own once the transfer above has landed in
  // state. Only a project that already has a name: an unnamed one would
  // open the name prompt, so it is left marked unsaved instead.
  useEffect(() => {
    if (exitSaveTick && projectName) void saveProjectRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitSaveTick]);

  // Undo / Redo for 3D Design: every settled change to the 3D state
  // (features, kept sketches, modifiers, bodies, …) is one step, so an
  // automatic sketch update that breaks a feature can be stepped back.
  // Kept for the session; a project load or New part starts a fresh stack.
  const snapshot3D = JSON.stringify(threeDState());
  const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 });
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const [history3D, setHistory3D] = useState({ canUndo: false, canRedo: false });
  // The sketch an Undo put back on the canvas (see undo3D).
  const restoredSketchRef = useRef<string | null>(null);
  useEffect(() => {
    const h = historyRef.current;
    if (h.stack[h.index] !== snapshot3D) {
      h.stack = [...h.stack.slice(0, h.index + 1), snapshot3D].slice(-100);
      h.index = h.stack.length - 1;
    }
    setHistory3D((prev) => {
      const next = { canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 };
      return prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next;
    });
  }, [snapshot3D, historyEpoch]);
  const resetHistory3D = () => { historyRef.current = { stack: [], index: -1 }; restoredSketchRef.current = null; setHistoryEpoch((n) => n + 1); };
  const applySnapshot3D = (json: string) => {
    const t = JSON.parse(json) as ReturnType<typeof threeDState>;
    setFeatures(t.features); setModifiers(t.modifiers); setReferenceGeoms(t.referenceGeoms); setKeptSketches(t.keptSketches);
    setBodies(t.bodies); setBooleans(t.booleans); setPlaneOffsets(t.planeOffsets); setActiveBody(t.activeBody); setMeshBodies(t.meshBodies ?? []);
    setStackTop(t.stackTop); setSketchSupport(t.sketchSupport);
    setEditingId(null); setSelectedFaces([]); setSketchPanelId(null); setProfileChoice('auto');
    setAppError(null);
    void rebuildFromFeatures(t.features, t.modifiers, t.bodies, t.booleans);
  };
  const stepHistory3D = (dir: -1 | 1) => {
    const h = historyRef.current;
    const to = h.index + dir;
    if (to < 0 || to >= h.stack.length) return;
    const from = JSON.parse(h.stack[h.index]) as ReturnType<typeof threeDState>;
    const target = JSON.parse(h.stack[to]) as ReturnType<typeof threeDState>;
    if (dir === -1) {
      // Undoing the step that kept a sketch: it goes back onto the (empty)
      // canvas rather than being lost.
      const gone = from.keptSketches.filter((k) => !target.keptSketches.some((x) => x.id === k.id));
      if (gone.length === 1 && gone[0].data && !editingSketchId && liveIsEmpty()) {
        sketchRef.current?.openSketch({ ...gone[0].data, plane: gone[0].plane });
        restoredSketchRef.current = gone[0].id;
      }
    } else if (restoredSketchRef.current && target.keptSketches.some((k) => k.id === restoredSketchRef.current)) {
      sketchRef.current?.clear();
      restoredSketchRef.current = null;
    }
    h.index = to;
    applySnapshot3D(h.stack[to]);
  };
  const undo3D = () => stepHistory3D(-1);
  const redo3D = () => stepHistory3D(1);
  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) in 3D Design; Sketch & 2D has its own.
  const historyKeysRef = useRef({ undo3D, redo3D });
  historyKeysRef.current = { undo3D, redo3D };
  useEffect(() => {
    if (workspace !== '3D Design') return;
    const onKey = (evt: KeyboardEvent) => {
      if (!(evt.ctrlKey || evt.metaKey) || evt.altKey) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const key = evt.key.toLowerCase();
      if (key === 'z' && !evt.shiftKey) { evt.preventDefault(); historyKeysRef.current.undo3D(); }
      else if (key === 'y' || (key === 'z' && evt.shiftKey)) { evt.preventDefault(); historyKeysRef.current.redo3D(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspace]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`${API_BASE}/projects`);
      setProjects(await res.json());
    } catch (err) {
      console.error('Could not list projects — is cad_server.py running on :8000?', err);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  const openProjects = async () => {
    const opening = !projectsOpen;
    setProjectsOpen(opening);
    if (opening) void fetchProjects();
  };

  // The Welcome screen's "recent projects" grid needs this same list —
  // fetch it once whenever we land back on Welcome (first load included)
  // so it's real data, not something the user has to click Open to see.
  useEffect(() => {
    if (!projectOpen) void fetchProjects();
  }, [projectOpen]);

  const loadProject = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProjectName(name);
      setProjectsOpen(false);
      setProjectOpen(true);
      setWorkspace(data.workspace || 'Sketch & 2D');
      if (data.sketch) setPendingSketchLoad(data.sketch);
      const t = data.threeD ?? {};
      const loadedFeatures: AppFeature[] = t.features ?? [];
      const loadedModifiers: AppModifier[] = t.modifiers ?? [];
      const loadedBodies: Body[] = t.bodies?.length ? t.bodies : [{ id: 'PartBody', name: 'PartBody', polarity: 'add' }];
      const loadedBooleans: BooleanEntry[] = t.booleans ?? [];
      setFeatures(loadedFeatures);
      setModifiers(loadedModifiers);
      setReferenceGeoms(t.referenceGeoms ?? []);
      setKeptSketches(t.keptSketches ?? []);
      setBodies(loadedBodies);
      meshStoreRef.current = new Map(Object.entries((t.meshData ?? {}) as Record<string, string>).map(([id, b64]) => [id, b64ToAb(b64)] as const));
      setMeshBodies(((t.meshBodies ?? []) as MeshBody[]).filter((m) => meshStoreRef.current.has(m.id)));
      setBooleans(loadedBooleans);
      setActiveBody(t.activeBody ?? 'PartBody');
      setPlaneOffsets(t.planeOffsets ?? { Top: 0, Front: 0, Right: 0 });
      setStackTop(t.stackTop ?? 0);
      // A face support saved with a canvas-corner origin: move it onto the
      // sketch origin marker (origin + O.x·x − O.y·y).
      const ss: SketchSupport | null = t.sketchSupport ?? null;
      if (ss && !ss.local) {
        const n = ss.normal, x = ss.xDir;
        const y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
        const O = SKETCH_ORIGIN_SVG;
        setSketchSupport({ ...ss, origin: ss.origin.map((v, i) => v + O.x * x[i] - O.y * y[i]), local: true });
      } else setSketchSupport(ss);
      setEditingId(null);
      setSelectedFaces([]);
      setEditingSketchId(null); setSketchPanelId(null); setProfileChoice('auto');
      resetHistory3D();
      setStlData(null);
      if (loadedFeatures.length > 0) void rebuildFromFeatures(loadedFeatures, loadedModifiers, loadedBodies, loadedBooleans);
      setSaveState('synced');
      setAutoSaveOn(true);
      // The sketch side of this load lands asynchronously (pendingSketchLoad
      // → a separate effect → SketchWorkspace's own setState calls → this
      // component re-renders with a fresh getProjectData()), so there's no
      // single synchronous point here where reading it back would reflect
      // what actually got loaded. Flagging it for the dirty-tracking effect
      // below to seed on its very next tick sidesteps that entirely: same
      // handful of milliseconds either way, but it seeds from the real,
      // settled post-load state instead of racing it.
      needsSnapshotSeedRef.current = true;
    } catch (err) {
      console.error('Could not load project — is cad_server.py running on :8000?', err);
      setAppError('Could not load that project — is cad_server.py running on :8000?');
    }
  };

  // 3D Design's Reset button: clears the part (history stays, so Ctrl+Z
  // undoes it) and puts the camera back to the default Isometric view. The
  // sketch on the Sketch & 2D canvas and the project's name are kept.
  const resetModel3D = () => {
    setStlData(null);
    setFeatures([]); setModifiers([]); setReferenceGeoms([]); setKeptSketches([]);
    setBodies([{ id: 'PartBody', name: 'PartBody', polarity: 'add' }]); setMeshBodies([]);
    setBooleans([]); setActiveBody('PartBody');
    setPlaneOffsets({ Top: 0, Front: 0, Right: 0 });
    setSupportChoice('sketch'); setSketchSupport(null);
    setEditingId(null); setSelectedFaces([]); setEditingSketchId(null); setSketchPanelId(null); setProfileChoice('auto');
    setStackTop(0); setMultiSel([]); setTreeSelection('Faelyx_Project'); setAppError(null);
    handleQuickView('iso', 'ISO');
    window.setTimeout(() => stlViewportRef.current?.fitAll(), 50);
  };

  // Shared by the Welcome screen's New Part/Assembly/Drawing cards and
  // the "New part" icon in the command toolbar — always resets to a
  // blank, unsaved part and always lands in Sketch & 2D on the Front
  // Plane first. 3D Design (or any other workspace) is something you
  // switch into afterwards, once there's a profile worth extruding.
  const startNew = (target: string = 'Sketch & 2D') => {
    setProjectName(null);
    setSaveState('unsaved');
    sketchRef.current?.clear();
    setStlData(null);
    setFeatures([]);
    setModifiers([]);
    setReferenceGeoms([]);
    setKeptSketches([]);
    setBodies([{ id: 'PartBody', name: 'PartBody', polarity: 'add' }]);
    meshStoreRef.current = new Map(); setMeshBodies([]);
    setBooleans([]);
    setActiveBody('PartBody');
    setPlaneOffsets({ Top: 0, Front: 0, Right: 0 });
    setSupportChoice('sketch');
    setSketchSupport(null);
    setEditingId(null);
    setSelectedFaces([]);
    setEditingSketchId(null); setSketchPanelId(null); setProfileChoice('auto');
    resetHistory3D();
    setStackTop(0);
    setWorkspace(target);
    setProjectOpen(true);
    // A brand-new part has nothing saved anywhere yet — autosave (and the
    // dirty-tracking that would otherwise immediately flip it back on)
    // stays off until the next real Save gives it a name to save under.
    setAutoSaveOn(false);
    lastSavedSnapshotRef.current = null;
    needsSnapshotSeedRef.current = false;
    if (autoSaveDebounceRef.current !== null) { window.clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
    setRenamingProject(false);
  };

  // Routes every "New part"/"New Assembly"/"New Drawing" trigger (the
  // toolbar icon and the three Welcome-screen cards) through here instead
  // of calling startNew directly, so unsaved work gets a chance to be
  // saved (or deliberately discarded) first — see the confirm dialog in
  // the JSX below (pendingNewTarget).
  const requestNew = (target: string) => {
    if (saveState === 'unsaved') { setPendingNewTarget(target); return; }
    startNew(target);
  };
  const cancelNewPrompt = () => setPendingNewTarget(null);
  const discardAndStartNew = () => { const target = pendingNewTarget; setPendingNewTarget(null); if (target) startNew(target); };
  const saveAndStartNew = async () => {
    const target = pendingNewTarget;
    const saved = await saveProject();
    setPendingNewTarget(null);
    // saveProject returns false (and leaves saveState as 'unsaved') if the
    // in-dialog Project name prompt gets cancelled — startNew would then
    // discard the very work this button was meant to save, so only
    // proceed once the save actually went through.
    if (target && saved) startNew(target);
  };

  // Double-click-to-rename on the breadcrumb (mode-label, in the JSX
  // below). Renaming is deliberately separate from saving — see the
  // feature spec this was built from — so it only updates local state
  // and marks the project dirty; Save (or autosave, once it's on)
  // actually persists it under the new name.
  const startRenameProject = () => { setRenameDraft(projectName ?? 'Untitled'); setRenamingProject(true); };
  const commitRenameProject = () => {
    const trimmed = renameDraft.trim();
    setRenamingProject(false);
    if (!trimmed || trimmed === (projectName ?? 'Untitled')) return;
    setProjectName(trimmed);
    setSaveState('unsaved');
    if (autoSaveOn) void saveProject();
  };
  useEffect(() => {
    if (renamingProject) { renameInputRef.current?.focus(); renameInputRef.current?.select(); }
  }, [renamingProject]);

  // Dirty-tracking + autosave. Off entirely (the early return below) until
  // the project has been saved or loaded at least once — lastSavedSnapshotRef
  // is null until then, which is also exactly when there's nowhere yet to
  // autosave TO. Once it's seeded, every tick rebuilds the same payload
  // saveProject would POST and compares it against that baseline: a
  // mismatch means real, unsaved work exists, so the badge goes red and —
  // if autoSaveOn — a save is kicked off (debounced, so a burst of rapid
  // edits collapses into one save instead of one per 400ms tick). A
  // separate interval from the one above (which mirrors undo/redo/cursor
  // state) since this one's own dependency list needs to include
  // workspace/features/stackTop/autoSaveOn to always compare against
  // their current values, whereas that one intentionally never restarts.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (needsSnapshotSeedRef.current) {
        lastSavedSnapshotRef.current = JSON.stringify({ workspace, sketch: sketchRef.current?.getProjectData() ?? null, threeD: threeDState() });
        needsSnapshotSeedRef.current = false;
        return;
      }
      if (lastSavedSnapshotRef.current === null || savingRef.current) return;
      const snapshot = JSON.stringify({ workspace, sketch: sketchRef.current?.getProjectData() ?? null, threeD: threeDState() });
      if (snapshot === lastSavedSnapshotRef.current) return;
      setSaveState((s) => (s === 'saving' ? s : 'unsaved'));
      if (!autoSaveOn) return;
      if (autoSaveDebounceRef.current !== null) window.clearTimeout(autoSaveDebounceRef.current);
      autoSaveDebounceRef.current = window.setTimeout(() => { autoSaveDebounceRef.current = null; void saveProjectRef.current(); }, 800);
    }, 400);
    return () => {
      window.clearInterval(id);
      if (autoSaveDebounceRef.current !== null) { window.clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, features, stackTop, sketchSupport, autoSaveOn, modifiers, referenceGeoms, keptSketches, bodies, booleans, planeOffsets, activeBody]);

  const handleImportCad = () => {
    window.alert("Importing STEP / IGES / STL files is coming soon — for now, open a project you've already saved in Faelyx AI.");
  };

  const runAi = () => {
    if (!aiInput.trim()) return;
    setAiMessages((items) => [...items, aiInput.trim()]);
    setAiInput(''); setProcessing(true); window.setTimeout(() => setProcessing(false), 1800);
  };
  const upload = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files?.length) setUploadReady(true); };
  // 3D Design viewport controls — thin wrappers that call the live
  // StlViewport instance's imperative handle and keep the toolbar's own
  // active/label state (orientation, display, compassMode, partHidden,
  // interactionMode) in sync with what the viewport is actually doing.
  const handleQuickView = (view: QuickView, label: string) => { stlViewportRef.current?.setQuickView(view); setOrientation(label); };
  const handleRotateStep = (degrees: number) => stlViewportRef.current?.rotateAzimuth(degrees);
  const handleFitAll = () => stlViewportRef.current?.fitAll();
  // F in 3D Design: Fit all, unless a field has the focus.
  useEffect(() => {
    if (workspace !== '3D Design') return;
    const onKey = (evt: KeyboardEvent) => {
      if (evt.ctrlKey || evt.metaKey || evt.altKey || evt.shiftKey || evt.key.toLowerCase() !== 'f') return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      evt.preventDefault();
      stlViewportRef.current?.fitAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspace]);
  const handleToggleHidden = () => setPartHidden((value) => { const next = !value; stlViewportRef.current?.setHidden(next); return next; });
  const handleSetInteractionMode = (mode: 'select' | 'orbit' | 'pan' | 'zoom') => { setInteractionMode(mode); stlViewportRef.current?.setInteractionMode(mode); };
  const handleSetRenderStyle = (style: RenderStyle, label: string) => { stlViewportRef.current?.setRenderStyle(style); setDisplay(label); };
  const handleSetCompassMode = (mode: CompassMode | null) => { setCompassMode(mode); stlViewportRef.current?.setCompass(mode !== null, mode ?? undefined); };
  const handleNormalView = () => stlViewportRef.current?.setNormalView();
  // The 3D Design viewport (and its Three.js scene) unmounts whenever you
  // switch workspace tabs — a fresh StlViewport always starts shaded,
  // visible, with no compass. Re-apply whatever this toolbar last showed
  // as active so the two don't silently drift apart on the next visit.
  useEffect(() => {
    if (workspace !== '3D Design') return;
    stlViewportRef.current?.setRenderStyle(displayToRenderStyle(display));
    stlViewportRef.current?.setHidden(partHidden);
    stlViewportRef.current?.setInteractionMode(interactionMode);
    if (compassMode) stlViewportRef.current?.setCompass(true, compassMode);
    // Runs once per mount of the interactive viewport (workspace/stlData
    // transition into view) — not on every toolbar click, those already
    // call the ref directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, stlData]);
  // Kept sketches as the viewport draws them: the selected one highlighted;
  // one already used by a feature only while it is selected; not the one
  // open for editing (the live outline shows that).
  const viewSketches: ViewSketch[] = useMemo(() => {
    const used = new Set(features.flatMap((f) => featureSketchIds(f)));
    return keptSketches
      .filter((k) => k.id !== editingSketchId && (k.name === treeSelection || multiSel.includes(k.id) || !used.has(k.id)))
      .map((k) => ({ id: k.id, frame: k.frame, points: k.points, selected: k.name === treeSelection || multiSel.includes(k.id), loops: k.openPath ? [...k.loops, { kind: 'path' as const, ...k.openPath }] : k.loops }));
  }, [keptSketches, features, treeSelection, editingSketchId, multiSel]);
  // The part's specification tree: each body (click = make it the body new
  // features go into) with its features and dress-up/transformation
  // features, then Boolean operations and reference elements. Kept sketches
  // are listed under their body.
  const renderPartTree = () => {
    const consumed = new Set(booleans.map((o) => o.tool).filter(Boolean));
    const bodyName = (id: string) => bodies.find((b) => b.id === id)?.name ?? id;
    const subtractive = new Set(['pocket', 'groove', 'slot', 'removed_loft', 'hole']);
    return <>
      <div className="tree-separator">BODIES &amp; FEATURE HISTORY</div>
      {bodies.map((b) => {
        const fs = features.filter((f) => bodyOf(f) === b.id), ms = modifiers.filter((m) => bodyOf(m) === b.id);
        // Kept sketches sit under the body that was active when they were
        // kept (PartBody for older ones, or if that body is gone).
        const ss = keptSketches.filter((k) => (bodies.some((x) => x.id === k.body) ? k.body : 'PartBody') === b.id);
        return <div key={b.id}>
          <TreeNode icon={Box} label={b.name} depth={1} selected={treeSelection === b.name || multiSel.includes(b.id)} badge={activeBody === b.id ? 'active' : consumed.has(b.id) ? 'consumed' : undefined}
            onClick={() => { setActiveBody(b.id); setTreeSelection(b.name); }} onDelete={b.id === 'PartBody' ? undefined : () => void deleteItem(b.id)} />
          {ss.map((k) => <TreeNode key={k.id} icon={Pencil} label={`${k.name} (${k.plane}${k.openPath ? ', open chain' : ''})`} depth={2} selected={treeSelection === k.name || multiSel.includes(k.id)}
            badge={editingSketchId === k.id ? 'editing' : sketchUsers(k.id).length ? 'used' : undefined} title="Double-click to open in Sketch & 2D"
            onClick={() => selectSketch(k)} onDoubleClick={() => editSketch(k.id)} onDelete={() => void deleteItem(k.id)} />)}
          {fs.length === 0 && ss.length === 0 && b.id === 'PartBody' && <div className="tree-empty-hint">No features yet — sketch a closed profile in Sketch &amp; 2D, then Pad it here.</div>}
          {fs.map((f) => <TreeNode key={f.id} icon={subtractive.has(f.op) ? ScissorsIcon as IconType : TOOL_ICONS[toolFor(f)] ?? ArrowDownToLine} label={f.name} depth={2} selected={treeSelection === f.name || multiSel.includes(f.id)} onClick={() => editItem(f)} onDoubleClick={() => editItem(f)} onDelete={() => void deleteItem(f.id)} />)}
          {ms.map((m) => <TreeNode key={m.id} icon={TOOL_ICONS[toolFor(m)] ?? Circle} label={m.name} depth={2} selected={treeSelection === m.name || multiSel.includes(m.id)} onClick={() => editItem(m)} onDoubleClick={() => editItem(m)} onDelete={() => void deleteItem(m.id)} />)}
        </div>;
      })}
      {meshBodies.length > 0 && <div className="tree-separator">MESH BODIES (IMAGE TO 3D)</div>}
      {meshBodies.map((m) => <TreeNode key={m.id} icon={Sparkles} label={`${m.name} (${m.faces.toLocaleString()} faces)`} depth={1} muted={!m.visible} selected={treeSelection === m.name || multiSel.includes(m.id)}
        badge={m.visible ? undefined : 'hidden'} title={`${m.engine === 'triposr' ? 'TripoSR' : m.engine === 'hunyuan' ? 'Hunyuan3D 2.1' : 'Image to 3D'} from ${m.source} · ${m.size.map((v) => v.toFixed(1)).join(' × ')} mm · ${m.printable ? 'watertight' : 'not watertight'} — Double-click to hide / show`}
        onClick={() => { setTreeSelection(m.name); setMultiSel([]); }} onDoubleClick={() => setMeshBodies((prev) => prev.map((x) => (x.id === m.id ? { ...x, visible: !x.visible } : x)))} onDelete={() => void deleteItem(m.id)} />)}
      {booleans.length > 0 && <div className="tree-separator">BOOLEAN OPERATIONS</div>}
      {booleans.map((o) => <TreeNode key={o.id} icon={TOOL_ICONS[Object.keys(BOOLEAN_OPS).find((k) => BOOLEAN_OPS[k] === o.op) ?? 'Add'] ?? Component} label={`${o.name}: ${o.tool ? `${bodyName(o.tool)} → ` : ''}${bodyName(o.target)}`} depth={2} selected={treeSelection === o.name || multiSel.includes(o.id)} onClick={() => setTreeSelection(o.name)} onDelete={() => void deleteItem(o.id)} />)}
      {referenceGeoms.length > 0 && <div className="tree-separator">REFERENCE ELEMENTS</div>}
      {referenceGeoms.map((r) => <TreeNode key={r.id} icon={r.kind === 'plane' ? Square : r.kind === 'axis' ? Axis3d : r.kind === 'point' ? CircleDot : r.kind === 'line' ? ArrowUpRight : Crosshair} label={refLabel(r)} title={r.note ?? (r.kind === 'plane' ? 'Click: make it the sketch plane · Double-click: sketch on it' : undefined)} depth={2} selected={treeSelection === r.name || multiSel.includes(r.id)}
        onClick={() => { if (r.kind === 'plane' && planeField) { pickPlaneField(r.id); return; } setTreeSelection(r.name); setMultiSel([]); if (r.kind === 'plane') activateRefSupport(r); }} onDoubleClick={r.kind === 'plane' ? () => openSketchOnRef(r) : undefined} onDelete={() => void deleteItem(r.id)} />)}
    </>;
  };

  // Image to 3D → "Add to model": the finished mesh becomes a mesh body in the tree and the viewport.
  const addMeshBody = (stl: ArrayBuffer, meta: MeshMeta): string => {
    const id = newId('mesh');
    const name = nextName('Mesh', takenNames());
    meshStoreRef.current.set(id, stl);
    setMeshBodies((prev) => [...prev, { id, name, visible: true, engine: meta.engine, faces: meta.faces, size: meta.size, volume: meta.volume, printable: meta.printable, source: meta.source }]);
    setTreeSelection(name); setMultiSel([]);
    window.setTimeout(() => stlViewportRef.current?.fitAll(), 150);
    return name;
  };
  // Picking a toolbox tool starts a new feature (leaves edit mode).
  const pickTool = (name: string) => {
    if (TOOLS[name]?.kind === 'image-3d') { setImage3dOpen(true); return; }      // a pop-up, like Image to Sketch: the tool in the pane stays as it was
    setActiveTool(name);
    setEditingId(null);
    setSketchPanelId(null);
    setInspectionResult(null);
    if (TOOLS[name]?.kind !== 'unavailable') setInspectorTab('PROPERTIES');
    if (!TOOLS[name]?.faces) setSelectedFaces([]);
    if (!TOOLS[name]?.edges) setSelectedEdges([]);
  };

  const addParameter = () => setParameters((prev) => [...prev, { id: `param${Date.now()}`, name: `Param_${prev.length + 1}`, formula: '0' }]);
  const renameParameter = (id: string, name: string) => setParameters((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  const setParameterFormula = (id: string, formula: string) => setParameters((prev) => prev.map((p) => (p.id === id ? { ...p, formula } : p)));
  const removeParameter = (id: string) => setParameters((prev) => prev.filter((p) => p.id !== id));
  const handleParamFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    setDesignTable(parseCsv(text));
  };
  // A Design Table row's "Apply" — each header becomes (or overwrites) a
  // parameter named after it, with that row's cell as its formula, same
  // as picking a configuration row in CATIA's own Design Table.
  const applyDesignTableRow = (row: string[]) => {
    if (!designTable) return;
    setParameters((prev) => {
      const byName = new Map(prev.map((p) => [p.name, p] as const));
      designTable.headers.forEach((header, index) => {
        const value = row[index];
        if (value === undefined || !header) return;
        const existing = byName.get(header);
        byName.set(header, existing ? { ...existing, formula: value } : { id: `param_${header}_${Date.now()}`, name: header, formula: value });
      });
      return Array.from(byName.values());
    });
  };

  const material = MATERIALS.find((m) => m.id === materialId) ?? MATERIALS[0];

  return <div className={`app-shell ${projectOpen ? '' : 'app-shell-welcome'}`} onClick={() => { if (context) setContext(null); if (appearanceOpen) setAppearanceOpen(false); }}>
    <header className="topbar"><div className="brand"><img src="/Logo_(1) copy 2.png" alt="Faelyx AI" /></div><nav className="menu-nav">{['File', 'Edit', 'View', 'Insert', 'Tools', 'Window', 'Help'].map((item) => <button key={item}>{item}</button>)}</nav><div className="top-actions"><button className="search-command" onClick={() => setSearchOpen(!searchOpen)}><Search size={13} /><span>Search commands...</span><kbd>⌘ K</kbd></button><IconButton icon={Minus} label="Minimize" /><IconButton icon={Maximize2} label="Maximize" /><IconButton icon={X} label="Close" /></div>{searchOpen && <div className="command-search"><div className="search-title"><Search size={13} /> COMMAND SEARCH <kbd>ESC</kbd></div><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try 'fillet', 'hole', or 'create a mounting bracket'..." />{Object.values(TOOLS).filter((t) => t.kind !== 'unavailable').map((t) => t.name).filter((item) => (search ? item.toLowerCase().includes(search.toLowerCase()) : ['Pad', 'Pocket', 'Hole', 'Edge Fillet'].includes(item))).slice(0, 8).map((item) => <button key={item} onClick={() => { goToWorkspace('3D Design'); pickTool(item); setSearchOpen(false); }}><Command size={12} />{item}<span>↵</span></button>)}</div>}</header>
    {image3dOpen && <ImageTo3DDialog onClose={() => setImage3dOpen(false)} onAddMesh={addMeshBody} />}
    {appError && <div className="app-toast" onClick={(event) => event.stopPropagation()}>
      <span>{appError}</span>
      <button onClick={() => setAppError(null)} aria-label="Dismiss"><X size={12} /></button>
    </div>}
    {appNotice && <div className="app-notice" onClick={(event) => event.stopPropagation()}>
      <span>{appNotice}</span>
      <button onClick={() => setAppNotice(null)} aria-label="Dismiss notice"><X size={12} /></button>
    </div>}
    {pendingNewTarget !== null && (
      <div className="reset-confirm-overlay reset-confirm-overlay-app" onClick={(event) => { event.stopPropagation(); cancelNewPrompt(); }}>
        <div className="reset-confirm-box" onClick={(event) => event.stopPropagation()}>
          <div className="reset-confirm-title"><AlertTriangle size={16} /> Unsaved changes</div>
          <p className="reset-confirm-body">
            <b>{projectName ?? 'Untitled'}</b> has changes that haven't been saved yet. Starting a new
            {' '}{pendingNewTarget === 'Sketch & 2D' ? 'part' : pendingNewTarget === '3D Design' ? 'assembly' : 'drawing'} discards
            them for good unless you save first.
          </p>
          <div className="reset-confirm-actions">
            <button className="reset-confirm-no" onClick={cancelNewPrompt}>Cancel</button>
            <button className="reset-confirm-save" onClick={() => void saveAndStartNew()}>Save and proceed</button>
            <button className="reset-confirm-yes" onClick={discardAndStartNew}>Proceed</button>
          </div>
        </div>
      </div>
    )}
    {projectOpen ? <>
    <nav className="workspace-nav">{[['Sketch & 2D', Pencil], ['3D Design', Box], ['Engineering Analysis', Activity], ['Drawings & Documentation', FileBox], ['CAM & CNC', Hammer], ['Civil Engineering', Landmark], ['RenderX Engine', ImagePlus]].map(([label, Icon]) => <button key={label as string} className={workspace === label ? 'workspace-active' : ''} onClick={() => goToWorkspace(label as string)}><Icon size={14} /><span>{label as string}</span>{workspace === label && <i />}</button>)}</nav>
    <div className="command-toolbar"><div className="history-actions"><IconButton icon={Undo2} label="Undo" onClick={() => (workspace === '3D Design' ? undo3D() : sketchRef.current?.undo())} disabled={workspace === '3D Design' ? !history3D.canUndo : !canUndo} /><IconButton icon={Redo2} label="Redo" onClick={() => (workspace === '3D Design' ? redo3D() : sketchRef.current?.redo())} disabled={workspace === '3D Design' ? !history3D.canRedo : !canRedo} /><span className="divider" /><IconButton icon={FilePlus2} label="New part" onClick={() => requestNew('Sketch & 2D')} /><IconButton icon={Archive} label="Save" onClick={saveProject} /><IconButton icon={FolderOpen} label="Open" active={projectsOpen} onClick={openProjects} /><IconButton icon={Download} label="Export" /></div><div className="mode-label" onClick={(event) => event.stopPropagation()}><span className="live-dot" /> {workspace.toUpperCase()} <span className="crumb">/</span> {renamingProject ? <input ref={renameInputRef} className="project-rename-input" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onBlur={commitRenameProject} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitRenameProject(); } else if (event.key === 'Escape') { event.preventDefault(); setRenamingProject(false); } }} /> : <span className="project-name" onDoubleClick={startRenameProject} title="Double-click to rename">{projectName ?? 'Untitled'}</span>} {editingSketch && <span className="editing-sketch-chip" title="Exit Workbench updates this sketch and rebuilds the features made from it"><Pencil size={9} /> EDITING {editingSketch.name.toUpperCase()}</span>} <button className={`save-state save-${saveState}`} onClick={() => void saveProject()} title={saveState === 'unsaved' ? 'Unsaved changes — click to save' : saveState === 'saving' ? 'Saving…' : autoSaveOn ? 'Saved — autosave is on' : 'Saved'}><span className="save-dot" /><FileCheck size={12} /> {saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved' : 'Synced'}</button></div><div className="toolbar-actions">{workspace === '3D Design' && <div className="model-link-group"><button className="send-btn" disabled={!stlData} title={stlData ? 'Open this part in Engineering Analysis (it stays linked and follows later changes)' : 'Build a part first'} onClick={() => sendModel('Engineering Analysis')}><Activity size={12} /> Analyse</button><button className="send-btn" disabled={!stlData} title={stlData ? 'Open this part in CAM & CNC (it stays linked and follows later changes)' : 'Build a part first'} onClick={() => sendModel('CAM & CNC')}><Hammer size={12} /> Machine</button></div>}<button className="feature-btn" onClick={() => setInspectorTab('AI ASSISTANT')}><Sparkles size={13} /> AI FEATURE</button><IconButton icon={Menu} label="More actions" /></div>{projectsOpen && <div className="projects-panel" onClick={(event) => event.stopPropagation()}>
      <div className="projects-panel-head"><FolderOpen size={12} /> SAVED PROJECTS <button onClick={() => setProjectsOpen(false)} aria-label="Close"><X size={12} /></button></div>
      {loadingProjects ? <div className="projects-empty">Loading…</div>
        : projects.length === 0 ? <div className="projects-empty">No saved projects yet — click Save to create one.</div>
        : projects.map((p) => (
          <button key={p.name} className="projects-row" onClick={() => loadProject(p.name)}>
            <span>{p.name}</span><small>{new Date(p.updated_at).toLocaleString()}</small>
          </button>
        ))}
    </div>}</div>
    {/* SketchWorkspace stays mounted across every workspace tab (just hidden
        when not on Sketch & 2D) so sketchRef.current is never null — that's
        what lets 3D Design's Extrude/Pocket "Apply changes" actually read
        the profile you drew, instead of finding a ref that went stale the
        moment you switched tabs. */}
    <SketchWorkspace ref={sketchRef} hidden={workspace !== 'Sketch & 2D'} snapEnabled={snap} showGrid={grid}
      grid={sketchGrid} units={sketchOptions.units} showCursorCoords={sketchOptions.cursorCoords}
      originSnapPx={sketchOptions.originSnapPx} originAutoConstrain={sketchOptions.originConstraint}
      onExitWorkbench={exitSketch}
      onFaceSupport={!!sketchSupport}
      getModelGeometry={getModelGeometry} modelRevision={modelRevision} supportFrame={currentFrame} referenceGeometry={sketchReferenceGeometry}
      appearanceLineColor={sketchLineColor} appearanceLineWidth={sketchLineWidth}
      appearancePointColor={sketchPointColor} appearancePointRadius={sketchPointRadius}
      appearanceMeasureColor={sketchMeasureColor} appearanceConstructionColor={sketchConstructionColor} />
    {workspace === 'Drawings & Documentation' ? <DrawingWorkspace stlData={stlData} projectName={projectName} /> : workspace === 'RenderX Engine' ? <RenderWorkspace stlData={stlData} projectName={projectName} /> : workspace === 'CAM & CNC' ? <CamWorkspace stlData={stlData} projectName={projectName ?? ""} onNavigate={goToWorkspace} pushNonce={pushed.cam} /> : workspace === 'Engineering Analysis' ? <CaeWorkspace stlData={stlData} projectName={projectName ?? ""} onNavigate={goToWorkspace} pushNonce={pushed.cae} /> : workspace === 'Sketch & 2D' ? null : <main className="workspace-grid" style={{ gridTemplateColumns: `${colWidths.col1}px 6px ${colWidths.col2}px 6px minmax(500px,1fr) 6px ${colWidths.col4}px` }}>
      <aside className="model-panel"><PanelHeader eyebrow="WORKSPACE" title="MODEL TREE" action={<PanelLeft size={14} />} /><div className="panel-tabs"><button className="tab-active">Model</button><button>Assembly</button><button>Features</button></div><div className="tree-search"><Search size={12} /><input placeholder="Search model tree..." /><kbd>/</kbd></div><div className="tree-content"><TreeNode icon={ChevronDown} label="Faelyx_Project" depth={0} selected={treeSelection === 'Faelyx_Project'} onClick={() => setTreeSelection('Faelyx_Project')} /><TreeNode icon={ChevronDown} label="Part 001" depth={1} /><TreeNode icon={ChevronDown} label="Origin" depth={2} muted /><TreeNode icon={Square} label="Front Plane" depth={3} muted onClick={planeField ? () => pickPlaneField('XZ') : undefined} /><TreeNode icon={Square} label="Top Plane" depth={3} muted onClick={planeField ? () => pickPlaneField('XY') : undefined} /><TreeNode icon={Square} label="Right Plane" depth={3} muted onClick={planeField ? () => pickPlaneField('YZ') : undefined} /><TreeNode icon={Target} label="Origin Point" depth={3} muted /><TreeNode icon={Axis3d} label="Coordinate System" depth={3} muted />{renderPartTree()}<TreeNode icon={Cuboid} label="Material" depth={2} muted /><TreeNode icon={ChevronRight} label="Configurations" depth={2} muted /></div><div className="tree-footer"><span><span className="status-dot" /> All features healthy</span><Settings2 size={13} /></div></aside>
      <div className={`col-resizer ${resizingCol === 'col1' ? 'col-resizer-active' : ''}`} onMouseDown={startColResize('col1')} aria-hidden="true" />
      <aside className="toolbox-panel"><PanelHeader eyebrow="COMMANDS · CATIA PART DESIGN" title="3D MODELING TOOLBOX" action={<IconButton icon={Search} label="Search tools" onClick={() => setSearchOpen(true)} />} /><div className="toolbox-scroll">{TOOL_GROUPS.map((section) => <section className="tool-section" key={section.label}><button className="section-toggle" onClick={() => setOpenSections((value) => ({ ...value, [section.label]: !value[section.label] }))}><span>{openSections[section.label] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{section.label}</span><small>{section.tools.filter((t) => t.kind !== 'unavailable').length}/{section.tools.length}</small></button>{openSections[section.label] && <div className="tool-list">{section.tools.map((tool) => <ToolButton key={tool.name} tool={tool} active={activeTool === tool.name} onClick={() => pickTool(tool.name)} />)}</div>}</section>)}</div></aside>
      <div className={`col-resizer ${resizingCol === 'col2' ? 'col-resizer-active' : ''}`} onMouseDown={startColResize('col2')} aria-hidden="true" />
      <section className="canvas-panel"><ModelViewport sectionOn={sectionOn} onSectionOn={setSectionOn} display={display} orientation={orientation} selectedFeature={treeSelection === 'Faelyx_Project' ? 'None' : treeSelection} stlData={stlData} generating={generating} stlViewportRef={stlViewportRef} sketchLoops={sketchPreview} previewFrame={currentFrame} previewLabel={currentSupportLabel} referenceGeoms={referenceGeoms} partHidden={partHidden} onToggleHidden={handleToggleHidden} compassMode={compassMode} onSetCompassMode={handleSetCompassMode} onQuickView={handleQuickView} onRotateStep={handleRotateStep} onFitAll={handleFitAll} interactionMode={interactionMode} onSetInteractionMode={handleSetInteractionMode} onSetRenderStyle={handleSetRenderStyle} onInertia={setInertia} onNormalView={handleNormalView} sketchSupport={sketchSupport} onSketchOnFace={sketchOnPickedFace} onClearSketchSupport={() => { setSketchSupport(null); sketchRef.current?.setProjectedEdges(null); }}
        faceButtonEnabled={faceButtonEnabled} faceButtonTitle={faceButtonTitle} pickedFaceStatus={pickedFace?.status ?? null} onFacePicked={handleFacePicked}
        keptSketches={viewSketches} showPlanes={showPlanes} onShowPlanes={setShowPlanes} showAxes={showAxes} onShowAxes={setShowAxes} onPlaneDoubleClick={sketchOnPlane} onSketchDoubleClick={editSketch} edgePickEnabled={edgePickOn} selectedEdges={selectedEdges} onEdgePicked={handleEdgePicked} onSketchPicked={pickSketch3D} onReferencePlaneDoubleClick={sketchOnReferencePlane} onBoxSelect={boxSelect3D} pickHint={pickHint} refCreate={refCreate} refPickEnabled={refPickOn || !!planeField} onRefSourcePicked={onRefSourcePicked} onRefDistanceEdit={onRefDistanceEdit} onRefFlip={onRefFlip} onRefDelta={onRefDelta} snapPickEnabled={snapPickOn} linePreview={linePreview} onSnapPicked={onSnapPicked} selectedRefIds={selectedRefIds} onRefPicked={onRefPicked} selectFilter={selectFilter} onSelectFilter={setSelectFilter} selectionCount={multiSel.length} onReset={resetModel3D} modelItemCount={bodies.filter((b) => b.id !== 'PartBody').length + meshBodies.length + keptSketches.length + features.length + modifiers.length + booleans.length + referenceGeoms.length} /></section>
      <div className={`col-resizer ${resizingCol === 'col4' ? 'col-resizer-active' : ''}`} onMouseDown={startColResize('col4')} aria-hidden="true" />
      <aside className="inspector-panel"><PanelHeader eyebrow="FAELYX INTELLIGENCE" title="ENGINEERING INSPECTOR" action={<PanelRight size={14} />} /><div className="inspector-tabs">{[['AI ASSISTANT', Sparkles], ['INSPECT', Inspect], ['PROPERTIES', Settings2]].map(([label, Icon]) => <button key={label as string} className={inspectorTab === label ? 'tab-active' : ''} onClick={() => setInspectorTab(label as string)}><Icon size={12} />{label as string}</button>)}</div>{inspectorTab === 'AI ASSISTANT' && <div className="assistant-content"><div className="copilot-head"><div className="copilot-mark"><Sparkles size={16} /></div><div><strong>Faelyx AI</strong><span>Engineering Copilot <b><span className="status-dot" /> Ready</b></span></div><MoreDots /></div><div className="assistant-intro"><div className="eyebrow"><BrainCircuit size={11} /> ENGINEERING COPILOT</div><p>Tell me what you want to design or analyze. I can work with materials, constraints, and manufacturing intent.</p></div><div className="suggested-label">SUGGESTED WORKFLOWS</div>{['Create a mounting bracket', 'Reduce this part’s weight', 'Check this design for stress', 'Suggest a better material', 'Prepare this part for CNC machining', 'Find possible manufacturing issues'].map((item) => <button className="suggestion" key={item} onClick={() => setAiInput(item)}><Zap size={11} />{item}<ArrowDownToLine size={11} /></button>)}{aiMessages.map((message, index) => <div className="ai-message" key={`${message}-${index}`}><span>You</span>{message}</div>)}{processing && <div className="ai-processing"><Sparkles size={13} /><div><strong>FAELYX AI &nbsp; Analyzing...</strong><span>Feature strategy · Geometry · Validation</span></div></div>}<div className="ai-spacer" /><div className="reference-card"><div><ImagePlus size={15} /><span><strong>Image-to-CAD</strong><small>JPG, PNG or WEBP reference</small></span></div><label><Upload size={13} /> Upload<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} /></label></div>{uploadReady && <div className="upload-success"><Check size={13} /> Image ready for geometry recognition <X size={12} onClick={() => setUploadReady(false)} /></div>}<div className="ai-composer"><textarea value={aiInput} onChange={(event) => setAiInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); runAi(); } }} placeholder="Describe your engineering task..." /><div className="composer-actions"><button aria-label="Attach"><Paperclip size={14} /></button><button aria-label="Microphone"><CircleDot size={14} /></button><button className="send-button" onClick={runAi} aria-label="Send"><Send size={14} /></button></div></div><span className="composer-hint">Shift + Enter for new line</span></div>}{inspectorTab === 'INSPECT' && <InspectPanel selected={treeSelection} materialLabel={material.label} />}{inspectorTab === 'PROPERTIES' && TOOLS[activeTool] && (() => {
        const editingItem = [...features, ...modifiers].find((x) => x.id === editingId);
        // A kept sketch as a support choice: the three planes, the
        // reference planes, and what it is on now if that is neither.
        const supportValueOf = (k: KeptSketch) => (!k.support ? 'fixed' : k.support.kind === 'plane' ? `plane:${k.support.plane}` : k.support.kind === 'ref' ? `ref:${k.support.refId}` : 'face');
        const supportOptionsOf = (k: KeptSketch) => [
          ...(['Front', 'Top', 'Right'] as SketchPlane[]).map((pl) => ({ value: `plane:${pl}`, label: PLANE_BASIS[pl].label })),
          ...refPlanes.map((r) => ({ value: `ref:${r.id}`, label: refPlaneLabel(r) })),
          ...(k.support?.kind === 'face' ? [{ value: 'face', label: 'Picked face (fixed)' }] : []),
          ...(!k.support ? [{ value: 'fixed', label: 'Stored position' }] : []),
        ];
        const offsetOf = (k: KeptSketch) => (k.support?.kind === 'plane' ? k.support.offset : null);
        const panelSketch = keptSketches.find((k) => k.id === sketchPanelId);
        if (panelSketch) {
          return <SketchDefinitionPanel key={panelSketch.id} name={panelSketch.name} summary={`${describeSketch(panelSketch)}. On ${supportLabel(panelSketch)}.`}
            usedBy={sketchUsers(panelSketch.id).map((f) => f.name)}
            supportValue={supportValueOf(panelSketch)} supportOptions={supportOptionsOf(panelSketch)} planeOffset={offsetOf(panelSketch) ?? 0}
            onApplySupport={(value, offset) => changeSketchSupport(panelSketch.id, value, offset)}
            canEdit={!!panelSketch.data} onEdit={() => editSketch(panelSketch.id)}
            onDelete={() => void deleteItem(panelSketch.id)} onClose={() => setSketchPanelId(null)} applying={generating} />;
        }
        const body = activeBody !== 'PartBody' ? `, in ${bodies.find((b) => b.id === activeBody)?.name}` : '';
        return <PartDesignPanel spec={TOOLS[activeTool]} form={form} setForm={setForm}
          editing={editingItem ? { name: editingItem.name, legacy: !editingItem.form } : null}
          onCancelEdit={stopEditing} onDelete={() => editingId && void deleteItem(editingId)}
          parent={(() => {
            const feat = features.find((f) => f.id === editingId);
            const need = TOOLS[activeTool]?.kind === 'feature' ? TOOLS[activeTool].sketch : undefined;
            if (!feat || !need) return undefined;
            const current = editParent ?? feat.sketchId ?? '';
            const currentSketch = keptSketches.find((k) => k.id === current);
            return {
              value: currentSketch ? current : '',
              missing: !!feat.sketchId && !keptSketches.some((k) => k.id === feat.sketchId),
              options: [
                ...(currentSketch ? [] : [{ value: '', label: feat.sketchId ? 'Deleted sketch — using its stored copy' : 'Not linked to a sketch (stored copy)' }]),
                ...keptSketches.filter((k) => sketchFits(k, need) || k.id === feat.sketchId).map((k) => ({ value: k.id, label: `${k.name} — ${describeSketch(k)} (${k.plane})${k.id === feat.sketchId ? ' · current' : ''}` })),
              ],
              changed: !!editParent && editParent !== feat.sketchId,
              others: currentSketch ? sketchUsers(currentSketch.id).filter((f) => f.id !== feat.id).map((f) => f.name) : [],
              onChange: (id: string) => setEditParent(id && id !== feat.sketchId ? id : null),
              onOpen: currentSketch ? () => editSketch(currentSketch.id) : undefined,
            };
          })()}
          profileValue={profileSketch ? profileSketch.id : 'live'} onProfile={setProfileChoice}
          profileOptions={[...keptSketches.map((k) => ({ value: k.id, label: `${k.name} — ${describeSketch(k)} (${k.plane})` })), { value: 'live', label: 'Current sketch in Sketch & 2D' }]}
          {...(profileSketch ? {
            supportValue: supportValueOf(profileSketch), supportOptions: supportOptionsOf(profileSketch),
            onSupport: (v: string) => changeSketchSupport(profileSketch.id, v, offsetOf(profileSketch) ?? 0),
            planeOffset: offsetOf(profileSketch),
            onPlaneOffset: (v: number) => changeSketchSupport(profileSketch.id, supportValueOf(profileSketch), v),
            supportLocked: sketchUsers(profileSketch.id).length > 0,
            sketchSummary: `${profileSketch.name}: ${describeSketch(profileSketch)}. Builds on ${supportLabel(profileSketch)}${body}.`,
          } : {
            supportValue: sketchSupport ? 'face' : supportRef ? supportRef.id : 'sketch', supportOptions,
            onSupport: (v: string) => setSupportChoice(v === 'face' ? 'sketch' : v),
            planeOffset: !sketchSupport && !supportRef ? planeOffsets[sketchPlaneName] : null,
            onPlaneOffset: (v: number) => setPlaneOffsets((o) => ({ ...o, [sketchPlaneName]: v })),
            supportLocked: false,
            sketchSummary: `${sketchSummary} Builds on ${currentSupportLabel}${body}.`,
          })}
          kept={keptSketches} refs={referenceGeoms} bodies={bodies.map((b) => ({ id: b.id, name: b.name }))} featureNames={features.map((f) => f.name)}
          edges={selectedEdges} onRemoveEdge={(i) => setSelectedEdges((prev) => prev.filter((_, j) => j !== i))} onClearEdges={() => setSelectedEdges([])}
          faces={selectedFaces} onRemoveFace={(i) => setSelectedFaces((prev) => prev.filter((_, j) => j !== i))} onClearFaces={() => setSelectedFaces([])}
          inspectionResult={inspectionResult && inspectionResult.tool === activeTool ? inspectionResult.text : null}
          onApply={() => void commitFeature()} applying={generating} />;
      })()}<HowToUse guide={guide3D(TOOLS[activeTool])} /></aside>
    </main>}
    {formulaOpen && <FormulaEditorPanel
      parameters={parameters}
      onAdd={addParameter}
      onRename={renameParameter}
      onFormula={setParameterFormula}
      onRemove={removeParameter}
      onClose={() => setFormulaOpen(false)}
      designTable={designTable}
      onImportClick={() => paramFileInputRef.current?.click()}
      onApplyRow={applyDesignTableRow}
    />}
    <input ref={paramFileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleParamFileSelected} />
    </> : <WelcomeScreen
      onNewPart={() => requestNew('Sketch & 2D')}
      onNewAssembly={() => requestNew('3D Design')}
      onNewDrawing={() => requestNew('Drawings & Documentation')}
      onImportCad={handleImportCad}
      projects={projects}
      loadingProjects={loadingProjects}
      onOpenProject={loadProject}
      onBrowseProjects={openProjects}
    />}
    <footer className="statusbar"><div className="status-center">{(workspace === '3D Design' || workspace === 'Sketch & 2D') && <button onClick={() => setAutoKeep(!autoKeep)} className={autoKeep ? 'toggle-on' : ''} title={autoKeep ? 'Keep Sketch is ON: every sketch (any plane or Reference Plane) is kept in the model tree automatically when you leave Sketch & 2D or move to another plane. Click to turn it off.' : 'Keep Sketch is OFF: a sketch stays in Sketch & 2D and is not stored in the tree. Click to turn it on.'}><Archive size={14} /> Keep Sketch: {autoKeep ? 'ON' : 'OFF'}</button>}{workspace === 'Sketch & 2D' && <button onClick={() => setReflectOn(!reflectOn)} className={reflectOn ? 'toggle-on' : ''} title={reflectOn ? 'Reflect is ON: sketches on the other parallel planes are shown here, locked, so you can draw against them. Nothing is copied. Click to hide them.' : 'Reflect is OFF: sketches on other planes are not shown here. Click to show them.'}><Layers3 size={14} /> Reflect: {reflectOn ? 'ON' : 'OFF'}</button>}{workspace === '3D Design' && <button onClick={() => setSectionOn(!sectionOn)} className={sectionOn ? 'toggle-on' : ''} title="Cross-section view: hold the left mouse button and drag in the 3D view to cut the part"><Scissors size={14} /> Section: {sectionOn ? 'ON' : 'OFF'}</button>}{cursorPos && <span className="status-coord" title="Cursor position from the sketch origin (H right, V up)">H {cursorPos.x.toFixed(2)}  V {cursorPos.y.toFixed(2)} {sketchOptions.units}</span>}<button onClick={() => setSnap(!snap)} className={snap ? 'toggle-on' : ''} title="Snap new points to the grid (S)"><span className="status-dot" /> Snap: {snap ? 'ON' : 'OFF'}</button><button onClick={() => setGrid(!grid)} className={grid ? 'toggle-on' : ''} title="Show/hide the sketch grid (G)"><Grid2X2 size={14} /> Grid: {grid ? 'ON' : 'OFF'}</button><div className="appearance-wrap"><button onClick={() => setAppearanceOpen(!appearanceOpen)} className={appearanceOpen ? 'toggle-on' : ''} title="Sketch appearance — line/point width and color"><Palette size={14} /> Style</button>{appearanceOpen && <div className="appearance-panel" onClick={(event) => event.stopPropagation()}>
      <div className="appearance-panel-head">SKETCH APPEARANCE<button onClick={() => setAppearanceOpen(false)} aria-label="Close"><X size={12} /></button></div>
      <div className="appearance-row"><span>Line width</span><input type="range" min={0.6} max={4} step={0.1} value={sketchLineWidth ?? 1.6} onChange={(event) => setSketchLineWidth(parseFloat(event.target.value))} /><input type="color" value={sketchLineColor ?? '#9b7bff'} onChange={(event) => setSketchLineColor(event.target.value)} /></div>
      <div className="appearance-row"><span>Point size</span><input type="range" min={0.6} max={4} step={0.1} value={sketchPointRadius ?? 1.5} onChange={(event) => setSketchPointRadius(parseFloat(event.target.value))} /><input type="color" value={sketchPointColor ?? '#eea862'} onChange={(event) => setSketchPointColor(event.target.value)} /></div>
      <div className="appearance-row"><span>Measurement color</span><input type="color" value={sketchMeasureColor ?? '#70ce9e'} onChange={(event) => setSketchMeasureColor(event.target.value)} /></div>
      <div className="appearance-row"><span>Construction color</span><input type="color" value={sketchConstructionColor ?? '#8079a0'} onChange={(event) => setSketchConstructionColor(event.target.value)} /></div>
      <button className="appearance-reset" onClick={resetSketchAppearance}><RotateCw size={11} /> Reset to defaults</button>
      <div className="appearance-panel-head appearance-panel-subhead">GRID</div>
      <div className="appearance-row appearance-grid-row"><span>H — Primary spacing</span><input type="number" min={1} value={sketchOptions.primaryH} onChange={(event) => setGridValue('primaryH', event.target.value)} /><span>Graduations</span><input type="number" min={1} value={sketchOptions.gradH} onChange={(event) => setGridValue('gradH', event.target.value)} /></div>
      <div className="appearance-row appearance-grid-row"><span>V — Primary spacing</span><input type="number" min={1} disabled={!sketchOptions.allowDistortions} value={sketchOptions.primaryV} onChange={(event) => setGridValue('primaryV', event.target.value)} /><span>Graduations</span><input type="number" min={1} disabled={!sketchOptions.allowDistortions} value={sketchOptions.gradV} onChange={(event) => setGridValue('gradV', event.target.value)} /></div>
      <label className="appearance-row"><span>Allow Distortions</span><input type="checkbox" checked={sketchOptions.allowDistortions} onChange={(event) => setSketchOptions((o) => (event.target.checked ? { ...o, allowDistortions: true } : { ...o, allowDistortions: false, primaryV: o.primaryH, gradV: o.gradH }))} /></label>
      <div className="appearance-panel-head appearance-panel-subhead">UNITS &amp; DISPLAY</div>
      <label className="appearance-row"><span>Length unit</span><select value={sketchOptions.units} onChange={(event) => setSketchOptions((o) => ({ ...o, units: event.target.value as 'mm' | 'cm' | 'in' }))}><option value="mm">Millimeter (mm)</option><option value="cm">Centimeter (cm)</option><option value="in">Inch (in)</option></select></label>
      <label className="appearance-row"><span>Cursor coordinates while drawing</span><input type="checkbox" checked={sketchOptions.cursorCoords} onChange={(event) => setSketchOptions((o) => ({ ...o, cursorCoords: event.target.checked }))} /></label>
      <div className="appearance-panel-head appearance-panel-subhead">CENTRE SNAP (0, 0)</div>
      <label className="appearance-row"><span>Snap distance (px, 0 = off)</span><input type="number" min={0} max={60} step={1} value={sketchOptions.originSnapPx} onChange={(event) => { const v = Number(event.target.value); if (Number.isFinite(v)) setSketchOptions((o) => ({ ...o, originSnapPx: Math.min(60, Math.max(0, v)) })); }} /></label>
      <label className="appearance-row"><span>Lock snapped points with a constraint</span><input type="checkbox" checked={sketchOptions.originConstraint} onChange={(event) => setSketchOptions((o) => ({ ...o, originConstraint: event.target.checked }))} /></label>
      <button className="appearance-reset" onClick={() => setSketchOptions({ primaryH: 100, gradH: 10, primaryV: 100, gradV: 10, allowDistortions: false, units: 'mm', cursorCoords: true, originSnapPx: 10, originConstraint: true })}><RotateCw size={11} /> Reset options</button>
      <div className="appearance-panel-head appearance-panel-subhead">BACKEND</div>
      <form className="appearance-row" onSubmit={(event) => { event.preventDefault(); const v = new FormData(event.currentTarget).get('api'); setSavedApiBase(String(v ?? '')); window.location.reload(); }}>
        <span>Backend URL</span><input name="api" className="appearance-url" defaultValue={API_BASE} title="Where cad_server.py runs — saved in this browser; empty resets to http://127.0.0.1:8000" /><button type="submit" className="appearance-url-save">Use</button>
      </form>
    </div>}</div></div></footer>
    {context && <div className="context-menu" style={{ left: context.x, top: context.y }} onClick={(event) => event.stopPropagation()}><div className="context-heading">MODEL ACTIONS</div>{[['Edit Feature', Pencil], ['Hide', Eye], ['Measure', Ruler], ['Properties', Settings2], ['Create Sketch', Pencil], ['Fillet', Circle], ['Chamfer', ArrowLeftRight], ['AI Analyze', Sparkles]].map(([label, Icon]) => { const ContextIcon = Icon as IconType; return <button key={label as string}><ContextIcon size={13} />{label as string}</button>; })}</div>}
  </div>;
}

function InspectPanel({ selected, materialLabel }: { selected: string; materialLabel: string }) { return <div className="property-content"><div className="inspect-selection"><span className="selection-mark"><BoxSelect size={15} /></span><div><div className="eyebrow">SELECTED ENTITY</div><strong>{selected === 'Faelyx_Project' ? 'None' : 'Face 03'}</strong></div></div><div className="property-group"><div><span>Type</span><b>Face</b></div><div><span>Area</span><b>542 mm²</b></div><div><span>Perimeter</span><b>120 mm</b></div><div><span>Normal</span><b>X 0 · Y 0 · Z 1</b></div></div><div className="property-group"><div><span>Feature</span><b>{selected}</b></div><div><span>Material</span><b>{materialLabel}</b></div></div><button className="outline-action"><Ruler size={12} /> Measure selected entity</button><button className="outline-action"><Sparkles size={12} /> AI Analyze selection</button></div>; }
export default App;
