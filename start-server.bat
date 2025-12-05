@echo off
cd /d "%~dp0"
echo Starting Robot Arm Control Website...
echo.
python server.py
pause
