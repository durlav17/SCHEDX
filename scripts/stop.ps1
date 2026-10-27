# Stop a SchedX server that was started with `start.ps1 -Background`.
# Only the process recorded in backend\data\server.pid is stopped (with its child process: the venv
# launcher python.exe spawns the real interpreter, so the whole tree must go).
$root = Split-Path -Parent $PSScriptRoot
$pidFile = "$root\backend\data\server.pid"
if (-not (Test-Path $pidFile)) { Write-Host "No background SchedX server is recorded (backend\data\server.pid missing)."; exit 0 }
$procId = [int](Get-Content $pidFile -TotalCount 1)
$p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
if ($p -and $p.CommandLine -match "app.main:app") {
  taskkill /PID $procId /T /F | Out-Null
  Write-Host "Stopped SchedX (PID $procId and its children)." -ForegroundColor Green
} else {
  Write-Host "PID $procId is not a SchedX server any more; nothing stopped."
}
Remove-Item $pidFile -ErrorAction SilentlyContinue
