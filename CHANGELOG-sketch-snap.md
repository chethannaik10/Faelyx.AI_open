# Sketch: snap to any curve (2026-10-12)

The sketch cursor now snaps onto every curve, not just points and straight lines, on every plane (Front / Top / Right and reference planes).

What it snaps to (nearest wins; crossings first, then quadrants, then "anywhere on the curve"):
- circles and arcs (anywhere on the circumference / swept part), ellipses, splines, conics, parabolas, hyperbolas
- crossings of any two entities (line x circle, arc x spline, ...), the 0/90/180/270 degree points of circles and arcs
- the sketch axes (H and V direction lines through the origin)
- sketches of other planes shown as "reflected" references (their lines, circles, arcs, end points and centres), incl. sketches on reference planes
- 3D Reference Points, Reference Lines and Reference Axes, projected onto the open plane, and the spot where a Reference Line crosses that plane

Where: the hover glyph shows what it found (label beside the cursor: On curve / On axis / Intersection / Quadrant / the reference's name). The Point and Line tools use it in their own priority order; every other placing tool (circle, arc, rectangle, polygon, ellipse, conic, spline, profile, slot, ...) has its click and rubber-band pulled onto it, and the grid no longer rounds a point that is already on a curve. Picking tools (select, trim, fillet, mirror, ...) are unchanged. The reach scales with zoom.

Files (ai-engine/faelyx-ui/src): NEW sketch/snapCurves.ts (geometry, no React); sketch/handlers/snapAndSelect.tsx, viewAndAnnotations.tsx, canvasClick.tsx, drawingTools.tsx; sketch/useSketchCore.tsx (new prop referenceGeometry); sketch/constants.ts (CURVE_SNAP_TOL); App.tsx (passes the reference geometry).
Note: a snapped point is placed exactly on the curve but no "point on curve" constraint is added (the solver has none), the same as the existing snap onto a line's edge. Universal mouse scheme untouched.
