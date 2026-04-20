@echo off
REM =====================================================================
REM Violet Media - Cosmic Music Maker
REM One-time Windows installer: desktop shortcut + optional auto-start
REM =====================================================================

setlocal

set "SCRIPT_DIR=%~dp0"
set "LAUNCHER=%SCRIPT_DIR%launch-cosmic.vbs"
set "DESKTOP=%USERPROFILE%\Desktop"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "PROJECT_ROOT=%SCRIPT_DIR%.."

echo.
echo ====================================================================
echo   Cosmic Music Maker - Windows installer
echo ====================================================================
echo.
echo  Launcher:     %LAUNCHER%
echo  Project root: %PROJECT_ROOT%
echo  Port:         4862
echo.

REM --- Verify Python is on PATH (required for the server) ---
where python >nul 2>&1
if errorlevel 1 (
  echo [ERROR] python.exe was not found on your PATH.
  echo         Install Python 3 from https://www.python.org/ and rerun this installer.
  echo.
  pause
  exit /b 1
)

REM --- Desktop shortcut ---
echo Creating desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%DESKTOP%\Cosmic Music Maker.lnk');" ^
  "$s.TargetPath = '%LAUNCHER%';" ^
  "$s.WorkingDirectory = '%PROJECT_ROOT%';" ^
  "$s.Description = 'Violet Media - Cosmic Music Maker';" ^
  "$s.Save()"

if exist "%DESKTOP%\Cosmic Music Maker.lnk" (
  echo [OK] Desktop shortcut: %DESKTOP%\Cosmic Music Maker.lnk
) else (
  echo [WARN] Desktop shortcut creation failed.
)

REM --- Auto-start at login (opt-in) ---
echo.
set /p AUTOSTART="Start Cosmic Music Maker automatically at Windows login? [Y/N] "
if /i "%AUTOSTART%"=="Y" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%STARTUP%\Cosmic Music Maker.lnk');" ^
    "$s.TargetPath = '%LAUNCHER%';" ^
    "$s.WorkingDirectory = '%PROJECT_ROOT%';" ^
    "$s.Description = 'Violet Media - Cosmic Music Maker autostart';" ^
    "$s.Save()"

  if exist "%STARTUP%\Cosmic Music Maker.lnk" (
    echo [OK] Added to Windows Startup. Server will auto-start at login.
    echo      Remove later by deleting: %STARTUP%\Cosmic Music Maker.lnk
  ) else (
    echo [WARN] Startup entry creation failed.
  )
) else (
  echo Skipped auto-start.
)

echo.
echo ====================================================================
echo   Done.
echo ====================================================================
echo.
echo   - Double-click "Cosmic Music Maker" on your Desktop to launch.
echo   - The server runs silently in the background on port 4862.
echo   - To stop the server, run: tools\stop-cosmic.bat
echo   - Direct URL: http://localhost:4862/
echo.
pause
