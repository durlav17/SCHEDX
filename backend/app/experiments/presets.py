"""Example workloads.

Two hand-written classroom workloads plus five generated workload classes.
Every preset is an input definition only: no results are stored here; all
metrics are computed by the engine when a simulation runs.
"""
from __future__ import annotations

from typing import Any

from app.experiments.generator import generate_workload

HANDCRAFTED: dict[str, dict[str, Any]] = {
    "demo": {
        "name": "Classroom demo",
        "description": "Five CPU-only processes with staggered arrivals and very different burst lengths. "
        "FCFS, SJF, SRTF and Round Robin produce visibly different schedules.",
        "processes": [
            {"pid": "P1", "arrival": 0, "bursts": [7], "priority": 3},
            {"pid": "P2", "arrival": 1, "bursts": [3], "priority": 1},
            {"pid": "P3", "arrival": 2, "bursts": [9], "priority": 4},
            {"pid": "P4", "arrival": 4, "bursts": [2], "priority": 0},
            {"pid": "P5", "arrival": 6, "bursts": [5], "priority": 2},
        ],
    },
    "io_demo": {
        "name": "I/O demo",
        "description": "Four processes, three of which alternate CPU and I/O bursts, showing the "
        "Ready -> Running -> Blocked -> Ready cycle.",
        "processes": [
            {"pid": "P1", "arrival": 0, "bursts": [4, 3, 3], "priority": 2},
            {"pid": "P2", "arrival": 1, "bursts": [6], "priority": 1},
            {"pid": "P3", "arrival": 2, "bursts": [2, 5, 2, 5, 1], "priority": 0},
            {"pid": "P4", "arrival": 3, "bursts": [5, 2, 4], "priority": 3},
        ],
    },
}

GENERATED: dict[str, dict[str, Any]] = {
    "cpu_bound": {
        "name": "CPU-bound",
        "description": "Long CPU bursts, no I/O, moderate arrival spread.",
        "generator": {"count": 8, "seed": 101, "arrival_span": 15, "cpu_min": 8, "cpu_max": 30, "io_fraction": 0.0},
    },
    "io_heavy": {
        "name": "I/O-heavy",
        "description": "Most processes perform repeated short CPU bursts separated by I/O waits.",
        "generator": {"count": 8, "seed": 202, "arrival_span": 10, "cpu_min": 1, "cpu_max": 5,
                      "io_fraction": 0.9, "io_cycles_max": 4, "io_min": 4, "io_max": 12},
    },
    "interactive": {
        "name": "Interactive",
        "description": "Many short bursts arriving as a Poisson stream, with occasional I/O; "
        "a proxy for latency-sensitive tasks.",
        "generator": {"count": 12, "seed": 303, "arrival_pattern": "poisson", "mean_interarrival": 2.0,
                      "cpu_distribution": "exponential", "cpu_min": 1, "cpu_max": 10, "cpu_mean": 3.0,
                      "io_fraction": 0.5, "io_cycles_max": 2, "io_min": 2, "io_max": 6},
    },
    "mixed": {
        "name": "Mixed",
        "description": "Bimodal bursts: mostly short interactive jobs plus a few long CPU-bound jobs.",
        "generator": {"count": 10, "seed": 404, "arrival_span": 20, "cpu_distribution": "bimodal",
                      "cpu_min": 1, "cpu_max": 24, "short_fraction": 0.7, "io_fraction": 0.3,
                      "io_cycles_max": 2, "io_min": 2, "io_max": 6},
    },
    "high_load": {
        "name": "High load",
        "description": "Twenty processes arriving almost together; the ready queue stays long.",
        "generator": {"count": 20, "seed": 505, "arrival_span": 5, "cpu_min": 2, "cpu_max": 15, "io_fraction": 0.2},
    },
}


def list_presets() -> list[dict[str, Any]]:
    out = []
    for key, p in HANDCRAFTED.items():
        out.append({"key": key, "name": p["name"], "description": p["description"], "kind": "handcrafted",
                    "generator": None, "processes": p["processes"]})
    for key, p in GENERATED.items():
        out.append({"key": key, "name": p["name"], "description": p["description"], "kind": "generated",
                    "generator": p["generator"], "processes": generate_workload(p["generator"])})
    return out
