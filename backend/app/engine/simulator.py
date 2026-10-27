"""Deterministic discrete-time CPU scheduling simulator.

Time advances in integer ticks. At every time point t the simulator applies
these steps in a fixed order (documented in docs/algorithm-specifications.md):

  0. A context switch that finished at t hands the CPU to the incoming process.
  1. The running process is checked: if its CPU burst is finished it
     terminates (last burst) or blocks for I/O; if its time slice is used up
     it is marked for requeueing.
  2. I/O completions at t join the ready queue (input order for ties).
  3. Arrivals at t join the ready queue (input order for ties).
  4. A quantum-expired process rejoins the tail of the ready queue
     (i.e. AFTER processes that arrived or finished I/O at the same instant).
  5. Time-driven policy events (MLFQ priority boost).
  6. Scheduling decision: preemption check, then dispatch if the CPU is free.
  7. A state snapshot ("frame") is recorded if anything happened.
  8. One tick [t, t+1) executes: CPU run / context switch / idle, ready
     processes accumulate waiting time and blocked processes progress I/O.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from app.algorithms.base import Policy
from app.algorithms.registry import make_policy
from app.engine.models import (
    MAX_HORIZON,
    ProcessSpec,
    SimConfig,
    ValidationError,
    validate_config,
    validate_workload,
)


@dataclass
class PCB:
    """Process control block: the simulator's runtime view of a process."""

    spec: ProcessSpec
    idx: int
    state: str = "new"  # new | ready | dispatching | running | blocked | terminated
    burst_idx: int = 0
    remaining: int = 0  # remaining time of the current CPU or I/O burst
    ready_since: Optional[int] = None
    ready_wait: int = 0
    cpu_time: int = 0
    io_time: int = 0
    dispatch_time: int = 0
    first_start: Optional[int] = None
    completion: Optional[int] = None
    max_ready_stint: int = 0
    level: int = 0
    eff_priority: int = 0
    dispatches: int = 0
    preemptions: int = 0

    @property
    def pid(self) -> str:
        return self.spec.pid

    @property
    def cpu_left(self) -> int:
        """Total CPU time still required (current burst + future CPU bursts)."""
        if self.state == "terminated":
            return 0
        future = sum(self.spec.bursts[i] for i in range(self.burst_idx + 1, len(self.spec.bursts)) if i % 2 == 0)
        if self.burst_idx % 2 == 0:
            cur = self.remaining if self.state != "new" else self.spec.bursts[0]
        else:
            cur = 0
        return cur + future


