"""
sketch_tools.py

The CATIA V5 Sketcher tools (TU Graz script, chapter 5.2) the frontend
sketcher doesn't cover yet, as pure functions on the same JSON sketch the
frontend already sends /solve_sketch (points / lines / circles / arcs /
constraints, ids referencing points):

  2D Analysis Tools   Sketch Analysis — open contours, branch points,
                      isolated points, zero-length / degenerate elements,
                      overlapping and crossing lines, closed-profile count —
                      plus the Sketch Solving Status from sketch_solver.
  Operation           Transformation: Mirror, Symmetry, Translate (with
                      instances), Rotate (with instances), Scale, Offset;
                      Relimitations: Break, Close, Complement.

Transformations return *new* entities with fresh ids (or moved coordinates
for the non-duplicating ones) for the frontend to merge — the same
"proposal, not mutation" contract /sketch_from_image uses.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Optional

from sketch_solver import Sketch

TOL = 1e-6


def _pts(sk: dict) -> dict[str, tuple[float, float]]:
    return {p["id"]: (float(p["x"]), float(p["y"])) for p in sk.get("points", [])}


def _is_construction(el: dict) -> bool:
    return bool(el.get("construction"))


# ---------------------------------------------------------------------------
# Sketch Analysis
# ---------------------------------------------------------------------------
def _cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _segments_relation(a1, a2, b1, b2):
    """'cross' (proper interior intersection), 'overlap' (collinear with a
    shared stretch of positive length), or None."""
    d1, d2 = _cross(b1, b2, a1), _cross(b1, b2, a2)
    d3, d4 = _cross(a1, a2, b1), _cross(a1, a2, b2)
    scale = max(1.0, math.dist(a1, a2), math.dist(b1, b2))
    eps = TOL * scale * scale
    if abs(d1) < eps and abs(d2) < eps:
        # Collinear: project onto a's direction and compare intervals.
        ax, ay = a2[0] - a1[0], a2[1] - a1[1]
        la = ax * ax + ay * ay
        if la < eps:
            return None
        t = sorted([((b1[0] - a1[0]) * ax + (b1[1] - a1[1]) * ay) / la,
                    ((b2[0] - a1[0]) * ax + (b2[1] - a1[1]) * ay) / la])
        shared = min(1.0, t[1]) - max(0.0, t[0])
        return "overlap" if shared * math.sqrt(la) > TOL * scale else None
    if ((d1 > eps and d2 < -eps) or (d1 < -eps and d2 > eps)) and ((d3 > eps and d4 < -eps) or (d3 < -eps and d4 > eps)):
        return "cross"
    return None


def analyze_sketch(sk: dict) -> dict:
    pts = _pts(sk)
    issues: list[dict] = []

    # Coincident points count as one node — through a shared id, a
    # coincident constraint, or simply the same coordinates.
    parent = {pid: pid for pid in pts}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        if a in parent and b in parent:
            parent[find(a)] = find(b)

    for c in sk.get("constraints", []):
        if c.get("type") == "coincident":
            union(c["args"].get("p1"), c["args"].get("p2"))
    ids = list(pts)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            if math.dist(pts[ids[i]], pts[ids[j]]) < TOL:
                union(ids[i], ids[j])

    degree: dict[str, int] = defaultdict(int)
    adjacency: dict[str, set[str]] = defaultdict(set)
    used: set[str] = set()
    lines = [l for l in sk.get("lines", []) if not _is_construction(l)]
    arcs = [a for a in sk.get("arcs", []) if not _is_construction(a)]
    circles = [c for c in sk.get("circles", []) if not _is_construction(c)]
    for el in sk.get("lines", []) + sk.get("arcs", []) + sk.get("circles", []):
        for key in ("p1", "p2", "center"):
            if el.get(key):
                used.add(el[key])
    for cv in sk.get("curves", []):
        for v in cv.values():
            if isinstance(v, str) and v in pts:
                used.add(v)
            elif isinstance(v, list):
                used.update(x for x in v if isinstance(x, str) and x in pts)

    for el in lines + arcs:
        for key in ("p1", "p2"):
            if el[key] not in pts:
                issues.append({"type": "missing_point", "elements": [el["id"]], "message": f"{el['id']} references unknown point {el[key]!r}"})
        if el["p1"] not in pts or el["p2"] not in pts:
            continue
        a, b = find(el["p1"]), find(el["p2"])
        if a == b and el in lines:
            issues.append({"type": "zero_length", "elements": [el["id"]], "message": f"line {el['id']} has zero length"})
            continue
        degree[a] += 1
        degree[b] += 1
        adjacency[a].add(b)
        adjacency[b].add(a)

    for c in circles:
        if float(c.get("r", 0)) <= TOL:
            issues.append({"type": "degenerate", "elements": [c["id"]], "message": f"circle {c['id']} has no radius"})

    for node, deg in degree.items():
        if deg == 1:
            issues.append({"type": "open_end", "elements": [node], "point": list(pts[node]),
                           "message": f"open contour end at ({pts[node][0]:.3f}, {pts[node][1]:.3f})"})
        elif deg > 2:
            issues.append({"type": "branch", "elements": [node], "point": list(pts[node]),
                           "message": f"{deg} elements meet at ({pts[node][0]:.3f}, {pts[node][1]:.3f}) — the profile is ambiguous"})

    for pid in pts:
        if pid not in used and not any(pid in (c.get("args") or {}).values() for c in sk.get("constraints", [])):
            issues.append({"type": "isolated_point", "elements": [pid], "point": list(pts[pid]),
                           "message": f"isolated point {pid}"})

    valid_lines = [l for l in lines if l["p1"] in pts and l["p2"] in pts and find(l["p1"]) != find(l["p2"])]
    for i in range(len(valid_lines)):
        for j in range(i + 1, len(valid_lines)):
            la, lb = valid_lines[i], valid_lines[j]
            rel = _segments_relation(pts[la["p1"]], pts[la["p2"]], pts[lb["p1"]], pts[lb["p2"]])
            if rel == "overlap":
                issues.append({"type": "overlap", "elements": [la["id"], lb["id"]], "message": f"lines {la['id']} and {lb['id']} overlap"})
            elif rel == "cross":
                issues.append({"type": "intersection", "elements": [la["id"], lb["id"]], "message": f"lines {la['id']} and {lb['id']} cross each other"})

    # Closed profiles: connected components where every node has degree 2.
    seen: set[str] = set()
    closed = open_ = 0
    for node in list(adjacency):
        if node in seen:
            continue
        comp, stack = [], [node]
        while stack:
            n = stack.pop()
            if n in seen:
                continue
            seen.add(n)
            comp.append(n)
            stack.extend(adjacency[n] - seen)
        if all(degree[n] == 2 for n in comp):
            closed += 1
        else:
            open_ += 1
    closed += len(circles)

    solver = None
    try:
        s = Sketch.from_payload(sk.get("points", []), sk.get("lines", []), sk.get("circles", []),
                                sk.get("constraints", []), sk.get("arcs", []), sk.get("curves", []))
        result = s.solve()
        solver = {"status": result["status"], "dof": result["dof"], "redundant": result["redundant"],
                  "maxResidual": result["max_residual"]}
    except (KeyError, ValueError) as e:
        solver = {"status": "error", "message": str(e)}

    blocking = {"open_end", "branch", "overlap", "intersection", "zero_length", "degenerate", "missing_point"}
    return {
        "ok": not any(i["type"] in blocking for i in issues),
        "closedProfiles": closed,
        "openProfiles": open_,
        "constructionElements": sum(1 for el in sk.get("lines", []) + sk.get("arcs", []) + sk.get("circles", []) if _is_construction(el)),
        "issues": issues,
        "solving": solver,
    }


# ---------------------------------------------------------------------------
# Transformations / relimitations
# ---------------------------------------------------------------------------
def _element_lists(sk: dict):
    return {"lines": sk.get("lines", []), "circles": sk.get("circles", []), "arcs": sk.get("arcs", [])}


def _selected(sk: dict, ids: list[str]):
    chosen = {"lines": [], "circles": [], "arcs": []}
    lists = _element_lists(sk)
    for kind, items in lists.items():
        for el in items:
            if el["id"] in ids:
                chosen[kind].append(el)
    if not any(chosen.values()):
        raise ValueError("select at least one line, circle or arc to transform")
    return chosen


def _point_ids(chosen) -> list[str]:
    out = []
    for kind, items in chosen.items():
        for el in items:
            for key in ("p1", "p2", "center"):
                if el.get(key) and el[key] not in out:
                    out.append(el[key])
    return out


def _mirror_fn(a, b):
    ax, ay = a
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    if l2 < TOL:
        raise ValueError("mirror line needs two distinct points")

    def f(p):
        t = ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2
        fx, fy = ax + t * dx, ay + t * dy
        return (2 * fx - p[0], 2 * fy - p[1])
    return f


def _line_points(sk: dict, params: dict):
    pts = _pts(sk)
    if params.get("line"):
        line = next((l for l in sk.get("lines", []) if l["id"] == params["line"]), None)
        if line is None:
            raise ValueError(f"no line {params['line']!r} to mirror about")
        return pts[line["p1"]], pts[line["p2"]]
    if params.get("axis") in ("H", "V"):
        return ((0.0, 0.0), (1.0, 0.0)) if params["axis"] == "H" else ((0.0, 0.0), (0.0, 1.0))
    if params.get("from") and params.get("to"):
        return tuple(params["from"]), tuple(params["to"])
    raise ValueError("mirror/symmetry needs a line id, axis 'H'/'V', or from/to points")


def _emit(chosen, pts, fn, suffix: str, reverse_arcs: bool, radius_scale: float = 1.0):
    """New points/elements for one transformed instance."""
    new_pts, mapping = [], {}
    for pid in _point_ids(chosen):
        x, y = fn(pts[pid])
        nid = f"{pid}{suffix}"
        mapping[pid] = nid
        new_pts.append({"id": nid, "x": round(x, 9), "y": round(y, 9)})
    lines = [{**l, "id": f"{l['id']}{suffix}", "p1": mapping[l["p1"]], "p2": mapping[l["p2"]]} for l in chosen["lines"]]
    circles = [{**c, "id": f"{c['id']}{suffix}", "center": mapping[c["center"]], "r": float(c["r"]) * radius_scale} for c in chosen["circles"]]
    arcs = []
    for a in chosen["arcs"]:
        p1, p2 = mapping[a["p1"]], mapping[a["p2"]]
        if reverse_arcs:
            p1, p2 = p2, p1  # a reflection flips an arc's sweep direction
        arcs.append({**a, "id": f"{a['id']}{suffix}", "center": mapping[a["center"]], "p1": p1, "p2": p2})
    return {"points": new_pts, "lines": lines, "circles": circles, "arcs": arcs}


def _merge(results):
    out = {"points": [], "lines": [], "circles": [], "arcs": []}
    for r in results:
        for k in out:
            out[k].extend(r.get(k, []))
    return out


def sketch_operation(sk: dict, op: str, ids: list[str], params: Optional[dict] = None) -> dict:
    params = params or {}
    pts = _pts(sk)

    if op in ("mirror", "symmetry"):
        chosen = _selected(sk, ids)
        fn = _mirror_fn(*_line_points(sk, params))
        if op == "mirror":
            return {"mode": "add", **_emit(chosen, pts, fn, "_m", reverse_arcs=True)}
        # Symmetry: moves the originals (no copy kept).
        moved = {pid: fn(pts[pid]) for pid in _point_ids(chosen)}
        swapped = [a["id"] for a in chosen["arcs"]]
        return {"mode": "move", "points": [{"id": k, "x": v[0], "y": v[1]} for k, v in moved.items()],
                "reversedArcs": swapped}

    if op == "translate":
        chosen = _selected(sk, ids)
        dx, dy = (float(v) for v in params.get("vector", (0, 0)))
        n = int(params.get("instances", 1))
        if not params.get("duplicate", True):
            return {"mode": "move", "points": [{"id": pid, "x": pts[pid][0] + dx, "y": pts[pid][1] + dy} for pid in _point_ids(chosen)]}
        return {"mode": "add", **_merge(_emit(chosen, pts, lambda p, k=k: (p[0] + dx * k, p[1] + dy * k), f"_t{k}", False)
                                       for k in range(1, n + 1))}

    if op == "rotate":
        chosen = _selected(sk, ids)
        cx, cy = (float(v) for v in params.get("center", (0, 0)))
        ang = float(params.get("angle", 90.0))
        n = int(params.get("instances", 1))

        def rot(p, k):
            a = math.radians(ang * k)
            x, y = p[0] - cx, p[1] - cy
            return (cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a))
        if not params.get("duplicate", True):
            return {"mode": "move", "points": [{"id": pid, "x": rot(pts[pid], 1)[0], "y": rot(pts[pid], 1)[1]} for pid in _point_ids(chosen)]}
        return {"mode": "add", **_merge(_emit(chosen, pts, lambda p, k=k: rot(p, k), f"_r{k}", False) for k in range(1, n + 1))}

    if op == "scale":
        chosen = _selected(sk, ids)
        cx, cy = (float(v) for v in params.get("center", (0, 0)))
        s = float(params.get("factor", 1.0))
        if s <= 0:
            raise ValueError("scale factor must be positive")
        fn = lambda p: (cx + (p[0] - cx) * s, cy + (p[1] - cy) * s)
        if params.get("duplicate", False):
            return {"mode": "add", **_emit(chosen, pts, fn, "_s", False, radius_scale=s)}
        return {"mode": "move", "points": [{"id": pid, "x": fn(pts[pid])[0], "y": fn(pts[pid])[1]} for pid in _point_ids(chosen)],
                "radii": {c["id"]: float(c["r"]) * s for c in chosen["circles"]}}

    if op == "offset":
        return _offset(sk, ids, float(params.get("distance", 1.0)), int(params.get("instances", 1)))

    if op == "break":
        line = next((l for l in sk.get("lines", []) if l["id"] in ids), None)
        if line is None:
            raise ValueError("break needs a line id")
        at = params.get("at")
        a, b = pts[line["p1"]], pts[line["p2"]]
        if at is None:
            at = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / (dx * dx + dy * dy)
        if not TOL < t < 1 - TOL:
            raise ValueError("break point must lie inside the line")
        mid = {"id": f"{line['id']}_brk", "x": a[0] + t * dx, "y": a[1] + t * dy}
        return {"mode": "replace", "remove": [line["id"]], "points": [mid],
                "lines": [{**line, "id": f"{line['id']}_a", "p2": mid["id"]}, {**line, "id": f"{line['id']}_b", "p1": mid["id"]}]}

    if op in ("close", "complement"):
        arc = next((a for a in sk.get("arcs", []) if a["id"] in ids), None)
        if arc is None:
            raise ValueError(f"{op} needs an arc id")
        if op == "complement":
            return {"mode": "replace", "remove": [arc["id"]], "arcs": [{**arc, "p1": arc["p2"], "p2": arc["p1"]}]}
        r = math.dist(pts[arc["center"]], pts[arc["p1"]])
        return {"mode": "replace", "remove": [arc["id"]], "circles": [{"id": arc["id"], "center": arc["center"], "r": r}]}

    raise ValueError(f"unknown sketch operation {op!r}")


def _offset(sk: dict, ids: list[str], distance: float, instances: int) -> dict:
    """Offset a chain of lines/arcs (open or closed) or circles, via Open
    Cascade's 2D wire offset, returned as new lines/arcs/circles."""
    from build123d import Edge, GeomType, Kind, Side, Vector, Wire

    pts = _pts(sk)
    chosen = _selected(sk, ids)
    if distance == 0:
        raise ValueError("offset distance must be non-zero")
    results = []
    for c in chosen["circles"]:
        for k in range(1, instances + 1):
            r = float(c["r"]) + distance * k
            if r <= 0:
                raise ValueError(f"offset collapses circle {c['id']}")
            results.append({"points": [], "lines": [], "arcs": [],
                            "circles": [{"id": f"{c['id']}_o{k}", "center": c["center"], "r": r}]})
    edges = []
    for l in chosen["lines"]:
        edges.append(Edge.make_line(Vector(*pts[l["p1"]]), Vector(*pts[l["p2"]])))
    for a in chosen["arcs"]:
        c, p1, p2 = pts[a["center"]], pts[a["p1"]], pts[a["p2"]]
        r = math.dist(c, p1)
        a1 = math.atan2(p1[1] - c[1], p1[0] - c[0])
        a2 = math.atan2(p2[1] - c[1], p2[0] - c[0])
        sweep = (a2 - a1) % (2 * math.pi) or 2 * math.pi
        mid = (c[0] + r * math.cos(a1 + sweep / 2), c[1] + r * math.sin(a1 + sweep / 2))
        edges.append(Edge.make_three_point_arc(Vector(*p1), Vector(*mid), Vector(*p2)))
    if edges:
        wires = Wire.combine(edges)
        if len(wires) != 1:
            raise ValueError("offset needs the selected lines/arcs to form one connected chain")
        wire = wires[0]
        n = 0
        for k in range(1, instances + 1):
            if wire.is_closed:
                off = wire.offset_2d(distance * k, kind=Kind.ARC)
            else:
                off = wire.offset_2d(abs(distance) * k, kind=Kind.ARC, side=Side.LEFT if distance > 0 else Side.RIGHT, closed=False)
            new = {"points": [], "lines": [], "circles": [], "arcs": []}
            shared: dict[tuple, str] = {}   # consecutive segments share their end points
            for e in off.edges():
                p0, p1 = e.start_point(), e.end_point()
                ids_ = []
                for p in (p0, p1):
                    key = (round(p.X, 6), round(p.Y, 6))
                    if key not in shared:
                        n += 1
                        shared[key] = f"off{k}_{n}"
                        new["points"].append({"id": shared[key], "x": round(p.X, 9), "y": round(p.Y, 9)})
                    ids_.append(shared[key])
                if e.geom_type == GeomType.LINE:
                    new["lines"].append({"id": f"off{k}_l{n}", "p1": ids_[0], "p2": ids_[1]})
                elif e.geom_type == GeomType.CIRCLE:
                    n += 1
                    cc = e.arc_center
                    cid = f"off{k}_{n}"
                    new["points"].append({"id": cid, "x": round(cc.X, 9), "y": round(cc.Y, 9)})
                    # Keep the arc counter-clockwise from p1 to p2 in sketch terms.
                    mid = e.position_at(0.5)
                    ccw = _cross((cc.X, cc.Y), (p0.X, p0.Y), (mid.X, mid.Y)) > 0
                    a_p1, a_p2 = (ids_[0], ids_[1]) if ccw else (ids_[1], ids_[0])
                    new["arcs"].append({"id": f"off{k}_a{n}", "center": cid, "p1": a_p1, "p2": a_p2})
                else:
                    raise ValueError(f"offset produced a {e.geom_type.name.lower()} edge the sketch can't represent")
            results.append(new)
    return {"mode": "add", **_merge(results)}
