import { ArrowLeftRight, Pause, Play, RotateCcw, SquareChartGantt, StepBack, StepForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GanttChart, GanttLegend } from "../charts/GanttChart";
import { Badge, Button, Card, EmptyState, ErrorBanner, InfoTip, Label, PageHeader, Select, cx } from "../components/ui";
import { ConfigEditor } from "../features/scheduler/ConfigEditor";
import { RuntimeInspector, describeEvent } from "../features/scheduler/Inspector";
import { WorkloadSummary } from "../features/scheduler/WorkloadSummary";
import { ALGO, configLabel } from "../lib/algorithms";
import { colorMap } from "../lib/colors";
import { useLab } from "../state/LabContext";
import type { Decision, SimulationResult } from "../types";

const RULES: Record<string, string> = {
  fifo_head: "Head of the ready queue (FIFO order)",
  shortest_burst: "Minimum current CPU burst",
  shortest_remaining: "Minimum remaining CPU burst",
  highest_priority: "Minimum priority number (= highest priority)",
  highest_level_fifo: "Highest non-empty MLFQ level, FIFO within it",
};
const OUTCOME: Record<string, string> = {
  terminate: "terminated (final burst finished)",
  block: "blocked for I/O (CPU burst finished)",
  quantum: "used its full time slice and was requeued at the tail",
  preempt: "was preempted and returned to the ready queue",
};
const SIGNAL: Record<string, { label: string; tone: "accent" | "cyan" | "warn" | "neutral" }> = {
  overhead_pressure: { label: "Overhead pressure → grow", tone: "warn" },
  latency_pressure: { label: "Latency pressure → shrink", tone: "cyan" },
  light_load: { label: "Light load → grow", tone: "accent" },
  hold: { label: "Within bounds → hold", tone: "neutral" },
};
const SPEEDS = [0.5, 1, 2, 4];

