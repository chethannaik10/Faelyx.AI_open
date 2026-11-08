"""
sketch_curves.py

Exact evaluation of the Sketcher's free-form curves — ellipses (and
elliptical arcs), parabolas, hyperbolas, interpolating (Catmull-Rom) and
control-vertex (B-) splines, the rho conic and the 5-point conic — as
functions of the solver's unknowns. Mirrors the sampling functions in
faelyx-ui's SketchWorkspace.tsx one-for-one, so a tangency the solver
enforces is tangency to the curve the user actually sees.

A curve is `pos(x, t)` over a parameter range; its derivative is taken
numerically. Tangency to a curve uses one extra unknown per contact (the
parameter t of the touch point) — see Sketch.constrain_tangent_*.
"""

import math

import numpy as np


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def catmull_rom(pts, T):
    """Global parameter T in [0, n-1]: segment floor(T), local T - floor(T)."""
    n = len(pts)
    if n < 2:
        return pts[0]
    i = int(_clamp(math.floor(T), 0, n - 2))
    t = T - i
    g = lambda k: pts[_clamp(k, 0, n - 1)]
    p0, p1, p2, p3 = g(i - 1), g(i), g(i + 1), g(i + 2)
    t2, t3 = t * t, t * t * t
    return tuple(
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
               + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
        for k in (0, 1)
    )


