// "How to use" guides for the 3D Design toolbox: one short, step-by-step
// explanation per option, shown in the right-hand pane under the tool's
// own definition box. A tool with no hand-written guide still gets one,
// built from its description and what it takes (faces, edges, a sketch).
import type { ToolSpec } from './partDesign';

export type Guide = { title: string; summary?: string; steps: string[]; tips?: string[] };

const SKETCH = 'Switch to Sketch & 2D, choose a plane and draw the shape (sketches are kept automatically when you leave).';
const OPEN_TOOL = (name: string) => `Back in 3D Design, choose ${name} in the toolbox — its definition opens on the Properties tab.`;
const APPLY = 'Click Apply changes. The feature appears in the model tree; click it there any time to edit it and press Update.';
const PICK_FACES = 'Choose Select in the viewport toolbar and click the face(s) on the part. Click a picked face in the list to drop it again.';
const PICK_EDGES = 'Choose Select, switch the filter to Edges and click the edges on the part (or pick faces to use all of their edges).';

const g = (title: string, summary: string, steps: string[], tips?: string[]): Guide => ({ title, summary, steps, tips });

const GUIDES: Record<string, Guide> = {
  Pad: g('Pad', 'Extrude a closed profile into solid material.', [
    SKETCH.replace('the shape', 'a closed profile (rectangle, circle, general profile…)'),
    OPEN_TOOL('Pad'),
    'Pick the Profile and the Sketch support if more than one is offered.',
    'Type: Dimension (a length) or Up to last (through everything). Enter the Length in mm.',
    'Optional: Reverse direction, Mirrored extent (the length on both sides), or a Second limit on the other side.',
    'Optional: Thick turns the profile into a wall — Thickness 1 grows inward, Thickness 2 outward.',
    APPLY,
  ], ['An inner closed profile inside an outer one becomes a hole automatically.']),
  Pocket: g('Pocket', 'Cut a closed profile out of the existing material.', [
    SKETCH.replace('the shape', 'a closed profile on or above the part'),
    OPEN_TOOL('Pocket'),
    'Set Type (Dimension or Up to last) and the Depth.',
    'Optional: Reverse direction, Mirrored extent, Second limit, or Thick for a thin groove.',
    APPLY,
  ], ['If nothing is removed, flip Reverse direction — the cut may be going away from the part.']),
  Shaft: g('Shaft', 'Revolve a closed profile around an axis to add material.', [
    SKETCH.replace('the shape', 'a closed profile on one side of the axis you want to turn around'),
    OPEN_TOOL('Shaft'),
    'Axis: the sketch H axis or V axis. Set the First angle (360° is a full turn) and an optional Second angle.',
    'Optional: Thick makes a hollow shell instead of a solid.',
    APPLY,
  ], ['Keep the profile entirely on one side of the axis — crossing it makes an invalid solid.']),
  Groove: g('Groove', 'Revolve a closed profile around an axis to cut material.', [
    SKETCH.replace('the shape', 'the closed cross-section of the groove'),
    OPEN_TOOL('Groove'),
    'Choose the Axis and the angles (360° for a ring-shaped groove).',
    APPLY,
  ]),
  Hole: g('Hole', 'Drill holes at the circles of a sketch.', [
    'In Sketch & 2D, draw one circle per hole (or points/circles from a pattern) on the face or plane to drill from.',
    OPEN_TOOL('Hole'),
    'Type: Simple, Counterbored or Countersunk. Extension: Blind (set a Depth) or Up to last.',
    'Diameter: leave blank to use each circle’s own size. Optional V-bottom angle, counterbore/countersink sizes, or Threaded with an ISO designation such as M10.',
    APPLY,
  ]),
  Rib: g('Rib', 'Sweep a profile along a center curve to add material (CATIA Rib).', [
    'Sketch the profile (closed) on a plane crossing the start of the path — for example a small rectangle or circle.',
    'Make the center curve: either a kept sketch holding an open chain of lines/arcs, or a Reference Line made with the Reference Line tool between points on any planes.',
    OPEN_TOOL('Rib'),
    'Center curve from: pick “A kept sketch” and choose it, or “A Reference Line” and choose the line.',
    'Profile control: Keep angle holds the profile at a constant angle to the curve; Pulling direction keeps the profile facing a fixed direction (choose it); Reference surface keeps it at a constant angle to a chosen plane; Keep Frenet follows the curve’s own turning.',
    'Move profile to path: tick it when the profile is not already on the curve — it is placed at the start of the curve, normal to it.',
    'Transition: Round or Right (sharp) at corners where the curve changes direction.',
    'Thick profile: gives the profile a wall. Thickness 1 is inward, Thickness 2 outward; Neutral fiber splits one thickness equally on both sides.',
    APPLY,
  ], [
    'Without Move profile to path, the profile must already touch the curve’s start.',
    'Merge rib’s ends (trimming the rib to existing material) is not available yet.',
    'If the build fails on a sharp corner, switch Transition to Round or smooth the curve with an arc.',
  ]),
  Slot: g('Slot', 'Sweep a profile along a center curve to remove material (CATIA Slot).', [
    'Sketch the closed cutting profile at the start of the path.',
    'Make the center curve (a kept open sketch or a Reference Line) as for Rib.',
    OPEN_TOOL('Slot'),
    'Choose the center curve, Profile control, Move profile to path, Transition and Thick profile exactly as in Rib.',
    APPLY,
  ], ['The slot only removes material where the swept profile overlaps the part.']),
  Stiffener: g('Stiffener', 'Turn an open line or chain into a web that fills up to the part.', [
    'Sketch an open chain of lines/arcs (not closed) on the plane through the part, with its ends reaching the material.',
    OPEN_TOOL('Stiffener'),
    'Set Thickness. Mirrored extent makes it symmetric about the sketch plane; otherwise use Reverse direction to choose the side.',
    APPLY,
  ]),
  'Multi-sections Solid': g('Multi-sections Solid', 'Loft a solid through two or more sketches.', [
    'Make one kept sketch per section, each on its own plane (use Reference Plane for parallel planes).',
    OPEN_TOOL('Multi-sections Solid'),
    'Tick the sections in the order the solid should pass through them — the numbers show the order.',
    'Ruled gives straight coupling between sections instead of a smooth blend.',
    APPLY,
  ]),
  'Removed Multi-sections Solid': g('Removed Multi-sections Solid', 'Cut a loft through two or more sketches out of the part.', [
    'Make one kept sketch per section, each on its own plane.',
    OPEN_TOOL('Removed Multi-sections Solid'),
    'Tick the sections in order, choose Ruled if you want straight coupling.',
    APPLY,
  ]),
  'Edge Fillet': g('Edge Fillet', 'Round edges with a constant radius.', [
    PICK_EDGES,
    OPEN_TOOL('Edge Fillet'),
    'Enter the Radius. With nothing picked, the Edges filter (all, vertical, horizontal, curved) chooses edges for you.',
    APPLY,
  ], ['The radius must be smaller than the neighbouring faces allow.']),
  'Variable Fillet': g('Variable Fillet', 'Round an edge with a radius that changes along it.', [
    PICK_EDGES,
    OPEN_TOOL('Variable Fillet'),
    'Radius 1 applies at the start of each edge and Radius 2 at the end.',
    APPLY,
  ]),
  Chamfer: g('Chamfer', 'Bevel edges.', [
    PICK_EDGES,
    OPEN_TOOL('Chamfer'),
    'Chamfer mode: Length + angle or two lengths. Reverse swaps which face the length is measured from.',
    APPLY,
  ]),
  Draft: g('Draft', 'Tilt faces so the part can be released from a mold.', [
    PICK_FACES + ' With none picked, every side face is drafted.',
    OPEN_TOOL('Draft'),
    'Set the Draft angle, the Pull direction, and the Neutral element (the plane the faces pivot on).',
    APPLY,
  ]),
  Shell: g('Shell', 'Hollow the part, leaving walls.', [
    PICK_FACES.replace('the face(s) on the part', 'the faces to leave open'),
    OPEN_TOOL('Shell'),
    'Enter the Inside thickness (wall grows inward) and optionally the Outside thickness.',
    APPLY,
  ], ['With no face picked, the top (+Z) face is opened.']),
  Thickness: g('Thickness', 'Add or remove a layer of material on faces.', [
    PICK_FACES, OPEN_TOOL('Thickness'),
    'Enter the Thickness: positive adds material, negative removes it.', APPLY,
  ]),
  'Thread/Tap': g('Thread/Tap', 'Mark a cylinder as a thread (shaft) or tap (hole).', [
    'Click the cylindrical face to thread.', OPEN_TOOL('Thread/Tap'),
    'Choose the Type and the Designation (for example M10 or M10x1.25) — it is checked against the diameter. Optionally limit the Depth.', APPLY,
  ]),
  'Remove Face': g('Remove Face', 'Delete faces and heal the part (defeaturing).', [
    PICK_FACES, OPEN_TOOL('Remove Face'), APPLY,
  ]),
  Split: g('Split', 'Cut the part with a plane and keep one side.', [
    OPEN_TOOL('Split'), 'Choose the Splitting plane (XY, XZ or YZ) and its Offset along the normal.', 'Side to keep: the positive or negative side of that plane’s normal.', APPLY,
  ]),
  Translation: g('Translation', 'Move the body along a direction.', [OPEN_TOOL('Translation'), 'Choose the Direction and the Distance.', APPLY]),
  Rotation: g('Rotation', 'Rotate the body about an axis.', [OPEN_TOOL('Rotation'), 'Choose the Axis direction, a point the axis passes through, and the Angle.', APPLY]),
  Symmetry: g('Symmetry', 'Mirror the body about a plane (the original is not kept).', [OPEN_TOOL('Symmetry'), 'Choose the Symmetry plane and its Offset. The body is replaced by its mirror image.', APPLY]),
  Mirror: g('Mirror', 'Duplicate the body by symmetry (the original is kept).', [OPEN_TOOL('Mirror'), 'Choose the Mirror plane.', APPLY]),
  'Rectangular Pattern': g('Rectangular Pattern', 'Repeat the body along one or two directions.', [
    OPEN_TOOL('Rectangular Pattern'), 'Set the First direction, number of Instances and Spacing.', 'Tick a second direction for a grid and set its instances and spacing.', APPLY,
  ]),
  'Circular Pattern': g('Circular Pattern', 'Repeat the body around an axis.', [
    OPEN_TOOL('Circular Pattern'), 'Choose the Reference axis and a point it passes through.', 'Set Instances and the Angular spacing.', APPLY,
  ]),
  'User Pattern': g('User Pattern', 'Copy the body to chosen positions.', [
    'In Sketch & 2D, place points where copies should go (relative to the sketch origin) — or type offsets instead.',
    OPEN_TOOL('User Pattern'), 'Choose Positions: the sketch points, or typed Offsets dx, dy, dz one per line.', APPLY,
  ]),
  Scaling: g('Scaling', 'Resize the body about a point, or along one axis.', [OPEN_TOOL('Scaling'), 'Enter the Ratio and the reference point (or the axis for an affinity).', APPLY]),
  'Insert Body': g('Insert Body', 'Start a new body or combine bodies.', [OPEN_TOOL('Insert Body'), 'Set the Polarity (Add or Remove material) that Assemble will use for this body later.', 'Click Insert body — new features now go into it.']),
  Add: g('Add', 'Fuse a body into a target body.', [OPEN_TOOL('Add'), 'Choose the Body and the target body to fuse it into.', APPLY]),
  Remove: g('Remove', 'Subtract a body from a target body.', [OPEN_TOOL('Remove'), 'Choose the Body to subtract and the target body.', APPLY]),
  Intersect: g('Intersect', 'Keep only the volume two bodies share.', [OPEN_TOOL('Intersect'), 'Choose the two bodies.', APPLY]),
  Assemble: g('Assemble', 'Fuse or subtract a body according to its polarity.', [OPEN_TOOL('Assemble'), 'Choose the Body and the target; the body’s polarity (set in Insert Body) decides add or remove.', APPLY]),
  'Remove Lump': g('Remove Lump', 'Keep only the largest piece of a body.', [OPEN_TOOL('Remove Lump'), 'Choose the Body.', APPLY]),
  'Reference Plane': g('Reference Plane', 'Create a plane the CATIA way: pick a Plane type, fill its fields, click Create.', [
    'Choose Reference Plane. Plane type (Properties tab) lists: Offset from plane, Parallel through point, Angle/Normal to plane, Through three points, Through two lines, Through point and line, Through planar curve, Normal to curve, Tangent to surface, Equation, Mean through points.',
    'Offset from plane: click one of the three planes, a Reference Plane or a flat face in the 3D view. Set the Offset distance (Flip for the other side; “Number of planes” makes several equally spaced).',
    'Parallel through point: choose the plane to stay parallel to, then the point (pick a Reference Point, type x, y, z, or click a point in the view).',
    'Angle/Normal to plane: choose the reference plane and a rotation axis lying in it (X, Y, Z, a Reference Axis or Reference Line), then the Angle — or tick Normal to plane for 90°.',
    'Through three points / point and line / two lines: give the points or lines; clicks in the view fill First, Second, Third point in turn. Collinear points and skew lines are refused with a message.',
    'Through planar curve: choose a kept sketch — the plane is that sketch’s plane. Normal to curve: choose the sketch, the curve and the position along it.',
    'Tangent to surface: click the part in the 3D view; the plane lies flat against the surface at that point.',
    'Equation: type A, B, C and D for A·x + B·y + C·z = D.  Mean through points: tick Reference Points and/or type three or more points (x, y, z; x, y, z; …).',
    'Click Create (or press Enter). Double-click the new plane to sketch on it; it can also be the reference for another plane, a point or a Rib.',
  ], ['Planes parallel to X, Y or Z behave exactly like Front, Top and Right; tilted ones are drawn from their own frame.', 'Sketches on other parallel planes are shown as dashed reflections while you draw (the Reflect toggle in the bottom bar).']),
  'Reference Axis': g('Reference Axis', 'A visual axis along X, Y or Z.', [OPEN_TOOL('Reference Axis'), 'Choose the axis and its Offset from the origin, then Create.']),
  'Coordinate System': g('Coordinate System', 'A local axis system for reference.', [OPEN_TOOL('Coordinate System'), 'Choose the direction and Offset, then Create.']),
  'Image to 3D': g('Image to 3D', 'Turn one picture into a 3D mesh, made entirely on this computer with Hunyuan3D 2.1 (best quality, slow) or TripoSR (fast draft), and add it to the model as a mesh body.', [
    'Click Image to 3D (AI GENERATE). A window opens, like Image to Sketch: the picture, cut-out and 3D result on the left, the options on the right.',
    '1 · Engine: choose Hunyuan3D 2.1 for the best result or TripoSR for a quick draft. Hunyuan3D needs a one-time setup (run setup_hunyuan3d.bat in the cad-server folder, then restart the backend); its model files download the first time you make a model. TripoSR needs its Python packages (requirements-triposr.txt) and a 1.7 GB weights download. The section tells you what is missing.',
    '2 · Quality mode starts you from a ready-made set: Quick draft, Balanced, Best detail, Smooth / organic (figures, toys), Hard-surface (parts with crisp edges) or 3D-print ready (one watertight piece). Any slider you move afterwards makes it Custom.',
    'Choose, drop or paste a picture — one object, clearly visible, ideally on a plain background. 3 · Picture: rotate or flip it, drag on it to crop to the object, set Object size, shrink or grow the Cut-out edge, fill holes in the cut-out, and even out lighting. Cut-out model picks how the object is separated from the background — Sharper edges or Finest detail help with hair, fur and busy backgrounds. The Cut-out view shows exactly what the engine will be given and stays live as you change these.',
    '4 · 3D model. TripoSR: Mesh resolution is the marching-cubes grid (higher is finer and slower); Surface level moves the surface; Memory use Low helps small GPUs. Hunyuan3D 2.1: Surface detail (256³–512³), Shape quality (steps), Follow the picture, Colour (paints PBR colours when the colour stage is installed, the slowest step), and GPU memory (automatic; Low memory streams the model from system RAM, so it works on small GPUs but takes many minutes). Press Generate 3D model; Stop cancels it and frees the GPU.',
    '5 · Mesh finishing works on the finished model instantly, with no new run: Smoothing rounds off the surface ripple (volume is kept), Keep sharp edges holds corners and creases, Loose pieces removes floating bits or keeps only the largest piece, Close holes makes the mesh watertight for printing, Mesh detail sets how many faces are kept.',
    '6 · Size & placement: set the Longest side (mm), which axis is up and the turn so the model stands the right way, and an X / Y / Z offset. Turn the 3D view with the Universal mouse scheme; switch between Colour, Clay and Wireframe.',
    'Press Add to model as a mesh body. It appears under MESH BODIES in the tree and in the 3D view. The STL, PLY, OBJ and GLB buttons download the model.',
  ], [
    'A mesh body is a triangle mesh, not a solid: Pad, Fillet and Boolean operations do not act on it, but Analyse, Machine and rendering do.',
    'The model tree shows whether the mesh is watertight; only a watertight mesh is safe to 3D print.',
    'Double-click a mesh body in the tree to hide or show it; Delete removes it (Ctrl+Z brings it back).',
    'Closing the window does not stop a model that is being made; open Image to 3D again to see it.',
    'Both engines guess the hidden side from the single picture. TripoSR works best with an NVIDIA GPU (on a CPU it takes minutes). Hunyuan3D 2.1 needs an NVIDIA GPU; below about 12 GB of video memory it is slow, but the result is the same.',
    'Hunyuan3D 2.1 is © Tencent and used under the Tencent Hunyuan 3D 2.1 Community License: it may not be used in the EU, UK or South Korea, and its output may not be used to train other AI models. faelyx.AI is not affiliated with Tencent.',
  ]),
  'Reference Point': g('Reference Point', 'A standalone 3D point, defined by a Point type.', [
    'Choose Reference Point and pick the Point type: Coordinates, On curve, On plane, On surface, Circle / sphere / ellipse center, Tangent on curve, Between, or Plane intersection.',
    'Coordinates: type X, Y, Z — or click the origin, a sketch corner, a centre or an end point in the 3D view and its coordinates fill in.',
    'On curve: choose a kept sketch, the curve in it and a position (0 = start, 1 = end).  Circle center: choose the sketch and the circle.',
    'On plane: choose a plane, then H and V — distances along the plane’s own horizontal and vertical axes from its origin.',
    'On surface: click the part in the 3D view.  Tangent on curve: choose the sketch, the curve and a direction; use Solution number if there are several tangent points.',
    'Between: give two points (Reference Points, typed or clicked) and a ratio — 0.5 is the middle.  Plane intersection: choose a line or axis and a plane.',
    'Click Create (or press Enter). The point appears in the tree and can be used for lines, planes and Rib paths.',
  ]),
  'Reference Line': g('Reference Line', 'A 3D line, defined by a Line type — between planes, from a curve, along a normal, or a bisector.', [
    'Choose Reference Line and pick the Line type: Point – Point, Point – Direction, Angle / Normal to curve, Tangent to curve, Normal to surface, Bisecting.',
    'Point – Point: click the first point in the 3D view (corners of sketches, the origin and reference points snap), then the second — Start and End markers and a dashed preview show the line before you create it. You can also pick Reference Points or type the coordinates.',
    'Point – Direction: one point, a direction (X, Y, Z or custom) and the Length (Mirrored extent runs it both ways).',
    'Angle / Normal to curve: choose a kept sketch, the curve and a point on it; the line leaves at the Angle you set to the curve’s tangent, in the sketch plane (90° = normal).  Tangent to curve: the same with the tangent itself.',
    'Normal to surface: click the part; the line starts there and runs along the surface normal.',
    'Bisecting: choose two lines that meet (axes, Reference Axes or Reference Lines); the line runs through where they meet, halfway between them. Tick Other bisector for the supplementary angle.',
    'Click Create (or press Enter). The line can be the center curve of a Rib or Slot.',
  ]),
  'Mass Properties': g('Mass Properties', 'Volume, surface area and bounding box.', [OPEN_TOOL('Mass Properties'), 'Click Run — the result appears below the button.']),
  'Interference Check': g('Interference Check', 'Find solids that do not touch.', [OPEN_TOOL('Interference Check'), 'Click Run to list disjoint solids in the active body.']),
  'Model Validation': g('Model Validation', 'Check the body is one watertight solid.', [OPEN_TOOL('Model Validation'), 'Click Run and read the verdict.']),
};

