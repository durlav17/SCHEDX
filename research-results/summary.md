# Research summary: what the experiments found

> **Scope.** Simulation results from the SchedX engine: synthetic workloads, one simulated CPU, switch cost as a model parameter (not a hardware measurement), AQS at its documented **default** parameters (not tuned). Nothing here is a real-hardware benchmark or a claim about the Linux kernel.
> **Procedure.** Exactly as pre-declared in [PROTOCOL.md](PROTOCOL.md): 3,110 simulations, 10 trials per workload class (seeds = class base seed + 0…9), identical workloads for every configuration, 95 % Student-t CIs, and the rule *"a difference is clear only if the two CIs do not overlap"*. All numbers below are copied from [tables.md](tables.md) (generated from `raw/*.csv`). The protocol was not changed after results were seen. Two sections of `tables.md` (Exploratory extensions A and B) were added afterwards to avoid comparing CIs by hand. They use the same rule and are labelled *exploratory* here.

## Answer to the research question

**Not supported for the interactive and mixed workloads, under the tested default parameters.**
AQS did **not** clearly improve response time over fixed-quantum Round Robin (q=4) in the Interactive or Mixed classes, and it was **clearly worse than MLFQ** on mean and p95 response in the Mixed class. Its measurable effect is a **trade-off**: fewer context switches and (when switching is expensive) lower turnaround, paid for with higher response time and, in three classes, a longer worst-case ready wait than RR q=4.

## Hypothesis by hypothesis

### H1: rankings differ across workload classes. *Criterion met, but only weakly.*
* The pre-declared criterion (first-ranked configuration differs across classes for at least one metric) is met for **turnaround**, where SRTF or SJF is first (SRTF in CPU-bound and Mixed, SJF in the other three). These two are nearly tied and their confidence intervals overlap, so this is a thin basis.
* For **mean response** the first-ranked configuration is **RR q=2 in all five classes**.
* Lower ranks do change with the workload: for mean response FCFS ranks last (9th of 9) in CPU-bound but 5th in I/O-heavy; AQS ranks 2nd in High load, 3rd in CPU-bound and Mixed, 4th in I/O-heavy and 6th in Interactive (point-estimate ranks, `tables.md` section H1).

### H2: AQS may lower response time (primary rule; mean response, AQS vs baseline)

| Class | vs RR q=4 | vs MLFQ | vs RR q=2 |
|---|---|---|---|
| CPU-bound | **−11.9 % clearly better** | +27.8 % clearly worse | +44.1 % clearly worse |
| I/O-heavy | +2.1 % unclear | +2.7 % unclear | +28.4 % unclear |
| **Interactive** | +4.1 % unclear | +16.3 % unclear | +25.0 % unclear |
| **Mixed** | −3.2 % unclear | **+19.3 % clearly worse** | +41.0 % clearly worse |
| **High load** | −4.4 % unclear | −3.1 % unclear | +50.9 % clearly worse |

* The only clear improvement over RR q=4 is in the **CPU-bound** class (not a research-question class).
* In the research-question classes (Interactive, Mixed) there is **no clear improvement** over RR q=4 and MLFQ, and RR q=2 has the lowest mean response in every class.
* p95 response: AQS vs RR q=4 is unclear everywhere except CPU-bound (−14.4 % better). In Interactive the point estimate is +10.4 % (paired difference: worse).
* Against the larger fixed quantum RR q=8, AQS clearly lowers mean response in CPU-bound (−48.9 %), Mixed (−29.4 %) and High load (−38.0 %): AQS behaves like something between q=4 and q=8.
* **Verdict: H2 not supported** for Interactive and Mixed. The supplementary paired differences do not change this: for mean response against RR q=4 they are "unclear" in both classes (and "worse" for Interactive p95). In High load the paired difference (−4.4 %) does favour AQS although the primary rule says unclear, so that class is the closest to a positive result.

### "Without unacceptable overhead, unfairness or starvation": AQS vs RR q=4 at cost 1
Declared rule: unacceptable on a dimension if clearly worse than RR q=4.

| Class | Clearly worse | Clearly better |
|---|---|---|
| CPU-bound | longest ready stint (+8.9 %: 38.1 vs 35.0 tu) | none |
| I/O-heavy | none | none |
| Interactive | none | none |
| Mixed | longest ready stint (+23.8 %: 40.0 vs 32.3 tu) | context switches (−20.2 %: 26.4 vs 33.1) |
| High load | longest ready stint (+7.1 %: 93.8 vs 87.6 tu) | none |

