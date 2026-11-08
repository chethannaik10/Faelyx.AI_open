# Sketch workflow loop and primary planes in 3D Design

Status: In progress  <!-- Awaiting approval | In progress | Done -->
Sources: docs/inputs/sketch-workflow-3d-planes.md

Scope: `ai-engine/faelyx-ui` — `src/StlViewport.tsx` (3D viewport),
`src/App.tsx` (workspace switch, save, tree, view cube), `src/partDesign.ts`
(feature ↔ sketch link), `src/sketch/` (loading a sketch for editing),
`src/index.css`. No backend change expected.

What the app does today:
- The 3D viewport draws a 400 mm grid and user-made Reference Planes (70 mm
  teal squares). The three primary planes are **not drawn**.
- Sketch & 2D colours the planes Top `#3f6fc9`, Front `#6a4bc2`,
  Right `#8a4fa8` (`sketch/PlanePicker.tsx:68`).
- **Exit Workbench** switches to 3D Design and does nothing else
  (`App.tsx:1484`). Saving is the Save button, plus an autosave that is off
  until the project has been saved once. An unnamed project asks for a name
  in a prompt.
- The sketcher holds one live sketch per plane. A Pad/Pocket/etc. **copies**
  the profile into the feature and clears the canvas; the feature keeps no
  link to a sketch. `Sketch.N` (Keep Sketch) stores traced outlines only, not
  the editable 2D data (points, constraints).
- Double-click does nothing in the 3D viewport.
- 3D Design has no undo. The toolbar Undo/Redo buttons drive the sketcher's
  history only. A change that fails to build is rejected and never lands.
- The view cube is a CSS cube with TOP / FRONT / RIGHT faces and two rotate
  arrows (`App.tsx:329`). There is no control called "View Settings".

## Change requests

### 1. Primary planes always drawn in 3D Design
- [x] Done
- **What:** The Front (XZ), Top (XY) and Right (YZ) planes are drawn at the origin in the 3D viewport whenever 3D Design is open, with or without a part.
- **Where:** 3D Design → viewport → `StlViewport.tsx` (new plane group)
- **Source:** §1: "Make the 3 Primary Axis Planes (Front, Top, Right) permanently visible when in the "3D Design" workspace"
- **Acceptance criteria:**
  - A new project shows three planes at the origin in 3D Design.
  - They are still shown after a Pad, and after Open of a saved project.
  - Fit all and face picking on the part behave as before.
- **Open questions:** C3
- **Files touched:** `src/StlViewport.tsx` (planes group, `showPlanes`), `src/App.tsx`, `tests/e2e/sketch-transfer.spec.ts` (added a planes check after Open). Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e: three planes in a new project, still three after a Pad and after Open of a saved project (check added 2026-10-05); face-picking e2e tests (Edge Fillet on a picked face, Sketch on Face) still pass. Screenshot `test-results/planes-with-part.png` viewed.

### 2. Primary planes are compact
- [x] Done
- **What:** The planes are drawn small relative to the model space (size per C2): a thin outline with a faint fill and a short name label, not a full-viewport sheet.
- **Where:** `StlViewport.tsx`
- **Source:** §1: "Scale down the default visual representation of these planes so they appear compact and non-obtrusive relative to the main viewport model space"
- **Acceptance criteria:**
  - Plane edge length equals the value chosen in C2.
  - With a 100 × 50 × 20 part loaded, the part is not hidden behind plane fills (screenshot check).
- **Open questions:** C2
- **Files touched:** `src/partDesign.ts` (`PRIMARY_PLANE_SIZE_MM`), `src/StlViewport.tsx`. Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). Probe and unit test report 50 mm; in `test-results/planes-with-part.png` the 100 × 50 × 20 part is not hidden by the plane fills.

