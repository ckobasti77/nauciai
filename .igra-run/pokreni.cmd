@echo off
title IGRA RUN
cd /d "%~dp0.."
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0..\igra-run.ps1"
