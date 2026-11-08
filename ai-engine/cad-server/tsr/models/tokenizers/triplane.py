# faelyx.AI — TripoSR core, ported into the faelyx.AI Image to 3D module.
# Original work: Copyright (c) 2024 Tripo AI & Stability AI, MIT License
# (https://github.com/VAST-AI-Research/TripoSR). The original notice and licence text are kept in
# tsr/LICENSE-TripoSR and tsr/THIRD_PARTY_NOTICES.md; faelyx.AI additions are governed by
# ../LICENSE-faelyx-image-to-3d.md. Unmodified apart from this header.

import math
from dataclasses import dataclass

import torch
import torch.nn as nn
from einops import rearrange, repeat

from ...utils import BaseModule


class Triplane1DTokenizer(BaseModule):
    @dataclass
    class Config(BaseModule.Config):
        plane_size: int
        num_channels: int

    cfg: Config

    def configure(self) -> None:
        self.embeddings = nn.Parameter(
            torch.randn(
                (3, self.cfg.num_channels, self.cfg.plane_size, self.cfg.plane_size),
                dtype=torch.float32,
            )
            * 1
            / math.sqrt(self.cfg.num_channels)
        )

    def forward(self, batch_size: int) -> torch.Tensor:
        return rearrange(
            repeat(self.embeddings, "Np Ct Hp Wp -> B Np Ct Hp Wp", B=batch_size),
            "B Np Ct Hp Wp -> B Ct (Np Hp Wp)",
        )

    def detokenize(self, tokens: torch.Tensor) -> torch.Tensor:
        batch_size, Ct, Nt = tokens.shape
        assert Nt == self.cfg.plane_size**2 * 3
        assert Ct == self.cfg.num_channels
        return rearrange(
            tokens,
            "B Ct (Np Hp Wp) -> B Np Ct Hp Wp",
            Np=3,
            Hp=self.cfg.plane_size,
            Wp=self.cfg.plane_size,
        )
