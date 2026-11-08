#!/bin/bash
# Starts the real Open Cascade backend (cad_server.py) on :8000. First run
# creates a venv and installs requirements.txt; later runs just activate it
# (see ai-engine/cad-server/activate_venv.sh).
cd "$(dirname "$0")/ai-engine/cad-server"
source ./activate_venv.sh
echo "Starting cad_server.py on http://127.0.0.1:8000 ..."
uvicorn cad_server:app --port 8000 --reload
