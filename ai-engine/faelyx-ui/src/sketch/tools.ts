// The SKETCH TOOLBOX definitions: entity tools with their flyout variants,
// measure tools, constraint tools, and the shared tool button.

import {
  Target, Minus, Circle, Crosshair, Link2, ArrowLeftRight,
  ArrowDownToLine, Layers3, BoxSelect, Copy, Zap, Expand, Ruler, CircleDot,
  RotateCw, Square, Spline, Scissors,
  ScanLine,
  RectangleHorizontal, Proportions, Slice, RectangleEllipsis, Combine, Hexagon, Shapes,
  CircleDotDashed, Radius, Magnet, Orbit, Focus, Waypoints, Blend, Route, GitFork,
  Workflow, Compass, SquareDot, Milestone, GitCommitHorizontal, Divide, Diameter, Diamond, Grip, Gauge, CornerUpRight, CornerDownRight,
  Donut, Axis3d, Infinity as InfinityIcon, Component, Frame, Boxes, LayoutGrid, Crop,
  GitMerge, ArrowDownToDot, FlipHorizontal2, Move, RotateCcw, CopyPlus, Box } from 'lucide-react';
import type { IconType, SketchTool } from './types';

// CATIA's own Sketcher toolbar groups Point/Line/Profile(Rectangle)/
// Circle/Spline/Ellipse behind a small flyout arrow, each hiding several
// more specific construction tools. `flyout` mirrors that: an optional
// list of extra variants attached to one of the base entityTools below,
// rendered as a small expandable popover (see the SKETCH ENTITIES section
// further down) rather than CATIA's own toolbar look, to match Faelyx's
// existing tool-list style.
export type FlyoutVariant = { name: string; icon: IconType; mode: SketchTool; hint: string };
export type EntityTool = { name: string; icon: IconType; mode: SketchTool; hint?: string; flyout?: FlyoutVariant[] };
// 'select' is deliberately not a button here — it's the tool's default/
// rest state (see the tool useState below and the Escape handler further
// down), not something you pick from Sketch Entities. Every other tool
// switch already leaves it via setTool(t.mode); Escape is what brings you
// back, matching "there's no explicit Select button, pressing Esc just
// gets you there."
export const entityTools: EntityTool[] = [
  {
    name: 'Point', icon: Target, mode: 'point', hint: 'Click the canvas to place a point',
    flyout: [
      { name: 'Point by Coordinates', icon: SquareDot, mode: 'point-coord', hint: 'Type an exact X/Y (or R/θ) in the bar below and add it directly, with no click needed' },
      { name: 'Points on Curve', icon: Milestone, mode: 'point-oncurve', hint: 'Click a line, circle, arc or curve — a preview point appears immediately, then type the exact length to place it' },
      { name: 'Bisecting / Mid Point', icon: GitCommitHorizontal, mode: 'point-midpoint', hint: 'Click a single line/arc for its exact center, or two points to drop one exactly between them' },
      { name: 'Equidistant / Divided Points', icon: Divide, mode: 'point-divide', hint: 'Click a line, circle, arc or curve, set a count or spacing, then confirm to drop equally-spaced points' },
      { name: 'Intersection Point', icon: GitMerge, mode: 'point-intersect', hint: 'Click two lines, circles, arcs or curves — a point is dropped at every place they cross (lines are treated as infinite)' },
      { name: 'Projection Point', icon: ArrowDownToDot, mode: 'point-project', hint: 'Click an existing point, then a line, circle or arc — a point is dropped at its perpendicular projection onto it' },
    ],
  },
  {
    name: 'Line', icon: Minus, mode: 'line', hint: 'Click a start point, then an end point — or type Start H/V, then Length/Angle or End H/V, in the bar below. Symmetrical Extension there makes the first click the midpoint',
    flyout: [
      { name: 'Line Normal to Curve', icon: Workflow, mode: 'line-normal', hint: 'Click a line, circle or arc — set Length, Reverse or Symmetrical Extension in the Inspector, then click again (or Apply) to place it' },
      { name: 'Infinite Line', icon: InfinityIcon, mode: 'line-infinite', hint: 'Pick Horizontal, Vertical or Through Two Points in the bar below, then click — a construction line with no ends' },
      { name: 'Bi-Tangent Line', icon: Magnet, mode: 'line-bitangent', hint: 'Click two circles, arcs, ellipses or other curves near where the line should touch them — draws the common tangent closest to your clicks' },
      { name: 'Bisecting Line', icon: Compass, mode: 'line-bisect', hint: 'Click two lines on the sides of the angle you want split — draws an infinite line bisecting it' },
      { name: 'Symmetrical Extension', icon: Grip, mode: 'line-symmetric', hint: 'Click anywhere on the canvas, or on an existing curve/entity, then click again (or Apply) — draws a line expanding equally in both directions from that anchor' },
    ],
  },
  {
    name: 'Rectangle', icon: Square, mode: 'rectangle', hint: 'Click one corner, then the opposite corner — or type a corner H/V plus Width/Height in the bar below. Edges are auto-constrained Horizontal/Vertical',
    flyout: [
      { name: 'Oriented Rectangle', icon: RectangleHorizontal, mode: 'rect-oriented', hint: 'Click one corner, then along one edge, then the perpendicular extent — or type a corner H/V, Width, Height and angle A in the bar below' },
      { name: 'Centered Rectangle', icon: Crosshair, mode: 'rect-centered', hint: 'Click the center, then a corner — an axis-aligned box built symmetric about the center. Edges are auto-constrained Horizontal/Vertical, and the center stays the true center through later edits' },
      { name: '3-Point Center Rectangle', icon: Component, mode: 'rect-center3', hint: 'Click the center, then an edge-direction point, then a corner' },
      { name: 'Parallelogram', icon: Proportions, mode: 'rect-parallelogram', hint: 'Click 3 corners — the 4th is completed automatically. Or type a corner H/V, Width, Height and Angle in the bar below' },
      { name: 'Center Parallelogram', icon: Frame, mode: 'rect-parallelogram-center', hint: 'Click the center, then two adjacent vertices' },
      { name: 'Elongated Hole', icon: Slice, mode: 'slot', hint: 'Click the two slot-end centers, then a 3rd point to set the radius' },
      { name: 'Cylindrical Elongated Hole', icon: RectangleEllipsis, mode: 'slot-cyl', hint: 'Click the slot’s midpoint, then one end, then a 3rd point to set the radius' },
      { name: 'Curved Slot', icon: Donut, mode: 'slot-arc', hint: 'Click 3 points to set a curved center path, then a 4th to set the slot width' },
      { name: 'Keyhole Profile', icon: Combine, mode: 'keyhole', hint: 'Click the small and large circle centers, then a 3rd point to size the large circle (small ≈ 0.4×)' },
      { name: 'Hexagon', icon: Hexagon, mode: 'hexagon', hint: 'Click the center, then a vertex to set the size/rotation' },
      { name: 'Regular Polygon', icon: Boxes, mode: 'polygon-n', hint: 'Set the side count (and inscribed/circumscribed) in the bar below, then click the center and a vertex' },
      { name: 'General Profile', icon: Shapes, mode: 'profile', hint: 'Click to chain lines — switch to Tangent Arc or Three Point Arc in the bar below for arcs. Clicking the start point closes it; double-click, or choose General Profile again, to finish' },
    ],
  },
  {
    name: 'Circle', icon: Circle, mode: 'circle', hint: 'Click a center, then a point to set the radius — or type a center H/V and radius R in the bar below',
    flyout: [
      { name: 'Three-Point Circle', icon: CircleDotDashed, mode: 'circle-3pt', hint: 'Click 3 points — the circle passing through all of them. Type R in the bar below to fix the radius (the 3rd click then only picks the side)' },
      { name: 'Circle Center + 2 Points', icon: Radius, mode: 'circle-2pt', hint: 'Click a center, then two points near its rim — the radius is averaged between them' },
      { name: 'Coordinate Circle', icon: Diameter, mode: 'circle-coord', hint: 'Type an exact center X/Y and radius in the bar below and add it directly, with no click needed' },
      { name: 'Tri-Tangent Circle', icon: Magnet, mode: 'circle-tritangent', hint: 'Click 3 lines, circles, arcs, ellipses or curves near where the circle should touch them — the circle tangent to all 3' },
    ],
  },
  {
    name: 'Spline', icon: Route, mode: 'spline', hint: 'Click to add control points, double-click to finish — a smooth curve through them',
    flyout: [
      { name: 'Control Vertex (CV) Spline', icon: LayoutGrid, mode: 'spline-cv', hint: 'Click to add control points, double-click to finish — the curve is guided by, not pinned to, each point' },
      { name: 'Connect Curves', icon: GitFork, mode: 'spline-connect', hint: 'Click two lines/curves — blends a smooth curve between their nearest endpoints' },
    ],
  },
  {
    name: 'Ellipse', icon: Orbit, mode: 'ellipse', hint: 'Click a center, a major-axis point, then a minor-axis point',
    flyout: [
      { name: 'Elliptical Arc', icon: Orbit, mode: 'ellipse-arc', hint: 'Click a center, a major-axis point, a minor-axis point, then a start and end cut angle' },
      { name: 'Parabola by Focus', icon: Focus, mode: 'parabola', hint: 'Click the focus, the vertex, then a point to set how wide a span to draw' },
      { name: 'Hyperbola by Focus', icon: Waypoints, mode: 'hyperbola', hint: 'Click the center, the focus, then the vertex — draws the branch nearer that focus' },
      { name: 'Conic', icon: Blend, mode: 'conic', hint: 'Click 5 points — fits the conic passing through all of them' },
      { name: 'General Conic (Rho)', icon: Blend, mode: 'conic-rp', hint: 'Click 2 endpoints, then the point where their tangents meet, then type a shape factor (0-1) in the bar below' },
    ],
  },
  {
    name: 'Arc', icon: Spline, mode: 'arc', hint: 'Click a center, then a point to set the radius/start, then a 3rd click to set the end angle',
    flyout: [
      { name: '3-Point Arc', icon: CornerUpRight, mode: 'arc-3pt', hint: 'Click a start point, a second point the arc passes through, then the end point' },
      { name: 'Tangent Arc', icon: Gauge, mode: 'arc-tangent', hint: 'Click an existing line/arc endpoint, then an end point — starts tangent to it automatically' },
      { name: '3-Point Arc with Limits', icon: CornerDownRight, mode: 'arc-3pt-limits', hint: 'Click the start point, then the end point, then a point on the arc' },
    ],
  },
  { name: 'Axis', icon: Axis3d, mode: 'axis-construction', hint: 'Click two points — or type Start H/V and End H/V in the bar below — a dashed datum/reference axis for revolves and symmetry' },
];

