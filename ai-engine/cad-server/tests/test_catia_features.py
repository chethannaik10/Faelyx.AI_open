"""Verification of the CATIA V5 basic-training feature set (part_features,
analysis, parameters, sketch_tools, drafting, assembly, cad_io via
catia_api) against closed-form answers — volumes, inertia tensors,
distances, degrees of freedom — not just "it returned 200"."""
import base64
import json
import math
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from fastapi.testclient import TestClient  # noqa: E402

import cad_server  # noqa: E402
from cad_server import app  # noqa: E402

client = TestClient(app)
PI = math.pi


def sq(w, h, x=0, y=0):
    return {"kind": "polygon", "points": [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]}


BLOCK = {"id": "f1", "op": "pad", "depth": 30, "loops": [sq(80, 110)]}   # 80 x 110 x 30 = 264000
BLOCK_VOL = 264000.0


def inspect(features, modifiers=(), ok=True):
    res = client.post("/inspect_part", json={"features": features, "modifiers": list(modifiers)})
    if not ok:
        assert res.status_code == 400, res.text
        return res.text
    assert res.status_code == 200, res.text
    return res.json()


def vol(features, modifiers=()):
    return inspect(features, modifiers)["volumeMm3"]


def post(path, body, status=200):
    res = client.post(path, json=body)
    assert res.status_code == status, res.text
    return res


# ------------------------------------------------------ Sketch-Based ----
class TestPadPocketOptions:
    def test_mirrored_extent(self):
        d = inspect([{"id": "a", "op": "pad", "depth": 10, "mirrored": True, "loops": [sq(10, 10)]}])
        assert d["volumeMm3"] == pytest.approx(2000)
        assert d["boundingBoxMm"]["z"] == pytest.approx(20)

    def test_second_limit(self):
        assert vol([{"id": "a", "op": "pad", "depth": 10, "depth2": 5, "loops": [sq(10, 10)]}]) == pytest.approx(1500)

    def test_reverse_direction_goes_below_the_sketch(self):
        body = {"features": [{"id": "a", "op": "pad", "depth": 10, "reverse": True, "loops": [sq(10, 10)]}]}
        m = post("/measure_inertia", body).json()
        assert m["centerOfGravityMm"][2] == pytest.approx(-5)

    def test_thin_pad(self):
        # band = (22^2 - (4 - pi)) - 18^2 with round outer corners, x 10 deep
        expected = ((22 * 22 - (4 - PI)) - 18 * 18) * 10
        assert vol([{"id": "a", "op": "pad", "depth": 10, "thin1": 1, "thin2": 1, "loops": [sq(20, 20)]}]) == pytest.approx(expected, rel=1e-6)

    def test_pocket_up_to_last(self):
        v = vol([BLOCK, {"id": "p", "op": "pocket", "depth": -1, "zOffset": 30, "limit": "up_to_last", "loops": [sq(20, 20, 10, 10)]}])
        assert v == pytest.approx(BLOCK_VOL - 20 * 20 * 30)

    def test_plain_features_unchanged(self):
        # No new option set -> original code path, same result as before.
        assert vol([BLOCK, {"id": "p", "op": "pocket", "depth": -20, "zOffset": 30, "loops": [sq(20, 20, 10, 10)]}]) == pytest.approx(BLOCK_VOL - 8000)


class TestShaftGroove:
    SHAFT = {"id": "s", "op": "revolve", "axis": "X", "angle": 360, "loops": [sq(100, 20)]}

    def test_shaft(self):
        assert vol([self.SHAFT]) == pytest.approx(PI * 400 * 100, rel=1e-6)

    def test_groove(self):
        groove = {"id": "g", "op": "groove", "axis": "X", "angle": 360, "loops": [sq(20, 5, 40, 15)]}
        assert vol([self.SHAFT, groove]) == pytest.approx(PI * 400 * 100 - PI * (400 - 225) * 20, rel=1e-6)

    def test_second_angle(self):
        v = vol([{"id": "s", "op": "revolve", "axis": "X", "angle": 90, "angle2": 90, "loops": [sq(20, 10, 0, 5)]}])
        assert v == pytest.approx(PI * (15 ** 2 - 5 ** 2) * 20 / 2, rel=1e-6)


