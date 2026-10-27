# One-time setup: Python virtual environment, backend deps, frontend deps, production build.
$ErrorActionPreference = "Continue"  # npm/node write warnings to stderr; exit codes are checked instead
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Backend: creating virtual environment" -ForegroundColor Cyan
Push-Location "$root\backend"
if (-not (Test-Path ".venv")) { python -m venv .venv }
& ".venv\Scripts\python.exe" -m pip install --upgrade pip | Out-Null
& ".venv\Scripts\python.exe" -m pip install -r requirements.txt
Pop-Location

Write-Host "==> Frontend: installing dependencies and building" -ForegroundColor Cyan
Push-Location "$root\frontend"
npm install; if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
npm run build; if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "Setup complete. Start SchedX with: .\scripts\start.ps1" -ForegroundColor Green
