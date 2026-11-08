<!-- source: text pasted into chat | converted: 2026-10-04 -->

Act as a Lead CAD/UI Software Engineer. Implement an updated sketch workflow and 3D plane interface for our application with the following technical and visual specifications:

1. 3D Design Plane Visibility & Sizing:
   - Make the 3 Primary Axis Planes (Front, Top, Right) permanently visible when in the "3D Design" workspace.
   - Scale down the default visual representation of these planes so they appear compact and non-obtrusive relative to the main viewport model space.

2. Automatic Workspace Transition & Visual Consistency:
   - When the user clicks "Exit Workbench" in the 2D Sketch environment:
     a. Automatically auto-save all active sketch changes.
     b. Transition the viewport seamlessly to the "3D Design" workspace.
     c. Render all 3 axis planes using the same refined color palette/color-grade as seen in the 2D Sketch environment for brand and UI continuity.

3. Interactive Re-entry & Auto-Update Loop:
   - Double-clicking directly on any axis plane (or an existing sketch on that plane) in the 3D viewport should immediately open that plane/sketch inside the "Sketch & 2D" workbench.
   - Modifying a sketch and clicking "Exit Workbench" must automatically auto-save, update all dependent 3D features/geometry in real time, and return the view to "3D Design".

4. Plane Indicator / Orientation Cube Enhancements:
   - Redesign the top-right plane reference indicator / orientation view cube to be sleek, modern, and compact.
   - Include smooth hover states, clean typography, and subtle visual highlighting for active plane selections.

5. Supplemental Enhancements (Edge Cases & Usability):
   - Add a UI toggle in View Settings to show/hide plane visuals on demand in 3D mode.
   - Ensure non-destructive auto-saving with an optional "Undo/Revert" stack so users can step back if an auto-saved change breaks a downstream 3D feature.
   - Maintain parametric parent-child relationships so editing a sketch plane automatically propagates to linked 3D operations (Pad, Pocket, Shaft, etc.).

Key Additions Included:
Show/Hide Planes Toggle: Allows users to clean up their viewport when working on dense 3D models.

Non-Destructive Auto-Save Safety: Ensures that auto-updating a sketch doesn't accidentally break dependent 3D features without a way to undo.

Parametric Propagation: Explicitly instructs the engine to re-calculate downstream 3D operations (extrusions, cuts) whenever the underlying 2D sketch auto-updates.
