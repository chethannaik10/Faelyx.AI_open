// Sketch & 2D data model: the entities, constraints, dimensions and tool
// modes shared by SketchWorkspace and its helper modules.
import type { LucideProps } from 'lucide-react';
import type { ProfileLoop } from '../profileLoops';

export type IconType = React.ForwardRefExoticComponent<LucideProps & React.RefAttributes<SVGSVGElement>> | ((props: React.SVGProps<SVGSVGElement>) => React.ReactElement);

export type Pt = { id: string; x: number; y: number };
// `style` is optional and absent on every ordinary line (unchanged
// rendering/behavior for all pre-existing lines): 'construction' is a
// dashed reference line that still participates in constraints/solving
// like any other line (used by Construction Axis and the Infinite/
// Construction Line tool); 'infinite' additionally means the two stored
// points are just direction anchors and the rendered/hit-tested line is
// extended far past them in both directions (see infiniteLineEndpoints
// below) — it always implies 'construction' styling too.
export type Ln = { id: string; p1: string; p2: string; style?: 'construction' | 'infinite' | 'projected' };
export type Circ = { id: string; center: string; r: number };
// An arc is stored the same way a circle is (a center point + radius) plus
// a start/end sweep in degrees, using the same atan2 convention as
// lineAngleDeg below (0-360, increasing clockwise on screen since SVG's Y
// axis points down). Its center point is a real, solved Point like any
// other — Fixed/Distance/Coincident constraints on it already work through
// the existing points pipeline — but the radius/sweep themselves aren't
// sent to the backend solver yet, so they're edited directly here rather
// than through a constraint. Full arc constraints (tangent, radius-driven)
// are a later pass, same as this whole feature set.
// `p1`/`p2` are the arc's own start/end points — real, shared Pt ids, so a
// line and an arc that meet share one point (a Profile chain stays joined,
// and the arc is part of the traced outline). The solver keeps both on the
// same radius; r/start/end are then re-derived from where the points are
// (see the arc-endpoint sync effect). An arc loaded from an older project
// without them gets them attached on load.
export type Arc = { id: string; center: string; r: number; start: number; end: number; p1?: string; p2?: string };
export type Constraint = { id: string; type: string; args: Record<string, unknown>; label: string };

// A Measure Item annotation — CATIA-style: extension lines off the real
// entity, a dimension/leader line offset away from it by `offset` (sketch
// units), an arrowhead at each end, and a bare-number label (no unit
// suffix) — "R"/"D" prefixed for a Radius/Diameter, see fmtRadius/
// fmtDiameter, plain for a Length. Computed
// fresh from the live entity every render (see renderDimension) rather
// than storing its own coordinates, so it tracks the entity automatically
// if a solve moves it — only `offset` (how far out it sits), `labelT`
// (where along the dimension/leader line the label sits, 0 = start end to
// 1 = far end) and, for a circle/arc leader, `angle` (which direction it
// points) are ever stored, and all of them are exactly what dragging the
// annotation or its label changes.
// 'pair' (entityIdA/entityIdB instead of a single entityId) is a persisted
// two-entity measurement — created the moment the user drags one of the
// CATIA-style automatic pair previews (see finalizePreviewDrag near
// computePairMeasure) rather than a fresh sketch entity of its own, so it
// recomputes its own from/to/label fresh every render via computePairMeasure
// instead of storing a value. entityId/entityIdA/entityIdB are all optional
// on one flat type (rather than a discriminated union) purely so every
// existing `dim.entityId` access below keeps compiling unchanged — kind is
// what actually decides which fields apply.
// 'point' is the newest kind — a driving annotation on a single Pt rather
// than a line/circle/arc, used by every Point-flyout sub-tool to satisfy
// the "auto-dimension on placement" rule (see commitPointDimension below):
// with no `label`, it renders as a live X/Y-from-origin coordinate callout
// (Points by Coordinates, and the generic case); with `label` set, it
// renders that text instead (e.g. "Midpoint" for Bisecting/Mid Point's
// badge) — entityId is the Pt's id either way, and offset/angle/labelT
// aren't used by this kind.
export type Dimension = { id: string; kind: 'line' | 'circle' | 'arc' | 'pair' | 'point'; entityId?: string; entityIdA?: string; entityIdB?: string; offset: number; angle?: number; labelT?: number; label?: string };

