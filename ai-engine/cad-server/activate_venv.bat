@echo off
REM Called by start_backend.bat: activates a Python environment that works on
REM this machine. A "venv"/".venv" without its packages installed (or made on
REM another OS, e.g. the macOS .venv synced with the repo) is skipped; otherwise
REM .venv-win is created with Python 3.12+ (requirements.txt pins numpy 2.5.x,
REM which needs 3.12 or newer) and requirements.txt installed.
if exist "%~dp0.venv-win\Scripts\uvicorn.exe" (
  call "%~dp0.venv-win\Scripts\activate.bat"
  exit /b 0
)
if exist "%~dp0venv\Scripts\uvicorn.exe" (
  call "%~dp0venv\Scripts\activate.bat"
  exit /b 0
)
if exist "%~dp0.venv\Scripts\uvicorn.exe" (
  call "%~dp0.venv\Scripts\activate.bat"
  exit /b 0
)
echo Creating .venv-win and installing dependencies (first run only)...
py -3.12 -m venv "%~dp0.venv-win" 2>nul || py -3.13 -m venv "%~dp0.venv-win" 2>nul || py -3.14 -m venv "%~dp0.venv-win" 2>nul || python -m venv "%~dp0.venv-win"
if not exist "%~dp0.venv-win\Scripts\activate.bat" (
  echo Could not create a Python environment. Install Python 3.12 or newer from python.org and try again.
  exit /b 1
)
call "%~dp0.venv-win\Scripts\activate.bat"
python -m pip install -r "%~dp0..\..\requirements.txt"
if errorlevel 1 exit /b 1
exit /b 0
