# Architecture

```
USER (browser)
   │
   ▼
React + TypeScript frontend  (frontend/src)        Vite · Tailwind · Recharts · custom SVG Gantt
   │  fetch /api/*  (JSON)
   ▼
FastAPI application layer     (backend/app/api, main.py)   Pydantic schemas, structured errors
   │
   ▼
Standalone simulation engine  (backend/app/engine)         stdlib only, no FastAPI imports
   │
   ▼
Scheduling policies           (backend/app/algorithms)     FCFS SJF SRTF RR Priority MLFQ AQS
   │
   ▼
Decision trace + metrics      (engine frames/decisions, backend/app/metrics)
   │
   ├──► JSON results → UI (Gantt, inspector, replay, charts)
   ├──► SQLite              (backend/app/persistence, backend/data/schedx.db)
   └──► CSV / JSON exports  (frontend/src/services/export.ts, from API data)
```

## Components

| Component | Path | Responsibility |
|---|---|---|
| Models & validation | `backend/app/engine/models.py` | `ProcessSpec`, `SimConfig`, limits, workload and parameter validation with per-problem messages |
| Simulator | `backend/app/engine/simulator.py` | Discrete-time loop with the documented event order. PCBs, ready queue, context switches, frames, decisions, transitions, segments, state intervals |
| Policies | `backend/app/algorithms/{base,classic,adaptive,registry}.py` | `select`, `quantum`, `preempt_check`, and the `on_enter_ready` / `on_slice_end` / `on_time` hooks. Each writes its own explanation |
| Metrics | `backend/app/metrics/metrics.py` | Per-process and system metrics, nearest-rank percentiles, Jain index, accounting invariant |
| Experiments | `backend/app/experiments/` | Seeded generator, presets, compare (deltas vs. baseline), sweep (with trials and 95% CI) |
| Compact format | `backend/app/engine/compact.py`, `frontend/src/lib/compact.ts` | Lossless `schedx-compact-1` encoding of a result (per-event snapshots stored as predicted-value deltas, ready-queue deltas, derived lists). About 14x smaller; decoded back to the full result in the browser |
| Persistence | `backend/app/persistence/db.py` | SQLite `experiments` table (inputs, config, engine results) with light summary columns, in-place migration and a lock around the shared connection |
| API | `backend/app/api/routes.py`, `schemas.py`, `main.py` | Endpoints, error handlers, serves `frontend/dist` in single-server mode |
| Frontend state | `frontend/src/state/LabContext.tsx` | Shared workload, configuration and latest result (workload and config remembered in localStorage) |
| Visualisation | `frontend/src/charts`, `frontend/src/diagrams` | SVG Gantt (zoom, hover, playhead, markers), Recharts small multiples, live engine-backed diagrams |
| Pages | `frontend/src/pages` | Home, Lab, Arena, Replay, What-If, Studio, Learn, Research, About, Architecture, Docs |

## Data flow: one simulation
1. `POST /api/simulations/run {workload, algorithm, params, context_switch_cost, starvation_threshold, detail}` (`detail`: `full` (default), `compact` (what the web UI requests) or `summary` (segments and metrics only))
2. Pydantic validates the shape. `validate_workload` / `validate_config` validate the semantics. On failure: `422 {"error": {"type": "validation_error", "messages": [...]}}`.
3. `Simulator.run()` returns PCBs, segments, frames, decisions, transitions and state intervals.
4. `compute_metrics` adds system and per-process metrics.
5. For `detail=compact` the per-event trace is encoded losslessly (see `compact.py`); responses over 1 KB are gzip-compressed. The browser decodes it back to the full result.
6. The UI renders everything from this single document. Playback and replay index into `frames` and `decisions`, so stepping backward shows the **recorded** prior state.

## Saving experiments
`POST /api/experiments` carries **inputs only**. The server regenerates the workload (if a generator is given), reruns the engine and stores inputs plus outputs. `POST /api/experiments/{id}/reproduce` reruns from the stored inputs and reports whether the results are byte-for-byte identical after a JSON round trip.

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | status |
| GET | `/api/algorithms` | algorithms, defaults, limits, priority convention |
| GET | `/api/presets` | example workloads + generator defaults |
| POST | `/api/simulations/run` | one simulation |
| POST | `/api/experiments/compare` | 2–8 configs on one workload. Per-event trace (`frames`, `decisions`, `state_intervals`) only with `include_frames: true` |
| POST | `/api/workloads/generate` | seeded generation |
| POST | `/api/experiments/sweep` | one-parameter sweep (`quantum`, `context_switch_cost`, `process_count`, `cpu_mean`, `cpu_max`), `trials` 1–20 |
| GET/POST | `/api/experiments` | list (light summaries, newest first, optional `limit`/`offset`, returns `total`) / save (server-side rerun) |
| GET/PATCH/DELETE | `/api/experiments/{id}` | detail / rename / delete |
| POST | `/api/experiments/{id}/reproduce` | reproducibility check |

Interactive OpenAPI docs: `http://127.0.0.1:8000/api/docs`.

## What is stored where
| Thing | Where | Lifetime |
|---|---|---|
| Latest Lab run (decoded result) | browser memory | until reload |
| Lab workload and scheduler settings | browser `localStorage` (`schedx.lab.v1`); What-If baseline (`schedx.whatif.baseline.v1`) | until cleared |
| Saved experiments (inputs, seed, configs, engine results) | SQLite `backend/data/schedx.db` | until deleted |
| Research artifacts | `research-results/` (tracked), separate from the database | in the repository |
