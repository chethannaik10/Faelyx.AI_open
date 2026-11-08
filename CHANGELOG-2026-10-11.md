# Changelog — 2026-10-11

All changes are in `ai-engine/faelyx-ui/src` (frontend) and `ai-engine/cad-server` (backend).
Universal mouse scheme untouched (LMB select / box select, MMB pan, MMB+RMB zoom/orbit).

## 3D Design
- **Rib / Slot** options per the CATIA workflow: profile control (keep angle, Frenet, pulling direction, reference surface), pulling direction, move profile, transition, thin 1 / thin 2. Frontend payload verified; backend (`part_features.py`, `cad_server.py`) not run. "Merge rib's ends" is not implemented.
- **Reference Plane** types: offset, parallel through point, angle/normal to plane, three points, two lines, point and line, planar curve, normal to curve, tangent to surface, equation, mean through points. Tilted planes are stored as a frame and drawn in the viewport; a tilted plane can be a sketch support / Pad support.
- **Reference Point** types: coordinates, on curve, on plane, on surface, center, tangent to curve, between, plane intersection.
- **Reference Line** types: point–point, point–direction, angle/normal to curve, tangent, normal to surface, bisecting.
- Click-to-pick points in the 3D view fill the first/second/third point fields in order.
- **Plane fields**: clicking a plane in the 3D view or in the model tree now fills the plane field of Angle/Normal, Parallel through point, Point on plane and plane-intersection tools. Angle/Normal's rotation axis defaults to the picked plane's own horizontal axis through its origin (new "horizontal / vertical axis of the reference plane" options).
- Custom planes are labelled "(custom plane)" in the tree and menus.

## Both workspaces
- **How to use** step-by-step panel in the right pane (Sketch & 2D and 3D Design).
- **Enter** confirms the open dialog / panel everywhere (`universalEnter.ts`).

## Known gaps
- No live preview of a tilted plane before Create; no hover highlight for tilted planes.
- Solid builds (Pad, Rib on tilted planes) untested because the backend was offline.
- Reference geometry is not kept across a page reload.
