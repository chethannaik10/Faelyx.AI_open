# Image to 3D is now TripoSR (faelyx.AI)

The old Pixal3D / "quick solid" Image to 3D was removed and replaced with a native TripoSR pipeline.

## What changed

**Removed:** the Pixal3D connector (server detection, Find server, engine picker, `/image_to_3d/engines`, `/config`, `/pixal/detect`), and the built-in "quick solid" (inflate / relief). No Pixal or Meshy code is left in the project.

**Added (backend, `ai-engine/cad-server/`):**
- `tsr/` — the TripoSR core (VAST-AI-Research/TripoSR, MIT, © Tripo AI & Stability AI), ported with faelyx.AI file headers and the original MIT notice kept. Only `tsr/models/isosurface.py` is modified: marching cubes falls back to scikit-image when `torchmcubes` (which needs a compiler on Windows) is not installed.
- `image_to_3d.py` — rewritten. Preprocess (background removal, foreground resize, grey composite) → TripoSR → marching cubes → cleanup / decimation → STL, PLY, OBJ, GLB (vertex colours). Weights download on first use with a progress message. Packages and GPU are checked at request time, so the CAD server still starts without PyTorch.
- `requirements-triposr.txt`, `IMAGE_TO_3D.md` (setup and troubleshooting), `LICENSE-faelyx-image-to-3d.md` (faelyx.AI module licence — a draft, not reviewed by a lawyer), `tsr/LICENSE-TripoSR`, `tsr/THIRD_PARTY_NOTICES.md`.

**Changed (frontend, `ai-engine/faelyx-ui/src/`):**
- `ImageTo3DPanel.tsx`, `imageTo3D.ts`, `MeshPreview.tsx` — new panel: setup status (missing packages, GPU/CPU, weights with progress and "Download now"), picture drop, Remove the background, Foreground ratio, Mesh resolution, Memory use, Mesh detail, Generate / Cancel, result preview (Colour / Clay / Wireframe, Universal mouse scheme unchanged), placement, Add to model as a mesh body, STL / PLY / OBJ / GLB downloads.
- `howTo3D.ts`, `partDesign.ts`, `App.tsx` (tree tooltip), `index.css` — text and styles updated; the dead engine / server styles were removed.
- `.gitignore` ignores `ai-engine/cad-server/triposr_models/`; root `requirements.txt` points to the new optional file.

## Quality and smoothing options (added the same day)

Modelled on Image to Sketch: ready-made modes plus a live clean-up of the input, and options that act on the result without re-running the model.
- **Quality mode:** Quick draft, Balanced, Best detail, Smooth / organic, Hard-surface, 3D-print ready.
- **Picture:** rotate, flip and crop; Object size; Cut-out edge (−12…+12 px); Fill holes in the cut-out; Even out lighting and contrast; *Preview what TripoSR sees* (backend `/image_to_3d/preview`, runs only the picture step and stays live as options change).
- **3D model:** Mesh resolution, Surface level (density threshold), Memory use.
- **Mesh finishing (instant, on the finished mesh):** Smoothing (Taubin, volume-preserving), Keep sharp edges, Loose pieces (all / tiny bits / largest only), Close holes (watertight), Mesh detail. The full-detail mesh is kept on the server so these can change freely.

## Image to 3D is a pop-up window

Clicking **Image to 3D** now opens a window like Image to Sketch instead of using the right-hand pane: picture / cut-out / 3D result on the left (Image · Cut-out · 3D model views), numbered option groups on the right (1 Engine, 2 Quality mode, 3 Picture, 4 3D model, 5 Mesh finishing, 6 Size & placement), result stats and actions (Generate, Add to model as a mesh body, STL / PLY / OBJ / GLB downloads) in the footer. A running model keeps going if the window is closed. New file `ImageTo3DDialog.tsx`; `ImageTo3DPanel.tsx` is now an empty stub that can be deleted.

## To run it

1. Install PyTorch for your machine (pytorch.org/get-started), in the venv that runs `cad_server.py`.
2. `pip install -r ai-engine/cad-server/requirements-triposr.txt`
3. Restart the backend, open Image to 3D, drop a picture, press Generate. The first run downloads about 1.7 GB of weights.

## Tested / not tested

- Backend logic was tested with a stand-in model (37 checks: preprocessing, options, missing packages, download progress / error / cancel, mesh cleanup, STL / PLY / OBJ / GLB writers, placement, out-of-memory message, routes). Frontend typechecks and was exercised in the browser against a mocked backend.
- **Not tested:** real TripoSR inference, the real weights download, and PyTorch / transformers on Python 3.14. `transformers<5` is a precaution, not a verified requirement.

## Hunyuan3D 2.1 added as a second, higher-quality engine

Why: the open TripoSR weights are a 2024 draft model; the Tripo website runs newer commercial models that cannot be downloaded, so no setting or weight file closes that gap. Tencent's **Hunyuan3D 2.1** (June 2025, open weights) is the closest open model.

**Added (backend, `ai-engine/cad-server/`)**
- `hunyuan3d_worker/worker.py` — runs in its own Python 3.10 environment as a child process: shape model → surface extraction → optional PBR colour stage → colour transferred onto the full-detail shape → quadric levels of detail. Memory modes full / balanced / low (the 3.3B transformer streams from RAM) chosen from free VRAM with automatic step-down on out-of-memory; colour stage falls back to the plain shape with an explanation.
- `hunyuan3d.py` — reads `hunyuan3d_runtime/config.json`, starts / stops the worker, weight download with exact progress, status. Imports nothing heavy.
- `setup_hunyuan3d.py` / `setup_hunyuan3d.bat` — creates the Python 3.10 environment (conda or `py -3.10`), PyTorch 2.5.1 + CUDA 12.4 (2.7 + 12.8 for RTX 50-series), requirements, builds the colour-stage native modules, downloads RealESRGAN, self-tests.
- `image_to_3d.py` — `engine` option, Hunyuan job path, level-of-detail finishing (the face cap picks the matching quadric level instead of clustering), `cutout_rgba`, selectable rembg cut-out model (Standard / Sharper edges / Finest), routes `POST /image_to_3d/hunyuan/download` and `GET /image_to_3d/jobs/{id}/original.glb`, Hunyuan status inside `/image_to_3d/status`.
- `NOTICE-hunyuan3d.txt`, licence file updated with the Tencent terms that pass through (territory, no training other models, Acceptable Use Policy), `IMAGE_TO_3D.md` rewritten for two engines. `.gitignore` ignores `hunyuan3d_runtime/`.

