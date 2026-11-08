"""
part_features.py

The CATIA V5 Part Design features cad_server.py's original Pad / Pocket /
Revolve + whole-body Modifier set didn't cover yet, taken from the TU Graz
"CATIA V5 Basic Training" script (chapters 4.8-4.16 and 6.1-6.4):

  Sketch-Based Features   Groove (removed Shaft), Rib / Slot (profile swept
                          along a center curve), Multi-sections Solid /
                          Removed Multi-sections Solid, Hole (blind / up to
                          last, flat / V-bottom, counterbored / countersunk,
                          threaded), plus the Pad/Pocket definition-box
                          options: Reverse Direction, Mirrored extent,
                          Second Limit, Thin Pad, "Up to last" limit, and a
                          Shaft/Groove Second Angle.
  Dress-Up Features       Draft Angle, Thickness, Remove Face, Variable
                          Radius Fillet, Thread / Tap (cosmetic, validated
                          against the picked cylinder).
  Transformation Features Translation, Rotation, Symmetry (no copy), User
                          Pattern, Split, Scaling about a point / along a
                          direction.

Everything here is pure geometry on build123d / Open Cascade shapes — no
FastAPI, no request state — so cad_server.py's _build_shape() can call it
from inside its existing replay loop, and tests can call it directly.

Face and edge picking: there's no interactive face picker for these ops
yet, so a face is chosen either by a point on it (`facePoints`, the 3D
point a click would have produced — the same contract /face_at uses) or by
a direction keyword (`faceSelector`: "+Z", "side", "cylindrical", ...).
Edges likewise by `edgePoints`. Nothing is guessed: a point that isn't on
the part raises instead of silently picking something else.
"""

from __future__ import annotations

import math
from typing import Iterable, Optional

from build123d import (
    Axis, BuildLine, BuildSketch, Compound, Edge, Face, GeomType, Keep, Kind, Line, Location,
    Mode, Plane, Solid, Spline, ThreePointArc, Transition, Vector, Wire,
    extrude, loft, make_face, offset, revolve, split, sweep,
)

# ---------------------------------------------------------------------------
# ISO metric threads (ISO 261 coarse series) — CATIA's Hole > Thread
# Definition computes the core (minor) diameter itself for standard threads;
# this is that table. Internal minor diameter D1 = D - 1.082532 * P (ISO 724).
# ---------------------------------------------------------------------------
ISO_COARSE_PITCH = {
    1.0: 0.25, 1.2: 0.25, 1.6: 0.35, 2.0: 0.4, 2.5: 0.45, 3.0: 0.5, 4.0: 0.7,
    5.0: 0.8, 6.0: 1.0, 8.0: 1.25, 10.0: 1.5, 12.0: 1.75, 14.0: 2.0, 16.0: 2.0,
    18.0: 2.5, 20.0: 2.5, 22.0: 2.5, 24.0: 3.0, 27.0: 3.0, 30.0: 3.5, 33.0: 3.5,
    36.0: 4.0, 39.0: 4.0, 42.0: 4.5, 45.0: 4.5, 48.0: 5.0, 52.0: 5.0, 56.0: 5.5,
    60.0: 5.5, 64.0: 6.0,
}


def thread_spec(designation: Optional[str] = None, nominal: Optional[float] = None,
                pitch: Optional[float] = None) -> dict:
    """Resolve "M10" / "M10x1.25" / (nominal, pitch) into nominal, pitch and
    the internal minor (tap drill core) diameter. Raises ValueError for a
    designation that isn't an ISO metric size and has no explicit pitch."""
    if designation:
        text = designation.strip().upper().replace(" ", "")
        if not text.startswith("M"):
            raise ValueError(f"unsupported thread designation {designation!r} (expected ISO metric, e.g. 'M10' or 'M10x1.25')")
        body = text[1:]
        if "X" in body:
            d_txt, p_txt = body.split("X", 1)
            nominal, pitch = float(d_txt), float(p_txt)
        else:
            nominal = float(body)
    if nominal is None or nominal <= 0:
        raise ValueError("thread needs a positive nominal diameter")
    if pitch is None:
        pitch = ISO_COARSE_PITCH.get(round(float(nominal), 1))
        if pitch is None:
            raise ValueError(f"M{nominal:g} is not in the ISO coarse series — give an explicit pitch")
    minor = nominal - 1.082532 * pitch
    return {
        "designation": f"M{nominal:g}" + ("" if ISO_COARSE_PITCH.get(round(float(nominal), 1)) == pitch else f"x{pitch:g}"),
        "nominalDiameter": float(nominal),
        "pitch": float(pitch),
        "minorDiameter": round(minor, 4),
    }


