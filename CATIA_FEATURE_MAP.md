# CATIA V5 feature map — Faelyx AI

Source: *CATIA V5 Basic Training* (TU Graz, Lang & Macheiner, 2009 — based
on CATIA V5 R15). Every tool, feature, and workflow the script
describes is listed below and mapped to Faelyx's implementation.

**Status key**

| | Meaning |
|---|---|
| ✅ existing | was already in Faelyx before this work (backend and/or UI) |
| 🆕 backend | added in this pass as real Open Cascade logic + HTTP endpoint, covered by tests. **Update 2026-09-29:** the Part Design ones (sketch-based, dress-up, transformation, split, bodies/Booleans) are now wired into the 3D Design toolbox — see `CATIA_PART_DESIGN_TOOLS.md` §9 and `docs/changes/2026-09-29-catia-part-design-3d.md` |
| 🟡 partial | implemented with a stated limitation |
| ⛔ not done | not implemented — see the roadmap at the end |
| — n/a | a CATIA UI/infrastructure feature with no backend counterpart (desktop chrome, licensing, etc.) |

All backend code lives in `ai-engine/cad-server/`. Part operations run through
the existing `/build_part` replay (`features[]` + `modifiers[]`), so every new
op also works with `/inspect_part` and every new analysis endpoint.
`GET /catia/features` returns this catalogue as JSON.

---

## Ch. 1–3 · Interface, menus, workbenches

