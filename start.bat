@echo off
echo Starting FitAI...

REM Kill any existing processes on ports 3000 and 8000
echo [0/2] Cleaning up ports 3000 and 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 "') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 "') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

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
