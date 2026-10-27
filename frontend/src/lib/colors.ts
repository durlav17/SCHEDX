// Categorical process palette (validated for the dark surface #0d0f14 with the
// dataviz validator: lightness band, chroma, CVD and contrast checks all pass).
// Colors are assigned by a process's position in the workload, never by rank, so a
// process keeps its color in every view. Beyond 8 processes hues repeat but the
// segment gets a hatched texture and the PID label, so identity is never color-alone.
export const PROCESS_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

export interface ProcColor {
  fill: string;
  textured: boolean;
}

export function colorMap(pids: string[]): Record<string, ProcColor> {
  const m: Record<string, ProcColor> = {};
  pids.forEach((pid, i) => {
    m[pid] = { fill: PROCESS_COLORS[i % PROCESS_COLORS.length], textured: i >= PROCESS_COLORS.length };
  });
  return m;
}

export const STATE_COLORS: Record<string, string> = {
  new: "#4b5468",
  ready: "#c98500",
  dispatching: "#9085e9",
  running: "#22d3ee",
  blocked: "#d55181",
  terminated: "#2a3142",
};

export const STATE_LABEL: Record<string, string> = {
  new: "New",
  ready: "Ready",
  dispatching: "Dispatching",
  running: "Running",
  blocked: "Blocked (I/O)",
  terminated: "Terminated",
};

/** Series colors for algorithm comparisons (same validated order). */
export const SERIES_COLORS = PROCESS_COLORS;
