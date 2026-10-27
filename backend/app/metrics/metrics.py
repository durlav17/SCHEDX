"""Metric definitions (see docs/algorithm-specifications.md, section Metrics).

Per process
  turnaround      = completion - arrival
  response        = first CPU start - arrival   (includes dispatch overhead)
  ready_wait      = ticks spent in the READY state
  dispatch_wait   = ticks spent while the CPU was context-switching *to* it
  Invariant:        turnaround = ready_wait + dispatch_wait + cpu_time + io_time

System, observed over the interval [first arrival, last completion]
  throughput      = completed processes / interval length
  cpu_utilization = ticks executing process code / interval length
                    (context-switch overhead is NOT counted as useful work)
"""
from __future__ import annotations

import math
from typing import Any


def percentile(values: list[float], pct: float) -> float:
    """Nearest-rank percentile (deterministic, no interpolation)."""
    if not values:
        return 0.0
    s = sorted(values)
    rank = max(1, math.ceil(pct / 100 * len(s)))
    return float(s[rank - 1])


def _summary(values: list[float]) -> dict[str, float]:
    if not values:
        return {"mean": 0.0, "median": 0.0, "p95": 0.0, "max": 0.0, "min": 0.0}
    return {
        "mean": round(sum(values) / len(values), 4),
        "median": percentile(values, 50),
        "p95": percentile(values, 95),
        "max": float(max(values)),
        "min": float(min(values)),
    }


def jain_index(values: list[float]) -> float:
    """Jain's fairness index: 1 = perfectly equal, 1/n = maximally unequal."""
    if not values:
        return 1.0
    sq = sum(v * v for v in values)
    return round((sum(values) ** 2) / (len(values) * sq), 4) if sq else 1.0


def compute_metrics(raw: dict[str, Any], specs, cfg) -> dict[str, Any]:
    per: list[dict[str, Any]] = []
    for p in raw["pcbs"]:
        turnaround = p.completion - p.spec.arrival
        service = p.cpu_time + p.io_time
        per.append({
            "pid": p.pid,
            "arrival": p.spec.arrival,
            "priority": p.spec.priority,
            "cpu_bursts": len(p.spec.cpu_bursts),
            "first_start": p.first_start,
            "completion": p.completion,
            "turnaround": turnaround,
            "response": p.first_start - p.spec.arrival,
            "ready_wait": p.ready_wait,
            "dispatch_wait": p.dispatch_time,
            "cpu_time": p.cpu_time,
            "io_time": p.io_time,
            "max_ready_wait": p.max_ready_stint,
            "slowdown": round(turnaround / service, 4) if service else 0.0,
            "dispatches": p.dispatches,
            "preemptions": p.preemptions,
            "starved": p.max_ready_stint >= cfg.starvation_threshold,
            "accounting_consistent": turnaround == p.ready_wait + p.dispatch_time + p.cpu_time + p.io_time,
        })

    start = min(s.arrival for s in specs)
    end = raw["end_time"]
    interval = end - start
    busy = sum(p["cpu_time"] for p in per)
    overhead = raw["overhead_total"]
    idle = sum(s["end"] - s["start"] for s in raw["segments"] if s["kind"] == "idle" and s["start"] >= start)
    n = len(per)

    system = {
        "process_count": n,
        "observation_start": start,
        "observation_end": end,
        "makespan": interval,
        "throughput": round(n / interval, 6) if interval else 0.0,
        "cpu_utilization": round(busy / interval, 6) if interval else 0.0,
        "overhead_fraction": round(overhead / interval, 6) if interval else 0.0,
        "idle_time": idle,
        "busy_time": busy,
        "context_switches": raw["context_switches"],
        "context_switch_overhead": overhead,
        "response": _summary([p["response"] for p in per]),
        "ready_wait": _summary([p["ready_wait"] for p in per]),
        "turnaround": _summary([p["turnaround"] for p in per]),
        "max_ready_wait": max(p["max_ready_wait"] for p in per),
        "starved_count": sum(1 for p in per if p["starved"]),
        "starvation_threshold": cfg.starvation_threshold,
        "fairness_jain_slowdown": jain_index([p["slowdown"] for p in per]),
        "dispatches": len(raw["decisions"]),
        "preemptions": sum(p["preemptions"] for p in per),
        "aqs_adjustments": len(raw["aqs_adjustments"]),
        "accounting_consistent": all(p["accounting_consistent"] for p in per),
    }
    return {"system": system, "processes": per}
