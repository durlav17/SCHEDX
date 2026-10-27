import { Pencil, Shuffle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button } from "../../components/ui";
import { colorMap } from "../../lib/colors";
import { useLab } from "../../state/LabContext";
import { GenerateDialog, PresetSelect } from "./WorkloadEditor";

/** Compact read-only view of the shared workload, used by Arena, Replay and What-If. */
export function WorkloadSummary({ locked }: { locked?: boolean }) {
  const { validation, workloadName, setWorkload, rows } = useLab();
  const [gen, setGen] = useState(false);
  const ps = validation.processes;
  const colors = colorMap(ps.map((p) => p.pid));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="cyan">{workloadName}</Badge>
        <span className="text-xs text-fg-faint">{rows.length} processes</span>
        {!locked && (
          <div className="ml-auto flex flex-wrap gap-1.5">
            <PresetSelect onLoad={setWorkload} id="summary-preset" />
            <Button size="sm" variant="ghost" icon={<Shuffle className="size-3.5" />} onClick={() => setGen(true)}>Generate</Button>
            <Link to="/lab" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-fg-muted hover:bg-white/[0.06] hover:text-fg"><Pencil className="size-3.5" />Edit in Lab</Link>
          </div>
        )}
      </div>
      {!validation.valid ? (
        <p className="rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-xs text-red-200">
          The shared workload has validation errors or is empty. <Link className="underline" to="/lab">Fix it in the Scheduler Lab</Link>, or load an example.
        </p>
      ) : (
        <div className="max-h-44 overflow-auto rounded-lg border border-white/[0.06]">
          <table className="data-table">
            <thead><tr><th>PID</th><th>Arrival</th><th>Bursts (CPU, I/O, …)</th><th>Prio</th></tr></thead>
            <tbody>
              {ps.map((p) => (
                <tr key={p.pid}>
                  <td className="font-mono text-fg"><span className="mr-1.5 inline-block size-2 rounded-sm" style={{ backgroundColor: colors[p.pid].fill }} />{p.pid}</td>
                  <td className="font-mono">{p.arrival}</td>
                  <td className="font-mono text-xs">{p.bursts.join(", ")}</td>
                  <td className="font-mono">{p.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <GenerateDialog open={gen} onClose={() => setGen(false)} onGenerated={setWorkload} />
    </div>
  );
}
