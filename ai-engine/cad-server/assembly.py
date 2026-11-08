"""
assembly.py

CATIA V5 Assembly Design (TU Graz script, chapter 9), headless:

  Product structure  components (each a Part built by /build_part's own
                     feature history, or an imported STEP/BREP) with an
                     initial position — "Existing Component"; several
                     instances may share one part (Fast Multi Instantiation).
  Constraints        Coincidence (axis/axis, plane/plane, point/point,
                     point/axis, point/plane), Contact (plane/plane, opposed
                     normals), Offset (plane/plane, point/plane), Angle, Fix
                     Component, Fix Together. Geometry is referenced either
                     explicitly ({kind, origin, direction} in the component's
                     own coordinates) or by a picked point on the part —
                     picking a cylindrical face gives its axis, exactly how
                     the script's crank-drive example constrains the
                     crankshaft to the bearing.
  Update             a least-squares solve over each free component's 6 DOF
                     (translation + rotation vector), with the true remaining
                     degrees of freedom from the Jacobian rank — per
                     component (the script's "Component Degrees of Freedom")
                     and for the whole product.
  Move               Explode (radial exploded view).
  Space Analysis     Clash (clash / contact / clearance per pair, with
                     interference volume), Distance and Band Analysis,
                     Sectioning (section outlines through a plane).
  Numbering / BOM    generated item numbers and a parts list.
"""

from __future__ import annotations

import math
from typing import Callable, Optional

import numpy as np
from build123d import Compound, GeomType, Location, Plane, Vector
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

POS_TOL = 1e-4


def _pose_matrix(translation, rotvec) -> np.ndarray:
    M = np.eye(4)
    M[:3, :3] = Rotation.from_rotvec(rotvec).as_matrix()
    M[:3, 3] = translation
    return M


def _initial_pose(pos: Optional[dict]) -> np.ndarray:
    pos = pos or {}
    t = np.array(pos.get("translation", [0, 0, 0]), dtype=float)
    r = Rotation.from_euler("xyz", pos.get("rotationDeg", [0, 0, 0]), degrees=True)
    M = np.eye(4)
    M[:3, :3] = r.as_matrix()
    M[:3, 3] = t
    return M


def to_location(M: np.ndarray) -> Location:
    from OCP.gp import gp_Trsf
    trsf = gp_Trsf()
    trsf.SetValues(*[float(M[i, j]) for i in range(3) for j in range(4)])
    return Location(trsf)


# ---------------------------------------------------------------------------
# Geometric elements referenced by constraints
# ---------------------------------------------------------------------------
def element_from_pick(shape, point) -> dict:
    """A picked point on a component → the element CATIA would recognise:
    planar face → plane, cylinder/cone → its axis, sphere → its centre,
    a vertex → a point."""
    from OCP.BRepAdaptor import BRepAdaptor_Surface

    p = Vector(*point)
    best, best_d = None, float("inf")
    for f in shape.faces():
        d = f.distance_to(p)
        if d < best_d:
            best, best_d = f, d
    if best is None or best_d > 0.5:
        raise ValueError(f"no face of the component within 0.5 mm of pick {list(point)}")
    surf = BRepAdaptor_Surface(best.wrapped)
    if best.geom_type == GeomType.PLANE:
        n = best.normal_at(p)
        return {"kind": "plane", "origin": [p.X, p.Y, p.Z], "direction": [n.X, n.Y, n.Z]}
    if best.geom_type in (GeomType.CYLINDER, GeomType.CONE):
        ax = surf.Cylinder().Axis() if best.geom_type == GeomType.CYLINDER else surf.Cone().Axis()
        o, d = ax.Location(), ax.Direction()
        return {"kind": "axis", "origin": [o.X(), o.Y(), o.Z()], "direction": [d.X(), d.Y(), d.Z()]}
    if best.geom_type == GeomType.SPHERE:
        c = surf.Sphere().Location()
        return {"kind": "point", "origin": [c.X(), c.Y(), c.Z()]}
    raise ValueError(f"can't constrain a {best.geom_type.name.lower()} face — pick a plane, cylinder, cone or sphere")


