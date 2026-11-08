# Faelyx AI — Sketch & 2D Workspace Changes (Sept 20, 2026)

Session summary of everything changed today in `ai-engine/faelyx-ui`, working live against Devesh's laptop. All items below were verified locally (esbuild compile checks + Playwright rendering checks) before being committed to the device.

## Files touched

- `ai-engine/faelyx-ui/src/SketchWorkspace.tsx`
- `ai-engine/faelyx-ui/src/App.tsx`
- `ai-engine/faelyx-ui/src/index.css`

Committed to: `C:\Users\Devesh\Downloads\Faelyx-AI-public-main\ai-engine\faelyx-ui\src\`

## What changed

**Isometric plane picker fixed.** The Front/Top/Right plane-picker cube wasn't rendering correctly — a leftover mismatch between an older version of the component and newer CSS. Rebuilt it as one consistent, working isometric cube.

**Exit Plane button.** The small icon next to Front/Top/Right is now a text button, "Exit Plane," that reopens the plane-picker screen so you can choose a different plane.

**X/Y axis compass.** A small widget in the top-right of the sketch canvas always shows which way X and Y point, and it rotates along with the view.

**View rotation.** Alt + middle-drag or Alt + right-drag now rotates the 2D view around its center, the same modifier-drag pattern as pan.

**Draggable, editable dimensions.** A dimension's number/unit label can be dragged anywhere along its dimension line. Double-clicking the label lets you type a new length (or radius/diameter), and the real geometry resizes to match through the constraint solver.

**Thinner, lighter dimension lines.** Extension lines, dimension lines, and arrowheads were made thinner and given some transparency, to match the cleaner look you referenced, without dropping any of the pieces (extension lines, arrows, leader).

**Diameter vs. radius convention.** Circles now always default to showing Diameter ("D 100.00 mm"); arcs keep showing Radius ("R 53.85 mm"). Editing either still converts correctly under the hood.

**Dimensions persist across plane switches.** Measurements no longer disappear when you switch Front → Top → Right and back. A dimension stays exactly as you left it until you explicitly delete it. It only gets cleared for real when you load a different project or "Load Example," since that discards the geometry it was measuring anyway.

**Delete a measurement without deleting the geometry.** Clicking a dimension's line or label now selects just that measurement (highlighted in red/pink, distinct from the green "entity selected" color). Pressing Delete/Backspace removes only the measurement — the circle, arc, or line it was measuring is untouched. Clicking elsewhere or pressing Escape deselects it.

**Simplified bottom status bar.** Removed the MMGS unit dropdown, X/Y/Z coordinate readout, Selection label, and the Material/Mass/System block. The bar now shows just two buttons: Snap and Grid, each a single click to toggle ON/OFF.

**Sketch origin marker.** Every plane, the moment it's opened, now shows a fixed starting point: yellow H (horizontal) and V (vertical) arrows from a small center dot, plus a faint green horizontal reference line running the width of the canvas — matching the reference image you sent. It's a visual landmark only (doesn't snap or affect constraints), there so you always have an obvious place to start a new sketch from.

## Verification approach

Each change was checked two ways before shipping: an `esbuild` bundle/syntax check on the edited files, and a Playwright-rendered visual/interaction check in an isolated test harness (screenshots + scripted clicks/drags/keypresses) reproducing the exact logic added. After every commit to the device, the file was re-staged and its checksum compared against the local copy to catch a known intermittent issue where the first commit attempt can silently land stale content — a couple of today's commits needed exactly one retry, which was caught and corrected before moving on.
