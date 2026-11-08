# CATIA V5 Part Design — tool reference

<!-- source: docs/inputs/catia-part-design-fr.md (converted from FR-Dassault-Systems_part_design.pdf, Dassault Systèmes 1994-2001, French user guide) | written: 2026-09-29 -->

A structured summary of every tool in the CATIA V5 **Part Design** user guide,
written as requirements for Faelyx's 3D Design workspace. French tool names
from the manual are in parentheses. Line numbers (`L123`) point into
`docs/inputs/catia-part-design-fr.md`.

The existing `CATIA_FEATURE_MAP.md` maps a different source (the TU Graz
*CATIA V5 Basic Training* script) to Faelyx's backend. This file covers the
official Part Design guide; section 9 maps it to the app.

**Common rules that apply to every sketch-based feature** (L509–L600, L790–L851)

- The profile comes from a Sketcher sketch (or planar wireframe geometry).
  If the command is started with no profile selected, the user can open the
  Sketcher from the dialog, draw one, and come back.
- By default the feature grows **perpendicular to the sketch plane**. The
  direction can be changed with *Perpendicular to profile* off plus a line or
  edge as reference (L712–L734).
- One sketch may hold several closed profiles provided they do not intersect.
  The larger profile becomes the outer boundary and inner profiles become
  cavities (square + circle → a pad with a hole, L564–L569).
- *Sub-elements* (Définition du profil): only some of a sketch's profiles can
  be used (L571–L603).
- Open profiles are accepted only when existing material can bound the result
  (L556–L561, L843–L844).
- Every feature appears in the specification tree and can be edited by
  double-clicking it.

---

## 1. Sketch-Based Features (Composants issus d'une esquisse)

| Tool | Description | Input geometry | Parameters / modifiers | Expected output |
|---|---|---|---|---|
| **Pad** (Extrusion), L502 | Extrudes a profile in one or two directions to add material | Closed profile (open allowed if bounded); sketch plane gives default direction | **Type** of first limit: *Dimension* (Length, default 10 mm in dialog, 40 in example) · *Up to next* · *Up to last* · *Up to plane* (+ Offset) · *Up to surface* (+ Offset). **Mirrored extent** (same length on both sides). **Second limit** (*More* button, independent length/type). **Reverse direction**. **Reverse side** (open profiles only). *Perpendicular to profile* toggle + reference direction. **Thick** (Thin pad, Thickness1/Thickness2) | Solid added to the body; limits resolved against existing faces for Up to next/last/plane/surface |
| **Drafted Filleted Pad** (Extrusion dépouille et congés), L736 | Pad + draft on its side faces + three fillet sets in one step | Profile; **second limit face or plane is mandatory** | Length; second limit; **Draft angle** (optional, e.g. 7°); neutral element = first or second limit; **Lateral radius**, **First-limit radius**, **Second-limit radius** (each optional) | Tree gets 1 pad + 1 draft + 3 fillets, each editable separately |
| **Pocket** (Poche), L779 | Extrudes a profile and removes the material | Closed profile(s) on a sketch; several non-intersecting profiles → several pockets | Same limit types as Pad (Dimension/Up to next/last/plane/surface + Offset). **Reverse side** removes the material *around* the profile instead of inside it. Reverse direction, direction reference | Cavity. A pocket as the first feature of a new body creates material |
| **Drafted Filleted Pocket** (Poche dépouille et congés), L866 | Pocket + draft + fillets in one step | Profile; mandatory second limit | Depth; draft angle; neutral element; lateral / first / second-limit radii | 1 pocket + 1 draft + 3 fillets in the tree |
| **Shaft** (Révolution), L908 | Revolves a profile around an axis to add material | Open or closed profile; axis in the same sketch (or an explicitly selected axis); several closed profiles must lie on the same side of the axis | **First angle** (default 360°), **Second angle** (LIM1/LIM2), **Reverse side** (material between axis and profile or between profile and existing material), Thick option | Solid of revolution |
| **Groove** (Gorge), L970 | Revolves a profile around an axis to remove material | Same as Shaft | First angle, Second angle (example 100° + 60°), Reverse side (remove around the profile) | Revolved cut |
| **Hole** (Trou), L1041 | Standard drilled holes | Support face + a positioning point (click location on the face, or constraints to edges; a circular edge makes it concentric) | **Type**: Simple · Tapered (Conique) · Counterbored (Lamé) · Countersunk (Chanfreiné) · Counterdrilled (Lamé et chanfreiné). **Extension**: Blind · Up to next · Up to last · Up to plane · Up to surface (+ Limit offset). **Diameter**, **Depth** (default 10/10). **Bottom**: Flat or **V-bottom** + angle (e.g. 110°). Counterbore: diameter > hole Ø, depth < hole depth. Countersink: diameter > hole Ø, 0° < angle < 180°. Direction: perpendicular to surface or along an edge/line. **Threaded** + thread spec | Hole cut into the body; its positioning sketch appears in the tree above it. The top of the hole is always limited "up to next" |
| **Threaded Hole** (Trou taraudé), L1166 | Thread definition on a hole | Hole | Thread type: **No standard** (user values) · **Metric fine pitch** · **Metric coarse pitch** (AFNOR NF E03-053 tables, L1191–L1281); nominal Ø, pitch, **hole Ø (core, < nominal)**, thread depth, **Left-hand thread**; user standards from Excel/Lotus/tab files | Hole geometry at core diameter; thread is a specification (not shown as geometry) |
| **Rib** (Nervure), L1338 | Sweeps a planar profile along a center curve, adding material | Profile (closed; open if bounded; multiple non-intersecting closed profiles allowed, e.g. two concentric circles → a tube) + **center curve** (open or closed; 3D curves must be tangent-continuous, planar ones need not be) | **Profile control**: *Keep angle* (angle between sketch plane and curve tangent kept), *Pulling direction* (plane or edge; needed for a helix), *Reference surface*. **Merge ends** (Extrémités relimitées) | Swept solid |
| **Slot** (Rainure), L1424 | Rib that removes material | Same as Rib | Same as Rib | Swept cut |
| **Stiffener** (Raidisseur), L1483 | Web between existing walls from an open profile | **Open profile** drawn in a plane perpendicular to the support face; existing material must bound it | **Thickness** (default 10 mm, example 12 mm); **Mirrored extent** (thickness symmetric about the sketch plane — on by default); direction arrows (three directions, two opposite) | Rib-like web filling from the profile to existing material |
| **Multi-sections Solid** (Surface guidée / Lissage), L1521 | Solid swept through ≥ 2 planar sections | Non-intersecting planar section curves; optional **guide curves**; optional **spine** | **Coupling**: Ratio · Tangency · Tangency then curvature · Vertices; closing points + direction; guides (add / remove / replace); spine (computed or user); **Relimitation** by first/last section | Closed solid volume |
| **Removed Multi-sections Solid** (Retrait de matière guidée), L1586 | Same, removing material | Same | Same (+ closing point reverse) | Cut |

