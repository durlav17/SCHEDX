import type { Process } from "../types";

/** Editable row. `id` is a stable key independent of array position and PID. */
export interface ProcessRow {
  id: string;
  pid: string;
  arrival: string;
  bursts: string; // "cpu, io, cpu, ..."
  priority: string;
}

let counter = 0;
export const newRowId = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

export function toRows(ps: Process[]): ProcessRow[] {
  return ps.map((p) => ({
    id: newRowId(),
    pid: p.pid,
    arrival: String(p.arrival),
    bursts: p.bursts.join(", "),
    priority: String(p.priority),
  }));
}

const INT = /^\d+$/;

export interface RowErrors {
  pid?: string;
  arrival?: string;
  bursts?: string;
  priority?: string;
}

/** Mirrors the engine's validation so problems are shown before a request is sent.
 *  Nothing is silently corrected: invalid rows block the run. */
export function validateRows(rows: ProcessRow[]): { processes: Process[]; errors: Record<string, RowErrors>; valid: boolean } {
  const errors: Record<string, RowErrors> = {};
  const processes: Process[] = [];
  const seen = new Map<string, number>();
  rows.forEach((r) => seen.set(r.pid.trim(), (seen.get(r.pid.trim()) ?? 0) + 1));
  for (const r of rows) {
    const e: RowErrors = {};
    const pid = r.pid.trim();
    if (!pid) e.pid = "Required";
    else if (pid.length > 16) e.pid = "Max 16 characters";
    else if ((seen.get(pid) ?? 0) > 1) e.pid = "Duplicate ID";

    const arrival = r.arrival.trim();
    if (!INT.test(arrival)) e.arrival = "Non-negative integer";
    else if (Number(arrival) > 10000) e.arrival = "Max 10000";

    const parts = r.bursts.split(/[\s,]+/).filter(Boolean);
    if (!parts.length) e.bursts = "At least one CPU burst";
    else if (parts.some((x) => !INT.test(x) || Number(x) === 0)) e.bursts = "Positive integers only";
    else if (parts.length % 2 === 0) e.bursts = "Must end with a CPU burst (odd count)";
    else if (parts.length > 41) e.bursts = "At most 41 values";
    else if (parts.some((x) => Number(x) > 1000)) e.bursts = "Max 1000 per burst";

    const pr = r.priority.trim() || "0";
    if (!INT.test(pr) || Number(pr) > 99) e.priority = "0–99";

    if (Object.keys(e).length) errors[r.id] = e;
    else processes.push({ pid, arrival: Number(arrival), bursts: parts.map(Number), priority: Number(pr) });
  }
  if (rows.length > 100) errors["_"] = { pid: "At most 100 processes" };
  return { processes, errors, valid: rows.length > 0 && Object.keys(errors).length === 0 };
}

export function nextPid(rows: ProcessRow[]): string {
  const used = new Set(rows.map((r) => r.pid.trim()));
  let i = rows.length + 1;
  while (used.has(`P${i}`)) i++;
  return `P${i}`;
}
