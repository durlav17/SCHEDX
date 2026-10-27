import { CircleCheck, Cpu, Eye, FileBraces, FileSpreadsheet, FlaskConical, GitCompareArrows, Info, Pencil, RefreshCw, Repeat, Trash, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBanner, Label, Modal, Spinner, cx } from "../../components/ui";
import { METRIC_INFO } from "../../lib/algorithms";
import { fmtDate, fmtMetric } from "../../lib/format";
import { api, ApiError } from "../../services/api";
import { downloadCSV, downloadJSON, stamp } from "../../services/export";
import { useLab } from "../../state/LabContext";
import type { ExperimentDetail, ExperimentListItem, SchedulerConfig } from "../../types";

const COLS = ["avg_response", "p95_response", "avg_ready_wait", "avg_turnaround", "throughput", "cpu_utilization", "context_switches"];

type Run = Record<string, any>;
const runsOf = (e: { summary: Record<string, unknown> | null }): Run[] => ((e.summary as any)?.runs ?? []) as Run[];

function RunsTable({ runs, prefix }: { runs: (Run & { experiment?: string })[]; prefix?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
      <table className="data-table">
        <thead><tr>{prefix && <th>Experiment</th>}<th>Configuration</th>{COLS.map((c) => <th key={c}>{METRIC_INFO[c].label}</th>)}</tr></thead>
        <tbody>
          {runs.map((r, i) => (
            <tr key={i}>
              {prefix && <td className="text-fg">{r.experiment}</td>}
              <td className="font-mono text-xs text-fg">{r.label ?? r.algorithm}</td>
              {COLS.map((c) => <td key={c} className="font-mono">{fmtMetric(c, r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function exportExperiment(e: ExperimentDetail) {
  downloadJSON(`schedx-experiment-${e.id}-${stamp()}.json`, e);
  const runs = runsOf(e);
  if (runs.length) downloadCSV(`schedx-experiment-${e.id}-summary-${stamp()}.csv`, runs.map((r) => ({ experiment: e.name, seed: e.seed, ...r })));
  const sw = (e.results as any)?.sweep;
  if (sw) downloadCSV(`schedx-experiment-${e.id}-sweep-${stamp()}.csv`, sw.points.map((p: any) => ({ parameter: sw.parameter, value: p.value, ...Object.fromEntries(Object.entries(p.metrics).map(([k, v]: any) => [k, v.mean])) })));
}

function PersistenceGuide() {
  return (
    <details className="group mb-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-fg-muted" data-testid="persistence-guide">
      <summary className="flex cursor-pointer items-center gap-2 font-medium text-fg"><Info className="size-3.5 text-cyan-300" />What is kept, and where?</summary>
      <dl className="mt-3 grid gap-x-6 gap-y-2.5 leading-relaxed sm:grid-cols-2">
        <div><dt className="font-medium text-fg">Temporary run</dt><dd>The latest Scheduler Lab result. It lives in memory only, and reloading the page clears it.</dd></div>
        <div><dt className="font-medium text-fg">Remembered inputs</dt><dd>The Lab's workload and scheduler settings are remembered in this browser (local storage). Results are not, because they can be large.</dd></div>
        <div><dt className="font-medium text-fg">Saved experiment</dt><dd>Stored in the server's SQLite file (<code>backend/data/schedx.db</code>) with its workload, seed, configurations and engine results. It survives restarts and appears below.</dd></div>
        <div><dt className="font-medium text-fg">Reproducible</dt><dd><b>Reproduce</b> reruns the stored inputs through the engine and checks that the results are identical. <b>Open in Lab</b> or <b>Arena</b> reruns them so you can replay the schedule.</dd></div>
      </dl>
    </details>
  );
}

export function HistoryPanel({ refreshKey }: { refreshKey: number }) {
  const lab = useLab();
  const nav = useNavigate();
  const [items, setItems] = useState<ExperimentListItem[] | null>(null);
  const [err, setErr] = useState<string[] | null>(null);
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);
  const [rename, setRename] = useState<{ id: number; name: string } | null>(null);
  const [del, setDel] = useState<ExperimentListItem | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [compare, setCompare] = useState(false);
  const [repro, setRepro] = useState<Record<number, boolean | "busy">>({});

  const load = useCallback(() => {
    setErr(null);
    api.listExperiments().then((r) => setItems(r.experiments), (e: ApiError) => { setErr(e.messages); setItems([]); });
  }, []);
  useEffect(load, [load, refreshKey]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); load(); } catch (e) { setErr(e instanceof ApiError ? e.messages : [String(e)]); }
  };

  const reproduce = async (id: number) => {
    setRepro((r) => ({ ...r, [id]: "busy" }));
    try { const r = await api.reproduce(id); setRepro((x) => ({ ...x, [id]: r.identical })); }
    catch (e) { setErr(e instanceof ApiError ? e.messages : [String(e)]); setRepro((x) => { const { [id]: _, ...rest } = x; return rest; }); }
  };

  const storedConfigs = (e: ExperimentDetail): SchedulerConfig[] =>
    ((e.config as { configs?: SchedulerConfig[] }).configs ?? []).map((c) => ({ ...c, label: null }));

  /** Reopen a saved experiment: its stored workload and configuration go back into the Lab and are rerun. */
  const openInLab = (id: number) => act(async () => {
    const e = await api.getExperiment(id);
    const cfg = storedConfigs(e)[0];
    if (!cfg) throw new ApiError(422, ["This experiment has no scheduler configuration to open."]);
    lab.setWorkload(e.workload, `${e.name} (saved #${e.id})`);
    lab.setConfig(cfg);
    nav("/lab");
    const r = await lab.runSimulation({ workload: e.workload, config: cfg });
    if (r && e.kind === "simulation") lab.markSaved(e.id); // an exact reproduction of this saved run
  });

  const openInArena = (id: number) => act(async () => {
    const e = await api.getExperiment(id);
    lab.setWorkload(e.workload, `${e.name} (saved #${e.id})`);
    nav("/compare", { state: { configs: storedConfigs(e) } });
  });

  const chosen = (items ?? []).filter((i) => selected.includes(i.id));

  return (
    <Card title="Experiment history" subtitle="Saved in SQLite (backend/data/schedx.db). Every stored result was computed by the engine on the server."
      actions={<>
        <Button size="sm" icon={<GitCompareArrows className="size-3.5" />} disabled={chosen.length < 2} onClick={() => setCompare(true)}>Compare selected ({chosen.length})</Button>
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={load}>Reload</Button>
      </>}>
      <PersistenceGuide />
      <ErrorBanner messages={err} onDismiss={() => setErr(null)} />
      {items === null ? <Spinner label="Loading experiments…" /> : items.length === 0 ? (
        <EmptyState icon={<FlaskConical className="size-5" />} title="No saved experiments">Run a comparison, what-if or sweep and choose Save. The history starts empty: nothing is pre-filled.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="data-table">
            <thead><tr><th className="w-8"><span className="sr-only">Select</span></th><th>Name</th><th>Kind</th><th>Created</th><th>Seed</th><th>Procs</th><th>Reproduce</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td><input type="checkbox" aria-label={`Select ${e.name}`} className="accent-violet-400" checked={selected.includes(e.id)} disabled={e.kind === "sweep"} onChange={(ev) => setSelected(ev.target.checked ? [...selected, e.id] : selected.filter((x) => x !== e.id))} /></td>
                  <td className="max-w-[260px] truncate text-fg" title={e.name}>{e.name}</td>
                  <td><Badge tone={e.kind === "sweep" ? "cyan" : e.kind === "whatif" ? "accent" : "neutral"}>{e.kind}</Badge></td>
                  <td className="text-xs">{fmtDate(e.created_at)}</td>
                  <td className="font-mono">{e.seed ?? "—"}</td>
                  <td className="font-mono">{e.process_count}</td>
                  <td>
                    {repro[e.id] === "busy" ? <Spinner label="" /> : repro[e.id] === true ? <Badge tone="good"><CircleCheck className="size-3" />identical</Badge> : repro[e.id] === false ? <Badge tone="critical"><TriangleAlert className="size-3" />differs</Badge> :
                      <button className="inline-flex items-center gap-1 text-xs text-fg-faint hover:text-cyan-300" title="Rerun the stored inputs and check that the results are identical" onClick={() => reproduce(e.id)}><Repeat className="size-3" />reproduce</button>}
                  </td>
                  <td>
                    <div className="flex justify-end gap-0.5">
                      {e.kind !== "sweep" && <button className="rounded p-1.5 text-fg-faint hover:bg-white/10 hover:text-fg" aria-label={`Open ${e.name} in the Scheduler Lab`} title="Open in Scheduler Lab (reruns it)" onClick={() => openInLab(e.id)}><Cpu className="size-3.5" /></button>}
                      {(e.kind === "comparison" || e.kind === "whatif") && <button className="rounded p-1.5 text-fg-faint hover:bg-white/10 hover:text-fg" aria-label={`Open ${e.name} in the Algorithm Arena`} title="Open in Algorithm Arena" onClick={() => openInArena(e.id)}><GitCompareArrows className="size-3.5" /></button>}
                      <button className="rounded p-1.5 text-fg-faint hover:bg-white/10 hover:text-fg" aria-label={`View ${e.name}`} onClick={() => act(async () => setDetail(await api.getExperiment(e.id)))}><Eye className="size-3.5" /></button>
                      <button className="rounded p-1.5 text-fg-faint hover:bg-white/10 hover:text-fg" aria-label={`Rename ${e.name}`} onClick={() => setRename({ id: e.id, name: e.name })}><Pencil className="size-3.5" /></button>
                      <button className="rounded p-1.5 text-fg-faint hover:bg-white/10 hover:text-fg" aria-label={`Export ${e.name}`} onClick={() => act(async () => exportExperiment(await api.getExperiment(e.id)))}><FileBraces className="size-3.5" /></button>
                      <button className="rounded p-1.5 text-fg-faint hover:bg-critical/20 hover:text-red-300" aria-label={`Delete ${e.name}`} onClick={() => setDel(e)}><Trash className="size-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `#${detail.id} · ${detail.name}` : ""} wide
        footer={detail && <><Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} onClick={() => exportExperiment(detail)}>Export CSV + JSON</Button><Button variant="primary" onClick={() => setDetail(null)}>Close</Button></>}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs"><Badge>{detail.kind}</Badge><Badge>seed {detail.seed ?? "none"}</Badge><Badge>{detail.workload.length} processes</Badge><span className="text-fg-faint">{fmtDate(detail.created_at)}</span></div>
            {runsOf(detail).length > 0 && <RunsTable runs={runsOf(detail)} />}
            {(detail.results as any).sweep && (
              <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                <table className="data-table"><thead><tr><th>{(detail.results as any).sweep.parameter}</th>{COLS.map((c) => <th key={c}>{METRIC_INFO[c].label}</th>)}</tr></thead>
                  <tbody>{(detail.results as any).sweep.points.map((p: any) => <tr key={p.value}><td className="font-mono text-fg">{p.value}</td>{COLS.map((c) => <td key={c} className="font-mono">{fmtMetric(c, p.metrics[c].mean)}</td>)}</tr>)}</tbody></table>
              </div>
            )}
            <details className="rounded-lg border border-white/[0.06] p-3"><summary className="cursor-pointer text-xs text-fg">Stored configuration and workload</summary>
              <pre className="mt-2 max-h-64 overflow-auto font-mono text-[11px] text-fg-muted">{JSON.stringify({ config: detail.config, generator: detail.generator, workload: detail.workload }, null, 2)}</pre>
            </details>
          </div>
        )}
      </Modal>

      <Modal open={!!rename} onClose={() => setRename(null)} title="Rename experiment"
        footer={<><Button variant="ghost" onClick={() => setRename(null)}>Cancel</Button><Button variant="primary" disabled={!rename?.name.trim()} onClick={() => rename && act(async () => { await api.renameExperiment(rename.id, rename.name); setRename(null); })}>Save name</Button></>}>
        <Label htmlFor="rn">Name</Label>
        <input id="rn" className="field" value={rename?.name ?? ""} maxLength={120} onChange={(e) => rename && setRename({ ...rename, name: e.target.value })} />
      </Modal>

      <ConfirmDialog open={!!del} title="Delete experiment?" danger confirmLabel="Delete"
        message={<>This permanently removes <strong className="text-fg">{del?.name}</strong> from the SQLite database.</>}
        onCancel={() => setDel(null)} onConfirm={() => { const d = del!; setDel(null); setSelected((s) => s.filter((x) => x !== d.id)); act(() => api.deleteExperiment(d.id)); }} />

      <Modal open={compare} onClose={() => setCompare(false)} title="Compare saved experiments" wide footer={<Button variant="primary" onClick={() => setCompare(false)}>Close</Button>}>
        <p className="mb-3 text-xs text-fg-faint">The stored summaries side by side. Only compare runs whose workloads are comparable (same seed and generator, or the same process list).</p>
        <RunsTable prefix runs={chosen.flatMap((e) => runsOf(e).map((r) => ({ ...r, experiment: `#${e.id} ${e.name}` })))} />
        <ul className={cx("mt-3 space-y-0.5 text-[11px] text-fg-faint")}>{chosen.map((e) => <li key={e.id}>#{e.id}: {e.process_count} processes, seed {e.seed ?? "none"}</li>)}</ul>
      </Modal>
    </Card>
  );
}
