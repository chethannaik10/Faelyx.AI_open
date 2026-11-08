// "How to use" guides for the Sketch & 2D toolbox, shown at the bottom of
// the Sketch Inspector. Hand-written for the tools that need explaining;
// every other tool gets its steps from the same hint the status bar shows.
import type { SketchTool } from './types';
import { entityTools, measureTools, constraintModeTools, constraintTools, NEW_TOOL_HINTS } from './tools';
import type { Guide } from '../howTo3D';

const g = (title: string, summary: string, steps: string[], tips?: string[]): Guide => ({ title, summary, steps, tips });
const ESC = 'Press Esc to cancel, or choose Select in the toolbox when you are done.';

const BY_MODE: Partial<Record<SketchTool, Guide>> = {
  select: g('Select', 'Pick, move and edit what is already drawn.', [
    'Left-click an entity to select it.',
    'Left-drag on empty canvas to box-select several entities.',
    'Drag a selected point or entity to move it; double-click an entity to type exact values.',
    'Use the Inspector fields to edit sizes, or press Delete to remove the selection.',
    'Pick a constraint in the toolbox to apply it to the selection.',
  ], ['Middle button pans; middle + right-click drag zooms; middle + right held orbits (3D only).']),
  point: g('Point', 'Place a point.', ['Choose Point.', 'Click the canvas where the point goes — it snaps to the grid and to nearby entities.', 'Use the flyout for exact coordinates, points on curves, midpoints, divisions, intersections and projections.', ESC]),
  line: g('Line', 'Draw straight lines.', [
    'Choose Line, then click the start point and the end point.',
    'Or type Start H/V and Length/Angle (or End H/V) in the bar below the canvas and press Enter.',
    'Keep clicking to continue the chain; double-click or press Esc to stop.',
  ], ['Use the flyout for a line normal to a curve, an infinite line, a bi-tangent line, a bisecting line and a symmetrical extension.']),
  rectangle: g('Rectangle', 'Draw a rectangle by two corners.', [
    'Choose Rectangle, click one corner, then the opposite corner.',
    'Or type a corner H/V plus Width and Height in the bar below and press Enter.',
    'The four sides are drawn as connected lines you can then constrain.',
    'Use the flyout for rotated, centered, parallelogram, slot, keyhole, hexagon, polygon and general-profile shapes.',
  ]),
  circle: g('Circle', 'Draw a circle.', [
    'Choose Circle, click the center, then a point to set the radius.',
    'Or type the center H/V and the radius in the bar below.',
    'Use the flyout for three-point, center + 2 points, coordinate and tri-tangent circles.',
    ESC,
  ]),
  arc: g('Arc', 'Draw an arc.', [
    'Choose Arc, click the center, then the start/radius point, then the end point.',
    'Use the flyout for a 3-point arc, an arc tangent to an existing line, or an arc with limits.',
    ESC,
  ]),
  spline: g('Spline', 'Draw a smooth curve through points.', [
    'Choose Spline and click to add points along the curve.',
    'Double-click to finish. Every control point stays editable — drag one and the curve follows.',
    'The flyout has a control-vertex spline and a curve that connects two existing curves smoothly.',
  ]),
  ellipse: g('Ellipse', 'Draw an ellipse and other conics.', [
    'Choose Ellipse, click the center, a point on the major axis, then a point for the minor axis.',
    'The flyout adds elliptical arcs, parabolas, hyperbolas and conics by points.',
  ]),
  trim: g('Trim', 'Cut a piece of a curve away at its intersections.', [
    'Choose Trim.', 'Click the part of a line, circle, arc or curve between two intersections that you want to remove.',
    'Repeat for other pieces. ' + ESC,
  ]),
  'fillet-2d': g('Fillet', 'Round the corner between two lines.', [
    'Choose Fillet.', 'Click the first line near the corner, then the second line near the same corner.',
    'A tangent arc replaces the corner; edit its radius afterwards in the Inspector.',
  ]),
  'chamfer-2d': g('Chamfer', 'Bevel a corner.', [
    'Choose Chamfer.', 'Click the first element on the side that stays, then the second.',
    'Set the bevel by two lengths, or a length and an angle, in the Inspector.',
  ]),
  'mirror-2d': g('Mirror', 'Reflect elements across a line or axis.', [
    'Select the elements first (Select tool, then Mirror) — or choose Mirror and click them one by one, then press Continue.',
    'Click the line or axis to mirror about — a sketch line, a construction axis, or the horizontal / vertical axis through the origin.',
    'The mirrored copies appear at once and are selected.',
    'Associative (default): every mirrored point is tied to its original with a Symmetry constraint, so editing the original moves the copy. Independent: plain copies.',
  ], ['Points that lie on the axis are shared, so the two halves of a profile join up.', 'The preview (dashed) follows the cursor over each candidate axis before you click.']),
  'translate-2d': g('Translate', 'Move or copy elements by a vector.', [
    'Select the elements first, or click them and press Continue (clicking empty canvas also moves on).',
    'Click a start point and an end point — or type ΔH/ΔV, or distance + angle, and press Apply.',
    'Original: Move it relocates the elements; Keep it (copy) leaves them and adds copies, with a Number of copies for a linear pattern.',
  ], ['The distances, radii and relations between the moved elements are kept — it is a rigid move.', 'Fixed constraints on moved points move with them.']),
  'rotate-2d': g('Rotate', 'Turn or copy elements around a centre.', [
    'Select the elements first, or click them and press Continue.',
    'Click the centre of rotation — an existing point, the origin, or anywhere (you can also type its H and V).',
    'Move the cursor (the angle follows it, in whole degrees) and click — or type an angle and press Apply. Positive is counter-clockwise.',
    'Original: Move it turns the elements; Keep it (copy) adds a rotated copy, and Number of copies repeats it in equal steps.',
  ], ['The shape, its dimensions and the angles between its parts are unchanged.']),
  'offset-2d': g('Offset', 'Make parallel copies of lines, arcs, circles and curves.', [
    'Choose Offset and click the element — a connected chain of lines and arcs is picked together (change this with Pick: Tangent chain / Single element).',
    'Type the distance and choose how corners are made: Sharp (extended to a point), Round (an arc of the offset radius) or Chained (a straight connecting segment).',
    'Click on the side to offset to — or switch on Both sides and click anywhere.',
    'Linked to source (default): the offset is rebuilt whenever the source changes; select any of its pieces to edit the distance, or Unlink it.',
  ], ['Where the offset pieces overlap they are trimmed at the crossing. An offset larger than the profile allows reports it instead of drawing garbage.']),
  'project-3d': g('Project 3D Element', 'Project an edge, face boundary or vertex of the 3D model onto this sketch plane.', [
    'Open the sketch from 3D Design so it is attached to the model (a model with at least one feature, or reference geometry, is needed).',
    'Choose Project 3D Element, then pick Edge / curve, Face boundary or Vertex.',
    'The model is drawn dotted on the sketch plane — hover to highlight the element and click it.',
    'It is added as yellow, locked reference geometry. Dimension and constrain your own geometry to it.',
  ], ['Projected geometry follows the model: change the 3D model and it moves. If its source disappears it turns red — Release it to keep it as construction geometry.', 'It never becomes part of the extruded profile.']),
  'measure-between': g('Measure Between', 'Read the distance between two entities.', [
    'Choose Measure Between.', 'Click the first entity (a point, line, circle or arc).', 'Click the second entity — the distance appears in the Inspector.',
  ], ['Measuring never changes the sketch.']),
  'measure-item': g('Measure Item', 'Read one entity’s own size.', [
    'Choose Measure Item.', 'Click a line, circle, arc or point — its length, radius, angle or coordinates appear in the Inspector.',
  ]),
  'axis-construction': g('Axis', 'Draw a construction axis for revolves and symmetry.', [
    'Choose Axis.', 'Click two points — or type Start and End H/V in the bar below.', 'The dashed axis is a reference only; it is not part of the profile.',
  ]),
  'hide-show': g('Hide / Show', 'Toggle the visibility of entities.', ['Choose Hide / Show.', 'Click an entity to hide or show it.']),
};

