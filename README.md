# Static site baseline (Tailwind CSS v4)

HTML, Tailwind CSS v4, and vanilla JavaScript. The only build step is the Tailwind standalone CLI,
a single binary with no Node.js required. Node is used only for linting and tests.

## Build

```sh
sh scripts/get-tailwind.sh   # downloads the version in .tailwind-version (v4.3.3) and verifies its checksum
./bin/tailwindcss -i src/input.css -o public/assets/site.css --minify
```

Deploy the `public/` directory. Internal URLs are relative, so it works at `/` or under a subpath
such as `/start-tailwind/` on GitHub Pages. After each Pages deploy, `scripts/smoke.sh` checks that
the live page, CSS, JS, and icon return 200.

### The 404 page at any depth

Hosts serve `404.html` for a missing URL at any depth, such as `/start-tailwind/a/b/c`, where its
relative links would resolve under the wrong folder. So the deploy copy of `404.html` (and only that
file) gets root-absolute links under the deploy base path. Source files stay relative, and nothing
inline is added, so the CSP stays strict.

| Host            | How                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub Pages    | `pages.yml` runs `sh scripts/rewrite-404.sh "<base_path>/"` with the `base_path` output of `actions/configure-pages`: `/start-tailwind/` for this project site, `/` on a custom domain.                                        |
| Vercel          | `vercel.json`'s `buildCommand` ends with `sh scripts/rewrite-404.sh /`. Vercel serves `404.html` for missing paths.                                                                                                            |
| Your own server | Run `sh scripts/rewrite-404.sh /` (or the folder the site is mounted at, such as `/docs/`) on the copy you upload. `deploy/nginx.conf` (`error_page 404 /404.html`) and `deploy/Caddyfile` (`handle_errors`) already serve it. |

`tests/subpath.spec.js` checks `/start-tailwind/a/b/c` against a test server that applies the same
rewrite, and the post-deploy smoke test checks the live URL.

The Tailwind version is pinned once, in `.tailwind-version`. The npm `tailwindcss` package (used
only by the linters) must be the same exact version; `npm run lint` checks it.

## Checks (Node 22.22 or newer, Python 3)

```sh
npm ci
npm run lint        # html-validate, Stylelint, ESLint (better-tailwindcss), markdownlint, Prettier
npm run test:e2e    # Playwright: width matrix, axe, aria snapshots, RTL
npm run test:a11y   # pa11y-ci (axe + HTML_CodeSniffer); run `npm run serve` in another terminal first
npm run test:lhci   # Lighthouse CI budgets
```

Playwright and pa11y-ci serve `public/` with `python3 -m http.server`, so there's no npm server
dependency. CI runs all of these (`.github/workflows/quality.yml`).

### Visual baselines

Screenshot baselines depend on the fonts installed where they're rendered, so they're only ever
generated on the CI runner. Never commit baselines rendered on your own machine. To refresh them,
run the **Update visual baselines** workflow on your branch (`gh workflow run baselines.yml --ref
<branch>`), download its `baselines` artifact, review the images, and commit them.

## Layout

