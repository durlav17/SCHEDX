"""Algorithm correctness tests. Every expected schedule below was worked out by
hand from the rules in docs/algorithm-specifications.md."""
from tests.helpers import CLASSIC, P, proc, run, runs, timeline


# ---------------------------------------------------------------- FCFS
def test_fcfs_classic():
    r = run(CLASSIC, "fcfs")
    assert runs(r) == [("P1", 0, 8), ("P2", 8, 12), ("P3", 12, 21), ("P4", 21, 26)]
    # waits: 0, 7, 10, 18
    assert r["metrics"]["system"]["ready_wait"]["mean"] == 8.75


def test_fcfs_simultaneous_arrivals_use_input_order():
    r = run([P("B", 0, [2]), P("A", 0, [1]), P("C", 0, [1])], "fcfs")
    assert runs(r) == [("B", 0, 2), ("A", 2, 3), ("C", 3, 4)]


def test_idle_interval_and_utilization():
    r = run([P("A", 0, [2]), P("B", 5, [3])], "fcfs")
    assert timeline(r) == [("run", "A", 0, 2), ("idle", None, 2, 5), ("run", "B", 5, 8)]
    s = r["metrics"]["system"]
    assert s["idle_time"] == 3
    assert s["cpu_utilization"] == round(5 / 8, 6)
    assert s["throughput"] == round(2 / 8, 6)


def test_fcfs_io_blocking_and_resumption():
    # A runs 0-2, blocks for 3 (until 5); B runs 2-6; A ready at 5, runs 6-8.
    r = run([P("A", 0, [2, 3, 2]), P("B", 0, [4])], "fcfs")
    assert runs(r) == [("A", 0, 2), ("B", 2, 6), ("A", 6, 8)]
    a = proc(r, "A")
    assert (a["completion"], a["turnaround"], a["ready_wait"], a["io_time"], a["cpu_time"]) == (8, 8, 1, 3, 4)
    assert proc(r, "B")["ready_wait"] == 2
    causes = [(t["time"], t["pid"], t["cause"]) for t in r["transitions"] if t["pid"] == "A"]
    assert (2, "A", "block") in causes and (5, "A", "io_complete") in causes and (8, "A", "terminate") in causes


# ---------------------------------------------------------------- SJF / SRTF
def test_sjf_classic():
    r = run(CLASSIC, "sjf")
    assert runs(r) == [("P1", 0, 8), ("P2", 8, 12), ("P4", 12, 17), ("P3", 17, 26)]
    assert r["metrics"]["system"]["ready_wait"]["mean"] == 7.75


def test_sjf_tie_uses_queue_order():
    r = run([P("A", 0, [3]), P("B", 0, [3]), P("C", 0, [1])], "sjf")
    assert runs(r) == [("C", 0, 1), ("A", 1, 4), ("B", 4, 7)]


def test_srtf_classic_preemption():
    r = run(CLASSIC, "srtf")
    assert runs(r) == [("P1", 0, 1), ("P2", 1, 5), ("P4", 5, 10), ("P1", 10, 17), ("P3", 17, 26)]
    assert r["metrics"]["system"]["ready_wait"]["mean"] == 6.5
    assert proc(r, "P1")["preemptions"] == 1
    d = next(d for d in r["decisions"] if d["time"] == 1)
    assert d["preempted"] and d["selected"] == "P2" and d["previous_process"] == "P1"


def test_srtf_exact_tie_does_not_preempt():
    # At t=1 A has 3 left and B needs 3: no preemption.
    r = run([P("A", 0, [4]), P("B", 1, [3])], "srtf")
    assert runs(r) == [("A", 0, 4), ("B", 4, 7)]
    assert r["metrics"]["system"]["preemptions"] == 0


# ---------------------------------------------------------------- Round Robin
def test_rr_classic_q4():
    r = run(CLASSIC, "rr", {"quantum": 4})
    assert runs(r) == [("P1", 0, 4), ("P2", 4, 8), ("P3", 8, 12), ("P4", 12, 16),
                       ("P1", 16, 20), ("P3", 20, 24), ("P4", 24, 25), ("P3", 25, 26)]


def test_rr_arrival_precedes_requeue_at_same_instant():
    r = run([P("A", 0, [4]), P("B", 2, [2])], "rr", {"quantum": 2})
    assert runs(r) == [("A", 0, 2), ("B", 2, 4), ("A", 4, 6)]
    seg = r["segments"][0]
    assert seg["end_reason"] == "quantum"