### 3. Plane colours match Sketch & 2D
- [x] Done
- **What:** The 3D planes use the Sketch & 2D plane colours (Top `#3f6fc9`, Front `#6a4bc2`, Right `#8a4fa8`), taken from one shared constant so the two can't drift.
- **Where:** `sketch/PlanePicker.tsx` (`PLANE_FILL` → shared), `StlViewport.tsx`
- **Source:** §2c: "Render all 3 axis planes using the same refined color palette/color-grade as seen in the 2D Sketch environment"
- **Acceptance criteria:** Each 3D plane's colour equals the plane picker's colour for the same plane (unit test on the shared constant; screenshot side by side).
- **Open questions:** none
- **Files touched:** `src/sketch/constants.ts` (`PLANE_COLORS`), `src/sketch/PlanePicker.tsx`, `src/StlViewport.tsx`. Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). Unit "use the Sketch & 2D plane colours and are 50 mm squares"; e2e compares the 3D plane colours with the plane picker's swatches.

### 4. Show/hide planes toggle
- [x] Done
- **What:** A "Show planes" toggle in View Settings shows or hides the primary planes in 3D Design. Default on.
- **Where:** 3D Design → View Settings (location per C4) → `App.tsx`, `StlViewport.tsx`
- **Source:** §5: "Add a UI toggle in View Settings to show/hide plane visuals on demand in 3D mode"
- **Acceptance criteria:**
  - Toggling off removes the three planes from the viewport; toggling on brings them back.
  - The setting survives switching to Sketch & 2D and back.
- **Open questions:** C3, C4
- **Files touched:** `src/App.tsx` (View settings popover, `faelyx-show-planes` in localStorage), `src/index.css`. Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e: toggle off → 0 planes, still off after a workspace switch and a reload; on → 3.

### 5. Exit Workbench saves automatically
- [x] Done
- **What:** Clicking Exit Workbench saves the project (sketch and 3D state) without a prompt, then shows 3D Design.
- **Where:** Sketch & 2D → Exit Workbench → `App.tsx` (`onExitWorkbench`, `saveProject`)
- **Source:** §2a–b: "Automatically auto-save all active sketch changes. Transition the viewport seamlessly to the "3D Design" workspace"
- **Acceptance criteria:**
  - In a named project, draw a line and click Exit Workbench → one save request is sent containing the line; 3D Design is active; the save badge reads Saved.
  - A failed save (server down) still switches to 3D Design and shows the unsaved badge and an error.
- **Open questions:** C5
- **Files touched:** `src/App.tsx` (`exitSketch`, save). Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e "Exit Workbench saves a named project once; a failed save still switches and says so": exactly one POST containing the sketch, badge Synced; aborted save → 3D Design, "Could not save", Unsaved.

### 6. Double-click a primary plane to sketch on it
- [x] Done
- **What:** Double-clicking the Front, Top or Right plane in the 3D viewport opens Sketch & 2D with that plane active.
- **Where:** `StlViewport.tsx` (double-click pick), `App.tsx`, sketcher handle (`choosePlane` exposed)
- **Source:** §3: "Double-clicking directly on any axis plane … in the 3D viewport should immediately open that plane/sketch inside the "Sketch & 2D" workbench"
- **Acceptance criteria:**
  - Double-click the Top plane → Sketch & 2D is active and the plane switcher reads Top.
  - A single click, or a drag to orbit, does not switch workspace.
- **Open questions:** C6, C7
- **Files touched:** `src/StlViewport.tsx` (double-click pick), `src/App.tsx` (`sketchOnPlane`), `tests/e2e/sketch-transfer.spec.ts` (added a drag check). Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e: double-click Top and Right in Select mode open Sketch & 2D on that plane; a double-click in Orbit mode, a single click and a drag starting on the plane (check added 2026-10-05) do not.

### 7. Double-click an existing sketch to edit it
- [x] Done
- **What:** Double-clicking a sketch's wireframe in the 3D viewport (or its `Sketch.N` row in the tree) opens that sketch in Sketch & 2D with its geometry and constraints, on its own plane. Requires each `Sketch.N` to store its editable 2D data.
- **Where:** `StlViewport.tsx` (pick), `App.tsx` (`KeptSketch` gains the 2D data), `sketch/useSketchCore.tsx` (load a sketch for editing), `partDesign.ts`
- **Source:** §3: "(or an existing sketch on that plane)"
- **Acceptance criteria:**
  - Keep a rectangle with a distance constraint as `Sketch.1`, double-click it in 3D → Sketch & 2D shows the rectangle and the constraint, on the same plane.
  - Save, reload, Open → the same still works.