## 2. Dress-Up Features (Composants d'habillage)

| Tool | Description | Input geometry | Parameters | Expected output |
|---|---|---|---|---|
| **Edge Fillet** (Congé sur arête), L1671 | Constant-radius rounded face tangent to two faces | Edge(s) (or a face → all its edges) | **Radius**; **Propagation**: Minimal / Tangency; edges to keep; limiting element (plane) | Rounded (external) or filleted (internal) edges |
| **Variable Radius Fillet** (Congé variable), L1753 | Radius varies along an edge | Edge(s); extra points on the edge | Radius at each vertex and at each added point; **variation**: Cubic / Linear; closed edges supported | Variable fillet |
| **Variable fillet with spine** (Congé variable avec spine), L1834 | Circular fillet swept along a spine | Edges, spine | Radii, *Circle fillet* option, spine | Variable fillet |
| **Face-Face Fillet** (Congé face-face), L1868 | Fillet between two faces that don't share an edge | Two faces | Radius; limiting element | Blend between faces |
| **Tritangent Fillet** (Congé tritangent), L1894 | Fillet tangent to three faces; removes one | Two faces + face to remove | — (radius computed) | Full round replacing the removed face |
| **Chamfer** (Chanfrein), L1926 | Flat bevel on an edge (adds or removes material) | Edge(s) or a face (all its edges) | Mode **Length1/Angle** (default) or **Length1/Length2**; propagation; reverse | Beveled edges |
| **Draft Angle** (Dépouille de base), L1953 | Tilts faces for mould release | Faces to draft *or* a neutral face (selection by neutral face finds them) | **Pull direction** (default normal to neutral face); **Draft angle** (per face); **Neutral element** (+ propagation None/Tangency); optional **Parting element** | Tapered faces |
| **Draft with parting element** (Dépouille avec élément de joint), L2048 | Parting plane splits part; each side drafted | Faces, neutral element, parting element | Angle, pull direction, *Draft both sides* | Two-sided draft |
| **Draft from reflect lines** (Dépouille à partir de lignes de reflet), L2097 | Neutral curve = reflect line on curved faces | Curved faces (e.g. after fillets) | Angle, pull direction | Draft |
| **Variable Angle Draft** (Dépouille à angle variable), L2128 | Draft angle varies along neutral curve | Faces, neutral element, points on neutral curve | Angle per point | Variable draft |
| **Two-sided Draft** (Dépouille à deux côtés), L2184 | Advanced draft on both sides of a parting element | Faces, parting element | Two angles, two directions | Draft |
| **Shell** (Coque), L2249 | Hollows the body leaving walls; can also add outward | **Faces to remove** (stay open) | **Inside thickness**, **Outside thickness**; **Faces with other thicknesses** (per-face value) | Hollow part |
| **Thickness** (Epaisseur), L2278 | Adds (positive) or removes (negative) thickness on faces, e.g. machining allowance | Faces | Thickness value; faces with other thicknesses | Faces offset |
| **Thread / Tap** (Taraudage/filetage), L2304 | Cosmetic thread (on a shaft) or tap (in a hole) | **Cylindrical face** + **planar limit face** | Type (No standard / Metric fine / Metric coarse), nominal Ø, pitch, depth, reverse direction, left-hand thread | Specification in the tree (geometry unchanged); used by Thread analysis |

