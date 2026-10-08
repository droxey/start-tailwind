import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:8080",
    // Uses installed Google Chrome; or run `npx playwright install chromium` and drop `channel`.
    channel: process.env.PW_CHANNEL ?? "chrome",
  },
  webServer: {
    command: "npx serve -l 8080 public",
    url: "http://localhost:8080",
    reuseExistingServer: true,
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
});
