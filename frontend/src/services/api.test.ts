import { afterEach, describe, expect, it, vi } from "vitest";
import golden from "../lib/__fixtures__/compact-golden.json";
import { api } from "./api";

const c = (golden as { cases: { full: unknown; compact: unknown }[] }).cases[0];
const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue({ ok: status < 400, status, text: async () => JSON.stringify(body) });
afterEach(() => vi.unstubAllGlobals());

describe("api.run", () => {
  it("requests the compact format and returns the decoded full result", async () => {
    const f = reply(c.compact);
    vi.stubGlobal("fetch", f);
    const r = await api.run([], { algorithm: "mlfq", params: {}, context_switch_cost: 1, starvation_threshold: 50 });
    expect(JSON.parse(f.mock.calls[0][1].body).detail).toBe("compact");
    expect(r).toEqual(c.full);
  });

  it("still works against an older backend that replies with the full format", async () => {
    vi.stubGlobal("fetch", reply(c.full));
    const r = await api.run([], { algorithm: "mlfq", params: {}, context_switch_cost: 1, starvation_threshold: 50 });
    expect(r).toEqual(c.full);
  });

  it("turns structured backend errors into readable messages", async () => {
    vi.stubGlobal("fetch", reply({ error: { type: "validation_error", messages: ["The workload is empty: add at least one process."] } }, 422));
    await expect(api.run([], { algorithm: "fcfs", params: {}, context_switch_cost: 0, starvation_threshold: 50 })).rejects.toMatchObject({
      status: 422, messages: ["The workload is empty: add at least one process."],
    });
  });

  it("explains how to start the backend when it is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.health()).rejects.toMatchObject({ status: 0, kind: "network_error" });
    await expect(api.health()).rejects.toThrow(/scripts\/start\.ps1/);
  });
});