- **Open questions:** C1, C6, C7
- **Files touched:** `src/App.tsx` (`editSketch`, `KeptSketch.data`), `src/sketch/useSketchCore.tsx` (`openSketch`), `src/StlViewport.tsx`. Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e: double-click the wireframe → Sketch.1 open on Top with its 40 × 30 rectangle and constraints; tree-row double-click works after Save → reload → Open.

### 8. Features stay linked to their sketch and rebuild on exit
- [x] Done
- **What:** A sketch-based feature records which `Sketch.N` it was built from. After that sketch is edited, Exit Workbench updates the sketch, re-derives the profile of every feature built from it, rebuilds the part, saves (item 5) and shows 3D Design.
- **Where:** `App.tsx` (`AppFeature` gains a sketch id; exit handler; `rebuildFromFeatures`), `partDesign.ts`
- **Source:** §3: "Modifying a sketch and clicking "Exit Workbench" must automatically auto-save, update all dependent 3D features/geometry in real time, and return the view to "3D Design""; Key additions: "re-calculate downstream 3D operations (extrusions, cuts) whenever the underlying 2D sketch auto-updates"
- **Acceptance criteria:**
  - Pad a 40 × 30 rectangle 20 mm (24,000 mm³). Edit its sketch to 50 × 30, Exit Workbench → volume 30,000 mm³ with no other click, and still one Pad in the tree.
  - A Pocket built from a second sketch on that Pad still rebuilds after the first sketch changes.
  - A project saved before this change opens and builds the same solid.
- **Open questions:** C1, C6, C8, C12
- **Files touched:** `src/App.tsx` (`AppFeature.sketchId`, exit rebuild), `src/partDesign.ts` (`featureSketchIds`, relinking). Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e "edit loop…": 40 → 50 wide gives 50 × 30 × 20 minus the pocket with one Pad in the tree and the second-sketch Pocket rebuilt; "a project saved before this change … rebuilds exactly as before" passes; 6 unit tests under "features stay linked to their sketch".

### 9. Undo / Revert in 3D Design
- [x] Done
- **What:** 3D Design gets an undo/redo stack of its state (features, sketches, modifiers, bodies). An automatic sketch update from item 8 is one undo step, so a change that breaks a downstream feature can be stepped back.
- **Where:** `App.tsx` (3D history; toolbar Undo/Redo when 3D Design is active)
- **Source:** §5: "Ensure non-destructive auto-saving with an optional "Undo/Revert" stack so users can step back if an auto-saved change breaks a downstream 3D feature"
- **Acceptance criteria:**
  - After item 8's edit (30,000 mm³), Undo in 3D Design returns the part to 24,000 mm³ and the sketch to 40 × 30; Redo restores 30,000 mm³.
  - Undo in Sketch & 2D still undoes sketch steps as today.
- **Open questions:** C8, C9
- **Files touched:** `src/App.tsx` (3D history, toolbar Undo/Redo, Ctrl+Z / Ctrl+Y). Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e: Undo returns the part and the sketch to 40 wide, Ctrl+Y redoes; a breaking edit is kept with the error and Undo steps back; Sketch & 2D Ctrl+Z / Ctrl+Y tests still pass.

### 10. Changing a sketch's plane moves its features
- [x] Done
- **What:** When a sketch's plane changes, the features built from it rebuild on the new plane.
- **Where:** `App.tsx`, `partDesign.ts`
- **Source:** §5: "Maintain parametric parent-child relationships so editing a sketch plane automatically propagates to linked 3D operations (Pad, Pocket, Shaft, etc.)"
- **Acceptance criteria:** _(depends on C10)_
- **Open questions:** C10 — not implementable until answered
- **Files touched:** `src/App.tsx` (`changeSketchSupport`), `src/PartDesignPanel.tsx`, `src/partDesign.ts`. Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e "Change sketch support…": Front → Top at 10 mm gives normal [0,0,1], origin [0,0,10], bounding box 40 × 30 × 20; unit "a sketch moved to another plane takes the feature with it".

