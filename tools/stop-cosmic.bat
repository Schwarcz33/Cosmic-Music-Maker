@echo off
REM Violet Media - Cosmic Music Maker
REM Stops the local HTTP server listening on port 4862.

setlocal enabledelayedexpansion
set PORT=4862
set KILLED=0

echo.
echo === Stopping Cosmic Music Maker server (port %PORT%) ===
echo.

for /f "tokens=5" %%P in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
  echo Killing PID %%P ...
  taskkill /F /PID %%P >nul 2>&1
  if !errorlevel! == 0 (
    set /a KILLED=!KILLED!+1
  )
)

if %KILLED% == 0 (
  echo No server was running on port %PORT%.
) else (
  echo Stopped %KILLED% server process(es^).
)

echo.
pause
