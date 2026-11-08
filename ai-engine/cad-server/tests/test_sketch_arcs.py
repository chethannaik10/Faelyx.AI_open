"""Solver + part-builder checks for the Drawing 2D guide features: arcs
with real endpoints, line/arc and arc/arc tangency, per-element fully
constrained status, and extruding a profile made of lines and arcs."""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from cad_server import app  # noqa: E402
from sketch_solver import Sketch  # noqa: E402

client = TestClient(app)


def _profile_payload():
    # A U-ish profile: bottom line, right line, then a tangent arc back
    # over the top, closed by a left line (like the guide's Figure 1-29).
    return {
        "points": [
            {"id": "a", "x": 0, "y": 0}, {"id": "b", "x": 40, "y": 0},
            {"id": "c", "x": 40, "y": 20}, {"id": "d", "x": 0, "y": 20},
            {"id": "m", "x": 20, "y": 21},  # arc center, roughly placed
        ],
        "lines": [
            {"id": "l1", "p1": "a", "p2": "b"}, {"id": "l2", "p1": "b", "p2": "c"},
            {"id": "l3", "p1": "d", "p2": "a"},
        ],
        "circles": [],
        "arcs": [{"id": "arc", "center": "m", "p1": "c", "p2": "d"}],
        "constraints": [
            {"type": "fixed", "args": {"point": "a", "x": 0, "y": 0}},
            {"type": "horizontal", "args": {"line": "l1"}},
            {"type": "vertical", "args": {"line": "l2"}},
            {"type": "vertical", "args": {"line": "l3"}},
            {"type": "distance", "args": {"p1": "a", "p2": "b", "value": 40}},
            {"type": "distance", "args": {"p1": "b", "p2": "c", "value": 20}},
            {"type": "tangent_line_curve", "args": {"line": "l2", "curve": "arc"}},
            {"type": "tangent_line_curve", "args": {"line": "l3", "curve": "arc"}},
        ],
    }


def test_arc_endpoints_stay_on_one_radius_and_tangent_to_line():
    res = client.post("/solve_sketch", json=_profile_payload()).json()
    P = res["points"]
    c, m, d = P["c"], P["m"], P["d"]
    r1, r2 = math.dist(m, c), math.dist(m, d)
    assert abs(r1 - r2) < 1e-4
    # smooth joint at c: line b->c is perpendicular to radius m->c
    b = P["b"]
    dot = (c[0] - b[0]) * (c[0] - m[0]) + (c[1] - b[1]) * (c[1] - m[1])
    assert abs(dot) < 1e-3
    # the tangent arc from a vertical line spans the 40mm width: center on y=20
    assert abs(m[1] - 20) < 1e-3 and abs(m[0] - 20) < 1e-3


def test_fully_constrained_profile_reports_every_point_fixed():
    res = client.post("/solve_sketch", json=_profile_payload()).json()
    assert res["status"] == "Fully constrained", res
    assert res["dof"] == 0
    assert set(res["fixed"]["points"]) == {"a", "b", "c", "d", "m"}


def test_under_constrained_reports_only_the_pinned_point():
    s = Sketch.from_payload(
        [{"id": "p", "x": 0, "y": 0}, {"id": "q", "x": 10, "y": 3}],
        [{"id": "l", "p1": "p", "p2": "q"}], [],
        [{"type": "fixed", "args": {"point": "p", "x": 0, "y": 0}}],
    )
    out = s.solve()
    assert out["dof"] == 2 and out["status"] == "Under-constrained"
    assert out["fixed"]["points"] == ["p"]


def test_redundant_constraints_do_not_read_as_over_constrained():
    s = Sketch.from_payload(
        [{"id": "p", "x": 0, "y": 0}, {"id": "q", "x": 10, "y": 0}],
        [{"id": "l", "p1": "p", "p2": "q"}], [],
        [{"type": "horizontal", "args": {"line": "l"}}, {"type": "horizontal", "args": {"line": "l"}}],
    )
    out = s.solve()
    assert out["status"] == "Under-constrained" and out["redundant"] == 1


def test_internal_circle_tangency_solves():
    s = Sketch.from_payload(
        [{"id": "c1", "x": 0, "y": 0}, {"id": "c2", "x": 3, "y": 0}], [],
        [{"id": "big", "center": "c1", "r": 10}, {"id": "small", "center": "c2", "r": 4}],
        [{"type": "fixed", "args": {"point": "c1", "x": 0, "y": 0}},
         {"type": "radius", "args": {"circle": "big", "value": 10}},
         {"type": "radius", "args": {"circle": "small", "value": 4}},
         {"type": "tangent_circles", "args": {"circle1": "big", "circle2": "small"}}],
    )
    out = s.solve()
    assert out["max_residual"] < 1e-6
    assert abs(math.dist(out["points"]["c1"], out["points"]["c2"]) - 6) < 1e-3


