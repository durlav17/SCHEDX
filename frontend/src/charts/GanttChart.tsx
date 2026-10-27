import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { colorMap } from "../lib/colors";
import type { Segment } from "../types";
import { cx } from "../components/ui";

const REASON: Record<string, string> = {
  quantum: "time slice expired (requeued)",
  preempt: "preempted",
  block: "blocked for I/O",
  terminate: "process terminated",
};

function niceStep(ppu: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  return steps.find((s) => s * ppu >= 44) ?? 20000;
}

interface Props {
  segments: Segment[];
  endTime: number;
  pids: string[];
  /** Reveal the schedule only up to this simulation time (playback). */
  cursor?: number;
  /** Time of a selected decision, drawn as a marker. */
  marker?: number | null;
  /** Shared time domain so several charts align. */
  domainEnd?: number;
  lanes?: boolean;
  compact?: boolean;
  title?: string;
  onSelectTime?: (t: number) => void;
  showControls?: boolean;
}

export function GanttChart({ segments, endTime, pids, cursor, marker, domainEnd, lanes = true, compact, title = "CPU schedule", onSelectTime, showControls = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<{ seg: Segment; x: number; y: number } | null>(null);
  const colors = useMemo(() => colorMap(pids), [pids]);
  const domain = Math.max(1, domainEnd ?? endTime);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padL = 64, padR = 16;
  const fitPpu = Math.max(2, (width - padL - padR) / domain);
  const ppu = fitPpu * zoom;
  const svgW = Math.max(width, padL + padR + domain * ppu);
  const cpuH = compact ? 30 : 38;
  const laneH = compact ? 16 : 20;
  const showLanes = lanes && pids.length <= 40;
  const rulerY = 18;
  const cpuY = rulerY + 10;
  const lanesY = cpuY + cpuH + 14;
  const svgH = showLanes ? lanesY + pids.length * (laneH + 4) + 6 : cpuY + cpuH + 10;
  const x = (t: number) => padL + t * ppu;
  const limit = cursor ?? Infinity;
  const step = niceStep(ppu);
  const ticks: number[] = [];
  for (let t = 0; t <= domain; t += step) ticks.push(t);

  const visible = segments
    .filter((s) => s.start < limit)
    .map((s) => ({ ...s, shownEnd: Math.min(s.end, limit) }));

  const fill = (s: Segment) => (s.kind === "run" && s.pid ? colors[s.pid]?.fill ?? "#555" : "transparent");
  const describe = (s: Segment) =>
    s.kind === "idle"
      ? `CPU idle from ${s.start} to ${s.end}`
      : s.kind === "switch"
        ? `Context switch to ${s.pid} from ${s.start} to ${s.end}`
        : `${s.pid} runs from ${s.start} to ${s.end}${s.end_reason ? `, ends: ${REASON[s.end_reason]}` : ""}`;

  return (
    <div className="relative">
      {showControls && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-faint">
            <span className="inline-flex items-center gap-1.5"><span className="hatch inline-block h-2.5 w-4 rounded-sm bg-violet-400/30" /> context switch</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-white/25" /> idle</span>
            <span className="inline-flex items-center gap-1.5"><svg width="10" height="10" aria-hidden><path d="M1 1h8L5 7z" fill="#fab219" /></svg> preempted / slice expired</span>
            <span className="inline-flex items-center gap-1.5"><svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="3.5" fill="#e8eaf0" /></svg> process completes</span>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <button className="rounded-md p-1.5 text-fg-faint hover:bg-white/10 hover:text-fg disabled:opacity-30" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} disabled={zoom <= 1} aria-label="Zoom out"><ZoomOut className="size-4" /></button>
            <span className="w-10 text-center font-mono text-[11px] text-fg-faint">{Math.round(zoom * 100)}%</span>
            <button className="rounded-md p-1.5 text-fg-faint hover:bg-white/10 hover:text-fg disabled:opacity-30" onClick={() => setZoom((z) => Math.min(40, z * 1.5))} disabled={zoom >= 40} aria-label="Zoom in"><ZoomIn className="size-4" /></button>
            <button className="rounded-md p-1.5 text-fg-faint hover:bg-white/10 hover:text-fg" onClick={() => setZoom(1)} aria-label="Fit to width"><Maximize2 className="size-4" /></button>
          </div>
        </div>
      )}
      <div ref={wrapRef} className="overflow-x-auto overflow-y-hidden rounded-lg" onMouseLeave={() => setHover(null)}>
        <svg width={svgW} height={svgH} role="img" aria-label={`${title}: ${segments.filter((s) => s.kind === "run").length} execution segments over ${endTime} time units`} className="block select-none">
          <defs>
            <pattern id="gx-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgb(144 133 233 / 0.18)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(144 133 233 / 0.7)" strokeWidth="2" />
            </pattern>
            <pattern id="gx-tex" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(13 15 20 / 0.45)" strokeWidth="2" />
            </pattern>
          </defs>
          {/* ruler + grid */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={rulerY + 4} y2={svgH} stroke="rgb(255 255 255 / 0.05)" />
              <text x={x(t)} y={rulerY} textAnchor="middle" className="fill-fg-faint font-mono" fontSize="10">{t}</text>
            </g>
          ))}
          <text x={8} y={cpuY + cpuH / 2 + 4} className="fill-fg-muted font-mono" fontSize="11" fontWeight={600}>CPU</text>
          <rect x={padL} y={cpuY} width={domain * ppu} height={cpuH} rx={6} fill="rgb(255 255 255 / 0.02)" />

          {/* CPU lane */}
          {visible.map((s, i) => {
            const sx = x(s.start), w = Math.max(0, (s.shownEnd - s.start) * ppu);
            const c = s.pid ? colors[s.pid] : undefined;
            const handlers = {
              onMouseMove: (e: React.MouseEvent) => {
                const r = wrapRef.current!.getBoundingClientRect();
                setHover({ seg: s, x: e.clientX - r.left, y: e.clientY - r.top });
              },
              onClick: () => onSelectTime?.(s.start),
            };
            return (
              <g key={i} {...handlers} className={onSelectTime ? "cursor-pointer" : undefined}>
                <title>{describe(s)}</title>
                {s.kind === "idle" ? (
                  <rect x={sx + 1} y={cpuY + 3} width={Math.max(0, w - 2)} height={cpuH - 6} rx={4} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeDasharray="3 3" />
                ) : s.kind === "switch" ? (
                  <rect x={sx + 1} y={cpuY + 3} width={Math.max(0, w - 2)} height={cpuH - 6} rx={3} fill="url(#gx-hatch)" />
                ) : (
                  <>
                    <rect x={sx + 1} y={cpuY + 2} width={Math.max(0, w - 2)} height={cpuH - 4} rx={4} fill={fill(s)} />
                    {c?.textured && <rect x={sx + 1} y={cpuY + 2} width={Math.max(0, w - 2)} height={cpuH - 4} rx={4} fill="url(#gx-tex)" />}
                    {w > 24 && (
                      <text x={sx + w / 2} y={cpuY + cpuH / 2 + 4} textAnchor="middle" fontSize={compact ? 10 : 11} fontWeight={600} fill="#fff" className="font-mono" pointerEvents="none">{s.pid}</text>
                    )}
                    {s.shownEnd === s.end && (s.end_reason === "preempt" || s.end_reason === "quantum") && (
                      <path d={`M${x(s.end) - 4} ${cpuY - 5} h8 l-4 5 z`} fill="#fab219" />
                    )}
                    {s.shownEnd === s.end && s.end_reason === "terminate" && (
                      <circle cx={x(s.end) - 1} cy={cpuY + cpuH + 5} r={3} fill="#e8eaf0" />
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Per-process lanes */}
          {showLanes && pids.map((pid, li) => {
            const y = lanesY + li * (laneH + 4);
            return (
              <g key={pid}>
                <text x={8} y={y + laneH / 2 + 4} fontSize="10.5" className="fill-fg-faint font-mono">{pid}</text>
                <rect x={padL} y={y} width={domain * ppu} height={laneH} rx={4} fill="rgb(255 255 255 / 0.018)" />
                {visible.filter((s) => s.pid === pid && s.kind !== "idle").map((s, i) => {
                  const w = Math.max(0, (s.shownEnd - s.start) * ppu);
                  return s.kind === "switch" ? (
                    <rect key={i} x={x(s.start)} y={y + 3} width={w} height={laneH - 6} fill="url(#gx-hatch)" rx={2} />
                  ) : (
                    <rect key={i} x={x(s.start) + 0.5} y={y + 2} width={Math.max(0, w - 1)} height={laneH - 4} rx={3} fill={colors[pid]?.fill} opacity={0.9} />
                  );
                })}
              </g>
            );
          })}

          {/* decision marker + playhead */}
          {marker !== undefined && marker !== null && (
            <g>
              <line x1={x(marker)} x2={x(marker)} y1={rulerY + 4} y2={svgH} stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" />
              <circle cx={x(marker)} cy={rulerY + 6} r={3.5} fill="#a78bfa" />
            </g>
          )}
          {cursor !== undefined && cursor < Infinity && (
            <g>
              <line x1={x(Math.min(cursor, domain))} x2={x(Math.min(cursor, domain))} y1={rulerY + 4} y2={svgH} stroke="#22d3ee" strokeWidth={2} />
              <rect x={x(Math.min(cursor, domain)) - 14} y={svgH - 16} width={28} height={14} rx={3} fill="#22d3ee" />
              <text x={x(Math.min(cursor, domain))} y={svgH - 6} textAnchor="middle" fontSize="9.5" fontWeight={700} fill="#07080b" className="font-mono">{cursor}</text>
            </g>
          )}
        </svg>
      </div>
      {hover && (
        <div
          className="glass pointer-events-none absolute z-30 w-56 rounded-lg px-3 py-2 text-xs"
          style={{ left: Math.min(hover.x + 14, width - 230), top: hover.y + (showControls ? 40 : 10) }}
        >
          {hover.seg.kind === "run" ? (
            <>
              <div className="flex items-center gap-2 font-semibold text-fg">
                <span className="size-2.5 rounded-sm" style={{ background: fill(hover.seg) }} />
                {hover.seg.pid} executing
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-2 font-mono text-fg-muted">
                <span>start</span><span className="text-right">{hover.seg.start}</span>
                <span>end</span><span className="text-right">{hover.seg.end}</span>
                <span>duration</span><span className="text-right">{hover.seg.end - hover.seg.start} tu</span>
              </div>
              {hover.seg.end_reason && <div className="mt-1 text-fg-faint">Ends: {REASON[hover.seg.end_reason]}</div>}
            </>
          ) : (
            <div className="text-fg-muted">{describe(hover.seg)} ({hover.seg.end - hover.seg.start} tu)</div>
          )}
        </div>
      )}
    </div>
  );
}

export function GanttLegend({ pids }: { pids: string[] }) {
  const colors = colorMap(pids);
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Process colors">
      {pids.map((p) => (
        <li key={p} className="inline-flex items-center gap-1.5 font-mono text-xs text-fg-muted">
          <span className={cx("size-2.5 rounded-sm", colors[p].textured && "hatch")} style={{ backgroundColor: colors[p].fill }} />
          {p}
        </li>
      ))}
    </ul>
  );
}
