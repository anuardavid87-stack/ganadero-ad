@echo off
title BoviTrack Pro PWA - Lanzador Local
echo =====================================================================
echo  Iniciando BoviTrack Pro PWA (Servidor Local en http://localhost:8085/)
echo =====================================================================
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
