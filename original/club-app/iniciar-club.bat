@echo off
title Club del Rey (demo)
cd /d "%~dp0"
echo Iniciando el Club del Rey en http://localhost:8787 ...
start "" http://localhost:8787
node dev-server.js --puerto 8787
pause
