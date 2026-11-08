// useSketchCore: all of the Sketch & 2D workspace's state and behaviour —
// entities, tools, solving, selection, view, dialogs — returned as one
// object the view components (sketch/views/*) render from. SketchWorkspace
// composes those views; nothing here renders the workspace layout itself.
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { traceLoops, positionLoop } from '../profileLoops';
import { API_BASE, SKETCH_ORIGIN_SVG } from '../config';
import type { Pt, Ln, Circ, Arc, Constraint, Dimension, Plane, SketchProjectData, SketchSnapshot, SketchWorkspaceHandle, SketchTool, SketchCurve, ReflectedSketch } from './types';
import { HIT_TOL } from './constants';
import { pointToSegmentDistance, segParam, angleOfPts, segmentsIntersect } from './geometry';
import type { Model3DGeometry, PlaneFrame } from '../modelGeometry';
import { sampleEllipse, sampleParabola, sampleHyperbola, sampleConicFrom5Points, catmullRom, sampleCvSpline, sampleConicRho } from './curves';

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

export type SketchWorkspaceProps = {
  hidden?: boolean; snapEnabled?: boolean; showGrid?: boolean;
  // Tools > Options > Sketcher grid (Primary Spacing / Graduations per
  // direction; V equals H unless Allow Distortions), document units, the
  // cursor coordinate readout, and Exit Workbench — all from App.tsx.
  grid?: { primaryH: number; gradH: number; primaryV: number; gradV: number };
  units?: 'mm' | 'cm' | 'in';
  showCursorCoords?: boolean;
  onExitWorkbench?: () => void;
  // True while the sketch's support is a picked face of the part.
  onFaceSupport?: boolean;
  appearanceLineColor?: string | null; appearanceLineWidth?: number | null;
  appearancePointColor?: string | null; appearancePointRadius?: number | null;
  appearanceMeasureColor?: string | null; appearanceConstructionColor?: string | null;
  // Project 3D Element: the model's edges / face boundaries / vertices (model coordinates), a counter that changes
  // whenever the model does (so projected elements re-lay themselves), and this sketch's plane.
  getModelGeometry?: () => Model3DGeometry | null;
  modelRevision?: number;
  supportFrame?: PlaneFrame | null;
  // 3D Reference Points, Lines and Axes (model coordinates): the sketch cursor snaps to them as they lie on this sketch's plane.
  referenceGeometry?: { points: { name: string; p: number[] }[]; lines: { name: string; a: number[]; b: number[] }[] };
  // Centre snap: the cursor / endpoints / midpoints lock onto the plane's origin (0, 0) within this many screen pixels (0 = off), and
  // `originAutoConstrain` makes that lock permanent with a coincident (or midpoint) constraint to the Origin.
  originSnapPx?: number;
  originAutoConstrain?: boolean;
};

// Latest versions of the helpers that window-level listener effects call
// (assigned every render, just before the JSX), so a listener set up in
// an earlier render never runs a stale copy.
export type Fx = {
  clientToSvg: (x: number, y: number) => { x: number; y: number };
  computePairMeasure: (gA: EntityGeom, gB: EntityGeom, attached: boolean) => PairMeasure | null;
  entitiesAttached: (gA: EntityGeom, gB: EntityGeom) => boolean;
  geomById: (id: string) => EntityGeom | null;
  promotePairDimension: (gA: EntityGeom, gB: EntityGeom) => unknown;
  deleteSelected: () => void; finishProfile: (close: boolean) => void; resetToolState: () => void;
  solve: (pts: Pt[], lns: Ln[], circs: Circ[], cons: Constraint[]) => Promise<void>;
};

// Feature Persistence & Re-Editing: every point any of the four Point
// Tool sub-modes creates gets a record here of exactly which sub-mode
// made it and its full parameter set — a plain, session-only ref (not
// wired into project save/load, which hasn't been audited) so a
// double-click on an existing point can re-open the Sketch Inspector in
// the right sub-mode with the right values loaded, per the spec's
// Creation Sub-Mode History requirement. Divided Points' four fields are
// duplicated across every point in the batch (all sharing one groupId)
// since the set is edited/regenerated as a whole, never one point at a time.
export type PointFeatureCoord = {
  mode: 'point-coord';
  coordMode: 'cartesian' | 'polar';
  coordX: string; coordY: string; coordR: string; coordTheta: string;
};

export type PointFeatureOnCurve = {
  mode: 'point-oncurve';
  curveTargetId: string;
  curveRef: 'start' | 'end';
  curveOffsetMode: 'length' | 'percent';
  curveOffsetValue: string;
  // The construction-line dimension this point drives (see
  // addSegmentDimension) — re-editing removes and recreates it, since the
  // reference end/entity may have changed.
  dimLineId: string | null;
};

export type PointFeatureMidpoint = {
  mode: 'point-midpoint';
  // Either a single parent curve (direct click on a bare line/arc/curve)
  // or a pair of parent points (the two-point pick fallback) — never both.
  parentEntityId: string | null;
  parentAId: string | null;
  parentBId: string | null;
};

export type PointFeatureDivide = {
  mode: 'point-divide';
  groupId: string;
  divideTargetId: string;
  divideCount: string;
  divideSpacingMode: 'equal' | 'fixed';
  divideFixedDistance: string;
  memberIds: string[];
};

export type PointFeature = PointFeatureCoord | PointFeatureOnCurve | PointFeatureMidpoint | PointFeatureDivide;

// A single tagged shape for every kind of thing on the canvas, so the
// selection traps and the Measure tools can share one lookup instead of
// five near-duplicate point/line/circle/arc loops each.
export type EntityGeom =
  | { kind: 'point'; id: string; x: number; y: number }
  | { kind: 'line'; id: string; a: Pt; b: Pt }
  | { kind: 'circle'; id: string; cx: number; cy: number; r: number }
  | { kind: 'arc'; id: string; cx: number; cy: number; r: number }
  | { kind: 'curve'; id: string; pts: { x: number; y: number }[] };

// A dual-selection preview's full description: what it says, where its
// leader line runs on canvas, and — only when the value maps exactly
// onto a constraint this app's solver actually supports (a straight
// point-to-point Distance, or a line-to-line Angle) — how a click
// commits it for real. sketch_solver.py has no point-to-line or
// line-offset constraint type, so a clearance/offset reading is always
// shown accurately but stays reference-only; faking a point-to-point
// constraint for one of those would silently commit the wrong number.
// `committed` (derived from whether a matching constraint already
// exists — no extra state needed) lets the label read as "already
// applied" instead of clickable once it has been.
export type PairMeasure = {
  label: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  // Present only for the line-line Angle case — draws a small CATIA-style
  // arc between the two rays at the vertex instead of a straight leader
  // (see renderAngleArc below), matching the reference the "measurement
  // not shown" follow-up asked for.
  angle?: { vertex: { x: number; y: number }; dirA: number; dirB: number };
  // The exact numeric value `commit` applies — only needed by the angle
  // case (the distance case's committed value is always exactly
  // Math.hypot(to-from), so the renderer derives it straight from
  // from/to instead of duplicating it here). Lets a double-click edit
  // seed its input with the real committable number instead of trying to
  // parse it back out of `label` (which, for the combined "12.3° · 8.1mm"
  // case, has the angle first — not the committable distance).
  value?: number;
  // Takes an optional override value so a double-click edit (see
  // commitPreviewEdit) can drive the same commit path with a typed
  // number instead of the current live measurement.
  commit: ((value?: number) => void) | null;
  committed?: boolean;
};

// Drag-to-extend + double-click-to-edit for the CATIA-style automatic
// previews above — "make sure measure line can be extended similar to
// measure item and also the value can be changed without disturbing the
// object" (follow-up). Mirrors startDimDrag/startLabelDrag/
// commitDimensionEdit, which a real Dimension already gets, but keeps its
// own tiny bit of state instead of touching the dimensions array: these
// previews stay non-destructive until clicked (see selectionPreview
// above), so dragging one just repositions the ephemeral leader, it
// never writes a Dimension. Keyed by entity id (single) or a stable
// sorted pair key (pair) so a drag persists across re-renders of the
// same selection; the key is discarded implicitly once that entity/pair
// is no longer selected (a fresh preview instance just falls back to the
// same default-offset heuristic it always used).
export type PreviewOverride = { offset: number; labelT?: number; angle?: number };

// What an in-progress preview drag would promote into on release — see
// finalizePreviewDrag below. Set by every start*Drag call alongside its
// own dragging-state; read only once, at mouseup.
export type PreviewDragTarget = { mode: 'single'; g: EntityGeom } | { mode: 'pair'; gA: EntityGeom; gB: EntityGeom };

