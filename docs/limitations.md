# Limitations

## Model limitations
- SchedX is a **simulator**, not an operating system or a production scheduler. It does not modify or measure the Linux kernel. Linux's fair class (CFS, and EEVDF since 6.6) is not modelled.
- Single CPU. No SMP, affinity or migration.
- Integer time. Every process event happens at integer ticks.
- I/O devices are unlimited and parallel (no device queueing).
- Context switching is a constant configurable cost, **not a hardware measurement**. Cache and TLB effects are not modelled.
- SJF/SRTF use the exact current burst length. A real scheduler would have to predict it.
- Processes are independent: no synchronisation, no memory pressure.

## Research limitations
(See also the limitations in [research-results/summary.md](../research-results/summary.md).)
- Workloads are synthetic. Results depend on the generator configuration and the policy parameters.
- AQS thresholds are hand-set and were evaluated at their defaults only. In the recorded experiments AQS did perform worse than established approaches in some scenarios (for example response time against MLFQ in the Mixed class).
- The starvation flag is a threshold indicator on the longest ready stint, not a proof of indefinite postponement.
- Confidence intervals assume approximately normal trial means. They are indicative for small k.

## Known gaps
- The server still builds the full per-event trace in memory before encoding it. The response is small (a 100-process run is about 2 MB, 0.3 MB gzipped), but server memory for very large runs was not measured.
- Comparing saved experiments shows stored summaries side by side. It does not check that the workloads are equal (the dialog lists seeds and process counts and warns).
- No user accounts. The SQLite history is shared by everyone who uses the local server.
- The Gantt chart hides per-process lanes above 40 processes. The CPU lane and tables remain.
- `start.ps1 -Dev`, browsers other than Chromium, physical mobile devices, Python versions other than 3.14 and automated accessibility tooling were not tested.

## Potential extensions
- Exponential-average burst prediction for SJF, SRTF and AQS.
- Lottery and stride scheduling, and a simplified EEVDF-style virtual-deadline policy for comparison.
- Multi-core simulation with migration cost.
- Trace-driven workloads imported from real system logs.
