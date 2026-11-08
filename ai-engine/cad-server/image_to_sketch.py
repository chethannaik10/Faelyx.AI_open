"""
image_to_sketch.py

Turns a raster image (a scanned/hand sketch, a technical drawing, or a
photo of a part) into sketch geometry the same solver understands: points,
lines, circles, and — only where the image actually shows a dimension
callout — the matching distance/radius/angle constraint.

Two stages, run in order:

  1. trace_image() — pure computer vision (OpenCV), no network call, no
     API key required. Canny edge detection + a probabilistic Hough
     transform find candidate line segments; a Hough circle transform
     finds candidate circles; nearby segment endpoints are snapped
     together so lines that meet at a corner in the image actually share
     a point in the sketch instead of floating apart by a few pixels of
     edge noise. This alone is enough to produce a "basic sketch": the
     right shape, proportioned like the image, un-dimensioned.

  2. ai_review() — optional, and free: rather than a paid cloud vision
     API, this calls a local Ollama model (http://127.0.0.1:11434 by
     default — Ollama's own default port) running on the same machine as
     this server. No API key, no per-call cost, no rate limit other than
     your own hardware. The traced primitives are handed to it along
     with the original image and it's asked to (a) drop segments that
     are noise rather than real geometry, (b) merge fragments that are
     clearly one line broken by a gap in the trace, and (c) read any
     dimension annotations printed in the image (e.g. "50mm", "R10",
     "45°") and say which entity each one labels. When this step runs
     and finds dimensions, build_sketch() turns those into real
     distance/radius/angle constraints and uses the first one found to
     fix the image's pixel-to-mm scale; every other point is just an
     initial position for the solver, exactly like a fresh mouse click.
     When it doesn't run (Ollama isn't running, has no vision-capable
     model pulled, or the call fails for any reason) or finds no
     dimension text, the sketch comes back with geometry only,
     proportionally scaled to a reasonable default size.

Nothing in build_sketch() assumes which of these two stages ran — it
takes whatever ai_review() returns (or None) and produces the same
{points, lines, circles, constraints} shape /solve_sketch already
expects, so the frontend's preview-and-accept flow works identically
either way; the only difference is whether any constraints come back.

A third, independent thing happens alongside both stages: a gear's teeth
(or a hand-drawn ellipse) rarely give HoughCircles a clean arc to find, so
they'd otherwise come back with no center at all and nothing sensible to
dimension. trace_image() also looks at the traced outline's overall shape
(_classify_radial_shape) and, for a gear specifically, always adds a
centroid-based center point plus ready-to-apply "outer radius"/"root
radius" suggestions — no AI needed, since counting a gear's teeth from its
outline is reliable pure geometry. An ellipse-shaped outline is harder to
tell apart from an ordinary straight-edged polygon by geometry alone, so
that case additionally waits on ai_review() actually looking at the image
and confirming it's an ellipse before offering "semi-major/minor axis"
suggestions. Either way these are returned separately as
`suggested_dimensions` — plain Distance constraints between two already-
real points, never auto-applied, so a wrong guess costs nothing.
"""

import base64
import json
import os
import re

import numpy as np

# opencv is a heavier, optional dependency (`pip install opencv-python-
# headless`) that this project's venv may not have installed yet. Rather
# than let a missing import take down the whole FastAPI app on startup —
# solve_sketch, projects, generate all have nothing to do with images —
# the import is deferred here and only raised, with an actionable
# message, when trace_image() is actually called.
try:
    import cv2
    _CV2_IMPORT_ERROR = None
except ImportError as e:
    cv2 = None
    _CV2_IMPORT_ERROR = e

DEFAULT_SPAN_MM = 150.0  # when no dimension is found, normalize the
                          # traced sketch so its longest span becomes
                          # roughly this big — a sensible size to start
                          # editing, not a claimed real dimension.


# ---------------------------------------------------------------------
# Stage 1: pure computer-vision trace — no API key needed.
# ---------------------------------------------------------------------

def _decode_image(image_b64: str) -> np.ndarray:
    """Accepts either a raw base64 string or a data: URL."""
    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[1]
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("could not decode image data")
    return img


