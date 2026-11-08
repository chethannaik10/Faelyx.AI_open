# Faelyx AI — session handoff

Written because this conversation is moving to a new chat (linking to
Chethan's own Mac requires starting a fresh task; this one is bound to
the Windows laptop). Paste this into the first message of the new chat
so it doesn't start from zero.

## Machine situation
- This file, `cad-server/`, and `faelyx-ui/` all live on a Windows laptop
  (`laptop-mdgqu0vm`, user folder `Devesh`) that belongs to Chethan's
  **teammate/co-founder**, not Chethan himself. Chethan is on a Mac.
- Nothing on this machine has been confirmed run yet by either Chethan
  or Claude — no terminal access was available to Claude on this device
  (file read/write only, no shell), so every install/run command has
  been handed to Chethan to execute manually, unexecuted so far.
- Chethan wants Claude to be able to run commands directly going forward,
  which requires linking Claude to Chethan's own Mac (this session's
  "Link to this computer" option wasn't offered for this task, hence
  starting a new one).

## Company context (Faelyx AI)
- Chethan Naik — Founder & CEO, Faelyx AI: AI-native engineering
  platform, **standalone application** (not a plugin), for design,
  simulation & manufacturing sourcing of mechanical parts.
- Architecture agreed on so far: Open Cascade (via Python/build123d) as
  the 3D solid-modeling kernel; a separate 2D constraint solver (custom,
  scipy-based — not Open Cascade's job) for the sketch layer; cloud
  backend for heavy analysis (FEA/CFD-style), local/WASM for
  interactive modeling responsiveness; Python is the more strategic
  language long-term (AI/ML ecosystem + most CAD host APIs), though
  existing frontends are TypeScript/React.

## What already exists on the Windows laptop (`C:\Users\Devesh\`)
- **`ai-cad-app`** — Next.js + React-Three-Fiber. Polished-looking UI
  ("Stitch CAD"), entirely mockup: hardcoded progress bars, fake AI
  text, static placeholder 3D box. Three.js installed but unused.
- **`my-cad-ui`** — Next.js, git repo (one commit). Rougher UI, but its
  "Generate Mesh" button makes a real `fetch()` to
  `http://127.0.0.1:8000/generate` expecting an STL back — that backend
  didn't exist until this session.
- **`ai-engine/TripoSR`** — a real, working photo-to-3D AI pipeline
  (Stability/Tripo's open-source model). Proven to work: real
  `input.png` + real 4.5MB `mesh.obj` sit in `ai-engine/output/0/`.
  Unconnected to the CAD-kernel work.
- **`ai-engine/cad-server/cad_server.py`** — written this session. A
  FastAPI backend that takes `{shape, size}` and returns a real STL
  built via `build123d` (Open Cascade). CORS allows `localhost:3000`
  and `localhost:5173`. **Not yet run/verified.**
- **`ai-engine/cad-server/sketch_solver.py`** — written and **tested
  successfully** this session (ran it directly, confirmed correct
  output). A real 2D sketch constraint solver using
  `scipy.optimize.least_squares` — points/lines/circles, constraints
  (coincident, horizontal, vertical, distance, radius, parallel),
  correct DOF calculation. Not yet wired to any frontend.
- **`ai-engine/faelyx-ui/`** — Chethan's Bolt.new export (a Vite/React
  UI named "Faelyx AI", closely matching real SolidWorks/Fusion
  conventions). Was pure UI-state mockup (static SVG "model", fake AI
  chat). This session wired its existing Depth field + "Apply changes"
  button to call `cad_server.py` and render the real result via a new
  `StlViewport.tsx` (plain Three.js + STLLoader + OrbitControls).
  **Not yet run/verified** — needs `npm install` (new deps: `three`,
  `@types/three`) then `npm run dev`.
  - Note: this Bolt.new export only contains the "3D Design" tab. The
    "Sketch & 2D" screen (with the DOF/constraint UI Chethan
    screenshotted) was not in this particular export.

## Immediate next step (was in progress when this handoff was written)
Run, for real, on the Windows laptop:
```
# terminal 1
cd C:\Users\Devesh\ai-engine\cad-server
pip install fastapi uvicorn build123d
uvicorn cad_server:app --port 8000 --reload

# terminal 2
cd C:\Users\Devesh\ai-engine\faelyx-ui
npm install
npm run dev
```
Then open the printed localhost URL, go to Properties → Extrude 001 →
Depth, type a number, click Apply changes — should render a real
generated solid instead of the static picture. Neither command has
been executed by anyone yet as of this handoff.

## Open items
- Chethan should confirm with his co-founder that work continuing on
  their personal machine is expected/welcome.
- A shared GitHub repo was suggested as the right long-term setup
  instead of working on one person's personal laptop — not yet acted on.