def test_line_tangent_to_arc_without_shared_point():
    s = Sketch.from_payload(
        [{"id": "o", "x": 0, "y": 0}, {"id": "s", "x": 10, "y": 0}, {"id": "e", "x": 0, "y": 10},
         {"id": "u", "x": -20, "y": 11}, {"id": "v", "x": 20, "y": 11}],
        [{"id": "l", "p1": "u", "p2": "v"}], [],
        [{"type": "fixed", "args": {"point": "o", "x": 0, "y": 0}},
         {"type": "fixed", "args": {"point": "s", "x": 10, "y": 0}},
         {"type": "horizontal", "args": {"line": "l"}},
         {"type": "tangent_line_curve", "args": {"line": "l", "curve": "a"}}],
        [{"id": "a", "center": "o", "p1": "s", "p2": "e"}],
    )
    out = s.solve()
    assert abs(abs(out["points"]["u"][1]) - 10) < 1e-3


def test_build_part_extrudes_a_line_and_arc_path():
    # 40 x 20 rectangle whose top edge is a half-circle bulging up (r=20)
    loop = {"kind": "path", "start": [0, 0], "segments": [
        {"kind": "line", "end": [40, 0]},
        {"kind": "line", "end": [40, 20]},
        {"kind": "arc", "mid": [20, 40], "end": [0, 20]},
        {"kind": "line", "end": [0, 0]},
    ]}
    req = {"features": [{"id": "f1", "op": "pad", "depth": 10, "loops": [loop]}]}
    inspect = client.post("/inspect_part", json=req)
    assert inspect.status_code == 200, inspect.text
    expected = (40 * 20 + math.pi * 20 ** 2 / 2) * 10
    assert abs(inspect.json()["volumeMm3"] - expected) / expected < 1e-3
    stl = client.post("/build_part", json=req)
    assert stl.status_code == 200 and len(stl.content) > 1000


def test_build_part_path_with_a_path_hole():
    outer = {"kind": "polygon", "points": [[0, 0], [60, 0], [60, 40], [0, 40]]}
    slot = {"kind": "path", "start": [20, 15], "segments": [
        {"kind": "line", "end": [40, 15]},
        {"kind": "arc", "mid": [45, 20], "end": [40, 25]},
        {"kind": "line", "end": [20, 25]},
        {"kind": "arc", "mid": [15, 20], "end": [20, 15]},
    ]}
    req = {"features": [{"id": "f1", "op": "pad", "depth": 5, "loops": [outer, slot]}]}
    res = client.post("/inspect_part", json=req)
    assert res.status_code == 200, res.text
    expected = (60 * 40 - (20 * 10 + math.pi * 25)) * 5
    assert abs(res.json()["volumeMm3"] - expected) / expected < 1e-3


def test_pad_on_a_picked_side_face():
    # A 20 x 20 x 20 cube, then a 10 x 10 square padded 5 out of its +X face.
    cube = {"id": "f1", "op": "pad", "depth": 20,
            "loops": [{"kind": "polygon", "points": [[0, 0], [20, 0], [20, 20], [0, 20]]}]}
    side = {"id": "f2", "op": "pad", "depth": 5,
            "plane": {"origin": [20, 5, 5], "xDir": [0, 1, 0], "normal": [1, 0, 0]},
            "loops": [{"kind": "polygon", "points": [[0, 0], [10, 0], [10, 10], [0, 10]]}]}
    res = client.post("/inspect_part", json={"features": [cube, side]})
    assert res.status_code == 200, res.text
    body = res.json()
    assert abs(body["volumeMm3"] - (8000 + 500)) < 1e-3
    assert abs(body["boundingBoxMm"]["x"] - 25) < 1e-6


def test_face_at_reports_a_planar_face_with_its_edges():
    cube = {"id": "f1", "op": "pad", "depth": 20,
            "loops": [{"kind": "polygon", "points": [[0, 0], [40, 0], [40, 30], [0, 30]]}]}
    res = client.post("/face_at", json={"features": [cube], "point": [40, 15, 10], "normal": [1, 0, 0]}).json()
    assert res["planar"] is True
    assert res["normal"] == [1.0, 0.0, 0.0]
    assert len(res["edges"]) == 4
    assert abs(abs(res["xDir"][1]) - 1) < 1e-9  # longest edge of the 30 x 20 side runs along Y