// What POST /sketch_from_image hands back: a proposed sketch (its own
// points/lines/circles, ids namespaced "ip"/"il"/"ic" by image_to_sketch.py
// so they can't collide with anything already on the canvas), which gets
// merged into the real sketch immediately — every id rewritten to a fresh
// nextId() first, exactly like a freshly-clicked point/line/circle — so
// each traced entity is instantly selectable and its dimensions editable
// like anything else on the canvas. No reference image is ever kept, only
// the traced vector geometry. ImportSummary is just the after-the-fact
// record of what got added, so the toolbar banner can show a count and,
// via undoImport(), remove exactly those ids if the trace was bad.
export type ImportSummary = {
  notes: string; aiUsed: boolean;
  counts: { points: number; lines: number; circles: number; arcs?: number; curves?: number };
  pointIds: string[]; lineIds: string[]; circleIds: string[]; constraintIds: string[];
  // Image to Sketch also adds arcs and splines; Undo import removes them too.
  arcIds?: string[]; curveIds?: string[];
  // image_to_sketch.py's best-effort read of the traced outline's overall
  // shape (a gear's teeth, an AI-confirmed ellipse) — a ready-to-apply
  // Distance between two real points it already added, never a forced
  // constraint, so a wrong or unwanted guess costs nothing to ignore.
  suggestedDimensions: { label: string; p1: string; p2: string; valueMm: number }[];
};

// What App.tsx's "Save"/"Open" buttons talk to — the whole sketch, in the
// same shape sketch_solver.py's Sketch.from_payload() already expects, so
// a saved project is just this JSON round-tripped through cad_server.py's
// /projects endpoints, not a second serialization format to keep in sync.
export type Plane = 'Front' | 'Top' | 'Right';
export type SketchProjectData = {
  points: Pt[]; lines: Ln[]; circles: Circ[]; arcs?: Arc[]; curves?: SketchCurve[]; constraints: Constraint[]; plane?: Plane;
  // Hide/Show state and Sketch Positioning travel with the sketch too.
  hidden?: string[]; positioning?: { originH: number; originV: number; angle: number };
};

// One undo/redo history entry — everything a sketch edit can touch except
// `plane` (switching planes is navigation, not an edit; see switchPlane).
export type SketchSnapshot = { points: Pt[]; lines: Ln[]; circles: Circ[]; arcs: Arc[]; curves: SketchCurve[]; constraints: Constraint[]; dimensions: Dimension[]; hidden?: string[] };
// What a Pad or Pocket feature extrudes — see profileLoops.ts.
export type { ProfileLoop };

// A sketch from another, parallel plane shown on the open plane as a locked, non-selectable reflection — it is a view of that sketch,
// never a copy: it is not part of the sketch geometry, is not saved with it and is never extruded.
export type ReflectedSketch = { id: string; name: string; label: string; data: SketchProjectData };

export type SketchWorkspaceHandle = {
  getProjectData: () => SketchProjectData;
  loadProjectData: (data: SketchProjectData) => void;
  clear: () => void;
  // Re-entry from 3D Design: open one sketch for editing (replaces the
  // canvas, closes the plane picker), or start on a plane with whatever
  // is already drawn there.
  openSketch: (data: SketchProjectData) => void;
  openPlane: (plane: Plane) => void;
  // The current sketch's extrudable profile — every circle, plus every
  // simple closed shape traced out of the connected lines (see
  // traceLoops). `error` is set instead of an empty array carrying no
  // explanation whenever nothing closed enough to extrude was found.
  getExtrudeProfile: () => { loops: ProfileLoop[]; error?: string };
  // Sketch-local undo/redo history — points/lines/circles/arcs/curves/
  // constraints/dimensions, snapshotted after each settled edit (see the
  // history effect below). App.tsx's Undo/Redo toolbar buttons call these
  // directly; getHistoryState() is polled to enable/disable them.
  undo: () => void;
  redo: () => void;
  getHistoryState: () => { canUndo: boolean; canRedo: boolean };
  // Live cursor position in the active sketch plane, tracked on every
  // canvas mousemove regardless of tool — drives App.tsx's statusbar X/Y/Z
  // readout. Null whenever the mouse isn't over the canvas.
  getCursorPosition: () => { x: number; y: number } | null;
  // Sketch on Face: the picked face's edges (canvas coordinates) projected
  // into the sketch as construction geometry; null removes them.
  setProjectedEdges: (polylines: { x: number; y: number }[][] | null) => void;
  // The sketches cached for the planes that are NOT currently open (switching planes in the workbench keeps them),
  // each with its extrudable profile — so Keep Sketch can keep every plane's sketch, not just the open one.
  setReflectedSketches: (items: ReflectedSketch[]) => void;
  getInactiveSketches: () => { plane: Plane; data: SketchProjectData; loops: ProfileLoop[]; profileError?: string }[];
};

