@echo off
setlocal enabledelayedexpansion
title Object Detection - Build

set ROOT=%~dp0
set DIST=%ROOT%dist

echo ============================================
echo   Object Detection - Build Script
echo ============================================
echo.

REM ── Clean dist ──────────────────────────────
echo [0/5] Cleaning dist...
if exist "%DIST%" rmdir /s /q "%DIST%"
mkdir "%DIST%"
echo Done.
echo.

REM ── 1. Frontend ─────────────────────────────
echo [1/5] Building frontend (React + Vite)...
cd /d "%ROOT%frontend"
call npm install --silent
call npm run build
if errorlevel 1 ( echo ERROR: Frontend build failed & pause & exit /b 1 )
xcopy /E /I /Y "%ROOT%frontend\dist" "%DIST%\public" >nul
echo Done.
echo.

REM ── 2. NestJS build ─────────────────────────
echo [2/5] Building NestJS...
cd /d "%ROOT%ai-project"
call npm install --silent --legacy-peer-deps
call npm run build
if errorlevel 1 ( echo ERROR: NestJS build failed & pause & exit /b 1 )
echo Done.
echo.

REM ── 3. NestJS → exe ─────────────────────────
echo [3/5] Packaging NestJS with pkg...
call npx pkg . --target node18-win-x64 --output "%DIST%\nest-backend.exe" --compress GZip
if errorlevel 1 ( echo ERROR: pkg failed & pause & exit /b 1 )
echo Done.
echo.

REM ── 4. Python → exe ─────────────────────────
echo [4/5] Packaging Python backend with PyInstaller...
echo (This will take a while - PyInstaller + torch + ultralytics = ~1.5 GB)
cd /d "%ROOT%ai-project\backend"
pip install pyinstaller --quiet
pyinstaller --onedir --noconfirm --clean ^
  --name python-backend ^
  --distpath "%DIST%" ^
  --hidden-import=ultralytics ^
  --hidden-import=PIL ^
  --hidden-import=cv2 ^
  main.py
if errorlevel 1 ( echo ERROR: PyInstaller failed & pause & exit /b 1 )
echo Done.
echo.

REM ── 5. Launcher → exe ───────────────────────
echo [5/5] Packaging launcher...
cd /d "%ROOT%launcher"
call npx pkg . --target node18-win-x64 --output "%DIST%\Object Detection.exe"
if errorlevel 1 ( echo ERROR: launcher pkg failed & pause & exit /b 1 )
echo Done.
echo.

REM ── Summary ─────────────────────────────────
echo ============================================
echo   Build complete!
echo ============================================
echo.
echo Output: %DIST%
echo.
dir /b "%DIST%"
echo.
echo To run: double-click  dist\Object Detection.exe
echo To delete: delete the entire  dist\  folder
echo.
pause
