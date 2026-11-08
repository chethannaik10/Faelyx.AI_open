"""Tangency to free-form curves (ellipse, spline, conic…) is a real solver
constraint: it holds after the sketch is re-solved with other changes."""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sketch_curves import CurveModel  # noqa: E402
from sketch_solver import Sketch  # noqa: E402


def _dist_to_curve(model, x, P, samples=4000):
    lo, hi = model.param_range(x)
    return min(math.dist(P, model.pos(x, lo + (hi - lo) * i / samples)) for i in range(samples + 1))


def test_line_stays_tangent_to_an_ellipse_when_the_ellipse_is_resized():
    pts = [{"id": "c", "x": 0, "y": 0}, {"id": "a", "x": -50, "y": -21}, {"id": "b", "x": 50, "y": -19}]
    ell = {"id": "e", "kind": "ellipse", "center": "c", "rx": 40, "ry": 20, "rot": 0}
    cons = [
        {"type": "fixed", "args": {"point": "c", "x": 0, "y": 0}},
        {"type": "horizontal", "args": {"line": "l"}},
        {"type": "tangent_line_curve", "args": {"line": "l", "curve": "e"}},
    ]
    s = Sketch.from_payload(pts, [{"id": "l", "p1": "a", "p2": "b"}], [], cons, [], [ell])
    out = s.solve()
    assert out["max_residual"] < 1e-6
    # horizontal tangent to an axis-aligned ellipse sits at y = ±ry
    assert abs(abs(out["points"]["a"][1]) - out["curves"]["e"]["ry"]) < 1e-3


def test_circle_tangent_to_a_catmull_rom_spline():
    ctrl = [{"id": f"k{i}", "x": 30 * i, "y": 10 * math.sin(i)} for i in range(4)]
    pts = ctrl + [{"id": "o", "x": 45, "y": 25}]
    cons = [{"type": "fixed", "args": {"point": p["id"], "x": p["x"], "y": p["y"]}} for p in ctrl]
    cons += [{"type": "radius", "args": {"circle": "circ", "value": 8}},
             {"type": "tangent_curves", "args": {"curve1": "circ", "curve2": "sp"}}]
    spline = {"id": "sp", "kind": "spline", "controls": [p["id"] for p in ctrl]}
    s = Sketch.from_payload(pts, [], [{"id": "circ", "center": "o", "r": 8}], cons, [], [spline])
    out = s.solve()
    assert out["max_residual"] < 1e-6
    x = s._x0()
    for pid, (px, py) in out["points"].items():
        i = s._points[pid]; x[i], x[i + 1] = px, py
    model = CurveModel("spline", s._pt, spline)
    assert abs(_dist_to_curve(model, x, out["points"]["o"]) - 8) < 0.05


def test_two_ellipses_touch():
    pts = [{"id": "c1", "x": 0, "y": 0}, {"id": "c2", "x": 70, "y": 5}]
    curves = [{"id": "e1", "kind": "ellipse", "center": "c1", "rx": 30, "ry": 15, "rot": 0},
              {"id": "e2", "kind": "ellipse", "center": "c2", "rx": 30, "ry": 15, "rot": 0.3}]
    cons = [{"type": "fixed", "args": {"point": "c1", "x": 0, "y": 0}},
            {"type": "tangent_curves", "args": {"curve1": "e1", "curve2": "e2"}}]
    out = Sketch.from_payload(pts, [], [], cons, [], curves).solve()
    assert out["max_residual"] < 1e-6


def test_ellipse_fully_constrained_reports_fixed():
    pts = [{"id": "c", "x": 0, "y": 0}, {"id": "a", "x": -50, "y": -20}, {"id": "b", "x": 50, "y": -20},
           {"id": "u", "x": 40, "y": -30}, {"id": "v", "x": 40, "y": 30}]
    ell = {"id": "e", "kind": "ellipse", "center": "c", "rx": 40, "ry": 20, "rot": 0}
    cons = [{"type": "fixed", "args": {"point": p, "x": x, "y": y}} for p, x, y in
            [("c", 0, 0), ("a", -50, -20), ("b", 50, -20), ("u", 40, -30), ("v", 40, 30)]]
    cons += [{"type": "tangent_line_curve", "args": {"line": "top", "curve": "e"}},
             {"type": "tangent_line_curve", "args": {"line": "side", "curve": "e"}},
             {"type": "tangent_line_curve", "args": {"line": "diag", "curve": "e"}}]
    lines = [{"id": "top", "p1": "a", "p2": "b"}, {"id": "side", "p1": "u", "p2": "v"}, {"id": "diag", "p1": "a", "p2": "v"}]
    out = Sketch.from_payload(pts, lines, [], cons, [], [ell]).solve()
    assert out["max_residual"] < 1e-5
    assert "e" in out["fixed"]["curves"]
