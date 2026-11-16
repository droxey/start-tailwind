# Security notes

Every npm package here is a dev-only linter or test tool that runs in CI or on a developer machine.
The Fire Sale server uses only Node's built-in modules, so it has no runtime npm dependencies.

## Fire Sale app

- The app listens on `127.0.0.1` by default. CapRover sets `HOST=0.0.0.0` so the proxy can reach
  it. `FIRE_SALE_PASSCODE` is optional. `GET /health` returns `ok` and no app data, including when
  a passcode is set, so the container health check can run.
- No secrets, keys, cookies, or sessions live in the repo. `.env` and `data/` are git-ignored.
  `.env.example` holds placeholders only. The VAPID key pair is generated at first start into
  `data/vapid.json`.
- The ship-from address is injected at runtime (`FIRE_SALE_SHIP_FROM`, from a vault). Without it,
  labels print a placeholder. No address or unit number is stored in code, config, or sample data,
  and `tests/unit/privacy-guard.test.js` enforces that on every tracked file.
- API writes must come from the app's own origin and use the expected content type. JSON bodies are
  capped at 1 MB and photos at 15 MB. Request logs record method, path, and status only.
- Photos are re-encoded in the browser and stripped of EXIF, XMP, and text chunks on the server.
- Buyer messages are untrusted. Replies come from fixed templates, never echo buyer text, and are
  blocked if they contain a street address or unit number.
- The page sends a strict Content Security Policy with no inline script or style.

## npm overrides

`package.json` forces patched versions of transitive dev dependencies that their parents still pin
to vulnerable ranges. Each override is kept only while the full Quality workflow passes.

| Package                 | Override  | Pulled in by                                                      | Advisory                                 |
| ----------------------- | --------- | ----------------------------------------------------------------- | ---------------------------------------- |
| postcss-selector-parser | `^7.1.6`  | `@tailwindcss/typography` 0.5.20 (pins 6.0.10)                    | GHSA-rj75-hqrm-r3gf                      |
| compression             | `^1.8.2`  | `@lhci/cli` (was also `serve`, now removed)                       | GHSA-vc2v-76pw-4v95                      |
| tmp                     | `^0.2.7`  | `@lhci/cli`, directly and via `inquirer` → `external-editor`      | GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 |
| uuid                    | `^14.0.0` | `@lhci/cli` (pins ^8.3.1)                                         | GHSA-w5hq-g745-h8pq                      |
| katex                   | `^0.18.2` | `markdownlint-cli2` → `markdownlint` → `micromark-extension-math` | GHSA-238p-pmpm-9mq7                      |
| minimatch@>=7 <11       | `^11.0.1` | `eslint` 10 and `@eslint/config-array` (pin ^10)                  | GHSA-g3hv-75wg-m249                      |

The minimatch override is scoped to `>=7 <11` so `glob`'s 3.1.5, which is outside
GHSA-g3hv-75wg-m249 (`>=7.0.0 <11.0.1`), is left alone.

The `serve` dev dependency was removed. Playwright, pa11y-ci, and Lighthouse CI now run the Fire
Sale server (`server/index.js`) with a throwaway in-memory database.

## Fixed by upgrading a parent

- markdown-it 15.0.1 (GHSA-r7fv-28h4-cvq7, GHSA-gfr2-rv44-r23c, GHSA-vfgh-jcmw-g37q): `markdownlint-cli2`
  0.24.0 pins markdown-it 15.0.3, so bumping it to `^0.24.0` fixes all three without an override.
- smol-toml (GHSA-r4xh-jqrq-34v2, fixed in 1.9.0): `markdownlint-cli2` 0.24.0 pins smol-toml 1.9.1, so
  the `^1.9.0` override was dropped.
- re2js 2.8.6 (GHSA-gg6h-894w-4m9c, high, fix 2.8.7): `markdownlint` 0.42.0 exact-pins re2js 2.8.6.
  `markdownlint-cli2` 0.24.1 pins `markdownlint` 0.42.1, which depends on re2js 2.9.1, so bumping
  `markdownlint-cli2` to `^0.24.1` fixes it without an override.

## Dismissed alerts (no patched release exists)

| Package           | Advisory                                                          | Pulled in by                                                          | Why it is dismissed                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sprintf-js 1.0.3  | GHSA-hp3w-g68c-fv3c (DoS via unbounded precision)                 | `@lhci/cli` → `@lhci/utils` → `js-yaml` 3 → `argparse` 1              | Every release up to the latest (1.1.3) is affected, so no override can fix it. It only formats strings from LHCI's own YAML config parsing, with no untrusted input, in CI.   |
| extract-zip 2.0.1 | GHSA-7pqw-9j4j-h8q3, GHSA-jmr9-qjv8-65gv (symlink path traversal) | `@lhci/cli` → `lighthouse` → `puppeteer-core` → `@puppeteer/browsers` | No patched release exists. It only unpacks browser downloads from Google's own Chrome for Testing URLs, and CI uses the preinstalled or Playwright-installed browser instead. |

The weekly upgrade routine re-checks these. When a parent releases a fix, drop the override or
reopen the alert and upgrade.