### 11. Orientation cube redesign
- [ ] Done
- **What:** Restyle the top-right view cube: smaller footprint, hover transitions on faces and arrows, cleaner type, and a subtle highlight on the active face. Behaviour (click a face for that view, arrows rotate 45°) unchanged.
- **Where:** 3D Design → viewport top-right → `App.tsx` (`ViewCube`), `index.css` (`.view-cube*`)
- **Source:** §4: "Redesign the top-right plane reference indicator / orientation view cube to be sleek, modern, and compact. Include smooth hover states, clean typography, and subtle visual highlighting for active plane selections"
- **Acceptance criteria:**
  - The cube's on-screen box is smaller than today's (measured before/after).
  - Hovering a face changes its style with a transition; the face matching the current view is highlighted.
  - Clicking TOP / FRONT / RIGHT and the arrows still changes the view (existing behaviour).
  - Before/after screenshots shown to you for sign-off.
- **Open questions:** C11
- **Files touched:** `src/App.tsx` (`ViewCube`), `src/index.css` (`.view-cube*`). Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Behaviour verified 2026-10-05 (e2e "orientation cube…": box 62 × 69 px against 75 × 99.5 before, hover transition, active face, faces and arrows still set the view). **Not ticked: the last criterion is your sign-off** on the look — after screenshot at `ai-engine/faelyx-ui/test-results/view-cube-after.png`; no "before" screenshot was kept.

## Ambiguities and conflicts
- **C1.** Overlap and conflict with `docs/changes/2026-10-04-sketch-to-3d-auto-transfer.md` (awaiting approval, pasted earlier today; this spec looks like the later one).
  - Both redefine Exit Workbench. The earlier one says exit *keeps the sketch as `Sketch.N`*; this one says exit *saves and updates dependent features* and doesn't mention keeping.
  - This spec's "existing sketch" in 3D (item 7) needs sketches drawn in the 3D viewport, which is the earlier list's items 2, 3 and 6.
  - This spec answers the earlier B1 only by implication (sketches must persist and be linked, so features build from a `Sketch.N`, not from a canvas that is then cleared), and it turns the earlier B6 "follow the plane" into a requirement (item 10).
  - The earlier note said re-opening a kept sketch for editing was not requested; it now is (item 7).
  - Options: **(a)** do both lists as one, in this order: earlier 1–6, then this list; exit = keep/update the sketch, rebuild, save, switch / **(b)** this list replaces the earlier one; I move the earlier items it needs (2, 3, 6) into this list and drop the rest / **(c)** something else.
- **C2.** Plane size. The grid is 400 mm and Reference Planes are 70 mm. Affects: #2. Options: **(a)** fixed 50 mm squares / **(b)** another size you give / **(c)** a constant size on screen regardless of zoom.
- **C3.** "Permanently visible" (§1) versus a show/hide toggle (§5), both in the same source. Affects: #1, #4. My reading: on by default, hidden only by the toggle. Is the toggle remembered **(a)** for this browser / **(b)** in the saved project / **(c)** not at all (resets to on)?
- **C4.** There is no "View Settings" in the app. Affects: #4. Options: **(a)** a small View settings popover on the viewport's top-right grid button, which does nothing today / **(b)** a toggle button in the bottom navigation bar next to Compass.
- **C5.** Saving on exit. Affects: #5.
  - An unnamed project makes Save open a "Project name?" prompt, which is not automatic. Options: **(a)** save silently only when the project has a name; otherwise switch and leave it marked unsaved / **(b)** save under an automatic name such as `Untitled` / **(c)** show the prompt.
  - Should exit save even when the user has not turned autosave on? **(a)** yes, always / **(b)** only when autosave is on.
- **C6.** What "an existing sketch" covers. The canvas is cleared when a feature is built and old features hold only a traced outline. Affects: #6, #7, #8. Options: **(a)** every `Sketch.N` stores its full 2D data from now on and is editable; sketches and features from projects saved before this change stay non-editable (their outline can't be turned back into constraints) / **(b)** as (a), plus old outlines are imported as unconstrained geometry so they can be edited.
  - Double-clicking a *plane* that already has sketches: **(a)** always starts a new sketch on it / **(b)** opens the most recent sketch on that plane.
