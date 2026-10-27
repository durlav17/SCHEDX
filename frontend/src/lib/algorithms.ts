import type { AlgorithmKey, SchedulerConfig } from "../types";

export interface ParamField {
  key: string;
  label: string;
  kind: "int" | "bool" | "intlist" | "float";
  min?: number;
  max?: number;
  step?: number;
  help: string;
}

export interface AlgoMeta {
  key: AlgorithmKey;
  short: string;
  name: string;
  preemptive: string;
  blurb: string;
  defaults: Record<string, unknown>;
  fields: ParamField[];
}

export const ALGORITHMS: AlgoMeta[] = [
  {
    key: "fcfs", short: "FCFS", name: "First Come, First Served", preemptive: "Non-preemptive",
    blurb: "Runs processes in the order they became ready, each until its CPU burst ends.",
    defaults: {}, fields: [],
  },
  {
    key: "sjf", short: "SJF", name: "Shortest Job First", preemptive: "Non-preemptive",
    blurb: "Picks the ready process with the shortest current CPU burst (exact length used as the estimate).",
    defaults: {}, fields: [],
  },
  {
    key: "srtf", short: "SRTF", name: "Shortest Remaining Time First", preemptive: "Preemptive",
    blurb: "Preemptive SJF: a newly ready process preempts only if its remaining burst is strictly shorter.",
    defaults: {}, fields: [],
  },
  {
    key: "rr", short: "RR", name: "Round Robin", preemptive: "Preemptive (quantum)",
    blurb: "Serves the ready queue in order, giving each process at most one time quantum per turn.",
    defaults: { quantum: 4 },
    fields: [{ key: "quantum", label: "Time quantum", kind: "int", min: 1, max: 500, help: "Maximum time slice per dispatch, in time units." }],
  },
  {
    key: "priority", short: "PRIO", name: "Priority Scheduling", preemptive: "Configurable",
    blurb: "Smaller number = higher priority. Optional preemption and ageing against starvation.",
    defaults: { preemptive: false, aging_interval: 0 },
    fields: [
      { key: "preemptive", label: "Preemptive", kind: "bool", help: "If on, a strictly higher-priority ready process preempts the running one." },
      { key: "aging_interval", label: "Ageing interval", kind: "int", min: 0, max: 10000, help: "Every N time units waiting in the ready queue improves effective priority by 1. 0 disables ageing." },
    ],
  },
  {
    key: "mlfq", short: "MLFQ", name: "Multilevel Feedback Queue", preemptive: "Preemptive",
    blurb: "Several FIFO levels with growing slices; full-slice use demotes, periodic boost restores level 0.",
    defaults: { quanta: [4, 8, 16], boost_interval: 100 },
    fields: [
      { key: "quanta", label: "Level slices", kind: "intlist", help: "Comma-separated slice per level, highest priority first (3 to 5 levels)." },
      { key: "boost_interval", label: "Boost interval", kind: "int", min: 0, max: 100000, help: "Every N time units all processes return to level 0. 0 disables the boost." },
    ],
  },
  {
    key: "aqs", short: "AQS", name: "Adaptive Quantum Scheduling", preemptive: "Preemptive (adaptive quantum)",
    blurb: "Experimental Round Robin variant: the quantum adapts within bounds to queue length and switch overhead.",
    defaults: { base_quantum: 4, min_quantum: 2, max_quantum: 12, step: 1, high_load: 4, low_load: 1, overhead_limit: 0.2, window: 5 },
    fields: [
      { key: "base_quantum", label: "Base quantum", kind: "int", min: 1, max: 500, help: "Starting quantum q0." },
      { key: "min_quantum", label: "Min quantum", kind: "int", min: 1, max: 500, help: "Lower bound for q." },
      { key: "max_quantum", label: "Max quantum", kind: "int", min: 1, max: 500, help: "Upper bound for q." },
      { key: "step", label: "Step", kind: "int", min: 1, max: 50, help: "Maximum change of q per dispatch (stabiliser)." },
      { key: "high_load", label: "High load (L)", kind: "int", min: 1, max: 100, help: "If at least this many processes wait, q shrinks." },
      { key: "low_load", label: "Low load (L)", kind: "int", min: 0, max: 100, help: "If at most this many processes wait, q grows." },
      { key: "overhead_limit", label: "Overhead limit", kind: "float", min: 0.01, max: 0.99, step: 0.01, help: "If recent switch overhead ratio exceeds this, q grows (takes precedence)." },
      { key: "window", label: "Window (slices)", kind: "int", min: 1, max: 100, help: "Number of recent slices used to measure the overhead ratio." },
    ],
  },
];

