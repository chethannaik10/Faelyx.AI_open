"""
drafting.py

CATIA V5 Drafting workbench (TU Graz script, chapter 11) as a headless
generator: a dimensioned 2D drawing derived from the real 3D B-rep.

  Views        Front / Top / Right (/ Left / Bottom / Back) and Isometric,
               each an exact hidden-line-removed projection by Open
               Cascade's HLR (visible edges solid, hidden edges dashed),
               laid out by ISO first-angle or ANSI third-angle rules and
               aligned on the model centre, like CATIA's View Creation
               Wizard.
  Sections     an Offset Section View through any plane, with the cut
               faces hatched at 45 degrees and an "A-A" label.
  Generation   Generate Dimensions: overall extents per orthographic view
               and the diameter of every full circle a view shows.
  Sheet        ISO A0-A4 sheet, border, title block (part, material, mass,
               scale, projection method, date), automatic standard scale.
  Export       SVG, and DXF (ezdxf) with VISIBLE / HIDDEN / DIM / TEXT
               layers — the two 2D exchange formats the script lists.
"""

from __future__ import annotations

import datetime as _dt
import io
import math
from typing import Optional

from build123d import Compound, Edge, GeomType, Keep, Plane, Vector, split, Mode

SHEETS = {"A4": (297, 210), "A3": (420, 297), "A2": (594, 420), "A1": (841, 594), "A0": (1189, 841)}
STANDARD_SCALES = [20, 10, 5, 2, 1, 1 / 2, 1 / 5, 1 / 10, 1 / 20, 1 / 50, 1 / 100]

VIEW_DIRS = {
    # name: (direction the camera looks FROM, relative to the model, up)
    "front": ((0, -1, 0), (0, 0, 1)),
    "back": ((0, 1, 0), (0, 0, 1)),
    "top": ((0, 0, 1), (0, 1, 0)),
    "bottom": ((0, 0, -1), (0, -1, 0)),
    "right": ((1, 0, 0), (0, 0, 1)),
    "left": ((-1, 0, 0), (0, 0, 1)),
    "iso": ((1, -1, 1), (0, 0, 1)),
}