def test_rr_single_process_requeues_without_context_switch():
    r = run([P("A", 0, [5])], "rr", {"quantum": 2}, cs=3)
    assert runs(r) == [("A", 0, 2), ("A", 2, 4), ("A", 4, 5)]
    assert r["metrics"]["system"]["context_switches"] == 0


def test_rr_io_and_context_switch_overhead():
    r = run([P("A", 0, [3, 4, 2]), P("B", 1, [5])], "rr", {"quantum": 2}, cs=1)
    assert timeline(r) == [
        ("run", "A", 0, 2), ("switch", "B", 2, 3), ("run", "B", 3, 5), ("switch", "A", 5, 6),
        ("run", "A", 6, 7), ("switch", "B", 7, 8), ("run", "B", 8, 10), ("run", "B", 10, 11),
        ("switch", "A", 11, 12), ("run", "A", 12, 14),
    ]
    a, b = proc(r, "A"), proc(r, "B")
    assert (a["turnaround"], a["ready_wait"], a["dispatch_wait"], a["io_time"]) == (14, 3, 2, 4)
    assert (b["response"], b["turnaround"], b["ready_wait"]) == (2, 10, 3)
    s = r["metrics"]["system"]
    assert s["context_switches"] == 4 and s["context_switch_overhead"] == 4
    assert s["cpu_utilization"] == round(10 / 14, 6)


# ---------------------------------------------------------------- Context switches
def test_context_switch_cost_fcfs():
    r = run([P("A", 0, [2]), P("B", 0, [2]), P("C", 0, [2])], "fcfs", cs=2)
    assert timeline(r) == [("run", "A", 0, 2), ("switch", "B", 2, 4), ("run", "B", 4, 6),
                           ("switch", "C", 6, 8), ("run", "C", 8, 10)]
    s = r["metrics"]["system"]
    assert (s["context_switches"], s["context_switch_overhead"], s["cpu_utilization"]) == (2, 4, 0.6)
    assert proc(r, "B")["response"] == 4 and proc(r, "C")["response"] == 8
    d = r["decisions"][1]
    assert d["context_switch"] == {"from": "A", "to": "B", "cost": 2}


def test_zero_cost_switches_are_still_counted():
    r = run([P("A", 0, [1]), P("B", 0, [1])], "fcfs", cs=0)
    assert r["metrics"]["system"]["context_switches"] == 1
    assert r["metrics"]["system"]["context_switch_overhead"] == 0


# ---------------------------------------------------------------- Priority
def test_priority_nonpreemptive_classic():
    w = [P("P1", 0, [10], 3), P("P2", 0, [1], 1), P("P3", 0, [2], 4), P("P4", 0, [1], 5), P("P5", 0, [5], 2)]
    r = run(w, "priority")
    assert runs(r) == [("P2", 0, 1), ("P5", 1, 6), ("P1", 6, 16), ("P3", 16, 18), ("P4", 18, 19)]
    assert r["metrics"]["system"]["ready_wait"]["mean"] == 8.2


def test_priority_preemptive_and_tie():
    w = [P("A", 0, [5], 2), P("C", 1, [2], 2), P("B", 2, [2], 1)]
    r = run(w, "priority", {"preemptive": True})
    # C ties with A at t=1 -> no preemption; B (1) preempts A at t=2. At t=4 A and C tie
    # on priority 2; C entered the ready queue at t=1, before A was requeued at t=2.
    assert runs(r) == [("A", 0, 2), ("B", 2, 4), ("C", 4, 6), ("A", 6, 9)]


def test_priority_nonpreemptive_ignores_higher_arrival():
    r = run([P("A", 0, [5], 2), P("B", 2, [2], 1)], "priority", {"preemptive": False})
    assert runs(r) == [("A", 0, 5), ("B", 5, 7)]


def test_priority_aging_changes_order():
    w = [P("A", 0, [4], 0), P("B", 0, [1], 3), P("C", 2, [4], 1)]
    assert runs(run(w, "priority"))[1:] == [("C", 4, 8), ("B", 8, 9)]
    aged = run(w, "priority", {"aging_interval": 1})
    # t=4: B aged 3-4 -> 0, C aged 1-2 -> 0; tie -> B was queued first.
    assert runs(aged)[1:] == [("B", 4, 5), ("C", 5, 9)]
    d = aged["decisions"][1]
    assert "ageing" in d["explanation"]