const CONSTRAINT_STEPS: Record<string, string[]> = {
  fixed: ['Select one point.', 'Click Fixed (or Apply) — the point can no longer move.'],
  coincident: ['Select two points.', 'Click Coincident — the points become one location.'],
  horizontal: ['Select a line.', 'Click Horizontal — the line lies along the H direction.'],
  vertical: ['Select a line.', 'Click Vertical — the line lies along the V direction.'],
  parallel: ['Select two lines.', 'Click Parallel — the second follows the first’s direction.'],
  perpendicular: ['Select two lines.', 'Click Perpendicular — they meet at 90°.'],
  equal_length: ['Select two lines, or two circles.', 'Click Equal — they take the same length or radius.'],
  tangent: ['Select two circles/arcs, or a line and a circle/arc.', 'Click Tangent — they touch smoothly.'],
  symmetric: ['Select two points and then the axis line.', 'Click Symmetric — the points mirror across the axis.'],
  distance: ['Select two points.', 'Click Distance, type the value and press Enter.'],
  radius: ['Select a circle.', 'Click Radius, type the value and press Enter.'],
  angle: ['Select two lines.', 'Click Angle, type the value and press Enter.'],
};

const MODE_NAME: Record<string, string> = Object.fromEntries([
  ...entityTools.flatMap((t) => [[t.mode, t.name], ...(t.flyout ?? []).map((v) => [v.mode, v.name])]),
  ...measureTools.map((t) => [t.mode, t.name]),
  ...constraintModeTools.map((t) => [t.mode, t.name]),
]);

