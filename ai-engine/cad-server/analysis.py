"""
analysis.py

CATIA V5's Part Design analysis / measure tools from the TU Graz basic
training (chapters 4.20-4.22 and "Helpful additional functions" in 6.2),
computed by Open Cascade on the real B-rep — no mesh approximations:

  Apply Material      a material library (density + the elastic constants a
                      later FEA step needs)
  Measure Inertia     volume, area, mass, centre of gravity, inertia tensor
                      about the CoG (and optionally about any point),
                      principal moments and axes
  Measure Between     minimum distance (and angle, where defined) between
                      two picked items
  Measure Item        what a picked face / edge / vertex is and its size
  Draft Analysis      per-face draft angle against a demoulding direction,
                      coloured the way the script describes (green >= 1 deg,
                      blue ~ 0 deg, red < 0 deg)
  Curvature Analysis  sampled min/max principal curvature per face
  Tap-Thread Analysis every thread/tap the part declares

Pure functions on build123d shapes; catia_api.py exposes them over HTTP.
"""

from __future__ import annotations

import math
from typing import Optional

import numpy as np
from build123d import GeomType, Vector

# Density in kg/m^3, Young's modulus in MPa, Poisson ratio, yield strength
# in MPa — the same fields CATIA's material catalog carries for its
# Metal / Plastic / Other families. Typical handbook values.
MATERIALS = {
    "Steel":            {"family": "Metal",   "density": 7860, "youngModulus": 200000, "poisson": 0.266, "yieldStrength": 250},
    "Stainless Steel":  {"family": "Metal",   "density": 7900, "youngModulus": 193000, "poisson": 0.29,  "yieldStrength": 215},
    "Cast Iron":        {"family": "Metal",   "density": 7200, "youngModulus": 120000, "poisson": 0.26,  "yieldStrength": 130},
    "Aluminium":        {"family": "Metal",   "density": 2710, "youngModulus": 70000,  "poisson": 0.346, "yieldStrength": 95},
    "Titanium":         {"family": "Metal",   "density": 4510, "youngModulus": 114000, "poisson": 0.34,  "yieldStrength": 825},
    "Copper":           {"family": "Metal",   "density": 8930, "youngModulus": 110000, "poisson": 0.34,  "yieldStrength": 70},
    "Brass":            {"family": "Metal",   "density": 8500, "youngModulus": 100000, "poisson": 0.34,  "yieldStrength": 200},
    "Bronze":           {"family": "Metal",   "density": 8800, "youngModulus": 110000, "poisson": 0.34,  "yieldStrength": 130},
    "ABS":              {"family": "Plastic", "density": 1050, "youngModulus": 2300,   "poisson": 0.35,  "yieldStrength": 40},
    "Nylon (PA6)":      {"family": "Plastic", "density": 1140, "youngModulus": 2700,   "poisson": 0.39,  "yieldStrength": 70},
    "Polycarbonate":    {"family": "Plastic", "density": 1200, "youngModulus": 2400,   "poisson": 0.37,  "yieldStrength": 62},
    "PEEK":             {"family": "Plastic", "density": 1320, "youngModulus": 3600,   "poisson": 0.40,  "yieldStrength": 100},
    "Oak":              {"family": "Other",   "density": 750,  "youngModulus": 11000,  "poisson": 0.35,  "yieldStrength": 40},
    "Glass":            {"family": "Other",   "density": 2500, "youngModulus": 70000,  "poisson": 0.22,  "yieldStrength": 33},
    "Concrete":         {"family": "Other",   "density": 2300, "youngModulus": 30000,  "poisson": 0.2,   "yieldStrength": 3},
}


def resolve_material(name: Optional[str] = None, density: Optional[float] = None) -> dict:
    """A material by name (case-insensitive), or a custom density."""
    if density is not None:
        if density <= 0:
            raise ValueError("density must be positive (kg/m^3)")
        return {"name": name or "Custom", "density": float(density)}
    if not name:
        return {"name": None, "density": None}
    for key, props in MATERIALS.items():
        if key.lower() == name.strip().lower():
            return {"name": key, **props}
    raise ValueError(f"unknown material {name!r} — see /materials for the library")


