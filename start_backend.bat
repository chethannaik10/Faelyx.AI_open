@echo off
REM Windows: starts the real Open Cascade backend (cad_server.py) on :8000.
REM First run creates a Python environment and installs requirements.txt
REM (see ai-engine\cad-server\activate_venv.bat).
cd /d "%~dp0ai-engine\cad-server"
REM Called by full path: cmd may be set not to search the current folder
REM (NoDefaultCurrentDirectoryInExePath).
call "%~dp0ai-engine\cad-server\activate_venv.bat"
if errorlevel 1 exit /b 1
echo Starting cad_server.py on http://127.0.0.1:8000 ...
uvicorn cad_server:app --port 8000 --reload
