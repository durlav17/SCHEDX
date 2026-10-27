"""Seeded synthetic workload generator.

The same configuration (including ``seed``) always yields the same workload:
all randomness comes from a private ``random.Random(seed)`` instance and the
draw order is fixed.
"""
from __future__ import annotations

import random
from typing import Any

from app.engine.models import MAX_BURST_LENGTH, MAX_PROCESSES, ValidationError

GENERATOR_DEFAULTS: dict[str, Any] = {
    "count": 8,
    "seed": 42,
    "arrival_pattern": "uniform",  # uniform | poisson | simultaneous
    "arrival_span": 20,
    "mean_interarrival": 3.0,
    "cpu_distribution": "uniform",  # uniform | exponential | bimodal
    "cpu_min": 2,
    "cpu_max": 12,
    "cpu_mean": 6.0,
    "short_fraction": 0.7,
    "io_fraction": 0.0,
    "io_cycles_max": 2,
    "io_min": 2,
    "io_max": 8,
    "priority_min": 0,
    "priority_max": 5,
}


def validate_generator(cfg: dict[str, Any]) -> dict[str, Any]:
    c = {**GENERATOR_DEFAULTS, **(cfg or {})}
    errors: list[str] = []
    unknown = set(c) - set(GENERATOR_DEFAULTS)
    if unknown:
        errors.append(f"Unknown generator field(s): {', '.join(sorted(unknown))}.")

    def int_in(name, lo, hi):
        v = c.get(name)
        if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
            errors.append(f"{name} must be an integer between {lo} and {hi}.")

    def num_in(name, lo, hi):
        v = c.get(name)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not lo <= v <= hi:
            errors.append(f"{name} must be a number between {lo} and {hi}.")

    int_in("count", 1, MAX_PROCESSES)
    int_in("seed", 0, 2**31 - 1)
    if c["arrival_pattern"] not in ("uniform", "poisson", "simultaneous"):
        errors.append("arrival_pattern must be uniform, poisson or simultaneous.")
    int_in("arrival_span", 0, 2000)
    num_in("mean_interarrival", 0.1, 200)
    if c["cpu_distribution"] not in ("uniform", "exponential", "bimodal"):
        errors.append("cpu_distribution must be uniform, exponential or bimodal.")
    int_in("cpu_min", 1, MAX_BURST_LENGTH)
    int_in("cpu_max", 1, 200)
    num_in("cpu_mean", 1, 200)
    num_in("short_fraction", 0, 1)
    num_in("io_fraction", 0, 1)
    int_in("io_cycles_max", 1, 10)
    int_in("io_min", 1, 200)
    int_in("io_max", 1, 200)
    int_in("priority_min", 0, 99)
    int_in("priority_max", 0, 99)
    if not errors:
        if c["cpu_min"] > c["cpu_max"]:
            errors.append("cpu_min must not exceed cpu_max.")
        if c["io_min"] > c["io_max"]:
            errors.append("io_min must not exceed io_max.")
        if c["priority_min"] > c["priority_max"]:
            errors.append("priority_min must not exceed priority_max.")
    if errors:
        raise ValidationError(errors)
    return c


def generate_workload(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    c = validate_generator(cfg)
    rng = random.Random(c["seed"])
    lo, hi = c["cpu_min"], c["cpu_max"]

    def cpu_burst() -> int:
        d = c["cpu_distribution"]
        if d == "uniform":
            return rng.randint(lo, hi)
        if d == "exponential":
            return max(lo, min(hi, round(rng.expovariate(1.0 / c["cpu_mean"]))))
        span = max(0, (hi - lo) // 4)
        if rng.random() < c["short_fraction"]:
            return rng.randint(lo, lo + span)
        return rng.randint(hi - span, hi)

    arrivals: list[int] = []
    t = 0.0
    for i in range(c["count"]):
        p = c["arrival_pattern"]
        if p == "simultaneous":
            arrivals.append(0)
        elif p == "uniform":
            arrivals.append(rng.randint(0, c["arrival_span"]))
        else:
            if i > 0:
                t += rng.expovariate(1.0 / c["mean_interarrival"])
            arrivals.append(min(10_000, int(t)))

    procs = []
    for i in range(c["count"]):
        bursts = [cpu_burst()]
        if rng.random() < c["io_fraction"]:
            for _ in range(rng.randint(1, c["io_cycles_max"])):
                bursts.append(rng.randint(c["io_min"], c["io_max"]))
                bursts.append(cpu_burst())
        procs.append({
            "pid": f"P{i + 1}",
            "arrival": arrivals[i],
            "bursts": bursts,
            "priority": rng.randint(c["priority_min"], c["priority_max"]),
        })
    return procs
