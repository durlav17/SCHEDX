# Implementation status

_Last updated: 2026-10-27, after the final audit. Details of what was checked and how: [docs/final-audit.md](docs/final-audit.md)._

## Startup status
* `.\scripts\start.ps1` (foreground), `-Background` + `stop.ps1`, and the occupied-port handling were each executed and verified (health endpoint and homepage answered). See the audit for the diagnosis of the earlier `ERR_CONNECTION_REFUSED` (not reproducible at inspection time; the server not running and an orphaned test server were the two defects found).
* **On this machine port 8000 is still held by an old SchedX server** (PID 41300, child 4872, left behind by the earlier `run-e2e.ps1`). It serves an older backend. It could not be stopped from the tool session. Stop it with `taskkill /PID 41300 /T /F`, then run `.\scripts\start.ps1 -Background`. All verification in this audit used other ports (8010, 8011, 8765).

## Features verified in this audit
* All 7 scheduling algorithms: tick-for-tick agreement with an independent reference model (78 parameter combinations × 80 random workloads), 15/15 mutants caught.
* Metrics, determinism, limits (100 processes, 50,000 tu, burst/arrival bounds), structured errors, persistence (save, list, reopen, reproduce, export, migration, concurrency).
* Replay and reverse stepping restore exact recorded snapshots (also after compact encoding).
* The complete 18-step faculty demonstration in a real browser, offline (no request leaves localhost), no console errors.
* Pages reviewed by screenshot at desktop and phone width; no horizontal overflow on the pages tested.

## Changes made in the audit
* Startup scripts (diagnosis, `-Background`, `stop.ps1`, private-port e2e, process-tree kill).
* Lossless compact result format: 31–75 MB → 2–5 MB (≈ 14–16×) for 100-process runs; gzip; lean `compare`; lightweight history list with migration; locked SQLite access.
* Persistence clarity in the UI: temporary vs saved run, *Save run*, restored-inputs notice, *Open in Lab/Arena*, *Reproduce*, an explainer.
* Homepage objectives; Research page *Observed results* generated from the recorded data.
* New tests for the reference model, mutation script, compact codec (Python + TypeScript golden fixture), API limits and path traversal, history paging, migration, concurrency.
* Cosmetic fixes (Bursts input, chart label collisions, research charts).

## Test results (final run, 2026-10-27)
| Check | Result |
|---|---|
| `backend: pytest -q` | 355 passed |
| `frontend: tsc -b` | pass |
| `frontend: vitest` | 22 passed (4 files) |
| `frontend: vite build` | pass |
| `scripts\run-e2e.ps1` (Playwright) | 10 passed (9 workflows + the 18-step demo) |
| `scripts\mutation_check.py` | 15/15 mutants caught |
| `research-results\run_research.py --verify` | 3,110 simulations, 0 failed, raw CSVs byte-identical across reruns, 47 cells match the API |
| Performance probe (100 processes) | 1.84 MB response (0.29 MB gzip), ≈ 1.1–1.7 s to render, 56.7 fps playback with no long task, also at 80 % of the run |

## Research experiments
Completed as pre-declared: Step 1 (450 runs), Step 2 (900), Step 3 (800), Step 4 (960). Artifacts: [research-results/](research-results/) (`PROTOCOL.md`, `summary.md`, `tables.md`, `raw/*.csv`, `raw/workloads.json`, `raw/manifest.json`, `verdicts.json`, `charts/fig1…fig5.svg`, `run_research.py`, `analyze.py`). Outcome: H1 met weakly, **H2 not supported** for Interactive/Mixed (no clear response gain over RR q=4; clearly worse than MLFQ in Mixed), H3 supported, H4 supported in 4 of 5 classes. Two analysis sections were added after seeing Step 1–2 tables and are labelled exploratory.

## Known issues and limitations
* `start.ps1 -Dev`, Firefox/Safari, physical phones, Python ≠ 3.14, automated accessibility tools: not tested.
* The server builds the full per-event trace in memory before encoding; memory for very large runs not measured.
* Research findings: synthetic workloads, one simulated CPU, default AQS parameters only, 10 trials per cell ("no clear difference" is not "equal"), no multiple-comparison correction, starvation flag saturates in the High-load class.
* Multi-core scheduling, burst prediction and real kernel measurement are out of scope.

## Next steps (optional)
1. Stop the old server on port 8000 (see above) and run `.\scripts\start.ps1 -Background`.
2. Explore AQS parameter settings as a **separate, clearly labelled** study (do not mix it into the protocol results).
3. Exercise `start.ps1 -Dev` and a second browser engine.