def _snap_points(raw_points, tol):
    """Union-find clustering: any two raw (x, y) endpoints within `tol`
    pixels of each other collapse into one shared point, at their
    centroid. Returns (cluster centers, {raw index -> cluster index})."""
    n = len(raw_points)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    pts = np.array(raw_points, dtype=float) if n else np.zeros((0, 2))
    for i in range(n):
        for j in range(i + 1, n):
            if np.hypot(*(pts[i] - pts[j])) <= tol:
                union(i, j)

    clusters = {}
    for i in range(n):
        clusters.setdefault(find(i), []).append(i)

    ordered_roots = list(clusters.keys())
    root_to_final = {r: k for k, r in enumerate(ordered_roots)}
    centers = [tuple(pts[clusters[r]].mean(axis=0)) for r in ordered_roots]
    index_to_final = {i: root_to_final[find(i)] for i in range(n)}
    return centers, index_to_final


def _verify_circle(edges, cx, cy, r, coverage_threshold=0.6, n_samples=72):
    """HoughCircles frequently 'sees' a large circle in the accumulator
    space of an entirely rectilinear drawing (a rectangle's corners are
    concyclic with plenty of other things at the right radius) even
    though no such arc is actually drawn. Sampling points around the
    claimed circumference and checking how many actually sit on a Canny
    edge pixel throws those out without hand-tuning Hough's thresholds
    into fragility for genuine circles."""
    h, w = edges.shape[:2]
    hits = 0
    for i in range(n_samples):
        theta = 2 * np.pi * i / n_samples
        x = int(round(cx + r * np.cos(theta)))
        y = int(round(cy + r * np.sin(theta)))
        if 0 <= x < w and 0 <= y < h:
            x0, x1 = max(0, x - 2), min(w, x + 3)
            y0, y1 = max(0, y - 2), min(h, y + 3)
            if edges[y0:y1, x0:x1].any():
                hits += 1
    return (hits / n_samples) >= coverage_threshold


def _largest_contour(edges):
    """The largest closed edge loop in a Canny map — used only to
    characterize the traced outline's *overall* shape (is this basically a
    gear? an ellipse?) for the dimension suggestions below. It never feeds
    the point/line/circle trace itself, so a poor or absent contour here
    only means no suggestion is offered, never a broken import."""
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None
    return max(contours, key=cv2.contourArea)


