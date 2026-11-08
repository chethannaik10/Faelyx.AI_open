# Meshy-style clean surface for Hunyuan3D (2026-10-12)

Backend (`ai-engine/cad-server`)
- NEW `hunyuan3d_worker/faelyx_polish.py` — wraps the cloned Hunyuan3D surface extractor at run time (no Tencent file is edited): fragment/thread removal, Gaussian + band-pass smoothing of the density grid, flat-base detection/cut, silhouette scoring.
- `hunyuan3d_worker/worker.py` — shape stage applies the polish, supports `variants` (best of N seeds by outline match), reports `shape_info`.
- `image_to_3d.py` — options `hy_polish` (off/standard/strong), `hy_flat_base`, `hy_variants` (1–4); job note says what was done.
- `colab_server.py`, `make_colab_notebook.py`, `Faelyx_Hunyuan3D_Colab.ipynb` — options forwarded; polish module bundled (re-upload the notebook).
- `IMAGE_TO_3D.md` — documented.

UI (`ai-engine/faelyx-ui/src`)
- `imageTo3D.ts`, `ImageTo3DDialog.tsx` — Surface clean-up, Flat base, Tries controls; new mode "Clean figurine (Meshy-style)".

Not changed: Universal mouse scheme, any Tencent code, TripoSR path.