export const START_3D: Guide = g('Getting started in 3D Design', 'Build a part from sketches, then refine it.', [
  'Draw: switch to Sketch & 2D, pick a plane and sketch a profile. Leave the workbench — the sketch is kept automatically.',
  'Create: pick a feature (Pad, Shaft, Rib…) in the toolbox on the left. Its definition box opens in this pane.',
  'Refine: use the dress-up features (Fillet, Chamfer, Shell…) on picked faces or edges.',
  'Edit: click any feature in the model tree to change it and press Update.',
  'Navigate with the universal mouse scheme: middle button pans, middle + right drags to zoom or orbit, left click selects.',
], ['Pick any option in the toolbox and this section explains it step by step.']);

export function guide3D(spec: ToolSpec | undefined): Guide {
  if (!spec) return START_3D;
  const hand = GUIDES[spec.name];
  if (hand) return hand;
  if (spec.kind === 'unavailable') return g(spec.name, spec.description, [spec.reason ?? 'This option is not available yet.']);
  const steps: string[] = [];
  if (spec.sketch) steps.push(SKETCH);
  if (spec.edges) steps.push(PICK_EDGES);
  else if (spec.faces) steps.push(PICK_FACES);
  steps.push(OPEN_TOOL(spec.name), 'Fill in the options shown in the definition box.', APPLY);
  return g(spec.name, spec.description, steps);
}
