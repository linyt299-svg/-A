@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18 or newer first.
  pause
  exit /b 1
)

echo Starting StockLens...
echo Open: http://127.0.0.1:4173
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$node = (Get-Command node).Source; " ^
  "$server = Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru; " ^
  "$ready = $false; " ^
  "for ($attempt = 0; $attempt -lt 30 -and -not $ready; $attempt++) { " ^
  "  Start-Sleep -Milliseconds 500; " ^
  "  try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173' -TimeoutSec 1 | Out-Null; $ready = $true } catch {} " ^
  "}; " ^
  "if ($ready) { Start-Process 'http://127.0.0.1:4173'; exit 0 }; " ^
  "if ($server.HasExited) { exit $server.ExitCode }; " ^
  "exit 1"

if not errorlevel 1 exit /b 0

echo.
echo StockLens could not be opened. Check whether port 4173 is available.
pause
exit /b 1