| Path                     | Purpose                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/input.css`          | Tailwind entry: `@theme` tokens, plugins, dark mode, base layer                                   |
| `public/`                | Everything that ships: HTML, `assets/site.css`, `js/`, robots, sitemap, llms.txt                  |
| `tests/`                 | Playwright specs and the page and width lists                                                     |
| `deploy/`                | nginx and Caddy configs for self-hosting                                                          |
| `vercel.json`            | Vercel headers, clean URLs, and redirects                                                         |
| `.github/workflows/`     | GitHub Pages deploy (standalone CLI) plus live smoke test, the quality gate, and baseline refresh |
| `.tailwind-version`      | The pinned Tailwind CSS version for the standalone CLI                                            |
| `docs/components.md`     | How components are built, and the one-snippet-at-a-time HyperUI policy                            |
| `CONFIG_CODING_PREFS.md` | Decisions from review gates (checked = chosen)                                                    |
| `SECURITY-NOTES.md`      | npm overrides and dismissed dev-only alerts                                                       |

## Language

The site is English only (`lang="en"`). Every page is self-canonical, and layouts still use
logical properties so RTL holds.

## Agent skills

Agents must follow [AGENTS.md](AGENTS.md) and [CONFIG_CODING_PREFS.md](CONFIG_CODING_PREFS.md). [CLAUDE.md](CLAUDE.md) imports AGENTS.md with an `@AGENTS.md` line. The 499 skills below are vendored in `.agents/skills/`; `.claude/skills`, `.cursor/skills`, and `.grok/skills` are symlinks to that folder, and Codex reads `.agents/skills` directly. `skills-lock.json` records each skill's source, path, full commit SHA, license, and content hash, and `npm run lint:skills` (also part of `npm run lint` and CI) verifies them. License texts are in `.agents/licenses/`.

| Repository                           | Path                                                                            | Skills | Commit         | License    |
| ------------------------------------ | ------------------------------------------------------------------------------- | -----: | -------------- | ---------- |
| addyosmani/web-quality-skills        | `skills/*`                                                                      |      6 | `afa8da942115` | MIT        |
| thedaviddias/Front-End-Checklist     | `skills/*`                                                                      |    391 | `e8d14d049010` | MIT        |
| anthropics/skills                    | `skills/frontend-design`                                                        |      1 | `683bc88e56f3` | Apache-2.0 |
| Leonxlnx/taste-skill                 | `skills/*`                                                                      |     13 | `b482f7a970ab` | MIT        |
| nextlevelbuilder/ui-ux-pro-max-skill | `.claude/skills/ui-ux-pro-max`                                                  |      1 | `1a2c459b35f2` | MIT        |
| anthropics/knowledge-work-plugins    | `design/skills/` ux-copy, design-critique, design-handoff, accessibility-review |      4 | `ae1513ea94dc` | Apache-2.0 |
| pbakaus/impeccable                   | `.agents/skills/impeccable`                                                     |      1 | `778c8a7b71cc` | Apache-2.0 |
| wondelai/skills                      | `web-typography`                                                                |      1 | `c172996495be` | MIT        |
| mblode/agent-skills                  | `skills/typography-audit`, `skills/agent-ready`                                 |      2 | `cef4cfa837ca` | MIT        |
| emilkowalski/skills                  | `skills/*`                                                                      |     14 | `e8a175de22ae` | MIT        |
| cloudflare/skills                    | `skills/web-perf`                                                               |      1 | `41e0d1985894` | Apache-2.0 |
| ChromeDevTools/chrome-devtools-mcp   | `skills/*`                                                                      |      7 | `6f2b48ae5bfb` | Apache-2.0 |
| i18n-agent/i18nstack                 | `skills/*`                                                                      |     55 | `e1e722bfd3ca` | MIT        |
| wshobson/agents                      | `plugins/frontend-mobile-development/skills/tailwind-design-system`             |      1 | `51b6e0b507aa` | MIT        |
| coreyhaines31/marketingskills        | `skills/schema` (release v2.11.20)                                              |      1 | `607f50c2b12c` | MIT        |

These are pinned in `skills-lock.json` but not vendored, because their upstream repositories declare MIT only in a README and ship no LICENSE file. Install them on demand with the `installCommand` in the lockfile; the folders are git-ignored, and `check-skills.sh` fails if one is committed.

| Repository               | Path                                                                              | Skills | Commit         |
| ------------------------ | --------------------------------------------------------------------------------- | -----: | -------------- |
| vercel-labs/agent-skills | `skills/web-design-guidelines`                                                    |      1 | `063bee94c3f4` |
| AccessLint/skills        | `plugins/accesslint/skills/*` (accessibility-scan, -inspect, -audit, -fix, -diff) |      5 | `2e9d73366783` |

To restore missing skills from the lockfile, run `npx skills experimental_install` (Node 22.22 or newer).

## Harness load test

A one-time check (2026-10-08, 09:07 ET) on fresh clones of `main` at `a5a4dce`. Each harness ran
non-interactively and read-only, and was asked to list the instruction files and skills it loaded
and the Tailwind build command. No task was run, and no files changed.

| Harness                                 | Version            | Model             | Instruction files loaded at startup                                                                                | Project skills                                                                                                                               | Build command reported                                                                     |
| --------------------------------------- | ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Claude Code (`claude -p`)               | 2.1.293            | `claude-opus-5-5` | `CLAUDE.md`, plus `AGENTS.md` through the `@AGENTS.md` import                                                      | 499 via `.claude/skills`; `tailwind-design-system` and `schema` listed                                                                       | `./bin/tailwindcss -i src/input.css -o public/assets/site.css --minify`                    |
| Codex (`codex exec`, read-only sandbox) | codex-cli 0.161.0  | `gpt-6.1-sol`     | `AGENTS.md`, injected automatically                                                                                | 499 on disk in `.agents/skills`, but the startup catalog it was given listed only some of them, without `tailwind-design-system` or `schema` | Same                                                                                       |
| Grok Build (`grok -p --trust`, dontAsk) | 1.0.46             | `grok-4.7-build`  | `CLAUDE.md` and `AGENTS.md` (plus the global `~/.claude/CLAUDE.md`); `grok inspect` reports "Project trusted: yes" | 496 via `.grok/skills`; `tailwind-design-system` and `schema` listed                                                                         | `./bin/tailwindcss` (standalone CLI v4.3.3); no `-i`/`-o` flags in the loaded instructions |
| Cursor (`cursor-agent -p`)              | 2026.10.01-e373342 | none              | Didn't run: "Authentication required. Please run 'agent login' first"                                              | n/a                                                                                                                                          | n/a                                                                                        |

Follow-ups: Grok Build loads nothing from an untrusted clone. Its row was re-run on a trusted clone
of `87c28c0` (`grok --trust`, 2026-10-08, 09:32 ET). A plan-mode run (`--permission-mode plan`)
still stopped as `cancelled` after 3 turns, so use `--permission-mode dontAsk` for read-only checks.
Log in to `cursor-agent` and re-run its row. Codex shows only part of a 499-skill catalog at
startup, so name the skill in the prompt when a task needs one.

## Security

The site ships only static files from `public/`. Dev-tool advisories, the npm `overrides` that fix
them, and the ones dismissed because no patched release exists are listed in
[SECURITY-NOTES.md](SECURITY-NOTES.md). Dependabot opens weekly grouped updates for GitHub Actions
only (`.github/dependabot.yml`).

## License

[MIT](LICENSE) © 2026 Dani Roxberry. Vendored skills keep their own licenses, listed above and in
`.agents/licenses/`.
