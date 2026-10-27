# research-results

Recorded outputs of the SchedX research experiments, kept separate from the runtime SQLite database (`backend/data/`, git-ignored).
Everything here was produced by the SchedX engine; nothing is a real-hardware benchmark.

| File | What it is |
|---|---|
| [PROTOCOL.md](PROTOCOL.md) | The experimental protocol, written **before** any run (fixed parameters, steps, decision rules). Its SHA-256 is stored in the manifest. |
| [summary.md](summary.md) | **The findings**: verdicts per hypothesis, the answer to the research question, limitations. |
| [tables.md](tables.md) | Every result table, generated from the raw data (do not edit). |
| `raw/step1_comparison.csv` … `step4_scale.csv` | One row per simulation (3,110 in total): workload class, trial, seed, process count, configuration, parameters, switch cost, sweep value, workload hash and 16 metrics. |
| `raw/workloads.json` | Every generated process list, keyed by class, trial, seed and size. |
| `raw/manifest.json` | Protocol hash, engine-source hash, parameter sets, counts (completed / failed / skipped), CSV hashes, environment. |
| `verdicts.json` | Machine-readable verdicts produced by the pre-declared decision rule. |
| `charts/fig1 … fig5 *.svg` | Charts drawn from the raw CSVs only (bar charts and line charts with 95 % CIs, a paired-difference forest plot). |
| `run_research.py`, `analyze.py` | The harness and the analysis. |

## What was run
3,110 simulations: Step 1 comparison (5 workload classes × 10 trials × 9 configurations = 450), Step 2 switch-cost sweep (900), Step 3 quantum sweep (800), Step 4 scale sweep (960). All completed; none failed or were skipped (`raw/manifest.json`, `failed_or_skipped: []`). The trial id is the `trial` column and the seed is the `seed` column (class base seed + trial).

## Reproduce
From the repository root (Windows PowerShell), after `.\scripts\setup.ps1`:

```powershell
$env:PYTHONWARNINGS = "ignore"
backend\.venv\Scripts\python.exe research-results\run_research.py --verify   # ~4 s; regenerates raw/ and cross-checks 47 cells via the HTTP API
backend\.venv\Scripts\python.exe research-results\analyze.py                 # regenerates tables.md, verdicts.json, charts/ and the website data
```

The CSV files are deterministic: the same engine and protocol give byte-identical files. `summary.md` is hand-written from `tables.md`; if you rerun after changing the engine, re-read the tables and update it.

## Reproducibility record
| Check | Result |
|---|---|
| Raw CSV SHA-256, run 1 vs run 2 (same code) | identical |
| Raw CSV SHA-256 after the later payload/persistence changes (new `compact.py`, edited `analysis.py`) | **identical** (so those changes did not alter any simulation result) |
| API cross-check (`--verify`): 3 workloads × 9 configurations through `/api/experiments/compare` (27 cells), plus a 2-value × 10-trial sweep through `/api/experiments/sweep` (20 cells) | 47 cells identical to the CSV |
| Step 4 at 12 processes vs Step 1 (same seeds) | identical (Interactive: AQS 12.62 ± 2.19 in both) |
| Every simulation's accounting invariant (turnaround = ready + dispatch + CPU + I/O) | asserted in `run_one`; none violated |

SHA-256 of the four CSVs (2026-10-27):
```
step1_comparison.csv     BAAE323F0ADBBF376582DF31B8288D6801F8079199A4760E4612C581ED6EE104
step2_cost_sweep.csv     EFE91B499346CB57672EEF3E6F6AF8E96F8FA513DB05A516BBC5B7F3985EB20E
step3_quantum_sweep.csv  7740132B9C4F39745AED4A073C8B6EEBC35AA03CDCEECB7071DDEEA6FC1C721B
step4_scale.csv          432AEFECEAD2303465A0AA43F3B2676816268F0549DF88CF3A655D69CEAC7BEB
```

## Provenance and honesty notes
* The protocol was fixed before any result was seen and was not changed afterwards.
* Two sections of `tables.md` (Exploratory extensions A and B) were added after the Step 1 and 2 tables had been viewed, to avoid comparing confidence intervals by hand. They use the same decision rule and are labelled exploratory in `summary.md`.
* Two cosmetic chart defects (overlapping titles, a mislabelled legend entry in Fig. 4) were found by looking at the rendered charts and fixed; the data and tables did not change.
* AQS parameters are the documented defaults. The experiments do not show how a tuned AQS would behave.
