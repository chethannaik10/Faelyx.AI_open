# View orientation menu (top-right) and reference plane offset in 3D Design

Status: In progress  <!-- Awaiting approval | In progress | Done -->
Sources: docs/inputs/view-menu-plane-offset.md

Scope: `ai-engine/faelyx-ui` — `src/App.tsx` (`ModelViewport`: top line,
bottom navigation bar, view cube), `src/StlViewport.tsx` (camera views,
planes, grid), `src/index.css`. No backend change expected, unless named
views are stored in the saved project (E5).

What the app does today:
- **Bottom navigation bar** (`App.tsx:321–335`): Select, Orbit, Pan, Zoom,
  Fit all, Normal view, Sketch on face, Compass and display controls, then
  seven orientation text buttons — FRONT, BACK, LEFT, RIGHT, TOP, BOTTOM,
  ISO (`QUICK_VIEWS`, `App.tsx:241`, rendered at line 334). The active one
  is highlighted.
- **Top-right of the viewport:** the top line holds a View settings button
  (grid icon) and a three-dot button that **does nothing**
  (`App.tsx:297`). Below it is the view cube with TOP / FRONT / RIGHT faces
  and two 45° rotate arrows (`App.tsx:351`).
- **Views:** `setQuickView` moves the camera to one of the seven directions
  and keeps the zoom distance (`StlViewport.tsx:687`). There are no named
  or saved views anywhere in the app.
- **Planes and grid:** the three primary planes are 50 mm squares centred on
  the origin; the grid is a 400 mm floor through the origin
  (`StlViewport.tsx:297`, `:312`). See E2 for which plane lies in the grid.

## Change requests

### 1. Remove the orientation buttons from the bottom bar
- [x] Done
- **What:** The seven text buttons FRONT, BACK, LEFT, RIGHT, TOP, BOTTOM, ISO are removed from the bottom navigation bar. Every other control in that bar stays.
- **Where:** 3D Design → viewport → bottom navigation bar → `App.tsx` (`ModelViewport`, line 334), `index.css` if spacing needs it
- **Source:** §1: "Remove all orientation text buttons (FRONT, BACK, LEFT, RIGHT, TOP, BOTTOM, ISO) from the bottom navigation/display toolbar"
- **Acceptance criteria:**
  - The bottom bar has no FRONT / BACK / LEFT / RIGHT / TOP / BOTTOM / ISO buttons.
  - Select, Orbit, Pan, Zoom, Fit all, Normal view, Sketch on face, Compass and the display controls are still there and work.
  - Any e2e test that used those buttons is changed to use the new menu (item 3).
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx` (`ModelViewport` navigation bar), `ai-engine/faelyx-ui/tests/e2e/sketch-transfer.spec.ts` ("Views menu (⋮, top right)…")
- **Verification:** 2026-10-05: typecheck and eslint clean; unit 55/55; full e2e 77/81 (the 4 failures are the ones already failing on 2026-09-29). e2e: no FRONT/BACK/LEFT/RIGHT/TOP/BOTTOM/ISO in the bottom bar; Select, Orbit, Pan, Zoom, Fit all, Normal view and Compass still there (their own e2e tests still pass). No existing e2e test used the removed buttons. Screenshot `test-results/views-menu.png` viewed.

### 2. Vertical options (⋮) icon at the top-right of the viewport
- [x] Done
- **What:** A vertical three-dot icon sits in the top-right corner of the 3D viewport near the view cube (exact place per E3). It has an accessible name ("Views") and shows whether its menu is open.
- **Where:** 3D Design → viewport top-right → `App.tsx` (`ModelViewport`, top line / view cube area), `index.css`
- **Source:** §1: "Position a vertical options icon (⋮ or kebab menu icon) in the top-right corner of the 3D viewport area (near the view cube / navigation gizmo)"
- **Acceptance criteria:**
  - A ⋮ button is visible at the top-right of the 3D viewport and does not overlap the view cube or the View settings button at 1024 × 640 and 1600 × 950.
  - It is reachable by keyboard and has a tooltip.
- **Open questions:** E3
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx` (`MoreDots` vertical variant; the dead top-line button is now the Views button), `src/index.css`, `ai-engine/faelyx-ui/tests/e2e/sketch-transfer.spec.ts` ("Views menu (⋮, top right)…")
- **Verification:** 2026-10-05: typecheck and eslint clean; unit 55/55; full e2e 77/81 (the 4 failures are the ones already failing on 2026-09-29). e2e: three dots stacked vertically; button within 30 px of the viewport's top-right corner and not overlapping the view cube or View settings at 1024 × 640 and 1600 × 950; has a tooltip and accessible name "Views", `aria-expanded`; opens with keyboard focus + Enter.

