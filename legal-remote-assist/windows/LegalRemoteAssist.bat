@echo off
setlocal

cd /d %~dp0\..

if not exist node_modules (
  echo [INFO] node_modules not found, installing dependencies...
  npm install
  if errorlevel 1 goto :fail
)

if not exist certs mkdir certs
if not exist certs\server.crt (
  if not exist certs\server.key (
    echo [WARN] Missing certs. Please generate certs/server.crt and certs/server.key first.
    echo        See README section: TLS cert generation.
    goto :fail
  )
)

echo [INFO] Starting secure remote assist...
start https://127.0.0.1:8443
node server\index.js
goto :eof

:fail
echo [ERROR] Launch failed.
pause
exit /b 1
