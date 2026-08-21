@echo off
title EMX Clip Studio V1.11.3 Verification
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
echo [1/15] Preparing native FFmpeg binaries...
call npm run prepare:native
if errorlevel 1 goto :fail

echo.
echo [2/15] JavaScript syntax checks...
call npm run check:js
if errorlevel 1 goto :fail

echo.
echo [3/15] Timeline drag / trim / split math test...
call npm run verify:timeline
if errorlevel 1 goto :fail

echo.
echo [4/15] Resources / timeline playback ownership regression...
call npm run verify:playback
if errorlevel 1 goto :fail

echo.
echo [5/15] Scrub-session and delayed audio regression...
call npm run verify:scrub
if errorlevel 1 goto :fail

echo.
echo [6/15] All 15 animated FFmpeg effect chains...
call npm run verify:effects
if errorlevel 1 goto :fail

echo.
echo [7/15] Dedicated export folder and completion actions...
call npm run verify:export-paths
if errorlevel 1 goto :fail

echo.
echo [8/15] UI contract test: Undo Last, media workspace, watermark, update center, friend-ready AI controls...
call npm run verify:ui
if errorlevel 1 goto :fail

echo.
echo [9/15] Permanent watermark contract test...
call npm run verify:watermark
if errorlevel 1 goto :fail

echo.
echo [10/15] Update service contract test...
call npm run verify:update
if errorlevel 1 goto :fail

echo.
echo [11/15] Audio AI integration contract test...
call npm run verify:ai-contract
if errorlevel 1 goto :fail

echo.
echo [12/15] Friend-ready runtime contract test...
call npm run verify:friend-runtime-contract
if errorlevel 1 goto :fail

echo.
echo [13/15] Native extraction / export / visual zoom-pan / watermark smoke test...
call npm run verify:engine
if errorlevel 1 goto :fail

echo.
echo [14/15] Desktop media protocol test...
call npm run verify:desktop-media
if errorlevel 1 goto :fail

echo.
echo [15/15] Vite production build and hidden renderer runtime test...
call npm run verify:renderer
if errorlevel 1 goto :fail

echo.
echo ==========================================
echo EMX CLIP STUDIO V1.11.3 VERIFICATION PASS
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
echo EMX V1.11.3 VERIFICATION FAILED
echo Read the first error above before building.
echo ==========================================
pause
exit /b 1
