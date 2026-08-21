@echo off
title EMX Clip Studio V1.11.2 Verification
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [FAIL] Node.js/npm not found.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

echo.
echo [1/13] Preparing native FFmpeg binaries...
call npm run prepare:native
if errorlevel 1 goto :fail

echo.
echo [2/13] JavaScript syntax checks...
call npm run check:js
if errorlevel 1 goto :fail

echo.
echo [3/13] Timeline drag / trim / split math test...
call npm run verify:timeline
if errorlevel 1 goto :fail

echo.
echo [4/13] Resources / timeline playback ownership regression...
call npm run verify:playback
if errorlevel 1 goto :fail

echo.
echo [5/13] Dedicated export folder and completion actions...
call npm run verify:export-paths
if errorlevel 1 goto :fail

echo.
echo [6/13] UI contract test: Undo Last, media workspace, watermark, update center, friend-ready AI controls...
call npm run verify:ui
if errorlevel 1 goto :fail

echo.
echo [7/13] Permanent watermark contract test...
call npm run verify:watermark
if errorlevel 1 goto :fail

echo.
echo [8/13] Update service contract test...
call npm run verify:update
if errorlevel 1 goto :fail

echo.
echo [9/13] Audio AI integration contract test...
call npm run verify:ai-contract
if errorlevel 1 goto :fail

echo.
echo [10/13] Friend-ready runtime contract test...
call npm run verify:friend-runtime-contract
if errorlevel 1 goto :fail

echo.
echo [11/13] Native extraction / export / visual zoom-pan / watermark smoke test...
call npm run verify:engine
if errorlevel 1 goto :fail

echo.
echo [12/13] Desktop media protocol test...
call npm run verify:desktop-media
if errorlevel 1 goto :fail

echo.
echo [13/13] Vite production build and hidden renderer runtime test...
call npm run verify:renderer
if errorlevel 1 goto :fail

echo.
echo ==========================================
echo EMX CLIP STUDIO V1.11.2 VERIFICATION PASS
echo ==========================================
echo.
echo Friend-ready Audio AI behavior:
echo - No manual Python install for your friends.
echo - No third-party account required for the standard public-model workflow.
echo - The final builder prepares the private Audio AI runtime.
echo - Public model files download automatically on first use and are cached.
echo.
pause
exit /b 0

:fail
echo.
echo ==========================================
echo EMX V1.11.2 VERIFICATION FAILED
echo Read the first error above before building.
echo ==========================================
pause
exit /b 1
