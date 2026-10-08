# Static site baseline (Tailwind CSS v4)

HTML, Tailwind CSS v4, and vanilla JavaScript. The only build step is the Tailwind standalone CLI,
a single binary with no Node.js required. Node is used only for linting and tests.

## Build

```sh
sh scripts/get-tailwind.sh v4.3.3   # downloads bin/tailwindcss and verifies its checksum
./bin/tailwindcss -i src/input.css -o public/assets/site.css --minify
```

Deploy the `public/` directory.

## Checks (Node 22.22 or newer)

```sh
npm ci
npm run lint        # html-validate, Stylelint, ESLint (better-tailwindcss), markdownlint, Prettier
npm run test:e2e    # Playwright: width matrix, axe, aria snapshots, hreflang, RTL
npm run test:a11y   # pa11y-ci (axe + HTML_CodeSniffer); serve public/ on :8080 first
npm run test:lhci   # Lighthouse CI budgets
```

## Layout

| Path                 | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `src/input.css`      | Tailwind entry: `@theme` tokens, plugins, dark mode, base layer                  |
| `public/`            | Everything that ships: HTML, `assets/site.css`, `js/`, robots, sitemap, llms.txt |
| `tests/`             | Playwright specs and the page and width lists                                    |
| `deploy/`            | nginx and Caddy configs for self-hosting                                         |
| `vercel.json`        | Vercel headers, clean URLs, and redirects                                        |
| `.github/workflows/` | GitHub Pages deploy (standalone CLI) and the quality gate                        |

## Locales

`/` is `en` and `x-default`, `/es/` is `es`, and `/pt-br/` is `pt-BR`. Add `fr-ca/` before selling
in Canada. Every localized page lists all variants, including itself and `x-default`.

## Agent skills

Agents must follow [AGENTS.md](AGENTS.md) ([CLAUDE.md](CLAUDE.md) points to it). The 503 skills below are vendored in `.agents/skills/`; `.claude/skills` and `.cursor/skills` are symlinks to that folder. `skills-lock.json` records each skill's source, path, full commit SHA, license, and content hash, and `npm run lint:skills` (also part of `npm run lint` and CI) verifies them. License texts are in `.agents/licenses/`.

| Repository                           | Path                                                                            | Skills | Commit         | License                |
| ------------------------------------ | ------------------------------------------------------------------------------- | -----: | -------------- | ---------------------- |
| addyosmani/web-quality-skills        | `skills/*`                                                                      |      6 | `afa8da942115` | MIT                    |
| thedaviddias/Front-End-Checklist     | `skills/*`                                                                      |    391 | `e8d14d049010` | MIT                    |
| anthropics/skills                    | `skills/frontend-design`                                                        |      1 | `683bc88e56f3` | Apache-2.0             |
| Leonxlnx/taste-skill                 | `skills/*`                                                                      |     13 | `b482f7a970ab` | MIT                    |
| vercel-labs/agent-skills             | `skills/web-design-guidelines`                                                  |      1 | `063bee94c3f4` | MIT (declared, README) |
| nextlevelbuilder/ui-ux-pro-max-skill | `.claude/skills/ui-ux-pro-max`                                                  |      1 | `1a2c459b35f2` | MIT                    |
| anthropics/knowledge-work-plugins    | `design/skills/` ux-copy, design-critique, design-handoff, accessibility-review |      4 | `ae1513ea94dc` | Apache-2.0             |
| pbakaus/impeccable                   | `.agents/skills/impeccable`                                                     |      1 | `778c8a7b71cc` | Apache-2.0             |
| wondelai/skills                      | `web-typography`                                                                |      1 | `c172996495be` | MIT                    |
| mblode/agent-skills                  | `skills/typography-audit`, `skills/agent-ready`                                 |      2 | `cef4cfa837ca` | MIT                    |
| emilkowalski/skills                  | `skills/*`                                                                      |     14 | `e8a175de22ae` | MIT                    |
| AccessLint/skills                    | `plugins/accesslint/skills/*`                                                   |      5 | `2e9d73366783` | MIT (declared, README) |
| cloudflare/skills                    | `skills/web-perf`                                                               |      1 | `41e0d1985894` | Apache-2.0             |
| ChromeDevTools/chrome-devtools-mcp   | `skills/*`                                                                      |      7 | `6f2b48ae5bfb` | Apache-2.0             |
| i18n-agent/i18nstack                 | `skills/*`                                                                      |     55 | `e1e722bfd3ca` | MIT                    |

To restore missing skills from the lockfile, run `npx skills experimental_install` (Node 22.22 or newer).
