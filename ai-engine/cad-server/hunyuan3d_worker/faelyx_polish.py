"""faelyx.AI — surface clean-up for Hunyuan3D shapes ("polish").

Copyright (c) 2026 faelyx.AI. Licensed under the faelyx.AI Image to 3D Module License (LICENSE-faelyx-image-to-3d.md).
Hunyuan3D 2.1 is © Tencent (Tencent Hunyuan 3D 2.1 Community License); this file does not modify or copy any Tencent code — it wraps the
`vae.surface_extractor` object of a loaded pipeline at run time.

Why here: Hunyuan3D turns its latent code into a dense grid of numbers (positive inside the object, negative outside) and only then runs
marching cubes. Everything that makes the raw mesh look "melted" — rippled surfaces, hairline threads, floating specks, hollow bubbles, a
wavy underside — is cheap to fix IN THAT GRID, before any triangle exists, and the marching-cubes result is then a clean, evenly
tessellated, watertight surface. (Fixing it afterwards on millions of triangles can only blur it.)

What it does, in order (all numpy / scipy, on a crop around the object so the memory stays small):
  1. fragments   drop floating pieces much smaller than the main body, and fill enclosed hollow bubbles;
  2. threads     (strong only) a one-voxel morphological opening removes features thinner than three voxels (hair-thin spikes);
  3. smooth      Gaussian smoothing of the field (sub-voxel, removes the ripple), plus a band-pass boost that gives back the mid-size detail
                 (eyes, plate edges, ridges) that plain smoothing would wash out;
  4. flat base   when the figure stands on a slab (a wide, flat footprint right at the bottom) the bottom is cut to one plane.

It is applied by `install_polish(pipe.vae, options, log)`, which swaps `vae.surface_extractor` for a wrapper that polishes the grid and then calls
the original extractor — so the vertex coordinates, scaling and kwargs stay exactly Tencent's. Any failure falls back to the untouched grid.
"""
import time
from typing import Optional

import numpy as np

LEVELS = ("off", "standard", "strong")
# sigma of the denoising blur, sigma of the wide blur used for the detail boost, boost strength, smallest piece kept (fraction of the main body)
PARAMS = {
    "standard": {"sigma": 0.7, "wide": 2.0, "boost": 0.30, "piece": 0.02, "open": False},
    "strong": {"sigma": 1.0, "wide": 2.5, "boost": 0.45, "piece": 0.04, "open": True},
}


def _ndimage():
    from scipy import ndimage
    return ndimage


def _to_np(g) -> np.ndarray:
    """A float32 numpy copy of a torch tensor / array-like that has .numpy() / .cpu()."""
    if hasattr(g, "detach"):
        g = g.detach()
    if hasattr(g, "float"):
        try:
            g = g.float()
        except Exception:  # noqa: BLE001
            pass
    if hasattr(g, "cpu"):
        g = g.cpu()
    if hasattr(g, "numpy"):
        g = g.numpy()
    return np.array(g, dtype=np.float32, copy=True)


def _like(arr: np.ndarray, ref):
    """Give `arr` back in the same kind of container the caller passed (torch tensor stays a torch tensor)."""
    try:
        import torch
        if isinstance(ref, torch.Tensor):
            return torch.from_numpy(arr)
    except ImportError:
        pass
    wrap = getattr(ref, "__class__", None)
    if wrap is not None and wrap is not np.ndarray and hasattr(ref, "cpu") and hasattr(ref, "numpy"):
        try:
            return wrap(arr)
        except Exception:  # noqa: BLE001
            return arr
    return arr


# ----------------------------------------------------------------------------- pieces
def _drop_fragments(c: np.ndarray, frac: float, rep: dict) -> None:
    """Flip floating pieces (< frac of the biggest piece) to outside, and enclosed hollow bubbles to inside. Works in place on `c`."""
    nd = _ndimage()
    inside = c > 0
    lab, n = nd.label(inside)
    if n > 1:
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        keep = sizes >= max(8, frac * sizes.max())
        keep[0] = False
        bad = ~keep[lab] & inside
        k = int(n - keep.sum())
        if k:
            c[bad] = -np.abs(c[bad]) - 1e-3
            rep["fragments"] = rep.get("fragments", 0) + k
    outside = c <= 0
    lab, n = nd.label(outside)
    if n > 1:
        edge = lab[0, 0, 0]
        void = (lab != 0) & (lab != edge)
        if void.any():
            rep["voids"] = rep.get("voids", 0) + int(len(np.unique(lab[void])))
            c[void] = np.abs(c[void]) + 1e-3


