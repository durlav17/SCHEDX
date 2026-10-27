export function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(digits);
}

export function fmtMetric(key: string, v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (key === "cpu_utilization" || key === "overhead_fraction") return `${(v * 100).toFixed(1)}%`;
  if (key === "throughput") return v.toFixed(3);
  if (key === "fairness") return v.toFixed(3);
  return fmt(v);
}

export function fmtPct(p: number | null | undefined): string {
  if (p === null || p === undefined) return "n/a";
  const s = p > 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}