def _classify_radial_shape(contour, min_area=300.0, min_points=20):
    """A coarse shape hint from how a closed outline's radius (distance
    from its own centroid) behaves as you walk the boundary: a circle's
    radius barely changes; a gear's oscillates once per tooth (many small,
    regular oscillations, counted here via simple threshold-crossings
    rather than a true peak-finder, since it only needs to be robust, not
    exact); an ellipse or a straight-edged polygon (rectangle, hexagon...)
    both oscillate just a handful of times, which geometry alone can't
    reliably tell apart — that's why "ellipse_candidate" needs ai_review()
    to actually look at the image and confirm it before build_sketch()
    trusts it. "gear" doesn't need that confirmation: nothing else in an
    ordinary mechanical part produces 8+ regular oscillations."""
    if contour is None or len(contour) < min_points or cv2.contourArea(contour) < min_area:
        return None
    M = cv2.moments(contour)
    if abs(M["m00"]) < 1e-6:
        return None
    cx, cy = M["m10"] / M["m00"], M["m01"] / M["m00"]
    pts = contour.reshape(-1, 2).astype(float)
    radii = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
    r_min, r_max = float(radii.min()), float(radii.max())
    if r_min < 1e-6:
        return None
    mid = (r_min + r_max) / 2
    above = radii > mid
    crossings = int(np.sum(above != np.roll(above, 1)))
    lobes = max(1, crossings // 2)
    ratio = r_max / r_min

    if ratio < 1.15:
        kind = "circle"  # already handled by HoughCircles above; not acted on below
    elif lobes >= 8 and ratio <= 2.5:
        kind = "gear"
    elif 2 <= lobes <= 7 and ratio <= 4.0:
        kind = "ellipse_candidate"
    else:
        kind = None

    if kind is None:
        return None
    return {"kind": kind, "cx": cx, "cy": cy, "r_min": r_min, "r_max": r_max, "lobes": lobes}


def trace_image(image_b64: str, snap_tol_px: float = 12.0):
    """Returns (points, lines, circles, width, height, shape_hint) — the
    first five already shaped like SketchPoint/SketchLine/SketchCircle
    dicts, ids prefixed "i" (ip0, il0, ic0, ...) so they can't collide with
    the frontend's own pt/ln/ci ids while the import is still a preview
    the user hasn't accepted. shape_hint (see _classify_radial_shape) is
    None or a dict describing a gear/ellipse-candidate outline, used by
    build_sketch() to offer dimension suggestions."""
    if cv2 is None:
        raise RuntimeError(
            "opencv is not installed in this server's environment — run "
            "`pip install opencv-python-headless` in the cad-server venv "
            f"and restart the server. (import error: {_CV2_IMPORT_ERROR})"
        )
    img = _decode_image(image_b64)
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    shape_hint = _classify_radial_shape(_largest_contour(edges))

    min_len = max(15, int(0.02 * max(w, h)))
    raw_lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=40,
        minLineLength=min_len, maxLineGap=min_len // 2,
    )
    raw_circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=min_len,
        param1=100, param2=35, minRadius=8, maxRadius=min(w, h) // 2,
    )

    # HoughLinesP's returned array shape has changed across OpenCV
    # versions — (N, 1, 4) historically, (N, 4) as of OpenCV 5.0 — so
    # indexing by position (raw_lines[:, 0]) silently breaks depending on
    # which one is installed. reshape(-1, 4) collapses either shape into
    # a flat (N, 4) regardless, since it doesn't care how many singleton
    # dimensions came before it.
    segments = []
    if raw_lines is not None:
        for x1, y1, x2, y2 in raw_lines.reshape(-1, 4):
            segments.append(((float(x1), float(y1)), (float(x2), float(y2))))

    endpoint_list = [pt for seg in segments for pt in seg]
    centers, index_map = _snap_points(endpoint_list, snap_tol_px)

    points = [{"id": f"ip{i}", "x": round(float(cx), 2), "y": round(float(cy), 2)}
              for i, (cx, cy) in enumerate(centers)]

    lines = []
    seen_pairs = set()
    for seg_i in range(len(segments)):
        a_idx, b_idx = index_map[seg_i * 2], index_map[seg_i * 2 + 1]
        if a_idx == b_idx:
            continue  # degenerate: both ends snapped to the same point
        key = tuple(sorted((a_idx, b_idx)))
        if key in seen_pairs:
            continue  # duplicate/overlapping detection of the same edge
        seen_pairs.add(key)
        lines.append({"id": f"il{len(lines)}", "p1": f"ip{a_idx}", "p2": f"ip{b_idx}"})

    # Same cross-version shape issue as HoughLinesP above — HoughCircles
    # returns (1, N, 3) historically, possibly (N, 3) on newer OpenCV —
    # so this is reshaped the same defensive way rather than indexed by
    # position.
    circles = []
    if raw_circles is not None:
        for cx, cy, r in raw_circles.reshape(-1, 3):
            if not _verify_circle(edges, cx, cy, r):
                continue
            center_id = f"ic{len(circles)}c"
            points.append({"id": center_id, "x": round(float(cx), 2), "y": round(float(cy), 2)})
            circles.append({"id": f"ic{len(circles)}", "center": center_id, "r": round(float(r), 2)})

    return points, lines, circles, w, h, shape_hint


# ---------------------------------------------------------------------
# Stage 2: optional AI review — cleans up the trace and reads dimensions.
# ---------------------------------------------------------------------

def _entity_summary(points, lines, circles):
    point_by_id = {p["id"]: p for p in points}
    lines_desc = [f'  {l["id"]}: from {l["p1"]} to {l["p2"]}' for l in lines]
    circles_desc = [
        f'  {c["id"]}: center {c["center"]} at '
        f'({point_by_id[c["center"]]["x"]:.0f}, {point_by_id[c["center"]]["y"]:.0f}), r={c["r"]:.1f}px'
        for c in circles
    ]
    return (
        "Lines:\n" + ("\n".join(lines_desc) or "  (none)")
        + "\n\nCircles:\n" + ("\n".join(circles_desc) or "  (none)")
    )


