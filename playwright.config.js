import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Every server here uses a throwaway in-memory database on a test-only port, so a test run can
// never touch the owner's real data on port 8080.
const app = (port) => ({
  command: "node --disable-warning=ExperimentalWarning server/index.js",
  url: `http://127.0.0.1:${port}/`,
  reuseExistingServer: false,
  env: {
    PORT: String(port),
    FIRE_SALE_DB: ":memory:",
    FIRE_SALE_DATA: join(tmpdir(), `fire-sale-e2e-${port}`),
  },
});

export default defineConfig({
  testDir: "tests",
  testIgnore: "unit/**",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:8180",
    // Uses installed Google Chrome; or run `npx playwright install chromium` and drop `channel`.
    channel: process.env.PW_CHANNEL ?? "chrome",
  },
  webServer: [
    // Read-only checks (a11y, layout, metadata) against an empty database.
    app(8180),
    // Flow tests that create, edit, approve, and sell items.
    app(8182),
    {
      // Same files under /start-tailwind/, like a project subpath. The API is proxied to 8180.
      command: "node tests/subpath-server.js",
      url: "http://localhost:8081/start-tailwind/",
      reuseExistingServer: false,
      env: { APP_ORIGIN: "http://127.0.0.1:8180" },
    },
  ],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
});