export function useSketchCore(props: SketchWorkspaceProps, ref: React.ForwardedRef<SketchWorkspaceHandle>) {
  const {
  hidden, snapEnabled = true, showGrid = true,
  grid = { primaryH: 100, gradH: 10, primaryV: 100, gradV: 10 },
  units = 'mm', showCursorCoords = true, onExitWorkbench, onFaceSupport = false,
  appearanceLineColor = null, appearanceLineWidth = null,
  appearancePointColor = null, appearancePointRadius = null,
  appearanceMeasureColor = null, appearanceConstructionColor = null,
  getModelGeometry, modelRevision = 0, supportFrame = null, referenceGeometry, originSnapPx = 10, originAutoConstrain = true,
  } = props;
  // Units: everything is stored and solved in mm; only what's typed and
  // shown is in the chosen unit.
  const unitMm = units === 'cm' ? 10 : units === 'in' ? 25.4 : 1;
  const toU = (mm: number) => mm / unitMm;
  // Whether the inline dimension/preview editor that's open holds an angle
  // (typed as-is) or a length (typed in the current unit).
  const editIsAngleRef = useRef(false);
  // CSS custom properties for the sketch appearance popover — only set
  // (and only override index.css's hardcoded originals) once the
  // corresponding control has actually been touched; see the comment on
  // the component's props above. Measurement color drives both the
  // Measure Between/Item green (--sketch-measure-color) and the angle-
  // dimension purple (--sketch-angle-color) together, and construction
  // color drives both plain construction lines and the Infinite Line
  // tool's own slightly different default shade — two visually-related
  // sub-styles that had their own distinct hardcoded colors, now unified
  // under one swatch each rather than exposing four separate pickers for
  // what the user's request called one thing apiece ("construction
  // lines", "measurement").
  const appearanceStyle: Record<string, string | number> = {};
  if (appearanceLineColor != null) appearanceStyle['--sketch-line-color'] = appearanceLineColor;
  if (appearanceLineWidth != null) appearanceStyle['--sketch-line-width'] = appearanceLineWidth;
  if (appearancePointColor != null) appearanceStyle['--sketch-point-color'] = appearancePointColor;
  if (appearanceMeasureColor != null) { appearanceStyle['--sketch-measure-color'] = appearanceMeasureColor; appearanceStyle['--sketch-angle-color'] = appearanceMeasureColor; }
  if (appearanceConstructionColor != null) { appearanceStyle['--sketch-construction-color'] = appearanceConstructionColor; appearanceStyle['--sketch-infinite-color'] = appearanceConstructionColor; }
  const [points, setPoints] = useState<Pt[]>([]);
  const fx = useRef<Fx>({} as Fx);
  // One id → point lookup per render instead of a linear search per call.
  const pointById = new Map(points.map((p) => [p.id, p]));
  const [lines, setLines] = useState<Ln[]>([]);
  const [circles, setCircles] = useState<Circ[]>([]);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  // 'select' — not 'point' — so a freshly opened sketch starts in the same
  // rest state Escape now returns you to, instead of quietly being in
  // Point-placement mode with no button showing it.
  const [tool, setTool] = useState<SketchTool>('select');
  // The Sketch Inspector's tool card follows whatever was last picked in
  // the toolbox. Mode tools are `tool` itself; a constraint button or AI
  // Import is a one-shot pick with no mode, so it's remembered here —
  // cleared the moment a mode tool is chosen (see the effect below).
  const [toolboxPick, setToolboxPick] = useState<{ kind: 'constraint' | 'ai'; type: string; name: string; hint: string } | null>(null);
  useEffect(() => { if (tool !== 'select') setToolboxPick(null); }, [tool]);
  const [pending, setPending] = useState<string | null>(null);

  // Undo/redo history — a plain snapshot stack rather than per-action
  // commands, since edits land through dozens of call sites across this
  // file and a snapshot approach needs none of them touched. `index`
  // points at the snapshot matching what's currently on screen; undo/redo
  // just move it and restore. A short debounce (see the effect below,
  // near `dimensions`) coalesces a drag (dimension line/label, which sets
  // state on every mousemove) into one entry instead of hundreds — nearly
  // everything else here is already a single discrete commit per action,
  // so it lands in history immediately either way. suppressHistoryRef
  // stops the effect from re-capturing a snapshot restore as if it were a
  // brand-new edit.
  const historyRef = useRef<{ stack: SketchSnapshot[]; index: number }>({
    stack: [{ points: [], lines: [], circles: [], arcs: [], curves: [], constraints: [], dimensions: [] }],
    index: 0,
  });
  const suppressHistoryRef = useRef(false);
  const historyDebounceRef = useRef<number | null>(null);
  // Live cursor position for App.tsx's statusbar readout (see
  // getCursorPosition on the imperative handle) — updated on every canvas
  // mousemove regardless of tool, cleared on mouseleave. A ref, not state:
  // nothing here needs to re-render on every mouse pixel.
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);

  // Select tool — the only two gestures it has: a drag starting on empty
  // canvas box-selects (dragBox, below), and a drag starting directly ON an
  // already-selected entity moves the whole selection instead (dragModeRef
  // picks which one a given mousedown turned into). No separate mode picker
  // — see the removed SELECTION MODE section this replaced.
  const [dragBox, setDragBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  // Screen-pixel (clientX/clientY) counterpart of dragStartRef, set at the
  // same mousedown — used ONLY to decide whether the mouse has "really"
  // moved (see dragMovedRef below). Sketch-space coordinates are the wrong
  // unit for that check: toSvgCoords bakes in the current zoom, so a fixed
  // sketch-unit threshold shrinks to a fraction of a screen pixel whenever
  // the view is zoomed out even a little, and a perfectly ordinary click
  // (a fraction of a pixel of real mouse jitter between mousedown and
  // mouseup) then reads as "moved" and gets silently swallowed as a failed
  // micro-drag instead of registering as a selection — this is why picking
  // a 2nd entity to measure could seem to randomly "not take."
  const dragStartClientRef = useRef<{ x: number; y: number } | null>(null);
  // 'box' | 'move' | null — which gesture the current left-drag turned into,
  // decided once in handleCanvasMouseDown and read by Move/Up/Escape.
  const dragModeRef = useRef<'box' | 'move' | 'paint' | null>(null);
  // Drag-to-move state: the point ids being dragged (every selected entity
  // resolves down to shared Pt ids — see pointIdsForSelection) and their
  // positions at drag-start, so Escape can roll back to an exact snapshot
  // and a live drag can always compute dx/dy from a fixed origin rather
  // than accumulating per-frame rounding drift.
  const moveOriginRef = useRef<{ x: number; y: number } | null>(null);
  const moveIdsRef = useRef<Set<string>>(new Set());
  const moveBaseRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // True once a move/box drag has actually moved past a small pixel
  // threshold — lets handleCanvasClick tell a real drag's trailing click
  // apart from a genuine click-to-select/deselect.
  const dragMovedRef = useRef(false);
  // Debounces the live re-solve while a move-drag is in progress, so every
  // mousemove doesn't each fire its own network round-trip.
  const moveSolveDebounceRef = useRef<number | null>(null);

  // Freeform sampled curves (Ellipse/Parabola/Hyperbola/Conic/Spline) —
  // see the SketchCurve type comment above for why these live in their own
  // array instead of points/lines/circles/arcs.
  const [curves, setCurves] = useState<SketchCurve[]>([]);

  // Which base entityTools button (by name) currently has its flyout
  // popover open — see the SKETCH ENTITIES toolbox section further down.
  const [flyoutOpen, setFlyoutOpen] = useState<string | null>(null);

  // Shared "wizard" state for every new multi-click flyout tool below
  // (oriented rectangle, parallelogram, slot, keyhole, hexagon, 3-point
  // circle, circle center+2pts, tri-tangent circle, ellipse, parabola,
  // hyperbola, conic, line normal/bisect/angle) — each just accumulates
  // plain {x,y} clicks or picked-entity ids here and reads however many
  // it needs, rather than every construction needing its own bespoke
  // useState/useRef pair. wizardPolyPts is the click-to-add/double-click-
  // to-finish list shared by General Profile and Spline.
  const wizardPtsRef = useRef<{ x: number; y: number }[]>([]);
  const wizardIdsRef = useRef<string[]>([]);
  const [wizardPolyPts, setWizardPolyPts] = useState<{ x: number; y: number }[]>([]);

  // Point by Coordinates — a typed X/Y (Cartesian) or R/θ (Polar) in the
  // bottom bar instead of a click; coordMode picks which pair applies.
  const [coordX, setCoordX] = useState('0');
  const [coordY, setCoordY] = useState('0');
  const [coordR, setCoordR] = useState('0');
  const [coordTheta, setCoordTheta] = useState('0');
  // Coordinate Circle — same typed-entry idea as Point by Coordinates, plus a radius.
  const [circCoordX, setCircCoordX] = useState('0');
  const [circCoordY, setCircCoordY] = useState('0');
  const [circCoordR, setCircCoordR] = useState('10');
  // Circle Using Coordinates opens the guide's Circle Definition dialog box.
  const [circleDefOpen, setCircleDefOpen] = useState(false);
  // Points on Curve — which entity is picked (null until the first click),
  // which of its ends the offset is measured from, whether that's flipped,
  // and the offset itself either as a length or a 0-100% along the entity.
  const [curveTargetId, setCurveTargetId] = useState<string | null>(null);
  const [curveOffsetValue, setCurveOffsetValue] = useState('50');
  // The on-canvas "editable dimension text callout" next to the live
  // Points-on-Curve preview point — a brand-new, independent bit of state
  // (not the existing editingPreviewKey/previewOverrides system, which is
  // tightly coupled to Select-mode's own auto-preview feature) that just
  // mirrors curveOffsetValue when not being edited, and writes back into it
  // on Enter/blur.
  const [curveDimEditing, setCurveDimEditing] = useState(false);
  const [curveDimEditValue, setCurveDimEditValue] = useState('');
  // Auto-focuses the Sketch Inspector's own Distance field (not the bottom
  // bar's copy) the moment an entity is picked — see the useEffect below.
  const curveDistInputRef = useRef<HTMLInputElement>(null);
  // Equidistant/Divided Points — which entity is picked, how many points
  // (Equal Divisions) or how far apart (Fixed Distance Spacing), and which
  // of the two spacing modes is active; divideCount also doubles as the
  // live preview's point count while a target is picked but not yet confirmed.
  const [divideCount, setDivideCount] = useState('5');
  const [divideTargetId, setDivideTargetId] = useState<string | null>(null);
  const [divideFixedDistance, setDivideFixedDistance] = useState('20');
  // Line Normal to a Curve — which entity is picked (real React state, same
  // reason as curveTargetId above: the Inspector/bottom bar react live to
  // it), the typed Distance (blank by default per the spec, so a fresh pick
  // never silently commits some arbitrary eyeballed length until the user
  // actually types one or clicks/Applies), Reverse (flips which side of the
  // curve the line extends toward) and Symmetrical Extension (splits the
  // line evenly to both sides of the foot point instead of running only
  // from the foot out to the far end).
  const [lineNormalTargetId, setLineNormalTargetId] = useState<string | null>(null);
  const [lineNormalDistance, setLineNormalDistance] = useState('');
  const [lineNormalReverse, setLineNormalReverse] = useState(false);
  const [lineNormalSymmetric, setLineNormalSymmetric] = useState(false);
  // CATIA's order (the guide, L1240-1243): the start point first, then the
  // curve the line should be normal to. Off keeps the app's curve-first flow.
  const [lineNormalPointFirst, setLineNormalPointFirst] = useState(false);
  const [lineNormalStart, setLineNormalStart] = useState<{ x: number; y: number; id: string | null } | null>(null);
  // Auto-focuses the Sketch Inspector's own Distance field the moment a
  // target entity is picked — same pattern as curveDistInputRef above.
  const lineNormalDistInputRef = useRef<HTMLInputElement>(null);
  // Symmetrical Extension Line — the anchor (center) the line will expand
  // out from on both sides, set by the first click (landing on empty
  // canvas, on an existing point, or projected onto an existing curve/
  // entity — see the line-symmetric click handler) and a typed Distance
  // (blank by default; while blank the total length instead tracks the
  // live cursor position, doubled, exactly like every other tool's
  // eyeballed-length default).
  const [lineSymAnchor, setLineSymAnchor] = useState<{ x: number; y: number } | null>(null);
  const [lineSymDistance, setLineSymDistance] = useState('');
  // On-canvas editable dimension-text callouts for the two new Line tools —
  // independent bits of state (not the Select-mode previewOverrides system),
  // mirroring curveDimEditing/curveDimEditValue above: double-clicking the
  // live length label lets you type a new Distance directly on the canvas.
  const [lineNormalDimEditing, setLineNormalDimEditing] = useState(false);
  const [lineNormalDimEditValue, setLineNormalDimEditValue] = useState('');
  const [lineSymDimEditing, setLineSymDimEditing] = useState(false);
  const [lineSymDimEditValue, setLineSymDimEditValue] = useState('');

  // Lines created symmetric about a center (Symmetrical Extension, or Line
  // Normal to a Curve with its own Symmetrical Extension toggle on) — a
  // plain, session-only id set, same idea as pointFeaturesRef, so that
  // re-selecting one of these lines later can default its Length editor's
  // anchor to Center instead of Start, keeping the symmetric behavior
  // intact through a later length edit instead of silently reverting to a
  // one-sided stretch (see the lineAnchor reset effect below).
  const symmetricLineIdsRef = useRef<Set<string>>(new Set());
  // Set together with switching `tool` back into the matching sub-mode on a
  // double-click re-edit — the next Apply/Enter in that sub-mode updates
  // the existing point (editingPointId) or point set (editingGroupId) in
  // place instead of creating a duplicate. Bisecting/Mid Point has no
  // editing state of its own since a midpoint is definitionally read-only
  // (see the Inspector's point-midpoint panel).
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  // Regular Polygon — side count + inscribed (vertex-defined) vs. circumscribed (edge-defined).
  const [polygonSides, setPolygonSides] = useState('6');
  const [polygonCircumscribed, setPolygonCircumscribed] = useState(false);
  // 2D Fillet / Chamfer — radius (Fillet) or the two trim distances (Chamfer),
  // typed once in the bottom bar and reused for every corner picked until changed.
  const [filletRadius, setFilletRadius] = useState('10');
  const [chamferDistA, setChamferDistA] = useState('10');
  const [chamferDistB, setChamferDistB] = useState('10');
  const [chamferAngle, setChamferAngle] = useState('45');
  // General Conic (Rho) — the shape-parameter, 0–1, typed once and reused for
  // every conic picked out until changed (0.5 ≈ a parabola-like conic).
  const [conicRho, setConicRho] = useState('0.5');
  // Closed Profile Toggle — when off, double-clicking to finish a General
  // Profile leaves it open (no closing segment back to the first point).
  const [profileClosed, setProfileClosed] = useState(true);
  // Profile tool as CATIA chains it: every click commits a real segment
  // straight away, starting from the previous segment's end. profileChain
  // is null until the first click; `lastDir` is the travel direction at
  // the chain's end (null until one segment exists — that's what keeps
  // Tangent Arc "frozen" until a line has been drawn). profileSegMode is
  // the Line / Tangent Arc / Three Point Arc switch in the bottom bar;
  // an arc drops back to Line once placed. profileThroughRef holds a
  // Three Point Arc's second (pass-through) click.
  const [profileChain, setProfileChain] = useState<{ firstId: string; lastId: string; lastDir: { x: number; y: number } | null; segs: number; lastSegId?: string } | null>(null);
  const [profileSegMode, setProfileSegMode] = useState<'line' | 'tangent-arc' | 'arc-3pt'>('line');
  const profileThroughRef = useRef<{ x: number; y: number } | null>(null);

  // Typed entry for the tools the guide gives a Sketch tools value row —
  // Line (Start/End H/V, Length/Angle), Circle (center H/V + R), Axis,
  // Rectangle / Oriented Rectangle / Parallelogram (corner H/V, Width,
  // Height, angle). H/V are measured from the sketch origin, V up, the
  // same convention as Points by Coordinates. One shared set of fields,
  // since only one of these tools is ever active at a time.
  const [numStartH, setNumStartH] = useState('0');
  const [numStartV, setNumStartV] = useState('0');
  const [numEndH, setNumEndH] = useState('');
  const [numEndV, setNumEndV] = useState('');
  const [numAngle, setNumAngle] = useState('');
  const [numWidth, setNumWidth] = useState('40');
  const [numHeight, setNumHeight] = useState('20');
  const [numRadius, setNumRadius] = useState('10');
  const [numSkew, setNumSkew] = useState('60');
  // Line tool's Symmetrical Extension toggle — when on, the first click is
  // the midpoint and the line grows equally both ways (total = 2 × drag).
  const [lineSymToggle, setLineSymToggle] = useState(false);
  const [circle3ptR, setCircle3ptR] = useState('');

  const [trapPoly, setTrapPoly] = useState<{ x: number; y: number }[]>([]);
  const [paintStroke, setPaintStroke] = useState<{ x: number; y: number }[] | null>(null);

  // Hide/Show and Swap Visible Space: hiddenIds are only turned off for
  // display — they still take part in the extruded profile. swapSpace
  // shows the hidden space instead (only hidden elements, green canvas).
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [swapSpace, setSwapSpace] = useState(false);
  // View-only gestures from the View toolbar (Zoom Area, Zoom In Out),
  // armed by their buttons and consumed by the next left-drag, on top of
  // whatever drawing tool is active. suppressClickRef swallows the click
  // that trails the drag's mouseup.
  const [viewGesture, setViewGesture] = useState<'zoom-area' | 'zoom-drag' | null>(null);
  const viewDragRef = useRef<{ start: { x: number; y: number }; clientY: number; vb: { x: number; y: number; w: number; h: number } } | null>(null);
  const [zoomAreaBox, setZoomAreaBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const suppressClickRef = useRef(false);
  // Normal View's "reverse": once the view is already normal, choosing it
  // again flips the horizontal direction (the V direction is unchanged).
  const [viewFlipped, setViewFlipped] = useState(false);
  const [hoverEntity, setHoverEntity] = useState(false);
  // Which points/circles the last solve reported as fully pinned — lines
  // and arcs are fully constrained when all their defining points are.
  // Drawn green, CATIA's "fully constrained" colour.
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
  const solveSeqRef = useRef(0);
  // Sketch Positioning (Sketch with Absolute Axis Definition): where this
  // sketch's absolute axis sits on its plane — an H/V offset of its origin
  // and a rotation of its H direction. Only moves the extruded profile on
  // the plane; the canvas itself always shows the sketch's own axes.
  const [positioning, setPositioning] = useState<{ originH: number; originV: number; angle: number }>({ originH: 0, originV: 0, angle: 0 });
  const [positioningOpen, setPositioningOpen] = useState(false);
  // Ids of the construction points/lines a Sketch on Face projected in, so
  // a new face (or going back to the XY stack) replaces them cleanly.
  const projectedIdsRef = useRef<Set<string>>(new Set());
  // Sketches of parallel planes shown (locked) on this plane — see ReflectedSketch.
  const [reflected, setReflected] = useState<ReflectedSketch[]>([]);

  // Measure & Analysis — Measure Between (last two clicked entities) and
  // Measure Item (last single clicked entity). measureFirstRef holds the
  // first pick of a Measure Between pair between the two clicks it takes.
  const [measureResult, setMeasureResult] = useState<{ kind: 'between' | 'item'; lines: [string, string][] } | null>(null);
  // CATIA Workbook's Parameterization Analysis, scoped to this app's one
  // active sketch: a browsable list of every constraint, so an
  // over-constrained sketch (see the DOF badge) can actually be resolved
  // by finding and removing the offending one instead of guessing.
  const [showConstraintsList, setShowConstraintsList] = useState(false);
  const measureFirstRef = useRef<string | null>(null);
  const [dof, setDof] = useState<number | null>(null);
  const [status, setStatus] = useState('Empty sketch');
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live rubber-band preview while placing the 2nd point of a line, or the
  // radius point of a circle: mousePt tracks the cursor in sketch space,
  // liveValue is the editable length/radius shown at the bottom of the
  // canvas (mirrored as a dashed preview + label on the plane itself).
  // isEditingLive stops mouse movement from overwriting what's being typed.
  const [mousePt, setMousePt] = useState<{ x: number; y: number } | null>(null);
  const [liveValue, setLiveValue] = useState('');
  const [isEditingLive, setIsEditingLive] = useState(false);

  // Arc placement is 3 clicks, not 2 — center, then radius+start (drag 1),
  // then end angle (drag 2) — so unlike Line/Circle's single pendingRef,
  // there's a second stage to remember between clicks. Null while waiting
  // for the radius/start click; set once that lands, holding the values
  // the 3rd click (end angle) needs to actually build the Arc.
  const arcDraftRef = useRef<{ r: number; start: number } | null>(null);

  // Same idea, for the toolbox's Distance/Radius/Angle constraints: these
  // need a number from the user before the constraint can be built, but
  // unlike Line/Circle placement there's no natural "second click" to
  // drive it. Rather than a native window.prompt() — a jarring OS dialog
  // that doesn't match how every other dimension in this app is edited —
  // applyConstraint() opens this instead, prefilled with the *current*
  // measured distance/radius/angle, and the same bottom-bar UI as above
  // commits or cancels it.
  // `anchor` is the id of whichever selected point/line should stay fixed
  // when the value is committed — see commitPendingConstraint below for why.
  const [pendingConstraint, setPendingConstraint] = useState<{ type: 'distance' | 'radius' | 'angle'; ids: string[]; value: string; anchor?: string } | null>(null);

  // Which reference plane this sketch is on. Each plane keeps its own
  // independent geometry — switching is instant and non-destructive, like
  // switching sketches in a real CAD tool, not a single flat canvas that
  // gets relabeled. sketchesRef holds the *other* (currently inactive)
  // planes' data; the active plane's data lives in the points/lines/
  // circles/constraints state above, same as everywhere else in this file.
  const [plane, setPlane] = useState<Plane>('Front');
  const sketchesRef = useRef<Partial<Record<Plane, SketchProjectData>>>({});

  // A dedicated "pick a plane before you sketch" screen, CATIA/Fusion-style
  // — shown the moment a fresh sketch opens (see clearSketch below) so the
  // very first click a person makes is choosing Front/Top/Right, not
  // drawing blind on whatever plane happened to be left active. Reopenable
  // any time via the "Change Plane" button in the viewport topline, so
  // switching mid-sketch doesn't require hunting for the small text tabs.
  const DEFAULT_VIEW_BOX = { x: 0, y: 0, w: 400, h: 300 };
  // The fixed "start sketching here" point every plane opens on — the center
  // of that default view, so Front/Top/Right all land on the same visual
  // spot. Purely a drawn marker (H/V axis arrows + a center dot), not a real
  // point in the geometry model — nothing snaps to it and it plays no part
  // in constraints/solving, it just gives a person a place to click first.
  const SKETCH_ORIGIN = SKETCH_ORIGIN_SVG;
  const ORIGIN_ARM = 42;
  const [planePickerOpen, setPlanePickerOpen] = useState(true);
  // Guards the "Reset" button in the viewport topline — erasing every
  // plane's geometry is destructive and can't be undone, so it always
  // shows a Yes/No warning first rather than firing on a single click.
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // Resizable panes for this workspace-grid (Sketch Tree / Sketch Toolbox /
  // Canvas / Sketch Inspector) — dragged via the .col-resizer handles
  // between them. Same mechanism (and CSS) as the 3D Design workspace-grid
  // in App.tsx; the canvas column itself stays a flexible minmax(500px,1fr)
  // track so it can never be squeezed away to nothing.
  const [colWidths, setColWidths] = useState({ col1: 197, col2: 214, col4: 255 });
  const [resizingCol, setResizingCol] = useState<'col1' | 'col2' | 'col4' | null>(null);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
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
  // Pan/zoom state for the sketch canvas — a plain SVG viewBox rectangle in
  // sketch-space units. toSvgCoords() below already converts screen clicks
  // through the SVG's live screen-CTM rather than hardcoding 400x300, so
  // every existing click/drag/hit-test in this file keeps working exactly
  // as before no matter how this viewBox has been panned or zoomed.
  const [viewBox, setViewBox] = useState(DEFAULT_VIEW_BOX);
  const [isPanning, setIsPanning] = useState(false);
  const panLastRef = useRef<{ x: number; y: number } | null>(null);
  // View rotation (degrees, around the current viewBox center) — Alt+drag,
  // the same "hold a modifier and drag" language as pan, just spinning the
  // flat sketch plane in-place instead of sliding it. Purely a view control:
  // it never touches the actual point/line/circle coordinates, so undo,
  // constraints, and every existing hit-test still work exactly as before —
  // clientToSvg (below) is what quietly un-rotates a click back into real
  // sketch-space before anything else sees it.
  const [rotation, setRotation] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const rotateLastRef = useRef<{ x: number; y: number } | null>(null);

  // Measure Item's on-canvas dimension annotations (see the Dimension type
  // above). One per measured entity — measuring the same entity again just
  // keeps whatever's already there (including any offset/angle a drag has
  // set) rather than resetting it back to the default placement.
  const [dimensions, setDimensions] = useState<Dimension[]>([]);

  // Pushes the CURRENT live state as a new history entry, truncating
  // whatever redo tail existed past the current index. Called by the
  // debounced auto-capture effect below on every settled edit, and by
  // undo() to make sure the just-made (not-yet-debounced) edit isn't lost
  // when you undo immediately after making it.
  const pushHistorySnapshot = () => {
    const snapshot: SketchSnapshot = { points, lines, circles, arcs, curves, constraints, dimensions, hidden: [...hiddenIds] };
    const h = historyRef.current;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(snapshot);
    const MAX_HISTORY = 100;
    if (h.stack.length > MAX_HISTORY) h.stack.shift();
    h.index = h.stack.length - 1;
  };

  // Auto-captures a history entry ~350ms after the sketch settles — long
  // enough to coalesce a dimension-line/label drag (which calls
  // setDimensions on every mousemove; see startDimDrag/startLabelDrag
  // below) into a single undo step, short enough that a real Undo click
  // right after a normal single-commit edit (drawing a line, applying a
  // constraint — nearly everything else here) still finds it already
  // captured. suppressHistoryRef skips the capture entirely when this
  // change was undo/redo restoring a snapshot, not a new edit.
  useEffect(() => {
    if (suppressHistoryRef.current) { suppressHistoryRef.current = false; return; }
    if (historyDebounceRef.current !== null) window.clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = window.setTimeout(() => {
      historyDebounceRef.current = null;
      pushHistorySnapshot();
    }, 350);
    return () => { if (historyDebounceRef.current !== null) { window.clearTimeout(historyDebounceRef.current); historyDebounceRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, lines, circles, arcs, curves, constraints, dimensions, hiddenIds]);

  // Arc endpoints as real points. Any arc without its p1/p2 (drawn by a
  // tool that only knows center/radius/angles, or loaded from an older
  // project) gets them attached: an existing point already sitting at that
  // end (a slot's or fillet's joining line) is reused, otherwise a new one
  // is added. Then r/start/end are re-derived from wherever the center and
  // endpoints actually are, so a solve or a drag that moves them moves the
  // arc with them. Converges in one extra render (nothing changes on the
  // second pass).
  useEffect(() => {
    if (arcs.length === 0) return;
    const byId = new Map(points.map((p) => [p.id, p]));
    const added: Pt[] = [];
    const findOrAdd = (x: number, y: number, exclude: string) => {
      const hit = [...points, ...added].find((p) => p.id !== exclude && Math.hypot(p.x - x, p.y - y) < 1e-2);
      if (hit) return hit;
      const pt = { id: nextId('pt'), x, y };
      added.push(pt);
      return pt;
    };
    let changed = false;
    const norm = (d: number) => ((d % 360) + 360) % 360;
    const next = arcs.map((a) => {
      const c = byId.get(a.center);
      if (!c) return a;
      const at = (deg: number) => ({ x: c.x + a.r * Math.cos((deg * Math.PI) / 180), y: c.y + a.r * Math.sin((deg * Math.PI) / 180) });
      const P1 = (a.p1 && byId.get(a.p1)) || findOrAdd(at(a.start).x, at(a.start).y, a.center);
      const fullCircle = Math.abs(norm(a.end - a.start)) < 1e-9;
      const P2 = (a.p2 && byId.get(a.p2)) || (fullCircle ? P1 : findOrAdd(at(a.end).x, at(a.end).y, a.center));
      const r = Math.hypot(P1.x - c.x, P1.y - c.y);
      const start = norm(angleOfPts(c, P1));
      const end = P2.id === P1.id ? a.end : norm(angleOfPts(c, P2));
      if (a.p1 === P1.id && a.p2 === P2.id && Math.abs(r - a.r) < 1e-6 && Math.abs(norm(start - a.start + 180) - 180) < 1e-6 && Math.abs(norm(end - a.end + 180) - 180) < 1e-6) return a;
      changed = true;
      return { ...a, p1: P1.id, p2: P2.id, r: r > 1e-9 ? r : a.r, start, end };
    });
    if (added.length) setPoints((ps) => [...ps, ...added]);
    if (changed) setArcs(next);
  }, [points, arcs]);


  const restoreSnapshot = (snap: SketchSnapshot) => {
    suppressHistoryRef.current = true;
    setPoints(snap.points); setLines(snap.lines); setCircles(snap.circles); setArcs(snap.arcs);
    setCurves(snap.curves); setConstraints(snap.constraints); setDimensions(snap.dimensions);
    setHiddenIds(new Set(snap.hidden ?? []));
    setSelected([]);
    void solve(snap.points, snap.lines, snap.circles, snap.constraints);
  };

  // Undo/Redo also work in the middle of a tool: a half-finished step that
  // hasn't added anything yet (the clicks a 3-point arc or a trap polygon
  // collects) is just dropped; one that already placed geometry (a line's
  // first point, a profile's segments) is dropped AND stepped back past.
  const dropToolStep = (): 'none' | 'partial' | 'placed' => {
    const placed = !!pendingRef.current || !!profileChain;
    const partial = wizardPtsRef.current.length > 0 || wizardIdsRef.current.length > 0 || wizardPolyPts.length > 0 || trapPoly.length > 0
      || !!arcDraftRef.current || !!pendingConstraint || !!lineNormalStart || !!lineSymAnchor || !!measureFirstRef.current;
    if (!placed && !partial) return 'none';
    resetToolState();
    return placed ? 'placed' : 'partial';
  };

  const undo = () => {
    if (dropToolStep() === 'partial') return;
    // Flush any pending debounced capture first, so an undo fired right
    // after a fresh edit (before the 350ms settle) steps back from that
    // edit rather than skipping over it.
    if (historyDebounceRef.current !== null) { window.clearTimeout(historyDebounceRef.current); historyDebounceRef.current = null; pushHistorySnapshot(); }
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    restoreSnapshot(h.stack[h.index]);
  };

  const redo = () => {
    dropToolStep();
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    restoreSnapshot(h.stack[h.index]);
  };

  // Starts a brand-new history stack at `snap` — used wherever the sketch
  // is wholesale replaced rather than edited (a plane switch, loading a
  // project/example, Clear, Reset): undoing "into" a different plane's or
  // a previous project's geometry would restore state that's meaningless
  // in the new context (wrong plane, wrong project entirely), so each of
  // those starts fresh instead of extending the old stack.
  const resetHistory = (snap: SketchSnapshot) => {
    if (historyDebounceRef.current !== null) { window.clearTimeout(historyDebounceRef.current); historyDebounceRef.current = null; }
    historyRef.current = { stack: [snap], index: 0 };
    suppressHistoryRef.current = true;
  };

  const [draggingDimId, setDraggingDimId] = useState<string | null>(null);
  // Dragging the label itself (separate from dragging the whole dimension
  // line via draggingDimId above) just slides it along the dimension/leader
  // line — see the drag effect right after startDimDrag below.
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const [dimEditValue, setDimEditValue] = useState('');
  // Clicking a dimension (its hit-line or its label) selects *the
  // annotation itself*, separately from selecting the entity it measures —
  // Delete/Backspace then removes just this measurement (see the keydown
  // handler and deleteDimension below), never the real line/circle/arc it's
  // attached to. A plain canvas click anywhere else clears it, same as
  // entity selection.
  const [selectedDimId, setSelectedDimId] = useState<string | null>(null);

  // Buffered text for the selection editor's X/Y/Length/Radius fields, so
  // typing doesn't fight with the controlled value re-rendering from the
  // entity's actual (solved) position. Cleared whenever the single-selected
  // entity id changes, so a freshly-selected entity shows its real values.
  const [editBuffer, setEditBuffer] = useState<{ x?: string; y?: string; length?: string; radius?: string; angle?: string; arcStart?: string; arcEnd?: string; curveRx?: string; curveRy?: string; curveRot?: string; curveSpan?: string; curveRho?: string }>({});

  // A line has two endpoints, so "make it 120mm" or "point it at 30°" is
  // ambiguous about which end should move — without an anchor, the solver
  // is free to split the change across both, which is the "both dots are
  // moving" behavior this fixes. lineAnchor picks which endpoint of the
  // *selected* line stays put; commitLineLength/commitLineAngle below pin
  // it with a real Fixed constraint before applying the new dimension.
  // 'center' is the third option — for a line built symmetric about a
  // center (Symmetrical Extension, or Line Normal to a Curve with its own
  // Symmetrical Extension toggle on), keeps that center fixed instead and
  // moves both endpoints outward/inward equally, so the symmetry survives
  // a later length or angle edit instead of collapsing into a one-sided
  // stretch off whichever end happens to be "Start."
  const [lineAnchor, setLineAnchor] = useState<'p1' | 'p2' | 'center'>('p1');

  const [importing, setImporting] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const pendingRef = useRef<string | null>(null);
  const idCounterRef = useRef(0);
  const nextId = (prefix: string) => `${prefix}${++idCounterRef.current}`;

  // Raw screen→viewBox conversion, with no rotation correction — this is
  // the space vb.x/vb.y/vb.w/vb.h themselves live in (rotation is applied
  // purely visually, via a <g transform> around the content, never to the
  // viewBox rectangle), so pan/zoom math that reasons about the viewBox
  // uses this directly.
  const rawClientToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  // Real sketch-space coordinates — rawClientToSvg with the current view
  // rotation un-done, so a click always lands on the same actual point/line
  // coordinates no matter how the view has been spun. Everything that
  // places or hit-tests geometry (drawing tools, dimension dragging, etc.)
  // goes through this one; only the wheel-zoom cursor calc below needs the
  // raw, un-rotated viewBox-space version instead.
  const rotationCenter = () => ({ x: viewBox.x + viewBox.w / 2, y: viewBox.y + viewBox.h / 2 });
  const clientToSvg = (clientX: number, clientY: number) => {
    const p = rawClientToSvg(clientX, clientY);
    const { x: cx, y: cy } = rotationCenter();
    let out = p;
    if (rotation) {
      const rad = (-rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const dx = p.x - cx, dy = p.y - cy;
      out = { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    }
    // Normal View's reversed view mirrors H about the view center (applied
    // inside the rotation — see the content <g> transform), so undo it last.
    return viewFlipped ? { x: 2 * cx - out.x, y: out.y } : out;
  };

  // Scroll-wheel zoom, centered on the cursor (not the canvas center) so
  // zooming toward a corner of the part actually gets you closer to it.
  // Attached as a native, non-passive listener — React's onWheel is passive
  // by default, which silently makes evt.preventDefault() a no-op and lets
  // the page itself scroll while you're trying to zoom the sketch.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (evt: WheelEvent) => {
      evt.preventDefault();
      const cursor = rawClientToSvg(evt.clientX, evt.clientY);
      setViewBox((vb) => {
        let factor = Math.exp(evt.deltaY * 0.0015);
        factor = Math.min(4000 / vb.w, Math.max(15 / vb.w, factor));
        const newW = vb.w * factor;
        const newH = vb.h * factor;
        const relX = (cursor.x - vb.x) / vb.w;
        const relY = (cursor.y - vb.y) / vb.h;
        return { x: cursor.x - relX * newW, y: cursor.y - relY * newH, w: newW, h: newH };
      });
    };
    svg.addEventListener('wheel', onWheelNative, { passive: false });
    return () => svg.removeEventListener('wheel', onWheelNative);
  }, []);

  // Universal mouse scheme (the same in 3D Design): hold the middle button
  // and drag to pan. While it is held, a single right-click (press and
  // release in place) switches to zoom — drag up to zoom in, down to zoom
  // out — until the middle button is released. Holding middle + right and
  // dragging is the 3D orbit chord; a 2D sketch has nothing to orbit, so it
  // does nothing here. Tracked with window-level listeners rather than the
  // svg's own onMouseMove/onMouseUp, so a fast drag that momentarily leaves
  // the canvas bounds doesn't drop the pan.
  useEffect(() => {
    if (!isPanning) return;
    let rmbHeld = false; let rmbMoved = false; let rmbX = 0; let rmbY = 0;
    let zoomAnchor: { x: number; y: number } | null = null;
    const onMove = (evt: MouseEvent) => {
      const svg = svgRef.current;
      const last = panLastRef.current;
      if (!svg || !last) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const dxPx = evt.clientX - last.x;
      const dyPx = evt.clientY - last.y;
      panLastRef.current = { x: evt.clientX, y: evt.clientY };
      if (zoomAnchor) {
        const anchor = zoomAnchor;
        setViewBox((vb) => {
          let factor = Math.exp(dyPx * 0.01);
          factor = Math.min(4000 / vb.w, Math.max(15 / vb.w, factor));
          const newW = vb.w * factor;
          const newH = vb.h * factor;
          const relX = (anchor.x - vb.x) / vb.w;
          const relY = (anchor.y - vb.y) / vb.h;
          return { x: anchor.x - relX * newW, y: anchor.y - relY * newH, w: newW, h: newH };
        });
        return;
      }
      if (rmbHeld) { if (Math.hypot(evt.clientX - rmbX, evt.clientY - rmbY) > 3) rmbMoved = true; return; }
      setViewBox((vb) => ({ ...vb, x: vb.x - dxPx / ctm.a, y: vb.y - dyPx / ctm.d }));
    };
    const onDown = (evt: MouseEvent) => { if (evt.button === 2) { rmbHeld = true; rmbMoved = false; rmbX = evt.clientX; rmbY = evt.clientY; } };
    const onUp = (evt: MouseEvent) => {
      if (evt.button === 2) {
        if (rmbHeld && !rmbMoved) zoomAnchor = rawClientToSvg(evt.clientX, evt.clientY);
        rmbHeld = false;
        return;
      }
      setIsPanning(false); panLastRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mousedown', onDown); window.removeEventListener('mouseup', onUp); };
  }, [isPanning]);


  // Alt+drag to rotate the view — same window-level tracking as pan, just
  // turning horizontal drag distance into degrees instead of a translation.
  // Purely cosmetic (see clientToSvg above for how clicks stay accurate).
  useEffect(() => {
    if (!isRotating) return;
    const onMove = (evt: MouseEvent) => {
      const last = rotateLastRef.current;
      if (!last) return;
      const dx = evt.clientX - last.x;
      rotateLastRef.current = { x: evt.clientX, y: evt.clientY };
      setRotation((r) => (r + dx * 0.35 + 360) % 360);
    };
    const onUp = () => { setIsRotating(false); rotateLastRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isRotating]);


  // AbsoluteAxis as solver reference geometry: the Origin point and the
  // HDirection / VDirection lines through it, all fixed. Ids start with
  // "__" so they never collide with sketch entities.
  const REF_ORIGIN = '__origin', REF_HDIR = '__hdir', REF_VDIR = '__vdir';
  const absoluteAxisPayload = () => {
    const o = SKETCH_ORIGIN;
    return {
      points: [{ id: REF_ORIGIN, x: o.x, y: o.y }, { id: '__h', x: o.x + 50, y: o.y }, { id: '__v', x: o.x, y: o.y - 50 }],
      lines: [{ id: REF_HDIR, p1: REF_ORIGIN, p2: '__h' }, { id: REF_VDIR, p1: REF_ORIGIN, p2: '__v' }],
      constraints: [
        { type: 'fixed', args: { point: REF_ORIGIN, x: o.x, y: o.y } },
        { type: 'fixed', args: { point: '__h', x: o.x + 50, y: o.y } },
        { type: 'fixed', args: { point: '__v', x: o.x, y: o.y - 50 } },
      ],
    };
  };


  // Keeps a requested sketch-space rectangle fully visible at the canvas's
  // current aspect ratio (the viewBox is otherwise letterboxed by the SVG).
  const viewBoxAround = (minX: number, minY: number, maxX: number, maxY: number, margin = 0.08) => {
    const svg = svgRef.current;
    const aspect = svg && svg.clientHeight > 0 ? svg.clientWidth / svg.clientHeight : viewBox.w / viewBox.h;
    let w = Math.max(maxX - minX, 15), h = Math.max(maxY - minY, 15);
    w *= 1 + margin * 2; h *= 1 + margin * 2;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };













  // "The distance input field in the Inspector automatically focuses for
  // direct typing" — specifically the Sketch Inspector's own copy (see
  // curveDistInputRef below), not the bottom bar's, the moment an entity
  // gets picked (fresh pick or a double-click re-edit both set curveTargetId).
  useEffect(() => {
    if (curveTargetId) curveDistInputRef.current?.focus();
  }, [curveTargetId]);

  // Same auto-focus behavior as curveDistInputRef, for Line Normal to a
  // Curve's own Distance field.
  useEffect(() => {
    if (lineNormalTargetId) lineNormalDistInputRef.current?.focus();
  }, [lineNormalTargetId]);







  // Dragging a dimension just re-derives offset (and, for a circle/arc
  // leader, angle) straight from the live cursor position every move — so
  // "how far out is it" always exactly matches where you dragged it to,
  // with no separate delta-tracking to drift out of sync.
  useEffect(() => {
    if (!draggingDimId) return;
    const onMove = (evt: MouseEvent) => {
      const { x, y } = fx.current.clientToSvg(evt.clientX, evt.clientY);
      setDimensions((prev) => prev.map((d) => {
        if (d.id !== draggingDimId) return d;
        // A 'pair' dimension has no single entityId — its own from/to comes
        // fresh from computePairMeasure every time (same source the ephemeral
        // preview it was promoted from used), not a stored point.
        if (d.kind === 'pair') {
          const gA = fx.current.geomById(d.entityIdA!); const gB = fx.current.geomById(d.entityIdB!);
          if (!gA || !gB) return d;
          const m = fx.current.computePairMeasure(gA, gB, fx.current.entitiesAttached(gA, gB));
          if (!m) return d;
          // Angle pair: dragging just re-aims the pointer at the live
          // cursor (full 360° around the vertex, not a signed perpendicular
          // offset like the distance case below) — angleSectorGeometry
          // (used by the renderer) re-derives which of the 4 sectors that
          // pointer now falls in on every render, so this is all dragging
          // itself needs to do. The radius is dragged too, exactly like a
          // circle/arc leader's offset, so pulling the cursor further from
          // the vertex pushes the arc/label further out.
          if (m.angle) {
            const { vertex } = m.angle;
            const angle = Math.atan2(y - vertex.y, x - vertex.x);
            const offset = Math.max(8, Math.min(300, Math.hypot(x - vertex.x, y - vertex.y)));
            return { ...d, offset, angle };
          }
          const { from, to } = m;
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const midx = (from.x + to.x) / 2, midy = (from.y + to.y) / 2;
          const raw = (x - midx) * nx + (y - midy) * ny;
          const offset = (raw < 0 ? -1 : 1) * Math.max(6, Math.min(300, Math.abs(raw)));
          return { ...d, offset };
        }
        const g = fx.current.geomById(d.entityId!);
        if (!g) return d;
        if (d.kind === 'line' && g.kind === 'line') {
          const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const midx = (g.a.x + g.b.x) / 2, midy = (g.a.y + g.b.y) / 2;
          const raw = (x - midx) * nx + (y - midy) * ny;
          const offset = (raw < 0 ? -1 : 1) * Math.max(6, Math.min(300, Math.abs(raw)));
          return { ...d, offset };
        }
        if ((d.kind === 'circle' || d.kind === 'arc') && (g.kind === 'circle' || g.kind === 'arc')) {
          const angle = Math.atan2(y - g.cy, x - g.cx);
          const offset = Math.max(4, Math.min(300, Math.hypot(x - g.cx, y - g.cy) - g.r));
          return { ...d, offset, angle };
        }
        return d;
      }));
    };
    const onUp = () => setDraggingDimId(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingDimId]);


  // Dragging the label re-derives labelT (0 = the annotation's own start
  // end, 1 = its far end) from a projection of the live cursor onto the
  // dimension/leader line — clamped to [0, 1] so the label can be pushed
  // all the way to either end (or anywhere between) but never off the line
  // entirely.
  useEffect(() => {
    if (!draggingLabelId) return;
    const onMove = (evt: MouseEvent) => {
      const { x, y } = fx.current.clientToSvg(evt.clientX, evt.clientY);
      setDimensions((prev) => prev.map((d) => {
        if (d.id !== draggingLabelId) return d;
        if (d.kind === 'pair') {
          const gA = fx.current.geomById(d.entityIdA!); const gB = fx.current.geomById(d.entityIdB!);
          if (!gA || !gB) return d;
          const m = fx.current.computePairMeasure(gA, gB, fx.current.entitiesAttached(gA, gB));
          if (!m || m.angle) return d;
          const { from, to } = m;
          const off = d.offset;
          const nx = -(to.y - from.y), ny = to.x - from.x;
          const len = Math.hypot(nx, ny) || 1;
          const ux = nx / len, uy = ny / len;
          const ax = from.x + ux * off, ay = from.y + uy * off;
          const bx = to.x + ux * off, by = to.y + uy * off;
          const dx = bx - ax, dy = by - ay;
          const lenAB = dx * dx + dy * dy || 1;
          const t = ((x - ax) * dx + (y - ay) * dy) / lenAB;
          return { ...d, labelT: Math.max(0, Math.min(1, t)) };
        }
        const g = fx.current.geomById(d.entityId!);
        if (!g) return d;
        if (d.kind === 'line' && g.kind === 'line') {
          const nx = -(g.b.y - g.a.y), ny = g.b.x - g.a.x;
          const len = Math.hypot(nx, ny) || 1;
          const ux = nx / len, uy = ny / len;
          const off = d.offset;
          const ax = g.a.x + ux * off, ay = g.a.y + uy * off;
          const bx = g.b.x + ux * off, by = g.b.y + uy * off;
          const dx = bx - ax, dy = by - ay;
          const lenAB = dx * dx + dy * dy || 1;
          const t = ((x - ax) * dx + (y - ay) * dy) / lenAB;
          return { ...d, labelT: Math.max(0, Math.min(1, t)) };
        }
        if ((d.kind === 'circle' || d.kind === 'arc') && (g.kind === 'circle' || g.kind === 'arc')) {
          const angle = d.angle ?? -Math.PI / 4;
          const cos = Math.cos(angle), sin = Math.sin(angle);
          const ex = g.cx + g.r * cos, ey = g.cy + g.r * sin;
          const tx = g.cx + (g.r + d.offset) * cos, ty = g.cy + (g.r + d.offset) * sin;
          const dx = tx - ex, dy = ty - ey;
          const lenET = dx * dx + dy * dy || 1;
          const t = ((x - ex) * dx + (y - ey) * dy) / lenET;
          return { ...d, labelT: Math.max(0, Math.min(1, t)) };
        }
        return d;
      }));
    };
    const onUp = () => setDraggingLabelId(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingLabelId]);

  // Double-clicking a dimension's label commits editingDimId/dimEditValue
  // here — typing a new length/radius and hitting Enter (or blurring)
  // actually redimensions the real geometry, the exact same
  // pin-the-anchor-then-add-a-Distance-constraint approach as
  // commitLineLength/commitCircleRadius in the selection editor, just
  // driven from the annotation directly instead of needing it selected in
  // the sidebar first.
  // Removes just this one measurement — never the line/circle/arc it
  // measures. That's the whole point of keeping Dimension entirely
  // separate from the real geometry (see the Dimension type comment): this
  // only ever touches the dimensions array.
  const deleteDimension = (id: string) => {
    setDimensions((prev) => prev.filter((d) => d.id !== id));
    setSelectedDimId((cur) => (cur === id ? null : cur));
  };





















  const selectedSingleId = selected.length === 1 ? selected[0] : null;

  const ptCoord = (id: string) => pointById.get(id) ?? null;

  // Resamples a curve's rendered/measured polyline fresh from its live
  // defining points + numeric parameters — see the SketchCurve type
  // comment above for why nothing here is cached in state.
  // Sampled once per render per curve (hit-testing, traps, snapping and
  // drawing all ask for the same polyline many times in one render).
  const curveSampleCache = new Map<SketchCurve, { x: number; y: number }[]>();
  const curvePoints = (cv: SketchCurve): { x: number; y: number }[] => {
    const hit = curveSampleCache.get(cv);
    if (hit) return hit;
    const pts = sampleCurve(cv);
    curveSampleCache.set(cv, pts);
    return pts;
  };
  const sampleCurve = (cv: SketchCurve): { x: number; y: number }[] => {
    if (cv.kind === 'ellipse') {
      const c = ptCoord(cv.center);
      return c ? sampleEllipse(c.x, c.y, cv.rx, cv.ry, cv.rot, 56, cv.start, cv.end) : [];
    }
    if (cv.kind === 'parabola') {
      const f = ptCoord(cv.focus), v = ptCoord(cv.vertex);
      return f && v ? sampleParabola(f, v, cv.span) : [];
    }
    if (cv.kind === 'hyperbola') {
      const c = ptCoord(cv.center), f = ptCoord(cv.focus), v = ptCoord(cv.vertex);
      return c && f && v ? sampleHyperbola(c, f, v) : [];
    }
    if (cv.kind === 'spline') {
      const pts = cv.controlIds.map(ptCoord).filter((p): p is Pt => !!p);
      return pts.length >= 2 ? catmullRom(pts, 12) : [];
    }
    if (cv.kind === 'spline-cv') {
      const pts = cv.controlIds.map(ptCoord).filter((p): p is Pt => !!p);
      return pts.length >= 2 ? sampleCvSpline(pts, 16) : [];
    }
    if (cv.kind === 'conic-rp') {
      const p0 = ptCoord(cv.p0), pa = ptCoord(cv.papex), p2 = ptCoord(cv.p2);
      return p0 && pa && p2 ? sampleConicRho(p0, pa, p2, cv.rho, 40) : [];
    }
    const pts = cv.ptIds.map(ptCoord).filter((p): p is Pt => !!p);
    return pts.length === 5 ? sampleConicFrom5Points(pts) : [];
  };

  // The Pt ids a curve is actually built from — used by delete-cascade
  // (below) so removing a defining point takes the curve with it, same as
  // a Circle/Arc losing its center.
  const curveDefiningIds = (cv: SketchCurve): string[] => {
    if (cv.kind === 'ellipse') return [cv.center];
    if (cv.kind === 'parabola') return [cv.focus, cv.vertex];
    if (cv.kind === 'hyperbola') return [cv.center, cv.focus, cv.vertex];
    if (cv.kind === 'spline') return cv.controlIds;
    if (cv.kind === 'spline-cv') return cv.controlIds;
    if (cv.kind === 'conic-rp') return [cv.p0, cv.papex, cv.p2];
    return cv.ptIds;
  };


  const allEntityGeoms = (): EntityGeom[] => {
    const out: EntityGeom[] = [];
    for (const p of points) out.push({ kind: 'point', id: p.id, x: p.x, y: p.y });
    for (const l of lines) {
      const a = pointById.get(l.p1); const b = pointById.get(l.p2);
      if (a && b) out.push({ kind: 'line', id: l.id, a, b });
    }
    for (const c of circles) {
      const ctr = pointById.get(c.center);
      if (ctr) out.push({ kind: 'circle', id: c.id, cx: ctr.x, cy: ctr.y, r: c.r });
    }
    for (const arc of arcs) {
      const ctr = pointById.get(arc.center);
      if (ctr) out.push({ kind: 'arc', id: arc.id, cx: ctr.x, cy: ctr.y, r: arc.r });
    }
    for (const cv of curves) out.push({ kind: 'curve', id: cv.id, pts: curvePoints(cv) });
    // The sketch's AbsoluteAxis — Origin, HDirection, VDirection — as
    // selectable reference geometry for constraints and measurements.
    const o: Pt = { id: REF_ORIGIN, x: SKETCH_ORIGIN.x, y: SKETCH_ORIGIN.y };
    out.push({ kind: 'point', id: REF_ORIGIN, x: o.x, y: o.y });
    out.push({ kind: 'line', id: REF_HDIR, a: o, b: { id: '__h', x: o.x + ORIGIN_ARM, y: o.y } });
    out.push({ kind: 'line', id: REF_VDIR, a: o, b: { id: '__v', x: o.x, y: o.y - ORIGIN_ARM } });
    return out;
  };

  const geomById = (id: string): EntityGeom | null => allEntityGeoms().find((g) => g.id === id) ?? null;








  // Resolves any entity id (point/line/circle/arc/curve) down to the shared
  // Pt id(s) it's actually built from — every entity kind ultimately
  // references real points (a line's p1/p2, a circle/arc's center, a
  // curve's own defining ids via curveDefiningIds), so this is the one
  // place drag-to-move needs to know how to translate any selected thing.
  const pointIdsForEntity = (id: string): string[] => {
    if (points.some((p) => p.id === id)) return [id];
    const line = lines.find((l) => l.id === id);
    if (line) return [line.p1, line.p2];
    const circle = circles.find((c) => c.id === id);
    if (circle) return [circle.center];
    const arc = arcs.find((a) => a.id === id);
    if (arc) return [arc.center];
    const curve = curves.find((cv) => cv.id === id);
    if (curve) return curveDefiningIds(curve);
    return [];
  };




  // CATIA-style automatic selection-driven measurement (Task: contextual
  // dynamic measurement) — separate from the explicit Measure Item/Measure
  // Between tools above (those stay exactly as they were): this instead
  // watches `selected` directly while the Select tool is active and
  // derives a live, non-destructive preview purely from geometry, with no
  // tool switch required. See selectionPreview further below for where
  // it's assembled each render, and renderSinglePreview/renderPairPreview
  // (down by renderDimension) for how it's drawn.
  //
  // Whether two selected entities share a vertex (same underlying Pt id —
  // see pointIdsForEntity above) or geometrically touch — the two cases
  // the spec calls "Attached" (angle/contact) vs "Disjoint" (distance/
  // offset).
  const entitiesAttached = (gA: EntityGeom, gB: EntityGeom): boolean => {
    const idsA = pointIdsForEntity(gA.id);
    const idsB = pointIdsForEntity(gB.id);
    if (idsA.some((id) => idsB.includes(id))) return true;
    if (gA.kind === 'line' && gB.kind === 'line') return segmentsIntersect(gA.a, gA.b, gB.a, gB.b);
    if (gA.kind === 'line' && (gB.kind === 'circle' || gB.kind === 'arc')) return pointToSegmentDistance(gB.cx, gB.cy, gA.a, gA.b) <= gB.r + HIT_TOL;
    if (gB.kind === 'line' && (gA.kind === 'circle' || gA.kind === 'arc')) return pointToSegmentDistance(gA.cx, gA.cy, gB.a, gB.b) <= gA.r + HIT_TOL;
    if ((gA.kind === 'circle' || gA.kind === 'arc') && (gB.kind === 'circle' || gB.kind === 'arc')) {
      return Math.hypot(gB.cx - gA.cx, gB.cy - gA.cy) <= gA.r + gB.r + HIT_TOL;
    }
    return false;
  };


  // Two infinite lines' intersection point, or null if parallel — used
  // only to find the angle vertex when two lines cross without sharing an
  // actual endpoint (see angleVertexAndDirs below).
  const lineLineIntersection = (a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }): { x: number; y: number } | null => {
    const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
    const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
    return { x: a1.x + t * d1x, y: a1.y + t * d1y };
  };

  // The angle arc's vertex and the two ray directions (radians) to sweep
  // between — the shared endpoint when the lines meet at one, otherwise
  // the two infinite lines' crossing point, with each ray aimed at
  // whichever endpoint isn't the vertex.
  const angleVertexAndDirs = (lA: { id: string; a: Pt; b: Pt }, lB: { id: string; a: Pt; b: Pt }): { vertex: { x: number; y: number }; dirA: number; dirB: number } | null => {
    const sharedId = [lA.a.id, lA.b.id].find((id) => id === lB.a.id || id === lB.b.id);
    if (sharedId) {
      const vertex = lA.a.id === sharedId ? lA.a : lA.b;
      const farA = lA.a.id === sharedId ? lA.b : lA.a;
      const farB = lB.a.id === sharedId ? lB.b : lB.a;
      return { vertex, dirA: Math.atan2(farA.y - vertex.y, farA.x - vertex.x), dirB: Math.atan2(farB.y - vertex.y, farB.x - vertex.x) };
    }
    const inter = lineLineIntersection(lA.a, lA.b, lB.a, lB.b);
    if (!inter) return null;
    return { vertex: inter, dirA: Math.atan2(lA.b.y - inter.y, lA.b.x - inter.x), dirB: Math.atan2(lB.b.y - inter.y, lB.b.x - inter.x) };
  };




  const computePairMeasure = (gA: EntityGeom, gB: EntityGeom, attached: boolean): PairMeasure | null => {
    // Point ↔ Point — always a clean, exact Distance constraint (both ends
    // are already real points), regardless of attached/disjoint. `commit`
    // stays live even once `already` is true: commitPointDistance upserts
    // rather than duplicating, so a promoted, already-persisted Dimension
    // can still be double-clicked and re-typed — nulling it out here would
    // mean every measurement becomes read-only forever the instant it's
    // first committed, which is what made "the value change option" look
    // broken. `already`/`committed` is kept purely as a (currently
    // unconsumed) informational flag, never to gate editability.
    if (gA.kind === 'point' && gB.kind === 'point') {
      const dist = Math.hypot(gB.x - gA.x, gB.y - gA.y);
      const already = constraints.some((c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, gA.id, gB.id));
      return {
        label: toU(dist).toFixed(2), from: gA, to: gB,
        commit: (v?: number) => commitPointDistance(gA.id, gB.id, v ?? dist),
        committed: already,
      };
    }
    // Line ↔ Line, sharing a vertex or crossing — Angle, the other exact fit.
    if (attached && gA.kind === 'line' && gB.kind === 'line') {
      const angle = angleBetweenLines(gA.id, gB.id);
      const vertexInfo = angleVertexAndDirs(gA, gB);
      const mid = vertexInfo?.vertex ?? { x: (gA.a.x + gA.b.x + gB.a.x + gB.b.x) / 4, y: (gA.a.y + gA.b.y + gB.a.y + gB.b.y) / 4 };
      const already = constraints.some((c) => c.type === 'angle' && samePair(c.args.line1, c.args.line2, gA.id, gB.id));
      return {
        label: angle.toFixed(1), from: mid, to: mid,
        angle: vertexInfo ?? undefined,
        value: angle,
        commit: (v?: number) => commitPairAngle(gA.id, gB.id, v ?? angle),
        committed: already,
      };
    }
    // Line ↔ Line, disjoint — parallel lines show the true perpendicular
    // offset, committable as a Point↔Line distance (line B's own endpoint
    // against line A — any point on B reads the same offset, since they're
    // parallel); non-parallel ones show the angle plus the shortest gap,
    // and that gap only commits when it lands exactly on two existing
    // endpoints rather than a point partway along one of the segments.
    if (!attached && gA.kind === 'line' && gB.kind === 'line') {
      const d1x = gA.b.x - gA.a.x, d1y = gA.b.y - gA.a.y;
      const d2x = gB.b.x - gB.a.x, d2y = gB.b.y - gB.a.y;
      const len1 = Math.hypot(d1x, d1y) || 1, len2 = Math.hypot(d2x, d2y) || 1;
      const cross = (d1x / len1) * (d2y / len2) - (d1y / len1) * (d2x / len2);
      if (Math.abs(cross) < 0.02) {
        const offset = Math.abs((gB.a.x - gA.a.x) * d1y - (gB.a.y - gA.a.y) * d1x) / len1;
        const tOn = segParam(gA.a, gA.b, gB.a);
        const foot = { x: gA.a.x + tOn * d1x, y: gA.a.y + tOn * d1y };
        return {
          label: toU(offset).toFixed(2), from: foot, to: gB.a,
          commit: (v?: number) => commitPointLineDistance(gB.a.id, gA.id, v ?? offset),
        };
      }
      const candidates: [Pt, Pt][] = [[gA.a, gB.a], [gA.a, gB.b], [gA.b, gB.a], [gA.b, gB.b]];
      let best = candidates[0]; let bestD = Math.hypot(best[0].x - best[1].x, best[0].y - best[1].y);
      for (const c of candidates.slice(1)) {
        const d = Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y);
        if (d < bestD) { bestD = d; best = c; }
      }
      const trueMin = Math.min(
        pointToSegmentDistance(gA.a.x, gA.a.y, gB.a, gB.b), pointToSegmentDistance(gA.b.x, gA.b.y, gB.a, gB.b),
        pointToSegmentDistance(gB.a.x, gB.a.y, gA.a, gA.b), pointToSegmentDistance(gB.b.x, gB.b.y, gA.a, gA.b),
      );
      const angle = angleBetweenLines(gA.id, gB.id);
      const exact = Math.abs(trueMin - bestD) < 1e-6;
      const already = exact && constraints.some((c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, best[0].id, best[1].id));
      return {
        label: `${angle.toFixed(1)} · ${toU(trueMin).toFixed(2)}`,
        from: best[0], to: best[1],
        commit: exact ? (v?: number) => commitPointDistance(best[0].id, best[1].id, v ?? bestD) : null,
        committed: already,
      };
    }
    // Circle/Arc ↔ Circle/Arc — center-to-center distance, always a real
    // point-to-point Distance since both centers are real points.
    if ((gA.kind === 'circle' || gA.kind === 'arc') && (gB.kind === 'circle' || gB.kind === 'arc')) {
      const dist = Math.hypot(gB.cx - gA.cx, gB.cy - gA.cy);
      const centerA = ptCoord(circles.find((c) => c.id === gA.id)?.center ?? arcs.find((a) => a.id === gA.id)?.center ?? '');
      const centerB = ptCoord(circles.find((c) => c.id === gB.id)?.center ?? arcs.find((a) => a.id === gB.id)?.center ?? '');
      const already = !!(centerA && centerB && constraints.some((c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, centerA.id, centerB.id)));
      return {
        label: toU(dist).toFixed(2),
        from: { x: gA.cx, y: gA.cy }, to: { x: gB.cx, y: gB.cy },
        commit: centerA && centerB ? (v?: number) => commitPointDistance(centerA.id, centerB.id, v ?? dist) : null,
        committed: already,
      };
    }
    // Line ↔ Circle/Arc — perpendicular clearance from the line to the
    // rim; accurate whether attached (tangent/crossing, clearance ≈ 0) or
    // disjoint. Committable as a Point↔Line distance targeting the
    // circle's own center point, with the typed clearance shifted out by
    // the radius on the way in (constrain_point_line_distance only knows
    // about the center point, not the rim) — this is the exact measurement
    // the reference video drags around, so it's the main case this
    // constraint type exists for.
    if ((gA.kind === 'line' && (gB.kind === 'circle' || gB.kind === 'arc')) || (gB.kind === 'line' && (gA.kind === 'circle' || gA.kind === 'arc'))) {
      const line = gA.kind === 'line' ? gA : gB;
      const circ = gA.kind === 'line' ? gB : gA;
      if (line.kind === 'line' && (circ.kind === 'circle' || circ.kind === 'arc')) {
        const t = segParam(line.a, line.b, { x: circ.cx, y: circ.cy });
        const foot = { x: line.a.x + t * (line.b.x - line.a.x), y: line.a.y + t * (line.b.y - line.a.y) };
        const centerDist = Math.hypot(circ.cx - foot.x, circ.cy - foot.y);
        const clearance = Math.max(0, centerDist - circ.r);
        // The leader reads to the RIM — the true tangent point when the
        // line touches/crosses the circle, or the nearest point on the rim
        // toward the line when it doesn't — never the center. The label is
        // a tangent/clearance distance, not a center distance, and nobody
        // selected the center to ask for one.
        const rim = centerDist > 1e-6
          ? { x: circ.cx + ((foot.x - circ.cx) / centerDist) * circ.r, y: circ.cy + ((foot.y - circ.cy) / centerDist) * circ.r }
          : { x: circ.cx + circ.r, y: circ.cy };
        const centerId = circles.find((c) => c.id === circ.id)?.center ?? arcs.find((a) => a.id === circ.id)?.center;
        return {
          label: attached ? 'tangent/crossing' : toU(clearance).toFixed(2),
          from: foot, to: rim, value: clearance,
          commit: centerId ? (v?: number) => commitPointLineDistance(centerId, line.id, (v ?? clearance) + circ.r) : null,
        };
      }
    }
    // Point ↔ Line / Point ↔ Circle/Arc — Point↔Line commits as a real
    // point_line_distance; Point↔Circle/Arc reduces to the existing
    // point-to-point Distance between the point and the circle's own
    // center, offset by the radius, since that's already an exact fit.
    if (gA.kind === 'point' || gB.kind === 'point') {
      const pt = gA.kind === 'point' ? gA : gB;
      const other = gA.kind === 'point' ? gB : gA;
      if (pt.kind !== 'point') return null;
      if (other.kind === 'line') {
        const t = segParam(other.a, other.b, pt);
        const foot = { x: other.a.x + t * (other.b.x - other.a.x), y: other.a.y + t * (other.b.y - other.a.y) };
        const dist = Math.hypot(pt.x - foot.x, pt.y - foot.y);
        return {
          label: toU(dist).toFixed(2), from: pt, to: foot,
          commit: (v?: number) => commitPointLineDistance(pt.id, other.id, v ?? dist),
        };
      }
      if (other.kind === 'circle' || other.kind === 'arc') {
        const dist = Math.max(0, Math.hypot(pt.x - other.cx, pt.y - other.cy) - other.r);
        const centerId = circles.find((c) => c.id === other.id)?.center ?? arcs.find((a) => a.id === other.id)?.center;
        return {
          label: toU(dist).toFixed(2), from: pt, to: { x: other.cx, y: other.cy },
          commit: centerId ? (v?: number) => commitPointDistance(pt.id, centerId, (v ?? dist) + other.r) : null,
        };
      }
    }
    return null;
  };

  // Point-to-point Distance — the exact-fit commit path shared by every
  // pair case above that resolves to two real points (Point↔Point,
  // Circle/Arc center↔center, and a Line↔Line gap realized at two
  // endpoints). Same pin-the-anchor-then-upsert-Distance approach
  // commitPendingConstraint's own distance branch uses.
  // --- Parametric line–line chamfers (built by applyChamfer) -------------
  // A chamfer is found from its tagged constraints: its corner stays on
  // both parent lines (roles on1/on2), cut 1 sits distance A from the
  // corner along parent 1 (d1), and cut 2 either distance B along parent 2
  // (d2, two-lengths chamfer) or wherever the chamfer's angle constraint
  // to parent 1 puts it (length + angle). Every edit of a chamfer goes
  // through applyChamferValues, which changes only those values — the
  // parents keep their directions and every other dimension of the sketch.
  const chamferInfo = (lineId: string, list: Constraint[] = constraints) => {
    const tagged = list.filter((c) => c.args.chamfer === lineId);
    const on1 = tagged.find((c) => c.args.role === 'on1'), on2 = tagged.find((c) => c.args.role === 'on2');
    const d1 = tagged.find((c) => c.args.role === 'd1'), d2 = tagged.find((c) => c.args.role === 'd2');
    const chamferLine = lines.find((l) => l.id === lineId);
    if (!on1 || !on2 || !d1 || !chamferLine) return null;
    const cut1 = d1.args.p2 as string;
    const cut2 = chamferLine.p1 === cut1 ? chamferLine.p2 : chamferLine.p1;
    const line1 = on1.args.line as string, line2 = on2.args.line as string;
    const angle = list.find((c) => c.type === 'angle' && c.args.line1 === line1 && c.args.line2 === lineId);
    return { id: lineId, corner: on1.args.point as string, cut1, cut2, line1, line2, d1, d2, angle };
  };
  type ChamferInfo = NonNullable<ReturnType<typeof chamferInfo>>;
  const chamferOfPoints = (a: string, b: string) => {
    const l = lines.find((ln) => samePair(ln.p1, ln.p2, a, b));
    return l ? chamferInfo(l.id) : null;
  };
  // The chamfer's current shape, measured: A, B, its length (hypotenuse),
  // the interior angle at cut 1 (between the chamfer and parent 1, the one
  // shown on the canvas), and the corner angle between the parents.
  const chamferMeasure = (info: ChamferInfo) => {
    const X = pointById.get(info.corner), c1 = pointById.get(info.cut1), c2 = pointById.get(info.cut2);
    if (!X || !c1 || !c2) return null;
    const ang = (o: Pt, a: Pt, b: Pt) => {
      const ux = a.x - o.x, uy = a.y - o.y, vx = b.x - o.x, vy = b.y - o.y;
      return (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1)))) * 180) / Math.PI;
    };
    return {
      a: Math.hypot(c1.x - X.x, c1.y - X.y), b: Math.hypot(c2.x - X.x, c2.y - X.y),
      length: Math.hypot(c2.x - c1.x, c2.y - c1.y), angle: ang(c1, X, c2), corner: ang(X, c1, c2),
    };
  };
  // Sets any of A / B / angle (the others stay what they are) and re-solves.
  // Returns an error message instead when the request can't form a chamfer.
  const applyChamferValues = (lineId: string, patch: { a?: number; b?: number; angle?: number }): string | null => {
    const info = chamferInfo(lineId);
    const m = info && chamferMeasure(info);
    if (!info || !m) return 'Not a chamfer.';
    let { a } = patch;
    let b = patch.b;
    let angleValue: number | undefined;
    if (patch.angle !== undefined) {
      const alpha = patch.angle;
      if (!(alpha > 0 && alpha + m.corner < 180)) return `Chamfer angle must be between 0° and ${(180 - m.corner).toFixed(1)}° at this corner.`;
      if (info.angle) {
        // The stored angle constraint is directional (parent 1's p1→p2
        // to the chamfer); keep whichever of α / 180−α family it's in.
        const v0 = Number(info.angle.args.value);
        angleValue = Math.abs(v0 - m.angle) <= Math.abs(v0 - (180 - m.angle)) ? alpha : 180 - alpha;
      } else {
        // Two lengths: keep A, move B to where that angle lands (law of sines).
        const aa = a ?? m.a;
        b = (aa * Math.sin((alpha * Math.PI) / 180)) / Math.sin(((180 - alpha - m.corner) * Math.PI) / 180);
      }
    }
    if ((a !== undefined && !(a > 0)) || (b !== undefined && !(b > 0))) return 'Chamfer distances must be positive.';
    if (b !== undefined && !info.d2) {
      // Length + angle chamfer: B isn't a parameter; reach it by adjusting A.
      const alpha = patch.angle ?? m.angle;
      a = (b * Math.sin(((180 - alpha - m.corner) * Math.PI) / 180)) / Math.sin((alpha * Math.PI) / 180);
      b = undefined;
    }
    // A cut can't be asked to sit past where its own parent line actually
    // ends (that end may itself be a plain corner, or another chamfer's own
    // cut, or the corner point of a fillet, ...) — same "impossible to trim
    // a lengthened element" case CATIA's chamfer dialog stops you from
    // creating in the first place (see chamferCuts' own cutOn/reach check
    // for the mirror-image guard on a brand-new chamfer). Without this, a
    // distance typed here larger than the parent's remaining length would
    // still get written into its d1/d2 constraint and handed to the solver,
    // which has no reason to refuse it — it would just push the cut past
    // the parent's far end, folding the "trimmed" edge back over itself.
    const corner = pointById.get(info.corner);
    const reachOf = (parentLineId: string, cutId: string): number => {
      const parent = lines.find((ln) => ln.id === parentLineId);
      const far = parent && pointById.get(parent.p1 === cutId ? parent.p2 : parent.p1);
      return corner && far ? Math.hypot(far.x - corner.x, far.y - corner.y) : Infinity;
    };
    if (a !== undefined) {
      const reach1 = reachOf(info.line1, info.cut1);
      if (a >= reach1 - 1e-6) return `Distance A ${a.toFixed(2)}mm is longer than ${info.line1} reaches from the corner (${reach1.toFixed(2)}mm).`;
    }
    if (b !== undefined) {
      const reach2 = reachOf(info.line2, info.cut2);
      if (b >= reach2 - 1e-6) return `Distance B ${b.toFixed(2)}mm is longer than ${info.line2} reaches from the corner (${reach2.toFixed(2)}mm).`;
    }
    const setVal = (c: Constraint, value: number, label: string) => ({ ...c, args: { ...c.args, value }, label });
    const next = constraints.map((c) => {
      if (c.id === info.d1.id && a !== undefined) return setVal(c, a, `Chamfer distance A = ${a.toFixed(2)}mm`);
      if (info.d2 && c.id === info.d2.id && b !== undefined) return setVal(c, b, `Chamfer distance B = ${b.toFixed(2)}mm`);
      if (info.angle && c.id === info.angle.id && angleValue !== undefined) return setVal(c, angleValue, `Chamfer angle: ${info.line1}, ${info.id} = ${patch.angle!.toFixed(1)}°`);
      return c;
    });
    setConstraints(next);
    void solve(points, lines, circles, next);
    return null;
  };
  // A new chamfer length (hypotenuse): the chamfer triangle scales about
  // its corner — A (and B) by the same ratio — so its angle is unchanged.
  const scaleChamfer = (lineId: string, length: number) => {
    const info = chamferInfo(lineId);
    const m = info && chamferMeasure(info);
    if (!info || !m || !(length > 0) || m.length < 1e-9) return;
    const r = length / m.length;
    const err = applyChamferValues(lineId, { a: m.a * r, ...(info.d2 ? { b: m.b * r } : {}) });
    if (err) setError(err);
  };

  const commitPointDistance = (p1In: string, p2In: string, value: number) => {
    // A chamfer's own length only rescales that chamfer.
    const ch = chamferOfPoints(p1In, p2In);
    if (ch) { scaleChamfer(ch.id, value); return; }
    // A fixed reference (the Origin) is always the end that stays put.
    const [p1, p2] = p2In.startsWith('__') ? [p2In, p1In] : [p1In, p2In];
    const anchorPt = pointById.get(p1);
    let next = unpinPoint(constraints, p2);
    if (anchorPt) next = pinPoint(next, p1, anchorPt);
    next = upsertInList(next, (c) => c.type === 'distance' && samePair(c.args.p1, c.args.p2, p1, p2), 'distance', { p1, p2, value }, `Distance: ${p1}–${p2} = ${value.toFixed(2)}mm`);
    setConstraints(next);
    void solve(points, lines, circles, next);
  };

  // Line-to-line relative Angle constraint (distinct from commitLineAngle
  // further below, which rotates a single selected line to an absolute
  // heading typed into the Selection panel) — mirrors
  // commitPendingConstraint's own angle branch: pin both endpoints of the
  // first line as the anchor, leaving the second free to hold the
  // measured angle.
  const commitPairAngle = (line1In: string, line2In: string, value: number) => {
    const [line1, line2] = line2In.startsWith('__') ? [line2In, line1In] : [line1In, line2In];
    // The angle between a chamfer and its first parent is the chamfer's own
    // parameter: change just that, never pin or move the parents.
    const ch = chamferInfo(line2) ?? chamferInfo(line1);
    if (ch && [line1, line2].includes(ch.line1) && [line1, line2].includes(ch.id)) {
      const m = chamferMeasure(ch);
      if (m) {
        // `value` arrives in the line1→line2 base-angle family; the chamfer's
        // interior angle is either it or its supplement, whichever it is now.
        const base = angleBetweenLines(line1, line2);
        const alpha = Math.abs(base - m.angle) <= Math.abs(base - (180 - m.angle)) ? value : 180 - value;
        const err = applyChamferValues(ch.id, { angle: alpha });
        if (err) setError(err);
      }
      return;
    }
    const anchorLine = lines.find((l) => l.id === line1);
    const otherLine = lines.find((l) => l.id === line2);
    let next = constraints;
    if (otherLine) {
      const anchorPointIds = new Set(anchorLine ? [anchorLine.p1, anchorLine.p2] : []);
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
    next = upsertInList(next, (c) => c.type === 'angle' && samePair(c.args.line1, c.args.line2, line1, line2), 'angle', { line1, line2, value }, `Angle: ${line1}, ${line2} = ${value.toFixed(1)}°`);
    setConstraints(next);
    void solve(points, lines, circles, next);
  };

  // Point-to-Line perpendicular Distance — the exact-fit commit path for a
  // Line↔Circle/Arc clearance (computePairMeasure targets the circle's own
  // center point, offsetting the typed clearance by the radius on the way
  // in) and for a bare Point↔Line pair (targeted directly). Mirrors
  // commitPairAngle's anchor pattern: pin the line's own two endpoints so
  // it stays put, and free the point to be the one that moves to satisfy
  // the new distance. Backed by sketch_solver.py's constrain_point_line_
  // distance, added alongside this for exactly this case — there was no
  // point-to-line constraint before, which is why this measurement used to
  // be permanently read-only.
  const commitPointLineDistance = (pointId: string, lineId: string, value: number) => {
    const line = lines.find((l) => l.id === lineId);
    let next = unpinPoint(constraints, pointId);
    if (line) {
      const pa = pointById.get(line.p1);
      const pb = pointById.get(line.p2);
      if (pa) next = pinPoint(next, pa.id, pa);
      if (pb) next = pinPoint(next, pb.id, pb);
    }
    next = upsertInList(next, (c) => c.type === 'point_line_distance' && c.args.point === pointId && c.args.line === lineId, 'point_line_distance', { point: pointId, line: lineId, value }, `Distance: ${pointId}–${lineId} = ${value.toFixed(2)}mm`);
    setConstraints(next);
    void solve(points, lines, circles, next);
  };

  const [previewOverrides, setPreviewOverrides] = useState<Record<string, PreviewOverride>>({});
  const [previewEditValue, setPreviewEditValue] = useState('');

  const previewDragTargetRef = useRef<PreviewDragTarget | null>(null);
  const previewDragMovedRef = useRef(false);
  // The offset/labelT/angle the drag has landed on *right now* — updated in
  // the SAME tick as every onMove below, alongside (not instead of) the
  // previewOverrides state that actually drives the live rendering. This
  // ref exists only so finalizePreviewDrag (called from onUp, a closure
  // that was created once back when the drag started and never refreshed —
  // its effect's dependency is `isDraggingPreview`, which doesn't change
  // mid-drag) can read the CURRENT value instead of the stale
  // `previewOverrides` it closed over at drag-start (which is always the
  // pre-drag value, since a functional setState updater never leaks its
  // "latest prev" back out to a plain variable read). Reading a ref instead
  // sidesteps that stale-closure trap entirely.
  const latestPreviewOverrideRef = useRef<PreviewOverride | null>(null);

  // Promotes a dragged-and-released preview into a real, persisted
  // annotation — a single line/circle/arc becomes an ordinary Dimension
  // (upsertDimension's own shape, just seeded with the offset/labelT the
  // drag already landed on instead of the default heuristic), and a pair
  // becomes a new `kind: 'pair'` Dimension (see renderPairDimension near
  // computePairMeasure) — carrying over exactly where the drag left it, so
  // there's no jump. A plain click with no movement in between (moved
  // stays false) never promotes anything: that's still single-click-to-
  // commit for a single entity (commitSinglePreview) and a no-op for a
  // pair, exactly as before this "drag to extend" behavior existed. This
  // is what makes the auto-preview "stick" after you drag it, the same way
  // a Measure Item dimension already does the moment you touch it.
  const finalizePreviewDrag = () => {
    const target = previewDragTargetRef.current;
    const moved = previewDragMovedRef.current;
    const override = latestPreviewOverrideRef.current;
    previewDragTargetRef.current = null;
    previewDragMovedRef.current = false;
    latestPreviewOverrideRef.current = null;
    if (!target || !moved || !override) return;
    if (target.mode === 'single') {
      const g = target.g;
      const key = `single:${g.id}`;
      setDimensions((prev) => {
        if (prev.some((d) => d.entityId === g.id)) return prev;
        const id = `dim_${g.id}_${Date.now()}`;
        if (g.kind === 'line') return [...prev, { id, kind: 'line', entityId: g.id, offset: override.offset, labelT: override.labelT }];
        if (g.kind === 'circle' || g.kind === 'arc') return [...prev, { id, kind: g.kind, entityId: g.id, offset: override.offset, angle: override.angle, labelT: override.labelT }];
        return prev;
      });
      setPreviewOverrides((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } else {
      const { gA, gB } = target;
      const key = `pair:${[gA.id, gB.id].sort().join('|')}`;
      setDimensions((prev) => {
        const already = prev.some((d) => d.kind === 'pair' && ((d.entityIdA === gA.id && d.entityIdB === gB.id) || (d.entityIdA === gB.id && d.entityIdB === gA.id)));
        if (already) return prev;
        const id = `dim_pair_${gA.id}_${gB.id}_${Date.now()}`;
        return [...prev, { id, kind: 'pair', entityIdA: gA.id, entityIdB: gB.id, offset: override.offset, labelT: override.labelT }];
      });
      setPreviewOverrides((prev) => { const next = { ...prev }; delete next[key]; return next; });
    }
  };

  // Promotes an angle pair straight from its commit — there's no drag
  // gesture to piggyback on the way the distance case does (see
  // finalizePreviewDrag above): an angle arc's radius is fixed and purely
  // cosmetic, nothing to drag/extend, so without this the ephemeral angle
  // preview would commit the constraint but vanish the instant you
  // deselect the two lines, exactly like a Measure Item dimension never
  // does once you've touched it. Wired into renderPairPreview's angle
  // branch so both a plain click AND a double-click-edit promote (see
  // commitAndPromote there) — idempotent the same way finalizePreviewDrag
  // is, so re-committing an already-promoted angle just updates its value
  // instead of adding a duplicate.
  const promotePairDimension = (gA: EntityGeom, gB: EntityGeom) => {
    setDimensions((prev) => {
      const already = prev.some((d) => d.kind === 'pair' && ((d.entityIdA === gA.id && d.entityIdB === gB.id) || (d.entityIdA === gB.id && d.entityIdB === gA.id)));
      if (already) return prev;
      const id = `dim_pair_${gA.id}_${gB.id}_${Date.now()}`;
      // 16 is just a sane starting radius for an angle arc (matches the old
      // fixed-R it used to always draw at) — for a distance pair this offset
      // gets immediately overwritten by finalizePreviewDrag's own drag-end
      // value, so 16 here only ever matters for the angle case.
      return [...prev, { id, kind: 'pair', entityIdA: gA.id, entityIdB: gB.id, offset: 16 }];
    });
  };

  // Belt-and-suspenders wasn't enough — relying on a click/edit to promote
  // an angle (see promotePairDimension's own comment) turned out too easy
  // to miss in practice: select two lines, glance at the angle, select
  // something else, and the arc/label were gone before anyone touched the
  // label. So an attached line-line pair now promotes itself the instant
  // its preview would show, no click required — the same "real the
  // moment it's shown" behavior the CATIA reference video demonstrated
  // for a Circle/Line pick. This is angle-only: the distance case already
  // has a working, explicit persistence gesture (drag — see
  // finalizePreviewDrag), so it isn't touched here.
  useEffect(() => {
    if (tool !== 'select' || selected.length !== 2) return;
    const gA = fx.current.geomById(selected[0]);
    const gB = fx.current.geomById(selected[1]);
    if (!gA || !gB) return;
    const m = fx.current.computePairMeasure(gA, gB, fx.current.entitiesAttached(gA, gB));
    if (m?.angle) fx.current.promotePairDimension(gA, gB);
  }, [selected, tool]);

  // Linear-style drag (single line preview, and every pair-distance
  // preview — they all render via renderDistancePreview): re-derives the
  // perpendicular offset straight from the cursor, exactly like
  // startDimDrag's line branch, and promotes to a real annotation on
  // release (finalizePreviewDrag) once the cursor has actually moved.
  const draggingPreviewRef = useRef<{ key: string; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  useEffect(() => {
    if (!isDraggingPreview) return;
    const onMove = (evt: MouseEvent) => {
      const drag = draggingPreviewRef.current;
      if (!drag) return;
      previewDragMovedRef.current = true;
      const { x, y } = fx.current.clientToSvg(evt.clientX, evt.clientY);
      const { from, to } = drag;
      const dx = to.x - from.x, dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const midx = (from.x + to.x) / 2, midy = (from.y + to.y) / 2;
      const raw = (x - midx) * nx + (y - midy) * ny;
      const offset = (raw < 0 ? -1 : 1) * Math.max(6, Math.min(300, Math.abs(raw)));
      latestPreviewOverrideRef.current = { ...latestPreviewOverrideRef.current, offset };
      setPreviewOverrides((prev) => ({ ...prev, [drag.key]: { ...prev[drag.key], offset } }));
    };
    const onUp = () => { setIsDraggingPreview(false); draggingPreviewRef.current = null; finalizePreviewDrag(); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingPreview]);

  // Radial-style drag (single circle/arc preview only): re-derives offset
  // + leader angle from the cursor, exactly like startDimDrag's circle/arc
  // branch, and promotes on release the same way.
  const draggingPreviewCircleRef = useRef<{ key: string; cx: number; cy: number; r: number } | null>(null);
  const [isDraggingPreviewCircle, setIsDraggingPreviewCircle] = useState(false);
  useEffect(() => {
    if (!isDraggingPreviewCircle) return;
    const onMove = (evt: MouseEvent) => {
      const drag = draggingPreviewCircleRef.current;
      if (!drag) return;
      previewDragMovedRef.current = true;
      const { x, y } = fx.current.clientToSvg(evt.clientX, evt.clientY);
      const angle = Math.atan2(y - drag.cy, x - drag.cx);
      const offset = Math.max(4, Math.min(300, Math.hypot(x - drag.cx, y - drag.cy) - drag.r));
      latestPreviewOverrideRef.current = { ...latestPreviewOverrideRef.current, offset, angle };
      setPreviewOverrides((prev) => ({ ...prev, [drag.key]: { ...prev[drag.key], offset, angle } }));
    };
    const onUp = () => { setIsDraggingPreviewCircle(false); draggingPreviewCircleRef.current = null; finalizePreviewDrag(); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingPreviewCircle]);

  // Dragging the label alone slides it along the dimension/leader line —
  // same projection-and-clamp math as startLabelDrag — and also promotes on
  // release once moved, same as the two drags above.
  const draggingPreviewLabelRef = useRef<{ key: string; from: { x: number; y: number }; to: { x: number; y: number }; offset: number } | null>(null);
  const [isDraggingPreviewLabel, setIsDraggingPreviewLabel] = useState(false);
  useEffect(() => {
    if (!isDraggingPreviewLabel) return;
    const onMove = (evt: MouseEvent) => {
      const drag = draggingPreviewLabelRef.current;
      if (!drag) return;
      previewDragMovedRef.current = true;
      const { x, y } = fx.current.clientToSvg(evt.clientX, evt.clientY);
      const { from, to, offset } = drag;
      const nx = -(to.y - from.y), ny = to.x - from.x;
      const len = Math.hypot(nx, ny) || 1;
      const ux = nx / len, uy = ny / len;
      const ax = from.x + ux * offset, ay = from.y + uy * offset;
      const bx = to.x + ux * offset, by = to.y + uy * offset;
      const dx = bx - ax, dy = by - ay;
      const lenAB = dx * dx + dy * dy || 1;
      const t = ((x - ax) * dx + (y - ay) * dy) / lenAB;
      const labelT = Math.max(0, Math.min(1, t));
      latestPreviewOverrideRef.current = { ...latestPreviewOverrideRef.current, offset, labelT };
      setPreviewOverrides((prev) => ({ ...prev, [drag.key]: { ...prev[drag.key], offset, labelT } }));
    };
    const onUp = () => { setIsDraggingPreviewLabel(false); draggingPreviewLabelRef.current = null; finalizePreviewDrag(); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingPreviewLabel]);











  // Resets every tool-local in-progress gesture — a drag box, an in-progress
  // move-drag, a pending Line/Circle/Rectangle/Arc click, a pending
  // constraint value, a half-finished Measure Between pick, and every new
  // flyout tool's in-progress wizard clicks/picks — so switching tools
  // never leaves a stale gesture behind for the next tool to misinterpret.
  const resetToolState = () => {
    cancelPending();
    setDragBox(null);
    dragStartRef.current = null; dragStartClientRef.current = null; dragModeRef.current = null;
    moveOriginRef.current = null; moveIdsRef.current = new Set(); moveBaseRef.current = new Map();
    dragMovedRef.current = false;
    if (moveSolveDebounceRef.current !== null) { window.clearTimeout(moveSolveDebounceRef.current); moveSolveDebounceRef.current = null; }
    setMeasureResult(null); measureFirstRef.current = null;
    wizardPtsRef.current = []; wizardIdsRef.current = []; setWizardPolyPts([]);
    setCurveTargetId(null); setDivideTargetId(null);
    setEditingPointId(null); setEditingGroupId(null); setCurveDimEditing(false);
    setLineNormalTargetId(null); setLineNormalDistance(''); setLineNormalReverse(false); setLineNormalSymmetric(false);
    setLineSymAnchor(null); setLineSymDistance('');
    setLineNormalStart(null);
    setProfileChain(null); setProfileSegMode('line'); profileThroughRef.current = null;
    setTrapPoly([]); setPaintStroke(null);
  };

  // Unordered-pair equality — a constraint between two lines/points/circles
  // means the same thing regardless of which one was selected first, so
  // matching an existing constraint to upsert has to check both orders.
  const samePair = (a: unknown, b: unknown, x: string, y: string) => (a === x && b === y) || (a === y && b === x);
  // Current angle from line1's direction to line2's direction, matching the
  // solver's own convention (constrain_angle in sketch_solver.py resolves
  // the same cross/dot pair modulo 180°, since two intersecting lines form
  // two equal pairs of angles) — normalized to [0, 180) so the prefilled
  // value in the Angle editor is never a confusing negative number.
  const angleBetweenLines = (id1: string, id2: string) => {
    const l1 = lines.find((l) => l.id === id1); const l2 = lines.find((l) => l.id === id2);
    const a = l1 && pointById.get(l1.p1); const b = l1 && pointById.get(l1.p2);
    const c = l2 && pointById.get(l2.p1); const d = l2 && pointById.get(l2.p2);
    if (!a || !b || !c || !d) return 90;
    const d1x = b.x - a.x, d1y = b.y - a.y;
    const d2x = d.x - c.x, d2y = d.y - c.y;
    const cross = d1x * d2y - d1y * d2x;
    const dot = d1x * d2x + d1y * d2y;
    const deg = (Math.atan2(cross, dot) * 180) / Math.PI;
    return ((deg % 180) + 180) % 180;
  };

  // Reset the edit buffer whenever the single-selected entity changes, so
  // stale typed text from a previous selection never leaks onto a new one.
  // The anchor also resets — to Center for a line this app itself built
  // symmetric (see symmetricLineIdsRef), so its symmetry survives the next
  // length/angle edit by default, or to Start otherwise, same as before.
  useEffect(() => {
    setEditBuffer({});
    setLineAnchor(selectedSingleId && symmetricLineIdsRef.current.has(selectedSingleId) ? 'center' : 'p1');
  }, [selectedSingleId]);

  // A network-level failure (the backend simply isn't reachable — refused
  // connection, DNS, CORS) throws a bare TypeError whose own .message is
  // just the browser's generic "Failed to fetch"/"Load failed", which used
  // to surface verbatim in the Inspector and read like the app itself had
  // crashed. This tells that case apart from a real error response the
  // server sent back on purpose (a solve failure, a 4xx/5xx with its own
  // message) and gives it a plain-language explanation instead — sketch
  // editing keeps working either way, only the live DOF solve is affected.
  const describeSolveError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err);
    const unreachable = err instanceof TypeError || !raw || /fetch|network|load failed/i.test(raw);
    return unreachable
      ? `Solver offline — sketch editing still works, but dimensions/DOF won’t auto-solve until cad_server.py is running on ${API_BASE}.`
      : raw;
  };

  // Every solve resends the whole sketch, so it always takes explicit
  // arrays rather than reading closed-over state — avoids acting on a
  // stale snapshot right after a state update (e.g. "Load example").
  const solve = async (pts: Pt[], lns: Ln[], circs: Circ[], cons: Constraint[]) => {
    const ptIds = new Set(pts.map((p) => p.id));
    // The sketch's AbsoluteAxis (Origin, HDirection, VDirection) is only
    // sent when a constraint uses it — as fixed reference geometry, so
    // "distance from the origin" or "parallel to HDirection" just work.
    const usesRef = cons.some((c) => Object.values(c.args).some((v) => typeof v === 'string' && v.startsWith('__')));
    const refs = usesRef ? absoluteAxisPayload() : { points: [], lines: [], constraints: [] };
    // Only the newest request may write results back — an older solve
    // finishing late would otherwise snap points back to stale positions.
    const seq = ++solveSeqRef.current;
    // Free-form curves as the solver models them (see sketch_curves.py).
    const curvePayload = curves.filter((cv) => curveDefiningIds(cv).every((id) => ptIds.has(id))).map((cv) => {
      switch (cv.kind) {
        case 'ellipse': return { id: cv.id, kind: cv.kind, center: cv.center, rx: cv.rx, ry: cv.ry, rot: cv.rot, start: cv.start ?? null, end: cv.end ?? null };
        case 'parabola': return { id: cv.id, kind: cv.kind, focus: cv.focus, vertex: cv.vertex, span: cv.span };
        case 'hyperbola': return { id: cv.id, kind: cv.kind, center: cv.center, focus: cv.focus, vertex: cv.vertex };
        case 'spline': case 'spline-cv': return { id: cv.id, kind: cv.kind, controls: cv.controlIds };
        case 'conic-rp': return { id: cv.id, kind: cv.kind, p0: cv.p0, papex: cv.papex, p2: cv.p2, rho: cv.rho };
        default: return { id: cv.id, kind: cv.kind, pts: cv.ptIds };
      }
    });
    setSolving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/solve_sketch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [...pts.map((p) => ({ id: p.id, x: p.x, y: p.y })), ...refs.points],
          lines: [...lns.map((l) => ({ id: l.id, p1: l.p1, p2: l.p2 })), ...refs.lines],
          circles: circs.map((c) => ({ id: c.id, center: c.center, r: c.r })),
          // Arcs travel as center + both endpoints; the solver keeps the
          // endpoints on one radius and can make them tangent to lines.
          arcs: arcs
            .filter((a) => a.p1 && a.p2 && ptIds.has(a.center) && ptIds.has(a.p1) && ptIds.has(a.p2))
            .map((a) => ({ id: a.id, center: a.center, p1: a.p1, p2: a.p2 })),
          curves: curvePayload,
          // Projected 3D geometry is locked reference geometry: the solver sees it as fixed. Offset / projection records
          // are the app's own bookkeeping (what an offset follows, what a projection came from), not solver constraints.
          constraints: [...refs.constraints, ...fixedProjected(pts, cons), ...cons.filter((c) => !CLIENT_ONLY_CONSTRAINTS.has(c.type)).map((c) => ({ type: c.type, args: c.args }))],
        }),
      });
      if (!res.ok) throw new Error(`Solve failed (${res.status}): ${await res.text()}`);
      const result = await res.json();
      if (seq !== solveSeqRef.current) return;
      if (result.curves) setCurves((prev) => prev.map((cv) => (cv.kind === 'ellipse' && result.curves[cv.id] ? { ...cv, ...result.curves[cv.id] } : cv)));
      setPoints((prev) => prev.map((p) => (result.points[p.id] ? { ...p, x: result.points[p.id][0], y: result.points[p.id][1] } : p)));
      setCircles((prev) => prev.map((c) => (result.circles[c.id] ? { ...c, r: result.circles[c.id].r } : c)));
      setDof(result.dof);
      setStatus(result.status);
      setFixedIds(new Set([...(result.fixed?.points ?? []), ...(result.fixed?.circles ?? []), ...(result.fixed?.curves ?? [])]));
    } catch (err) {
      if (seq === solveSeqRef.current) setError(describeSolveError(err));
    } finally {
      if (seq === solveSeqRef.current) setSolving(false);
    }
  };

  const cancelPending = () => {
    pendingRef.current = null; setPending(null);
    arcDraftRef.current = null;
    setMousePt(null); setLiveValue(''); setIsEditingLive(false);
    setPendingConstraint(null);
  };












  // Esc cancels the pending placement even when focus isn't in the length
  // field (e.g. the user is still hovering the canvas, not typing yet).
  // Delete/Backspace removes the current selection — but not while the
  // user is typing in a text field (the X/Y/Length/Radius editors, or the
  // Length/Radius live-dim box), where Backspace obviously means "erase a
  // character," not "delete the sketch entity."
  useEffect(() => {
    const onKey = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape' && (circleDefOpen || positioningOpen)) { setCircleDefOpen(false); setPositioningOpen(false); return; }
      if (evt.key === 'Escape' && lineNormalStart) { setLineNormalStart(null); return; }
      if (evt.key === 'Escape' && viewGesture) { viewDragRef.current = null; setZoomAreaBox(null); setViewGesture(null); return; }
      if (evt.key === 'Escape' && trapPoly.length > 0) { setTrapPoly([]); setMousePt(null); return; }
      if (evt.key === 'Escape' && profileChain) { fx.current.finishProfile(false); return; }
      if (evt.key === 'Escape' && pendingRef.current) { cancelPending(); return; }
      if (evt.key === 'Escape' && pendingConstraint) { cancelPendingConstraint(); return; }
      if (evt.key === 'Escape' && dragModeRef.current === 'move') {
        // Cancel an in-progress move-drag — roll every dragged point back
        // to its drag-start snapshot (a pure position rollback, since the
        // drag never touched constraints — see the move-drag design note
        // by moveSolveDebounceRef above) and settle with one final solve.
        if (moveSolveDebounceRef.current !== null) { window.clearTimeout(moveSolveDebounceRef.current); moveSolveDebounceRef.current = null; }
        const restored = points.map((p) => {
          const base = moveBaseRef.current.get(p.id);
          return base ? { ...p, x: base.x, y: base.y } : p;
        });
        setPoints(restored);
        void fx.current.solve(restored, lines, circles, constraints);
        dragModeRef.current = null; dragMovedRef.current = false; dragStartClientRef.current = null;
        moveOriginRef.current = null; moveIdsRef.current = new Set(); moveBaseRef.current = new Map();
        return;
      }
      if (evt.key === 'Escape' && dragModeRef.current === 'box') {
        setDragBox(null); dragStartRef.current = null; dragStartClientRef.current = null; dragModeRef.current = null; dragMovedRef.current = false;
        return;
      }
      // Clears a plain multi-selection (and with it, the automatic
      // selection-driven measurement preview — see selectionPreview,
      // which is derived straight from `selected`) — the other half of
      // "Esc or clicking empty space clears it," clicking empty space
      // being handleCanvasClick's job.
      if (evt.key === 'Escape' && tool === 'select' && selected.length > 0) { setSelected([]); return; }
      if (evt.key === 'Escape' && wizardPolyPts.length > 0) { setWizardPolyPts([]); return; }
      if (evt.key === 'Escape' && (wizardPtsRef.current.length > 0 || wizardIdsRef.current.length > 0)) { wizardPtsRef.current = []; wizardIdsRef.current = []; return; }
      if (evt.key === 'Escape' && curveDimEditing) { setCurveDimEditing(false); return; }
      if (evt.key === 'Escape' && curveTargetId) { setCurveTargetId(null); setEditingPointId(null); return; }
      if (evt.key === 'Escape' && divideTargetId) { setDivideTargetId(null); setEditingGroupId(null); return; }
      if (evt.key === 'Escape' && lineNormalDimEditing) { setLineNormalDimEditing(false); return; }
      if (evt.key === 'Escape' && lineNormalTargetId) { setLineNormalTargetId(null); return; }
      if (evt.key === 'Escape' && lineSymDimEditing) { setLineSymDimEditing(false); return; }
      if (evt.key === 'Escape' && lineSymAnchor) { setLineSymAnchor(null); return; }
      if (evt.key === 'Escape' && flyoutOpen) { setFlyoutOpen(null); return; }
      if (evt.key === 'Escape' && measureFirstRef.current) { measureFirstRef.current = null; setSelected([]); return; }
      if (evt.key === 'Escape' && selectedDimId) { setSelectedDimId(null); return; }
      // Falls through to here once there's no in-progress placement, popover,
      // or selected dimension left for the branches above to cancel — the
      // last thing Escape does is leave whatever tool was active and return
      // to Select, since there's no dedicated Select button in Sketch
      // Entities to click back to it with (see entityTools above).
      if (evt.key === 'Escape' && tool !== 'select') { setTool('select'); fx.current.resetToolState(); return; }
      if ((evt.key === 'Delete' || evt.key === 'Backspace') && selectedDimId) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        evt.preventDefault();
        deleteDimension(selectedDimId);
        return;
      }
      if ((evt.key === 'Delete' || evt.key === 'Backspace') && selected.length > 0) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        evt.preventDefault();
        fx.current.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, selectedDimId, points, lines, circles, arcs, curves, constraints, pendingConstraint, wizardPolyPts, flyoutOpen, tool, curveTargetId, divideTargetId, curveDimEditing, lineNormalTargetId, lineNormalDimEditing, lineSymAnchor, lineSymDimEditing, viewGesture, trapPoly, profileChain, circleDefOpen, positioningOpen, lineNormalStart]);
















  // Ends the chain. `close` adds the closing line back to the first point
  // (the Closed profile toggle's double-click finish); choosing the Profile
  // tool again, or Esc, leaves it open, as in CATIA.
  const finishProfile = (close: boolean) => {
    if (profileChain && close && profileClosed && profileChain.segs >= 2 && profileChain.lastId !== profileChain.firstId) {
      const { firstId, lastId } = profileChain;
      setLines((ls) => [...ls, { id: nextId('ln'), p1: lastId, p2: firstId }]);
    }
    setProfileChain(null);
    setProfileSegMode('line');
    profileThroughRef.current = null;
    setMousePt(null);
  };














  // Adds a constraint matching `predicate` to `list`, or replaces it in
  // place if one already exists — so repeatedly editing a selected entity's
  // dimension updates the same constraint instead of piling up duplicates
  // (which would over-constrain the sketch, e.g. two conflicting distance
  // constraints between the same two points). Pure — returns a new array
  // rather than touching state itself, so a caller that needs to pin an
  // anchor point *and* set a dimension can fold both into the list before
  // committing once (two separate setConstraints calls in a row would each
  // read the same pre-update `constraints`, so the second call's edit would
  // silently overwrite the first's instead of stacking with it).
  const upsertInList = (list: Constraint[], predicate: (c: Constraint) => boolean, type: string, args: Record<string, unknown>, label: string): Constraint[] => {
    const idx = list.findIndex(predicate);
    const entry: Constraint = { id: idx >= 0 ? list[idx].id : nextId('c'), type, args, label };
    return idx >= 0 ? list.map((c, i) => (i === idx ? entry : c)) : [...list, entry];
  };


  // Pins a point in place with a Fixed constraint at its *current* position
  // — used as the "anchor" a Length/Angle/Distance edit pivots around, so
  // only the other end of the dimension moves instead of both.
  const pinPoint = (list: Constraint[], id: string, pt: Pt) =>
    upsertInList(list, (c) => c.type === 'fixed' && c.args.point === id, 'fixed', { point: id, x: pt.x, y: pt.y }, `Fixed: ${id}`);

  // Removes a point's Fixed constraint, if any. Used to release the
  // *previous* anchor when the user flips the "Keep fixed" toggle to the
  // other end of a dimension — without this, switching Start↔End just adds
  // a second Fixed constraint instead of moving it, and the sketch becomes
  // over-constrained (both ends pinned) the next time a Length/Angle/
  // Distance edit is applied.
  const unpinPoint = (list: Constraint[], id: string) =>
    list.filter((c) => !(c.type === 'fixed' && c.args.point === id));


  const cancelPendingConstraint = () => setPendingConstraint(null);





  // Deletes every selected entity, cascading to dependent geometry (a
  // deleted point takes its lines and circles with it, since a line
  // without both endpoints or a circle without a center isn't valid) and
  // stripping any constraint that referenced something now gone — the
  // backend would otherwise reject the next solve with a missing-id error.
  // Deletes a specific set of entity ids, cascading to dependent geometry
  // (a deleted point takes its lines/circles/arcs with it) and stripping
  // any constraint that referenced something now gone. Shared by the
  // Delete key (deleteSelected, below) and Trim's "nothing to keep, so
  // remove the whole entity" case.
  const deleteIds = (ids: string[]) => {
    const idsToDelete = new Set(ids);
    for (const l of lines) { if (idsToDelete.has(l.p1) || idsToDelete.has(l.p2)) idsToDelete.add(l.id); }
    for (const c of circles) { if (idsToDelete.has(c.center)) idsToDelete.add(c.id); }
    for (const a of arcs) { if (idsToDelete.has(a.center)) idsToDelete.add(a.id); }
    // Curves (Ellipse/Parabola/Hyperbola/Conic/Spline) are built on real
    // shared Pt ids too (see the SketchCurve type comment) — deleting one
    // of a curve's defining points takes the curve with it, same as a
    // Circle/Arc losing its center. Deleting the curve itself, though,
    // never deletes its (possibly still-useful) defining points.
    for (const cv of curves) { if (curveDefiningIds(cv).some((id) => idsToDelete.has(id))) idsToDelete.add(cv.id); }
    // The reverse direction: points that only existed for a deleted entity
    // (a line's end points, a circle's/arc's/ellipse's centre, a spline's
    // control points, a parabola's focus…) go with it. A point stays when
    // anything that survives still uses it — another line/arc/curve sharing
    // the corner — or a constraint anchors it: a single-point one (Fixed),
    // or one tying it to something that survives (Coincident with another
    // point, the sketch origin…). A constraint only between points that are
    // all going away (a line's own length dimension) anchors nothing.
    // Done here, in the same state batch as the entity removal, so it's one
    // history snapshot: Ctrl+Z brings the entity back with its points.
    const orphanCandidates = new Set<string>();
    const noteOwned = (ids: (string | undefined)[]) => ids.forEach((id) => { if (id && !idsToDelete.has(id)) orphanCandidates.add(id); });
    for (const l of lines) if (idsToDelete.has(l.id)) noteOwned([l.p1, l.p2]);
    for (const c of circles) if (idsToDelete.has(c.id)) noteOwned([c.center]);
    for (const a of arcs) if (idsToDelete.has(a.id)) noteOwned([a.center, a.p1, a.p2]);
    for (const cv of curves) if (idsToDelete.has(cv.id)) noteOwned(curveDefiningIds(cv));
    const stillUsed = new Set<string>();
    for (const l of lines) if (!idsToDelete.has(l.id)) { stillUsed.add(l.p1); stillUsed.add(l.p2); }
    for (const c of circles) if (!idsToDelete.has(c.id)) stillUsed.add(c.center);
    for (const a of arcs) if (!idsToDelete.has(a.id)) [a.center, a.p1, a.p2].forEach((id) => id && stillUsed.add(id));
    for (const cv of curves) if (!idsToDelete.has(cv.id)) curveDefiningIds(cv).forEach((id) => stillUsed.add(id));
    const orphans = new Set([...orphanCandidates].filter((id) => !stillUsed.has(id)));
    const knownIds = new Set<string>([REF_ORIGIN, REF_HDIR, REF_VDIR, ...[...points, ...lines, ...circles, ...arcs, ...curves].map((e) => e.id)]);
    const constraintIds = (c: Constraint) => Object.values(c.args).filter((v): v is string => typeof v === 'string' && knownIds.has(v));
    for (let changed = true; changed;) {
      changed = false;
      for (const c of constraints) {
        const ids = constraintIds(c);
        if (ids.some((id) => idsToDelete.has(id))) continue; // goes away with the entity
        const anchored = ids.length === 1 || ids.some((id) => !orphans.has(id));
        if (!anchored) continue;
        for (const id of ids) if (orphans.delete(id)) changed = true;
      }
    }
    orphans.forEach((id) => idsToDelete.add(id));
    const nextPoints = points.filter((p) => !idsToDelete.has(p.id));
    const nextLines = lines.filter((l) => !idsToDelete.has(l.id));
    const nextCircles = circles.filter((c) => !idsToDelete.has(c.id));
    const nextArcs = arcs.filter((a) => !idsToDelete.has(a.id));
    const nextCurves = curves.filter((cv) => !idsToDelete.has(cv.id));
    const referencesDeleted = (c: Constraint) => Object.values(c.args).some((v) => typeof v === 'string' && idsToDelete.has(v));
    const nextConstraints = constraints.filter((c) => !referencesDeleted(c));
    setPoints(nextPoints); setLines(nextLines); setCircles(nextCircles); setArcs(nextArcs); setCurves(nextCurves); setConstraints(nextConstraints);
    setSelected([]);
    // A dimension annotation whose measured entity just got deleted has
    // nothing left to read a length/radius off — drop it along with
    // everything else that referenced a deleted id, rather than leaving a
    // dead annotation object sitting in state forever.
    setDimensions((dims) => dims.filter((d) => (d.kind === 'pair' ? !(idsToDelete.has(d.entityIdA!) || idsToDelete.has(d.entityIdB!)) : !idsToDelete.has(d.entityId!))));
    setSelectedDimId((cur) => {
      if (!cur) return cur;
      const dim = dimensions.find((d) => d.id === cur);
      if (!dim) return cur;
      const stale = dim.kind === 'pair' ? (idsToDelete.has(dim.entityIdA!) || idsToDelete.has(dim.entityIdB!)) : idsToDelete.has(dim.entityId!);
      return stale ? null : cur;
    });
    if (nextPoints.length === 0 && nextLines.length === 0 && nextCircles.length === 0 && nextArcs.length === 0 && nextCurves.length === 0) {
      setDof(null); setStatus('Empty sketch'); setError(null);
    } else {
      void solve(nextPoints, nextLines, nextCircles, nextConstraints);
    }
  };

  const deleteSelected = () => {
    if (selected.length > 0) deleteIds(selected);
  };











  const clearSketch = () => {
    sketchesRef.current = {};
    setPlane('Front');
    setPoints([]); setLines([]); setCircles([]); setArcs([]); setCurves([]); setConstraints([]); setSelected([]);
    setDof(null); setStatus('Empty sketch'); setError(null); cancelPending();
    setViewBox(DEFAULT_VIEW_BOX); setRotation(0); setViewFlipped(false);
    setHiddenIds(new Set()); setSwapSpace(false);
    setPlanePickerOpen(true);
    setDimensions([]); setSelectedDimId(null); setMeasureResult(null);
    resetHistory({ points: [], lines: [], circles: [], arcs: [], curves: [], constraints: [], dimensions: [] });
  };



  // Shared by "Load example", loading a saved project, and switching
  // planes: replaces the active sketch's entities and re-solves. Also
  // bumps idCounterRef past any numeric id already in the incoming data,
  // so freshly-drawn entities never collide with loaded ones — e.g.
  // buildExample()'s constraints are literally 'c1'..'c11', which would
  // otherwise clash with the very first new constraint nextId('c') mints.
  // `dimensionsForHistory`: what the history stack's fresh snapshot should
  // record for `dimensions` — this function doesn't itself touch that
  // state (see the comment below), so its two callers each pass whatever
  // they know it'll actually be: [] for a load (applyPayload always
  // clears it first), or the untouched current `dimensions` for a plane
  // switch.
  const replaceSketch = (data: SketchProjectData, dimensionsForHistory: Dimension[]) => {
    const pts = data.points ?? []; const lns = data.lines ?? [];
    const circs = data.circles ?? []; const arcsIn = data.arcs ?? []; const curvesIn = data.curves ?? []; const cons = data.constraints ?? [];
    setPoints(pts); setLines(lns); setCircles(circs); setArcs(arcsIn); setCurves(curvesIn); setConstraints(cons); setSelected([]);
    setHiddenIds(new Set(data.hidden ?? [])); setSwapSpace(false);
    setPositioning(data.positioning ?? { originH: 0, originV: 0, angle: 0 });
    setFixedIds(new Set());
    resetHistory({ points: pts, lines: lns, circles: circs, arcs: arcsIn, curves: curvesIn, constraints: cons, dimensions: dimensionsForHistory, hidden: data.hidden ?? [] });
    // Note this does NOT touch `dimensions` — a plane switch (switchPlane,
    // below) calls this too, and a dimension measured on Front should still
    // be sitting there the next time you switch back to Front, not vanish
    // the moment you leave it. geomById already returns null for an
    // annotation whose entity isn't in the *currently active* plane's
    // arrays, so renderDimension already skips drawing it meanwhile — no
    // special-casing needed here for that to "just work". A load that
    // genuinely discards the entity for good (a different project, Load
    // Example) clears dimensions itself — see applyPayload — since that's
    // the one case an old annotation really is measuring something that no
    // longer exists anywhere.
    setMeasureResult(null);
    cancelPending();
    if (pts.length === 0 && lns.length === 0 && circs.length === 0 && arcsIn.length === 0 && curvesIn.length === 0) {
      setDof(null); setStatus('Empty sketch'); setError(null);
      return;
    }
    const allIds = [...pts, ...lns, ...circs, ...arcsIn, ...curvesIn, ...cons].map((entity) => entity.id);
    const maxNum = allIds.reduce((max, id) => Math.max(max, Number(String(id).match(/\d+$/)?.[0] ?? 0)), 0);
    idCounterRef.current = Math.max(idCounterRef.current, maxNum);
    void solve(pts, lns, circs, cons);
  };

  // A full payload load (a saved project, or "Load example") replaces
  // *everything*, including which plane is active and what's cached for
  // the other planes — unlike switchPlane below, which only swaps the
  // active plane while preserving the other two.
  const applyPayload = (data: SketchProjectData) => {
    sketchesRef.current = {};
    setPlane(data.plane ?? 'Front');
    // Unlike switchPlane, this genuinely discards every plane's cached
    // geometry above — so any dimension left over from before would be
    // measuring an entity that no longer exists anywhere. Drop them here
    // rather than in replaceSketch, which switchPlane also uses and where
    // dimensions must survive (see the comment there).
    setDimensions([]); setSelectedDimId(null);
    replaceSketch(data, []);
  };



  // The closed profiles of a sketch, with Sketch Positioning (rotate/offset about the sketch's own origin) applied.
  const profileOf = (pts: Pt[], lns: Ln[], circs: Circ[], arcsIn: Arc[], pos: { originH: number; originV: number; angle: number }) => {
    const traced = traceLoops(pts, lns, circs, arcsIn);
    const { originH, originV, angle } = pos;
    if (!originH && !originV && !angle) return traced;
    const o = { x: SKETCH_ORIGIN.x, y: -SKETCH_ORIGIN.y };
    return { ...traced, loops: traced.loops.map((l) => positionLoop(positionLoop(l, -o.x, -o.y, 0), o.x + originH, o.y + originV, angle)) };
  };

  useImperativeHandle(ref, () => ({
    getProjectData: () => ({ points, lines, circles, arcs, curves, constraints, plane, hidden: [...hiddenIds], positioning }),
    loadProjectData: applyPayload,
    clear: clearSketch,
    openSketch: (data) => { applyPayload(data); setPlanePickerOpen(false); },
    // Same as picking a plane on the plane picker (see choosePlane).
    openPlane: (next) => {
      if (next !== plane) {
        sketchesRef.current[plane] = { points, lines, circles, arcs, curves, constraints, hidden: [...hiddenIds], positioning };
        setPlane(next);
        replaceSketch(sketchesRef.current[next] ?? { points: [], lines: [], circles: [], arcs: [], curves: [], constraints: [] }, dimensions);
      }
      setPlanePickerOpen(false);
    },
    getExtrudeProfile: () => profileOf(points, lines, circles, arcs, positioning),
    setReflectedSketches: (items) => setReflected(items),
    getInactiveSketches: () => (Object.entries(sketchesRef.current) as [Plane, SketchProjectData][])
      .filter(([p, d]) => p !== plane && d && (d.points.length || d.lines.length || d.circles.length || d.arcs?.length || d.curves?.length))
      .map(([p, d]) => {
        const prof = profileOf(d.points, d.lines, d.circles, d.arcs ?? [], d.positioning ?? { originH: 0, originV: 0, angle: 0 });
        return { plane: p, data: { ...d, plane: p }, loops: prof.loops, profileError: prof.error };
      }),
    undo,
    redo,
    // Reads historyRef directly (not React state) so this is always
    // current even between the renders the factory below actually re-runs
    // on — App.tsx polls this every 400ms via getHistoryState(), not via
    // a subscription, so staleness here would show up as Undo/Redo
    // buttons that enable/disable a beat late rather than a hard bug, but
    // there's no reason not to just read the live ref.
    getHistoryState: () => ({ canUndo: historyRef.current.index > 0, canRedo: historyRef.current.index < historyRef.current.stack.length - 1 }),
    // H/V from the sketch origin (V up), in the current unit.
    setProjectedEdges: (polylines) => {
      const old = projectedIdsRef.current;
      const newPts: Pt[] = [];
      const newLines: Ln[] = [];
      const ids = new Set<string>();
      for (const poly of polylines ?? []) {
        let prev: Pt | null = null;
        for (const q of poly) {
          if (prev && Math.hypot(q.x - prev.x, q.y - prev.y) < 1e-6) continue;
          const pt: Pt = { id: nextId('pt'), x: q.x, y: q.y };
          newPts.push(pt); ids.add(pt.id);
          if (prev) { const ln: Ln = { id: nextId('ln'), p1: prev.id, p2: pt.id, style: 'construction' }; newLines.push(ln); ids.add(ln.id); }
          prev = pt;
        }
      }
      projectedIdsRef.current = ids;
      setPoints((ps) => [...ps.filter((p) => !old.has(p.id)), ...newPts]);
      setLines((ls) => [...ls.filter((l) => !old.has(l.id)), ...newLines]);
      if (newPts.length) {
        const xs = newPts.map((p) => p.x), ys = newPts.map((p) => p.y);
        setViewBox(viewBoxAround(Math.min(...xs, SKETCH_ORIGIN.x), Math.min(...ys, SKETCH_ORIGIN.y), Math.max(...xs, SKETCH_ORIGIN.x), Math.max(...ys, SKETCH_ORIGIN.y)));
      }
    },
    getCursorPosition: () => (cursorPosRef.current ? { x: toU(cursorPosRef.current.x - SKETCH_ORIGIN.x), y: toU(SKETCH_ORIGIN.y - cursorPosRef.current.y) } : null),
  }));


  fx.current = { clientToSvg, computePairMeasure, entitiesAttached, geomById, promotePairDimension, deleteSelected, finishProfile, resetToolState, solve };

  return {
    undo, redo,
    getModelGeometry, modelRevision, supportFrame, referenceGeometry, originSnapPx, originAutoConstrain,
    DEFAULT_VIEW_BOX, ORIGIN_ARM, reflected, REF_HDIR, REF_ORIGIN, REF_VDIR, SKETCH_ORIGIN, allEntityGeoms, angleBetweenLines, toolboxPick, setToolboxPick, chamferInfo, chamferMeasure, applyChamferValues, scaleChamfer, appearancePointRadius, appearanceStyle, applyPayload, arcDraftRef, arcs, cancelPending, cancelPendingConstraint, chamferAngle, chamferDistA, chamferDistB, circCoordR, circCoordX, circCoordY, circle3ptR, circleDefOpen, circles, clearSketch, clientToSvg, colWidths, commitPointDistance, computePairMeasure, conicRho, constraints, coordR, coordTheta, coordX, coordY, cursorPosRef, curveDefiningIds, curveDimEditValue, curveDimEditing, curveDistInputRef, curveOffsetValue, curvePoints, curveTargetId, curves, deleteIds, deleteSelected, describeSolveError, dimEditValue, dimensions, divideCount, divideFixedDistance, divideTargetId, dof, dragBox, dragModeRef, dragMovedRef, dragStartClientRef, dragStartRef, draggingPreviewCircleRef, draggingPreviewLabelRef, draggingPreviewRef, editBuffer, editIsAngleRef, editingGroupId, editingPointId, entitiesAttached, error, filletRadius, finishProfile, fixedIds, flyoutOpen, geomById, grid, hidden, hiddenIds, hoverEntity, importing, isEditingLive, isPanning, latestPreviewOverrideRef, lineAnchor, lineNormalDimEditValue, lineNormalDimEditing, lineNormalDistInputRef, lineNormalDistance, lineNormalPointFirst, lineNormalReverse, lineNormalStart, lineNormalSymmetric, lineNormalTargetId, lineSymAnchor, lineSymDimEditValue, lineSymDimEditing, lineSymDistance, lineSymToggle, lines, liveValue, measureFirstRef, measureResult, mousePt, moveBaseRef, moveIdsRef, moveOriginRef, moveSolveDebounceRef, nextId, numAngle, numEndH, numEndV, numHeight, numRadius, numSkew, numStartH, numStartV, numWidth, onExitWorkbench, onFaceSupport, paintStroke, panLastRef, pending, pendingConstraint, pendingRef, pinPoint, plane, planePickerOpen, pointById, pointIdsForEntity, points, polygonCircumscribed, polygonSides, positioning, positioningOpen, previewDragMovedRef, previewDragTargetRef, previewEditValue, previewOverrides, profileChain, profileClosed, profileSegMode, profileThroughRef, promotePairDimension, rawClientToSvg, replaceSketch, resetConfirmOpen, resetToolState, resizeStartRef, resizingCol, rotateLastRef, rotation, samePair, selected, selectedDimId, selectedSingleId, setArcs, setChamferAngle, setChamferDistA, setChamferDistB, setCircCoordR, setCircCoordX, setCircCoordY, setCircle3ptR, setCircleDefOpen, setCircles, setConicRho, setConstraints, setCoordR, setCoordTheta, setCoordX, setCoordY, setCurveDimEditValue, setCurveDimEditing, setCurveOffsetValue, setCurveTargetId, setCurves, setDimEditValue, setDimensions, setDivideCount, setDivideFixedDistance, setDivideTargetId, setDof, setDragBox, setDraggingDimId, setDraggingLabelId, setEditBuffer, setEditingGroupId, setEditingPointId, setError, setFilletRadius, setFlyoutOpen, setHiddenIds, setHoverEntity, setImporting, setIsDraggingPreview, setIsDraggingPreviewCircle, setIsDraggingPreviewLabel, setIsEditingLive, setIsPanning, setIsRotating, setLineAnchor, setLineNormalDimEditValue, setLineNormalDimEditing, setLineNormalDistance, setLineNormalPointFirst, setLineNormalReverse, setLineNormalStart, setLineNormalSymmetric, setLineNormalTargetId, setLineSymAnchor, setLineSymDimEditValue, setLineSymDimEditing, setLineSymDistance, setLineSymToggle, setLines, setLiveValue, setMeasureResult, setMousePt, setNumAngle, setNumEndH, setNumEndV, setNumHeight, setNumRadius, setNumSkew, setNumStartH, setNumStartV, setNumWidth, setPaintStroke, setPending, setPendingConstraint, setPlane, setPlanePickerOpen, setPoints, setPolygonCircumscribed, setPolygonSides, setPositioning, setPositioningOpen, setPreviewEditValue, setProfileChain, setProfileClosed, setProfileSegMode, setResetConfirmOpen, setResizingCol, setRotation, setSelected, setSelectedDimId, setShowConstraintsList, setStatus, setSwapSpace, setTool, setTrapPoly, setViewBox, setViewFlipped, setViewGesture, setWizardPolyPts, setZoomAreaBox, showConstraintsList, showCursorCoords, showGrid, sketchesRef, snapEnabled, solve, solving, status, suppressClickRef, svgRef, swapSpace, symmetricLineIdsRef, toU, tool, trapPoly, unitMm, units, unpinPoint, upsertInList, viewBox, viewBoxAround, viewDragRef, viewFlipped, viewGesture, wizardIdsRef, wizardPolyPts, wizardPtsRef, zoomAreaBox,
  };
}

export type SketchCore = ReturnType<typeof useSketchCore>;

// Constraint records only the app itself reads (see handlers/modifyTools.tsx) — never sent to the solver.
export const CLIENT_ONLY_CONSTRAINTS = new Set(['offset_link', 'projection']);
function fixedProjected(pts: Pt[], cons: Constraint[]) {
  const prefixes = cons.filter((c) => c.type === 'projection').map((c) => String(c.args.prefix ?? '')).filter(Boolean);
  if (prefixes.length === 0) return [];
  return pts.filter((p) => prefixes.some((pr) => p.id.startsWith(pr))).map((p) => ({ type: 'fixed', args: { point: p.id, x: p.x, y: p.y } }));
}