class TestHole:
    def test_v_bottom(self):
        hole = {"id": "h", "op": "hole", "zOffset": 30, "hole": {"diameter": 10, "depth": 10, "bottom": "v_bottom", "bottomAngle": 120, "positions": [[40, 55]]}}
        removed = PI * 25 * 10 + PI * 25 * (5 / math.tan(math.radians(60))) / 3
        assert vol([BLOCK, hole]) == pytest.approx(BLOCK_VOL - removed, rel=1e-7)

    def test_counterbored_threaded_uses_core_diameter(self):
        hole = {"id": "h", "op": "hole", "zOffset": 30, "hole": {"type": "counterbored", "cbDiameter": 18, "cbDepth": 5, "depth": 20,
                                                                 "thread": {"designation": "M10"}, "positions": [[20, 20], [60, 20]]}}
        r = (10 - 1.082532 * 1.5) / 2
        removed = 2 * (PI * 81 * 5 + PI * r * r * 15)
        assert vol([BLOCK, hole]) == pytest.approx(BLOCK_VOL - removed, rel=1e-6)

    def test_countersunk_through(self):
        hole = {"id": "h", "op": "hole", "zOffset": 30, "limit": "up_to_last",
                "hole": {"type": "countersunk", "csDiameter": 20, "csAngle": 90, "diameter": 10, "depth": 1, "positions": [[40, 55]]}}
        removed = PI * 5 / 3 * (100 + 50 + 25) + PI * 25 * 25
        assert vol([BLOCK, hole]) == pytest.approx(BLOCK_VOL - removed, rel=1e-6)

    def test_hole_from_sketched_circle(self):
        hole = {"id": "h", "op": "hole", "zOffset": 30, "hole": {"depth": 10}, "loops": [{"kind": "circle", "center": [40, 55], "r": 4}]}
        assert vol([BLOCK, hole]) == pytest.approx(BLOCK_VOL - PI * 16 * 10, rel=1e-6)

    def test_bad_thread(self):
        hole = {"id": "h", "op": "hole", "zOffset": 30, "hole": {"depth": 10, "thread": {"designation": "M7"}, "positions": [[1, 1]]}}
        assert "ISO coarse" in inspect([BLOCK, hole], ok=False)


class TestRibSlotLoft:
    PATH = {"start": [0, 0, 0], "segments": [{"kind": "line", "end": [0, 50, 0]},
                                             {"kind": "arc", "mid": [50 - 50 * math.cos(PI / 4), 50 + 50 * math.sin(PI / 4), 0], "end": [50, 100, 0]}]}
    PROFILE_PLANE = {"origin": [0, 0, 0], "xDir": [1, 0, 0], "normal": [0, 1, 0]}

    def test_rib(self):
        rib = {"id": "r", "op": "rib", "plane": self.PROFILE_PLANE, "loops": [{"kind": "circle", "center": [0, 0], "r": 3}], "path": self.PATH}
        # Pappus: area x centroid path length
        assert vol([rib]) == pytest.approx(PI * 9 * (50 + PI * 50 / 2), rel=2e-3)

    def test_slot(self):
        base = {"id": "b", "op": "pad", "depth": 20, "loops": [sq(100, 120, -20, -10)], "zOffset": -10}
        slot = {"id": "s", "op": "slot", "plane": self.PROFILE_PLANE, "loops": [{"kind": "circle", "center": [0, 0], "r": 3}], "path": self.PATH}
        assert vol([base, slot]) == pytest.approx(100 * 120 * 20 - PI * 9 * (50 + PI * 25), rel=2e-3)

    def test_multi_sections(self):
        loft = {"id": "l", "op": "loft", "ruled": True, "sections": [{"zOffset": 0, "loops": [sq(20, 20, -10, -10)]}, {"zOffset": 30, "loops": [sq(10, 10, -5, -5)]}]}
        # ruled square frustum: h/3 (A1 + A2 + sqrt(A1 A2))
        assert vol([loft]) == pytest.approx(30 / 3 * (400 + 100 + 200), rel=1e-6)

    def test_removed_multi_sections(self):
        base = {"id": "b", "op": "pad", "depth": 30, "loops": [sq(40, 40, -20, -20)]}
        loft = {"id": "l", "op": "removed_loft", "ruled": True, "sections": [{"zOffset": 0, "loops": [sq(20, 20, -10, -10)]}, {"zOffset": 30, "loops": [sq(10, 10, -5, -5)]}]}
        assert vol([base, loft]) == pytest.approx(48000 - 7000, rel=1e-6)


