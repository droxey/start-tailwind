import { test, expect } from "@playwright/test";
import { pages } from "./pages.js";

// GitHub Pages serves this site at https://droxey.com/start-tailwind/, so every asset and
// internal link must resolve under that subpath, not at the domain root.
const BASE = "http://localhost:8081/start-tailwind/";
// Missing URLs get 404.html (rewritten at deploy time), one level and several levels deep.
const targets = [...pages.map((p) => p.replace(/^\//, "")), "missing-page", "a/b/c"];

for (const target of targets) {
  test(`assets and links resolve under /start-tailwind/: /${target}`, async ({ page }) => {
    const problems = [];
    page.on("requestfailed", (req) => problems.push(`failed ${req.url()}`));
    page.on("response", (res) => {
      const req = res.request();
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) return;
      if (res.status() >= 400) problems.push(`${res.status()} ${res.url()}`);
    });
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.origin === new URL(BASE).origin && !url.pathname.startsWith("/start-tailwind/")) {
        problems.push(`outside subpath ${req.url()}`);
      }
    });

    await page.goto(BASE + target, { waitUntil: "networkidle" });
    expect(problems).toEqual([]);

    // The stylesheet loaded and applied.
    const cssRules = await page.evaluate(() =>
      [...document.styleSheets]
        .filter((s) => s.href?.endsWith("/start-tailwind/assets/site.css"))
        .reduce((n, s) => n + s.cssRules.length, 0),
    );
    expect(cssRules, "site.css missing or empty").toBeGreaterThan(0);

    // Every same-origin link stays under the subpath and returns 200.
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
    for (const href of hrefs) {
      const url = new URL(href);
      if (url.origin !== new URL(BASE).origin) continue;
      expect(url.pathname, `${href} leaves the subpath`).toMatch(/^\/start-tailwind\//);
      const res = await page.request.get(url.origin + url.pathname);
      expect(res.status(), `${href} is broken`).toBe(200);
    }
  });
}
