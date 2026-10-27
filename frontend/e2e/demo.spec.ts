import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/** The faculty demonstration, step by step, against the real UI and the real backend. */

function guard(page: Page, baseURL: string) {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL) && !u.startsWith("data:") && !u.startsWith("blob:")) external.push(u);
  });
  return { errors, external };
}

async function workloadSignature(page: Page): Promise<string> {
  return page.evaluate(() => Array.from(document.querySelectorAll("table input")).map((i) => (i as HTMLInputElement).value).join("|"));
}

async function generate(page: Page, seed: string, count: string) {
  await page.getByRole("button", { name: "Generate" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("#gen-seed").fill(seed);
  await dlg.locator("#gen-count").fill(count);
  await dlg.getByRole("button", { name: "Generate" }).click();
  await expect(dlg).toBeHidden();
}

test("faculty demonstration: all 18 steps", async ({ page, request, baseURL }) => {
  const { errors, external } = guard(page, baseURL!);

  await test.step("1-5. Homepage: title, objectives, research question, team and mentor", async () => {
    await page.goto("/");
    await expect(page.getByText("Understand the decisions behind CPU scheduling.")).toBeVisible();
    await expect(page.getByText("SchedX: An Explainable, Workload-Adaptive CPU Scheduling and Performance Evaluation Platform")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Project objectives" })).toBeVisible();
    await expect(page.getByText("Provide decision-level explainability.")).toBeVisible();
    await expect(page.getByText(/Can a workload-adaptive time quantum improve response time/)).toBeVisible();
    await expect(page.getByText("Durlav Dani").first()).toBeVisible();
    await expect(page.getByText("— 24BCE2361").first()).toBeVisible();
    await expect(page.getByText("Nathan Laji Joseph").first()).toBeVisible();
    await expect(page.getByText("— 24BDS0332").first()).toBeVisible();
    await expect(page.getByText("Faculty Mentor").first()).toBeVisible();
    await expect(page.getByText("Dr Arthi M").first()).toBeVisible();
  });

  await test.step("6. Launch the Scheduler Lab", async () => {
    await page.getByRole("link", { name: "Launch Scheduler Lab" }).click();
    await expect(page).toHaveURL(/\/lab$/);
    await expect(page.getByRole("heading", { name: "Interactive CPU scheduling simulator" })).toBeVisible();
  });

  await test.step("7. Load a sample workload (I/O demo) and choose Round Robin", async () => {
    await page.getByLabel("Load example workload").first().selectOption("io_demo");
    await expect(page.getByText("I/O demo example")).toBeVisible();
    await page.locator("#lab-algo").selectOption("rr");
    await expect(page.locator("#lab-quantum")).toHaveValue("4");
  });

  await test.step("8-9. Run the real simulation; inspect Gantt chart and metrics", async () => {
    await page.getByRole("button", { name: "Run simulation" }).first().click();
    await expect(page.getByText("Accounting check passed")).toBeVisible();
    await expect(page.locator('svg[aria-label^="CPU schedule"]')).toBeVisible();
    await expect(page.getByText("Avg response", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Temporary run, not saved")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);
  });

  await test.step("10. Pause playback, then step forward and backward through recorded events", async () => {
    await page.getByRole("button", { name: "Reset to time 0" }).click();
    await page.getByRole("button", { name: "Play" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Pause" }).click();
    const clock = page.getByText(/^t = \d+\/\d+$/);
    const paused = await clock.innerText();
    await page.waitForTimeout(500);
    expect(await clock.innerText()).toEqual(paused); // really paused
    await page.getByRole("button", { name: "Step forward to next event" }).click();
    const forward = await clock.innerText();
    expect(forward).not.toEqual(paused);
    await page.getByRole("button", { name: "Step backward to previous event" }).click();
    expect(await clock.innerText()).toEqual(paused);
  });

  await test.step("11. Inspect a scheduling decision and its explanation", async () => {
    await page.getByRole("link", { name: "Decision Replay" }).click();
    await expect(page.getByText("decision 1 /")).toBeVisible();
    await page.getByRole("button", { name: "Next decision" }).click();
    await expect(page.getByText("decision 2 /")).toBeVisible();
    // The explanation is shown in the decision card and again as the inspector's "most recent decision".
    await expect(page.getByText(/^Round Robin dispatched P\d, the next process in ready-queue order, for a time slice of at most 4 tu\.$/).first()).toBeVisible();
    await expect(page.getByText("Candidates considered")).toBeVisible();
  });

  await test.step("12. Compare the same workload under different algorithms", async () => {
    await page.getByRole("link", { name: "Algorithm Arena" }).click();
    await page.getByRole("button", { name: "Run comparison" }).click();
    await expect(page.getByText("Aligned schedules")).toBeVisible();
    await expect(page.getByRole("cell", { name: /Avg ready wait/ })).toBeVisible();
    await expect(page.getByText("I/O demo example")).toBeVisible(); // the very same workload
  });

  await test.step("13. What-If: change a scheduler parameter and rerun", async () => {
    await page.getByRole("link", { name: "What-If Analysis" }).click();
    await page.getByRole("button", { name: /Pin current Lab setup|Re-pin from Lab/ }).click();
    await page.getByRole("button", { name: "Halve the Round Robin quantum" }).click();
    await page.getByRole("button", { name: /Run what-if/ }).click();
    await expect(page.getByText("What changed")).toBeVisible();
    await expect(page.getByText(/RR q=4/).first()).toBeVisible();
    await expect(page.getByText(/RR q=2/).first()).toBeVisible();
  });

  await test.step("14. Generate a workload with a fixed seed: identical every time", async () => {
    await page.goto("/lab");
    await generate(page, "77", "6");
    const first = await workloadSignature(page);
    await generate(page, "78", "6");
    expect(await workloadSignature(page)).not.toEqual(first);
    await generate(page, "77", "6");
    expect(await workloadSignature(page)).toEqual(first);
    await expect(page.getByText("Generated (seed 77)").first()).toBeVisible();
  });

  let savedId = 0;
  let savedName = "";
  await test.step("15. Run and save an experiment", async () => {
    await page.locator("#lab-algo").selectOption("aqs");
    await page.getByRole("button", { name: "Run simulation" }).first().click();
    await expect(page.getByText("Accounting check passed")).toBeVisible();
    await page.getByRole("button", { name: "Save run" }).click();
    savedName = await page.locator("#exp-name").inputValue(); // read it before the dialog switches to its "saved" view
    await page.getByRole("button", { name: "Save to SQLite" }).click();
    const note = await page.getByText(/Saved as experiment #\d+/).first().innerText();
    savedId = Number(/#(\d+)/.exec(note)![1]);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("run-status")).toContainText(`Saved as experiment #${savedId}`);
  });

  await test.step("16. Reload the page: the run is gone, the saved experiment reloads and reproduces", async () => {
    await page.reload();
    await expect(page.getByTestId("restored-note")).toContainText("not");
    await expect(page.getByText("Temporary run, not saved")).toHaveCount(0);
    await page.getByRole("link", { name: "Experiment Studio" }).click();
    await page.getByRole("radio", { name: "History" }).click();
    await expect(page.getByTestId("persistence-guide")).toBeVisible();
    expect(savedName).toBe("Lab: AQS on Generated (seed 77)");
    const row = page.getByRole("row", { name: savedName }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "reproduce" }).click();
    await expect(row.getByText("identical")).toBeVisible();
    await row.getByRole("button", { name: /in the Scheduler Lab/ }).click();
    await expect(page.getByTestId("run-status")).toContainText(`Saved as experiment #${savedId}`);
    await expect(page.getByText("Accounting check passed")).toBeVisible();
  });

  await test.step("17. Export the saved experiment and check it against an independent engine run", async () => {
    await page.getByRole("link", { name: "Experiment Studio" }).click();
    await page.getByRole("radio", { name: "History" }).click();
    const download = page.waitForEvent("download");
    // Other tests share this database and run in parallel: pick our own experiment by its name, never "the newest".
    await page.getByRole("button", { name: `Export ${savedName}`, exact: true }).click();
    const file = await download;
    const exported = JSON.parse(readFileSync((await file.path())!, "utf-8"));
    expect(exported.id).toBe(savedId);
    expect(exported.kind).toBe("simulation");
    expect(exported.workload).toHaveLength(6);
    // An independent run of the same stored inputs must give the same numbers as the exported results.
    const cfg = exported.config.configs[0];
    const again = await (await request.post("/api/simulations/run", { data: { workload: exported.workload, ...cfg, detail: "summary" } })).json();
    const stored = exported.results.metrics.system;
    expect(stored.makespan).toBe(again.metrics.system.makespan);
    expect(stored.response.mean).toBe(again.metrics.system.response.mean);
    expect(stored.context_switches).toBe(again.metrics.system.context_switches);
    expect(exported.results.segments).toEqual(again.segments);
    expect(savedName.length).toBeGreaterThan(0);
  });

  await test.step("18. Research and About pages", async () => {
    await page.getByRole("link", { name: "Research" }).first().click();
    await expect(page.getByText("Research question").first()).toBeVisible();
    await expect(page.getByText(/improve response time for interactive and mixed workloads/).first()).toBeVisible();
    await expect(page.getByText("docs.kernel.org").or(page.getByText("EEVDF Scheduler")).first()).toBeVisible();
    await page.getByRole("link", { name: /About/ }).first().click();
    for (const t of ["Durlav Dani", "24BCE2361", "Nathan Laji Joseph", "24BDS0332", "Dr Arthi M"]) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    }
  });

  expect(errors, "browser console errors").toEqual([]);
  expect(external, "requests leaving localhost (the demo must work offline)").toEqual([]);
});
