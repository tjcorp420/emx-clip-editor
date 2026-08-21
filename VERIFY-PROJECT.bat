@echo off
title EMX Clip Studio V1.10.1 Verification
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
echo [1/10] Preparing native FFmpeg binaries...
call npm run prepare:native
if errorlevel 1 goto :fail

echo.
echo [2/10] JavaScript syntax checks...
call npm run check:js
if errorlevel 1 goto :fail

echo.
echo [3/10] Timeline drag / trim / split math test...
call npm run verify:timeline
if errorlevel 1 goto :fail

echo.
echo [4/10] UI contract test: Undo Last, media workspace, watermark, update center, friend-ready AI controls...
call npm run verify:ui
if errorlevel 1 goto :fail

echo.
echo [5/10] Permanent watermark contract test...
call npm run verify:watermark
if errorlevel 1 goto :fail

echo.
echo [6/10] Update service contract test...
call npm run verify:update
if errorlevel 1 goto :fail

echo.
echo [7/10] Audio AI integration contract test...
call npm run verify:ai-contract
if errorlevel 1 goto :fail

echo.
echo [8/10] Friend-ready runtime contract test...
call npm run verify:friend-runtime-contract
if errorlevel 1 goto :fail

echo.
echo [9/10] Native extraction / export / watermark smoke test...
call npm run verify:engine
if errorlevel 1 goto :fail

echo.
echo [10/10] Vite production build...
call npm run build:web
if errorlevel 1 goto :fail

echo.
echo ==========================================
echo EMX CLIP STUDIO V1.10.1 VERIFICATION PASS
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
echo EMX V1.10.1 VERIFICATION FAILED
echo Read the first error above before building.
echo ==========================================
pause
exit /b 1