# ---------------------------------------------------------------------------
# Small geometry helpers
# ---------------------------------------------------------------------------
_DIRS = {
    "+X": (1, 0, 0), "-X": (-1, 0, 0), "+Y": (0, 1, 0), "-Y": (0, -1, 0),
    "+Z": (0, 0, 1), "-Z": (0, 0, -1), "top": (0, 0, 1), "bottom": (0, 0, -1),
}


def as_vector(v, name: str = "vector") -> Vector:
    try:
        return Vector(*[float(c) for c in v])
    except (TypeError, ValueError) as e:
        raise ValueError(f"{name} must be a list of 3 numbers, got {v!r}") from e


def plane_from_spec(spec, default: Plane = Plane.XY) -> Plane:
    """A plane from "XY"/"YZ"/"XZ" (optionally with "offset"), or
    {"origin": [...], "normal": [...], "xDir"?: [...]}."""
    if spec is None:
        return default
    if isinstance(spec, str):
        named = {"XY": Plane.XY, "YZ": Plane.YZ, "XZ": Plane.XZ}
        if spec not in named:
            raise ValueError(f"unknown plane {spec!r} (use XY, YZ, XZ or an origin/normal dict)")
        return named[spec]
    if isinstance(spec, dict):
        if "name" in spec:
            return plane_from_spec(spec["name"]).offset(float(spec.get("offset", 0.0)))
        origin = as_vector(spec.get("origin", (0, 0, 0)), "plane origin")
        normal = as_vector(spec.get("normal", (0, 0, 1)), "plane normal")
        if normal.length < 1e-12:
            raise ValueError("plane normal must be non-zero")
        if spec.get("xDir") is not None:
            return Plane(origin=origin, x_dir=as_vector(spec["xDir"], "plane xDir"), z_dir=normal)
        return Plane(origin=origin, z_dir=normal)
    raise ValueError(f"invalid plane spec {spec!r}")


def as_shape(topods):
    """Wrap a raw OCP TopoDS shape (from a direct OCCT algorithm) back into
    build123d: a single solid comes back as a Solid, anything else as a
    Compound of whatever it holds."""
    from OCP.TopAbs import TopAbs_SOLID
    from OCP.TopoDS import TopoDS
    if topods.ShapeType() == TopAbs_SOLID:
        return Solid(TopoDS.Solid_s(topods))
    return Compound(topods)


def face_normal(face: Face, at: Optional[Vector] = None) -> Vector:
    try:
        return face.normal_at(at) if at is not None else face.normal_at()
    except Exception:
        return face.normal_at(face.center())


def pick_faces(shape, selector: Optional[str] = None, points: Optional[list] = None,
               reference: Optional[Vector] = None, tol: float = 0.5) -> list[Face]:
    """Faces by picked points (nearest face within `tol` of each point) or
    by a keyword. `reference` is the direction "side" is measured against
    (default +Z) — "side" means faces running parallel to it, i.e. the
    walls a Draft would slant."""
    faces = list(shape.faces())
    if points:
        picked = []
        for p in points:
            pt = as_vector(p, "face point")
            best, best_d = None, float("inf")
            for f in faces:
                d = f.distance_to(pt)
                if d < best_d:
                    best, best_d = f, d
            if best is None or best_d > tol:
                raise ValueError(f"no face of the part within {tol} mm of point {list(p)}")
            if not any(best.is_same(q) for q in picked):
                picked.append(best)
        return picked
    selector = selector or "all"
    ref = (reference or Vector(0, 0, 1)).normalized()
    if selector == "all":
        return faces
    if selector in _DIRS:
        d = Vector(*_DIRS[selector])
        return [f for f in faces if f.geom_type == GeomType.PLANE and face_normal(f).dot(d) > 0.999]
    if selector == "side":
        out = []
        for f in faces:
            if f.geom_type == GeomType.PLANE:
                if abs(face_normal(f).dot(ref)) < 1e-3:
                    out.append(f)
            elif f.geom_type in (GeomType.CYLINDER, GeomType.CONE):
                if abs(face_normal(f, f.center()).dot(ref)) < 0.5:
                    out.append(f)
        return out
    if selector == "planar":
        return [f for f in faces if f.geom_type == GeomType.PLANE]
    if selector == "cylindrical":
        return [f for f in faces if f.geom_type == GeomType.CYLINDER]
    raise ValueError(f"unknown face selector {selector!r}")


