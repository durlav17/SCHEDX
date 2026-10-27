import { Card, PageHeader } from "../components/ui";
import { ArchitectureDiagram } from "../diagrams/Diagrams";

const FLOW = [
  ["1", "The Lab sends POST /api/simulations/run with the workload and scheduler configuration."],
  ["2", "Pydantic checks the request's structure. The engine then validates semantics (bursts, bounds, parameters) and returns readable messages on failure."],
  ["3", "The Simulator builds one PCB per process and asks the chosen Policy to select, set the quantum and check for preemption at each event time."],
  ["4", "Each event time produces a frame (full state snapshot). Each dispatch produces a decision record with its explanation."],
  ["5", "The metrics module computes per-process and system metrics and checks the accounting invariant."],
  ["6", "The JSON result returns to the UI, which renders the Gantt chart, inspector, replay and charts directly from it."],
  ["7", "Saving an experiment reruns it on the server and writes inputs and outputs to SQLite. Exports serialise the same data as CSV or JSON."],
];

export default function ArchitecturePage() {
  return (
    <>
      <PageHeader eyebrow="System architecture" title="How SchedX is built"
        description="This diagram matches the code in the repository. Select a layer to read its responsibility." />
      <div className="space-y-5">
        <Card><ArchitectureDiagram /></Card>
        <Card title="Request lifecycle: running one simulation">
          <ol className="space-y-2">
            {FLOW.map(([n, t]) => (
              <li key={n} className="flex gap-3 text-sm text-fg-muted"><span className="grid size-6 shrink-0 place-items-center rounded-full border border-white/10 font-mono text-[11px] text-cyan-200">{n}</span>{t}</li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
