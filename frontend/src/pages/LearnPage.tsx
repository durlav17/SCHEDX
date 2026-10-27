import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, PageHeader, cx } from "../components/ui";
import { AqsLoopDiagram, LifecycleDiagram, MetricAnatomyDiagram } from "../diagrams/Diagrams";
import { LiveExample } from "../diagrams/LiveExample";
import { defaultConfig } from "../lib/algorithms";
import { STATE_COLORS } from "../lib/colors";
import type { Process } from "../types";

const P = (pid: string, arrival: number, bursts: number[], priority = 0): Process => ({ pid, arrival, bursts, priority });
const THREE = [P("A", 0, [6]), P("B", 1, [3]), P("C", 2, [2])];
const CONVOY = [P("Long", 0, [10]), P("S1", 1, [1]), P("S2", 1, [1]), P("S3", 2, [1])];
const IO = [P("A", 0, [3, 4, 3]), P("B", 0, [5])];
const STARVE = [P("Low", 0, [3], 5), ...Array.from({ length: 6 }, (_, i) => P(`H${i + 1}`, i * 3, [3], 0))];

function QuantumExplorer() {
  const [q, setQ] = useState(2);
  return (
    <div>
      <label className="mb-3 flex items-center gap-3 text-sm text-fg-muted">
        Quantum <input type="range" min={1} max={8} value={q} onChange={(e) => setQ(Number(e.target.value))} className="accent-cyan-400" aria-label="Round Robin quantum" />
        <span className="font-mono text-fg">q = {q}</span>
      </label>
      <LiveExample workload={THREE} configs={[defaultConfig("rr", { params: { quantum: q } })]} labels={[`Round Robin, q=${q} (A:6, B:3, C:2 arriving at 0, 1, 2)`]} />
    </div>
  );
}

function SwitchCostExplorer() {
  const [cs, setCs] = useState(1);
  return (
    <div>
      <label className="mb-3 flex items-center gap-3 text-sm text-fg-muted">
        Switch cost <input type="range" min={0} max={4} value={cs} onChange={(e) => setCs(Number(e.target.value))} className="accent-cyan-400" aria-label="Context-switch cost" />
        <span className="font-mono text-fg">{cs} tu</span>
      </label>
      <LiveExample workload={THREE} configs={[defaultConfig("rr", { params: { quantum: 1 }, context_switch_cost: cs }), defaultConfig("rr", { params: { quantum: 4 }, context_switch_cost: cs })]}
        labels={[`RR q=1, cost ${cs}`, `RR q=4, cost ${cs}`]} metrics={["avg_response", "avg_turnaround", "context_switches"]} />
    </div>
  );
}

function CpuSliceDiagram() {
  const slices = [["A", 0, 2], ["B", 2, 4], ["C", 4, 6], ["A", 6, 8], ["B", 8, 9], ["A", 9, 11]] as const;
  const fill: Record<string, string> = { A: "#3987e5", B: "#d95926", C: "#199e70" };
  return (
    <svg viewBox="0 0 480 70" className="w-full max-w-xl" role="img" aria-label="CPU time divided into slices of 2 time units taken in turn by A, B and C">
      {slices.map(([p, s, e], i) => (
        <g key={i}><rect x={10 + s * 40} y={10} width={(e - s) * 40 - 2} height={30} rx={4} fill={fill[p]} /><text x={10 + s * 40 + ((e - s) * 40) / 2} y={30} textAnchor="middle" fontSize="12" fontWeight={600} fill="#fff">{p}</text></g>
      ))}
      {Array.from({ length: 12 }, (_, t) => <text key={t} x={10 + t * 40} y={58} fontSize="10" fill="#6f788a" textAnchor="middle">{t}</text>)}
    </svg>
  );
}

interface Topic { id: string; title: string; body: ReactNode; diagram?: ReactNode; example: ReactNode; interactive?: ReactNode; why: ReactNode; myths: string[] }

