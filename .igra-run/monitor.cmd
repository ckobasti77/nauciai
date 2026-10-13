@echo off
title IGRA MONITOR
cd /d "%~dp0.."
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0..\watch-igra.ps1"