def _local_element(ref: dict, shapes: dict) -> dict:
    if ref.get("pick") is not None:
        return element_from_pick(shapes[ref["component"]], ref["pick"])
    kind = ref.get("kind")
    if kind not in ("plane", "axis", "point"):
        raise ValueError("a constraint element needs kind plane/axis/point (with origin/direction) or a pick point")
    el = {"kind": kind, "origin": [float(v) for v in ref.get("origin", [0, 0, 0])]}
    if kind != "point":
        d = np.array(ref.get("direction", [0, 0, 1]), dtype=float)
        if np.linalg.norm(d) < 1e-12:
            raise ValueError("element direction must be non-zero")
        el["direction"] = (d / np.linalg.norm(d)).tolist()
    return el


def _world(el: dict, M: np.ndarray):
    o = M[:3, :3] @ np.array(el["origin"]) + M[:3, 3]
    d = M[:3, :3] @ np.array(el["direction"]) if "direction" in el else None
    return o, d


# ---------------------------------------------------------------------------
# Solver
# ---------------------------------------------------------------------------
class AssemblySolver:
    def __init__(self, components: list[dict], constraints: list[dict], shapes: dict):
        self.ids = [c["id"] for c in components]
        self.base = {c["id"]: _initial_pose(c.get("position")) for c in components}
        self.fixed = {c["id"] for c in components if c.get("fixed")}
        self.shapes = shapes
        self.constraints = []
        for con in constraints:
            ctype = con.get("type")
            if ctype == "fix":
                self.fixed.add(con["component"])
                continue
            self.constraints.append(con)
        for con in self.constraints:
            for key in ("a", "b"):
                if key in con and con[key].get("component") not in self.base:
                    raise ValueError(f"constraint {con.get('id')!r} references unknown component {con[key].get('component')!r}")
        self.free = [cid for cid in self.ids if cid not in self.fixed]
        self.col = {cid: 6 * i for i, cid in enumerate(self.free)}
        self.elements = []
        for con in self.constraints:
            if con["type"] == "fix_together":
                self.elements.append(None)
                continue
            ea = _local_element(con["a"], shapes)
            eb = _local_element(con["b"], shapes)
            self.elements.append((ea, eb))
        # Orientation choice for plane/axis pairs, taken from the initial
        # placement unless the constraint says otherwise (CATIA's
        # "Same / Opposite" orientation option).
        self.signs = []
        x0 = np.zeros(6 * len(self.free))
        for con, els in zip(self.constraints, self.elements):
            if els is None or "direction" not in els[0] or "direction" not in els[1]:
                self.signs.append(1.0)
                continue
            if con["type"] == "contact":
                self.signs.append(-1.0)
                continue
            orient = con.get("orientation", "auto")
            if orient in ("same", "opposite"):
                self.signs.append(1.0 if orient == "same" else -1.0)
                continue
            _, da = _world(els[0], self.pose(con["a"]["component"], x0))
            _, db = _world(els[1], self.pose(con["b"]["component"], x0))
            self.signs.append(1.0 if np.dot(da, db) >= 0 else -1.0)
        self.together = {}
        for i, con in enumerate(self.constraints):
            if con["type"] == "fix_together":
                A, B = con["a"]["component"], con["b"]["component"]
                self.together[i] = np.linalg.inv(self.base[A]) @ self.base[B]

    def pose(self, cid: str, x: np.ndarray) -> np.ndarray:
        if cid not in self.col:
            return self.base[cid]
        j = self.col[cid]
        delta = _pose_matrix(x[j:j + 3], x[j + 3:j + 6])
        # Rotate about the component's own origin, then translate.
        M = self.base[cid].copy()
        M[:3, :3] = delta[:3, :3] @ M[:3, :3]
        M[:3, 3] = M[:3, 3] + delta[:3, 3]
        return M

    def residuals(self, x: np.ndarray) -> np.ndarray:
        out = []
        for i, (con, els) in enumerate(zip(self.constraints, self.elements)):
            ctype = con["type"]
            if ctype == "fix_together":
                A, B = con["a"]["component"], con["b"]["component"]
                rel = np.linalg.inv(self.pose(A, x)) @ self.pose(B, x)
                diff = rel - self.together[i]
                out.extend(diff[:3, :4].ravel())
                continue
            ea, eb = els
            oa, da = _world(ea, self.pose(con["a"]["component"], x))
            ob, db = _world(eb, self.pose(con["b"]["component"], x))
            sign = self.signs[i]
            ka, kb = ea["kind"], eb["kind"]
            value = float(con.get("value", 0.0))
            if ctype in ("coincidence", "contact", "offset"):
                if ka == kb == "point":
                    out.extend(ob - oa)
                elif ka == "point" or kb == "point":
                    # point on an axis / plane (or at an offset from a plane)
                    p, (o, d, k) = (oa, (ob, db, kb)) if ka == "point" else (ob, (oa, da, ka))
                    if k == "axis":
                        out.extend(np.cross(p - o, d))
                    else:
                        out.append(np.dot(p - o, d) - value)
                elif ka == kb == "axis":
                    out.extend(np.cross(da, db))
                    out.extend(np.cross(ob - oa, da))
                elif ka == kb == "plane":
                    # Parallel (cross = 0), with the chosen orientation
                    # (same / opposite) so the solve can't flip a face over.
                    out.extend(np.cross(da, db))
                    out.append(np.dot(da, sign * db) - 1.0)
                    out.append(np.dot(ob - oa, da) - (value if ctype == "offset" else 0.0))
                elif {ka, kb} == {"axis", "plane"}:
                    # axis lying in the plane
                    (ao, ad), (po, pd) = ((oa, da), (ob, db)) if ka == "axis" else ((ob, db), (oa, da))
                    out.append(np.dot(ad, pd))
                    out.append(np.dot(ao - po, pd) - value)
                else:
                    raise ValueError(f"unsupported {ctype} between {ka} and {kb}")
            elif ctype == "angle":
                if da is None or db is None:
                    raise ValueError("angle constraint needs two planes/axes")
                out.append(np.dot(da, db) - math.cos(math.radians(value)))
            else:
                raise ValueError(f"unknown assembly constraint type {ctype!r}")
        return np.array(out, dtype=float)

    def solve(self) -> dict:
        n = 6 * len(self.free)
        x = np.zeros(n)
        if n and self.constraints:
            res = least_squares(self.residuals, x, xtol=1e-12, ftol=1e-12, gtol=1e-12)
            x = res.x
        r = self.residuals(x) if self.constraints else np.zeros(0)
        max_res = float(np.max(np.abs(r))) if len(r) else 0.0
        J = self._jacobian(x) if len(r) and n else np.zeros((0, n))

        def rank(A):
            if A.size == 0:
                return 0
            sv = np.linalg.svd(A, compute_uv=False)
            return int(np.sum(sv > max(A.shape) * (sv[0] if len(sv) else 0) * 1e-9 + 1e-9))

        total_dof = n - rank(J)
        per = {}
        for cid in self.ids:
            if cid in self.fixed:
                per[cid] = 0
            else:
                j = self.col[cid]
                per[cid] = 6 - rank(J[:, j:j + 6])
        if max_res > POS_TOL:
            status = "Over-constrained"
        elif total_dof == 0:
            status = "Fully constrained"
        else:
            status = "Under-constrained"
        poses = {cid: self.pose(cid, x) for cid in self.ids}
        return {"status": status, "dof": total_dof, "componentDof": per, "maxResidual": max_res,
                "poses": poses, "fixed": sorted(self.fixed)}

    def _jacobian(self, x, h=1e-7):
        f0 = self.residuals(x)
        J = np.zeros((len(f0), len(x)))
        for j in range(len(x)):
            xp = x.copy()
            xp[j] += h
            J[:, j] = (self.residuals(xp) - f0) / h
        return J


