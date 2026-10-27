import {
  ArrowRight, Cpu, Download, FlaskConical, GitCompareArrows, GraduationCap, Microscope, Play, RotateCcw, Search,
  Split, SquareChartGantt, Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GanttChart } from "../charts/GanttChart";
import { TopNav } from "../components/layout/Shell";
import { Badge } from "../components/ui";
import { FlowDiagram } from "../diagrams/Diagrams";
import { defaultConfig } from "../lib/algorithms";
import { api } from "../services/api";
import { DEMO_WORKLOAD } from "../state/LabContext";
import type { SimulationResult } from "../types";
import { TEAM } from "../lib/team";

function HeroTimeline() {
  const [res, setRes] = useState<SimulationResult | null>(null);
  const [err, setErr] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [runId, setRunId] = useState(0);
  useEffect(() => {
    api.run(DEMO_WORKLOAD, defaultConfig("rr", { params: { quantum: 3 }, context_switch_cost: 1 })).then(setRes, () => setErr(true));
  }, []);
  useEffect(() => {
    if (!res) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setCursor(res.end_time); return; }
    setCursor(0);
    const id = setInterval(() => setCursor((c) => { if (c >= res.end_time) { clearInterval(id); return c; } return c + 1; }), 140);
    return () => clearInterval(id);
  }, [res, runId]);
  const frame = res?.frames.filter((f) => f.time <= cursor).at(-1);
  return (
    <div className="glass edge-light relative rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-good shadow-[0_0_8px_#0ca30c]" />
          <span className="font-mono text-xs text-fg-muted">live engine · Round Robin q=3 · switch cost 1</span>
        </div>
        {res && <button onClick={() => setRunId((x) => x + 1)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-fg-faint hover:bg-white/10 hover:text-fg"><RotateCcw className="size-3" />replay</button>}
      </div>
      {err ? (
        <p className="py-10 text-center text-sm text-fg-faint">The engine is offline. Start the backend to see a live schedule here.</p>
      ) : !res ? (
        <div className="h-48 animate-pulse rounded-lg bg-white/[0.03]" />
      ) : (
        <>
          <GanttChart segments={res.segments} endTime={res.end_time} pids={res.workload.map((p) => p.pid)} cursor={cursor} showControls={false} compact title="Demo schedule" />
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2"><p className="eyebrow">t</p><p className="font-mono text-fg">{cursor}</p></div>
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2"><p className="eyebrow">CPU</p><p className="font-mono text-cyan-200">{frame?.running ?? (frame?.dispatching ? `→ ${frame.dispatching}` : "idle")}</p></div>
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2"><p className="eyebrow">Ready</p><p className="truncate font-mono text-fg-muted">{frame?.ready.join(" › ") || "—"}</p></div>
          </div>
        </>
      )}
    </div>
  );
}

const FEATURES = [
  { to: "/lab", icon: Cpu, title: "Interactive Scheduler Lab", body: "Build workloads with CPU and I/O bursts, run any of seven policies, and play the schedule forward or backward, one event at a time." },
  { to: "/compare", icon: GitCompareArrows, title: "Algorithm Arena", body: "Run up to eight configurations on an identical workload. Aligned Gantt charts and metrics side by side, with no hidden scores." },
  { to: "/replay", icon: SquareChartGantt, title: "Decision Replay", body: "Every dispatch, with the candidates the policy compared and the reason it chose, taken from the engine's own trace." },
  { to: "/what-if", icon: Split, title: "What-If Analysis", body: "Pin a baseline and change one thing (quantum, policy, switch cost) to see exactly what moves." },
  { to: "/experiments", icon: FlaskConical, title: "Experiment Studio", body: "Seeded workload classes, parameter sweeps with confidence intervals, and a reproducible SQLite history." },
  { to: "/learn", icon: GraduationCap, title: "OS Concepts Explorer", body: "Lifecycle, preemption, quanta, MLFQ, AQS and metrics, explained with diagrams and live engine examples." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <div className="app-backdrop" />
      <TopNav />
      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="grid items-center gap-10 pt-14 pb-16 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div className="animate-fade-up">
            <Badge tone="accent" className="mb-5">Operating Systems · Research Project</Badge>
            <h1 className="text-[42px] leading-[1.05] font-semibold tracking-tight sm:text-6xl">
              Sched<span className="bg-gradient-to-br from-violet-300 to-cyan-300 bg-clip-text text-transparent">X</span>
            </h1>
            <p className="mt-4 text-2xl font-medium tracking-tight text-fg sm:text-[28px]">Understand the decisions behind CPU scheduling.</p>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted">
              Explore scheduling algorithms, replay process execution, compare performance trade-offs, and investigate an adaptive scheduling policy in an interactive Operating Systems laboratory.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/lab" className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-violet-400 to-violet-600 px-5 font-medium text-white shadow-[0_10px_30px_-10px_rgb(139_92_246/0.9),inset_0_1px_0_rgb(255_255_255/0.25)] transition-transform hover:-translate-y-0.5">
                <Play className="size-4" /> Launch Scheduler Lab
              </Link>
              <Link to="/research" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 font-medium text-fg hover:bg-white/[0.09]">
                <Microscope className="size-4" /> Explore the Research
              </Link>
            </div>
            <p className="mt-6 text-xs text-fg-faint">SchedX is a simulator and research platform. It is not an operating system and does not modify the Linux kernel.</p>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]"><HeroTimeline /></div>
        </section>

        {/* At a glance */}
        <section aria-labelledby="glance" className="pb-16">
          <h2 id="glance" className="eyebrow mb-4">Project at a glance</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "The OS problem", b: "Many processes compete for one CPU. The scheduler decides who runs next and for how long, and that choice shapes every process's waiting and response time." },
              { t: "Research question", b: "Can a workload-adaptive time quantum improve response time for interactive and mixed workloads without unacceptable overhead, unfairness or starvation?" },
              { t: "Methodology", b: "A deterministic discrete-time simulator, identical seeded workloads, decision tracing, controlled comparisons and parameter sweeps." },
              { t: "Policies studied", b: "FCFS, SJF, SRTF, Round Robin, Priority (with ageing), Multilevel Feedback Queue, and the experimental Adaptive Quantum Scheduler (AQS)." },
            ].map((c) => (
              <div key={c.t} className="surface rounded-2xl p-4">
                <h3 className="text-sm font-semibold text-fg">{c.t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{c.b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Objectives */}
        <section aria-labelledby="objectives" className="-mt-8 pb-16">
          <div className="surface rounded-2xl p-5">
            <h2 id="objectives" className="text-sm font-semibold text-fg">Project objectives</h2>
            <ol className="mt-3 grid gap-2 text-[13px] text-fg-muted sm:grid-cols-2 lg:grid-cols-5">
              {[
                "Build a correct and testable scheduling simulator.",
                "Provide decision-level explainability.",
                "Compare established algorithms under controlled workloads.",
                "Evaluate the proposed AQS policy.",
                "Preserve reproducible experiment configurations.",
              ].map((o, i) => (
                <li key={o} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <span className="font-mono text-[10px] text-fg-faint">O{i + 1}</span>
                  <p className="mt-1 leading-snug">{o}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Problem */}
        <section aria-labelledby="why" className="grid gap-8 pb-16 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow mb-2 text-cyan/80">Problem & motivation</p>
            <h2 id="why" className="text-2xl font-semibold tracking-tight">Why CPU scheduling matters</h2>
          </div>
          <div className="space-y-4 text-[15px] leading-relaxed text-fg-muted">
            <p>A CPU core can only run one process at a time. When several processes are ready, the operating system must choose an order. That choice determines how long an interactive program waits before it first responds, how long a batch job takes to finish, and how much time is spent switching between processes instead of doing useful work.</p>
            <p>No single policy wins everywhere. Running short jobs first lowers average waiting time but can starve long jobs. Time slicing improves responsiveness but adds context switches. Priorities express importance but need ageing to stay fair. These are real trade-offs, and they shift with the workload.</p>
            <p>Comparing policies fairly therefore requires <span className="text-fg">identical workloads, explicit metric definitions and reproducible runs</span>. SchedX is built around those three requirements.</p>
          </div>
        </section>

        {/* Workflow */}
        <section aria-labelledby="flow" className="pb-16">
          <p className="eyebrow mb-2 text-cyan/80">Research workflow</p>
          <h2 id="flow" className="mb-5 text-2xl font-semibold tracking-tight">From workload to evidence</h2>
          <div className="surface rounded-2xl p-4 sm:p-5">
            <FlowDiagram label="Research workflow" steps={[
              { title: "Define workload", icon: <Users className="size-4 text-cyan-300" />, body: "Enter processes by hand, load a classroom example, or generate a seeded synthetic workload from a workload class (CPU-bound, I/O-heavy, interactive, mixed, high load)." },
              { title: "Choose scheduler", icon: <Cpu className="size-4 text-cyan-300" />, body: "Pick one of seven policies and its parameters: quantum, preemption, ageing, MLFQ slices and boost, AQS bounds, plus the simulated context-switch cost." },
              { title: "Run simulation", icon: <Play className="size-4 text-cyan-300" />, body: "The Python engine executes the workload tick by tick with a documented event order, recording a state snapshot at every event." },
              { title: "Inspect decisions", icon: <Search className="size-4 text-cyan-300" />, body: "Decision Replay shows which processes were candidates, what values the policy compared, whether preemption occurred and how AQS adjusted its quantum." },
              { title: "Compare metrics", icon: <GitCompareArrows className="size-4 text-cyan-300" />, body: "Response, waiting, turnaround, p95, throughput, utilisation, context switches and starvation indicators, side by side on the same workload." },
              { title: "Export experiment", icon: <Download className="size-4 text-cyan-300" />, body: "Save to SQLite with seed and configuration, verify reproducibility with one click, and export CSV or JSON for reports." },
            ]} />
          </div>
        </section>

        {/* Features */}
        <section aria-labelledby="features" className="pb-16">
          <p className="eyebrow mb-2 text-cyan/80">What you can do</p>
          <h2 id="features" className="mb-5 text-2xl font-semibold tracking-tight">A complete scheduling laboratory</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Link key={f.to} to={f.to} className="group surface rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:border-violet-400/40">
                <div className="mb-4 grid size-10 place-items-center rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-transparent">
                  <f.icon className="size-5 text-cyan-300" />
                </div>
                <h3 className="font-semibold text-fg">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{f.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-violet-200 group-hover:gap-2 transition-all">Open <ArrowRight className="size-3.5" /></span>
              </Link>
            ))}
          </div>
        </section>

        {/* Credits */}
        <section aria-labelledby="credits" className="pb-16">
          <div className="surface grid gap-6 rounded-2xl p-5 sm:p-6 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="eyebrow mb-2">Project credits</p>
              <h2 id="credits" className="text-lg font-semibold">SchedX: An Explainable, Workload-Adaptive CPU Scheduling and Performance Evaluation Platform</h2>
              <p className="mt-1 text-sm text-fg-faint">Operating Systems · Undergraduate engineering and research project</p>
            </div>
            <div>
              <p className="eyebrow mb-2">Developed by</p>
              <ul className="space-y-1 text-sm">
                {TEAM.students.map((s) => <li key={s.reg}><span className="text-fg">{s.name}</span> <span className="font-mono text-fg-faint">— {s.reg}</span></li>)}
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-2">Faculty Mentor</p>
              <p className="text-sm text-fg">{TEAM.mentor}</p>
              <Link to="/about" className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline">Project documentation <ArrowRight className="size-3" /></Link>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="pb-20">
          <div className="glass edge-light flex flex-col items-start justify-between gap-5 rounded-2xl p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 className="text-xl font-semibold">See a real schedule in under ten seconds.</h2>
              <p className="mt-1 text-sm text-fg-muted">Open the lab and press <span className="text-fg">Run demonstration</span>. No setup, no accounts.</p>
            </div>
            <Link to="/lab" className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-violet-400 to-violet-600 px-5 font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]">
              <Cpu className="size-4" /> Open the simulator
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-fg-faint">
        SchedX · {TEAM.students.map((s) => `${s.name} (${s.reg})`).join(" · ")} · Faculty Mentor: {TEAM.mentor}
      </footer>
    </div>
  );
}
