@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto neednode
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto neednode
where npm >nul 2>&1
if errorlevel 1 goto neednode
echo Installing Hedgeway dependencies...
call npm ci
if errorlevel 1 goto failed
call npm run setup
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
echo.
echo Keep this window open while using Hedgeway.
echo Once the ready message appears, open http://localhost:4100 in Chrome.
echo If you changed PORT in .env, use that port instead.
echo Press Ctrl+C here to stop Hedgeway.
echo.
call npm start
if errorlevel 1 goto failed
goto end
:neednode
echo Install Node.js 24 or newer from https://nodejs.org/en/download
 echo Then close this window and double-click Start Hedgeway.cmd again.
pause
exit /b 1
:failed
echo.
echo Hedgeway could not start. Copy the error above and send it in our chat.
echo Do not include API keys or the contents of your .env file.
pause
exit /b 1
:end
pause
