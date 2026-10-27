# Start SchedX.
#   .\scripts\start.ps1               single server, foreground: http://127.0.0.1:8000 (UI + API).
#                                     Keep this window open: closing it stops the server.
#   .\scripts\start.ps1 -Background   detached server; returns only after /api/health and / both respond.
#                                     Stop it with .\scripts\stop.ps1
#   .\scripts\start.ps1 -Port 8010    use another port
#   .\scripts\start.ps1 -Dev          API on :8000 + Vite dev server on :5173 (hot reload)
param([switch]$Dev, [switch]$Background, [int]$Port = 8000)
$ErrorActionPreference = "Continue"  # npm/node write warnings to stderr; exit codes are checked instead
$root = Split-Path -Parent $PSScriptRoot
$py = "$root\backend\.venv\Scripts\python.exe"
$url = "http://127.0.0.1:$Port"
if (-not (Test-Path $py)) { Write-Host "Backend environment missing. Run .\scripts\setup.ps1 first." -ForegroundColor Yellow; exit 1 }

function Test-SchedX([string]$base) {
  try {
    $h = Invoke-RestMethod "$base/api/health" -TimeoutSec 3
    return ($h.service -eq "schedx")
  } catch { return $false }
}

# 1. Is something already listening on the port? Identify it; never kill it.
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
  if (Test-SchedX $url) {
    Write-Host "SchedX is already running at $url (PID $($listener.OwningProcess)). Nothing to start." -ForegroundColor Green
    Write-Host "If you need a fresh server, stop that process first (.\scripts\stop.ps1 if it was started with -Background)."
    exit 0
  }
  Write-Host "Port $Port is already in use by another program:" -ForegroundColor Yellow
  Write-Host "  PID $($listener.OwningProcess)  $($owner.Name)  $($owner.CommandLine)"
  Write-Host "Not stopping it. Start SchedX on another port instead, for example:  .\scripts\start.ps1 -Port 8010" -ForegroundColor Yellow
  exit 2
}

# 2. The server serves frontend/dist, so the production build must exist.
if (-not $Dev -and -not (Test-Path "$root\frontend\dist\index.html")) {
  Write-Host "Building frontend (first run)..." -ForegroundColor Cyan
  Push-Location "$root\frontend"; npm run build; $b = $LASTEXITCODE; Pop-Location
  if ($b -ne 0) { Write-Host "Frontend build failed; see output above." -ForegroundColor Red; exit $b }
}

if ($Dev) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; & '$py' -m uvicorn app.main:app --reload --host 127.0.0.1 --port $Port"
  Set-Location "$root\frontend"
  Write-Host "Frontend dev server: http://localhost:5173 (API on $url)" -ForegroundColor Green
  npm run dev
  exit $LASTEXITCODE
}

if ($Background) {
  $data = "$root\backend\data"
  New-Item -ItemType Directory -Force $data | Out-Null
  $log = "$data\server.log"; $err = "$data\server.err.log"
  $proc = Start-Process -PassThru -WindowStyle Hidden -FilePath $py -WorkingDirectory "$root\backend" `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$Port" `
    -RedirectStandardOutput $log -RedirectStandardError $err
  Set-Content "$data\server.pid" "$($proc.Id)`n$Port"
  $ok = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if ($proc.HasExited) { break }
    if (Test-SchedX $url) { $ok = $true; break }
  }
  if ($ok) {
    $page = (Invoke-WebRequest "$url/" -UseBasicParsing -TimeoutSec 5)
    if ($page.StatusCode -eq 200 -and $page.Content -match 'id="root"') {
      Write-Host "SchedX is running at $url  (PID $($proc.Id); health OK, homepage OK)." -ForegroundColor Green
      Write-Host "Stop it with: .\scripts\stop.ps1   Logs: backend\data\server.err.log"
      exit 0
    }
    Write-Host "Server answers /api/health but the homepage is not served. Rebuild: cd frontend; npm run build" -ForegroundColor Red
    exit 3
  }
  Write-Host "SchedX did not become healthy. Last log lines:" -ForegroundColor Red
  Get-Content $err -Tail 15 -ErrorAction SilentlyContinue
  exit 4
}

Set-Location "$root\backend"
Write-Host "SchedX starting at $url  (API docs: $url/api/docs). Keep this window open; Ctrl+C stops the server." -ForegroundColor Green
& $py -m uvicorn app.main:app --host 127.0.0.1 --port $Port