def pick_edges(shape, points: list, tol: float = 0.5) -> list[Edge]:
    """Edges nearest to each picked point — explicit CATIA-style edge
    selection for Fillet / Chamfer / Variable Radius Fillet."""
    edges = list(shape.edges())
    picked = []
    for p in points:
        pt = as_vector(p, "edge point")
        best, best_d = None, float("inf")
        for e in edges:
            d = e.distance_to(pt)
            if d < best_d:
                best, best_d = e, d
        if best is None or best_d > tol:
            raise ValueError(f"no edge of the part within {tol} mm of point {list(p)}")
        if not any(best.is_same(q) for q in picked):
            picked.append(best)
    return picked


def edges_of_faces(shape, points: list, tol: float = 0.5) -> list[Edge]:
    """Every edge bounding the faces picked by `points` — CATIA lets a
    Fillet / Chamfer take a face instead of edges ("sélectionnez une face
    dont les arêtes doivent être chanfreinées"), meaning all its edges."""
    edges: list[Edge] = []
    for face in pick_faces(shape, None, points, tol=tol):
        for e in face.edges():
            if not any(e.is_same(q) for q in edges):
                edges.append(e)
    return edges


def _single_solid(shape) -> Solid:
    solids = list(shape.solids())
    if len(solids) != 1:
        raise ValueError(f"this operation needs a single solid body, the part currently has {len(solids)}")
    return solids[0]


def _big_length(shape, plane: Optional[Plane] = None) -> float:
    """A length guaranteed to pass all the way through `shape` from
    anywhere near it — how "Up to last" / through-all limits are realised."""
    if shape is None:
        return 1000.0
    bb = shape.bounding_box()
    span = (bb.max - bb.min).length
    reach = 0.0
    if plane is not None:
        reach = max((Vector(x, y, z) - plane.origin).length
                    for x in (bb.min.X, bb.max.X) for y in (bb.min.Y, bb.max.Y) for z in (bb.min.Z, bb.max.Z))
    return 2.0 * (span + reach) + 10.0


# ---------------------------------------------------------------------------
# Sketch-Based Features
# ---------------------------------------------------------------------------
NEW_FEATURE_OPS = {"groove", "rib", "slot", "loft", "removed_loft", "hole", "stiffener"}
SUBTRACTIVE_OPS = {"pocket", "groove", "slot", "removed_loft", "hole"}


def uses_extended_path(feature) -> bool:
    """True when a feature needs the algebra-mode builder in this module
    rather than cad_server.py's original in-builder extrude/revolve —
    either a new op, or a Pad/Pocket/Revolve using a definition-box option
    the original path never had. Plain features keep taking the original
    code path untouched."""
    if feature.op in NEW_FEATURE_OPS:
        return True
    return bool(feature.reverse or feature.mirrored or feature.depth2 or feature.limit != "dimension"
                or feature.thin1 or feature.thin2 or feature.angle2)


def _thin_profile(faces, t1: float, t2: float):
    """Thin Pad / Thin Pocket: the band between the profile offset outward
    by t2 and inward by t1 — CATIA's Thickness1 / Thickness2."""
    outer = offset(faces, amount=t2, kind=Kind.ARC, mode=Mode.PRIVATE) if t2 else faces
    if t1:
        inner = offset(faces, amount=-t1, kind=Kind.ARC, mode=Mode.PRIVATE)
        band = outer - inner
    else:
        band = outer - faces
    if not list(band.faces()):
        raise ValueError("thin profile is empty — the thicknesses are larger than the profile itself")
    return band


def _plane_at_path_start(path: Wire, plane: Plane) -> Plane:
    """Rib / Slot "Move profile to path": the profile plane relocated to the
    start of the center curve with its normal along the curve's tangent
    there. The sketch's own X direction is kept as far as it stays
    perpendicular to the tangent, so the profile keeps its orientation."""
    start = path @ 0
    z = Vector(path % 0).normalized()
    x = plane.x_dir - z * plane.x_dir.dot(z)
    if x.length < 1e-6:
        x = plane.y_dir - z * plane.y_dir.dot(z)
    if x.length < 1e-6:
        x = Vector(0, 0, 1).cross(z) if abs(z.Z) < 0.99 else Vector(1, 0, 0).cross(z)
    return Plane(origin=start, x_dir=x.normalized(), z_dir=z)


