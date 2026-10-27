"""Differential tests: the engine versus an independent reference model.

The reference below is written only from docs/algorithm-specifications.md and docs/aqs-policy.md and
is structured differently from the engine (monotonic sequence numbers instead of list order, a single
function, no policy classes). It supports every algorithm, I/O bursts and context-switch cost.
Any disagreement is a bug in one of the two, to be resolved by reading the specification, never by
editing the expectation.
"""
import itertools
import random
from collections import deque

import pytest

from app.engine.models import ALGORITHM_PARAM_DEFAULTS, SimConfig
from app.engine.simulator import simulate


def reference(procs, algo, params, cost=0):
    """Return, for each tick [t, t+1), None (idle), ("run", pid) or ("switch", pid)."""
    p = {**ALGORITHM_PARAM_DEFAULTS[algo], **params}
    order = [x["pid"] for x in procs]
    spec = {x["pid"]: x for x in procs}
    idx = {pid: 0 for pid in order}
    rem = {pid: spec[pid]["bursts"][0] for pid in order}
    level = {pid: 0 for pid in order}
    seq = itertools.count()
    ready: dict[str, tuple[int, int]] = {}  # pid -> (entry sequence, entry time)
    blocked: dict[str, int] = {}
    done: set[str] = set()
    running = switching = last_ran = None
    switch_left = used = slice_cs = 0
    qlimit = None
    run_prio = 0
    window: deque = deque(maxlen=p.get("window", 1))
    aqs_q = p.get("base_quantum")
    ticks = []
    t = 0

    def eff(pid):
        base = spec[pid]["priority"]
        if p.get("aging_interval"):
            return max(0, base - (t - ready[pid][1]) // p["aging_interval"])
        return base

    def key(pid):
        s = ready[pid][0]
        if algo in ("fcfs", "rr", "aqs"):
            return (s,)
        if algo in ("sjf", "srtf"):
            return (rem[pid], s)
        if algo == "mlfq":
            return (level[pid], s)
        return (eff(pid), s)

    def enter(pid):
        ready[pid] = (next(seq), t)

    def slice_ended(pid, reason):
        if algo == "aqs":
            window.append((slice_cs, used))
        if algo == "mlfq" and reason == "quantum":
            level[pid] = min(level[pid] + 1, len(p["quanta"]) - 1)

    while len(done) < len(order):
        if switching is not None and switch_left == 0:
            running, switching = switching, None
            last_ran = running
        expired = None
        if running is not None:
            if rem[running] == 0:
                idx[running] += 1
                last = idx[running] >= len(spec[running]["bursts"])
                slice_ended(running, "terminate" if last else "block")
                if last:
                    done.add(running)
                else:
                    blocked[running] = spec[running]["bursts"][idx[running]]
                running = None
            elif qlimit is not None and used >= qlimit:
                slice_ended(running, "quantum")
                expired, running = running, None
        for pid in order:
            if pid in blocked and blocked[pid] == 0:
                del blocked[pid]
                idx[pid] += 1
                rem[pid] = spec[pid]["bursts"][idx[pid]]
                enter(pid)
        for pid in order:
            if spec[pid]["arrival"] == t:
                level[pid] = 0
                enter(pid)
        if expired is not None:
            enter(expired)
        if len(done) == len(order):
            break
        if algo == "mlfq" and p["boost_interval"] and t > 0 and t % p["boost_interval"] == 0:
            for pid in order:
                if pid not in done and spec[pid]["arrival"] <= t:
                    level[pid] = 0
            if running is not None:
                qlimit, used = p["quanta"][0], 0
        if switching is None:
            if running is not None and ready:
                best = min(ready, key=key)
                preempt = (
                    (algo == "srtf" and rem[best] < rem[running])
                    or (algo == "priority" and p["preemptive"] and eff(best) < run_prio)
                    or (algo == "mlfq" and level[best] < level[running])
                )
                if preempt:
                    slice_ended(running, "preempt")
                    enter(running)
                    running = None
            if running is None and ready:
                pick = min(ready, key=key)
                run_prio = eff(pick)
                del ready[pick]
                cs = cost if (last_ran is not None and last_ran != pick) else 0
                if algo == "rr":
                    qlimit = p["quantum"]
                elif algo == "mlfq":
                    qlimit = p["quanta"][level[pick]]
                elif algo == "aqs":
                    ov = sum(o for o, _ in window)
                    tot = sum(o + r for o, r in window)
                    rho = ov / tot if tot else 0.0
                    n_wait = len(ready)
                    if rho > p["overhead_limit"]:
                        target = aqs_q + p["step"]
                    elif n_wait >= p["high_load"]:
                        target = aqs_q - p["step"]
                    elif n_wait <= p["low_load"]:
                        target = aqs_q + p["step"]
                    else:
                        target = aqs_q
                    aqs_q = max(p["min_quantum"], min(p["max_quantum"], target))
                    qlimit = aqs_q
                else:
                    qlimit = None
                used, slice_cs = 0, cs
                if cs > 0:
                    switching, switch_left = pick, cs
                else:
                    running = last_ran = pick
        if switching is not None:
            ticks.append(("switch", switching))
            switch_left -= 1
        elif running is not None:
            ticks.append(("run", running))
            rem[running] -= 1
            used += 1
        else:
            ticks.append(None)
        for pid in blocked:
            blocked[pid] -= 1
        t += 1
    return ticks


def engine_ticks(workload, algo, params, cost):
    r = simulate(workload, SimConfig(algo, params, cost))
    ticks = []
    for s in r["segments"]:
        label = None if s["kind"] == "idle" else (s["kind"], s["pid"])
        ticks.extend([label] * (s["end"] - s["start"]))
    return ticks, r


def random_workload(rng, with_io, max_n=7):
    out = []
    for i in range(rng.randint(1, max_n)):
        bursts = [rng.randint(1, 7)]
        if with_io and rng.random() < 0.6:
            for _ in range(rng.randint(1, 2)):
                bursts += [rng.randint(1, 5), rng.randint(1, 7)]
        out.append({"pid": f"P{i}", "arrival": rng.randint(0, 9), "bursts": bursts, "priority": rng.randint(0, 3)})
    rng.shuffle(out)  # input order must matter for ties, so it must not follow the PID order
    return out


AQS_TIGHT = {"base_quantum": 3, "min_quantum": 1, "max_quantum": 6, "step": 1, "high_load": 3,
             "low_load": 1, "overhead_limit": 0.25, "window": 3}
CASES = [
    ("fcfs", {}),
    ("sjf", {}),
    ("srtf", {}),
    ("rr", {"quantum": 1}),
    ("rr", {"quantum": 3}),
    ("priority", {"preemptive": False}),
    ("priority", {"preemptive": True}),
    ("priority", {"preemptive": True, "aging_interval": 2}),
    ("priority", {"preemptive": False, "aging_interval": 3}),
    ("mlfq", {"quanta": [2, 4, 8], "boost_interval": 0}),
    ("mlfq", {"quanta": [1, 2, 3], "boost_interval": 7}),
    ("aqs", AQS_TIGHT),
    ("aqs", {**AQS_TIGHT, "high_load": 2, "overhead_limit": 0.1}),
]


@pytest.mark.parametrize("cost", [0, 1, 3])
@pytest.mark.parametrize("with_io", [False, True], ids=["cpu-only", "with-io"])
@pytest.mark.parametrize("algo,params", CASES, ids=[f"{c[0]}-{i}" for i, c in enumerate(CASES)])
def test_engine_matches_reference_model(algo, params, with_io, cost):
    rng = random.Random(f"{algo}{params}{with_io}{cost}")
    for trial in range(80):
        w = random_workload(rng, with_io)
        expected = reference(w, algo, params, cost)
        got, _ = engine_ticks(w, algo, params, cost)
        assert got == expected, f"trial {trial}: workload={w}\nengine   ={got}\nreference={expected}"


def test_reference_sees_aqs_adjustments():
    """Guard against a vacuous AQS comparison: the workloads must actually move the quantum."""
    rng = random.Random(7)
    moved = 0
    for _ in range(40):
        w = random_workload(rng, True, max_n=8)
        r = simulate(w, SimConfig("aqs", AQS_TIGHT, 2))
        moved += len(r["aqs_adjustments"])
    assert moved > 50
    signals = set()
    for _ in range(60):
        w = random_workload(rng, True, max_n=8)
        for d in simulate(w, SimConfig("aqs", AQS_TIGHT, 2))["decisions"]:
            signals.add(d["aqs"]["signal"])
    assert {"overhead_pressure", "latency_pressure", "light_load"} <= signals
