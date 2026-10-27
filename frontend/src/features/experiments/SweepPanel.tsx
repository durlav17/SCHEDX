import { ChartLine, FileBraces, FileSpreadsheet, Play, Save } from "lucide-react";
import { useRef, useState } from "react";
import { CartesianGrid, ErrorBar, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, EmptyState, ErrorBanner, InfoTip, Label, Segmented, Select } from "../../components/ui";
import { KEY_METRICS, METRIC_INFO, defaultConfig } from "../../lib/algorithms";
import { fmtMetric } from "../../lib/format";
import { api, ApiError } from "../../services/api";
import { downloadCSV, downloadJSON, stamp } from "../../services/export";
import { useLab } from "../../state/LabContext";
import type { GeneratorConfig, SchedulerConfig, SweepResult } from "../../types";
import { ConfigEditor } from "../scheduler/ConfigEditor";
import { SaveExperimentDialog } from "./SaveExperimentDialog";

const PARAMS = [
  { value: "quantum", label: "Time quantum", needsGen: false, hint: "RR quantum, AQS base quantum, or MLFQ slices [q, 2q, 4q]", def: "1, 2, 3, 4, 6, 8, 12, 16" },
  { value: "context_switch_cost", label: "Context-switch cost", needsGen: false, hint: "Simulated switch cost in tu", def: "0, 1, 2, 3, 4, 5" },
  { value: "process_count", label: "Process count", needsGen: true, hint: "Regenerates the workload for each value", def: "4, 8, 12, 16, 24, 32" },
  { value: "cpu_max", label: "Max CPU burst", needsGen: true, hint: "Upper bound of generated CPU bursts", def: "4, 8, 12, 16, 24" },
  { value: "cpu_mean", label: "Mean CPU burst", needsGen: true, hint: "Exponential distribution mean (set the distribution to exponential)", def: "2, 4, 6, 8, 12" },
];

