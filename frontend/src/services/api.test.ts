import { afterEach, describe, expect, it, vi } from "vitest";
import golden from "../lib/__fixtures__/compact-golden.json";
import { apiUrl, normalizeApiBase } from "../lib/apiBase";
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

describe("API base URL", () => {
  it("uses relative /api paths when VITE_API_BASE_URL is empty or absent (local development)", async () => {
    expect(apiUrl("/health", undefined)).toBe("/api/health");
    expect(apiUrl("/health", "")).toBe("/api/health");
    expect(apiUrl("/health", "   ")).toBe("/api/health");
    expect(apiUrl("experiments/3", "")).toBe("/api/experiments/3");
  });

  it("appends /api exactly once to a configured backend, however the variable is written", () => {
    for (const raw of [
      "https://x.onrender.com", "https://x.onrender.com/", "https://x.onrender.com//",
      "https://x.onrender.com/api", "https://x.onrender.com/api/", " https://x.onrender.com ",
    ]) {
      expect(apiUrl("/simulations/run", raw)).toBe("https://x.onrender.com/api/simulations/run");
    }
    expect(normalizeApiBase("http://localhost:9000")).toBe("http://localhost:9000");
  });

  it("sends the shared helper's requests to the configured origin", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "https://schedx-api.example.onrender.com/");
    const f = reply({ status: "ok", version: "1" });
    vi.stubGlobal("fetch", f);
    const { api: configured } = await import("./api");
    await configured.health();
    expect(f.mock.calls[0][0]).toBe("https://schedx-api.example.onrender.com/api/health");
    vi.unstubAllEnvs();
  });

  it("keeps relative requests when the variable is unset", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "");
    const f = reply({ status: "ok", version: "1" });
    vi.stubGlobal("fetch", f);
    const { api: local } = await import("./api");
    await local.health();
    expect(f.mock.calls[0][0]).toBe("/api/health");
    vi.unstubAllEnvs();
  });
});