function CandidateTable({ d, colors }: { d: Decision; colors: ReturnType<typeof colorMap> }) {
  if (!d.candidates.length) return null;
  const keys = Object.keys(d.candidates[0]).filter((k) => k !== "pid");
  const label: Record<string, string> = { ready_since: "Ready since", position: "Queue pos.", burst: "Current burst", remaining: "Remaining", priority: "Base prio", effective_priority: "Effective prio", level: "MLFQ level" };
  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
      <table className="data-table">
        <thead><tr><th>Candidate</th>{keys.map((k) => <th key={k}>{label[k] ?? k}</th>)}</tr></thead>
        <tbody>
          {d.candidates.map((c) => (
            <tr key={String(c.pid)} className={cx(c.pid === d.selected && "[&>td]:bg-cyan-400/[0.07]")}>
              <td className="font-mono text-fg">
                <span className="mr-1.5 inline-block size-2 rounded-sm" style={{ backgroundColor: colors[String(c.pid)]?.fill }} />
                {String(c.pid)} {c.pid === d.selected && <Badge tone="cyan" className="ml-1">selected</Badge>}
              </td>
              {keys.map((k) => <td key={k} className="font-mono">{String(c[k] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AqsTrace({ result, selected }: { result: SimulationResult; selected: Decision | null }) {
  const data = result.decisions.map((d) => ({ t: d.time, q: d.quantum, L: d.aqs?.ready_length ?? 0 }));
  return (
    <figure aria-label="AQS quantum at each dispatch">
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, result.end_time]} stroke="rgb(255 255 255 / 0.15)" tick={{ fill: "#6f788a", fontSize: 10 }} />
            <YAxis allowDecimals={false} stroke="rgb(255 255 255 / 0.15)" tick={{ fill: "#6f788a", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#12151c", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 8, fontSize: 12 }} labelFormatter={(t) => `dispatch at t=${t}`} formatter={(v: any, n: any) => [v, n === "q" ? "quantum" : "waiting (L)"]} />
            <Line type="stepAfter" dataKey="q" stroke="#22d3ee" strokeWidth={2} dot={{ r: 2.5, fill: "#22d3ee" }} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="L" stroke="#9085e9" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            {selected && <ReferenceLine x={selected.time} stroke="#a78bfa" strokeDasharray="4 3" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 flex gap-4 text-[11px] text-fg-faint">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-cyan-400" />quantum q</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-violet-400" />ready-queue length L at dispatch</span>
      </figcaption>
    </figure>
  );
}

export default function ReplayPage() {
  const lab = useLab();
  const result = lab.result;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const listRef = useRef<HTMLOListElement>(null);
  const n = result?.decisions.length ?? 0;
  const d = result && n ? result.decisions[Math.min(idx, n - 1)] : null;
  const frame = result && d ? result.frames[d.frame_index] : null;
  const colors = useMemo(() => colorMap(result?.workload.map((p) => p.pid) ?? []), [result]);

  useEffect(() => { setIdx(0); setPlaying(false); }, [result]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIdx((i) => { if (i >= n - 1) { setPlaying(false); return i; } return i + 1; }), 1000 / speed);
    return () => clearInterval(t);
  }, [playing, speed, n]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [idx]);

  const jumpToTime = (t: number) => {
    if (!result) return;
    let best = 0;
    result.decisions.forEach((x, i) => { if (x.time <= t) best = i; });
    setPlaying(false); setIdx(best);
  };

  const step = (delta: number) => { setPlaying(false); setIdx((i) => Math.max(0, Math.min(n - 1, i + delta))); };

  return (
    <>
      <PageHeader eyebrow="Decision Replay" title="Why did the scheduler choose that process?"
        description="Step through every dispatch decision the engine recorded. The explanation, candidate list, queues and process states shown are the snapshot taken at the moment of that decision. Nothing is reconstructed afterwards." />

      {!result ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Workload"><WorkloadSummary /></Card>
          <Card title="Scheduler" glass>
            <ConfigEditor value={lab.config} onChange={lab.setConfig} idPrefix="rp" />
            <Button variant="primary" size="lg" className="mt-4 w-full" icon={<Play className="size-4" />} loading={lab.running} disabled={!lab.validation.valid} onClick={() => lab.runSimulation()}>Run and open replay</Button>
            <div className="mt-3"><ErrorBanner messages={lab.error} onDismiss={lab.clearError} /></div>
            <p className="mt-3 text-xs text-fg-faint">Replay uses the same result as the Scheduler Lab. A run started here also appears there.</p>
          </Card>
        </div>
      ) : !d ? (
        <Card><EmptyState icon={<SquareChartGantt className="size-5" />} title="No decisions recorded" /></Card>
      ) : (
        <div className="space-y-5">
          <Card
            title={<span className="flex flex-wrap items-center gap-2">Recorded schedule <Badge tone="accent">{configLabel({ algorithm: result.algorithm, params: result.params, context_switch_cost: result.context_switch_cost, starvation_threshold: 50 })}</Badge>{lab.resultStale && <Badge tone="warn">inputs changed since this run</Badge>}</span>}
            subtitle="Click a segment to jump to the decision that started it. The violet marker shows the selected decision."
            actions={<Button size="sm" variant="ghost" icon={<ArrowLeftRight className="size-3.5" />} onClick={() => lab.resetResult()}>Choose another run</Button>}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Replay controls">
              <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setIdx(0); }} aria-label="Reset to first decision"><RotateCcw className="size-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => step(-1)} disabled={idx === 0} aria-label="Previous decision"><StepBack className="size-4" /></Button>
              {playing
                ? <Button size="sm" variant="primary" icon={<Pause className="size-4" />} onClick={() => setPlaying(false)}>Pause</Button>
                : <Button size="sm" variant="primary" icon={<Play className="size-4" />} onClick={() => { if (idx >= n - 1) setIdx(0); setPlaying(true); }}>Play</Button>}
              <Button size="sm" variant="ghost" onClick={() => step(1)} disabled={idx >= n - 1} aria-label="Next decision"><StepForward className="size-4" /></Button>
              <div className="flex items-center gap-2">
                <Label htmlFor="jump">Jump to</Label>
                <Select id="jump" value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="h-8 w-auto py-1 text-xs">
                  {result.decisions.map((x, i) => <option key={i} value={i}>#{i + 1} · t={x.time} · {x.selected}</option>)}
                </Select>
              </div>
              <Select aria-label="Replay speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="h-8 w-36 py-1 text-xs">
                {SPEEDS.map((s) => <option key={s} value={s}>{s} decisions/s</option>)}
              </Select>
              <span className="ml-auto font-mono text-xs text-fg-muted">decision {idx + 1} / {n}</span>
            </div>
            <GanttChart segments={result.segments} endTime={result.end_time} pids={result.workload.map((p) => p.pid)} marker={d.time} onSelectTime={jumpToTime} />
            <div className="mt-3"><GanttLegend pids={result.workload.map((p) => p.pid)} /></div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card title="Decision trace" subtitle={`${n} dispatch decisions`} bodyClass="p-0">
              <ol ref={listRef} className="max-h-[640px] overflow-y-auto p-2" aria-label="Decision events">
                {result.decisions.map((x, i) => (
                  <li key={i} data-idx={i}>
                    <button onClick={() => { setPlaying(false); setIdx(i); }} aria-current={i === idx}
                      className={cx("flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors", i === idx ? "bg-violet-500/15 ring-1 ring-violet-400/30" : "hover:bg-white/[0.04]")}>
                      <span className="mt-0.5 w-10 shrink-0 font-mono text-fg-faint">t={x.time}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-medium text-fg">
                          <span className="size-2 rounded-sm" style={{ backgroundColor: colors[x.selected]?.fill }} />
                          {x.selected} dispatched
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {x.preempted && <Badge tone="warn">preempted {x.previous_process}</Badge>}
                          {x.previous_outcome === "quantum" && <Badge>{x.previous_process} slice expired</Badge>}
                          {x.context_switch && x.context_switch.cost > 0 && <Badge tone="accent">switch {x.context_switch.cost}tu</Badge>}
                          {x.aqs?.adjusted && <Badge tone="cyan">q {x.aqs.previous_quantum}→{x.aqs.new_quantum}</Badge>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </Card>

            <div className="min-w-0 space-y-5">
              <Card glass className="edge-light" title={<span className="flex items-center gap-2">Decision #{idx + 1} at t={d.time} <Badge tone="cyan">{d.selected}</Badge></span>} subtitle={`${ALGO[d.algorithm].name} · rule: ${RULES[d.rule] ?? d.rule}`}>
                <p className="text-[15px] leading-relaxed text-fg">{d.explanation}</p>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg bg-white/[0.03] p-2.5">
                    <dt className="eyebrow">Previous process</dt>
                    <dd className="mt-1 text-fg-muted">{d.previous_process ? <><span className="font-mono text-fg">{d.previous_process}</span> {OUTCOME[d.previous_outcome ?? ""] ?? ""}</> : "CPU was idle or this is the first dispatch."}</dd>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-2.5">
                    <dt className="eyebrow">Preemption</dt>
                    <dd className="mt-1 text-fg-muted">{d.preempted ? d.preemption_reason : "No preemption occurred at this decision."}</dd>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-2.5">
                    <dt className="eyebrow">Context switch</dt>
                    <dd className="mt-1 text-fg-muted">
                      {d.context_switch ? <>From <span className="font-mono text-fg">{d.context_switch.from}</span> to <span className="font-mono text-fg">{d.context_switch.to}</span>, cost {d.context_switch.cost} tu{d.context_switch.cost ? `, so ${d.selected} starts running at t=${d.time + d.context_switch.cost}` : " (counted, zero cost)"}.</> : `No switch: ${d.previous_process ? "the same process continues" : "no previous process"}.`}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-2.5">
                    <dt className="eyebrow">Granted slice</dt>
                    <dd className="mt-1 font-mono text-fg">{d.quantum ? `${d.quantum} tu` : "until burst ends"}</dd>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-2.5">
                    <dt className="eyebrow">Selected burst</dt>
                    <dd className="mt-1 font-mono text-fg">{d.selected_remaining} tu now · {d.selected_cpu_left} tu CPU total left</dd>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-2.5">
                    <dt className="eyebrow">Policy parameters</dt>
                    <dd className="mt-1 break-words font-mono text-[11px] text-fg-muted">{Object.keys(d.params).length ? Object.entries(d.params).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" · ") : "none"}</dd>
                  </div>
                </dl>
                {d.aqs && (
                  <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-3">
                    <p className="eyebrow mb-2 flex items-center gap-1.5 text-cyan-200/80">AQS adjustment <InfoTip>Rule order: overhead ratio above the limit → grow; L ≥ high_load → shrink; L ≤ low_load → grow; otherwise hold. One step at a time, always clamped to [min, max].</InfoTip></p>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-mono text-lg text-fg">q {d.aqs.previous_quantum} → {d.aqs.new_quantum}</span>
                      <Badge tone={SIGNAL[d.aqs.signal].tone}>{SIGNAL[d.aqs.signal].label}</Badge>
                      <span className="font-mono text-xs text-fg-muted">L = {d.aqs.ready_length} · overhead ratio ρ = {d.aqs.overhead_ratio.toFixed(2)}</span>
                      {d.aqs.clamped && <Badge tone="warn">clamped</Badge>}
                    </div>
                    <p className="mt-2 text-xs text-fg-muted">{d.aqs.explanation}</p>
                  </div>
                )}
              </Card>

              <div className="grid gap-5 2xl:grid-cols-2">
                <Card title="Candidates considered" subtitle="Ready queue at decision time, with the keys the policy compared">
                  <CandidateTable d={d} colors={colors} />
                  {d.blocked.length > 0 && <p className="mt-3 text-xs text-fg-faint">Not eligible (blocked on I/O): {d.blocked.map((b) => `${b.pid} (${b.io_remaining} tu left)`).join(", ")}</p>}
                  {frame && frame.events.length > 0 && (
                    <div className="mt-3">
                      <p className="eyebrow mb-1">Events at this instant</p>
                      <ul className="space-y-0.5 font-mono text-xs text-fg-muted">{frame.events.map((e, i) => <li key={i}>{describeEvent(e)}</li>)}</ul>
                    </div>
                  )}
                </Card>
                {result.algorithm === "aqs" ? (
                  <Card title="AQS quantum trace" subtitle={`${result.aqs_adjustments.length} adjustments over ${n} dispatches`}><AqsTrace result={result} selected={d} /></Card>
                ) : (
                  <Card title="System state at this decision" glass><RuntimeInspector result={result} frame={frame} /></Card>
                )}
              </div>
              {result.algorithm === "aqs" && <Card title="System state at this decision" glass><RuntimeInspector result={result} frame={frame} /></Card>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
