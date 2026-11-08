# Faelyx AI

Working code for Faelyx AI, an AI-native engineering platform (design,
simulation, and manufacturing sourcing for mechanical parts).

## Quick look (no setup)

`docs/index.html` is a pre-built copy of `ai-engine/faelyx-ui` — download
or clone this repo and double-click it (or open it via a browser's
File → Open) to see the 2D sketcher and 3D viewport render immediately,
no `npm install` required. This same folder is served live via GitHub
Pages once enabled (Settings → Pages → Deploy from a branch → `master` /
`/docs`).

**That preview alone can't build real geometry** — Extrude/Pocket/Revolve/
Fillet/etc. call the Python backend below over `http://127.0.0.1:8000`,
and a static preview has no backend behind it. You'll see the app's real
"could not build the part — is cad_server.py running on :8000?" message
if you try, which is accurate, not a bug. For the full working app, run
both pieces locally:

## Full app on your own machine

Two terminals (or double-click the launchers at the repo root —
`start_backend.command` / `start_frontend.command` on macOS/Linux,
`start_backend.bat` / `start_frontend.bat` on Windows, same idea):

```bash
# Terminal 1 — backend (first run creates .venv and installs requirements.txt;
# build123d needs Python 3.10–3.12, which activate_venv.sh prefers)
cd ai-engine/cad-server
source ./activate_venv.sh
uvicorn cad_server:app --port 8000 --reload
# backend tests: python -m pytest tests -q

# Terminal 2 — frontend
cd ai-engine/faelyx-ui
npm install
npm run dev
```

Open the URL Vite prints (`http://localhost:5173`) — with both terminals
running, Extrude/Pocket/Revolve/Fillet/Chamfer/Shell/Mirror/Pattern/Scale
and the Inspect tools all build real Open Cascade geometry.

Frontend tests: `npm test` (unit) and `npm run test:e2e` (browser
walkthrough; starts the backend and dev server itself).

## Hosting the backend / using the GitHub Pages copy

- Point the app at any backend with `?api=https://your-backend` in the
  page address (remembered in that browser), the **Backend URL** field in
  the status bar's Style popover, or `VITE_API_BASE` at build time.
- On the backend, set `FAELYX_CORS_ORIGINS` to the site(s) allowed to call
  it, comma-separated (e.g. `FAELYX_CORS_ORIGINS=https://you.github.io`);
  unset, only this machine's own dev servers are accepted.

## CATIA V5 workbench features (backend)

`CATIA_FEATURE_MAP.md` maps every tool in the CATIA V5 basic-training
script to Faelyx: Groove, Rib/Slot, Multi-sections, full Hole definition,
Pad/Pocket limit options, Draft, Thickness, Remove Face, transformations,
multi-body Booleans, Measure Inertia/Between/Item, Draft/Curvature/Thread
analysis, formulas and design tables, Sketch Analysis and sketch
transformations, Drafting (SVG/DXF with views, sections, dimensions),
Assembly Design (constraints, DOF, clash, explode, BOM), and STEP/IGES
export/import. They are backend endpoints (`GET /catia/features` lists
them; the interactive docs are at `http://127.0.0.1:8000/docs`). Tests:
`tests/test_catia_features.py`.

The **3D Design** tab's toolbox follows the CATIA V5 Part Design
toolbars (Sketch-Based, Dress-Up, Surface-Based, Transformation, Boolean,
Reference Elements) and builds from the sketch in Sketch & 2D on that
sketch's own plane (Top = XY, Front = XZ, Right = YZ). Tool-by-tool
reference: `CATIA_PART_DESIGN_TOOLS.md`; what changed and how it was
verified: `docs/changes/2026-09-29-catia-part-design-3d.md`.

On Windows the backend uses `ai-engine/cad-server/.venv-win` (created by
`start_backend.bat` on first run with Python 3.12+), so the macOS `.venv`
synced with the repo is left alone.

## Layout

- `docs/` — pre-built static copy of `ai-engine/faelyx-ui`, for the
  no-setup preview above and for GitHub Pages. Regenerate it after a
  frontend change with `cd ai-engine/faelyx-ui && npm run publish:docs`
  (builds, then syncs `dist/` into `docs/` while keeping `docs/reference/`,
  the CATIA Sketcher guide the 2D tools follow).
- `ai-engine/cad-server/` — FastAPI backend. `cad_server.py` generates
  real solids via Open Cascade (through build123d) — Pad, Pocket,
  Revolve, Fillet, Chamfer, Shell, Mirror, Linear/Circular Pattern,
  Scale, and Mass Properties/Interference/Validation inspection.
  `sketch_solver.py` is a real 2D constraint solver (points/lines/
  circles, DOF tracking).
- `ai-engine/faelyx-ui/` — Vite/React UI (from Bolt.new), the most
  complete CAD command vocabulary of the project. Its toolbox is wired
  to the Open Cascade backend above.
- `ai-engine/TripoSR/` — a working photo-to-3D pipeline (separate
  approach from the parametric/Open Cascade work above).
- `ai-cad-app/`, `my-cad-ui/` — earlier Next.js UI explorations, kept
  for reference; `faelyx-ui` superseded both.
