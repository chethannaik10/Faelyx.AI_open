#!/bin/bash
# Starts the frontend dev server on :5173, talking to cad_server.py on
# :8000 (start_backend.command, in a separate terminal/tab, must be
# running first for Extrude/Pocket/etc. to actually build anything).
cd "$(dirname "$0")/ai-engine/faelyx-ui"
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi
echo "Starting faelyx-ui on http://localhost:5173 ..."
npm run dev