# --------------------------------------------------- Dress-Up / Transform
class TestModifiers:
    def test_draft_makes_sides_demouldable(self):
        drafted = {"features": [BLOCK], "modifiers": [{"id": "d", "op": "draft", "draftAngle": 5}]}
        assert vol([BLOCK], drafted["modifiers"]) < BLOCK_VOL
        a = post("/draft_analysis", drafted).json()
        sides = [f for f in a["faces"] if abs(f["minDraftDeg"] - 5) < 0.01]
        assert len(sides) == 4 and all(f["status"] == "green" for f in sides)

    def test_thickness(self):
        assert vol([BLOCK], [{"id": "t", "op": "thickness", "thickness": 5, "faceSelector": "+Z"}]) == pytest.approx(80 * 110 * 35)
        assert vol([BLOCK], [{"id": "t", "op": "thickness", "thickness": -5, "faceSelector": "+X"}]) == pytest.approx(75 * 110 * 30)

    def test_shell_picked_face_and_outside_thickness(self):
        assert vol([BLOCK], [{"id": "s", "op": "shell", "thickness": 2, "facePoints": [[40, 55, 30]]}]) == pytest.approx(BLOCK_VOL - 76 * 106 * 28)
        assert vol([BLOCK], [{"id": "s", "op": "shell", "thickness": 2, "thicknessOutside": 1}]) == pytest.approx(82 * 112 * 31 - 76 * 106 * 28)

    def test_fillet_on_picked_edge(self):
        assert vol([BLOCK], [{"id": "f", "op": "fillet", "radius": 5, "edgePoints": [[0, 0, 15]]}]) == pytest.approx(BLOCK_VOL - (1 - PI / 4) * 25 * 30, rel=1e-6)

    def test_variable_fillet(self):
        v = vol([BLOCK], [{"id": "f", "op": "variable_fillet", "radius": 2, "radius2": 8, "edgePoints": [[0, 0, 15]]}])
        assert BLOCK_VOL - (1 - PI / 4) * 64 * 30 < v < BLOCK_VOL - (1 - PI / 4) * 4 * 30

    def test_remove_face_fills_a_pocket(self):
        pocket = {"id": "p", "op": "pocket", "depth": -10, "zOffset": 30, "loops": [sq(20, 20, 10, 10)]}
        pts = [[20, 20, 20], [10, 20, 25], [30, 20, 25], [20, 10, 25], [20, 30, 25]]
        assert vol([BLOCK, pocket], [{"id": "r", "op": "remove_face", "facePoints": pts}]) == pytest.approx(BLOCK_VOL)

    @pytest.mark.parametrize("mod,bbox", [
        ({"op": "translate_body", "vector": [10, 0, 0]}, None),
        ({"op": "rotate_body", "axisDirection": [0, 0, 1], "angle": 90}, {"x": 110, "y": 80, "z": 30}),
        ({"op": "symmetry_body", "planeSpec": {"name": "YZ"}}, {"x": 80, "y": 110, "z": 30}),
    ])
    def test_transforms_keep_volume(self, mod, bbox):
        d = inspect([BLOCK], [{"id": "m", **mod}])
        assert d["volumeMm3"] == pytest.approx(BLOCK_VOL)
        if bbox:
            assert d["boundingBoxMm"] == pytest.approx(bbox)

    def test_translation_moves_cog(self):
        m = post("/measure_inertia", {"features": [BLOCK], "modifiers": [{"id": "m", "op": "translate_body", "vector": [10, -5, 2]}]}).json()
        assert m["centerOfGravityMm"] == pytest.approx([50, 50, 17])

    def test_symmetry_mirrors_without_copy(self):
        m = post("/measure_inertia", {"features": [BLOCK], "modifiers": [{"id": "m", "op": "symmetry_body", "planeSpec": {"name": "YZ"}}]}).json()
        assert m["centerOfGravityMm"][0] == pytest.approx(-40)

    def test_patterns(self):
        d = inspect([BLOCK], [{"id": "m", "op": "linear_pattern_body", "axis": "X", "spacing": 100, "count": 3, "axis2": "Y", "spacing2": 150, "count2": 2}])
        assert d["solidCount"] == 6 and d["volumeMm3"] == pytest.approx(6 * BLOCK_VOL)
        d = inspect([BLOCK], [{"id": "m", "op": "user_pattern_body", "offsets": [[100, 0, 0], [0, 150, 0]]}])
        assert d["solidCount"] == 3

    def test_split_and_scale(self):
        assert vol([BLOCK], [{"id": "m", "op": "split_body", "planeSpec": {"origin": [0, 0, 10], "normal": [0, 0, 1]}, "keep": "-"}]) == pytest.approx(88000)
        assert vol([BLOCK], [{"id": "m", "op": "scale_body", "scaleVector": [1, 1, 2]}]) == pytest.approx(2 * BLOCK_VOL)

    def test_thread_validation(self):
        pin = {"id": "c", "op": "pad", "depth": 20, "loops": [{"kind": "circle", "center": [0, 0], "r": 5}]}
        inspect([pin], [{"id": "t", "op": "thread", "designation": "M10", "facePoints": [[5, 0, 10]]}])
        assert "needs a" in inspect([pin], [{"id": "t", "op": "thread", "designation": "M12", "facePoints": [[5, 0, 10]]}], ok=False)


