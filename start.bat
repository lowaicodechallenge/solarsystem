@echo off
echo Starting FitAI...

REM Start backend
echo [1/2] Starting backend server (port 8000)...
cd backend
start "FitAI Backend" cmd /k "python -m uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload"
cd ..

REM Wait for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend
echo [2/2] Starting frontend (port 3000)...
cd frontend
start "FitAI Frontend" cmd /k "npm run dev"
cd ..

echo.
echo ====================================
echo   FitAI is starting!
echo   Open: http://localhost:3000
echo ====================================
echo.
timeout /t 5 /nobreak >nul
start http://localhost:3000
