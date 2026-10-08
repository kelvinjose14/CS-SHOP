@echo off
chcp 65001 >nul
title Marcador - configurar
cd /d "%~dp0"
set MARCADOR_PORTABLE=1
"%~dp0node\node.exe" configurar.mjs
echo.
pause
