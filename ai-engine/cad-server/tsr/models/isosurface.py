# faelyx.AI — TripoSR core, ported into the faelyx.AI Image to 3D module.
# Original work: Copyright (c) 2024 Tripo AI & Stability AI, MIT License
# (https://github.com/VAST-AI-Research/TripoSR). The original notice and licence text are kept in
# tsr/LICENSE-TripoSR and tsr/THIRD_PARTY_NOTICES.md; faelyx.AI additions are governed by
# ../LICENSE-faelyx-image-to-3d.md. Modified by faelyx.AI: falls back to scikit-image marching cubes
# when torchmcubes is not installed (it needs a C++/CUDA build, which is hard on Windows).

from typing import Callable, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn

try:
    from torchmcubes import marching_cubes
except ImportError:  # faelyx.AI: torchmcubes needs a C++/CUDA build — use scikit-image instead
    marching_cubes = None


def _skimage_marching_cubes(vol: torch.Tensor, thresh: float):
    """Drop-in for torchmcubes.marching_cubes (same return layout: vertices with the last volume axis
    first, int64 faces), computed on the CPU with scikit-image. Slower than torchmcubes on a GPU but
    needs no compiler. An empty volume (nothing above the level) gives an empty mesh."""
    from skimage.measure import marching_cubes as _mc

    arr = vol.detach().cpu().float().numpy()
    try:
        verts, faces, _normals, _values = _mc(arr, level=thresh)
    except ValueError:
        return torch.zeros((0, 3), dtype=torch.float32), torch.zeros((0, 3), dtype=torch.int64)
    verts = np.ascontiguousarray(verts[:, ::-1])
    return torch.from_numpy(verts.astype(np.float32)), torch.from_numpy(faces.astype(np.int64))


class IsosurfaceHelper(nn.Module):
    points_range: Tuple[float, float] = (0, 1)

    @property
    def grid_vertices(self) -> torch.FloatTensor:
        raise NotImplementedError


class MarchingCubeHelper(IsosurfaceHelper):
    def __init__(self, resolution: int) -> None:
        super().__init__()
        self.resolution = resolution
        self.mc_func: Callable = marching_cubes if marching_cubes is not None else _skimage_marching_cubes
        self._grid_vertices: Optional[torch.FloatTensor] = None

    @property
    def grid_vertices(self) -> torch.FloatTensor:
        if self._grid_vertices is None:
            # keep the vertices on CPU so that we can support very large resolution
            x, y, z = (
                torch.linspace(*self.points_range, self.resolution),
                torch.linspace(*self.points_range, self.resolution),
                torch.linspace(*self.points_range, self.resolution),
            )
            x, y, z = torch.meshgrid(x, y, z, indexing="ij")
            verts = torch.cat(
                [x.reshape(-1, 1), y.reshape(-1, 1), z.reshape(-1, 1)], dim=-1
            ).reshape(-1, 3)
            self._grid_vertices = verts
        return self._grid_vertices

    def forward(
        self,
        level: torch.FloatTensor,
    ) -> Tuple[torch.FloatTensor, torch.LongTensor]:
        level = -level.view(self.resolution, self.resolution, self.resolution)
        try:
            v_pos, t_pos_idx = self.mc_func(level.detach(), 0.0)
        except AttributeError:
            print("torchmcubes was not compiled with CUDA support, use CPU version instead.")
            v_pos, t_pos_idx = self.mc_func(level.detach().cpu(), 0.0)
        v_pos = v_pos[..., [2, 1, 0]]
        v_pos = v_pos / (self.resolution - 1.0)
        return v_pos.to(level.device), t_pos_idx.to(level.device)
