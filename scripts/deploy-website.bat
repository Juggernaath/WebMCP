@echo off
setlocal
echo ===================================================
echo   WebMCP Website Deployment Assistant
echo ===================================================
echo.
echo This script will help you deploy your website to Firebase.
echo.

REM Check if firebase-tools is installed
where firebase >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Firebase tools not found.
    echo Installing now...
    npm install -g firebase-tools
)

echo.
echo [STEP 1] Logging into Firebase...
echo A browser window will open. Please approve the login.
call firebase login --reauth

echo.
echo [STEP 2] Initializing Project...
echo We will use the existing 'firebase.json' configuration.
echo Please select your project when prompted.
echo.
echo If asked "What do you want to use as your public directory?", type: website
echo If asked "Configure as a single-page app?", type: N
echo If asked "Set up automatic builds and deploys with GitHub?", type: N
echo.
pause
call firebase init hosting

echo.
echo [STEP 3] Deploying...
call firebase deploy

echo.
echo ===================================================
echo   Deployment Complete!
echo ===================================================
echo.
pause
