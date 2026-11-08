# Sketch: centre snap (0, 0) with lock constraint (2026-10-12)

The plane's centre (0, 0) — the point where the H and V axes meet — now attracts the cursor, dragged points and centred lines, on every plane (Front / Top / Right and every Reference Plane; a sketch is always drawn in plane-local coordinates, so the same test is the distance to the active plane's own origin).

Behaviour
- Reach: 10 screen pixels by default (zoom-aware, so it feels the same zoomed in or out). Change it in Sketcher options > CENTRE SNAP (0, 0) > "Snap distance (px, 0 = off)".
- Feedback: approaching the centre shows the H / V axes as a dashed crosshair through it and rings the snap reach; once within reach the origin lights up (red / yellow concentric rings, glow, "Origin (0, 0)" label). Same while dragging a point or a line whose midpoint comes near the centre, and while a line being drawn would be centred on it.
- Placing: any tool that places a point (Point, Line start / end, Circle centre, Rectangle corners, Polygon, Arc, Ellipse, ...) puts it exactly on (0, 0). The Point and Line tools reuse a point that already sits there.
- Constraints (Sketcher options > "Lock snapped points with a constraint", on by default): a point snapped onto the centre gets a Coincident constraint to the Origin, so it stays there after later edits. A line drawn so its end mirrors its start through the centre (midpoint on the origin) gets a Midpoint constraint with the Origin as centre. A drag that ends locked adds the same constraints (point -> Coincident, line -> Midpoint). Delete the constraint in the constraints list to free the point again.
- Dragging: while a selection is dragged, a moving point, or the midpoint of a moving line, that comes within reach is pulled exactly onto (0, 0).

Files (ai-engine/faelyx-ui/src): sketch/handlers/snapAndSelect.tsx (origin tolerance in px, snap resolution, lock bookkeeping), drawingTools.tsx (drag lock, line end/midpoint marking), canvasClick.tsx, viewAndAnnotations.tsx, views/CanvasStage.tsx (crosshair + rings), useSketchCore.tsx (props originSnapPx, originAutoConstrain), constants.ts, App.tsx (options + props).
Note: the constraints are the solver's existing coincident / midpoint types against its fixed Origin point, so no backend change. Universal mouse scheme untouched.