def _revolve_axis(plane: Plane, axis_name: str) -> Axis:
    axis_dir = plane.x_dir if axis_name != "Y" else plane.z_dir.cross(plane.x_dir)
    return Axis(plane.origin, axis_dir)


def build_path_wire(path: dict) -> Wire:
    """Rib / Slot center curve in 3D: {"start": [x,y,z], "segments": [{kind:
    line|arc|spline, end, mid (arc), through (spline interior points)}]}."""
    if not path or not path.get("start") or not path.get("segments"):
        raise ValueError("a rib/slot needs a center curve: {start, segments}")
    with BuildLine() as bl:
        cur = tuple(float(c) for c in path["start"])
        for seg in path["segments"]:
            end = tuple(float(c) for c in seg["end"])
            kind = seg.get("kind", "line")
            if kind == "arc":
                ThreePointArc(cur, tuple(seg["mid"]), end)
            elif kind == "spline":
                Spline(cur, *[tuple(p) for p in seg.get("through", [])], end)
            elif kind == "line":
                Line(cur, end)
            else:
                raise ValueError(f"unknown center-curve segment kind {kind!r}")
            cur = end
    return Wire(bl.edges())


def hole_tool(hole: dict, top_extension: float = 0.01) -> Solid:
    """One hole's cutting tool in local coordinates: axis along -Z from the
    surface at z=0, built by revolving its half cross-section — so a
    V-bottom cone, a counterbore step and a countersink cone all come out
    as one exact solid rather than stacked approximations."""
    thread = None
    if hole.get("thread"):
        th = hole["thread"]
        thread = thread_spec(th.get("designation"), th.get("nominal"), th.get("pitch"))
    diameter = hole.get("diameter")
    if diameter is None:
        if thread is None:
            raise ValueError("a hole needs a diameter (or a thread, whose core diameter it then uses)")
        diameter = thread["minorDiameter"]
    diameter = float(diameter)
    depth = float(hole.get("depth") or 0.0)
    if diameter <= 0:
        raise ValueError("hole diameter must be positive")
    if depth <= 0:
        raise ValueError("hole depth must be positive (use limit 'up_to_last' for a through hole)")
    r = diameter / 2.0
    top = top_extension
    kind = hole.get("type", "simple")
    profile = [(0.0, top)]
    if kind == "simple":
        profile += [(r, top)]
    elif kind == "counterbored":
        rc = float(hole.get("cbDiameter", 0)) / 2.0
        hc = float(hole.get("cbDepth", 0))
        if rc <= r or hc <= 0 or hc >= depth:
            raise ValueError("counterbore needs cbDiameter > diameter and 0 < cbDepth < depth")
        profile += [(rc, top), (rc, -hc), (r, -hc)]
    elif kind == "countersunk":
        rs = float(hole.get("csDiameter", 0)) / 2.0
        ang = float(hole.get("csAngle", 90.0))
        if rs <= r or not 0 < ang < 180:
            raise ValueError("countersink needs csDiameter > diameter and 0° < csAngle < 180°")
        hs = (rs - r) / math.tan(math.radians(ang / 2.0))
        if hs >= depth:
            raise ValueError("countersink is deeper than the hole")
        profile += [(rs + top * math.tan(math.radians(ang / 2.0)), top), (r, -hs)]
    else:
        raise ValueError(f"unknown hole type {kind!r} (simple | counterbored | countersunk)")
    profile.append((r, -depth))
    bottom = hole.get("bottom", "flat")
    if bottom == "v_bottom":
        ang = float(hole.get("bottomAngle", 120.0))
        if not 0 < ang < 180:
            raise ValueError("V-bottom angle must be between 0° and 180°")
        profile.append((0.0, -depth - r / math.tan(math.radians(ang / 2.0))))
    elif bottom == "flat":
        profile.append((0.0, -depth))
    else:
        raise ValueError(f"unknown hole bottom {bottom!r} (flat | v_bottom)")
    pts = [Vector(x, 0, z) for x, z in profile]
    face = Face(Wire.make_polygon(pts, close=True))
    return Solid.revolve(face, 360, Axis.Z)