// Corner / relimitation operations — shown in the toolbox's CONSTRAINTS
// section, after the constraint buttons. Unlike those one-shot constraint
// buttons these are click-mode tools (same as the entity tools above).
export const constraintModeTools: EntityTool[] = [
  { name: 'Fillet', icon: Crop, mode: 'fillet-2d', hint: 'Click two intersecting lines — rounds the corner with a tangent arc (radius editable after)' },
  { name: 'Chamfer', icon: Diamond, mode: 'chamfer-2d', hint: 'Click two lines, arcs, circles or curves that meet — bevels the corner with a straight cut, by two lengths or a length and an angle' },
  { name: 'Trim', icon: Scissors, mode: 'trim', hint: 'Click a line, circle, arc or curve between its intersections to cut that piece away' },
  { name: 'Mirror', icon: FlipHorizontal2, mode: 'mirror-2d', hint: 'Pick the elements, then click a line or axis — they are reflected across it, tied to the originals with Symmetry constraints (or as independent copies)' },
  { name: 'Translate', icon: Move, mode: 'translate-2d', hint: 'Pick the elements, then click a start and an end point — or type X/Y (or distance and angle). Moves them, or copies them when Keep original is on' },
  { name: 'Rotate', icon: RotateCcw, mode: 'rotate-2d', hint: 'Pick the elements, click the centre, then click (or type) the angle. Rotates them, or copies them when Keep original is on' },
  { name: 'Offset', icon: CopyPlus, mode: 'offset-2d', hint: 'Click a line, arc, circle or curve (a connected chain is picked together), set the distance, click the side — corners are made sharp, round or chained; linked offsets follow their source' },
  { name: 'Project 3D Element', icon: Box, mode: 'project-3d', hint: 'Click an edge, face boundary or vertex of the 3D model — it is projected onto this sketch plane as locked yellow reference geometry that follows the model' },
];

