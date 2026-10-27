import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InfoTip } from "../components/ui";
import { METRIC_INFO } from "../lib/algorithms";
import { SERIES_COLORS } from "../lib/colors";
import { fmtMetric } from "../lib/format";

export interface SeriesRow {
  label: string;
  colorIndex: number;
  values: Record<string, number>;
}

const axis = { stroke: "rgb(255 255 255 / 0.15)", tick: { fill: "#6f788a", fontSize: 11 } };

function ChartTooltip({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs">
      <div className="flex items-center gap-2 font-medium text-fg">
        <span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_COLORS[p.colorIndex % 8] }} />
        {p.label}
      </div>
      <div className="mt-0.5 font-mono text-fg-muted">{METRIC_INFO[metric]?.label ?? metric}: {fmtMetric(metric, p.value)}</div>
    </div>
  );
}

/** One small bar chart per metric (small multiples, one shared category axis). */
export function MetricBars({ rows, metric, height = 170 }: { rows: SeriesRow[]; metric: string; height?: number }) {
  const info = METRIC_INFO[metric];
  const data = rows.map((r) => ({ label: r.label, value: r.values[metric], colorIndex: r.colorIndex }));
  const vals = data.map((d) => d.value);
  const best = info.better === "lower" ? Math.min(...vals) : Math.max(...vals);
  const pct = metric === "cpu_utilization";
  return (
    <figure className="surface rounded-xl p-3" aria-label={`${info.label} by configuration`}>
      <figcaption className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
          {info.label}
          <InfoTip>{info.help} {info.better === "lower" ? "Lower is better." : "Higher is better."}</InfoTip>
        </span>
        <span className="text-[10.5px] text-fg-faint">{info.better === "lower" ? "↓ lower is better" : "↑ higher is better"}</span>
      </figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
            <XAxis dataKey="label" {...axis} tickLine={false} interval={0} tick={{ fill: "#6f788a", fontSize: 10 }} height={36}
              tickFormatter={(v: string) => (v.length > 9 ? `${v.slice(0, 8)}…` : v)} />
            <YAxis {...axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => (pct ? `${Math.round(v * 100)}%` : String(+v.toFixed(2)))} />
            <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ fill: "rgb(255 255 255 / 0.04)" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={500}
              label={{ position: "top", fill: "#a3abbb", fontSize: 10, formatter: (v: any) => fmtMetric(metric, v) }}>
              {data.map((d, i) => (
                <Cell key={i} fill={SERIES_COLORS[d.colorIndex % 8]} stroke={d.value === best && vals.length > 1 ? "#e8eaf0" : undefined} strokeWidth={d.value === best ? 1.5 : 0} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function SeriesLegend({ rows }: { rows: SeriesRow[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted" aria-label="Configurations">
      {rows.map((r) => (
        <li key={r.colorIndex} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_COLORS[r.colorIndex % 8] }} />{r.label}</li>
      ))}
      <li className="inline-flex items-center gap-1.5 text-fg-faint"><span className="size-2.5 rounded-sm border-[1.5px] border-fg" />outlined = most favourable value for that metric only</li>
    </ul>
  );
}
