import { CircleCheck, CircleDot } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, PageHeader } from "../components/ui";
import { ArchitectureDiagram } from "../diagrams/Diagrams";
import { TEAM } from "../lib/team";


// Status reflects the code in this repository; see IMPLEMENTATION_STATUS.md.
const FUNCTIONALITY: { f: string; purpose: string; status: "Implemented" | "Partial" | "Not implemented" }[] = [
  { f: "Discrete-time simulation engine", purpose: "Deterministic execution with CPU/I/O bursts, arrivals, preemption and context switches", status: "Implemented" },
  { f: "FCFS, SJF, SRTF, Round Robin", purpose: "Classical baseline policies", status: "Implemented" },
  { f: "Priority scheduling (pre/non-preemptive, ageing)", purpose: "Importance-based scheduling and starvation mitigation", status: "Implemented" },
  { f: "Multilevel Feedback Queue", purpose: "3–5 levels with demotion and periodic boost", status: "Implemented" },
  { f: "Adaptive Quantum Scheduling (AQS)", purpose: "Experimental bounded adaptive-quantum Round Robin variant", status: "Implemented" },
  { f: "Decision trace & per-event state snapshots", purpose: "Explainability and exact backward replay", status: "Implemented" },
  { f: "Metrics (response, wait, turnaround, p95, utilisation, fairness, starvation flags)", purpose: "Quantitative evaluation", status: "Implemented" },
  { f: "Scheduler Lab, Arena, Replay, What-If, Experiment Studio", purpose: "Interactive learning and experimentation", status: "Implemented" },
  { f: "Seeded workload generator & presets", purpose: "Reproducible synthetic workloads", status: "Implemented" },
  { f: "Sensitivity sweeps with repeated trials & 95% CI", purpose: "Parameter studies", status: "Implemented" },
  { f: "SQLite experiment history + reproducibility check", purpose: "Persistence and verification", status: "Implemented" },
  { f: "CSV / JSON export", purpose: "Reporting", status: "Implemented" },
  { f: "Lossless compact result format + gzip", purpose: "Keeps results of large workloads small (about 14x) without losing replay data", status: "Implemented" },
  { f: "Recorded research experiments (3,110 simulations)", purpose: "Evaluation of AQS with a pre-declared protocol; see research-results/", status: "Implemented" },
  { f: "Multi-core / SMP scheduling", purpose: "Load balancing across CPUs", status: "Not implemented" },
  { f: "Real kernel tracing or hardware measurement", purpose: "Validation against a real OS", status: "Not implemented" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] py-5 last:border-0">
      <h2 className="mb-2 text-base font-semibold text-fg">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <>
      <PageHeader eyebrow="About the project" title="SchedX: An Explainable, Workload-Adaptive CPU Scheduling and Performance Evaluation Platform"
        description="Operating Systems · Undergraduate engineering and research project" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <Section title="Abstract">
            <p>SchedX is an interactive simulation platform for studying CPU scheduling. A deterministic, discrete-time engine written in Python executes user-defined or seeded synthetic workloads under seven policies: FCFS, SJF, SRTF, Round Robin, Priority scheduling with optional ageing, a Multilevel Feedback Queue, and an experimental Adaptive Quantum Scheduler (AQS) whose time quantum adapts, within fixed bounds, to ready-queue length and recent context-switch overhead.</p>
            <p>At every scheduling event the engine records a full state snapshot and a structured decision record. This lets the web interface replay schedules forwards and backwards and explain each choice from the values the policy actually compared. Identical workloads, explicit metric definitions, saved seeds and a server-side reproducibility check support fair comparison of the policies. SchedX is a model for learning and controlled experiments. It is not a production scheduler and makes no claims about real hardware.</p>
          </Section>
          <Section title="Problem statement">
            <p>Classical scheduling algorithms trade response time, waiting time, throughput, overhead and fairness against one another, and the balance depends on the workload and on parameters such as the time quantum. Textbook examples rarely expose why a scheduler made a particular choice, and informal comparisons often use different inputs or undefined metrics.</p>
          </Section>
          <Section title="Research question">
            <p className="text-fg">Can a workload-adaptive time-quantum scheduling policy improve response time for interactive and mixed workloads without introducing unacceptable context-switch overhead, unfairness or starvation, compared with established scheduling algorithms?</p>
          </Section>
          <Section title="Objectives">
            <ul className="list-disc space-y-1 pl-5">
              <li>Build a correct, tested and deterministic scheduling simulator.</li>
              <li>Provide decision-level explainability and exact replay.</li>
              <li>Compare established algorithms under controlled, identical workloads.</li>
              <li>Specify, implement and evaluate the AQS policy transparently.</li>
              <li>Preserve reproducible experiment configurations and results.</li>
            </ul>
          </Section>
          <Section title="Scope">
            <p>Single-CPU scheduling of processes with known CPU and I/O burst sequences, in integer time. Context switching is modelled as a configurable cost. Out of scope: multi-core scheduling, memory management, real kernel integration and burst-length prediction (SJF and SRTF use the exact current burst).</p>
          </Section>
          <Section title="Methodology">
            <p>Workload definition → algorithm execution → decision tracing → metric calculation → comparative analysis → interpretation. Comparable runs share an identical workload. Randomised workloads use fixed seeds. Sensitivity sweeps vary one parameter at a time, and repeated trials report the mean with a 95% Student-t confidence interval. See the <Link to="/research" className="text-cyan-300 hover:underline">Research</Link> page for details.</p>
          </Section>
          <Section title="Proposed system architecture">
            <ArchitectureDiagram />
          </Section>
          <Section title="Technology stack">
            <div className="flex flex-wrap gap-1.5">
              {["React", "TypeScript", "Vite", "Tailwind CSS", "Recharts", "Lucide icons", "Custom SVG Gantt", "Python", "FastAPI", "Pydantic", "SQLite", "Pytest", "Vitest"].map((t) => <Badge key={t}>{t}</Badge>)}
            </div>
          </Section>
          <Section title="Core functionality and implementation status">
            <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
              <table className="data-table">
                <thead><tr><th>Functionality</th><th>Purpose</th><th>Status</th></tr></thead>
                <tbody>
                  {FUNCTIONALITY.map((r) => (
                    <tr key={r.f}>
                      <td className="text-fg">{r.f}</td><td>{r.purpose}</td>
                      <td>{r.status === "Implemented" ? <Badge tone="good"><CircleCheck className="size-3" />Implemented</Badge> : <Badge><CircleDot className="size-3" />{r.status}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Testing approach">
            <p>Pytest checks every algorithm against schedules worked out by hand. These cover simultaneous arrivals, idle gaps, preemption and exact ties, quantum expiry, I/O blocking, priority ties and ageing, MLFQ demotion and boost, AQS bounds and adjustments, and context-switch cost. Property tests run every algorithm on every preset and check the accounting invariant, segment tiling, determinism and frame consistency. An independent reference simulator, written only from the specification, must reproduce the engine's schedule tick for tick on random workloads, and deliberate engine bugs (mutants) must be caught by the tests. API tests cover validation errors, limits, persistence and reproducibility. The frontend is type-checked, built for production, unit-tested, and exercised end to end in a real browser, including the complete faculty demonstration flow.</p>
          </Section>
          <Section title="Expected contribution">
            <p>The expected contribution is an explainable, reproducible experimental platform, together with a transparent specification and systematic evaluation of AQS. <span className="text-fg">These are expectations, not findings.</span> Findings come only from recorded experiments, reported with their workloads and seeds, including results where AQS performs worse. The recorded experiments are summarised on the <Link to="/research" className="text-cyan-300 hover:underline">Research</Link> page: at default parameters AQS did not clearly improve response time for the Interactive and Mixed workload classes.</p>
          </Section>
          <Section title="Limitations">
            <ul className="list-disc space-y-1 pl-5">
              <li>The simulation is a model, not a production scheduler. Results depend on the defined workloads and parameters.</li>
              <li>Simulated context-switch overhead is a parameter, not a hardware measurement.</li>
              <li>AQS may perform worse than established approaches in some scenarios.</li>
              <li>The project does not modify or measure the Linux kernel.</li>
            </ul>
          </Section>
          <Section title="Future work">
            <ul className="list-disc space-y-1 pl-5">
              <li>Burst-length prediction (exponential averaging) for SJF/SRTF and AQS.</li>
              <li>Multi-core scheduling with migration costs.</li>
              <li>Trace-driven workloads derived from real system logs.</li>
              <li>A comparative study of AQS against a lottery or stride scheduler.</li>
            </ul>
          </Section>
        </Card>

        <aside className="space-y-4">
          <div className="glass edge-light rounded-2xl p-5 lg:sticky lg:top-8">
            <p className="eyebrow mb-3">Developed by</p>
            <ul className="space-y-3">
              {TEAM.students.map((s) => (
                <li key={s.reg} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
                  <p className="font-medium text-fg">{s.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-fg-muted">{s.reg}</p>
                </li>
              ))}
            </ul>
            <p className="eyebrow mt-5 mb-3">Faculty Mentor</p>
            <div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.07] px-3.5 py-3">
              <p className="font-medium text-fg">{TEAM.mentor}</p>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-fg-faint">Course: Operating Systems. Project type: undergraduate Operating Systems engineering and research project.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