class Simulator:
    def __init__(self, workload: list[ProcessSpec], config: SimConfig):
        self.specs = workload
        self.config = config
        self.policy: Policy = make_policy(config.algorithm, config.params)
        self.pcbs = [PCB(spec=s, idx=i) for i, s in enumerate(workload)]
        self.ready: list[PCB] = []
        self.time = 0

    # -- helpers -----------------------------------------------------------
    def _enter_ready(self, pcb: PCB, cause: str) -> None:
        pcb.state = "ready"
        pcb.ready_since = self.time
        pcb.eff_priority = pcb.spec.priority
        self.ready.append(pcb)
        self.policy.on_enter_ready(self, pcb, cause)

    def _leave_ready(self, pcb: PCB) -> None:
        self.ready.remove(pcb)
        pcb.max_ready_stint = max(pcb.max_ready_stint, self.time - pcb.ready_since)
        pcb.ready_since = None

    def _snapshot(self, running, switching, slice_q, slice_used, events, decision_id) -> dict[str, Any]:
        return {
            "time": self.time,
            "running": running.pid if running else None,
            "dispatching": switching.pid if switching else None,
            "ready": [p.pid for p in self.ready],
            "blocked": [{"pid": p.pid, "io_remaining": p.remaining} for p in self.pcbs if p.state == "blocked"],
            "terminated": [p.pid for p in self.pcbs if p.state == "terminated"],
            "quantum": slice_q,
            "slice_used": slice_used,
            "procs": [
                {
                    "pid": p.pid,
                    "state": p.state,
                    "burst_index": p.burst_idx,
                    "remaining": p.remaining if p.state not in ("new", "terminated") else (p.spec.bursts[0] if p.state == "new" else 0),
                    "cpu_left": p.cpu_left,
                    "level": p.level,
                    "eff_priority": p.eff_priority,
                    "ready_wait": p.ready_wait,
                }
                for p in self.pcbs
            ],
            "events": events,
            "decision_id": decision_id,
        }

    # -- main loop -----------------------------------------------------------
    def run(self) -> dict[str, Any]:
        cfg = self.config
        cost = cfg.context_switch_cost
        arrivals = sorted(self.pcbs, key=lambda p: (p.spec.arrival, p.idx))
        arr_i = 0
        n = len(self.pcbs)
        terminated = 0

        running: Optional[PCB] = None
        switching: Optional[PCB] = None
        switch_left = 0
        last_ran: Optional[PCB] = None
        slice_q: Optional[int] = None
        slice_used = 0
        slice_overhead = 0
        dispatch_id = -1
        end_reason: dict[int, str] = {}
        ticks: list[tuple[str, Optional[str], int]] = []
        frames: list[dict[str, Any]] = []
        decisions: list[dict[str, Any]] = []
        transitions: list[dict[str, Any]] = []
        aqs_adjustments: list[dict[str, Any]] = []
        context_switches = 0
        overhead_total = 0
        state_intervals: dict[str, list[list[Any]]] = {p.pid: [] for p in self.pcbs}

        def transition(p: PCB, to: str, cause: str, events: list) -> None:
            transitions.append({"time": self.time, "pid": p.pid, "from": p.state, "to": to, "cause": cause})
            events.append({"type": cause, "pid": p.pid, "from": p.state, "to": to})

        while True:
            t = self.time
            if t > MAX_HORIZON:
                raise ValidationError([f"Simulation exceeded the maximum horizon of {MAX_HORIZON} time units."])
            events: list[dict[str, Any]] = []
            decision_id: Optional[int] = None
            prev_pid: Optional[str] = None
            prev_outcome: Optional[str] = None
            expired: Optional[PCB] = None

            # 0. context switch completion
            if switching is not None and switch_left == 0:
                transition(switching, "running", "dispatch_complete", events)
                running, switching = switching, None
                running.state = "running"
                last_ran = running

            # 1. running process: burst finished or slice used up
            if running is not None:
                if running.remaining == 0:
                    p = running
                    p.burst_idx += 1
                    prev_pid = p.pid
                    if p.burst_idx >= len(p.spec.bursts):
                        transition(p, "terminated", "terminate", events)
                        p.state = "terminated"
                        p.completion = t
                        terminated += 1
                        reason = "terminate"
                    else:
                        transition(p, "blocked", "block", events)
                        p.state = "blocked"
                        p.remaining = p.spec.bursts[p.burst_idx]
                        reason = "block"
                    prev_outcome = reason
                    end_reason[dispatch_id] = reason
                    self.policy.on_slice_end(self, p, reason, slice_used, slice_overhead)
                    running = None
                elif slice_q is not None and slice_used >= slice_q:
                    expired = running
                    prev_pid, prev_outcome = running.pid, "quantum"
                    end_reason[dispatch_id] = "quantum"
                    self.policy.on_slice_end(self, running, "quantum", slice_used, slice_overhead)
                    running = None

            # 2. I/O completions
            for p in self.pcbs:
                if p.state == "blocked" and p.remaining == 0:
                    p.burst_idx += 1
                    p.remaining = p.spec.bursts[p.burst_idx]
                    transition(p, "ready", "io_complete", events)
                    self._enter_ready(p, "io")

            # 3. arrivals
            while arr_i < n and arrivals[arr_i].spec.arrival == t:
                p = arrivals[arr_i]
                arr_i += 1
                p.remaining = p.spec.bursts[0]
                transition(p, "ready", "arrival", events)
                self._enter_ready(p, "arrival")

            # 4. requeue the quantum-expired process at the tail
            if expired is not None:
                transition(expired, "ready", "quantum_expire", events)
                self._enter_ready(expired, "quantum")

            # 5. time-driven policy events
            for e in self.policy.on_time(self):
                events.append(e)
                if e["type"] == "boost" and running is not None:
                    slice_q, _ = self.policy.quantum(self, running)
                    slice_used = 0

            # 6. scheduling decision
            if switching is None:
                preemption = None
                if running is not None and self.policy.preemptive and self.ready:
                    preemption = self.policy.preempt_check(self, running)
                    if preemption is not None:
                        p = running
                        prev_pid, prev_outcome = p.pid, "preempt"
                        end_reason[dispatch_id] = "preempt"
                        p.preemptions += 1
                        self.policy.on_slice_end(self, p, "preempt", slice_used, slice_overhead)
                        running = None
                        transition(p, "ready", "preempt", events)
                        self._enter_ready(p, "preempt")

                if running is None and self.ready:
                    ready_before = [p.pid for p in self.ready]
                    blocked_snapshot = [
                        {"pid": p.pid, "io_remaining": p.remaining} for p in self.pcbs if p.state == "blocked"
                    ]
                    sel = self.policy.select(self)
                    pcb = sel.pcb
                    self._leave_ready(pcb)
                    q, aqs_info = self.policy.quantum(self, pcb)
                    needs_switch = last_ran is not None and last_ran is not pcb
                    outgoing = last_ran.pid if needs_switch else None
                    cs = cost if needs_switch else 0
                    if needs_switch:
                        context_switches += 1
                    dispatch_id += 1
                    pcb.dispatches += 1
                    slice_q, slice_used, slice_overhead = q, 0, cs
                    decision_id = len(decisions)
                    if cs > 0:
                        transition(pcb, "dispatching", "dispatch", events)
                        switching, switch_left = pcb, cs
                        pcb.state = "dispatching"
                    else:
                        transition(pcb, "running", "dispatch", events)
                        running = pcb
                        pcb.state = "running"
                        last_ran = pcb
                    if aqs_info is not None:
                        aqs_info = {**aqs_info, "time": t, "pid": pcb.pid, "decision_id": decision_id}
                        if aqs_info["adjusted"]:
                            aqs_adjustments.append(aqs_info)
                    decisions.append({
                        "id": decision_id,
                        "time": t,
                        "frame_index": len(frames),
                        "selected": pcb.pid,
                        "previous_process": prev_pid,
                        "previous_outcome": prev_outcome,
                        "preempted": preemption is not None,
                        "preemption_reason": preemption.reason if preemption else None,
                        "ready_queue": ready_before,
                        "candidates": sel.candidates,
                        "blocked": blocked_snapshot,
                        "selected_remaining": pcb.remaining,
                        "selected_cpu_left": pcb.cpu_left,
                        "rule": sel.rule,
                        "explanation": sel.explanation,
                        "quantum": q,
                        "context_switch": {"from": outgoing, "to": pcb.pid, "cost": cs} if needs_switch else None,
                        "aqs": aqs_info,
                        "algorithm": cfg.algorithm,
                        "params": cfg.params,
                    })

            # 7. frame
            if events or decision_id is not None:
                if cfg.record_frames:
                    frames.append(self._snapshot(running, switching, slice_q, slice_used, events, decision_id))
            if terminated == n:
                break

            # 8. execute one tick [t, t+1)
            if switching is not None:
                ticks.append(("switch", switching.pid, dispatch_id))
                switching.dispatch_time += 1
                switch_left -= 1
                overhead_total += 1
            elif running is not None:
                ticks.append(("run", running.pid, dispatch_id))
                if running.first_start is None:
                    running.first_start = t
                running.remaining -= 1
                running.cpu_time += 1
                slice_used += 1
            else:
                ticks.append(("idle", None, -1))
            for p in self.pcbs:
                st = p.state
                if st == "ready":
                    p.ready_wait += 1
                elif st == "blocked":
                    p.remaining -= 1
                    p.io_time += 1
                iv = state_intervals[p.pid]
                if iv and iv[-1][0] == st and iv[-1][2] == t:
                    iv[-1][2] = t + 1
                else:
                    iv.append([st, t, t + 1])
            self.time += 1

        segments = _build_segments(ticks, end_reason)
        return {
            "pcbs": self.pcbs,
            "end_time": self.time,
            "segments": segments,
            "frames": frames,
            "decisions": decisions,
            "transitions": transitions,
            "aqs_adjustments": aqs_adjustments,
            "context_switches": context_switches,
            "overhead_total": overhead_total,
            "state_intervals": {
                pid: [{"state": s, "start": a, "end": b} for s, a, b in iv] for pid, iv in state_intervals.items()
            },
        }


