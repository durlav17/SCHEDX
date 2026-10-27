import { useEffect, useState } from "react";
import { Badge, Label, Select, Toggle } from "../../components/ui";
import { ALGO, ALGORITHMS, defaultConfig, type ParamField } from "../../lib/algorithms";
import type { AlgorithmKey, SchedulerConfig } from "../../types";

function ParamInput({ field, value, onChange, id }: { field: ParamField; value: unknown; onChange: (v: unknown) => void; id: string }) {
  // Keep the raw text so invalid input is shown, not silently corrected.
  const [text, setText] = useState(field.kind === "intlist" ? (value as number[] | undefined)?.join(", ") ?? "" : String(value ?? ""));
  useEffect(() => {
    setText(field.kind === "intlist" ? (value as number[] | undefined)?.join(", ") ?? "" : String(value ?? ""));
  }, [value, field.kind]);

  if (field.kind === "bool") return <Toggle id={id} checked={!!value} onChange={onChange} label={field.label} />;

  const parse = (t: string): { ok: boolean; v?: unknown; msg?: string } => {
    if (field.kind === "intlist") {
      const parts = t.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 3 || parts.length > 5) return { ok: false, msg: "3–5 values" };
      if (parts.some((p) => !/^\d+$/.test(p) || +p < 1 || +p > 500)) return { ok: false, msg: "Integers 1–500" };
      return { ok: true, v: parts.map(Number) };
    }
    const n = Number(t);
    if (t.trim() === "" || Number.isNaN(n)) return { ok: false, msg: "Required" };
    if (field.kind === "int" && !Number.isInteger(n)) return { ok: false, msg: "Whole number" };
    if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) return { ok: false, msg: `${field.min}–${field.max}` };
    return { ok: true, v: n };
  };
  const p = parse(text);
  return (
    <div>
      <input
        id={id}
        className={`field font-mono ${p.ok ? "" : "field-error"}`}
        inputMode={field.kind === "intlist" ? "text" : "decimal"}
        value={text}
        aria-invalid={!p.ok}
        onChange={(e) => {
          setText(e.target.value);
          const r = parse(e.target.value);
          if (r.ok) onChange(r.v);
        }}
      />
      {!p.ok && <p className="mt-1 text-[11px] text-red-300">{p.msg}</p>}
    </div>
  );
}

export function ConfigEditor({ value, onChange, idPrefix = "cfg", compact }: { value: SchedulerConfig; onChange: (c: SchedulerConfig) => void; idPrefix?: string; compact?: boolean }) {
  const meta = ALGO[value.algorithm];
  const setParam = (k: string, v: unknown) => onChange({ ...value, params: { ...value.params, [k]: v } });
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${idPrefix}-algo`}>Scheduling algorithm</Label>
        <Select
          id={`${idPrefix}-algo`}
          value={value.algorithm}
          onChange={(e) => onChange(defaultConfig(e.target.value as AlgorithmKey, { context_switch_cost: value.context_switch_cost, starvation_threshold: value.starvation_threshold }))}
        >
          {ALGORITHMS.map((a) => <option key={a.key} value={a.key}>{a.short} — {a.name}{a.key === "aqs" ? " (experimental)" : ""}</option>)}
        </Select>
        {!compact && (
          <p className="mt-2 text-xs leading-relaxed text-fg-faint">
            <Badge tone={meta.key === "aqs" ? "accent" : "neutral"} className="mr-1.5">{meta.preemptive}</Badge>
            {meta.blurb}
          </p>
        )}
      </div>
      {meta.fields.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {meta.fields.map((f) => (
            <div key={f.key} className={f.kind === "intlist" ? "col-span-2" : f.kind === "bool" ? "col-span-2 flex items-center justify-between" : undefined}>
              <Label htmlFor={`${idPrefix}-${f.key}`} help={f.help}>{f.label}</Label>
              <ParamInput id={`${idPrefix}-${f.key}`} field={f} value={value.params[f.key]} onChange={(v) => setParam(f.key, v)} />
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3">
        <div>
          <Label htmlFor={`${idPrefix}-cs`} help="Simulated cost (time units) charged when the CPU switches to a different process. A model parameter, not a measured hardware cost.">Context switch</Label>
          <ParamInput id={`${idPrefix}-cs`} field={{ key: "cs", label: "", kind: "int", min: 0, max: 20, help: "" }} value={value.context_switch_cost} onChange={(v) => onChange({ ...value, context_switch_cost: v as number })} />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-st`} help="A process is flagged as a starvation case when one uninterrupted ready-queue wait reaches this many time units. A simulation indicator only.">Starvation flag</Label>
          <ParamInput id={`${idPrefix}-st`} field={{ key: "st", label: "", kind: "int", min: 1, max: 100000, help: "" }} value={value.starvation_threshold} onChange={(v) => onChange({ ...value, starvation_threshold: v as number })} />
        </div>
      </div>
    </div>
  );
}
