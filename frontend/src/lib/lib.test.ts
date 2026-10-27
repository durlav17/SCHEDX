import { describe, expect, it } from "vitest";
import { toCSV } from "../services/export";
import { colorMap, PROCESS_COLORS } from "./colors";
import { configLabel, defaultConfig } from "./algorithms";
import { fmtMetric, fmtPct } from "./format";
import { nextPid, toRows, validateRows } from "./workload";

describe("validateRows", () => {
  it("accepts a valid workload and parses bursts", () => {
    const rows = toRows([{ pid: "A", arrival: 0, bursts: [3, 2, 1], priority: 1 }]);
    const v = validateRows(rows);
    expect(v.valid).toBe(true);
    expect(v.processes).toEqual([{ pid: "A", arrival: 0, bursts: [3, 2, 1], priority: 1 }]);
  });

  it("flags problems per field without altering input", () => {
    const rows = [
      { id: "1", pid: "A", arrival: "-1", bursts: "4, 2", priority: "0" },
      { id: "2", pid: "A", arrival: "0", bursts: "0", priority: "200" },
    ];
    const v = validateRows(rows);
    expect(v.valid).toBe(false);
    expect(v.errors["1"]).toMatchObject({ pid: "Duplicate ID", arrival: "Non-negative integer", bursts: "Must end with a CPU burst (odd count)" });
    expect(v.errors["2"]).toMatchObject({ bursts: "Positive integers only", priority: "0–99" });
    expect(rows[0].bursts).toBe("4, 2");
  });

  it("treats an empty workload as invalid", () => {
    expect(validateRows([]).valid).toBe(false);
  });

  it("generates unused process IDs", () => {
    expect(nextPid(toRows([{ pid: "P2", arrival: 0, bursts: [1], priority: 0 }]))).toBe("P3");
  });
});

describe("colors", () => {
  it("assigns colors by workload position and textures beyond the palette", () => {
    const pids = Array.from({ length: 10 }, (_, i) => `P${i}`);
    const m = colorMap(pids);
    expect(m.P0.fill).toBe(PROCESS_COLORS[0]);
    expect(m.P8.fill).toBe(PROCESS_COLORS[0]);
    expect(m.P8.textured).toBe(true);
    expect(m.P7.textured).toBe(false);
  });
});

describe("formatting and export", () => {
  it("formats metrics and percentages", () => {
    expect(fmtMetric("cpu_utilization", 0.625)).toBe("62.5%");
    expect(fmtPct(null)).toBe("n/a");
    expect(fmtPct(12.345)).toBe("+12.3%");
  });

  it("quotes CSV cells that need it", () => {
    expect(toCSV([{ a: 1, b: 'x,"y"' }])).toBe('a,b\n1,"x,""y"""');
  });

  it("labels configurations", () => {
    expect(configLabel(defaultConfig("rr", { params: { quantum: 3 }, context_switch_cost: 1 }))).toBe("RR q=3 · cs=1");
  });
});
