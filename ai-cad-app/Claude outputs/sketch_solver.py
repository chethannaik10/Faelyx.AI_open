"""
sketch_solver.py

There's no frontend code to wire into yet, so this is the piece worth
building first regardless of what UI eventually calls it: a real 2D
sketch constraint solver — the thing that makes "DOF: 4", "Under-
Constrained", and dragging a dimension actually mean something, instead
of being numbers a UI displays without computing.

This is deliberately NOT Open Cascade. OCCT builds and operates on 3D
B-rep solids; it has no opinion about 2D sketch constraints. The library
FreeCAD actually uses for this layer is a separate one called PlaneGCS.
What's here is a smaller, from-scratch version of the same idea, so you
can see exactly how it works rather than trusting it as a black box:

  1. Every sketch is a system of unknowns: each point has an (x, y),
     each circle also has a radius.
  2. Every constraint (horizontal, coincident, a 40mm dimension...) is
     one or more equations that should equal zero when satisfied.
  3. "Solving the sketch" means finding values for every unknown that
     drive every constraint equation to (approximately) zero at once.
     That's a nonlinear least-squares problem — the exact kind
     scipy.optimize.least_squares is built to solve — so we don't need
     to hand-write Newton's method ourselves.
  4. Degrees of freedom = (2 per point + 1 per circle radius) minus the
     number of independent constraint equations. DOF 0 means fully
     constrained; DOF > 0 is exactly the "Under-Constrained" badge in
     the screenshot.

Run this file directly to see it solve a real sketch: a 100x80mm
rectangle with two 10mm mounting holes, built the same way a user would
place it — rough clicks first, exact dimensions after.
"""

from dataclasses import dataclass, field
import numpy as np
from scipy.optimize import least_squares


# ---------------------------------------------------------------------
# 1. THE SKETCH MODEL — unknowns live in one flat vector, x.
#    Points and circles just remember *which slice* of x is theirs.
# ---------------------------------------------------------------------

class Sketch:
    def __init__(self):
        self._points = {}      # id -> index into x (x,y pair starts there)
        self._circles = {}     # id -> (center_point_id, index of radius in x)
        self._lines = {}       # id -> (p1_id, p2_id)
        self._init_values = []
        self.constraints = []  # list of (name, residual_fn, arg_ids)

    def add_point(self, id, x, y):
        idx = len(self._init_values)
        self._points[id] = idx
        self._init_values += [x, y]
        return id

    def add_line(self, id, p1, p2):
        self._lines[id] = (p1, p2)
        return id

    def add_circle(self, id, center, r):
        idx = len(self._init_values)
        self._circles[id] = (center, idx)
        self._init_values.append(r)
        return id

    # --- constraints: each appends (residual_count, fn(x) -> residuals) ---
    def _pt(self, x, pid):
        i = self._points[pid]
        return x[i], x[i + 1]

    def constrain_fixed(self, pid, x0, y0):
        def res(x):
            px, py = self._pt(x, pid)
            return [px - x0, py - y0]
        self.constraints.append(("fixed", 2, res))

    def constrain_coincident(self, p1, p2):
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            return [a[0] - b[0], a[1] - b[1]]
        self.constraints.append(("coincident", 2, res))

    def constrain_horizontal(self, line_id):
        p1, p2 = self._lines[line_id]
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            return [a[1] - b[1]]
        self.constraints.append(("horizontal", 1, res))

    def constrain_vertical(self, line_id):
        p1, p2 = self._lines[line_id]
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            return [a[0] - b[0]]
        self.constraints.append(("vertical", 1, res))

    def constrain_distance(self, p1, p2, value):
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            d = np.hypot(b[0] - a[0], b[1] - a[1])
            return [d - value]
        self.constraints.append(("distance", 1, res))

    def constrain_radius(self, circle_id, value):
        _, ridx = self._circles[circle_id]
        def res(x):
            return [x[ridx] - value]
        self.constraints.append(("radius", 1, res))

    def constrain_parallel(self, line1, line2):
        p1, p2 = self._lines[line1]; p3, p4 = self._lines[line2]
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            c = self._pt(x, p3); d = self._pt(x, p4)
            d1 = (b[0] - a[0], b[1] - a[1])
            d2 = (d[0] - c[0], d[1] - c[1])
            return [d1[0] * d2[1] - d1[1] * d2[0]]  # cross product == 0
        self.constraints.append(("parallel", 1, res))

    # --- solving ---
    def dof(self):
        n_unknowns = len(self._init_values)
        n_eqs = sum(c[1] for c in self.constraints)
        return n_unknowns - n_eqs

    def solve(self):
        x0 = np.array(self._init_values, dtype=float)

        def residuals(x):
            out = []
            for _name, _n, fn in self.constraints:
                out.extend(fn(x))
            return out

        result = least_squares(residuals, x0)
        status = "Fully constrained" if abs(self.dof()) == 0 else \
                 "Under-constrained" if self.dof() > 0 else \
                 "Over-constrained"
        return {
            "success": result.success,
            "dof": self.dof(),
            "status": status,
            "max_residual": float(np.max(np.abs(result.fun))) if len(result.fun) else 0.0,
            "points": {pid: (round(result.x[i], 3), round(result.x[i + 1], 3))
                       for pid, i in self._points.items()},
            "circles": {cid: {"center": center, "r": round(result.x[ridx], 3)}
                        for cid, (center, ridx) in self._circles.items()},
        }


if __name__ == "__main__":
    # Build the screenshot's sketch: a rectangle with two mounting holes,
    # starting from rough coordinates (as if roughly clicked), then let
    # dimensions + constraints pull it to exact.
    s = Sketch()

    # four rough corners of a not-quite-rectangle
    s.add_point("p1", 0, 0)
    s.add_point("p2", 95, 3)
    s.add_point("p3", 98, 77)
    s.add_point("p4", 2, 82)

    s.add_line("bottom", "p1", "p2")
    s.add_line("right", "p2", "p3")
    s.add_line("top", "p3", "p4")
    s.add_line("left", "p4", "p1")

    # pin the origin corner so the sketch doesn't float in space
    s.constrain_fixed("p1", 0, 0)

    # make it an actual rectangle
    s.constrain_horizontal("bottom")
    s.constrain_horizontal("top")
    s.constrain_vertical("left")
    s.constrain_vertical("right")

    # exact size, driven by dimensions (matching the "100.00 mm" callout)
    s.constrain_distance("p1", "p2", 100)
    s.constrain_distance("p1", "p4", 80)

    # two mounting holes, roughly placed, then dimensioned from the origin
    s.add_point("h1_ctr", 25, 20)
    s.add_circle("hole1", "h1_ctr", 4)
    s.constrain_distance("p1", "h1_ctr", 32)
    s.constrain_radius("hole1", 5)

    s.add_point("h2_ctr", 75, 20)
    s.add_circle("hole2", "h2_ctr", 4)
    s.constrain_distance("p2", "h2_ctr", 32)
    s.constrain_radius("hole2", 5)

    result = s.solve()
    print(f"status: {result['status']}  (dof={result['dof']}, "
          f"solved={result['success']}, max_residual={result['max_residual']:.2e})")
    print("points:")
    for pid, (x, y) in result["points"].items():
        print(f"  {pid}: ({x}, {y})")
    print("circles:")
    for cid, c in result["circles"].items():
        print(f"  {cid}: center={c['center']} r={c['r']}")
