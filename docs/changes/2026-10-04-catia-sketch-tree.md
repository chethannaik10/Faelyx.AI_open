# CATIA V5 sketch tree structure in the Sketch & 2D tree panel

Status: Awaiting approval  <!-- Awaiting approval | In progress | Done -->
Sources: docs/inputs/catia-sketch-tree-spec.md

Scope: the **SKETCH TREE** panel of the Sketch & 2D workspace in
`ai-engine/faelyx-ui` (`src/sketch/views/TreePanel.tsx`). The source is a
prompt describing a CATIA V5 sketch tree, not a list of changes; this list
reads it as "make the app's sketch tree follow that structure" (see A1).

What the panel does today: a hardcoded `Sketch.1` row, a `<Front|Top|Right> Plane`
row, `AbsoluteAxis` with selectable `Origin` / `HDirection` / `VDirection`,
five count rows ("3 points", "4 lines", …), and a flat `CONSTRAINTS (n)` list
using free-text labels built from internal ids (e.g. `Distance: p1–p2 = 100mm`).
The solver status (Fully / Under- / Over-constrained, DOF) is shown only in
the Inspector panel.

## Change requests

### 1. Parent node named `Sketch.X`
- [ ] Done
- **What:** The root row shows the live sketch's real number instead of the hardcoded `Sketch.1`: one more than the number of sketches already kept in 3D Design (`Sketch.1` with none kept, `Sketch.3` after two are kept).
- **Where:** Sketch & 2D → SKETCH TREE → `src/sketch/views/TreePanel.tsx` (root row); number passed down from `App.tsx` (`keptSketches`) through `SketchWorkspace.tsx`
- **Source:** `docs/inputs/catia-sketch-tree-spec.md`, "Parent Node / Container": "Format: Sketch.X (e.g., Sketch.1)"
- **Acceptance criteria:**
  - With no kept sketches the root reads `Sketch.1`.
  - After Keep Sketch in 3D Design, the tree's root reads `Sketch.2`, and the kept one is still `Sketch.1` in the 3D model tree.
- **Open questions:** A6
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 2. Support row shows the real reference plane or face
- [ ] Done
- **What:** The row under the root names the sketch's actual support: the sketch plane, a Reference Plane chosen as support, or the picked planar face (Sketch on Face). Today it always shows the sketch plane, even when a face or reference plane is the support.
- **Where:** `TreePanel.tsx` (plane row); support label from `App.tsx` (`sketchSupport`, `supportRef`, `currentSupportLabel`)
- **Source:** "Reference Plane / Support": "Identify the reference plane (e.g., Front Plane, XY Plane, YZ Plane, ZX Plane, or a user-defined planar face/axis system)."
- **Acceptance criteria:**
  - Sketch on the Front plane → the row names that plane (wording per A2).
  - With Sketch on Face active → the row says the support is a picked face.
  - With a Reference Plane selected as support → the row shows that plane's name.
- **Open questions:** A2
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 3. AbsoluteAxis children show their definition
- [ ] Done
- **What:** `AbsoluteAxis` and its three children already exist and are selectable. Add the detail the spec lists: Origin shows `(0,0,0)`, HDirection and VDirection show their direction vector in the sketch plane.
- **Where:** `TreePanel.tsx` (the three `tree-ref-row` buttons)
- **Source:** "Absolute Axis System": "Origin (Point.0 / (0,0,0)) · HDirection (Horizontal direction vector) · VDirection (Vertical direction vector)"
- **Acceptance criteria:**
  - Origin row shows `(0,0,0)`; HDirection and VDirection rows show a vector.
  - Clicking each row still selects it for constraints (existing e2e *distance from the sketch Origin via the tree* still passes).
