"""Lossless compact encoding of a simulation result ("schedx-compact-1").

Why: every scheduling event stores a snapshot of all N processes, so the full result grows with
(events x processes): about 61 MB for 100 processes. Most per-process values change predictably
between events, so the compact form stores a process row only where the real value differs from a
simple prediction, plus ready-queue deltas. Nothing is lost: ``expand_result(compact_result(r)) == r``
(tests/test_compact.py proves this for every algorithm, preset and switch cost).

Prediction rule between two frames Δt apart, for a process whose state did not change:
  ready    -> ready_wait += Δt          running -> remaining -= Δt, cpu_left -= Δt
  blocked  -> remaining -= Δt           other states -> unchanged
The encoder only *compares* the prediction with the real row, so an imperfect rule would cost bytes,
never correctness.

Derived instead of stored: running/dispatching process, blocked and terminated lists (from process
states), the ready queue at each decision (from the candidate list), a decision's blocked snapshot
(from its frame), per-decision algorithm/params (top-level), and ``transitions`` (from frame events).
"""
from __future__ import annotations

from typing import Any

FORMAT = "schedx-compact-1"
STATES = ["new", "ready", "dispatching", "running", "blocked", "terminated"]
_SIDX = {s: i for i, s in enumerate(STATES)}
ROW_FIELDS = ["state", "burst_index", "remaining", "cpu_left", "level", "eff_priority", "ready_wait"]
DECISION_COLS = ["time", "frame_index", "selected", "previous_process", "previous_outcome", "preempted",
                 "preemption_reason", "selected_remaining", "selected_cpu_left", "rule", "explanation",
                 "quantum", "context_switch", "aqs"]
TRACE_KEYS = ("frames", "decisions", "transitions")


def _predict(row: list[int], dt: int) -> list[int]:
    r = list(row)
    s = STATES[r[0]]
    if s == "ready":
        r[6] += dt
    elif s == "running":
        r[2] -= dt
        r[3] -= dt
    elif s == "blocked":
        r[2] -= dt
    return r


def compact_result(res: dict[str, Any]) -> dict[str, Any]:
    pids = [p["pid"] for p in res["workload"]]
    idx = {p: i for i, p in enumerate(pids)}
    out = {k: v for k, v in res.items() if k not in TRACE_KEYS}
    out["format"] = FORMAT
    out["pids"] = pids

    items: list[dict[str, Any]] = []
    prev_rows: list[list[int]] | None = None
    prev_t = 0
    prev_ready: list[str] = []
    for f in res["frames"]:
        assert [p["pid"] for p in f["procs"]] == pids
        rows = [[_SIDX[p["state"]], p["burst_index"], p["remaining"], p["cpu_left"], p["level"],
                 p["eff_priority"], p["ready_wait"]] for p in f["procs"]]
        changed = [[i] + r for i, r in enumerate(rows)
                   if prev_rows is None or _predict(prev_rows[i], f["time"] - prev_t) != r]
        item: dict[str, Any] = {"t": f["time"], "q": f["quantum"], "su": f["slice_used"],
                                "d": f["decision_id"], "ev": f["events"], "rw": changed}
        cur = f["ready"]
        keep = [p for p in prev_ready if p in set(cur)]
        if cur[: len(keep)] == keep:
            item["rm"] = [idx[p] for p in prev_ready if p not in set(cur)]
            item["ad"] = [idx[p] for p in cur[len(keep):]]
        else:  # a process left and re-entered the queue between two frames: store the list in full
            item["rd"] = [idx[p] for p in cur]
        items.append(item)
        prev_rows, prev_t, prev_ready = rows, f["time"], cur
    out["frames"] = {"states": STATES, "row_fields": ROW_FIELDS, "items": items}

    decisions = res["decisions"]
    cand_cols: list[str] = list(decisions[0]["candidates"][0].keys()) if decisions and decisions[0]["candidates"] else []
    drows = []
    for d in decisions:
        assert d["ready_queue"] == [c["pid"] for c in d["candidates"]]
        assert all(list(c.keys()) == cand_cols for c in d["candidates"])
        drows.append([d[c] for c in DECISION_COLS] + [[[c[k] for k in cand_cols] for c in d["candidates"]]])
    out["decisions"] = {"cols": DECISION_COLS, "cand_cols": cand_cols, "rows": drows}
    return out


def expand_result(c: dict[str, Any]) -> dict[str, Any]:
    assert c.get("format") == FORMAT
    pids: list[str] = c["pids"]
    res = {k: v for k, v in c.items() if k not in ("format", "pids", "frames", "decisions")}

    frames: list[dict[str, Any]] = []
    rows: list[list[int]] | None = None
    prev_t = 0
    ready: list[str] = []
    for it in c["frames"]["items"]:
        if rows is None:
            rows = [[0] * 7 for _ in pids]
        else:
            rows = [_predict(r, it["t"] - prev_t) for r in rows]
        for rw in it["rw"]:
            rows[rw[0]] = rw[1:]
        if "rd" in it:
            ready = [pids[i] for i in it["rd"]]
        else:
            gone = {pids[i] for i in it["rm"]}
            ready = [p for p in ready if p not in gone] + [pids[i] for i in it["ad"]]
        states = [STATES[r[0]] for r in rows]
        running = [pids[i] for i, s in enumerate(states) if s == "running"]
        switching = [pids[i] for i, s in enumerate(states) if s == "dispatching"]
        assert len(running) <= 1 and len(switching) <= 1
        frames.append({
            "time": it["t"],
            "running": running[0] if running else None,
            "dispatching": switching[0] if switching else None,
            "ready": ready,
            "blocked": [{"pid": pids[i], "io_remaining": r[2]} for i, r in enumerate(rows) if states[i] == "blocked"],
            "terminated": [pids[i] for i, s in enumerate(states) if s == "terminated"],
            "quantum": it["q"],
            "slice_used": it["su"],
            "procs": [dict(zip(["pid"] + ROW_FIELDS, [pids[i], states[i]] + r[1:])) for i, r in enumerate(rows)],
            "events": it["ev"],
            "decision_id": it["d"],
        })
        prev_t = it["t"]
    res["frames"] = frames

    cand_cols = c["decisions"]["cand_cols"]
    decisions = []
    for n, row in enumerate(c["decisions"]["rows"]):
        d = dict(zip(c["decisions"]["cols"], row[:-1]))
        cands = [dict(zip(cand_cols, r)) for r in row[-1]]
        d["id"] = n
        d["ready_queue"] = [x["pid"] for x in cands]
        d["candidates"] = cands
        d["blocked"] = list(frames[d["frame_index"]]["blocked"]) if frames else []
        d["algorithm"] = c["algorithm"]
        d["params"] = c["params"]
        decisions.append(d)
    res["decisions"] = decisions

    transitions = []
    for f in frames:
        for e in f["events"]:
            if "from" in e:
                transitions.append({"time": f["time"], "pid": e["pid"], "from": e["from"], "to": e["to"], "cause": e["type"]})
    res["transitions"] = transitions
    return res


def summary_result(res: dict[str, Any]) -> dict[str, Any]:
    """Segments and metrics only: no per-event trace (for large runs that need no replay)."""
    out = {k: v for k, v in res.items() if k not in TRACE_KEYS and k != "state_intervals"}
    out["frames"], out["decisions"], out["transitions"], out["state_intervals"] = [], [], [], {}
    out["format"] = "schedx-summary-1"
    return out
