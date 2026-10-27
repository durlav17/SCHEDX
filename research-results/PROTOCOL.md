# Pre-declared experimental protocol

_Written before any experiment was run. It refines, and does not replace, `docs/research-methodology.md`.
The SHA-256 of this file is recorded in `raw/manifest.json` by the harness, so any later edit is detectable._

## Fixed choices (the methodology left these open)

| Item | Choice | Reason |
|---|---|---|
| Engine | the SchedX engine in `backend/app/engine`, called directly by `run_research.py` (the same code the API runs) | no re-implementation |
| Context-switch cost | **1 tu** in the main comparison (Step 1), the Studio default. Swept 0–5 in Step 2 | declared before results |
| Starvation threshold | 50 tu (engine default) | unchanged default |
| Trials | **10 per workload class**; trial *k* uses seed = class base seed + *k* (k = 0…9) | methodology: 10 trials, seeds s…s+9 |
| Class base seeds / generator settings | exactly the presets in `backend/app/experiments/presets.py` (101, 202, 303, 404, 505) | unchanged presets |
| Identical inputs | every configuration in a trial receives the same generated process list (verified by a workload SHA-256 recorded per row) | fair comparison |

## Configurations (parameters are fixed and are NOT tuned)

| Label | Algorithm | Parameters |
|---|---|---|
| FCFS | fcfs | — |
| SJF | sjf | — |
| SRTF | srtf | — |
| RR q=2 / q=4 / q=8 | rr | quantum 2 / 4 / 8 |
| MLFQ | mlfq | engine defaults: quanta [4, 8, 16], boost every 100 tu |
| AQS | aqs | engine defaults: q0=4, min 2, max 12, step 1, high_load 4, low_load 1, overhead_limit 0.2, window 5 |
| PRIO-P | priority | preemptive, no ageing. Used **only** for H4 (the hypothesis names it as the comparison) |

AQS parameters are the documented defaults and will not be changed after seeing results.
**RR q=4 is the primary baseline for AQS** because AQS starts at q0=4: any difference isolates the adaptation.
MLFQ is the second prescribed baseline.

## Steps

1. **Controlled comparison.** 5 classes × 10 trials × 9 configurations, cost 1.
2. **Switch-cost sensitivity.** cost ∈ {0,1,2,3,4,5}; configurations RR q=2, RR q=4, AQS; 5 classes × 10 trials.
3. **Quantum sensitivity.** value ∈ {1,2,3,4,6,8,12,16}; RR (quantum) and AQS (base quantum; min = min(2, value), max = max(12, value)); cost 1; 5 classes × 10 trials.
4. **Scale.** process count ∈ {4, 8, 12, 16, 24, 32}; the Interactive and Mixed classes only (the research question's classes); all 8 non-priority configurations; cost 1; 10 trials.

## Metrics (all from the engine, per run)
Response (mean, median, p95, max); ready wait (mean); turnaround (mean, p95); throughput; CPU utilisation (overhead excluded);
context switches; simulated overhead; longest ready stint; starvation flags; Jain fairness on slowdown; preemptions; makespan.

## Analysis and decision rules (fixed in advance)

For each class and metric, each configuration's mean over the 10 trials is reported with a two-sided 95 % Student-t confidence interval (df = 9).

* **Primary decision rule** (from the methodology): a difference between two configurations is **clear** only if their 95 % CIs **do not overlap**. Otherwise it is reported as *no clear difference*.
* **Supplementary** (reported, labelled as such, never used to overturn the primary rule): the paired difference AQS − baseline over the 10 seeds, with its own 95 % t-CI. It is more sensitive because trials share workloads.
* "Better" means lower for response, wait, turnaround, switches, overhead, max stint and starvation flags; higher for throughput, utilisation and Jain fairness.

### Hypotheses and how each is judged
* **H1** (rankings differ across classes): for each class, rank configurations by mean response time and by mean turnaround. H1 is **supported** if the first-ranked configuration is not the same in all five classes for at least one of these metrics (point estimates; differences between neighbours may be unclear and are flagged).
* **H2** (AQS may lower response): compare AQS with RR q=4 and with MLFQ on mean and p95 response in every class, with focus on **Interactive**, **Mixed** and **High-load**. Judged by the primary rule.
* **H2-cost** ("without unacceptable overhead, unfairness or starvation"): AQS is judged **unacceptable on a dimension** for a class if it is *clearly worse* (primary rule) than RR q=4 on that dimension. Dimensions: turnaround, context switches, Jain fairness, starvation flags, longest ready stint, throughput. Anything else is reported as acceptable or unclear.
* **H3** (switch cost shapes trade-offs; AQS's overhead rule limits switches at high cost): in Step 2, at cost 5 compare AQS with RR q=2 on context-switch count, judged by the primary rule.
* **H4** (AQS does not trigger starvation flags where PRIO-P does): compare starvation-flag counts and longest ready stint for AQS and PRIO-P in Step 1.

## What will not be done
No change to parameters, thresholds, seeds or decision rules after seeing results. Failed or skipped runs, if any, are listed, not filled in. Negative results are reported with equal prominence.