- **Open questions:** A7
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 4. CATIA V5 names for sketch entities
- [ ] Done
- **What:** Every sketch entity gets a CATIA-style display name by type and number: `Point.N`, `Line.N`, `Circle.N`, `Arc.N`, `Spline.N` (and the other curve kinds, see A3), `Axis.N` for construction/axis lines. Internal ids (`p1`, `l3`, …) stay as they are; only the displayed name changes.
- **Where:** new naming helper in `src/sketch/` used by `TreePanel.tsx`; the existing `describeEntityId` / `showLabel` helpers
- **Source:** "Sketch Geometry Sub-groups": "Points (e.g., Point.1, Point.2) · Lines (e.g., Line.1, Line.2) · Circles & Arcs (e.g., Circle.1, Arc.1) · Curves / Splines (e.g., Spline.1) · Construction / Axis Entities (e.g., Axis.1 …)"
- **Acceptance criteria:**
  - A rectangle gives `Line.1`–`Line.4` and `Point.1`–`Point.4`; a circle added after gives `Circle.1`.
  - A construction axis is named `Axis.1`, not `Line.N`.
  - Unit tests cover the naming helper.
- **Open questions:** A3, A5
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 5. Geometry listed entity by entity, in type sub-groups
- [ ] Done
- **What:** Replace the five count rows with a Geometry section holding one sub-group per type — **Points**, **Lines**, **Circles & Arcs**, **Curves / Splines**, **Construction / Axis** — each listing its entities by the names from item 4. Construction entities are marked as construction. Clicking a row selects that entity on the canvas, and a selected entity is highlighted in the tree.
- **Where:** `TreePanel.tsx` (rows 42–46 today), `src/index.css` (tree rows)
- **Source:** "Sketch Geometry Sub-groups: Categorize geometric entities under standard V5 types"; "Construction / Axis Entities (e.g., Axis.1, marked as construction geometry)"
- **Acceptance criteria:**
  - A sketch with 4 lines and 1 circle shows a Lines group with four rows and a Circles & Arcs group with one row.
  - A construction line appears only under Construction / Axis, with a construction marker.
  - Clicking `Line.2` selects that line on the canvas.
  - Empty groups are not shown.
- **Open questions:** A8
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 6. Constraints listed with CATIA V5 names
- [ ] Done
- **What:** Each constraint is shown with a CATIA name numbered per type, followed by what it applies to and, for dimensional ones, its value: e.g. `Horizontal.1 (Line.1)`, `Coincidence.2 (Point.3, Point.5)`, `Radius.1 (Circle.1) = 5 mm`. Mapping from the app's constraint types: fixed → Fix, coincident → Coincidence, horizontal → Horizontal, vertical → Vertical, parallel → Parallelism, perpendicular → Perpendicularity, tangent* → Tangency, distance → Distance, radius → Radius, angle → Angle. The delete button on each row stays.
- **Where:** `TreePanel.tsx` (constraint rows), naming helper from item 4
- **Source:** "Constraints Node … Geometrical: Coincidence.X, Concentricity.X, Parallelism.X, Perpendicularity.X, Tangency.X, Horizontal.X, Vertical.X, Fix.X · Dimensional: Length.X, Distance.X, Radius.X, Diameter.X, Angle.X"
- **Acceptance criteria:**
  - The Load example sketch lists `Fix.1`, `Horizontal.1`–`.2`, `Vertical.1`–`.2`, `Distance.N` and `Radius.N` rows with values.
  - Removing a constraint from the tree still works.
  - Unit tests cover the type → name mapping.
- **Open questions:** A4
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 7. Constraints split into Geometrical and Dimensional
- [ ] Done
- **What:** The Constraints node gets two sub-groups, **Geometrical** and **Dimensional**, each with its count.
- **Where:** `TreePanel.tsx`
- **Source:** "Include a Constraints sub-tree listing defined dimensional and geometrical constraints"
- **Acceptance criteria:** Horizontal/Vertical/Fix rows sit under Geometrical; Distance/Radius/Angle rows sit under Dimensional; counts match.
- **Open questions:** none
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 8. Constraint status on the sketch node
- [ ] Done
- **What:** The root `Sketch.X` row carries the solver status that the Inspector already has (`status`, `dof`): fully constrained, under-constrained (with DOF) or over-constrained. Nothing shown for an empty sketch.
- **Where:** `TreePanel.tsx` root row; `status` / `dof` / `dofClass` from `useSketchCore.tsx`
- **Source:** "Include parameter values or entity status (e.g., Iso-constrained / Fully Constrained, Under-constrained, Over-constrained) if applicable."
- **Acceptance criteria:**
  - A lone unconstrained line shows under-constrained with its DOF.
  - The Load example sketch, once solved, shows the same status as the Inspector.