- **C7.** Double-click precedence when a sketch, the part and a plane are under the cursor. Affects: #6, #7. Suggestion: sketch wireframe first, then plane, and only in Select mode. OK?
- **C8.** A sketch edit that makes a downstream feature fail to build. Today any change that doesn't build is rejected. Affects: #8, #9. Options: **(a)** keep the edited sketch, show the backend error, keep the last good solid on screen, and offer Undo / **(b)** automatically revert the sketch to its last good state and show the error / **(c)** stay in Sketch & 2D with the error until the sketch builds.
- **C9.** Undo scope and what "optional" means. Affects: #9. Options: **(a)** full 3D undo/redo for every 3D action, on the toolbar buttons and Ctrl+Z / Ctrl+Y while 3D Design is active, kept for the session only / **(b)** only a "Revert last sketch update" action. Should the history survive a reload?
- **C10.** "Editing a sketch plane". Reference Planes can't be edited after creation today, and a sketch can't be moved to another plane. Affects: #10. Which is meant? **(a)** moving a sketch to a different plane or offset, with its features following (new "Change sketch support" action) / **(b)** making Reference Planes editable, with sketches and features on them following / **(c)** both / **(d)** nothing new: it only restates item 8.
- **C11.** Cube design. No mockup or reference was given, and "plane reference indicator" could also mean the plane switcher in the Sketch & 2D canvas (`CanvasStage.tsx:44`). Affects: #11. Options: **(a)** restyle the 3D view cube only, to my design, with before/after screenshots for your sign-off / **(b)** also restyle the 2D plane switcher / **(c)** you send a reference image first. Should the cube's faces use the plane colours from item 3?
- **C12.** "In real time". The part is rebuilt by the backend when Exit Workbench is clicked, not continuously while drawing. Affects: #8. Is rebuild-on-exit what you mean? **(a)** yes / **(b)** rebuild live while sketching (much heavier; a separate item).
- **Note.** `docs/changes/2026-10-04-catia-sketch-tree.md` is also still awaiting approval; it doesn't conflict with this list.
- **Note.** Four Sketch & 2D e2e tests were already failing before this work (see the 2026-09-29 log); they will be reported separately from any new failures.

## Decisions (2026-10-04)
User replied "ok" to the suggested options.
- C1 → (a) both lists as one: the auto-transfer list's items 1–6 first, then this list.
- C2 → (a) fixed 50 mm squares.
- C3 → on by default; toggle remembered for this browser.
- C4 → (a) View settings popover on the viewport's top-right grid button.
- C5 → save silently only when the project has a name; save on exit even when autosave is off.
- C6 → (a) every `Sketch.N` stores its full 2D data from now on; older ones stay non-editable. Double-clicking a plane starts a new sketch.
- C7 → sketch wireframe first, then plane, Select mode only.
- C8 → (a) keep the edit, show the error, keep the last good solid, offer Undo.
- C9 → (a) full 3D undo/redo, session only.
- C10 → (a) "Change sketch support" action; features follow.
- C11 → (a) restyle the 3D view cube only, faces in the plane colours, screenshots for sign-off.
- C12 → (a) rebuild on Exit Workbench.
- The sketch-tree list (`2026-10-04-catia-sketch-tree.md`) was not mentioned in the approval and stays awaiting approval.

## Log
- 2026-10-04: Pasted prompt saved to `docs/inputs/sketch-workflow-3d-planes.md`. List created from it; awaiting approval.
- 2026-10-04: Approved by user with the decisions above. Status → In progress.
- 2026-10-05: Session resumed. The code for all eleven items was already in place from 2026-10-04 but nothing had been verified or ticked.
- 2026-10-05: Ran typecheck (clean), unit tests (55/55) and the full e2e suite (76/80; the 4 failures are the pre-existing ones). Added two e2e checks (planes still drawn after Open; a drag on a plane does not open the sketcher); sketch-transfer spec 12/12. Items 1–10 ticked. Item 11 works but waits for the user's sign-off on the cube's look.
- 2026-10-05: Seen in `test-results/planes-with-part.png`, not fixed (outside these items): the viewport draws the model Y-up (a Top-plane pad stands upright, Front lies in the grid) while the corner triad shows Z up; and at ~916 px viewport width the bottom hint text runs under the navigation bar. Raised with the user (E2 in `2026-10-05-view-menu-plane-offset.md`).