def hole_positions(feature) -> list[tuple[float, float, Optional[float]]]:
    """Where to drill, in sketch-plane coordinates: the hole spec's own
    `positions` (CATIA's Positioning Sketch), else the centres of the
    feature's circle loops (the Hole tool on a sketched circle — the
    circle's size then gives the diameter unless the spec sets one)."""
    spec = feature.hole or {}
    if spec.get("positions"):
        return [(float(p[0]), float(p[1]), None) for p in spec["positions"]]
    out = [(l.center[0], l.center[1], 2 * l.r) for l in feature.loops if l.kind == "circle" and l.center and l.r]
    if not out:
        raise ValueError(f"hole {feature.id!r} needs positions, or circle loops marking where to drill")
    return out


def _open_path_points(path: dict, arc_steps: int = 24) -> list[tuple[float, float]]:
    """A 2D open sketch chain {start, segments:[{kind: line|arc, end, mid}]}
    as a polyline in sketch-plane coordinates (arcs sampled)."""
    if not path or not path.get("start") or not path.get("segments"):
        raise ValueError("a stiffener needs an open profile: {start, segments}")
    cur = (float(path["start"][0]), float(path["start"][1]))
    pts = [cur]
    for seg in path["segments"]:
        end = (float(seg["end"][0]), float(seg["end"][1]))
        if seg.get("kind", "line") == "arc" and seg.get("mid"):
            arc = Edge.make_three_point_arc(Vector(*cur, 0), Vector(seg["mid"][0], seg["mid"][1], 0), Vector(*end, 0))
            pts += [(p.X, p.Y) for p in (arc.position_at(i / arc_steps) for i in range(1, arc_steps + 1))]
        else:
            pts.append(end)
        cur = end
    if len(pts) < 2 or math.dist(pts[0], pts[-1]) < 1e-6:
        raise ValueError("a stiffener profile must be an open chain with distinct ends")
    return pts


def stiffener_tool(feature, plane: Plane, current) -> Solid:
    """Stiffener (Raidisseur): an open profile drawn in a plane cutting the
    part is thickened across that plane (symmetric when `mirrored`) and
    filled toward the existing material.

    CATIA extrudes the profile in its own plane until existing material
    stops it. Here the fill is the strip swept from the profile along its
    in-plane normal, on whichever side overlaps the part's material, and
    clipped to the part's bounding box. For walls meeting at a corner (the
    manual's example) this is exact, since the strip beyond the web lies
    inside the walls; on shapes with gaps between profile and material it
    can overfill up to the bounding box."""
    if current is None:
        raise ValueError("a stiffener needs existing material to rest on — build a pad first")
    t = float(feature.thickness or 0.0)
    if t <= 0:
        raise ValueError("stiffener thickness must be positive")
    pts = _open_path_points(feature.openPath or {})
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    chord = math.hypot(x1 - x0, y1 - y0)
    nx, ny = -(y1 - y0) / chord, (x1 - x0) / chord
    reach = _big_length(current, plane)
    bb = current.bounding_box()
    clip = Solid.make_box(bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z).moved(Location(bb.min))
    best, best_overlap = None, 0.0
    for sign in (1.0, -1.0):
        far = [(x + sign * nx * reach, y + sign * ny * reach) for x, y in reversed(pts)]
        outline = [plane.from_local_coords((x, y, 0)) for x, y in pts + far]
        face = Face(Wire.make_polygon(outline, close=True))
        if feature.mirrored:
            slab = Solid.extrude(face.moved(Location(plane.z_dir * (-t / 2))), plane.z_dir * t)
        else:
            slab = Solid.extrude(face, plane.z_dir * (-t if feature.reverse else t))
        # build123d returns None for an empty intersection.
        tool = slab & clip
        common = tool & current if tool is not None and list(tool.solids()) else None
        overlap = sum(s.volume for s in common.solids()) if common is not None else 0.0
        if overlap > best_overlap + 1e-6:
            best, best_overlap = tool, overlap
    if best is None:
        raise ValueError("no existing material on either side of the stiffener profile to bound it")
    return best


