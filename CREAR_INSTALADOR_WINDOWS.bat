@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title ScriptZ 0.1 - Crear instalador
echo.
echo  ==============================================
echo      SCRIPTZ 0.1 - CREAR INSTALADOR DE WINDOWS
echo  ==============================================
echo.
where node >nul 2>&1 || goto :node_missing
where cargo >nul 2>&1 || goto :rust_missing

echo [1/5] Instalando dependencias...
call npm install || goto :build_error
echo.
echo [2/5] Pruebas automaticas...
call npm test || goto :tests_error
echo.
echo [3/5] Pruebas del motor nativo (Rust)...
cargo test --manifest-path src-tauri\Cargo.toml --lib || goto :tests_error
echo.
echo [4/5] Servidor de colaboracion e interfaz...
call npm run build:server || goto :build_error
echo.
echo [5/5] Compilando la aplicacion (puede tardar varios minutos la primera vez)...
call npx tauri build --bundles nsis msi || goto :build_error

if not exist "DIST" mkdir "DIST"
copy /y "src-tauri\target\release\bundle\nsis\*.exe" "DIST\" >nul 2>&1
copy /y "src-tauri\target\release\bundle\msi\*.msi" "DIST\" >nul 2>&1
copy /y "server\collab-server.mjs" "DIST\" >nul 2>&1
echo.
echo  Listo. El instalador esta en la carpeta DIST.
explorer "%CD%\DIST"
pause
exit /b 0

:node_missing
echo Falta Node.js LTS: https://nodejs.org/  (instalalo, reinicia y volve a ejecutar este archivo)
pause & exit /b 1
:rust_missing
echo Falta Rust: https://rustup.rs/  y "Microsoft C++ Build Tools" (Desarrollo de escritorio con C++).
echo Guia: https://v2.tauri.app/start/prerequisites/
pause & exit /b 1
:tests_error
echo Las pruebas fallaron: se detiene el empaquetado para no distribuir una version defectuosa.
pause & exit /b 1
:build_error
echo La compilacion no se completo. Revisa el primer error de arriba.
echo Requisitos: Node.js LTS, Rust, C++ Build Tools, WebView2 y conexion a Internet.
pause & exit /b 1