class Sheet:
    """Paper-space primitives (mm, y up) shared by the SVG and DXF writers."""

    def __init__(self, width: float, height: float):
        self.w, self.h = width, height
        self.polylines: list[tuple[str, list[tuple[float, float]], bool]] = []
        self.texts: list[tuple[str, float, float, float, str, str]] = []
        self.fills: list[list[tuple[float, float]]] = []

    def line(self, layer, pts, closed=False):
        self.polylines.append((layer, [(float(x), float(y)) for x, y in pts], closed))

    def text(self, layer, x, y, h, s, anchor="start"):
        self.texts.append((layer, float(x), float(y), float(h), str(s), anchor))

    def arrow(self, tip, direction, size=2.5):
        dx, dy = direction
        l = math.hypot(dx, dy) or 1.0
        dx, dy = dx / l, dy / l
        bx, by = tip[0] - dx * size, tip[1] - dy * size
        px, py = -dy * size * 0.3, dx * size * 0.3
        tri = [tip, (bx + px, by + py), (bx - px, by - py)]
        self.fills.append(tri)

    # --- writers -----------------------------------------------------------
    def to_svg(self) -> str:
        H = self.h
        style = {
            "VISIBLE": 'stroke="#000" stroke-width="0.5" fill="none"',
            "HIDDEN": 'stroke="#000" stroke-width="0.25" stroke-dasharray="2,1" fill="none"',
            "SECTION": 'stroke="#000" stroke-width="0.7" fill="none"',
            "HATCH": 'stroke="#000" stroke-width="0.18" fill="none"',
            "DIM": 'stroke="#000" stroke-width="0.18" fill="none"',
            "BORDER": 'stroke="#000" stroke-width="0.7" fill="none"',
            "THIN": 'stroke="#000" stroke-width="0.25" fill="none"',
        }
        out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}mm" height="{self.h}mm" '
               f'viewBox="0 0 {self.w} {self.h}"><rect width="{self.w}" height="{self.h}" fill="#fff"/>']
        for layer, pts, closed in self.polylines:
            d = " ".join(f"{'M' if i == 0 else 'L'}{x:.3f},{H - y:.3f}" for i, (x, y) in enumerate(pts))
            out.append(f'<path class="{layer}" d="{d}{" Z" if closed else ""}" {style.get(layer, style["THIN"])}/>')
        for tri in self.fills:
            d = " ".join(f"{'M' if i == 0 else 'L'}{x:.3f},{H - y:.3f}" for i, (x, y) in enumerate(tri))
            out.append(f'<path class="DIM" d="{d} Z" fill="#000" stroke="none"/>')
        for layer, x, y, h, s, anchor in self.texts:
            s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            out.append(f'<text class="{layer}" x="{x:.3f}" y="{H - y:.3f}" font-size="{h:.2f}" '
                       f'font-family="Arial, sans-serif" text-anchor="{anchor}">{s}</text>')
        out.append("</svg>")
        return "\n".join(out)

    def to_dxf(self) -> bytes:
        import ezdxf
        doc = ezdxf.new("R2010", setup=True)
        msp = doc.modelspace()
        for name, lt in (("VISIBLE", "CONTINUOUS"), ("HIDDEN", "DASHED"), ("SECTION", "CONTINUOUS"),
                         ("HATCH", "CONTINUOUS"), ("DIM", "CONTINUOUS"), ("TEXT", "CONTINUOUS"),
                         ("BORDER", "CONTINUOUS"), ("THIN", "CONTINUOUS")):
            if name not in doc.layers:
                doc.layers.add(name, linetype=lt)
        for layer, pts, closed in self.polylines:
            msp.add_lwpolyline(pts, close=closed, dxfattribs={"layer": layer})
        for tri in self.fills:
            msp.add_solid(tri, dxfattribs={"layer": "DIM"})
        align = {"start": "BOTTOM_LEFT", "middle": "BOTTOM_CENTER", "end": "BOTTOM_RIGHT"}
        for layer, x, y, h, s, anchor in self.texts:
            t = msp.add_text(s, height=h, dxfattribs={"layer": "TEXT"})
            t.set_placement((x, y), align=ezdxf.enums.TextEntityAlignment[align[anchor]])
        buf = io.StringIO()
        doc.write(buf)
        return buf.getvalue().encode("utf-8")


def _edge_points(edge: Edge, tol: float = 0.2) -> list[tuple[float, float]]:
    if edge.geom_type == GeomType.LINE:
        pts = [edge.start_point(), edge.end_point()]
    else:
        n = max(8, min(200, int(edge.length / tol)))
        pts = [edge.position_at(i / n) for i in range(n + 1)]
    return [(p.X, p.Y) for p in pts]


def _project(shape, name_or_dir, center: Vector, dist: float):
    if isinstance(name_or_dir, str):
        d, up = VIEW_DIRS[name_or_dir]
    else:
        d, up = name_or_dir
    d = Vector(*d).normalized()
    up = Vector(*up)
    if abs(up.normalized().dot(d)) > 0.99:
        up = Vector(0, 1, 0) if abs(d.Y) < 0.9 else Vector(1, 0, 0)
    visible, hidden = shape.project_to_viewport(center + d * dist, viewport_up=up, look_at=center)
    return list(visible), list(hidden), (d, up)


def _bbox2d(edge_sets):
    xs, ys = [], []
    for edges in edge_sets:
        for e in edges:
            for x, y in _edge_points(e, 1.0):
                xs.append(x)
                ys.append(y)
    if not xs:
        return (0, 0, 0, 0)
    return (min(xs), min(ys), max(xs), max(ys))


def _hatch(section_faces, plane: Plane, spacing: float) -> list[Edge]:
    """45-degree hatch lines clipped to the section faces."""
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    out = []
    for face in section_faces:
        bb = face.bounding_box()
        reach = (bb.max - bb.min).length
        c = face.center()
        u = (plane.x_dir + plane.z_dir.cross(plane.x_dir)).normalized()   # 45 deg in-plane
        v = plane.z_dir.cross(u).normalized()
        n = int(reach / spacing) + 1
        for k in range(-n, n + 1):
            p0 = c + v * (k * spacing) - u * reach
            p1 = c + v * (k * spacing) + u * reach
            common = BRepAlgoAPI_Common(Edge.make_line(p0, p1).wrapped, face.wrapped)
            common.Build()
            if common.IsDone():
                out.extend(Compound(common.Shape()).edges())
    return out


