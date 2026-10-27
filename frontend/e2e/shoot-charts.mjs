// Render the research SVG charts to PNG for visual inspection.
// Usage (from frontend/): node e2e/shoot-charts.mjs <output-dir>
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const out = process.argv[2];
if (!out) throw new Error("usage: node e2e/shoot-charts.mjs <output-dir>");
const dir = path.resolve("..", "research-results", "charts");
const names = ["fig1_step1_response_by_class", "fig2_aqs_vs_rr4_paired", "fig3_cost_sweep", "fig4_quantum_sweep", "fig5_scale"];
const browser = await chromium.launch();
for (const f of names) {
  const svg = readFileSync(path.join(dir, `${f}.svg`), "utf-8");
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  await page.setContent(`<!doctype html><body style="margin:0;background:#fff">${svg}</body>`);
  await page.screenshot({ path: path.join(out, `${f}.png`), fullPage: true });
  await page.close();
}
await browser.close();
console.log("rendered", names.length, "charts to", out);
