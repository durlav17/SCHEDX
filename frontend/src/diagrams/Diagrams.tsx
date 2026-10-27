import { ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "../components/ui";
import { STATE_COLORS } from "../lib/colors";

// ------------------------------------------------------------- Process lifecycle
const STATES = [
  { id: "new", label: "New", x: 70, y: 70 },
  { id: "ready", label: "Ready", x: 250, y: 70 },
  { id: "running", label: "Running", x: 450, y: 70 },
  { id: "terminated", label: "Terminated", x: 640, y: 70 },
  { id: "blocked", label: "Blocked (I/O)", x: 350, y: 210 },
];
const EDGES: { from: string; to: string; label: string; d: string; lx: number; ly: number; text: string }[] = [
  { from: "new", to: "ready", label: "arrival", d: "M120 70 H195", lx: 158, ly: 60, text: "The process arrives at its arrival time and joins the tail of the ready queue." },
  { from: "ready", to: "running", label: "dispatch", d: "M305 62 H390", lx: 348, ly: 52, text: "The scheduling policy selects it. With a non-zero context-switch cost it first spends that time in Dispatching." },
  { from: "running", to: "ready", label: "preempt / slice expired", d: "M390 82 C360 110 330 110 305 82", lx: 348, ly: 120, text: "A preemptive policy found a better candidate, or the time quantum ran out. The process rejoins the ready queue." },
  { from: "running", to: "blocked", label: "CPU burst done, I/O starts", d: "M450 95 L385 185", lx: 470, ly: 150, text: "The current CPU burst finished and an I/O burst follows. The process leaves the CPU and waits for the device." },
  { from: "blocked", to: "ready", label: "I/O complete", d: "M315 185 L255 95", lx: 228, ly: 150, text: "The I/O burst finished. The process is ready again but must wait for the scheduler, not resume immediately." },
  { from: "running", to: "terminated", label: "final burst done", d: "M505 70 H575", lx: 540, ly: 60, text: "The last CPU burst completed. Completion time is recorded and the process leaves the system." },
];

export function LifecycleDiagram() {
  const [sel, setSel] = useState(1);
  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 720 260" className="min-w-[560px]" role="img" aria-label="Process lifecycle: New, Ready, Running, Blocked, Terminated with labelled transitions">
          <defs>
            <marker id="lc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#a3abbb" /></marker>
            <marker id="lc-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#22d3ee" /></marker>
          </defs>
          {EDGES.map((e, i) => (
            <g key={i} className="cursor-pointer" onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} tabIndex={0} onFocus={() => setSel(i)} role="button" aria-label={`${e.from} to ${e.to}: ${e.label}`}>
              <path d={e.d} fill="none" stroke="transparent" strokeWidth={16} />
              <path d={e.d} fill="none" stroke={sel === i ? "#22d3ee" : "#a3abbb"} strokeWidth={sel === i ? 2 : 1.4} markerEnd={`url(#${sel === i ? "lc-arrow-on" : "lc-arrow"})`} />
              <text x={e.lx} y={e.ly} textAnchor="middle" fontSize="10.5" fill={sel === i ? "#a5f3fc" : "#6f788a"}>{e.label}</text>
            </g>
          ))}
          {STATES.map((s) => (
            <g key={s.id}>
              <rect x={s.x - 52} y={s.y - 22} width={104} height={44} rx={12} fill="#12151c" stroke={STATE_COLORS[s.id]} strokeWidth={1.5} />
              <circle cx={s.x - 36} cy={s.y} r={4} fill={STATE_COLORS[s.id]} />
              <text x={s.x + 6} y={s.y + 4} textAnchor="middle" fontSize="12.5" fontWeight={600} fill="#e8eaf0">{s.label}</text>
            </g>
          ))}
        </svg>
      </div>
      <p className="mt-2 min-h-10 rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-fg-muted" aria-live="polite">
        <span className="font-medium text-cyan-200">{EDGES[sel].from} → {EDGES[sel].to}:</span> {EDGES[sel].text}
      </p>
    </div>
  );
}

// ------------------------------------------------------------- Flow diagram (workflow / methodology)
export function FlowDiagram({ steps, label }: { steps: { title: string; body: string; icon?: ReactNode }[]; label: string }) {
  const [sel, setSel] = useState(0);
  return (
    <div>
      <ol className="grid gap-2 sm:grid-cols-3 lg:grid-flow-col lg:grid-cols-none" aria-label={label}>
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex items-center">
            <button onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} aria-pressed={sel === i}
              className={cx("w-full rounded-xl border px-3 py-3 text-left transition-all", sel === i ? "border-cyan-400/50 bg-cyan-400/[0.07] shadow-[0_0_24px_-10px_#22d3ee]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/20")}>
              <span className="font-mono text-[10px] text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="mt-1 flex items-center gap-2 text-sm font-medium text-fg">{s.icon}{s.title}</span>
            </button>
            {i < steps.length - 1 && <ArrowRight className="mx-1 hidden size-4 shrink-0 text-fg-faint lg:block" aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2.5 text-sm leading-relaxed text-fg-muted" aria-live="polite">{steps[sel].body}</p>
    </div>
  );
}

