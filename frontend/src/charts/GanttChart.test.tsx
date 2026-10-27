import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Segment } from "../types";
import { GanttChart } from "./GanttChart";

const segs: Segment[] = [
  { kind: "run", pid: "A", dispatch_id: 0, start: 0, end: 2, end_reason: "quantum" },
  { kind: "switch", pid: "B", dispatch_id: 1, start: 2, end: 3, end_reason: null },
  { kind: "run", pid: "B", dispatch_id: 1, start: 3, end: 5, end_reason: "terminate" },
  { kind: "idle", pid: null, dispatch_id: -1, start: 5, end: 6, end_reason: null },
];

describe("GanttChart", () => {
  it("renders an accessible chart describing every segment", () => {
    const { container } = render(<GanttChart segments={segs} endTime={6} pids={["A", "B"]} />);
    expect(screen.getByRole("img", { name: /CPU schedule: 2 execution segments over 6 time units/ })).toBeInTheDocument();
    const titles = Array.from(container.querySelectorAll("title")).map((t) => t.textContent);
    expect(titles).toContain("A runs from 0 to 2, ends: time slice expired (requeued)");
    expect(titles).toContain("Context switch to B from 2 to 3");
    expect(titles).toContain("CPU idle from 5 to 6");
  });

  it("hides segments that start after the playback cursor", () => {
    const { container } = render(<GanttChart segments={segs} endTime={6} pids={["A", "B"]} cursor={2} />);
    const titles = Array.from(container.querySelectorAll("title")).map((t) => t.textContent);
    expect(titles.some((t) => t?.startsWith("B runs"))).toBe(false);
  });
});
