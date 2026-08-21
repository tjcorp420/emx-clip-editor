@echo off
title EMX Clip Studio Audio AI Hotfix
cd /d "%~dp0"

echo.
echo ============================================
echo   EMX AUDIO AI V1.7.2 COMPATIBILITY HOTFIX
echo ============================================
echo.
echo This repairs the already-downloaded private AI runtime.
echo It should NOT redownload Torch or the other large packages.
echo.

set "PY=%~dp0build\ai-runtime\python.exe"
set "CLI=%~dp0build\ai-runtime\Scripts\audio-separator.exe"
set "FFMPEG_DIR=%~dp0build\native"

if not exist "%PY%" (
  echo [ERROR] Private EMX Python runtime not found:
  echo %PY%
  echo.
  echo Use the full V1.7.2 project instead.
  pause
  exit /b 1
)

echo [1/4] Installing missing audioread compatibility dependency...
"%PY%" -m pip install "audioread==3.1.0" --no-warn-script-location
if errorlevel 1 goto :fail

echo.
echo [2/4] Verifying required Python imports...
"%PY%" -c "import audioread,torch,onnxruntime,librosa; from audio_separator.separator import Separator; print('EMX AUDIO AI IMPORTS: PASS')"
if errorlevel 1 goto :fail

echo.
echo [3/4] Verifying Audio Separator runtime...
set "PATH=%FFMPEG_DIR%;%PATH%"
"%CLI%" --env_info
if errorlevel 1 goto :fail

echo.
echo [4/4] Runtime repaired.
echo.
echo ============================================
echo EMX AUDIO AI HOTFIX: PASS
echo ============================================
echo.
echo Now run BUILD-FRIEND-READY-EXE.bat again.
echo It will reuse the packages already downloaded.
echo.
pause
exit /b 0

:fail
echo.
echo ============================================
echo EMX AUDIO AI HOTFIX: FAILED
echo Send ChatGPT the FIRST error shown above.
echo ============================================
pause
exit /b 1
