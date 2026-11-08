# Third-party notices — faelyx.AI Image to 3D

The `tsr/` package is the TripoSR reference implementation, ported into faelyx.AI. The files keep the
upstream copyright; faelyx.AI added a header to each one and modified only what its header says.

## TripoSR — MIT License

Source: https://github.com/VAST-AI-Research/TripoSR

```
MIT License

Copyright (c) 2024 Tripo AI & Stability AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Hugging Face diffusers — Apache License 2.0

`tsr/models/transformer/attention.py`, `basic_transformer_block.py` and `transformer_1d.py` are adapted
from Hugging Face `diffusers` (Copyright 2023 The HuggingFace Team). Licence: http://www.apache.org/licenses/LICENSE-2.0
The upstream Apache header is kept at the top of each of those files.

## Model weights and configuration files (downloaded at run time, not shipped)

- `stabilityai/TripoSR` (`config.yaml`, `model.ckpt`) — MIT — https://huggingface.co/stabilityai/TripoSR
- `facebook/dino-vitb16` (`config.json`) — Apache-2.0 — https://huggingface.co/facebook/dino-vitb16

## Python packages (installed separately, not shipped)

PyTorch, transformers, omegaconf, einops, trimesh, rembg, onnxruntime, imageio, huggingface-hub, Pillow and
scikit-image are installed from PyPI under their own licences (see `requirements-triposr.txt`).
