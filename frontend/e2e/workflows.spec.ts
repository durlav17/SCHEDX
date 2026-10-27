import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SCHEDX_SHOTS;

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test("landing page shows identity and live engine timeline", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByText("Understand the decisions behind CPU scheduling.")).toBeVisible();
  await expect(page.getByText("Durlav Dani").first()).toBeVisible();
  await expect(page.getByText("— 24BCE2361").first()).toBeVisible();
  await expect(page.getByText("Nathan Laji Joseph").first()).toBeVisible();
  await expect(page.getByText("— 24BDS0332").first()).toBeVisible();
  await expect(page.getByText("Dr Arthi M").first()).toBeVisible();
  await expect(page.getByText("live engine ·")).toBeVisible();
  await expect(page.locator('svg[aria-label^="Demo schedule"]')).toBeVisible();
  await page.waitForTimeout(500);
  await noHorizontalOverflow(page);
  await shot(page, "01-home");
  expect(errors).toEqual([]);
});

test("lab: demo run, playback backward restores state, metrics", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/lab");
  await page.getByRole("button", { name: "Run demonstration" }).first().click();
  await expect(page.getByText("Runtime inspector")).toBeVisible();
  await expect(page.getByText("Accounting check passed")).toBeVisible();
  await page.getByRole("button", { name: "Reset to time 0" }).click();
  const clock = page.getByText(/^t = \d+\/\d+$/);
  await expect(clock).toHaveText(/^t = 0\//);
  await page.getByRole("button", { name: "Step forward to next event" }).click();
  await page.getByRole("button", { name: "Step forward to next event" }).click();
  const t2 = await clock.innerText();
  const inspector2 = await page.locator("section", { hasText: "Runtime inspector" }).innerText();
  await page.getByRole("button", { name: "Step backward to previous event" }).click();
  expect(await clock.innerText()).not.toEqual(t2);
  await page.getByRole("button", { name: "Step forward to next event" }).click();
  await expect(clock).toHaveText(t2);
  expect(await page.locator("section", { hasText: "Runtime inspector" }).innerText()).toEqual(inspector2);
  await shot(page, "02-lab");
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("lab: invalid input is flagged, not altered", async ({ page }) => {
  await page.goto("/lab");
  const bursts = page.getByLabel(/^bursts of /).first();
  await bursts.fill("4, 2");
  await expect(page.getByText("Must end with a CPU burst (odd count)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run simulation" }).first()).toBeDisabled();
  await expect(bursts).toHaveValue("4, 2");
});

test("arena compares on same workload and exports", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/lab");
  await page.getByLabel("Load example workload").first().selectOption("demo");
  await page.goto("/compare");
  await page.getByRole("button", { name: "Run comparison" }).click();
  await expect(page.getByText("Aligned schedules")).toBeVisible();
  await expect(page.getByText("Per-process comparison")).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON" }).first().click();
  expect((await dl).suggestedFilename()).toMatch(/comparison.*\.json$/);
  await shot(page, "03-compare");
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("replay steps forward and backward through decisions", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/lab");
  await page.getByRole("button", { name: "Run demonstration" }).first().click();
  await expect(page.getByText("Accounting check passed")).toBeVisible();
  await page.getByRole("link", { name: "Decision Replay" }).click();
  await expect(page.getByText("decision 1 /")).toBeVisible();
  await page.getByRole("button", { name: "Next decision" }).click();
  await page.getByRole("button", { name: "Next decision" }).click();
  await expect(page.getByText("decision 3 /")).toBeVisible();
  await page.getByRole("button", { name: "Previous decision" }).click();
  await expect(page.getByText("decision 2 /")).toBeVisible();
  await expect(page.getByText("Round Robin dispatched").first()).toBeVisible();
  await shot(page, "04-replay");
  expect(errors).toEqual([]);
});

test("what-if pins baseline and reruns", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/what-if");
  await page.getByRole("button", { name: /Pin current Lab setup|Re-pin from Lab/ }).click();
  await page.getByRole("button", { name: "Use SRTF instead" }).click();
  await page.getByRole("button", { name: /Run what-if/ }).click();
  await expect(page.getByText("What changed")).toBeVisible();
  await shot(page, "05-whatif");
  expect(errors).toEqual([]);
});

test("experiment studio: generate, run, save, history, sweep", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/experiments");
  await page.getByRole("button", { name: /^Interactive/ }).click();
  await page.getByRole("button", { name: /Generate & run/ }).click();
  await expect(page.getByText("Aligned schedules")).toBeVisible();
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.getByRole("button", { name: "Save to SQLite" }).click();
  await expect(page.getByText(/Saved as experiment #\d+/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("radio", { name: "History" }).click();
  await expect(page.getByRole("cell", { name: /Interactive · seed 303/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "reproduce" }).first().click();
  await expect(page.getByText("identical", { exact: true }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("radio", { name: "History" }).click();
  await expect(page.getByRole("cell", { name: /Interactive · seed 303/ }).first()).toBeVisible();
  await shot(page, "06-history");
  await page.getByRole("radio", { name: "Sensitivity sweep" }).click();
  await page.getByRole("button", { name: "Run sweep" }).click();
  await expect(page.getByText(/Sensitivity: Time quantum/)).toBeVisible();
  await shot(page, "07-sweep");
  expect(errors).toEqual([]);
});

test("content pages render without errors and overflow", async ({ page }) => {
  const errors = trackErrors(page);
  const pages: [string, string][] = [["/learn", "Process lifecycle"], ["/research", "Research question"], ["/about", "Faculty Mentor"], ["/architecture", "Request lifecycle"], ["/docs", "API endpoints"]];
  for (const [path, text] of pages) {
    await page.goto(path);
    await expect(page.getByText(text).first()).toBeVisible();
    await page.waitForTimeout(800);
    await noHorizontalOverflow(page);
    await shot(page, `08${path.replace("/", "-")}`);
  }
  await page.goto("/about");
  for (const t of ["Durlav Dani", "24BCE2361", "Nathan Laji Joseph", "24BDS0332", "Dr Arthi M"]) {
    await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("mobile layout has no horizontal overflow", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const path of ["/", "/lab", "/compare", "/learn", "/about"]) {
    await page.goto(path);
    await page.waitForTimeout(500);
    await noHorizontalOverflow(page);
  }
  await page.goto("/");
  await shot(page, "09-mobile-home");
  await page.close();
});
