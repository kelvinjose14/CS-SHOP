@echo off
chcp 65001 >nul
title Marcador - intermediario (no cierres esta ventana mientras transmites)
cd /d "%~dp0"
set MARCADOR_PORTABLE=1
if not exist ".env" (
  echo Primero hay que poner la clave de YouTube.
  echo.
  "%~dp0node\node.exe" configurar.mjs
)
"%~dp0node\node.exe" iniciar.mjs
echo.
pause