# ---------------------------------------------------------------------------
# Measure Inertia
# ---------------------------------------------------------------------------
def measure_inertia(shape, material: Optional[str] = None, density: Optional[float] = None,
                    about_point: Optional[list] = None) -> dict:
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps

    mat = resolve_material(material, density)
    props = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape.wrapped, props)
    volume = props.Mass()                       # mm^3 (unit density)
    if volume <= 0:
        raise ValueError("the part has no volume to measure")
    c = props.CentreOfMass()
    cog = np.array([c.X(), c.Y(), c.Z()])
    m = props.MatrixOfInertia()                 # about the CoG, unit density: mm^5
    tensor_v = np.array([[m.Value(i, j) for j in (1, 2, 3)] for i in (1, 2, 3)])

    sprops = GProp_GProps()
    BRepGProp.SurfaceProperties_s(shape.wrapped, sprops)
    area = sprops.Mass()

    out = {
        "volumeMm3": volume,
        "areaMm2": area,
        "centerOfGravityMm": cog.round(6).tolist(),
        "material": mat.get("name"),
    }
    if mat.get("density"):
        rho = mat["density"] * 1e-9            # kg/mm^3
        mass = rho * volume
        tensor = rho * tensor_v                 # kg*mm^2
        principal, axes = np.linalg.eigh(tensor)
        out.update({
            "densityKgM3": mat["density"],
            "massKg": mass,
            "inertiaAtCogKgMm2": tensor.round(6).tolist(),
            "principalMomentsKgMm2": principal.round(6).tolist(),
            "principalAxes": axes.T.round(6).tolist(),
        })
        if about_point is not None:
            # Parallel-axis (Steiner) shift to a user point / axis-system origin.
            d = np.array([float(v) for v in about_point]) - cog
            shifted = tensor + mass * (np.dot(d, d) * np.eye(3) - np.outer(d, d))
            out["inertiaAtPointKgMm2"] = shifted.round(6).tolist()
            out["point"] = [float(v) for v in about_point]
    else:
        out["note"] = "no material applied — mass and inertia need a material or density"
        out["inertiaAtCogPerDensityMm5"] = tensor_v.round(6).tolist()
    return out


# ---------------------------------------------------------------------------
# Measure Item / Measure Between
# ---------------------------------------------------------------------------
def _nearest(shape, point: Vector, kind: str):
    """The sub-shape of `kind` (face/edge/vertex/auto) nearest the point.
    'auto' prefers a vertex within 0.5 mm, then an edge within 0.5 mm,
    then a face — how a click snaps in CATIA."""
    kinds = [kind] if kind != "auto" else ["vertex", "edge", "face"]
    for k in kinds:
        items = {"face": shape.faces, "edge": shape.edges, "vertex": shape.vertices}[k]()
        best, best_d = None, float("inf")
        for it in items:
            d = it.distance_to(point)
            if d < best_d:
                best, best_d = it, d
        if best is not None and (kind != "auto" or best_d <= 0.5 or k == "face"):
            if best_d > 1.0:
                raise ValueError(f"nothing on the part within 1 mm of {list(point)}")
            return k, best
    raise ValueError("the part has no geometry to measure")