export function SweepPanel({ generator }: { generator: GeneratorConfig }) {
  const lab = useLab();
  const [cfg, setCfg] = useState<SchedulerConfig>(defaultConfig("rr"));
  const [param, setParam] = useState("quantum");
  const [values, setValues] = useState(PARAMS[0].def);
  const [source, setSource] = useState<"generator" | "lab">("generator");
  const [trials, setTrials] = useState("1");
  const [metric, setMetric] = useState("avg_response");
  const [res, setRes] = useState<SweepResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const inflight = useRef(false);
  const meta = PARAMS.find((p) => p.value === param)!;

  const body = () => {
    const vals = values.split(/[\s,]+/).filter(Boolean).map(Number);
    return {
      config: cfg, parameter: param, values: vals, trials: source === "lab" ? 1 : Number(trials),
      workload: source === "lab" ? lab.validation.processes : null,
      generator: source === "generator" ? generator : null,
    };
  };

  const run = async () => {
    if (inflight.current) return;
    const b = body();
    const errs: string[] = [];
    if (b.values.some((v) => !Number.isFinite(v))) errs.push("Sweep values must be numbers separated by commas.");
    if (!Number.isInteger(b.trials)) errs.push("Trials must be a whole number.");
    if (source === "lab" && !lab.validation.valid) errs.push("The Scheduler Lab workload is invalid or empty.");
    if (errs.length) { setErr(errs); return; }
    inflight.current = true; setBusy(true); setErr(null);
    try { setRes(await api.sweep(b)); }
    catch (e) { setErr(e instanceof ApiError ? e.messages : [String(e)]); }
    finally { inflight.current = false; setBusy(false); }
  };

  const data = res?.points.map((p) => ({ x: p.value, y: p.metrics[metric].mean, ci: p.metrics[metric].ci95 })) ?? [];
  const exportCSV = () => res && downloadCSV(`schedx-sweep-${res.parameter}-${stamp()}.csv`, res.points.flatMap((p) => p.trials.map((t, i) => ({ parameter: res.parameter, value: p.value, trial: i + 1, ...t }))));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <Card title="Sweep setup" subtitle="Vary one parameter and keep everything else fixed" glass>
        <ConfigEditor value={cfg} onChange={setCfg} idPrefix="sw" compact />
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4">
          <div className="col-span-2">
            <Label htmlFor="sw-param" help={meta.hint}>Parameter to vary</Label>
            <Select id="sw-param" value={param} onChange={(e) => { const p = PARAMS.find((x) => x.value === e.target.value)!; setParam(p.value); setValues(p.def); if (p.needsGen) setSource("generator"); }}>
              {PARAMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </div>
          <div className="col-span-2">
            <Label htmlFor="sw-values" help="Comma-separated, at most 25 values.">Values</Label>
            <input id="sw-values" className="field font-mono" value={values} onChange={(e) => setValues(e.target.value)} />
          </div>
          <div>
            <Label>Workload source</Label>
            <Segmented label="Workload source" value={source} onChange={(v) => setSource(v)}
              options={[{ value: "generator", label: "Generator" }, ...(meta.needsGen ? [] : [{ value: "lab" as const, label: "Lab workload" }])]} />
          </div>
          <div>
            <Label htmlFor="sw-trials" help="Generator only: trial k uses seed + k. With several trials the chart shows the mean and a 95% Student-t confidence interval.">Trials per value</Label>
            <input id="sw-trials" className="field font-mono" value={trials} onChange={(e) => setTrials(e.target.value)} disabled={source === "lab"} />
          </div>
        </div>
        <Button variant="primary" size="lg" className="mt-4 w-full" icon={<Play className="size-4" />} loading={busy} onClick={run}>Run sweep</Button>
        <div className="mt-3"><ErrorBanner messages={err} onDismiss={() => setErr(null)} title="Sweep rejected" /></div>
      </Card>
      <div className="min-w-0">
        {!res ? (
          <Card><EmptyState icon={<ChartLine className="size-5" />} title="No sweep yet">For example, vary the Round Robin quantum from 1 to 16 and watch response time fall while context switches rise.</EmptyState></Card>
        ) : (
          <Card title={`Sensitivity: ${PARAMS.find((p) => p.value === res.parameter)?.label}`} subtitle={`${res.algorithm.toUpperCase()} · ${res.points.length} values × ${res.trials} trial(s)`}
            actions={<>
              <Select aria-label="Metric to plot" value={metric} onChange={(e) => setMetric(e.target.value)} className="h-8 w-auto py-1 text-xs">
                {KEY_METRICS.map((m) => <option key={m} value={m}>{METRIC_INFO[m].label}</option>)}
              </Select>
              <Button size="sm" variant="ghost" icon={<FileSpreadsheet className="size-3.5" />} onClick={exportCSV}>CSV</Button>
              <Button size="sm" variant="ghost" icon={<FileBraces className="size-3.5" />} onClick={() => downloadJSON(`schedx-sweep-${stamp()}.json`, res)}>JSON</Button>
              <Button size="sm" icon={<Save className="size-3.5" />} onClick={() => setSaveOpen(true)}>Save</Button>
            </>}>
            <figure aria-label={`${METRIC_INFO[metric].label} versus ${res.parameter}`}>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 12, right: 16, left: -6, bottom: 8 }}>
                    <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
                    <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} ticks={data.map((d) => d.x)} stroke="rgb(255 255 255 / 0.15)" tick={{ fill: "#6f788a", fontSize: 11 }} label={{ value: res.parameter, fill: "#6f788a", fontSize: 11, position: "insideBottom", offset: -4 }} />
                    <YAxis stroke="rgb(255 255 255 / 0.15)" tick={{ fill: "#6f788a", fontSize: 11 }} tickFormatter={(v) => fmtMetric(metric, v)} width={56} />
                    <Tooltip contentStyle={{ background: "#12151c", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, _n: any, item: any) => [`${fmtMetric(metric, v)}${item.payload.ci ? ` ± ${fmtMetric(metric, item.payload.ci)}` : ""}`, METRIC_INFO[metric].label]}
                      labelFormatter={(x) => `${res.parameter} = ${x}`} />
                    <Line type="monotone" dataKey="y" stroke="#22d3ee" strokeWidth={2} dot={{ r: 4, fill: "#22d3ee", stroke: "#0d0f14", strokeWidth: 2 }} activeDot={{ r: 6 }} animationDuration={500}>
                      {res.trials > 1 && <ErrorBar dataKey="ci" width={6} stroke="#9085e9" strokeWidth={1.5} />}
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <figcaption className="mt-1 text-[11px] text-fg-faint">{METRIC_INFO[metric].help} {res.trials > 1 && "Error bars: 95% confidence interval of the mean across trials."}</figcaption>
            </figure>
            <div className="mt-4 overflow-x-auto rounded-lg border border-white/[0.06]">
              <table className="data-table">
                <thead><tr><th>{res.parameter}</th>{["avg_response", "p95_response", "avg_ready_wait", "avg_turnaround", "throughput", "cpu_utilization", "context_switches", "context_switch_overhead"].map((m) => <th key={m}><span className="inline-flex items-center gap-1">{METRIC_INFO[m].label}<InfoTip>{METRIC_INFO[m].help}</InfoTip></span></th>)}</tr></thead>
                <tbody>
                  {res.points.map((p) => (
                    <tr key={p.value}>
                      <td className="font-mono text-fg">{p.value}</td>
                      {["avg_response", "p95_response", "avg_ready_wait", "avg_turnaround", "throughput", "cpu_utilization", "context_switches", "context_switch_overhead"].map((m) => (
                        <td key={m} className="font-mono">{fmtMetric(m, p.metrics[m].mean)}{res.trials > 1 && <span className="text-[10.5px] text-fg-faint"> ±{fmtMetric(m, p.metrics[m].ci95)}</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      {res && (
        <SaveExperimentDialog open={saveOpen} onClose={() => setSaveOpen(false)} defaultName={`Sweep: ${res.algorithm} over ${res.parameter}`}
          body={{ kind: "sweep", generator: source === "generator" ? generator : null, sweep: body() }} />
      )}
    </div>
  );
}
