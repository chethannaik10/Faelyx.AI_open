# 3D Design: sketch links, edge selection and on-canvas editing

Status key: **Built** = in the app now. **Planned** = specified here, not yet built.

## 1. Model: what a feature knows about its sketch

Every sketch-based feature (Pad, Pocket, Shaft, Groove, Rib, Slot, Hole, Multi-sections Solid, and so on) is stored with:

- `sketchId`: the kept sketch it was built from (Sketch.1, Sketch.2, …). **Built.**
- `source`: a stored copy of that sketch's profile (closed loops, open chain, points) taken when the feature was last built. It is the fallback if the sketch is deleted. **Built.**
- `form`: the values in the definition box (depth, angle, direction, and so on). **Built.**
- Tools that take several sketches (Rib's center curve, Multi-sections' sections) hold their sketch ids in `form`, and `featureSketchIds()` collects all of them. **Built.**

A kept sketch holds its 2D geometry (`data`), its plane or support, and its 3D frame. Editing a sketch calls `applySketchChange`, which re-derives every feature that uses it (`relinkFeature`) and rebuilds the whole feature list. If the rebuild fails, the last good solid stays on screen, the error names the failing feature, and Ctrl+Z undoes the sketch change. **Built.**

## 2. Interaction flow

### 2.1 Create a feature

1. In Sketch & 2D, draw a closed profile and click **Exit Workbench**. The sketch is kept as Sketch.N and shown in 3D just above its plane. **Built.**
2. In the 3D Design toolbox, pick a tool (for example Pad). The Properties tab opens with **SKETCH → 3D**. The Profile list shows kept sketches that fit the tool, plus "Current sketch in Sketch & 2D". **Built.**
3. Set the definition-box fields (depth, direction, …). The viewport shows the sketch the feature will use.
4. Click **Apply changes**. The server builds the part first; only a successful build adds the feature to the tree. **Built.**

### 2.2 Edit a feature (double-click)

1. Double-click the feature in the model tree. (A single click also opens it.) Properties switch to **EDIT FEATURE**. **Built.**
2. The Inspector shows the definition-box fields filled with the stored values, and a new **PARENT SKETCH** section. **Built.**
3. Change values and click **Update Pad.1**. The feature and everything after it rebuild. If the part can't be built, the change is rejected and nothing is lost. **Built.**
4. Press Esc, or click "Stop editing", to leave Edit Mode without changes. **Built.**

### 2.3 Re-associate a feature with another sketch

1. Open the feature in Edit Mode (2.2).
2. In **PARENT SKETCH**, choose a different kept sketch. Only sketches the tool can use are listed (for example a Pad lists sketches with a closed profile). **Built.**
3. Click **Update**. The feature is re-linked: `sketchId`, its plane and its stored `source` all switch to the new sketch, then the part rebuilds. **Built.**
4. From the same section, **Edit sketch in Sketch & 2D** opens the parent sketch. When you click Exit Workbench, every feature built from it updates. **Built.**

### 2.4 Modify the parent sketch and propagate

1. Double-click a sketch in the tree or in the viewport (or double-click its plane). Sketch & 2D opens on that sketch. **Built.**
2. Edit it and click **Exit Workbench**. The sketch is saved, each feature that depends on it is re-derived, and the part is rebuilt. The project autosaves. **Built.**

### 2.5 Edge-based tools (Fillet, Chamfer, Draft, Shell, Edge Flange) — Planned

1. Pick the tool. The viewport switches to edge selection.
2. Hovering highlights the edge under the cursor. Holding Alt while hovering highlights the whole tangent chain it belongs to. Hovering a face highlights the face and its boundary loop.
3. Click selects an edge or chain. Shift-click or Ctrl/Cmd-click adds to the selection; Ctrl/Cmd-click on a selected edge removes it.
4. The Inspector lists the selected edges (Edge 1 · line · length, …) with a remove button each, and a Clear selection button.
5. Enter the radius or distance; a live preview rebuilds as the value changes. Apply commits it.

### 2.6 On-canvas dimensions — Planned

