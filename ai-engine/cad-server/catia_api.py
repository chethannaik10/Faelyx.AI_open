"""
catia_api.py

HTTP endpoints for the CATIA V5 workbench features added from the TU Graz
"CATIA V5 Basic Training" script — Part Design analysis, multi-body
Boolean operations, parameters/formulas/design tables, Sketcher analysis
and transformations, Drafting, Assembly Design, and data exchange.

cad_server.py calls install(app, core) at the very end of its own module,
passing itself as `core`, so these routes reuse its request models
(PartFeature, Modifier, BuildPartRequest) and its _build_shape() replay
without a circular import. Every existing route is left exactly as it was.
"""


import base64
import json
from typing import Optional

from build123d import Vector
from fastapi import Query
from fastapi.responses import Response
from pydantic import BaseModel

import analysis
import assembly as asm
import cad_io
import drafting
import parameters as params_mod
import part_features
import sketch_tools

# The feature map (CATIA_FEATURE_MAP.md at the repo root) in machine-readable form, so
# a UI can discover what the backend supports and how to call it.
CATALOG = {
    "sketchBasedFeatures": {
        "pad": {"endpoint": "/build_part", "op": "pad", "options": ["depth", "reverse", "mirrored", "depth2", "limit", "thin1", "thin2"]},
        "pocket": {"endpoint": "/build_part", "op": "pocket", "options": ["depth", "reverse", "mirrored", "depth2", "limit", "thin1", "thin2"]},
        "shaft": {"endpoint": "/build_part", "op": "revolve", "options": ["axis", "angle", "angle2", "thin1", "thin2"]},
        "groove": {"endpoint": "/build_part", "op": "groove", "options": ["axis", "angle", "angle2"]},
        "hole": {"endpoint": "/build_part", "op": "hole", "options": ["hole.diameter", "hole.depth", "hole.type", "hole.bottom", "hole.bottomAngle",
                                                                     "hole.cbDiameter", "hole.cbDepth", "hole.csDiameter", "hole.csAngle", "hole.thread", "hole.positions", "limit"]},
        "rib": {"endpoint": "/build_part", "op": "rib", "options": ["path", "profileControl", "transition"]},
        "slot": {"endpoint": "/build_part", "op": "slot", "options": ["path", "profileControl", "transition"]},
        "multiSectionsSolid": {"endpoint": "/build_part", "op": "loft", "options": ["sections", "ruled"]},
        "removedMultiSectionsSolid": {"endpoint": "/build_part", "op": "removed_loft", "options": ["sections", "ruled"]},
        "stiffener": {"endpoint": "/build_part", "op": "stiffener", "options": ["openPath", "thickness", "mirrored", "reverse"]},
    },
    "dressUpFeatures": {
        "edgeFillet": {"op": "fillet", "options": ["radius", "edgeFilter", "edgePoints", "facePoints"]},
        "variableRadiusFillet": {"op": "variable_fillet", "options": ["radius", "radius2", "edgePoints", "facePoints"]},
        "chamfer": {"op": "chamfer", "options": ["radius", "chamferAngle", "length2", "edgeFilter", "edgePoints", "facePoints"]},
        "draftAngle": {"op": "draft", "options": ["draftAngle", "pullDirection", "neutralPlane", "faceSelector", "facePoints"]},
        "shell": {"op": "shell", "options": ["thickness", "thicknessOutside", "facePoints", "faceSelector"]},
        "thickness": {"op": "thickness", "options": ["thickness", "facePoints", "faceSelector"]},
        "threadTap": {"op": "thread", "options": ["designation", "nominal", "pitch", "threadType", "threadDepth", "facePoints"]},
        "removeFace": {"op": "remove_face", "options": ["facePoints", "faceSelector"]},
    },
    "transformationFeatures": {
        "translation": {"op": "translate_body", "options": ["vector"]},
        "rotation": {"op": "rotate_body", "options": ["axisOrigin", "axisDirection", "angle"]},
        "symmetry": {"op": "symmetry_body", "options": ["planeSpec", "plane"]},
        "mirror": {"op": "mirror_body", "options": ["plane"]},
        "rectangularPattern": {"op": "linear_pattern_body", "options": ["axis", "spacing", "count", "axis2", "spacing2", "count2"]},
        "circularPattern": {"op": "circular_pattern_body", "options": ["count", "angle", "axisOrigin", "axisDirection"]},
        "userPattern": {"op": "user_pattern_body", "options": ["offsets"]},
        "scaling": {"op": "scale_body", "options": ["factor", "scaleCenter", "scaleVector"]},
        "split": {"op": "split_body", "options": ["planeSpec", "plane", "keep"]},
    },
    "booleanOperations": {"endpoint": "/build_bodies", "ops": ["add", "remove", "intersect", "assemble", "union_trim", "remove_lump"]},
    "analysis": ["/materials", "/measure_inertia", "/measure_item", "/measure_between", "/draft_analysis",
                 "/curvature_analysis", "/thread_analysis", "/validate_history"],
    "knowledge": ["/parameters/evaluate", "/build_parametric", "/design_table"],
    "sketcher": ["/sketch/analyze", "/sketch/operation"],
    "drafting": ["/drawing"],
    "assembly": ["/assembly/solve", "/assembly/build", "/assembly/analyze"],
    "dataExchange": ["/export_part", "/import_part"],
    "specificationTree": ["/projects/{name}/search"],
}