def cv_spline(pts, T):
    """Clamped uniform cubic B-spline; T in [0, n+1]."""
    last = len(pts) - 1
    p = [pts[0], pts[0], *pts, pts[last], pts[last]]
    nseg = len(p) - 3
    i = int(_clamp(math.floor(T), 0, nseg - 1))
    t = T - i
    b0 = (1 - t) ** 3 / 6
    b1 = (3 * t ** 3 - 6 * t * t + 4) / 6
    b2 = (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6
    b3 = t ** 3 / 6
    q = p[i:i + 4]
    return tuple(b0 * q[0][k] + b1 * q[1][k] + b2 * q[2][k] + b3 * q[3][k] for k in (0, 1))


def fit_conic5(pts):
    M = np.array([[x * x, x * y, y * y, x, y] for x, y in pts], dtype=float)
    try:
        return np.linalg.solve(M, np.ones(5))
    except np.linalg.LinAlgError:
        return None


def conic5_ellipse(pts):
    """The 5-point conic as an ellipse (cx, cy, rx, ry, theta), or None when
    it isn't a bounded ellipse (the UI then draws a Catmull-Rom instead)."""
    fit = fit_conic5(pts)
    if fit is None:
        return None
    A, B, C, D, E = fit
    disc = B * B - 4 * A * C
    det = 2 * A * (2 * C) - B * B
    if not (disc < -1e-9 and abs(det) > 1e-9):
        return None
    cx = (B * E - 2 * C * D) / det
    cy = (B * D - 2 * A * E) / det
    K = A * cx * cx + B * cx * cy + C * cy * cy + D * cx + E * cy - 1
    root = math.sqrt(((A - C) / 2) ** 2 + (B / 2) ** 2)
    l1, l2 = (A + C) / 2 + root, (A + C) / 2 - root
    theta = 0.5 * math.atan2(B, A - C)
    rx, ry = math.sqrt(abs(-K / l1)), math.sqrt(abs(-K / l2))
    if not (rx > 1e-3 and ry > 1e-3):
        return None
    return cx, cy, rx, ry, theta


def ellipse_point(cx, cy, rx, ry, rot, t):
    x0, y0 = rx * math.cos(t), ry * math.sin(t)
    return (cx + x0 * math.cos(rot) - y0 * math.sin(rot), cy + x0 * math.sin(rot) + y0 * math.cos(rot))


class CurveModel:
    """One free-form curve: `pos(x, t)` given the solver vector x, plus the
    parameter range to search when seeding a touch point."""

    def __init__(self, kind, pt, spec):
        self.kind, self.pt, self.spec = kind, pt, spec

    def param_range(self, x):
        k, s = self.kind, self.spec
        if k == "ellipse":
            if s.get("start") is not None and s.get("end") is not None:
                a0 = s["start"]; a1 = s["end"] if s["end"] > s["start"] else s["end"] + 360
                return math.radians(a0), math.radians(a1)
            return 0.0, 2 * math.pi
        if k == "parabola":
            T = max(5.0, s["span"]); return -T, T
        if k == "hyperbola":
            return -1.4, 1.4
        if k == "spline":
            return 0.0, float(len(s["controls"]) - 1)
        if k == "spline-cv":
            return 0.0, float(len(s["controls"]) + 1)
        if k == "conic-rp":
            return 0.0, 1.0
        if k == "conic":
            pts = [self.pt(x, p) for p in s["pts"]]
            return (0.0, 2 * math.pi) if conic5_ellipse(pts) else (0.0, 4.0)
        raise ValueError(k)

    def pos(self, x, t):
        k, s = self.kind, self.spec
        if k == "ellipse":
            cx, cy = self.pt(x, s["center"])
            return ellipse_point(cx, cy, x[s["rx"]], x[s["ry"]], x[s["rot"]], t)
        if k == "parabola":
            f = self.pt(x, s["focus"]); v = self.pt(x, s["vertex"])
            dx, dy = f[0] - v[0], f[1] - v[1]
            p = max(math.hypot(dx, dy), 1e-9)
            ux, uy = dx / p, dy / p
            sv = t * t / (4 * p)
            return (v[0] + ux * sv - uy * t, v[1] + uy * sv + ux * t)
        if k == "hyperbola":
            c = self.pt(x, s["center"]); f = self.pt(x, s["focus"]); v = self.pt(x, s["vertex"])
            cxv, cyv = f[0] - c[0], f[1] - c[1]
            cl = max(math.hypot(cxv, cyv), 1e-9)
            ux, uy = cxv / cl, cyv / cl
            a = min(cl - 0.5, max(0.5, math.hypot(v[0] - c[0], v[1] - c[1])))
            b = math.sqrt(max(0.01, cl * cl - a * a))
            xs, ys = a * math.cosh(t), b * math.sinh(t)
            return (c[0] + ux * xs - uy * ys, c[1] + uy * xs + ux * ys)
        if k == "spline":
            return catmull_rom([self.pt(x, p) for p in s["controls"]], t)
        if k == "spline-cv":
            return cv_spline([self.pt(x, p) for p in s["controls"]], t)
        if k == "conic-rp":
            p0 = self.pt(x, s["p0"]); pa = self.pt(x, s["papex"]); p2 = self.pt(x, s["p2"])
            r = _clamp(s["rho"], 0.02, 0.98); w = r / (1 - r)
            b0, b1, b2 = (1 - t) ** 2, 2 * w * t * (1 - t), t * t
            d = b0 + b1 + b2
            return ((b0 * p0[0] + b1 * pa[0] + b2 * p2[0]) / d, (b0 * p0[1] + b1 * pa[1] + b2 * p2[1]) / d)
        if k == "conic":
            pts = [self.pt(x, p) for p in s["pts"]]
            ell = conic5_ellipse(pts)
            if ell:
                return ellipse_point(*ell, t)
            return catmull_rom(pts, t)
        raise ValueError(k)

    def deriv(self, x, t, h=1e-5):
        a = self.pos(x, t - h); b = self.pos(x, t + h)
        return ((b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h))

    def nearest_param(self, x, dist_fn, samples=400):
        """Parameter whose point minimizes dist_fn(point) — the seed for a
        tangency's touch-point unknown."""
        lo, hi = self.param_range(x)
        best_t, best_d = lo, float("inf")
        for i in range(samples + 1):
            t = lo + (hi - lo) * i / samples
            d = dist_fn(self.pos(x, t))
            if d < best_d:
                best_t, best_d = t, d
        return best_t
