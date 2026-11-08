@echo off
REM Windows: starts the frontend dev server on :5173 (run start_backend.bat
REM first for Extrude/Pocket/etc. to build anything).
cd /d "%~dp0ai-engine\faelyx-ui"
if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install
)
echo Starting faelyx-ui on http://localhost:5173 ...
call npm run dev
