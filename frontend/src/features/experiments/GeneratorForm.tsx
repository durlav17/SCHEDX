import { InfoTip, Label, Select } from "../../components/ui";
import type { GeneratorConfig } from "../../types";

export const GEN_DEFAULTS: GeneratorConfig = {
  count: 8, seed: 42, arrival_pattern: "uniform", arrival_span: 20, mean_interarrival: 3,
  cpu_distribution: "uniform", cpu_min: 2, cpu_max: 12, cpu_mean: 6, short_fraction: 0.7,
  io_fraction: 0, io_cycles_max: 2, io_min: 2, io_max: 8, priority_min: 0, priority_max: 5,
};

type Field = { key: string; label: string; help?: string; show?: (g: GeneratorConfig) => boolean };
const NUMERIC: Field[] = [
  { key: "count", label: "Process count", help: "1–100 processes." },
  { key: "seed", label: "Random seed", help: "Same seed + same settings = identical workload." },
  { key: "arrival_span", label: "Arrival span", help: "Uniform arrivals are drawn from [0, span].", show: (g) => g.arrival_pattern === "uniform" },
  { key: "mean_interarrival", label: "Mean inter-arrival", help: "Poisson stream: mean gap between arrivals.", show: (g) => g.arrival_pattern === "poisson" },
  { key: "cpu_min", label: "CPU burst min" },
  { key: "cpu_max", label: "CPU burst max" },
  { key: "cpu_mean", label: "CPU burst mean", help: "Mean of the exponential distribution (clamped to [min, max]).", show: (g) => g.cpu_distribution === "exponential" },
  { key: "short_fraction", label: "Short-burst share", help: "Bimodal: probability that a burst is short (lowest quarter of the range).", show: (g) => g.cpu_distribution === "bimodal" },
  { key: "io_fraction", label: "I/O-bound share", help: "Probability (0–1) that a process alternates CPU and I/O bursts." },
  { key: "io_cycles_max", label: "Max I/O cycles", help: "An I/O-bound process gets 1..N extra (I/O, CPU) pairs.", show: (g) => Number(g.io_fraction) > 0 },
  { key: "io_min", label: "I/O min", show: (g) => Number(g.io_fraction) > 0 },
  { key: "io_max", label: "I/O max", show: (g) => Number(g.io_fraction) > 0 },
  { key: "priority_min", label: "Priority min", help: "0 = highest priority." },
  { key: "priority_max", label: "Priority max" },
];

/** Raw string values are kept while typing; the backend validates and explains errors. */
export function GeneratorForm({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const g = value as unknown as GeneratorConfig;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div>
        <Label htmlFor="g-ap">Arrival pattern</Label>
        <Select id="g-ap" value={value.arrival_pattern} onChange={(e) => set("arrival_pattern", e.target.value)}>
          <option value="uniform">Uniform</option><option value="poisson">Poisson</option><option value="simultaneous">Simultaneous (t=0)</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="g-cd">CPU burst distribution</Label>
        <Select id="g-cd" value={value.cpu_distribution} onChange={(e) => set("cpu_distribution", e.target.value)}>
          <option value="uniform">Uniform</option><option value="exponential">Exponential</option><option value="bimodal">Bimodal</option>
        </Select>
      </div>
      {NUMERIC.filter((f) => !f.show || f.show(g)).map((f) => (
        <div key={f.key}>
          <Label htmlFor={`g-${f.key}`}>{f.label}{f.help && <InfoTip>{f.help}</InfoTip>}</Label>
          <input id={`g-${f.key}`} className="field font-mono" inputMode="decimal" value={value[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

export function toStrings(g: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...GEN_DEFAULTS, ...g }).map(([k, v]) => [k, String(v)]));
}

export function toGenerator(v: Record<string, string>): GeneratorConfig {
  const out: GeneratorConfig = {};
  for (const [k, s] of Object.entries(v)) out[k] = k === "arrival_pattern" || k === "cpu_distribution" ? s : s.trim() === "" ? NaN : Number(s);
  // NaN is sent as null by JSON.stringify; the backend then reports the field as invalid.
  return out;
}
