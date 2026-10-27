import { ChevronRight, Pause, Play, RotateCcw, StepBack, StepForward } from "lucide-react";
import { Badge, Button, InfoTip, Select, cx } from "../../components/ui";
import { SPEEDS, usePlayback } from "../../hooks/usePlayback";
import { colorMap, STATE_COLORS, STATE_LABEL } from "../../lib/colors";
import type { Decision, Frame, SimulationResult } from "../../types";

type PB = ReturnType<typeof usePlayback>;

export function PlaybackControls({ pb, endTime, label = "Playback" }: { pb: PB; endTime: number; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={pb.reset} aria-label="Reset to time 0" title="Reset"><RotateCcw className="size-4" /></Button>
        <Button size="sm" variant="ghost" onClick={pb.stepBackward} disabled={pb.atStart} aria-label="Step backward to previous event" title="Step back"><StepBack className="size-4" /></Button>
        {pb.playing ? (
          <Button size="sm" variant="primary" onClick={pb.pause} icon={<Pause className="size-4" />}>Pause</Button>
        ) : (
          <Button size="sm" variant="primary" onClick={pb.play} icon={<Play className="size-4" />}>{pb.atEnd ? "Replay" : pb.cursor > 0 ? "Resume" : "Play"}</Button>
        )}
        <Button size="sm" variant="ghost" onClick={pb.stepForward} disabled={pb.atEnd} aria-label="Step forward to next event" title="Step forward"><StepForward className="size-4" /></Button>
      </div>
      <input
        type="range" min={0} max={endTime} value={pb.cursor} onChange={(e) => pb.seek(Number(e.target.value))}
        aria-label="Simulation time" className="h-1 min-w-[120px] flex-1 cursor-pointer accent-cyan-400"
      />
      <span className="w-20 text-right font-mono text-xs text-fg-muted">t = {pb.cursor}/{endTime}</span>
      <Select aria-label="Playback speed" value={pb.speed} onChange={(e) => pb.setSpeed(Number(e.target.value))} className="h-8 w-[88px] py-1 text-xs">
        {SPEEDS.map((s) => <option key={s} value={s}>{s} tu/s</option>)}
      </Select>
    </div>
  );
}

function Chip({ pid, color, sub, active }: { pid: string; color?: string; sub?: string; active?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-xs", active ? "border-cyan-400/50 bg-cyan-400/10 text-fg" : "border-white/10 bg-white/[0.04] text-fg-muted")}>
      <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />
      {pid}
      {sub && <span className="text-fg-faint">{sub}</span>}
    </span>
  );
}

export function latestDecision(result: SimulationResult, frame: Frame | null): Decision | null {
  if (!frame) return null;
  let d: Decision | null = null;
  for (const x of result.decisions) { if (x.time <= frame.time) d = x; else break; }
  return d;
}

