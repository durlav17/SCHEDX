"""Deployment configuration: CORS origins, safe startup, production error behaviour."""
import logging

from fastapi.testclient import TestClient

from app.main import LOCAL_ORIGINS, create_app, parse_cors_origins

NETLIFY = "https://schedx-demo.netlify.app"


def client(tmp_path, monkeypatch, origins=None):
    if origins is None:
        monkeypatch.delenv("SCHEDX_CORS_ORIGINS", raising=False)
    else:
        monkeypatch.setenv("SCHEDX_CORS_ORIGINS", origins)
    return TestClient(create_app(str(tmp_path / "d.db")), raise_server_exceptions=False)


def preflight(c, origin):
    return c.options("/api/simulations/run", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                                      "Access-Control-Request-Headers": "content-type"})


def test_parse_defaults_to_local_origins():
    for raw in (None, "", "  ", ",,"):
        assert parse_cors_origins(raw) == LOCAL_ORIGINS


def test_parse_accepts_several_origins_trims_and_deduplicates():
    got = parse_cors_origins(f" {NETLIFY}/ , https://www.example.edu,{NETLIFY},HTTP://Localhost:3000 ")
    assert got == LOCAL_ORIGINS + [NETLIFY, "https://www.example.edu", "http://localhost:3000"]


def test_parse_rejects_wildcards_and_malformed_values_without_raising(caplog):
    bad = ["\x00", "*", "https://*.netlify.app", "netlify.app", "ftp://x.org", "https://", "https://x.org/path", "https://x.org:abc",
           "https://user@x.org", "null", "https://x.org?q=1"]
    with caplog.at_level(logging.WARNING, logger="schedx"):
        assert parse_cors_origins(",".join(bad)) == LOCAL_ORIGINS
    assert len(caplog.records) == len(bad)


def test_configured_origin_is_allowed_and_others_are_not(tmp_path, monkeypatch):
    c = client(tmp_path, monkeypatch, NETLIFY)
    ok = preflight(c, NETLIFY)
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == NETLIFY
    assert "access-control-allow-credentials" not in ok.headers  # no cookies are used
    for origin in ("https://evil.example", "https://schedx-demo.netlify.app.evil.example", "http://schedx-demo.netlify.app"):
        r = preflight(c, origin)
        assert r.status_code == 400 and "access-control-allow-origin" not in r.headers
    # actual (non-preflight) responses carry the header for the allowed origin only
    r = c.get("/api/health", headers={"Origin": NETLIFY})
    assert r.headers["access-control-allow-origin"] == NETLIFY
    assert "access-control-allow-origin" not in c.get("/api/health", headers={"Origin": "https://evil.example"}).headers


def test_local_development_origins_still_work_and_no_wildcard_by_default(tmp_path, monkeypatch):
    c = client(tmp_path, monkeypatch)
    assert preflight(c, "http://localhost:5173").status_code == 200
    r = c.get("/api/health", headers={"Origin": "http://127.0.0.1:5173"})
    assert r.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert preflight(c, NETLIFY).status_code == 400


def test_malformed_setting_does_not_break_startup(tmp_path, monkeypatch):
    c = client(tmp_path, monkeypatch, "*,, https://,%%")
    assert c.get("/api/health").status_code == 200
    assert preflight(c, "https://anything.example").status_code == 400


def test_database_path_comes_from_schedx_db_and_default_is_untracked(tmp_path, monkeypatch):
    target = tmp_path / "disk" / "nested" / "schedx.db"
    monkeypatch.setenv("SCHEDX_DB", str(target))
    c = TestClient(create_app())
    assert c.get("/api/health").status_code == 200 and target.is_file()  # parent directories are created
    from app.persistence.db import DEFAULT_DB
    assert DEFAULT_DB.parent.name == "data"  # covered by .gitignore (backend/data/)


def test_server_errors_are_logged_but_never_leak_details(tmp_path, monkeypatch, caplog):
    c = client(tmp_path, monkeypatch)

    def boom(*a, **k):
        raise RuntimeError("SECRET_TOKEN=hunter2 /srv/private/path")

    c.app.state.store.list = boom
    with caplog.at_level(logging.ERROR, logger="schedx"):
        r = c.get("/api/experiments")
    assert r.status_code == 500
    assert "hunter2" not in r.text and "Traceback" not in r.text and "/srv/private" not in r.text
    assert r.json()["error"]["type"] == "internal_error"
    assert any("hunter2" in (rec.exc_text or "") or rec.exc_info for rec in caplog.records)  # the detail went to the log
