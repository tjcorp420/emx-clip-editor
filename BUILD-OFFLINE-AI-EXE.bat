@echo off
title EMX Clip Studio V1.10.1 OFFLINE AI Builder
cd /d "%~dp0"

echo.
echo ============================================================
echo        EMX CLIP STUDIO - OFFLINE AI INSTALLER
echo ============================================================
echo.
echo WARNING:
echo This is the SLOW / LARGE optional build.
echo Use BUILD-FAST-FRIEND-EXE.bat for normal distribution.
echo.
echo This builder prepares a complete Python/Torch/Audio AI runtime.
echo It is intended only if you specifically need an offline AI package.
echo.
choice /M "Continue with the slow offline AI build"
if errorlevel 2 exit /b 0

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js/npm not found.
  pause
  exit /b 1
)

if not exist node_modules (
  call npm install
  if errorlevel 1 goto :fail
)

call npm run prepare:native
if errorlevel 1 goto :fail

call npm run prepare:ai-runtime
if errorlevel 1 goto :fail

echo.
echo Creating temporary offline packaging config...
node scripts\enable-offline-ai-package.cjs
if errorlevel 1 goto :fail

call npm run build:web
if errorlevel 1 goto :restore_fail

call npx electron-builder --win nsis --config electron-builder.config.cjs --publish never
if errorlevel 1 goto :restore_fail

node scripts\disable-offline-ai-package.cjs
echo.
echo OFFLINE AI INSTALLER COMPLETE
start "" "%~dp0release"
pause
exit /b 0

:restore_fail
node scripts\disable-offline-ai-package.cjs
:fail
echo.
echo OFFLINE BUILD FAILED.
pause
exit /b 1