def _err(e: Exception, status: int = 400) -> Response:
    msg = str(e) if isinstance(e, ValueError) else f"{type(e).__name__}: {e}"
    return Response(content=msg, status_code=status)


def _stl(shape) -> Response:
    data, media, _ = cad_io.export_shape(shape, "stl")
    return Response(content=data, media_type=media)


def install(app, core):
    PartFeature, Modifier, BuildPartRequest = core.PartFeature, core.Modifier, core.BuildPartRequest

    def build(req) -> object:
        return core._build_shape(BuildPartRequest(features=req.features, modifiers=req.modifiers))

    # ----------------------------------------------------------- catalog --
    @app.get("/catia/features")
    def catia_features():
        return CATALOG

    # -------------------------------------------------------- materials --
    @app.get("/materials")
    def materials():
        return analysis.MATERIALS

    # --------------------------------------------------------- measure --
    class InertiaRequest(BuildPartRequest):
        density: Optional[float] = None
        aboutPoint: Optional[list[float]] = None

    @app.post("/measure_inertia")
    def measure_inertia(req: InertiaRequest):
        try:
            return analysis.measure_inertia(build(req), req.material, req.density, req.aboutPoint)
        except Exception as e:
            return _err(e)

    class ItemRequest(BuildPartRequest):
        point: list[float]
        kind: str = "auto"

    @app.post("/measure_item")
    def measure_item(req: ItemRequest):
        try:
            return analysis.measure_item(build(req), req.point, req.kind)
        except Exception as e:
            return _err(e)

    class BetweenRequest(BuildPartRequest):
        a: dict
        b: dict

    @app.post("/measure_between")
    def measure_between(req: BetweenRequest):
        try:
            return analysis.measure_between(build(req), req.a, req.b)
        except Exception as e:
            return _err(e)

    class DraftAnalysisRequest(BuildPartRequest):
        direction: list[float] = [0, 0, 1]
        thresholdDeg: float = 1.0
        mode: str = "one_sided"

    @app.post("/draft_analysis")
    def draft_analysis(req: DraftAnalysisRequest):
        try:
            return analysis.draft_analysis(build(req), req.direction, req.thresholdDeg, req.mode)
        except Exception as e:
            return _err(e)

    @app.post("/curvature_analysis")
    def curvature_analysis(req: BuildPartRequest):
        try:
            return analysis.curvature_analysis(build(req))
        except Exception as e:
            return _err(e)

    @app.post("/thread_analysis")
    def thread_analysis(req: BuildPartRequest):
        try:
            threads = part_features.iter_threads(req.features, req.modifiers)
            return {"count": sum(t["count"] for t in threads), "threads": threads}
        except Exception as e:
            return _err(e)

    @app.post("/validate_history")
    def validate_history(req: BuildPartRequest):
        """Replays the history one step at a time (CATIA's Update with
        its per-feature error report): which feature/modifier first
        fails, and the body's health after each step that succeeds."""
        steps = []
        n_f = len(req.features)
        plan = [(i, 0) for i in range(1, n_f + 1)] + [(n_f, j) for j in range(1, len(req.modifiers) + 1)]
        first_error = None
        for nf, nm in plan:
            item = req.features[nf - 1] if nm == 0 else req.modifiers[nm - 1]
            try:
                shape = core._build_shape(BuildPartRequest(features=req.features[:nf], modifiers=req.modifiers[:nm]))
                solids = list(shape.solids())
                steps.append({"id": item.id, "op": item.op, "ok": True, "volumeMm3": shape.volume,
                              "solidCount": len(solids), "valid": bool(shape.is_valid)})
            except Exception as e:
                steps.append({"id": item.id, "op": item.op, "ok": False, "error": str(e)})
                first_error = first_error or item.id
                break
        return {"ok": first_error is None, "firstError": first_error, "steps": steps}

    # ------------------------------------------------------ parameters --
    class ParamsRequest(BaseModel):
        parameters: list[dict]

    @app.post("/parameters/evaluate")
    def parameters_evaluate(req: ParamsRequest):
        return params_mod.evaluate_parameters(req.parameters)

    class ParametricRequest(BaseModel):
        parameters: list[dict] = []
        template: dict                     # a /build_part body with "=formula" strings
        format: str = "stl"                # "stl" | "inspect"

    def _build_template(parameters: list[dict], template: dict):
        ev = params_mod.evaluate_parameters(parameters)
        if not ev["ok"]:
            raise ValueError("parameter errors: " + "; ".join(f"{k}: {v}" for k, v in ev["errors"].items()))
        body = params_mod.resolve_template(template, ev["values"])
        return core._build_shape(BuildPartRequest(**body)), ev["values"]

    @app.post("/build_parametric")
    def build_parametric(req: ParametricRequest):
        try:
            shape, values = _build_template(req.parameters, req.template)
        except Exception as e:
            return _err(e)
        if req.format == "inspect":
            bb = shape.bounding_box()
            return {"parameters": values, "volumeMm3": shape.volume,
                    "boundingBoxMm": {"x": bb.size.X, "y": bb.size.Y, "z": bb.size.Z}}
        return _stl(shape)

    class DesignTableRequest(BaseModel):
        parameters: list[dict] = []        # base parameters (formulas may use table columns)
        csv: str
        template: dict

    @app.post("/design_table")
    def design_table(req: DesignTableRequest):
        """One configuration per CSV row: table values override the base
        parameters, the part is rebuilt, and each row reports its metrics
        (or its error) — a CATIA part family."""
        try:
            rows = params_mod.parse_design_table(req.csv)
        except Exception as e:
            return _err(e)
        out = []
        for i, row in enumerate(rows, start=1):
            numeric = {k: v for k, v in row.items() if isinstance(v, float)}
            merged = [p for p in req.parameters if p.get("name") not in numeric] + [{"name": k, "value": v} for k, v in numeric.items()]
            try:
                shape, values = _build_template(merged, req.template)
                bb = shape.bounding_box()
                out.append({"row": i, "config": row, "ok": True, "parameters": values, "volumeMm3": shape.volume,
                            "boundingBoxMm": {"x": bb.size.X, "y": bb.size.Y, "z": bb.size.Z}})
            except Exception as e:
                out.append({"row": i, "config": row, "ok": False, "error": str(e)})
        return {"configurations": out}

    # ---------------------------------------------- multi-body booleans --
    class BodySpec(BaseModel):
        id: str
        name: Optional[str] = None
        features: list[PartFeature]
        modifiers: list[Modifier] = []
        polarity: str = "add"              # for Assemble: "add" | "remove"

    class BooleanOp(BaseModel):
        id: Optional[str] = None
        op: str                            # add | remove | intersect | assemble | union_trim | remove_lump
        target: str
        tool: Optional[str] = None
        removePoints: list[list[float]] = []
        keepPoints: list[list[float]] = []

    class BodiesRequest(BaseModel):
        bodies: list[BodySpec]
        operations: list[BooleanOp] = []
        result: Optional[str] = None       # which body to return (default: the first = PartBody)
        format: str = "stl"                # "stl" | "inspect"

    def _solids_containing(shape, points):
        return [s for s in shape.solids() if any(s.is_inside(Vector(*p)) for p in points)]

    def _run_bodies(req: BodiesRequest):
        from build123d import Compound
        shapes = {}
        for b in req.bodies:
            if b.id in shapes:
                raise ValueError(f"duplicate body id {b.id!r}")
            try:
                shapes[b.id] = core._build_shape(BuildPartRequest(features=b.features, modifiers=b.modifiers))
            except Exception as e:
                raise ValueError(f"body {b.id!r}: {e}") from e
        polarity = {b.id: b.polarity for b in req.bodies}
        for op in req.operations:
            if op.target not in shapes:
                raise ValueError(f"{op.op}: unknown or already-consumed target body {op.target!r}")
            target = shapes[op.target]
            if op.op == "remove_lump":
                if op.removePoints:
                    drop = _solids_containing(target, op.removePoints)
                    keep = [s for s in target.solids() if not any(s.is_same(d) for d in drop)]
                elif op.keepPoints:
                    keep = _solids_containing(target, op.keepPoints)
                else:
                    keep = [max(target.solids(), key=lambda s: s.volume)]
                if not keep:
                    raise ValueError("remove lump would leave the body empty")
                shapes[op.target] = Compound(keep) if len(keep) > 1 else keep[0]
                continue
            if op.tool not in shapes or op.tool == op.target:
                raise ValueError(f"{op.op}: unknown or already-consumed tool body {op.tool!r}")
            tool = shapes.pop(op.tool)
            kind = op.op
            if kind == "assemble":
                kind = "remove" if polarity.get(op.tool) == "remove" else "add"
            if kind == "add":
                result = target + tool
            elif kind == "remove":
                result = target - tool
            elif kind == "intersect":
                result = target & tool
            elif kind == "union_trim":
                # Split the tool by the target, drop the tool pieces the
                # user marked for removal (or keep only the marked ones),
                # then fuse what's left.
                from OCP.BRepAlgoAPI import BRepAlgoAPI_Splitter
                from OCP.TopTools import TopTools_ListOfShape
                sp = BRepAlgoAPI_Splitter()
                a, t = TopTools_ListOfShape(), TopTools_ListOfShape()
                a.Append(tool.wrapped)
                t.Append(target.wrapped)
                sp.SetArguments(a)
                sp.SetTools(t)
                sp.Build()
                pieces = list(Compound(sp.Shape()).solids())
                if op.removePoints:
                    pieces = [p for p in pieces if not any(p.is_inside(Vector(*q)) for q in op.removePoints)]
                elif op.keepPoints:
                    pieces = [p for p in pieces if any(p.is_inside(Vector(*q)) for q in op.keepPoints)]
                result = target
                for p in pieces:
                    result = result + p
            else:
                raise ValueError(f"unknown boolean operation {op.op!r}")
            if result is None or not list(result.solids()):
                raise ValueError(f"{op.op} of {op.tool!r} into {op.target!r} left no solid")
            shapes[op.target] = result
        return shapes

    @app.post("/build_bodies")
    def build_bodies(req: BodiesRequest):
        try:
            shapes = _run_bodies(req)
            key = req.result or req.bodies[0].id
            if key not in shapes:
                raise ValueError(f"body {key!r} was consumed by a boolean operation — ask for its target instead")
        except Exception as e:
            return _err(e)
        if req.format == "inspect":
            out = {}
            for bid, s in shapes.items():
                bb = s.bounding_box()
                out[bid] = {"volumeMm3": s.volume, "solidCount": len(s.solids()),
                            "boundingBoxMm": {"x": bb.size.X, "y": bb.size.Y, "z": bb.size.Z}}
            return {"result": key, "bodies": out}
        return _stl(shapes[key])

    # -------------------------------------------------------- sketcher --
    @app.post("/sketch/analyze")
    def sketch_analyze(sketch: dict):
        try:
            return sketch_tools.analyze_sketch(sketch)
        except Exception as e:
            return _err(e)

    class SketchOpRequest(BaseModel):
        sketch: dict
        op: str
        ids: list[str] = []
        params: dict = {}

    @app.post("/sketch/operation")
    def sketch_operation(req: SketchOpRequest):
        try:
            return sketch_tools.sketch_operation(req.sketch, req.op, req.ids, req.params)
        except Exception as e:
            return _err(e)

    # -------------------------------------------------------- drafting --
    class DrawingRequest(BuildPartRequest):
        views: list[str] = ["front", "top", "right", "iso"]
        standard: str = "ISO"
        sheet: str = "A3"
        orientation: str = "landscape"
        scale: Optional[float] = None
        hiddenLines: bool = True
        dimensions: bool = True
        section: Optional[dict] = None
        title: dict = {}
        format: str = "svg"                # "svg" | "dxf" | "json"

    @app.post("/drawing")
    def drawing(req: DrawingRequest):
        try:
            shape = build(req)
            title = dict(req.title)
            if req.material:
                mat = analysis.resolve_material(req.material)
                title.setdefault("material", mat["name"])
                title.setdefault("massKg", mat["density"] * 1e-9 * shape.volume)
            result = drafting.make_drawing(shape, req.views, req.standard, req.sheet, req.orientation, req.scale,
                                           req.hiddenLines, req.dimensions, req.section, title)
        except Exception as e:
            return _err(e)
        sheet = result.pop("sheet")
        if req.format == "dxf":
            return Response(content=sheet.to_dxf(), media_type="image/vnd.dxf")
        if req.format == "json":
            return {**result, "svg": sheet.to_svg()}
        return Response(content=sheet.to_svg(), media_type="image/svg+xml")

    # -------------------------------------------------------- assembly --
    class Component(BaseModel):
        id: str
        name: Optional[str] = None
        partNumber: Optional[str] = None
        part: Optional[BuildPartRequest] = None
        file: Optional[dict] = None        # {"data": base64, "filename": "x.step"}
        position: dict = {}                # {"translation": [..], "rotationDeg": [rx, ry, rz]}
        fixed: bool = False
        material: Optional[str] = None

    class AssemblyRequest(BaseModel):
        components: list[Component]
        constraints: list[dict] = []
        explode: float = 0.0
        clearance: float = 0.0
        distancePairs: Optional[list[list[str]]] = None
        sectionPlane: Optional[dict] = None

    def _component_shapes(req: AssemblyRequest):
        shapes, cache = {}, {}
        ids = set()
        for c in req.components:
            if c.id in ids:
                raise ValueError(f"duplicate component id {c.id!r}")
            ids.add(c.id)
            if c.part is not None:
                key = json.dumps(c.part.model_dump(), sort_keys=True)
                if key not in cache:
                    cache[key] = core._build_shape(c.part)
                shapes[c.id] = cache[key]
            elif c.file:
                shapes[c.id] = cad_io.import_shape(c.file.get("data", ""), c.file.get("filename", ""))
            else:
                raise ValueError(f"component {c.id!r} needs a part (feature history) or a file")
        return shapes

    def _solve(req: AssemblyRequest):
        shapes = _component_shapes(req)
        solver = asm.AssemblySolver([c.model_dump() for c in req.components], req.constraints, shapes)
        return shapes, solver.solve()

    @app.post("/assembly/solve")
    def assembly_solve(req: AssemblyRequest):
        try:
            _shapes, res = _solve(req)
        except Exception as e:
            return _err(e)
        res["poses"] = {cid: asm.pose_to_json(M) for cid, M in res["poses"].items()}
        return res

    @app.post("/assembly/build")
    def assembly_build(req: AssemblyRequest):
        try:
            shapes, res = _solve(req)
            placed = asm.placed_shapes(shapes, res["poses"])
            if req.explode:
                placed = asm.explode(placed, req.explode)
            return _stl(asm.combined(placed))
        except Exception as e:
            return _err(e)

    @app.post("/assembly/analyze")
    def assembly_analyze(req: AssemblyRequest):
        try:
            shapes, res = _solve(req)
            placed = asm.placed_shapes(shapes, res["poses"])
            masses = {}
            for c in req.components:
                mat = c.material or (c.part.material if c.part else None)
                if mat:
                    masses[c.id] = analysis.resolve_material(mat)["density"] * 1e-9 * shapes[c.id].volume
            out = {
                "status": res["status"], "dof": res["dof"], "componentDof": res["componentDof"],
                "clashes": asm.clash_analysis(placed, req.clearance),
                "distances": asm.distance_analysis(placed, req.distancePairs),
                "bom": asm.bill_of_materials([c.model_dump() for c in req.components], masses),
            }
            if req.sectionPlane:
                out["section"] = asm.sectioning(placed, part_features.plane_from_spec(req.sectionPlane))
            return out
        except Exception as e:
            return _err(e)

    # --------------------------------------------------- data exchange --
    @app.post("/export_part")
    def export_part(req: BuildPartRequest, format: str = Query("step")):
        try:
            data, media, suffix = cad_io.export_shape(build(req), format)
        except Exception as e:
            return _err(e)
        return Response(content=data, media_type=media,
                        headers={"Content-Disposition": f'attachment; filename="part{suffix}"'})

    class ImportRequest(BaseModel):
        data: str
        filename: str
        format: str = "json"               # "json" (metrics) | "stl" (display mesh)

    @app.post("/import_part")
    def import_part(req: ImportRequest):
        try:
            shape = cad_io.import_shape(req.data, req.filename)
        except Exception as e:
            return _err(e)
        if req.format == "stl":
            return _stl(shape)
        bb = shape.bounding_box()
        return {"volumeMm3": shape.volume, "solidCount": len(shape.solids()), "faceCount": len(shape.faces()),
                "boundingBoxMm": {"x": bb.size.X, "y": bb.size.Y, "z": bb.size.Z},
                "note": "imported geometry has no feature history (CATIA: 'without history')"}

    # ----------------------------------------------- specification tree --
    @app.get("/projects/{name}/search")
    def search_project(name: str, q: str = "", type: Optional[str] = None):
        """Edit / Search over a saved project's tree: features, modifiers
        and sketch entities by name/id (case-insensitive substring) and
        optionally by type (op)."""
        try:
            path = core._project_path(name)
        except ValueError as e:
            return _err(e)
        if not path.exists():
            return Response(content=f"no project named {name!r}", status_code=404)
        data = json.loads(path.read_text())
        hits = []
        needle = q.lower()
        three = data.get("threeD") or {}
        for group in ("features", "modifiers"):
            for item in three.get(group, []) or []:
                label = f"{item.get('name', '')} {item.get('id', '')}".lower()
                if needle in label and (type is None or item.get("op") == type):
                    hits.append({"group": group, "id": item.get("id"), "name": item.get("name"), "op": item.get("op")})
        sketch = data.get("sketch") or {}
        for group in ("points", "lines", "circles", "arcs", "curves", "constraints"):
            for item in sketch.get(group, []) or []:
                ident = str(item.get("id", item.get("type", "")))
                if needle in ident.lower() and (type is None or type == group or item.get("type") == type):
                    hits.append({"group": f"sketch.{group}", "id": ident})
        return {"query": q, "count": len(hits), "results": hits}
