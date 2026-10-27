import { FileBraces, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { GanttChart, GanttLegend } from "../../charts/GanttChart";
import { MetricBars, SeriesLegend, type SeriesRow } from "../../charts/MetricBars";
import { Badge, Button, Card, InfoTip, Segmented, cx } from "../../components/ui";
import { METRIC_INFO } from "../../lib/algorithms";
import { SERIES_COLORS } from "../../lib/colors";
import { fmt, fmtMetric, fmtPct } from "../../lib/format";
import { downloadCSV, downloadJSON, stamp } from "../../services/export";
import type { CompareResult } from "../../types";

export const CHART_METRICS = ["avg_response", "p95_response", "avg_ready_wait", "avg_turnaround", "throughput", "cpu_utilization", "context_switches"];
const TABLE_METRICS = ["avg_response", "p95_response", "avg_ready_wait", "avg_turnaround", "p95_turnaround", "max_ready_wait", "throughput", "cpu_utilization", "context_switches", "context_switch_overhead", "makespan", "starved_count", "fairness"];

export function exportComparison(res: CompareResult, labels: string[], prefix = "comparison") {
  const t = stamp();
  downloadCSV(`schedx-${prefix}-summary-${t}.csv`, res.runs.map((r, i) => ({
    configuration: labels[i], algorithm: r.algorithm, params: JSON.stringify(r.params), context_switch_cost: r.context_switch_cost,
    ...r.summary, ...Object.fromEntries(Object.entries(r.delta_vs_baseline).map(([k, d]) => [`${k}_pct_vs_baseline`, d.percent])),
  })));
  downloadCSV(`schedx-${prefix}-processes-${t}.csv`, res.runs.flatMap((r, i) => r.metrics.processes.map((p) => ({ configuration: labels[i], algorithm: r.algorithm, ...p }))));
}

export function exportComparisonJSON(res: CompareResult, labels: string[], prefix = "comparison") {
  downloadJSON(`schedx-${prefix}-${stamp()}.json`, { labels, ...res });
}

export function ComparisonResults({ res, labels, baselineName = "baseline" }: { res: CompareResult; labels: string[]; baselineName?: string }) {
  const [procMetric, setProcMetric] = useState<"turnaround" | "response" | "ready_wait" | "completion">("turnaround");
  const rows: SeriesRow[] = res.runs.map((r, i) => ({ label: labels[i], colorIndex: i, values: r.summary }));
  const domain = Math.max(...res.runs.map((r) => r.end_time));
  const pids = res.workload.map((p) => p.pid);

  return (
    <div className="space-y-5">
      <Card title="Aligned schedules" subtitle={`Same workload (${pids.length} processes), same time axis 0–${domain}`}
        actions={<>
          <Button size="sm" variant="ghost" icon={<FileSpreadsheet className="size-3.5" />} onClick={() => exportComparison(res, labels)}>CSV</Button>
          <Button size="sm" variant="ghost" icon={<FileBraces className="size-3.5" />} onClick={() => exportComparisonJSON(res, labels)}>JSON</Button>
        </>}>
        <div className="space-y-4">
          {res.runs.map((r, i) => (
            <div key={i}>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-fg">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_COLORS[i % 8] }} />
                {labels[i]} {i === 0 && <Badge>{baselineName}</Badge>}
                <span className="font-mono text-fg-faint">ends t={r.end_time}</span>
              </div>
              <GanttChart segments={r.segments} endTime={r.end_time} domainEnd={domain} pids={pids} lanes={false} compact showControls={i === 0} title={labels[i]} />
            </div>
          ))}
          <GanttLegend pids={pids} />
        </div>
      </Card>

      <Card title="Metric comparison" subtitle="Original engine values. Each chart shows one metric, so differences are not merged into a single 'best' score.">
        <div className="mb-3"><SeriesLegend rows={rows} /></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CHART_METRICS.map((m) => <MetricBars key={m} rows={rows} metric={m} />)}
        </div>
      </Card>

      <Card title="Side-by-side metrics" subtitle={`Percentage change relative to ${labels[0]} (${baselineName}). Shown as n/a when the baseline value is 0.`}>
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="data-table">
            <thead>
              <tr><th>Metric</th>{labels.map((l, i) => <th key={i}><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ backgroundColor: SERIES_COLORS[i % 8] }} />{l}</span></th>)}</tr>
            </thead>
            <tbody>
              {TABLE_METRICS.map((m) => {
                const info = METRIC_INFO[m];
                const vals = res.runs.map((r) => r.summary[m]);
                const best = info.better === "lower" ? Math.min(...vals) : Math.max(...vals);
                return (
                  <tr key={m}>
                    <td className="text-fg"><span className="inline-flex items-center gap-1">{info.label}<InfoTip>{info.help}</InfoTip></span></td>
                    {res.runs.map((r, i) => {
                      const d = r.delta_vs_baseline[m];
                      const improved = d && d.absolute !== 0 && ((info.better === "lower") === d.absolute < 0);
                      return (
                        <td key={i} className="font-mono">
                          <span className={cx(r.summary[m] === best && "font-semibold text-fg")}>{fmtMetric(m, r.summary[m])}</span>
                          {i > 0 && d && (
                            <span className={cx("ml-2 text-[11px]", d.absolute === 0 ? "text-fg-faint" : improved ? "text-green-300" : "text-red-300")}>
                              {d.absolute === 0 ? "=" : fmtPct(d.percent)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-fg-faint">Green means more favourable than the baseline for that metric, red means less favourable. Bold marks the most favourable value in each row. No configuration is ranked "best" overall: the trade-offs depend on which metric matters.</p>
      </Card>

      <Card title="Per-process comparison" actions={
        <Segmented label="Per-process metric" value={procMetric} onChange={setProcMetric}
          options={[{ value: "turnaround", label: "Turnaround" }, { value: "response", label: "Response" }, { value: "ready_wait", label: "Ready wait" }, { value: "completion", label: "Completion" }]} />
      }>
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="data-table">
            <thead><tr><th>PID</th><th>Arrival</th><th>Bursts</th>{labels.map((l, i) => <th key={i}>{l}</th>)}</tr></thead>
            <tbody>
              {res.workload.map((p) => {
                const vals = res.runs.map((r) => r.metrics.processes.find((x) => x.pid === p.pid)![procMetric]);
                const min = Math.min(...vals);
                return (
                  <tr key={p.pid}>
                    <td className="font-mono text-fg">{p.pid}</td>
                    <td className="font-mono">{p.arrival}</td>
                    <td className="font-mono text-xs">{p.bursts.join(", ")}</td>
                    {vals.map((v, i) => <td key={i} className={cx("font-mono", v === min && vals.some((x) => x !== min) && "font-semibold text-fg")}>{fmt(v)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
