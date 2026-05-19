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
REM Python 3.13+ has numpy/chromadb incompatibility — use a dedicated Python 3.12 venv
python3.12 --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 3.12 not found. Install Python 3.12 from python.org
    echo         ^(3.13+ breaks numpy 1.26.4 / chromadb^)
    pause
    exit /b 1
)
if not exist .venv (
    echo Creating Python 3.12 virtual environment...
    python3.12 -m venv .venv
)
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
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
