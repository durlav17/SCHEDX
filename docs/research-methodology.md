# Research methodology

> **Status: executed.** The protocol was refined and fixed *before* running in [research-results/PROTOCOL.md](../research-results/PROTOCOL.md) (switch cost, parameters, baselines per hypothesis, decision rules) and run with the SchedX engine: 3,110 simulations. Observed results, interpretation and limitations are in [research-results/summary.md](../research-results/summary.md). This document states the design; results are kept separate so that hypotheses are never confused with findings. In short: H3 supported, H4 supported in 4 of 5 classes, H1 met only weakly, and **H2 (a response-time gain) not supported** for the Interactive and Mixed classes at default AQS parameters.

## Research question
Can a workload-adaptive time-quantum scheduling policy (AQS) improve response time for interactive and mixed workloads without introducing unacceptable context-switch overhead, unfairness or starvation, compared with established scheduling algorithms?

## Hypotheses (to be tested, not findings)
- **H1:** Different workload classes produce different relative rankings. No single policy is most favourable on every metric.
- **H2:** AQS may lower mean or p95 response time against fixed-quantum RR on interactive and high-load workloads, possibly at the cost of more switches or longer turnaround.
- **H3:** The quantum and the switch cost change the trade-offs. Under a high switch cost, AQS's overhead rule should keep its switch count below that of a small fixed quantum.
- **H4:** AQS (FIFO-based) should not trigger starvation flags under thresholds where non-ageing preemptive priority does.

## Workload classes (generator presets, `backend/app/experiments/presets.py`)
| Class | Seed | Character |
|---|---|---|
| CPU-bound | 101 | 8 procs, CPU 8–30, no I/O |
| I/O-heavy | 202 | 8 procs, CPU 1–5, 90% I/O-bound, up to 4 I/O cycles of 4–12 |
| Interactive | 303 | 12 procs, Poisson arrivals (mean 2), exponential CPU (mean 3), 50% I/O |
| Mixed | 404 | 10 procs, bimodal CPU 1–24 (70% short), 30% I/O |
| High load | 505 | 20 procs arriving within 5 tu, CPU 2–15, 20% I/O |

Two hand-written workloads (`demo`, `io_demo`) serve teaching. Presets are inputs only: no results are stored with them.

## Experimental design
1. **Controlled comparison:** for each class, run FCFS, SJF, SRTF, RR (q ∈ {2, 4, 8}), MLFQ and AQS on the identical process list (Arena or Studio).
2. **Switch-cost sensitivity:** sweep `context_switch_cost` ∈ {0..5} for RR and AQS.
3. **Quantum sensitivity:** sweep the RR quantum and the AQS base quantum.
4. **Scale:** sweep `process_count` ∈ {4..32}.
5. **Repetition:** for each generated configuration use k = 10 trials (seeds s…s+9). Report the mean ± 95% Student-t CI.
6. **Fairness and starvation:** report the Jain index on slowdown, the max ready stint and starvation flags next to the latency metrics.

## Metrics
Primary: mean and p95 response time. Secondary: mean ready wait, mean and p95 turnaround, throughput, CPU utilisation (overhead excluded), context switches, overhead, max ready stint, starvation flags, Jain fairness. Definitions: [algorithm-specifications.md §6](algorithm-specifications.md#6-metrics).

## Analysis approach
- Compare against a stated baseline with absolute and percentage deltas (undefined when the baseline is 0).
- Treat a difference as meaningful only when the CIs of repeated trials do not overlap. Otherwise report "no clear difference".
- Report per class. Do not aggregate classes into one score.
- Record negative results. Saved experiments keep seeds and configurations, and the reproduce endpoint verifies them.

## Threats to validity
Synthetic workloads; exact burst knowledge for SJF/SRTF; a single-CPU model; switch cost as a constant; thresholds of AQS tuned by hand. See [limitations.md](limitations.md).