def pose_to_json(M: np.ndarray) -> dict:
    import warnings
    with warnings.catch_warnings():
        # A 90-degree pose is a gimbal lock for Euler angles; the matrix
        # stays exact, the Euler read-out just picks one equivalent set.
        warnings.simplefilter("ignore", UserWarning)
        euler = Rotation.from_matrix(M[:3, :3]).as_euler("xyz", degrees=True)
    return {"matrix": M.round(9).tolist(), "translation": M[:3, 3].round(9).tolist(),
            "rotationDeg": euler.round(6).tolist()}


# ---------------------------------------------------------------------------
# Positioned shapes, analysis, explode, BOM
# ---------------------------------------------------------------------------
def placed_shapes(shapes: dict, poses: dict) -> dict:
    return {cid: shapes[cid].moved(to_location(M)) for cid, M in poses.items()}


def explode(placed: dict, factor: float) -> dict:
    """Radial exploded view: each component pushed away from the product
    centre along the line through its own centre."""
    centers = {cid: s.center() for cid, s in placed.items()}
    mid = sum(centers.values(), Vector(0, 0, 0)) * (1.0 / max(1, len(centers)))
    out = {}
    for cid, s in placed.items():
        d = centers[cid] - mid
        if d.length < 1e-9:
            out[cid] = s
        else:
            out[cid] = s.moved(Location(d * factor))
    return out


