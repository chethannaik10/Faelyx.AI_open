# Automatic sketch-to-3D transfer on exiting Sketch & 2D

Status: Done  <!-- Awaiting approval | In progress | Done -->
Sources: docs/inputs/sketch-to-3d-auto-transfer.md

Scope: `ai-engine/faelyx-ui` — `src/App.tsx` (workspace switch, Keep Sketch,
model tree), `src/StlViewport.tsx` (3D viewport), `src/partDesign.ts`
(sketch-based tools). No backend change expected.

What the app does today:
- **Exit Workbench** in Sketch & 2D already switches to 3D Design
  (`App.tsx:1484`). It transfers nothing.
- The *live* sketch is already drawn in the 3D viewport as a purple outline on
  its own plane, flush with it (`StlViewport.tsx:478`).
- **Keep Sketch** is a manual 3D Design tool. It stores the live sketch as
  `Sketch.N` with its plane frame and **clears the 2D canvas**
  (`App.tsx:954`). Kept sketches are listed under a separate SKETCHES heading
  in the tree and are **not drawn** in the 3D viewport.
- Pad, Pocket, Shaft, Groove, Hole and Stiffener read the **live** sketch
  only. Kept sketches are used only as a Rib/Slot center curve and as
  Multi-sections sections.

## Change requests

### 1. Exit Workbench keeps the sketch automatically
- [x] Done
- **What:** Leaving Sketch & 2D stores the current sketch as the next `Sketch.N` (closed profiles and/or open chain, with the frame of its support: Front, Top, Right, a Reference Plane, or a picked face) and switches to 3D Design, with no prompt. An empty sketch just switches.
- **Where:** Sketch & 2D → Exit Workbench → `App.tsx` (`onExitWorkbench`, `keepSketch`); possibly the workspace nav buttons (B2)
- **Source:** §1: "When the user exits the "Sketch & 2D" workbench, automatically switch the active view/tab to the "3D Design" workspace"; "carry all active or newly created sketch profiles (from Front, Top, Right, or custom reference planes) … without requiring manual export or confirmation"
- **Acceptance criteria:**
  - Draw a rectangle on Front, click Exit Workbench → 3D Design is active and the tree has `Sketch.1`; no dialog appeared.
  - Same on Top, on Right and with a Reference Plane as support → the kept sketch's frame matches that support.
  - Exit Workbench with an empty canvas → 3D Design is active, no new sketch.
  - Exiting twice without changing the sketch does not create a duplicate.
- **Open questions:** B1, B2, B3
- **Files touched:** `src/App.tsx` (`exitSketch`), `src/sketch/useSketchCore.tsx`, `src/sketch/types.ts`, `tests/e2e/sketch-transfer.spec.ts`. Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e "Exit Workbench keeps the sketch as Sketch.1 with no prompt; an empty exit adds nothing" (Front, no dialog, empty exit, no duplicate via the tab), "sketches from Top, Right and a Reference Plane land on that support" (Reference Plane reached through the Sketch support field, the only route under B1 a), "a sketch that is only points is not carried over" (B3).

### 2. Kept sketches drawn in the 3D viewport
- [x] Done
- **What:** Every kept sketch is drawn in the 3D viewport as a wireframe on its own plane frame (closed loops and open chains), and disappears when the sketch is deleted from the tree.
- **Where:** 3D Design → viewport → `StlViewport.tsx` (new prop for kept sketches), `App.tsx` `ModelViewport`
- **Source:** §2: "Render the transferred sketch curves directly in the 3D Design viewport as 3D visual wireframe profiles ("kept sketches")"
- **Acceptance criteria:**
  - Two sketches kept on Front and Top both show in the viewport, each on its plane.
  - Deleting `Sketch.1` from the tree removes its wireframe.
  - A project saved with kept sketches shows them again after Open.
- **Open questions:** none
- **Files touched:** `src/StlViewport.tsx` (`keptSketches` prop, kept group), `src/App.tsx`. Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e: two sketches drawn on Top and Right, deleting Sketch.1 removes its wireframe; after Save → reload → Open the kept sketch is drawn again ("Exit Workbench saves a named project once…").

