"""Mutation check: deliberately break the engine / codec one way at a time; the test suite must fail each time.

    backend\\.venv\\Scripts\\python.exe scripts\\mutation_check.py

Each mutant patches one line of source, runs the backend tests (stopping at the first failure), and ALWAYS
restores the original file. A mutant that survives means a gap in the tests. Exit code 1 if any survives.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "backend"

AQS_RULE = '        if rho > p["overhead_limit"]:\n            signal, target = "overhead_pressure", prev + p["step"]\n'

# (name, file, original text, mutated text)
MUTANTS = [
    ("MLFQ demotes on block too", "app/algorithms/adaptive.py",
     'if reason == "quantum":\n            pcb.level', 'if reason in ("quantum", "block"):\n            pcb.level'),
    ("MLFQ boost interval off by one", "app/algorithms/adaptive.py", "sim.time % s == 0", "(sim.time + 1) % s == 0"),
    ("MLFQ preempts on equal level", "app/algorithms/adaptive.py", "if best.level < running.level:", "if best.level <= running.level:"),
    ("AQS overhead rule disabled", "app/algorithms/adaptive.py", AQS_RULE, AQS_RULE.replace("if rho >", "if False and rho >")),
    ("AQS step doubled", "app/algorithms/adaptive.py",
     'new = max(p["min_quantum"], min(p["max_quantum"], target))',
     'new = max(p["min_quantum"], min(p["max_quantum"], prev + 2 * (target - prev)))'),
    ("AQS window ignores overhead", "app/algorithms/adaptive.py", "self.window.append((overhead, ran))", "self.window.append((0, ran))"),
    ("Switch counted for the same process", "app/engine/simulator.py",
     "needs_switch = last_ran is not None and last_ran is not pcb", "needs_switch = last_ran is not None"),
    ("SRTF preempts on ties", "app/algorithms/classic.py", "if best.remaining < running.remaining:", "if best.remaining <= running.remaining:"),
    ("Priority ageing off by one", "app/algorithms/classic.py", "(sim.time - pcb.ready_since) // ai", "(sim.time - pcb.ready_since + 1) // ai"),
    ("Requeue before arrivals at the same instant", "app/engine/simulator.py", "            # 3. arrivals\n",
     "            if expired is not None:\n                transition(expired, 'ready', 'quantum_expire', events)\n"
     "                self._enter_ready(expired, 'quantum')\n                expired = None\n            # 3. arrivals\n"),
    # compact codec
    ("Codec: encoder stops emitting changed rows", "app/engine/compact.py",
     'if prev_rows is None or _predict(prev_rows[i], f["time"] - prev_t) != r]', "if prev_rows is None]"),
    ("Codec: decoder prepends ready additions", "app/engine/compact.py",
     'ready = [p for p in ready if p not in gone] + [pids[i] for i in it["ad"]]',
     'ready = [pids[i] for i in it["ad"]] + [p for p in ready if p not in gone]'),
    ("Codec: blocked I/O taken from cpu_left", "app/engine/compact.py",
     '"blocked": [{"pid": pids[i], "io_remaining": r[2]}', '"blocked": [{"pid": pids[i], "io_remaining": r[3]}'),
    ("Codec: ready_wait ignores elapsed time (size guard)", "app/engine/compact.py", "        r[6] += dt\n", "        r[6] += 0\n"),
    ("Codec: decision blocked list from the wrong frame", "app/engine/compact.py",
     'd["blocked"] = list(frames[d["frame_index"]]["blocked"])', 'd["blocked"] = list(frames[max(0, d["frame_index"] - 1)]["blocked"])'),
]


def pytest(extra: list[str] | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", *(extra or [])], cwd=ROOT, capture_output=True, text=True)


def main() -> int:
    survivors = []
    for name, rel, old, new in MUTANTS:
        path = ROOT / rel
        original = path.read_text(encoding="utf-8")
        if old not in original:
            print(f"[SKIP    ] {name}: pattern not found (source changed?)")
            survivors.append(name + " (pattern missing)")
            continue
        backup = path.with_suffix(path.suffix + ".mutbak")
        shutil.copy(path, backup)
        try:
            path.write_text(original.replace(old, new, 1), encoding="utf-8")
            caught = pytest().returncode != 0
        finally:
            shutil.copy(backup, path)
            backup.unlink()
        print(f"[{'CAUGHT  ' if caught else 'SURVIVED'}] {name}")
        if not caught:
            survivors.append(name)
    final = pytest()
    print("originals restored; full suite:", final.stdout.strip().splitlines()[-1])
    print("survivors:", survivors or "none")
    return 1 if survivors or final.returncode != 0 else 0


if __name__ == "__main__":
    sys.exit(main())
