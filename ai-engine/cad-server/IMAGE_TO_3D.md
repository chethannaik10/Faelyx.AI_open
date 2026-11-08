# Image to 3D — setup and operation

faelyx.AI © 2026. Two engines, chosen in the window under **1 · Engine**:

| | Hunyuan3D 2.1 (recommended) | TripoSR |
|---|---|---|
| Made by | Tencent (June 2025) | VAST-AI-Research / Stability AI |
| Quality | Far finer geometry and optional PBR colour — the open model closest to commercial services | Draft quality (a 2024 feed-forward model) |
| Speed | Minutes (many minutes on a GPU under 12 GB) | Seconds |
| Setup | `setup_hunyuan3d.bat` once, own Python 3.10 environment, large downloads | `pip install -r requirements-triposr.txt` |
| Licence | Tencent Hunyuan 3D 2.1 Community License (**not** open source: not for EU / UK / South Korea, no training other models, 1M-user cap) — see `NOTICE-hunyuan3d.txt` | MIT |

Why TripoSR looks worse than the Tripo website: the website runs Tripo's newer commercial models, which are not downloadable. The open TripoSR
weights are the 2024 draft model, and no better weights exist for it. Hunyuan3D 2.1 is the engine to use when quality matters.

Licences: `LICENSE-faelyx-image-to-3d.md`, `NOTICE-hunyuan3d.txt`, `tsr/THIRD_PARTY_NOTICES.md`.

## Hunyuan3D 2.1 — one-time setup (Windows)

Needs an NVIDIA GPU. Tencent lists about 10 GB of video memory for the shape stage, 21 GB for the colour stage and 29 GB for both; Faelyx
adds a *Low memory* mode that streams the 3.3-billion-parameter shape model from system RAM, so smaller GPUs work but each model takes many
minutes. About 20 GB of RAM is used while the shape model loads (the page file covers a shortfall, slowly). Plan for roughly 10 GB for the
environment and 20–30 GB for the model files.

1. Clone Tencent's code (already done if you have `Hunyuan3D-2.1` in Downloads): `git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git`
2. Double-click **`setup_hunyuan3d.bat`** in this folder (or run `python setup_hunyuan3d.py`). It
   - finds the clone (or use `--repo <folder>`),
   - makes a separate **Python 3.10** environment in `hunyuan3d_runtime/env` (conda if present, else the `py -3.10` launcher) — the CAD server's own Python is never touched,
   - installs PyTorch **2.5.1 + CUDA 12.4** (RTX 50-series cards get 2.7 + CUDA 12.8) and Tencent's requirements,
   - for the **colour stage**: installs `bpy`, `basicsr`, `realesrgan`; builds `custom_rasterizer` (CUDA) and `mesh_inpaint_processor` (C++); downloads `RealESRGAN_x4plus.pth`.
     This needs **Visual Studio 2022 Build Tools** ("Desktop development with C++") and the **CUDA Toolkit 12.x**. `--install-prereqs` tries to install them with winget.
     If they are missing, or a build fails, the shape stage still works and Image to 3D makes uncoloured models.
   - self-tests everything and writes `hunyuan3d_runtime/config.json`. Run it again any time; finished steps are skipped. `--shape-only` skips the colour stage, `--check` only re-tests.
3. Restart the backend (`start_backend.bat`), open Image to 3D, choose **Hunyuan3D 2.1**. The model files (Hugging Face `tencent/Hunyuan3D-2.1`, plus `facebook/dinov2-giant` for colour)
   download into `hunyuan3d_runtime` the first time you generate, or when you press *Download model files now*; the window shows the progress.

## Google Colab (when this PC is too small) — Hunyuan3D 2.1 and TripoSR

Either engine can run on a Colab GPU instead of your own card; one Colab session serves both with the same connection code. Faelyx sends the cut-out picture there and brings the finished model back;
everything after that (smoothing, face count, placement, adding the body) is unchanged.