# ------------------------------------------------------------ Analysis ---
class TestAnalysis:
    def test_materials(self):
        m = client.get("/materials").json()
        assert m["Steel"]["density"] == 7860 and "Aluminium" in m

    def test_measure_inertia_box(self):
        m = post("/measure_inertia", {"features": [BLOCK], "material": "Steel", "aboutPoint": [0, 0, 0]}).json()
        mass = BLOCK_VOL * 7860e-9
        assert m["massKg"] == pytest.approx(mass)
        assert m["centerOfGravityMm"] == pytest.approx([40, 55, 15])
        I = m["inertiaAtCogKgMm2"]
        assert I[0][0] == pytest.approx(mass * (110 ** 2 + 30 ** 2) / 12, rel=1e-9)
        assert I[2][2] == pytest.approx(mass * (80 ** 2 + 110 ** 2) / 12, rel=1e-9)
        assert abs(I[0][1]) < 1e-6
        # Steiner shift to the origin
        assert m["inertiaAtPointKgMm2"][0][0] == pytest.approx(I[0][0] + mass * (55 ** 2 + 15 ** 2), rel=1e-9)

    def test_inertia_product_sign(self):
        # L shape = two boxes; tensor convention Ixy = -sum m (x-X)(y-Y)
        body = {"features": [{"id": "a", "op": "pad", "depth": 10, "loops": [{"kind": "polygon", "points": [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]]}]}], "density": 1e9}
        m = post("/measure_inertia", body).json()
        boxes = [(300 * 10 * 1.0, 15, 5), (200 * 10 * 1.0, 5, 20)]   # (mass kg at rho=1 kg/mm3, cx, cy)
        M = sum(b[0] for b in boxes)
        X = sum(b[0] * b[1] for b in boxes) / M
        Y = sum(b[0] * b[2] for b in boxes) / M
        ixy = -sum(b[0] * (b[1] - X) * (b[2] - Y) for b in boxes)
        assert m["inertiaAtCogKgMm2"][0][1] == pytest.approx(ixy, rel=1e-6)

    def test_measure_item_and_between(self):
        hole = {"id": "h", "op": "hole", "zOffset": 30, "hole": {"diameter": 10, "depth": 10, "positions": [[40, 55]]}}
        item = post("/measure_item", {"features": [BLOCK, hole], "point": [45, 55, 25], "kind": "face"}).json()
        assert item["type"] == "cylinder" and item["diameterMm"] == pytest.approx(10)
        b = post("/measure_between", {"features": [BLOCK], "a": {"point": [40, 55, 30], "kind": "face"}, "b": {"point": [40, 55, 0], "kind": "face"}}).json()
        assert b["distanceMm"] == pytest.approx(30) and b["angleDeg"] == pytest.approx(180)

    def test_draft_analysis_box(self):
        a = post("/draft_analysis", {"features": [BLOCK], "direction": [0, 0, 1]}).json()
        status = sorted(f["status"] for f in a["faces"])
        assert status == ["blue"] * 4 + ["green", "red"] and a["demouldable"] is False
        two = post("/draft_analysis", {"features": [BLOCK], "mode": "two_sided"}).json()
        assert sorted(f["status"] for f in two["faces"]).count("green") == 2

    def test_curvature(self):
        c = post("/curvature_analysis", {"features": [TestShaftGroove.SHAFT]}).json()
        assert c["maxCurvature"] == pytest.approx(1 / 20, rel=1e-6)

    def test_thread_analysis(self):
        hole = {"id": "h", "op": "hole", "zOffset": 30, "hole": {"depth": 12, "thread": {"designation": "M10", "depth": 10}, "positions": [[20, 20], [60, 20]]}}
        t = post("/thread_analysis", {"features": [BLOCK, hole]}).json()
        assert t["count"] == 2 and t["threads"][0]["minorDiameter"] == pytest.approx(8.3762, abs=1e-3)

    def test_validate_history_pinpoints_failure(self):
        bad = {"id": "bad", "op": "pocket", "depth": -5, "zOffset": 30, "loops": [{"kind": "polygon", "points": [[0, 0], [1, 1]]}]}
        r = post("/validate_history", {"features": [BLOCK, bad]}).json()
        assert r["ok"] is False and r["firstError"] == "bad" and r["steps"][0]["ok"] and r["steps"][0]["valid"]


