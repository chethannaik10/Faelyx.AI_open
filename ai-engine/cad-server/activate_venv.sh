#!/bin/bash
# Sourced by the .command launchers: activates a Python environment that
# actually works on *this* machine. A `venv` copied from another OS (e.g. a
# Windows venv, which has Scripts/ instead of bin/) is skipped rather than
# failing; if nothing usable exists, .venv is created and requirements.txt
# installed. build123d/OCP publishes wheels for Python 3.10-3.12, so a
# python3.12/3.11 is preferred over a newer default python3.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$here/venv/bin/activate" ]; then
  source "$here/venv/bin/activate"
elif [ -f "$here/.venv/bin/activate" ]; then
  source "$here/.venv/bin/activate"
else
  echo "Creating .venv and installing dependencies (first run only)..."
  py="$(command -v python3.12 || command -v python3.11 || command -v python3)"
  "$py" -m venv "$here/.venv"
  source "$here/.venv/bin/activate"
  pip install -r "$here/../../requirements.txt"
fi
