<!-- source: text pasted into chat | converted: 2026-10-04 -->

Act as a Senior CAD Software Developer. Implement an automatic sketch-to-3D workspace transfer feature in the application with the following specifications:

1. Automatic Workspace Transition:
   - When the user exits the "Sketch & 2D" workbench, automatically switch the active view/tab to the "3D Design" workspace.
   - Automatically carry all active or newly created sketch profiles (from Front, Top, Right, or custom reference planes) into the 3D Design viewport without requiring manual export or confirmation.

2. Visual & Spatial Positioning:
   - Render the transferred sketch curves directly in the 3D Design viewport as 3D visual wireframe profiles ("kept sketches").
   - Position each sketch with a slight offset along its plane normal vector so that it visually floats above its origin/reference plane rather than clipping into or lying flush against it.
   - Maintain the sketch's parametric relationship to its parent reference plane so any subsequent Pad, Shaft, or Multi-Sections operation references the correct 3D spatial alignment.

3. Tree & Feature Management:
   - Automatically record the sketch under the Model Tree as a kept sketch (e.g., `Sketch.1`, `Sketch.2`) under `PartBody` or `Faelyx_Project`.
   - Keep the sketch profile highlighted or selected by default so the user can immediately select 3D tools (such as Pad, Pocket, or Shaft).