# ---------------------------------------------------------- Parameters ---
class TestParameters:
    def test_units_order_and_cycles(self):
        r = post("/parameters/evaluate", {"parameters": [
            {"name": "length", "formula": "width*3"}, {"name": "width", "formula": "5cm"},
            {"name": "a", "formula": "b+1"}, {"name": "b", "formula": "a+1"},
            {"name": "ang", "formula": "sin(30deg)*2"}, {"name": "evil", "formula": "__import__('os')"},
        ]}).json()
        assert r["values"]["width"] == 50 and r["values"]["length"] == 150
        assert r["values"]["ang"] == pytest.approx(1.0)
        assert "circular" in r["errors"]["a"] and "evil" in r["errors"]

    def test_formula_drives_geometry(self):
        template = {"features": [{"id": "p", "op": "pad", "depth": "=height", "loops": [
            {"kind": "polygon", "points": [[0, 0], ["=length", 0], ["=length", "=width"], [0, "=width"]]}]}]}
        params = [{"name": "width", "value": 50}, {"name": "length", "formula": "width*3"}, {"name": "height", "formula": "70mm"}]
        r = post("/build_parametric", {"parameters": params, "template": template, "format": "inspect"}).json()
        assert r["volumeMm3"] == pytest.approx(150 * 50 * 70)

    def test_design_table(self):
        template = {"features": [{"id": "p", "op": "pad", "depth": "=h", "loops": [{"kind": "circle", "center": [0, 0], "r": "=d/2"}]}]}
        r = post("/design_table", {"parameters": [{"name": "h", "value": 10}], "template": template,
                                   "csv": "name;d;h\nsmall;10;10\nbig;20;5\nbroken;-4;5"}).json()["configurations"]
        assert r[0]["volumeMm3"] == pytest.approx(PI * 25 * 10) and r[1]["volumeMm3"] == pytest.approx(PI * 100 * 5)
        assert r[2]["ok"] is False


# -------------------------------------------------------- Multi-body -----
class TestBooleans:
    A = {"id": "PartBody", "features": [{"id": "a", "op": "pad", "depth": 10, "loops": [sq(20, 20)]}]}
    B = {"id": "Body2", "features": [{"id": "b", "op": "pad", "depth": 10, "loops": [sq(20, 20, 10, 0)]}]}

    def run(self, op, **extra):
        return post("/build_bodies", {"bodies": [self.A, dict(self.B, **extra.pop("b", {}))], "format": "inspect",
                                      "operations": [{"op": op, "target": "PartBody", "tool": "Body2", **extra}]}).json()["bodies"]["PartBody"]

    def test_add_remove_intersect(self):
        # 20x20x10 bodies overlapping by 10x20x10
        assert self.run("add")["volumeMm3"] == pytest.approx(6000)
        assert self.run("remove")["volumeMm3"] == pytest.approx(2000)
        assert self.run("intersect")["volumeMm3"] == pytest.approx(2000)

    def test_assemble_respects_polarity(self):
        assert self.run("assemble", b={"polarity": "remove"})["volumeMm3"] == pytest.approx(2000)

    def test_union_trim(self):
        # drop the half of Body2 sticking out beyond PartBody
        assert self.run("union_trim", removePoints=[[25, 5, 5]])["volumeMm3"] == pytest.approx(4000)

    def test_remove_lump(self):
        far = {"id": "Body2", "features": [{"id": "b", "op": "pad", "depth": 10, "loops": [sq(5, 5, 50, 0)]}]}
        r = post("/build_bodies", {"bodies": [self.A, far], "format": "inspect", "operations": [
            {"op": "add", "target": "PartBody", "tool": "Body2"},
            {"op": "remove_lump", "target": "PartBody", "removePoints": [[52, 2, 5]]}]}).json()
        assert r["bodies"]["PartBody"]["volumeMm3"] == pytest.approx(4000) and r["bodies"]["PartBody"]["solidCount"] == 1

    def test_stl_and_consumed_body(self):
        body = {"bodies": [self.A, self.B], "operations": [{"op": "add", "target": "PartBody", "tool": "Body2"}]}
        assert post("/build_bodies", body).headers["content-type"] == "model/stl"
        post("/build_bodies", dict(body, result="Body2"), status=400)


# ------------------------------------------------------------ Sketcher ---
RECT = {"points": [{"id": "a", "x": 0, "y": 0}, {"id": "b", "x": 10, "y": 0}, {"id": "c", "x": 10, "y": 5}, {"id": "d", "x": 0, "y": 5}],
        "lines": [{"id": "l1", "p1": "a", "p2": "b"}, {"id": "l2", "p1": "b", "p2": "c"}, {"id": "l3", "p1": "c", "p2": "d"}, {"id": "l4", "p1": "d", "p2": "a"}],
        "circles": [], "arcs": [], "constraints": []}