def _dimension_h(sheet: Sheet, x0, x1, y, value, below=True):
    off = -7 if below else 7
    yl = y + off
    sheet.line("DIM", [(x0, y - 1 if below else y + 1), (x0, yl - (1.5 if below else -1.5))])
    sheet.line("DIM", [(x1, y - 1 if below else y + 1), (x1, yl - (1.5 if below else -1.5))])
    sheet.line("DIM", [(x0, yl), (x1, yl)])
    sheet.arrow((x0, yl), (-1, 0))
    sheet.arrow((x1, yl), (1, 0))
    sheet.text("TEXT", (x0 + x1) / 2, yl + 1, 2.5, f"{value:.2f}".rstrip("0").rstrip("."), "middle")


def _dimension_v(sheet: Sheet, y0, y1, x, value):
    xl = x - 7
    sheet.line("DIM", [(x - 1, y0), (xl - 1.5, y0)])
    sheet.line("DIM", [(x - 1, y1), (xl - 1.5, y1)])
    sheet.line("DIM", [(xl, y0), (xl, y1)])
    sheet.arrow((xl, y0), (0, -1))
    sheet.arrow((xl, y1), (0, 1))
    sheet.text("TEXT", xl - 1, (y0 + y1) / 2, 2.5, f"{value:.2f}".rstrip("0").rstrip("."), "end")


