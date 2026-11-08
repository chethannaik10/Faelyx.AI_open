<!-- source: text pasted into chat | converted: 2026-10-05 -->

Act as a Lead CAD/UI Software Engineer. Implement essential viewport interaction controls, global keyboard shortcuts, and plane layout positioning for the "3D Design" workspace with the following technical specifications:

1. Standard CAD Keyboard Shortcuts:
   - Implement global keyboard shortcuts for core editing operations within the 3D viewport:
     * Undo (`Ctrl + Z` / `Cmd + Z`): Step back through feature history or viewport transformations.
     * Redo (`Ctrl + Y` / `Cmd + Y` or `Ctrl + Shift + Z`): Step forward through undone actions.
     * Select All (`Ctrl + A`): Multi-select all active elements/sketches in the 3D workspace.
     * Delete (`Delete` / `Backspace`): Delete selected geometry, sketches, or features.
     * Escape (`Esc`): Cancel active tool selection, exit command modes, or deselect highlighted geometry.

2. Intuitive Mouse Navigation & Camera Controls:
   - Pan: Middle Mouse Button (MMB) click + drag (or Right-click + drag).
   - Zoom: Mouse Scroll Wheel up/down (zooming relative to the cursor position) or `Ctrl` + MMB drag.
   - Orbit / Rotate (Revolve): `Alt` + Left-click drag (or MMB + Right-click drag) to orbit around the model origin or active selection center point.
   - Fit to Screen: Double-click MMB or press `F` to frame the entire model in the viewport.

3. Spatial Plane Elevation & Grid Offsetting:
   - Position the primary origin planes (Front, Top, Right) with a slight visual elevation above the ground grid plane so they appear floating rather than clipping into or aligning flush with the grid floor.
   - Add a subtle semi-transparent shadow or glow effect beneath floating planes to reinforce spatial depth in the 3D perspective view.

4. Supplemental Enhancements (UX & Keybindings):
   - Add a configurable "Hotkeys & Navigation Settings" panel so users can customize or switch mouse interaction presets (e.g., CATIA, SolidWorks, Blender, or Autodesk navigation schemes).
   - Display a floating status bar or visual prompt in the bottom toolbar showing active key bindings (e.g., "MMB: Pan | Alt+Drag: Rotate | Scroll: Zoom").


Key Additions Included:
Industry-Standard Mouse Presets: Added navigation mode mapping (CATIA, SolidWorks, Blender style) so users accustomed to other CAD programs feel immediately at home.

Fit-to-Screen Shortcut: Added F or double MMB click, a standard CAD feature to quickly locate models if they zoom too far out.

On-Screen Navigation Helper: Added a visual indicator at the bottom of the screen to guide users on mouse actions while navigating in 3D.
