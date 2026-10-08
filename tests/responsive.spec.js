import { test, expect } from "@playwright/test";
import { pages, widths, slug } from "./pages.js";

for (const path of pages) {
  for (const width of widths) {
    test(`no horizontal overflow: ${path} @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(0);
      await expect(page).toHaveScreenshot(`${slug(path)}-${width}.png`, {
        fullPage: true,
      });
    });
  }

  test(`no layout shift after load: ${path}`, async ({ page }) => {
    await page.goto(path);
    const cls = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 1500);
        }),
    );
    expect(cls).toBeLessThan(0.05);
  });

  test(`text reflows at 400% zoom equivalent: ${path}`, async ({ page }) => {
    // WCAG 1.4.10: 1280px at 400% zoom = 320 CSS px wide.
    await page.setViewportSize({ width: 320, height: 256 });
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