class TestSketchTools:
    def test_clean_rectangle(self):
        r = post("/sketch/analyze", RECT).json()
        assert r["ok"] and r["closedProfiles"] == 1 and r["issues"] == [] and r["solving"]["status"] == "Under-constrained"

    def test_open_crossing_isolated(self):
        sk = json.loads(json.dumps(RECT))
        sk["lines"] = sk["lines"][:3] + [{"id": "x", "p1": "a", "p2": "c"}]
        sk["points"].append({"id": "lonely", "x": 50, "y": 50})
        sk["lines"].append({"id": "cross", "p1": "b", "p2": "d"})
        types = {i["type"] for i in post("/sketch/analyze", sk).json()["issues"]}
        assert {"isolated_point", "intersection", "branch"} <= types
        sk2 = json.loads(json.dumps(RECT)); sk2["lines"].pop()
        r = post("/sketch/analyze", sk2).json()
        assert not r["ok"] and [i["type"] for i in r["issues"]].count("open_end") == 2

    def test_mirror_translate_rotate(self):
        m = post("/sketch/operation", {"sketch": RECT, "op": "mirror", "ids": ["l1", "l2", "l3", "l4"], "params": {"axis": "V"}}).json()
        assert sorted(p["x"] for p in m["points"]) == [-10, -10, 0, 0] and len(m["lines"]) == 4
        t = post("/sketch/operation", {"sketch": RECT, "op": "translate", "ids": ["l1"], "params": {"vector": [0, 10], "instances": 3}}).json()
        assert len(t["lines"]) == 3 and max(p["y"] for p in t["points"]) == 30
        r = post("/sketch/operation", {"sketch": RECT, "op": "rotate", "ids": ["l1"], "params": {"center": [0, 0], "angle": 90, "duplicate": False}}).json()
        assert {p["id"]: (round(p["x"], 6), round(p["y"], 6)) for p in r["points"]}["b"] == (0, 10)

    def test_offset_closed_profile(self):
        o = post("/sketch/operation", {"sketch": RECT, "op": "offset", "ids": ["l1", "l2", "l3", "l4"], "params": {"distance": 1}}).json()
        assert len(o["lines"]) == 4 and len(o["arcs"]) == 4
        xs = [p["x"] for p in o["points"]]
        assert min(xs) == pytest.approx(-1) and max(xs) == pytest.approx(11)
        again = dict(points=o["points"], lines=o["lines"], arcs=o["arcs"], circles=[], constraints=[])
        assert post("/sketch/analyze", again).json()["closedProfiles"] == 1

    def test_break_close_complement(self):
        b = post("/sketch/operation", {"sketch": RECT, "op": "break", "ids": ["l1"], "params": {"at": [4, 0]}}).json()
        assert b["remove"] == ["l1"] and b["points"][0]["x"] == pytest.approx(4)
        arc_sk = {"points": [{"id": "c", "x": 0, "y": 0}, {"id": "p", "x": 5, "y": 0}, {"id": "q", "x": 0, "y": 5}], "arcs": [{"id": "a", "center": "c", "p1": "p", "p2": "q"}]}
        assert post("/sketch/operation", {"sketch": arc_sk, "op": "close", "ids": ["a"]}).json()["circles"][0]["r"] == pytest.approx(5)
        comp = post("/sketch/operation", {"sketch": arc_sk, "op": "complement", "ids": ["a"]}).json()["arcs"][0]
        assert (comp["p1"], comp["p2"]) == ("q", "p")


# ------------------------------------------------------------ Drafting ---
class TestDrafting:
    PART = {"features": [BLOCK, {"id": "h", "op": "hole", "zOffset": 30, "hole": {"diameter": 10, "depth": 20, "positions": [[40, 55]]}}],
            "material": "Aluminium", "title": {"name": "PLATE"}}

    def test_svg_views_dimensions_title(self):
        svg = post("/drawing", self.PART).text
        for s in ("FRONT VIEW", "TOP VIEW", "RIGHT VIEW", "ISOMETRIC VIEW", "PLATE", "Aluminium", ">80<", ">110<", ">30<", "⌀10", 'class="HIDDEN"'):
            assert s in svg, s

    def test_projection_methods(self):
        iso = post("/drawing", dict(self.PART, format="json")).json()["views"]
        ansi = post("/drawing", dict(self.PART, format="json", standard="ANSI")).json()["views"]
        # ISO first angle: top view below the front view; ANSI: above.
        assert iso["top"]["origin"][1] < iso["front"]["origin"][1]
        assert ansi["top"]["origin"][1] > ansi["front"]["origin"][1]
        assert iso["top"]["origin"][0] == pytest.approx(iso["front"]["origin"][0])   # aligned

    def test_section_and_dxf(self, tmp_path):
        body = dict(self.PART, section={"plane": {"origin": [40, 55, 15], "normal": [0, -1, 0]}, "label": "A"})
        svg = post("/drawing", body).text
        assert "SECTION A-A" in svg and 'class="HATCH"' in svg
        dxf = post("/drawing", dict(body, format="dxf")).content
        path = tmp_path / "d.dxf"
        path.write_bytes(dxf)
        import ezdxf
        doc = ezdxf.readfile(path)
        layers = {e.dxf.layer for e in doc.modelspace()}
        assert {"VISIBLE", "HIDDEN", "HATCH", "TEXT"} <= layers


