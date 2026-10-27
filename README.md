# SchedX

**SchedX: An Explainable, Workload-Adaptive CPU Scheduling and Performance Evaluation Platform**

An interactive Operating Systems laboratory. A deterministic Python engine simulates CPU scheduling (FCFS, SJF, SRTF, Round Robin, Priority with ageing, MLFQ and the experimental Adaptive Quantum Scheduler). A React interface lets you build workloads, play schedules forward and backward, replay every scheduling decision with its recorded reason, compare policies on identical workloads, and run reproducible experiments.

> SchedX is a simulator and educational research platform. It is not an operating system and does not modify the Linux kernel. Simulated context-switch costs are model parameters, not hardware measurements.

**Developed by**
Durlav Dani — 24BCE2361
Nathan Laji Joseph — 24BDS0332

**Faculty Mentor**
Dr Arthi M

Course: Operating Systems · Undergraduate engineering and research project

---

## Quick start (Windows PowerShell)
```powershell
.\scripts\setup.ps1                  # once: Python venv, dependencies, frontend build
.\scripts\start.ps1                  # http://127.0.0.1:8000  (keep this window open: closing it stops the server)
```
To start it **detached** and have the script confirm that it is really up before returning:
```powershell
.\scripts\start.ps1 -Background      # returns only after /api/health and the homepage both answer
.\scripts\stop.ps1                   # stops that background server (and only that one)
```
Then open **http://127.0.0.1:8000** and press **Run demonstration** in the Scheduler Lab. No internet, accounts or API keys are needed after setup.

## Features
| Page | Route | What it does |
|---|---|---|
| Project Home | `/` | Overview, objectives, research question, live engine timeline, research workflow, credits |
| Scheduler Lab | `/lab` | Workload editor (CPU/I/O bursts, priority, validation, import/export, presets, seeded generator), 7 policies, run/pause/resume/reset/step ±/speed, SVG Gantt with zoom and hover, runtime inspector, state timeline, metrics, CSV/JSON export, **Run demonstration**, **Save run** |
| Algorithm Arena | `/compare` | 2–8 configurations on one workload: aligned Gantt charts, metric small multiples, deltas vs. baseline, per-process table, export, save |
| Decision Replay | `/replay` | Every dispatch decision with candidates, keys, preemption, switch, AQS adjustment and a full system snapshot. Play/step both ways, jump, speed |
| What-If Analysis | `/what-if` | Pin a baseline, change one thing, rerun both from t=0, narrated differences, return to original |
| Experiment Studio | `/experiments` | Workload classes, full seeded generator, multi-policy runs, sensitivity sweeps with repeated trials and 95 % CI, SQLite history (open in Lab/Arena, reproduce, rename, delete, compare, export) |
| OS Concepts | `/learn` | 13 lessons with diagrams and live engine examples |
| Research | `/research` | Problem, question, hypotheses, methodology, **observed results** (generated from `research-results/`), AQS rule, verified references, limitations |
| About, Architecture, Docs | `/about`, `/architecture`, `/docs` | Abstract, scope, stack, status table, team; interactive architecture; event ordering and API reference |

## What is kept, and where
| | Where | Lifetime |
|---|---|---|
| **Temporary run** (latest Lab result) | browser memory | until the page is reloaded. The Lab labels it *Temporary run, not saved* |
| **Remembered inputs** (Lab workload and scheduler settings, What-If baseline) | browser local storage | until cleared. Results are not stored there because they can be large |
| **Saved experiment** (inputs, seed, configurations, engine results) | SQLite `backend/data/schedx.db` | until deleted. *Save run* in the Lab; Arena, What-If and Studio also save |
| **Reproducible** | History → *Reproduce* reruns the stored inputs and checks the results are identical; *Open in Lab / Arena* reruns them so they can be replayed | |

## Deployment (Netlify + Render)
The frontend can be hosted on Netlify and the FastAPI backend on Render: [netlify.toml](netlify.toml) and [render.yaml](render.yaml) are in the repository root. In short: set `VITE_API_BASE_URL` (Netlify) to the Render URL and `SCHEDX_CORS_ORIGINS` (Render) to the Netlify URL. On Render's free plan saved experiments are **not** persistent across redeploys, and the public demo has no authentication. Steps, settings and troubleshooting: [docs/deployment-netlify-render.md](docs/deployment-netlify-render.md). Locally nothing changes: leave `VITE_API_BASE_URL` empty.

## Research results
The research protocol was fixed before running ([research-results/PROTOCOL.md](research-results/PROTOCOL.md)) and executed with the SchedX engine: 3,110 simulations, 10 seeded trials per workload class. Findings, tables, raw per-trial data and charts are in [research-results/](research-results/) (start with [summary.md](research-results/summary.md)). In short, at default AQS parameters AQS **did not clearly improve response time** for the Interactive and Mixed classes; its measurable effect is fewer context switches and lower turnaround when switching is costly, at the price of higher response time. Rerun: `backend\.venv\Scripts\python.exe research-results\run_research.py --verify` then `analyze.py`.

## Architecture
React + TypeScript (Vite, Tailwind, Recharts, Lucide) → FastAPI (Pydantic) → standalone engine (Python stdlib) → policies → decision trace + metrics → UI · SQLite · CSV/JSON. Details: [docs/architecture.md](docs/architecture.md).

