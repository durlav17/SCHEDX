"""Core data model for the SchedX simulation engine.

The engine is deliberately independent of FastAPI / Pydantic so it can be
unit-tested and reused on its own. All times are non-negative integers
("simulation time units", abbreviated tu).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

MAX_PROCESSES = 100
MAX_BURSTS_PER_PROCESS = 41  # 21 CPU bursts + 20 I/O bursts
MAX_BURST_LENGTH = 1000
MAX_ARRIVAL = 10_000
MAX_HORIZON = 50_000
MAX_CONTEXT_SWITCH = 20

ALGORITHMS = ("fcfs", "sjf", "srtf", "rr", "priority", "mlfq", "aqs")


class ValidationError(ValueError):
    """Raised when a workload or configuration is invalid.

    ``errors`` is a list of human-readable messages, each describing one
    problem. The engine never silently "fixes" invalid input.
    """

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


@dataclass(frozen=True)
class ProcessSpec:
    """A process definition.

    ``bursts`` alternates CPU and I/O durations and must start and end with a
    CPU burst: [cpu, io, cpu, io, ..., cpu]. Smaller ``priority`` values mean
    HIGHER priority (0 is the most important), consistently across SchedX.
    """

    pid: str
    arrival: int
    bursts: tuple[int, ...]
    priority: int = 0

    @property
    def cpu_bursts(self) -> tuple[int, ...]:
        return self.bursts[0::2]

    @property
    def io_bursts(self) -> tuple[int, ...]:
        return self.bursts[1::2]

    @property
    def total_cpu(self) -> int:
        return sum(self.cpu_bursts)

    def to_dict(self) -> dict[str, Any]:
        return {
            "pid": self.pid,
            "arrival": self.arrival,
            "bursts": list(self.bursts),
            "priority": self.priority,
        }


@dataclass
class SimConfig:
    algorithm: str
    params: dict[str, Any] = field(default_factory=dict)
    context_switch_cost: int = 0
    starvation_threshold: int = 50
    record_frames: bool = True


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def validate_workload(raw: list[dict[str, Any]]) -> list[ProcessSpec]:
    """Validate raw process dictionaries and return immutable specs."""
    errors: list[str] = []
    if not isinstance(raw, list) or len(raw) == 0:
        raise ValidationError(["The workload is empty: add at least one process."])
    if len(raw) > MAX_PROCESSES:
        raise ValidationError([f"Too many processes ({len(raw)}); the limit is {MAX_PROCESSES}."])

    seen: set[str] = set()
    specs: list[ProcessSpec] = []
    for i, p in enumerate(raw):
        label = f"Process #{i + 1}"
        pid = p.get("pid") if isinstance(p, dict) else None
        if not isinstance(pid, str) or not pid.strip():
            errors.append(f"{label}: process ID must be a non-empty string.")
            continue
        pid = pid.strip()
        label = f"Process {pid}"
        if len(pid) > 16:
            errors.append(f"{label}: process ID must be at most 16 characters.")
        if pid in seen:
            errors.append(f"{label}: duplicate process ID.")
        seen.add(pid)

        arrival = p.get("arrival")
        if not _is_int(arrival) or arrival < 0:
            errors.append(f"{label}: arrival time must be a non-negative integer.")
        elif arrival > MAX_ARRIVAL:
            errors.append(f"{label}: arrival time must be at most {MAX_ARRIVAL}.")

        bursts = p.get("bursts")
        if not isinstance(bursts, (list, tuple)) or len(bursts) == 0:
            errors.append(f"{label}: at least one CPU burst is required.")
            bursts = None
        elif len(bursts) % 2 == 0:
            errors.append(
                f"{label}: bursts must alternate CPU and I/O and end with a CPU burst "
                f"(got {len(bursts)} values; an odd count is required)."
            )
        elif len(bursts) > MAX_BURSTS_PER_PROCESS:
            errors.append(f"{label}: at most {MAX_BURSTS_PER_PROCESS} burst values are allowed.")
        if bursts is not None:
            for j, b in enumerate(bursts):
                kind = "CPU" if j % 2 == 0 else "I/O"
                if not _is_int(b) or b <= 0:
                    errors.append(f"{label}: {kind} burst {j // 2 + 1} must be a positive integer.")
                elif b > MAX_BURST_LENGTH:
                    errors.append(f"{label}: {kind} burst {j // 2 + 1} exceeds {MAX_BURST_LENGTH}.")

        priority = p.get("priority", 0)
        if not _is_int(priority) or priority < 0 or priority > 99:
            errors.append(f"{label}: priority must be an integer between 0 and 99 (0 = highest).")

        if not errors:
            specs.append(ProcessSpec(pid=pid, arrival=arrival, bursts=tuple(bursts), priority=priority))

    if errors:
        raise ValidationError(errors)
    return specs


ALGORITHM_PARAM_DEFAULTS: dict[str, dict[str, Any]] = {
    "fcfs": {},
    "sjf": {},
    "srtf": {},
    "rr": {"quantum": 4},
    "priority": {"preemptive": False, "aging_interval": 0},
    "mlfq": {"quanta": [4, 8, 16], "boost_interval": 100},
    "aqs": {
        "base_quantum": 4,
        "min_quantum": 2,
        "max_quantum": 12,
        "step": 1,
        "high_load": 4,
        "low_load": 1,
        "overhead_limit": 0.2,
        "window": 5,
    },
}


def validate_config(cfg: SimConfig) -> SimConfig:
    """Validate a configuration and fill in algorithm parameter defaults."""
    errors: list[str] = []
    algo = cfg.algorithm
    if algo not in ALGORITHMS:
        raise ValidationError([f"Unknown algorithm '{algo}'. Choose one of: {', '.join(ALGORITHMS)}."])
    params = {**ALGORITHM_PARAM_DEFAULTS[algo], **(cfg.params or {})}
    unknown = set(params) - set(ALGORITHM_PARAM_DEFAULTS[algo])
    if unknown:
        errors.append(f"Unknown parameter(s) for {algo}: {', '.join(sorted(unknown))}.")

    def pos_int(name: str, lo: int = 1, hi: int = 1000) -> None:
        v = params.get(name)
        if not _is_int(v) or v < lo or v > hi:
            errors.append(f"{name} must be an integer between {lo} and {hi}.")

    if algo == "rr":
        pos_int("quantum", 1, 500)
    elif algo == "priority":
        if not isinstance(params["preemptive"], bool):
            errors.append("preemptive must be true or false.")
        pos_int("aging_interval", 0, 10_000)
    elif algo == "mlfq":
        q = params["quanta"]
        if not isinstance(q, list) or not 3 <= len(q) <= 5 or not all(_is_int(x) and 1 <= x <= 500 for x in q):
            errors.append("quanta must list 3 to 5 integer time slices between 1 and 500 (one per level).")
        pos_int("boost_interval", 0, 100_000)
    elif algo == "aqs":
        for name in ("base_quantum", "min_quantum", "max_quantum"):
            pos_int(name, 1, 500)
        pos_int("step", 1, 50)
        pos_int("high_load", 1, MAX_PROCESSES)
        pos_int("low_load", 0, MAX_PROCESSES)
        pos_int("window", 1, 100)
        ol = params["overhead_limit"]
        if not isinstance(ol, (int, float)) or isinstance(ol, bool) or not 0 < ol < 1:
            errors.append("overhead_limit must be a number strictly between 0 and 1.")
        if not errors:
            if not params["min_quantum"] <= params["base_quantum"] <= params["max_quantum"]:
                errors.append("AQS requires min_quantum <= base_quantum <= max_quantum.")
            if params["low_load"] >= params["high_load"]:
                errors.append("AQS requires low_load < high_load.")

    if not _is_int(cfg.context_switch_cost) or not 0 <= cfg.context_switch_cost <= MAX_CONTEXT_SWITCH:
        errors.append(f"context_switch_cost must be an integer between 0 and {MAX_CONTEXT_SWITCH}.")
    if not _is_int(cfg.starvation_threshold) or cfg.starvation_threshold < 1:
        errors.append("starvation_threshold must be a positive integer.")
    if errors:
        raise ValidationError(errors)
    return SimConfig(
        algorithm=algo,
        params=params,
        context_switch_cost=cfg.context_switch_cost,
        starvation_threshold=cfg.starvation_threshold,
        record_frames=cfg.record_frames,
    )
