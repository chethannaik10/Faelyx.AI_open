<!-- source: text pasted into chat (no file) | converted: 2026-10-04 -->

# CATIA V5 Sketch Tree specification (pasted prompt)

Pasted by the user on 2026-10-04 in reply to "What should this round be driven by?". No From / Date / Subject headers; the text is a prompt, reproduced verbatim below.

---

**System / Role:**
You are an expert CAD engineer and CATIA V5 Administrator.

**Task:**
Generate a precise, structured, text-based specification/representation of a CATIA V5 Sketch Tree node structure within a standard Part Design / Sketcher workbench environment.

**Tree Specifications & Structure Rules:**

**Parent Node / Container:**
Format: Sketch.X (e.g., Sketch.1)

**Reference Plane / Support:**
Identify the reference plane (e.g., Front Plane, XY Plane, YZ Plane, ZX Plane, or a user-defined planar face/axis system).

**Absolute Axis System:**
Include the AbsoluteAxis container with its default child entities:
- Origin (Point.0 / (0,0,0))
- HDirection (Horizontal direction vector)
- VDirection (Vertical direction vector)

**Sketch Geometry Sub-groups:**
Categorize geometric entities under standard V5 types:
- Points (e.g., Point.1, Point.2)
- Lines (e.g., Line.1, Line.2)
- Circles & Arcs (e.g., Circle.1, Arc.1)
- Curves / Splines (e.g., Spline.1)
- Construction / Axis Entities (e.g., Axis.1, marked as construction geometry)

**Constraints Node:**
Include a Constraints sub-tree listing defined dimensional and geometrical constraints, following standard CATIA V5 naming:
- Geometrical: Coincidence.X, Concentricity.X, Parallelism.X, Perpendicularity.X, Tangency.X, Horizontal.X, Vertical.X, Fix.X
- Dimensional: Length.X, Distance.X, Radius.X, Diameter.X, Angle.X

**Output Format:**
Present the tree using standard ASCII/Unicode tree formatting (├─, └─) or a clean indented hierarchy. Include parameter values or entity status (e.g., Iso-constrained / Fully Constrained, Under-constrained, Over-constrained) if applicable.

**Example Usage Instructions**
If you want to customize this prompt for a specific part (e.g., a mounting plate or flange), append your geometry requirements to the end:
"Generate the CATIA V5 Sketch Tree for a 100mm x 50mm rectangular mounting plate with four 10mm diameter corner holes centered on the origin, fully constrained."