1. Open <https://colab.research.google.com> → **File → Upload notebook** → `Faelyx_Hunyuan3D_Colab.ipynb` (in this folder).
2. **Runtime → Change runtime type** → a GPU (T4 is the free one). In cell 1 choose **Engines**: *TripoSR only*, *Hunyuan3D 2.1 only* or *Both* (default). Then **Runtime → Run all**.
   - **TripoSR**: about 4 minutes. A small environment that reuses Colab's own PyTorch gets the few missing packages (it never touches the notebook's Python), then the 1.7 GB model downloads.
   - **Hunyuan3D 2.1**: about 15–25 minutes (an isolated Python 3.10 environment, PyTorch 2.5.1, Tencent's requirements, and — if *Colour stage* is ticked in cell 1 — the native colour modules),
     then the model files download (cell 4, or Faelyx's *Download model files* button).
3. The last cell prints a **connection code** (`https://….trycloudflare.com#access-code`) and stays running. In Faelyx:
   *Image to 3D → pick the engine → Run on → Google Colab → paste → Connect*. To use the other engine on Colab too, pick it and choose **Run on → Google Colab** — the saved code is reused.
4. Switch back with **Run on → This computer** at any time, per engine. The saved connection is kept (`hunyuan3d_runtime/remote.json`) until you press *Forget*.

Things to know:

- The Colab machine is wiped when the session ends, so each session installs and downloads again, and every session has a new address — paste the new code.
- The picture and the model pass through Google's machine and a Cloudflare quick tunnel; the access code is the only protection, so do not send confidential work.
- One model at a time per Colab session (either engine). *Stop* in Faelyx stops it there too.
- TripoSR on Colab: the cut-out and framing still happen on this computer (they need `rembg` + `onnxruntime`, **not** PyTorch), the Colab GPU turns the picture into a mesh, and the cleaning/smoothing/face-count steps run here again. So a PC without a graphics card or PyTorch can use TripoSR this way.
- An **old notebook** (from before TripoSR was added) is recognised by Faelyx, which then asks you to upload the new one rather than running the wrong engine.
- A free T4 has about 15 GB of video memory: enough for the shape stage; the colour stage (Tencent lists 21 GB) uses the memory-saving mode and is slower.
- Colab's free tier has usage limits and may disconnect; read Google's current Colab terms for what a notebook may be used for.
- How it works: `colab_server.py` (a small FastAPI service) runs the same `hunyuan3d.py` / `hunyuan3d_worker/worker.py` as the desktop install, and `triposr_colab.py` + the `tsr/` package for TripoSR; `hunyuan3d.py` here
  talks to it over HTTPS when a connection is saved (`image_to_3d.py` uses that connection for TripoSR). After changing any of those files run `python make_colab_notebook.py` to rebuild the notebook.
- Routes: `POST /image_to_3d/hunyuan/remote` and `POST /image_to_3d/triposr/remote` (`{"code": "…"}` connects, `{"enabled": false}` goes back to this PC for that engine), `DELETE /image_to_3d/hunyuan/remote` forgets the connection for both.

### How a model is made
picture → cut-out (rembg; *Cut-out model* decides how good) → Hunyuan3D shape model (flow-matching transformer, 20–100 steps) → surface extraction
(256³–512³ grid) → optional colour: 6–8 views painted by the PBR multi-view model, super-resolved with Real-ESRGAN and baked → the colours are
transferred onto the full-detail shape → quadric-decimated levels of detail (20k / 60k / 150k faces) so *Mesh detail* keeps the shape instead of clustering it.
Everything runs in a child process (`hunyuan3d_worker/worker.py`); *Stop* ends it and frees the GPU.

### Memory modes (GPU memory = Automatic by default)
| Mode | When | What happens |
|---|---|---|
| Full speed | about 13 GB or more free | everything on the GPU |
| Balanced | about 9 GB free | one network at a time on the GPU |
| Low memory | less | the big transformer is streamed layer by layer from RAM; the small parts stay on the GPU |

If a mode runs out of memory the next lower one is tried, and surface extraction retries with smaller chunks and then a smaller grid.
The colour stage uses model offloading below 24 GB; if it still cannot fit, you get the plain shape and a note saying so.

> **Not verified by the author of this module:** the real Hunyuan3D run on a GPU under 8 GB, the Windows builds of the two native colour modules, and the
> install on your exact PC. The pipeline, options, worker protocol, cancel, level-of-detail and colour-transfer maths are tested with a stand-in worker.
> If setup or a first run fails, send `hunyuan3d_runtime/logs/setup.log` or `hunyuan3d_runtime/jobs/<id>/worker.log`.

Environment variables: `FAELYX_HUNYUAN_HOME` (runtime folder), `FAELYX_HUNYUAN_REPO` (the clone).

### Meshy-style clean surface (Hunyuan3D)
Hunyuan3D's raw surface is a little lumpy and can carry floating specks and thin threads; commercial tools hide this with a polishing pass. Faelyx does the
same, **without editing any Tencent file**: `hunyuan3d_worker/faelyx_polish.py` wraps the cloned repo's surface extractor at run time, so it also works on Colab (which
clones Hunyuan fresh) and survives a `git pull` of the clone. Before the marching-cubes step it works on the dense density grid:

- removes floating fragments and (strong) thin threads, keeps every real part of the figure;
- smooths the field with a Gaussian and adds back a little band-pass detail, so edges stay crisp while the stair-step ripple goes (volume change ≈ 0.1 %);
- *Flat base*: finds a flat standing plate, or trims a level one, so the model sits on the build plate;
- *Tries*: runs the shape stage with seeds seed, seed+1 … and keeps the one whose silhouette (IoU) best matches your picture's cut-out.

Any failure inside the polish falls back to the untouched Hunyuan surface. Needs `scipy` and `Pillow` in the Hunyuan environment (scikit-image already brings scipy).
For characters: mode **Clean figurine (Meshy-style)** (guidance 5, 50 steps, surface detail 512³, strong clean-up, flat base, 2 tries) — about twice as slow. It cannot invent detail
the model did not make (eyes, fingers, the back of the figure come from Hunyuan3D itself). On Colab, re-upload the newest notebook; an older one ignores these options.

## TripoSR — setup

### One-time setup (in the environment that runs `cad_server.py`)

1. Install PyTorch for your hardware — see the top of `requirements-triposr.txt`.
2. `pip install -r requirements-triposr.txt`
3. Restart the backend (`start_backend.bat`).
4. In 3D Design open **AI GENERATE → Image to 3D** (a pop-up window, like Image to Sketch). The first picture downloads the model weights
   (`stabilityai/TripoSR`, about 1.7 GB) into `ai-engine/cad-server/triposr_models/` — the panel shows the progress.
   To skip the download, put `config.yaml` and `model.ckpt` in a folder and start the backend with
   `FAELYX_TRIPOSR_MODEL=<that folder>` (the small `facebook/dino-vitb16` config is still fetched once).

## What it needs
- Python 3.10+ with the packages above; an NVIDIA GPU is recommended (about 6 GB VRAM at the defaults, “Low memory” needs less).
  Without a GPU it runs on the CPU in a few minutes.
- Internet access only for the first-run download.

## Settings (pop-up window)

**Quality mode** sets the groups below in one go (for both engines): Quick draft, Balanced (default), Best detail, Smooth / organic, Hard-surface, 3D-print ready, Clean figurine (Meshy-style). Moving any slider makes it "Custom".

**Picture** (sent to the backend; a live cut-out preview runs only this step)
| Setting | Meaning | Default |
|---|---|---|
| Rotate / flip / crop | done in the browser before sending; drag on the picture to crop | – |
| Remove the background | rembg cut-out, or the picture's own transparency | on |
| Object size | how much of the frame the object fills (50–100 %) | 85 % |
| Cut-out edge | −12…+12 px: shrink the cut-out (trim a halo) or grow it (restore thin parts) | 0 |
| Fill holes in the cut-out | closes hollows in the mask | off |
| Even out lighting and contrast | auto-contrast + light sharpening before the cut-out | off |
| Cut-out model | rembg model: Standard (u2net) / Sharper edges (isnet-general-use) / Finest detail (birefnet-general, about 1 GB download). Hunyuan3D starts on Sharper edges. | Standard |

**3D model — TripoSR** (used when TripoSR runs — Generate again after changing)
| Setting | Meaning | Default |
|---|---|---|
| Mesh resolution | high-detail extraction grid (32–512³; see *TripoSR high-detail mesh* below) | 384 |
| Surface clean-up | off / standard / strong — fixes the density grid before the mesh exists (floating specks, hollow bubbles, ripple; strong also removes hair-thin spikes) | standard |
| Flat base | cuts one flat bottom plane when the figure stands on a slab (does nothing otherwise) | on |
| Paint colour while making | colour is a separate step; off = clean shape, press **Add colour** afterwards | off |
| Surface level | density threshold (10–50): lower = fuller / thicker, higher = thinner / less fuzz | 25 |
| Memory use | Standard / Low (smaller chunks, slower, less VRAM) | Standard |

**3D model — Hunyuan3D 2.1** (Generate again after changing)
| Setting | Meaning | Default |
|---|---|---|
| Surface detail | grid the surface is cut from, 256³–512³ | 384³ |
| Shape quality (steps) | refinement steps, 20–100 | 50 |
| Follow the picture | guidance, 2–9 | 5 |
| Colour | paint PBR colours (slowest step) or shape only | paint, when installed |
| Colour views / detail | 6 or 8 views; 512 or 768 px | 6 / 512 |
| GPU memory | automatic / full / balanced / low | automatic |
| Seed | same seed, same shape | 1234 |
| Surface clean-up | Meshy-style polish of the shape *before* the mesh is made: off / standard / strong (see below) | standard |
| Flat base | detects a flat standing plate under a figure (or cuts a level one) | off |
| Tries (keeps the best) | 1–4 seeds; the one whose outline matches your cut-out best is kept | 1 |

**Mesh finishing** (applied to the finished mesh, instantly, no new model run; the full-detail mesh is kept on the server)
| Setting | Meaning | Default |
|---|---|---|
| Smoothing | 0–20 Taubin passes (volume-preserving) | 0 |
| Keep sharp edges | pins vertices on creases sharper than 40° while smoothing | on |
| Loose pieces | keep everything / remove tiny floating bits (< 2 % of the main piece) / keep only the largest | bits |
| Close holes | fan-fills open borders so the mesh is watertight | off |
| Mesh detail | caps the viewport/export face count (20k / 60k / 150k / 400k / everything). Uses quadric edge-collapse when `fast-simplification` is installed, grid clustering otherwise | High |

## TripoSR high-detail mesh and “Add colour”
TripoSR's own mesh step samples one dense grid and runs marching cubes; Faelyx now replaces it (`tsr/faelyx_mesh.py`, falls back to the old step if anything goes wrong):

1. a 128³ first pass reads the density; 2. the field is turned into `log(density) − log(level)` (zero on the surface, nearly linear across it);
3. only the thin shell around the surface is read again at the full resolution (up to 512³; the rest is interpolated, so memory stays around 1 GB at 384³ and 2 GB at 512³);
4. *Surface clean-up* (the same `faelyx_polish.py` as Hunyuan3D, with its blur scaled to the resolution) drops floating specks and hollow bubbles, smooths the ripple and gives mid-size detail back; *Flat base* cuts one bottom plane;
5. the grid is padded by one empty voxel, so the mesh is always closed (watertight).

Colour is optional: with *Paint colour while making* off you get a clean grey shape. **Add colour** (footer, TripoSR models) re-runs TripoSR on the stored cut-out — it is deterministic, so it is the same model — and reads the colour at exactly the vertices of the mesh you already have; the shape does not change. On Colab this is a small colour-only job (the vertices travel to Colab zipped).

### Match my picture and Picture reads (new, TripoSR)
Both act on TripoSR's *scene code* (its internal three feature planes) before any mesh or colour is made, and the code is kept so **Add colour** paints exactly the same model.
- **Match my picture** (off / light ≈ 30 steps / strong ≈ 80): finds the camera that corresponds to your picture by trying the four sides, mirrored or not, at five distances and keeping the best outline overlap (it must reach 0.6); then nudges the code so the model's own front view matches your cut-out outline and colours, pulled back towards where it started. It is kept only if the overlap improves by at least 0.003 **and** the model's volume changes by no more than 25 %; otherwise it is undone. It needs the cut-out outline (Remove the background on) and a GPU (CPU works, slowly). The job note shows the overlap before → after. This is what makes the model follow the picture you gave it more closely; it cannot add information the picture does not contain (the back of the object is still a guess).
- **Picture reads** (1 / 3 / 5): the picture is read several times with tiny photometric changes (contrast, sharpness, blur — they do not move the object) and the codes are averaged. Expect a modest, steadier result, not a different one.

**Not verified by the author:** both run on a real GPU only. The logic around them (options, the outline mask, fall-backs, the Colab transfer of outline and scene code) was tested with stand-ins; the optimisation itself has not been run, so the first real runs are the test. Any failure falls back to the plain model and says why in the job note.

Be realistic: TripoSR's internal scene is a coarse 64×64 plane grid, so above about 384³ extra resolution makes edges smoother and more exact, it does not invent detail. What this removes is Faelyx's own losses (320³ cap, clustering decimation, smoothing that blurred detail, specks/bubbles, lumpy base). It does not turn TripoSR into a different model: shape accuracy is still decided by the model and the picture.

## HTTP routes
`GET /image_to_3d/status`, `POST /image_to_3d/model/download`, `POST /image_to_3d/preview` (cut-out PNG, no model run),
`POST /image_to_3d/hunyuan/download`, `POST /image_to_3d/jobs`, `GET /image_to_3d/jobs/{id}`, `GET /image_to_3d/jobs/{id}/original.glb` (Tencent's textured PBR model),
`GET /image_to_3d/jobs/{id}/mesh?format=stl|ply|obj|glb`, `GET /image_to_3d/jobs/{id}/cutout`,
`POST /image_to_3d/jobs/{id}/cancel`, `POST /image_to_3d/jobs/{id}/colour` (TripoSR: paint a finished model; poll `colour_state` in the job info), `DELETE /image_to_3d/jobs/{id}`.
The job and mesh routes take the finishing options as query parameters: `faces`, `smooth`, `sharp`, `pieces`, `fill`.

## Troubleshooting
- Hunyuan3D: “not set up” → run `setup_hunyuan3d.bat`; “PyTorch cannot see an NVIDIA GPU” → update the NVIDIA driver, then `python setup_hunyuan3d.py --check`.
- Hunyuan3D: “colour stage not installed” → install VS 2022 Build Tools + CUDA Toolkit 12.x, run `python setup_hunyuan3d.py --install-prereqs` (or just re-run it). Shape-only models work without it.
- Hunyuan3D: the model comes in lying down → *Axis that is up* (Hunyuan3D builds Y-up; pick the axis that stands it up) and *Turn*.
- Colab (either engine): “Cannot reach the Colab session” → the notebook's last cell stopped or Colab disconnected; run the notebook again and paste the new connection code.
- TripoSR on Colab: “running an older notebook” → upload the new `Faelyx_Hunyuan3D_Colab.ipynb`; “TripoSR is not installed on the Colab machine” → set *Engines* to TripoSR only / Both in cell 1 and run the install cell. If cell 3 reports TripoSR NOT READY, send the last lines of its output (or `/content/tsr_runtime/logs/setup.log`).
- Hunyuan3D: very slow → that is the Low memory mode on a small GPU; close other GPU programs, or lower Surface detail and Shape quality for a draft.
- “needs these Python packages” — run the install command it prints, in the backend's environment.
- “GPU ran out of memory” — set Memory use to Low, lower the mesh resolution, or close other GPU programs.
- No `torchmcubes`? Not needed: scikit-image does the marching cubes on the CPU.