export const START_2D: Guide = g('Getting started in Sketch & 2D', 'Draw a profile, constrain it, then build with it in 3D Design.', [
  'Pick a plane for the sketch (Top, Front, Right or a Reference Plane).',
  'Choose a drawing tool in the toolbox — Line, Rectangle, Circle, Arc, Spline… — and click on the canvas. This pane then explains that tool.',
  'Add constraints and dimensions from the CONSTRAINTS section until the sketch is fully defined.',
  'Switch to 3D Design: the sketch is kept automatically (the Keep Sketch toggle in the bottom bar controls this).',
  'Use Reflect in the bottom bar to see sketches from other parallel planes as dashed outlines.',
], ['Middle button pans; middle held + right-click then drag zooms. Left-drag on empty space box-selects; double-click edits a value.']);

export function guide2D(tool: SketchTool, pick: { kind: 'constraint' | 'ai'; type: string; name: string; hint: string } | null): Guide {
  if (pick?.kind === 'ai') {
    return g(pick.name, 'Turn a picture into editable sketch geometry.', [
      'Choose Image to Sketch.', 'Load a PNG, JPG or SVG.', 'Wait for the trace — lines, arcs and circles appear as real, editable entities.',
      'Review the result; use Undo import if the trace is off, then adjust or constrain the geometry.',
    ]);
  }
  if (pick?.kind === 'constraint') {
    const ct = constraintTools.find((c) => c.type === pick.type);
    const steps = CONSTRAINT_STEPS[pick.type] ?? [pick.hint + '.', `Click ${pick.name}.`];
    return g(pick.name, ct ? ct.hint : pick.hint, steps, ['The sketch Origin and the H/V directions can be selected too.']);
  }
  const hand = BY_MODE[tool];
  if (hand) return hand;
  const name = MODE_NAME[tool] ?? tool;
  const hint = NEW_TOOL_HINTS[tool];
  return g(name, hint ?? `Draw with ${name}.`, [`Choose ${name} in the toolbox.`, hint ? `${hint}.` : 'Click on the canvas.', 'Or type exact values in the bar below the canvas and press Enter.', ESC]);
}
