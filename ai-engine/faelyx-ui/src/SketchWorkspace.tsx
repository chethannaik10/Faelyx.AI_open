// SketchWorkspace.tsx
//
// The "Sketch & 2D" tab. Previously this was just a label in the top
// nav that didn't render anything — sketch_solver.py's real constraint
// solver existed but had no UI calling it. This is that UI: a click-to-
// place 2D canvas (points/lines/circles), a constraint toolbox that
// mirrors the existing 3D toolbox's look, and a live DOF/status badge
// driven by an actual solve on the backend (POST /solve_sketch in
// cad_server.py), not a number the UI just displays.
//
// Entities are plain state (points/lines/circles). Constraints are also
// kept as plain state (type + the ids/values they apply to) so the
// *entire* sketch — including brand-new, not-yet-constrained entities —
// is resent to the backend on every solve. The backend rebuilds a fresh
// Sketch from that payload each time and returns solved positions; we
// merge those back into our points/circles. This matches how
// sketch_solver.py's own demo works: rough clicks first, exact
// dimensions after.

import { forwardRef } from 'react';
import { type ProfileLoop } from './profileLoops';
import type { Plane, SketchProjectData, SketchWorkspaceHandle } from './sketch/types';
import { PlanePicker } from './sketch/PlanePicker';

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
import { useSketchCore, type SketchWorkspaceProps } from './sketch/useSketchCore';
import { useSketchHandlers } from './sketch/handlers';
import { TreePanel } from './sketch/views/TreePanel';
import { ToolboxPanel } from './sketch/views/ToolboxPanel';
import { CanvasStage } from './sketch/views/CanvasStage';
import { BottomBar } from './sketch/views/BottomBar';
import { InspectorPanel } from './sketch/views/InspectorPanel';
import { ImageToSketchDialog } from './sketch/views/ImageToSketchDialog';
export type { Plane, SketchProjectData, SketchWorkspaceHandle, ProfileLoop };

// The "Sketch & 2D" workspace: its state and behaviour live in useSketchCore;
// this only lays out the panels (tree, toolbox, canvas, bottom bar, inspector).
const SketchWorkspace = forwardRef<SketchWorkspaceHandle, SketchWorkspaceProps>(function SketchWorkspace(props, ref) {
  const core = useSketchHandlers(useSketchCore(props, ref));
  const {
    arcs, choosePlane, circles, colWidths, constraints, curves, hidden, lines, plane, planePickerOpen, points, resizingCol, setPlanePickerOpen, sketchesRef, startColResize,
  } = core;
  return <main className="workspace-grid" style={hidden ? { display: 'none' } : { gridTemplateColumns: `${colWidths.col1}px 6px ${colWidths.col2}px 6px minmax(500px,1fr) 6px ${colWidths.col4}px` }}>
    <TreePanel core={core} />

    <div className={`col-resizer ${resizingCol === 'col1' ? 'col-resizer-active' : ''}`} onMouseDown={startColResize('col1')} aria-hidden="true" />
    <ToolboxPanel core={core} />

    <div className={`col-resizer ${resizingCol === 'col2' ? 'col-resizer-active' : ''}`} onMouseDown={startColResize('col2')} aria-hidden="true" />
    <section className="canvas-panel">
      <div className="model-viewport">
        <CanvasStage core={core} />
        <BottomBar core={core} />
        {planePickerOpen && <PlanePicker
          current={plane}
          onChoose={choosePlane}
          onClose={() => setPlanePickerOpen(false)}
          geometry={{ ...sketchesRef.current, [plane]: { points, lines, circles, arcs, curves, constraints } }}
        />}
      </div>
    </section>

    <div className={`col-resizer ${resizingCol === 'col4' ? 'col-resizer-active' : ''}`} onMouseDown={startColResize('col4')} aria-hidden="true" />
    <InspectorPanel core={core} />
    <ImageToSketchDialog core={core} />
  </main>;
});

export default SketchWorkspace;