# ------------------------------------------------------------ Assembly ---
BEARING = {"features": [{"id": "blk", "op": "pad", "depth": 40, "loops": [sq(40, 80, -20, -40)]},
                        {"id": "bore", "op": "hole", "limit": "up_to_last", "plane": {"origin": [20, 0, 20], "xDir": [0, 1, 0], "normal": [1, 0, 0]},
                         "hole": {"diameter": 20, "depth": 1, "positions": [[0, 0]]}}]}
SHAFT = {"features": [{"id": "cyl", "op": "pad", "depth": 100, "loops": [{"kind": "circle", "center": [0, 0], "r": 10}]}], "material": "Steel"}


def crank_assembly(offset=True, shaft=SHAFT, shaft_r=10):
    constraints = [{"id": "c1", "type": "coincidence", "a": {"component": "bearing", "pick": [0, 10, 20]}, "b": {"component": "shaft", "pick": [shaft_r, 0, 50]}}]
    if offset:
        constraints.append({"id": "c2", "type": "offset", "value": -50, "a": {"component": "bearing", "pick": [20, 0, 5]}, "b": {"component": "shaft", "pick": [3, 3, 0]}})
    return {"components": [{"id": "bearing", "partNumber": "BRG-1", "part": BEARING, "fixed": True},
                           {"id": "shaft", "partNumber": "SHAFT-1", "part": shaft, "position": {"translation": [0, 5, 10], "rotationDeg": [0, 80, 0]}}],
            "constraints": constraints}


class TestAssembly:
    def test_dof_like_the_crank_drive(self):
        r = post("/assembly/solve", crank_assembly(offset=False)).json()
        assert r["componentDof"]["shaft"] == 2 and r["status"] == "Under-constrained"   # slide + spin
        r = post("/assembly/solve", crank_assembly()).json()
        assert r["componentDof"] == {"bearing": 0, "shaft": 1} and r["maxResidual"] < 1e-6  # spin only
        M = r["poses"]["shaft"]["matrix"]
        axis = [M[0][2], M[1][2], M[2][2]]
        assert abs(abs(axis[0]) - 1) < 1e-6                          # shaft axis along X
        assert M[1][3] == pytest.approx(0, abs=1e-6) and M[2][3] == pytest.approx(20, abs=1e-6)
        assert M[0][3] == pytest.approx(20 - 50, abs=1e-6)           # end face 50 mm behind the +X face: through the bore

    def test_over_constrained(self):
        body = crank_assembly()
        body["constraints"].append({"id": "c3", "type": "offset", "value": 50, "a": {"component": "bearing", "pick": [20, 0, 5]}, "b": {"component": "shaft", "pick": [3, 3, 0]}})
        assert post("/assembly/solve", body).json()["status"] == "Over-constrained"

    def test_clash_contact_bom_section(self):
        body = dict(crank_assembly(), sectionPlane={"origin": [0, 0, 20], "normal": [0, 0, 1]})
        r = post("/assembly/analyze", body).json()
        assert r["clashes"] == [{"a": "bearing", "b": "shaft", "type": "contact", "distanceMm": pytest.approx(0, abs=1e-6)}]
        assert [b["partNumber"] for b in r["bom"]] == ["BRG-1", "SHAFT-1"]
        assert r["bom"][1]["unitMassKg"] == pytest.approx(PI * 100 * 100 * 7860e-9)
        assert set(r["section"]) == {"bearing", "shaft"}
        fat = {"features": [{"id": "cyl", "op": "pad", "depth": 100, "loops": [{"kind": "circle", "center": [0, 0], "r": 12}]}]}
        clash = post("/assembly/analyze", crank_assembly(shaft=fat, shaft_r=12)).json()["clashes"][0]
        # interference = the 40 mm the shaft spends inside the block's 20->24 mm annulus
        assert clash["type"] == "clash" and clash["interferenceVolumeMm3"] == pytest.approx(PI * (144 - 100) * 40, rel=1e-6)

    def test_build_and_explode(self):
        assert post("/assembly/build", dict(crank_assembly(), explode=1.0)).headers["content-type"] == "model/stl"


