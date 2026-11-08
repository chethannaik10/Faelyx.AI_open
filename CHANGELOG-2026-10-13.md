# 2026-10-13 — MODIFY tools in the Sketch Toolbox

MODIFY now has eight tools: Fillet, Chamfer, Trim (unchanged) plus **Mirror, Translate, Rotate, Offset, Project 3D Element**.
The Universal mouse scheme is untouched (LMB select / box select, MMB pan, MMB+RMB zoom/orbit).

## Behaviour
- **Mirror** – pick elements (or start with a selection), then click a sketch line, construction axis, or the H/V origin axis. *Associative*: every mirrored point gets a Symmetry constraint (circles get Equal radius); *Independent*: plain copies. Points on the axis are shared; constraints between the picked elements are copied (Horizontal/Vertical swap correctly for non-horizontal axes). Dashed live preview.
- **Translate** – ΔH/ΔV or distance + angle, or click start/end points. Move or keep a copy (with a copy count). Internal dimensions/constraints are preserved; a Fixed point is re-pinned at its new place.
- **Rotate** – click a centre, then cursor-follow (whole degrees) or type an angle (counter-clockwise positive). Move or keep copies (N copies, each a further step). A rotation swaps Horizontal↔Vertical on a quarter turn and releases H/V/Angle constraints that cannot hold at other angles (a note says how many). The rectangle's centre marker travels with the shape.
- **Offset** – picks a connected / tangent chain or a single element (lines, arcs, circles, ellipses/splines); side by clicking, or both sides; corners Sharp / Round / Chained; trims or extends at joints. *Linked* offsets are rebuilt when the source changes, and the distance/corner mode can be edited later in the tool card or the Inspector; *Independent* gives plain geometry.
- **Project 3D Element** – edge/curve, face boundary or vertex of the model (STL solid + Reference Points/Lines) projected onto the active sketch plane as yellow, locked reference geometry. Re-projected when the model changes; turns red if its source disappears; "release" converts it to construction geometry.

## Solver
Client-only records (`offset_link`, `projection`) are never sent to `/solve_sketch`; projected points are sent as Fixed. No backend change.

## Files
New: `src/modelGeometry.ts`, `src/sketch/modify.ts`, `src/sketch/handlers/modifyTools.tsx`, `src/sketch/views/ModifyCard.tsx`, `src/sketch/views/LinkedGroupPanel.tsx`.
Edited: `App.tsx`, `index.css`, `sketch/{types,tools,useSketchCore,howTo2D}.ts(x)`, `sketch/handlers/{canvasClick,drawingTools,index}`, `sketch/views/{CanvasStage,ToolCard,InspectorPanel}.tsx`.

## Verified
- 46 unit checks on the pure logic (`modify.ts`); type-check shows no new errors.
- Live in the browser: Mirror (assoc.), Translate (copy), Rotate (move + copy), Offset (linked), Project 3D Element (reference line), Undo through each, console clean.
- A captured mirror payload solves correctly in the real `sketch_solver.py` (mirrored points exactly symmetric about the axis).

## Not verified
- cad_server.py was offline on this PC, so live solving of the new constraints was checked against the solver offline, not through the running app.
- Project 3D was tested against a Reference Line and a synthetic cube, not a solid built by the backend.