export function RuntimeInspector({ result, frame }: { result: SimulationResult; frame: Frame | null }) {
  const pids = result.workload.map((p) => p.pid);
  const colors = colorMap(pids);
  if (!frame) return <p className="text-sm text-fg-faint">No recorded state yet.</p>;
  const byPid = Object.fromEntries(frame.procs.map((p) => [p.pid, p]));
  const decision = latestDecision(result, frame);
  const algo = result.algorithm;
  const extra = (pid: string) => {
    const p = byPid[pid];
    if (algo === "mlfq") return `L${p.level}`;
    if (algo === "priority") return `p${p.eff_priority}`;
    return `${p.remaining}tu`;
  };
  const running = frame.running ?? frame.dispatching;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="eyebrow">Time</p>
          <p className="mt-1 font-mono text-lg text-fg">t = {frame.time}</p>
        </div>
        <div>
          <p className="eyebrow">CPU</p>
          <div className="mt-1.5">
            {running ? (
              <Chip pid={running} color={colors[running].fill} active sub={frame.dispatching ? "switching in" : `${byPid[running].remaining}tu left`} />
            ) : <span className="text-fg-faint">idle</span>}
          </div>
        </div>
        <div>
          <p className="eyebrow">Time slice</p>
          {frame.quantum && (frame.running || frame.dispatching) ? (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, (frame.slice_used / frame.quantum) * 100)}%` }} /></div>
              <p className="mt-1 font-mono text-[11px] text-fg-faint">{frame.slice_used}/{frame.quantum} tu used at this event</p>
            </div>
          ) : <p className="mt-1 text-fg-faint">{algo === "fcfs" || algo === "sjf" || (algo === "priority") || algo === "srtf" ? "until burst ends" : "—"}</p>}
        </div>
      </div>

      <div>
        <p className="eyebrow mb-1.5 flex items-center gap-1">Ready queue (in order) <InfoTip>Ordered by when each process entered the ready state. This is the FIFO tie-break order for every policy.{algo === "mlfq" ? " Lx = MLFQ level." : algo === "priority" ? " px = effective priority." : " Number = remaining CPU burst."}</InfoTip></p>
        <div className="flex min-h-7 flex-wrap items-center gap-1.5">
          {frame.ready.length ? frame.ready.map((pid, i) => (
            <span key={pid} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 text-fg-faint" aria-hidden />}
              <Chip pid={pid} color={colors[pid].fill} sub={extra(pid)} />
            </span>
          )) : <span className="text-xs text-fg-faint">empty</span>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="eyebrow mb-1.5">Blocked on I/O</p>
          <div className="flex flex-wrap gap-1.5">
            {frame.blocked.length ? frame.blocked.map((b) => <Chip key={b.pid} pid={b.pid} color={colors[b.pid].fill} sub={`${b.io_remaining}tu I/O`} />) : <span className="text-xs text-fg-faint">none</span>}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-1.5">Terminated</p>
          <div className="flex flex-wrap gap-1.5">
            {frame.terminated.length ? frame.terminated.map((pid) => <Chip key={pid} pid={pid} color={colors[pid].fill} />) : <span className="text-xs text-fg-faint">none yet</span>}
          </div>
        </div>
      </div>

      {decision && (
        <div className="rounded-lg border border-violet-400/20 bg-violet-500/[0.06] p-3">
          <p className="eyebrow mb-1 text-violet-200/70">Most recent scheduling decision · t={decision.time}</p>
          <p className="text-[13px] leading-relaxed text-fg-muted">{decision.explanation}</p>
          {decision.aqs && <p className="mt-1.5 text-xs text-cyan-200/80">{decision.aqs.explanation}</p>}
        </div>
      )}

      {frame.events.length > 0 && (
        <div>
          <p className="eyebrow mb-1.5">Events at t={frame.time}</p>
          <ul className="space-y-1 text-xs text-fg-muted">
            {frame.events.map((e, i) => <li key={i} className="font-mono">{describeEvent(e)}</li>)}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
        <table className="data-table">
          <thead><tr><th>PID</th><th>State</th><th>Burst</th><th>Remaining</th><th>CPU left</th><th>Ready wait</th></tr></thead>
          <tbody>
            {frame.procs.map((p) => {
              const spec = result.workload.find((w) => w.pid === p.pid)!;
              const isIo = p.burst_index % 2 === 1;
              return (
                <tr key={p.pid}>
                  <td className="font-mono"><span className="mr-1.5 inline-block size-2 rounded-sm" style={{ backgroundColor: colors[p.pid].fill }} />{p.pid}</td>
                  <td><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: STATE_COLORS[p.state] }} />{STATE_LABEL[p.state]}</span></td>
                  <td className="font-mono text-xs">{p.state === "terminated" ? "done" : p.state === "new" ? "—" : `${isIo ? "I/O" : "CPU"} ${Math.floor(p.burst_index / 2) + 1}/${isIo ? spec.bursts.length >> 1 : (spec.bursts.length + 1) >> 1}`}</td>
                  <td className="font-mono">{p.state === "terminated" ? 0 : p.remaining}</td>
                  <td className="font-mono">{p.cpu_left}</td>
                  <td className="font-mono">{p.ready_wait}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-fg-faint">Every value comes from the engine's recorded snapshot at the event shown, before the tick that starts at t={frame.time} runs.</p>
    </div>
  );
}

export function describeEvent(e: { type: string; pid?: string; detail?: string; to?: string }): string {
  switch (e.type) {
    case "arrival": return `${e.pid} arrives → Ready`;
    case "dispatch": return `${e.pid} dispatched → ${e.to === "dispatching" ? "context switch in progress" : "Running"}`;
    case "dispatch_complete": return `${e.pid} context loaded → Running`;
    case "block": return `${e.pid} finishes CPU burst → Blocked (I/O)`;
    case "io_complete": return `${e.pid} I/O complete → Ready`;
    case "terminate": return `${e.pid} completes final burst → Terminated`;
    case "quantum_expire": return `${e.pid} time slice expired → Ready (tail)`;
    case "preempt": return `${e.pid} preempted → Ready`;
    case "boost": return e.detail ?? "MLFQ priority boost";
    default: return `${e.type} ${e.pid ?? ""}`;
  }
}

export function StateTimeline({ result, cursor }: { result: SimulationResult; cursor: number }) {
  const pids = result.workload.map((p) => p.pid);
  const end = Math.max(1, result.end_time);
  const states = ["new", "ready", "dispatching", "running", "blocked", "terminated"];
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-fg-muted" aria-label="State legend">
        {states.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: STATE_COLORS[s] }} />{STATE_LABEL[s]}</li>
        ))}
      </ul>
      <div className="space-y-1.5" role="img" aria-label="Process state over time for each process">
        {pids.map((pid) => {
          const iv = result.state_intervals[pid] ?? [];
          return (
            <div key={pid} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-[11px] text-fg-faint">{pid}</span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-white/[0.03]">
                {iv.filter((s) => s.start < cursor).map((s, i) => (
                  <div key={i} title={`${pid}: ${STATE_LABEL[s.state]} ${s.start}–${s.end}`}
                    className="absolute top-0 h-full border-r border-ink-850"
                    style={{ left: `${(s.start / end) * 100}%`, width: `${((Math.min(s.end, cursor) - s.start) / end) * 100}%`, backgroundColor: STATE_COLORS[s.state], opacity: s.state === "new" ? 0.5 : 0.9 }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between pl-14 font-mono text-[10px] text-fg-faint"><span>0</span><span>{result.end_time}</span></div>
      <details className="group mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-fg-muted">
        <summary className="cursor-pointer font-medium text-fg">What do these transitions mean?</summary>
        <ul className="mt-2 space-y-1.5 leading-relaxed">
          <li><Badge>New → Ready</Badge> the process arrives and joins the ready queue.</li>
          <li><Badge>Ready → Running</Badge> the scheduler dispatches it. With a switch cost, it first spends time in <em>Dispatching</em> while its context is loaded.</li>
          <li><Badge>Running → Ready</Badge> it is preempted, or its time slice expires, and it rejoins the queue.</li>
          <li><Badge>Running → Blocked</Badge> its CPU burst ends and it starts an I/O burst.</li>
          <li><Badge>Blocked → Ready</Badge> its I/O completes. It needs the CPU again, but must wait its turn.</li>
          <li><Badge>Running → Terminated</Badge> its final CPU burst completes.</li>
        </ul>
      </details>
    </div>
  );
}
