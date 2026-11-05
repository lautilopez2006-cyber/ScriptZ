@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ScriptZ 0.1 - Version web
where node >nul 2>&1 || (echo Falta Node.js LTS: https://nodejs.org/ & pause & exit /b 1)
if not exist "node_modules" (echo Instalando dependencias, solo la primera vez... & call npm install || (pause & exit /b 1))
start "" http://127.0.0.1:1420
call npm run dev
if errorlevel 1 pause
