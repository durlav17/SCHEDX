"""SQLite persistence for saved experiments (standard-library sqlite3)."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "schedx.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS experiments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    kind        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    seed        INTEGER,
    workload    TEXT    NOT NULL,
    generator   TEXT,
    config      TEXT    NOT NULL,
    results     TEXT    NOT NULL,
    notes       TEXT,
    summary       TEXT,
    process_count INTEGER
);
"""
# Columns added after the first release: the history list reads only these small columns instead of
# parsing every experiment's full stored results.
LIGHT_COLUMNS = "id, name, kind, created_at, seed, config, notes, summary, process_count"


class ExperimentStore:
    def __init__(self, path: Optional[str | Path] = None):
        self.path = str(path or os.environ.get("SCHEDX_DB") or DEFAULT_DB)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        # One connection is shared by FastAPI's worker threads: serialise access so transactions never interleave.
        self._lock = threading.RLock()
        self._conn.row_factory = sqlite3.Row
        self._conn.execute(SCHEMA)
        self._migrate()
        self._conn.commit()

    def _migrate(self) -> None:
        """Upgrade a database created by an earlier version (no summary / process_count columns), keeping its rows."""
        cols = {r["name"] for r in self._conn.execute("PRAGMA table_info(experiments)")}
        for name, ddl in (("summary", "TEXT"), ("process_count", "INTEGER")):
            if name not in cols:
                self._conn.execute(f"ALTER TABLE experiments ADD COLUMN {name} {ddl}")
        rows = self._conn.execute("SELECT id, workload, results FROM experiments WHERE process_count IS NULL").fetchall()
        for r in rows:
            summary = json.loads(r["results"]).get("summary")
            self._conn.execute("UPDATE experiments SET summary = ?, process_count = ? WHERE id = ?",
                               (json.dumps(summary), len(json.loads(r["workload"])), r["id"]))

    @staticmethod
    def _row(row: sqlite3.Row, full: bool) -> dict[str, Any]:
        d = {
            "id": row["id"],
            "name": row["name"],
            "kind": row["kind"],
            "created_at": row["created_at"],
            "seed": row["seed"],
            "config": json.loads(row["config"]),
            "notes": row["notes"],
            "summary": json.loads(row["summary"]) if row["summary"] else None,
        }
        if full:
            d["workload"] = json.loads(row["workload"])
            d["generator"] = json.loads(row["generator"]) if row["generator"] else None
            d["results"] = json.loads(row["results"])
            d["summary"] = d["results"].get("summary")
        else:
            d["process_count"] = row["process_count"]
        return d

    def create(self, name: str, kind: str, workload: list, config: dict, results: dict,
               seed: Optional[int] = None, generator: Optional[dict] = None, notes: Optional[str] = None) -> dict:
        with self._lock:
            now = datetime.now(timezone.utc).isoformat(timespec="seconds")
            cur = self._conn.execute(
                "INSERT INTO experiments (name, kind, created_at, seed, workload, generator, config, results, notes,"
                " summary, process_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (name, kind, now, seed, json.dumps(workload), json.dumps(generator) if generator else None,
                 json.dumps(config), json.dumps(results), notes, json.dumps(results.get("summary")), len(workload)),
            )
            self._conn.commit()
            return self.get(cur.lastrowid)

    def list(self, limit: Optional[int] = None, offset: int = 0) -> list[dict]:
        """Newest first. Reads only the light columns, so cost does not grow with the stored result sizes."""
        with self._lock:
            sql = f"SELECT {LIGHT_COLUMNS} FROM experiments ORDER BY id DESC"
            args: tuple = ()
            if limit is not None:
                sql += " LIMIT ? OFFSET ?"
                args = (limit, offset)
            return [self._row(r, full=False) for r in self._conn.execute(sql, args).fetchall()]

    def count(self) -> int:
        with self._lock:
            return self._conn.execute("SELECT COUNT(*) FROM experiments").fetchone()[0]

    def get(self, exp_id: int) -> Optional[dict]:
        with self._lock:
            row = self._conn.execute("SELECT * FROM experiments WHERE id = ?", (exp_id,)).fetchone()
            return self._row(row, full=True) if row else None

    def rename(self, exp_id: int, name: str) -> Optional[dict]:
        with self._lock:
            cur = self._conn.execute("UPDATE experiments SET name = ? WHERE id = ?", (name, exp_id))
            self._conn.commit()
            return self.get(exp_id) if cur.rowcount else None

    def delete(self, exp_id: int) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM experiments WHERE id = ?", (exp_id,))
            self._conn.commit()
            return cur.rowcount > 0

