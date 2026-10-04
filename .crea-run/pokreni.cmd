@echo off
title CREA RUN
cd /d "%~dp0.."
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0..\crea-run.ps1"
