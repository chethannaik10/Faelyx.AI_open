# Viewport controls, keyboard shortcuts and floating planes in 3D Design

Status: In progress  <!-- Awaiting approval | In progress | Done -->
Sources: docs/inputs/viewport-controls-shortcuts.md

Scope: `ai-engine/faelyx-ui` — `src/StlViewport.tsx` (3D viewport, camera
controls, planes), `src/App.tsx` (keyboard handlers, tree selection, delete,
view settings, bottom hint), `src/index.css`. No backend change expected.

What the app does today (code as of 2026-10-04 17:55; the two lists approved
that day are coded but not yet verified or ticked — see D1):
- **Keyboard, 3D Design:** Ctrl/Cmd+Z undoes and Ctrl/Cmd+Y or
  Ctrl/Cmd+Shift+Z redoes the 3D state (`App.tsx:1461`). There is no
  Ctrl+A, Delete/Backspace, Esc or F handling in 3D Design.
- **Selection:** the model tree has one selected row at a time
  (`treeSelection`, a single name, `App.tsx:453`). There is no
  multi-selection. Picked faces (`selectedFaces`) are a separate list used by
  the Dress-Up tools.
- **Delete:** each tree row has its own delete button (`deleteItem`,
  `App.tsx:1295`), with no confirmation. A delete that leaves the part
  unbuildable is refused with an error. PartBody can't be deleted.
- **Tools:** a Part Design tool is always active (`activeTool` starts as
  `Pad`); there is no "no tool" state.
- **Mouse** (three.js OrbitControls, `StlViewport.tsx:344`, `:763`):
  left-drag follows the toolbar mode (Select = nothing, Orbit, Pan, Zoom);
  **middle-drag zooms**; right-drag pans; the wheel zooms toward the orbit
  target, **not the cursor**; Alt+left-drag orbits in any mode. The camera
  orbits its current target, which Fit all and Normal view move.
- **Fit:** a "Fit all" button in the bottom navigation bar frames the part
  mesh only (`fitAll`, `StlViewport.tsx:708`). No key and no middle
  double-click.
- **Planes:** the three primary planes are 50 mm squares centred on the
  origin (`StlViewport.tsx:312`). The grid is a 400 mm floor at the same
  height. As drawn, **Front (XZ) lies in the grid's plane**; Top (XY) and
  Right (YZ) stand upright through it, half above and half below. No shadow
  or glow.
- **Hints:** a line at the bottom of the viewport reads "Scroll to zoom •
  Right-drag to pan • Alt+drag to rotate" in Orbit/Pan/Zoom mode
  (`App.tsx:337`). The text is fixed.
- **Settings:** a View settings popover with one "Show planes" toggle
  (`App.tsx:298`). No hotkey or navigation settings.

## Change requests

### 1. Undo / Redo shortcuts in 3D Design
- [ ] Done
- **What:** In 3D Design, Ctrl+Z / Cmd+Z undoes and Ctrl+Y / Cmd+Y / Ctrl+Shift+Z / Cmd+Shift+Z redoes. The key handling is already in the code from the 2026-10-04 planes list (item 9); this item is to verify it against this spec and extend what a step covers per D2.
- **Where:** 3D Design → `App.tsx` (3D history key handler, ~line 1461)
- **Source:** §1: "Undo (`Ctrl + Z` / `Cmd + Z`): Step back through feature history or viewport transformations"; "Redo (`Ctrl + Y` / `Cmd + Y` or `Ctrl + Shift + Z`)"
- **Acceptance criteria:**
  - Pad a sketch, press Ctrl+Z → the Pad is gone; Ctrl+Y → it is back; Ctrl+Shift+Z also redoes.
  - With the cursor in a text or number field, Ctrl+Z edits that field and does not undo the model.
  - In Sketch & 2D, Ctrl+Z still undoes sketch steps as today.