def _open_thin(c: np.ndarray, rep: dict, iterations: int = 1) -> None:
    """Remove features thinner than 2*iterations+1 voxels (a 6-neighbour opening), in place."""
    nd = _ndimage()
    inside = c > 0
    opened = nd.binary_opening(inside, structure=nd.generate_binary_structure(3, 1), iterations=max(1, int(iterations)))
    cut = inside & ~opened
    n = int(cut.sum())
    if n:
        c[cut] = -np.abs(c[cut]) - 1e-3
        rep["thin_voxels"] = n


def _smooth_boost(c: np.ndarray, sigma: float, wide: float, boost: float) -> np.ndarray:
    nd = _ndimage()
    s1 = nd.gaussian_filter(c, sigma, mode="nearest")
    if boost > 0:
        s2 = nd.gaussian_filter(c, wide, mode="nearest")
        s1 += boost * (s1 - s2)
        del s2
    return s1


def find_base(inside: np.ndarray, up: int = 1) -> Optional[int]:
    """Index (along the up axis, counted from the bottom of the array) of the first full-size layer of a slab the object stands on, or None.
    A slab = a wide footprint (at least half of the widest layer) that is already there just above the very bottom and stays about the same
    for a few layers. A figure standing on its feet, a ball, a cone etc. do not qualify, so they are never cut."""
    ins = np.moveaxis(inside, up, 0)
    counts = ins.reshape(ins.shape[0], -1).sum(axis=1).astype(np.float64)
    nz = np.flatnonzero(counts > 0)
    if len(nz) < 12:
        return None
    lo, hi = int(nz[0]), int(nz[-1])
    h = hi - lo + 1
    a, b = lo + int(0.03 * h) + 2, lo + int(0.07 * h) + 3
    win = counts[a:b + 1]
    if len(win) < 2:
        return None
    F = float(np.median(win))
    if F < 0.5 * counts.max() or win.min() < 0.8 * F or win.max() > 1.25 * F:
        return None
    full = np.flatnonzero(counts[lo:] >= 0.9 * F)
    return lo + int(full[0]) if len(full) else None


def _cut_base(c: np.ndarray, up: int, i0: int) -> int:
    """Flat bottom: everything below layer i0 becomes outside, layer i0 becomes a constant inside value, so marching cubes puts one plane
    half a voxel under it. Returns the number of voxels removed."""
    cc = np.moveaxis(c, up, 0)              # a view
    removed = int((cc[:i0] > 0).sum())
    cc[:i0] = -1.0
    layer = cc[i0]
    layer[layer > 0] = 1.0
    return removed


def _silhouettes(inside: np.ndarray, up: int) -> dict:
    """The object's outline seen from each of the two horizontal directions: bool images with the top of the object at row 0."""
    others = [a for a in range(3) if a != up]
    out = {}
    for view in others:
        sil = inside.any(axis=view)                       # axes left: the up axis and the other horizontal one (in array order)
        rest = [a for a in range(3) if a != view]
        if rest[0] == up:
            sil = sil.T                                    # -> (horizontal, up)
        out[view] = np.ascontiguousarray(sil.T[::-1])      # -> (up flipped so top is row 0, horizontal)
    return out


# ----------------------------------------------------------------------------- the whole thing
def polish_grid(g: np.ndarray, level: str = "standard", flat_base: bool = False, up: int = 1, mc_level: float = 0.0, scale: float = 1.0) -> tuple:
    """Polishes one dense grid (positive inside). Returns (new grid, report). `g` is not modified.
    `scale` = grid resolution / 256: the blur widths are multiplied by it so a finer grid is smoothed over the same physical distance
    (1.0 keeps the original behaviour, which is what Hunyuan3D uses)."""
    rep: dict = {"level": level}
    t0 = time.time()
    c0 = g - np.float32(mc_level)
    inside = c0 > 0
    if not inside.any():
        rep["empty"] = True
        return g, rep
    pad = int(round(6 * max(1.0, float(scale))))
    sl = []
    for ax in range(3):
        idx = np.flatnonzero(inside.any(axis=tuple(a for a in range(3) if a != ax)))
        sl.append(slice(max(0, int(idx[0]) - pad), min(c0.shape[ax], int(idx[-1]) + 1 + pad)))
    sl = tuple(sl)
    del inside
    c = np.ascontiguousarray(c0[sl])
    del c0
    p = PARAMS.get(level, PARAMS["standard"])
    scale = max(0.5, min(3.0, float(scale)))

    _drop_fragments(c, p["piece"], rep)
    if p["open"]:
        _open_thin(c, rep, iterations=int(round(scale)))
        _drop_fragments(c, p["piece"], rep)
    c = _smooth_boost(c, p["sigma"] * scale, p["wide"] * scale, p["boost"])
    _drop_fragments(c, p["piece"], rep)                      # the boost can split thin bridges: drop what came loose
    if flat_base:
        i0 = find_base(c > 0, up)
        if i0 is not None:
            rep["base_removed_voxels"] = _cut_base(c, up, i0)
            rep["base_layer"] = int(i0 + sl[up].start)
        else:
            rep["base"] = "no slab found"
    ins = c > 0
    rep["silhouettes"] = _silhouettes(ins, up)
    rep["voxels"] = int(ins.sum())
    rep["seconds"] = round(time.time() - t0, 1)
    out = np.full_like(g, -1.0 + mc_level)
    out[sl] = c + np.float32(mc_level)
    return out, rep