AI_REVIEW_PROMPT = """You are reviewing a 2D engineering sketch extracted from an uploaded \
image. A computer-vision pass already traced candidate straight line \
segments and circles from the image's edges; their pixel coordinates are \
listed below, alongside the original image.

Your job:
1. Decide which traced lines/circles correspond to real geometry the \
person actually drew, vs. noise, shading, hatching, or the image's own \
background/border. List those ids under "drop".
2. If two or more traced lines are clearly fragments of one continuous \
line (broken by a gap in the edge detection), list each such group under \
"merge" (they'll be replaced by a single line spanning their combined \
extent).
3. Read any dimension text printed in the image itself (numbers with \
units or symbols, e.g. "50mm", "R10", "45°", "2in"). For each one you can \
confidently match to a specific traced entity, report it under \
"dimensions": which entity id it labels, whether it's a length (for a \
line), a radius (for a circle), or an angle (between two lines, given as \
a 2-item list of line ids), and its numeric value and unit. If you \
cannot confidently match a dimension to a specific entity, leave it out \
rather than guessing.
4. Look at the overall outline of the part (ignore hatching, dimension \
lines, and text) and report it under "shape" as one of "circle", \
"ellipse" (an oval, noticeably longer in one direction than the \
perpendicular one), or "other" (gears, polygons, brackets, or anything \
not simply round/oval). If you're not confident, answer "other" — a wrong \
guess here only suppresses one helpful suggestion, so there's no benefit \
to guessing.

Traced entities (pixel coordinates, y grows downward):
{entities}

Respond with ONLY a JSON object, no other text, shaped exactly like this \
example (use the real entity ids from above, and keep every key even if \
its list is empty):
{{
  "drop": ["il2", "ic0"],
  "merge": [["il0", "il3"]],
  "dimensions": [
    {{"entity": "il1", "kind": "length", "value": 50.0, "unit": "mm"}},
    {{"entity": "ic0", "kind": "radius", "value": 10.0, "unit": "mm"}},
    {{"entity": ["il0", "il4"], "kind": "angle", "value": 45.0, "unit": "deg"}}
  ],
  "shape": "other"
}}"""


def _pick_ollama_model(base_url):
    """OLLAMA_VISION_MODEL, if set and actually pulled; otherwise the
    first locally-installed model that advertises vision support (`ollama
    list` / GET /api/tags reports this per-model, so a model swapped in
    later — llama3.2-vision, qwen2.5vl, llava, whatever's pulled — is
    picked up automatically without a code change); otherwise a
    reasonable guess, left for the actual chat call to fail against."""
    try:
        import requests
        resp = requests.get(f"{base_url}/api/tags", timeout=5)
        resp.raise_for_status()
        models = resp.json().get("models", [])
    except Exception:
        models = []

    names = [m.get("name") for m in models]
    preferred = os.environ.get("OLLAMA_VISION_MODEL")
    if preferred and preferred in names:
        return preferred
    for m in models:
        if "vision" in (m.get("capabilities") or []):
            return m["name"]
    return preferred or "qwen3.5:9b"


def ai_review(image_b64: str, points, lines, circles):
    """Calls a local Ollama vision model to clean up the trace and find
    dimension callouts — free and unlimited, since it's your own
    hardware rather than a paid API: no key, no per-call cost, no
    provider rate limit. Requires Ollama (https://ollama.com) running on
    this machine (or wherever OLLAMA_BASE_URL points) with a vision-
    capable model pulled — `ollama pull qwen2.5vl` or similar; see
    _pick_ollama_model() for how the model is chosen.

    Returns None — meaning "skip this step" — when Ollama isn't
    reachable, has no usable model, or anything about the call fails;
    the caller falls back to the raw CV trace, which is still a usable,
    if undimensioned, sketch. A best-effort refinement step should never
    be the reason the whole import fails.

    Passes think=False: several current Ollama models (including
    qwen3.5, a hybrid reasoner) default to writing out a chain-of-thought
    before answering even for a short, structured task like this one.
    Measured directly against this model: a trivial one-line prompt took
    ~24s with thinking on (492 reasoning tokens) vs. ~0.7s with it off
    (6 tokens) — over 30x. The JSON contract this prompt asks for doesn't
    benefit from visible reasoning, so it's turned off everywhere here.
    Older models that don't understand the field simply ignore it."""
    if not (lines or circles):
        return None
    try:
        import requests
    except ImportError:
        return None

    data = image_b64
    if data.startswith("data:"):
        data = data.split(",", 1)[1]

    base_url = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    model = _pick_ollama_model(base_url)
    prompt = AI_REVIEW_PROMPT.format(entities=_entity_summary(points, lines, circles))

    try:
        resp = requests.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "stream": False,
                "think": False,
                "messages": [{"role": "user", "content": prompt, "images": [data]}],
            },
            # Local vision inference is much slower than a cloud API,
            # especially on a cold model load — generous but not
            # unbounded, so a genuinely stuck request doesn't hang the
            # request forever. With thinking disabled this should
            # usually finish in a few seconds once the model is loaded;
            # 180s mostly covers a cold start plus queueing behind any
            # other request already in flight (Ollama serializes calls
            # to one loaded model).
            timeout=180,
        )
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return None
        return json.loads(match.group(0))
    except Exception:
        return None


