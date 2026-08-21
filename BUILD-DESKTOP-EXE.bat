@echo off
title EMX Clip Studio V1.11.0 FAST Friend Builder
cd /d "%~dp0"

echo.
echo ============================================================
echo       EMX CLIP STUDIO V1.11.0 - FAST FRIEND INSTALLER
echo ============================================================
echo.
echo This is the NORMAL build you should use.
echo.
echo It builds ONE installer only.
echo It does NOT package/sign thousands of Python/Torch files.
echo Your friends still need NO Python and NO third-party accounts.
echo EMX automatically prepares its private Audio AI runtime when needed.
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js/npm not found on this developer PC.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/5] Installing build dependencies...
  call npm install
  if errorlevel 1 goto :fail
) else (
  echo [1/5] Build dependencies ready.
)

echo.
echo [2/5] Preparing native FFmpeg / FFprobe...
call npm run prepare:native
if errorlevel 1 goto :fail

echo.
echo [3/5] Running verification...
call npm run check:js
if errorlevel 1 goto :fail
call npm run verify:timeline
if errorlevel 1 goto :fail
call npm run verify:ui
if errorlevel 1 goto :fail
call npm run verify:ai-contract
if errorlevel 1 goto :fail
call npm run verify:friend-runtime-contract
if errorlevel 1 goto :fail
call npm run verify:engine
if errorlevel 1 goto :fail

echo.
echo [4/5] Building production frontend...
call npm run build:web
if errorlevel 1 goto :fail

echo.
echo [5/5] Building ONE Windows installer...
call npx electron-builder --win nsis --config electron-builder.config.cjs --publish never
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo FAST FRIEND INSTALLER COMPLETE
echo ============================================================
echo.
echo Give your friends the installer in:
echo   %~dp0release
echo.
echo Friends do NOT need:
echo   Python
echo   Node.js
echo   GitHub/Hugging Face accounts
echo   FFmpeg setup
echo.
echo Audio AI initializes automatically when needed.
echo.
start "" "%~dp0release"
pause
exit /b 0

:fail
echo.
echo ============================================================
echo EMX FAST BUILD FAILED
echo Read the first error shown above.
echo ============================================================
pause
exit /b 1