- **Open questions:** D1, D2, D3
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 2. Select All (Ctrl+A)
- [ ] Done
- **What:** Ctrl+A / Cmd+A in 3D Design selects every item covered by D4 at once: their tree rows show as selected and kept sketches' wireframes are highlighted. Needs the tree selection to hold more than one item.
- **Where:** `App.tsx` (`treeSelection` → a set; tree rows; key handler), `StlViewport.tsx` (highlight several sketches)
- **Source:** §1: "Select All (`Ctrl + A`): Multi-select all active elements/sketches in the 3D workspace"
- **Acceptance criteria:**
  - With two kept sketches and one Pad, Ctrl+A marks all three rows selected and highlights both wireframes.
  - The browser's own select-all (page text highlighted) does not happen.
  - Clicking a single row afterwards selects only that row.
- **Open questions:** D4
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 3. Delete / Backspace deletes the selection
- [ ] Done
- **What:** Delete or Backspace in 3D Design deletes the selected tree items (features, sketches, and the other kinds per D4), using the same rules as each row's delete button. One key press is one undo step.
- **Where:** `App.tsx` (key handler; `deleteItem` extended to several ids)
- **Source:** §1: "Delete (`Delete` / `Backspace`): Delete selected geometry, sketches, or features"
- **Acceptance criteria:**
  - Select `Sketch.1`, press Delete → it leaves the tree and the viewport; Ctrl+Z brings it back.
  - Backspace does the same.
  - With the cursor in a text or number field, Backspace edits the field and deletes nothing.
  - A delete that would leave the part unbuildable is refused with the existing error and nothing is removed.
- **Open questions:** D4, D5
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 4. Escape cancels / deselects
- [ ] Done
- **What:** Esc in 3D Design steps out of the current state in the order chosen in D6 (close an open popover, leave feature editing, drop picked faces, return to Select mode, clear the selection).
- **Where:** `App.tsx` (key handler; `stopEditing`, `setSelectedFaces`, interaction mode, selection)
- **Source:** §1: "Escape (`Esc`): Cancel active tool selection, exit command modes, or deselect highlighted geometry"
- **Acceptance criteria:** _(depends on D6; one check per step in the chosen order)_
  - Esc while renaming the project still only cancels the rename (existing behaviour).
- **Open questions:** D6
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 5. Pan with middle-drag or right-drag
- [x] Done
- **What:** Middle-button drag pans the camera in every toolbar mode. Right-drag keeps panning. (Middle-drag zooms today.)
- **Where:** `StlViewport.tsx` (`controls.mouseButtons`, `setInteractionMode`)
- **Source:** §2: "Pan: Middle Mouse Button (MMB) click + drag (or Right-click + drag)"
- **Acceptance criteria:**
  - Middle-drag moves the view sideways without changing zoom or angle; right-drag does the same.
  - The browser's middle-click autoscroll cursor and the right-click menu don't appear over the viewport.
- **Open questions:** D7
- **Files touched:** `ai-engine/faelyx-ui/src/StlViewport.tsx` (`mouseButtons.MIDDLE` → pan, middle `mousedown` default prevented), `ai-engine/faelyx-ui/tests/e2e/viewport-controls.spec.ts`
- **Verification:** 2026-10-05: typecheck and eslint clean; unit 55/55; full e2e 82/86 (the 4 failures are the ones already failing on 2026-09-29). e2e "middle-drag and right-drag pan, in Orbit and in Select mode": target moves, distance and view direction unchanged. OrbitControls already suppresses the right-click menu; middle-click autoscroll is prevented on the canvas (not separately asserted — headless Chromium has no autoscroll).

