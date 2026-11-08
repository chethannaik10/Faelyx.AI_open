# CATIA Part Design tools in the 3D Design tab, driven by 2D sketches

Status: Done  <!-- Awaiting approval | In progress | Done -->
Sources: docs/inputs/catia-part-design-fr.md (structured summary: `CATIA_PART_DESIGN_TOOLS.md`), user chat message 2026-09-29 ("do the changes under 3D design tab linking 2D sketches to 3D desgn")

Scope: the **3D Design** tab of `ai-engine/faelyx-ui` (App.tsx toolbox,
Properties panel, model tree, viewport), plus backend additions in
`ai-engine/cad-server` where an op doesn't exist yet. Every sketch-based
tool takes its profile from the Sketch & 2D workspace.

## Change requests

### 1. Build every sketch-based feature on the sketch's own plane
- [x] Done
- **What:** A feature built from the current sketch uses the plane the sketch was drawn on, following the plane picker's own labels: Top = XY (normal +Z), Front = XZ (normal −Y, H = +X, V = +Z), Right = YZ (normal +X, H = +Y, V = +Z). The sketch origin marker maps to the world origin. Each plane has an **offset along its normal**, shown and editable in Properties. It defaults to the current stack height for that plane, and a Pad still raises it, as the XY stack does today. The live purple sketch preview in the 3D viewport is drawn on the same plane. Reference Planes created in 3D can be picked as the sketch support. Sketch on Face keeps working as it does now. Features saved before this change have no `plane` field and rebuild exactly as before.
- **Where:** 3D Design → `App.tsx` (`commitPadPocket`, `commitRevolve`, `ModelViewport` sketch preview), `SketchWorkspace` handle (`getProjectData().plane`)
- **Source:** manual L518–L520: "Par défaut, CATIA extrude de façon perpendiculaire au plan utilisé pour créer le profil"; PlanePicker.tsx labels; user message
- **Acceptance criteria:**
  - A rectangle sketched on Front and padded 20 mm gives a solid spanning Y ∈ [−20, 0], standing up in XZ.
  - The same rectangle sketched on Right gives a solid along +X. On Top it gives a solid along +Z.
  - The 3D sketch preview sits on the matching plane before Apply.
  - A project saved before this change loads and rebuilds the same solid.
- **Open questions:** A1, A2
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`, `tests/unit/partDesign.test.ts`, `tests/e2e/part-design.spec.ts`, `tests/e2e/sketcher.spec.ts`
- **Verification:** Unit: 6 frame tests (origin marker → world origin on all planes; H/V → X/Z on Front, Y/Z on Right, X/Y on Top; offsets along normal; reference planes). E2E *a sketch builds on its own plane*: Front 40×30 pad 20 → sent `normal [0,-1,0]`, bbox 40×20×30; Right pad → `normal [1,0,0]`. E2E *project saved before this change*: old-format project opens and sends a byte-identical `/build_part` request, 24,000 mm³. Screenshot: sketch preview drawn on Top (XY). Found and fixed during verification: revolve axes went through the canvas corner, so profiles are now sketch-local (`toLocal`); `sketcher.spec.ts` chamfer test updated to convert back to canvas coordinates. Pass.

### 2. Reorganize the 3D toolbox into CATIA Part Design toolbars
- [x] Done
- **What:** Replace the current sections (CREATE FEATURES / MODIFY / PATTERN & MIRROR / REFERENCE GEOMETRY / SURFACE MODELING) with CATIA groups: **Sketch-Based Features** (Pad, Pocket, Shaft, Groove, Hole, Rib, Slot, Stiffener, Multi-sections Solid, Removed Multi-sections Solid), **Dress-Up Features** (Edge Fillet, Variable Fillet, Chamfer, Draft, Shell, Thickness, Thread/Tap, Remove Face), **Surface-Based Features** (Split), **Transformation Features** (Translation, Rotation, Symmetry, Mirror, Rectangular Pattern, Circular Pattern, User Pattern, Scaling), **Boolean Operations** (Insert Body, Add, Remove, Intersect, Assemble), **Reference Elements** (Plane, Axis, Coordinate System), then the existing Inspect and AI sections. Tools with no working implementation are listed as "not available yet" (disabled, with the reason in the tooltip), not shown as clickable placeholders.
- **Where:** 3D Design → toolbox panel → `App.tsx` `modelTools`, `REAL_TOOLS`, `TREE_NAME_TOOLS`
- **Source:** `CATIA_PART_DESIGN_TOOLS.md` §1–§6 (manual "Atelier Part Design" toolbars, L138 onward)
- **Acceptance criteria:**
  - Toolbox shows the six CATIA groups in that order, each tool with a tooltip.
  - Every enabled tool opens Properties with working inputs. No enabled tool shows "Not yet implemented".
- **Open questions:** A4
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`, `ai-engine/faelyx-ui/src/index.css`
- **Verification:** E2E *toolbox is organised as CATIA Part Design toolbars*: first six groups in order, 13 core tools enabled, Thick Surface disabled. Unit: every enabled feature/modifier tool is handled by `buildOperation`. Screenshot reviewed; the Pocket/Split icons were blank (a bug that predates this work, in `ScissorsIcon` sizing) and are fixed. Pass.

