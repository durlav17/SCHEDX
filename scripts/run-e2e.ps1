# Browser end-to-end tests (Playwright) against a private server on port 8765 with a temporary
# database, so neither a running SchedX on 8000 nor the real experiment history is touched.
# First time: cd frontend; npx playwright install chromium
param([int]$Port = 8765)
$ErrorActionPreference = "Continue"  # native tools write warnings to stderr; exit codes are checked instead
$root = Split-Path -Parent $PSScriptRoot
$db = Join-Path $env:TEMP "schedx-e2e-$(Get-Random).db"
Push-Location "$root\frontend"; npm run build; $b = $LASTEXITCODE; Pop-Location
if ($b -ne 0) { exit $b }
$env:SCHEDX_DB = $db
$env:SCHEDX_URL = "http://127.0.0.1:$Port"
$server = Start-Process -PassThru -WindowStyle Hidden -FilePath "$root\backend\.venv\Scripts\python.exe" `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$Port" -WorkingDirectory "$root\backend"
$code = 1
try {
  $up = $false
  for ($i = 0; $i -lt 40; $i++) { try { Invoke-RestMethod "$($env:SCHEDX_URL)/api/health" | Out-Null; $up = $true; break } catch { Start-Sleep -Milliseconds 500 } }
  if (-not $up) { Write-Host "Test server did not start on port $Port." -ForegroundColor Red }
  else { Push-Location "$root\frontend"; npx playwright test; $code = $LASTEXITCODE; Pop-Location }
} finally {
  # The venv python.exe is a launcher that spawns the real interpreter: kill the whole tree we started.
  taskkill /PID $server.Id /T /F | Out-Null
  Start-Sleep -Milliseconds 500
  Remove-Item $db -ErrorAction SilentlyContinue
}
exit $code