### 6. Wheel zooms toward the cursor
- [x] Done
- **What:** Scrolling zooms in and out about the point under the cursor, not the screen centre.
- **Where:** `StlViewport.tsx` (OrbitControls `zoomToCursor`)
- **Source:** §2: "Zoom: Mouse Scroll Wheel up/down (zooming relative to the cursor position)"
- **Acceptance criteria:** With the cursor over a corner of a part, scrolling in keeps that corner under the cursor (its screen position moves by no more than a few pixels; e2e check through the viewport probe).
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/StlViewport.tsx` (`controls.zoomToCursor`), `ai-engine/faelyx-ui/tests/e2e/viewport-controls.spec.ts`
- **Verification:** 2026-10-05: typecheck and eslint clean; unit 55/55; full e2e 82/86 (the 4 failures are the ones already failing on 2026-09-29). e2e "the wheel zooms toward the point under the cursor": a model point 60 mm off-centre stays within 4 px of the cursor while the camera closes on it by more than 20 %, and scrolling back moves away.

### 7. Ctrl + middle-drag zooms
- [x] Done
- **What:** Holding Ctrl while middle-dragging zooms (drag up = in, drag down = out) instead of panning.
- **Where:** `StlViewport.tsx` (pointer-down retarget, same pattern as the Alt+left orbit handler at line 465)
- **Source:** §2: "or `Ctrl` + MMB drag"
- **Acceptance criteria:** Ctrl+middle-drag up brings the camera closer to its target; down moves it away; releasing Ctrl mid-session returns middle-drag to pan on the next drag.
- **Open questions:** D7
- **Files touched:** `ai-engine/faelyx-ui/src/StlViewport.tsx` (middle button retargeted to zoom on Ctrl/Cmd at pointer-down), `ai-engine/faelyx-ui/tests/e2e/viewport-controls.spec.ts`
- **Verification:** 2026-10-05: typecheck and eslint clean; unit 55/55; full e2e 82/86 (the 4 failures are the ones already failing on 2026-09-29). e2e "Ctrl + middle-drag zooms…": drag up brings the camera closer, drag down moves it away, and with Ctrl released the next middle-drag pans (distance unchanged). Rate is OrbitControls' own drag-zoom rate: about 4 % per 80 px, slower than the wheel.

### 8. Orbit with Alt+left-drag or middle+right drag
- [x] Done
- **What:** Alt+left-drag orbits (already present). Add: holding the middle and right buttons together and dragging orbits. OrbitControls has no two-button chord, so this needs its own pointer handling.
- **Where:** `StlViewport.tsx` (pointer handlers)
- **Source:** §2: "Orbit / Rotate (Revolve): `Alt` + Left-click drag (or MMB + Right-click drag)"
- **Acceptance criteria:**
  - Alt+left-drag rotates the view in Select, Pan and Zoom modes.
  - Middle+right held together and dragged rotates the view; releasing one button returns to that remaining button's own action.
- **Open questions:** D7
- **Files touched:** `ai-engine/faelyx-ui/src/StlViewport.tsx` (`handleChordMove`: middle + right orbit about the orbit target), `ai-engine/faelyx-ui/tests/e2e/viewport-controls.spec.ts`
- **Verification:** 2026-10-05: typecheck and eslint clean; unit 55/55; full e2e 82/86 (the 4 failures are the ones already failing on 2026-09-29). e2e "Alt + left-drag and middle + right together orbit…": Alt+left rotates in Select, Pan and Zoom modes; middle+right rotates with target and distance unchanged; releasing right leaves middle panning from that point with no jump.

### 9. Orbit pivot: model origin or selection centre
- [ ] Done
- **What:** The camera orbits around the point chosen in D8 (model origin, or the centre of the current selection when there is one) instead of wherever the last pan left the target.
- **Where:** `StlViewport.tsx` (`controls.target` handling at orbit start)
- **Source:** §2: "to orbit around the model origin or active selection center point"
- **Acceptance criteria:** _(depends on D8)_
- **Open questions:** D8
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 10. Fit to screen with F or middle double-click
- [x] Done
- **What:** Pressing F in 3D Design, or double-clicking the middle button on the viewport, frames the whole model, as the Fit all button does.
- **Where:** `App.tsx` (key handler → `handleFitAll`), `StlViewport.tsx` (middle double-click), `fitAll`
- **Source:** §2: "Fit to Screen: Double-click MMB or press `F` to frame the entire model in the viewport"
- **Acceptance criteria:**
  - Zoom far out, press F → the part fills the view again (same camera as clicking Fit all).
  - Two middle clicks within the double-click time do the same; a single middle click or a middle-drag does not.
  - F typed in a text field types the letter.
- **Open questions:** D9
- **Files touched:** `ai-engine/faelyx-ui/src/StlViewport.tsx` (`onMiddleDoubleClick`), `ai-engine/faelyx-ui/src/App.tsx` (F key handler; `onMiddleDoubleClick={onFitAll}`), `ai-engine/faelyx-ui/tests/e2e/viewport-controls.spec.ts`
- **Verification:** 2026-10-05: typecheck and eslint clean; unit 55/55; full e2e 82/86 (the 4 failures are the ones already failing on 2026-09-29). e2e "F and a middle double-click fit the view like the Fit all button…": after zooming out, F and two quick middle clicks each give the same camera distance as the Fit all button; a single middle click and F typed in a field leave the view alone. Per D9: fits the part only, active whenever 3D Design is open and no field has focus.

### 11. Primary planes float above the grid
- [ ] Done
- **What:** The Front, Top and Right planes are drawn raised above the grid floor by the distance and method chosen in D10, so none of them lies in the grid or cuts through it.
- **Where:** `StlViewport.tsx` (planes group / grid position)
- **Source:** §3: "Position the primary origin planes (Front, Top, Right) with a slight visual elevation above the ground grid plane so they appear floating rather than clipping into or aligning flush with the grid floor"
- **Acceptance criteria:**
  - No plane is coplanar with the grid and no plane edge is below it (probe check on plane and grid heights; screenshot).
  - A Pad on each plane has the same bounding box and volume as before (geometry sent to the backend unchanged).
  - Double-clicking a plane still opens it in Sketch & 2D.
- **Open questions:** D1, D10
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 12. Shadow or glow beneath the planes
- [ ] Done
- **What:** A soft semi-transparent effect (shadow or glow, per D11) is drawn on the grid under the floating planes. Hidden together with the planes by the Show planes toggle.
- **Where:** `StlViewport.tsx` (planes group)
- **Source:** §3: "Add a subtle semi-transparent shadow or glow effect beneath floating planes to reinforce spatial depth in the 3D perspective view"
- **Acceptance criteria:**
  - The effect is visible under the planes in the default view and does not hide grid lines or the part (screenshot for your sign-off).
  - Turning Show planes off removes it.
- **Open questions:** D11
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 13. "Hotkeys & Navigation Settings" panel with mouse presets
- [ ] Done
- **What:** A "Hotkeys & Navigation Settings" panel where the user picks a mouse navigation preset (the set named in D12). The choice changes which button/modifier pans, zooms and orbits in the 3D viewport, and is remembered.
- **Where:** `App.tsx` (new panel, opened from the place chosen in D12), `StlViewport.tsx` (bindings read from the active preset instead of fixed values), new preset table in `src/`
- **Source:** §4: "Add a configurable "Hotkeys & Navigation Settings" panel so users can customize or switch mouse interaction presets (e.g., CATIA, SolidWorks, Blender, or Autodesk navigation schemes)"
- **Acceptance criteria:**
  - The panel lists the presets; picking one changes pan/zoom/orbit to that preset's bindings (unit test on the preset table; e2e drag check for at least two presets).
  - The choice is still active after a reload.
  - The panel shows the bindings of the selected preset.
- **Open questions:** D7, D12
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 14. Custom key and mouse bindings
- [ ] Done
- **What:** In the same panel, the user can change individual bindings (scope per D13) and reset them to the preset's defaults.
- **Where:** `App.tsx` (panel, key handler reads the binding table), `StlViewport.tsx`
- **Source:** §4: "so users can customize or switch mouse interaction presets"; panel title "Hotkeys & Navigation Settings"
- **Acceptance criteria:** _(depends on D13)_
- **Open questions:** D13 — not implementable until answered
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

### 15. Active key bindings shown at the bottom
- [ ] Done
- **What:** A prompt at the bottom of 3D Design shows the current mouse bindings, e.g. "MMB: Pan | Alt+Drag: Rotate | Scroll: Zoom", and follows the active preset (item 13) and any custom bindings (item 14).
- **Where:** 3D Design → bottom of viewport → `App.tsx` (`viewport-hint-3d`, line 337, or the status bar, per D14), `index.css`
- **Source:** §4: "Display a floating status bar or visual prompt in the bottom toolbar showing active key bindings (e.g., "MMB: Pan | Alt+Drag: Rotate | Scroll: Zoom")"
- **Acceptance criteria:**
  - With the default bindings the prompt lists pan, rotate, zoom and fit with the bindings that actually work.
  - Switching preset changes the text to match.
- **Open questions:** D14
- **Files touched:** _(filled in after implementation)_
- **Verification:** _(filled in after implementation)_

## Ambiguities and conflicts
- **D1.** This list builds on work that is coded but not verified. The 2026-10-04 lists (`sketch-to-3d-auto-transfer`, `sketch-workflow-3d-planes`) are approved and in the code, but none of their 17 items has been checked or ticked. Item 1 here is their 3D undo; items 11–12 change their primary planes; item 13 may sit in their View settings popover. Affects: #1, #11, #12, #13. Options: **(a)** first verify and tick those 17 items, then do this list / **(b)** do this list now and verify the old items afterwards / **(c)** this list only.
- **D2.** "Step back through feature history **or viewport transformations**" (§1). Today undo covers the 3D model state only. Affects: #1. Options: **(a)** model state only, no change / **(b)** also Compass moves of the part / **(c)** also camera moves (each orbit/pan/zoom drag becomes an undo step, mixed into the same stack) / **(d)** camera moves on a separate "previous view" history.
- **D3.** Cmd+Y on macOS is the browser's History shortcut in Chrome and Safari, and a web page may not be able to take it over. Affects: #1. I'll wire it; if the browser keeps it, Cmd+Shift+Z remains the Mac redo. Say if that is not acceptable.
- **D4.** What Select All selects and what a multi-selection is for. The app has only single selection, and "active elements/sketches" isn't defined. Affects: #2, #3. Options for what is selected: **(a)** kept sketches and features of the active body / **(b)** everything in the tree that can be deleted: features, modifiers, sketches, reference geometry, Boolean operations, non-default bodies / **(c)** sketches only. Uses of a multi-selection: Delete (item 3) is the only one in the source; should Ctrl+click and Shift+click on tree rows also build a multi-selection (not requested)?
- **D5.** Delete behaviour. Affects: #3.
  - Confirmation: **(a)** no prompt, rely on Undo (as the row buttons do today) / **(b)** confirm when more than one item, or when a feature, is deleted.
  - "Selected geometry": picked faces can't be deleted directly (Remove Face is a separate tool). Options: **(a)** Delete acts on tree items only / **(b)** with faces picked, Delete runs Remove Face on them.
  - A sketch that features were built from: **(a)** refuse, naming the features / **(b)** delete the sketch and leave the features as they are (today's row button) / **(c)** delete the features too.
  - Several items where one can't be removed: **(a)** delete nothing / **(b)** delete the ones that can be.
- **D6.** Esc order, and "cancel active tool selection" when a tool is always active (there is no no-tool state). Affects: #4. Suggested order, one step per press: close an open popover or panel → stop editing a feature or sketch support → clear picked faces → switch Orbit/Pan/Zoom/Compass back to Select → clear the tree selection. The Part Design tool panel stays on its current tool. Options: **(a)** as suggested / **(b)** one press does all of it / **(c)** Esc should also close the tool panel (needs a new "no tool" state).
- **D7.** Mouse bindings conflict with today's and with the presets. Affects: #5, #7, #8, #13.
  - Middle-drag zooms today; §2 makes it pan. Anyone used to the current behaviour loses it unless a preset keeps it.
  - §2 fixes one scheme, §4 asks for switchable presets. My reading: §2 is the default preset and the others are alternatives. Options: **(a)** §2 as the default, named "Faelyx" / **(b)** §2 *is* the CATIA preset and is the default / **(c)** today's bindings stay the default and §2 is a preset.
  - Do the toolbar's Orbit / Pan / Zoom left-drag modes stay? **(a)** yes, unchanged / **(b)** remove them.
- **D8.** Orbit pivot: "the model origin **or** active selection center point". Affects: #9. Options: **(a)** the centre of the selection when a face or sketch is selected, otherwise the part's centre, otherwise the origin / **(b)** always the model origin / **(c)** keep today's behaviour (the current view target) and only add "selection centre when something is selected". Note (a) and (b) make the view jump back to that pivot after a pan.
- **D9.** What F frames. Fit all frames the part mesh only today; with no part it uses a default distance. Affects: #10. Options: **(a)** the part only, as today / **(b)** the part plus kept sketches and the primary planes. Also: F only when the pointer is over the viewport, or whenever 3D Design is active and no field has focus (as Ctrl+Z works today)?
- **D10.** How the planes "float". Only Front (XZ) is flush with the grid; Top and Right stand through it. The planes mark the true origin, and sketches and parts are drawn at their true positions. Affects: #11. Options: **(a)** lower the grid floor instead, by a distance you choose (planes, sketches and part stay where they really are; suggestion 30 mm, so all three 50 mm planes clear it) / **(b)** raise the three plane squares for display only (they then no longer pass through the origin, and sketches on them are drawn away from their plane) / **(c)** only lift the flat Front plane a fraction of a millimetre to stop it flickering against the grid, leaving the other two crossing it. Distance?
- **D11.** "Shadow **or** glow". Affects: #12. Options: **(a)** a soft dark shadow on the grid under each plane / **(b)** a faint glow in each plane's colour / **(c)** one combined soft shadow under the group. No reference image was given; I'll show a screenshot for sign-off either way.
- **D12.** The presets and the panel. Affects: #13.
  - The source gives preset names only, not their bindings. I would take each product's default mouse scheme and show you the table before coding it. Which presets: **(a)** Faelyx (§2), CATIA, SolidWorks, Blender, Fusion 360 / **(b)** another set. "Autodesk" covers several products with different schemes (Fusion 360, Inventor, AutoCAD, Maya); which one?
  - Some schemes use multi-button chords or key+drag combinations a browser can't fully reproduce (e.g. CATIA's middle-then-right zoom). Acceptable to approximate those and say so in the panel?
  - Where the panel opens from: **(a)** a button in the existing View settings popover / **(b)** a new button in the bottom navigation bar / **(c)** the top toolbar.
  - Remembered: **(a)** for this browser (as Show planes is) / **(b)** in the saved project.
- **D13.** "Customize": which bindings can be changed one by one? Affects: #14. Options: **(a)** none; switching presets is the only customisation (drop item 14) / **(b)** keyboard shortcuts only (Undo, Redo, Select All, Delete, Escape, Fit) / **(c)** keyboard shortcuts and each mouse action. Should it warn on a clash between two bindings?
- **D14.** Where the binding prompt goes. The viewport already has a hint line at the bottom, and the app has a status bar below it. Affects: #15. Options: **(a)** replace the existing hint line's text, shown in all modes / **(b)** a new segment in the status bar / **(c)** a separate floating pill above the navigation bar. In Select mode the hint line currently says "Double-click a plane or a sketch to open it in Sketch & 2D"; keep that alongside?
- **D15.** Where the shortcuts apply: "global keyboard shortcuts … within the 3D viewport". Affects: #1–#4, #10. Suggestion: active whenever 3D Design is the open workspace and focus is not in a text, number or select field; Sketch & 2D keeps its own shortcuts unchanged. OK?
- **Note.** `docs/changes/2026-10-04-catia-sketch-tree.md` is still awaiting approval (A1–A9 unanswered); it doesn't conflict with this list.
- **Note.** Four Sketch & 2D e2e tests were already failing on 2026-09-29 (see that log). The e2e suite has not been run since the 2026-10-04 code changes; I'll run it before starting and report old and new failures separately.

## Decisions (2026-10-05)
- D1 → (a) verify the 17 items coded on 2026-10-04 first; this list comes after `2026-10-05-view-menu-plane-offset.md` (user's "ok" to E6 there).
- D10 → superseded by E1 (b) in `2026-10-05-view-menu-plane-offset.md`: whole origin system drawn raised 30 mm, grid not moved. Item 11 is done there.
- User replied "ok" a second time after being told this list's questions were still open; taken as approval with the suggested options:
  - D3 → wire Cmd+Y; Cmd+Shift+Z is the Mac fallback.
  - D6 → (a) one step per press: close popover → stop editing → clear picked faces → back to Select → clear selection.
  - D7 → (a) §2 is the default preset, named "Faelyx"; toolbar Orbit/Pan/Zoom modes stay.
  - D8 → (a) selection centre, else part centre, else origin.
  - D9 → (a) the part only; active whenever 3D Design is open and no field has focus.
  - D12 → presets Faelyx, CATIA, SolidWorks, Blender, Fusion 360, bindings table shown before coding; approximations noted in the panel; opened from View settings; remembered per browser.
  - D14 → (a) replace the existing hint line's text, shown in all modes.
  - D15 → active whenever 3D Design is open and focus is not in a field.
- **Not answered** (no suggestion was offered, so "ok" picks nothing): D2 (item 1 extension), D4 (items 2, 3), D5 (item 3), D11 (item 12), D13 (item 14). Those items wait.

## Log
- 2026-10-05: Pasted prompt saved to `docs/inputs/viewport-controls-shortcuts.md`. List created from it; awaiting approval.
- 2026-10-05: D1 and D10 settled through the view-menu list's approval.
- 2026-10-05: Approved (second "ok") with the decisions above. Status → In progress.
- 2026-10-05: Items 5, 6, 7, 8 and 10 implemented and verified (new spec `tests/e2e/viewport-controls.spec.ts`, 5 tests). Ticked.
- 2026-10-05: Not started: 4 (Esc), 9 (orbit pivot), 15 (binding prompt). **Blocked** on unanswered questions: 1 (D2), 2 and 3 (D4, D5), 12 (D11), 14 (D13). 11 is view-menu item 5, blocked on E2. 13 waits for the user's sign-off on the preset bindings table below.
- 2026-10-05: Preset bindings proposed for item 13 (each product's default scheme, as I understand it; to be confirmed by the user before coding): **Faelyx** — pan: middle-drag or right-drag; orbit: Alt+left-drag or middle+right; zoom: wheel or Ctrl+middle-drag. **CATIA V5** — pan: middle-drag; orbit: middle held + left or right held, drag; zoom: middle held, click left or right once, then drag up/down (approximated: the browser sees no separate click while middle is held, so "middle held, then right pressed and released" would be detected from button-state changes). **SolidWorks** — orbit: middle-drag; pan: Ctrl+middle-drag; zoom: wheel or Shift+middle-drag. **Blender** — orbit: middle-drag; pan: Shift+middle-drag; zoom: wheel or Ctrl+middle-drag. **Fusion 360** — pan: middle-drag; orbit: Shift+middle-drag; zoom: wheel.
