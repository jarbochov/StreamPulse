@echo off
setlocal
title StreamPulse
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Install it from https://nodejs.org and run this again.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

if not exist config.json (
    if exist config.example.json (
        copy config.example.json config.json >nul
        echo Created config.json from config.example.json. Add your details at http://localhost:3000/config-editor.html
    )
)

echo Starting StreamPulse...
node server.js
echo.
echo StreamPulse stopped.
pause
