import { Info, Pin, Play, Save, Split, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader } from "../components/ui";
import { ComparisonResults } from "../features/comparison/ComparisonResults";
import { ConfigEditor } from "../features/scheduler/ConfigEditor";
import { ALGO, configLabel, defaultConfig, METRIC_INFO } from "../lib/algorithms";
import { fmtMetric, fmtPct } from "../lib/format";
import { api, ApiError } from "../services/api";
import { useLab } from "../state/LabContext";
import type { CompareResult, Process, SchedulerConfig } from "../types";
import { SaveExperimentDialog } from "../features/experiments/SaveExperimentDialog";

interface Baseline { workload: Process[]; config: SchedulerConfig; name: string; capturedAt: string }
const KEY = "schedx.whatif.baseline.v1";

const QUESTIONS: { label: string; make: (b: SchedulerConfig) => SchedulerConfig | null }[] = [
  { label: "Halve the Round Robin quantum", make: (b) => b.algorithm === "rr" ? { ...b, params: { quantum: Math.max(1, Math.floor((b.params.quantum as number) / 2)) } } : defaultConfig("rr", { params: { quantum: 2 }, context_switch_cost: b.context_switch_cost }) },
  { label: "Use SRTF instead", make: (b) => defaultConfig("srtf", { context_switch_cost: b.context_switch_cost, starvation_threshold: b.starvation_threshold }) },
  { label: "Add 2 tu switch overhead", make: (b) => ({ ...b, context_switch_cost: Math.min(20, b.context_switch_cost + 2) }) },
  { label: "Try AQS", make: (b) => defaultConfig("aqs", { context_switch_cost: b.context_switch_cost, starvation_threshold: b.starvation_threshold }) },
  { label: "Enable priority ageing", make: (b) => defaultConfig("priority", { params: { preemptive: true, aging_interval: 4 }, context_switch_cost: b.context_switch_cost }) },
];

function narrate(res: CompareResult): string[] {
  const out: string[] = [];
  const [a, b] = res.runs;
  for (const m of ["avg_response", "p95_response", "avg_ready_wait", "avg_turnaround", "cpu_utilization", "context_switches", "max_ready_wait"]) {
    const info = METRIC_INFO[m];
    const d = b.delta_vs_baseline[m];
    if (!d || d.absolute === 0) continue;
    const better = (info.better === "lower") === d.absolute < 0;
    out.push(`${info.label} ${d.absolute < 0 ? "fell" : "rose"} from ${fmtMetric(m, a.summary[m])} to ${fmtMetric(m, b.summary[m])} (${fmtPct(d.percent)}), which is ${better ? "more" : "less"} favourable.`);
  }
  if (!out.length) out.push("The alternative produced identical system-level metrics on this workload.");
  return out;
}