const TOPICS: Topic[] = [
  {
    id: "scheduling", title: "What is CPU scheduling?",
    body: <>When more processes are ready than there are CPUs, the operating system's short-term scheduler picks which one runs next and for how long. SchedX models one CPU and a set of processes, each described by an arrival time and a sequence of CPU and I/O bursts.</>,
    diagram: <CpuSliceDiagram />,
    example: <>Three processes share one CPU. Each segment in the chart is a span of time during which one process owns the CPU. The scheduling policy decides the order and length of those segments.</>,
    why: <>The policy decides how long programs wait, how quickly interactive programs respond, and how much CPU time is lost to switching.</>,
    myths: ["\"A faster CPU makes scheduling irrelevant.\" Contention still exists whenever demand exceeds one CPU.", "\"Scheduling only matters for servers.\" Interactive responsiveness on any system depends on it."],
  },
  {
    id: "lifecycle", title: "Process lifecycle",
    body: <>A process moves between five states. SchedX adds a sixth, <em>Dispatching</em>, for time spent loading its context when the context-switch cost is non-zero. Hover over or select an arrow to read what the transition means in the engine.</>,
    diagram: <LifecycleDiagram />,
    example: <>A process with bursts <code>3, 4, 3</code> arrives (New → Ready), runs 3 (Running), performs 4 of I/O (Blocked), becomes Ready again, runs 3 more, and terminates.</>,
    interactive: <LiveExample workload={IO} configs={[defaultConfig("fcfs")]} labels={["FCFS on A: 3,4,3 and B: 5 (B runs while A is blocked)"]} />,
    why: <>Each metric is defined in terms of time spent in these states, so understanding the states means understanding the numbers.</>,
    myths: ["\"A process that finishes I/O resumes immediately.\" It returns to Ready and must be dispatched again.", "\"Blocked time counts as waiting time.\" SchedX keeps ready waiting and I/O time separate."],
  },
  {
    id: "states", title: "Ready, running and blocked",
    body: <><b className="text-fg">Ready</b>: able to run, waiting for the CPU. <b className="text-fg">Running</b>: executing on the CPU (at most one process at a time). <b className="text-fg">Blocked</b>: waiting for I/O and not eligible for the CPU. Only Ready processes are scheduling candidates.</>,
    diagram: (
      <div className="flex flex-wrap gap-3 text-sm">
        {(["ready", "running", "blocked"] as const).map((s) => <span key={s} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2"><span className="size-3 rounded-full" style={{ backgroundColor: STATE_COLORS[s] }} />{s}</span>)}
      </div>
    ),
    example: <>In the I/O example above, while A is blocked between t=3 and t=7, B is the only candidate, so the CPU stays busy instead of going idle. This overlap is why mixing CPU and I/O work raises utilisation.</>,
    why: <>The overlap of CPU work and I/O is the reason multiprogramming exists at all.</>,
    myths: ["\"Blocked processes are in the ready queue.\" They are not: the Lab shows them separately."],
  },
  {
    id: "preemption", title: "Preemptive vs non-preemptive",
    body: <>A <b className="text-fg">non-preemptive</b> scheduler lets the running process keep the CPU until its burst ends (FCFS, SJF, non-preemptive Priority). A <b className="text-fg">preemptive</b> scheduler may take the CPU away when a better candidate appears or a time slice expires (SRTF, RR, preemptive Priority, MLFQ, AQS).</>,
    example: <>Same workload, two policies. SJF lets A finish its 6-unit burst. SRTF preempts A at t=1, when B arrives with a shorter remaining time. The yellow triangle marks the preemption.</>,
    interactive: <LiveExample workload={THREE} configs={[defaultConfig("sjf"), defaultConfig("srtf")]} labels={["SJF (non-preemptive)", "SRTF (preemptive)"]} />,
    why: <>Preemption gives better response times for short or urgent work, but every preemption is a context switch.</>,
    myths: ["\"Preemptive is always better.\" It adds switches and can starve long jobs.", "\"SRTF preempts on ties.\" SchedX preempts only on a strictly shorter remaining time."],
  },
  {
    id: "fcfs", title: "FCFS",
    body: <>First Come, First Served dispatches the process that entered the ready queue earliest and runs it until its burst ends. Ties between simultaneous arrivals follow input order.</>,
    example: <>The <em>convoy effect</em>: one long job arrives first, and three 1-unit jobs queue behind it.</>,
    interactive: <LiveExample workload={CONVOY} configs={[defaultConfig("fcfs"), defaultConfig("sjf")]} labels={["FCFS: short jobs wait behind Long", "SJF on the same workload, for contrast"]} />,
    why: <>It is the simplest fair-by-arrival baseline, and it has no starvation, but its average waiting time is very sensitive to arrival order.</>,
    myths: ["\"FCFS is fair, so it is good.\" Fair by arrival order is not the same as low waiting time."],
  },
  {
    id: "sjf", title: "SJF and SRTF",
    body: <>SJF chooses the ready process with the shortest <em>current CPU burst</em>. SchedX uses the exact burst length as the estimate, a simplification real systems cannot make. SRTF is the preemptive version: it compares remaining times whenever the ready set changes.</>,
    example: <>For CPU-only workloads with all processes present, SJF minimises average waiting time. SRTF extends this to arrivals over time, at the cost of preemptions.</>,
    interactive: <LiveExample workload={THREE} configs={[defaultConfig("fcfs"), defaultConfig("sjf"), defaultConfig("srtf")]} labels={["FCFS", "SJF", "SRTF"]} />,
    why: <>It sets the benchmark for low average waiting time, and shows clearly why knowing burst lengths matters.</>,
    myths: ["\"SJF is implementable as-is.\" Real schedulers must predict bursts, for example by exponential averaging.", "\"SJF never starves anyone.\" A steady stream of short jobs can postpone a long one indefinitely."],
  },
  {
    id: "rr", title: "Round Robin and the time quantum",
    body: <>Round Robin serves the ready queue in order and grants each process at most one <b className="text-fg">quantum</b> per turn. A process that uses its whole quantum rejoins the tail of the queue. In SchedX, processes arriving at that same instant are queued before it.</>,
    diagram: <CpuSliceDiagram />,
    example: <>Move the slider to see how the execution order and the number of switches change with the quantum. With a large quantum, RR behaves like FCFS.</>,
    interactive: <QuantumExplorer />,
    why: <>The quantum is the main parameter trading responsiveness against overhead, and it is what AQS adapts.</>,
    myths: ["\"Smaller quantum is always more responsive.\" Once switch costs are included, overhead eventually dominates."],
  },
  {
    id: "priority", title: "Priority scheduling and starvation",
    body: <>Each process has a priority. In SchedX <b className="text-fg">a smaller number means higher priority</b> (0 is highest), everywhere. With preemption, a strictly higher-priority arrival takes the CPU. <b className="text-fg">Ageing</b> improves a waiting process's effective priority by one level for every <code>aging_interval</code> time units it has waited.</>,
    example: <>A low-priority process (5) competes with a stream of high-priority (0) jobs. Without ageing, it waits until the stream ends. With ageing, it eventually outranks the newcomers.</>,
    interactive: <LiveExample workload={STARVE} configs={[defaultConfig("priority", { params: { preemptive: true, aging_interval: 0 } }), defaultConfig("priority", { params: { preemptive: true, aging_interval: 2 } })]} labels={["Preemptive priority, no ageing", "Preemptive priority, ageing every 2 tu"]} metrics={["avg_response", "avg_turnaround", "context_switches"]} />,
    why: <>Priorities express importance, and starvation is their classic failure mode.</>,
    myths: ["\"Starvation means the process never finishes.\" In a finite simulation it does finish. SchedX flags starvation when one ready-queue wait reaches a threshold."],
  },
  {
    id: "mlfq", title: "Multilevel Feedback Queue",
    body: <>MLFQ keeps several FIFO queues. New processes start at level 0 (highest). Using a full slice demotes a process one level. Blocking before the slice ends keeps its level. A higher level always preempts a lower one. Every <code>boost_interval</code>, all processes return to level 0, so long jobs cannot starve forever.</>,
    example: <>CPU-heavy processes sink to the long-slice levels, while short interactive bursts stay near the top. The policy learns the workload from behaviour instead of being told burst lengths.</>,
    interactive: <LiveExample workload={[P("Batch", 0, [14]), P("Inter", 2, [1, 3, 1, 3, 1])]} configs={[defaultConfig("mlfq", { params: { quanta: [2, 4, 8], boost_interval: 0 } }), defaultConfig("rr", { params: { quantum: 4 } })]} labels={["MLFQ [2, 4, 8]", "RR q=4"]} />,
    why: <>It approximates SJF without knowing the future, which is why its descendants appear in real systems.</>,
    myths: ["\"MLFQ cannot be gamed.\" A process that blocks just before its slice ends stays at the top. SchedX's rule 5 has this weakness on purpose, so it can be demonstrated."],
  },
  {
    id: "aqs", title: "Adaptive Quantum Scheduling (AQS)",
    body: <>AQS is SchedX's experimental Round Robin variant. At every dispatch it measures the ready-queue length L and the recent overhead ratio ρ. Then it grows, shrinks or holds the quantum by at most one step, within fixed bounds. Every adjustment is recorded in the decision trace.</>,
    diagram: <AqsLoopDiagram />,
    example: <>With many processes waiting, AQS shortens the quantum so each one gets the CPU sooner. If switching starts to dominate, the overhead rule takes over and lengthens the quantum.</>,
    interactive: <LiveExample workload={[P("A", 0, [12]), P("B", 0, [12]), P("C", 1, [2]), P("D", 1, [2]), P("E", 2, [2]), P("F", 3, [2])]} configs={[defaultConfig("rr", { params: { quantum: 4 } }), defaultConfig("aqs")]} labels={["RR q=4", "AQS (q0=4, bounds 2..12)"]} />,
    why: <>It is the project's research subject. Whether it helps, and on which workloads, is an open question that the experiments answer.</>,
    myths: ["\"Adaptive means better.\" AQS can lose on turnaround or switches. The research page treats this as a hypothesis.", "\"AQS is new.\" Dynamic-quantum RR variants are a known idea. The contribution here is a transparent, testable specification."],
  },
  {
    id: "context", title: "Context-switch overhead",
    body: <>Switching the CPU to a different process costs time: saving and restoring registers, address-space changes, cache effects. SchedX models this as a fixed, configurable cost charged whenever the dispatched process differs from the last one that executed. The overhead is not counted as useful CPU time.</>,
    example: <>Compare a tiny quantum with a larger one as the cost rises. The hatched segments are switches.</>,
    interactive: <SwitchCostExplorer />,
    why: <>Overhead is the hidden price of responsiveness, and the key reason quantum sizes are not tiny.</>,
    myths: ["\"The simulated cost is the real cost.\" It is a model parameter, not a hardware measurement."],
  },
  {
    id: "metrics", title: "Response, waiting and turnaround",
    body: <><b className="text-fg">Response</b> = first CPU start − arrival. <b className="text-fg">Ready waiting</b> = time spent in Ready. <b className="text-fg">Turnaround</b> = completion − arrival, which SchedX decomposes exactly as ready wait + dispatch wait + CPU + I/O.</>,
    diagram: <MetricAnatomyDiagram />,
    example: <>The process above arrives at 2, first runs at 5 (response 3), waits 3 + 2 = 5 in Ready, blocks on I/O for 3, and completes at 16 (turnaround 14).</>,
    why: <>Different users care about different metrics: interactive users care about response, batch users about turnaround.</>,
    myths: ["\"Waiting time = turnaround − burst time.\" That formula ignores I/O and switch time, which SchedX tracks separately.", "\"Averages tell the whole story.\" p95 reveals tail latency that a mean can hide."],
  },
  {
    id: "repro", title: "Reproducible experiments",
    body: <>The engine is deterministic: there is no randomness inside the simulation, and every tie-break is fixed. Randomness exists only in the workload generator, which uses a private seeded random number generator. So the same seed and settings always give the same workload, and the same workload and configuration always give the same results.</>,
    example: <>Save an experiment in the Studio, then press <em>verify</em> in History. The server regenerates and reruns it and checks that the stored results match exactly.</>,
    why: <>Claims about scheduling are only credible when someone else can rerun the experiment.</>,
    myths: ["\"One run is enough.\" For randomised workloads, repeat over several seeds and report confidence intervals."],
  },
];

export default function LearnPage() {
  const [active, setActive] = useState(TOPICS[0].id);
  return (
    <>
      <PageHeader eyebrow="OS Concepts Explorer" title="The ideas behind every schedule"
        description="Thirteen short lessons, written to match what the SchedX engine actually implements. Most examples are not drawings: they run live through the same engine as the Lab." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Topics" className="lg:sticky lg:top-8 lg:h-fit">
          <ol className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            {TOPICS.map((t, i) => (
              <li key={t.id} className="shrink-0">
                <a href={`#${t.id}`} onClick={() => setActive(t.id)} className={cx("block rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors lg:whitespace-normal", active === t.id ? "bg-white/[0.07] text-fg" : "text-fg-muted hover:text-fg")}>
                  <span className="mr-2 font-mono text-[10px] text-fg-faint">{String(i + 1).padStart(2, "0")}</span>{t.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0 space-y-5">
          {TOPICS.map((t, i) => (
            <Card key={t.id} id={t.id} className="scroll-mt-6" title={<span><span className="mr-2 font-mono text-xs text-fg-faint">{String(i + 1).padStart(2, "0")}</span>{t.title}</span>}>
              <div className="space-y-4">
                <p className="text-[15px] leading-relaxed text-fg-muted">{t.body}</p>
                {t.diagram && <div className="rounded-xl border border-white/[0.06] bg-ink-950/40 p-3">{t.diagram}</div>}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="eyebrow mb-1">Example</p>
                  <p className="text-sm text-fg-muted">{t.example}</p>
                  {t.interactive && <div className="mt-3">{t.interactive}</div>}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3">
                    <p className="eyebrow mb-1 text-cyan-200/70">Why it matters</p>
                    <p className="text-sm text-fg-muted">{t.why}</p>
                  </div>
                  <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
                    <p className="eyebrow mb-1 text-amber-200/70">Common misconceptions</p>
                    <ul className="space-y-1 text-sm text-fg-muted">{t.myths.map((m) => <li key={m}>{m}</li>)}</ul>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          <p className="text-center text-sm text-fg-faint">Ready to experiment? <Link to="/lab" className="text-cyan-300 hover:underline">Open the Scheduler Lab</Link> <Badge className="ml-1">all examples are editable there</Badge></p>
        </div>
      </div>
    </>
  );
}