// The bottom-bar hint shown while one of the new flyout variants is
// active — reuses each variant's own `hint` above instead of a second
// copy of the same text.
export const NEW_TOOL_HINTS: Partial<Record<SketchTool, string>> = Object.fromEntries(
  [...entityTools, ...constraintModeTools].flatMap((t) => [[t.mode, t.hint] as const, ...(t.flyout?.map((v) => [v.mode, v.hint] as const) ?? [])]),
);

export const measureTools: EntityTool[] = [
  { name: 'Measure Between', icon: Ruler, mode: 'measure-between', hint: 'Click two entities — points, lines, circles or arcs — to measure the distance between them' },
  { name: 'Measure Item', icon: ScanLine, mode: 'measure-item', hint: 'Click a single entity to read its own length, radius, angle or coordinates' },
];

export type ConstraintTool = { type: string; name: string; icon: IconType; hint: string };
export const constraintTools: ConstraintTool[] = [
  { type: 'fixed', name: 'Fixed', icon: Crosshair, hint: 'Select 1 point' },
  { type: 'coincident', name: 'Coincident', icon: Link2, hint: 'Select 2 points' },
  { type: 'horizontal', name: 'Horizontal', icon: ArrowLeftRight, hint: 'Select 1 line' },
  { type: 'vertical', name: 'Vertical', icon: ArrowDownToLine, hint: 'Select 1 line' },
  { type: 'parallel', name: 'Parallel', icon: Layers3, hint: 'Select 2 lines' },
  { type: 'perpendicular', name: 'Perpendicular', icon: BoxSelect, hint: 'Select 2 lines' },
  { type: 'equal_length', name: 'Equal', icon: Copy, hint: 'Select 2 lines, or 2 circles' },
  { type: 'tangent', name: 'Tangent', icon: Zap, hint: 'Select 2 circles/arcs, or 1 line + 1 circle/arc' },
  { type: 'symmetric', name: 'Symmetric', icon: Expand, hint: 'Select 2 points + 1 line (axis)' },
  { type: 'distance', name: 'Distance', icon: Ruler, hint: 'Select 2 points' },
  { type: 'radius', name: 'Radius', icon: CircleDot, hint: 'Select 1 circle' },
  { type: 'angle', name: 'Angle', icon: RotateCw, hint: 'Select 2 lines' },
];

