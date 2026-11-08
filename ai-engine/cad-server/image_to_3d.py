"""faelyx.AI — Image to 3D. Two engines: TripoSR (fast draft) and Hunyuan3D 2.1 (best quality, slow).

Copyright (c) 2026 faelyx.AI. Licensed under the faelyx.AI Image to 3D Module License
(LICENSE-faelyx-image-to-3d.md). The TripoSR model code in ./tsr is © 2024 Tripo AI & Stability AI,
MIT License, and keeps its own notice (tsr/LICENSE-TripoSR, tsr/THIRD_PARTY_NOTICES.md).

A single picture goes in; a triangle mesh with vertex colours comes out — the same feed-forward
pipeline as the TripoSR reference app (https://github.com/VAST-AI-Research/TripoSR), running on this
computer. No outside service, no key.

Pipeline (the same steps as TripoSR's run.py / gradio_app.py)
  1. decode        PNG / JPG / WebP (EXIF-rotated, capped at 2048 px)
  2. preprocess    remove the background (rembg, or the picture's own transparency), crop to the object,
                   resize it to the "foreground ratio" and put it on a mid-grey square — what the model saw
                   in training. Optional: skip all of that when the picture is already prepared.
  3. TripoSR       image → DINO tokens → transformer → triplane scene codes (tsr.system.TSR)
  4. mesh          marching cubes through the triplane's density field, vertex colours from the colour field
  5. clean         weld vertices, drop degenerate faces, fix winding, cap the face count for the viewport
  6. finish        orientation, uniform scale to the size you ask for, placement; STL / PLY / OBJ / GLB out
  7. check         vertices / faces / size / volume and a printability test

Hardware: an NVIDIA GPU is strongly recommended (a few seconds per model, about 6 GB of VRAM at the
default settings; "Low memory" lowers that). Without one it runs on the CPU in a few minutes.

First run: the model weights (stabilityai/TripoSR, about 1.7 GB, MIT) are downloaded once from Hugging
Face into ./triposr_models (override with FAELYX_MODELS_DIR). To use weights you already have, point
FAELYX_TRIPOSR_MODEL at a folder that holds config.yaml and model.ckpt — nothing is downloaded then.

Python packages: see requirements-triposr.txt. The CAD server starts without them; Image to 3D simply
reports what is missing (GET /image_to_3d/status).

Second engine — Hunyuan3D 2.1 (Tencent): a much larger two-stage model (3.3B-parameter shape model, then an optional PBR colour
model). It runs in its own Python 3.10 environment as a child process — see hunyuan3d.py, hunyuan3d_worker/worker.py and
setup_hunyuan3d.bat — and is used under the Tencent Hunyuan 3D 2.1 Community License (NOTICE-hunyuan3d.txt). It is slow on small GPUs
(minutes, not seconds) but its geometry is far closer to commercial services than the open TripoSR draft model.

Jobs run in a background thread; the frontend polls /image_to_3d/jobs/{id}. The mesh stays in memory
until the job is deleted (or pushed out by newer ones) — once the frontend has added it as a Mesh Body
it keeps its own copy.
"""
import base64
import importlib.util
import io
import json
import math
import os
import struct
import sys
import threading
import time
import traceback
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import numpy as np
from pydantic import BaseModel

MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_IMAGE_SIDE = 2048
MAX_JOBS_KEPT = 6
MAX_MC_RESOLUTION = 512            # high-detail extraction (tsr/faelyx_mesh.py); TripoSR's own extractor stays capped at 320
DEFAULT_MC_RESOLUTION = 384
POLISH_LEVELS = ("off", "standard", "strong")

ENGINE_ID = "triposr"
ENGINE_NAME = "TripoSR"
MODEL_REPO = "stabilityai/TripoSR"
CONFIG_NAME = "config.yaml"
WEIGHT_NAME = "model.ckpt"
# TripoSR's image tokenizer also reads this repo's (tiny) config.json when the model is built.
DINO_REPO = "facebook/dino-vitb16"
WEIGHTS_BYTES = 1_700_000_000          # model.ckpt is about 1.68 GB — only used for the progress bar
FACE_CAPS = {"low": 20000, "medium": 60000, "high": 150000, "ultra": 400000, "full": 0}
CHUNK_SIZES = {"standard": 8192, "low": 2048}
ENGINES = ("triposr", "hunyuan")
CUTOUT_MODELS = ("u2net", "isnet-general-use", "birefnet-general")   # rembg models: standard / sharper edges / finest (larger download)
PIECES = ("all", "bits", "largest")     # loose pieces: keep everything / drop tiny bits / keep only the biggest
FINISH_DEFAULTS = {"faces": "high", "smooth": 0, "sharp": True, "pieces": "all", "fill": False}

HERE = Path(__file__).resolve().parent
MODELS_DIR = Path(os.environ.get("FAELYX_MODELS_DIR") or HERE / "triposr_models")
# Keep the Hugging Face cache inside the project unless the user has pointed it somewhere themselves.
if not any(os.environ.get(k) for k in ("HF_HUB_CACHE", "HUGGINGFACE_HUB_CACHE", "HF_HOME")):
    os.environ["HF_HUB_CACHE"] = str(MODELS_DIR / "hf")

# (importable module, pip package) — everything TripoSR's code imports at start-up
REQUIRED = [
    ("torch", "torch"), ("einops", "einops"), ("omegaconf", "omegaconf"), ("transformers", "transformers"),
    ("trimesh", "trimesh"), ("rembg", "rembg"), ("onnxruntime", "onnxruntime"), ("imageio", "imageio"),
    ("huggingface_hub", "huggingface-hub"), ("PIL", "Pillow"), ("skimage", "scikit-image"),
]
INSTALL_HINT = "pip install -r requirements-triposr.txt"


# ----------------------------------------------------------------------------
# Mesh
# ----------------------------------------------------------------------------
@dataclass
class Mesh:
    verts: np.ndarray                 # (N, 3) float64
    faces: np.ndarray                 # (M, 3) int64, counter-clockwise seen from outside
    colors: Optional[np.ndarray] = None   # (N, 3) uint8 or None

    def copy(self) -> "Mesh":
        return Mesh(self.verts.copy(), self.faces.copy(), None if self.colors is None else self.colors.copy())


