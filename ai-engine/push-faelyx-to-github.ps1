# push-faelyx-to-github.ps1
#
# Run this on the Windows laptop (not from Claude - this session has no
# way to execute commands here, only read/write files, so this has to be
# run by hand). It:
#   1. Copies the real source from ai-cad-app, my-cad-ui, and ai-engine
#      into one new folder, leaving your existing folders untouched.
#   2. Skips dependencies/build output (node_modules, .next, venv, etc.)
#      - those get reinstalled from package.json/requirements, they
#      don't belong in git.
#   3. Initializes a fresh git repo there and pushes it to
#      https://github.com/chethanp23018-CR7/Faelyx-AI
#
# When it reaches git push, Windows' Git Credential Manager will very
# likely pop up a browser window asking you to sign in to GitHub - that
# is expected, just sign in there. If nothing pops up and it fails
# instead, you'll need a Personal Access Token (github.com, Settings,
# Developer settings, Personal access tokens, Fine-grained tokens, scope
# it to just this repo) to paste in when it prompts for a password.

$ErrorActionPreference = "Continue"
$src  = $env:USERPROFILE
$repo = Join-Path $env:USERPROFILE "Faelyx-AI-repo"

Write-Host "Building the repo at $repo ..."
New-Item -ItemType Directory -Force -Path $repo | Out-Null

function Copy-Project($name, $excludeDirs) {
    $from = Join-Path $src $name
    $to   = Join-Path $repo $name
    if (-not (Test-Path $from)) {
        Write-Host "  (skipping $name - not found)"
        return
    }
    Write-Host "  copying $name ..."
    $xd = @()
    foreach ($d in $excludeDirs) { $xd += @("/XD", (Join-Path $from $d)) }
    robocopy $from $to /E @xd /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) {
        Write-Host "  !! robocopy reported a real error copying $name (code $LASTEXITCODE)"
    }
}

Copy-Project "ai-cad-app" @("node_modules", ".next")
Copy-Project "my-cad-ui"  @("node_modules", ".next", ".git")
Copy-Project "ai-engine"  @("TripoSR\venv", "TripoSR\.git", "node_modules", "__pycache__", "cad-server\__pycache__")

# A short root README so the repo explains itself to anyone who opens it.
$readme = @'
# Faelyx AI

Working code for Faelyx AI, an AI-native engineering platform (design,
simulation, and manufacturing sourcing for mechanical parts).

## Layout

- ai-cad-app/  -  Next.js UI exploration ("Stitch CAD"). Visual mockup;
  not wired to real geometry yet.
- my-cad-ui/  -  Next.js UI exploration ("AI CAD Studio"). Its Generate
  Mesh button calls the backend in ai-engine/cad-server.
- ai-engine/cad-server/  -  FastAPI backend. cad_server.py generates
  real solids via Open Cascade (through build123d); sketch_solver.py
  is a real 2D constraint solver (points/lines/circles, DOF tracking).
- ai-engine/faelyx-ui/  -  Vite/React UI (from Bolt.new), the most
  complete CAD command vocabulary of the three. Its Extrude/Apply flow
  is wired to the Open Cascade backend.
- ai-engine/TripoSR/  -  a working photo-to-3D pipeline (separate
  approach from the parametric/Open Cascade work above).

## Running the backend and a frontend together

See ai-engine/cad-server/cad_server.py and ai-engine/faelyx-ui/ for the
current two-terminal setup (backend on port 8000, frontend dev server
calling it).
'@
$readme | Out-File -Encoding utf8 (Join-Path $repo "README.md")

# Anything that shouldn't go into version control.
$gitignore = @'
node_modules/
.next/
venv/
__pycache__/
*.pyc
.DS_Store
dist/
build/
'@
$gitignore | Out-File -Encoding utf8 (Join-Path $repo ".gitignore")

Set-Location $repo
git init
git add .
git commit -m "Import existing Faelyx AI work: three frontend explorations, TripoSR experiment, Open Cascade backend, 2D sketch solver"
git branch -M main
git remote remove origin 2>$null
git remote add origin https://github.com/chethanp23018-CR7/Faelyx-AI.git
git push -u origin main

Write-Host ""
Write-Host "Done (or see errors above). Repo folder: $repo"
