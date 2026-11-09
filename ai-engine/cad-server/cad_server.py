"""
cad_server.py

my-cad-ui's "Generate Mesh" button already does this, in app/page.tsx:

    fetch("http://127.0.0.1:8000/generate", {
      method: "POST",
      body: JSON.stringify({ shape, size }),
    })

...expecting a real server on the other end. There wasn't one yet — this
is that server. It takes the same {shape, size} the frontend already
sends, builds the actual solid with build123d (a Python wrapper around
Open Cascade), and returns a real STL mesh. No frontend changes needed;
this just makes the button that already exists actually work.

Run it with:
    pip install fastapi uvicorn build123d
    uvicorn cad_server:app --port 8000 --reload

Then, separately, `npm run dev` inside my-cad-ui and click "Generate Mesh."
"""

import copy
import json
import subprocess, tempfile, sys, base64
import math
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from build123d import (
    Axis, BuildLine, BuildPart, BuildSketch, Box, Circle, Cylinder, GeomType, Kind, Line,
    Locations, Mode, Plane, Polygon, Sphere, ThreePointArc, Vector, add, chamfer,
    export_stl, extrude, fillet, make_face, mirror, offset, revolve, scale,
)
from sketch_solver import Sketch
import part_features

# image_to_sketch pulls in opencv, a heavier optional dependency this
# venv may not have yet. A missing/broken import here shouldn't take
# down solve_sketch, projects, or generate — none of which touch images
# — so it's caught and /sketch_from_image reports the real reason
# instead of the whole app failing to start.
try:
    from image_to_sketch import image_to_sketch
    _IMAGE_TO_SKETCH_ERROR = None
except ImportError as e:
    image_to_sketch = None
    _IMAGE_TO_SKETCH_ERROR = e

app = FastAPI()