def test_face_at_rejects_a_curved_face():
    cyl = {"id": "f1", "op": "pad", "depth": 20, "loops": [{"kind": "circle", "center": [0, 0], "r": 10}]}
    res = client.post("/face_at", json={"features": [cyl], "point": [10, 0, 10], "normal": [1, 0, 0]}).json()
    assert res["planar"] is False and "cylinder" in res["reason"]


def test_side_by_side_loops_both_stay_solid():
    a = {"kind": "polygon", "points": [[0, 0], [40, 0], [40, 40], [0, 40]]}
    b = {"kind": "polygon", "points": [[60, 0], [70, 0], [70, 10], [60, 10]]}
    res = client.post("/inspect_part", json={"features": [{"id": "f", "op": "pad", "depth": 5, "loops": [a, b]}]})
    assert res.status_code == 200, res.text
    assert abs(res.json()["volumeMm3"] - (1600 + 100) * 5) < 1e-6


def test_island_inside_a_hole_is_solid_again():
    outer = {"kind": "polygon", "points": [[0, 0], [100, 0], [100, 100], [0, 100]]}
    hole = {"kind": "circle", "center": [50, 50], "r": 30}
    island = {"kind": "circle", "center": [50, 50], "r": 10}
    res = client.post("/inspect_part", json={"features": [{"id": "f", "op": "pad", "depth": 1, "loops": [island, outer, hole]}]})
    assert res.status_code == 200, res.text
    expected = 10000 - math.pi * 900 + math.pi * 100
    assert abs(res.json()["volumeMm3"] - expected) / expected < 1e-3


def _box_with_hole():
    outer = {"kind": "polygon", "points": [[0, 0], [60, 0], [60, 40], [0, 40]]}
    hole = {"kind": "circle", "center": [30, 20], "r": 8}
    return {"id": "f", "op": "pad", "depth": 10, "loops": [outer, hole]}


def test_chamfer_curved_edges_only_bevels_the_round_hole():
    req = {"features": [_box_with_hole()], "modifiers": [{"id": "m", "op": "chamfer", "radius": 1, "edgeFilter": "curved"}]}
    res = client.post("/inspect_part", json=req)
    assert res.status_code == 200, res.text
    base = client.post("/inspect_part", json={"features": [_box_with_hole()]}).json()
    # Only the two circular hole edges were beveled: two new conical faces.
    assert res.json()["faceCount"] == base["faceCount"] + 2
    assert res.json()["volumeMm3"] < base["volumeMm3"]


def test_chamfer_length_and_angle_differs_from_equal_distance():
    mk = lambda extra: {"features": [_box_with_hole()], "modifiers": [{"id": "m", "op": "chamfer", "radius": 2, "edgeFilter": "vertical", **extra}]}
    equal = client.post("/inspect_part", json=mk({})).json()["volumeMm3"]
    angled = client.post("/inspect_part", json=mk({"chamferAngle": 30})).json()["volumeMm3"]
    two = client.post("/inspect_part", json=mk({"length2": 4})).json()["volumeMm3"]
    assert angled != equal and two != equal
    # 4 vertical corners, triangle cut × height 10: equal 2×2/2, two-length 2×4/2
    base = client.post("/inspect_part", json={"features": [_box_with_hole()]}).json()["volumeMm3"]
    assert abs((base - equal) - 4 * 2 * 10) < 1e-6
    assert abs((base - two) - 4 * 4 * 10) < 1e-6


def test_chamfer_on_a_cylinder_skips_its_seam():
    cyl = {"id": "f", "op": "pad", "depth": 20, "loops": [{"kind": "circle", "center": [0, 0], "r": 15}]}
    for flt in ("all", "vertical", "curved"):
        res = client.post("/inspect_part", json={"features": [cyl], "modifiers": [{"id": "m", "op": "chamfer", "radius": 2, "edgeFilter": flt, "chamferAngle": 30}]})
        # "vertical" has only the seam on a cylinder: a clear "no edges" error, not an OCC failure
        if flt == "vertical":
            assert res.status_code == 400 and "no vertical edges" in res.text, res.text
        else:
            assert res.status_code == 200, (flt, res.text)


def test_chamfer_angle_out_of_range_is_rejected_clearly():
    res = client.post("/inspect_part", json={"features": [_box_with_hole()], "modifiers": [{"id": "m", "op": "chamfer", "radius": 2, "edgeFilter": "vertical", "chamferAngle": 95}]})
    assert res.status_code == 400 and "between 0° and 90°" in res.text