def signed_volume(m: Mesh) -> float:
    if len(m.faces) == 0:
        return 0.0
    a, b, c = m.verts[m.faces[:, 0]], m.verts[m.faces[:, 1]], m.verts[m.faces[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def clean_mesh(m: Mesh) -> Mesh:
    """Weld coincident vertices, drop degenerate/duplicate faces and unused
    vertices, and make the winding point outward (positive volume)."""
    v, f = m.verts, m.faces
    if len(f) == 0:
        return Mesh(v[:0], f[:0], None)
    ext = float(np.max(v.max(0) - v.min(0))) or 1.0
    q = np.round(v / (ext * 1e-7)).astype(np.int64)
    _, first, inverse = np.unique(q, axis=0, return_index=True, return_inverse=True)
    inverse = np.asarray(inverse).reshape(-1)
    v2 = v[first]
    c2 = None if m.colors is None else m.colors[first]
    f2 = inverse[f]
    ok = (f2[:, 0] != f2[:, 1]) & (f2[:, 1] != f2[:, 2]) & (f2[:, 0] != f2[:, 2])
    f2 = f2[ok]
    area2 = np.linalg.norm(np.cross(v2[f2[:, 1]] - v2[f2[:, 0]], v2[f2[:, 2]] - v2[f2[:, 0]]), axis=1)
    f2 = f2[area2 > (ext * 1e-9) ** 2]
    # duplicate faces (same three vertices in any order)
    if len(f2):
        key = np.sort(f2, axis=1)
        _, keep = np.unique(key, axis=0, return_index=True)
        f2 = f2[np.sort(keep)]
    used = np.zeros(len(v2), bool)
    used[f2.reshape(-1)] = True
    remap = -np.ones(len(v2), np.int64)
    remap[used] = np.arange(int(used.sum()))
    out = Mesh(v2[used], remap[f2], None if c2 is None else c2[used])
    if signed_volume(out) < 0:
        out.faces = out.faces[:, ::-1].copy()
    return out


def _quadric(m: Mesh, max_faces: int) -> Optional[Mesh]:
    """Quadric edge-collapse down to `max_faces` with the optional `fast-simplification` package (pip install fast-simplification).
    It keeps edges and thin features far better than grid clustering. Returns None when the package is missing or the result looks wrong,
    so the caller falls back to clustering. Colours (if any) are copied from the nearest original vertex."""
    try:
        import fast_simplification as fs
    except ImportError:
        return None
    try:
        reduction = min(0.99, max(0.01, 1.0 - float(max_faces) / float(len(m.faces))))
        v, f = fs.simplify(m.verts.astype(np.float32), m.faces.astype(np.int32), target_reduction=reduction)
        f = np.asarray(f, dtype=np.int64)
        v = np.asarray(v, dtype=np.float64)
        if len(f) == 0 or len(f) > max_faces * 1.3:
            return None
        colors = None
        if m.colors is not None:
            from scipy.spatial import cKDTree
            _d, idx = cKDTree(m.verts).query(v)
            colors = m.colors[idx]
        out = clean_mesh(Mesh(v, f, colors))
        v0 = signed_volume(m)
        if len(out.faces) == 0 or (abs(v0) > 0 and not (0.85 < signed_volume(out) / v0 < 1.15)):
            return None                  # shape changed too much (collapsed or inverted) — do not trust it
        return out
    except Exception:  # noqa: BLE001
        return None


def decimate_mesh(m: Mesh, max_faces: int) -> Mesh:
    """Brings a heavy mesh (the high-detail extractor writes up to ~700 000 triangles) down to about `max_faces`.
    First choice is quadric edge-collapse (see _quadric); without it, vertices are clustered on a grid (colours averaged), then cleaned —
    that is the old behaviour and rounds off small detail. Used only when the mesh is over the cap."""
    if max_faces <= 0 or len(m.faces) <= max_faces:
        return m
    q = _quadric(m, max_faces)
    if q is not None:
        return q
    v = m.verts
    lo, hi = v.min(0), v.max(0)
    ext = float(np.max(hi - lo)) or 1.0

    def cluster(cells: float):
        q = np.floor((v - lo) / (ext / cells)).astype(np.int64)
        key = (q[:, 0] * 100003 + q[:, 1]) * 100019 + q[:, 2]
        uk, inv = np.unique(key, return_inverse=True)
        inv = np.asarray(inv).reshape(-1)
        f = inv[m.faces]
        ok = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
        return uk, inv, f[ok]

    a, b = 8.0, 2048.0
    best = None
    for _ in range(14):
        mid = math.sqrt(a * b)
        uk, inv, f = cluster(mid)
        if len(f) <= max_faces:
            best, a = (uk, inv, f), mid
        else:
            b = mid
        if b / a < 1.03:
            break
    if best is None:
        best = cluster(a)
    uk, inv, f = best
    cnt = np.bincount(inv, minlength=len(uk)).astype(np.float64)
    nv = np.zeros((len(uk), 3))
    for k in range(3):
        nv[:, k] = np.bincount(inv, weights=v[:, k], minlength=len(uk)) / cnt
    nc = None
    if m.colors is not None:
        nc = np.zeros((len(uk), 3))
        for k in range(3):
            nc[:, k] = np.bincount(inv, weights=m.colors[:, k].astype(np.float64), minlength=len(uk)) / cnt
        nc = (nc + 0.5).astype(np.uint8)
    return clean_mesh(Mesh(nv, f, nc))


# ----------------------------------------------------------------------------
# Finishing: loose pieces, smoothing, hole filling. These run on the finished mesh (not on the model),
# so changing them in the panel re-applies instantly without running TripoSR again.
# ----------------------------------------------------------------------------
def _compact(m: Mesh, faces: np.ndarray) -> Mesh:
    used = np.zeros(len(m.verts), bool)
    used[faces.reshape(-1)] = True
    remap = -np.ones(len(m.verts), np.int64)
    remap[used] = np.arange(int(used.sum()))
    return Mesh(m.verts[used], remap[faces], None if m.colors is None else m.colors[used])


def _vertex_graph(faces: np.ndarray, n: int):
    from scipy import sparse
    i = np.concatenate([faces[:, 0], faces[:, 1], faces[:, 2]])
    j = np.concatenate([faces[:, 1], faces[:, 2], faces[:, 0]])
    a = sparse.coo_matrix((np.ones(len(i)), (i, j)), shape=(n, n)).tocsr()
    a = a + a.T
    a.data[:] = 1.0                                   # simple graph: one edge per neighbour, whatever the multiplicity
    return a


def remove_pieces(m: Mesh, mode: str = "bits", min_fraction: float = 0.02) -> Mesh:
    """Drops loose pieces ("floaters"). mode 'largest' keeps only the biggest piece; 'bits' keeps every piece
    that has at least `min_fraction` of the biggest piece's faces."""
    if mode == "all" or len(m.faces) == 0:
        return m
    from scipy.sparse.csgraph import connected_components
    _, lab = connected_components(_vertex_graph(m.faces, len(m.verts)), directed=False)
    face_lab = lab[m.faces[:, 0]]
    counts = np.bincount(face_lab, minlength=int(lab.max()) + 1)
    if mode == "largest":
        keep = counts == counts.max()
        keep &= np.cumsum(keep) == 1                   # a tie keeps just one
    else:
        keep = counts >= max(1.0, float(counts.max()) * min_fraction)
    if keep.all():
        return m
    return _compact(m, m.faces[keep[face_lab]])


def _edge_table(faces: np.ndarray, n: int):
    directed = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    und = np.sort(directed, axis=1)
    key = und[:, 0].astype(np.int64) * n + und[:, 1]
    uk, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    return directed, np.asarray(inv).reshape(-1), cnt


def smooth_mesh(m: Mesh, passes: int, keep_sharp: bool = True, sharp_deg: float = 40.0) -> Mesh:
    """Taubin smoothing (shrink / un-shrink, so the volume is kept) with `passes` rounds. Vertices on an open
    border stay put, and with `keep_sharp` so do the vertices along creases sharper than `sharp_deg`,
    which keeps edges of hard-surface objects crisp while the noisy flat areas get smooth."""
    passes = int(passes)
    if passes <= 0 or len(m.faces) == 0:
        return m
    from scipy import sparse
    n = len(m.verts)
    v = m.verts.astype(np.float64).copy()
    adj = _vertex_graph(m.faces, n)
    deg = np.asarray(adj.sum(axis=1)).reshape(-1)
    deg[deg == 0] = 1.0
    walk = sparse.diags(1.0 / deg) @ adj               # average of the neighbours

    pinned = np.zeros(n, bool)
    directed, inv, cnt = _edge_table(m.faces, n)
    border = cnt[inv] == 1                             # edges used by one face only
    pinned[directed[border].reshape(-1)] = True
    if keep_sharp:
        f = m.faces
        nrm = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
        ln = np.linalg.norm(nrm, axis=1)
        nrm = nrm / np.where(ln > 0, ln, 1.0)[:, None]
        face_of = np.concatenate([np.arange(len(f))] * 3)
        order = np.argsort(inv, kind="stable")
        inv_s, face_s, dir_s = inv[order], face_of[order], directed[order]
        first = np.r_[True, inv_s[1:] != inv_s[:-1]]
        idx = np.flatnonzero(first)
        two = (np.diff(np.r_[idx, len(inv_s)]) == 2)
        a = idx[two]
        dots = np.einsum("ij,ij->i", nrm[face_s[a]], nrm[face_s[a + 1]])
        sharp_edge = dots < math.cos(math.radians(sharp_deg))
        pinned[dir_s[a[sharp_edge]].reshape(-1)] = True
    free = (~pinned).astype(np.float64)[:, None]

    lam, mu = 0.5, -0.53
    for _ in range(passes):
        v += lam * free * (walk @ v - v)
        v += mu * free * (walk @ v - v)
    return Mesh(v, m.faces, m.colors)


def fill_holes(m: Mesh, max_fraction: float = 0.5) -> Mesh:
    """Closes open borders with a fan around each hole's centre, so a mesh with a few gaps becomes watertight
    (printable). Borders longer than `max_fraction` of all edges are left alone — that is a cut, not a hole."""
    if len(m.faces) == 0:
        return m
    from scipy import sparse
    from scipy.sparse.csgraph import connected_components
    n = len(m.verts)
    directed, inv, cnt = _edge_table(m.faces, n)
    border = directed[cnt[inv] == 1]
    if len(border) == 0 or len(border) > max_fraction * len(directed):
        return m
    g = sparse.coo_matrix((np.ones(len(border)), (border[:, 0], border[:, 1])), shape=(n, n))
    _, lab = connected_components(g, directed=False)
    loop = lab[border[:, 0]]
    ids, loop = np.unique(loop, return_inverse=True)
    loop = np.asarray(loop).reshape(-1)
    k = len(ids)
    cx = np.zeros((k, 3))
    cc = np.zeros(k)
    for ax in range(3):
        cx[:, ax] = np.bincount(loop, weights=m.verts[border[:, 0], ax], minlength=k)
    cc = np.bincount(loop, minlength=k).astype(np.float64)
    cx /= cc[:, None]
    new_verts = np.vstack([m.verts, cx])
    centre = n + loop
    # the border half-edge a->b belongs to an existing face, so the cap uses b->a
    caps = np.column_stack([border[:, 1], border[:, 0], centre])
    colors = m.colors
    if colors is not None:
        cm = np.zeros((k, 3))
        for ax in range(3):
            cm[:, ax] = np.bincount(loop, weights=colors[border[:, 0], ax].astype(np.float64), minlength=k)
        colors = np.vstack([colors, (cm / cc[:, None] + 0.5).astype(np.uint8)])
    return Mesh(new_verts, np.vstack([m.faces, caps]), colors)


def clean_finish(o: Optional[dict]) -> dict:
    o = o or {}
    d = FINISH_DEFAULTS
    try:
        smooth = int(round(float(o.get("smooth", d["smooth"]))))
    except (TypeError, ValueError):
        smooth = d["smooth"]
    faces = o.get("faces", d["faces"])
    pieces = o.get("pieces", d["pieces"])
    return {"faces": faces if faces in FACE_CAPS else d["faces"], "smooth": min(30, max(0, smooth)),
            "sharp": _truthy(o.get("sharp", d["sharp"])), "pieces": pieces if pieces in PIECES else d["pieces"],
            "fill": _truthy(o.get("fill", d["fill"]))}


def _truthy(v) -> bool:
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "yes", "on")
    return bool(v)


def finish_mesh(base: Mesh, f: dict, lod: bool = False) -> Mesh:
    """Order matters: loose pieces first (they would skew the smoothing), smoothing on the full-detail mesh,
    then the face cap (which also rounds off what is left), then hole filling on the lighter mesh."""
    m = remove_pieces(base, f["pieces"])
    m = smooth_mesh(m, f["smooth"], f["sharp"])
    cap = FACE_CAPS[f["faces"]]
    m = decimate_mesh(m, int(cap * 1.15) if (lod and cap) else cap)      # a level of detail made by quadric collapse is already at the cap
    if f["fill"]:
        m = fill_holes(m)
    return m


def mesh_stats(m: Mesh) -> dict:
    """Size, volume and printability of a mesh (in the mesh's own units)."""
    if len(m.faces) == 0:
        return {"vertices": 0, "faces": 0, "size": [0, 0, 0], "volume": 0.0, "area": 0.0,
                "closed": False, "non_manifold_edges": 0, "printable": False}
    v, f = m.verts, m.faces
    size = (v.max(0) - v.min(0)).tolist()
    tri = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    area = float(np.linalg.norm(tri, axis=1).sum() / 2.0)
    volume = signed_volume(m)
    directed = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    undirected = np.sort(directed, axis=1)
    n = len(v)
    ukey = undirected[:, 0].astype(np.int64) * n + undirected[:, 1]
    _, counts = np.unique(ukey, return_counts=True)
    bad = int((counts != 2).sum())
    dkey = directed[:, 0].astype(np.int64) * n + directed[:, 1]
    consistent = len(np.unique(dkey)) == len(dkey)   # no edge is used in the same direction twice
    closed = bad == 0 and consistent
    return {
        "vertices": int(len(v)), "faces": int(len(f)), "size": [float(s) for s in size],
        "volume": float(volume), "area": area, "closed": bool(closed),
        "non_manifold_edges": bad, "printable": bool(closed and volume > 0),
    }


def orient_mesh(m: Mesh, up: str = "z", spin: float = 0.0) -> Mesh:
    """Rotate so the model stands on +Z: `up` says which axis of the engine's
    output points up; `spin` then turns it about Z (degrees)."""
    v = m.verts
    if up == "y":
        v = np.column_stack([v[:, 0], -v[:, 2], v[:, 1]])
    elif up == "-y":
        v = np.column_stack([v[:, 0], v[:, 2], -v[:, 1]])
    elif up == "-z":
        v = np.column_stack([v[:, 0], -v[:, 1], -v[:, 2]])
    elif up == "x":
        v = np.column_stack([-v[:, 2], v[:, 1], v[:, 0]])
    elif up == "-x":
        v = np.column_stack([v[:, 2], v[:, 1], -v[:, 0]])
    if spin % 360:
        a = math.radians(spin)
        c, s = math.cos(a), math.sin(a)
        v = np.column_stack([v[:, 0] * c - v[:, 1] * s, v[:, 0] * s + v[:, 1] * c, v[:, 2]])
    return Mesh(np.ascontiguousarray(v, dtype=np.float64), m.faces, m.colors)


def place_mesh(m: Mesh, size_mm: float, place: str = "ground") -> Mesh:
    """Uniform scale so the longest side is `size_mm`, then placed: 'ground'
    centres X/Y and rests the lowest point on Z = 0, 'center' centres the
    bounding box on the origin, 'keep' leaves the position alone."""
    v = m.verts
    lo, hi = v.min(0), v.max(0)
    longest = float(np.max(hi - lo)) or 1.0
    k = size_mm / longest
    v = v * k
    lo, hi = lo * k, hi * k
    if place == "ground":
        v = v - np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
    elif place == "center":
        v = v - (lo + hi) / 2
    return Mesh(v, m.faces, m.colors)


# ----------------------------------------------------------------------------
# Writers: STL / PLY / OBJ / GLB
# ----------------------------------------------------------------------------
def to_stl(m: Mesh) -> bytes:
    f = m.faces
    tri = m.verts[f].astype(np.float32)                         # (M, 3, 3)
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    n = np.where(ln > 0, n / np.where(ln > 0, ln, 1), 0).astype(np.float32)
    rec = np.zeros(len(f), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    rec["n"], rec["v"] = n, tri
    header = b"faelyx.AI Image to 3D".ljust(80, b"\0")
    return header + np.uint32(len(f)).astype("<u4").tobytes() + rec.tobytes()


def to_ply(m: Mesh) -> bytes:
    n, nf = len(m.verts), len(m.faces)
    has_c = m.colors is not None
    props = "property float x\nproperty float y\nproperty float z\n" + ("property uchar red\nproperty uchar green\nproperty uchar blue\n" if has_c else "")
    header = ("ply\nformat binary_little_endian 1.0\ncomment faelyx.AI Image to 3D\n"
              f"element vertex {n}\n{props}element face {nf}\nproperty list uchar int vertex_indices\nend_header\n").encode()
    vd = [("x", "<f4"), ("y", "<f4"), ("z", "<f4")] + ([("r", "u1"), ("g", "u1"), ("b", "u1")] if has_c else [])
    vr = np.zeros(n, dtype=vd)
    vr["x"], vr["y"], vr["z"] = m.verts[:, 0], m.verts[:, 1], m.verts[:, 2]
    if has_c:
        vr["r"], vr["g"], vr["b"] = m.colors[:, 0], m.colors[:, 1], m.colors[:, 2]
    fr = np.zeros(nf, dtype=[("n", "u1"), ("i", "<i4", 3)])
    fr["n"], fr["i"] = 3, m.faces
    return header + vr.tobytes() + fr.tobytes()


def to_obj(m: Mesh) -> bytes:
    """Wavefront OBJ with per-vertex colours (the common `v x y z r g b` extension)."""
    out = io.StringIO()
    out.write("# faelyx.AI Image to 3D\n")
    if m.colors is not None:
        c = m.colors.astype(np.float64) / 255.0
        for p, k in zip(m.verts, c):
            out.write(f"v {p[0]:.6f} {p[1]:.6f} {p[2]:.6f} {k[0]:.4f} {k[1]:.4f} {k[2]:.4f}\n")
    else:
        for p in m.verts:
            out.write(f"v {p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n")
    for t in m.faces + 1:
        out.write(f"f {t[0]} {t[1]} {t[2]}\n")
    return out.getvalue().encode()


def to_glb(m: Mesh) -> bytes:
    """Binary glTF 2.0 with vertex colours. The mesh is Z-up (CAD); glTF is Y-up, so it is turned
    a quarter about X on the way out (a rotation, so the winding is untouched)."""
    pos = np.column_stack([m.verts[:, 0], m.verts[:, 2], -m.verts[:, 1]]).astype("<f4")
    idx = m.faces.astype("<u4")
    blobs, views, accessors = [], [], []

    def add(data: bytes, target: int) -> int:
        off = sum(len(b) for b in blobs)
        blobs.append(data + b"\0" * (-len(data) % 4))
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
        return len(views) - 1

    vi = add(pos.tobytes(), 34962)
    accessors.append({"bufferView": vi, "componentType": 5126, "count": int(len(pos)), "type": "VEC3",
                      "min": pos.min(0).astype(float).tolist(), "max": pos.max(0).astype(float).tolist()})
    attrs = {"POSITION": 0}
    if m.colors is not None:
        rgba = np.hstack([m.colors, np.full((len(m.colors), 1), 255, np.uint8)]).astype("u1")
        ci = add(rgba.tobytes(), 34962)
        accessors.append({"bufferView": ci, "componentType": 5121, "normalized": True, "count": int(len(rgba)), "type": "VEC4"})
        attrs["COLOR_0"] = 1
    ii = add(idx.tobytes(), 34963)
    accessors.append({"bufferView": ii, "componentType": 5125, "count": int(idx.size), "type": "SCALAR"})
    prim = {"attributes": attrs, "indices": len(accessors) - 1, "material": 0, "mode": 4}
    gltf = {
        "asset": {"version": "2.0", "generator": "faelyx.AI Image to 3D"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [prim]}],
        "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.0, "roughnessFactor": 0.8}, "doubleSided": True}],
        "buffers": [{"byteLength": sum(len(b) for b in blobs)}], "bufferViews": views, "accessors": accessors,
    }
    j = json.dumps(gltf, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    binary = b"".join(blobs)
    total = 12 + 8 + len(j) + 8 + len(binary)
    return (struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(j), b"JSON") + j
            + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


# ----------------------------------------------------------------------------
# Image decoding
# ----------------------------------------------------------------------------
def decode_image(data) -> tuple:
    """Data URL / base64 string / bytes → (rgb uint8 HxWx3, alpha uint8 HxW or None)."""
    if isinstance(data, str):
        s = data.strip()
        if s.startswith("data:"):
            s = s.split(",", 1)[1] if "," in s else ""
        try:
            raw = base64.b64decode(s)
        except Exception:
            raise ValueError("The image is not valid base64 data.")
    else:
        raw = bytes(data)
    if not raw:
        raise ValueError("The image is empty.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise ValueError(f"The image is larger than {MAX_IMAGE_BYTES // (1024 * 1024)} MB — use a smaller file.")
    rgb = alpha = None
    try:
        from PIL import Image, ImageOps
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
        has_a = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if has_a else "RGB")
        a = np.asarray(im)
        rgb = a[..., :3].copy()
        alpha = a[..., 3].copy() if has_a else None
    except Exception:
        rgb = alpha = None
    if rgb is None:
        try:
            import cv2
            img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_UNCHANGED)
        except Exception:
            img = None
        if img is None:
            raise ValueError("Could not read that image — use a PNG, JPG or WebP file.")
        if img.dtype != np.uint8:
            img = (img.astype(np.float64) / (256.0 if img.dtype == np.uint16 else 1.0)).clip(0, 255).astype(np.uint8)
        if img.ndim == 2:
            img = np.stack([img] * 3, axis=-1)
        if img.shape[2] == 4:
            alpha = img[..., 3].copy()
            img = img[..., :3]
        rgb = np.ascontiguousarray(img[..., ::-1])
    h, w = rgb.shape[:2]
    if min(h, w) < 8:
        raise ValueError("The image is too small.")
    if max(h, w) > MAX_IMAGE_SIDE:
        from PIL import Image
        k = MAX_IMAGE_SIDE / max(h, w)
        size = (max(8, int(w * k)), max(8, int(h * k)))
        rgb = np.asarray(Image.fromarray(rgb).resize(size, Image.LANCZOS))
        if alpha is not None:
            alpha = np.asarray(Image.fromarray(alpha).resize(size, Image.LANCZOS))
    return rgb, alpha


def _png_bytes(img) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ----------------------------------------------------------------------------
# What this computer has: packages, GPU, weights
# ----------------------------------------------------------------------------
def missing_packages() -> list:
    """Packages TripoSR needs that cannot be found (checked without importing them)."""
    out = []
    for mod, pip in REQUIRED:
        try:
            found = importlib.util.find_spec(mod) is not None
        except (ImportError, ValueError):   # e.g. a module without a __spec__ — it is loaded, so it is there
            found = mod in sys.modules
        if not found:
            out.append({"module": mod, "pip": pip})
    return out


_HW_CACHE: dict = {}


def hardware() -> dict:
    """torch version and the compute device TripoSR will use. Imports torch (slow the first time)."""
    if _HW_CACHE:
        return _HW_CACHE
    info = {"torch": None, "device": "cpu", "device_name": "CPU", "vram_gb": None, "cuda": False}
    if importlib.util.find_spec("torch") is not None:
        try:
            import torch
            info["torch"] = str(torch.__version__)
            if torch.cuda.is_available():
                p = torch.cuda.get_device_properties(0)
                info.update(device="cuda:0", device_name=p.name, vram_gb=round(p.total_memory / 1024 ** 3, 1), cuda=True)
        except Exception as e:  # noqa: BLE001 — a broken torch install is reported, not raised
            info["error"] = f"{type(e).__name__}: {e}"
    _HW_CACHE.update(info)
    return _HW_CACHE


def model_source() -> str:
    """Local folder from FAELYX_TRIPOSR_MODEL, else the Hugging Face repo id."""
    return os.environ.get("FAELYX_TRIPOSR_MODEL", "").strip() or MODEL_REPO


def _local_model_dir() -> Optional[Path]:
    src = model_source()
    return Path(src) if src != MODEL_REPO and os.path.isdir(src) else None


def _hf_cache_dir() -> Path:
    try:
        from huggingface_hub import constants
        return Path(constants.HF_HUB_CACHE)
    except Exception:  # noqa: BLE001
        return Path(os.environ.get("HF_HUB_CACHE") or MODELS_DIR / "hf")


def _cached(repo: str, name: str) -> bool:
    try:
        from huggingface_hub import try_to_load_from_cache
        return isinstance(try_to_load_from_cache(repo, name), str)
    except Exception:  # noqa: BLE001
        return False


def weights_ready() -> bool:
    local = _local_model_dir()
    if local is not None:
        return (local / CONFIG_NAME).is_file() and (local / WEIGHT_NAME).is_file() and _cached(DINO_REPO, "config.json")
    return _cached(MODEL_REPO, CONFIG_NAME) and _cached(MODEL_REPO, WEIGHT_NAME) and _cached(DINO_REPO, "config.json")


def _dir_bytes(p: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(p):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


# ---- weight download ---------------------------------------------------------
_DL: dict = {"state": "idle", "error": None, "base": 0, "thread": None}
_DL_LOCK = threading.Lock()


def _download_worker():
    try:
        from huggingface_hub import hf_hub_download
        if _local_model_dir() is None:
            hf_hub_download(MODEL_REPO, CONFIG_NAME)
        hf_hub_download(DINO_REPO, "config.json")
        if _local_model_dir() is None:
            hf_hub_download(MODEL_REPO, WEIGHT_NAME)
        _DL.update(state="done", error=None)
    except Exception as e:  # noqa: BLE001 — shown to the user
        traceback.print_exc()
        _DL.update(state="error", error=f"{type(e).__name__}: {e}")


def start_download() -> None:
    """Starts (once) the background download of the TripoSR files that are not on disk yet."""
    with _DL_LOCK:
        t = _DL.get("thread")
        if t is not None and t.is_alive():
            return
        if weights_ready():
            _DL.update(state="done", error=None)
            return
        _DL.update(state="running", error=None, base=_dir_bytes(_hf_cache_dir()))
        t = threading.Thread(target=_download_worker, daemon=True)
        _DL["thread"] = t
        t.start()


def weights_status() -> dict:
    ready = weights_ready()
    state = "ready" if ready else {"running": "downloading", "error": "error"}.get(_DL["state"], "missing")
    pct = 100.0 if ready else 0.0
    done_mb = 0.0
    if state == "downloading":
        got = max(0, _dir_bytes(_hf_cache_dir()) - int(_DL.get("base", 0)))
        done_mb = got / 1e6
        pct = min(99.0, 100.0 * got / WEIGHTS_BYTES)
    local = _local_model_dir()
    return {"state": state, "percent": round(pct, 1), "downloaded_mb": round(done_mb), "total_mb": round(WEIGHTS_BYTES / 1e6),
            "error": _DL.get("error") if state == "error" else None,
            "folder": str(local if local is not None else _hf_cache_dir()), "source": model_source(),
            "files": [CONFIG_NAME, WEIGHT_NAME]}


def _remote_api():
    """hunyuan3d.py holds the Colab connection both engines share; None if that module cannot be imported."""
    try:
        import hunyuan3d as hy
        return hy
    except Exception:  # noqa: BLE001
        return None


def triposr_remote_on() -> bool:
    hy = _remote_api()
    return bool(hy and hy.remote_enabled("triposr"))


_NO_WEIGHTS = {"state": "missing", "percent": 0, "downloaded_mb": 0, "total_mb": round(WEIGHTS_BYTES / 1e6), "error": None, "folder": "", "source": MODEL_REPO,
               "files": [CONFIG_NAME, WEIGHT_NAME]}


def engine_status() -> dict:
    missing = missing_packages()
    hy = _remote_api()
    rc = hy.remote_config() if hy else None
    on = triposr_remote_on()
    remote = {"configured": bool(rc), "enabled": on, "url": rc.get("url", "") if rc else "", "reachable": None, "error": None}
    where = "local"
    weights = None
    if on:
        # TripoSR runs on the Colab GPU: this computer only cuts the picture out, so only those packages matter, and the GPU and
        # the weights are the Colab machine's.
        where = "remote"
        missing = [m for m in missing if m["module"] in ("PIL", "rembg", "onnxruntime")]
        h = hy.remote_health()
        t = h.get("triposr") if isinstance(h.get("triposr"), dict) else None
        err = None
        if h.get("_error"):
            remote.update(reachable=False, error=h["_error"])
            err = h["_error"]
        elif t is None:
            err = ("The Colab session is running an older notebook that cannot make TripoSR models. Upload the new Faelyx_Hunyuan3D_Colab.ipynb "
                   "to Colab, run it, and paste the new connection code.")
            remote.update(reachable=True, error=err)
        elif not t.get("installed"):
            err = " ".join(t.get("reasons") or ["TripoSR is not installed on the Colab machine. Choose “Both” or “TripoSR only” in step 1 of the notebook and run the install cell."])
            remote.update(reachable=True, error=err)
        else:
            remote.update(reachable=True, error=None)
        if t is not None and not err:
            hw = {"torch": t.get("torch"), "device": "cuda:0" if t.get("gpu") else "cpu", "device_name": (t.get("gpu") or "Colab CPU") + " (Google Colab)",
                  "vram_gb": t.get("vram_gb"), "cuda": bool(t.get("gpu"))}
            weights = t.get("weights") if isinstance(t.get("weights"), dict) else dict(_NO_WEIGHTS)
        else:
            hw = {"torch": None, "device": "cpu", "device_name": "Google Colab", "vram_gb": None, "cuda": False, "error": err}
            weights = dict(_NO_WEIGHTS)
    else:
        hw = hardware() if not any(m["module"] == "torch" for m in missing) else {"torch": None, "device": "cpu", "device_name": "CPU", "vram_gb": None, "cuda": False}
    pkgs = " ".join(m["pip"] for m in missing)
    return {
        "engine": {"id": ENGINE_ID, "name": ENGINE_NAME, "license": "MIT", "source": "https://github.com/VAST-AI-Research/TripoSR"},
        "python": sys.version.split()[0],
        "missing": missing, "install": INSTALL_HINT, "install_packages": pkgs,
        "hardware": hw, "weights": weights if weights is not None else weights_status(), "model_loaded": _MODEL is not None and not on,
        "ready": not missing and "error" not in hw,
        "where": where, "remote": remote,
        "features": _tsr_features(on, hy),
        "quadric": importlib.util.find_spec("fast_simplification") is not None,
        "hunyuan": _hunyuan_status(),
    }


def _tsr_features(remote_on: bool, hy) -> list:
    """What the TripoSR runner can do: "hq" = high-detail mesh extraction, "colour" = colour added later on request. The Colab session reports
    its own list (an older notebook reports none, and then makes models the old way)."""
    if remote_on:
        try:
            t = hy.remote_health().get("triposr")
            return list(t.get("features") or []) if isinstance(t, dict) else []
        except Exception:  # noqa: BLE001
            return []
    return ["hq", "colour", "match"]


def _hunyuan_status() -> dict:
    try:
        import hunyuan3d as hy
        return hy.engine_status()
    except Exception as e:  # noqa: BLE001 — never let the second engine break the status of the first
        return {"id": "hunyuan", "name": "Hunyuan3D 2.1", "installed": False, "configured": False, "ready": False,
                "reasons": [f"{type(e).__name__}: {e}"], "texture_ok": False, "texture_missing": [], "setup_command": "setup_hunyuan3d.bat",
                "weights": {"state": "missing", "percent": 0, "downloaded_mb": 0, "total_mb": 0, "error": None, "folder": "", "source": "", "files": []},
                "notice": "", "license_terms": [], "license_url": "", "source": "", "where": "local",
                "remote": {"configured": False, "enabled": False, "url": "", "reachable": None, "error": None}}


# ----------------------------------------------------------------------------
# The model
# ----------------------------------------------------------------------------
_MODEL = None
_MODEL_DEVICE = "cpu"
_MODEL_LOCK = threading.Lock()
_REMBG_SESSIONS: dict = {}


def get_model():
    """Builds TripoSR once (reads the weights from disk) and keeps it for the next picture."""
    global _MODEL, _MODEL_DEVICE
    with _MODEL_LOCK:
        if _MODEL is None:
            from tsr.system import TSR
            device = hardware()["device"]
            model = TSR.from_pretrained(model_source(), config_name=CONFIG_NAME, weight_name=WEIGHT_NAME)
            model.to(device)
            model.eval()
            _MODEL, _MODEL_DEVICE = model, device
        return _MODEL, _MODEL_DEVICE


def _rembg_session(model: str = "u2net"):
    if model not in CUTOUT_MODELS:
        model = "u2net"
    if model not in _REMBG_SESSIONS:
        import rembg
        _REMBG_SESSIONS[model] = rembg.new_session(model)
    return _REMBG_SESSIONS[model]


def _enhance(rgb: np.ndarray) -> np.ndarray:
    """Evens out flat lighting: stretches the tones (clipping 0.5 % at each end) and sharpens a little."""
    from PIL import Image, ImageFilter, ImageOps
    im = ImageOps.autocontrast(Image.fromarray(rgb), cutoff=0.5)
    im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=3))
    return np.asarray(im)


def _shape_mask(alpha: np.ndarray, shift: int, fill: bool) -> np.ndarray:
    """Cut-out edge control: `shift` > 0 grows the object by that many pixels, < 0 shrinks it (loses a halo of
    background colour); `fill` closes holes inside the cut-out (a hollow in the mask, not a real opening)."""
    from PIL import Image, ImageFilter
    out = alpha
    if fill:
        from scipy.ndimage import binary_fill_holes
        solid = binary_fill_holes(out > 127)
        out = np.where(solid & (out <= 127), 255, out).astype(np.uint8)
    if shift:
        size = 2 * abs(int(shift)) + 1
        im = Image.fromarray(out)
        im = im.filter(ImageFilter.MaxFilter(size) if shift > 0 else ImageFilter.MinFilter(size))
        out = np.asarray(im)
    return out


def cutout_rgba(rgb: np.ndarray, alpha: Optional[np.ndarray], remove_background: bool, mask_shift: int = 0, mask_fill: bool = False,
                enhance: bool = False, cutout_model: str = "u2net"):
    """The object cut out of its background, cropped tight, as a PIL RGBA image — what Hunyuan3D is given (it centres and scales it
    itself). Returns (image, how the background was handled)."""
    from PIL import Image
    if enhance:
        rgb = _enhance(rgb)
    has_alpha = alpha is not None and int(alpha.min()) < 255
    src = Image.fromarray(np.dstack([rgb, alpha])) if has_alpha else Image.fromarray(rgb)
    if remove_background and not has_alpha:
        import rembg
        img = rembg.remove(src, session=_rembg_session(cutout_model))
    else:
        img = src.convert("RGBA")
    if remove_background and (mask_shift or mask_fill):
        a = np.array(img)
        a[..., 3] = _shape_mask(a[..., 3], int(mask_shift), bool(mask_fill))
        img = Image.fromarray(a)
    box = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        raise ValueError("No object was found in the picture. Try a clearer picture, or turn off “Remove the background” "
                         "if the picture already shows only the object.")
    how = ("kept as it is" if not remove_background else "the picture's own transparency" if has_alpha else
           "removed by rembg" + ("" if cutout_model == "u2net" else f" ({cutout_model})"))
    if remove_background and (mask_shift or mask_fill):
        how += f", edge {mask_shift:+d} px" if mask_shift else ", holes filled"
    return img.crop(box), how


def _remove_bg(image, session):
    """Same rule as tsr.utils.remove_background (a picture with real transparency is left alone, any other goes through rembg), kept here
    so preparing the picture does not need PyTorch — TripoSR can then run on Google Colab while this computer has none."""
    if image.mode == "RGBA" and image.getextrema()[3][0] < 255:
        return image
    import rembg
    return rembg.remove(image, session=session)


def _resize_fg(image, ratio: float):
    """Same as tsr.utils.resize_foreground: crop to the object, pad to a square, add margin so the object fills `ratio` of the frame."""
    from PIL import Image
    a = np.array(image)
    assert a.shape[-1] == 4
    ys, xs = np.where(a[..., 3] > 0)
    y1, y2, x1, x2 = ys.min(), ys.max(), xs.min(), xs.max()
    fg = a[y1:y2, x1:x2]
    size = max(fg.shape[0], fg.shape[1])
    ph0, pw0 = (size - fg.shape[0]) // 2, (size - fg.shape[1]) // 2
    ph1, pw1 = size - fg.shape[0] - ph0, size - fg.shape[1] - pw0
    sq = np.pad(fg, ((ph0, ph1), (pw0, pw1), (0, 0)), mode="constant", constant_values=0)
    new_size = int(sq.shape[0] / ratio)
    ph0, pw0 = (new_size - size) // 2, (new_size - size) // 2
    ph1, pw1 = new_size - size - ph0, new_size - size - pw0
    return Image.fromarray(np.pad(sq, ((ph0, ph1), (pw0, pw1), (0, 0)), mode="constant", constant_values=0))


def preprocess(rgb: np.ndarray, alpha: Optional[np.ndarray], remove_background: bool, foreground_ratio: float,
               mask_shift: int = 0, mask_fill: bool = False, enhance: bool = False, cutout_model: str = "u2net", return_mask: bool = False):
    """The picture as the model wants it: object centred at `foreground_ratio` of the frame on mid-grey.
    Returns (PIL RGB image, how the background was handled); with return_mask also the object's outline as a uint8 image (255 = object)
    in the same square frame, or None when the picture has no cut-out (Match my picture needs it)."""
    from PIL import Image
    if enhance:
        rgb = _enhance(rgb)
    has_alpha = alpha is not None and int(alpha.min()) < 255
    if remove_background:
        src = Image.fromarray(np.dstack([rgb, alpha])) if has_alpha else Image.fromarray(rgb)
        img = _remove_bg(src, _rembg_session(cutout_model))                   # keeps real transparency, else rembg
        if mask_shift or mask_fill:
            a = np.array(img)
            a[..., 3] = _shape_mask(a[..., 3], int(mask_shift), bool(mask_fill))
            img = Image.fromarray(a)
        try:
            img = _resize_fg(img, foreground_ratio)
        except (ValueError, IndexError):
            raise ValueError("No object was found in the picture. Try a clearer picture, or turn off “Remove the background” "
                             "if the picture already shows only the object.")
        how = "the picture's own transparency" if has_alpha else "removed by rembg" + ("" if cutout_model == "u2net" else f" ({cutout_model})")
        if mask_shift or mask_fill:
            how += f", edge {mask_shift:+d} px" if mask_shift else ", holes filled"
    else:
        img = Image.fromarray(np.dstack([rgb, alpha])) if has_alpha else Image.fromarray(rgb)
        how = "kept as it is"
    arr = np.asarray(img).astype(np.float32) / 255.0
    mask = None
    if arr.ndim == 3 and arr.shape[2] == 4:
        mask = ((arr[:, :, 3] > 0.5) * 255).astype(np.uint8)
        arr = arr[:, :, :3] * arr[:, :, 3:4] + (1.0 - arr[:, :, 3:4]) * 0.5   # fill with grey
    out = Image.fromarray((arr[:, :, :3] * 255.0 + 0.5).astype(np.uint8))
    if out.width != out.height:                                                 # the model sees a square
        s = max(out.size)
        sq = Image.new("RGB", (s, s), (128, 128, 128))
        sq.paste(out, ((s - out.width) // 2, (s - out.height) // 2))
        if mask is not None:
            msq = Image.new("L", (s, s), 0)
            msq.paste(Image.fromarray(mask), ((s - out.width) // 2, (s - out.height) // 2))
            mask = np.asarray(msq)
        out = sq
    return (out, how, mask) if return_mask else (out, how)


def _prep_args(o: dict) -> dict:
    return {"remove_background": o["remove_background"], "foreground_ratio": o["foreground_ratio"],
            "mask_shift": o["mask_shift"], "mask_fill": o["mask_fill"], "enhance": o["enhance"], "cutout_model": o["cutout_model"]}


_PREVIEW_LOCK = threading.Lock()


def preview_picture(image, options: Optional[dict] = None) -> bytes:
    """Only the picture step (cut-out, edge, framing) as a PNG — what the engine will be given — without running the model."""
    missing = [m for m in missing_packages() if m["module"] in ("rembg", "onnxruntime", "PIL")]
    o = clean_options(options or {})
    if o["remove_background"] and missing:
        raise RuntimeError("Removing the background needs: " + ", ".join(m["pip"] for m in missing) + f". Install with: {INSTALL_HINT}")
    rgb, alpha = decode_image(image)
    with _PREVIEW_LOCK:
        if o["engine"] == "hunyuan":
            img, how = cutout_rgba(rgb, alpha, o["remove_background"], o["mask_shift"], o["mask_fill"], o["enhance"], o["cutout_model"])
        else:
            img, how = preprocess(rgb, alpha, **_prep_args(o))
    return _png_bytes(img)


# ----------------------------------------------------------------------------
# Jobs
# ----------------------------------------------------------------------------
Progress = Callable[[float, str], None]


class Job:
    def __init__(self, opts: dict):
        self.id = uuid.uuid4().hex[:12]
        self.engine = opts.get("engine", ENGINE_ID)
        self.opts = opts
        self.status = "queued"          # queued | running | succeeded | failed | cancelled
        self.progress = 0.0
        self.message = "Waiting…"
        self.error: Optional[str] = None
        self.created = time.time()
        self.mesh: Optional[Mesh] = None
        self.cutout: Optional[bytes] = None
        self.mask_method = ""
        self.cancelled = False
        self.full_faces = 0
        self.lods: dict = {}               # Hunyuan: quadric-decimated copies per face cap (low / medium / high)
        self.pbr_path: Optional[Path] = None
        self.note = ""
        self.textured = False
        self.colour_state = "none"         # none | working | done | failed (TripoSR: colour is added on request, after the shape)
        self.colour_message = ""
        self.mask: Optional[np.ndarray] = None   # TripoSR: the cut-out outline (uint8, same frame as the cut-out picture)
        self.codes: Optional[np.ndarray] = None  # TripoSR: the scene code the mesh was made from (so colour added later matches it exactly)
        self.proc = None
        self.device = ""
        self.seconds = 0.0
        self._stats_cache: dict = {}
        self._finish_cache: dict = {}
        self._finish_lock = threading.Lock()

    def set(self, status: str, pct: float, msg: str):
        self.status, self.progress, self.message = status, float(pct), msg

    def check(self):
        if self.cancelled:
            raise InterruptedError()


def clean_options(o: dict) -> dict:
    """What the model run depends on. (Smoothing, loose pieces, hole filling and the face cap are `finish`
    options: they are applied to the finished mesh, so they can change without running the model again.)"""
    def num(key, default, lo, hi):
        try:
            v = float(o.get(key, default))
        except (TypeError, ValueError):
            v = default
        return min(hi, max(lo, v))
    memory = o.get("memory", "standard")
    engine = o.get("engine", "triposr")
    cm = o.get("cutout_model", "u2net")
    hmode = o.get("hy_mode", "auto")
    return {
        "engine": engine if engine in ENGINES else "triposr",
        "cutout_model": cm if cm in CUTOUT_MODELS else "u2net",
        "hy_steps": int(round(num("hy_steps", 50, 10, 100))),
        "hy_guidance": round(num("hy_guidance", 5.0, 1.0, 12.0), 2),
        "hy_octree": int(round(num("hy_octree", 384, 192, 512))),
        "hy_mode": hmode if hmode in ("auto", "full", "balanced", "low") else "auto",
        "hy_texture": "off" if str(o.get("hy_texture", "auto")) == "off" else "auto",
        "hy_tex_views": 8 if int(round(num("hy_tex_views", 6, 6, 8))) >= 8 else 6,
        "hy_tex_res": 768 if int(round(num("hy_tex_res", 512, 512, 768))) >= 768 else 512,
        "hy_seed": int(round(num("hy_seed", 1234, 0, 2 ** 31 - 1))),
        "hy_polish": str(o.get("hy_polish", "standard")) if str(o.get("hy_polish", "standard")) in ("off", "standard", "strong") else "standard",
        "hy_flat_base": _truthy(o.get("hy_flat_base", False)),
        "hy_variants": int(round(num("hy_variants", 1, 1, 4))),
        "remove_background": _truthy(o.get("remove_background", True)),
        "foreground_ratio": round(num("foreground_ratio", 0.85, 0.5, 1.0), 3),
        "mask_shift": int(round(num("mask_shift", 0, -12, 12))),
        "mask_fill": _truthy(o.get("mask_fill", False)),
        "enhance": _truthy(o.get("enhance", False)),
        "mc_resolution": int(round(num("mc_resolution", DEFAULT_MC_RESOLUTION, 32, MAX_MC_RESOLUTION))),
        "polish": str(o.get("polish", "standard")) if str(o.get("polish", "standard")) in POLISH_LEVELS else "standard",
        "flat_base": _truthy(o.get("flat_base", True)),
        "colour": _truthy(o.get("colour", False)),
        "match": str(o.get("match", "off")) if str(o.get("match", "off")) in ("off", "light", "strong") else "off",
        "reads": 5 if int(round(num("reads", 1, 1, 5))) >= 5 else 3 if int(round(num("reads", 1, 1, 5))) >= 3 else 1,
        "colour_smooth": int(round(num("colour_smooth", 2, 0, 6))),
        "threshold": round(num("threshold", 25.0, 5.0, 60.0), 2),
        "memory": memory if memory in CHUNK_SIZES else "standard",
        "up": "y" if engine == "hunyuan" else "z",
    }


def _hunyuan_mesh(parts) -> Mesh:
    v, f, c = parts
    m = Mesh(np.asarray(v, dtype=np.float64), np.asarray(f, dtype=np.int64), None if c is None else np.asarray(c, dtype=np.uint8))
    if len(m.faces) and signed_volume(m) < 0:
        m.faces = m.faces[:, ::-1].copy()
    return m


def _generate_hunyuan(job: Job, rgb: np.ndarray, alpha: Optional[np.ndarray]) -> Mesh:
    """Hunyuan3D 2.1 in its own environment (hunyuan3d.py). The mesh comes back with vertex colours when the colour stage ran."""
    import hunyuan3d as hy
    o = job.opts
    t0 = time.time()
    remote = hy.remote_enabled()
    if not remote and not hy.installed():
        raise RuntimeError("Hunyuan3D 2.1 is not set up on this computer yet. Run setup_hunyuan3d.bat (in the cad-server folder) once, "
                           "restart the backend, then try again — or choose “Google Colab” in the engine box. IMAGE_TO_3D.md has the details.")
    st = hy.engine_status()
    if not st["ready"]:
        raise RuntimeError("Hunyuan3D 2.1 cannot run: " + " ".join(st["reasons"] or ["PyTorch cannot see an NVIDIA GPU."]))
    need = [m for m in missing_packages() if m["module"] in ("PIL", "rembg", "onnxruntime")] if o["remove_background"] else []
    if need:
        raise RuntimeError("Removing the background needs: " + ", ".join(m["pip"] for m in need) + f". Install with: {INSTALL_HINT}")
    job.device = f"{st['gpu'] or 'GPU'} · Hunyuan3D 2.1" + (" · Google Colab" if remote else "")

    job.set("running", 2, "Preparing the picture…")
    image, how = cutout_rgba(rgb, alpha, o["remove_background"], o["mask_shift"], o["mask_fill"], o["enhance"], o["cutout_model"])
    job.mask_method = how
    job.cutout = _png_bytes(image)
    job.check()

    if not hy.weights_ready():
        hy.start_download()
        while not hy.weights_ready():
            job.check()
            w = hy.weights_status()
            if w["state"] == "error":
                raise RuntimeError(f"The Hunyuan3D weights could not be downloaded ({w['error']}). Check the internet connection and the free disk space.")
            if w["state"] == "missing":
                hy.start_download()
            job.set("running", 3 + 4 * w["percent"] / 100.0,
                    f"Downloading the Hunyuan3D weights, first run only — {w['downloaded_mb']:,} of about {w['total_mb']:,} MB…")
            time.sleep(1.0)

    texture = "auto" if (o["hy_texture"] == "auto" and hy.texture_available()) else "off"
    if o["hy_texture"] == "auto" and texture == "off":
        job.note = ("The colour stage is not available on the Colab session (see the notebook's setup cell), so this model has no colour." if remote
                    else "The colour stage is not installed (see setup_hunyuan3d.bat), so this model has no colour.")
    opts = {"steps": o["hy_steps"], "guidance": o["hy_guidance"], "octree": o["hy_octree"], "mode": o["hy_mode"], "texture": texture,
            "tex_views": o["hy_tex_views"], "tex_res": o["hy_tex_res"], "seed": o["hy_seed"],
            "polish": o["hy_polish"], "flat_base": o["hy_flat_base"], "variants": o["hy_variants"],
            "border": round(1.0 - o["foreground_ratio"], 3)}

    def progress(pct, msg):
        job.set("running", 8 + 0.9 * pct, msg)

    def on_process(p):
        job.proc = p

    out = hy.run_model(job.id, _png_bytes(image), opts, progress, lambda: job.cancelled, on_process)
    meta = out["meta"]
    mesh = _hunyuan_mesh(out["final"])
    job.lods = {k: _hunyuan_mesh(v) for k, v in out["lods"].items()}
    job.pbr_path = out["pbr_glb"]
    job.textured = bool(meta.get("textured"))
    notes = [x for x in (job.note, meta.get("texture_note")) if x]
    si = meta.get("shape_info") or {}
    if si.get("polish_note"):
        notes.append(si["polish_note"])
    if int(si.get("variants", 1)) > 1:
        notes.append(f"Made {si['variants']} variants and kept #{si.get('chosen')} (seed {si.get('seed')}), the one whose outline matches your picture best "
                     f"(outline scores {', '.join(f'{x:.2f}' for x in si.get('scores', []))}).")
    job.note = " ".join(dict.fromkeys(notes))
    job.full_faces = int(len(mesh.faces))
    job.seconds = round(time.time() - t0, 1)
    return mesh


def _generate_triposr_remote(job: Job, rgb: np.ndarray, alpha: Optional[np.ndarray]) -> Mesh:
    """TripoSR on the Google Colab session. The picture is prepared here (cut-out, framing — needs no PyTorch), the Colab GPU turns it into
    a mesh, and the result comes back as arrays; cleaning and finishing then happen here like for a local run."""
    import hunyuan3d as hy
    o = job.opts
    t0 = time.time()
    need = [m for m in missing_packages() if m["module"] in (("PIL", "rembg", "onnxruntime") if o["remove_background"] else ("PIL",))]
    if need:
        raise RuntimeError("Preparing the picture needs: " + ", ".join(m["pip"] for m in need) + f". Install with: {INSTALL_HINT}")
    st = engine_status()
    if st["hardware"].get("error"):
        raise RuntimeError(st["hardware"]["error"])
    job.device = f"{st['hardware']['device_name']} · TripoSR"

    job.set("running", 3, "Preparing the picture…")
    image, how, mask = preprocess(rgb, alpha, return_mask=True, **_prep_args(o))
    job.mask_method = how
    job.cutout = _png_bytes(image)
    job.mask = mask
    job.check()
    mask_png = _mask_png(mask) if (mask is not None and o["match"] != "off") else None

    def progress(pct, msg):
        job.set("running", 6 + 0.88 * pct, msg)

    feats = _tsr_features(True, hy)
    if "hq" not in feats:
        job.note = ("The Colab session is running an older notebook, so this model used the standard mesh extraction. Upload the new "
                    "Faelyx_Hunyuan3D_Colab.ipynb to Colab and paste the new connection code for the high-detail mesh and “Add colour later”.")
    try:
        out = hy.run_remote_triposr(job.id, job.cutout, _tsr_options(o), progress, lambda: job.cancelled, mask_png=mask_png)
    finally:
        hy.remove_job_files(job.id)
    job.codes = out.get("codes")
    v, f, c = out["final"]
    job.set("running", 94, "Cleaning the mesh…")
    mesh = clean_mesh(Mesh(np.asarray(v, dtype=np.float64), np.asarray(f, dtype=np.int64), None if c is None else np.asarray(c, dtype=np.uint8)))
    job.full_faces = int(len(mesh.faces))
    job.seconds = round(time.time() - t0, 1)
    note = (out.get("meta") or {}).get("note")
    if note:
        job.note = " ".join(x for x in (job.note, note) if x)
    if mesh.colors is not None:
        job.colour_state = "done"
    return mesh


def _mask_png(mask: np.ndarray) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.fromarray(np.asarray(mask, dtype=np.uint8)).save(buf, format="PNG")
    return buf.getvalue()


def _tsr_options(o: dict, task: str = "shape") -> dict:
    """What the TripoSR runner (local code or the Colab worker) is told."""
    return {"task": task, "mc_resolution": o["mc_resolution"], "threshold": o["threshold"], "memory": o["memory"], "polish": o["polish"],
            "flat_base": bool(o["flat_base"]), "colour": bool(o["colour"]), "colour_smooth": o["colour_smooth"], "match": o["match"], "reads": o["reads"]}


def _generate(job: Job, rgb: np.ndarray, alpha: Optional[np.ndarray]) -> Mesh:
    o = job.opts
    if o.get("engine") == "hunyuan":
        return _generate_hunyuan(job, rgb, alpha)
    if triposr_remote_on():
        return _generate_triposr_remote(job, rgb, alpha)
    t0 = time.time()
    missing = missing_packages()
    if missing:
        raise RuntimeError("TripoSR needs these Python packages: " + ", ".join(m["pip"] for m in missing)
                           + f". Install them (in the environment that runs cad_server.py) with: {INSTALL_HINT}")
    hw = hardware()
    if "error" in hw:
        raise RuntimeError(f"PyTorch could not be loaded: {hw['error']}")
    job.device = hw["device_name"]

    job.set("running", 3, "Preparing the picture…")
    image, how, mask = preprocess(rgb, alpha, return_mask=True, **_prep_args(o))
    job.mask_method = how
    job.cutout = _png_bytes(image)
    job.mask = mask
    job.check()

    if not weights_ready():
        start_download()
        while True:
            job.check()
            st = weights_status()
            if st["state"] == "ready":
                break
            if st["state"] == "error":
                raise RuntimeError(f"The TripoSR weights could not be downloaded ({st['error']}). Check the internet connection, "
                                   f"or put {CONFIG_NAME} and {WEIGHT_NAME} in a folder and set FAELYX_TRIPOSR_MODEL to it.")
            if st["state"] == "missing":
                start_download()
            job.set("running", 5 + 20 * st["percent"] / 100.0,
                    f"Downloading the TripoSR weights, first run only — {st['downloaded_mb']} of about {st['total_mb']} MB…")
            time.sleep(0.5)

    job.set("running", 26, "Loading the TripoSR model" + (" (first time after a start takes a while)…" if _MODEL is None else "…"))
    model, device = get_model()
    model.renderer.set_chunk_size(CHUNK_SIZES[o["memory"]])
    job.check()

    import torch
    where = "on the GPU" if device.startswith("cuda") else "on the CPU — this takes a few minutes without an NVIDIA GPU"
    job.set("running", 40, f"Reconstructing the object {where}…")
    from tsr import faelyx_mesh as fm
    try:
        scene_codes, picture_note = fm.scene_code_from_picture(model, image, mask, o, device,
                                                               lambda frac, msg: job.set("running", 42 + 14 * frac, msg), lambda: job.cancelled)
        job.check()
        job.codes = scene_codes[0].detach().float().cpu().numpy()

        def progress(frac, msg):
            job.set("running", 58 + 28 * frac, msg)

        job.set("running", 58, f"Reading the shape (high-detail mesh, {o['mc_resolution']}³)…")
        geo = fm.build_geometry(model, scene_codes, device, o, progress, lambda: job.cancelled)
        job.check()
        colors = None
        if o["colour"]:
            job.set("running", 86, "Painting the model…")
            colors = fm.query_colours(model, scene_codes[0], device, geo["verts"], o["memory"], None, lambda: job.cancelled)
            colors = fm.smooth_colours(geo["verts"], geo["faces"], colors, o["colour_smooth"])
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        raise RuntimeError("The GPU ran out of memory. Switch Memory use to “Low”, lower the mesh resolution, or close other GPU programs.")
    finally:
        if device.startswith("cuda"):
            torch.cuda.empty_cache()
    job.check()
    job.note = " ".join(x for x in (picture_note, geo["note"]) if x)
    job.set("running", 90, "Cleaning the mesh…")
    mesh = clean_mesh(Mesh(geo["verts"], geo["faces"], colors))      # the full-detail mesh; finishing is applied on request
    job.full_faces = int(len(mesh.faces))
    job.colour_state = "done" if mesh.colors is not None else "none"
    job.seconds = round(time.time() - t0, 1)
    return mesh


_JOBS: dict = {}
_JOBS_LOCK = threading.Lock()
_RUN_LOCK = threading.Lock()


def _run(job: Job, rgb: np.ndarray, alpha: Optional[np.ndarray]):
    with _RUN_LOCK:
        try:
            job.check()
            mesh = _generate(job, rgb, alpha)
            if len(mesh.faces) == 0:
                raise ValueError("No shape could be made from this picture — try a clearer one, or a different foreground ratio.")
            job.set("running", 95, "Checking the mesh…")
            job.mesh = mesh
            job.set("succeeded", 100, "Done")
        except InterruptedError:
            job.error = "Cancelled."
            job.set("cancelled", job.progress, "Cancelled")
            _forget_files(job)
        except Exception as e:  # noqa: BLE001 — shown to the user, traceback to the console
            traceback.print_exc()
            job.error = str(e) or type(e).__name__
            job.set("failed", job.progress, job.error)


# ----------------------------------------------------------------------------
# Colour, added later. TripoSR is deterministic: the same prepared picture gives the same model every time, so the colour of the
# finished shape can be read afterwards — at exactly the vertices of the mesh the user already has — without changing the shape.
# ----------------------------------------------------------------------------
def _colour_local(job: Job, verts: np.ndarray) -> np.ndarray:
    missing = missing_packages()
    if missing:
        raise RuntimeError("TripoSR needs these Python packages: " + ", ".join(m["pip"] for m in missing) + f". Install them with: {INSTALL_HINT}")
    hw = hardware()
    if "error" in hw:
        raise RuntimeError(f"PyTorch could not be loaded: {hw['error']}")
    from PIL import Image
    import torch
    from tsr import faelyx_mesh as fm
    job.colour_message = "Loading the TripoSR model…"
    model, device = get_model()
    job.colour_message = "Reading the picture again…"
    try:
        if job.codes is not None:                      # the very scene code the shape was made from (also when Match my picture / several reads were used)
            codes = torch.from_numpy(np.asarray(job.codes, dtype=np.float32))[None].to(device)
        else:
            image = Image.open(io.BytesIO(job.cutout)).convert("RGB")
            with torch.no_grad():
                codes = model([image], device=device)

        def progress(frac, msg):
            job.colour_message = f"Painting the model… {int(frac * 100)} %"

        return fm.query_colours(model, codes[0], device, verts, job.opts["memory"], progress, None)
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        raise RuntimeError("The GPU ran out of memory while painting. Switch Memory use to “Low” and try again.") from None
    finally:
        if device.startswith("cuda"):
            torch.cuda.empty_cache()


def _colour_remote(job: Job, verts: np.ndarray) -> np.ndarray:
    import hunyuan3d as hy
    if "colour" not in _tsr_features(True, hy):
        raise RuntimeError("The Colab session is running an older notebook that cannot add colour afterwards. Upload the new "
                           "Faelyx_Hunyuan3D_Colab.ipynb to Colab, run it, paste the new connection code, then try again.")

    def progress(pct, msg):
        job.colour_message = msg

    rid = job.id + "-colour"
    try:
        out = hy.run_remote_triposr(rid, job.cutout, _tsr_options(job.opts, "colour"), progress, lambda: False, verts=verts, codes=job.codes)
    finally:
        hy.remove_job_files(rid)
    c = out["final"][2]
    if (out.get("meta") or {}).get("task") != "colour" or c is None or len(c) != len(verts):
        raise RuntimeError("The Colab session returned colours that do not fit this mesh. Update the notebook and try again.")
    return np.asarray(c, dtype=np.uint8)


def _run_colour(job: Job) -> None:
    from tsr import faelyx_mesh as fm
    with _RUN_LOCK:
        try:
            m = job.mesh
            if m is None:
                raise RuntimeError("This job has no mesh any more.")
            colours = _colour_remote(job, m.verts) if triposr_remote_on() else _colour_local(job, m.verts)
            colours = fm.smooth_colours(m.verts, m.faces, colours, int(job.opts.get("colour_smooth", 2)))
            with job._finish_lock:
                job.mesh = Mesh(m.verts, m.faces, colours)
                job._finish_cache.clear()
                job._stats_cache.clear()
            job.colour_state, job.colour_message = "done", "Colour added."
        except Exception as e:  # noqa: BLE001 — shown in the dialog, traceback to the console
            traceback.print_exc()
            job.colour_state, job.colour_message = "failed", str(e) or type(e).__name__


def add_colour(job_id: str, smooth: Optional[int] = None) -> dict:
    """Starts painting a finished TripoSR model in the background; poll job_info() for colour_state ('working' -> 'done' | 'failed')."""
    j = _job(job_id)
    if j.engine != "triposr":
        raise ValueError("Colour can be added later to TripoSR models only (Hunyuan3D makes its colour in its own stage).")
    if j.status != "succeeded" or j.mesh is None or j.cutout is None:
        raise ValueError("Wait until the model is finished.")
    if j.colour_state == "working":
        return {"state": "working"}
    if j.mesh.colors is not None:
        raise ValueError("This model already has colour.")
    if smooth is not None:
        j.opts["colour_smooth"] = int(min(6, max(0, smooth)))
    j.colour_state, j.colour_message = "working", "Starting…"
    threading.Thread(target=_run_colour, args=(j,), daemon=True).start()
    return {"state": "working"}


def _forget_files(job: Job) -> None:
    """A Hunyuan job keeps its working files (mesh, PBR glb) on disk; drop them when the job is gone."""
    if job.engine != "hunyuan":
        return
    with _JOBS_LOCK:
        alive = job.id in _JOBS
    if alive and job.status != "cancelled":
        return
    try:
        import hunyuan3d as hy
        hy.remove_job_files(job.id)
    except Exception:  # noqa: BLE001
        pass


def create_job(image, options: Optional[dict] = None) -> str:
    rgb, alpha = decode_image(image)
    job = Job(clean_options(options or {}))
    if job.engine == "hunyuan":
        try:
            import hunyuan3d as hy
            hy.sweep_old_jobs()
        except Exception:  # noqa: BLE001
            pass
    with _JOBS_LOCK:
        _JOBS[job.id] = job
        done = sorted((j for j in _JOBS.values() if j.status in ("succeeded", "failed", "cancelled")), key=lambda j: j.created)
        for old in done[:max(0, len(_JOBS) - MAX_JOBS_KEPT)]:
            _JOBS.pop(old.id, None)
    threading.Thread(target=_run, args=(job, rgb, alpha), daemon=True).start()
    return job.id


def _job(job_id: str) -> Job:
    with _JOBS_LOCK:
        j = _JOBS.get(job_id)
    if j is None:
        raise KeyError(job_id)
    return j


def _finish_key(f: dict) -> tuple:
    return (f["faces"], f["smooth"], f["sharp"], f["pieces"], f["fill"])


def _finished(job: Job, size_mm: float, place: str, up: Optional[str], spin: float, finish: Optional[dict] = None) -> Mesh:
    if job.mesh is None:
        raise ValueError("That job has no mesh yet.")
    f = clean_finish(finish)
    key = _finish_key(f)
    with job._finish_lock:
        done = job._finish_cache.get(key)
        if done is None:
            lod = job.lods.get(f["faces"])
            done = finish_mesh(lod or job.mesh, f, lod=lod is not None)
            job._finish_cache[key] = done
            if len(job._finish_cache) > 4:
                job._finish_cache.pop(next(iter(job._finish_cache)))
    return place_mesh(orient_mesh(done, up or job.opts.get("up", "z"), spin), max(0.1, float(size_mm)), place)


def job_info(job_id: str, size_mm: float = 60.0, up: Optional[str] = None, spin: float = 0.0, finish: Optional[dict] = None) -> dict:
    j = _job(job_id)
    info = {"id": j.id, "engine": j.engine, "status": j.status, "progress": round(j.progress, 1), "message": j.message,
            "error": j.error, "mask": j.mask_method, "has_colors": bool(j.mesh is not None and j.mesh.colors is not None),
            "has_glb": False, "has_cutout": j.cutout is not None, "up": j.opts.get("up", "z"),
            "full_faces": j.full_faces, "device": j.device, "seconds": j.seconds,
            "textured": j.textured, "note": j.note, "has_pbr": bool(j.pbr_path and j.pbr_path.is_file()),
            "colour_state": j.colour_state, "colour_message": j.colour_message,
            "can_colour": bool(j.engine == "triposr" and j.status == "succeeded" and j.mesh is not None and j.mesh.colors is None
                               and j.cutout is not None and j.colour_state != "working")}
    if j.status == "succeeded":
        f = clean_finish(finish)
        key = (round(float(size_mm), 4), up or "", round(float(spin) % 360, 3), _finish_key(f))
        if key not in j._stats_cache:
            j._stats_cache[key] = mesh_stats(_finished(j, size_mm, "ground", up, spin, f))
            if len(j._stats_cache) > 24:
                j._stats_cache.pop(next(iter(j._stats_cache)))
        info["stats"] = j._stats_cache[key]
    return info


WRITERS = {"stl": to_stl, "ply": to_ply, "obj": to_obj, "glb": to_glb}


def job_mesh_bytes(job_id: str, fmt: str = "stl", size_mm: float = 60.0, place: str = "ground",
                   up: Optional[str] = None, spin: float = 0.0, finish: Optional[dict] = None) -> bytes:
    j = _job(job_id)
    if fmt not in WRITERS:
        raise ValueError("format must be stl, ply, obj or glb")
    m = _finished(j, size_mm, place if place in ("ground", "center", "keep") else "ground", up, spin, finish)
    return WRITERS[fmt](m)


def job_cutout(job_id: str) -> bytes:
    j = _job(job_id)
    if j.cutout is None:
        raise ValueError("No processed picture yet.")
    return j.cutout


def cancel_job(job_id: str) -> bool:
    j = _job(job_id)
    if j.status in ("queued", "running"):
        j.cancelled = True
        return True
    return False


def delete_job(job_id: str) -> bool:
    with _JOBS_LOCK:
        j = _JOBS.pop(job_id, None)
    if j is not None and j.engine == "hunyuan":
        if j.status in ("queued", "running"):
            j.cancelled = True                      # the runner stops the child process
        else:
            try:
                import hunyuan3d as hy
                hy.remove_job_files(job_id)
            except Exception:  # noqa: BLE001
                pass
    return j is not None


def job_pbr_bytes(job_id: str) -> bytes:
    j = _job(job_id)
    if j.pbr_path is None or not j.pbr_path.is_file():
        raise ValueError("This model has no textured PBR file (the colour stage did not run).")
    return j.pbr_path.read_bytes()


# ----------------------------------------------------------------------------
# HTTP routes (registered from cad_server.py, like catia_api)
# ----------------------------------------------------------------------------
class CreateJobRequest(BaseModel):
    # A data: URL or raw base64 string, as FileReader.readAsDataURL() gives it.
    image: str
    options: dict = {}


def install(app) -> None:
    from starlette.responses import JSONResponse, Response   # what fastapi.responses re-exports

    def bad(msg: str, code: int = 400):
        return Response(content=msg, status_code=code)

    @app.get("/image_to_3d/status")
    def i23d_status():
        return JSONResponse(engine_status())

    @app.post("/image_to_3d/model/download")
    def i23d_download():
        if triposr_remote_on():
            try:
                import hunyuan3d as hy
                hy.remote_triposr_start_download()
                return JSONResponse(engine_status()["weights"])
            except Exception as e:  # noqa: BLE001
                return bad(str(e))
        miss = [m for m in missing_packages() if m["module"] == "huggingface_hub"]
        if miss:
            return bad("Install huggingface-hub first: " + INSTALL_HINT)
        start_download()
        return JSONResponse(weights_status())

    @app.post("/image_to_3d/hunyuan/download")
    def i23d_hy_download():
        try:
            import hunyuan3d as hy
            hy.start_download()
            return JSONResponse(hy.weights_status())
        except Exception as e:  # noqa: BLE001
            return bad(str(e))

    @app.post("/image_to_3d/hunyuan/remote")
    def i23d_hy_remote(body: dict):
        """Saves / switches the Google Colab connection: {"code": "https://…#access"} connects, {"enabled": false} goes back to this computer."""
        try:
            import hunyuan3d as hy
            if str(body.get("code") or "").strip():
                hy.set_remote(str(body["code"]), str(body.get("token") or ""))
            elif "enabled" in body:
                hy.set_remote_enabled(bool(body["enabled"]))
            return JSONResponse(hy.engine_status())
        except ValueError as e:
            return bad(str(e))
        except Exception as e:  # noqa: BLE001
            return bad(f"{type(e).__name__}: {e}", 500)

    @app.post("/image_to_3d/triposr/remote")
    def i23d_tsr_remote(body: dict):
        """Same Colab connection as Hunyuan3D, switched for TripoSR: {"code": …} connects, {"enabled": false} goes back to this computer."""
        try:
            import hunyuan3d as hy
            if str(body.get("code") or "").strip():
                hy.set_remote(str(body["code"]), str(body.get("token") or ""), engine="triposr")
            elif "enabled" in body:
                hy.set_remote_enabled(bool(body["enabled"]), engine="triposr")
            return JSONResponse(engine_status())
        except ValueError as e:
            return bad(str(e))
        except Exception as e:  # noqa: BLE001
            return bad(f"{type(e).__name__}: {e}", 500)

    @app.delete("/image_to_3d/hunyuan/remote")
    def i23d_hy_remote_clear():
        try:
            import hunyuan3d as hy
            hy.clear_remote()
            return JSONResponse(hy.engine_status())
        except Exception as e:  # noqa: BLE001
            return bad(f"{type(e).__name__}: {e}", 500)

    @app.get("/image_to_3d/jobs/{job_id}/original.glb")
    def i23d_pbr(job_id: str):
        try:
            return Response(content=job_pbr_bytes(job_id), media_type="model/gltf-binary")
        except KeyError:
            return bad("Unknown job — it may have been cleared; generate again.", 404)
        except ValueError as e:
            return bad(str(e), 404)

    @app.post("/image_to_3d/jobs/{job_id}/colour")
    def i23d_colour(job_id: str, body: Optional[dict] = None):
        """Paints a finished TripoSR model (the shape stays exactly as it is). Poll GET /image_to_3d/jobs/{id}: colour_state."""
        try:
            sm = (body or {}).get("smooth")
            return add_colour(job_id, int(sm) if sm is not None else None)
        except KeyError:
            return bad("Unknown job — it may have been cleared; generate again.", 404)
        except (ValueError, TypeError) as e:
            return bad(str(e))

    @app.post("/image_to_3d/jobs/{job_id}/cancel")
    def i23d_cancel(job_id: str):
        try:
            return {"cancelled": cancel_job(job_id)}
        except KeyError:
            return bad("Unknown job.", 404)

    @app.post("/image_to_3d/preview")
    def i23d_preview(req: CreateJobRequest):
        try:
            return Response(content=preview_picture(req.image, req.options), media_type="image/png")
        except (ValueError, RuntimeError) as e:
            return bad(str(e))
        except Exception as e:  # noqa: BLE001 — e.g. rembg could not fetch its model; say so instead of a bare 500
            traceback.print_exc()
            return bad(f"Could not prepare the picture: {e}", 500)

    @app.post("/image_to_3d/jobs")
    def i23d_create(req: CreateJobRequest):
        try:
            return {"job_id": create_job(req.image, req.options)}
        except ValueError as e:
            return bad(str(e))

    @app.get("/image_to_3d/jobs/{job_id}")
    def i23d_info(job_id: str, size_mm: float = 60.0, up: Optional[str] = None, spin: float = 0.0,
                  faces: str = "medium", smooth: int = 0, sharp: bool = True, pieces: str = "all", fill: bool = False):
        try:
            return JSONResponse(job_info(job_id, size_mm, up, spin,
                                         {"faces": faces, "smooth": smooth, "sharp": sharp, "pieces": pieces, "fill": fill}))
        except KeyError:
            return bad("Unknown job — it may have been cleared; generate again.", 404)

    @app.get("/image_to_3d/jobs/{job_id}/mesh")
    def i23d_mesh(job_id: str, format: str = "stl", size_mm: float = 60.0, place: str = "ground",
                  up: Optional[str] = None, spin: float = 0.0,
                  faces: str = "medium", smooth: int = 0, sharp: bool = True, pieces: str = "all", fill: bool = False):
        try:
            data = job_mesh_bytes(job_id, format, size_mm, place, up, spin,
                                  {"faces": faces, "smooth": smooth, "sharp": sharp, "pieces": pieces, "fill": fill})
        except KeyError:
            return bad("Unknown job — it may have been cleared; generate again.", 404)
        except ValueError as e:
            return bad(str(e))
        return Response(content=data, media_type="model/gltf-binary" if format == "glb" else "application/octet-stream")

    @app.get("/image_to_3d/jobs/{job_id}/cutout")
    def i23d_cutout(job_id: str):
        try:
            return Response(content=job_cutout(job_id), media_type="image/png")
        except KeyError:
            return bad("Unknown job.", 404)
        except ValueError as e:
            return bad(str(e), 404)

    @app.delete("/image_to_3d/jobs/{job_id}")
    def i23d_delete(job_id: str):
        return {"deleted": delete_job(job_id)}
