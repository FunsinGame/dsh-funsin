@echo off
rem Double-click entry point for package-desktop.ps1: builds the next unsigned Windows x64
rem Desktop installer, copies it to dist\desktop, and keeps this window open to show the result.
rem Arguments are forwarded, for example: build-desktop.cmd -CheckOnly
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-desktop.ps1" %*
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Done. The installer and its .sha256 file are in dist\desktop\
) else (
  echo Packaging failed with exit code %RESULT%.
  echo Inspect the newest run under apps\desktop\.desktop-build\packaging-runs\
)
echo Press any key to close this window.
pause >nul
exit /b %RESULT%