# Different frontends, different dev-server ports, same backend on :8000.
# my-cad-ui (Next.js) runs on :3000; the Bolt.new / Vite project runs on
# :5173 by default. The browser blocks cross-origin requests unless we
# explicitly allow the origin making them.
# Who may call this API from a browser. By default: this machine's own dev
# servers on any port (Vite on :5173, vite preview on :4173, the e2e test
# server…). When hosting the backend, set FAELYX_CORS_ORIGINS to the exact
# site(s) allowed, comma-separated — e.g. the GitHub Pages copy:
#   FAELYX_CORS_ORIGINS=https://you.github.io
# and only those origins are accepted (no localhost wildcard).
_cors_env = [o.strip() for o in os.environ.get("FAELYX_CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_env or ["http://localhost:3000", "http://localhost:5173"],
    allow_origin_regex=None if _cors_env else r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------
# Project persistence — real files on disk (cad-server/projects/*.json),
# not a mock. Whatever the frontend's "Save" button sends is exactly
# what "Open" reads back, so both machines on the shared repo can see
# each other's saved projects if the projects/ folder is committed.
# ---------------------------------------------------------------------
PROJECTS_DIR = Path(__file__).parent / "projects"
PROJECTS_DIR.mkdir(exist_ok=True)


def _project_path(name: str) -> Path:
    safe = "".join(c for c in name if c.isalnum() or c in (" ", "-", "_")).strip()
    if not safe:
        raise ValueError("project name must contain at least one letter, digit, space, - or _")
    return PROJECTS_DIR / f"{safe}.json"


class GenerateRequest(BaseModel):
    shape: str
    size: float


class SketchPoint(BaseModel):
    id: str
    x: float
    y: float


class SketchLine(BaseModel):
    id: str
    p1: str
    p2: str


class SketchCircle(BaseModel):
    id: str
    center: str
    r: float


class SketchArc(BaseModel):
    id: str
    center: str
    p1: str
    p2: str


class SketchConstraint(BaseModel):
    type: str
    args: dict = {}


class SketchRequest(BaseModel):
    points: list[SketchPoint] = []
    lines: list[SketchLine] = []
    circles: list[SketchCircle] = []
    arcs: list[SketchArc] = []
    # Free-form curves (ellipse, parabola, hyperbola, spline, spline-cv,
    # conic-rp, conic) as {id, kind, ...point ids and shape numbers} —
    # see sketch_curves.py for each kind's fields.
    curves: list[dict] = []
    constraints: list[SketchConstraint] = []
    # Which reference plane this sketch belongs to (Front/Top/Right). Purely
    # organizational for now — solve_sketch ignores it, the solver has no
    # notion of 3D — but it round-trips through /projects so a saved
    # project reopens on the same plane the user left it on.
    plane: str = "Front"


class ProjectPayload(BaseModel):
    workspace: str = "Sketch & 2D"
    # Stored exactly as the frontend sends it (points, lines, circles, arcs,
    # curves, constraints, plane, hidden elements, sketch positioning…) —
    # a typed model here would silently drop any field it doesn't list.
    sketch: Optional[dict] = None
    threeD: Optional[dict] = None


class ImageToSketchRequest(BaseModel):
    # A data: URL or raw base64 string of the uploaded image — whichever
    # FileReader.readAsDataURL() on the frontend happens to hand back;
    # image_to_sketch() accepts either.
    image: str


class ProfileLoop(BaseModel):
    """One closed boundary out of a sketch, already traced and solved by
    the frontend (see SketchWorkspace.tsx's traceLoops()) — this endpoint
    has no notion of sketch points/lines/constraints, only the finished
    2D shape they resolve to.

    kind="polygon" carries absolute (x, y) vertices in sketch-plane units,
    already in order around the boundary (an ordinary CATIA-style sketch
    profile like the U-shaped slot outline, or a plain rectangle).
    kind="circle" carries a center + radius instead, so an exact circle
    doesn't need to be approximated as a many-sided polygon.
    kind="path" is a closed chain of straight and circular-arc segments
    (a Profile of lines and tangent arcs, a slot, a filleted corner):
    `start` is the first vertex and each segment ends at `end`; an arc
    segment also carries `mid`, a point on the arc between its ends.
    """
    kind: str  # "polygon" | "circle" | "path"
    points: list[list[float]] = []
    center: Optional[list[float]] = None
    r: Optional[float] = None
    start: Optional[list[float]] = None
    segments: list[dict] = []


class PartFeature(BaseModel):
    """One Pad, Pocket or Revolve, CATIA Part Design style: a sketch's
    loops, an extrude direction/depth (or a revolve axis/angle), and
    where along Z that sketch plane sits.

    A feature's loops nest by area: the largest loop is the outer
    boundary and every other loop in the same feature is subtracted from
    it as a hole — the one rule that turns two concentric circles into a
    ring, or a rectangle plus two small circles into a plate with
    mounting holes, without either shape needing special-casing.
    """
    id: str
    op: str  # "pad" (add material) | "pocket" (remove material) | "revolve" (add, lathed around an axis)
    zOffset: float = 0.0
    depth: float = 0.0
    loops: list[ProfileLoop] = []
    # Revolve-only: which in-plane axis (through the sketch plane's own
    # origin) the profile spins around, and how far around (360 = a full
    # solid of revolution, less = a wedge/lathe cut).
    axis: str = "X"
    angle: float = 360.0
    # Sketch support other than the default XY stack: a picked planar face
    # of the part (CATIA's "select a plane, planar face, or a sketch").
    # {"origin": [x,y,z], "xDir": [x,y,z], "normal": [x,y,z]} — the sketch's
    # H direction is xDir and a Pad grows along the (outward) normal.
    plane: Optional[dict] = None
    # --- CATIA definition-box options (see part_features.py). All default
    # to "off", so a feature that doesn't set them builds exactly as before.
    # op may also be "groove" | "rib" | "slot" | "loft" | "removed_loft" | "hole".
    reverse: bool = False                # Reverse Direction
    mirrored: bool = False               # Mirrored extent (depth on both sides)
    depth2: Optional[float] = None       # Second Limit (other side of the sketch)
    limit: str = "dimension"             # "dimension" | "up_to_last" (through all)
    thin1: Optional[float] = None        # Thin Pad/Pocket: Thickness1 (inward)
    thin2: Optional[float] = None        # Thin Pad/Pocket: Thickness2 (outward)
    angle2: Optional[float] = None       # Shaft/Groove Second Angle
    path: Optional[dict] = None          # Rib/Slot center curve {start, segments} in 3D
    profileControl: str = "keep_angle"   # Rib/Slot: "keep_angle" | "frenet" | "pulling_direction" | "reference_surface"
    pullingDirection: Optional[list[float]] = None  # Rib/Slot: fixed profile direction (pulling_direction / reference_surface)
    moveProfile: bool = False            # Rib/Slot: put the profile at the start of the center curve, normal to it
    transition: str = "round"            # Rib/Slot corner transition: "round" | "right"
    sections: list[dict] = []            # Multi-sections: [{loops, zOffset | plane}]
    ruled: bool = False                  # Multi-sections: straight (ruled) coupling
    hole: Optional[dict] = None          # Hole spec — see part_features.hole_tool
    openPath: Optional[dict] = None      # Stiffener: open 2D profile {start:[x,y], segments:[{kind, end, mid}]}
    thickness: Optional[float] = None    # Stiffener thickness


def _feature_plane(feature: "PartFeature") -> Plane:
    if feature.plane:
        try:
            return Plane(
                origin=tuple(feature.plane["origin"]),
                x_dir=tuple(feature.plane["xDir"]),
                z_dir=tuple(feature.plane["normal"]),
            )
        except (KeyError, TypeError) as e:
            raise ValueError(f"feature {feature.id!r} has an invalid sketch plane: {e}") from e
    return Plane.XY.offset(feature.zOffset)


class Modifier(BaseModel):
    """A whole-body operation applied after every Pad/Pocket/Revolve
    feature has already been stacked — CATIA's "Dress-Up" features
    (Fillet, Chamfer, Shell) and body-level transforms (Mirror Body,
    patterns, Scale). Same stateless replay contract as PartFeature:
    every /build_part call sends the complete ordered list, nothing is
    kept server-side between calls.

    Fillet/Chamfer have no interactive edge-picking UI yet, so
    edgeFilter is a real (not fake) stand-in for it: every edge of the
    body is inspected and only the ones matching the filter — running
    parallel to Z ("vertical") or perpendicular to it ("horizontal") —
    are rounded/beveled. Shell has no face-picking UI either, so it
    always opens whichever face points most nearly straight up (+Z);
    there is no invented geometry, just an automatic choice standing in
    for a click.
    """
    id: str
    op: str  # "fillet" | "chamfer" | "shell" | "mirror_body" | "linear_pattern_body" | "circular_pattern_body" | "scale_body"
    radius: Optional[float] = None      # fillet / chamfer
    edgeFilter: str = "all"             # fillet / chamfer: "all" | "vertical" | "horizontal" | "curved"
    # Chamfer shape (CATIA's Length/Angle or two lengths): with neither set
    # it's an equal-distance chamfer of `radius`; `chamferAngle` (degrees,
    # measured from the first face) or `length2` make it asymmetric.
    chamferAngle: Optional[float] = None
    length2: Optional[float] = None
    thickness: Optional[float] = None   # shell wall thickness
    plane: str = "YZ"                   # mirror_body: "XY" | "YZ" | "XZ"
    axis: str = "X"                     # linear_pattern_body: "X" | "Y" | "Z"
    spacing: Optional[float] = None     # linear_pattern_body: distance between copies
    count: int = 2                      # linear/circular pattern: total number of instances
    angle: float = 360.0                # circular_pattern_body: total sweep across all instances
    factor: Optional[float] = None      # scale_body
    # --- Extended CATIA ops (see part_features.py), all optional:
    # "draft" | "thickness" | "remove_face" | "variable_fillet" |
    # "translate_body" | "rotate_body" | "symmetry_body" |
    # "user_pattern_body" | "split_body" | "thread".
    edgePoints: list[list[float]] = []          # explicit edge picks (fillet/chamfer/variable_fillet)
    facePoints: list[list[float]] = []          # explicit face picks (shell/draft/thickness/remove_face/thread)
    faceSelector: Optional[str] = None          # "+X".."-Z" | "top" | "bottom" | "side" | "planar" | "cylindrical"
    radius2: Optional[float] = None             # variable_fillet: radius at the edge's far end
    thicknessOutside: Optional[float] = None    # shell: outside thickness (CATIA's second shell value)
    draftAngle: Optional[float] = None          # draft
    pullDirection: Optional[list[float]] = None # draft: demoulding direction (default +Z)
    neutralPlane: Optional[dict] = None         # draft: neutral element plane
    vector: Optional[list[float]] = None        # translate_body
    axisOrigin: Optional[list[float]] = None    # rotate_body / circular pattern axis
    axisDirection: Optional[list[float]] = None # rotate_body / circular pattern axis
    planeSpec: Optional[dict] = None            # symmetry/split: {origin, normal} or {name, offset}
    keep: str = "+"                             # split_body: side of the plane's normal to keep
    offsets: list[list[float]] = []             # user_pattern_body instance offsets
    axis2: Optional[str] = None                 # linear_pattern_body: second direction (Rectangular Pattern)
    spacing2: Optional[float] = None
    count2: int = 1
    scaleCenter: Optional[list[float]] = None   # scale_body: reference point
    scaleVector: Optional[list[float]] = None   # scale_body: per-axis factors [sx, sy, sz]
    designation: Optional[str] = None           # thread: "M10" / "M10x1.25"
    nominal: Optional[float] = None
    pitch: Optional[float] = None
    threadType: Optional[str] = None            # thread: "thread" (external) | "tap" (internal)
    threadDepth: Optional[float] = None


class BuildPartRequest(BaseModel):
    features: list[PartFeature]
    modifiers: list[Modifier] = []
    # Optional material name (see analysis.MATERIALS) — used by
    # /measure_inertia and the drawing title block; ignored by /build_part.
    material: Optional[str] = None


def _polygon_area(points: list[list[float]]) -> float:
    """Shoelace formula — used only to rank loops by size (which one is
    the outer boundary vs. a hole cut into it), not for anything geometric."""
    total = 0.0
    n = len(points)
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def _path_vertices(loop: ProfileLoop) -> list[list[float]]:
    """A path loop's vertices, arc midpoints included — close enough to
    rank loops by size (outer boundary vs. holes)."""
    pts = [loop.start] if loop.start else []
    for seg in loop.segments:
        if seg.get("kind") == "arc" and seg.get("mid"):
            pts.append(seg["mid"])
        pts.append(seg["end"])
    return pts


def _loop_area(loop: ProfileLoop) -> float:
    if loop.kind == "circle":
        return math.pi * (loop.r or 0.0) ** 2
    if loop.kind == "path":
        return _polygon_area(_path_vertices(loop))
    return _polygon_area(loop.points)


def _circle_through(a, b, c):
    d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
    if abs(d) < 1e-12:
        return None
    s = lambda p: p[0] ** 2 + p[1] ** 2
    x = (s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d
    y = (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d
    return x, y, math.hypot(a[0] - x, a[1] - y)


def _loop_outline(loop: ProfileLoop, steps: int = 24) -> list[list[float]]:
    """A loop's boundary as plain points (circles and arcs sampled) — only
    for deciding which loops sit inside which."""
    if loop.kind == "circle":
        cx, cy = loop.center
        return [[cx + loop.r * math.cos(2 * math.pi * i / 64), cy + loop.r * math.sin(2 * math.pi * i / 64)] for i in range(64)]
    if loop.kind == "polygon":
        return loop.points
    pts = [list(loop.start)]
    cur = loop.start
    for seg in loop.segments:
        if seg.get("kind") == "arc":
            c = _circle_through(cur, seg["mid"], seg["end"])
            if c:
                cx, cy, r = c
                ang = lambda p: math.atan2(p[1] - cy, p[0] - cx)
                a0, am, a1 = ang(cur), ang(seg["mid"]), ang(seg["end"])
                norm = lambda v: v % (2 * math.pi)
                sweep = norm(a1 - a0) if norm(am - a0) < norm(a1 - a0) else -norm(a0 - a1)
                pts += [[cx + r * math.cos(a0 + sweep * i / steps), cy + r * math.sin(a0 + sweep * i / steps)] for i in range(1, steps + 1)]
                cur = seg["end"]
                continue
        pts.append(list(seg["end"]))
        cur = seg["end"]
    return pts


def _point_in_polygon(p, poly) -> bool:
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        (xi, yi), (xj, yj) = poly[i], poly[j]
        if (yi > p[1]) != (yj > p[1]) and p[0] < (xj - xi) * (p[1] - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _loop_depths(loops: list[ProfileLoop]) -> list[int]:
    """How many other loops each loop sits inside. Even depth adds
    material (an outer boundary, or an island inside a hole), odd depth
    cuts it (a hole) — so side-by-side shapes both stay solid, instead of
    the smaller one being "subtracted" from empty space."""
    outlines = [_loop_outline(l) for l in loops]
    depths = []
    for i, own in enumerate(outlines):
        # A point just inside this loop's own boundary, away from shared edges.
        probe = own[0] if loops[i].kind != "circle" else [loops[i].center[0], loops[i].center[1]]
        if loops[i].kind != "circle" and len(own) >= 3:
            cx = sum(p[0] for p in own) / len(own); cy = sum(p[1] for p in own) / len(own)
            probe = [own[0][0] + (cx - own[0][0]) * 1e-3, own[0][1] + (cy - own[0][1]) * 1e-3]
        depths.append(sum(1 for j, other in enumerate(outlines)
                          if j != i and _loop_area(loops[j]) > _loop_area(loops[i]) and _point_in_polygon(probe, other)))
    return depths


def _add_path_loop(loop: ProfileLoop, loop_mode, feature_id: str):
    """Draws a line/arc path as real edges and turns it into a face."""
    if not loop.start or len(loop.segments) < 2:
        raise ValueError(f"path loop in feature {feature_id!r} needs a start point and at least 2 segments")
    with BuildLine() as outline:
        cur = tuple(loop.start)
        for seg in loop.segments:
            end = tuple(seg["end"])
            if seg.get("kind") == "arc":
                ThreePointArc(cur, tuple(seg["mid"]), end)
            else:
                Line(cur, end)
            cur = end
    make_face(outline.edges(), mode=loop_mode)


def _select_edges(shape, edge_filter: str) -> list:
    """Real (not interactive) edge selection for Fillet/Chamfer: classify
    every edge of the built shape by comparing its two endpoints. An edge
    whose endpoints differ almost only in Z is "vertical"; one whose
    endpoints differ almost only in X/Y is "horizontal". Curved edges
    (arcs, circles) rarely fit either bucket cleanly and are left out of
    the vertical/horizontal filters on purpose — 'all' still reaches them."""
    # A seam — where a cylinder's or cone's own surface closes on itself —
    # is an edge of just one face; it isn't a real corner, and filleting or
    # chamfering it fails ("Failed creating a chamfer"), so it's never picked.
    faces = list(shape.faces())
    edges = [e for e in shape.edges() if sum(1 for f in faces if any(e.is_same(fe) for fe in f.edges())) > 1]
    if edge_filter == "all":
        return edges
    if edge_filter == "curved":
        # Circles, arcs, ellipses, splines — every edge that isn't straight.
        return [e for e in edges if e.geom_type != GeomType.LINE]
    selected = []
    for e in edges:
        try:
            p0, p1 = e.start_point(), e.end_point()
        except Exception:
            continue
        dz = abs(p0.Z - p1.Z)
        dxy = math.hypot(p0.X - p1.X, p0.Y - p1.Y)
        if edge_filter == "vertical" and dz > 1e-6 and dxy < 1e-6:
            selected.append(e)
        elif edge_filter == "horizontal" and dxy > 1e-6 and dz < 1e-6:
            selected.append(e)
    return selected


def _top_face(shape):
    """Real (not interactive) face selection for Shell: the face whose
    normal points most nearly straight up (+Z) is treated as the
    "opening" a person would otherwise click by hand."""
    best, best_key = None, None
    for f in shape.faces():
        try:
            n = f.normal_at()
        except Exception:
            continue
        if n.Z < 0.9:
            continue
        key = (n.Z, f.area)
        if best_key is None or key > best_key:
            best, best_key = f, key
    return best


def _draw_loops(feature: PartFeature):
    """Draws one feature's loops into the active BuildSketch: outer
    boundaries add, loops nested inside them cut (see _loop_depths)."""
    depths = _loop_depths(feature.loops)
    ordered = [loop for _d, _a, loop in sorted(
        ((d, -_loop_area(l), l) for d, l in zip(depths, feature.loops)), key=lambda t: (t[0], t[1]))]
    ordered_depths = sorted(depths)
    for i, loop in enumerate(ordered):
        loop_mode = Mode.ADD if ordered_depths[i] % 2 == 0 else Mode.SUBTRACT
        if loop.kind == "circle":
            if loop.center is None or loop.r is None:
                raise ValueError(
                    f"circle loop in feature {feature.id!r} needs a center and radius"
                )
            with Locations(tuple(loop.center)):
                Circle(loop.r, mode=loop_mode)
        elif loop.kind == "polygon":
            if len(loop.points) < 3:
                raise ValueError(
                    f"polygon loop in feature {feature.id!r} needs at least 3 points"
                )
            Polygon(*[tuple(p) for p in loop.points], mode=loop_mode)
        elif loop.kind == "path":
            _add_path_loop(loop, loop_mode, feature.id)
        else:
            raise ValueError(f"unknown loop kind: {loop.kind!r}")


def _build_shape(req: BuildPartRequest):
    """Rebuilds the whole solid from scratch, every call, from an ordered
    Pad/Pocket/Revolve feature history plus any whole-body Modifiers
    (Fillet, Chamfer, Shell, Mirror Body, patterns, Scale) — the same
    "replay every feature in order" model CATIA/SolidWorks use
    internally, just done statelessly (no document kept in memory
    server-side): every call sends the full current state, gets the
    current result back. Raises ValueError on anything wrong with the
    request; returns the final build123d Shape on success. Shared by
    /build_part (STL export) and /inspect_part (metrics only)."""
    if not req.features:
        raise ValueError("need at least one feature")
    if req.features[0].op not in ("pad", "revolve", "rib", "loft"):
        raise ValueError(
            "the first feature must be a pad, revolve (shaft), rib or multi-sections solid — "
            "there's no material yet for a pocket to cut into"
        )

    with BuildPart() as part:
        for feature in req.features:
            if not feature.loops and feature.op not in ("loft", "removed_loft", "hole", "stiffener"):
                raise ValueError(f"feature {feature.id!r} has no loops")
            plane = _feature_plane(feature)
            if part_features.uses_extended_path(feature):
                tool, tool_mode = part_features.build_feature_solid(feature, plane, _draw_loops, part.part)
                add(tool, mode=tool_mode)
                continue
            with BuildSketch(plane):
                _draw_loops(feature)
            if feature.op == "revolve":
                # The in-plane X/Y axis through the sketch plane's own origin.
                axis_dir = plane.x_dir if feature.axis != "Y" else plane.z_dir.cross(plane.x_dir)
                revolve(
                    axis=Axis(plane.origin, axis_dir),
                    revolution_arc=feature.angle or 360.0,
                    mode=Mode.ADD,
                )
            else:
                extrude(
                    amount=feature.depth,
                    mode=Mode.ADD if feature.op == "pad" else Mode.SUBTRACT,
                )

        for mod in req.modifiers:
            if mod.op == "fillet":
                edges = (part_features.pick_edges(part.part, mod.edgePoints) if mod.edgePoints
                         else part_features.edges_of_faces(part.part, mod.facePoints) if mod.facePoints
                         else _select_edges(part.part, mod.edgeFilter))
                if not edges:
                    raise ValueError(f"no {mod.edgeFilter} edges found to fillet")
                fillet(edges, radius=mod.radius or 1.0)
            elif mod.op == "chamfer":
                edges = (part_features.pick_edges(part.part, mod.edgePoints) if mod.edgePoints
                         else part_features.edges_of_faces(part.part, mod.facePoints) if mod.facePoints
                         else _select_edges(part.part, mod.edgeFilter))
                if not edges:
                    raise ValueError(f"no {mod.edgeFilter} edges found to chamfer")
                if mod.chamferAngle is not None:
                    if not 0 < mod.chamferAngle < 90:
                        raise ValueError("chamfer angle must be between 0° and 90°")
                    chamfer(edges, length=mod.radius or 1.0, angle=mod.chamferAngle)
                elif mod.length2 is not None:
                    chamfer(edges, length=mod.radius or 1.0, length2=mod.length2)
                else:
                    chamfer(edges, length=mod.radius or 1.0)
            elif mod.op == "shell":
                if mod.facePoints or mod.faceSelector:
                    # Faces to Remove picked explicitly (CATIA's shell dialog).
                    openings = part_features.pick_faces(part.part, mod.faceSelector, mod.facePoints)
                else:
                    top_face = _top_face(part.part)
                    if top_face is None:
                        raise ValueError("could not find a top (+Z facing) face to open for the shell")
                    openings = [top_face]
                inside = mod.thickness if mod.thickness is not None else 2.0
                if not mod.thicknessOutside:
                    offset(openings=openings, amount=-inside, kind=Kind.INTERSECTION)
                else:
                    # Inside + outside thickness: one wall grown inward and
                    # one outward from the same original surface, fused.
                    base = part.part
                    walls = offset(base, amount=mod.thicknessOutside, openings=openings,
                                   kind=Kind.INTERSECTION, mode=Mode.PRIVATE)
                    if inside:
                        walls = walls + offset(base, amount=-inside, openings=openings,
                                               kind=Kind.INTERSECTION, mode=Mode.PRIVATE)
                    add(walls, mode=Mode.REPLACE)
            elif mod.op == "mirror_body":
                plane = {"XY": Plane.XY, "YZ": Plane.YZ, "XZ": Plane.XZ}.get(mod.plane, Plane.YZ)
                mirror(about=plane, mode=Mode.ADD)
            elif mod.op == "scale_body":
                if mod.scaleCenter or mod.scaleVector:
                    add(part_features.scale_about(part.part, mod.factor, mod.scaleCenter, mod.scaleVector), mode=Mode.REPLACE)
                else:
                    scale(by=mod.factor or 1.0)
            elif mod.op == "linear_pattern_body":
                vec = {"X": (1.0, 0.0, 0.0), "Y": (0.0, 1.0, 0.0), "Z": (0.0, 0.0, 1.0)}.get(mod.axis, (1.0, 0.0, 0.0))
                spacing = mod.spacing or 10.0
                base_copy = copy.deepcopy(part.part)
                for i in range(1, max(mod.count, 1)):
                    step = tuple(c * spacing * i for c in vec)
                    add(base_copy.translate(step), mode=Mode.ADD)
                if mod.axis2 and mod.count2 > 1:
                    # Rectangular Pattern's second direction: repeat the
                    # whole first-direction row.
                    vec2 = {"X": (1.0, 0.0, 0.0), "Y": (0.0, 1.0, 0.0), "Z": (0.0, 0.0, 1.0)}.get(mod.axis2, (0.0, 1.0, 0.0))
                    row = copy.deepcopy(part.part)
                    for j in range(1, mod.count2):
                        add(row.translate(tuple(c * (mod.spacing2 or spacing) * j for c in vec2)), mode=Mode.ADD)
            elif mod.op == "circular_pattern_body":
                count = max(mod.count, 1)
                step_angle = (mod.angle or 360.0) / count
                base_copy = copy.deepcopy(part.part)
                if mod.axisOrigin or mod.axisDirection:
                    rot_axis = Axis(tuple(mod.axisOrigin or (0, 0, 0)), tuple(mod.axisDirection or (0, 0, 1)))
                else:
                    rot_axis = Axis.Z
                for i in range(1, count):
                    add(base_copy.rotate(rot_axis, step_angle * i), mode=Mode.ADD)
            elif mod.op in part_features.EXT_MODIFIER_OPS:
                add(part_features.apply_ext_modifier(part.part, mod), mode=Mode.REPLACE)
            else:
                raise ValueError(f"unknown modifier op: {mod.op!r}")

    return part.part


class FaceAtRequest(BaseModel):
    """Sketch on Face: the part (same feature history /build_part takes)
    plus the point and normal of a face the user clicked in the 3D view."""
    features: list[PartFeature]
    modifiers: list[Modifier] = []
    point: list[float]
    normal: list[float]


@app.post("/face_at")
def face_at(req: FaceAtRequest):
    """Which real B-rep face was clicked, and whether a sketch can go on
    it. For a planar face: its outward normal, an H direction taken from
    its longest straight edge (the orientation a person expects, rather
    than a world axis), and every edge of the face sampled as 3D points —
    what the frontend projects into the new sketch as construction
    geometry (CATIA's projected 3D elements)."""
    try:
        shape = _build_shape(BuildPartRequest(features=req.features, modifiers=req.modifiers))
    except ValueError as e:
        return Response(content=str(e), status_code=400)
    except Exception as e:
        return Response(content=f"could not build part: {e}", status_code=400)

    hit = Vector(*req.point)
    n_hint = Vector(*req.normal)
    best, best_d = None, float("inf")
    for f in shape.faces():
        d = f.distance_to(hit)
        if d < best_d:
            best, best_d = f, d
    if best is None or best_d > 0.5:
        return {"planar": False, "reason": "no face at the picked point"}
    if best.geom_type != GeomType.PLANE:
        return {"planar": False, "reason": f"the picked face is {best.geom_type.name.lower()}, not planar"}

    normal = best.normal_at(hit)
    if normal.dot(n_hint) < 0:
        normal = -normal
    straight = [e for e in best.edges() if e.geom_type == GeomType.LINE]
    if straight:
        longest = max(straight, key=lambda e: e.length)
        x_dir = (longest.position_at(1) - longest.position_at(0)).normalized()
    else:
        # All-curved face (a disk): any direction in the plane.
        ref = Vector(1, 0, 0) if abs(normal.X) < 0.9 else Vector(0, 1, 0)
        x_dir = (ref - normal * ref.dot(normal)).normalized()
    edges = []
    for e in best.edges():
        count = 2 if e.geom_type == GeomType.LINE else 48
        edges.append([[p.X, p.Y, p.Z] for p in (e.position_at(i / (count - 1)) for i in range(count))])
    return {
        "planar": True,
        "point": [hit.X, hit.Y, hit.Z],
        "normal": [normal.X, normal.Y, normal.Z],
        "xDir": [x_dir.X, x_dir.Y, x_dir.Z],
        "edges": edges,
    }


@app.post("/build_part")
def build_part(req: BuildPartRequest):
    try:
        shape = _build_shape(req)
    except ValueError as e:
        return Response(content=str(e), status_code=400)
    except Exception as e:  # OCCT raises its own low-level errors on degenerate geometry
        return Response(content=f"could not build part: {e}", status_code=400)

    with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        export_stl(shape, tmp_path)
        with open(tmp_path, "rb") as f:
            data = f.read()
    finally:
        os.remove(tmp_path)

    return Response(content=data, media_type="model/stl")


@app.post("/inspect_part")
def inspect_part(req: BuildPartRequest):
    """Real Mass Properties / Model Validation / Interference Check
    numbers, computed by Open Cascade off the same feature+modifier
    history /build_part would build — no STL export, just the metrics:
    volume, surface area, bounding box, and face/edge/solid counts. A
    part built from more than one disjoint solid (solids > 1) is the
    real, geometric signal Interference Check and Model Validation use
    to flag a body that never actually fused together."""
    try:
        shape = _build_shape(req)
    except ValueError as e:
        return Response(content=str(e), status_code=400)
    except Exception as e:
        return Response(content=f"could not build part: {e}", status_code=400)

    solids = list(shape.solids())
    bbox = shape.bounding_box()
    return {
        "volumeMm3": shape.volume,
        "surfaceAreaMm2": sum(f.area for f in shape.faces()),
        "boundingBoxMm": {
            "x": bbox.max.X - bbox.min.X,
            "y": bbox.max.Y - bbox.min.Y,
            "z": bbox.max.Z - bbox.min.Z,
        },
        "solidCount": len(solids),
        "faceCount": len(list(shape.faces())),
        "edgeCount": len(list(shape.edges())),
        "isSingleWatertightSolid": len(solids) == 1,
    }


@app.post("/generate")
def generate(req: GenerateRequest):
    """Build the requested primitive as a real B-rep solid via Open Cascade,
    then hand it back as an STL mesh — the same contract the frontend's
    fetch() call already expects.

    Right now this only reaches three hardcoded primitives. The point isn't
    the cube — it's that "cube" now means "ask Open Cascade for a real
    solid" instead of "fake a shape." Swap the body of this function for
    a call built from an AI-parsed prompt later, and the frontend, the
    contract, and the CORS setup all stay exactly the same.
    """
    with BuildPart() as part:
        if req.shape == "cube":
            Box(req.size, req.size, req.size)
        elif req.shape == "sphere":
            Sphere(req.size / 2)
        elif req.shape == "cylinder":
            Cylinder(req.size / 2, req.size)
        else:
            return Response(content=f"unknown shape: {req.shape}", status_code=400)

    # build123d/OCCT export to a real file rather than in-memory bytes,
    # so we write to a temp file and read it straight back.
    with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        export_stl(part.part, tmp_path)
        with open(tmp_path, "rb") as f:
            data = f.read()
    finally:
        os.remove(tmp_path)

    return Response(content=data, media_type="model/stl")


@app.post("/solve_sketch")
def solve_sketch(req: SketchRequest):
    """The sketch_solver.py constraint solver, reachable over HTTP.

    Rebuilds a Sketch from whatever the frontend currently has (points,
    lines, circles, and the constraints applied so far — including
    brand-new, not-yet-constrained entities, whose raw click coordinates
    just become the solver's initial guess for them) and returns the
    same {dof, status, points, circles} shape sketch_solver.py's own
    __main__ block prints, as JSON.
    """
    try:
        sketch = Sketch.from_payload(
            [p.model_dump() for p in req.points],
            [l.model_dump() for l in req.lines],
            [c.model_dump() for c in req.circles],
            [c.model_dump() for c in req.constraints],
            [a.model_dump() for a in req.arcs],
            req.curves,
        )
    except KeyError as e:
        return Response(content=f"missing field {e} in constraint args", status_code=400)
    except ValueError as e:
        return Response(content=str(e), status_code=400)

    return sketch.solve()


@app.post("/sketch_from_image")
def sketch_from_image(req: ImageToSketchRequest):
    """Turns an uploaded image into a proposed sketch: image_to_sketch.py
    traces lines/circles with OpenCV, then — only if Ollama is running
    locally with a vision-capable model pulled — asks it to clean the
    trace up and read any dimension callouts drawn in the image. No paid
    API, no key: it's a free, local model running on this machine.

    Returns geometry only (no key, or no dimensions found) or geometry
    plus distance/radius/angle constraints (a dimension was read and
    matched to a specific line/circle). Either way this is a *proposal*:
    the frontend renders it as a dashed preview over the source image and
    the user accepts or discards it before it becomes real sketch
    geometry — nothing here touches a project's saved sketch directly.
    """
    if image_to_sketch is None:
        return Response(
            content=f"image_to_sketch is unavailable: {_IMAGE_TO_SKETCH_ERROR}",
            status_code=501,
        )
    try:
        return image_to_sketch(req.image)
    except (ValueError, RuntimeError) as e:
        return Response(content=str(e), status_code=400)


@app.get("/projects")
def list_projects():
    """Every saved project, newest first. Reads the real files in
    projects/ each time — there's no separate index to fall out of sync."""
    items = []
    for path in PROJECTS_DIR.glob("*.json"):
        items.append({
            "name": path.stem,
            "updated_at": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(),
        })
    items.sort(key=lambda item: item["updated_at"], reverse=True)
    return items


@app.get("/projects/{name}")
def load_project(name: str):
    try:
        path = _project_path(name)
    except ValueError as e:
        return Response(content=str(e), status_code=400)
    if not path.exists():
        return Response(content=f"no project named {name!r}", status_code=404)
    return json.loads(path.read_text())


@app.post("/projects/{name}")
def save_project(name: str, payload: ProjectPayload):
    try:
        path = _project_path(name)
    except ValueError as e:
        return Response(content=str(e), status_code=400)
    data = payload.model_dump()
    data["name"] = name
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(data, indent=2))
    return data


@app.delete("/projects/{name}")
def delete_project(name: str):
    try:
        path = _project_path(name)
    except ValueError as e:
        return Response(content=str(e), status_code=400)
    if path.exists():
        path.unlink()
    return {"deleted": name}


@app.get("/health")
def health():
    return {"status": "ok", "kernel": "Open Cascade (via build123d)"}


# CATIA V5 workbench endpoints (Part Design analysis, multi-body booleans,
# parameters, Sketcher tools, Drafting, Assembly Design, data exchange) —
# see catia_api.py. Registered last so they can reuse everything above.
import catia_api  # noqa: E402
catia_api.install(app, sys.modules[__name__])

# Image to 3D: picture -> mesh with TripoSR, entirely local (see image_to_3d.py, tsr/).
# The module imports without torch; the packages in requirements-triposr.txt are checked at request time.
try:
    import image_to_3d  # noqa: E402
    image_to_3d.install(app)
except Exception as _e:  # noqa: BLE001 - never stop the CAD server for an optional feature
    print(f"Image to 3D is unavailable: {_e}", file=sys.stderr)


from pathlib import Path as _HelpersPath
_HELPERS_DIR = _HelpersPath(__file__).parent / "helpers"
HELPER_SOURCE = chr(10).join(
    p.read_text() for p in sorted(_HELPERS_DIR.glob("*.py")) if p.name != "__init__.py"
)
class ExecuteCodeRequest(BaseModel):
    code: str
    timeout_s: int = 30


@app.post("/execute_code")
def execute_code(req: ExecuteCodeRequest):
    with tempfile.TemporaryDirectory() as td:
        script = os.path.join(td, "gen.py")
        out_stl = os.path.join(td, "out.stl")
        out_metrics = os.path.join(td, "metrics.json")

        harness = f"""
import json, math, sys
import build123d as bd
{HELPER_SOURCE}
{req.code}

if 'result' not in globals():
    sys.exit('script must define `result`')

r = result
if isinstance(r, (list, tuple)) and r:
    r = r[0]

bd.export_stl(r, r'{out_stl}')
solids = len(r.solids()) if hasattr(r, 'solids') else 1
bb = r.bounding_box()
vol = float(r.volume) if hasattr(r, 'volume') else 0.0
surf = float(r.area) if hasattr(r, 'area') else 0.0

json.dump({{
    'volumeMm3': vol,
    'surfaceAreaMm2': surf,
    'boundingBoxMm': {{'x': bb.size.X, 'y': bb.size.Y, 'z': bb.size.Z}},
    'solidCount': solids,
    'faceCount': len(r.faces()) if hasattr(r, 'faces') else 0,
    'edgeCount': len(r.edges()) if hasattr(r, 'edges') else 0,
    'isSingleWatertightSolid': bool(solids == 1),
}}, open(r'{out_metrics}', 'w'))
"""
        open(script, "w").write(harness)

        try:
            proc = subprocess.run(
                [sys.executable, script],
                cwd=td, capture_output=True, text=True, timeout=req.timeout_s,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(408, "generated code exceeded time limit")

        if proc.returncode != 0:
            raise HTTPException(400, {"error": "code failed", "stderr": proc.stderr[-2000:]})

        with open(out_stl, "rb") as f:
            stl_b64 = base64.b64encode(f.read()).decode()

        return {"stl": stl_b64, "metrics": json.load(open(out_metrics))}