### 3. Dropdown menu with the seven standard views
- [x] Done
- **What:** Clicking the ⋮ icon opens a dropdown listing, in this order: Isometric (Iso), Front, Back, Left, Right, Top, Bottom. Choosing one moves the camera to that view (same as the old buttons) and closes the menu. The current view is marked. Clicking outside or pressing Esc closes the menu.
- **Where:** `App.tsx` (new menu in `ModelViewport`, calling `onQuickView`), `index.css`
- **Source:** §1: "Clicking this icon should trigger a dropdown menu listing all available standard and custom orientation views: Isometric (Iso), Front, Back, Left, Right, Top, Bottom"
- **Acceptance criteria:**
  - The menu lists the seven views in the order above.
  - Choosing Front gives the same camera as the old FRONT button; same for the other six.
  - The view cube's caption and highlighted face follow a view chosen from the menu, and the menu marks a view chosen from the cube.
  - Esc and an outside click close the menu without changing the view.
- **Open questions:** E4
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx` (`QUICK_VIEWS` order and names, Views menu), `src/index.css` (`.view-menu*`), `src/StlViewport.tsx` (camera read-out on the test probe), `ai-engine/faelyx-ui/tests/e2e/sketch-transfer.spec.ts` ("Views menu (⋮, top right)…")
- **Verification:** 2026-10-05: typecheck and eslint clean; unit 55/55; full e2e 77/81 (the 4 failures are the ones already failing on 2026-09-29). e2e: menu lists Isometric (Iso), Front, Back, Left, Right, Top, Bottom in that order; each entry moves the camera to that view's direction (read from the viewport probe) and closes the menu; the current view is ticked; Esc and an outside click close it with the camera unchanged; menu → cube and cube → menu stay in sync. The menu calls the same `onQuickView` the removed buttons did.

### 4. Named Views in the menu
- [ ] Done
- **What:** The menu has a "Named Views" part (sub-menu or section, per E5) listing camera angles the user has saved. Choosing one restores that camera. A "Save current view…" entry adds the current camera under a name the user types.
- **Where:** `App.tsx` (menu, named-view state), `StlViewport.tsx` (new handle methods to read and restore the camera), storage per E5
- **Source:** §1: "Named Views (sub-menu or section for user-defined saved camera angles)"
- **Acceptance criteria:**
  - Orbit to an arbitrary angle, save it as "Detail A", switch to Front, choose "Detail A" → the camera returns to the saved angle (position, target and up within tolerance; e2e through the viewport probe).
  - With none saved, the Named Views part shows an empty-state line and the Save entry.
  - Saved views are still listed after the reload/reopen case chosen in E5.
- **Open questions:** E5
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 5. Primary planes drawn above the grid; grid stays at the baseline
- [ ] Done
- **What:** The Front, Top and Right planes are drawn at an elevated offset above the ground grid (distance and method per E1). The grid itself is not moved.
- **Where:** `StlViewport.tsx` (planes group; possibly sketch, reference and part groups, per E1)
- **Source:** §2: "Adjust the default 3D coordinate/rendering position of the origin reference planes so that they float at an elevated offset above the background ground grid plane"; "Ensure the reference grid remains rendered at the ground baseline (Z=0), while the primary origin system/planes display clearly above it"
- **Acceptance criteria:**
  - The grid's height is the same as before the change.
  - No primary plane is coplanar with the grid and no plane edge is below it (probe check; screenshot).
  - A Pad on each plane has the same bounding box and volume as before (geometry sent to the backend unchanged), unless E1 (c) is chosen.
  - Double-clicking a plane still opens it in Sketch & 2D.
- **Open questions:** E1, E2
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

## Ambiguities and conflicts
- **E1.** Same request as item 11 of `docs/changes/2026-10-05-viewport-controls-shortcuts.md`, with a conflict on method. Affects: #5 (and that list's #11, D10).
  - That list is awaiting approval; there I suggested *lowering the grid* (D10 a) so planes, sketches and the part keep their true positions. This source, which was pasted later, says the grid "remains rendered at the ground baseline" and the planes move up. I have not picked either.
  - If the planes move up, what moves with them? Options: **(a)** the plane squares only, for display (sketches and parts stay at their real positions, so a sketch on a plane is drawn away from that plane's square) / **(b)** the whole origin system for display: planes, sketch wireframes, reference geometry and the part are all drawn raised by the same offset; the grid stays put and nothing sent to the backend changes (looks the same as lowering the grid, but satisfies "grid stays at the baseline") / **(c)** really move the planes in model coordinates (sketches and features move; saved projects and exported files change).
  - Offset distance? Suggestion for (b): 30 mm, so all three 50 mm planes clear the grid.
  - Should this item and the other list's #11 be done once and ticked in both?
- **E2.** "Ground grid level (Z=0)". As the viewport draws it today, the plane square that lies in the grid's plane is **Front (XZ)**, not Top; Top and Right stand upright through the grid. I have not checked whether that is intended or a slip in the 2026-10-04 plane code, which is still unverified. Affects: #5. Which plane should be parallel to the grid floor: **(a)** leave as drawn today / **(b)** Top (XY) parallel to the floor, as "Z=0" suggests — I would then check how the part and sketches are oriented too, and report before changing anything.
- **E3.** Where the ⋮ goes. A three-dot button already sits in the viewport's top line, right of View settings, and does nothing. Affects: #2. Options: **(a)** turn that button into the vertical ⋮ views menu / **(b)** leave it and add a new ⋮ beside the view cube / **(c)** new ⋮ beside the cube and remove the dead button.
- **E4.** The view cube. The source removes only the bottom buttons. Affects: #3. My reading: the cube (TOP / FRONT / RIGHT faces and 45° arrows) stays and stays in sync with the menu. Say if it should go, or gain the other faces.
- **E5.** Named Views details that the source leaves open. Affects: #4.
  - Layout: **(a)** a section at the bottom of the same menu under a divider / **(b)** a fly-out sub-menu.
  - How one is created: "Save current view…" in the menu with a typed name is my assumption; the source only says they are user-defined.
  - What is stored: camera position, target and up (so zoom and pan come back too) or direction only (zoom kept, like the standard views)?
  - Where it is kept: **(a)** in the saved project (needs the save/open payload extended) / **(b)** in this browser / **(c)** this session only.
  - Not requested, suggestions only: delete and rename for a named view; refusing duplicate names.
- **E6.** Four lists are now open: the two approved 2026-10-04 lists (coded, 17 items unverified), the 2026-10-04 sketch-tree list (awaiting approval), the 2026-10-05 viewport-controls list (awaiting approval) and this one. Their questions (D1–D15, A1–A9) are unanswered. Which order do you want? Suggestion: verify the 17 coded items first, then this list, then viewport controls.
- **Note.** The viewport-controls list's item 15 (binding prompt) and item 13 (settings panel) also touch the bottom bar and the top-right; they don't conflict with this list, but D12's "open the panel from View settings" and E3 share the same corner.
- **Note.** Four Sketch & 2D e2e tests were already failing on 2026-09-29. The e2e suite has not been run since the 2026-10-04 code changes; I'll run it before starting and report old and new failures separately.

## Decisions (2026-10-05)
User replied "ok" to the suggested options.
- E1 → (b) the whole origin system is drawn raised by 30 mm (planes, sketch wireframes, reference geometry, part); grid not moved; nothing sent to the backend changes. Done once, ticked here and as #11 of the viewport-controls list.
- E3 → (a) the existing dead three-dot button becomes the vertical ⋮ views menu.
- E4 → the view cube stays and is kept in sync with the menu.
- E6 → order: verify the 17 items coded on 2026-10-04, then this list, then the viewport-controls list.
- E2 → **not answered** (no suggestion was offered). Item 5 waits for it.
- E5 → **not answered** (no suggestion was offered). Item 4 waits for it.

## Log
- 2026-10-05: Pasted prompt saved to `docs/inputs/view-menu-plane-offset.md`. List created from it; awaiting approval.
- 2026-10-05: Approved by user with the decisions above. Status → In progress. Items 1–3 can proceed; 4 and 5 wait for E5 and E2.
- 2026-10-05: Items 1–3 implemented and verified (Views menu on the former dead three-dot button; bottom-bar orientation buttons removed). Ticked.
- 2026-10-05: Items 4 (Named Views) and 5 (plane offset) **Blocked:** waiting for the user's answers to E5 and E2.
- 2026-10-05: Noticed, not changed: on start the menu ticks Isometric (the app's initial label) although the start camera is slightly off the ISO quick-view direction; and at ~916 px viewport width the bottom-left hint text still runs under the navigation bar (to be handled with the binding prompt, viewport-controls item 15).