export type SketchTool =
  | 'select' | 'point' | 'line' | 'circle' | 'rectangle' | 'arc' | 'trim' | 'measure-between' | 'measure-item'
  | 'rect-oriented' | 'rect-parallelogram' | 'slot' | 'slot-cyl' | 'keyhole' | 'hexagon' | 'profile'
  | 'circle-3pt' | 'circle-2pt' | 'circle-tritangent'
  | 'ellipse' | 'parabola' | 'hyperbola' | 'conic'
  | 'spline' | 'spline-connect'
  | 'line-normal' | 'line-symmetric'
  | 'line-infinite' | 'line-bitangent' | 'line-bisect'
  | 'point-intersect' | 'point-project'
  | 'hide-show'
  | 'point-coord' | 'point-oncurve'
  // Added per the full sketch-entity spec — one net-new mode per still-missing
  // sub-tool, each following whichever existing wizard pattern its click
  // count matches (see wizardPtsRef/wizardIdsRef below).
  | 'point-midpoint' | 'point-divide'
  | 'axis-construction'
  | 'rect-center3' | 'rect-parallelogram-center' | 'rect-centered'
  | 'circle-coord'
  | 'arc-3pt' | 'arc-tangent' | 'arc-3pt-limits'
  | 'polygon-n' | 'slot-arc'
  | 'fillet-2d' | 'chamfer-2d'
  // MODIFY tools (handlers/modifyTools.tsx)
  | 'mirror-2d' | 'translate-2d' | 'rotate-2d' | 'offset-2d' | 'project-3d'
  | 'spline-cv' | 'ellipse-arc' | 'conic-rp';

// A parametric curve (Ellipse/Parabola/Hyperbola/Conic/Spline) — like a
// Circle (center Pt id + radius) or an Arc (center Pt id + radius/sweep),
// every curve is defined by real, shared Pt ids (so they're the same
// selectable/movable/constrainable/solver-sent points as anything else on
// the canvas — a Fixed or Distance constraint on an ellipse's center point
// works exactly like it would on any other point) plus whatever plain
// numeric shape parameters it needs. The actual rendered/measured polyline
// is never stored — curvePoints() (see below, inside the component, since
// it needs the live `points` array) resamples it fresh every time from the
// current point positions and parameters, so a curve updates automatically
// if its defining points move (e.g. because a constraint solve moved
// them). The parameters themselves (rx/ry/rot, span) are edited directly
// (see commitCurve* below) rather than through the backend solver — the
// same "phase 1" simplification the Arc's radius/sweep already uses (see
// the Arc type comment near the top of this file), since sketch_solver.py
// has no concept of an ellipse/parabola/etc. to send them to.
export type SketchCurve =
  // `start`/`end` (degrees, same 0-360 clockwise-on-screen convention as
  // Arc) are optional: absent means a full closed ellipse (unchanged
  // behavior for every ellipse drawn before this pair of fields existed),
  // present means a Partial Ellipse / Elliptical Arc — an open sweep, same
  // "full unless told otherwise" idea as Arc's own start/end.
  | { id: string; kind: 'ellipse'; center: string; rx: number; ry: number; rot: number; start?: number; end?: number }
  | { id: string; kind: 'parabola'; focus: string; vertex: string; span: number }
  | { id: string; kind: 'hyperbola'; center: string; focus: string; vertex: string }
  | { id: string; kind: 'spline'; controlIds: string[] }
  // Control-Vertex spline: same shape as an interpolating spline (a list of
  // real control-point ids) but sampled with the uniform cubic B-spline
  // basis (see sampleCvSpline below) instead of Catmull-Rom, so the curve
  // is guided by its control polygon rather than passing through every
  // point — the actual definition of a CV/B-spline vs. an interpolation
  // spline.
  | { id: string; kind: 'spline-cv'; controlIds: string[] }
  | { id: string; kind: 'conic'; ptIds: string[] }
  // General Conic via the classic CAD "shape parameter" (Rho) construction:
  // two endpoints (p0/p2) and the point where their tangent lines meet
  // (papex) define a rational-quadratic-Bezier conic; rho in (0,1) alone
  // decides its type (<0.5 ellipse-like, =0.5 parabola, >0.5 hyperbola-like)
  // — see sampleConicRho below.
  | { id: string; kind: 'conic-rp'; p0: string; papex: string; p2: string; rho: number };
