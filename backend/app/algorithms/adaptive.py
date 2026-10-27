"""Multilevel Feedback Queue and the experimental Adaptive Quantum Scheduler."""
from __future__ import annotations

from collections import deque

from app.algorithms.base import Policy, Preemption, Selection


class MLFQ(Policy):
    """Rules (see docs/algorithm-specifications.md):

    1. New arrivals enter level 0 (highest).
    2. The CPU always serves the highest non-empty level; FIFO inside a level.
    3. Level i uses time slice quanta[i].
    4. Using a full slice demotes one level (never below the last level).
    5. Blocking for I/O before the slice ends keeps the level.
    6. A process preempted by a higher-level arrival keeps its level and goes
       to the tail of its level's queue.
    7. Every ``boost_interval`` tu (if > 0) all live processes return to level 0.
    """

    key = "mlfq"
    name = "Multilevel Feedback Queue"
    preemptive = True

    def on_enter_ready(self, sim, pcb, cause):
        if cause == "arrival":
            pcb.level = 0

    def _best(self, sim):
        return min(enumerate(sim.ready), key=lambda ip: (ip[1].level, ip[0]))[1]

    def select(self, sim):
        best = self._best(sim)
        q = self.params["quanta"][best.level]
        same = [p for p in sim.ready if p.level == best.level and p is not best]
        lower = sorted({p.level for p in sim.ready if p.level > best.level})
        expl = (
            f"MLFQ dispatched {best.pid} from level {best.level}, the highest-priority non-empty queue"
            + (f" (levels {', '.join(map(str, lower))} also have waiting processes but rank lower)" if lower else "")
            + (f"; it was at the head of level {best.level} ahead of {', '.join(p.pid for p in same)}" if same else "")
            + f". Level {best.level} grants a slice of {q} tu."
        )
        cands = [{"pid": p.pid, "level": p.level, "position": i} for i, p in enumerate(sim.ready)]
        return Selection(best, "highest_level_fifo", expl, cands)

    def quantum(self, sim, pcb):
        return self.params["quanta"][pcb.level], None

    def preempt_check(self, sim, running):
        best = self._best(sim)
        if best.level < running.level:
            return Preemption(
                best,
                f"{best.pid} is ready at level {best.level}, higher than running {running.pid} at level "
                f"{running.level}, so MLFQ preempts.",
            )
        return None

    def on_slice_end(self, sim, pcb, reason, ran, overhead):
        if reason == "quantum":
            pcb.level = min(pcb.level + 1, len(self.params["quanta"]) - 1)

    def on_time(self, sim):
        s = self.params["boost_interval"]
        if s and sim.time > 0 and sim.time % s == 0:
            boosted = [p for p in sim.pcbs if p.state != "terminated" and p.state != "new" and p.level != 0]
            for p in sim.pcbs:
                if p.state not in ("terminated", "new"):
                    p.level = 0
            if boosted:
                return [{
                    "type": "boost",
                    "pids": [p.pid for p in boosted],
                    "detail": f"Periodic priority boost at t={sim.time}: {', '.join(p.pid for p in boosted)} moved back to level 0.",
                }]
        return []


class AdaptiveQuantum(Policy):
    """AQS: Round Robin whose quantum adapts at each dispatch.

    Signals, evaluated at every dispatch (after the selected process has left
    the ready queue):
      L   = number of processes still waiting in the ready queue
      rho = overhead / (overhead + executed CPU) over the last ``window`` slices

    Rule (first matching line wins), then clamp to [min_quantum, max_quantum]:
      rho > overhead_limit  -> q + step   (overhead pressure: fewer switches)
      L  >= high_load       -> q - step   (latency pressure: rotate faster)
      L  <= low_load        -> q + step   (light load: longer slices are cheap)
      otherwise             -> q          (hold)
    """

    key = "aqs"
    name = "Adaptive Quantum Scheduling (experimental)"

    def __init__(self, params):
        super().__init__(params)
        self.q = params["base_quantum"]
        self.window: deque[tuple[int, int]] = deque(maxlen=params["window"])

    def select(self, sim):
        head = sim.ready[0]
        expl = (
            f"AQS dispatched {head.pid}, the next process in ready-queue order (Round Robin order). "
            f"Its slice length is set by the adaptive rule described in the AQS adjustment below."
        )
        cands = [{"pid": p.pid, "position": i, "remaining": p.remaining} for i, p in enumerate(sim.ready)]
        return Selection(head, "fifo_head", expl, cands)

    def overhead_ratio(self) -> float:
        ov = sum(o for o, _ in self.window)
        tot = sum(o + r for o, r in self.window)
        return ov / tot if tot else 0.0

    def quantum(self, sim, pcb):
        p = self.params
        L = len(sim.ready)
        rho = self.overhead_ratio()
        prev = self.q
        if rho > p["overhead_limit"]:
            signal, target = "overhead_pressure", prev + p["step"]
            why = f"recent overhead ratio {rho:.2f} exceeds the limit {p['overhead_limit']}, so the quantum grows to reduce switching"
        elif L >= p["high_load"]:
            signal, target = "latency_pressure", prev - p["step"]
            why = f"{L} processes are waiting (>= high_load {p['high_load']}), so the quantum shrinks to rotate the CPU faster"
        elif L <= p["low_load"]:
            signal, target = "light_load", prev + p["step"]
            why = f"only {L} process(es) waiting (<= low_load {p['low_load']}), so a longer slice avoids needless switches"
        else:
            signal, target = "hold", prev
            why = f"{L} waiting and overhead ratio {rho:.2f} are within bounds, so the quantum is held"
        new = max(p["min_quantum"], min(p["max_quantum"], target))
        clamped = new != target
        self.q = new
        info = {
            "previous_quantum": prev,
            "new_quantum": new,
            "adjusted": new != prev,
            "signal": signal,
            "ready_length": L,
            "overhead_ratio": round(rho, 4),
            "clamped": clamped,
            "explanation": f"AQS: {why}; quantum {prev} -> {new} tu"
            + (f" (clamped to the [{p['min_quantum']}, {p['max_quantum']}] bound)" if clamped else "")
            + ".",
        }
        return new, info

    def on_slice_end(self, sim, pcb, reason, ran, overhead):
        self.window.append((overhead, ran))