**Changed (frontend)** — `imageTo3D.ts`, `ImageTo3DDialog.tsx`, `index.css`, `howTo3D.ts`, `partDesign.ts`, `App.tsx`: engine picker (Hunyuan3D 2.1 is chosen automatically when it is set up), setup / weights / licence panel, Hunyuan options (Surface detail, Shape quality, Follow the picture, Colour, views / detail, GPU memory, Seed), Cut-out model, PBR GLB download, note when the colour stage did not run. The Universal mouse scheme is untouched.

**Tested:** 100 checks with a stand-in worker (options, job flow, weight download and its failure, progress, cancel kills the process, files cleaned up, levels of detail, colours kept, routes, not-installed messages), plus the colour-transfer maths. Frontend typechecks.
**Not tested (cannot be, off the target PC):** the real install on Windows, the CUDA / C++ builds, real Hunyuan3D inference, and the low-VRAM modes on a GPU under 8 GB.

**Licence:** Hunyuan3D 2.1 is *not* open source — Tencent Hunyuan 3D 2.1 Community License: not licensed in the EU, UK or South Korea; output must not train other AI models; 1M-monthly-user cap; Acceptable Use Policy. The window shows the "Powered by Tencent Hunyuan / not affiliated" notice. Have the licence read by a lawyer before faelyx.AI distributes it.

## Hunyuan3D 2.1 can run on Google Colab
- New `Faelyx_Hunyuan3D_Colab.ipynb` (in `ai-engine/cad-server/`): installs Hunyuan3D 2.1 on a Colab GPU, downloads the model files, starts `colab_server.py` and prints a connection code.
- Image to 3D → Hunyuan3D 2.1 → **Run on: This computer / Google Colab**. Paste the code, press Connect; pictures are sent to Colab and the finished model (shape, optional colour, LODs, PBR GLB) comes back. The saved connection can be switched off or forgotten.
- Backend: `hunyuan3d.py` gained a remote client (all public functions are local-or-remote), `image_to_3d.py` two routes (`POST`/`DELETE /image_to_3d/hunyuan/remote`), `setup_hunyuan3d.py` a Linux path (Python 3.10 through `uv`, Linux native builds) used by the notebook.
- Tested here with a stand-in worker: the Faelyx ⇄ server loop (connect, wrong access code, download, run, error text, cancel, busy, server gone) — 31 checks; the older Image to 3D suite — 106 checks. **Not tested:** the notebook on real Colab (install on Python 3.10 via uv, native colour builds, Cloudflare tunnel) and a real Hunyuan3D run there.
- **Lower-memory model loading (worker):** Tencent's loader peaks at ~21 GB of RAM (7.4 GB checkpoint read into RAM plus the 3.3B transformer built in float32), which ends the worker on a 16 GB PC and crashes a free Colab machine (12.7 GB). The worker now memory-maps the checkpoint and builds the transformer directly in float16 with random initialisation off (~8 GB peak, same float16 model); if that path fails it falls back to Tencent's loader. Control flow tested with stand-ins; **not** measured on real hardware.

## TripoSR can run on Google Colab too
- **Image to 3D → TripoSR → Run on: This computer / Google Colab.** One Colab session serves both engines with the same connection code; each engine has its own *Run on* switch. Connecting from either engine saves the code for both; *Forget* removes it for both.
- The notebook (`Faelyx_Hunyuan3D_Colab.ipynb`, same file name) has a new **Engines** choice in cell 1: *Both* (default), *TripoSR only* (~4 min install, 1.7 GB model) or *Hunyuan3D 2.1 only*. **Upload the new notebook** — an old one is recognised and Faelyx asks for the new one instead of running the wrong engine.
- Where the work happens: the cut-out and framing still run on this PC (needs `rembg` + `onnxruntime`, **no PyTorch**); the Colab GPU turns the prepared picture into a mesh (new `triposr_colab.py` + the `tsr/` package, run as a child process in a small environment that reuses Colab's PyTorch); cleaning, smoothing, face count and placement run here again. So a PC without a GPU or PyTorch can use TripoSR this way.
- Backend: `preprocess()` no longer imports `tsr.utils` (which needs PyTorch) — identical cut-out/framing code now lives in `image_to_3d.py`; new route `POST /image_to_3d/triposr/remote`; `/image_to_3d/status` carries `where`/`remote` for TripoSR (hardware and weights then describe the Colab machine); `colab_server.py` takes `"engine": "triposr"` jobs and reports a `triposr` block in `/health`.
- Tested here with stand-ins: Faelyx ⇄ Colab server loop for TripoSR with the real worker code and a fake torch/tsr (connect, weights download, model, out-of-memory message, cancel, old notebook, not installed, engine switches) — 30 checks; Hunyuan Colab loop 31; Image to 3D suite 106; dialog in a real browser against real status payloads — 23 checks; typecheck clean. **Not tested:** the TripoSR install and run on real Colab (venv with `--system-site-packages`, `transformers<5` on Colab's PyTorch, a real model download).
