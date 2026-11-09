@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ScriptlZ - Servidor de colaboracion
where node >nul 2>&1 || (echo Falta Node.js LTS: https://nodejs.org/ & pause & exit /b 1)
if not defined SCRIPTZ_DATA set "SCRIPTZ_DATA=%LOCALAPPDATA%\ScriptlZ\Colaboracion"
echo Tu direccion en la red local (usala como ws://ESA-IP:4735 en ScriptlZ):
ipconfig | findstr /c:"IPv4"
echo.
node server\collab-server.mjs --port 4735
pause
