import { defineConfig } from "@playwright/test";

/**
 * Browser tests (currently the template editor sweep, see e2e/README.md). They run against an already running
 * frontend (`npm run dev` or `npm run build && npm start`) given by EDITOR_SWEEP_BASE_URL.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 20 * 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.EDITOR_SWEEP_BASE_URL ?? "http://localhost:3000",
    // The locally installed Google Chrome, so no browser download is needed. Set EDITOR_SWEEP_BROWSER=chromium
    // after `npx playwright install chromium` to use Playwright's own build instead.
    channel: process.env.EDITOR_SWEEP_BROWSER === "chromium" ? undefined : "chrome",
    // A laptop-sized window, dark colour scheme and real scrollbars, as the editor's users on Windows have.
    viewport: { width: 1366, height: 768 },
    colorScheme: "dark",
    launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
    // A control that cannot be used fails fast with a clear message instead of waiting for the test timeout.
    actionTimeout: 15_000,
    trace: "retain-on-failure",
  },
});
