import { Download, Plus, Shuffle, Trash, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Badge, Button, ErrorBanner, InfoTip, Label, Modal, Select } from "../../components/ui";
import { colorMap } from "../../lib/colors";
import { newRowId, nextPid, type ProcessRow } from "../../lib/workload";
import { api, ApiError } from "../../services/api";
import { downloadJSON } from "../../services/export";
import { useLab } from "../../state/LabContext";
import type { Process } from "../../types";

export function PresetSelect({ onLoad, id = "preset" }: { onLoad: (ps: Process[], name: string) => void; id?: string }) {
  const { presets } = useLab();
  return (
    <Select
      id={id}
      aria-label="Load example workload"
      value=""
      className="h-8 w-auto py-1 text-xs"
      onChange={(e) => {
        const p = presets.find((x) => x.key === e.target.value);
        if (p) onLoad(p.processes, `${p.name} example`);
      }}
    >
      <option value="" disabled>{presets.length ? "Load example…" : "Examples unavailable"}</option>
      {presets.map((p) => <option key={p.key} value={p.key}>{p.name}{p.kind === "generated" ? " (generated)" : ""}</option>)}
    </Select>
  );
}

export function GenerateDialog({ open, onClose, onGenerated }: { open: boolean; onClose: () => void; onGenerated: (ps: Process[], name: string) => void }) {
  const [form, setForm] = useState({ count: "8", seed: "42", arrival_pattern: "uniform", arrival_span: "20", cpu_distribution: "uniform", cpu_min: "2", cpu_max: "12", io_fraction: "0.3" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const g: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(form)) g[k] = k.endsWith("pattern") || k.endsWith("distribution") ? v : Number(v);
      const r = await api.generate(g);
      onGenerated(r.processes, `Generated (seed ${r.generator.seed})`);
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.messages : [String(e)]);
    } finally {
      setBusy(false);
    }
  };
  const num = (k: keyof typeof form, label: string, help?: string) => (
    <div>
      <Label htmlFor={`gen-${k}`} help={help}>{label}</Label>
      <input id={`gen-${k}`} className="field font-mono" value={form[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  return (
    <Modal open={open} onClose={onClose} title="Generate a reproducible workload"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit} icon={<Shuffle className="size-4" />}>Generate</Button></>}>
      <p className="mb-4 text-xs text-fg-faint">The backend's seeded generator creates the processes. The same seed and settings always give the same workload. The Experiment Studio has the full set of generator controls.</p>
      <div className="grid grid-cols-2 gap-3">
        {num("count", "Processes", "1–100")}
        {num("seed", "Random seed")}
        <div>
          <Label htmlFor="gen-ap">Arrivals</Label>
          <Select id="gen-ap" value={form.arrival_pattern} onChange={(e) => set("arrival_pattern", e.target.value)}>
            <option value="uniform">Uniform in span</option><option value="poisson">Poisson stream</option><option value="simultaneous">All at t=0</option>
          </Select>
        </div>
        {num("arrival_span", "Arrival span", "Uniform pattern: arrivals drawn from [0, span].")}
        <div>
          <Label htmlFor="gen-cd">CPU bursts</Label>
          <Select id="gen-cd" value={form.cpu_distribution} onChange={(e) => set("cpu_distribution", e.target.value)}>
            <option value="uniform">Uniform</option><option value="exponential">Exponential</option><option value="bimodal">Bimodal</option>
          </Select>
        </div>
        {num("io_fraction", "I/O fraction", "Probability (0–1) that a process alternates CPU and I/O bursts.")}
        {num("cpu_min", "CPU min")}
        {num("cpu_max", "CPU max")}
      </div>
      <div className="mt-3"><ErrorBanner messages={err} title="Generator rejected the settings" /></div>
    </Modal>
  );
}