## 3. Surface-Based Features (Composants issus d'une surface)

| Tool | Description | Input | Parameters | Output |
|---|---|---|---|---|
| **Split** (Division), L2472 | Cuts the body with a plane, face or surface | Body + splitting element | Arrow = side to keep (click to flip) | Material on one side removed |
| **Thick Surface** (Surface épaisse), L2489 | Adds material to a surface in two opposite directions | Surface | First offset, Second offset, reverse | Solid from surface |
| **Close Surface** (Remplissage), L2513 | Fills a closed surface into a solid | Closed (or trimmed) surface | — | Solid |
| **Sew Surface** (Surface de couture), L2527 | Joins a surface to the body, removing unneeded material | Surface + body | Intersect body option, side to keep | Body reshaped by the surface |

## 4. Transformation Features (Composants de transformation)

| Tool | Description | Input | Parameters | Output |
|---|---|---|---|---|
| **Translation**, L2570 | Moves the current body | Direction: a line, a plane (its normal) or X/Y/Z vector | **Distance** (e.g. 100 mm) | Body moved; Translat.xxx in tree |
| **Rotation**, L2589 | Rotates the current body | **Axis** (edge/line) | **Angle** | Body rotated |
| **Symmetry** (Symétrie), L2606 | Mirrors the current body *without keeping the original* | Point, line or plane | — | Only the mirrored body remains |
| **Mirror** (Miroir), L2620 | Duplicates the body or selected features by symmetry | Features (or body) + mirror face or plane | — | Original + mirrored copy |
| **Rectangular Pattern** (Répétition rectangulaire), L2644 | Copies features in one or two directions | Feature(s) to copy (default: current solid); reference direction(s) | Per direction: **Instances & spacing / Instances & length / Spacing & length**; first + **second direction**; position of the original in the pattern; instances can be removed by clicking; *Keep specifications* | Grid of copies |
| **Circular Pattern** (Répétition circulaire), L2789 | Copies features around an axis | Feature(s); **reference axis** | **Axial reference**: Instances & total angle / Instances & angular spacing / Angular spacing & total angle / Complete crown; **Crown definition** (circles, circle spacing, crown thickness); *Keep specifications* | Ring of copies |
| **User Pattern** (Répétition personnalisée), L2901 | Copies a feature onto sketched points | Feature + a sketch of positioning points | Anchor point; keep specifications | Copies at every sketched point |
| **Explode pattern** (Décomposition), L2565 | Turns a pattern into independent features | Pattern | — | Separate features |
| **Scaling** (Facteur d'échelle), L2983 | Resizes the body | Reference **point** (uniform) or **plane/face** (affinity) | **Ratio** (e.g. 1.6) | Scaled body |

## 5. Reference Elements (Eléments de référence), L3007

| Tool | Creation modes | Output |
|---|---|---|
| **Point** | Coordinates · on curve · on plane · on surface · circle center · tangent on curve · between two points | 3D point usable as positioning/reference |
| **Line** | Point–point · point–direction · angle/normal to curve · tangent to curve · normal to surface · bisecting | Line / axis usable as direction or rotation axis |
| **Plane** | Offset from plane · parallel through point · angle/normal to plane · through 3 points · through 2 lines · through point and line · through planar curve · normal to curve · tangent to surface · equation · mean through points | Plane usable as **sketch support**, limit (*Up to plane*), mirror or split element |

## 6. Boolean Operations / Body Association (Association de corps), L4343

| Tool | Input | Output |
|---|---|---|
| **Insert Body** | — | New independent body in the part |
| **Assemble** (Assemblage) | Body + target | Merge respecting each body's polarity (pocket-first bodies subtract) |
| **Add** (Ajout) | Body + target | Union |
| **Remove** (Retrait) | Body + target | Target minus body |
| **Intersect** (Intersection) | Two bodies | Common volume |
| **Union Trim** (Relimitation partielle) | Body + target; faces to remove / faces to keep | Union with selected portions trimmed |
| **Remove Lump** (Retrait de volume) | Body; faces to remove / keep | Disconnected lumps removed |

## 7. Modifying features, constraints, annotations

- **Edit** any feature by double-clicking it; **Reorder**, **Parents/Children**,
  **Update** (manual/automatic), **Delete** (with option to delete exclusive
  parents), **Scan/Define in work object** ("Modification de composants").
- **3D constraints** between features, defined in a dialog; **Mean dimensions**.
- **Replace** a surface or body; **Change sketch support**; **move sketches**.
- **Properties** of part / body / feature; **Text annotations**.

## 8. Tools

- **Draft Analysis** (colour by draft angle vs. pull direction),
  **Curvature Analysis**, **Thread/Tap Analysis**.
- **PowerCopy** (Copie optimisée: create, instantiate, save to catalog),
  cut / copy / paste of features.

---

## 9. Mapping to Faelyx (audit, 2026-09-29)

Backend = `ai-engine/cad-server` (`cad_server.py`, `part_features.py`,
`catia_api.py`). UI = `ai-engine/faelyx-ui/src/App.tsx` 3D Design toolbox.
"Backend only" means the operation exists and is tested, but the 3D Design
tab has no control for it.

| CATIA tool | Backend | 3D Design UI before | 3D Design UI after (2026-09-29) |
|---|---|---|---|
| Sketch plane (Front/Top/Right) used by 3D features | — | no — every feature on the XY stack | ✅ Top = XY, Front = XZ, Right = YZ, sketch origin = plane origin, per-plane offset; Reference Plane or picked face as support |
| Pad — Dimension, Up to last, Reverse, Mirrored, Second limit, Thick | yes | Dimension only | ✅ all |
| Pocket — same options | yes | Dimension only | ✅ all |
| Pad/Pocket — Up to next / plane / surface, non-perpendicular direction | no | no | ⛔ pending |
| Drafted Filleted Pad / Pocket | no | no | ⛔ pending (listed, disabled) — build as Pad + Draft + Edge Fillet |
| Pocket — Reverse side | no | no | ⛔ pending |
| Shaft — first/second angle, thick, H/V axis | yes | one angle | ✅ |
| Groove | yes | no | ✅ |
| Hole — simple/counterbored/countersunk, blind/up to last, flat/V-bottom, thread | yes | plain pocket | ✅ positions + default Ø from sketch circles |
| Hole — tapered, counterdrilled, up to next/plane/surface | no | no | ⛔ pending |
| Rib / Slot (keep angle / Frenet) | yes | no | ✅ center curve from a kept sketch |
| Stiffener | added | no | 🟡 fill clipped to the bounding box (exact at corners) |
| Multi-sections solid / removed | yes (no guides/coupling) | no | ✅ sections = kept sketches · guides/coupling ⛔ |
| Edge fillet, chamfer | yes | edge filter | ✅ + edges of picked faces |
| Variable fillet (two radii) | yes | no | ✅ on picked faces' edges · multi-point/spine ⛔ |
| Face-face, tritangent fillet | no | no | ⛔ pending (listed, disabled) |
| Draft (basic) | yes | placeholder | ✅ angle, pull direction, neutral plane, picked or side faces |
| Draft variants (parting, reflect lines, variable, two-sided) | no | no | ⛔ pending |
| Shell | yes | top face only | ✅ picked faces, inside + outside thickness · per-face thickness ⛔ |
| Thickness, Remove Face, Thread/Tap | yes | no | ✅ on picked faces |
| Split (plane) | yes | placeholder | ✅ XY/XZ/YZ + offset, side to keep · split by surface ⛔ |
| Thick / Close / Sew surface | no | no | ⛔ pending (no surface layer; listed, disabled) |
| Translation, Rotation, Symmetry, Mirror | yes | Mirror only | ✅ |
| Rectangular pattern (2 directions), circular (any axis, crown/spacing), user pattern (sketch points) | yes | 1 direction / Z only | ✅ whole-body patterns · pattern of one feature ⛔ |
| Scaling about a point / affinity | yes | uniform about origin | ✅ |
| Reference plane as sketch support | — | visual only | ✅ |
| Reference point/line creation modes | no | no | ⛔ pending |
| Insert Body + Add / Remove / Intersect / Assemble / Remove Lump | yes | no | ✅ · Union Trim ⛔ (needs piece picking) |
| Edit / delete features in the tree | — | no | ✅ |
| Save/Open of modifiers, references, sketches, bodies | — | modifiers were lost | ✅ |