def build_feature_solid(feature, plane: Plane, draw_loops, current) -> tuple[object, Mode]:
    """The tool solid for one extended feature plus whether it adds or
    removes material. `draw_loops(feature)` is cad_server's own loop
    drawing (so outer boundaries / holes nest exactly as for a plain Pad),
    run here inside a PRIVATE sketch so nothing leaks into the part."""
    mode = Mode.SUBTRACT if feature.op in SUBTRACTIVE_OPS else Mode.ADD

    if feature.op == "stiffener":
        return stiffener_tool(feature, plane, current), Mode.ADD

    if feature.op == "hole":
        spec = dict(feature.hole or {})
        tools = []
        for x, y, loop_d in hole_positions(feature):
            one = dict(spec)
            if one.get("diameter") is None and not one.get("thread") and loop_d:
                one["diameter"] = loop_d
            if feature.limit == "up_to_last" or spec.get("limit") == "up_to_last":
                one["depth"] = _big_length(current, plane)
                one["bottom"] = "flat"
                if one.get("type") != "simple":
                    one["depth"] = max(one["depth"], float(one.get("cbDepth", 0)) + 1)
            tool = hole_tool(one)
            origin = plane.from_local_coords((x, y, 0))
            loc = Plane(origin=origin, x_dir=plane.x_dir, z_dir=plane.z_dir).location
            tools.append(tool.moved(loc))
        return Compound(tools) if len(tools) > 1 else tools[0], Mode.SUBTRACT

    if feature.op in ("loft", "removed_loft"):
        if len(feature.sections) < 2:
            raise ValueError(f"multi-sections feature {feature.id!r} needs at least 2 sections")
        faces = []
        for i, sec in enumerate(feature.sections):
            sec_plane = plane_from_spec(sec.get("plane")) if sec.get("plane") else Plane.XY.offset(float(sec.get("zOffset", 0.0)))
            sub = type(feature)(id=f"{feature.id}.s{i}", op="pad", loops=sec["loops"])
            with BuildSketch(sec_plane, mode=Mode.PRIVATE) as sk:
                draw_loops(sub)
            sec_faces = list(sk.sketch.faces())
            if len(sec_faces) != 1:
                raise ValueError(f"section {i} of {feature.id!r} must be one closed profile (got {len(sec_faces)} faces)")
            faces.append(sec_faces[0])
        return loft(faces, ruled=bool(feature.ruled), mode=Mode.PRIVATE), mode

    path_wire = None
    if feature.op in ("rib", "slot"):
        path_wire = build_path_wire(feature.path or {})
        if getattr(feature, "moveProfile", False):
            plane = _plane_at_path_start(path_wire, plane)

    with BuildSketch(plane, mode=Mode.PRIVATE) as sk:
        draw_loops(feature)
    faces = sk.sketch
    if feature.thin1 or feature.thin2:
        faces = _thin_profile(faces, float(feature.thin1 or 0), float(feature.thin2 or 0))

    if feature.op in ("revolve", "groove"):
        axis = _revolve_axis(plane, feature.axis)
        a1, a2 = float(feature.angle or 360.0), float(feature.angle2 or 0.0)
        total = a1 + a2
        if total <= 0 or total > 360:
            raise ValueError("first angle + second angle must be in (0°, 360°]")
        if a2:
            faces = faces.rotate(axis, -a2)
        return revolve(faces, axis=axis, revolution_arc=total, mode=Mode.PRIVATE), mode

    if feature.op in ("rib", "slot"):
        path = path_wire
        transition = Transition.RIGHT if feature.transition == "right" else Transition.ROUND
        control = feature.profileControl
        if control in ("pulling_direction", "reference_surface"):
            # A fixed direction for the profile (a reference surface here is a
            # plane, whose normal never changes).
            d = feature.pullingDirection
            if not d or len(d) != 3 or not any(abs(c) > 1e-9 for c in d):
                raise ValueError("pulling direction / reference surface needs a non-zero direction")
            if abs(Vector(*[float(c) for c in d]).normalized().dot(Vector(path % 0).normalized())) > 0.9999:
                raise ValueError("the pulling direction must not be parallel to the center curve at its start")
            try:
                return sweep(faces, path=path, normal=tuple(float(c) for c in d),
                             transition=transition, mode=Mode.PRIVATE), mode
            except TypeError as exc:
                raise ValueError("this build123d version cannot sweep with a fixed pulling direction") from exc
        return sweep(faces, path=path, is_frenet=control == "frenet",
                     transition=transition, mode=Mode.PRIVATE), mode

    # Pad / Pocket with definition-box options.
    normal = plane.z_dir
    if feature.limit == "up_to_last":
        big = _big_length(current, plane)
        amount = -big if feature.op == "pocket" else big
    elif feature.limit == "dimension":
        amount = float(feature.depth)
    else:
        raise ValueError(f"unknown limit {feature.limit!r} (dimension | up_to_last)")
    if feature.reverse:
        amount = -amount
    if feature.mirrored:
        return extrude(faces, amount=abs(amount), dir=normal, both=True, mode=Mode.PRIVATE), mode
    solid = extrude(faces, amount=amount, dir=normal, mode=Mode.PRIVATE)
    if feature.depth2:
        # Second Limit: the other side of the sketch plane.
        sign = -1.0 if amount >= 0 else 1.0
        solid = solid + extrude(faces, amount=sign * abs(float(feature.depth2)), dir=normal, mode=Mode.PRIVATE)
    return solid, mode


