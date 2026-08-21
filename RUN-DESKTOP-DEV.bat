@echo off
title EMX Clip Studio Desktop Dev
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run dev:desktop
