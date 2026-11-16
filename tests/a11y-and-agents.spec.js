import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pages, slug } from "./pages.js";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

for (const path of pages) {
  for (const scheme of ["light", "dark"]) {
    test(`axe WCAG 2.2 AA (${scheme}): ${path}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
    });
  }

  test(`axe under forced colors + reduced motion: ${path}`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test(`agent view: accessibility tree snapshot: ${path}`, async ({ page }) => {
    await page.goto(path);
    // The aria snapshot is what browser agents and screen readers "see". Review diffs like code.
    await expect(page.locator("body")).toMatchAriaSnapshot({
      name: `${slug(path)}.aria.yml`,
    });
  });

  test(`agent view: landmarks, names, metadata: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(await page.locator("html").getAttribute("lang")).toBeTruthy();
    // Every interactive element has an accessible name.
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")]
        .filter((el) => !el.closest("[hidden],[inert]"))
        .filter((el) => {
          const label =
            el.getAttribute("aria-label") ||
            el.getAttribute("aria-labelledby") ||
            el.labels?.[0]?.textContent ||
            el.getAttribute("title") ||
            el.textContent;
          return !label || !label.trim();
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
  });
}

test("dashboard metadata: private, installable, and machine-readable", async ({ page }) => {
  await page.goto("/");
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toMatch(/^.{50,160}$/);
  // A private tool: never indexed, so no canonical or social preview tags.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property^="og:"]')).toHaveCount(0);

  const manifest = await (await page.request.get("manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("./");
  expect(manifest.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  for (const icon of [...manifest.icons.map((i) => i.src), "icons/apple-touch-icon.png", "sw.js"]) {
    expect((await page.request.get(icon)).status(), icon).toBe(200);
  }

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const nodes = blocks.map((b) => JSON.parse(b)).flatMap((d) => d["@graph"] ?? [d]);
  const app = nodes.find((n) => n["@type"] === "WebApplication");
  expect(app?.name).toBe("Fire Sale");
  expect(app.description).toBe(description);
});

test("keyboard: skip link is first tab stop and moves focus to main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});