### 3. Sketch wireframes float off their plane
- [x] Done
- **What:** Sketch wireframes are drawn a small distance along their plane normal so they don't z-fight with the plane, grid or a face they sit on. Display only: the stored frame and the geometry sent to the backend are unchanged.
- **Where:** `StlViewport.tsx` (sketch wireframe drawing)
- **Source:** §2: "Position each sketch with a slight offset along its plane normal vector so that it visually floats above its origin/reference plane rather than clipping into or lying flush against it"
- **Acceptance criteria:**
  - The wireframe's drawn points are displaced from the frame by the chosen distance along the normal (unit test on the point mapping).
  - A Pad of a 40 × 30 sketch still has the same bounding box and volume as before this change.
- **Open questions:** B4
- **Files touched:** `src/partDesign.ts` (`SKETCH_LIFT_MM`, `toWorldLifted`), `src/StlViewport.tsx`, `tests/unit/sketchLink.test.ts`. Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). Unit "is drawn 0.5 mm along the plane normal, on every plane" and "does not move the frame the geometry is built on"; e2e wireframe points at −0.5 / +0.5 / 30.5 mm; Pad of the 40 × 30 sketch still 40 × 20 × 30, 24,000 mm³.

### 4. Sketch-based tools build from a kept sketch on its own plane
- [x] Done
- **What:** Pad, Pocket, Shaft, Groove, Hole and Stiffener can take their profile from a kept sketch and build on that sketch's stored frame, not only from the live canvas. Multi-sections and Rib/Slot already use kept sketches' frames; no change there.
- **Where:** `partDesign.ts` (`buildOperation`, tool fields), `App.tsx` (`commitOperation`), `PartDesignPanel.tsx` (profile picker)
- **Source:** §2: "Maintain the sketch's parametric relationship to its parent reference plane so any subsequent Pad, Shaft, or Multi-Sections operation references the correct 3D spatial alignment"
- **Acceptance criteria:**
  - Keep a 40 × 30 rectangle on Front, pick Pad 20 → request has normal `[0,-1,0]`, bounding box 40 × 20 × 30.
  - Keep sketches on Front and on Top; padding the first after the second still builds on Front.
  - Existing Part Design unit and e2e tests still pass.
- **Open questions:** B1, B5, B6
- **Files touched:** `src/partDesign.ts`, `src/App.tsx` (`profileSketch`, `commitOperation`), `src/PartDesignPanel.tsx` (Profile / Sketch support fields). Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e "Pad builds from the kept sketch on its own plane…": request normal [0,−1,0], bounding box 40 × 20 × 30, built on Front after a later Top sketch; all 13 part-design e2e tests and 23 partDesign unit tests pass.

### 5. Kept sketches listed under PartBody in the model tree
- [x] Done
- **What:** `Sketch.N` rows move from the separate SKETCHES heading to the tree location chosen in B7.
- **Where:** 3D Design → model tree → `App.tsx` (tree render, ~line 1383)
- **Source:** §3: "Automatically record the sketch under the Model Tree as a kept sketch (e.g., `Sketch.1`, `Sketch.2`) under `PartBody` or `Faelyx_Project`"
- **Acceptance criteria:**
  - After item 1's exit, `Sketch.1` appears at the chosen location; a second one is `Sketch.2`.
  - Delete from the tree still works.
- **Open questions:** B7
- **Files touched:** `src/App.tsx` (model tree). Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e: Sketch.1 is the row right after PartBody; a sketch kept with Body.2 active is right after Body.2; delete from the tree works.

### 6. Transferred sketch is selected and highlighted
- [x] Done
- **What:** After the automatic transfer, the new `Sketch.N` is the tree selection and its wireframe is drawn in a highlight colour; clicking another kept sketch in the tree moves the highlight. The selected sketch is the default profile for the next sketch-based tool (item 4).
- **Where:** `App.tsx` (`treeSelection`), `StlViewport.tsx` (highlight), `PartDesignPanel.tsx` (default profile)
- **Source:** §3: "Keep the sketch profile highlighted or selected by default so the user can immediately select 3D tools (such as Pad, Pocket, or Shaft)"
- **Acceptance criteria:**
  - Exit Workbench → the new sketch's tree row is selected and its wireframe is highlighted.
  - Clicking Pad straight after, then Apply, builds from that sketch with no other step.
- **Open questions:** B1
- **Files touched:** `src/App.tsx` (`treeSelection`, default profile), `src/StlViewport.tsx` (selected highlight). Coded 2026-10-04 (no git history; files from modification dates and code search).
- **Verification:** Verified 2026-10-05: typecheck clean, 55/55 unit tests, full e2e run 76/80 (the 4 failures are the ones already failing on 2026-09-29). e2e: the new sketch's row has `tree-selected` and its wireframe reports selected; clicking another sketch moves the highlight; Exit Workbench → Pad → Apply builds with no other step ("edit loop…").

