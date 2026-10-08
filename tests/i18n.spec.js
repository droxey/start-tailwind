import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { localized } from "./pages.js";

// Google rejects region codes like es-419; use es, es-MX, es-US, zh-Hans, zh-Hant, pt-BR, fr-CA.
const VALID_HREFLANG = /^(x-default|[a-z]{2,3}(-(Hans|Hant))?(-[A-Z]{2})?)$/;

async function alternates(page, path) {
  await page.goto(path);
  return page.$$eval('link[rel="alternate"][hreflang]', (links) =>
    links.map((l) => ({ hreflang: l.hreflang, href: l.href })),
  );
}

for (const path of localized) {
  test(`hreflang cluster is complete and reciprocal: ${path}`, async ({ page }) => {
    const alts = await alternates(page, path);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    const lang = await page.locator("html").getAttribute("lang");
    const codes = alts.map((a) => a.hreflang);

    for (const code of codes) expect(code, `invalid hreflang ${code}`).toMatch(VALID_HREFLANG);
    expect(new Set(codes).size, "duplicate hreflang").toBe(codes.length);
    expect(codes).toContain("x-default");
    // Self-reference: this page's own language points at its own canonical URL.
    expect(alts.find((a) => a.hreflang === lang)?.href).toBe(canonical);
    // Canonical is self, never the English page.
    expect(new URL(canonical).pathname).toBe(path);

    // Reciprocity: every variant lists exactly the same cluster.
    for (const alt of alts.filter((a) => a.hreflang !== "x-default")) {
      const theirs = await alternates(page, new URL(alt.href).pathname);
      expect(theirs, `${alt.href} does not mirror ${path}`).toEqual(alts);
    }
  });

  test(`no language auto-redirect: ${path}`, async ({ browser }) => {
    for (const locale of ["es-MX", "pt-BR", "ar", "fr-CA"]) {
      const ctx = await browser.newContext({ locale });
      const page = await ctx.newPage();
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      await ctx.close();
    }
  });
}

// RTL is structural from day one: flip dir on every page and check layout and a11y.
for (const path of localized) {
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
}