def describe_item(kind: str, item) -> dict:
    if kind == "vertex":
        v = Vector(item)
        return {"kind": "vertex", "point": [v.X, v.Y, v.Z]}
    if kind == "edge":
        info = {"kind": "edge", "type": item.geom_type.name.lower(), "lengthMm": item.length}
        if item.geom_type == GeomType.CIRCLE:
            info["radiusMm"] = item.radius
            info["diameterMm"] = 2 * item.radius
            c = item.arc_center
            info["center"] = [c.X, c.Y, c.Z]
        elif item.geom_type == GeomType.LINE:
            p0, p1 = item.start_point(), item.end_point()
            info["start"], info["end"] = [p0.X, p0.Y, p0.Z], [p1.X, p1.Y, p1.Z]
        return info
    info = {"kind": "face", "type": item.geom_type.name.lower(), "areaMm2": item.area}
    c = item.center()
    info["center"] = [c.X, c.Y, c.Z]
    if item.geom_type == GeomType.PLANE:
        n = item.normal_at()
        info["normal"] = [n.X, n.Y, n.Z]
    elif item.geom_type == GeomType.CYLINDER:
        from OCP.BRepAdaptor import BRepAdaptor_Surface
        cyl = BRepAdaptor_Surface(item.wrapped).Cylinder()
        ax = cyl.Axis()
        info["radiusMm"] = cyl.Radius()
        info["diameterMm"] = 2 * cyl.Radius()
        info["axisOrigin"] = [ax.Location().X(), ax.Location().Y(), ax.Location().Z()]
        info["axisDirection"] = [ax.Direction().X(), ax.Direction().Y(), ax.Direction().Z()]
    return info


def measure_item(shape, point, kind: str = "auto") -> dict:
    k, item = _nearest(shape, Vector(*point), kind)
    return describe_item(k, item)


def _direction_of(kind: str, item) -> Optional[Vector]:
    if kind == "face" and item.geom_type == GeomType.PLANE:
        return item.normal_at()
    if kind == "edge" and item.geom_type == GeomType.LINE:
        return (item.end_point() - item.start_point()).normalized()
    if kind == "face" and item.geom_type == GeomType.CYLINDER:
        d = describe_item(kind, item)["axisDirection"]
        return Vector(*d)
    return None


def measure_between(shape, a: dict, b: dict) -> dict:
    """Minimum distance between two picks; each pick is {"point": [...],
    "kind": auto|face|edge|vertex|point}. kind "point" measures from the
    raw coordinate itself (a point in space), not a snapped item."""
    items = []
    for pick in (a, b):
        pt = Vector(*pick["point"])
        kind = pick.get("kind", "auto")
        if kind == "point":
            items.append(("point", pt))
        else:
            items.append(_nearest(shape, pt, kind))
    (ka, ia), (kb, ib) = items
    geom_a = ia if ka != "point" else None
    if geom_a is not None:
        dist, pa, pb = geom_a.distance_to_with_closest_points(ib if kb != "point" else ib)
    elif kb != "point":
        dist, pb, pa = ib.distance_to_with_closest_points(ia)
    else:
        dist, pa, pb = (ia - ib).length, ia, ib
    out = {
        "distanceMm": dist,
        "pointA": [pa.X, pa.Y, pa.Z], "pointB": [pb.X, pb.Y, pb.Z],
        "deltaMm": [pb.X - pa.X, pb.Y - pa.Y, pb.Z - pa.Z],
        "itemA": describe_item(ka, ia) if ka != "point" else {"kind": "point"},
        "itemB": describe_item(kb, ib) if kb != "point" else {"kind": "point"},
    }
    da = _direction_of(ka, ia) if ka != "point" else None
    db = _direction_of(kb, ib) if kb != "point" else None
    if da is not None and db is not None:
        cosang = max(-1.0, min(1.0, da.normalized().dot(db.normalized())))
        out["angleDeg"] = math.degrees(math.acos(cosang))
    return out