# ---------------------------------------------------------------------------
# Dress-Up / Transformation modifiers
# ---------------------------------------------------------------------------
EXT_MODIFIER_OPS = {
    "draft", "thickness", "remove_face", "variable_fillet", "translate_body", "rotate_body",
    "symmetry_body", "user_pattern_body", "split_body", "thread",
}


def apply_ext_modifier(shape, mod):
    """Apply one extended modifier to the current shape; returns the new
    shape (the caller swaps it in with Mode.REPLACE)."""
    op = mod.op
    if op == "draft":
        pull = as_vector(mod.pullDirection or (0, 0, 1), "pullDirection").normalized()
        solid = _single_solid(shape)
        faces = pick_faces(solid, mod.faceSelector or "side", mod.facePoints, reference=pull)
        if not faces:
            raise ValueError("no faces selected to draft")
        if mod.neutralPlane is not None:
            neutral = plane_from_spec(mod.neutralPlane)
            if neutral.z_dir.dot(pull) < 0:
                neutral = Plane(origin=neutral.origin, x_dir=neutral.x_dir, z_dir=-neutral.z_dir)
        else:
            # CATIA's usual neutral element: the face the part stands on,
            # i.e. the lowest point along the pull direction.
            low = min((v for v in solid.vertices()), key=lambda v: Vector(v).dot(pull))
            neutral = Plane(origin=Vector(low).dot(pull) * pull, z_dir=pull)
        angle = float(mod.draftAngle if mod.draftAngle is not None else 5.0)
        if not -89 < angle < 89 or angle == 0:
            raise ValueError("draft angle must be non-zero and between -89° and 89°")
        return solid.draft(faces, neutral, angle)

    if op == "thickness":
        t = float(mod.thickness or 0.0)
        if t == 0:
            raise ValueError("thickness must be non-zero (positive adds material, negative removes it)")
        solid = _single_solid(shape)
        faces = pick_faces(solid, mod.faceSelector, mod.facePoints)
        if not faces or (mod.faceSelector in (None, "all") and not mod.facePoints):
            raise ValueError("thickness needs the faces to offset (facePoints or a faceSelector other than 'all')")
        result = solid
        for f in faces:
            if t > 0:
                result = result + Solid.thicken(f, t)
            else:
                result = result - Solid.thicken(f, -t, normal_override=-face_normal(f, f.center()))
        return result

    if op == "remove_face":
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Defeaturing
        faces = pick_faces(shape, mod.faceSelector, mod.facePoints)
        if not mod.facePoints and mod.faceSelector in (None, "all"):
            raise ValueError("remove_face needs the faces to remove (facePoints or a faceSelector)")
        algo = BRepAlgoAPI_Defeaturing()
        algo.SetShape(shape.wrapped)
        for f in faces:
            algo.AddFaceToRemove(f.wrapped)
        algo.SetRunParallel(False)
        algo.Build()
        if not algo.IsDone():
            raise ValueError("remove face failed — the neighbouring faces can't be extended to close the gap")
        return as_shape(algo.Shape())

    if op == "variable_fillet":
        from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
        from OCP.TopoDS import TopoDS
        if not mod.edgePoints and not mod.facePoints:
            raise ValueError("variable radius fillet needs edgePoints or facePoints to pick its edges")
        r1 = float(mod.radius or 1.0)
        r2 = float(mod.radius2 if mod.radius2 is not None else r1)
        if r1 <= 0 or r2 <= 0:
            raise ValueError("fillet radii must be positive")
        mk = BRepFilletAPI_MakeFillet(shape.wrapped)
        picked = pick_edges(shape, mod.edgePoints) if mod.edgePoints else edges_of_faces(shape, mod.facePoints)
        for e in picked:
            mk.Add(r1, r2, TopoDS.Edge_s(e.wrapped))
        mk.Build()
        if not mk.IsDone():
            raise ValueError("variable radius fillet failed — radii too large for the neighbouring faces")
        return as_shape(mk.Shape())

    if op == "translate_body":
        v = as_vector(mod.vector or (0, 0, 0), "vector")
        return shape.moved(Location(v))

    if op == "rotate_body":
        origin = as_vector(mod.axisOrigin or (0, 0, 0), "axisOrigin")
        direction = as_vector(mod.axisDirection or _DIRS.get("+" + (mod.axis or "Z"), (0, 0, 1)), "axisDirection")
        return shape.rotate(Axis(origin, direction), float(mod.angle))

    if op == "symmetry_body":
        return shape.mirror(plane_from_spec(mod.planeSpec or mod.plane))

    if op == "user_pattern_body":
        if not mod.offsets:
            raise ValueError("user pattern needs offsets (one [dx, dy, dz] per extra instance)")
        result = shape
        for o in mod.offsets:
            result = result + shape.moved(Location(as_vector(o, "offset")))
        return result

    if op == "split_body":
        plane = plane_from_spec(mod.planeSpec or mod.plane)
        keep = Keep.BOTTOM if mod.keep == "-" else Keep.TOP
        result = split(shape, bisect_by=plane, keep=keep, mode=Mode.PRIVATE)
        if not list(result.solids()):
            raise ValueError("split removed the whole body — nothing is left on the kept side")
        return result

    if op == "thread":
        # Cosmetic, like CATIA's Thread/Tap: no geometry change, but the
        # picked face must really be a cylinder of the thread's size.
        if not mod.facePoints:
            raise ValueError("thread/tap needs facePoints on the cylindrical face to thread")
        spec = thread_spec(mod.designation, mod.nominal, mod.pitch)
        for f in pick_faces(shape, None, mod.facePoints):
            if f.geom_type != GeomType.CYLINDER:
                raise ValueError(f"thread face must be cylindrical, the picked face is {f.geom_type.name.lower()}")
            d = 2 * cylinder_radius(f)
            want = spec["minorDiameter"] if mod.threadType == "tap" else spec["nominalDiameter"]
            if abs(d - want) > max(0.05 * want, 0.1):
                raise ValueError(f"{spec['designation']} {mod.threadType or 'thread'} needs a Ø{want:.3f} cylinder, the picked one is Ø{d:.3f}")
        return shape

    raise ValueError(f"unknown modifier op: {op!r}")


