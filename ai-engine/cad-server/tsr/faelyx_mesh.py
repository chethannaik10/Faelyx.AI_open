"""faelyx.AI — high-quality mesh extraction for TripoSR.

Copyright (c) 2026 faelyx.AI. Licensed under the faelyx.AI Image to 3D Module License (LICENSE-faelyx-image-to-3d.md).
This file is faelyx.AI's own code; it only CALLS the TripoSR model (MIT, © 2024 Tripo AI & Stability AI) to read its density / colour field.

What TripoSR's own `extract_mesh` does: sample the density on one dense grid (256³ by default), run marching cubes on it, done. That is
why the surface looks "melted": the grid is coarse (Faelyx capped it at 320³), stray specks and hollow bubbles go straight into the mesh,
the zero-crossing sits on a steep exponential, and the bottom is a lumpy blob.

What this module does instead (all of it before a single triangle exists, where fixing is cheap and does not blur detail):

  1. coarse pass     the field on a 128³ grid (2 million points);
  2. log field       s = log(density) - log(threshold): zero on the surface and close to LINEAR across it, so marching cubes places vertices
                     more exactly (about 10x smaller sub-voxel error than on the raw exponential density in a synthetic test);
  3. fine pass       only the thin shell of cells around the surface is evaluated at the full resolution (up to 512³) — the rest of the volume
                     is interpolated — so 384³ costs about as much as a dense 128³-192³ and fits in memory;
  4. surface clean   `faelyx_polish.polish_grid`: drops floating specks and hollow bubbles, removes hair-thin spikes (strong), smooths the
                     field by a resolution-scaled sub-voxel blur and gives the mid-size detail back, optionally cuts one flat base plane;
  5. closed surface  the grid is padded by one empty voxel so the mesh is always watertight, even when the object touches the cube.

Colour is a separate, optional step (`query_colours`): the same model is asked for the colour at the vertices of a mesh that already exists.

Everything in the first block (numpy / scipy / scikit-image) runs without PyTorch, which is how it is tested. The torch helpers at the
bottom import torch lazily.
"""
import importlib.util
import math
import time
from pathlib import Path
from typing import Callable, Optional

import numpy as np

LOG_CLIP = 8.0                      # the log field is clipped to +-LOG_CLIP: far from the surface only the sign matters
COARSE = 128                        # resolution of the first pass
MARGIN = 2                          # coarse cells of safety band around the surface
SLICE_POINTS = 1_000_000            # points per model call on the fine pass (on the CPU of the caller; the model chunks internally)
MAX_RESOLUTION = 512
POLISH_LEVELS = ("off", "standard", "strong")

Progress = Optional[Callable[[float, str], None]]
Cancel = Optional[Callable[[], bool]]


def _tick(progress: Progress, frac: float, msg: str) -> None:
    if progress is not None:
        progress(max(0.0, min(1.0, frac)), msg)


def _check(cancelled: Cancel) -> None:
    if cancelled is not None and cancelled():
        raise InterruptedError()


_POLISH = None