export const ALGO: Record<AlgorithmKey, AlgoMeta> = Object.fromEntries(ALGORITHMS.map((a) => [a.key, a])) as any;

export function defaultConfig(key: AlgorithmKey, extra: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    algorithm: key,
    params: structuredClone(ALGO[key].defaults),
    context_switch_cost: 0,
    starvation_threshold: 50,
    ...extra,
  };
}

export function configLabel(c: SchedulerConfig): string {
  if (c.label) return c.label;
  const a = ALGO[c.algorithm].short;
  const p = c.params as any;
  let detail = "";
  if (c.algorithm === "rr") detail = ` q=${p.quantum}`;
  if (c.algorithm === "aqs") detail = ` q0=${p.base_quantum}`;
  if (c.algorithm === "mlfq") detail = ` [${(p.quanta ?? []).join(",")}]`;
  if (c.algorithm === "priority") detail = p.preemptive ? " (P)" : " (NP)";
  return `${a}${detail}${c.context_switch_cost ? ` · cs=${c.context_switch_cost}` : ""}`;
}

export const METRIC_INFO: Record<string, { label: string; unit: string; help: string; better: "lower" | "higher" }> = {
  avg_response: { label: "Avg response", unit: "tu", better: "lower", help: "Mean of (first CPU start − arrival). Includes any context-switch dispatch time before the first run." },
  p95_response: { label: "P95 response", unit: "tu", better: "lower", help: "95th-percentile response time (nearest-rank method)." },
  avg_ready_wait: { label: "Avg ready wait", unit: "tu", better: "lower", help: "Mean time spent in the READY state, waiting for the CPU. Excludes I/O blocking and dispatch overhead." },
  avg_turnaround: { label: "Avg turnaround", unit: "tu", better: "lower", help: "Mean of (completion − arrival) = ready wait + dispatch wait + CPU time + I/O time." },
  p95_turnaround: { label: "P95 turnaround", unit: "tu", better: "lower", help: "95th-percentile turnaround time." },
  max_ready_wait: { label: "Max ready stint", unit: "tu", better: "lower", help: "Longest single uninterrupted period any process waited in the ready queue." },
  throughput: { label: "Throughput", unit: "proc/tu", better: "higher", help: "Completed processes ÷ observation interval [first arrival, last completion]." },
  cpu_utilization: { label: "CPU utilization", unit: "%", better: "higher", help: "Ticks executing process code ÷ observation interval. Context-switch overhead is NOT counted as useful work." },
  context_switches: { label: "Context switches", unit: "", better: "lower", help: "Dispatches where the CPU changes to a different process than the one that last executed." },
  context_switch_overhead: { label: "Switch overhead", unit: "tu", better: "lower", help: "Total simulated time spent switching (switches × configured cost). A model parameter, not a hardware measurement." },
  makespan: { label: "Makespan", unit: "tu", better: "lower", help: "Length of the observation interval: last completion − first arrival." },
  starved_count: { label: "Starvation flags", unit: "", better: "lower", help: "Processes whose longest ready stint reached the starvation threshold. A simulation-based indicator only." },
  fairness: { label: "Fairness (Jain)", unit: "", better: "higher", help: "Jain's index over per-process slowdown (turnaround ÷ (CPU + I/O)). 1 = all processes slowed equally." },
};

export const KEY_METRICS = Object.keys(METRIC_INFO);