def make_drawing(shape, views: Optional[list[str]] = None, standard: str = "ISO", sheet_size: str = "A3",
                 orientation: str = "landscape", scale: Optional[float] = None, hidden_lines: bool = True,
                 dimensions: bool = True, section: Optional[dict] = None, title: Optional[dict] = None) -> dict:
    """Returns {"sheet": Sheet, "scale": s, "views": {...}} — call
    sheet.to_svg() / sheet.to_dxf() for the file."""
    views = views or ["front", "top", "right", "iso"]
    for v in views:
        if v not in VIEW_DIRS:
            raise ValueError(f"unknown view {v!r} (choose from {', '.join(VIEW_DIRS)})")
    if sheet_size not in SHEETS:
        raise ValueError(f"unknown sheet {sheet_size!r} (A0-A4)")
    W, H = SHEETS[sheet_size]
    if orientation == "portrait":
        W, H = H, W
    bb = shape.bounding_box()
    center = (bb.min + bb.max) * 0.5
    dist = (bb.max - bb.min).length * 2 + 10

    projected = {}
    for v in views:
        vis, hid, _ = _project(shape, v, center, dist)
        # Pictorial (isometric) views are drawn without hidden lines, as usual.
        projected[v] = {"visible": vis, "hidden": hid if hidden_lines and v != "iso" else [], "bbox": _bbox2d([vis, hid])}

    sec_data = None
    if section:
        from part_features import plane_from_spec
        plane = plane_from_spec(section.get("plane", {"origin": [center.X, center.Y, center.Z], "normal": [0, -1, 0]}))
        kept = split(shape, bisect_by=plane, keep=Keep.BOTTOM, mode=Mode.PRIVATE)
        if not list(kept.solids()):
            raise ValueError("the section plane doesn't cut through the part")
        up = (0, 0, 1) if abs(plane.z_dir.Z) < 0.9 else (0, 1, 0)
        vis, hid, _ = _project(kept, ((plane.z_dir.X, plane.z_dir.Y, plane.z_dir.Z), up), center, dist)
        cut_faces = [f for f in kept.faces() if f.geom_type == GeomType.PLANE
                     and abs(f.normal_at().dot(plane.z_dir)) > 0.999 and abs((f.center() - plane.origin).dot(plane.z_dir)) < 1e-6]
        sec_data = {"visible": vis, "hidden": [], "plane": plane, "cut_faces": cut_faces, "up": up,
                    "label": section.get("label", "A"), "bbox": _bbox2d([vis])}

    # Layout: a 3 x 2 grid of cells, placed by projection method.
    first_angle = standard.upper() != "ANSI"
    if first_angle:   # ISO E: top view below, right-side view left of the front view
        cells = {"front": (1, 0), "top": (1, 1), "bottom": (1, -1), "right": (0, 0), "left": (2, 0), "iso": (2, 1), "back": (3, 0)}
    else:             # ANSI: top view above, right-side view right of the front view
        cells = {"front": (0, 1), "top": (0, 0), "bottom": (0, 2), "right": (1, 1), "left": (-1, 1), "iso": (1, 0), "back": (2, 1)}
    placed = {v: cells[v] for v in views}
    if sec_data:
        used = set(placed.values())
        free = next(c for c in [(2, 0), (2, 1), (1, 2), (2, 2), (3, 0), (3, 1)] if c not in used)
        placed["section"] = free
    all_views = dict(projected, **({"section": sec_data} if sec_data else {}))
    cols = sorted({c for c, _ in placed.values()})
    rows = sorted({r for _, r in placed.values()})

    def extents(sc):
        col_w = {c: 0.0 for c in cols}
        row_h = {r: 0.0 for r in rows}
        # Views sharing a column/row are aligned on the model centre, so a
        # cell must hold the largest half-extent on each side of it.
        col_l = {c: 0.0 for c in cols}; col_r = {c: 0.0 for c in cols}
        row_b = {r: 0.0 for r in rows}; row_t = {r: 0.0 for r in rows}
        for v, (c, r) in placed.items():
            x0, y0, x1, y1 = all_views[v]["bbox"]
            col_l[c] = max(col_l[c], -x0 * sc); col_r[c] = max(col_r[c], x1 * sc)
            row_b[r] = max(row_b[r], -y0 * sc); row_t[r] = max(row_t[r], y1 * sc)
        for c in cols:
            col_w[c] = col_l[c] + col_r[c]
        for r in rows:
            row_h[r] = row_b[r] + row_t[r]
        return col_l, col_w, row_t, row_h

    margin, gap, tb_h = 10.0, 22.0, 28.0
    avail_w, avail_h = W - 2 * margin - 20, H - 2 * margin - tb_h - 10
    if scale is None:
        scale = STANDARD_SCALES[-1]
        for s in STANDARD_SCALES:
            _l, cw, _t, rh = extents(s)
            if sum(cw.values()) + gap * (len(cols) - 1) <= avail_w and sum(rh.values()) + gap * (len(rows) - 1) <= avail_h:
                scale = s
                break
    scale = float(scale)
    col_l, col_w, row_t, row_h = extents(scale)
    total_w = sum(col_w.values()) + gap * (len(cols) - 1)
    total_h = sum(row_h.values()) + gap * (len(rows) - 1)
    x_start = margin + 10 + max(0.0, (avail_w - total_w) / 2)
    y_top = H - margin - 5 - max(0.0, (avail_h - total_h) / 2)
    col_x, x = {}, x_start
    for c in cols:
        col_x[c] = x + col_l[c]
        x += col_w[c] + gap
    row_y, y = {}, y_top
    for r in rows:
        row_y[r] = y - row_t[r]
        y -= row_h[r] + gap

    sheet = Sheet(W, H)
    sheet.line("BORDER", [(margin, margin), (W - margin, margin), (W - margin, H - margin), (margin, H - margin)], closed=True)
    view_info = {}
    for v, (c, r) in placed.items():
        ox, oy = col_x[c], row_y[r]
        data = all_views[v]
        tf = lambda p: (ox + p[0] * scale, oy + p[1] * scale)
        layer_vis = "SECTION" if v == "section" else "VISIBLE"
        for e in data["visible"]:
            sheet.line(layer_vis, [tf(p) for p in _edge_points(e)])
        for e in data["hidden"]:
            sheet.line("HIDDEN", [tf(p) for p in _edge_points(e)])
        x0, y0, x1, y1 = data["bbox"]
        label = {"iso": "ISOMETRIC VIEW", "section": f"SECTION {data.get('label', 'A')}-{data.get('label', 'A')}"}.get(v, f"{v.upper()} VIEW")
        sheet.text("TEXT", ox + (x0 + x1) / 2 * scale, oy + y0 * scale - (16 if dimensions and v not in ("iso",) else 6), 3.0, label, "middle")
        if v == "section":
            spacing = 3.0 / scale
            hatch = _hatch(data["cut_faces"], data["plane"], spacing)
            if hatch:
                hv, _hh, _ = _project(Compound(hatch), ((data["plane"].z_dir.X, data["plane"].z_dir.Y, data["plane"].z_dir.Z), data["up"]), center, dist)
                for e in hv:
                    sheet.line("HATCH", [tf(p) for p in _edge_points(e)])
        if dimensions and v not in ("iso", "section"):
            _dimension_h(sheet, *(tf((x0, y0))[0], tf((x1, y0))[0]), tf((x0, y0))[1], x1 - x0)
            _dimension_v(sheet, tf((x0, y0))[1], tf((x0, y1))[1], tf((x0, y0))[0], y1 - y0)
            # Every full circle the view shows, grouped by centre so the
            # callouts of concentric circles (a counterbore) stack neatly.
            groups: dict[tuple, dict] = {}
            for e in data["visible"]:
                if e.geom_type == GeomType.CIRCLE and abs(e.length - 2 * math.pi * e.radius) < 1e-3 * max(1, e.radius):
                    cc = e.arc_center
                    groups.setdefault((round(cc.X, 3), round(cc.Y, 3)), {})[round(e.radius, 3)] = e.radius
            for (cx, cy), radii in groups.items():
                ordered = sorted(radii.values(), reverse=True)
                ex, ey = tf((cx + ordered[0] * 0.7071, cy + ordered[0] * 0.7071))
                for k, r in enumerate(ordered):
                    px, py = tf((cx + r * 0.7071, cy + r * 0.7071))
                    elbow = (ex + 6, ey + 6 + 4.5 * k)
                    sheet.line("DIM", [(px, py), elbow, (elbow[0] + 12, elbow[1])])
                    sheet.arrow((px, py), (px - elbow[0], py - elbow[1]), 2.0)
                    sheet.text("TEXT", elbow[0] + 1, elbow[1] + 0.8, 2.5, f"⌀{2 * r:.2f}".rstrip("0").rstrip("."))
        view_info[v] = {"origin": [ox, oy], "bboxModelMm": [x0, y0, x1, y1],
                        "visibleEdges": len(data["visible"]), "hiddenEdges": len(data["hidden"])}

    # Title block (bottom right), as in the script's Page Setup background view.
    t = title or {}
    tb_w = 180.0
    x0, y0 = W - margin - tb_w, margin
    sheet.line("BORDER", [(x0, y0), (x0 + tb_w, y0), (x0 + tb_w, y0 + tb_h), (x0, y0 + tb_h)], closed=True)
    for yy in (y0 + 7, y0 + 14, y0 + 21):
        sheet.line("THIN", [(x0, yy), (x0 + tb_w, yy)])
    sheet.line("THIN", [(x0 + 90, y0), (x0 + 90, y0 + 21)])
    scale_txt = f"1:{1 / scale:g}" if scale < 1 else f"{scale:g}:1"
    rows_txt = [
        (x0 + 2, y0 + 23, 3.5, t.get("name", "PART")),
        (x0 + 2, y0 + 16, 2.5, f"Material: {t.get('material') or '-'}"),
        (x0 + 92, y0 + 16, 2.5, f"Mass: {t['massKg']:.3f} kg" if t.get("massKg") else "Mass: -"),
        (x0 + 2, y0 + 9, 2.5, f"Scale {scale_txt}   Sheet {sheet_size}"),
        (x0 + 92, y0 + 9, 2.5, "ISO first angle (E)" if first_angle else "ANSI third angle"),
        (x0 + 2, y0 + 2, 2.5, f"Drawn: {t.get('author', 'Faelyx AI')}"),
        (x0 + 92, y0 + 2, 2.5, f"Date: {t.get('date', _dt.date.today().isoformat())}"),
    ]
    for x, y, h, s in rows_txt:
        sheet.text("TEXT", x, y, h, s)
    return {"sheet": sheet, "scale": scale, "scaleText": scale_txt, "views": view_info,
            "projection": "first_angle" if first_angle else "third_angle", "sheetSize": [W, H]}
