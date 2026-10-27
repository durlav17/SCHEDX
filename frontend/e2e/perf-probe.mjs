// Measures the large-workload experience in a real browser: payload size, time to render, playback smoothness.
// Usage (from frontend/): node e2e/perf-probe.mjs [baseUrl]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:8010";
const procs = Array.from({ length: 100 }, (_, i) => ({
  pid: `P${i + 1}`, arrival: (i * 7) % 50,
  bursts: i % 2 ? [6 + (i % 9), 4 + (i % 5), 5 + (i % 7)] : [10 + (i % 13)], priority: i % 6,
}));
const cfg = { algorithm: "rr", params: { quantum: 2 }, context_switch_cost: 1, starvation_threshold: 50 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(([rows]) => {
  const mk = (p) => ({ id: "r" + p.pid, pid: p.pid, arrival: String(p.arrival), bursts: p.bursts.join(", "), priority: String(p.priority) });
  localStorage.setItem("schedx.lab.v1", JSON.stringify({ rows: rows.map(mk), workloadName: "100-process probe", config: { algorithm: "rr", params: { quantum: 2 }, context_switch_cost: 1, starvation_threshold: 50 } }));
}, [procs]);

let wireBytes = 0, decodedBytes = 0;
page.on("response", async (r) => {
  if (r.url().endsWith("/api/simulations/run")) {
    const body = await r.body();
    decodedBytes = body.length;
    wireBytes = Number((await r.allHeaders())["content-length"] ?? 0) || body.length;
  }
});

await page.goto(base + "/lab");
const t0 = Date.now();
await page.getByRole("button", { name: "Run simulation" }).first().click();
await page.getByText("Accounting check passed").waitFor({ timeout: 60000 });
const renderMs = Date.now() - t0;

// Playback smoothness: play at 50 tu/s for 3 s and count animation frames and long tasks.
await page.getByRole("button", { name: "Reset to time 0" }).click();
await page.getByLabel("Playback speed").selectOption("50");
const stats = await page.evaluate(async () => {
  const longTasks = [];
  const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration)));
  try { po.observe({ entryTypes: ["longtask"] }); } catch {}
  let frames = 0, worst = 0, last = performance.now();
  const start = last;
  const btn = [...document.querySelectorAll("button")].find((b) => /^(Play|Resume|Replay)$/.test(b.textContent.trim()));
  btn.click();
  await new Promise((res) => {
    const tick = (now) => { frames++; worst = Math.max(worst, now - last); last = now; now - start < 3000 ? requestAnimationFrame(tick) : res(); };
    requestAnimationFrame(tick);
  });
  po.disconnect();
  return { fps: +(frames / 3).toFixed(1), worstFrameMs: +worst.toFixed(1), longTasks: longTasks.length, longestTaskMs: +(Math.max(0, ...longTasks)).toFixed(0) };
});
// Worst case for the Gantt chart: most segments are visible. Jump to 80% of the run and play for 3 s.
const lateStats = await page.evaluate(async () => {
  const slider = document.querySelector('input[aria-label="Simulation time"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(slider, String(Math.floor(Number(slider.max) * 0.8)));
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const longTasks = [];
  const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration)));
  try { po.observe({ entryTypes: ["longtask"] }); } catch {}
  let frames = 0, worst = 0, last = performance.now();
  const start = last;
  [...document.querySelectorAll("button")].find((b) => /^(Play|Resume|Replay)$/.test(b.textContent.trim())).click();
  await new Promise((res) => {
    const tick = (now) => { frames++; worst = Math.max(worst, now - last); last = now; now - start < 3000 ? requestAnimationFrame(tick) : res(); };
    requestAnimationFrame(tick);
  });
  po.disconnect();
  return { atTime: slider.value, fps: +(frames / 3).toFixed(1), worstFrameMs: +worst.toFixed(1), longTasks: longTasks.length, longestTaskMs: +(Math.max(0, ...longTasks)).toFixed(0) };
});
const segs = await page.locator("svg[aria-label^='CPU schedule'] rect").count();
const heap = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null));
console.log(JSON.stringify({ processes: 100, decodedMB: +(decodedBytes / 1e6).toFixed(2), wireMB: +(wireBytes / 1e6).toFixed(2), clickToRenderedMs: renderMs, svgRects: segs, usedHeapMB: heap, playback50: stats, playbackLate80pct: lateStats, consoleErrors: errors }, null, 1));
await browser.close();
