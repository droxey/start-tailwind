# Security notes

Nothing in this file ships: the deployed site is the static `public/` folder, and every npm
package here is a dev-only linter or test tool that runs in CI or on a developer machine.

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
| smol-toml               | `^1.9.0`  | `markdownlint-cli2` 0.23.3 (pins 1.8.0)                           | GHSA-r4xh-jqrq-34v2                      |

The `serve` dev dependency was removed. Playwright and pa11y-ci serve `public/` with
`python3 -m http.server`, which ships with the CI runner.

## Dismissed alerts (no patched release exists)

| Package           | Advisory                                                          | Pulled in by                                                          | Why it is dismissed                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sprintf-js 1.0.3  | GHSA-hp3w-g68c-fv3c (DoS via unbounded precision)                 | `@lhci/cli` → `@lhci/utils` → `js-yaml` 3 → `argparse` 1              | Every release up to the latest (1.1.3) is affected, so no override can fix it. It only formats strings from LHCI's own YAML config parsing, with no untrusted input, in CI.   |
| extract-zip 2.0.1 | GHSA-7pqw-9j4j-h8q3, GHSA-jmr9-qjv8-65gv (symlink path traversal) | `@lhci/cli` → `lighthouse` → `puppeteer-core` → `@puppeteer/browsers` | No patched release exists. It only unpacks browser downloads from Google's own Chrome for Testing URLs, and CI uses the preinstalled or Playwright-installed browser instead. |

The weekly upgrade routine re-checks these. When a parent releases a fix, drop the override or
reopen the alert and upgrade.