# ---------------------------------------------------------------------------
# Face sampling for Draft / Curvature analysis
# ---------------------------------------------------------------------------
def _face_samples(face, n: int = 7):
    """(point, outward normal, SLProps) at an n x n grid of UV points that
    actually lie on the (trimmed) face."""
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepLProp import BRepLProp_SLProps
    from OCP.BRepTools import BRepTools
    from OCP.BRepTopAdaptor import BRepTopAdaptor_FClass2d
    from OCP.gp import gp_Pnt2d
    from OCP.TopAbs import TopAbs_IN, TopAbs_ON, TopAbs_REVERSED

    umin, umax, vmin, vmax = BRepTools.UVBounds_s(face.wrapped)
    surf = BRepAdaptor_Surface(face.wrapped)
    classifier = BRepTopAdaptor_FClass2d(face.wrapped, 1e-7)
    flip = face.wrapped.Orientation() == TopAbs_REVERSED
    samples = []
    for i in range(n):
        for j in range(n):
            u = umin + (umax - umin) * (i + 0.5) / n
            v = vmin + (vmax - vmin) * (j + 0.5) / n
            if classifier.Perform(gp_Pnt2d(u, v)) not in (TopAbs_IN, TopAbs_ON):
                continue
            props = BRepLProp_SLProps(surf, u, v, 2, 1e-7)
            if not props.IsNormalDefined():
                continue
            nd = props.Normal()
            normal = Vector(nd.X(), nd.Y(), nd.Z())
            if flip:
                normal = -normal
            p = props.Value()
            samples.append((Vector(p.X(), p.Y(), p.Z()), normal, props, flip))
    return samples


def draft_analysis(shape, direction=(0, 0, 1), threshold_deg: float = 1.0, mode: str = "one_sided") -> dict:
    """Per face: the draft angle (asin of normal . pull) at sampled points.
    one_sided (the script's Draft Analysis): >= threshold is green
    (demouldable), within +-threshold blue (no draft), below -threshold red
    (undercut). two_sided evaluates |angle|, i.e. a two-half mould split at
    the neutral element, where only near-vertical walls fail."""
    pull = Vector(*direction).normalized()
    faces_out = []
    totals = {"green": 0.0, "blue": 0.0, "red": 0.0}
    for idx, face in enumerate(shape.faces()):
        samples = _face_samples(face)
        if not samples:
            c = face.center()
            samples = [(c, face.normal_at(c), None, False)]
        angles = [math.degrees(math.asin(max(-1.0, min(1.0, nrm.dot(pull))))) for _p, nrm, _pr, _f in samples]
        if mode == "two_sided":
            angles = [abs(a) for a in angles]
        lo, hi = min(angles), max(angles)
        if lo >= threshold_deg:
            status = "green"
        elif lo < -threshold_deg:
            status = "red"
        else:
            status = "blue"
        totals[status] += face.area
        c = face.center()
        faces_out.append({"index": idx, "type": face.geom_type.name.lower(), "areaMm2": face.area,
                          "center": [c.X, c.Y, c.Z], "minDraftDeg": lo, "maxDraftDeg": hi, "status": status})
    return {
        "direction": [pull.X, pull.Y, pull.Z], "thresholdDeg": threshold_deg, "mode": mode,
        "demouldable": totals["red"] == 0 and totals["blue"] == 0,
        "areaByStatusMm2": totals, "faces": faces_out,
    }


def curvature_analysis(shape) -> dict:
    faces_out = []
    for idx, face in enumerate(shape.faces()):
        kmin, kmax = float("inf"), float("-inf")
        for _p, _n, props, flip in _face_samples(face):
            if props is None or not props.IsCurvatureDefined():
                continue
            a, b = props.MinCurvature(), props.MaxCurvature()
            if flip:
                a, b = -b, -a
            kmin, kmax = min(kmin, a), max(kmax, b)
        if kmin == float("inf"):
            kmin = kmax = 0.0
        entry = {"index": idx, "type": face.geom_type.name.lower(), "areaMm2": face.area,
                 "minCurvature": kmin, "maxCurvature": kmax}
        k = max(abs(kmin), abs(kmax))
        entry["minRadiusMm"] = (1.0 / k) if k > 1e-12 else None
        faces_out.append(entry)
    return {"faces": faces_out,
            "maxCurvature": max((max(abs(f["minCurvature"]), abs(f["maxCurvature"])) for f in faces_out), default=0.0)}