### 3. Pad / Pocket definition options
- [x] Done
- **What:** Pad and Pocket Properties get: **Type** (Dimension / Up to last), **Length**, **Reverse direction**, **Mirrored extent**, **Second limit** length, **Thick** with Thickness1 / Thickness2. These are sent as `limit`, `reverse`, `mirrored`, `depth2`, `thin1`, `thin2` (backend already supports them).
- **Where:** `App.tsx` `PropertiesPanel`, `AppFeature`, `toApiFeatures`
- **Source:** manual L532–L550 (limits, Extension symétrique, seconde limite), L632–L650 (Jusqu'au dernier), L802–L807 (Pocket limits)
- **Acceptance criteria:** Each option changes the built solid's volume and bounding box as expected (for example, a 10×10 mirrored pad of 5 spans −5..+5; Up to last on a pocket cuts through the whole part).
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Unit: Pad sends `limit/depth2/mirrored`, Pocket Up to last + thick. E2E *Pad definition options*: mirrored 10 → bbox z 20; edited to 15 + second limit 5 → 2,000 mm³. Pass.

### 4. Shaft options and new Groove tool
- [x] Done
- **What:** Shaft (current "Revolve") gets **First angle**, **Second angle** and **Thick**. The axis is the sketch plane's H or V axis through the sketch origin. New **Groove** tool: same inputs, removes material (`op:"groove"`).
- **Where:** `App.tsx` `commitRevolve` → generalized, `PropertiesPanel`
- **Source:** manual L946–L960 (Premier angle / Second angle), L970–L1039 (Gorge)
- **Acceptance criteria:** A 90° + 90° shaft gives a half solid of revolution. A groove on a revolved cylinder reduces its volume by the revolved profile's volume.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Unit: groove angles 100 + 60, > 360° rejected. E2E *Shaft about the Front sketch V axis*: ring π(20²−10²)·20 = 18,850 mm³; Groove removes π(20²−15²)·5. Pass.

### 5. Hole with CATIA definition
- [x] Done
- **What:** The Hole tool uses the sketch's circles as positions (and their size as the default diameter). Properties: **Type** (Simple / Counterbored / Countersunk + their diameter/depth/angle), **Extension** (Blind + depth / Up to last), **Diameter**, **Bottom** (Flat / V-bottom + angle), **Threaded** + designation (e.g. M10), which sets the core diameter. Sent as `op:"hole"` with a `hole` spec.
- **Where:** `App.tsx` (replaces today's "Hole = pocket of circles")
- **Source:** manual L1041–L1125, L1166–L1322
- **Acceptance criteria:** A counterbored Ø10 × 20 hole with a Ø16 × 5 counterbore removes the analytically expected volume. Invalid combinations (counterbore Ø ≤ hole Ø) show the backend's message in the error banner.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Unit: counterbored threaded spec from circles; no circle → error. E2E *counterbored hole*: 24,000 − (π·8²·5 + π·5²·15) mm³, plane offset auto-raised to 20. Screenshot of Hole.1 edit panel. Pass.

### 6. Captured sketches listed in the model tree
- [x] Done
- **What:** A **"Keep sketch"** action in 3D Design stores the current Sketch & 2D sketch as `Sketch.N` (its loops, open path, plane and offset) under a SKETCHES node in the model tree, then clears the canvas for the next sketch. Tools that need more than one sketch (Rib/Slot center curve, Multi-sections sections) pick from these by name. Pad/Pocket/etc. keep using the live sketch as today.
- **Where:** `App.tsx` model tree + state; SketchWorkspace handle (read open chains from `getProjectData`)
- **Source:** manual L1364–L1376 (Rib: profile *Sketch.2*, center curve *Sketch.1*), L1531 / L1596 (multi-sections pick several sketches)
- **Acceptance criteria:** Two sketches kept on different planes show as Sketch.1 / Sketch.2 in the tree, survive Save/Open, and are selectable in item 7 and item 8 dropdowns.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`, `ai-engine/faelyx-ui/src/PartDesignPanel.tsx`
- **Verification:** E2E *Rib*: Keep Sketch → tree shows `Sketch.1 (Front, open chain)`, selectable as center curve. Save/Open payload includes `keptSketches` (E2E *Save and Open*). Pass.

### 7. Rib and Slot
- [x] Done
- **What:** **Rib** / **Slot**: profile = current sketch; **center curve** = a kept sketch whose open chain of lines/arcs is mapped to 3D through that sketch's plane. **Profile control**: Keep angle / Pulling direction (Frenet). Sent as `op:"rib"` / `"slot"` with `path`.
- **Where:** `App.tsx`
- **Source:** manual L1338–L1481
- **Acceptance criteria:** A circle on Right swept along a straight + arc center curve drawn on Front gives a bent tube. A Slot of the same cuts a channel.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Unit: Rib needs a kept open chain, sends 3D path. E2E *Rib*: circle r5 on Right swept along a 60 mm Front line → path (0,0,0)→(60,0,0), volume π·25·L. Slot shares the code path (backend-tested). Pass.

### 8. Multi-sections Solid and Removed Multi-sections Solid
- [x] Done
- **What:** Pick ≥ 2 kept sketches (each one closed profile, on parallel or non-parallel planes) in order. **Ruled** option. Sent as `op:"loft"` / `"removed_loft"` with `sections` carrying each sketch's plane.
- **Where:** `App.tsx`
- **Source:** manual L1521–L1629
- **Acceptance criteria:** A square on Top at offset 0 and a circle on Top at offset 30 give a square-to-round transition solid. The removed version cuts it from an existing pad.
- **Open questions:** none (guide curves and coupling stay out of scope, see Pending)
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Unit: two single-profile sections required; frames sent per section. Backend loft/removed_loft covered by existing `test_catia_features.py`. Not driven through the browser. Pass (unit + backend).

### 9. Stiffener (new backend op)
- [x] Done
- **What:** New `op:"stiffener"` in `part_features.py`: an **open** profile from the sketch is thickened by **Thickness** (symmetric about the sketch plane when **Mirrored extent** is on, which is the default, or to one side when off). It is filled from the profile toward the material side and clipped to the existing part's bounding box, then fused. UI tool under Sketch-Based Features, using the sketch's open chain.
- **Where:** `ai-engine/cad-server/part_features.py`, `cad_server.py` (allow feature with a path/open chain), `tests/test_catia_features.py`, `App.tsx`
- **Source:** manual L1483–L1519
- **Acceptance criteria:** On an L-bracket (two 10 mm walls, 50 × 50), a diagonal line from wall to wall with thickness 4 adds a triangular web whose volume matches ½·a·b·4 within 1 %. Backend test covers it.
- **Open questions:** A3
- **Files touched:** `ai-engine/cad-server/part_features.py`, `ai-engine/cad-server/cad_server.py`, `ai-engine/cad-server/catia_api.py`, `ai-engine/cad-server/tests/test_catia_features.py`, `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Backend `TestStiffener` (5 tests): L-bracket web = 18,000 + 450·4 mm³ within 1 %, one-sided, reversed profile, no material → error, closed profile → error. E2E *Stiffener*: web matches ½(c − walls)²·4 against the clicked geometry. Partial by design (A3): fills to the bounding box. Pass.

### 10. Face selection for Dress-Up tools
- [x] Done
- **What:** In Select mode, clicking faces of the part adds them to a **Selected faces** list in Properties (point + face type from `/face_at`, with remove and clear). Dress-up tools use it (items 11–13). With no faces picked, each tool falls back to its keyword default (e.g. Shell = top face) and says so.
- **Where:** `App.tsx` (`handleFacePicked`), `PropertiesPanel`
- **Source:** manual L1636–L1669 (each dress-up starts by selecting edges/faces), L2254 (Coque: "Sélectionnez la face à supprimer")
- **Acceptance criteria:** Clicking two faces lists two entries. Removing one updates the list. The list is sent as `facePoints`.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`, `ai-engine/faelyx-ui/src/PartDesignPanel.tsx`
- **Verification:** E2E *Edge Fillet on a face picked in the viewport* and *Thread refuses a planar face*: clicking the part adds one `.pd-face-row` with its type; sent as `facePoints`. Pass.

### 11. Edge Fillet, Chamfer and Variable Fillet on selected faces' edges
- [x] Done
- **What:** Fillet / Chamfer act on the edges of the selected faces (the manual allows selecting a face whose edges are rounded/chamfered). Otherwise they use the existing edge filter. New **Variable Fillet** tool: radius 1 → radius 2 along each edge. Backend: `fillet`, `chamfer` and `variable_fillet` accept `facePoints` and resolve them to the faces' edges.
- **Where:** `cad_server.py` / `part_features.py`, tests, `App.tsx`
- **Source:** manual L1636–L1652, L1671–L1699, L1753–L1808, L1926–L1945 ("Vous pouvez également créer des chanfreins en sélectionnant une face")
- **Acceptance criteria:** Filleting only a box's top face edges changes its volume by the expected 4-edge amount and leaves bottom edges sharp. Backend tests cover it.
- **Open questions:** none
- **Files touched:** `ai-engine/cad-server/part_features.py` (`edges_of_faces`), `ai-engine/cad-server/cad_server.py`, `ai-engine/cad-server/tests/test_catia_features.py`, `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Backend `TestDressUpByFace` (3): fillet/chamfer of the top face's edges remove between 4·16 and 4·20 × the per-edge section with bbox unchanged; variable fillet by face builds. E2E fillet by picked face reduces volume. Existing e2e *3D chamfer with length + angle* still passes (labels and reverse maths kept). Pass.

### 12. Draft Angle
- [x] Done
- **What:** Draft tool: **Angle**, **Pull direction** (+X…−Z), **Neutral element** (default: the face the part stands on), faces = selected faces or all side faces. Sent as `op:"draft"`.
- **Where:** `App.tsx`
- **Source:** manual L1953–L2000
- **Acceptance criteria:** A 5° draft on a 20 × 20 × 20 box's sides, neutral at the bottom, shrinks its top face to 20 − 2·20·tan 5° per side.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Unit: default draft = 5°, +Z, side faces. E2E *Draft*: 20³ box → frustum volume with top 20 − 2·20·tan 5°. Pass.

### 13. Shell, Thickness, Remove Face, Thread/Tap
- [x] Done
- **What:** **Shell**: faces to remove = selected faces (default top), **Inside thickness**, **Outside thickness**. **Thickness**: signed value on the selected faces. **Remove Face**: selected faces (replaces the "Delete Face" placeholder). **Thread/Tap**: selected cylindrical face, designation (e.g. M10), depth, thread/tap. The result (valid or the backend's diameter mismatch) is shown, and the thread appears in the tree.
- **Where:** `App.tsx`
- **Source:** manual L2249–L2330
- **Acceptance criteria:** Shell of a box opening the picked side face (not the top) has that side open. Thickness +2 on one face grows the bbox by 2 on that axis. Thread M10 on a Ø10 cylinder is accepted and on Ø12 is rejected with a message.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** E2E: Thread/Tap on a planar face → error toast 'cylindrical', not added to the tree. Shell with picked faces, Thickness, Remove Face, Thread size check are covered by existing backend tests; Shell (default top face) round-trips in E2E *Save and Open*. Not every variant was clicked through in the browser.

### 14. Split by plane
- [x] Done
- **What:** Split tool: plane XY/YZ/ZX (or a reference plane) + offset, **side to keep** toggle. Sent as `op:"split_body"`.
- **Where:** `App.tsx`
- **Source:** manual L2472–L2487
- **Acceptance criteria:** Splitting a 20 mm tall box at Z = 5 keeping + gives a 15 mm tall solid. Flipping gives 5 mm.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Unit: plane spec for XY offset 5 keep −. E2E *transformations*: split at Z=4 of a 10 mm pattern → bbox z 6. Pass.

### 15. Transformation features
- [x] Done
- **What:** **Translation** (direction X/Y/Z + distance), **Rotation** (axis X/Y/Z through a point + angle), **Symmetry** (plane, original not kept), **Mirror** (existing, kept), **Rectangular Pattern** + optional second direction (instances & spacing each), **Circular Pattern** about X/Y/Z, **User Pattern** (instance offsets, entered as a list or taken from the sketch's points), **Scaling** about a point (uniform) or along an axis (affinity).
- **Where:** `App.tsx`
- **Source:** manual L2570–L2660, L2644–L2745, L2789–L2851, L2901, L2983–L3005
- **Acceptance criteria:** Each op changes the bbox or volume as expected (e.g. a 3 × 2 rectangular pattern gives 6× the volume for non-overlapping instances; affinity 1.6 along Y scales only Y).
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** Unit: translation vector, affinity scale vector, circular spacing → angle, user pattern from sketch points. E2E: rectangular pattern 3×2 → 6× volume. Translation/Rotation/Symmetry/Circular/User/Scaling ops themselves are backend-tested. Pass.

### 16. Bodies and Boolean operations
- [x] Done
- **What:** **Insert Body** creates Body.N and makes it the active body (features and modifiers go to the active body; the tree groups them per body and lets you switch the active body). **Add / Remove / Intersect / Assemble** take a tool body and a target body. With more than one body, the part is built through `/build_bodies`.
- **Where:** `App.tsx` (state, tree, rebuild path)
- **Source:** manual L4343–L4360 and sections from L4387
- **Acceptance criteria:** Body.2 (a cylinder) Removed from PartBody (a box) gives a box with a hole. Intersect gives the common volume. Save/Open keeps the bodies.
- **Open questions:** A4
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** E2E *Insert Body + Remove*: Body.2 badge 'active'; its pad goes through `/build_bodies`; Remove op sent with tool Body.2 → PartBody volume 24,000 − π·25·20. Pass. Limitation: a body's dress-up features apply before Booleans (backend order).

### 17. Edit and delete features from the model tree
- [x] Done
- **What:** Selecting a feature/modifier in the tree loads its parameters into Properties with an **Update** button that rebuilds with the edited values. A **Delete** action removes it (and anything that can no longer build shows the backend error).
- **Where:** `App.tsx` tree + PropertiesPanel
- **Source:** manual `CATIA_PART_DESIGN_TOOLS.md` §7 ("Modification de composants", "Suppression de composants"), L775–L776 ("double-cliquer sur l'élément approprié")
- **Acceptance criteria:** Changing Pad.001's length from 20 to 30 and clicking Update changes the solid. Deleting a fillet restores sharp edges.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`, `ai-engine/faelyx-ui/src/PartDesignPanel.tsx`
- **Verification:** E2E *Pad definition options, then edit*: tree click → 'Update Pad.1', rebuilt with new values (one feature, not two). E2E *Draft … Delete*: hover delete removes Draft.1 and rebuilds with 0 modifiers. Failed builds are rolled back (seen in manual check with an invalid countersink). Pass.

### 18. Save/Open keeps all 3D state
- [x] Done
- **What:** The project payload today saves only `features`, `stackTop`, `sketchSupport`, so **modifiers and reference geometry are lost on reload** (existing bug). Save and restore modifiers, reference geometry, kept sketches, bodies and per-plane offsets.
- **Where:** `App.tsx` `saveProject` / `loadProject` / dirty tracking
- **Source:** required for items 6, 16 (kept sketches and bodies must "survive Save/Open"). Found during audit.
- **Acceptance criteria:** Save → reload → Open rebuilds an identical solid including fillets/patterns.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/src/App.tsx`, `ai-engine/faelyx-ui/src/partDesign.ts`
- **Verification:** E2E *Save and Open*: payload has `modifiers` and `planeOffsets.Top = 20`; reopening rebuilds with the Shell modifier and shows Shell.1. Pass.

### 20. Keep docs/inputs and docs/changes out of publish:docs cleanup
- [x] Done
- **What:** Add `--exclude inputs/ --exclude changes/` to the `publish:docs` rsync in `ai-engine/faelyx-ui/package.json`.
- **Where:** `ai-engine/faelyx-ui/package.json`
- **Source:** A5 (approved 2026-09-29)
- **Acceptance criteria:** The script excludes both folders.
- **Open questions:** none
- **Files touched:** `ai-engine/faelyx-ui/package.json`
- **Verification:** Script now excludes `inputs/` and `changes/`. Not run (it rebuilds and rewrites `docs/`). Pass.

### 19. Documentation
- [x] Done
- **What:** Update `CATIA_FEATURE_MAP.md` / `README.md` ("Most aren't wired into the UI yet") and the audit table in `CATIA_PART_DESIGN_TOOLS.md` §9 to the final state.
- **Where:** repo root docs
- **Source:** task step 3
- **Acceptance criteria:** Docs match what the UI does.
- **Open questions:** none
- **Files touched:** `README.md`, `CATIA_FEATURE_MAP.md`, `CATIA_PART_DESIGN_TOOLS.md`, `ai-engine/cad-server/catia_api.py` (catalogue)
- **Verification:** Docs updated to the final state; `/catia/features` lists `stiffener` and `facePoints`. Pass.

## Pending (not in this list; reasons in `CATIA_PART_DESIGN_TOOLS.md` §9)
Up to next / Up to plane / Up to surface limits and non-perpendicular direction (need face-ray limit logic in the backend); Pocket *Reverse side*; Drafted Filleted Pad/Pocket; Tapered and counterdrilled holes; Face-Face and Tritangent fillets, multi-point/spine variable fillets; draft variants (parting element, reflect lines, variable angle, two-sided); Thick Surface / Close Surface / Sew Surface / split by surface (no surface-modelling layer); Multi-sections guide curves, spine and coupling; patterns of a single feature (patterns act on the whole body); reference point/line creation modes; 3D constraints, annotations, PowerCopy, reorder.

## Ambiguities and conflicts
- **A1.** The sketcher opens on **Front** by default, and today a Front sketch is built on XY (horizontal). Item 1 makes Front mean XZ (vertical) as the plane picker already labels it, so the default workflow's parts will stand up instead of lying flat. Options: **(a)** follow the picker labels, Front = XZ (recommended, matches CATIA and the UI's own labels) / **(b)** keep building Front on XY and only map Top/Right.
- **A2.** Today's parts sit at canvas coordinates, offset (200, −150) mm from the world origin. Item 1 puts the sketch origin marker at the world origin for new features. Old saved features keep their old position, so mixing old and new features in one project may look offset. Options: **(a)** new features use the sketch origin (recommended) / **(b)** keep canvas coordinates.
- **A3.** CATIA's Stiffener extrudes "until existing material". Item 9 fills toward the material side and clips to the part's bounding box. That is exact for walls meeting at a corner (the manual's example) but can overfill complex shapes. Options: **(a)** accept and document as partial / **(b)** drop Stiffener to Pending.
- **A4.** Scope: 19 items is a large change to one 1,465-line `App.tsx`. Items 16 (bodies) and 17 (edit) are the largest. Options: **(a)** do all 19 in order / **(b)** do 1–15 + 18–19 now and leave 16–17 for a follow-up.
- **A5.** `npm run publish:docs` runs `rsync --delete` into `docs/`, excluding only `docs/reference/`, so it **would delete `docs/inputs/` and `docs/changes/`**. Suggestion: add `--exclude inputs/ --exclude changes/` to that script. Not done without your OK.

## Decisions (2026-09-29)
- A1 → (a) Front = XZ, Top = XY, Right = YZ; sketch origin at world origin (A2 → (a)).
- A3 → (a) Stiffener included as partial, limitation documented.
- A4 → (a) all items.
- A5 → yes, add excludes (item 20).

## Log
- 2026-09-29: PDF converted to `docs/inputs/catia-part-design-fr.md` (markitdown 0.1.8, text layer OK, 6,781 lines). Structured summary written to `CATIA_PART_DESIGN_TOOLS.md`. Baseline: backend `pytest` 100 passed; frontend `npm run typecheck` clean.
- 2026-09-29: List created from the sources above; scoped to the 3D Design tab per the user's message.
- 2026-09-29: Approved by user with the decisions above. Status → In progress.
- 2026-09-29: Backend: face-edge selection for fillet/chamfer/variable fillet, new Stiffener op; 108 backend tests pass (100 existing + 8 new).
- 2026-09-30: Frontend: `partDesign.ts` (plane mapping, tool catalogue, buildOperation), `PartDesignPanel.tsx`, App.tsx toolbox/tree/rebuild/save rewired. Verification fix: sketch-local profiles so revolve axes pass through the sketch origin.
- 2026-09-30: Verification totals — backend pytest 108 passed; `npm run typecheck`, `npm run lint`, `npm run build` clean; vitest 44 passed; Playwright 13 new Part Design tests pass; full suite 64 passed + 4 failing tests in Sketch & 2D (chamfer dimension double-click, circle-centre delete, Exit Plane axes, plane-picker label position) that fail identically with the original App.tsx from `Faelyx-AI-public-main 2.zip`, i.e. they failed before this work.
- 2026-09-30: All items done. Status → Done.
