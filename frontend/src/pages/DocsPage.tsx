import { Card, PageHeader } from "../components/ui";

const ENDPOINTS = [
  ["GET", "/api/health", "Service status."],
  ["GET", "/api/algorithms", "Algorithms, default parameters, limits, priority convention."],
  ["GET", "/api/presets", "Example workloads (hand-written and generated) and generator defaults."],
  ["POST", "/api/simulations/run", "Run one simulation. Body: workload, algorithm, params, context_switch_cost, starvation_threshold, detail. detail = full (default), compact (lossless, about 14x smaller; used by this UI) or summary (segments and metrics only)."],
  ["POST", "/api/experiments/compare", "Run 2–8 configurations on one workload. Returns per-run results and deltas vs. the first. The per-event trace is included only with include_frames: true."],
  ["POST", "/api/workloads/generate", "Seeded workload generation from a generator configuration."],
  ["POST", "/api/experiments/sweep", "Vary one parameter (quantum, context_switch_cost, process_count, cpu_mean, cpu_max) with optional repeated trials."],
  ["GET", "/api/experiments", "List saved experiments as light summaries, newest first (optional limit and offset; returns total)."],
  ["POST", "/api/experiments", "Save an experiment. The server reruns it; results always come from the engine."],
  ["GET", "/api/experiments/{id}", "Full stored experiment."],
  ["PATCH", "/api/experiments/{id}", "Rename."],
  ["DELETE", "/api/experiments/{id}", "Delete."],
  ["POST", "/api/experiments/{id}/reproduce", "Rerun from stored inputs and report whether results are identical."],
];

const ORDER = [
  "A context switch that finishes at t hands the CPU to the incoming process.",
  "The running process is checked: if its burst is done, it terminates or blocks for I/O. If its slice is used up, it is marked for requeueing.",
  "I/O completions at t join the ready queue (input order for ties).",
  "Arrivals at t join the ready queue (input order for ties).",
  "A quantum-expired process rejoins the tail, after the arrivals and I/O completions from the same instant.",
  "Time-driven policy events (MLFQ boost).",
  "Preemption check, then dispatch if the CPU is free. A switch is counted when the dispatched process differs from the last one that executed.",
  "A frame is recorded. Then one tick [t, t+1) executes.",
];

export default function DocsPage() {
  return (
    <>
      <PageHeader eyebrow="Documentation" title="Reference"
        description={<>Full specifications live in the repository's <code>docs/</code> folder: architecture, algorithm specifications, AQS policy, research methodology, testing and validation, limitations and presentation outline. Interactive API docs are served by FastAPI at <a className="text-cyan-300 hover:underline" href="/api/docs" target="_blank" rel="noreferrer">/api/docs</a>.</>} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Event ordering at each time t" subtitle="Deterministic: identical inputs always give identical results">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-fg-muted">{ORDER.map((o) => <li key={o}>{o}</li>)}</ol>
          <p className="mt-3 text-xs text-fg-faint">Tie-breaking: equal keys are resolved by ready-queue order, that is, the time each process entered Ready. SRTF and preemptive Priority preempt only when the candidate is strictly better.</p>
        </Card>
        <Card title="Conventions">
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li><b className="text-fg">Time</b>: non-negative integers (tu = time units).</li>
            <li><b className="text-fg">Bursts</b>: [CPU, I/O, CPU, …], starting and ending with CPU, all positive.</li>
            <li><b className="text-fg">Priority</b>: smaller number = higher priority (0 highest, 99 lowest).</li>
            <li><b className="text-fg">SJF/SRTF estimate</b>: the exact current CPU burst length.</li>
            <li><b className="text-fg">Utilisation</b>: executed CPU ÷ [first arrival, last completion]. Switch overhead excluded.</li>
            <li><b className="text-fg">Starvation flag</b>: longest single ready-queue wait ≥ threshold (default 50 tu).</li>
            <li><b className="text-fg">Limits</b>: 100 processes, horizon 50,000 tu, switch cost ≤ 20, 8 compared configurations, 25 sweep points, 20 trials.</li>
          </ul>
        </Card>
        <Card title="API endpoints" className="xl:col-span-2">
          <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
            <table className="data-table">
              <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
              <tbody>{ENDPOINTS.map(([m, p, d]) => <tr key={m + p}><td className="font-mono text-cyan-200">{m}</td><td className="font-mono text-fg">{p}</td><td>{d}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-fg-faint">Errors always use the shape <code>{`{"error": {"type": "...", "messages": ["..."]}}`}</code> with status 422 (validation), 404 or 500.</p>
        </Card>
      </div>
    </>
  );
}
