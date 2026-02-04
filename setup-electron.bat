@echo off
echo Setting up SwitchControl for Electron build...

:: Replace package.json with the Electron version
copy /Y package.json.electron package.json

:: Install all dependencies (including Electron via postinstall)
npm install

:: Build the web app
npm run build

:: Build the Electron installer
npm run electron:build

echo.
echo Done! Your installer is in: electron\dist\
pause