def _build_segments(ticks: list[tuple[str, Optional[str], int]], end_reason: dict[int, str]) -> list[dict[str, Any]]:
    segs: list[dict[str, Any]] = []
    for t, (kind, pid, did) in enumerate(ticks):
        if segs and segs[-1]["kind"] == kind and segs[-1]["pid"] == pid and segs[-1]["dispatch_id"] == did and segs[-1]["end"] == t:
            segs[-1]["end"] = t + 1
        else:
            segs.append({"kind": kind, "pid": pid, "dispatch_id": did, "start": t, "end": t + 1})
    for s in segs:
        s["end_reason"] = end_reason.get(s["dispatch_id"]) if s["kind"] == "run" else None
    return segs


def simulate(raw_workload: list[dict[str, Any]], config: SimConfig) -> dict[str, Any]:
    """Validate inputs, run the simulation and return a serializable result."""
    from app.metrics.metrics import compute_metrics

    specs = validate_workload(raw_workload)
    cfg = validate_config(config)
    raw = Simulator(specs, cfg).run()
    metrics = compute_metrics(raw, specs, cfg)
    return {
        "algorithm": cfg.algorithm,
        "params": cfg.params,
        "context_switch_cost": cfg.context_switch_cost,
        "starvation_threshold": cfg.starvation_threshold,
        "workload": [s.to_dict() for s in specs],
        "end_time": raw["end_time"],
        "segments": raw["segments"],
        "frames": raw["frames"],
        "decisions": raw["decisions"],
        "transitions": raw["transitions"],
        "aqs_adjustments": raw["aqs_adjustments"],
        "state_intervals": raw["state_intervals"],
        "metrics": metrics,
    }
