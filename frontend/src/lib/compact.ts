import type { Decision, Frame, FrameEvent, ProcState, SimulationResult, Transition } from "../types";

/**
 * Decoder for the lossless "schedx-compact-1" result format (backend/app/engine/compact.py).
 * The per-event process snapshots grow with events x processes (about 75 MB for 100 processes), so the
 * server sends only the rows whose values differ from a simple prediction. The result is the same
 * SimulationResult the rest of the UI already uses; reverse stepping still shows exact recorded states.
 */
export const COMPACT_FORMAT = "schedx-compact-1";

const STATES: ProcState[] = ["new", "ready", "dispatching", "running", "blocked", "terminated"];

type Row = [number, number, number, number, number, number, number]; // state, burst_index, remaining, cpu_left, level, eff_priority, ready_wait

interface CompactFrame {
  t: number;
  q: number | null;
  su: number;
  d: number | null;
  ev: FrameEvent[];
  rw: number[][]; // [procIndex, ...Row]
  rm?: number[];
  ad?: number[];
  rd?: number[];
}

export interface CompactResult extends Omit<SimulationResult, "frames" | "decisions" | "transitions"> {
  format: typeof COMPACT_FORMAT;
  pids: string[];
  frames: { items: CompactFrame[] };
  decisions: { cols: string[]; cand_cols: string[]; rows: unknown[][] };
}

export function isCompact(x: unknown): x is CompactResult {
  return typeof x === "object" && x !== null && (x as { format?: string }).format === COMPACT_FORMAT;
}

/** How a process row evolves between two frames when nothing happens to it (must match the Python encoder). */
function predict(r: Row, dt: number): Row {
  const out = [...r] as Row;
  switch (STATES[r[0]]) {
    case "ready": out[6] += dt; break;
    case "running": out[2] -= dt; out[3] -= dt; break;
    case "blocked": out[2] -= dt; break;
  }
  return out;
}

const wires = new WeakMap<object, CompactResult>();
/** The compact wire object a decoded result came from (used for compact, faithful JSON export). */
export function wireOf(result: SimulationResult): CompactResult | undefined {
  return wires.get(result);
}

export function expandResult(c: CompactResult): SimulationResult {
  const { pids } = c;
  const frames: Frame[] = [];
  let rows: Row[] | null = null;
  let prevT = 0;
  let ready: string[] = [];
  for (const it of c.frames.items) {
    rows = rows ? rows.map((r) => predict(r, it.t - prevT)) : pids.map(() => [0, 0, 0, 0, 0, 0, 0] as Row);
    for (const rw of it.rw) rows[rw[0]] = rw.slice(1) as Row;
    if (it.rd) ready = it.rd.map((i) => pids[i]);
    else {
      const gone = new Set((it.rm ?? []).map((i) => pids[i]));
      ready = ready.filter((p) => !gone.has(p)).concat((it.ad ?? []).map((i) => pids[i]));
    }
    const cur = rows;
    const state = (i: number) => STATES[cur[i][0]];
    const running = pids.find((_, i) => state(i) === "running") ?? null;
    const dispatching = pids.find((_, i) => state(i) === "dispatching") ?? null;
    frames.push({
      time: it.t,
      running,
      dispatching,
      ready,
      blocked: pids.flatMap((pid, i) => (state(i) === "blocked" ? [{ pid, io_remaining: cur[i][2] }] : [])),
      terminated: pids.filter((_, i) => state(i) === "terminated"),
      quantum: it.q,
      slice_used: it.su,
      procs: cur.map((r, i) => ({
        pid: pids[i], state: STATES[r[0]], burst_index: r[1], remaining: r[2], cpu_left: r[3],
        level: r[4], eff_priority: r[5], ready_wait: r[6],
      })),
      events: it.ev,
      decision_id: it.d,
    });
    prevT = it.t;
  }

  const { cols, cand_cols, rows: drows } = c.decisions;
  const decisions: Decision[] = drows.map((row, n) => {
    const d: Record<string, unknown> = {};
    cols.forEach((name, k) => { d[name] = row[k]; });
    const cands = (row[row.length - 1] as unknown[][]).map((r) => Object.fromEntries(cand_cols.map((k, j) => [k, r[j]])));
    d.id = n;
    d.candidates = cands;
    d.ready_queue = cands.map((x) => x.pid);
    d.blocked = frames.length ? [...frames[d.frame_index as number].blocked] : [];
    d.algorithm = c.algorithm;
    d.params = c.params;
    return d as unknown as Decision;
  });

  const transitions: Transition[] = frames.flatMap((f) =>
    f.events.filter((e) => e.from !== undefined).map((e) => ({
      time: f.time, pid: e.pid as string, from: e.from as ProcState, to: e.to as ProcState, cause: e.type,
    })),
  );

  const { format: _f, pids: _p, frames: _fr, decisions: _d, ...rest } = c;
  const result: SimulationResult = { ...rest, frames, decisions, transitions } as SimulationResult;
  wires.set(result, c);
  return result;
}
