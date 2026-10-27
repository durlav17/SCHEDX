import { CircleCheck, TriangleAlert } from "lucide-react";
import { Badge, InfoTip, StatCard } from "../../components/ui";
import { METRIC_INFO } from "../../lib/algorithms";
import { colorMap } from "../../lib/colors";
import { fmt, fmtMetric } from "../../lib/format";
import type { SimulationResult } from "../../types";

export function SystemMetrics({ result }: { result: SimulationResult }) {
  const s = result.metrics.system;
  const cards: { label: string; value: string; unit?: string; help: string; tone?: "warn" | "critical"; sub?: string }[] = [
    { label: "Avg response", value: fmt(s.response.mean), unit: "tu", help: METRIC_INFO.avg_response.help, sub: `p95 ${fmt(s.response.p95)} · max ${fmt(s.response.max)}` },
    { label: "Avg ready wait", value: fmt(s.ready_wait.mean), unit: "tu", help: METRIC_INFO.avg_ready_wait.help, sub: `p95 ${fmt(s.ready_wait.p95)}` },
    { label: "Avg turnaround", value: fmt(s.turnaround.mean), unit: "tu", help: METRIC_INFO.avg_turnaround.help, sub: `p95 ${fmt(s.turnaround.p95)}` },
    { label: "Throughput", value: s.throughput.toFixed(3), unit: "/tu", help: METRIC_INFO.throughput.help, sub: `interval [${s.observation_start}, ${s.observation_end}]` },
    { label: "CPU utilization", value: fmtMetric("cpu_utilization", s.cpu_utilization), help: METRIC_INFO.cpu_utilization.help, sub: `busy ${s.busy_time} · idle ${s.idle_time} tu` },
    { label: "Context switches", value: String(s.context_switches), help: METRIC_INFO.context_switches.help, sub: `${s.preemptions} preemptions · ${s.dispatches} dispatches` },
    { label: "Switch overhead", value: String(s.context_switch_overhead), unit: "tu", help: METRIC_INFO.context_switch_overhead.help, sub: `${fmtMetric("overhead_fraction", s.overhead_fraction)} of interval` },
    { label: "Max ready stint", value: String(s.max_ready_wait), unit: "tu", help: METRIC_INFO.max_ready_wait.help },
    { label: "Starvation flags", value: String(s.starved_count), tone: s.starved_count ? "warn" : undefined, help: `${METRIC_INFO.starved_count.help} Threshold: ${s.starvation_threshold} tu.` },
    { label: "Fairness (Jain)", value: s.fairness_jain_slowdown.toFixed(3), help: METRIC_INFO.fairness.help },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => <StatCard key={c.label} {...c} />)}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-fg-faint">
        {s.accounting_consistent ? <CircleCheck className="size-3.5 text-good" /> : <TriangleAlert className="size-3.5 text-warn" />}
        {s.accounting_consistent
          ? "Accounting check passed: for every process, turnaround = ready wait + dispatch wait + CPU + I/O."
          : "Accounting check failed. Please report this workload."}
        {result.metrics.system.aqs_adjustments > 0 && <Badge tone="accent" className="ml-2">{result.metrics.system.aqs_adjustments} AQS quantum adjustments</Badge>}
      </p>
    </div>
  );
}

export function ProcessMetricsTable({ result }: { result: SimulationResult }) {
  const colors = colorMap(result.workload.map((p) => p.pid));
  const cols: [string, string, string][] = [
    ["arrival", "Arrival", "Arrival time."],
    ["first_start", "First run", "Time the process first executed on the CPU."],
    ["completion", "Completion", "Time the final CPU burst finished."],
    ["turnaround", "Turnaround", METRIC_INFO.avg_turnaround.help],
    ["response", "Response", METRIC_INFO.avg_response.help],
    ["ready_wait", "Ready wait", METRIC_INFO.avg_ready_wait.help],
    ["dispatch_wait", "Dispatch", "Time spent while the CPU context-switched to this process."],
    ["cpu_time", "CPU", "Total CPU execution."],
    ["io_time", "I/O", "Total time blocked on I/O."],
    ["max_ready_wait", "Max stint", METRIC_INFO.max_ready_wait.help],
    ["slowdown", "Slowdown", "Turnaround ÷ (CPU + I/O). 1 = never waited."],
    ["preemptions", "Preempt", "Times this process was preempted."],
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
      <table className="data-table">
        <thead>
          <tr>
            <th>PID</th>
            {cols.map(([k, l, h]) => <th key={k}><span className="inline-flex items-center gap-1">{l}<InfoTip>{h}</InfoTip></span></th>)}
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {result.metrics.processes.map((p) => (
            <tr key={p.pid}>
              <td className="font-mono text-fg"><span className="mr-1.5 inline-block size-2 rounded-sm" style={{ backgroundColor: colors[p.pid].fill }} />{p.pid}</td>
              {cols.map(([k]) => <td key={k} className="font-mono">{fmt((p as any)[k])}</td>)}
              <td>{p.starved ? <Badge tone="warn"><TriangleAlert className="size-3" />starvation</Badge> : <span className="text-fg-faint">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
