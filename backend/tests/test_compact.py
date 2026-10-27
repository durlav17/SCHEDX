"""The compact wire format must be lossless, and materially smaller."""
import json

import pytest

from app.engine.compact import compact_result, expand_result, summary_result
from app.engine.models import ALGORITHMS, SimConfig
from app.engine.simulator import simulate
from app.experiments.generator import generate_workload
from app.experiments.presets import list_presets
from tests.helpers import CLASSIC, P
from tests.test_reference_model import AQS_TIGHT, random_workload

import random


def roundtrip(workload, algo, params=None, cost=0):
    full = simulate(workload, SimConfig(algo, params or {}, cost))
    comp = compact_result(full)
    # Through JSON, exactly as it travels over the API.
    comp = json.loads(json.dumps(comp))
    return full, comp, expand_result(comp)


@pytest.mark.parametrize("algo", ALGORITHMS)
@pytest.mark.parametrize("preset", [p["key"] for p in list_presets()])
@pytest.mark.parametrize("cost", [0, 2])
def test_roundtrip_is_exact(algo, preset, cost):
    w = next(p for p in list_presets() if p["key"] == preset)["processes"]
    full, _, back = roundtrip(w, algo, cost=cost)
    assert back == json.loads(json.dumps(full))


def test_roundtrip_random_workloads_with_ties_and_io():
    rng = random.Random(5)
    for algo, params in [("srtf", {}), ("rr", {"quantum": 2}), ("priority", {"preemptive": True, "aging_interval": 2}),
                         ("mlfq", {"quanta": [1, 2, 3], "boost_interval": 7}), ("aqs", AQS_TIGHT)]:
        for _ in range(60):
            w = random_workload(rng, True, max_n=8)
            full, _, back = roundtrip(w, algo, params, rng.choice([0, 1, 3]))
            assert back == json.loads(json.dumps(full)), (algo, w)


def test_backward_state_reconstruction_matches_full_frames():
    """Every recorded frame (what reverse stepping shows) is reproduced exactly, in both directions."""
    full, comp, back = roundtrip(CLASSIC + [P("P5", 3, [2, 3, 2])], "srtf", cost=1)
    full_frames = json.loads(json.dumps(full["frames"]))
    assert len(back["frames"]) == len(full_frames) > 5
    # Visit the frames from last to first, as reverse stepping does: each must equal the recorded snapshot.
    for i in reversed(range(len(full_frames))):
        assert back["frames"][i] == full_frames[i], f"frame {i} (t={full_frames[i]['time']}) differs"
    # A decision's blocked snapshot is rebuilt from its frame and must match the engine's own record.
    for a, b in zip(back["decisions"], json.loads(json.dumps(full["decisions"]))):
        assert a["blocked"] == b["blocked"] and a["ready_queue"] == b["ready_queue"]


def test_compact_is_much_smaller_on_a_large_workload():
    w = generate_workload({"count": 60, "seed": 3, "io_fraction": 0.5, "cpu_max": 30, "arrival_span": 40})
    full = simulate(w, SimConfig("rr", {"quantum": 2}, 1))
    full_size = len(json.dumps(full))
    comp = compact_result(full)
    comp_size = len(json.dumps(comp))
    assert expand_result(json.loads(json.dumps(comp))) == json.loads(json.dumps(full))
    assert comp_size < full_size * 0.12, f"compact {comp_size} vs full {full_size}"
    # The prediction rule keeps the stored rows per frame near 1-2 (measured: 1.5), independent of the process count.
    items = comp["frames"]["items"]
    assert sum(len(i["rw"]) for i in items) / len(items) < 3.0


def test_summary_mode_has_no_trace():
    full = simulate(CLASSIC, SimConfig("rr", {"quantum": 2}))
    s = summary_result(full)
    assert s["frames"] == [] and s["decisions"] == [] and s["segments"] and s["metrics"]["system"]["makespan"] == 26


def test_golden_fixture_for_the_typescript_decoder_is_current():
    """frontend/src/lib/__fixtures__/compact-golden.json must match what the engine produces today."""
    from tests.make_compact_fixture import FIXTURE, build_fixture

    on_disk = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert on_disk == json.loads(json.dumps(build_fixture(), sort_keys=True)), (
        "stale fixture: run  .venv\Scripts\python.exe -m tests.make_compact_fixture  from backend/")
    for case in on_disk["cases"]:
        assert expand_result(case["compact"]) == case["full"], case["name"]
