# Adaptive Quantum Scheduling (AQS): formal policy

AQS is an **experimental** Round Robin variant implemented in `backend/app/algorithms/adaptive.py` (`AdaptiveQuantum`). It is not claimed to be novel or superior: dynamic-quantum Round Robin variants are a known idea. The contribution of SchedX is an explicit, deterministic, bounded rule, a trace of every adjustment, and a systematic evaluation of the rule, including where it fails.

## Parameters (defaults)

| Name | Meaning | Default | Valid range |
|---|---|---|---|
| `base_quantum` (q₀) | initial quantum | 4 | 1–500 |
| `min_quantum` | lower bound | 2 | 1–500, ≤ q₀ |
| `max_quantum` | upper bound | 12 | 1–500, ≥ q₀ |
| `step` (δ) | maximum change per dispatch | 1 | 1–50 |
| `high_load` | L at or above which q shrinks | 4 | 1–100 |
| `low_load` | L at or below which q grows | 1 | 0–100, < high_load |
| `overhead_limit` | ρ above which q grows | 0.2 | (0, 1) |
| `window` (W) | slices used for ρ | 5 | 1–100 |

## Selection
Identical to Round Robin: the head of the ready queue (FIFO by ready-entry time). Only the **slice length** differs.

## Signals (computed at each dispatch, after the selected process leaves the ready queue)
- **L**: the number of processes still waiting in the ready queue. A proxy for **response latency pressure**: each waiting process waits roughly L slices for its turn.
- **ρ**: the overhead ratio over the last W completed slices, `ρ = Σ overhead_i / Σ (overhead_i + run_i)`, where `overhead_i` is the switch cost charged for slice *i* and `run_i` the CPU time it executed. It is 0 when no slice has completed yet.

## Rule
With current quantum `q`, the first matching line wins:

```
if ρ > overhead_limit:   q' = q + δ     # overhead pressure: switch less often
elif L ≥ high_load:      q' = q − δ     # latency pressure: rotate faster
elif L ≤ low_load:       q' = q + δ     # light load: long slices are cheap
else:                    q' = q         # hold
q' = clamp(q', min_quantum, max_quantum)
```

The new `q'` is the slice granted to the dispatched process and becomes the current `q`.

### Rationale
- **Response latency:** under heavy load, a shorter quantum brings the next turn of every waiting process forward.
- **Context-switch overhead:** shorter slices mean more switches. The overhead rule has **priority** over the latency rule, so AQS cannot shrink the quantum into thrashing once switching dominates. With a zero switch cost, ρ = 0 and the rule reduces to load-based adaptation.
- **Light load:** with nobody waiting, a long slice costs nothing in latency and avoids pointless re-dispatches.

### Stability
- At most δ change per dispatch (bounded step).
- Hard bounds `[min_quantum, max_quantum]`.
- ρ is averaged over a window, which damps single-slice noise.

## Determinism
No randomness, no wall-clock input. The state is only `(q, window)`, updated in a fixed order. Identical workload and configuration always produce identical schedules and traces (`tests/test_engine_properties.py::test_simulation_is_deterministic[aqs]`).

## Trace
Every dispatch decision contains an `aqs` object: `previous_quantum`, `new_quantum`, `adjusted`, `signal` (`overhead_pressure | latency_pressure | light_load | hold`), `ready_length`, `overhead_ratio`, `clamped` and a textual explanation. Adjustments where q changed are also listed in `aqs_adjustments`. Decision Replay shows both, plus a quantum-over-time chart.

## Tests
`tests/test_algorithms.py`: shrink under load, growth under light load up to the bound, overhead pressure with a bounded step, and a schedule that differs from plain RR.

## Known limitations
- L counts processes and ignores their burst lengths. A long queue of very short jobs is treated like a long queue of long jobs.
- The quantum is global, not per process. One adjustment affects everyone.
- Thresholds are static and workload-dependent. Poor thresholds can make AQS worse than a well-tuned fixed RR.
- Shrinking the quantum can raise turnaround and switch counts. This is a trade-off the experiments must report.
- The overhead signal relies on the simulated switch cost, which is a model parameter.

## Evaluation outcome
Evaluated at the defaults above in `research-results/` (3,110 simulations; see [summary.md](../research-results/summary.md)). AQS behaved as a trade-off rather than an improvement: no clear response-time gain over Round Robin q=4 in the Interactive and Mixed classes and clearly worse than MLFQ in Mixed; clearly fewer context switches than RR q=2 at high switch cost, with lower turnaround than RR q=4 at costs of 4 or more in three classes, but higher response time than fixed RR once the switch cost is 2 or more; and a longer worst-case ready wait than RR q=4 in three classes. Parameter tuning was deliberately not explored.
