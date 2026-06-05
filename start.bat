@echo off
title ResearchOS Launcher
echo.
echo  ================================
echo   ResearchOS - Starting Up...
echo  ================================
echo.

:: Start Backend
start "ResearchOS - Backend" cmd /k "cd /d C:\Projects\researchos-complete\researchos-backend && C:\Projects\researchos-complete\.venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"

:: Start Frontend
start "ResearchOS - Frontend" cmd /k "cd /d C:\Projects\researchos-complete\researchos-frontend && npm run dev"

echo  [OK] Backend  ->  http://localhost:8000
echo  [OK] Frontend ->  http://localhost:5173
echo.
echo  Both servers launching in separate windows...
pause