// Screenshots every route with realistic data, for visual review (desktop and mobile).
// Usage (from frontend/): node e2e/shoot-pages.mjs <output-dir> [baseUrl]
import { chromium } from "@playwright/test";
import path from "node:path";

const out = process.argv[2];
const base = process.argv[3] ?? "http://127.0.0.1:8010";
if (!out) throw new Error("usage: node e2e/shoot-pages.mjs <output-dir> [baseUrl]");
const browser = await chromium.launch();

async function session(viewport, tag) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const go = async (name) => { // sidebar link on desktop, hamburger menu on mobile
    const menu = page.getByRole("button", { name: "Open navigation" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name }).first().click();
  };
  const shot = (name) => page.screenshot({ path: path.join(out, `${tag}-${name}.png`), fullPage: true });

  await page.goto(base + "/");
  await page.waitForTimeout(1500);
  await shot("home");

  await page.goto(base + "/lab");
  await page.getByLabel("Load example workload").first().selectOption("io_demo");
  await page.locator("#lab-algo").selectOption("aqs");
  await page.getByRole("button", { name: "Run simulation" }).first().click();
  await page.getByText("Accounting check passed").waitFor();
  await page.getByRole("button", { name: "Save run" }).click();
  await page.getByRole("button", { name: "Save to SQLite" }).click();
  await page.getByText(/Saved as experiment/).first().waitFor();
  await page.getByRole("button", { name: "Done" }).click();
  await shot("lab");

  await page.goto(base + "/lab"); // full reload: run cleared, inputs restored
  await shot("lab-after-reload");
  await page.getByRole("button", { name: "Run simulation" }).first().click();
  await page.getByText("Accounting check passed").waitFor();

  await go("Decision Replay");
  await page.getByText("decision 1 /").waitFor();
  await page.getByRole("button", { name: "Next decision" }).click();
  await shot("replay");

  await go("What-If Analysis");
  await page.getByRole("button", { name: /Pin current Lab setup|Re-pin from Lab/ }).click();
  await page.getByRole("button", { name: "Try AQS" }).click();
  await page.getByRole("button", { name: "Use SRTF instead" }).click();
  await page.getByRole("button", { name: /Run what-if/ }).click();
  await page.getByText("What changed").waitFor();
  await shot("whatif");

  await go("Experiment Studio");
  await page.getByRole("radio", { name: "History" }).click();
  await page.getByTestId("persistence-guide").locator("summary").click();
  await page.getByRole("row", { name: /Lab: AQS/ }).first().waitFor();
  await shot("history");

  for (const [route, name] of [["/research", "research"], ["/about", "about"], ["/architecture", "architecture"], ["/docs", "docs"], ["/learn", "learn"], ["/compare", "compare"], ["/experiments", "experiments"]]) {
    await page.goto(base + route);
    await page.waitForTimeout(900);
    await shot(name);
  }
  console.log(tag, "console errors:", JSON.stringify(errors));
  await ctx.close();
}

await session({ width: 1440, height: 900 }, "desktop");
await session({ width: 390, height: 844 }, "mobile");
await browser.close();