export default function WhatIfPage() {
  const lab = useLab();
  const nav = useNavigate();
  const [baseline, setBaseline] = useState<Baseline | null>(() => {
    try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  });
  const [alt, setAlt] = useState<SchedulerConfig>(() => baseline ? QUESTIONS[0].make(baseline.config)! : defaultConfig("srtf"));
  const [res, setRes] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const inflight = useRef(false);

  useEffect(() => {
    try { baseline ? localStorage.setItem(KEY, JSON.stringify(baseline)) : localStorage.removeItem(KEY); } catch { /* not persisted */ }
  }, [baseline]);

  const capture = () => {
    if (!lab.validation.valid) { setErr(["The Scheduler Lab workload is invalid or empty. Fix it before capturing a baseline."]); return; }
    const b = { workload: lab.validation.processes, config: lab.config, name: lab.workloadName, capturedAt: new Date().toISOString() };
    setBaseline(b); setRes(null); setErr(null);
    setAlt(QUESTIONS[0].make(b.config)!);
  };

  const run = async () => {
    if (!baseline || inflight.current) return;
    inflight.current = true; setBusy(true); setErr(null);
    try { setRes(await api.compare(baseline.workload, [baseline.config, alt])); }
    catch (e) { setErr(e instanceof ApiError ? e.messages : [String(e)]); }
    finally { inflight.current = false; setBusy(false); }
  };

  const labels = baseline ? [`Original: ${configLabel(baseline.config)}`, `What-if: ${configLabel(alt)}`] : [];

  return (
    <>
      <PageHeader eyebrow="What-If Analysis" title="Hold the workload fixed, change one decision"
        description="Pin a baseline (a workload and a scheduler configuration), then ask what would change under a different policy or parameter. Both configurations are simulated in full on the identical workload."
        actions={baseline && <Button icon={<Undo2 className="size-4" />} onClick={() => { lab.setWorkload(baseline.workload, baseline.name); lab.setConfig(baseline.config); nav("/lab"); }}>Return to original in Lab</Button>} />

      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] px-4 py-3 text-sm text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-cyan-300" />
        <p>Every what-if run <strong className="text-fg">restarts from t = 0</strong> with the pinned workload. SchedX does not checkpoint a simulation part-way through, so a half-finished playback is never compared against a fresh run. Both sides always cover the complete schedule.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="space-y-5">
          <Card title="1 · Baseline" subtitle="Pinned workload and configuration" actions={<Button size="sm" icon={<Pin className="size-3.5" />} onClick={capture}>{baseline ? "Re-pin from Lab" : "Pin current Lab setup"}</Button>}>
            {baseline ? (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-2"><Badge tone="cyan">{baseline.name}</Badge><Badge tone="accent">{configLabel(baseline.config)}</Badge></div>
                <p className="text-xs text-fg-faint">{baseline.workload.length} processes · pinned {new Date(baseline.capturedAt).toLocaleString()}</p>
                <p className="font-mono text-[11px] leading-relaxed text-fg-faint">{baseline.workload.map((p) => `${p.pid}(a${p.arrival}:${p.bursts.join("/")})`).join("  ")}</p>
              </div>
            ) : (
              <EmptyState icon={<Pin className="size-5" />} title="No baseline pinned">Pin the workload and scheduler currently set in the Scheduler Lab ({lab.workloadName}, {ALGO[lab.config.algorithm].short}).</EmptyState>
            )}
          </Card>
          <Card title="2 · Alternative" subtitle="What should change?" glass>
            {baseline ? (
              <>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {QUESTIONS.map((q) => (
                    <button key={q.label} onClick={() => { const c = q.make(baseline.config); if (c) setAlt(c); }} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-fg-muted hover:border-white/25 hover:text-fg">{q.label}</button>
                  ))}
                </div>
                <ConfigEditor value={alt} onChange={setAlt} idPrefix="wi" />
                <Button variant="primary" size="lg" className="mt-4 w-full" icon={<Play className="size-4" />} loading={busy} onClick={run}>Run what-if (both from t=0)</Button>
              </>
            ) : <p className="text-sm text-fg-faint">Pin a baseline first.</p>}
            <div className="mt-3"><ErrorBanner messages={err} onDismiss={() => setErr(null)} /></div>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          {!res ? (
            <Card><EmptyState icon={<Split className="size-5" />} title="No what-if result yet">Pin a baseline, choose an alternative and run. The comparison summary appears here.</EmptyState></Card>
          ) : (
            <>
              <Card glass className="edge-light" title="What changed" subtitle={`${labels[1]} compared with ${labels[0]}`}
                actions={<Button size="sm" icon={<Save className="size-3.5" />} onClick={() => setSaveOpen(true)}>Save</Button>}>
                <ul className="space-y-1.5 text-sm text-fg-muted">
                  {narrate(res).map((s, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-cyan-300" />{s}</li>)}
                </ul>
                <p className="mt-3 text-xs text-fg-faint">These statements are generated directly from the two engine results, for this workload only. A different workload may reverse them.</p>
              </Card>
              <ComparisonResults res={res} labels={labels} baselineName="original" />
            </>
          )}
        </div>
      </div>
      {res && baseline && (
        <SaveExperimentDialog open={saveOpen} onClose={() => setSaveOpen(false)} defaultName={`What-if: ${configLabel(baseline.config)} → ${configLabel(alt)}`}
          body={{ kind: "whatif", workload: baseline.workload, configs: [{ ...baseline.config, label: labels[0] }, { ...alt, label: labels[1] }] }} />
      )}
    </>
  );
}
