import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultConfig } from "../lib/algorithms";
import { toRows, validateRows, type ProcessRow } from "../lib/workload";
import { api, ApiError } from "../services/api";
import type { Preset, Process, SchedulerConfig, SimulationResult } from "../types";

// Input definition of the backend "Classroom demo" preset, used before presets load.
export const DEMO_WORKLOAD: Process[] = [
  { pid: "P1", arrival: 0, bursts: [7], priority: 3 },
  { pid: "P2", arrival: 1, bursts: [3], priority: 1 },
  { pid: "P3", arrival: 2, bursts: [9], priority: 4 },
  { pid: "P4", arrival: 4, bursts: [2], priority: 0 },
  { pid: "P5", arrival: 6, bursts: [5], priority: 2 },
];

const STORAGE_KEY = "schedx.lab.v1";

interface Stored {
  rows: ProcessRow[];
  config: SchedulerConfig;
  workloadName: string;
}

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

interface LabState {
  rows: ProcessRow[];
  setRows: (r: ProcessRow[]) => void;
  workloadName: string;
  setWorkload: (ps: Process[], name: string) => void;
  config: SchedulerConfig;
  setConfig: (c: SchedulerConfig) => void;
  validation: ReturnType<typeof validateRows>;
  result: SimulationResult | null;
  resultStale: boolean;
  running: boolean;
  error: string[] | null;
  clearError: () => void;
  runSimulation: (override?: { workload?: Process[]; config?: SchedulerConfig }) => Promise<SimulationResult | null>;
  resetResult: () => void;
  presets: Preset[];
  presetsError: string | null;
  /** True when the workload and settings were restored from this browser's local storage at page load. */
  restoredFromBrowser: boolean;
  /** Id of the saved experiment that corresponds to the current run, or null while the run is only temporary. */
  savedId: number | null;
  markSaved: (id: number) => void;
}

const Ctx = createContext<LabState | null>(null);

export function LabProvider({ children }: { children: ReactNode }) {
  const stored = useRef(load()).current;
  const [savedId, setSavedId] = useState<number | null>(null);
  const [rows, setRowsState] = useState<ProcessRow[]>(stored?.rows ?? toRows(DEMO_WORKLOAD));
  const [workloadName, setWorkloadName] = useState(stored?.workloadName ?? "Classroom demo");
  const [config, setConfigState] = useState<SchedulerConfig>(stored?.config ?? defaultConfig("fcfs"));
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string[] | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const inflight = useRef(false);

  const validation = useMemo(() => validateRows(rows), [rows]);
  const inputKey = JSON.stringify([validation.processes, config]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows, config, workloadName }));
    } catch {
      /* storage unavailable: state simply is not remembered */
    }
  }, [rows, config, workloadName]);

  useEffect(() => {
    api.presets().then(
      (r) => setPresets(r.presets),
      (e: ApiError) => setPresetsError(e.messages?.join(" ") ?? "Could not load presets."),
    );
  }, []);

  const setRows = useCallback((r: ProcessRow[]) => {
    setRowsState(r);
    setWorkloadName((n) => (n.endsWith("(edited)") || n === "Custom workload" ? n : `${n} (edited)`));
  }, []);

  const setWorkload = useCallback((ps: Process[], name: string) => {
    setRowsState(toRows(ps));
    setWorkloadName(name);
  }, []);

  const runSimulation = useCallback(
    async (override?: { workload?: Process[]; config?: SchedulerConfig }) => {
      if (inflight.current) return null;
      const wl = override?.workload ?? validation.processes;
      const cfg = override?.config ?? config;
      if (!override?.workload && !validation.valid) {
        setError(["Fix the highlighted workload fields before running."]);
        return null;
      }
      inflight.current = true;
      setRunning(true);
      setError(null);
      try {
        const r = await api.run(wl, cfg);
        setResult(r);
        setSavedId(null); // a new run is temporary until it is explicitly saved
        setResultKey(JSON.stringify([wl, cfg]));
        return r;
      } catch (e) {
        setError(e instanceof ApiError ? e.messages : [String(e)]);
        return null;
      } finally {
        inflight.current = false;
        setRunning(false);
      }
    },
    [validation, config],
  );

  const value: LabState = {
    rows, setRows, workloadName, setWorkload, config, setConfig: setConfigState, validation,
    result, resultStale: !!result && resultKey !== inputKey, running, error,
    clearError: () => setError(null), runSimulation,
    resetResult: () => { setResult(null); setResultKey(null); setSavedId(null); },
    presets, presetsError,
    restoredFromBrowser: stored !== null, savedId, markSaved: setSavedId,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLab() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLab must be used inside LabProvider");
  return v;
}
