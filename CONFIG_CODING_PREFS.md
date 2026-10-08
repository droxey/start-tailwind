# Coding preferences

Decisions Dani made at review gates. Checked = chosen, unchecked = rejected. Agents follow these
together with [AGENTS.md](AGENTS.md).

## Tailwind CSS v4

Gate answered 2026-10-08 08:01 ET. Pinned framework: Tailwind CSS v4.3.3, standalone CLI only.

### Q1. Dependabot alerts with no upstream fix

- [x] A. npm `overrides` for postcss-selector-parser, compression, tmp, uuid, katex, smol-toml,
      and sprintf-js: clears the alerts without touching what ships; each kept only if full CI passes.
- [x] B. Remove the `serve` devDep and serve `public/` with `python3 -m http.server`: drops
      compression and its alert, with no new dependency.
- [x] C. Dismiss, with a written reason in `SECURITY-NOTES.md`: fallback for any override that
      breaks CI and for alerts with no patched release.
- [ ] D. Do nothing: leaves known alerts open with no record.

### Q2. Subpath hosting (`/start-tailwind/`) and language

- [x] A. Relative URLs in all HTML, plus a live smoke test after each deploy: works at `/` or any
      subpath on every host with no build step.
- [ ] B. A dedicated (sub)domain: needs DNS or Cloudflare changes.
- [ ] C. A build-time base-path rewrite: adds a build step and hides the real paths.
- [ ] D. `<base href>` per deploy target: a per-host setting and fragile with fragment links.
- [x] English only (`lang="en"`), self-canonical pages, no hreflang: one language to keep
      accurate; RTL-safe logical properties stay.

### Q3. Cloudflare-injected inline script and HTTP on droxey.com

- [x] A. Turn off Cloudflare's bot "JavaScript detections" injection (Dani, in Cloudflare): keeps
      `script-src 'self'` strict and the live site matching CI.
- [ ] B. Allow the script in the CSP: weakens the CSP and breaks when Cloudflare changes it.
- [ ] C. Accept the CSP console error: the live site would differ from what CI tests.
- [x] D. Enforce HTTPS on the Pages site: no plain-HTTP access and no HTTP timeout.

### Q4. Licensing

- [x] A. MIT license for the repo: matches most vendored sources.
- [ ] B. Apache-2.0: heavier than needed for a starter.
- [ ] C. No license: a public repo nobody can legally reuse.
- [x] D. Stop vendoring the README-only-license skills (`web-design-guidelines`, AccessLint
      `accessibility-*`); keep lockfile entries with `installCommand` only: avoids redistributing
      files with no license text.
- [ ] E. Keep vendoring them: redistribution without a license file is legally unclear.

### Q5. Candidates to adopt

- [x] A. Vendor wshobson/agents `tailwind-design-system` (MIT, pinned commit): the strongest v4
      CSS-first skill; AGENTS.md overrides its class-based dark mode.
- [ ] B. poolcamacho `tailwindcss-best-practices`: 0 stars and framework-oriented install steps.
- [ ] C. blakee-marcus `tailwind-css`: assumes a package manager, PostCSS, and Vite.
- [x] D. Vendor coreyhaines31/marketingskills `schema` (MIT, pinned commit): closes the JSON-LD
      template gap.
- [ ] E. daisyUI as a local `@plugin`: a new class vocabulary and theme contrast risk.
- [ ] F. Basecoat: untested standalone path and unaudited a11y claims.
- [x] G. HyperUI, one snippet at a time at a pinned commit (last-commit exception confirmed): each
      copied snippet passes axe at every width and carries attribution; no wholesale import.
- [x] H. Hand-build everything else from the `@theme` tokens: no new vocabulary or dependency.
- [ ] Lombiq `tailwind-4-docs`: outside the 6-month window and runs code and fetches at use time.

### Q6. Harness load test

- [x] A. One-time load test in Claude Code, Cursor, Codex, and Grok Build, recorded in the README:
      proves each harness finds AGENTS.md and the skills.
- [ ] B. A paid fixed-task quality comparison: four full agent runs, not needed now.
- [ ] C. Skip: Phase 4 requires the load test.

### Q7. Dependabot version updates

- [ ] A. `github-actions` and `npm`: npm bumps go through the weekly routine instead.
- [x] B. `github-actions` only, weekly and grouped: low-risk bumps on the existing Dependabot.
- [ ] C. Pin actions to full commit SHAs: more churn than this starter needs.
- [ ] D. No config: action updates would go unnoticed.

### Q8. Phase 5 ownership

- [x] A. No new bot; Dr Eggbot owns the weekly Tailwind, plugin, and skill check: follows the
      default no-new-bot rule.
- [ ] B. Chief of Staff owns the routine: Dr Eggbot already logs this run.
- [ ] C. A new dedicated bot: not needed.

### Q9. Context7

- [ ] A. Create a free Context7 account: a new account for docs that are already public.
- [x] B. No Context7: use tailwindcss.com, GitHub releases, and the vendored Tailwind skill.