def cylinder_radius(face: Face) -> float:
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    return BRepAdaptor_Surface(face.wrapped).Cylinder().Radius()


def scale_about(shape, factor, center=None, vector=None):
    """Scaling about a point (CATIA's reference point) and/or per-axis
    (scaling along a direction) — the uniform-about-origin case stays in
    cad_server.py's original scale_body code."""
    c = as_vector(center or (0, 0, 0), "scaleCenter")
    by = tuple(float(v) for v in vector) if vector else float(factor or 1.0)
    from build123d import scale
    moved = shape.moved(Location(-c))
    return scale(moved, by=by, mode=Mode.PRIVATE).moved(Location(c))


def iter_threads(features: Iterable, modifiers: Iterable) -> list[dict]:
    """Every thread/tap the part declares (Tap-Thread Analysis)."""
    out = []
    for f in features:
        if f.op == "hole" and f.hole and f.hole.get("thread"):
            th = f.hole["thread"]
            spec = thread_spec(th.get("designation"), th.get("nominal"), th.get("pitch"))
            positions = hole_positions(f)
            out.append({"source": f.id, "kind": "tap", **spec,
                        "threadDepth": float(th.get("depth", f.hole.get("depth", 0) or 0)),
                        "holeDepth": float(f.hole.get("depth", 0) or 0), "count": len(positions),
                        "positions": [[x, y] for x, y, _ in positions]})
    for m in modifiers:
        if m.op == "thread":
            spec = thread_spec(m.designation, m.nominal, m.pitch)
            out.append({"source": m.id, "kind": m.threadType or "thread", **spec,
                        "threadDepth": float(m.threadDepth or 0), "count": len(m.facePoints or [])})
    return out
