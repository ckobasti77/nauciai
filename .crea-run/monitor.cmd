@echo off
title CREA MONITOR
cd /d "%~dp0.."
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0..\watch-crea.ps1"