export function WorkloadEditor() {
  const { rows, setRows, validation, setWorkload, workloadName } = useLab();
  const [genOpen, setGenOpen] = useState(false);
  const [importErr, setImportErr] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const colors = colorMap(rows.map((r) => r.pid.trim()));
  const update = (id: string, k: keyof ProcessRow, v: string) => setRows(rows.map((r) => (r.id === id ? { ...r, [k]: v } : r)));

  const onImport = async (f: File) => {
    setImportErr(null);
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : data.workload ?? data.processes;
      if (!Array.isArray(list)) throw new Error("Expected a JSON array of processes, or an object with a 'workload' array.");
      setWorkload(list.map((p: any) => ({ pid: String(p.pid ?? ""), arrival: p.arrival, bursts: p.bursts ?? [], priority: p.priority ?? 0 })), f.name);
    } catch (e) {
      setImportErr([e instanceof Error ? e.message : String(e)]);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="cyan">{workloadName}</Badge>
        <span className="text-xs text-fg-faint">{rows.length} process{rows.length === 1 ? "" : "es"}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <PresetSelect onLoad={setWorkload} />
          <Button size="sm" variant="ghost" icon={<Shuffle className="size-3.5" />} onClick={() => setGenOpen(true)}>Generate</Button>
          <Button size="sm" variant="ghost" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>Import</Button>
          <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} disabled={!validation.valid} onClick={() => downloadJSON("schedx-workload.json", validation.processes)}>Export</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
        </div>
      </div>
      <div className="max-h-[360px] overflow-auto rounded-lg border border-white/[0.06]">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" className="w-24">PID</th>
              <th scope="col" className="w-20">Arrival</th>
              <th scope="col" className="min-w-[150px]">
                <span className="inline-flex items-center gap-1">Bursts <InfoTip>Alternating CPU and I/O durations, starting and ending with CPU, e.g. <code>4, 3, 2</code> = 4 CPU, 3 I/O, 2 CPU.</InfoTip></span>
              </th>
              <th scope="col" className="w-20"><span className="inline-flex items-center gap-1">Prio <InfoTip>Smaller number = higher priority (0 is highest). Only Priority scheduling uses it.</InfoTip></span></th>
              <th scope="col" className="w-10"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = validation.errors[r.id] ?? {};
              const cell = (k: "pid" | "arrival" | "bursts" | "priority", cls = "") => (
                <td className="align-top">
                  <input
                    aria-label={`${k} of ${r.pid || "process"}`}
                    className={`field h-8 py-1 font-mono text-xs ${cls} ${e[k] ? "field-error" : ""}`}
                    value={r[k]}
                    aria-invalid={!!e[k]}
                    onChange={(ev) => update(r.id, k, ev.target.value)}
                  />
                  {e[k] && <p className="mt-1 text-[10.5px] leading-tight text-red-300">{e[k]}</p>}
                </td>
              );
              return (
                <tr key={r.id}>
                  <td className="align-top">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colors[r.pid.trim()]?.fill }} aria-hidden />
                      <input aria-label="Process ID" className={`field h-8 py-1 font-mono text-xs ${e.pid ? "field-error" : ""}`} value={r.pid} aria-invalid={!!e.pid} onChange={(ev) => update(r.id, "pid", ev.target.value)} />
                    </div>
                    {e.pid && <p className="mt-1 pl-4 text-[10.5px] text-red-300">{e.pid}</p>}
                  </td>
                  {cell("arrival")}
                  {cell("bursts")}
                  {cell("priority")}
                  <td className="align-top">
                    <button onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className="mt-1 rounded-md p-1.5 text-fg-faint hover:bg-critical/15 hover:text-red-300" aria-label={`Remove ${r.pid}`}>
                      <Trash className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-fg-faint">No processes yet. Add one, or load an example workload.</p>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Button size="sm" icon={<Plus className="size-3.5" />} disabled={rows.length >= 100}
          onClick={() => setRows([...rows, { id: newRowId(), pid: nextPid(rows), arrival: "0", bursts: "4", priority: "0" }])}>
          Add process
        </Button>
        {rows.length > 0 && (
          <button className="text-xs text-fg-faint hover:text-red-300" onClick={() => setRows([])}>Clear all</button>
        )}
      </div>
      {importErr && <div className="mt-3"><ErrorBanner messages={importErr} title="Could not import workload" onDismiss={() => setImportErr(null)} /></div>}
      <GenerateDialog open={genOpen} onClose={() => setGenOpen(false)} onGenerated={setWorkload} />
    </div>
  );
}
