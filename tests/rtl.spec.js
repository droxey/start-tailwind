import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The site is English only, but RTL stays structural: flip dir and check layout and a11y.
const path = "/";

for (const width of [320, 768, 1440]) {
  test(`RTL layout holds: ${path} @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
      document.documentElement.lang = "ar";
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // Logical properties: the skip link (inset-s) must appear on the right in RTL.
    await page.keyboard.press("Tab");
    const box = await page.locator('a[href="#main"]').boundingBox();
    expect(box && box.x + box.width / 2).toBeGreaterThan(width / 2);
  });
}

test(`RTL axe: ${path}`, async ({ page }) => {
  await page.goto(path);
  await page.evaluate(() => (document.documentElement.dir = "rtl"));
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});
