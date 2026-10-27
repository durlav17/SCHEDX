// Types mirroring the SchedX backend API (backend/app/engine, backend/app/api).

export type AlgorithmKey = "fcfs" | "sjf" | "srtf" | "rr" | "priority" | "mlfq" | "aqs";

export interface Process {
  pid: string;
  arrival: number;
  bursts: number[]; // [cpu, io, cpu, ...]
  priority: number;
}

export interface SchedulerConfig {
  algorithm: AlgorithmKey;
  params: Record<string, unknown>;
  context_switch_cost: number;
  starvation_threshold: number;
  label?: string | null;
}

export type ProcState = "new" | "ready" | "dispatching" | "running" | "blocked" | "terminated";

export interface Segment {
  kind: "run" | "idle" | "switch";
  pid: string | null;
  dispatch_id: number;
  start: number;
  end: number;
  end_reason: "quantum" | "block" | "terminate" | "preempt" | null;
}

export interface FrameProc {
  pid: string;
  state: ProcState;
  burst_index: number;
  remaining: number;
  cpu_left: number;
  level: number;
  eff_priority: number;
  ready_wait: number;
}

export interface FrameEvent {
  type: string;
  pid?: string;
  pids?: string[];
  from?: string;
  to?: string;
  detail?: string;
}

export interface Frame {
  time: number;
  running: string | null;
  dispatching: string | null;
  ready: string[];
  blocked: { pid: string; io_remaining: number }[];
  terminated: string[];
  quantum: number | null;
  slice_used: number;
  procs: FrameProc[];
  events: FrameEvent[];
  decision_id: number | null;
}

export interface AqsInfo {
  previous_quantum: number;
  new_quantum: number;
  adjusted: boolean;
  signal: "overhead_pressure" | "latency_pressure" | "light_load" | "hold";
  ready_length: number;
  overhead_ratio: number;
  clamped: boolean;
  explanation: string;
  time: number;
  pid: string;
  decision_id: number;
}

export interface Decision {
  id: number;
  time: number;
  frame_index: number;
  selected: string;
  previous_process: string | null;
  previous_outcome: "terminate" | "block" | "quantum" | "preempt" | null;
  preempted: boolean;
  preemption_reason: string | null;
  ready_queue: string[];
  candidates: Record<string, number | string | null>[];
  blocked: { pid: string; io_remaining: number }[];
  selected_remaining: number;
  selected_cpu_left: number;
  rule: string;
  explanation: string;
  quantum: number | null;
  context_switch: { from: string | null; to: string; cost: number } | null;
  aqs: AqsInfo | null;
  algorithm: AlgorithmKey;
  params: Record<string, unknown>;
}

export interface Summary {
  mean: number;
  median: number;
  p95: number;
  max: number;
  min: number;
}

export interface SystemMetrics {
  process_count: number;
  observation_start: number;
  observation_end: number;
  makespan: number;
  throughput: number;
  cpu_utilization: number;
  overhead_fraction: number;
  idle_time: number;
  busy_time: number;
  context_switches: number;
  context_switch_overhead: number;
  response: Summary;
  ready_wait: Summary;
  turnaround: Summary;
  max_ready_wait: number;
  starved_count: number;
  starvation_threshold: number;
  fairness_jain_slowdown: number;
  dispatches: number;
  preemptions: number;
  aqs_adjustments: number;
  accounting_consistent: boolean;
}

export interface ProcessMetrics {
  pid: string;
  arrival: number;
  priority: number;
  cpu_bursts: number;
  first_start: number;
  completion: number;
  turnaround: number;
  response: number;
  ready_wait: number;
  dispatch_wait: number;
  cpu_time: number;
  io_time: number;
  max_ready_wait: number;
  slowdown: number;
  dispatches: number;
  preemptions: number;
  starved: boolean;
  accounting_consistent: boolean;
}

export interface Transition {
  time: number;
  pid: string;
  from: ProcState;
  to: ProcState;
  cause: string;
}

export interface SimulationResult {
  algorithm: AlgorithmKey;
  params: Record<string, unknown>;
  context_switch_cost: number;
  starvation_threshold: number;
  workload: Process[];
  end_time: number;
  segments: Segment[];
  frames: Frame[];
  decisions: Decision[];
  transitions: Transition[];
  aqs_adjustments: AqsInfo[];
  state_intervals: Record<string, { state: ProcState; start: number; end: number }[]>;
  metrics: { system: SystemMetrics; processes: ProcessMetrics[] };
}

export type FlatMetrics = Record<string, number>;

export interface CompareRun extends Omit<SimulationResult, "workload" | "transitions"> {
  label: string | null;
  summary: FlatMetrics;
  delta_vs_baseline: Record<string, { absolute: number; percent: number | null }>;
}

export interface CompareResult {
  workload: Process[];
  baseline_index: number;
  metric_directions: Record<string, "lower" | "higher">;
  runs: CompareRun[];
}

export interface AlgorithmInfo {
  key: AlgorithmKey;
  name: string;
  preemptive: "yes" | "no" | "configurable";
  description: string;
  defaults: Record<string, unknown>;
  experimental: boolean;
}

export interface Preset {
  key: string;
  name: string;
  description: string;
  kind: "handcrafted" | "generated";
  generator: Record<string, unknown> | null;
  processes: Process[];
}

export type GeneratorConfig = Record<string, number | string>;

export interface SweepPoint {
  value: number;
  metrics: Record<string, { mean: number; std: number; ci95: number; n: number }>;
  trials: FlatMetrics[];
}

export interface SweepResult {
  algorithm: AlgorithmKey;
  params: Record<string, unknown>;
  parameter: string;
  values: number[];
  trials: number;
  points: SweepPoint[];
}

export interface ExperimentListItem {
  id: number;
  name: string;
  kind: "simulation" | "comparison" | "whatif" | "sweep";
  created_at: string;
  seed: number | null;
  config: Record<string, unknown>;
  notes: string | null;
  summary: Record<string, unknown> | null;
  process_count?: number;
}

export interface ExperimentDetail extends ExperimentListItem {
  workload: Process[];
  generator: Record<string, unknown> | null;
  results: Record<string, unknown>;
}
