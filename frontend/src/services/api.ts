import { apiUrl } from "../lib/apiBase";
import { expandResult, isCompact } from "../lib/compact";
import type {
  AlgorithmInfo,
  CompareResult,
  ExperimentDetail,
  ExperimentListItem,
  GeneratorConfig,
  Preset,
  Process,
  SchedulerConfig,
  SimulationResult,
  SweepResult,
} from "../types";

/** Error carrying the backend's structured messages ({error: {type, messages}}). */
export class ApiError extends Error {
  constructor(public status: number, public messages: string[], public kind = "error") {
    super(messages.join(" "));
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, [
      "Cannot reach the SchedX backend. Locally, start it with scripts/start.ps1 (or `uvicorn app.main:app --port 8000` in backend/). On a hosted deployment the free backend may be waking up (retry in about a minute) or this site's address may be missing from the backend's SCHEDX_CORS_ORIGINS.",
    ], "network_error");
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body (e.g. proxy error page) */
  }
  if (!res.ok) {
    const msgs: string[] = body?.error?.messages ?? [
      res.status >= 500 && !body
        ? "The backend is not responding. Make sure the API server is running (locally: port 8000)."
        : `Request failed with status ${res.status}.`,
    ];
    throw new ApiError(res.status, msgs, body?.error?.type);
  }
  return body as T;
}

const post = <T>(path: string, data: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data) });

export const api = {
  health: () => request<{ status: string; version: string }>("/health"),
  algorithms: () =>
    request<{ algorithms: AlgorithmInfo[]; limits: Record<string, number>; priority_convention: string }>("/algorithms"),
  presets: () => request<{ presets: Preset[]; generator_defaults: GeneratorConfig }>("/presets"),
  /** Runs one simulation. The compact wire format is ~10x smaller; it is decoded back to the full result. */
  run: async (workload: Process[], config: SchedulerConfig): Promise<SimulationResult> => {
    const r = await post<unknown>("/simulations/run", { workload, ...config, detail: "compact" });
    // An older backend ignores `detail` and replies with the full result: accept both formats.
    return isCompact(r) ? expandResult(r) : (r as SimulationResult);
  },
  compare: (workload: Process[], configs: SchedulerConfig[], include_frames = false) =>
    post<CompareResult>("/experiments/compare", { workload, configs, include_frames }),
  generate: (generator: GeneratorConfig) =>
    post<{ generator: GeneratorConfig; processes: Process[] }>("/workloads/generate", { generator }),
  sweep: (body: {
    config: SchedulerConfig;
    parameter: string;
    values: number[];
    workload?: Process[] | null;
    generator?: GeneratorConfig | null;
    trials?: number;
  }) => post<SweepResult>("/experiments/sweep", body),
  listExperiments: () => request<{ experiments: ExperimentListItem[] }>("/experiments"),
  getExperiment: (id: number) => request<ExperimentDetail>(`/experiments/${id}`),
  saveExperiment: (body: Record<string, unknown>) => post<ExperimentDetail>("/experiments", body),
  renameExperiment: (id: number, name: string) =>
    request<ExperimentDetail>(`/experiments/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteExperiment: (id: number) => request<{ deleted: number }>(`/experiments/${id}`, { method: "DELETE" }),
  reproduce: (id: number) =>
    post<{ id: number; identical: boolean; summary: Record<string, unknown> }>(`/experiments/${id}/reproduce`, {}),
};