def clash_analysis(placed: dict, clearance: float = 0.0, contact_tol: float = 1e-3) -> list[dict]:
    ids = list(placed)
    results = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = placed[ids[i]], placed[ids[j]]
            if not a.bounding_box().overlaps(b.bounding_box(), tolerance=max(clearance, contact_tol) + 1e-6):
                continue
            inter = a & b
            vol = inter.volume if inter is not None and list(inter.solids()) else 0.0
            dist = 0.0 if vol > 0 else a.distance_to(b)
            if vol > 1e-6:
                kind = "clash"
            elif dist <= contact_tol:
                kind = "contact"
            elif dist < clearance:
                kind = "clearance"
            else:
                continue
            entry = {"a": ids[i], "b": ids[j], "type": kind, "distanceMm": dist}
            if kind == "clash":
                entry["interferenceVolumeMm3"] = vol
            results.append(entry)
    return results


def distance_analysis(placed: dict, pairs: Optional[list] = None) -> list[dict]:
    ids = list(placed)
    pairs = pairs or [[ids[i], ids[j]] for i in range(len(ids)) for j in range(i + 1, len(ids))]
    out = []
    for a, b in pairs:
        d, pa, pb = placed[a].distance_to_with_closest_points(placed[b])
        out.append({"a": a, "b": b, "minDistanceMm": d, "pointA": [pa.X, pa.Y, pa.Z], "pointB": [pb.X, pb.Y, pb.Z]})
    return out


def sectioning(placed: dict, plane: Plane) -> dict:
    """Section outlines of every component through the plane: the
    component's cross-section faces, as 3D polylines plus their areas."""
    from build123d import Face
    big = Face.make_rect(1e5, 1e5, plane)
    out = {}
    for cid, s in placed.items():
        cut = s & big
        faces = list(cut.faces()) if cut is not None else []
        if not faces:
            continue
        outlines = []
        for f in faces:
            for e in f.edges():
                n = 2 if e.geom_type == GeomType.LINE else 32
                pts = [e.position_at(k / n) for k in range(n + 1)]
                outlines.append([[p.X, p.Y, p.Z] for p in pts])
        out[cid] = {"areaMm2": sum(f.area for f in faces), "outlines": outlines}
    return out


def bill_of_materials(components: list[dict], masses: dict) -> list[dict]:
    """Generate Numbering + parts list: instances of the same part
    reference share an item number."""
    groups: dict[str, dict] = {}
    for c in components:
        ref = c.get("partNumber") or c.get("partRef") or c.get("name") or c["id"]
        g = groups.setdefault(ref, {"partNumber": ref, "quantity": 0, "instances": [], "material": c.get("material")})
        g["quantity"] += 1
        g["instances"].append(c["id"])
        if masses.get(c["id"]) is not None:
            g["unitMassKg"] = masses[c["id"]]
    bom = []
    for i, g in enumerate(groups.values(), start=1):
        g["item"] = i
        bom.append(g)
    return bom


def combined(placed: dict) -> Compound:
    return Compound(list(placed.values()))