# ---------------------------------------------------------------- MLFQ
def test_mlfq_demotion_and_preemption():
    r = run([P("A", 0, [10]), P("B", 3, [2])], "mlfq", {"quanta": [2, 4, 8], "boost_interval": 0})
    assert runs(r) == [("A", 0, 2), ("A", 2, 3), ("B", 3, 5), ("A", 5, 9), ("A", 9, 12)]
    levels = [(d["time"], d["selected"], d["quantum"]) for d in r["decisions"]]
    assert levels == [(0, "A", 2), (2, "A", 4), (3, "B", 2), (5, "A", 4), (9, "A", 8)]


def test_mlfq_lower_level_never_runs_while_higher_ready():
    w = [P("A", 0, [6]), P("B", 0, [6]), P("C", 4, [1])]
    r = run(w, "mlfq", {"quanta": [2, 4, 8], "boost_interval": 0})
    # A 0-2 (->L1), B 2-4 (->L1), C arrives at 4 at L0 and must run before A/B.
    assert runs(r)[:3] == [("A", 0, 2), ("B", 2, 4), ("C", 4, 5)]


def test_mlfq_io_keeps_level():
    r = run([P("A", 0, [1, 2, 1]), P("B", 0, [5])], "mlfq", {"quanta": [2, 4, 8], "boost_interval": 0})
    # A blocks at 1 before its slice ends -> stays L0 and preempts demoted B at t=3.
    assert runs(r) == [("A", 0, 1), ("B", 1, 3), ("A", 3, 4), ("B", 4, 7)]


def test_mlfq_periodic_boost():
    r = run([P("A", 0, [20])], "mlfq", {"quanta": [2, 2, 2], "boost_interval": 5})
    boost_frames = [f for f in r["frames"] if any(e["type"] == "boost" for e in f["events"])]
    assert boost_frames and boost_frames[0]["time"] == 5
    assert boost_frames[0]["procs"][0]["level"] == 0
    # The slice restarts at the boost (t=5, level-0 quantum 2) -> expires at 7, dispatched at level 1.
    d7 = next(d for d in r["decisions"] if d["time"] == 7)
    assert d7["candidates"][0]["level"] == 1


# ---------------------------------------------------------------- AQS
AQS = {"base_quantum": 4, "min_quantum": 2, "max_quantum": 12, "step": 1, "high_load": 4,
       "low_load": 1, "overhead_limit": 0.2, "window": 5}


def test_aqs_shrinks_under_load():
    w = [P(f"P{i}", 0, [10]) for i in range(6)]
    r = run(w, "aqs", AQS)
    first = r["decisions"][0]["aqs"]
    assert first["signal"] == "latency_pressure" and first["ready_length"] == 5
    assert (first["previous_quantum"], first["new_quantum"]) == (4, 3)
    assert runs(r)[0] == ("P0", 0, 3)


def test_aqs_grows_under_light_load_and_is_bounded():
    r = run([P("A", 0, [100])], "aqs", AQS)
    quanta = [d["quantum"] for d in r["decisions"]]
    assert quanta[:9] == [5, 6, 7, 8, 9, 10, 11, 12, 12]
    assert all(AQS["min_quantum"] <= q <= AQS["max_quantum"] for q in quanta)
    assert r["decisions"][7]["aqs"]["adjusted"] is True and r["decisions"][8]["aqs"]["adjusted"] is False


def test_aqs_overhead_pressure():
    w = [P(f"P{i}", 0, [20]) for i in range(5)]
    r = run(w, "aqs", {**AQS, "high_load": 3}, cs=3)
    signals = [d["aqs"]["signal"] for d in r["decisions"]]
    assert "overhead_pressure" in signals
    steps = [abs(d["aqs"]["new_quantum"] - d["aqs"]["previous_quantum"]) for d in r["decisions"]]
    assert max(steps) <= AQS["step"]


def test_aqs_differs_from_round_robin():
    w = [P(f"P{i}", 0, [10]) for i in range(6)]
    assert runs(run(w, "aqs", AQS)) != runs(run(w, "rr", {"quantum": 4}))


# ---------------------------------------------------------------- Explanations
def test_explanations_reference_recorded_state():
    r = run(CLASSIC, "sjf")
    d = next(d for d in r["decisions"] if d["time"] == 12)
    assert d["selected"] == "P4" and "5 tu" in d["explanation"]
    assert sorted(d["ready_queue"]) == ["P3", "P4"]
    assert {c["pid"]: c["burst"] for c in d["candidates"]} == {"P3": 9, "P4": 5}
