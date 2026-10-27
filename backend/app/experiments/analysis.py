"""Comparison and sensitivity analysis built on top of the engine."""
from __future__ import annotations

import math
import statistics
from typing import Any

from app.engine.models import SimConfig, ValidationError
from app.engine.simulator import simulate
from app.experiments.generator import generate_workload

# Metrics shown in comparisons, with the direction that counts as "better".
KEY_METRICS: dict[str, tuple[str, str]] = {
    "avg_response": ("response.mean", "lower"),
    "p95_response": ("response.p95", "lower"),
    "avg_ready_wait": ("ready_wait.mean", "lower"),
    "avg_turnaround": ("turnaround.mean", "lower"),
    "p95_turnaround": ("turnaround.p95", "lower"),
    "max_ready_wait": ("max_ready_wait", "lower"),
    "throughput": ("throughput", "higher"),
    "cpu_utilization": ("cpu_utilization", "higher"),
    "context_switches": ("context_switches", "lower"),
    "context_switch_overhead": ("context_switch_overhead", "lower"),
    "makespan": ("makespan", "lower"),
    "starved_count": ("starved_count", "lower"),
    "fairness": ("fairness_jain_slowdown", "higher"),
}

MAX_COMPARE = 8
MAX_SWEEP_POINTS = 25
MAX_TRIALS = 20


def flat_metrics(system: dict[str, Any]) -> dict[str, float]:
    out = {}
    for name, (path, _) in KEY_METRICS.items():
        v: Any = system
        for part in path.split("."):
            v = v[part]
        out[name] = v
    return out


def _delta(base: float, value: float) -> dict[str, Any]:
    diff = value - base
    return {"absolute": round(diff, 6), "percent": round(diff / base * 100, 2) if base else None}


def compare(workload: list[dict], configs: list[SimConfig], include_frames: bool = False) -> dict[str, Any]:
    if len(configs) < 2:
        raise ValidationError(["Select at least two scheduler configurations to compare."])
    if len(configs) > MAX_COMPARE:
        raise ValidationError([f"At most {MAX_COMPARE} configurations can be compared at once."])
    runs = []
    for cfg in configs:
        cfg.record_frames = include_frames
        r = simulate(workload, cfg)
        runs.append(r)
    base = flat_metrics(runs[0]["metrics"]["system"])
    out_runs = []
    for r in runs:
        fm = flat_metrics(r["metrics"]["system"])
        out_runs.append({
            **{k: r[k] for k in ("algorithm", "params", "context_switch_cost", "starvation_threshold", "end_time",
                                 "segments", "metrics", "aqs_adjustments")},
            # The per-event trace is large (it grows with events x processes) and comparisons never read it:
            # it is returned only when explicitly requested with include_frames.
            "decisions": r["decisions"] if include_frames else [],
            "frames": r["frames"] if include_frames else [],
            "state_intervals": r["state_intervals"] if include_frames else {},
            "summary": fm,
            "delta_vs_baseline": {k: _delta(base[k], fm[k]) for k in fm},
        })
    return {
        "workload": runs[0]["workload"],
        "baseline_index": 0,
        "metric_directions": {k: d for k, (_, d) in KEY_METRICS.items()},
        "runs": out_runs,
    }


T_95 = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
        10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110,
        18: 2.101, 19: 2.093}


def mean_ci(values: list[float]) -> dict[str, float]:
    """Mean with a two-sided 95% Student-t confidence half-width."""
    n = len(values)
    m = statistics.fmean(values)
    if n < 2:
        return {"mean": round(m, 4), "std": 0.0, "ci95": 0.0, "n": n}
    sd = statistics.stdev(values)
    return {"mean": round(m, 4), "std": round(sd, 4), "ci95": round(T_95[n - 1] * sd / math.sqrt(n), 4), "n": n}


SWEEP_PARAMS = ("quantum", "context_switch_cost", "process_count", "cpu_mean", "cpu_max")


def sweep(
    config: SimConfig,
    parameter: str,
    values: list[int | float],
    workload: list[dict] | None = None,
    generator: dict | None = None,
    trials: int = 1,
) -> dict[str, Any]:
    errors = []
    if parameter not in SWEEP_PARAMS:
        errors.append(f"parameter must be one of: {', '.join(SWEEP_PARAMS)}.")
    if not values or len(values) > MAX_SWEEP_POINTS:
        errors.append(f"Provide between 1 and {MAX_SWEEP_POINTS} sweep values.")
    if not 1 <= trials <= MAX_TRIALS:
        errors.append(f"trials must be between 1 and {MAX_TRIALS}.")
    if parameter in ("process_count", "cpu_mean", "cpu_max") and generator is None:
        errors.append(f"Sweeping {parameter} changes the workload, so a generator configuration is required.")
    if workload is None and generator is None:
        errors.append("Provide either a workload or a generator configuration.")
    if trials > 1 and generator is None:
        errors.append("Repeated trials need a generator (each trial uses seed, seed+1, ...).")
    if parameter == "quantum" and config.algorithm not in ("rr", "aqs", "mlfq"):
        errors.append("The quantum can only be swept for Round Robin, MLFQ (all levels scaled) or AQS (base quantum).")
    if errors:
        raise ValidationError(errors)

    points = []
    for v in values:
        trial_metrics: list[dict[str, float]] = []
        for k in range(trials):
            params = dict(config.params)
            cs = config.context_switch_cost
            gen = dict(generator) if generator else None
            if parameter == "quantum":
                v_int = int(v)
                if config.algorithm == "rr":
                    params["quantum"] = v_int
                elif config.algorithm == "aqs":
                    params["base_quantum"] = v_int
                    params["min_quantum"] = min(params.get("min_quantum", 2), v_int)
                    params["max_quantum"] = max(params.get("max_quantum", 12), v_int)
                else:
                    params["quanta"] = [v_int, v_int * 2, v_int * 4]
            elif parameter == "context_switch_cost":
                cs = int(v)
            elif gen is not None:
                gen_key = "count" if parameter == "process_count" else parameter
                gen[gen_key] = int(v) if parameter != "cpu_mean" else float(v)
            if gen is not None:
                gen["seed"] = int(gen.get("seed", 42)) + k
                wl = generate_workload(gen)
            else:
                wl = workload
            cfg = SimConfig(config.algorithm, params, cs, config.starvation_threshold, record_frames=False)
            res = simulate(wl, cfg)
            trial_metrics.append(flat_metrics(res["metrics"]["system"]))
        agg = {m: mean_ci([tm[m] for tm in trial_metrics]) for m in trial_metrics[0]}
        points.append({"value": v, "metrics": agg, "trials": trial_metrics})
    return {
        "algorithm": config.algorithm,
        "params": config.params,
        "parameter": parameter,
        "values": values,
        "trials": trials,
        "points": points,
    }
