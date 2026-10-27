# Presentation outline (≈15 minutes)

**SchedX: An Explainable, Workload-Adaptive CPU Scheduling and Performance Evaluation Platform**
Durlav Dani (24BCE2361) · Nathan Laji Joseph (24BDS0332) · Faculty Mentor: Dr Arthi M

1. **Problem and motivation (1.5 min)**: one CPU, many ready processes. The policy determines response, waiting, turnaround and overhead. No policy wins everywhere, and fair comparison needs identical workloads and defined metrics.
2. **Objectives (1 min)**: a correct, testable simulator; decision-level explainability; controlled comparisons; evaluation of AQS; reproducibility.
3. **Research question (0.5 min)**: can an adaptive quantum improve response time for interactive and mixed workloads without unacceptable overhead, unfairness or starvation? Say that the project tests this rather than assuming it; the answer comes back at step 8.
4. **Architecture (1.5 min)**: the Architecture page diagram. React UI → FastAPI → standalone engine → policies → trace and metrics → UI, SQLite and exports. The engine has no web dependencies.
5. **Algorithms (2 min)**: the table of seven policies, with event ordering, tie-breaking and the switch model. Mention the priority convention (smaller = higher).
6. **Signature features (3 min), live**:
   - Lab: **Run demonstration** (classroom workload, RR q=3). Play, step back, show the inspector and state timeline.
   - **Decision Replay**: step to a quantum-expiry decision and read the recorded explanation and candidates.
   - **Arena**: Classic four on the same workload. Point out trade-offs, not a winner.
7. **Experimental methodology (2 min)**: workload classes with seeds, sweeps, 10 trials with 95% CI, the reproducibility check (Studio → History → Reproduce).
8. **Demonstration scenario and findings (2.5 min)**: follow the 18-step flow in `frontend/e2e/demo.spec.ts` (Lab → Replay → Arena → What-If → seeded generation → save → reload → reproduce → export). Then show the Research page's *Observed results*: AQS did **not** clearly beat RR q=4 on response in Interactive/Mixed, it cut switches and turnaround when switching is costly, and it raised response time and the longest ready wait. Say plainly that hypothesis H2 was not supported at default parameters.
9. **Limitations (1 min)**: a model, not a kernel; switch cost is a parameter; exact burst knowledge; synthetic workloads; AQS may lose.
10. **Future work (0.5 min)**: burst prediction, lottery/stride/EEVDF-style comparison, multi-core, trace-driven workloads.

**Backup:** the test suite (`scripts/test.ps1`), the AQS rule from `docs/aqs-policy.md`, and the metric anatomy diagram (Learn → section 12).
