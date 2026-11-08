# Image to 3D — TripoSR geometry quality + optional colour

**New**
- `tsr/faelyx_mesh.py`: high-detail mesh extraction for TripoSR (128³ first pass → log-density field → full-resolution shell only → surface clean-up → closed marching cubes). Resolution up to 512³ (default 384³; was capped at 320, default 256).
- Surface clean-up (off / standard / strong) and flat base for TripoSR, reusing `hunyuan3d_worker/faelyx_polish.py` (its blur now scales with the grid resolution via a new `scale` argument; Hunyuan3D behaviour is unchanged).
- Colour is a separate, optional step. New setting “Paint colour while making” (default off) and an **Add colour** button; new route `POST /image_to_3d/jobs/{id}/colour`; job info gains `colour_state`, `colour_message`, `can_colour`.
- Face reduction uses quadric edge-collapse when `fast-simplification` is installed (`pip install fast-simplification`), otherwise the old grid clustering. New “Ultra (≈ 400 000)” mesh detail.
- Colab: the notebook's TripoSR worker does the same (features `hq` and `colour` are reported in /health; an older notebook keeps working the old way and Faelyx says so).

- **Match my picture** (off / light / strong) and **Picture reads** (1 / 3 / 5): refine TripoSR's scene code against your cut-out before the mesh is made; guarded and undone automatically if it does not help. Local and Colab (new Colab features flag `match`). The scene code is kept so Add colour matches the shape exactly. Untested on a real GPU — see IMAGE_TO_3D.md.

**Changed defaults:** mesh resolution 384, mesh detail High, smoothing 0 (smoothing blurred detail; it is still available), colour off. Quality modes were re-tuned.

**Files:** image_to_3d.py, tsr/faelyx_mesh.py (also holds the new picture-matching code), tsr/faelyx_mesh.py (new), hunyuan3d_worker/faelyx_polish.py, hunyuan3d.py, colab_server.py, triposr_colab.py, requirements-triposr.txt, IMAGE_TO_3D.md, Faelyx_Hunyuan3D_Colab.ipynb (rebuilt), UI: imageTo3D.ts, ImageTo3DDialog.tsx, MeshPreview.tsx.

**After updating:** restart cad_server.py; for Colab upload the rebuilt Faelyx_Hunyuan3D_Colab.ipynb, run it and paste the new connection code; optionally `pip install fast-simplification`.