Turnaround, throughput, Jain fairness and starvation-flag counts are **not** clearly different from RR q=4 in any class at cost 1. By the pre-declared rule AQS is therefore "unacceptable" on **one** dimension (longest ready stint) in three classes. The magnitudes are modest (+7 % to +24 %), and the table shows, not hides, this cost.

### H3: switch cost shapes the trade-offs; AQS's overhead rule limits switches at high cost. *Supported.*
* **At cost 5, AQS makes clearly fewer context switches than RR q=2 in every class**: −75.8 % (CPU-bound), −43.7 % (I/O-heavy), −44.0 % (Interactive), −69.0 % (Mixed), −68.7 % (High load).
* **Exploratory extension A** shows what this costs. Against RR q=4, the sign of AQS's effect **flips with the switch cost**:

| Mean response, AQS vs RR q=4 | cost 0 | cost 1 | cost 2 | cost 5 |
|---|---|---|---|---|
| CPU-bound | −24.2 % better | −11.9 % better | +23.7 % worse | +31.1 % worse |
| Mixed | −16.4 % unclear | −3.2 % unclear | +23.9 % worse | +15.5 % worse |
| High load | −40.4 % better | −4.4 % unclear | +34.2 % worse | +24.7 % worse |
| Interactive | −6.2 % unclear | +4.1 % unclear | +6.3 % unclear | +2.7 % unclear |

* Over the same range AQS is clearly **better on turnaround** at cost 5 in CPU-bound (−33.1 %), Mixed (−26.8 %) and High load (−30.1 %), and clearly makes **fewer switches** than RR q=4 from cost 2 in those three classes. At cost 0 the opposite holds: AQS makes clearly *more* switches (+57 % to +76 % in those classes) because it shrinks its quantum under load when switching is free.
* Plausible mechanism (an interpretation consistent with the documented rule, not tested in isolation): once switch overhead pushes ρ above the limit, the overhead rule takes precedence and lengthens the quantum, which cuts overhead and turnaround but delays first responses.

### H4: AQS does not trigger starvation flags where preemptive Priority does. *Supported in four classes, not in High load.*
Longest ready stint and starvation flags (threshold 50 tu), AQS vs preemptive Priority without ageing:
* CPU-bound, I/O-heavy, Interactive, Mixed: AQS has clearly fewer flags (0.00 / 0.00 / 0.00 / 0.20 vs 4.70 / 2.10 / 2.20 / 4.40) and a clearly shorter longest stint.
* **High load: AQS has clearly *more* flags** (17.8 vs 14.3 of 20 processes) although its longest stint is clearly shorter (93.8 vs 218.3 tu). Here the fixed 50-tu threshold is saturated for every Round-Robin-family policy, so the flag count barely discriminates between them. This is a weakness of the indicator in that class, not evidence of AQS-specific starvation.

## Other observations
* **Quantum sensitivity (Step 3).** AQS's mean response is almost flat across base quanta while RR's grows with the quantum (for example High load: RR 18.5 → 82.0 tu for q = 1 → 16, AQS 41.3 → 68.5). At base quantum 1, AQS is clearly *worse* on response than RR with that quantum in all five classes. At base quantum 8 or more its mean response is below RR's point estimate in CPU-bound, Mixed and High load (not individually tested), consistent with its bounded adaptation pulling the quantum towards the middle of its range.
* **Scale (Step 4).** AQS's mean response is higher than RR q=4's at **all 12** (class, size) points, clearly so only for Mixed at 24 processes (+11.5 %) and 32 (+13.0 %). Against MLFQ, AQS is clearly worse in Mixed at every size (+14.4 % to +114.8 %) and in Interactive at 16 and 24 processes.
* Step 4 at 12 processes reproduces the Step 1 Interactive numbers exactly (same seeds), a consistency check between runs.

## Limitations
* **Defaults only.** AQS was evaluated at its default parameters, as pre-declared. A tuned AQS might behave differently. These results do not show that no parameterisation could help.
* **Synthetic workloads and a model.** One CPU, parametric generators, a constant switch cost. Real behaviour will differ.
* **10 trials per cell.** The "CIs must not overlap" rule is conservative: *unclear* means "not distinguishable with this much data", **not** "equal". Many CIs are wide (for example Interactive).
* **Many comparisons, no multiplicity correction.** Counts of "clear" results should not be over-read.
* **Indicator saturation.** The 50-tu starvation threshold flags most processes in the High-load class for all RR-family policies.
* **Exploratory extensions** A and B were added after viewing results (same rule); the headline verdicts above come from the pre-declared analysis.
* **Completed vs planned.** All 3,110 planned simulations completed; none failed or were skipped (`raw/manifest.json`).

Charts: [`charts/`](charts) (`fig1` … `fig5`, generated from the raw CSVs). Reproduction: [README.md](README.md).
