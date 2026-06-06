@echo off
title UpSurge Social Engine
set "PROJ=C:\Users\beaud\upsurge-social-engine"
cd /d "%PROJ%"

rem Open the project notes (context) and the project folder
start "" "%PROJ%\START_HERE.md"
start "" explorer "%PROJ%"

echo ============================================================
echo   UpSurge Social Engine - Claude Code
echo   Project: %PROJ%
echo ============================================================
echo   Starting Claude Code for additional work...
echo.

call claude
if errorlevel 1 (
  echo.
  echo Could not start Claude Code automatically.
  echo Make sure Claude Code is installed and on your PATH, then run:  claude
  echo.
  pause
)
