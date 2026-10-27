import { CircleCheck, Cpu, FileBraces, FileSpreadsheet, GitCompareArrows, Info, Play, RotateCcw, Save, Sparkles, SquareChartGantt, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GanttChart, GanttLegend } from "../charts/GanttChart";
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader } from "../components/ui";
import { SaveExperimentDialog } from "../features/experiments/SaveExperimentDialog";
import { ConfigEditor } from "../features/scheduler/ConfigEditor";
import { PlaybackControls, RuntimeInspector, StateTimeline } from "../features/scheduler/Inspector";
import { ProcessMetricsTable, SystemMetrics } from "../features/scheduler/MetricsPanel";
import { WorkloadEditor } from "../features/scheduler/WorkloadEditor";
import { usePlayback } from "../hooks/usePlayback";
import { ALGO, configLabel, defaultConfig } from "../lib/algorithms";
import { wireOf } from "../lib/compact";
import { downloadCSV, downloadJSON, stamp } from "../services/export";
import { DEMO_WORKLOAD, useLab } from "../state/LabContext";

export const DEMO_CONFIG = defaultConfig("rr", { params: { quantum: 3 } });

export default function LabPage() {
  const lab = useLab();
  const nav = useNavigate();
  const { result } = lab;
  const pb = usePlayback(result?.frames, result?.end_time ?? 0);
  const [saveOpen, setSaveOpen] = useState(false);

  const runDemo = async () => {
    const demo = lab.presets.find((p) => p.key === "demo")?.processes ?? DEMO_WORKLOAD;
    lab.setWorkload(demo, "Classroom demo");
    lab.setConfig(DEMO_CONFIG);
    await lab.runSimulation({ workload: demo, config: DEMO_CONFIG });
  };

  const exportCSV = () => {
    if (!result) return;
    const s = result.metrics.system;
    downloadCSV(`schedx-${result.algorithm}-processes-${stamp()}.csv`, result.metrics.processes.map((p) => ({ algorithm: result.algorithm, ...p })));
    downloadCSV(`schedx-${result.algorithm}-segments-${stamp()}.csv`, result.segments.map((x) => ({ ...x })));
    downloadCSV(`schedx-${result.algorithm}-system-${stamp()}.csv`, [{
      algorithm: result.algorithm, params: JSON.stringify(result.params), context_switch_cost: result.context_switch_cost,
      avg_response: s.response.mean, p95_response: s.response.p95, avg_ready_wait: s.ready_wait.mean, avg_turnaround: s.turnaround.mean,
      throughput: s.throughput, cpu_utilization: s.cpu_utilization, context_switches: s.context_switches,
      context_switch_overhead: s.context_switch_overhead, max_ready_wait: s.max_ready_wait, starved_count: s.starved_count, makespan: s.makespan,
    }]);
  };

  return (
    <>
      <PageHeader
        eyebrow="Scheduler Lab"
        title="Interactive CPU scheduling simulator"
        description="Define processes, choose a policy and run the real engine. Then play the schedule back event by event. Each queue, state and metric shown comes from the engine's recorded trace."
        actions={
          <>
            <Button variant="secondary" icon={<Sparkles className="size-4" />} onClick={runDemo} loading={lab.running}>Run demonstration</Button>
            {result && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { lab.resetResult(); }}>Clear results</Button>}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <Card title="Workload" subtitle="Processes with arrival times, CPU/I/O bursts and priority">
            <WorkloadEditor />
          </Card>
          <Card title="Scheduler" subtitle="Policy and simulation parameters" glass>
            <ConfigEditor value={lab.config} onChange={lab.setConfig} idPrefix="lab" />
            <Button
              variant="primary" size="lg" className="mt-5 w-full" icon={<Play className="size-4" />}
              loading={lab.running} disabled={!lab.validation.valid}
              onClick={() => lab.runSimulation()}
            >
              Run simulation
            </Button>
            {!lab.validation.valid && lab.rows.length > 0 && <p className="mt-2 text-center text-xs text-red-300">Fix the highlighted workload fields to run.</p>}
            {lab.rows.length === 0 && <p className="mt-2 text-center text-xs text-fg-faint">Add at least one process to run.</p>}
            <div className="mt-3"><ErrorBanner messages={lab.error} onDismiss={lab.clearError} title="The simulation could not run" /></div>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          {!result ? (
            <Card>
              <EmptyState icon={<Cpu className="size-5" />} title="No simulation yet"
                action={<div className="flex flex-wrap justify-center gap-2"><Button variant="primary" icon={<Play className="size-4" />} onClick={() => lab.runSimulation()} disabled={!lab.validation.valid} loading={lab.running}>Run simulation</Button><Button icon={<Sparkles className="size-4" />} onClick={runDemo}>Run demonstration</Button></div>}>
                Run the current workload, or try the demonstration: the classroom workload under Round Robin with q=3.
              </EmptyState>
              {lab.restoredFromBrowser && (
                <div className="mx-4 mb-4 flex gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-xs leading-relaxed text-fg-muted" data-testid="restored-note">
                  <Info className="mt-0.5 size-4 shrink-0 text-cyan-300" />
                  <p>
                    Your workload (<span className="text-fg">{lab.workloadName}</span>) and scheduler settings were restored from this browser. Results of earlier runs are <b className="text-fg">not</b> kept in the browser because they can be very large. Run again to regenerate them, or reopen a
                    {" "}<Link to="/experiments" className="text-cyan-300 hover:underline">saved experiment</Link> from the history.
                  </p>
                </div>
              )}
            </Card>
          ) : (
            <>
              {lab.resultStale && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm text-amber-100">
                  <TriangleAlert className="size-4 shrink-0" /> The workload or settings changed after this run. Results below belong to the previous inputs. Run again to update them.
                </div>
              )}
              <Card
                title={<span className="flex items-center gap-2">Gantt chart <Badge tone="accent">{configLabel({ algorithm: result.algorithm, params: result.params, context_switch_cost: result.context_switch_cost, starvation_threshold: result.starvation_threshold })}</Badge></span>}
                subtitle={`${ALGO[result.algorithm].name} · ${result.workload.length} processes · finished at t=${result.end_time}`}
                actions={
                  <>
                    <Button size="sm" icon={<Save className="size-3.5" />} onClick={() => setSaveOpen(true)} disabled={!!lab.savedId}>{lab.savedId ? "Saved" : "Save run"}</Button>
                    <Button size="sm" variant="ghost" icon={<SquareChartGantt className="size-3.5" />} onClick={() => nav("/replay")}>Inspect decisions</Button>
                    <Button size="sm" variant="ghost" icon={<GitCompareArrows className="size-3.5" />} onClick={() => nav("/compare?from=lab")}>Compare</Button>
                    <Button size="sm" variant="ghost" icon={<FileSpreadsheet className="size-3.5" />} onClick={exportCSV}>CSV</Button>
                    <Button size="sm" variant="ghost" icon={<FileBraces className="size-3.5" />} onClick={() => downloadJSON(`schedx-${result.algorithm}-${stamp()}.json`, wireOf(result) ?? result)}>JSON</Button>
                  </>
                }
              >
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs" data-testid="run-status">
                  {lab.savedId ? (
                    <>
                      <Badge tone="good"><CircleCheck className="size-3" />Saved as experiment #{lab.savedId}</Badge>
                      <span className="text-fg-faint">Stored in the SQLite history with its inputs. You can reopen and reproduce it there.</span>
                      <Link to="/experiments" className="text-cyan-300 hover:underline">Open history</Link>
                    </>
                  ) : (
                    <>
                      <Badge tone="warn">Temporary run, not saved</Badge>
                      <span className="text-fg-faint">Held in memory only. Reloading the page clears it. Save it to keep a reproducible record.</span>
                    </>
                  )}
                </div>
                <PlaybackControls pb={pb} endTime={result.end_time} />
                <div className="mt-4"><GanttChart segments={result.segments} endTime={result.end_time} pids={result.workload.map((p) => p.pid)} cursor={pb.cursor} /></div>
                <div className="mt-3"><GanttLegend pids={result.workload.map((p) => p.pid)} /></div>
              </Card>
              <div className="grid gap-5 2xl:grid-cols-2">
                <Card title="Runtime inspector" subtitle="Recorded state at the playback cursor" glass>
                  <RuntimeInspector result={result} frame={pb.frame} />
                </Card>
                <Card title="Process state timeline" subtitle="New → Ready → Running ⇄ Blocked → Terminated">
                  <StateTimeline result={result} cursor={pb.cursor} />
                </Card>
              </div>
              <Card title="Performance metrics" subtitle="System-level results for the complete run, computed by the engine">
                <SystemMetrics result={result} />
              </Card>
              <Card title="Per-process results">
                <ProcessMetricsTable result={result} />
              </Card>
            </>
          )}
        </div>
      </div>
      {result && (
        <SaveExperimentDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSaved={lab.markSaved}
          defaultName={`Lab: ${ALGO[result.algorithm].short} on ${lab.workloadName}`}
          body={{ kind: "simulation", workload: result.workload, configs: [{ algorithm: result.algorithm, params: result.params, context_switch_cost: result.context_switch_cost, starvation_threshold: result.starvation_threshold }] }} />
      )}
    </>
  );
}
