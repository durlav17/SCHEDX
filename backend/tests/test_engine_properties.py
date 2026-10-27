"""Validation, determinism and metric-consistency properties."""
import pytest

from app.engine.models import ALGORITHMS, SimConfig, ValidationError
from app.engine.simulator import simulate
from app.experiments.analysis import compare, sweep
from app.experiments.generator import generate_workload
from app.experiments.presets import list_presets
from app.metrics.metrics import jain_index, percentile
from tests.helpers import CLASSIC, P, run


@pytest.mark.parametrize("workload,fragment", [
    ([], "empty"),
    ([P("A", -1, [3])], "non-negative"),
    ([P("A", 0, [3, 2])], "odd count"),
    ([P("A", 0, [0])], "positive integer"),
    ([P("A", 0, [3]), P("A", 1, [2])], "duplicate"),
    ([P("A", 0, [3], 120)], "priority"),
    ([{"pid": "", "arrival": 0, "bursts": [1]}], "non-empty"),
])
def test_invalid_workloads(workload, fragment):
    with pytest.raises(ValidationError) as e:
        simulate(workload, SimConfig("fcfs"))
    assert any(fragment in m for m in e.value.errors)


@pytest.mark.parametrize("algo,params,fragment", [
    ("rr", {"quantum": 0}, "quantum"),
    ("nope", {}, "Unknown algorithm"),
    ("aqs", {"min_quantum": 6, "base_quantum": 4}, "min_quantum <= base_quantum"),
    ("mlfq", {"quanta": [2, 4]}, "quanta"),
    ("rr", {"bogus": 1}, "Unknown parameter"),
])
def test_invalid_configs(algo, params, fragment):
    with pytest.raises(ValidationError) as e:
        simulate(CLASSIC, SimConfig(algo, params))
    assert any(fragment in m for m in e.value.errors)


def test_invalid_context_switch_cost():
    with pytest.raises(ValidationError):
        simulate(CLASSIC, SimConfig("fcfs", {}, context_switch_cost=-1))


def test_generator_is_deterministic():
    cfg = {"count": 15, "seed": 7, "io_fraction": 0.5, "cpu_distribution": "bimodal"}
    assert generate_workload(cfg) == generate_workload(cfg)
    assert generate_workload(cfg) != generate_workload({**cfg, "seed": 8})


def test_generator_validation():
    with pytest.raises(ValidationError):
        generate_workload({"count": 0})
    with pytest.raises(ValidationError):
        generate_workload({"cpu_min": 9, "cpu_max": 3})


@pytest.mark.parametrize("algo", ALGORITHMS)
def test_simulation_is_deterministic(algo):
    w = generate_workload({"count": 12, "seed": 11, "io_fraction": 0.5})
    a = simulate(w, SimConfig(algo, {}, 1))
    b = simulate(w, SimConfig(algo, {}, 1))
    assert a == b


@pytest.mark.parametrize("algo", ALGORITHMS)
@pytest.mark.parametrize("preset", [p["key"] for p in list_presets()])
@pytest.mark.parametrize("cs", [0, 2])
def test_metric_consistency(algo, preset, cs):
    w = next(p for p in list_presets() if p["key"] == preset)["processes"]
    r = simulate(w, SimConfig(algo, {}, cs))
    s = r["metrics"]["system"]
    assert s["accounting_consistent"]
    # Segments tile [0, end] without gaps.
    segs = r["segments"]
    assert segs[0]["start"] == 0 and segs[-1]["end"] == r["end_time"]
    assert all(a["end"] == b["start"] for a, b in zip(segs, segs[1:]))
    # Every CPU burst is executed exactly.
    for spec in w:
        executed = sum(x["end"] - x["start"] for x in segs if x["kind"] == "run" and x["pid"] == spec["pid"])
        assert executed == sum(spec["bursts"][0::2])
    total_switch = sum(x["end"] - x["start"] for x in segs if x["kind"] == "switch")
    assert total_switch == s["context_switch_overhead"] == s["context_switches"] * cs
    for p in r["metrics"]["processes"]:
        assert p["response"] >= 0 and p["turnaround"] >= p["cpu_time"] + p["io_time"]
        assert p["max_ready_wait"] <= p["ready_wait"]
    # Every frame's process states are consistent with its queues.
    for f in r["frames"]:
        states = {p["pid"]: p["state"] for p in f["procs"]}
        assert all(states[pid] == "ready" for pid in f["ready"])
        assert f["running"] is None or states[f["running"]] == "running"


