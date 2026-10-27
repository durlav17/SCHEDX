"""FCFS, SJF, SRTF, Round Robin and Priority scheduling.

Tie-breaking (all policies): when keys are equal, the process that entered
the ready queue earliest wins (ready-queue order). Ready-queue order for
simultaneous entries is defined by the simulator (see docs).
"""
from __future__ import annotations

from typing import Optional

from app.algorithms.base import Policy, Preemption, Selection


class FCFS(Policy):
    key = "fcfs"
    name = "First Come, First Served"

    def select(self, sim):
        head = sim.ready[0]
        others = sim.ready[1:]
        expl = (
            f"FCFS dispatched {head.pid} because it is at the head of the ready queue: it entered the "
            f"ready state at t={head.ready_since}, earlier than (or tied with and queued before) "
            f"every other waiting process"
            + (f" ({', '.join(f'{p.pid}@t={p.ready_since}' for p in others)})." if others else ". No other process was waiting.")
        )
        cands = [{"pid": p.pid, "ready_since": p.ready_since, "position": i} for i, p in enumerate(sim.ready)]
        return Selection(head, "fifo_head", expl, cands)


class SJF(Policy):
    key = "sjf"
    name = "Shortest Job First (non-preemptive)"

    def select(self, sim):
        # The scheduling estimate is the exact length of the process's CURRENT CPU burst.
        best = min(enumerate(sim.ready), key=lambda ip: (ip[1].remaining, ip[0]))[1]
        ties = [p for p in sim.ready if p.remaining == best.remaining and p is not best]
        expl = (
            f"SJF dispatched {best.pid} because its current CPU burst ({best.remaining} tu) is the shortest "
            f"among ready processes"
            + (f"; it tied with {', '.join(p.pid for p in ties)} and was earlier in the ready queue" if ties else "")
            + ". It will run without preemption until the burst ends."
        )
        cands = [{"pid": p.pid, "burst": p.remaining, "position": i} for i, p in enumerate(sim.ready)]
        return Selection(best, "shortest_burst", expl, cands)


class SRTF(Policy):
    key = "srtf"
    name = "Shortest Remaining Time First"
    preemptive = True

    def select(self, sim):
        best = min(enumerate(sim.ready), key=lambda ip: (ip[1].remaining, ip[0]))[1]
        ties = [p for p in sim.ready if p.remaining == best.remaining and p is not best]
        expl = (
            f"SRTF dispatched {best.pid} because it has the least remaining time in its current CPU burst "
            f"({best.remaining} tu) among ready processes"
            + (f"; it tied with {', '.join(p.pid for p in ties)} and was earlier in the ready queue" if ties else "")
            + "."
        )
        cands = [{"pid": p.pid, "remaining": p.remaining, "position": i} for i, p in enumerate(sim.ready)]
        return Selection(best, "shortest_remaining", expl, cands)

    def preempt_check(self, sim, running) -> Optional[Preemption]:
        best = min(enumerate(sim.ready), key=lambda ip: (ip[1].remaining, ip[0]))[1]
        # Strictly shorter only: exact ties never preempt.
        if best.remaining < running.remaining:
            return Preemption(
                best,
                f"{best.pid} has {best.remaining} tu remaining, strictly less than {running.pid}'s "
                f"{running.remaining} tu, so SRTF preempts {running.pid}.",
            )
        return None


class RoundRobin(Policy):
    key = "rr"
    name = "Round Robin"

    def select(self, sim):
        head = sim.ready[0]
        q = self.params["quantum"]
        expl = (
            f"Round Robin dispatched {head.pid}, the next process in ready-queue order, "
            f"for a time slice of at most {q} tu."
        )
        cands = [{"pid": p.pid, "position": i, "remaining": p.remaining} for i, p in enumerate(sim.ready)]
        return Selection(head, "fifo_head", expl, cands)

    def quantum(self, sim, pcb):
        return self.params["quantum"], None


class PriorityScheduling(Policy):
    """Smaller number = higher priority. Optional ageing:
    effective = max(0, base - floor(time_waiting_in_ready / aging_interval))."""

    key = "priority"
    name = "Priority Scheduling"

    def __init__(self, params):
        super().__init__(params)
        self.preemptive = bool(params["preemptive"])

    def eff(self, sim, pcb) -> int:
        ai = self.params["aging_interval"]
        if ai and pcb.ready_since is not None:
            return max(0, pcb.spec.priority - (sim.time - pcb.ready_since) // ai)
        return pcb.spec.priority

    def _best(self, sim):
        return min(enumerate(sim.ready), key=lambda ip: (self.eff(sim, ip[1]), ip[0]))[1]

    def select(self, sim):
        best = self._best(sim)
        e = self.eff(sim, best)
        best.eff_priority = e
        ties = [p for p in sim.ready if self.eff(sim, p) == e and p is not best]
        aged = e != best.spec.priority
        expl = (
            f"Priority scheduling dispatched {best.pid} because it has the highest priority among ready "
            f"processes (value {e}; smaller numbers mean higher priority)"
            + (f", improved by ageing from its base priority {best.spec.priority}" if aged else "")
            + (f"; it tied with {', '.join(p.pid for p in ties)} and was earlier in the ready queue" if ties else "")
            + ("." if self.preemptive else ". Mode is non-preemptive, so it keeps the CPU until its burst ends.")
        )
        cands = [
            {"pid": p.pid, "priority": p.spec.priority, "effective_priority": self.eff(sim, p), "position": i}
            for i, p in enumerate(sim.ready)
        ]
        return Selection(best, "highest_priority", expl, cands)

    def preempt_check(self, sim, running):
        if not self.preemptive:
            return None
        best = self._best(sim)
        e = self.eff(sim, best)
        if e < running.eff_priority:
            return Preemption(
                best,
                f"{best.pid} (priority {e}) has strictly higher priority than running {running.pid} "
                f"(priority {running.eff_priority}), so it preempts.",
            )
        return None
