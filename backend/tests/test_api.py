import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import CLASSIC


@pytest.fixture()
def client(tmp_path):
    return TestClient(create_app(str(tmp_path / "test.db")))


def test_health_and_algorithms(client):
    assert client.get("/api/health").json()["status"] == "ok"
    algos = client.get("/api/algorithms").json()
    assert [a["key"] for a in algos["algorithms"]] == ["fcfs", "sjf", "srtf", "rr", "priority", "mlfq", "aqs"]
    assert "Smaller" in algos["priority_convention"]


def test_presets(client):
    data = client.get("/api/presets").json()
    keys = {p["key"] for p in data["presets"]}
    assert {"demo", "io_demo", "cpu_bound", "io_heavy", "interactive", "mixed", "high_load"} <= keys


def test_run_simulation(client):
    r = client.post("/api/simulations/run", json={"workload": CLASSIC, "algorithm": "srtf"})
    assert r.status_code == 200
    body = r.json()
    assert body["metrics"]["system"]["ready_wait"]["mean"] == 6.5
    assert body["frames"] and body["decisions"]


def test_structured_validation_errors(client):
    r = client.post("/api/simulations/run", json={"workload": [], "algorithm": "fcfs"})
    assert r.status_code == 422
    assert r.json()["error"]["type"] == "validation_error"
    r = client.post("/api/simulations/run", json={"workload": "x", "algorithm": "fcfs"})
    assert r.status_code == 422 and r.json()["error"]["messages"]
    r = client.post("/api/simulations/run", json={"workload": CLASSIC, "algorithm": "rr", "params": {"quantum": 0}})
    assert r.status_code == 422 and "quantum" in r.json()["error"]["messages"][0]