def test_starvation_indicator_uses_threshold():
    w = [P("Low", 0, [2], 9)] + [P(f"H{i}", i * 5, [5], 0) for i in range(12)]
    r = run(w, "priority", {"preemptive": True}, starvation_threshold=30)
    low = next(p for p in r["metrics"]["processes"] if p["pid"] == "Low")
    assert low["max_ready_wait"] >= 30 and low["starved"]
    aged = run(w, "priority", {"preemptive": True, "aging_interval": 2}, starvation_threshold=30)
    assert not next(p for p in aged["metrics"]["processes"] if p["pid"] == "Low")["starved"]


def test_frames_support_backward_reconstruction():
    r = run(CLASSIC, "srtf")
    times = [f["time"] for f in r["frames"]]
    assert times == sorted(times)
    f1 = next(f for f in r["frames"] if f["time"] == 1)
    assert f1["running"] == "P2" and f1["ready"] == ["P1"]
    rem = {p["pid"]: p["remaining"] for p in f1["procs"]}
    assert rem["P1"] == 7 and rem["P2"] == 4


def test_percentile_and_fairness():
    assert percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95) == 10
    assert percentile([5], 95) == 5
    assert percentile([], 95) == 0
    assert jain_index([2, 2, 2]) == 1.0
    assert jain_index([1, 0, 0]) == round(1 / 3, 4)


def test_compare_uses_identical_workload():
    res = compare(CLASSIC, [SimConfig("fcfs"), SimConfig("srtf")])
    assert len(res["runs"]) == 2
    assert res["runs"][1]["delta_vs_baseline"]["avg_ready_wait"]["absolute"] == -2.25
    assert res["runs"][1]["delta_vs_baseline"]["avg_ready_wait"]["percent"] == round(-2.25 / 8.75 * 100, 2)


def test_sweep_quantum_and_trials():
    res = sweep(SimConfig("rr", {"quantum": 4}), "quantum", [1, 2, 4, 8], workload=CLASSIC)
    assert [p["value"] for p in res["points"]] == [1, 2, 4, 8]
    q4 = res["points"][2]["metrics"]["avg_ready_wait"]["mean"]
    assert q4 == run(CLASSIC, "rr", {"quantum": 4})["metrics"]["system"]["ready_wait"]["mean"]
    res2 = sweep(SimConfig("fcfs"), "process_count", [4, 8], generator={"seed": 1}, trials=3)
    m = res2["points"][0]["metrics"]["avg_turnaround"]
    assert m["n"] == 3 and m["ci95"] >= 0


def test_sweep_validation():
    with pytest.raises(ValidationError):
        sweep(SimConfig("fcfs"), "quantum", [1, 2], workload=CLASSIC)
    with pytest.raises(ValidationError):
        sweep(SimConfig("fcfs"), "process_count", [3], workload=CLASSIC)


# ---------------------------------------------------------------- documented limits (found untested by the audit)
def test_process_count_limit_is_enforced():
    from app.engine.models import MAX_PROCESSES

    ok = [P(f"P{i}", 0, [1]) for i in range(MAX_PROCESSES)]
    assert simulate(ok, SimConfig("fcfs"))["metrics"]["system"]["process_count"] == MAX_PROCESSES
    with pytest.raises(ValidationError) as e:
        simulate(ok + [P("EXTRA", 0, [1])], SimConfig("fcfs"))
    assert any("Too many processes" in m for m in e.value.errors)


def test_simulation_horizon_limit_is_enforced():
    """Total CPU demand far beyond the 50,000 tu horizon must be rejected with a message, not run forever."""
    from app.engine.models import MAX_HORIZON

    heavy = [P(f"P{i}", 0, [1000, 1, 1000, 1, 1000, 1, 1000, 1, 1000, 1, 1000, 1, 1000, 1, 1000, 1, 1000, 1, 1000, 1, 1000])
             for i in range(8)]  # 8 x 11,000 tu of CPU > MAX_HORIZON
    assert sum(sum(p["bursts"][0::2]) for p in heavy) > MAX_HORIZON
    with pytest.raises(ValidationError) as e:
        simulate(heavy, SimConfig("rr", {"quantum": 50}))
    assert any("maximum horizon" in m for m in e.value.errors)


def test_burst_and_arrival_limits():
    with pytest.raises(ValidationError):
        simulate([P("A", 10_001, [1])], SimConfig("fcfs"))
    with pytest.raises(ValidationError):
        simulate([P("A", 0, [1001])], SimConfig("fcfs"))
    with pytest.raises(ValidationError):
        simulate([P("A", 0, [1, 1] * 21 + [1])], SimConfig("fcfs"))  # 43 values > 41