```
backend/           app/{engine,algorithms,metrics,experiments,persistence,api}, tests/
frontend/          src/{pages,features,charts,diagrams,components,state,services,lib,types}, e2e/
docs/              architecture, algorithm specs, AQS policy, methodology, testing, limitations, final audit, presentation
research-results/  protocol, raw CSV/JSON, tables, charts, summary, harness and analysis scripts
scripts/           setup.ps1, start.ps1, stop.ps1, test.ps1, run-e2e.ps1, mutation_check.py, start.sh
```

## Prerequisites
- Python 3.11+ (the project was developed and tested on Python 3.14 only)
- Node.js 20+ and npm (tested with Node 24, npm 11)
- No accounts, API keys or internet needed after installation (fonts are bundled).

## Installation
```powershell
.\scripts\setup.ps1
```
Creates `backend\.venv`, installs the Python dependencies, installs the npm packages and builds the frontend.

## Start options
```powershell
.\scripts\start.ps1                 # foreground, port 8000
.\scripts\start.ps1 -Background     # detached; verified before it returns; stop with .\scripts\stop.ps1
.\scripts\start.ps1 -Port 8010      # another port
.\scripts\start.ps1 -Dev            # API :8000 + Vite dev server :5173 with hot reload (not exercised in the final audit)
```
If the port is busy, `start.ps1` tells you which program owns it. If that is already SchedX it says so; otherwise it refuses to touch it and suggests `-Port`.

### macOS / Linux
```sh
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
cd frontend && npm install && npm run build && cd ..
sh scripts/start.sh
```
(The shell route is untested; the PowerShell scripts are the verified path.)

## Testing
```powershell
.\scripts\test.ps1                                              # backend pytest, frontend typecheck, vitest, production build
.\scripts\run-e2e.ps1                                           # Playwright browser tests on a private port with a temporary database (first: cd frontend; npx playwright install chromium)
backend\.venv\Scripts\python.exe scripts\mutation_check.py      # deliberately breaks the engine and codec 15 ways; the tests must catch every one
```
Current status and what was **not** tested: [docs/testing-and-validation.md](docs/testing-and-validation.md). Audit: [docs/final-audit.md](docs/final-audit.md).

## API summary
`GET /api/health` · `GET /api/algorithms` · `GET /api/presets` · `POST /api/simulations/run` (`detail`: `full` | `compact` | `summary`) · `POST /api/experiments/compare` · `POST /api/workloads/generate` · `POST /api/experiments/sweep` · `GET|POST /api/experiments` (`limit`, `offset`) · `GET|PATCH|DELETE /api/experiments/{id}` · `POST /api/experiments/{id}/reproduce`. Interactive docs at `/api/docs`.

Errors always look like `{"error": {"type": "validation_error", "messages": ["..."]}}`. Example:
```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8000/api/simulations/run -ContentType application/json -Body '{"algorithm":"srtf","workload":[{"pid":"A","arrival":0,"bursts":[8]},{"pid":"B","arrival":1,"bursts":[4]}]}'
```
A result with the complete per-event trace grows with events × processes (about 75 MB for 100 processes), so the web UI asks for `detail=compact` (a lossless encoding, about 14× smaller, gzip on the wire). The default `full` keeps the verbose form for scripts.

## Key conventions
- Bursts: `[CPU, I/O, CPU, …]`, starting and ending with CPU.
- **Priority: smaller number = higher priority** (0 highest).
- Context switch: counted when the CPU changes to a different process than the last one that executed. The cost is excluded from CPU utilisation.
- Full rules: [docs/algorithm-specifications.md](docs/algorithm-specifications.md). AQS: [docs/aqs-policy.md](docs/aqs-policy.md).

## Troubleshooting
| Symptom | Fix |
|---|---|
| **`ERR_CONNECTION_REFUSED`** at `http://127.0.0.1:8000` | Nothing is listening: the server is not running (it stops when its terminal window closes). Run `.\scripts\start.ps1` and leave the window open, or `.\scripts\start.ps1 -Background` (it prints health and homepage status). `setup.ps1` only installs and builds; it does not start the server. |
| "Port 8000 is already in use by another program" | Use `.\scripts\start.ps1 -Port 8010`, or stop the program shown. SchedX never kills a process it did not start. |
| "SchedX is already running at …" | A SchedX server is already up on that port. Open the URL, or stop it first (`.\scripts\stop.ps1` for one started with `-Background`; otherwise close its window). A server started by an older version may need `taskkill /PID <pid> /T /F`. |
| "Engine offline" in the sidebar / "Cannot reach the SchedX backend" | The API is not running on port 8000. In `-Dev` mode the API must be on 8000. |
| `running scripts is disabled on this system` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1` |
| Blank page at :8000 | The frontend build is missing: `cd frontend; npm run build` (or rerun `setup.ps1`) |
| My Lab results disappeared after a reload | By design: results are not kept in the browser. Your workload and settings are restored. Run again, or reopen a saved experiment from the Experiment Studio history |
| Want an empty experiment history | Stop the server, delete `backend\data\schedx.db` (or set the `SCHEDX_DB` environment variable to another file) |
| Playwright: browser not found | `cd frontend; npx playwright install chromium` |
| Background server will not start | See `backend\data\server.err.log` |