| CATIA item | Status | Where / how |
|---|---|---|
| Workbenches (Mechanical Design: Sketcher, Part, Assembly, Drafting) | ✅ / 🆕 | UI tabs exist (Sketch & 2D, 3D Design, Drawings); Assembly backend 🆕 |
| Mouse navigation (pan/rotate/zoom, change centre) | ✅ | `StlViewport.tsx`, `SketchWorkspace` (Alt-drag rotate) |
| Tools › Options, Customize, Macros (VBA), Conferencing, Window, Help | — n/a | desktop-app chrome |
| Edit › Undo/Redo, Copy/Paste, Delete | ✅ | frontend state |
| Edit › Update | ✅ / 🆕 | every `/build_part` is a full update; `/validate_history` reports which feature first fails (CATIA's update error) |
| Edit › Search (by name/type) | 🆕 | `GET /projects/{name}/search?q=&type=` |
| Edit › Selection Sets, Links, Scan / Define In Work Object | ⛔ | needs specification-tree UI |
| View › Fit All, Pan, Rotate, Zoom, Normal View, standard views, Multi-View | ✅ | viewport toolbar |
| View › Render styles (shading, edges, hidden edges, wireframe) | ✅ | viewport "display" styles |
| View › Hide/Show, Swap visible space | ✅ | sketcher + part hide |
| View › Named Views, Fly/Walk, Lighting, Depth effect, Ground, Magnifier | ⛔ | viewport features |
| Tools › Image › Capture | ⛔ | browser screenshot today |

## Ch. 4.7 / 5 · Sketcher

| CATIA item | Status | Where / how |
|---|---|---|
| Profile, Line (+ infinite, bi-tangent, bisecting, normal to curve) | ✅ | `src/sketch/tools.ts` |
| Predefined profiles: rectangle, oriented rect., parallelogram, elongated hole, cylindrical elongated hole, keyhole, hexagon, centred rect./parallelogram | ✅ | sketcher |
| Circle (3-point, coordinates, tri-tangent), Arc (3-point, with limits) | ✅ | sketcher |
| Spline, Connect, Conics (ellipse, parabola, hyperbola, conic) | ✅ | sketcher + `sketch_curves.py` |
| Axis, Point (click, coords, equidistant, intersection, projection) | ✅ | sketcher |
| Corner, Chamfer, Trim, Quick Trim | ✅ | sketcher |
| **Break, Close, Complement** | 🆕 | `POST /sketch/operation` op `break` / `close` / `complement` |
| **Transformation: Mirror, Symmetry, Translate (instances), Rotate (instances), Scale, Offset** | 🆕 | `POST /sketch/operation` op `mirror` / `symmetry` / `translate` / `rotate` / `scale` / `offset` (offset uses OCCT 2D wire offset, returns lines + arcs) |
| 3D Geometry: Project / Intersect 3D elements, silhouette edges | 🟡 | projection of a picked planar face's edges exists (`/face_at`); intersect/silhouette ⛔ |
| Constraints: horizontal, vertical, coincidence, perpendicular, fix, parallel, concentric, tangency, length, distance, angle, radius/diameter, symmetry | ✅ | `sketch_solver.py` (scipy least-squares, rank-based DOF) |
| Constraints Defined in Dialog Box, Auto Constraint, Contact constraint | ✅ | sketcher |
| Animate Constraint, Edit Multi-Constraint | ⛔ | UI |
| Grid, Snap to Point, Construction/Standard element, geometric/dimensional auto-constraints | ✅ | sketcher |
| Colour-coded solving status (white/green/purple) | ✅ | solver `status` + per-element `fixed` |
| **2D Analysis: Sketch Analysis** (open contours, overlaps, isolated points…) | 🆕 | `POST /sketch/analyze` → open ends, branch points, isolated points, zero-length/degenerate, overlapping and crossing lines, closed/open profile counts |
| **2D Analysis: Sketch Solving Status** | 🆕 | included in `/sketch/analyze` (`solving`: status, DOF, redundant equations) |
| Change Sketch Support / Sketch on a face | ✅ | `/face_at` + `plane` on features |
| Output Feature, Profile Feature | ⛔ | |

## Ch. 4.8 / 6.1–6.2 · Sketch-Based Features

| CATIA item | Status | Where / how (`features[]` entry) |
|---|---|---|
| Pad (Dimension limit) | ✅ | `op:"pad"`, `depth` |
| **Pad: Reverse Direction, Mirrored extent, Second Limit, Thin Pad (Thickness1/2)** | 🆕 | `reverse`, `mirrored`, `depth2`, `thin1`/`thin2` |
| **Pad/Pocket limit "Up to last" (through all)** | 🆕 | `limit:"up_to_last"` |
| Pad/Pocket limit Up to next / Up to plane / Up to surface | ⛔ | roadmap |
| Pocket | ✅ | `op:"pocket"` (+ all 🆕 Pad options) |
| Shaft (revolve, first angle) | ✅ | `op:"revolve"`, `axis`, `angle` |
| **Shaft: Second Angle; Thin Shaft** | 🆕 | `angle2`, `thin1`/`thin2` |
| **Groove** | 🆕 | `op:"groove"` (same inputs as Shaft) |
| Hole (plain cut through a circle) | ✅ | old UI "Hole" = pocket of circles |
| **Hole (CATIA definition box)**: blind / up-to-last, diameter, depth, **flat or V-bottom + apex angle**, **counterbored / countersunk**, **thread definition (core diameter computed from ISO 261 coarse table)**, positioning points | 🆕 | `op:"hole"`, `hole:{diameter, depth, bottom, bottomAngle, type, cbDiameter, cbDepth, csDiameter, csAngle, thread:{designation|nominal,pitch,depth}, positions}`; falls back to sketched circle centres/sizes |
| **Rib** (profile swept along a centre curve) | 🆕 | `op:"rib"`, `path:{start, segments:[line|arc|spline]}`, `profileControl` (keep angle / Frenet), `transition` |
| **Slot** (removed rib) | 🆕 | `op:"slot"` |
| **Multi-sections Solid / Removed Multi-sections Solid** | 🆕 | `op:"loft"` / `"removed_loft"`, `sections:[{loops, zOffset|plane}]`, `ruled` |
| Multi-sections guide curves / coupling | ⛔ | roadmap |
| Stiffener | 🟡 | `op:"stiffener"`, `openPath`, `thickness`, `mirrored` — fills from the open profile toward the material, clipped to the part's bounding box (exact where walls meet at a corner; can overfill otherwise) |

## Ch. 4.9–4.10 / 6.3 · Dress-Up Features

| CATIA item | Status | Where / how (`modifiers[]` entry) |
|---|---|---|
| Edge Fillet (by edge filter) | ✅ | `op:"fillet"`, `edgeFilter` |
| **Edge Fillet on picked edges** | 🆕 | `edgePoints:[[x,y,z],…]` (nearest edge to each point), or `facePoints` (every edge of the picked faces — also for Chamfer and Variable Fillet) |
| **Variable Radius Fillet** | 🆕 | `op:"variable_fillet"`, `radius` → `radius2` along each picked edge (OCCT `BRepFilletAPI_MakeFillet`) |
| Face-Face Fillet, Tritangent Fillet | ⛔ | roadmap |
| Chamfer (Length/Angle, Length/Length) | ✅ | `op:"chamfer"` (+ 🆕 `edgePoints`) |
| **Draft Angle** (neutral element, pull direction, faces) | 🆕 | `op:"draft"`, `draftAngle`, `pullDirection`, `neutralPlane` (default: face the part stands on), `faceSelector:"side"` or `facePoints` |
| Reflect-line draft, Variable-angle draft, Advanced Draft | ⛔ | roadmap |
| Shell (top face opened) | ✅ | `op:"shell"`, `thickness` |
| **Shell: Faces to Remove picked, Outside thickness** | 🆕 | `facePoints` / `faceSelector`, `thicknessOutside` |
| **Thickness** (add/remove on selected faces) | 🆕 | `op:"thickness"`, signed `thickness`, `facePoints`/`faceSelector` |
| **Thread / Tap** (cosmetic, validated against the picked cylinder's diameter) | 🆕 | `op:"thread"`, `designation`, `threadType:"thread"|"tap"`, `facePoints` |
| **Remove Face** | 🆕 | `op:"remove_face"`, `facePoints` (OCCT defeaturing) |

## Ch. 4.13 / 6.4 · Transformation Features

| CATIA item | Status | Where / how (`modifiers[]` entry) |
|---|---|---|
| **Translation** | 🆕 | `op:"translate_body"`, `vector` |
| **Rotation** (axis + angle) | 🆕 | `op:"rotate_body"`, `axisOrigin`, `axisDirection`, `angle` |
| **Symmetry** (mirror, no copy) | 🆕 | `op:"symmetry_body"`, `planeSpec` or `plane` |
| Mirror (with copy) | ✅ | `op:"mirror_body"` |
| Mirror Feature (single feature) | ✅ | UI "Mirror Feature" |
| Rectangular Pattern — one direction | ✅ | `op:"linear_pattern_body"` |
| **Rectangular Pattern — second direction** | 🆕 | `axis2`, `spacing2`, `count2` |
| Circular Pattern (about Z) | ✅ | `op:"circular_pattern_body"` |
| **Circular Pattern about any axis** | 🆕 | `axisOrigin`, `axisDirection` |
| Circular Pattern crown (radial) definition | ⛔ | roadmap |
| **User Pattern** | 🆕 | `op:"user_pattern_body"`, `offsets` |
| Scaling (uniform, about origin) | ✅ | `op:"scale_body"`, `factor` |
| **Scaling about a point / along a direction** | 🆕 | `scaleCenter`, `scaleVector:[sx,sy,sz]` |
| Patterns of a *single feature* (not the whole body) | ⛔ | roadmap |

## Ch. 4.14 · Surface-Based Features

| CATIA item | Status | Where / how |
|---|---|---|
| **Split** (by a plane) | 🆕 | modifier `op:"split_body"`, `planeSpec`, `keep:"+"|"-"` |
| Split by a surface, Thick Surface, Close Surface, Sew Surface | ⛔ | needs a surface-modelling layer (Wireframe & Surface workbench) |

## Ch. 4.15–4.16 / 7 · Multiple bodies and Boolean operations

| CATIA item | Status | Where / how |
|---|---|---|
| **Insert › Body** (independent bodies in one part) | 🆕 | `POST /build_bodies`, `bodies:[{id, features, modifiers, polarity}]` (first body = PartBody) |
| **Add, Remove, Intersect** | 🆕 | `operations:[{op, target, tool}]` |
| **Assemble** (respects body polarity) | 🆕 | `op:"assemble"`, body `polarity:"remove"` subtracts |
| **Union Trim** | 🟡 | `op:"union_trim"`: the tool is split by the target and pieces marked with `removePoints` (or not marked with `keepPoints`) are dropped before the union. Selection is by points in pieces, not by faces as in CATIA |
| **Remove Lump** | 🆕 | `op:"remove_lump"`, `removePoints` / `keepPoints` (default: keep the largest) |
| Define In Work Object, Change PartBody, Reorder | ⛔ | needs specification-tree UI |

## Ch. 4.11, 4.18 · Reference elements and tools

| CATIA item | Status | Where / how |
|---|---|---|
| Point / Line / Plane / Axis System | ✅ (visual) | UI reference geometry. Planes can be passed to any 🆕 op as `{origin, normal}` / `{name, offset}` |
| Create Datum (no-history copy) | 🟡 | `/export_part?format=brep` + `/import_part` gives exactly that |
| Catalog Browser (e.g. screws) | ⛔ | roadmap |
| Mean Dimensions | ⛔ | |

## Ch. 4.20–4.22 / 6.2 · Analysis, material and measure

| CATIA item | Status | Where / how |
|---|---|---|
| **Apply Material** (library) | 🆕 | `GET /materials` (15 materials: density, E, ν, yield); `material` on any part request |
| **Measure Inertia** (volume, area, mass, CoG, inertia matrix, principal moments/axes, about a point) | 🆕 | `POST /measure_inertia` (`material` or `density`, optional `aboutPoint`) |
| **Measure Item** (face/edge/vertex type & size, cylinder axis/diameter) | 🆕 | `POST /measure_item` |
| **Measure Between** (min distance, angle between planes/lines/axes) | 🆕 | `POST /measure_between` |
| Mass properties / validation / interference (single body) | ✅ | `/inspect_part` |
| **Draft Analysis** (green ≥ 1°, blue ≈ 0°, red < 0°) | 🆕 | `POST /draft_analysis` (`direction`, `thresholdDeg`, `mode: one_sided|two_sided`), per-face min/max draft and area totals |
| **Curvature Analysis** | 🆕 | `POST /curvature_analysis` (sampled principal curvatures, min radius per face) |
| **Tap-Thread Analysis** | 🆕 | `POST /thread_analysis` |
| Annotations (Text / Flag note with leader) on 3D | ⛔ | roadmap (drawing text exists) |

## Ch. 12 / 4.2 · Knowledge: parameters, formulas, design tables

| CATIA item | Status | Where / how |
|---|---|---|
| Formula editor (UI) | ✅ | `App.tsx` Parameters panel |
| **Formula engine** (units mm/cm/m/in/deg/rad, math functions, dependency order, cycle detection, sandboxed) | 🆕 | `POST /parameters/evaluate` |
| **Formulas driving geometry** (`length = width*3`) | 🆕 | `POST /build_parametric` — any `"=expr"` string in a `/build_part` body |
| **Design Table** (CSV → part family) | 🆕 | `POST /design_table` — per-row rebuild, metrics or error |
| Check Analysis, Knowledge Inspector, Lock parameters, Equivalent dimensions, URLs | ⛔ | roadmap |

## Ch. 9 · Assembly Design

| CATIA item | Status | Where / how |
|---|---|---|
| **New Product; Existing Component (feature history or STEP/IGES/BREP file); several instances of one part** | 🆕 | `components:[{id, partNumber, part | file, position, fixed}]` |
| **Coincidence** (axis/axis, plane/plane, point/point, point/axis, point/plane, axis-in-plane) | 🆕 | `constraints:[{type:"coincidence", a, b, orientation}]` |
| **Contact** (planes, opposed normals) | 🆕 | `type:"contact"` |
| **Offset** (plane/plane, point/plane, signed) | 🆕 | `type:"offset", value` |
| **Angle** | 🆕 | `type:"angle", value` |
| **Fix Component, Fix Together** | 🆕 | `fixed:true` / `type:"fix"`, `type:"fix_together"` |
| **Picking an element by clicking a face** (cylinder → its axis, plane → plane, sphere → centre) | 🆕 | `a:{component, pick:[x,y,z]}` |
| **Update** (solve) + **Component Degrees of Freedom** | 🆕 | `POST /assembly/solve` → poses, per-component DOF, total DOF, status (fully / under / over-constrained) |
| Quick Constraint, Change Constraint, Flexible sub-assembly, Reuse pattern | ⛔ | roadmap |
| Manipulation (free drag), Snap, "with respect to constraints" drive | ⛔ | needs UI; the solver supports it (see roadmap) |
| **Explode** | 🆕 | `POST /assembly/build` with `explode` factor → STL |
| **Clash** (clash / contact / clearance, interference volume) | 🆕 | `POST /assembly/analyze` → `clashes` (`clearance` threshold) |
| **Distance and Band Analysis** | 🆕 | `/assembly/analyze` → `distances` |
| **Sectioning** | 🆕 | `/assembly/analyze` with `sectionPlane` → outlines + areas per component |
| **Generate Numbering / BOM** | 🆕 | `/assembly/analyze` → `bom` (item, part number, quantity, unit mass) |
| Desk (link graph), Save Management, Send To, Publication, Selective Load, Manage Representations | ⛔ / — | file-management UI; projects live in `cad-server/projects/` |

## Ch. 10 · Data management

| CATIA item | Status | Where / how |
|---|---|---|
| **Export STEP, IGES** (history-free solids), plus BREP, STL, glTF | 🆕 | `POST /export_part?format=step|iges|brep|stl|gltf` |
| **Open STEP / IGES / BREP** (no history) | 🆕 | `POST /import_part` (base64 file) → metrics or STL |
| cgr, CATIA V4 model/session, Migrate V4→V5 | ⛔ | proprietary Dassault formats |
| **Export 2D: DXF** | 🆕 | `/drawing` with `format:"dxf"` |
| Export 2D: DWG | ⛔ | proprietary; no open writer (convert the DXF with ODA File Converter) |
| CATDUA (check & clean) | 🟡 | `/validate_history` (per-feature rebuild health + `is_valid`) |

## Ch. 11 · Drafting

| CATIA item | Status | Where / how |
|---|---|---|
| Drawing tab with 4 views + bounding-box dimension (UI, from STL) | ✅ | `DrawingWorkspace.tsx` |
| **New drawing: standard (ISO first angle / ANSI third angle), sheet A0–A4, orientation, scale (auto standard scale)** | 🆕 | `POST /drawing` `standard`, `sheet`, `orientation`, `scale` |
| **Front / Top / Right / Left / Bottom / Back / Isometric views, projection-aligned (View Creation Wizard)** | 🆕 | `views:[…]` — exact OCCT hidden-line removal |
| **Hidden lines (dashed)** | 🆕 | `hiddenLines` |
| **Offset Section View with hatching + label** | 🆕 | `section:{plane, label}` |
| **Generate Dimensions** (overall extents, Ø of every full circle) | 🆕 | `dimensions:true` |
| **Title block / background view** (name, material, mass, scale, projection, date) | 🆕 | `title:{name, author, date}`, `material` |
| **Save as SVG / DXF** | 🆕 | `format:"svg"|"dxf"|"json"` |
| Detail views, Clipping, Broken / Breakout views, Aligned sections, Unfolded view | ⛔ | roadmap |
| Manual dimensioning, tolerances, GD&T, datum targets, roughness & weld symbols, balloons, tables | ⛔ | roadmap |
| Centre lines / axis lines / thread representation (Dress-up) | ⛔ | roadmap |

---

## Verification

- `ai-engine/cad-server`: `python -m pytest tests -q` → **100 passed** (33
  pre-existing + 67 new in `tests/test_catia_features.py`). The new tests
  check closed-form results (volumes, inertia tensors including
  product-of-inertia sign, distances, curvature, DOF counts, hole
  geometry, ISO thread core diameters), not just status codes.
- `ai-engine/faelyx-ui`: `npm run typecheck` clean, `npm test` **21 passed**,
  `npm run build` OK, `npx playwright test` **31 passed** (end-to-end
  against the live backend). No frontend source file was changed.
- Live HTTP check through `start_backend.bat`: every new endpoint returns
  200; a generated A3 drawing was rendered and visually inspected.
