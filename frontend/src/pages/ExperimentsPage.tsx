import { Cpu, Eye, FlaskConical, Play, Save } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Segmented, cx } from "../components/ui";
import { ComparisonResults } from "../features/comparison/ComparisonResults";
import { GEN_DEFAULTS, GeneratorForm, toGenerator, toStrings } from "../features/experiments/GeneratorForm";
import { HistoryPanel } from "../features/experiments/HistoryPanel";
import { SweepPanel } from "../features/experiments/SweepPanel";
import { ALGORITHMS, configLabel, defaultConfig } from "../lib/algorithms";
import { api, ApiError } from "../services/api";
import { useLab } from "../state/LabContext";
import type { AlgorithmKey, CompareResult, Process } from "../types";
import { SaveExperimentDialog } from "../features/experiments/SaveExperimentDialog";

const CLASSES = ["cpu_bound", "io_heavy", "interactive", "mixed", "high_load"];

export default function ExperimentsPage() {
  const lab = useLab();
  const nav = useNavigate();
  const [tab, setTab] = useState<"workloads" | "sweep" | "history">("workloads");
  const [klass, setKlass] = useState<string>("custom");
  const [form, setForm] = useState<Record<string, string>>(toStrings(GEN_DEFAULTS));
  const [preview, setPreview] = useState<Process[] | null>(null);
  const [algos, setAlgos] = useState<AlgorithmKey[]>(["fcfs", "sjf", "srtf", "rr", "mlfq", "aqs"]);
  const [cs, setCs] = useState("1");
  const [res, setRes] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState<"gen" | "run" | null>(null);
  const [err, setErr] = useState<string[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const inflight = useRef(false);
  const generator = useMemo(() => toGenerator(form), [form]);
  const configs = algos.map((a) => defaultConfig(a, { context_switch_cost: Number(cs) }));

  const pickClass = (key: string) => {
    setKlass(key);
    const p = lab.presets.find((x) => x.key === key);
    setForm(toStrings(p?.generator ?? GEN_DEFAULTS));
    setPreview(null); setRes(null);
  };

  const guard = async (kind: "gen" | "run", fn: () => Promise<void>) => {
    if (inflight.current) return;
    inflight.current = true; setBusy(kind); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof ApiError ? e.messages : [String(e)]); }
    finally { inflight.current = false; setBusy(null); }
  };

  const generate = () => guard("gen", async () => { setPreview((await api.generate(generator)).processes); });
  const run = () => guard("run", async () => {
    if (configs.length < 2) throw new ApiError(422, ["Select at least two algorithms."]);
    if (!/^\d+$/.test(cs) || Number(cs) > 20) throw new ApiError(422, ["Context-switch cost must be an integer between 0 and 20."]);
    const wl = (await api.generate(generator)).processes;
    setPreview(wl);
    setRes(await api.compare(wl, configs));
  });

  return (
    <>
      <PageHeader eyebrow="Experiment Studio" title="Reproducible scheduling experiments"
        description="Generate seeded synthetic workloads, run several policies on them, sweep one parameter at a time and keep a history in SQLite. The same seed and settings always regenerate the same workload and the same results."
        actions={<Segmented label="Studio section" value={tab} onChange={setTab} options={[{ value: "workloads", label: "Workloads & runs" }, { value: "sweep", label: "Sensitivity sweep" }, { value: "history", label: "History" }]} />} />

      {tab === "workloads" && (
        <div className="space-y-5">
          <Card title="Workload class" subtitle="Example generator configurations with fixed seeds. Results are computed when you run them, never stored in advance.">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[...CLASSES.map((k) => lab.presets.find((p) => p.key === k)).filter(Boolean).map((p) => ({ key: p!.key, name: p!.name, desc: p!.description })), { key: "custom", name: "Custom", desc: "Start from the generator defaults and set every field yourself." }].map((c) => (
                <button key={c.key} onClick={() => pickClass(c.key)} aria-pressed={klass === c.key}
                  className={cx("rounded-xl border p-3 text-left transition-colors", klass === c.key ? "border-violet-400/50 bg-violet-500/10" : "border-white/[0.07] bg-white/[0.02] hover:border-white/20")}>
                  <p className="text-sm font-medium text-fg">{c.name}</p>
                  <p className="mt-1 text-[11px] leading-snug text-fg-faint">{c.desc}</p>
                </button>
              ))}
            </div>
            {lab.presetsError && <p className="mt-2 text-xs text-red-300">Example classes are unavailable: {lab.presetsError}</p>}
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Card title="Generator" subtitle="Validated by the backend. Invalid values are reported, never silently adjusted." glass>
              <GeneratorForm value={form} onChange={(v) => { setForm(v); setKlass("custom"); }} />
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <p className="mb-2 text-xs font-medium text-fg-muted">Algorithms (default parameters)</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALGORITHMS.map((a) => (
                    <button key={a.key} aria-pressed={algos.includes(a.key)} onClick={() => setAlgos(algos.includes(a.key) ? algos.filter((x) => x !== a.key) : [...algos, a.key])}
                      className={cx("rounded-md border px-2 py-1 font-mono text-xs", algos.includes(a.key) ? "border-cyan-400/50 bg-cyan-400/10 text-fg" : "border-white/10 text-fg-faint")}>{a.short}</button>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs text-fg-muted">Context-switch cost
                  <input className="field w-20 font-mono" value={cs} onChange={(e) => setCs(e.target.value)} aria-label="Context-switch cost" />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button icon={<Eye className="size-4" />} loading={busy === "gen"} onClick={generate}>Preview workload</Button>
                <Button variant="primary" icon={<Play className="size-4" />} loading={busy === "run"} onClick={run}>Generate & run {algos.length} policies</Button>
              </div>
              <div className="mt-3"><ErrorBanner messages={err} onDismiss={() => setErr(null)} title="Experiment rejected" /></div>
            </Card>
            <Card title="Generated workload" subtitle={preview ? `${preview.length} processes · seed ${form.seed}` : "Preview or run to see the processes"}
              actions={preview && <Button size="sm" variant="ghost" icon={<Cpu className="size-3.5" />} onClick={() => { lab.setWorkload(preview, `Generated (seed ${form.seed})`); nav("/lab"); }}>Open in Lab</Button>}>
              {preview ? (
                <div className="max-h-[420px] overflow-auto rounded-lg border border-white/[0.06]">
                  <table className="data-table">
                    <thead><tr><th>PID</th><th>Arrival</th><th>Bursts (CPU, I/O, …)</th><th>Prio</th><th>Total CPU</th></tr></thead>
                    <tbody>{preview.map((p) => <tr key={p.pid}><td className="font-mono text-fg">{p.pid}</td><td className="font-mono">{p.arrival}</td><td className="font-mono text-xs">{p.bursts.join(", ")}</td><td className="font-mono">{p.priority}</td><td className="font-mono">{p.bursts.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <EmptyState icon={<FlaskConical className="size-5" />} title="Nothing generated yet" />}
            </Card>
          </div>

          {res && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-fg-muted">Results for seed <Badge>{form.seed}</Badge> · {configs.map(configLabel).join(", ")}</p>
                <Button icon={<Save className="size-4" />} onClick={() => setSaveOpen(true)}>Save experiment</Button>
              </div>
              <ComparisonResults res={res} labels={res.runs.map((r) => configLabel({ algorithm: r.algorithm, params: r.params, context_switch_cost: r.context_switch_cost, starvation_threshold: r.starvation_threshold }))} />
              <SaveExperimentDialog open={saveOpen} onClose={() => { setSaveOpen(false); setRefresh((x) => x + 1); }} defaultName={`${klass === "custom" ? "Custom" : lab.presets.find((p) => p.key === klass)?.name} · seed ${form.seed}`}
                body={{ kind: "comparison", generator, configs: res.runs.map((r) => ({ algorithm: r.algorithm, params: r.params, context_switch_cost: r.context_switch_cost, starvation_threshold: r.starvation_threshold })) }} />
            </>
          )}
          {!res && !preview && <p className="text-center text-xs text-fg-faint">Tip: run the same seed twice and the results match exactly. Change the seed to get another sample from the same workload class.</p>}
        </div>
      )}
      {tab === "sweep" && <SweepPanel generator={generator} />}
      {tab === "history" && <HistoryPanel refreshKey={refresh} />}
      {tab !== "history" && <div className="mt-5 text-right"><button className="text-xs text-cyan-300 hover:underline" onClick={() => setTab("history")}>View saved experiment history →</button></div>}
    </>
  );
}
