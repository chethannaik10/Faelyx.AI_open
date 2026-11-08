<!-- source: text pasted into chat | converted: 2026-10-05 -->

Feature Update Prompt: View Control Menu Refactoring & Grid Plane Offset
Please update the 3D Design workspace UI and viewport rendering logic with the following specification changes:

1. Relocate View Orientation Controls to Top-Right
Current State: Orientation options (Front, Back, Left, Right, Top, Bottom, ISO, etc.) are displayed as text buttons along the bottom control bar of the 3D viewport.

Target Changes:

Remove Bottom Bar Controls: Remove all orientation text buttons (FRONT, BACK, LEFT, RIGHT, TOP, BOTTOM, ISO) from the bottom navigation/display toolbar.

Add Top-Right Vertical Kebab / Options Icon:

Position a vertical options icon (⋮ or kebab menu icon) in the top-right corner of the 3D viewport area (near the view cube / navigation gizmo).

Clicking this icon should trigger a dropdown menu listing all available standard and custom orientation views:

Isometric (Iso)

Front

Back

Left

Right

Top

Bottom

Named Views (sub-menu or section for user-defined saved camera angles)

2. Adjust Reference Plane Elevation Above the Grid
Current State: The default origin reference planes (Front Plane, Top Plane, Right Plane) intersect directly at the ground grid level (Z=0).

Target Changes:

Adjust the default 3D coordinate/rendering position of the origin reference planes so that they float at an elevated offset above the background ground grid plane.

Ensure the reference grid remains rendered at the ground baseline (Z=0), while the primary origin system/planes display clearly above it to improve depth visibility and separation.