## Ambiguities and conflicts
- **B1.** What happens to the 2D canvas after the automatic keep. Conflict with existing behaviour: Keep Sketch clears the canvas, and Pad/Pocket/Shaft only read the live canvas, so "auto-keep then Pad" would have nothing to pad. Affects: #1, #4, #6. Options: **(a)** exit keeps the sketch and clears the canvas; sketch-based tools get a **Profile** picker defaulting to the selected kept sketch (CATIA-like; item 4 as written) / **(b)** exit records `Sketch.N` but leaves the sketch on the canvas, tools keep using the live sketch, and exiting again updates the same `Sketch.N` until a feature consumes it (smaller change; item 4 shrinks to "no change").
- **B2.** What counts as "exiting". Affects: #1. Options: **(a)** only the Exit Workbench button / **(b)** also clicking the 3D Design tab / **(c)** leaving for any tab, which would send a click on e.g. Drawings & Documentation to 3D Design instead. Existing e2e tests go to 3D Design by the tab, so (b) and (c) change what they see.
- **B3.** Sketches that are neither a closed profile nor an open chain of lines/arcs (stray points, self-intersecting or branching geometry). Manual Keep Sketch refuses these with an error. Affects: #1. Options: **(a)** switch to 3D Design, keep nothing, show a short notice saying why / **(b)** stay in Sketch & 2D with the error.
- **B4.** Float distance. Affects: #3. Options: **(a)** fixed 0.5 mm / **(b)** another fixed value you give / **(c)** scaled with zoom so it looks the same at any size. Should the live purple preview float the same way?
- **B5.** After a kept sketch is used by a Pad/Pocket/etc. Affects: #4. Options: **(a)** it stays in the tree and viewport, reusable / **(b)** it stays in the tree but its wireframe is hidden / **(c)** it moves under the feature that used it, as in CATIA.
- **B6.** "Parametric relationship to its parent reference plane". A kept sketch stores a copy of its plane frame. Affects: #4. Options: **(a)** keep the stored copy (position is correct; later changes to a plane's offset don't move the sketch) / **(b)** store a link to the support so the sketch, and features built on it, follow the plane when it changes (larger change, touches saved projects).
- **B7.** Tree location: the source says "under `PartBody` or `Faelyx_Project`". Affects: #5. Options: **(a)** under the body that was active when it was kept / **(b)** always under PartBody / **(c)** under the project root, as the SKETCHES heading is today.
- **Note.** Not requested, so not in the list: re-opening a kept sketch in Sketch & 2D to edit it. Say if you want it added.
- **Note.** `docs/changes/2026-10-04-catia-sketch-tree.md` (awaiting approval) numbers the live sketch as kept-sketch count + 1; that stays consistent with this list.
- **Note.** Four Sketch & 2D e2e tests were already failing before this work (see the 2026-09-29 log); they will be reported separately from any new failures.

## Decisions (2026-10-04)
User replied "ok" to the suggested options.
- B1 → (a) exit keeps the sketch and clears the canvas; sketch-based tools get a Profile picker defaulting to the selected kept sketch.
- B2 → (b) Exit Workbench button and the 3D Design tab.
- B3 → (a) switch anyway, keep nothing, short notice.
- B4 → (a) fixed 0.5 mm; the live preview floats too.
- B5 → (b) a used sketch stays in the tree, its wireframe is hidden.
- B6 → replaced by C10 in `2026-10-04-sketch-workflow-3d-planes.md`.
- B7 → (a) under the body that was active when it was kept.

## Log
- 2026-10-04: Pasted prompt saved to `docs/inputs/sketch-to-3d-auto-transfer.md`. List created from it; awaiting approval.
- 2026-10-04: Approved by user with the decisions above. Status → In progress.
- 2026-10-05: Session resumed. The code for all six items was already in place from 2026-10-04 but nothing had been verified or ticked.
- 2026-10-05: Ran typecheck (clean), unit tests (55/55) and the full e2e suite (76/80; the 4 failures are the pre-existing ones: chamfer dimension double-click, circle-centre delete, Exit Plane axes, plane-picker axis labels). Items 1–6 checked against their acceptance criteria and ticked. Status → Done.
