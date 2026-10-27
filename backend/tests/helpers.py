from app.engine.models import SimConfig
from app.engine.simulator import simulate


def P(pid, arrival, bursts, priority=0):
    return {"pid": pid, "arrival": arrival, "bursts": list(bursts), "priority": priority}


def run(workload, algo, params=None, cs=0, **kw):
    return simulate(workload, SimConfig(algo, params or {}, cs, **kw))


def runs(result):
    """CPU execution segments as (pid, start, end)."""
    return [(s["pid"], s["start"], s["end"]) for s in result["segments"] if s["kind"] == "run"]


def timeline(result):
    return [(s["kind"], s["pid"], s["start"], s["end"]) for s in result["segments"]]


def proc(result, pid):
    return next(p for p in result["metrics"]["processes"] if p["pid"] == pid)


CLASSIC = [P("P1", 0, [8]), P("P2", 1, [4]), P("P3", 2, [9]), P("P4", 3, [5])]