# ------------------------------------------------------- Data exchange ---
class TestExchange:
    @pytest.mark.parametrize("fmt,ext", [("step", "part.step"), ("iges", "part.igs"), ("brep", "part.brep")])
    def test_round_trip(self, fmt, ext):
        data = client.post(f"/export_part?format={fmt}", json={"features": [BLOCK]}).content
        assert len(data) > 500
        back = post("/import_part", {"data": base64.b64encode(data).decode(), "filename": ext}).json()
        assert back["volumeMm3"] == pytest.approx(BLOCK_VOL, rel=1e-6)

    def test_step_header_and_gltf(self):
        assert client.post("/export_part?format=step", json={"features": [BLOCK]}).content.startswith(b"ISO-10303-21")
        assert client.post("/export_part?format=gltf", json={"features": [BLOCK]}).content[:4] == b"glTF"

    def test_bad_import(self):
        post("/import_part", {"data": "aGVsbG8=", "filename": "x.docx"}, status=400)


# --------------------------------------------------- Specification tree ---
def test_project_search():
    path = cad_server.PROJECTS_DIR / "zz_catia_search_test.json"
    path.write_text(json.dumps({"threeD": {"features": [{"id": "f1", "name": "Pad 001", "op": "pad"}, {"id": "f2", "name": "Pocket 001", "op": "pocket"}]},
                                "sketch": {"lines": [{"id": "Line.1"}]}}))
    try:
        r = client.get("/projects/zz_catia_search_test/search", params={"q": "pocket"}).json()
        assert r["count"] == 1 and r["results"][0]["id"] == "f2"
        assert client.get("/projects/zz_catia_search_test/search", params={"q": "", "type": "pad"}).json()["count"] == 1
    finally:
        path.unlink()


def test_catalog():
    cat = client.get("/catia/features").json()
    assert "hole" in cat["sketchBasedFeatures"] and "/drawing" in cat["drafting"]


# ------------------------------------- Part Design guide (2026-09-29) ----
L_BRACKET = {"id": "L", "op": "pad", "depth": 20, "loops": [
    {"kind": "polygon", "points": [[0, 0], [50, 0], [50, 10], [10, 10], [10, 50], [0, 50]]}]}
L_VOL = (50 * 10 + 40 * 10) * 20  # 18000
MID_XY = {"origin": [0, 0, 10], "xDir": [1, 0, 0], "normal": [0, 0, 1]}
CUBE = {"id": "c", "op": "pad", "depth": 20, "loops": [sq(20, 20)]}


class TestStiffener:
    def _stiff(self, **kw):
        f = {"id": "s", "op": "stiffener", "plane": MID_XY, "thickness": 4, "mirrored": True,
             "openPath": {"start": [10, 40], "segments": [{"kind": "line", "end": [40, 10]}]}}
        f.update(kw)
        return f

    def test_triangular_web_between_walls(self):
        # Web = triangle (10,10)-(10,40)-(40,10), area 450, thickness 4.
        d = inspect([L_BRACKET, self._stiff()])
        assert d["volumeMm3"] == pytest.approx(L_VOL + 450 * 4, rel=0.01)
        assert d["solidCount"] == 1

    def test_one_sided_thickness(self):
        d = inspect([L_BRACKET, self._stiff(mirrored=False)])
        assert d["volumeMm3"] == pytest.approx(L_VOL + 450 * 4, rel=0.01)

    def test_profile_order_does_not_matter(self):
        f = self._stiff(openPath={"start": [40, 10], "segments": [{"kind": "line", "end": [10, 40]}]})
        assert vol([L_BRACKET, f]) == pytest.approx(L_VOL + 1800, rel=0.01)

    def test_needs_existing_material(self):
        f = self._stiff()
        assert "first feature" in inspect([f], ok=False)

    def test_closed_profile_rejected(self):
        f = self._stiff(openPath={"start": [10, 40], "segments": [
            {"kind": "line", "end": [40, 10]}, {"kind": "line", "end": [10, 40]}]})
        assert "open chain" in inspect([L_BRACKET, f], ok=False)


class TestDressUpByFace:
    TOP = [[10, 10, 20]]

    def test_fillet_face_edges_only(self):
        d = inspect([CUBE], [{"id": "m", "op": "fillet", "radius": 2, "facePoints": self.TOP}])
        removed = 8000 - d["volumeMm3"]
        per_edge = (4 - PI) * 1.0  # (r² − πr²/4) per mm with r = 2
        assert 4 * per_edge * 16 < removed < 4 * per_edge * 20
        assert d["boundingBoxMm"]["z"] == pytest.approx(20)

    def test_chamfer_face_edges_only(self):
        d = inspect([CUBE], [{"id": "m", "op": "chamfer", "radius": 2, "facePoints": self.TOP}])
        removed = 8000 - d["volumeMm3"]
        assert 4 * 2 * 16 < removed < 4 * 2 * 20

    def test_variable_fillet_by_face(self):
        d = inspect([CUBE], [{"id": "m", "op": "variable_fillet", "radius": 1, "radius2": 3, "facePoints": self.TOP}])
        assert 0 < 8000 - d["volumeMm3"] < 4 * (9 - PI * 9 / 4) * 20
