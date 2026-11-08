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

from sketch_curves import CurveModel


# ---------------------------------------------------------------------
# 1. THE SKETCH MODEL — unknowns live in one flat vector, x.
#    Points and circles just remember *which slice* of x is theirs.
# ---------------------------------------------------------------------

class Sketch:
    def __init__(self):
        self._points = {}      # id -> index into x (x,y pair starts there)
        self._circles = {}     # id -> (center_point_id, index of radius in x)
        self._lines = {}       # id -> (p1_id, p2_id)
        self._arcs = {}        # id -> (center_id, start_id, end_id)
        self._free = {}        # id -> CurveModel (ellipse, spline, conic…)
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

    def add_arc(self, id, center, p1, p2):
        """An arc is three real points — its center and both endpoints —
        plus one built-in equation keeping both endpoints on the same
        radius. Sharing an endpoint id with a line is what makes a profile
        of lines and arcs one connected chain the solver keeps joined."""
        self._arcs[id] = (center, p1, p2)
        def res(x):
            c = self._pt(x, center); a = self._pt(x, p1); b = self._pt(x, p2)
            return [np.hypot(a[0] - c[0], a[1] - c[1]) - np.hypot(b[0] - c[0], b[1] - c[1])]
        self.constraints.append(("arc_radius", 1, res))
        return id

    def _add_unknown(self, value):
        idx = len(self._init_values)
        self._init_values.append(float(value))
        return idx

    def add_curve(self, spec):
        """A free-form curve from its payload dict: an ellipse's radii and
        rotation become unknowns (its center is a point); every other kind
        is fully defined by its points plus fixed shape numbers."""
        spec = dict(spec)
        if spec["kind"] == "ellipse":
            spec["rx"] = self._add_unknown(spec["rx"])
            spec["ry"] = self._add_unknown(spec["ry"])
            spec["rot"] = self._add_unknown(spec["rot"])
        self._free[spec["id"]] = CurveModel(spec["kind"], self._pt, spec)
        return spec["id"]

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

    def constrain_perpendicular(self, line1, line2):
        p1, p2 = self._lines[line1]; p3, p4 = self._lines[line2]
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            c = self._pt(x, p3); d = self._pt(x, p4)
            d1 = (b[0] - a[0], b[1] - a[1])
            d2 = (d[0] - c[0], d[1] - c[1])
            return [d1[0] * d2[0] + d1[1] * d2[1]]  # dot product == 0
        self.constraints.append(("perpendicular", 1, res))

    def constrain_equal_length(self, line1, line2):
        p1, p2 = self._lines[line1]; p3, p4 = self._lines[line2]
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            c = self._pt(x, p3); d = self._pt(x, p4)
            len1 = np.hypot(b[0] - a[0], b[1] - a[1])
            len2 = np.hypot(d[0] - c[0], d[1] - c[1])
            return [len1 - len2]
        self.constraints.append(("equal_length", 1, res))

    def constrain_equal_radius(self, circle1, circle2):
        _, r1 = self._circles[circle1]; _, r2 = self._circles[circle2]
        def res(x):
            return [x[r1] - x[r2]]
        self.constraints.append(("equal_radius", 1, res))

    def constrain_tangent_circles(self, circle1, circle2):
        """External tangency: distance between centers == r1 + r2."""
        c1, r1 = self._circles[circle1]; c2, r2 = self._circles[circle2]
        def res(x):
            a = self._pt(x, c1); b = self._pt(x, c2)
            d = np.hypot(b[0] - a[0], b[1] - a[1])
            return [d - (x[r1] + x[r2])]
        self.constraints.append(("tangent_circles", 1, res))

    def constrain_tangent_line_circle(self, line_id, circle_id):
        """Perpendicular distance from the circle's center to the (infinite)
        line equals its radius."""
        p1, p2 = self._lines[line_id]
        center, ridx = self._circles[circle_id]
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2); c = self._pt(x, center)
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = np.hypot(dx, dy)
            length = length if length > 1e-9 else 1e-9
            dist = abs(dx * (a[1] - c[1]) - (a[0] - c[0]) * dy) / length
            return [dist - x[ridx]]
        self.constraints.append(("tangent_line_circle", 1, res))

    # --- circle-or-arc helpers, so tangency works on either -------------
    def _curve(self, curve_id):
        """(center_id, radius_fn(x), endpoint_ids) for a circle or an arc."""
        if curve_id in self._circles:
            center, ridx = self._circles[curve_id]
            return center, (lambda x: x[ridx]), ()
        if curve_id in self._arcs:
            center, p1, _p2 = self._arcs[curve_id]
            def radius(x):
                c = self._pt(x, center); a = self._pt(x, p1)
                return np.hypot(a[0] - c[0], a[1] - c[1])
            return center, radius, self._arcs[curve_id][1:]
        raise KeyError(curve_id)

    def _init_pt(self, pid):
        i = self._points[pid]
        return self._init_values[i], self._init_values[i + 1]

    def _init_radius(self, curve_id):
        x0 = np.array(self._init_values, dtype=float)
        return self._curve(curve_id)[1](x0)

    def _x0(self):
        return np.array(self._init_values, dtype=float)

    def _round(self, curve_id):
        return curve_id in self._circles or curve_id in self._arcs

    def _tangent_line_free(self, line_id, curve_id):
        """Line tangent to a free-form curve: one touch-point parameter t
        (a new unknown) with the point on the line and the curve's tangent
        there parallel to it."""
        p1, p2 = self._lines[line_id]
        m = self._free[curve_id]
        x0 = self._x0()
        a0, b0 = self._pt(x0, p1), self._pt(x0, p2)
        d0 = (b0[0] - a0[0], b0[1] - a0[1]); l0 = max(np.hypot(*d0), 1e-9)
        t_idx = self._add_unknown(m.nearest_param(x0, lambda P: abs(d0[0] * (P[1] - a0[1]) - d0[1] * (P[0] - a0[0])) / l0))
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            P = m.pos(x, x[t_idx]); D = m.deriv(x, x[t_idx])
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = max(np.hypot(dx, dy), 1e-9)
            return [(dx * (P[1] - a[1]) - dy * (P[0] - a[0])) / L,
                    (dx * D[1] - dy * D[0]) / (L * max(np.hypot(*D), 1e-9))]
        self.constraints.append(("tangent_line_curve", 2, res))

    def _tangent_round_free(self, round_id, curve_id):
        """Circle/arc tangent to a free-form curve: the touch point is on
        the circle and the radius there is perpendicular to the curve."""
        center, radius, _ends = self._curve(round_id)
        m = self._free[curve_id]
        x0 = self._x0()
        c0 = self._pt(x0, center); r0 = radius(x0)
        t_idx = self._add_unknown(m.nearest_param(x0, lambda P: abs(np.hypot(P[0] - c0[0], P[1] - c0[1]) - r0)))
        def res(x):
            c = self._pt(x, center)
            P = m.pos(x, x[t_idx]); D = m.deriv(x, x[t_idx])
            vx, vy = P[0] - c[0], P[1] - c[1]
            dist = np.hypot(vx, vy)
            return [dist - radius(x), (vx * D[0] + vy * D[1]) / (max(dist, 1e-9) * max(np.hypot(*D), 1e-9))]
        self.constraints.append(("tangent_curves", 2, res))

    def _tangent_free_free(self, c1, c2):
        """Two free-form curves touching: one parameter on each, the two
        points coincide and the tangents are parallel there."""
        m1, m2 = self._free[c1], self._free[c2]
        x0 = self._x0()
        lo, hi = m2.param_range(x0)
        samples2 = [m2.pos(x0, lo + (hi - lo) * i / 200) for i in range(201)]
        near2 = lambda P: min(np.hypot(P[0] - q[0], P[1] - q[1]) for q in samples2)
        t1 = m1.nearest_param(x0, near2, samples=200)
        P1 = m1.pos(x0, t1)
        t2 = m2.nearest_param(x0, lambda Q: np.hypot(Q[0] - P1[0], Q[1] - P1[1]))
        i1, i2 = self._add_unknown(t1), self._add_unknown(t2)
        def res(x):
            A = m1.pos(x, x[i1]); B = m2.pos(x, x[i2])
            DA = m1.deriv(x, x[i1]); DB = m2.deriv(x, x[i2])
            cross = (DA[0] * DB[1] - DA[1] * DB[0]) / (max(np.hypot(*DA), 1e-9) * max(np.hypot(*DB), 1e-9))
            return [A[0] - B[0], A[1] - B[1], cross]
        self.constraints.append(("tangent_curves", 3, res))

    def constrain_tangent_line_curve(self, line_id, curve_id):
        if curve_id in self._free:
            return self._tangent_line_free(line_id, curve_id)
        """Line tangent to a circle or arc. When the line and an arc share
        an endpoint (a Profile's line → tangent arc joint) tangency is the
        smooth-joint condition: the line is perpendicular to the radius at
        that shared point. Otherwise the center sits exactly one radius
        from the (infinite) line."""
        p1, p2 = self._lines[line_id]
        center, radius, ends = self._curve(curve_id)
        shared = next((e for e in ends if e in (p1, p2)), None)
        if shared is not None:
            def res(x):
                a = self._pt(x, p1); b = self._pt(x, p2)
                c = self._pt(x, center); s = self._pt(x, shared)
                return [(b[0] - a[0]) * (s[0] - c[0]) + (b[1] - a[1]) * (s[1] - c[1])]
        else:
            def res(x):
                a = self._pt(x, p1); b = self._pt(x, p2); c = self._pt(x, center)
                dx, dy = b[0] - a[0], b[1] - a[1]
                length = max(np.hypot(dx, dy), 1e-9)
                dist = abs(dx * (a[1] - c[1]) - (a[0] - c[0]) * dy) / length
                return [dist - radius(x)]
        self.constraints.append(("tangent_line_curve", 1, res))

    def constrain_tangent_curves(self, curve1, curve2):
        if curve1 in self._free or curve2 in self._free:
            if curve1 in self._free and curve2 in self._free:
                return self._tangent_free_free(curve1, curve2)
            round_id, free_id = (curve2, curve1) if curve1 in self._free else (curve1, curve2)
            return self._tangent_round_free(round_id, free_id)
        """Two circles/arcs tangent to each other. A shared endpoint means
        a smooth joint (both centers and the joint on one line); otherwise
        the centers are r1 + r2 apart (outside each other) or |r1 - r2|
        apart (one inside the other), whichever the sketch starts closer to."""
        c1, r1, ends1 = self._curve(curve1)
        c2, r2, ends2 = self._curve(curve2)
        shared = next((e for e in ends1 if e in ends2), None)
        if shared is not None:
            def res(x):
                a = self._pt(x, c1); b = self._pt(x, c2); s = self._pt(x, shared)
                return [(a[0] - s[0]) * (b[1] - s[1]) - (a[1] - s[1]) * (b[0] - s[0])]
        else:
            ax, ay = self._init_pt(c1); bx, by = self._init_pt(c2)
            d0 = np.hypot(bx - ax, by - ay)
            ir1, ir2 = self._init_radius(curve1), self._init_radius(curve2)
            internal = abs(d0 - abs(ir1 - ir2)) < abs(d0 - (ir1 + ir2))
            def res(x):
                a = self._pt(x, c1); b = self._pt(x, c2)
                d = np.hypot(b[0] - a[0], b[1] - a[1])
                return [d - (abs(r1(x) - r2(x)) if internal else r1(x) + r2(x))]
        self.constraints.append(("tangent_curves", 1, res))

    def constrain_point_line_distance(self, point_id, line_id, value):
        """Perpendicular distance from a point to the (infinite) line ==
        value. Backs every CATIA-style "clearance" measurement that isn't a
        plain point-to-point distance: a bare point measured against a line,
        or a circle/arc's center measured against a line (the UI subtracts/
        adds the radius on its side to turn this into the rim-to-line
        clearance a user actually sees and types).

        The sign of the perpendicular distance is fixed once, from the
        sketch's current (pre-solve) positions, rather than recomputed every
        residual call — otherwise the point crossing the line mid-solve
        would flip which root the solver is descending toward and it could
        oscillate instead of converging. This mirrors how a real dimension
        keeps a point on whichever side of the line it already started on
        instead of allowing it to snap through."""
        p1, p2 = self._lines[line_id]
        ia, ib, ic = self._points[p1], self._points[p2], self._points[point_id]
        ax0, ay0 = self._init_values[ia], self._init_values[ia + 1]
        bx0, by0 = self._init_values[ib], self._init_values[ib + 1]
        cx0, cy0 = self._init_values[ic], self._init_values[ic + 1]
        dx0, dy0 = bx0 - ax0, by0 - ay0
        len0 = np.hypot(dx0, dy0) or 1e-9
        cross0 = dx0 * (cy0 - ay0) - dy0 * (cx0 - ax0)
        sign = 1.0 if cross0 / len0 >= 0 else -1.0

        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2); c = self._pt(x, point_id)
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = np.hypot(dx, dy)
            length = length if length > 1e-9 else 1e-9
            cross = dx * (c[1] - a[1]) - dy * (c[0] - a[0])
            return [cross / length - sign * value]
        self.constraints.append(("point_line_distance", 1, res))

    def constrain_symmetric(self, p1, p2, line_id):
        """p1 and p2 are mirror images of each other across line_id: their
        midpoint lies on the line, and the p1->p2 segment is perpendicular
        to it."""
        la, lb = self._lines[line_id]
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            la_pt = self._pt(x, la); lb_pt = self._pt(x, lb)
            mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            dx, dy = lb_pt[0] - la_pt[0], lb_pt[1] - la_pt[1]
            cross = (mx - la_pt[0]) * dy - (my - la_pt[1]) * dx
            dot = (b[0] - a[0]) * dx + (b[1] - a[1]) * dy
            return [cross, dot]
        self.constraints.append(("symmetric", 2, res))

    def constrain_midpoint(self, center_id, point_ids):
        """Keeps center_id at the centroid (plain coordinate average) of
        every point in point_ids — 2 equations for center_id's 2 unknowns,
        so it's fully driven by the others and adds no net DOF of its own.
        This is what lets a Rectangle/Hexagon/Regular Polygon's auto-added
        center point stay the shape's true center through any later edit
        (a dragged corner, a resized dimension) instead of freezing at
        wherever it happened to compute to when the shape was drawn."""
        n = len(point_ids)
        def res(x):
            cx, cy = self._pt(x, center_id)
            pts = [self._pt(x, pid) for pid in point_ids]
            mx = sum(p[0] for p in pts) / n
            my = sum(p[1] for p in pts) / n
            return [cx - mx, cy - my]
        self.constraints.append(("midpoint", 2, res))

    def constrain_angle(self, line1, line2, degrees):
        p1, p2 = self._lines[line1]; p3, p4 = self._lines[line2]
        theta = np.radians(degrees)
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            c = self._pt(x, p3); d = self._pt(x, p4)
            d1 = (b[0] - a[0], b[1] - a[1])
            d2 = (d[0] - c[0], d[1] - c[1])
            cross = d1[0] * d2[1] - d1[1] * d2[0]
            dot = d1[0] * d2[0] + d1[1] * d2[1]
            # cross/dot == tan(theta), rearranged to avoid the atan2
            # discontinuity: cross*cos(theta) - dot*sin(theta) == 0
            return [cross * np.cos(theta) - dot * np.sin(theta)]
        self.constraints.append(("angle", 1, res))

    def constrain_line_angle(self, line_id, degrees):
        """A single line's own heading relative to the +X axis — lets one
        line be dimensioned by angle without needing a second line to
        measure against (constrain_angle above is always line-to-line).
        Used together with constrain_fixed on whichever endpoint the UI
        calls the "anchor": pinning that point removes the 2 degrees of
        freedom that would otherwise let *both* endpoints drift to satisfy
        this equation, so only the free endpoint swings to the new angle."""
        p1, p2 = self._lines[line_id]
        theta = np.radians(degrees)
        def res(x):
            a = self._pt(x, p1); b = self._pt(x, p2)
            dx, dy = b[0] - a[0], b[1] - a[1]
            # Same avoid-atan2-discontinuity trick as constrain_angle:
            # dx*sin(theta) - dy*cos(theta) == 0 exactly when the line's
            # direction matches theta (mod 180deg), regardless of length.
            return [dx * np.sin(theta) - dy * np.cos(theta)]
        self.constraints.append(("line_angle", 1, res))

    # --- JSON-friendly dispatch, for a server endpoint to build a Sketch
    # from a request body without knowing every constrain_* method name ---
    def add_constraint(self, ctype, args):
        args = args or {}
        if ctype == "fixed":
            self.constrain_fixed(args["point"], args["x"], args["y"])
        elif ctype == "coincident":
            self.constrain_coincident(args["p1"], args["p2"])
        elif ctype == "horizontal":
            self.constrain_horizontal(args["line"])
        elif ctype == "vertical":
            self.constrain_vertical(args["line"])
        elif ctype == "distance":
            self.constrain_distance(args["p1"], args["p2"], args["value"])
        elif ctype == "radius":
            self.constrain_radius(args["circle"], args["value"])
        elif ctype == "parallel":
            self.constrain_parallel(args["line1"], args["line2"])
        elif ctype == "perpendicular":
            self.constrain_perpendicular(args["line1"], args["line2"])
        elif ctype == "equal_length":
            self.constrain_equal_length(args["line1"], args["line2"])
        elif ctype == "equal_radius":
            self.constrain_equal_radius(args["circle1"], args["circle2"])
        elif ctype == "tangent_circles":
            # Routed through the generic version so a circle sitting inside
            # the other (internal tangency) solves too, not only external.
            self.constrain_tangent_curves(args["circle1"], args["circle2"])
        elif ctype == "tangent_line_circle":
            self.constrain_tangent_line_circle(args["line"], args["circle"])
        elif ctype == "tangent_line_curve":
            self.constrain_tangent_line_curve(args["line"], args["curve"])
        elif ctype == "tangent_curves":
            self.constrain_tangent_curves(args["curve1"], args["curve2"])
        elif ctype == "point_line_distance":
            self.constrain_point_line_distance(args["point"], args["line"], args["value"])
        elif ctype == "symmetric":
            self.constrain_symmetric(args["p1"], args["p2"], args["line"])
        elif ctype == "midpoint":
            self.constrain_midpoint(args["center"], args["points"])
        elif ctype == "angle":
            self.constrain_angle(args["line1"], args["line2"], args["value"])
        elif ctype == "line_angle":
            self.constrain_line_angle(args["line"], args["value"])
        else:
            raise ValueError(f"unknown constraint type: {ctype}")

    @classmethod
    def from_payload(cls, points, lines, circles, constraints, arcs=(), curves=()):
        """Build a Sketch from plain JSON-shaped data: points/lines/circles/
        arcs as lists of dicts, constraints as a list of {type, args} dicts.
        A circle's `center` (and an arc's center/p1/p2) must already exist
        in `points`."""
        sketch = cls()
        for p in points:
            sketch.add_point(p["id"], p["x"], p["y"])
        for l in lines:
            sketch.add_line(l["id"], l["p1"], l["p2"])
        for c in circles:
            sketch.add_circle(c["id"], c["center"], c["r"])
        for a in arcs:
            sketch.add_arc(a["id"], a["center"], a["p1"], a["p2"])
        for cv in curves:
            sketch.add_curve(cv)
        for con in constraints:
            sketch.add_constraint(con["type"], con.get("args", {}))
        return sketch

    # --- solving ---
    def dof(self):
        """Equation-count DOF: unknowns minus constraint equations. Used
        only before a solve; solve() reports the rank-based DOF, which also
        catches redundant constraints (two equations saying the same thing)."""
        n_unknowns = len(self._init_values)
        n_eqs = sum(c[1] for c in self.constraints)
        return n_unknowns - n_eqs

    def _residuals(self, x):
        out = []
        for _name, _n, fn in self.constraints:
            out.extend(fn(x))
        return np.array(out, dtype=float)

    def _jacobian(self, x, h=1e-7):
        f0 = self._residuals(x)
        J = np.zeros((len(f0), len(x)))
        for j in range(len(x)):
            xp = x.copy(); xp[j] += h
            J[:, j] = (self._residuals(xp) - f0) / h
        return J

    def solve(self):
        x0 = np.array(self._init_values, dtype=float)
        n = len(x0)
        jac = None
        if self.constraints and n:
            result = least_squares(self._residuals, x0)
            x, fun, success = result.x, result.fun, bool(result.success)
            jac = result.jac  # already evaluated at the solution — reused below
        else:
            x, fun, success = x0, np.zeros(0), True
        max_residual = float(np.max(np.abs(fun))) if len(fun) else 0.0

        # Which unknowns are pinned: an unknown is free exactly when some
        # direction the constraints can't see (the Jacobian's null space)
        # moves it. Rank also gives the true DOF, redundancy included.
        free = np.ones(n, dtype=bool)
        rank = 0
        if len(fun) and n:
            J = np.asarray(jac) if jac is not None else self._jacobian(x)
            _u, sv, vt = np.linalg.svd(J)
            tol = max(J.shape) * (sv[0] if len(sv) else 0.0) * 1e-9 + 1e-9
            rank = int(np.sum(sv > tol))
            null = vt[rank:]
            free = np.any(np.abs(null) > 1e-6, axis=0) if len(null) else np.zeros(n, dtype=bool)
        dof = n - rank
        n_eqs = sum(c[1] for c in self.constraints)
        if max_residual > 1e-5:
            status = "Over-constrained"      # conflicting: can't all hold at once
        elif dof == 0:
            status = "Fully constrained"
        else:
            status = "Under-constrained"

        fixed_points = [pid for pid, i in self._points.items() if not free[i] and not free[i + 1]]
        fixed_circles = [cid for cid, (center, ridx) in self._circles.items()
                         if not free[ridx] and center in fixed_points]
        # An ellipse is pinned when its center and its rx/ry/rotation are;
        # other free-form curves are pinned when all their points are (the
        # frontend derives that from fixed points).
        ellipses = {cid: m.spec for cid, m in self._free.items() if m.kind == "ellipse"}
        fixed_curves = [cid for cid, sp in ellipses.items()
                        if sp["center"] in fixed_points and not free[sp["rx"]] and not free[sp["ry"]] and not free[sp["rot"]]]
        return {
            "success": success,
            "dof": dof,
            "equations": n_eqs,
            "redundant": max(0, n_eqs - rank),
            "status": status,
            "max_residual": max_residual,
            "points": {pid: (round(float(x[i]), 3), round(float(x[i + 1]), 3))
                       for pid, i in self._points.items()},
            "circles": {cid: {"center": center, "r": round(float(x[ridx]), 3)}
                        for cid, (center, ridx) in self._circles.items()},
            # Per-element "fully constrained" (CATIA shows these green): a
            # point with both coordinates pinned, a circle whose center and
            # radius are pinned. Lines/arcs are fully constrained when all
            # their defining points are — the frontend derives that.
            "fixed": {"points": fixed_points, "circles": fixed_circles, "curves": fixed_curves},
            "curves": {cid: {"rx": round(float(x[sp["rx"]]), 4), "ry": round(float(x[sp["ry"]]), 4), "rot": float(x[sp["rot"]])}
                       for cid, sp in ellipses.items()},
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
