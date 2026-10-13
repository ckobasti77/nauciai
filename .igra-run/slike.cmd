@echo off
title IGRA slike
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0slike-watcher.ps1"
