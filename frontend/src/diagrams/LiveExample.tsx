import { useEffect, useState } from "react";
import { GanttChart } from "../charts/GanttChart";
import { Spinner } from "../components/ui";
import { configLabel } from "../lib/algorithms";
import { fmt } from "../lib/format";
import { api, ApiError } from "../services/api";
import type { CompareResult, Process, SchedulerConfig } from "../types";

/**
 * Runs a small workload through the real engine and draws the resulting
 * schedules, so educational examples can never drift from the implementation.
 */
export function LiveExample({ workload, configs, labels, metrics = ["avg_response", "avg_ready_wait", "context_switches"] }: {
  workload: Process[]; configs: SchedulerConfig[]; labels?: string[]; metrics?: string[];
}) {
  const [res, setRes] = useState<CompareResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = JSON.stringify([workload, configs]);
  useEffect(() => {
    let alive = true;
    setErr(null);
    const cfgs = configs.length === 1 ? [configs[0], configs[0]] : configs;
    api.compare(workload, cfgs).then((r) => alive && setRes(r), (e: ApiError) => alive && setErr(e.messages.join(" ")));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (err) return <p className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-fg-faint">Live example unavailable: {err}</p>;
  if (!res) return <Spinner label="Running the engine…" />;
  const runs = configs.length === 1 ? res.runs.slice(0, 1) : res.runs;
  const domain = Math.max(...runs.map((r) => r.end_time));
  const names: Record<string, string> = { avg_response: "avg response", avg_ready_wait: "avg wait", context_switches: "switches", avg_turnaround: "avg turnaround" };
  return (
    <div className="space-y-3">
      {runs.map((r, i) => (
        <div key={i}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-fg">{labels?.[i] ?? configLabel(configs[i])}</span>
            <span className="font-mono text-[11px] text-fg-faint">{metrics.map((m) => `${names[m] ?? m} ${fmt(r.summary[m])}`).join(" · ")}</span>
          </div>
          <GanttChart segments={r.segments} endTime={r.end_time} domainEnd={domain} pids={workload.map((p) => p.pid)} lanes={false} compact showControls={false} title={labels?.[i] ?? r.algorithm} />
        </div>
      ))}
      <p className="text-[10.5px] text-fg-faint">Computed live by the SchedX engine.</p>
    </div>
  );
}