def _norm_sil(mask: np.ndarray, size: int = 96) -> Optional[np.ndarray]:
    """Crop to the object, pad to a square, scale to size x size — so two outlines can be compared whatever their scale and position."""
    from PIL import Image
    ys, xs = np.where(mask)
    if len(ys) < 4:
        return None
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    s = max(m.shape)
    sq = np.zeros((s, s), np.uint8)
    oy, ox = (s - m.shape[0]) // 2, (s - m.shape[1]) // 2
    sq[oy:oy + m.shape[0], ox:ox + m.shape[1]] = m.astype(np.uint8) * 255
    return np.asarray(Image.fromarray(sq).resize((size, size), Image.BILINEAR)) > 127


def silhouette_score(sils: dict, alpha: np.ndarray) -> float:
    """How well the finished shape's outline (from either horizontal direction, either way round) matches the picture's cut-out — IoU 0..1.
    Both outlines are normalised for scale and position first, so only the SHAPE has to agree."""
    target = _norm_sil(alpha > 127)
    if target is None:
        return 0.0
    best = 0.0
    for sil in sils.values():
        got = _norm_sil(sil)
        if got is None:
            continue
        for cand in (got, got[:, ::-1]):
            union = np.logical_or(target, cand).sum()
            if union:
                best = max(best, float(np.logical_and(target, cand).sum() / union))
    return best


class PolishExtractor:
    """Stands in for `vae.surface_extractor`: polishes the grid, then lets the original extractor make the mesh (same kwargs, same scaling)."""

    def __init__(self, inner, level: str, flat_base: bool, up: int = 1, log=print):
        self.inner, self.level, self.flat_base, self.up, self.log = inner, level, flat_base, up, log
        self.report: dict = {}

    def __getattr__(self, name):
        return getattr(self.inner, name)

    def __call__(self, grid_logits, **kwargs):
        try:
            mc = float(kwargs.get("mc_level", 0.0) or 0.0)
            arrs = []
            for i in range(grid_logits.shape[0]):
                a, rep = polish_grid(_to_np(grid_logits[i]), self.level, self.flat_base, self.up, mc)
                arrs.append(a)
                self.report = rep
            self.log("surface clean-up: " + ", ".join(f"{k} {v}" for k, v in self.report.items() if k != "silhouettes"))
            stacked = np.stack(arrs, axis=0)
            return self.inner(_like(stacked, grid_logits), **kwargs)
        except Exception as e:  # noqa: BLE001 — never lose a model over the clean-up (a MemoryError here just means: use the raw grid)
            self.log(f"surface clean-up skipped ({type(e).__name__}: {e})")
            self.report = {"error": f"{type(e).__name__}: {e}"}
            return self.inner(grid_logits, **kwargs)


def install_polish(vae, level: str, flat_base: bool, log=print, up: int = 1) -> Optional[PolishExtractor]:
    """Wraps vae.surface_extractor. Returns the wrapper (its .report holds the last clean-up's numbers) or None when off / not possible."""
    if level not in ("standard", "strong"):
        return None
    inner = getattr(vae, "surface_extractor", None)
    if inner is None:
        log("surface clean-up skipped: the pipeline has no surface_extractor")
        return None
    if isinstance(inner, PolishExtractor):
        inner = inner.inner
    wrapper = PolishExtractor(inner, level, bool(flat_base), up, log)
    vae.surface_extractor = wrapper
    return wrapper


def summary(rep: dict) -> str:
    """A sentence for the user."""
    if not rep or "error" in rep or rep.get("empty"):
        return ""
    bits = []
    if rep.get("fragments"):
        bits.append(f"removed {rep['fragments']} floating piece{'s' if rep['fragments'] != 1 else ''}")
    if rep.get("voids"):
        bits.append(f"filled {rep['voids']} hollow bubble{'s' if rep['voids'] != 1 else ''}")
    if rep.get("thin_voxels"):
        bits.append("trimmed hair-thin spikes")
    if "base_layer" in rep:
        bits.append("cut a flat base")
    return "Surface clean-up (" + rep.get("level", "") + "): smoothed the field" + ("; " + ", ".join(bits) if bits else "") + "."