def test_compare(client):
    r = client.post("/api/experiments/compare", json={
        "workload": CLASSIC,
        "configs": [{"algorithm": "fcfs", "label": "A"}, {"algorithm": "rr", "params": {"quantum": 2}}],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["runs"][0]["label"] == "A" and len(body["runs"]) == 2
    assert body["runs"][0]["frames"] == []


def test_generate(client):
    r = client.post("/api/workloads/generate", json={"generator": {"count": 5, "seed": 3}})
    assert r.status_code == 200 and len(r.json()["processes"]) == 5
    assert client.post("/api/workloads/generate", json={"generator": {"count": 999}}).status_code == 422


def test_sweep(client):
    r = client.post("/api/experiments/sweep", json={
        "config": {"algorithm": "rr", "params": {"quantum": 2}},
        "parameter": "quantum", "values": [1, 2, 3], "workload": CLASSIC})
    assert r.status_code == 200 and len(r.json()["points"]) == 3


def test_experiment_crud_and_reproduce(client):
    body = {"name": "classic", "kind": "comparison", "workload": CLASSIC,
            "configs": [{"algorithm": "fcfs"}, {"algorithm": "sjf"}]}
    r = client.post("/api/experiments", json=body)
    assert r.status_code == 201
    exp = r.json()
    assert exp["results"]["summary"]["runs"][1]["avg_ready_wait"] == 7.75
    listed = client.get("/api/experiments").json()["experiments"]
    assert len(listed) == 1 and listed[0]["process_count"] == 4
    assert client.patch(f"/api/experiments/{exp['id']}", json={"name": "renamed"}).json()["name"] == "renamed"
    rep = client.post(f"/api/experiments/{exp['id']}/reproduce").json()
    assert rep["identical"] is True
    assert client.delete(f"/api/experiments/{exp['id']}").status_code == 200
    assert client.get(f"/api/experiments/{exp['id']}").status_code == 404
    assert client.delete("/api/experiments/999").json()["error"]["type"] == "http_error"


def test_generated_and_sweep_experiments(client):
    r = client.post("/api/experiments", json={"name": "gen", "kind": "simulation",
                                              "generator": {"count": 6, "seed": 9},
                                              "configs": [{"algorithm": "aqs"}]})
    assert r.status_code == 201 and r.json()["seed"] == 9
    r = client.post("/api/experiments", json={"name": "sw", "kind": "sweep", "sweep": {
        "config": {"algorithm": "rr"}, "parameter": "context_switch_cost", "values": [0, 1],
        "generator": {"count": 5, "seed": 2}, "trials": 2}})
    assert r.status_code == 201
    rep = client.post(f"/api/experiments/{r.json()['id']}/reproduce").json()
    assert rep["identical"] is True


def test_persistence_survives_restart(tmp_path):
    db = str(tmp_path / "p.db")
    c1 = TestClient(create_app(db))
    c1.post("/api/experiments", json={"name": "keep", "kind": "simulation", "workload": CLASSIC,
                                      "configs": [{"algorithm": "fcfs"}]})
    c2 = TestClient(create_app(db))
    assert [e["name"] for e in c2.get("/api/experiments").json()["experiments"]] == ["keep"]


# ------------------------------------------------------------ result detail modes and payload size
def test_run_detail_modes(client):
    from app.engine.compact import expand_result

    body = {"workload": CLASSIC, "algorithm": "rr", "params": {"quantum": 2}, "context_switch_cost": 1}
    full = client.post("/api/simulations/run", json=body).json()
    compact = client.post("/api/simulations/run", json={**body, "detail": "compact"}).json()
    summary = client.post("/api/simulations/run", json={**body, "detail": "summary"}).json()
    assert compact["format"] == "schedx-compact-1" and "pids" in compact
    assert expand_result(compact) == full  # lossless through the HTTP layer
    assert summary["frames"] == [] and summary["decisions"] == [] and summary["metrics"] == full["metrics"]
    assert summary["segments"] == full["segments"]
    assert client.post("/api/simulations/run", json={**body, "detail": "bogus"}).status_code == 422


def test_compare_omits_trace_unless_requested(client):
    cfgs = [{"algorithm": "fcfs"}, {"algorithm": "rr", "params": {"quantum": 2}}]
    lean = client.post("/api/experiments/compare", json={"workload": CLASSIC, "configs": cfgs}).json()
    assert all(r["decisions"] == [] and r["frames"] == [] and r["state_intervals"] == {} for r in lean["runs"])
    assert all(r["segments"] and r["summary"] for r in lean["runs"])
    rich = client.post("/api/experiments/compare", json={"workload": CLASSIC, "configs": cfgs, "include_frames": True}).json()
    assert all(r["decisions"] and r["frames"] for r in rich["runs"])
    assert [r["summary"] for r in lean["runs"]] == [r["summary"] for r in rich["runs"]]


def test_large_responses_are_gzip_compressed(client):
    from app.experiments.generator import generate_workload

    w = generate_workload({"count": 40, "seed": 1, "io_fraction": 0.4})
    r = client.post("/api/simulations/run", json={"workload": w, "algorithm": "rr", "params": {"quantum": 2}},
                    headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200 and r.headers.get("content-encoding") == "gzip"


# ------------------------------------------------------------ history list: light reads, paging, migration
def test_history_list_is_light_and_pageable(client):
    for i in range(5):
        client.post("/api/experiments", json={"name": f"e{i}", "kind": "simulation", "workload": CLASSIC,
                                              "configs": [{"algorithm": "fcfs"}]})
    full = client.get("/api/experiments").json()
    assert full["total"] == 5 and [e["name"] for e in full["experiments"]] == ["e4", "e3", "e2", "e1", "e0"]
    assert all("results" not in e and "workload" not in e and e["process_count"] == 4 for e in full["experiments"])
    assert full["experiments"][0]["summary"]["runs"][0]["avg_ready_wait"] == 8.75
    page = client.get("/api/experiments?limit=2&offset=1").json()
    assert [e["name"] for e in page["experiments"]] == ["e3", "e2"] and page["total"] == 5
    assert client.get("/api/experiments?limit=0").status_code == 422


def test_database_from_the_first_release_is_migrated(tmp_path):
    """A database created before the summary/process_count columns existed keeps its rows and gains the columns."""
    import json
    import sqlite3

    from app.persistence.db import ExperimentStore

    path = str(tmp_path / "old.db")
    old = sqlite3.connect(path)
    old.execute("""CREATE TABLE experiments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL,
        created_at TEXT NOT NULL, seed INTEGER, workload TEXT NOT NULL, generator TEXT, config TEXT NOT NULL,
        results TEXT NOT NULL, notes TEXT)""")
    old.execute("INSERT INTO experiments (name, kind, created_at, seed, workload, generator, config, results, notes)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                ("legacy", "simulation", "2026-01-01T00:00:00+00:00", 7, json.dumps(CLASSIC), None,
                 json.dumps({"configs": [{"algorithm": "fcfs"}]}), json.dumps({"summary": {"runs": [{"algorithm": "fcfs"}]}}), None))
    old.commit(); old.close()
    store = ExperimentStore(path)
    row = store.list()[0]
    assert row["name"] == "legacy" and row["process_count"] == 4 and row["summary"] == {"runs": [{"algorithm": "fcfs"}]}
    assert store.get(row["id"])["results"]["summary"]["runs"][0]["algorithm"] == "fcfs"


def test_static_fallback_does_not_serve_files_outside_the_frontend_build(tmp_path):
    """The single-server mode serves frontend/dist; path traversal must never expose backend source."""
    from app.main import FRONTEND_DIST

    if not FRONTEND_DIST.is_dir():
        pytest.skip("frontend/dist is not built")
    c = TestClient(create_app(str(tmp_path / "t.db")))
    for evil in ("/..%2f..%2fbackend%2fapp%2fmain.py", "/%2e%2e/%2e%2e/backend/app/main.py",
                 "/..%5c..%5cbackend%5capp%5cmain.py", "/assets/..%2f..%2f..%2fbackend%2fapp%2fmain.py"):
        r = c.get(evil)
        assert "def create_app" not in r.text, evil
    assert c.get("/definitely/not/a/page").text.lstrip().startswith("<!doctype html>")  # SPA fallback
    assert c.get("/api/nope").status_code == 404


def test_concurrent_saves_do_not_interleave(tmp_path):
    """FastAPI runs sync handlers in worker threads that share one SQLite connection."""
    from concurrent.futures import ThreadPoolExecutor

    client = TestClient(create_app(str(tmp_path / "c.db")))

    def save(i):
        r = client.post("/api/experiments", json={"name": f"c{i}", "kind": "simulation", "workload": CLASSIC,
                                                  "configs": [{"algorithm": "rr", "params": {"quantum": 2}}]})
        return r.status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(save, range(24)))
    assert codes == [201] * 24
    listed = client.get("/api/experiments").json()
    assert listed["total"] == 24 and len({e["name"] for e in listed["experiments"]}) == 24
