import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:8080",
    // Uses installed Google Chrome; or run `npx playwright install chromium` and drop `channel`.
    channel: process.env.PW_CHANNEL ?? "chrome",
  },
  webServer: [
    {
      // Python's built-in static server: no npm dependency (see SECURITY-NOTES.md).
      command: "python3 -m http.server 8080 --bind 127.0.0.1 --directory public",
      url: "http://127.0.0.1:8080",
      reuseExistingServer: true,
    },
    {
      // Same files under /start-tailwind/, like the GitHub Pages project site.
      command: "node tests/subpath-server.js",
      url: "http://localhost:8081/start-tailwind/",
      reuseExistingServer: true,
    },
  ],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
});