1. When a feature is selected or being edited, the viewport draws dimension callouts anchored to the model (Pad depth, Fillet radius, Chamfer distance), in the same style as the 2D sketch dimension labels.
2. A single click highlights the dimension and the geometry it measures.
3. A double-click turns the text into an input. Enter applies it, Esc cancels. The value in the Inspector updates at the same time, and the preview rebuilds before anything is committed.

## 3. Edge-case rules

| Situation | Rule | Status |
|---|---|---|
| Rebuild fails when adding or updating a feature | The change is not stored. The error says what failed. The last good solid stays. | Built |
| Rebuild fails after a sketch edit | The sketch change is kept (so nothing you drew is lost). The last good solid stays, the error names the failing feature, and Undo reverts the sketch. | Built |
| Parent sketch deleted | The feature keeps its stored `source` copy and still rebuilds. The Inspector shows a notice and the sketch picker offers every compatible kept sketch to re-link to. | Built |
| Chosen sketch has nothing the tool can use | Update is refused with a message naming the sketch and what the tool needs. | Built |
| Sketch is used by several features | Its plane or support is locked in the feature's panel (change it from the sketch's own panel). The Inspector lists the other features that use it. | Built |
| Deleting several items at once | One rebuild for the whole set. If the part can't be built without them, nothing is deleted. | Built |
| Everything is deleted | The solid is cleared. Ctrl+Z restores it. | Built |
| Feature saved before definition boxes existed ("legacy") | Only Delete is offered. Re-linking and editing are disabled with a notice. | Built |
| Edge or face reference lost after a rebuild | The reference is marked broken in the Inspector (red row) and the feature is flagged in the tree. The user can re-pick it; Update stays disabled until every reference resolves. | Planned |
| Value out of range (negative radius, fillet larger than the edge) | The field turns red with the reason, and Update stays disabled. The preview keeps the last valid result. | Planned |
| Two edits in flight | Only the latest rebuild is shown; earlier previews are discarded. | Planned |

## 4. Engineering Inspection panel layout

Edit Mode for a sketch-based feature (the PARENT SKETCH section is built; the rest of the layout already exists):

```
┌ ENGINEERING INSPECTOR ───────────────────────┐
│ [ AI ASSISTANT ] [ INSPECT ] [ PROPERTIES ]  │
├──────────────────────────────────────────────┤
│ ⚙ EDIT FEATURE                               │
│   Pad.1                                      │
│   (tool description)                         │
│ ──────────────────────────────────────────── │
│ ✎ PARENT SKETCH                              │
│   ⚠ notice if the sketch was deleted         │
│   Sketch  [ Sketch.1 — 1 closed profile … ▾ ]│
│   hint: re-link on Update / auto-updates     │
│   Also used by: Pocket.2                     │
│   [ ✎ Edit sketch in Sketch & 2D ]           │
│ ──────────────────────────────────────────── │
│   Length / depth     [ 20        ] [mm ▾]    │
│   Direction          [ Normal ▾ ]            │
│   Mirrored extent    [ ] …                   │
│ ──────────────────────────────────────────── │
│ ⌖ SELECTED EDGES / FACES   (edge tools)      │
│   Edge 1 · line · 25.0 mm            [ ✕ ]   │
│   Edge 2 · arc  · 12.6 mm            [ ✕ ]   │
│   [ Clear selection ]                        │
│ ──────────────────────────────────────────── │
│   [ ✔ Update Pad.1 ]                         │
│   [ 🗑 Delete Pad.1 ]                        │
│   [ ✕ Stop editing — back to creating new ]  │
└──────────────────────────────────────────────┘
```

Unit dropdowns on numeric fields, and variable (parameter) fields, are **Planned**; today fields are plain numbers in millimetres.

## 5. Delivery order

1. **Built:** parent-sketch picker and re-linking in Edit Mode, lost-sketch handling, double-click on tree items.
2. **Next:** edge hover and multi-select in the viewport for Fillet / Chamfer / Draft / Shell (needs edge IDs from the server's solid, not just the STL mesh).
3. **After that:** on-canvas dimension callouts with double-click editing and live preview.