def _polish_module():
    """faelyx_polish.py lives in ../hunyuan3d_worker (the same file in the Colab bundle). Loaded by path so no package setup is needed."""
    global _POLISH
    if _POLISH is None:
        path = Path(__file__).resolve().parent.parent / "hunyuan3d_worker" / "faelyx_polish.py"
        spec = importlib.util.spec_from_file_location("faelyx_polish_tsr", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _POLISH = mod
    return _POLISH


# ----------------------------------------------------------------------------- grids
def to_log_field(density_log: np.ndarray, threshold: float) -> np.ndarray:
    """log-density -> signed field that is 0 on the TripoSR surface (density == threshold), positive inside."""
    s = np.asarray(density_log, dtype=np.float32) - np.float32(math.log(max(1e-6, float(threshold))))
    return np.clip(s, -LOG_CLIP, LOG_CLIP, out=s)


def grid_points(resolution: int, radius: float, flat_index: np.ndarray) -> np.ndarray:
    """World coordinates (float32, (N,3)) of the grid vertices with the given flat indices; axes (i,j,k) = (x,y,z), C order."""
    i, j, k = np.unravel_index(flat_index, (resolution,) * 3)
    step = (2.0 * radius) / (resolution - 1)
    pts = np.empty((len(flat_index), 3), np.float32)
    pts[:, 0] = i * step - radius
    pts[:, 1] = j * step - radius
    pts[:, 2] = k * step - radius
    return pts


def upsample_linear(a: np.ndarray, n: int) -> np.ndarray:
    """Trilinear resize of a cubic grid so both end points stay in place (vertex i of the new grid sits at i*(m-1)/(n-1) of the old one)."""
    m = a.shape[0]
    out = a.astype(np.float32, copy=False)
    pos = np.arange(n, dtype=np.float64) * ((m - 1) / (n - 1))
    lo = np.minimum(np.floor(pos).astype(np.int64), m - 2)
    w = (pos - lo).astype(np.float32)
    for ax in range(3):
        shape = [1, 1, 1]
        shape[ax] = n
        wv = w.reshape(shape)
        out = out.take(lo, axis=ax) * (np.float32(1.0) - wv) + out.take(lo + 1, axis=ax) * wv
    return out.astype(np.float32, copy=False)


def surface_cells(s: np.ndarray, near: float = 0.35, margin: int = MARGIN) -> np.ndarray:
    """Bool grid of the (n-1)³ cells that touch the zero level (or come within `near` of it), grown by `margin` cells."""
    from scipy import ndimage as nd
    n = s.shape[0]
    views = [s[a:n - 1 + a, b:n - 1 + b, c:n - 1 + c] for a in (0, 1) for b in (0, 1) for c in (0, 1)]
    lo = np.minimum.reduce(views)
    hi = np.maximum.reduce(views)
    cells = ((lo <= 0) & (hi >= 0)) | (np.minimum(np.abs(lo), np.abs(hi)) < near)
    if margin > 0:
        cells = nd.binary_dilation(cells, structure=nd.generate_binary_structure(3, 3), iterations=int(margin))
    return cells


def sample_field(fn: Callable[[np.ndarray], np.ndarray], resolution: int, radius: float, threshold: float, coarse: int = COARSE,
                 progress: Progress = None, cancelled: Cancel = None, slice_points: int = SLICE_POINTS) -> tuple:
    """The signed field (positive inside) on a resolution³ grid, plus a small report.
    fn(points (N,3) float32 world coordinates) must return the LOG of the density at those points."""
    t0 = time.time()
    resolution = int(min(MAX_RESOLUTION, max(32, resolution)))
    r0 = int(min(coarse, resolution))
    rep = {"resolution": resolution, "coarse": r0}

    def evaluate(flat: np.ndarray, res: int, lo: float, hi: float, msg: str) -> np.ndarray:
        out = np.empty(len(flat), np.float32)
        for a in range(0, len(flat), slice_points):
            _check(cancelled)
            b = min(len(flat), a + slice_points)
            out[a:b] = to_log_field(fn(grid_points(res, radius, flat[a:b])), threshold)
            _tick(progress, lo + (hi - lo) * b / max(1, len(flat)), msg)
        return out

    flat0 = np.arange(r0 ** 3, dtype=np.int64)
    s0 = evaluate(flat0, r0, 0.0, 0.25 if resolution > r0 else 1.0, f"Reading the shape ({r0}³ first pass)…").reshape((r0,) * 3)
    del flat0
    if resolution <= r0:
        rep["evaluated"] = int(r0 ** 3)
        rep["seconds"] = round(time.time() - t0, 1)
        return s0, rep

    cells = surface_cells(s0)
    pos = np.arange(resolution, dtype=np.float64) * ((r0 - 1) / (resolution - 1))
    cell_of = np.minimum(np.floor(pos).astype(np.int64), r0 - 2)
    band = cells[np.ix_(cell_of, cell_of, cell_of)]
    del cells
    s = upsample_linear(s0, resolution)
    del s0
    flat = np.flatnonzero(band.reshape(-1))
    del band
    rep["evaluated"] = int(len(flat))
    rep["fraction"] = round(len(flat) / float(resolution ** 3), 4)
    if len(flat):
        s.reshape(-1)[flat] = evaluate(flat, resolution, 0.25, 1.0, f"Reading the surface at {resolution}³ detail…")
    rep["seconds"] = round(time.time() - t0, 1)
    return s, rep


# ----------------------------------------------------------------------------- mesh
def marching(s: np.ndarray, radius: float) -> tuple:
    """Marching cubes at s == 0 on a grid that is padded by one empty voxel, so the result is closed. Returns world-space (verts, faces)."""
    from skimage.measure import marching_cubes
    n = s.shape[0]
    padded = np.pad(s, 1, mode="constant", constant_values=-1.0)
    try:
        v, f, _n, _val = marching_cubes(padded, level=0.0, allow_degenerate=False)
    except (ValueError, RuntimeError):
        return np.zeros((0, 3)), np.zeros((0, 3), np.int64)
    v = (v - 1.0) / (n - 1.0) * (2.0 * radius) - radius
    return v.astype(np.float64), f.astype(np.int64)


def extract_mesh_hq(fn: Callable[[np.ndarray], np.ndarray], radius: float = 0.87, resolution: int = 384, threshold: float = 25.0,
                    polish: str = "standard", flat_base: bool = False, up: int = 2, progress: Progress = None, cancelled: Cancel = None) -> dict:
    """The whole pipeline. Returns {"verts", "faces", "report"}; verts are in the model's own frame (z up for TripoSR).
    `up` is the grid axis that points up (2 = z). Raises InterruptedError when `cancelled()` turns true."""
    t0 = time.time()
    polish = polish if polish in POLISH_LEVELS else "standard"
    s, rep = sample_field(fn, resolution, radius, threshold, progress=progress, cancelled=cancelled)
    res = rep["resolution"]
    _check(cancelled)
    if polish != "off":
        _tick(progress, 1.0, "Cleaning the surface (specks, bubbles, ripples)…")
        mod = _polish_module()
        try:
            s, prep = mod.polish_grid(s, polish, flat_base, up, 0.0, scale=res / 256.0)
            prep.pop("silhouettes", None)
            rep["polish"] = prep
        except MemoryError:
            rep["polish"] = {"error": "out of memory — used the raw field"}
    elif flat_base:
        mod = _polish_module()
        i0 = mod.find_base(s > 0, up)
        if i0 is not None:
            mod._cut_base(s, up, i0)
            rep["polish"] = {"level": "off", "base_layer": int(i0)}
    _check(cancelled)
    _tick(progress, 1.0, f"Building the surface (marching cubes {res}³)…")
    v, f = marching(s, radius)
    rep["faces"] = int(len(f))
    rep["seconds"] = round(time.time() - t0, 1)
    return {"verts": v, "faces": f, "report": rep}


def describe(rep: dict) -> str:
    """One sentence for the job note."""
    p = rep.get("polish") or {}
    bits = [f"High-detail mesh {rep.get('resolution')}³"]
    lvl = p.get("level")
    if lvl and lvl != "off":
        bits.append(f"surface clean-up {lvl}")
        if p.get("fragments"):
            bits.append(f"{p['fragments']} floating piece{'s' if p['fragments'] != 1 else ''} removed")
        if p.get("voids"):
            bits.append(f"{p['voids']} hollow bubble{'s' if p['voids'] != 1 else ''} filled")
    if "base_layer" in p:
        bits.append("flat base cut")
    elif p.get("base"):
        bits.append("no flat slab found, base left as is")
    if p.get("error"):
        bits.append(p["error"])
    return ", ".join(bits) + "."


# ----------------------------------------------------------------------------- colour (optional, separate step)
def smooth_colours(verts: np.ndarray, faces: np.ndarray, colors: np.ndarray, passes: int = 2) -> np.ndarray:
    """Averages every vertex colour with its neighbours' a few times: removes single-vertex speckle, keeps the large colour regions."""
    if passes <= 0 or len(faces) == 0:
        return colors
    n = len(verts)
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    a = np.concatenate([e[:, 0], e[:, 1]])
    b = np.concatenate([e[:, 1], e[:, 0]])
    deg = np.bincount(a, minlength=n).astype(np.float64) + 1.0
    c = colors.astype(np.float64)
    for _ in range(passes):
        acc = c.copy()
        for k in range(3):
            acc[:, k] += np.bincount(a, weights=c[b, k], minlength=n)
        c = acc / deg[:, None]
    return np.clip(c + 0.5, 0, 255).astype(np.uint8)


# ----------------------------------------------------------------------------- torch helpers (lazy imports)
HQ_CHUNK = {"standard": 65536, "low": 8192}


def torch_log_density_fn(model, scene_code, device, memory: str = "standard"):
    """fn(points) -> log density, for extract_mesh_hq. Restores the renderer's chunk size afterwards (call .restore())."""
    import torch
    renderer = model.renderer
    old = renderer.chunk_size
    renderer.set_chunk_size(HQ_CHUNK.get(memory, HQ_CHUNK["standard"]))

    def fn(pts: np.ndarray) -> np.ndarray:
        with torch.no_grad():
            p = torch.from_numpy(np.ascontiguousarray(pts, dtype=np.float32)).to(device)
            d = renderer.query_triplane(model.decoder, p, scene_code)["density_act"].reshape(-1).float()
            return torch.log(d.clamp(1e-6, 1e18)).cpu().numpy()

    fn.restore = lambda: renderer.set_chunk_size(old)
    return fn


def query_colours(model, scene_code, device, verts: np.ndarray, memory: str = "standard",
                  progress: Progress = None, cancelled: Cancel = None) -> np.ndarray:
    """TripoSR's colour at each vertex (world coordinates in the model's frame) as uint8 (N,3)."""
    import torch
    renderer = model.renderer
    old = renderer.chunk_size
    renderer.set_chunk_size(HQ_CHUNK.get(memory, HQ_CHUNK["standard"]))
    out = np.empty((len(verts), 3), np.uint8)
    try:
        step = 400_000
        for a in range(0, len(verts), step):
            _check(cancelled)
            b = min(len(verts), a + step)
            with torch.no_grad():
                p = torch.from_numpy(np.ascontiguousarray(verts[a:b], dtype=np.float32)).to(device)
                c = renderer.query_triplane(model.decoder, p, scene_code)["color"].reshape(-1, 3).float().clamp(0, 1)
            out[a:b] = (c.cpu().numpy() * 255.0 + 0.5).astype(np.uint8)
            _tick(progress, b / max(1, len(verts)), "Painting the model…")
    finally:
        renderer.set_chunk_size(old)
    return out


def build_geometry(model, scene_codes, device, o: dict, progress: Progress = None, cancelled: Cancel = None) -> dict:
    """The geometry step used by both the local run and the Colab worker. `o` holds mc_resolution, threshold, memory, polish, flat_base.
    Returns {"verts", "faces", "note", "hq"} (float64 / int64 arrays, model frame). If the new extractor fails for any reason except running
    out of GPU memory or a cancel, TripoSR's own extract_mesh is used instead so a job never gets lost to a bug here."""
    import torch
    radius = float(model.renderer.cfg.radius)
    fn = torch_log_density_fn(model, scene_codes[0], device, o.get("memory", "standard"))
    try:
        out = extract_mesh_hq(fn, radius, int(o["mc_resolution"]), float(o["threshold"]), o.get("polish", "standard"), bool(o.get("flat_base", False)),
                              2, progress, cancelled)
        if len(out["faces"]) == 0:
            raise RuntimeError("the high-detail extractor found no surface")
        return {"verts": out["verts"], "faces": out["faces"], "note": describe(out["report"]), "hq": True}
    except InterruptedError:
        raise
    except Exception as e:  # noqa: BLE001
        if isinstance(e, torch.cuda.OutOfMemoryError) or "out of memory" in str(e).lower():
            raise
        import traceback
        traceback.print_exc()
        res = int(min(320, o["mc_resolution"]))
        meshes = model.extract_mesh(scene_codes, False, resolution=res, threshold=float(o["threshold"]))
        tm = meshes[0]
        return {"verts": np.asarray(tm.vertices, dtype=np.float64), "faces": np.asarray(tm.faces, dtype=np.int64), "hq": False,
                "note": f"The high-detail extractor failed ({type(e).__name__}: {e}); TripoSR's standard extraction at {res}³ was used."}
    finally:
        fn.restore()


# ----------------------------------------------------------------------------- reading the picture better (torch; lazy imports)
# TripoSR reads the picture once and writes a "scene code" (three feature planes). Two optional things happen to that code before any mesh
# or colour is made from it:
#   * reads    the picture is read 1, 3 or 5 times with tiny photometric changes (contrast, sharpness, blur — they do not move the object, so
#              the codes stay aligned) and the codes are averaged: this steadies the result, the effect is modest;
#   * match    the code is nudged for a few dozen steps so that the model's own front view lines up with YOUR cut-out (outline) and colours.
#              The step is guarded: it is only kept when the outline overlap really improves and the model's volume stays within +-25 %.
# Everything here is wrapped by the caller: any failure leaves the unrefined code in place and says why in the job note.
MATCH_STEPS = {"light": 30, "strong": 80}
RENDER_SIDE = 96
CALIB_SIDE = 32


def photometric_variants(image, reads: int) -> list:
    from PIL import ImageEnhance, ImageFilter
    out = [image]
    if reads >= 3:
        out += [ImageEnhance.Contrast(image).enhance(1.08), ImageEnhance.Sharpness(image).enhance(1.5)]
    if reads >= 5:
        out += [ImageEnhance.Contrast(image).enhance(0.92), image.filter(ImageFilter.GaussianBlur(0.6))]
    return out


def _render(model, code, rays_o, rays_d):
    """Differentiable volume render of the scene code, same maths as tsr's renderer but it also returns the opacity.
    rays_o, rays_d: (N,3). Returns (rgb (N,3) over black, opacity (N,))."""
    import torch
    from tsr.utils import rays_intersect_bbox
    r = model.renderer
    n_rays = rays_o.shape[0]
    t_near, t_far, valid = rays_intersect_bbox(rays_o, rays_d, r.cfg.radius)
    t_near, t_far = t_near[valid], t_far[valid]
    rgb = torch.zeros(n_rays, 3, device=rays_o.device)
    op = torch.zeros(n_rays, device=rays_o.device)
    if t_near.shape[0] == 0:
        return rgb, op
    n = int(r.cfg.num_samples_per_ray)
    t_vals = torch.linspace(0, 1, n + 1, device=rays_o.device)
    t_mid = (t_vals[:-1] + t_vals[1:]) / 2.0
    z_vals = t_near * (1 - t_mid[None]) + t_far * t_mid[None]
    xyz = rays_o[valid][:, None, :] + z_vals[..., None] * rays_d[valid][:, None, :]
    out = r.query_triplane(model.decoder, xyz, code)
    deltas = t_vals[1:] - t_vals[:-1]
    alpha = 1 - torch.exp(-deltas * out["density_act"][..., 0])
    accum = torch.cat([torch.ones_like(alpha[:, :1]), torch.cumprod(1 - alpha[:, :-1] + 1e-10, dim=-1)], dim=-1)
    w = alpha * accum
    rgb = rgb.index_put((valid.nonzero(as_tuple=True)[0],), (w[..., None] * out["color"]).sum(dim=-2))
    op = op.index_put((valid.nonzero(as_tuple=True)[0],), w.sum(dim=-1))
    return rgb, op


def _iou(op, mask, thr: float = 0.5) -> float:
    a = op > thr
    b = mask > 0.5
    union = (a | b).sum().item()
    return float((a & b).sum().item() / union) if union else 0.0


def _inside_fraction(model, code, device, n: int = 40) -> float:
    fn = torch_log_density_fn(model, code, device)
    try:
        flat = np.arange(n ** 3, dtype=np.int64)
        d = fn(grid_points(n, float(model.renderer.cfg.radius), flat))
    finally:
        fn.restore()
    return float((d > math.log(25.0)).mean())


def _mask_tensor(mask: np.ndarray, side: int, device):
    import torch
    from PIL import Image
    m = Image.fromarray(np.asarray(mask, dtype=np.uint8)).resize((side, side), Image.BILINEAR)
    return torch.from_numpy(np.asarray(m, dtype=np.float32) / 255.0).to(device)


def fit_to_picture(model, code, image, mask, device, level: str = "light", progress: Progress = None, cancelled: Cancel = None,
                   low_memory: bool = False) -> tuple:
    """Returns (new code, report). Raises RuntimeError with a readable reason when it cannot / should not refine."""
    if mask is None:
        raise RuntimeError("needs the cut-out outline (turn on Remove the background)")
    import torch
    from PIL import Image
    from tsr.utils import get_spherical_cameras
    steps = MATCH_STEPS.get(level, MATCH_STEPS["light"])
    t0 = time.time()
    rep = {"level": level, "steps": steps}
    req = [p.requires_grad for p in model.parameters()]
    for p in model.parameters():
        p.requires_grad_(False)
    try:
        code0 = code.detach()[0]
        # 1. which camera does the picture correspond to? (self-calibrating: try the 4 sides, mirrored or not, a few distances)
        _tick(progress, 0.0, "Matching your picture — finding the front view…")
        mk = _mask_tensor(mask, CALIB_SIDE, device)
        best = None
        with torch.no_grad():
            for dist in (1.5, 1.7, 1.9, 2.1, 2.4):
                ro, rd = get_spherical_cameras(4, 0.0, dist, 40.0, CALIB_SIDE, CALIB_SIDE)
                for v in range(4):
                    _check(cancelled)
                    _rgb, op = _render(model, code0, ro[v].reshape(-1, 3).to(device), rd[v].reshape(-1, 3).to(device))
                    op = op.reshape(CALIB_SIDE, CALIB_SIDE)
                    for flip in (False, True):
                        s = _iou(op.flip(1) if flip else op, mk)
                        if best is None or s > best[0]:
                            best = (s, dist, v, flip)
        if best is None or best[0] < 0.6:
            raise RuntimeError(f"the model's front view could not be lined up with your outline (best overlap {0 if best is None else round(best[0], 2)})")
        _s, dist, view, flip = best
        rep.update(camera_distance=dist, view=int(view), mirrored=bool(flip))
        H = W = RENDER_SIDE
        ro, rd = get_spherical_cameras(4, 0.0, dist, 40.0, H, W)
        ro, rd = ro[view].reshape(-1, 3).to(device), rd[view].reshape(-1, 3).to(device)
        img = Image.fromarray(np.asarray(image.convert("RGB"))).resize((W, H), Image.BILINEAR)
        tgt = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.0).to(device)
        msk = _mask_tensor(mask, H, device)
        if flip:
            tgt, msk = tgt.flip(1), msk.flip(1)
        tgt, msk = tgt.reshape(-1, 3), msk.reshape(-1)

        def overlap(c) -> float:
            with torch.no_grad():
                ops = [_render(model, c, ro[a:a + 3072], rd[a:a + 3072])[1] for a in range(0, ro.shape[0], 3072)]
            return _iou(torch.cat(ops), msk)

        iou0 = overlap(code0)
        frac0 = _inside_fraction(model, code0, device)
        rep["overlap_before"] = round(iou0, 3)
        # 2. nudge the code (small steps, pulled back towards where it started)
        p = code0.clone().requires_grad_(True)
        scale = float(code0.std().clamp_min(1e-3))
        opt = torch.optim.Adam([p], lr=0.004 * scale)
        gen = torch.Generator(device="cpu").manual_seed(1234)
        n_rays = 1024 if low_memory else 2048
        best_code, best_iou = code0, iou0
        for i in range(steps):
            _check(cancelled)
            idx = torch.randint(0, ro.shape[0], (n_rays,), generator=gen).to(device)
            rgb, op = _render(model, p, ro[idx], rd[idx])
            pred = rgb + (1.0 - op)[:, None] * 0.5
            loss = ((op - msk[idx]) ** 2).mean() + 0.5 * (pred - tgt[idx]).abs().mean() + 0.05 * ((p - code0) ** 2).mean() / (scale ** 2)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            _tick(progress, (i + 1) / steps, f"Matching your picture… step {i + 1} of {steps}")
            if (i + 1) % max(10, steps // 3) == 0 or i == steps - 1:
                s = overlap(p.detach())
                if s > best_iou:
                    best_code, best_iou = p.detach().clone(), s
        rep["overlap_after"] = round(best_iou, 3)
        if best_iou < iou0 + 0.003:
            rep["kept"] = False
            rep["seconds"] = round(time.time() - t0, 1)
            return code, rep
        frac1 = _inside_fraction(model, best_code, device)
        rep["volume_change"] = round(frac1 / frac0 - 1.0, 3) if frac0 > 0 else None
        if frac0 > 0 and not (0.75 <= frac1 / frac0 <= 1.25):
            rep["kept"] = False
            rep["rejected"] = "the model's volume changed too much"
            rep["seconds"] = round(time.time() - t0, 1)
            return code, rep
        rep["kept"] = True
        rep["seconds"] = round(time.time() - t0, 1)
        return best_code[None].detach(), rep
    finally:
        for p, r in zip(model.parameters(), req):
            p.requires_grad_(r)


def scene_code_from_picture(model, image, mask, o: dict, device, progress: Progress = None, cancelled: Cancel = None) -> tuple:
    """The scene code the mesh (and later the colour) is made from. `o`: reads (1/3/5) and match (off/light/strong). Returns (code, note)."""
    import torch
    reads = int(o.get("reads", 1) or 1)
    level = str(o.get("match", "off"))
    notes = []
    with torch.no_grad():
        codes = []
        for v in photometric_variants(image, reads):
            _check(cancelled)
            codes.append(model([v], device=device))
    code = codes[0] if len(codes) == 1 else torch.stack(codes).mean(dim=0)
    if len(codes) > 1:
        notes.append(f"averaged {len(codes)} reads of the picture")
    if level in MATCH_STEPS:
        try:
            code, rep = fit_to_picture(model, code, image, mask, device, level, progress, cancelled, o.get("memory") == "low")
            if rep.get("kept"):
                notes.append(f"matched to your picture (outline overlap {rep['overlap_before']:.2f} → {rep['overlap_after']:.2f})")
            elif rep.get("rejected"):
                notes.append(f"Match my picture was undone ({rep['rejected']})")
            else:
                notes.append(f"Match my picture changed nothing useful (overlap already {rep.get('overlap_before', 0):.2f})")
        except InterruptedError:
            raise
        except Exception as e:  # noqa: BLE001 — never lose a job to the optional refinement
            if isinstance(e, torch.cuda.OutOfMemoryError):
                torch.cuda.empty_cache()
                notes.append("Match my picture skipped (GPU out of memory — try Memory use: Low)")
            else:
                notes.append(f"Match my picture skipped ({e})")
    return code, ("Picture: " + "; ".join(notes) + ".") if notes else ""
