@echo off
REM faelyx.AI - one-time setup of the Hunyuan3D 2.1 engine for Image to 3D.
REM Double-click, or run from a terminal:  setup_hunyuan3d.bat [--repo C:\path\to\Hunyuan3D-2.1] [--shape-only] [--install-prereqs] [--check]
cd /d "%~dp0"
set "PYX="
where py >nul 2>nul && set "PYX=py -3"
if not defined PYX (where python >nul 2>nul && set "PYX=python")
if not defined PYX (
  echo Python was not found. Install Python from python.org ^(any 3.8 or newer is fine to run this installer^), then run it again.
  pause
  exit /b 1
)
%PYX% "%~dp0setup_hunyuan3d.py" %*
echo.
pause
