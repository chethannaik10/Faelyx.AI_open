# faelyx.AI Image to 3D Module License

Copyright (c) 2026 faelyx.AI. All rights reserved.

> Draft prepared with the module and **not reviewed by a lawyer**. Replace or amend it with the
> terms faelyx.AI actually wants before the module is distributed outside the company.

## Scope

This licence covers the faelyx.AI-authored parts of the Image to 3D module ("the Module"):

- `ai-engine/cad-server/image_to_3d.py` and its tests,
- the Hunyuan3D 2.1 integration: `hunyuan3d.py`, `hunyuan3d_worker/worker.py`, `setup_hunyuan3d.py`, `setup_hunyuan3d.bat`,
- `ai-engine/cad-server/requirements-triposr.txt` and `IMAGE_TO_3D.md`,
- the faelyx.AI modifications marked in the headers of the files under `ai-engine/cad-server/tsr/`,
- the front-end files `imageTo3D.ts`, `ImageTo3DPanel.tsx` and `MeshPreview.tsx` under `ai-engine/faelyx-ui/src/`.

## Grant

faelyx.AI grants you a non-exclusive, non-transferable licence to run and modify the Module as part of
faelyx.AI software for your own use. You may not redistribute, sublicense or sell the Module, alone or
inside another product, without written permission from faelyx.AI.

## Third-party components — not covered by this licence

The Module builds on open-source work that keeps its own licence. Those licences are unchanged by this
file and their notices must stay with any copy of the code:

| Component | Licence | Where |
|---|---|---|
| TripoSR source code (`tsr/`) — © 2024 Tripo AI & Stability AI | MIT | `ai-engine/cad-server/tsr/LICENSE-TripoSR` |
| Code adapted from Hugging Face `diffusers` inside `tsr/models/transformer/` | Apache-2.0 | headers of those files |
| TripoSR model weights (`stabilityai/TripoSR`, downloaded at run time) | MIT | https://huggingface.co/stabilityai/TripoSR |
| `facebook/dino-vitb16` configuration (downloaded at run time) | Apache-2.0 | https://huggingface.co/facebook/dino-vitb16 |
| Hunyuan3D 2.1 code and weights (optional engine; cloned / downloaded by the user, never copied into this project) — © 2025 Tencent | Tencent Hunyuan 3D 2.1 Community License (not an open-source licence) | `ai-engine/cad-server/NOTICE-hunyuan3d.txt`, https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE |

See `ai-engine/cad-server/tsr/THIRD_PARTY_NOTICES.md` for the full list.

## Hunyuan3D 2.1 engine — terms that pass through to users

The optional Hunyuan3D 2.1 engine is © Tencent and is used under the Tencent Hunyuan 3D 2.1 Community License. By using that engine you
also agree to the use restrictions of Sections 5(a) and 5(b) and the Acceptable Use Policy (Exhibit A) of that licence. In short: it must
not be used in the European Union, the United Kingdom or South Korea; its output must not be used to train or improve another AI model; and
it may not be used for the purposes the Acceptable Use Policy lists (unlawful, harmful, deceptive or military use among them). Powered by
Tencent Hunyuan. faelyx.AI is the provider of this module; Tencent is not affiliated with, sponsoring or endorsing it. See `NOTICE-hunyuan3d.txt`.

## No warranty

THE MODULE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. Models generated from pictures may be
inaccurate and are not a substitute for engineering design or verification.
