# Final audit (2026-10-27)

Scope: verify the existing SchedX project against the real code and real execution, fix what was wrong, run the research protocol, and prepare the live demonstration. Every statement below was checked in this audit by running something; items that could not be checked are listed as such.

## 1. Verified working
| Area | Evidence from this audit |
|---|---|
| Server start (`.\scripts\start.ps1`, foreground) | Started on a free port in a separate process; `/api/health`, `/` and a deep link (`/lab`) all answered 200; clean stop. |
| Server start (`-Background`, `stop.ps1`) | Started detached, returned only after health **and** homepage checks passed; `stop.ps1` killed the whole process tree it had recorded and nothing else. |
| Occupied port | `start.ps1` identified the owner (a SchedX server: reports "already running"; any other program: prints PID and command line, refuses to kill it, suggests `-Port`). |
| Scheduling engine, all 7 algorithms | **Differential testing**: an independent reference simulator (written only from the specs, structured differently) agrees tick-for-tick with the engine on 78 configuration × workload-kind × switch-cost combinations, 80 random workloads each, with ties, I/O, idle gaps, ageing, MLFQ boosts and AQS adjustments. **Mutation testing**: 10 deliberate engine bugs (SRTF tie preemption, requeue order, ageing off-by-one, MLFQ demotion/boost/preempt rules, AQS rule order/step/window, switch counting) were all caught. No engine defect was found. |
| Metrics | Accounting invariant `turnaround = ready + dispatch + CPU + I/O` holds for every algorithm × preset × switch cost (and for all 3,110 research simulations). Percentile, Jain index and CI routines have unit tests. |
| Determinism | Same inputs give identical results for all 7 algorithms; the research CSVs are byte-identical across reruns. |
| Documented limits | 100-process cap, 50,000-tu horizon, burst/arrival limits: each is now covered by a test (these were previously untested). |
| API | All endpoints exercised by tests, plus the live browser flow. Structured errors, no tracebacks. Gzip on large responses. |
| Persistence | Save, list, reopen, rename, delete, reproduce, export; survives a server restart; a database from the first release is migrated in place; concurrent saves are serialised and tested. |
| Replay / reverse stepping | Backward replay shows the exact recorded snapshots, also after the compact encoding (decoded frames are compared with the engine's frames in reverse order, in Python and in TypeScript). |
| Full faculty demo | `frontend/e2e/demo.spec.ts` drives all 18 steps in a real browser (Chromium via Playwright), with no console errors and **no request leaving localhost** (the demo works offline). |
| Names and registration numbers | Checked by the e2e tests on the homepage, footer and About page: Durlav Dani, 24BCE2361; Nathan Laji Joseph, 24BDS0332; Faculty Mentor Dr Arthi M. |
| Responsive layout | No horizontal overflow at 1440 px and 390 px on the pages tested (home, lab, compare, learn, about); full-page screenshots of every route reviewed by eye. |

## 2. Partially working / only partly verified
* **`start.ps1 -Dev`** (hot-reload mode) was not exercised in this audit.
* **Browsers:** only Chromium (Playwright) was tested. Firefox and Safari were not. Mobile was tested with an emulated 390 × 844 viewport, not a physical phone.
* **Python:** the README says 3.11+, but only Python 3.14 was tested.
* **Accessibility:** semantic HTML, labels, focus styles and chart descriptions are implemented and were reviewed by reading the markup, but no automated accessibility tool (for example axe) and no screen-reader test was run.
* **Server memory for very large runs:** the response is now small, but the server still builds the full per-event trace in memory before encoding it. A 100-process run was fast (about 0.5 s of simulation), and memory use was not measured.
* **History list at scale:** its cost no longer depends on result sizes, but it was not measured with hundreds of stored experiments.

## 3. Incomplete / out of scope (unchanged)
Multi-core scheduling, burst-length prediction, real kernel measurement, user accounts. These are documented as future work and limitations.

## 4. Bugs and inconsistencies found
| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | **Server not reachable (`ERR_CONNECTION_REFUSED`)**. At inspection time a SchedX server *was* listening on port 8000, so I could **not reproduce the exact refusal**. What I found: `start.ps1` ran only in the foreground with no checks, so closing that terminal (or never starting it after `setup.ps1`) leaves nothing listening and nothing says so; `run-e2e.ps1` left an **orphaned server tree** on port 8000 (the venv `python.exe` is a launcher that spawns the real interpreter, and only the launcher was stopped), which would also make the next start fail. | High | `start.ps1`: port-owner diagnosis, `-Background` mode that verifies health and homepage before reporting success, `-Port`. New `stop.ps1` (stops the recorded process tree only). `run-e2e.ps1` kills the whole tree and uses a private port (8765) and temporary database. README troubleshooting updated. |
| 2 | My first `start.ps1 -Background` used the read-only PowerShell variable `$home` and falsely reported "homepage not served" | Medium | Caught by testing the script; fixed. |
| 3 | **Payload size was misreported.** The status file said "several MB"; measured: **31 MB to 75 MB** for 100-process runs (fully recorded per-event snapshots grow with events × processes). | High | Lossless compact encoding (`schedx-compact-1`): same workload 31.1 MB → 2.2 MB (14×), 75 MB → 4.7 MB (16×), 0.29 MB on the wire with gzip. Proven lossless and tested in Python and TypeScript. |
| 4 | `compare` returned per-event decisions and state intervals that the UI never reads (7 MB+ per compared run at 100 processes) | Medium | Now returned only with `include_frames: true`. |
| 5 | The history list parsed every experiment's full stored results just to show a name and a count | Medium | Light columns (`summary`, `process_count`) with an in-place migration; optional `limit`/`offset`. |
| 6 | One SQLite connection shared by worker threads without a lock | Low | Access serialised; concurrent-save test. |
| 7 | Homepage had no objectives (needed for demo step 2); Research page said hypotheses were "to be tested" although results now exist | Medium | Objectives added; "Observed results" section generated from the recorded data. |
| 8 | A saved experiment vs. a temporary run vs. remembered inputs were indistinguishable in the UI | Medium | Status badge on every Lab run, **Save run**, a notice after reload, "Open in Lab / Arena", "Reproduce", and a "What is kept, and where?" guide. |
| 9 | UI: the Bursts input clipped longer lists; long configuration labels collided on the small charts' x-axis (What-If) | Low | Fixed. |
| 10 | Frontend crashed against a backend that predates the compact format | Low | The client accepts either format (tested). |
| 11 | Research charts (found while reviewing renders): overlapping titles, bars exceeding the axis, and a legend that said "RR q=4" for a series that was RR at the swept quantum | Low | Fixed; data unchanged. |
| 12 | `limitations.md` and `IMPLEMENTATION_STATUS.md` described the old state | Low | Updated. |
| 13 | **Flaky e2e test** (found by the final run): the demo's export step clicked the *newest* history row, which could belong to another test running in parallel on the same temporary database | Low | The test now selects its own experiment by name; 3 consecutive runs passed 10/10. |
| 14 | An earlier screenshot run of mine saved 4 experiments into the real `backend/data/schedx.db` | Low | Identified as my own artifacts and deleted; the database is empty again. |

## 5. Test results obtained during this audit
See [testing-and-validation.md](testing-and-validation.md) for the table with the final run. Summary: backend pytest, frontend typecheck, Vitest, production build, Playwright e2e (including the 18-step demo), the research protocol with its API cross-check, and the performance probe all passed in the final run.

## 6. Remaining limitations
* The research findings come from synthetic workloads, one simulated CPU and a constant switch cost, with AQS at default parameters. See [research-results/summary.md](../research-results/summary.md).
* The 'unclear' verdicts mean "not distinguishable with 10 trials", not "equal".
* Items in section 2 above.
* **Port 8000** (this machine): a SchedX server started by the old `run-e2e.ps1` is still running there (PID 41300, with child 4872) and serves an older backend. Stopping it needs a manual `taskkill /PID 41300 /T /F`, because the tool I was running under declined to terminate it. The new scripts never leave such a process behind.