# ---------------------------------------------------------------------
# Merge stage-1 + stage-2 into a real, mm-scaled sketch payload.
# ---------------------------------------------------------------------

def build_sketch(points, lines, circles, review, image_width, image_height, shape_hint=None):
    review = review or {}
    drop = set(review.get("drop") or [])
    merge_groups = review.get("merge") or []
    dimensions = review.get("dimensions") or []

    points = [dict(p) for p in points if p["id"] not in drop]
    lines = [dict(l) for l in lines if l["id"] not in drop]
    circles = [dict(c) for c in circles if c["id"] not in drop]

    point_by_id = {p["id"]: p for p in points}
    line_by_id = {l["id"]: l for l in lines}

    # Merge fragment groups into one line spanning their combined extent
    # (the two endpoints farthest apart across the whole group).
    merged_away = set()
    for group in merge_groups:
        group = [lid for lid in group if lid in line_by_id and lid not in merged_away]
        if len(group) < 2:
            continue
        endpoints = []
        for lid in group:
            l = line_by_id[lid]
            if l["p1"] in point_by_id:
                endpoints.append(point_by_id[l["p1"]])
            if l["p2"] in point_by_id:
                endpoints.append(point_by_id[l["p2"]])
        if len(endpoints) < 2:
            continue
        best_pair, best_dist = (endpoints[0], endpoints[1]), -1.0
        for i in range(len(endpoints)):
            for j in range(i + 1, len(endpoints)):
                d = np.hypot(endpoints[i]["x"] - endpoints[j]["x"], endpoints[i]["y"] - endpoints[j]["y"])
                if d > best_dist:
                    best_dist, best_pair = d, (endpoints[i], endpoints[j])
        survivor = line_by_id[group[0]]
        survivor["p1"], survivor["p2"] = best_pair[0]["id"], best_pair[1]["id"]
        merged_away.update(group[1:])
    lines = [l for l in lines if l["id"] not in merged_away]
    line_by_id = {l["id"]: l for l in lines}

    used_ids = {l["p1"] for l in lines} | {l["p2"] for l in lines} | {c["center"] for c in circles}
    points = [p for p in points if p["id"] in used_ids]
    point_by_id = {p["id"]: p for p in points}

    # A traced gear or ellipse rarely gets a usable center from HoughCircles
    # — it looks for a clean circular arc, and a gear's teeth (or a
    # hand-drawn oval) don't draw one. shape_hint (see
    # _classify_radial_shape) gives a centroid-based center instead, plus
    # radii turned into ready-to-apply Distance suggestions below: each one
    # picks the existing traced point nearest that radius rather than
    # inventing a new one, so "Apply" in the UI creates an ordinary
    # Distance constraint between two real sketch points — nothing new for
    # the solver to understand. "ellipse_candidate" only becomes a real
    # suggestion if ai_review() looked at the actual image and confirmed
    # it — geometry alone can't reliably tell an ellipse from a rectangle
    # or hexagon (see _classify_radial_shape's docstring); "gear" needs no
    # such confirmation.
    suggested_dimensions = []
    hint_kind = shape_hint["kind"] if shape_hint else None
    review_shape = str(review.get("shape") or "").strip().lower()
    is_confirmed_ellipse = review_shape in ("ellipse", "oval")
    offer_shape_center = bool(points) and shape_hint and (
        hint_kind == "gear" or (hint_kind == "ellipse_candidate" and is_confirmed_ellipse)
    )
    if offer_shape_center:
        cx, cy = shape_hint["cx"], shape_hint["cy"]
        already_close = any(np.hypot(p["x"] - cx, p["y"] - cy) < 6.0 for p in points)
        if not already_close:
            center_id = "ishapec"
            points.append({"id": center_id, "x": round(float(cx), 2), "y": round(float(cy), 2)})

            def _nearest_to_radius(target_r):
                best_id, best_diff = None, None
                for p in points:
                    if p["id"] == center_id:
                        continue
                    diff = abs(float(np.hypot(p["x"] - cx, p["y"] - cy)) - target_r)
                    if best_diff is None or diff < best_diff:
                        best_diff, best_id = diff, p["id"]
                return best_id

            outer_id = _nearest_to_radius(shape_hint["r_max"])
            inner_id = _nearest_to_radius(shape_hint["r_min"])
            if hint_kind == "gear":
                if outer_id:
                    suggested_dimensions.append({
                        "label": f"Outer radius (~{shape_hint['lobes']} teeth)",
                        "p1": center_id, "p2": outer_id, "r_px": shape_hint["r_max"],
                    })
                if inner_id and inner_id != outer_id:
                    suggested_dimensions.append({
                        "label": "Root radius",
                        "p1": center_id, "p2": inner_id, "r_px": shape_hint["r_min"],
                    })
            else:
                if outer_id:
                    suggested_dimensions.append({
                        "label": "Semi-major axis (center \u2192 point)",
                        "p1": center_id, "p2": outer_id, "r_px": shape_hint["r_max"],
                    })
                if inner_id and inner_id != outer_id:
                    suggested_dimensions.append({
                        "label": "Semi-minor axis (center \u2192 point)",
                        "p1": center_id, "p2": inner_id, "r_px": shape_hint["r_min"],
                    })

    def line_len_px(lid):
        l = line_by_id.get(lid)
        if not l:
            return None
        a, b = point_by_id.get(l["p1"]), point_by_id.get(l["p2"])
        if not a or not b:
            return None
        return float(np.hypot(a["x"] - b["x"], a["y"] - b["y"]))

    circle_by_id = {c["id"]: c for c in circles}

    # Pick a pixel->mm scale from the first usable dimension; otherwise
    # normalize so the whole sketch's longest span becomes DEFAULT_SPAN_MM
    # — a reasonable size to start editing, not a claimed real dimension.
    scale = None
    for dim in dimensions:
        value = dim.get("value")
        if not value:
            continue
        if dim.get("kind") == "length":
            px = line_len_px(dim.get("entity"))
            if px and px > 1e-6:
                scale = value / px
                break
        elif dim.get("kind") == "radius":
            circle = circle_by_id.get(dim.get("entity"))
            if circle and circle["r"] > 1e-6:
                scale = value / circle["r"]
                break
    if scale is None:
        span = max(image_width, image_height) or 1
        scale = DEFAULT_SPAN_MM / span

    for p in points:
        p["x"] = round(p["x"] * scale, 3)
        p["y"] = round(p["y"] * scale, 3)
    for c in circles:
        c["r"] = round(c["r"] * scale, 3)
    for sd in suggested_dimensions:
        sd["value_mm"] = round(sd.pop("r_px") * scale, 2)

    constraints = []
    for dim in dimensions:
        kind, value = dim.get("kind"), dim.get("value")
        entity = dim.get("entity")
        if value is None:
            continue
        if kind == "length" and entity in line_by_id:
            l = line_by_id[entity]
            constraints.append({"type": "distance", "args": {"p1": l["p1"], "p2": l["p2"], "value": value}})
        elif kind == "radius" and entity in circle_by_id:
            constraints.append({"type": "radius", "args": {"circle": entity, "value": value}})
        elif kind == "angle" and isinstance(entity, list) and len(entity) == 2 \
                and entity[0] in line_by_id and entity[1] in line_by_id:
            constraints.append({"type": "angle", "args": {"line1": entity[0], "line2": entity[1], "value": value}})

    notes = (
        f"Read {len(constraints)} dimension(s) from the image and applied them as constraints."
        if constraints else
        "No dimension callouts found — geometry only, proportioned to a default size."
    )
    if suggested_dimensions:
        shape_word = "gear" if hint_kind == "gear" else "ellipse"
        article = "a" if hint_kind == "gear" else "an"
        notes += f" Detected {article} {shape_word}-like outline — added a center point; see the suggested dimensions below."
    return points, lines, circles, constraints, notes, scale, suggested_dimensions


def image_to_sketch(image_b64: str):
    """The whole pipeline, end to end. Raises ValueError only if the
    image itself can't even be decoded — every downstream step (AI
    review, dimension detection) degrades gracefully instead of failing
    the request. `scale` (mm per source pixel) and the source image's
    pixel size are returned alongside the sketch so the frontend can
    draw the original image as a to-scale background behind the
    proposed geometry in its preview overlay."""
    points, lines, circles, w, h, shape_hint = trace_image(image_b64)
    review = ai_review(image_b64, points, lines, circles)
    points, lines, circles, constraints, notes, scale, suggested_dimensions = build_sketch(
        points, lines, circles, review, w, h, shape_hint
    )
    return {
        "points": points,
        "lines": lines,
        "circles": circles,
        "constraints": constraints,
        "ai_used": review is not None,
        "notes": notes,
        "entity_count": {"points": len(points), "lines": len(lines), "circles": len(circles)},
        "image_width": w,
        "image_height": h,
        "scale": scale,
        "suggested_dimensions": suggested_dimensions,
    }
