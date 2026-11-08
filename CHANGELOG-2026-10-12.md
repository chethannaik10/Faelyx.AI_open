# Changelog — Image to 3D

New tool in 3D Design: **AI GENERATE → Image to 3D**. Everything runs on this computer; no outside service, no key.

## Engines
- **Pixal3D (AI)** — Tencent ARC's neural image-to-3D model (MIT), run by the PIXAL-3D Pinokio launcher you already have. Faelyx talks to its local server (`/pixal_studio/*`): upload picture → generate → poll → download GLB. Rebuilds the whole object including the hidden side, with textures. Needs an NVIDIA GPU (8–12 GB), about 6–8 minutes per model. Quality Draft / High / Ultra, seed, viewport mesh detail (the 0.5–1 M-face result is simplified to ~20k / 60k / 150k faces for the 3D view; the full GLB can be downloaded).
- **Quick solid** — built in, CPU only, instant. Builds a closed, printable solid from the picture's outline (inflate / photo relief / both). Models only the front of the picture.

## Panel (right pane)
Engine picker with server status ("Find server" scans the usual Pinokio ports, or type the address) · picture drop zone · options · progress with Cancel · textured/clay/wireframe preview using the Universal mouse scheme · faces, size, volume and watertight check · longest side (mm), up axis, turn, placement, X/Y/Z offset · **Add to model as a mesh body** (Enter) · download STL / PLY / GLB.

## Model
- Mesh bodies appear under MESH BODIES in the tree and in the 3D view; double-click hides/shows, Delete removes, Ctrl+Z restores. They are saved with the project and included in Analyse / Machine.
- A mesh body is a triangle mesh, not a solid: Pad, Fillet and Boolean operations do not act on it.

## Files
- Backend: `ai-engine/cad-server/image_to_3d.py` (new), `cad_server.py` (registers it), `tests/test_image_to_3d.py` (new, 20 tests).
- Frontend: `imageTo3D.ts`, `MeshPreview.tsx`, `ImageTo3DPanel.tsx` (new); `App.tsx`, `partDesign.ts`, `howTo3D.ts`, `index.css`.
- `requirements.txt`: Pillow. `.gitignore`: the saved server address.

## Not verified
- Pixal3D end to end on your GPU (tested against a mock of its API only).
- Restart `cad_server.py` to load the feature.
