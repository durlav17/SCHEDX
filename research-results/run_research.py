"""Run the SchedX research protocol (research-results/PROTOCOL.md) and write raw results.

    backend\\.venv\\Scripts\\python.exe research-results\\run_research.py            # run everything
    backend\\.venv\\Scripts\\python.exe research-results\\run_research.py --verify   # also cross-check via the API

Outputs (all under research-results/raw/):
  step1_comparison.csv, step2_cost_sweep.csv, step3_quantum_sweep.csv, step4_scale.csv  - one row per simulation
  workloads.json   - every generated process list (class, trial, seed -> processes)
  manifest.json    - protocol hash, engine source hash, parameter sets, counts, environment

The CSV files are byte-for-byte deterministic for a given engine and protocol.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent / "backend"
sys.path.insert(0, str(BACKEND))

from app.engine.models import ALGORITHM_PARAM_DEFAULTS, SimConfig  # noqa: E402
from app.engine.simulator import simulate  # noqa: E402
from app.experiments.generator import generate_workload  # noqa: E402
from app.experiments.presets import GENERATED  # noqa: E402

RAW = HERE / "raw"
CLASSES = ["cpu_bound", "io_heavy", "interactive", "mixed", "high_load"]
TRIALS = 10
COST = 1
STARVATION = 50

# label, algorithm, params (parameters fixed by PROTOCOL.md; never tuned)
CONFIGS = [
    ("FCFS", "fcfs", {}),
    ("SJF", "sjf", {}),
    ("SRTF", "srtf", {}),
    ("RR q=2", "rr", {"quantum": 2}),
    ("RR q=4", "rr", {"quantum": 4}),
    ("RR q=8", "rr", {"quantum": 8}),
    ("MLFQ", "mlfq", {}),
    ("AQS", "aqs", {}),
    ("PRIO-P", "priority", {"preemptive": True}),
]
NON_PRIORITY = [c for c in CONFIGS if c[0] != "PRIO-P"]
COST_SWEEP_CONFIGS = [c for c in CONFIGS if c[0] in ("RR q=2", "RR q=4", "AQS")]
COSTS = [0, 1, 2, 3, 4, 5]
QUANTA = [1, 2, 3, 4, 6, 8, 12, 16]
COUNTS = [4, 8, 12, 16, 24, 32]
SCALE_CLASSES = ["interactive", "mixed"]

METRIC_COLUMNS = [
    "response_mean", "response_median", "response_p95", "response_max", "ready_wait_mean",
    "turnaround_mean", "turnaround_p95", "throughput", "cpu_utilization", "context_switches",
    "switch_overhead", "max_ready_stint", "starved_count", "jain_fairness", "preemptions", "makespan",
]
ID_COLUMNS = ["step", "workload_class", "trial", "seed", "process_count", "config", "algorithm", "params",
              "context_switch_cost", "sweep_param", "sweep_value", "workload_sha256"]


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def workload_for(cls: str, trial: int, count: int | None = None) -> tuple[int, list[dict]]:
    gen = dict(GENERATED[cls]["generator"])
    seed = int(gen["seed"]) + trial
    gen["seed"] = seed
    if count is not None:
        gen["count"] = count
    return seed, generate_workload(gen)


def metrics_of(result: dict) -> dict:
    s = result["metrics"]["system"]
    return {
        "response_mean": s["response"]["mean"], "response_median": s["response"]["median"],
        "response_p95": s["response"]["p95"], "response_max": s["response"]["max"],
        "ready_wait_mean": s["ready_wait"]["mean"], "turnaround_mean": s["turnaround"]["mean"],
        "turnaround_p95": s["turnaround"]["p95"], "throughput": s["throughput"],
        "cpu_utilization": s["cpu_utilization"], "context_switches": s["context_switches"],
        "switch_overhead": s["context_switch_overhead"], "max_ready_stint": s["max_ready_wait"],
        "starved_count": s["starved_count"], "jain_fairness": s["fairness_jain_slowdown"],
        "preemptions": s["preemptions"], "makespan": s["makespan"],
    }


def run_one(step, cls, trial, seed, workload, label, algo, params, cost, sweep_param="", sweep_value="") -> dict:
    cfg = SimConfig(algo, dict(params), cost, STARVATION, record_frames=False)
    res = simulate(workload, cfg)
    assert res["metrics"]["system"]["accounting_consistent"], "accounting invariant violated"
    full_params = {**ALGORITHM_PARAM_DEFAULTS[algo], **params}
    return {
        "step": step, "workload_class": cls, "trial": trial, "seed": seed, "process_count": len(workload),
        "config": label, "algorithm": algo, "params": json.dumps(full_params, sort_keys=True),
        "context_switch_cost": cost, "sweep_param": sweep_param, "sweep_value": sweep_value,
        "workload_sha256": sha256_text(json.dumps(workload, sort_keys=True))[:16], **metrics_of(res),
    }


def write_csv(name: str, rows: list[dict]) -> None:
    RAW.mkdir(exist_ok=True)
    with open(RAW / name, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ID_COLUMNS + METRIC_COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def aqs_sweep_params(q: int) -> dict:
    d = ALGORITHM_PARAM_DEFAULTS["aqs"]
    return {"base_quantum": q, "min_quantum": min(d["min_quantum"], q), "max_quantum": max(d["max_quantum"], q)}


def run_all() -> dict:
    workloads: dict[str, list] = {}
    counts = {}

    def remember(cls, trial, seed, wl, count=None):
        key = f"{cls}|trial={trial}|seed={seed}|n={len(wl)}"
        workloads[key] = wl

    # Step 1
    rows = []
    for cls in CLASSES:
        for t in range(TRIALS):
            seed, wl = workload_for(cls, t)
            remember(cls, t, seed, wl)
            for label, algo, params in CONFIGS:
                rows.append(run_one("1_comparison", cls, t, seed, wl, label, algo, params, COST))
    write_csv("step1_comparison.csv", rows); counts["step1"] = len(rows)

    # Step 2
    rows = []
    for cls in CLASSES:
        for t in range(TRIALS):
            seed, wl = workload_for(cls, t)
            for cost in COSTS:
                for label, algo, params in COST_SWEEP_CONFIGS:
                    rows.append(run_one("2_cost_sweep", cls, t, seed, wl, label, algo, params, cost, "context_switch_cost", cost))
    write_csv("step2_cost_sweep.csv", rows); counts["step2"] = len(rows)

    # Step 3
    rows = []
    for cls in CLASSES:
        for t in range(TRIALS):
            seed, wl = workload_for(cls, t)
            for q in QUANTA:
                rows.append(run_one("3_quantum_sweep", cls, t, seed, wl, "RR", "rr", {"quantum": q}, COST, "quantum", q))
                rows.append(run_one("3_quantum_sweep", cls, t, seed, wl, "AQS", "aqs", aqs_sweep_params(q), COST, "quantum", q))
    write_csv("step3_quantum_sweep.csv", rows); counts["step3"] = len(rows)

    # Step 4
    rows = []
    for cls in SCALE_CLASSES:
        for n in COUNTS:
            for t in range(TRIALS):
                seed, wl = workload_for(cls, t, count=n)
                remember(cls, t, seed, wl)
                for label, algo, params in NON_PRIORITY:
                    rows.append(run_one("4_scale", cls, t, seed, wl, label, algo, params, COST, "process_count", n))
    write_csv("step4_scale.csv", rows); counts["step4"] = len(rows)

    (RAW / "workloads.json").write_text(json.dumps(workloads, sort_keys=True, indent=1) + "\n", encoding="utf-8")
    return counts


def engine_hash() -> str:
    h = hashlib.sha256()
    for sub in ("engine", "algorithms", "metrics", "experiments"):
        for p in sorted((BACKEND / "app" / sub).glob("*.py")):
            h.update(p.name.encode()); h.update(p.read_bytes())
    return h.hexdigest()


def write_manifest(counts: dict, seconds: float) -> None:
    manifest = {
        "protocol_sha256": hashlib.sha256((HERE / "PROTOCOL.md").read_bytes()).hexdigest(),
        "engine_sources_sha256": engine_hash(),
        "classes": CLASSES, "trials_per_class": TRIALS, "seed_rule": "class base seed + trial (trial = 0..9)",
        "base_seeds": {c: GENERATED[c]["generator"]["seed"] for c in CLASSES},
        "generators": {c: GENERATED[c]["generator"] for c in CLASSES},
        "context_switch_cost_main": COST, "starvation_threshold": STARVATION,
        "configurations": [{"label": l, "algorithm": a, "params": {**ALGORITHM_PARAM_DEFAULTS[a], **p}} for l, a, p in CONFIGS],
        "cost_sweep": COSTS, "quantum_sweep": QUANTA, "scale_sweep": COUNTS, "scale_classes": SCALE_CLASSES,
        "simulations_completed": counts, "simulations_total": sum(counts.values()),
        "failed_or_skipped": [],
        "csv_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(RAW.glob("*.csv"))},
        "environment": {"python": sys.version.split()[0], "platform": platform.platform(),
                        "run_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        "wall_seconds": round(seconds, 1)},
    }
    (RAW / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")


def verify_via_api() -> None:
    """Cross-check sample cells: the API (what the Experiment Studio uses) must reproduce the raw CSV."""
    from fastapi.testclient import TestClient
    from app.main import create_app

    client = TestClient(create_app(":memory:"))
    rows = list(csv.DictReader(open(RAW / "step1_comparison.csv", encoding="utf-8")))
    checked = 0
    for cls, trial in (("interactive", 0), ("mixed", 3), ("high_load", 9)):
        seed, wl = workload_for(cls, trial)
        runs = []
        for chunk in (CONFIGS[:5], CONFIGS[5:]):  # the API compares at most 8 configurations per request
            r = client.post("/api/experiments/compare", json={
                "workload": wl,
                "configs": [{"algorithm": a, "params": p, "context_switch_cost": COST, "starvation_threshold": STARVATION}
                            for _, a, p in chunk]})
            assert r.status_code == 200, r.text
            runs += r.json()["runs"]
        for (label, _, _), run in zip(CONFIGS, runs):
            row = next(x for x in rows if x["workload_class"] == cls and int(x["trial"]) == trial and x["config"] == label)
            s = run["metrics"]["system"]
            assert float(row["response_mean"]) == s["response"]["mean"], (cls, trial, label)
            assert float(row["turnaround_p95"]) == s["turnaround"]["p95"], (cls, trial, label)
            assert int(row["context_switches"]) == s["context_switches"], (cls, trial, label)
            checked += 1
    sw = client.post("/api/experiments/sweep", json={
        "config": {"algorithm": "rr", "params": {"quantum": 4}, "context_switch_cost": 1}, "parameter": "quantum",
        "values": [2, 8], "generator": {**GENERATED["mixed"]["generator"]}, "trials": 10}).json()
    sweep_rows = list(csv.DictReader(open(RAW / "step3_quantum_sweep.csv", encoding="utf-8")))
    for pt in sw["points"]:
        for k, tr in enumerate(pt["trials"]):
            row = next(x for x in sweep_rows if x["workload_class"] == "mixed" and x["config"] == "RR"
                       and int(x["trial"]) == k and float(x["sweep_value"]) == pt["value"])
            assert float(row["response_mean"]) == tr["avg_response"] and int(row["context_switches"]) == tr["context_switches"]
            checked += 1
    print(f"API cross-check passed: {checked} cells identical to the raw CSV.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true", help="cross-check sample cells through the HTTP API")
    args = ap.parse_args()
    t0 = time.time()
    counts = run_all()
    write_manifest(counts, time.time() - t0)
    print("simulations:", counts, "total", sum(counts.values()), f"in {time.time() - t0:.1f}s")
    if args.verify:
        verify_via_api()
