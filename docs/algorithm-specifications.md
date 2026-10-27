# Algorithm specifications

This document defines exactly what the SchedX engine (`backend/app/engine`, `backend/app/algorithms`) does. Every number shown in the UI follows from these rules.

## 1. Model

- **Time** is a non-negative integer. Units are abstract "time units" (tu).
- **Process** = `pid`, `arrival`, `bursts`, `priority`.
  - `bursts` alternates CPU and I/O durations and **starts and ends with a CPU burst**: `[cpu, io, cpu, …, cpu]` (odd length, all values ≥ 1).
  - `priority`: integer 0–99. **Smaller number = higher priority** (0 is highest). This convention is used everywhere.
- **One CPU.** I/O devices are unlimited and parallel: every blocked process progresses its own I/O burst each tick.
- **States:** `new → ready → (dispatching →) running → blocked | ready | terminated`.

### Validation (no silent correction)
Rejected with a message per problem: empty workload; more than 100 processes; missing or duplicate PID (max 16 characters); negative or non-integer arrival (max 10,000); even burst count; zero, negative or non-integer burst (max 1,000); priority outside 0–99; unknown algorithm or parameter; out-of-range parameter.

## 2. Event ordering at each time point t

1. **Switch completion:** a context switch whose cost is used up hands the CPU to the incoming process (`dispatching → running`).
2. **Running-process check:**
   - remaining burst = 0: if it was the last burst, the process **terminates** (completion = t). Otherwise it **blocks** and its I/O burst starts at t.
   - else if the time slice is used up: it is marked *quantum-expired*.
3. **I/O completions** at t → ready (ties: workload input order).
4. **Arrivals** at t → ready (ties: workload input order).
5. **Requeue:** the quantum-expired process joins the **tail** of the ready queue, *after* processes that arrived or finished I/O at the same instant.
6. **Time-driven policy events:** MLFQ periodic boost.
7. **Decision:** if the policy is preemptive and a process is running, run the preemption check. If the CPU is then free and the ready queue is non-empty, **dispatch**.
8. A **frame** (full state snapshot) is recorded if anything happened. Then one **tick [t, t+1)** executes: the running process consumes 1 tu of CPU, or a switch consumes 1 tu of overhead, or the CPU idles. Ready processes accrue waiting time and blocked processes progress their I/O.

The simulation ends when every process has terminated. A safety horizon of 50,000 tu rejects runaway inputs.

### Ready-queue order and tie-breaking
The ready queue is a FIFO list ordered by **the time each process entered Ready** (and, at the same instant, by steps 3 → 4 → 5 above, with input order within each step). Every policy breaks equal keys by this order.

## 3. Context switches

- A **context switch is counted** whenever the dispatched process differs from **the last process that executed on the CPU**. The very first dispatch is not a switch. Re-dispatching the same process (for example RR with a single ready process) is not a switch. Idle gaps do not reset "last executed".
- With cost `C > 0`, the CPU spends `C` ticks in the **switch** state before the process runs. The process is in **Dispatching** and accumulates `dispatch_wait`. A switch is atomic: no scheduling decisions happen during it, though arrivals and I/O completions are still queued.
- Switch overhead is **not** useful work: it is excluded from CPU utilisation and reported separately.
- With `C = 0`, switches are still counted.
- This is a model parameter, not a measured hardware cost.

## 4. Policies

| Policy | Preemptive | Selection key (min wins) | Slice |
|---|---|---|---|
| FCFS | no | ready-queue position | until burst ends |
| SJF | no | current CPU burst length (exact), then position | until burst ends |
| SRTF | yes | remaining current CPU burst, then position | until burst ends or preempted |
| RR | at quantum expiry | ready-queue position | `quantum` |
| Priority | configurable | effective priority, then position | until burst ends (or preempted) |
| MLFQ | yes | level, then position | `quanta[level]` |
| AQS | at quantum expiry | ready-queue position | adaptive `q` (see `aqs-policy.md`) |

### FCFS
Dispatches the head of the ready queue and runs it to the end of its current CPU burst. After the burst it blocks (if I/O follows) or terminates.

### SJF (non-preemptive)
The scheduling estimate is **the exact length of the process's current CPU burst**. This is an idealisation: real systems must predict it.

### SRTF
At every time point where a process is running and the ready queue is non-empty, the shortest remaining current burst in the ready queue is compared with the running process's remaining burst. Preemption happens **only if it is strictly shorter**. Exact ties never preempt. The preempted process rejoins the tail of the ready queue.

### Round Robin
Parameter `quantum` (1–500). A process that uses its whole quantum rejoins the tail (step 5). A process whose burst ends inside the slice blocks or terminates normally.

### Priority
Parameters `preemptive` (bool) and `aging_interval` (0 = off).
- Effective priority while ready: `max(0, base − floor((t − ready_since) / aging_interval))`. It resets to base whenever the process re-enters Ready.
- A dispatched process keeps the effective priority it had at dispatch while it runs.
- Preemptive mode: a ready process preempts only if its effective priority is **strictly** smaller (higher priority).

### Multilevel Feedback Queue
Parameters `quanta` (3–5 levels, e.g. `[4, 8, 16]`) and `boost_interval` (0 = off).
1. Arrivals enter level 0 (highest).
2. The CPU serves the highest non-empty level, FIFO within the level.
3. Level *i* grants `quanta[i]`.
4. Using a full slice demotes one level (never below the last).
5. Blocking for I/O before the slice ends keeps the level (a known gaming weakness, kept deliberately).
6. A higher-level ready process preempts a lower-level running one. The preempted process keeps its level.
7. At every positive multiple of `boost_interval`, all live processes move to level 0. A running process keeps the CPU, but its slice restarts with the level-0 length.

### AQS
See [aqs-policy.md](aqs-policy.md).

## 5. Explanations
Each policy writes its explanation **at decision time from the values it compared** (candidate list with keys, ties, ageing, levels). Nothing is generated afterwards. The decision record also stores the previous process's outcome (terminate, block, quantum or preempt), the preemption reason, the context-switch details and the AQS signals.

## 6. Metrics
Per process:
- `turnaround = completion − arrival`
- `response = first CPU start − arrival` (includes any dispatch overhead before the first run)
- `ready_wait` = ticks in Ready. `dispatch_wait` = ticks being switched in. `cpu_time`, `io_time`.
- **Invariant (checked on every run):** `turnaround = ready_wait + dispatch_wait + cpu_time + io_time`.
- `max_ready_wait` = longest single uninterrupted ready stint.
- `slowdown = turnaround / (cpu_time + io_time)`.
- `starved = max_ready_wait ≥ starvation_threshold` (default 50 tu). This is a simulation indicator, not a proof of starvation.

System, observed over **[first arrival, last completion]** (length = makespan):
- `throughput = n / makespan`
- `cpu_utilization = Σ cpu_time / makespan` (overhead excluded). `overhead_fraction = overhead / makespan`.
- Means, medians, nearest-rank **p95**, and maxima of response, ready wait and turnaround.
- `fairness_jain_slowdown` = Jain's index over per-process slowdown (1 = equal slowdown for everyone).
- Zero-length intervals yield 0, never a division error.
