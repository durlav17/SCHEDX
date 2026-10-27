import { GitCompareArrows, Play, Plus, Save, Trash } from "lucide-react";
import { useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Spinner, Toggle } from "../components/ui";
import { ComparisonResults } from "../features/comparison/ComparisonResults";
import { SaveExperimentDialog } from "../features/experiments/SaveExperimentDialog";
import { ConfigEditor } from "../features/scheduler/ConfigEditor";
import { WorkloadSummary } from "../features/scheduler/WorkloadSummary";
import { configLabel, defaultConfig } from "../lib/algorithms";
import { SERIES_COLORS } from "../lib/colors";
import { newRowId } from "../lib/workload";
import { api, ApiError } from "../services/api";
import { useLab } from "../state/LabContext";
import type { CompareResult, SchedulerConfig } from "../types";

type Item = { id: string; cfg: SchedulerConfig };
const wrap = (cfg: SchedulerConfig): Item => ({ id: newRowId(), cfg });

const PRESETS: { label: string; configs: () => SchedulerConfig[] }[] = [
  { label: "Classic four", configs: () => [defaultConfig("fcfs"), defaultConfig("sjf"), defaultConfig("srtf"), defaultConfig("rr")] },
  { label: "RR vs AQS", configs: () => [defaultConfig("rr"), defaultConfig("aqs")] },
  { label: "Quantum 2 / 4 / 8", configs: () => [2, 4, 8].map((q) => defaultConfig("rr", { params: { quantum: q } })) },
  { label: "Priority ± ageing", configs: () => [defaultConfig("priority", { params: { preemptive: true, aging_interval: 0 } }), defaultConfig("priority", { params: { preemptive: true, aging_interval: 5 } })] },
  { label: "All seven", configs: () => (["fcfs", "sjf", "srtf", "rr", "priority", "mlfq", "aqs"] as const).map((k) => defaultConfig(k)) },
];

export default function ComparePage() {
  const lab = useLab();
  const [params] = useSearchParams();
  // Opened from a saved experiment in the history: start from its stored configurations.
  const opened = (useLocation().state as { configs?: SchedulerConfig[] } | null)?.configs;
  const [items, setItems] = useState<Item[]>(() => {
    if (opened && opened.length >= 2) return opened.map((c) => wrap({ ...c, label: null }));
    if (params.get("from") === "lab") {
      const other = lab.config.algorithm === "srtf" ? defaultConfig("fcfs") : defaultConfig("srtf");
      return [wrap(lab.config), wrap({ ...other, context_switch_cost: lab.config.context_switch_cost })];
    }
    return [wrap(defaultConfig("fcfs")), wrap(defaultConfig("srtf")), wrap(defaultConfig("rr"))];
  });
  const [syncCs, setSyncCs] = useState(true);
  const [res, setRes] = useState<CompareResult | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const inflight = useRef(false);

  const update = (id: string, cfg: SchedulerConfig) => {
    setItems((xs) => xs.map((x) => {
      if (x.id === id) return { ...x, cfg };
      return syncCs ? { ...x, cfg: { ...x.cfg, context_switch_cost: cfg.context_switch_cost, starvation_threshold: cfg.starvation_threshold } } : x;
    }));
  };

  const run = async () => {
    if (inflight.current) return;
    if (!lab.validation.valid) { setErr(["The shared workload is invalid or empty. Fix it in the Scheduler Lab first."]); return; }
    inflight.current = true; setBusy(true); setErr(null);
    try {
      const cfgs = items.map((i) => i.cfg);
      const r = await api.compare(lab.validation.processes, cfgs);
      setRes(r);
      setLabels(cfgs.map(configLabel));
    } catch (e) {
      setErr(e instanceof ApiError ? e.messages : [String(e)]);
    } finally { inflight.current = false; setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="Algorithm Arena" title="Compare policies on an identical workload"
        description="Every configuration below receives exactly the same arrivals and bursts. The engine runs each one independently and reports raw metrics side by side. Read the differences as trade-offs, not as a ranking."
        actions={res && <Button icon={<Save className="size-4" />} onClick={() => setSaveOpen(true)}>Save experiment</Button>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="space-y-5">
          <Card title="Shared workload"><WorkloadSummary /></Card>
          <Card title="Configurations" subtitle={`${items.length} of 8 · the first one is the baseline`} glass
            actions={<label className="flex items-center gap-2 text-xs text-fg-muted">Sync switch cost <Toggle checked={syncCs} onChange={setSyncCs} label="Synchronize context-switch cost and starvation threshold across configurations" /></label>}>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => setItems(p.configs().map((c) => wrap({ ...c, context_switch_cost: items[0]?.cfg.context_switch_cost ?? 0 })))}
                  className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-fg-muted hover:border-white/25 hover:text-fg">{p.label}</button>
              ))}
            </div>
            <div className="space-y-3">
              {items.map((it, i) => (
                <div key={it.id} className="rounded-xl border border-white/[0.07] bg-ink-950/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-medium text-fg">
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_COLORS[i % 8] }} />
                      {i === 0 ? "Baseline" : `Configuration ${i + 1}`} · <span className="font-mono text-fg-faint">{configLabel(it.cfg)}</span>
                    </span>
                    <button disabled={items.length <= 2} onClick={() => setItems(items.filter((x) => x.id !== it.id))} className="rounded p-1 text-fg-faint hover:text-red-300 disabled:opacity-30" aria-label={`Remove configuration ${i + 1}`}><Trash className="size-3.5" /></button>
                  </div>
                  <ConfigEditor value={it.cfg} onChange={(c) => update(it.id, c)} idPrefix={`cmp-${it.id}`} compact />
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" icon={<Plus className="size-3.5" />} disabled={items.length >= 8} onClick={() => setItems([...items, wrap({ ...defaultConfig("aqs"), context_switch_cost: items[0].cfg.context_switch_cost })])}>Add configuration</Button>
            </div>
            <Button variant="primary" size="lg" className="mt-4 w-full" icon={<Play className="size-4" />} loading={busy} onClick={run} disabled={items.length < 2}>Run comparison</Button>
            <div className="mt-3"><ErrorBanner messages={err} onDismiss={() => setErr(null)} title="Comparison failed" /></div>
          </Card>
        </div>
        <div className="min-w-0">
          {busy && !res && <Card><Spinner label="Running every configuration through the engine…" /></Card>}
          {!res && !busy && (
            <Card><EmptyState icon={<GitCompareArrows className="size-5" />} title="No comparison yet">Choose two or more configurations and run them. Results appear here with aligned Gantt charts and metrics side by side.</EmptyState></Card>
          )}
          {res && <ComparisonResults res={res} labels={labels} />}
        </div>
      </div>
      {res && (
        <SaveExperimentDialog open={saveOpen} onClose={() => setSaveOpen(false)} defaultName={`Arena: ${labels.join(" vs ")}`}
          body={{ kind: "comparison", workload: res.workload, configs: res.runs.map((r, i) => ({ algorithm: r.algorithm, params: r.params, context_switch_cost: r.context_switch_cost, starvation_threshold: r.starvation_threshold, label: labels[i] })) }} />
      )}
    </>
  );
}
