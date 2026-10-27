#!/usr/bin/env sh
# macOS/Linux: single-server start (run scripts/setup steps from README first).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/frontend/dist/index.html" ] || (cd "$ROOT/frontend" && npm run build)
cd "$ROOT/backend"
echo "SchedX running at http://127.0.0.1:8000"
exec .venv/bin/python -m uvicorn app.main:app --port 8000
