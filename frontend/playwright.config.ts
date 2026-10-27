import { defineConfig } from "@playwright/test";

// Expects the backend (which also serves frontend/dist) on port 8000; see scripts/run-e2e.ps1.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: process.env.SCHEDX_URL ?? "http://127.0.0.1:8000", viewport: { width: 1440, height: 900 } },
  reporter: [["list"]],
});