// ------------------------------------------------------------- AQS feedback loop
export function AqsLoopDiagram() {
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 720 300" className="min-w-[560px]" role="img" aria-label="AQS feedback loop: at each dispatch measure ready-queue length L and recent overhead ratio rho, apply the rule, clamp the quantum, run the slice, and record the slice for the next measurement">
        <defs><marker id="aq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#22d3ee" /></marker></defs>
        {[
          { x: 40, y: 40, w: 190, t: "Dispatch decision", s: "next process = ready-queue head" },
          { x: 270, y: 40, w: 190, t: "Measure signals", s: "L = waiting processes, ρ = overhead share (last W slices)" },
          { x: 500, y: 40, w: 190, t: "Apply rule", s: "first match wins, one step of ±δ" },
          { x: 500, y: 190, w: 190, t: "Clamp", s: "q ∈ [q_min, q_max]" },
          { x: 270, y: 190, w: 190, t: "Run slice", s: "up to q tu, or until block/finish" },
          { x: 40, y: 190, w: 190, t: "Record slice", s: "(overhead, run length) → window" },
        ].map((b) => (
          <g key={b.t}>
            <rect x={b.x} y={b.y} width={b.w} height={70} rx={12} fill="#12151c" stroke="rgb(34 211 238 / 0.45)" />
            <text x={b.x + 14} y={b.y + 28} fontSize="13" fontWeight={600} fill="#e8eaf0">{b.t}</text>
            <foreignObject x={b.x + 14} y={b.y + 36} width={b.w - 24} height={32}><p style={{ fontSize: 10.5, color: "#a3abbb", lineHeight: 1.3, margin: 0 }}>{b.s}</p></foreignObject>
          </g>
        ))}
        <path d="M230 75 H262" stroke="#22d3ee" strokeWidth={1.6} markerEnd="url(#aq)" />
        <path d="M460 75 H492" stroke="#22d3ee" strokeWidth={1.6} markerEnd="url(#aq)" />
        <path d="M595 110 V182" stroke="#22d3ee" strokeWidth={1.6} markerEnd="url(#aq)" />
        <path d="M500 225 H468" stroke="#22d3ee" strokeWidth={1.6} markerEnd="url(#aq)" />
        <path d="M270 225 H238" stroke="#22d3ee" strokeWidth={1.6} markerEnd="url(#aq)" />
        <path d="M135 190 V118" stroke="#22d3ee" strokeWidth={1.6} markerEnd="url(#aq)" />
        <text x={360} y={150} textAnchor="middle" fontSize="11" fill="#6f788a">ρ &gt; limit → q+δ · L ≥ high → q−δ · L ≤ low → q+δ · else hold</text>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------- Metric anatomy
// One concrete process: arrives t=2, waits 3, runs 4 (first start t=5), blocks on I/O 3,
// waits 2, runs 2, completes t=16. Turnaround = 3 + 4 + 3 + 2 + 2 = 14. Response = 5 - 2 = 3.
const PIECES = [
  { s: 2, e: 5, kind: "ready" }, { s: 5, e: 9, kind: "running" }, { s: 9, e: 12, kind: "blocked" },
  { s: 12, e: 14, kind: "ready" }, { s: 14, e: 16, kind: "running" },
];
export function MetricAnatomyDiagram() {
  const x = (t: number) => 40 + t * 38;
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 700 210" className="min-w-[560px]" role="img" aria-label="Example process: arrival at 2, ready 2 to 5, running 5 to 9, blocked 9 to 12, ready 12 to 14, running 14 to 16. Response 3, ready wait 5, I/O 3, turnaround 14.">
        {Array.from({ length: 17 }, (_, t) => (
          <g key={t}><line x1={x(t)} x2={x(t)} y1={60} y2={100} stroke="rgb(255 255 255 / 0.06)" /><text x={x(t)} y={118} textAnchor="middle" fontSize="10" fill="#6f788a" className="font-mono">{t}</text></g>
        ))}
        {PIECES.map((p, i) => (
          <g key={i}>
            <rect x={x(p.s) + 1} y={66} width={x(p.e) - x(p.s) - 2} height={28} rx={5} fill={STATE_COLORS[p.kind]} opacity={0.9} />
            <text x={(x(p.s) + x(p.e)) / 2} y={84} textAnchor="middle" fontSize="10.5" fontWeight={600} fill="#07080b">{p.kind === "running" ? "CPU" : p.kind === "blocked" ? "I/O" : "ready"}</text>
          </g>
        ))}
        <text x={x(2)} y={52} textAnchor="middle" fontSize="10.5" fill="#e8eaf0">arrival</text>
        <text x={x(16)} y={52} textAnchor="middle" fontSize="10.5" fill="#e8eaf0">completion</text>
        {[
          { a: 2, b: 5, y: 140, t: "response time = first CPU start − arrival = 3", c: "#22d3ee" },
          { a: 2, b: 16, y: 190, t: "turnaround = completion − arrival = 14  (= ready 5 + CPU 6 + I/O 3)", c: "#a78bfa" },
        ].map((m) => (
          <g key={m.t}>
            <line x1={x(m.a)} x2={x(m.b)} y1={m.y} y2={m.y} stroke={m.c} strokeWidth={1.6} />
            <line x1={x(m.a)} x2={x(m.a)} y1={m.y - 5} y2={m.y + 5} stroke={m.c} /><line x1={x(m.b)} x2={x(m.b)} y1={m.y - 5} y2={m.y + 5} stroke={m.c} />
            <text x={x(m.a) + 4} y={m.y - 7} fontSize="10.5" fill={m.c}>{m.t}</text>
          </g>
        ))}
        <text x={x(9)} y={165} fontSize="10.5" fill="#c98500">ready wait = 3 + 2 = 5 (time in Ready, I/O excluded)</text>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------- Architecture
export const ARCH = [
  { id: "user", title: "User", sub: "Browser", body: "A student or faculty member defines workloads, chooses policies, plays schedules back and exports results." },
  { id: "fe", title: "React + TypeScript frontend", sub: "Vite · Tailwind · Recharts · custom SVG Gantt", body: "Renders the interface, validates input as you type and visualises engine output. It contains no scheduling logic: every schedule, trace and metric comes from the API. Exports CSV/JSON on the client from that API data." },
  { id: "api", title: "FastAPI application layer", sub: "backend/app/api · Pydantic schemas", body: "Validates request structure and routes requests to the engine. Converts engine validation errors into structured JSON errors, never tracebacks. Endpoints: run, compare, generate, sweep, plus experiment CRUD and a reproducibility check." },
  { id: "engine", title: "Standalone Python simulation engine", sub: "backend/app/engine · standard library only", body: "A deterministic discrete-time simulator with a fixed event order per tick: arrivals, I/O completion, quantum expiry, preemption, dispatch and context switches. It does not depend on FastAPI and is unit-tested directly." },
  { id: "algo", title: "Scheduling algorithms & event execution", sub: "backend/app/algorithms", body: "Seven policy classes behind a single interface (select, quantum, preempt_check, hooks): FCFS, SJF, SRTF, RR, Priority, MLFQ and the experimental AQS. Each produces its own explanation from the values it compared." },
  { id: "trace", title: "Decision trace & metrics", sub: "frames · decisions · backend/app/metrics", body: "Each event time stores a full state snapshot (a frame), and each dispatch stores a decision record. Metrics are computed from the per-process accounting (ready, dispatch, CPU, I/O), which is checked against the turnaround invariant." },
  { id: "out", title: "Results → interface · SQLite · exports", sub: "backend/app/persistence · CSV / JSON", body: "Results return to the UI as JSON. Saving an experiment reruns it on the server and stores inputs plus engine outputs in SQLite, so it can be reproduced. CSV and JSON exports contain exactly these results." },
];

export function ArchitectureDiagram() {
  const [sel, setSel] = useState("engine");
  const cur = ARCH.find((a) => a.id === sel)!;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ol className="space-y-0" aria-label="System architecture layers, top to bottom">
        {ARCH.map((a, i) => (
          <li key={a.id} className="flex flex-col items-center">
            <button onClick={() => setSel(a.id)} aria-pressed={sel === a.id}
              className={cx("w-full max-w-xl rounded-xl border px-4 py-3 text-left transition-all", sel === a.id ? "border-violet-400/60 bg-violet-500/10 shadow-[0_0_30px_-12px_#a78bfa]" : "border-white/[0.08] bg-ink-850 hover:border-white/20")}>
              <span className="block text-sm font-semibold text-fg">{a.title}</span>
              <span className="mt-0.5 block font-mono text-[11px] text-fg-faint">{a.sub}</span>
            </button>
            {i < ARCH.length - 1 && (
              <svg width="20" height="26" aria-hidden><path d="M10 2 V20" stroke="#6f788a" strokeWidth="1.5" /><path d="M5 16 L10 23 L15 16" fill="none" stroke="#6f788a" strokeWidth="1.5" /></svg>
            )}
          </li>
        ))}
        <li className="mt-3 flex justify-center gap-2">
          {["SQLite: backend/data/schedx.db", "CSV export", "JSON export"].map((o) => <span key={o} className="rounded-md border border-dashed border-cyan-400/40 px-2 py-1 font-mono text-[11px] text-cyan-200/80">{o}</span>)}
        </li>
      </ol>
      <div className="glass h-fit rounded-xl p-4 lg:sticky lg:top-6" aria-live="polite">
        <p className="eyebrow mb-1">Responsibility</p>
        <h3 className="font-semibold text-fg">{cur.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{cur.body}</p>
      </div>
    </div>
  );
}
