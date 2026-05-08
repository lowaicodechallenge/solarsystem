@echo off
echo ====================================
echo   FitAI Setup Script
echo ====================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.11+ from python.org
    pause
    exit /b 1
)

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from nodejs.org
    pause
    exit /b 1
)

echo [1/4] Setting up backend...
cd backend
pip install -r requirements.txt
if not exist .env (
    copy .env.example .env
    echo.
    echo [IMPORTANT] Edit backend/.env and add your UPSTAGE_API_KEY
    echo.
)
cd ..

echo [2/4] Setting up frontend...
cd frontend
npm install
if not exist .env.local (
    copy .env.local.example .env.local
)
cd ..

echo.
echo ====================================
echo   Setup Complete!
echo ====================================
echo.
echo Next steps:
echo 1. Edit backend/.env - add UPSTAGE_API_KEY
echo 2. Run: start.bat
echo.
pause
