# Run all automated checks: backend pytest, frontend typecheck, unit tests and production build.
$ErrorActionPreference = "Continue"  # npm/node write warnings to stderr; exit codes are checked instead
$root = Split-Path -Parent $PSScriptRoot
Push-Location "$root\backend"
& ".venv\Scripts\python.exe" -m pytest -q
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location
Push-Location "$root\frontend"
npm run typecheck; if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
npm test;          if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
npm run build;     if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location
Write-Host "All checks passed." -ForegroundColor Green