- **Open questions:** A9
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 9. Copy the tree as text
- [ ] Done
- **What:** A **Copy as text** button in the tree footer puts the whole tree on the clipboard as an indented `├─` / `└─` text tree (same nodes, names, values and status as the panel).
- **Where:** `TreePanel.tsx` footer; pure formatter in `src/sketch/` with unit tests
- **Source:** "Output Format: Present the tree using standard ASCII/Unicode tree formatting (├─, └─) or a clean indented hierarchy."
- **Acceptance criteria:**
  - The formatter's output for a known sketch matches an expected text tree in a unit test.
  - Clicking the button copies that text.
- **Open questions:** A1
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

## Ambiguities and conflicts
- **A1.** The source is a prompt that asks for a *text* tree, not a change to the app. Affects: all, and #9 in particular. Options: **(a)** change the app's SKETCH TREE panel to this structure, items 1–8 (my reading) / **(b)** as (a) plus the text export, item 9 / **(c)** no code change: you only wanted the text tree written out for a specific part (e.g. the 100 × 50 plate with four Ø10 holes in the example).
- **A2.** Plane wording. The app calls the planes Front (XZ), Top (XY), Right (YZ); the spec lists "Front Plane, XY Plane, YZ Plane, ZX Plane". Affects: #2. Options: **(a)** keep `Front Plane` / **(b)** CATIA names `zx plane` / `xy plane` / `yz plane` / **(c)** both, `Front Plane (ZX)`.
- **A3.** Curve kinds the spec doesn't name. The app has ellipse, elliptical arc, parabola, hyperbola, conic and two spline kinds; the spec only gives `Spline.1`. Affects: #4. Options: **(a)** `Ellipse.N`, `Parabola.N`, `Hyperbola.N`, `Conic.N`, `Spline.N` (CATIA's own names) / **(b)** everything under `Spline.N`.
- **A4.** Constraint types that don't line up. Affects: #6.
  - In the spec but not in the app: **Concentricity**, **Length**, **Diameter**. Options: **(a)** names only, no new constraint tools: a coincidence between two circle/arc centres is shown as `Concentricity.N`, a distance between one line's two endpoints as `Length.N`, and `Diameter.N` is not produced / **(b)** also add new Concentric and Diameter constraint tools (new solver work, a separate larger item).
  - In the app but not in the spec: Equal, Symmetric, Midpoint, point-to-line distance, and the constraints the Chamfer tool creates. Options: **(a)** CATIA-style names `Equidistance.N`, `Symmetry.N`, `Midpoint.N`, `Distance.N` / **(b)** keep their current labels.
- **A5.** Numbering after a delete. Affects: #4, #6. Options: **(a)** numbers follow current order, so deleting `Line.2` renames `Line.3` to `Line.2`; no change to saved projects / **(b)** stable numbers as in CATIA, never reused; needs a name stored on each entity and in saved projects.
- **A6.** Live sketch number. Affects: #1. Options: **(a)** kept-sketch count + 1 / **(b)** always `Sketch.1` for the live sketch (no change).
- **A7.** `Point.0` wording. The spec writes "Origin (Point.0 / (0,0,0))". Affects: #3. Options: **(a)** `Origin (0,0,0)` / **(b)** `Origin — Point.0 (0,0,0)`.
- **A8.** Tree length. Every line endpoint and circle centre is a point, so a modest sketch lists dozens of `Point.N` rows. Affects: #5. Suggestion: make each sub-group collapsible, with Points collapsed by default. Options: **(a)** collapsible, Points collapsed / **(b)** everything always expanded.
- **A9.** Status wording. The solver says "Fully constrained"; CATIA says "Iso-constrained". Affects: #8. Options: **(a)** keep the app's wording / **(b)** `Iso-constrained`, in the tree only / **(c)** `Iso-constrained` in the tree and the Inspector.
- **Note.** Four Sketch & 2D e2e tests were already failing before the last round (chamfer dimension double-click, circle-centre delete, Exit Plane axes, plane-picker label position; see the 2026-09-29 log). They are not part of this list; I will report them separately from any new failures.

## Log
- 2026-10-04: Pasted prompt saved to `docs/inputs/catia-sketch-tree-spec.md`. List created from it; awaiting approval.
